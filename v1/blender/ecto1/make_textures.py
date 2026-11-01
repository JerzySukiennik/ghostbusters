# Ecto-1 textures drawn from scratch (PIL, 4x supersampled): No-Ghost logo, ECTO-1 NY plate, rack palette, equipment panels, gauges.
import math
import os
import random
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tex')
os.makedirs(OUT, exist_ok=True)
FONT_DIR = '/System/Library/Fonts/Supplemental/'


def font(name, size):
    for n in (name, 'Arial Bold.ttf'):
        p = os.path.join(FONT_DIR, n)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def catmull(points, n=12, closed=True):
    P = list(points)
    if closed:
        P = [P[-1]] + P + [P[0], P[1]]
    else:
        P = [P[0]] + P + [P[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    if not closed:
        out.append(P[-2])
    return out


GHOST = [(-0.243, -1.204), (-0.150, -1.222), (-0.080, -1.160), (-0.118, -1.088), (0.010, -1.060), (0.090, -0.915), (0.115, -0.735),
         (0.200, -0.450), (0.355, -0.255), (0.425, -0.170), (0.600, -0.310), (0.770, -0.455), (0.890, -0.590), (0.975, -0.600),
         (0.955, -0.505), (1.060, -0.445), (0.998, -0.385), (1.095, -0.300), (1.000, -0.250), (1.015, -0.150), (0.900, -0.128),
         (0.740, -0.092), (0.520, -0.030), (0.405, 0.060), (0.365, 0.250), (0.255, 0.420), (0.110, 0.472), (-0.050, 0.492),
         (-0.205, 0.470), (-0.385, 0.380), (-0.500, 0.268), (-0.600, 0.172), (-0.800, 0.205), (-0.960, 0.255), (-1.130, 0.275),
         (-1.182, 0.205), (-1.285, 0.192), (-1.205, 0.122), (-1.352, 0.090), (-1.252, 0.040), (-1.330, -0.012), (-1.150, -0.032),
         (-1.050, -0.030), (-0.800, -0.082), (-0.565, -0.142), (-0.565, -0.300), (-0.645, -0.580), (-0.625, -0.832), (-0.545, -1.005),
         (-0.405, -1.125)]


def noghost(size=1024):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = S * 0.535, S * 0.555
    R = S * 0.345
    red = (196, 22, 30, 255)
    blk = (14, 14, 16, 255)
    wht = (246, 246, 242, 255)
    to = lambda p: (cx + p[0] * R, cy + p[1] * R)
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=red)
    ri = R * 0.775
    d.ellipse([cx - ri, cy - ri, cx + ri, cy + ri], fill=(0, 0, 0, 0))
    outline = [to(p) for p in catmull(GHOST, 10)]
    stroke = R * 0.040
    d.polygon(outline, fill=wht)
    d.line(outline + [outline[0]], fill=blk, width=int(stroke), joint='curve')
    d = ImageDraw.Draw(img)
    ew, eh = R * 0.070, R * 0.092
    for ex, ey in ((-0.440, -0.800), (-0.285, -0.828)):
        x, y = to((ex, ey))
        d.ellipse([x - ew, y - eh, x + ew, y + eh], fill=wht, outline=blk, width=int(R * 0.020))
        px, py = x + ew * 0.35, y + eh * 0.15
        d.ellipse([px - ew * 0.42, py - eh * 0.42, px + ew * 0.42, py + eh * 0.42], fill=blk)
    for ex, ey, a0, a1 in ((-0.455, -0.935, 200, 330), (-0.285, -0.962, 210, 340)):
        x, y = to((ex, ey))
        d.arc([x - ew * 1.1, y - eh * 0.6, x + ew * 1.1, y + eh * 0.6], a0, a1, fill=blk, width=int(R * 0.020))
    mx, my = to((-0.372, -0.515))
    mw, mh = R * 0.058, R * 0.080
    d.ellipse([mx - mw, my - mh, mx + mw, my + mh], fill=blk)
    d.ellipse([mx - mw * 0.35, my - mh * 0.55, mx + mw * 0.15, my - mh * 0.05], fill=(90, 20, 24, 255))
    sx, sy = to((-0.330, -0.380))
    d.arc([sx - R * 0.06, sy - R * 0.03, sx + R * 0.06, sy + R * 0.03], 10, 170, fill=blk, width=int(R * 0.018))
    for p0, p1 in (((-0.920, 0.030), (-1.120, 0.150)), ((0.820, -0.330), (0.960, -0.420)), ((0.250, -0.020), (0.330, 0.120))):
        d.line([to(p0), to(p1)], fill=blk, width=int(R * 0.016))
    bw = R * 0.215
    a = math.radians(45)
    ux, uy = math.cos(a), -math.sin(a)
    nx, ny = -uy, ux
    L = ri * 1.02
    poly = [(cx + ux * L + nx * bw / 2, cy + uy * L + ny * bw / 2), (cx + ux * L - nx * bw / 2, cy + uy * L - ny * bw / 2),
            (cx - ux * L - nx * bw / 2, cy - uy * L - ny * bw / 2), (cx - ux * L + nx * bw / 2, cy - uy * L + ny * bw / 2)]
    bar = Image.new('L', (S, S), 0)
    ImageDraw.Draw(bar).polygon(poly, fill=255)
    disc = Image.new('L', (S, S), 0)
    ImageDraw.Draw(disc).ellipse([cx - R * 0.99, cy - R * 0.99, cx + R * 0.99, cy + R * 0.99], fill=255)
    from PIL import ImageChops
    bar = ImageChops.multiply(bar, disc)
    img.paste(Image.new('RGBA', (S, S), red), (0, 0), bar)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(OUT, 'noghost.png'))
    return img


def plate(w=1024, h=512):
    S = 4
    W, H = w * S, h * S
    bg = (243, 192, 38)
    navy = (26, 36, 78)
    img = Image.new('RGB', (W, H), bg)
    d = ImageDraw.Draw(img)
    rnd = random.Random(7)
    for i in range(600):
        x, y = rnd.randint(0, W), rnd.randint(0, H)
        c = rnd.randint(-10, 10)
        d.point((x, y), fill=(bg[0] + c, bg[1] + c, bg[2] + c // 2))
    m = int(W * 0.022)
    d.rounded_rectangle([m, m, W - m, H - m], radius=int(W * 0.03), outline=navy, width=int(W * 0.007))
    f = font('DIN Condensed Bold.ttf', int(H * 0.60))
    txt = 'ECTO-1'
    bb = d.textbbox((0, 0), txt, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    sx = (W * 0.80) / tw
    tmp = Image.new('L', (tw + 40, th + 40), 0)
    ImageDraw.Draw(tmp).text((20 - bb[0], 20 - bb[1]), txt, font=f, fill=255)
    tmp = tmp.resize((int(tmp.width * sx), tmp.height), Image.LANCZOS)
    img.paste(Image.new('RGB', tmp.size, navy), (int((W - tmp.width) / 2), int(H * 0.11)), tmp)
    f2 = font('DIN Alternate Bold.ttf', int(H * 0.12))
    t2 = 'NEW YORK'
    bb2 = d.textbbox((0, 0), t2, font=f2)
    d.text(((W - (bb2[2] - bb2[0])) / 2 - bb2[0] - W * 0.03, H * 0.80 - bb2[1]), t2, font=f2, fill=navy)
    bx0, by0 = W * 0.74, H * 0.74
    d.line([(bx0, by0), (W - m * 2.2, by0)], fill=navy, width=int(W * 0.005))
    d.line([(bx0, by0), (bx0, H - m * 2.2)], fill=navy, width=int(W * 0.005))
    for hx, hy in ((0.16, 0.10), (0.84, 0.10), (0.16, 0.90), (0.84, 0.90)):
        r = W * 0.012
        d.ellipse([hx * W - r, hy * H - r, hx * W + r, hy * H + r], fill=(60, 55, 40))
    img = img.resize((w, h), Image.LANCZOS)
    img.save(os.path.join(OUT, 'plate_ecto1.jpg'), quality=92)


PALETTE = {
    'white': (238, 238, 232), 'black': (18, 18, 18), 'yellow': (238, 196, 18), 'green': (196, 214, 150), 'red': (186, 22, 26),
    'blue': (30, 76, 172), 'grey': (150, 152, 150), 'brass': (190, 150, 80), 'darkred': (120, 14, 16), 'lightgrey': (205, 206, 204),
    'silver': (175, 178, 182), 'orange': (230, 120, 20), 'cream': (226, 218, 196), 'darkgrey': (55, 56, 58), 'rubber': (28, 28, 28),
    'olive': (90, 96, 60),
}
PAL_KEYS = list(PALETTE.keys())


def palette(size=512):
    img = Image.new('RGB', (size, size), (128, 128, 128))
    d = ImageDraw.Draw(img)
    cell = size // 8
    for i, k in enumerate(PAL_KEYS):
        x, y = (i % 8) * cell, (i // 8) * cell
        d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=PALETTE[k])
    y0 = 2 * cell
    d.rectangle([0, y0, cell * 2 - 1, y0 + cell - 1], fill=(240, 238, 230))
    d.rectangle([4, y0 + 4, cell * 2 - 5, y0 + 22], fill=(196, 22, 26))
    f = font('Arial Bold.ttf', 16)
    d.text((14, y0 + 4), 'DANGER', font=f, fill=(255, 255, 255))
    for k in range(4):
        d.line([(10, y0 + 32 + k * 7), (cell * 2 - 14, y0 + 32 + k * 7)], fill=(60, 60, 60), width=2)
    x0 = cell * 2
    d.rectangle([x0, y0, x0 + cell * 2 - 1, y0 + cell - 1], fill=(238, 196, 18))
    for k in range(0, cell * 2, 16):
        d.rectangle([x0 + k, y0, x0 + k + 7, y0 + cell // 2 - 1], fill=(15, 15, 15))
        d.rectangle([x0 + k + 8, y0 + cell // 2, x0 + k + 15, y0 + cell - 1], fill=(15, 15, 15))
    x0 = cell * 4
    d.rectangle([x0, y0, x0 + cell - 1, y0 + cell - 1], fill=(238, 196, 18))
    c = (x0 + cell // 2, y0 + cell // 2)
    for a in (90, 210, 330):
        d.pieslice([c[0] - 26, c[1] - 26, c[0] + 26, c[1] + 26], a - 30, a + 30, fill=(15, 15, 15))
    d.ellipse([c[0] - 6, c[1] - 6, c[0] + 6, c[1] + 6], fill=(15, 15, 15))
    x0 = cell * 5
    for k in range(0, cell, 8):
        d.rectangle([x0, y0 + k, x0 + cell - 1, y0 + k + 3], fill=(40, 40, 42))
        d.rectangle([x0, y0 + k + 4, x0 + cell - 1, y0 + k + 7], fill=(200, 200, 198))
    x0 = cell * 6
    d.rectangle([x0, y0, x0 + cell - 1, y0 + cell - 1], fill=(170, 172, 176))
    for k in range(6, cell, 6):
        d.line([(x0 + 4, y0 + k), (x0 + cell - 5, y0 + k)], fill=(40, 40, 44), width=3)
    x0 = cell * 7
    d.rectangle([x0, y0, x0 + cell - 1, y0 + cell - 1], fill=(240, 238, 230))
    d.rectangle([x0 + 3, y0 + 3, x0 + cell - 4, y0 + cell - 4], outline=(186, 22, 26), width=4)
    for k in range(3):
        d.line([(x0 + 10, y0 + 18 + k * 12), (x0 + cell - 12, y0 + 18 + k * 12)], fill=(186, 22, 26), width=3)
    y1 = 3 * cell
    d.rectangle([0, y1, cell - 1, y1 + cell - 1], fill=(240, 240, 236))
    for k in (0.28, 0.62):
        d.rectangle([0, y1 + int(cell * k), cell - 1, y1 + int(cell * (k + 0.16))], fill=(186, 22, 26))
    img.save(os.path.join(OUT, 'palette.png'))


def equipment(w=1024, h=512):
    rnd = random.Random(1984)
    S = 2
    img = Image.new('RGB', (w * S, h * S), (34, 35, 37))
    d = ImageDraw.Draw(img)
    y = 6
    while y < h * S - 40:
        uh = rnd.choice([44, 44, 88, 88, 132]) * S // 2
        x = 6
        while x < w * S - 60:
            pw = rnd.choice([160, 220, 300, 400]) * S // 2
            pw = min(pw, w * S - 6 - x)
            col = rnd.choice([(52, 54, 58), (70, 72, 70), (40, 42, 46), (150, 150, 145), (190, 186, 172), (90, 70, 50)])
            d.rectangle([x, y, x + pw - 4, y + uh - 4], fill=col, outline=(20, 20, 22), width=2)
            for sx_, sy_ in ((x + 8, y + 8), (x + pw - 14, y + 8), (x + 8, y + uh - 14), (x + pw - 14, y + uh - 14)):
                d.ellipse([sx_ - 3, sy_ - 3, sx_ + 3, sy_ + 3], fill=(120, 120, 118))
            kind = rnd.random()
            cx = x + 20
            while cx < x + pw - 30:
                cy = y + uh // 2
                r = rnd.random()
                if r < 0.30:
                    rr = rnd.choice([10, 14, 18])
                    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(20, 20, 20), outline=(180, 180, 180), width=2)
                    a = rnd.uniform(0, 6.28)
                    d.line([(cx, cy), (cx + rr * 0.8 * math.cos(a), cy + rr * 0.8 * math.sin(a))], fill=(230, 230, 230), width=2)
                    cx += rr * 2 + 14
                elif r < 0.50:
                    d.rectangle([cx - 4, cy - 12, cx + 4, cy + 12], fill=(200, 200, 200))
                    d.rectangle([cx - 3, cy - 12 if rnd.random() < 0.5 else cy, cx + 3, cy if rnd.random() < 0.5 else cy + 12], fill=(60, 60, 60))
                    cx += 22
                elif r < 0.68:
                    mw, mh = 60, min(uh - 24, 50)
                    d.rectangle([cx, cy - mh // 2, cx + mw, cy + mh // 2], fill=(228, 224, 200), outline=(10, 10, 10), width=2)
                    for t in range(7):
                        tx = cx + 8 + t * (mw - 16) / 6
                        d.line([(tx, cy - mh // 2 + 6), (tx, cy - mh // 2 + 12)], fill=(30, 30, 30), width=1)
                    a = rnd.uniform(-1.0, 1.0)
                    d.line([(cx + mw / 2, cy + mh // 2 - 4), (cx + mw / 2 + 24 * math.sin(a), cy + mh // 2 - 4 - 30 * math.cos(a))], fill=(180, 20, 20), width=2)
                    cx += mw + 16
                elif r < 0.85:
                    for k in range(rnd.randint(3, 8)):
                        c = rnd.choice([(255, 40, 30), (40, 255, 60), (255, 190, 30), (60, 140, 255)])
                        d.ellipse([cx + k * 12 - 4, cy - 4, cx + k * 12 + 4, cy + 4], fill=c)
                    cx += 100
                else:
                    d.rectangle([cx, cy - 8, cx + 70, cy + 8], fill=(225, 225, 215))
                    d.line([(cx + 6, cy), (cx + 60, cy)], fill=(60, 60, 60), width=2)
                    cx += 84
            x += pw
        y += uh
    img = img.resize((w, h), Image.LANCZOS)
    img.save(os.path.join(OUT, 'equipment.jpg'), quality=90)


def gauges(w=512, h=128):
    S = 4
    img = Image.new('RGB', (w * S, h * S), (12, 12, 14))
    d = ImageDraw.Draw(img)
    W, H = w * S, h * S
    d.rounded_rectangle([W * 0.08, H * 0.18, W * 0.92, H * 0.70], radius=40, fill=(24, 24, 26), outline=(170, 170, 168), width=10)
    f = font('Arial Bold.ttf', int(H * 0.13))
    for i, v in enumerate(range(0, 130, 10)):
        x = W * 0.12 + i * (W * 0.76) / 12
        d.line([(x, H * 0.28), (x, H * 0.38)], fill=(230, 230, 225), width=6)
        if v % 20 == 0:
            d.text((x - 30, H * 0.42), str(v), font=f, fill=(230, 230, 225))
    d.rectangle([W * 0.12, H * 0.55, W * 0.40, H * 0.60], fill=(230, 60, 30))
    for k, x in enumerate((0.20, 0.40, 0.60, 0.80)):
        cx, cy, r = W * x, H * 0.86, H * 0.10
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(20, 20, 22), outline=(160, 160, 158), width=6)
        d.line([(cx, cy), (cx + r * 0.7, cy - r * 0.5)], fill=(230, 230, 230), width=5)
    img = img.resize((w, h), Image.LANCZOS)
    img.save(os.path.join(OUT, 'gauges.jpg'), quality=90)


if __name__ == '__main__':
    noghost()
    plate()
    palette()
    equipment()
    gauges()
    print('textures ->', OUT, sorted(os.listdir(OUT)))
