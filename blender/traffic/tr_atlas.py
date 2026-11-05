# Paints one 1024px RGBA atlas per vehicle (alpha 255 = tintable paint, 0 = fixed colour): sides, caps, lenses, plates, hubcaps, signs.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import tr_designs as TD

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'tex')
S = TD.ATLAS_SIZE
FONT = '/System/Library/Fonts/Helvetica.ttc'
FONT_COND = '/System/Library/Fonts/Avenir Next Condensed.ttc'


def font(px, bold=True, cond=False):
    try:
        if cond:
            return ImageFont.truetype(FONT_COND, int(px), index=2 if bold else 0)
        return ImageFont.truetype(FONT, int(px), index=1 if bold else 0)
    except Exception:
        return ImageFont.load_default()


def c8(rgb, a=255):
    return tuple(int(max(0, min(1, v)) ** (1 / 2.2) * 255 + 0.5) for v in rgb) + (a,)


def paste_rgba(img, tmp, size, pos):
    rgb = tmp.convert('RGB').resize(size, Image.LANCZOS)
    a = tmp.getchannel('A').resize(size, Image.LANCZOS)
    rgb.putalpha(a)
    img.paste(rgb, pos)


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


class Reg:
    """Maps physical coords to atlas pixels inside a rect: x range (a0..a1 -> left..right), y range (b0..b1 -> bottom..top)."""

    def __init__(self, img, rect, xr, yr):
        self.img = img
        self.d = ImageDraw.Draw(img)
        self.x0, self.y0, self.w, self.h = rect
        self.xr, self.yr = xr, yr

    def px(self, a, b):
        u = (a - self.xr[0]) / (self.xr[1] - self.xr[0])
        v = (b - self.yr[0]) / (self.yr[1] - self.yr[0])
        return (self.x0 + u * self.w, self.y0 + (1 - v) * self.h)

    def rect(self, a0, b0, a1, b1, fill, outline=None, width=1, radius=0):
        p0 = self.px(a0, b1)
        p1 = self.px(a1, b0)
        box = [min(p0[0], p1[0]), min(p0[1], p1[1]), max(p0[0], p1[0]), max(p0[1], p1[1])]
        if radius:
            self.d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)
        else:
            self.d.rectangle(box, fill=fill, outline=outline, width=width)

    def line(self, pts, fill, width=2):
        self.d.line([self.px(a, b) for a, b in pts], fill=fill, width=width)

    def poly(self, pts, fill):
        self.d.polygon([self.px(a, b) for a, b in pts], fill=fill)

    def text(self, a, b, s, size_m, fill, bold=True, anchor='mm', cond=False, sx=1.0):
        hpx = abs(self.px(0, size_m)[1] - self.px(0, 0)[1])
        f = font(max(6, hpx), bold, cond)
        if sx == 1.0:
            self.d.text(self.px(a, b), s, font=f, fill=fill, anchor=anchor)
            return
        bb = self.d.textbbox((0, 0), s, font=f, anchor='lt')
        tw, th = bb[2] - bb[0] + 4, bb[3] - bb[1] + 4
        m = Image.new('L', (tw, th), 0)
        ImageDraw.Draw(m).text((2 - bb[0], 2 - bb[1]), s, font=f, fill=255)
        m = m.resize((max(1, int(tw * sx)), th), Image.LANCZOS)
        cx, cy = self.px(a, b)
        self.img.paste(Image.new('RGBA', m.size, fill), (int(cx - m.width / 2), int(cy - m.height / 2)), m)

    def ellipse(self, a, b, ra, rb, fill, outline=None, width=1):
        p0 = self.px(a - ra, b + rb)
        p1 = self.px(a + ra, b - rb)
        self.d.ellipse([min(p0[0], p1[0]), min(p0[1], p1[1]), max(p0[0], p1[0]), max(p0[1], p1[1])], fill=fill, outline=outline, width=width)

    def arc(self, a, b, r, start, end, fill, width):
        p0 = self.px(a - r, b + r)
        p1 = self.px(a + r, b - r)
        self.d.arc([min(p0[0], p1[0]), min(p0[1], p1[1]), max(p0[0], p1[0]), max(p0[1], p1[1])], start, end, fill=fill, width=width)


CHROME = c8((0.62, 0.63, 0.64), 0)
CHROME_D = c8((0.30, 0.31, 0.32), 0)
BLACK = c8((0.012, 0.012, 0.013), 0)
RUBBER = c8((0.03, 0.03, 0.032), 0)


def base_regions(img, D):
    d = ImageDraw.Draw(img)
    R = TD.R
    tint = D.get('tint', False)
    paint = D['paint']
    body = (255, 255, 255, 255) if tint else c8(paint, 0)
    fill = lambda r, col: d.rectangle([r[0], r[1], r[0] + r[2] - 1, r[1] + r[3] - 1], fill=col)
    fill(R['white'], (255, 255, 255, 255))
    fill(R['white_fixed'], (255, 255, 255, 0))
    fill(R['black'], (0, 0, 0, 0))
    fill(R['paint'], body)
    fill(R['paint2'], c8(D.get('paint2', paint), 0) if not tint or 'paint2' in D else body)
    return body


def shade(col, k):
    return tuple(int(min(255, c * k)) for c in col[:3]) + (col[3],)


def paint_side(img, D, side, body):
    rect = TD.R['side_l' if side > 0 else 'side_r']
    L = D['L']
    xr = (0.0, L) if side > 0 else (L, 0.0)
    g = Reg(img, rect, xr, (0.0, TD.SIDE_Z))
    g.rect(0, 0, L, TD.SIDE_Z, body)
    line = shade(body, 0.42)
    seam = shade(body, 0.62)
    gh = D['gh']
    top = lambda s: float(__import__('numpy').interp(s, [p[0] for p in D['top']], [p[1] for p in D['top']]))
    bot = lambda s: float(__import__('numpy').interp(s, [p[0] for p in D['bottom']], [p[1] for p in D['bottom']]))
    zm = D['zm'][0][1]
    k = D['kind']
    if k == 'nypd':
        white = c8(D['paint2'], 0)
        g.rect(0, zm + 0.06, L, TD.SIDE_Z, white)
        g.rect(0, zm + 0.03, L, zm + 0.06, c8((0.05, 0.12, 0.35), 0))
    dl = D['door_lines']
    for s in dl:
        g.line([(s, bot(s) + 0.10), (s, top(s) + 0.02)], line, 2)
    if len(dl) >= 2:
        s0, s1 = dl[0], dl[-1]
        g.line([(s0, bot(s0) + 0.10), (s1, bot(s1) + 0.10)], seam, 2)
    for s in D.get('handles', []):
        z = top(s) - 0.085
        g.rect(s - 0.11, z - 0.012, s, z + 0.012, CHROME, radius=2)
        g.rect(s - 0.10, z - 0.004, s - 0.01, z + 0.004, CHROME_D)
    for (sa, R_, fl) in D['arches']:
        cz = D['tire_r'] + 0.035
        if k in ('caprice', 'ltd', 'cutlass'):
            g.arc(sa, cz, R_ + 0.012, 180, 360, CHROME, 3)
    if k in ('caprice', 'ltd'):
        z = zm - 0.04
        g.rect(D['body'][0] + 0.15, z - 0.018, D['body'][1] - 0.15, z + 0.018, RUBBER)
        g.rect(D['body'][0] + 0.15, z + 0.012, D['body'][1] - 0.15, z + 0.018, CHROME)
        g.rect(D['arches'][0][0] + 0.45, bot(2.0) + 0.04, D['arches'][1][0] - 0.44, bot(2.0) + 0.09, CHROME)
    if k in ('cutlass', 'aries'):
        z = zm - 0.02
        g.rect(D['body'][0] + 0.2, z - 0.014, D['body'][1] - 0.2, z + 0.014, RUBBER)
    if k == 'checker':
        z0, z1 = 0.885, 0.925
        sq = 0.04
        n = int((D['body'][1] - 0.30 - 0.55) / sq)
        s = 0.55
        for i in range(n):
            for row in range(2):
                col = (16, 16, 16, 0) if (i + row) % 2 == 0 else (238, 236, 228, 0)
                g.rect(s + i * sq, z0 + row * (z1 - z0) / 2, s + (i + 1) * sq, z0 + (row + 1) * (z1 - z0) / 2, col)
        rz0, rz1 = gh['roof'] - 0.058, gh['roof'] - 0.022
        n2 = int((gh['bl1'] - gh['ws0'] + 0.1) / 0.035)
        for i in range(n2):
            for row in range(2):
                col = (16, 16, 16, 0) if (i + row) % 2 == 0 else (238, 236, 228, 0)
                s = gh['ws0'] - 0.05 + i * 0.035
                g.rect(s, rz0 + row * (rz1 - rz0) / 2, s + 0.035, rz0 + (row + 1) * (rz1 - rz0) / 2, col)
        g.rect(2.62, 0.52, 2.86, 0.73, c8((0.96, 0.78, 0.12), 0), outline=(20, 20, 20, 0), width=2)
        g.text(2.74, 0.68, 'RATES', 0.03, (20, 20, 20, 0))
        g.text(2.74, 0.625, '$1.10 1st 1/9 mi', 0.024, (20, 20, 20, 0), cond=True)
        g.text(2.74, 0.575, '10c each 1/9 mi', 0.024, (20, 20, 20, 0), cond=True)
        g.text(2.74, 0.545, 'NYC TAXI & LIMOUSINE', 0.014, (20, 20, 20, 0), cond=True)
        g.ellipse(3.55, 0.72, 0.085, 0.10, c8((0.2, 0.5, 0.3), 0), outline=(20, 20, 20, 0), width=2)
        g.ellipse(3.55, 0.72, 0.06, 0.07, c8((0.92, 0.92, 0.88), 0))
        g.text(3.55, 0.72, 'CHECKER', 0.018, (20, 20, 20, 0), cond=True)
        g.text(4.55, 0.66, '4T27', 0.07, (20, 20, 20, 0))
        g.rect(4.62, 0.56, 4.7, 0.6, c8((0.8, 0.05, 0.03), 0))
    if k == 'nypd':
        g.text(0.55, zm + 0.17, 'POLICE', 0.095, c8((0.05, 0.12, 0.35), 0), cond=True)
        sx = 2.38
        g.ellipse(sx, 0.66, 0.11, 0.135, c8((0.05, 0.12, 0.35), 0))
        g.ellipse(sx, 0.665, 0.085, 0.105, c8((0.86, 0.70, 0.25), 0))
        g.ellipse(sx, 0.665, 0.05, 0.06, c8((0.05, 0.12, 0.35), 0))
        g.text(sx, 0.665, 'NYPD', 0.022, (230, 230, 230, 0))
        g.text(3.35, 0.66, '1st PCT', 0.07, c8((0.92, 0.93, 0.94), 0), cond=True)
        g.text(4.55, zm + 0.17, '1984', 0.085, c8((0.05, 0.12, 0.35), 0), cond=True)
    s_m = D['body'][0] + 0.25
    g.rect(s_m - 0.05, zm - 0.02, s_m + 0.05, zm + 0.02, c8((0.9, 0.45, 0.05), 0))
    s_m = D['body'][1] - 0.25
    g.rect(s_m - 0.05, zm - 0.02, s_m + 0.05, zm + 0.02, c8((0.7, 0.03, 0.02), 0))


def paint_front(img, D, body):
    g = Reg(img, TD.R['front'], (-1.0, 1.0), (0.2, 1.2))
    g.rect(-1, 0.2, 1, 1.2, body)
    F = D['front']
    gr = F['grille']
    gx, (gz0, gz1) = gr['x'], gr['z']
    g.rect(-gx - 0.025, gz0 - 0.025, gx + 0.025, gz1 + 0.025, CHROME, radius=3)
    g.rect(-gx, gz0, gx, gz1, (10, 10, 11, 0))
    k = D['kind']
    if k == 'checker':
        n = 9
        for i in range(n + 1):
            z = gz0 + (gz1 - gz0) * i / n
            g.line([(-gx, z), (gx, z)], CHROME, 3)
        for i in range(5):
            x = -gx + 2 * gx * i / 4
            g.line([(x, gz0), (x, gz1)], CHROME_D, 2)
    elif k in ('nypd', 'aries'):
        for i in range(7):
            z = gz0 + (gz1 - gz0) * i / 6
            g.line([(-gx, z), (gx, z)], CHROME_D, 2)
        for i in range(13):
            x = -gx + 2 * gx * i / 12
            g.line([(x, gz0), (x, gz1)], CHROME, 2)
    elif k == 'cutlass':
        g.rect(-0.03, gz0, 0.03, gz1, body)
        for i in range(12):
            x = -gx + 2 * gx * i / 11
            if abs(x) > 0.04:
                g.line([(x, gz0), (x, gz1)], CHROME, 3)
    else:
        for i in range(9):
            z = gz0 + (gz1 - gz0) * i / 8
            g.line([(-gx, z), (gx, z)], CHROME, 2)
        for i in range(17):
            x = -gx + 2 * gx * i / 16
            g.line([(x, gz0), (x, gz1)], CHROME_D, 2)
    for h in F['heads']:
        for sx in (1, -1):
            x = h['x'] * sx
            if h['shape'] == 'round':
                g.ellipse(x, h['z'], h['r'] * 1.25, h['r'] * 1.25, (12, 12, 12, 0))
            else:
                g.rect(x - h['w'] / 2 - 0.02, h['z'] - h['h'] / 2 - 0.02, x + h['w'] / 2 + 0.02, h['z'] + h['h'] / 2 + 0.02, (12, 12, 12, 0))
    zt = D['top'][0][1]
    g.line([(-0.95, zt - 0.025), (0.95, zt - 0.025)], shade(body, 0.5), 2)
    if k == 'checker':
        g.poly([(-0.10, 0.90), (0.10, 0.90), (0.0, 0.875)], CHROME)
        g.ellipse(0, 0.905, 0.03, 0.03, c8((0.75, 0.1, 0.08), 0), outline=CHROME, width=2)


def paint_rear(img, D, body):
    g = Reg(img, TD.R['rear'], (1.0, -1.0), (0.2, 1.2))
    g.rect(-1, 0.2, 1, 1.2, body)
    Rr = D['rear']
    zt = D['top'][-1][1]
    g.line([(-0.85, zt - 0.03), (0.85, zt - 0.03)], shade(body, 0.5), 2)
    g.line([(-0.85, Rr['plate_z'] + 0.12), (0.85, Rr['plate_z'] + 0.12)], shade(body, 0.55), 2)
    for t in Rr['tails']:
        for sx in (1, -1):
            x = t['x'] * sx
            g.rect(x - t['w'] / 2 - 0.02, t['z'] - t['h'] / 2 - 0.02, x + t['w'] / 2 + 0.02, t['z'] + t['h'] / 2 + 0.02, CHROME, radius=2)
    for t in Rr['rev']:
        for sx in (1, -1):
            x = t['x'] * sx
            g.rect(x - t['w'] / 2 - 0.015, t['z'] - t['h'] / 2 - 0.015, x + t['w'] / 2 + 0.015, t['z'] + t['h'] / 2 + 0.015, CHROME)
    pz = Rr['plate_z']
    g.rect(-0.18, pz - 0.085, 0.18, pz + 0.085, (14, 14, 14, 0))
    g.ellipse(0, zt - 0.09, 0.022, 0.022, CHROME)
    names = {'checker': 'CHECKER', 'nypd': 'GRAN FURY', 'caprice': 'CAPRICE CLASSIC', 'ltd': 'LTD CROWN VICTORIA', 'cutlass': 'CUTLASS SUPREME', 'aries': 'ARIES'}
    g.text(0.45, zt - 0.075, names.get(D['kind'], ''), 0.028, CHROME, cond=True)


def paint_plate(img, D):
    x0, y0, w, h = TD.R['plate']
    d = ImageDraw.Draw(img)
    d.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=c8((0.85, 0.55, 0.08), 0))
    d.rectangle([x0 + 2, y0 + 2, x0 + w - 3, y0 + h - 3], outline=c8((0.04, 0.08, 0.3), 0), width=2)
    blue = c8((0.03, 0.07, 0.28), 0)
    d.text((x0 + w / 2, y0 + 10), 'NEW YORK', font=font(10), fill=blue, anchor='mm')
    num = {'checker': '4T27', 'nypd': '9572-AB', 'caprice': '4QJ-218', 'ltd': '7KE-904', 'cutlass': '2BX-551', 'aries': '6FM-307'}.get(D['kind'], '1984-GB')
    d.text((x0 + w / 2, y0 + h / 2 + 7), num, font=font(26), fill=blue, anchor='mm')


def paint_hub(img, D):
    x0, y0, w, h = TD.R['hub']
    tmp = Image.new('RGBA', (w * 2, h * 2), (12, 12, 12, 0))
    d = ImageDraw.Draw(tmp)
    W = w * 2
    cx = cy = W / 2
    style = D.get('hub', 'k')

    def ring(r, col, width=0):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=None if width else col, outline=col if width else None, width=width)
    if style == 'police':
        ring(W / 2, (14, 14, 15, 0))
        ring(W * 0.47, (24, 24, 26, 0))
        for k in range(5):
            a = k * 2 * math.pi / 5
            px, py = cx + math.cos(a) * W * 0.28, cy + math.sin(a) * W * 0.28
            d.ellipse([px - 7, py - 7, px + 7, py + 7], fill=(40, 40, 42, 0))
        ring(W * 0.2, (190, 192, 196, 0))
        ring(W * 0.12, (120, 122, 126, 0))
    elif style == 'wire':
        ring(W / 2, (200, 202, 206, 0))
        ring(W * 0.44, (60, 60, 64, 0))
        for k in range(48):
            a = k * 2 * math.pi / 48
            a2 = a + 0.5
            d.line([(cx + math.cos(a) * W * 0.12, cy + math.sin(a) * W * 0.12), (cx + math.cos(a2) * W * 0.44, cy + math.sin(a2) * W * 0.44)], fill=(215, 216, 220, 0), width=2)
        ring(W * 0.13, (210, 210, 214, 0))
        ring(W * 0.06, (150, 30, 30, 0))
    elif style == 'ford':
        ring(W / 2, (205, 206, 210, 0))
        for k in range(16):
            a = k * 2 * math.pi / 16
            d.line([(cx + math.cos(a) * W * 0.18, cy + math.sin(a) * W * 0.18), (cx + math.cos(a) * W * 0.44, cy + math.sin(a) * W * 0.44)], fill=(90, 90, 96, 0), width=6)
        ring(W * 0.17, (215, 215, 220, 0))
        ring(W * 0.08, (30, 50, 120, 0))
    elif style == 'olds':
        ring(W / 2, (200, 202, 206, 0))
        for k in range(10):
            a = k * 2 * math.pi / 10
            px, py = cx + math.cos(a) * W * 0.33, cy + math.sin(a) * W * 0.33
            d.ellipse([px - 12, py - 6, px + 12, py + 6], fill=(50, 50, 54, 0))
        ring(W * 0.16, (210, 212, 216, 0))
    elif style == 'checker':
        ring(W / 2, (198, 200, 204, 0))
        ring(W * 0.45, (170, 172, 176, 0), 3)
        ring(W * 0.30, (215, 216, 220, 0))
        ring(W * 0.22, (150, 152, 156, 0), 2)
        ring(W * 0.12, (60, 60, 64, 0))
        ring(W * 0.08, (180, 182, 186, 0))
    else:
        ring(W / 2, (175, 176, 180, 0))
        for k in range(8):
            a = k * 2 * math.pi / 8
            px, py = cx + math.cos(a) * W * 0.32, cy + math.sin(a) * W * 0.32
            d.rectangle([px - 6, py - 6, px + 6, py + 6], fill=(60, 60, 64, 0))
        ring(W * 0.14, (190, 190, 194, 0))
    paste_rgba(img, tmp, (w, h), (x0, y0))


def paint_tire(img, D):
    x0, y0, w, h = TD.R['tire']
    d = ImageDraw.Draw(img)
    d.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=(16, 16, 17, 0))
    if D.get('whitewall'):
        d.rectangle([x0, y0 + int(h * 0.22), x0 + w - 1, y0 + int(h * 0.55)], fill=(232, 230, 222, 0))
    for i in range(0, w, 8):
        d.line([(x0 + i, y0 + h - 6), (x0 + i, y0 + h - 1)], fill=(9, 9, 9, 0), width=2)


def paint_lenses(img, D):
    R = TD.R
    x0, y0, w, h = R['lens_round']
    tmp = Image.new('RGBA', (w * 2, h * 2), (150, 155, 165, 0))
    d = ImageDraw.Draw(tmp)
    W = w * 2
    d.ellipse([0, 0, W - 1, W - 1], fill=(205, 212, 222, 0))
    for r in range(8, int(W / 2), 9):
        d.ellipse([W / 2 - r, W / 2 - r, W / 2 + r, W / 2 + r], outline=(240, 244, 250, 0), width=2)
    d.ellipse([W / 2 - 12, W / 2 - 12, W / 2 + 12, W / 2 + 12], fill=(255, 255, 255, 0))
    paste_rgba(img, tmp, (w, h), (x0, y0))
    d = ImageDraw.Draw(img)
    x0, y0, w, h = R['lens_rect']
    d.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=(205, 212, 222, 0))
    for i in range(0, w, 6):
        d.line([(x0 + i, y0), (x0 + i, y0 + h)], fill=(238, 242, 250, 0), width=1)
    for j in range(0, h, 6):
        d.line([(x0, y0 + j), (x0 + w, y0 + j)], fill=(238, 242, 250, 0), width=1)
    x0, y0, w, h = R['lens_tail']
    d.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=(170, 12, 10, 0))
    for j in range(0, h, 4):
        d.line([(x0, y0 + j), (x0 + w, y0 + j)], fill=(215, 30, 22, 0), width=2)
    x0, y0, w, h = R['lens_amber']
    d.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=(240, 130, 16, 0))
    for j in range(0, h, 4):
        d.line([(x0, y0 + j), (x0 + w, y0 + j)], fill=(255, 175, 50, 0), width=1)
    x0, y0, w, h = R['lens_rev']
    d.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=(225, 228, 232, 0))


def paint_sign(img, D):
    x0, y0, w, h = TD.R['sign']
    d = ImageDraw.Draw(img)
    if D.get('sign') == 'taxi':
        d.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=(12, 12, 12, 0))
        d.rectangle([x0 + 150, y0 + 6, x0 + 362, y0 + h - 7], fill=(248, 236, 200, 0))
        d.text((x0 + 256, y0 + h / 2), 'TAXI', font=font(62), fill=(16, 16, 16, 0), anchor='mm')
        for cx in (x0 + 75, x0 + 437):
            d.text((cx, y0 + h / 2 - 16), 'OFF', font=font(26), fill=(235, 235, 230, 0), anchor='mm')
            d.text((cx, y0 + h / 2 + 16), 'DUTY', font=font(26), fill=(235, 235, 230, 0), anchor='mm')
        x0, y0, w, h = TD.R['sign2']
        d.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=(20, 20, 20, 0))
        d.text((x0 + w / 2, y0 + h / 2), 'ON RADIO CALL', font=font(26, cond=True), fill=(240, 240, 235, 0), anchor='mm')
    elif D.get('sign') == 'police':
        d.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=(150, 8, 6, 0))
        n = 8
        for i in range(n):
            xa = x0 + i * w / n
            d.rectangle([xa + 4, y0 + 8, xa + w / n - 4, y0 + h - 8], fill=(230, 40, 26, 0))
            for j in range(10, h - 10, 7):
                d.line([(xa + 6, y0 + j), (xa + w / n - 6, y0 + j)], fill=(255, 90, 60, 0), width=2)
            d.line([(xa, y0), (xa, y0 + h)], fill=(40, 40, 40, 0), width=4)
        x0, y0, w, h = TD.R['sign2']
        d.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=(30, 30, 32, 0))


def paint_car(D):
    img = Image.new('RGBA', (S, S), (255, 255, 255, 255))
    body = base_regions(img, D)
    paint_side(img, D, 1, body)
    paint_side(img, D, -1, body)
    paint_front(img, D, body)
    paint_rear(img, D, body)
    paint_plate(img, D)
    paint_hub(img, D)
    paint_tire(img, D)
    paint_lenses(img, D)
    paint_sign(img, D)
    return img


def main(kinds):
    os.makedirs(OUT, exist_ok=True)
    import tr_atlas_big
    for k in kinds:
        D = TD.ALL[k]
        img = paint_car(D) if D['type'] == 'car' else tr_atlas_big.paint(D, sys.modules[__name__])
        path = os.path.join(OUT, f'{k}_atlas.png')
        img.save(path, optimize=True)
        print('[atlas]', path, os.path.getsize(path))


if __name__ == '__main__':
    main(sys.argv[1:] or [k for k, v in TD.ALL.items() if v['type'] == 'car'])
