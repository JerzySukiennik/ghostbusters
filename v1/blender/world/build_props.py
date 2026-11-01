# Ghostbusters plate: imports CC0 Poly Haven props, decimates them, recentres origins and exports assets/world/props.glb.
import bpy, bmesh, os, sys, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC = argv[0]
OUT = argv[1]
TEX = int(argv[2]) if len(argv) > 2 else 512

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def import_gltf(name):
    folder = os.path.join(SRC, name)
    f = [x for x in os.listdir(folder) if x.endswith('.gltf')][0]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(folder, f))
    return [o for o in bpy.data.objects if o not in before]

def apply_all(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o

def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

def decimate(o, target):
    t = tris(o)
    if t <= target:
        return
    m = o.modifiers.new('dec', 'DECIMATE')
    m.decimate_type = 'COLLAPSE'
    m.ratio = max(0.01, target / t)
    m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)

def ground_origin(o, center_xy=True):
    apply_all(o)
    xs = [v.co.x for v in o.data.vertices]; ys = [v.co.y for v in o.data.vertices]; zs = [v.co.z for v in o.data.vertices]
    cx = (min(xs) + max(xs)) / 2 if center_xy else 0
    cy = (min(ys) + max(ys)) / 2 if center_xy else 0
    off = Vector((cx, cy, min(zs)))
    for v in o.data.vertices:
        v.co -= off
    o.location = (0, 0, 0)
    return off

def fix_images(o):
    for slot in o.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        for n in mat.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                img = n.image
                is_normal = any(l.to_node.type == 'NORMAL_MAP' for l in n.outputs['Color'].links)
                if img.size[0] > TEX:
                    img.scale(TEX, TEX)
                img.file_format = 'PNG' if is_normal else 'JPEG'

def keep(objs, names):
    out = []
    for o in objs:
        if o.name in names:
            out.append(o)
        else:
            bpy.data.objects.remove(o, do_unlink=True)
    return out

reset()
final = []

objs = import_gltf('metal_trash_can')
byname = {o.name: o for o in objs}
for o in objs:
    if o.type == 'MESH':
        o.rotation_mode = 'XYZ'
lid = byname['metal_trash_can_lid']
body_parts = [byname['metal_trash_can'], byname['metal_trash_can_handle_left'], byname['metal_trash_can_handle_right']]
for o in objs:
    if o not in body_parts and o is not lid:
        bpy.data.objects.remove(o, do_unlink=True)
for o in body_parts:
    apply_all(o)
body = join(body_parts, 'TrashCan')
decimate(body, 1400)
ground_origin(body)
lid.parent = None
lid.rotation_euler = (0, 0, 0)
lid.rotation_quaternion = (1, 0, 0, 0)
apply_all(lid)
lid.name = 'TrashLid'; lid.data.name = 'TrashLid'
decimate(lid, 520)
ground_origin(lid)
final += [body, lid]

objs = import_gltf('fire_hydrant')
byname = {o.name: o for o in objs}
cap = byname['fire_hydrant_cap_01']
parts = [byname['fire_hydrant'], byname['fire_hydrant_cap_02'], byname['fire_hydrant_cap_03']]
chain = byname['fire_hydrant_chain']
for o in objs:
    if o not in parts and o is not cap and o is not chain:
        bpy.data.objects.remove(o, do_unlink=True)
for o in parts + [cap, chain]:
    apply_all(o)
decimate(chain, 260)
decimate(parts[0], 2200)
decimate(parts[1], 160)
decimate(parts[2], 160)
hyd = join(parts + [chain], 'Hydrant')
decimate(cap, 260)
cap.name = 'HydrantCap'; cap.data.name = 'HydrantCap'
off = ground_origin(hyd)
for v in cap.data.vertices:
    v.co -= off
cap.location = (0, 0, 0)
final += [hyd, cap]

for src, name, target in (('cardboard_box_01', 'CardboardBox', 700), ('trashbag', 'TrashBag', 900), ('barrel_03', 'Barrel', 1500), ('water_manhole_cover', 'Manhole', 500)):
    objs = import_gltf(src)
    meshes = [o for o in objs if o.type == 'MESH']
    for o in objs:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    for o in meshes:
        apply_all(o)
    o = join(meshes, name)
    decimate(o, target)
    ground_origin(o)
    final.append(o)

for o in final:
    o.location = (0, 0, 0)
    fix_images(o)
    for slot in o.material_slots:
        if slot.material:
            slot.material.name = o.name + 'Mat' if o.name not in ('TrashLid', 'HydrantCap') else slot.material.name

for o in final:
    print('OBJ', o.name, 'tris', tris(o), 'dims', tuple(round(d, 3) for d in o.dimensions), 'mats', [s.material.name for s in o.material_slots if s.material])

bpy.ops.object.select_all(action='DESELECT')
for o in final:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_image_format='AUTO', export_jpeg_quality=85, export_cameras=False, export_lights=False,
                          export_extras=False, export_animations=False)
print('EXPORTED', OUT, os.path.getsize(OUT))
