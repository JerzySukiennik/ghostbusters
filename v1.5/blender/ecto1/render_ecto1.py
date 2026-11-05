# Ecto-1 validation renders (Eevee, procedural sky, at most 1280x720) and ortho silhouettes (Workbench).
import os
import math
import bpy
import numpy as np
from mathutils import Vector

Y_OFF = 2.801


def _scene_common(w=1280, h=720):
    sc = bpy.context.scene
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 90
    return sc


def ortho(outdir):
    os.makedirs(outdir, exist_ok=True)
    sc = _scene_common()
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'MATERIAL'
    sc.display.shading.show_cavity = True
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    cam = _camera('OrthoCam')
    cam.data.type = 'ORTHO'
    yc = 3.16 - Y_OFF
    views = {
        'side': ((12.0, yc, 0.85), (math.radians(90), 0, math.radians(90)), 1280 * 0.0052),
        'top': ((0, yc, 12.0), (0, 0, math.radians(90)), 1280 * 0.0052),
        'front': ((0, -12.0, 0.85), (math.radians(90), 0, 0), 1280 * 0.0030),
        'rear': ((0, 12.0, 0.85), (math.radians(90), 0, math.radians(180)), 1280 * 0.0030),
    }
    for name, (loc, rot, scale) in views.items():
        cam.location = loc
        cam.rotation_euler = rot
        cam.data.ortho_scale = scale
        sc.render.filepath = os.path.join(outdir, f'ortho_{name}.png')
        bpy.ops.render.render(write_still=True)
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.render.film_transparent = False


def _camera(name):
    cam = bpy.data.objects.get(name)
    if cam is None:
        cd = bpy.data.cameras.new(name)
        cam = bpy.data.objects.new(name, cd)
        bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def look_at(cam, eye, target, lens=50.0, sensor=36.0):
    cam.location = Vector(eye)
    d = Vector(target) - Vector(eye)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'PERSP'
    cam.data.lens = lens
    cam.data.sensor_width = sensor
    cam.data.clip_start = 0.05
    cam.data.clip_end = 400


def setup_stage(sun_az=-35.0, sun_el=38.0, ground=True, sky_strength=0.35, sun_strength=3.2, samples=48, bg='sky'):
    sc = _scene_common()
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
    ee = sc.eevee
    ee.taa_render_samples = samples
    if hasattr(ee, 'use_raytracing'):
        ee.use_raytracing = True
    if hasattr(ee, 'ray_tracing_options'):
        ee.ray_tracing_options.resolution_scale = '2'
    if hasattr(ee, 'use_shadows'):
        ee.use_shadows = True
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Punchy'
    sc.render.film_transparent = False
    world = bpy.data.worlds.get('EctoWorld') or bpy.data.worlds.new('EctoWorld')
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bgn = nt.nodes.new('ShaderNodeBackground')
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'NISHITA'
    sky.sun_elevation = math.radians(sun_el)
    sky.sun_rotation = math.radians(sun_az)
    sky.altitude = 50
    sky.air_density = 1.0
    sky.dust_density = 1.5
    if hasattr(sky, 'sun_disc'):
        sky.sun_disc = False
    nt.links.new(sky.outputs['Color'], bgn.inputs['Color'])
    bgn.inputs['Strength'].default_value = sky_strength
    nt.links.new(bgn.outputs['Background'], out.inputs['Surface'])
    sun = bpy.data.objects.get('EctoSun')
    if sun is None:
        ld = bpy.data.lights.new('EctoSun', 'SUN')
        sun = bpy.data.objects.new('EctoSun', ld)
        sc.collection.objects.link(sun)
    sun.data.energy = sun_strength
    sun.data.angle = math.radians(1.2)
    az = math.radians(sun_az)
    el = math.radians(sun_el)
    d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    sun.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    if bpy.data.objects.get('EctoProbe') is None:
        try:
            pd = bpy.data.lightprobes.new('EctoProbe', 'SPHERE')
            pr = bpy.data.objects.new('EctoProbe', pd)
            sc.collection.objects.link(pr)
            pr.location = (0.0, 0.36, 4.2)
            pd.influence_distance = 40.0
            if hasattr(pd, 'clip_start'):
                pd.clip_start = 2.2
        except Exception as e:
            print('[render] probe skipped', e)
    if ground and bpy.data.objects.get('EctoGround') is None:
        me = bpy.data.meshes.new('EctoGround')
        R = 60.0
        me.from_pydata([(-R, -R, 0), (R, -R, 0), (R, R, 0), (-R, R, 0)], [], [(0, 1, 2, 3)])
        g = bpy.data.objects.new('EctoGround', me)
        sc.collection.objects.link(g)
        m = bpy.data.materials.new('Ground_Concrete')
        m.use_nodes = True
        p = m.node_tree.nodes['Principled BSDF']
        noise = m.node_tree.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 3.0
        noise.inputs['Detail'].default_value = 8.0
        ramp = m.node_tree.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (0.16, 0.16, 0.155, 1)
        ramp.color_ramp.elements[1].color = (0.26, 0.255, 0.25, 1)
        m.node_tree.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
        m.node_tree.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
        p.inputs['Roughness'].default_value = 0.85
        me.materials.append(m)
    return sc


def _mat(name, base, rough, metal=0.0, kind=None, scale=1.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*base, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if kind == 'concrete':
        tc = nt.nodes.new('ShaderNodeTexCoord')
        n1 = nt.nodes.new('ShaderNodeTexNoise')
        n1.inputs['Scale'].default_value = 0.35 * scale
        n1.inputs['Detail'].default_value = 6.0
        n2 = nt.nodes.new('ShaderNodeTexNoise')
        n2.inputs['Scale'].default_value = 40.0 * scale
        bricks = nt.nodes.new('ShaderNodeTexBrick')
        bricks.inputs['Scale'].default_value = 0.25 * scale
        bricks.inputs['Mortar Size'].default_value = 0.008
        bricks.inputs['Color1'].default_value = (1, 1, 1, 1)
        bricks.inputs['Color2'].default_value = (0.92, 0.92, 0.92, 1)
        bricks.inputs['Mortar'].default_value = (0.80, 0.80, 0.80, 1)
        bricks.offset = 0.0
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (base[0] * 0.80, base[1] * 0.80, base[2] * 0.80, 1)
        ramp.color_ramp.elements[1].color = (base[0] * 1.10, base[1] * 1.10, base[2] * 1.08, 1)
        nt.links.new(tc.outputs['Object'], n1.inputs['Vector'])
        nt.links.new(tc.outputs['Object'], bricks.inputs['Vector'])
        nt.links.new(n1.outputs['Fac'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], mix.inputs['A'])
        nt.links.new(bricks.outputs['Color'], mix.inputs['B'])
        nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
        rr = nt.nodes.new('ShaderNodeMapRange')
        rr.inputs['To Min'].default_value = rough - 0.08
        rr.inputs['To Max'].default_value = rough + 0.08
        nt.links.new(n2.outputs['Fac'], rr.inputs['Value'])
        nt.links.new(rr.outputs['Result'], p.inputs['Roughness'])
    if kind == 'facade':
        tc = nt.nodes.new('ShaderNodeTexCoord')
        br = nt.nodes.new('ShaderNodeTexBrick')
        br.inputs['Scale'].default_value = 0.30
        br.inputs['Mortar Size'].default_value = 0.10
        br.inputs['Brick Width'].default_value = 1.0
        br.inputs['Row Height'].default_value = 0.55
        br.offset = 0.0
        br.inputs['Color1'].default_value = (0.02, 0.03, 0.04, 1)
        br.inputs['Color2'].default_value = (0.03, 0.04, 0.05, 1)
        br.inputs['Mortar'].default_value = (*base, 1)
        nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
        nt.links.new(br.outputs['Color'], p.inputs['Base Color'])
        rr = nt.nodes.new('ShaderNodeMapRange')
        rr.inputs['From Min'].default_value = 0.0
        rr.inputs['From Max'].default_value = 1.0
        rr.inputs['To Min'].default_value = 0.04
        rr.inputs['To Max'].default_value = 0.7
        nt.links.new(br.outputs['Fac'], rr.inputs['Value'])
        nt.links.new(rr.outputs['Result'], p.inputs['Roughness'])
        mt = nt.nodes.new('ShaderNodeMapRange')
        mt.inputs['To Min'].default_value = 0.85
        mt.inputs['To Max'].default_value = 0.0
        nt.links.new(br.outputs['Fac'], mt.inputs['Value'])
        nt.links.new(mt.outputs['Result'], p.inputs['Metallic'])
    return m


def add_environment(kind='plaza'):
    if bpy.data.objects.get('Env_Ground'):
        return
    sc = bpy.context.scene
    g = bpy.data.objects.get('EctoGround')
    if g:
        bpy.data.objects.remove(g)
    me = bpy.data.meshes.new('Env_Ground')
    R = 90.0
    me.from_pydata([(-R, -R, 0), (R, -R, 0), (R, R, 0), (-R, R, 0)], [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new('Env_Ground', me)
    sc.collection.objects.link(ob)
    me.materials.append(_mat('Env_Concrete', (0.27, 0.265, 0.255), 0.78, kind='concrete'))
    if kind != 'plaza':
        return
    fac = _mat('Env_Facade', (0.36, 0.36, 0.35), 0.5, kind='facade')
    blocks = [((-40, 6, 10), (14, 60, 20)), ((38, -6, 9), (12, 50, 18)), ((0, -52, 12), (70, 12, 24)), ((6, 55, 8), (60, 12, 16)), ((-30, -40, 7), (16, 16, 14))]
    for i, (c, sz) in enumerate(blocks):
        bm = bpy.data.meshes.new(f'Env_Block{i}')
        x, y, z = c
        a, b, h = sz[0] / 2, sz[1] / 2, sz[2]
        v = [(x - a, y - b, 0), (x + a, y - b, 0), (x + a, y + b, 0), (x - a, y + b, 0), (x - a, y - b, h), (x + a, y - b, h), (x + a, y + b, h), (x - a, y + b, h)]
        f = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)]
        bm.from_pydata(v, [], f)
        o = bpy.data.objects.new(f'Env_Block{i}', bm)
        sc.collection.objects.link(o)
        bm.materials.append(fac)


def cycles(samples=32):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    cy = sc.cycles
    cy.samples = samples
    cy.use_denoising = True
    try:
        cy.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    cy.max_bounces = 6
    cy.glossy_bounces = 4
    cy.transmission_bounces = 4
    cy.transparent_max_bounces = 8
    prefs = bpy.context.preferences.addons['cycles'].preferences
    dev = 'CPU'
    try:
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type != 'CPU'
        if any(d.use for d in prefs.devices):
            dev = 'GPU'
    except Exception:
        dev = 'CPU'
    cy.device = dev
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = 2
    return dev


def car_cam(az_deg, el_deg, dist, target=(0.0, 0.36, 0.85), lens=40.0):
    az = math.radians(az_deg)
    el = math.radians(el_deg)
    t = Vector(target)
    eye = t + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * dist
    cam = _camera('EctoCam')
    look_at(cam, eye, t, lens)
    return cam


PRESETS = {
    'front34': dict(az=38, el=9, dist=9.0, lens=40, target=(0.0, 0.25, 0.90)),
    'rear34': dict(az=212, el=10, dist=9.0, lens=40, target=(0.0, 0.40, 0.90)),
    'side': dict(az=90, el=4, dist=11.5, lens=45, target=(0.0, 0.36, 0.85)),
    'front': dict(az=0, el=5, dist=9.0, lens=50, target=(0.0, -2.5, 0.85)),
    'rear': dict(az=180, el=6, dist=9.0, lens=50, target=(0.0, 3.0, 0.85)),
    'roof': dict(az=28, el=34, dist=5.6, lens=45, target=(0.0, 0.40, 1.75)),
    'front34low': dict(az=24, el=2, dist=7.0, lens=35, target=(0.0, -0.4, 0.75)),
}


def set_emission(level=0.0, overrides=None):
    for m in bpy.data.materials:
        if 'Emit' not in m.name or not m.use_nodes:
            continue
        p = m.node_tree.nodes.get('Principled BSDF')
        if p is None:
            continue
        v = level if overrides is None else overrides.get(m.name, level)
        p.inputs['Emission Strength'].default_value = v


def views(outdir, names, samples=48):
    os.makedirs(outdir, exist_ok=True)
    sc = setup_stage(samples=samples)
    set_emission(0.0)
    for n in names:
        p = PRESETS[n]
        car_cam(p['az'], p['el'], p['dist'], p['target'], p['lens'])
        sc.render.filepath = os.path.join(outdir, f'{n}.jpg')
        bpy.ops.render.render(write_still=True)
        print('[render]', sc.render.filepath)


def hero(outdir, names, samples=32, engine='cycles', sun_az=-35.0, sun_el=42.0):
    os.makedirs(outdir, exist_ok=True)
    sc = setup_stage(sun_az=sun_az, sun_el=sun_el, ground=False, sky_strength=0.32, sun_strength=3.6)
    add_environment('plaza')
    set_emission(0.0)
    dev = cycles(samples) if engine == 'cycles' else 'EEVEE'
    print('[render] device', dev)
    import time
    for n in names:
        p = PRESETS[n]
        car_cam(p['az'], p['el'], p['dist'], p['target'], p['lens'])
        sc.render.filepath = os.path.join(outdir, f'{n}.jpg')
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print('[render]', sc.render.filepath, f'{time.time() - t0:.1f}s')


def matched(outdir, keys, engine='eevee', samples=32, sun=None):
    import json
    os.makedirs(outdir, exist_ok=True)
    fits = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tools', 'camfits_solved.json')))
    for k in keys:
        f = fits[k]
        W, H = f['size']
        sc_ = min(1280 / W, 720 / H)
        sa = f.get('sun', sun or [-35.0, 42.0])
        sc = setup_stage(sun_az=sa[0], sun_el=sa[1], ground=False, sky_strength=0.32, sun_strength=3.6, samples=samples)
        add_environment(f.get('env', 'plaza'))
        set_emission(0.0)
        if engine == 'cycles':
            cycles(samples)
        sc.render.resolution_x = int(round(W * sc_))
        sc.render.resolution_y = int(round(H * sc_))
        cam = _camera('MatchCam')
        cam.data.type = 'PERSP'
        cam.data.sensor_fit = 'HORIZONTAL'
        cam.data.sensor_width = f['sensor_mm']
        cam.data.lens = f['lens_mm']
        cam.data.clip_start = 0.05
        cam.data.clip_end = 400
        cam.location = Vector(f['location'])
        cam.rotation_mode = 'XYZ'
        cam.rotation_euler = f['rotation_euler']
        sc.render.filepath = os.path.join(outdir, f'match_{k}.jpg')
        bpy.ops.render.render(write_still=True)
        print('[render]', sc.render.filepath)


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def deploy(doors=0.0, rear=0.0, tray=0.0, swing=0.0):
    import json
    J = json.load(open(os.path.join(ROOT, 'assets', 'ecto1', 'ecto1.json')))
    ob = bpy.data.objects
    ob['Door_FL'].rotation_euler.z = math.radians(J['Door_FL']['open_deg']) * doors
    ob['Door_FR'].rotation_euler.z = math.radians(J['Door_FR']['open_deg']) * doors
    ob['RearDoor'].rotation_euler.z = math.radians(J['RearDoor']['open_deg']) * rear
    base = ob['PackTray'].get('rest_y')
    if base is None:
        ob['PackTray']['rest_y'] = ob['PackTray'].location.y
        base = ob['PackTray'].location.y
    ob['PackTray'].location.y = base + J['PackTray']['travel_m'] * tray
    ob['PackTray2'].rotation_euler.z = math.radians(J['PackTray2']['angle_deg']) * swing
    bpy.context.view_layer.update()


def add_packs():
    path = os.path.join(ROOT, 'assets', 'pack', 'protonpack.glb')
    slots = [bpy.data.objects.get(f'PackSlot_{k}') for k in range(1, 5)]
    if os.path.exists(path):
        for sl in slots:
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=path)
            new = [o for o in bpy.data.objects if o not in before]
            root = [o for o in new if o.parent is None][0]
            for o in new:
                if o.type == 'EMPTY' or o.name.startswith('HoseSample') or o.name.startswith('Collider'):
                    o.hide_render = True
            root.parent = sl
            root.matrix_parent_inverse.identity()
            root.location = (0, 0, 0)
            root.rotation_mode = 'XYZ'
            root.rotation_euler = (0, 0, 0)
        bpy.context.view_layer.update()
        return 'protonpack.glb'
    import bmesh
    for sl in slots:
        me = bpy.data.meshes.new('PackProxy')
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= 0.46
            v.co.z *= 0.72
            v.co.y = v.co.y * 0.30 + 0.15
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new('PackProxy', me)
        bpy.context.scene.collection.objects.link(o)
        o.parent = sl
    return 'proxy'


PRESETS.update({
    'tvg_side': dict(az=118, el=24, dist=6.4, lens=30, target=(0.0, 0.9, 1.0)),
    'tvg_rear': dict(az=186, el=24, dist=6.8, lens=34, target=(0.0, 2.9, 0.9)),
    'rear34open': dict(az=146, el=14, dist=7.4, lens=40, target=(0.35, 3.7, 0.95)),
    'turn0': dict(az=0, el=10, dist=11.0, lens=45, target=(0.0, 0.36, 0.95)),
})


def turntable(outdir, n=8, w=640, h=360, engine='eevee', samples=32):
    os.makedirs(outdir, exist_ok=True)
    sc = setup_stage(sun_az=-35.0, sun_el=42.0, ground=False, sky_strength=0.32, sun_strength=3.6, samples=samples)
    add_environment('plaza')
    set_emission(0.0)
    if engine == 'cycles':
        cycles(samples)
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    files = []
    for i in range(n):
        az = 30 + i * 360.0 / n
        car_cam(az, 9, 11.5, (0.0, 0.36, 0.95), 45)
        f = os.path.join(outdir, f'turn_{i:02d}.jpg')
        sc.render.filepath = f
        bpy.ops.render.render(write_still=True)
        files.append(f)
    sc.render.resolution_x = 1280
    sc.render.resolution_y = 720
    return files


def final(outdir, cycles_samples=32):
    """Deliverable validation renders (Eevee everywhere, Cycles only for the 2 hero shots)."""
    import json
    os.makedirs(outdir, exist_ok=True)
    out = {}
    out['turntable'] = turntable(os.path.join(outdir, 'turn'), engine='eevee', samples=48)
    sc = setup_stage(sun_az=60.0, sun_el=40.0, ground=False, sky_strength=0.32, sun_strength=3.6, samples=64)
    add_environment('plaza')
    set_emission(0.0)
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    for n in ('front34', 'roof', 'side', 'front', 'rear'):
        p = PRESETS[n]
        car_cam(p['az'], p['el'], p['dist'], p['target'], p['lens'])
        sc.render.filepath = os.path.join(outdir, f'eevee_{n}.jpg')
        bpy.ops.render.render(write_still=True)
    out['packs'] = add_packs()
    p = PRESETS['tvg_side']
    car_cam(p['az'], p['el'], p['dist'], p['target'], p['lens'])
    deploy(doors=1.0, rear=0.0, tray=0.0, swing=0.0)
    sc.render.filepath = os.path.join(outdir, 'eevee_tvg_side.jpg')
    bpy.ops.render.render(write_still=True)
    deploy(doors=0.0, rear=1.0, tray=0.0, swing=0.0)
    p = PRESETS['tvg_rear']
    car_cam(p['az'], p['el'], p['dist'], p['target'], p['lens'])
    sc.render.filepath = os.path.join(outdir, 'eevee_tvg_rear.jpg')
    bpy.ops.render.render(write_still=True)
    deploy(doors=0.0, rear=1.0, tray=1.0, swing=1.0)
    sc = setup_stage(sun_az=150.0, sun_el=38.0, ground=False, sky_strength=0.32, sun_strength=3.6, samples=64)
    p = PRESETS['rear34open']
    car_cam(p['az'], p['el'], p['dist'], p['target'], p['lens'])
    sc.render.filepath = os.path.join(outdir, 'eevee_rear34open.jpg')
    bpy.ops.render.render(write_still=True)
    cycles(cycles_samples)
    sc.render.filepath = os.path.join(outdir, 'hero_rear34open.jpg')
    bpy.ops.render.render(write_still=True)
    deploy(0, 0, 0, 0)
    sc = setup_stage(sun_az=60.0, sun_el=40.0, ground=False, sky_strength=0.32, sun_strength=3.6, samples=64)
    cycles(cycles_samples)
    p = PRESETS['front34']
    car_cam(p['az'], p['el'], p['dist'], p['target'], p['lens'])
    sc.render.filepath = os.path.join(outdir, 'hero_front34.jpg')
    bpy.ops.render.render(write_still=True)
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
    return out
