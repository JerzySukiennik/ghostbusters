# Contact sheets for the crew validation renders: turntables per character, plus small status images.
import os, sys
from PIL import Image
ROOT = os.path.abspath(os.path.dirname(os.path.abspath(__file__)) + '/../..')
OUT = ROOT + '/Niepotrzebne/work/crew'
for c in ('crew_1', 'crew_2', 'crew_3'):
    fs = [f'{OUT}/tt/{c}_tt_{a:03d}.jpg' for a in (0, 45, 90, 135, 180, 225, 270, 315)]
    if not all(os.path.exists(f) for f in fs):
        continue
    ims = [Image.open(f).resize((240, 480), Image.LANCZOS) for f in fs]
    S = Image.new('RGB', (240 * 8, 480))
    for i, im in enumerate(ims):
        S.paste(im, (i * 240, 0))
    S.save(f'{OUT}/turntable_{c}.jpg', quality=86)
ps = [f'{ROOT}/assets/avatar/portrait_{c}.jpg' for c in ('jurek', 'crew_1', 'crew_2', 'crew_3')]
if all(os.path.exists(p) for p in ps):
    S = Image.new('RGB', (4 * 256, 320))
    for i, p in enumerate(ps):
        S.paste(Image.open(p).resize((256, 320), Image.LANCZOS), (i * 256, 0))
    S.save(f'{OUT}/status_portraits.jpg', quality=84)
for n in ('lineup_front', 'lineup_back'):
    p = f'{OUT}/{n}.jpg'
    if os.path.exists(p):
        Image.open(p).resize((960, 540), Image.LANCZOS).save(f'{OUT}/status_{n}.jpg', quality=82)
print('sheets done')
