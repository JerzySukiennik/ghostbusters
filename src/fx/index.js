// FX entry, 1984 film look only: proton streams, five ghost types, trap FX, impacts, slime, flung books, film grade.
import * as THREE from 'three';
import { Rng, QUALITY, clamp } from './util.js';
import { createTextures } from './textures.js';
import { LightPool } from './lights.js';
import { createPools } from './particles.js';
import { DecalPool } from './decals.js';
import { FlarePool, BoltPool } from './sprites.js';
import { Stream } from './stream.js';
import { TrapFX } from './trap.js';
import { PostFX } from './post.js';
import { loadGhostMesh, meshToGeometry } from './ghostkit.js';
import { GHOST_TYPES, GHOST_TYPE_LIST } from './ghosts/index.js';

const PREBUILT_STREAMS = 4;
const TRANSIENTS = 8;
const IMPACT_KINDS = ['spark', 'scorch', 'slime', 'ghostHit', 'slam', 'debris'];
const POOL = { onionhead: 2, library: 2, taxi: 2, terror_dog: 2, swarm: 6 };
const ALIAS = { library: 'library', librarian: 'library', taxi: 'taxi', cabbie: 'taxi', terror_dog: 'terror_dog', terrordog: 'terror_dog', dog: 'terror_dog', swarm: 'swarm', onionhead: 'onionhead', slimer: 'onionhead' };

export class FX {
  constructor({ renderer, scene, camera, quality = 'medium', ghostTypes } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = QUALITY[quality] || QUALITY.medium;
    this.style = 'film';
    this.root = new THREE.Group();
    this.root.name = 'FX';
    scene.add(this.root);
    this.time = 0;
    this.rng = new Rng(1984);
    this.groundY = 0;
    this._size = new THREE.Vector2(1, 1);
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.tex = createTextures();
    this.U = {
      uTime: { value: 0 }, uTimeQ: { value: 0 }, uPx: { value: 0.001 },
      uVortex: { value: new THREE.Vector3(0, -100, 0) }, uVortexK: { value: 1 },
      uSmokeLight: { value: new THREE.Color(0.3, 0.25, 0.2) }, uAmb: { value: new THREE.Color(0.035, 0.04, 0.055) },
      uKeyDir: { value: new THREE.Vector3(0.35, 0.85, 0.4).normalize() }, uKeyCol: { value: new THREE.Color(0.16, 0.18, 0.24) },
      uLPos: { value: new Float32Array(12) }, uLCol: { value: new Float32Array(12) },
    };
    this.lightPool = new LightPool(this.root, 4);
    this.pools = createPools(this, this.quality);
    this._poolList = Object.values(this.pools);
    this.decals = new DecalPool(this, this.quality.decals);
    this.flares = new FlarePool(this, 96);
    this.bolts = new BoltPool(this, 48);
    this.trSlot = this.flares.alloc(TRANSIENTS);
    this.tr = new Float32Array(TRANSIENTS * 12);
    this.trHead = 0;
    this._trLight = new Float32Array(TRANSIENTS * 3);
    this._lastImpact = new Float32Array(IMPACT_KINDS.length * 4).fill(-1e4);
    this._impactAcc = new Float32Array(IMPACT_KINDS.length);
    this.stats = { ghostLoadMs: 0, ghosts: {} };
    this._streams = [];
    for (let i = 0; i < PREBUILT_STREAMS; i++) this._streams.push(new Stream(this, i));
    this._streamsUsed = 0;
    this.ghostTypes = (ghostTypes || GHOST_TYPE_LIST).filter((t) => GHOST_TYPES[t]);
    if (!this.ghostTypes.includes('onionhead')) this.ghostTypes.unshift('onionhead');
    this.ghostGeo = {};
    this._free = {};
    this._ghosts = [];
    this.shared = {};
    for (const type of this.ghostTypes) {
      const T = GHOST_TYPES[type];
      this.ghostGeo[type] = new THREE.BufferGeometry();
      if (T.shared) this.shared[type] = new T.shared(this, this.ghostGeo[type]);
      this._free[type] = [];
      for (let i = 0; i < (POOL[type] || 1); i++) {
        const g = new T.Class(this, this.ghostGeo[type]);
        g.object3D.visible = false;
        this.root.add(g.object3D);
        this._free[type].push(g);
      }
      this._free[type].reverse();
    }
    this._traps = [new TrapFX(this)];
    this._trapsUsed = 0;
    this.post = new PostFX(this);
    this.ready = this._compile();
  }

  async _compile() {
    const r = this.renderer;
    const tg0 = performance.now();
    const res = this.quality.ghostRes;
    const meshes = await Promise.all(this.ghostTypes.map((type) => {
      const S = GHOST_TYPES[type].spec;
      return loadGhostMesh(type, res, S.build, S.LAYOUT);
    }));
    this.ghostTypes.forEach((type, i) => {
      const m = meshes[i], geo = this.ghostGeo[type], src = meshToGeometry(m, GHOST_TYPES[type].spec.bound);
      for (const k of Object.keys(src.attributes)) geo.setAttribute(k, src.attributes[k]);
      geo.setIndex(src.index);
      for (const gr of src.groups) geo.addGroup(gr.start, gr.count, gr.materialIndex);
      geo.boundingSphere = src.boundingSphere;
      this.stats.ghosts[type] = { tris: m.index.length / 3, verts: m.nv };
    });
    this.stats.ghostLoadMs = Math.round(performance.now() - tg0);
    const prev = r.getRenderTarget();
    const rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType });
    const a = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType });
    const b = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType });
    try {
      r.setRenderTarget(rt);
      const parent = this.root.parent;
      if (parent) parent.remove(this.root);
      const p = r.compileAsync(this.root, this.camera, this.scene);
      if (parent) parent.add(this.root);
      r.setRenderTarget(prev);
      await p;
      this._pin(this.root);
      for (const t of Object.values(this.tex)) r.initTexture(t);
      for (const { pass } of this.post.list) pass.render(r, a, b, 0, false);
      for (const { pass } of this.post.list) if (pass.uniforms && pass.uniforms.tDiffuse) pass.uniforms.tDiffuse.value = null;
    } finally {
      r.setRenderTarget(prev);
      rt.dispose(); a.dispose(); b.dispose();
    }
    this.isReady = true;
    return this;
  }

  _pin(obj) {
    const P = this.renderer.properties;
    if (!P) return;
    obj.traverse((o) => {
      const M = o.material;
      if (!M) return;
      for (const m of Array.isArray(M) ? M : [M]) { const mp = P.get(m); if (mp.currentProgram && mp.__version === undefined) mp.__version = m.version; }
    });
  }

  _prepare(obj) {
    const r = this.renderer, prev = r.getRenderTarget();
    const rt = this._prepRT || (this._prepRT = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType }));
    const parent = obj.parent;
    if (parent) parent.remove(obj);
    r.setRenderTarget(rt);
    r.compile(obj, this.camera, this.scene);
    r.setRenderTarget(prev);
    if (parent) parent.add(obj);
    this._pin(obj);
  }

  setStyle() { this.style = 'film'; }

  setLighting({ keyDir, keyColor, ambient } = {}) {
    if (keyDir) this.U.uKeyDir.value.copy(keyDir).normalize();
    if (keyColor) this.U.uKeyCol.value.copy(keyColor);
    if (ambient) this.U.uAmb.value.copy(ambient);
  }

  createStream() {
    if (this._streamsUsed < this._streams.length) return this._streams[this._streamsUsed++];
    const s = new Stream(this, this._streams.length);
    this._streams.push(s);
    if (this.isReady) this._prepare(this.root);
    this._streamsUsed++;
    return s;
  }

  createGhost(type = 'onionhead') {
    const key = ALIAS[type] || type;
    const T = GHOST_TYPES[key] && this.ghostGeo[key] ? key : 'onionhead';
    const free = this._free[T];
    let g = free.pop();
    if (!g) { g = new GHOST_TYPES[T].Class(this, this.ghostGeo[T]); if (this.isReady) this._prepare(g.object3D); }
    g.object3D.visible = true;
    this.scene.add(g.object3D);
    this._ghosts.push(g);
    return g;
  }

  releaseGhost(g) {
    const i = this._ghosts.indexOf(g);
    if (i < 0) return;
    this._ghosts.splice(i, 1);
    g.object3D.visible = false;
    if (g.release) g.release();
    this.root.add(g.object3D);
    const key = Object.keys(GHOST_TYPES).find((k) => g instanceof GHOST_TYPES[k].Class);
    if (key) this._free[key].push(g);
  }

  ghostNear(p) {
    let best = null, bd = Infinity;
    const G = this._ghosts;
    for (let i = 0; i < G.length; i++) {
      const g = G[i];
      if (!g.object3D.visible) continue;
      const d = g.object3D.position.distanceToSquared(p);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  createTrapFX(trapObject3D) {
    let t;
    if (this._trapsUsed < this._traps.length) t = this._traps[this._trapsUsed];
    else { t = new TrapFX(this); this._traps.push(t); if (this.isReady) this._prepare(this.root); }
    this._trapsUsed++;
    if (trapObject3D) t.attach(trapObject3D);
    return t;
  }

  postPasses() { return this.post.list; }

  slimeScreen(amount = 1) { this.post.splat(clamp(+amount || 0, 0, 1.25)); }

  transient(p, size, r, g, b, intensity, type, life, light, lr, lg, lb) {
    const o = this.trHead * 12, T = this.tr;
    T[o] = p.x; T[o + 1] = p.y; T[o + 2] = p.z; T[o + 3] = size;
    T[o + 4] = r; T[o + 5] = g; T[o + 6] = b; T[o + 7] = intensity;
    T[o + 8] = type; T[o + 9] = this.time; T[o + 10] = life; T[o + 11] = light;
    const i = this.trHead;
    this._trLight[i * 3] = lr; this._trLight[i * 3 + 1] = lg; this._trLight[i * 3 + 2] = lb;
    this.trHead = (this.trHead + 1) % TRANSIENTS;
  }

  _throttle(kind, p, minGap, radius) {
    const k = IMPACT_KINDS.indexOf(kind);
    if (k < 0) return 1;
    const L = this._lastImpact, o = k * 4;
    const dt = this.time - L[o + 3];
    const dx = p.x - L[o], dy = p.y - L[o + 1], dz = p.z - L[o + 2];
    const near = dx * dx + dy * dy + dz * dz < radius * radius;
    if (near && dt >= 0 && dt < minGap) { this._impactAcc[k] += dt / minGap; L[o + 3] = this.time; if (this._impactAcc[k] < 1) return 0; this._impactAcc[k] -= 1; return 0.35; }
    L[o] = p.x; L[o + 1] = p.y; L[o + 2] = p.z; L[o + 3] = this.time;
    this._impactAcc[k] = 0;
    return near && dt >= 0 && dt < minGap * 3 ? 0.5 : 1;
  }

  impact(position, normal, kind = 'spark') {
    if (!position) return;
    const r = this.rng, P = this.pools, n = this._v[0];
    if (normal) n.copy(normal).normalize(); else n.set(0, 1, 0);
    const amt = this._throttle(kind, position, kind === 'slam' ? 0.25 : 0.3, kind === 'slam' ? 0.5 : 0.8);
    if (amt <= 0) return;
    const x = position.x, y = position.y, z = position.z, gy = this.groundY;
    switch (kind) {
      case 'spark':
        this._spray(position, n, Math.round(46 * amt), 2, 10, 0.3, 1.0, 0.3);
        if (amt > 0.9) this.transient(position, 0.8, 1.0, 0.75, 0.45, 2.2, 3, 0.18, 30, 1.0, 0.6, 0.3);
        break;
      case 'scorch':
        this.decals.add(position, n, r.range(0.35, 0.55), 0, 50, r.next());
        this._spray(position, n, Math.round(14 * amt), 1.5, 6, 0.2, 0.7, 0.5);
        for (let i = 0; i < (amt > 0.9 ? 3 : 1); i++) P.smoke.emit(x + n.x * 0.1, y + n.y * 0.1, z + n.z * 0.1, n.x * 0.4 + r.signed() * 0.1, 0.5, n.z * 0.4 + r.signed() * 0.1, r.range(2, 3.5), r.range(0.15, 0.25), r.next(), 1, -0.1, -1e3, 2, 0, r.signed() * 0.5);
        break;
      case 'slime':
        this.decals.add(position, n, r.range(0.45, 0.85), 1, 40, r.next());
        for (let i = 0; i < 26; i++) {
          const sp = r.range(1, 4.5);
          P.slime.emit(x + n.x * 0.03, y + n.y * 0.03, z + n.z * 0.03, (n.x + r.signed() * 0.8) * sp, (n.y + r.signed() * 0.8 + 0.4) * sp, (n.z + r.signed() * 0.8) * sp, r.range(0.5, 1.2), r.range(0.015, 0.035), r.next(), 0.5, 1, gy, 0, 0, 0);
        }
        this.transient(position, 0.5, 0.55, 1.0, 0.4, 0.8, 6, 0.2, 6, 0.4, 1.0, 0.3);
        break;
      case 'ghostHit':
        for (let i = 0; i < Math.round(22 * amt); i++) {
          const sp = r.range(1.5, 5);
          P.slime.emit(x, y, z, (n.x + r.signed() * 0.8) * sp, (n.y + r.signed() * 0.8 + 0.3) * sp, (n.z + r.signed() * 0.8) * sp, r.range(0.4, 1.0), r.range(0.012, 0.03), r.next(), 0.6, 1, gy, 0, 0, 0);
        }
        this._spray(position, n, Math.round(30 * amt), 2, 8, 0.2, 0.6, 2);
        if (amt > 0.9) this.transient(position, 0.42, 0.6, 1.0, 0.45, 0.9, 6, 0.2, 8, 0.5, 1.0, 0.4);
        break;
      case 'slam': {
        this.decals.add(position, n, r.range(1.1, 1.5), 2, 60, r.next());
        this.decals.add(position, n, r.range(0.9, 1.3), 1, 45, r.next());
        this._spray(position, n, 70, 3, 12, 0.3, 1.1, 2, 0.6);
        for (let i = 0; i < 34; i++) {
          const a = r.next() * 6.283, sp = r.range(1.5, 4.5);
          P.smoke.emit(x + Math.cos(a) * 0.3, y + 0.1, z + Math.sin(a) * 0.3, Math.cos(a) * sp, r.range(0.2, 0.9), Math.sin(a) * sp, r.range(1.5, 3.2), r.range(0.22, 0.4), r.next(), 1.8, -0.02, -1e3, 0, 2, r.signed());
        }
        for (let i = 0; i < 40; i++) {
          const sp = r.range(2, 7);
          P.chips.emit(x, y + 0.05, z, (n.x + r.signed()) * sp, (n.y * 0.8 + r.next() * 0.9 + 0.3) * sp, (n.z + r.signed()) * sp, r.range(0.8, 1.8), r.range(0.015, 0.04), r.next(), 0.3, 1, gy, 0, 0, r.signed() * 12);
        }
        for (let i = 0; i < 30; i++) {
          const sp = r.range(2, 6);
          P.slime.emit(x, y + 0.1, z, r.signed() * sp, r.range(0.6, 1.2) * sp, r.signed() * sp, r.range(0.6, 1.3), r.range(0.02, 0.045), r.next(), 0.4, 1, gy, 0, 0, 0);
        }
        this.decals.add(position, n, 2.6, 3, 0.7, r.next());
        this.transient(position, 0.9, 0.85, 1.0, 0.7, 1.3, 0, 0.16, 38, 0.6, 1.0, 0.5);
        break;
      }
      case 'debris':
        for (let i = 0; i < 26; i++) {
          const sp = r.range(1.5, 6);
          P.chips.emit(x, y, z, (n.x + r.signed() * 0.8) * sp, (n.y + r.next() * 0.8 + 0.2) * sp, (n.z + r.signed() * 0.8) * sp, r.range(0.8, 1.6), r.range(0.01, 0.035), r.next(), 0.3, 1, gy, 0, 0, r.signed() * 14);
        }
        for (let i = 0; i < 6; i++) P.smoke.emit(x, y, z, (n.x + r.signed() * 0.5) * 0.8, 0.3 + r.next() * 0.4, (n.z + r.signed() * 0.5) * 0.8, r.range(1.2, 2.4), r.range(0.15, 0.3), r.next(), 1.6, -0.03, -1e3, 0, 2, r.signed());
        this._spray(position, n, 10, 1.5, 5, 0.2, 0.5, 0.5);
        break;
      default:
        this._spray(position, n, 20, 2, 8, 0.2, 0.7, 0.5);
    }
  }

  _spray(p, n, count, sp0, sp1, life0, life1, col, up = 0.3) {
    const r = this.rng, x = p.x, y = p.y, z = p.z;
    for (let i = 0; i < count; i++) {
      const sp = r.range(sp0, sp1);
      const vx = n.x + r.signed() * 0.9, vy = n.y + r.signed() * 0.9 + up, vz = n.z + r.signed() * 0.9;
      const l = Math.hypot(vx, vy, vz) || 1;
      this.pools.sparks.emit(x + n.x * 0.02, y + n.y * 0.02, z + n.z * 0.02, vx / l * sp, vy / l * sp, vz / l * sp, r.range(life0, life1), r.range(0.004, 0.011), r.next(), r.range(0.5, 1.5), 1, this.groundY, 0, col, 0);
    }
  }

  reset(seed = 1984) {
    this.rng.seed(seed);
    for (const p of this._poolList) p.clear();
    this.decals.clear();
    this.flares.clear();
    this.bolts.clear();
    this.tr.fill(0);
    this.post.slimeAmt = 0;
    for (const s of this._streams) s.reset();
    for (const k in this.shared) if (this.shared[k].clear) this.shared[k].clear();
  }

  update(dt, time) {
    dt = Math.min(Math.max(+dt || 0, 0), 0.1);
    this.time = time !== undefined && time !== null ? time : this.time + dt;
    const U = this.U;
    U.uTime.value = this.time;
    U.uTimeQ.value = Math.floor(this.time * 12) / 12;
    const cam = this.camera;
    this.renderer.getDrawingBufferSize(this._size);
    const fov = cam && cam.isPerspectiveCamera ? cam.fov : 55;
    U.uPx.value = 2 * Math.tan(THREE.MathUtils.degToRad(fov) * 0.5) / Math.max(1, this._size.y) / (cam && cam.zoom ? cam.zoom : 1);

    for (let i = 0; i < this._streams.length; i++) {
      const s = this._streams[i];
      if (s.target && s.kind === 2 && s.capture < 0.5 && s.head >= 1 && s.lit > 0.5) s.target.hitWorld(s.end, dt * 4);
    }

    const T = this.tr, F = this.flares;
    for (let i = 0; i < TRANSIENTS; i++) {
      const o = i * 12;
      const life = T[o + 10];
      if (life <= 0) { F.off(this.trSlot + i); continue; }
      const age = this.time - T[o + 9];
      if (age < 0 || age > life) { F.off(this.trSlot + i); T[o + 10] = 0; continue; }
      const k = 1 - age / life;
      const grow = T[o + 8] === 4 ? 0.35 + 0.65 * Math.sqrt(age / life) : 1 + 0.3 * (1 - k);
      F.set(this.trSlot + i, T[o], T[o + 1], T[o + 2], T[o + 3] * grow, T[o + 4], T[o + 5], T[o + 6], T[o + 7] * k * k, T[o + 8], i * 1.7, i * 0.37 + T[o + 9] % 1, 0.9, 1);
      if (T[o + 11] > 0) {
        const L = this._trLight;
        this._v[2].set(T[o], T[o + 1] + 0.3, T[o + 2]);
        this.lightPool.request(this._v[2], L[i * 3], L[i * 3 + 1], L[i * 3 + 2], T[o + 11] * k * k, 6, 16);
      }
    }

    this.lightPool.flush();
    const Ls = this.lightPool.lights, LP = U.uLPos.value, LC = U.uLCol.value;
    const sl = U.uSmokeLight.value;
    sl.setRGB(0.05, 0.05, 0.06);
    for (let i = 0; i < 4; i++) {
      const l = Ls[i];
      LP[i * 3] = l.position.x; LP[i * 3 + 1] = l.position.y; LP[i * 3 + 2] = l.position.z;
      LC[i * 3] = l.color.r * l.intensity; LC[i * 3 + 1] = l.color.g * l.intensity; LC[i * 3 + 2] = l.color.b * l.intensity;
      if (l.intensity > 0) { const w = Math.min(1, l.intensity / 40) * 0.6; sl.r += l.color.r * w; sl.g += l.color.g * w; sl.b += l.color.b * w; }
    }
    this.post.update(dt);
    for (const k in this.shared) this.shared[k].flush(dt);
    for (let i = 0; i < this._poolList.length; i++) this._poolList[i].flush();
    this.decals.flush();
    this.flares.flush();
    this.bolts.flush();
  }
}

export default FX;
