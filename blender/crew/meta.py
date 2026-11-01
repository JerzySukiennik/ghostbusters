# Writes assets/avatar/crew.json: per-character heights, rig scale, triangle counts, file sizes, worn-pack pose and the shared-skeleton method.
import numpy as np, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crewlib import *
from design import CREW
from glbpatch import read_glb

AV = ROOT + '/assets/avatar'


def quat_rot(q, v):
    x, y, z, w = q
    u = np.array([x, y, z]); v = np.asarray(v, float)
    return v + 2 * np.cross(u, np.cross(u, v) + w * v)


def back_max(V, s):
    m = (np.abs(V[:, 0]) < 0.10 * s) & (V[:, 2] > 1.08 * s) & (V[:, 2] < 1.36 * s)
    return float(V[m, 1].max())


def main():
    av = json.load(open(AV + '/avatar.json'))
    pw = av['packWorn']
    jsuit = load('gb_Suit')['co']
    jb = back_max(jsuit, 1.0)
    out = dict(version=1, source='blender/crew (build_crew.sh)', characters={}, jurek=dict(file='jurek_gb.glb', portrait='portrait_jurek.jpg', displayName='Jurek'))
    out['skeleton'] = dict(
        rig='v1 Jurek.Rig, 92 joints: same names, hierarchy, joint order and rest rotations as jurek_gb.glb (checked: rotations equal to 1e-5)',
        method='Uniform rest-pose scale per character: every joint offset and every vertex is Jurek x rigScale, baked into the skeleton (root node scale stays 1). '
               'Bodies, heads and the uniform are reshaped on top of that scaled skeleton, so any clip keyed for Jurek (rotations + Hips translation) fits without retargeting.',
        clips='Each crew GLB carries the 7 jurek_gb clips already scaled (rotation tracks copied, Hips and carrier translations x rigScale, morph weights copied, constant bone translations and scale tracks dropped) plus the three carrier empties. '
              'don_pack PackCarrier is then re-aimed (carrierfix.py, offset in Spine2 space blended in between lift and strapR) so the clip ends exactly on that character\'s packWorn. The game loader uses own clips when present, so no clipScale is applied. If you prefer the shared jurek_gb clips instead: drop every .position track except Hips and *Carrier, drop .scale tracks, multiply Hips/Carrier positions by rigScale (= the existing clipScale).',
        props='Pack, wand and trap stay real size: place them by the carriers (world pose, ignore scale) or by bone + offset. Offsets given in Jurek bone space (avatar.json wandGrip, leftHandIK) work as is to within rigScale x a few mm; packWorn per character is below; the game reads it only with Niepotrzebne/work/crew/avatar_packworn.patch applied to src/game/avatar.js (without it the pack sits 5-30 mm deep in the crew backs).',
        locomotion='UAL retargeting in src/game/anim.js works unchanged (rest rotations identical; Hips height read from the rig).')
    for cid, c in CREW.items():
        s = c['s']
        st = json.load(open(CACHE + f'/{cid}_stats.json'))
        cb = load(f'{cid}_body')
        cb_suit = cb['Suit'] * s
        cbk = back_max(cb_suit, s)
        delta = (cbk + 0.008) - s * (jb + 0.008)
        pos = np.array(pw['position']) * s + quat_rot(pw['quaternion'], [0, 0, -delta])
        ch = np.load(CACHE + f'/{cid}_head.npz')
        skull = float(ch['head'][:, 2].max() * s)
        top = skull
        if os.path.exists(CACHE + f'/{cid}_hair.npz'):
            top = max(top, float(np.load(CACHE + f'/{cid}_hair.npz')['co'][:, 2].max() * s))
        glb = AV + f'/{cid}.glb'
        size = os.path.getsize(glb) if os.path.exists(glb) else 0
        tex = 0
        if size:
            j, b = read_glb(glb)
            tex = max((im.get('extras', {}).get('w', 0) for im in j.get('images', [])), default=0)
        out['characters'][cid] = dict(
            file=f'{cid}.glb', portrait=f'portrait_{cid}.jpg', displayName=c['name'], shortName=c['short'], age=c['age'], summary=c['summary'],
            rigScale=s, stature_m=round(skull, 3), heightWithHair_m=round(top, 3), hipsY_m=round(0.925 * s, 4), eyeY_m=round(1.6374 * s, 3),
            triangles={k: v for k, v in st.items() if k not in ('Head_core', 'Lashes', 'brows', 'beard')}, glbBytes=size,
            packWorn=dict(bone='Spine2', position=[round(float(x), 6) for x in pos], quaternion=pw['quaternion'], backOffset_m=round(float(delta), 4)),
            nameTag='NameTag mesh, own 0..1 UV rectangle (u across 110 mm, v up 30 mm), same as jurek_gb', harness='Harness hidden by default (extras.hiddenByDefault)')
    json.dump(out, open(AV + '/crew.json', 'w'), indent=1)
    print(json.dumps({k: (v['stature_m'], v['heightWithHair_m'], v['triangles'].get('total'), v['glbBytes']) for k, v in out['characters'].items()}))


if __name__ == '__main__':
    main()
