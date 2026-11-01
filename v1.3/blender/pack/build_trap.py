# Ghostbusters pack lane: builds assets/pack/trap.glb (1984 ghost trap with doors, lights and the foot pedal), headless Blender 4.5.
import bpy, bmesh, math, os, sys, json, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OPT = {a.split('=')[0].lstrip('-'): (a.split('=')[1] if '=' in a else True) for a in ARGS}
DEC = json.load(open(os.path.join(TEX, 'trap_decals.json')))
DOOR_OPEN = 78.0
PEDAL_POS = (0.30, 0.0, -0.32)
PEDAL_YAW = 25.0
LEFT, RIGHT, UPV, FWD, BACK = (1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, 0, 1), (0, 0, -1)


def Q(x, y, z):
    return Vector((x * MM, y * MM, z * MM))


def tb(pt, x0, x1, y0, y1, z0, z1, kind, bev=1.5, seg=None, angle=30):
    dims = (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))
    if seg is None:
        seg = 2 if min(dims) >= 14 else 1
    pt.box((dims[0] * MM, dims[1] * MM, dims[2] * MM), T(Q((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)), kind, bevel=bev * MM, seg=seg, angle=angle)


def tc(pt, x, y, z, axis, h, r, kind, n=None, bev=0.8, seg=None, up=None):
    if r <= 2.6 and h <= 1.6:
        pt.cyl(r * MM, h * MM, frame(Q(x, y, z), axis, up), kind, n=6, bevel=0.0, base=True)
        return
    if n is None:
        n = max(8, min(20, int(round(2 * math.pi * r / 5.0))))
    else:
        n = min(n, 20)
    if seg is None:
        seg = 2 if r >= 12 else 1
    pt.cyl(r * MM, h * MM, frame(Q(x, y, z), axis, up), kind, n=n, bevel=bev * MM, seg=seg, base=True)


def side_prism(pt, pts_zy, x0, x1, kind, bev=1.6, seg=2):
    pt.prism([(z * MM, y * MM) for z, y in pts_zy], (x1 - x0) * MM, frame(Q(x1, 0, 0), (-1, 0, 0), (0, 1, 0)), kind, bevel=bev * MM, seg=seg)


def build_trap_body(b, d, E):
    for s in (1, -1):
        for z in (92.0, -92.0):
            tc(b, 30 * s, 10, z, (s, 0, 0), 8, 10, 'rubber', n=10, bev=1.2)
            tb(b, min(26 * s, 40 * s), max(26 * s, 40 * s), 18, 24, z - 9, z + 9, 'paint_black', bev=0.8, seg=1)
    tb(b, -45, 45, 14, 24, -112, 122, 'paint_black', bev=1.6)
    tb(b, -48, 48, 24, 60, -96, 124, 'paint_black', bev=2.0)
    wall = 5.0
    for (x0, x1) in ((-48, -48 + wall), (48 - wall, 48)):
        tb(b, x0, x1, 60, 124, -58, 124, 'paint_black', bev=1.2)
    tb(b, -48, 48, 60, 124, 118, 126, 'paint_black', bev=1.2)
    tb(b, -48, 48, 60, 124, -62, -55, 'paint_black', bev=1.2)
    tb(b, -43, 43, 60, 63, -55, 118, 'cavity', bev=0.0)
    for k in range(4):
        zz = -30 + k * 40
        tc(b, 0, 63, zz, UPV, 6, 7, 'paint_grey', n=8, bev=0.6)
    front = [(118.0, 24.0), (155.0, 24.0), (155.0, 132.0), (147.0, 152.0), (122.0, 152.0), (118.0, 140.0)]
    side_prism(b, front, -50, 50, 'paint_black', bev=2.0)
    tb(b, -30, 30, 140, 152.6, 128, 146, 'paint_black', bev=1.0, seg=1)
    tb(b, -24, 24, 152.6, 153.2, 130, 144, 'cavity', bev=0.0)
    tb(b, -46, 46, 34, 112, 155, 158, 'alu', bev=1.0, seg=1)
    for (x, y) in ((-40, 40), (40, 40), (-40, 106), (40, 106)):
        tc(b, x, y, 158, FWD, 1.2, 2.4, 'steel', n=6, bev=0.2)
    for x in (-22, 22):
        tc(b, x, 88, 158, FWD, 7, 5.5, 'plastic_black', n=16, bev=0.6)
        tc(b, x, 88, 165, FWD, 3, 3.5, 'steel', n=10, bev=0.3)
    for x in (-12, 12):
        tc(b, x, 58, 158, FWD, 2.5, 4.5, 'steel', n=6, bev=0.3)
        b.cyl(1.2 * MM, 12 * MM, frame(Q(x, 58, 160.5), (0.0, 0.4, 0.92)), 'steel', n=6, bevel=0.0, base=True)
    rear = [(-160.0, 24.0), (-96.0, 24.0), (-96.0, 118.0), (-140.0, 118.0), (-160.0, 98.0)]
    side_prism(b, rear, -50, 50, 'paint_black', bev=2.2)
    tb(b, -50, 50, 24, 118, -96, -62, 'paint_black', bev=1.6)
    tb(b, -12, 12, 112, 178, -96, -76, 'paint_black', bev=2.0)
    tc(b, 0, 164, -72, BACK, 128, 10.0, 'paint_black_gloss', n=20, bev=1.4)
    tc(b, 0, 164, -66, BACK, 6, 11.5, 'paint_black', n=20, bev=0.8)
    tb(b, -8, 8, 128, 176, -100, -92, 'paint_black', bev=1.0, seg=1)
    tc(b, -30, 118, -138, UPV, 4, 7.5, 'steel', n=14, bev=0.6)
    d.quad(Q(0, 64, -160.4), (-1, 0, 0), (0, 1, 0), 56 * MM, 38 * MM, 'decal', uvrect=DEC['danger'], normal_off=0.3 * MM)
    tc(b, 18, 38, -160, BACK, 10, 7.0, 'steel', n=6, bev=0.6)
    tc(b, 18, 38, -170, BACK, 12, 5.0, 'brass', n=12, bev=0.5)
    for s in (1, -1):
        x = 48.5 * s
        xo = x + 2.2 * s
        tb(b, min(x, xo), max(x, xo), 26, 98, -86, 116, 'alu', bev=0.8, seg=1)
        for (y, z) in ((31, -81), (93, -81), (31, 111), (93, 111), (62, 111), (62, -81)):
            tc(b, xo, y, z, (s, 0, 0), 1.0, 2.3, 'steel_dark', n=6, bev=0.2)
    xl = 50.7
    for y in (72.0, 40.0):
        tc(b, xl + 6.8, y, -74, FWD, 84, 6.8, 'paint_orange', n=16, bev=2.5)
        for zz in (-70.0, 6.0):
            tb(b, xl, xl + 4.0, y - 4, y + 4, zz - 3, zz + 3, 'steel_dark', bev=0.6, seg=1)
    tb(b, xl, xl + 2.0, 32, 90, 50, 108, 'alu', bev=0.8, seg=1)
    for (y, z) in ((36, 54), (86, 54), (36, 104), (86, 104)):
        tc(b, xl + 2.0, y, z, LEFT, 1.0, 2.0, 'steel', n=6, bev=0.2)
    tc(b, xl + 2.0, 60, 84, LEFT, 6, 9.5, 'plastic_black', n=20, bev=1.0)
    tc(b, xl + 8.0, 60, 84, LEFT, 7, 8.0, 'plastic_black', n=16, bev=1.0)
    tb(b, xl + 8, xl + 14.5, 58.5, 61.5, 76, 92, 'plastic_black', bev=0.6, seg=1)
    d.quad(Q(xl + 2.3, 61, 62), (0, 0, -1), (0, 1, 0), 14 * MM, 26 * MM, 'decal', uvrect=DEC['danger2'], normal_off=0.3 * MM)
    xr = -50.7
    tb(b, xr - 2.0, xr, 36, 86, 6, 66, 'alu', bev=0.8, seg=1)
    tb(b, xr - 6.0, xr - 2.0, 50, 72, 14, 58, 'brass', bev=0.8, seg=1)
    for k in range(6):
        zz = 17 + k * 7.6
        tb(b, xr - 9.5, xr - 6.0, 52, 70, zz - 1.2, zz + 1.2, 'brass', bev=0.4, seg=1)
    for zz in (8.0, 64.0):
        b.tube([Q(xr - 4, 61, zz), Q(xr - 8, 61, zz + (6 if zz < 30 else -6))], 1.0 * MM, 'copper', n=5, step=0.004, smooth=False)
    tc(b, xr - 2.0, 60, 94, RIGHT, 6, 9.5, 'plastic_black', n=20, bev=1.0)
    tc(b, xr - 8.0, 60, 94, RIGHT, 6, 8.0, 'plastic_black', n=16, bev=1.0)
    tb(b, xr - 14.5, xr - 12.0, 58.5, 61.5, 86, 102, 'plastic_black', bev=0.6, seg=1)
    d.quad(Q(xr - 2.3, 64, -40), (0, 0, 1), (0, 1, 0), 52 * MM, 28 * MM, 'decal', uvrect=DEC['spec'], normal_off=0.3 * MM)
    for (x, z) in ((-46, 120), (46, 120), (-46, -92), (46, -92)):
        tc(b, x, 124, z, UPV, 1.2, 2.4, 'steel_dark', n=6, bev=0.2)


def build_door(pt, dd, side):
    s = 1 if side == 'L' else -1
    x_out, x_in = 48.0 * s, 1.0 * s
    x0, x1 = min(x_out, x_in), max(x_out, x_in)
    tb(pt, x0, x1, 126, 141, -54, 118, 'paint_black', bev=1.6)
    hx = 49.5 * s
    for z in (-40.0, 30.0, 100.0):
        tc(pt, hx, 126, z - 12, FWD, 24, 3.2, 'steel', n=10, bev=0.4)
    key = 'stripes_l' if side == 'L' else 'stripes_r'
    dd.quad(Q((x0 + x1) / 2, 141, 32), (0, 0, -s), (-s, 0, 0), 170 * MM, 45 * MM, 'decal', uvrect=DEC[key], normal_off=0.3 * MM)
    tb(pt, x0 + 4, x1 - 4, 121, 126, -50, 114, 'cavity', bev=0.0)


def build_pedal(p, P2, PA):
    tb(p, -44, 44, 0, 20, -132, 132, 'wood_black', bev=2.5, seg=1)
    tb(p, 44, 92, 0, 14, 50, 132, 'wood_black', bev=2.0, seg=1)
    for (x, z) in ((-34, -118), (34, -118), (-34, 118), (34, 118)):
        tc(p, x, 0, z, (0, -1, 0), 3, 7, 'rubber', n=8, bev=0.6)
    hz = -112.0
    tb(p, -40, 40, 20, 26, hz - 10, hz + 10, 'steel', bev=1.0, seg=1)
    p.cyl(4.0 * MM, 80 * MM, frame(Q(-40, 28, hz), LEFT), 'steel', n=8, bevel=0.0005, seg=1, base=True)
    ang = math.radians(13.0)
    zb = 30.0
    top = 28.0 + (zb - hz) * math.tan(ang) - 6.0
    prof = [(24.0, 0.0)]
    yy = 0.0
    folds = 4
    step = (top - 20.0) / folds
    for k in range(folds):
        prof += [(25.0, yy + step * 0.15), (28.5, yy + step * 0.5), (25.0, yy + step * 0.85)]
        yy += step
    prof += [(24.0, top - 20.0)]
    p.lathe([(r * MM, y * MM) for r, y in prof], frame(Q(0, 20, zb), UPV, (0, 0, 1)), 'rubber', n=14, cap0=False, cap1=True, smooth_angle=50)
    M = Matrix.Translation(Q(0, 28, hz)) @ Matrix.Rotation(-ang, 4, 'X')
    L = 232.0
    tb_local(P2['pt'], M, -36, 36, -4, 4, -8, L, 'alu_dark', bev=1.0)
    for k in range(9):
        x = -32.0 + k * 8.0
        tb_local(P2['pt'], M, x - 2.4, x + 2.4, 4, 9.5, -4, L - 4, 'alu_dark', bev=0.8, seg=1)
    tb_local(P2['pt'], M, -36, 36, -10, -4, L - 14, L, 'alu_dark', bev=0.8, seg=1)
    tb_local(P2['pt'], M, -36, -30, -12, -4, 0, L - 20, 'alu_dark', bev=0.6, seg=1)
    tb_local(P2['pt'], M, 30, 36, -12, -4, 0, L - 20, 'alu_dark', bev=0.6, seg=1)
    tb(p, 30, 88, 14, 78, 74, 130, 'plastic_black', bev=2.5)
    tc(p, 59, 78, 104, UPV, 5, 19, 'paint_grey', n=20, bev=0.8)
    tc(p, 59, 83, 104, UPV, 9, 15.5, 'paint_black', n=18, bev=0.8)
    tc(p, 59, 92, 104, UPV, 1.0, 12.5, 'cavity', n=16, bev=0.0)
    for k in range(9):
        a = 2 * math.pi * k / 9
        tc(p, 59 + 7 * math.cos(a), 89, 104 + 7 * math.sin(a), UPV, 3.5, 1.0, 'brass', n=4, bev=0.0)
    for (dx, dz) in ((-17, -17), (17, -17), (-17, 17), (17, 17)):
        tc(p, 59 + dx, 78, 104 + dz, UPV, 1.2, 2.4, 'steel', n=6, bev=0.0)
    tc(p, 40, 78, 82, UPV, 3.0, 3.2, 'plastic_red', n=10, bev=0.3)
    tb(p, -96, -46, 0, 40, -126, -38, 'paint_black', bev=1.8)
    d2 = PA['decals']
    d2.quad(Q(-96.3, 22, -82), (0, 0, 1), (0, 1, 0), 60 * MM, 30 * MM, 'decal', uvrect=DEC['pedal_spec'], normal_off=0.3 * MM)
    for (x, y) in ((-92, 4), (-92, 36), (-50, 4), (-50, 36)):
        tc(p, x, y, -38, FWD, 1.0, 2.2, 'steel', n=6, bev=0.0)
    tc(p, -71, 20, -126, BACK, 9, 7.0, 'steel', n=6, bev=0.6)
    tc(p, -71, 20, -135, BACK, 12, 5.0, 'brass', n=12, bev=0.4)
    tc(p, -46, 26, -60, LEFT, 7, 4.5, 'brass', n=8, bev=0.4)
    for (kind, path) in (('wire_red', [(-40, 28, -62), (-26, 30, -40), (-14, 26, -6), (-8, 30, 26), (2, 34, 30)]),
                         ('wire_yellow', [(-40, 24, -58), (-30, 22, -30), (-20, 22, 0), (-12, 26, 34), (-2, 30, 36)])):
        p.tube([Q(*q) for q in path], 1.8 * MM, kind, n=6, step=0.012)
    p.strip([Q(32, 60, 72), Q(28, 52, 40), Q(30, 40, 6), Q(36, 28, -20)], 0.020, 0.0012, 'plastic_grey', step=0.01, up=(1, 0, 0))
    return Q(-71, 20, -147), Vector((0.0, 0.0, -1.0))


def tb_local(pt, M, x0, x1, y0, y1, z0, z1, kind, bev=1.0, seg=None):
    dims = (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))
    if seg is None:
        seg = 2 if min(dims) >= 14 else 1
    c = M @ Q((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    R = M.to_3x3().to_4x4()
    R.translation = c
    pt.box((dims[0] * MM, dims[1] * MM, dims[2] * MM), R, kind, bevel=bev * MM, seg=seg)


def make_mats():
    M = {}
    for k, c, mt, r in (('paint_black', (0.026, 0.026, 0.028), 0.0, 0.42), ('paint_black_gloss', (0.022, 0.022, 0.024), 0.0, 0.3), ('paint_grey', (0.08, 0.08, 0.085), 0.5, 0.4),
                        ('alu', (0.6, 0.6, 0.62), 1.0, 0.32), ('alu_dark', (0.07, 0.07, 0.075), 0.8, 0.4), ('steel', (0.58, 0.58, 0.6), 1.0, 0.28), ('steel_dark', (0.12, 0.12, 0.13), 1.0, 0.35),
                        ('rubber', (0.018, 0.018, 0.018), 0.0, 0.75), ('hose', (0.02, 0.02, 0.022), 0.0, 0.5), ('brass', (0.8, 0.62, 0.3), 1.0, 0.3), ('copper', (0.9, 0.5, 0.3), 1.0, 0.3),
                        ('wire_red', (0.5, 0.03, 0.02), 0.0, 0.35), ('wire_yellow', (0.7, 0.5, 0.03), 0.0, 0.4), ('plastic_black', (0.015, 0.015, 0.016), 0.0, 0.35),
                        ('plastic_red', (0.5, 0.03, 0.02), 0.0, 0.3), ('plastic_grey', (0.35, 0.36, 0.37), 0.0, 0.4), ('cavity', (0.006, 0.006, 0.006), 0.0, 0.9),
                        ('wood_black', (0.035, 0.032, 0.03), 0.0, 0.6), ('paint_orange', (0.42, 0.12, 0.03), 0.0, 0.5)):
        M[k] = principled('pv_' + k, c, mt, r)
    M['decal'] = textured_material('TrapDecals', os.path.join(TEX, 'trap_decals.jpg'), rough=0.5)
    M['emit'] = principled('TrapEmit', (0.6, 0.35, 0.08), 0.0, 0.3, emit=(1.0, 0.45, 0.08), emit_strength=4.0)
    return M


def build():
    reset()
    M = make_mats()
    root = bpy.data.objects.new('Trap', None)
    bpy.context.scene.collection.objects.link(root)
    b = Part('TrapBody')
    d = Part('TrapDecals')
    em = Part('TrapEmit', seg=True)
    E = {}
    build_trap_body(b, d, E)
    n = 10
    for i in range(n):
        x = -22.5 + (i + 0.5) * 4.5
        em.box((3.6 * MM, 0.8 * MM, 12 * MM), T(Q(x, 153.3, 137)), 'emit', bevel=0.0, segval=i)
    for v in em.bm.verts:
        v.tag = True
    em.lathe([(5.0 * MM, 0.0), (4.6 * MM, 3.0 * MM), (3.0 * MM, 6.0 * MM), (0.0, 7.0 * MM)], frame(Q(30, 152, 126), UPV), 'emit', n=14)
    em._set_seg([v for v in em.bm.verts if not v.tag], 10)
    for v in em.bm.verts:
        v.tag = True
    em.lathe([(6.0 * MM, 0.0), (5.6 * MM, 3.4 * MM), (3.6 * MM, 6.4 * MM), (0.0, 7.6 * MM)], frame(Q(-30, 122, -138), UPV), 'emit', n=14)
    em._set_seg([v for v in em.bm.verts if not v.tag], 11)
    for v in em.bm.verts:
        v.tag = True
    for k in range(4):
        em.lathe([(4.0 * MM, 0.0), (3.6 * MM, 4.0 * MM), (0.0, 6.0 * MM)], frame(Q(0, 69, -30 + k * 40), UPV), 'emit', n=10)
    em._set_seg([v for v in em.bm.verts if not v.tag], 12)
    objs = {'TrapBody': make_object(b, M, parent=root), 'TrapDecals': make_object(d, M, parent=root, weighted=False)}
    o = make_object(em, M, parent=root, weighted=False, name='TrapEmit')
    o['segments'] = 13
    objs['TrapEmit'] = o
    for side, hx in (('L', 49.5), ('R', -49.5)):
        pd = Part('Door' + side)
        dd = Part('Door' + side + 'Decal')
        build_door(pd, dd, side)
        od = make_object(pd, M, parent=None, pivot_g=Q(hx, 126, 0), name='Door' + side)
        od.parent = root
        objs['Door' + side] = od
        odd = make_object(dd, M, parent=None, pivot_g=Q(hx, 126, 0), weighted=False, name='Door' + side + 'Decal')
        odd.parent = od
        odd.location = (0, 0, 0)
        objs['Door' + side + 'Decal'] = odd
    pedal_root = bpy.data.objects.new('Pedal', None)
    bpy.context.scene.collection.objects.link(pedal_root)
    p = Part('PedalBody')
    P2 = {'pt': Part('PedalPlate')}
    PA = {'decals': Part('PedalDecals')}
    anchor_pos, anchor_dir = build_pedal(p, P2, PA)
    objs['PedalBody'] = make_object(p, M, parent=pedal_root)
    objs['PedalDecals'] = make_object(PA['decals'], M, parent=pedal_root, weighted=False)
    hinge = Q(0, 28, -112)
    op = make_object(P2['pt'], M, parent=None, pivot_g=hinge, name='PedalPlate')
    op.parent = pedal_root
    objs['PedalPlate'] = op
    E['PedalAnchor'] = empty('PedalAnchor', anchor_pos, basis_g(z=anchor_dir, y=(0, 1, 0)), parent=pedal_root)
    for ob in objs.values():
        apply_mods(ob)
    E['CableAnchor'] = empty('CableAnchor', Q(18, 38, -182), basis_g(z=(0, -0.35, -1.0), y=(0, 1, 0)), parent=root)
    E['BeamOrigin'] = empty('BeamOrigin', Q(0, 126, 32), basis_g(y=(0, 1, 0), z=(0, 0, 1)), parent=root)
    smokes = [(-44, 136, 116), (44, 136, 116), (-44, 136, -52), (44, 136, -52), (0, 142, 34), (0, 122, -150)]
    for i, (x, y, z) in enumerate(smokes):
        E[f'Smoke_{i + 1}'] = empty(f'Smoke_{i + 1}', Q(x, y, z), basis_g(y=(0, 1, 0), z=(0, 0, 1)), parent=root)
    pm = Matrix.Translation(Vector(PEDAL_POS)) @ Matrix.Rotation(math.radians(PEDAL_YAW), 4, 'Y')
    pedal_root.matrix_world = G2B @ pm @ B2G
    return root, pedal_root, objs, E, M


def do_bake(objs):
    import bake, importlib
    importlib.reload(bake)
    groups = [objs['TrapBody'], objs['DoorL'], objs['DoorR'], objs['PedalBody'], objs['PedalPlate']]
    for o in bpy.context.scene.objects:
        o.select_set(False)
    saved = {}
    for o in groups:
        saved[o.name] = (o.parent, o.matrix_world.copy())
    tmp = []
    for o in groups:
        c = o.copy()
        c.data = o.data.copy()
        bpy.context.scene.collection.objects.link(c)
        c.parent = None
        c.matrix_world = saved[o.name][1]
        c['_src'] = o.name
        tmp.append(c)
    bpy.ops.object.select_all(action='DESELECT')
    for c in tmp:
        c.select_set(True)
    bpy.context.view_layer.objects.active = tmp[0]
    for c in tmp:
        c.data['srcname'] = c['_src']
        me = c.data
        attr = me.attributes.new('srcid', 'INT', 'FACE')
        attr.data.foreach_set('value', [groups.index(bpy.data.objects[c['_src']])] * len(me.polygons))
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = 'TrapBakeAll'
    bake.unwrap(joined, margin=0.002, angle=58.0)
    size = int(OPT.get('tex', 2048))
    out = bake.bake_atlas(joined, 'trap', size=size, mask_size=int(OPT.get('masksize', 1024)), variants=('film', 'worn'), samples=int(OPT.get('samples', 8)), outdir=TEX, seed=3.0)
    mat = textured_material('TrapMat', out[('film', 'color')], out[('film', 'orm')])
    uvj = joined.data.uv_layers.active.data
    src = [0] * len(joined.data.polygons)
    joined.data.attributes['srcid'].data.foreach_get('value', src)
    per = {}
    for p in joined.data.polygons:
        per.setdefault(src[p.index], []).append([tuple(uvj[li].uv) for li in p.loop_indices])
    for gi, o in enumerate(groups):
        me = o.data
        uvl = me.uv_layers.active.data
        lst = per.get(gi, [])
        assert len(lst) == len(me.polygons), (o.name, len(lst), len(me.polygons))
        for p, uvs in zip(me.polygons, lst):
            for li, uv in zip(p.loop_indices, uvs):
                uvl[li].uv = uv
        me.polygons.foreach_set('material_index', [0] * len(me.polygons))
        me.materials.clear()
        me.materials.append(mat)
    bpy.data.objects.remove(joined)
    shutil.copyfile(out[('worn', 'color')], os.path.join(ASSETS, 'trap_worn_basecolor.jpg'))
    shutil.copyfile(out[('worn', 'orm')], os.path.join(ASSETS, 'trap_worn_orm.jpg'))


def render(objs, tag, open_doors=False):
    hd = os.path.join(WORK, 'hdri', 'studio_small_08_1k.hdr')
    setup_render((1280, 720), samples=48, hdri=hd, strength=0.6)
    cam = add_camera()
    add_area('Key', (0.5, 0.8, 0.6), (0, 0.06, 0), 45, 0.8)
    add_area('Rim', (-0.7, 0.5, -0.5), (0, 0.06, 0), 35, 0.8)
    floor = bpy.data.meshes.new('floor')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=3.0)
    bm.to_mesh(floor)
    fo = bpy.data.objects.new('Floor', floor)
    bpy.context.scene.collection.objects.link(fo)
    fo.data.materials.append(principled('floor', (0.05, 0.05, 0.05), 0.0, 0.8))
    if open_doors:
        objs['DoorL'].rotation_euler[1] = math.radians(DOOR_OPEN)
        objs['DoorR'].rotation_euler[1] = math.radians(-DOOR_OPEN)
    V = {'side': ((-0.75, 0.22, 0.05), (0.0, 0.07, 0.0), 50), 'hero': ((0.55, 0.42, 0.62), (0.05, 0.07, -0.05), 45),
         'open': ((0.45, 0.48, 0.55), (0.0, 0.09, 0.0), 45), 'pedal': ((0.75, 0.35, -0.25), (0.30, 0.03, -0.32), 45),
         'top': ((0.0, 0.95, 0.02), (0.0, 0.07, 0.0), 45), 'rear': ((-0.4, 0.35, -0.75), (0.0, 0.08, -0.05), 45)}
    for vn in OPT.get('views', 'hero,side,pedal').split(','):
        if vn == 'open':
            objs['DoorL'].rotation_euler[1] = math.radians(DOOR_OPEN)
            objs['DoorR'].rotation_euler[1] = math.radians(-DOOR_OPEN)
        p, t, l = V[vn]
        look_at_g(cam, p, t, l)
        render_to(os.path.join(WORK, f'{tag}_{vn}.jpg'))


def main():
    root, pedal_root, objs, E, M = build()
    print('TRIS', {k: tri_count([o]) for k, o in objs.items()}, 'total', tri_count(list(objs.values())))
    for k, e in E.items():
        print('EMPTY', k, world_pose_g(e))
    if OPT.get('bake'):
        do_bake(objs)
    if OPT.get('export'):
        for o in bpy.context.scene.objects:
            o.select_set(False)
        export_both(os.path.join(ASSETS, 'trap.glb'), [root, pedal_root])
    if OPT.get('render'):
        render(objs, OPT.get('tag', 'trap'))


def export_both(path, roots):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    def sel(o):
        o.select_set(True)
        for c in o.children:
            sel(c)
    for r in roots:
        sel(r)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_attributes=True, export_extras=True, export_cameras=False, export_lights=False,
                              export_image_format='AUTO', export_jpeg_quality=88, export_texcoords=True, export_normals=True,
                              export_tangents=False, export_materials='EXPORT', export_vertex_color='NONE',
                              export_animations=False, export_skins=False, export_morph=False)
    print('exported', path, os.path.getsize(path))


if __name__ == '__main__':
    main()
