// Map generator: mapdef -> map.json (streets, blocks, lots, landmark lots, water, parks, lane graph, signals, sidewalk graph, mission sites); pure JS, runs in Node and the browser.
import * as D from './mapdef.js';
import { area, orient, centroid, bounds, inward, clipHalf, clipHalfTagged, segHit, segDist, segClosest, inside, plen, along, norm2, circlePoly, rng, hashStr, r1, r2 } from './geom.js';
import { BUILDINGS as V1B, PARK as V1PARK, HOTDOG as V1HOTDOG } from '../world/layout.js';

const SW = D.SIDEWALK_H;
const uniq = (a) => [...new Set(a.map((v) => +v.toFixed(3)))].sort((p, q) => p - q);
const rp = (p) => [r2(p[0]), r2(p[1])];
const rpoly = (poly) => poly.map(rp);
const SPEED = { avenue: 11.2, street: 8.9, drive: 13.4, park: 11.2, ring: 8.0 };
const DRIVES = new Set(['L0', 'L8']);

const STYLE = {
  battery: { floors: [4, 6], w: [12, 20], depth: 24, use: 'office', bricks: ['buff', 'stone'] },
  fidi: { floors: [9, 24], tall: [0.3, 26, 52], w: [16, 34], depth: 30, use: 'office', bricks: ['buff', 'stone', 'dark', 'buff'] },
  tribeca: { floors: [5, 8], w: [10, 24], depth: 26, use: 'warehouse', bricks: ['red', 'orange', 'dark', 'buff', 'red'] },
  chinatown: { floors: [4, 6], w: [6.5, 10], depth: 20, use: 'tenement', bricks: ['red', 'dark', 'orange', 'buff'] },
  soho: { floors: [5, 7], w: [8, 16], depth: 26, use: 'castiron', bricks: ['buff', 'stone', 'red', 'dark'] },
  village: { floors: [4, 6], w: [6.5, 10], depth: 19, use: 'tenement', bricks: ['red', 'orange', 'dark', 'red', 'buff'] },
  midtown: { floors: [10, 26], tall: [0.25, 28, 48], w: [14, 34], depth: 30, use: 'office', bricks: ['buff', 'stone', 'dark', 'red'] },
  times: { floors: [6, 14], tall: [0.2, 20, 36], w: [10, 22], depth: 26, use: 'office', bricks: ['buff', 'dark', 'red'], neon: true },
  uws: { floors: [6, 14], w: [10, 26], depth: 26, use: 'prewar', bricks: ['buff', 'red', 'dark', 'orange'] },
  cpw: { floors: [14, 20], w: [20, 36], depth: 30, use: 'prewar', bricks: ['buff', 'stone', 'buff'] },
  ues: { floors: [8, 16], w: [12, 28], depth: 26, use: 'prewar', bricks: ['buff', 'red', 'stone'] },
};

function buildSegs() {
  const segs = [];
  for (const A of D.AVENUES) A.segs.forEach((s, k) => {
    const [z0, z1, name, dir, w, walk] = s;
    const kind = DRIVES.has(A.id) ? 'drive' : 'avenue';
    segs.push({ id: `${A.id}.${k}`, line: A.id, axis: 'z', c: A.x, a: Math.min(z0, z1), b: Math.max(z0, z1), name, dir: dir || 0, w: w ?? A.w, walk: walk ?? A.walk, kind });
  });
  for (const S of D.STREETS) S.segs.forEach((s, k) => {
    const [x0, x1, name, dir] = s;
    const kind = /Transverse|Terrace Dr/.test(name) ? 'park' : 'street';
    segs.push({ id: `${S.id}.${k}`, line: S.id, axis: 'x', c: S.z, a: Math.min(x0, x1), b: Math.max(x0, x1), name, dir: dir || 0, w: S.w, walk: S.walk, kind });
  });
  const B = D.BROADWAY;
  for (let k = 0; k < B.pts.length - 1; k++) {
    const p0 = B.pts[k], p1 = B.pts[k + 1];
    segs.push({ id: `BWY.${k}`, line: 'BWY', axis: 'd', p0, p1, name: B.name, dir: B.dir, w: B.w, walk: B.walk, kind: 'avenue',
      bx0: Math.min(p0[0], p1[0]), bx1: Math.max(p0[0], p1[0]), bz0: Math.min(p0[1], p1[1]), bz1: Math.max(p0[1], p1[1]), n: inward(p0, p1) });
  }
  const C = D.CIRCLE;
  segs.push({ id: 'RING', line: 'RING', axis: 'r', name: 'Columbus Circle', dir: 'ccw', w: C.rOut - C.rIn, walk: 6, kind: 'ring', c: C.c, r: (C.rIn + C.rOut) / 2 });
  return segs;
}

function districtAt(x, z) {
  let d = 'tribeca';
  for (const q of D.DISTRICTS) if (z >= q.z[0] && z <= q.z[1] && (!q.x || (x >= q.x[0] && x <= q.x[1]))) { d = q.id; break; }
  return d;
}
function subAt(x, z) {
  for (const q of D.SUBDISTRICTS) if (x >= q.x[0] && x <= q.x[1] && z >= q.z[0] && z <= q.z[1]) return q.id;
  return null;
}

function clipTagged(poly, tags, P, n, c, tag) {
  const r = clipHalfTagged(poly, tags, P, n, c, tag);
  return r.poly.length >= 3 ? r : { poly: [], tags: [] };
}

function insetTagged(poly, tags, dist) {
  let p = poly, t = tags;
  const lines = poly.map((a, i) => ({ a, n: inward(a, poly[(i + 1) % poly.length]), d: dist(tags[i]), tag: tags[i] }));
  for (const L of lines) {
    if (!(L.d > 0)) continue;
    ({ poly: p, tags: t } = clipTagged(p, t, [L.a[0] + L.n[0] * L.d, L.a[1] + L.n[1] * L.d], L.n, 0, L.tag));
    if (p.length < 3) return { poly: [], tags: [] };
  }
  return { poly: p, tags: t };
}

function angExtent(poly, c) {
  const a = poly.map((v) => Math.atan2(v[1] - c[1], v[0] - c[0])).sort((p, q) => p - q);
  let gi = 0, gap = -1;
  for (let i = 0; i < a.length; i++) {
    const g = i === a.length - 1 ? a[0] + Math.PI * 2 - a[i] : a[i + 1] - a[i];
    if (g > gap) { gap = g; gi = i; }
  }
  const a0 = a[(gi + 1) % a.length];
  let a1 = a[gi];
  if (a1 < a0) a1 += Math.PI * 2;
  return [a0, a1];
}

function carveRing(pc, C) {
  const [a0, a1] = angExtent(pc.poly, C.c);
  const K = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 18)) + 1);
  let { poly, tags } = pc;
  for (let k = 0; k < K; k++) {
    const t = a0 + (a1 - a0) * k / (K - 1);
    ({ poly, tags } = clipTagged(poly, tags, C.c, [Math.cos(t), Math.sin(t)], C.rOut, 'RING'));
    if (poly.length < 3) break;
  }
  return { ...pc, poly, tags };
}

class UF {
  constructor() { this.p = new Map(); }
  find(a) { let r = a; while (this.p.has(r) && this.p.get(r) !== r) r = this.p.get(r); this.p.set(a, r); return r; }
  join(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(rb < ra ? ra : rb, rb < ra ? rb : ra); }
}

function sideSpan(poly, tags, axis, v) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    if (tags[i] !== null) continue;
    const a = poly[i], b = poly[(i + 1) % poly.length], k = axis === 'x' ? 0 : 1, o = 1 - k;
    if (Math.abs(a[k] - v) < 0.02 && Math.abs(b[k] - v) < 0.02) { lo = Math.min(lo, a[o], b[o]); hi = Math.max(hi, a[o], b[o]); }
  }
  return hi > lo ? [lo, hi] : null;
}

export function generateMap({ seed = 1984 } = {}) {
  const segs = buildSegs();
  const segById = new Map(segs.map((s) => [s.id, s]));
  const bwy = segs.filter((s) => s.axis === 'd');
  const C = D.CIRCLE;
  const X = uniq([...D.AVENUES.map((a) => a.x), ...D.XLINES]);
  const Z = uniq([...D.STREETS.map((s) => s.z), ...D.ZLINES]);
  const land = orient(D.LAND.map((p) => p.slice()));
  const aveAt = (x, z) => segs.find((s) => s.axis === 'z' && Math.abs(s.c - x) < 0.01 && z > s.a && z < s.b) || null;
  const stAt = (z, x) => segs.find((s) => s.axis === 'x' && Math.abs(s.c - z) < 0.01 && x > s.a && x < s.b) || null;
  const walkOf = (tag) => (tag && segById.has(tag) ? segById.get(tag).walk : 0);

  const pieces = [];
  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Z.length - 1; j++) {
    const x0 = X[i], x1 = X[i + 1], z0 = Z[j], z1 = Z[j + 1], xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
    const rN = stAt(z0, xm), rS = stAt(z1, xm), rW = aveAt(x0, zm), rE = aveAt(x1, zm);
    const ix0 = x0 + (rW ? rW.w / 2 : 0), ix1 = x1 - (rE ? rE.w / 2 : 0), iz0 = z0 + (rN ? rN.w / 2 : 0), iz1 = z1 - (rS ? rS.w / 2 : 0);
    if (ix1 - ix0 < 1 || iz1 - iz0 < 1) continue;
    let poly = [[ix0, iz0], [ix1, iz0], [ix1, iz1], [ix0, iz1]], tags = [rN?.id ?? null, rE?.id ?? null, rS?.id ?? null, rW?.id ?? null];
    for (let k = 0; k < land.length && poly.length >= 3; k++) {
      const a = land[k], b = land[(k + 1) % land.length];
      ({ poly, tags } = clipTagged(poly, tags, a, inward(a, b), 0, 'water'));
    }
    if (poly.length < 3 || area(poly) < 4) continue;
    let parts = [{ poly, tags, side: '' }];
    for (const b of bwy) {
      if (!(x0 >= b.bx0 - 0.01 && x1 <= b.bx1 + 0.01 && z0 >= b.bz0 - 0.01 && z1 <= b.bz1 + 0.01)) continue;
      const out = [];
      for (const p of parts) {
        const d = p.poly.map((v) => (v[0] - b.p0[0]) * b.n[0] + (v[1] - b.p0[1]) * b.n[1]);
        if (Math.max(...d) > b.w / 2) { const r = clipTagged(p.poly, p.tags, b.p0, b.n, b.w / 2, b.id); if (r.poly.length >= 3) out.push({ ...r, side: p.side + 'a' }); }
        if (Math.min(...d) < -b.w / 2) { const r = clipTagged(p.poly, p.tags, b.p0, [-b.n[0], -b.n[1]], b.w / 2, b.id); if (r.poly.length >= 3) out.push({ ...r, side: p.side + 'b' }); }
      }
      parts = out;
    }
    parts = parts.map((p) => (inside(p.poly, C.c[0], C.c[1]) || p.poly.some((v) => Math.hypot(v[0] - C.c[0], v[1] - C.c[1]) < C.rOut + 1) || segDistPoly(p.poly, C.c) < C.rOut ? carveRing(p, C) : p))
      .filter((p) => p.poly.length >= 3 && area(p.poly) > 4);
    for (const p of parts) pieces.push({ id: `k${i}_${j}${p.side}`, i, j, x0, z0, x1, z1, poly: p.poly, tags: p.tags, kind: 'build' });
  }

  for (const sp of D.SPECIAL) {
    if (!sp.split) continue;
    const k = pieces.findIndex((p) => inside(p.poly, sp.at[0], sp.at[1]));
    if (k < 0) continue;
    const p = pieces[k], ax = sp.split.axis === 'x' ? [1, 0] : [0, 1], P = sp.split.axis === 'x' ? [sp.split.v, 0] : [0, sp.split.v];
    const A = clipTagged(p.poly, p.tags, P, ax, 0, null), B = clipTagged(p.poly, p.tags, P, [-ax[0], -ax[1]], 0, null);
    const keep = sp.split.side > 0 ? A : B, other = sp.split.side > 0 ? B : A;
    pieces.splice(k, 1, { ...p, id: p.id + 'L', poly: keep.poly, tags: keep.tags, split: sp.id }, { ...p, id: p.id + 'M', poly: other.poly, tags: other.tags, splitOther: sp });
  }

  const byCell = new Map();
  for (const p of pieces) { const key = p.i + ',' + p.j; if (!byCell.has(key)) byCell.set(key, []); byCell.get(key).push(p); }
  const uf = new UF();
  for (const p of pieces) uf.find(p.id);
  for (const p of pieces) {
    for (const [di, dj, axis, v] of [[1, 0, 'x', X[p.i + 1]], [0, 1, 'z', Z[p.j + 1]]]) {
      const sa = sideSpan(p.poly, p.tags, axis, v);
      if (!sa) continue;
      for (const q of byCell.get((p.i + di) + ',' + (p.j + dj)) || []) {
        const sb = sideSpan(q.poly, q.tags, axis, v);
        if (sb && Math.min(sa[1], sb[1]) - Math.max(sa[0], sb[0]) > 0.5) uf.join(p.id, q.id);
      }
    }
  }
  for (const p of pieces) {
    p.group = uf.find(p.id);
    const [cx, cz] = centroid(p.poly);
    p.district = districtAt(cx, cz);
    p.sub = subAt(cx, cz);
    if (p.x1 <= -365 + 0.01 || p.x0 >= 490 - 0.01) p.kind = p.z0 >= 640 - 0.01 ? 'park' : 'waterfront';
    if (p.z0 >= 640 - 0.01) { p.kind = 'park'; p.park = 'battery_park'; }
    if (p.x0 >= -120 - 0.01 && p.x1 <= 250 + 0.01 && p.z1 <= -1370 + 0.01) { p.kind = 'park'; p.park = 'central_park'; }
    if (p.kind === 'waterfront' && p.z0 >= 640 - 0.01) p.park = 'battery_park';
    if (p.splitOther) {
      const so = p.splitOther.split;
      if (so.other === 'park') { p.kind = 'park'; p.park = so.otherId; p.parkName = so.otherName; }
    }
  }
  const groupOf = (id) => pieces.filter((p) => p.group === id);
  const landmarks = [];
  for (const sp of D.SPECIAL) {
    const host = pieces.find((p) => inside(p.poly, sp.at[0], sp.at[1]) && !p.splitOther);
    if (!host) continue;
    if (sp.kind === 'landmark') {
      for (const p of groupOf(host.group)) if (p.kind === 'build' && !p.splitOther) { p.kind = 'landmark'; p.landmark = sp.id; }
      landmarks.push({ id: sp.id, name: sp.name, frontDir: sp.frontDir, host: host.group });
    } else if (sp.kind === 'park') {
      for (const p of groupOf(host.group)) if (p.kind === 'build') { p.kind = 'park'; p.park = sp.id; p.parkName = sp.name; }
    } else {
      host.special = sp;
      if (sp.kind === 'church') for (const p of groupOf(host.group)) if (p !== host && p.kind === 'build') { p.kind = 'park'; p.park = sp.id + '_yard'; p.parkName = sp.name + ' churchyard'; }
    }
  }

  const V1Z = D.V1ZONES;
  const blocks = [], lots = [];
  const parks = new Map();
  const addPark = (id, name, poly) => { if (!parks.has(id)) parks.set(id, { id, name, polys: [] }); parks.get(id).polys.push(rpoly(poly)); };
  const parkNames = { battery_park: 'The Battery', central_park: 'Central Park' };
  for (const sp of D.SPECIAL) if (sp.kind === 'park') parkNames[sp.id] = sp.name;

  for (const p of pieces) {
    const L = insetTagged(p.poly, p.tags, (t) => (t === 'water' ? 0 : walkOf(t)));
    p.lot = L.poly; p.lotTags = L.tags;
    const blk = { id: p.id, group: p.group, kind: p.kind, district: p.district, kerb: rpoly(p.poly), tags: p.tags, lot: rpoly(p.lot), lotTags: p.lotTags };
    if (p.sub) blk.sub = p.sub;
    if (p.park) blk.park = p.park;
    if (p.landmark) blk.landmark = p.landmark;
    blocks.push(blk);
    if (p.lot.length < 3) continue;
    if (p.kind === 'park') addPark(p.park, p.parkName || parkNames[p.park] || p.park, p.lot);
  }
  blocks.push({ id: 'columbus_island', group: 'columbus_island', kind: 'island', district: 'midtown', kerb: rpoly(circlePoly(C.c, C.rIn, 32)), tags: new Array(32).fill('RING'), lot: rpoly(circlePoly(C.c, C.rIn - 3, 32)), lotTags: new Array(32).fill(null), landmark: 'columbus_circle' });

  for (const p of pieces) {
    if (p.lot.length < 3) continue;
    if (p.kind === 'build') makeLots(p, lots, segById, V1Z);
    if (p.kind === 'landmark' && !p.landmarkDone) {
      const grp = pieces.filter((q) => q.landmark === p.landmark);
      grp.forEach((q) => (q.landmarkDone = true));
      const lm = landmarks.find((l) => l.id === p.landmark);
      lm.footprint = unionFootprint(grp.map((q) => q.lot));
      lm.blocks = grp.map((q) => q.id);
    }
  }
  const fh = D.FIREHOUSE;
  const fhPoly = [[fh.box[0], fh.box[1]], [fh.box[2], fh.box[1]], [fh.box[2], fh.box[3]], [fh.box[0], fh.box[3]]];
  landmarks.unshift({ id: 'firehouse', name: fh.name, address: fh.address, frontDir: fh.frontDir, footprint: fhPoly, floorY: fh.floorY, door: [fh.door, fh.box[3]], driveway: fh.driveway });
  landmarks.push({ id: 'columbus_circle', name: 'Columbus Circle', frontDir: [0, 1], footprint: circlePoly(C.c, C.rIn, 32), centre: C.c });
  for (const lm of landmarks) {
    const bb = bounds(lm.footprint);
    const c = lm.centre || (area(lm.footprint) / ((bb[2] - bb[0]) * (bb[3] - bb[1])) > 0.97 ? [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2] : centroid(lm.footprint));
    const fd = norm2(lm.frontDir || [0, 1]);
    lm.anchor = { pos: [r2(c[0]), SW, r2(c[1])], yaw: r2(Math.atan2(fd[0], fd[1]) * 1e3) / 1e3 };
    lm.frontDir = fd.map(r2);
    lm.footprint = rpoly(lm.footprint);
    lm.size = [r2(bb[2] - bb[0]), r2(bb[3] - bb[1])];
    delete lm.host;
  }
  const fhl = landmarks[0];
  fhl.anchor = { pos: [r2((fh.box[0] + fh.box[2]) / 2), SW, fh.box[3]], yaw: 0 };
  fhl.anchorNote = 'firehouse anchor = centre of the N Moore St facade line at sidewalk level; GLB +Z faces the street';

  const roads = buildRoads(segs, segById);
  const walks = buildWalks(pieces, segById, roads);
  const water = buildWater(land);
  for (const f of ['pond', 'lake']) { const q = D.PARK_FEATURES[f]; water.ponds.push({ id: q.id, name: q.name, poly: rpoly(orient(q.poly)), y: -0.45 }); }
  const lotIndex = gridIndex(lots.filter((l) => l.kind !== 'park').map((l) => ({ poly: l.poly, o: l })), 32);
  const isBuilt = (x, z) => lotIndex(x, z).some((it) => inside(it.poly, x, z)) || landmarks.some((l) => l.id !== 'columbus_circle' && inside(l.footprint, x, z));
  const sites = buildSites(roads, walks, isBuilt, landmarks, blocks);
  const districts = D.DISTRICTS.map((d) => {
    const x = d.x || [-2600, 2600];
    let poly = [[x[0], d.z[0]], [x[1], d.z[0]], [x[1], d.z[1]], [x[0], d.z[1]]];
    for (let k = 0; k < land.length && poly.length >= 3; k++) poly = clipHalf(poly, land[k], inward(land[k], land[(k + 1) % land.length]));
    return { id: d.id, name: d.name, poly: rpoly(poly) };
  });
  const bb = bounds(land);
  return {
    version: D.VERSION, seed, generated: 'src/city/mapgen.js', units: 'm',
    frame: { north: '-Z', east: '+X', up: '+Y', origin: 'N Moore St x Varick St (V1 plate centre)', ground: 'road crown y=0, sidewalks/lots y=' + SW + ', water y=' + D.WATER_Y },
    notes: [
      'blocks: kerb = kerb polygon (CCW in x/z, interior left of each edge), tags[i] = street segment id of edge i (or null = party edge to the next block piece, "water" = bulkhead); lot = building line after sidewalks',
      'roads.lanes: one entry per road segment between two nodes; pts start at node `from` and end at node `to`; width = kerb-to-kerb; oneWay = legal direction is from->to only; lanes = [travel lanes from->to, travel lanes to->from]; park = [parking lane on the left of from->to, on the right]',
      'signals: state from city.signalState(id, time) with time = city.time; groups.ns / groups.ew list lane ids entering the junction',
      'walks.lanes: sidewalk centre lines and crosswalks (crossing: true, signal id); park paths have kind "path"',
      'landmarks: anchor.pos = GLB origin (footprint centre at sidewalk level, firehouse: centre of its street facade line), GLB +Z points along frontDir (yaw = atan2(fx, fz))',
      'sites: pos/park/ghostSpawn/ghostRoute in world metres, park.yaw: Ecto-1 +Z forward',
    ],
    chunk: D.CHUNK, sidewalkH: SW, bounds: bb.map(r1),
    districts,
    streets: segs.map((s) => streetOut(s)),
    blocks, lots,
    landmarks,
    water, parks: [...parks.values()], parkPaths: D.PARK_PATHS, parkFeatures: D.PARK_FEATURES,
    roads, walks, sites,
    subway: D.SUBWAY, far: D.FAR, northWall: D.NORTH_WALL,
    v1: { zones: V1Z.map((z) => ({ id: z.id, rect: z.rect })), hotdog: { pos: V1HOTDOG.pos, yaw: V1HOTDOG.yaw } },
  };
}

function segDistPoly(poly, c) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(c, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

function streetOut(s) {
  const o = { id: s.id, line: s.line, name: s.name, kind: s.kind, width: s.w, walk: s.walk, oneWay: s.dir || null };
  if (s.axis === 'z') o.pts = [[s.c, s.b], [s.c, s.a]];
  else if (s.axis === 'x') o.pts = [[s.a, s.c], [s.b, s.c]];
  else if (s.axis === 'd') o.pts = [s.p0, s.p1];
  else { o.centre = s.c; o.radius = s.r; o.pts = circlePoly(s.c, s.r, 36).map(rp); }
  return o;
}

function unionFootprint(polys) {
  if (polys.length === 1) return polys[0];
  const all = polys.flat();
  const bb = bounds(all);
  const sum = polys.reduce((a, p) => a + area(p), 0);
  if (sum / ((bb[2] - bb[0]) * (bb[3] - bb[1])) > 0.97) return [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]]];
  return polys.reduce((a, p) => (area(p) > area(a) ? p : a));
}

function rectPoly(b) { return [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]; }

function frontsOf(lotPoly, lines) {
  const out = [];
  for (let i = 0; i < lotPoly.length; i++) {
    const a = lotPoly[i], b = lotPoly[(i + 1) % lotPoly.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1.5) continue;
    for (const L of lines) {
      const da = (a[0] - L.A[0]) * L.n[0] + (a[1] - L.A[1]) * L.n[1], db = (b[0] - L.A[0]) * L.n[0] + (b[1] - L.A[1]) * L.n[1];
      if (Math.abs(da) < 0.06 && Math.abs(db) < 0.06) { out.push({ e: i, road: L.road }); break; }
    }
  }
  return out;
}

function makeLots(p, lots, segById, V1Z) {
  const st = STYLE[p.sub === 'times' ? 'times' : p.sub === 'chinatown' ? 'chinatown' : p.sub === 'cpw' ? 'cpw' : p.district] || STYLE.tribeca;
  const R = rng(hashStr(p.id) ^ 0x5eed);
  const lines = [];
  for (let i = 0; i < p.lot.length; i++) {
    const t = p.lotTags[i];
    if (!t || t === 'water') continue;
    const s = segById.get(t);
    const A = p.lot[i], B = p.lot[(i + 1) % p.lot.length];
    lines.push({ i, A, B, n: inward(A, B), road: t, name: s ? s.name : t, len: Math.hypot(B[0] - A[0], B[1] - A[1]), avenue: s && (s.kind === 'avenue' || s.kind === 'drive' || s.kind === 'ring') });
  }
  if (p.special) {
    const sp = p.special;
    const use = sp.kind;
    const lot = { id: p.id + '.' + sp.id, block: p.id, kind: 'special', special: sp.id, name: sp.name, use, poly: rpoly(p.lot), fronts: frontsOf(p.lot, lines), floors: sp.floors || (use === 'church' ? 3 : 20), h: sp.h || null, seed: hashStr(sp.id) % 100000, district: p.district };
    lots.push(lot);
    return;
  }
  let poly = p.lot, tags = p.lotTags;
  const zone = V1Z.find((z) => inside(poly, (z.rect[0] + z.rect[2]) / 2, (z.rect[1] + z.rect[3]) / 2));
  if (zone) {
    const ax = zone.cut.axis === 'x' ? [1, 0] : [0, 1], P = zone.cut.axis === 'x' ? [zone.cut.v, 0] : [0, zone.cut.v];
    const n = zone.cut.keep > 0 ? [-ax[0], -ax[1]] : ax;
    ({ poly, tags } = clipTagged(poly, tags, P, n, 0, null));
    addV1Zone(zone, p, lots, lines);
  }
  if (poly.length < 3) return;
  const fronts = [];
  for (let i = 0; i < poly.length; i++) {
    const t = tags[i];
    if (!t || t === 'water') continue;
    const s = segById.get(t);
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (len < 3) continue;
    fronts.push({ A, B, n: inward(A, B), u: [(B[0] - A[0]) / len, (B[1] - A[1]) / len], len, road: t, avenue: s && (s.kind !== 'street' && s.kind !== 'park') });
  }
  fronts.sort((a, b) => (b.avenue - a.avenue) || (b.len - a.len));
  const owned = [];
  let k = 0;
  const pushLot = (lp, extra) => {
    if (lp.length < 3 || area(lp) < 12) return;
    const fr = frontsOf(lp, lines);
    const floorsR = st.floors;
    let floors = floorsR[0] + Math.floor(R() * (floorsR[1] - floorsR[0] + 1));
    if (st.tall && R() < st.tall[0] && area(lp) > 300) floors = st.tall[1] + Math.floor(R() * (st.tall[2] - st.tall[1]));
    if (fr.length > 1 && R() < 0.4) floors += 1;
    if (!fr.length) floors = Math.max(3, floors - 2);
    const lot = { id: p.id + '.' + (k++), block: p.id, kind: fr.length ? 'building' : 'core', use: st.use, poly: lp.map((v) => [r1(v[0]), r1(v[1])]), fronts: fr, floors, brick: st.bricks[(R() * st.bricks.length) | 0], seed: (R() * 1e6) | 0, ...extra };
    if (p.sub) lot.sub = p.sub;
    if (st.neon && fr.length) lot.neon = true;
    lots.push(lot);
  };
  for (const f of fronts) {
    let thick = 0;
    for (const v of poly) thick = Math.max(thick, (v[0] - f.A[0]) * f.n[0] + (v[1] - f.A[1]) * f.n[1]);
    const depth = thick * 0.5 >= 9 ? Math.min(st.depth, thick * 0.5) : thick;
    let strip = clipHalf(poly, [f.A[0] + f.n[0] * depth, f.A[1] + f.n[1] * depth], [-f.n[0], -f.n[1]]);
    for (const o of owned) { if (strip.length < 3) break; strip = clipHalf(strip, [o.A[0] + o.n[0] * o.depth, o.A[1] + o.n[1] * o.depth], o.n); }
    owned.push({ A: f.A, n: f.n, depth });
    if (strip.length < 3 || area(strip) < 12) continue;
    let s0 = Infinity, s1 = -Infinity;
    for (const v of strip) { const s = (v[0] - f.A[0]) * f.u[0] + (v[1] - f.A[1]) * f.u[1]; s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
    const cuts = [s0];
    let s = s0;
    while (s1 - s > st.w[1] * 1.3) { s += st.w[0] + R() * (st.w[1] - st.w[0]); cuts.push(s); }
    if (s1 - s > st.w[0] * 1.6 && cuts.length > 0) cuts.push((s + s1) / 2);
    cuts.push(s1);
    for (let c = 0; c < cuts.length - 1; c++) {
      let lp = clipHalf(strip, [f.A[0] + f.u[0] * cuts[c], f.A[1] + f.u[1] * cuts[c]], f.u);
      if (lp.length >= 3) lp = clipHalf(lp, [f.A[0] + f.u[0] * cuts[c + 1], f.A[1] + f.u[1] * cuts[c + 1]], [-f.u[0], -f.u[1]]);
      pushLot(lp);
    }
  }
  let core = poly;
  for (const o of owned) { if (core.length < 3) break; core = clipHalf(core, [o.A[0] + o.n[0] * o.depth, o.A[1] + o.n[1] * o.depth], o.n); }
  if (core.length >= 3 && area(core) > 40) pushLot(core, { kind: 'core' });
}

function addV1Zone(zone, p, lots, lines) {
  const H = 54.5;
  const lotN = p.lot.reduce((m, v) => Math.min(m, v[1]), Infinity), lotS = p.lot.reduce((m, v) => Math.max(m, v[1]), -Infinity);
  const [zx0, zz0, zx1, zz1] = zone.rect;
  if (zone.park) {
    const poly = rectPoly([zx0, zz0, zx1, zz1]);
    lots.push({ id: 'v1.' + zone.park.id, block: p.id, kind: 'park', park: zone.park.id, name: zone.park.name, poly: rpoly(poly), fronts: frontsOf(poly, lines), v1park: { beds: V1PARK.beds, trees: V1PARK.trees }, district: p.district });
    return;
  }
  for (const b of V1B) {
    let [x0, z0, x1, z1] = b.box;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (!(cx > zx0 && cx < zx1 && cz > zz0 && cz < zz1)) continue;
    if (b.id === 'nw_corner' || b.id === 'nw_ave_1') continue;
    if (Math.abs(z0 + H) < 0.01) z0 = lotN;
    if (Math.abs(z1 - H) < 0.01) z1 = lotS;
    const poly = rectPoly([x0, z0, x1, z1]);
    const fr = frontsOf(poly, lines);
    const shop = {};
    for (const s of b.shop || []) shop[s.dir] = { sign: s.sign, blade: s.blade, lit: s.lit, kind: s.kind, window: s.window, awning: s.awning };
    lots.push({ id: 'v1.' + b.id, block: p.id, kind: fr.length ? 'building' : 'core', use: 'tenement', poly: rpoly(poly), fronts: fr, floors: b.floors, brick: b.brick, seed: hashStr(b.id) % 1000000, district: p.district,
      v1: { base: b.base || null, cornice: b.cornice || 'simple', fire: b.fire || [], water: !!b.water, corner: !!b.corner, ad: b.ad || null, shop } });
  }
}

function buildRoads(segs, segById) {
  const C = D.CIRCLE;
  const polys = [];
  for (const s of segs) {
    let pts;
    if (s.axis === 'z') pts = [[s.c, s.b], [s.c, s.a]];
    else if (s.axis === 'x') pts = [[s.a, s.c], [s.b, s.c]];
    else if (s.axis === 'd') pts = [s.p0.slice(), s.p1.slice()];
    else {
      pts = [];
      const n = 40;
      for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI * 2; pts.push([C.c[0] + Math.cos(t) * s.r, C.c[1] - Math.sin(t) * s.r]); }
    }
    if (s.axis !== 'r') {
      const R = (C.rIn + C.rOut) / 2;
      const inC = (p) => Math.hypot(p[0] - C.c[0], p[1] - C.c[1]) < R - 0.01;
      if (inC(pts[0]) && inC(pts[1])) continue;
      for (const [i, o] of [[0, 1], [1, 0]]) {
        if (!inC(pts[i])) continue;
        const a = pts[o], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
        const fx = a[0] - C.c[0], fz = a[1] - C.c[1];
        const B2 = (fx * dx + fz * dz) / L, Cq = fx * fx + fz * fz - R * R;
        const t = -B2 - Math.sqrt(Math.max(0, B2 * B2 - Cq));
        pts[i] = [a[0] + dx / L * t, a[1] + dz / L * t];
      }
    }
    polys.push({ s, pts, splits: pts.map(() => []) });
  }
  for (let a = 0; a < polys.length; a++) for (let b = a + 1; b < polys.length; b++) {
    const P = polys[a], Q = polys[b];
    for (let i = 0; i < P.pts.length - 1; i++) for (let j = 0; j < Q.pts.length - 1; j++) {
      const h = segHit(P.pts[i], P.pts[i + 1], Q.pts[j], Q.pts[j + 1]);
      if (h) { P.splits[i].push(h.t); Q.splits[j].push(h.u); continue; }
      for (const [X, Y, xi, yi] of [[P, Q, i, j], [Q, P, j, i]]) {
        for (const e of [X.pts[xi], X.pts[xi + 1]]) {
          const c = segClosest(e, Y.pts[yi], Y.pts[yi + 1]);
          if (c.d < 0.6) Y.splits[yi].push(c.t);
        }
      }
    }
  }
  const nodes = [], nodeKey = new Map();
  const nodeAt = (p) => {
    const k = Math.round(p[0] * 1) + ',' + Math.round(p[1] * 1);
    for (const dk of [k]) if (nodeKey.has(dk)) return nodeKey.get(dk);
    for (const n of nodes) if (Math.hypot(n.p[0] - p[0], n.p[1] - p[1]) < 0.9) { nodeKey.set(k, n); return n; }
    const n = { id: 'n' + nodes.length, p: rp(p), deg: 0, ring: false };
    nodes.push(n); nodeKey.set(k, n);
    return n;
  };
  const lanes = [];
  for (const P of polys) {
    const marks = [];
    for (let i = 0; i < P.pts.length - 1; i++) {
      const ts = [...new Set(P.splits[i].map((t) => Math.round(Math.min(1, Math.max(0, t)) * 1e4) / 1e4))].sort((x, y) => x - y);
      for (const t of ts) marks.push({ i, t });
    }
    marks.push({ i: 0, t: 0 }, { i: P.pts.length - 2, t: 1 });
    marks.sort((x, y) => x.i - y.i || x.t - y.t);
    const at = (m) => { const a = P.pts[m.i], b = P.pts[m.i + 1]; return [a[0] + (b[0] - a[0]) * m.t, a[1] + (b[1] - a[1]) * m.t]; };
    const pos = (m) => m.i + m.t;
    const clean = [];
    for (const m of marks) if (!clean.length || pos(m) - pos(clean[clean.length - 1]) > 1e-3 && Math.hypot(...sub2(at(m), at(clean[clean.length - 1]))) > 1.0) clean.push(m);
    for (let k = 0; k < clean.length - 1; k++) {
      const m0 = clean[k], m1 = clean[k + 1];
      const pts = [at(m0)];
      for (let i = m0.i + 1; i <= m1.i; i++) if (i > m0.i && (i < m1.i || m1.t > 0)) pts.push(P.pts[i]);
      pts.push(at(m1));
      const ded = [pts[0]];
      for (let q = 1; q < pts.length; q++) if (Math.hypot(pts[q][0] - ded[ded.length - 1][0], pts[q][1] - ded[ded.length - 1][1]) > 0.3) ded.push(pts[q]);
      if (ded.length < 2) continue;
      const A = nodeAt(ded[0]), B = nodeAt(ded[ded.length - 1]);
      if (A === B) continue;
      ded[0] = A.p.slice(); ded[ded.length - 1] = B.p.slice();
      lanes.push({ s: P.s, A, B, pts: ded });
    }
  }
  const out = [];
  for (const L of lanes) {
    const s = L.s;
    let A = L.A, B = L.B, pts = L.pts;
    const d = [pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]];
    let flip = false;
    if (s.dir === 'n') flip = d[1] > 0;
    else if (s.dir === 's') flip = d[1] < 0;
    else if (s.dir === 'e') flip = d[0] < 0;
    else if (s.dir === 'w') flip = d[0] > 0;
    if (flip) { [A, B] = [B, A]; pts = pts.slice().reverse(); }
    if (s.axis === 'r') { A.ring = true; B.ring = true; }
    A.deg++; B.deg++;
    const kind = s.kind;
    const parkOk = kind === 'avenue' || kind === 'street';
    const travel = s.w - (parkOk ? 4.8 : 0);
    const nLanes = Math.max(1, Math.round(travel / 3.4));
    const one = !!s.dir;
    const laneCount = one ? [nLanes, 0] : [Math.max(1, Math.floor(nLanes / 2)), Math.max(1, Math.ceil(nLanes / 2))];
    out.push({ id: '', from: A.id, to: B.id, pts: pts.map(rp), width: s.w, speed: SPEED[kind] || 9, oneWay: one, name: s.name, street: s.line, seg: s.id, kind, lanes: laneCount, laneW: r2(travel / Math.max(1, laneCount[0] + laneCount[1])), park: [parkOk, parkOk] });
  }
  out.sort((a, b) => (a.seg < b.seg ? -1 : a.seg > b.seg ? 1 : a.pts[0][0] - b.pts[0][0] || a.pts[0][1] - b.pts[0][1]));
  out.forEach((l, i) => (l.id = 'r' + i));
  const signals = [];
  const byNode = new Map(nodes.map((n) => [n.id, []]));
  for (const l of out) { byNode.get(l.from).push({ l, end: 0 }); byNode.get(l.to).push({ l, end: 1 }); }
  for (const n of nodes) {
    const inc = byNode.get(n.id);
    if (n.ring || inc.length < 3) continue;
    const groups = { ns: [], ew: [] };
    for (const { l, end } of inc) {
      if (l.oneWay && end === 0) continue;
      const p = end === 1 ? l.pts[l.pts.length - 2] : l.pts[1];
      const dx = n.p[0] - p[0], dz = n.p[1] - p[1];
      (Math.abs(dz) >= Math.abs(dx) ? groups.ns : groups.ew).push(l.id);
    }
    if (!groups.ns.length || !groups.ew.length) continue;
    const off = r2((((-n.p[1] / 11.0) + (hashStr(n.id) % 5) * 0.37) % 36 + 36) % 36);
    signals.push({ id: 's' + n.id.slice(1), node: n.id, p: n.p.slice(), groups, offset: off });
  }
  const noParking = [];
  const fh = D.FIREHOUSE;
  noParking.push({ id: 'firehouse_apron', p: [r2((fh.driveway[0] + fh.driveway[1]) / 2), r2(fh.box[3] + 3)], r: (fh.driveway[1] - fh.driveway[0]) / 2 + 2 });
  return { nodes: nodes.map((n) => ({ id: n.id, p: n.p, ring: n.ring || undefined })), lanes: out, signals, cycle: { length: 36, ns: [0, 19], all_red: [[19, 20.5], [34.5, 36]], ew: [20.5, 34.5], yellow: { ns: [16, 19], ew: [31.5, 34.5] } }, noParking };
}

const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];

function buildWalks(pieces, segById, roads) {
  const nodes = [], lanes = [];
  const find = (p) => { for (const n of nodes) if (Math.hypot(n.p[0] - p[0], n.p[1] - p[1]) < 0.8) return n; const n = { id: 'w' + nodes.length, p: rp(p), lines: new Set(), corner: false }; nodes.push(n); return n; };
  const lineOf = (t) => (t && segById.has(t) ? segById.get(t).line : null);
  const addLane = (a, b, w, extra = {}) => { if (a === b) return; lanes.push({ id: 'k' + lanes.length, from: a.id, to: b.id, pts: [a.p, b.p], width: r1(w), ...extra }); };
  for (const p of pieces) {
    const P = p.poly, T = p.tags, n = P.length;
    if (n < 3) continue;
    const isRoad = (t) => t && t !== 'water' && segById.has(t);
    const off = P.map((a, i) => {
      const t = T[i];
      const w = isRoad(t) ? segById.get(t).walk : 0;
      const nn = inward(a, P[(i + 1) % n]);
      return { A: [a[0] + nn[0] * w * 0.45, a[1] + nn[1] * w * 0.45], d: [P[(i + 1) % n][0] - a[0], P[(i + 1) % n][1] - a[1]], w, road: isRoad(t) };
    });
    for (let i = 0; i < n; i++) {
      const e = off[i];
      if (!e.road) continue;
      const prev = off[(i - 1 + n) % n], next = off[(i + 1) % n];
      const hit = (L1, L2) => { const den = L1.d[0] * L2.d[1] - L1.d[1] * L2.d[0]; if (Math.abs(den) < 1e-9) return null; const t = ((L2.A[0] - L1.A[0]) * L2.d[1] - (L2.A[1] - L1.A[1]) * L2.d[0]) / den; return [L1.A[0] + L1.d[0] * t, L1.A[1] + L1.d[1] * t]; };
      const s = prev.road ? hit(prev, e) : hit({ A: P[i], d: prev.d }, e);
      const f = next.road ? hit(e, next) : hit(e, { A: P[(i + 1) % n], d: next.d });
      if (!s || !f) continue;
      if (Math.hypot(f[0] - s[0], f[1] - s[1]) < 1.5) continue;
      const a = find(s), b = find(f);
      a.lines.add(lineOf(T[i])); b.lines.add(lineOf(T[i]));
      if (prev.road) { a.corner = true; a.lines.add(lineOf(T[(i - 1 + n) % n])); }
      if (next.road) { b.corner = true; b.lines.add(lineOf(T[(i + 1) % n])); }
      const L = Math.hypot(f[0] - s[0], f[1] - s[1]);
      if (L > 70) {
        const k = Math.ceil(L / 60);
        let last = a;
        for (let q = 1; q < k; q++) { const m = find([s[0] + (f[0] - s[0]) * q / k, s[1] + (f[1] - s[1]) * q / k]); m.lines.add(lineOf(T[i])); addLane(last, m, Math.max(1.6, e.w - 1.4), { street: lineOf(T[i]) }); last = m; }
        addLane(last, b, Math.max(1.6, e.w - 1.4), { street: lineOf(T[i]) });
      } else addLane(a, b, Math.max(1.6, e.w - 1.4), { street: lineOf(T[i]) });
    }
  }
  const sigNear = (p) => { let best = null, bd = 34; for (const s of roads.signals) { const d = Math.hypot(s.p[0] - p[0], s.p[1] - p[1]); if (d < bd) { bd = d; best = s.id; } } return best; };
  const bwySegs = [...segById.values()].filter((s) => s.axis === 'd');
  const lineAx = new Map();
  for (const s of segById.values()) if (s.axis === 'z' || s.axis === 'x') lineAx.set(s.line, { axis: s.axis, c: s.c });
  const lineSide = (ln, p) => {
    if (ln === 'RING' || !ln) return null;
    if (ln === 'BWY') {
      let best = null, bd = Infinity;
      for (const s of bwySegs) { const c = segClosest(p, s.p0, s.p1); if (c.d < bd) { bd = c.d; best = s; } }
      return { s: (p[0] - best.p0[0]) * best.n[0] + (p[1] - best.p0[1]) * best.n[1], dir: norm2(sub2(best.p1, best.p0)) };
    }
    const info = lineAx.get(ln);
    if (!info) return null;
    return info.axis === 'z' ? { s: p[0] - info.c, dir: [0, 1] } : { s: p[1] - info.c, dir: [1, 0] };
  };
  const corners = nodes.filter((n) => n.corner);
  const done = new Set();
  for (const c of corners) for (const ln of c.lines) {
    const sc = lineSide(ln, c.p);
    if (!sc) continue;
    let best = null, bd = Infinity;
    for (const o of corners) {
      if (o === c || !o.lines.has(ln)) continue;
      const dx = o.p[0] - c.p[0], dz = o.p[1] - c.p[1], L = Math.hypot(dx, dz);
      if (L < 4 || L > 46) continue;
      const so = lineSide(ln, o.p);
      if (!so || so.s * sc.s >= 0) continue;
      if (Math.abs(dx * sc.dir[0] + dz * sc.dir[1]) > 4 + 0.15 * L) continue;
      if (L < bd) { bd = L; best = o; }
    }
    if (!best) continue;
    const key = [c.id, best.id].sort().join('-');
    if (done.has(key)) continue;
    done.add(key);
    const m = [(c.p[0] + best.p[0]) / 2, (c.p[1] + best.p[1]) / 2];
    addLane(c, best, 3.2, { crossing: true, signal: sigNear(m), street: ln });
  }
  const side = lanes.filter((l) => !l.crossing);
  for (const path of D.PARK_PATHS) {
    let last = null;
    for (const p of path.pts) {
      const n = find(p);
      if (last) addLane(last, n, path.w, { kind: 'path', path: path.id, crossing: false });
      last = n;
    }
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const path of D.PARK_PATHS) for (const end of [path.pts[0], path.pts[path.pts.length - 1]]) {
    const n = find(end);
    if (n.lines.size) continue;
    let best = null, bd = 16;
    for (const l of side) { const c = segClosest(end, l.pts[0], l.pts[1]); if (c.d < bd) { bd = c.d; best = { l, c }; } }
    if (!best) continue;
    const { l, c } = best;
    const q = find(c.p);
    q.lines.add(l.street);
    if (q.id !== l.from && q.id !== l.to) {
      const b = byId.get(l.to) || nodes.find((x) => x.id === l.to);
      l.to = q.id; l.pts = [l.pts[0], q.p];
      const nl = { id: 'k' + lanes.length, from: q.id, to: b.id, pts: [q.p, b.p], width: l.width, street: l.street };
      lanes.push(nl); side.push(nl);
    }
    byId.set(q.id, q);
    addLane(n, q, path.w, { kind: 'path', crossing: false });
  }
  for (const l of lanes) delete l.pts;
  return { nodes: nodes.map((n) => ({ id: n.id, p: n.p, corner: n.corner || undefined })), lanes, signals: roads.signals.map((s) => ({ id: s.id, p: s.p })) };
}

function buildWater(land) {
  const piers = [];
  const landX = (z, side) => (side === 'w' ? -400 : 520);
  const southZ = (x) => {
    let best = 640;
    for (let i = 0; i < land.length; i++) {
      const a = land[i], b = land[(i + 1) % land.length];
      if ((a[0] - x) * (b[0] - x) <= 0 && Math.abs(b[0] - a[0]) > 1e-6) { const t = (x - a[0]) / (b[0] - a[0]); const z = a[1] + (b[1] - a[1]) * t; if (z > best) best = z; }
    }
    return best;
  };
  for (const p of D.PIERS) {
    let poly;
    if (p.side === 'w') { const x0 = landX(p.z, 'w'); poly = [[x0 - p.len, p.z - p.w / 2], [x0 + 0.5, p.z - p.w / 2], [x0 + 0.5, p.z + p.w / 2], [x0 - p.len, p.z + p.w / 2]]; }
    else if (p.side === 'e') { const x0 = landX(p.z, 'e'); poly = [[x0 - 0.5, p.z - p.w / 2], [x0 + p.len, p.z - p.w / 2], [x0 + p.len, p.z + p.w / 2], [x0 - 0.5, p.z + p.w / 2]]; }
    else { const z0 = southZ(p.x); poly = [[p.x - p.w / 2, z0 - 0.5], [p.x + p.w / 2, z0 - 0.5], [p.x + p.w / 2, z0 + p.len], [p.x - p.w / 2, z0 + p.len]]; }
    piers.push({ id: p.id, name: p.name || null, side: p.side, poly: rpoly(orient(poly)), shed: !!p.shed, deckY: SW });
  }
  const F = D.FAR;
  const rivers = [
    { id: 'hudson', name: 'Hudson River', poly: [[F.nj.x[1], -3000], [-400, -3000], [-400, 700], [F.nj.x[1], 900]] },
    { id: 'east_river', name: 'East River', poly: [[520, -3000], [F.queens.x[0], -3000], [F.brooklyn.x[0], 1500], [520, 640]] },
    { id: 'harbor', name: 'Upper New York Bay', poly: [[F.nj.x[1], 900], ...land.filter((v) => v[1] >= 640).sort((a, b) => a[0] - b[0]).map((v) => v.slice()), [F.brooklyn.x[0], 1500], [F.brooklyn.x[0], 2800], [F.nj.x[1], 2800]] },
  ].map((r) => ({ ...r, poly: rpoly(r.poly) }));
  return { y: D.WATER_Y, land: rpoly(land), rivers, piers, ponds: [], bulkhead: rpoly(land), far: F };
}

function gridIndex(items, cell) {
  const g = new Map();
  for (const it of items) {
    const [x0, z0, x1, z1] = bounds(it.poly);
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
      const k = i + ',' + j;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(it);
    }
  }
  return (x, z) => g.get(Math.floor(x / cell) + ',' + Math.floor(z / cell)) || [];
}

function buildSites(roads, walks, isBuilt, landmarks, blocks) {
  const nodeP = new Map(roads.nodes.map((n) => [n.id, n.p]));
  const sigP = roads.signals.map((s) => s.p);
  const blockAt = (x, z) => blocks.find((b) => b.kerb.length >= 3 && inside(b.kerb, x, z));
  const groundY = (x, z) => (blockAt(x, z) ? SW : 0);
  const wn = new Map(walks.nodes.map((n) => [n.id, n.p]));
  const walkPts = walks.lanes.filter((l) => !l.crossing).map((l) => [wn.get(l.from), wn.get(l.to)]);
  const out = [];
  for (const s of D.SITES) {
    const [cx, cz] = s.at;
    let best = null;
    for (const l of roads.lanes) {
      if (l.kind === 'ring') continue;
      for (let i = 0; i < l.pts.length - 1; i++) {
        const a = l.pts[i], b = l.pts[i + 1];
        const c = segClosest([cx, cz], a, b);
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const s0 = c.t * L;
        if (L < 30) continue;
        const sClamp = Math.max(14, Math.min(L - 14, s0));
        const p = [a[0] + (b[0] - a[0]) * sClamp / L, a[1] + (b[1] - a[1]) * sClamp / L];
        const d = Math.hypot(p[0] - cx, p[1] - cz);
        if (!best || d < best.d) best = { l, a, b, L, p, d };
      }
    }
    let park = null;
    if (best) {
      const { l, a, b, L, p } = best;
      let u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      let right = [-u[1], u[0]];
      const toSite = [cx - p[0], cz - p[1]];
      if (!l.oneWay && toSite[0] * right[0] + toSite[1] * right[1] < 0) { u = [-u[0], -u[1]]; right = [-right[0], -right[1]]; }
      const side = toSite[0] * right[0] + toSite[1] * right[1] >= 0 ? 1 : -1;
      const off = l.width / 2 - 1.35;
      const q = [p[0] + right[0] * off * side, p[1] + right[1] * off * side];
      park = { pos: [r2(q[0]), 0, r2(q[1])], yaw: r2(Math.atan2(u[0], u[1])), lane: l.id };
    }
    const lm = s.interior ? landmarks.find((x) => x.id === s.interior.split(':')[0]) : null;
    const gy = groundY(cx, cz);
    const route = [];
    const N = 12, R = s.radius * 0.62;
    const R0 = rng(hashStr(s.id));
    for (let k = 0; k < N; k++) {
      const t = (k / N) * Math.PI * 2 + R0() * 0.3;
      let rr = R * (0.6 + R0() * 0.5);
      let x = cx + Math.cos(t) * rr, z = cz + Math.sin(t) * rr;
      if (s.kind === 'outdoor') {
        for (let g = 0; g < 12 && isBuilt(x, z); g++) { rr *= 0.8; x = cx + Math.cos(t) * rr; z = cz + Math.sin(t) * rr; }
        if (isBuilt(x, z)) { x = cx; z = cz; }
      }
      route.push([r2(x), r2(gy + 2.4 + R0() * 3.4), r2(z)]);
    }
    const food = [];
    const nearWalk = (r) => {
      let bp = null, bd = Infinity;
      for (const pts of walkPts) { const c = segClosest([cx, cz], pts[0], pts[1]); if (c.d < bd && c.d < r) { bd = c.d; bp = c.p; } }
      return bp;
    };
    if (s.food === 'v1') food.push({ kind: 'hotdogcart', pos: [V1HOTDOG.pos[0], SW, V1HOTDOG.pos[1]], yaw: V1HOTDOG.yaw, v1: true });
    else if (s.food === 'cart') { const p = nearWalk(60) || [cx, cz]; food.push({ kind: 'hotdogcart', pos: [r2(p[0]), groundY(p[0], p[1]), r2(p[1])], yaw: r2(R0() * 6.28) }); }
    else if (s.food === 'dock') { for (let k = 0; k < 6; k++) food.push({ kind: k % 3 === 0 ? 'pallet' : k % 3 === 1 ? 'crate' : 'barrel', pos: [r2(cx + (k - 2.5) * 1.6), SW, r2(cz + (k % 2) * 1.2)], yaw: r2(R0() * 0.6) }); }
    else if (s.food === 'tavern') { for (let k = 0; k < 4; k++) food.push({ kind: 'bench', pos: [r2(cx + (k - 1.5) * 3.2), SW, r2(cz + 6)], yaw: 0 }); }
    else if (s.food === 'banquet') food.push({ kind: 'interior', ref: s.interior + ':banquet' });
    void sigP; void nodeP;
    out.push({
      id: s.id, name: s.name, address: s.address, district: districtAt(cx, cz), kind: s.kind,
      pos: [cx, gy, cz], radius: s.radius, park, ghostSpawn: [cx, r2(gy + 3.0), cz], ghostRoute: route, food, types: s.types,
      ...(s.interior ? { interior: s.interior, landmark: lm ? lm.id : s.interior.split(':')[0] } : {}),
    });
  }
  return out;
}
