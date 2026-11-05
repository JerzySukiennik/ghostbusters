// City chunk builder: pure typed-array geometry (sidewalks, kerbs, road paint, building shells, cornices, storefronts, fire escapes, signs) plus lamps, signals and instance lists; runs in the worker and on the main thread.
import { area, orient, centroid, bounds, inward, insetConvex, inside, rng, hashStr, norm2 } from './geom.js';
import { LAMPS as V1LAMPS } from '../world/layout.js';

export const SW = 0.15;
export const LAYERS = {
  walk: { aSurf: 2 },
  decal: { aDec: 3 },
  shell: { aFac: 4, aFac2: 4, aShop: 4 },
  trim: { color: 3 },
  iron: { aIron: 2 },
  signs: { aLit: 3 },
};
export const TIERS = { B: ['walk', 'shell'], A: ['decal', 'trim', 'iron', 'signs'] };
export const BRICK = { red: 0, orange: 1, buff: 2, dark: 3, stone: 4 };
const USE = {
  tenement: { gf: 4.3, fl: 3.15, kind: 1, bay: 2.75, par: 1.0 },
  castiron: { gf: 4.9, fl: 4.2, kind: 4, bay: 3.4, par: 0.9 },
  warehouse: { gf: 4.6, fl: 3.9, kind: 5, bay: 3.8, par: 0.8 },
  prewar: { gf: 4.6, fl: 3.3, kind: 6, bay: 2.9, par: 1.1 },
  office: { gf: 5.2, fl: 3.7, kind: 3, bay: 3.0, par: 1.2 },
  tower: { gf: 6.0, fl: 3.75, kind: 3, bay: 2.6, par: 1.5 },
  flatiron: { gf: 5.0, fl: 3.6, kind: 6, bay: 2.3, par: 1.4 },
  landmark2: { gf: 5.0, fl: 3.6, kind: 6, bay: 3.0, par: 1.6 },
  church: { gf: 5.0, fl: 4.0, kind: 13, bay: 4.5, par: 0.6 },
};
export const SHOP_TINTS = [[1.0, 0.55, 0.3], [1.0, 0.85, 0.75], [0.86, 0.95, 1.0], [1.0, 0.78, 0.5], [1.0, 0.88, 0.7], [1.0, 0.86, 0.62], [0.82, 0.92, 1.0], [1.0, 0.7, 0.85], [0.8, 1.0, 0.85], [1.0, 0.95, 0.85]];
const V1_SHOP = { bar: 0, liquor: 1, deli: 2, pizza: 3, diner: 4, bakery: 5, cleaners: 6, records: 7, office: 6, lobby: 4 };
const V1_SIGNS = ['tavern', 'liquors', 'deli', 'pizza', 'laundromat', 'checks', 'coffee', 'records', 'bakery', 'cleaners', 'hardware', 'pawn', 'shoe'];
const V1_TINT = { tavern: 0, liquors: 1, deli: 2, pizza: 3, laundromat: 6, checks: 6, coffee: 4, records: 7, bakery: 5, cleaners: 6, hardware: 9, pawn: 9, shoe: 9 };
export const SHOP_NAMES = {
  generic: ['DELI GROCERY', 'LIQUORS', 'PIZZA', 'CHECKS CASHED', 'LAUNDROMAT', 'COFFEE SHOP', 'HARDWARE', 'SHOE REPAIR', 'PAWN SHOP', 'RECORDS', 'BAKERY', 'CLEANERS', 'FLORIST', 'BODEGA', 'OPTICIAN', 'TAILOR', 'PHARMACY', 'BOOKS', 'ELECTRONICS', 'LOCKSMITH', 'TV REPAIR', 'BARBER', 'DINER', 'BAR & GRILL', 'CANDY STORE', 'LUNCHEONETTE', 'HOT BAGELS', 'NEWS & CIGARS'],
  chinatown: ['JADE GARDEN', 'GOLDEN DRAGON', 'NOODLE TOWN', 'HONG KONG BAKERY', 'LUCKY STAR', 'GREAT WALL', 'WAH FUNG', 'DIM SUM', 'TEA HOUSE', 'SEAFOOD'],
  times: ['LIVE SHOW', 'CINEMA', 'GIFTS CAMERAS', 'DISCOUNT', 'THEATRE', 'ARCADE', 'HOTEL', 'STEAKS', 'GIRLS GIRLS', 'ADULT BOOKS'],
  fidi: ['BANK', 'TRUST CO', 'SHOE SHINE', 'NEWSSTAND', 'LUNCH', 'STATIONERY', 'BROKERS', 'SAVINGS'],
  soho: ['GALLERY', 'ARTIST SUPPLY', 'PRINTING', 'TEXTILES', 'PAPER CO', 'FABRICS', 'LIGHTING', 'ANTIQUES'],
};
export const BOARDS = ['BROADWAY', 'ACTION NEWS 7', 'NEW YORK', 'JEANS', 'CAMERAS', 'WHISKY', 'STEREO', 'SALE', 'COLA', 'FILM', 'RADIO CITY', 'AIRLINES'];

export function atlasLayout(map) {
  const names = [...new Set(map.roads.lanes.map((l) => l.name))].sort();
  const shops = [...new Set(Object.values(SHOP_NAMES).flat())];
  const cells = [];
  let x = 0, y = 0, rowH = 0;
  const put = (key, kind, text, w, h, style = 0) => {
    if (x + w > 2048) { x = 0; y += rowH; rowH = 0; }
    cells.push({ key, kind, text, style, x, y, w, h, uv: [x / 2048, y / 2048, w / 2048, h / 2048] });
    x += w; rowH = Math.max(rowH, h);
  };
  for (const n of names) put('st:' + n, 'street', n.toUpperCase(), 408, 52);
  x = 0; y += rowH; rowH = 0;
  shops.forEach((s, i) => put('shop:' + s, 'shop', s, 408, 76, i % 5));
  x = 0; y += rowH; rowH = 0;
  BOARDS.forEach((s, i) => put('board:' + s, 'board', s, 512, 192, i % 4));
  return { w: 2048, h: 2048, cells };
}

class Grow {
  constructor(T = Float32Array, n = 2048) { this.T = T; this.a = new T(n); this.n = 0; }
  need(k) { if (this.n + k > this.a.length) { const b = new this.T(Math.max(this.a.length * 2, this.n + k)); b.set(this.a.subarray(0, this.n)); this.a = b; } }
  p1(x) { this.need(1); this.a[this.n++] = x; }
  p2(x, y) { this.need(2); const a = this.a; a[this.n++] = x; a[this.n++] = y; }
  p3(x, y, z) { this.need(3); const a = this.a; a[this.n++] = x; a[this.n++] = y; a[this.n++] = z; }
  out() { return this.a.slice(0, this.n); }
}

class Buf {
  constructor(extra) {
    this.keys = Object.keys(extra);
    this.pos = new Grow(); this.nor = new Grow(); this.uvs = new Grow(); this.idx = new Grow(Uint32Array);
    this.ex = {}; this.c = {};
    for (const k of this.keys) { this.ex[k] = new Grow(); this.c[k] = new Float32Array(extra[k]); }
    this.nv = 0;
  }
  v(x, y, z, nx, ny, nz, u, w) {
    this.pos.p3(x, y, z); this.nor.p3(nx, ny, nz); this.uvs.p2(u, w);
    for (const k of this.keys) { const c = this.c[k], g = this.ex[k]; g.need(c.length); for (let i = 0; i < c.length; i++) g.a[g.n++] = c[i]; }
    return this.nv++;
  }
  tri(a, b, c) { this.idx.p3(a, b, c); }
  out(tr) {
    if (!this.nv) return null;
    const o = { position: this.pos.out(), normal: this.nor.out(), uv: this.uvs.out(), index: this.idx.out(), ex: {} };
    for (const k of this.keys) o.ex[k] = this.ex[k].out();
    if (tr) { tr.push(o.position.buffer, o.normal.buffer, o.uv.buffer, o.index.buffer); for (const k of this.keys) tr.push(o.ex[k].buffer); }
    return o;
  }
}

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const UP = [0, 1, 0];

function quad(B, P, n, uv) {
  const s = dot3(cross3(sub3(P[1], P[0]), sub3(P[2], P[0])), n) >= 0;
  const b = B.nv;
  for (let k = 0; k < 4; k++) B.v(P[k][0], P[k][1], P[k][2], n[0], n[1], n[2], uv[k][0], uv[k][1]);
  if (s) { B.tri(b, b + 1, b + 2); B.tri(b, b + 2, b + 3); } else { B.tri(b, b + 2, b + 1); B.tri(b, b + 3, b + 2); }
}

function boxW(B, c, ax, ay, az, hx, hy, hz, skip = '') {
  const P = (sx, sy, sz) => [c[0] + ax[0] * sx * hx + ay[0] * sy * hy + az[0] * sz * hz, c[1] + ax[1] * sx * hx + ay[1] * sy * hy + az[1] * sz * hz, c[2] + ax[2] * sx * hx + ay[2] * sy * hy + az[2] * sz * hz];
  const neg = (v) => [-v[0], -v[1], -v[2]];
  const F = [
    ['px', ax, [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]], hz, hy],
    ['nx', neg(ax), [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]], hz, hy],
    ['py', ay, [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]], hx, hz],
    ['ny', neg(ay), [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]], hx, hz],
    ['pz', az, [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], hx, hy],
    ['nz', neg(az), [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], hx, hy],
  ];
  for (const [name, n, q, a, b] of F) {
    if (skip.includes(name)) continue;
    const u = a * 2, v = b * 2;
    quad(B, [P(...q[0]), P(...q[1]), P(...q[2]), P(...q[3])], n, [[0, 0], [u, 0], [u, v], [0, v]]);
  }
}
const boxA = (B, x0, y0, z0, x1, y1, z1, skip = '') => boxW(B, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [1, 0, 0], UP, [0, 0, 1], (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, skip);

function frame(A, Bp, base = SW) {
  const dx = Bp[0] - A[0], dz = Bp[1] - A[1], L = Math.hypot(dx, dz) || 1;
  const u = [dx / L, dz / L], n = [u[1], -u[0]];
  return { A, L, u, n, n3: [n[0], 0, n[1]], u3: [u[0], 0, u[1]], P: (s, y, d) => [A[0] + u[0] * s + n[0] * d, base + y, A[1] + u[1] * s + n[1] * d] };
}
function fbox(B, f, s0, s1, y0, y1, d0, d1, skip = '') {
  const c = f.P((s0 + s1) / 2, (y0 + y1) / 2, (d0 + d1) / 2);
  boxW(B, c, f.u3, UP, f.n3, Math.abs(s1 - s0) / 2, Math.abs(y1 - y0) / 2, Math.abs(d1 - d0) / 2, skip);
}
function panel(B, f, s0, s1, y0, y1, d, uv = null) {
  quad(B, [f.P(s0, y0, d), f.P(s1, y0, d), f.P(s1, y1, d), f.P(s0, y1, d)], f.n3, uv || [[s0, y0], [s1, y0], [s1, y1], [s0, y1]]);
}

function fanUp(B, poly, y, uvf) {
  const b = B.nv, s = area(poly) > 0;
  for (const p of poly) { const t = uvf(p); B.v(p[0], y, p[1], 0, 1, 0, t[0], t[1]); }
  for (let i = 1; i < poly.length - 1; i++) { if (s) B.tri(b, b + i + 1, b + i); else B.tri(b, b + i, b + i + 1); }
}

function earUp(B, poly, y) {
  const P = orient(poly);
  const b = B.nv;
  for (const p of P) B.v(p[0], y, p[1], 0, 1, 0, p[0], p[1]);
  const idx = P.map((_, i) => i);
  const cr = (a, c, d) => (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]);
  let guard = 0;
  while (idx.length > 3 && guard++ < 500) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k - 1 + idx.length) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const a = P[i0], c = P[i1], d = P[i2];
      if (cr(a, c, d) <= 1e-9) continue;
      let ok = true;
      for (const j of idx) { if (j === i0 || j === i1 || j === i2) continue; const q = P[j]; if (cr(a, c, q) >= 0 && cr(c, d, q) >= 0 && cr(d, a, q) >= 0) { ok = false; break; } }
      if (!ok) continue;
      B.tri(b + i0, b + i2, b + i1);
      idx.splice(k, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) B.tri(b + idx[0], b + idx[2], b + idx[1]);
}

function insetVerts(P, d) {
  const n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], p = P[i], b = P[(i + 1) % n];
    const n0 = inward(a, p), n1 = inward(p, b);
    let mx = n0[0] + n1[0], mz = n0[1] + n1[1];
    const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = 1 / Math.max(0.35, mx * n0[0] + mz * n0[1]);
    out.push([p[0] + mx * d * k, p[1] + mz * d * k]);
  }
  return out;
}

function roundKerb(P, T, isRoad, R = 3.2) {
  const n = P.length, out = [], orig = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n];
    const road = isRoad(T[(i - 1 + n) % n]) && isRoad(T[i]);
    const a = norm2([p0[0] - p1[0], p0[1] - p1[1]]), b = norm2([p2[0] - p1[0], p2[1] - p1[1]]);
    const cr = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
    const half = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) / 2;
    if (!road || cr < 0 || half < 0.12 || half > 1.45) { out.push(p1); orig.push(i); continue; }
    const l0 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]), l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const t = Math.min(R / Math.tan(half), l0 * 0.4, l2 * 0.4), r = t * Math.tan(half);
    const bis = norm2([a[0] + b[0], a[1] + b[1]]), cd = r / Math.sin(half);
    const c = [p1[0] + bis[0] * cd, p1[1] + bis[1] * cd];
    const s = [p1[0] + a[0] * t, p1[1] + a[1] * t], e = [p1[0] + b[0] * t, p1[1] + b[1] * t];
    const a0 = Math.atan2(s[1] - c[1], s[0] - c[0]);
    let da = Math.atan2(e[1] - c[1], e[0] - c[0]) - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const segs = Math.max(2, Math.round(Math.abs(da) / 0.3));
    for (let k = 0; k <= segs; k++) { const an = a0 + da * k / segs; out.push([c[0] + Math.cos(an) * r, c[1] + Math.sin(an) * r]); orig.push(i); }
  }
  const tags = out.map((_, k) => { const k2 = (k + 1) % out.length; return orig[k] === orig[k2] ? 'ARC' : T[orig[k]]; });
  return { poly: out, tags };
}

function zipRing(B, O, I, y, uvf, aO, aI, setA) {
  const c = centroid(I);
  const prep = (P) => {
    const a = P.map((p) => Math.atan2(p[1] - c[1], p[0] - c[0]));
    let k = 0;
    for (let i = 1; i < a.length; i++) if (a[i] < a[k]) k = i;
    const r = [];
    for (let i = 0; i < P.length; i++) { const j = (k + i) % P.length; r.push({ p: P[j], t: a[j] }); }
    for (let i = 1; i < r.length; i++) while (r[i].t < r[i - 1].t) r[i].t += Math.PI * 2;
    r.push({ p: r[0].p, t: r[0].t + Math.PI * 2 });
    return r;
  };
  const o = prep(O), q = prep(I);
  const vo = [], vi = [];
  setA(aO);
  for (let i = 0; i < o.length - 1; i++) { const p = o[i].p, t = uvf(p); vo.push(B.v(p[0], y, p[1], 0, 1, 0, t[0], t[1])); }
  vo.push(vo[0]);
  setA(aI);
  for (let i = 0; i < q.length - 1; i++) { const p = q[i].p, t = uvf(p); vi.push(B.v(p[0], y, p[1], 0, 1, 0, t[0], t[1])); }
  vi.push(vi[0]);
  const P = (a, b, cc, pa, pb, pc) => {
    const s = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
    if (Math.abs(s) < 1e-9) return;
    if (s > 0) B.tri(a, cc, b); else B.tri(a, b, cc);
  };
  let i = 0, j = 0;
  const n = o.length - 1, m = q.length - 1;
  let guard = 0;
  while ((i < n || j < m) && guard++ < 4 * (n + m)) {
    if (i < n && (j >= m || o[i + 1].t <= q[j + 1].t)) { P(vo[i], vo[i + 1], vi[j], o[i].p, o[i + 1].p, q[j].p); i++; }
    else { P(vo[i], vi[j + 1], vi[j], o[i].p, q[j + 1].p, q[j].p); j++; }
  }
}

function obb(poly) {
  let best = 0, bl = -1;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > bl) { bl = l; best = i; } }
  const a = poly[best], b = poly[(best + 1) % poly.length];
  const u = norm2([b[0] - a[0], b[1] - a[1]]), n = [-u[1], u[0]];
  let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  for (const p of poly) { const s = p[0] * u[0] + p[1] * u[1], t = p[0] * n[0] + p[1] * n[1]; s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
  const cs = (s0 + s1) / 2, ct = (t0 + t1) / 2;
  return { c: [u[0] * cs + n[0] * ct, u[1] * cs + n[1] * ct], w: s1 - s0, d: t1 - t0, yaw: Math.atan2(-u[1], u[0]) };
}

export function createBuilder(map, opts = {}) {
  const C = map.chunk || 128;
  const glb = new Set(opts.glb || []);
  const v1cells = new Map((opts.v1cells || []).map((c) => [c.key, c]));
  const atlas = atlasLayout(map);
  const gcells = new Map(atlas.cells.map((c) => [c.key, c]));
  const seg = new Map(map.streets.map((s) => [s.id, s]));
  const walkOf = (t) => (t === 'RING' ? 5 : seg.get(t)?.walk ?? 4.5);
  const isRoad = (t) => !!t && t !== 'water';
  const ckey = (x, z) => Math.floor(x / C) + ',' + Math.floor(z / C);
  const chunks = new Map();
  const chunk = (k) => {
    let c = chunks.get(k);
    if (!c) { const [i, j] = k.split(',').map(Number); c = { key: k, i, j, x0: i * C, z0: j * C, x1: (i + 1) * C, z1: (j + 1) * C, blocks: [], lots: [], lanes: [], cross: [], paths: [], lamps: [], landmarks: [], piers: [], maxH: 0 }; chunks.set(k, c); }
    return c;
  };
  const blockById = new Map(map.blocks.map((b) => [b.id, b]));
  for (const b of map.blocks) { const [x, z] = centroid(b.kerb); chunk(ckey(x, z)).blocks.push(b); }
  const lotsByGroup = new Map();
  const specs = new Map();
  for (const l of map.lots) {
    const [x, z] = centroid(l.poly);
    l._c = [x, z];
    const ch = chunk(ckey(x, z));
    ch.lots.push(l);
    const g = blockById.get(l.block)?.group || l.block;
    if (!lotsByGroup.has(g)) lotsByGroup.set(g, []);
    lotsByGroup.get(g).push(l);
  }
  for (const ln of map.roads.lanes) { const p = ln.pts[(ln.pts.length / 2) | 0], q = ln.pts[Math.max(0, ((ln.pts.length / 2) | 0) - 1)]; chunk(ckey((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)).lanes.push(ln); }
  const wnode = new Map(map.walks.nodes.map((n) => [n.id, n.p]));
  for (const w of map.walks.lanes) if (w.crossing) { const a = wnode.get(w.from), b = wnode.get(w.to); chunk(ckey((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)).cross.push([a, b]); }
  for (const pp of map.parkPaths) for (let i = 1; i < pp.pts.length; i++) { const a = pp.pts[i - 1], b = pp.pts[i]; chunk(ckey((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)).paths.push({ a, b, w: pp.w, id: pp.id }); }
  for (const lm of map.landmarks) { const [x, z] = centroid(lm.footprint); chunk(ckey(x, z)).landmarks.push(lm); }
  for (const p of map.water.piers) { const [x, z] = centroid(p.poly); chunk(ckey(x, z)).piers.push(p); }
  const nodeP = new Map(map.roads.nodes.map((n) => [n.id, n.p]));
  const nodeLanes = new Map();
  for (const ln of map.roads.lanes) for (const id of [ln.from, ln.to]) { if (!nodeLanes.has(id)) nodeLanes.set(id, []); nodeLanes.get(id).push(ln); }
  const sigByNode = new Map(map.roads.signals.map((s) => [s.node, s]));
  const noPark = map.roads.noParking || [];
  const v1zone = (x, z) => Math.abs(x) < 56 && Math.abs(z) < 56;

  function specOf(lot) {
    let s = specs.get(lot.id);
    if (s) return s;
    const U = USE[lot.use] || USE.tenement;
    const r = rng(lot.seed || hashStr(lot.id));
    let floors = Math.max(1, lot.floors || 4);
    if (lot.use === 'landmark2') floors = 10;
    let kind = U.kind;
    let brick = BRICK[lot.brick] ?? 0;
    if (lot.use === 'castiron') brick = BRICK.stone;
    if ((lot.use === 'office' || lot.use === 'prewar') && r() < 0.45) brick = BRICK.stone;
    const top = (f) => U.gf + (Math.max(1, f) - 1) * U.fl;
    if (lot.use === 'office' && floors >= 18 && r() < 0.4) kind = 7;
    const tiers = [];
    let poly = lot.poly;
    if (lot.special === 'empire_state') {
      tiers.push({ poly, f: 5 });
      const c = centroid(poly);
      const sq = (h) => [[c[0] - h, c[1] - h], [c[0] + h, c[1] - h], [c[0] + h, c[1] + h], [c[0] - h, c[1] + h]];
      tiers.push({ poly: sq(13), f: 81 }, { poly: sq(9), f: 86 }, { poly: sq(5), f: 92 }, { poly: sq(2.4), f: 100, spire: 62 });
    } else if (lot.special === 'church') {
      tiers.push({ poly, f: 3 });
    } else if ((kind === 3 || kind === 6) && floors >= 14) {
      let f = Math.min(floors, 8 + ((r() * 7) | 0));
      tiers.push({ poly, f });
      let d = 0;
      while (f < floors) {
        d += 2.5 + r() * 2.5;
        const p2 = insetConvex(poly, d);
        if (p2.length < 3 || Math.abs(area(p2)) < 70) break;
        const nf = Math.min(floors, f + 5 + ((r() * 10) | 0));
        tiers.push({ poly: p2, f: nf });
        f = nf;
      }
      if (f < floors) tiers[tiers.length - 1].f = floors;
    } else tiers.push({ poly, f: floors });
    let y = SW;
    for (const t of tiers) { t.y0 = y; t.roof = SW + top(t.f) + (lot.special === 'church' ? 4 : 0); t.top = t.roof + U.par; y = t.roof; }
    const last = tiers[tiers.length - 1];
    s = { U, kind, brick, tint: r(), tiers, baseTop: tiers[0].top, H: last.top + (last.spire || 0), floors, seed: r(), cornice: ['deep', 'bracket', 'simple', 'bracket'][(r() * 4) | 0], fire: (kind === 1 && floors >= 3 && floors <= 8 && r() < 0.62) || (kind === 4 && r() < 0.35) || (kind === 5 && r() < 0.25), water: (kind === 1 || kind === 4 || kind === 5 || kind === 6) && floors >= 4 && floors <= 16 && r() < 0.38, rr: r };
    specs.set(lot.id, s);
    return s;
  }

  function neighbourTop(lot, x, z) {
    const g = blockById.get(lot.block)?.group || lot.block;
    for (const o of lotsByGroup.get(g) || []) {
      if (o === lot || o.kind === 'park') continue;
      if (inside(o.poly, x, z)) return o.v1 ? SW + 4.3 + (o.floors - 1) * 3.15 + 1.35 : specOf(o).baseTop;
    }
    return null;
  }

  function shopFor(lot, sp, fi, L, nFronts) {
    const r = rng((lot.seed || 1) * 31 + fi * 7 + 3);
    const u = lot.use;
    const neonSub = lot.sub === 'times' || lot.sub === 'chinatown';
    const shopP = { tenement: 0.85, castiron: 0.7, warehouse: 0.15, prewar: 0.3, office: 0.3, tower: 0.0, flatiron: 0.5, landmark2: 0 }[u] ?? 0.5;
    if (L < 4.5) return null;
    const corner = nFronts > 1;
    const s0 = corner || L < 7 ? 0.6 : 2.0, s1 = L - 0.6;
    const x = r();
    if (x < shopP) {
      const open = r() < (neonSub ? 0.8 : 0.42);
      const pool = lot.sub === 'chinatown' ? SHOP_NAMES.chinatown : lot.sub === 'times' ? SHOP_NAMES.times : lot.district === 'fidi' ? SHOP_NAMES.fidi : lot.district === 'soho' && r() < 0.5 ? SHOP_NAMES.soho : null;
      let sign;
      if (!pool && r() < 0.55) { const k = V1_SIGNS[(r() * V1_SIGNS.length) | 0]; sign = { atlas: 0, key: k, tint: V1_TINT[k] }; }
      else { const list = pool || SHOP_NAMES.generic; const name = list[(r() * list.length) | 0]; sign = { atlas: 1, key: 'shop:' + name, tint: (r() * SHOP_TINTS.length) | 0 }; }
      return { state: open ? 1 : 2, tint: sign.tint, s0, s1, sign, awning: open && r() < 0.35 ? (r() * 4) | 0 : -1, blade: open && r() < 0.18, neon: open && (neonSub || r() < 0.3) };
    }
    if (u === 'warehouse' && x < 0.7) return { state: 3, tint: 9, s0: 1.0, s1: Math.min(L - 1.0, 1.0 + 4.2 * Math.max(1, Math.floor((L - 2) / 4.4))), dock: true };
    if ((u === 'office' || u === 'tower' || u === 'prewar' || u === 'landmark2') && fi === 0) return { state: 4, tint: 4, s0: Math.max(0.6, L / 2 - 3.2), s1: Math.min(L - 0.6, L / 2 + 3.2), canopy: u === 'prewar' || u === 'landmark2' };
    return { state: 0, tint: 4, s0: L / 2 - 0.6, s1: L / 2 + 0.6 };
  }

  function setShell(S, kind, seed, bay, roofRel, sp, shop) {
    const f = S.c.aFac, f2 = S.c.aFac2, sh = S.c.aShop;
    f[0] = kind; f[1] = seed; f[2] = bay; f[3] = roofRel;
    f2[0] = sp.U.gf; f2[1] = sp.U.fl; f2[2] = sp.brick; f2[3] = sp.tint;
    if (shop) { sh[0] = shop.state; sh[1] = shop.tint; sh[2] = shop.s0; sh[3] = shop.s1; } else { sh[0] = -1; sh[1] = 0; sh[2] = 0; sh[3] = 0; }
  }

  function wall(S, A, Bp, y0, y1) {
    const f = frame(A, Bp);
    const b = S.nv;
    S.v(A[0], y0, A[1], f.n[0], 0, f.n[1], 0, y0 - SW);
    S.v(Bp[0], y0, Bp[1], f.n[0], 0, f.n[1], f.L, y0 - SW);
    S.v(Bp[0], y1, Bp[1], f.n[0], 0, f.n[1], f.L, y1 - SW);
    S.v(A[0], y1, A[1], f.n[0], 0, f.n[1], 0, y1 - SW);
    const s = dot3(cross3([Bp[0] - A[0], 0, Bp[1] - A[1]], [0, y1 - y0, 0]), f.n3) >= 0;
    if (s) { S.tri(b, b + 1, b + 2); S.tri(b, b + 2, b + 3); } else { S.tri(b, b + 2, b + 1); S.tri(b, b + 3, b + 2); }
    return f;
  }

  function shellLot(L, lot, out) {
    const sp = specOf(lot);
    const S = L.shell;
    const nF = (lot.fronts || []).length;
    const fronts = new Map((lot.fronts || []).map((f) => [f.e, f]));
    sp.tiers.forEach((t, ti) => {
      const P = t.poly, n = P.length;
      const roofRel = t.roof - SW;
      for (let i = 0; i < n; i++) {
        const A = P[i], Bp = P[(i + 1) % n];
        const len = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
        if (len < 0.3) continue;
        const seed = ((lot.seed || 7) * 0.000137 + i * 0.1731 + ti * 0.4127) % 1;
        const nb = Math.max(1, Math.round(len / sp.U.bay)), bay = len / nb;
        let y0 = t.y0, kind = sp.kind, shop = null;
        if (ti === 0 && !fronts.has(i)) {
          const m = [(A[0] + Bp[0]) / 2, (A[1] + Bp[1]) / 2], nn = inward(A, Bp);
          const nt = neighbourTop(lot, m[0] - nn[0] * 0.5, m[1] - nn[1] * 0.5);
          if (nt != null) { if (nt >= t.top - 0.25) continue; y0 = Math.max(y0, nt); kind = 0; }
          else kind = sp.kind === 7 || sp.kind === 8 ? sp.kind : 2;
        } else if (ti === 0) shop = shopFor(lot, sp, [...fronts.keys()].indexOf(i), len, nF);
        if (lot.special === 'church') kind = 13;
        setShell(S, kind, seed, bay, roofRel, sp, shop);
        wall(S, A, Bp, y0, t.top);
        if (shop && out.fronts) out.fronts.push({ lot, sp, A, Bp, len, shop, bay, nb, ti, seed });
        else if (ti === 0 && fronts.has(i) && out.fronts) out.fronts.push({ lot, sp, A, Bp, len, shop: null, bay, nb, ti, seed });
        if (ti > 0 && out.fronts && len > 6) out.fronts.push({ lot, sp, A, Bp, len, shop: null, bay, nb, ti, seed, upper: true });
      }
      setShell(S, 10, 0, 1, roofRel, sp, null);
      for (let i = 0; i < n; i++) {
        const A = P[(i + 1) % n], Bp = P[i];
        const len = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
        if (len < 0.3) continue;
        const nn = inward(Bp, A);
        const a2 = [A[0] - nn[0] * 0.0, A[1] - nn[1] * 0.0];
        wall(S, [a2[0] + nn[0] * 0.3, a2[1] + nn[1] * 0.3], [Bp[0] + nn[0] * 0.3, Bp[1] + nn[1] * 0.3], t.roof, t.top);
      }
      setShell(S, 11, 0, 1, roofRel, sp, null);
      const inner = insetVerts(P, 0.3);
      zipRing(S, P, inner, t.top, (p) => [p[0], p[1]], null, null, () => {});
      setShell(S, 9, sp.seed, 1, roofRel, sp, null);
      fanUp(S, inner, t.roof, (p) => [p[0], p[1]]);
      if (t.spire) {
        const c = centroid(P);
        setShell(S, 12, sp.seed, 1, roofRel, sp, null);
        spire(S, c, t.top, t.spire);
        out.beacons?.push([c[0], t.top + t.spire + 0.5, c[1]]);
      }
    });
    roofStuff(S, lot, sp, out);
    out.maxH = Math.max(out.maxH || 0, sp.H);
  }

  function spire(S, c, y, h) {
    const segs = [[2.2, 0.3 * h], [1.4, 0.3 * h], [0.6, 0.25 * h], [0.18, 0.15 * h]];
    let yy = y;
    for (const [r, hh] of segs) { boxW(S, [c[0], yy + hh / 2, c[1]], [1, 0, 0], UP, [0, 0, 1], r, hh / 2, r, 'ny'); yy += hh; }
  }

  function roofStuff(S, lot, sp, out) {
    const t = sp.tiers[sp.tiers.length - 1];
    const r = rng((lot.seed || 3) * 13 + 5);
    const P = insetConvex(t.poly, 1.4);
    if (P.length < 3) return;
    const [x0, z0, x1, z1] = bounds(P);
    const pick = (m) => { for (let k = 0; k < 6; k++) { const x = x0 + m + r() * Math.max(0.01, x1 - x0 - 2 * m), z = z0 + m + r() * Math.max(0.01, z1 - z0 - 2 * m); if (inside(P, x, z)) return [x, z]; } return null; };
    setShell(S, 12, sp.seed, 1, t.roof - SW, sp, null);
    if (r() < 0.75 && x1 - x0 > 5 && z1 - z0 > 5) { const p = pick(1.6); if (p) boxA(S, p[0] - 1.3, t.roof, p[1] - 1.2, p[0] + 1.3, t.roof + 2.7, p[1] + 1.2, 'ny'); }
    if (sp.floors > 12 && x1 - x0 > 9 && z1 - z0 > 9) { const p = pick(3); if (p) boxA(S, p[0] - 3, t.roof, p[1] - 2.5, p[0] + 3, t.roof + 4.2, p[1] + 2.5, 'ny'); }
    const nc = 1 + ((r() * 3) | 0);
    for (let k = 0; k < nc; k++) { const p = pick(0.4); if (p) boxA(S, p[0] - 0.3, t.roof, p[1] - 0.3, p[0] + 0.3, t.roof + 1.4 + r() * 1.6, p[1] + 0.3, 'ny'); }
    if (sp.water && out.towers) {
      const p = pick(2.6);
      if (p) out.towers.push(p[0], t.roof, p[1], r() * 6.28, 0.85 + r() * 0.4);
    }
  }

  function walkBlock(L, b) {
    const W = L.walk;
    const kr = roundKerb(b.kerb, b.tags, isRoad);
    const K = kr.poly;
    const set = (s, y) => { W.c.aSurf[0] = s; W.c.aSurf[1] = y; };
    const n = K.length;
    set(1, 0);
    for (let i = 0; i < n; i++) {
      if (!isRoad(kr.tags[i])) continue;
      const f = frame(K[i], K[(i + 1) % n], 0);
      quad(W, [f.P(0, -0.04, 0), f.P(f.L, -0.04, 0), f.P(f.L, SW, 0), f.P(0, SW, 0)], f.n3, [[0, 0], [f.L, 0], [f.L, 0.19], [0, 0.19]]);
      const g = frame(K[i], K[(i + 1) % n], SW + 0.003);
      quad(W, [g.P(0, 0, 0), g.P(g.L, 0, 0), g.P(g.L, 0, -0.26), g.P(0, 0, -0.26)], UP, [[K[i][0], K[i][1]], [K[(i + 1) % n][0], K[(i + 1) % n][1]], [g.L, 0.26], [0, 0.26]]);
    }
    const lot = b.lot && b.lot.length >= 3 ? b.lot : null;
    const inner = b.kind === 'park' ? 2 : b.kind === 'landmark' || b.kind === 'island' ? 3 : 0;
    if (lot) {
      zipRing(W, K, lot, SW, (p) => [p[0], p[1]], [0, 0], [0, 1], (a) => set(0, a ? a[1] : 0));
      set(inner, 1);
      fanUp(W, lot, SW, (p) => [p[0], p[1]]);
    } else { set(inner === 2 ? 0 : inner, 0.5); fanUp(W, K, SW, (p) => [p[0], p[1]]); }
    return kr;
  }

  function gutter(D, kr) {
    const K = kr.poly, n = K.length;
    D.c.aDec[0] = 0;
    for (let i = 0; i < n; i++) {
      const t = kr.tags[i];
      if (!isRoad(t)) continue;
      const A = K[i], Bp = K[(i + 1) % n];
      const f = frame(A, Bp, 0);
      const b = D.nv;
      D.c.aDec[1] = 1; D.c.aDec[2] = 0;
      D.v(A[0], 0.004, A[1], 0, 1, 0, A[0], A[1]); D.v(Bp[0], 0.004, Bp[1], 0, 1, 0, Bp[0], Bp[1]);
      D.c.aDec[1] = 0;
      const o0 = f.P(0, 0.004 - 0, 1.25), o1 = f.P(f.L, 0, 1.25);
      D.v(o0[0], 0.004, o0[2], 0, 1, 0, o0[0], o0[2]); D.v(o1[0], 0.004, o1[2], 0, 1, 0, o1[0], o1[2]);
      const s = (Bp[0] - A[0]) * (o0[2] - A[1]) - (Bp[1] - A[1]) * (o0[0] - A[0]);
      if (s > 0) { D.tri(b, b + 2, b + 1); D.tri(b + 1, b + 2, b + 3); } else { D.tri(b, b + 1, b + 2); D.tri(b + 1, b + 3, b + 2); }
    }
  }

  function strip(D, a, b, w, type, y = 0.006, dash = 0, gap = 0) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 0.05) return;
    const u = [dx / L, dz / L], nx = -u[1] * w / 2, nz = u[0] * w / 2;
    D_type(D, type);
    const piece = (s0, s1) => {
      const p0 = [a[0] + u[0] * s0, a[1] + u[1] * s0], p1 = [a[0] + u[0] * s1, a[1] + u[1] * s1];
      const c = D.nv;
      D.v(p0[0] + nx, y, p0[1] + nz, 0, 1, 0, p0[0], p0[1]); D.v(p1[0] + nx, y, p1[1] + nz, 0, 1, 0, p1[0], p1[1]);
      D.v(p1[0] - nx, y, p1[1] - nz, 0, 1, 0, p1[0], p1[1]); D.v(p0[0] - nx, y, p0[1] - nz, 0, 1, 0, p0[0], p0[1]);
      const s = u[0] * nz - u[1] * nx;
      if (s > 0) { D.tri(c, c + 2, c + 1); D.tri(c, c + 3, c + 2); } else { D.tri(c, c + 1, c + 2); D.tri(c, c + 2, c + 3); }
    };
    if (!dash) { piece(0, L); return; }
    for (let s = 0; s < L; s += dash + gap) piece(s, Math.min(L, s + dash));
  }
  let D = null;
  function D_type(B, t) { B.c.aDec[0] = t; B.c.aDec[1] = 0; B.c.aDec[2] = 0; }

  function clearance(nodeId, lane) {
    const ls = nodeLanes.get(nodeId) || [];
    if (ls.length <= 2) return 0;
    let w = 0;
    for (const o of ls) if (o !== lane) w = Math.max(w, o.width);
    return w / 2 + 4.6;
  }

  function lanePaint(Dc, ln) {
    if (ln.kind === 'ring') return;
    const pts = ln.pts;
    const total = pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
    const c0 = clearance(ln.from, ln), c1 = clearance(ln.to, ln);
    if (total - c0 - c1 < 2) return;
    const two = ln.lanes[0] > 0 && ln.lanes[1] > 0;
    const lw = ln.laneW || 3.5;
    const offs = [];
    if (two) {
      offs.push([0.12, 'y'], [-0.12, 'y']);
      for (let k = 1; k < ln.lanes[0]; k++) offs.push([lw * k, 'w']);
      for (let k = 1; k < ln.lanes[1]; k++) offs.push([-lw * k, 'w']);
    } else {
      const n = ln.lanes[0] + ln.lanes[1];
      const left = -ln.width / 2 + (ln.park?.[0] ? 2.4 : 0);
      for (let k = 1; k < n; k++) offs.push([left + lw * k, 'w']);
    }
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const s0 = Math.max(0, c0 - acc), s1 = Math.min(L, total - c1 - acc);
      acc += L;
      if (s1 - s0 < 0.5) continue;
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], r = [-u[1], u[0]];
      for (const [o, kind] of offs) {
        const A = [a[0] + u[0] * s0 + r[0] * o, a[1] + u[1] * s0 + r[1] * o], Bq = [a[0] + u[0] * s1 + r[0] * o, a[1] + u[1] * s1 + r[1] * o];
        if (kind === 'y') strip(Dc, A, Bq, 0.11, 2);
        else strip(Dc, A, Bq, 0.12, 1, 0.006, 3, 9);
      }
    }
    for (const [end, cl] of [[0, c0], [1, c1]]) {
      if (cl <= 0) continue;
      const nodeId = end ? ln.to : ln.from;
      if (!sigByNode.has(nodeId)) continue;
      const toward = end === 1 ? ln.lanes[0] > 0 : ln.lanes[1] > 0;
      if (!toward) continue;
      const a = end ? pts[pts.length - 1] : pts[0], b = end ? pts[pts.length - 2] : pts[1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < cl + 1) continue;
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], r = [-u[1], u[0]];
      const c = [a[0] + u[0] * (cl - 0.4), a[1] + u[1] * (cl - 0.4)];
      const e = ln.width / 2 - 0.3;
      if (two) strip(Dc, [c[0] - r[0] * 0.25, c[1] - r[1] * 0.25], [c[0] - r[0] * e, c[1] - r[1] * e], 0.45, 1);
      else strip(Dc, [c[0] - r[0] * e, c[1] - r[1] * e], [c[0] + r[0] * e, c[1] + r[1] * e], 0.45, 1);
    }
  }

  function crosswalk(Dc, a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 3) return;
    const u = [dx / L, dz / L], r = [-u[1], u[0]];
    for (const o of [-1.68, 1.68]) strip(Dc, [a[0] + r[0] * o, a[1] + r[1] * o], [b[0] + r[0] * o, b[1] + r[1] * o], 0.15, 1, 0.007);
    for (let s = 0.6; s < L - 0.3; s += 1.2) {
      const p = [a[0] + u[0] * s, a[1] + u[1] * s];
      strip(Dc, [p[0] - r[0] * 1.55, p[1] - r[1] * 1.55], [p[0] + r[0] * 1.55, p[1] + r[1] * 1.55], 0.6, 3, 0.007);
    }
  }

  function parkPaths(W, ch) {
    W.c.aSurf[0] = 4; W.c.aSurf[1] = 0;
    for (const p of ch.paths) {
      const dx = p.b[0] - p.a[0], dz = p.b[1] - p.a[1], L = Math.hypot(dx, dz);
      if (L < 0.1) continue;
      const u = [dx / L, dz / L], r = [-u[1] * p.w / 2, u[0] * p.w / 2];
      const a0 = [p.a[0] - u[0] * p.w * 0.45, p.a[1] - u[1] * p.w * 0.45], b0 = [p.b[0] + u[0] * p.w * 0.45, p.b[1] + u[1] * p.w * 0.45];
      quad(W, [[a0[0] + r[0], SW + 0.012, a0[1] + r[1]], [b0[0] + r[0], SW + 0.012, b0[1] + r[1]], [b0[0] - r[0], SW + 0.012, b0[1] - r[1]], [a0[0] - r[0], SW + 0.012, a0[1] - r[1]]], UP, [[a0[0], a0[1]], [b0[0], b0[1]], [b0[0], b0[1]], [a0[0], a0[1]]]);
    }
    for (const pd of map.water.ponds) {
      const [cx, cz] = centroid(pd.poly);
      if (ckey(cx, cz) !== ch.key) continue;
      const P = orient(pd.poly);
      W.c.aSurf[0] = 3; W.c.aSurf[1] = 0;
      for (let i = 0; i < P.length; i++) {
        const f = frame(P[i], P[(i + 1) % P.length], SW + 0.02);
        quad(W, [f.P(-0.6, 0, 0), f.P(f.L + 0.6, 0, 0), f.P(f.L + 0.6, 0, 1.4), f.P(-0.6, 0, 1.4)], UP, [[0, 0], [f.L, 0], [f.L, 1.4], [0, 1.4]]);
      }
      W.c.aSurf[0] = 5;
      earUp(W, P, SW + 0.015);
    }
  }

  function cornice(T, f, y, style, col, proj0 = 0) {
    T.c.color.set(col);
    if (style === 'deep' || style === 'bracket') {
      const proj = (style === 'deep' ? 0.75 : 0.5) + proj0;
      fbox(T, f, -0.1, f.L + 0.1, y - 0.1, y + 0.55, proj, -0.02, 'nz');
      fbox(T, f, -0.05, f.L + 0.05, y - 0.42, y - 0.1, proj * 0.45, -0.02, 'nzpy');
      fbox(T, f, -0.12, f.L + 0.12, y + 0.55, y + 0.68, proj + 0.06, -0.02, 'nz');
      const nb = Math.max(2, Math.round(f.L / 1.3));
      for (let k = 0; k <= nb; k++) { const s = 0.15 + (f.L - 0.3) * k / nb; fbox(T, f, s - 0.09, s + 0.09, y - 0.62, y - 0.1, proj * 0.9, 0.0, 'nzpy'); }
    } else fbox(T, f, -0.04, f.L + 0.04, y - 0.2, y + 0.08, 0.22, -0.02, 'nz');
  }

  const TRIM = [[0.72, 0.68, 0.6], [0.6, 0.57, 0.5], [0.16, 0.17, 0.16], [0.3, 0.22, 0.16], [0.55, 0.5, 0.44], [0.42, 0.44, 0.42]];
  const AWN = [[0.05, 0.25, 0.1], [0.45, 0.04, 0.03], [0.06, 0.12, 0.38], [0.36, 0.2, 0.05]];

  function signQuad(G, f, cell, atlasI, s0, s1, y0, y1, d, lit, flick) {
    if (!cell) return;
    G.c.aLit[0] = lit; G.c.aLit[1] = flick; G.c.aLit[2] = atlasI;
    const [u0, v0, du, dv] = cell.uv;
    const uv = atlasI === 0 ? [[u0, v0], [u0 + du, v0], [u0 + du, v0 + dv], [u0, v0 + dv]] : [[u0, v0 + dv], [u0 + du, v0 + dv], [u0 + du, v0], [u0, v0]];
    const F = { ...f, P: (s, y, dd) => f.P(f.L - s, y, dd) };
    quad(G, [F.P(s0, y0, d), F.P(s1, y0, d), F.P(s1, y1, d), F.P(s0, y1, d)], f.n3, uv);
  }

  function dressFront(L, fr, out) {
    const { lot, sp, A, Bp, len, shop, ti } = fr;
    const T = L.trim, I = L.iron, G = L.signs;
    const f = frame(A, Bp);
    const r = rng((lot.seed || 5) * 3 + Math.round(A[0] * 7 + A[1] * 13));
    const trimCol = TRIM[(sp.tint * TRIM.length) | 0];
    const t = sp.tiers[ti];
    if (sp.kind !== 7 && sp.kind !== 8 && !lot.special) cornice(T, f, t.roof - SW, lot.use === 'castiron' || lot.use === 'prewar' ? 'deep' : sp.cornice, r() < 0.5 ? trimCol : TRIM[2 + ((r() * 3) | 0)]);
    else if (!lot.special) { T.c.color.set([0.25, 0.26, 0.27]); fbox(T, f, -0.04, f.L + 0.04, t.top - SW - 0.02, t.top - SW + 0.12, 0.08, -0.3, 'nz'); }
    if (ti !== 0 || fr.upper) return;
    const gf = sp.U.gf;
    if (sp.kind === 6 || sp.brick === BRICK.stone) { T.c.color.set(trimCol); fbox(T, f, -0.04, f.L + 0.04, gf - 0.05, gf + 0.12, 0.1, -0.02, 'nz'); }
    if (shop && (shop.state === 1 || shop.state === 2)) {
      T.c.color.set(trimCol.map((c) => c * 0.85));
      fbox(T, f, -0.05, f.L + 0.05, gf - 0.3, gf + 0.02, 0.24, -0.02, 'nz');
      fbox(T, f, shop.s0 - 0.3, shop.s0, 0, 3.25, 0.08, -0.05, 'nz');
      fbox(T, f, shop.s1, shop.s1 + 0.3, 0, 3.25, 0.08, -0.05, 'nz');
      const sw = Math.min(shop.s1 - shop.s0 - 0.3, 7.6), sc = (shop.s0 + shop.s1) / 2;
      const sh0 = Math.min(0.95, Math.max(0.6, sw / 6.5));
      const cell = shop.sign.atlas === 0 ? v1cells.get(shop.sign.key) : gcells.get(shop.sign.key);
      const lit = shop.state === 1 ? (shop.sign.atlas === 0 && cell && cell.kind === 'fascia' && cell.lit < 0.95 ? 0.85 : shop.neon ? 4.0 : 1.4) : 0.06;
      const ys = Math.min(3.35, gf - 0.3 - sh0 - 0.05);
      signQuad(G, f, cell, shop.sign.atlas, f.L - (sc + sw / 2), f.L - (sc - sw / 2), ys, ys + sh0, 0.26, lit, r() * 90);
      T.c.color.set([0.05, 0.05, 0.05]);
      fbox(T, f, sc - sw / 2 - 0.05, sc + sw / 2 + 0.05, ys - 0.05, ys + sh0 + 0.05, 0.25, 0.2, 'nz');
      if (shop.state === 2) { T.c.color.set([0.3, 0.3, 0.29]); fbox(T, f, shop.s0, shop.s1, 2.95, 3.25, 0.12, -0.06, 'nz'); }
      if (shop.awning >= 0) {
        const ac = AWN[shop.awning], a0 = shop.s0 - 0.1, a1 = shop.s1 + 0.1, ns = Math.max(2, Math.round((a1 - a0) / 0.33));
        for (let k = 0; k < ns; k++) {
          const u0 = a0 + (a1 - a0) * k / ns, u1 = a0 + (a1 - a0) * (k + 1) / ns;
          T.c.color.set(k % 2 ? [0.72, 0.7, 0.64] : ac);
          const nrm = [f.n[0] * 0.45, 0.9, f.n[1] * 0.45];
          const P1 = [f.P(u0, 3.25, 0.26), f.P(u1, 3.25, 0.26), f.P(u1, 2.5, 1.5), f.P(u0, 2.5, 1.5)];
          quad(T, P1, nrm, [[0, 0], [1, 0], [1, 1], [0, 1]]);
          quad(T, [P1[1], P1[0], P1[3], P1[2]], nrm.map((v) => -v), [[0, 0], [1, 0], [1, 1], [0, 1]]);
          panel(T, f, u0, u1, 2.22, 2.5, 1.5);
        }
      }
      if (shop.blade) {
        const bs = f.L - 1.0, y0 = gf + 0.6, y1 = y0 + 2.6;
        const key = r() < 0.5 ? 'bar_v' : 'hotel_v';
        const cell2 = v1cells.get(key);
        if (cell2) {
          G.c.aLit[0] = 4.5; G.c.aLit[1] = r() < 0.3 ? 97 + r() * 50 : r() * 90; G.c.aLit[2] = 0;
          const [u0, v0, du, dv] = cell2.uv;
          const rot = [[u0, v0 + dv], [u0, v0], [u0 + du, v0], [u0 + du, v0 + dv]];
          const P = (s, y) => f.P(bs, y, 0.15 + s);
          const nA = [-f.u3[0], 0, -f.u3[2]];
          quad(G, [P(0, y0), P(0.95, y0), P(0.95, y1), P(0, y1)], nA, [rot[1], rot[2], rot[3], rot[0]]);
          const P2 = (s, y) => f.P(bs + 0.02, y, 0.15 + s);
          quad(G, [P2(0, y0), P2(0.95, y0), P2(0.95, y1), P2(0, y1)], f.u3, [rot[2], rot[1], rot[0], rot[3]]);
          T.c.color.set([0.05, 0.05, 0.05]);
          fbox(T, f, bs - 0.03, bs + 0.05, y1 + 0.05, y1 + 0.1, 0.0, 1.15);
        }
      }
      if (shop.neon && shop.state === 1 && shop.s1 - shop.s0 > 3) {
        const key = ['open', 'cocktails', 'pizza_neon', 'rooms'][(r() * 4) | 0];
        const c3 = v1cells.get(key);
        if (c3) { const wc = shop.s0 + (shop.s1 - shop.s0) * (0.2 + r() * 0.5); signQuad(G, f, c3, 0, f.L - (wc + 0.65), f.L - (wc - 0.65), 1.55, 1.85, 0.015, 3.5, r() * 90); }
      }
      if (out.shopLights && shop.state === 1) out.shopLights.push(f.P(sc, 2.9, 0.75), [f.n[0], f.n[1]], shop.tint);
    } else if (shop && shop.state === 4) {
      T.c.color.set(trimCol);
      fbox(T, f, shop.s0 - 0.35, shop.s1 + 0.35, 3.6, 4.0, 0.3, -0.02, 'nz');
      if (shop.canopy) {
        T.c.color.set([0.06, 0.16, 0.1]);
        const c0 = (shop.s0 + shop.s1) / 2 - 1.1, c1 = c0 + 2.2;
        fbox(T, f, c0, c1, 2.75, 3.05, 0, 4.2, '');
        I.c.aIron[0] = 0;
        for (const s of [c0 + 0.08, c1 - 0.08]) fbox(I, f, s - 0.03, s + 0.03, 0, 2.75, 4.05, 4.11);
      }
      if (out.shopLights) out.shopLights.push(f.P((shop.s0 + shop.s1) / 2, 3.2, 0.9), [f.n[0], f.n[1]], 4);
    } else if (shop && shop.state === 3) {
      T.c.color.set([0.18, 0.19, 0.2]);
      fbox(T, f, shop.s0 - 0.2, shop.s1 + 0.2, 3.35, 3.55, 1.6, -0.02, 'nz');
      fbox(T, f, shop.s0 - 0.2, shop.s1 + 0.2, 0, 1.2, 0.9, -0.02, 'nz');
    } else if (shop && shop.state === 0) {
      T.c.color.set(trimCol);
      fbox(T, f, shop.s0 - 0.3, shop.s1 + 0.3, 2.75, 3.0, 0.12, -0.02, 'nz');
      fbox(T, f, shop.s0 - 0.6, shop.s1 + 0.6, 0, 0.18, 1.2, -0.02, 'nz');
      fbox(T, f, shop.s0 - 0.6, shop.s1 + 0.6, 0.18, 0.36, 0.85, -0.02, 'nz');
    }
    if (sp.fire && len > 7) fireEscape(I, f, sp, r);
  }

  function fireEscape(I, f, sp, r) {
    const nb = Math.max(2, Math.round(f.L / sp.U.bay)), bw = f.L / nb;
    const i0 = Math.max(0, Math.floor(nb / 2) - 1), i1 = Math.min(nb - 1, i0 + 1);
    const s0 = i0 * bw + 0.2, s1 = (i1 + 1) * bw - 0.2;
    const depth = 1.15, railH = 0.95;
    const floors = Math.min(sp.floors, sp.tiers[0].f);
    for (let k = 1; k < floors; k++) {
      const y = sp.U.gf + (k - 1) * sp.U.fl + 0.42;
      I.c.aIron[0] = 2;
      fbox(I, f, s0, s1, y - 0.03, y + 0.012, 0.06, depth, '');
      I.c.aIron[0] = 0;
      fbox(I, f, s0, s1, y - 0.09, y - 0.03, depth - 0.03, depth + 0.02, 'nz');
      fbox(I, f, s0, s1, y + railH - 0.03, y + railH + 0.01, depth - 0.02, depth + 0.02, 'nz');
      for (const ss of [s0, s1]) fbox(I, f, ss - 0.02, ss + 0.02, y + railH - 0.03, y + railH + 0.01, 0.0, depth, '');
      I.c.aIron[0] = 1;
      const bar = (P, n, u) => quad(I, P, n, u);
      bar([f.P(s0, y, depth), f.P(s1, y, depth), f.P(s1, y + railH, depth), f.P(s0, y + railH, depth)], f.n3, [[s0, 0], [s1, 0], [s1, railH], [s0, railH]]);
      bar([f.P(s1, y, depth), f.P(s0, y, depth), f.P(s0, y + railH, depth), f.P(s1, y + railH, depth)], [-f.n3[0], 0, -f.n3[2]], [[s1, 0], [s0, 0], [s0, railH], [s1, railH]]);
      for (const ss of [s0, s1]) {
        const nn = ss === s0 ? [-f.u3[0], 0, -f.u3[2]] : f.u3;
        bar([f.P(ss, y, 0), f.P(ss, y, depth), f.P(ss, y + railH, depth), f.P(ss, y + railH, 0)], nn, [[0, 0], [depth, 0], [depth, railH], [0, railH]]);
        bar([f.P(ss, y, depth), f.P(ss, y, 0), f.P(ss, y + railH, 0), f.P(ss, y + railH, depth)], nn.map((v) => -v), [[depth, 0], [0, 0], [0, railH], [depth, railH]]);
      }
      I.c.aIron[0] = 0;
      for (const ss of [s0 + 0.15, s1 - 0.15]) {
        const a = f.P(ss, y - 0.05, depth * 0.85), b = f.P(ss, y - 0.85, 0.02);
        const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], dv = sub3(a, b), Ld = Math.hypot(...dv);
        const ay = dv.map((v) => v / Ld), az = cross3(f.u3, ay);
        boxW(I, c, f.u3, ay, az, 0.02, Ld / 2, 0.02, 'pyny');
      }
      if (k < floors - 1) {
        const up = k % 2 === 1;
        const sa = up ? s0 + 0.35 : s1 - 0.35, sb = up ? s1 - 1.3 : s0 + 1.3;
        const yA = y, yB = y + sp.U.fl;
        const a = f.P(sa, yA, depth * 0.7), b = f.P(sb, yB, depth * 0.7);
        const dv = sub3(b, a), Ld = Math.hypot(...dv), ax = dv.map((v) => v / Ld);
        const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const az = f.n3, ay = cross3(az, ax);
        I.c.aIron[0] = 3;
        boxW(I, c, ax, ay, az, Ld / 2, 0.012, depth * 0.27, 'nxpx');
        I.c.aIron[0] = 0;
        for (const dd of [depth * 0.43, depth * 0.97]) boxW(I, [c[0] + f.n[0] * (dd - depth * 0.7), c[1] + 0.05, c[2] + f.n[1] * (dd - depth * 0.7)], ax, ay, az, Ld / 2, 0.06, 0.012, 'nxpx');
      }
      if (k === 1) {
        const ls = s0 + 0.5;
        I.c.aIron[0] = 4;
        quad(I, [f.P(ls - 0.22, y - 2.0, depth * 0.75), f.P(ls + 0.22, y - 2.0, depth * 0.75), f.P(ls + 0.22, y, depth * 0.75), f.P(ls - 0.22, y, depth * 0.75)], f.n3, [[0, 0], [0.44, 0], [0.44, 2], [0, 2]]);
        quad(I, [f.P(ls + 0.22, y - 2.0, depth * 0.75), f.P(ls - 0.22, y - 2.0, depth * 0.75), f.P(ls - 0.22, y, depth * 0.75), f.P(ls + 0.22, y, depth * 0.75)], [-f.n3[0], 0, -f.n3[2]], [[0.44, 0], [0, 0], [0, 2], [0.44, 2]]);
      }
    }
    I.c.aIron[0] = 0;
  }

  function streetTrees(ch, out) {
    for (const b of ch.blocks) {
      if (b.kind !== 'build' || !(b.district === 'village' || b.district === 'uws' || b.district === 'ues' || b.district === 'tribeca' || b.district === 'soho')) continue;
      const K = b.kerb, n = K.length;
      for (let i = 0; i < n; i++) {
        const t = b.tags[i];
        if (!isRoad(t)) continue;
        const s = seg.get(t);
        if (!s || s.kind !== 'street') continue;
        const r = rng(hashStr(b.id + ':' + i));
        if (r() > (b.district === 'tribeca' || b.district === 'soho' ? 0.25 : 0.7)) continue;
        const A = K[i], Bp = K[(i + 1) % n], f = frame(A, Bp, 0), nn = inward(A, Bp);
        for (let sx = 9 + r() * 5; sx < f.L - 9; sx += 8 + r() * 4) {
          if (r() < 0.25) continue;
          const x = A[0] + f.u[0] * sx + nn[0] * 1.0, z = A[1] + f.u[1] * sx + nn[1] * 1.0;
          if (v1zone(x, z)) continue;
          out.trees.push(x, SW, z, 0.75 + r() * 0.45, 0);
        }
      }
    }
  }

  const v1parks = map.lots.filter((l) => l.v1park);
  function parkTrees(ch, out) {
    for (const b of ch.blocks) {
      if (b.kind !== 'park' || !b.lot || b.lot.length < 3) continue;
      const P = b.lot;
      const [x0, z0, x1, z1] = bounds(P);
      const r = rng(hashStr(b.id));
      const dens = b.district === 'park' ? 1 / 70 : 1 / 110;
      const n = Math.min(260, Math.round(Math.abs(area(P)) * dens));
      for (let k = 0; k < n; k++) {
        const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
        if (!inside(P, x, z)) continue;
        let bad = false;
        for (const pd of map.water.ponds) if (inside(pd.poly, x, z)) { bad = true; break; }
        if (bad) continue;
        for (const p of ch.paths) { const dx = p.b[0] - p.a[0], dz = p.b[1] - p.a[1], L2 = dx * dx + dz * dz; const t = Math.max(0, Math.min(1, ((x - p.a[0]) * dx + (z - p.a[1]) * dz) / (L2 || 1))); if (Math.hypot(x - p.a[0] - dx * t, z - p.a[1] - dz * t) < p.w / 2 + 2.2) { bad = true; break; } }
        if (bad) continue;
        if (v1parks.some((l) => inside(l.poly, x, z))) continue;
        out.trees.push(x, SW, z, 0.9 + r() * 0.7, 1);
      }
    }
    for (const l of ch.lots) if (l.v1park) for (const [x, z] of l.v1park.trees) out.trees.push(x, SW + 0.12, z, 0.85, 1);
  }

  function parkedCars(ch, out) {
    for (const ln of ch.lanes) {
      if (!ln.park || ln.kind === 'ring' || ln.kind === 'drive' || ln.kind === 'park') continue;
      const pts = ln.pts;
      const c0 = clearance(ln.from, ln) + 2, c1 = clearance(ln.to, ln) + 2;
      const r = rng(hashStr(ln.id));
      let acc = 0;
      const total = pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], rt = [-u[1], u[0]];
        for (const side of [0, 1]) {
          if (!ln.park[side]) continue;
          const off = (side === 1 ? 1 : -1) * (ln.width / 2 - 1.25);
          const yaw0 = Math.atan2(u[0], u[1]);
          const faceFwd = ln.oneWay || side === 1;
          for (let s = 3 + r() * 4; s < L - 3; s += 5.6 + r() * 1.6) {
            const g = acc + s;
            if (g < c0 || g > total - c1) continue;
            if (r() < 0.22) { s += 4; continue; }
            const x = a[0] + u[0] * s + rt[0] * off, z = a[1] + u[1] * s + rt[1] * off;
            if (v1zone(x, z)) continue;
            let bad = false;
            for (const np of noPark) if (Math.hypot(x - np.p[0], z - np.p[1]) < np.r + 3) { bad = true; break; }
            if (bad) continue;
            out.cars.push(x, z, faceFwd ? yaw0 : yaw0 + Math.PI, (r() * 12) | 0);
          }
        }
        acc += L;
      }
    }
  }

  function manholes(ch, out) {
    for (const ln of ch.lanes) {
      if (ln.kind === 'park') continue;
      const r = rng(hashStr(ln.id) ^ 0x51);
      const pts = ln.pts;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], rt = [-u[1], u[0]];
        for (let s = 12 + r() * 20; s < L - 10; s += 32 + r() * 30) {
          const o = (r() - 0.5) * Math.min(ln.width - 6, 6);
          const x = a[0] + u[0] * s + rt[0] * o, z = a[1] + u[1] * s + rt[1] * o;
          if (v1zone(x, z)) continue;
          out.manholes.push(x, z, r() * 6.28, r() < 0.22 ? 0.5 + r() * 0.5 : 0);
        }
      }
    }
  }

  function pierGeo(L, p) {
    const W = L.walk;
    W.c.aSurf[0] = 6; W.c.aSurf[1] = 0;
    const P = p.poly;
    fanUp(W, P, p.deckY ?? SW, (q) => [q[0], q[1]]);
    for (let i = 0; i < P.length; i++) {
      const A = P[i], Bp = P[(i + 1) % P.length];
      const f = frame(A, Bp, 0);
      quad(W, [f.P(0, -2.2, 0), f.P(f.L, -2.2, 0), f.P(f.L, p.deckY ?? SW, 0), f.P(0, p.deckY ?? SW, 0)], f.n3, [[0, -2.2], [f.L, -2.2], [f.L, 0.15], [0, 0.15]]);
    }
    if (p.shed) {
      const ip = insetConvex(P, 3);
      if (ip.length >= 3) {
        const sp = { U: USE.warehouse, brick: BRICK.dark, tint: 0.3 };
        const S = L.shell;
        const top = SW + 8.5;
        for (let i = 0; i < ip.length; i++) { setShell(S, 5, 0.3 + i * 0.1, 4.2, 7, sp, null); wall(S, ip[i], ip[(i + 1) % ip.length], SW, top); }
        setShell(S, 9, 0.2, 1, 8.3, sp, null);
        fanUp(S, ip, top, (q) => [q[0], q[1]]);
      }
    }
  }

  function landmarkShell(L, lm, out) {
    if (glb.has(lm.id)) return;
    const S = L.shell;
    const P = lm.footprint;
    const c = centroid(P);
    const prism = (poly, y0, y1, kind, use, brick, seed, nf) => {
      const sp = { U: USE[use] || USE.office, brick, tint: 0.4, floors: nf };
      for (let i = 0; i < poly.length; i++) {
        const A = poly[i], Bp = poly[(i + 1) % poly.length], len = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
        if (len < 0.3) continue;
        const bay = kind === 8 ? 1.02 : len / Math.max(1, Math.round(len / sp.U.bay));
        setShell(S, kind, (seed + i * 0.17) % 1, bay, y1 - SW - 0.6, sp, null);
        wall(S, A, Bp, y0, y1);
      }
      setShell(S, 9, seed, 1, y1 - SW, sp, null);
      fanUp(S, poly, y1, (q) => [q[0], q[1]]);
      out.maxH = Math.max(out.maxH || 0, y1);
    };
    const sq = (cx, cz, h) => [[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h]];
    if (lm.id === 'wtc') {
      const [x0, z0, x1, z1] = bounds(P);
      prism(sq(x0 + 70, z0 + 50, 31.7), SW, SW + 417, 8, 'office', BRICK.stone, 0.11, 110);
      prism(sq(x0 + 140, z0 + 100, 31.7), SW, SW + 415, 8, 'office', BRICK.stone, 0.57, 110);
      setShell(S, 12, 0.3, 1, 500, { U: USE.office, brick: BRICK.stone, tint: 0.4 }, null);
      boxA(S, x0 + 70 - 1.2, SW + 417, z0 + 50 - 1.2, x0 + 70 + 1.2, SW + 417 + 100, z0 + 50 + 1.2, 'ny');
      out.beacons?.push([x0 + 70, SW + 518, z0 + 50], [x0 + 140, SW + 416, z0 + 100]);
      prism([[x1 - 60, z0 + 4], [x1 - 4, z0 + 4], [x1 - 4, z0 + 60], [x1 - 60, z0 + 60]], SW, SW + 36, 3, 'office', BRICK.dark, 0.21, 9);
      prism([[x0 + 4, z1 - 52], [x0 + 64, z1 - 52], [x0 + 64, z1 - 4], [x0 + 4, z1 - 4]], SW, SW + 36, 3, 'office', BRICK.dark, 0.71, 9);
      prism([[x1 - 50, z1 - 46], [x1 - 4, z1 - 46], [x1 - 4, z1 - 4], [x1 - 50, z1 - 4]], SW, SW + 82, 3, 'office', BRICK.dark, 0.43, 22);
    } else if (lm.id === 'sedgewick') {
      const ip = insetConvex(P, 0.5);
      prism(ip, SW, SW + 50, 6, 'prewar', BRICK.buff, 0.33, 15);
      const ip2 = insetConvex(P, 6);
      if (ip2.length >= 3) prism(ip2, SW + 50, SW + 58, 6, 'prewar', BRICK.buff, 0.63, 2);
    } else if (lm.id === 'library') {
      prism(insetConvex(P, 6), SW, SW + 26, 13, 'church', BRICK.stone, 0.5, 3);
    } else if (lm.id === 'spook_central') {
      const ip = insetConvex(P, 1);
      prism(ip, SW, SW + 62, 6, 'prewar', BRICK.stone, 0.27, 19);
      const ip2 = insetConvex(P, 8);
      if (ip2.length >= 3) prism(ip2, SW + 62, SW + 70, 6, 'prewar', BRICK.stone, 0.77, 2);
      const ip3 = insetConvex(P, 15);
      if (ip3.length >= 3) prism(ip3, SW + 70, SW + 78, 13, 'church', BRICK.stone, 0.9, 1);
    } else if (lm.id === 'times_square') {
      const [x0, z0, x1, z1] = bounds(P);
      prism([[c[0] - 9, z0 + 2], [c[0] + 9, z0 + 2], [c[0] + 9, z0 + 24], [c[0] - 9, z0 + 24]], SW, SW + 110, 3, 'office', BRICK.stone, 0.45, 25);
      if (out.boards) out.boards.push({ c: [c[0], z0 + 2], w: 16, y: SW + 40, h: 14, n: [0, -1] }, { c: [c[0], z0 + 2], w: 16, y: SW + 70, h: 12, n: [0, -1] });
      void x0; void x1; void z1;
    } else if (lm.id === 'columbus_circle') {
      setShell(S, 12, 0.4, 1, 30, { U: USE.office, brick: BRICK.stone, tint: 0.8 }, null);
      boxW(S, [c[0], SW + 1.5, c[1]], [1, 0, 0], UP, [0, 0, 1], 3.2, 1.5, 3.2, 'ny');
      boxW(S, [c[0], SW + 13, c[1]], [1, 0, 0], UP, [0, 0, 1], 0.9, 10, 0.9, 'ny');
      boxW(S, [c[0], SW + 24, c[1]], [1, 0, 0], UP, [0, 0, 1], 0.6, 1.2, 0.6, 'ny');
    }
  }

  function build(key, tier) {
    const ch = chunks.get(key);
    const tr = [];
    const E = new Float32Array(0);
    const res = { key, tier, layers: {}, inst: { towers: E, trees: E, cars: E, manholes: E, shopLights: E, beacons: E }, maxH: 0 };
    if (!ch) return { res, tr };
    const L = {};
    for (const name of TIERS[tier]) L[name] = new Buf(LAYERS[name]);
    const out = { towers: [], trees: [], cars: [], manholes: [], fronts: tier === 'A' ? [] : null, shopLights: [], beacons: [], boards: [], maxH: 0 };
    if (tier === 'B') {
      const krs = [];
      for (const b of ch.blocks) krs.push(walkBlock(L, b));
      parkPaths(L.walk, ch);
      for (const p of ch.piers) pierGeo(L, p);
      for (const lot of ch.lots) if ((lot.kind === 'building' || lot.kind === 'core' || lot.kind === 'special') && !lot.v1) shellLot(L, lot, out);
      for (const lm of ch.landmarks) landmarkShell(L, lm, out);
      streetTrees(ch, out);
      parkTrees(ch, out);
      void krs;
    } else {
      const S = { shell: new Buf(LAYERS.shell) };
      const tmp = { fronts: [], towers: null };
      for (const lot of ch.lots) if ((lot.kind === 'building' || lot.kind === 'special') && !lot.v1) shellLot(S, lot, tmp);
      for (const fr of tmp.fronts) dressFront(L, fr, out);
      D = L.decal;
      for (const b of ch.blocks) gutter(L.decal, roundKerb(b.kerb, b.tags, isRoad));
      for (const ln of ch.lanes) lanePaint(L.decal, ln);
      for (const [a, b] of ch.cross) crosswalk(L.decal, a, b);
      parkedCars(ch, out);
      manholes(ch, out);
      for (const lm of ch.landmarks) if (lm.id === 'times_square' && !glb.has(lm.id)) { const o2 = { boards: [] }; landmarkShell({ shell: new Buf(LAYERS.shell) }, lm, o2); for (const bd of o2.boards) board(L.signs, bd); }
    }
    for (const name in L) { const o = L[name].out(tr); if (o) res.layers[name] = o; }
    const f32 = (a) => { const t = new Float32Array(a); tr.push(t.buffer); return t; };
    res.inst = { towers: f32(out.towers), trees: f32(out.trees), cars: f32(out.cars), manholes: f32(out.manholes), shopLights: f32(out.shopLights.flat()), beacons: f32(out.beacons.flat()) };
    res.maxH = Math.max(out.maxH, ch.maxH);
    return { res, tr };
  }

  function board(G, bd) {
    const keys = BOARDS;
    const k = keys[(Math.abs(Math.round(bd.y * 7 + bd.c[0])) % keys.length)];
    const cell = gcells.get('board:' + k);
    const f = frame([bd.c[0] + bd.w / 2, bd.c[1]], [bd.c[0] - bd.w / 2, bd.c[1]], 0);
    signQuad(G, f, cell, 1, 0, bd.w, bd.y, bd.y + bd.h, 0.4, 3.0, 50);
  }

  function far() {
    const rows = [];
    for (const ch of chunks.values()) {
      const ci = ch.i + 8, cj = ch.j + 24;
      for (const lot of ch.lots) {
        if (!(lot.kind === 'building' || lot.kind === 'core' || lot.kind === 'special')) continue;
        if (lot.v1) continue;
        const sp = specOf(lot);
        for (const t of sp.tiers) {
          const o = obb(t.poly);
          rows.push([o.c[0], o.c[1], o.yaw, o.w, o.d, t.y0, t.top, sp.kind, sp.seed, sp.U.gf, sp.U.fl, sp.brick, ci, cj, sp.U.bay]);
        }
      }
      for (const lm of ch.landmarks) {
        if (glb.has(lm.id)) continue;
        const [x0, z0] = bounds(lm.footprint);
        if (lm.id === 'wtc') { rows.push([x0 + 70, z0 + 50, 0, 63.4, 63.4, SW, SW + 417, 8, 0.11, 6, 3.75, 4, ci, cj, 1.02]); rows.push([x0 + 140, z0 + 100, 0, 63.4, 63.4, SW, SW + 415, 8, 0.57, 6, 3.75, 4, ci, cj, 1.02]); }
        else if (lm.id === 'sedgewick' || lm.id === 'spook_central') { const o = obb(lm.footprint); rows.push([o.c[0], o.c[1], o.yaw, o.w - 2, o.d - 2, SW, SW + (lm.id === 'sedgewick' ? 50 : 62), 6, 0.4, 4.6, 3.3, 2, ci, cj, 2.9]); }
        else if (lm.id === 'times_square') { const c = centroid(lm.footprint); rows.push([c[0], z0 + 13, 0, 18, 22, SW, SW + 110, 3, 0.45, 5.2, 3.7, 4, ci, cj, 3]); }
      }
    }
    const a = new Float32Array(rows.length * 15);
    rows.forEach((r, i) => a.set(r, i * 15));
    return a;
  }

  return { C, chunks, specOf, build, far, atlas, ckey, chunk: (k) => chunks.get(k) };
}

export function cityLamps(map) {
  const out = [];
  const seg = new Map(map.streets.map((s) => [s.id, s]));
  const isRoad = (t) => !!t && t !== 'water';
  const v1zone = (x, z) => Math.abs(x) < 56 && Math.abs(z) < 56;
  const noPark = map.roads.noParking || [];
  for (const b of map.blocks) {
    const K = b.kerb, n = K.length;
    for (let i = 0; i < n; i++) {
      const t = b.tags[i];
      if (!isRoad(t)) continue;
      const A = K[i], Bp = K[(i + 1) % n];
      const L = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
      if (L < 12) continue;
      const s = seg.get(t);
      const sp = s && (s.kind === 'avenue' || s.kind === 'drive') ? 32 : t === 'RING' ? 22 : 36;
      const u = [(Bp[0] - A[0]) / L, (Bp[1] - A[1]) / L], nn = inward(A, Bp);
      const k = Math.max(1, Math.floor((L - 14) / sp) + 1);
      const r = rng(hashStr(b.id + '#' + i));
      const shift = (r() - 0.5) * sp * 0.5;
      const start = (L - (k - 1) * sp) / 2 + (k > 1 ? shift : 0);
      for (let q = 0; q < k; q++) {
        const sx = Math.max(6, Math.min(L - 6, start + q * sp));
        const x = A[0] + u[0] * sx + nn[0] * 0.55, z = A[1] + u[1] * sx + nn[1] * 0.55;
        if (v1zone(x, z)) continue;
        let bad = false;
        for (const np of noPark) if (Math.hypot(x - np.p[0], z - np.p[1]) < np.r + 1) bad = true;
        if (bad) continue;
        out.push({ x, z, dx: -nn[0], dz: -nn[1], park: false, merc: r() < 0.28 });
      }
    }
  }
  for (const pp of map.parkPaths) {
    const r = rng(hashStr(pp.id));
    let side = 1;
    for (let i = 1; i < pp.pts.length; i++) {
      const a = pp.pts[i - 1], b = pp.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], rt = [-u[1], u[0]];
      for (let s = 8 + r() * 6; s < L - 4; s += 24 + r() * 6) {
        const o = side * (pp.w / 2 + 0.6);
        side = -side;
        const x = a[0] + u[0] * s + rt[0] * o, z = a[1] + u[1] * s + rt[1] * o;
        if (v1zone(x, z)) continue;
        out.push({ x, z, dx: 0, dz: 0, park: true, merc: false });
      }
    }
  }
  for (const L of V1LAMPS) out.push({ x: L.pole[0], z: L.pole[1], dx: L.dir[0], dz: L.dir[1], park: L.type === 'park', merc: !!L.merc, v1: true });
  return out;
}

export function citySignals(map) {
  const lanes = new Map(map.roads.lanes.map((l) => [l.id, l]));
  const nodeLanes = new Map();
  for (const ln of map.roads.lanes) for (const id of [ln.from, ln.to]) { if (!nodeLanes.has(id)) nodeLanes.set(id, []); nodeLanes.get(id).push(ln); }
  const poles = [];
  const heads = [];
  map.roads.signals.forEach((s, si) => {
    const ls = nodeLanes.get(s.node) || [];
    const ns = new Set(s.groups?.ns || []);
    const local = [];
    for (const ln of ls) {
      const atEnd = ln.to === s.node;
      if (ln.oneWay && !atEnd) continue;
      const pts = ln.pts;
      const a = atEnd ? pts[pts.length - 2] : pts[1], b = atEnd ? pts[pts.length - 1] : pts[0];
      const d = norm2([b[0] - a[0], b[1] - a[1]]);
      let cross = 0;
      const grp = ns.has(ln.id) ? 0 : 1;
      for (const o of ls) if ((ns.has(o.id) ? 0 : 1) !== grp) cross = Math.max(cross, o.width);
      if (!cross) cross = 12;
      const right = [-d[1], d[0]];
      const half = ln.oneWay ? ln.width / 2 : ln.width / 2;
      const p = [s.p[0] + d[0] * (cross / 2 + 2.2) + right[0] * (half + 0.75), s.p[1] + d[1] * (cross / 2 + 2.2) + right[1] * (half + 0.75)];
      local.push({ p, yaw: Math.atan2(-d[0], -d[1]), grp, name: ln.name, d });
    }
    for (const h of local) {
      let pole = poles.find((q) => q.sig === si && Math.hypot(q.p[0] - h.p[0], q.p[1] - h.p[1]) < 3.5);
      if (!pole) { pole = { p: h.p, sig: si, names: new Set() }; poles.push(pole); }
      pole.names.add(h.name);
      heads.push({ p: pole.p, yaw: h.yaw, grp: h.grp, offset: s.offset || 0, sig: si });
    }
  });
  return { poles: poles.map((p) => ({ p: p.p, sig: p.sig, names: [...p.names] })), heads, lanes };
}
