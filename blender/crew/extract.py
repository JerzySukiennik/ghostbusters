# Dump Jurek's rest-pose source data (rig, full body, full head with morphs, lashes, brows, eyes, game-LOD garments) into blender/crew/cache.
import bpy, numpy as np, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = HERE + '/cache'
os.makedirs(OUT, exist_ok=True)
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
MODE = args[0] if args else 'rt'
KEEP = ['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen', 'mouthSmileLeft', 'mouthSmileRight', 'corr_eyeBlinkArcLeft', 'corr_eyeBlinkArcRight',
        'mouthClose', 'browInnerUp', 'browDownLeft', 'browDownRight', 'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight',
        'mouthFunnel', 'mouthPucker', 'cheekSquintLeft', 'cheekSquintRight']
O = bpy.data.objects
rig = next(o for o in O if o.type == 'ARMATURE')
rig.data.pose_position = 'REST'
for o in O:
    if o.animation_data:
        o.animation_data.action = None
bpy.context.view_layer.update()
bones = [b.name for b in rig.data.bones]
bi = {n: i for i, n in enumerate(bones)}


def dump(o, name, keys=False):
    me = o.data
    n = len(me.vertices)
    mw = np.array(o.matrix_world)
    co = np.zeros(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    co = co @ mw[:3, :3].T + mw[:3, 3]
    loops = np.zeros(len(me.loops), dtype=np.int64); me.loops.foreach_get('vertex_index', loops)
    ls = np.zeros(len(me.polygons), dtype=np.int64); me.polygons.foreach_get('loop_start', ls)
    lt = np.zeros(len(me.polygons), dtype=np.int64); me.polygons.foreach_get('loop_total', lt)
    mi = np.zeros(len(me.polygons), dtype=np.int64); me.polygons.foreach_get('material_index', mi)
    d = dict(co=co, loops=loops, ls=ls, lt=lt, mi=mi, mw=mw)
    if me.uv_layers:
        uv = np.zeros(len(me.loops) * 2); me.uv_layers[0].data.foreach_get('uv', uv); d['uv'] = uv.reshape(-1, 2)
    for an in ('_REGION', '_HEADVERT'):
        if an in me.attributes and me.attributes[an].domain == 'POINT':
            r = np.zeros(n); me.attributes[an].data.foreach_get('value', r); d[an.strip('_').lower()] = r
    gn = [g.name for g in o.vertex_groups]
    W = np.zeros((n, len(bones)), dtype=np.float32)
    for v in me.vertices:
        for g in v.groups:
            if gn[g.group] in bi:
                W[v.index, bi[gn[g.group]]] = g.weight
    d['W'] = W
    if keys and me.shape_keys:
        kb = me.shape_keys.key_blocks
        names = [k for k in KEEP if k in kb]
        arr = []
        for k in names:
            a = np.zeros(n * 3); kb[k].data.foreach_get('co', a); arr.append(a.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3])
        base = np.zeros(n * 3); kb[0].data.foreach_get('co', base); d['co'] = base.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
        d['keys'] = np.array(arr) if arr else np.zeros((0, n, 3)); d['key_names'] = np.array(names)
    d['mats'] = np.array([m.name if m else '' for m in me.materials])
    d['props'] = np.array(json.dumps({k: str(o[k])[:200] for k in o.keys() if k not in ('expression_presets',)}))
    d['parent_bone'] = np.array(o.parent_bone if o.parent_type == 'BONE' else '')
    np.savez_compressed(OUT + f'/{name}.npz', **d)
    print('dumped', name, n, len(me.polygons))


if MODE == 'rt':
    np.savez(OUT + '/rig.npz', names=np.array(bones), rest=np.array([np.array(b.matrix_local) for b in rig.data.bones]),
             heads=np.array([list(b.head_local) for b in rig.data.bones]), tails=np.array([list(b.tail_local) for b in rig.data.bones]),
             parents=np.array([bi[b.parent.name] if b.parent else -1 for b in rig.data.bones]),
             rolls=np.array([0.0 for b in rig.data.bones]))
    dump(O['Body'], 'src_body')
    dump(O['Head'], 'src_head', keys=True)
    dump(O['Lashes'], 'src_lashes', keys=True)
    dump(O['Eyebrow.Strands.L'], 'src_browL', keys=True)
    dump(O['Eyebrow.Strands.R'], 'src_browR', keys=True)
    dump(O['Eye.L'], 'src_eyeL')
    dump(O['Eye.R'], 'src_eyeR')
else:
    for n in ('Suit', 'Boots', 'Belt', 'NameTag', 'Patch', 'Harness', 'Body', 'EyeL', 'EyeR', 'Head', 'Hair'):
        if n in O:
            dump(O[n], 'gb_' + n, keys=(n == 'Head'))
    imgs = {i.name: i.filepath for i in bpy.data.images}
    mats = {}
    for m in bpy.data.materials:
        if m.use_nodes:
            b = next((x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'), None)
            mats[m.name] = dict(images=[x.image.filepath for x in m.node_tree.nodes if x.type == 'TEX_IMAGE' and x.image],
                                base=list(b.inputs['Base Color'].default_value) if b else None,
                                rough=b.inputs['Roughness'].default_value if b else None,
                                metal=b.inputs['Metallic'].default_value if b else None,
                                blend=getattr(m, 'blend_method', ''), cull=m.use_backface_culling)
    json.dump(dict(images=imgs, materials=mats), open(OUT + '/gb_materials.json', 'w'), indent=1)
print('EXTRACT DONE', MODE)
