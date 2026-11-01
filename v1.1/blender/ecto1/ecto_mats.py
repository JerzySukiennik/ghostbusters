# Ecto-1 PBR materials (glTF-exportable Principled BSDF setups).
import os
import bpy

TEX_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tex')


def _srgb(c):
    return tuple(((v / 255.0 + 0.055) / 1.055) ** 2.4 if v / 255.0 > 0.04045 else (v / 255.0) / 12.92 for v in c)


def _bsdf(name, base=(0.8, 0.8, 0.8), metallic=0.0, rough=0.5, coat=0.0, coat_rough=0.03, alpha=1.0,
          emit=None, emit_strength=1.0, blend=None, spec=0.5, image=None, image_alpha=False, normal=None, ior=1.5, emit_image=False):
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*base, 1.0)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = rough
    p.inputs['IOR'].default_value = ior
    if 'Coat Weight' in p.inputs:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = coat_rough
    p.inputs['Alpha'].default_value = alpha
    if emit is not None:
        p.inputs['Emission Color'].default_value = (*emit, 1.0)
        p.inputs['Emission Strength'].default_value = emit_strength
    if image is not None:
        path = os.path.join(TEX_DIR, image)
        img = bpy.data.images.load(path, check_existing=True)
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = img
        tn.location = (-400, 200)
        if image.lower().endswith('.png') and not image_alpha:
            img.alpha_mode = 'NONE'
        nt.links.new(tn.outputs['Color'], p.inputs['Base Color'])
        if emit_image:
            nt.links.new(tn.outputs['Color'], p.inputs['Emission Color'])
            p.inputs['Emission Strength'].default_value = emit_strength
        if image_alpha:
            nt.links.new(tn.outputs['Alpha'], p.inputs['Alpha'])
    if normal is not None:
        path = os.path.join(TEX_DIR, normal)
        img = bpy.data.images.load(path, check_existing=True)
        img.colorspace_settings.name = 'Non-Color'
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = img
        tn.location = (-600, -300)
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.location = (-300, -300)
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    if blend == 'BLEND':
        m.surface_render_method = 'BLENDED'
        m.use_backface_culling = False
    elif blend == 'CLIP':
        m.surface_render_method = 'DITHERED'
        m.alpha_threshold = 0.5 if hasattr(m, 'alpha_threshold') else None
    m.diffuse_color = (*base, 1.0) if alpha >= 1 else (*base, alpha)
    m.metallic = metallic
    m.roughness = rough
    return m


def make_all():
    M = {}
    M['white'] = _bsdf('Paint_White', _srgb((232, 232, 226)), rough=0.32, coat=1.0, coat_rough=0.025)
    M['red'] = _bsdf('Paint_Red', _srgb((178, 14, 20)), rough=0.30, coat=1.0, coat_rough=0.025)
    M['chrome'] = _bsdf('Chrome', (0.92, 0.92, 0.93), metallic=1.0, rough=0.055)
    M['glass'] = _bsdf('Glass', (0.020, 0.026, 0.028), rough=0.02, alpha=0.52, blend='BLEND')
    M['gap'] = _bsdf('Trim_Black', (0.012, 0.012, 0.012), rough=0.55)
    M['under'] = _bsdf('Underbody', (0.018, 0.018, 0.018), rough=0.85)
    M['rubber'] = _bsdf('Tyre_Rubber', (0.022, 0.022, 0.022), rough=0.82)
    M['whitewall'] = _bsdf('Tyre_Whitewall', _srgb((226, 224, 214)), rough=0.62)
    M['steel'] = _bsdf('Steel_Satin', (0.55, 0.56, 0.57), metallic=1.0, rough=0.32)
    M['vinyl'] = _bsdf('Interior_Vinyl', (0.018, 0.018, 0.018), rough=0.42, coat=0.3, coat_rough=0.2)
    M['interior'] = _bsdf('Interior_Dark', (0.03, 0.03, 0.032), rough=0.62)
    M['carpet'] = _bsdf('Interior_Carpet', (0.02, 0.02, 0.02), rough=0.95)
    M['hose_blue'] = _bsdf('Hose_Blue', _srgb((28, 72, 168)), rough=0.45)
    M['head_emit'] = _bsdf('HeadlightEmit', (0.80, 0.82, 0.84), metallic=0.75, rough=0.10, coat=1.0, emit=(1.0, 0.93, 0.80), emit_strength=1.0)
    M['tail_emit'] = _bsdf('TailLightEmit', _srgb((150, 8, 10)), rough=0.12, coat=1.0, emit=(1.0, 0.06, 0.03), emit_strength=1.0)
    M['beacon_emit'] = _bsdf('BeaconEmit', _srgb((175, 10, 12)), rough=0.10, coat=1.0, emit=(1.0, 0.05, 0.03), emit_strength=1.0)
    M['bar_emit'] = _bsdf('LightBarEmit', _srgb((18, 60, 190)), rough=0.10, coat=1.0, emit=(0.15, 0.35, 1.0), emit_strength=1.0)
    M['grille_emit'] = _bsdf('GrilleLightEmit', _srgb((205, 150, 70)), rough=0.12, coat=1.0, emit=(1.0, 0.55, 0.15), emit_strength=1.0)
    M['lens_clear'] = _bsdf('Lens_Clear', (0.80, 0.80, 0.78), rough=0.06, coat=1.0)
    M['int_emit'] = _bsdf('InteriorEmit', (0.08, 0.10, 0.08), rough=0.3, emit=(0.6, 1.0, 0.55), emit_strength=1.0)
    return M


def add_textured():
    M = {}
    M['logo'] = _bsdf('Decal_NoGhost', (1, 1, 1), rough=0.30, coat=1.0, image='noghost.png', image_alpha=True, blend='CLIP')
    M['plate'] = _bsdf('Plate_ECTO1', (1, 1, 1), rough=0.45, image='plate_ecto1.jpg')
    M['palette'] = _bsdf('Rack_Paint', (1, 1, 1), rough=0.42, coat=0.4, image='palette.png')
    M['equip'] = _bsdf('Equipment_Panels', (1, 1, 1), rough=0.5, image='equipment.jpg')
    M['dash'] = _bsdf('InteriorGaugesEmit', (1, 1, 1), rough=0.35, image='gauges.jpg', emit_image=True, emit_strength=1.0)
    return M
