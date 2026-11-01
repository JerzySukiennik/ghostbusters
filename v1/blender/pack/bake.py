# Ghostbusters pack lane: UV atlas + Cycles mask bake (AO, edge, cavity) + procedural wear baked to BaseColor/ORM JPEGs.
import bpy, math, os, time
import numpy as np

KINDS = {
    'paint_black': dict(col=(0.018, 0.018, 0.020), rough=0.58, metal=0.0, chip=1.0, chipcol=(0.27, 0.27, 0.28), chipmetal=0.9, chiprough=0.36, grime=1.0, dust=1.0, scratch=1.0),
    'paint_black_gloss': dict(col=(0.016, 0.016, 0.018), rough=0.42, metal=0.0, chip=1.1, chipcol=(0.29, 0.29, 0.30), chipmetal=0.9, chiprough=0.33, grime=0.9, dust=0.9, scratch=1.2),
    'paint_grey': dict(col=(0.085, 0.085, 0.09), rough=0.40, metal=0.55, chip=0.8, chipcol=(0.33, 0.33, 0.34), chipmetal=1.0, chiprough=0.32, grime=1.0, dust=1.0, scratch=1.0),
    'alu': dict(col=(0.56, 0.56, 0.58), rough=0.36, metal=1.0, chip=0.0, chipcol=(0.6, 0.6, 0.6), chipmetal=1.0, chiprough=0.3, grime=0.9, dust=0.7, scratch=1.4),
    'alu_dark': dict(col=(0.04, 0.04, 0.045), rough=0.40, metal=0.6, chip=0.7, chipcol=(0.45, 0.45, 0.47), chipmetal=1.0, chiprough=0.35, grime=0.8, dust=0.8, scratch=1.0),
    'steel': dict(col=(0.55, 0.55, 0.56), rough=0.30, metal=1.0, chip=0.0, chipcol=(0.6, 0.6, 0.6), chipmetal=1.0, chiprough=0.3, grime=1.0, dust=0.5, scratch=0.6),
    'steel_dark': dict(col=(0.11, 0.11, 0.12), rough=0.36, metal=1.0, chip=0.5, chipcol=(0.5, 0.5, 0.5), chipmetal=1.0, chiprough=0.3, grime=1.0, dust=0.5, scratch=0.5),
    'rubber': dict(col=(0.02, 0.02, 0.02), rough=0.78, metal=0.0, chip=0.0, chipcol=(0.1, 0.1, 0.1), chipmetal=0.0, chiprough=0.8, grime=0.6, dust=1.2, scratch=0.0),
    'hose': dict(col=(0.022, 0.022, 0.024), rough=0.52, metal=0.0, chip=0.0, chipcol=(0.1, 0.1, 0.1), chipmetal=0.0, chiprough=0.6, grime=0.7, dust=1.2, scratch=0.3),
    'copper': dict(col=(0.80, 0.44, 0.26), rough=0.34, metal=1.0, chip=0.0, chipcol=(0.9, 0.55, 0.35), chipmetal=1.0, chiprough=0.25, grime=1.2, dust=0.4, scratch=0.0, tarnish=1.0),
    'brass': dict(col=(0.78, 0.60, 0.30), rough=0.32, metal=1.0, chip=0.0, chipcol=(0.85, 0.7, 0.4), chipmetal=1.0, chiprough=0.25, grime=1.2, dust=0.4, scratch=0.3, tarnish=0.7),
    'wire_red': dict(col=(0.48, 0.025, 0.02), rough=0.38, metal=0.0, chip=0.0, chipcol=(0.4, 0.05, 0.04), chipmetal=0.0, chiprough=0.4, grime=0.5, dust=0.6, scratch=0.0),
    'wire_blue': dict(col=(0.02, 0.08, 0.45), rough=0.38, metal=0.0, chip=0.0, chipcol=(0.03, 0.1, 0.4), chipmetal=0.0, chiprough=0.4, grime=0.5, dust=0.6, scratch=0.0),
    'wire_yellow': dict(col=(0.66, 0.46, 0.03), rough=0.42, metal=0.0, chip=0.0, chipcol=(0.6, 0.45, 0.05), chipmetal=0.0, chiprough=0.4, grime=0.6, dust=0.6, scratch=0.0),
    'wire_black': dict(col=(0.02, 0.02, 0.02), rough=0.42, metal=0.0, chip=0.0, chipcol=(0.05, 0.05, 0.05), chipmetal=0.0, chiprough=0.4, grime=0.5, dust=0.8, scratch=0.0),
    'webbing': dict(col=(0.085, 0.095, 0.05), rough=0.95, metal=0.0, chip=0.0, chipcol=(0.1, 0.1, 0.06), chipmetal=0.0, chiprough=0.95, grime=0.8, dust=1.0, scratch=0.0, weave=1.0),
    'plastic_black': dict(col=(0.016, 0.016, 0.017), rough=0.38, metal=0.0, chip=0.0, chipcol=(0.1, 0.1, 0.1), chipmetal=0.0, chiprough=0.4, grime=0.6, dust=0.9, scratch=0.8),
    'plastic_grey': dict(col=(0.30, 0.31, 0.32), rough=0.42, metal=0.0, chip=0.0, chipcol=(0.3, 0.3, 0.3), chipmetal=0.0, chiprough=0.4, grime=0.9, dust=0.8, scratch=0.5),
    'cavity': dict(col=(0.006, 0.006, 0.006), rough=0.9, metal=0.0, chip=0.0, chipcol=(0.0, 0.0, 0.0), chipmetal=0.0, chiprough=0.9, grime=0.0, dust=0.2, scratch=0.0),
    'plastic_red': dict(col=(0.42, 0.03, 0.02), rough=0.35, metal=0.0, chip=0.0, chipcol=(0.4, 0.05, 0.04), chipmetal=0.0, chiprough=0.4, grime=0.6, dust=0.7, scratch=0.3),
    'plastic_yellow': dict(col=(0.75, 0.55, 0.04), rough=0.35, metal=0.0, chip=0.0, chipcol=(0.6, 0.45, 0.05), chipmetal=0.0, chiprough=0.4, grime=0.6, dust=0.7, scratch=0.3),
    'plastic_clear': dict(col=(0.55, 0.6, 0.62), rough=0.12, metal=0.0, chip=0.0, chipcol=(0.5, 0.5, 0.5), chipmetal=0.0, chiprough=0.2, grime=0.8, dust=0.6, scratch=0.6),
    'wood_black': dict(col=(0.03, 0.028, 0.026), rough=0.62, metal=0.0, chip=0.55, chipcol=(0.30, 0.22, 0.14), chipmetal=0.0, chiprough=0.8, grime=1.0, dust=1.2, scratch=1.0),
    'heatsink': dict(col=(0.15, 0.14, 0.08), rough=0.48, metal=0.7, chip=0.6, chipcol=(0.42, 0.40, 0.32), chipmetal=1.0, chiprough=0.35, grime=1.2, dust=0.8, scratch=0.6),
    'paint_orange': dict(col=(0.42, 0.12, 0.03), rough=0.5, metal=0.0, chip=0.9, chipcol=(0.55, 0.55, 0.56), chipmetal=0.9, chiprough=0.35, grime=1.0, dust=0.9, scratch=1.0),
}

VARIANTS = {
    'film': dict(chip=0.95, dust=0.4, grime=0.85, scratch=0.7, chip_bias=0.0),
    'worn': dict(chip=2.1, dust=0.9, grime=1.25, scratch=1.7, chip_bias=0.13),
}


class NB:
    def __init__(self, nt):
        self.nt = nt
        self.x = 0

    def node(self, t, **kw):
        n = self.nt.nodes.new(t)
        for k, v in kw.items():
            setattr(n, k, v)
        n.location = (self.x, 0)
        self.x += 30
        return n

    def link(self, sock, val):
        if isinstance(val, (int, float)):
            sock.default_value = val
        elif isinstance(val, tuple):
            sock.default_value = (*val, 1.0) if len(val) == 3 and len(sock.default_value) == 4 else val
        else:
            self.nt.links.new(val, sock)

    def m(self, op, a, b=None, clamp=False):
        n = self.node('ShaderNodeMath', operation=op, use_clamp=clamp)
        self.link(n.inputs[0], a)
        if b is not None:
            self.link(n.inputs[1], b)
        return n.outputs[0]

    def smooth(self, x, lo, hi):
        n = self.node('ShaderNodeMapRange', data_type='FLOAT', interpolation_type='SMOOTHSTEP')
        self.link(n.inputs['Value'], x)
        self.link(n.inputs['From Min'], lo)
        self.link(n.inputs['From Max'], hi)
        return n.outputs['Result']

    def mixc(self, a, b, t):
        n = self.node('ShaderNodeMix', data_type='RGBA', clamp_factor=True)
        self.link(n.inputs[0], t)
        self.link(n.inputs[6], a)
        self.link(n.inputs[7], b)
        return n.outputs[2]

    def mixf(self, a, b, t):
        n = self.node('ShaderNodeMix', data_type='FLOAT', clamp_factor=True)
        self.link(n.inputs[0], t)
        self.link(n.inputs[2], a)
        self.link(n.inputs[3], b)
        return n.outputs[0]

    def noise(self, vec, scale, detail=4.0, rough=0.55, dist=0.0, w=None):
        n = self.node('ShaderNodeTexNoise', noise_dimensions='3D')
        self.link(n.inputs['Vector'], vec)
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        n.inputs['Distortion'].default_value = dist
        return n.outputs['Fac']

    def rgb(self, r, g, b):
        n = self.node('ShaderNodeCombineColor')
        self.link(n.inputs[0], r)
        self.link(n.inputs[1], g)
        self.link(n.inputs[2], b)
        return n.outputs[0]

    def emit_out(self, col):
        e = self.node('ShaderNodeEmission')
        self.link(e.inputs['Color'], col)
        e.inputs['Strength'].default_value = 1.0
        o = self.node('ShaderNodeOutputMaterial')
        self.nt.links.new(e.outputs[0], o.inputs['Surface'])
        o.is_active_output = True
        return o


def unwrap(ob, margin=0.0022, angle=58.0, island_scale=None):
    import bmesh
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    me.uv_layers.active = me.uv_layers[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_mode(type='FACE')
    bm = bmesh.from_edit_mesh(me)
    lay = bm.faces.layers.int.get('uvfix')
    nfix = 0
    for f in bm.faces:
        fixed = lay is not None and f[lay] == 1
        f.select = not fixed
        nfix += fixed
    bmesh.update_edit_mesh(me)
    print('unwrap: procedural-uv faces', nfix, 'of', len(bm.faces))
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode='OBJECT')
    if island_scale:
        uv = me.uv_layers.active.data
        for poly in me.polygons:
            s = island_scale.get(poly.material_index)
            if s is None:
                continue
            for li in poly.loop_indices:
                uv[li].uv = uv[li].uv * s
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, rotate_method='ANY', scale=True, margin_method='FRACTION', margin=margin, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')


def _img(name, size, path=None, noncolor=True):
    img = bpy.data.images.get(name)
    if img is not None:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
    if path:
        img.filepath_raw = path
    return img


def _bake_target(mat, img):
    nt = mat.node_tree
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = img
    t.name = 'BAKE_TARGET'
    t.location = (900, 400)
    for n in nt.nodes:
        n.select = False
    t.select = True
    nt.nodes.active = t


def mask_material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    b = NB(nt)
    ao1 = b.node('ShaderNodeAmbientOcclusion', samples=10, inside=False, only_local=False)
    ao1.inputs['Distance'].default_value = 0.055
    ao2 = b.node('ShaderNodeAmbientOcclusion', samples=6, inside=False, only_local=False)
    ao2.inputs['Distance'].default_value = 0.010
    aoi = b.node('ShaderNodeAmbientOcclusion', samples=10, inside=True, only_local=True)
    aoi.inputs['Distance'].default_value = 0.0045
    bev = b.node('ShaderNodeBevel', samples=4)
    bev.inputs['Radius'].default_value = 0.003
    geo = b.node('ShaderNodeNewGeometry')
    dot = b.node('ShaderNodeVectorMath', operation='DOT_PRODUCT')
    nt.links.new(bev.outputs['Normal'], dot.inputs[0])
    nt.links.new(geo.outputs['Normal'], dot.inputs[1])
    e1 = b.m('MULTIPLY', b.m('SUBTRACT', 1.0, aoi.outputs['AO']), 2.6, clamp=True)
    e2 = b.m('MULTIPLY', b.m('SUBTRACT', 1.0, dot.outputs['Value']), 4.0, clamp=True)
    edge = b.m('MAXIMUM', e1, b.m('MULTIPLY', e2, 0.5))
    col = b.rgb(ao1.outputs['AO'], edge, ao2.outputs['AO'])
    b.emit_out(col)
    return m


def wear_material(name, kind, mask_img, variant, mode, seed=0.0):
    K = KINDS.get(kind, KINDS['paint_black'])
    Vv = VARIANTS[variant]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    b = NB(nt)
    uvn = b.node('ShaderNodeUVMap', uv_map='UVMap')
    ti = b.node('ShaderNodeTexImage', interpolation='Linear')
    ti.image = mask_img
    nt.links.new(uvn.outputs['UV'], ti.inputs['Vector'])
    sep = b.node('ShaderNodeSeparateColor')
    nt.links.new(ti.outputs['Color'], sep.inputs[0])
    ao, edge, cav = sep.outputs[0], sep.outputs[1], sep.outputs[2]
    tc = b.node('ShaderNodeTexCoord')
    obj = tc.outputs['Object']
    off = b.node('ShaderNodeVectorMath', operation='ADD')
    nt.links.new(obj, off.inputs[0])
    off.inputs[1].default_value = (seed * 1.7, seed * 2.3, seed * 0.9)
    pos = off.outputs[0]
    geo = b.node('ShaderNodeNewGeometry')
    n_big = b.noise(pos, 6.0, 3.0, 0.5)
    n_mid = b.noise(pos, 38.0, 6.0, 0.62, 0.15)
    n_fine = b.noise(pos, 260.0, 3.0, 0.6)
    n_dust = b.noise(pos, 70.0, 5.0, 0.6, 0.2)
    sc_vec = b.node('ShaderNodeVectorMath', operation='MULTIPLY')
    nt.links.new(pos, sc_vec.inputs[0])
    sc_vec.inputs[1].default_value = (1.0, 22.0, 1.0)
    n_scr = b.noise(sc_vec.outputs[0], 160.0, 2.0, 0.5)
    sc_vec2 = b.node('ShaderNodeVectorMath', operation='MULTIPLY')
    nt.links.new(pos, sc_vec2.inputs[0])
    sc_vec2.inputs[1].default_value = (24.0, 1.0, 1.0)
    n_scr2 = b.noise(sc_vec2.outputs[0], 140.0, 2.0, 0.5)
    convex = b.m('MULTIPLY', edge, b.smooth(cav, 0.5, 0.9))
    chip_amt = K['chip'] * Vv['chip']
    breakup = b.m('ADD', 0.35, b.m('MULTIPLY', n_mid, 1.3))
    chip_src = b.m('MULTIPLY', b.m('MULTIPLY', convex, breakup), chip_amt)
    patch = b.m('MULTIPLY', b.smooth(n_big, 0.66 - Vv['chip_bias'], 0.80 - Vv['chip_bias']), b.smooth(n_mid, 0.5, 0.75))
    chip_src = b.m('ADD', chip_src, b.m('MULTIPLY', patch, 0.55 * chip_amt))
    chip = b.smooth(chip_src, 0.42, 0.58) if chip_amt > 0 else 0.0
    scr = b.m('MAXIMUM', b.smooth(n_scr, 0.71, 0.74), b.smooth(n_scr2, 0.72, 0.745))
    scr = b.m('MULTIPLY', scr, b.smooth(n_big, 0.35, 0.7))
    scr_amt = K['scratch'] * Vv['scratch']
    occl = b.m('SUBTRACT', 1.0, ao)
    grime = b.m('MULTIPLY', b.m('ADD', b.m('POWER', occl, 1.3), b.m('MULTIPLY', b.m('SUBTRACT', 1.0, cav), 0.9)), K['grime'] * Vv['grime'])
    grime = b.m('MULTIPLY', grime, b.m('ADD', 0.55, b.m('MULTIPLY', n_mid, 0.9)), clamp=True)
    upn = b.node('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Normal'], upn.inputs[0])
    up = b.smooth(upn.outputs['Z'], 0.15, 0.85)
    dust = b.m('MULTIPLY', b.m('ADD', b.m('MULTIPLY', up, 0.75), b.m('MULTIPLY', occl, 0.5)), b.smooth(n_dust, 0.38, 0.72))
    dust = b.m('MULTIPLY', dust, K['dust'] * Vv['dust'] * 0.55, clamp=True)
    base = K['col']
    var = b.m('ADD', 0.86, b.m('MULTIPLY', n_big, 0.22))
    var = b.m('ADD', var, b.m('MULTIPLY', b.m('SUBTRACT', n_fine, 0.5), 0.12))
    basec = b.node('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', clamp_factor=True)
    basec.inputs[0].default_value = 1.0
    b.link(basec.inputs[6], base)
    vcol = b.rgb(var, var, var)
    b.link(basec.inputs[7], vcol)
    col = basec.outputs[2]
    if K.get('tarnish'):
        tcol = (base[0] * 0.45, base[1] * 0.4, base[2] * 0.35)
        col = b.mixc(col, tcol, b.m('MULTIPLY', b.smooth(n_mid, 0.4, 0.75), K['tarnish'] * 0.8))
    if K.get('weave'):
        wv = b.node('ShaderNodeTexWave', wave_type='BANDS', bands_direction='DIAGONAL')
        nt.links.new(pos, wv.inputs['Vector'])
        wv.inputs['Scale'].default_value = 900.0
        wf = b.m('ADD', 0.85, b.m('MULTIPLY', wv.outputs['Fac'], 0.25))
        cw = b.node('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', clamp_factor=True)
        cw.inputs[0].default_value = 1.0
        nt.links.new(col, cw.inputs[6])
        b.link(cw.inputs[7], b.rgb(wf, wf, wf))
        col = cw.outputs[2]
    if chip_amt > 0:
        col = b.mixc(col, K['chipcol'], chip)
    if scr_amt > 0:
        scol = tuple(min(1.0, c * 1.0 + 0.10) for c in K['chipcol'])
        col = b.mixc(col, scol, b.m('MULTIPLY', scr, 0.4 * scr_amt))
    col = b.mixc(col, (0.035, 0.03, 0.026), b.m('MULTIPLY', grime, 0.55))
    col = b.mixc(col, (0.30, 0.275, 0.24), dust)
    if mode == 'color':
        b.emit_out(col)
        return m
    rough = b.m('ADD', K['rough'], b.m('MULTIPLY', b.m('SUBTRACT', n_mid, 0.5), 0.12))
    if chip_amt > 0:
        rough = b.mixf(rough, K['chiprough'], chip)
    rough = b.mixf(rough, 0.82, b.m('MULTIPLY', grime, 0.5))
    rough = b.mixf(rough, 0.93, dust)
    rough = b.mixf(rough, 0.24, b.m('MULTIPLY', scr, 0.4 * scr_amt))
    metal = K['metal']
    metal_s = b.mixf(metal, K['chipmetal'], chip) if chip_amt > 0 else b.m('ADD', metal, 0.0)
    metal_s = b.mixf(metal_s, 0.0, dust)
    aoo = b.m('ADD', 0.18, b.m('MULTIPLY', ao, 0.82))
    aoo = b.m('MULTIPLY', aoo, b.m('ADD', 0.6, b.m('MULTIPLY', cav, 0.4)))
    b.emit_out(b.rgb(aoo, b.m('ADD', rough, 0.0, clamp=True), b.m('ADD', metal_s, 0.0, clamp=True)))
    return m


def bake_emit(ob, img, margin=6):
    s = bpy.context.scene
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    t0 = time.time()
    bpy.ops.object.bake(type='EMIT', margin=margin, margin_type='EXTEND', use_clear=True)
    print('baked', img.name, round(time.time() - t0, 1), 's')


def blur_mask(img, passes=1):
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(h, w, 4)
    for _ in range(passes):
        p = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode='edge')
        a = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + 2 * p[1:-1, 1:-1]) / 6.0
    img.pixels.foreach_set(a.ravel())


def save_jpeg(img, path, noncolor):
    img.file_format = 'JPEG'
    img.filepath_raw = path
    try:
        img.save(filepath=path, quality=90)
    except TypeError:
        img.save()
    print('saved', path)


def bake_atlas(ob, prefix, size=2048, mask_size=1024, variants=('film', 'worn'), samples=8, outdir=None, seed=0.0, mask_blur=1):
    s = bpy.context.scene
    prev_engine = s.render.engine
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = samples
    s.cycles.use_denoising = False
    s.render.bake.margin = 6
    kinds = [ms.material.name.replace('pv_', '') if ms.material else 'paint_black' for ms in ob.material_slots]
    orig = [ms.material for ms in ob.material_slots]
    hidden = {}
    for o in bpy.context.scene.objects:
        if o is not ob and o.type == 'MESH':
            hidden[o.name] = o.hide_render
            o.hide_render = True
    mask = _img(prefix + '_mask', mask_size)
    mm = mask_material(prefix + '_maskmat')
    _bake_target(mm, mask)
    for ms in ob.material_slots:
        ms.material = mm
    bake_emit(ob, mask)
    if mask_blur:
        blur_mask(mask, mask_blur)
    s.cycles.samples = 2
    out = {}
    for var in variants:
        for mode in ('color', 'orm'):
            img = _img(f'{prefix}_{var}_{mode}', size, noncolor=(mode == 'orm'))
            mats = []
            for i, ms in enumerate(ob.material_slots):
                wm = wear_material(f'{prefix}_{var}_{mode}_{kinds[i]}', kinds[i], mask, var, mode, seed)
                _bake_target(wm, img)
                ms.material = wm
                mats.append(wm)
            bake_emit(ob, img)
            path = os.path.join(outdir, f'{prefix}_{var}_{"basecolor" if mode == "color" else "orm"}.jpg')
            save_jpeg(img, path, mode == 'orm')
            out[(var, mode)] = path
    for ms, m in zip(ob.material_slots, orig):
        ms.material = m
    for name, h in hidden.items():
        o = bpy.data.objects.get(name)
        if o is not None:
            o.hide_render = h
    s.render.engine = prev_engine
    return out
