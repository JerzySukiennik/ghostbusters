# Ecto-1 headless build: Blender -b -t 2 -P blender/ecto1/build_ecto1.py -- [--no-export] [--blend out.blend] [--ortho dir] [--render dir views]
import os
import sys
import time
import math
import importlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy
import numpy as np

import ecto_common
import ecto_design
import ecto_body
import ecto_mats
import ecto_parts
import ecto_rack
import ecto_livery
import ecto_interior
import ecto_export
for m in (ecto_common, ecto_design, ecto_body, ecto_mats, ecto_parts, ecto_rack, ecto_livery, ecto_interior, ecto_export):
    importlib.reload(m)
from ecto_common import MB, new_object, Y_OFF, bl
import ecto_design as D

MAT_LIST = []


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {'export': True, 'blend': None, 'ortho': None, 'render': None, 'views': 'front34', 'hero': None, 'samples': 32, 'engine': 'cycles', 'match': None, 'final': None}
    i = 0
    while i < len(a):
        k = a[i]
        if k == '--no-export':
            out['export'] = False; i += 1; continue
        if k in ('--blend', '--ortho', '--views'):
            out[k[2:]] = a[i + 1]; i += 2; continue
        if k == '--render':
            out['render'] = a[i + 1]; i += 2; continue
        if k == '--final':
            out['final'] = a[i + 1]; i += 2; continue
        if k == '--match':
            out['match'] = a[i + 1]; i += 2; continue
        if k == '--hero':
            out['hero'] = a[i + 1]; i += 2; continue
        if k == '--samples':
            out['samples'] = int(a[i + 1]); i += 2; continue
        if k == '--engine':
            out['engine'] = a[i + 1]; i += 2; continue
        i += 1
    return out


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


class Parts:
    def __init__(self):
        self.d = {}
        self.meta = {}

    def add(self, name, mb, mirror=False):
        self.d.setdefault(name, []).append(mb)
        if mirror:
            self.d[name].append(mb.mirrored_x())

    def make(self, name, parent=None, origin=(0, 0, 0)):
        allmb = MB()
        for m in self.d.get(name, []):
            allmb.extend(m)
        if origin != (0, 0, 0):
            allmb = allmb.transformed(None, -np.asarray(origin, float))
        used = sorted(set(int(v) for arr in allmb.M for v in np.unique(arr)))
        remap = {u: k for k, u in enumerate(used)}
        allmb.M = [np.array([remap[int(v)] for v in arr]) for arr in allmb.M]
        me = allmb.build(name, [MAT_LIST[i] for i in used])
        ob = new_object(name, me, parent)
        ob.location = origin
        return ob


def mat_table(M):
    MAT_LIST.clear()
    idx = {}
    for k, m in M.items():
        idx[k] = len(MAT_LIST)
        MAT_LIST.append(m)
    return idx


def collect(mi):
    B = ecto_body
    Pp = ecto_parts
    P = Parts()
    side_body, side_door, edges = B.build_side(mi)
    P.add('Body', side_body, mirror=True)
    P.add('Door_FL', side_door)
    P.add('Door_FR', side_door.mirrored_x())
    clip = lambda p: p[:, 1] < D.zsh(p[:, 0]) - 0.004
    for key in ('door_f_in', 'door_f_out', 'door_r_in', 'door_r_out'):
        wm = MB()
        B.gap_wall(wm, B.SIDE, edges[key], 0.022, mi['gap'], -1.0, closed=True, clip=clip)
        if key == 'door_f_in':
            P.add('Door_FL', wm)
            P.add('Door_FR', wm.mirrored_x())
        else:
            P.add('Body', wm, mirror=True)
    P.add('Body', B.build_deck(mi), mirror=True)
    gb, gd, glb, gld, panes = B.build_greenhouse(mi)
    P.add('Body', gb, mirror=True)
    P.add('Body', glb, mirror=True)
    P.add('Door_FL', gd)
    P.add('Door_FR', gd.mirrored_x())
    P.add('Door_FL', gld)
    P.add('Door_FR', gld.mirrored_x())
    sb, sd = B.build_sill(mi)
    P.add('Body', sb, mirror=True)
    P.add('Door_FL', sd)
    P.add('Door_FR', sd.mirrored_x())
    P.add('Body', B.build_roof(mi), mirror=True)
    tg, tgg, rear_body = B.build_rear(mi)
    P.add('RearDoor', tg)
    P.add('RearDoor', tgg)
    P.add('Body', rear_body, mirror=True)
    P.add('Body', B.build_windshield(mi))
    P.add('Body', B.build_underbody(mi))
    fe = Pp.front_end(mi)
    P.add('Body', fe['body'], mirror=True)
    P.add('Body', fe['chrome'], mirror=True)
    P.add('Body', fe['dark'], mirror=True)
    P.add('HeadlightEmit', fe['head'], mirror=True)
    P.add('GrilleLightEmit', fe['grille'], mirror=True)
    re = Pp.rear_end(mi)
    P.add('Body', re['chrome'], mirror=True)
    P.add('Body', re['dark'], mirror=True)
    P.add('TailLightEmit', re['tail'], mirror=True)
    tb, td = Pp.side_trims(mi)
    P.add('Body', tb, mirror=True)
    P.add('Door_FL', td)
    P.add('Door_FR', td.mirrored_x())
    hb, hd = Pp.door_handles(mi)
    P.add('Body', hb, mirror=True)
    P.add('Door_FL', hd)
    P.add('Door_FR', hd.mirrored_x())
    mL = Pp.mirror_assy(mi)
    P.add('Door_FL', mL)
    P.add('Door_FR', mL.mirrored_x())
    P.add('Body', Pp.antenna(mi, 0.55, -1, bl(-0.55, 2.10, 1.47)[()]))
    P.add('Body', Pp.antenna(mi, 5.75, 1, bl(0.62, 4.85, 1.95)[()]))
    for nm, mirror in (('Wheel_FL', False), ('Wheel_FR', True), ('Wheel_RL', False), ('Wheel_RR', True)):
        P.add(nm, Pp.wheel(mi, mirror=mirror))
    rk = ecto_rack.build_rack(mi)
    P.add('Body', rk['body'])
    P.add('LightBarEmit', rk['emit'])
    cb, ce = ecto_rack.cowl_dome(mi)
    P.add('Body', cb)
    P.add('LightBarEmit', ce)
    P.add('Beacon', rk['beacon'])
    P.add('BeaconEmit', rk['beacon_lens'])
    P.meta['beacon_pivot'] = tuple(rk['beacon_pivot'])
    P.meta['siren'] = tuple(rk['siren'])
    L = ecto_livery
    P.add('Door_FL', L.door_logo(mi))
    P.add('Door_FR', L.door_logo(mi, right=True))
    P.add('RearDoor', L.rear_logo(mi))
    P.add('Body', L.plate(mi, True))
    P.add('Body', L.plate(mi, False))
    P.add('Body', L.pillar_spotlight(mi))
    Ii = ecto_interior
    cab, iemit = Ii.cabin(mi)
    P.add('Body', cab)
    P.add('InteriorEmit', iemit)
    di = Ii.door_inner(mi)
    P.add('Door_FL', di)
    P.add('Door_FR', di.mirrored_x())
    P.add('SteeringWheel', Ii.steering_wheel(mi).transformed(ecto_common.rmat(rz=math.pi)))
    tr, rk2 = Ii.pack_tray(mi)
    P.add('PackTray', tr)
    P.add('PackTray2', rk2)
    return P


WHEELS = {
    'Wheel_FL': (D.TRACK_F / 2, D.S_FA),
    'Wheel_FR': (-D.TRACK_F / 2, D.S_FA),
    'Wheel_RL': (D.TRACK_R / 2, D.S_RA),
    'Wheel_RR': (-D.TRACK_R / 2, D.S_RA),
}
HINGE_FL = (0.968, 1.862, 0.62)
HINGE_REAR = (-0.712, 5.968, 0.90)


def materialize(P):
    root = bpy.data.objects.new('Ecto1', None)
    bpy.context.scene.collection.objects.link(root)
    objs = {}
    for name in P.d:
        origin = (0, 0, 0)
        if name in WHEELS:
            x, s = WHEELS[name]
            origin = tuple(bl(x, s, D.R_TIRE)[()])
            ob = P.make(name, root, (0, 0, 0))
            ob.location = origin
            objs[name] = ob
            continue
        if name in ('BeaconEmit', 'PackTray2'):
            continue
        if name == 'SteeringWheel':
            ob = P.make(name, root, (0, 0, 0))
            ob.location = tuple(bl(*ecto_interior.WHEEL_HUB)[()])
            ob.rotation_euler = (-ecto_interior.WHEEL_TILT, 0.0, math.pi)
            objs[name] = ob
            continue
        if name == 'PackTray':
            T = ecto_interior.TRAY
            piv = tuple(bl(0.0, T['pivot_s'], T['z_top'])[()])
            objs[name] = P.make(name, root, piv)
            ob2 = P.make('PackTray2', None, piv)
            ob2.parent = objs[name]
            ob2.location = (0.0, 0.0, 0.0)
            objs['PackTray2'] = ob2
            continue
        if name == 'Beacon':
            ob = P.make(name, root, (0, 0, 0))
            ob.location = P.meta['beacon_pivot']
            objs[name] = ob
            objs['BeaconEmit'] = P.make('BeaconEmit', ob, (0, 0, 0))
            continue
        if name == 'Door_FL':
            origin = tuple(bl(*HINGE_FL)[()])
        elif name == 'Door_FR':
            origin = tuple(bl(-HINGE_FL[0], HINGE_FL[1], HINGE_FL[2])[()])
        elif name == 'RearDoor':
            origin = tuple(bl(*HINGE_REAR)[()])
        objs[name] = P.make(name, root, origin)
    return root, objs


def main():
    a = args()
    t0 = time.time()
    reset()
    M = ecto_mats.make_all()
    M.update(ecto_mats.add_textured())
    mi = mat_table(M)
    P = collect(mi)
    root, objs = materialize(P)
    tris = 0
    for n, ob in objs.items():
        tris += len(ob.data.polygons)
        print(f'[ecto1] {n}: {len(ob.data.polygons)} tris, {len(ob.data.materials)} mats')
    print(f'[ecto1] total tris {tris}, built in {time.time() - t0:.1f}s')
    objs['LightBarEmit']['segments'] = 9
    bpy.context.view_layer.update()
    E = ecto_export.add_empties(root, objs, P.meta)
    cols = ecto_export.add_colliders(root)
    bpy.context.view_layer.update()
    if a['export']:
        glb = os.path.join(ROOT, 'assets', 'ecto1', 'ecto1.glb')
        ecto_export.export_glb(glb)
        info = ecto_export.write_json(os.path.join(ROOT, 'assets', 'ecto1', 'ecto1.json'), root, objs, E, cols, P.meta, glb)
        print('[ecto1] exported', glb, info['stats'])
    if a['blend']:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a['blend']))
    if a['ortho']:
        import render_ecto1
        importlib.reload(render_ecto1)
        render_ecto1.ortho(a['ortho'])
    if a['render']:
        import render_ecto1
        importlib.reload(render_ecto1)
        render_ecto1.views(a['render'], a['views'].split(','))
    if a['final']:
        import render_ecto1
        importlib.reload(render_ecto1)
        render_ecto1.ortho(os.path.join(a['final'], 'ortho'))
        print('[ecto1] final', render_ecto1.final(a['final']))
    if a['match']:
        import render_ecto1
        importlib.reload(render_ecto1)
        render_ecto1.matched(a['match'], a['views'].split(','), engine=a['engine'], samples=a['samples'])
    if a['hero']:
        import render_ecto1
        importlib.reload(render_ecto1)
        render_ecto1.hero(a['hero'], a['views'].split(','), samples=a['samples'], engine=a['engine'])
    print(f'[ecto1] done {time.time() - t0:.1f}s')


main()
