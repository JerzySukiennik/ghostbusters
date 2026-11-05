# Ghostbusters pack lane: imports the exported GLBs and renders validation views (Eevee, optional Cycles hero) matched to reference photos.
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OPT = {a.split('=')[0].lstrip('-'): (a.split('=')[1] if '=' in a else True) for a in ARGS}


def imp(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, name))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.name.startswith('HoseSample'):
            o.hide_render = True
    if OPT.get('worn'):
        for o in new:
            if o.type != 'MESH':
                continue
            for ms in o.material_slots:
                m = ms.material
                if not m or not m.use_nodes:
                    continue
                for nd in m.node_tree.nodes:
                    if nd.type == 'TEX_IMAGE' and nd.image and '_film_' in nd.image.name:
                        wn = nd.image.name.split('.')[0].replace('_film_', '_worn_')
                        path = os.path.join(TEX, wn + '.jpg')
                        if os.path.exists(path):
                            cs = nd.image.colorspace_settings.name
                            img = bpy.data.images.load(path, check_existing=True)
                            img.colorspace_settings.name = cs
                            nd.image = img
    return new


def root_of(objs, name):
    for o in objs:
        if o.name == name:
            return o


def place(ob, pos_g, yaw_deg=0.0, pitch_deg=0.0, roll_deg=0.0):
    Mg = Matrix.Translation(V(pos_g)) @ Matrix.Rotation(math.radians(yaw_deg), 4, 'Y') @ Matrix.Rotation(math.radians(pitch_deg), 4, 'X') @ Matrix.Rotation(math.radians(roll_deg), 4, 'Z')
    ob.matrix_world = G2B @ Mg @ B2G


def lights(kind):
    for o in [o for o in bpy.context.scene.objects if o.type == 'LIGHT']:
        bpy.data.objects.remove(o)
    if kind == 'studio':
        add_area('Key', (0.9, 1.4, -1.6), (0, 0.0, -0.1), 140, 1.4)
        add_area('Fill', (-1.4, 0.4, -1.2), (0, 0.0, -0.1), 35, 1.6)
        add_area('Top', (0.0, 2.0, 0.2), (0, 0.0, -0.1), 50, 1.2)
        add_area('Rim', (-0.6, 0.8, 1.2), (0, 0.0, -0.1), 60, 0.8)
    elif kind == 'product':
        add_area('Key', (0.4, 1.2, 1.0), (0, 0.0, 0.0), 70, 1.6)
        add_area('Fill', (-0.9, 0.5, 0.6), (0, 0.0, 0.0), 30, 1.6)
        add_area('Top', (0.0, 1.6, -0.3), (0, 0.0, 0.0), 40, 1.2)
        add_area('Back', (0.0, 0.6, -1.4), (0, 0.0, 0.0), 30, 1.4)


def main():
    engine = 'CYCLES' if OPT.get('engine') == 'cy' else 'BLENDER_EEVEE_NEXT'
    reset()
    hd = os.path.join(WORK, 'hdri', 'studio_small_08_1k.hdr')
    s = setup_render((1280, 720), engine=engine, samples=int(OPT.get('samples', 32 if engine == 'CYCLES' else 64)), hdri=hd, strength=float(OPT.get('env', 0.35)), film_transparent=True)
    if engine == 'CYCLES':
        s.cycles.use_denoising = True
        s.render.threads_mode = 'FIXED'
        s.render.threads = 2
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGBA'
    pack = imp('protonpack.glb')
    wand = imp('wand.glb')
    trap = imp('trap.glb')
    P = root_of(pack, 'ProtonPack')
    Wd = root_of(wand, 'Wand')
    Tr = root_of(trap, 'Trap')
    Pd = root_of(trap, 'Pedal')
    gm = root_of(pack, 'GunMount')
    cam = add_camera()
    shots = OPT.get('shots', 'pack_rear').split(',')
    far = (30, 0, 30)
    for shot in shots:
        place(P, far); place(Wd, (31, 0, 30)); place(Tr, (32, 0, 30)); place(Pd, (33, 0, 30))
        doors = [o for o in trap if o.name in ('DoorL', 'DoorR')]
        for o in doors:
            o.rotation_mode = 'QUATERNION'
            o.rotation_quaternion = (1, 0, 0, 0)
        if shot.startswith('pack'):
            place(P, (0, 0, 0))
            Wd.parent = gm
            Wd.matrix_parent_inverse = Matrix.Identity(4)
            Wd.location = (0, 0, 0)
            Wd.rotation_mode = 'QUATERNION'
            Wd.rotation_quaternion = (1, 0, 0, 0)
            lights('studio')
            views = {'pack_rear': ((0.0, 0.02, -1.62), (0.0, -0.01, -0.12), 44), 'pack_34': ((0.95, 0.48, -2.05), (0.0, 0.0, -0.13), 62),
                     'pack_r34': ((-1.1, 0.42, -1.95), (-0.03, 0.0, -0.13), 62), 'pack_side': ((-2.4, 0.08, -0.14), (0.0, 0.0, -0.14), 62),
                     'pack_top': ((0.0, 2.2, -0.9), (0.0, 0.1, -0.13), 60), 'pack_cyc': ((0.22, -0.08, -1.05), (0.0, -0.215, -0.21), 80),
                     'pack_cell': ((0.55, 0.12, -0.75), (0.17, 0.12, -0.13), 75), 'pack_gunmount': ((-0.85, 0.35, -0.55), (-0.22, 0.12, -0.08), 70),
                     'pack_front': ((0.5, 0.15, 2.2), (0.0, 0.0, -0.05), 55)}
            pos, tgt, lens = views[shot]
        elif shot.startswith('wand'):
            Wd.parent = None
            place(Wd, (0, 0, 0))
            lights('product')
            views = {'wand_left': ((1.35, 0.02, 0.17), (0.0, -0.03, 0.17), 60), 'wand_right': ((-1.35, 0.06, 0.17), (0.0, -0.03, 0.17), 60),
                     'wand_hold': ((-0.26, 0.17, -0.34), (0.0, -0.03, 0.17), 32), 'wand_top': ((0.35, 0.75, 0.1), (0.0, -0.02, 0.18), 50)}
            pos, tgt, lens = views[shot]
        else:
            place(Tr, (0, 0, 0))
            place(Pd, (0.33, 0, -0.30), 25)
            lights('product')
            if 'open' in shot:
                for o in doors:
                    o.rotation_mode = 'XYZ'
                    o.rotation_euler = (0, math.radians(78 if o.name == 'DoorL' else -78), 0)
            views = {'trap_left': ((1.2, 0.18, 0.02), (0.0, 0.08, 0.0), 60), 'trap_right': ((-1.2, 0.18, 0.02), (0.0, 0.08, 0.0), 60),
                     'trap_34': ((0.75, 0.55, 0.8), (0.02, 0.07, -0.02), 55), 'trap_open': ((0.62, 0.62, 0.72), (0.0, 0.08, 0.0), 55),
                     'trap_pedal': ((0.95, 0.55, 0.12), (0.30, 0.04, -0.33), 50), 'trap_front': ((0.15, 0.25, 1.1), (0.0, 0.08, 0.0), 60)}
            pos, tgt, lens = views[shot]
        look_at_g(cam, pos, tgt, lens)
        out = os.path.join(WORK, 'rc_' + shot + ('_worn' if OPT.get('worn') else '') + ('_cy' if engine == 'CYCLES' else '') + '.png')
        render_to(out)


if __name__ == '__main__':
    main()
