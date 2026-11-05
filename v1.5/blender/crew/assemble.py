# Assemble one crew character in Blender from the numpy caches (Jurek.Rig v1, body cut, head LOD with morphs, eyes, hair, uniform) and export the game GLB.
import bpy, bmesh, sys, os, json, random
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
HERE = os.path.dirname(os.path.abspath(__file__)); C = HERE + '/cache'
ROOT = os.path.abspath(HERE + '/../..')
AVTEX = ROOT + '/blender/avatar/tex'
args = sys.argv[sys.argv.index('--') + 1:]
CID = args[0]
OUT = args[1] if len(args) > 1 else ROOT + f'/assets/avatar/{CID}.glb'
SAVE = args[2] if len(args) > 2 else HERE + f'/work/{CID}.blend'
TEX = HERE + f'/tex/{CID}'
KEEP = ['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen', 'mouthSmileLeft', 'mouthSmileRight', 'corr_eyeBlinkArcLeft', 'corr_eyeBlinkArcRight',
        'mouthClose', 'browInnerUp', 'browDownLeft', 'browDownRight', 'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight',
        'mouthFunnel', 'mouthPucker', 'cheekSquintLeft', 'cheekSquintRight']
INFO = json.load(open(C + f'/{CID}_info.json')) if os.path.exists(C + f'/{CID}_info.json') else {}
sys.path.insert(0, HERE)
from design import CREW
S = float(CREW[CID]['s'])
bpy.ops.wm.read_factory_settings(use_empty=True)
D = bpy.data; O = D.objects
sc = bpy.context.scene
stats = {}


def npz(n):
    return dict(np.load(C + '/' + n + '.npz', allow_pickle=False))


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def select_only(o):
    for x in bpy.context.view_layer.objects:
        x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o


with D.libraries.load(ROOT + '/blender/avatar/src/rt_anim.blend', link=False) as (src, dst):
    dst.objects = ['Jurek.Rig']
rig = dst.objects[0]
sc.collection.objects.link(rig)
rig.animation_data_clear()
rig.data.pose_position = 'REST'
for pb in rig.pose.bones:
    pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
for c in list(rig.constraints):
    rig.constraints.remove(c)
for pb in rig.pose.bones:
    for c in list(pb.constraints):
        pb.constraints.remove(c)
bpy.context.view_layer.objects.active = rig; rig.select_set(True)
rig.scale = (S, S, S)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
BONES = [b.name for b in rig.data.bones]
RIGN = [str(n) for n in npz('rig')['names']]


def mk(name, V, loops, ls, lt, mi=None, mats=('M',), uv=None, W=None, parent_rig=True, smooth=True):
    me = D.meshes.new(name)
    V = np.asarray(V, float) * S
    me.vertices.add(len(V)); me.vertices.foreach_set('co', V.ravel())
    me.loops.add(len(loops)); me.loops.foreach_set('vertex_index', np.asarray(loops, np.int32))
    me.polygons.add(len(ls)); me.polygons.foreach_set('loop_start', np.asarray(ls, np.int32)); me.polygons.foreach_set('loop_total', np.asarray(lt, np.int32))
    me.update(calc_edges=True)
    for m in mats:
        mm = D.materials.get(m) or D.materials.new(m)
        me.materials.append(mm)
    if mi is not None:
        me.polygons.foreach_set('material_index', np.asarray(mi, np.int32))
    if uv is not None:
        ul = me.uv_layers.new(name='UVMap'); ul.data.foreach_set('uv', np.asarray(uv, float).ravel())
    me.polygons.foreach_set('use_smooth', np.ones(len(ls), bool))
    me.validate(clean_customdata=False); me.update()
    o = D.objects.new(name, me); sc.collection.objects.link(o)
    if parent_rig:
        o.parent = rig
    if W is not None:
        W = np.asarray(W, float)
        idx = np.argsort(-W, 1)[:, :4]; ww = np.take_along_axis(W, idx, 1); ww = np.where(ww < 1e-4, 0, ww); ww /= np.maximum(ww.sum(1, keepdims=True), 1e-9)
        groups = {}
        for vi in range(len(V)):
            for j in range(4):
                if ww[vi, j] > 0:
                    bn = RIGN[idx[vi, j]]
                    g = groups.get(bn)
                    if g is None:
                        g = o.vertex_groups.new(name=bn); groups[bn] = g
                    g.add([vi], float(ww[vi, j]), 'REPLACE')
        am = o.modifiers.new('Armature', 'ARMATURE'); am.object = rig
    return o


def from_cache(name, V=None, mats=None, W=None, **kw):
    d = npz(name)
    m = mats if mats is not None else [str(x) for x in d['mats']]
    return mk(kw.pop('oname', name), d['co'] if V is None else V, d['loops'], d['ls'], d['lt'], d['mi'], m, d.get('uv'), d['W'] if W is None else W, **kw)


def add_keys(o, base, keys, names):
    o.shape_key_add(name='Basis', from_mix=False)
    for k, nm in zip(keys, names):
        sk = o.shape_key_add(name=nm, from_mix=False)
        sk.data.foreach_set('co', (np.asarray(k, float) * S).ravel())


def capture_keys(o):
    me = o.data; kb = me.shape_keys.key_blocks; n = len(me.vertices)
    base = np.zeros(n * 3); kb['Basis'].data.foreach_get('co', base); base = base.reshape(-1, 3)
    ks = {}
    for k in kb[1:]:
        a = np.zeros(n * 3); k.data.foreach_get('co', a); ks[k.name] = a.reshape(-1, 3)
    me.calc_loop_triangles()
    T = np.array([[lt.vertices[0], lt.vertices[1], lt.vertices[2]] for lt in me.loop_triangles])
    return base, ks, T


def rebuild_keys(o, base, ks, T, order):
    me = o.data
    bvh = BVHTree.FromPolygons([tuple(v) for v in base.tolist()], [tuple(t) for t in T.tolist()], epsilon=0.0)
    P = np.array([v.co for v in me.vertices]); n = len(P)
    tri_i = np.zeros(n, int); bary = np.zeros((n, 3))
    for i, p in enumerate(P):
        loc, nor, idx, dist = bvh.find_nearest(Vector(p))
        a, b_, c = base[T[idx]]
        v0, v1, v2 = b_ - a, c - a, np.array(loc) - a
        d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
        den = d00 * d11 - d01 * d01
        if abs(den) < 1e-16:
            bb = np.array([1.0, 0, 0])
        else:
            bv = (d11 * d20 - d01 * d21) / den; bw = (d00 * d21 - d01 * d20) / den
            bb = np.clip(np.array([1 - bv - bw, bv, bw]), 0, 1); bb /= bb.sum()
        tri_i[i] = idx; bary[i] = bb
    if me.shape_keys:
        o.shape_key_clear()
    o.shape_key_add(name='Basis', from_mix=False)
    for k in order:
        arr = ks.get(k)
        dv = np.zeros((n, 3)) if arr is None else ((arr - base)[T[tri_i]] * bary[..., None]).sum(1)
        sk = o.shape_key_add(name=k, from_mix=False)
        sk.data.foreach_set('co', (P + dv).ravel())


def zone_decimate(o, zones):
    select_only(o)
    bpy.context.tool_settings.mesh_select_mode = (False, False, True)
    for pred, ratio in zones:
        bpy.ops.object.mode_set(mode='OBJECT')
        me = o.data
        P = np.array([v.co for v in me.vertices])
        sel = np.array([bool(pred(P[list(p.vertices)].mean(0), p.material_index)) for p in me.polygons])
        me.vertices.foreach_set('select', np.zeros(len(me.vertices), bool))
        me.edges.foreach_set('select', np.zeros(len(me.edges), bool))
        me.polygons.foreach_set('select', sel)
        sv = np.zeros(len(me.vertices), bool)
        for p in me.polygons:
            if p.select:
                sv[list(p.vertices)] = True
        me.vertices.foreach_set('select', sv)
        me.update()
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_mode(type='FACE')
        if ratio < 0.999 and sel.any():
            bpy.ops.mesh.decimate(ratio=ratio, use_symmetry=True, symmetry_axis='X')
        bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')


# ---------------- body: neck and hands only
cb = npz(f'{CID}_body')
sb = npz('src_body')
Vb = cb['body'] * S; reg = sb['region'].round().astype(int)
body = from_cache('src_body', V=cb['body'], mats=['BodySkin'], oname='Body')
wr = {s: np.array(rig.data.bones[s + 'Hand'].head_local) for s in ('Left', 'Right')}
bm = bmesh.new(); bm.from_mesh(body.data)
dead = []
for f in bm.faces:
    vs = [v.index for v in f.verts]
    keep = any(reg[i] in (1, 4) for i in vs)
    if not keep and all(reg[i] == 3 for i in vs):
        keep = min(min(np.linalg.norm(Vb[i] - wr['Left']), np.linalg.norm(Vb[i] - wr['Right'])) for i in vs) < 0.03
    if not keep:
        dead.append(f)
bmesh.ops.delete(bm, geom=dead, context='FACES')
bm.to_mesh(body.data); bm.free()
stats['Body'] = tris(body)

# ---------------- head: full-res warped head + morphs, zone LOD, lashes, brows, beard
ch = npz(f'{CID}_head')
sh = npz('src_head')
skn = [str(k) for k in sh['key_names']]
head = from_cache('src_head', V=ch['head'], mats=['Skin', 'Skin', 'Skin', 'Teeth', 'Gums', 'Tongue'], oname='Head')
add_keys(head, ch['head'], ch['keys'], skn)
eL, eR = ch['eyeL_c'] * S, ch['eyeR_c'] * S
mouth = np.array([0.0, (eL[1] + eR[1]) / 2 - 0.030 * S, eL[2] - 0.080 * S])
HEAD_RATIO = float(INFO.get('head_ratio', 0.16)); HEAD_RATIO2 = float(INFO.get('head_ratio2', 0.40))


def near_eye(c):
    return min(np.linalg.norm((c - eL) * [1, 0.8, 1.15]), np.linalg.norm((c - eR) * [1, 0.8, 1.15])) < 0.030 * S


def near_mouth(c):
    return np.linalg.norm((c - mouth) * [0.75, 0.9, 1.1]) < 0.036 * S


base, ks, T = capture_keys(head)
head.shape_key_clear()
zone_decimate(head, [
    (lambda c, m: m >= 3, 0.07),
    (lambda c, m: m < 3 and not near_eye(c) and not near_mouth(c) and (c[1] > eL[1] + 0.035 * S or c[2] < mouth[2] - 0.05 * S), HEAD_RATIO),
    (lambda c, m: m < 3 and not near_eye(c) and not near_mouth(c) and not (c[1] > eL[1] + 0.035 * S or c[2] < mouth[2] - 0.05 * S), HEAD_RATIO2),
])
rebuild_keys(head, base, ks, T, KEEP)
stats['Head_core'] = tris(head)

sl = npz('src_lashes')
lkn = [str(k) for k in sl['key_names']]
lashes = from_cache('src_lashes', V=ch['lashes'], mats=['Lashes', 'Wet_RT', 'Caruncle_RT'], oname='Lashes')
add_keys(lashes, ch['lashes'], ch['lkeys'], lkn)
lbase, lks, lT = capture_keys(lashes)
lashes.shape_key_clear()
bm = bmesh.new(); bm.from_mesh(lashes.data); bm.faces.ensure_lookup_table()
seen = set(); dead = []; rnd = random.Random(5)
keep_frac = float(INFO.get('lash_keep', 0.36))
for f in bm.faces:
    if f.index in seen:
        continue
    st = [f]; comp = []
    while st:
        x = st.pop()
        if x.index in seen:
            continue
        seen.add(x.index); comp.append(x)
        for e in x.edges:
            for g in e.link_faces:
                if g.index not in seen:
                    st.append(g)
    mat = comp[0].material_index
    if mat == 1 or (mat == 0 and rnd.random() > keep_frac):
        dead.extend(comp)
bmesh.ops.delete(bm, geom=list(set(dead)), context='FACES')
bm.to_mesh(lashes.data); bm.free()
zone_decimate(lashes, [(lambda c, m: True, 0.36)])
rebuild_keys(lashes, lbase, lks, lT, KEEP)
stats['Lashes'] = tris(lashes)

for o_ in (head, lashes):
    ca_ = o_.data.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT'); ca_.data.foreach_set('color', np.ones(len(o_.data.vertices) * 4))
extra_head = [lashes]
for part in ('brows', 'beard'):
    pth = C + f'/{CID}_{part}.npz'
    if not os.path.exists(pth):
        continue
    d = npz(f'{CID}_{part}')
    mats_ = [str(x) for x in d['mats']] if 'mats' in d else ['Brow' if part == 'brows' else 'Beard']
    o = mk(part.capitalize(), d['co'], d['loops'], d['ls'], d['lt'], d.get('mi'), mats_, d['uv'], None)
    if 'col' in d:
        ca = o.data.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT'); ca.data.foreach_set('color', np.asarray(d['col'], float).ravel())
    o.shape_key_add(name='Basis', from_mix=False)
    for k, nm in zip(d['keys'], [str(x) for x in d['key_names']]):
        sk = o.shape_key_add(name=nm, from_mix=False); sk.data.foreach_set('co', (np.asarray(k, float) * S).ravel())
    vg = o.vertex_groups.new(name='Head'); vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    if 'wjaw' in d:
        wj = d['wjaw']; vj = o.vertex_groups.new(name='Jaw')
        for i, w in enumerate(wj):
            if w > 1e-3:
                vj.add([i], float(w), 'REPLACE'); vg.add([i], float(1 - w), 'REPLACE')
    am = o.modifiers.new('Armature', 'ARMATURE'); am.object = rig
    stats[part] = tris(o)
    extra_head.append(o)
for o in extra_head:
    for g in list(o.vertex_groups):
        if g.name not in BONES:
            o.vertex_groups.remove(g)
select_only(head)
for o in extra_head:
    o.select_set(True)
bpy.ops.object.join()
head = bpy.context.view_layer.objects.active; head.name = 'Head'; head.data.name = 'Head'
stats['Head'] = tris(head)

# ---------------- eyes: LOD globes re-seated, children of the eye joints
for s_, bn in (('L', 'LeftEye'), ('R', 'RightEye')):
    o = from_cache('gb_Eye' + s_, V=ch['eye' + s_], mats=['Eye' + s_, 'EyeCornea_RT'], oname='Eye' + s_, W=np.zeros((len(ch['eye' + s_]), len(RIGN))))
    for m in list(o.modifiers):
        o.modifiers.remove(m)
    c = ch['eye' + s_ + '_c'] * S
    me = o.data
    me.transform(Matrix.Translation(Vector(-c)))
    o.parent = rig; o.parent_type = 'BONE'; o.parent_bone = bn
    bpy.context.view_layer.update()
    o.matrix_world = Matrix.Translation(Vector(c))
    o['role'] = 'face'
    stats['Eye' + s_] = tris(o)

# ---------------- hair
if os.path.exists(C + f'/{CID}_hair.npz'):
    d = npz(f'{CID}_hair')
    mats = [str(x) for x in d['mats']]
    o = mk('Hair', d['co'], d['loops'], d['ls'], d['lt'], d['mi'], mats, d['uv'], None)
    if 'col' in d:
        ca = o.data.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT'); ca.data.foreach_set('color', np.asarray(d['col'], float).ravel())
    vg = o.vertex_groups.new(name='Head'); vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    am = o.modifiers.new('Armature', 'ARMATURE'); am.object = rig
    stats['Hair'] = tris(o)

# ---------------- glasses
if os.path.exists(C + f'/{CID}_glasses.npz'):
    d = npz(f'{CID}_glasses')
    o = mk('Glasses', d['co'], d['loops'], d['ls'], d['lt'], d['mi'], [str(x) for x in d['mats']], d['uv'], None)
    vg = o.vertex_groups.new(name='Head'); vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    am = o.modifiers.new('Armature', 'ARMATURE'); am.object = rig
    stats['Glasses'] = tris(o)

# ---------------- uniform
for g in ('Suit', 'Boots', 'Belt', 'NameTag', 'Patch', 'Harness'):
    d = npz('gb_' + g)
    o = from_cache('gb_' + g, V=cb[g], mats=[str(x) for x in d['mats']], oname=g)
    props = json.loads(str(d['props']))
    for k, v in props.items():
        o[k] = (v == 'True') if v in ('True', 'False') else v
    stats[g] = tris(o)
O['Harness']['hiddenByDefault'] = True
for o in O:
    if o.type == 'MESH':
        o['role'] = {'Body': 'body', 'Head': 'face', 'EyeL': 'face', 'EyeR': 'face', 'Hair': 'hair', 'Glasses': 'face'}.get(o.name, 'garment')
        select_only(o)
        if o.vertex_groups:
            bpy.ops.object.vertex_group_limit_total(limit=4)
            bpy.ops.object.vertex_group_normalize_all(lock_active=False)

# ---------------- materials
exec(open(HERE + '/materials.py').read())
build_materials(CID, TEX, AVTEX)

stats['total'] = sum(tris(o) for o in O if o.type == 'MESH')
os.makedirs(os.path.dirname(SAVE), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=SAVE)

# ---------------- export
for o in O:
    o.select_set(o.name in ('Jurek.Rig', 'Body', 'Head', 'EyeL', 'EyeR', 'Hair', 'Glasses', 'Suit', 'Boots', 'Belt', 'NameTag', 'Patch', 'Harness'))
bpy.context.view_layer.objects.active = rig
kw = dict(filepath=OUT, use_selection=True, export_format='GLB', export_yup=True, export_apply=False, export_texcoords=True, export_normals=True,
          export_skins=True, export_all_influences=False, export_def_bones=False, export_morph=True, export_morph_normal=False, export_try_sparse_sk=True,
          export_animations=False, export_extras=True, export_attributes=False, export_cameras=False, export_lights=False, export_image_format='AUTO')
try:
    bpy.ops.export_scene.gltf(**kw, export_vertex_color='MATERIAL')
except TypeError:
    bpy.ops.export_scene.gltf(**kw)
json.dump(stats, open(C + f'/{CID}_stats.json', 'w'), indent=1)
import glbpatch
rep = glbpatch.patch(OUT, 1.0, dict(crew=CID, name=CREW[CID]['name'], rigScale=S), ROOT + '/assets/avatar/jurek_gb.glb')
clips = glbpatch.embed_clips(OUT, ROOT + '/assets/avatar/jurek_gb.glb', S)
print('PATCH', json.dumps(rep), json.dumps(clips))
print('ASSEMBLED', CID, json.dumps(stats), os.path.getsize(OUT))
