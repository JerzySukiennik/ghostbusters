# Big traffic vehicles (GMC RTS bus, box truck, DSNY rear loader): rounded-section lofts with wheel arches, textured caps, lamps and wheels; LOD 0/1/2.
import math
import numpy as np
import tr_designs as TD
import tr_car
from tr_car import fquad, rquad
from tr_mesh import Mesh, uv_rect, uv_point, grid, face_normal

BR = TD.BIG_R
UVW = uv_point(BR['white'])
UVF = uv_point(BR['white_fixed'])
UVK = uv_point(BR['black'])
UVP = uv_point(BR['paint'])
UVP2 = uv_point(BR['paint2'])
LOD = {0: dict(arch=7, wseg=22, detail=2), 1: dict(arch=4, wseg=12, detail=1), 2: dict(arch=2, wseg=8, detail=0)}
FACES = {
    'front': ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1), (0, -1, 0)),
    'rear': ((0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1), (0, 1, 0)),
    'left': ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1), (1, 0, 0)),
    'right': ((0, 0, 0), (0, 1, 0), (0, 1, 1), (0, 0, 1), (-1, 0, 0)),
    'top': ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1), (0, 0, 1)),
    'bottom': ((0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0), (0, 0, -1)),
}


def tup(u):
    return (float(u[0]), float(u[1]))


class Big:
    def __init__(self, D, lod):
        self.D = D
        self.lod = lod
        self.cfg = LOD[lod]
        self.sc = D['s_fa'] + D['wb'] / 2
        self.hw = D['W'] / 2
        self.meta = {}
        self.lights = []
        self.hull = []

    def P(self, x, s, z):
        return np.array([x, s - self.sc, z], float)

    def car(self, p):
        return float(p[0]), float(p[1] + self.sc), float(p[2])

    def uvm(self, mode, p):
        if isinstance(mode, tuple):
            if mode[0] == 'sign':
                x, s, z = self.car(p)
                return tup(uv_rect(BR['sign'], np.clip((x + self.hw) / (2 * self.hw), 0, 1), np.clip((z - mode[1]) / (mode[2] - mode[1]), 0, 1)))
            return mode
        x, s, z = self.car(p)
        D = self.D
        if mode == 'side':
            fu = s / D['L'] if x >= 0 else 1 - s / D['L']
            return tup(uv_rect(BR['side_l' if x >= 0 else 'side_r'], np.clip(fu, 0, 1), np.clip(z / D['H'], 0, 1)))
        if mode == 'front':
            z0, z1 = D['front_zr']
            return tup(uv_rect(BR['front'], np.clip((x + self.hw) / (2 * self.hw), 0, 1), np.clip((z - z0) / (z1 - z0), 0, 1)))
        if mode == 'rear':
            z0, z1 = D['rear_zr']
            return tup(uv_rect(BR['rear'], np.clip((self.hw - x) / (2 * self.hw), 0, 1), np.clip((z - z0) / (z1 - z0), 0, 1)))
        return {'paint': UVP, 'paint2': UVP2, 'white': UVW, 'fixed': UVF, 'black': UVK}[mode]

    def poly(self, m, pts, slot, uvs, want):
        keep = [0]
        for i in range(1, len(pts)):
            if np.linalg.norm(pts[i] - pts[keep[-1]]) > 1e-6:
                keep.append(i)
        if len(keep) > 2 and np.linalg.norm(pts[keep[-1]] - pts[keep[0]]) < 1e-6:
            keep.pop()
        if len(keep) < 3:
            return
        pts = [pts[i] for i in keep]
        uvs = [uvs[i] for i in keep]
        n = face_normal(pts)
        if np.linalg.norm(n) < 1e-9:
            return
        if np.dot(n, want) < 0:
            pts, uvs = pts[::-1], uvs[::-1]
        b = m.vert(np.array(pts))
        m.face(list(range(b, b + len(pts))), slot, uvs)

    def bx(self, m, s0, s1, x0, x1, z0, z1, slot, mode='white', skip=()):
        x0, x1 = min(x0, x1), max(x0, x1)
        for k, f in FACES.items():
            if k in skip:
                continue
            pts = [self.P(x0 + (x1 - x0) * a, s0 + (s1 - s0) * b, z0 + (z1 - z0) * c) for a, b, c in f[:4]]
            sl = slot[k] if isinstance(slot, dict) else slot
            md = mode[k] if isinstance(mode, dict) else mode
            if sl is None:
                continue
            self.poly(m, pts, sl, [self.uvm(md, p) for p in pts], np.array(f[4], float))

    def bx2(self, m, s0, s1, xa, xb, z0, z1, slot, mode='white', skip=()):
        for sx in (1, -1):
            self.bx(m, s0, s1, sx * xa, sx * xb, z0, z1, slot, mode, skip)

    def bottom(self, s, base, arches):
        z = base
        for a0, a1, Ra, cz in arches:
            d = max(0.0, a0 - s, s - a1)
            if d <= Ra + 1e-6:
                z = max(z, cz + math.sqrt(max(0.0, Ra * Ra - d * d)))
        return z

    def arch_stations(self, arches):
        out = []
        n = self.cfg['arch']
        for a0, a1, Ra, cz in arches:
            out.append(a0 - Ra - 0.003)
            for k in range(n + 1):
                out.append(a0 - Ra * math.cos(k * math.pi / 2 / n))
            for k in range(n + 1):
                out.append(a1 + Ra * math.sin(k * math.pi / 2 / n))
            out.append(a1 + Ra + 0.003)
        return out

    @staticmethod
    def clamp(pr, zb):
        out = [pr[0], pr[1]]
        for k in range(2, len(pr)):
            x, z = pr[k]
            out.append((x, max(z, out[-1][1] + 0.003)))
        return out

    def loft(self, m, stations, hp, off, slot_fn, front=None, rear=None, hull_idx=()):
        st = sorted(set(round(s, 5) for s in stations))
        rings, halves = [], []
        K = None
        for s in st:
            h = hp(s)
            K = len(h)
            full = h + [(-x, z) for x, z in reversed(h[1:-1])]
            rings.append([self.P(x, s + off(s, x, z), z) for x, z in full])
            halves.append(rings[-1][:K])
        P = np.array(rings)
        cache = {}

        def sf(j, i, q):
            band = i if i < K - 1 else 2 * K - 3 - i
            x, s, z = self.car(q.mean(axis=0))
            r = slot_fn(x, s, z, face_normal(q), band)
            cache[(j, i)] = r
            return r[0] if r else None

        def uf(j, i, q, slot):
            return [self.uvm(cache[(j, i)][1], p) for p in q]
        grid(m, P, sf, uf, closed_u=True)
        for cap, half, want in ((front, halves[0], (0, -1, 0)), (rear, halves[-1], (0, 1, 0))):
            if cap is None:
                continue
            for k in range(K - 1):
                a, b = half[k], half[k + 1]
                ma, mb = a * [-1, 1, 1], b * [-1, 1, 1]
                pts = [ma, a, b, mb]
                zm = (a[2] + b[2]) / 2
                r = cap(k, zm)
                if r is None:
                    continue
                self.poly(m, pts, r[0], [self.uvm(r[1], p) for p in pts], np.array(want, float))
        for j in (0, len(st) - 1):
            for k in hull_idx:
                p = halves[j][k]
                self.hull.append(p)
                self.hull.append(p * [-1, 1, 1])
        return st, halves

    def wheel(self, right=False):
        return tr_car.Car.wheel(self, right)

    def wheels(self, axles):
        D = self.D
        out = {}
        for name, s, track in axles:
            for side, x in (('L', track / 2), ('R', -track / 2)):
                key = 'Wheel_' + name[0] + side + name[1:]
                out[key] = (self.wheel(right=x < 0), self.P(x, s, D['tire_r']))
        return out

    def build(self):
        parts = {k: Mesh() for k in ('Body', 'HeadlightEmit', 'TailLightEmit')}
        kind = self.D['kind']
        wheels = getattr(self, kind)(parts)
        self.meta['lights'] = self.lights
        self.meta.update(sc=self.sc, length=self.D['L'], width=self.D['W'], height=self.D['H'])
        return parts, wheels

    def collider_points(self):
        pts = np.array(self.hull)
        uniq = []
        for p in pts:
            if all(np.linalg.norm(p - q) > 0.02 for q in uniq):
                uniq.append(p)
        return np.array(uniq[:64])

    def bus(self, parts):
        D, c = self.D, self.cfg
        L, hw = D['L'], self.hw
        body, head, tail = parts['Body'], parts['HeadlightEmit'], parts['TailLightEmit']
        sa_f, sa_r = D['s_fa'], D['s_fa'] + D['wb']
        Ra, cz = D['tire_r'] + 0.07, D['tire_r'] + 0.03
        arches = [(sa_f, sa_f, Ra, cz), (sa_r, sa_r, Ra, cz)]
        G0, G1 = 0.40, L - 0.95

        def plan(s):
            f = 1.0
            if s < 0.55:
                f -= 0.15 * (1 - s / 0.55) ** 2
            if s > L - 0.5:
                f -= 0.13 * (1 - (L - s) / 0.5) ** 2
            return f

        def hp(s):
            zb = self.bottom(s, 0.32, arches)
            w = hw * plan(s)
            pr = [(0.0, zb), (w - 0.07, zb), (w, zb + 0.07), (w, 0.96), (w - 0.002, 1.18), (w - 0.004, 1.48), (w - 0.006, 1.62), (w - 0.035, 2.62),
                  (w - 0.055, 2.75), (w - 0.12, 2.91), (w - 0.30, 3.015), (w - 0.62, 3.055), (0.0, 3.065)]
            return self.clamp(pr, zb)

        def off(s, x, z):
            d = 0.0
            if s < 0.7:
                r = 0.0
                if z > 1.15:
                    r += (min(z, 2.62) - 1.15) * 0.10
                if z > 2.62:
                    r += (z - 2.62) * 0.45
                if z < 0.55:
                    r += (0.55 - z) * 0.25
                d += r * (1 - s / 0.7)
            if s > L - 0.6:
                r = 0.0
                if z > 2.2:
                    r -= (z - 2.2) * 0.12
                if z < 0.6:
                    r -= (0.6 - z) * 0.2
                d += r * (1 - (L - s) / 0.6)
            return d

        def sl(x, s, z, n, band):
            if n[2] < -0.5:
                return 'Under', 'white'
            if n[2] > 0.6:
                return 'Paint', 'paint'
            if band == 6 and G0 < s < G1:
                return 'Glass', 'white'
            return 'Paint', 'side'

        def fc(k, zm):
            if 1.18 < zm < 2.62:
                return 'Glass', 'white'
            if 2.62 < zm < 2.91:
                return 'SpecialEmit', ('sign', 2.62, 2.91)
            return 'Paint', 'front'

        def rc(k, zm):
            if 1.62 < zm < 2.62:
                return 'Glass', 'white'
            return 'Paint', 'rear'
        st = [0.0, 0.06, 0.18, 0.35, G0, 0.55, 0.7, G1, L - 0.6, L - 0.4, L - 0.2, L - 0.08, L] + self.arch_stations(arches)
        if self.lod == 2:
            st = [0.0, 0.18, G0, 0.7, G1, L - 0.4, L] + self.arch_stations(arches)
        self.loft(body, st, hp, off, sl, fc, rc, hull_idx=(1, 3, 7, 10))
        self.bx(body, -0.05, 0.16, -1.06, 1.06, 0.34, 0.52, 'Trim', 'black', skip=('rear',))
        self.bx(body, L - 0.16, L + 0.05, -1.06, 1.06, 0.34, 0.52, 'Trim', 'black', skip=('front',))
        for sx in (1, -1):
            if c['detail'] > 0:
                fquad(body, self.P, sx * 0.79, -0.003, 0.80, 0.29, 0.10, 'Trim', BR['black'])
            for x in (0.66, 0.92):
                fquad(head, self.P, sx * x, -0.007, 0.80, 0.11, 0.065, 'HeadlightEmit', BR['lens_rect'])
                self.lights.append(('head', [sx * x, 0.80, 0.0]))
            fquad(body, self.P, sx * 0.92, -0.005, 0.95, 0.08, 0.03, 'IndicatorEmit', BR['lens_amber'])
            rquad(tail, self.P, sx * 1.0, L + 0.006, 0.98, 0.07, 0.24, 'TailLightEmit', BR['lens_tail'])
            self.lights.append(('tail', [sx * 1.0, 0.98, L]))
            rquad(body, self.P, sx * 1.0, L + 0.006, 0.66, 0.07, 0.05, 'IndicatorEmit', BR['lens_amber'])
            if c['detail'] > 0:
                self.bx(body, -0.36, -0.31, sx * 1.26, sx * 1.38, 2.0, 2.38, 'Trim', 'black')
                self.bx(body, -0.33, 0.28, sx * 1.18, sx * 1.30, 2.40, 2.44, 'Chrome', 'white')
        fquad(body, self.P, 0, -0.006, 0.66, 0.15, 0.075, 'Plate', BR['plate'])
        rquad(body, self.P, 0, L + 0.005, 0.70, 0.15, 0.075, 'Plate', BR['plate'])
        if c['detail'] > 0:
            self.bx(body, L - 2.9, L - 0.7, -0.95, 0.95, 3.0, 3.28, 'Paint', 'paint', skip=('bottom',))
        self.meta['sign'] = [0.0, 2.77, 0.30]
        return self.wheels([('F', sa_f, D['track_f']), ('R', sa_r, D['track_r'])])

    def boxtruck(self, parts):
        D, c = self.D, self.cfg
        body, head, tail = parts['Body'], parts['HeadlightEmit'], parts['TailLightEmit']
        sa_f, sa_r = D['s_fa'], D['s_fa'] + D['wb']
        Ra, cz = D['tire_r'] + 0.07, D['tire_r'] + 0.03
        arches = [(sa_f, sa_f, Ra, cz)]
        hf, hh, hc = 1.13, 0.86, 1.18
        S0, SH, SC, SE = 0.10, 1.80, 2.10, 3.30
        B0, B1 = 3.42, 8.36

        def hp(s):
            if s < SH + 0.01:
                zb = self.bottom(s, 0.62, arches)
                dz = 0.06 * max(0.0, 1 - (s - S0) / 0.5)
                f = 0.97 if s < S0 + 0.01 else 1.0
                pr = [(0.0, zb), (hf - 0.05, zb), (hf, zb + 0.05), (hf, 1.05), (hf - 0.03, 1.20), (hf - 0.12, 1.24), (hh, 1.26), (hh, 1.48 - dz),
                      (hh - 0.06, 1.56 - dz), (hh - 0.3, 1.595 - dz), (0.0, 1.60 - dz)]
                pr = [(x * f, z) for x, z in pr]
            else:
                zb = 0.72
                pr = [(0.0, zb), (hc - 0.05, zb), (hc, zb + 0.05), (hc, 1.05), (hc, 1.20), (hc, 1.40), (hc - 0.005, 1.62), (hc - 0.07, 2.36),
                      (hc - 0.12, 2.50), (hc - 0.35, 2.565), (0.0, 2.58)]
            return self.clamp(pr, zb)

        def sl(x, s, z, n, band):
            if n[2] < -0.5:
                return 'Under', 'white'
            if SH - 0.01 < s < SC + 0.01 and band >= 7:
                return 'Glass', 'white'
            if SC < s < SE - 0.06 and band == 6:
                return 'Glass', 'white'
            if n[2] > 0.6:
                return 'Paint', 'paint'
            return 'Paint', 'side'

        def rc(k, zm):
            if k == 6:
                return 'Glass', 'white'
            return 'Paint', 'paint'
        st = [S0, S0 + 0.05, SH, SC, SE - 0.06, SE] + self.arch_stations(arches)
        self.loft(body, st, hp, lambda s, x, z: 0.0, sl, lambda k, zm: ('Paint', 'front'), rc, hull_idx=(1, 3, 7, 9))
        self.bx(body, B0, B1, -1.22, 1.22, 1.02, 3.55, {'front': 'Paint', 'rear': 'Paint', 'left': 'Paint', 'right': 'Paint', 'top': 'Paint', 'bottom': 'Under'},
                {'front': 'fixed', 'rear': 'rear', 'left': 'side', 'right': 'side', 'top': 'fixed', 'bottom': 'white'})
        for s in (B0, B1):
            for x in (1.22, -1.22):
                for z in (1.02, 3.55):
                    self.hull.append(self.P(x, s, z))
        self.bx(body, -0.02, 0.12, -1.18, 1.18, 0.45, 0.70, 'Chrome', 'white')
        self.bx(body, 1.5, B1 - 0.06, -0.48, 0.48, 0.60, 1.02, 'Under', 'white', skip=('top',))
        self.bx(body, B1 - 0.06, B1 + 0.06, -1.10, 1.10, 0.52, 0.66, 'Trim', 'black')
        for sx in (1, -1):
            if c['detail'] > 0:
                fquad(body, self.P, sx * 0.80, S0 - 0.004, 1.02, 0.155, 0.11, 'Chrome', BR['white'])
            fquad(head, self.P, sx * 0.80, S0 - 0.008, 1.02, 0.13, 0.09, 'HeadlightEmit', BR['lens_rect'])
            self.lights.append(('head', [sx * 0.80, 1.02, S0]))
            fquad(body, self.P, sx * 0.80, S0 - 0.006, 0.84, 0.08, 0.03, 'IndicatorEmit', BR['lens_amber'])
            rquad(tail, self.P, sx * 1.02, B1 + 0.006, 1.18, 0.09, 0.06, 'TailLightEmit', BR['lens_tail'])
            self.lights.append(('tail', [sx * 1.02, 1.18, B1]))
            rquad(body, self.P, sx * 1.10, B1 + 0.006, 3.47, 0.04, 0.03, 'IndicatorEmit', BR['lens_amber'])
            if c['detail'] > 0:
                self.bx(body, 2.14, 2.20, sx * 1.32, sx * 1.40, 1.75, 2.25, 'Trim', 'black')
                self.bx(body, 2.16, 2.19, sx * 1.17, sx * 1.33, 2.18, 2.21, 'Chrome', 'white')
                self.bx(body, 2.16, 2.19, sx * 1.17, sx * 1.33, 1.80, 1.83, 'Chrome', 'white')
                self.bx(body, sa_r + 0.62, sa_r + 0.64, sx * 0.75, sx * 1.15, 0.20, 0.75, 'Trim', 'black')
                self.bx(body, B1 - 0.03, B1 + 0.03, sx * 1.19, sx * 1.235, 1.0, 3.57, 'Chrome', 'white')
                self.bx(body, B1 - 0.06, B1, sx * 0.6, sx * 0.66, 0.66, 1.02, 'Trim', 'black')
        if c['detail'] > 0:
            self.bx(body, 3.6, 4.4, 0.55, 1.0, 0.62, 0.95, 'Chrome', 'white')
            for x in (-0.3, 0.0, 0.3):
                self.bx(body, SC + 0.02, SC + 0.08, x - 0.05, x + 0.05, 2.575, 2.625, 'IndicatorEmit', tup(uv_rect(BR['lens_amber'], 0.5, 0.5)))
        fquad(body, self.P, 0, -0.025, 0.575, 0.15, 0.075, 'Plate', BR['plate'])
        rquad(body, self.P, 0, B1 + 0.005, 1.20, 0.15, 0.075, 'Plate', BR['plate'])
        return self.wheels([('F', sa_f, D['track_f']), ('R', sa_r, D['track_r'])])

    def garbage(self, parts):
        D, c = self.D, self.cfg
        body, head, tail = parts['Body'], parts['HeadlightEmit'], parts['TailLightEmit']
        sa_f, sa_r = D['s_fa'], D['s_fa'] + D['wb']
        r1, r2 = sa_r - D['tandem'] / 2, sa_r + D['tandem'] / 2
        Ra, cz = D['tire_r'] + 0.08, D['tire_r'] + 0.03
        arches = [(sa_f, sa_f, Ra, cz)]
        hc = 1.22
        C0, CE = 0.08, 2.30
        B0, B1, BE = 2.42, 7.40, 9.25

        def hp_cab(s):
            zb = self.bottom(s, 0.62, arches)
            w = hc * (1 - 0.05 * max(0.0, 1 - (s - C0) / 0.3) ** 2)
            pr = [(0.0, zb), (w - 0.05, zb), (w, zb + 0.05), (w, 1.05), (w, 1.25), (w, 1.40), (w - 0.005, 1.50), (w - 0.06, 2.35), (w - 0.12, 2.50),
                  (w - 0.35, 2.57), (0.0, 2.585)]
            return self.clamp(pr, zb)

        def off_cab(s, x, z):
            r = 0.0
            if z > 1.5:
                r += (min(z, 2.35) - 1.5) * 0.07
            if z > 2.35:
                r += (z - 2.35) * 0.6
            return r * max(0.0, 1 - (s - C0) / 0.35)

        def sl_cab(x, s, z, n, band):
            if n[2] < -0.5:
                return 'Under', 'white'
            if band == 6 and 0.30 < s < 2.22:
                return 'Glass', 'white'
            if n[2] > 0.6:
                return 'Paint', 'paint'
            return 'Paint', 'side'

        def fc(k, zm):
            if k == 6:
                return 'Glass', 'white'
            return 'Paint', 'front'
        st = [C0, C0 + 0.06, 0.33, 0.43, 2.20, CE] + self.arch_stations(arches)
        self.loft(body, st, hp_cab, off_cab, sl_cab, fc, lambda k, zm: ('Paint', 'paint'), hull_idx=(1, 3, 7, 9))

        def body_z(s):
            if s <= B1 + 0.01:
                return 1.08, 3.335
            T = [(7.46, 1.00, 3.45), (8.2, 0.92, 3.30), (8.9, 0.88, 2.75), (BE, 0.88, 2.30)]
            for (sa, ba, ta), (sb, bb, tb) in zip(T, T[1:]):
                if s <= sb + 1e-6:
                    t = max(0.0, (s - sa) / (sb - sa))
                    return ba + (bb - ba) * t, ta + (tb - ta) * t
            return T[-1][1], T[-1][2]
        base = [(0.0, 1.08), (1.20, 1.08), (1.25, 1.13), (1.25, 2.85), (1.20, 3.08), (1.05, 3.24), (0.75, 3.31), (0.35, 3.33), (0.0, 3.335)]

        def hp_body(s):
            zb, zt = body_z(s)
            k = (zt - zb) / (3.335 - 1.08)
            f = 0.97 if s < B0 + 0.01 else 1.0
            return [(x * f, zb + (z - 1.08) * k) for x, z in base]

        def sl_body(x, s, z, n, band):
            if n[2] < -0.5:
                return 'Under', 'white'
            if n[2] > 0.6:
                return 'Paint', 'paint'
            return 'Paint', 'side'
        st = [B0, B0 + 0.04, B1, 7.46, 8.2, 8.9, BE]
        self.loft(body, st, hp_body, lambda s, x, z: 0.0, sl_body, lambda k, zm: ('Paint', 'paint'), lambda k, zm: ('Paint', 'rear'), hull_idx=(1, 3, 5, 8))
        self.bx(body, -0.02, 0.10, -1.22, 1.22, 0.46, 0.70, 'Trim', 'black')
        self.bx(body, 1.9, 9.0, -0.5, 0.5, 0.62, 1.08, 'Under', 'white', skip=('top',))
        for sx in (1, -1):
            if c['detail'] > 0:
                fquad(body, self.P, sx * 0.91, C0 - 0.003, 0.86, 0.24, 0.10, 'Trim', BR['black'])
            for x in (0.80, 1.02):
                fquad(head, self.P, sx * x, C0 - 0.007, 0.86, 0.10, 0.065, 'HeadlightEmit', BR['lens_rect'])
                self.lights.append(('head', [sx * x, 0.86, C0]))
            fquad(body, self.P, sx * 1.02, C0 - 0.005, 1.02, 0.07, 0.03, 'IndicatorEmit', BR['lens_amber'])
            rquad(tail, self.P, sx * 1.06, BE + 0.006, 1.08, 0.08, 0.09, 'TailLightEmit', BR['lens_tail'])
            self.lights.append(('tail', [sx * 1.06, 1.08, BE]))
            self.bx(body, 9.18, 9.45, sx * 0.55, sx * 1.15, 0.52, 0.60, 'Trim', 'black')
            if c['detail'] > 0:
                self.bx(body, 0.14, 0.20, sx * 1.36, sx * 1.44, 1.70, 2.25, 'Trim', 'black')
                self.bx(body, 0.16, 0.19, sx * 1.20, sx * 1.38, 2.15, 2.18, 'Chrome', 'white')
                self.bx(body, 0.16, 0.19, sx * 1.20, sx * 1.38, 1.75, 1.78, 'Chrome', 'white')
                self.bx(body, BE + 0.01, BE + 0.04, sx * 1.12, sx * 1.15, 1.05, 2.0, 'Chrome', 'white')
                self.bx(body, 9.05, 9.15, sx * 0.86, sx * 0.98, 2.40, 2.50, 'IndicatorEmit', tup(uv_rect(BR['lens_amber'], 0.5, 0.5)), skip=('bottom',))
        fquad(body, self.P, 0, -0.025, 0.58, 0.15, 0.075, 'Plate', BR['plate'])
        rquad(body, self.P, 0, BE + 0.005, 1.82, 0.15, 0.075, 'Plate', BR['plate'])
        return self.wheels([('F', sa_f, D['track_f']), ('R', r1, D['track_r']), ('R2', r2, D['track_r'])])
