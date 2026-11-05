// Street traffic for the 1984 city: lane-following cars with signals, car-following, junction yielding, honks, siren pull-over, Rapier knock-on physics and kerbside parking; local per client.
import { KINDS, createFleet } from './fleet.js';
import { buildNet, buildParking, roadsFromMapdef, signalClock, signalAxis, rng, CELL } from './roads.js';

export { KINDS };

const G_VEHICLE = 0x0008;
const GROUPS = ((G_VEHICLE << 16) | 0xffff) >>> 0;
const S_OFF = 0, S_DRIVE = 1, S_DYN = 2, S_WRECK = 3, S_EXIT = 4;
const M_LANE = 0, M_CONN = 1;
const STATE_NAME = ['off', 'drive', 'dynamic', 'wreck', 'exit'];
const CLS = { checker: 'car', nypd: 'car', caprice: 'car', ltd: 'car', cutlass: 'car', aries: 'car', bus: 'bus', boxtruck: 'truck', garbage: 'truck' };
const MOVE_W = { checker: 0.31, nypd: 0.05, caprice: 0.11, ltd: 0.11, cutlass: 0.09, aries: 0.1, bus: 0.07, boxtruck: 0.1, garbage: 0.05 };
const PARK_W = [0.17, 0.03, 0.19, 0.19, 0.16, 0.19, 0, 0.07, 0];
const PALETTE = [
  [0.42, 0.10, 0.11], [0.30, 0.19, 0.12], [0.70, 0.62, 0.46], [0.84, 0.81, 0.72], [0.14, 0.27, 0.20], [0.12, 0.16, 0.32],
  [0.56, 0.62, 0.70], [0.06, 0.06, 0.07], [0.86, 0.86, 0.84], [0.55, 0.31, 0.17], [0.68, 0.54, 0.20], [0.40, 0.41, 0.43],
  [0.44, 0.57, 0.74], [0.31, 0.07, 0.10], [0.23, 0.31, 0.27], [0.62, 0.20, 0.12],
].map((c) => c.map((v) => Math.pow(v, 2.2)));
const QUAL = { low: { cars: 12, parkR: 85, maxPark: 90 }, medium: { cars: 20, parkR: 110, maxPark: 150 }, high: { cars: 24, parkR: 130, maxPark: 200 } };
const MAX_CARS = 24;
const LOD0 = 28, LOD1 = 66;

function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export async function createTraffic(opts = {}) {
  const { THREE, RAPIER, world, scene, city = null, audio = null, quality = 'medium', base = 'assets/traffic/', seed = 1984 } = opts;
  const QL = QUAL[quality] || QUAL.medium;
  const target = Math.min(MAX_CARS, opts.cars ?? QL.cars);
  const spawnRange = opts.spawnRange || [70, 150];
  let M = null;
  try { M = await import('../city/mapdef.js'); } catch { M = null; }
  const roadsSrc = city?.roads || opts.roads || (M ? roadsFromMapdef(M, { bounds: opts.bounds || null }) : { nodes: [], lanes: [], signals: [] });
  const net = buildNet(roadsSrc);
  net.srcLinks = net.links.filter((L) => L.src);
  const clock = signalClock(34, 14.5, roadsSrc.cycle || null);
  const sigState = city?.signalState ? (s, t) => city.signalState(s.id, t) : clock;

  const avoid = [];
  if (M?.FIREHOUSE) { const b = M.FIREHOUSE.box; avoid.push([b[0] - 1, b[3] - 4, b[2] + 1, b[3] + 13]); }
  const addC = (p, r) => { if (p) avoid.push([p.x ?? p[0], p.z ?? p[1], r]); };
  addC(city?.spawns?.ecto?.pos, 10);
  for (const s of city?.sites || []) addC(s.park?.pos, 9);
  for (const a of opts.avoid || []) avoid.push(a);
  for (const n of roadsSrc.noParking || []) addC(n.p, (n.r || 6) + 1);
  const exclude = (x, z) => {
    for (const e of avoid) {
      if (e.length === 4) { if (x > e[0] && x < e[2] && z > e[1] && z < e[3]) return true; }
      else if (Math.hypot(x - e[0], z - e[1]) < e[2]) return true;
    }
    return false;
  };
  const parked = buildParking(net, { exclude, seed, kinds: KINDS, weights: PARK_W });

  let patchMaterial = null;
  try { patchMaterial = (await import('../world/materials.js')).patchMaterial; } catch { patchMaterial = null; }
  const fleet = await createFleet({ THREE, scene, base, lamps: opts.lamps || city?.lights?.uniforms || null, patchMaterial, quality });
  const KD = fleet.kinds;
  const moveKinds = KINDS.map((k, i) => (KD[i] ? MOVE_W[k] : 0));
  const parkKinds = PARK_W.map((w, i) => (KD[i] ? w : 0));
  for (let i = 0; i < parked.n; i++) if (!KD[parked.kind[i]]) parked.kind[i] = parkKinds.findIndex((w) => w > 0);

  const rand = rng(seed * 31 + 7);
  const cars = [];
  for (let i = 0; i < MAX_CARS; i++) cars.push(newCar(i));
  function newCar(i) {
    return {
      i, id: 0, state: S_OFF, ki: 0, K: null, cls: 'car', len: 4.8, hw: 0.95, wb: 2.9, wr: 0.34,
      mode: M_LANE, link: null, lane: null, s: 0, seg: 1, cs: 0, clen: 0, p0x: 0, p0z: 0, p1x: 0, p1z: 0, p2x: 0, p2z: 0, cnode: null, cfrom: null, fromAxis: 'ns', turnNow: 0,
      nextLink: null, nextTurn: 0, nextLaneK: 0, next2Link: null, next2Turn: 0, commit: false, lineWait: 0, exitD: 0,
      v: 0, acc: 0, vf: 1, aMax: 2.2, T: 1.2, s0: 2, lat: 0, latT: 0, latV: 0, x: 0, y: 0, z: 0, yaw: 0, hx: 0, hz: 1, pitch: 0, steer: 0, spin: 0,
      qx: 0, qy: 0, qz: 0, qw: 1, pr: 1, pg: 1, pb: 1, special: 0, flash: false, phase: 0,
      wait: 0, honkAt: 3, honkCd: 0, reason: 0, lr: 0, panic: 0, yieldT: 0, yieldSide: 1, yieldNear: false, hazard: false, brakeV: 0, busStopAt: -1, busT: 0,
      body: null, cols: [], rest: 0, dynT: 0, wreckT: 0, lx: 0, ly: 0, lz: 0, lq: 1, pd: 999, passed: false, busStop: false,
      pub: { id: 0, kind: '', object3D: new THREE.Object3D(), body: null, speed: 0, state: 'off' },
    };
  }

  const E = { on: false, x: 0, z: 0, fx: 0, fz: 1, vx: 0, vz: 0, v: 0, siren: false, hw: 1.05, hl: 3.05, px: 0, pz: 0, init: false };
  const GH = { n: 0, x: new Float32Array(8), z: new Float32Array(8), r: new Float32Array(8) };
  const PED = { n: 0, x: new Float32Array(8), z: new Float32Array(8) };
  const DEF_FOCUS = [new THREE.Vector3()];
  const owners = new Map();
  const carsOut = [];
  const displaced = new Map();
  const parkRecs = new Map();
  const recArr = [];
  const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sp = new THREE.Sphere(), _cp = new THREE.Vector3(), HV = new THREE.Vector3();
  let time = 0, sigT = 0, started = false, spawnCd = 0, parkT = 0, lastHonk = -9, lastPass = -9, lastImpact = -9, idc = 0, lastCam = null, voiceT = 0;
  const stats = { ms: 0, msMax: 0, active: 0, parkedDrawn: 0, parkedBodies: 0, calls: 0, tris: 0, instances: 0, glows: 0 };
  fleet.glow.pools.onBeforeRender = (r, s, c) => { lastCam = c; };
  const voices = [{ h: null, name: '', car: null }, { h: null, name: '', car: null }, { h: null, name: '', car: null }];

  const headL = KD.map((k) => { const e = k?.json?.empties || {}; return e.Headlight_L || (k ? [k.wid * 0.36, 0.75, k.len / 2 - 0.05] : [0.7, 0.75, 2.4]); });
  const tailL = KD.map((k) => { const e = k?.json?.empties || {}; return e.Taillight_L || (k ? [k.wid * 0.4, 0.8, -k.len / 2 + 0.05] : [0.7, 0.8, -2.4]); });

  function readEcto(e, dt) {
    if (!e) { E.on = false; return; }
    const root = e.root || e.object3D || e.obj || null;
    const p = root ? root.position : e.pos || null;
    if (!p) { E.on = false; return; }
    E.on = true;
    E.x = p.x; E.z = p.z;
    const q = root ? root.quaternion : e.quaternion;
    if (q) {
      let fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y);
      const l = Math.hypot(fx, fz) || 1;
      E.fx = fx / l; E.fz = fz / l;
    }
    const lv = e.body && e.body.linvel ? e.body.linvel() : null;
    if (lv) { E.vx = lv.x; E.vz = lv.z; }
    else if (E.init && dt > 1e-4) {
      const jx = E.x - E.px, jz = E.z - E.pz;
      if (jx * jx + jz * jz > 16) { E.vx = 0; E.vz = 0; }
      else { const k = Math.min(1, dt * 12); E.vx += (jx / dt - E.vx) * k; E.vz += (jz / dt - E.vz) * k; }
    }
    E.px = E.x; E.pz = E.z; E.init = true;
    E.v = Math.hypot(E.vx, E.vz);
    E.siren = !!(e.siren ?? e.sirenOn ?? false);
  }

  function readGhosts(gs) {
    GH.n = 0;
    if (!gs) return;
    for (let i = 0; i < gs.length && GH.n < 8; i++) {
      const g = gs[i];
      const p = g && (g.pos || g.position || g.object3D?.position);
      if (!p || (p.y ?? 0) > 6) continue;
      GH.x[GH.n] = p.x; GH.z[GH.n] = p.z; GH.r[GH.n] = (g.radius || 1) + (g.scary === false ? 0 : 6); GH.n++;
    }
  }

  function readPeds(focus) {
    PED.n = 0;
    for (let i = 0; i < focus.length && PED.n < 8; i++) {
      const f = focus[i];
      if ((f.y ?? 0) > 2.2) continue;
      if (E.on && Math.hypot(f.x - E.x, f.z - E.z) < 3.6) continue;
      PED.x[PED.n] = f.x; PED.z[PED.n] = f.z; PED.n++;
    }
  }

  function pickKind(L) {
    let tot = 0;
    for (let i = 0; i < moveKinds.length; i++) tot += kindOk(i, L) ? moveKinds[i] : 0;
    let u = rand() * tot;
    for (let i = 0; i < moveKinds.length; i++) { const w = kindOk(i, L) ? moveKinds[i] : 0; if (u < w) return i; u -= w; }
    return 2;
  }
  function kindOk(i, L) { const k = KINDS[i]; if (!KD[i]) return false; if (k === 'bus') return L.w >= 16; if (k === 'garbage' || k === 'boxtruck') return L.w >= 10; return true; }

  function pickNext(c, L) {
    const opts = L.next;
    if (!opts.length) return null;
    let tot = 0;
    for (let i = 0; i < opts.length; i++) tot += optW(c, opts[i]);
    let u = rand() * tot;
    for (let i = 0; i < opts.length; i++) { const w = optW(c, opts[i]); if (u < w) return opts[i]; u -= w; }
    return opts[opts.length - 1];
  }
  function optW(c, o) { let w = o.w; if (c.cls !== 'car' && o.link.w < 12) w *= 0.05; if (!o.link.next.length) w *= 0.15; return w; }
  function laneFor(c, L, turn) {
    const n = L.n;
    if (n === 1 || c.cls !== 'car') return 0;
    if (turn === 1) return 0;
    if (turn === 2) return n - 1;
    return Math.floor(rand() * n);
  }
  function planAhead(c) {
    const o = c.nextLink ? pickNext(c, c.nextLink) : null;
    c.next2Link = o ? o.link : null; c.next2Turn = o ? o.turn : 0;
    c.nextLaneK = c.nextLink ? laneFor(c, c.nextLink, c.next2Turn) : 0;
  }

  function lanePose(c) {
    const ln = c.lane, xs = ln.xs, zs = ln.zs, cs = ln.cs, n = ln.n;
    let i = c.seg;
    if (i < 1) i = 1;
    while (i < n - 1 && c.s > cs[i]) i++;
    while (i > 1 && c.s < cs[i - 1]) i--;
    c.seg = i;
    const sl = cs[i] - cs[i - 1] || 1e-6, t = (c.s - cs[i - 1]) / sl;
    _px = xs[i - 1] + (xs[i] - xs[i - 1]) * t; _pz = zs[i - 1] + (zs[i] - zs[i - 1]) * t;
    _tx = (xs[i] - xs[i - 1]) / sl; _tz = (zs[i] - zs[i - 1]) / sl;
  }
  let _px = 0, _pz = 0, _tx = 0, _tz = 1;
  function connPose(c) {
    const t = clamp(c.cs / c.clen, 0, 1), u = 1 - t;
    _px = u * u * c.p0x + 2 * u * t * c.p1x + t * t * c.p2x;
    _pz = u * u * c.p0z + 2 * u * t * c.p1z + t * t * c.p2z;
    let dx = 2 * u * (c.p1x - c.p0x) + 2 * t * (c.p2x - c.p1x), dz = 2 * u * (c.p1z - c.p0z) + 2 * t * (c.p2z - c.p1z);
    const l = Math.hypot(dx, dz) || 1;
    _tx = dx / l; _tz = dz / l;
  }

  function initCar(c, ln, s, ki, initial) {
    const K = KD[ki];
    const L = ln.link;
    c.state = S_DRIVE; c.id = ++idc; c.ki = ki; c.K = K; c.cls = CLS[KINDS[ki]];
    c.len = K.len; c.hw = K.wid / 2; c.wb = K.wb; c.wr = K.wr0;
    c.aMax = c.cls === 'car' ? 2.0 + rand() * 0.8 : c.cls === 'bus' ? 1.1 : 1.3;
    c.vf = (c.cls === 'car' ? 0.86 : 0.78) + rand() * 0.22 + (KINDS[ki] === 'checker' ? 0.1 : 0);
    c.T = 0.9 + rand() * 0.7; c.s0 = 1.6 + rand() * 1.1;
    const pal = K.tint ? PALETTE[Math.floor(rand() * PALETTE.length)] : null;
    c.pr = pal ? pal[0] : 1; c.pg = pal ? pal[1] : 1; c.pb = pal ? pal[2] : 1;
    c.special = KINDS[ki] === 'checker' ? (rand() < 0.55 ? 1 : 0) : KINDS[ki] === 'bus' ? 1 : 0;
    c.flash = KINDS[ki] === 'nypd' && rand() < 0.15;
    if (c.flash) c.vf += 0.15;
    c.phase = rand();
    c.link = L; c.lane = ln; c.mode = M_LANE; c.s = s; c.seg = 1; c.lat = 0; c.latT = 0; c.latV = 0;
    const o = pickNext(c, L);
    c.nextLink = o ? o.link : null; c.nextTurn = o ? o.turn : 0;
    if (c.cls !== 'car' && ln.k !== 0) { c.lane = L.lanes[0]; c.s = Math.min(s, c.lane.len - 0.5); }
    planAhead(c);
    c.commit = false; c.lineWait = 0; c.exitD = 0; c.cnode = null; c.cfrom = null;
    c.v = L.speed * c.vf * (initial ? 0.55 : 0.75); c.acc = 0;
    c.wait = 0; c.honkAt = 2.5 + rand() * 4; c.honkCd = 0; c.reason = 0; c.lr = 0; c.panic = 0; c.yieldT = 0; c.hazard = false;
    c.rest = 0; c.dynT = 0; c.wreckT = 0; c.pd = 999; c.passed = false; c.brakeV = c.v; c.pitch = 0; c.steer = 0; c.spin = rand() * 6;
    lanePose(c);
    c.x = _px; c.z = _pz; c.y = 0; c.yaw = Math.atan2(_tx, _tz); c.hx = _tx; c.hz = _tz;
    makeBody(c, RAPIER.RigidBodyDesc.kinematicPositionBased());
    c.pub.id = c.id; c.pub.kind = KINDS[ki]; c.pub.body = c.body; c.pub.state = 'drive';
  }

  function makeBody(c, desc) {
    const K = c.K;
    const s = Math.sin(c.yaw / 2), co = Math.cos(c.yaw / 2);
    c.body = world.createRigidBody(desc.setTranslation(c.x, c.y, c.z).setRotation({ x: 0, y: s, z: 0, w: co }).setLinearDamping(0.25).setAngularDamping(0.8).setCcdEnabled(true));
    const h = K.hgt, hw = K.wid / 2 * 0.96, hl = K.len / 2 * 0.97, low = 0.24;
    const a = world.createCollider(RAPIER.ColliderDesc.cuboid(hw, (h - low) / 2, hl).setTranslation(0, low + (h - low) / 2, 0).setMass(K.mass * 0.35).setFriction(0.7).setRestitution(0.05).setCollisionGroups(GROUPS), c.body);
    const b = world.createCollider(RAPIER.ColliderDesc.cuboid(hw * 0.9, 0.16, hl * 0.9).setTranslation(0, 0.42, 0).setMass(K.mass * 0.65).setFriction(0.7).setCollisionGroups(GROUPS), c.body);
    c.cols.length = 0; c.cols.push(a, b);
    owners.set(a.handle, c.pub); owners.set(b.handle, c.pub);
  }

  function freeCar(c) {
    if (c.body) {
      for (const col of c.cols) owners.delete(col.handle);
      try { world.removeRigidBody(c.body); } catch { }
    }
    c.body = null; c.cols.length = 0; c.state = S_OFF; c.pub.body = null; c.pub.state = 'off';
    for (const v of voices) if (v.car === c) v.car = null;
  }

  function nearestFocus(focus, x, z) {
    let d = Infinity;
    for (let i = 0; i < focus.length; i++) { const f = focus[i]; const e = Math.hypot(f.x - x, f.z - z); if (e < d) d = e; }
    return d;
  }

  function spawnOne(focus, minD, maxD, initial) {
    let c = null;
    for (let i = 0; i < cars.length; i++) if (cars[i].state === S_OFF) { c = cars[i]; break; }
    if (!c) return false;
    for (let tries = 0; tries < 10; tries++) {
      const f = focus[(rand() * focus.length) | 0];
      const ang = rand() * Math.PI * 2, r = minD + rand() * (maxD - minD);
      const cell = net.cellOf(f.x + Math.cos(ang) * r, f.z + Math.sin(ang) * r);
      if (!cell || !cell.length) continue;
      const ln = net.lanes[cell[(rand() * cell.length) | 0]];
      if (ln.len < 9) continue;
      if (trySpawnAt(c, focus, ln, 3 + rand() * (ln.len - 6), minD * 0.85, maxD + 25, initial)) return true;
    }
    if (net.srcLinks.length) {
      const L = net.srcLinks[(rand() * net.srcLinks.length) | 0];
      const ln = L.lanes[(rand() * L.n) | 0];
      if (trySpawnAt(c, focus, ln, 1.5, Math.min(25, minD * 0.4), maxD + 60, initial)) return true;
    }
    return false;
  }

  function trySpawnAt(c, focus, ln, s, dMin, dMax, initial) {
    c.lane = ln; c.s = s; c.seg = 1;
    lanePose(c);
    const x = _px, z = _pz;
    const d = nearestFocus(focus, x, z);
    if (d < dMin || d > dMax) return false;
    if (E.on && Math.hypot(E.x - x, E.z - z) < 16) return false;
    for (let i = 0; i < cars.length; i++) { const o = cars[i]; if (o.state !== S_OFF && Math.hypot(o.x - x, o.z - z) < 12) return false; }
    if (ln.link.to.sig && ln.len - s < 14) return false;
    initCar(c, ln, s, pickKind(ln.link), initial);
    return true;
  }

  function idm(c, v0, gap, vl) {
    const v = c.v, b = 3.0;
    const free = v0 < 0.3 ? (v > 0.05 ? 10 : 0) : Math.pow(v / v0, 4);
    if (gap < 0.05) return -9;
    const ss = c.s0 + Math.max(0, v * c.T + (v * (v - vl)) / (2 * Math.sqrt(c.aMax * b)));
    return c.aMax * (1 - free - (ss / gap) * (ss / gap));
  }
  function idmFree(c, v0) { if (v0 < 0.3) return c.v > 0.05 ? -3.5 : 0; return c.aMax * (1 - Math.pow(c.v / v0, 4)); }

  function gate(c, dt) {
    const L = c.link, N = L.to;
    if (!c.nextLink) return true;
    const ax = N.sig ? signalAxis(N.sig, L) : L.axis;
    if (!c.commit && N.sig) {
      const d = c.lane.len - c.s - c.len * 0.5;
      if (sigState(N.sig, sigT) !== ax) {
        if (c.v > 2.5 && d < (c.v * c.v) / 8 && d > -2) c.commit = true;
        else return false;
      } else if (d > 1 && sigState(N.sig, sigT + 2.6) !== ax) {
        if (d > (c.v * c.v) / 6 + 1.5) return false;
        c.commit = true;
      }
    }
    if (c.lineWait > 7) return true;
    for (let i = 0; i < cars.length; i++) {
      const o = cars[i];
      if (o === c || o.state !== S_DRIVE) continue;
      if (o.mode === M_CONN && o.cnode === N) {
        if (o.fromAxis !== ax) return false;
        if (c.nextTurn === 2 && o.cfrom !== L && o.turnNow !== 2 && o.cfrom.dEx * L.dEx + o.cfrom.dEz * L.dEz < -0.5) return false;
      } else if (o.mode === M_LANE && o.link.to === N && o.link !== L) {
        const dO = o.lane.len - o.s;
        if (c.nextTurn === 2 && o.nextTurn !== 2 && o.link.dEx * L.dEx + o.link.dEz * L.dEz < -0.5 && dO < 30 && o.v > 1.5) return false;
        if (!N.sig && o.link.axis !== L.axis && dO < 9 && o.lineWait > c.lineWait + 0.05) return false;
      }
    }
    return true;
  }

  function plan(c, dt) {
    const L = c.link;
    const hx = c.hx, hz = c.hz;
    let v0 = (c.mode === M_LANE ? L.speed : Math.min(L.speed, c.nextLink ? c.nextLink.speed : L.speed)) * c.vf;
    let reason = 0, lead = null;
    if (c.mode === M_CONN) v0 = Math.min(v0, c.turnNow === 0 ? v0 : c.turnNow === 1 ? 5.2 : 6.5);
    let dEnd = 1e9;
    if (c.mode === M_LANE && c.state === S_DRIVE) {
      dEnd = c.lane.len - c.s;
      if (c.nextLink && c.nextTurn !== 0) { const vt = c.nextTurn === 1 ? 5.2 : 6.5; v0 = Math.min(v0, Math.sqrt(vt * vt + 2 * 2.0 * Math.max(0, dEnd - c.len * 0.5))); }
      if (c.cls === 'bus' && c.busStop) v0 = Math.min(v0, 0.1);
    }
    if (c.yieldT > 0) v0 = Math.min(v0, c.yieldNear ? 0 : 3.5);
    if (c.panic > 0) v0 = 0;
    let a = idmFree(c, v0);
    if (c.yieldT > 0 && a < 0) reason = 6;
    if (c.panic > 0) { a = Math.min(a, -7); reason = 7; }
    if (dEnd < 70) {
      if (!gate(c, dt)) {
        const g = dEnd - c.len * 0.5 - 0.6;
        const ag = idm(c, v0, Math.max(0.06, g), 0);
        if (ag < a) { a = ag; reason = 1; }
        if (dEnd < 10 && c.v < 1) c.lineWait += dt;
      } else if (dEnd < 10 && c.v < 1) c.lineWait += dt;
    }
    for (let i = 0; i < cars.length; i++) {
      const o = cars[i];
      if (o === c || o.state === S_OFF) continue;
      const dx = o.x - c.x, dz = o.z - c.z;
      const along = dx * hx + dz * hz;
      if (along <= 0 || along > 70) continue;
      const lat = Math.abs(dx * hz - dz * hx);
      if (lat > 6) continue;
      let gap, vl;
      if (o.state === S_DRIVE || o.state === S_EXIT) {
        const cosd = hx * o.hx + hz * o.hz;
        if (cosd < -0.55) { if (lat > 1.2) continue; gap = along - (c.len + o.len) * 0.5; vl = 0; }
        else if (cosd < 0.55) {
          if (c.mode === M_CONN && o.mode === M_CONN) continue;
          if (lat > c.hw + o.len * 0.5) continue;
          gap = along - c.len * 0.5 - o.hw - 0.4; vl = 0;
        } else {
          if (lat > c.hw + o.hw + 0.25) continue;
          gap = along - (c.len + o.len) * 0.5; vl = o.v * cosd;
        }
      } else {
        if (lat > c.hw + o.len * 0.5) continue;
        gap = along - c.len * 0.5 - o.hw - 0.6; vl = 0;
      }
      const ai = idm(c, v0, Math.max(0.06, gap), vl);
      if (ai < a) { a = ai; reason = o.state === S_DRIVE || o.state === S_EXIT ? 2 : 5; lead = o; }
    }
    if (E.on) {
      const dx = E.x - c.x, dz = E.z - c.z, along = dx * hx + dz * hz;
      if (along > 0 && along < 70) {
        const lat = Math.abs(dx * hz - dz * hx), efx = Math.abs(E.fx * hz - E.fz * hx);
        if (lat < c.hw + E.hw + efx * (E.hl - E.hw) + 0.3) {
          const vl = Math.max(0, E.vx * hx + E.vz * hz);
          const ai = idm(c, v0, Math.max(0.06, along - c.len * 0.5 - E.hw - (1 - efx) * (E.hl - E.hw)), vl);
          if (ai < a) { a = ai; reason = 3; }
        }
      }
    }
    for (let i = 0; i < PED.n; i++) {
      const dx = PED.x[i] - c.x, dz = PED.z[i] - c.z, along = dx * hx + dz * hz;
      if (along <= 0 || along > 35) continue;
      if (Math.abs(dx * hz - dz * hx) > c.hw + 0.7) continue;
      const ai = idm(c, v0, Math.max(0.06, along - c.len * 0.5 - 0.8), 0);
      if (ai < a) { a = ai; reason = 4; }
    }
    for (let q = 0; q < recArr.length; q++) {
      const r = recArr[q];
      if (!r.moved) continue;
      const dx = r.x - c.x, dz = r.z - c.z, along = dx * hx + dz * hz;
      if (along <= 0 || along > 40 || Math.abs(dx * hz - dz * hx) > c.hw + r.len * 0.5) continue;
      const ai = idm(c, v0, Math.max(0.06, along - c.len * 0.5 - r.hw - 0.6), 0);
      if (ai < a) { a = ai; reason = 5; }
    }
    for (let i = 0; i < GH.n; i++) {
      const dx = GH.x[i] - c.x, dz = GH.z[i] - c.z, along = dx * hx + dz * hz;
      if (along > -2 && along < 14 && Math.abs(dx * hz - dz * hx) < GH.r[i] * 0.6 && c.panic <= 0) { c.panic = 3 + rand() * 2; if (c.v > 2) honk(c, 0.2); }
    }
    c.acc = clamp(a, -8.5, c.aMax);
    c.reason = reason;
    c.lr = reason === 2 && lead ? lead.lr : reason;
    if (reason === 3 && a < -5 && c.v > 5) honk(c, 0);
    const annoyed = c.lr === 3 || c.lr === 4 || c.lr === 5;
    if (c.v < 0.4 && annoyed) { c.wait += dt; if (c.wait > c.honkAt) { honk(c, 0); c.honkAt = c.wait + 3 + rand() * 6; } }
    else { c.wait = Math.max(0, c.wait - dt * 2); if (c.wait === 0) c.honkAt = 2 + rand() * 4; }
  }

  function siren(c, dt) {
    if (!E.on || !E.siren) { c.yieldT = Math.max(0, c.yieldT - dt); if (c.yieldT <= 0) c.latT = 0; return; }
    const rx = c.x - E.x, rz = c.z - E.z, d = Math.hypot(rx, rz);
    const along = rx * E.fx + rz * E.fz, lat = rx * E.fz - rz * E.fx;
    if (d < 60 && along > -5 && Math.abs(lat) < 14) {
      if (c.yieldT <= 0) {
        const L = c.link;
        c.yieldSide = L.oneWay && L.n > 1 && c.lane && c.lane.k > (L.n - 1) / 2 ? -1 : 1;
      }
      c.yieldT = 1.2;
      c.yieldNear = along < 30;
      c.latT = c.mode === M_LANE ? c.yieldSide * 1.05 : 0;
    } else {
      c.yieldT = Math.max(0, c.yieldT - dt);
      if (c.yieldT <= 0) c.latT = 0;
    }
  }

  function enterConn(c, over) {
    const A = c.lane, B = c.nextLink.lanes[Math.min(c.nextLaneK, c.nextLink.n - 1)];
    const p0x = A.xs[A.n - 1], p0z = A.zs[A.n - 1], p2x = B.xs[0], p2z = B.zs[0];
    const ax = A.dEx, az = A.dEz, bx = B.dSx, bz = B.dSz;
    const den = ax * bz - az * bx, ex = p2x - p0x, ez = p2z - p0z;
    let p1x = (p0x + p2x) / 2, p1z = (p0z + p2z) / 2;
    if (Math.abs(den) > 0.15) {
      const t = (ex * bz - ez * bx) / den, u = (ax * ez - az * ex) / den;
      if (t > 0 && u > 0 && t < 40 && u < 40) { p1x = p0x + ax * t; p1z = p0z + az * t; }
    }
    c.p0x = p0x; c.p0z = p0z; c.p1x = p1x; c.p1z = p1z; c.p2x = p2x; c.p2z = p2z;
    let len = 0, qx = p0x, qz = p0z;
    for (let k = 1; k <= 8; k++) {
      const t = k / 8, u = 1 - t;
      const x = u * u * p0x + 2 * u * t * p1x + t * t * p2x, z = u * u * p0z + 2 * u * t * p1z + t * t * p2z;
      len += Math.hypot(x - qx, z - qz); qx = x; qz = z;
    }
    c.cfrom = c.link; c.cnode = c.link.to;
    c.fromAxis = c.cnode.sig ? signalAxis(c.cnode.sig, c.link) : c.link.axis;
    c.turnNow = c.nextTurn; c.commit = false; c.lineWait = 0;
    if (len < 0.4) { enterLink(c, over); return; }
    c.clen = len; c.cs = over; c.mode = M_CONN;
    if (c.cs >= c.clen) enterLink(c, c.cs - c.clen);
  }

  function enterLink(c, over) {
    const B = c.nextLink;
    c.link = B; c.lane = B.lanes[Math.min(c.nextLaneK, B.n - 1)]; c.mode = M_LANE; c.s = Math.min(over, c.lane.len); c.seg = 1; c.cnode = null;
    c.nextLink = c.next2Link; c.nextTurn = c.next2Turn;
    planAhead(c);
    c.busStop = false;
    if (c.cls === 'bus' && c.lane.len > 60 && rand() < 0.35) { c.busStopAt = c.lane.len * (0.35 + rand() * 0.3); c.busT = 0; } else c.busStopAt = -1;
  }

  function move(c, dt) {
    const pv = c.v;
    c.v = Math.max(0, c.v + c.acc * dt);
    if (c.cls === 'bus' && pv > 2 && c.v < 0.3) sound('bus_air_brake', c, 0.8, 1);
    const ds = c.v * dt;
    if (c.state === S_EXIT) {
      c.exitD += ds;
      c.x += c.hx * ds; c.z += c.hz * ds;
      if (c.exitD > 14) { freeCar(c); return; }
    } else if (c.mode === M_LANE) {
      c.s += ds;
      if (c.cls === 'bus' && c.busStopAt > 0) {
        if (!c.busStop && c.s > c.busStopAt - 0.5 && c.s < c.busStopAt + 2) { c.busStop = true; c.busT = 0; }
        if (c.busStop) { c.busT += dt; if (c.busT > 6) { c.busStop = false; c.busStopAt = -1; } }
      }
      if (c.s >= c.lane.len) {
        if (!c.nextLink) { c.state = S_EXIT; c.exitD = 0; c.hx = c.lane.dEx; c.hz = c.lane.dEz; }
        else enterConn(c, c.s - c.lane.len);
      }
    } else {
      c.cs += ds;
      if (c.cs >= c.clen) enterLink(c, c.cs - c.clen);
    }
    if (c.state !== S_DRIVE) return;
    if (c.mode === M_LANE) lanePose(c); else connPose(c);
    const dl = clamp(c.latT - c.lat, -dt * 1.1, dt * 1.1);
    c.lat += dl;
    c.latV += (dl / Math.max(dt, 1e-4) - c.latV) * Math.min(1, dt * 8);
    const nx = _px - _tz * c.lat, nz = _pz + _tx * c.lat;
    const yawT = Math.atan2(_tx, _tz) - Math.atan2(c.latV, Math.max(c.v, 2));
    const py = c.yaw;
    c.yaw = wrap(c.yaw + wrap(yawT - c.yaw) * Math.min(1, dt * 9));
    c.hx = Math.sin(c.yaw); c.hz = Math.cos(c.yaw);
    c.x = nx; c.z = nz; c.y = 0;
    const yr = wrap(c.yaw - py) / Math.max(dt, 1e-4);
    c.steer += (clamp(Math.atan((c.wb * yr) / Math.max(c.v, 0.8)), -0.6, 0.6) - c.steer) * Math.min(1, dt * 6);
    c.spin = (c.spin + (c.v / c.wr) * dt) % (Math.PI * 2);
    c.pitch += (clamp(-c.acc * 0.0045, -0.028, 0.028) - c.pitch) * Math.min(1, dt * 5);
    c.panic = Math.max(0, c.panic - dt);
    c.honkCd = Math.max(0, c.honkCd - dt);
    yawQuat(c);
    if (c.body) {
      _v3.x = c.x; _v3.y = 0; _v3.z = c.z;
      c.body.setNextKinematicTranslation(_v3);
      _q4.x = 0; _q4.y = Math.sin(c.yaw / 2); _q4.z = 0; _q4.w = Math.cos(c.yaw / 2);
      c.body.setNextKinematicRotation(_q4);
    }
  }
  const _v3 = { x: 0, y: 0, z: 0 }, _q4 = { x: 0, y: 0, z: 0, w: 1 };

  function yawQuat(c) {
    const sy = Math.sin(c.yaw / 2), cy = Math.cos(c.yaw / 2), sp = Math.sin(c.pitch / 2), cp = Math.cos(c.pitch / 2);
    c.qx = cy * sp; c.qy = sy * cp; c.qz = -sy * sp; c.qw = cy * cp;
  }

  function toDynamic(c, vx, vz, rs) {
    if (!c.body || c.state === S_DYN) return;
    c.state = S_DYN; c.rest = 0; c.dynT = 0; c.hazard = true; c.pub.state = 'dynamic';
    c.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    c.body.setLinvel({ x: vx, y: 0, z: vz }, true);
    c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    c.lx = c.x; c.ly = c.y; c.lz = c.z; c.lq = 1;
    if (rs > 3 && time - lastImpact > 0.35) { sound('car_impact', c, Math.min(1, rs / 12), 1); lastImpact = time; }
    c.honkAt = c.wait + 1 + rand();
    c.panic = 0;
  }

  function dynStep(c, dt) {
    const t = c.body.translation(), r = c.body.rotation();
    const sp = Math.hypot(t.x - c.lx, t.y - c.ly, t.z - c.lz) / Math.max(dt, 1e-4);
    const dq = Math.abs(r.x * c.qx + r.y * c.qy + r.z * c.qz + r.w * c.qw);
    const ang = 2 * Math.acos(Math.min(1, dq)) / Math.max(dt, 1e-4);
    c.x = t.x; c.y = t.y; c.z = t.z; c.qx = r.x; c.qy = r.y; c.qz = r.z; c.qw = r.w;
    c.lx = t.x; c.ly = t.y; c.lz = t.z;
    let fx = 2 * (r.x * r.z + r.w * r.y), fz = 1 - 2 * (r.x * r.x + r.y * r.y);
    const l = Math.hypot(fx, fz) || 1;
    c.hx = fx / l; c.hz = fz / l; c.yaw = Math.atan2(c.hx, c.hz);
    c.v = sp;
    c.dynT += dt;
    if (sp < 0.35 && ang < 0.4) c.rest += dt; else c.rest = 0;
    if (c.y < -8) { freeCar(c); return; }
    if (c.rest > 1.2 || c.dynT > 14) settle(c);
  }

  function settle(c) {
    const up = 1 - 2 * (c.qx * c.qx + c.qz * c.qz);
    c.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    if (up > 0.86 && rejoin(c)) {
      c.state = S_DRIVE; c.pub.state = 'drive'; c.hazard = false; c.y = 0; c.v = 0; c.acc = 0; c.pitch = 0;
      c.panic = 1.5 + rand() * 2;
      honk(c, 0.5);
      return;
    }
    c.state = S_WRECK; c.wreckT = 0; c.hazard = true; c.v = 0; c.pub.state = 'wreck';
  }

  function rejoin(c) {
    let best = null, bd = 5.5, bs = 0, bl = 0;
    const cx = Math.floor(c.x / CELL), cz = Math.floor(c.z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const cell = net.cellOf((cx + i + 0.5) * CELL, (cz + j + 0.5) * CELL);
      if (!cell) continue;
      for (const gi of cell) {
        const ln = net.lanes[gi];
        for (let k = 1; k < ln.n; k++) {
          const ax = ln.xs[k - 1], az = ln.zs[k - 1], dx = ln.xs[k] - ax, dz = ln.zs[k] - az, sl = Math.hypot(dx, dz) || 1e-6;
          const tx = dx / sl, tz = dz / sl;
          if (tx * c.hx + tz * c.hz < 0.6) continue;
          const t = clamp(((c.x - ax) * tx + (c.z - az) * tz) / sl, 0, 1);
          const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(c.x - px, c.z - pz);
          if (d < bd) { bd = d; best = ln; bs = ln.cs[k - 1] + t * sl; bl = (c.x - px) * -tz + (c.z - pz) * tx; }
        }
      }
    }
    if (!best || bs > best.len - 3) return false;
    c.link = best.link; c.lane = best; c.mode = M_LANE; c.s = bs; c.seg = 1; c.lat = bl; c.latT = 0; c.latV = 0;
    const o = pickNext(c, c.link);
    c.nextLink = o ? o.link : null; c.nextTurn = o ? o.turn : 0;
    planAhead(c);
    c.commit = false; c.lineWait = 0; c.cnode = null;
    return true;
  }

  function obb(ax, az, afx, afz, ahw, ahl, bx, bz, bfx, bfz, bhw, bhl, m) {
    const dx = bx - ax, dz = bz - az;
    const axes0 = afx, axes1 = afz;
    for (let k = 0; k < 4; k++) {
      let nx, nz;
      if (k === 0) { nx = axes0; nz = axes1; } else if (k === 1) { nx = -axes1; nz = axes0; } else if (k === 2) { nx = bfx; nz = bfz; } else { nx = -bfz; nz = bfx; }
      const d = Math.abs(dx * nx + dz * nz);
      const ra = ahl * Math.abs(afx * nx + afz * nz) + ahw * Math.abs(-afz * nx + afx * nz);
      const rb = bhl * Math.abs(bfx * nx + bfz * nz) + bhw * Math.abs(-bfz * nx + bfx * nz);
      if (d > ra + rb + m) return false;
    }
    return true;
  }

  function hitTest(dt) {
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (c.state !== S_DRIVE && c.state !== S_WRECK && c.state !== S_EXIT) continue;
      const cvx = c.hx * c.v, cvz = c.hz * c.v;
      if (E.on && Math.abs(E.x - c.x) < 12 && Math.abs(E.z - c.z) < 12) {
        const rs = Math.hypot(E.vx - cvx, E.vz - cvz);
        if (rs > 0.8 && obb(E.x, E.z, E.fx, E.fz, E.hw, E.hl, c.x, c.z, c.hx, c.hz, c.hw, c.len * 0.5, 0.12 + rs * dt * 2.5)) toDynamic(c, cvx, cvz, rs);
      }
    }
    for (let i = 0; i < cars.length; i++) {
      const d = cars[i];
      if (d.state !== S_DYN || d.v < 2.2) continue;
      for (let j = 0; j < cars.length; j++) {
        const c = cars[j];
        if (c === d || (c.state !== S_DRIVE && c.state !== S_WRECK)) continue;
        if (Math.abs(d.x - c.x) > 9 || Math.abs(d.z - c.z) > 9) continue;
        if (obb(d.x, d.z, d.hx, d.hz, d.hw, d.len * 0.5, c.x, c.z, c.hx, c.hz, c.hw, c.len * 0.5, 0.15)) toDynamic(c, c.hx * c.v, c.hz * c.v, d.v);
      }
      for (let q = 0; q < recArr.length; q++) { const r = recArr[q]; if (r.state === 0 && Math.abs(d.x - r.x) < 9 && Math.abs(d.z - r.z) < 9 && obb(d.x, d.z, d.hx, d.hz, d.hw, d.len * 0.5, r.x, r.z, r.hx, r.hz, r.hw, r.len * 0.5, 0.15)) parkDynamic(r, d.v); }
    }
    if (E.on && E.v > 0.8) for (let q = 0; q < recArr.length; q++) {
      const r = recArr[q];
      if (r.state !== 0 || Math.abs(E.x - r.x) > 10 || Math.abs(E.z - r.z) > 10) continue;
      if (obb(E.x, E.z, E.fx, E.fz, E.hw, E.hl, r.x, r.z, r.hx, r.hz, r.hw, r.len * 0.5, 0.12 + E.v * dt * 2.5)) parkDynamic(r, E.v);
    }
  }

  function parkPose(i, out) {
    const d = displaced.get(i);
    if (d) { out.x = d.x; out.y = d.y; out.z = d.z; out.qx = d.qx; out.qy = d.qy; out.qz = d.qz; out.qw = d.qw; return true; }
    const yaw = parked.yaw[i];
    out.x = parked.x[i]; out.y = 0; out.z = parked.z[i]; out.qx = 0; out.qy = Math.sin(yaw / 2); out.qz = 0; out.qw = Math.cos(yaw / 2);
    return false;
  }
  const PP = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };

  function parkDynamic(r, rs) {
    r.state = 1; r.moved = true; r.rest = 0; r.t = 0;
    r.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    if (rs > 3 && time - lastImpact > 0.35) { sound('car_impact', r, Math.min(1, rs / 12), 1); lastImpact = time; }
  }

  function parkedPhysics(focus, dt) {
    parkT -= dt;
    for (let q = recArr.length - 1; q >= 0; q--) {
      const r = recArr[q];
      if (r.state !== 1) continue;
      const t = r.body.translation(), rq = r.body.rotation();
      const sp = Math.hypot(t.x - r.x, t.z - r.z, t.y - r.y) / Math.max(dt, 1e-4);
      r.x = t.x; r.y = t.y; r.z = t.z; r.qx = rq.x; r.qy = rq.y; r.qz = rq.z; r.qw = rq.w;
      let fx = 2 * (rq.x * rq.z + rq.w * rq.y), fz = 1 - 2 * (rq.x * rq.x + rq.y * rq.y);
      const l = Math.hypot(fx, fz) || 1; r.hx = fx / l; r.hz = fz / l;
      let d = displaced.get(r.slot);
      if (!d) { d = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 }; displaced.set(r.slot, d); }
      d.x = r.x; d.y = r.y; d.z = r.z; d.qx = r.qx; d.qy = r.qy; d.qz = r.qz; d.qw = r.qw;
      r.t += dt;
      if (sp < 0.3) r.rest += dt; else r.rest = 0;
      if (r.y < -8) { displaced.delete(r.slot); dropRec(r); continue; }
      if (r.rest > 1.5 || r.t > 15) { r.state = 2; r.body.setBodyType(RAPIER.RigidBodyType.Fixed, true); }
    }
    if (parkT > 0) return;
    parkT = 0.25;
    const R = 42;
    for (let q = 0; q < recArr.length; q++) recArr[q].keep = false;
    const pts = E.on ? focus.length + 1 : focus.length;
    for (let f = 0; f < pts; f++) {
      const fx = f < focus.length ? focus[f].x : E.x, fz = f < focus.length ? focus[f].z : E.z;
      if (f < focus.length && (focus[f].y ?? 0) > 6) continue;
      const c0 = Math.floor((fx - R) / CELL), c1 = Math.floor((fx + R) / CELL), d0 = Math.floor((fz - R) / CELL), d1 = Math.floor((fz + R) / CELL);
      for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) {
        const cell = parked.cell(cx, cz);
        if (!cell) continue;
        for (const i of cell) {
          if (Math.abs(parked.x[i] - fx) > R || Math.abs(parked.z[i] - fz) > R) continue;
          let r = parkRecs.get(i);
          if (!r) { r = addRec(i); if (!r) continue; }
          r.keep = true;
        }
      }
    }
    for (let q = recArr.length - 1; q >= 0; q--) { const r = recArr[q]; if (!r.keep && r.state !== 1) dropRec(r); }
    stats.parkedBodies = parkRecs.size;
    if (displaced.size > 64) {
      for (const [k] of displaced) { if (parkRecs.has(k)) continue; if (nearestFocus(focus, parked.x[k], parked.z[k]) > 260) displaced.delete(k); }
    }
  }

  function addRec(i) {
    if (parkRecs.size > 70) return null;
    const K = KD[parked.kind[i]];
    if (!K) return null;
    const moved = parkPose(i, PP);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(PP.x, PP.y, PP.z).setRotation({ x: PP.qx, y: PP.qy, z: PP.qz, w: PP.qw }).setLinearDamping(0.3).setAngularDamping(0.8));
    const h = K.hgt, hw = K.wid / 2 * 0.96, hl = K.len / 2 * 0.97, low = 0.24;
    const pub = { id: -1 - i, kind: KINDS[parked.kind[i]], object3D: null, body, speed: 0, state: 'parked' };
    const a = world.createCollider(RAPIER.ColliderDesc.cuboid(hw, (h - low) / 2, hl).setTranslation(0, low + (h - low) / 2, 0).setMass(K.mass * 0.35).setFriction(0.7).setCollisionGroups(GROUPS), body);
    const b = world.createCollider(RAPIER.ColliderDesc.cuboid(hw * 0.9, 0.16, hl * 0.9).setTranslation(0, 0.42, 0).setMass(K.mass * 0.65).setFriction(0.7).setCollisionGroups(GROUPS), body);
    owners.set(a.handle, pub); owners.set(b.handle, pub);
    let fx = 2 * (PP.qx * PP.qz + PP.qw * PP.qy), fz = 1 - 2 * (PP.qx * PP.qx + PP.qy * PP.qy);
    const l = Math.hypot(fx, fz) || 1;
    const r = { slot: i, body, cols: [a, b], pub, state: moved ? 2 : 0, moved, keep: true, x: PP.x, y: PP.y, z: PP.z, qx: PP.qx, qy: PP.qy, qz: PP.qz, qw: PP.qw, hx: fx / l, hz: fz / l, hw: K.wid / 2, len: K.len, rest: 0, t: 0 };
    parkRecs.set(i, r);
    recArr.push(r);
    return r;
  }

  function dropRec(r) {
    for (const c of r.cols) owners.delete(c.handle);
    try { world.removeRigidBody(r.body); } catch { }
    parkRecs.delete(r.slot);
    const k = recArr.indexOf(r);
    if (k >= 0) recArr.splice(k, 1);
  }

  function honk(c, delay) {
    if (c.honkCd > 0) return;
    c.honkCd = 2.5;
    if (!audio || !audio.ctx || time - lastHonk < 0.55) return;
    lastHonk = time;
    const cls = c.cls;
    HV.set(c.x, 1.0, c.z);
    audio.play('traffic_horn', { pos: HV, ref: 7, rolloff: 1.1, jitter: 0.1, delay: delay || 0, rate: cls === 'car' ? (c.ki === 0 ? 1.08 : 0.97 + c.phase * 0.12) : 0.74, gain: 0.85 });
  }

  function sound(name, c, gain, rate) {
    if (!audio || !audio.ctx || !focus0) return;
    if (Math.hypot(c.x - focus0.x, c.z - focus0.z) > 80) return;
    HV.set(c.x, 1.0, c.z);
    audio.play(name, { pos: HV, ref: 6, gain, rate, jitter: 0.06 });
  }
  let focus0 = null;

  function audioStep(dt, focus) {
    if (!audio || !audio.ctx) return;
    const f = focus[0];
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (c.state !== S_DRIVE) continue;
      const d = Math.hypot(c.x - f.x, c.z - f.z);
      if (c.v > 8.5 && d < 9 && d > c.pd && !c.passed && time - lastPass > 0.7) {
        c.passed = true; lastPass = time;
        HV.set(c.x, 0.8, c.z);
        audio.play('traffic_pass_' + c.cls, { pos: HV, ref: 5, gain: 0.9, jitter: 0.08 });
      }
      if (d > 22) c.passed = false;
      c.pd = d;
    }
    voiceT -= dt;
    if (voiceT <= 0) {
      voiceT = 0.25;
      for (const v of voices) v.want = null;
      for (let k = 0; k < voices.length; k++) {
        let best = null, bd = 32;
        for (let i = 0; i < cars.length; i++) {
          const c = cars[i];
          if (c.state !== S_DRIVE) continue;
          let taken = false;
          for (let q = 0; q < k; q++) if (voices[q].want === c) taken = true;
          if (taken) continue;
          const d = Math.hypot(c.x - f.x, c.z - f.z);
          if (d < bd) { bd = d; best = c; }
        }
        voices[k].want = best;
      }
      for (const v of voices) {
        const c = v.want;
        const name = c ? 'traffic_idle_' + c.cls : '';
        if (v.h && (v.name !== name)) { v.h.stop(0.4); v.h = null; v.name = ''; }
        v.car = c;
        if (c && !v.h) {
          HV.set(c.x, 0.6, c.z);
          const h = audio.play(name, { pos: HV, loop: true, ref: 4, gain: 0.0, fadeIn: 0.3 });
          if (h && h.alive) { v.h = h; v.name = name; }
        }
      }
    }
    for (const v of voices) {
      if (!v.h || !v.car) continue;
      const c = v.car;
      HV.set(c.x, 0.6, c.z);
      v.h.pos(HV);
      const k = Math.min(1, c.v / 13);
      v.h.gain(0.5 + k * 0.5, 0.12);
      v.h.rate(0.85 + k * 0.55, 0.15);
    }
  }

  function draw(focus) {
    fleet.begin();
    const cam = opts.camera || lastCam;
    let rx, rz, ry = 1.6;
    if (cam) {
      cam.getWorldPosition(_cp); rx = _cp.x; ry = _cp.y; rz = _cp.z;
      _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      _fr.setFromProjectionMatrix(_pm);
    } else { rx = focus[0].x; rz = focus[0].z; }
    const blink = (time * 1.5) % 1 < 0.5 ? 1 : 0;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (c.state === S_OFF) continue;
      const dx = c.x - rx, dz = c.z - rz, d = Math.hypot(dx, dz, c.y - ry);
      if (d > 200) continue;
      let vis = true;
      if (cam) { _sp.center.set(c.x, c.y + 1, c.z); _sp.radius = c.len * 0.5 + 0.6; vis = _fr.intersectsSphere(_sp); }
      const drive = c.state === S_DRIVE || c.state === S_EXIT;
      const brake = drive ? (c.acc < -0.7 || c.v < 0.25 ? 1 : 0) : 0;
      const ph = (time * 1.5 + c.phase) % 1 < 0.5 ? 1 : 0;
      let bl = 0, br = 0;
      if (c.hazard || c.panic > 0) { bl = br = ph; }
      else if (drive) {
        const t = c.mode === M_CONN ? c.turnNow : c.lane && c.lane.len - c.s < 40 ? c.nextTurn : 0;
        if (t === 2) bl = ph; else if (t === 1) br = ph;
      }
      let sp = c.special;
      if (c.flash) sp = (time * 2.6 + c.phase) % 1 < 0.5 ? 1 : 0.15;
      if (vis) {
        const lod = d < LOD0 ? 0 : d < LOD1 ? 1 : 2;
        fleet.push(c.ki, lod, c.x, c.y, c.z, c.qx, c.qy, c.qz, c.qw, c.pr, c.pg, c.pb, c.state === S_WRECK ? 0.4 : 1, brake, bl, br, sp, c.steer, c.spin);
        if (d < 90) fleet.glow.blob(c.x, c.z, Math.atan2(c.hx, c.hz), c.hw * 2 + 0.7, c.len + 0.8, 0.72 * clamp(1 - c.y / 2.5, 0, 1));
      }
      if (d < 95 && c.y < 0.6) glows(c, brake, cam ? rx : null, rz, d);
    }
    let np = 0;
    const R = QL.parkR;
    const c0 = Math.floor((rx - R) / CELL), c1 = Math.floor((rx + R) / CELL), d0 = Math.floor((rz - R) / CELL), d1 = Math.floor((rz + R) / CELL);
    for (let cx = c0; cx <= c1 && np < QL.maxPark; cx++) for (let cz = d0; cz <= d1 && np < QL.maxPark; cz++) {
      const cell = parked.cell(cx, cz);
      if (!cell) continue;
      for (let k = 0; k < cell.length && np < QL.maxPark; k++) {
        const i = cell[k];
        const r = parkRecs.get(i);
        if (r) { PP.x = r.x; PP.y = r.y; PP.z = r.z; PP.qx = r.qx; PP.qy = r.qy; PP.qz = r.qz; PP.qw = r.qw; } else parkPose(i, PP);
        const dx = PP.x - rx, dz = PP.z - rz, d = Math.hypot(dx, dz);
        if (d > R) continue;
        if (cam) { _sp.center.set(PP.x, PP.y + 1, PP.z); _sp.radius = 3.2; if (!_fr.intersectsSphere(_sp)) continue; }
        const ki = parked.kind[i];
        const K = KD[ki];
        if (!K) continue;
        let pr = 1, pg = 1, pb = 1;
        if (K.tint) { const p = PALETTE[parked.tint[i] % PALETTE.length]; pr = p[0]; pg = p[1]; pb = p[2]; }
        fleet.push(ki, d < LOD0 ? 0 : d < LOD1 ? 1 : 2, PP.x, PP.y, PP.z, PP.qx, PP.qy, PP.qz, PP.qw, pr, pg, pb, 0, 0, 0, 0, 0, 0, 0);
        if (d < 90) fleet.glow.blob(PP.x, PP.z, 2 * Math.atan2(PP.qy, PP.qw), K.wid + 0.7, K.len + 0.8, 0.72 * clamp(1 - PP.y / 2.5, 0, 1));
        np++;
      }
    }
    stats.parkedDrawn = np;
    fleet.end();
  }

  function glows(c, brake, camX, camZ, d) {
    if (c.state === S_DYN) return;
    const g = fleet.glow, hx = c.hx, hz = c.hz, rxv = -hz, rzv = hx;
    const on = c.state === S_WRECK ? 0.4 : 1;
    const fade = 1 - clamp((d - 60) / 35, 0, 1);
    const yaw = Math.atan2(hx, hz);
    const fw = c.len * 0.5;
    g.pool(c.x + hx * (fw + 5.2), c.z + hz * (fw + 5.2), yaw, 4.4, 10.5, 0.2 * on * fade, 0.16 * on * fade, 0.105 * on * fade);
    const tb = 0.18 + brake * 0.55;
    g.pool(c.x - hx * (fw + 0.9), c.z - hz * (fw + 0.9), yaw, 2.6, 2.4, tb * fade, 0.012 * fade, 0.008 * fade);
    if (camX == null || d > 75) return;
    const tcx = camX - c.x, tcz = camZ - c.z, tl = Math.hypot(tcx, tcz) || 1;
    const front = clamp(((tcx * hx + tcz * hz) / tl + 0.15) / 0.7, 0, 1), back = clamp(((-tcx * hx - tcz * hz) / tl + 0.15) / 0.7, 0, 1);
    const H = headL[c.ki], T = tailL[c.ki];
    if (front > 0.02) {
      const k = front * on * fade;
      for (let s = -1; s <= 1; s += 2) {
        const lx = c.x + hx * H[2] + rxv * -H[0] * s, lz = c.z + hz * H[2] + rzv * -H[0] * s;
        g.streak(lx, lz, camX, camZ, 0.3, 4 + H[1] * 4, 0.38 * k, 0.31 * k, 0.21 * k);
      }
    }
    if (back > 0.02) {
      const k = back * fade * (0.35 + brake * 0.9);
      for (let s = -1; s <= 1; s += 2) {
        const lx = c.x + hx * T[2] + rxv * -T[0] * s, lz = c.z + hz * T[2] + rzv * -T[0] * s;
        g.streak(lx, lz, camX, camZ, 0.26, 3 + T[1] * 4, 0.42 * k, 0.015 * k, 0.008 * k);
      }
    }
  }

  function publish() {
    let n = 0;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (c.state === S_OFF) continue;
      const p = c.pub, o = p.object3D;
      o.position.set(c.x, c.y, c.z);
      o.quaternion.set(c.qx, c.qy, c.qz, c.qw);
      o.updateMatrixWorld();
      p.speed = c.v; p.state = STATE_NAME[c.state];
      carsOut[n++] = p;
    }
    carsOut.length = n;
  }

  function update(dt, ctx = {}) {
    const t0 = performance.now();
    dt = clamp(dt || 0, 0, 0.1);
    time = ctx.time != null ? ctx.time : time + dt;
    sigT = typeof city?.time === 'number' ? city.time : time;
    const focus = ctx.focus && ctx.focus.length ? ctx.focus : DEF_FOCUS;
    focus0 = focus[0];
    if (ctx.camera) opts.camera = ctx.camera;
    readEcto(ctx.ecto, dt);
    readGhosts(ctx.ghosts);
    readPeds(focus);
    if (!started) {
      started = true;
      for (let k = 0; k < target * 3 && active() < target; k++) spawnOne(focus, Math.min(14, spawnRange[0]), spawnRange[1], true);
    }
    spawnCd -= dt;
    if (spawnCd <= 0 && active() < target) { spawnOne(focus, spawnRange[0], spawnRange[1], false); spawnCd = 0.12; }
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (c.state === S_DRIVE) { siren(c, dt); plan(c, dt); }
      else if (c.state === S_EXIT) { c.acc = 0.5; }
    }
    for (let i = 0; i < cars.length; i++) { const c = cars[i]; if (c.state === S_DRIVE || c.state === S_EXIT) move(c, dt); }
    for (let i = 0; i < cars.length; i++) { const c = cars[i]; if (c.state === S_DYN) dynStep(c, dt); }
    hitTest(dt);
    parkedPhysics(focus, dt);
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (c.state === S_OFF) continue;
      const d = nearestFocus(focus, c.x, c.z);
      if (c.state === S_WRECK) { c.wreckT += dt; if (d > 120 || (c.wreckT > 90 && d > 60)) freeCar(c); continue; }
      if (c.state === S_DRIVE && d > spawnRange[1] + 35) freeCar(c);
    }
    audioStep(dt, focus);
    draw(focus);
    publish();
    const ms = performance.now() - t0;
    stats.ms += (ms - stats.ms) * 0.05;
    stats.msMax = Math.max(stats.msMax * 0.995, ms);
    stats.active = carsOut.length;
    const fs = fleet.stats();
    stats.calls = fs.calls; stats.tris = fs.tris; stats.instances = fs.instances; stats.glows = fs.glows;
  }

  function active() { let n = 0; for (let i = 0; i < cars.length; i++) if (cars[i].state !== S_OFF) n++; return n; }

  return {
    cars: carsOut,
    net, parked, fleet, stats,
    update,
    ownerOf(col) { return col ? owners.get(typeof col === 'number' ? col : col.handle) || null : null; },
    knock(pub, impulse) {
      const c = cars.find((q) => q.pub === pub);
      if (c && c.body) { toDynamic(c, c.hx * c.v, c.hz * c.v, 0); if (impulse) c.body.applyImpulse(impulse, true); return true; }
      for (const r of recArr) if (r.pub === pub) { if (r.state !== 1) parkDynamic(r, 0); if (impulse) r.body.applyImpulse(impulse, true); return true; }
      return false;
    },
    debug() { return cars.filter((c) => c.state !== S_OFF).map((c) => ({ id: c.id, k: KINDS[c.ki], st: STATE_NAME[c.state], m: c.mode, link: c.link?.i, s: +c.s.toFixed(1), len: c.lane ? +c.lane.len.toFixed(1) : 0, v: +c.v.toFixed(2), a: +c.acc.toFixed(2), x: +c.x.toFixed(1), z: +c.z.toFixed(1), lk: c.lane?.k, off: c.lane ? +c.lane.off.toFixed(2) : 0, nk: c.nextLaneK, nt: c.nextTurn, next: c.nextLink?.i ?? null, r: c.reason, ex: +c.exitD.toFixed(1) })); },
    signal(id) { const s = net.signals.find((q) => q.id === id); return s ? sigState(s, sigT) : null; },
    clear() { for (const c of cars) if (c.state !== S_OFF) freeCar(c); started = false; },
    dispose() {
      for (const c of cars) if (c.state !== S_OFF) freeCar(c);
      for (let q = recArr.length - 1; q >= 0; q--) dropRec(recArr[q]);
      for (const v of voices) if (v.h) v.h.stop(0.1);
      fleet.dispose();
    },
  };
}
