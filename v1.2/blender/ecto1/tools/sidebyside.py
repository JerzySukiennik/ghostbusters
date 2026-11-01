# Side-by-side compare sheet: reference photo | render (same camera), labels optional.
import sys, os
from PIL import Image, ImageDraw
ref, ren, out = sys.argv[1], sys.argv[2], sys.argv[3]
label = len(sys.argv) > 4 and sys.argv[4] == 'label'
a = Image.open(ref).convert('RGB')
b = Image.open(ren).convert('RGB')
H = 720
a = a.resize((int(a.width * H / a.height), H), Image.LANCZOS)
b = b.resize((int(b.width * H / b.height), H), Image.LANCZOS)
s = Image.new('RGB', (a.width + b.width + 8, H), (10, 10, 10))
s.paste(a, (0, 0))
s.paste(b, (a.width + 8, 0))
if label:
    d = ImageDraw.Draw(s)
    d.text((10, 10), 'reference', fill=(255, 255, 0))
    d.text((a.width + 18, 10), 'model', fill=(255, 255, 0))
s.thumbnail((1920, 720))
s.save(out, quality=86)
