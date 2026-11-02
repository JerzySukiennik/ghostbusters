# Rectangular acetate glasses for crew_1, fitted to the warped head: rims, keyhole-free straight bridge, hinges, temples resting over the ears, thin lenses.
import numpy as np, sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crewlib import *
from design import CREW
import hairgen as HG

CID = 'crew_1'


def rrect(w, h, r, n=40, top_wider=0.03):
    pts = []
    for k in range(n):
        t = k / n * 2 * np.pi
        c, s = np.cos(t), np.sin(t)
        x = np.sign(c) * (abs(c) ** 0.28) * w / 2; y = np.sign(s) * (abs(s) ** 0.36) * h / 2
        x *= 1 + top_wider * (y / (h / 2))
        pts.append((x, y))
    return np.array(pts)


def sweep(path, prof, closed=True, up=None):
    n = len(path); m = len(prof)
    T = np.gradient(path, axis=0) if not closed else (np.roll(path, -1, 0) - np.roll(path, 1, 0))
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    V = []
    for i in range(n):
        u = up[i] if up is not None and np.ndim(up) == 2 else (up if up is not None else np.array([0, 0, 1.0]))
        b = np.cross(T[i], u); b /= max(np.linalg.norm(b), 1e-9); nn = np.cross(b, T[i])
        for (px, py) in prof:
            V.append(path[i] + b * px + nn * py)
    V = np.array(V); F = []
    rng = n if closed else n - 1
    for i in range(rng):
        i2 = (i + 1) % n
        for j in range(m):
            j2 = (j + 1) % m
            F.append((i * m + j, i2 * m + j, i2 * m + j2)); F.append((i * m + j, i2 * m + j2, i * m + j2))
    return V, np.array(F)


def make():
    s = CREW[CID]['s']; mm = 0.001 / s
    hd = HG.Head(CID)
    d = np.load(CACHE + f'/{CID}_head.npz')
    eL, eR = d['eyeL_c'], d['eyeR_c']
    es = float(d['eye_s'][0])
    ycorn = min(eL[1], eR[1]) - 0.0126 * es
    lens_y = ycorn - 12.0 * mm
    W, Hh, R = 50.0 * mm, 33.0 * mm, 7.0 * mm
    outline = rrect(W, Hh, R, n=36)
    parts = []
    lens_parts = []
    centers = {}
    for sd, e in (('L', eL), ('R', eR)):
        sg = 1 if sd == 'L' else -1
        c = np.array([e[0] + sg * 1.0 * mm, lens_y, e[2] + 1.5 * mm])
        wrap = np.radians(6) * sg
        tilt = np.radians(-7)
        Rz = np.array([[np.cos(wrap), np.sin(wrap), 0], [-np.sin(wrap), np.cos(wrap), 0], [0, 0, 1]])
        Rx = np.array([[1, 0, 0], [0, np.cos(tilt), -np.sin(tilt)], [0, np.sin(tilt), np.cos(tilt)]])
        Rm = Rz @ Rx
        loc = np.stack([outline[:, 0], np.zeros(len(outline)), outline[:, 1]], 1) @ Rm.T + c
        centers[sd] = (c, Rm, loc)
        normal = Rm @ np.array([0, -1.0, 0])
        rimw = 5.2 * mm; rimd = 6.0 * mm
        top = (outline[:, 1] > 0)
        prof = np.array([(-rimd / 2, -rimw * 0.2), (rimd / 2, -rimw * 0.2), (rimd / 2 * 0.9, rimw * 0.9), (-rimd / 2 * 0.9, rimw * 0.9)])
        path = loc
        up = np.tile(normal, (len(path), 1))
        out_dir = loc - c; out_dir /= np.linalg.norm(out_dir, axis=1, keepdims=True)
        V = []; m_ = len(prof)
        Tn = np.roll(path, -1, 0) - np.roll(path, 1, 0); Tn /= np.linalg.norm(Tn, axis=1, keepdims=True)
        for i in range(len(path)):
            thick = rimw * (1.0 + 0.45 * np.clip((outline[i, 1] / (Hh / 2) - 0.2) / 0.6, 0, 1))
            for (px, py) in prof:
                V.append(path[i] + normal * px + out_dir[i] * (py * thick / rimw))
        V = np.array(V); F = []
        n = len(path)
        for i in range(n):
            i2 = (i + 1) % n
            for j in range(m_):
                j2 = (j + 1) % m_
                F.append((i * m_ + j, i * m_ + j2, i2 * m_ + j2)); F.append((i * m_ + j, i2 * m_ + j2, i2 * m_ + j))
        parts.append((V, np.array(F)))
        lv = np.vstack([c - normal * 0.4 * mm, loc - normal * 0.4 * mm + (c - loc) * 0.02])
        lf = np.array([(0, 1 + k, 1 + (k + 1) % n) for k in range(n)])
        lens_parts.append((lv, lf))
    cl, Rl, locL = centers['L']; cr, Rr, locR = centers['R']
    iL = np.argmin(np.abs(np.arctan2(locL[:, 2] - cl[2], locL[:, 0] - cl[0]) - np.radians(165)))
    iR = np.argmin(np.abs(np.arctan2(locR[:, 2] - cr[2], -(locR[:, 0] - cr[0])) - np.radians(165)))
    a, b = locL[iL], locR[iR]
    mid = (a + b) / 2 + np.array([0, -1.2 * mm, 1.8 * mm])
    bp = np.array([a, (a + mid) / 2 + np.array([0, -0.4 * mm, 0.6 * mm]), mid, (b + mid) / 2 + np.array([0, -0.4 * mm, 0.6 * mm]), b])
    t = np.linspace(0, 1, 9); bpath = np.stack([np.interp(t, np.linspace(0, 1, 5), bp[:, k]) for k in range(3)], 1)
    bprof = np.array([(-2.4 * mm, -1.8 * mm), (2.4 * mm, -1.8 * mm), (2.4 * mm, 1.8 * mm), (-2.4 * mm, 1.8 * mm)])
    parts.append(sweep(bpath, bprof, closed=False, up=np.array([0, -1.0, 0])))
    A = json.load(open(CACHE + '/anchors.json'))['anchors']
    for sd, (c, Rm, loc) in (('L', centers['L']), ('R', centers['R'])):
        sg = 1 if sd == 'L' else -1
        i0 = np.argmin(np.abs(np.arctan2(loc[:, 2] - c[2], sg * (loc[:, 0] - c[0])) - np.radians(20)))
        hinge = loc[i0] + np.array([sg * 1.5 * mm, 2.0 * mm, 0])
        ear = HG.AP['ear_top.' + sd]
        T_ = TPS.__new__(TPS); T_.X, T_.W, T_.A = d['tpsX'], d['tpsW'], d['tpsA']
        ear_w = T_(ear[None])[0]
        over = ear_w + np.array([-sg * 1.0 * mm, 2.0 * mm, 4.0 * mm])
        behind = over + np.array([0, 16 * mm, -14 * mm])
        ctrl = np.array([hinge, hinge + np.array([sg * 2.0 * mm, 12 * mm, 0.5 * mm]), (hinge + over) / 2 + np.array([sg * 4.0 * mm, 0, 1.5 * mm]), over, behind])
        tt = np.linspace(0, 1, 14)
        L_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(ctrl, axis=0), axis=1))]); L_ /= L_[-1]
        path = np.stack([np.interp(tt, L_, ctrl[:, k]) for k in range(3)], 1)
        dirs = path - HG.CJ; dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
        ok, P, Pj, Nn, tri, w = hd.cast(dirs)
        for k in range(1, len(path) - 1):
            if ok[k]:
                cur = (path[k] - P[k]) @ Nn[k]
                if cur < 6.0 * mm:
                    path[k] = path[k] + Nn[k] * (6.0 * mm - cur)
        tprof = np.array([(-1.3 * mm, -2.2 * mm), (1.3 * mm, -2.2 * mm), (1.3 * mm, 2.2 * mm), (-1.3 * mm, 2.2 * mm)])
        V, F = sweep(path, tprof, closed=False, up=np.array([0, 0, 1.0]))
        parts.append((V, F))
        hb = np.array([(-2.6 * mm, -3.0 * mm), (2.6 * mm, -3.0 * mm), (2.6 * mm, 3.0 * mm), (-2.6 * mm, 3.0 * mm)])
        hp = np.array([loc[i0] + np.array([0, -1 * mm, 0]), hinge + np.array([0, 2.5 * mm, 0])])
        parts.append(sweep(hp, hb, closed=False, up=np.array([0, 0, 1.0])))
    Vs = []; Fs = []; mi = []; off = 0
    for V, F in parts:
        Vs.append(V); Fs.append(F + off); mi.append(np.zeros(len(F), np.int64)); off += len(V)
    for V, F in lens_parts:
        Vs.append(V); Fs.append(F + off); mi.append(np.ones(len(F), np.int64)); off += len(V)
    V = np.vstack(Vs); F = np.vstack(Fs); mi = np.concatenate(mi)
    UV = np.zeros((len(V), 2)); UV[:, 0] = (V[:, 0] - V[:, 0].min()) / np.ptp(V[:, 0]); UV[:, 1] = (V[:, 2] - V[:, 2].min()) / np.ptp(V[:, 2])
    d = HG.pack(V, F, UV, None, ['GlassesFrame', 'GlassesLens'], mi)
    np.savez(CACHE + f'/{CID}_glasses.npz', **d)
    return V, F


if __name__ == '__main__':
    V, F = make()
    print('glasses tris', len(F))
