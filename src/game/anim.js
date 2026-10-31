// Retargets the Quaternius Universal Animation Library (CC0) onto the avatar, layers lower/upper body, blends locomotion and plays the avatar's own glTF clips.
import * as THREE from 'three';

const BASE = 'assets/anims/';
const LOWER = /^(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase))$/;
const LIMB = /(Shoulder|Arm|Hand|UpLeg|Leg|Foot|ToeBase)/;
const LOCO = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop'];
let dataP = null;
const cache = new WeakMap();

function loadData() {
  if (!dataP) dataP = Promise.all([fetch(BASE + 'ual.json').then((r) => r.json()), fetch(BASE + 'ual.bin').then((r) => r.arrayBuffer())]);
  return dataP;
}

function build(meta, buf, d) {
  const nb = meta.bones.length, i16 = new Int16Array(buf), fps = meta.fps;
  const idx = new Map(meta.bones.map((n, i) => [n, i]));
  const bones = meta.bones.map((n) => d.bones.get(n));
  const anc = [], P = [];
  for (let i = 0; i < nb; i++) {
    let b = bones[i].parent; const chain = [];
    while (b && b.isBone && !idx.has(b.name)) { chain.push(b); b = b.parent; }
    if (b && b.isBone) {
      anc.push(idx.get(b.name));
      const q = new THREE.Quaternion(); for (let k = chain.length - 1; k >= 0; k--) q.multiply(d.rest.get(chain[k].name).q);
      P.push(q);
    } else { anc.push(-1); P.push(d.restWorldQ.get(bones[i].name).clone().multiply(d.rest.get(bones[i].name).q.clone().invert())); }
  }
  const A = new Array(nb);
  for (let i = 0; i < nb; i++) {
    const ds = meta.dir[i], c = meta.child[i], nm = meta.bones[i];
    if (LIMB.test(nm) && ds && c >= 0) {
      const dt = d.restWorldP.get(meta.bones[c]).clone().sub(d.restWorldP.get(nm)).normalize();
      A[i] = new THREE.Quaternion().setFromUnitVectors(dt, new THREE.Vector3(ds[0], ds[1], ds[2]));
    } else A[i] = LIMB.test(nm) && anc[i] >= 0 ? A[anc[i]].clone() : new THREE.Quaternion();
  }
  const ref = meta.bones.map((n, i) => A[i].clone().multiply(d.restWorldQ.get(n)));
  const hipsRest = d.rest.get('Hips').p, k = d.restWorldP.get('Hips').y / meta.pelvis[1];
  const clips = new Map();
  const W = Array.from({ length: nb }, () => new THREE.Quaternion()), D = new THREE.Quaternion(), L = new THREE.Quaternion(), pw = new THREE.Quaternion();
  for (const c of meta.clips) {
    const n = c.n, times = new Float32Array(n);
    for (let f = 0; f < n; f++) times[f] = Math.min(c.dur, f / fps);
    let o = c.off; const qo = [];
    for (let i = 0; i < nb; i++) { qo.push(o); o += (c.stat[i] === '1' ? 1 : n) * 4; }
    const vals = Array.from({ length: nb }, () => new Float32Array(n * 4)), pos = new Float32Array(n * 3);
    for (let f = 0; f < n; f++) {
      for (let i = 0; i < nb; i++) {
        const b = qo[i] + (c.stat[i] === '1' ? 0 : f * 4);
        D.set(i16[b] / 32767, i16[b + 1] / 32767, i16[b + 2] / 32767, i16[b + 3] / 32767).normalize();
        W[i].copy(D).multiply(ref[i]);
        if (anc[i] >= 0) pw.copy(W[anc[i]]).multiply(P[i]); else pw.copy(P[i]);
        L.copy(pw).invert().multiply(W[i]).normalize();
        const v = vals[i], j = (f - 1) * 4;
        if (f > 0 && v[j] * L.x + v[j + 1] * L.y + v[j + 2] * L.z + v[j + 3] * L.w < 0) L.set(-L.x, -L.y, -L.z, -L.w);
        v[f * 4] = L.x; v[f * 4 + 1] = L.y; v[f * 4 + 2] = L.z; v[f * 4 + 3] = L.w;
      }
      const b = o + f * 3;
      pos[f * 3] = hipsRest.x + i16[b] / 10000 * k; pos[f * 3 + 1] = hipsRest.y + i16[b + 1] / 10000 * k; pos[f * 3 + 2] = hipsRest.z + i16[b + 2] / 10000 * k;
    }
    const lo = [new THREE.VectorKeyframeTrack('Hips.position', times, pos)], up = [];
    meta.bones.forEach((nm, i) => (LOWER.test(nm) ? lo : up).push(new THREE.QuaternionKeyframeTrack(nm + '.quaternion', times, vals[i])));
    const air = c.air || [];
    const takeoff = Math.max(0, air.findIndex((a, f) => f > 2 && a > 0.06)) / fps, contact = Math.max(0, air.findIndex((a) => a < 0.02)) / fps;
    clips.set(c.name, { ...c, takeoff, contact, lo: new THREE.AnimationClip(c.name + '_lo', c.dur, lo), up: new THREE.AnimationClip(c.name + '_up', c.dur, up) });
  }
  return clips;
}

export class Animator {
  static async create(d, custom = []) {
    const [meta, buf] = await loadData();
    if (!cache.has(d)) cache.set(d, build(meta, buf, d));
    const a = new Animator(d, new Map(cache.get(d)));
    for (const c of custom) a.addClip(c);
    return a;
  }

  constructor(d, clips) {
    this.d = d; this.clips = clips; this.mixer = new THREE.AnimationMixer(d.root);
    this.acts = new Map(); this.w = new Map();
    this.phase = 0; this.mode = 'loco'; this.mt = 0; this.air = 0; this.lock = 0; this.oneshot = null; this.last = { g: true, vy: 0 };
    const C = (n) => clips.get(n);
    this.S = LOCO.slice(1).map((n) => ({ n, s: C(n).speed, f: 1 / C(n).dur, p0: C(n).phase0, dur: C(n).dur }));
    this.events = [];
  }

  addClip(clip, loop = /ready|aim|wrangle|_loop/i.test(clip.name)) {
    const lo = [], up = [];
    for (const t of clip.tracks) {
      const node = t.name.split('.')[0];
      if (/Carrier$/.test(node)) { lo.push(t.clone()); continue; }
      if (!this.d.bones.has(node)) continue;
      (LOWER.test(node) ? lo : up).push(t.clone());
    }
    this.clips.set(clip.name, { name: clip.name, dur: clip.duration, loop, custom: true, lo: new THREE.AnimationClip(clip.name + '_lo', clip.duration, lo), up: new THREE.AnimationClip(clip.name + '_up', clip.duration, up) });
  }

  has(name) { return this.clips.has(name); }
  dur(name) { const c = this.clips.get(name); return c ? c.dur : 0; }

  act(name, layer) {
    const key = name + ':' + layer;
    let a = this.acts.get(key);
    if (!a) {
      const c = this.clips.get(name);
      a = this.mixer.clipAction(layer === 'lo' ? c.lo : c.up);
      a.setLoop(c.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true;
      a.enabled = true; a.setEffectiveWeight(0); a.play();
      this.acts.set(key, a); this.w.set(key, 0);
    }
    return a;
  }

  start(name, at = 0, rate = 1) {
    for (const l of ['lo', 'up']) { const a = this.act(name, l); a.reset(); a.time = at; a.timeScale = rate; a.setEffectiveWeight(this.w.get(name + ':' + l)); }
  }

  time(name) { const a = this.acts.get(name + ':lo') || this.acts.get(name + ':up'); return a ? a.time : 0; }

  setMode(m) { this.mode = m; this.mt = 0; }

  play(name, opt = {}) {
    if (!this.clips.has(name)) return false;
    this.oneshot = { name, upper: !!opt.upper, lock: opt.lock !== undefined ? opt.lock : !opt.upper, loop: this.clips.get(name).loop, until: opt.until || 0, rate: opt.rate || 1 };
    this.start(name, opt.at || 0, opt.rate || 1);
    if (!opt.upper) this.setMode('action');
    if (opt.snap) this.snap = true;
    return true;
  }

  stopAction() { if (this.oneshot) { this.oneshot = null; if (this.mode === 'action') this.setMode('loco'); } }

  busy() { return this.mode === 'action' && !!this.oneshot; }

  loco(sp, T, k = 1) {
    const [W, J, R] = this.S;
    const wMax = W.s * 1.45;
    let f = 0;
    const put = (n, x) => { T[n] = (T[n] || 0) + x * k; };
    if (sp < 0.05) put('Idle_Loop', 1);
    else if (sp < 0.6) { const t = sp / 0.6; put('Idle_Loop', 1 - t); put(W.n, t); f = W.f * Math.max(0.65, sp / W.s); }
    else if (sp <= wMax) { put(W.n, 1); f = W.f * sp / W.s; }
    else if (sp <= J.s) { const t = (sp - wMax) / (J.s - wMax); put(W.n, 1 - t); put(J.n, t); f = sp / ((1 - t) * W.s / W.f + t * J.s / J.f); }
    else if (sp <= R.s) { const t = (sp - J.s) / (R.s - J.s); put(J.n, 1 - t); put(R.n, t); f = sp / ((1 - t) * J.s / J.f + t * R.s / R.f); }
    else { put(R.n, 1); f = R.f * sp / R.s; }
    return f;
  }

  update(w, dt, opt = {}) {
    const sp = w.speed, g = w.grounded, vy = w.vy || 0, C = this.clips;
    this.mt += dt; this.lock = Math.max(0, this.lock - dt);
    if (this.mode === 'action' && this.oneshot) {
      const o = this.oneshot, c = C.get(o.name);
      if ((!o.loop && this.time(o.name) >= c.dur - 0.04) || (o.until && this.mt > o.until)) { if (!o.hold) this.stopAction(); }
    } else if (this.mode === 'loco' || this.mode === 'land') {
      if (!g) { this.air += dt; if (vy > 1.5 && this.last.g) { this.setMode('air'); this.start('Jump_Start', Math.max(0, C.get('Jump_Start').takeoff - 0.06)); this.jumped = true; } else if (this.air > 0.25) { this.setMode('air'); this.jumped = false; this.start('Jump_Loop'); } }
      else this.air = 0;
      if (this.mode === 'land' && (this.mt > (sp > 0.6 ? 0.22 : 0.6) || this.time('Jump_Land') >= C.get('Jump_Land').dur - 0.1)) this.setMode('loco');
    } else if (this.mode === 'air') {
      this.air += dt;
      if (this.jumped && this.time('Jump_Start') >= C.get('Jump_Start').dur - 0.25) { this.jumped = false; this.start('Jump_Loop', 0.2); }
      if (g) {
        if (this.air > 0.3 || this.last.vy < -7) { this.setMode('land'); this.start('Jump_Land', C.get('Jump_Land').contact); }
        else this.setMode('loco');
        this.air = 0;
      }
    } else if (this.mode === 'sit') {
    }
    if (this.oneshot && this.oneshot.upper && !this.oneshot.loop && this.time(this.oneshot.name) >= C.get(this.oneshot.name).dur - 0.05) this.oneshot = null;
    this.last.g = g; this.last.vy = vy;

    const TL = {}, TU = {}, both = (n, x = 1) => { TL[n] = (TL[n] || 0) + x; TU[n] = (TU[n] || 0) + x; };
    let rate = 9;
    const m = this.mode;
    if (m === 'action') { both(this.oneshot.name); rate = opt.actionRate || 10; }
    else if (m === 'sit') { both(opt.sitClip || 'Sitting_Idle_Loop'); rate = 8; }
    else if (m === 'air') { both(this.jumped ? 'Jump_Start' : 'Jump_Loop'); rate = this.jumped ? 20 : 8; }
    else if (m === 'land') { both('Jump_Land'); rate = 18; }
    let f = 0;
    if (m === 'loco' || (m === 'land' && sp > 0.6)) {
      const k = m === 'land' ? Math.min(1, this.mt / 0.22) : 1;
      if (m === 'land') { TL.Jump_Land *= 1 - k; TU.Jump_Land *= 1 - k; }
      const Lw = {}; f = this.loco(sp, Lw, k);
      for (const n in Lw) both(n, Lw[n]);
    }
    const ov = this.oneshot && this.oneshot.upper ? this.oneshot.name : (m === 'loco' || m === 'land' || m === 'air') ? (opt.overlay || null) : null;
    if (ov && this.clips.has(ov)) { for (const n in TU) TU[n] = 0; TU[ov] = 1; }
    this.phase = (this.phase + f * dt * (opt.dir || 1) + 1) % 1;
    for (const s of this.S) {
      const u = ((this.phase + s.p0) % 1 + 1) % 1;
      for (const l of ['lo', 'up']) { const a = this.acts.get(s.n + ':' + l) || this.act(s.n, l); a.timeScale = 0; a.time = u * s.dur; }
    }
    const snap = this.snap; this.snap = false;
    for (const [T, l] of [[TL, 'lo'], [TU, 'up']]) {
      for (const n in T) if (T[n] > 0 && !this.acts.has(n + ':' + l)) this.act(n, l);
      for (const [key] of this.acts) {
        if (!key.endsWith(':' + l)) continue;
        const n = key.slice(0, -l.length - 1), tgt = T[n] || 0;
        let cur = this.w.get(key);
        cur = snap ? tgt : cur + (tgt - cur) * Math.min(1, dt * rate);
        if (cur < 1e-3 && tgt === 0) cur = 0;
        this.w.set(key, cur);
      }
      let sum = 0;
      for (const [key] of this.acts) if (key.endsWith(':' + l)) sum += this.w.get(key);
      for (const [key, a] of this.acts) if (key.endsWith(':' + l)) a.setEffectiveWeight(sum > 1e-3 ? this.w.get(key) / sum : 0);
    }
    this.mixer.update(dt);
  }
}
