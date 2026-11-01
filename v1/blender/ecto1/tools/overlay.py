# Overlay ortho renders of the Ecto-1 on the Miller-Meteor blueprint (side/top/front), writes JPEGs.
import sys, os
from PIL import Image, ImageDraw, ImageChops
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
BP = os.path.join(ROOT, 'Niepotrzebne/refs/ecto1/blueprints/mm1959_vector_preview.jpg')
src, out = sys.argv[1], sys.argv[2]
mpp = 0.0052
bpm = 0.006988
bp = Image.open(BP).convert('RGB')

def fit(view, a, c, d, e, f):
    W, H = 1280, 720
    img = bp.transform((W, H), Image.AFFINE, data=(a, 0, c, 0, e, f), resample=Image.BICUBIC, fillcolor=(255, 255, 255))
    return img

def comp(bg, rpath, name, alpha=0.55):
    r = Image.open(rpath).convert('RGBA')
    bgc = bg.convert('RGBA')
    a = r.split()[3].point(lambda v: int(v * alpha))
    r2 = r.copy(); r2.putalpha(a)
    o = Image.alpha_composite(bgc, r2)
    edge = r.split()[3].point(lambda v: 255 if v > 128 else 0)
    from PIL import ImageFilter
    e2 = ImageChops.difference(edge.filter(ImageFilter.MaxFilter(3)), edge)
    red = Image.new('RGBA', o.size, (230, 0, 0, 255))
    o.paste(red, (0, 0), e2)
    d = ImageDraw.Draw(o)
    d.text((10, 10), name + '  (blueprint = grey lines, model = tint, red = model silhouette)', fill=(0, 0, 200, 255))
    o.convert('RGB').save(out.replace('.jpg', f'_{name}.jpg'), quality=85)

k = mpp / bpm
side = fit('side', k, (-640 * mpp + 3.16) / bpm + 12.5, 0, k, 275 - (0.85 + 360 * mpp) / bpm)
comp(side, os.path.join(src, 'ortho_side.png'), 'side')
top = fit('top', k, (-640 * mpp + 3.16) / bpm + 12.5, 0, k, 528.5 - (360 * mpp) / bpm)
comp(top, os.path.join(src, 'ortho_top.png'), 'top')
fm = 0.0030; fb = 2.04 / 312.0
front = fit('front', fm / fb, 1096 - 640 * fm / fb, 0, fm / fb, 272 - (0.85 + 360 * fm) / fb)
comp(front, os.path.join(src, 'ortho_front.png'), 'front')
rear = fit('rear', fm / fb, 1096 - 640 * fm / fb, 0, fm / fb, 590 - (0.85 + 360 * fm) / fb)
comp(rear, os.path.join(src, 'ortho_rear.png'), 'rear')
