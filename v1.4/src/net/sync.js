// Online co-op glue: sends the local Ghostbuster at 10 Hz, mirrors teammates, runs ghosts and traps on the host (with migration), relays hits, slams, breaks, crossings, seats and the Ecto-1.
import * as THREE from 'three';
import { RemotePlayer } from '../game/remote.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _c = V(), _d = V();
const r2 = (v) => Math.round(v * 100) / 100;
const arr = (v) => [r2(v.x), r2(v.y), r2(v.z)];

function segDist(p1, q1, p2, q2, out) {
  const d1 = _a.copy(q1).sub(p1), d2 = _b.copy(q2).sub(p2), r = _c.copy(p1).sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a < 1e-6 && e < 1e-6) { s = t = 0; }
  else if (a < 1e-6) { s = 0; t = THREE.MathUtils.clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e < 1e-6) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den > 1e-6 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = V().copy(p1).addScaledVector(d1, s), c2 = V().copy(p2).addScaledVector(d2, t);
  out.copy(c1).add(c2).multiplyScalar(0.5);
  return c1.distanceTo(c2);
}

export class Net {
  constructor({ game, room, assets, tpl, streams, traps }) {
    Object.assign(this, { game, room, assets, tpl });
    this.pid = room.pid;
    this.freeStreams = streams.slice(); this.freeTraps = traps.slice();
    this.remotes = new Map(); this.pending = new Map(); this.knockT = new Map();
    this.sendT = 0; this.ghostT = 0; this.carT = 0; this.flushT = 0; this.crossCd = 0;
    this.engaged = false; this.isHost = false; this.mission = null; this.seats = {};
    this.car = null; this.won = false; this.bill = 0; this.broken = 0;
    game.net = this;
    game.proton.pid = this.pid;
    for (const g of game.ghosts) { g.net = this; g.onNetCaptured = (gh) => game.onCaptured(gh); }
    game.ecto.setLocal(false);
    room.on('players', (ps, order) => this.onPlayers(ps, order));
    room.on('host', () => this.setHost(room.isHost));
    room.on('state', (pid, st) => this.onState(pid, st));
    room.on('gone', (pid) => this.drop(pid));
    room.on('ghosts', (gs) => this.onGhosts(gs));
    room.on('mission', (m) => this.onMission(m));
    room.on('car', (c) => this.onCar(c));
    room.on('event', (ev) => this.onEvent(ev));
    this.setHost(room.isHost);
  }

  emit(k, data) { this.room.emit(k, data); }

  setHost(on) {
    const was = this.isHost;
    this.isHost = on;
    for (const g of this.game.ghosts) {
      if (on && g.puppet) { g.puppet = false; g.samples.length = 0; if (g.state === 'wrangled') { for (const [pid, r] of this.remotes) if (r.st?.wr && r.st.wr[0] === g.id) g.wranglers.set(pid, { desired: V(r.st.wr[1], r.st.wr[2], r.st.wr[3]), counter: r.st.wr[4] || 0, t: 0 }); if (this.game.proton.wrangling && this.game.proton.target === g) g.wranglers.set(this.pid, { desired: this.game.proton.desired.clone(), counter: 0, t: 0 }); } }
      if (!on) g.puppet = true;
    }
    if (on && !was && this.room.order.length > 1) this.game.hud.toast('You are the host now', 1.6);
    this.game.hud.roster?.(this.room, this);
  }

  async onPlayers(ps, order) {
    const g = this.game;
    const idx = Math.max(0, order.indexOf(this.pid));
    if (idx !== g.slotIndex && g.gear.state === 'stowed' && !g.busy) { g.slotIndex = idx; g.gear.assignSlot(g.ecto, idx); }
    for (const [pid, info] of Object.entries(ps)) {
      if (pid === this.pid) continue;
      const r = this.remotes.get(pid);
      if (r) { r.setInfo(info); continue; }
      const rp = new RemotePlayer({ pid, info, assets: this.assets, scene: g.scene, audio: g.audio, fx: g.fx, stream: this.freeStreams.shift() || null, trap: this.freeTraps.shift() || null, tpl: this.tpl, ecto: g.ecto, game: g });
      this.remotes.set(pid, rp);
      rp.init().then(() => { if (!rp.gone) g.hud.toast(`${(info.nick || 'Someone').toUpperCase()} joined`, 1.6); g.audio.play('ui_confirm', { bus: 'ui' }); });
    }
    for (const pid of [...this.remotes.keys()]) if (!ps[pid]) this.drop(pid);
    if (this.isHost) this.ensureGhosts();
    g.hud.roster?.(this.room, this);
  }

  drop(pid) {
    const r = this.remotes.get(pid);
    if (!r) return;
    const nick = r.info?.nick;
    r.dispose();
    if (r.stream) this.freeStreams.push(r.stream);
    if (r.trap) this.freeTraps.push(r.trap);
    this.remotes.delete(pid);
    for (const g of this.game.ghosts) g.wranglers.delete(pid);
    this.game.hud.toast(`${(nick || 'Someone').toUpperCase()} left`, 1.4);
    this.game.hud.roster?.(this.room, this);
  }

  onState(pid, st) {
    if (pid === this.pid || !st) return;
    const r = this.remotes.get(pid);
    if (r) r.apply(st, performance.now());
    if (!this.isHost) return;
    const gs = this.game.ghosts;
    if (st.wr) {
      const gh = gs[st.wr[0]];
      if (gh && !gh.gone && !gh.puppet) {
        const d = _d.set(st.wr[1], st.wr[2], st.wr[3]);
        if (!gh.wranglers.has(pid)) { if (gh.will <= 40 || gh.state === 'wrangled' || gh.state === 'slammed') gh.lock(pid); }
        gh.wrangle(pid, d, st.wr[4] || 0);
      }
    } else for (const gh of gs) if (gh.wranglers.has(pid) && !gh.puppet) gh.unwrangle(pid, 10);
  }

  onGhosts(gs) {
    if (this.isHost || !gs) return;
    const now = performance.now();
    this.game.ghosts.forEach((g, i) => { if (gs[i]) g.fromNet(gs[i], now); });
  }

  onMission(m) {
    if (!m) return;
    this.mission = m;
    if (m.e) this.engaged = true;
    if (!this.isHost) { this.bill = m.bill || 0; this.broken = m.br || 0; }
    if (m.won && !this.won) this.win(m);
  }

  onCar(c) {
    this.car = c || null;
    this.seats = (c && c.seats) || {};
    const g = this.game;
    if (!c) return;
    if (c.d !== this.pid && c.k) g.ecto.fromNet(c.k);
  }

  carDriver() { const d = this.car?.d; return d && (d === this.pid || this.room.players[d]) ? d : null; }

  async takeSeat() {
    for (let i = 0; i < 4; i++) {
      const ok = await this.room.claim(`host/car/seats/s${i}`, this.pid, (cur) => !this.room.players[cur]);
      if (ok) {
        if (i === 0) await this.room.claim('host/car/d', this.pid, (cur) => !this.room.players[cur]);
        return i;
      }
    }
    return -1;
  }

  leaveSeat(i) {
    this.room.release(`host/car/seats/s${i}`, this.pid);
    if (i === 0) { this.room.release('host/car/d', this.pid); this.room.setHost('car/k', this.game.ecto.toNet()); }
  }

  suiting() {
    for (const r of this.remotes.values()) if (r.st && (r.st.pk === 2 || r.st.pk === 3)) return true;
    return false;
  }

  damage(g, amount, dir, kind) {
    if (kind !== 'stream') { this.emit('dmg', { g: g.id, a: Math.round(amount * 10) / 10, kd: kind, d: arr(dir) }); return; }
    this.pending.set(g.id, (this.pending.get(g.id) || 0) + amount);
  }

  lock() {}
  unlock() {}
  slam(g, dir) { this.emit('slam', { g: g.id, d: arr(dir) }); }

  wrecked(p, dir) { if (p && p.id) this.emit('brk', { id: p.id, d: dir ? arr(dir) : [0, 1, 0] }); }

  knocked(p, imp) {
    const t = this.knockT.get(p.id) || 0, now = performance.now();
    if (now - t < 300) return;
    this.knockT.set(p.id, now);
    this.emit('knock', { id: p.id, i: [r2(imp.x), r2(imp.y), r2(imp.z)] });
  }

  ate(p) { this.emit('eat', { id: p.id }); }
  boom(p, n, d) { this.emit('boom', { p: arr(p), n: arr(n), d: arr(d) }); }

  slimeHead(i) {
    const order = [this.pid, ...[...this.remotes.values()].filter((r) => r.st && r.ready && r.st.m !== 'c').map((r) => r.pid)];
    const to = order[i];
    if (to && to !== this.pid) this.emit('slime', { to });
  }

  ghostCaptured(g) {
    if (!this.isHost) return;
    this.pushMission();
    this.checkWin();
  }

  prop(id) { return this.game.plate.props.find((p) => p.id === id); }

  onEvent(ev) {
    const g = this.game;
    switch (ev.k) {
      case 'dmg': if (this.isHost) { const gh = g.ghosts[ev.g]; if (gh) gh.hit(ev.a, V().fromArray(ev.d || [0, 0, 1]), ev.kd || 'stream'); } break;
      case 'slam': if (this.isHost) { const gh = g.ghosts[ev.g]; if (gh && !gh.puppet) gh.doSlam(V().fromArray(ev.d)); } break;
      case 'slamfx': { const p = V().fromArray(ev.p); g.fx.impact(p, V(0, 1, 0), 'slam'); g.phys.explode(p, 4, 70); g.renderer.addTrauma(0.4 * Math.max(0, 1 - p.distanceTo(g.player.feet) / 25)); g.audio.play('hit_metal', { pos: p, gain: 1.1 }); break; }
      case 'brk': { const p = this.prop(ev.id); if (p && !p.broken && !p.dead) { if (p.onBreak) p.onBreak(V().fromArray(ev.d)); else if (p.damage) p.damage(9999, V().fromArray(ev.d)); g.hud.damage(p); if (this.isHost) this.pushMission(); } break; }
      case 'knock': { const p = this.prop(ev.id); if (p && p.body && !p.broken && p.body.isDynamic?.()) p.body.applyImpulse({ x: ev.i[0], y: ev.i[1], z: ev.i[2] }, true); break; }
      case 'eat': { const p = this.prop(ev.id); if (p && !p.eaten) { p.eaten = true; p.dead = true; p.object3D.visible = false; try { p.body?.setEnabled(false); } catch {} } break; }
      case 'boom': g.proton.blastAt(V().fromArray(ev.p), V().fromArray(ev.n), V().fromArray(ev.d), false); break;
      case 'cross': this.crossFx(V().fromArray(ev.p), false, !ev.a || ev.a === this.pid || ev.b === this.pid); break;
      case 'slime': if (ev.to === this.pid) g.slime(); break;
      case 'suck': if (ev.to === this.pid) { const gh = g.ghosts[ev.g]; if (gh) { g.trap.beginSuck(gh); g.proton.stopAll(); } } break;
      case 'car': if (ev.a) g.car(ev.a, ev.v, false); break;
      case 'horn': g.audio.play('ecto_horn', { obj: g.ecto.root, bus: 'car' }); break;
      case 'engage': this.engaged = true; break;
      case 'won': this.win(ev); break;
    }
  }

  ensureGhosts() {
    const g = this.game;
    if (this.won) return;
    const want = this.room.order.length >= 3 ? 2 : 1;
    for (let i = 0; i < want; i++) {
      const gh = g.ghosts[i];
      if (gh && !gh.active && gh.state !== 'captured') { gh.puppet = false; gh.reset(false); gh.start(); g.hud.toast('Another ghost showed up!', 1.6); }
    }
  }

  pushMission() {
    if (!this.isHost) return;
    const gs = this.game.ghosts.filter((g) => g.active || g.state === 'captured');
    this.room.setHost('m', { e: this.engaged || this.game.engaged ? 1 : 0, n: gs.length, left: gs.filter((g) => g.alive).length, bill: this.game.hud.bill, br: this.game.hud.broken, won: this.won ? 1 : 0 });
  }

  checkWin() {
    if (!this.isHost || this.won) return;
    const g = this.game;
    if (g.ghostsLeft() > 0 || !g.ghosts.some((x) => x.state === 'captured')) return;
    const holding = (s) => s === 'full' || s === 'carried' || s === 'sucking';
    if (holding(g.trap.state)) return;
    for (const r of this.remotes.values()) if (r.st && r.st.tr && holding(r.st.tr.s)) return;
    const m = { bill: g.hud.bill, broken: g.hud.broken, n: this.room.order.length };
    this.emit('won', m);
    this.win(m);
  }

  win(m) {
    if (this.won) return;
    this.won = true;
    if (this.isHost) { this.pushMission(); this.room.beat('done'); }
    this.game.finish({ bill: m.bill, broken: m.broken ?? m.br, n: m.n || this.room.order.length });
  }

  crossFx(p, mine, involved = true) {
    if (this.crossCd > 0) return;
    this.crossCd = 3;
    const g = this.game;
    g.fx.impact(p, V(0, 1, 0), 'slam'); g.fx.impact(p, V(0, -1, 0), 'slam');
    g.phys.explode(p, 7, 160);
    const d = p.distanceTo(g.player.feet);
    g.renderer.addTrauma(Math.max(0.2, 1 - d / 30)); g.renderer.addFlash(Math.max(0.2, 1.2 - d / 25)); g.renderer.hitStop(0.12, 0.05);
    g.audio.play('hit_metal', { pos: p, gain: 1.4 }); g.audio.play('zap', { pos: p, gain: 1.2 }); g.audio.play('debris_small', { pos: p });
    if (involved && g.proton.on) { g.proton.stopAll(); g.gear.overheat(); }
    if (d < 6) { _a.copy(g.player.feet).sub(p).setY(0).normalize(); g.player.vel.addScaledVector(_a, 7); g.player.stun = 0.5; }
    g.hud.toast("Don't cross the streams!", 2.2);
  }

  checkCross(dt) {
    this.crossCd = Math.max(0, this.crossCd - dt);
    const pr = this.game.proton;
    if (!pr.on || this.crossCd > 0) { this.crossT = 0; return; }
    const p1 = this.game.tipW, q1 = pr.end, mid = V();
    let hit = null;
    for (const r of this.remotes.values()) {
      if (!r.streamSeg(_d, mid)) continue;
      const p2 = _d.clone(), q2 = mid.clone(), at = V();
      if (segDist(p1, q1, p2, q2, at) >= 0.32) continue;
      if (at.distanceTo(p1) < 1.2 || at.distanceTo(p2) < 1.2 || at.distanceTo(q1) < 1.4 || at.distanceTo(q2) < 1.4) continue;
      if (this.game.ghosts.some((g) => g.active && g.alive && g.pos.distanceTo(at) < 2.5)) continue;
      if (_a.copy(q1).sub(p1).normalize().dot(_b.copy(q2).sub(p2).normalize()) > 0.94) continue;
      hit = { at, pid: r.pid };
      break;
    }
    if (!hit) { this.crossT = 0; return; }
    this.crossT = (this.crossT || 0) + dt;
    if (this.crossT < 0.2) return;
    this.crossT = 0;
    this.emit('cross', { p: arr(hit.at), a: this.pid, b: hit.pid });
    this.crossFx(hit.at, true);
  }

  localState() {
    const g = this.game, p = g.player, pr = g.proton, tr = g.trap;
    const st = {
      p: arr(p.feet), y: r2(p.yaw), s: r2(p.mode === 'foot' ? p.speed : 0), g: p.grounded ? 1 : 0, m: p.mode === 'car' ? 'c' : p.mode === 'foot' ? 'f' : 'x', seat: g.seat || 0,
      ad: p.animDir || 1, ho: r2(p.hipOff || 0), am: g.aimHeld ? 1 : 0, sp: g.input.key('ShiftLeft') ? 1 : 0,
      pk: g.packState ?? (g.gear.state === 'worn' ? 1 : 0), slot: g.slotIndex || 0, h: r2(g.gear.heat), a: arr(pr.aim),
      f: pr.on ? (pr.mode === 'capture' ? 2 : 1) : 0, tr: tr.toNet(),
    };
    if (pr.on) { st.e = arr(pr.end); st.ek = pr.endKind === 'ghost' ? 1 : pr.endKind === 'surface' ? 2 : 0; st.tn = r2(pr.tension); }
    if (pr.wrangling && pr.target) st.wr = [pr.target.id, r2(pr.desired.x), r2(pr.desired.y), r2(pr.desired.z), r2(pr.counter)];
    return st;
  }

  update(dt, time) {
    const g = this.game;
    this.sendT -= dt; this.ghostT -= dt; this.carT -= dt; this.flushT -= dt;
    if (this.sendT <= 0) { this.sendT = 0.1; this.room.setState(this.localState()); }
    if (this.flushT <= 0) {
      this.flushT = 0.2;
      for (const [id, a] of this.pending) if (a > 0.05) this.emit('dmg', { g: id, a: Math.round(a * 10) / 10, kd: 'stream', d: [0, 0, 1] });
      this.pending.clear();
    }
    if (this.isHost) {
      if (this.ghostT <= 0) { this.ghostT = 0.125; this.room.setHost('g', g.ghosts.map((x) => x.toNet())); }
      if (g.engaged && !this.hostEngaged) { this.hostEngaged = true; this.pushMission(); }
      if ((this.missionT = (this.missionT || 0) - dt) <= 0) { this.missionT = 1; this.pushMission(); this.checkWin(); }
    }
    if (g.ecto.local && g.seat === 0 && g.player.mode === 'car' && this.carT <= 0) { this.carT = 0.1; this.room.setHost('car/k', g.ecto.toNet()); }
    for (const r of this.remotes.values()) r.update(dt, time, g.style);
    this.checkCross(dt);
  }

  async leave() {
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    await this.room.leave();
  }
}
