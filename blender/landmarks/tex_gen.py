# Landmark textures: resized CC0 Poly Haven scans + procedural glazed brick, cinder block, pressed tin, plank floor, grunge, sign atlas.
import os
import sys
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, 'Niepotrzebne/work/plate/src/textures')
OUT = os.path.join(HERE, 'tex')
os.makedirs(OUT, exist_ok=True)
FONTS = '/System/Library/Fonts/Supplemental/'
PFONTS = os.path.join(ROOT, 'Niepotrzebne/work/plate/src/fonts')
rng = np.random.default_rng(1984)


def load(name, kind, size):
    im = Image.open(os.path.join(SRC, name, kind + '.jpg')).convert('RGB')
    return np.asarray(im.resize((size, size), Image.LANCZOS), np.float32) / 255.0


def save(arr, name, png=False):
    a = np.clip(arr * 255 + 0.5, 0, 255).astype(np.uint8)
    im = Image.fromarray(a)
    p = os.path.join(OUT, name + ('.png' if png else '.jpg'))
    if png:
        im.save(p, optimize=True)
    else:
        im.save(p, quality=88)


def blur(a, r):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255.0


def noise(n, scale, octaves=4, seed=0):
    r = np.random.default_rng(seed)
    out = np.zeros((n, n), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = max(2, int(scale * 2 ** o))
        g = r.random((c, c)).astype(np.float32)
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC)
        g2 = np.asarray(im, np.float32) / 255.0
        out += g2 * amp
        tot += amp
        amp *= 0.5
    return out / tot


def tile_noise(n, cells, seed=0, octaves=4):
    r = np.random.default_rng(seed)
    out = np.zeros((n, n), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = cells * 2 ** o
        g = r.random((c, c)).astype(np.float32)
        g = np.tile(g, (3, 3))
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((n * 3, n * 3), Image.BICUBIC)
        g2 = (np.asarray(im, np.float32) / 255.0)[n:2 * n, n:2 * n]
        out += g2 * amp
        tot += amp
        amp *= 0.5
    return out / tot


def height_to_normal(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx = -dx * strength
    ny = dy * strength
    nz = np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l * 0.5 + 0.5, ny / l * 0.5 + 0.5, nz / l * 0.5 + 0.5], -1)


def combine_normals(a, b):
    na = a * 2 - 1
    nb = b * 2 - 1
    n = np.stack([na[..., 0] + nb[..., 0], na[..., 1] + nb[..., 1], na[..., 2] * nb[..., 2]], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def arm(ao, rough, metal):
    return np.stack([ao, rough, metal], -1)


def copies():
    for src, dst, size, tint in (('large_red_bricks', 'brick', 1024, (0.98, 0.93, 0.9)), ('red_brick_03', 'cbrick', 1024, (1, 1, 1)),
                                 ('metal_plate', 'diamond', 512, (1, 1, 1))):
        d = load(src, 'diff', size) * np.array(tint, np.float32)
        save(d, dst + '_diff')
        save(load(src, 'nor', size), dst + '_nor', png=True)
        save(load(src, 'arm', size), dst + '_arm')


def stone():
    n = 1024
    base = load('concrete_wall_008', 'diff', n)
    lum = base.mean(-1, keepdims=True)
    tone = np.array([0.80, 0.77, 0.71], np.float32)
    d = tone * (0.55 + 0.9 * (lum / lum.mean()) * 0.5)
    tile_m = 2.2
    px = n / tile_m
    h = np.ones((n, n), np.float32)
    var = np.ones((n, n), np.float32)
    rows = [0.0, 0.55, 1.1, 1.65]
    for ri, y0 in enumerate(rows):
        r0, r1 = int(y0 * px), int((y0 + 0.55) * px)
        off = 0.55 if ri % 2 else 0.0
        xs = [((off + k * 1.1) % tile_m) for k in range(2)]
        for k in range(2):
            x0 = xs[k]
            c0, c1 = int(x0 * px), int((x0 + 1.1) * px)
            v = 0.9 + 0.2 * rng.random()
            cols = np.arange(c0, c1) % n
            var[r0:r1][:, cols] = v
    d *= var[..., None]
    j = np.zeros((n, n), np.float32)
    jw = max(2, int(0.008 * px))
    for ri, y0 in enumerate(rows):
        r = int(y0 * px) % n
        j[max(0, r - jw):r + jw, :] = 1
        if r - jw < 0:
            j[n + r - jw:, :] = 1
        r0, r1 = int(y0 * px), int((y0 + 0.55) * px)
        off = 0.55 if ri % 2 else 0.0
        for k in range(2):
            c = int(((off + k * 1.1) % tile_m) * px) % n
            cs = np.arange(c - jw, c + jw) % n
            j[r0:r1][:, cs] = 1
    jb = blur(j, 1.2)
    d = d * (1 - 0.35 * jb[..., None])
    dirt = tile_noise(n, 4, seed=3)
    d *= (0.82 + 0.3 * dirt)[..., None]
    save(np.clip(d, 0, 1), 'stone_diff')
    hn = height_to_normal(1 - jb, 3.0)
    save(combine_normals(load('concrete_wall_008', 'nor', n), hn), 'stone_nor', png=True)
    a = load('concrete_wall_008', 'arm', n)
    rough = np.clip(a[..., 1] * 0.6 + 0.35, 0, 1)
    save(arm(np.clip(1 - 0.45 * jb, 0, 1), rough, np.zeros_like(rough)), 'stone_arm')


def concrete_floor():
    n = 1024
    base = load('concrete_wall_008', 'diff', n)
    lum = base.mean(-1)
    d = np.stack([lum * 0.95, lum * 0.95, lum * 0.97], -1) * 0.82
    stains = tile_noise(n, 3, seed=11, octaves=5)
    oil = np.clip((stains - 0.55) * 4, 0, 1)
    d *= (1 - 0.45 * oil)[..., None]
    grime = tile_noise(n, 8, seed=12)
    d *= (0.85 + 0.25 * grime)[..., None]
    save(np.clip(d, 0, 1), 'conc_diff')
    save(load('concrete_wall_008', 'nor', n), 'conc_nor', png=True)
    rough = np.clip(0.82 - 0.35 * oil + 0.1 * (grime - 0.5), 0.3, 1)
    save(arm(np.ones_like(rough), rough, np.zeros_like(rough)), 'conc_arm')


def oak():
    n = 1024
    base = load('plywood', 'diff', n)
    lum = base.mean(-1) / base.mean()
    tone = np.array([0.42, 0.24, 0.11], np.float32)
    d = tone * (0.55 + 0.55 * lum)[..., None]
    save(np.clip(d, 0, 1), 'oak_diff')
    rough = np.clip(0.42 + 0.15 * (lum - 1), 0.25, 0.7)
    save(arm(np.ones_like(rough), rough, np.zeros_like(rough)), 'oak_arm')


def glazed():
    n = 1024
    L, C, J = 0.236, 0.081, 0.007
    tw, th = 4 * L, 12 * C
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32)
    u = xs / n * tw
    v = ys / n * th
    row = np.floor(v / C)
    off = (row % 2) * L * 0.5
    bx = np.floor(((u + off) % tw) / L)
    fu = ((u + off) % L)
    fv = v % C
    edge = np.minimum(np.minimum(fu, L - fu) / J, np.minimum(fv, C - fv) / J)
    mortar = np.clip(1.6 - edge * 1.6, 0, 1)
    cell = (row * 13 + bx * 7) % 97
    r = np.random.default_rng(5).random(200).astype(np.float32)
    shade = 0.86 + 0.24 * r[cell.astype(int)]
    craz = tile_noise(n, 16, seed=21)
    glaze = shade * (0.95 + 0.1 * craz)
    bulge = np.clip(edge / 3.0, 0, 1)
    h = np.where(mortar > 0.5, 0.0, 0.4 + 0.6 * np.sqrt(bulge))
    d = np.stack([glaze, glaze, glaze], -1)
    mcol = np.array([0.62, 0.60, 0.56], np.float32)
    d = d * (1 - mortar[..., None]) + mcol * mortar[..., None]
    save(np.clip(d, 0, 1), 'glazed_diff')
    save(height_to_normal(blur(h, 1.0), 6.0), 'glazed_nor', png=True)
    rough = np.clip(0.12 + 0.75 * mortar + 0.08 * craz, 0, 1)
    save(arm(1 - 0.35 * mortar, rough, np.zeros_like(rough)), 'glazed_arm')


def cinder():
    n = 1024
    BW, BH, J = 0.406, 0.203, 0.012
    tw, th = 4 * BW, 8 * BH
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32)
    u = xs / n * tw
    v = ys / n * th
    row = np.floor(v / BH)
    off = (row % 2) * BW * 0.5
    fu = (u + off) % BW
    fv = v % BH
    edge = np.minimum(np.minimum(fu, BW - fu), np.minimum(fv, BH - fv)) / J
    mortar = np.clip(1.3 - edge, 0, 1)
    pores = tile_noise(n, 64, seed=31, octaves=2)
    blot = tile_noise(n, 6, seed=32)
    tone = np.array([0.66, 0.57, 0.36], np.float32)
    d = tone * (0.86 + 0.18 * blot + 0.1 * (pores - 0.5))[..., None] * (1 - 0.3 * mortar)[..., None]
    save(np.clip(d, 0, 1), 'block_diff')
    h = np.where(mortar > 0.3, 0.2, 0.7) + 0.15 * pores
    save(height_to_normal(blur(h, 1.5), 5.0), 'block_nor', png=True)
    rough = np.clip(0.7 + 0.2 * pores, 0, 1)
    save(arm(1 - 0.3 * mortar, rough, np.zeros_like(rough)), 'block_arm')


def tin():
    n = 512
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32) / n
    cx, cy = xs - 0.5, ys - 0.5
    ax, ay = np.abs(cx), np.abs(cy)
    m = np.maximum(ax, ay)
    h = np.zeros((n, n), np.float32)
    h += np.clip((0.5 - m) / 0.02, 0, 1) * 0.15
    h += ((m > 0.40) & (m < 0.44)) * 0.5
    h += ((m > 0.30) & (m < 0.32)) * 0.35
    d1 = np.abs(ax + ay)
    h += ((d1 > 0.26) & (d1 < 0.29) & (m < 0.3)) * 0.4
    rr = np.sqrt(cx * cx + cy * cy)
    h += np.clip(1 - rr / 0.12, 0, 1) * 0.8
    ang = np.arctan2(cy, cx)
    petals = (np.cos(ang * 8) * 0.5 + 0.5) * ((rr > 0.12) & (rr < 0.22))
    h += petals * 0.35 * np.clip(1 - (rr - 0.12) / 0.1, 0, 1)
    corner = np.sqrt((ax - 0.37) ** 2 + (ay - 0.37) ** 2)
    h += np.clip(1 - corner / 0.045, 0, 1) * 0.5
    beads = ((m > 0.46) & (m < 0.49)) * (np.cos((cx + cy) * 2 * np.pi * 14) * 0.5 + 0.5) * 0.4
    h += beads
    hb = blur(np.clip(h, 0, 1.5) / 1.5, 1.6)
    save(height_to_normal(hb, 9.0), 'tin_nor', png=True)
    tone = np.array([0.78, 0.71, 0.55], np.float32)
    stain = noise(n, 3, seed=41)
    cav = blur(hb, 6) - hb
    d = tone * (0.9 + 0.15 * stain)[..., None] * (1 - 0.6 * np.clip(cav * 3, 0, 1))[..., None]
    save(np.clip(d, 0, 1), 'tin_diff')
    save(arm(np.clip(1 - 2 * np.clip(cav, 0, 1), 0.4, 1), np.full((n, n), 0.45, np.float32), np.zeros((n, n), np.float32)), 'tin_arm')


def planks():
    n = 1024
    W = 0.105
    tile = 1.05
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32)
    u = xs / n * tile
    v = ys / n * tile
    col = np.floor(u / W)
    r = np.random.default_rng(51).random(64).astype(np.float32)
    seg_len = 0.35 + 0.7 * r[(col.astype(int) * 3) % 64]
    shift = r[(col.astype(int) * 5 + 1) % 64] * tile
    vv = (v + shift) % tile
    seg = np.floor(vv / seg_len)
    fu = u % W
    fv = vv % seg_len
    gap = (np.minimum(fu, W - fu) < 0.0025) | (np.minimum(fv, seg_len - fv) < 0.002)
    grain = tile_noise(n, 8, seed=52)
    streak = np.sin((u * 140 + grain * 9) * 1.0) * 0.5 + 0.5
    pid = (col * 17 + seg * 5).astype(int) % 64
    shade = 0.75 + 0.4 * r[pid]
    tone = np.array([0.36, 0.2, 0.1], np.float32)
    d = tone * (shade * (0.85 + 0.25 * streak))[..., None]
    d[gap] *= 0.35
    wear = tile_noise(n, 5, seed=53)
    d *= (0.85 + 0.25 * wear)[..., None]
    save(np.clip(d, 0, 1), 'floor_diff')
    h = np.where(gap, 0.0, 1.0) + 0.05 * streak
    save(height_to_normal(blur(h, 0.8), 4.0), 'floor_nor', png=True)
    rough = np.clip(0.35 + 0.3 * wear + gap * 0.4, 0, 1)
    save(arm(np.where(gap, 0.6, 1.0), rough, np.zeros_like(rough)), 'floor_arm')


def grunge():
    n = 512
    a = tile_noise(n, 4, seed=61)
    b = tile_noise(n, 32, seed=62, octaves=2)
    v = 0.86 + 0.1 * a + 0.06 * (b - 0.5)
    save(np.stack([v, v, v], -1), 'grunge_diff')
    rough = np.clip(0.38 + 0.25 * a + 0.1 * b, 0, 1)
    save(arm(np.ones_like(v), rough, np.zeros_like(v)), 'grunge_arm')


def font(name, size):
    for p in (os.path.join(FONTS, name), os.path.join('/System/Library/Fonts/', name), os.path.join(PFONTS, name)):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


ATLAS = {}


def signs():
    W, H = 2048, 2048
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    def reg(name, x, y, w, h):
        ATLAS[name] = [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H]

    x, y, w, h = 0, 0, 1024, 200
    d.rectangle((x, y, x + w, y + h), fill=(236, 233, 222, 255))
    d.rectangle((x + 6, y + 6, x + w - 6, y + h - 6), outline=(40, 40, 40, 255), width=4)
    f = font('Futura.ttc', 118)
    txt = 'GHOSTBUSTERS.'
    tw = d.textlength(txt, font=f)
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.text(((w - tw) / 2 + 26, 30), txt, font=f, fill=(18, 18, 20, 255))
    layer = layer.transform((w, h), Image.AFFINE, (1, 0.22, -22, 0, 1, 0), Image.BICUBIC)
    im.alpha_composite(layer, (x, y))
    reg('gb_board', x, y, w, h)

    lx, ly, lw, lh = 1024, 0, 1024, 1280
    logo = Image.open(os.path.join(ROOT, 'blender/ecto1/tex/noghost.png')).convert('RGBA')
    face = Image.new('RGBA', (lw, lh), (0, 0, 0, 0))
    fd = ImageDraw.Draw(face)
    fd.rounded_rectangle((230, 400, lw - 110, lh - 70), radius=50, fill=(244, 242, 236, 255), outline=(30, 30, 30, 255), width=10)
    lg = logo.resize((900, 900), Image.LANCZOS)
    face.alpha_composite(lg, (40, 210))
    im.alpha_composite(face, (lx, ly))
    reg('noghost_sign', lx, ly, lw, lh)

    x, y, w, h = 0, 220, 512, 300
    d.rectangle((x, y, x + w, y + h), fill=(240, 240, 236, 255))
    d.rectangle((x + 14, y + 14, x + w - 14, y + 120), fill=(196, 28, 32, 255))
    d.rounded_rectangle((x + 110, y + 30, x + w - 110, y + 104), radius=30, outline=(250, 250, 250, 255), width=8)
    d.text((x + 146, y + 38), 'DANGER', font=font('Arial Black.ttf', 46), fill=(250, 250, 250, 255))
    f2 = font('Arial Bold.ttf', 34)
    for k, t in enumerate(('ELECTRICAL EQUIPMENT', 'AUTHORIZED', 'PERSONNEL ONLY')):
        d.text((x + 28, y + 140 + k * 44), t, font=f2, fill=(20, 20, 20, 255))
    d.ellipse((x + 380, y + 150, x + 490, y + 260), outline=(196, 28, 32, 255), width=10)
    d.polygon([(x + 440, y + 162), (x + 418, y + 210), (x + 438, y + 210), (x + 428, y + 250), (x + 458, y + 196), (x + 440, y + 196), (x + 452, y + 162)], fill=(20, 20, 20, 255))
    reg('danger', x, y, w, h)

    x, y, w, h = 520, 220, 480, 110
    d.rectangle((x, y, x + w, y + h), fill=(60, 52, 40, 255))
    d.rectangle((x + 8, y + 8, x + w - 8, y + h - 8), fill=(214, 190, 120, 255))
    d.text((x + 36, y + 32), 'JANINE MELNITZ', font=font('Copperplate.ttc', 44), fill=(30, 24, 16, 255))
    reg('nameplate', x, y, w, h)

    x, y, w, h = 520, 340, 480, 110
    d.rectangle((x, y, x + w, y + h), fill=(60, 52, 40, 255))
    d.rectangle((x + 8, y + 8, x + w - 8, y + h - 8), fill=(214, 190, 120, 255))
    d.text((x + 40, y + 32), 'DR. P. VENKMAN', font=font('Copperplate.ttc', 44), fill=(30, 24, 16, 255))
    reg('nameplate2', x, y, w, h)

    x, y, w, h = 0, 540, 512, 384
    d.rectangle((x, y, x + w, y + h), fill=(8, 16, 10, 255))
    mf = font('Courier New Bold.ttf', 26)
    lines = ['GHOSTBUSTERS INC.  DISPATCH', '> CALLS TODAY: 3', '> 1. SEDGEWICK HOTEL 12TH FL', '>    CLASS 5 FULL ROAMING', '> 2. NY PUBLIC LIBRARY', '>    CLASS 4 FREE FLOATING', '> 3. 55 CENTRAL PARK WEST', '>    UNKNOWN', '', '> _']
    for k, t in enumerate(lines):
        d.text((x + 22, y + 22 + k * 34), t, font=mf, fill=(120, 255, 140, 255))
    reg('screen', x, y, w, h)

    x, y, w, h = 520, 470, 480, 320
    d.rectangle((x, y, x + w, y + h), fill=(10, 12, 10, 255))
    for k in range(9):
        pts = []
        for i in range(w - 40):
            t = i / (w - 40)
            pts.append((x + 20 + i, y + 40 + k * 30 + 10 * math.sin(t * (6 + k * 3) + k) * math.exp(-t * (k % 3))))
        d.line(pts, fill=(90, 255, 160, 255), width=2)
    reg('scope', x, y, w, h)

    x, y, w, h = 0, 940, 1024, 512
    d.rectangle((x, y, x + w, y + h), fill=(150, 120, 80, 255))
    r = np.random.default_rng(71)
    for k in range(34):
        pw, ph = int(r.integers(90, 200)), int(r.integers(110, 230))
        px, py = x + int(r.integers(0, w - pw)), y + int(r.integers(0, h - ph))
        shade = int(r.integers(215, 248))
        d.rectangle((px, py, px + pw, py + ph), fill=(shade, shade - 6, shade - 22, 255), outline=(120, 110, 90, 255))
        for li in range(int(ph / 14) - 2):
            ww = int(r.integers(int(pw * 0.4), pw - 16))
            d.line((px + 8, py + 14 + li * 12, px + 8 + ww, py + 14 + li * 12), fill=(70, 70, 70, 255), width=3 if li == 0 else 2)
        d.ellipse((px + pw // 2 - 5, py + 2, px + pw // 2 + 5, py + 12), fill=(200, 30, 30, 255))
    reg('pinboard', x, y, w, h)

    for k in range(6):
        x, y, w, h = 1024 + (k % 3) * 340, 1300 + (k // 3) * 260, 330, 250
        d.rectangle((x, y, x + w, y + h), fill=(30, 22, 14, 255))
        d.rectangle((x + 22, y + 22, x + w - 22, y + h - 22), fill=(226, 222, 210, 255))
        g = r.random((24, 30)).astype(np.float32)
        ph = Image.fromarray((g * 255).astype(np.uint8)).resize((w - 80, h - 80), Image.BICUBIC).filter(ImageFilter.GaussianBlur(5))
        ph = Image.merge('RGBA', (ph.point(lambda v: 40 + v * 0.55), ph.point(lambda v: 38 + v * 0.52), ph.point(lambda v: 32 + v * 0.45), Image.new('L', ph.size, 255)))
        im.alpha_composite(ph, (x + 40, y + 40))
        reg(f'photo{k}', x, y, w, h)

    x, y, w, h = 0, 1470, 1000, 120
    d.rectangle((x, y, x + w, y + h), fill=(0, 0, 0, 0))
    f3 = font('Futura.ttc', 64)
    d.text((x + 40, y + 20), 'ENTRANCE AROUND CORNER', font=f3, fill=(250, 250, 245, 160))
    reg('entrance', x, y, w, h)

    x, y, w, h = 0, 1600, 256, 256
    d.ellipse((x + 8, y + 8, x + w - 8, y + h - 8), fill=(180, 140, 60, 255))
    d.ellipse((x + 40, y + 40, x + w - 40, y + h - 40), fill=(220, 190, 110, 255))
    d.ellipse((x + 100, y + 100, x + w - 100, y + h - 100), fill=(120, 90, 40, 255))
    reg('bell', x, y, w, h)

    x, y, w, h = 270, 1600, 400, 200
    d.rectangle((x, y, x + w, y + h), fill=(232, 205, 40, 255))
    d.rectangle((x + 10, y + 10, x + w - 10, y + h - 10), outline=(20, 20, 20, 255), width=6)
    d.text((x + 50, y + 30), 'CAUTION', font=font('Arial Black.ttf', 60), fill=(20, 20, 20, 255))
    d.text((x + 40, y + 115), 'LASER AREA', font=font('Arial Bold.ttf', 44), fill=(20, 20, 20, 255))
    reg('caution', x, y, w, h)

    x, y, w, h = 690, 1600, 300, 300
    d.rectangle((x, y, x + w, y + h), fill=(60, 60, 64, 255))
    for k in range(12):
        cx2, cy2 = x + 40 + (k % 4) * 70, y + 50 + (k // 4) * 90
        d.ellipse((cx2 - 22, cy2 - 22, cx2 + 22, cy2 + 22), fill=(230, 230, 220, 255), outline=(20, 20, 20, 255), width=3)
        a = r.random() * 6.28
        d.line((cx2, cy2, cx2 + 16 * math.cos(a), cy2 + 16 * math.sin(a)), fill=(200, 20, 20, 255), width=3)
    reg('gauges', x, y, w, h)

    x, y, w, h = 1024, 1820, 1024, 228
    d.rectangle((x, y, x + w, y + h), fill=(34, 30, 26, 255))
    for k in range(24):
        bx = x + 10 + k * 42
        hue = [(170, 40, 30), (40, 60, 120), (200, 170, 60), (40, 90, 50), (120, 30, 60), (220, 210, 190)][k % 6]
        hh = int(r.integers(150, 215))
        d.rectangle((bx, y + h - hh - 6, bx + 36, y + h - 6), fill=hue + (255,))
        d.line((bx + 6, y + h - hh + 20, bx + 30, y + h - hh + 20), fill=(230, 210, 120, 255), width=3)
    reg('books', x, y, w, h)

    x, y, w, h = 520, 800, 480, 132
    yy = np.linspace(0.0, 1.0, h)[:, None]
    xx = np.linspace(0.0, 1.0, w)[None, :]
    top = np.array([255, 216, 156.0]); mid = np.array([222, 168, 104.0]); bot = np.array([104, 70, 42.0])
    t = np.clip(yy / 0.62, 0, 1)[..., None]
    t2 = np.clip((yy - 0.62) / 0.38, 0, 1)[..., None]
    col = np.where(yy[..., None] < 0.62, top * (1 - t) + mid * t, mid * (1 - t2) + bot * t2) * np.ones((1, w, 1))
    hot = np.exp(-(((xx - 0.36) / 0.22) ** 2 + ((yy - 0.12) / 0.2) ** 2))[..., None]
    col = col * (0.82 + 0.3 * hot)
    blind = (yy < 0.3)[..., None] & ((np.floor(yy * h / 4.0) % 2) == 0)[..., None]
    col = np.where(blind, col * 0.62, col)
    col[(np.abs(yy - 0.3) < 0.012).repeat(w, 1)] *= 0.45
    sm = lambda e0, e1, v: np.clip((v - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((v - e0) / (e1 - e0), 0, 1))
    shelf = (sm(0.72, 0.76, xx) * (1 - sm(0.91, 0.95, xx)) * sm(0.46, 0.56, yy))[..., None]
    col = col * (1 - 0.32 * shelf)
    col = col * (0.94 + 0.06 * noise(max(w, h), 24, seed=31)[:h, :w, None])
    im.alpha_composite(Image.fromarray(np.dstack([np.clip(col, 0, 255), np.full((h, w), 255.0)]).astype(np.uint8), 'RGBA'), (x, y))
    reg('room', x, y, w, h)

    x, y, w, h = 0, 1920, 500, 60
    for k, c in enumerate(((255, 42, 30), (60, 255, 96), (255, 168, 40), (255, 248, 232), (90, 150, 255), (255, 240, 215), (225, 240, 255), (255, 200, 140), (200, 160, 110), (128, 128, 128))):
        d.rectangle((x + k * 50, y, x + k * 50 + 49, y + h), fill=c + (255,))
    reg('palette', x, y, w, h)

    x, y, w, h = 520, 1920, 480, 120
    d.rectangle((x, y, x + w, y + h), fill=(28, 26, 24, 255))
    d.text((x + 30, y + 22), 'DI MARCO  WHOLESALE  PAPER', font=font('Arial Bold.ttf', 40), fill=(206, 196, 170, 255))
    d.text((x + 120, y + 74), 'EST. 1931', font=font('Arial Bold.ttf', 30), fill=(170, 160, 136, 255))
    reg('neighbour_sign', x, y, w, h)

    im.save(os.path.join(OUT, 'signs.png'), optimize=True)
    import json
    json.dump(ATLAS, open(os.path.join(OUT, 'signs.json'), 'w'), indent=1)


if __name__ == '__main__':
    which = sys.argv[1:] or ['copies', 'stone', 'concrete_floor', 'oak', 'glazed', 'cinder', 'tin', 'planks', 'grunge', 'signs']
    for w in which:
        globals()[w]()
        print('done', w)
