# Landmark build core: game-frame mesh builder (y up, +z front), primitives, CDT walls, sweeps, lathes, materials, baking, export.
import os
import math
import json
import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
from mathutils.geometry import delaunay_2d_cdt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
TEX = os.path.join(HERE, 'tex')
ATLAS = json.load(open(os.path.join(TEX, 'signs.json'))) if os.path.exists(os.path.join(TEX, 'signs.json')) else {}


def to_bl(p):
    p = np.asarray(p, float)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], -1)


def bl_to_game(v):
    return [round(float(v[0]), 4), round(float(v[2]), 4), round(float(-v[1]), 4)]


def bl_quat_to_game(q):
    return [round(float(q.x), 5), round(float(q.z), 5), round(float(-q.y), 5), round(float(q.w), 5)]


MATS = {}


def mat(name, **kw):
    MATS[name] = kw
    return name


def tile_of(m):
    t = MATS.get(m, {}).get('tile', 1.0)
    return (t, t) if np.isscalar(t) else tuple(t)


class MB:
    def __init__(self):
        self.V = []
        self.F = []
        self.UV = []
        self.FM = []
        self.SM = []
        self.n = 0

    def _add_verts(self, pts):
        i0 = self.n
        self.V.append(np.asarray(pts, float).reshape(-1, 3))
        self.n += len(self.V[-1])
        return i0

    def face(self, idx, uvs, m, smooth=False):
        self.F.append(tuple(idx))
        self.UV.append(np.asarray(uvs, float).reshape(-1, 2))
        self.FM.append(m)
        self.SM.append(smooth)

    def extend(self, other, xf=None):
        off = self.n
        for v in other.V:
            vv = v if xf is None else xf(v)
            self.V.append(vv)
            self.n += len(vv)
        for f, uv, m, s in zip(other.F, other.UV, other.FM, other.SM):
            self.F.append(tuple(i + off for i in f))
            self.UV.append(uv)
            self.FM.append(m)
            self.SM.append(s)

    def verts(self):
        return np.concatenate(self.V) if self.V else np.zeros((0, 3))

    def poly(self, pts, m, uv=None, smooth=False, uvo=(0.0, 0.0)):
        pts = np.asarray(pts, float)
        i0 = self._add_verts(pts)
        if uv is None:
            uv = box_uv(pts, m, uvo)
        self.face(range(i0, i0 + len(pts)), uv, m, smooth)

    def tris(self, pts, tris, m, uv=None, smooth=False):
        pts = np.asarray(pts, float)
        i0 = self._add_verts(pts)
        if uv is None:
            n = newell(pts[np.asarray(tris)[0]]) if len(tris) else np.array([0, 0, 1.0])
            uv_all = box_uv(pts, m, normal=n)
        else:
            uv_all = np.asarray(uv, float)
        for t in tris:
            self.face([i0 + t[0], i0 + t[1], i0 + t[2]], uv_all[list(t)], m, smooth)

    def quad(self, a, b, c, d, m, uv=None, uvo=(0.0, 0.0)):
        self.poly([a, b, c, d], m, uv, uvo=uvo)

    def grid_quad(self, o, u, v, nu, nv, m, uvo=(0.0, 0.0)):
        o, u, v = (np.asarray(x, float) for x in (o, u, v))
        P = np.array([o + u * (i / nu) + v * (j / nv) for j in range(nv + 1) for i in range(nu + 1)])
        i0 = self._add_verts(P)
        n = np.cross(u, v)
        uv = box_uv(P, m, uvo, normal=n)
        for j in range(nv):
            for i in range(nu):
                a = i0 + j * (nu + 1) + i
                idx = [a, a + 1, a + nu + 2, a + nu + 1]
                self.face(idx, uv[[k - i0 for k in idx]], m)

    def box(self, x0, x1, y0, y1, z0, z1, m, skip=(), step=None, uvo=(0.0, 0.0)):
        if x0 > x1: x0, x1 = x1, x0
        if y0 > y1: y0, y1 = y1, y0
        if z0 > z1: z0, z1 = z1, z0
        faces = {
            '+x': ([x1, y0, z1], [0, 0, z0 - z1], [0, y1 - y0, 0]),
            '-x': ([x0, y0, z0], [0, 0, z1 - z0], [0, y1 - y0, 0]),
            '+y': ([x0, y1, z1], [x1 - x0, 0, 0], [0, 0, z0 - z1]),
            '-y': ([x0, y0, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0]),
            '+z': ([x0, y0, z1], [x1 - x0, 0, 0], [0, y1 - y0, 0]),
            '-z': ([x1, y0, z0], [x0 - x1, 0, 0], [0, y1 - y0, 0]),
        }
        for k, (o, u, v) in faces.items():
            if k in skip:
                continue
            mm = m[k] if isinstance(m, dict) else m
            if step:
                nu = max(1, int(math.ceil(np.linalg.norm(u) / step)))
                nv = max(1, int(math.ceil(np.linalg.norm(v) / step)))
            else:
                nu = nv = 1
            self.grid_quad(o, u, v, nu, nv, mm, uvo)

    def boxc(self, cx, cy, cz, sx, sy, sz, m, **kw):
        self.box(cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2, m, **kw)

    def obox(self, c, ax, ay, az, m, skip=()):
        c, ax, ay, az = (np.asarray(x, float) for x in (c, ax, ay, az))
        P = [c + sx * ax + sy * ay + sz * az for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
        F = {'-z': (0, 2, 3, 1), '+z': (4, 5, 7, 6), '-y': (0, 1, 5, 4), '+y': (2, 6, 7, 3), '-x': (0, 4, 6, 2), '+x': (1, 3, 7, 5)}
        for k, f in F.items():
            if k in skip:
                continue
            self.poly([P[i] for i in f], m)

    def lathe(self, prof, seg, c=(0, 0, 0), m=None, axis='y', cap=True, smooth=True, a0=0.0, a1=2 * math.pi, uvscale=1.0):
        c = np.asarray(c, float)
        prof = [(max(r, 0.0), h) for r, h in prof]
        full = abs(a1 - a0 - 2 * math.pi) < 1e-6
        na = seg if full else seg + 1
        angs = [a0 + (a1 - a0) * i / seg for i in range(na)]
        rows = []
        L = 0.0
        vs = [0.0]
        for i in range(1, len(prof)):
            L += math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1])
            vs.append(L)
        for (r, h) in prof:
            row = []
            for a in angs:
                if axis == 'y':
                    row.append(c + np.array([r * math.cos(a), h, -r * math.sin(a)]))
                elif axis == 'x':
                    row.append(c + np.array([h, r * math.cos(a), r * math.sin(a)]))
                else:
                    row.append(c + np.array([r * math.cos(a), r * math.sin(a), h]))
            rows.append(row)
        P = np.array([p for row in rows for p in row])
        i0 = self._add_verts(P)
        rad = max(max(r for r, _ in prof), 0.01)
        for j in range(len(prof) - 1):
            for i in range(seg):
                i2 = (i + 1) % na if full else i + 1
                a = i0 + j * na + i
                b = i0 + j * na + i2
                cc = i0 + (j + 1) * na + i2
                d = i0 + (j + 1) * na + i
                u0 = i / seg * 2 * math.pi * rad * uvscale
                u1 = (i + 1) / seg * 2 * math.pi * rad * uvscale
                uv = [(u0, vs[j] * uvscale), (u1, vs[j] * uvscale), (u1, vs[j + 1] * uvscale), (u0, vs[j + 1] * uvscale)]
                if prof[j][0] < 1e-6 and prof[j + 1][0] < 1e-6:
                    continue
                if (prof[j + 1][1] - prof[j][1]) >= 0 or True:
                    self.face([a, b, cc, d], uv, m, smooth)
        if cap and full:
            for j, s in ((0, -1), (len(prof) - 1, 1)):
                r, h = prof[j]
                if r < 1e-6:
                    continue
                ring = list(range(i0 + j * na, i0 + j * na + seg))
                ring_pts = P[[k - i0 for k in ring]]
                order = ring if j == len(prof) - 1 else ring[::-1]
                cen = ring_pts.mean(0)
                ci = self._add_verts([cen])
                ring_uv = [(0.5 + 0.5 * math.cos(angs[k]), 0.5 + 0.5 * math.sin(angs[k])) for k in range(seg)]
                for k in range(seg):
                    k2 = (k + 1) % seg
                    a, b = order[k], order[k2]
                    self.face([ci, a, b], [(0.5, 0.5), ring_uv[(a - ring[0]) % seg], ring_uv[(b - ring[0]) % seg]], m, False)

    def cyl(self, c, r, h, seg, m, axis='y', cap=True, smooth=True):
        self.lathe([(r, 0), (r, h)], seg, c, m, axis, cap, smooth)

    def sweep(self, path, prof, m, closed=False, smooth=False, caps=True, up=(0, 1, 0)):
        """path: list of 3D points; prof: list of (s, t) with s along the left-normal (out), t along up."""
        path = [np.asarray(p, float) for p in path]
        up = np.asarray(up, float)
        n = len(path)
        frames = []
        for i in range(n):
            if closed:
                a, b = path[i - 1], path[(i + 1) % n]
                t1 = path[i] - path[i - 1]
                t2 = path[(i + 1) % n] - path[i]
            else:
                t1 = path[i] - path[i - 1] if i > 0 else path[1] - path[0]
                t2 = path[i + 1] - path[i] if i < n - 1 else path[-1] - path[-2]
            t1 = t1 / (np.linalg.norm(t1) + 1e-12)
            t2 = t2 / (np.linalg.norm(t2) + 1e-12)
            o1 = np.cross(t1, up)
            o1 /= np.linalg.norm(o1) + 1e-12
            o2 = np.cross(t2, up)
            o2 /= np.linalg.norm(o2) + 1e-12
            om = o1 + o2
            om /= np.linalg.norm(om) + 1e-12
            scale = 1.0 / max(0.3, float(om @ o1))
            frames.append((om * scale, up))
        rows = [[path[i] + fo * s + fu * t for (s, t) in prof] for i, (fo, fu) in enumerate(frames)]
        np_ = len(prof)
        P = np.array([p for r in rows for p in r])
        i0 = self._add_verts(P)
        dist = [0.0]
        for i in range(1, n):
            dist.append(dist[-1] + float(np.linalg.norm(path[i] - path[i - 1])))
        pl = [0.0]
        for k in range(1, np_):
            pl.append(pl[-1] + math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]))
        su, sv = tile_of(m)
        segs = n if closed else n - 1
        for i in range(segs):
            i2 = (i + 1) % n
            d0 = dist[i]
            d1 = dist[i2] if i2 > i else dist[-1] + float(np.linalg.norm(path[0] - path[-1]))
            for k in range(np_ - 1):
                a = i0 + i * np_ + k
                b = i0 + i2 * np_ + k
                c = i0 + i2 * np_ + k + 1
                d = i0 + i * np_ + k + 1
                uv = [(d0 / su, pl[k] / sv), (d1 / su, pl[k] / sv), (d1 / su, pl[k + 1] / sv), (d0 / su, pl[k + 1] / sv)]
                self.face([a, b, c, d], uv, m, smooth)
        if caps and not closed:
            for i, rev in ((0, False), (n - 1, True)):
                ring = P[i * np_:(i + 1) * np_]
                if len(ring) < 3:
                    continue
                prof2 = np.asarray(prof, float)
                tri = cdt_simple(prof2)
                for t in tri:
                    tt = [i0 + i * np_ + t[0], i0 + i * np_ + t[1], i0 + i * np_ + t[2]]
                    if rev:
                        tt = tt[::-1]
                    self.face(tt, box_uv(P[[x - i0 for x in tt]], m), m, False)

    def extrude(self, outline, depth, o, u, v, m, m_side=None, back=True, front=True, holes=(), step=None):
        """outline in 2D (u, v) coords on plane o + u*a + v*b; extruded along -n by depth (n = u x v)."""
        o, u, v = (np.asarray(x, float) for x in (o, u, v))
        n = np.cross(u, v)
        n /= np.linalg.norm(n)
        if front:
            self.plane2d(outline, o, u, v, m, holes=holes, step=step)
        if back:
            self.plane2d([p for p in outline][::-1], o - n * depth, u, v, m, holes=[h[::-1] for h in holes], flip=True, step=step)
        ms = m_side or m
        for ring in [outline] + [h for h in holes]:
            self.ring_side(ring, o, u, v, n, depth, ms, hole=ring is not outline)

    def ring_side(self, ring, o, u, v, n, depth, m, hole=False):
        o, u, v, n = (np.asarray(x, float) for x in (o, u, v, n))
        ring = np.asarray(ring, float)
        if poly_area(ring) < 0:
            ring = ring[::-1]
        if hole:
            ring = ring[::-1]
        k = len(ring)
        for i in range(k):
            a2, b2 = ring[i], ring[(i + 1) % k]
            A = o + u * a2[0] + v * a2[1]
            B = o + u * b2[0] + v * b2[1]
            self.quad(A, A - n * depth, B - n * depth, B, m)

    def plane2d(self, outline, o, u, v, m, holes=(), flip=False, step=None, uv=None):
        o, u, v = (np.asarray(x, float) for x in (o, u, v))
        outline = np.asarray(outline, float)
        if poly_area(outline) < 0:
            outline = outline[::-1]
        hs = []
        for h in holes:
            h = np.asarray(h, float)
            if poly_area(h) > 0:
                h = h[::-1]
            hs.append(h)
        steiner = []
        if step:
            lo, hi = outline.min(0), outline.max(0)
            xs = np.arange(lo[0] + step * 0.5, hi[0], step)
            ys = np.arange(lo[1] + step * 0.5, hi[1], step)
            G = np.array([(x, y) for y in ys for x in xs]) if len(xs) and len(ys) else np.zeros((0, 2))
            if len(G):
                keep = points_in_poly(G, outline)
                for h in hs:
                    keep &= ~points_in_poly(G, h)
                    keep &= dist_to_chain(G, h, True) > step * 0.3
                keep &= dist_to_chain(G, outline, True) > step * 0.3
                steiner = G[keep]
        verts, tri = cdt(outline, hs, steiner=steiner)
        P = o + verts[:, :1] * u + verts[:, 1:2] * v
        if flip:
            tri = tri[:, ::-1]
        if uv is None:
            nrm = np.cross(u, v) * (-1 if flip else 1)
            uvs = box_uv(P, m, normal=nrm)
        else:
            uvs = uv(verts)
        i0 = self._add_verts(P)
        for t in tri:
            self.face([i0 + t[0], i0 + t[1], i0 + t[2]], uvs[list(t)], m)


def newell(pts):
    pts = np.asarray(pts, float)
    n = np.zeros(3)
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n += np.array([(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
    l = np.linalg.norm(n)
    return n / l if l > 1e-12 else np.array([0, 1.0, 0])


def box_uv(pts, m, uvo=(0.0, 0.0), normal=None):
    pts = np.asarray(pts, float)
    n = newell(pts) if normal is None else np.asarray(normal, float) / (np.linalg.norm(normal) + 1e-12)
    su, sv = tile_of(m)
    ax = np.argmax(np.abs(n))
    if ax == 0:
        u = -pts[:, 2] * np.sign(n[0])
        v = pts[:, 1]
    elif ax == 2:
        u = pts[:, 0] * np.sign(n[2])
        v = pts[:, 1]
    else:
        u = pts[:, 0]
        v = -pts[:, 2] * np.sign(n[1])
    return np.stack([u / su + uvo[0], v / sv + uvo[1]], -1)


def poly_area(p):
    p = np.asarray(p, float)
    return 0.5 * np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])


def points_in_poly(pts, poly):
    pts = np.asarray(pts, float)
    poly = np.asarray(poly, float)
    x, y = pts[:, 0], pts[:, 1]
    inside = np.zeros(len(pts), bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        cond = (yi > y) != (yj > y)
        xint = (xj - xi) * (y - yi) / ((yj - yi) if yj != yi else 1e-30) + xi
        inside ^= cond & (x < xint)
        j = i
    return inside


def dist_to_chain(pts, chain, closed):
    pts = np.asarray(pts, float)
    c = np.asarray(chain, float)
    segs = list(zip(c[:-1], c[1:]))
    if closed:
        segs.append((c[-1], c[0]))
    d = np.full(len(pts), 1e9)
    for a, b in segs:
        ab = b - a
        L2 = float(ab @ ab) + 1e-18
        t = np.clip(((pts - a) @ ab) / L2, 0, 1)
        d = np.minimum(d, np.linalg.norm(pts - (a + t[:, None] * ab), axis=1))
    return d


def cdt(outer, holes=(), steiner=(), eps=1e-6):
    pts, edges = [], []

    def add_chain(chain):
        base = len(pts)
        for q in chain:
            pts.append(Vector((float(q[0]), float(q[1]))))
        k = len(chain)
        for i in range(k):
            edges.append((base + i, base + (i + 1) % k))
    add_chain(outer)
    for h in holes:
        add_chain(h)
    for q in steiner:
        pts.append(Vector((float(q[0]), float(q[1]))))
    res = delaunay_2d_cdt(pts, edges, [], 0, eps)
    verts = np.array([(v[0], v[1]) for v in res[0]], float)
    tri = np.array([f for f in res[2] if len(f) == 3], int).reshape(-1, 3)
    if not len(tri):
        return verts, tri
    cen = verts[tri].mean(axis=1)
    keep = points_in_poly(cen, outer)
    for h in holes:
        keep &= ~points_in_poly(cen, h)
    tri = tri[keep]
    a = (verts[tri[:, 1], 0] - verts[tri[:, 0], 0]) * (verts[tri[:, 2], 1] - verts[tri[:, 0], 1]) - \
        (verts[tri[:, 2], 0] - verts[tri[:, 0], 0]) * (verts[tri[:, 1], 1] - verts[tri[:, 0], 1])
    tri[a < 0] = tri[a < 0][:, ::-1]
    tri = tri[np.abs(a) > 1e-12]
    return verts, tri


def cdt_simple(poly):
    v, t = cdt(poly)
    m = {tuple(np.round(p, 7)): i for i, p in enumerate(np.asarray(poly, float))}
    out = []
    for tt in t:
        ids = [m.get(tuple(np.round(v[k], 7))) for k in tt]
        if None not in ids:
            out.append(ids)
    return out


def arch_outline(x0, x1, y0, ys, seg=16, kind='round', rise=None):
    """rectangle x0..x1 from y0 up to springing ys, then a round (semicircular) or segmental arch."""
    w = x1 - x0
    cx = (x0 + x1) / 2
    pts = [(x0, y0), (x1, y0), (x1, ys)]
    if kind == 'round':
        r = w / 2
        for i in range(1, seg):
            a = math.pi * i / seg
            pts.append((cx + r * math.cos(a), ys + r * math.sin(a)))
    else:
        rise = rise or w * 0.15
        R = (rise * rise + (w / 2) ** 2) / (2 * rise)
        cy = ys + rise - R
        a0 = math.atan2(ys - cy, x1 - cx)
        a1 = math.pi - a0
        for i in range(1, seg):
            a = a0 + (a1 - a0) * i / seg
            pts.append((cx + R * math.cos(a), cy + R * math.sin(a)))
    pts.append((x0, ys))
    return pts


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def circle2d(cx, cy, r, seg=24):
    return [(cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]


# ---------------- Blender objects and materials ----------------

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS_BL.clear()
    IMGS.clear()
    LMAT.clear()
    TEXMEAN.clear()


MATS_BL = {}
IMGS = {}


def image(name):
    if name in IMGS:
        return IMGS[name]
    for ext in ('.jpg', '.png'):
        p = os.path.join(TEX, name + ext)
        if os.path.exists(p):
            im = bpy.data.images.load(p)
            IMGS[name] = im
            return im
    IMGS[name] = None
    return None


def build_material(name):
    if name in MATS_BL:
        return MATS_BL[name]
    s = MATS.get(name, {})
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    col = s.get('color', (0.8, 0.8, 0.8))
    tex = s.get('tex')
    uvn = None
    if tex or s.get('atlas'):
        uvn = nt.nodes.new('ShaderNodeUVMap')
        uvn.uv_map = 'UVMap'
    if s.get('atlas'):
        im = image('signs')
        it = nt.nodes.new('ShaderNodeTexImage')
        it.image = im
        it.interpolation = 'Linear'
        nt.links.new(uvn.outputs['UV'], it.inputs['Vector'])
        nt.links.new(it.outputs['Color'], bsdf.inputs['Base Color'])
        if s.get('alpha'):
            if s['alpha'] == 'MASK':
                rnd = nt.nodes.new('ShaderNodeMath')
                rnd.operation = 'ROUND'
                nt.links.new(it.outputs['Alpha'], rnd.inputs[0])
                nt.links.new(rnd.outputs[0], bsdf.inputs['Alpha'])
            else:
                nt.links.new(it.outputs['Alpha'], bsdf.inputs['Alpha'])
        if s.get('emit_tex'):
            nt.links.new(it.outputs['Color'], bsdf.inputs['Emission Color'])
            bsdf.inputs['Emission Strength'].default_value = s.get('emit_strength', 1.0)
    elif tex:
        im = image(tex + '_diff')
        it = nt.nodes.new('ShaderNodeTexImage')
        it.image = im
        nt.links.new(uvn.outputs['UV'], it.inputs['Vector'])
        if s.get('tint'):
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            nt.links.new(it.outputs['Color'], mix.inputs[6])
            t = s['tint']
            mix.inputs[7].default_value = (t[0], t[1], t[2], 1.0)
            nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
        else:
            nt.links.new(it.outputs['Color'], bsdf.inputs['Base Color'])
        armi = image(tex + '_arm') if s.get('use_arm', True) else None
        if armi is not None:
            armi.colorspace_settings.name = 'Non-Color'
            at = nt.nodes.new('ShaderNodeTexImage')
            at.image = armi
            nt.links.new(uvn.outputs['UV'], at.inputs['Vector'])
            sep = nt.nodes.new('ShaderNodeSeparateColor')
            nt.links.new(at.outputs['Color'], sep.inputs['Color'])
            nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
            nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
        else:
            bsdf.inputs['Roughness'].default_value = s.get('rough', 0.6)
            bsdf.inputs['Metallic'].default_value = s.get('metal', 0.0)
        nori = image(tex + '_nor') if s.get('use_nor', True) else None
        if nori is not None:
            nori.colorspace_settings.name = 'Non-Color'
            nt_ = nt.nodes.new('ShaderNodeTexImage')
            nt_.image = nori
            nt.links.new(uvn.outputs['UV'], nt_.inputs['Vector'])
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nm.inputs['Strength'].default_value = s.get('nor_strength', 1.0)
            nt.links.new(nt_.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    else:
        bsdf.inputs['Base Color'].default_value = (col[0], col[1], col[2], 1.0)
        bsdf.inputs['Roughness'].default_value = s.get('rough', 0.6)
        bsdf.inputs['Metallic'].default_value = s.get('metal', 0.0)
    if s.get('emit') is not None:
        e = s['emit']
        bsdf.inputs['Emission Color'].default_value = (e[0], e[1], e[2], 1.0)
        bsdf.inputs['Emission Strength'].default_value = s.get('emit_strength', 1.0)
    if s.get('alpha') == 'BLEND' and not s.get('atlas'):
        bsdf.inputs['Alpha'].default_value = s.get('opacity', 0.5)
    if s.get('double'):
        m.use_backface_culling = False
    else:
        m.use_backface_culling = True
    m['baked'] = bool(s.get('baked', False))
    MATS_BL[name] = m
    return m


def new_empty(name, pos, yaw=0.0, parent=None, size=0.25, pitch=0.0):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = size
    bpy.context.scene.collection.objects.link(e)
    if parent:
        e.parent = parent
    e.location = tuple(to_bl(pos))
    e.rotation_mode = 'XYZ'
    e.rotation_euler = (pitch, 0.0, yaw)
    return e


def group(name, parent=None):
    return new_empty(name, (0, 0, 0), 0.0, parent, 0.5)


PAL = ['red', 'green', 'amber', 'white', 'blue', 'warm', 'cool', 'lamp', 'window', 'grey']
LMAT = []


def cell_uv(color):
    a = ATLAS['palette']
    u = (PAL.index(color) + 0.5) / len(PAL)
    return (a[0] + (a[2] - a[0]) * u, a[1] + (a[3] - a[1]) * 0.5)


def lmat_id(m):
    if m not in LMAT:
        LMAT.append(m)
    return LMAT.index(m)


def resolve(m, baked):
    s = MATS.get(m, {})
    if baked:
        p, t = s.get('bphys', s.get('phys', m)), s.get('bvt', s.get('vt'))
    else:
        p, t = s.get('xphys', s.get('phys', m)), s.get('xvt', s.get('vt'))
    return p, (tuple(float(x) for x in t) if t is not None else (1.0, 1.0, 1.0))


def make_object(name, mb, parent=None, origin=(0, 0, 0), baked=False):
    if not mb.F:
        return None
    V = mb.verts() - np.asarray(origin, float)
    Vb = to_bl(V)
    res = {m: resolve(m, baked) for m in set(mb.FM)}
    used = []
    idx = {}
    for m in mb.FM:
        p = res[m][0]
        if p not in idx:
            idx[p] = len(used)
            used.append(p)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in Vb], [], [list(f) for f in mb.F])
    for p in used:
        me.materials.append(build_material(p))
    me.polygons.foreach_set('material_index', [idx[res[m][0]] for m in mb.FM])
    me.polygons.foreach_set('use_smooth', [bool(s) for s in mb.SM])
    uvl = me.uv_layers.new(name='UVMap')
    uv_flat = np.concatenate(mb.UV).astype(np.float32)
    off = 0
    for f, m in zip(mb.F, mb.FM):
        c = MATS.get(m, {}).get('uvcell')
        if c:
            uv_flat[off:off + len(f)] = cell_uv(c)
        off += len(f)
    if len(uv_flat) == len(uvl.data):
        uvl.data.foreach_set('uv', uv_flat.ravel())
    la = me.attributes.new('lmat', 'INT', 'FACE')
    la.data.foreach_set('value', [lmat_id(m) for m in mb.FM])
    me.validate(clean_customdata=False)
    me.update()
    lm = np.empty(len(me.polygons), np.int32)
    me.attributes['lmat'].data.foreach_get('value', lm)
    T = np.ones((len(me.vertices), 3), np.float32)
    for poly, k in zip(me.polygons, lm):
        T[list(poly.vertices)] = res[LMAT[k]][1]
    if baked:
        ta = me.attributes.new('_TINT', 'FLOAT_VECTOR', 'POINT')
        ta.data.foreach_set('vector', T.ravel())
    elif not np.allclose(T, 1.0):
        ca = me.color_attributes.new(name='Tint', type='FLOAT_COLOR', domain='POINT')
        cols = np.ones((len(T), 4), np.float32)
        cols[:, :3] = T
        ca.data.foreach_set('color', cols.ravel())
        me.color_attributes.active_color = ca
        try:
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
        except Exception:
            pass
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if parent:
        ob.parent = parent
    ob.location = tuple(to_bl(origin))
    ob['baked'] = bool(baked)
    return ob


def hull_object(name, pts, parent=None):
    bm = bmesh.new()
    for p in to_bl(np.asarray(pts, float)):
        bm.verts.new(tuple(p))
    bmesh.ops.convex_hull(bm, input=bm.verts, use_existing_faces=False)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bmesh.ops.triangulate(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob['collider'] = True
    ob.display_type = 'WIRE'
    ob.hide_render = True
    return ob


def box_pts(x0, x1, y0, y1, z0, z1):
    return [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]


# ---------------- baking (vertex irradiance, three.js units) ----------------

TEXMEAN = {}


def tex_mean(tex):
    if tex not in TEXMEAN:
        im = image(tex + '_diff')
        if im is None:
            TEXMEAN[tex] = np.array([0.5, 0.5, 0.5])
        else:
            px = np.array(im.pixels[:], np.float32).reshape(-1, 4)[::61, :3]
            if im.colorspace_settings.name.lower().startswith('srgb'):
                px = np.where(px <= 0.04045, px / 12.92, ((px + 0.055) / 1.055) ** 2.4)
            TEXMEAN[tex] = px.mean(0)
    return TEXMEAN[tex]


def logical_albedo(m):
    s = MATS.get(m, {})
    if 'albedo' in s:
        return np.clip(np.asarray(s['albedo'], float), 0.02, 0.95)
    p, t = resolve(m, True)
    ps = MATS.get(p, {})
    if 'albedo' in ps:
        base = np.asarray(ps['albedo'], float)
    elif ps.get('tex'):
        base = tex_mean(ps['tex'])
    else:
        base = np.asarray(ps.get('color', (0.6, 0.6, 0.6)), float)
    return np.clip(base * np.asarray(t, float), 0.02, 0.95)


def build_bvh(objs):
    V, P = [], []
    off = 0
    for ob in objs:
        me = ob.data
        mw = ob.matrix_world
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        M = np.array(mw)
        co = co @ M[:3, :3].T + M[:3, 3]
        V.append(co)
        for p in me.polygons:
            P.append([off + i for i in p.vertices])
        off += len(co)
    Vall = np.concatenate(V) if V else np.zeros((0, 3))
    return BVHTree.FromPolygons([tuple(v) for v in Vall], P, all_triangles=False, epsilon=0.0)


def cos_dirs(k, seed=7):
    r = np.random.default_rng(seed)
    out = []
    for i in range(k):
        u1 = (i + r.random()) / k
        u2 = r.random()
        rr = math.sqrt(u1)
        th = 2 * math.pi * u2
        out.append((rr * math.cos(th), rr * math.sin(th), math.sqrt(max(0.0, 1 - u1))))
    return np.array(out)


def visible(bvh, p, q, size):
    d = q - p
    dist = float(np.linalg.norm(d))
    if dist < 1e-4:
        return True
    return bvh.ray_cast(Vector(p), Vector(d / dist), max(0.0, dist - size - 0.02))[0] is None


def bake(objs, occluders, lights, ambient=0.02, sky=None, bounce_rays=12, bounce_gain=1.0, scale=8.0, log=print):
    """objs: Blender mesh objects to bake. lights: dicts {pos (game), I (candela rgb), range, spot:(dir game, cos_outer, cos_inner) opt, size}.
    Writes FLOAT_COLOR corner attribute 'Bake' = B / scale where B multiplies albedo (three.js irradiance / PI)."""
    import time
    t0 = time.time()
    bvh = build_bvh(occluders)
    L = []
    for l in lights:
        p = to_bl(l['pos'])
        sp = None
        if l.get('spot'):
            d = to_bl(l['spot'][0])
            d = d / np.linalg.norm(d)
            sp = (d, l['spot'][1], l['spot'][2])
        pts = [p]
        if l.get('tube'):
            a = to_bl(l['tube'][0])
            b = to_bl(l['tube'][1])
            pts = [a + (b - a) * (i + 0.5) / 4 for i in range(4)]
        L.append((pts, np.asarray(l['I'], float) / len(pts), l.get('range', 12.0), sp, l.get('size', 0.05), l.get('only'), l.get('wrap', 0.0), l.get('soft', 0.4)))
    samples = []
    owners = []
    for ob in objs:
        me = ob.data
        M = np.array(ob.matrix_world)
        R = M[:3, :3]
        nl = len(me.loops)
        lv = np.empty(nl, np.int32)
        me.loops.foreach_get('vertex_index', lv)
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3) @ R.T + M[:3, 3]
        ln = np.empty(nl * 3, np.float32)
        me.corner_normals.foreach_get('vector', ln)
        ln = ln.reshape(-1, 3)
        ln = ln @ R.T
        ln /= np.maximum(np.linalg.norm(ln, axis=1, keepdims=True), 1e-9)
        lm = np.empty(len(me.polygons), np.int32)
        me.attributes['lmat'].data.foreach_get('value', lm)
        loop_poly = np.empty(nl, np.int32)
        for p in me.polygons:
            loop_poly[p.loop_start:p.loop_start + p.loop_total] = p.index
        alb_l = {int(k): logical_albedo(LMAT[k]) for k in np.unique(lm)}
        lal = np.array([alb_l[int(k)] for k in lm])[loop_poly]
        samples.append((co[lv], ln, lal))
        owners.append(ob)
    P = np.concatenate([s[0] for s in samples])
    N = np.concatenate([s[1] for s in samples])
    A = np.concatenate([s[2] for s in samples])
    key = np.round(np.concatenate([P * 50, N * 8], 1)).astype(np.int64)
    _, uidx, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    UP = P[uidx]
    UN = N[uidx]
    UA = A[uidx]
    nU = len(UP)
    log(f'[bake] {len(P)} corners -> {nU} samples, {len(L)} lights')
    D = np.zeros((nU, 3))
    PO = UP + UN * 0.015
    for (lp, I, rng, sp, size, only, wrap, soft) in L:
        offs = [np.zeros(3)] + [np.array(v, float) * soft for v in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]
        for q in lp:
            d = q[None, :] - UP
            dist = np.sqrt((d * d).sum(1))
            dn = d / np.maximum(dist, 1e-6)[:, None]
            ndl = (dn * UN).sum(1)
            if wrap:
                ndl = (ndl + wrap) / (1 + wrap)
            f = np.ones(nU)
            ok = (dist < rng) & (dist > 1e-4) & (ndl > 0)
            if sp is not None:
                cd = -(dn @ sp[0])
                ok &= cd >= sp[1]
                f = np.clip((cd - sp[1]) / max(1e-4, sp[2] - sp[1]), 0, 1)
            if only is not None:
                lo, hi = to_bl(only[0]), to_bl(only[1])
                bmin, bmax = np.minimum(lo, hi), np.maximum(lo, hi)
                ok &= np.all((UP >= bmin) & (UP <= bmax), axis=1)
            win = np.clip(1 - (dist / rng) ** 4, 0, 1) ** 2
            contrib = ndl * f * win / np.maximum(dist * dist, 0.04)
            for i in np.nonzero(ok)[0]:
                vis = [visible(bvh, PO[i], q + o, size) for o in offs[:3]]
                if 0 < sum(vis) < 3:
                    vis += [visible(bvh, PO[i], q + o, size) for o in offs[3:]]
                D[i] += I * contrib[i] * (sum(vis) / len(vis))
    D /= math.pi
    t1 = time.time()
    log(f'[bake] direct {t1 - t0:.1f}s')
    kd = KDTree(nU)
    for i in range(nU):
        kd.insert(Vector(UP[i]), i)
    kd.balance()
    dirs = cos_dirs(bounce_rays)
    Ind = np.zeros((nU, 3))
    AO = np.zeros(nU)
    BK = np.zeros(nU)
    Rad = D * UA
    for i in range(nU):
        n = UN[i]
        t = np.cross(n, (1, 0, 0) if abs(n[0]) < 0.9 else (0, 1, 0))
        t /= np.linalg.norm(t)
        b = np.cross(n, t)
        po = Vector(UP[i] + n * 0.02)
        acc = np.zeros(3)
        open_ = 0
        back = 0
        for dl in dirs:
            w = t * dl[0] + b * dl[1] + n * dl[2]
            hit = bvh.ray_cast(po, Vector(w), 14.0)
            if hit[0] is not None and hit[3] < 1.5 and hit[1].dot(Vector(w)) > 0:
                back += 1
            if hit[0] is None:
                open_ += 1
                if sky is not None:
                    acc += np.asarray(sky, float) * max(0.0, float(w[2]))
                continue
            co, idx, dist = kd.find(hit[0])
            if dist < 0.9:
                acc += Rad[idx]
        Ind[i] = acc / len(dirs) * bounce_gain
        AO[i] = open_ / len(dirs)
        BK[i] = back / len(dirs)
    log(f'[bake] bounce {time.time() - t1:.1f}s')
    B = D + Ind + ambient * (0.35 + 0.65 * (1 - AO))[:, None] * 1.0
    bur = BK > 0.5
    B0 = B.copy()
    for i in np.nonzero(bur)[0]:
        acc = np.zeros(3)
        wsum = 0.0
        for _, j, d in kd.find_range(Vector(UP[i]), 0.7):
            if not bur[j] and UN[j] @ UN[i] > 0.9:
                k = 1.0 / (0.05 + d)
                acc += B0[j] * k
                wsum += k
        if wsum:
            B[i] = acc / wsum * 0.5
    log(f'[bake] buried samples filled {int(bur.sum())}')
    Bc = B[inv] / scale
    o = 0
    for ob, s in zip(owners, samples):
        k = len(s[0])
        me = ob.data
        if 'Bake' in me.color_attributes:
            me.color_attributes.remove(me.color_attributes['Bake'])
        ca = me.color_attributes.new(name='Bake', type='FLOAT_COLOR', domain='CORNER')
        cols = np.ones((k, 4), np.float32)
        cols[:, :3] = np.clip(Bc[o:o + k], 0, 1)
        ca.data.foreach_set('color', cols.ravel())
        me.color_attributes.active_color = ca
        try:
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
        except Exception:
            pass
        o += k
    log(f'[bake] done {time.time() - t0:.1f}s, B mean {float(B.mean()):.3f} max {float(B.max()):.2f}')
    return B


def export_glb(path, selection=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    kw = dict(filepath=path, export_format='GLB', export_yup=True, export_extras=True, export_attributes=True,
              export_cameras=False, export_lights=False, export_animations=False, export_materials='EXPORT',
              export_image_format='AUTO', export_jpeg_quality=86, export_texcoords=True, export_normals=True,
              export_tangents=False, export_apply=False, export_vertex_color='ACTIVE', export_all_vertex_colors=False)
    if selection is not None:
        bpy.ops.object.select_all(action='DESELECT')
        for o in selection:
            o.select_set(True)
        kw['use_selection'] = True
    bpy.ops.export_scene.gltf(**kw)


def tri_count(objs):
    t = 0
    for ob in objs:
        if ob.type == 'MESH' and not ob.name.startswith('Collider'):
            for p in ob.data.polygons:
                t += len(p.vertices) - 2
    return t


def world_pose(ob):
    loc, rot, _ = ob.matrix_world.decompose()
    return {'position': bl_to_game(loc), 'quaternion_xyzw': bl_quat_to_game(rot)}


def clip_poly_rect(poly, x0, y0, x1, y1):
    pts = [tuple(p) for p in poly]
    for axis, val, keep_ge in ((0, x0, True), (0, x1, False), (1, y0, True), (1, y1, False)):
        if not pts:
            break
        out = []
        for i in range(len(pts)):
            a, b = pts[i - 1], pts[i]
            ina = a[axis] >= val if keep_ge else a[axis] <= val
            inb = b[axis] >= val if keep_ge else b[axis] <= val
            if inb:
                if not ina:
                    t = (val - a[axis]) / (b[axis] - a[axis])
                    out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
                out.append(b)
            elif ina:
                t = (val - a[axis]) / (b[axis] - a[axis])
                out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        pts = out
    return pts


def band_wall(mb, o, u, v, x0, x1, bands, holes=(), step=None):
    for (y0, y1, m) in bands:
        hs = []
        for h in holes:
            c = clip_poly_rect(h, x0 - 0.002, y0 - 0.002, x1 + 0.002, y1 + 0.002)
            if len(c) >= 3 and abs(poly_area(c)) > 1e-4:
                hs.append(c)
        mb.plane2d(rect(x0, y0, x1, y1), o, u, v, m, holes=hs, step=step)
