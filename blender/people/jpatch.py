# Adds Janine's baked clips (bone rotations, Hips, handset, morph weights) to the base GLB, places her desk phone, writes assets/people/janine.glb + janine.json.
import json, struct, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(HERE + '/../..')
SRC = HERE + '/work/janine_base.glb'
CLIPS = HERE + '/work/janine_clips.json'
OUT = ROOT + '/assets/people/janine.glb'
META = ROOT + '/assets/people/janine.json'


def read_glb(p):
    b = open(p, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    o = 20 + jl
    bl = struct.unpack('<I', b[o:o + 4])[0]
    return j, bytearray(b[o + 8:o + 8 + bl])


def write_glb(p, j, bin_):
    while len(bin_) % 4:
        bin_ += b'\0'
    j['buffers'][0]['byteLength'] = len(bin_)
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
    open(p, 'wb').write(out)


def yaw_q(a):
    return [0.0, math.sin(a / 2), 0.0, math.cos(a / 2)]


def rot(q, v):
    x, y, z, w = q
    u = np.array([x, y, z]); v = np.array(v, float)
    return v + 2 * np.cross(u, np.cross(u, v) + w * v)


def main():
    j, bin_ = read_glb(SRC)
    c = json.load(open(CLIPS))
    nodes = {n['name']: i for i, n in enumerate(j['nodes'])}
    j.setdefault('animations', [])
    acc = j['accessors']; bv = j['bufferViews']

    def add(arr, typ, minmax=False):
        nonlocal bin_
        a = np.asarray(arr, np.float32).ravel()
        while len(bin_) % 4:
            bin_ += b'\0'
        off = len(bin_)
        bin_ += a.tobytes()
        bv.append({'buffer': 0, 'byteOffset': off, 'byteLength': a.nbytes})
        comps = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[typ]
        d = {'bufferView': len(bv) - 1, 'componentType': 5126, 'count': len(a) // comps, 'type': typ}
        if minmax:
            d['min'] = [float(a.min())]; d['max'] = [float(a.max())]
        acc.append(d)
        return len(acc) - 1

    ph = c['phone']; pq = yaw_q(ph['yaw'])
    j['nodes'][nodes['JaninePhone']]['translation'] = [float(v) for v in ph['pos']]
    j['nodes'][nodes['JaninePhone']]['rotation'] = pq
    hp = np.array(ph['pos']) + rot(pq, c['handsetLocal'])
    j['nodes'][nodes['JanineHandset']]['translation'] = [float(v) for v in hp]
    j['nodes'][nodes['JanineHandset']]['rotation'] = pq
    nm = len(c['morphs'])
    clips = {}
    for cl in c['clips']:
        n = len(cl['times'])
        t_in = add(cl['times'], 'SCALAR', True)
        t2 = add([0.0, cl['dur']], 'SCALAR', True)
        samplers, channels = [], []

        def ch(node, path, out, inp):
            samplers.append({'input': inp, 'output': out, 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': node, 'path': path}})
        for b, q in cl['bones'].items():
            if b not in nodes:
                continue
            if len(q) == 4:
                ch(nodes[b], 'rotation', add(q + q, 'VEC4'), t2)
            else:
                ch(nodes[b], 'rotation', add(q, 'VEC4'), t_in)
        ch(nodes['Hips'], 'translation', add(cl['hips'], 'VEC3'), t_in)
        ch(nodes['JanineHandset'], 'translation', add(cl['handset']['p'], 'VEC3'), t_in)
        ch(nodes['JanineHandset'], 'rotation', add(cl['handset']['q'], 'VEC4'), t_in)
        ch(nodes['JanineHead'], 'weights', add(cl['morph'], 'SCALAR'), t_in)
        assert len(cl['morph']) == n * nm
        j['animations'].append({'name': cl['name'], 'samplers': samplers, 'channels': channels})
        clips[cl['name']] = {'dur': cl['dur'], 'loop': cl['loop']}
    write_glb(OUT, j, bin_)
    stats = json.load(open(HERE + '/cache/janine_stats.json'))
    meta = {
        'version': 1, 'file': 'janine.glb', 'name': 'Janine Melnitz', 'scale': c['scale'],
        'nodes': {'root': 'Janine', 'rig': 'JurekRig', 'body': 'JanineBody', 'head': 'JanineHead', 'lens': 'JanineLens', 'phone': 'JaninePhone', 'handset': 'JanineHandset'},
        'anchor': 'root = JanineSeat: seat surface centre, +Z toward the desk; her hips sit 5 cm behind it',
        'seat': c['seat'],
        'desk': dict(c['desk'], note='desk top height and front edge above / ahead of JanineSeat; keyboard and monitor centres; the phone is hers (JaninePhone + JanineHandset), leave that desk spot free'),
        'phone': ph,
        'clips': clips,
        'oneShots': {'phone_answer': 'ends in the phone_talk pose with the handset at her ear; continue with phone_talk', 'call_out': 'starts and ends in the desk_idle pose'},
        'morphs': c['morphs'],
        'tris': {'character': stats['LOD0'], 'phone': stats['phone']},
        'bytes': os.path.getsize(OUT),
        'voice': 'assets/radio/lines.json (lead lane, Gemini TTS voice Kore)',
    }
    json.dump(meta, open(META, 'w'), indent=1)
    print('janine.glb', os.path.getsize(OUT), {k: v['dur'] for k, v in clips.items()})


if __name__ == '__main__':
    main()
