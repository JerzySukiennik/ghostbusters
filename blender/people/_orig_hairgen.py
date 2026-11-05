# Crew hair: polar caps ray-cast onto each crew head, layered alpha shells (vertex-alpha thresholds, comb lean), brow strips and beard with the head morphs, procedural textures.
import numpy as np, sys, os, json
from PIL import Image
from scipy.spatial import Delaunay, cKDTree
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crewlib import *
from design import CREW
from hairline import hair_mask, hair_depth, az_el, curve, HAIRLINE, BALD

HERE = os.path.dirname(os.path.abspath(__file__))
H = load('src_head'); HV = H['co']; HF = faces_of(H); HMI = H['mi']
KN = [str(k) for k in H['key_names']]
ANC = json.load(open(CACHE + '/anchors.json'))['anchors']
AP = {k: HV[v['vertex']] for k, v in ANC.items()}
SKINF = [i for i, m in enumerate(HMI) if m < 3]
TRI = tris_of([HF[i] for i in SKINF])
TRIF = np.concatenate([[i] * (len(HF[i]) - 2) for i in SKINF]).astype(np.int64)
CJ = np.array([0.0, 0.008, 1.625])
EARS = ear_faces(H)[TRIF]


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


def rot_to(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = a @ b
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K / (1 + c) if c > -0.999 else -np.eye(3)


class Head:
    def __init__(self, cid):
        d = np.load(CACHE + f'/{cid}_head.npz')
        self.V = d['head']; self.K = d['keys']
        self.T = TRI[~EARS]; self.Tall = TRI
        self.N = vnormals(self.V, TRI)
        self.center = self.V[TRI].reshape(-1, 3).mean(0) * 0 + CJ + (d['eyeL_c'] + d['eyeR_c']) / 2 - np.array([0.0, -0.0677, 1.6374])

    def cast(self, dirs, origin=None):
        o = self.center if origin is None else origin
        t, i, b = raycast(np.asarray(o, float), dirs, self.V, self.T)
        ok = i >= 0
        tri = self.T[np.maximum(i, 0)]
        w = np.stack([1 - b[:, 0] - b[:, 1], b[:, 0], b[:, 1]], 1)
        P = (self.V[tri] * w[..., None]).sum(1)
        Pj = (HV[tri] * w[..., None]).sum(1)
        Nn = (self.N[tri] * w[..., None]).sum(1); Nn /= np.linalg.norm(Nn, axis=1, keepdims=True)
        return ok, P, Pj, Nn, tri, w


def polar_dirs(pole, uv):
    pole = np.asarray(pole, float); pole = pole / np.linalg.norm(pole)
    R = rot_to(np.array([0, 0, 1.0]), pole)
    r = np.linalg.norm(uv, axis=1); ph = np.arctan2(uv[:, 1], uv[:, 0])
    d = np.stack([np.sin(r) * np.cos(ph), np.sin(r) * np.sin(ph), np.cos(r)], 1)
    return d @ R.T


def cap(hd, pole, rmax, spacing, keep):
    n = int(np.ceil(rmax / spacing))
    g = np.arange(-n, n + 1) * spacing
    U, Vv = np.meshgrid(g, g)
    uv = np.stack([U.ravel(), Vv.ravel()], 1)
    uv = uv[np.linalg.norm(uv, axis=1) <= rmax]
    rng = np.random.default_rng(7)
    uv = uv + rng.uniform(-0.18, 0.18, uv.shape) * spacing
    D = polar_dirs(pole, uv)
    ok, P, Pj, Nn, tri, w = hd.cast(D)
    k = ok & keep(Pj, P)
    sel = np.where(k)[0]
    uv, P, Pj, Nn, tri, w = uv[sel], P[sel], Pj[sel], Nn[sel], tri[sel], w[sel]
    F = Delaunay(uv).simplices
    cu = uv[F].mean(1)
    okc, Pc, Pjc, _, _, _ = hd.cast(polar_dirs(pole, cu))
    good = okc & keep(Pjc, Pc)
    e = np.max(np.stack([np.linalg.norm(P[F[:, a]] - P[F[:, b]], axis=1) for a, b in ((0, 1), (1, 2), (2, 0))], 1), 1)
    good &= e < spacing * 0.13 * 6.0
    F = F[good]
    used = np.unique(F)
    remap = -np.ones(len(uv), np.int64); remap[used] = np.arange(len(used))
    F = remap[F]
    P, Nn = P[used], Nn[used]
    cr = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    flip = (cr * Nn[F[:, 0]]).sum(1) < 0
    F[flip] = F[flip][:, ::-1]
    c = dict(uv=uv[used], P=P, Pj=Pj[used], N=Nn, tri=tri[used], w=w[used], F=F)
    c['bdist'] = boundary_dist(c)
    return c


def boundary_dist(c):
    F = c['F']; from collections import Counter
    ec = Counter()
    for f in F:
        for a, b in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])):
            ec[(min(a, b), max(a, b))] += 1
    bv = sorted({v for e, n in ec.items() if n == 1 for v in e})
    if not bv:
        return np.full(len(c['P']), 1.0)
    d, _ = cKDTree(c['P'][bv]).query(c['P'])
    return d


def smooth_normals(c):
    N = vnormals(c['P'], c['F'])
    E = edges_of([tuple(f) for f in c['F']]); M = adjacency(len(N), E)
    N = smooth(N, M, 6, 0.6)
    return N / np.linalg.norm(N, axis=1, keepdims=True)


def shells(c, length, layers, lean=None, base=0.0011, tiling=3.0, edge=None, darken=0.45, rise=None, alpha_k=1.0):
    N = smooth_normals(c)
    V = []; F = []; UV = []; COL = []
    n = len(c['P'])
    for i, t in enumerate(layers):
        h = base + t * length
        p = c['P'] + N * h[:, None]
        if lean is not None:
            p = p + lean * (t ** 1.3 * length)[:, None]
        V.append(p); F.append(c['F'] + i * n)
        UV.append(c['uv'] * tiling)
        a = 1.0 / (1.0 + alpha_k * t)
        if edge is not None:
            a = a * (0.45 + 0.55 * edge)
        rgb = (1 - darken) + darken * t
        COL.append(np.column_stack([np.full(n, rgb), np.full(n, rgb), np.full(n, rgb), np.full(n, a)]))
    return np.vstack(V), np.vstack(F), np.vstack(UV), np.vstack(COL)


def _stroke(hgt, x0, y0, ang, length, width, h, size, curl=0.0):
    a = ang
    x, y = x0, y0
    n = int(max(2, length))
    for k in range(n):
        hk = h * (1 - 0.35 * k / n)
        r = width * (1 - 0.5 * k / n)
        ir = int(np.ceil(r))
        for dx in range(-ir, ir + 1):
            for dy in range(-ir, ir + 1):
                if dx * dx + dy * dy > r * r + 0.25:
                    continue
                X, Y = int(x + dx) % size, int(y + dy) % size
                if hk > hgt[Y, X]:
                    hgt[Y, X] = hk
        a += curl
        x += np.cos(a); y += np.sin(a)


def shell_texture(path, size, kind, color, var, seed=1, density=1.0, nrm_path=None):
    rng = np.random.default_rng(seed)
    hgt = np.zeros((size, size), np.float32)
    if kind == 'coil':
        n = int(size * size / 120 * density)
        for _ in range(n):
            x0, y0 = rng.uniform(0, size, 2); h = rng.uniform(0, 1) ** 0.7
            r = rng.uniform(5.0, 11.0); turns = rng.uniform(1.0, 2.0); ang = rng.uniform(0, 2 * np.pi)
            steps = int(2 * np.pi * r * turns / 1.2)
            for k in range(steps):
                t = k / max(steps - 1, 1)
                aa = ang + 2 * np.pi * turns * t
                rad = r * (0.45 + 0.55 * t)
                x = x0 + np.cos(aa) * rad + t * rng.normal(0, 0.3); y = y0 + np.sin(aa) * rad
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        X, Y = int(x + dx) % size, int(y + dy) % size
                        hk = h * (0.8 + 0.2 * t)
                        if hk > hgt[Y, X]:
                            hgt[Y, X] = hk
    elif kind == 'beard':
        n = int(size * size / 30 * density)
        for _ in range(n):
            x0, y0 = rng.uniform(0, size, 2)
            _stroke(hgt, x0, y0, rng.normal(np.pi / 2, 0.6), rng.uniform(8, 22), rng.uniform(0.6, 1.2), rng.uniform(0, 1) ** 0.8, size, curl=rng.normal(0, 0.08))
    else:
        n = int(size * size / 40 * density)
        for _ in range(n):
            x0, y0 = rng.uniform(0, size, 2)
            _stroke(hgt, x0, y0, rng.normal(np.pi / 2, 0.16), rng.uniform(14, 46), rng.uniform(0.7, 1.5), rng.uniform(0, 1) ** 0.8, size, curl=rng.normal(0, 0.012))
    strand = hgt > 0
    alpha = np.where(strand, 0.5 + 0.5 * np.clip(hgt, 0, 1), 0.0)
    base = np.asarray(color, float)
    clump = ndimage.gaussian_filter(rng.normal(0, 1, (size, size)), 6, mode='wrap'); clump /= max(clump.std(), 1e-6)
    fine = ndimage.gaussian_filter(rng.normal(0, 1, (size, size)), 0.8, mode='wrap'); fine /= max(fine.std(), 1e-6)
    lum = 1 + var * (0.55 * clump + 0.45 * fine)
    rgb = np.clip(base[None, None] * lum[..., None] * (0.65 + 0.5 * hgt[..., None]), 0, 1)
    gap = ndimage.grey_dilation(rgb, size=(3, 3, 1), mode='wrap') * 0.55
    rgb = np.where(strand[..., None], rgb, gap)
    img = np.concatenate([rgb, alpha[..., None]], 2)
    save_rgba(Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA'), path)
    if nrm_path:
        hb = ndimage.gaussian_filter(hgt, 0.9, mode='wrap')
        gx = np.gradient(hb, axis=1) * 3.0; gy = -np.gradient(hb, axis=0) * 3.0
        nn = np.stack([-gx, -gy, np.ones_like(gx)], 2); nn /= np.linalg.norm(nn, axis=2, keepdims=True)
        Image.fromarray(((nn * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).resize((256, 256), Image.LANCZOS).save(nrm_path, optimize=True)


def save_rgba(im, path, colors=112):
    im.quantize(colors=colors, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)


def morph_keys(hd, c, V, layers_n):
    tri = np.tile(c['tri'], (layers_n, 1)); w = np.tile(c['w'], (layers_n, 1))
    out = []
    for K in hd.K:
        dlt = ((K[tri] - hd.V[tri]) * w[..., None]).sum(1)
        out.append(V + dlt)
    return np.array(out)


def pack(V, F, UV, COL=None, mats=None, mi=None):
    ls = np.arange(len(F)) * 3; lt = np.full(len(F), 3)
    loops = F.ravel()
    uvl = UV[F].reshape(-1, 2)
    d = dict(co=V, loops=loops, ls=ls, lt=lt, uv=uvl)
    if COL is not None:
        d['col'] = COL
    if mats is not None:
        d['mi'] = np.zeros(len(F), np.int64) if mi is None else np.asarray(mi, np.int64); d['mats'] = np.array(mats)
    return d


def cap_and_shells(c, L, t_cap, layers, lean, tiling, edge, darken=0.45, alpha_k=1.0):
    Vc, Fc, UVc, Cc = shells(c, L, [t_cap], lean=lean, tiling=tiling, edge=None, darken=0.0)
    Cc[:, :] = 1.0
    Va, Fa, UVa, Ca = shells(c, L, layers, lean=lean, tiling=tiling, edge=edge, darken=darken, alpha_k=alpha_k)
    V = np.vstack([Vc, Va]); F = np.vstack([Fc, Fa + len(Vc)]); UV = np.vstack([UVc, UVa]); COL = np.vstack([Cc, Ca])
    mi = np.concatenate([np.zeros(len(Fc), np.int64), np.ones(len(Fa), np.int64)])
    return V, F, UV, COL, mi


def opaque_tex(src, dst, darker=0.85, gap=0.55):
    im = np.asarray(Image.open(src).convert('RGBA'), np.float32) / 255
    rgb = im[..., :3] * (gap + (1 - gap) * np.clip(im[..., 3:4] * 1.4, 0, 1)) * darker
    Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)).save(dst, quality=90)


def scalp_keep(cid, margin=3.0):
    def k(Pj, P):
        hm = hair_mask(Pj, cid, soft=margin * 2)
        return hm > 0.02
    return k


STYLES = {
    'crew_1': dict(pole=(0.0, 0.25, 1.0), rmax=np.radians(128), spacing=np.radians(7.6), kind='short', layers=[0.42, 0.6, 0.8, 1.0], t_cap=0.36,
                   length=lambda Pj, P, el, az: 0.006 + 0.020 * sstep(10, 50, el) * sstep(170, 60, np.abs(az)) + 0.004 * sstep(-30, 5, el),
                   lean=(0.0, -0.35, 0.55), color=(0.060, 0.045, 0.036), var=0.35, tiling=1.25, rough=0.62),
    'crew_2': dict(pole=(0.0, 0.6, 0.6), rmax=np.radians(140), spacing=np.radians(7.0), kind='short', layers=[0.45, 0.72, 1.0], t_cap=0.4,
                   length=lambda Pj, P, el, az: 0.005 + 0.006 * sstep(-40, 0, el), lean=(0.0, 0.25, -0.6), color=(0.60, 0.59, 0.57), var=0.55, tiling=1.6, rough=0.62),
    'crew_3': dict(pole=(0.0, 0.12, 1.0), rmax=np.radians(130), spacing=np.radians(8.0), kind='coil', layers=[0.72, 0.81, 0.9, 1.0], t_cap=0.68,
                   length=lambda Pj, P, el, az: 0.012 + 0.024 * sstep(-25, 50, el) * (0.7 + 0.3 * sstep(150, 40, np.abs(az))) + 0.004 * sstep(60, 20, np.abs(az)), lean=(0.0, -0.10, 0.25),
                   color=(0.058, 0.042, 0.034), var=0.38, tiling=1.15, rough=0.72, alpha_k=0.55),
}


def make_hair(cid):
    st = STYLES[cid]
    hd = Head(cid)
    c = cap(hd, st['pole'], st['rmax'], st['spacing'], scalp_keep(cid))
    az, el = az_el(c['Pj'])
    depth = hair_depth(c['Pj'], cid)
    edge = sstep(-2.0, 7.0, depth) * sstep(0.0, 0.010, c['bdist'])
    if cid in BALD:
        up = curve(BALD[cid], az); edge = edge * sstep(1.0, -6.0, el - up)
    L = st['length'](c['Pj'], c['P'], el, az) * (0.2 + 0.8 * edge)
    lean = None
    if st['lean'] is not None:
        lv = np.broadcast_to(np.asarray(st['lean'], float), c['P'].shape).copy()
        N = c['N']
        lv = lv - (lv * N).sum(1, keepdims=True) * N
        lean = lv
    V, F, UV, COL, mi = cap_and_shells(c, L, st['t_cap'], st['layers'], lean, st['tiling'], edge, alpha_k=st.get('alpha_k', 1.0))
    out = HERE + f'/tex/{cid}'; os.makedirs(out, exist_ok=True)
    shell_texture(out + '/hair.png', 512, st['kind'], st['color'], st['var'], seed=3, nrm_path=out + '/hair_normal.png')
    opaque_tex(out + '/hair.png', out + '/haircap.jpg')
    d = pack(V, F, UV, COL, ['HairCap', 'Hair'], mi)
    np.savez(CACHE + f'/{cid}_hair.npz', **d)
    return V, F


BROW = {
    'crew_1': dict(width=(4.6, 2.2), color=(0.030, 0.022, 0.018), arch=0.6, layers=[0.0, 0.4, 0.8], h=0.0016, density=0.9),
    'crew_2': dict(width=(6.4, 4.0), color=(0.55, 0.53, 0.50), arch=0.2, layers=[0.0, 0.33, 0.66, 1.0], h=0.0032, density=1.0),
    'crew_3': dict(width=(3.8, 1.5), color=(0.022, 0.016, 0.014), arch=1.0, layers=[0.0, 0.5, 1.0], h=0.0011, density=0.85),
}


def brow_texture(path, cid, size=(256, 64)):
    b = BROW[cid]
    W, Hh = size
    rng = np.random.default_rng(11)
    hgt = np.zeros((Hh, W), np.float32)
    n = int(W * Hh / 7 * b['density'])
    for _ in range(n):
        u = rng.uniform(0, 1) ** 0.9
        half = (b['width'][0] * (1 - u) + b['width'][1] * u) / max(b['width'][0], 1e-3)
        v = 0.5 + rng.normal(0, 0.22) * half
        if abs(v - 0.5) > 0.47 * half:
            continue
        ang = np.radians(80 - 65 * min(1, u * 2.2)) + rng.normal(0, 0.15)
        ang = ang if v < 0.5 + 0.12 * half else ang - np.radians(25) * (v - 0.5) / max(half, 1e-3)
        l = rng.uniform(5, 11) * (1.3 if cid == 'crew_2' else 1.0)
        h = rng.uniform(0.2, 1.0)
        x0, y0 = u * (W - 1), (1 - v) * (Hh - 1)
        for k in range(int(l)):
            x = x0 + np.cos(ang) * k * 0.9; y = y0 - np.sin(ang) * k * 0.35
            X, Y = int(x), int(y)
            if 0 <= X < W and 0 <= Y < Hh:
                hk = h * (1 - 0.3 * k / l)
                if hk > hgt[Y, X]:
                    hgt[Y, X] = hk
    yy, xx = np.mgrid[0:Hh, 0:W]
    u = xx / (W - 1); half = (b['width'][0] * (1 - u) + b['width'][1] * u) / max(b['width'][0], 1e-3)
    core = np.abs((1 - yy / (Hh - 1)) - 0.5) < 0.22 * half
    core &= (u > 0.06) & (u < 0.93)
    hgt = np.where(core, np.maximum(hgt, 0.9), hgt)
    strand = hgt > 0
    alpha = np.where(strand, 0.5 + 0.5 * hgt, 0.0)
    rgb = np.asarray(b['color'], float)[None, None] * (0.8 + 0.4 * rng.uniform(0, 1, (Hh, W, 1)))
    img = np.concatenate([np.clip(rgb, 0, 1), alpha[..., None]], 2)
    save_rgba(Image.fromarray((img * 255 + 0.5).astype(np.uint8), 'RGBA'), path, 48)


def make_brows(cid):
    b = BROW[cid]; hd = Head(cid)
    V = []; F = []; UV = []; COL = []; TRIS = []; WS = []
    nu, nv = 14, 3
    for sd, sg in (('L', 1), ('R', -1)):
        pts = np.array([AP[k + '.' + sd] for k in ('brow_inner', 'brow_mid', 'brow_peak', 'brow_outer')])
        s_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]); s_ /= s_[-1]
        us = np.linspace(-0.04, 1.04, nu)
        cen = np.stack([np.interp(us, s_, pts[:, k]) for k in range(3)], 1)
        cen[:, 2] += b['arch'] * 0.0012 * np.sin(np.clip(us, 0, 1) * np.pi)
        tang = np.gradient(cen, axis=0); tang /= np.linalg.norm(tang, axis=1, keepdims=True)
        up = np.array([0, 0, 1.0])
        bit = up - (up @ tang.T).T[:, None] * tang if False else np.tile(up, (nu, 1)) - (tang @ up)[:, None] * tang
        bit /= np.linalg.norm(bit, axis=1, keepdims=True)
        wid = (b['width'][0] * (1 - us) + b['width'][1] * us) * 0.001 * 1.5
        grid = []
        for j in range(nv + 1):
            vv = j / nv - 0.5
            grid.append(cen + bit * (vv * wid)[:, None])
        G = np.array(grid).reshape(-1, 3)
        Cj = G
        dirs = Cj - CJ; dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
        tps = hd
        okj, Pj_hit, _, _, triJ, wJ = None, None, None, None, None, None
        t, i, bb = raycast(CJ, dirs, HV, TRI[~EARS])
        triJ = TRI[~EARS][np.maximum(i, 0)]; wJ = np.stack([1 - bb[:, 0] - bb[:, 1], bb[:, 0], bb[:, 1]], 1)
        P = (hd.V[triJ] * wJ[..., None]).sum(1)
        Nn = (hd.N[triJ] * wJ[..., None]).sum(1); Nn /= np.linalg.norm(Nn, axis=1, keepdims=True)
        base_uv = np.stack(np.meshgrid(np.linspace(0, 1, nu), np.linspace(0, 1, nv + 1)), 2).reshape(-1, 2)
        if sg < 0:
            base_uv[:, 0] = base_uv[:, 0]
        fq = []
        for j in range(nv):
            for k in range(nu - 1):
                a = j * nu + k
                fq += [(a, a + 1, a + nu + 1), (a, a + nu + 1, a + nu)]
        fq = np.array(fq)
        cr = np.cross(P[fq[:, 1]] - P[fq[:, 0]], P[fq[:, 2]] - P[fq[:, 0]])
        if ((cr * Nn[fq[:, 0]]).sum(1) < 0).mean() > 0.5:
            fq = fq[:, ::-1]
        for li, tl in enumerate(b['layers']):
            off = len(np.vstack(V)) if V else 0
            V.append(P + Nn * (0.0012 + tl * b['h']))
            F.append(fq + off); UV.append(base_uv)
            a = 1.0 / (1.0 + tl)
            COL.append(np.column_stack([np.full(len(P), 0.7 + 0.3 * tl)] * 3 + [np.full(len(P), a)]))
            TRIS.append(triJ); WS.append(wJ)
    V = np.vstack(V); F = np.vstack(F); UV = np.vstack(UV); COL = np.vstack(COL)
    tri = np.vstack(TRIS); w = np.vstack(WS)
    keys = np.array([V + ((K[tri] - hd.V[tri]) * w[..., None]).sum(1) for K in hd.K])
    d = pack(V, F, UV, COL)
    d['keys'] = keys; d['key_names'] = np.array(KN)
    np.savez(CACHE + f'/{cid}_brows.npz', **d)
    out = HERE + f'/tex/{cid}'; os.makedirs(out, exist_ok=True)
    brow_texture(out + '/brow.png', cid)
    return V, F


def beard_keep(Pj, P):
    a = AP
    az, el = az_el(Pj)
    sub = 0.5 * (a['subnasale'][2] + a['ala_outer.L'][2])
    cheek_top = np.interp(np.abs(az), [0, 20, 40, 60, 75, 90], [sub - 0.003, sub - 0.004, a['zygion.L'][2] - 0.016, a['zygion.L'][2] - 0.020, a['ear_lobe_bottom.L'][2] + 0.004, a['ear_lobe_bottom.L'][2]])
    ok = (Pj[:, 2] < cheek_top) & (Pj[:, 2] > 1.478) & (np.abs(az) < 92)
    lipc = 0.5 * (a['stomion_superius'] + a['stomion_inferius'])
    mouth = (np.abs(Pj[:, 0]) < 0.024) & (np.abs(Pj[:, 2] - lipc[2]) < 0.0085) & (Pj[:, 1] < -0.07)
    return ok & ~mouth


def make_beard(cid):
    hd = Head(cid)
    pole = np.array([0.0, -1.0, -1.05])
    c = cap(hd, pole, np.radians(108), np.radians(4.4), beard_keep)
    a = AP
    Pj = c['Pj']; az, el = az_el(Pj)
    lipc = 0.5 * (a['stomion_superius'] + a['stomion_inferius'])
    stache = sstep(0.006, 0.0, np.abs(Pj[:, 2] - (lipc[2] + 0.010))) * (np.abs(Pj[:, 0]) < 0.03) * (Pj[:, 2] > lipc[2])
    chin = sstep(0.05, 0.0, np.linalg.norm(Pj - a['pogonion'], axis=1))
    under = sstep(1.53, 1.49, Pj[:, 2])
    L = 0.008 + 0.010 * chin + 0.006 * stache + 0.004 * under
    sub = 0.5 * (a['subnasale'][2] + a['ala_outer.L'][2])
    edge = sstep(0.0, 0.012, c['bdist'])
    L = L * (0.15 + 0.85 * edge)
    down = np.array([0.0, -0.15, -1.0])
    N = c['N']
    lean = np.broadcast_to(down, N.shape) - (N @ down)[:, None] * N
    lean = lean * (0.55 + 0.4 * stache)[:, None]
    layers = [0.5, 0.67, 0.84, 1.0]
    V, F, UV, COL, mi = cap_and_shells(c, L, 0.45, layers, lean, 1.6, edge, darken=0.5)
    keys = morph_keys(hd, c, V, len(layers) + 1)
    d = pack(V, F, UV, COL, ['BeardCap', 'Beard'], mi)
    d['keys'] = keys; d['key_names'] = np.array(KN)
    np.savez(CACHE + f'/{cid}_beard.npz', **d)
    out = HERE + f'/tex/{cid}'
    shell_texture(out + '/beard.png', 512, 'beard', (0.55, 0.535, 0.515), 0.32, seed=5, density=1.4, nrm_path=out + '/beard_normal.png')
    opaque_tex(out + '/beard.png', out + '/beardcap.jpg', 1.0, 0.78)
    return V, F


if __name__ == '__main__':
    cids = [a for a in sys.argv[1:] if a.startswith('crew')] or list(CREW)
    for cid in cids:
        V, F = make_hair(cid)
        Vb, Fb = make_brows(cid)
        info = {}
        if cid == 'crew_2':
            make_beard(cid)
        lod = {'crew_1': (0.13, 0.34, 0.30), 'crew_2': (0.12, 0.30, 0.30), 'crew_3': (0.13, 0.34, 0.34)}[cid]
        json.dump(dict(hair_rough=STYLES[cid]['rough'], brow_color=list(BROW[cid]['color']), head_ratio=lod[0], head_ratio2=lod[1], lash_keep=lod[2]),
                  open(CACHE + f'/{cid}_info.json', 'w'))
        print('hair', cid, 'tris', len(F), 'brows', len(Fb))
