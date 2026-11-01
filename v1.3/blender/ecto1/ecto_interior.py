# Ecto-1 interior: cabin, dash, bench seat, steering wheel, equipment cabinet, cargo bay, slide-out pack tray + swing rack.
import math
import numpy as np
from ecto_common import MB, lathe, box, rbox, tube, sweep, grid_mesh, bl, rmat, Y_OFF
import ecto_design as D
import ecto_body as B

FLOOR_F = 0.330
FLOOR_R = 0.650
SEAT_S = 2.80
WHEEL_HUB = (0.395, 2.335, 0.905)
WHEEL_TILT = math.radians(27.0)
TRAY = dict(x=0.0, s_rest0=3.200, s_rest1=5.950, z_top=0.672, travel=2.040, pivot_s=5.200, width=0.40)
RACK = dict(y0=-1.230, y1=0.710, z_saddle=0.700, swing_deg=90.0)
SLOT_X = (0.98, 0.50, 0.02, -0.46)
PACK = dict(w=0.46, h=0.72, d=0.30)


def P(x, s, z):
    return bl(x, s, z)[()]


def textured_quad(mb, corners, uv, mat, normal):
    V = np.asarray(corners, float)
    UV = np.asarray(uv, float)
    tri = np.array([(0, 1, 2), (0, 2, 3)])
    fn = np.cross(V[1] - V[0], V[2] - V[0])
    if np.dot(fn, normal) < 0:
        tri = tri[:, ::-1]
    mb.add(V, tri, np.tile(normal, (2, 3, 1)), UV[tri], mat)


def cabin(mi):
    body = MB()
    emit = MB()
    xs = np.linspace(-0.93, 0.93, 6)
    ss = np.linspace(1.74, 3.20, 8)
    S, X = np.meshgrid(ss, xs)
    grid_mesh(body, bl(X, S, np.full_like(S, FLOOR_F)), mi['carpet'], None, flip=True)
    tunnel = [(-0.16, 0.0), (-0.12, 0.10), (0.12, 0.10), (0.16, 0.0)]
    path = np.array([P(0.0, s, FLOOR_F) for s in np.linspace(1.80, 3.20, 6)])
    sweep(body, path, [(a, b) for b, a in tunnel], mat=mi['carpet'], up=(0, 0, 1), closed_profile=False)
    fw = []
    for z in np.linspace(FLOOR_F, 0.80, 5):
        row = []
        for x in np.linspace(-0.93, 0.93, 6):
            row.append(P(x, 1.76 - 0.06 * (z - FLOOR_F) / 0.47, z))
        fw.append(row)
    grid_mesh(body, np.array(fw), mi['carpet'], None, flip=True)
    dash_top = []
    for t in np.linspace(0, 1, 6):
        row = []
        for x in np.linspace(-0.93, 0.93, 21):
            s0 = D.S_WB_C + (D.S_APB - D.S_WB_C) * min(abs(x) / D.X_APB, 1.0) ** 3 + 0.03
            s1 = 2.12
            s = s0 + (s1 - s0) * t
            z = 0.955 - 0.02 * t ** 2
            row.append(P(x, s, z))
        dash_top.append(row)
    grid_mesh(body, np.array(dash_top), mi['interior'], None, flip=False)
    face = []
    for z in np.linspace(0.915, 0.70, 6):
        row = []
        for x in np.linspace(-0.93, 0.93, 21):
            row.append(P(x, 2.12 + 0.12 * (0.915 - z) ** 1.3, z))
        face.append(row)
    grid_mesh(body, np.array(face), mi['interior'], None, flip=False)
    tube(body, np.array([P(x, 2.125, 0.885) for x in np.linspace(-0.90, 0.90, 12)]), 0.008, seg=8, mat=mi['chrome'])
    gx0, gx1, gz0, gz1 = 0.12, 0.70, 0.80, 0.885
    textured_quad(emit, [P(gx0, 2.118, gz0), P(gx1, 2.118, gz0), P(gx1, 2.118, gz1), P(gx0, 2.118, gz1)],
                  [(1, 0), (0, 0), (0, 1), (1, 1)], mi['dash'], np.array([0, 1.0, 0]))
    box(body, P(-0.40, 2.13, 0.83), (0.42, 0.012, 0.10), mi['chrome'])
    box(body, P(0.0, 2.15, 0.76), (0.30, 0.03, 0.06), mi['chrome'])
    for side in (1.0, -1.0):
        x = side * 0.40
        cush = MB()
        rbox(cush, P(x * 0.0 + side * 0.375, SEAT_S, 0.600), (0.73, 0.52, 0.15), 0.05, seg=2, mat=mi['vinyl'])
        body.extend(cush)
        Rb = rmat(rx=math.radians(-14))
        rbox(body, P(side * 0.375, SEAT_S + 0.30, 0.900), (0.73, 0.12, 0.56), 0.05, seg=2, mat=mi['vinyl'], R=Rb)
        for k in range(5):
            xk = side * (0.06 + k * 0.14)
            box(body, P(xk, SEAT_S + 0.235 + 0.0, 0.92), (0.012, 0.012, 0.42), mi['gap'], R=Rb)
            box(body, P(xk, SEAT_S - 0.02, 0.677), (0.012, 0.42, 0.010), mi['gap'])
    cab_s0, cab_s1 = 3.18, 3.42
    box(body, P(0.0, (cab_s0 + cab_s1) / 2, (FLOOR_R + 1.36) / 2 - 0.15), (1.80, cab_s1 - cab_s0, 1.36 - FLOOR_R + 0.30), mi['interior'])
    textured_quad(body, [P(0.86, cab_s1 + 0.002, 0.72), P(-0.86, cab_s1 + 0.002, 0.72), P(-0.86, cab_s1 + 0.002, 1.30), P(0.86, cab_s1 + 0.002, 1.30)],
                  [(0, 0), (1, 0), (1, 0.5), (0, 0.5)], mi['equip'], np.array([0, 1.0, 0]))
    for side in (1.0, -1.0):
        x = side * 0.902
        textured_quad(body, [P(x, cab_s0, 0.72), P(x, cab_s1, 0.72), P(x, cab_s1, 1.30), P(x, cab_s0, 1.30)],
                      [(0, 0.5), (0.25, 0.5), (0.25, 1.0), (0, 1.0)], mi['equip'], np.array([side, 0, 0]))
    textured_quad(body, [P(-0.86, cab_s0 - 0.002, 1.0), P(0.86, cab_s0 - 0.002, 1.0), P(0.86, cab_s0 - 0.002, 1.32), P(-0.86, cab_s0 - 0.002, 1.32)],
                  [(0.25, 0.5), (1.0, 0.5), (1.0, 0.75), (0.25, 0.75)], mi['equip'], np.array([0, -1.0, 0]))
    xs = np.linspace(-0.93, 0.93, 6)
    ss = np.linspace(cab_s1, 5.96, 10)
    S, X = np.meshgrid(ss, xs)
    grid_mesh(body, bl(X, S, np.full_like(S, FLOOR_R)), mi['interior'], None, flip=True)
    for side in (1.0, -1.0):
        rows = []
        for z in np.linspace(FLOOR_R - 0.02, 0.97, 5):
            row = []
            for s in np.linspace(cab_s1, 5.96, 12):
                xo = float(B.side_x(s, min(z, float(D.zsh(s)) - 0.02))) - 0.035
                row.append(P(side * xo, s, z))
            rows.append(row)
        grid_mesh(body, np.array(rows), mi['interior'], None, flip=side > 0)
        for cs in (D.S_RA,):
            G = np.array([[P(side * 0.62, cs + 0.44 * math.cos(a), 0.31 + 0.44 * math.sin(a)) for a in np.linspace(0.12, math.pi - 0.12, 12)],
                          [P(side * 0.95, cs + 0.44 * math.cos(a), 0.31 + 0.44 * math.sin(a)) for a in np.linspace(0.12, math.pi - 0.12, 12)]])
            grid_mesh(body, G, mi['interior'], None, flip=side < 0)
    ss = np.linspace(2.02, 5.80, 30)
    th = np.linspace(0.05, math.pi / 2, 10)
    Sg, Tg = np.meshgrid(ss, th)
    x, z = B.roof_point(Sg, Tg)
    for side in (1.0, -1.0):
        Pr = bl(side * (x - 0.03), Sg, z - 0.035)
        grid_mesh(body, Pr, mi['interior'], None, flip=side > 0)
    for side in (1.0, -1.0):
        rail = np.array([P(side * TRAY['width'] * 0.43, s, FLOOR_R + 0.012) for s in np.linspace(cab_s1 + 0.05, 5.97, 4)])
        sweep(body, rail, [(-0.012, -0.018), (0.012, -0.018), (0.012, 0.018), (-0.012, 0.018)], mat=mi['steel'], up=(0, 0, 1), caps=True)
    lathe(emit, [(0.0, 0.0), (0.09, 0.0), (0.085, -0.02), (0.0, -0.025)], seg=16, axis='Z', center=P(0.0, 3.80, 1.55), mat=mi['int_emit'])
    for k, (x, s, z) in enumerate(((0.30, 3.425, 1.10), (-0.20, 3.425, 1.05), (0.55, 3.425, 0.90), (-0.60, 3.425, 1.20))):
        box(emit, P(x, s, z), (0.05, 0.004, 0.012), mi['int_emit'])
    return body, emit


def door_inner(mi):
    mb = MB()
    rows = []
    for z in np.linspace(0.37, 0.93, 6):
        row = []
        for s in np.linspace(1.87, 2.955, 10):
            xo = float(B.side_x(s, min(z, float(D.zsh(s)) - 0.02))) - 0.07
            row.append(P(xo, s, z))
        rows.append(row)
    grid_mesh(mb, np.array(rows), mi['vinyl'], None, flip=True)
    rbox(mb, P(0.86, 2.55, 0.72), (0.06, 0.55, 0.05), 0.015, seg=1, mat=mi['interior'])
    tube(mb, np.array([P(0.875, 2.25, 0.80), P(0.865, 2.33, 0.81)]), 0.008, seg=6, mat=mi['chrome'])
    return mb


def steering_wheel(mi):
    """Local frame: wheel in local XZ plane, column along local +Y toward the driver; origin = hub."""
    mb = MB()
    R = 0.228
    r = 0.0125
    ring = np.array([(R * math.cos(a), 0.0, R * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 49)])
    tube(mb, ring, r, seg=10, mat=mi['interior'], closed=True, caps=False)
    hr = np.array([(0.16 * math.cos(a), 0.035, 0.16 * math.sin(a) - 0.01) for a in np.linspace(math.radians(200), math.radians(340), 20)])
    tube(mb, hr, 0.006, seg=8, mat=mi['chrome'])
    for a in (math.radians(200), math.radians(340)):
        sp = np.array([(0.03 * math.cos(a), 0.03, 0.03 * math.sin(a)), (R * 0.97 * math.cos(a), 0.0, R * 0.97 * math.sin(a))])
        sweep(mb, sp, [(-0.006, -0.018), (0.006, -0.018), (0.006, 0.018), (-0.006, 0.018)], mat=mi['interior'], up=(0, 1, 0), caps=True)
    lathe(mb, [(0.0, -0.02), (0.055, -0.02), (0.06, 0.02), (0.045, 0.045), (0.0, 0.05)], seg=20, axis='Y', mat=mi['chrome'])
    lathe(mb, [(0.032, -0.35), (0.032, -0.02)], seg=12, axis='Y', mat=mi['interior'])
    return mb


def pack_tray(mi):
    """PackTray (telescoping beam, slides along +s = glTF -Z) and PackTray2 (swing rack on a turntable), car coords."""
    tray = MB()
    rack = MB()
    w = TRAY['width']
    zt = TRAY['z_top']
    s0, s1 = TRAY['s_rest0'], TRAY['s_rest1']
    L = s1 - s0
    sm = 0.5 * (s0 + s1)
    box(tray, P(0.0, sm, zt - 0.010), (w, L, 0.020), mi['steel'])
    for side in (1.0, -1.0):
        box(tray, P(side * (w / 2 - 0.01), sm, zt + 0.006), (0.02, L, 0.012), mi['steel'])
        box(tray, P(side * (w / 2 - 0.035), sm, zt - 0.035), (0.03, L, 0.03), mi['interior'])
    box(tray, P(0.0, s1 - 0.015, zt + 0.02), (w, 0.03, 0.04), mi['steel'])
    tube(tray, np.array([P(-0.14, s1 + 0.005, zt + 0.02), P(-0.12, s1 + 0.06, zt + 0.02), P(0.12, s1 + 0.06, zt + 0.02), P(0.14, s1 + 0.005, zt + 0.02)]), 0.011, seg=8, mat=mi['chrome'])
    sp = TRAY['pivot_s']
    lathe(rack, [(0.0, 0.0), (0.17, 0.0), (0.17, 0.012), (0.0, 0.012)], seg=24, axis='Z', center=P(0.0, sp, zt), mat=mi['steel'])
    zs = RACK['z_saddle']
    y0, y1 = RACK['y0'], RACK['y1']
    box(rack, P(0.0, sp + 0.5 * (y0 + y1), zs - 0.012), (0.12, y1 - y0, 0.020), mi['interior'])
    for xk in SLOT_X:
        yk = -xk
        box(rack, P(0.0, sp + yk, zs - 0.004), (0.34, 0.44, 0.010), mi['steel'])
        box(rack, P(-0.165, sp + yk, zs + 0.14), (0.012, 0.40, 0.28), mi['interior'])
        for side in (1.0, -1.0):
            box(rack, P(0.02, sp + yk + side * 0.225, zs + 0.03), (0.30, 0.012, 0.06), mi['steel'])
        rbox(rack, P(0.17, sp + yk, zs + 0.025), (0.02, 0.30, 0.05), 0.006, seg=1, mat=mi['interior'])
    return tray, rack


def pack_slot_local(k):
    """Pack root pose for slot k (0..3) relative to the PackTray2 origin (pivot at tray top), Blender local, stored state."""
    yk = -SLOT_X[k]
    return (PACK['d'] / 2, yk, RACK['z_saddle'] + PACK['h'] / 2 - TRAY['z_top']), (0.0, 0.0, math.radians(90))
