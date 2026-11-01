# Ghostbusters pack lane: writes assets/pack/pack.json from the exported GLBs (node poses, bounds, triangles, sizes) plus design constants.
import json, os, struct, math, datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
A = os.path.join(ROOT, 'assets', 'pack')


def load(name):
    b = open(os.path.join(A, name), 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + n]), len(b)


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz]


def qrot(q, v):
    x, y, z, w = q
    vx, vy, vz = v
    tx, ty, tz = 2 * (y * vz - z * vy), 2 * (z * vx - x * vz), 2 * (x * vy - y * vx)
    return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)]


def world(J):
    parent = {}
    for i, n in enumerate(J['nodes']):
        for c in n.get('children', []):
            parent[c] = i
    out = {}
    def pose(i):
        n = J['nodes'][i]
        t = n.get('translation', [0, 0, 0])
        r = n.get('rotation', [0, 0, 0, 1])
        if i in parent:
            pt, pr = pose(parent[i])
            return [a + b for a, b in zip(pt, qrot(pr, t))], qmul(pr, r)
        return list(t), list(r)
    for i, n in enumerate(J['nodes']):
        out[n['name']] = pose(i)
    return out, parent


def r5(v):
    return [round(x, 5) for x in v]


def stats(J, size, root, skip=()):
    W, parent = world(J)
    tris = 0
    mats = set()
    mn, mx = [1e9] * 3, [-1e9] * 3
    for i, n in enumerate(J['nodes']):
        if 'mesh' not in n:
            continue
        r = i
        while r in parent:
            r = parent[r]
        if J['nodes'][r]['name'] != root:
            continue
        t, q = W[n['name']]
        for pr in J['meshes'][n['mesh']]['primitives']:
            tris += J['accessors'][pr['indices']]['count'] // 3
            mats.add(J['materials'][pr['material']]['name'])
            if n['name'] in skip:
                continue
            acc = J['accessors'][pr['attributes']['POSITION']]
            for cx in (acc['min'][0], acc['max'][0]):
                for cy in (acc['min'][1], acc['max'][1]):
                    for cz in (acc['min'][2], acc['max'][2]):
                        p = [a + b for a, b in zip(t, qrot(q, [cx, cy, cz]))]
                        mn = [min(a, b) for a, b in zip(mn, p)]
                        mx = [max(a, b) for a, b in zip(mx, p)]
    return {'triangles': tris, 'materials': sorted(mats), 'material_count': len(mats), 'mb': round(size / 1e6, 2), 'bounds': {'min': r5(mn), 'max': r5(mx)}, 'size': r5([b - a for a, b in zip(mn, mx)])}


def loc(J, name):
    for n in J['nodes']:
        if n.get('name') == name:
            return {'position': r5(n.get('translation', [0, 0, 0])), 'quaternion': [round(x, 6) for x in n.get('rotation', [0, 0, 0, 1])]}


def emp(W, name):
    t, q = W[name]
    return {'position': r5(t), 'quaternion': [round(x, 6) for x in q]}


def main():
    P, ps = load('protonpack.glb')
    Wd, ws = load('wand.glb')
    Tr, ts = load('trap.glb')
    WP, _ = world(P)
    WW, _ = world(Wd)
    WT, _ = world(Tr)
    pack = {
        'version': '1.0',
        'generated': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'units': 'metres, glTF space (Y up). Quaternions [x, y, z, w]. Poses are relative to each asset root.',
        'build': 'blender/pack/build_pack.py, build_wand.py, build_trap.py (Blender 4.5 headless); decals: blender/pack/decals.py; this file: blender/pack/write_json.py',
        'emissive_convention': 'Emissive materials (names contain Emit) carry the full ON colour in emissiveFactor x KHR_materials_emissive_strength. The game multiplies per segment (vertex attribute _seg, 0..N-1) by its own level 0..1; N is in the node extras "segments".',
        'texture_sets': {
            'film': 'embedded in each GLB (1984 hero condition: black paint, light edge wear, dust)',
            'worn': {'note': 'Afterlife-style heavy wear for style=modern; swap baseColor and occlusion/metallicRoughness maps of the *Mat material (same UVs)',
                     'protonpack': ['protonpack_worn_basecolor.jpg', 'protonpack_worn_orm.jpg'], 'wand': ['wand_worn_basecolor.jpg', 'wand_worn_orm.jpg'], 'trap': ['trap_worn_basecolor.jpg', 'trap_worn_orm.jpg'],
                     'material': {'protonpack': 'ProtonPackMat', 'wand': 'WandMat', 'trap': 'TrapMat'}, 'orm_channels': 'R occlusion, G roughness, B metallic', 'colorspace': 'basecolor sRGB, orm linear'}},
        'protonpack': {
            'file': 'protonpack.glb', 'root': 'ProtonPack', 'mass_kg': 14.0,
            'origin': 'centre of the ALICE frame contact face (z = 0 plane touching the back), at the frame vertical centre; contact normal +Z toward the wearer; pack extends to -Z; wearer right = -X',
            'frame': {'type': 'ALICE LC-1', 'height': 0.524, 'width': 0.32, 'top_bar_y': 0.27, 'shelf_y': -0.262},
            'motherboard': {'width': 0.37, 'top_y': 0.316, 'rear_face_z': -0.08},
            'cyclotron': {'centre': [0.0, -0.2108, -0.2325], 'lid_radius': 0.1143, 'body_radius': 0.127},
            'empties': {k: emp(WP, k) for k in ('GunMount', 'HoseAnchor', 'Vent', 'StrapTop_L', 'StrapTop_R', 'StrapBottom_L', 'StrapBottom_R', 'Belt_L', 'Belt_R', 'Handle')},
            'empty_notes': {'GunMount': 'Wand root pose when docked: barrel down (wand +Z = pack -Y), wand top outward (wand +Y = pack -X), heatsink side facing back. Wand MountHook lands on the pack gun-mount hook plate.',
                            'HoseAnchor': '+Z = direction the hose leaves (end of the short hose stub at the lower right).',
                            'Vent': 'N-filter face; +Y = steam direction (out of the back).',
                            'Handle': 'Top grab point on the ALICE frame top bar.'},
            'emissive': {
                'CyclotronEmit': {'segments': 4, 'color': [1.0, 0.035, 0.015], 'map': {'0': 'upper-left (wearer left, seen from behind)', '1': 'upper-right', '2': 'lower-right', '3': 'lower-left'}, 'spin': 'film: 0->1->2->3 clockwise seen from behind'},
                'PowerCellEmit': {'segments': 15, 'color': [0.12, 0.42, 1.0], 'map': '0 bottom .. 14 top'},
                'PackLightsEmit': {'segments': 2, 'map': {'0': 'red indicator lamp, top right column', '1': 'amber lamp on the PPD (top left)'}}},
            'hose': {'radius': 0.013, 'outer_radius_ribs': 0.0135, 'rib_pitch': 0.0064, 'sample_node': 'HoseSample', 'sample_length': 0.2,
                     'sample_note': 'HoseSample sits at the pack origin along +Z and is visible in the file: set visible=false on load (extras.hidden). Its material HoseMat has a rib normal map: UV u = arc length / rib_pitch (repeat), v = around.',
                     'ends': ['protonpack HoseAnchor', 'wand HoseAnchor']},
            'stats': stats(P, ps, 'ProtonPack', skip=('HoseSample',)),
            'bounds_note': 'bounds exclude the hidden HoseSample; y range slightly exceeds the contract +-0.36 (cyclotron bottom -0.363, blue Legris loop top +0.372)'},
        'wand': {
            'file': 'wand.glb', 'root': 'Wand', 'mass_kg': 1.4, 'length': 0.57,
            'origin': 'palm centre of the right hand on the rear grip (handle axis); barrel +Z, up +Y, wand left = +X',
            'empties': {k: emp(WW, k) for k in ('GripFront', 'Tip', 'HoseAnchor', 'MountHook')},
            'empty_notes': {'GripFront': 'Left palm on the ribbed barrel grip: +Z along the barrel, +Y from the palm toward the barrel axis.',
                            'Tip': 'Stream emitter, +Z forward.', 'HoseAnchor': '+Z = direction the hose leaves (rear, slightly down).', 'MountHook': 'J-hook that docks on the pack gun mount.'},
            'emissive': {
                'BargraphEmit': {'segments': 28, 'color': [1.0, 0.22, 0.04], 'map': '0 front .. 27 rear (top panel, left of centre)'},
                'WandLightsEmit': {'segments': 4, 'map': {'0': 'slo-blo, red LED on the top panel rear right', '1': 'top, clear white dome on the top panel', '2': 'vent, amber-white lamp front-bottom left of the gun box', '3': 'side, orange hat light on the barrel front block'}},
                'TipEmit': {'segments': 1, 'map': {'0': 'barrel tip flasher (inside the clear tip)'}}},
            'stats': stats(Wd, ws, 'Wand')},
        'trap': {
            'file': 'trap.glb', 'root': 'Trap', 'mass_kg': 4.0, 'pedal_root': 'Pedal', 'pedal_mass_kg': 1.2,
            'origin': 'bottom centre on the ground (wheel contact), front = +Z (bargraph end), handle at the rear, left = +X',
            'doors': {'DoorL': {'hinge': emp(WT, 'DoorL'), 'axis': [0, 0, 1], 'open_deg': -78.0}, 'DoorR': {'hinge': emp(WT, 'DoorR'), 'axis': [0, 0, 1], 'open_deg': 78.0},
                      'note': 'rotate each door node about its local Z by open_deg (signs differ: both swing up and outward)'},
            'pedal': {'node': 'Pedal', 'default_pose': emp(WT, 'Pedal'), 'origin': 'bottom centre on the ground, front = +Z',
                      'PedalPlate': {'hinge_local': loc(Tr, 'PedalPlate'), 'axis': [1, 0, 0], 'press_deg': 9.0, 'rest_angle_deg': 13.0, 'note': 'pose relative to Pedal; rotate the plate node about its local X by +press_deg to stomp'},
                      'PedalAnchor_local': loc(Tr, 'PedalAnchor')},
            'empties': {k: emp(WT, k) for k in ['BeamOrigin', 'CableAnchor'] + [f'Smoke_{i}' for i in range(1, 7)]},
            'cable': {'radius': 0.0075, 'ends': ['trap CableAnchor', 'pedal PedalAnchor'], 'material_hint': 'black corrugated split loom, same look as HoseMat'},
            'emissive': {'TrapEmit': {'segments': 13, 'map': {'0-9': 'bargraph on the front cap top, 0 = wearer-right end (-X) .. 9 = +X end', '10': 'yellow lamp, front cap top', '11': 'red lamp, rear block top', '12': 'interior flash bulbs under the doors'}}},
            'smoke_note': 'Smoke_1..4 door corners, Smoke_5 door seam centre, Smoke_6 rear vent',
            'stats_trap': stats(Tr, ts, 'Trap'), 'stats_pedal': stats(Tr, ts, 'Pedal')},
    }
    json.dump(pack, open(os.path.join(A, 'pack.json'), 'w'), indent=1)
    print(json.dumps({k: (pack[k].get('stats') or pack[k].get('stats_trap')) for k in ('protonpack', 'wand', 'trap')}, indent=0)[:1500])


if __name__ == '__main__':
    main()
