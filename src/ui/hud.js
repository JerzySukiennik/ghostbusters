// Poster-style HUD: objective, world-pinned markers, crosshair with tension ring, ghost will bar, pack heat, minimap, speed, the dispatch radio card, toasts and the bust report.
import * as THREE from 'three';
import { Markers } from './markers.js';
import { Minimap } from './minimap.js';

const $ = (s) => document.querySelector(s);
const PRICE = { crate: 140, box: 25, cardboard: 25, trashcan: 95, trash: 95, can: 95, bench: 650, newspaper: 380, mailbox: 900, phone: 2400, booth: 2400, hydrant: 1800, cone: 40, barrier: 160, sawhorse: 160, cart: 2600, hotdog: 3, food: 3, glass: 450, window: 450, lamp: 1200, sign: 300 };
const _f = new THREE.Vector3();

export class HUD {
  constructor() {
    this.el = { obj: $('#objective .t'), prompt: $('#prompt'), pk: $('#prompt b'), pt: $('#prompt span'), cross: $('#cross'), tens: $('#tens'), ring: $('#ring'), gb: $('#ghostbar'), gbi: $('#ghostbar .b i'), gbu: $('#ghostbar .b u'), gbs: $('#ghostbar .s'), heat: $('#heat'), heati: $('#heat .b i'), speed: $('#speed'), speedv: $('#speed span'), toast: $('#toast'), done: $('#done'), sub: $('#done .sub'), rows: $('#done .rows'), radio: $('#radio'), rWhen: $('#radio .tm'), rTitle: $('#radio h3'), rText: $('#radio p'), rPay: $('#radio .pay'), map: $('#map') };
    this.cur = {}; this.toastT = 0; this.radioT = 0; this.bill = 0; this.broken = 0;
    this.el.gbu.style.left = '35%';
    this.markers = new Markers($('#marks'));
    this.minimap = new Minimap($('#map canvas'));
    this.use = { pos: new THREE.Vector3(), on: false, key: '', label: '', ok: true };
    this.goal = null; this.mapT = 0; this.range = 55;
    this.mv = { x: 0, z: 0, fx: 0, fz: -1, range: 55, car: { x: 0, z: 0, fx: 0, fz: 1 }, inCar: false, ghosts: [], mates: [], goal: null };
  }

  set(key, val, fn) { if (this.cur[key] !== val) { this.cur[key] = val; fn(val); } }

  setMap(data) { this.minimap.setMap(data); }

  objective(t) {
    this.set('obj', t, (v) => { const e = this.el.obj; e.style.opacity = 0; setTimeout(() => { e.textContent = v; e.style.opacity = 1; }, 180); });
  }

  prompt(key, text, pos = null, ok = true) {
    const u = this.use;
    u.on = !!(key && pos);
    if (u.on) { u.pos.copy(pos); u.key = key; u.label = text; u.ok = ok; }
    const flat = key && !pos ? key + text : '';
    this.set('prompt', flat, () => {
      if (!flat) { this.el.prompt.classList.remove('on'); return; }
      this.el.pk.textContent = key; this.el.pt.textContent = text; this.el.prompt.classList.add('on');
    });
  }

  mark(id, pos, o) { this.markers.put(id, pos, o); }

  cross(on, tension = 0, hot = false) {
    this.el.cross.classList.toggle('on', on);
    const c = 125.66 * Math.max(0, Math.min(1, tension));
    this.set('tens', Math.round(c), (v) => this.el.tens.setAttribute('stroke-dasharray', `${v} 126`));
    this.set('tcol', tension > 0.75 ? '#ffc04a' : '#9dff6a', (v) => this.el.tens.setAttribute('stroke', v));
    this.set('hot', hot, (v) => this.el.ring.setAttribute('stroke-opacity', v ? 0.6 : 0.2));
  }

  ghost(on, will = 100, status = '') {
    this.el.gb.classList.toggle('on', on);
    this.set('will', Math.round(will), (v) => (this.el.gbi.style.width = v + '%'));
    this.set('gbs', status, (v) => (this.el.gbs.textContent = v));
  }

  heat(on, v, hot, over) {
    this.el.heat.classList.toggle('on', on);
    this.el.heat.classList.toggle('hot', hot && !over);
    this.el.heat.classList.toggle('over', over);
    this.set('heatv', Math.round(v * 100), (x) => (this.el.heati.style.width = x + '%'));
  }

  speed(on, mph) {
    this.el.speed.classList.toggle('on', on);
    this.set('mph', Math.round(mph), (v) => (this.el.speedv.textContent = v));
  }

  toast(text, dur = 1.5) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('on');
    this.toastT = dur;
  }

  dispatch(d, dur = 9) {
    this.el.rWhen.textContent = d.when || '';
    this.el.rTitle.textContent = d.title || '';
    this.el.rText.textContent = d.text || '';
    this.el.rPay.textContent = d.pay || '';
    this.el.radio.classList.add('on');
    this.radioT = dur;
  }

  talk(on) { this.el.radio.classList.toggle('talk', on); }

  hideDispatch() { this.radioT = 0; this.el.radio.classList.remove('on', 'talk'); }

  damage(p) {
    const key = Object.keys(PRICE).find((k) => (p.kind + ' ' + (p.id || '')).toLowerCase().includes(k));
    this.bill += key ? PRICE[key] : 120;
    this.broken++;
  }

  update(dt, g) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('on'); }
    if (this.radioT > 0) { this.radioT -= dt; if (this.radioT <= 0) this.hideDispatch(); }
    if (!g) return;
    const u = this.use;
    if (u.on) this.markers.put('use', u.pos, { kind: 'use', key: u.key, label: u.label, dim: !u.ok });
    this.markers.update(g.camera, innerWidth, innerHeight);
    this.mapT -= dt;
    if (this.mapT > 0) return;
    this.mapT = 1 / 30;
    this.drawMap(g);
  }

  drawMap(g) {
    const v = this.mv, car = g.player.mode === 'car', ecto = g.ecto.root;
    const me = car ? ecto.position : g.player.feet;
    v.x = me.x; v.z = me.z;
    const L = Math.hypot(g.camDir.x, g.camDir.z);
    if (L > 1e-3) { v.fx = g.camDir.x / L; v.fz = g.camDir.z / L; }
    const want = car ? Math.min(150, 75 + Math.abs(g.ecto.fwdSpeed || 0) * 2.6) : 55;
    this.range += (want - this.range) * 0.08;
    v.range = this.range;
    _f.set(0, 0, 1).applyQuaternion(ecto.quaternion);
    v.car.x = ecto.position.x; v.car.z = ecto.position.z; v.car.fx = _f.x; v.car.fz = _f.z; v.inCar = car;
    let n = 0;
    const show = g.engaged || g.net?.engaged;
    if (show) for (const gh of g.ghosts) if (gh.active && gh.alive) { (v.ghosts[n] ||= { x: 0, z: 0 }); v.ghosts[n].x = gh.pos.x; v.ghosts[n].z = gh.pos.z; n++; }
    v.ghosts.length = n;
    n = 0;
    if (g.net) for (const r of g.net.remotes.values()) if (r.st && r.ready) { (v.mates[n] ||= { x: 0, z: 0 }); v.mates[n].x = r.pos.x; v.mates[n].z = r.pos.z; n++; }
    v.mates.length = n;
    v.goal = this.goal;
    this.minimap.draw(v);
  }

  report(s) {
    const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
    const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
    this.el.sub.textContent = `Onionhead is in the trap. ${m}:${String(sec).padStart(2, '0')} on the clock.`;
    const rows = [
      ...(s.crew ? [['Crew', s.crew]] : []),
      ['Bust fee', money(5000)],
      ['Property damage', '-' + money(this.bill)],
      ['Things wrecked', String(this.broken)],
      ['Times slimed', String(s.slimed)],
      ['Slams · boson darts', `${s.slams} · ${s.darts}`],
      ['Invoice to the city', money(5000 - this.bill), true],
    ];
    this.el.rows.replaceChildren(...rows.map(([a, b, t]) => {
      const r = document.createElement('div'); r.className = 'row' + (t ? ' tot' : '');
      for (const v of [a, b]) { const s = document.createElement('span'); s.textContent = v; r.append(s); }
      return r;
    }));
    this.el.done.classList.add('on');
  }

  hideReport() { this.el.done.classList.remove('on'); }

  roster(room) {
    const el = document.getElementById('roster');
    if (!el) return;
    if (!room || !room.code) { el.classList.remove('on'); return; }
    el.classList.add('on');
    el.textContent = '';
    const code = document.createElement('div'); code.className = 'code'; code.append('ROOM '); const b = document.createElement('b'); b.textContent = room.code; code.append(b); el.append(code);
    for (const pid of room.order) {
      const d = document.createElement('div');
      d.className = 'p' + (pid === room.pid ? ' me' : '');
      d.textContent = String(room.players[pid]?.nick || 'BUSTER').toUpperCase();
      if (pid === room.host) { const i = document.createElement('i'); i.textContent = 'HOST'; d.append(i); }
      el.append(d);
    }
  }
}
