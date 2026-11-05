# Traffic vehicles headless build: Blender -b -t 2 -P blender/traffic/build_traffic.py -- <kind...|all> [--no-export] [--render dir] [--blend path]
import os
import sys
import json
import math
import time
import importlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy
import bmesh
import numpy as np
import tr_designs
import tr_mesh
import tr_car
import tr_big
for m in (tr_designs, tr_mesh, tr_car, tr_big):
    importlib.reload(m)
import tr_designs as TD
from tr_mesh import Mesh, build_bpy

SLOTS = ['Paint', 'Chrome', 'Trim', 'Glass', 'Under', 'Tire', 'Hub', 'Vinyl', 'Plate', 'Interior',
         'HeadlightEmit', 'TailLightEmit', 'IndicatorEmit', 'ReverseLight', 'SpecialEmit', 'GlassBand']
ROOT_NAMES = {'checker': 'Checker', 'nypd': 'NYPD', 'caprice': 'Caprice', 'ltd': 'LTD', 'cutlass': 'Cutlass', 'aries': 'Aries',
              'bus': 'Bus', 'boxtruck': 'BoxTruck', 'garbage': 'Garbage'}


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {'kinds': [], 'export': True, 'render': None, 'blend': None}
    i = 0
    while i < len(a):
        if a[i] == '--no-export':
            out['export'] = False
        elif a[i] in ('--render', '--blend'):
            out[a[i][2:]] = a[i + 1]
            i += 1
        else:
            out['kinds'].append(a[i])
        i += 1
    if not out['kinds'] or out['kinds'] == ['all']:
        out['kinds'] = list(TD.ALL.keys())
    return out


def lin_rgb(c):
    return tuple(float(v) for v in c)


def make_materials(D, atlas_path):
    img = bpy.data.images.load(atlas_path, check_existing=False)
    img.name = f"{D['kind']}_atlas"
    img.alpha_mode = 'CHANNEL_PACKED'
    paint = D['paint']
    tint = D.get('tint', False)
    spec = {
        'Paint': dict(base=paint if tint else (1, 1, 1), rough=0.3, metal=0.0),
        'Chrome': dict(base=(0.86, 0.87, 0.88), rough=0.14, metal=1.0),
        'Trim': dict(base=(0.035, 0.035, 0.037), rough=0.55),
        'Glass': dict(base=(0.018, 0.022, 0.027), rough=0.03),
        'Under': dict(base=(0.022, 0.022, 0.022), rough=0.9),
        'Tire': dict(base=(1, 1, 1), rough=0.85),
        'Hub': dict(base=(1, 1, 1), rough=0.2, metal=0.9),
        'Vinyl': dict(base=D.get('vinyl_color', (0.05, 0.045, 0.04)), rough=0.72),
        'Plate': dict(base=(1, 1, 1), rough=0.45),
        'Interior': dict(base=(0.04, 0.036, 0.032), rough=0.8),
        'HeadlightEmit': dict(base=(1, 1, 1), rough=0.08, emit=4.0),
        'TailLightEmit': dict(base=(1, 1, 1), rough=0.15, emit=3.0),
        'IndicatorEmit': dict(base=(1, 1, 1), rough=0.15, emit=3.0),
        'ReverseLight': dict(base=(1, 1, 1), rough=0.12),
        'SpecialEmit': dict(base=(1, 1, 1), rough=0.3, emit=2.5),
        'GlassBand': dict(base=(1, 1, 1), rough=0.06),
    }
    mats = {}
    for name in SLOTS:
        p = spec[name]
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes.get('Principled BSDF')
        b.inputs['Base Color'].default_value = (*lin_rgb(p['base']), 1.0)
        b.inputs['Metallic'].default_value = p.get('metal', 0.0)
        b.inputs['Roughness'].default_value = p['rough']
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        tex.interpolation = 'Linear'
        tex.location = (-500, 200)
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.location = (-250, 250)
        nt.links.new(tex.outputs['Color'], mix.inputs[6])
        mix.inputs[7].default_value = (*lin_rgb(p['base']), 1.0)
        nt.links.new(mix.outputs[2], b.inputs['Base Color'])
        if 'emit' in p:
            nt.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
            b.inputs['Emission Strength'].default_value = p['emit']
        mats[name] = m
    return mats


def new_obj(name, mesh_or_none, parent=None, loc=(0, 0, 0)):
    ob = bpy.data.objects.new(name, mesh_or_none)
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    ob.location = loc
    return ob


def hull(name, pts, parent):
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(tuple(p))
    bmesh.ops.convex_hull(bm, input=bm.verts, use_existing_faces=False)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bmesh.ops.triangulate(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = new_obj(name, me, parent)
    ob.hide_render = True
    ob.display_type = 'WIRE'
    assert len(me.vertices) <= 64, (name, len(me.vertices))
    return ob


def g(v):
    return [round(float(v[0]), 4), round(float(v[2]), 4), round(float(-v[1]), 4)]


def build_kind(kind, export=True):
    D = TD.ALL[kind]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    atlas = os.path.join(HERE, 'tex', f'{kind}_atlas.png')
    mats = make_materials(D, atlas)
    rootname = ROOT_NAMES[kind]
    root = new_obj(rootname, None)
    stats = {}
    lod1 = new_obj('LOD1', None, root)
    meta0 = None
    for lod in (0, 1, 2):
        B = tr_car.Car(D, lod) if D['type'] == 'car' else tr_big.Big(D, lod)
        parts, wheels = B.build()
        if lod == 0:
            meta0 = B.meta
            meta0['collider'] = B.collider_points()
        tris = sum(m.ntris() for m in parts.values()) + sum(w[0].ntris() for w in wheels.values())
        stats[f'lod{lod}'] = tris
        if lod < 2:
            suf = '' if lod == 0 else '_LOD1'
            par = root if lod == 0 else lod1
            for name, m in parts.items():
                if not m.F:
                    continue
                me = build_bpy(m, name + suf, SLOTS, mats)
                new_obj(name + suf, me, par)
            for name, (m, c) in wheels.items():
                me = build_bpy(m, name + suf, SLOTS, mats, sharp_deg=50)
                new_obj(name + suf, me, par, tuple(c))
        else:
            allm = Mesh()
            for m in parts.values():
                allm.extend(m)
            for name, (m, c) in wheels.items():
                allm.extend(m, t=c)
            me = build_bpy(allm, 'LOD2', SLOTS, mats)
            new_obj('LOD2', me, root)
    col = hull('Collider_Body', meta0['collider'], root)
    empties = {}
    lights = meta0.get('lights', [])
    heads = [l[1] for l in lights if l[0] == 'head']
    tails = [l[1] for l in lights if l[0] == 'tail']
    sc = meta0['sc']

    def bpos(x, s, z):
        return (x, s - sc, z)
    if heads:
        hl = max(heads, key=lambda p: p[0])
        empties['Headlight_L'] = bpos(hl[0], hl[2], hl[1])
        empties['Headlight_R'] = bpos(-hl[0], hl[2], hl[1])
    if tails:
        tl = max(tails, key=lambda p: p[0])
        empties['Taillight_L'] = bpos(tl[0], tl[2], tl[1])
        empties['Taillight_R'] = bpos(-tl[0], tl[2], tl[1])
    if 'sign' in meta0:
        x, z, s = meta0['sign']
        empties['Sign'] = bpos(x, s, z)
    empties['Exhaust'] = bpos(-0.55 * D.get('track', 1.5), D['L'] - 0.05, 0.3)
    for k, p in empties.items():
        e = new_obj(k, None, root, p)
        e.empty_display_size = 0.1
    bpy.context.view_layer.update()
    out = {}
    if export:
        path = os.path.join(ROOT, 'assets', 'traffic', f'{kind}.glb')
        bpy.ops.export_scene.gltf(
            filepath=path, export_format='GLB', export_yup=True, use_selection=False, export_extras=True,
            export_attributes=True, export_cameras=False, export_lights=False, export_animations=False,
            export_materials='EXPORT', export_image_format='AUTO', export_texcoords=True, export_normals=True,
            export_tangents=False, export_apply=False)
        info = sidecar(D, root, stats, meta0, empties, path)
        out = info
    return root, stats, out


def sidecar(D, root, stats, meta, empties, glb):
    track_f = D.get('track', D.get('track_f'))
    track_r = D.get('track', D.get('track_r'))
    wheels = {}
    for ob in bpy.data.objects:
        if ob.name.startswith('Wheel_') and not ob.name.endswith('_LOD1'):
            wheels[ob.name] = g(ob.location)
    mats = []
    for name in SLOTS:
        m = bpy.data.materials.get(name)
        b = m.node_tree.nodes.get('Principled BSDF')
        emit = name.endswith('Emit')
        mats.append({'name': name, 'base': [round(v, 4) for v in list(b.inputs['Base Color'].default_value)[:3]], 'rough': round(b.inputs['Roughness'].default_value, 3),
                     'metal': round(b.inputs['Metallic'].default_value, 3), 'emit': round(b.inputs['Emission Strength'].default_value, 3) if emit else 0,
                     'tint': name == 'Paint' and bool(D.get('tint'))})
    info = {
        'kind': D['kind'], 'title': D['title'], 'root': root.name, 'class': D['type'],
        'frame': 'glTF metres, +Y up, front +Z, driver side +X, origin on the ground under the middle of the wheelbase',
        'length': round(D['L'], 3), 'width': round(meta.get('width', D.get('W', 2.0)), 3), 'height': round(meta.get('height', D.get('H', 1.5)), 3),
        'wheelbase': D['wb'], 'track_front': track_f, 'track_rear': track_r, 'wheel_radius': D['tire_r'], 'wheel_width': D['tire_w'],
        'mass_kg': D['mass'], 'tint': bool(D.get('tint')), 'paint': [round(v, 4) for v in D['paint']],
        'wheels': wheels, 'wheel_spin_axis_local': [1, 0, 0],
        'empties': {k: g(v) for k, v in empties.items()},
        'triangles': stats, 'materials': mats,
        'lods': {'LOD0': 'root children Body, HeadlightEmit, TailLightEmit, Wheel_*', 'LOD1': 'node LOD1 (suffix _LOD1)', 'LOD2': 'single merged mesh LOD2 (wheels baked)'},
        'collider': 'Collider_Body (convex hull, hidden)',
        'atlas': {'size': TD.ATLAS_SIZE, 'alpha': '255 = tintable paint (multiply by per-instance paint when tint), 0 = fixed colour'},
        'glb_bytes': os.path.getsize(glb),
    }
    with open(glb.replace('.glb', '.json'), 'w') as f:
        json.dump(info, f, indent=1)
    return info


def render(kind, outdir, views=('f34', 'r34', 'side', 'fclose')):
    import tr_render
    importlib.reload(tr_render)
    return tr_render.render(kind, outdir, views)


def main():
    a = args()
    for kind in a['kinds']:
        t0 = time.time()
        root, stats, info = build_kind(kind, a['export'])
        print(f'[traffic] {kind}: tris {stats} glb {info.get("glb_bytes")} in {time.time() - t0:.1f}s')
        if a['blend']:
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(a['blend'], f'{kind}.blend'))
        if a['render']:
            print('[traffic] renders', render(kind, a['render']))


main()
