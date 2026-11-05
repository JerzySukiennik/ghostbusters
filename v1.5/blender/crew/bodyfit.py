# Crew bodies and uniform refit in Jurek-normalized rig space: bone-radial girth maps keeping the cloth ease, soft bulges, rigid tag/patch, clearance push.
import numpy as np, sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crewlib import *
from design import CREW
from faces import neck_drop

RIG = load('rig'); NAMES = [str(n) for n in RIG['names']]; REST = RIG['rest']; HEADS = RIG['heads']; TAILS = RIG['tails']
BI = {n: i for i, n in enumerate(NAMES)}
BODY = load('src_body'); BV = BODY['co']; BF = faces_of(BODY); BT = tris_of(BF); BW = BODY['W'].astype(float); REG = BODY['region'].astype(int)
BN = vnormals(BV, BT)
NECK_A = HEADS[BI['Neck']]; NECK_B = HEADS[BI['Head']] + np.array([0, 0, 0.03])
TORSO = {'Hips', 'Spine', 'Spine1', 'Spine2'}
NECK_Z0, NECK_Z1 = 1.415, 1.505
GARMENTS = ['Suit', 'Boots', 'Belt', 'NameTag', 'Patch', 'Harness']


def _torso_center():
    zs = np.linspace(0.80, 1.50, 36); yc = []
    m = (REG == 0) | (REG == 1)
    for z in zs:
        sel = m & (np.abs(BV[:, 2] - z) < 0.01) & (np.abs(BV[:, 0]) < 0.06)
        yc.append(0.5 * (BV[sel, 1].min() + BV[sel, 1].max()) if sel.sum() > 3 else 0.005)
    return zs, smooth_1d(np.array(yc), 3)


def smooth_1d(a, it):
    a = a.copy()
    for _ in range(it):
        a[1:-1] = 0.25 * a[:-2] + 0.5 * a[1:-1] + 0.25 * a[2:]
    return a


TZ, TYC = _torso_center()


def interp_tab(tab, z, col):
    zz = np.array([r[0] for r in tab]); vv = np.array([r[col] for r in tab])
    return np.interp(z, zz, vv)


def tri_interp(trip, t):
    return np.interp(t, [0.15, 0.5, 0.9], list(trip))


def radial(P, origin, ax_x, ax_y, ax_z, kx, kzf, kzb, d, e):
    v = P - origin
    a = v @ ax_y; px = v @ ax_x; pz = v @ ax_z
    rho = np.sqrt(px * px + pz * pz) + 1e-9
    dd = np.clip(d, 0, None)
    rb = np.maximum(rho - dd, 0.3 * rho)
    f = rb / rho
    kz = np.where(pz > 0, kzf, kzb)
    bx = px * f * kx; bz = pz * f * kz
    ex = (rho - rb) * e
    nx = bx + px / rho * ex; nz = bz + pz / rho * ex
    return origin + np.outer(a, ax_y) + nx[:, None] * ax_x + nz[:, None] * ax_z


def bone_map(name, P, d, e, B):
    i = BI[name]; M = REST[i]; h = HEADS[i]; L = max(np.linalg.norm(TAILS[i] - h), 1e-6)
    x, y, z = M[:3, 0], M[:3, 1], M[:3, 2]
    t = ((P - h) @ y) / L
    one = np.ones(len(P))
    if name in TORSO or name.endswith('Shoulder') and False:
        pass
    if name in TORSO:
        zc = P[:, 2]
        yc = np.interp(zc, TZ, TYC)
        org = np.stack([np.zeros(len(P)), yc, zc], 1)
        kx = interp_tab(B['torso'], zc, 1); kf = interp_tab(B['torso'], zc, 2); kb = interp_tab(B['torso'], zc, 3)
        v = P - org
        px = v[:, 0]; pz = -v[:, 1]
        rho = np.sqrt(px * px + pz * pz) + 1e-9
        rb = np.maximum(rho - np.clip(d, 0, None), 0.3 * rho); f = rb / rho
        kz = np.where(pz > 0, kf, kb)
        ex = (rho - rb) * e
        nx = px * f * kx + px / rho * ex; nz = pz * f * kz + pz / rho * ex
        return np.stack([nx, yc - nz, zc], 1)
    if name in ('Neck', 'Head'):
        return neck_map(P, d, e, B)
    if name.endswith('Shoulder'):
        k = B['trap'] * one
        return radial(P, h, x, y, z, k, k, k, d, e)
    if name.endswith('ForeArm'):
        k = tri_interp(B['forearm'], t)
    elif name.endswith('Arm'):
        k = tri_interp(B['upperarm'], t)
        k = np.where(t < 0.3, k + (B['delt'] - k) * sstep(0.3, 0.0, t), k)
    elif 'Hand' in name:
        k = B['hand'] * one
    elif name.endswith('UpLeg'):
        k = tri_interp(B['thigh'], t)
        px = (P - h) @ x
        kin = 1 + 0.45 * (k - 1)
        kxv = np.where(px > 0, kin, k)
        return radial(P, h, x, y, z, kxv, k, k, d, e)
    elif name.endswith('Leg'):
        k = tri_interp(B['shin'], t)
    elif 'Foot' in name or 'Toe' in name:
        k = B['foot'] * one
        Q = radial(P, h, x, y, z, k, k, k, d, e)
        return Q
    else:
        return P.copy()
    return radial(P, h, x, y, z, k, k, k, d, e)


def neck_map(P, d, e, B):
    ax = NECK_B - NECK_A; L = np.linalg.norm(ax); y = ax / L
    x = np.array([1.0, 0, 0]); z = np.cross(x, y); z = -z if z[1] > 0 else z
    t = ((P - NECK_A) @ y) / L
    kt = interp_tab(B['torso'], np.full(len(P), 1.42), 1)
    k = B['neck'] + (kt - B['neck']) * sstep(0.15, -0.25, t)
    return radial(P, NECK_A, x, y, z, k, k, k, d, e)


def neck_dz(P, B):
    drop = B.get('neck_drop', 0.0)
    if drop <= 0:
        return np.zeros(len(P))
    ax = NECK_B - NECK_A
    t = np.clip((P[:, 2] - NECK_A[2]) / ax[2], 0, 1.5)
    c = NECK_A + t[:, None] * ax
    r = np.hypot(P[:, 0] - c[:, 0], P[:, 1] - c[:, 1])
    return -drop * sstep(NECK_Z0, NECK_Z1, P[:, 2]) * sstep(0.12, 0.075, r)


def warp_points(P, W, d, e, B):
    P = np.asarray(P, float); W = np.asarray(W, float)
    W = W / np.maximum(W.sum(1, keepdims=True), 1e-9)
    out = np.zeros_like(P)
    used = np.where(W.max(0) > 1e-5)[0]
    for bi in used:
        w = W[:, bi]; m = w > 1e-5
        if not m.any():
            continue
        Q = bone_map(NAMES[bi], P[m], d[m], e[m] if np.ndim(e) else np.full(m.sum(), e), B)
        out[m] += Q * w[m, None]
    zero = W.sum(1) < 1e-6
    out[zero] = P[zero]
    out[:, 2] += neck_dz(P, B)
    return out


def bulge_field(P, N, B):
    D = np.zeros_like(P)
    for name, c, sig, amp in B['bulges']:
        q = (P - np.asarray(c)) / np.asarray(sig)
        g = np.exp(-(q * q).sum(1))
        if name.startswith('breast'):
            low = np.clip(-(P[:, 2] - c[2]) / sig[2], 0, 1.5)
            g = g * (1 + 0.35 * low) * sstep(-0.02, 0.03, -(P[:, 1] - c[1]) + 0.04)
            dirn = N * 0.55 + np.array([0, -1.0, 0]) * 0.45
        elif name == 'belly':
            dirn = N * 0.45 + np.array([0, -1.0, -0.15]) * 0.55
            g = g * sstep(-0.02, 0.04, -(P[:, 1] - 0.0))
        else:
            dirn = N
        dirn = dirn / np.linalg.norm(dirn, axis=1, keepdims=True)
        D += dirn * (amp * g)[:, None]
    return D


def body_params(cid):
    B = dict(CREW[cid]['body']); B['neck_drop'] = neck_drop(cid, CREW[cid]['s'])
    return B


def build_body(cid):
    B = body_params(cid)
    d = np.zeros(len(BV))
    V1 = warp_points(BV, BW, d, 1.0, B)
    E = edges_of(BF); M = adjacency(len(BV), E)
    disp = smooth(V1 - BV, M, 3, 0.5)
    V1 = BV + disp
    V2 = V1 + bulge_field(BV, BN, B)
    disp = smooth(V2 - BV, M, 2, 0.5)
    return BV + disp, V1


SUIT_SHELL = {}
TEE = {}


def components(n, F):
    import scipy.sparse as sp_
    from scipy.sparse.csgraph import connected_components
    E = edges_of(F)
    A = sp_.coo_matrix((np.ones(len(E)), (E[:, 0], E[:, 1])), shape=(n, n))
    return connected_components(A, directed=False)[1]


def rigid_fit(X, Y):
    cx, cy = X.mean(0), Y.mean(0)
    H = (X - cx).T @ (Y - cy)
    U, S, Vt = np.linalg.svd(H)
    D = np.eye(3); D[2, 2] = np.sign(np.linalg.det(Vt.T @ U.T))
    R = Vt.T @ D @ U.T
    return (X - cx) @ R.T + cy


def build_garments(cid, Vbody, Vradial):
    B = body_params(cid)
    TBN = vnormals(Vbody, BT)
    out = {}
    belly = [b for b in B['bulges'] if b[0] == 'belly']
    for g in GARMENTS:
        G = load('gb_' + g)
        P = G['co']; W = G['W'].astype(float)
        att = Attach(BV, BT, P)
        q = att.point(BV); nq = att.interp(BN); nq /= np.linalg.norm(nq, axis=1, keepdims=True)
        dsg = ((P - q) * nq).sum(1)
        e = np.full(len(P), B['ease'])
        if belly:
            c, sig = np.asarray(belly[0][1]), np.asarray(belly[0][2])
            qq = (q - c) / (sig * 1.3)
            gb = np.exp(-(qq * qq).sum(1)) * sstep(0.0, 0.05, -(q[:, 1]))
            e = e * (1 - (1 - B['belly_ease']) * gb)
        Q = warp_points(P, W, dsg, e, B)
        bul = att.interp(Vbody - Vradial)
        Q = Q + bul
        F = faces_of(G)
        if g in ('NameTag', 'Patch'):
            Q = rigid_fit(P, Q)
        else:
            Mg = adjacency(len(P), edges_of(F))
            disp = smooth(Q - P, Mg, 8 if g == 'Suit' else 4, 0.5)
            if g == 'Suit':
                lab = components(len(P), F)
                shell = lab == np.bincount(lab).argmax()
                from scipy.spatial import cKDTree
                tr = cKDTree(P[shell])
                dd, ii = tr.query(P[~shell], k=6)
                w = 1.0 / np.maximum(dd, 1e-4) ** 2; w /= w.sum(1, keepdims=True)
                disp[~shell] = (disp[shell][ii] * w[..., None]).sum(1)
                for l in np.unique(lab):
                    mm_ = lab == l
                    if 150 < mm_.sum() < 400 and np.linalg.norm(P[mm_].mean(0) - np.array([0.0, -0.04, 1.39])) < 0.03:
                        own = Q - P
                        own = smooth(own, Mg, 6, 0.5)
                        disp[mm_] = own[mm_]
                        TEE[cid] = mm_
                SUIT_SHELL[cid] = shell
            Q = P + disp
        out[g] = Q
    tatt = None
    for g in ('Suit', 'Belt', 'Harness', 'Boots'):
        Q = out[g]
        for it in range(3):
            att = Attach(Vbody, BT, Q)
            q = att.point(Vbody); nq = att.interp(TBN); nq /= np.linalg.norm(nq, axis=1, keepdims=True)
            sd = ((Q - q) * nq).sum(1)
            clear = 0.004 if g != 'Boots' else 0.003
            if B['bulges'] and g in ('Suit', 'Harness', 'Belt'):
                pj = att.point(BV); nj = att.interp(BN)
                amps = max(x[3] for x in B['bulges'])
                bmag = np.linalg.norm(bulge_field(pj, nj, B), axis=1) / max(amps, 1e-6)
                clear = clear + 0.008 * np.clip(bmag * 1.6, 0, 1)
            bad = (sd < clear) & (att.d < 0.06)
            if g == 'Boots':
                bad &= load('gb_Boots')['co'][:, 2] > 0.024
            if g == 'Suit' and cid in SUIT_SHELL:
                bad &= SUIT_SHELL[cid]
            cl = np.broadcast_to(clear, sd.shape)
            Q[bad] += nq[bad] * (cl[bad] - sd[bad])[:, None]
        out[g] = Q
    S = out['Suit']; SG = load('gb_Suit'); ST = tris_of(faces_of(SG)); SN = vnormals(S, ST)
    if cid in TEE:
        tee = TEE[cid]; idx = np.where(tee)[0]
        P0 = SG['co'][idx]
        att = Attach(BV, BT, P0)
        q0 = att.point(BV); n0 = att.interp(BN); n0 /= np.linalg.norm(n0, axis=1, keepdims=True)
        off = np.clip(((P0 - q0) * n0).sum(1), 0.0010, 0.0024)
        q1 = att.point(Vbody); n1 = att.interp(TBN); n1 /= np.linalg.norm(n1, axis=1, keepdims=True)
        S[idx] = q1 + n1 * off[:, None]
        out['Suit'] = S
    for g in ('NameTag', 'Patch', 'Belt'):
        Q = out[g]
        att = Attach(S, ST, Q)
        q = att.point(S); nq = att.interp(SN); nq /= np.linalg.norm(nq, axis=1, keepdims=True)
        sd = ((Q - q) * nq).sum(1)
        P0 = load('gb_' + g)['co']; S0 = SG['co']
        att0 = Attach(S0, ST, P0); sd0 = ((P0 - att0.point(S0)) * att0.interp(vnormals(S0, ST))).sum(1)
        need = np.minimum(sd0, 0.0008) - sd
        if g in ('NameTag', 'Patch'):
            push = max(0.0, float(np.percentile(need, 98)))
            out[g] = Q + nq.mean(0) / np.linalg.norm(nq.mean(0)) * push
        else:
            m = need > 0
            Q[m] += nq[m] * need[m, None]
            out[g] = Q
    return out


if __name__ == '__main__':
    cids = [a for a in sys.argv[1:] if a.startswith('crew')] or list(CREW)
    prev = '--preview' in sys.argv
    os.makedirs(WORK + '/dbg', exist_ok=True)
    for cid in cids:
        Vb, Vr = build_body(cid)
        G = build_garments(cid, Vb, Vr)
        np.savez(CACHE + f'/{cid}_body.npz', body=Vb, body_raw=Vb, **{g: v for g, v in G.items()})
        print('built', cid, 'body z max', Vb[:, 2].max().round(3))
        if not prev:
            continue
        ims = []
        for view in ('front', 'left', 'back'):
            ims.append(splat([(Vb, BT, (0.85, 0.7, 0.6))], view=view, size=(300, 600), center=(0, 0, 0.9), height=1.85))
        for view in ('front', 'left', 'back', 'q34'):
            ms = [(Vb, BT, (0.85, 0.7, 0.6))]
            for g, col in (('Suit', (0.78, 0.74, 0.62)), ('Boots', (0.12, 0.12, 0.12)), ('Belt', (0.7, 0.7, 0.66)), ('NameTag', (0.1, 0.1, 0.1)), ('Patch', (0.8, 0.2, 0.2))):
                ms.append((G[g], tris_of(faces_of(load('gb_' + g))), col))
            ims.append(splat(ms, view=view, size=(300, 600), center=(0, 0, 0.9), height=1.85))
        sheet(ims, WORK + f'/dbg/{cid}_body.jpg', cols=7)
