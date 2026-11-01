# Ecto-1 build helpers: curves, patch meshing (constrained Delaunay), primitive builders, objects.
import math
import numpy as np
import bpy
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

Y_OFF = 2.801


def pchip(xs, ys):
    xs = np.asarray(xs, float)
    ys = np.asarray(ys, float)
    h = np.diff(xs)
    d = np.diff(ys) / h
    n = len(xs)
    m = np.zeros(n)
    for k in range(1, n - 1):
        if d[k - 1] * d[k] > 0:
            w1 = 2 * h[k] + h[k - 1]
            w2 = h[k] + 2 * h[k - 1]
            m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k])
    m[0] = d[0]
    m[-1] = d[-1]

    def f(x):
        x = np.asarray(x, float)
        xc = np.clip(x, xs[0], xs[-1])
        i = np.clip(np.searchsorted(xs, xc) - 1, 0, n - 2)
        t = (xc - xs[i]) / h[i]
        h00 = (1 + 2 * t) * (1 - t) ** 2
        h10 = t * (1 - t) ** 2
        h01 = t * t * (3 - 2 * t)
        h11 = t * t * (t - 1)
        return h00 * ys[i] + h10 * h[i] * m[i] + h01 * ys[i + 1] + h11 * h[i] * m[i + 1]
    return f


def smoothstep(e0, e1, x):
    t = np.clip((np.asarray(x, float) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def bl(x, s, z):
    """car coords (x lateral +driver, s from front tip, z up) -> Blender (X, Y, Z), front = -Y"""
    return np.stack(np.broadcast_arrays(np.asarray(x, float), np.asarray(s, float) - Y_OFF, np.asarray(z, float)), axis=-1)


def poly_area(poly):
    p = np.asarray(poly, float)
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


def rounded_rect(u0, v0, u1, v1, r, seg=6, corners=(True, True, True, True)):
    """CCW polygon: corners order = (u1,v0), (u1,v1), (u0,v1), (u0,v0)."""
    if np.isscalar(r):
        r = (r, r, r, r)
    cs = [(u1, v0, -90), (u1, v1, 0), (u0, v1, 90), (u0, v0, 180)]
    sg = [(-1, 1), (-1, -1), (1, -1), (1, 1)]
    pts = []
    for k, (cu, cv, a0) in enumerate(cs):
        rk = r[k]
        if corners[k] and rk > 0:
            ccu = cu + sg[k][0] * rk
            ccv = cv + sg[k][1] * rk
            for i in range(seg + 1):
                a = math.radians(a0 + 90 * i / seg)
                pts.append((ccu + rk * math.cos(a), ccv + rk * math.sin(a)))
        else:
            pts.append((cu, cv))
    return pts


def resample(chain, step, closed=True):
    p = [np.asarray(q, float) for q in chain]
    if closed:
        p = p + [p[0]]
    out = []
    for a, b in zip(p[:-1], p[1:]):
        L = float(np.linalg.norm(b - a))
        n = max(1, int(math.ceil(L / step)))
        for i in range(n):
            out.append(tuple(a + (b - a) * i / n))
    if not closed:
        out.append(tuple(p[-1]))
    return out


def offset_poly(poly, d):
    """Offset a closed polygon outward by d (negative = inward)."""
    p = np.asarray(poly, float)
    if poly_area(p) < 0:
        p = p[::-1]
    n = len(p)
    out = []
    for i in range(n):
        a, b, c = p[i - 1], p[i], p[(i + 1) % n]
        e1 = b - a
        e2 = c - b
        n1 = np.array([e1[1], -e1[0]]) / (np.linalg.norm(e1) + 1e-12)
        n2 = np.array([e2[1], -e2[0]]) / (np.linalg.norm(e2) + 1e-12)
        nm = n1 + n2
        ln = np.linalg.norm(nm)
        nm = n1 if ln < 1e-9 else nm / ln
        cosh = max(0.35, float(nm @ n1))
        out.append(tuple(b + nm * d / cosh))
    return out


class Patch:
    """Parametric surface f(u, v) -> (N,3) Blender coords, vectorised. Normal = dP/du x dP/dv (flip to invert)."""

    def __init__(self, f, flip=False, eps=2e-4):
        self.f = f
        self.flip = flip
        self.eps = eps

    def pos(self, uv):
        uv = np.asarray(uv, float).reshape(-1, 2)
        return self.f(uv[:, 0], uv[:, 1])

    def nrm(self, uv):
        uv = np.asarray(uv, float).reshape(-1, 2)
        u, v = uv[:, 0], uv[:, 1]
        e = self.eps
        pu = self.f(u + e, v) - self.f(u - e, v)
        pv = self.f(u, v + e) - self.f(u, v - e)
        n = np.cross(pu, pv)
        if self.flip:
            n = -n
        return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-15)


def cdt(outer, holes=(), lines=(), steiner=(), eps=1e-7):
    """Constrained Delaunay of a 2D domain; returns (verts2d, tris) inside outer minus holes."""
    pts = []
    edges = []

    def add_chain(chain, closed):
        base = len(pts)
        for q in chain:
            pts.append(Vector((float(q[0]), float(q[1]))))
        n = len(chain)
        for i in range(n - 1):
            edges.append((base + i, base + i + 1))
        if closed:
            edges.append((base + n - 1, base))
    add_chain(outer, True)
    for h in holes:
        add_chain(h, True)
    for ln in lines:
        add_chain(ln, False)
    for q in steiner:
        pts.append(Vector((float(q[0]), float(q[1]))))
    res = delaunay_2d_cdt(pts, edges, [], 0, eps)
    verts = np.array([(v[0], v[1]) for v in res[0]], float)
    tri = np.array([f for f in res[2] if len(f) == 3], int)
    cen = verts[tri].mean(axis=1)
    keep = points_in_poly(cen, outer)
    for h in holes:
        keep &= ~points_in_poly(cen, h)
    tri = tri[keep]
    a = (verts[tri[:, 1], 0] - verts[tri[:, 0], 0]) * (verts[tri[:, 2], 1] - verts[tri[:, 0], 1]) - \
        (verts[tri[:, 2], 0] - verts[tri[:, 0], 0]) * (verts[tri[:, 1], 1] - verts[tri[:, 0], 1])
    tri[a < 0] = tri[a < 0][:, ::-1]
    tri = tri[np.abs(a) > 1e-14]
    return verts, tri


def steiner_grid(outer, holes, lines, us, vs, clear):
    U, V = np.meshgrid(np.asarray(us, float), np.asarray(vs, float))
    pts = np.stack([U.ravel(), V.ravel()], axis=1)
    keep = points_in_poly(pts, outer)
    for h in holes:
        keep &= ~points_in_poly(pts, h)
    pts = pts[keep]
    for ch, cl in [(outer, True)] + [(h, True) for h in holes] + [(l, False) for l in lines]:
        if len(pts) == 0:
            break
        pts = pts[dist_to_chain(pts, ch, cl) > clear]
    return pts


class MB:
    """Mesh builder: triangle chunks (local indices) with per-corner normals, uvs and material slot index."""

    def __init__(self):
        self.V = []
        self.F = []
        self.N = []
        self.UV = []
        self.M = []
        self.S = []
        self.cur_seg = -1.0
        self.const_uv = None

    def add(self, verts, tris, normals=None, uvs=None, mat=0, seg=None):
        verts = np.asarray(verts, float).reshape(-1, 3)
        tris = np.asarray(tris, int).reshape(-1, 3)
        if len(tris) == 0:
            return
        self.V.append(verts)
        self.F.append(tris)
        self.N.append(np.full((len(tris), 3, 3), np.nan) if normals is None else np.asarray(normals, float).reshape(-1, 3, 3))
        if self.const_uv is not None:
            uvs = np.tile(np.asarray(self.const_uv, float), (len(tris), 3, 1))
        self.UV.append(np.zeros((len(tris), 3, 2)) if uvs is None else np.asarray(uvs, float).reshape(-1, 3, 2))
        self.M.append(np.full(len(tris), int(mat)) if np.isscalar(mat) else np.asarray(mat, int).reshape(-1))
        sg = self.cur_seg if seg is None else seg
        self.S.append(np.full(len(verts), float(sg)) if np.isscalar(sg) else np.asarray(sg, float).reshape(-1))

    def extend(self, other, mat=None):
        for V, F, N, UV, M, Sg in zip(other.V, other.F, other.N, other.UV, other.M, other.S):
            self.add(V, F, N, UV, M if mat is None else mat, Sg)

    def transformed(self, R=None, t=(0, 0, 0)):
        out = MB()
        R = np.eye(3) if R is None else np.asarray(R, float)
        t = np.asarray(t, float)
        for V, F, N, UV, M, Sg in zip(self.V, self.F, self.N, self.UV, self.M, self.S):
            out.add(V @ R.T + t, F, N @ R.T, UV, M, Sg)
        return out

    def mirrored_x(self, seg_map=None):
        out = MB()
        S = np.array([-1.0, 1.0, 1.0])
        for V, F, N, UV, M, Sg in zip(self.V, self.F, self.N, self.UV, self.M, self.S):
            sg = Sg if seg_map is None else np.array([seg_map.get(int(v), v) for v in Sg], float)
            out.add(V * S, F[:, ::-1], (N * S)[:, ::-1], UV[:, ::-1], M, sg)
        return out

    def ntris(self):
        return sum(len(f) for f in self.F)

    def build(self, name, materials, sharp_angle=None):
        me = bpy.data.meshes.new(name)
        if not self.V:
            return me
        offs = np.cumsum([0] + [len(v) for v in self.V[:-1]])
        V = np.concatenate(self.V)
        F = np.concatenate([f + o for f, o in zip(self.F, offs)])
        N = np.concatenate(self.N).reshape(-1, 3)
        UV = np.concatenate(self.UV).reshape(-1, 2)
        M = np.concatenate(self.M)
        me.vertices.add(len(V))
        me.vertices.foreach_set('co', V.astype(np.float32).ravel())
        me.loops.add(len(F) * 3)
        me.loops.foreach_set('vertex_index', F.astype(np.int32).ravel())
        me.polygons.add(len(F))
        me.polygons.foreach_set('loop_start', (np.arange(len(F)) * 3).astype(np.int32))
        me.update(calc_edges=True)
        me.validate(clean_customdata=False)
        if len(me.polygons) != len(F):
            raise RuntimeError(f'{name}: polygons {len(F)} -> {len(me.polygons)} after validate')
        for m in materials:
            me.materials.append(m)
        me.polygons.foreach_set('material_index', np.clip(M, 0, max(0, len(materials) - 1)).astype(np.int32))
        me.polygons.foreach_set('use_smooth', np.ones(len(F), bool))
        uvl = me.uv_layers.new(name='UVMap')
        uvl.data.foreach_set('uv', UV.astype(np.float32).ravel())
        Sg = np.concatenate(self.S)
        if (Sg >= 0).any():
            at = me.attributes.new('_SEG', 'FLOAT', 'POINT')
            at.data.foreach_set('value', np.maximum(Sg, 0).astype(np.float32))
        bad = np.isnan(N).any(axis=1)
        if sharp_angle is not None:
            me.set_sharp_from_angle(angle=math.radians(sharp_angle))
        if not bad.all():
            if bad.any():
                cur = np.zeros(len(me.loops) * 3, np.float32)
                me.corner_normals.foreach_get('vector', cur)
                N = N.copy()
                N[bad] = cur.reshape(-1, 3)[bad]
            N = N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
            me.normals_split_custom_set(N.tolist())
        me.update()
        return me


def patch_mesh(mb, patch, verts2d, tris, mat=0, nudge=0.004, uv=None):
    """Lift a 2D triangulation onto a patch with analytic per-corner normals (nudged into the face)."""
    verts2d = np.asarray(verts2d, float)
    tris = np.asarray(tris, int)
    if len(tris) == 0:
        return
    used = np.unique(tris)
    remap = np.full(len(verts2d), -1)
    remap[used] = np.arange(len(used))
    v2 = verts2d[used]
    tr = remap[tris]
    P = patch.pos(v2)
    corners = v2[tr]
    cen = corners.mean(axis=1, keepdims=True)
    d = cen - corners
    ln = np.linalg.norm(d, axis=2, keepdims=True)
    nud = corners + d / np.maximum(ln, 1e-12) * np.minimum(ln * 0.5, nudge)
    N = patch.nrm(nud.reshape(-1, 2)).reshape(-1, 3, 3)
    fn = np.cross(P[tr[:, 1]] - P[tr[:, 0]], P[tr[:, 2]] - P[tr[:, 0]])
    flip = np.einsum('ij,ij->i', fn, N.mean(axis=1)) < 0
    tr[flip] = tr[flip][:, ::-1]
    N[flip] = N[flip][:, ::-1]
    corners[flip] = corners[flip][:, ::-1]
    UV = corners if uv is None else uv(corners.reshape(-1, 2)).reshape(-1, 3, 2)
    mm = mat if np.isscalar(mat) else np.asarray(mat)[np.arange(len(tris))]
    mb.add(P, tr, N, UV, mm)


def grid_quads(nu, nv, closed_u=False):
    idx = np.arange(nu * nv).reshape(nv, nu)
    q = []
    for j in range(nv - 1):
        for i in range(nu if closed_u else nu - 1):
            i2 = (i + 1) % nu
            q.append((idx[j, i], idx[j, i2], idx[j + 1, i2], idx[j + 1, i]))
    return np.array(q, int).reshape(-1, 4)


def grid_mesh(mb, P, mat=0, uvs=None, flip=False, closed_u=False, normals=None):
    """P: (nv, nu, 3). Smooth normals from grid derivatives unless normals (nv,nu,3) given."""
    P = np.asarray(P, float)
    nv, nu, _ = P.shape
    q = grid_quads(nu, nv, closed_u)
    if len(q) == 0:
        return
    if normals is None:
        if closed_u:
            gu = np.roll(P, -1, axis=1) - np.roll(P, 1, axis=1)
        else:
            gu = np.gradient(P, axis=1)
        gv = np.gradient(P, axis=0)
        n = np.cross(gu, gv)
        n = n / np.maximum(np.linalg.norm(n, axis=2, keepdims=True), 1e-15)
        if flip:
            n = -n
    else:
        n = np.asarray(normals, float)
    if flip:
        q = q[:, ::-1]
    V = P.reshape(-1, 3)
    NV = n.reshape(-1, 3)
    tris = np.concatenate([q[:, [0, 1, 2]], q[:, [0, 2, 3]]])
    if uvs is None:
        us = np.linspace(0, 1, nu)
        vs = np.linspace(0, 1, nv)
        uvs = np.stack(np.meshgrid(us, vs), axis=-1)
    UVV = np.asarray(uvs, float).reshape(-1, 2)
    mb.add(V, tris, NV[tris], UVV[tris], mat)


def lathe(mb, profile, seg=32, axis='Z', center=(0, 0, 0), mat=0, R=None, a0=0.0, a1=None, cap0=False, cap1=False, flip=False):
    """Revolve profile [(r, h), ...] around a local axis ('X','Y','Z'); h along the axis. Outward normals for profiles ordered along +h."""
    prof = np.asarray(profile, float)
    full = a1 is None
    if full:
        a1 = a0 + 2 * math.pi
        nu = seg
        ang = a0 + (a1 - a0) * np.arange(seg) / seg
    else:
        nu = seg + 1
        ang = a0 + (a1 - a0) * np.arange(nu) / seg
    r = prof[:, 0][:, None]
    h = prof[:, 1][:, None]
    ca, sa = np.cos(ang)[None, :], np.sin(ang)[None, :]
    if axis == 'Z':
        P = np.stack(np.broadcast_arrays(r * ca, r * sa, h), axis=-1)
        ax = np.array([0, 0, 1.0])
    elif axis == 'Y':
        P = np.stack(np.broadcast_arrays(r * sa, h, r * ca), axis=-1)
        ax = np.array([0, 1.0, 0])
    else:
        P = np.stack(np.broadcast_arrays(h, r * ca, r * sa), axis=-1)
        ax = np.array([1.0, 0, 0])
    if R is not None:
        P = P @ np.asarray(R).T
        ax = np.asarray(R) @ ax
    P = P + np.asarray(center, float)
    uvs = np.stack(np.meshgrid(np.arange(nu) / seg, np.linspace(0, 1, len(prof))), axis=-1)
    grid_mesh(mb, P, mat, uvs, flip=flip, closed_u=full)
    c = np.asarray(center, float)
    for on, k, sgn in ((cap0, 0, -1.0), (cap1, len(prof) - 1, 1.0)):
        if not on:
            continue
        ring = P[k]
        mid = c + ax * prof[k, 1]
        Vv = np.concatenate([ring, mid[None]])
        m = len(ring)
        tt = np.array([(i, (i + 1) % m, m) for i in range(m if full else m - 1)])
        want = ax * sgn
        nr = np.cross(Vv[tt[:, 1]] - Vv[tt[:, 0]], Vv[tt[:, 2]] - Vv[tt[:, 0]])
        if float(np.sum(nr @ want)) < 0:
            tt = tt[:, ::-1]
        mb.add(Vv, tt, np.tile(want, (len(tt), 3, 1)), None, mat)


def box(mb, center, size, mat=0, R=None):
    sx, sy, sz = [s / 2 for s in size]
    v = np.array([(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)], float) * [sx, sy, sz]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (3, 0, 4, 7)]
    if R is not None:
        v = v @ np.asarray(R).T
    v = v + np.asarray(center, float)
    tris, N, UV = [], [], []
    for a, b, c, d in faces:
        n = np.cross(v[b] - v[a], v[c] - v[a])
        n = n / np.linalg.norm(n)
        tris += [(a, b, c), (a, c, d)]
        N += [[n, n, n], [n, n, n]]
        UV += [[(0, 0), (1, 0), (1, 1)], [(0, 0), (1, 1), (0, 1)]]
    mb.add(v, np.array(tris), np.array(N), np.array(UV, float), mat)


def rbox(mb, center, size, r, seg=3, mat=0, R=None):
    """Rounded box (sphere-corner construction)."""
    sx, sy, sz = [s / 2 for s in size]
    r = min(r, sx * 0.98, sy * 0.98, sz * 0.98)
    th = np.concatenate([np.linspace(-math.pi / 2, 0, seg + 1), np.linspace(0, math.pi / 2, seg + 1)])
    sz_ = np.concatenate([np.full(seg + 1, -1.0), np.full(seg + 1, 1.0)])
    q = [np.linspace(-math.pi + k * math.pi / 2, -math.pi / 2 + k * math.pi / 2, seg + 1) for k in range(4)]
    ph = np.concatenate(q)
    sxs = np.concatenate([np.full(seg + 1, v) for v in (-1.0, 1.0, 1.0, -1.0)])
    sys_ = np.concatenate([np.full(seg + 1, v) for v in (-1.0, -1.0, 1.0, 1.0)])
    T, PH = np.meshgrid(th, ph, indexing='ij')
    nx = np.cos(T) * np.cos(PH)
    ny = np.cos(T) * np.sin(PH)
    nz = np.sin(T)
    cx = sxs[None, :] * (sx - r)
    cy = sys_[None, :] * (sy - r)
    cz = sz_[:, None] * (sz - r)
    P = np.stack([cx + r * nx, cy + r * ny, cz + r * nz], axis=-1)
    Nn = np.stack([nx, ny, nz], axis=-1)
    if R is not None:
        P = P @ np.asarray(R).T
        Nn = Nn @ np.asarray(R).T
    P = P + np.asarray(center, float)
    grid_mesh(mb, P, mat, None, flip=False, closed_u=True, normals=Nn)
    for k, sgn in ((0, -1.0), (len(th) - 1, 1.0)):
        ring = P[k]
        c = ring.mean(axis=0)
        Vv = np.concatenate([ring, c[None]])
        m = len(ring)
        tt = np.array([(i, (i + 1) % m, m) for i in range(m)])
        want = np.array([0, 0, sgn])
        if R is not None:
            want = np.asarray(R) @ want
        nr = np.cross(Vv[tt[:, 1]] - Vv[tt[:, 0]], Vv[tt[:, 2]] - Vv[tt[:, 0]])
        if float(np.sum(nr @ want)) < 0:
            tt = tt[:, ::-1]
        mb.add(Vv, tt, np.tile(want, (len(tt), 3, 1)), None, mat)


def rot_vec(v, axis, ang):
    axis = np.asarray(axis, float)
    axis = axis / np.linalg.norm(axis)
    return v * math.cos(ang) + np.cross(axis, v) * math.sin(ang) + axis * float(np.dot(axis, v)) * (1 - math.cos(ang))


def rmat(rx=0.0, ry=0.0, rz=0.0):
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def frames_along(path, up=(0, 0, 1)):
    path = np.asarray(path, float)
    n = len(path)
    T = np.gradient(path, axis=0)
    T = T / np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-12)
    upv = np.asarray(up, float)
    ref = upv if abs(float(np.dot(upv, T[0]))) < 0.95 else np.array([1.0, 0, 0])
    nrm = np.cross(ref, T[0])
    nrm /= np.linalg.norm(nrm)
    nrm = np.cross(T[0], nrm)
    out_n, out_b = [], []
    for i in range(n):
        if i > 0:
            b = np.cross(T[i - 1], T[i])
            if np.linalg.norm(b) > 1e-9:
                ang = math.acos(max(-1.0, min(1.0, float(np.dot(T[i - 1], T[i])))))
                nrm = rot_vec(nrm, b, ang)
        out_n.append(nrm.copy())
        out_b.append(np.cross(T[i], nrm))
    return T, np.array(out_n), np.array(out_b)


def tube(mb, path, radius, seg=10, mat=0, caps=True, radii=None, up=(0, 0, 1), closed=False):
    path = np.asarray(path, float)
    n = len(path)
    radii = np.full(n, radius) if radii is None else np.asarray(radii, float)
    T, Nn, B = frames_along(path, up)
    ang = np.arange(seg) / seg * 2 * math.pi
    d = np.cos(ang)[None, :, None] * Nn[:, None, :] + np.sin(ang)[None, :, None] * B[:, None, :]
    P = path[:, None, :] + radii[:, None, None] * d
    uvs = np.stack(np.meshgrid(np.arange(seg) / seg, np.linspace(0, 1, n)), axis=-1)
    gu = np.roll(P, -1, axis=1) - np.roll(P, 1, axis=1)
    gv = np.gradient(P, axis=0)
    fl = float(np.sum(np.cross(gu, gv) * d)) < 0
    grid_mesh(mb, P, mat, uvs, flip=fl, closed_u=True, normals=d if not fl else d)
    if caps and not closed:
        for k, sgn in ((0, -1.0), (n - 1, 1.0)):
            ring = P[k]
            Vv = np.concatenate([ring, path[k][None]])
            tt = np.array([(i, (i + 1) % seg, seg) for i in range(seg)])
            want = T[k] * sgn
            nr = np.cross(Vv[tt[:, 1]] - Vv[tt[:, 0]], Vv[tt[:, 2]] - Vv[tt[:, 0]])
            if float(np.sum(nr @ want)) < 0:
                tt = tt[:, ::-1]
            mb.add(Vv, tt, np.tile(want, (len(tt), 3, 1)), None, mat)


def sweep(mb, path, profile, mat=0, up=(0, 0, 1), closed_profile=True, normals_up=None, scale=None, caps=False):
    """Sweep a 2D profile [(a, b)] along a path; a along the frame normal, b along binormal."""
    path = np.asarray(path, float)
    n = len(path)
    prof = np.asarray(profile, float)
    T, Nn, B = frames_along(path, up) if normals_up is None else _frames_with_up(path, normals_up)
    sc = np.ones(n) if scale is None else np.asarray(scale, float)
    P = path[:, None, :] + sc[:, None, None] * (prof[None, :, 0, None] * Nn[:, None, :] + prof[None, :, 1, None] * B[:, None, :])
    m = len(prof)
    if closed_profile:
        gu = np.roll(P, -1, axis=1) - np.roll(P, 1, axis=1)
    else:
        gu = np.gradient(P, axis=1)
    gv = np.gradient(P, axis=0)
    nn = np.cross(gu, gv)
    nn = nn / np.maximum(np.linalg.norm(nn, axis=2, keepdims=True), 1e-15)
    cen = path[:, None, :]
    outward = float(np.sum(nn * (P - cen))) > 0
    grid_mesh(mb, P, mat, None, flip=not outward, closed_u=closed_profile)
    if caps:
        for k, sgn in ((0, -1.0), (n - 1, 1.0)):
            ring = P[k]
            c = ring.mean(axis=0)
            Vv = np.concatenate([ring, c[None]])
            tt = np.array([(i, (i + 1) % m, m) for i in range(m)])
            want = T[k] * sgn
            nr = np.cross(Vv[tt[:, 1]] - Vv[tt[:, 0]], Vv[tt[:, 2]] - Vv[tt[:, 0]])
            if float(np.sum(nr @ want)) < 0:
                tt = tt[:, ::-1]
            mb.add(Vv, tt, np.tile(want, (len(tt), 3, 1)), None, mat)


def _frames_with_up(path, ups):
    path = np.asarray(path, float)
    T = np.gradient(path, axis=0)
    T = T / np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-12)
    U = np.asarray(ups, float)
    if U.ndim == 1:
        U = np.tile(U, (len(path), 1))
    B = np.cross(T, U)
    B = B / np.maximum(np.linalg.norm(B, axis=1, keepdims=True), 1e-12)
    Nn = np.cross(B, T)
    return T, Nn, B


def new_object(name, data, parent=None, coll=None):
    ob = bpy.data.objects.new(name, data)
    (coll or bpy.context.scene.collection).objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def new_empty(name, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, size=0.1, coll=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = size
    ob.empty_display_type = 'ARROWS'
    (coll or bpy.context.scene.collection).objects.link(ob)
    if parent is not None:
        ob.parent = parent
    ob.location = loc
    ob.rotation_mode = 'XYZ'
    ob.rotation_euler = rot
    return ob
