# Pedestrian part builder: dressed body, head, eyes, hair volume, hat, coat/skirt tube, collar with atlas UVs and Jurek-rig weights, plus the 1024 atlas.
import numpy as np, sys, os, json
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plib import *
from pdesign import PEOPLE, PEDS
import garments as G

HERE = os.path.dirname(os.path.abspath(__file__))


def pack_poly(V, polys, uv_v, W, zone=None, uv_loop=None):
    polys = [list(p) for p in polys]
    lt = np.array([len(p) for p in polys]); ls = np.concatenate([[0], np.cumsum(lt)[:-1]])
    loops = np.concatenate([np.array(p) for p in polys])
    uv = uv_loop if uv_loop is not None else uv_v[loops]
    return dict(co=np.asarray(V, float), loops=loops, ls=ls, lt=lt, uv=np.asarray(uv, float), W=np.asarray(W, np.float32),
                zone=np.zeros(len(polys), np.int64) if zone is None else np.asarray(zone, np.int64))


def atlas_from_extras(uv):
    return np.stack([uv[:, 0], uv[:, 1] * 0.5], 1)


def head_zones(Hn, d):
    eL, eR = d['eyeL_c'], d['eyeR_c']
    mouth = np.array([0.0, (eL[1] + eR[1]) / 2 - 0.030, eL[2] - 0.080])
    zones = []
    for i, f in enumerate(G.HFc):
        m = G.HMI[i]
        if m >= 3:
            zones.append(3); continue
        c = Hn[f].mean(0)
        ne = min(np.linalg.norm((c - eL) * [1, 0.8, 1.15]), np.linalg.norm((c - eR) * [1, 0.8, 1.15])) < 0.030
        nm = np.linalg.norm((c - mouth) * [0.75, 0.9, 1.1]) < 0.036
        back = c[1] > eL[1] + 0.035 or c[2] < mouth[2] - 0.05
        zones.append(0 if (ne or nm) else (2 if back else 1))
    return np.array(zones)


def build_ped(cid, size=1024):
    D = PEOPLE[cid]; o = D['outfit']
    cb = np.load(CACHE + f'/{cid}_body.npz'); Vb = cb['body']
    hd = G.HeadGeo(cid); Hn = hd.V; hdd = hd.d
    parts = {}
    Vd, ease = G.dress_body(cid, Vb)
    buv = np.stack([G.BUV[:, 0] * 0.5, 0.5 + G.BUV[:, 1] * 0.5], 1)
    bz = np.array([1 if (G.REG[f] == 4).any() else 0 for f in G.BFc])
    parts['body'] = pack_poly(Vd, G.BFc, None, G.BW, zone=bz, uv_loop=buv)
    huv = np.stack([0.5 + G.HUV[:, 0] * 0.5, 0.5 + G.HUV[:, 1] * 0.5], 1)
    sol = {3: 'teeth', 4: 'gums', 5: 'tongue'}
    k = 0
    for i, f in enumerate(G.HFc):
        m = G.HMI[i]
        if m >= 3:
            huv[k:k + len(f)] = atlas_from_extras(G.solid_uv(sol[m], len(f)))
        k += len(f)
    parts['head'] = pack_poly(Hn, G.HFc, None, G.HW, zone=head_zones(Hn, hdd), uv_loop=huv)
    for s, bone in (('L', 'LeftEye'), ('R', 'RightEye')):
        E = load('gb_Eye' + s); EF = faces_of(E); keepf = [i for i in range(len(EF)) if E['mi'][i] == 0]
        polys = [EF[i] for i in keepf]
        ls = E['ls'][keepf]; lt = E['lt'][keepf]
        luv = np.concatenate([E['uv'][a:a + b] for a, b in zip(ls, lt)])
        euv = atlas_from_extras(G.rect_uv('eye' + s, luv))
        parts['eye' + s] = pack_poly(hdd['eye' + s], polys, None, G.onehot_w(len(E['co']), bone), uv_loop=euv)
    hs = D['hair']; hat = o.get('hat')
    hair_th = max(hs['side'], hs['back']) * 0.85 + hs.get('curl', 0)
    hatband = G.hat_band_z(hd, hat) if hat else None
    Vh, Fh, uvh = G.make_hair_vol(cid, hd, hs, hatband)
    parts['hair'] = pack_poly(Vh, Fh, atlas_from_extras(G.rect_uv('hair', uvh)), G.onehot_w(len(Vh), 'Head'))
    if hat:
        Vt, Ft, uvt = G.make_hat(hd, hat, hair_th if hs['style'] not in ('perm',) else hair_th * 0.8)
        parts['hat'] = pack_poly(Vt, Ft, atlas_from_extras(G.rect_uv('hat', uvt)), G.onehot_w(len(Vt), 'Head'))
    top, legs = o.get('top'), o.get('legs')
    tube = None
    if top and top['kind'] == 'coat':
        tube = dict(kind='coat', z_top=0.93, hem=top['hem'], ease=0.004, flare=0.05, color=top['color'], pattern=top.get('pattern', 'wool'), opts=top)
    elif legs and legs['kind'] == 'skirt':
        zt = min(legs.get('top', 1.0), (top or {}).get('hem', 2.0) + 0.02)
        tube = dict(kind='skirt', z_top=zt, hem=legs['hem'], ease=legs['ease'] / 1000 * 0.5, flare=legs.get('flare', 0.0), color=legs['color'], pattern=legs.get('pattern', 'wool'), opts=legs)
    if tube:
        Vtb, Ftb, uvtb, th, zs = G.make_tube(Vd, tube['z_top'], tube['hem'], tube['ease'], tube['flare'], nth=30, nz=max(5, int((tube['z_top'] - tube['hem']) / 0.05) + 2))
        parts['tube'] = pack_poly(Vtb, Ftb, atlas_from_extras(G.rect_uv('tube', uvtb)), G.tube_weights(Vtb, Vd, tube['z_top']))
        tube.update(th=th, zs=zs)
    ck = top.get('collar') if top else None
    if ck and ck != 'none':
        Vc, Fc, uvc = G.make_collar(Vd, ck)
        parts['collar'] = pack_poly(Vc, Fc, atlas_from_extras(G.rect_uv('collar', uvc)), G.nearest_body_weights(Vc, Vd, (0, 1)))
    if o.get('earrings'):
        ev = []; ef = []; off = 0
        for s in ('L', 'R'):
            c = hd.anchor('ear_lobe_bottom.' + s) + np.array([0, 0, -0.008])
            u, v = np.meshgrid(np.linspace(0, np.pi, 5), np.linspace(0, 2 * np.pi, 7)[:-1])
            r = 0.0065
            pts = np.stack([np.sin(u) * np.cos(v), np.sin(u) * np.sin(v), np.cos(u)], -1).reshape(-1, 3) * r + c
            ev.append(pts)
            for i in range(6):
                for j in range(4):
                    a = i * 5 + j; b = ((i + 1) % 6) * 5 + j
                    ef.append((a + off, b + off, b + 1 + off, a + 1 + off))
            off += len(pts)
        Ve = np.vstack(ev)
        parts['earrings'] = pack_poly(Ve, ef, atlas_from_extras(G.solid_uv('earring', len(Ve))), G.onehot_w(len(Ve), 'Head'))
    img = np.zeros((size, size, 3), np.float32)
    half = size // 2
    img[:half, :half] = G.paint_body_tex(cid, half, Vb)
    hb = np.asarray(Image.open(HERE + f'/tex/{cid}/head_basecolor.jpg').convert('RGB').resize((half, half), Image.LANCZOS), np.float32) / 255
    img[:half, half:] = hb
    ext = np.zeros((size, size, 3), np.float32) + 0.2
    W, H = size, size
    el_lo = min(hs['nape'], -20) - 6
    w_, h_ = G.rect_px('hair', H, W); G.put_rect(ext, 'hair', G.paint_hair(hs, w_, h_, el_lo))
    if hat:
        w_, h_ = G.rect_px('hat', H, W); G.put_rect(ext, 'hat', G.paint_hat(hat, w_, h_))
    if tube:
        w_, h_ = G.rect_px('tube', H, W); G.put_rect(ext, 'tube', G.paint_tube(o, tube['kind'], (w_, h_), tube['th'], tube['zs'], tube['color'], tube['pattern'], tube['opts']))
    if ck and ck != 'none':
        w_, h_ = G.rect_px('collar', H, W); G.put_rect(ext, 'collar', G.paint_collar(o, ck, w_, h_))
    for s in 'LR':
        w_, h_ = G.rect_px('eye' + s, H, W); G.put_rect(ext, 'eye' + s, G.eye_cell(cid, s, max(w_, h_)))
    sc = G.solid_colors(cid)
    u0, v0, u1, v1 = G.RECT['solid']
    cw = (u1 - u0) / 8 * W; ch = (v1 - v0) / 8 * H
    for k, nm in enumerate(G.SOLIDS):
        cu, cv = k % 8, k // 8
        x0 = int(u0 * W + cu * cw); y1 = int((1 - v0) * H - cv * ch)
        ext[int(y1 - ch):y1, x0:int(x0 + cw)] = sc.get(nm, (0.5, 0.5, 0.5))
    img[half:] = np.asarray(Image.fromarray((np.clip(ext, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((size, half), Image.LANCZOS), np.float32) / 255
    os.makedirs(HERE + f'/tex/{cid}', exist_ok=True)
    Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(HERE + f'/tex/{cid}/atlas.jpg', quality=90)
    flat = {}
    for name, p in parts.items():
        for k_, v in p.items():
            flat[name + '__' + k_] = v
    flat['names'] = np.array(list(parts))
    np.savez_compressed(CACHE + f'/{cid}_ped.npz', **flat)
    tris = {n: int((p['lt'] - 2).sum()) for n, p in parts.items()}
    return tris


if __name__ == '__main__':
    for cid in [a for a in sys.argv[1:] if not a.startswith('-')] or PEDS:
        t = build_ped(cid)
        print('ped', cid, t, sum(t.values()))
