# Traffic mesh kit: numpy mesh accumulator (quads/tris, per-face slot, per-corner UV), lofts, sweeps, lathes, boxes, bpy build.
import math
import numpy as np

ATLAS = 1024


def pchip(xs, ys):
    xs = np.asarray(xs, float)
    ys = np.asarray(ys, float)
    if len(xs) == 1:
        return lambda x: np.full_like(np.asarray(x, float), ys[0])
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


def curve(pts):
    a = np.asarray(pts, float)
    return pchip(a[:, 0], a[:, 1])


def lin(pts):
    a = np.asarray(pts, float)
    return lambda x: np.interp(x, a[:, 0], a[:, 1])


def uv_rect(rect, fu, fv):
    """rect = (x0, y0, w, h) in atlas pixels (y down); fu, fv in 0..1 -> Blender UV (v up)."""
    x0, y0, w, h = rect
    u = (x0 + np.asarray(fu, float) * w) / ATLAS
    v = 1.0 - (y0 + (1.0 - np.asarray(fv, float)) * h) / ATLAS
    return u, v


def uv_point(rect):
    x0, y0, w, h = rect
    return ((x0 + w * 0.5) / ATLAS, 1.0 - (y0 + h * 0.5) / ATLAS)


class Mesh:
    """Polygon soup with shared vertices per chunk; faces carry a slot name and per-corner UVs."""

    def __init__(self):
        self.V = []
        self.F = []
        self.UV = []
        self.S = []
        self.n = 0

    def vert(self, p):
        p = np.asarray(p, float).reshape(-1, 3)
        base = self.n
        self.V.append(p)
        self.n += len(p)
        return base

    def face(self, idx, slot, uvs):
        self.F.append(list(int(i) for i in idx))
        self.S.append(slot)
        self.UV.append([tuple(map(float, u)) for u in uvs])

    def extend(self, other, M=None, t=None):
        if not other.V:
            return
        V = np.concatenate(other.V)
        if M is not None:
            V = V @ np.asarray(M, float).T
        if t is not None:
            V = V + np.asarray(t, float)
        base = self.vert(V)
        flip = M is not None and np.linalg.det(np.asarray(M, float)) < 0
        for f, s, uv in zip(other.F, other.S, other.UV):
            idx = [i + base for i in f]
            if flip:
                idx = idx[::-1]
                uv = uv[::-1]
            self.F.append(idx)
            self.S.append(s)
            self.UV.append(uv)

    def mirrored(self):
        out = Mesh()
        out.extend(self, M=np.diag([-1.0, 1.0, 1.0]))
        return out

    def ntris(self):
        return sum(len(f) - 2 for f in self.F)

    def points(self):
        return np.concatenate(self.V) if self.V else np.zeros((0, 3))

    def remap_slots(self, fn):
        self.S = [fn(s) for s in self.S]


def grid(mesh, P, slot_fn, uv_fn, closed_u=False):
    """P: (nv, nu, 3) grid; faces between rows j,j+1 and cols i,i+1. slot_fn(j, i, quad_pts) -> slot or None; uv_fn(j, i, quad_pts, slot) -> 4 uvs."""
    nv, nu = P.shape[0], P.shape[1]
    base = mesh.vert(P.reshape(-1, 3))
    idx = lambda j, i: base + j * nu + (i % nu)
    ni = nu if closed_u else nu - 1
    for j in range(nv - 1):
        for i in range(ni):
            q = [(j, i), (j + 1, i), (j + 1, i + 1), (j, i + 1)]
            pts = np.array([P[a, b % nu] for a, b in q])
            area = np.linalg.norm(np.cross(pts[2] - pts[0], pts[3] - pts[1]))
            if area < 1e-9:
                continue
            slot = slot_fn(j, i, pts)
            if slot is None:
                continue
            mesh.face([idx(a, b) for a, b in q], slot, uv_fn(j, i, pts, slot))


def face_normal(pts):
    pts = np.asarray(pts, float)
    n = np.cross(pts[2] - pts[0], pts[3] - pts[1]) if len(pts) > 3 else np.cross(pts[1] - pts[0], pts[2] - pts[0])
    l = np.linalg.norm(n)
    return n / l if l > 0 else n


def fan(mesh, ring, center, slot, uv_of, flip=False):
    ring = np.asarray(ring, float)
    c = mesh.vert(np.asarray(center, float)[None])
    b = mesh.vert(ring)
    n = len(ring)
    for i in range(n):
        a, bb = b + i, b + (i + 1) % n
        tri = [c, a, bb] if not flip else [c, bb, a]
        pts = [np.asarray(center, float), ring[i], ring[(i + 1) % n]] if not flip else [np.asarray(center, float), ring[(i + 1) % n], ring[i]]
        mesh.face(tri, slot, [uv_of(p) for p in pts])


def quad(mesh, p0, p1, p2, p3, slot, uvs=None, uv=(0.0, 0.0)):
    b = mesh.vert(np.array([p0, p1, p2, p3], float))
    mesh.face([b, b + 1, b + 2, b + 3], slot, uvs if uvs is not None else [uv] * 4)


def box(mesh, c, half, slot, uv=(0.0, 0.0), bevel=0.0, uv_fn=None, skip=()):
    """Axis-aligned box (optionally chamfered by bevel) centred at c with half extents; faces outward."""
    c = np.asarray(c, float)
    h = np.asarray(half, float)
    if bevel <= 0:
        sx, sy, sz = h
        P = np.array([[-sx, -sy, -sz], [sx, -sy, -sz], [sx, sy, -sz], [-sx, sy, -sz],
                      [-sx, -sy, sz], [sx, -sy, sz], [sx, sy, sz], [-sx, sy, sz]]) + c
        b = mesh.vert(P)
        faces = {'-z': [0, 3, 2, 1], '+z': [4, 5, 6, 7], '-y': [0, 1, 5, 4], '+y': [2, 3, 7, 6], '-x': [3, 0, 4, 7], '+x': [1, 2, 6, 5]}
        for k, f in faces.items():
            if k in skip:
                continue
            pts = P[f]
            mesh.face([b + i for i in f], slot, [uv_fn(p, k) for p in pts] if uv_fn else [uv] * 4)
        return
    e = min(bevel, *h * 0.95)
    prof = [(h[0] - e, -h[2]), (h[0], -h[2] + e), (h[0], h[2] - e), (h[0] - e, h[2])]
    ring = [(x, z) for x, z in prof] + [(-x, z) for x, z in prof[::-1]]
    ring = [ring[0]] + ring[1:]
    ring = ring_ccw(ring)
    ys = [-h[1], -h[1] + e, h[1] - e, h[1]]
    P = []
    for k, y in enumerate(ys):
        sc = 1.0 if k in (1, 2) else 0.0
        row = []
        for x, z in ring:
            xx = np.sign(x) * (abs(x) - e * (1 - sc)) if abs(x) > 1e-9 else x
            zz = np.sign(z) * (abs(z) - e * (1 - sc)) if abs(z) > 1e-9 else z
            row.append([xx, y, zz])
        P.append(row)
    P = np.array(P) + c
    grid(mesh, P, lambda j, i, q: slot, lambda j, i, q, s: [uv_fn(p, 'side') if uv_fn else uv for p in q], closed_u=True)
    capF = P[0]
    capR = P[-1]
    fan(mesh, capF, capF.mean(axis=0), slot, (lambda p: uv_fn(p, '-y')) if uv_fn else (lambda p: uv), flip=False)
    fan(mesh, capR, capR.mean(axis=0), slot, (lambda p: uv_fn(p, '+y')) if uv_fn else (lambda p: uv), flip=True)


def ring_ccw(ring):
    r = np.asarray(ring, float)
    a = 0.5 * np.sum(r[:, 0] * np.roll(r[:, 1], -1) - np.roll(r[:, 0], -1) * r[:, 1])
    return [tuple(p) for p in (r if a > 0 else r[::-1])]


def loft_rings(mesh, rings, slot_fn, uv_fn, closed=True):
    """rings: list of (n,3) point arrays in Blender coords (x, y, z), ordered CCW in x-z, stations along +y."""
    P = np.stack([np.asarray(r, float) for r in rings])
    grid(mesh, P, slot_fn, uv_fn, closed_u=closed)
    return P


def sweep(mesh, path, prof, slot_of, uv_of, up=(0, 0, 1), closed=False, caps=True, cap_slot=None):
    """path: (n,3) points; prof: list of (a, b) offsets along (side normal, up); faces outward for CCW prof in (side, up)."""
    path = np.asarray(path, float)
    n = len(path)
    upv = np.asarray(up, float)
    rows = []
    for k in range(n):
        if closed:
            t = path[(k + 1) % n] - path[k - 1]
        else:
            t = path[min(k + 1, n - 1)] - path[max(k - 1, 0)]
        t = t / (np.linalg.norm(t) + 1e-12)
        side = np.cross(t, upv)
        side /= np.linalg.norm(side) + 1e-12
        u2 = np.cross(side, t)
        rows.append([path[k] + side * a + u2 * b for a, b in prof])
    P = np.array(rows)
    grid(mesh, P, lambda j, i, q: slot_of(i), lambda j, i, q, s: [uv_of(j, i, p) for p in q], closed_u=True)
    if caps and not closed:
        cs = cap_slot if cap_slot is not None else slot_of(0)
        fan(mesh, P[0], P[0].mean(axis=0), cs, lambda p: uv_of(0, 0, p), flip=True)
        fan(mesh, P[-1], P[-1].mean(axis=0), cs, lambda p: uv_of(0, 0, p), flip=False)
    return P


def lathe_x(mesh, prof, seg, slot_of, uv_of, x_sign=1.0):
    """Revolve prof [(x, r)] about the X axis (wheel); faces outward. uv_of(i_prof, angle, x, r)."""
    ang = np.linspace(0, 2 * math.pi, seg + 1)[:-1]
    P = np.array([[[x * x_sign, r * math.cos(a), r * math.sin(a)] for a in ang] for x, r in prof])
    sgn = 1 if x_sign > 0 else -1
    base = mesh.vert(P.reshape(-1, 3))
    nu = seg
    for j in range(len(prof) - 1):
        for i in range(seg):
            q = [(j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i)]
            if sgn < 0:
                q = q[::-1]
            idx = [base + a * nu + (b % nu) for a, b in q]
            pts = np.array([P[a, b % nu] for a, b in q])
            if np.linalg.norm(np.cross(pts[2] - pts[0], pts[3] - pts[1])) < 1e-10:
                continue
            mesh.face(idx, slot_of(j), [uv_of(a, ang[b % nu], prof[a][0], prof[a][1]) for a, b in q])
    return P


def disk_x(mesh, x, r, seg, slot, uv_of, facing=1.0, r_in=0.0):
    ang = np.linspace(0, 2 * math.pi, seg + 1)[:-1]
    outer = np.array([[x, r * math.cos(a), r * math.sin(a)] for a in ang])
    if r_in <= 0:
        c = mesh.vert(np.array([[x, 0.0, 0.0]]))
        b = mesh.vert(outer)
        for i in range(seg):
            tri = [c, b + i, b + (i + 1) % seg] if facing > 0 else [c, b + (i + 1) % seg, b + i]
            pts = [np.array([x, 0, 0]), outer[i], outer[(i + 1) % seg]] if facing > 0 else [np.array([x, 0, 0]), outer[(i + 1) % seg], outer[i]]
            mesh.face(tri, slot, [uv_of(p) for p in pts])
        return
    inner = outer * np.array([1, r_in / r, r_in / r])
    b = mesh.vert(np.concatenate([outer, inner]))
    for i in range(seg):
        k = (i + 1) % seg
        q = [b + i, b + k, b + seg + k, b + seg + i]
        pts = [outer[i], outer[k], inner[k], inner[i]]
        if facing < 0:
            q = q[::-1]
            pts = pts[::-1]
        mesh.face(q, slot, [uv_of(p) for p in pts])


def build_bpy(mesh, name, slot_order, materials, sharp_deg=38.0, smooth=True):
    import bpy
    me = bpy.data.meshes.new(name)
    if not mesh.V:
        return me
    V = np.concatenate(mesh.V).astype(np.float32)
    used = [s for s in slot_order if s in set(mesh.S)]
    sidx = {s: k for k, s in enumerate(used)}
    loops = [i for f in mesh.F for i in f]
    starts = np.cumsum([0] + [len(f) for f in mesh.F[:-1]]).astype(np.int32)
    totals = np.array([len(f) for f in mesh.F], np.int32)
    me.vertices.add(len(V))
    me.vertices.foreach_set('co', V.ravel())
    me.loops.add(len(loops))
    me.loops.foreach_set('vertex_index', np.array(loops, np.int32))
    me.polygons.add(len(mesh.F))
    me.polygons.foreach_set('loop_start', starts)
    me.update(calc_edges=True)
    for s in used:
        me.materials.append(materials[s])
    me.polygons.foreach_set('material_index', np.array([sidx[s] for s in mesh.S], np.int32))
    uvl = me.uv_layers.new(name='UVMap')
    uvl.data.foreach_set('uv', np.array([u for f in mesh.UV for u in f], np.float32).ravel())
    me.polygons.foreach_set('use_smooth', np.full(len(mesh.F), smooth, bool))
    me.validate(clean_customdata=False)
    if smooth and sharp_deg:
        me.set_sharp_from_angle(angle=math.radians(sharp_deg))
    me.update()
    return me
