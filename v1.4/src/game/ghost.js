// Onionhead AI: gorges at the hot-dog cart, roams, pranks props, taunts, swoops to slime players, flees streams, gets wrangled by one or more streams, slammed and sucked into a trap. Runs as the authority (solo or host) or as a network puppet.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _c = V(), _d = V();
const rnd = (a, b) => a + Math.random() * (b - a);
const STATES = ['eat', 'roam', 'prank', 'taunt', 'windup', 'swoop', 'flee', 'stagger', 'wrangled', 'slammed', 'sucked', 'captured', 'off'];
const r2 = (v) => Math.round(v * 100) / 100;

export class Ghost {
  constructor({ fx, audio, plate, phys, id = 0 }) {
    this.fx = fx; this.audio = audio; this.plate = plate; this.phys = phys; this.id = id;
    this.g = fx.createGhost();
    this.obj = this.g.object3D;
    this.radius = this.g.radius || 0.6;
    this.home = plate.spawns.ghost?.pos?.clone() || V(0, 4, 20);
    this.cart = plate.spawns.hotdogCart?.pos?.clone() || this.home.clone().setY(1.2);
    this.route = (plate.spawns.ghostRoute || []).map((p) => p.clone());
    if (!this.route.length) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; this.route.push(V(Math.cos(a) * 12, 3.5, 18 + Math.sin(a) * 9)); }
    this.food = plate.props.filter((p) => p.food || /food|hot.?dog|bun|sausage|pretzel|soda|mustard|ketchup/i.test(p.kind + ' ' + p.id));
    if (this.food.length) { const c = this.food[0].object3D.position; if (this.cart.distanceTo(c) > 4) this.cart.set(c.x, Math.max(1, c.y), c.z); }
    this.vel = V(); this.struggle = V(); this.lookDir = V(0, 0, 1);
    this.wranglers = new Map(); this.sDir = V(1, 0, 0); this.sMag = 0; this.sT = 0;
    this.puppet = false; this.samples = []; this.owner = null;
    this.reset(id === 0);
    this.presence = null;
  }

  reset(eating = true) {
    this.wp = (this.id * 5) % this.route.length;
    this.pos = eating ? this.cart.clone().add(V(0, 1.1, 0)) : this.route[this.wp].clone();
    this.vel.set(0, 0, 0);
    this.state = eating ? 'eat' : 'roam'; this.st = 0; this.will = 100; this.maxWill = 100;
    this.hurt = 0; this.mouth = 0; this.lastHit = 99; this.anger = 0;
    this.prankT = rnd(6, 10); this.tauntT = rnd(10, 16); this.swoopCd = 12; this.eatT = 1; this.jinkT = 0; this.jink = V();
    this.suck = 0; this.trapPos = V(); this.alive = true; this.visible = true; this.active = true;
    this.capturable = false; this.slam = null; this.t = 0; this.owner = null;
    this.wranglers.clear();
    this.obj.visible = true;
    this.obj.position.copy(this.pos);
  }

  deactivate() { this.active = false; this.alive = false; this.state = 'off'; this.obj.visible = false; this.presence?.stop(0.2); this.presence = null; }

  start() { if (!this.presence && this.alive) this.presence = this.audio?.loop('ghost_presence', { obj: this.obj, gain: 0.55, ref: 4 }); }

  say(name, gain = 1) { this.audio?.play(name, { obj: this.obj, gain, jitter: 0.12, ref: 4 }); }

  set(s) { if (this.state !== s) { this.state = s; this.st = 0; } }

  hit(amount, dir, kind = 'stream') {
    if (this.state === 'sucked' || this.state === 'captured' || !this.alive) return;
    this.lastHit = 0;
    this.hurt = Math.min(1, this.hurt + (kind === 'stream' ? 0.08 : 0.9));
    if (this.puppet) { this.net?.damage(this, amount, dir, kind); return; }
    this.will = Math.max(0, this.will - amount);
    this.anger = Math.min(1, this.anger + amount * 0.01);
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
    return best ? out.copy(best) : out.copy(this.pos).add(V(0, 0, 5));
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
      _a.set(0, 0, 0); for (const w of this.wranglers.values()) _a.add(w.desired); _a.divideScalar(n);
      _b.copy(this.pos).sub(this.nearest(ctx.players || [ctx.playerHead], _c)).setY(0).normalize();
      this.sDir.addScaledVector(_b, 0.5);
      if (ctx.trapNear) { _b.copy(this.pos).sub(ctx.trapNear).setY(0).normalize(); this.sDir.addScaledVector(_b, 0.8); }
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
    const target = this.nearest(ctx.players || [ctx.playerHead], _d);
    const toP = _c.copy(target).sub(this.pos); const dP = toP.length();
    switch (this.state) {
      case 'eat': {
        _a.copy(this.cart).add(_b.set(Math.sin(this.t * 0.8) * 0.4, 1.0 + Math.sin(this.t * 1.7) * 0.15, Math.cos(this.t * 0.6) * 0.3));
        this.steer(_a, 2, 3, dt);
        this.eatT -= dt;
        if (this.eatT <= 0) {
          this.eatT = rnd(1.1, 2.0); this.mouth = 1; this.say('ghost_eat', 0.9);
          const f = this.food.find((p) => !p.dead && !p.broken && !p.eaten && p.object3D);
          if (f) { f.eaten = true; f.dead = true; f.object3D.visible = false; try { f.body?.setEnabled(false); } catch {} this.onEat?.(f); }
        }
        if (ctx.engaged && (dP < 10 || this.st > 14)) { this.say('ghost_laugh'); this.set('roam'); }
        break;
      }
      case 'roam': {
        const w = this.route[this.wp % this.route.length];
        this.steer(w, 3.6 + this.anger * 2, 1.6, dt);
        if (this.pos.distanceTo(w) < 1.5) this.wp = (this.wp + 1 + (Math.random() < 0.25 ? 1 : 0)) % this.route.length;
        if (this.prankT <= 0) { this.set('prank'); this.prankT = rnd(7, 12); const live = this.plate.props.filter((p) => !p.dead && !p.broken && p.body); this.prankTarget = live.length ? live[(Math.random() * live.length) | 0] : null; }
        else if (this.tauntT <= 0 && ctx.engaged) { this.set('taunt'); this.tauntT = rnd(9, 15); }
        else if (this.swoopCd <= 0 && ctx.engaged && dP < 16 && this.anger > 0.25) { this.set('windup'); this.swoopCd = rnd(11, 16); this.say('ghost_roar'); }
        if (this.state === 'roam' && this.st > 1.2 && Math.random() < dt * 0.15) this.say('ghost_laugh', 0.7);
        break;
      }
      case 'prank': {
        const t = this.prankTarget;
        if (!t || t.dead || t.broken) { this.set('roam'); break; }
        const tp = t.object3D ? t.object3D.position : t.body.translation();
        _a.set(tp.x, tp.y + 0.6, tp.z);
        this.steer(_a, 7, 3, dt);
        if (this.pos.distanceTo(_a) < 1.3) { this.knockProps(1.6, 2); this.mouth = 1; this.say('ghost_laugh'); this.vel.y += 4; this.set('roam'); }
        if (this.st > 5) this.set('roam');
        break;
      }
      case 'taunt': {
        _a.copy(target).add(_b.set(Math.sin(this.t * 2) * 2.5, 1.2 + Math.sin(this.t * 3) * 0.5, 0)).addScaledVector(toP.normalize(), -4.5);
        this.steer(_a, 6, 3, dt);
        if (this.st > 0.6 && this.st < 0.7) { this.say('ghost_laugh', 1.1); this.mouth = 1; }
        if (this.st > 2.4) this.set('roam');
        break;
      }
      case 'windup': {
        _a.copy(this.pos).addScaledVector(toP.normalize(), -0.6).setY(Math.max(this.pos.y, target.y + 1.5));
        this.steer(_a, 2.5, 4, dt);
        this.mouth = 1; this.hurt = Math.max(this.hurt, 0.3);
        if (this.st > 0.65) { this.swoopDir = _c.copy(target).sub(this.pos).normalize().clone(); this.set('swoop'); this.say('ghost_whoosh', 1.2); this.slimed = new Set(); }
        break;
      }
      case 'swoop': {
        this.vel.copy(this.swoopDir).multiplyScalar(15);
        const heads = ctx.players || [ctx.playerHead];
        heads.forEach((h, i) => { if (!this.slimed.has(i) && this.pos.distanceTo(h) < 1.25) { this.slimed.add(i); ctx.onSlime?.(i); } });
        this.knockProps(0.8, 1.2);
        if (this.st > 1.3) { this.vel.multiplyScalar(0.3); this.set('roam'); }
        break;
      }
      case 'flee': {
        this.jinkT -= dt;
        if (this.jinkT <= 0) { this.jinkT = rnd(0.35, 0.8); this.jink.set(rnd(-1, 1), rnd(-0.4, 0.8), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 7)); }
        _a.copy(this.pos).sub(target).setY(0).normalize().multiplyScalar(7).add(this.jink);
        _a.add(this.pos);
        this.steer(_a, 6.5 - (1 - this.will / 100) * 2.2, 2.8, dt);
        if (this.lastHit > 2.4) this.set(this.anger > 0.3 && this.swoopCd <= 0 && dP < 14 ? 'windup' : 'roam');
        break;
      }
      case 'stagger': {
        this.vel.multiplyScalar(Math.exp(-dt * 3));
        this.vel.y += Math.sin(this.t * 13) * dt * 2;
        if (this.st > 0.7) this.set(this.wranglers.size ? 'wrangled' : 'flee');
        break;
      }
      case 'wrangled': {
        this.wrangledStep(dt, ctx);
        break;
      }
      case 'slammed': {
        const s = this.slam;
        this.vel.copy(s.dir).multiplyScalar(s.speed);
        s.speed = Math.min(26, s.speed + dt * 60);
        if (this.pos.y <= this.radius + 0.15 || this.st > 0.7) {
          this.pos.y = Math.max(this.pos.y, this.radius + 0.1);
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
        if (s >= 1) { this.captured(ctx); }
        break;
      }
    }
    if (this.state !== 'sucked' && this.alive) {
      this.pos.addScaledVector(this.vel, dt);
      const B = this.plate.bounds || { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
      const m = 3;
      if (this.pos.x < B.minX + m) this.vel.x += (B.minX + m - this.pos.x) * dt * 8;
      if (this.pos.x > B.maxX - m) this.vel.x -= (this.pos.x - B.maxX + m) * dt * 8;
      if (this.pos.z < B.minZ + m) this.vel.z += (B.minZ + m - this.pos.z) * dt * 8;
      if (this.pos.z > B.maxZ - m) this.vel.z -= (this.pos.z - B.maxZ + m) * dt * 8;
      const floor = this.state === 'slammed' ? this.radius * 0.6 : this.radius + 0.35;
      if (this.pos.y < floor) { this.pos.y = floor; if (this.vel.y < 0) this.vel.y *= -0.3; }
      if (this.pos.y > 14) this.vel.y -= (this.pos.y - 14) * dt * 4;
      if (this.state !== 'wrangled') this.pos.y += Math.sin(this.t * 2.1) * dt * 0.25;
    }
    this.visuals(dt, target);
  }

  captured(ctx) {
    this.state = 'captured'; this.alive = false; this.obj.visible = false;
    this.presence?.stop(0.3); this.presence = null;
    ctx?.onCaptured?.(this);
  }

  visuals(dt, target) {
    this.obj.position.copy(this.pos);
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (hv > 0.4 && this.state !== 'taunt' && this.state !== 'windup') _a.set(this.vel.x, 0, this.vel.z).normalize();
    else _a.set(target.x - this.pos.x, 0, target.z - this.pos.z).normalize();
    if (_a.lengthSq() > 0.5) this.lookDir.lerp(_a, 1 - Math.exp(-dt * 6)).normalize();
    this.obj.rotation.y = Math.atan2(this.lookDir.x, this.lookDir.z);
    const mood = { eat: 'eat', roam: 'idle', prank: 'taunt', taunt: 'taunt', windup: 'angry', swoop: 'angry', flee: 'flee', stagger: 'hurt', wrangled: 'wrangled', slammed: 'hurt', sucked: 'sucked' }[this.state] || 'idle';
    this.g.update(dt, { vel: this.vel, mood, hurt: this.hurt, struggle: this.struggle, suck: this.suck, trapPos: this.trapPos, mouth: this.mouth });
  }

  toNet() {
    if (!this.active) return { s: 12 };
    const o = { s: STATES.indexOf(this.state), p: [r2(this.pos.x), r2(this.pos.y), r2(this.pos.z)], v: [r2(this.vel.x), r2(this.vel.y), r2(this.vel.z)], w: Math.round(this.will), h: r2(this.hurt), m: r2(this.mouth) };
    if (this.state === 'wrangled') { o.d = [r2(this.sDir.x), r2(this.sDir.y), r2(this.sDir.z)]; o.g = r2(this.sMag); o.n = this.wranglers.size; o.f = {}; for (const [k, w] of this.wranglers) o.f[k] = r2(w.desired.distanceTo(this.pos)); }
    if (this.state === 'sucked' || this.state === 'captured') { o.k = r2(this.suck); o.tp = [r2(this.trapPos.x), r2(this.trapPos.y), r2(this.trapPos.z)]; o.o = this.owner || ''; }
    return o;
  }

  fromNet(o, now) {
    if (!o) return;
    const st = STATES[o.s] || 'off';
    if (st === 'off') { if (this.active) this.deactivate(); return; }
    if (!this.active) { this.active = true; this.alive = true; this.obj.visible = true; }
    const prev = this.state;
    this.state = st;
    this.will = o.w ?? this.will; this.capturable = this.will <= 35;
    this.hurt = Math.max(this.hurt, o.h || 0); this.mouth = Math.max(this.mouth, o.m || 0);
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
