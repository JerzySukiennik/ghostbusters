# Blender: assemble Janine on the v1 Jurek.Rig (body set + separate morph head + lenses), her 1984 multi-line desk phone and handset, GLB without clips.
import bpy, bmesh, sys, os, json
import numpy as np
from mathutils import kdtree, Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); C = HERE + '/cache'
ROOT = os.path.abspath(HERE + '/../..')
args = sys.argv[sys.argv.index('--') + 1:]
OUT = args[0]
CID = 'janine'
S = 0.955
bpy.ops.wm.read_factory_settings(use_empty=True)
D = bpy.data; O = D.objects; sc = bpy.context.scene


def select_only(o):
    for x in bpy.context.view_layer.objects:
        x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


with D.libraries.load(ROOT + '/blender/avatar/src/rt_anim.blend', link=False) as (src, dst):
    dst.objects = ['Jurek.Rig']
rig = dst.objects[0]
sc.collection.objects.link(rig)
rig.animation_data_clear(); rig.data.pose_position = 'REST'
for pb in rig.pose.bones:
    pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    for c in list(pb.constraints):
        pb.constraints.remove(c)
for c in list(rig.constraints):
    rig.constraints.remove(c)
RIGN = [str(n) for n in np.load(C + '/rig.npz')['names']]
root = D.objects.new('Janine', None); sc.collection.objects.link(root)
rig.parent = root; rig.scale = (S, S, S)

d = np.load(C + f'/{CID}_ped.npz')
names = [str(n) for n in d['names']]


def material(name, color=None, image=None, rough=0.7, metal=0.0, alpha=1.0):
    m = D.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    if image:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = D.images.load(image); t.image.name = os.path.basename(image)
        m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if color:
        b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND'
    return m


atlas = material('JanineAtlas', image=HERE + f'/tex/{CID}/atlas.jpg', rough=0.72)
atlas.node_tree.nodes['Image Texture'].image.name = 'janine_atlas.jpg'
lensm = material('JanineLens', color=(0.80, 0.74, 0.76), rough=0.06, alpha=0.16)


def mk(name, mat):
    V = d[name + '__co']; loops = d[name + '__loops']; ls = d[name + '__ls']; lt = d[name + '__lt']; uv = d[name + '__uv']; W = d[name + '__W']; zone = d[name + '__zone']
    me = D.meshes.new(name)
    me.vertices.add(len(V)); me.vertices.foreach_set('co', np.asarray(V, float).ravel())
    me.loops.add(len(loops)); me.loops.foreach_set('vertex_index', loops.astype(np.int32))
    me.polygons.add(len(ls)); me.polygons.foreach_set('loop_start', ls.astype(np.int32)); me.polygons.foreach_set('loop_total', lt.astype(np.int32))
    me.update(calc_edges=True)
    ul = me.uv_layers.new(name='UVMap'); ul.data.foreach_set('uv', np.asarray(uv, float).ravel())
    me.polygons.foreach_set('use_smooth', np.ones(len(ls), bool))
    at = me.attributes.new('zone', 'INT', 'FACE'); at.data.foreach_set('value', zone.astype(np.int32))
    me.validate(clean_customdata=False); me.update()
    me.materials.append(mat)
    o = D.objects.new(name, me); sc.collection.objects.link(o); o.parent = rig
    idx = np.argsort(-W, 1)[:, :4]; ww = np.take_along_axis(W, idx, 1); ww = np.where(ww < 1e-4, 0, ww); ww /= np.maximum(ww.sum(1, keepdims=True), 1e-9)
    groups = {}
    for vi in range(len(V)):
        for j in range(4):
            if ww[vi, j] > 0:
                bn = RIGN[idx[vi, j]]
                g = groups.get(bn) or o.vertex_groups.new(name=bn); groups[bn] = g
                g.add([vi], float(ww[vi, j]), 'REPLACE')
    am = o.modifiers.new('Armature', 'ARMATURE'); am.object = rig
    return o


def decimate_zones(o, plan):
    select_only(o)
    bpy.context.tool_settings.mesh_select_mode = (False, False, True)
    for zone, ratio in plan:
        if ratio >= 0.999:
            continue
        bpy.ops.object.mode_set(mode='OBJECT')
        me = o.data
        z = np.zeros(len(me.polygons), np.int32); me.attributes['zone'].data.foreach_get('value', z)
        sel = (z == zone) if zone >= 0 else np.ones(len(z), bool)
        if not sel.any():
            continue
        me.vertices.foreach_set('select', np.zeros(len(me.vertices), bool))
        me.edges.foreach_set('select', np.zeros(len(me.edges), bool))
        me.polygons.foreach_set('select', sel)
        sv = np.zeros(len(me.vertices), bool)
        for p in me.polygons:
            if p.select:
                sv[list(p.vertices)] = True
        me.vertices.foreach_set('select', sv); me.update()
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_mode(type='FACE')
        bpy.ops.mesh.decimate(ratio=max(ratio, 0.005), use_symmetry=True, symmetry_axis='X')
        bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')


def zone_tris(o):
    me = o.data
    z = np.zeros(len(me.polygons), np.int32); me.attributes['zone'].data.foreach_get('value', z)
    lt = np.array([len(p.vertices) for p in me.polygons])
    return {int(k): int((lt[z == k] - 2).sum()) for k in np.unique(z)}


objs = {n: mk(n, lensm if n == 'lens' else atlas) for n in names}
stats = {'src': {n: tris(o) for n, o in objs.items()}}
head = objs['head']; zt = zone_tris(head)
decimate_zones(head, [(3, 500 / max(zt.get(3, 1), 1)), (0, 4600 / max(zt.get(0, 1), 1)), (1, 3000 / max(zt.get(1, 1), 1)), (2, 1300 / max(zt.get(2, 1), 1))])
for s in ('eyeL', 'eyeR'):
    decimate_zones(objs[s], [(-1, 220 / max(tris(objs[s]), 1))])
decimate_zones(objs['hair'], [(-1, 4200 / max(tris(objs['hair']), 1))])
bz = zone_tris(objs['body'])
decimate_zones(objs['body'], [(1, 2400 / max(bz.get(1, 1), 1)), (0, 8200 / max(bz.get(0, 1), 1))])
stats['lod0'] = {n: tris(o) for n, o in objs.items()}

H0 = d['head__co']; HK = d['head__keys']; KN = [str(k) for k in d['head__keynames']]
kd = kdtree.KDTree(len(H0))
for i, p in enumerate(H0):
    kd.insert(Vector(p), i)
kd.balance()
me = head.data
co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
near = np.array([kd.find(Vector(p))[1] for p in co])
head.shape_key_add(name='Basis', from_mix=False)
for k, nm in enumerate(KN):
    sk = head.shape_key_add(name=nm, from_mix=False)
    sk.data.foreach_set('co', (co + (HK[k][near] - H0[near])).ravel())
head.name = 'JanineHead'; head.data.name = 'JanineHead'

for o in list(objs.values()):
    select_only(o)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
for o in O:
    o.select_set(o.type == 'MESH' and o.name in names and o.name not in ('lens',))
bpy.context.view_layer.objects.active = objs['body']
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active; body.name = 'JanineBody'; body.data.name = 'JanineBody'
select_only(body)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0002); bpy.ops.object.mode_set(mode='OBJECT')
lens = objs['lens']; lens.name = 'JanineLens'; lens.data.name = 'JanineLens'
for o in (body, head, lens):
    if 'zone' in o.data.attributes:
        o.data.attributes.remove(o.data.attributes['zone'])
stats['LOD0'] = tris(body) + tris(head) + tris(lens)

beige = material('PhoneBeige', color=(0.62, 0.55, 0.43), rough=0.42)
keys = material('PhoneKeys', color=(0.09, 0.085, 0.08), rough=0.35)
clear = material('PhoneLamps', color=(0.85, 0.83, 0.78), rough=0.15)


def box(bm, c, size, rot=0.0, bevel=0.0):
    r = bmesh.ops.create_cube(bm, size=1.0)
    vs = r['verts']
    for v in vs:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if rot:
        bmesh.ops.rotate(bm, verts=vs, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(rot, 3, 'X'))
    bmesh.ops.translate(bm, verts=vs, vec=Vector(c))
    if bevel > 0:
        es = list({e for v in vs for e in v.link_edges})
        bmesh.ops.bevel(bm, geom=es + vs, offset=bevel, segments=2, affect='EDGES', profile=0.5)
    return vs


def obj_from(bm, name, mats, parent):
    me = D.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = False
    o = D.objects.new(name, me); sc.collection.objects.link(o); o.parent = parent
    return o


def tag(bm, fn, mi):
    n0 = len(bm.faces)
    fn()
    bm.faces.ensure_lookup_table()
    for f in list(bm.faces)[n0:]:
        f.material_index = mi


bm = bmesh.new()
tag(bm, lambda: box(bm, (0, 0.0, 0.028), (0.205, 0.215, 0.056), bevel=0.008), 0)
tag(bm, lambda: box(bm, (0, -0.02, 0.058), (0.185, 0.15, 0.030), rot=-0.22, bevel=0.006), 0)
for ix in range(3):
    for iy in range(4):
        tag(bm, lambda: box(bm, (-0.045 + ix * 0.019, -0.055 + iy * 0.017 - 0.0, 0.070 + iy * 0.0037), (0.013, 0.011, 0.006), rot=-0.22, bevel=0.0015), 1)
for k in range(6):
    tag(bm, lambda: box(bm, (0.035 + (k % 2) * 0.022, -0.06 + (k // 2) * 0.022, 0.071 + (k // 2) * 0.0048), (0.016, 0.013, 0.007), rot=-0.22, bevel=0.0015), 2)
for sx in (-1, 1):
    tag(bm, lambda: box(bm, (sx * 0.078, 0.055, 0.075), (0.026, 0.05, 0.024), bevel=0.006), 0)
phone = obj_from(bm, 'JaninePhone', [beige, keys, clear], root)
bm = bmesh.new()
tag(bm, lambda: box(bm, (0, 0, 0), (0.150, 0.026, 0.024), bevel=0.008), 0)
for sx in (-1, 1):
    tag(bm, lambda: box(bm, (sx * 0.083, 0.0, -0.014), (0.050, 0.046, 0.030), bevel=0.012), 0)
handset = obj_from(bm, 'JanineHandset', [beige], root)
handset.location = (0, 0.055, 0.105)
stats['phone'] = tris(phone) + tris(handset)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
for o in O:
    o.select_set(o.name in ('Janine', 'Jurek.Rig', 'JanineBody', 'JanineHead', 'JanineLens', 'JaninePhone', 'JanineHandset'))
bpy.context.view_layer.objects.active = rig
kw = dict(filepath=OUT, use_selection=True, export_format='GLB', export_yup=True, export_apply=False, export_texcoords=True, export_normals=True,
          export_skins=True, export_all_influences=False, export_def_bones=False, export_morph=True, export_morph_normal=False, export_animations=False, export_extras=True,
          export_attributes=False, export_cameras=False, export_lights=False, export_image_format='JPEG', export_jpeg_quality=88)
try:
    bpy.ops.export_scene.gltf(**kw)
except TypeError:
    kw.pop('export_jpeg_quality', None); bpy.ops.export_scene.gltf(**kw)
json.dump(stats, open(C + f'/{CID}_stats.json', 'w'), indent=1)
print('JANINE', json.dumps(stats), os.path.getsize(OUT))
