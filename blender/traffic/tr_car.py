# Car builder: lofted lower body with wheel wells, greenhouse loft, textured caps, bumpers, lamps, wheels, roof signs; LOD 0/1/2.
import math
import numpy as np
import tr_designs as TD
from tr_mesh import Mesh, curve, lin, uv_rect, uv_point, grid, fan, quad, box, sweep, lathe_x, disk_x, face_normal

LOD = {0: dict(ds=0.11, arch=11, gds=0.12, wseg=22, bump=1, detail=2),
       1: dict(ds=0.32, arch=5, gds=0.38, wseg=12, bump=1, detail=1),
       2: dict(ds=1.2, arch=3, gds=2.0, wseg=8, bump=0, detail=0)}

R = TD.R
UVW = uv_point(R['white'])
UVP = uv_point(R['paint'])
UVP2 = uv_point(R['paint2'])


def fquad(m, P, x, s, z, w2, h2, slot, rect):
    u0, v0 = uv_rect(rect, 0, 0)
    u1, v1 = uv_rect(rect, 1, 1)
    quad(m, P(x - w2, s, z - h2), P(x + w2, s, z - h2), P(x + w2, s, z + h2), P(x - w2, s, z + h2), slot, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)])


def rquad(m, P, x, s, z, w2, h2, slot, rect):
    u0, v0 = uv_rect(rect, 0, 0)
    u1, v1 = uv_rect(rect, 1, 1)
    quad(m, P(x + w2, s, z - h2), P(x - w2, s, z - h2), P(x - w2, s, z + h2), P(x + w2, s, z + h2), slot, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)])


def order_z(pref, lo, hi, gap):
    out = []
    n = len(pref)
    for i, p in enumerate(pref):
        lo_i = (out[-1] if out else lo) + gap
        hi_i = hi - gap * (n - i)
        out.append(min(max(p, lo_i), max(lo_i, hi_i)))
    return out


class Car:
    def __init__(self, D, lod):
        self.D = D
        self.cfg = LOD[lod]
        self.lod = lod
        self.top = curve(D['top'])
        self.bot = curve(D['bottom'])
        self.hw = curve(D['hw'])
        self.zm = lin(D['zm'])
        self.crown = curve(D['crown'])
        self.sc = D['s_fa'] + D['wb'] / 2
        self.cz = D['tire_r'] + 0.035
        self.wi = D['track'] / 2 - D['tire_w'] / 2 - 0.035
        self.parts = {}
        self.meta = {}

    def P(self, x, s, z):
        return np.array([x, s - self.sc, z], float)

    def side_uv(self, p):
        s = p[1] + self.sc
        L = self.D['L']
        side = 'side_l' if p[0] >= 0 else 'side_r'
        fu = s / L if p[0] >= 0 else 1 - s / L
        u, v = uv_rect(R[side], np.clip(fu, 0, 1), np.clip(p[2] / TD.SIDE_Z, 0, 1))
        return (float(u), float(v))

    def front_uv(self, p):
        u, v = uv_rect(R['front'], np.clip((p[0] + 1) / 2, 0, 1), np.clip((p[2] - 0.2) / 1.0, 0, 1))
        return (float(u), float(v))

    def rear_uv(self, p):
        u, v = uv_rect(R['rear'], np.clip((1 - p[0]) / 2, 0, 1), np.clip((p[2] - 0.2) / 1.0, 0, 1))
        return (float(u), float(v))

    def arch_at(self, s):
        for k, (sa, Ra, fl) in enumerate(self.D['arches']):
            d = s - sa
            if abs(d) <= Ra + 1e-9:
                return k, self.cz + math.sqrt(max(0.0, Ra * Ra - d * d)), fl
        return None

    def stations(self):
        D, c = self.D, self.cfg
        b0, b1 = D['body']
        ss = list(np.arange(b0, b1, c['ds'])) + [b0, b1]
        gh = D['gh']
        feats = [gh['ws0'], gh['bl1']]
        for a, b in gh['windows']:
            feats += [a, b]
        ss += feats
        arches = [(sa - Ra, sa + Ra) for sa, Ra, fl in D['arches']]
        ss = sorted(set(round(float(s), 4) for s in ss if not any(a - 0.02 <= s <= b + 0.02 for a, b in arches)))
        st = [(s, None) for s in ss]
        for k, (sa, Ra, fl) in enumerate(D['arches']):
            n = c['arch']
            st.append((sa - Ra - 1e-4, 'out'))
            st.append((sa - Ra, 'edge'))
            for t in np.linspace(0, math.pi, n + 2)[1:-1]:
                st.append((sa - Ra * math.cos(t), 'in'))
            st.append((sa + Ra, 'edge'))
            st.append((sa + Ra + 1e-4, 'out'))
        st.sort(key=lambda a: a[0])
        return st

    def half_profile(self, s, state):
        D = self.D
        zb, zt, w, zm, cr = float(self.bot(s)), float(self.top(s)), float(self.hw(s)), float(self.zm(s)), float(self.crown(s))
        sh, tb, rk = D['shoulder'], D['tumble'], D['rocker']
        wb = w - 0.035
        wt = w - tb
        zr = zb + rk
        H = [(0.0, zb), (wb - 0.10, zb), (wb, zb + 0.045)]
        arch = self.arch_at(s) if state in ('in', 'edge') else None
        if arch is not None:
            k, az, fl = arch
            H[1] = (self.wi - 0.05, zb)
            H[2] = (self.wi, zb + 0.02)
            H.append((self.wi, az))
            H.append((w - 0.004 + fl, az + 0.002))
            za = az + 0.002
        else:
            H.append((wb + 0.006, zr))
            H.append((w - 0.006, zr + 0.003))
            za = zr + 0.003
        z5, z6, z7, z8 = order_z([zm - 0.12, zm, zt - sh * 1.15, zt - sh * 0.3], za, zt, max(0.004, 0.06 * (zt - za)))
        H += [(w - 0.002, z5), (w, z6), (w - tb * 0.55, z7), (wt - sh * 0.3, z8),
              (wt - sh, zt + cr * 0.15), ((wt - sh) * 0.5, zt + cr * 0.8), (0.0, zt + cr)]
        return H

    def ring(self, s, H):
        pts = [self.P(x, s, z) for x, z in H] + [self.P(-x, s, z) for x, z in H[-2:0:-1]]
        return np.array(pts)

    def body_slot(self, band, inside):
        if band <= 1:
            return 'Under'
        if band <= 3 and inside:
            return 'Under'
        return 'Paint'

    def lower_body(self, m):
        st = self.stations()
        rings, inside = [], []
        for s, state in st:
            H = self.half_profile(s, state)
            rings.append(self.ring(s, H))
            inside.append(state in ('in', 'edge'))
        P = np.stack(rings)
        nu = P.shape[1]

        def slot_fn(j, i, q):
            band = i if i <= 10 else 21 - i
            return self.body_slot(band, inside[j] or inside[j + 1])

        def uv_fn(j, i, q, slot):
            if slot != 'Paint':
                return [UVW] * 4
            n = face_normal(q)
            if abs(n[0]) > 0.3:
                return [self.side_uv(p) for p in q]
            return [UVP] * 4
        grid(m, P, slot_fn, uv_fn, closed_u=True)
        f, r = P[0], P[-1]
        fan(m, f, f.mean(axis=0), 'Paint', self.front_uv, flip=False)
        fan(m, r, r.mean(axis=0), 'Paint', self.rear_uv, flip=True)
        self.body_rings = (st, P)

    def gh_stations(self):
        gh, c = self.D['gh'], self.cfg
        ss = list(np.arange(gh['ws0'], gh['bl1'], c['gds'])) + [gh['ws0'], gh['ws1'], gh['bl0'], gh['bl1']]
        if c['detail'] > 0:
            ss += list(np.linspace(gh['ws0'], gh['ws1'], 5 if c['detail'] > 1 else 3)) + list(np.linspace(gh['bl0'], gh['bl1'], 5 if c['detail'] > 1 else 3))
        for a, b in gh['windows']:
            ss += [a, b]
        for key in ('vinyl', 'opera'):
            if gh.get(key):
                ss += list(gh[key])
        return sorted(set(round(float(s), 4) for s in ss if gh['ws0'] <= s <= gh['bl1']))

    def roof_z(self, s, zbelt):
        gh = self.D['gh']
        if s <= gh['ws1']:
            t = (s - gh['ws0']) / (gh['ws1'] - gh['ws0'])
            return zbelt + (gh['roof'] - zbelt) * (t * (1.35 - 0.35 * t))
        if s >= gh['bl0']:
            t = (s - gh['bl0']) / (gh['bl1'] - gh['bl0'])
            return gh['roof'] + (zbelt - gh['roof']) * (t ** 1.25)
        return gh['roof']

    def gh_profile(self, s):
        D, gh = self.D, self.D['gh']
        zt, w, cr = float(self.top(s)), float(self.hw(s)), float(self.crown(s))
        wt = w - D['tumble']
        wbelt = wt - D['shoulder'] - gh['inset']
        zbelt = zt + cr * 0.15 - 0.002
        zr = self.roof_z(s, zbelt)
        span = max(1e-3, gh['roof'] - zbelt)
        wroof = gh['roof_w']
        width = lambda z: wbelt + (wroof - wbelt) * np.clip((z - zbelt) / span, 0, 1) ** 0.9
        z1 = zbelt + 0.012
        zwt = max(z1 + 0.002, zr - 0.07)
        z3 = max(zwt + 0.002, zr - 0.028)
        k = gh['crown']
        return [(wbelt, zbelt), (wbelt - 0.022, z1), (width(zwt) - 0.018, zwt), (width(z3), z3),
                (width(zr) - 0.04, zr + k * 0.3), (width(zr) * 0.5, zr + k * 0.85), (0.0, zr + k)]

    def gh_slot(self, band, s):
        gh = self.D['gh']
        inwin = any(a <= s <= b for a, b in gh['windows'])
        op = gh.get('opera')
        if op and op[0] <= s <= op[1]:
            inwin = True
        vin = gh.get('vinyl')
        vinyl = vin and vin[0] <= s <= vin[1]
        pil = {'paint': 'Paint', 'paint2': 'Paint', 'trim': 'Trim', 'chrome': 'Chrome'}
        if band == 0:
            return 'Chrome'
        if band == 1:
            return 'Glass' if inwin else pil[gh.get('pillar', 'paint')]
        if band == 2:
            return {'chrome': 'Chrome', 'trim': 'Trim', 'paint': 'Paint'}[gh.get('frame', 'chrome')]
        if band == 3:
            return 'Vinyl' if vinyl else 'Paint'
        if s < gh['ws1'] or s > gh['bl0']:
            return 'Glass'
        return 'Vinyl' if vinyl else 'Paint'

    def greenhouse(self, m):
        ss = self.gh_stations()
        rings = []
        for s in ss:
            H = self.gh_profile(s)
            rings.append(np.array([self.P(x, s, z) for x, z in H] + [self.P(-x, s, z) for x, z in H[-2::-1]]))
        P = np.stack(rings)
        roofslot = self.D['gh'].get('roof_slot') == 'Paint2'
        pillar2 = self.D['gh'].get('pillar') == 'paint2'

        def slot_fn(j, i, q):
            band = i if i <= 5 else 11 - i
            return self.gh_slot(band, 0.5 * (ss[j] + ss[j + 1]))

        def uv_fn(j, i, q, slot):
            if slot != 'Paint':
                return [UVW] * 4
            band = i if i <= 5 else 11 - i
            n = face_normal(q)
            if band >= 3 and roofslot:
                return [UVP2] * 4
            if band == 1 and pillar2:
                return [UVP2] * 4
            if abs(n[0]) > 0.3:
                return [self.side_uv(p) for p in q]
            return [UVP2 if roofslot else UVP] * 4
        grid(m, P, slot_fn, uv_fn, closed_u=False)
        self.gh_P = (ss, P)

    def bumper(self, m, B, front):
        D, c = self.D, self.cfg
        z0, z1 = B['z']
        h = z1 - z0
        d = B['d']
        sb = B['s']
        xb = float(self.hw(D['body'][0] + 0.15 if front else D['body'][1] - 0.15)) + 0.01
        th = 1.25
        rw = min(B['wrap'], 0.3)
        xm = xb - rw * math.sin(th)
        na, nm = (7, 8) if c['bump'] else (2, 2)
        sc_ = sb + (d * 0.5 if front else -d * 0.5)
        sg = 1 if front else -1
        pts = [(-(xm + rw * math.sin(f)), sc_ + sg * rw * (1 - math.cos(f))) for f in np.linspace(th, 0, na)[:-1]]
        pts += [(x, sc_) for x in np.linspace(-xm, xm, nm)]
        pts += [((xm + rw * math.sin(f)), sc_ + sg * rw * (1 - math.cos(f))) for f in np.linspace(0, th, na)[1:]]
        if not front:
            pts = pts[::-1]
        path = [self.P(x, s, (z0 + z1) / 2) for x, s in pts]
        if c['bump']:
            prof = [(-d * 0.5, -h * 0.5), (d * 0.35, -h * 0.5), (d * 0.5, -h * 0.30), (d * 0.5, -h * 0.05), (d * 0.56, 0.0), (d * 0.56, h * 0.12),
                    (d * 0.5, h * 0.18), (d * 0.5, h * 0.38), (d * 0.38, h * 0.5), (-d * 0.5, h * 0.5)]
            slots = ['Under', 'Chrome', 'Chrome', 'Trim', 'Trim', 'Trim', 'Chrome', 'Chrome', 'Chrome', 'Under']
            if D['kind'] == 'checker':
                slots = ['Under', 'Chrome', 'Chrome', 'Chrome', 'Chrome', 'Chrome', 'Chrome', 'Chrome', 'Chrome', 'Under']
        else:
            prof = [(-d * 0.5, -h * 0.5), (d * 0.5, -h * 0.5), (d * 0.5, h * 0.5), (-d * 0.5, h * 0.5)]
            slots = ['Under', 'Chrome', 'Chrome', 'Under']
        sweep(m, path, prof, lambda i: slots[i], lambda j, i, q: UVW, caps=True, cap_slot='Chrome')
        if B.get('guards') and c['detail'] > 0:
            for sx in (1, -1):
                x = 0.42 * sx
                s = sb + (-0.03 if front else 0.03)
                box(m, self.P(x, s - 0.01, (z0 + z1) / 2 + 0.03), (0.03, 0.05, h * 0.7), 'Chrome', UVW)
                box(m, self.P(x, s - 0.06, (z0 + z1) / 2 + 0.03 + h * 0.45), (0.032, 0.012, h * 0.2), 'Trim', UVW)
        pz = D['rear']['plate_z'] if not front else (z0 + z1) / 2 + 0.01
        if front and c['detail'] > 0:
            fquad(m, self.P, 0, sb - 0.008, pz, 0.15, 0.075, 'Plate', R['plate'])

    def lamps(self, parts):
        D, c = self.D, self.cfg
        b0, b1 = D['body']
        head, tail, body = parts['HeadlightEmit'], parts['TailLightEmit'], parts['Body']
        sf = b0 - 0.004
        lights = []
        for h in D['front']['heads']:
            for sx in (1, -1):
                x, z = h['x'] * sx, h['z']
                if h['shape'] == 'round':
                    r = h['r']
                    seg = 16 if c['detail'] > 1 else (10 if c['detail'] else 6)
                    ang = np.linspace(0, 2 * math.pi, seg + 1)[:-1]
                    ring = np.array([self.P(x + r * math.cos(a), sf - 0.012, z + r * math.sin(a)) for a in ang])
                    ctr = self.P(x, sf - 0.03, z)
                    uvf = lambda p, x=x, z=z, r=r: tuple(map(float, uv_rect(R['lens_round'], 0.5 + 0.5 * (p[0] - x) / r, 0.5 + 0.5 * (p[2] - z) / r)))
                    fan(head, ring, ctr, 'HeadlightEmit', uvf, flip=False)
                    if c['detail'] > 0:
                        rr = r * 1.12
                        P = []
                        for a in ang:
                            row = []
                            for dr, ds in [(-0.006, 0.012), (0.018, 0.0), (0.018, -0.045), (-0.004, -0.06)]:
                                row.append(self.P(x + (rr + dr) * math.cos(a), sf + ds, z + (rr + dr) * math.sin(a)))
                            P.append(row)
                        P = np.array(P)
                        Pc = np.concatenate([P, P[:1]])
                        grid(body, Pc, lambda j, i, q: 'Chrome', lambda j, i, q, s: [UVW] * 4, closed_u=False)
                else:
                    w2, h2 = h['w'] / 2, h['h'] / 2
                    s = sf - 0.01
                    fquad(head, self.P, x, s, z, w2, h2, 'HeadlightEmit', R['lens_rect'])
                    if c['detail'] > 0:
                        e = 0.018
                        for (xa, za, xb2, zb2) in [(x - w2 - e, z + h2, x + w2 + e, z + h2 + e), (x - w2 - e, z - h2 - e, x + w2 + e, z - h2),
                                                    (x - w2 - e, z - h2, x - w2, z + h2), (x + w2, z - h2, x + w2 + e, z + h2)]:
                            box(body, self.P((xa + xb2) / 2, s - 0.006, (za + zb2) / 2), (abs(xb2 - xa) / 2, 0.012, abs(zb2 - za) / 2), 'Chrome', UVW)
                lights.append(('head', [x, z, sf]))
        for p in D['front'].get('park', []):
            for sx in (1, -1):
                x, z, w2, h2 = p['x'] * sx, p['z'], p['w'] / 2, p['h'] / 2
                fquad(body, self.P, x, sf - 0.008, z, w2, h2, 'IndicatorEmit', R['lens_amber'])
        sr = b1 + 0.006
        for t in D['rear']['tails']:
            for sx in (1, -1):
                x, z, w2, h2 = t['x'] * sx, t['z'], t['w'] / 2, t['h'] / 2
                rquad(tail, self.P, x, sr, z, w2, h2, 'TailLightEmit', R['lens_tail'])
                if c['detail'] > 0:
                    box(tail, self.P(x, sr - 0.012, z), (w2, 0.014, h2), 'TailLightEmit', tuple(map(float, uv_rect(R['lens_tail'], 0.5, 0.5))), skip=('+y',))
                lights.append(('tail', [x, z, sr]))
        for t in D['rear'].get('rev', []):
            for sx in (1, -1):
                x, z, w2, h2 = t['x'] * sx, t['z'], t['w'] / 2, t['h'] / 2
                rquad(body, self.P, x, sr, z, w2, h2, 'ReverseLight', R['lens_rev'])
        pz = D['rear']['plate_z']
        rquad(body, self.P, 0, sr + 0.002, pz, 0.15, 0.075, 'Plate', R['plate'])
        gr = D['front']['grille']
        if c['detail'] > 0:
            gx, (gz0, gz1) = gr['x'] + 0.012, gr['z']
            e = 0.02
            s = sf - 0.008
            for (xa, za, xb2, zb2) in [(-gx - e, gz1, gx + e, gz1 + e), (-gx - e, gz0 - e, gx + e, gz0), (-gx - e, gz0, -gx, gz1), (gx, gz0, gx + e, gz1)]:
                box(body, self.P((xa + xb2) / 2, s, (za + zb2) / 2), (abs(xb2 - xa) / 2, 0.014, abs(zb2 - za) / 2), 'Chrome', UVW)
        self.meta['lights'] = lights

    def mirrors(self, m):
        D = self.D
        for s in D.get('mirrors', []):
            for sx in (1, -1):
                w = float(self.hw(s)) - D['tumble'] - D['shoulder'] + 0.04
                z = float(self.top(s)) + 0.10
                box(m, self.P(sx * (w + 0.05), s, z), (0.055, 0.03, 0.045), 'Chrome', UVW)
                box(m, self.P(sx * (w + 0.0), s + 0.02, z - 0.06), (0.012, 0.012, 0.05), 'Chrome', UVW)

    def roof_sign(self, m):
        D = self.D
        gh = D['gh']
        kind = D.get('sign')
        if not kind:
            return
        s = 0.5 * (gh['ws1'] + gh['bl0']) - (0.35 if kind == 'taxi' else 0.25)
        z = gh['roof'] + gh['crown']
        if kind == 'taxi':
            hw_, hd, hh = 0.30, 0.07, 0.085
            z0 = z + 0.04
            box(m, self.P(0, s, z + 0.02), (0.26, 0.05, 0.025), 'Trim', UVW)
            fquad(m, self.P, 0, s - hd, z0 + hh, hw_, hh, 'SpecialEmit', R['sign'])
            rquad(m, self.P, 0, s + hd, z0 + hh, hw_, hh, 'SpecialEmit', R['sign'])
            box(m, self.P(0, s, z0 + hh), (hw_, hd - 0.004, hh), 'Trim', UVW, skip=('-y', '+y'))
            box(m, self.P(0, s, z0 + 2 * hh + 0.008), (hw_ + 0.01, hd + 0.01, 0.008), 'Chrome', UVW)
            if self.cfg['detail'] > 0:
                z2 = z0 + 2 * hh + 0.016
                hw2, hh2 = 0.16, 0.035
                fquad(m, self.P, 0, s - 0.02, z2 + hh2, hw2, hh2, 'SpecialEmit', R['sign2'])
                rquad(m, self.P, 0, s + 0.02, z2 + hh2, hw2, hh2, 'SpecialEmit', R['sign2'])
                box(m, self.P(0, s, z2 + hh2), (hw2, 0.018, hh2), 'Trim', UVW, skip=('-y', '+y'))
                for sx in (1, -1):
                    box(m, self.P(sx * (hw_ + 0.025), s, z0 + hh), (0.025, 0.03, 0.03), 'IndicatorEmit', tuple(map(float, uv_rect(R['lens_amber'], 0.5, 0.5))))
            self.meta['sign'] = [0, z0 + hh, s]
        elif kind == 'police':
            hw_, hd, hh = 0.62, 0.13, 0.065
            z0 = z + 0.05
            box(m, self.P(0, s, z0 - 0.02), (hw_ - 0.05, hd - 0.02, 0.02), 'Trim', UVW)
            rows = []
            for x in np.linspace(-hw_, hw_, 9):
                row = []
                for a in np.linspace(0, 2 * math.pi, 13)[:-1]:
                    row.append(self.P(x, s + hd * math.cos(a), z0 + hh + hh * math.sin(a)))
                rows.append(row)
            Pm = np.array(rows)
            def uvl(j, i, q, slot):
                return [tuple(map(float, uv_rect(R['sign'], (p[0] + hw_) / (2 * hw_), 0.15 + 0.7 * (p[2] - z0) / (2 * hh)))) for p in q]
            grid(m, Pm[::-1], lambda j, i, q: 'SpecialEmit', uvl, closed_u=True)
            for xe, fl in ((-hw_, False), (hw_, True)):
                ring = np.array([self.P(xe, s + hd * math.cos(a), z0 + hh + hh * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 13)[:-1]])
                fan(m, ring, ring.mean(axis=0), 'Chrome', lambda p: UVW, flip=not fl)
            self.meta['sign'] = [0, z0 + hh, s]

    def spotlight(self, m):
        if not self.D.get('spot') or self.cfg['detail'] < 1:
            return
        gh = self.D['gh']
        s = gh['ws1'] - 0.08
        w = float(self.hw(s)) - self.D['tumble'] - self.D['shoulder'] - 0.02
        z = self.D['gh']['roof'] - 0.32
        box(m, self.P(w + 0.07, s, z), (0.06, 0.08, 0.06), 'Chrome', UVW)

    def wheel(self, right=False):
        D, c = self.D, self.cfg
        Rr, w, rim = D['tire_r'], D['tire_w'], D['rim_r']
        m = Mesh()
        seg = c['wseg']
        hw_ = w / 2
        if c['detail'] > 1:
            prof = [(-hw_ + 0.01, rim + 0.01), (-hw_, rim + 0.04), (-hw_, Rr - 0.055), (-hw_ + 0.018, Rr - 0.012), (-hw_ + 0.05, Rr), (hw_ - 0.05, Rr), (hw_ - 0.018, Rr - 0.012), (hw_, Rr - 0.055), (hw_, rim + 0.04), (hw_ - 0.01, rim + 0.01)]
        elif c['detail'] > 0:
            prof = [(-hw_, rim + 0.03), (-hw_, Rr - 0.04), (-hw_ + 0.04, Rr), (hw_ - 0.04, Rr), (hw_, Rr - 0.04), (hw_, rim + 0.03)]
        else:
            prof = [(-hw_, rim), (-hw_, Rr), (hw_, Rr), (hw_, rim)]

        def tuv(i, a, x, r):
            if abs(abs(x) - hw_) < 0.012 and r < Rr - 0.03:
                return tuple(map(float, uv_rect(R['tire'], (a / (2 * math.pi)) % 1.0, np.clip((r - rim) / (Rr - rim), 0.02, 0.98))))
            return tuple(map(float, uv_rect(R['tire'], (a / (2 * math.pi)) % 1.0, 0.99)))
        xs = -1.0 if right else 1.0
        lathe_x(m, prof, seg, lambda j: 'Tire', tuv, x_sign=xs)
        hub_uv = lambda p: tuple(map(float, uv_rect(R['hub'], 0.5 + 0.5 * p[1] / (rim + 0.02), 0.5 + 0.5 * p[2] / (rim + 0.02))))
        xo = (hw_ - 0.012) * xs
        if c['detail'] > 1:
            ang = np.linspace(0, 2 * math.pi, seg + 1)[:-1]
            r0, r1 = rim + 0.012, rim * 0.62
            outer = np.array([[xo, r0 * math.cos(a), r0 * math.sin(a)] for a in ang])
            mid = np.array([[xo + 0.02 * xs, r1 * math.cos(a), r1 * math.sin(a)] for a in ang])
            P = np.stack([outer, mid])
            if xs > 0:
                P = P[:, ::-1]
            grid(m, P, lambda j, i, q: 'Hub', lambda j, i, q, s: [hub_uv(p) for p in q], closed_u=True)
            fan(m, P[1], np.array([xo + 0.03 * xs, 0, 0]), 'Hub', hub_uv, flip=True)
        else:
            disk_x(m, xo, rim + 0.012, seg, 'Hub', hub_uv, facing=xs)
        if c['detail'] > 0:
            disk_x(m, -(hw_ - 0.01) * xs, rim + 0.01, max(8, seg // 2), 'Under', lambda p: UVW, facing=-xs)
        return m

    def build(self):
        parts = {k: Mesh() for k in ('Body', 'HeadlightEmit', 'TailLightEmit')}
        self.lower_body(parts['Body'])
        self.greenhouse(parts['Body'])
        self.bumper(parts['Body'], self.D['fbump'], True)
        self.bumper(parts['Body'], self.D['rbump'], False)
        self.lamps(parts)
        if self.cfg['detail'] > 0:
            self.mirrors(parts['Body'])
            self.spotlight(parts['Body'])
        self.roof_sign(parts['Body'])
        D = self.D
        sa_f, sa_r = D['s_fa'], D['s_fa'] + D['wb']
        wheels = {}
        for name, x, s in (('Wheel_FL', D['track'] / 2, sa_f), ('Wheel_FR', -D['track'] / 2, sa_f), ('Wheel_RL', D['track'] / 2, sa_r), ('Wheel_RR', -D['track'] / 2, sa_r)):
            wheels[name] = (self.wheel(right=x < 0), self.P(x, s, D['tire_r']))
        self.meta.update(sc=self.sc, length=D['L'], width=2 * max(p[1] for p in D['hw']) + 0.04, height=D['gh']['roof'] + D['gh']['crown'])
        return parts, wheels

    def collider_points(self):
        D = self.D
        b0, b1 = D['body']
        pts = []
        for s in (b0 - 0.08, b0 + 0.25, D['gh']['ws0'], D['gh']['bl1'], b1 - 0.25, b1 + 0.08):
            w = float(self.hw(min(max(s, b0), b1)))
            zt = float(self.top(min(max(s, b0), b1)))
            zb = float(self.bot(min(max(s, b0), b1))) + 0.04
            for sx in (1, -1):
                pts.append(self.P(sx * w, s, zb))
                pts.append(self.P(sx * w, s, zt))
        gh = D['gh']
        for s in (gh['ws1'], gh['bl0']):
            for sx in (1, -1):
                pts.append(self.P(sx * gh['roof_w'], s, gh['roof']))
        return np.array(pts)
