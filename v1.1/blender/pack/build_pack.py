# Ghostbusters pack lane: builds assets/pack/protonpack.glb (1984 hero proton pack on an ALICE frame), headless Blender 4.5.
import bpy, bmesh, math, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import lib

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OPT = {a.split('=')[0].lstrip('-'): (a.split('=')[1] if '=' in a else True) for a in ARGS}

V0 = 360.0
ZF, ZM = -30.0, -80.0
CY = 149.2
Z_SP, Z_FL, Z_LID = -149.8, -162.5, -232.5
REAR = (0, 0, -1)
UP = (0, 1, 0)
DEC = json.load(open(os.path.join(TEX, 'pack_decals.json')))


def P(u, v, z=0.0):
    return Vector((-u * MM, (v - V0) * MM, z * MM))


def Pl(pts):
    return [P(*p) for p in pts]


def auto_n(r):
    return max(8, min(40, int(round(2 * math.pi * r / 6.5))))


def bx(pt, u0, u1, v0, v1, z0, z1, kind, bev=2.0, seg=None):
    c = P((u0 + u1) / 2, (v0 + v1) / 2, (z0 + z1) / 2)
    dims = (abs(u1 - u0), abs(v1 - v0), abs(z1 - z0))
    if seg is None:
        seg = 2 if min(dims) >= 16 else 1
    pt.box((dims[0] * MM, dims[1] * MM, dims[2] * MM), T(c), kind, bevel=bev * MM, seg=seg)


def cr(pt, u, v, z0, h, r, kind, n=None, bev=1.0, seg=None, r2=None, axis=REAR, up=None):
    if n is None:
        n = auto_n(r)
    if seg is None:
        seg = 2 if r >= 14 else 1
    pt.cyl(r * MM, h * MM, frame(P(u, v, z0), axis, up), kind, n=n, bevel=bev * MM, seg=seg, r2=None if r2 is None else r2 * MM, base=True)


def lr(pt, u, v, z0, prof, kind, n=24, axis=REAR, up=None, cap0=True, cap1=True, sa=None):
    pt.lathe([(r * MM, z * MM) for r, z in prof], frame(P(u, v, z0), axis, up), kind, n=n, cap0=cap0, cap1=cap1, smooth_angle=sa)


def lr_faces(pt, u, v, z0, prof, kind, n=24, axis=REAR, up=None):
    return pt.lathe([(r * MM, z * MM) for r, z in prof], frame(P(u, v, z0), axis, up), kind, n=n, cap0=True, cap1=False)


def screw(pt, u, v, z, r=3.2, kind='steel', axis=REAR, n=6):
    pt.screw(P(u, v, z), V(axis), r * MM, kind, n=n)


def dq(pt, u, v, z, w, h, key, xdir=(-1, 0, 0), ydir=(0, 1, 0), off=0.35):
    pt.quad(P(u, v, z), xdir, ydir, w * MM, h * MM, 'decal', uvrect=DEC[key], normal_off=off * MM)


def cyl_decal(pt, u, v, z, r, h, a0, a1, key, n=10, axis_up=True):
    c = P(u, v, z)
    u0, v0, u1, v1 = DEC[key]
    bm = pt.bm
    idx = pt.mi('decal')
    rows = []
    for k in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * k / n)
        d = Vector((-math.sin(a), 0, -math.cos(a)))
        rows.append((c + d * (r + 0.35) * MM + Vector((0, -h / 2 * MM, 0)), c + d * (r + 0.35) * MM + Vector((0, h / 2 * MM, 0)), u0 + (u1 - u0) * k / n))
    for k in range(n):
        a, b = rows[k], rows[k + 1]
        vs = [bm.verts.new(a[0]), bm.verts.new(b[0]), bm.verts.new(b[1]), bm.verts.new(a[1])]
        f = bm.faces.new(vs)
        f.material_index = idx
        f.smooth = True
        for lp, uv in zip(f.loops, ((a[2], v0), (b[2], v0), (b[2], v1), (a[2], v1))):
            lp[pt.uv].uv = uv


def mb_outline():
    pts = []

    def arc(cx, cy, r, a0, a1, n):
        for k in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * k / n)
            pts.append(((cx + r * math.cos(a)) * MM, (cy + r * math.sin(a)) * MM))
    R, top, bot, hw = 22.0, 676.0, 105.0, 185.0
    Rc = 152.0
    arc(hw - R, top - R, R, 0, 90, 4)
    arc(-hw + R, top - R, R, 90, 180, 4)
    arc(-hw + R, bot + R, R, 180, 270, 4)
    dv = bot - CY
    du = math.sqrt(Rc * Rc - dv * dv)
    a0 = math.degrees(math.atan2(dv, -du))
    a1 = math.degrees(math.atan2(dv, du)) + 360
    arc(0, CY, Rc, a0, a1, 28)
    arc(hw - R, bot + R, R, 270, 360, 4)
    return pts


def build_frame(fr):
    for sx in (-1, 1):
        x = 0.152 * sx
        path = [(x, 0.262, -0.018), (x, 0.20, -0.020), (x, 0.08, -0.022), (x, -0.06, -0.022), (x, -0.18, -0.021), (x, -0.235, -0.024), (x, -0.255, -0.040), (x, -0.262, -0.065), (x, -0.262, -0.090)]
        fr.tube(path, 0.0085, 'alu_dark', n=6, step=0.04)
    top = [(-0.152, 0.262, -0.018), (-0.10, 0.268, -0.022), (0.0, 0.270, -0.026), (0.10, 0.268, -0.022), (0.152, 0.262, -0.018)]
    fr.tube(top, 0.0085, 'alu_dark', n=6, step=0.04)
    for y, z in ((-0.02, -0.024), (-0.20, -0.022)):
        fr.tube([(-0.152, y, z), (0.0, y, z - 0.004), (0.152, y, z)], 0.007, 'alu_dark', n=6, step=0.06)
    fr.tube([(-0.152, -0.262, -0.090), (0.152, -0.262, -0.090)], 0.0085, 'alu_dark', n=8, step=0.3, smooth=False)
    for sx in (-1, 1):
        for y in (0.262, -0.02, -0.20):
            fr.cyl(0.0105, 0.016, frame((0.152 * sx, y, -0.020), (1, 0, 0)), 'alu_dark', n=8, bevel=0.002, seg=1)
    fr.strip([(-0.162, 0.13, -0.026), (-0.152, 0.13, -0.008), (-0.10, 0.13, -0.004), (0.0, 0.13, -0.003), (0.10, 0.13, -0.004), (0.152, 0.13, -0.008), (0.162, 0.13, -0.026)], 0.135, 0.003, 'webbing', step=0.02, up=(0, 0, 1))
    fr.box((0.335, 0.088, 0.024), T((0.0, -0.205, -0.012)), 'webbing', bevel=0.008, seg=2)
    for sx in (-1, 1):
        fr.box((0.032, 0.016, 0.014), T((0.085 * sx, 0.262, -0.008)), 'plastic_black', bevel=0.002)
        fr.box((0.026, 0.034, 0.010), T((0.140 * sx, -0.236, -0.006)), 'plastic_black', bevel=0.002)
        fr.box((0.022, 0.050, 0.008), T((0.172 * sx, -0.205, -0.006)), 'webbing', bevel=0.002)
    for sx in (-1, 1):
        for y in (0.20, -0.12):
            fr.cyl(0.006, 0.006, frame((0.152 * sx, y, -0.029), (0, 0, 1)), 'steel', n=6, bevel=0.001)


def build_motherboard(b):
    MBF = frame(P(0, 0, ZF), REAR, UP)
    pts = mb_outline()
    b.prism(pts, (ZF - ZM) * MM, MBF, 'paint_black', bevel=4.5 * MM, seg=2, angle=40)
    for (u, v) in ((-168, 655), (168, 655), (-168, 125), (168, 125), (0, 660), (-120, 250), (120, 250)):
        screw(b, u, v, ZM, 3.4, 'steel_dark')
    for (u, v) in ((-185.5, 520), (-185.5, 300), (185.5, 600), (185.5, 360)):
        b.cyl(3.0 * MM, 2.0 * MM, frame(P(u, v, (ZF + ZM) / 2), (math.copysign(1, -u), 0, 0)), 'steel_dark', n=6, bevel=0.0006, base=True)


def build_spacer(b):
    cr(b, 0, CY, ZM, -Z_SP + ZM, 145.5, 'paint_black', n=44, bev=2.5)
    nseg = 22
    for k in range(nseg):
        a = math.radians(k * 360.0 / nseg + 4.0)
        r = 147.4
        u, v = r * math.cos(a), CY + r * math.sin(a)
        rad = (-math.cos(a), math.sin(a), 0)
        w = 2 * 149.2 * math.sin(math.radians(360.0 / nseg / 2)) - 2.4
        b.box((w * MM, 3.4 * MM, 64.0 * MM), frame(P(u, v, (ZM + Z_SP) / 2 - 1), REAR, rad), 'paint_black', bevel=0.9 * MM, seg=1, angle=50)
    C1, R1 = (0.0, CY), 149.2
    C2, R2 = (42.9, CY + 266.7), 30.2
    dx, dy = C2[0] - C1[0], C2[1] - C1[1]
    dl = math.hypot(dx, dy)
    th = math.acos((R1 - R2) / dl)
    ad = math.atan2(dy, dx)
    an = ad - th
    t1 = (C1[0] + R1 * math.cos(an), C1[1] + R1 * math.sin(an))
    pts = [(12.7, CY + math.sqrt(R1 * R1 - 12.7 * 12.7))]
    pts.append((12.7, C2[1]))
    for k in range(1, 13):
        a = math.radians(180) + (an - math.radians(180)) * k / 12
        pts.append((C2[0] + R2 * math.cos(a), C2[1] + R2 * math.sin(a)))
    pts.append(t1)
    a_end = math.atan2(pts[0][1] - C1[1], pts[0][0] - C1[0])
    for k in range(1, 8):
        a = an + (a_end - an) * k / 8
        pts.append((C1[0] + (R1 - 6) * math.cos(a), C1[1] + (R1 - 6) * math.sin(a)))
    b.prism([(u * MM, (v) * MM) for u, v in pts], 46 * MM, frame(P(0, 0, ZM), REAR, UP), 'paint_black', bevel=2.5 * MM, seg=2, angle=40)
    zA = ZM - 46
    cr(b, 57.1, CY + 173.8, zA, 12.7, 44.35, 'paint_black', bev=1.5)
    cr(b, 57.1, CY + 173.8, zA - 12.7, 4.0, 40.0, 'paint_grey', bev=0.8)
    cr(b, 57.1, CY + 173.8, zA - 16.7, 26.0, 15.0, 'alu', n=6, bev=1.0)
    cr(b, 57.1, CY + 173.8, zA - 42.7, 3.0, 13.0, 'steel', bev=0.6)
    cr(b, 57.1, CY + 173.8, zA - 45.7, 7.0, 8.0, 'steel', n=6, bev=0.8)
    cx, cy = 57.1, CY + 173.8
    for k in range(11):
        if k < 9:
            a = math.radians(198 + k * 18)
        else:
            a = math.radians(62 + (k - 9) * 36)
        u, v = cx + 35.5 * math.cos(a), cy + 35.5 * math.sin(a)
        z = zA - 16.7
        b.tube([P(u, v, z), P(u, v, z - 6), P(u + 2.4 * math.cos(a), v + 2.4 * math.sin(a), z - 8.5), P(u + 4.6 * math.cos(a), v + 4.6 * math.sin(a), z - 6), P(u + 4.6 * math.cos(a), v + 4.6 * math.sin(a), z)], 0.75 * MM, 'copper', n=4, step=0.0035, caps=False)
    ring = [P(cx + 41 * math.cos(math.radians(a)), cy + 41 * math.sin(math.radians(a)), zA - 15.5) for a in range(192, 352, 16)]
    b.tube(ring, 0.9 * MM, 'copper', n=5, step=0.006)
    ring2 = [P(cx + 43.5 * math.cos(math.radians(a)), cy + 43.5 * math.sin(math.radians(a)), zA - 14.8) for a in range(200, 345, 18)]
    b.tube(ring2, 0.8 * MM, 'copper', n=5, step=0.006)
    cr(b, 42.9, CY + 266.7, zA, 12.7, 29.35, 'paint_black', bev=1.2)
    cr(b, 42.9, CY + 266.7, zA - 12.7, 34.0, 15.9, 'paint_grey', bev=1.5)
    cr(b, 42.9, CY + 266.7, zA - 46.7, 4.0, 11.0, 'alu', bev=0.8)


def build_cyclotron(b, emit):
    dep = Z_FL - Z_LID
    prof = [(127.0, 0.0), (127.0, 12.7), (114.3, 12.7), (114.3, 12.7 + dep * 0.45), (115.6, 12.7 + dep * 0.47), (115.6, 12.7 + dep * 0.53), (114.3, 12.7 + dep * 0.55), (114.3, 12.7 + dep - 9.5)]
    for k in range(1, 5):
        a = math.radians(90 * k / 4)
        prof.append((114.3 - 9.5 + 9.5 * math.cos(a), 12.7 + dep - 9.5 + 9.5 * math.sin(a)))
    top = 12.7 + dep
    prof += [(108.0, top), (107.0, top + 1.7), (104.0, top + 2.9), (98.5, top + 2.9), (96.5, top + 1.5), (95.0, top), (70.0, top)]
    lr(b, 0, CY, Z_SP, prof, 'paint_black', n=48, cap0=False, cap1=True, sa=40)
    bx(b, -1.5, 1.5, CY - 128, CY - 126.5, Z_SP, Z_FL, 'paint_black', bev=0)
    for k in range(8):
        a = math.radians(22.5 + k * 45)
        u, v = 120.5 * math.cos(a), CY + 120.5 * math.sin(a)
        screw(b, u, v, Z_FL, 2.8, 'steel_dark')
    lenses = [(-45.0, 50.8), (45.0, 50.8), (35.3, -39.7), (-38.1, -39.7)]
    hp = [(18.6, -1.5), (18.6, 2.1), (20.1, 3.4), (28.8, 3.4), (30.4, 2.3), (30.4, 0.0)]
    for i, (du, dv) in enumerate(lenses):
        lr(b, du, CY + dv, Z_LID, hp, 'paint_black', n=20, cap0=False, cap1=False, sa=40)
        fl = lr_faces(emit['cyc'], du, CY + dv, Z_LID, [(18.65, 0.2), (16.8, 1.5), (12.0, 2.5), (6.0, 3.0), (0.0, 3.1)], 'lens_red', n=24)
        emit['cyc'].planar_uv(fl, P(du, CY + dv, Z_LID), (-1, 0, 0), (0, 1, 0), 37.3 * MM)
        emit['cyc']._set_seg([v for v in emit['cyc'].bm.verts if not v.tag], i)
        for v in emit['cyc'].bm.verts:
            v.tag = True
    a = math.radians(16)
    ue, ve = 115.0 * math.cos(a), CY + 115.0 * math.sin(a)
    zc = (Z_FL + Z_LID) / 2 + 4
    b.cyl(5.0 * MM, 9.0 * MM, frame(P(ue, ve, zc), (-math.cos(a), math.sin(a), 0)), 'plastic_grey', n=12, bevel=0.0008, base=True)
    tip = P(ue + 9 * math.cos(a), ve + 9 * math.sin(a), zc)
    b.cyl(4.2 * MM, 12.0 * MM, frame(tip + Vector((0, 0, 4.2 * MM)), (0, 0, -1)), 'plastic_grey', n=12, bevel=0.0008, base=True)
    b.cyl(2.2 * MM, 9.0 * MM, frame(tip + Vector((0, 0, -12.0 * MM)), (0, 0, -1)), 'brass', n=8, bevel=0.0004, base=True)
    ca = math.radians(133)
    cu, cv = 131.0 * math.cos(ca), CY + 131.0 * math.sin(ca)
    tang = (math.sin(ca), math.cos(ca), 0)
    b.box((72 * MM, 26 * MM, 3.0 * MM), frame(P(cu, cv, Z_SP - 1.5), REAR, (-math.cos(ca), math.sin(ca), 0)), 'alu', bevel=0.8 * MM, seg=1)
    for s in (-24, 24):
        screw(b, cu - s * math.sin(ca), cv + s * math.cos(ca), Z_SP - 3.0, 2.6, 'steel')


def build_bumper(b, d):
    vc = CY
    zb = Z_LID - 15.7
    dz = zb + 95.0
    path = [(-183, vc, -95), (-181, vc, -95 + dz * 0.33), (-174, vc, -95 + dz * 0.66), (-160, vc, -95 + dz * 0.88), (-135, vc, zb), (0, vc, zb - 1), (135, vc, zb), (160, vc, -95 + dz * 0.88), (174, vc, -95 + dz * 0.66), (181, vc, -95 + dz * 0.33), (183, vc, -95)]
    hw, ht, c = 6.5 * MM, 18.0 * MM, 2.6 * MM
    prof = [(ht, -hw + c), (ht, hw - c), (ht - c * 0.3, hw - c * 0.3), (ht - c, hw), (-ht + c, hw), (-ht + c * 0.3, hw - c * 0.3), (-ht, hw - c), (-ht, -hw + c), (-ht + c * 0.3, -hw + c * 0.3), (-ht + c, -hw), (ht - c, -hw), (ht - c * 0.3, -hw + c * 0.3)]
    b.sweep(Pl(path), prof, 'paint_black_gloss', step=0.009, up=(0, 1, 0))
    for s in (-1, 1):
        b.box((14 * MM, 34 * MM, 22 * MM), T(P(183 * s, vc, -88)), 'paint_black', bevel=1.5 * MM)
        screw(b, 183 * s, vc + 9, -77, 2.8, 'steel_dark', axis=(0, 0, -1))
    plate = [(-84, -27), (84, -27), (70, 30), (-70, 30)]
    b.prism([(u * MM, v * MM) for u, v in plate], 10.5 * MM, frame(P(0, vc, zb - 5.0), REAR, UP), 'paint_black_gloss', bevel=2.4 * MM, seg=2)
    zh = zb - 15.5
    prof = [(13.0, 0.0), (13.0, 2.0)]
    zz = 2.0
    for k in range(7):
        prof += [(16.6, zz + 1.0), (14.6, zz + 3.0)]
        zz += 3.0
    prof += [(16.5, zz + 0.5), (16.5, zz + 3.0), (15.0, zz + 4.2), (0.0, zz + 4.6)]
    lr(b, 0, vc, zh, prof, 'alu', n=16, cap0=False, cap1=True, sa=50)
    zt = zh - (zz + 4.6)
    bx(b, -7.0, 7.0, vc - 0.8, vc + 0.8, zt + 0.6, zt - 0.4, 'steel_dark', bev=0)
    dq(d, 112, vc, zb - 6.6, 52, 28, 'cyclo')


def build_nfilter(b, d):
    nu, nv = 46.0, CY - 99.0
    zf = Z_LID - 28.8
    cr(b, nu, nv, Z_SP, (Z_SP - zf) - 4, 34.9, 'paint_black', bev=1.2)
    lr(b, nu, nv, zf + 4, [(34.9, 0.0), (35.6, 0.6), (35.6, 3.2), (34.4, 4.0), (31.0, 4.0), (30.2, 2.8)], 'paint_black', n=28, cap0=False, cap1=False, sa=40)
    cr(b, nu, nv, zf + 4.0, 2.5, 30.4, 'paint_black', bev=0)
    cr(b, nu, nv, Z_LID + 2, 7.0, 36.3, 'paint_grey', bev=0.8)
    for k in range(9):
        a = math.radians(-70 + k * 40 + (6 if k % 3 == 1 else 0))
        rad = Vector((-math.cos(a), math.sin(a), 0))
        c = P(nu, nv, Z_LID - 14.0) + rad * 34.9 * MM
        b.cyl(4.2 * MM, 1.4 * MM, frame(c - rad * 0.6 * MM, rad), 'cavity', n=8, bevel=0, base=True)
    d.disc_decal(P(nu, nv, zf + 1.5), (-1, 0, 0), (0, 1, 0), 29.0 * MM, 'decal', DEC['danger_round'], n=28, normal_off=0.25 * MM)


def build_powercell(b, d, emit):
    u0, u1, v0, v1 = -200.0, -140.0, 413.0, 564.0
    zb = ZM - 84
    bx(b, u0, u1, v0, v1, ZM, zb, 'paint_black', bev=3.0, seg=2)
    bx(b, u0 - 2, u1 + 2, v1 - 2, v1 + 6, ZM - 2, zb - 2, 'paint_black', bev=1.6, seg=2)
    for k in range(6):
        vv = v0 + 14 + k * 24.5
        bx(b, u0 - 7, u0 + 1, vv, vv + 15, ZM - 8, zb + 6, 'paint_black', bev=1.0, seg=1)
    wu0, wu1, wv0, wv1 = -171.0, -153.0, 435.0, 544.0
    for (a0, a1, c0, c1) in ((wu0 - 5, wu0, wv0 - 5, wv1 + 5), (wu1, wu1 + 5, wv0 - 5, wv1 + 5), (wu0, wu1, wv0 - 5, wv0), (wu0, wu1, wv1, wv1 + 5)):
        bx(b, a0, a1, c0, c1, zb, zb - 2.5, 'paint_black', bev=0.6, seg=1)
    pc = emit['cell']
    n = 15
    pitch = (wv1 - wv0) / n
    for i in range(n):
        a = wv0 + i * pitch + 0.8
        c = P((wu0 + wu1) / 2, a + (pitch - 1.6) / 2, zb - 0.9)
        pc.box(((wu1 - wu0 - 2.0) * MM, (pitch - 1.6) * MM, 1.2 * MM), T(c), 'cell_glass', bevel=0.3 * MM, seg=1, segval=i)
    for (u, v) in ((u0 + 7, v0 + 7), (u1 - 7, v0 + 7), (u1 - 7, v1 - 9), (u0 + 7, v1 - 9)):
        screw(b, u, v, zb, 2.4, 'steel_dark')
    cr(b, u0 - 1, 500, ZM - 30, 5, 5.0, 'steel', bev=0.6, axis=(1, 0, 0))
    for k, uu in enumerate((-190.0, -164.0)):
        zc = -104.0 - 8 * k
        b.cyl(11.5 * MM, 238 * MM, frame(P(uu, 175, zc), (0, 1, 0), (0, 0, -1)), 'paint_black', n=14, bevel=1.2 * MM, seg=1, base=True)
        b.cyl(12.5 * MM, 10 * MM, frame(P(uu, 166, zc), (0, 1, 0), (0, 0, -1)), 'brass', n=6, bevel=0.6 * MM, base=True)
        b.cyl(7.0 * MM, 9 * MM, frame(P(uu, 157, zc), (0, 1, 0), (0, 0, -1)), 'steel', n=12, bevel=0.5 * MM, base=True)
        b.cyl(12.8 * MM, 6 * MM, frame(P(uu, 410, zc), (0, 1, 0), (0, 0, -1)), 'paint_black', n=14, bevel=0.8 * MM, seg=1, base=True)
    for k, (uu, kind, off) in enumerate(((-192.0, 'wire_red', -2.0), (-188.0, 'wire_black', 2.5), (-166.0, 'wire_yellow', -2.0), (-162.0, 'wire_red', 2.0))):
        zc = -104.0 - 8 * (k // 2)
        path = [P(uu, 158, zc + off), P(uu, 130, zc + off * 1.5), P(uu + 4, 95, zc + 8 + off), P(uu + 22, 70, -86 + off), P(uu + 40, 56, -84)]
        b.tube(path, 2.2 * MM, kind, n=6, step=0.012)


def build_booster(b):
    bu, br = -61.0, 27.5
    zc = ZM - br - 6
    b.cyl(br * MM, (690 - 470) * MM, frame(P(bu, 470, zc), (0, 1, 0), (0, 0, -1)), 'paint_grey', n=32, bevel=1.5 * MM, base=True)
    b.cyl((br + 2.5) * MM, 10 * MM, frame(P(bu, 466, zc), (0, 1, 0), (0, 0, -1)), 'paint_grey', n=32, bevel=1.0 * MM, base=True)
    lr(b, bu, 690, zc, [(br + 1.0, 0.0), (br + 1.0, 4.0), (br - 1.0, 6.0), (21.0, 7.0), (19.0, 9.0), (10.0, 9.5), (0.0, 9.6)], 'paint_grey', n=32, axis=(0, 1, 0), up=(0, 0, -1), cap0=True, cap1=False, sa=45)
    for (a0, a1, nf) in ((-125.0, -98.0, 6), (-48.0, -24.0, 5)):
        bx(b, a0, a1, 440, 600, ZM, ZM - 12, 'alu_dark', bev=1.2)
        pitch = (a1 - a0) / nf
        for k in range(nf):
            uu = a0 + pitch * (k + 0.5)
            bx(b, uu - 1.2, uu + 1.2, 442, 598, ZM - 12, ZM - 44, 'alu_dark', bev=0.6, seg=1)
    bx(b, -127, -22, 595, 612, ZM, ZM - 50, 'paint_grey', bev=2.0)
    for vv in (485.0, 522.0):
        bx(b, -124, -26, vv, vv + 11, ZM - 50, ZM - 72, 'alu', bev=1.0, seg=1)
        for k in range(5):
            uu = -112 + k * 18
            bx(b, uu - 2.5, uu + 2.5, vv + 2.5, vv + 8.5, ZM - 72, ZM - 72.6, 'cavity', bev=0)
    bx(b, -95, -40, 395, 440, ZM, ZM - 32, 'paint_black', bev=2.0)
    cr(b, -67, 418, ZM - 32, 6, 9, 'steel', n=6, bev=0.6)


def build_gearbox(b, d):
    u0, u1 = -24.0, 110.0
    bx(b, u0, u1, 620, 680, ZM, ZM - 70, 'paint_grey', bev=3.0, seg=2)
    zr = ZM - 70
    for k in range(5):
        uu = u0 + 14 + k * (u1 - u0 - 28) / 4
        bx(b, uu - 6, uu + 6, 674, 684, zr + 6, zr - 4, 'paint_grey', bev=1.0, seg=1)
        bx(b, uu - 6, uu + 6, 616, 626, zr + 6, zr - 4, 'paint_grey', bev=1.0, seg=1)
    for vv in (636.0, 662.0):
        for uu in (u0 - 2, u1 + 2):
            bx(b, uu - 5, uu + 5, vv - 6, vv + 6, zr + 6, zr - 4, 'paint_grey', bev=1.0, seg=1)
    cr(b, 42, 652, zr, 12, 18, 'paint_grey', bev=1.5)
    cr(b, 42, 652, zr - 12, 2, 15, 'paint_grey', bev=0.6)
    cr(b, 63, 668, zr, 9, 7.5, 'steel', bev=0.8)
    for (u, v) in ((u0 + 9, 629), (u1 - 9, 629), (u0 + 9, 671), (u1 - 9, 671)):
        screw(b, u, v, zr, 2.6, 'steel_dark')
    hz = ZM - 34
    b.cyl(28.0 * MM, 66 * MM, frame(P(38, 593, hz), (-1, 0, 0)), 'paint_grey', n=24, bevel=1.5 * MM, base=True)
    b.cyl(31.8 * MM, 5 * MM, frame(P(104, 593, hz), (-1, 0, 0)), 'paint_grey', n=24, bevel=1.0 * MM, seg=1, base=True)
    b.cyl(24.0 * MM, 24 * MM, frame(P(14, 593, hz), (-1, 0, 0)), 'paint_black', n=20, bevel=1.0 * MM, seg=1, base=True)
    for (dy, dz) in ((-17.5, -17.5), (17.5, -17.5), (17.5, 17.5), (-17.5, 17.5)):
        b.cyl(3.0 * MM, 3.0 * MM, frame(P(109, 593 + dy, hz + dz), (-1, 0, 0)), 'steel', n=8, bevel=0.0005, base=True)
    d.quad(P(109.2, 593, hz), (0, 0, 1), (0, 1, 0), 30 * MM, 30 * MM, 'decal', uvrect=DEC['hga'], normal_off=0.3 * MM)
    bx(b, -1, u1, 497, 566, ZM, ZM - 65, 'paint_grey', bev=3.0, seg=2)
    zl = ZM - 65
    for k in range(5):
        uu = 9 + k * 23
        bx(b, uu - 6, uu + 6, 491, 501, zl + 6, zl - 4, 'paint_grey', bev=1.0, seg=1)
    for uu in (-3.0, u1 + 2):
        bx(b, uu - 5, uu + 5, 525, 537, zl + 6, zl - 4, 'paint_grey', bev=1.0, seg=1)
    bx(b, 0, 86, 502, 564, zl, zl - 1.6, 'alu', bev=0.5, seg=1)
    for uu in (4.5, 81.5):
        screw(b, uu, 533, zl - 1.6, 2.2, 'steel')
    dq(d, 43, 533, zl - 1.6, 76, 55, 'warning')
    for (u, v) in ((96, 505), (96, 558)):
        screw(b, u, v, zl, 2.6, 'steel_dark')


def build_ionarm(b):
    bx(b, -178, -112, 610, 682, ZM, ZM - 48, 'paint_grey', bev=2.5)
    bx(b, -112, -101, 618, 662, ZM - 8, ZM - 54, 'plastic_black', bev=1.5)
    bx(b, -190, -100, 682, 692, ZM + 2, ZM - 22, 'alu', bev=1.2)
    bx(b, -192, -182, 575, 692, ZM + 2, ZM - 22, 'alu', bev=1.2)
    star = []
    for k in range(32):
        a = 2 * math.pi * k / 32
        rr = 9.3 if k % 2 == 0 else 8.2
        star.append((rr * math.cos(a) * MM, rr * math.sin(a) * MM))
    b.prism(star, 22 * MM, frame(P(-192, 646, -98), (1, 0, 0)), 'steel', bevel=0.0, angle=60)
    b.cyl(6.5 * MM, 3 * MM, frame(P(-214, 646, -98), (1, 0, 0)), 'steel', n=12, bevel=0.0008, seg=1, base=True)
    for k in range(2):
        vv = 596 + k * 30
        b.cyl(5.0 * MM, 20 * MM, frame(P(-194, vv, -92), (0, 0, -1)), 'brass', n=10, bevel=0.6 * MM, base=True)
        for s in (-1, 1):
            b.tube([P(-194, vv, -92 + 2), P(-194, vv, -86), P(-188, vv, -84)], 0.6 * MM, 'steel', n=4, step=0.003)
    for (u, v) in ((-171, 617), (-119, 617), (-171, 675), (-119, 675)):
        screw(b, u, v, ZM - 48, 2.2, 'steel_dark')
    b.tube([P(-104, 642, ZM - 40), P(-104, 560, ZM - 52), P(-104, 456, ZM - 60)], 2.0 * MM, 'copper', n=8, step=0.03, smooth=False)
    b.cyl(3.4 * MM, 6 * MM, frame(P(-104, 642, ZM - 40), (0, 1, 0), (0, 0, -1)), 'brass', n=8, bevel=0.0005, base=True)
    b.tube(Pl([(-150, 682, -104), (-152, 702, -106), (-140, 726, -104), (-116, 728, -100), (-100, 712, -98), (-96, 690, -104), (-92, 662, -112), (-88, 640, -124)]), 3.0 * MM, 'wire_blue', n=7, step=0.011)
    b.cyl(4.0 * MM, 9 * MM, frame(P(-150, 680, -104), (0, 1, 0), (0, 0, -1)), 'brass', n=8, bevel=0.0006, base=True)
    b.tube(Pl([(-165, 612, -112), (-168, 590, -116), (-160, 566, -120), (-145, 562, -116), (-132, 578, -110), (-130, 606, -106)]), 2.0 * MM, 'wire_yellow', n=6, step=0.011)
    b.cyl(5.0 * MM, 8.0 * MM, frame(P(-142, 682, -104), (0, 1, 0), (0, 0, -1)), 'paint_black', n=12, bevel=0.0008, base=True)


def build_center(b, d):
    bx(b, -122, -43, 333, 391, ZM, ZM - 38, 'paint_grey', bev=2.5)
    for uu in (-101.0, -64.0):
        cr(b, uu, 362, ZM - 38, 8, 15, 'paint_grey', bev=1.5)
        bx(b, uu - 11, uu + 11, 360, 364, ZM - 46, ZM - 48, 'paint_grey', bev=0.6, seg=1)
    for (u, v) in ((-117, 338), (-48, 338), (-117, 386), (-48, 386)):
        screw(b, u, v, ZM - 38, 2.2, 'steel_dark')
    b.cyl(17.0 * MM, 88 * MM, frame(P(-22, 332, -110), (0, 1, 0), (0, 0, -1)), 'paint_black', n=24, bevel=1.5 * MM, base=True)
    b.cyl(14.0 * MM, 8 * MM, frame(P(-22, 420, -110), (0, 1, 0), (0, 0, -1)), 'paint_grey', n=20, bevel=1.0 * MM, base=True)
    cyl_decal(d, -22, 376, -110, 17.0, 60, -62, 62, 'danger_wrap', n=10)
    cr(b, -84, 300, ZM, 26, 9, 'paint_grey', bev=0.8)
    cr(b, -84, 300, ZM - 26, 9, 15.5, 'paint_grey', bev=1.5)
    bx(b, -95, -73, 298.5, 301.5, ZM - 35, ZM - 37, 'paint_grey', bev=0.5, seg=1)
    bx(b, -85.5, -82.5, 289, 311, ZM - 35, ZM - 37, 'paint_grey', bev=0.5, seg=1)
    cr(b, -8, 312, ZM, 32, 10, 'paint_grey', bev=0.8)
    cr(b, -8, 312, ZM - 32, 10, 15.5, 'paint_grey', bev=1.6)
    cr(b, -8, 312, ZM - 42, 1.0, 6, 'cavity', bev=0)
    b.tube(Pl([(-6, 312, -124), (8, 318, -136), (28, 326, -152), (40, 332, -164)]), 5.5 * MM, 'rubber', n=10, step=0.004, ribs=(0.008, 0.0009))
    b.tube(Pl([(-6, 402, -122), (20, 400, -118), (52, 398, -116), (80, 397, -118)]), 2.4 * MM, 'wire_red', n=7, step=0.01)
    b.tube(Pl([(-6, 352, -126), (12, 348, -122), (35, 342, -124), (48, 338, -135)]), 2.4 * MM, 'wire_red', n=7, step=0.01)


def build_right(b, d, emit):
    zt = -132.0
    pts = [(122.0, 292.0), (185.0, 205.0), (185.0, 654.0), (178.6, 669.6), (163.0, 676.0), (122.0, 676.0)]
    b.prism([(u * MM, v * MM) for u, v in pts], (ZM - zt) * MM, frame(P(0, 0, ZM), REAR, UP), 'paint_black', bevel=3.0 * MM, seg=2, angle=40)
    bx(b, 128, 180, 300, 470, zt, zt - 2.4, 'alu', bev=0.8, seg=1)
    for (u, v) in ((134, 307), (174, 307), (134, 463), (174, 463)):
        screw(b, u, v, zt - 2.4, 2.4, 'steel')
    for k in range(6):
        vv = 330 + k * 46
        bx(b, 185, 190, vv, vv + 12, -92, -120, 'paint_black', bev=0.8, seg=1)
    for (u, v) in ((130, 655), (178, 600), (130, 520), (178, 250)):
        screw(b, u, v, zt, 2.6, 'steel_dark')
    for (uu, kind, path) in ((136.0, 'wire_red', [(136, 668, zt - 8), (136, 690, zt - 14), (128, 700, zt - 20), (140, 690, zt - 30), (146, 640, zt - 10), (148, 560, zt - 8), (146, 480, zt - 8), (138, 400, -150), (112, 340, -165), (96, 300, -186), (104, 240, -198), (110, 196, -199)]),
                             (160.0, 'wire_blue', [(160, 668, zt - 8), (160, 690, zt - 14), (166, 700, zt - 22), (170, 680, zt - 12), (170, 600, zt - 7), (168, 520, zt - 7), (165, 450, zt - 7), (160, 420, zt - 4)])):
        b.cyl(4.5 * MM, 8 * MM, frame(P(uu, 656, zt), REAR), 'brass', n=8, bevel=0.0006, base=True)
        b.cyl(3.4 * MM, 10 * MM, frame(P(uu, 660, zt - 6), (0, 1, 0), (0, 0, -1)), 'brass', n=8, bevel=0.0005, base=True)
        b.tube(Pl(path), 2.6 * MM, kind, n=7, step=0.012)
    lamp = emit['lights']
    cr(b, 168, 636, zt, 6, 11, 'steel', bev=1.2)
    lr(lamp, 168, 636, zt - 6, [(8.0, 0.0), (7.2, 2.6), (4.8, 4.6), (0.0, 5.4)], 'lamp', n=16, cap0=True, cap1=False)
    lamp._set_seg(lamp.bm.verts[:], 0)
    for v in lamp.bm.verts:
        v.tag = True
    hose = [(106, 640, -118), (126, 644, -148), (156, 616, -158), (171, 548, -153), (166, 466, -152), (144, 418, -160), (102, 398, -166), (56, 394, -168), (16, 401, -162), (-6, 416, -152), (-14, 436, -140)]
    b.tube(Pl(hose), 12.0 * MM, 'hose', n=8, step=0.0034, ribs=(0.0068, 0.0018))
    b.cyl(14.0 * MM, 12 * MM, frame(P(100, 638, -104), (-0.35, 0.05, -0.94)), 'paint_black', n=16, bevel=1.0 * MM, base=True)
    b.cyl(14.0 * MM, 10 * MM, frame(P(-12, 432, -138), (0.25, -0.9, 0.6)), 'paint_black', n=16, bevel=1.0 * MM, base=True)


def build_gunmount(b):
    zc = (ZF + ZM) / 2 - 16
    gu = 185.0
    b.box((22 * MM, 114.3 * MM, 70 * MM), T(P(gu + 11, 523, zc)), 'paint_black', bevel=2.0 * MM)
    for k in range(3):
        zz = zc - 26 + k * 26
        b.box((6 * MM, 104 * MM, 12.7 * MM), T(P(gu + 25, 523, zz)), 'paint_black', bevel=1.2 * MM)
    hook = frame(P(gu + 30, 478, zc), (-1, 0, 0), (0, math.cos(math.radians(20)), math.sin(math.radians(20))))
    b.box((46 * MM, 16 * MM, 4 * MM), hook, 'steel', bevel=1.0 * MM)
    for (dv, dz) in ((-40, -20), (40, -20), (-40, 20), (40, 20)):
        b.cyl(2.6 * MM, 1.6 * MM, frame(P(gu + 22, 523 + dv, zc + dz), (-1, 0, 0)), 'steel', n=6, bevel=0.0004, base=True)
    return P(gu + 31, 478, zc)


def build_ribbon(b, d):
    path = Pl([(-36, 474, -124), (-58, 470, -136), (-84, 458, -146), (-104, 440, -150), (-118, 412, -150), (-136, 372, -142), (-150, 330, -136), (-152, 292, -138), (-142, 262, -148), (-128, 248, -154)])
    u0, v0, u1, v1 = DEC['ribbon']
    d.strip(path, 0.050, 0.0012, 'decal', step=0.005, up=(0, 0, -1), uvrect=(u0, v0, u1, v1), twist=0.5)
    b.tube(Pl([(-98, 476, -138), (-112, 466, -150), (-104, 448, -156), (-90, 452, -148), (-92, 470, -132)]), 1.8 * MM, 'alu', n=6, step=0.004)
    screw(b, -95, 478, -118, 2.6, 'steel')


def build_hose_anchor(b):
    pos = P(150, 108, -66)
    dirv = Vector((-0.35, -1.0, -0.15)).normalized()
    b.cyl(14.5 * MM, 16 * MM, frame(pos, dirv), 'paint_black', n=20, bevel=1.4 * MM, base=True)
    b.cyl(16.0 * MM, 5 * MM, frame(pos - dirv * 0.004, dirv), 'alu', n=20, bevel=1.0 * MM, base=True)
    b.tube([pos + dirv * 0.012, pos + dirv * 0.044], 12.5 * MM, 'hose', n=12, step=0.0032, ribs=(0.0064, 0.0017), smooth=False)
    tip = pos + dirv * 0.044
    return tip, dirv


def hose_sample(mats):
    pt = Part('HoseSample')
    n = 12
    r = 0.0130
    pitch = 0.0064
    L = 0.2
    bm = pt.bm
    rings = []
    steps = 2
    for i in range(steps + 1):
        z = L * i / steps
        ring = []
        for k in range(n + 1):
            a = 2 * math.pi * k / n
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    idx = pt.mi('hosemat')
    for i in range(steps):
        for k in range(n):
            f = bm.faces.new((rings[i][k], rings[i][k + 1], rings[i + 1][k + 1], rings[i + 1][k]))
            f.material_index = idx
            f.smooth = True
            for lp, (ii, kk) in zip(f.loops, ((i, k), (i, k + 1), (i + 1, k + 1), (i + 1, k))):
                lp[pt.uv].uv = (L * ii / steps / pitch, kk / n)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    return pt


def lens_material(name, path, emit, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get('Principled BSDF')
    t = tex_node(nt, path, 'sRGB', (-600, 200))
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(t.outputs['Color'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = strength
    b.inputs['Roughness'].default_value = 0.25
    return m


def make_mats():
    M = {}
    def add(k, *a, **kw):
        M[k] = principled('pv_' + k, *a, **kw)
    add('paint_black', (0.028, 0.028, 0.030), 0.0, 0.42)
    add('paint_black_gloss', (0.024, 0.024, 0.026), 0.0, 0.3)
    add('paint_grey', (0.075, 0.075, 0.08), 0.45, 0.42)
    add('alu', (0.62, 0.62, 0.64), 1.0, 0.32)
    add('alu_dark', (0.035, 0.035, 0.04), 0.7, 0.38)
    add('steel', (0.58, 0.58, 0.6), 1.0, 0.28)
    add('steel_dark', (0.12, 0.12, 0.13), 1.0, 0.35)
    add('rubber', (0.018, 0.018, 0.018), 0.0, 0.75)
    add('hose', (0.02, 0.02, 0.022), 0.0, 0.5)
    add('copper', (0.92, 0.5, 0.3), 1.0, 0.3)
    add('brass', (0.86, 0.66, 0.32), 1.0, 0.3)
    add('wire_red', (0.5, 0.025, 0.02), 0.0, 0.35)
    add('wire_blue', (0.025, 0.09, 0.5), 0.0, 0.35)
    add('wire_yellow', (0.7, 0.5, 0.03), 0.0, 0.4)
    add('wire_black', (0.02, 0.02, 0.02), 0.0, 0.4)
    add('webbing', (0.085, 0.095, 0.05), 0.0, 0.92)
    add('plastic_black', (0.015, 0.015, 0.016), 0.0, 0.35)
    add('plastic_grey', (0.35, 0.36, 0.37), 0.0, 0.4)
    add('cavity', (0.006, 0.006, 0.006), 0.0, 0.9)
    M['decal'] = textured_material('PackDecals', os.path.join(TEX, 'pack_decals.jpg'), rough=0.42)
    M['lens_red'] = lens_material('CyclotronEmit', os.path.join(TEX, 'cyclotron_lens.jpg'), (1.0, 0.035, 0.015), 4.0)
    M['cell_glass'] = principled('PowerCellEmit', (0.55, 0.65, 0.8), 0.0, 0.35, emit=(0.12, 0.42, 1.0), emit_strength=6.0)
    M['lamp'] = principled('PackLightsEmit', (0.35, 0.03, 0.02), 0.0, 0.2, emit=(1.0, 0.12, 0.04), emit_strength=5.0)
    M['hosemat'] = textured_material('HoseMat', os.path.join(TEX, 'hose_flat.jpg'), normal_path=os.path.join(TEX, 'hose_ribs_n.png'), rough=0.55, metal=0.0)
    return M


def ensure_hose_flat():
    p = os.path.join(TEX, 'hose_flat.jpg')
    if not os.path.exists(p):
        img = bpy.data.images.new('hose_flat', 16, 16)
        img.pixels = [0.025, 0.025, 0.027, 1.0] * 256
        img.filepath_raw = p
        img.file_format = 'JPEG'
        img.save()
    return p


def build():
    reset()
    ensure_hose_flat()
    M = make_mats()
    root = bpy.data.objects.new('ProtonPack', None)
    bpy.context.scene.collection.objects.link(root)
    fr = Part('Frame')
    b = Part('PackBody')
    d = Part('PackDecals')
    emit = {'cyc': Part('CyclotronEmit', seg=True), 'cell': Part('PowerCellEmit', seg=True), 'lights': Part('PackLightsEmit', seg=True)}
    def tb():
        return sum(len(f.verts) - 2 for f in b.bm.faces)
    acc = {}
    def run(name, fn, *a):
        t0 = tb()
        r = fn(*a)
        acc[name] = tb() - t0
        return r
    build_frame(fr)
    run('motherboard', build_motherboard, b)
    run('spacer', build_spacer, b)
    run('cyclotron', build_cyclotron, b, emit)
    run('bumper', build_bumper, b, d)
    run('nfilter', build_nfilter, b, d)
    run('powercell', build_powercell, b, d, emit)
    run('booster', build_booster, b)
    run('gearbox', build_gearbox, b, d)
    run('ionarm', build_ionarm, b)
    run('center', build_center, b, d)
    run('right', build_right, b, d, emit)
    hook = run('gunmount', build_gunmount, b)
    run('ribbon', build_ribbon, b, d)
    hose_tip, hose_dir = run('hoseanchor', build_hose_anchor, b)
    print('BODY_TRIS_BY_PART', acc)
    lamp = emit['lights']
    lr(lamp, -150, 664, ZM - 48, [(5.0, 0.0), (4.4, 1.8), (2.6, 3.2), (0.0, 3.6)], 'lamp', n=12, cap0=True, cap1=False)
    lamp._set_seg([v for v in lamp.bm.verts if not v.tag], 1)
    cr(b, -150, 664, ZM - 48, 1.8, 6.6, 'steel', bev=0.5)
    objs = {}
    objs['Frame'] = make_object(fr, M, parent=root)
    objs['PackBody'] = make_object(b, M, parent=root)
    objs['PackDecals'] = make_object(d, M, parent=root, weighted=False)
    for key, name, segs in (('cyc', 'CyclotronEmit', 4), ('cell', 'PowerCellEmit', 15), ('lights', 'PackLightsEmit', 2)):
        o = make_object(emit[key], M, parent=root, weighted=False, name=name)
        o['segments'] = segs
        objs[name] = o
    hs = hose_sample(M)
    o = make_object(hs, M, parent=root, weighted=False)
    o['hidden'] = True
    o['hose_radius'] = 0.013
    o['rib_pitch'] = 0.0065
    objs['HoseSample'] = o
    for ob in objs.values():
        if ob.type == 'MESH':
            apply_mods(ob)
    E = {}
    wand_q = basis_g(x=(0, 0, 1), y=(-1, 0, 0))
    E['GunMount'] = empty('GunMount', hook_to_wand_root(hook), wand_q, parent=root)
    E['HoseAnchor'] = empty('HoseAnchor', hose_tip, basis_g(z=hose_dir, y=(0, 0, -1)), parent=root)
    E['Vent'] = empty('Vent', P(46.0, CY - 99.0, Z_LID - 29.5), basis_g(y=(0, 0, -1), x=(1, 0, 0)), parent=root)
    E['StrapTop_L'] = empty('StrapTop_L', (0.085, 0.262, -0.004), None, parent=root)
    E['StrapTop_R'] = empty('StrapTop_R', (-0.085, 0.262, -0.004), None, parent=root)
    E['StrapBottom_L'] = empty('StrapBottom_L', (0.140, -0.236, -0.004), None, parent=root)
    E['StrapBottom_R'] = empty('StrapBottom_R', (-0.140, -0.236, -0.004), None, parent=root)
    E['Belt_L'] = empty('Belt_L', (0.175, -0.205, -0.004), None, parent=root)
    E['Belt_R'] = empty('Belt_R', (-0.175, -0.205, -0.004), None, parent=root)
    E['Handle'] = empty('Handle', (0.0, 0.270, -0.026), None, parent=root)
    return root, objs, E, M


from common import WAND_HOOK_LOCAL as _WHL
WAND_HOOK_LOCAL = Vector(_WHL)


def hook_to_wand_root(hook_g):
    R = basis_g(x=(0, 0, 1), y=(-1, 0, 0))
    return hook_g - R @ WAND_HOOK_LOCAL


def bounds(objs):
    mn = Vector((1e9, 1e9, 1e9)); mx = -mn
    for ob in objs:
        if ob.type != 'MESH' or ob.name == 'HoseSample':
            continue
        for v in ob.data.vertices:
            g = B2G @ (ob.matrix_world @ v.co)
            mn = Vector(map(min, mn, g)); mx = Vector(map(max, mx, g))
    return mn, mx


def preview_render(objs, tag):
    hd = os.path.join(WORK, 'hdri', 'studio_small_08_1k.hdr')
    setup_render((1280, 720), samples=48, hdri=hd, strength=0.9)
    cam = add_camera()
    add_area('Key', (0.9, 1.3, -1.3), (0, 0, -0.1), 160, 1.2)
    add_area('Rim', (-1.2, 0.6, 0.4), (0, 0, -0.1), 90, 1.0)
    add_area('Fill', (0.0, -0.6, -1.6), (0, 0, -0.1), 30, 2.0)
    views = OPT.get('views', 'hero,rear,side').split(',')
    V = {'hero': ((0.95, 0.55, -1.85), (0.0, 0.0, -0.12), 50), 'rear': ((0.0, 0.0, -2.35), (0.0, 0.0, -0.10), 50),
         'side': ((-2.2, 0.05, -0.12), (0.0, 0.0, -0.12), 50), 'top': ((0.0, 2.1, -0.55), (0.0, 0.0, -0.12), 50),
         'cyc': ((0.25, -0.12, -0.95), (0.0, -0.21, -0.20), 70), 'front': ((0.45, 0.2, 2.1), (0, 0, -0.08), 50),
         'right34': ((-1.05, 0.45, -1.75), (0.0, 0.0, -0.12), 50), 'left': ((2.2, 0.05, -0.12), (0.0, 0.0, -0.12), 50)}
    for o in bpy.context.scene.objects:
        if o.name == 'HoseSample':
            o.hide_render = True
    for vname in views:
        pos, tgt, lens = V[vname]
        look_at_g(cam, pos, tgt, lens)
        render_to(os.path.join(WORK, f'{tag}_{vname}.jpg'))


def join_into(target, others):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in others:
        o.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    return target


def single_material(ob, mat):
    me = ob.data
    n = len(me.polygons)
    me.polygons.foreach_set('material_index', [0] * n)
    me.materials.clear()
    me.materials.append(mat)


def texel_density(ob, size):
    me = ob.data
    uv = me.uv_layers.active.data
    a3 = a2 = 0.0
    for p in me.polygons:
        a3 += p.area
        li = list(p.loop_indices)
        for k in range(1, len(li) - 1):
            (x0, y0), (x1, y1), (x2, y2) = uv[li[0]].uv, uv[li[k]].uv, uv[li[k + 1]].uv
            a2 += abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)) / 2
    return math.sqrt(a2 * size * size / max(a3, 1e-9)) / 1000.0, a2


def do_bake(objs, M):
    import bake
    import importlib
    importlib.reload(bake)
    body = join_into(objs['PackBody'], [objs['Frame']])
    del objs['Frame']
    kinds = [ms.material.name.replace('pv_', '') for ms in body.material_slots]
    scale = {i: 0.45 for i, k in enumerate(kinds) if k in ('webbing', 'alu_dark', 'plastic_black')}
    bake.unwrap(body, margin=0.0016, angle=58.0, island_scale=scale)
    size = int(OPT.get('tex', 2048))
    tpm, used = texel_density(body, size)
    print('TEXEL px/mm', round(tpm, 3), 'uv used', round(used, 3))
    out = bake.bake_atlas(body, 'protonpack', size=size, mask_size=int(OPT.get('masksize', 1024)), variants=('film', 'worn'), samples=int(OPT.get('samples', 8)), outdir=TEX)
    mat = textured_material('ProtonPackMat', out[('film', 'color')], out[('film', 'orm')])
    single_material(body, mat)
    import shutil
    shutil.copyfile(out[('worn', 'color')], os.path.join(ASSETS, 'protonpack_worn_basecolor.jpg'))
    shutil.copyfile(out[('worn', 'orm')], os.path.join(ASSETS, 'protonpack_worn_orm.jpg'))
    return body


def main():
    root, objs, E, M = build()
    allm = [o for o in objs.values()]
    print('TRIS', {k: tri_count([o]) for k, o in objs.items()}, 'total', tri_count([o for k, o in objs.items() if k != 'HoseSample']))
    mn, mx = bounds(allm)
    print('BOUNDS', [round(x, 4) for x in mn], [round(x, 4) for x in mx])
    for k, e in E.items():
        print('EMPTY', k, world_pose_g(e))
    if OPT.get('bake'):
        do_bake(objs, M)
        objs['PackDecals'].data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.45
    if OPT.get('export'):
        export_glb(os.path.join(ASSETS, 'protonpack.glb'), root)
    if OPT.get('blend'):
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, 'pack_geo.blend'))
    if OPT.get('render'):
        preview_render(list(objs.values()), OPT.get('tag', 'geo'))


if __name__ == '__main__':
    main()
