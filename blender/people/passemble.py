# Blender: assemble one pedestrian from its numpy parts on the v1 Jurek.Rig (rig-normalized size), zone decimation to LOD0 and LOD1, one atlas material, GLB export.
import bpy, bmesh, sys, os, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); C = HERE + '/cache'
ROOT = os.path.abspath(HERE + '/../..')
args = sys.argv[sys.argv.index('--') + 1:]
CID = args[0]
OUT = args[1]
LOD0 = int(args[2]) if len(args) > 2 else 8600
LOD1 = int(args[3]) if len(args) > 3 else 2600
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

d = np.load(C + f'/{CID}_ped.npz')
names = [str(n) for n in d['names']]
mat = D.materials.new('PedAtlas'); mat.use_nodes = True
nt = mat.node_tree; b = nt.nodes['Principled BSDF']
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = D.images.load(HERE + f'/tex/{CID}/atlas.jpg'); tex.image.name = f'{CID}_atlas.jpg'
nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
b.inputs['Roughness'].default_value = 0.78; b.inputs['Metallic'].default_value = 0.0


def mk(name):
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


objs = {n: mk(n) for n in names}
stats = {'src': {n: tris(o) for n, o in objs.items()}}
head = objs['head']; zt = zone_tris(head)
decimate_zones(head, [(3, 160 / max(zt.get(3, 1), 1)), (0, 900 / max(zt.get(0, 1), 1)), (1, 700 / max(zt.get(1, 1), 1)), (2, 260 / max(zt.get(2, 1), 1))])
for s in ('eyeL', 'eyeR'):
    decimate_zones(objs[s], [(-1, 64 / max(tris(objs[s]), 1))])
fixed = sum(tris(o) for n, o in objs.items() if n != 'body')
body_budget = max(2600, LOD0 - fixed)
bz = zone_tris(objs['body'])
hand_t = min(bz.get(1, 0), int(body_budget * 0.13))
decimate_zones(objs['body'], [(1, hand_t / max(bz.get(1, 1), 1)), (0, (body_budget - hand_t) / max(bz.get(0, 1), 1))])
stats['lod0'] = {n: tris(o) for n, o in objs.items()}
for o in objs.values():
    select_only(o)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
for o in O:
    o.select_set(o.type == 'MESH')
bpy.context.view_layer.objects.active = objs['body']
bpy.ops.object.join()
ped = bpy.context.view_layer.objects.active; ped.name = 'Ped'; ped.data.name = 'Ped'
select_only(ped)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0002); bpy.ops.object.mode_set(mode='OBJECT')
stats['LOD0'] = tris(ped)
lod1 = ped.copy(); lod1.data = ped.data.copy(); lod1.name = 'Ped_LOD1'; lod1.data.name = 'Ped_LOD1'; sc.collection.objects.link(lod1)
for m in lod1.modifiers:
    if m.type == 'ARMATURE':
        m.object = rig
select_only(lod1)
decimate_zones(lod1, [(-1, LOD1 / max(tris(lod1), 1))])
stats['LOD1'] = tris(lod1)
for o in (ped, lod1):
    o.data.attributes.remove(o.data.attributes['zone'])
    select_only(o)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
lod1.location = (0, 0, 0)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
for o in O:
    o.select_set(o.name in ('Jurek.Rig', 'Ped', 'Ped_LOD1'))
bpy.context.view_layer.objects.active = rig
kw = dict(filepath=OUT, use_selection=True, export_format='GLB', export_yup=True, export_apply=False, export_texcoords=True, export_normals=True,
          export_skins=True, export_all_influences=False, export_def_bones=False, export_morph=False, export_animations=False, export_extras=True,
          export_attributes=False, export_cameras=False, export_lights=False, export_image_format='JPEG', export_jpeg_quality=88)
try:
    bpy.ops.export_scene.gltf(**kw)
except TypeError:
    kw.pop('export_jpeg_quality', None); bpy.ops.export_scene.gltf(**kw)
json.dump(stats, open(C + f'/{CID}_ped_stats.json', 'w'), indent=1)
print('PED', CID, json.dumps(stats), os.path.getsize(OUT))
