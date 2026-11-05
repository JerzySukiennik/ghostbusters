# Procedural skin for people heads and hands/neck in Jurek's UV layouts (from blender/crew/skintex.py): tone, mottling, pores, wrinkles, stubble, makeup, scalp, lips, irises.
import numpy as np, sys, os, json
from PIL import Image, ImageFilter
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plib import *
from pdesign import CREW, LOOK, PEOPLE, EYES
from phairline import hair_mask, az_el, curve, HAIRLINE, BALD

AVTEX = ROOT + '/blender/avatar/tex'
HERE = os.path.dirname(os.path.abspath(__file__))
H = load('src_head'); HV = H['co']; HF = faces_of(H); HMI = H['mi']; HUV = H['uv']
ANC = json.load(open(CACHE + '/anchors.json'))['anchors']
AP = {k: HV[v['vertex']] for k, v in ANC.items()}



def s2l(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def l2s(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def raster(uvT, attT, size):
    k = attT.shape[2]
    out = np.zeros((size, size, k), np.float32); mask = np.zeros((size, size), bool); tid = -np.ones((size, size), np.int64)
    X = uvT[..., 0] * size; Y = (1 - uvT[..., 1]) * size
    for t in range(len(uvT)):
        xs, ys = X[t], Y[t]
        x0, x1 = int(max(0, np.floor(xs.min()))), int(min(size - 1, np.ceil(xs.max())))
        y0, y1 = int(max(0, np.floor(ys.min()))), int(min(size - 1, np.ceil(ys.max())))
        if x1 < x0 or y1 < y0:
            continue
        d = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0])
        if abs(d) < 1e-12:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w1 = ((gx - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (gy - ys[0])) / d
        w2 = ((xs[1] - xs[0]) * (gy - ys[0]) - (gx - xs[0]) * (ys[1] - ys[0])) / d
        w0 = 1 - w1 - w2
        m = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
        if not m.any():
            continue
        a = attT[t]
        val = w0[..., None] * a[0] + w1[..., None] * a[1] + w2[..., None] * a[2]
        sub = out[y0:y1 + 1, x0:x1 + 1]; sm = mask[y0:y1 + 1, x0:x1 + 1]; st = tid[y0:y1 + 1, x0:x1 + 1]
        sub[m] = val[m]; sm[m] = True; st[m] = t
    return out, mask, tid


def bleed(img, mask):
    idx = ndimage.distance_transform_edt(~mask, return_distances=False, return_indices=True)
    return img[idx[0], idx[1]]


def hash3(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h = (h ^ (h >> 13)) * 1274126177
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF).astype(np.float32) / float(0xFFFFFF)


def vnoise(P, freq, seed=0):
    X = P * freq
    i0 = np.floor(X).astype(np.int64); f = (X - i0).astype(np.float32)
    u = f * f * (3 - 2 * f)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (u[..., 0] if dx else 1 - u[..., 0]) * (u[..., 1] if dy else 1 - u[..., 1]) * (u[..., 2] if dz else 1 - u[..., 2])
                out = out + w * hash3(i0[..., 0] + dx, i0[..., 1] + dy, i0[..., 2] + dz, seed)
    return out


def fbm(P, freq, octaves, seed=0, gain=0.5):
    a, s, tot = 1.0, 0.0, 0.0
    for o in range(octaves):
        s = s + a * vnoise(P, freq * (2 ** o), seed + o * 17); tot += a; a *= gain
    return s / tot


def lip_weight():
    a = json.load(open(CACHE + '/anchors.json'))['rings']['mouth_ring_vertices']
    w = np.zeros(len(HV), np.float32)
    from scipy.spatial import cKDTree
    tree = cKDTree(HV)
    for k, val in (('4', 0.6), ('5', 1.0), ('6', 1.0), ('7', 1.0)):
        ids = np.array([int(x) for x in a[k]])
        w[ids] = np.maximum(w[ids], val)
        mir = HV[ids] * np.array([-1, 1, 1])
        _, mi = tree.query(mir)
        w[mi] = np.maximum(w[mi], val)
    return w


def head_maps(size, extra=None):
    F = [f for f, m in zip(HF, HMI) if m < 3]
    fi = np.array([i for i, m in enumerate(HMI) if m < 3])
    T = []; TL = []
    for i in fi:
        f = HF[i]; s0 = H['ls'][i]
        for k in range(1, len(f) - 1):
            T.append((f[0], f[k], f[k + 1])); TL.append((s0, s0 + k, s0 + k + 1))
    T = np.array(T); TL = np.array(TL)
    VN = vnormals(HV, T)
    att = np.concatenate([HV[T], VN[T]] + ([extra[T][..., None]] if extra is not None else []), 2)
    out, mask, tid = raster(HUV[TL], att, size)
    P = bleed(out[..., :3], mask); N = bleed(out[..., 3:6], mask)
    N /= np.maximum(np.linalg.norm(N, axis=2, keepdims=True), 1e-9)
    if extra is not None:
        return P, N, mask, T, TL, bleed(out[..., 6], mask)
    return P, N, mask, T, TL


def anchor_uv():
    loops = H['loops']
    out = {}
    for k, v in ANC.items():
        li = np.where(loops == v['vertex'])[0]
        out[k] = HUV[li[0]] if len(li) else None
    return out


def g3(P, c, r):
    d = np.linalg.norm(P - np.asarray(c), axis=-1)
    return np.exp(-(d / r) ** 2)


def seg_dist(P, a, b):
    a = np.asarray(a); b = np.asarray(b); ab = b - a
    t = np.clip(((P - a) * ab).sum(-1) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(P - (a + t[..., None] * ab), axis=-1), t


def poly_dist(P, pts):
    d = np.full(P.shape[:-1], np.inf); tt = np.zeros(P.shape[:-1])
    L = [0.0]
    for i in range(len(pts) - 1):
        L.append(L[-1] + np.linalg.norm(np.asarray(pts[i + 1]) - np.asarray(pts[i])))
    for i in range(len(pts) - 1):
        di, ti = seg_dist(P, pts[i], pts[i + 1])
        m = di < d
        d = np.where(m, di, d); tt = np.where(m, (L[i] + ti * (L[i + 1] - L[i])) / L[-1], tt)
    return d, tt


def groove(P, pts, width, depth, taper=True):
    d, t = poly_dist(P, pts)
    prof = np.exp(-(d / width) ** 2)
    if taper:
        prof = prof * np.sin(np.clip(t, 0, 1) * np.pi) ** 0.6
    return -depth * prof


def lip_mask(size):
    j = np.asarray(Image.open(AVTEX + '/head_basecolor.jpg').convert('RGB').resize((size, size), Image.LANCZOS), np.float32) / 255
    r = j[..., 0] - 0.5 * (j[..., 1] + j[..., 2])
    return j, r


def base_color(P, L, a):
    tone = s2l(L['tone'])
    col = np.broadcast_to(tone, P.shape).astype(np.float32).copy()
    low = fbm(P, 22.0, 3, 1) - 0.5
    mid = fbm(P, 90.0, 3, 5) - 0.5
    col *= (1 + 0.10 * low[..., None] * np.array([1.0, 1.1, 1.2]))
    col *= (1 + 0.05 * mid[..., None])
    ch = g3(P, a['cheek_mid.L'], 0.026) + g3(P, a['cheek_mid.R'], 0.026) + 0.7 * g3(P, a['cheekbone.L'], 0.02) + 0.7 * g3(P, a['cheekbone.R'], 0.02)
    nose = g3(P, a['pronasale'], 0.014) + 0.8 * g3(P, a['ala_outer.L'], 0.009) + 0.8 * g3(P, a['ala_outer.R'], 0.009)
    ears = g3(np.abs(P), np.array([0.07, 0.006, 1.605]), 0.022)
    chin = g3(P, a['pogonion'], 0.016)
    redness = np.clip(0.55 * ch + 0.8 * nose + 0.6 * ears + 0.25 * chin, 0, 1.4) * L['red']
    col *= (1 + redness[..., None] * np.array([0.10, -0.08, -0.07]))
    fh = np.clip((P[..., 2] - 1.655) / 0.03, 0, 1) * sstep(-0.03, -0.07, P[..., 1])
    col *= (1 + 0.03 * fh[..., None] * np.array([1.0, 0.6, -0.4]))
    return col, ch, nose, chin


def make_head(cid, size=2048, nsize=1024):
    L = LOOK[cid]
    P, N, mask, T, TL, LW = head_maps(size, lip_weight())
    mm = 1000.0
    a = AP
    eyeL = np.array([0.0303, -0.0677, 1.6374]); eyeR = np.array([-0.0303, -0.0677, 1.6374])
    col, ch, nose, chin = base_color(P, L, a)
    tone = s2l(L['tone'])
    peri = (g3(P, eyeL + [0, -0.004, -0.004], 0.019) + g3(P, eyeR + [0, -0.004, -0.004], 0.019))
    lid = (g3(P, eyeL + [0, -0.012, 0.004], 0.009) + g3(P, eyeR + [0, -0.012, 0.004], 0.009))
    col *= (1 - L['peri'] * (0.16 * peri[..., None] * np.array([0.9, 1.0, 0.95])))
    col *= (1 + L['peri'] * 0.10 * lid[..., None] * np.array([0.5, -0.4, -0.2]))
    fh = np.clip((P[..., 2] - 1.655) / 0.03, 0, 1) * sstep(-0.03, -0.07, P[..., 1])
    j, rr = lip_mask(size)
    mouthc = 0.5 * (a['stomion_superius'] + a['stomion_inferius'])
    near_m = np.linalg.norm((P - mouthc) * [0.7, 1.0, 1.4], axis=-1) < 0.026
    lipm = np.clip((LW - 0.3) / 0.5, 0, 1) * near_m
    lipm = ndimage.gaussian_filter(lipm.astype(np.float32), size / 1024 * 1.0)
    lc = s2l(L['lips'])
    if 'lips_inner' in L:
        inner = np.clip(1 - np.abs(P[..., 2] - mouthc[2]) / 0.0045, 0, 1)
        lc = lc[None, None] * (1 - inner[..., None]) + s2l(L['lips_inner'])[None, None] * inner[..., None]
    lipn = 1 + 0.08 * (fbm(P, 400.0, 2, 9) - 0.5)
    col = col * (1 - lipm[..., None]) + (lc * lipn[..., None]) * lipm[..., None]
    interior = (P[..., 1] > a['stomion_superius'][1] + 0.006) & (np.abs(P[..., 0]) < 0.03) & (np.abs(P[..., 2] - mouthc[2]) < 0.025)
    nostril_in = (np.linalg.norm(P - a['nostril_center.L'], axis=-1) < 0.006) | (np.linalg.norm(P - a['nostril_center.R'], axis=-1) < 0.006)
    jl = s2l(j)
    ratio = np.clip(jl / np.maximum(s2l(np.array([0.83, 0.62, 0.53])), 1e-3), 0, 2)
    col = np.where(interior[..., None], np.clip(tone * ratio * 0.9, 0, 1), col)
    col = np.where(nostril_in[..., None], col * 0.45, col)
    stub = np.zeros(P.shape[:2], np.float32)
    if L.get('stubble', 0) > 0 or 'beard_base' in L:
        z0 = 0.5 * (a['subnasale'][2] + a['ala_outer.L'][2])
        bz = np.clip((z0 + 0.006 - P[..., 2]) / 0.012, 0, 1)
        side = np.clip((a['zygion.L'][2] - 0.012 - P[..., 2]) / 0.02, 0, 1) * np.clip((0.025 - P[..., 1]) / 0.02, 0, 1)
        cheek_line = np.clip((np.abs(P[..., 0]) * -1 + 0.052 + (P[..., 2] - a['mouth_corner.L'][2]) * -0.4) / 0.008, 0, 1)
        upper = np.clip((a['subnasale'][2] - 0.001 - P[..., 2]) / 0.004, 0, 1) * (np.abs(P[..., 0]) < 0.026)
        region = np.clip(np.maximum(bz * side * np.maximum(cheek_line, (P[..., 2] < a['mouth_corner.L'][2] - 0.005)), upper), 0, 1)
        region *= np.clip((P[..., 2] - 1.462) / 0.02, 0, 1) * (1 - lipm) * (~interior)
        region = np.clip(ndimage.gaussian_filter(region.astype(np.float32), size / 1024 * 3) * 1.25, 0, 1)
        stub = region
        if L.get('stubble', 0) > 0:
            dots = np.clip((vnoise(P, 1500.0, 31) - 0.58) / 0.14, 0, 1)
            sc = s2l(L['stubble_col'])
            jawz = a['menton'][2] - 0.004 + 0.45 * np.clip(np.abs(P[..., 0]) - 0.01, 0, 0.05) + 0.25 * np.clip(P[..., 1] + 0.06, 0, 0.08)
            amt = L['stubble'] * region * (0.5 + 0.5 * dots) * np.clip((P[..., 2] - jawz) / 0.010, 0, 1)
            col = col * (1 - amt[..., None] * 0.7) + sc * (amt[..., None] * 0.7)
        if 'beard_base' in L:
            bb = s2l(L['beard_base']) * (0.8 + 0.4 * vnoise(P, 900.0, 41)[..., None])
            col = col * (1 - region[..., None] * 0.85) + bb * region[..., None] * 0.85
    scalp_m = scalp_mask(P, cid)
    if L['scalp'] == 'hair':
        hc = s2l(L['hair']) * (0.85 + 0.3 * vnoise(P, 700.0, 51)[..., None])
        col = col * (1 - scalp_m[..., None]) + hc * scalp_m[..., None]
    else:
        bald = bald_mask(P)
        side = scalp_m * (1 - bald)
        hc = s2l(L['hair']) * (0.75 + 0.5 * vnoise(P, 900.0, 53)[..., None])
        col = col * (1 - side[..., None] * 0.75) + hc * side[..., None] * 0.75
        col *= (1 + bald[..., None] * 0.05 * np.array([0.5, 0.2, 0.0]))
    if L.get('mustache') is not None:
        mc = 0.5 * (a['stomion_superius'] + a['subnasale'])
        mm_ = np.clip(1 - np.abs(P[..., 2] - mc[2]) / 0.0075, 0, 1) * np.clip(1 - np.abs(P[..., 0]) / 0.030, 0, 1) ** 0.5 * (P[..., 1] < -0.06) * (1 - lipm)
        mm_ = np.clip(ndimage.gaussian_filter(mm_.astype(np.float32), size / 1024 * 2) * 1.6, 0, 1) * (0.75 + 0.25 * np.clip((vnoise(P, 1800.0, 33) - 0.4) / 0.2, 0, 1))
        col = col * (1 - mm_[..., None] * 0.92) + s2l(L['mustache']) * mm_[..., None] * 0.92
    if L.get('blush', 0) > 0:
        bl = (g3(P, a['cheek_mid.L'] + np.array([0.004, -0.004, 0.004]), 0.020) + g3(P, a['cheek_mid.R'] + np.array([-0.004, -0.004, 0.004]), 0.020))
        col *= (1 + L['blush'] * 0.22 * bl[..., None] * np.array([0.5, -0.35, -0.2]))
    if L.get('liner', 0) > 0:
        for sd in ('L', 'R'):
            pts = [a['eye_corner_medial.' + sd], a['lid_upper_med_third.' + sd], a['lid_upper_mid.' + sd], a['lid_upper_lat_third.' + sd], a['eye_corner_lateral.' + sd]]
            d_, t_ = poly_dist(P, pts)
            ln = np.clip(1 - d_ / 0.0016, 0, 1) * (P[..., 1] < -0.04)
            sh = np.clip(1 - d_ / 0.007, 0, 1) * (P[..., 2] > a['lid_upper_mid.' + sd][2] - 0.001) * (P[..., 1] < -0.04)
            col *= (1 - L['liner'] * (0.75 * ln + 0.18 * sh)[..., None])
    browm = brow_mask(P, cid)
    bp = s2l(L['brow_paint'])
    col = col * (1 - browm[..., None] * L['brow_amt']) + bp * browm[..., None] * L['brow_amt']
    if L['spots'] > 0:
        sp = np.clip((vnoise(P, 260.0, 61) - 0.80) / 0.05, 0, 1) * np.clip((vnoise(P, 30.0, 62) - 0.35) / 0.3, 0, 1)
        sp *= ((P[..., 2] > 1.645) | (np.abs(P[..., 0]) > 0.045)) * (1 - lipm)
        col *= (1 - L['spots'] * 0.22 * sp[..., None] * np.array([0.6, 0.8, 1.0]))
    for (cx, cz, r, s_) in MOLES.get(cid, []):
        q = np.array([cx, 0, cz])
        d = np.hypot(P[..., 0] - cx, P[..., 2] - cz) * (P[..., 1] < -0.02)
        col *= (1 - s_ * np.clip(1 - d / r, 0, 1)[..., None] ** 0.7 * np.array([0.55, 0.62, 0.65]))
    pore_f = 1700.0
    pores = np.clip((vnoise(P, pore_f, 71) - 0.66) / 0.12, 0, 1)
    pzone = np.clip(1.0 * nose + 0.6 * ch + 0.3, 0, 1.4)
    col *= (1 - 0.06 * (pores * pzone)[..., None])
    fine = vnoise(P, 3200.0, 81) - 0.5
    col *= (1 + 0.035 * fine[..., None])
    albedo = l2s(col)
    h = np.zeros(P.shape[:2], np.float32)
    h += -0.07 * pores * pzone
    h += 0.02 * (vnoise(P, 5200.0, 91) - 0.5)
    h += 0.02 * (fbm(P, 800.0, 2, 95) - 0.5)
    w = L['wrinkle']
    if w > 0:
        h += wrinkles(P, a, w, cid)
    lipl = np.sin(P[..., 0] * 2 * np.pi * 900) * 0.006 * lipm
    h += lipl
    if L['scalp'] != 'hair':
        h += 0.01 * (vnoise(P, 1500.0, 99) - 0.5) * bald_mask(P)
    nrm = height_to_normal(h, P, size)
    jn = np.asarray(Image.open(AVTEX + '/head_normal.png').convert('RGB').resize((size, size), Image.LANCZOS), np.float32) / 255 * 2 - 1
    nrm = blend_normals(jn, nrm)
    rough = L.get('rough', 0.56) - L['oil'] * np.clip(0.8 * nose + 0.7 * fh + 0.3 * chin, 0, 1) + 0.05 * (vnoise(P, 600.0, 101) - 0.5)
    rough = rough * (1 - lipm) + 0.46 * lipm
    if L['scalp'] != 'hair':
        rough = rough * (1 - 0.3 * bald_mask(P))
    rough = np.where(scalp_m > 0.5, np.maximum(rough, 0.62) if L['scalp'] == 'hair' else rough, rough)
    ao = np.asarray(Image.open(AVTEX + '/head_orm.jpg').convert('RGB').resize((size, size), Image.LANCZOS), np.float32)[..., 0] / 255
    ao = np.minimum(ao, 1.0)
    orm = np.stack([ao, np.clip(rough, 0.25, 0.9), np.zeros_like(ao)], 2)
    out = HERE + f'/tex/{cid}'; os.makedirs(out, exist_ok=True)
    Image.fromarray((albedo * 255 + 0.5).astype(np.uint8)).save(out + '/head_basecolor.jpg', quality=90)
    Image.fromarray(((nrm * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).resize((nsize, nsize), Image.LANCZOS).save(out + '/head_normal.png', optimize=True)
    Image.fromarray((orm * 255 + 0.5).astype(np.uint8)).resize((nsize, nsize), Image.LANCZOS).save(out + '/head_orm.jpg', quality=90)
    np.save(CACHE + f'/{cid}_stubmask.npy', ndimage.zoom(stub, 512 / size, order=1).astype(np.float32))
    return albedo


MOLES = {'janine': [(0.031, 1.596, 0.0009, 0.5)], 'p07': [(-0.040, 1.652, 0.0014, 0.5)]}


def scalp_mask(P, cid):
    return hair_mask(P, cid).astype(np.float32)


def bald_mask(P):
    az, el = az_el(P); up = curve([(0, 24), (180, 26)], az); hl = curve(HAIRLINE['p01'], az)
    lim = np.maximum(up, np.minimum(hl, 31.0))
    m = np.clip((el - lim) / 5.0 + 0.5, 0, 1)
    return (m * m * (3 - 2 * m)).astype(np.float32)


def brow_mask(P, cid):
    a = AP
    m = np.zeros(P.shape[:2], np.float32)
    for sd in ('L', 'R'):
        pts = [a['brow_inner.' + sd], a['brow_mid.' + sd], a['brow_peak.' + sd], a['brow_outer.' + sd]]
        d, t = poly_dist(P, pts)
        wid = PEOPLE[cid]['brow_w'] * (1.15 - 0.55 * t)
        m = np.maximum(m, np.clip(1 - d / wid, 0, 1) ** 0.8)
    return ndimage.gaussian_filter(m, 1.5)


def wrinkles(P, a, w, cid):
    h = np.zeros(P.shape[:2], np.float32)
    bz = a['brow_ridge_top.L'][2]
    fore = (P[..., 1] < -0.06) & (np.abs(P[..., 0]) < 0.05)
    for k, dz in enumerate((0.010, 0.019, 0.028)):
        zz = bz + dz + 0.0012 * np.sin(P[..., 0] * 90 + k)
        prof = np.exp(-((P[..., 2] - zz) / 0.0009) ** 2) * np.clip(1 - np.abs(P[..., 0]) / 0.048, 0, 1) ** 0.7
        h -= 0.10 * w * prof * fore
    for sd, sg in (('L', 1), ('R', -1)):
        lc = a['eye_corner_lateral.' + sd]
        for ang in (-35, -12, 10, 30):
            r = np.radians(ang)
            e = lc + np.array([sg * 0.016 * np.cos(r), 0.006, 0.016 * np.sin(r)])
            h += groove(P, [lc + np.array([sg * 0.004, 0.001, 0]), e], 0.0007, 0.07 * w)
        g1 = a['brow_inner.' + sd] + np.array([-sg * 0.004, 0, -0.002])
        h += groove(P, [g1, g1 + np.array([0, 0, 0.012])], 0.0008, 0.07 * w)
        lo = a['lid_lower_mid.' + sd]
        h += groove(P, [lo + np.array([-sg * 0.008, -0.002, -0.007]), lo + np.array([0, -0.001, -0.009]), lo + np.array([sg * 0.011, 0.002, -0.006])], 0.0011, 0.10 * w)
        nl = [a['ala_crease.' + sd] + np.array([sg * 0.002, 0, 0.002]), a['nasolabial_mid.' + sd], a['mouth_corner.' + sd] + np.array([sg * 0.009, 0.002, -0.006])]
        h += groove(P, nl, 0.0022, 0.22 * (0.5 + 0.5 * w), taper=True)
        if w > 0.6:
            mc = a['mouth_corner.' + sd]
            h += groove(P, [mc + np.array([sg * 0.002, 0, -0.002]), mc + np.array([sg * 0.004, 0.002, -0.016])], 0.0016, 0.12 * w)
    if w > 0.6:
        for zz in (1.485, 1.47):
            prof = np.exp(-((P[..., 2] - zz - 0.002 * np.sin(P[..., 0] * 60)) / 0.0012) ** 2) * (P[..., 2] < 1.51)
            h -= 0.08 * w * prof
    return h


def height_to_normal(h, P, size, strength=1.0):
    dPu = np.gradient(P, axis=1); dPv = -np.gradient(P, axis=0)
    su = np.maximum(np.linalg.norm(dPu, axis=2) * 1000, 1e-4); sv = np.maximum(np.linalg.norm(dPv, axis=2) * 1000, 1e-4)
    dhu = np.gradient(h, axis=1) / su; dhv = -np.gradient(h, axis=0) / sv
    n = np.stack([-dhu * strength, -dhv * strength, np.ones_like(h)], 2)
    return n / np.linalg.norm(n, axis=2, keepdims=True)


def blend_normals(a, b):
    n = np.stack([a[..., 0] + b[..., 0], a[..., 1] + b[..., 1], a[..., 2] * b[..., 2]], 2)
    return n / np.maximum(np.linalg.norm(n, axis=2, keepdims=True), 1e-9)


def make_body(cid, size=1024):
    L = LOOK[cid]
    B = load('src_body'); BV = B['co']; BFc = faces_of(B); BUV = B['uv']; reg = B['region'].round().astype(int)
    T = []; TL = []
    for i, f in enumerate(BFc):
        s0 = B['ls'][i]
        for k in range(1, len(f) - 1):
            T.append((f[0], f[k], f[k + 1])); TL.append((s0, s0 + k, s0 + k + 1))
    T = np.array(T); TL = np.array(TL)
    VN = vnormals(BV, T)
    R = load('rig'); names = [str(n) for n in R['names']]
    pal = np.zeros(len(BV))
    for s_ in ('Left', 'Right'):
        M = R['rest'][names.index(s_ + 'Hand')]
        z = M[:3, 2]
        d = VN @ z
        near = np.linalg.norm(BV - R['heads'][names.index(s_ + 'Hand')], axis=1) < 0.13
        pal = np.maximum(pal, np.where(near & (reg == 4), np.clip(d * 1.6 + 0.3, 0, 1), 0))
    att = np.concatenate([BV[T], VN[T], pal[T][..., None], (reg[T] == 4)[..., None].astype(float)], 2)
    out, mask, tid = raster(BUV[TL], att, size)
    P = bleed(out[..., :3], mask); palm = bleed(out[..., 6], mask); hand = bleed(out[..., 7], mask)
    tone = s2l(L['tone'])
    jb = s2l(np.asarray(Image.open(AVTEX + '/body_basecolor.jpg').convert('RGB').resize((size, size), Image.LANCZOS), np.float32) / 255)
    jbl = np.stack([ndimage.gaussian_filter(jb[..., k], size / 1024 * 10) for k in range(3)], 2)
    det = np.clip(jb / np.maximum(jbl, 1e-3), 0.7, 1.4) ** 0.9
    base, _, _, _ = base_color(P, L, AP)
    hw = np.clip(hand, 0, 1)[..., None]
    col = base * (1 - hw) + base * det * hw
    if L['tone'][0] < 0.55:
        pc = s2l(np.array([0.62, 0.45, 0.38]))
        pm = np.clip(palm, 0, 1) ** 1.3 * hand
        col = col * (1 - pm[..., None] * 0.85) + pc * det * pm[..., None] * 0.85
        kn = np.clip(1 - palm * 2, 0, 1) * hand
        col *= (1 - 0.10 * kn[..., None])
    else:
        pm = np.clip(palm, 0, 1) * hand
        col *= (1 + pm[..., None] * np.array([0.06, -0.01, -0.02]))
    if L['spots'] > 0.3:
        sp = np.clip((vnoise(P, 260.0, 61) - 0.80) / 0.05, 0, 1) * hand * (1 - palm)
        col *= (1 - 0.18 * sp[..., None] * np.array([0.6, 0.8, 1.0]))
    albedo = l2s(col)
    outd = HERE + f'/tex/{cid}'; os.makedirs(outd, exist_ok=True)
    Image.fromarray((albedo * 255 + 0.5).astype(np.uint8)).save(outd + '/body_basecolor.jpg', quality=90)
    jo = np.asarray(Image.open(AVTEX + '/body_orm.jpg').convert('RGB').resize((512, 512), Image.LANCZOS), np.float32) / 255
    rough = np.full(jo.shape[:2], L.get('rough', 0.56), np.float32)
    orm = np.stack([jo[..., 0], rough, np.zeros_like(rough)], 2)
    Image.fromarray((orm * 255 + 0.5).astype(np.uint8)).save(outd + '/body_orm.jpg', quality=90)


def make_eyes(cid, size=512):
    eye = EYES[PEOPLE[cid]['eyes']]
    for s in 'LR':
        im = np.asarray(Image.open(AVTEX + f'/eye{s}_basecolor.jpg').convert('RGB').resize((size, size), Image.LANCZOS), np.float32) / 255
        yy, xx = np.mgrid[0:size, 0:size] + 0.5
        cx = cy = size / 2
        r = np.hypot(xx - cx, yy - cy) / size
        ri, rp = 0.311, 0.118
        lum = (0.3 * im[..., 0] + 0.59 * im[..., 1] + 0.11 * im[..., 2])
        t = np.clip((r - rp) / (ri - rp), 0, 1)
        inner = np.exp(-((r - rp - 0.03) / 0.03) ** 2)
        mix = s2l(np.array(eye['c2'])) * inner[..., None] + s2l(np.array(eye['c1'])) * (1 - inner[..., None])
        lumn = lum / max(np.median(lum[(r > rp + 0.02) & (r < ri - 0.03)]), 1e-3)
        iris = mix * np.clip(lumn, 0.3, 2.2)[..., None] ** 1.1
        ringm = np.clip((r - (ri - 0.03)) / 0.03, 0, 1)
        iris *= (1 - eye['ring'] * ringm[..., None] * 0.7)
        out = s2l(im)
        irism = np.clip((ri + 0.004 - r) / 0.008, 0, 1) * np.clip((r - rp + 0.004) / 0.008, 0, 1)
        out = out * (1 - irism[..., None]) + iris * irism[..., None]
        scl = (r > ri + 0.004)
        sc = s2l(np.array(eye['sclera'])) / s2l(np.array([0.92, 0.90, 0.88])) * 0.8
        out = np.where(scl[..., None], out * sc, out)
        topshade = np.clip((cy - yy) / size * 2.2, 0, 1) * (r > ri - 0.01)
        out *= (1 - 0.35 * topshade[..., None])
        Image.fromarray((l2s(out) * 255 + 0.5).astype(np.uint8)).save(HERE + f'/tex/{cid}/eye{s}_basecolor.jpg', quality=92)


if __name__ == '__main__':
    for cid in [a for a in sys.argv[1:] if not a.startswith('-')] or list(CREW):
        os.makedirs(HERE + f'/tex/{cid}', exist_ok=True)
        big = cid == 'janine'
        make_head(cid, 2048 if big else 512, 1024 if big else 256)
        make_body(cid, 1024 if big else 512)
        make_eyes(cid, 512 if big else 128)
        print('skin', cid)
