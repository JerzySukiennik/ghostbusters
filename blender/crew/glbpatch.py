# Patch a crew GLB in place: uniform rig scale on the Jurek.Rig node, scene/node extras; verify joints and inverse bind matrices against jurek_gb.glb.
import json, struct, sys, os
import numpy as np


def read_glb(path):
    b = open(path, 'rb').read()
    magic, ver, total = struct.unpack('<III', b[:12])
    L, T = struct.unpack('<II', b[12:20])
    j = json.loads(b[20:20 + L])
    rest = b[20 + L:]
    bl, bt = struct.unpack('<II', rest[:8])
    return j, rest[8:8 + bl]


def write_glb(path, j, binc):
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    binc += b'\0' * ((4 - len(binc) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(binc)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(binc), 0x004E4942)); f.write(binc)


def accessor(j, binc, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a['componentType']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    cnt = a['count'] * n
    return np.frombuffer(binc, dtype=dt, count=cnt, offset=off).reshape(a['count'], n)


def joints(j, binc):
    sk = j['skins'][0]
    names = [j['nodes'][i]['name'] for i in sk['joints']]
    ibm = accessor(j, binc, sk['inverseBindMatrices'])
    trs = {j['nodes'][i]['name']: (j['nodes'][i].get('translation', [0, 0, 0]), j['nodes'][i].get('rotation', [0, 0, 0, 1])) for i in sk['joints']}
    return names, ibm, trs


def _append(j, binc, arr, comp, typ, minmax=False):
    arr = np.ascontiguousarray(arr)
    pad = (4 - len(binc) % 4) % 4
    binc = binc + b'\0' * pad
    off = len(binc); data = arr.tobytes(); binc = binc + data
    j['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[typ]
    acc = {'bufferView': len(j['bufferViews']) - 1, 'componentType': comp, 'count': int(arr.size // n), 'type': typ}
    if minmax:
        a2 = arr.reshape(-1, n); acc['min'] = a2.min(0).tolist(); acc['max'] = a2.max(0).tolist()
    j['accessors'].append(acc)
    return len(j['accessors']) - 1, binc


def embed_clips(path, ref, s):
    j, binc = read_glb(path)
    jr, br = read_glb(ref)
    byname = {}
    for i, n in enumerate(j['nodes']):
        key = (n['name'], 'mesh' in n)
        byname.setdefault(key, i)
    rn = jr['nodes']
    scene = j['scenes'][0]
    for cname in ('PackCarrier', 'WandCarrier', 'TrapCarrier'):
        src = next((n for n in rn if n['name'] == cname), None)
        if src is None or (cname, False) in byname:
            continue
        nd = {'name': cname}
        if 'translation' in src:
            nd['translation'] = [v * s for v in src['translation']]
        if 'rotation' in src:
            nd['rotation'] = src['rotation']
        j['nodes'].append(nd); byname[(cname, False)] = len(j['nodes']) - 1
        scene['nodes'].append(len(j['nodes']) - 1)
    head_r = next(i for i, n in enumerate(rn) if n['name'] == 'Head' and 'mesh' in n)
    tn_r = jr['meshes'][rn[head_r]['mesh']].get('extras', {}).get('targetNames', [])
    head_c = byname[('Head', True)]
    tn_c = j['meshes'][j['nodes'][head_c]['mesh']].get('extras', {}).get('targetNames', [])
    perm = [tn_r.index(t) if t in tn_r else -1 for t in tn_c]
    j.setdefault('animations', [])
    j['animations'] = [a for a in j['animations'] if a['name'] not in [x['name'] for x in jr['animations']]]
    in_map = {}
    stats = {}
    for a in jr['animations']:
        na = {'name': a['name'], 'channels': [], 'samplers': []}
        for ch in a['channels']:
            sm = a['samplers'][ch['sampler']]
            node = rn[ch['target']['node']]; path_ = ch['target']['path']
            if path_ == 'scale':
                continue
            out = accessor(jr, br, sm['output']).astype(np.float32)
            if path_ == 'translation':
                if node['name'] not in ('Hips',) and not node['name'].endswith('Carrier'):
                    rest = np.array(node.get('translation', [0, 0, 0]))
                    if np.abs(out - rest).max() < 1e-5:
                        continue
                out = out * s
            key = (node['name'], 'mesh' in node)
            if key not in byname:
                continue
            tgt = byname[key]
            if path_ == 'weights':
                nt = len(tn_r)
                o2 = out.reshape(-1, nt)
                out = np.stack([o2[:, k] if k >= 0 else np.zeros(len(o2), np.float32) for k in perm], 1).astype(np.float32)
            if sm['input'] not in in_map:
                tin = accessor(jr, br, sm['input']).astype(np.float32)
                ai, binc = _append(j, binc, tin, 5126, 'SCALAR', minmax=True)
                in_map[sm['input']] = ai
            typ = {'translation': 'VEC3', 'rotation': 'VEC4', 'weights': 'SCALAR'}[path_]
            ao, binc = _append(j, binc, out.ravel() if typ == 'SCALAR' else out, 5126, typ)
            na['samplers'].append({'input': in_map[sm['input']], 'output': ao, 'interpolation': sm.get('interpolation', 'LINEAR')})
            na['channels'].append({'sampler': len(na['samplers']) - 1, 'target': {'node': tgt, 'path': path_}})
        j['animations'].append(na)
        stats[a['name']] = len(na['channels'])
    j['buffers'][0]['byteLength'] = len(binc) + (4 - len(binc) % 4) % 4
    write_glb(path, j, binc)
    return stats


def patch(path, scale, extras, ref=None):
    j, binc = read_glb(path)
    rig = next(i for i, n in enumerate(j['nodes']) if n['name'] == 'Jurek.Rig')
    if abs(scale - 1) > 1e-9:
        j['nodes'][rig]['scale'] = [scale, scale, scale]
    j['scenes'][0]['extras'] = extras
    write_glb(path, j, binc)
    rep = {}
    if ref and os.path.exists(ref):
        jr, br = read_glb(ref)
        n1, i1, t1 = joints(j, binc); n2, i2, t2 = joints(jr, br)
        rep['same_joint_order'] = n1 == n2
        m = {n: k for k, n in enumerate(n2)}
        rep['ibm_rot_max_diff'] = float(max(np.abs(i1[k].reshape(4, 4)[:3, :3] - i2[m[n]].reshape(4, 4)[:3, :3]).max() for k, n in enumerate(n1)))
        rep['rot_max_diff'] = float(max(min(np.abs(np.array(t1[n][1]) - np.array(t2[n][1])).max(), np.abs(np.array(t1[n][1]) + np.array(t2[n][1])).max()) for n in n1))
        ratios = [np.linalg.norm(t1[n][0]) / np.linalg.norm(t2[n][0]) for n in n1 if np.linalg.norm(t2[n][0]) > 1e-4]
        rep['trans_ratio_min'] = float(min(ratios)); rep['trans_ratio_max'] = float(max(ratios))
        rep['dir_max_diff'] = float(max(np.abs(np.array(t1[n][0]) / max(np.linalg.norm(t1[n][0]), 1e-9) - np.array(t2[n][0]) / max(np.linalg.norm(t2[n][0]), 1e-9)).max() for n in n1 if np.linalg.norm(t2[n][0]) > 1e-4))
        rep['parents_equal'] = parents(j) == parents(jr)
    return rep


def parents(j):
    p = {}
    for i, n in enumerate(j['nodes']):
        for c in n.get('children', []):
            p[j['nodes'][c]['name']] = n['name']
    sk = set(j['nodes'][i]['name'] for i in j['skins'][0]['joints'])
    return {k: v for k, v in p.items() if k in sk}


if __name__ == '__main__':
    path, scale = sys.argv[1], float(sys.argv[2])
    ex = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
    ref = sys.argv[4] if len(sys.argv) > 4 else None
    print(json.dumps(patch(path, scale, ex, ref)))
