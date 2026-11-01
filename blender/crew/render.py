# Eevee renders of the crew: head close-ups, lobby portraits (512x640), turntables and the four-person line-up, at most 1280x720.
import bpy, sys, os, math, json
from mathutils import Vector, Euler, Quaternion, Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(HERE + '/../..')
args = sys.argv[sys.argv.index('--') + 1:]
MODE = args[0]; OUTDIR = args[1]; CHARS = args[2].split(',') if len(args) > 2 else ['crew_1']
SAMPLES = int(os.environ.get('SAMPLES', '32'))
HDR = ROOT + '/blender/avatar/src/studio_small_08.hdr'
AVWORK = ROOT + '/blender/avatar/work/jurek_gb_work.blend'
os.makedirs(OUTDIR, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
D = bpy.data
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.eevee.taa_render_samples = SAMPLES
try:
    sc.eevee.use_shadows = True; sc.eevee.use_raytracing = True; sc.eevee.ray_tracing_options.resolution_scale = '2'
except Exception:
    pass
sc.view_settings.view_transform = 'Khronos PBR Neutral'; sc.view_settings.exposure = float(os.environ.get('EXPOSURE', '-0.7'))
sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 92
sc.render.film_transparent = False


def world(strength=0.8, tint=(0.075, 0.08, 0.088)):
    w = D.worlds.new('W'); sc.world = w; w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground'); env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = D.images.load(HDR); bg.inputs['Strength'].default_value = strength
    lp = nt.nodes.new('ShaderNodeLightPath'); mix = nt.nodes.new('ShaderNodeMixShader'); bg2 = nt.nodes.new('ShaderNodeBackground')
    bg2.inputs['Color'].default_value = (*tint, 1); bg2.inputs['Strength'].default_value = 1.0
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs['Fac'])
    nt.links.new(bg.outputs['Background'], mix.inputs[1]); nt.links.new(bg2.outputs['Background'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])


def area(name, loc, target, energy, size, color=(1, 1, 1)):
    l = D.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
    o = D.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
    d = Vector(target) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o


def camera(loc, target, lens=50, name='Cam'):
    c = D.cameras.new(name); c.lens = lens; c.clip_start = 0.05; c.clip_end = 50
    o = D.objects.new(name, c); sc.collection.objects.link(o); o.location = loc
    d = Vector(target) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = o
    return o


def append_char(cid, offset=(0, 0, 0)):
    path = HERE + f'/work/{cid}.blend' if cid != 'jurek' else AVWORK
    with D.libraries.load(path, link=False) as (src, dst):
        dst.objects = [n for n in src.objects]
    objs = [o for o in dst.objects if o is not None]
    rig = None
    for o in objs:
        if o.name.startswith('SuitHigh') or o.name.startswith(('PackCarrier', 'WandCarrier', 'TrapCarrier')):
            continue
        sc.collection.objects.link(o)
        if o.type == 'ARMATURE':
            rig = o
    for o in objs:
        if o.type == 'MESH' and o.name.startswith('Harness'):
            o.hide_render = True
        if o.type == 'MESH' and o.name.startswith('SuitHigh'):
            o.hide_render = True
    if rig.animation_data:
        rig.animation_data.action = None
        for t in list(rig.animation_data.nla_tracks):
            rig.animation_data.nla_tracks.remove(t)
    rig.location = Vector(offset)
    rig.data.pose_position = 'POSE'
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    for o in objs:
        if o.type != 'MESH':
            continue
        for m in o.data.materials:
            if m and m.name.split('.')[0] in ('Skin', 'BodySkin') and m.use_nodes:
                b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if b and b.inputs['Subsurface Weight'].default_value < 0.01:
                    dark = cid == 'crew_3'
                    b.inputs['Subsurface Weight'].default_value = 0.12 if dark else 0.22
                    b.inputs['Subsurface Radius'].default_value = (1.0, 0.38, 0.22)
                    b.inputs['Subsurface Scale'].default_value = 0.006
    return rig, objs


def relax(rig, head_yaw=0.0, arms=1.0):
    pb = rig.pose.bones
    for p in pb:
        p.rotation_mode = 'XYZ'
    for s, sg in (('Left', 1), ('Right', -1)):
        pb[s + 'Arm'].rotation_euler = Euler((math.radians(4), 0, math.radians(-sg * 0) + 0), 'XYZ')
        q = Quaternion(Vector((0, 1, 0)), 0)
        rest = rig.data.bones[s + 'Arm'].matrix_local.to_3x3()
        axis_w = Vector((0, -1, 0))
        axis_l = rest.inverted() @ axis_w
        pb[s + 'Arm'].rotation_mode = 'QUATERNION'
        pb[s + 'Arm'].rotation_quaternion = Quaternion(axis_l, math.radians(-sg * 27 * arms)) @ Quaternion(rest.inverted() @ Vector((1, 0, 0)), math.radians(8 * arms))
        pb[s + 'ForeArm'].rotation_mode = 'QUATERNION'
        restf = rig.data.bones[s + 'ForeArm'].matrix_local.to_3x3()
        pb[s + 'ForeArm'].rotation_quaternion = Quaternion(restf.inverted() @ Vector((1, 0, 0)), math.radians(14 * arms))
        for f in ('Index', 'Middle', 'Ring', 'Little'):
            for k in (1, 2, 3):
                b = pb.get(f'{s}Hand{f}{k}')
                if b:
                    b.rotation_mode = 'XYZ'; b.rotation_euler = Euler((math.radians(12 + 6 * k), 0, 0), 'XYZ')
    for n, amt in (('Neck', 0.4), ('Head', 0.6)):
        b = pb[n]; b.rotation_mode = 'QUATERNION'
        rest = rig.data.bones[n].matrix_local.to_3x3()
        b.rotation_quaternion = Quaternion(rest.inverted() @ Vector((0, 0, 1)), math.radians(head_yaw * amt))


def render(path, w, h):
    sc.render.resolution_x = w; sc.render.resolution_y = h; sc.render.resolution_percentage = 100
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def studio(key=900, fill=260, rim=700, target=(0, 0, 1.4)):
    area('Key', (-1.6, -2.4, 2.6), target, key, 1.6, (1.0, 0.96, 0.92))
    area('Fill', (2.2, -1.8, 1.6), target, fill, 2.0, (0.9, 0.95, 1.0))
    area('Rim', (1.2, 2.4, 2.4), target, rim, 1.2, (0.95, 0.97, 1.0))


def head_top(rig):
    return rig.matrix_world @ rig.data.bones['Head'].head_local


world(0.55)
if MODE == 'head':
    cid = CHARS[0]
    rig, objs = append_char(cid)
    hp = head_top(rig) + Vector((0, 0, 0.10))
    studio(500, 150, 400, hp)
    cams = {'front': (0, -0.9, 0.02), 'q34': (-0.55, -0.72, 0.03), 'side': (-0.9, -0.02, 0.02)}
    for k, off in cams.items():
        camera(hp + Vector(off), hp, 85)
        render(f'{OUTDIR}/{cid}_head_{k}.jpg', 512, 640)
elif MODE == 'portrait':
    for cid in CHARS:
        for o in list(D.objects):
            D.objects.remove(o)
        for l in list(D.lights):
            D.lights.remove(l)
        rig, objs = append_char(cid)
        relax(rig, head_yaw=-6)
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        top = 0.0
        for o in objs:
            if o.type == 'MESH' and o.name.split('.')[0] in ('Head', 'Hair') and not o.hide_render:
                ev = o.evaluated_get(dg); me = ev.to_mesh()
                top = max(top, max((o.matrix_world @ v.co).z for v in me.vertices)); ev.to_mesh_clear()
        hp = rig.matrix_world @ rig.pose.bones['Head'].head
        chest = rig.matrix_world @ rig.pose.bones['Spine2'].head
        top = top + 0.03; bot = chest.z - 0.09
        studio(380, 90, 560, hp)
        cam = camera(Vector((-0.9, -1.9, hp.z)), hp, 70)
        cam.data.sensor_fit = 'VERTICAL'
        mid = Vector((0.0, 0, (top + bot) / 2))
        dirv = Vector((-0.40, -0.915, 0.05)).normalized()
        dist = (top - bot) / 2 / math.tan(cam.data.angle_y / 2)
        cam.location = mid + dirv * dist
        cam.rotation_euler = (mid - cam.location).to_track_quat('-Z', 'Y').to_euler()
        render(f'{OUTDIR}/portrait_{cid}.jpg', 512, 640)
elif MODE == 'turntable':
    cid = CHARS[0]
    rig, objs = append_char(cid)
    studio(900, 260, 700, (0, 0, 1.0))
    angs = [0, 45, 90, 135, 180, 225, 270, 315]
    for a in angs:
        r = math.radians(a)
        camera((math.sin(r) * -4.6, -math.cos(r) * 4.6, 1.0), (0, 0, 0.93), 50)
        render(f'{OUTDIR}/{cid}_tt_{a:03d}.jpg', 320, 640)
elif MODE == 'lineup':
    xs = [-1.5, -0.5, 0.5, 1.5]
    for cid, x in zip(CHARS, xs):
        append_char(cid, (x, 0, 0))
    studio(900, 260, 800, (0, 0, 1.0))
    floor = bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
    f = bpy.context.active_object; m = D.materials.new('Floor'); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.18, 0.18, 0.19, 1); m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.8
    f.data.materials.append(m)
    for name, loc in (('front', (0, -7.2, 1.25)), ('back', (0, 7.2, 1.35))):
        camera(loc, (0, 0, 0.95), 50)
        render(f'{OUTDIR}/lineup_{name}.jpg', 1280, 720)
print('RENDER DONE', MODE)
