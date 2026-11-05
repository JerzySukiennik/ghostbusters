// Proton pack + neutrona wand: tray copies, worn pack, docked or held wand, live hose, cyclotron / power cell / bargraph lights, heat, venting steam.
import * as THREE from 'three';
import { findNode } from '../engine/assets.js';
import { segmentize } from '../engine/segments.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _c = V(), _d = V(), _t = V(), _n = V(), _q = new THREE.Quaternion(), _s = V();

function segOf(root, name) {
  const o = findNode(root, name);
  if (!o) return null;
  let m = o.isMesh ? o : null;
  if (!m) o.traverse((x) => { if (!m && x.isMesh) m = x; });
  return m ? segmentize(m, o.userData.segments || m.userData.segments || 16, 6) : null;
}

function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}

class Steam {
  constructor(scene, n = 28) {
    this.items = [];
    const tex = puffTexture();
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xdfe6ea, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false; scene.add(s);
      this.items.push({ s, v: V(), life: 0, max: 1 });
    }
    this.i = 0;
  }
  emit(p, dir, n = 1, speed = 2.2) {
    for (let k = 0; k < n; k++) {
      const it = this.items[this.i = (this.i + 1) % this.items.length];
      it.s.position.copy(p); it.s.visible = true; it.life = it.max = 0.9 + Math.random() * 0.8;
      it.v.copy(dir).multiplyScalar(speed * (0.7 + Math.random() * 0.6)).add(_t.set((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6));
      it.s.scale.setScalar(0.12);
    }
  }
  update(dt) {
    for (const it of this.items) {
      if (it.life <= 0) { it.s.visible = false; continue; }
      it.life -= dt;
      const k = 1 - it.life / it.max;
      it.v.multiplyScalar(Math.exp(-dt * 2.2)); it.v.y += dt * 0.8;
      it.s.position.addScaledVector(it.v, dt);
      it.s.scale.setScalar(0.12 + k * 1.1);
      it.s.material.opacity = Math.sin(Math.min(1, k * 1.2) * Math.PI) * 0.45;
    }
  }
}

export class Gear {
  constructor({ packGltf, wandGltf, scene, audio }) {
    this.scene = scene; this.audio = audio;
    this.packJson = packGltf.json || {};
    this.pack = packGltf.scene.getObjectByName('ProtonPack') || packGltf.scene;
    this.wand = wandGltf.scene.getObjectByName('Wand') || wandGltf.scene;
    for (const r of [this.pack, this.wand]) r.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.spares = [];
    this.n = {
      mount: findNode(this.pack, 'GunMount'), hoseP: findNode(this.pack, 'HoseAnchor'), vent: findNode(this.pack, 'Vent'),
      front: findNode(this.wand, 'GripFront'), tip: findNode(this.wand, 'Tip'), hoseW: findNode(this.wand, 'HoseAnchor'),
    };
    const hs = findNode(this.pack, 'HoseSample');
    if (hs) hs.visible = false;
    let hoseMat = null; if (hs) hs.traverse((o) => { if (!hoseMat && o.isMesh) hoseMat = o.material; });
    this.hoseR = this.packJson.protonpack?.hose?.outer_radius_ribs || this.packJson.protonpack?.hose?.radius || this.packJson.hose_radius || this.packJson.hose?.radius || 0.019;
    this.worn = this.packJson.texture_sets?.worn || null;
    this.trapRoot = null;
    this.makeHose(hoseMat || new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.65 }));
    this.cyc = segOf(this.pack, 'CyclotronEmit');
    this.cell = segOf(this.pack, 'PowerCellEmit');
    this.misc = segOf(this.pack, 'PackLightsEmit');
    this.bar = segOf(this.wand, 'BargraphEmit');
    this.wl = segOf(this.wand, 'WandLightsEmit');
    this.tipEmit = []; const te = findNode(this.wand, 'TipEmit'); if (te) te.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); this.tipEmit.push(o); } });
    this.steam = new Steam(scene);
    this.state = 'stowed'; this.powered = 0; this.power = false;
    this.heat = 0; this.over = 0; this.vent = 0; this.coolDelay = 0; this.t = 0; this.cycPh = 0; this.cellPh = 0;
    this.firing = false; this.mode = 'blast'; this.style = 'modern';
    this.snd = {};
  }

  async setStyle(style) {
    if (!this.worn) return;
    if (!this.mats) {
      const find = (root, name) => { let m = null; root?.traverse((o) => { if (!m && o.isMesh) for (const x of [].concat(o.material)) if (x && x.name === name) m = x; }); return m; };
      const W = this.worn.material || {};
      this.mats = [['protonpack', find(this.pack, W.protonpack || 'ProtonPackMat')], ['wand', find(this.wand, W.wand || 'WandMat')], ['trap', find(this.trapRoot, W.trap || 'TrapMat')]]
        .filter(([, m]) => m).map(([k, m]) => ({ k, m, film: { map: m.map, rough: m.roughnessMap, metal: m.metalnessMap, ao: m.aoMap }, worn: null }));
    }
    const loader = new THREE.TextureLoader();
    const load = (f, srgb) => loader.loadAsync('assets/pack/' + f).then((t) => { t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; }).catch(() => null);
    for (const e of this.mats) {
      if (style === 'modern' && !e.worn && this.worn[e.k]) {
        const [bc, orm] = this.worn[e.k];
        const [a, b] = await Promise.all([load(bc, true), load(orm, false)]);
        e.worn = a && b ? { map: a, rough: b, metal: b, ao: b } : false;
      }
      const s = style === 'modern' && e.worn ? e.worn : e.film;
      e.m.map = s.map; e.m.roughnessMap = s.rough; e.m.metalnessMap = s.metal; e.m.aoMap = s.ao;
      e.m.needsUpdate = true;
    }
  }

  spawnSpares(ecto, count, mine = 0) {
    this.spareBySlot = [];
    for (let i = 0; i < count; i++) {
      const slot = ecto.slots[i]; if (!slot) continue;
      const p = this.pack.clone(true), w = this.wand.clone(true);
      p.traverse((o) => { if (/HoseSample/.test(o.name)) o.visible = false; });
      slot.add(p); p.position.set(0, 0, 0); p.quaternion.identity();
      const m = findNode(p, 'GunMount'); if (m) { m.add(w); w.position.set(0, 0, 0); w.quaternion.identity(); }
      p.visible = i !== mine;
      this.spares.push(p); this.spareBySlot[i] = p;
    }
  }

  assignSlot(ecto, idx) {
    if (!this.spareBySlot) return;
    const old = this.slot ?? 0;
    this.slot = idx;
    this.spareBySlot.forEach((p, i) => { if (p) p.visible = i !== idx && !this.takenSlots?.has(i); });
    if (this.state === 'stowed' && ecto.slots[idx]) { ecto.slots[idx].add(this.pack); this.pack.position.set(0, 0, 0); this.pack.quaternion.identity(); }
    return old;
  }

  markTaken(i, taken) {
    (this.takenSlots ||= new Set())[taken ? 'add' : 'delete'](i);
    const p = this.spareBySlot?.[i];
    if (p && i !== this.slot) p.visible = !taken;
  }

  makeHose(mat) {
    const N = 22, S = 8;
    this.hoseN = N; this.hoseS = S;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * S * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N * S * 3), 3));
    const uv = new Float32Array(N * S * 2), idx = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < S; j++) { uv[(i * S + j) * 2] = j / (S - 1); uv[(i * S + j) * 2 + 1] = i / (N - 1) * 6; }
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < S; j++) { const a = i * S + j, b = i * S + (j + 1) % S, c = a + S, d = b + S; idx.push(a, c, b, b, c, d); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    this.hose = new THREE.Mesh(g, mat); this.hose.frustumCulled = false; this.hose.castShadow = true; this.hose.visible = false;
    this.scene.add(this.hose);
  }

  updateHose() {
    const { hoseP, hoseW } = this.n;
    if (!hoseP || !hoseW) { this.hose.visible = false; return; }
    this.hose.visible = true;
    hoseP.getWorldPosition(_a); hoseW.getWorldPosition(_d);
    hoseP.getWorldQuaternion(_q); _b.set(0, 0, 1).applyQuaternion(_q);
    hoseW.getWorldQuaternion(_q); _c.set(0, -0.6, -0.8).applyQuaternion(_q);
    const L = Math.max(0.3, _a.distanceTo(_d));
    const P0 = _a, P1 = _b.multiplyScalar(L * 0.35).add(_a).setY(_a.y - 0.12), P2 = _c.multiplyScalar(L * 0.35).add(_d).setY(Math.min(_d.y, _a.y) - 0.18), P3 = _d;
    const pos = this.hose.geometry.attributes.position.array, nor = this.hose.geometry.attributes.normal.array;
    const N = this.hoseN, S = this.hoseS, r = this.hoseR;
    let prevN = _n.set(0, 1, 0);
    const T = V(), B = V(), Nn = V(), P = V();
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), iu = 1 - u;
      P.set(0, 0, 0).addScaledVector(P0, iu * iu * iu).addScaledVector(P1, 3 * iu * iu * u).addScaledVector(P2, 3 * iu * u * u).addScaledVector(P3, u * u * u);
      T.set(0, 0, 0).addScaledVector(P1.clone().sub(P0), 3 * iu * iu).addScaledVector(P2.clone().sub(P1), 6 * iu * u).addScaledVector(P3.clone().sub(P2), 3 * u * u).normalize();
      B.crossVectors(T, prevN).normalize(); if (B.lengthSq() < 1e-6) B.set(1, 0, 0);
      Nn.crossVectors(B, T).normalize(); prevN.copy(Nn);
      for (let j = 0; j < S; j++) {
        const a = j / S * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
        _s.set(0, 0, 0).addScaledVector(Nn, cs).addScaledVector(B, sn);
        const k = (i * S + j) * 3;
        pos[k] = P.x + _s.x * r; pos[k + 1] = P.y + _s.y * r; pos[k + 2] = P.z + _s.z * r;
        nor[k] = _s.x; nor[k + 1] = _s.y; nor[k + 2] = _s.z;
      }
    }
    this.hose.geometry.attributes.position.needsUpdate = true; this.hose.geometry.attributes.normal.needsUpdate = true;
  }

  dock() {
    if (!this.n.mount) return;
    this.n.mount.add(this.wand); this.wand.position.set(0, 0, 0); this.wand.quaternion.identity();
  }

  holdWand() { this.scene.add(this.wand); }

  powerUp() {
    if (this.power) return;
    this.power = true;
    this.audio?.play('pack_powerup', { obj: this.pack });
    this.snd.hum = this.audio?.loop('pack_hum', { obj: this.pack, gain: 0.7, delay: 1.6, fadeIn: 0.6 });
  }

  powerDown() {
    if (!this.power) return;
    this.power = false;
    this.audio?.play('pack_powerdown', { obj: this.pack });
    this.snd.hum?.stop(0.4); this.snd.hum = null;
  }

  canFire() { return this.power && this.powered > 0.9 && this.over <= 0; }

  addHeat(h) {
    this.heat = Math.min(1, this.heat + h);
    this.coolDelay = 0.7;
    if (this.heat >= 1 && this.over <= 0) this.overheat();
  }

  overheat() {
    this.over = 2.6; this.vent = 2.6;
    this.audio?.play('pack_vent', { obj: this.pack, gain: 1.1 });
    this.snd.alarm?.stop(0.1); this.snd.alarm = null;
  }

  manualVent() {
    if (this.vent > 0 || this.heat < 0.12 || !this.power) return false;
    this.vent = 0.9; this.over = Math.max(this.over, 0.9);
    this.audio?.play('pack_vent', { obj: this.pack, gain: 0.8, rate: 1.15 });
    return true;
  }

  update(dt, { firing, mode, style }) {
    this.t += dt; this.firing = firing; this.mode = mode; this.style = style;
    this.powered = this.power ? Math.min(1, this.powered + dt / 1.9) : Math.max(0, this.powered - dt / 1.2);
    this.over = Math.max(0, this.over - dt);
    this.coolDelay = Math.max(0, this.coolDelay - dt);
    if (this.vent > 0) {
      this.vent -= dt; this.heat = Math.max(0, this.heat - dt * 0.75);
      if (this.n.vent) { this.n.vent.getWorldPosition(_a); this.n.vent.getWorldQuaternion(_q); this.steam.emit(_a, _b.set(0, 1, 0).applyQuaternion(_q), 2, 2.4); }
    } else if (!firing && this.coolDelay <= 0) this.heat = Math.max(0, this.heat - dt * 0.17);
    if (this.heat > 0.82 && this.power && this.over <= 0) { if (!this.snd.alarm) this.snd.alarm = this.audio?.loop('pack_overheat', { obj: this.pack, gain: 0.6 }); }
    else if (this.snd.alarm) { this.snd.alarm.stop(0.1); this.snd.alarm = null; }
    this.steam.update(dt);
    const P = this.powered, film = style === 'film';
    const cycRate = (firing ? (mode === 'capture' ? 7 : 5.2) : 1.3) * (0.4 + 0.6 * P);
    this.cycPh = (this.cycPh + dt * cycRate) % 4;
    if (this.cyc) {
      const lv = this.cyc.levels;
      for (let i = 0; i < this.cyc.count; i++) {
        const d = ((this.cycPh - i) % 4 + 4) % 4;
        const v = film ? (d < 1 ? 1 : 0.03) : Math.max(0.04, Math.exp(-d * 2.2));
        lv[i] = v * P * (this.over > 0 ? 0.3 + 0.7 * (Math.sin(this.t * 30) > 0 ? 1 : 0) : 1) * 1.8;
      }
    }
    this.cellPh = (this.cellPh + dt * (firing ? 30 : 12) * (0.3 + 0.7 * P)) % ((this.cell?.count || 15) + 4);
    if (this.cell) {
      const lv = this.cell.levels, n = this.cell.count;
      for (let i = 0; i < n; i++) lv[i] = P > 0.02 ? (i <= this.cellPh ? 1.2 : 0.03) * Math.min(1, P * 1.5) : 0.02;
    }
    if (this.misc) for (let i = 0; i < this.misc.count; i++) this.misc.levels[i] = P * (Math.sin(this.t * (2 + i) + i) > 0 ? 1 : 0.3);
    if (this.bar) {
      const lv = this.bar.levels, n = this.bar.count, h = this.heat * n;
      const blink = this.heat > 0.82 ? (Math.sin(this.t * 22) > 0 ? 1 : 0.15) : 1;
      for (let i = 0; i < n; i++) lv[i] = P > 0.1 ? (i < h ? 1.5 * blink : (firing ? 0.06 + 0.3 * (Math.random() < 0.08 ? 1 : 0) : 0.05)) : 0.02;
    }
    if (this.wl) {
      const lv = this.wl.levels;
      lv[0] = P * 1.4;
      lv[1] = firing ? (Math.sin(this.t * 40) > 0 ? 1.8 : 0.1) : P * 0.6;
      lv[2] = this.vent > 0 ? 1.6 : 0.05;
      lv[3] = P * (0.5 + 0.5 * Math.sin(this.t * 3));
    }
    for (const m of this.tipEmit) m.material.emissiveIntensity = firing ? (Math.random() < 0.5 ? 14 : 3) : 0.05;
    if (this.state !== 'stowed') this.updateHose(); else this.hose.visible = false;
  }
}
