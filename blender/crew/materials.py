# glTF-ready crew materials: uniform/mouth/eye-cornea materials appended from the avatar work blend, new skin, eye, brow, beard, hair and glasses materials.
import bpy, os, json


def _img(path, colorspace):
    name = os.path.basename(path)
    im = bpy.data.images.get(name)
    if im is None or os.path.abspath(bpy.path.abspath(im.filepath)) != os.path.abspath(path):
        im = bpy.data.images.load(path, check_existing=False)
        im.name = name
    im.colorspace_settings.name = colorspace
    return im


def _gltf_group():
    g = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    if 'Occlusion' not in [i.name for i in g.interface.items_tree]:
        g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    return g


def pbr(name, base=None, normal=None, orm=None, color=(0.8, 0.8, 0.8), rough=0.6, metal=0.0, double=False, mask=False, vcol=False,
        alpha=None, normal_strength=1.0, spec=0.5, ior=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear(); N, L = nt.nodes, nt.links
    out = N.new('ShaderNodeOutputMaterial'); b = N.new('ShaderNodeBsdfPrincipled'); L.new(b.outputs['BSDF'], out.inputs['Surface'])
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    lin = tuple((c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in color)
    b.inputs['Base Color'].default_value = (*lin, 1)
    b.inputs['Specular IOR Level'].default_value = spec
    if ior:
        b.inputs['IOR'].default_value = ior
    col_out = None; a_out = None
    if base:
        t = N.new('ShaderNodeTexImage'); t.image = _img(base, 'sRGB'); col_out = t.outputs['Color']
        if mask:
            a_out = t.outputs['Alpha']
    if vcol:
        va = N.new('ShaderNodeVertexColor'); va.layer_name = 'Color'
        if col_out is not None:
            mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0
            L.new(col_out, mx.inputs[6]); L.new(va.outputs['Color'], mx.inputs[7]); col_out = mx.outputs[2]
        else:
            col_out = va.outputs['Color']
        if a_out is not None:
            mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
            L.new(a_out, mul.inputs[0]); L.new(va.outputs['Alpha'], mul.inputs[1]); a_out = mul.outputs['Value']
    if col_out is not None:
        L.new(col_out, b.inputs['Base Color'])
    if mask and a_out is not None:
        r = N.new('ShaderNodeMath'); r.operation = 'ROUND'
        L.new(a_out, r.inputs[0]); L.new(r.outputs['Value'], b.inputs['Alpha'])
        try:
            m.surface_render_method = 'DITHERED'
        except Exception:
            pass
    if alpha is not None:
        b.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    if normal:
        tn = N.new('ShaderNodeTexImage'); tn.image = _img(normal, 'Non-Color')
        nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = normal_strength
        L.new(tn.outputs['Color'], nm.inputs['Color']); L.new(nm.outputs['Normal'], b.inputs['Normal'])
    if orm:
        to = N.new('ShaderNodeTexImage'); to.image = _img(orm, 'Non-Color')
        sep = N.new('ShaderNodeSeparateColor'); L.new(to.outputs['Color'], sep.inputs['Color'])
        L.new(sep.outputs['Green'], b.inputs['Roughness']); L.new(sep.outputs['Blue'], b.inputs['Metallic'])
        gn = N.new('ShaderNodeGroup'); gn.node_tree = _gltf_group(); L.new(sep.outputs['Red'], gn.inputs['Occlusion'])
    m.use_backface_culling = not double
    return m


def _append(names, path):
    have = [n for n in names if n not in bpy.data.materials]
    if not have:
        return
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.materials = [n for n in src.materials if n in have]


def _assign(obj_name, mapping):
    o = bpy.data.objects.get(obj_name)
    if o is None:
        return
    for i, m in enumerate(o.data.materials):
        if m and m.name in mapping:
            o.data.materials[i] = mapping[m.name]
        elif m and m.name.split('.')[0] in mapping:
            o.data.materials[i] = mapping[m.name.split('.')[0]]


def build_materials(cid, tex, avtex):
    root = os.path.abspath(avtex + '/../../..')
    awork = root + '/blender/avatar/work/jurek_gb_work.blend'
    info = json.load(open(os.path.dirname(tex) + '/../cache/' + cid + '_info.json')) if os.path.exists(os.path.dirname(tex) + '/../cache/' + cid + '_info.json') else {}
    keep = ['Suit', 'Boots', 'Belt', 'NameTag', 'Patch', 'Harness', 'Teeth', 'Gums', 'Tongue', 'Caruncle_RT', 'EyeCornea_RT', 'Lashes']
    for n in keep:
        m = bpy.data.materials.get(n)
        if m is not None:
            m.name = n + '_placeholder'
    _append(keep, awork)
    lib = {n: bpy.data.materials[n] for n in keep if n in bpy.data.materials}
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        for i, m in enumerate(o.data.materials):
            if m and m.name.endswith('_placeholder') and m.name[:-12] in lib:
                o.data.materials[i] = lib[m.name[:-12]]

    tagp = tex + '/nametag_basecolor.jpg'
    if os.path.exists(tagp) and 'NameTag' in lib:
        nt_ = lib['NameTag'].node_tree
        for n_ in nt_.nodes:
            if n_.type == 'TEX_IMAGE' and n_.image and 'basecolor' in n_.image.name:
                n_.image = _img(tagp, 'sRGB'); n_.image.name = 'nametag_basecolor.jpg'

    def t(n, fallback=None):
        p = tex + '/' + n
        return p if os.path.exists(p) else fallback

    skin = pbr('Skin', t('head_basecolor.jpg', avtex + '/head_basecolor.jpg'), t('head_normal.png', avtex + '/head_normal.png'), t('head_orm.jpg', avtex + '/head_orm.jpg'))
    bskin = pbr('BodySkin', t('body_basecolor.jpg', avtex + '/body_basecolor.jpg'), t('body_normal.png', avtex + '/body_normal.png'), t('body_orm.jpg', avtex + '/body_orm.jpg'))
    eyes = {s: pbr('Eye' + s, t(f'eye{s}_basecolor.jpg', avtex + f'/eye{s}_basecolor.jpg'), avtex + f'/eye{s}_normal.png', None, rough=0.25) for s in 'LR'}
    brow = pbr('Brow', t('brow.png'), None, None, color=tuple(info.get('brow_color', (0.05, 0.03, 0.02))), rough=0.7, double=True, mask=bool(t('brow.png')), vcol=bool(t('brow.png')))
    beard = pbr('Beard', t('beard.png'), t('beard_normal.png'), None, rough=0.62, double=True, mask=True, vcol=True) if t('beard.png') else None
    beardcap = pbr('BeardCap', t('beardcap.jpg'), t('beard_normal.png'), None, rough=0.7) if t('beardcap.jpg') else None
    hair = pbr('Hair', t('hair.png'), t('hair_normal.png'), None, rough=float(info.get('hair_rough', 0.55)), double=True, mask=True, vcol=True) if t('hair.png') else None
    cap = pbr('HairCap', t('haircap.jpg'), t('hair_normal.png'), None, color=tuple(info.get('cap_color', (0.03, 0.02, 0.015))), rough=float(info.get('hair_rough', 0.55)) + 0.08)
    frame = pbr('GlassesFrame', t('glasses_frame.jpg'), None, None, color=(0.11, 0.075, 0.055), rough=0.3, spec=0.5)
    lens = pbr('GlassesLens', None, None, None, color=(0.15, 0.17, 0.19), rough=0.04, alpha=0.10, spec=1.0, ior=1.5)
    m = {'Skin': skin, 'BodySkin': bskin, 'EyeL': eyes['L'], 'EyeR': eyes['R'], 'Brow': brow, 'HairCap': cap, 'GlassesFrame': frame, 'GlassesLens': lens}
    if beard:
        m['Beard'] = beard
    if beardcap:
        m['BeardCap'] = beardcap
    if hair:
        m['Hair'] = hair
    for o in bpy.data.objects:
        if o.type == 'MESH':
            _assign(o.name, m)
    for mm in list(bpy.data.materials):
        if mm.users == 0:
            bpy.data.materials.remove(mm)
