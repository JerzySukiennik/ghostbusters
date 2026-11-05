# Firehouse (Hook & Ladder 8 as in Ghostbusters 1984): Blender -b -t 2 -P blender/landmarks/fh_build.py -- [--no-bake] [--out path]
import os
import sys
import math
import json
import time
import importlib
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import bpy
import lm_core
importlib.reload(lm_core)
from lm_core import MB, mat, rect, arch_outline, circle2d, band_wall, new_empty, group, make_object, hull_object, box_pts, ATLAS, to_bl

ROOT = lm_core.ROOT
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
BAKE = '--no-bake' not in ARGS
OUT = os.path.join(ROOT, 'assets/landmarks/firehouse.glb')
if '--out' in ARGS:
    OUT = ARGS[ARGS.index('--out') + 1]

W2 = 4.3
D = 30.0
LOT_W = 16.0
LOT_X = W2 - LOT_W / 2
HN = 18.6
XI0, XI1 = -3.9, 3.85
ZI0, ZI1 = -0.6, -(D - 0.4)
G_CEIL = 5.6
U_FLOOR = 6.0
U_CEIL = 9.8
B_FLOOR = -3.6
B_CEIL = -0.35
B_Z0 = -12.0
ROOF = 15.25
PARAPET = 16.2
ARCH = dict(x0=-1.75, x1=1.75, spring=3.1)
ARCH_TOP = ARCH['spring'] + 1.75
POLE = (-2.9, -8.6)
STAIR = dict(x0=-3.9, x1=-2.75, zb=-11.2, zt=-17.96, n=27)
BSTAIR = dict(x0=2.7, x1=3.85, zt=-24.4, zb=-20.5, n=16)
SIDE_G = [('win', -5.2), ('door', -10.5), ('win', -16.5), ('win', -21.6), ('win', -25.9), ('door', -28.5)]
SIDE_BAYS = [-5.5, -12.5, -18.75, -24.0, -28.4]
LOG = []


def log(*a):
    s = ' '.join(str(x) for x in a)
    LOG.append(s)
    print(s)


def materials():
    G = 0.822
    gc = lambda c: tuple(round(x / G, 4) for x in c)
    mat('X_Stone', tex='stone')
    mat('X_Brick', tex='brick')
    mat('X_CBrick', tex='cbrick')
    mat('X_Paint', tex='grunge', use_nor=False)
    mat('X_Glass', color=(0.012, 0.014, 0.018), rough=0.06)
    mat('X_Atlas', atlas=True, alpha='MASK', rough=0.6)
    mat('X_SignEmit', atlas=True, alpha='MASK', emit_tex=True, emit_strength=0.9, rough=0.4, double=True)
    mat('DoorGlassEmit', color=(0.04, 0.045, 0.05), rough=0.15, emit=(0.95, 0.7, 0.4), emit_strength=0.07, double=True)
    mat('X_WinEmit', atlas=True, emit_tex=True, emit_strength=1.25, rough=0.3)
    mat('I_Grunge', tex='grunge', use_nor=False, baked=True)
    mat('I_Metal', color=(1.0, 1.0, 1.0), rough=0.28, metal=1.0, baked=True, albedo=(0.75, 0.75, 0.75))
    mat('I_Oak', tex='oak', use_nor=False, baked=True)
    mat('I_Conc', tex='conc', baked=True)
    mat('I_Glazed', tex='glazed', baked=True)
    mat('I_Tin', tex='tin', baked=True)
    mat('I_Floor', tex='floor', baked=True)
    mat('I_Block', tex='block', baked=True)
    mat('I_Diamond', tex='diamond', baked=True)
    mat('I_Atlas', atlas=True, rough=0.6, baked=True, albedo=(0.6, 0.58, 0.55))
    mat('I_LightEmit', atlas=True, emit_tex=True, emit_strength=6.0, rough=0.4)
    mat('I_TubeEmit', atlas=True, emit_tex=True, emit_strength=1.0, rough=0.4)
    mat('I_PanelEmit', atlas=True, emit_tex=True, emit_strength=2.0, rough=0.3)
    mat('ECU_LightEmit', atlas=True, emit_tex=True, emit_strength=1.0, rough=0.25)
    mat('ECU_DoorEmit', color=(0.3, 0.25, 0.2), emit=(1.0, 0.55, 0.25), emit_strength=1.0)

    mat('Ext_Stone', phys='X_Stone', tile=2.2)
    mat('Ext_StoneDark', phys='X_Stone', tile=2.2, vt=(0.52, 0.52, 0.54))
    mat('Ext_Cartouche', phys='X_Stone', tile=0.8, vt=(0.3, 0.27, 0.24))
    mat('Ext_Brick', phys='X_Brick', tile=(1.0, 1.0))
    mat('Ext_BrickN', phys='X_Brick', tile=(1.0, 1.0), vt=(0.55, 0.42, 0.36))
    mat('Ext_CommonBrick', phys='X_CBrick', tile=(1.3, 1.3), vt=(0.8, 0.78, 0.76))
    mat('Ext_ArchPaint', phys='X_Paint', tile=0.8, vt=gc((0.3, 0.032, 0.026)))
    mat('Door_Paint', phys='X_Paint', tile=0.8, vt=(0.3, 0.04, 0.032))
    mat('Ext_WinFrame', phys='X_Paint', tile=0.7, vt=gc((0.6, 0.58, 0.52)))
    mat('Ext_Iron', phys='X_Paint', tile=0.7, vt=gc((0.02, 0.02, 0.02)))
    mat('Ext_Roof', phys='X_Paint', tile=1.5, vt=gc((0.06, 0.06, 0.065)))
    mat('Ext_Bollard', phys='X_Paint', tile=0.6, vt=(0.78, 0.52, 0.03))
    mat('Ext_Plaque', phys='X_Paint', tile=0.6, vt=gc((0.32, 0.22, 0.1)))
    mat('Ext_SignMetal', phys='X_Paint', tile=0.6, vt=gc((0.75, 0.74, 0.7)))
    mat('Door_Brass', phys='X_Paint', tile=0.6, vt=gc((0.7, 0.5, 0.22)))
    mat('Ext_Shutter', phys='X_Paint', tile=0.5, vt=(0.36, 0.37, 0.38))
    mat('Ext_Dark', phys='X_Paint', tile=0.7, vt=gc((0.03, 0.028, 0.026)))
    mat('Ext_Glass', phys='X_Glass', bphys='I_Grunge', bvt=gc((0.42, 0.47, 0.47)), tile=0.7)
    mat('Ext_Board', phys='X_Atlas')
    mat('Ext_Decal', phys='X_Atlas')
    mat('SignEmit', phys='X_SignEmit')
    mat('WinWarmEmit', phys='X_WinEmit', uvcell='window')
    mat('RoomEmit', phys='X_WinEmit')

    mat('Int_Concrete', phys='I_Conc', tile=3.0)
    mat('Int_ConcCeil', phys='I_Conc', tile=3.0, vt=(0.8, 0.8, 0.8))
    mat('Int_GlazedGreen', phys='I_Glazed', tile=(0.944, 0.972), vt=(0.07, 0.25, 0.13))
    mat('Int_GlazedWhite', phys='I_Glazed', tile=(0.944, 0.972), vt=(0.86, 0.85, 0.79), xphys='X_Paint', xvt=(0.86, 0.85, 0.79))
    mat('Int_Tin', phys='I_Tin', tile=0.61)
    mat('Int_Floor', phys='I_Floor', tile=1.05)
    mat('Int_Block', phys='I_Block', tile=1.624, vt=(0.82, 0.9, 1.3))
    mat('Int_Diamond', phys='I_Diamond', tile=0.6)
    mat('Int_Oak', phys='I_Oak', tile=1.2)
    mat('Int_OakDark', phys='I_Oak', tile=1.2, vt=(0.55, 0.5, 0.48))
    mat('Int_Atlas', phys='I_Atlas')
    for nm, c in (('Int_CastIron', (0.045, 0.075, 0.045)), ('Int_SteelGrey', (0.4, 0.42, 0.43)), ('Int_FilingBeige', (0.6, 0.56, 0.45)), ('Int_ToolRed', (0.55, 0.035, 0.03)),
                  ('Int_Black', (0.035, 0.035, 0.04)), ('Int_Plaster', (0.8, 0.76, 0.66)), ('Int_ECURed', (0.62, 0.025, 0.02))):
        mat(nm, phys='I_Grunge', tile=0.7, vt=c, xphys='X_Paint')
    for nm, c in (('Int_Fabric', (0.16, 0.18, 0.1)), ('Int_Mattress', (0.62, 0.6, 0.55)), ('Int_Leather', (0.13, 0.06, 0.035)), ('Int_Beige', (0.66, 0.62, 0.52)),
                  ('Int_Rubber', (0.04, 0.02, 0.02)), ('Int_Cardboard', (0.42, 0.3, 0.17)), ('Int_Paper', (0.8, 0.78, 0.72)), ('Int_Plant', (0.05, 0.16, 0.05))):
        mat(nm, phys='I_Grunge', tile=0.9, vt=gc(c))
    mat('Int_Brass', phys='I_Metal', vt=(0.78, 0.56, 0.25), albedo=(0.7, 0.5, 0.25))
    mat('Int_Chrome', phys='I_Metal', vt=(0.8, 0.8, 0.82), albedo=(0.6, 0.6, 0.6))
    mat('GlobeEmit', phys='I_LightEmit', uvcell='warm')
    mat('TubeEmit', phys='I_TubeEmit', uvcell='cool')
    mat('AlarmLightEmit', phys='I_LightEmit', uvcell='red')
    mat('MonitorEmit', phys='I_LightEmit', uvcell='green')
    mat('LampShadeEmit', phys='I_PanelEmit', uvcell='lamp')
    mat('ScreenEmit', phys='I_PanelEmit')
    mat('LEDEmit', phys='I_PanelEmit')


def atlas_uv(name, us, vs):
    a = ATLAS[name]
    return [(a[0] + (a[2] - a[0]) * u, a[1] + (a[3] - a[1]) * v) for u, v in zip(us, vs)]


def decal(mb, name, c, u, v, w, h, m='Int_Atlas', inset=None):
    c, u, v = (np.asarray(x, float) for x in (c, u, v))
    p = [c - u * w / 2 - v * h / 2, c + u * w / 2 - v * h / 2, c + u * w / 2 + v * h / 2, c - u * w / 2 + v * h / 2]
    mb.poly(p, m, uv=atlas_uv(name, [0, 1, 1, 0], [0, 0, 1, 1]))


def palette_uv(color, k):
    return [lm_core.cell_uv(color)] * k


# ---------------------------------------------------------------- exterior

def front_facade(ex):
    o, u, v = np.array([0, 0, 0.0]), np.array([1, 0, 0.0]), np.array([0, 1, 0.0])
    n = np.array([0, 0, 1.0])
    poly = [(-W2, -0.4), (ARCH['x0'], -0.4), (ARCH['x0'], ARCH['spring'])]
    for i in range(1, 20):
        a = math.pi - math.pi * i / 20
        poly.append((0.0 + 1.75 * math.cos(a), ARCH['spring'] + 1.75 * math.sin(a)))
    poly += [(ARCH['x1'], ARCH['spring']), (ARCH['x1'], -0.4), (W2, -0.4), (W2, 6.05), (-W2, 6.05)]
    ex.plane2d(poly, o, u, v, 'Ext_Stone', step=1.2)
    ring = [(ARCH['x0'], -0.4)] + [(ARCH['x0'], ARCH['spring'])] + [(1.75 * math.cos(math.pi - math.pi * i / 20), ARCH['spring'] + 1.75 * math.sin(math.pi - math.pi * i / 20)) for i in range(1, 20)] + [(ARCH['x1'], ARCH['spring']), (ARCH['x1'], -0.4)]
    for i in range(len(ring) - 1):
        a2, b2 = np.array(ring[i]), np.array(ring[i + 1])
        A = o + u * a2[0] + v * a2[1]
        B = o + u * b2[0] + v * b2[1]
        ex.quad(A, B, B - n * 0.42, A - n * 0.42, 'Ext_ArchPaint')
    archband = [(0.0 + 2.0 * math.cos(math.pi - math.pi * i / 24), ARCH['spring'] + 2.0 * math.sin(math.pi - math.pi * i / 24)) for i in range(25)]
    path = [(x, y, 0.0) for x, y in archband]
    for i in range(len(path) - 1):
        pa, pb = np.array(path[i]), np.array(path[i + 1])
        t = pb - pa
        t /= np.linalg.norm(t)
        r1 = np.array([pa[0], pa[1] - ARCH['spring'], 0]); r1 /= np.linalg.norm(r1)
        r2 = np.array([pb[0], pb[1] - ARCH['spring'], 0]); r2 /= np.linalg.norm(r2)
        q = []
        for (s, tt) in [(0.0, -0.14), (0.05, -0.12), (0.06, 0.0), (0.05, 0.12), (0.0, 0.14)]:
            q.append((pa + r1 * tt + n * s, pb + r2 * tt + n * s))
        for k in range(len(q) - 1):
            ex.quad(q[k][0], q[k + 1][0], q[k + 1][1], q[k][1], 'Ext_Stone')
    for x0, x1 in ((-W2 - 0.06, ARCH['x0'] - 0.0), (ARCH['x1'], W2 + 0.06)):
        ex.box(x0, x1, -0.4, 0.85, -0.05, 0.07, 'Ext_StoneDark', skip=('-z', '-y'))
        ex.box(x0, x1, 0.85, 0.92, -0.05, 0.045, 'Ext_StoneDark', skip=('-z', '-y'))
    cartouche(ex, (0.0, ARCH_TOP + 0.02, 0.06))
    ex.box(-W2 - 0.04, W2 + 0.04, 5.3, 5.38, -0.02, 0.06, 'Ext_Stone', skip=('-z',))
    belt(ex, 6.05)
    upper_front(ex)
    for gx in (ARCH['x0'] - 0.35, ARCH['x1'] + 0.35):
        bollard(ex, (gx, 0.0, 0.38))
    decal(ex, 'gb_board', (0.0, 5.72, 0.075), (1, 0, 0), (0, 1, 0), 2.95, 0.58, m='Ext_Board')
    ex.box(-1.5, 1.5, 5.43, 6.01, 0.03, 0.07, 'Ext_SignMetal', skip=('+z', '-z'))
    decal(ex, 'entrance', (3.05, 1.95, 0.004), (1, 0, 0), (0, 1, 0), 1.6, 0.19, m='Ext_Decal')
    ex.box(2.75, 3.35, 2.55, 2.95, 0.0, 0.025, 'Ext_Plaque')


def cartouche(ex, c):
    cx, cy, cz = c
    shield = [(0.0, -0.05), (0.2, 0.05), (0.3, 0.25), (0.28, 0.45), (0.18, 0.62), (0.0, 0.7), (-0.18, 0.62), (-0.28, 0.45), (-0.3, 0.25), (-0.2, 0.05)]
    sh = [(x + cx, y + cy) for x, y in shield]
    ex.extrude(sh, 0.12, (0, 0, cz + 0.12), (1, 0, 0), (0, 1, 0), 'Ext_Cartouche', back=False)
    inner = [(x * 0.7 + cx, y * 0.7 + cy + 0.1) for x, y in shield]
    ex.extrude(inner, 0.05, (0, 0, cz + 0.17), (1, 0, 0), (0, 1, 0), 'Ext_Cartouche', back=False)
    for s in (-1, 1):
        for k in range(3):
            r = 0.09 - k * 0.02
            ex.lathe([(0.0, -0.05), (r, -0.04), (r, 0.04), (0.0, 0.05)], 10, (cx + s * (0.33 + k * 0.05), cy + 0.18 + k * 0.17, cz + 0.08), 'Ext_Cartouche', axis='z')
    ex.lathe([(0.0, 0.0), (0.12, 0.02), (0.1, 0.12), (0.0, 0.16)], 10, (cx, cy + 0.68, cz + 0.06), 'Ext_Cartouche', axis='y')


def belt(ex, y):
    prof = [(0.0, 0.0), (0.06, 0.0), (0.06, 0.06), (0.14, 0.12), (0.26, 0.24), (0.3, 0.3), (0.3, 0.36), (0.0, 0.36)]
    path = [(-W2, y, 0.0), (W2, y, 0.0), (W2, y, -D)]
    ex.sweep(path, prof, 'Ext_Stone')


def main_cornice(ex, y):
    prof = [(0.0, 0.0), (0.08, 0.02), (0.1, 0.12), (0.16, 0.16), (0.16, 0.2), (0.62, 0.24), (0.66, 0.3), (0.66, 0.52), (0.72, 0.58), (0.72, 0.66), (0.0, 0.66)]
    path = [(-W2, y, 0.0), (W2, y, 0.0), (W2, y, -D)]
    ex.sweep(path, prof, 'Ext_Stone')
    for x in np.arange(-W2 + 0.25, W2, 0.55):
        ex.box(x - 0.07, x + 0.07, y + 0.12, y + 0.24, 0.0, 0.58, 'Ext_Stone', skip=('-z',))
    for z in np.arange(-0.3, -D + 0.2, -0.55):
        ex.box(W2, W2 + 0.58, y + 0.12, y + 0.24, z - 0.07, z + 0.07, 'Ext_Stone', skip=('-x',))


def console(ex, x, y0, z0=0.0, axis='z', side=1):
    prof = [(0.0, 0.0), (0.12, 0.02), (0.18, 0.1), (0.16, 0.22), (0.2, 0.36), (0.32, 0.5), (0.44, 0.58), (0.5, 0.66), (0.5, 0.72), (0.0, 0.72)]
    pts = [(s, t + y0) for s, t in prof]
    if axis == 'z':
        ex.extrude([(p[0], p[1]) for p in pts], 0.24, (x + 0.12, 0, z0), (0, 0, side), (0, 1, 0), 'Ext_Stone')
    else:
        ex.extrude([(p[0], p[1]) for p in pts], 0.24, (W2, 0, x - 0.12), (1, 0, 0), (0, 1, 0), 'Ext_Stone')


def window(mb, o, u, v, x0, x1, y0, y1, depth, mull=(), transom=None, top=None, frame_m='Ext_WinFrame', glass_m='Ext_Glass', reveal_m='Ext_Stone', inner=None):
    """Opening in a wall plane (o,u,v; n outward). Glass at `depth` behind the face; reveal from 0 to depth; frame members."""
    o, u, v = (np.asarray(a, float) for a in (o, u, v))
    n = np.cross(u, v)
    n /= np.linalg.norm(n)
    if top:
        ol = arch_outline(x0, x1, y0, y1 - top, seg=12, kind='seg', rise=top)
    else:
        ol = rect(x0, y0, x1, y1)
    mb.ring_side(ol, o, u, v, n, depth, reveal_m, hole=True)
    g = o - n * depth
    if glass_m == 'RoomEmit':
        a = ATLAS['room']
        mb.plane2d(ol, g, u, v, glass_m, uv=lambda vv: np.stack([a[0] + (a[2] - a[0]) * (vv[:, 0] - x0) / (x1 - x0), a[1] + (a[3] - a[1]) * (vv[:, 1] - y0) / (y1 - y0)], 1))
    else:
        mb.plane2d(ol, g, u, v, glass_m)
    fw = 0.07
    fd = 0.06
    P = lambda a, b, d: o + u * a + v * b - n * d

    def bar(a0, a1, b0, b1):
        c = (P(a0, b0, depth - fd / 2) + P(a1, b1, depth - fd / 2)) / 2
        ha = u * (a1 - a0) / 2
        hb = v * (b1 - b0) / 2
        mb.obox(c, ha, hb, n * fd / 2, frame_m)
    ytop = y1 - (top or 0)
    bar(x0, x0 + fw, y0, ytop)
    bar(x1 - fw, x1, y0, ytop)
    bar(x0, x1, y0, y0 + fw)
    if not top:
        bar(x0, x1, y1 - fw, y1)
    else:
        pts = arch_outline(x0, x1, y0, ytop, seg=12, kind='seg', rise=top)[3:-1]
        pts = [(x1, ytop)] + pts + [(x0, ytop)]
        for i in range(len(pts) - 1):
            a2, b2 = pts[i], pts[i + 1]
            c = P((a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2 - fw / 2, depth - fd / 2)
            dd = np.array(b2) - np.array(a2)
            L = np.linalg.norm(dd)
            ha = (u * dd[0] + v * dd[1]) / 2
            nb = (-u * dd[1] + v * dd[0]) / L * fw / 2
            mb.obox(c, ha, nb, n * fd / 2, frame_m)
    for m in mull:
        bar(m - 0.035, m + 0.035, y0, ytop if transom is None else ytop)
    if transom is not None:
        bar(x0, x1, transom - 0.04, transom + 0.04)
    if inner is not None:
        im, idepth = inner
        mb2 = inner[2] if len(inner) > 2 else mb
        mb2.ring_side(ol, g, u, v, n, idepth - depth, im, hole=True)
    return ol


def upper_front(ex):
    o, u, v = np.array([0, 0, 0.0]), np.array([1, 0, 0.0]), np.array([0, 1, 0.0])
    ex.plane2d(rect(-W2, 6.4, -2.05, ROOF), o, u, v, 'Ext_Brick', step=None)
    ex.plane2d(rect(2.05, 6.4, W2, ROOF), o, u, v, 'Ext_Brick', step=None)
    fo = np.array([0, 0, 0.06])
    w2 = window_holes_front()
    ex.plane2d(rect(-2.05, 6.4, 2.05, 14.0), fo, u, v, 'Ext_Stone', holes=w2)
    for s in (-1, 1):
        ex.quad((s * 2.05, 6.4, 0.06 if s > 0 else 0.0), (s * 2.05, 14.0, 0.06 if s > 0 else 0.0), (s * 2.05, 14.0, 0.0 if s > 0 else 0.06), (s * 2.05, 6.4, 0.0 if s > 0 else 0.06), 'Ext_Stone')
        y = 6.45
        k = 0
        while y < 13.9:
            h = 0.42
            w = 0.36 if k % 2 == 0 else 0.2
            xa, xb = (2.05, 2.05 + w) if s > 0 else (-2.05 - w, -2.05)
            ex.box(xa, xb, y, min(y + h, 14.0), 0.0, 0.06, 'Ext_Stone', skip=('-z',))
            y += h + 0.02
            k += 1
    window(ex, fo, u, v, -1.5, 1.5, 6.75, 9.45, 0.2, mull=(-0.5, 0.5), transom=8.95, inner=('Int_Plaster', 0.66), glass_m='RoomEmit')
    window(ex, fo, u, v, -1.5, 1.5, 10.35, 13.35, 0.2, mull=(-0.5, 0.5), transom=12.55, top=0.35, inner=None)
    ex.box(-1.1, 1.1, 9.62, 10.18, 0.06, 0.09, 'Ext_Stone', skip=('-z',))
    ex.box(-0.22, 0.22, 13.3, 13.95, 0.06, 0.14, 'Ext_Stone', skip=('-z',))
    railing(ex, -1.5, 1.5, 6.45, 6.95, 0.16)
    ex.box(-2.1, 2.1, 6.4, 6.48, 0.0, 0.16, 'Ext_Stone', skip=('-z',))
    ex.box(-W2, W2, 14.0, 14.6, 0.0, 0.08, 'Ext_Stone', skip=('-z',))
    for x in (-W2 + 0.02, -2.05 - 0.26, 2.05 + 0.02, W2 - 0.26):
        console(ex, x, 13.88, 0.08)
    main_cornice(ex, 14.6)
    parapet(ex)


def window_holes_front():
    return [rect(-1.5, 6.75, 1.5, 9.45), arch_outline(-1.5, 1.5, 10.35, 13.0, seg=12, kind='seg', rise=0.35)]


def railing(ex, x0, x1, y0, y1, z):
    ex.box(x0, x1, y1 - 0.04, y1, z - 0.03, z + 0.03, 'Ext_Iron')
    ex.box(x0, x1, y0, y0 + 0.04, z - 0.03, z + 0.03, 'Ext_Iron')
    for x in np.arange(x0 + 0.1, x1, 0.12):
        ex.box(x - 0.012, x + 0.012, y0, y1, z - 0.012, z + 0.012, 'Ext_Iron', skip=('+y', '-y'))
    for xc in (-0.75, 0.0, 0.75):
        ex.lathe([(0.0, -0.13), (0.13, -0.1), (0.13, 0.1), (0.0, 0.13)], 10, (xc, (y0 + y1) / 2, z + 0.015), 'Ext_Iron', axis='z', smooth=True)


def parapet(ex):
    o = np.array([0, 0, 0.0])
    ex.plane2d(rect(-W2, ROOF + 0.66, W2, PARAPET), o, (1, 0, 0), (0, 1, 0), 'Ext_Brick')
    ex.plane2d(rect(0, ROOF + 0.66, D, PARAPET), (W2, 0, 0), (0, 0, -1), (0, 1, 0), 'Ext_Brick')
    ex.plane2d(rect(0, ROOF, D, PARAPET), (-W2, 0, -D), (0, 0, 1), (0, 1, 0), 'Ext_CommonBrick')
    ex.plane2d(rect(0, ROOF, 2 * W2, PARAPET), (W2, 0, -D), (-1, 0, 0), (0, 1, 0), 'Ext_CommonBrick')
    t = 0.32
    ex.quad((W2 - t, ROOF, -t), (-W2 + t, ROOF, -t), (-W2 + t, PARAPET, -t), (W2 - t, PARAPET, -t), 'Ext_CommonBrick')
    ex.quad((W2 - t, ROOF, -D + t), (W2 - t, ROOF, -t), (W2 - t, PARAPET, -t), (W2 - t, PARAPET, -D + t), 'Ext_CommonBrick')
    ex.quad((-W2 + t, ROOF, -t), (-W2 + t, ROOF, -D + t), (-W2 + t, PARAPET, -D + t), (-W2 + t, PARAPET, -t), 'Ext_CommonBrick')
    ex.quad((-W2 + t, ROOF, -D + t), (W2 - t, ROOF, -D + t), (W2 - t, PARAPET, -D + t), (-W2 + t, PARAPET, -D + t), 'Ext_CommonBrick')
    ex.box(-W2 - 0.06, W2 + 0.06, PARAPET, PARAPET + 0.14, -t - 0.04, 0.06, 'Ext_Stone', skip=('-y',))
    ex.box(W2 - t - 0.04, W2 + 0.06, PARAPET, PARAPET + 0.14, -D, -t - 0.04, 'Ext_Stone', skip=('-y', '+z'))
    ex.box(-W2 - 0.04, -W2 + t + 0.04, PARAPET, PARAPET + 0.14, -D, -t - 0.04, 'Ext_StoneDark', skip=('-y', '+z'))
    ex.box(-W2 + t + 0.04, W2 - t - 0.04, PARAPET, PARAPET + 0.14, -D - 0.04, -D + t + 0.04, 'Ext_StoneDark', skip=('-y',))
    ex.quad((-W2 + t, ROOF, -D + t), (W2 - t, ROOF, -D + t), (W2 - t, ROOF, -t), (-W2 + t, ROOF, -t), 'Ext_Roof')
    ex.box(-3.6, -1.4, ROOF, ROOF + 2.4, -22.5, -19.6, {'+x': 'Ext_CommonBrick', '-x': 'Ext_CommonBrick', '+z': 'Ext_CommonBrick', '-z': 'Ext_CommonBrick', '+y': 'Ext_Roof', '-y': 'Ext_Roof'}, skip=('-y',))
    ex.box(-1.4, -1.38, ROOF, ROOF + 2.05, -21.4, -20.5, 'Door_Paint', skip=('-y',))
    ex.box(0.6, 2.2, ROOF, ROOF + 0.5, -14.0, -11.5, 'Ext_Dark', skip=('-y',))
    ex.lathe([(0.0, 0.0), (0.035, 0.0), (0.03, 4.0), (0.0, 4.02)], 8, (0.0, PARAPET + 0.14, -0.25), 'Ext_Iron')
    ex.lathe([(0.0, 0.0), (0.06, 0.02), (0.06, 0.08), (0.0, 0.1)], 8, (0.0, PARAPET + 4.15, -0.25), 'Door_Brass')


def side_facade(ex):
    o, u, v = np.array([W2, 0, 0.0]), np.array([0, 0, -1.0]), np.array([0, 1, 0.0])
    n = np.array([1.0, 0, 0])
    holes_g = []
    for kind, z in SIDE_G:
        a = -z
        if kind == 'win':
            holes_g.append(('win', rect(a - 0.55, 2.4, a + 0.55, 4.2)))
        else:
            holes_g.append(('door', rect(a - 0.55, 0.0, a + 0.55, 2.55)))
    poly = [(0.0, -0.4), (D, -0.4), (D, 6.05), (0.0, 6.05)]
    ex.plane2d(poly, o, u, v, 'Ext_Stone', holes=[clip_door(h) for k, h in holes_g], step=1.4)
    for kind, h in holes_g:
        x0, y0, x1, y1 = h[0][0], h[0][1], h[2][0], h[2][1]
        if kind == 'win':
            window(ex, o, u, v, x0, x1, y0, y1, 0.14, mull=((x0 + x1) / 2,), inner=('Int_GlazedWhite', 0.45))
            for xx in np.arange(x0 + 0.12, x1, 0.18):
                c = o + u * xx + v * ((y0 + y1) / 2) - n * 0.06
                ex.obox(c, u * 0.012, v * (y1 - y0) / 2, n * 0.012, 'Ext_Iron')
        else:
            ex.ring_side(rect(x0, 0.0, x1, y1), o, u, v, n, 0.22, 'Ext_Stone', hole=True)
            ex.plane2d(rect(x0, 0.0, x1, y1), o - n * 0.22, u, v, 'Door_Paint')
            for (yy0, yy1) in ((0.25, 1.15), (1.35, 2.3)):
                c = o + u * ((x0 + x1) / 2) + v * ((yy0 + yy1) / 2) - n * 0.2
                ex.obox(c, u * ((x1 - x0) / 2 - 0.12), v * (yy1 - yy0) / 2, n * 0.02, 'Door_Paint')
            ex.lathe([(0.0, 0.0), (0.03, 0.0), (0.035, 0.03), (0.0, 0.05)], 8, tuple(o + u * (x1 - 0.12) + v * 1.05 - n * 0.2), 'Door_Brass', axis='x')
    for z0, z1 in plinth_spans():
        ex.box(W2 - 0.05, W2 + 0.07, -0.4, 0.85, z0, z1, 'Ext_StoneDark', skip=('-x',))
        ex.box(W2 - 0.05, W2 + 0.045, 0.85, 0.92, z0, z1, 'Ext_StoneDark', skip=('-x',))
    ex.box(W2 - 0.02, W2 + 0.06, 5.3, 5.38, -D, 0.0, 'Ext_Stone', skip=('-x', '+z'))
    ex.plane2d([(0.0, 6.4), (D, 6.4), (D, ROOF), (0.0, ROOF)], o, u, v, 'Ext_Brick', holes=[rect(-z_ - 0.85, 6.48, -z_ + 0.85, 13.75) for z_ in SIDE_BAYS])
    for z in SIDE_BAYS:
        a = -z
        fo = o + n * 0.05
        sur = rect(a - 0.85, 6.48, a + 0.85, 13.75)
        ex.plane2d(sur, fo, u, v, 'Ext_Stone', holes=[rect(a - 0.58, 6.9, a + 0.58, 9.4), rect(a - 0.58, 10.6, a + 0.58, 13.1)])
        ex.ring_side(sur, fo, u, v, n, 0.05, 'Ext_Stone')
        window(ex, fo, u, v, a - 0.58, a + 0.58, 6.9, 9.4, 0.19, mull=(a,), transom=8.9, inner=('Int_Plaster', 0.5), glass_m='RoomEmit' if z in (-5.5, -12.5, -24.0) else 'Ext_Glass')
        window(ex, fo, u, v, a - 0.58, a + 0.58, 10.6, 13.1, 0.19, mull=(a,), transom=12.6)
        for y in np.arange(6.55, 13.6, 0.44):
            k = int((y - 6.55) / 0.44)
            w = 0.3 if k % 2 == 0 else 0.16
            for s in (-1, 1):
                aa, bb = (a + 0.85, a + 0.85 + w) if s > 0 else (a - 0.85 - w, a - 0.85)
                ex.box(W2, W2 + 0.05, y, y + 0.4, -bb, -aa, 'Ext_Stone', skip=('-x',))
        ex.box(W2 + 0.05, W2 + 0.09, 9.55, 10.45, -(a + 0.5), -(a - 0.5), 'Ext_Stone', skip=('-x',))
        ex.box(W2 + 0.05, W2 + 0.12, 13.2, 13.75, -(a + 0.18), -(a - 0.18), 'Ext_Stone', skip=('-x',))
    ex.box(W2, W2 + 0.08, 14.0, 14.6, -D, 0.0, 'Ext_Stone', skip=('-x', '+z'))
    for z in SIDE_BAYS + [-1.0, -D + 0.6]:
        prof2 = [(0.0, 0.0), (0.12, 0.02), (0.18, 0.1), (0.16, 0.22), (0.2, 0.36), (0.32, 0.5), (0.44, 0.58), (0.5, 0.66), (0.5, 0.72), (0.0, 0.72)]
        ex.extrude([(s, t + 13.88) for s, t in prof2], 0.24, (W2 + 0.08, 0, z + 0.12), (1, 0, 0), (0, 1, 0), 'Ext_Stone')


def clip_door(h):
    return h


def plinth_spans():
    spans = []
    z = 0.0
    doors = sorted([z_ for k, z_ in SIDE_G if k == 'door'], reverse=True)
    for dz in doors:
        spans.append((dz + 0.62, z + 0.06))
        z = dz - 0.62
    spans.append((-D, z))
    return [(min(a, b), max(a, b)) for a, b in spans if abs(a - b) > 0.05]


def back_walls(ex):
    ex.plane2d(rect(0.0, -0.4, D, ROOF), (-W2, 0, -D), (0, 0, 1), (0, 1, 0), 'Ext_CommonBrick')
    o, u, v = np.array([W2, 0, -D]), np.array([-1.0, 0, 0]), np.array([0, 1, 0.0])
    holes = [rect(1.6, 7.2, 2.6, 9.2), rect(6.0, 7.2, 7.0, 9.2), rect(1.6, 10.8, 2.6, 12.8), rect(6.0, 10.8, 7.0, 12.8)]
    ex.plane2d(rect(0.0, -0.4, 2 * W2, ROOF), o, u, v, 'Ext_CommonBrick', holes=holes)
    for h in holes:
        window(ex, o, u, v, h[0][0], h[2][0], h[0][1], h[2][1], 0.15, mull=(), transom=None, reveal_m='Ext_CommonBrick', inner=('Int_Plaster', 0.4) if h[0][1] < 10 else None)
        ex.box(W2 - h[2][0] - 0.06, W2 - h[0][0] + 0.06, h[0][1] - 0.08, h[0][1], -D, -D + 0.06, 'Ext_Stone', skip=('+z',))


def bollard(ex, c):
    ex.lathe([(0.0, 0.0), (0.13, 0.0), (0.13, 0.08), (0.1, 0.12), (0.09, 0.75), (0.1, 0.8), (0.07, 0.9), (0.0, 0.93)], 12, c, 'Ext_Bollard')


def hanging_sign(ex, em):
    x = -1.05
    ex.box(x - 0.025, x + 0.025, 6.12, 6.18, 0.0, 1.38, 'Ext_Iron')
    path = [(x, 6.15 - 0.6 * (1 - math.cos(a)) * 0.5, 0.05 + 0.75 * math.sin(a)) for a in np.linspace(0, math.pi / 2, 6)]
    for i in range(len(path) - 1):
        pa, pb = np.array(path[i]), np.array(path[i + 1])
        ex.obox((pa + pb) / 2, np.array([0.012, 0, 0]), (pb - pa) / 2 + np.array([0, 0.0001, 0]), np.cross((pb - pa) / np.linalg.norm(pb - pa), [1, 0, 0]) * 0.012, 'Ext_Iron')
    for zc in (0.45, 1.25):
        ex.box(x - 0.008, x + 0.008, 5.98, 6.13, zc - 0.008, zc + 0.008, 'Ext_Iron')
    z0, z1, y0, y1 = 0.2, 1.42, 4.58, 6.05
    a = ATLAS['noghost_sign']
    uvs = lambda us, vs: [(a[0] + (a[2] - a[0]) * u_, a[1] + (a[3] - a[1]) * v_) for u_, v_ in zip(us, vs)]
    th = 0.08
    em.poly([(x + th, y0, z1), (x + th, y0, z0), (x + th, y1, z0), (x + th, y1, z1)], 'SignEmit', uv=uvs([0, 1, 1, 0], [0, 0, 1, 1]))
    em.poly([(x - th, y0, z0), (x - th, y0, z1), (x - th, y1, z1), (x - th, y1, z0)], 'SignEmit', uv=uvs([0, 1, 1, 0], [0, 0, 1, 1]))
    rz0 = z0 + (z1 - z0) * 230 / 1024
    rz1 = z0 + (z1 - z0) * (1024 - 110) / 1024
    ry1 = y1 - (y1 - y0) * 400 / 1280
    ry0 = y1 - (y1 - y0) * (1280 - 70) / 1280
    ex.box(x - th + 0.004, x + th - 0.004, ry0, ry1, rz0, rz1, 'Ext_SignMetal', skip=('+x', '-x'))


def neighbour(nb):
    xa, xb = LOT_X - LOT_W / 2, -W2
    o, u, v = np.array([0, 0, 0.0]), np.array([1, 0, 0.0]), np.array([0, 1, 0.0])
    n = np.array([0, 0, 1.0])
    sh = (xa + 0.5, xa + 4.7, 0.0, 3.4)
    dr = (xb - 2.1, xb - 0.95, 0.0, 2.6)
    nb.plane2d([(xa, -0.4), (xb, -0.4), (xb, 4.5), (xa, 4.5)], o, u, v, 'Ext_StoneDark', holes=[rect(sh[0], sh[2], sh[1], sh[3]), rect(dr[0], dr[2], dr[1], dr[3])])
    nb.ring_side(rect(sh[0], sh[2], sh[1], sh[3]), o, u, v, n, 0.28, 'Ext_StoneDark', hole=True)
    nb.plane2d(rect(sh[0], sh[2], sh[1], sh[3]), o - n * 0.28, u, v, 'Ext_Shutter')
    for y in np.arange(0.18, sh[3] - 0.05, 0.16):
        nb.box(sh[0], sh[1], y - 0.015, y + 0.015, -0.28, -0.255, 'Ext_Shutter', skip=('-z',))
    nb.box(sh[0], sh[1], 0.0, 0.1, -0.28, -0.22, 'Ext_Iron', skip=('-z',))
    nb.box(sh[0] - 0.02, sh[1] + 0.02, sh[3] - 0.3, sh[3], -0.28, -0.12, 'Ext_Iron', skip=('-z', '+y'))
    for x in (sh[0] + 0.06, sh[1] - 0.06):
        nb.box(x - 0.05, x + 0.05, 0.0, sh[3] - 0.3, -0.28, -0.2, 'Ext_Iron', skip=('-z',))
    nb.ring_side(rect(dr[0], dr[2], dr[1], dr[3]), o, u, v, n, 0.32, 'Ext_StoneDark', hole=True)
    nb.plane2d(rect(dr[0], dr[2], dr[1], dr[3]), o - n * 0.32, u, v, 'Ext_Dark')
    nb.box(dr[0] + 0.12, dr[1] - 0.12, 1.5, 2.3, -0.32, -0.3, 'Ext_Glass')
    nb.box(dr[1] - 0.2, dr[1] - 0.14, 1.0, 1.1, -0.3, -0.26, 'Door_Brass')
    nb.box(dr[0] - 0.05, dr[1] + 0.05, -0.4, 0.06, -0.05, 0.25, 'Ext_StoneDark', skip=('-z',))
    sb = ATLAS['neighbour_sign']
    nb.box(xa + 0.3, xb - 0.3, 3.55, 4.2, 0.0, 0.08, 'Ext_Dark', skip=('-z',))
    nb.poly([(xa + 0.6, 3.6, 0.081), (xb - 0.6, 3.6, 0.081), (xb - 0.6, 4.15, 0.081), (xa + 0.6, 4.15, 0.081)], 'Ext_Board', uv=[(sb[0], sb[1]), (sb[2], sb[1]), (sb[2], sb[3]), (sb[0], sb[3])])
    nb.box(xa, xb, 4.3, 4.5, 0.0, 0.12, 'Ext_Stone', skip=('-z',))
    floors = [4.5 + k * 3.3 for k in range(4)]
    wx = [xa + 1.5, (xa + xb) / 2, xb - 1.5]
    holes = []
    for y0 in floors:
        for x in wx:
            holes.append(rect(x - 0.58, y0 + 0.85, x + 0.58, y0 + 2.75))
    top = HN - 1.0
    nb.plane2d(rect(xa, 4.5, xb, HN), o, u, v, 'Ext_BrickN', holes=holes)
    lit = {(1, 0), (2, 2), (3, 1)}
    for k, y0 in enumerate(floors):
        for j, x in enumerate(wx):
            window(nb, o, u, v, x - 0.58, x + 0.58, y0 + 0.85, y0 + 2.75, 0.16, mull=(), transom=y0 + 1.85, glass_m='WinWarmEmit' if (k, j) in lit else 'Ext_Glass', reveal_m='Ext_BrickN', frame_m='Ext_Dark')
            nb.box(x - 0.68, x + 0.68, y0 + 0.77, y0 + 0.85, 0.0, 0.07, 'Ext_Stone', skip=('-z',))
            nb.box(x - 0.66, x + 0.66, y0 + 2.75, y0 + 2.98, 0.0, 0.05, 'Ext_Stone', skip=('-z',))
    prof = [(0.0, 0.0), (0.1, 0.05), (0.12, 0.2), (0.4, 0.3), (0.45, 0.42), (0.45, 0.55), (0.0, 0.55)]
    nb.sweep([(xa, top + 0.35, 0.0), (xb, top + 0.35, 0.0)], prof, 'Ext_StoneDark')
    for x in np.arange(xa + 0.35, xb - 0.1, 0.62):
        nb.box(x - 0.05, x + 0.05, top + 0.05, top + 0.38, 0.0, 0.3, 'Ext_StoneDark', skip=('-z',))
    nb.box(xa, xb, HN, HN + 0.1, -0.3, 0.06, 'Ext_StoneDark', skip=('-y',))
    nb.plane2d(rect(0.0, -0.4, D, HN), (xa, 0, -D), (0, 0, 1), (0, 1, 0), 'Ext_CommonBrick')
    nb.plane2d(rect(0.0, PARAPET, D, HN), (xb, 0, 0.0), (0, 0, -1), (0, 1, 0), 'Ext_CommonBrick')
    nb.plane2d(rect(0.0, -0.4, xb - xa, HN), (xb, 0, -D), (-1, 0, 0), (0, 1, 0), 'Ext_CommonBrick')
    nb.quad((xa + 0.3, top, -D + 0.3), (xb - 0.3, top, -D + 0.3), (xb - 0.3, top, -0.3), (xa + 0.3, top, -0.3), 'Ext_Roof')
    for (p0, p1) in (((xb - 0.3, -0.3), (xa + 0.3, -0.3)), ((xa + 0.3, -0.3), (xa + 0.3, -D + 0.3)), ((xa + 0.3, -D + 0.3), (xb - 0.3, -D + 0.3)), ((xb - 0.3, -D + 0.3), (xb - 0.3, -0.3))):
        nb.quad((p0[0], top, p0[1]), (p1[0], top, p1[1]), (p1[0], HN, p1[1]), (p0[0], HN, p0[1]), 'Ext_CommonBrick')
    nb.box(xa, xa + 0.3, HN, HN + 0.1, -D, -0.3, 'Ext_StoneDark', skip=('-y',))
    nb.box(xb - 0.3, xb, HN, HN + 0.1, -D, -0.3, 'Ext_StoneDark', skip=('-y',))
    nb.box(xa + 0.3, xb - 0.3, HN, HN + 0.1, -D, -D + 0.3, 'Ext_StoneDark', skip=('-y',))
    fire_escape(nb, xa + 0.35, xa + 5.2, floors)


def fire_escape(nb, x0, x1, floors):
    dz = 1.1
    for k, y0 in enumerate(floors):
        y = y0 - 0.02
        nb.box(x0, x1, y - 0.05, y, 0.02, dz, 'Ext_Iron')
        for (a, b) in (((x0, dz), (x1, dz)), ((x0, 0.02), (x0, dz)), ((x1, 0.02), (x1, dz))):
            c = np.array([(a[0] + b[0]) / 2, y + 0.95, (a[1] + b[1]) / 2])
            d = np.array([b[0] - a[0], 0, b[1] - a[1]])
            L = np.linalg.norm(d)
            nb.obox(c, d / 2, np.array([0, 0.02, 0]), np.cross(d / L, [0, 1, 0]) * 0.02, 'Ext_Iron')
            nb.obox(c - np.array([0, 0.5, 0]), d / 2, np.array([0, 0.012, 0]), np.cross(d / L, [0, 1, 0]) * 0.012, 'Ext_Iron')
        for x in np.arange(x0, x1 + 0.01, (x1 - x0) / 7):
            nb.box(x - 0.012, x + 0.012, y, y + 0.95, dz - 0.024, dz, 'Ext_Iron', skip=('+y', '-y'))
        for zz in (0.4, 0.75):
            for x in (x0, x1):
                nb.box(x - 0.012, x + 0.012, y, y + 0.95, zz - 0.012, zz + 0.012, 'Ext_Iron', skip=('+y', '-y'))
        if k + 1 < len(floors):
            ya, yb = y, floors[k + 1] - 0.02
            xa_, xb_ = x1 - 0.5, x0 + 1.6
            zc = dz * 0.55
            for zs in (zc - 0.3, zc + 0.3):
                pa, pb = np.array([xa_, ya, zs]), np.array([xb_, yb, zs])
                d = pb - pa
                L = np.linalg.norm(d)
                nb.obox((pa + pb) / 2, d / 2, np.array([0, 0, 0.012]), np.cross(d / L, [0, 0, 1]) * 0.07, 'Ext_Iron')
            ns = 12
            for i in range(1, ns):
                p = np.array([xa_, ya, zc]) + (np.array([xb_, yb, zc]) - np.array([xa_, ya, zc])) * i / ns
                nb.box(p[0] - 0.11, p[0] + 0.11, p[1] - 0.015, p[1] + 0.015, zc - 0.29, zc + 0.29, 'Ext_Iron')
            hr = np.array([xa_, ya + 0.9, zc + 0.3]), np.array([xb_, yb + 0.9, zc + 0.3])
            d = hr[1] - hr[0]
            nb.obox((hr[0] + hr[1]) / 2, d / 2, np.array([0, 0, 0.015]), np.cross(d / np.linalg.norm(d), [0, 0, 1]) * 0.015, 'Ext_Iron')
    y = floors[0] - 0.05
    lx = x0 + 0.6
    for xx in (lx - 0.22, lx + 0.22):
        nb.box(xx - 0.015, xx + 0.015, y - 2.2, y + 0.9, dz - 0.08, dz - 0.05, 'Ext_Iron')
    for yy in np.arange(y - 2.1, y, 0.3):
        nb.box(lx - 0.22, lx + 0.22, yy - 0.01, yy + 0.01, dz - 0.075, dz - 0.055, 'Ext_Iron')


def exterior():
    ex = MB()
    em = MB()
    nb = MB()
    front_facade(ex)
    side_facade(ex)
    back_walls(ex)
    hanging_sign(ex, em)
    neighbour(nb)
    return ex, em, nb


# ---------------------------------------------------------------- garage doors

def door_leaf(side):
    """side -1 = left leaf (hinge at x0, extends +x), +1 = right leaf. Built in hinge-local frame (hinge at origin)."""
    mb = MB()
    em = MB()
    w = 1.75
    h = ARCH['spring'] + 0.2
    t = 0.07
    sx = 1 if side < 0 else -1
    X = lambda a: a * sx
    def frame(a0, a1, y0, y1, d0=-t / 2, d1=t / 2, m='Door_Paint'):
        mb.box(min(X(a0), X(a1)), max(X(a0), X(a1)), y0, y1, d0, d1, m)
    sw = 0.14
    frame(0.0, sw, 0.0, h)
    frame(w - sw, w, 0.0, h)
    frame(sw, w - sw, 0.0, 0.26)
    frame(sw, w - sw, h - 0.16, h)
    frame(sw, w - sw, 1.42, 1.6)
    frame(w / 2 - 0.05, w / 2 + 0.05, 0.26, 1.42)
    for a0, a1 in ((sw, w / 2 - 0.05), (w / 2 + 0.05, w - sw)):
        frame(a0, a1, 0.26, 1.42, -0.018, 0.018)
        frame(a0 + 0.07, a1 - 0.07, 0.33, 1.35, -0.03, 0.03)
    gx0, gx1, gy0, gy1 = sw, w - sw, 1.6, h - 0.16
    em.poly([(X(gx0), gy0, 0.0), (X(gx1), gy0, 0.0), (X(gx1), gy1, 0.0), (X(gx0), gy1, 0.0)][::(1 if sx > 0 else -1)], 'DoorGlassEmit')
    nc, nr = 4, 4
    for i in range(1, nc):
        a = gx0 + (gx1 - gx0) * i / nc
        frame(a - 0.022, a + 0.022, gy0, gy1, -0.025, 0.025)
    for j in range(1, nr):
        b = gy0 + (gy1 - gy0) * j / nr
        frame(gx0, gx1, b - 0.022, b + 0.022, -0.025, 0.025)
    if side > 0:
        mb.lathe([(0.0, 0.0), (0.03, 0.0), (0.035, 0.035), (0.0, 0.06)], 8, (X(w - 0.22), 1.05, t / 2), 'Door_Brass', axis='z')
        mb.lathe([(0.0, 0.0), (0.03, 0.0), (0.035, 0.035), (0.0, 0.06)], 8, (X(w - 0.22), 1.05, -t / 2 - 0.06), 'Door_Brass', axis='z')
    for y in (0.4, h - 0.5):
        mb.box(min(X(0.0), X(0.35)), max(X(0.0), X(0.35)), y, y + 0.06, -t / 2 - 0.01, t / 2 + 0.01, 'Ext_Iron')
    return mb, em, w, h, t


def transom(ex, em):
    z = -0.46
    ys = ARCH['spring'] + 0.2
    pts = [(1.75 * math.cos(math.pi * i / 20), ARCH['spring'] + 1.75 * math.sin(math.pi * i / 20)) for i in range(21)]
    outline = [p for p in pts if p[1] >= ys]
    outline = [(1.75 * math.sqrt(max(0.0, 1 - ((ys - ARCH['spring']) / 1.75) ** 2)), ys)] + [p for p in pts if p[1] > ys + 1e-6] + [(-1.75 * math.sqrt(max(0.0, 1 - ((ys - ARCH['spring']) / 1.75) ** 2)), ys)]
    em.plane2d(outline, (0, 0, z), (1, 0, 0), (0, 1, 0), 'DoorGlassEmit')
    ex.box(-1.75, 1.75, ys - 0.02, ys + 0.12, z - 0.05, z + 0.05, 'Door_Paint')
    for k in range(-3, 4):
        a = math.pi / 2 + k * 0.33
        p0 = np.array([0.0, ys + 0.08, z])
        p1 = np.array([1.74 * math.cos(a), ARCH['spring'] + 1.74 * math.sin(a), z])
        if p1[1] < ys + 0.1:
            continue
        d = p1 - p0
        ex.obox((p0 + p1) / 2, d / 2, np.cross(d / np.linalg.norm(d), [0, 0, 1]) * 0.025, np.array([0, 0, 0.03]), 'Door_Paint')
    ring = [(1.75 * math.cos(math.pi * i / 20), ARCH['spring'] + 1.75 * math.sin(math.pi * i / 20)) for i in range(21)]
    for i in range(20):
        a2, b2 = np.array(ring[i]), np.array(ring[i + 1])
        if b2[1] < ys and a2[1] < ys:
            continue
        c = (a2 + b2) / 2
        d = b2 - a2
        r = (c - np.array([0, ARCH['spring']])) / np.linalg.norm(c - np.array([0, ARCH['spring']]))
        cc = np.array([c[0] - r[0] * 0.06, c[1] - r[1] * 0.06, z])
        ex.obox(cc, np.array([d[0], d[1], 0]) / 2 * 1.05, np.array([r[0], r[1], 0]) * 0.06, np.array([0, 0, 0.045]), 'Door_Paint')


# ---------------------------------------------------------------- interior helpers

BANDS_G = [(0.0, 1.75, 'Int_GlazedGreen'), (1.75, 1.9, 'Int_GlazedWhite'), (1.9, 1.98, 'Int_GlazedGreen'), (1.98, 2.12, 'Int_GlazedWhite'),
           (2.12, 2.2, 'Int_GlazedGreen'), (2.2, G_CEIL, 'Int_GlazedWhite')]


def ground_walls(g):
    st = 0.75
    arch = arch_outline(ARCH['x0'], ARCH['x1'], -0.1, ARCH['spring'], seg=20)
    arch_w = [(3.85 - x, y) for x, y in arch]
    band_wall(g, (3.85, 0, ZI0), (-1, 0, 0), (0, 1, 0), 0.0, XI1 - XI0, BANDS_G, holes=[arch_w], step=st)
    ring = arch_outline(ARCH['x0'], ARCH['x1'], 0.0, ARCH['spring'], seg=20)
    n = np.array([0, 0, 1.0])
    for i in range(len(ring)):
        a2, b2 = np.array(ring[i]), np.array(ring[(i + 1) % len(ring)])
        if a2[1] < 0.01 and b2[1] < 0.01:
            continue
        A = np.array([a2[0], a2[1], -0.5])
        B = np.array([b2[0], b2[1], -0.5])
        g.quad(A, B, B - n * 0.1, A - n * 0.1, 'Int_Black')
    holes_e = []
    for kind, z in SIDE_G:
        a = z - ZI1
        holes_e.append(rect(a - 0.55, 2.4, a + 0.55, 4.2) if kind == 'win' else rect(a - 0.55, -0.1, a + 0.55, 2.55))
    band_wall(g, (XI1, 0, ZI1), (0, 0, 1), (0, 1, 0), 0.0, ZI0 - ZI1, BANDS_G, holes=holes_e, step=st)
    for kind, z in SIDE_G:
        if kind == 'door':
            for (p0, p1) in (((XI1, 0, z - 0.55), (W2 - 0.22, 0, z - 0.55)), ((W2 - 0.22, 0, z + 0.55), (XI1, 0, z + 0.55))):
                g.quad(p0, p1, (p1[0], 2.55, p1[2]), (p0[0], 2.55, p0[2]), 'Int_GlazedGreen')
            g.quad((XI1, 2.55, z - 0.55), (W2 - 0.22, 2.55, z - 0.55), (W2 - 0.22, 2.55, z + 0.55), (XI1, 2.55, z + 0.55), 'Int_GlazedWhite')
            g.quad((W2 - 0.221, 0, z + 0.55), (W2 - 0.221, 0, z - 0.55), (W2 - 0.221, 2.55, z - 0.55), (W2 - 0.221, 2.55, z + 0.55), 'Int_Black')
            g.lathe([(0.0, 0.0), (0.03, 0.0), (0.035, 0.035), (0.0, 0.06)], 8, (W2 - 0.29, 1.05, z + 0.43), 'Int_Brass', axis='x')
    band_wall(g, (XI0, 0, ZI0), (0, 0, -1), (0, 1, 0), 0.0, ZI0 - ZI1, BANDS_G, step=st)
    band_wall(g, (XI0, 0, ZI1), (1, 0, 0), (0, 1, 0), 0.0, XI1 - XI0, BANDS_G, step=st)
    prof = [(0.0, 0.0), (0.0, -0.08), (0.05, -0.1), (0.1, -0.18), (0.16, -0.2), (0.16, -0.24), (0.0, -0.24)]
    prof = [(s, t) for s, t in [(0.0, -0.24), (0.16, -0.24), (0.16, -0.2), (0.1, -0.16), (0.05, -0.08), (0.0, -0.06)]]
    path2 = [(XI0, G_CEIL, ZI0), (XI1, G_CEIL, ZI0), (XI1, G_CEIL, ZI1), (XI0, G_CEIL, ZI1)]
    g.sweep(path2, [(-s, t) for s, t in prof], 'Int_Tin', closed=True)


def ground_floor(g):
    hole_b = rect(BSTAIR['x0'] - 0.05, BSTAIR['zb'] + 0.1, BSTAIR['x1'] + 0.05, BSTAIR['zt'] - 0.05)
    hb = [(x, -z) for x, z in hole_b]
    g.plane2d(rect(XI0, -ZI0, XI1, -ZI1), (0, 0, 0), (1, 0, 0), (0, 0, -1), 'Int_Concrete', holes=[hb], step=0.42)
    g.plane2d(rect(ARCH['x0'], 0.0, ARCH['x1'], 0.6), (0, 0, 0), (1, 0, 0), (0, 0, -1), 'Int_Concrete')
    ring = [(x, -z) for x, z in hole_b]
    g.ring_side(ring, (0, 0, 0), (1, 0, 0), (0, 0, -1), np.array([0, 1.0, 0]), 0.35, 'Int_Concrete', hole=True)


def ground_ceiling(g):
    hz = [circle2d(POLE[0], POLE[1], 0.42, 20), rect(STAIR['x0'] - 0.02, STAIR['zt'] - 0.02, STAIR['x1'], STAIR['zb'])]
    g.plane2d(rect(XI0, ZI1, XI1, ZI0), (0, G_CEIL, 0), (1, 0, 0), (0, 0, 1), 'Int_Tin', holes=hz, step=0.9)
    c = circle2d(POLE[0], POLE[1], 0.42, 20)
    for i in range(len(c)):
        a2, b2 = c[i], c[(i + 1) % len(c)]
        g.quad((b2[0], G_CEIL, b2[1]), (a2[0], G_CEIL, a2[1]), (a2[0], U_FLOOR, a2[1]), (b2[0], U_FLOOR, b2[1]), 'Int_Brass')
    sx0, sx1, z0, z1 = STAIR['x0'], STAIR['x1'], STAIR['zt'] - 0.02, STAIR['zb']
    g.quad((sx1, G_CEIL, z1), (sx1, G_CEIL, z0), (sx1, U_FLOOR, z0), (sx1, U_FLOOR, z1), 'Int_GlazedWhite')
    g.quad((sx0, G_CEIL, z1), (sx1, G_CEIL, z1), (sx1, U_FLOOR, z1), (sx0, U_FLOOR, z1), 'Int_GlazedWhite')
    for zb in (-9.0, -15.0):
        g.box(XI0, XI1, G_CEIL - 0.42, G_CEIL, zb - 0.18, zb + 0.18, 'Int_GlazedWhite', skip=('+y',))


def column(g, x, z):
    prof = [(0.0, 0.0), (0.24, 0.0), (0.24, 0.3), (0.2, 0.34), (0.2, 0.42), (0.15, 0.48), (0.13, 0.6), (0.13, 1.4), (0.155, 1.43), (0.155, 1.5), (0.13, 1.53),
            (0.12, 3.6), (0.145, 3.63), (0.145, 3.7), (0.12, 3.73), (0.115, 4.7), (0.15, 4.8), (0.2, 4.95), (0.24, 5.05), (0.24, 5.18), (0.21, 5.18)]
    g.lathe(prof, 14, (x, 0, z), 'Int_CastIron')
    g.box(x - 0.26, x + 0.26, 5.18, G_CEIL - 0.42, z - 0.26, z + 0.26, 'Int_CastIron', skip=('+y',))


def pole(g):
    x, z = POLE
    g.cyl((x, 0.0, z), 0.045, U_CEIL - 0.0, 14, 'Int_Brass')
    g.lathe([(0.0, 0.0), (0.62, 0.0), (0.62, 0.05), (0.0, 0.06)], 24, (x, 0.0, z), 'Int_Rubber')
    g.lathe([(0.045, 0.0), (0.12, 0.0), (0.12, 0.06), (0.045, 0.08)], 12, (x, U_CEIL - 0.08, z), 'Int_Brass')


def stair_main(g, cols):
    x0, x1, zb, zt, n = STAIR['x0'], STAIR['x1'], STAIR['zb'], STAIR['zt'], STAIR['n']
    rise = U_FLOOR / n
    run = (zb - zt) / (n - 1)
    for i in range(n):
        y = rise * (i + 1)
        zf = zb - run * i
        zr = zf - run
        if i == n - 1:
            zr = zt - 0.0
        g.box(x0, x1, y - 0.045, y, zr, zf + 0.03, 'Int_OakDark', skip=('-y',) if i < n - 1 else ())
        g.quad((x0, y - rise, zf), (x1, y - rise, zf), (x1, y - 0.045, zf), (x0, y - 0.045, zf), 'Int_Black')
    for xx, nx in ((x1 + 0.03, 1), (x1, -1)):
        A = (xx, 0.0, zb + 0.03)
        B = (xx, 0.25, zb + 0.03)
        C = (xx, U_FLOOR + 0.12, zt)
        Dd = (xx, U_FLOOR - 0.3, zt)
        if nx > 0:
            g.poly([A, Dd, C, B][::-1], 'Int_Black')
        else:
            g.poly([A, B, C, Dd][::-1], 'Int_Black')
    g.quad((x1, 0.25, zb + 0.03), (x1 + 0.03, 0.25, zb + 0.03), (x1 + 0.03, U_FLOOR + 0.12, zt), (x1, U_FLOOR + 0.12, zt), 'Int_Black')
    g.quad((x1 + 0.03, 0.0, zb + 0.03), (x0, 0.0, zb + 0.03), (x0, U_FLOOR - 0.3, zt), (x1 + 0.03, U_FLOOR - 0.3, zt), 'Int_Black')
    hr = 0.92
    xr = x1 + 0.015
    for i in range(n - 1):
        for k in range(2):
            zf = zb - run * i - run * (0.25 + 0.5 * k)
            yb = rise * (i + 1)
            yt = yb + hr - 0.03
            g.box(xr - 0.012, xr + 0.012, yb, yt, zf - 0.012, zf + 0.012, 'Int_Black', skip=('+y', '-y'))
    rail = [(xr, hr + rise, zb + 0.15), (xr, U_FLOOR + hr, zt - 0.05)]
    d = np.array(rail[1]) - np.array(rail[0])
    L = np.linalg.norm(d)
    g.obox((np.array(rail[0]) + np.array(rail[1])) / 2, d / 2, np.array([0.035, 0, 0]), np.cross(d / L, [1, 0, 0]) * 0.035, 'Int_OakDark')
    rail2 = [(xr, 0.3 + rise, zb + 0.15), (xr, U_FLOOR + 0.3, zt - 0.05)]
    d2 = np.array(rail2[1]) - np.array(rail2[0])
    g.obox((np.array(rail2[0]) + np.array(rail2[1])) / 2, d2 / 2, np.array([0.015, 0, 0]), np.cross(d2 / L, [1, 0, 0]) * 0.02, 'Int_Black')
    newel(g, (xr, 0.0, zb + 0.15))
    cols.append(hull_object('Collider_StairMain', [(x0, 0.0, zb + 0.05), (x1 + 0.05, 0.0, zb + 0.05), (x0, U_FLOOR, zt), (x1 + 0.05, U_FLOOR, zt), (x0, U_FLOOR - 0.3, zt), (x1 + 0.05, U_FLOOR - 0.3, zt)], None))
    cols.append(hull_object('Collider_StairRail', [(x1, 0.0, zb + 0.15), (x1 + 0.06, 0.0, zb + 0.15), (x1, U_FLOOR + 1.0, zt), (x1 + 0.06, U_FLOOR + 1.0, zt), (x1, 1.2, zb + 0.15), (x1 + 0.06, 1.2, zb + 0.15)], None))


def newel(g, c):
    prof = [(0.0, 0.0), (0.12, 0.0), (0.12, 0.12), (0.09, 0.16), (0.07, 0.3), (0.075, 0.85), (0.11, 0.92), (0.11, 1.0), (0.07, 1.04), (0.09, 1.1), (0.09, 1.14), (0.0, 1.22)]
    g.lathe(prof, 10, c, 'Int_Black')
    g.lathe([(0.0, 0.0), (0.06, 0.02), (0.075, 0.08), (0.06, 0.14), (0.0, 0.16)], 10, (c[0], c[1] + 1.2, c[2]), 'Int_Brass')


def baluster_run(g, a, b, h, m='Int_OakDark', step=0.13, post_m='Int_OakDark'):
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = b - a
    L = np.linalg.norm(d)
    t = d / L
    nrm = np.cross(t, [0, 1, 0])
    g.obox(a + d / 2 + np.array([0, h - 0.03, 0]), t * L / 2, np.array([0, 0.04, 0]), nrm * 0.05, m)
    g.obox(a + d / 2 + np.array([0, 0.06, 0]), t * L / 2, np.array([0, 0.03, 0]), nrm * 0.04, m)
    k = int(L / step)
    for i in range(1, k):
        p = a + t * (L * i / k)
        g.lathe([(0.025, 0.09), (0.03, 0.15), (0.022, 0.25), (0.035, 0.45), (0.022, 0.65), (0.026, h - 0.08)], 6, (p[0], p[1], p[2]), m, cap=False)
    for p in (a, b):
        g.box(p[0] - 0.06, p[0] + 0.06, p[1], p[1] + h + 0.05, p[2] - 0.06, p[2] + 0.06, post_m, skip=('-y',))
        g.lathe([(0.0, 0.0), (0.05, 0.0), (0.065, 0.06), (0.05, 0.12), (0.0, 0.14)], 10, (p[0], p[1] + h + 0.05, p[2]), post_m)


def pipe_rail(g, pts, h, m='Int_SteelGrey'):
    pts = [np.asarray(p, float) for p in pts]
    for p in pts:
        g.cyl((p[0], p[1], p[2]), 0.022, h, 8, m, cap=True)
    for a, b in zip(pts[:-1], pts[1:]):
        for y in (h - 0.02, h * 0.5):
            d = b - a
            L = np.linalg.norm(d)
            c = (a + b) / 2 + np.array([0, y, 0])
            g.obox(c, d / 2, np.array([0, 0.02, 0]), np.cross(d / L, [0, 1, 0]) * 0.02, m)


def janine(g, em, emp, cols):
    baluster_run(g, (-1.95, 0.0, -2.6), (-1.95, 0.0, -5.6), 0.92)
    baluster_run(g, (-1.95, 0.0, -2.6), (XI0, 0.0, -2.6), 0.92)
    cols.append(hull_object('Collider_JanineRail', box_pts(-2.0, -1.9, 0.0, 1.0, -5.65, -2.55), None))
    cols.append(hull_object('Collider_JanineRail2', box_pts(XI0, -1.9, 0.0, 1.0, -2.65, -2.55), None))
    dx0, dx1, dz0, dz1 = -2.95, -2.2, -4.55, -3.05
    g.box(dx0, dx1, 0.71, 0.75, dz0, dz1, 'Int_SteelGrey')
    g.box(dx0 + 0.02, dx0 + 0.45, 0.06, 0.71, dz0 + 0.02, dz0 + 0.45, 'Int_SteelGrey', skip=('+y',))
    g.box(dx1 - 0.05, dx1 - 0.02, 0.1, 0.71, dz0 + 0.04, dz1 - 0.04, 'Int_SteelGrey')
    g.box(dx0 + 0.02, dx1 - 0.02, 0.0, 0.06, dz0 + 0.05, dz1 - 0.05, 'Int_Black', skip=('-y',))
    g.box(dx0 + 0.02, dx1 - 0.05, 0.06, 0.71, dz1 - 0.45, dz1 - 0.02, 'Int_SteelGrey', skip=('+y',))
    for k, y in enumerate((0.2, 0.42, 0.6)):
        g.box(dx1 - 0.05, dx1 - 0.02, y, y + 0.012, dz0 + 0.12, dz0 + 0.33, 'Int_Chrome')
    cols.append(hull_object('Collider_JanineDesk', box_pts(dx0, dx1, 0.0, 0.75, dz0, dz1), None))
    g.box(-2.62, -2.22, 0.75, 0.87, -3.62, -3.18, 'Int_Beige')
    g.box(-2.6, -2.24, 0.87, 1.19, -3.58, -3.22, 'Int_Beige')
    em.poly([(-2.605, 0.9, -3.27), (-2.605, 0.9, -3.53), (-2.605, 1.16, -3.53), (-2.605, 1.16, -3.27)], 'ScreenEmit', uv=atlas_uv('screen', [0, 1, 1, 0], [0, 0, 1, 1]))
    g.box(-2.85, -2.68, 0.75, 0.78, -3.65, -3.15, 'Int_Beige')
    g.box(-2.48, -2.3, 0.75, 0.82, -4.35, -4.1, 'Int_Beige')
    g.obox((-2.39, 0.84, -4.22), (0.04, 0, 0), (0, 0.025, 0), (0, 0, 0.12), 'Int_Beige')
    g.poly([(-2.205, 0.755, -3.75), (-2.205, 0.755, -4.15), (-2.205, 0.81, -4.15), (-2.205, 0.81, -3.75)], 'Int_Atlas', uv=atlas_uv('nameplate', [0, 1, 1, 0], [0, 0, 1, 1]))
    g.obox((-2.215, 0.78, -3.95), (0.012, 0, 0), (0, 0.03, 0), (0, 0, 0.2), 'Int_OakDark')
    g.cyl((-2.75, 0.75, -4.4), 0.04, 0.1, 8, 'Int_Black')
    for k in range(3):
        g.box(-2.9 + k * 0.01, -2.55 + k * 0.01, 0.75 + k * 0.004, 0.754 + k * 0.004, -4.0 + k * 0.03, -3.75 + k * 0.03, 'Int_Paper')
    g.lathe([(0.0, 0.0), (0.08, 0.0), (0.06, 0.03), (0.02, 0.06), (0.02, 0.32)], 10, (-2.8, 0.75, -3.25), 'Int_Brass', cap=False)
    em.lathe([(0.17, 0.3), (0.1, 0.52)], 14, (-2.8, 0.75, -3.25), 'LampShadeEmit', cap=False)
    chair(g, (-3.45, 0.0, -3.8), math.pi / 2)
    emp['JanineSeat'] = ((-3.38, 0.47, -3.8), math.pi / 2)
    for k in range(3):
        z0 = -5.15 - k * 0.55
        g.box(XI0 + 0.02, XI0 + 0.7, 0.0, 1.38, z0 - 0.53, z0, 'Int_FilingBeige')
        for j in range(4):
            y0 = 0.06 + j * 0.33
            g.box(XI0 + 0.7, XI0 + 0.72, y0, y0 + 0.3, z0 - 0.51, z0 - 0.02, 'Int_FilingBeige')
            g.box(XI0 + 0.72, XI0 + 0.745, y0 + 0.2, y0 + 0.22, z0 - 0.33, z0 - 0.2, 'Int_Chrome')
            g.box(XI0 + 0.72, XI0 + 0.725, y0 + 0.24, y0 + 0.28, z0 - 0.31, z0 - 0.22, 'Int_Paper')
    cols.append(hull_object('Collider_Filing', box_pts(XI0, XI0 + 0.75, 0.0, 1.4, -6.8, -5.1), None))
    g.lathe([(0.0, 0.0), (0.12, 0.0), (0.15, 0.25), (0.0, 0.26)], 10, (XI0 + 0.35, 1.38, -5.4), 'Int_Cardboard')
    paneling(g, ZI0 - 0.02, -7.4, 2.7)
    for k, (z, y) in enumerate(((-2.0, 1.95), (-3.4, 1.9), (-4.6, 2.0))):
        g.poly([(XI0 + 0.04, y - 0.3, z + 0.42), (XI0 + 0.04, y - 0.3, z - 0.42), (XI0 + 0.04, y + 0.3, z - 0.42), (XI0 + 0.04, y + 0.3, z + 0.42)], 'Int_Atlas', uv=atlas_uv(f'photo{k}', [0, 1, 1, 0], [0, 0, 1, 1]))
    alarm_bell(g, em, emp, (XI0, 3.35, -4.0))


def paneling(g, z0, z1, h, x=XI0):
    g.box(x, x + 0.03, 0.0, h, z1, z0, 'Int_Oak', skip=('-x',))
    g.box(x, x + 0.06, h - 0.1, h, z1, z0, 'Int_OakDark', skip=('-x',))
    g.box(x, x + 0.05, 0.0, 0.18, z1, z0, 'Int_OakDark', skip=('-x',))
    L = z0 - z1
    k = max(1, int(L / 0.9))
    for i in range(k):
        za = z0 - L * i / k - 0.08
        zb = z0 - L * (i + 1) / k + 0.08
        for (y0, y1) in ((0.28, 1.0), (1.12, h - 0.2)):
            g.box(x + 0.03, x + 0.05, y0, y1, zb, za, 'Int_Oak', skip=('-x',))
            g.box(x + 0.03, x + 0.055, y0, y0 + 0.05, zb, za, 'Int_OakDark', skip=('-x',))
            g.box(x + 0.03, x + 0.055, y1 - 0.05, y1, zb, za, 'Int_OakDark', skip=('-x',))


def chair(g, c, yaw, m='Int_OakDark', seat='Int_Leather'):
    cx, cy, cz = c
    R = np.array([[math.cos(yaw), 0, math.sin(yaw)], [0, 1, 0], [-math.sin(yaw), 0, math.cos(yaw)]])
    def P(x, y, z):
        return np.array([cx, cy, cz]) + R @ np.array([x, y, z])
    ax = R @ np.array([1, 0, 0.0])
    ay = np.array([0, 1, 0.0])
    az = R @ np.array([0, 0, 1.0])
    g.obox(P(0, 0.45, 0), ax * 0.22, ay * 0.035, az * 0.22, seat)
    g.obox(P(0, 0.75, -0.2), ax * 0.21, ay * 0.22, az * 0.025, seat)
    g.cyl(tuple(P(0, 0.08, 0)), 0.03, 0.34, 8, 'Int_Chrome')
    for k in range(5):
        a = k * 2 * math.pi / 5
        d = R @ np.array([math.cos(a), 0, math.sin(a)])
        g.obox(P(0, 0.06, 0) + d * 0.15, d * 0.15, ay * 0.015, np.cross(d, [0, 1, 0]) * 0.02, 'Int_Black')
    g.obox(P(0, 0.58, -0.2), ax * 0.03, ay * 0.12, az * 0.02, 'Int_Chrome')


def alarm_bell(g, em, emp, c):
    x, y, z = c
    g.box(x, x + 0.04, y - 0.28, y + 0.28, z - 0.22, z + 0.22, 'Int_OakDark')
    g.lathe([(0.0, 0.0), (0.16, 0.0), (0.16, 0.03), (0.14, 0.08), (0.08, 0.12), (0.0, 0.13)], 18, (x + 0.04, y, z), 'Int_Brass', axis='x')
    em.lathe([(0.0, 0.0), (0.04, 0.0), (0.045, 0.03), (0.03, 0.06), (0.0, 0.065)], 10, (x + 0.04, y - 0.4, z), 'AlarmLightEmit', axis='x')
    emp['AlarmBell'] = ((x + 0.15, y, z), math.pi / 2)


def tool_area(g, cols):
    for k, z in enumerate((-3.3, -4.25)):
        x0 = XI1 - 0.5
        g.box(x0, XI1 - 0.02, 0.1, 0.95, z - 0.45, z + 0.45, 'Int_ToolRed')
        for j in range(5):
            y0 = 0.16 + j * 0.155
            g.box(x0 - 0.015, x0, y0, y0 + 0.14, z - 0.42, z + 0.42, 'Int_ToolRed')
            g.box(x0 - 0.03, x0 - 0.015, y0 + 0.09, y0 + 0.11, z - 0.2, z + 0.2, 'Int_Chrome')
        g.box(x0, XI1 - 0.02, 0.95, 1.38, z - 0.43, z + 0.43, 'Int_ToolRed')
        g.box(x0 - 0.04, XI1, 1.38, 1.42, z - 0.45, z + 0.45, 'Int_Black')
        for w in (-0.35, 0.35):
            g.lathe([(0.0, 0.0), (0.045, 0.0), (0.045, 0.03), (0.0, 0.04)], 8, (x0 + 0.1, 0.05, z + w), 'Int_Black', axis='x')
    cols.append(hull_object('Collider_ToolChests', box_pts(XI1 - 0.55, XI1, 0.0, 1.42, -4.7, -2.85), None))
    for k, (dx, dz, h) in enumerate(((0.0, 0.0, 0.3), (0.1, 0.25, 0.22), (-0.05, 0.6, 0.35))):
        g.cyl((XI1 - 0.25 + dx, 1.42, -3.6 + dz), 0.06, h, 10, ['Int_ToolRed', 'Int_Paper', 'Int_SteelGrey'][k])
    shelf(g, XI1 - 0.45, XI1, -6.0, -7.6, 2.2, cols, 'Collider_ShelfTools')
    g.cyl((XI1 - 0.35, 0.0, -8.2), 0.26, 0.72, 14, 'Int_SteelGrey')
    g.lathe([(0.0, 0.72), (0.28, 0.72), (0.28, 0.76), (0.0, 0.8)], 14, (XI1 - 0.35, 0.0, -8.2), 'Int_SteelGrey')
    g.cyl((XI1 - 0.08, 1.0, -1.6), 0.08, 0.5, 10, 'Int_ToolRed')
    g.box(XI1 - 0.04, XI1, 1.5, 1.7, -1.62, -1.58, 'Int_Black')


def shelf(g, x0, x1, z0, z1, h, cols, name, boxes=True, m='Int_SteelGrey', seed=1):
    r = np.random.default_rng(seed)
    za, zb = min(z0, z1), max(z0, z1)
    for x in (x0 + 0.02, x1 - 0.02):
        for z in (za + 0.02, zb - 0.02):
            g.box(x - 0.02, x + 0.02, 0.0, h, z - 0.02, z + 0.02, m)
    levels = np.linspace(0.12, h - 0.05, 5)
    for y in levels:
        g.box(x0, x1, y - 0.02, y, za, zb, m)
        if boxes and y < h - 0.2:
            z = za + 0.05
            while z < zb - 0.15:
                w = float(r.uniform(0.15, 0.45))
                hh = float(r.uniform(0.12, 0.3))
                if z + w > zb - 0.05:
                    break
                mm = ['Int_Cardboard', 'Int_Cardboard', 'Int_Paper', 'Int_ToolRed', 'Int_SteelGrey', 'Int_Black'][int(r.integers(0, 6))]
                g.box(x0 + 0.04, x1 - 0.04, y, y + hh, z, z + w, mm)
                z += w + float(r.uniform(0.02, 0.12))
    if cols is not None:
        cols.append(hull_object(name, box_pts(x0, x1, 0.0, h, za, zb), None))


def rear_hall(g, cols):
    shelf(g, -1.2, 1.2, ZI1 + 0.05, ZI1 + 0.55, 2.4, cols, 'Collider_RearShelf1', seed=3)
    shelf(g, 1.4, 2.5, ZI1 + 0.05, ZI1 + 0.55, 2.4, cols, 'Collider_RearShelf2', seed=4)
    shelf(g, XI0, XI0 + 0.5, -19.0, -23.5, 2.2, cols, 'Collider_RearShelf3', seed=5)
    g.box(XI0 + 0.05, XI0 + 0.65, 0.0, 0.85, -24.5, -25.6, 'Int_SteelGrey')
    g.box(XI0 + 0.1, XI0 + 0.6, 0.85, 0.9, -24.55, -25.55, 'Int_Chrome')
    cols.append(hull_object('Collider_Sink', box_pts(XI0, XI0 + 0.7, 0.0, 0.9, -25.6, -24.5), None))
    for k, (x, z) in enumerate(((0.5, -21.0), (1.0, -21.6), (0.6, -22.4), (-0.6, -25.0))):
        s = 0.5 if k < 3 else 0.6
        g.box(x - s / 2, x + s / 2, 0.0 + (0.5 if k == 1 else 0.0), s + (0.5 if k == 1 else 0.0), z - s / 2, z + s / 2, 'Int_Cardboard')
    cols.append(hull_object('Collider_Crates', box_pts(0.25, 1.25, 0.0, 1.0, -22.65, -20.75), None))
    pipe_rail(g, [(BSTAIR['x0'] - 0.05, 0.0, BSTAIR['zt'] - 0.03), (BSTAIR['x0'] - 0.05, 0.0, BSTAIR['zb'] + 0.08), (BSTAIR['x1'] - 0.02, 0.0, BSTAIR['zb'] + 0.08)], 1.0)
    cols.append(hull_object('Collider_BRail1', box_pts(BSTAIR['x0'] - 0.09, BSTAIR['x0'] - 0.01, 0.0, 1.05, BSTAIR['zt'] - 0.05, BSTAIR['zb'] + 0.1), None))
    cols.append(hull_object('Collider_BRail2', box_pts(BSTAIR['x0'] - 0.09, BSTAIR['x1'], 0.0, 1.05, BSTAIR['zb'] + 0.04, BSTAIR['zb'] + 0.12), None))
    g.box(-0.6, 0.6, 0.0, 1.0, -17.6, -19.2, 'Int_OakDark')
    g.box(-0.65, 0.65, 0.95, 1.0, -17.55, -19.25, 'Int_Oak')
    for k in range(4):
        g.box(-0.5 + k * 0.28, -0.3 + k * 0.28, 1.0, 1.1 + 0.05 * k, -18.2, -18.5, ['Int_SteelGrey', 'Int_Black', 'Int_ToolRed', 'Int_Cardboard'][k])
    cols.append(hull_object('Collider_Workbench', box_pts(-0.65, 0.65, 0.0, 1.0, -19.25, -17.55), None))


def globe(em, g, c, drop=1.3):
    x, y, z = c
    g.cyl((x, y, z), 0.008, G_CEIL - y if drop is None else drop, 4, 'Int_Black', cap=False)
    g.lathe([(0.05, 0.0), (0.09, 0.05), (0.04, 0.14)], 10, (x, y + 0.12, z), 'Int_Brass', cap=False)
    em.lathe([(0.0, -0.2), (0.12, -0.18), (0.19, -0.08), (0.19, 0.05), (0.12, 0.14), (0.06, 0.17)], 14, (x, y - 0.06, z), 'GlobeEmit', cap=False)


def garage(cols, emp):
    g = MB()
    em = MB()
    ground_walls(g)
    ground_floor(g)
    ground_ceiling(g)
    for x in (-2.2, 2.2):
        for z in (-9.0, -15.0):
            column(g, x, z)
            cols.append(hull_object(f'Collider_Column_{"W" if x < 0 else "E"}{int(-z)}', box_pts(x - 0.25, x + 0.25, 0.0, G_CEIL, z - 0.25, z + 0.25), None))
    pole(g)
    stair_main(g, cols)
    janine(g, em, emp, cols)
    tool_area(g, cols)
    rear_hall(g, cols)
    paneling(g, -15.6, -18.6, 2.4, x=XI0)
    for z in (-3.2, -8.0, -12.6, -19.0, -24.0):
        globe(em, g, (0.25 if z > -11 else 0.0, G_CEIL - 1.2, z), drop=1.2)
    emp['EctoBay'] = ((0.25, 0.0, -7.25), 0.0)
    emp['PlayerSpawn'] = ((-1.55, 0.0, -12.2), 0.0)
    emp['PoleBottom'] = ((POLE[0], 0.0, POLE[1]), 0.0)
    emp['PoleExit'] = ((POLE[0] + 0.6, 0.0, POLE[1] + 0.75), math.pi / 2)
    emp['StairBottom'] = (((STAIR['x0'] + STAIR['x1']) / 2, 0.0, STAIR['zb'] + 0.6), math.pi)
    emp['BasementStairTop'] = (((BSTAIR['x0'] + BSTAIR['x1']) / 2, 0.0, BSTAIR['zt'] - 0.5), 0.0)
    emp['GarageDoorOutside'] = ((0.0, 0.0, 2.5), math.pi)
    emp['GarageDoorInside'] = ((0.0, 0.0, -1.5), 0.0)
    return g, em


# ---------------------------------------------------------------- upper floor

def upper(cols, emp):
    u = MB()
    em = MB()
    y0 = U_FLOOR
    hz = [circle2d(POLE[0], POLE[1], 0.42, 20), rect(STAIR['x0'] - 0.02, STAIR['zt'] - 0.02, STAIR['x1'], STAIR['zb'])]
    u.plane2d(rect(XI0, -ZI0, XI1, -ZI1), (0, y0, 0), (1, 0, 0), (0, 0, -1), 'Int_Floor', holes=[[(x, -z) for x, z in h] for h in hz], step=0.5)
    u.plane2d(rect(XI0, ZI1, XI1, ZI0), (0, U_CEIL, 0), (1, 0, 0), (0, 0, 1), 'Int_Plaster', step=1.0)
    UB = [(y0, y0 + 0.16, 'Int_OakDark'), (y0 + 0.16, U_CEIL, 'Int_Plaster')]
    fw = window_holes_front()[0]
    fwi = [(3.85 - x, y) for x, y in fw]
    band_wall(u, (XI1, 0, ZI0), (-1, 0, 0), (0, 1, 0), 0.0, XI1 - XI0, UB, holes=[fwi], step=0.9)
    holes_e = [rect(z - ZI1 - 0.58, 6.9, z - ZI1 + 0.58, 9.4) for z in SIDE_BAYS]
    band_wall(u, (XI1, 0, ZI1), (0, 0, 1), (0, 1, 0), 0.0, ZI0 - ZI1, UB, holes=holes_e, step=0.9)
    band_wall(u, (XI0, 0, ZI0), (0, 0, -1), (0, 1, 0), 0.0, ZI0 - ZI1, UB, step=0.9)
    hr = []
    for (a0, a1) in ((1.6, 2.6), (6.0, 7.0)):
        xw0, xw1 = W2 - a1, W2 - a0
        hr.append(rect(xw0 - XI0, 7.2, xw1 - XI0, 9.2))
    band_wall(u, (XI0, 0, ZI1), (1, 0, 0), (0, 1, 0), 0.0, XI1 - XI0, UB, holes=hr, step=0.9)
    # partition z=-10.4 (bunk room / corridor+office)
    zp = -10.4
    for face, (o, uu) in (('n', ((XI1, 0, zp - 0.06), (-1, 0, 0))), ('s', ((XI0, 0, zp + 0.06), (1, 0, 0)))):
        if face == 'n':
            hole = rect(XI1 + 1.5, y0, XI1 + 2.6, y0 + 2.2)
            hole = rect(XI1 - (-1.5), y0 - 0.01, XI1 - (-2.6), y0 + 2.2)
        else:
            hole = rect(-2.6 - XI0, y0 - 0.01, -1.5 - XI0, y0 + 2.2)
        band_wall(u, o, uu, (0, 1, 0), 0.0, XI1 - XI0, UB, holes=[hole], step=0.9)
    u.quad((-2.6, y0, zp - 0.06), (-2.6, y0, zp + 0.06), (-2.6, y0 + 2.2, zp + 0.06), (-2.6, y0 + 2.2, zp - 0.06), 'Int_Plaster')
    u.quad((-1.5, y0, zp + 0.06), (-1.5, y0, zp - 0.06), (-1.5, y0 + 2.2, zp - 0.06), (-1.5, y0 + 2.2, zp + 0.06), 'Int_Plaster')
    u.quad((-2.6, y0 + 2.2, zp + 0.06), (-1.5, y0 + 2.2, zp + 0.06), (-1.5, y0 + 2.2, zp - 0.06), (-2.6, y0 + 2.2, zp - 0.06), 'Int_Plaster')
    cols.append(hull_object('Collider_PartA1', box_pts(XI0, -2.6, y0, U_CEIL, zp - 0.06, zp + 0.06), None))
    cols.append(hull_object('Collider_PartA2', box_pts(-1.5, XI1, y0, U_CEIL, zp - 0.06, zp + 0.06), None))
    # office partition x=-1.2 (z -10.4 .. -17.6) with door, z=-17.6 back wall
    xo = -1.2
    zo1 = -17.6
    L = zp - zo1
    door_o = rect(0.5, y0 - 0.01, 1.45, y0 + 2.2)
    band_wall(u, (xo - 0.06, 0, zp - 0.06), (0, 0, -1), (0, 1, 0), 0.0, L - 0.06, [(y0, y0 + 1.0, 'Int_OakDark'), (y0 + 2.3, U_CEIL, 'Int_Plaster')], holes=[door_o], step=0.9)
    band_wall(u, (xo + 0.06, 0, zo1), (0, 0, 1), (0, 1, 0), 0.0, L - 0.06, [(y0, y0 + 1.0, 'Int_OakDark'), (y0 + 2.3, U_CEIL, 'Int_Plaster')], holes=[rect(L - 0.06 - 1.45, y0 - 0.01, L - 0.06 - 0.5, y0 + 2.2)], step=0.9)
    for (za, zb) in ((zp - 0.06, zp - 0.56), (zp - 1.51, zo1)):
        nseg = max(1, int(abs(za - zb) / 1.0))
        for k in range(nseg):
            a = za + (zb - za) * k / nseg
            b = za + (zb - za) * (k + 1) / nseg
            u.box(xo - 0.06, xo + 0.06, y0 + 1.0, y0 + 2.3, min(a, b), max(a, b), 'Int_Oak', skip=('+x', '-x'))
            u.box(xo - 0.06, xo + 0.06, y0 + 1.0, y0 + 1.08, min(a, b), max(a, b), 'Int_Oak')
            u.box(xo - 0.06, xo + 0.06, y0 + 2.22, y0 + 2.3, min(a, b), max(a, b), 'Int_Oak')
            u.box(xo - 0.05, xo + 0.05, y0 + 1.08, y0 + 2.22, min(a, b), min(a, b) + 0.06, 'Int_Oak')
            u.poly([(xo, y0 + 1.08, max(a, b)), (xo, y0 + 1.08, min(a, b) + 0.06), (xo, y0 + 2.22, min(a, b) + 0.06), (xo, y0 + 2.22, max(a, b))], 'Ext_Glass')
    u.box(xo - 0.06, xo + 0.06, y0 + 2.2, y0 + 2.3, zp - 1.51, zp - 0.56, 'Int_Oak')
    u.box(xo - 0.06, xo + 0.06, y0, y0 + 2.2, zp - 0.62, zp - 0.56, 'Int_Oak')
    u.box(xo - 0.06, xo + 0.06, y0, y0 + 2.2, zp - 1.51, zp - 1.45, 'Int_Oak')
    cols.append(hull_object('Collider_OfficeW1', box_pts(xo - 0.06, xo + 0.06, y0, U_CEIL, zp - 0.56, zp), None))
    cols.append(hull_object('Collider_OfficeW2', box_pts(xo - 0.06, xo + 0.06, y0, U_CEIL, zo1, zp - 1.51), None))
    zb_ = zo1
    band_wall(u, (XI1, 0, zb_ + 0.06), (-1, 0, 0), (0, 1, 0), 0.0, XI1 - xo, [(y0, y0 + 0.16, 'Int_OakDark'), (y0 + 0.16, y0 + 2.4, 'Int_Oak'), (y0 + 2.4, U_CEIL, 'Int_Plaster')], step=0.9)
    band_wall(u, (xo, 0, zb_ - 0.06), (1, 0, 0), (0, 1, 0), 0.0, XI1 - xo, UB, step=0.9)
    u.quad((xo - 0.06, y0, zb_ - 0.06), (xo - 0.06, y0, zb_ + 0.06), (xo - 0.06, U_CEIL, zb_ + 0.06), (xo - 0.06, U_CEIL, zb_ - 0.06), 'Int_Plaster')
    cols.append(hull_object('Collider_OfficeBack', box_pts(xo, XI1, y0, U_CEIL, zb_ - 0.06, zb_ + 0.06), None))
    for zz0, zz1 in ((zp - 0.06, -11.85), (-13.15, zb_ + 0.06)):
        u.box(XI1 - 0.04, XI1, y0, y0 + 2.4, zz1, zz0, 'Int_Oak', skip=('+x',))
    # stairwell rail and pole guard
    baluster_run(u, (STAIR['x1'] + 0.02, y0, STAIR['zb'] - 0.02), (STAIR['x1'] + 0.02, y0, STAIR['zt'] + 0.9), 0.95, m='Int_Black', post_m='Int_Black')
    baluster_run(u, (XI0, y0, STAIR['zb'] - 0.02), (STAIR['x1'] + 0.02, y0, STAIR['zb'] - 0.02), 0.95, m='Int_Black', post_m='Int_Black')
    cols.append(hull_object('Collider_UStairRail', box_pts(STAIR['x1'], STAIR['x1'] + 0.08, y0, y0 + 1.0, STAIR['zt'] + 0.9, STAIR['zb']), None))
    cols.append(hull_object('Collider_UStairRail2', box_pts(XI0, STAIR['x1'] + 0.08, y0, y0 + 1.0, STAIR['zb'] - 0.06, STAIR['zb'] + 0.02), None))
    px, pz = POLE
    for k in range(13):
        a0 = math.radians(-60 + k * 20)
        a1 = math.radians(-60 + (k + 1) * 20)
        if k == 12:
            break
        p0 = np.array([px + 0.62 * math.cos(a0), y0 + 1.0, pz - 0.62 * math.sin(a0)])
        p1 = np.array([px + 0.62 * math.cos(a1), y0 + 1.0, pz - 0.62 * math.sin(a1)])
        d = p1 - p0
        u.obox((p0 + p1) / 2, d / 2, np.array([0, 0.022, 0]), np.cross(d / np.linalg.norm(d), [0, 1, 0]) * 0.022, 'Int_Brass')
    for k in range(0, 13, 3):
        a = math.radians(-60 + k * 20)
        u.cyl((px + 0.62 * math.cos(a), y0, pz - 0.62 * math.sin(a)), 0.022, 1.0, 8, 'Int_Brass')
    c = circle2d(px, pz, 0.42, 20)
    for k in range(4):
        a0 = math.radians(-60 + k * 60)
        a1 = math.radians(-60 + (k + 1) * 60)
        p0 = (px + 0.62 * math.cos(a0), pz - 0.62 * math.sin(a0))
        p1 = (px + 0.62 * math.cos(a1), pz - 0.62 * math.sin(a1))
        cols.append(hull_object(f'Collider_PoleGuard{k}', [(p0[0], y0, p0[1]), (p1[0], y0, p1[1]), (p0[0], y0 + 1.05, p0[1]), (p1[0], y0 + 1.05, p1[1]),
                                                          (p0[0] * 0.98 + px * 0.02, y0, p0[1] * 0.98 + pz * 0.02), (p1[0] * 0.98 + px * 0.02, y0 + 1.05, p1[1] * 0.98 + pz * 0.02)], None))
    emp['PoleTop'] = ((px, y0, pz), 0.0)
    a = math.radians(-120)
    emp['PoleEntry'] = ((px + 0.85 * math.cos(math.radians(-150)), y0, pz - 0.85 * math.sin(math.radians(-150))), -math.pi / 2 + math.radians(30))
    emp['StairTop'] = (((STAIR['x0'] + STAIR['x1']) / 2, y0, STAIR['zt'] - 0.6), math.pi)
    bunks(u, cols)
    office(u, em, cols, emp)
    lab(u, em, cols, emp)
    for (x, z, eml) in ((0.6, -5.0, 'g'), (-2.0, -14.0, 'g'), (1.3, -14.0, 'g')):
        em.lathe([(0.0, -0.12), (0.2, -0.1), (0.24, -0.02), (0.24, 0.0)], 16, (x, U_CEIL, z), 'GlobeEmit', cap=False)
    for (x0, x1, z) in ((-1.6, 1.6, -20.5), (-1.6, 1.6, -24.0)):
        u.box(x0 - 0.05, x1 + 0.05, U_CEIL - 0.1, U_CEIL, z - 0.16, z + 0.16, 'Int_SteelGrey', skip=('+y',))
        for dz in (-0.07, 0.07):
            em.cyl((x0, U_CEIL - 0.13, z + dz), 0.02, x1 - x0, 8, 'TubeEmit', axis='x')
    return u, em


def bed(u, x, z, cols, name):
    y0 = U_FLOOR
    x0, x1 = x - 0.48, x + 0.48
    z0, z1 = z - 1.0, z + 1.0
    for xx in (x0, x1):
        for zz in (z0, z1):
            u.cyl((xx, y0, zz), 0.022, 0.45 if zz == z0 else 0.95, 8, 'Int_SteelGrey')
    u.box(x0, x1, y0 + 0.36, y0 + 0.4, z0, z1, 'Int_SteelGrey')
    u.box(x0 + 0.03, x1 - 0.03, y0 + 0.4, y0 + 0.55, z0 + 0.03, z1 - 0.03, 'Int_Mattress')
    u.box(x0 + 0.02, x1 - 0.02, y0 + 0.55, y0 + 0.6, z0 + 0.02, z1 - 0.5, 'Int_Fabric')
    u.box(x0 + 0.1, x1 - 0.1, y0 + 0.55, y0 + 0.66, z1 - 0.42, z1 - 0.1, 'Int_Mattress')
    for yy in (0.6, 0.85):
        u.box(x0, x1, y0 + yy, y0 + yy + 0.03, z1 - 0.012, z1 + 0.012, 'Int_SteelGrey')
    cols.append(hull_object(name, box_pts(x0, x1, y0, y0 + 0.6, z0, z1), None))


def bunks(u, cols):
    for k, z in enumerate((-2.2, -4.8, -7.6)):
        x = XI1 - 1.05
        bed(u, x, z, cols, f'Collider_Bed{k}')
    for k in range(7):
        z0 = -1.0 - k * 0.42
        x0 = XI0
        u.box(x0, x0 + 0.48, U_FLOOR, U_FLOOR + 1.85, z0 - 0.4, z0, 'Int_SteelGrey')
        u.box(x0 + 0.48, x0 + 0.5, U_FLOOR + 0.05, U_FLOOR + 1.8, z0 - 0.39, z0 - 0.01, 'Int_SteelGrey')
        for y in (1.55, 1.6, 1.65):
            u.box(x0 + 0.5, x0 + 0.505, U_FLOOR + y, U_FLOOR + y + 0.02, z0 - 0.33, z0 - 0.07, 'Int_Black')
        u.box(x0 + 0.5, x0 + 0.52, U_FLOOR + 1.0, U_FLOOR + 1.12, z0 - 0.36, z0 - 0.33, 'Int_Chrome')
    cols.append(hull_object('Collider_Lockers', box_pts(XI0, XI0 + 0.52, U_FLOOR, U_FLOOR + 1.85, -1.0 - 7 * 0.42, -1.0), None))
    u.box(-1.0, 0.4, U_FLOOR + 0.72, U_FLOOR + 0.76, -5.5, -4.5, 'Int_Oak')
    for xx in (-0.95, 0.35):
        for zz in (-5.45, -4.55):
            u.box(xx - 0.025, xx + 0.025, U_FLOOR, U_FLOOR + 0.72, zz - 0.025, zz + 0.025, 'Int_OakDark')
    cols.append(hull_object('Collider_BunkTable', box_pts(-1.0, 0.4, U_FLOOR, U_FLOOR + 0.76, -5.5, -4.5), None))
    for k in range(5):
        u.box(-0.8 + k * 0.2, -0.65 + k * 0.2, U_FLOOR + 0.76, U_FLOOR + 0.78, -5.2, -4.9, 'Int_Paper')


def office(u, em, cols, emp):
    y0 = U_FLOOR
    dx0, dx1, dz0, dz1 = 1.0, 2.9, -14.9, -14.0
    u.box(dx0, dx1, y0 + 0.72, y0 + 0.77, dz0, dz1, 'Int_OakDark')
    u.box(dx0 + 0.03, dx0 + 0.55, y0, y0 + 0.72, dz0 + 0.03, dz1 - 0.03, 'Int_Oak')
    u.box(dx1 - 0.55, dx1 - 0.03, y0, y0 + 0.72, dz0 + 0.03, dz1 - 0.03, 'Int_Oak')
    u.box(dx0 + 0.55, dx1 - 0.55, y0 + 0.2, y0 + 0.72, dz1 - 0.06, dz1 - 0.03, 'Int_Oak')
    cols.append(hull_object('Collider_OfficeDesk', box_pts(dx0, dx1, y0, y0 + 0.77, dz0, dz1), None))
    u.poly([(dx0 + 0.75, y0 + 0.775, dz1 + 0.003), (dx0 + 1.15, y0 + 0.775, dz1 + 0.003), (dx0 + 1.15, y0 + 0.83, dz1 + 0.003), (dx0 + 0.75, y0 + 0.83, dz1 + 0.003)], 'Int_Atlas', uv=atlas_uv('nameplate2', [0, 1, 1, 0], [0, 0, 1, 1]))
    for k in range(6):
        u.box(dx0 + 0.1 + k * 0.05, dx0 + 0.42 + k * 0.05, y0 + 0.77 + k * 0.012, y0 + 0.78 + k * 0.012, dz0 + 0.12 + k * 0.03, dz0 + 0.42 + k * 0.03, 'Int_Paper')
    u.box(dx1 - 0.6, dx1 - 0.3, y0 + 0.77, y0 + 1.05, dz0 + 0.1, dz0 + 0.3, 'Int_Cardboard')
    u.lathe([(0.0, 0.0), (0.08, 0.0), (0.06, 0.03), (0.02, 0.06), (0.02, 0.3)], 10, (dx1 - 0.2, y0 + 0.77, dz0 + 0.65), 'Int_Brass', cap=False)
    em.lathe([(0.16, 0.28), (0.1, 0.48)], 14, (dx1 - 0.2, y0 + 0.77, dz0 + 0.65), 'LampShadeEmit', cap=False)
    chair(u, (1.95, y0, -15.4), 0.0)
    chair(u, (1.6, y0, -13.3), math.pi)
    chair(u, (2.5, y0, -13.3), math.pi)
    u.box(XI1 - 0.85, XI1 - 0.02, y0, y0 + 0.42, -16.0, -17.45, 'Int_Leather')
    u.box(XI1 - 0.25, XI1 - 0.02, y0 + 0.42, y0 + 0.85, -16.0, -17.45, 'Int_Leather')
    cols.append(hull_object('Collider_Sofa', box_pts(XI1 - 0.85, XI1, y0, y0 + 0.85, -17.45, -16.0), None))
    u.poly([(1.5, y0 + 1.2, -17.53), (-0.9, y0 + 1.2, -17.53), (-0.9, y0 + 2.25, -17.53), (1.5, y0 + 2.25, -17.53)], 'Int_Atlas', uv=atlas_uv('pinboard', [0, 1, 1, 0], [0, 0, 1, 1]))
    for k, (zc, y) in enumerate(((-11.0, 7.8), (-13.9, 7.7), (-15.3, 7.9))):
        if k == 0:
            continue
        u.poly([(XI1 - 0.045, y - 0.3, zc - 0.42), (XI1 - 0.045, y - 0.3, zc + 0.42), (XI1 - 0.045, y + 0.3, zc + 0.42), (XI1 - 0.045, y + 0.3, zc - 0.42)], 'Int_Atlas', uv=atlas_uv(f'photo{k + 2}', [0, 1, 1, 0], [0, 0, 1, 1]))
    u.box(XI1 - 0.62, XI1 - 0.02, y0, y0 + 1.38, -10.55, -11.1, 'Int_FilingBeige')
    cols.append(hull_object('Collider_OfficeFiling', box_pts(XI1 - 0.62, XI1, y0, y0 + 1.38, -11.1, -10.5), None))
    emp['OfficeDesk'] = ((1.95, y0, -15.4), 0.0)


def lab(u, em, cols, emp):
    y0 = U_FLOOR
    r = np.random.default_rng(9)
    bx0, bx1, bz0, bz1 = XI1 - 0.8, XI1 - 0.02, -25.6, -18.6
    u.box(bx0, bx1, y0 + 0.86, y0 + 0.92, bz0, bz1, 'Int_OakDark')
    u.box(bx0 + 0.04, bx1 - 0.04, y0, y0 + 0.86, bz0 + 0.04, bz1 - 0.04, 'Int_SteelGrey', skip=('+y',))
    cols.append(hull_object('Collider_LabBench', box_pts(bx0, bx1, y0, y0 + 0.92, bz0, bz1), None))
    z = bz1 - 0.15
    k = 0
    while z > bz0 + 0.3:
        w = float(r.uniform(0.35, 0.7))
        h = float(r.uniform(0.18, 0.42))
        d = float(r.uniform(0.3, 0.55))
        mm = ['Int_SteelGrey', 'Int_Beige', 'Int_Black', 'Int_SteelGrey'][k % 4]
        u.box(XI1 - 0.05 - d, XI1 - 0.05, y0 + 0.92, y0 + 0.92 + h, z - w, z, mm)
        fx = XI1 - 0.05 - d - 0.002
        if k % 3 == 0:
            em.poly([(fx, y0 + 0.98, z - 0.05), (fx, y0 + 0.98, z - w + 0.05), (fx, y0 + 0.92 + h - 0.05, z - w + 0.05), (fx, y0 + 0.92 + h - 0.05, z - 0.05)], 'ScreenEmit', uv=atlas_uv('scope', [0, 1, 1, 0], [0, 0, 1, 1]))
        else:
            decal(u, 'gauges', (fx - 0.001, y0 + 0.92 + h * 0.42, z - w / 2), (0, 0, 1), (0, 1, 0), min(w * 0.8, h * 1.1), h * 0.62)
            for j in range(int(w / 0.07)):
                col = ['red', 'green', 'amber'][(j + k) % 3]
                zz = z - 0.05 - j * 0.07
                em.poly([(fx, y0 + 0.92 + h - 0.06, zz), (fx, y0 + 0.92 + h - 0.06, zz - 0.025), (fx, y0 + 0.92 + h - 0.035, zz - 0.025), (fx, y0 + 0.92 + h - 0.035, zz)], 'LEDEmit', uv=palette_uv(col, 4))
        z -= w + float(r.uniform(0.05, 0.25))
        k += 1
    emp['UpgradeBench'] = ((XI1 - 1.25, y0, -22.1), math.pi / 2)
    px = XI1 - 0.012
    u.box(px - 0.012, px, y0 + 1.3, y0 + 2.3, -23.2, -19.55, 'Int_Cardboard')
    for k, (zc, yc, hh, ww) in enumerate(((-19.9, 2.0, 0.32, 0.05), (-20.15, 1.95, 0.24, 0.04), (-20.45, 2.02, 0.36, 0.03), (-20.8, 1.9, 0.2, 0.12), (-21.3, 2.05, 0.3, 0.05),
                                         (-21.7, 1.95, 0.26, 0.09), (-22.15, 2.0, 0.34, 0.04), (-22.5, 1.85, 0.18, 0.16), (-22.9, 2.02, 0.3, 0.05))):
        u.box(px - 0.04, px - 0.012, y0 + yc - hh / 2, y0 + yc + hh / 2, zc - ww / 2, zc + ww / 2, ['Int_Black', 'Int_ToolRed', 'Int_Chrome', 'Int_SteelGrey'][k % 4])
    u.box(px - 0.34, px, y0 + 2.36, y0 + 2.39, -23.2, -19.55, 'Int_SteelGrey')
    for k, (z0_, w_, h_) in enumerate(((-19.65, 0.5, 0.26), (-20.25, 0.42, 0.3), (-20.8, 0.55, 0.22), (-21.5, 0.4, 0.28), (-22.0, 0.6, 0.24), (-22.7, 0.42, 0.3))):
        u.box(px - 0.32, px - 0.02, y0 + 2.39, y0 + 2.39 + h_, z0_ - w_, z0_, ['Int_Beige', 'Int_SteelGrey', 'Int_Black'][k % 3])
        decal(u, 'gauges' if k % 2 == 0 else 'scope', (px - 0.321, y0 + 2.39 + h_ * 0.45, z0_ - w_ / 2), (0, 0, 1), (0, 1, 0), min(w_ * 0.75, h_ * 1.2), h_ * 0.6)
        for j in range(3):
            em.poly([(px - 0.322, y0 + 2.39 + h_ - 0.07, z0_ - 0.06 - j * 0.06), (px - 0.322, y0 + 2.39 + h_ - 0.07, z0_ - 0.085 - j * 0.06), (px - 0.322, y0 + 2.39 + h_ - 0.045, z0_ - 0.085 - j * 0.06), (px - 0.322, y0 + 2.39 + h_ - 0.045, z0_ - 0.06 - j * 0.06)], 'LEDEmit', uv=palette_uv(['red', 'green', 'amber'][(j + k) % 3], 4))
    lx, lz = bx0 + 0.06, -21.2
    u.box(lx - 0.03, lx + 0.03, y0 + 0.8, y0 + 0.96, lz - 0.04, lz + 0.04, 'Int_SteelGrey')
    u.cyl((lx, y0 + 0.96, lz), 0.012, 0.42, 6, 'Int_SteelGrey')
    u.obox((lx - 0.1, y0 + 1.42, lz), (0.12, 0.02, 0), (0, 0.012, 0), (0, 0, 0.012), 'Int_SteelGrey')
    em.lathe([(0.02, 0.06), (0.1, 0.0)], 12, (lx - 0.22, y0 + 1.36, lz), 'LampShadeEmit', cap=False)
    for (x0, x1, seed, nm) in ((-3.0, -0.8, 12, 'Collider_LabShelf1'), (-0.6, 1.6, 13, 'Collider_LabShelf2')):
        lab_shelf(u, em, x0, x1, ZI1 + 0.02, ZI1 + 0.5, 2.5, seed)
        cols.append(hull_object(nm, box_pts(x0, x1, y0, y0 + 2.5, ZI1, ZI1 + 0.5), None))
    lab_shelf(u, em, XI0 + 0.02, XI0 + 0.5, -19.6, -23.4, 2.5, 14, axis='x')
    cols.append(hull_object('Collider_LabShelf3', box_pts(XI0, XI0 + 0.5, y0, y0 + 2.5, -23.4, -19.6), None))
    u.box(-1.2, 0.8, y0 + 0.76, y0 + 0.8, -22.8, -21.6, 'Int_SteelGrey')
    for xx in (-1.15, 0.75):
        for zz in (-22.75, -21.65):
            u.box(xx - 0.025, xx + 0.025, y0, y0 + 0.76, zz - 0.025, zz + 0.025, 'Int_SteelGrey')
    cols.append(hull_object('Collider_LabTable', box_pts(-1.2, 0.8, y0, y0 + 0.8, -22.8, -21.6), None))
    for k in range(5):
        u.box(-1.0 + k * 0.35, -0.75 + k * 0.35, y0 + 0.8, y0 + 0.8 + 0.08 + 0.05 * (k % 3), -22.5, -22.0, ['Int_Black', 'Int_Beige', 'Int_SteelGrey', 'Int_ToolRed', 'Int_Paper'][k])
    u.cyl((0.3, y0 + 0.8, -21.85), 0.05, 0.25, 10, 'Int_Chrome')
    chair(u, (-0.2, y0, -21.0), math.pi)
    chair(u, (XI1 - 1.3, y0, -20.2), math.pi / 2, seat='Int_Black')
    u.poly([(XI0 + 0.005, y0 + 1.6, -24.1), (XI0 + 0.005, y0 + 1.6, -24.7), (XI0 + 0.005, y0 + 1.9, -24.7), (XI0 + 0.005, y0 + 1.9, -24.1)][::-1], 'Int_Atlas', uv=atlas_uv('caution', [1, 0, 0, 1], [0, 0, 1, 1])[::-1])
    u.box(XI1 - 0.5, XI1 - 0.02, y0, y0 + 1.38, -25.7, -26.5, 'Int_FilingBeige')


def lab_shelf(u, em, x0, x1, z0, z1, h, seed, axis='z'):
    r = np.random.default_rng(seed)
    y0 = U_FLOOR
    if axis == 'z':
        for x in (x0 + 0.02, x1 - 0.02, (x0 + x1) / 2):
            for z in (z0 + 0.02, z1 - 0.02):
                u.box(x - 0.02, x + 0.02, y0, y0 + h, z - 0.02, z + 0.02, 'Int_SteelGrey')
        for yy in np.linspace(0.15, h - 0.05, 5):
            u.box(x0, x1, y0 + yy - 0.02, y0 + yy, z0, z1, 'Int_SteelGrey')
            if yy > h - 0.3:
                continue
            x = x0 + 0.05
            while x < x1 - 0.2:
                w = float(r.uniform(0.15, 0.5))
                hh = float(r.uniform(0.12, 0.36))
                if x + w > x1 - 0.05:
                    break
                mm = ['Int_SteelGrey', 'Int_Beige', 'Int_Black', 'Int_Cardboard', 'Int_SteelGrey'][int(r.integers(0, 5))]
                u.box(x, x + w, y0 + yy, y0 + yy + hh, z0 + 0.05, z1 - 0.08, mm)
                if mm != 'Int_Cardboard' and r.random() < 0.6:
                    for j in range(int(r.integers(1, 4))):
                        col = ['red', 'green', 'amber'][int(r.integers(0, 3))]
                        lx = x + 0.04 + j * 0.05
                        em.poly([(lx, y0 + yy + hh - 0.06, z1 - 0.079), (lx + 0.025, y0 + yy + hh - 0.06, z1 - 0.079), (lx + 0.025, y0 + yy + hh - 0.035, z1 - 0.079), (lx, y0 + yy + hh - 0.035, z1 - 0.079)], 'LEDEmit', uv=palette_uv(col, 4))
                x += w + float(r.uniform(0.02, 0.1))
    else:
        for x in (x0 + 0.02, x1 - 0.02):
            for z in (z0 - 0.02, z1 + 0.02, (z0 + z1) / 2):
                u.box(x - 0.02, x + 0.02, y0, y0 + h, z - 0.02, z + 0.02, 'Int_SteelGrey')
        for yy in np.linspace(0.15, h - 0.05, 5):
            u.box(x0, x1, y0 + yy - 0.02, y0 + yy, z1, z0, 'Int_SteelGrey')
            if yy > h - 0.3:
                continue
            z = z0 - 0.05
            while z > z1 + 0.2:
                w = float(r.uniform(0.15, 0.5))
                hh = float(r.uniform(0.12, 0.36))
                if z - w < z1 + 0.05:
                    break
                mm = ['Int_SteelGrey', 'Int_Beige', 'Int_Black', 'Int_Cardboard', 'Int_Paper'][int(r.integers(0, 5))]
                u.box(x0 + 0.05, x1 - 0.08, y0 + yy, y0 + yy + hh, z - w, z, mm)
                z -= w + float(r.uniform(0.02, 0.1))


# ---------------------------------------------------------------- basement

def basement(cols, emp):
    b = MB()
    em = MB()
    y0, y1 = B_FLOOR, B_CEIL
    hole = rect(BSTAIR['x0'] - 0.05, BSTAIR['zt'] - 0.05, BSTAIR['x1'] + 0.05, BSTAIR['zb'] + 0.1)
    b.plane2d(rect(XI0, -B_Z0, XI1, -ZI1), (0, y0, 0), (1, 0, 0), (0, 0, -1), 'Int_Concrete', step=0.5)
    b.plane2d(rect(XI0, ZI1, XI1, B_Z0), (0, y1, 0), (1, 0, 0), (0, 0, 1), 'Int_ConcCeil', holes=[hole], step=0.9)
    BB = [(y0, y1, 'Int_Block')]
    band_wall(b, (XI1, 0, B_Z0), (-1, 0, 0), (0, 1, 0), 0.0, XI1 - XI0, BB, step=0.75)
    band_wall(b, (XI1, 0, ZI1), (0, 0, 1), (0, 1, 0), 0.0, B_Z0 - ZI1, BB, step=0.75)
    band_wall(b, (XI0, 0, B_Z0), (0, 0, -1), (0, 1, 0), 0.0, B_Z0 - ZI1, BB, step=0.75)
    band_wall(b, (XI0, 0, ZI1), (1, 0, 0), (0, 1, 0), 0.0, XI1 - XI0, BB, step=0.75)
    for z in (-15.5, -21.0):
        b.box(XI0, XI1, y1 - 0.3, y1, z - 0.1, z + 0.1, 'Int_SteelGrey', skip=('+y',))
    for k, (x, r_) in enumerate(((-2.8, 0.06), (-2.55, 0.04), (1.8, 0.08), (2.1, 0.03), (-0.2, 0.05))):
        b.lathe([(r_, 0.0), (r_, abs(ZI1 - B_Z0))], 10, (x, y1 - 0.12 - r_, ZI1), 'Int_SteelGrey' if k != 3 else 'Int_ToolRed', axis='z', cap=False)
    bstair(b, cols)
    ecu(b, em, cols, emp)
    mx = -2.65
    b.box(mx - 0.42, mx + 0.42, y0, y0 + 2.05, B_Z0 - 0.5, B_Z0, 'Int_Black')
    em.poly([(mx - 0.32, y0 + 1.82, B_Z0 - 0.505), (mx + 0.32, y0 + 1.82, B_Z0 - 0.505), (mx + 0.32, y0 + 1.95, B_Z0 - 0.505), (mx - 0.32, y0 + 1.95, B_Z0 - 0.505)][::-1], 'MonitorEmit')
    b.box(mx - 0.3, mx + 0.3, y0 + 0.9, y0 + 1.6, B_Z0 - 0.51, B_Z0 - 0.5, 'Int_SteelGrey')
    em.poly([(mx - 0.25, y0 + 0.95, B_Z0 - 0.512), (mx + 0.25, y0 + 0.95, B_Z0 - 0.512), (mx + 0.25, y0 + 1.55, B_Z0 - 0.512), (mx - 0.25, y0 + 1.55, B_Z0 - 0.512)][::-1], 'ScreenEmit', uv=atlas_uv('scope', [1, 0, 0, 1], [0, 0, 1, 1]))
    cols.append(hull_object('Collider_Monitor', box_pts(mx - 0.42, mx + 0.42, y0, y0 + 2.05, B_Z0 - 0.5, B_Z0), None))
    px = 1.55
    b.box(px - 0.3, px + 0.3, y0 + 1.2, y0 + 2.0, B_Z0 - 0.18, B_Z0, 'Int_SteelGrey')
    b.box(px + 0.3, px + 0.32, y0 + 1.5, y0 + 1.7, B_Z0 - 0.1, B_Z0 - 0.06, 'Int_Black')
    b.box(px + 0.45, px + 0.75, y0 + 1.5, y0 + 1.85, B_Z0 - 0.12, B_Z0, 'Int_SteelGrey')
    for k, xx in enumerate((px - 0.1, px + 0.2, px + 0.6)):
        b.lathe([(0.0, 0.0), (0.09, 0.0), (0.09, 0.06), (0.0, 0.07)], 12, (xx, y0 + 2.35, B_Z0), 'Int_Chrome', axis='z')
        b.lathe([(0.03, 0.0), (0.03, y1 - y0 - 2.0)], 8, (xx + 0.0, y0 + 2.0, B_Z0 - 0.06), 'Int_SteelGrey', cap=False) if k < 2 else None
    b.poly([(1.2, y0 + 2.45, B_Z0 - 0.003), (0.75, y0 + 2.45, B_Z0 - 0.003), (0.75, y0 + 2.75, B_Z0 - 0.003), (1.2, y0 + 2.75, B_Z0 - 0.003)], 'Int_Atlas', uv=atlas_uv('caution', [0, 1, 1, 0], [0, 0, 1, 1]))
    dx0, dx1, dz0, dz1 = XI0 + 0.02, XI0 + 0.8, -17.8, -15.8
    b.box(dx0, dx1, y0 + 0.72, y0 + 0.77, dz0, dz1, 'Int_OakDark')
    b.box(dx0 + 0.03, dx1 - 0.03, y0, y0 + 0.72, dz0 + 0.03, dz0 + 0.5, 'Int_Oak')
    b.box(dx0 + 0.03, dx1 - 0.03, y0, y0 + 0.72, dz1 - 0.5, dz1 - 0.03, 'Int_Oak')
    for k in range(4):
        b.box(dx0 + 0.1, dx0 + 0.5, y0 + 0.77, y0 + 0.85 + 0.06 * k, dz1 - 0.3 - k * 0.45, dz1 - 0.05 - k * 0.45, ['Int_Beige', 'Int_SteelGrey', 'Int_Black', 'Int_ToolRed'][k])
    em.poly([(dx0 + 0.501, y0 + 0.86, dz1 - 0.08), (dx0 + 0.501, y0 + 0.86, dz1 - 0.27), (dx0 + 0.501, y0 + 0.91, dz1 - 0.27), (dx0 + 0.501, y0 + 0.91, dz1 - 0.08)], 'LEDEmit', uv=palette_uv('green', 4))
    cols.append(hull_object('Collider_BDesk', box_pts(dx0, dx1, y0, y0 + 0.77, dz0, dz1), None))
    chair(b, (XI0 + 1.15, y0, -16.8), -math.pi / 2)
    for (x, z) in ((-2.6, -24.6), (-2.0, -25.3), (-2.9, -25.6)):
        b.cyl((x, y0, z), 0.29, 0.88, 14, 'Int_SteelGrey')
    cols.append(hull_object('Collider_Drums', box_pts(-3.3, -1.7, y0, y0 + 0.9, -25.95, -24.3), None))
    shelf(b, 0.2, 2.2, ZI1 + 0.05, ZI1 + 0.5, 2.2, None, '', seed=21)
    for (x0, x1, z) in ((-2.0, 1.2, -16.0), (-2.0, 1.2, -23.0)):
        b.box(x0 - 0.05, x1 + 0.05, y1 - 0.08, y1, z - 0.13, z + 0.13, 'Int_SteelGrey', skip=('+y',))
        for dz in (-0.06, 0.06):
            em.cyl((x0, y1 - 0.11, z + dz), 0.02, x1 - x0, 8, 'TubeEmit', axis='x')
    emp['BasementStairBottom'] = (((BSTAIR['x0'] + BSTAIR['x1']) / 2, y0, BSTAIR['zb'] - 0.6), math.pi)
    return b, em


def bstair(b, cols):
    x0, x1, zt, zb, n = BSTAIR['x0'], BSTAIR['x1'], BSTAIR['zt'], BSTAIR['zb'], BSTAIR['n']
    H = -B_FLOOR
    rise = H / n
    run = (zb - zt) / (n - 1)
    for i in range(n - 1):
        y = B_FLOOR + rise * (i + 1)
        zf = zb - run * i
        b.box(x0 + 0.05, x1 - 0.05, y - 0.03, y, zf - run - 0.02, zf, 'Int_Diamond')
    for xx in (x0 + 0.02, x1 - 0.02):
        pa = np.array([xx, B_FLOOR + 0.15, zb + 0.05])
        pb = np.array([xx, 0.0 - 0.1, zt])
        d = pb - pa
        L = np.linalg.norm(d)
        b.obox((pa + pb) / 2, d / 2, np.array([0.02, 0, 0]), np.cross(d / L, [1, 0, 0]) * 0.13, 'Int_Black')
        ra = pa + np.array([0, 0.95, 0])
        rb = pb + np.array([0, 0.95, 0])
        if xx < 0 or xx < (x0 + x1) / 2:
            dd = rb - ra
            b.obox((ra + rb) / 2, dd / 2, np.array([0.022, 0, 0]), np.cross(dd / L, [1, 0, 0]) * 0.022, 'Int_SteelGrey')
            for t in (0.0, 0.33, 0.66):
                p = pa + d * t
                b.cyl((p[0], p[1], p[2]), 0.02, 0.95, 8, 'Int_SteelGrey')
    cols.append(hull_object('Collider_BStair', [(x0, B_FLOOR, zb + 0.08), (x1, B_FLOOR, zb + 0.08), (x0, 0.0, zt), (x1, 0.0, zt), (x0, -0.35, zt), (x1, -0.35, zt)], None))


def ecu(b, em, cols, emp):
    cx = -0.45
    zf = B_Z0 - 0.75
    y0 = B_FLOOR
    W, H = 1.3, 2.3
    root = {'pos': (cx, y0, zf), 'yaw': math.pi}
    E = MB()
    EM = MB()
    E.box(-W / 2, W / 2, 0.1, H, -0.75, -0.02, 'Int_ECURed', skip=('-z',))
    E.box(-W / 2 + 0.02, W / 2 - 0.02, 0.0, 0.1, -0.72, -0.05, 'Int_Black')
    slot = (-0.3, 0.3, 0.98, 1.36)
    E.plane2d(rect(-W / 2 + 0.06, 0.16, W / 2 - 0.06, H - 0.06), (0, 0, 0.0), (1, 0, 0), (0, 1, 0), 'Int_ECURed', holes=[rect(slot[0], slot[2], slot[1], slot[3])])
    E.ring_side(rect(-W / 2 + 0.06, 0.16, W / 2 - 0.06, H - 0.06), (0, 0, 0.0), (1, 0, 0), (0, 1, 0), np.array([0, 0, 1.0]), 0.02, 'Int_ECURed')
    E.ring_side(rect(slot[0], slot[2], slot[1], slot[3]), (0, 0, 0.0), (1, 0, 0), (0, 1, 0), np.array([0, 0, 1.0]), 0.45, 'Int_Black', hole=True)
    E.quad((slot[0], slot[2], -0.45), (slot[1], slot[2], -0.45), (slot[1], slot[3], -0.45), (slot[0], slot[3], -0.45), 'Int_Black')
    for (x0, x1, y0_, y1_) in ((-0.42, 0.32, 0.62, 1.78), (-0.42, 0.32, 0.25, 0.5)):
        for (a0, a1, b0, b1) in ((x0, x1, y0_, y0_ + 0.025), (x0, x1, y1_ - 0.025, y1_), (x0, x0 + 0.025, y0_, y1_), (x1 - 0.025, x1, y0_, y1_)):
            E.box(a0, a1, b0, b1, 0.0, 0.006, 'Int_Paper')
    E.box(-0.06, 0.06, 1.42, 1.47, 0.0, 0.05, 'Int_Chrome')
    E.box(-0.5, 0.5, 2.0, 2.25, 0.0, 0.015, 'Int_ECURed')
    E.poly([(0.1, 1.85, 0.008), (0.55, 1.85, 0.008), (0.55, 2.15, 0.008), (0.1, 2.15, 0.008)], 'Int_Atlas', uv=atlas_uv('danger', [0, 1, 1, 0], [0, 0, 1, 1]))
    E.poly([(-0.6, 1.88, 0.008), (-0.2, 1.88, 0.008), (-0.2, 2.18, 0.008), (-0.6, 2.18, 0.008)], 'Int_Atlas', uv=atlas_uv('gauges', [0, 1, 1, 0], [0, 0, 1, 1]))
    for k, yy in enumerate((1.25, 1.12, 0.99)):
        E.box(0.38, 0.5, yy, yy + 0.09, 0.0, 0.012, 'Int_Black')
    for k in range(3):
        E.lathe([(0.0, 0.0), (0.02, 0.0), (0.02, 0.03), (0.0, 0.035)], 8, (-0.5 + k * 0.08, 1.62, 0.0), 'Int_Chrome', axis='z')
    for k, xx in enumerate((-0.45, 0.0, 0.42)):
        E.lathe([(0.045, 0.0), (0.045, 0.05)], 10, (xx, H, -0.35), 'Int_Chrome', cap=False)
        E.lathe([(0.035, 0.0), (0.035, (B_CEIL - B_FLOOR) - H)], 10, (xx, H, -0.35 + 0.1 * (k - 1)), 'Int_SteelGrey', cap=False)
    EM.poly([(0.385, 1.255, 0.013), (0.495, 1.255, 0.013), (0.495, 1.335, 0.013), (0.385, 1.335, 0.013)], 'ECU_LightEmit', uv=palette_uv('red', 4))
    EM.poly([(0.385, 1.125, 0.013), (0.495, 1.125, 0.013), (0.495, 1.205, 0.013), (0.385, 1.205, 0.013)], 'ECU_LightEmit', uv=palette_uv('amber', 4))
    EM.poly([(0.385, 0.995, 0.013), (0.495, 0.995, 0.013), (0.495, 1.075, 0.013), (0.385, 1.075, 0.013)], 'ECU_LightEmit', uv=palette_uv('green', 4))
    seg_ind = [0] * 4 + [2] * 4 + [1] * 4
    for k, (xx, colr, sg) in enumerate(((-0.45, 'red', 0), (0.45, 'green', 1))):
        cyb = H + 0.55
        E.box(xx - 0.07, xx + 0.07, cyb + 0.1, cyb + 0.18, -0.75, -0.55, 'Int_SteelGrey')
        E.lathe([(0.0, 0.0), (0.075, 0.0), (0.075, 0.04), (0.0, 0.05)], 12, (xx, cyb + 0.1, -0.65), 'Int_SteelGrey')
        EM.lathe([(0.0, -0.18), (0.055, -0.17), (0.065, -0.1), (0.06, 0.0)], 12, (xx, cyb + 0.1, -0.65), 'ECU_LightEmit', cap=False)
        for j in range(4):
            a = j * math.pi / 2
            E.box(xx + 0.07 * math.cos(a) - 0.006, xx + 0.07 * math.cos(a) + 0.006, cyb - 0.19, cyb + 0.1, -0.65 - 0.07 * math.sin(a) - 0.006, -0.65 - 0.07 * math.sin(a) + 0.006, 'Int_SteelGrey')
        E.lathe([(0.072, 0.0), (0.072, 0.012)], 12, (xx, cyb - 0.12, -0.65), 'Int_SteelGrey', cap=False)
    lever = MB()
    lever.box(-0.02, 0.02, -0.03, 0.34, -0.02, 0.02, 'Int_Chrome')
    lever.lathe([(0.0, 0.0), (0.035, 0.0), (0.04, 0.05), (0.04, 0.13), (0.03, 0.16), (0.0, 0.17)], 10, (0.0, 0.32, 0.0), 'Int_ToolRed')
    lever.lathe([(0.0, -0.04), (0.06, -0.035), (0.06, 0.035), (0.0, 0.04)], 12, (0.0, 0.0, 0.0), 'Int_Black', axis='x')
    E.box(0.44, 0.6, 1.1, 1.4, 0.0, 0.04, 'Int_Black')
    door = MB()
    door.box(slot[0] - 0.02, slot[1] + 0.02, 0.0, slot[3] - slot[2] + 0.02, 0.0, 0.025, 'Int_ECURed')
    door.box(-0.08, 0.08, slot[3] - slot[2] - 0.07, slot[3] - slot[2] - 0.04, 0.025, 0.055, 'Int_Chrome')
    glow = MB()
    for (a0, a1, b0, b1) in ((slot[0] - 0.035, slot[1] + 0.035, slot[2] - 0.035, slot[2] - 0.02), (slot[0] - 0.035, slot[1] + 0.035, slot[3] + 0.02, slot[3] + 0.035),
                             (slot[0] - 0.035, slot[0] - 0.02, slot[2] - 0.02, slot[3] + 0.02), (slot[1] + 0.02, slot[1] + 0.035, slot[2] - 0.02, slot[3] + 0.02)):
        glow.poly([(a0, b0, 0.004), (a1, b0, 0.004), (a1, b1, 0.004), (a0, b1, 0.004)], 'ECU_DoorEmit')
    glow.quad((slot[0] + 0.01, slot[2] + 0.01, -0.44), (slot[1] - 0.01, slot[2] + 0.01, -0.44), (slot[1] - 0.01, slot[3] - 0.01, -0.44), (slot[0] + 0.01, slot[3] - 0.01, -0.44), 'ECU_DoorEmit')
    ecu_parts = dict(body=E, emit=EM, lever=lever, door=door, glow=glow, root=root, slot=slot, H=H, W=W, seg=seg_ind)
    cols.append(hull_object('Collider_ECU', box_pts(cx - W / 2, cx + W / 2, y0, y0 + H, B_Z0 - 0.75, B_Z0), None))
    emp['ECU_Front'] = ((cx, y0, zf - 0.9), 0.0)
    ECU_DATA.update(ecu_parts)


ECU_DATA = {}


# ---------------------------------------------------------------- colliders: shell and floors

def neighbour_colliders(cols):
    xa, xb = LOT_X - LOT_W / 2, -W2
    cols.append(hull_object('Collider_Neighbour', box_pts(xa, xb, -0.4, HN + 0.1, -D, 0.0), None))
    cols.append(hull_object('Collider_NeighbourEscape', box_pts(xa + 0.3, xa + 5.25, 4.4, HN - 1.0, 0.0, 1.15), None))


def shell_colliders(cols):
    c = lambda n, *b: cols.append(hull_object(n, box_pts(*b), None))
    c('Collider_FrontL', -W2, ARCH['x0'], -0.4, PARAPET, -0.6, 0.0)
    c('Collider_FrontR', ARCH['x1'], W2, -0.4, PARAPET, -0.6, 0.0)
    c('Collider_FrontTop', ARCH['x0'], ARCH['x1'], ARCH_TOP - 0.3, PARAPET, -0.6, 0.0)
    c('Collider_ArchL', ARCH['x0'], ARCH['x0'] + 0.35, ARCH['spring'] + 0.6, ARCH_TOP, -0.6, 0.0)
    c('Collider_ArchR', ARCH['x1'] - 0.35, ARCH['x1'], ARCH['spring'] + 0.6, ARCH_TOP, -0.6, 0.0)
    c('Collider_Side', XI1, W2, -0.4, PARAPET, -D, -0.6)
    c('Collider_Party', -W2, XI0, -0.4, PARAPET, -D, -0.6)
    c('Collider_Rear', -W2, W2, -0.4, PARAPET, -D, ZI1)
    c('Collider_Roof', -W2, W2, U_CEIL, ROOF, -D, 0.0)
    c('Collider_GroundFront', XI0, XI1, -0.5, 0.0, B_Z0, ZI0)
    c('Collider_GroundFrontApron', ARCH['x0'], ARCH['x1'], -0.5, 0.0, ZI0, 0.0)
    c('Collider_GroundRearW', XI0, BSTAIR['x0'] - 0.05, B_CEIL, 0.0, ZI1, B_Z0)
    c('Collider_GroundRearE1', BSTAIR['x0'] - 0.05, XI1, B_CEIL, 0.0, BSTAIR['zb'] + 0.1, B_Z0)
    c('Collider_GroundRearE2', BSTAIR['x0'] - 0.05, XI1, B_CEIL, 0.0, ZI1, BSTAIR['zt'] - 0.05)
    c('Collider_BFloor', XI0, XI1, B_FLOOR - 0.3, B_FLOOR, ZI1, B_Z0)
    c('Collider_BWallFront', XI0, XI1, B_FLOOR, B_CEIL, B_Z0, B_Z0 + 0.3)
    px, pz = POLE
    c('Collider_UFloorA', XI0, XI1, G_CEIL, U_FLOOR, pz + 0.45, ZI0)
    c('Collider_UFloorB', px + 0.45, XI1, G_CEIL, U_FLOOR, pz - 0.45, pz + 0.45)
    c('Collider_UFloorC', XI0, px - 0.45, G_CEIL, U_FLOOR, pz - 0.45, pz + 0.45)
    c('Collider_UFloorD', XI0, XI1, G_CEIL, U_FLOOR, STAIR['zb'], pz - 0.45)
    c('Collider_UFloorE', STAIR['x1'], XI1, G_CEIL, U_FLOOR, STAIR['zt'], STAIR['zb'])
    c('Collider_UFloorF', XI0, XI1, G_CEIL, U_FLOOR, ZI1, STAIR['zt'])
    c('Collider_Pole', px - 0.05, px + 0.05, 0.0, U_CEIL, pz - 0.05, pz + 0.05)


# ---------------------------------------------------------------- lights for baking

def bake_lights():
    L = []
    warm = np.array([1.0, 0.86, 0.66])
    cool = np.array([0.86, 0.95, 1.0])
    for z in (-3.2, -8.0, -12.6, -19.0, -24.0):
        L.append(dict(pos=(0.25 if z > -11 else 0.0, G_CEIL - 1.3, z), I=(28 * warm).tolist(), range=15.0, size=0.2, only=((XI0 - 0.5, -0.5, ZI1 - 0.5), (XI1 + 0.5, G_CEIL + 0.05, ZI0 + 0.7))))
    L.append(dict(pos=(-2.8, 1.12, -3.25), I=(5 * warm).tolist(), range=5.0, size=0.12))
    L.append(dict(pos=(0.0, 2.8, 1.5), I=(30 * np.array([1.0, 0.7, 0.45])).tolist(), range=12.0, size=0.1, spot=((0, -0.3, -1), 0.35, 0.7)))
    ub = ((XI0 - 0.5, U_FLOOR - 0.1, ZI1 - 0.5), (XI1 + 0.5, U_CEIL + 0.3, ZI0 + 0.7))
    L.append(dict(pos=(0.6, U_CEIL - 0.25, -5.0), I=(16 * warm).tolist(), range=10.0, size=0.2, only=ub))
    L.append(dict(pos=(-2.0, U_CEIL - 0.25, -14.0), I=(9 * warm).tolist(), range=8.0, size=0.2, only=ub))
    L.append(dict(pos=(1.3, U_CEIL - 0.25, -14.0), I=(13 * warm).tolist(), range=8.0, size=0.2, only=ub))
    L.append(dict(pos=(2.7, U_FLOOR + 1.12, -14.25), I=(5 * warm).tolist(), range=4.0, size=0.12, only=ub))
    for z in (-20.5, -24.0):
        L.append(dict(pos=(0.0, U_CEIL - 0.16, z), I=(18 * cool).tolist(), range=10.0, size=0.1, tube=((-1.5, U_CEIL - 0.16, z), (1.5, U_CEIL - 0.16, z)), only=ub))
    L.append(dict(pos=(XI1 - 0.75, U_FLOOR + 1.45, -21.2), I=(4 * warm).tolist(), range=4.0, size=0.08, only=ub))
    bb = ((XI0 - 0.5, B_FLOOR - 0.1, ZI1 - 0.5), (XI1 + 0.5, B_CEIL + 0.1, B_Z0 + 0.5))
    for z in (-16.0, -23.0):
        L.append(dict(pos=(-0.4, B_CEIL - 0.15, z), I=(22 * np.array([0.88, 1.0, 0.9])).tolist(), range=10.0, size=0.1, tube=((-1.9, B_CEIL - 0.15, z), (1.1, B_CEIL - 0.15, z)), only=bb))
    L.append(dict(pos=(-2.65, B_FLOOR + 1.9, B_Z0 - 0.7), I=(2.5 * np.array([0.3, 1.0, 0.4])).tolist(), range=4.0, size=0.1, only=bb))
    return L


# ---------------------------------------------------------------- assemble

def main():
    t0 = time.time()
    lm_core.reset()
    materials()
    if 'palette' not in ATLAS:
        raise SystemExit('signs atlas has no palette; run tex_gen.py')
    cols = []
    emp = {}
    lot = group('Firehouse')
    root = group('Building', lot)
    g_ext = group('Exterior', root)
    g_gar = group('Interior_Garage', root)
    g_up = group('Interior_Upper', root)
    g_bs = group('Interior_Basement', root)
    g_col = group('Colliders', root)
    ex, ex_em, nb = exterior()
    dl, dle, w, h, t = door_leaf(-1)
    dr, dre, _, _, _ = door_leaf(1)
    trm = MB()
    trm_em = MB()
    transom(trm, trm_em)
    ex.extend(trm)
    ex_em.extend(trm_em)
    gar, gar_em = garage(cols, emp)
    up, up_em = upper(cols, emp)
    bs, bs_em = basement(cols, emp)
    shell_colliders(cols)
    objs = {}
    ex.extend(nb)
    objs['Exterior_Mesh'] = make_object('Exterior_Mesh', ex, g_ext)
    objs['Exterior_Emit'] = make_object('Exterior_Emit', ex_em, g_ext)
    neighbour_colliders(cols)
    hz = -0.46
    dL = new_empty('GarageDoor_L', (ARCH['x0'], 0.0, hz), 0.0, root, 0.3)
    dR = new_empty('GarageDoor_R', (ARCH['x1'], 0.0, hz), 0.0, root, 0.3)
    dl.extend(dle)
    dr.extend(dre)
    objs['GarageDoor_L_Mesh'] = make_object('GarageDoor_L_Mesh', dl, dL)
    objs['GarageDoor_R_Mesh'] = make_object('GarageDoor_R_Mesh', dr, dR)
    for nm, side, par in (('Collider_GarageDoor_L', 1, dL), ('Collider_GarageDoor_R', -1, dR)):
        hull_object(nm, box_pts(0.0, side * 1.75, 0.0, h, -t / 2, t / 2), par)
    objs['Garage_Mesh'] = make_object('Garage_Mesh', gar, g_gar, baked=True)
    objs['Garage_Emit'] = make_object('Garage_Emit', gar_em, g_gar)
    objs['Upper_Mesh'] = make_object('Upper_Mesh', up, g_up, baked=True)
    objs['Upper_Emit'] = make_object('Upper_Emit', up_em, g_up)
    objs['Basement_Mesh'] = make_object('Basement_Mesh', bs, g_bs, baked=True)
    objs['Basement_Emit'] = make_object('Basement_Emit', bs_em, g_bs)
    E = ECU_DATA
    ecu_root = new_empty('ECU', E['root']['pos'], E['root']['yaw'], g_bs, 0.4)
    objs['ECU_Body'] = make_object('ECU_Body', E['body'], ecu_root, baked=True)
    lem = make_object('ECU_LightEmit', E['emit'], ecu_root)
    lev = new_empty('ECU_Lever', (0.52, 1.25, 0.06), 0.0, ecu_root, 0.15)
    lev.rotation_euler = (math.radians(-12), 0.0, 0.0)
    objs['ECU_Lever_Mesh'] = make_object('ECU_Lever_Mesh', E['lever'], lev, baked=True)
    sd = new_empty('ECU_SlotDoor', (0.0, E['slot'][2] - 0.01, 0.0), 0.0, ecu_root, 0.12)
    objs['ECU_SlotDoor_Mesh'] = make_object('ECU_SlotDoor_Mesh', E['door'], sd, baked=True)
    objs['ECU_DoorEmit'] = make_object('ECU_DoorEmit', E['glow'], ecu_root)
    slot_e = new_empty('ECU_Slot', (0.0, E['slot'][2] + 0.005, -0.25), math.pi, ecu_root, 0.15)
    slot_o = new_empty('ECU_SlotOut', (0.0, E['slot'][2] + 0.005, 0.35), math.pi, ecu_root, 0.15)
    lamp_e = new_empty('ECU_Light', (0.0, E['H'] + 0.5, -0.5), 0.0, ecu_root, 0.15)
    ecu_seg(lem)
    for c in cols:
        if c.parent is None:
            c.parent = g_col
    E2 = {}
    for name, (pos, yaw) in emp.items():
        par = g_up if name in ('PoleTop', 'PoleEntry', 'StairTop', 'UpgradeBench', 'OfficeDesk') else g_bs if name.startswith('Basement') or name == 'ECU_Front' else g_gar if name not in ('GarageDoorOutside',) else root
        E2[name] = new_empty(name, pos, yaw, par, 0.3)
    bpy.context.view_layer.update()
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.data.update()
    log(f'[fh] geometry built {time.time() - t0:.1f}s')
    baked = [objs[k] for k in ('Garage_Mesh', 'Upper_Mesh', 'Basement_Mesh', 'ECU_Body')] + [objs['ECU_Lever_Mesh'], objs['ECU_SlotDoor_Mesh']]
    occ = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('Collider') and o.name not in ('Exterior_Emit',) and not o.name.endswith('_Emit') and 'Glass' not in o.name and not o.name.startswith('GarageDoor')]
    if BAKE:
        lm_core.bake(baked, occ, bake_lights(), ambient=0.035, bounce_rays=10, bounce_gain=0.9, scale=8.0, log=log)
    stats = {}
    for k, grp in (('exterior', g_ext), ('garage', g_gar), ('upper', g_up), ('basement', g_bs)):
        ms = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('Collider') and is_under(o, grp)]
        stats[k] = lm_core.tri_count(ms)
    stats['doors'] = lm_core.tri_count([o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('GarageDoor')])
    stats['total'] = lm_core.tri_count([o for o in bpy.data.objects if o.type == 'MESH'])
    log('[fh] triangles', stats)
    for o in bpy.data.objects:
        if o.name.startswith('Collider'):
            o['collider'] = True
    if '--blend' in ARGS:
        bpy.ops.wm.save_as_mainfile(filepath=ARGS[ARGS.index('--blend') + 1])
    root.location = tuple(to_bl((-LOT_X, 0.0, 0.0)))
    bpy.context.view_layer.update()
    lm_core.export_glb(OUT)
    write_json(OUT.replace('.glb', '.json'), stats, cols, E2, dL, dR, ecu_root, lev, sd, slot_e, slot_o, lamp_e, h)
    log(f'[fh] exported {OUT} {os.path.getsize(OUT) / 1e6:.2f} MB in {time.time() - t0:.1f}s')


def ecu_seg(ob):
    me = ob.data
    att = me.attributes.new('_SEG', 'FLOAT', 'POINT')
    vals = np.zeros(len(me.vertices), np.float32)
    for i, v in enumerate(me.vertices):
        p = v.co
        gx = p[0]
        gy = p[2]
        if gy > ECU_DATA['H'] + 0.2:
            vals[i] = 0.0 if gx < 0 else 1.0
        else:
            vals[i] = 0.0 if gy > 1.25 else (2.0 if gy > 1.12 else 1.0)
    att.data.foreach_set('value', vals)
    ob['segments'] = 3


def is_under(o, grp):
    p = o.parent
    while p is not None:
        if p == grp:
            return True
        p = p.parent
    return False


def write_json(path, stats, cols, E2, dL, dR, ecu_root, lev, sd, slot_e, slot_o, lamp_e, door_h):
    wp = lm_core.world_pose
    out = {
        'asset': 'assets/landmarks/firehouse.glb', 'id': 'firehouse', 'version': 2,
        'name': 'Ghostbusters Firehouse (Hook & Ladder 8, 14 N Moore St) as in Ghostbusters (1984)',
        'frame': 'glTF metres, +Y up. Front (N Moore St) faces +Z, Varick St side faces +X. Origin = front-centre of the whole lot (city mapdef FIREHOUSE box, 16 x 30 m) at sidewalk-top level (y=0 = garage floor = sidewalk top). The real-width firehouse (8.6 m, as in the film) stands on the Varick corner of the lot (x 3.7 +- 4.3); the rest of the lot (x -8 .. -0.6) is the 5-storey neighbour loft, part of this GLB. Node Building is translated +3.7 m in x; all empties below are given in the root (lot) frame.',
        'source': 'blender/landmarks/fh_build.py (Blender 4.5, regenerable), textures blender/landmarks/tex_gen.py',
        'size': {'lot_width': LOT_W, 'lot_depth': D, 'firehouse_width': 2 * W2, 'height_roof': ROOF, 'height_parapet': PARAPET + 0.14, 'neighbour_height': HN + 0.1},
        'footprint': [[-LOT_W / 2, 0.0], [LOT_W / 2, 0.0], [LOT_W / 2, -D], [-LOT_W / 2, -D]],
        'firehouse_footprint': [[-W2 - LOT_X, 0.0], [W2 - LOT_X, 0.0], [W2 - LOT_X, -D], [-W2 - LOT_X, -D]],
        'frontDir': [0, 0, 1],
        'anchor': {'note': 'src/city/mapdef.js FIREHOUSE box [-31, -40.5, -15, -10.5], frontDir [0, 1]: root at the lot front-centre on the N Moore St property line, y = sidewalk top (SIDEWALK_H 0.15)', 'pos': [-23.0, 0.15, -10.5], 'yaw': 0.0},
        'driveway': {'note': 'kerb cut in front of the arch (world x); the arch is 3.5 m wide, centred at world x -19.3', 'x': [-21.4, -17.2], 'arch_centre_world': [-19.3, 0.15, -10.5]},
        'levels': {'ground_floor': 0.0, 'ground_ceiling': G_CEIL, 'upper_floor': U_FLOOR, 'upper_ceiling': U_CEIL, 'basement_floor': B_FLOOR, 'basement_ceiling': B_CEIL, 'basement_z_range': [ZI1, B_Z0], 'roof': ROOF},
        'interior_box': {'x': [XI0 - LOT_X, XI1 - LOT_X], 'z': [ZI1, ZI0], 'note': 'root (lot) frame'},
        'integration': {'ground': 'The GLB brings its own garage floor at y = 0 (sidewalk top) and a basement stair hole: the city must draw no lot/sidewalk surface and build no ground collider inside the lot footprint (world x -31..-15, z -40.5..-10.5; the firehouse part is world x -23.6..-15), otherwise the garage floor z-fights and the basement stair is capped.',
                        'materials': 'Do not patch materials whose name contains Emit; DoorGlassEmit (garage door panes + fanlight) is meant to be emissive only, give it envMapIntensity 0 if a scene.environment is set.',
                        'signs': 'X_SignEmit = lit No-Ghost lightbox (setSign), X_WinEmit = lit upper-floor windows (warm room cell), DoorGlassEmit = garage glass (setGarageGlow, ~0.07..0.3).'},
        'groups': {
            'Exterior': 'facades, cornices, windows (opaque night glass), roof, signs (SignEmit = lit No-Ghost lightbox, GHOSTBUSTERS board), bollards. Always visible. LOD: whole exterior is ~' + str(stats['exterior']) + ' tris.',
            'Interior_Garage': 'ground floor hall: Ecto bay, Janine, pole, stairs, columns, tin ceiling. Show when the camera is inside, or outside within ~60 m in front (+Z half-space) while a garage door is open.',
            'Interior_Upper': 'upper floor: bunk room + pole hole, office, Egon lab. Show only when the camera is inside the footprint.',
            'Interior_Basement': 'basement with the ECU. Show only when the camera is inside and below y=1.5 or in the rear (z < -15).',
            'Colliders': 'hidden convex hulls (Collider_*), <= 8-20 vertices each; build fixed Rapier convex hulls in the landmark frame. Door colliders are children of the door nodes (kinematic).',
        },
        'bakedLighting': {'attribute': 'COLOR_0 on meshes that carry a _TINT attribute (Garage_Mesh, Upper_Mesh, Basement_Mesh, ECU_Body, ECU_Lever_Mesh, ECU_SlotDoor_Mesh; materials I_*)', 'scale': 8.0,
                          'meaning': 'B = COLOR_0.rgb * 8 multiplies the albedo (outgoing = albedo * B, i.e. three.js irradiance = PI * B). Use src/landmarks/index.js (patchBaked) which turns COLOR_0 into indirect irradiance instead of a base colour multiply; dynamic lights still add on top.',
                          'practicals': 'garage: 5 globe pendants (GlobeEmit), Janine desk lamp; upper: 3 ceiling globes, office desk lamp, 2 fluorescent fixtures (TubeEmit) in the lab; basement: 2 fluorescent fixtures, monitor cabinet green lights. All baked; no real lights needed.'},
        'doors': {
            'GarageDoor_L': {'hinge': wp(dL)['position'], 'axis_local': [0, 1, 0], 'open_deg': 92.0, 'note': 'swing door leaf in the arch, hinged at the west jamb; positive rotation about +Y swings it inward (toward -Z)', 'size': [1.75, door_h, 0.07]},
            'GarageDoor_R': {'hinge': wp(dR)['position'], 'axis_local': [0, 1, 0], 'open_deg': -92.0, 'note': 'east leaf, negative rotation swings it inward', 'size': [1.75, door_h, 0.07]},
            'timing_s': {'open': 2.2, 'close': 2.6, 'stagger_R': 0.25},
            'opening_clear_width': 3.5, 'opening_height_at_centre': ARCH_TOP, 'fixed_transom': 'arched glazed fanlight above the leaves (DoorGlassEmit glows from inside, emissiveIntensity 0..2)'},
        'pole': {'PoleTop': wp(E2['PoleTop'])['position'], 'PoleBottom': wp(E2['PoleBottom'])['position'], 'radius': 0.045,
                 'note': 'slide: feet from PoleTop (upper floor level) to PoleBottom (garage floor) along the brass pole axis, body offset ~0.3 m from the axis; enter from PoleEntry (gap in the brass guard rail, facing the pole); land facing PoleExit. Floor hole radius 0.42 m.'},
        'ECU': {'root': wp(ecu_root), 'note': 'Ecto Containment Unit on the basement front wall; ECU local +Z = out of the cabinet toward the player, +X = viewer\'s right',
                'ECU_Slot': dict(wp(slot_e), note='trap root pose when fully inserted (trap origin bottom-centre, trap front +Z points into the cabinet)'),
                'ECU_SlotOut': dict(wp(slot_o), note='trap pose at the slot mouth before sliding in (same orientation); slide 0.6 m along ECU -Z'),
                'ECU_SlotDoor': {'hinge': wp(sd)['position'], 'axis_local': [1, 0, 0], 'open_deg': 95.0, 'note': 'flap hinged at its bottom edge; positive rotation about local +X drops it outward/down'},
                'ECU_Lever': {'pivot': wp(lev)['position'], 'axis_local': [1, 0, 0], 'rest_deg': -12.0, 'pulled_deg': 115.0, 'note': 'red-handled lever on the right of the slot; rotate about local +X from rest (-12, pointing up) to pulled (+115, pointing down toward the player)'},
                'ECU_LightEmit': {'segments': 3, 'attribute': '_seg', 'map': {'0': 'red: caged lamp left + red indicator', '1': 'green: caged lamp right + green indicator', '2': 'amber indicator'}, 'note': 'lens colours come from the emissive map (palette), drive with src/engine/segments.js segmentize(): set levels[0]=1 for red, levels[1]=1 for green'},
                'ECU_DoorEmit': {'note': 'glow around the slot door and inside the slot; ramp emissiveIntensity 0..4 while sealing'},
                'ECU_Light': dict(wp(lamp_e), note='optional: a single real PointLight here (red/green, ~6 cd, range 6 m) while the lights flash'),
                'sequence_s': {'slot_door_open': [0.0, 0.5], 'insert': [0.5, 1.3], 'slot_door_close': [1.3, 1.7], 'lever_pull': [1.8, 2.4], 'red_to_green': 2.6, 'door_glow': [1.7, 2.8]}},
        'empties': {},
        'colliders': {'count': len(cols) + 2, 'names_prefix': 'Collider_', 'note': 'convex hulls; Collider_GarageDoor_L/R are children of the door nodes'},
        'stats': {'triangles': stats},
        'audio_emitters': {'AlarmBell': 'the brass fire alarm bell on the wall behind Janine (ring when a call comes in)', 'ECU': 'containment unit hum, insert, lever, seal'},
    }
    notes = {
        'EctoBay': 'Ecto-1 root pose when parked (car front +Z toward the garage door)',
        'JanineSeat': 'Janine hips pose: seat surface centre at 0.47 m, facing +X (her desk, phone and computer)',
        'PlayerSpawn': 'player root pose inside the garage, left of the car behind the pole, facing the garage doors',
        'PoleTop': 'pole axis at upper floor level', 'PoleBottom': 'pole axis at garage floor', 'PoleEntry': 'player stands here (upper floor) facing the pole to grab it', 'PoleExit': 'player root after landing',
        'StairBottom': 'foot of the main stair (garage)', 'StairTop': 'top of the main stair (upper floor)', 'BasementStairTop': 'top of the steel basement stair (garage rear)', 'BasementStairBottom': 'foot of the basement stair',
        'UpgradeBench': 'player root pose at Egon\'s lab bench (upgrade shop), facing the bench (+X)', 'OfficeDesk': 'Venkman\'s desk chair', 'AlarmBell': 'alarm bell sound source',
        'ECU_Front': 'player root pose in front of the ECU, facing it', 'GarageDoorOutside': 'just outside the arch on the sidewalk, facing the doors', 'GarageDoorInside': 'just inside the doors',
    }
    for n, e in E2.items():
        d = wp(e)
        d['parent'] = e.parent.name if e.parent else 'Firehouse'
        d['note'] = notes.get(n, '')
        out['empties'][n] = d
    if os.path.exists(OUT):
        out['stats']['glb_mb'] = round(os.path.getsize(OUT) / 1e6, 2)
    mats = sorted({m.name for o in bpy.data.objects if o.type == 'MESH' for m in o.data.materials if m})
    out['stats']['materials'] = len(mats)
    out['stats']['material_names'] = mats
    out['log'] = LOG[-12:]
    with open(path, 'w') as f:
        json.dump(out, f, indent=1)


if __name__ == '__main__':
    main()
