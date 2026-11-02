# Ghostbusters pack lane: builds assets/pack/wand.glb (1984 neutrona wand), headless Blender 4.5.
import bpy, bmesh, math, os, sys, json, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from common import WAND_HOOK_LOCAL, WAND_BARREL_Y, WAND_TIP_Z

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OPT = {a.split('=')[0].lstrip('-'): (a.split('=')[1] if '=' in a else True) for a in ARGS}
DEC = json.load(open(os.path.join(TEX, 'wand_decals.json')))
BY = WAND_BARREL_Y * 1000.0
FWD = (0, 0, 1)
LEFT = (1, 0, 0)
RIGHT = (-1, 0, 0)
UPV = (0, 1, 0)


def W(x, y, z):
    return Vector((x * MM, y * MM, z * MM))


def wb(pt, x0, x1, y0, y1, z0, z1, kind, bev=1.5, seg=None, angle=30):
    dims = (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))
    if seg is None:
        seg = 2 if min(dims) >= 14 else 1
    pt.box((dims[0] * MM, dims[1] * MM, dims[2] * MM), T(W((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)), kind, bevel=bev * MM, seg=seg, angle=angle)


def wc(pt, x, y, z, axis, h, r, kind, n=None, bev=0.8, seg=None, up=None):
    if n is None:
        n = max(8, min(32, int(round(2 * math.pi * r / 4.0))))
    if seg is None:
        seg = 2 if r >= 10 else 1
    pt.cyl(r * MM, h * MM, frame(W(x, y, z), axis, up), kind, n=n, bevel=bev * MM, seg=seg, base=True)


def wl(pt, x, y, z, axis, prof, kind, n=20, up=None, cap0=True, cap1=True, sa=45):
    return pt.lathe([(r * MM, h * MM) for r, h in prof], frame(W(x, y, z), axis, up), kind, n=n, cap0=cap0, cap1=cap1, smooth_angle=sa)


def handle(b):
    w, h, r = 30.0, 34.0, 9.0
    base = rrect(w, h, r, 3)
    z0, z1 = -64.0, 150.0
    zs = []
    z = z0
    while z <= z1 + 1e-6:
        zs.append(z)
        z += 2.4 if -58 < z < 74 else 6.0
    rings = []
    for z in zs:
        g = 0.0
        if -52.0 <= z <= 68.0:
            t = (z + 52.0) / 30.0
            g = 11.5 * (0.5 - 0.5 * math.cos(2 * math.pi * t))
        end = 1.0 if z > z0 + 5 else 0.92 + 0.08 * (z - z0) / 5.0
        ring = []
        for (px, py) in base:
            wgt = max(0.0, min(1.0, (-py) / (h / 2))) ** 1.5
            yy = py - g * wgt
            xx = px * (1.0 - 0.18 * wgt * g / 9.0)
            ring.append(W(xx * end, yy * end, z))
        rings.append(ring)
    b.loft(rings, 'paint_black')


def build_wand_body(b, d, L):
    handle(b)
    wc(b, 0, 0, -64, (0, 0, -1), 9, 15.0, 'paint_black', bev=1.2)
    wc(b, 0, 0, -73, (0, 0, -1), 6, 13.0, 'alu', bev=0.8)
    b.tube([W(0, 0, -76), W(0, -2, -94), W(0, -7, -108)], 12.5 * MM, 'hose', n=12, step=0.0032, ribs=(0.0064, 0.0017))
    side = [(68.0, -15.0), (150.0, -15.0), (150.0, -62.0), (120.0, -62.0), (68.0, -30.0)]
    b.prism([(zz * MM, yy * MM) for zz, yy in side], 30 * MM, frame(W(15, 0, 0), (-1, 0, 0), (0, 1, 0)), 'paint_black', bevel=1.6 * MM, seg=2)
    for k, (zz, yy, key) in enumerate(((96.0, -30.0, 'k1'), (124.0, -44.0, 'k2'))):
        wc(b, 15, yy, zz, LEFT, 2.0, 5.2, 'steel', n=6, bev=0.3)
        wc(b, 17, yy, zz, LEFT, 4.0, 3.2, 'paint_black', n=10, bev=0.4)
        d.quad(W(15.1, yy + 9.0, zz), (0, 0, -1), (0, 1, 0), 22 * MM, 6.5 * MM, 'decal', uvrect=DEC[key], normal_off=0.3 * MM)
    wb(b, -22, 22, -69, 19, 90, 199, 'paint_black', bev=2.4)
    wb(b, -22, 22, -69, -3.5, 199, 289, 'paint_black', bev=2.4)
    wb(b, -20, 20, 19, 22, 118, 197, 'paint_black', bev=0.8, seg=1)
    for zz in (140.0, 182.0):
        wl(b, 22, -38, zz, LEFT, [(15.5, 0.0), (15.5, 1.8), (14.0, 3.0), (9.5, 3.0), (8.0, 4.4), (0.0, 4.6)], 'paint_black', n=24, cap0=False, cap1=False)
        wc(b, 26.4, -38, zz, LEFT, 2.0, 5.0, 'steel_dark', n=6, bev=0.3)
    d.quad(W(22.4, 0, 162), (0, 0, -1), (0, 1, 0), 32 * MM, 21 * MM, 'decal', uvrect=DEC['danger'], normal_off=0.3 * MM)
    d.quad(W(22.4, -30, 228), (0, 0, -1), (0, 1, 0), 30 * MM, 14 * MM, 'decal', uvrect=DEC['schematic'], normal_off=0.3 * MM)
    hz0, hz1 = 100.0, 182.0
    wb(b, -25.5, -22, -62, 10, hz0, hz1, 'heatsink', bev=0.8, seg=1)
    nf = 10
    for k in range(nf):
        zz = hz0 + 4 + k * (hz1 - hz0 - 8) / (nf - 1)
        wb(b, -31.5, -25.5, -60, 8, zz - 1.1, zz + 1.1, 'heatsink', bev=0.5, seg=1)
    for (yy, zz) in ((-58, hz0 + 2.5), (6, hz0 + 2.5), (-58, hz1 - 2.5), (6, hz1 - 2.5)):
        wc(b, -25.5, yy, zz, RIGHT, 1.4, 1.8, 'steel', n=6, bev=0.2)
    wc(b, -22, -40, 230, RIGHT, 3.0, 11.0, 'alu', n=20, bev=0.8)
    wc(b, -25, -40, 230, RIGHT, 2.4, 3.6, 'steel', n=6, bev=0.3)
    wl(b, -8, 8.5, 205, FWD, [(12.0, 0.0), (12.0, 50.0), (11.5, 52.0), (9.5, 52.5), (9.5, 57.0), (8.6, 58.0), (0.0, 58.0)], 'paint_black_gloss', n=20, cap0=True, cap1=False)
    star = []
    for k in range(36):
        a = 2 * math.pi * k / 36
        rr = 9.2 if k % 2 == 0 else 8.4
        star.append((rr * math.cos(a) * MM, rr * math.sin(a) * MM))
    b.prism(star, 14 * MM, frame(W(-8, 8.5, 263), FWD), 'alu', bevel=0.0, angle=60)
    wc(b, -8, 8.5, 277, FWD, 2.0, 7.2, 'alu', n=16, bev=0.4)
    cyl_decal_w(d, -8, 8.5, 230, 12.25, 30, 'spec')
    wl(b, -10, 22, 186, UPV, [(5.0, 0.0), (5.0, 8.0), (10.0, 8.0), (10.0, 14.0), (9.2, 15.0), (0.0, 15.0)], 'steel', n=18, cap0=True, cap1=False)
    star2 = []
    for k in range(28):
        a = 2 * math.pi * k / 28
        rr = 10.8 if k % 2 == 0 else 10.0
        star2.append((rr * math.cos(a) * MM, rr * math.sin(a) * MM))
    b.prism(star2, 5 * MM, frame(W(-10, 30, 186), UPV, (0, 0, 1)), 'steel', bevel=0.0, angle=60)
    for zz in (189.0, 194.0):
        wb(b, -4, 6, 21.6, 22.4, zz - 1.2, zz + 1.2, 'cavity', bev=0.0)
    for k, zz in enumerate((150.0, 166.0)):
        wc(b, -4, 22, zz, UPV, 1.6, 4.2, 'steel', n=6, bev=0.2)
        b.cyl(1.2 * MM, 11 * MM, frame(W(-4, 23.6, zz), (0.0, 0.94, 0.34)), 'steel', n=6, bevel=0.0, base=True)
    bg_z0, bg_z1 = 132.0, 184.0
    wb(b, 4, 17, 22, 24.5, bg_z0 - 3, bg_z1 + 3, 'paint_black', bev=0.6, seg=1)
    n = 28
    pitch = (bg_z1 - bg_z0) / n
    for i in range(n):
        zz = bg_z0 + (i + 0.5) * pitch
        L['bar'].box((9.0 * MM, 0.8 * MM, (pitch - 0.4) * MM), T(W(10.5, 24.7, zz)), 'bar', bevel=0.0, segval=i)
    wb(b, -20, 20, -89, -69, 90, 300, 'paint_black', bev=1.6)
    wc(b, 0, -80, 300, FWD, 62, 9.0, 'paint_black', bev=0.8)
    for zz in (98.0, 150.0, 200.0, 250.0, 292.0):
        for xx in (-14.0, 14.0):
            wc(b, xx, -89, zz, (0, -1, 0), 1.2, 2.4, 'steel_dark', n=6, bev=0.2)
    hk = [W(0, -89, 104), W(0, -97, 104), W(0, -104, 110), W(0, -105, 118), W(0, -100, 124), W(0, -93, 124)]
    b.tube(hk, 2.4 * MM, 'steel', n=8, step=0.0028)
    wc(b, 0, -89, 104, (0, -1, 0), 2.0, 5.5, 'steel', n=10, bev=0.4)
    BYm = BY
    wc(b, 0, BYm, 289, FWD, 12, 19.5, 'paint_black', bev=1.0)
    prof = [(16.0, 0.0)]
    z = 0.0
    for k in range(5):
        prof += [(16.2, z + 2.0), (19.4, z + 6.5), (20.4, z + 11.5), (19.4, z + 16.5), (16.2, z + 21.0)]
        z += 23.0
    prof += [(16.0, z + 0.5)]
    wl(b, 0, BYm, 301, FWD, prof, 'paint_black', n=20, cap0=False, cap1=False, sa=55)
    wb(b, -16, 16, BYm - 18, BYm + 18, 407, 429, 'paint_black', bev=2.0)
    for (xx, yy) in ((16, BYm + 9), (16, BYm - 9)):
        wc(b, xx, yy, 418, LEFT, 1.6, 2.4, 'steel_dark', n=6, bev=0.2)
    wc(b, 0, BYm, 429, FWD, 20, 11.5, 'alu', n=20, bev=0.8)
    wl(b, 0, BYm, 449, FWD, [(10.5, 0.0), (10.5, 9.0), (9.6, 10.0), (8.5, 10.0), (8.5, 2.0)], 'plastic_clear', n=20, cap0=False, cap1=False)
    L['tip'].lathe([(7.2 * MM, 0.0), (7.2 * MM, 7.0 * MM), (5.0 * MM, 9.4 * MM), (0.0, 10.0 * MM)], frame(W(0, BYm, 449), FWD), 'tipmat', n=16, cap0=True, cap1=False)
    L['tip']._set_seg(L['tip'].bm.verts[:], 0)
    wb(b, -7, 7, BYm - 30, BYm - 18, 412, 424, 'brass', bev=0.8, seg=1)
    wc(b, 0, BYm - 30, 418, (0, -1, 0), 8, 2.3, 'brass', n=8, bev=0.2)
    b.tube([W(0, BYm - 38, 418), W(4, BYm - 52, 428), W(2, BYm - 62, 446), W(-2, BYm - 48, 462), W(-2, BYm - 20, 464), W(0, BYm - 2, 458), W(0, BYm + 8, 452)], 2.6 * MM, 'plastic_red', n=8, step=0.005)
    wb(b, -6, 6, BYm + 8, BYm + 14, 446, 456, 'brass', bev=0.6, seg=1)
    wc(b, 9, BYm + 18, 418, UPV, 4, 6.5, 'paint_black', n=14, bev=0.6)
    L['lights'].lathe([(5.6 * MM, 0.0), (5.2 * MM, 2.8 * MM), (3.4 * MM, 5.0 * MM), (0.0, 5.8 * MM)], frame(W(9, BYm + 22, 418), UPV), 'lightmat', n=14, cap0=True, cap1=False)
    tag_seg(L['lights'], 3)
    wc(b, -14, 22, 126, UPV, 1.6, 4.0, 'steel', n=12, bev=0.3)
    L['lights'].lathe([(2.6 * MM, 0.0), (2.4 * MM, 1.2 * MM), (1.4 * MM, 2.2 * MM), (0.0, 2.5 * MM)], frame(W(-14, 23.6, 126), UPV), 'lightmat', n=10, cap0=True, cap1=False)
    tag_seg(L['lights'], 0)
    wc(b, -12, 22, 166, UPV, 1.6, 6.5, 'steel', n=14, bev=0.3)
    L['lights'].lathe([(5.0 * MM, 0.0), (4.6 * MM, 2.0 * MM), (3.0 * MM, 3.6 * MM), (0.0, 4.2 * MM)], frame(W(-12, 23.6, 166), UPV), 'lightmat', n=14, cap0=True, cap1=False)
    tag_seg(L['lights'], 1)
    wc(b, 22, -56, 270, LEFT, 3.0, 8.0, 'alu', n=16, bev=0.5)
    L['lights'].lathe([(6.0 * MM, 0.0), (5.6 * MM, 2.2 * MM), (3.6 * MM, 4.0 * MM), (0.0, 4.6 * MM)], frame(W(25, -56, 270), LEFT), 'lightmat', n=14, cap0=True, cap1=False)
    tag_seg(L['lights'], 2)
    b.tube([W(-22, 12, 120), W(-36, 22, 100), W(-38, 22, 60), W(-26, 10, 40), W(-15, 4, 34)], 2.0 * MM, 'wire_green', n=7, step=0.006)
    for (x, y, z, ax) in ((22, 12, 96, LEFT), (22, -62, 96, LEFT), (22, 12, 194, LEFT), (22, -62, 282, LEFT), (-22, -62, 282, RIGHT), (-22, 12, 194, RIGHT), (0, 19, 96, UPV)):
        wc(b, x, y, z, ax, 1.2, 2.2, 'steel_dark', n=6, bev=0.2)


def cyl_decal_w(d, x, y, z, r, length, key, a0=-70, a1=70, n=8):
    u0, v0, u1, v1 = DEC[key]
    bm = d.bm
    idx = d.mi('decal')
    rows = []
    for k in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * k / n)
        dirv = Vector((math.sin(a), math.cos(a), 0.0))
        c = W(x, y, z) + dirv * (r + 0.3) * MM
        rows.append((c - Vector((0, 0, length / 2 * MM)), c + Vector((0, 0, length / 2 * MM)), u0 + (u1 - u0) * k / n))
    for k in range(n):
        a, bb = rows[k], rows[k + 1]
        vs = [bm.verts.new(a[0]), bm.verts.new(a[1]), bm.verts.new(bb[1]), bm.verts.new(bb[0])]
        f = bm.faces.new(vs)
        f.material_index = idx
        f.smooth = True
        for lp, uv in zip(f.loops, ((a[2], v0), (a[2], v1), (bb[2], v1), (bb[2], v0))):
            lp[d.uv].uv = uv


def tag_seg(pt, val):
    pt._set_seg([v for v in pt.bm.verts if not v.tag], val)
    for v in pt.bm.verts:
        v.tag = True


def make_mats():
    M = {}
    def add(k, *a, **kw):
        M[k] = principled('pv_' + k, *a, **kw)
    for k, c, mt, r in (('paint_black', (0.026, 0.026, 0.028), 0.0, 0.4), ('paint_black_gloss', (0.022, 0.022, 0.024), 0.0, 0.28), ('alu', (0.6, 0.6, 0.62), 1.0, 0.3),
                        ('alu_dark', (0.06, 0.06, 0.065), 0.8, 0.4), ('heatsink', (0.16, 0.15, 0.09), 0.7, 0.45), ('steel', (0.58, 0.58, 0.6), 1.0, 0.28), ('steel_dark', (0.12, 0.12, 0.13), 1.0, 0.35),
                        ('hose', (0.02, 0.02, 0.022), 0.0, 0.5), ('brass', (0.8, 0.62, 0.3), 1.0, 0.3), ('wire_green', (0.03, 0.25, 0.12), 0.0, 0.35),
                        ('plastic_red', (0.5, 0.03, 0.02), 0.0, 0.3), ('plastic_clear', (0.5, 0.55, 0.58), 0.0, 0.1), ('cavity', (0.006, 0.006, 0.006), 0.0, 0.9)):
        add(k, c, mt, r)
    M['decal'] = textured_material('WandDecals', os.path.join(TEX, 'wand_decals.jpg'), rough=0.45)
    M['bar'] = principled('BargraphEmit', (0.25, 0.08, 0.02), 0.0, 0.3, emit=(1.0, 0.22, 0.04), emit_strength=4.0)
    M['lightmat'] = principled('WandLightsEmit', (0.6, 0.6, 0.6), 0.0, 0.25, emit=(1.0, 0.9, 0.8), emit_strength=4.0)
    M['tipmat'] = principled('TipEmit', (0.8, 0.85, 0.9), 0.0, 0.2, emit=(1.0, 0.95, 0.9), emit_strength=2.0)
    return M


def build():
    reset()
    M = make_mats()
    root = bpy.data.objects.new('Wand', None)
    bpy.context.scene.collection.objects.link(root)
    b = Part('WandBody')
    d = Part('WandDecals')
    L = {'bar': Part('BargraphEmit', seg=True), 'lights': Part('WandLightsEmit', seg=True), 'tip': Part('TipEmit', seg=True)}
    build_wand_body(b, d, L)
    objs = {'WandBody': make_object(b, M, parent=root), 'WandDecals': make_object(d, M, parent=root, weighted=False)}
    for key, name, segs in (('bar', 'BargraphEmit', 28), ('lights', 'WandLightsEmit', 4), ('tip', 'TipEmit', 1)):
        o = make_object(L[key], M, parent=root, weighted=False, name=name)
        o['segments'] = segs
        objs[name] = o
    for ob in objs.values():
        apply_mods(ob)
    E = {}
    gp = W(0, BY, 0) + Vector((0.5, -0.866, 0.0)) * 0.0185 + Vector((0, 0, 0.360))
    E['GripFront'] = empty('GripFront', gp, basis_g(z=(0, 0, 1), y=(-0.5, 0.866, 0.0)), parent=root)
    E['Tip'] = empty('Tip', (0.0, WAND_BARREL_Y, WAND_TIP_Z), basis_g(z=(0, 0, 1), y=(0, 1, 0)), parent=root)
    hd = Vector((0.0, -0.33, -1.0)).normalized()
    E['HoseAnchor'] = empty('HoseAnchor', W(0, -7.4, -110.5), basis_g(z=hd, y=(0, 1, 0)), parent=root)
    E['MountHook'] = empty('MountHook', WAND_HOOK_LOCAL, None, parent=root)
    return root, objs, E, M


def do_bake(objs):
    import bake, importlib
    importlib.reload(bake)
    body = objs['WandBody']
    bake.unwrap(body, margin=0.002, angle=58.0)
    size = int(OPT.get('tex', 1024))
    out = bake.bake_atlas(body, 'wand', size=size, mask_size=int(OPT.get('masksize', 1024)), variants=('film', 'worn'), samples=int(OPT.get('samples', 8)), outdir=TEX, seed=3.0)
    mat = textured_material('WandMat', out[('film', 'color')], out[('film', 'orm')])
    me = body.data
    me.polygons.foreach_set('material_index', [0] * len(me.polygons))
    me.materials.clear()
    me.materials.append(mat)
    shutil.copyfile(out[('worn', 'color')], os.path.join(ASSETS, 'wand_worn_basecolor.jpg'))
    shutil.copyfile(out[('worn', 'orm')], os.path.join(ASSETS, 'wand_worn_orm.jpg'))


def render(objs, tag):
    hd = os.path.join(WORK, 'hdri', 'studio_small_08_1k.hdr')
    setup_render((1280, 720), samples=48, hdri=hd, strength=0.55)
    cam = add_camera()
    add_area('Key', (0.6, 0.9, 0.4), (0, -0.02, 0.18), 40, 0.8)
    add_area('Rim', (-0.8, 0.4, -0.3), (0, -0.02, 0.18), 35, 0.8)
    V = {'left': ((0.95, 0.05, 0.18), (0.0, -0.02, 0.18), 50), 'right': ((-0.95, 0.12, 0.18), (0.0, -0.02, 0.18), 50),
         'top34': ((0.45, 0.55, -0.35), (0.0, -0.02, 0.17), 50), 'hold': ((0.35, 0.18, -0.55), (0.0, -0.02, 0.2), 45),
         'front34': ((0.5, 0.25, 0.85), (0, -0.02, 0.18), 50), 'tip': ((0.25, 0.08, 0.62), (0, -0.03, 0.40), 60)}
    for vn in OPT.get('views', 'left,right,hold').split(','):
        p, t, l = V[vn]
        look_at_g(cam, p, t, l)
        render_to(os.path.join(WORK, f'{tag}_{vn}.jpg'))


def main():
    root, objs, E, M = build()
    print('TRIS', {k: tri_count([o]) for k, o in objs.items()}, 'total', tri_count(list(objs.values())))
    for k, e in E.items():
        print('EMPTY', k, world_pose_g(e))
    if OPT.get('bake'):
        do_bake(objs)
    if OPT.get('export'):
        export_glb(os.path.join(ASSETS, 'wand.glb'), root)
    if OPT.get('render'):
        render(objs, OPT.get('tag', 'wand'))


if __name__ == '__main__':
    main()
