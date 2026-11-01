# Ghostbusters plate: builds assets/world/tex (resized CC0 scans, sign atlas, props atlas, ripples, steam puff, painted ad) with Pillow + numpy.
import json, math, os, sys, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

SRC = sys.argv[1]
OUT = sys.argv[2]
FONTS = os.path.join(SRC, 'fonts')
os.makedirs(OUT, exist_ok=True)
rng = random.Random(1984)

def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)

def scan(name, size, out, nsize=None):
    d = os.path.join(SRC, 'textures', name)
    for kind in ('diff', 'arm', 'nor'):
        im = Image.open(os.path.join(d, kind + '.jpg')).convert('RGB')
        s = nsize if (kind == 'nor' and nsize) else size
        if im.size[0] != s:
            im = im.resize((s, s), Image.LANCZOS)
        if kind == 'nor':
            im.save(os.path.join(OUT, f'{out}_nor.png'), optimize=True)
        else:
            im.save(os.path.join(OUT, f'{out}_{kind}.jpg'), quality=88)

for name, size, out, ns in (
    ('asphalt_02', 2048, 'asphalt', 1024), ('concrete_pavement', 1024, 'sidewalk', 1024), ('granite_tile', 512, 'curb', 512),
    ('red_brick_03', 1024, 'brick_red', 1024), ('large_red_bricks', 1024, 'brick_orange', 1024), ('brown_brick_02', 1024, 'brick_buff', 1024),
    ('dark_brick_wall', 1024, 'brick_dark', 1024), ('concrete_wall_008', 1024, 'stone', 1024), ('painted_metal_shutter', 512, 'shutter', 512),
    ('metal_plate', 512, 'diamond', 512), ('rough_wood', 512, 'wood_rough', 512), ('plywood', 512, 'plywood', 512),
    ('brown_planks_04', 512, 'planks', 512)):
    scan(name, size, out, ns)

def glow_text(img, xy, text, f, color, core=(255, 255, 255), blur=10, width=0, anchor='mm', stroke=0):
    w, h = img.size
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    d.text(xy, text, font=f, fill=255, anchor=anchor, stroke_width=stroke, stroke_fill=255)
    g1 = m.filter(ImageFilter.GaussianBlur(blur))
    g2 = m.filter(ImageFilter.GaussianBlur(blur * 0.35))
    base = np.asarray(img).astype(np.float32)
    c = np.array(color, np.float32)
    cc = np.array(core, np.float32)
    a1 = np.asarray(g1).astype(np.float32)[..., None] / 255.0
    a2 = np.asarray(g2).astype(np.float32)[..., None] / 255.0
    a0 = np.asarray(m).astype(np.float32)[..., None] / 255.0
    out = base + c * a1 * 0.9 + c * a2 * 0.8
    out = out * (1 - a0) + (c * 0.55 + cc * 0.45) * a0
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))

def board(w, h, col=(14, 13, 12), grain=6):
    a = np.zeros((h, w, 3), np.float32) + np.array(col, np.float32)
    a += np.random.default_rng(w * h).normal(0, grain, (h, w, 1))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def lightbox(w, h, bg, fg, text, f, sub=None, fsub=None, border=(40, 40, 40)):
    im = board(w, h, bg, 3)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w - 1, h - 1], outline=border, width=max(4, h // 18))
    y = h * 0.5 if not sub else h * 0.4
    d.text((w / 2, y), text, font=f, fill=fg, anchor='mm')
    if sub:
        d.text((w / 2, h * 0.8), sub, font=fsub, fill=fg, anchor='mm')
    yy, xx = np.mgrid[0:h, 0:w]
    v = 1.0 - 0.18 * (((xx - w / 2) / (w / 2)) ** 2) - 0.12 * (((yy - h / 2) / (h / 2)) ** 2)
    a = np.asarray(im).astype(np.float32) * v[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def painted(w, h, bg, fg, text, f, sub=None, fsub=None):
    im = board(w, h, bg, 3)
    d = ImageDraw.Draw(im)
    d.text((w / 2, h * (0.45 if sub else 0.52)), text, font=f, fill=fg, anchor='mm')
    if sub:
        d.text((w / 2, h * 0.82), sub, font=fsub, fill=fg, anchor='mm')
    n = np.random.default_rng(w + h).random((h // 40 + 2, w // 40 + 2))
    n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32) / 255
    a = np.asarray(im).astype(np.float32) * (0.86 + 0.18 * n[..., None])
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def neon(w, h, text, f, color, core=(255, 240, 230), blur=14, sub=None, fsub=None, subcolor=None, bgc=(10, 9, 9)):
    im = board(w, h, bgc, 4)
    im = glow_text(im, (w / 2, h * (0.42 if sub else 0.5)), text, f, color, core, blur)
    if sub:
        im = glow_text(im, (w / 2, h * 0.8), sub, fsub, subcolor or color, core, blur * 0.7)
    return im

CW, CH = 1024, 170
GW, GH = 1024, 204
cells = []
atlas = Image.new('RGB', (2048, 2048), (8, 8, 8))
def put(key, im, lit, kind):
    i = len(cells)
    x, y = (i % 2) * CW, (i // 2) * CH
    atlas.paste(im.resize((CW, CH), Image.LANCZOS), (x, y))
    cells.append({'key': key, 'uv': [x / 2048, 1 - (y + CH) / 2048, CW / 2048, CH / 2048], 'lit': lit, 'kind': kind})

put('hotel_v', neon(GW, GH, 'HOTEL', font('Oswald.ttf', 170), (255, 40, 30), blur=12), 1.0, 'blade')
put('bar_v', neon(GW, GH, 'BAR', font('Monoton.ttf', 150), (60, 120, 255), blur=12), 1.0, 'blade')
put('tavern', neon(GW, GH, "McGrath's", font('Yellowtail.ttf', 150), (60, 255, 120), blur=12, bgc=(12, 10, 8)), 0.9, 'fascia')
put('liquors', neon(GW, GH, 'LIQUORS', font('Oswald.ttf', 150), (255, 50, 40)), 1.0, 'fascia')
put('deli', lightbox(GW, GH, (236, 206, 70), (180, 22, 18), 'DELI  GROCERY', font('ArchivoBlack.ttf', 118), 'BEER  SODA  CIGARETTES  LOTTO', font('Oswald.ttf', 38)), 0.75, 'fascia')
put('pizza', lightbox(GW, GH, (245, 240, 228), (30, 120, 40), "RAY'S PIZZA", font('AlfaSlabOne.ttf', 120), 'SLICES  HEROES  CALZONES', font('Oswald.ttf', 40), border=(160, 20, 20)), 0.75, 'fascia')
put('laundromat', painted(GW, GH, (30, 70, 130), (240, 236, 220), 'LAUNDROMAT', font('BebasNeue.ttf', 150), 'WASH  DRY  FOLD', font('Oswald.ttf', 40)), 0.0, 'fascia')
put('checks', lightbox(GW, GH, (244, 244, 240), (20, 50, 150), 'CHECKS CASHED', font('ArchivoBlack.ttf', 104), 'MONEY ORDERS  FOOD STAMPS', font('Oswald.ttf', 40), border=(20, 50, 150)), 0.75, 'fascia')
put('coffee', lightbox(GW, GH, (250, 244, 232), (200, 30, 30), 'Coffee Shop', font('Pacifico.ttf', 110), 'BREAKFAST  LUNCH  OPEN 24 HRS', font('Oswald.ttf', 34)), 0.8, 'fascia')
put('records', neon(GW, GH, 'RECORDS', font('Monoton.ttf', 120), (255, 70, 200), blur=12), 0.9, 'fascia')
put('bakery', lightbox(GW, GH, (250, 250, 246), (25, 25, 25), 'Bakery', font('Pacifico.ttf', 120), border=(120, 90, 50)), 0.7, 'fascia')
put('cleaners', painted(GW, GH, (226, 222, 210), (30, 30, 30), 'CLEANERS', font('AlfaSlabOne.ttf', 120), 'TAILORING  ALTERATIONS', font('Oswald.ttf', 40)), 0.0, 'fascia')
put('hardware', painted(GW, GH, (120, 20, 18), (240, 230, 200), 'HARDWARE', font('Oswald.ttf', 140), 'PAINTS  KEYS  LOCKS', font('Oswald.ttf', 38)), 0.0, 'fascia')
put('pawn', painted(GW, GH, (20, 20, 22), (230, 190, 60), 'PAWN BROKER', font('AlfaSlabOne.ttf', 110), 'LOANS  BUY  SELL', font('Oswald.ttf', 40)), 0.0, 'fascia')
put('shoe', painted(GW, GH, (60, 40, 30), (240, 225, 190), 'SHOE REPAIR', font('BebasNeue.ttf', 140)), 0.0, 'fascia')
put('open', neon(GW, GH, 'OPEN', font('Oswald.ttf', 160), (255, 40, 40), blur=10), 1.0, 'window')
put('cocktails', neon(GW, GH, 'Cocktails', font('Yellowtail.ttf', 150), (255, 80, 160), blur=12), 1.0, 'window')
put('pizza_neon', neon(GW, GH, 'PIZZA', font('Oswald.ttf', 160), (255, 140, 30), blur=12), 1.0, 'window')
put('rooms', neon(GW, GH, 'ROOMS', font('BebasNeue.ttf', 170), (255, 60, 40), blur=10), 1.0, 'window')
put('street_moore', painted(GW, GH, (16, 92, 52), (245, 245, 240), 'N MOORE ST', font('Oswald.ttf', 150)), 0.0, 'street')
put('street_varick', painted(GW, GH, (16, 92, 52), (245, 245, 240), 'VARICK ST', font('Oswald.ttf', 150)), 0.0, 'street')
put('walk', neon(GW, GH, 'WALK', font('Oswald.ttf', 160), (240, 240, 235), blur=8), 1.0, 'walk')
put('dontwalk', neon(GW, GH, "DON'T WALK", font('Oswald.ttf', 140), (255, 110, 30), blur=8), 1.0, 'walk')
put('hotel_fascia', painted(GW, GH, (40, 22, 18), (226, 200, 150), 'HOTEL ARDSLEY', font('AlfaSlabOne.ttf', 104)), 0.0, 'fascia')
atlas.save(os.path.join(OUT, 'signs.jpg'), quality=90)
json.dump({'cells': cells, 'cell': [CW, CH], 'size': [2048, 2048]}, open(os.path.join(OUT, 'signs.json'), 'w'), indent=1)

W, H = 2048, 1024
pa = Image.new('RGB', (W, H), (128, 128, 128))
d = ImageDraw.Draw(pa)
pcells = {}
def pcell(key, box):
    x0, y0, x1, y1 = box
    pcells[key] = [x0 / W, 1 - y1 / H, (x1 - x0) / W, (y1 - y0) / H]

def stripes(box, a, b, n, vertical=False):
    x0, y0, x1, y1 = box
    for i in range(n):
        if vertical:
            xa = x0 + (x1 - x0) * i / n; xb = x0 + (x1 - x0) * (i + 1) / n
            d.rectangle([xa, y0, xb, y1], fill=a if i % 2 == 0 else b)
        else:
            ya = y0 + (y1 - y0) * i / n; yb = y0 + (y1 - y0) * (i + 1) / n
            d.rectangle([x0, ya, x1, yb], fill=a if i % 2 == 0 else b)

d.rectangle([0, 0, 1024, 128], fill=(28, 52, 132))
d.text((512, 64), 'POLICE LINE  DO NOT CROSS', font=font('Oswald.ttf', 92), fill=(240, 240, 236), anchor='mm')
pcell('sawhorse_board', (0, 0, 1024, 128))
d.rectangle([1024, 0, 1280, 128], fill=(28, 52, 132)); pcell('blue_paint', (1024, 0, 1280, 128))
d.rectangle([1280, 0, 1536, 128], fill=(236, 236, 232)); pcell('white_paint', (1280, 0, 1536, 128))
d.rectangle([1536, 0, 1792, 128], fill=(255, 92, 10)); pcell('cone_orange', (1536, 0, 1792, 128))
d.rectangle([1792, 0, 2048, 128], fill=(30, 30, 30)); pcell('black_rubber', (1792, 0, 2048, 128))
stripes((0, 128, 512, 384), (255, 96, 12), (238, 238, 232), 8)
pcell('stack_stripes', (0, 128, 512, 384))
umb = (512, 128, 1024, 384)
stripes(umb, (214, 32, 28), (244, 210, 48), 8, vertical=True)
pcell('umbrella', umb)
d.rectangle([1024, 128, 1536, 384], fill=(210, 212, 214))
d.text((1280, 190), 'HOT DOGS', font=font('ArchivoBlack.ttf', 70), fill=(200, 30, 28), anchor='mm')
d.text((1280, 270), 'KNISHES  PRETZELS', font=font('Oswald.ttf', 46), fill=(30, 60, 140), anchor='mm')
d.text((1280, 340), 'SODA 50c', font=font('Oswald.ttf', 46), fill=(30, 60, 140), anchor='mm')
pcell('cart_panel', (1024, 128, 1536, 384))
d.rectangle([1536, 128, 2048, 384], fill=(24, 52, 120))
d.text((1792, 200), 'U.S. MAIL', font=font('ArchivoBlack.ttf', 76), fill=(236, 236, 232), anchor='mm')
d.rectangle([1600, 260, 1984, 350], outline=(236, 236, 232), width=6)
pcell('mailbox', (1536, 128, 2048, 384))
for i, (name, bg, fg) in enumerate((('THE GAZETTE', (200, 40, 32), (250, 248, 240)), ('EVENING STAR', (240, 200, 40), (20, 20, 20)), ('DAILY HERALD', (30, 80, 160), (250, 248, 240)))):
    x0 = i * 512
    d.rectangle([x0, 384, x0 + 512, 640], fill=bg)
    d.text((x0 + 256, 450), name, font=font('AlfaSlabOne.ttf', 52), fill=fg, anchor='mm')
    d.rectangle([x0 + 60, 500, x0 + 452, 620], fill=(90, 100, 110))
    d.text((x0 + 256, 560), '25c', font=font('Oswald.ttf', 60), fill=(240, 240, 240), anchor='mm')
    pcell(f'news_{i}', (x0, 384, x0 + 512, 640))
d.rectangle([1536, 384, 2048, 640], fill=(26, 70, 150))
d.text((1792, 512), 'TELEPHONE', font=font('Oswald.ttf', 96), fill=(244, 244, 240), anchor='mm')
pcell('phone_header', (1536, 384, 2048, 640))
np_rng = np.random.default_rng(7)
paper = Image.new('RGB', (512, 384), (214, 210, 196))
pd = ImageDraw.Draw(paper)
pd.text((256, 40), 'THE GAZETTE', font=font('AlfaSlabOne.ttf', 44), fill=(20, 20, 20), anchor='mm')
pd.text((256, 105), 'GHOSTS SEEN', font=font('Oswald.ttf', 60), fill=(15, 15, 15), anchor='mm')
pd.text((256, 165), 'ON WEST SIDE', font=font('Oswald.ttf', 60), fill=(15, 15, 15), anchor='mm')
for row in range(10):
    for col in range(3):
        y = 210 + row * 16
        x = 30 + col * 160
        pd.rectangle([x, y, x + 140 - (row * 7 % 30), y + 7], fill=(90, 88, 82))
pa.paste(paper, (0, 640))
pcell('newspaper', (0, 640, 512, 1024))
food = Image.new('RGB', (512, 384), (0, 0, 0))
fd = ImageDraw.Draw(food)
fd.rectangle([0, 0, 256, 192], fill=(150, 60, 40))
fd.rectangle([256, 0, 512, 192], fill=(214, 168, 96))
fd.rectangle([0, 192, 170, 384], fill=(230, 190, 20))
fd.rectangle([170, 192, 340, 384], fill=(200, 24, 20))
fd.rectangle([340, 192, 512, 384], fill=(196, 30, 36))
fd.text((426, 288), 'COLA', font=font('Pacifico.ttf', 40), fill=(250, 250, 250), anchor='mm')
pa.paste(food, (512, 640))
pcell('frank', (512, 640, 768, 832)); pcell('bun', (768, 640, 1024, 832)); pcell('mustard', (512, 832, 682, 1024)); pcell('ketchup', (682, 832, 852, 1024)); pcell('soda', (852, 832, 1024, 1024))
crate = Image.open(os.path.join(SRC, 'textures', 'rough_wood', 'diff.jpg')).convert('RGB').resize((512, 384))
cd = ImageDraw.Draw(crate)
cd.text((256, 192), 'PRODUCE', font=font('BebasNeue.ttf', 120), fill=(40, 36, 30), anchor='mm')
crate = Image.blend(crate, Image.open(os.path.join(SRC, 'textures', 'rough_wood', 'diff.jpg')).convert('RGB').resize((512, 384)), 0.35)
pa.paste(crate, (1024, 640))
pcell('crate_stencil', (1024, 640, 1536, 1024))
d.rectangle([1536, 640, 2048, 1024], fill=(70, 74, 78))
for i in range(8):
    d.rectangle([1536, 640 + i * 48, 2048, 640 + i * 48 + 6], fill=(50, 52, 56))
pcell('grey_metal', (1536, 640, 2048, 1024))
pa.save(os.path.join(OUT, 'props_atlas.jpg'), quality=90)
json.dump(pcells, open(os.path.join(OUT, 'props_atlas.json'), 'w'), indent=1)

N = 512
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
h = np.zeros((N, N), np.float32)
r2 = np.random.default_rng(3)
for k in range(48):
    kx, ky = r2.integers(-9, 10), r2.integers(-9, 10)
    if kx == 0 and ky == 0:
        continue
    amp = 1.0 / math.hypot(kx, ky) ** 1.2
    h += amp * np.sin(2 * math.pi * (kx * xx + ky * yy) / N + r2.random() * 6.283)
for k in range(260):
    cx, cy, rr = r2.random() * N, r2.random() * N, 6 + r2.random() * 26
    dx = (xx - cx + N / 2) % N - N / 2
    dy = (yy - cy + N / 2) % N - N / 2
    dist = np.sqrt(dx * dx + dy * dy)
    h += 0.16 * np.exp(-((dist - rr) ** 2) / 6.0) * np.exp(-dist / (rr * 2.2))
h = (h - h.min()) / (h.max() - h.min())
gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
s = 18.0
n = np.stack([-gx * s, gy * s, np.ones_like(h)], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(os.path.join(OUT, 'ripples_nor.png'), optimize=True)

S = 256
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
r = np.sqrt((xx - S / 2) ** 2 + (yy - S / 2) ** 2) / (S / 2)
noise = np.zeros((S, S), np.float32)
r3 = np.random.default_rng(5)
for o in range(5):
    f = 2 ** (o + 2)
    g = r3.random((f + 1, f + 1)).astype(np.float32)
    noise += np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC)).astype(np.float32) / 255 / (o + 1)
noise /= noise.max()
a = np.clip(1 - r, 0, 1) ** 1.6 * (0.45 + 0.75 * noise)
a = np.clip(a * 1.25, 0, 1)
puff = np.dstack([np.full((S, S), 255, np.uint8)] * 3 + [(a * 255).astype(np.uint8)])
Image.fromarray(puff, 'RGBA').save(os.path.join(OUT, 'steam.png'), optimize=True)

AW, AH = 1024, 512
ad = Image.new('RGBA', (AW, AH), (0, 0, 0, 0))
dd = ImageDraw.Draw(ad)
dd.rectangle([20, 20, AW - 20, AH - 20], fill=(30, 60, 120, 220))
dd.rectangle([40, 40, AW - 40, AH - 40], outline=(236, 228, 210, 230), width=10)
dd.text((AW / 2, 150), 'STAY PUFT', font=font('AlfaSlabOne.ttf', 150), fill=(240, 234, 220, 235), anchor='mm')
dd.text((AW / 2, 290), 'MARSHMALLOWS', font=font('Oswald.ttf', 120), fill=(240, 234, 220, 235), anchor='mm')
dd.text((AW / 2, 410), "AMERICA'S FAVORITE SINCE 1932", font=font('Oswald.ttf', 52), fill=(214, 60, 40, 230), anchor='mm')
arr = np.asarray(ad).astype(np.float32)
fade = np.random.default_rng(9).random((AH // 4, AW // 4)).astype(np.float32)
fade = np.asarray(Image.fromarray((fade * 255).astype(np.uint8)).resize((AW, AH), Image.BICUBIC)).astype(np.float32) / 255
fine = np.random.default_rng(10).random((AH, AW)).astype(np.float32)
arr[..., 3] *= np.clip(0.35 + 0.55 * fade + 0.25 * (fine - 0.5), 0, 1)
Image.fromarray(arr.astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'ad_staypuft.png'), optimize=True)
print('ok', len(cells), 'signs', len(pcells), 'prop cells')
