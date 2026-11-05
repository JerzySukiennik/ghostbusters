// Web Audio manager: manifest-driven one-shots, loops and positional sources on sfx / ambience / ui buses.
import * as THREE from 'three';

const NOOP = { stop() {}, gain() {}, rate() {}, pos() {}, alive: false };
const V = new THREE.Vector3(), F = new THREE.Vector3(), U = new THREE.Vector3();

export class AudioSys {
  constructor(base = 'assets/audio/') {
    this.base = base;
    this.ctx = null;
    this.manifest = {};
    this.buffers = new Map();
    this.pending = new Map();
    this.follow = new Set();
    this.missing = new Set();
    const a = document.createElement('audio');
    this.ogg = !!a.canPlayType('audio/ogg; codecs=opus') && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    this.muted = false;
  }

  async load(url = this.base + 'manifest.json') {
    try { const r = await fetch(url, { cache: 'no-store' }); this.manifest = r.ok ? await r.json() : {}; } catch { this.manifest = {}; }
    return this;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
      this.master = c.createGain(); this.master.gain.value = 0.9;
      this.master.connect(this.comp).connect(c.destination);
      this.bus = {};
      for (const [k, v] of [['sfx', 1], ['amb', 0.55], ['ui', 0.7], ['car', 0.9]]) { const g = c.createGain(); g.gain.value = v; g.connect(this.master); this.bus[k] = g; }
      this.preload();
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  names() {
    const out = new Set();
    for (const [k, v] of Object.entries(this.manifest)) { out.add(k); for (const x of v.variants || []) out.add(x); }
    return [...out];
  }

  url(name) {
    const e = this.manifest[name];
    const files = e && e.files ? e.files : [name + '.ogg', name + '.mp3'];
    const pick = files.find((f) => (this.ogg ? /\.ogg$/ : /\.mp3$/).test(f)) || files[0];
    return { primary: this.base + pick, alt: this.base + (files.find((f) => f !== pick) || pick) };
  }

  fetchBuf(name) {
    if (this.buffers.has(name)) return Promise.resolve(this.buffers.get(name));
    if (this.pending.has(name)) return this.pending.get(name);
    const { primary, alt } = this.url(name);
    const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then((b) => this.ctx.decodeAudioData(b));
    const p = get(primary).catch(() => get(alt)).then((b) => { this.buffers.set(name, b); return b; }).catch(() => { this.missing.add(name); return null; });
    this.pending.set(name, p);
    return p;
  }

  preload() { for (const n of this.names()) this.fetchBuf(n); }

  pick(name) {
    const e = this.manifest[name];
    const pool = [name, ...((e && e.variants) || [])].filter((n) => this.buffers.get(n));
    return pool.length ? pool[(Math.random() * pool.length) | 0] : null;
  }

  has(name) { return !!this.pick(name); }

  play(name, o = {}) {
    if (!this.ctx || this.muted) return NOOP;
    const n = this.pick(name);
    if (!n) { if (!this.buffers.has(name) && this.manifest[name]) this.fetchBuf(name); return NOOP; }
    const c = this.ctx, e = this.manifest[n] || this.manifest[name] || {};
    const src = c.createBufferSource();
    src.buffer = this.buffers.get(n);
    src.loop = o.loop ?? !!e.loop;
    src.playbackRate.value = (o.rate || 1) * (o.jitter ? 1 + (Math.random() - 0.5) * o.jitter : 1);
    const g = c.createGain();
    const base = (e.gain ?? 1) * (o.gain ?? 1);
    g.gain.value = o.fadeIn ? 0 : base;
    if (o.fadeIn) g.gain.linearRampToValueAtTime(base, c.currentTime + o.fadeIn);
    let node = src.connect(g);
    let pan = null;
    if (o.pos || o.obj) {
      pan = c.createPanner();
      pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse';
      pan.refDistance = o.ref || 2.5; pan.rolloffFactor = o.rolloff || 1; pan.maxDistance = 200;
      const p = o.pos || o.obj.getWorldPosition(V);
      pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z;
      node = node.connect(pan);
    }
    node.connect(this.bus[o.bus || (e.category === 'ambient' ? 'amb' : e.category === 'ui' ? 'ui' : 'sfx')] || this.bus.sfx);
    src.start(c.currentTime + (o.delay || 0), o.offset || 0);
    const h = {
      alive: true, src, g, pan, base, obj: o.obj || null,
      stop: (fade = 0.08) => { if (!h.alive) return; h.alive = false; const t = c.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade); try { src.stop(t + fade + 0.02); } catch {} this.follow.delete(h); },
      gain: (v, k = 0.06) => { if (h.alive) g.gain.setTargetAtTime(base * v, c.currentTime, k); },
      rate: (r, k = 0.05) => { if (h.alive) src.playbackRate.setTargetAtTime(r, c.currentTime, k); },
      pos: (p) => { if (pan) { pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; } },
    };
    src.onended = () => { h.alive = false; this.follow.delete(h); };
    if (o.obj && pan) this.follow.add(h);
    return h;
  }

  loop(name, o = {}) { return this.play(name, { ...o, loop: true }); }

  update(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    camera.getWorldPosition(V); camera.getWorldDirection(F); U.set(0, 1, 0).applyQuaternion(camera.quaternion);
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(V.x, t, 0.02); l.positionY.setTargetAtTime(V.y, t, 0.02); l.positionZ.setTargetAtTime(V.z, t, 0.02);
      l.forwardX.value = F.x; l.forwardY.value = F.y; l.forwardZ.value = F.z; l.upX.value = U.x; l.upY.value = U.y; l.upZ.value = U.z;
    } else { l.setPosition(V.x, V.y, V.z); l.setOrientation(F.x, F.y, F.z, U.x, U.y, U.z); }
    for (const h of this.follow) if (h.obj) h.pos(h.obj.getWorldPosition(V));
  }
}
