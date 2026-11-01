# Ecto-1 parts: wheels, bumpers, grille, lamps, chrome trim, mirrors, antennas.
import math
import numpy as np
from ecto_common import (MB, lathe, box, rbox, tube, sweep, grid_mesh, bl, rmat, resample, frames_along, Y_OFF)
import ecto_design as D
import ecto_body as B


def wheel(mats, mirror=False):
    """Wheel in local space: spin axis local X, outer face toward +X (mirror for the right side)."""
    mb = MB()
    R = D.R_TIRE
    w = D.W_TIRE / 2
    tread = [(0.300, -w * 1.02), (0.335, -w * 1.00), (0.352, -w * 0.88), (R, -w * 0.62), (R + 0.002, 0.0), (R, w * 0.62), (0.352, w * 0.88), (0.336, w * 1.0)]
    lathe(mb, [(p[0], p[1]) for p in tread], seg=48, axis='X', mat=mats['rubber'])
    inner_side = [(0.198, -w * 0.80), (0.240, -w * 0.94), (0.290, -w * 1.01), (0.300, -w * 1.02)]
    lathe(mb, inner_side, seg=40, axis='X', mat=mats['rubber'], flip=True)
    ww_out = [(0.336, w * 1.0), (0.318, w * 1.04), (0.300, w * 1.06)]
    lathe(mb, ww_out[::-1], seg=48, axis='X', mat=mats['rubber'], flip=True)
    white = [(0.300, w * 1.06), (0.270, w * 1.075), (0.240, w * 1.07), (0.222, w * 1.05)]
    lathe(mb, white[::-1], seg=48, axis='X', mat=mats['whitewall'], flip=True)
    bead = [(0.222, w * 1.05), (0.208, w * 1.0), (0.199, w * 0.94)]
    lathe(mb, bead[::-1], seg=40, axis='X', mat=mats['rubber'], flip=True)
    cap = [(0.200, w * 0.94), (0.196, w * 1.00), (0.190, w * 1.05), (0.178, w * 1.08), (0.160, w * 1.09), (0.150, w * 1.07),
           (0.138, w * 1.08), (0.120, w * 1.15), (0.095, w * 1.24), (0.070, w * 1.30), (0.050, w * 1.33), (0.030, w * 1.37),
           (0.015, w * 1.40), (0.0, w * 1.41)]
    lathe(mb, cap[::-1], seg=40, axis='X', mat=mats['chrome'], flip=True)
    nrib = 30
    for i in range(nrib):
        a = 2 * math.pi * i / nrib
        Rm = rmat(rx=a)
        box(mb, (w * 1.20, 0.0, 0.112), (0.022, 0.010, 0.070), mats['chrome'], R=Rm @ rmat(ry=-0.30))
    lathe(mb, [(0.0, w * 1.43), (0.040, w * 1.40), (0.045, w * 1.37)][::-1], seg=24, axis='X', mat=mats['chrome'], flip=True)
    lathe(mb, [(0.150, w * 0.5), (0.150, w * 0.9)], seg=24, axis='X', mat=mats['under'])
    if mirror:
        mb = mb.mirrored_x()
    return mb


def _plan_front(x):
    ax = np.abs(np.asarray(x, float))
    return 0.010 + 0.040 * (ax / 0.95) ** 2.2


def front_end(mats):
    """Left half (x >= 0) front end; mirrored by caller. Returns dict of MBs per material group."""
    body = MB()
    chrome = MB()
    head = MB()
    grille_e = MB()
    dark = MB()
    path = []
    for t in np.linspace(0, 1, 26):
        x = 0.0 + 0.985 * t
        path.append((x, float(_plan_front(x)) + 0.012))
    for t in np.linspace(0, 1, 12)[1:]:
        a = t * math.pi / 2
        path.append((0.985 + 0.035 * math.sin(a), 0.052 + 0.012 + 0.10 * (1 - math.cos(a)) + 0.0 * t))
    for s in np.linspace(0.17, 0.33, 6)[1:]:
        path.append((1.020, float(s)))
    P = np.array([bl(x, s, 0.0) for x, s in path])
    upper_prof = [(-0.070, 0.006), (0.000, 0.006), (0.024, 0.012), (0.036, 0.024), (0.030, 0.038), (0.010, 0.046), (-0.070, 0.046)]
    lower_prof = [(-0.10, 0.0), (-0.01, -0.006), (0.032, 0.012), (0.060, 0.055), (0.068, 0.100), (0.062, 0.140), (0.040, 0.172), (0.012, 0.186), (-0.10, 0.186)]
    _sweep_bumper(chrome, P, upper_prof, D.BUMPER_F['z_bar'], mats['chrome'], outward=+1)
    Pl = np.array([bl(x, s - 0.010, 0.0) for x, s in path])
    _sweep_bumper(chrome, Pl[:-3], lower_prof, D.BUMPER_F['z_bot'], mats['chrome'], outward=+1)
    for cx in (0.690, 0.875):
        s0 = float(_plan_front(cx)) - 0.062
        oval(chrome, head, cx, s0, 0.390, 0.180, 0.108, mats)
    z0, z1 = 0.618, 0.748
    _grille(chrome, dark, x0=0.0, x1=0.585, z0=0.574, z1=0.748, s=0.118, cols=13, rows=(0.605, 0.640, 0.675, 0.710), mats=mats)
    _grille(chrome, dark, x0=0.0, x1=0.840, z0=0.425, z1=0.530, s=0.085, cols=18, rows=(0.452, 0.478, 0.504), mats=mats)
    for cx in (D.HL_X[0], D.HL_X[1]):
        headlamp(chrome, head, dark, cx, D.HL_Z, 0.088, mats)
    bezel(chrome, dark, mats)
    for gx in (0.42,):
        lathe(dark, [(0.0, 0.0), (0.034, 0.0), (0.034, 0.024), (0.0, 0.026)], seg=16, axis='Z', center=bl(gx, 0.095, 0.578)[()], mat=mats['gap'])
        lathe(grille_e, [(0.0, 0.024), (0.031, 0.024), (0.032, 0.058), (0.028, 0.074), (0.0, 0.077)], seg=16, axis='Z', center=bl(gx, 0.095, 0.578)[()], mat=mats['grille_emit'])
    lip_s = D.S_HOOD_F
    xs = np.linspace(0.0, 0.705, 30)
    zt = B.deck_z(np.full_like(xs, lip_s + 0.002), xs)
    Plip = []
    for zz in np.linspace(0.748, 1.0, 6):
        row = []
        for x, ztop in zip(xs, zt):
            z = 0.748 + (ztop - 0.748) * (zz - 0.748) / (1.0 - 0.748)
            row.append(bl(x, lip_s + 0.004 * (zz - 0.748) / 0.252 - 0.012 * (1 - (zz - 0.748) / 0.252), z))
        Plip.append(row)
    grid_mesh(body, np.array(Plip), mats['white'], None, flip=False)
    lp = np.array([bl(x, lip_s - 0.014, 0.749) for x in np.linspace(0.0, 0.70, 20)])
    tube(chrome, lp, 0.006, seg=8, mat=mats['chrome'])
    panel = []
    xsF = np.linspace(0.58, 0.955, 12)
    for z in np.linspace(0.46, 0.80, 14):
        row = []
        for x in xsF:
            xo = float(B.side_x(D.S_SIDE_FRONT, z))
            xx = min(x, xo)
            row.append(bl(xx, 0.128 - 0.02 * ((xx - 0.58) / 0.38) ** 2, z))
        panel.append(row)
    grid_mesh(body, np.array(panel), mats['white'], None, flip=True)
    vx = np.linspace(0.0, 0.18, 8)
    vpath = np.array([bl(x, 0.30 + 0.9 * x, float(B.deck_z(0.30 + 0.9 * x, x)) + 0.006) for x in vx])
    sweep(chrome, vpath, [(-0.004, 0.0), (0.0, 0.005), (0.004, 0.0)], mat=mats['chrome'], closed_profile=False)
    brow = np.array([bl(x, 0.022 + 0.004 * ((x - 0.80) / 0.15) ** 2, float(B.deck_z(0.03, x)) - 0.004) for x in np.linspace(0.80, float(D.xsh(0.03)) - 0.004, 10)])
    tube(chrome, brow, 0.006, seg=8, mat=mats['chrome'])
    crest_line = np.array([bl(float(D.xsh(s)) - 0.010, s, float(D.zsh(s)) + 0.003) for s in np.linspace(0.03, 0.55, 14)])
    tube(chrome, crest_line, 0.0065, seg=8, mat=mats['chrome'])
    fin = np.array([bl(float(D.xsh(0.06)) - 0.03, 0.05 + 0.10 * t, float(D.zsh(0.05)) + 0.004 + 0.035 * math.sin(math.pi * t) ** 0.6) for t in np.linspace(0, 1, 10)])
    sweep(chrome, fin, [(-0.004, -0.004), (0.004, -0.004), (0.004, 0.004), (-0.004, 0.004)], mat=mats['chrome'], up=(1, 0, 0), caps=True)
    crest = MB()
    box(crest, bl(0.0, 0.215, float(B.deck_z(0.215, 0.0)) + 0.010)[()], (0.07, 0.03, 0.012), mats['chrome'], R=rmat(rx=-0.25))
    chrome.extend(crest)
    return dict(body=body, chrome=chrome, head=head, dark=dark, grille=grille_e)


def _sweep_bumper(mb, P, prof, z0, mat, outward=1):
    P = np.asarray(P, float)
    T = np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    up = np.array([0, 0, 1.0])
    Nout = np.cross(T, up)
    if np.dot(Nout[0], np.array([0, -1.0, 0])) < 0:
        Nout = -Nout
    G = np.zeros((len(prof), len(P), 3))
    for j, (a, b) in enumerate(prof):
        G[j] = P + Nout * a + up * (z0 + b)
    gu = np.gradient(G, axis=1)
    gv = np.gradient(G, axis=0)
    n = np.cross(gu, gv)
    test = np.sum(n[len(prof) // 2] * Nout)
    grid_mesh(mb, G, mat, None, flip=test < 0)
    for k in (0, len(P) - 1):
        ring = G[:, k]
        c = ring.mean(axis=0)
        V = np.concatenate([ring, c[None]])
        m = len(ring)
        tt = np.array([(i, (i + 1) % m, m) for i in range(m)])
        want = -T[k] if k == 0 else T[k]
        nr = np.cross(V[tt[:, 1]] - V[tt[:, 0]], V[tt[:, 2]] - V[tt[:, 0]])
        if float(np.sum(nr @ want)) < 0:
            tt = tt[:, ::-1]
        mb.add(V, tt, np.tile(want, (len(tt), 3, 1)), None, mat)


def oval(chrome, lens, cx, s, z, w, h, mats, depth=0.05, lens_mat='head', rearward=False):
    seg = 28
    t = np.linspace(0, 2 * math.pi, seg, endpoint=False)
    ex, ez = w / 2 * np.cos(t), h / 2 * np.sin(t)
    sgn = 1.0 if rearward else -1.0
    rings = []
    for k, (sc, ds) in enumerate(((1.10, 0.0), (1.12, 0.012), (1.05, 0.022), (0.92, 0.026), (0.86, 0.018))):
        rings.append(bl(cx + ex * sc, s + sgn * ds + 0 * t, z + ez * sc))
    G = np.array(rings)
    gu = np.roll(G, -1, axis=1) - np.roll(G, 1, axis=1)
    gv = np.gradient(G, axis=0)
    n = np.cross(gu, gv)
    outward = np.sum(n[2] * (G[2] - G[2].mean(axis=0))) > 0
    grid_mesh(chrome, G, mats['chrome'], None, flip=not outward, closed_u=True)
    lp = []
    for sc, ds in ((0.86, 0.018), (0.6, 0.026), (0.0, 0.030)):
        lp.append(bl(cx + ex * sc, s + sgn * ds + 0 * t, z + ez * sc))
    L = np.array(lp)
    gu = np.roll(L, -1, axis=1) - np.roll(L, 1, axis=1)
    gv = np.gradient(L, axis=0)
    n = np.cross(gu, gv)
    want = np.array([0, sgn, 0])
    fl = np.sum(n[1] @ want) < 0
    grid_mesh(lens, L, mats[lens_mat + '_emit'] if lens_mat + '_emit' in mats else mats['head_emit'], None, flip=fl, closed_u=True)


def plate_frame(chrome, dark, mats, s, z, front=True):
    w, h = 0.305, 0.152
    sgn = -1.0 if front else 1.0
    box(chrome, bl(0.0, s + 0.010 * (-sgn), z)[()], (w + 0.05, 0.03, h + 0.04), mats['chrome'])
    box(dark, bl(0.0, s + 0.004 * sgn * -1, z)[()], (w + 0.01, 0.02, h + 0.01), mats['gap'])


def plate_quad(mb, mats, s, z, front=True):
    w, h = 0.305, 0.152
    sgn = -1.0 if front else 1.0
    yy = s - Y_OFF + sgn * 0.0
    if front:
        V = np.array([(-w / 2, yy, z - h / 2), (w / 2, yy, z - h / 2), (w / 2, yy, z + h / 2), (-w / 2, yy, z + h / 2)])
        n = np.array([0, -1.0, 0])
        UV = [(0, 0), (1, 0), (1, 1), (0, 1)]
    else:
        V = np.array([(w / 2, yy, z - h / 2), (-w / 2, yy, z - h / 2), (-w / 2, yy, z + h / 2), (w / 2, yy, z + h / 2)])
        n = np.array([0, 1.0, 0])
        UV = [(0, 0), (1, 0), (1, 1), (0, 1)]
    tris = np.array([(0, 1, 2), (0, 2, 3)])
    fn = np.cross(V[1] - V[0], V[2] - V[0])
    if np.dot(fn, n) < 0:
        tris = tris[:, ::-1]
    UVa = np.array(UV, float)
    mb.add(V, tris, np.tile(n, (2, 3, 1)), UVa[tris], mats['plate'])


def _grille(chrome, dark, x0, x1, z0, z1, s, cols, rows, mats):
    box(dark, bl((x0 + x1) / 2, s + 0.03, (z0 + z1) / 2)[()], (x1 - x0, 0.03, z1 - z0), mats['gap'])
    jew = MB()
    lathe(jew, [(0.0, -0.012), (0.006, -0.010), (0.0075, -0.002), (0.006, 0.004), (0.0, 0.008)], seg=8, axis='Y', mat=mats['chrome'], flip=True)
    xs = np.linspace(x0 + (x1 - x0) / (2 * cols), x1 - (x1 - x0) / (2 * cols), cols)
    for z in rows:
        box(chrome, bl((x0 + x1) / 2, s + 0.004, z)[()], (x1 - x0, 0.010, 0.0035), mats['chrome'])
        for x in xs:
            chrome.extend(jew.transformed(rmat(rz=math.pi), bl(x, s - 0.006, z)[()]))
    for x in xs:
        box(chrome, bl(x, s + 0.010, (z0 + z1) / 2)[()], (0.0035, 0.012, z1 - z0), mats['chrome'])
    for z in (z0 + 0.004, z1 - 0.004):
        box(chrome, bl((x0 + x1) / 2, s - 0.002, z)[()], (x1 - x0, 0.02, 0.008), mats['chrome'])


def headlamp(chrome, head, dark, cx, cz, s, mats):
    r = D.HL_D / 2
    ring = [(r + 0.012, -0.012), (r + 0.014, 0.000), (r + 0.010, 0.008), (r + 0.002, 0.010), (r - 0.002, 0.004)]
    lathe(chrome, [(a, -b) for a, b in ring], seg=32, axis='Y', center=bl(cx, s, cz)[()], mat=mats['chrome'])
    lens = [(r - 0.001, 0.004), (r * 0.8, -0.006), (r * 0.5, -0.011), (0.0, -0.013)]
    lathe(head, [(a, b) for a, b in lens][::-1], seg=32, axis='Y', center=bl(cx, s + 0.006, cz)[()], mat=mats['head_emit'], flip=False)


def bezel(chrome, dark, mats):
    cx = (D.HL_X[0] + D.HL_X[1]) / 2
    w = D.HL_X[1] - D.HL_X[0] + D.HL_D + 0.030
    h = D.HL_D + 0.040
    seg = 40
    t = np.linspace(0, 2 * math.pi, seg, endpoint=False)
    cs, sn = np.cos(t), np.sin(t)
    ex = np.sign(cs) * np.abs(cs) ** 0.45 * w / 2
    ez = np.sign(sn) * np.abs(sn) ** 0.55 * h / 2
    rings = []
    for sc, ds in ((1.0, 0.0), (1.02, -0.016), (0.97, -0.030), (0.90, -0.026), (0.88, 0.0), (0.88, 0.030)):
        rings.append(bl(cx + ex * sc, 0.088 + ds + 0 * t, D.HL_Z + ez * sc))
    G = np.array(rings)
    gu = np.roll(G, -1, axis=1) - np.roll(G, 1, axis=1)
    gv = np.gradient(G, axis=0)
    n = np.cross(gu, gv)
    outward = np.sum(n[1] * (G[1] - G[1].mean(axis=0))) > 0
    grid_mesh(chrome, G, mats['chrome'], None, flip=not outward, closed_u=True)
    box(dark, bl(cx, 0.122, D.HL_Z)[()], (w * 0.86, 0.02, h * 0.86), mats['gap'])


def rear_end(mats):
    chrome = MB()
    tail = MB()
    dark = MB()
    body = MB()
    path = []
    for t in np.linspace(0, 1, 22):
        x = 0.90 * t
        path.append((x, 6.272 - 0.02 * t ** 2))
    for t in np.linspace(0, 1, 10)[1:]:
        a = t * math.pi / 2
        path.append((0.90 + 0.115 * math.sin(a), 6.252 - 0.17 * (1 - math.cos(a))))
    for s in np.linspace(6.08, 5.92, 5)[1:]:
        path.append((1.015, float(s)))
    P = np.array([bl(x, s, 0.0) for x, s in path])
    prof = [(-0.32, 0.0), (0.0, 0.0), (0.030, 0.015), (0.045, 0.060), (0.048, 0.150), (0.044, 0.250), (0.030, 0.290), (0.012, 0.305), (-0.32, 0.305)]
    _sweep_bumper_rear(chrome, P, prof, D.BUMPER_R['z_bot'], mats['chrome'])
    cx, cz = 0.815, 0.528
    pod = [(0.0, 0.0), (0.070, 0.0), (0.104, 0.030), (0.118, 0.080), (0.118, 0.150), (0.106, 0.192), (0.090, 0.206)]
    lathe(chrome, [(r, h) for r, h in pod], seg=36, axis='Y', center=bl(cx, 6.150, cz)[()], mat=mats['chrome'], flip=True)
    lens = [(0.088, 0.200), (0.070, 0.193), (0.040, 0.188), (0.0, 0.186)]
    lathe(dark, [(r, h) for r, h in lens][::-1], seg=28, axis='Y', center=bl(cx, 6.150, cz)[()], mat=mats['lens_clear'], flip=False)
    lathe(dark, [(0.035, 0.150), (0.030, 0.168), (0.0, 0.170)], seg=16, axis='Y', center=bl(cx, 6.150, cz - 0.055)[()], mat=mats['gap'])
    hz0 = D.BUMPER_R['z_top']
    hp = np.array([bl(0.915, 6.205 + 0.04 * ((z - hz0) / 0.30), z) for z in np.linspace(hz0 - 0.01, 0.955, 12)])
    sweep(chrome, hp, [(-0.035, -0.020), (0.0, -0.028), (0.035, -0.020), (0.045, 0.0), (0.035, 0.012), (-0.035, 0.012), (-0.045, 0.0)], mat=mats['chrome'], up=(1, 0, 0))
    spear = np.array([bl(0.972 - 0.018 * t, 5.55 + 0.70 * t, 0.978 + 0.008 * t) for t in np.linspace(0, 1, 20)])
    rad = 0.004 + 0.028 * np.linspace(0, 1, 20) ** 0.7
    tube(chrome, spear, 0.02, seg=14, mat=mats['chrome'], radii=rad)
    for (bz, bs, bx) in ((1.000, 6.262, 0.945), (0.946, 6.240, 0.950)):
        base = bl(bx, bs, bz)[()]
        ribs = [(0.032, -0.050), (0.034, -0.040), (0.031, -0.034), (0.034, -0.028), (0.031, -0.022), (0.034, -0.016), (0.031, -0.010), (0.034, -0.004), (0.030, 0.0)]
        lathe(chrome, ribs, seg=20, axis='Y', center=base, mat=mats['chrome'], flip=True)
        bullet = [(0.030, 0.0), (0.029, 0.020), (0.024, 0.045), (0.015, 0.068), (0.004, 0.084), (0.0, 0.087)]
        lathe(tail, bullet, seg=20, axis='Y', center=base, mat=mats['tail_emit'], flip=True)
    return dict(chrome=chrome, tail=tail, dark=dark, body=body)


def _sweep_bumper_rear(mb, P, prof, z0, mat):
    P = np.asarray(P, float)
    T = np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    up = np.array([0, 0, 1.0])
    Nout = np.cross(up, T)
    if np.dot(Nout[0], np.array([0, 1.0, 0])) < 0:
        Nout = -Nout
    G = np.zeros((len(prof), len(P), 3))
    for j, (a, b) in enumerate(prof):
        G[j] = P + Nout * a + up * (z0 + b)
    gu = np.gradient(G, axis=1)
    gv = np.gradient(G, axis=0)
    n = np.cross(gu, gv)
    test = np.sum(n[len(prof) // 2] * Nout)
    grid_mesh(mb, G, mat, None, flip=test < 0)
    k = len(P) - 1
    ring = G[:, k]
    c = ring.mean(axis=0)
    V = np.concatenate([ring, c[None]])
    m = len(ring)
    tt = np.array([(i, (i + 1) % m, m) for i in range(m)])
    want = T[k]
    nr = np.cross(V[tt[:, 1]] - V[tt[:, 0]], V[tt[:, 2]] - V[tt[:, 0]])
    if float(np.sum(nr @ want)) < 0:
        tt = tt[:, ::-1]
    mb.add(V, tt, np.tile(want, (len(tt), 3, 1)), None, mat)


def side_trims(mats):
    """Left side chrome: rocker, belt, red band edge, fin flash moulding, fin edge, drip rail. Returns (body, door_f)."""
    body = MB()
    door = MB()
    g = D.GAP

    def on_side(ss, zz, out=0.0):
        P = B.side_f(ss, zz)
        N = B.SIDE.nrm(np.stack([ss, zz], 1))
        return P + N * out, N

    def strip(mb, ss, zz, width, height, mat, prof='half'):
        P, N = on_side(ss, zz)
        if prof == 'half':
            pr = [(-width / 2, 0.0), (-width / 2 + 0.001, height * 0.7), (0.0, height), (width / 2 - 0.001, height * 0.7), (width / 2, 0.0)]
        else:
            pr = [(-width / 2, 0.0), (-width / 2, height), (width / 2, height), (width / 2, 0.0)]
        T = np.gradient(P, axis=0)
        T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)
        Bv = np.cross(N, T)
        Bv /= np.maximum(np.linalg.norm(Bv, axis=1, keepdims=True), 1e-9)
        G = np.array([P + Bv * a + N * (b - 0.0005) for a, b in pr])
        gu = np.gradient(G, axis=1)
        gv = np.gradient(G, axis=0)
        n = np.cross(gu, gv)
        fl = np.sum(n[len(pr) // 2] * N) < 0
        grid_mesh(mb, G, mat, None, flip=fl)

    def split_doors(s0, s1, zfun, width, height, mat, prof='half'):
        cuts = [(s0, D.DOOR_F['s0'] - g), (D.DOOR_F['s0'] + g, D.DOOR_F['s1'] - g), (D.DOOR_F['s1'] + g, D.DOOR_R['s1'] - g), (D.DOOR_R['s1'] + g, s1)]
        for a, b in cuts:
            a2, b2 = max(a, s0), min(b, s1)
            if b2 - a2 < 0.01:
                continue
            ss = np.linspace(a2, b2, max(3, int((b2 - a2) / 0.03)))
            zz = zfun(ss)
            target = door if (a2 >= D.DOOR_F['s0'] and b2 <= D.DOOR_F['s1']) else body
            strip(target, ss, zz, width, height, mat, prof)
    split_doors(1.26, 4.27, lambda s: np.full_like(s, 0.318), 0.022, 0.006, mats['chrome'])
    split_doors(D.S_RED0, D.FLASH[0][0], lambda s: D.red_bottom(s), 0.007, 0.0025, mats['chrome'])
    ss = np.linspace(D.FLASH[0][0] + g, D.FLASH[1][0] - 0.004, 40)
    strip(body, ss, D.red_bottom(ss), 0.009, 0.003, mats['chrome'])
    split_doors(2.075, 4.13, lambda s: D.zsh(s) - 0.004, 0.007, 0.003, mats['chrome'])
    ss = np.linspace(4.13 + g, D.S_FIN_TIP - 0.01, 50)
    strip(body, ss, D.zsh(ss) - 0.0045, 0.008, 0.003, mats['chrome'])
    ss = np.linspace(5.15, 6.10, 20)
    strip(body, ss, np.full_like(ss, 0.0) + D.zb(ss) + 0.035, 0.020, 0.005, mats['chrome'])
    dr = []
    for s in np.linspace(2.02, 5.86, 90):
        x, z = B.roof_point(s, 0.06)
        dr.append(bl(x + 0.004, s, z + 0.004)[()])
    tube(body, np.array(dr), 0.0065, seg=8, mat=mats['chrome'])
    return body, door


def door_handles(mats):
    body = MB()
    door = MB()
    for s, target in ((2.86, door), (4.02, body)):
        z = float(D.zsh(s)) - 0.115
        P = B.side_f(np.array([s]), np.array([z]))[0]
        N = B.SIDE.nrm(np.array([[s, z]]))[0]
        path = np.array([P + N * (0.004 + 0.012 * math.sin(math.pi * t)) + np.array([0, -0.085 * t, 0]) for t in np.linspace(0, 1, 10)])
        tube(target, path, 0.0065, seg=8, mat=mats['chrome'])
        lathe(target, [(0.0, 0.0), (0.011, 0.0), (0.011, 0.006), (0.0, 0.008)], seg=12, axis='X', center=(P + N * 0.0 + np.array([0, -0.045, -0.030])), mat=mats['chrome'])
    return body, door


def mirror_assy(mats, side='L'):
    mb = MB()
    s = 2.12
    z = float(D.zsh(s)) + 0.005
    x = float(D.xsh(s))
    base = bl(x, s, z)[()]
    tube(mb, np.array([base, base + np.array([0.04, 0.0, 0.07]), base + np.array([0.075, 0.01, 0.10])]), 0.008, seg=8, mat=mats['chrome'])
    c = base + np.array([0.085, 0.015, 0.125])
    lathe(mb, [(0.0, -0.025), (0.045, -0.02), (0.052, 0.0), (0.048, 0.012), (0.0, 0.016)], seg=20, axis='Y', center=c, mat=mats['chrome'], R=rmat(rz=0.25))
    return mb


def antenna(mats, base_s, base_x_sign, tip, side_z=None):
    mb = MB()
    s = base_s
    z = float(D.zsh(s)) - 0.002 if side_z is None else side_z
    x = float(D.xsh(s)) - 0.02
    p0 = bl(x * base_x_sign, s, z)[()]
    lathe(mb, [(0.0, 0.0), (0.016, 0.0), (0.016, 0.010), (0.010, 0.016), (0.0, 0.02)], seg=12, axis='Z', center=p0, mat=mats['chrome'])
    spring = []
    for t in np.linspace(0, 1, 60):
        a = t * 2 * math.pi * 10
        spring.append(p0 + np.array([0.008 * math.cos(a), 0.008 * math.sin(a), 0.02 + 0.10 * t]))
    tube(mb, np.array(spring), 0.0025, seg=5, mat=mats['chrome'])
    p1 = p0 + np.array([0, 0, 0.12])
    tip = np.asarray(tip, float)
    mid = (p1 + tip) / 2 + np.array([0, 0, 0.55])
    path = []
    for t in np.linspace(0, 1, 30):
        q = (1 - t) ** 2 * p1 + 2 * (1 - t) * t * mid + t * t * tip
        path.append(q)
    tube(mb, np.array(path), 0.0022, seg=5, mat=mats['chrome'])
    return mb
