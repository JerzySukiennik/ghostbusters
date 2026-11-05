# Quick numpy splat preview of built pedestrian parts coloured from the atlas (front, side, back) for fast iteration without Blender.
import numpy as np, sys, os
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plib import *

HERE = os.path.dirname(os.path.abspath(__file__))


def meshes(cid):
    d = np.load(CACHE + f'/{cid}_ped.npz')
    atlas = np.asarray(Image.open(HERE + f'/tex/{cid}/atlas.jpg').convert('RGB'), np.float32) / 255
    H, W = atlas.shape[:2]
    out = []
    for n in d['names']:
        co = d[n + '__co']; loops = d[n + '__loops']; ls = d[n + '__ls']; lt = d[n + '__lt']; uv = d[n + '__uv']
        T = []; C = []
        for s, t in zip(ls, lt):
            for k in range(1, t - 1):
                tri = (s, s + k, s + k + 1)
                T.append(loops[list(tri)])
                u = uv[list(tri)].mean(0)
                C.append(atlas[int(np.clip((1 - u[1]) * H, 0, H - 1)), int(np.clip(u[0] * W, 0, W - 1))])
        out.append((co, np.array(T), np.array(C)))
    return out


if __name__ == '__main__':
    cids = sys.argv[1:]
    ims = []
    for cid in cids:
        m = meshes(cid)
        for v in ('front', 'q34', 'back'):
            ims.append(splat(m, view=v, size=(260, 560), center=(0, 0, 0.92), height=1.95, bg=0.2))
    os.makedirs(WORK, exist_ok=True)
    sheet(ims, WORK + '/preview_' + '_'.join(cids) + '.jpg', cols=min(9, len(ims)))
    print('preview', WORK + '/preview_' + '_'.join(cids) + '.jpg')
