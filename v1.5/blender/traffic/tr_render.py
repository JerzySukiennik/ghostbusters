# Preview renders of a built traffic vehicle (Eevee, LOD0 only): front 3/4, rear 3/4, orthographic side, LOD strip.
import math
import os
import bpy
from mathutils import Vector


def _engine(sc):
    ids = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in ids else 'BLENDER_EEVEE'
    try:
        sc.eevee.taa_render_samples = 24
    except Exception:
        pass


def stage():
    sc = bpy.context.scene
    _engine(sc)
    sc.render.resolution_x, sc.render.resolution_y = 960, 540
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 88
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    w = bpy.data.worlds.new('W')
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.42, 0.47, 0.55, 1)
    bg.inputs['Strength'].default_value = 0.9
    sun = bpy.data.lights.new('Sun', 'SUN')
    sun.energy = 3.2
    so = bpy.data.objects.new('Sun', sun)
    so.rotation_euler = (math.radians(50), 0, math.radians(-35))
    sc.collection.objects.link(so)
    me = bpy.data.meshes.new('Ground')
    s = 30
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    gm = bpy.data.materials.new('GroundMat')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.12, 0.12, 0.125, 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6
    me.materials.append(gm)
    go = bpy.data.objects.new('Ground', me)
    sc.collection.objects.link(go)


def camera(eye, target, lens=40, ortho=None):
    sc = bpy.context.scene
    cd = bpy.data.cameras.new('Cam')
    if ortho:
        cd.type = 'ORTHO'
        cd.ortho_scale = ortho
    cd.lens = lens
    co = bpy.data.objects.new('Cam', cd)
    sc.collection.objects.link(co)
    co.location = eye
    d = Vector(target) - Vector(eye)
    co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = co
    return co


def render(kind, outdir, views):
    os.makedirs(outdir, exist_ok=True)
    for ob in bpy.data.objects:
        if ob.name.startswith('Collider') or ob.name == 'LOD2' or ob.name == 'LOD1' or (ob.parent and ob.parent.name == 'LOD1'):
            ob.hide_render = True
    vis = [ob for ob in bpy.data.objects if ob.type == 'MESH' and not ob.hide_render]
    L = 2 * max(abs((ob.matrix_world @ Vector(b)).y) for ob in vis for b in ob.bound_box)
    H = max((ob.matrix_world @ Vector(b)).z for ob in vis for b in ob.bound_box)
    stage()
    out = []
    k = max(1.0, L / 5.2)
    cams = {
        'f34': ((5.0 * k, -6.2 * k, 1.6 * k), (0, -0.3 * k, H * 0.45), 40, None),
        'r34': ((-5.0 * k, 6.2 * k, 1.7 * k), (0, 0.3 * k, H * 0.45), 40, None),
        'side': ((12.0 * k, 0, H * 0.5), (0, 0, H * 0.5), 50, L * 1.12),
        'front': ((0, -12.0 * k, H * 0.5), (0, 0, H * 0.5), 50, max(2.6, H * 1.3) * 1.25),
        'fclose': ((2.2 * k, -L * 0.5 - 2.6 * k, 1.1), (0, -L * 0.5, 0.7), 40, None),
    }
    for v in views:
        eye, tgt, lens, ortho = cams[v]
        camera(eye, tgt, lens, ortho)
        p = os.path.join(outdir, f'{kind}_{v}.jpg')
        bpy.context.scene.render.filepath = p
        bpy.ops.render.render(write_still=True)
        out.append(p)
    return out
