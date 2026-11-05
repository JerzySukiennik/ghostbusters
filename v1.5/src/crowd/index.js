// Instanced 1984 New York pedestrians on the city sidewalk graph: signal-aware crossings, ghost gawking, panic and screams, skeletal animation texture rendering.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { animTexture, crowdMaterial, crowdDepthMaterial, crowdGeometry } from './vat.js';

const BASE = 'assets/people/';
const QUALITY = {
  low: { agents: 20, visible: 24, lod0: 6, lod0Dist: 11, shadows: false },
  medium: { agents: 34, visible: 36, lod0: 8, lod0Dist: 14, shadows: true },
  high: { agents: 46, visible: 40, lod0: 16, lod0Dist: 22, shadows: true },
};
const WALK = 0, WAIT = 1, STAND = 2, WATCH = 3, FLEE = 4, COWER = 5, SCREAM = 6;
const STATES = ['walk', 'wait', 'stand', 'watch', 'flee', 'cower', 'scream'];
const CELL = 32, SPAWN_MAX = 72, DESPAWN = 92, VIEW = 95, WATCH_R = 46, BACK_R = 8, FADE = 0.28;
const rnd = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const P = { x: 0, z: 0, tx: 0, tz: 1 };

function lanePoint(L, u, off, out) {
  u = u < 0 ? 0 : u > L.len ? L.len : u;
  let i = 1;
  while (i < L.m - 1 && L.cum[i] < u) i++;
  const s0 = L.cum[i - 1], sl = Math.max(1e-6, L.cum[i] - s0), t = (u - s0) / sl;
  const tx = (L.xs[i] - L.xs[i - 1]) / sl, tz = (L.zs[i] - L.zs[i - 1]) / sl;
  out.tx = tx; out.tz = tz;
  out.x = L.xs[i - 1] + (L.xs[i] - L.xs[i - 1]) * t - tz * off;
  out.z = L.zs[i - 1] + (L.zs[i] - L.zs[i - 1]) * t + tx * off;
  return out;
}

function buildGraph(walks, roads) {
  const nodes = [], idx = new Map(), lanes = [], grid = new Map();
  const key = (ix, iz) => (ix + 4096) * 8192 + (iz + 4096);
  if (!walks || !walks.nodes || !walks.lanes) return { nodes, lanes, grid, key };
  for (const n of walks.nodes) { idx.set(n.id, nodes.length); nodes.push({ id: n.id, x: n.p[0], z: n.p[1], out: [] }); }
  const sigs = (walks.signals && walks.signals.length ? walks.signals : roads && roads.signals) || [];
  for (const l of walks.lanes) {
    const a = idx.get(l.from), b = idx.get(l.to);
    if (a === undefined || b === undefined) continue;
    const pts = l.pts && l.pts.length >= 2 ? l.pts : [[nodes[a].x, nodes[a].z], [nodes[b].x, nodes[b].z]];
    const m = pts.length, xs = new Float32Array(m), zs = new Float32Array(m), cum = new Float32Array(m);
    for (let i = 0; i < m; i++) { xs[i] = pts[i][0]; zs[i] = pts[i][1]; if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]); }
    const len = cum[m - 1];
    if (len < 0.05) continue;
    const crossing = !!(l.crossing || l.kind === 'crossing' || l.type === 'crossing');
    const dx = xs[m - 1] - xs[0], dz = zs[m - 1] - zs[0];
    const L = { id: l.id, a, b, xs, zs, cum, len, m, half: Math.max(0.6, (l.width || 3) / 2), crossing, need: Math.abs(dx) > Math.abs(dz) ? 'ew' : 'ns', sig: null, mx: (xs[0] + xs[m - 1]) / 2, mz: (zs[0] + zs[m - 1]) / 2 };
    if (crossing) {
      if (l.signal !== undefined && l.signal !== null) L.sig = l.signal;
      else {
        let best = 30 * 30;
        for (const s of sigs) { const p = s.p || s.pos || [0, 0], dd = (p[0] - L.mx) ** 2 + (p[1] - L.mz) ** 2; if (dd < best) { best = dd; L.sig = s.id; } }
      }
    }
    lanes.push(L);
    nodes[a].out.push({ L, dir: 1 }); nodes[b].out.push({ L, dir: -1 });
  }
  for (const L of lanes) {
    if (L.crossing) continue;
    const seen = new Set();
    for (let d = 0; d <= L.len + 0.01; d += CELL / 3) {
      lanePoint(L, d, 0, P);
      const k = key(Math.floor(P.x / CELL), Math.floor(P.z / CELL));
      if (seen.has(k)) continue;
      seen.add(k);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(L);
    }
  }
  return { nodes, lanes, grid, key };
}

export async function createCrowd({ THREE, scene, city, audio = null, quality = 'medium', camera = null, base = BASE }) {
  const qn = typeof quality === 'string' ? quality : (quality && quality.name) || 'medium';
  const Q = QUALITY[qn] || QUALITY.medium;
  const [manifest, meta, buf] = await Promise.all([
    fetch(base + 'people.json').then((r) => r.json()),
    fetch(base + 'crowd_anim.json').then((r) => r.json()),
    fetch(base + 'crowd_anim.bin').then((r) => r.arrayBuffer()),
  ]);
  const CL = meta.clips;
  const animTex = animTexture(THREE, meta, buf);
  const depthMat = crowdDepthMaterial(THREE, animTex);
  const lamps = (city && city.lights && city.lights.uniforms) || null;
  const root = new THREE.Group();
  root.name = 'Crowd';
  const loader = new GLTFLoader();
  const cap = Q.visible;
  const mats = [];
  const variants = await Promise.all(manifest.variants.map(async (v) => {
    const g = await loader.loadAsync(base + v.file);
    g.scene.updateMatrixWorld(true);
    const lods = [];
    let mat = null;
    for (let k = 0; k < manifest.lod.length; k++) {
      let sm = null;
      g.scene.traverse((o) => { if (o.isSkinnedMesh && o.name === manifest.lod[k]) sm = o; });
      if (!sm) continue;
      if (!mat) {
        const map = sm.material.map;
        if (map) map.anisotropy = 4;
        mat = crowdMaterial(THREE, { map, animTex, lamps });
        mats.push(mat);
      }
      const geo = crowdGeometry(THREE, sm, meta, cap);
      const im = new THREE.InstancedMesh(geo, mat, cap);
      im.name = `Crowd_${v.id}_LOD${k}`;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0; im.visible = false; im.frustumCulled = false;
      im.castShadow = k === 0 && Q.shadows; im.receiveShadow = true;
      im.customDepthMaterial = depthMat;
      im.userData.tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      root.add(im);
      lods.push(im);
    }
    return { id: v.id, name: v.name, s: v.s || 1, pace: v.pace || 1, lods, used: 0 };
  }));

  const blobTex = (() => {
    const n = 64, d = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n * 2 - 1, (y + 0.5) / n * 2 - 1), a = Math.max(0, 1 - r);
      d[(y * n + x) * 4 + 3] = Math.round(255 * a * a * (3 - 2 * a));
    }
    const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
    t.needsUpdate = true;
    return t;
  })();
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: blobTex, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, cap);
  blobs.name = 'CrowdBlobs';
  blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blobs.count = 0; blobs.frustumCulled = false; blobs.renderOrder = 1;
  let cam = camera;
  blobs.onBeforeRender = (r, s, c) => { if (!camera && c && c.isPerspectiveCamera && !r.getRenderTarget()?.isWebGLCubeRenderTarget) cam = c; };
  root.add(blobs);
  scene.add(root);

  let G = buildGraph(city && city.walks, city && city.roads);
  let walksRef = city && city.walks;
  const heightAt = city && typeof city.heightAt === 'function' ? (x, z) => city.heightAt(x, z) || 0 : () => 0;
  const sigFn = city && typeof city.signalState === 'function' ? (id, t) => city.signalState(id, t) : null;
  const green = (L, t) => L.sig === null || !sigFn || sigFn(L.sig, t) === L.need;

  const agents = Array.from({ length: Q.agents }, (_, i) => ({
    i, on: false, v: null, s: 1, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, sp: 0, walkSp: 1.3, fleeSp: 4.8, k: 0.6, avoid: 0,
    lane: null, dir: 1, u: 0, next: null, state: WALK, timer: 0, wait: 0, clip: 'idle', ct: 0, prev: 'idle', pt: 0, blend: 0, rate: 1,
    idle: 'idle', h: 0, hx: 1e9, hz: 1e9, face: false, fx: 0, fz: 0, thx: 0, thz: 0, gi: -1, lastD: 1e9, panic: 0, gather: false, gatherD: 15,
    watchClip: 'look_up', swap: 0, partner: null, talking: false, dist: 0, vis: false, lod: 1, nextT: 0, seen: 0,
  }));
  const vis = [];
  const GV = Array.from({ length: 8 }, () => ({ x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, ok: false }));
  const byDist = (a, b) => a.dist - b.dist;
  const frustum = new THREE.Frustum(), PM = new THREE.Matrix4(), SPH = new THREE.Sphere(), FV = new THREE.Vector3(), AP = new THREE.Vector3();
  const focusPts = [];
  const stats = { agents: 0, visible: 0, lod0: 0, tris: 0, drawCalls: 0, cpu: 0, states: {} };
  let clock = 0, lastScream = -10, lastGasp = -10, screamBudget = 0, murmur = null, murmurT = 0, spawnedOnce = false, hold = false, lampCount = lamps ? lamps.count : 0;

  function sfx(name, x, y, z, gain = 1) {
    if (!audio || !audio.play) return null;
    AP.set(x, y, z);
    return audio.play(name, { pos: AP, jitter: 0.14, gain, ref: 3 });
  }

  function setClip(a, name, phase = -1) {
    if (a.clip === name) return;
    a.prev = a.clip; a.pt = a.ct; a.blend = 1; a.clip = name;
    const c = CL[name];
    a.ct = phase >= 0 ? (phase % 1) * c.dur : Math.random() * c.dur;
  }

  function enterLane(a, o) {
    a.lane = o.L; a.dir = o.dir; a.u = o.dir > 0 ? 0 : o.L.len; a.next = null;
  }

  function farEnd(o) { const L = o.L; return o.dir > 0 ? L.m - 1 : 0; }

  function pickNext(a, mode, tx, tz) {
    const L = a.lane, node = G.nodes[a.dir > 0 ? L.b : L.a];
    if (!node || L.id === 'lineup') return null;
    const outs = node.out, n = outs.length;
    if (!n) return null;
    lanePoint(L, a.dir > 0 ? L.len : 0, 0, P);
    const hx = P.tx * a.dir, hz = P.tz * a.dir;
    let best = null, bw = -Infinity;
    for (let i = 0; i < n; i++) {
      const o = outs[i];
      if (o.L === L && n > 1) continue;
      const e = farEnd(o), ex = o.L.xs[e], ez = o.L.zs[e];
      let w;
      if (mode === 1) w = (ex - tx) ** 2 + (ez - tz) ** 2 + Math.random() * 6;
      else if (mode === 2) w = -((ex - tx) ** 2 + (ez - tz) ** 2);
      else {
        const s = o.dir > 0 ? 0 : o.L.m - 1, s2 = o.dir > 0 ? 1 : o.L.m - 2;
        const dx = o.L.xs[s2] - o.L.xs[s], dz = o.L.zs[s2] - o.L.zs[s], dl = Math.hypot(dx, dz) || 1;
        const dot = (dx * hx + dz * hz) / dl;
        w = Math.random() * (o.L.crossing ? 0.6 : 1) + (dot > 0.7 ? 0.55 : 0);
      }
      if (w > bw) { bw = w; best = o; }
    }
    return best;
  }

  function advance(a, dt, sp, mode, tx, tz) {
    let step = sp * dt;
    for (let guard = 0; guard < 4 && step > 0; guard++) {
      const L = a.lane;
      const rem = a.dir > 0 ? L.len - a.u : a.u;
      if (mode === 0 && !a.next) a.next = pickNext(a, 0, 0, 0);
      if (mode === 0 && a.next && a.next.L.crossing && !L.crossing && rem < 1.0) {
        if (!(green(a.next.L, clock) && green(a.next.L, clock + 1.5 + a.next.L.len / a.walkSp))) { a.state = WAIT; a.wait = 0; a.timer = 0; return; }
      }
      if (step < rem) { a.u += a.dir * step; return; }
      step -= rem;
      const o = mode === 0 ? a.next : pickNext(a, mode, tx, tz);
      if (!o) { a.dir = -a.dir; a.next = null; return; }
      enterLane(a, o);
      a.k = Math.min(a.k0, Math.max(0.25, a.lane.half - 0.4));
    }
  }

  function variantPick(except) {
    let best = null, bw = Infinity;
    for (const v of variants) { if (v === except || !v.lods.length) continue; const w = v.used + Math.random() * 1.6; if (w < bw) { bw = w; best = v; } }
    return best || variants[0];
  }

  function activate(a, v, L, u, dir) {
    a.on = true; a.v = v; v.used++;
    a.s = v.s * rnd(0.97, 1.03);
    a.walkSp = rnd(1.15, 1.6) * v.pace; a.fleeSp = rnd(4.3, 5.4) * Math.max(0.75, v.pace);
    a.k0 = rnd(0.3, 1.5); a.lane = L; a.dir = dir; a.u = u; a.next = null; a.avoid = 0;
    a.k = Math.min(a.k0, Math.max(0.25, L.half - 0.4));
    lanePoint(L, u, a.dir * a.k, P);
    a.x = P.x; a.z = P.z; a.h = heightAt(a.x, a.z); a.y = a.h; a.hx = a.x; a.hz = a.z;
    a.yaw = Math.atan2(P.tx * dir, P.tz * dir); a.vx = 0; a.vz = 0; a.sp = 0;
    a.state = WALK; a.timer = 0; a.panic = 0; a.pin = false; a.gi = -1; a.lastD = 1e9; a.partner = null; a.face = false; a.gather = false; a.seen = 0;
    a.idle = Math.random() < 0.35 ? 'idle_fold' : 'idle'; a.rate = rnd(0.9, 1.1);
    a.clip = 'walk'; a.ct = Math.random() * CL.walk.dur; a.prev = 'walk'; a.blend = 0;
  }

  function deactivate(a) {
    if (!a.on) return;
    a.on = false; if (a.v) a.v.used--; a.v = null;
    if (a.partner) { a.partner.partner = null; a.partner = null; }
  }

  function free() { for (const a of agents) if (!a.on) return a; return null; }

  function inView(x, y, z, r) {
    if (!cam) return false;
    SPH.center.set(x, y, z); SPH.radius = r;
    return frustum.intersectsSphere(SPH);
  }

  function trySpawn(fx, fz, initial) {
    const a = free();
    if (!a || !G.lanes.length) return false;
    const ang = Math.random() * Math.PI * 2, r = initial ? rnd(3, SPAWN_MAX) : rnd(24, SPAWN_MAX);
    const px = fx + Math.cos(ang) * r, pz = fz + Math.sin(ang) * r;
    const list = G.grid.get(G.key(Math.floor(px / CELL), Math.floor(pz / CELL)));
    if (!list || !list.length) return false;
    const L = list[(Math.random() * list.length) | 0];
    const u = Math.random() * L.len, dir = Math.random() < 0.5 ? 1 : -1;
    lanePoint(L, u, 0, P);
    const d = Math.hypot(P.x - fx, P.z - fz);
    if (d > SPAWN_MAX || (!initial && d < 20)) return false;
    if (!initial && d < 55 && inView(P.x, 1, P.z, 1.5)) return false;
    for (const b of agents) if (b.on && Math.abs(b.x - P.x) + Math.abs(b.z - P.z) < 2.2) return false;
    const roll = Math.random();
    activate(a, variantPick(null), L, u, dir);
    if (roll < 0.22 && L.half > 1.2) {
      const b = free();
      if (b) {
        activate(b, variantPick(a.v), L, Math.min(L.len, Math.max(0, u + 0.95)), -dir);
        const kk = Math.min(L.half - 0.5, rnd(0.6, 1.3)) * (Math.random() < 0.5 ? 1 : -1);
        for (const [m, uu] of [[a, u], [b, Math.min(L.len, Math.max(0, u + 0.95))]]) {
          lanePoint(L, uu, kk, P); m.x = P.x; m.z = P.z; m.state = STAND; m.timer = rnd(18, 50);
        }
        a.partner = b; b.partner = a; a.talking = true; b.talking = false; a.swap = rnd(2, 5); b.swap = a.swap;
        a.face = b.face = true; a.fx = b.x; a.fz = b.z; b.fx = a.x; b.fz = a.z;
        a.yaw = Math.atan2(b.x - a.x, b.z - a.z); b.yaw = wrap(a.yaw + Math.PI);
        setClip(a, 'talk'); setClip(b, b.idle); a.blend = b.blend = 0;
      }
    } else if (roll < 0.32) {
      a.state = STAND; a.timer = rnd(8, 30); setClip(a, a.idle); a.blend = 0;
      a.face = true; lanePoint(L, u, 0, P); a.fx = a.x + P.tz * 3 * (Math.random() < 0.5 ? 1 : -1); a.fz = a.z - P.tx * 3;
    }
    return true;
  }

  function startFlee(a, tx, tz, d, scary) {
    if (a.state === FLEE || a.state === COWER || a.state === SCREAM) { a.thx = tx; a.thz = tz; return; }
    if (a.partner) { const b = a.partner; a.partner = null; b.partner = null; if (b.state === STAND) b.state = WALK; }
    a.thx = tx; a.thz = tz; a.timer = 0; a.face = true; a.fx = tx; a.fz = tz; a.panic = 0;
    lanePoint(a.lane, a.u, 0, P);
    if ((P.tx * a.dir) * (tx - a.x) + (P.tz * a.dir) * (tz - a.z) > 0) { a.dir = -a.dir; a.next = null; }
    const r = Math.random();
    if (d < 4.5 + scary * 2 && r < 0.3) { a.state = COWER; a.timer = rnd(1.6, 3.2); setClip(a, 'cower'); }
    else if (r < 0.62) { a.state = SCREAM; a.timer = rnd(0.6, 1.1); setClip(a, 'scream'); }
    else { a.state = FLEE; setClip(a, 'run', 0); }
    if (clock - lastScream > 0.45 && screamBudget < 3 && Math.random() < 0.7) { lastScream = clock; screamBudget++; sfx('crowd_scream', a.x, a.y + 1.6, a.z, rnd(0.7, 1)); }
  }

  function segDist(px, py, pz, A, B) {
    const abx = B.x - A.x, aby = B.y - A.y, abz = B.z - A.z;
    const l2 = abx * abx + aby * aby + abz * abz || 1;
    let t = ((px - A.x) * abx + (py - A.y) * aby + (pz - A.z) * abz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - A.x - abx * t, py - A.y - aby * t, pz - A.z - abz * t);
  }

  function think(a, dt, ghosts, streams) {
    let gd = 1e9, gi = -1, gx = 0, gy = 0, gz = 0, scary = 0.5, rad = 1;
    if (ghosts) for (let i = 0; i < ghosts.length; i++) {
      const g = ghosts[i], p = g && (g.pos || g.position);
      if (!p) continue;
      const d = Math.hypot(p.x - a.x, (p.y - a.y - 1.5) * 0.6, p.z - a.z);
      if (d < gd) { gd = d; gi = i; gx = p.x; gy = p.y; gz = p.z; scary = g.scary ?? 0.5; rad = g.radius ?? 1; }
    }
    let closing = 0;
    if (gi >= 0 && gi < GV.length && gd > 0.01) { const v = GV[gi]; closing = (v.x * (a.x - gx) + v.y * (a.y + 1.5 - gy) + v.z * (a.z - gz)) / gd; }
    a.gi = gi; a.lastD = gd;
    if (a.state !== FLEE && a.state !== COWER && a.state !== SCREAM) {
      if (gi >= 0 && (gd < 2.5 + 3 * scary + rad || (closing > 3.5 && gd < 9 + 7 * scary))) { startFlee(a, gx, gz, gd, scary); return; }
      if (streams) for (let i = 0; i < streams.length; i++) {
        const s = streams[i];
        if (s && s.a && s.b && segDist(a.x, a.y + 1.2, a.z, s.a, s.b) < 3.2) { startFlee(a, (s.a.x + s.b.x) / 2, (s.a.z + s.b.z) / 2, 3, 0.5); return; }
      }
      if (a.panic > 0.5) { startFlee(a, a.thx, a.thz, 20, 0.3); return; }
      a.panic = Math.max(0, a.panic - dt * 0.25);
    } else if (gi >= 0 && gd < 30) { a.thx = gx; a.thz = gz; }
    if ((a.state === WALK || a.state === WAIT || a.state === STAND) && gi >= 0 && gd < WATCH_R && Math.random() < dt * 0.9) {
      if (a.partner) { a.partner.partner = null; a.partner = null; }
      a.state = WATCH; a.timer = rnd(7, 18); a.watchClip = Math.random() < 0.35 ? 'point' : 'look_up'; a.swap = rnd(3, 6);
      a.gather = gd > 20 && Math.random() < 0.45; a.gatherD = rnd(12, 20); a.next = null;
      if (clock - lastGasp > 1.2 && Math.random() < 0.3) { lastGasp = clock; sfx('crowd_gasp', a.x, a.y + 1.6, a.z, 0.8); }
    }
    if (a.state === WATCH) {
      a.face = gi >= 0; a.fx = gx; a.fz = gz;
      a.timer -= dt; a.swap -= dt;
      if (a.swap < 0) { a.swap = rnd(3, 6); a.watchClip = a.watchClip === 'point' ? 'look_up' : Math.random() < 0.5 ? 'point' : 'look_up'; }
      if (gi < 0 || gd > 60 || (a.timer < 0 && gd > 26)) { a.state = WALK; a.face = false; a.gather = false; }
    }
  }

  function step(a, dt) {
    let follow = true, sp = 0;
    switch (a.state) {
      case WALK: {
        sp = a.walkSp;
        if (a.lane.crossing && !green(a.lane, clock)) sp *= 1.35;
        advance(a, dt, sp, 0, 0, 0);
        setClip(a, 'walk', a.clip === 'run' ? a.ct / CL.run.dur : -1);
        break;
      }
      case WAIT: {
        a.timer += dt; a.wait += dt;
        if (a.timer > 0.3) {
          a.timer = 0;
          if (!a.next || !a.next.L.crossing || (green(a.next.L, clock) && green(a.next.L, clock + 1.5 + a.next.L.len / a.walkSp)) || a.wait > 45) { a.state = WALK; if (a.wait > 45) a.next = null; }
        }
        setClip(a, a.idle);
        break;
      }
      case STAND: {
        follow = false; a.timer -= dt;
        if (a.partner) {
          const b = a.partner; a.fx = b.x; a.fz = b.z; a.swap -= dt;
          if (a.swap < 0 && a.talking) { a.swap = rnd(2, 5); b.swap = a.swap; a.talking = false; b.talking = true; }
        }
        if (!a.pin) setClip(a, a.partner ? (a.talking ? 'talk' : a.idle) : a.idle);
        if (a.timer < 0) {
          if (a.partner) { a.partner.partner = null; a.partner.timer = Math.min(a.partner.timer, rnd(0.5, 2)); a.partner = null; }
          a.state = WALK; a.face = false;
        }
        break;
      }
      case WATCH: {
        if (a.lastD < BACK_R) { sp = a.walkSp * 0.8; advance(a, dt, sp, 1, a.fx, a.fz); setClip(a, 'walk'); a.gather = false; }
        else if (a.gather && a.lastD > a.gatherD) { sp = a.walkSp * 1.1; advance(a, dt, sp, 2, a.fx, a.fz); setClip(a, 'walk'); }
        else { a.gather = false; follow = false; setClip(a, a.watchClip); }
        break;
      }
      case SCREAM: case COWER: {
        follow = false; a.timer -= dt;
        if (a.timer < 0) { a.state = FLEE; a.timer = 0; setClip(a, 'run', 0); }
        break;
      }
      case FLEE: {
        a.timer += dt; a.face = false;
        sp = a.fleeSp;
        advance(a, dt, sp, 1, a.thx, a.thz);
        setClip(a, 'run');
        if (a.timer > 4 && Math.hypot(a.x - a.thx, a.z - a.thz) > 28 && a.lastD > 26) { a.state = WALK; a.next = null; }
        break;
      }
    }
    const ox = a.x, oz = a.z;
    if (follow) {
      a.avoid *= Math.exp(-dt * 1.5);
      lanePoint(a.lane, a.u, a.dir * a.k + a.avoid, P);
      const f = 1 - Math.exp(-dt * (a.state === FLEE ? 7 : 5));
      a.x += (P.x - a.x) * f; a.z += (P.z - a.z) * f;
    }
    const kv = 1 - Math.exp(-dt * 8), ivd = 1 / Math.max(dt, 1e-3);
    a.vx += ((a.x - ox) * ivd - a.vx) * kv; a.vz += ((a.z - oz) * ivd - a.vz) * kv;
    a.sp = Math.hypot(a.vx, a.vz);
    let ty = a.yaw;
    if (a.face && (a.state !== WATCH || (!a.gather && a.lastD >= BACK_R))) ty = Math.atan2(a.fx - a.x, a.fz - a.z);
    else if (a.sp > 0.25) ty = Math.atan2(a.vx, a.vz);
    a.yaw = wrap(a.yaw + wrap(ty - a.yaw) * (1 - Math.exp(-dt * (a.state === FLEE ? 9 : 4.5))));
    if (Math.abs(a.x - a.hx) + Math.abs(a.z - a.hz) > 0.6) { a.h = heightAt(a.x, a.z); a.hx = a.x; a.hz = a.z; }
    a.y += (a.h - a.y) * (1 - Math.exp(-dt * 12));
    const c = CL[a.clip];
    const r = a.pin ? 1 : c.speed > 0 ? Math.min(1.9, Math.max(0.55, a.sp / (c.speed * a.s))) : a.rate;
    a.ct = (a.ct + dt * r) % c.dur;
    if (a.blend > 0) {
      const p = CL[a.prev];
      a.pt = (a.pt + dt * (p.speed > 0 ? Math.min(1.9, Math.max(0.55, a.sp / (p.speed * a.s))) : a.rate)) % p.dur;
      a.blend = Math.max(0, a.blend - dt / FADE);
    }
  }

  function separate(dt) {
    const n = agents.length;
    for (let i = 0; i < n; i++) {
      const a = agents[i];
      if (!a.on) continue;
      for (let j = i + 1; j < n; j++) {
        const b = agents[j];
        if (!b.on) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        if (dx > 7 || dx < -7 || dz > 7 || dz < -7) continue;
        const d2 = dx * dx + dz * dz;
        if (a.state === FLEE && b.state !== FLEE && d2 < 16) { b.panic += dt * rnd(0.3, 0.8); b.thx = a.thx; b.thz = a.thz; }
        if (b.state === FLEE && a.state !== FLEE && d2 < 16) { a.panic += dt * rnd(0.3, 0.8); a.thx = b.thx; a.thz = b.thz; }
        const md = 0.62 * (a.s + b.s) * 0.5;
        if (d2 < 2.6 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const aMove = a.sp > 0.3, bMove = b.sp > 0.3;
          if (aMove && (a.vx * dx + a.vz * dz) > 0.6 * a.sp * d) { lanePoint(a.lane, a.u, 0, P); a.avoid += ((-P.tz * dx + P.tx * dz) > 0 ? -1 : 1) * dt * 2.2 * a.dir; }
          if (bMove && -(b.vx * dx + b.vz * dz) > 0.6 * b.sp * d) { lanePoint(b.lane, b.u, 0, P); b.avoid += ((-P.tz * -dx + P.tx * -dz) > 0 ? -1 : 1) * dt * 2.2 * b.dir; }
          a.avoid = Math.max(-1.2, Math.min(1.2, a.avoid)); b.avoid = Math.max(-1.2, Math.min(1.2, b.avoid));
          if (d < md) {
            const push = (md - d) * 0.5 / d;
            a.x -= dx * push; a.z -= dz * push; b.x += dx * push; b.z += dz * push;
          }
        }
      }
    }
  }

  function writeAnim(arr, o, c, t) {
    const f = (t / c.dur) * c.frames, i0 = Math.floor(f) % c.frames;
    arr[o] = c.row + i0; arr[o + 1] = c.row + ((i0 + 1) % c.frames); arr[o + 2] = f - Math.floor(f);
  }

  function writeInstance(a, im, i) {
    const e = im.instanceMatrix.array, o = i * 16, c = Math.cos(a.yaw) * a.s, sn = Math.sin(a.yaw) * a.s;
    e[o] = c; e[o + 1] = 0; e[o + 2] = -sn; e[o + 3] = 0;
    e[o + 4] = 0; e[o + 5] = a.s; e[o + 6] = 0; e[o + 7] = 0;
    e[o + 8] = sn; e[o + 9] = 0; e[o + 10] = c; e[o + 11] = 0;
    e[o + 12] = a.x; e[o + 13] = a.y; e[o + 14] = a.z; e[o + 15] = 1;
    const A = im.geometry.attributes.aAnimA.array, B = im.geometry.attributes.aAnimB.array;
    writeAnim(A, i * 4, CL[a.clip], a.ct);
    A[i * 4 + 3] = a.blend;
    if (a.blend > 0) writeAnim(B, i * 3, CL[a.prev], a.pt);
  }

  function render() {
    for (const v of variants) for (const im of v.lods) im.count = 0;
    vis.length = 0;
    if (cam) { cam.updateMatrixWorld(); PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(PM); }
    const cx = cam ? cam.matrixWorld.elements[12] : focusPts.length ? focusPts[0].x : 0;
    const cz = cam ? cam.matrixWorld.elements[14] : focusPts.length ? focusPts[0].z : 0;
    const cy = cam ? cam.matrixWorld.elements[13] : 0;
    for (const a of agents) {
      if (!a.on) continue;
      a.dist = Math.hypot(a.x - cx, a.y + 1 - cy, a.z - cz);
      if (a.dist > VIEW) continue;
      if (cam && !inView(a.x, a.y + 0.9 * a.s, a.z, 1.1 * a.s)) continue;
      vis.push(a);
    }
    vis.sort(byDist);
    if (vis.length > Q.visible) vis.length = Q.visible;
    let n0 = 0, tris = 0, calls = 0;
    const be = blobs.instanceMatrix.array;
    for (let k = 0; k < vis.length; k++) {
      const a = vis[k];
      const lod = n0 < Q.lod0 && a.dist < Q.lod0Dist ? 0 : 1;
      if (lod === 0) n0++;
      const im = a.v.lods[Math.min(lod, a.v.lods.length - 1)];
      writeInstance(a, im, im.count);
      im.count++;
      tris += im.userData.tris;
      const o = k * 16, bs = 0.95 * a.s;
      be[o] = bs; be[o + 1] = 0; be[o + 2] = 0; be[o + 3] = 0; be[o + 4] = 0; be[o + 5] = 1; be[o + 6] = 0; be[o + 7] = 0;
      be[o + 8] = 0; be[o + 9] = 0; be[o + 10] = bs * 0.8; be[o + 11] = 0; be[o + 12] = a.x; be[o + 13] = a.h + 0.02; be[o + 14] = a.z; be[o + 15] = 1;
    }
    blobs.count = vis.length;
    blobs.instanceMatrix.clearUpdateRanges(); blobs.instanceMatrix.addUpdateRange(0, vis.length * 16); blobs.instanceMatrix.needsUpdate = true;
    for (const v of variants) for (const im of v.lods) {
      im.visible = im.count > 0;
      if (!im.visible) continue;
      calls++;
      const A = im.geometry.attributes.aAnimA, B = im.geometry.attributes.aAnimB;
      im.instanceMatrix.clearUpdateRanges(); im.instanceMatrix.addUpdateRange(0, im.count * 16); im.instanceMatrix.needsUpdate = true;
      A.clearUpdateRanges(); A.addUpdateRange(0, im.count * 4); A.needsUpdate = true;
      B.clearUpdateRanges(); B.addUpdateRange(0, im.count * 3); B.needsUpdate = true;
    }
    stats.visible = vis.length; stats.lod0 = n0; stats.tris = Math.round(tris); stats.drawCalls = calls + (vis.length ? 1 : 0);
  }

  function update(dt, ctx = {}) {
    const t0 = performance.now();
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    clock = ctx.time !== undefined ? ctx.time : clock + dt;
    if (ctx.camera) cam = ctx.camera;
    if (city && city.walks !== walksRef) { walksRef = city.walks; G = buildGraph(walksRef, city.roads); for (const a of agents) deactivate(a); spawnedOnce = false; }
    if (lamps && lamps.count !== lampCount) { lampCount = lamps.count; for (const m of mats) { m.defines.PLATE_LAMPS = Math.max(1, lampCount); m.needsUpdate = true; } }
    focusPts.length = 0;
    const f = ctx.focus;
    if (f) { if (Array.isArray(f)) { for (const p of f) if (p) focusPts.push(p); } else focusPts.push(f); }
    if (!focusPts.length && cam) focusPts.push(cam.position);
    screamBudget = Math.max(0, screamBudget - dt * 0.75);
    if (cam) { cam.updateMatrixWorld(); PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(PM); }
    let active = 0;
    for (const a of agents) {
      if (!a.on) continue;
      let near = 1e9;
      for (const p of focusPts) near = Math.min(near, Math.hypot(a.x - p.x, a.z - p.z));
      if (hold) { active++; continue; }
      if (near > DESPAWN || (near > SPAWN_MAX + 6 && !inView(a.x, 1, a.z, 1.5) && a.state !== STAND)) { deactivate(a); continue; }
      active++;
    }
    if (!hold && focusPts.length && G.lanes.length) {
      const initial = !spawnedOnce;
      const tries = initial ? Q.agents * 12 : 6;
      for (let k = 0; k < tries && active < Q.agents; k++) {
        const p = focusPts[(Math.random() * focusPts.length) | 0];
        if (trySpawn(p.x, p.z, initial)) { active++; if (!initial && k > 1) break; }
      }
      spawnedOnce = true;
    }
    const ghosts = ctx.ghosts, streams = ctx.streams;
    if (ghosts) for (let i = 0; i < ghosts.length && i < GV.length; i++) {
      const g = ghosts[i], p = g && (g.pos || g.position), v = GV[i];
      if (!p) continue;
      if (g.vel) { v.x = g.vel.x; v.y = g.vel.y; v.z = g.vel.z; }
      else if (v.ok && dt > 0 && Math.abs(p.x - v.px) + Math.abs(p.y - v.py) + Math.abs(p.z - v.pz) > 4) { v.x = v.y = v.z = 0; }
      else if (v.ok && dt > 0) { const k = 1 - Math.exp(-dt * 6); v.x += ((p.x - v.px) / dt - v.x) * k; v.y += ((p.y - v.py) / dt - v.y) * k; v.z += ((p.z - v.pz) / dt - v.z) * k; }
      v.px = p.x; v.py = p.y; v.pz = p.z; v.ok = true;
    }
    let watchers = 0, wx = 0, wy = 0, wz = 0;
    for (const s of STATES) stats.states[s] = 0;
    for (const a of agents) {
      if (!a.on) continue;
      think(a, dt, ghosts, streams);
      step(a, dt);
      stats.states[STATES[a.state]]++;
      if (a.state === WATCH || a.state === FLEE || a.state === SCREAM) { watchers++; wx += a.x; wy += a.y; wz += a.z; }
    }
    separate(dt);
    if (audio && audio.play && focusPts.length) {
      murmurT -= dt;
      if (watchers >= 3) {
        AP.set(wx / watchers, wy / watchers + 1.6, wz / watchers);
        if ((!murmur || !murmur.alive) && murmurT <= 0) { murmurT = 2; murmur = audio.play('crowd_murmur', { pos: AP, loop: true, gain: 1, fadeIn: 0.8, ref: 6 }); if (!murmur.alive) murmur = null; }
        if (murmur) { murmur.gain(Math.min(1, (watchers - 2) / 6) * 0.85, 0.4); murmur.pos(AP); }
      } else if (murmur && watchers < 2) { murmur.stop(1.5); murmur = null; }
    }
    render();
    stats.agents = active;
    stats.cpu += (performance.now() - t0 - stats.cpu) * 0.1;
  }

  function panic(pos, radius = 8) {
    for (const a of agents) if (a.on && Math.hypot(a.x - pos.x, a.z - pos.z) < radius) startFlee(a, pos.x, pos.z, Math.hypot(a.x - pos.x, a.z - pos.z), 0.6);
  }

  function lineup(clip, x0, z0, yaw = 0, gap = 1.1) {
    for (const a of agents) deactivate(a);
    const L = { id: 'lineup', a: 0, b: 0, xs: new Float32Array([x0, x0 + 1]), zs: new Float32Array([z0, z0]), cum: new Float32Array([0, 1]), len: 1, m: 2, half: 1, crossing: false, need: 'ew', sig: null };
    variants.forEach((v, k) => {
      const a = agents[k];
      if (!a) return;
      activate(a, v, L, 0, 1);
      a.x = x0 + (k - (variants.length - 1) / 2) * gap * Math.cos(yaw); a.z = z0 - (k - (variants.length - 1) / 2) * gap * Math.sin(yaw);
      a.h = heightAt(a.x, a.z); a.y = a.h; a.yaw = yaw; a.state = STAND; a.timer = 1e9; a.face = false; a.pin = true;
      const c = clip === 'all' ? Object.keys(CL)[k % Object.keys(CL).length] : clip;
      a.clip = c; a.prev = c; a.ct = (k * 0.137 % 1) * CL[c].dur; a.blend = 0;
    });
    spawnedOnce = true; hold = true;
    return variants.length;
  }

  function dispose() {
    if (murmur) { murmur.stop(0.3); murmur = null; }
    scene.remove(root);
    for (const v of variants) for (const im of v.lods) { im.geometry.dispose(); im.dispose(); }
    for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    depthMat.dispose(); animTex.dispose(); blobGeo.dispose(); blobMat.dispose(); blobTex.dispose(); blobs.dispose();
  }

  return {
    root, stats, agents, variants: variants.map((v) => ({ id: v.id, name: v.name, s: v.s })), clips: Object.keys(CL), quality: qn,
    update, dispose, panic, lineup,
    release() { hold = false; for (const a of agents) deactivate(a); spawnedOnce = false; },
    setCamera(c) { cam = c; },
    get graph() { return { nodes: G.nodes.length, lanes: G.lanes.length, crossings: G.lanes.filter((l) => l.crossing).length }; },
  };
}
