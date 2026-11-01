# Default name-tag textures for the crew (surnames in the avatar lane's tag style); the game still paints the player's nickname over it.
import numpy as np, os
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(HERE + '/../..')
SRC = ROOT + '/blender/avatar/tex/nametag_basecolor.jpg'
NAMES = {'crew_1': 'OKAFOR', 'crew_2': 'KOWALCZYK', 'crew_3': 'ASANTE'}
FONT = '/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf'


def make(cid, text):
    im = np.asarray(Image.open(SRC).convert('RGB'), np.float32) / 255
    H, W = im.shape[:2]
    red = (im[..., 0] > 0.35) & (im[..., 1] < 0.25)
    inner = np.zeros_like(red); inner[40:H - 40, 40:W - 40] = True
    letters = red & inner
    bg = im.copy()
    patch = im[50:50 + 40, 60:60 + 40]
    tile = np.tile(patch, (H // 40 + 1, W // 40 + 1, 1))[:H, :W]
    bg[letters] = tile[letters]
    from scipy import ndimage
    grow = ndimage.binary_dilation(letters, iterations=3)
    bg[grow & ~letters] = tile[grow & ~letters]
    redc = im[red & ~inner].mean(0)
    lum = (bg.mean(2) / max(bg.mean(), 1e-3))
    t = Image.new('L', (W * 2, H * 2), 0)
    d = ImageDraw.Draw(t)
    size = 330
    font = ImageFont.truetype(FONT, size)
    while True:
        bb = d.textbbox((0, 0), text, font=font)
        if bb[2] - bb[0] <= (W - 200) * 2 and bb[3] - bb[1] <= 150 * 2:
            break
        size -= 6; font = ImageFont.truetype(FONT, size)
    bb = d.textbbox((0, 0), text, font=font)
    d.text(((W * 2 - (bb[2] - bb[0])) / 2 - bb[0], (H * 2 - (bb[3] - bb[1])) / 2 - bb[1]), text, font=font, fill=255)
    m = np.asarray(t.resize((W, H), Image.LANCZOS), np.float32)[..., None] / 255
    col = np.clip(redc[None, None] * (0.85 + 0.25 * lum[..., None]), 0, 1)
    out = bg * (1 - m) + col * m
    os.makedirs(HERE + f'/tex/{cid}', exist_ok=True)
    Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).save(HERE + f'/tex/{cid}/nametag_basecolor.jpg', quality=92)


if __name__ == '__main__':
    for c, n in NAMES.items():
        make(c, n)
    print('tags done')
