# Janine part builder: the pedestrian part set at hero resolution (2048 atlas, fine curly crop), big 1984 frames with lenses, selected head morph targets.
import numpy as np, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plib import *
import pbuild as PB
import garments as G
from pdesign import PEOPLE

CID = 'janine'
MORPHS = {'blink': [('eyeBlinkLeft', 1), ('eyeBlinkRight', 1), ('corr_eyeBlinkArcLeft', 1), ('corr_eyeBlinkArcRight', 1)],
          'smile': [('mouthSmileLeft', 1), ('mouthSmileRight', 1)], 'browUp': [('browInnerUp', 1)], 'funnel': [('mouthFunnel', 1)]}


def outline(w, h, n=44):
    pts = []
    for k in range(n):
        t = k / n * 2 * np.pi
        c, s = np.cos(t), np.sin(t)
        x = np.sign(c) * abs(c) ** 0.55 * w / 2
        y = np.sign(s) * abs(s) ** 0.62 * h / 2
        x *= 1 + 0.06 * (y / (h / 2))
        if y < 0 and x > 0:
            y *= 1 + 0.10 * (x / (w / 2))
        pts.append((x, y))
    return np.array(pts)


def tube_along(path, r_out, r_up, normal, out_dirs, nprof=6, closed=True):
    n = len(path); V = []
    for i in range(n):
        for j in range(nprof):
            a = j / nprof * 2 * np.pi
            V.append(path[i] + normal * np.cos(a) * r_up + out_dirs[i] * np.sin(a) * r_out)
    F = []
    for i in range(n if closed else n - 1):
        i2 = (i + 1) % n
        for j in range(nprof):
            j2 = (j + 1) % nprof
            F.append((i * nprof + j, i * nprof + j2, i2 * nprof + j2, i2 * nprof + j))
    return np.array(V), F


def _sweep(path, b, nn, rad, nprof=6):
    V = []
    for i in range(len(path)):
        for j in range(nprof):
            a = j / nprof * 2 * np.pi
            V.append(path[i] + b[i] * np.cos(a) * rad[0] + nn[i] * np.sin(a) * rad[1])
    F = []
    for i in range(len(path) - 1):
        for j in range(nprof):
            j2 = (j + 1) % nprof
            F.append((i * nprof + j, (i + 1) * nprof + j, (i + 1) * nprof + j2, i * nprof + j2))
    F.append(tuple(range(nprof - 1, -1, -1)))
    o = (len(path) - 1) * nprof
    F.append(tuple(o + j for j in range(nprof)))
    return np.array(V), F


def glasses(hd, g, s):
    mm = 0.001 / s
    d = hd.d
    eL, eR = d['eyeL_c'], d['eyeR_c']
    es = float(d['eye_s'][0])
    W, Hh = g['w'] * mm, g['h'] * mm
    ol = outline(W, Hh)
    frame_V, frame_F, lens_V, lens_F = [], [], [], []
    off_f = 0; off_l = 0
    centers = {}
    for sd, e in (('L', eL), ('R', eR)):
        sg = 1 if sd == 'L' else -1
        c = np.array([e[0] + sg * 2.5 * mm, min(eL[1], eR[1]) - 0.0126 * es - 13.0 * mm, e[2] + 1.0 * mm])
        wrap, tilt = np.radians(7) * sg, np.radians(-8)
        Rz = np.array([[np.cos(wrap), np.sin(wrap), 0], [-np.sin(wrap), np.cos(wrap), 0], [0, 0, 1]])
        Rx = np.array([[1, 0, 0], [0, np.cos(tilt), -np.sin(tilt)], [0, np.sin(tilt), np.cos(tilt)]])
        Rm = Rz @ Rx
        loc = np.stack([ol[:, 0] * sg, np.zeros(len(ol)), ol[:, 1]], 1) @ Rm.T + c
        normal = Rm @ np.array([0, -1.0, 0])
        od = loc - c; od /= np.linalg.norm(od, axis=1, keepdims=True)
        V, F = tube_along(loc, g['rim'] * mm * 0.5, g['rim'] * mm * 0.75, normal, od)
        frame_V.append(V); frame_F += [tuple(np.array(f) + off_f) for f in F]; off_f += len(V)
        lv = np.vstack([c + normal * 0.3 * mm, loc + normal * 0.3 * mm])
        n = len(loc)
        lens_V.append(lv); lens_F += [(off_l, off_l + 1 + k, off_l + 1 + (k + 1) % n) if sg > 0 else (off_l, off_l + 1 + (k + 1) % n, off_l + 1 + k) for k in range(n)]
        off_l += len(lv)
        centers[sd] = (c, loc, sg)
    cl, locL, _ = centers['L']; cr, locR, _ = centers['R']
    iL = int(np.argmax(-locL[:, 0] + 2 * locL[:, 2])); iR = int(np.argmax(locR[:, 0] + 2 * locR[:, 2]))
    a, b = locL[iL], locR[iR]
    mid = (a + b) / 2 + np.array([0, -1.5 * mm, 2.5 * mm])
    t = np.linspace(0, 1, 9)
    bp = np.array([(1 - u) ** 2 * a + 2 * u * (1 - u) * mid + u * u * b for u in t])
    T = np.gradient(bp, axis=0); T /= np.linalg.norm(T, axis=1, keepdims=True)
    fw = np.array([0, -1.0, 0]); bb = np.cross(T, fw); bb /= np.maximum(np.linalg.norm(bb, axis=1, keepdims=True), 1e-9)
    V, F = _sweep(bp, bb, np.cross(bb, T), (1.3 * mm, 1.6 * mm))
    frame_V.append(V); frame_F += [tuple(np.array(f) + off_f) for f in F]; off_f += len(V)
    for sd in ('L', 'R'):
        c, loc, sg = centers[sd]
        i0 = int(np.argmax(sg * loc[:, 0] + 0.6 * loc[:, 2]))
        hinge = loc[i0] + np.array([sg * 1.0 * mm, 3.0 * mm, 0])
        ear = hd.anchor('ear_top.' + sd)
        over = ear + np.array([-sg * 1.0 * mm, 4.0 * mm, 5.0 * mm])
        behind = over + np.array([0, 15 * mm, -13 * mm])
        ctrl = np.array([hinge, hinge + np.array([sg * 3.0 * mm, 14 * mm, 0.5 * mm]), (hinge + over) / 2 + np.array([sg * 5.0 * mm, 0, 2.0 * mm]), over, behind])
        L_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(ctrl, axis=0), axis=1))]); L_ /= L_[-1]
        tt = np.linspace(0, 1, 14)
        path = np.stack([np.interp(tt, L_, ctrl[:, k]) for k in range(3)], 1)
        dirs = path - hd.center; dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
        ok, P, _ = hd.cast(dirs)
        for k in range(1, len(path) - 1):
            if ok[k]:
                nrm = dirs[k]; cur = (path[k] - P[k]) @ nrm
                if cur < 7.0 * mm:
                    path[k] = path[k] + nrm * (7.0 * mm - cur)
        T = np.gradient(path, axis=0); T /= np.linalg.norm(T, axis=1, keepdims=True)
        up = np.array([0, 0, 1.0]); bb = np.cross(T, up); bb /= np.maximum(np.linalg.norm(bb, axis=1, keepdims=True), 1e-9); nn = np.cross(bb, T)
        V, F = _sweep(path, bb, nn, (0.9 * mm, 1.8 * mm))
        frame_V.append(V); frame_F += [tuple(np.array(f) + off_f) for f in F]; off_f += len(V)
    return np.vstack(frame_V), frame_F, np.vstack(lens_V), lens_F


def build():
    PB.build_ped(CID, size=2048)
    d = dict(np.load(CACHE + f'/{CID}_ped.npz'))
    names = [str(n) for n in d['names']]
    D = PEOPLE[CID]
    hd = G.HeadGeo(CID)
    fV, fF, lV, lF = glasses(hd, D['glasses'], D['s'])
    for nm, V, F, sol in (('glasses', fV, fF, 'frame'), ('lens', lV, lF, 'lens')):
        p = PB.pack_poly(V, F, None, G.onehot_w(len(V), 'Head'), uv_loop=PB.atlas_from_extras(G.solid_uv(sol, sum(len(f) for f in F))))
        for k, v in p.items():
            d[nm + '__' + k] = v
        names.append(nm)
    hk = np.load(CACHE + f'/{CID}_head.npz')
    src = np.load(CACHE + '/src_head.npz')
    kn = [str(k) for k in src['key_names']]
    base = hk['head']
    assert np.allclose(base, d['head__co']), 'head order'
    keys = []
    for m, parts in MORPHS.items():
        dl = np.zeros_like(base)
        for k, w in parts:
            dl += (hk['keys'][kn.index(k)] - base) * w
        keys.append(base + dl)
    d['head__keys'] = np.array(keys, np.float32)
    d['head__keynames'] = np.array(list(MORPHS))
    d['names'] = np.array(names)
    np.savez_compressed(CACHE + f'/{CID}_ped.npz', **d)
    tris = {n: int((d[n + '__lt'] - 2).sum()) for n in names}
    return tris


if __name__ == '__main__':
    t = build()
    print('janine', t, sum(t.values()))
