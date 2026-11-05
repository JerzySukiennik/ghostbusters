// Traffic lane network: contract roads (city.roads) or a mapdef-derived graph -> directed driving lanes, junction turns, signal clock, kerbside parking slots.
export const CELL = 32;
const GK = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);

export function hash(a) {
  a |= 0;
  a = Math.imul(a ^ (a >>> 16), 0x45d9f3b);
  a = Math.imul(a ^ (a >>> 16), 0x45d9f3b);
  return ((a ^ (a >>> 16)) >>> 0) / 4294967296;
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

function clipSeg(a, b, B) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const p = [-dx, dx, -dz, dz], q = [a[0] - B[0], B[2] - a[0], a[1] - B[1], B[3] - a[1]];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) { if (q[i] < 0) return null; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [[a[0] + dx * t0, a[1] + dz * t0], [a[0] + dx * t1, a[1] + dz * t1], t0, t1];
}

function clipPoly(pts, B) {
  const out = [];
  let cur = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const r = clipSeg(pts[i], pts[i + 1], B);
    if (!r) { if (cur && cur.length > 1) out.push(cur); cur = null; continue; }
    if (!cur || r[2] > 1e-9) { if (cur && cur.length > 1) out.push(cur); cur = [r[0]]; }
    cur.push(r[1]);
    if (r[3] < 1 - 1e-9) { if (cur.length > 1) out.push(cur); cur = null; }
  }
  if (cur && cur.length > 1) out.push(cur);
  return out.filter((p) => Math.hypot(p[p.length - 1][0] - p[0][0], p[p.length - 1][1] - p[0][1]) > 2);
}

function segX(p0, p1, q0, q1) {
  const d1x = p1[0] - p0[0], d1z = p1[1] - p0[1], d2x = q1[0] - q0[0], d2z = q1[1] - q0[1];
  const den = d1x * d2z - d1z * d2x;
  const l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
  if (Math.abs(den) < 1e-6 * l1 * l2) return null;
  const ex = q0[0] - p0[0], ez = q0[1] - p0[1];
  let t = (ex * d2z - ez * d2x) / den, u = (ex * d1z - ez * d1x) / den;
  const et = 0.9 / l1, eu = 0.9 / l2;
  if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) return null;
  t = Math.min(1, Math.max(0, t)); u = Math.min(1, Math.max(0, u));
  return [t, u, p0[0] + d1x * t, p0[1] + d1z * t];
}

export function roadsFromMapdef(M, o = {}) {
  const B = o.bounds || null;
  const polys = [];
  const add = (pts, w, dir, name, speed) => {
    const pieces = B ? clipPoly(pts, B) : [pts];
    for (const p of pieces) polys.push({ pts: p, w, dir, name, speed });
  };
  for (const A of M.AVENUES || []) for (const s of A.segs) {
    const fast = A.id === 'L0' || A.id === 'L8';
    add([[A.x, s[0]], [A.x, s[1]]], s[4] ?? A.w, s[3] === 'n' ? 1 : s[3] === 's' ? -1 : 0, s[2], fast ? 15 : 12.5);
  }
  for (const S of M.STREETS || []) for (const s of S.segs) add([[s[0], S.z], [s[1], S.z]], s[4] ?? S.w, s[3] === 'e' ? 1 : s[3] === 'w' ? -1 : 0, s[2], 10.5);
  if (M.BROADWAY) add(M.BROADWAY.pts.map((p) => p.slice()), M.BROADWAY.w, M.BROADWAY.dir === 's' ? -1 : M.BROADWAY.dir === 'n' ? 1 : 0, 'Broadway', 11.5);
  for (const P of polys) {
    P.cs = [0];
    for (let i = 1; i < P.pts.length; i++) P.cs.push(P.cs[i - 1] + Math.hypot(P.pts[i][0] - P.pts[i - 1][0], P.pts[i][1] - P.pts[i - 1][1]));
    P.len = P.cs[P.cs.length - 1];
    P.cuts = [{ s: 0, x: P.pts[0][0], z: P.pts[0][1] }, { s: P.len, x: P.pts[P.pts.length - 1][0], z: P.pts[P.pts.length - 1][1] }];
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of P.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    P.bb = [x0 - 1, z0 - 1, x1 + 1, z1 + 1];
  }
  for (let a = 0; a < polys.length; a++) for (let b = a + 1; b < polys.length; b++) {
    const A = polys[a], C = polys[b];
    if (A.bb[0] > C.bb[2] || C.bb[0] > A.bb[2] || A.bb[1] > C.bb[3] || C.bb[1] > A.bb[3]) continue;
    for (let i = 0; i < A.pts.length - 1; i++) for (let j = 0; j < C.pts.length - 1; j++) {
      const r = segX(A.pts[i], A.pts[i + 1], C.pts[j], C.pts[j + 1]);
      if (!r) continue;
      A.cuts.push({ s: A.cs[i] + r[0] * (A.cs[i + 1] - A.cs[i]), x: r[2], z: r[3] });
      C.cuts.push({ s: C.cs[j] + r[1] * (C.cs[j + 1] - C.cs[j]), x: r[2], z: r[3] });
    }
  }
  const nodes = [], ngrid = new Map();
  const nodeAt = (x, z) => {
    const cx = Math.floor(x / 2), cz = Math.floor(z / 2);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const arr = ngrid.get(GK(cx + i, cz + j));
      if (arr) for (const n of arr) if (Math.hypot(n.p[0] - x, n.p[1] - z) < 1.5) return n;
    }
    const n = { id: 'n' + nodes.length, p: [Math.round(x * 100) / 100, Math.round(z * 100) / 100], deg: 0 };
    nodes.push(n);
    const k = GK(cx, cz);
    if (!ngrid.has(k)) ngrid.set(k, []);
    ngrid.get(k).push(n);
    return n;
  };
  const lanes = [];
  for (const P of polys) {
    P.cuts.sort((p, q) => p.s - q.s);
    const cuts = [];
    for (const c of P.cuts) if (!cuts.length || c.s - cuts[cuts.length - 1].s > 1.0) cuts.push(c);
    if (cuts.length > 1 && P.len - cuts[cuts.length - 1].s > 1e-6 && P.len - cuts[cuts.length - 1].s <= 1.0) cuts[cuts.length - 1] = P.cuts[P.cuts.length - 1];
    for (let k = 0; k < cuts.length - 1; k++) {
      const c0 = cuts[k], c1 = cuts[k + 1];
      const n0 = nodeAt(c0.x, c0.z), n1 = nodeAt(c1.x, c1.z);
      if (n0 === n1) continue;
      const pts = [n0.p.slice()];
      for (let i = 1; i < P.pts.length - 1; i++) if (P.cs[i] > c0.s + 0.5 && P.cs[i] < c1.s - 0.5) pts.push(P.pts[i].slice());
      pts.push(n1.p.slice());
      const fwd = P.dir >= 0;
      n0.deg++; n1.deg++;
      lanes.push({ id: 'r' + lanes.length, from: fwd ? n0.id : n1.id, to: fwd ? n1.id : n0.id, pts: fwd ? pts : pts.reverse(), width: P.w, speed: P.speed, oneWay: P.dir !== 0, name: P.name });
    }
  }
  const signals = [];
  for (const n of nodes) if (n.deg >= 3) signals.push({ id: 's' + signals.length, node: n.id, p: n.p.slice(), groups: null });
  return { nodes: nodes.map((n) => ({ id: n.id, p: n.p })), lanes, signals };
}

export function signalClock(period = 34, green = 14.5, cycle = null) {
  if (cycle && cycle.length > 0 && cycle.ns && cycle.ew) {
    const L = cycle.length, ns = cycle.ns, ew = cycle.ew;
    return (sig, time) => {
      let t = (time + (sig.offset || 0)) % L;
      if (t < 0) t += L;
      return t >= ns[0] && t < ns[1] ? 'ns' : t >= ew[0] && t < ew[1] ? 'ew' : 'all_red';
    };
  }
  const amber = (period - 2 * green) / 2;
  return (sig, time) => {
    let t = (time + (sig.offset || 0)) % period;
    if (t < 0) t += period;
    return t < green ? 'ns' : t < green + amber ? 'all_red' : t < 2 * green + amber ? 'ew' : 'all_red';
  };
}

function dirAt(R, n) {
  const p = R.pts, m = p.length;
  const [a, b] = R.a === n ? [p[0], p[1]] : [p[m - 1], p[m - 2]];
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

function trimAt(n, R) {
  const k = n.roads.length;
  if (k >= 3) {
    let m = 0;
    for (const q of n.roads) if (q !== R) m = Math.max(m, q.w / 2);
    return m + 2.4;
  }
  if (k === 2) {
    const o = n.roads[0] === R ? n.roads[1] : n.roads[0];
    const a = dirAt(R, n), b = dirAt(o, n);
    const bend = Math.PI - Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
    return bend > 0.3 ? 4 : 0;
  }
  return 0;
}

function makeLane(pts, off, t0, t1) {
  const m = pts.length;
  const ox = new Float64Array(m), oz = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let nx = 0, nz = 0;
    if (i > 0) { const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1], l = Math.hypot(dx, dz) || 1; nx += -dz / l; nz += dx / l; }
    if (i < m - 1) { const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dz) || 1; nx += -dz / l; nz += dx / l; }
    const l = Math.hypot(nx, nz) || 1;
    nx /= l; nz /= l;
    let sc = 1;
    if (i > 0 && i < m - 1) { const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1], ll = Math.hypot(dx, dz) || 1; sc = 1 / Math.max(0.5, nx * (-dz / ll) + nz * (dx / ll)); }
    ox[i] = pts[i][0] + nx * off * sc;
    oz[i] = pts[i][1] + nz * off * sc;
  }
  const cs = [0];
  for (let i = 1; i < m; i++) cs.push(cs[i - 1] + Math.hypot(ox[i] - ox[i - 1], oz[i] - oz[i - 1]));
  const total = cs[m - 1];
  if (t0 + t1 > total - 2) { const k = Math.max(0, total - 2) / Math.max(1e-6, t0 + t1); t0 *= k; t1 *= k; }
  const a = t0, b = total - t1;
  const X = [], Z = [];
  const at = (s) => {
    let i = 1;
    while (i < m - 1 && cs[i] < s) i++;
    const t = (s - cs[i - 1]) / Math.max(1e-9, cs[i] - cs[i - 1]);
    return [ox[i - 1] + (ox[i] - ox[i - 1]) * t, oz[i - 1] + (oz[i] - oz[i - 1]) * t];
  };
  const p0 = at(a); X.push(p0[0]); Z.push(p0[1]);
  for (let i = 1; i < m - 1; i++) if (cs[i] > a + 0.05 && cs[i] < b - 0.05) { X.push(ox[i]); Z.push(oz[i]); }
  const p1 = at(b); X.push(p1[0]); Z.push(p1[1]);
  const n = X.length;
  const xs = new Float32Array(n), zs = new Float32Array(n), c = new Float32Array(n);
  for (let i = 0; i < n; i++) { xs[i] = X[i]; zs[i] = Z[i]; if (i) c[i] = c[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]); }
  const dsx = xs[1] - xs[0], dsz = zs[1] - zs[0], ls = Math.hypot(dsx, dsz) || 1;
  const dex = xs[n - 1] - xs[n - 2], dez = zs[n - 1] - zs[n - 2], le = Math.hypot(dex, dez) || 1;
  return { xs, zs, cs: c, n, len: c[n - 1], dSx: dsx / ls, dSz: dsz / ls, dEx: dex / le, dEz: dez / le, off };
}

export function buildNet(roads, o = {}) {
  const nodes = [], byId = new Map();
  for (const n of roads.nodes || []) {
    const N = { i: nodes.length, id: n.id, x: n.p[0], z: n.p[1], roads: [], inL: [], outL: [], sig: null };
    nodes.push(N); byId.set(n.id, N);
  }
  const R = [];
  for (const l of roads.lanes || []) {
    const a = byId.get(l.from), b = byId.get(l.to);
    if (!a || !b || a === b) continue;
    let pts = (l.pts && l.pts.length >= 2 ? l.pts : [[a.x, a.z], [b.x, b.z]]).filter((p, i, arr) => i === 0 || Math.hypot(p[0] - arr[i - 1][0], p[1] - arr[i - 1][1]) > 0.05);
    if (pts.length < 2) continue;
    if (Math.hypot(pts[0][0] - a.x, pts[0][1] - a.z) > Math.hypot(pts[pts.length - 1][0] - a.x, pts[pts.length - 1][1] - a.z)) pts = pts.slice().reverse();
    const w = +l.width || 10;
    let sp = +l.speed || (w >= 16 ? 12.5 : 10.5);
    if (sp > 30) sp /= 3.6;
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const road = { i: R.length, id: l.id, a, b, pts, w, speed: sp, oneWay: !!l.oneWay, name: l.name || '', len, nF: 0, nB: 0, lw: 0, parkL: 0, parkR: 0 };
    const counts = Array.isArray(l.lanes) ? l.lanes : null;
    const pk = Array.isArray(l.park) ? l.park : null;
    const def = l.parking != null ? +l.parking : w >= 9 ? 2.2 : 0;
    if (counts) {
      road.nF = Math.max(0, counts[0] | 0); road.nB = road.oneWay ? 0 : Math.max(0, counts[1] | 0);
      if (!road.nF && !road.nB) road.nF = 1;
      const lw0 = +l.laneW || 3.3, sides = pk ? (pk[0] ? 1 : 0) + (pk[1] ? 1 : 0) : 2;
      const pw = sides ? Math.min(2.6, Math.max(0, (w - (road.nF + road.nB) * lw0) / sides)) : 0;
      road.parkL = pk ? (pk[0] ? pw : 0) : pw; road.parkR = pk ? (pk[1] ? pw : 0) : pw;
      road.lw = Math.min(lw0, (w - road.parkL - road.parkR) / Math.max(1, road.nF + road.nB));
    } else {
      road.parkL = road.parkR = def;
      const drive = Math.max(3, w - 2 * def), span = road.oneWay ? drive : drive / 2;
      const n = Math.max(1, Math.min(road.oneWay ? 4 : 3, +l.lanes || Math.floor(span / 3.0)));
      road.nF = n; road.nB = road.oneWay ? 0 : n; road.lw = span / n;
    }
    R.push(road); a.roads.push(road); b.roads.push(road);
  }
  const links = [], lanes = [];
  for (const road of R) {
    road.t0 = trimAt(road.a, road);
    road.t1 = trimAt(road.b, road);
    const eR = road.w / 2 - road.parkR, eL = road.w / 2 - road.parkL;
    for (const fwd of [true, false]) {
      const n = fwd ? road.nF : road.nB;
      if (!n) continue;
      const from = fwd ? road.a : road.b, to = fwd ? road.b : road.a;
      const pts = fwd ? road.pts : road.pts.slice().reverse();
      const lw = road.lw, edge = fwd ? eR : eL;
      const L = { i: links.length, road, from, to, n, lw, w: road.w, speed: road.speed, lanes: [], next: [], rev: null, src: false, axis: 'ns', dSx: 0, dSz: 1, dEx: 0, dEz: 1, oneWay: !(road.nF && road.nB) };
      for (let k = 0; k < n; k++) {
        const ln = makeLane(pts, edge - (k + 0.5) * lw, fwd ? road.t0 : road.t1, fwd ? road.t1 : road.t0);
        ln.link = L; ln.k = k; ln.gi = lanes.length;
        L.lanes.push(ln); lanes.push(ln);
      }
      const l0 = L.lanes[0];
      L.dSx = l0.dSx; L.dSz = l0.dSz; L.dEx = l0.dEx; L.dEz = l0.dEz;
      L.axis = Math.abs(L.dEz) >= Math.abs(L.dEx) ? 'ns' : 'ew';
      from.outL.push(L); to.inL.push(L);
      links.push(L);
    }
  }
  for (const L of links) {
    for (const O of L.to.outL) if (O.road === L.road && O.to === L.from) L.rev = O;
    const opts = L.to.outL.filter((O) => O !== L.rev);
    for (const O of opts) {
      const dot = L.dEx * O.dSx + L.dEz * O.dSz, cr = L.dEx * O.dSz - L.dEz * O.dSx;
      if (dot < -0.85) continue;
      const turn = dot > 0.7 ? 0 : cr > 0 ? 1 : 2;
      L.next.push({ link: O, turn, w: turn === 0 ? (L.w >= 16 ? 5 : 3) : 1 });
    }
    L.src = L.from.inL.every((I) => I.road === L.road);
  }
  const sigs = [];
  for (const s of roads.signals || []) {
    const N = byId.get(s.node);
    if (!N) continue;
    const zph = -N.z / 11.5;
    const S = { id: s.id, node: N, p: s.p || [N.x, N.z], groups: s.groups || null, offset: s.offset ?? (zph + hash(N.i * 7919) * 4) };
    N.sig = S; sigs.push(S);
  }
  const grid = new Map();
  for (const ln of lanes) {
    const seen = new Set();
    for (let s = 0; s <= ln.len; s += 6) {
      const p = laneAt(ln, s);
      const k = GK(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL));
      if (seen.has(k)) continue;
      seen.add(k);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(ln.gi);
    }
  }
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const N of nodes) { x0 = Math.min(x0, N.x); x1 = Math.max(x1, N.x); z0 = Math.min(z0, N.z); z1 = Math.max(z1, N.z); }
  return { nodes, roads: R, links, lanes, signals: sigs, grid, bounds: [x0, z0, x1, z1], cellOf: (x, z) => grid.get(GK(Math.floor(x / CELL), Math.floor(z / CELL))) };
}

export function laneAt(ln, s) {
  const { xs, zs, cs, n } = ln;
  let i = 1;
  while (i < n - 1 && cs[i] < s) i++;
  const t = (s - cs[i - 1]) / Math.max(1e-9, cs[i] - cs[i - 1]);
  return [xs[i - 1] + (xs[i] - xs[i - 1]) * t, zs[i - 1] + (zs[i] - zs[i - 1]) * t];
}

export function signalAxis(sig, link) {
  const g = sig.groups;
  if (g && typeof g === 'object' && !Array.isArray(g)) {
    for (const k of ['ns', 'ew']) { const arr = g[k]; if (Array.isArray(arr) && (arr.includes(link.road.id) || arr.includes(link.i))) return k; }
  }
  return link.axis;
}

export function buildParking(net, o = {}) {
  const { exclude = null, seed = 1984, kinds, weights } = o;
  const X = [], Z = [], Y = [], K = [], T = [];
  const wsum = weights.reduce((a, b) => a + b, 0);
  const pick = (u) => { let acc = 0; for (let i = 0; i < weights.length; i++) { acc += weights[i] / wsum; if (u < acc) return i; } return weights.length - 1; };
  for (const R of net.roads) {
    if ((R.parkL <= 0 && R.parkR <= 0) || R.len < 20) continue;
    const pts = R.pts, m = pts.length;
    const cs = [0];
    for (let i = 1; i < m; i++) cs.push(cs[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const s0 = R.t0 + 5.5, s1 = R.len - R.t1 - 5.5;
    for (const side of [1, -1]) {
      const pw = side > 0 ? R.parkR : R.parkL;
      if (pw < 1.6) continue;
      let slot = 0;
      for (let s = s0 + hash(R.i * 31 + side) * 1.5; s < s1; s += 6.4, slot++) {
        const h = hash(seed * 7 + R.i * 7349 + (side + 1) * 1931 + slot * 13);
        if (h > 0.56 || slot % 9 === 4) continue;
        let i = 1;
        while (i < m - 1 && cs[i] < s) i++;
        const t = (s - cs[i - 1]) / Math.max(1e-9, cs[i] - cs[i - 1]);
        const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1], l = Math.hypot(dx, dz) || 1;
        const hx = dx / l, hz = dz / l;
        const off = side * (R.w / 2 - Math.min(1.12, pw * 0.5 + 0.05));
        const x = pts[i - 1][0] + dx * t + -hz * off, z = pts[i - 1][1] + dz * t + hx * off;
        if (exclude && exclude(x, z)) continue;
        let k = pick(hash(h * 1e6 + 17));
        if (kinds[k] === 'boxtruck' && R.w < 11) k = 2;
        const face = side > 0 ? (R.nF ? 1 : -1) : (R.nB ? -1 : 1);
        X.push(x); Z.push(z); Y.push(Math.atan2(hx * face, hz * face)); K.push(k); T.push(Math.floor(hash(h * 1e6 + 91) * 256));
      }
    }
  }
  const n = X.length;
  const P = { n, x: Float32Array.from(X), z: Float32Array.from(Z), yaw: Float32Array.from(Y), kind: Uint8Array.from(K), tint: Uint8Array.from(T), grid: new Map() };
  for (let i = 0; i < n; i++) {
    const k = GK(Math.floor(P.x[i] / CELL), Math.floor(P.z[i] / CELL));
    if (!P.grid.has(k)) P.grid.set(k, []);
    P.grid.get(k).push(i);
  }
  P.cell = (cx, cz) => P.grid.get(GK(cx, cz));
  return P;
}
