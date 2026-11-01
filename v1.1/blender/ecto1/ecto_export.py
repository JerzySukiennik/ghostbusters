# Ecto-1 export: contract empties, convex colliders, GLB export, JSON sidecar (glTF frame: +Y up, front +Z, driver +X).
import json
import math
import os
import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, Quaternion, Euler
from ecto_common import bl, new_empty, Y_OFF
import ecto_design as D
import ecto_body as B
import ecto_interior as I


def g_pos(v):
    return [round(float(v[0]), 4), round(float(v[2]), 4), round(float(-v[1]), 4)]


def g_quat(q):
    return [round(float(q.x), 5), round(float(q.z), 5), round(float(-q.y), 5), round(float(q.w), 5)]


def g_dir(v):
    return [round(float(v[0]), 4), round(float(v[2]), 4), round(float(-v[1]), 4)]


def world_pose(ob):
    m = ob.matrix_world
    loc, rot, _ = m.decompose()
    return {'position': g_pos(loc), 'quaternion_xyzw': g_quat(rot)}


def add_empties(root, objs, meta):
    E = {}
    rz = lambda deg: (0.0, 0.0, math.radians(deg))
    E['Seat_Driver'] = new_empty('Seat_Driver', tuple(bl(0.395, 2.90, 0.765)[()]), rz(0), root)
    E['Exit_Driver'] = new_empty('Exit_Driver', tuple(bl(1.42, 3.05, 0.0)[()]), rz(90), root)
    E['TrapStow'] = new_empty('TrapStow', tuple(bl(0.50, 5.66, I.FLOOR_R)[()]), rz(180), root)
    E['Siren'] = new_empty('Siren', tuple(meta['siren']), rz(0), root)
    E['Exhaust'] = new_empty('Exhaust', tuple(bl(0.58, 6.18, 0.30)[()]), rz(180), root)
    hx = 0.5 * (D.HL_X[0] + D.HL_X[1])
    E['Headlight_L'] = new_empty('Headlight_L', tuple(bl(hx, 0.035, D.HL_Z)[()]), rz(0), root)
    E['Headlight_R'] = new_empty('Headlight_R', tuple(bl(-hx, 0.035, D.HL_Z)[()]), rz(0), root)
    rack = objs['PackTray2']
    for k in range(4):
        loc, rot = I.pack_slot_local(k)
        E[f'PackSlot_{k + 1}'] = new_empty(f'PackSlot_{k + 1}', loc, rot, rack, size=0.15)
    s_slot = I.TRAY['pivot_s'] + I.TRAY['travel'] + I.PACK['d'] / 2
    for k, xk in enumerate(I.SLOT_X):
        E[f'PackPickup_{k + 1}'] = new_empty(f'PackPickup_{k + 1}', tuple(bl(xk, s_slot + 0.55, 0.0)[()]), rz(0), root, size=0.2)
    return E


def hull_object(name, pts, root):
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts, use_existing_faces=False)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bmesh.ops.triangulate(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = root
    ob['collider'] = True
    ob.display_type = 'WIRE'
    ob.hide_render = True
    return ob


def add_colliders(root):
    cols = []
    pts = []
    for s in (-0.06, 0.03, 0.35, 1.20, 2.40, 3.60, 4.80, 5.70, 6.20, 6.335):
        hwv = float(D.hw(min(max(s, 0.02), 6.24)))
        zsh = float(D.zsh(min(max(s, 0.02), 6.25)))
        zb_ = 0.27 if 0.2 < s < 6.1 else 0.30
        if s < 0.0 or s > 6.3:
            pts += [bl(x, s, z)[()] for x in (-0.80, 0.80) for z in (0.30, 0.60)]
            continue
        pts += [bl(x, s, z)[()] for x in (-hwv, hwv) for z in (zb_, 0.66)]
        pts += [bl(x, s, zsh)[()] for x in (-float(D.xsh(min(s, 6.25))), float(D.xsh(min(s, 6.25))))]
    cols.append(hull_object('Collider_Body', pts, root))
    pts = []
    for s in (1.72, 2.05, 2.70, 3.60, 4.60, 5.40, 5.80, 5.97):
        xg, zg = float(D.x_gb(min(max(s, 2.06), 5.93))), float(D.z_gb(min(max(s, 2.06), 5.93)))
        xr = float(D.x_dr(min(max(s, 2.0), 5.86)))
        zr = float(D.z_dr(min(max(s, 2.0), 5.86)))
        zc = float(D.z_rc(min(max(s, 2.0), 5.79)))
        if s < 2.0:
            pts += [bl(x, s, 0.94)[()] for x in (-0.80, 0.80)]
            continue
        pts += [bl(x, s, zg)[()] for x in (-xg, xg)]
        pts += [bl(x, s, zr)[()] for x in (-xr, xr)]
        pts += [bl(x, min(s, 5.80), zc)[()] for x in (-xr * 0.75, xr * 0.75)]
    cols.append(hull_object('Collider_Cabin', pts, root))
    pts = [bl(x, s, z)[()] for x in (-0.66, 0.66) for s in (2.10, 5.10) for z in (1.58, 1.98)]
    cols.append(hull_object('Collider_Rack', pts, root))
    for c in cols:
        assert len(c.data.vertices) <= 64, (c.name, len(c.data.vertices))
    return cols


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_yup=True, use_selection=False, export_extras=True,
        export_attributes=True, export_cameras=False, export_lights=False, export_animations=False,
        export_materials='EXPORT', export_image_format='AUTO', export_jpeg_quality=90, export_texcoords=True,
        export_normals=True, export_tangents=False, export_apply=False)


def stats(objs):
    tris = 0
    mats = set()
    for ob in bpy.data.objects:
        if ob.type == 'MESH' and not ob.name.startswith('Collider'):
            tris += len(ob.data.polygons)
            for m in ob.data.materials:
                if m:
                    mats.add(m.name)
    return tris, sorted(mats)


def _max_z():
    m = 0.0
    for ob in bpy.data.objects:
        if ob.type == 'MESH' and not ob.name.startswith('Collider'):
            for c in ob.bound_box:
                m = max(m, (ob.matrix_world @ Vector(c)).z)
    return m


def write_json(path, root, objs, E, cols, meta, glb_path):
    tri, mats = stats(objs)
    hinge_fl = objs['Door_FL'].matrix_world.translation
    hinge_fr = objs['Door_FR'].matrix_world.translation
    hinge_rd = objs['RearDoor'].matrix_world.translation
    tray = objs['PackTray']
    rack = objs['PackTray2']
    sw = objs['SteeringWheel']
    out = {
        'asset': 'assets/ecto1/ecto1.glb',
        'version': 1,
        'frame': 'glTF metres, +Y up, front = +Z, driver side (US left) = +X, origin on the ground (tyre contact) under the middle of the wheelbase',
        'source': 'blender/ecto1/build_ecto1.py (Blender 4.5, regenerable), textures blender/ecto1/make_textures.py',
        'dimensions': {'length': D.L, 'width_body': 2.04, 'height_roof': round(float(D.z_rc(4.5)), 3), 'height_overall_rack': round(_max_z(), 3),
                       'front_overhang': D.FOH, 'rear_overhang': round(D.L - D.S_RA, 3)},
        'wheelbase': D.WB, 'track_front': D.TRACK_F, 'track_rear': D.TRACK_R,
        'wheel_radius': D.R_TIRE, 'wheel_width': D.W_TIRE, 'mass_kg': 2650,
        'ride_height': 0.285, 'ground_clearance_min': 0.20, 'center_of_mass': g_pos(bl(0.0, 2.95, 0.66)[()]),
        'wheels': {n: {'position': g_pos(objs[n].matrix_world.translation), 'spin_axis_local': [1, 0, 0],
                       'forward_roll_sign': 'positive rotation about local +X rolls the car forward (+Z)'} for n in ('Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR')},
        'steering': {'front_wheels_steer': ['Wheel_FL', 'Wheel_FR'], 'max_wheel_angle_deg': 36.0, 'turning_circle_m': 15.2},
        'Door_FL': {'hinge': g_pos(hinge_fl), 'axis_local': [0, 1, 0], 'open_deg': -68.0, 'note': 'negative = rear edge swings out to +X'},
        'Door_FR': {'hinge': g_pos(hinge_fr), 'axis_local': [0, 1, 0], 'open_deg': 68.0, 'note': 'positive = rear edge swings out to -X'},
        'RearDoor': {'hinge': g_pos(hinge_rd), 'axis_local': [0, 1, 0], 'open_deg': 100.0,
                     'note': 'single side-hinged door, hinge on the passenger (-X) side as on the 1959 Miller-Meteor; positive = free edge swings rearward (-Z)'},
        'PackTray': {'origin': g_pos(tray.matrix_world.translation), 'axis_local': [0, 0, -1], 'travel_m': I.TRAY['travel'],
                     'note': 'telescoping beam, slides straight out of the rear door opening (local -Z = car rear)'},
        'PackTray2': {'parent': 'PackTray', 'origin_rest': g_pos(rack.matrix_world.translation), 'axis_local': [0, 1, 0], 'angle_deg': I.RACK['swing_deg'],
                      'note': 'swing rack on a turntable at the end of the beam; packs ride stored facing +X, after +90 deg about +Y they stand in one row behind the car, contact faces toward -Z'},
        'pack_sequence_s': {'rear_door_open': [0.0, 0.9], 'tray_slide': [0.8, 2.4], 'rack_swing': [2.4, 3.3], 'ready': 3.3,
                            'stow': 'reverse order; rack_swing back to 0 first, then slide, then door'},
        'SteeringWheel': {'hub': g_pos(sw.matrix_world.translation), 'axis_local': [0, 0, 1], 'axis_note': 'local +Z points along the column toward the driver; local +Y = 12 o\'clock',
                          'positive': 'counter-clockwise as seen by the driver = steer left', 'ratio': 19.5, 'lock_to_lock_turns': 3.9},
        'Beacon': {'position': g_pos(objs['Beacon'].matrix_world.translation), 'axis_local': [0, 1, 0], 'rpm': 90,
                   'note': 'red Mars-style rotating light at the front of the rack, lens = child BeaconEmit'},
        'emissive': {
            'HeadlightEmit': {'note': '4 sealed beams + 4 front bumper parking lamps'},
            'TailLightEmit': {'note': 'twin bullet tail lights, 2 per fin'},
            'BeaconEmit': {'note': 'red rotating lens, child of Beacon'},
            'LightBarEmit': {'segments': 9, 'attribute': '_seg', 'map': {
                '0': 'front bar, driver half (+X)', '1': 'front bar, passenger half (-X)', '2': 'rear bar, driver half', '3': 'rear bar, passenger half',
                '4': 'front dome lamp driver', '5': 'front dome lamp passenger', '6': 'rear dome lamp driver', '7': 'rear dome lamp passenger',
                '8': 'cowl dome lamp (driver A-pillar base)'}, 'colour': 'blue'},
            'GrilleLightEmit': {'note': 'two amber grille flashers'},
            'InteriorEmit': {'note': 'dash gauges, dome light, equipment LEDs'},
            'emissive_factor_note': 'each *Emit material carries its light colour as emissiveFactor (strength 1); the game drives material.emissiveIntensity (0 = off, >1 blooms); InteriorGaugesEmit uses the gauge texture as emissive map'},
        'empties': {},
        'colliders': {c.name: {'vertices': len(c.data.vertices), 'convex': True} for c in cols},
        'stats': {'triangles': tri, 'materials': len(mats), 'material_names': mats},
    }
    for n, e in E.items():
        d = world_pose(e)
        d['parent'] = e.parent.name if e.parent else 'Ecto1'
        out['empties'][n] = d
    tray.location.y += I.TRAY['travel']
    rack.rotation_euler.z = math.radians(I.RACK['swing_deg'])
    bpy.context.view_layer.update()
    for k in range(4):
        e = E[f'PackSlot_{k + 1}']
        d = world_pose(e)
        out['empties'][e.name]['world_when_deployed'] = d
    tray.location.y -= I.TRAY['travel']
    rack.rotation_euler.z = 0.0
    bpy.context.view_layer.update()
    notes = {
        'Seat_Driver': 'avatar hips pose when seated, facing +Z',
        'Exit_Driver': 'avatar root pose after getting out (beside the B-pillar, facing out +X)',
        'TrapStow': 'full trap on the cargo floor behind the rear door, trap front toward the door',
        'Siren': 'siren speaker on the rack, sound source',
        'Exhaust': 'tail pipe under the rear bumper, local +Z = gas direction (rearward)',
        'Headlight_L': 'spot origin, local +Z forward (driver side)', 'Headlight_R': 'spot origin, local +Z forward',
    }
    for k in range(4):
        notes[f'PackSlot_{k + 1}'] = 'pack root pose on the rack; child of PackTray2; world_when_deployed = after tray travel + rack swing (pack +Z = car -Z)'
        notes[f'PackPickup_{k + 1}'] = f'avatar root pose facing the car that puts PackSlot_{k + 1} (deployed) at (0, 1.06, 0.55) rotated 180 deg about Y'
    for n, t in notes.items():
        out['empties'][n]['note'] = t
    if os.path.exists(glb_path):
        out['stats']['glb_mb'] = round(os.path.getsize(glb_path) / 1e6, 2)
    with open(path, 'w') as f:
        json.dump(out, f, indent=1)
    return out
