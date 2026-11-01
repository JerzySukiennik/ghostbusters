# Ghostbusters pack lane: draws label/decal atlases (pack, wand, trap) and the hose rib normal map with PIL (run with system python3).
import os, json, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TEX = os.path.join(ROOT, 'Niepotrzebne', 'work', 'pack', 'tex')
os.makedirs(TEX, exist_ok=True)
FONT_COND = '/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf'
FONT_ALT = '/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf'
FONT_HEL = '/System/Library/Fonts/Helvetica.ttc'
FONT_FUT = '/System/Library/Fonts/Supplemental/Futura.ttc'
FONT_MONO = '/System/Library/Fonts/Menlo.ttc'


def font(path, size, index=0):
    for p in (path, FONT_HEL):
        try:
            return ImageFont.truetype(p, size, index=index)
        except Exception:
            continue
    return ImageFont.load_default()


def noise(w, h, scale, seed, octaves=4):
    rng = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        sw, sh = max(2, int(w / scale * 2 ** o)), max(2, int(h / scale * 2 ** o))
        g = rng.random((sh, sw)).astype(np.float32)
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        acc += np.asarray(im, np.float32) / 255.0 * amp
        tot += amp
        amp *= 0.5
    return acc / tot


def wear(img, seed, amount=1.0, edge=True, base_metal=(150, 150, 152), dirt=(40, 34, 28)):
    w, h = img.size
    a = np.asarray(img.convert('RGB'), np.float32)
    n1 = noise(w, h, 90, seed)
    n2 = noise(w, h, 18, seed + 7, 3)
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)).astype(np.float32)
    edgef = np.clip(1.0 - d / (0.05 * min(w, h)), 0, 1) ** 1.5 if edge else np.zeros((h, w), np.float32)
    grime = np.clip((n1 - 0.5) * 1.6, 0, 1) * 0.22 * amount + edgef * 0.4 * amount
    a = a * (1 - grime[..., None]) + np.array(dirt, np.float32) * grime[..., None]
    chips = ((n2 * 0.75 + n1 * 0.25 + edgef * 0.45 * amount) > (0.9 - 0.04 * amount)).astype(np.float32)
    chips = np.asarray(Image.fromarray((chips * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255
    a = a * (1 - chips[..., None]) + np.array(base_metal, np.float32) * chips[..., None]
    rng = random.Random(seed)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    dr = ImageDraw.Draw(out, 'RGBA')
    for _ in range(int(14 * amount)):
        x0, y0 = rng.uniform(0, w), rng.uniform(0, h)
        ang = rng.uniform(-0.4, 0.4) + (0 if rng.random() < 0.7 else math.pi / 2)
        L = rng.uniform(0.03, 0.18) * w
        dr.line([(x0, y0), (x0 + math.cos(ang) * L, y0 + math.sin(ang) * L)], fill=(205, 205, 200, rng.randint(25, 70)), width=1)
    var = noise(w, h, 60, seed + 3, 3)
    a = np.asarray(out, np.float32) * (0.93 + 0.12 * var[..., None])
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def text_c(dr, cx, y, s, f, fill):
    bb = dr.textbbox((0, 0), s, font=f)
    dr.text((cx - (bb[2] - bb[0]) / 2 - bb[0], y - bb[1]), s, font=f, fill=fill)
    return bb[3] - bb[1]


def fit_font(dr, s, path, maxw, size, index=0):
    while size > 6:
        f = font(path, size, index)
        bb = dr.textbbox((0, 0), s, font=f)
        if bb[2] - bb[0] <= maxw:
            return f
        size -= 1
    return font(path, size, index)


def label_warning(w, h, seed):
    im = Image.new('RGB', (w, h), (166, 22, 24))
    dr = ImageDraw.Draw(im)
    m = int(w * 0.035)
    dr.rectangle([m, m, w - m, h - m], outline=(238, 232, 222), width=max(3, w // 160))
    lines = ['WARNING', 'FOR-043 ANGLE GEARBOX ASSYS', 'USE ONLY HYDRAULIC PUMPS', 'THAT HAVE "O" RING TYPE', 'GREASE RETENTION SPLINES', '(67WAR200 PUMP OR EQUIVALENT)']
    y = h * 0.09
    f0 = fit_font(dr, lines[0], FONT_COND, w * 0.4, int(h * 0.16))
    y += text_c(dr, w / 2, y, lines[0], f0, (240, 236, 226)) + h * 0.06
    for s in lines[1:]:
        f = fit_font(dr, s, FONT_COND, w * 0.86, int(h * 0.105))
        y += text_c(dr, w / 2, y, s, f, (240, 236, 226)) + h * 0.045
    f = font(FONT_HEL, int(h * 0.04))
    dr.text((w * 0.08, h * 0.88), '169015-1197', font=f, fill=(225, 210, 200))
    for sx in (0.05, 0.95):
        cx, cy, r = w * sx, h * 0.5, h * 0.035
        dr.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(120, 120, 118))
        dr.line([cx - r * 0.7, cy, cx + r * 0.7, cy], fill=(40, 40, 40), width=3)
    return wear(im, seed, 0.9)


def label_danger(w, h, seed, schematic=False):
    im = Image.new('RGB', (w, h), (236, 232, 222))
    dr = ImageDraw.Draw(im)
    band = int(h * 0.3)
    dr.rectangle([0, 0, w, band], fill=(196, 26, 30))
    fd = fit_font(dr, 'DANGER', FONT_ALT, w * 0.62, int(band * 0.8))
    text_c(dr, w / 2, band * 0.14, 'DANGER', fd, (245, 240, 230))
    lines = ['HIGH VOLTAGE 1KV', 'ELECTRIC SHOCK HAZARD', 'REMOVE POWER BEFORE', 'REPAIR OR ADJUSTMENT']
    y = band + h * 0.05
    for s in lines:
        f = fit_font(dr, s, FONT_COND, w * 0.88, int(h * 0.13))
        y += text_c(dr, w / 2, y, s, f, (170, 20, 24)) + h * 0.03
    if schematic:
        x0, y0 = w * 0.32, y + h * 0.02
        c = (180, 24, 26)
        dr.rectangle([x0, y0, x0 + w * 0.36, y0 + h * 0.1], outline=c, width=3)
        for k in range(5):
            dr.line([x0 + w * 0.05 + k * w * 0.06, y0, x0 + w * 0.05 + k * w * 0.06, y0 + h * 0.1], fill=c, width=2)
    return wear(im, seed, 0.8, base_metal=(170, 168, 160))


def label_round_danger(s, seed):
    im = Image.new('RGB', (s, s), (34, 34, 36))
    dr = ImageDraw.Draw(im)
    pad = int(s * 0.12)
    inner = label_danger(s - 2 * pad, int((s - 2 * pad) * 0.62), seed, schematic=True)
    im.paste(inner, (pad, int(s * 0.22)))
    dr.ellipse([3, 3, s - 4, s - 4], outline=(70, 70, 72), width=max(2, s // 80))
    return wear(im, seed + 1, 0.9)


def label_cyclotron(w, h, seed):
    im = Image.new('RGB', (w, h), (64, 132, 196))
    dr = ImageDraw.Draw(im)
    dr.rectangle([4, 4, w - 5, h - 5], outline=(200, 220, 236), width=4)
    f1 = fit_font(dr, 'MOTOR-SYNCHRONOUS', FONT_COND, w * 0.5, int(h * 0.15))
    dr.text((w * 0.05, h * 0.07), 'MOTOR-SYNCHRONOUS', font=f1, fill=(232, 240, 248))
    f2 = font(FONT_COND, int(h * 0.105))
    rows = [('1/50 H.P.  RPM 1800', 'THERMAL PROTECTED'), ('115 V.A.C.  .45 AMPS', '50/60 HZ  60 CYC'), ('CAP. 2 MFD  370 VAC', '70/85 AMPS'),
            ('INSULATION CLASS B', 'ROT. CW  CONT. DUTY'), ('PART NO. 152162', 'SER. 84-1145')]
    y = h * 0.28
    for a, b in rows:
        dr.text((w * 0.05, y), a, font=f2, fill=(228, 236, 246))
        dr.text((w * 0.56, y), b, font=f2, fill=(228, 236, 246))
        y += h * 0.135
    for cx in (w * 0.025, w * 0.975):
        dr.ellipse([cx - 6, h / 2 - 6, cx + 6, h / 2 + 6], fill=(150, 160, 170))
    return wear(im, seed, 0.7, base_metal=(176, 180, 186))


def label_hga(s, seed):
    im = Image.new('RGB', (s, s), (40, 40, 42))
    dr = ImageDraw.Draw(im)
    dr.ellipse([s * 0.06, s * 0.06, s * 0.94, s * 0.94], fill=(190, 28, 30))
    f = fit_font(dr, 'HGA', FONT_ALT, s * 0.5, int(s * 0.3))
    text_c(dr, s / 2, s * 0.36, 'HGA', f, (245, 240, 230))
    return wear(im, seed, 0.8)


def ribbon(w, h, seed, wires=40):
    pal = [(110, 60, 30), (180, 30, 30), (220, 110, 30), (220, 190, 40), (40, 140, 60), (40, 70, 170), (130, 60, 150), (140, 140, 140), (220, 220, 215), (25, 25, 25)]
    im = Image.new('RGB', (w, h))
    dr = ImageDraw.Draw(im)
    cw = w / wires
    for i in range(wires):
        c = pal[i % 10]
        dr.rectangle([i * cw, 0, (i + 1) * cw, h], fill=c)
        dr.line([(i + 0.15) * cw, 0, (i + 0.15) * cw, h], fill=tuple(min(255, int(v * 1.35 + 30)) for v in c), width=max(1, int(cw * 0.18)))
        dr.line([(i + 0.95) * cw, 0, (i + 0.95) * cw, h], fill=tuple(int(v * 0.45) for v in c), width=max(1, int(cw * 0.12)))
    return wear(im, seed, 0.6, edge=False, base_metal=(150, 140, 120), dirt=(55, 45, 35))


def hazard(w, h, seed, stripe=0.14, angle=45, colors=((222, 186, 22), (18, 18, 18))):
    big = Image.new('RGB', (w * 2, h * 2), colors[1])
    dr = ImageDraw.Draw(big)
    period = stripe * w * 2 * 2
    t = math.tan(math.radians(angle))
    x = -h * 2 * t - period
    while x < w * 2 + period:
        dr.polygon([(x, 0), (x + period / 2, 0), (x + period / 2 + h * 2 * t, h * 2), (x + h * 2 * t, h * 2)], fill=colors[0])
        x += period
    im = big.resize((w, h), Image.LANCZOS)
    return wear(im, seed, 1.0, base_metal=(165, 165, 160), dirt=(52, 44, 30))


def spec_plate(w, h, seed, title, rows, bg=(185, 186, 182), fg=(30, 30, 32)):
    im = Image.new('RGB', (w, h), bg)
    dr = ImageDraw.Draw(im)
    dr.rectangle([3, 3, w - 4, h - 4], outline=fg, width=3)
    f1 = fit_font(dr, title, FONT_COND, w * 0.8, int(h * 0.2))
    text_c(dr, w / 2, h * 0.06, title, f1, fg)
    f2 = font(FONT_COND, int(h * 0.12))
    y = h * 0.34
    for r in rows:
        dr.text((w * 0.07, y), r, font=f2, fill=fg)
        y += h * 0.15
    return wear(im, seed, 0.6, base_metal=(205, 205, 200))


def knob_label(w, h, seed, text):
    im = Image.new('RGB', (w, h), (20, 20, 22))
    dr = ImageDraw.Draw(im)
    f = fit_font(dr, text, FONT_COND, w * 0.9, int(h * 0.7))
    text_c(dr, w / 2, h * 0.15, text, f, (215, 215, 210))
    return wear(im, seed, 0.5)


def schematic_label(w, h, seed):
    im = Image.new('RGB', (w, h), (22, 22, 24))
    dr = ImageDraw.Draw(im)
    c = (200, 30, 30)
    dr.rectangle([w * 0.1, h * 0.25, w * 0.9, h * 0.75], outline=c, width=4)
    for k in range(6):
        x = w * 0.18 + k * w * 0.12
        dr.line([x, h * 0.25, x, h * 0.75], fill=c, width=3)
    dr.line([w * 0.02, h * 0.5, w * 0.1, h * 0.5], fill=c, width=4)
    dr.line([w * 0.9, h * 0.5, w * 0.98, h * 0.5], fill=c, width=4)
    dr.ellipse([w * 0.45, h * 0.05, w * 0.55, h * 0.2], outline=c, width=3)
    return wear(im, seed, 0.5)


class Atlas:
    def __init__(self, name, size=2048):
        self.name, self.size = name, size
        self.im = Image.new('RGB', (size, size), (30, 30, 30))
        self.regions = {}

    def put(self, key, img, x, y):
        self.im.paste(img, (x, y))
        w, h = img.size
        S = self.size
        self.regions[key] = [x / S, 1 - (y + h) / S, (x + w) / S, 1 - y / S]

    def save(self):
        p = os.path.join(TEX, self.name + '.jpg')
        self.im.save(p, quality=90)
        json.dump(self.regions, open(os.path.join(TEX, self.name + '.json'), 'w'), indent=1)
        print('atlas', p)


def pack_atlas():
    a = Atlas('pack_decals', 2048)
    a.put('warning', label_warning(1000, 724, 11), 0, 0)
    a.put('danger_wrap', label_danger(1000, 660, 12), 1024, 0)
    a.put('danger_round', label_round_danger(600, 13), 0, 740)
    a.put('cyclo', label_cyclotron(860, 390, 14), 620, 740)
    a.put('hga', label_hga(300, 15), 1500, 740)
    a.put('ribbon', ribbon(400, 860, 16), 1620, 1150)
    a.put('danger_small', label_danger(500, 330, 17), 0, 1360)
    a.put('danger_small2', label_danger(500, 330, 18), 520, 1360)
    a.put('spec', spec_plate(560, 300, 19, 'PPD  MOD. 3-B', ['115V  12A  SER. 1146', 'PROTON DIST. UNIT', 'NO USER SERVICEABLE']), 1040, 1150)
    a.put('blank_black', Image.new('RGB', (64, 64), (24, 24, 25)), 1980, 1980)
    a.save()


def wand_atlas():
    a = Atlas('wand_decals', 1024)
    a.put('danger', label_danger(420, 280, 31), 0, 0)
    a.put('schematic', schematic_label(420, 200, 32), 0, 300)
    a.put('k1', knob_label(200, 60, 33, 'INTENSIFY'), 440, 0)
    a.put('k2', knob_label(200, 60, 34, 'ACTIVATE'), 440, 70)
    a.put('k3', knob_label(200, 60, 35, 'VENT'), 440, 140)
    a.put('k4', knob_label(200, 60, 36, 'PROTON'), 440, 210)
    a.put('spec', spec_plate(400, 200, 37, 'NEUTRONA WAND', ['MOD. 1984  SER. 0042', 'CAUTION: HIGH FLUX']), 0, 520)
    a.put('braid', ribbon(200, 300, 38, wires=12), 660, 0)
    a.save()


def trap_atlas():
    a = Atlas('trap_decals', 2048)
    a.put('stripes_l', hazard(900, 640, 51), 0, 0)
    a.put('stripes_r', hazard(900, 640, 52), 1000, 0)
    a.put('danger', label_danger(560, 380, 53), 0, 700)
    a.put('danger2', label_danger(420, 290, 54), 600, 700)
    a.put('spec', spec_plate(520, 280, 55, 'GHOST TRAP  MK-1', ['CONTAINMENT 12V DC', 'DO NOT OPEN WHEN FULL', 'SER. 2-1184']), 1060, 700)
    a.put('stripes_side', hazard(900, 260, 56, stripe=0.09), 0, 1120)
    a.put('pedal_spec', spec_plate(420, 220, 57, 'SIDE  MM  PN', ['A  2  1900   C 2  300/600', 'A  100  18    C 3  300/600', 'E  4  600     C 4  130']), 1000, 1120)
    a.save()


def lens_texture(s=256):
    im = Image.new('RGB', (s, s), (120, 6, 4))
    dr = ImageDraw.Draw(im)
    step = s / 13.0
    for j in range(15):
        for i in range(15):
            x = (i + (0.5 if j % 2 else 0.0)) * step
            y = j * step * 0.87
            r = step * 0.30
            dr.ellipse([x - r, y - r, x + r, y + r], fill=(235, 40, 22))
            dr.ellipse([x - r * 0.45, y - r * 0.55, x + r * 0.2, y - r * 0.05], fill=(255, 120, 90))
    im = im.filter(ImageFilter.GaussianBlur(0.8))
    yy, xx = np.mgrid[0:s, 0:s]
    d = np.sqrt((xx - s / 2) ** 2 + (yy - s / 2) ** 2) / (s / 2)
    a = np.asarray(im, np.float32) * np.clip(1.15 - 0.45 * d ** 2, 0.4, 1.1)[..., None]
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(os.path.join(TEX, 'cyclotron_lens.jpg'), quality=92)


def hose_normal(w=64, h=64):
    arr = np.zeros((h, w, 3), np.float32)
    for x in range(w):
        t = (x + 0.5) / w
        dz = -math.sin(2 * math.pi * t) * 0.85
        n = np.array([dz, 0.0, 1.0])
        n /= np.linalg.norm(n)
        arr[:, x, :] = n
    img = Image.fromarray(((arr * 0.5 + 0.5) * 255).astype(np.uint8))
    p = os.path.join(TEX, 'hose_ribs_n.png')
    img.save(p)
    print('normal', p)


if __name__ == '__main__':
    pack_atlas()
    wand_atlas()
    trap_atlas()
    hose_normal()
    lens_texture()
