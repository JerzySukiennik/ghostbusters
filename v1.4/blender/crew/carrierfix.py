# Moves each crew don_pack PackCarrier so the clip ends exactly on that character's packWorn pose (offset kept in Spine2 space, blended in between the lift and strapR events).
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbpatch import read_glb, write_glb, accessor

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
AV = ROOT + '/assets/avatar'
CHAIN = ['Hips', 'Spine', 'Spine1', 'Spine2']


def qmul(a, b):
    x1, y1, z1, w1 = np.moveaxis(a, -1, 0); x2, y2, z2, w2 = np.moveaxis(b, -1, 0)
    return np.stack([w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
                     w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2], -1)


def qrot(q, v):
    u = q[..., :3]; w = q[..., 3:4]
    return v + 2 * np.cross(u, np.cross(u, v) + w * v)


def track(j, b, anim, node, path, times):
    for ch in anim['channels']:
        if j['nodes'][ch['target']['node']]['name'] == node and ch['target']['path'] == path:
            sm = anim['samplers'][ch['sampler']]
            t = accessor(j, b, sm['input'])[:, 0]; o = accessor(j, b, sm['output']).astype(np.float64)
            return np.stack([np.interp(times, t, o[:, k]) for k in range(o.shape[1])], 1)
    return None


def fix(cid, worn, ev):
    path = AV + f'/{cid}.glb'
    j, b = read_glb(path)
    b = bytearray(b)
    nodes = {n['name']: n for n in j['nodes']}
    anim = next(a for a in j['animations'] if a['name'] == 'don_pack')
    ch = next(c for c in anim['channels'] if j['nodes'][c['target']['node']]['name'] == 'PackCarrier' and c['target']['path'] == 'translation')
    sm = anim['samplers'][ch['sampler']]
    times = accessor(j, b, sm['input'])[:, 0].astype(np.float64)
    pos = accessor(j, b, sm['output']).astype(np.float64)
    P = np.zeros((len(times), 3)); Q = np.tile([0.0, 0, 0, 1], (len(times), 1))
    for name in CHAIN:
        n = nodes[name]
        tr = track(j, b, anim, name, 'translation', times)
        tr = tr if tr is not None else np.tile(n.get('translation', [0, 0, 0]), (len(times), 1))
        rq = track(j, b, anim, name, 'rotation', times)
        rq = rq if rq is not None else np.tile(n.get('rotation', [0, 0, 0, 1]), (len(times), 1))
        rq /= np.linalg.norm(rq, axis=1, keepdims=True)
        P = P + qrot(Q, tr); Q = qmul(Q, rq)
    inv = Q * np.array([-1, -1, -1, 1])
    local_end = qrot(inv[-1:], (pos[-1:] - P[-1:]))[0]
    d_local = np.asarray(worn, float) - local_end
    w = np.clip((times - ev['lift']) / max(ev['strapR'] - ev['lift'], 1e-3), 0, 1)
    w = w * w * (3 - 2 * w)
    new = pos + w[:, None] * qrot(Q, np.tile(d_local, (len(times), 1)))
    acc = j['accessors'][sm['output']]; bv = j['bufferViews'][acc['bufferView']]
    off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    data = new.astype(np.float32).tobytes()
    b[off:off + len(data)] = data
    write_glb(path, j, bytes(b))
    check = qrot(inv[-1:], (new[-1:] - P[-1:]))[0]
    return dict(shift_mm=round(float(np.linalg.norm(d_local)) * 1000, 1), end_err_mm=round(float(np.linalg.norm(check - worn)) * 1000, 2))


if __name__ == '__main__':
    crew = json.load(open(AV + '/crew.json'))['characters']
    ev = json.load(open(AV + '/avatar.json'))['events']['don_pack']
    out = {cid: fix(cid, c['packWorn']['position'], ev) for cid, c in crew.items()}
    print('CARRIERFIX', json.dumps(out))
