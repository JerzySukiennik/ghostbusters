# People heads (from blender/crew/headfit.py): landmark-driven thin-plate warp of Jurek's head, lashes and morphs, eyes re-seated, neck blended into the body map.
import numpy as np, sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plib import *
from pdesign import CREW
from pdesign import FACES
import pbody as BF_

H = load('src_head'); HV = H['co']; HK = H['keys']; KN = [str(k) for k in H['key_names']]
HF = faces_of(H); HT = tris_of(HF); HMI = H['mi']
LA = load('src_lashes'); LV = LA['co']; LK = LA['keys']; LKN = [str(k) for k in LA['key_names']]
ANC = json.load(open(CACHE + '/anchors.json'))['anchors']
AP = {k: HV[v['vertex']].copy() for k, v in ANC.items()}
EYE_C = {'L': np.array([0.0303, -0.0677, 1.6374]), 'R': np.array([-0.0303, -0.0677, 1.6374])}
E0 = np.array([0.0, -0.0677, 1.6374])
SKULL_C = np.array([0.0, 0.0, 1.637])
J = dict(fissure=31.9, bizyg=138.9, bigonial=91.5, mouth=43.4, nose_w=35.3, nose_proj=11.9)
Z_SN, Z_STO, Z_ME = AP['subnasale'][2], AP['stomion_superius'][2], AP['menton'][2]
NOSE = ['nose_bridge_upper', 'nose_bridge_mid', 'nose_bridge_low', 'nose_dorsum_end', 'nose_tip_upper', 'pronasale', 'nose_tip_under', 'subnasale', 'columella_mid']
EYE_RING = ['eye_corner_medial', 'eye_corner_lateral', 'lid_upper_mid', 'lid_lower_mid', 'lash_upper_mid', 'lash_lower_mid', 'lid_upper_med_third', 'lid_upper_lat_third',
            'lid_lower_med_third', 'lid_lower_lat_third', 'lid_crease_mid', 'caruncle']


def side(name):
    return name[-1] if name.endswith(('.L', '.R')) else None


def base(name):
    return name[:-2] if name.endswith(('.L', '.R')) else name


def face_weight(name):
    b = base(name)
    if b in ('vertex_top', 'opisthocranion', 'inion', 'mastoid', 'neck_back', 'neck_front') or b.startswith(('ear_', 'hairline', 'forehead', 'temple', 'brow', 'glabella', 'orbital_upper')):
        return 0.0
    if b in ('gonion', 'jaw_ear_base', 'contour_jaw_angle'):
        return 0.45
    if b in ('zygion', 'contour_zygion', 'cheekbone', 'infraorbital'):
        return 0.15
    if b in ('cheek_mid', 'contour_cheek_mid', 'jaw_mid', 'contour_jaw_body', 'contour_cheek_low', 'nasolabial_upper'):
        return 0.8
    return 1.0


def remap_z(z, f, s):
    zr = (z - E0[2]) * 1000
    sn = -f['nose_len'] / s; sto = sn - f['upper_lip'] / s; me = sto - (f['lower_face'] - f['upper_lip']) / s
    xs = [(Z_ME - E0[2]) * 1000 - 40, (Z_ME - E0[2]) * 1000, (Z_STO - E0[2]) * 1000, (Z_SN - E0[2]) * 1000, 0.0, 200.0]
    ys = [me - 40 * 0.8, me, sto, sn, 0.0, 200.0]
    return E0[2] + np.interp(zr, xs, ys) / 1000


def targets(cid):
    f = FACES[cid]; s = CREW[cid]['s']
    mm = 0.001 / s
    sk = f['skull']
    T = {}
    Bp = BF_.body_params(cid)
    for n, p in AP.items():
        b = base(n); sd = side(n); sg = 1.0 if sd == 'L' else (-1.0 if sd == 'R' else 0.0)
        q = p.copy()
        if b in EYE_RING:
            continue
        if b in ('neck_front', 'neck_back'):
            q = BF_.neck_map(p[None], np.zeros(1), 1.0, Bp)[0]; q[2] += BF_.neck_dz(p[None], Bp)[0]
            T[n] = q
            continue
        v = q - SKULL_C
        sk_w = 1.0 - face_weight(n)
        q = SKULL_C + v * (1 + sk_w * (np.array([sk['sx'], sk['sy'], sk['sz'] if v[2] > 0 else 1.0]) - 1))
        if q[2] < E0[2]:
            fw = face_weight(n)
            q[2] = q[2] + fw * (remap_z(q[2], f, s) - q[2])
        if b in ('zygion', 'contour_zygion', 'cheekbone'):
            q[0] = p[0] * (f['bizyg'] / s) / J['bizyg']
        if b in ('gonion', 'contour_jaw_angle', 'jaw_ear_base', 'jaw_mid', 'contour_jaw_body'):
            k = (f['bigonial'] / s) / J['bigonial']
            q[0] = p[0] * (k if b in ('gonion', 'contour_jaw_angle', 'jaw_ear_base') else 1 + 0.8 * (k - 1))
            q[2] -= f['jaw_drop'] * mm * (1.0 if b in ('gonion', 'contour_jaw_angle') else 0.6)
        if b in ('cheek_mid', 'contour_cheek_mid', 'cheek_low', 'contour_cheek_low', 'contour_mouth_level'):
            kz = 0.5 * ((f['bizyg'] / s) / J['bizyg'] + (f['bigonial'] / s) / J['bigonial'])
            q[0] = p[0] * kz
        if b in ('chin_side', 'contour_chin_side', 'contour_chin_corner', 'jaw_front'):
            q[0] *= f['chin_width'] * (1 + 0.5 * ((f['bigonial'] / s) / J['bigonial'] - 1))
        if b in ('ala_outer', 'ala_crease', 'nostril_center', 'nostril_front', 'nostril_back', 'nostril_lateral', 'nostril_medial', 'nose_side_mid', 'nasolabial_upper'):
            kw = (f['nose_width'] / s) / J['nose_w']
            q[0] *= kw if b != 'nasolabial_upper' else 1 + 0.6 * (kw - 1)
            if b in ('ala_outer', 'nostril_lateral'):
                q[0] += sg * f['nostril_flare'] * mm
        if b in ('mouth_corner', 'lip_corner_outer', 'upper_lip_margin_x5', 'upper_lip_margin_x11', 'upper_lip_margin_x17', 'lower_lip_margin_x5',
                 'lower_lip_margin_x11', 'lower_lip_margin_x17', 'cupid_peak', 'upper_vermilion_x11', 'lower_vermilion_x8', 'lower_vermilion_x16', 'philtrum_column'):
            km = (f['mouth_width'] / s) / J['mouth']
            q[0] *= km if b != 'philtrum_column' else 1 + 0.3 * (km - 1)
        dproj = (f['nose_proj'] / s - J['nose_proj'])
        if b in ('pronasale', 'nose_tip_upper', 'nose_tip_under'):
            q[1] -= dproj * 0.001
            q[2] -= f['tip_drop'] * mm
        if b in ('columella_mid', 'nostril_front'):
            q[1] -= 0.55 * dproj * 0.001
        if b in ('nostril_center', 'ala_outer', 'nostril_lateral', 'nostril_medial'):
            q[1] -= 0.30 * dproj * 0.001
        if b == 'nose_dorsum_end':
            q[1] -= 0.8 * dproj * 0.001
        if b in ('nose_bridge_upper', 'nose_bridge_mid', 'nose_bridge_low', 'nose_bridge_side', 'nose_side_mid'):
            w = {'nose_bridge_upper': 0.55, 'nose_bridge_mid': 0.85, 'nose_bridge_low': 0.9, 'nose_bridge_side': 0.35, 'nose_side_mid': 0.25}[b]
            q[1] -= (f['bridge'] * w + (f['hump'] if b in ('nose_bridge_mid', 'nose_bridge_low') else 0)) * mm + w * 0.35 * dproj * 0.001
        if b == 'nasion':
            q[1] -= 0.35 * f['bridge'] * mm
        if b in ('glabella', 'brow_ridge_top', 'brow_inner', 'brow_mid', 'brow_peak', 'orbital_upper_mid'):
            w = {'glabella': 0.9, 'brow_ridge_top': 1.0, 'brow_inner': 1.0, 'brow_mid': 0.9, 'brow_peak': 0.7, 'orbital_upper_mid': 0.8}[b]
            q[1] -= f['brow_ridge'] * w * mm
            if b.startswith('brow') and b != 'brow_ridge_top':
                q[2] += f['brow_height'] * mm
                if b in ('brow_peak', 'brow_outer', 'brow_mid'):
                    q[2] += f['brow_tilt'] * mm * (0.6 if b == 'brow_mid' else 1.0)
        if b == 'brow_outer':
            q[2] += (f['brow_height'] + f['brow_tilt']) * mm
        if b in ('labrale_superius', 'upper_vermilion_x11', 'cupid_peak'):
            q[2] += f['lip_up'] * mm * 0.8; q[1] -= (f['lip_up'] * 0.6 + f['lip_proj']) * mm
        if b in ('labrale_inferius', 'lower_vermilion_x8', 'lower_vermilion_x16', 'lower_lip_mid_out'):
            q[2] -= f['lip_low'] * mm * 0.8; q[1] -= (f['lip_low'] * 0.6 + f['lip_proj']) * mm
        if b in ('stomion_superius', 'stomion_inferius', 'upper_lip_margin_x5', 'lower_lip_margin_x5', 'upper_lip_margin_x11', 'lower_lip_margin_x11'):
            q[1] -= f['lip_proj'] * mm * 0.8
        if b in ('pogonion', 'menton', 'sublabiale', 'chin_side'):
            q[1] -= f['chin_proj'] * mm * (1.0 if b != 'sublabiale' else 0.5)
        if b in ('cheek_mid', 'cheek_low', 'infraorbital', 'nasolabial_mid'):
            q[1] -= f['cheek_full'] * mm * (0.6 if b == 'infraorbital' else 1.0)
            q[0] += sg * f['cheek_full'] * mm * 0.5
        if b in ('cheek_low', 'contour_cheek_low', 'contour_cheek_mid') and f['cheek_hollow']:
            q[0] -= sg * f['cheek_hollow'] * mm; q[1] += f['cheek_hollow'] * mm * 0.5
        if f['jowl'] and b in ('cheek_low', 'contour_mouth_level', 'contour_jaw_body', 'jaw_front', 'contour_chin_corner', 'jaw_mid'):
            q[2] -= f['jowl'] * mm; q[0] += sg * f['jowl'] * mm * 0.7
        if f['double_chin'] and b in ('submental',):
            q[2] -= f['double_chin'] * mm * 0.7; q[1] -= f['double_chin'] * mm * 0.5
        if b in ('temple',) and f['temple_hollow']:
            q[0] -= sg * f['temple_hollow'] * mm
        if b.startswith('hairline') or b == 'forehead_mid':
            q[2] += f['forehead'] * mm * (1.0 if b in ('hairline_mid', 'hairline_temple') else 0.5)
        if b.startswith('ear_'):
            ec = SKULL_C + (np.array([sg * 0.072, 0.008, 1.606]) - SKULL_C) * np.array([sk['sx'], sk['sy'], 1.0])
            c0 = np.array([sg * 0.072, 0.008, 1.606])
            q = ec + (p - c0) * (f['ear_scale'] / s)
            q[0] += sg * f['ear_out'] * mm * (1.0 if b in ('ear_rim_outer_point', 'ear_helix_back', 'ear_top') else 0.4)
        T[n] = q
    eyes = {}
    for sd, sg in (('L', 1.0), ('R', -1.0)):
        c = EYE_C[sd]
        c2 = np.array([sg * f['ipd'] / 2 * mm, c[1] + f['eye_depth'] * mm, c[2] + f['eye_dz'] * mm])
        es = (f['eye_scale'] / 23.2) / s
        kf = (f['fissure'] / s) / J['fissure']
        eyes[sd] = (c, c2, es)
        for b in EYE_RING:
            n = b + '.' + sd
            if n not in AP:
                continue
            v = AP[n] - c
            q = c2 + v * np.array([kf, es, es])
            if b in ('lid_upper_mid', 'lid_upper_med_third', 'lid_upper_lat_third', 'lash_upper_mid'):
                q[2] += f['aperture'] * mm * 0.6
            if b in ('lid_lower_mid', 'lid_lower_med_third', 'lid_lower_lat_third', 'lash_lower_mid'):
                q[2] -= f['aperture'] * mm * 0.4
            if b == 'lid_crease_mid':
                q[2] += f['aperture'] * mm * 0.3 - (f['eye_depth'] * 0.3) * mm
            lat = (v[0] * sg) / 0.016
            q[2] += f['eye_tilt'] * mm * np.clip(lat, -1, 1)
            T[n] = q
    return T, eyes


def scalp_points(cid, n=60):
    f = FACES[cid]; sk = f['skull']
    skin = np.unique(HT[np.isin(np.repeat(np.arange(len(HF)), [len(x) - 2 for x in HF]), np.where(HMI == 0)[0])].ravel())
    P = HV[skin]
    m = ((P[:, 2] > E0[2] + 0.03) | ((P[:, 1] > 0.03) & (P[:, 2] > 1.55))) & (np.abs(P[:, 0]) < 0.075)
    cand = P[m]
    rng = np.random.default_rng(3)
    idx = [rng.integers(len(cand))]
    dmin = np.linalg.norm(cand - cand[idx[0]], axis=1)
    for _ in range(n - 1):
        i = int(np.argmax(dmin)); idx.append(i); dmin = np.minimum(dmin, np.linalg.norm(cand - cand[i], axis=1))
    X = cand[idx]
    v = X - SKULL_C
    Y = SKULL_C + v * np.stack([np.full(len(v), sk['sx']), np.full(len(v), sk['sy']), np.where(v[:, 2] > 0, sk['sz'], 1.0)], 1)
    return X, Y


def neck_points(cid):
    B = BF_.body_params(cid)
    skin = HV[np.unique(HT.ravel())]
    out = []
    for z in (1.462, 1.478):
        ring = skin[np.abs(skin[:, 2] - z) < 0.004]
        ang = np.arctan2(ring[:, 0], -ring[:, 1])
        for a in np.linspace(-np.pi, np.pi, 18, endpoint=False):
            k = np.argmin(np.abs(np.angle(np.exp(1j * (ang - a)))))
            out.append(ring[k])
    X = np.unique(np.array(out), axis=0)
    W = np.zeros((len(X), len(BF_.NAMES))); W[:, BF_.BI['Neck']] = 1
    Y = BF_.neck_map(X, np.zeros(len(X)), 1.0, B)
    Y[:, 2] += BF_.neck_dz(X, B)
    return X, Y


def build_tps(cid):
    T, eyes = targets(cid)
    names = sorted(T)
    X = [AP[n] for n in names]; Y = [T[n] for n in names]
    for sd in ('L', 'R'):
        c, c2, es = eyes[sd]
        X.append(c); Y.append(c2)
        for v in (np.array([0.008, 0, 0]), np.array([-0.008, 0, 0]), np.array([0, 0, 0.008]), np.array([0, 0, -0.008]), np.array([0, 0.008, 0])):
            X.append(c + v); Y.append(c2 + v * es)
    Xs, Ys = scalp_points(cid); Xn, Yn = neck_points(cid)
    X = np.vstack([np.array(X), Xs, Xn]); Y = np.vstack([np.array(Y), Ys, Yn])
    keep = np.ones(len(X), bool)
    for i in range(len(X)):
        if keep[i]:
            close = np.linalg.norm(X - X[i], axis=1) < 1e-4
            close[i] = False; keep[close] = False
    return TPS(X[keep], Y[keep], reg=2e-7), eyes


def beta(P):
    return sstep(1.445, 1.50, P[:, 2])


def warp_head(cid, P, tps=None, base=None):
    B = BF_.body_params(cid)
    if tps is None:
        tps, _ = build_tps(cid)
    b = beta(P if base is None else base)
    Nm = BF_.neck_map(P, np.zeros(len(P)), 1.0, B)
    Nm[:, 2] += BF_.neck_dz(P, B)
    return b[:, None] * tps(P) + (1 - b[:, None]) * Nm


def blend_body_neck(cid, tps):
    p = CACHE + f'/{cid}_body.npz'
    if not os.path.exists(p):
        return
    d = dict(np.load(p))
    BV = BF_.BV
    V = d.get('body_raw', d['body']).copy()
    r = np.hypot(BV[:, 0], BV[:, 1] - 0.004)
    b = beta(BV) * sstep(0.085, 0.07, r)
    m = b > 1e-4
    V[m] = b[m, None] * tps(BV[m]) + (1 - b[m, None]) * V[m]
    d['body'] = V
    np.savez(p, **d)


def build(cid, keys=True):
    tps, eyes = build_tps(cid)
    blend_body_neck(cid, tps)
    Hn = warp_head(cid, HV, tps)
    Kn = np.array([warp_head(cid, K, tps, base=HV) for K in HK]) if keys else np.zeros((0, len(HV), 3))
    Ln = warp_head(cid, LV, tps)
    LKn = np.array([warp_head(cid, K, tps, base=LV) for K in LK]) if keys else np.zeros((0, len(LV), 3))
    ev = {}
    for sd in ('L', 'R'):
        E = load('gb_Eye' + sd)
        c, c2, es = eyes[sd]
        ev[sd] = c2 + (E['co'] - c) * es
    np.savez(CACHE + f'/{cid}_head.npz', head=Hn, keys=Kn, lashes=Ln, lkeys=LKn, eyeL=ev['L'], eyeR=ev['R'],
             eyeL_c=eyes['L'][1], eyeR_c=eyes['R'][1], eye_s=np.array([eyes['L'][2]]), tpsX=tps.X, tpsW=tps.W, tpsA=tps.A)
    return Hn, Kn, Ln, ev, tps


def measure(Hn, s):
    P = {k: Hn[v['vertex']] for k, v in ANC.items()}
    d = lambda a, b: np.linalg.norm(P[a] - P[b]) * 1000 * s
    return dict(head_h=round((P['vertex_top'][2] - P['menton'][2]) * 1000 * s, 1), face_h=round(d('nasion', 'menton'), 1), nose_l=round(d('nasion', 'subnasale'), 1),
                nose_w=round(d('ala_outer.L', 'ala_outer.R'), 1), mouth=round(d('mouth_corner.L', 'mouth_corner.R'), 1), bizyg=round(d('zygion.L', 'zygion.R'), 1),
                bigon=round(d('gonion.L', 'gonion.R'), 1), proj=round((P['subnasale'][1] - P['pronasale'][1]) * 1000 * s, 1),
                breadth=round((Hn[:, 0].max() - Hn[:, 0].min()) * 1000 * s, 1), top=round(Hn[:, 2].max() * s, 3))


def preview(cid, Hn, ev, path):
    skin = HMI[np.repeat(np.arange(len(HF)), [len(x) - 2 for x in HF])]
    Ts = HT[skin == 0]
    E = load('gb_EyeL'); ET = tris_of(faces_of(E))
    meshes = [(Hn, Ts, (0.86, 0.72, 0.62)), (ev['L'], ET, (0.95, 0.95, 0.95)), (ev['R'], ET, (0.95, 0.95, 0.95))]
    c = (0, -0.03, 1.62)
    ims = [splat(meshes, view=v, size=(360, 440), center=c, height=0.30) for v in ('front', 'q34', 'left')]
    return ims


if __name__ == '__main__':
    for cid in [a for a in sys.argv[1:] if not a.startswith('-')] or list(CREW):
        Hn, Kn, Ln, ev, tps = build(cid, keys=(cid == 'janine'))
        print('head', cid, measure(Hn, CREW[cid]['s']))
