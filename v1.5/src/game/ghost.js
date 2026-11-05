// Ghost body: one ghost of any type (behaviour module from src/ghosts drives its free states), shared flee, stagger, wrangling, slam and trap suck, network authority or puppet.
import * as THREE from 'three';
import { behaviour, GHOST_LIST } from '../ghosts/index.js';
import { voice, MOOD } from '../ghosts/common.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const v3 = (a) => (a && a.isVector3 ? a.clone() : Array.isArray(a) ? V(a[0], a[1], a[2]) : null);
const _a = V(), _b = V(), _c = V(), _d = V();
const rnd = (a, b) => a + Math.random() * (b - a);
const STATES = ['eat', 'roam', 'prank', 'taunt', 'windup', 'swoop', 'flee', 'stagger', 'wrangled', 'slammed', 'sucked', 'captured', 'off'];
const FOOD = /food|hot.?dog|bun|sausage|pretzel|soda|mustard|ketchup|cart|fruit|duck|noodle/i;
const r2 = (v) => Math.round(v * 100) / 100;

export class Ghost {
  constructor({ fx, audio, plate, phys, id = 0, type = 'onionhead', site = null, grp = 0, idx = 0 }) {
    this.fx = fx; this.audio = audio; this.plate = plate; this.phys = phys; this.id = id;
    this.grp = grp; this.idx = idx; this.site = site;
    const sp = plate.spawns || {};
    this.home = v3(site?.ghostSpawn) || sp.ghost?.pos?.clone() || V(0, 4, 20);
    const f = site?.food?.[0];
    this.cart = f ? v3(f.pos) : site ? v3(site.pos) : sp.hotdogCart?.pos?.clone() || this.home.clone();
    this.cart.y = Math.max(1, this.cart.y);
    this.route = site?.ghostRoute?.length ? site.ghostRoute.map(v3) : (sp.ghostRoute || []).map((p) => p.clone());
    if (!this.route.length) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; this.route.push(V(this.home.x + Math.cos(a) * 12, 3.5, this.home.z + Math.sin(a) * 9)); }
    this.vel = V(); this.struggle = V(); this.lookDir = V(0, 0, 1); this.trapPos = V();
    this.wranglers = new Map(); this.sDir = V(1, 0, 0); this.sMag = 0; this.sT = 0;
    this.puppet = false; this.samples = []; this.owner = null; this.presence = null;
    this.gp = { vel: this.vel, mood: 'idle', hurt: 0, struggle: this.struggle, suck: 0, trapPos: this.trapPos, mouth: 0, x: null };
    this.setType(type);
    this.reset(grp === 0);
  }

  setType(type) {
    const beh = behaviour(type);
    if (this.g && this.beh === beh) return;
    const shown = this.obj ? this.obj.visible : true, loud = !!this.presence;
    this.presence?.stop(0.1); this.presence = null;
    if (this.g) this.fx.releaseGhost?.(this.g);
    this.beh = beh; this.type = beh.type; this.name = beh.name;
    this.g = this.fx.createGhost(beh.type);
    this.g.setTint?.(this.idx);
    this.obj = this.g.object3D;
    this.obj.visible = shown;
    if (this.pos) this.obj.position.copy(this.pos);
    this.radius = beh.radius || this.g.radius || 0.6;
    this.maxWill = beh.will || 100;
    this.beh.init?.(this);
    if (loud) this.start();
  }

  refreshFood() {
    const c = this.cart;
    this.food = this.plate.props.filter((p) => p.object3D && !p.eaten && (p.food || FOOD.test((p.kind || '') + ' ' + (p.id || ''))) && p.object3D.position.distanceToSquared(c) < 100);
  }

  reset(eating = true) {
    this.wp = (this.id * 5) % this.route.length;
    this.pos = eating ? this.cart.clone().add(_a.set(Math.sin(this.idx * 2.4) * this.idx * 0.5, 1.1, Math.cos(this.idx * 2.4) * this.idx * 0.5)) : this.route[this.wp].clone();
    this.vel.set(0, 0, 0);
    this.state = eating ? 'eat' : 'roam'; this.st = 0; this.will = this.maxWill;
    this.hurt = 0; this.mouth = 0; this.lastHit = 99; this.anger = 0; this.slimedMask = 0;
    this.prankT = rnd(6, 10); this.tauntT = rnd(10, 16); this.swoopCd = 12; this.eatT = 1; this.jinkT = 0; this.jink = V(); this.foodT = 0;
    this.suck = 0; this.alive = true; this.visible = true; this.active = true;
    this.capturable = false; this.slam = null; this.t = 0; this.owner = null;
    this.wranglers.clear();
    this.refreshFood();
    this.beh.init?.(this);
    this.obj.visible = true;
    this.obj.position.copy(this.pos);
  }

  deactivate() { this.active = false; this.alive = false; this.state = 'off'; this.obj.visible = false; this.presence?.stop(0.2); this.presence = null; }

  start() {
    if (this.presence || !this.alive || (this.beh.count && this.idx > 0)) return;
    this.presence = this.audio?.loop(voice(this.beh, 'ghost_presence'), { obj: this.obj, gain: 0.55, ref: 4 });
  }

  say(name, gain = 1) { this.audio?.play(voice(this.beh, name), { obj: this.obj, gain, jitter: 0.12, ref: 4 }); }

  set(s) { if (this.state !== s) { this.state = s; this.st = 0; } }

  hit(amount, dir, kind = 'stream') {
    if (this.state === 'sucked' || this.state === 'captured' || !this.alive) return;
    this.lastHit = 0;
    this.hurt = Math.min(1, this.hurt + (kind === 'stream' ? 0.08 : 0.9));
    if (this.puppet) { this.net?.damage(this, amount, dir, kind); return; }
    this.will = Math.max(0, this.will - amount);
    this.anger = Math.min(1, this.anger + amount * 0.01);
    this.beh.hit?.(this, amount);
    if (kind !== 'stream') { this.vel.addScaledVector(dir, 7); this.say('ghost_hurt'); if (this.state !== 'wrangled') this.set('stagger'); }
    else if (this.state === 'eat' || this.state === 'roam' || this.state === 'taunt' || this.state === 'prank') { this.say(Math.random() < 0.5 ? 'ghost_hurt' : 'ghost_wail'); this.set('flee'); }
    else if (Math.random() < 0.02) this.say('ghost_hurt', 0.8);
  }

  get gone() { return !this.alive || this.state === 'sucked' || this.state === 'captured'; }

  lock(pid = 'me') {
    if (this.puppet) { this.net?.lock(this); return; }
    if (this.gone) return;
    if (this.state !== 'wrangled') { this.set('wrangled'); this.say('ghost_roar'); this.sT = 0; }
    this.wranglers.set(pid, { desired: this.pos.clone(), counter: 0, t: 0 });
  }

  wrangle(pid, desired, counter) {
    if (this.puppet) return;
    const w = this.wranglers.get(pid);
    if (w) { w.desired.copy(desired); w.counter = counter; w.t = 0; }
  }

  unwrangle(pid = 'me', heal = 16) {
    if (this.puppet) { this.net?.unlock(this, heal); return; }
    this.wranglers.delete(pid);
    if (!this.wranglers.size) this.release(heal);
  }

  release(heal = 18) { this.wranglers.clear(); if (this.state === 'wrangled' || this.state === 'slammed') { this.will = Math.min(this.maxWill, this.will + heal); this.say('ghost_laugh'); this.set('flee'); } }

  doSlam(dir) {
    if (this.puppet) { this.net?.slam(this, dir); return; }
    if (this.gone) return;
    this.slam = { dir: dir.clone(), speed: 12 };
    this.set('slammed');
  }

  startSuck(trapPos, owner = 'me') { this.trapPos.copy(trapPos); this.owner = owner; this.wranglers.clear(); this.set('sucked'); this.suck = 0; this.say('ghost_captured', 1.2); }

  steer(target, speed, k, dt) {
    _a.copy(target).sub(this.pos);
    const d = _a.length();
    if (d > 1e-3) _a.multiplyScalar(Math.min(speed, d * 2) / d);
    this.vel.lerp(_a, 1 - Math.exp(-dt * k));
  }

  knockProps(r = 1.3, power = 1) {
    for (const p of this.plate.props) {
      if (p.dead || p.broken || !p.body) continue;
      const t = p.object3D ? p.object3D.position : p.body.translation();
      _b.set(t.x - this.pos.x, t.y - this.pos.y, t.z - this.pos.z);
      const d = _b.length();
      if (d > r + this.radius) continue;
      _b.normalize();
      if (p.body.isDynamic?.()) {
        const k = (p.mass || 10) * (0.6 + this.vel.length() * 0.35) * power;
        const imp = { x: _b.x * k + this.vel.x * k * 0.2, y: k * 0.5, z: _b.z * k + this.vel.z * k * 0.2 };
        p.body.applyImpulse(imp, true);
        p.body.applyTorqueImpulse({ x: rnd(-1, 1) * k * 0.15, y: rnd(-1, 1) * k * 0.15, z: rnd(-1, 1) * k * 0.15 }, true);
        this.onKnock?.(p, imp);
      }
      if (p.breakable && power > 1.5) {
        if (p.damage) p.damage(25 * power, _b.clone()); else { p.hp = (p.hp ?? 30) - 25 * power; if (p.hp <= 0 && p.onBreak) p.onBreak(_b.clone()); }
        if (p.broken || p.dead) this.onWreck?.(p);
      }
    }
  }

  nearest(list, out) {
    let best = null, bd = Infinity;
    for (const p of list) { const d = p.distanceToSquared(this.pos); if (d < bd) { bd = d; best = p; } }
    return best ? out.copy(best) : out.copy(this.pos).add(_b.set(0, 0, 5));
  }

  wrangledStep(dt, ctx) {
    for (const [k, w] of this.wranglers) { w.t += dt; if (w.t > 2.5) this.wranglers.delete(k); }
    const n = this.wranglers.size;
    if (!n) { this.release(12); return; }
    this.sT -= dt;
    const w01 = THREE.MathUtils.clamp(this.will / 35, 0, 1);
    if (this.sT <= 0) {
      this.sT = 0.7 + Math.random() * 0.7;
      this.sDir.set(Math.random() - 0.5, (Math.random() - 0.35) * 0.7, Math.random() - 0.5);
      _b.copy(this.pos).sub(this.nearest(ctx.players || [ctx.playerHead], _c)).setY(0).normalize();
      this.sDir.addScaledVector(_b, 0.5);
      if (ctx.trapNear) { _b.copy(this.pos).sub(ctx.trapNear).setY(0).normalize(); this.sDir.addScaledVector(_b, 0.8); }
      if (this.beh.ground) this.sDir.y *= 0.3;
      this.sDir.normalize();
      this.sMag = (8 + 9 * w01) / (1 + 0.3 * (n - 1));
      this.say('ghost_wail', 0.6);
    }
    let cmax = 0;
    _a.set(0, 0, 0);
    for (const w of this.wranglers.values()) { _a.add(_d.copy(w.desired).sub(this.pos)); cmax = Math.max(cmax, w.counter); }
    _a.multiplyScalar(17 * (1 + 0.35 * (n - 1)) / n);
    const resist = cmax > 0.25 ? 0.35 : 1;
    _a.addScaledVector(this.vel, -5.5).addScaledVector(this.sDir, this.sMag * resist);
    if (ctx.trapPull) _a.addScaledVector(_b.copy(ctx.trapPull).sub(this.pos), 3.2);
    this.vel.addScaledVector(_a, dt);
    this.struggle.copy(this.sDir).multiplyScalar(this.sMag * resist / 17);
    this.will = Math.max(0, this.will - dt * (cmax > 0.25 ? 6.5 : 2.6) * (1 + 0.5 * (n - 1)));
    if (Math.random() < dt * 0.5) this.say(Math.random() < 0.5 ? 'ghost_wail' : 'ghost_hurt', 0.9);
  }

  update(dt, ctx) {
    if (!this.active) return;
    if (this.puppet) { this.puppetStep(dt, ctx); return; }
    if (!this.alive) return;
    this.t += dt; this.st += dt; this.lastHit += dt;
    this.hurt = Math.max(0, this.hurt - dt * 2.2);
    this.mouth = Math.max(0, this.mouth - dt * 3);
    this.swoopCd -= dt; this.prankT -= dt; this.tauntT -= dt;
    if (this.lastHit > 4 && this.state !== 'wrangled' && this.state !== 'sucked') this.will = Math.min(this.maxWill, this.will + dt * 2.5);
    this.capturable = this.will <= 35;
    if (this.state === 'eat' && !this.food.length && (this.foodT -= dt) <= 0) { this.foodT = 3; this.refreshFood(); }
    const target = this.nearest(ctx.players || [ctx.playerHead], _d);
    if (!this.beh.step(this, dt, ctx)) this.common(dt, ctx, target);
    if (this.state !== 'sucked' && this.alive) {
      this.pos.addScaledVector(this.vel, dt);
      const B = this.plate.bounds || { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
      const m = 3;
      if (this.pos.x < B.minX + m) this.vel.x += (B.minX + m - this.pos.x) * dt * 8;
      if (this.pos.x > B.maxX - m) this.vel.x -= (this.pos.x - B.maxX + m) * dt * 8;
      if (this.pos.z < B.minZ + m) this.vel.z += (B.minZ + m - this.pos.z) * dt * 8;
      if (this.pos.z > B.maxZ - m) this.vel.z -= (this.pos.z - B.maxZ + m) * dt * 8;
      const gy = ctx.groundAt ? ctx.groundAt(this.pos.x, this.pos.z) : 0;
      const floor = gy + (this.state === 'slammed' ? this.radius * 0.6 : this.beh.floor ?? this.radius + 0.35);
      if (this.pos.y < floor) { this.pos.y = floor; if (this.vel.y < 0) this.vel.y *= -0.3; }
      if (this.pos.y > gy + 14) this.vel.y -= (this.pos.y - gy - 14) * dt * 4;
      if (!this.beh.ground && this.state !== 'wrangled') this.pos.y += Math.sin(this.t * 2.1) * dt * 0.25;
    }
    this.visuals(dt, target);
  }

  common(dt, ctx, target) {
    switch (this.state) {
      case 'flee': {
        this.jinkT -= dt;
        if (this.jinkT <= 0) { this.jinkT = rnd(0.35, 0.8); this.jink.set(rnd(-1, 1), rnd(-0.4, 0.8), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 7)); }
        _a.copy(this.pos).sub(target).setY(0).normalize().multiplyScalar(7).add(this.jink).add(this.pos);
        this.steer(_a, 6.5 - (1 - this.will / this.maxWill) * 2.2, 2.8, dt);
        if (this.lastHit > 2.4) this.set(this.anger > 0.3 && this.swoopCd <= 0 && _c.copy(target).sub(this.pos).length() < 14 ? 'windup' : 'roam');
        break;
      }
      case 'stagger': {
        this.vel.multiplyScalar(Math.exp(-dt * 3));
        this.vel.y += Math.sin(this.t * 13) * dt * 2;
        if (this.st > 0.7) this.set(this.wranglers.size ? 'wrangled' : 'flee');
        break;
      }
      case 'wrangled': this.wrangledStep(dt, ctx); break;
      case 'slammed': {
        const s = this.slam;
        this.vel.copy(s.dir).multiplyScalar(s.speed);
        s.speed = Math.min(26, s.speed + dt * 60);
        const gy = ctx.groundAt ? ctx.groundAt(this.pos.x, this.pos.z) : 0;
        if (this.pos.y <= gy + this.radius + 0.15 || this.st > 0.7) {
          this.pos.y = Math.max(this.pos.y, gy + this.radius + 0.1);
          ctx.onSlam?.(this.pos.clone(), this);
          this.knockProps(3.2, 3);
          this.vel.set(0, 3, 0);
          this.set(this.wranglers.size ? 'wrangled' : 'stagger');
        }
        break;
      }
      case 'sucked': {
        this.suck = Math.min(1, this.suck + dt / 1.7);
        const s = this.suck, ang = s * 14;
        _a.copy(this.trapPos).add(_b.set(Math.cos(ang) * (1 - s) * 0.8, 0.25 + (1 - s) * 2.4, Math.sin(ang) * (1 - s) * 0.8));
        this.pos.lerp(_a, 1 - Math.exp(-dt * 9));
        this.vel.set(0, 0, 0);
        if (s >= 1) this.captured(ctx);
        break;
      }
      default: this.set('roam');
    }
  }

  captured(ctx) {
    this.state = 'captured'; this.alive = false; this.obj.visible = false;
    this.presence?.stop(0.3); this.presence = null;
    ctx?.onCaptured?.(this);
  }

  visuals(dt, target) {
    this.obj.position.copy(this.pos);
    if (this.beh.face && this.beh.face(this, _a)) { if (_a.lengthSq() > 0.5) this.lookDir.lerp(_a, 1 - Math.exp(-dt * 8)).normalize(); }
    else {
      const hv = Math.hypot(this.vel.x, this.vel.z);
      if (hv > 0.4 && this.state !== 'taunt' && this.state !== 'windup') _a.set(this.vel.x, 0, this.vel.z).normalize();
      else _a.set(target.x - this.pos.x, 0, target.z - this.pos.z).normalize();
      if (_a.lengthSq() > 0.5) this.lookDir.lerp(_a, 1 - Math.exp(-dt * 6)).normalize();
    }
    this.obj.rotation.y = Math.atan2(this.lookDir.x, this.lookDir.z);
    const gp = this.gp;
    gp.mood = this.beh.mood ? this.beh.mood(this) : MOOD[this.state] || 'idle';
    gp.hurt = this.hurt; gp.suck = this.suck; gp.mouth = this.mouth; gp.x = this.fxx || null;
    this.g.update(dt, gp);
  }

  toNet() {
    const t = GHOST_LIST.indexOf(this.type);
    if (!this.active) return { s: 12, t };
    const o = { s: STATES.indexOf(this.state), t, p: [r2(this.pos.x), r2(this.pos.y), r2(this.pos.z)], v: [r2(this.vel.x), r2(this.vel.y), r2(this.vel.z)], w: Math.round(this.will), h: r2(this.hurt), m: r2(this.mouth) };
    if (this.fxx) { const x = {}; for (const k in this.fxx) { const v = this.fxx[k]; x[k] = typeof v === 'number' ? r2(v) : v && v.isVector3 ? [r2(v.x), r2(v.y), r2(v.z)] : v; } o.x = x; }
    if (this.state === 'wrangled') { o.d = [r2(this.sDir.x), r2(this.sDir.y), r2(this.sDir.z)]; o.g = r2(this.sMag); o.n = this.wranglers.size; o.f = {}; for (const [k, w] of this.wranglers) o.f[k] = r2(w.desired.distanceTo(this.pos)); }
    if (this.state === 'sucked' || this.state === 'captured') { o.k = r2(this.suck); o.tp = [r2(this.trapPos.x), r2(this.trapPos.y), r2(this.trapPos.z)]; o.o = this.owner || ''; }
    return o;
  }

  fromNet(o, now) {
    if (!o) return;
    if (GHOST_LIST[o.t] && GHOST_LIST[o.t] !== this.type) this.setType(GHOST_LIST[o.t]);
    const st = STATES[o.s] || 'off';
    if (st === 'off') { if (this.active) this.deactivate(); return; }
    if (!this.active) { this.active = true; this.alive = true; this.obj.visible = true; }
    const prev = this.state;
    this.state = st;
    this.will = o.w ?? this.will; this.capturable = this.will <= 35;
    this.hurt = Math.max(this.hurt, o.h || 0); this.mouth = Math.max(this.mouth, o.m || 0);
    if (o.x && this.fxx) for (const k in o.x) { const v = o.x[k]; if (Array.isArray(v)) this.fxx[k]?.set?.(v[0], v[1], v[2]); else this.fxx[k] = v; }
    if (o.d) { this.sDir.set(o.d[0], o.d[1], o.d[2]); this.sMag = o.g || 0; }
    this.netOff = o.f || null;
    if (o.tp) this.trapPos.set(o.tp[0], o.tp[1], o.tp[2]);
    this.suck = o.k || 0; this.owner = o.o || null;
    if (o.p) { this.samples.push({ t: now, p: V(o.p[0], o.p[1], o.p[2]), v: V(o.v[0], o.v[1], o.v[2]) }); if (this.samples.length > 6) this.samples.shift(); }
    if (st !== 'captured') this.seenLive = true;
    if (st === 'captured' && prev !== 'captured') { this.alive = false; this.obj.visible = false; this.presence?.stop(0.3); this.presence = null; if (this.seenLive) this.onNetCaptured?.(this); }
    else if (st !== 'captured' && !this.alive) { this.alive = true; this.obj.visible = true; }
    if (st === 'sucked' && prev !== 'sucked') this.say('ghost_captured', 1.2);
    if (st === 'wrangled' && prev !== 'wrangled' && prev !== 'slammed') this.say('ghost_roar');
  }

  puppetStep(dt, ctx) {
    this.t += dt;
    this.hurt = Math.max(0, this.hurt - dt * 2.2);
    this.mouth = Math.max(0, this.mouth - dt * 3);
    if (!this.alive) return;
    const rt = performance.now() - 120, S = this.samples;
    if (S.length) {
      let a = S[0], b = S[S.length - 1];
      for (let i = 0; i < S.length - 1; i++) if (S[i].t <= rt && S[i + 1].t >= rt) { a = S[i]; b = S[i + 1]; break; }
      if (rt >= b.t) { const ex = Math.min(0.25, (rt - b.t) / 1000); _a.copy(b.p).addScaledVector(b.v, ex); this.vel.copy(b.v); }
      else if (rt <= a.t) { _a.copy(a.p); this.vel.copy(a.v); }
      else { const k = (rt - a.t) / Math.max(1, b.t - a.t); _a.lerpVectors(a.p, b.p, k); this.vel.lerpVectors(a.v, b.v, k); }
      this.pos.lerp(_a, 1 - Math.exp(-dt * 20));
    }
    this.struggle.copy(this.sDir).multiplyScalar(this.state === 'wrangled' ? this.sMag / 17 : 0);
    const target = this.nearest(ctx.players || [ctx.playerHead], _d);
    this.visuals(dt, target);
  }
}
