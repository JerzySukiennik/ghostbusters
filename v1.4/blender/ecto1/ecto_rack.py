# Ecto-1 1984 roof rack: light bars, domes, frame, siren, beacon, spotlights, tanks, tower + red arm, radome mast, dish, hoses, ladder.
import math
import numpy as np
from ecto_common import MB, lathe, box, rbox, tube, sweep, grid_mesh, bl, rmat, Y_OFF
import ecto_design as D
import ecto_body as B

PAL_KEYS = ['white', 'black', 'yellow', 'green', 'red', 'blue', 'grey', 'brass', 'darkred', 'lightgrey', 'silver', 'orange', 'cream', 'darkgrey', 'rubber', 'olive']


def pal(name):
    i = PAL_KEYS.index(name)
    return ((i % 8) * 64 + 32) / 512.0, 1.0 - ((i // 8) * 64 + 32) / 512.0


def pal_rect(col, row, w=1, h=1):
    u0 = col * 64 / 512.0
    v1 = 1.0 - row * 64 / 512.0
    return u0, v1 - h * 64 / 512.0, u0 + w * 64 / 512.0, v1


def roof_z(s, x):
    a = float(D.x_dr(s))
    zd = float(D.z_dr(s))
    b = max(float(D.z_rc(s)) - zd, 0.0)
    c = min(abs(x) / a, 1.0) ** 3.0
    th = math.acos(c)
    return zd + b * math.sin(th) ** (2.0 / 2.6)


def P(x, s, z):
    return bl(x, s, z)[()]


def light_bar(mb, emit, s0, mi, seg_base, length=1.20, depth=0.26, h=0.115):
    zr = roof_z(s0, 0.0) + 0.045
    cx = 0.0
    mb.const_uv = None
    rbox(mb, P(cx, s0, zr + 0.012), (length, depth, 0.024), 0.008, seg=2, mat=mi['gap'])
    half = length / 2
    lens_len = (length - 0.32) / 2
    for k, sgn in enumerate((1.0, -1.0)):
        cxl = sgn * (0.16 + lens_len / 2)
        emit.cur_seg = seg_base + k
        prof = [(0.0, -lens_len / 2), (depth * 0.40, -lens_len / 2), (depth * 0.46, -lens_len / 2 + 0.02), (depth * 0.47, lens_len / 2 - 0.02), (depth * 0.40, lens_len / 2), (0.0, lens_len / 2)]
        sec = []
        for i, (r, hh) in enumerate(prof):
            row = []
            for a in np.linspace(0, math.pi, 13):
                yy = -math.cos(a) * r
                zz = math.sin(a) * r * (h - 0.02) / (depth * 0.47)
                row.append(P(cxl + hh, s0 + yy, zr + 0.024 + zz))
            sec.append(row)
        G = np.array(sec)
        gu = np.gradient(G, axis=1)
        gv = np.gradient(G, axis=0)
        n = np.cross(gu, gv)
        fl = np.sum(n[2, 6] * np.array([0, 0, 1.0])) < 0
        grid_mesh(emit, G, mi['bar_emit'], None, flip=fl)
        emit.cur_seg = -1
    rbox(mb, P(0.0, s0, zr + 0.024 + 0.045), (0.30, depth * 0.86, 0.09), 0.012, seg=2, mat=mi['chrome'])
    mb.const_uv = None
    for i in range(8):
        zz = zr + 0.040 + i * 0.0085
        box(mb, P(0.0, s0 - depth * 0.43 - 0.002, zz), (0.27, 0.004, 0.004), mi['gap'])
    for sgn in (1.0, -1.0):
        rbox(mb, P(sgn * (half - 0.015), s0, zr + 0.06), (0.03, depth * 0.95, 0.10), 0.01, seg=2, mat=mi['chrome'])
    for sgn in (1.0, -1.0):
        xb = sgn * (half - 0.10)
        zt = zr + 0.012
        xe = sgn * float(D.x_dr(s0)) * 1.0
        ze = float(D.z_dr(s0)) + 0.01
        mb.const_uv = pal('white')
        path = np.array([P(xb, s0, zt), P(xb * 0.5 + xe * 0.5, s0, zt + 0.004), P(xe * 0.97, s0, ze + 0.07), P(xe * 1.01, s0, ze + 0.005)])
        sweep(mb, path, [(-0.004, -0.028), (0.004, -0.028), (0.004, 0.028), (-0.004, 0.028)], mat=mi['palette'], up=(0, 1, 0), caps=True)
        rbox(mb, P(xb, s0, zt - 0.005), (0.07, 0.07, 0.03), 0.006, seg=1, mat=mi['palette'])
        mb.const_uv = None


def dome_lamp(mb, emit, x, s, z, mi, seg, r=0.082, stalk=0.06):
    lathe(mb, [(0.0, 0.0), (0.030, 0.0), (0.022, 0.010), (0.012, stalk * 0.6), (0.016, stalk), (0.0, stalk + 0.005)], seg=16, axis='Z', center=P(x, s, z), mat=mi['chrome'])
    base = P(x, s, z + stalk)
    lathe(mb, [(0.0, 0.0), (r * 1.02, 0.0), (r * 1.05, 0.010), (r * 1.0, 0.022), (0.0, 0.022)], seg=24, axis='Z', center=base, mat=mi['chrome'])
    emit.cur_seg = seg
    prof = [(r * 0.98, 0.0)] + [(r * 0.98 * math.cos(a), 0.02 + r * 0.9 * math.sin(a)) for a in np.linspace(0, math.pi / 2, 9)[1:]]
    prof = [(r * 0.98, 0.018)] + prof[1:]
    lathe(emit, prof, seg=24, axis='Z', center=base, mat=mi['bar_emit'])
    emit.cur_seg = -1


def rack_frame(mb, mi, s0, s1, w, h):
    mb.const_uv = pal('black')
    t = 0.022
    for sgn in (1.0, -1.0):
        x = sgn * w / 2
        zr0 = roof_z(s0, x)
        zr1 = roof_z(s1, x)
        zb = max(zr0, zr1) + 0.045
        zt = zb + h
        pts_bot = [P(x, s0 + 0.10, zb), P(x, s1, zb)]
        pts_top = [P(x, s0 + 0.32, zt), P(x, s1, zt)]
        _bar(mb, pts_bot[0], pts_bot[1], t, mi)
        _bar(mb, pts_top[0], pts_top[1], t, mi)
        _bar(mb, pts_bot[0], pts_top[0], t, mi)
        _bar(mb, pts_bot[1], pts_top[1], t, mi)
        n = 5
        for i in range(n):
            a = s0 + 0.32 + (s1 - s0 - 0.32) * i / n
            b = s0 + 0.32 + (s1 - s0 - 0.32) * (i + 1) / n
            if i % 2 == 0:
                _bar(mb, P(x, a, zb), P(x, b, zt), t * 0.8, mi)
            else:
                _bar(mb, P(x, a, zt), P(x, b, zb), t * 0.8, mi)
        for sf in (s0 + 0.14, (s0 + s1) / 2, s1 - 0.04):
            zr = roof_z(sf, x)
            _bar(mb, P(x, sf, zr + 0.004), P(x, sf, zb), t, mi)
            mb.const_uv = pal('darkgrey')
            rbox(mb, P(x, sf, zr + 0.012), (0.06, 0.09, 0.024), 0.006, seg=1, mat=mi['palette'])
            mb.const_uv = pal('black')
    for sc in (s0 + 0.10, s0 + 0.62, s0 + 1.15, s1):
        zb = roof_z(sc, w / 2) + 0.045
        zt = zb + (h if sc > s0 + 0.3 else 0.0)
        _bar(mb, P(-w / 2, sc, zb), P(w / 2, sc, zb), t, mi)
        if sc > s0 + 0.3:
            _bar(mb, P(-w / 2, sc, zt), P(w / 2, sc, zt), t, mi)
    mb.const_uv = None
    return roof_z(s0, w / 2) + 0.045 + h


def _bar(mb, a, b, t, mi):
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    d = b - a
    L = float(np.linalg.norm(d))
    if L < 1e-4:
        return
    u = d / L
    ref = np.array([0, 0, 1.0]) if abs(u[2]) < 0.9 else np.array([1.0, 0, 0])
    v = np.cross(u, ref)
    v /= np.linalg.norm(v)
    w = np.cross(u, v)
    R = np.stack([u, v, w], axis=1)
    box(mb, (a + b) / 2, (L, t, t), mi['palette'], R=R)


def tank(mb, mi, x, s0, s1, z, r, color, bands=2, label=True):
    L = s1 - s0
    c = P(x, (s0 + s1) / 2, z)
    prof = [(0.0, -L / 2 - r * 0.55)]
    for a in np.linspace(-math.pi / 2, 0, 6)[1:]:
        prof.append((r * math.cos(a), -L / 2 + r * 0.55 * math.sin(a)))
    prof += [(r, L / 2)]
    for a in np.linspace(0, math.pi / 2, 6)[1:]:
        prof.append((r * math.cos(a), L / 2 + r * 0.55 * math.sin(a)))
    mb.const_uv = pal(color)
    lathe(mb, prof, seg=20, axis='Y', center=c, mat=mi['palette'], flip=True)
    mb.const_uv = pal('black')
    for k in range(bands):
        t = (k + 1) / (bands + 1)
        sc = -L / 2 + L * t
        lathe(mb, [(r * 1.02, sc - 0.025), (r * 1.025, sc), (r * 1.02, sc + 0.025)], seg=20, axis='Y', center=c, mat=mi['palette'], flip=True)
    mb.const_uv = None
    if label:
        u0, v0, u1, v1 = pal_rect(7, 2)
        sg = 1.0 if x > 0 else -1.0
        q = np.array([P(x + sg * r * 1.03, s0 + L * 0.40, z - 0.045), P(x + sg * r * 1.03, s0 + L * 0.62, z - 0.045),
                      P(x + sg * r * 1.03, s0 + L * 0.62, z + 0.045), P(x + sg * r * 1.03, s0 + L * 0.40, z + 0.045)])
        uv = np.array([(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
        tri = np.array([(0, 1, 2), (0, 2, 3)])
        n = np.array([sg, 0, 0.0])
        fn = np.cross(q[1] - q[0], q[2] - q[0])
        if np.dot(fn, n) < 0:
            tri = tri[:, ::-1]
        mb.add(q, tri, np.tile(n, (2, 3, 1)), uv[tri], mi['palette'])


def hose(mb, mi, pts, r=0.034, corr=True, color='blue', mat='hose_blue', ring_pitch=0.018):
    pts = np.asarray(pts, float)
    seglen = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    L = float(seglen.sum())
    n = max(20, int(L / (ring_pitch / 2)))
    t = np.concatenate([[0], np.cumsum(seglen)]) / L
    from ecto_common import pchip
    sm = np.linspace(0, 1, n)
    path = np.stack([np.interp(sm, t, pts[:, k]) for k in range(3)], axis=1)
    for _ in range(3):
        path[1:-1] = 0.25 * path[:-2] + 0.5 * path[1:-1] + 0.25 * path[2:]
    radii = np.full(n, r)
    if corr:
        radii = r * (1.0 + 0.10 * np.cos(np.arange(n) * math.pi))
    tube(mb, path, r, seg=10, mat=mi[mat], radii=radii)
    return path


def ladder(mb, mi, s_a, s_b, x_rail, z_top, z_bot, x_bot):
    mb.const_uv = pal('black')
    t = 0.022
    for s in (s_a, s_b):
        p0 = P(x_rail, s, z_top)
        p1 = P(x_rail * 1.0 - 0.01 * np.sign(x_rail), s, z_top + 0.03)
        p2 = P(x_bot * 0.92, s, z_top - 0.12)
        p3 = P(x_bot, s, z_top - 0.30)
        p4 = P(x_bot, s, z_bot)
        _bar(mb, p0, p2, t, mi)
        _bar(mb, p2, p3, t, mi)
        _bar(mb, p3, p4, t, mi)
    zs = np.arange(z_bot + 0.06, z_top - 0.30, 0.26)
    for z in zs:
        _bar(mb, P(x_bot, s_a, z), P(x_bot, s_b, z), t * 0.9, mi)
    _bar(mb, P(x_bot * 0.92, s_a, z_top - 0.12), P(x_bot * 0.92, s_b, z_top - 0.12), t * 0.9, mi)
    mb.const_uv = None


def build_rack(mi):
    body = MB()
    emit = MB()
    beacon = MB()
    beacon_lens = MB()
    S_FB, S_RB = 2.33, 5.05
    light_bar(body, emit, S_FB, mi, 0)
    light_bar(body, emit, S_RB, mi, 2)
    for k, sgn in enumerate((1.0, -1.0)):
        x = sgn * 0.47
        s = S_FB - 0.205
        dome_lamp(body, emit, x, s, roof_z(s, x) + 0.004, mi, 4 + k)
        x = sgn * 0.52
        s = S_RB + 0.205
        dome_lamp(body, emit, x, s, roof_z(s, x) + 0.004, mi, 6 + k)
    S0, S1, W, H = 2.72, 4.84, 1.00, 0.20
    ztop = rack_frame(body, mi, S0, S1, W, H)
    body.const_uv = pal('white')
    rbox(body, P(0.0, 3.80, ztop + 0.085), (0.62, 1.36, 0.17), 0.018, seg=2, mat=mi['palette'])
    body.const_uv = pal('black')
    box(body, P(0.0, 3.80, ztop + 0.065), (0.626, 1.366, 0.030), mi['palette'])
    body.const_uv = None
    u0, v0, u1, v1 = pal_rect(5, 2)
    zt = ztop + 0.172
    q = np.array([P(-0.22, 4.16, zt), P(0.22, 4.16, zt), P(0.22, 4.42, zt), P(-0.22, 4.42, zt)])
    uv = np.array([(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
    tri = np.array([(0, 2, 1), (0, 3, 2)])
    fn = np.cross(q[tri[0, 1]] - q[tri[0, 0]], q[tri[0, 2]] - q[tri[0, 0]])
    if fn[2] < 0:
        tri = tri[:, ::-1]
    body.add(q, tri, np.tile([0, 0, 1.0], (2, 3, 1)), uv[tri], mi['palette'])
    body.const_uv = pal('white')
    rbox(body, P(0.10, 4.29, zt + 0.045), (0.44, 0.24, 0.09), 0.01, seg=1, mat=mi['palette'])
    body.const_uv = None
    for i in range(7):
        box(body, P(0.10, 4.18 + i * 0.035, zt + 0.092), (0.40, 0.012, 0.006), mi['chrome'])
    tx, ts = 0.06, 3.22
    body.const_uv = pal('white')
    lathe(body, [(0.0, 0.0), (0.075, 0.0), (0.075, 0.30), (0.068, 0.315), (0.0, 0.318)], seg=20, axis='Z', center=P(tx, ts, zt), mat=mi['palette'])
    body.const_uv = None
    u0, v0, u1, v1 = pal_rect(0, 2, 2, 1)
    a0, a1 = math.radians(150), math.radians(210)
    ring = []
    for a in np.linspace(a0, a1, 8):
        ring.append(a)
    V = []
    UV = []
    for j, z in enumerate((zt + 0.12, zt + 0.22)):
        for i, a in enumerate(ring):
            V.append(P(tx + 0.0765 * math.sin(a), ts - 0.0765 * math.cos(a), z))
            UV.append((u0 + (u1 - u0) * i / (len(ring) - 1), v0 + (v1 - v0) * j))
    V = np.array(V)
    UV = np.array(UV)
    nr = len(ring)
    tri = []
    for i in range(nr - 1):
        tri += [(i, i + 1, nr + i + 1), (i, nr + i + 1, nr + i)]
    tri = np.array(tri)
    Nn = V - np.array(P(tx, ts, 0))
    Nn[:, 2] = 0
    Nn /= np.linalg.norm(Nn, axis=1, keepdims=True)
    fn = np.cross(V[tri[:, 1]] - V[tri[:, 0]], V[tri[:, 2]] - V[tri[:, 0]])
    if np.sum(fn * Nn[tri[:, 0]]) < 0:
        tri = tri[:, ::-1]
    body.add(V, tri, Nn[tri], UV[tri], mi['palette'])
    zh = zt + 0.318
    body.const_uv = pal('red')
    arm_yaw = math.radians(-118)
    Rz = rmat(rz=arm_yaw) @ rmat(rx=math.radians(24))
    hb = MB()
    hb.const_uv = pal('red')
    rbox(hb, (0.0, 0.0, 0.05), (0.12, 0.16, 0.10), 0.012, seg=1, mat=mi['palette'])
    rbox(hb, (0.0, -0.10, 0.075), (0.08, 0.06, 0.06), 0.01, seg=1, mat=mi['palette'])
    tube(hb, np.array([(0.0, -0.12, 0.075), (0.0, -0.60, 0.075)]), 0.026, seg=12, mat=mi['palette'])
    hb.const_uv = pal('darkred')
    tube(hb, np.array([(0.0, -0.60, 0.075), (0.0, -0.66, 0.075)]), 0.029, seg=12, mat=mi['palette'])
    hb.const_uv = pal('white')
    box(hb, (0.0, 0.0, 0.105), (0.09, 0.10, 0.012), mi['palette'])
    body.extend(hb.transformed(Rz, P(tx, ts, zh)))
    body.const_uv = None
    mx, ms = 0.34, 4.50
    body.const_uv = pal('black')
    zbase = ztop
    for a in (0.0, 2.1, 4.2):
        foot = P(mx + 0.16 * math.cos(a), ms + 0.16 * math.sin(a), zbase - 0.005)
        _bar(body, foot, P(mx, ms, zbase + 0.30), 0.018, mi)
    _bar(body, P(mx, ms, zbase + 0.25), P(mx, ms, zbase + 0.52), 0.026, mi)
    body.const_uv = None
    rz0 = zbase + 0.52
    body.const_uv = pal('white')
    lathe(body, [(0.0, 0.0), (0.075, 0.0), (0.075, 0.20), (0.06, 0.225), (0.0, 0.232)], seg=20, axis='Z', center=P(mx, ms, rz0), mat=mi['palette'])
    body.const_uv = pal('red')
    for zz in (0.05, 0.12):
        lathe(body, [(0.0762, zz), (0.0762, zz + 0.03)], seg=20, axis='Z', center=P(mx, ms, rz0), mat=mi['palette'])
    body.const_uv = pal('yellow')
    box(body, P(mx + 0.0, ms - 0.077, rz0 + 0.095), (0.06, 0.004, 0.035), mi['palette'])
    body.const_uv = None
    dx, ds = -0.16, 4.58
    body.const_uv = pal('black')
    lathe(body, [(0.0, 0.0), (0.05, 0.0), (0.04, 0.02), (0.035, 0.16), (0.06, 0.17), (0.0, 0.18)], seg=16, axis='Z', center=P(dx, ds, ztop - 0.02), mat=mi['palette'])
    dz = ztop + 0.16
    u0, v0, u1, v1 = pal_rect(2, 2, 2, 1)
    nseg = 28
    V = []
    UV = []
    for j, (r, z) in enumerate(((0.205, 0.0), (0.205, 0.035))):
        for i in range(nseg + 1):
            a = 2 * math.pi * i / nseg
            V.append(P(dx + r * math.cos(a), ds + r * math.sin(a), dz + z))
            UV.append((u0 + (u1 - u0) * i / nseg * 3 % (u1 - u0) if False else u0 + (u1 - u0) * (i % 7) / 7.0, v0 + (v1 - v0) * j))
    V = np.array(V)
    UV = np.array(UV)
    tri = []
    for i in range(nseg):
        tri += [(i, i + 1, nseg + 2 + i), (i, nseg + 2 + i, nseg + 1 + i)]
    tri = np.array(tri)
    Nn = V - np.array(P(dx, ds, 0))
    Nn[:, 2] = 0
    Nn /= np.linalg.norm(Nn, axis=1, keepdims=True)
    fn = np.cross(V[tri[:, 1]] - V[tri[:, 0]], V[tri[:, 2]] - V[tri[:, 0]])
    if np.sum(fn * Nn[tri[:, 0]]) < 0:
        tri = tri[:, ::-1]
    body.add(V, tri, Nn[tri], UV[tri], mi['palette'])
    body.const_uv = None
    prof = [(0.198 * math.cos(a), 0.035 + 0.19 * math.sin(a)) for a in np.linspace(0, math.pi / 2, 10)]
    lathe(body, prof, seg=28, axis='Z', center=P(dx, ds, dz), mat=mi['glass'])
    body.const_uv = pal('red')
    tube(body, np.array([P(dx, ds, dz + 0.035), P(dx, ds, dz + 0.20)]), 0.008, seg=6, mat=mi['palette'])
    body.const_uv = None
    sx, ss_ = -0.36, 2.86
    body.const_uv = pal('black')
    box(body, P(sx, ss_ + 0.06, ztop + 0.02), (0.06, 0.10, 0.06), mi['palette'])
    body.const_uv = None
    sp = [(0.0, -0.13), (0.085, -0.13), (0.105, -0.11), (0.108, 0.06), (0.10, 0.09), (0.09, 0.10), (0.0, 0.10)]
    lathe(body, sp, seg=24, axis='Y', center=P(sx, ss_ - 0.02, ztop + 0.12), mat=mi['chrome'], flip=True, R=rmat(rz=math.pi))
    for k in range(5):
        box(body, P(sx, ss_ - 0.14, ztop + 0.12 + (k - 2) * 0.03), (0.15, 0.006, 0.010), mi['gap'])
    bxp, bsp = 0.43, 2.80
    sp2 = [(0.0, -0.20), (0.03, -0.20), (0.07, -0.12), (0.085, -0.02), (0.088, 0.06), (0.084, 0.08), (0.0, 0.085)]
    lathe(body, sp2, seg=24, axis='Y', center=P(bxp, bsp, ztop + 0.10), mat=mi['chrome'], flip=True, R=rmat(rz=math.pi))
    lathe(body, [(0.0, -0.088), (0.078, -0.088), (0.0, -0.094)][::-1], seg=20, axis='Y', center=P(bxp, bsp, ztop + 0.10), mat=mi['lens_clear'])
    body.const_uv = pal('black')
    box(body, P(bxp, bsp + 0.05, ztop + 0.03), (0.05, 0.10, 0.06), mi['palette'])
    box(body, P(0.15, 3.05, ztop + 0.20), (0.11, 0.13, 0.10), mi['palette'])
    body.const_uv = None
    lathe(body, [(0.0, 0.0), (0.03, 0.0), (0.03, 0.02), (0.0, 0.025)], seg=12, axis='Y', center=P(0.15, 2.985, ztop + 0.20), mat=mi['glass'])
    body.const_uv = pal('brass')
    lathe(body, [(0.0, 0.0), (0.035, 0.0), (0.035, 0.09), (0.0, 0.095)], seg=14, axis='Z', center=P(-0.12, 2.95, ztop), mat=mi['palette'])
    body.const_uv = None
    bx_, bs_ = 0.06, 2.88
    bz = ztop
    beacon_pivot = P(bx_, bs_, bz)
    beacon.const_uv = pal('black')
    lathe(beacon, [(0.0, 0.0), (0.04, 0.0), (0.03, 0.05), (0.03, 0.09), (0.0, 0.09)], seg=14, axis='Z', mat=mi['palette'])
    beacon.const_uv = None
    hous = [(0.0, -0.10), (0.06, -0.10), (0.09, -0.07), (0.098, -0.02), (0.096, 0.02), (0.090, 0.03), (0.0, 0.03)]
    lathe(beacon, hous, seg=24, axis='Y', center=(0.0, 0.0, 0.17), mat=mi['chrome'], flip=True, R=rmat(rz=math.pi))
    lens = [(0.086, 0.030), (0.070, 0.042), (0.040, 0.050), (0.0, 0.053)]
    lathe(beacon_lens, lens, seg=24, axis='Y', center=(0.0, 0.0, 0.17), mat=mi['beacon_emit'], flip=True, R=rmat(rz=math.pi))
    tank(body, mi, 0.58, 3.02, 3.44, ztop - 0.07, 0.074, 'yellow')
    tank(body, mi, 0.58, 3.70, 4.12, ztop - 0.07, 0.074, 'yellow')
    body.const_uv = pal('black')
    lathe(body, [(0.0, 0.0), (0.045, 0.0), (0.045, 0.03), (0.0, 0.035)], seg=16, axis='X', center=P(0.585, 3.57, ztop - 0.06), mat=mi['palette'])
    body.const_uv = None
    lathe(body, [(0.0, 0.0), (0.04, 0.0), (0.0, 0.002)], seg=16, axis='X', center=P(0.62, 3.57, ztop - 0.06), mat=mi['lens_clear'])
    tank(body, mi, -0.585, 2.90, 3.95, ztop - 0.08, 0.068, 'green', bands=2)
    for k, so in enumerate((0.0, 0.085)):
        pts = [P(0.50, 4.00 + so, ztop - 0.10), P(0.66, 4.02 + so, ztop - 0.12), P(0.85, 4.05 + so, 1.52), P(0.94, 4.08 + so, 1.30),
               P(0.97, 4.10 + so, 1.08), P(1.02, 4.16 + so, 0.92), P(1.045, 4.20 + so, 0.80), P(1.05, 4.24 + so, 0.73), P(1.03, 4.30 + so, 0.72)]
        hose(body, mi, pts, r=0.032)
    body.const_uv = pal('white')
    for k in (0.0, 0.085):
        for (xx, ss, zz) in ((0.885, 4.06, 1.48), (0.975, 4.12, 1.02)):
            lathe(body, [(0.0, -0.02), (0.040, -0.02), (0.040, 0.02), (0.0, 0.02)], seg=12, axis='Z', center=P(xx, ss + k, zz), mat=mi['palette'])
    body.const_uv = pal('brass')
    for k in (0.0, 0.085):
        lathe(body, [(0.0, 0.0), (0.045, 0.0), (0.045, 0.03), (0.0, 0.03)], seg=14, axis='X', center=P(1.005, 4.30 + k, 0.72), mat=mi['palette'])
    body.const_uv = None
    gpts = [P(-0.50, 4.00, ztop - 0.10), P(-0.70, 4.01, ztop - 0.15), P(-0.88, 4.02, 1.56), P(-0.97, 4.03, 1.30), P(-1.00, 4.04, 1.05), P(-1.045, 4.04, 0.80), P(-1.05, 4.04, 0.62)]
    body.const_uv = pal('lightgrey')
    hose(body, mi, gpts, r=0.022, mat='palette', ring_pitch=0.012)
    body.const_uv = pal('brass')
    lathe(body, [(0.0, 0.0), (0.03, 0.0), (0.03, 0.04), (0.0, 0.045)], seg=12, axis='Z', center=P(-1.05, 4.04, 0.58), mat=mi['palette'])
    body.const_uv = None
    ladder(body, mi, 4.10, 4.42, -0.50, ztop - 0.02, 0.40, -1.065)
    body.const_uv = pal('black')
    for (cx, cs) in ((0.30, 3.55), (-0.25, 4.05), (0.25, 2.95)):
        coil = []
        for t in np.linspace(0, 1, 90):
            a = t * 2 * math.pi * 6
            coil.append(P(cx + 0.03 * math.cos(a), cs + 0.30 * t - 0.15, ztop + 0.03 + 0.03 * math.sin(a)))
        tube(body, np.array(coil), 0.005, seg=5, mat=mi['palette'])
    body.const_uv = None
    return dict(body=body, emit=emit, beacon=beacon, beacon_lens=beacon_lens, beacon_pivot=beacon_pivot,
                siren=P(sx, ss_ - 0.14, ztop + 0.12), ztop=ztop)


def cowl_dome(mi, emit_seg=8):
    body = MB()
    emit = MB()
    s = 2.02
    x = float(D.xsh(s)) - 0.02
    z = float(D.zsh(s))
    lathe(body, [(0.0, 0.0), (0.018, 0.0), (0.012, 0.03), (0.0, 0.035)], seg=12, axis='Z', center=P(x, s, z), mat=mi['chrome'])
    dome_lamp(body, emit, x, s, z + 0.03, mi, emit_seg, r=0.045, stalk=0.04)
    return body, emit
