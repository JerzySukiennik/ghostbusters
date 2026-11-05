// 2D polygon helpers on the x/z ground plane (positive shoelace area = interior on the left of each edge), deterministic RNG and integer hash.
export const EPS = 1e-6;

export function area(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) { const p = poly[i], q = poly[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

export function orient(poly) { return area(poly) < 0 ? poly.slice().reverse() : poly; }

export function centroid(poly) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n], c = p[0] * q[1] - q[0] * p[1];
    a += c; cx += (p[0] + q[0]) * c; cz += (p[1] + q[1]) * c;
  }
  if (Math.abs(a) < EPS) { let x = 0, z = 0; for (const p of poly) { x += p[0]; z += p[1]; } return [x / poly.length, z / poly.length]; }
  return [cx / (3 * a), cz / (3 * a)];
}

export function bounds(poly) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of poly) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; }
  return [x0, z0, x1, z1];
}

export function inward(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return [-dz / l, dx / l];
}

export function clipHalf(poly, P, n, c = 0) {
  const out = [];
  const len = poly.length;
  for (let i = 0; i < len; i++) {
    const a = poly[i], b = poly[(i + 1) % len];
    const da = (a[0] - P[0]) * n[0] + (a[1] - P[1]) * n[1] - c;
    const db = (b[0] - P[0]) * n[0] + (b[1] - P[1]) * n[1] - c;
    if (da >= -EPS) out.push(a);
    if ((da >= -EPS) !== (db >= -EPS)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

export function clipHalfTagged(poly, tags, P, n, c, newTag) {
  const out = [], ot = [];
  const len = poly.length;
  for (let i = 0; i < len; i++) {
    const a = poly[i], b = poly[(i + 1) % len];
    const da = (a[0] - P[0]) * n[0] + (a[1] - P[1]) * n[1] - c;
    const db = (b[0] - P[0]) * n[0] + (b[1] - P[1]) * n[1] - c;
    const ina = da >= -1e-7, inb = db >= -1e-7;
    if (ina) {
      out.push(a);
      ot.push(inb ? tags[i] : tags[i]);
      if (!inb) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        ot.push(newTag);
      }
    } else if (inb) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      ot.push(tags[i]);
    }
  }
  return clean(out, ot);
}

function clean(poly, tags) {
  const p = [], t = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4) continue;
    p.push(a); t.push(tags[i]);
  }
  return { poly: p, tags: t };
}

export function clipRect(poly, x0, z0, x1, z1) {
  let p = poly;
  p = clipHalf(p, [x0, 0], [1, 0]); if (p.length < 3) return [];
  p = clipHalf(p, [x1, 0], [-1, 0]); if (p.length < 3) return [];
  p = clipHalf(p, [0, z0], [0, 1]); if (p.length < 3) return [];
  p = clipHalf(p, [0, z1], [0, -1]);
  return p.length < 3 ? [] : p;
}

export function insetConvex(poly, dists) {
  const n = poly.length;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], nn = inward(a, b), d = typeof dists === 'number' ? dists : dists[i];
    lines.push({ p: [a[0] + nn[0] * d, a[1] + nn[1] * d], d: [b[0] - a[0], b[1] - a[1]], n: nn });
  }
  let out = poly.slice();
  for (const L of lines) { out = clipHalf(out, L.p, L.n); if (out.length < 3) return []; }
  return out;
}

export function lineHit(p, d, q, e) {
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
  return [p[0] + d[0] * t, p[1] + d[1] * t, t];
}

export function segHit(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return { p: [a[0] + r[0] * t, a[1] + r[1] * t], t, u };
}

export function segDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a[0] + dx * t - p[0], z = a[1] + dz * t - p[1];
  return Math.sqrt(x * x + z * z);
}

export function segClosest(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { p: [a[0] + dx * t, a[1] + dz * t], t, d: Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]) };
}

export function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1] + 1e-12) + a[0]) c = !c;
  }
  return c;
}

export function polyDist(poly, x, z) {
  let d = Infinity;
  const p = [x, z];
  for (let i = 0, n = poly.length; i < n; i++) { const e = segDist(p, poly[i], poly[(i + 1) % n]); if (e < d) d = e; }
  return d;
}

export function signedDist(poly, x, z) { const d = polyDist(poly, x, z); return inside(poly, x, z) ? -d : d; }

export function plen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }

export function along(pts, s) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + L >= s || i === pts.length - 1) {
      const t = L > 0 ? Math.min(1, Math.max(0, (s - acc) / L)) : 0;
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d: [(b[0] - a[0]) / (L || 1), (b[1] - a[1]) / (L || 1)], i };
    }
    acc += L;
  }
  return { p: pts[0].slice(), d: [0, 1], i: 0 };
}

export function offsetLine(pts, off) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    let nx = dz, nz = -dx;
    let k = 1;
    if (i > 0 && i < pts.length - 1) {
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      const d0 = norm2([p1[0] - p0[0], p1[1] - p0[1]]), d1 = norm2([p2[0] - p1[0], p2[1] - p1[1]]);
      const n0 = [d0[1], -d0[0]], n1 = [d1[1], -d1[0]];
      const m = norm2([n0[0] + n1[0], n0[1] + n1[1]]);
      const c = m[0] * n0[0] + m[1] * n0[1];
      nx = m[0]; nz = m[1]; k = 1 / Math.max(0.3, c);
    }
    out.push([pts[i][0] + nx * off * k, pts[i][1] + nz * off * k]);
  }
  return out;
}

export function norm2(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }

export function roundCorners(poly, radius, segs = 6, convexOnly = true, radii = null) {
  const n = poly.length, out = [], flags = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const a = norm2([p0[0] - p1[0], p0[1] - p1[1]]), b = norm2([p2[0] - p1[0], p2[1] - p1[1]]);
    const cross = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
    const r0 = radii ? radii[i] : radius;
    const cosT = a[0] * b[0] + a[1] * b[1];
    const half = Math.acos(Math.max(-1, Math.min(1, cosT))) / 2;
    if (r0 <= 0 || (convexOnly && cross < 0) || half < 0.05 || half > 1.52) { out.push(p1); flags.push(0); continue; }
    const l0 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]), l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    let t = r0 / Math.tan(half);
    t = Math.min(t, l0 * 0.45, l2 * 0.45);
    const r = t * Math.tan(half);
    const s = [p1[0] + a[0] * t, p1[1] + a[1] * t], e = [p1[0] + b[0] * t, p1[1] + b[1] * t];
    const bis = norm2([a[0] + b[0], a[1] + b[1]]);
    const cd = r / Math.sin(half);
    const c = [p1[0] + bis[0] * cd, p1[1] + bis[1] * cd];
    let a0 = Math.atan2(s[1] - c[1], s[0] - c[0]), a1 = Math.atan2(e[1] - c[1], e[0] - c[0]);
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    for (let k = 0; k <= segs; k++) { const an = a0 + da * k / segs; out.push([c[0] + Math.cos(an) * r, c[1] + Math.sin(an) * r]); flags.push(k === 0 ? 2 : k === segs ? 3 : 1); }
  }
  return { poly: out, flags };
}

export function circlePoly(c, r, n = 24) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); }
  return orient(out);
}

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash32(x) {
  x = x >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function winHash(seed, face, floor, col) {
  return hash32((seed ^ Math.imul(face + 1, 0x9e3779b1) ^ Math.imul(floor + 7, 0x85ebca6b) ^ Math.imul(col + 13, 0xc2b2ae35)) >>> 0);
}

export const r1 = (v) => Math.round(v * 10) / 10;
export const r2 = (v) => Math.round(v * 100) / 100;
