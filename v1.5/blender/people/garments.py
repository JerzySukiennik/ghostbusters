# People clothes in numpy: body-surface garments with ease, coat and skirt tubes, collars, hats, hair volumes and the painted texture atlas.
import numpy as np, sys, os, json
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plib import *
from pdesign import PEOPLE, PEDS
from phairline import hair_mask, az_el, curve
import pskin as SK

HERE = os.path.dirname(os.path.abspath(__file__))
RIG = load('rig'); NAMES = [str(n) for n in RIG['names']]; BI = {n: i for i, n in enumerate(NAMES)}
J = lambda n: RIG['heads'][BI[n]]
SB = load('src_body'); BV = SB['co']; BFc = faces_of(SB); BT = tris_of(BFc); REG = SB['region'].round().astype(int); BW = SB['W'].astype(np.float32); BUV = SB['uv']
SH = load('src_head'); HV0 = SH['co']; HFc = faces_of(SH); HMI = SH['mi']; HUV = SH['uv']; HW = SH['W'].astype(np.float32)
ANC = json.load(open(CACHE + '/anchors.json'))['anchors']
AIDX = {k: v['vertex'] for k, v in ANC.items()}
NB = len(NAMES)
s2l, l2s, vnoise, fbm = SK.s2l, SK.l2s, SK.vnoise, SK.fbm

RECT = dict(hair=(0.0, 0.5, 0.5, 1.0), tube=(0.0, 0.0, 0.5, 0.5), hat=(0.5, 0.5, 0.75, 1.0), collar=(0.75, 0.75, 1.0, 1.0),
            eyeL=(0.75, 0.5, 0.875, 0.625), eyeR=(0.875, 0.5, 1.0, 0.625), solid=(0.5, 0.25, 0.75, 0.5), flap=(0.75, 0.625, 1.0, 0.75))
SOLIDS = ['teeth', 'gums', 'tongue', 'earring', 'frame', 'lens', 'badge', 'dark', 'sole', 'buckle', 'mouth']


def rect_uv(name, uv):
    u0, v0, u1, v1 = RECT[name]
    uv = np.clip(np.asarray(uv, float), 0.002, 0.998)
    return np.stack([u0 + uv[:, 0] * (u1 - u0), v0 + uv[:, 1] * (v1 - v0)], 1)


def solid_uv(name, n):
    k = SOLIDS.index(name); cu, cv = k % 8, k // 8
    u0, v0, u1, v1 = RECT['solid']
    return np.tile([u0 + (cu + 0.5) / 8 * (u1 - u0), v0 + (cv + 0.5) / 8 * (v1 - v0)], (n, 1))


def lin(c):
    return s2l(np.asarray(c, float))


def onehot_w(n, bone, w=1.0):
    W = np.zeros((n, NB), np.float32); W[:, BI[bone]] = w
    return W


# ---------------------------------------------------------------- coverage and ease on the body (Jurek frame)
WRIST = {1: J('LeftHand'), -1: J('RightHand')}
ELBOW = {1: J('LeftForeArm'), -1: J('RightForeArm')}
SHOULDER = {1: J('LeftArm'), -1: J('RightArm')}


def sided(P, d):
    sg = np.where(P[:, 0] >= 0, 1, -1)
    return np.where(sg[:, None] > 0, d[1][None], d[-1][None])


def arm_coords(P):
    S = sided(P, SHOULDER); E = sided(P, ELBOW); Wr = sided(P, WRIST)
    a1 = E - S; L1 = np.linalg.norm(a1, axis=1, keepdims=True); a1 /= L1
    a2 = Wr - E; L2 = np.linalg.norm(a2, axis=1, keepdims=True); a2 /= L2
    t1 = ((P - S) * a1).sum(1); t2 = ((P - E) * a2).sum(1)
    along = np.where(t1 < L1[:, 0], t1, L1[:, 0] + t2)
    ax = np.where((t1 < L1[:, 0])[:, None], a1, a2)
    org = np.where((t1 < L1[:, 0])[:, None], S, E)
    v = P - org; v = v - (v * ax).sum(1, keepdims=True) * ax
    b1 = np.array([0, -1.0, 0]) - (ax @ np.array([0, -1.0, 0]))[:, None] * ax; b1 /= np.linalg.norm(b1, axis=1, keepdims=True)
    b2 = np.cross(ax, b1)
    ang = np.arctan2((v * b2).sum(1), (v * b1).sum(1))
    dw = np.linalg.norm(P - Wr, axis=1)
    return along, ang, dw, L1[:, 0] + L2[:, 0]


def body_layers(P, R, o):
    z = P[:, 2]; n = len(P)
    top, legs, shoes, vest = o.get('top'), o.get('legs'), o.get('shoes'), o.get('vest')
    arm = (R == 2) | (R == 3)
    along, ang, dw, alen = arm_coords(P)
    out = dict(along=along, ang=ang, dw=dw)
    skirtish = legs and legs['kind'] in ('skirt', 'tights')
    c_top = np.zeros(n, bool)
    if top:
        hem = top['hem']
        c_top |= (R == 0) & (z >= min(hem, 0.80) if top['kind'] == 'coat' else (R == 0) & (z >= hem))
        c_top |= arm & (dw > 0.030)
        c_top |= (R == 1) & (z < 1.462)
    out['top'] = c_top
    waist = 1.03
    c_leg = np.zeros(n, bool); c_tight = np.zeros(n, bool)
    if legs:
        if skirtish:
            c_tight |= ((R == 5) | (R == 6)) | ((R == 0) & (z < 0.86))
            if legs['kind'] == 'skirt':
                c_leg |= (R == 0) & (z < legs.get('top', 1.0)) & (z >= 0.86)
        else:
            c_leg |= ((R == 5) | (R == 6)) & (z > 0.075)
            c_leg |= (R == 0) & (z < waist)
    out['legs'] = c_leg; out['tights'] = c_tight
    c_shoe = R == 7
    stop = 0.085
    if shoes:
        if shoes['kind'] == 'boots':
            stop = shoes.get('top', 0.16)
        elif shoes['kind'] == 'hightops':
            stop = 0.135
        elif shoes['kind'] == 'pumps':
            stop = 0.0
        c_shoe = c_shoe | (((R == 6) | (R == 5)) & (z < stop))
    if shoes and shoes['kind'] == 'pumps':
        c_shoe = (R == 7) & ((z < 0.032) | (P[:, 1] < -0.12 - 0.5 * (z - 0.03)))
    out['shoes'] = c_shoe; out['stop'] = stop
    c_vest = np.zeros(n, bool)
    if vest:
        c_vest = (R == 0) & (z >= vest['hem']) & (z < 1.43)
    out['vest'] = c_vest
    return out


def neck_v(P, o):
    z = P[:, 2]; x = P[:, 0]; y = P[:, 1]
    top = o.get('top') or {}
    k = top.get('kind', '')
    front = y < -0.01
    if k in ('coat', 'suit'):
        zb = 1.20 if k == 'suit' else 1.26
        vw = np.clip((z - zb) / (1.44 - zb), 0, 1) * (0.085 if k == 'suit' else 0.075)
    elif k in ('leather', 'denim', 'work', 'windbreaker'):
        zb = 1.33; vw = np.clip((z - zb) / (1.44 - zb), 0, 1) * 0.05
    elif k == 'uniform':
        zb = 1.37; vw = np.clip((z - zb) / (1.44 - zb), 0, 1) * 0.03
    elif k == 'blouse':
        zb = 1.38; vw = np.clip((z - zb) / (1.44 - zb), 0, 1) * 0.035
    else:
        return np.zeros(len(P), bool), np.zeros(len(P))
    m = front & (np.abs(x) < vw) & (z > zb)
    edge = np.clip(1 - np.abs(np.abs(x) - vw) / 0.022, 0, 1) * front * (z > zb - 0.02)
    return m, edge


def body_ease(P, R, o):
    L = body_layers(P, R, o)
    z = P[:, 2]; n = len(P)
    d = np.zeros(n)
    top, legs, shoes, vest = o.get('top'), o.get('legs'), o.get('shoes'), o.get('vest')
    if legs:
        k = legs['kind']
        if k in ('skirt', 'tights'):
            d[L['tights']] = 0.0007
        else:
            e = legs.get('ease', 8.0) / 1000
            flare = 0.004 * sstep(0.32, 0.09, z)
            d[L['legs']] = (e + flare)[L['legs']]
    if top:
        e = top['ease'] / 1000
        arm = (R == 2) | (R == 3)
        de = e * np.where(arm, 0.75 + 0.25 * sstep(0.03, 0.12, L['dw']), 1.0)
        if top['kind'] == 'coat':
            de = de + np.where(R == 0, 0.06 * np.clip(0.98 - z, 0, 0.2), 0)
        if top.get('pads'):
            for sg in (1, -1):
                S = SHOULDER[sg]
                pd = np.linalg.norm((P - S) * [1.0, 1.4, 1.0], axis=1)
                de = de + top['pads'] / 1000 * sstep(0.085, 0.02, pd) * (z > S[2] - 0.05)
        m = L['top']
        d[m] = np.maximum(d[m], de[m])
    if vest:
        ve = vest['ease'] / 1000
        m = L['vest']
        d[m] = np.maximum(d[m], ve)
    if shoes:
        se = {'shoes': 0.006, 'sneakers': 0.009, 'hightops': 0.009, 'boots': 0.007, 'pumps': 0.002}[shoes['kind']]
        m = L['shoes']
        d[m] = np.maximum(d[m], se * np.where(z < 0.012, 0.3, 1.0)[m])
    return d, L


def dress_body(cid, Vb):
    o = PEOPLE[cid]['outfit']
    d, L = body_ease(BV, REG, o)
    E = edges_of(BFc); M = adjacency(len(BV), E)
    d = smooth(d[:, None], M, 3, 0.5)[:, 0]
    N = vnormals(Vb, BT)
    N = smooth(N, M, 4, 0.6); N /= np.linalg.norm(N, axis=1, keepdims=True)
    V = Vb + N * d[:, None]
    low = V[:, 2] < 0.0
    V[low, 2] = 0.0
    return V, d


# ---------------------------------------------------------------- tubes (coat skirts, skirts)
def ring_outline(Vb, z, nth, center, regs=(0, 5, 6), slab=0.02):
    m = np.isin(REG, regs) & (np.abs(Vb[:, 2] - z) < slab)
    P = Vb[m]
    th = np.linspace(-np.pi, np.pi, nth, endpoint=False)
    if len(P) < 8:
        return np.full(nth, 0.12)
    a = np.arctan2(P[:, 0] - center[0], -(P[:, 1] - center[1])); r = np.hypot(P[:, 0] - center[0], P[:, 1] - center[1])
    out = np.zeros(nth)
    for i, t in enumerate(th):
        dd = np.abs(np.angle(np.exp(1j * (a - t))))
        sel = dd < (np.pi / nth) * 1.6
        out[i] = r[sel].max() if sel.any() else np.nan
    if np.isnan(out).any():
        good = ~np.isnan(out)
        out = np.interp(np.arange(nth), np.where(good)[0], out[good], period=nth)
    for _ in range(2):
        out = 0.25 * np.roll(out, 1) + 0.5 * out + 0.25 * np.roll(out, -1)
    return out


def make_tube(Vb, z_top, z_hem, ease, flare, nth=30, nz=10, taper=0.0, hem_turn=True):
    c = np.array([0.0, 0.01])
    zs = np.linspace(z_top, z_hem, nz)
    th = np.linspace(-np.pi, np.pi, nth, endpoint=False)
    rings = []
    prev = None
    for k, z in enumerate(zs):
        r = ring_outline(Vb, z, nth, c) + ease + flare * (z_top - z) - taper * (z_top - z)
        if prev is not None and taper <= 0:
            r = np.maximum(r, prev * 0.985)
        prev = r
        rings.append(np.stack([c[0] + r * np.sin(th), c[1] - r * np.cos(th), np.full(nth, z)], 1))
    if hem_turn:
        inner = rings[-1].copy(); ctr = np.array([c[0], c[1], 0])
        inner[:, :2] = ctr[:2] + (inner[:, :2] - ctr[:2]) * 0.96; inner[:, 2] += 0.012
        rings.append(inner)
    V = np.vstack(rings)
    F = []
    for k in range(len(rings) - 1):
        for i in range(nth):
            a = k * nth + i; b = k * nth + (i + 1) % nth; cc = (k + 1) * nth + (i + 1) % nth; d = (k + 1) * nth + i
            F.append((a, d, cc, b))
    nr = len(rings)
    us = np.tile(np.linspace(0, 1, nth, endpoint=False) + 0.5 / nth, nr)
    vs = np.repeat(np.concatenate([np.linspace(1, 0.06, nz), [0.02]]) if hem_turn else np.linspace(1, 0.0, nz), nth)
    return V, np.array(F), np.stack([us, vs], 1), th, zs


def tube_weights(V, Vb, z_top):
    legsel = np.isin(REG, (5, 6))
    tree_L = cKDTree(Vb[legsel & (BV[:, 0] > 0)]); tree_R = cKDTree(Vb[legsel & (BV[:, 0] < 0)])
    WLs = BW[legsel & (BV[:, 0] > 0)]; WRs = BW[legsel & (BV[:, 0] < 0)]
    _, iL = tree_L.query(V); _, iR = tree_R.query(V)
    mL = 0.5 + 0.5 * np.clip(V[:, 0] / 0.07, -1, 1)
    Wleg = mL[:, None] * WLs[iL] + (1 - mL[:, None]) * WRs[iR]
    a = sstep(z_top, z_top - 0.30, V[:, 2]) * 0.82
    Wh = np.zeros((len(V), NB), np.float32); Wh[:, BI['Hips']] = 1
    W = (1 - a[:, None]) * Wh + a[:, None] * Wleg
    return limit4(W)


def limit4(W):
    W = np.asarray(W, np.float32).copy()
    idx = np.argsort(-W, 1)[:, 4:]
    np.put_along_axis(W, idx, 0, 1)
    W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
    return W


def nearest_body_weights(V, Vb, regs=None):
    sel = np.ones(len(Vb), bool) if regs is None else np.isin(REG, regs)
    tree = cKDTree(Vb[sel]); _, ii = tree.query(V)
    return limit4(BW[sel][ii])


# ---------------------------------------------------------------- collars
def neck_outline(Vb, z, nth):
    m = (REG == 1) & (np.abs(Vb[:, 2] - z) < 0.008)
    if m.sum() < 8:
        m = (REG == 1)
    P = Vb[m]; c = np.array([0.0, 0.012])
    th = np.linspace(-np.pi, np.pi, nth, endpoint=False)
    a = np.arctan2(P[:, 0] - c[0], -(P[:, 1] - c[1])); r = np.hypot(P[:, 0] - c[0], P[:, 1] - c[1])
    out = np.array([r[np.abs(np.angle(np.exp(1j * (a - t)))) < 0.5].max() for t in th])
    for _ in range(2):
        out = 0.25 * np.roll(out, 1) + 0.5 * out + 0.25 * np.roll(out, -1)
    return out


def make_collar(Vb, kind, nth=24):
    th = np.linspace(-np.pi, np.pi, nth, endpoint=False)
    c = np.array([0.0, 0.012])
    r0 = neck_outline(Vb, 1.462, nth) + 0.004
    open_a = {'popped': 0.55, 'small': 0.6, 'shirt': 0.22, 'band': 0.0, 'lapel': 0.75, 'blouse': 0.42, 'fur': 0.0}[kind]
    back = np.cos(th) * -1
    if kind == 'fur':
        rings = []
        for j in range(7):
            ph = j / 6 * np.pi
            rr = r0 + 0.012 + 0.020 * (1 - np.cos(ph)) * 0.5 + 0.004 * np.sin(th * 7 + j)
            zz = 1.415 + 0.024 * np.sin(ph) + 0.012 * (0.5 + 0.5 * back)
            rr = rr - 0.010 * np.sin(ph) * 0 + 0.016 * np.sin(ph)
            rings.append(np.stack([c[0] + rr * np.sin(th), c[1] - rr * np.cos(th), zz], 1))
        prof_v = np.linspace(0, 1, 7)
        closed = True
    else:
        h = {'popped': 0.062, 'small': 0.042, 'shirt': 0.036, 'band': 0.045, 'lapel': 0.042, 'blouse': 0.038}[kind]
        lean = {'popped': 0.016, 'small': 0.026, 'shirt': 0.010, 'band': 0.004, 'lapel': 0.026, 'blouse': 0.022}[kind]
        fold = kind in ('small', 'lapel', 'blouse', 'shirt')
        z0 = 1.432
        zf = 1.405 if kind != 'band' else 1.43
        dz = h * (0.62 + 0.38 * (0.5 + 0.5 * back))
        bot = np.stack([c[0] + (r0 + 0.010) * np.sin(th), c[1] - (r0 + 0.010) * np.cos(th), z0 + 0 * th], 1)
        bot[:, 2] = np.where(np.abs(th) < open_a + 0.25, zf + (z0 - zf) * np.clip(np.abs(th) / (open_a + 0.25), 0, 1), z0)
        if fold:
            top = np.stack([c[0] + (r0 + 0.006) * np.sin(th), c[1] - (r0 + 0.006) * np.cos(th), bot[:, 2] + dz * 0.55], 1)
            out = np.stack([c[0] + (r0 + 0.010 + lean) * np.sin(th), c[1] - (r0 + 0.010 + lean) * np.cos(th), bot[:, 2] + dz * 0.05], 1)
            rings = [bot, top, out]
            prof_v = np.array([0.0, 0.55, 1.0])
        else:
            top = np.stack([c[0] + (r0 + 0.010 + lean) * np.sin(th), c[1] - (r0 + 0.010 + lean) * np.cos(th), bot[:, 2] + dz], 1)
            rings = [bot, top]
            prof_v = np.array([0.0, 1.0])
        closed = open_a == 0
    V = np.vstack(rings); F = []; nr = len(rings)
    for k in range(nr - 1):
        for i in range(nth):
            i2 = (i + 1) % nth
            if not closed and (abs(np.angle(np.exp(1j * (th[i] + np.pi / nth)))) < open_a):
                continue
            F.append((k * nth + i, k * nth + i2, (k + 1) * nth + i2, (k + 1) * nth + i))
    F = np.array(F)
    uv = np.stack([np.tile(np.linspace(0, 1, nth, endpoint=False) + 0.5 / nth, nr), np.repeat(prof_v, nth)], 1)
    used = np.unique(F); rm = -np.ones(len(V), int); rm[used] = np.arange(len(used))
    return V[used], rm[F], uv[used]


# ---------------------------------------------------------------- head helpers, hair volume, hats
def raycast(O, Dn, V, T, chunk=256):
    A = V[T[:, 0]]; E1 = V[T[:, 1]] - A; E2 = V[T[:, 2]] - A
    hit_t = np.full(len(Dn), np.inf); hit_i = -np.ones(len(Dn), np.int64); hit_b = np.zeros((len(Dn), 2))
    for s in range(0, len(Dn), chunk):
        d = Dn[s:s + chunk]; o = O[s:s + chunk] if O.ndim == 2 else np.broadcast_to(O, d.shape)
        p = np.cross(d[:, None, :], E2[None]); det = (E1[None] * p).sum(2)
        ok = np.abs(det) > 1e-12; inv = np.where(ok, 1 / np.where(ok, det, 1), 0)
        tv = o[:, None, :] - A[None]
        u = (tv * p).sum(2) * inv
        q = np.cross(tv, E1[None]); v = (d[:, None, :] * q).sum(2) * inv
        t = (E2[None] * q).sum(2) * inv
        good = ok & (u >= -1e-6) & (v >= -1e-6) & (u + v <= 1 + 1e-6) & (t > 1e-5)
        t = np.where(good, t, np.inf)
        k = np.argmin(t, 1); tm = t[np.arange(len(d)), k]
        hit_t[s:s + chunk] = tm; hit_i[s:s + chunk] = np.where(np.isfinite(tm), k, -1)
        hit_b[s:s + chunk, 0] = u[np.arange(len(d)), k]; hit_b[s:s + chunk, 1] = v[np.arange(len(d)), k]
    return hit_t, hit_i, hit_b


HSKIN = [i for i, m in enumerate(HMI) if m < 3]
HTRI = tris_of([HFc[i] for i in HSKIN])
EARS = ear_faces(SH)[np.concatenate([[i] * (len(HFc[i]) - 2) for i in HSKIN]).astype(np.int64)]
CJ = np.array([0.0, 0.008, 1.625])


class HeadGeo:
    def __init__(self, cid):
        d = np.load(CACHE + f'/{cid}_head.npz')
        self.V = d['head']; self.d = d
        self.center = CJ + (d['eyeL_c'] + d['eyeR_c']) / 2 - np.array([0.0, -0.0677, 1.6374])
        self.T = HTRI[~EARS]

    def cast(self, dirs):
        t, i, b = raycast(self.center, dirs, self.V, self.T)
        ok = i >= 0
        tri = self.T[np.maximum(i, 0)]
        w = np.stack([1 - b[:, 0] - b[:, 1], b[:, 0], b[:, 1]], 1)
        P = (self.V[tri] * w[..., None]).sum(1); Pj = (HV0[tri] * w[..., None]).sum(1)
        return ok, P, Pj

    def anchor(self, k):
        return self.V[AIDX[k]]


def head_band(hd, lift=0.016):
    a = hd.anchor
    zf = 0.5 * (a('brow_ridge_top.L')[2] + a('brow_ridge_top.R')[2]) + lift
    nth = 32
    th = np.linspace(-np.pi, np.pi, nth, endpoint=False)
    zb = zf + 0.020 * (0.5 - 0.5 * np.cos(th))
    dirs = []
    for t, z in zip(th, zb):
        v = np.array([np.sin(t) * 0.1, -np.cos(t) * 0.1, z - hd.center[2]])
        dirs.append(v / np.linalg.norm(v))
    ok, P, Pj = hd.cast(np.array(dirs))
    r = np.hypot(P[:, 0] - hd.center[0], P[:, 1] - hd.center[1])
    r = np.where(ok, r, np.median(r[ok]))
    for _ in range(2):
        r = 0.25 * np.roll(r, 1) + 0.5 * r + 0.25 * np.roll(r, -1)
    return th, r, zb


def lathe(center, th, r_band, z_band, prof, uvv):
    nth = len(th); rings = []
    for (dr, dz) in prof:
        drv = dr(th) if callable(dr) else np.full(nth, dr)
        dzv = dz(th) if callable(dz) else np.full(nth, dz)
        rr = r_band + drv
        rings.append(np.stack([center[0] + rr * np.sin(th), center[1] - rr * np.cos(th), z_band + dzv], 1))
    V = np.vstack(rings); F = []
    for k in range(len(prof) - 1):
        for i in range(nth):
            i2 = (i + 1) % nth
            F.append((k * nth + i, (k + 1) * nth + i, (k + 1) * nth + i2, k * nth + i2))
    uv = np.stack([np.tile(np.linspace(0, 1, nth, endpoint=False) + 0.5 / nth, len(prof)), np.repeat(uvv, nth)], 1)
    return V, np.array(F), uv


def cap_top(V, F, uv, ring_start, nth, center_pt, v_center):
    ci = len(V)
    V = np.vstack([V, center_pt[None]]); uv = np.vstack([uv, [[0.5, v_center]]])
    F = list(map(tuple, F))
    for i in range(nth):
        F.append((ring_start + i, ring_start + (i + 1) % nth, ci))
    return V, F, uv


def make_hat(hd, h, hair_th):
    kind = h['kind']
    th, r, zb = head_band(hd, lift={'fedora': 0.020, 'police': 0.024, 'flatcap': 0.020, 'knit': 0.002, 'hardhat': 0.028}[kind])
    r = r + hair_th + 0.004
    c = hd.center
    front = 0.5 + 0.5 * np.cos(th)
    nth = len(th)
    if kind == 'fedora':
        prof = [(-0.004, -0.004), (0.0, 0.0), (0.004, 0.030), (0.0, 0.075), (-0.012, 0.105), (-0.030, 0.118)]
        V, F, uv = lathe(c, th, r, zb, prof, np.array([0.30, 0.34, 0.50, 0.75, 0.88, 0.93]))
        top_z = zb.mean() + 0.106
        V[-nth:, 2] = zb + 0.118 - 0.016 * np.abs(np.sin(th)) - 0.008 * front
        V, F, uv = cap_top(V, F, uv, len(V) - nth, nth, np.array([c[0], c[1] + 0.005, top_z - 0.008]), 1.0)
        brim = [(0.0, 0.0), (lambda t: 0.050 + 0.008 * np.cos(t) ** 2, lambda t: 0.006 - 0.010 * (0.5 + 0.5 * np.cos(t)) + 0.012 * np.sin(t) ** 2),
                (lambda t: 0.054 + 0.008 * np.cos(t) ** 2, lambda t: 0.000 - 0.010 * (0.5 + 0.5 * np.cos(t)) + 0.012 * np.sin(t) ** 2), (0.004, -0.006)]
        V2, F2, uv2 = lathe(c, th, r, zb, brim, np.array([0.0, 0.20, 0.24, 0.28]))
        F2 = F2[:, ::-1]
        return merge([(V, F, uv), (V2, F2, uv2)])
    if kind == 'police':
        prof = [(-0.003, -0.004), (0.0, 0.0), (0.002, 0.045), (lambda t: 0.028 + 0.012 * np.cos(t), lambda t: 0.060 + 0.022 * (0.5 + 0.5 * np.cos(t))),
                (lambda t: 0.030 + 0.013 * np.cos(t), lambda t: 0.066 + 0.024 * (0.5 + 0.5 * np.cos(t)))]
        V, F, uv = lathe(c, th, r, zb, prof, np.array([0.30, 0.34, 0.55, 0.78, 0.85]))
        V, F, uv = cap_top(V, F, uv, len(V) - nth, nth, np.array([c[0], c[1] - 0.012, zb.mean() + 0.082]), 1.0)
        fm = np.abs(np.angle(np.exp(1j * th))) < 1.25
        vis = [(0.0, 0.0), (lambda t: 0.055 * np.clip(np.cos(t) * 1.3 - 0.35, 0, 1) ** 0.5, lambda t: -0.022 * np.clip(np.cos(t) * 1.3 - 0.35, 0, 1) ** 0.5)]
        V2, F2, uv2 = lathe(c, th, r + 0.001, zb - 0.002, vis, np.array([0.05, 0.12]))
        keep = [k for k, f in enumerate(F2) if fm[f[0] % nth] and fm[f[3] % nth]]
        F2 = F2[keep][:, ::-1]
        return merge([(V, F, uv), (V2, F2, uv2)])
    if kind == 'flatcap':
        prof = [(-0.003, -0.003), (0.0, 0.0), (lambda t: 0.010 + 0.018 * np.clip(np.cos(t), 0, 1), lambda t: 0.034 - 0.010 * np.clip(np.cos(t), 0, 1)),
                (lambda t: -0.010 + 0.010 * np.clip(np.cos(t), 0, 1), lambda t: 0.060 - 0.024 * np.clip(np.cos(t), 0, 1) ** 0.7)]
        V, F, uv = lathe(c, th, r, zb, prof, np.array([0.30, 0.34, 0.70, 0.92]))
        V, F, uv = cap_top(V, F, uv, len(V) - nth, nth, np.array([c[0], c[1] + 0.004, zb.mean() + 0.058]), 1.0)
        fm = np.abs(np.angle(np.exp(1j * th))) < 1.0
        vis = [(0.0, 0.0), (lambda t: 0.045 * np.clip(np.cos(t) * 1.4 - 0.4, 0, 1) ** 0.5, lambda t: -0.012 * np.clip(np.cos(t) * 1.4 - 0.4, 0, 1) ** 0.5)]
        V2, F2, uv2 = lathe(c, th, r + 0.001, zb - 0.001, vis, np.array([0.05, 0.12]))
        keep = [k for k, f in enumerate(F2) if fm[f[0] % nth] and fm[f[3] % nth]]
        F2 = F2[keep][:, ::-1]
        return merge([(V, F, uv), (V2, F2, uv2)])
    if kind == 'knit':
        top = hd.center[2] + 0.115
        prof = [(-0.003, -0.004), (0.004, 0.0), (0.006, 0.040), (0.003, 0.046), (-0.004, 0.075), (-0.030, 0.105), (-0.060, 0.122)]
        V, F, uv = lathe(c, th, r, zb, prof, np.array([0.0, 0.05, 0.30, 0.34, 0.55, 0.80, 0.94]))
        V[-nth:, 2] = np.maximum(V[-nth:, 2], top - 0.008)
        V, F, uv = cap_top(V, F, uv, len(V) - nth, nth, np.array([c[0], c[1] + 0.008, top + 0.004]), 1.0)
        return merge([(V, F, uv)])
    if kind == 'hardhat':
        prof = [(-0.004, -0.002), (lambda t: 0.020 + 0.022 * np.abs(np.cos(t)), lambda t: -0.004 + 0.002 * np.abs(np.cos(t))),
                (lambda t: 0.022 + 0.024 * np.abs(np.cos(t)), 0.006), (0.012, 0.010), (0.014, 0.050), (-0.006, 0.095), (-0.040, 0.124)]
        V, F, uv = lathe(c, th, r, zb, prof, np.array([0.0, 0.08, 0.14, 0.20, 0.45, 0.75, 0.93]))
        V, F, uv = cap_top(V, F, uv, len(V) - nth, nth, np.array([c[0], c[1] + 0.005, zb.mean() + 0.134]), 1.0)
        return merge([(V, F, uv)])
    raise ValueError(kind)


def merge(parts):
    V = []; F = []; UV = []; off = 0
    for v, f, u in parts:
        V.append(v); F += [tuple(int(i) + off for i in q) for q in f]; UV.append(u); off += len(v)
    return np.vstack(V), F, np.vstack(UV)


def hat_band_z(hd, h):
    th, r, zb = head_band(hd, lift={'fedora': 0.020, 'police': 0.024, 'flatcap': 0.020, 'knit': 0.002, 'hardhat': 0.028}[h['kind']])
    return th, zb


def make_hair_vol(cid, hd, hs, hat=None):
    hl = PEOPLE[cid]['hairline']
    naz, nel = hs.get('naz', 36), hs.get('nel', 20)
    el_lo = min(hs['nape'], -20) - 6
    azs = np.linspace(-180, 180, naz, endpoint=False) + 180 / naz
    els = np.linspace(el_lo, 88, nel)
    A, E = np.meshgrid(azs, els)
    a = np.radians(A.ravel()); e = np.radians(E.ravel())
    dirs = np.stack([np.sin(a) * np.cos(e), -np.cos(a) * np.cos(e), np.sin(e)], 1)
    ok, P, Pj = hd.cast(dirs)
    dist = np.linalg.norm(P - hd.center, axis=1)
    dist = np.where(ok, dist, np.nan).reshape(nel, naz)
    for _ in range(3):
        bad = np.isnan(dist)
        if not bad.any():
            break
        f = np.where(bad, 0, dist); w = (~bad).astype(float)
        num = ndimage.uniform_filter(f, 3, mode='wrap'); den = ndimage.uniform_filter(w, 3, mode='wrap')
        dist = np.where(bad, num / np.maximum(den, 1e-6), dist)
    dist = np.nan_to_num(dist, nan=0.09)
    azj, elj = az_el(Pj.reshape(nel, naz, 3).reshape(-1, 3))
    hlv = curve(hl, A.ravel()).reshape(nel, naz)
    absaz = np.abs(A)
    style = hs['style']
    side_drop = sstep(62, 112, absaz)
    lim = hlv * (1 - side_drop) + hs['nape'] * side_drop
    if hs.get('fringe'):
        lim = np.where(absaz < 62, np.minimum(lim, hlv - 14 * sstep(62, 30, absaz)), lim)
    cover = E > lim
    th_top, th_side, th_back = hs['top'], hs['side'], hs['back']
    up = sstep(5, 55, E)
    sidew = np.exp(-((absaz - 90) / 40) ** 2); backw = sstep(110, 170, absaz)
    thick = th_top * up + (1 - up) * (th_side * sidew + th_back * backw + th_side * (1 - sidew - backw).clip(0))
    if hs.get('curl', 0) > 0:
        P3 = np.stack([A / 40.0, E / 40.0, np.zeros_like(A)], -1)
        thick = thick + hs['curl'] * (vnoise(P3, hs.get('curl_f', 3.0), 7) - 0.5) * 2
    edge = ndimage.distance_transform_edt(np.pad(cover, ((0, 0), (1, 1)), mode='wrap'))[:, 1:-1]
    bottom_open = (E < 0) & (absaz > 60)
    fall = np.where(bottom_open, 1.0, sstep(0.0, 2.0, edge))
    thick = np.maximum(thick, 0.002) * fall
    r = dist + thick
    if style in ('perm', 'bob'):
        req = np.interp(0.0, els, np.arange(nel))
        k0 = int(np.clip(round(req), 0, nel - 1))
        r_eq = r[k0] * np.cos(np.radians(els[k0]))
        for k in range(nel):
            if els[k] < 0:
                rxy = r[k] * np.cos(np.radians(els[k]))
                want = np.maximum(rxy, r_eq * (0.93 if style == 'bob' else 1.0))
                r[k] = np.where(absaz[k] > 50, want / np.cos(np.radians(els[k])), r[k])
    V = hd.center + dirs * r.ravel()[:, None]
    if style in ('perm', 'bob'):
        V3 = V.reshape(nel, naz, 3)
        for k in range(nel):
            if els[k] < 0:
                zt = hd.center[2] + np.sin(np.radians(els[k])) * dist[k] * 1.25
                V3[k, :, 2] = np.minimum(V3[k, :, 2], zt)
        V = V3.reshape(-1, 3)
    keep_v = cover.ravel()
    if hat is not None:
        hth, hzb = hat
        zl = np.interp(np.radians(A.ravel()), hth, hzb, period=2 * np.pi)
        keep_v &= V[:, 2] < zl + 0.010
    F = []
    for k in range(nel - 1):
        for i in range(naz):
            i2 = (i + 1) % naz
            q = (k * naz + i, k * naz + i2, (k + 1) * naz + i2, (k + 1) * naz + i)
            if all(keep_v[list(q)]):
                F.append(q)
    top = None
    if hat is None:
        ci = len(V)
        V = np.vstack([V, hd.center + np.array([0, 0.0, max(r[-1].max(), r[-2].mean()) + 0.003])])
        for i in range(naz):
            q = ((nel - 1) * naz + i, (nel - 1) * naz + (i + 1) % naz, ci)
            if keep_v[q[0]] and keep_v[q[1]]:
                F.append(q)
        keep_v = np.concatenate([keep_v, [True]])
    uv = np.stack([(np.concatenate([A.ravel(), [0]]) + 180) / 360, (np.concatenate([E.ravel(), [88]]) - el_lo) / (88 - el_lo)], 1)[:len(V)]
    used = np.unique(np.concatenate([np.array(f) for f in F]))
    rm = -np.ones(len(V), int); rm[used] = np.arange(len(used))
    F2 = [tuple(rm[list(f)]) for f in F]
    return V[used], F2, uv[used]


# ---------------------------------------------------------------- patterns and painting
def pnoise(U, V, f, seed):
    return vnoise(np.stack([U, V, np.zeros_like(U)], -1), f, seed)


def fabric(U, V, base, o, kind):
    base = lin(base)
    k = kind or 'plain'
    m = np.ones(U.shape)
    col = np.broadcast_to(base, U.shape + (3,)).copy()
    if k in ('wool', 'gabardine', 'serge', 'canvas', 'nylon', 'velour', 'plain'):
        f = {'wool': 260, 'gabardine': 900, 'serge': 1100, 'canvas': 420, 'nylon': 600, 'velour': 140, 'plain': 400}[k]
        amp = {'wool': 0.10, 'gabardine': 0.06, 'serge': 0.05, 'canvas': 0.12, 'nylon': 0.05, 'velour': 0.16, 'plain': 0.06}[k]
        m *= 1 + amp * (pnoise(U, V, f, 3) - 0.5) + 0.08 * (pnoise(U, V, 18, 4) - 0.5)
        if k in ('gabardine', 'serge'):
            m *= 1 + 0.05 * np.sin((U + V) * 2 * np.pi * 220)
    elif k == 'leather':
        cr = pnoise(U, V, 60, 5); m *= 0.85 + 0.35 * cr ** 2 + 0.10 * (pnoise(U, V, 300, 6) - 0.5)
    elif k == 'denim':
        m *= 1 + 0.10 * np.sin((U - V) * 2 * np.pi * 260) + 0.10 * (pnoise(U, V, 40, 7) - 0.5)
        fade = pnoise(U, V, 6, 8)
        col = col * (1 + 0.35 * fade[..., None])
    elif k == 'tweed':
        n1 = pnoise(U, V, 700, 9); n2 = pnoise(U, V, 260, 10)
        m *= 0.85 + 0.3 * n1
        fleck = (n2 > 0.78)[..., None]
        col = np.where(fleck, lin((0.55, 0.45, 0.30)), col)
        m *= 1 + 0.08 * np.sign(np.sin(U * 2 * np.pi * 140)) * np.sign(np.sin(V * 2 * np.pi * 140))
    elif k == 'pinstripe':
        s = np.abs(((U * 1000 / 12.0) % 1.0) - 0.5) < 0.05
        col = np.where(s[..., None], col * 1.9 + 0.01, col)
        m *= 1 + 0.05 * (pnoise(U, V, 700, 11) - 0.5)
    elif k == 'plaid':
        c2 = lin(o.get('color2', (0.05, 0.05, 0.05)))
        gu = (U * 1000 / 46.0) % 1.0; gv = (V * 1000 / 46.0) % 1.0
        band = lambda g, w: np.abs(g - 0.5) < w
        mix = 0.55 * band(gu, 0.16) + 0.55 * band(gv, 0.16) + 0.25 * band((U * 1000 / 46.0 + 0.5) % 1.0, 0.03) + 0.25 * band((V * 1000 / 46.0 + 0.5) % 1.0, 0.03)
        mix = np.clip(mix, 0, 1)[..., None]
        col = col * (1 - mix) + c2 * mix
        m *= 1 + 0.18 * (np.sin(U * 2 * np.pi * 220) * np.sin(V * 2 * np.pi * 300)) + 0.08 * (pnoise(U, V, 600, 12) - 0.5)
    elif k == 'janine_stripes':
        c2 = lin(o.get('color2', (0.5, 0.5, 0.55)))
        g = (U * 1000 / 34.0) % 1.0
        st = (np.abs(g - 0.22) < 0.07) | (np.abs(g - 0.52) < 0.025) | (np.abs(g - 0.62) < 0.025)
        dots = (np.abs(g - 0.82) < 0.04) & (np.abs(((V * 1000 / 9.0) % 1.0) - 0.5) < 0.3)
        col = np.where(st[..., None], c2, col)
        col = np.where(dots[..., None], c2 * 0.8, col)
        m *= 1 + 0.04 * (pnoise(U, V, 900, 13) - 0.5)
    return col * m[..., None]


def body_uv_coords(P, R, L):
    torso_u = np.arctan2(P[:, 0], -(P[:, 1] - 0.01)) * 0.15
    arm = (R == 2) | (R == 3) | (R == 4)
    U = np.where(arm, L['ang'] * 0.045 + np.sign(P[:, 0]) * 3.0, torso_u)
    V = np.where(arm, -L['along'], P[:, 2])
    legs = (R == 5) | (R == 6) | (R == 7)
    cx = np.where(P[:, 0] >= 0, 0.095, -0.095)
    U = np.where(legs, np.arctan2(P[:, 0] - cx, -P[:, 1]) * 0.07 + np.sign(P[:, 0]) * 1.5, U)
    return U, V


def proximity_ao(Pts, R):
    tree = cKDTree(BV)
    out = np.ones(len(Pts))
    cnt = tree.query_ball_point(Pts, 0.07, return_length=True)
    idx = tree.query_ball_point(Pts, 0.07)
    for i, (ii, r) in enumerate(zip(idx, R)):
        if not ii:
            continue
        rr = REG[ii]
        other = ((rr == 0) & np.isin(r, (2, 3, 4))) | (np.isin(rr, (2, 3, 4)) & (r == 0)) | (np.isin(rr, (5, 6)) & np.isin(r, (5, 6)) & (np.sign(BV[ii, 0]) != np.sign(Pts[i, 0])))
        out[i] = 1 - 0.35 * min(1.0, other.sum() / 25)
    return out


def paint_points(P, N, R, skin, o, sg_noise=0):
    n = len(P); z = P[:, 2]; x = P[:, 0]; y = P[:, 1]
    L = body_layers(P, R, o)
    U, V = body_uv_coords(P, R, L)
    col = skin.copy()
    top, legs, shoes, vest, under = o.get('top'), o.get('legs'), o.get('shoes'), o.get('vest'), o.get('under')
    if legs:
        if legs['kind'] in ('skirt', 'tights'):
            tc = lin(legs.get('tights', legs.get('color')))
            sheer = legs.get('sheer', 0.5)
            m = L['tights']
            tint = col * tc / np.maximum(lin((0.5, 0.36, 0.30)), 1e-3)
            mixc = col * (sheer) * 0.5 + tc * (1 - sheer) + tint * sheer * 0.5
            col[m] = mixc[m]
            if legs['kind'] == 'skirt':
                m2 = L['legs']
                col[m2] = fabric(U, V, legs['color'], legs, legs.get('pattern', 'wool'))[m2]
        else:
            kind = {'jeans': 'denim', 'track': 'velour', 'trousers': 'gabardine'}[legs['kind']]
            lc = fabric(U, V, legs['color'], legs, kind)
            if legs['kind'] == 'jeans':
                seam = (np.abs(np.abs(x) - 0.095 - 0.0) > 0) & (np.abs(np.arctan2(x - np.sign(x) * 0.095, -y)) - np.pi / 2 < 0.04) & (np.abs(np.abs(np.arctan2(x - np.sign(x) * 0.095, -y)) - np.pi / 2) < 0.05)
                lc[seam] = lc[seam] * 0.6 + lin((0.75, 0.55, 0.25)) * 0.4
            if legs.get('stripe'):
                side = np.abs(np.abs(np.arctan2(x - np.sign(x) * 0.095, -y)) - np.pi / 2) < 0.12
                lc[side & (z < 1.0)] = lin(legs['stripe'])
            crease = np.exp(-((np.arctan2(x - np.sign(x) * 0.095, -y)) / 0.05) ** 2) * (z < 0.80)
            lc *= (1 + 0.10 * crease)[:, None]
            folds = 1 - 0.12 * np.clip(np.sin(z * 2 * np.pi * 26 + pnoise(U, V, 30, 15) * 6), 0, 1) * sstep(0.22, 0.10, z)
            lc *= folds[:, None]
            m = L['legs']
            col[m] = lc[m]
    if under is not None and top:
        vm, edge = neck_v(P, o)
        uc = np.broadcast_to(lin(under['color']), (n, 3)).copy() * (1 + 0.05 * (pnoise(U, V, 500, 16) - 0.5))[:, None]
        if under.get('tie'):
            tw = 0.010 + 0.012 * sstep(1.42, 1.25, z)
            tie = np.abs(x) < tw
            uc[tie] = lin(under['tie']) * (1 + 0.15 * np.sin((U[tie] + V[tie]) * 2 * np.pi * 60))[:, None]
        col[vm & (R == 0)] = uc[vm & (R == 0)]
    if top:
        k = top['kind']
        pat = top.get('pattern', 'wool')
        tc = fabric(U, V, top['color'], top, pat)
        vm, edge = neck_v(P, o)
        m = L['top'] & ~(vm & (R == 0) & (under is not None))
        if k in ('coat', 'suit') and under is not None:
            lap = (edge > 0) & (R == 0) & ~vm
            tc[lap] *= (1 - 0.35 * np.exp(-((edge[lap] - 1.0) / 0.12) ** 2))[:, None]
        if top.get('belt'):
            bz = np.abs(z - 1.01) < 0.022
            tc[bz & (R == 0)] *= 0.82
            tc[bz & (R == 0) & (np.abs(x) < 0.025) & (y < 0)] = lin((0.55, 0.45, 0.30))
        btn = top.get('buttons')
        if btn:
            xs = [0.0] if btn == 'single' else [-0.055, 0.055]
            zz = np.arange(0.90 if k == 'coat' else 0.92, 1.30, 0.075)
            for bx in xs:
                for bzz in zz:
                    d = np.hypot(x - bx, z - bzz)
                    b = (d < 0.008) & (y < -0.02) & (R == 0)
                    tc[b] = lin(top.get('color2', (0.1, 0.1, 0.1))) * 0.6
        if top.get('zip'):
            zm = (np.abs(x) < 0.004) & (y < -0.02) & (R == 0)
            tc[zm] = lin((0.42, 0.42, 0.40))
        if k in ('coat', 'suit', 'work', 'leather', 'denim', 'uniform'):
            for sg in (1, -1):
                pk = (np.abs(x - sg * 0.085) < 0.045) & (np.abs(z - (0.93 if k != 'uniform' else 1.24)) < 0.003) & (y < 0) & (R == 0)
                tc[pk] *= 0.55
        if k == 'denim':
            yoke = (np.abs(z - 1.30) < 0.003) & (R == 0)
            tc[yoke] = tc[yoke] * 0.5 + lin(top['color2']) * 0.5
            seam = (np.abs(np.abs(x) - 0.06) < 0.0025) & (z < 1.30) & (R == 0)
            tc[seam] = tc[seam] * 0.5 + lin(top['color2']) * 0.5
        if top.get('stripes'):
            arm = (R == 2) | (R == 3)
            st = arm & (np.abs(np.abs(L['ang']) - np.pi / 2) < 0.22)
            tc[st] = lin(top['color2'])
        if top.get('cuffband'):
            cb = ((R == 2) | (R == 3)) & (L['dw'] < 0.07)
            tc[cb] *= 0.8
            hb = (R == 0) & (z < top['hem'] + 0.05)
            tc[hb] *= 0.8
        if top.get('badge'):
            bd = (np.hypot(x - 0.075, z - 1.27) < 0.022) & (y < 0) & (R == 0)
            tc[bd] = lin((0.85, 0.66, 0.25)) * (1 + 0.3 * pnoise(U[bd], V[bd], 800, 17))[:, None]
            nm = (np.abs(x + 0.075) < 0.03) & (np.abs(z - 1.26) < 0.006) & (y < 0) & (R == 0)
            tc[nm] = lin((0.06, 0.06, 0.06))
        if top.get('patches'):
            arm = R == 2
            pt = arm & (np.abs(L['along'] - 0.07) < 0.035) & (np.abs(np.abs(L['ang']) - np.pi / 2) < 0.6)
            tc[pt] = lin((0.70, 0.60, 0.30)) * 0.6 + lin((0.10, 0.12, 0.30)) * 0.4
        cuff = ((R == 2) | (R == 3)) & (L['dw'] < 0.045)
        tc[cuff] *= 0.85
        elbow = ((R == 2) | (R == 3)) & (np.abs(L['along'] - 0.33) < 0.08)
        fold = 1 - 0.14 * np.clip(np.sin(L['along'] * 2 * np.pi * 30 + L['ang'] * 1.5), 0, 1) * elbow
        tc *= fold[:, None]
        hem = (R == 0) & (np.abs(z - top['hem']) < 0.012) if k != 'coat' else np.zeros(n, bool)
        tc[hem] *= 0.8
        col[m] = tc[m]
    if vest:
        vc = fabric(U, V, vest['color'], vest, vest.get('pattern', 'canvas'))
        vm2 = L['vest'].copy()
        if vest.get('neck') == 'v':
            vv = (y < -0.01) & (np.abs(x) < np.clip((z - 1.22) / 0.2, 0, 1) * 0.07) & (z > 1.22)
            vm2 &= ~vv
        if vest['kind'] == 'safety':
            for zz in (1.02, 1.16):
                st = np.abs(z - zz) < 0.022
                vc[st] = lin(vest['color2']) * (1 + 0.2 * pnoise(U[st], V[st], 300, 18))[:, None]
            sh = (np.abs(np.abs(x) - 0.10) < 0.022) & (z > 1.16)
            vc[sh] = lin(vest['color2'])
        arm_ring = np.zeros(n, bool)
        col[vm2] = vc[vm2]
    belt = o.get('belt')
    if belt:
        bz = (np.abs(z - belt['z']) < 0.024) & (R == 0)
        col[bz] = lin(belt['color']) * (1 + 0.15 * pnoise(U[bz], V[bz], 200, 19))[:, None]
        bk = bz & (np.abs(x) < 0.03) & (y < 0)
        col[bk] = lin((0.80, 0.68, 0.35)) if belt.get('gear') else lin((0.6, 0.6, 0.6))
        if belt.get('gear'):
            for gx in (-0.15, 0.15, -0.11):
                g = (np.abs(x - gx) < 0.025) & (np.abs(z - belt['z'] + 0.02) < 0.04) & (R == 0)
                col[g] = lin((0.03, 0.03, 0.03))
    if shoes:
        sm = L['shoes']
        sc = np.broadcast_to(lin(shoes['color']), (n, 3)).copy()
        sk = shoes['kind']
        if sk in ('sneakers', 'hightops'):
            sole = z < 0.022
            sc[sole] = lin((0.92, 0.92, 0.90)) if sk == 'sneakers' else lin((0.85, 0.84, 0.80))
            if shoes.get('stripe'):
                st = (np.abs(z - 0.045 - 0.25 * (y + 0.05)) < 0.006) & (np.abs(x) > 0.11)
                sc[st] = lin(shoes['stripe'])
            lace = (np.abs(x - np.sign(x) * 0.115) < 0.012) & (y < -0.07) & (z > 0.045)
            sc[lace] *= 0.85
        else:
            sole = z < 0.012
            sc[sole] = lin((0.05, 0.04, 0.035))
            sc *= (1 + 0.25 * np.clip(pnoise(U, V, 30, 20) - 0.4, 0, 1))[:, None]
        if shoes.get('socks') is not None:
            so = ((R == 6) | (R == 7)) & (z >= 0.075) & (z < 0.11)
            col[so] = lin(shoes['socks'])
        col[sm] = sc[sm]
    return col, L


def paint_body_tex(cid, size, Vb):
    o = PEOPLE[cid]['outfit']
    T = []; TL = []
    for i, f in enumerate(BFc):
        s0 = SB['ls'][i]
        for k in range(1, len(f) - 1):
            T.append((f[0], f[k], f[k + 1])); TL.append((s0, s0 + k, s0 + k + 1))
    T = np.array(T); TL = np.array(TL)
    VN = vnormals(BV, T)
    oh = np.eye(8)[REG]
    ao_v = proximity_ao(BV, REG)
    att = np.concatenate([BV[T], VN[T], oh[T], ao_v[T][..., None]], 2)
    out, mask, tid = SK.raster(BUV[TL], att, size)
    P = SK.bleed(out[..., :3], mask).reshape(-1, 3); N = SK.bleed(out[..., 3:6], mask).reshape(-1, 3)
    R = np.argmax(SK.bleed(out[..., 6:14], mask), axis=2).ravel()
    ao = SK.bleed(out[..., 14], mask).ravel()
    sk = np.asarray(Image.open(HERE + f'/tex/{cid}/body_basecolor.jpg').convert('RGB').resize((size, size), Image.LANCZOS), np.float32).reshape(-1, 3) / 255
    skin = s2l(sk)
    col, L = paint_points(P, N, R, skin, o)
    covered = L['top'] | L['legs'] | L['shoes'] | L['vest']
    col *= np.where(covered, ao, 1.0)[:, None]
    up = np.clip(N[:, 2] * 0.5 + 0.5, 0, 1)
    col *= np.where(covered, 0.88 + 0.12 * up, 1.0)[:, None]
    img = l2s(np.clip(col, 0, 1)).reshape(size, size, 3)
    return img


def paint_tube(o, kind, size_wh, th, zs, color, pattern, opts):
    w, h = size_wh
    uu, vv = np.meshgrid((np.arange(w) + 0.5) / w, (np.arange(h) + 0.5) / h)
    v_img = 1 - vv
    tt = -np.pi + uu * 2 * np.pi
    zz = np.interp(v_img, [0.02, 0.06, 1.0], [zs[-1] + 0.012, zs[-1], zs[0]])
    U = tt * 0.15 * (0.95 + 0.1 * 0)
    col = fabric(U, zz, color, opts, pattern)
    x = np.sin(tt); front = np.cos(tt)
    if kind == 'coat':
        btn = opts.get('buttons')
        if btn == 'double':
            ov = (np.abs(tt - 0.38) < 0.012) & (zz > zs[-1] + 0.02)
            col[ov] *= 0.55
        else:
            ov = (np.abs(tt) < 0.008)
            col[ov] *= 0.6
        if opts.get('belt'):
            bz = np.abs(zz - 1.01) < 0.022
            col[bz] *= 0.82
        hem = zz < zs[-1] + 0.015
        col[hem] *= 0.75
        back = np.abs(np.abs(tt) - np.pi) < 0.006
        col[back & (zz < zs[-1] + 0.25)] *= 0.5
    else:
        hem = zz < zs[-1] + 0.012
        col[hem] *= 0.8
    folds = 1 - 0.12 * np.clip(np.sin(tt * 9 + np.sin(zz * 14) * 0.6), 0, 1) * sstep(zs[0], zs[-1], zz)
    col *= folds[..., None]
    col *= (0.82 + 0.18 * sstep(zs[-1], zs[0], zz))[..., None]
    return l2s(np.clip(col, 0, 1))


def paint_hair(hs, w, h, el_lo):
    uu, vv = np.meshgrid((np.arange(w) + 0.5) / w, (np.arange(h) + 0.5) / h)
    az = uu * 360 - 180; el = el_lo + (1 - vv) * (88 - el_lo)
    base = lin(hs['color'])
    P3 = np.stack([az / 30.0, el / 30.0, np.zeros_like(az)], -1)
    streak = vnoise(np.stack([az / 2.2, el / 40.0, np.zeros_like(az)], -1), 1.0, 21)
    clump = vnoise(P3, 2.0, 22)
    m = 0.7 + 0.45 * streak + 0.25 * (clump - 0.5)
    if hs.get('curl', 0) > 0:
        cu = vnoise(np.stack([az / 4.0, el / 4.0, np.zeros_like(az)], -1), 1.0, 23)
        m = 0.65 + 0.5 * cu ** 1.5 + 0.15 * streak
    col = base * m[..., None]
    root = sstep(-10, 60, el)
    col *= (0.85 + 0.15 * root)[..., None]
    return l2s(np.clip(col, 0, 1))


def paint_hat(h, w, hh):
    uu, vv = np.meshgrid((np.arange(w) + 0.5) / w, (np.arange(hh) + 0.5) / hh)
    t = -np.pi + uu * 2 * np.pi; s = 1 - vv
    kind = h['kind']
    U = t * 0.1; V = s * 0.2
    col = fabric(U, V, h['color'], h, h.get('pattern', 'wool' if kind != 'hardhat' else 'nylon'))
    if kind == 'fedora':
        band = (s > 0.32) & (s < 0.44)
        col[band] = lin(h['band']) * (1 + 0.1 * np.sin(U[band] * 300))[:, None]
        col[s < 0.30] *= 0.9
    elif kind == 'police':
        col[(s > 0.32) & (s < 0.55)] *= 0.55
        vis = s < 0.14
        col[vis] = lin(h['visor']) * (1 + 0.3 * np.clip(np.cos(t[vis] * 2), 0, 1))[:, None]
        bd = (np.abs(t) < 0.16) & (s > 0.36) & (s < 0.52)
        col[bd] = lin(h['badge']) * (1 + 0.4 * pnoise(U[bd], V[bd], 400, 24))[:, None]
    elif kind == 'knit':
        rib = 1 + 0.15 * np.sin(t * 90)
        col *= rib[..., None]
        col[s < 0.30] *= 0.85
    elif kind == 'hardhat':
        ridge = np.abs(t) < 0.05
        col[ridge & (s > 0.3)] *= 0.85
        col *= (1 - 0.15 * np.clip(pnoise(U, V, 40, 25) - 0.55, 0, 1) * 4)[..., None]
        logo = (np.abs(t) < 0.22) & (s > 0.48) & (s < 0.62)
        col[logo] = lin((0.12, 0.22, 0.55))
    return l2s(np.clip(col, 0, 1))


def paint_collar(o, kind, w, h):
    top = o.get('top') or {}
    uu, vv = np.meshgrid((np.arange(w) + 0.5) / w, (np.arange(h) + 0.5) / h)
    U = uu * 0.4; V = (1 - vv) * 0.05
    if kind == 'fur':
        col = fabric(U, V, (0.30, 0.22, 0.16), {}, 'velour') * (0.7 + 0.6 * vnoise(np.stack([U * 40, V * 200, 0 * U], -1), 1.0, 26))[..., None]
    elif kind in ('shirt', 'blouse') and top.get('kind') != 'uniform':
        c = (o.get('top') or {}).get('color', (0.9, 0.9, 0.9))
        col = fabric(U, V, c, top, top.get('pattern', 'plain'))
    else:
        col = fabric(U, V, top.get('color', (0.3, 0.3, 0.3)), top, top.get('pattern', 'wool'))
        col *= (0.85 + 0.15 * (1 - vv))[..., None]
    return l2s(np.clip(col, 0, 1))


def eye_cell(cid, s, size):
    im = Image.open(HERE + f'/tex/{cid}/eye{s}_basecolor.jpg').convert('RGB').resize((size, size), Image.LANCZOS)
    return np.asarray(im, np.float32) / 255


def solid_colors(cid):
    o = PEOPLE[cid]['outfit']
    g = PEOPLE[cid].get('glasses') or {}
    return dict(teeth=(0.80, 0.77, 0.70), gums=(0.62, 0.32, 0.32), tongue=(0.55, 0.25, 0.26), earring=o.get('earrings') or (0.8, 0.7, 0.4),
                frame=g.get('color', (0.1, 0.08, 0.06)), lens=g.get('tint', (0.6, 0.6, 0.6)), badge=(0.85, 0.66, 0.25), dark=(0.02, 0.02, 0.02),
                sole=(0.06, 0.05, 0.05), buckle=(0.7, 0.62, 0.4), mouth=(0.18, 0.06, 0.06))


def put_rect(img, name, tile):
    H, W = img.shape[:2]
    u0, v0, u1, v1 = RECT[name]
    x0, x1 = int(round(u0 * W)), int(round(u1 * W)); y0, y1 = int(round((1 - v1) * H)), int(round((1 - v0) * H))
    t = np.asarray(Image.fromarray((np.clip(tile, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((x1 - x0, y1 - y0), Image.LANCZOS), np.float32) / 255
    img[y0:y1, x0:x1] = t


def rect_px(name, H, W):
    u0, v0, u1, v1 = RECT[name]
    return int(round((u1 - u0) * W)), int(round((v1 - v0) * H))
