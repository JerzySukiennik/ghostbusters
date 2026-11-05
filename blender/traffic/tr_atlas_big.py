# Atlas painter for the big vehicles (GMC RTS bus, GMC 7000 box truck, DSNY Mack MR rear loader): sides, front and rear caps, signs, lenses.
from PIL import Image, ImageDraw
import tr_designs as TD

BR = TD.BIG_R


def regs(A, img, D):
    hw = D['W'] / 2
    L, H = D['L'], D['H']
    sl = A.Reg(img, BR['side_l'], (0.0, L), (0.0, H))
    sr = A.Reg(img, BR['side_r'], (L, 0.0), (0.0, H))
    fr = A.Reg(img, BR['front'], (-hw, hw), D['front_zr'])
    rr = A.Reg(img, BR['rear'], (hw, -hw), D['rear_zr'])
    return sl, sr, fr, rr


def louvres(g, s0, s1, z0, z1, n, col, bg):
    g.rect(s0, z0, s1, z1, bg)
    dz = (z1 - z0) / n
    for i in range(n):
        g.rect(s0 + 0.02, z0 + i * dz + dz * 0.25, s1 - 0.02, z0 + i * dz + dz * 0.6, col)


def common(A, img, D):
    A.paint_plate(img, D)
    A.paint_hub(img, D)
    A.paint_tire(img, D)
    A.paint_lenses(img, D)


def bus(A, img, D):
    body = A.base_regions(img, D)
    tan = body
    red = A.c8((0.50, 0.035, 0.03), 0)
    brown = A.c8((0.16, 0.065, 0.03), 0)
    white = A.c8((0.86, 0.85, 0.82), 0)
    dark = A.c8((0.012, 0.014, 0.017), 0)
    seam = A.shade(tan, 0.55)
    L = D['L']
    sl, sr, fr, rr = regs(A, img, D)
    for g, right in ((sl, False), (sr, True)):
        g.rect(0, 0, L, D['H'], tan)
        g.rect(0, 0, L, 0.74, brown)
        g.rect(0, 0.74, L, 0.78, A.c8((0.02, 0.02, 0.02), 0))
        g.rect(0, 1.36, L, 1.56, red)
        g.rect(0, 2.66, L, D['H'], white)
        for s in (2.9, 4.6, 6.3, 8.0, 9.7):
            g.line([(s, 0.8), (s, 1.34)], seam, 2)
        louvres(g, L - 1.55, L - 0.45, 0.82, 1.30, 7, A.c8((0.05, 0.05, 0.05), 0), A.c8((0.3, 0.29, 0.26), 0))
        g.text(1.0 if not right else 9.6, 1.18, D['number'], 0.17, A.c8((0.03, 0.03, 0.05), 0))
        lx, ax = (2.0, 6.8) if not right else (8.0, 2.6)
        g.ellipse(lx, 1.08, 0.17, 0.17, A.c8((0.05, 0.16, 0.45), 0))
        g.text(lx, 1.08, 'MTA', 0.12, A.c8((0.9, 0.9, 0.9), 0))
        g.text(lx + 1.3, 1.1, 'NEW YORK CITY TRANSIT AUTHORITY', 0.07, A.c8((0.08, 0.06, 0.05), 0), cond=True)
        g.rect(ax, 0.84, ax + 2.6, 1.32, A.c8((0.75, 0.70, 0.55), 0))
        g.rect(ax + 0.04, 0.88, ax + 2.56, 1.28, A.c8((0.12, 0.10, 0.22), 0))
        g.text(ax + 1.3, 1.13, 'SEE CATS', 0.15, A.c8((0.95, 0.80, 0.25), 0))
        g.text(ax + 1.3, 0.97, 'WINTER GARDEN', 0.07, A.c8((0.9, 0.9, 0.9), 0), cond=True)
        if right:
            for d0, d1 in ((0.42, 1.55), (6.0, 7.05)):
                g.rect(d0, 0.34, d1, 2.6, A.c8((0.55, 0.53, 0.48), 0))
                mid = (d0 + d1) / 2
                for a, b in ((d0 + 0.05, mid - 0.02), (mid + 0.02, d1 - 0.05)):
                    g.rect(a, 0.95, b, 2.52, dark)
                    g.rect(a, 0.42, b, 0.88, dark)
                g.line([(mid, 0.34), (mid, 2.6)], A.c8((0.1, 0.1, 0.1), 0), 3)
        else:
            g.rect(0.42, 1.62, 1.6, 2.6, dark)
    fr.rect(-1.3, 0.0, 1.3, 3.1, tan)
    fr.rect(-1.3, 0.0, 1.3, 0.62, brown)
    fr.rect(-1.3, 1.02, 1.3, 1.16, red)
    fr.rect(-1.3, 2.62, 1.3, 3.1, white)
    fr.rect(-0.5, 0.86, 0.5, 0.96, A.c8((0.1, 0.1, 0.11), 0))
    fr.text(0, 0.91, 'G M C', 0.07, A.c8((0.75, 0.75, 0.76), 0))
    fr.ellipse(0.62, 0.62, 0.11, 0.11, A.c8((0.05, 0.16, 0.45), 0))
    fr.text(0.62, 0.62, 'MTA', 0.08, A.c8((0.9, 0.9, 0.9), 0))
    fr.text(-0.82, 1.09, D['number'], 0.1, A.c8((0.95, 0.95, 0.95), 0))
    rr.rect(-1.3, 0.0, 1.3, 3.1, tan)
    rr.rect(-1.3, 0.0, 1.3, 0.62, brown)
    rr.rect(-1.3, 1.36, 1.3, 1.56, red)
    rr.rect(-1.3, 2.62, 1.3, 3.1, white)
    louvres(rr, -0.9, 0.9, 0.66, 1.3, 9, A.c8((0.05, 0.05, 0.05), 0), A.c8((0.35, 0.33, 0.30), 0))
    rr.rect(-0.32, 2.66, 0.32, 2.88, dark)
    rr.text(0, 2.77, 'M10', 0.16, A.c8((1.0, 0.95, 0.85), 0))
    rr.text(-0.75, 1.46, D['number'], 0.12, A.c8((0.95, 0.95, 0.95), 0))
    x0, y0, w, h = TD.R['sign']
    d = ImageDraw.Draw(img)
    d.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=(6, 6, 6, 0))
    d.rectangle([x0 + 8, y0 + 10, x0 + w - 9, y0 + h - 11], fill=(16, 15, 13, 0))
    d.text((x0 + 70, y0 + h / 2), 'M10', font=A.font(54), fill=(255, 238, 205, 0), anchor='mm')
    d.text((x0 + 300, y0 + h / 2), 'CENTRAL PARK WEST', font=A.font(34, cond=True), fill=(255, 238, 205, 0), anchor='mm')
    common(A, img, D)
    return img


def boxtruck(A, img, D):
    body = A.base_regions(img, D)
    red = body
    white = A.c8(D['paint2'], 0)
    dark = A.c8((0.012, 0.014, 0.017), 0)
    navy = A.c8((0.05, 0.08, 0.22), 0)
    gold = A.c8((0.75, 0.52, 0.12), 0)
    L, H = D['L'], D['H']
    sl, sr, fr, rr = regs(A, img, D)
    for g, right in ((sl, False), (sr, True)):
        g.rect(0, 0, L, H, red)
        g.rect(3.3, 0, L, H, white)
        g.rect(3.3, 0, L, 1.04, A.c8((0.03, 0.03, 0.03), 0))
        g.rect(3.42, 1.06, L - 0.04, 1.16, A.c8((0.62, 0.62, 0.6), 0))
        g.rect(3.42, 3.42, L - 0.04, 3.52, A.c8((0.62, 0.62, 0.6), 0))
        for s in [3.42 + i * 0.62 for i in range(9)]:
            g.line([(s, 1.16), (s, 3.42)], A.c8((0.72, 0.72, 0.7), 0), 1)
        cx = (3.42 + 8.36) / 2
        g.rect(3.7, 2.05, 8.1, 2.12, navy)
        g.text(cx, 2.6, 'KOVACS BROS.', 0.52, navy, cond=True, sx=1.15)
        g.text(cx, 1.80, 'BAKERY  ·  EST. 1931', 0.22, gold, cond=True)
        g.text(cx, 1.42, 'ATLANTIC AVE  BROOKLYN, N.Y.  (718) 555-0142', 0.12, navy, cond=True)
        g.line([(1.86, 0.70), (1.86, 2.36)], A.shade(red, 0.4), 2)
        g.line([(3.18, 0.70), (3.18, 2.36)], A.shade(red, 0.4), 2)
        g.rect(2.82 if not right else 2.82, 1.42, 2.98, 1.46, A.c8((0.6, 0.6, 0.6), 0))
        g.text(2.5, 1.0, 'N.Y.S. D.O.T. 41207', 0.05, A.c8((0.9, 0.9, 0.9), 0), cond=True)
        g.rect(0.1, 1.05, 1.80, 1.12, A.c8((0.55, 0.55, 0.56), 0))
        g.text(1.0, 1.15, 'GMC', 0.1, A.c8((0.75, 0.75, 0.76), 0))
    fr.rect(-1.25, 0.4, 1.25, 1.7, red)
    fr.rect(-0.62, 0.62, 0.62, 1.22, A.c8((0.55, 0.56, 0.58), 0))
    for k in range(6):
        z = 0.68 + k * 0.09
        fr.rect(-0.58, z, 0.58, z + 0.045, A.c8((0.05, 0.05, 0.05), 0))
    fr.rect(-0.62, 1.12, 0.62, 1.22, A.c8((0.62, 0.63, 0.65), 0))
    fr.text(0, 1.17, 'G M C', 0.08, A.c8((0.55, 0.06, 0.05), 0))
    fr.rect(-0.95, 0.95, -0.66, 1.10, A.c8((0.1, 0.1, 0.1), 0))
    fr.rect(0.66, 0.95, 0.95, 1.10, A.c8((0.1, 0.1, 0.1), 0))
    rr.rect(-1.25, 0.9, 1.25, 3.6, white)
    rr.rect(-1.16, 1.04, 1.16, 3.40, A.c8((0.70, 0.71, 0.72), 0))
    for k in range(13):
        z = 1.04 + k * 0.18
        rr.line([(-1.16, z), (1.16, z)], A.c8((0.42, 0.43, 0.45), 0), 2)
    rr.rect(-0.12, 1.08, 0.12, 1.16, A.c8((0.15, 0.15, 0.15), 0))
    rr.rect(-1.25, 0.9, 1.25, 1.02, A.c8((0.03, 0.03, 0.03), 0))
    for x in range(-11, 12, 2):
        rr.rect(x * 0.1, 0.92, x * 0.1 + 0.1, 0.99, A.c8((0.75, 0.05, 0.03), 0) if x % 4 else A.c8((0.9, 0.9, 0.88), 0))
    rr.text(0, 3.0, 'KOVACS BROS. BAKERY', 0.14, navy, cond=True)
    common(A, img, D)
    return img


def garbage(A, img, D):
    body = A.base_regions(img, D)
    white = body
    green = A.c8((0.03, 0.22, 0.10), 0)
    black = A.c8((0.03, 0.03, 0.03), 0)
    gray = A.c8((0.35, 0.36, 0.36), 0)
    orange = A.c8((0.9, 0.35, 0.03), 0)
    L, H = D['L'], D['H']
    sl, sr, fr, rr = regs(A, img, D)
    for g, right in ((sl, False), (sr, True)):
        g.rect(0, 0, L, H, white)
        g.rect(0, 0, 2.32, 0.66, A.c8((0.05, 0.05, 0.05), 0))
        g.rect(2.3, 0, L, 1.1, black)
        g.rect(0.42, 0.66, 2.22, 0.74, gray)
        g.line([(0.45, 0.7), (0.45, 2.30)], A.shade(white, 0.55), 2)
        g.line([(1.75, 0.7), (1.75, 2.30)], A.shade(white, 0.55), 2)
        g.text(1.1, 1.15, D['number'], 0.17, black)
        g.text(1.1, 0.92, 'TARE 32,500  GVW 54,000', 0.045, black, cond=True)
        g.rect(2.42, 1.1, 7.42, 1.22, green)
        g.rect(2.42, 3.12, 7.42, 3.18, green)
        for s in (3.4, 4.6, 5.8, 7.0):
            g.line([(s, 1.24), (s, 3.1)], A.shade(white, 0.7), 3)
        g.ellipse(3.0, 2.25, 0.36, 0.36, A.c8((0.86, 0.86, 0.84), 0), outline=green, width=4)
        g.ellipse(3.0, 2.25, 0.27, 0.27, A.c8((0.55, 0.42, 0.12), 0))
        g.text(3.0, 2.25, 'NYC', 0.13, A.c8((0.95, 0.93, 0.85), 0))
        g.text(5.3, 2.42, 'DEPARTMENT OF SANITATION', 0.22, green, cond=True)
        g.text(5.3, 2.08, 'CITY OF NEW YORK', 0.2, green, cond=True)
        g.text(5.3, 1.62, 'KEEP NEW YORK CLEAN', 0.11, black, cond=True)
        for k in range(6):
            s = 7.55 + k * 0.28
            g.poly([(s, 1.0), (s + 0.14, 1.0), (s + 0.3, 1.16), (s + 0.16, 1.16)], orange)
        g.rect(7.46, 1.0, 9.25, 1.04, black)
    fr.rect(-1.25, 0.4, 1.25, 2.7, white)
    fr.rect(-0.62, 0.62, 0.62, 1.14, A.c8((0.12, 0.12, 0.13), 0))
    for k in range(5):
        z = 0.66 + k * 0.095
        fr.rect(-0.58, z, 0.58, z + 0.05, A.c8((0.45, 0.46, 0.48), 0))
    fr.rect(-0.3, 1.18, 0.3, 1.27, A.c8((0.1, 0.1, 0.1), 0))
    fr.text(0, 1.225, 'M A C K', 0.07, A.c8((0.8, 0.8, 0.8), 0))
    fr.text(-0.75, 1.35, D['number'], 0.11, black)
    fr.rect(-1.25, 0.4, 1.25, 0.5, black)
    rr.rect(-1.25, 0.8, 1.25, 2.4, white)
    rr.rect(-1.0, 0.95, 1.0, 1.85, A.c8((0.02, 0.02, 0.02), 0))
    rr.rect(-0.95, 1.55, 0.95, 1.82, A.c8((0.10, 0.10, 0.10), 0))
    rr.rect(-1.0, 1.85, 1.0, 1.95, gray)
    for k in range(10):
        x = -1.25 + k * 0.25
        rr.poly([(x, 2.25), (x + 0.12, 2.25), (x + 0.24, 2.37), (x + 0.12, 2.37)], orange)
    rr.text(0, 2.1, 'STAY BACK 25 FT', 0.08, black, cond=True)
    rr.text(0.0, 0.88, D['number'], 0.06, black)
    common(A, img, D)
    return img


def paint(D, A):
    img = Image.new('RGBA', (TD.ATLAS_SIZE, TD.ATLAS_SIZE), (255, 255, 255, 255))
    return {'bus': bus, 'boxtruck': boxtruck, 'garbage': garbage}[D['kind']](A, img, D)
