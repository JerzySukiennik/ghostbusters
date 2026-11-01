// Onionhead AI: gorges at the hot-dog cart, roams, pranks props, taunts, swoops to slime the player, flees the stream, gets wrangled, slammed and sucked into the trap.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _c = V();
const rnd = (a, b) => a + Math.random() * (b - a);

export class Ghost {
  constructor({ fx, audio, plate, phys }) {
    this.fx = fx; this.audio = audio; this.plate = plate; this.phys = phys;
    this.g = fx.createGhost();
    this.obj = this.g.object3D;
    this.radius = this.g.radius || 0.6;
    this.home = plate.spawns.ghost?.pos?.clone() || V(0, 4, 20);
    this.cart = plate.spawns.hotdogCart?.pos?.clone() || this.home.clone().setY(1.2);
    this.route = (plate.spawns.ghostRoute || []).map((p) => p.clone());
    if (!this.route.length) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; this.route.push(V(Math.cos(a) * 12, 3.5, 18 + Math.sin(a) * 9)); }
    this.food = plate.props.filter((p) => p.food || /food|hot.?dog|bun|sausage|pretzel|soda|mustard|ketchup/i.test(p.kind + ' ' + p.id));
    if (this.food.length) { const c = this.food[0].object3D.position; if (this.cart.distanceTo(c) > 4) this.cart.set(c.x, Math.max(1, c.y), c.z); }
    this.pos = this.cart.clone().add(V(0, 1.1, 0));
    this.vel = V(); this.want = V(); this.struggle = V(); this.lookDir = V(0, 0, 1);
    this.state = 'eat'; this.st = 0; this.will = 100; this.maxWill = 100;
    this.hurt = 0; this.mouth = 0; this.lastHit = 99; this.wp = 0; this.anger = 0;
    this.prankT = rnd(6, 10); this.tauntT = rnd(10, 16); this.swoopCd = 12; this.eatT = 1; this.jinkT = 0; this.jink = V();
    this.suck = 0; this.trapPos = V(); this.alive = true; this.visible = true;
    this.capturable = false; this.slam = null; this.t = 0;
    this.obj.position.copy(this.pos);
    this.presence = null;
  }

  start() { if (!this.presence) this.presence = this.audio?.loop('ghost_presence', { obj: this.obj, gain: 0.55, ref: 4 }); }

  say(name, gain = 1) { this.audio?.play(name, { obj: this.obj, gain, jitter: 0.12, ref: 4 }); }

  set(s) { if (this.state !== s) { this.state = s; this.st = 0; } }

  hit(amount, dir, kind = 'stream') {
    if (this.state === 'sucked' || this.state === 'captured') return;
    this.will = Math.max(0, this.will - amount);
    this.lastHit = 0;
    this.hurt = Math.min(1, this.hurt + (kind === 'stream' ? 0.08 : 0.9));
    this.anger = Math.min(1, this.anger + amount * 0.01);
    if (kind !== 'stream') { this.vel.addScaledVector(dir, 7); this.say('ghost_hurt'); this.set('stagger'); }
    else if (this.state === 'eat' || this.state === 'roam' || this.state === 'taunt' || this.state === 'prank') { this.say(Math.random() < 0.5 ? 'ghost_hurt' : 'ghost_wail'); this.set('flee'); }
    else if (Math.random() < 0.02) this.say('ghost_hurt', 0.8);
  }

  lock() { this.set('wrangled'); this.say('ghost_roar'); }
  release(heal = 18) { if (this.state === 'wrangled' || this.state === 'slammed') { this.will = Math.min(this.maxWill, this.will + heal); this.say('ghost_laugh'); this.set('flee'); } }

  startSuck(trapPos) { this.trapPos.copy(trapPos); this.set('sucked'); this.suck = 0; this.say('ghost_captured', 1.2); }

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
        p.body.applyImpulse({ x: _b.x * k + this.vel.x * k * 0.2, y: k * 0.5, z: _b.z * k + this.vel.z * k * 0.2 }, true);
        p.body.applyTorqueImpulse({ x: rnd(-1, 1) * k * 0.15, y: rnd(-1, 1) * k * 0.15, z: rnd(-1, 1) * k * 0.15 }, true);
      }
      if (p.breakable && power > 1.5) {
        if (p.damage) p.damage(25 * power, _b.clone()); else { p.hp = (p.hp ?? 30) - 25 * power; if (p.hp <= 0 && p.onBreak) p.onBreak(_b.clone()); }
        if (p.broken || p.dead) this.onWreck?.(p);
      }
    }
  }

  update(dt, ctx) {
    if (!this.alive) return;
    this.t += dt; this.st += dt; this.lastHit += dt;
    this.hurt = Math.max(0, this.hurt - dt * 2.2);
    this.mouth = Math.max(0, this.mouth - dt * 3);
    this.swoopCd -= dt; this.prankT -= dt; this.tauntT -= dt;
    if (this.lastHit > 4 && this.state !== 'wrangled' && this.state !== 'sucked') this.will = Math.min(this.maxWill, this.will + dt * 2.5);
    this.capturable = this.will <= 35;
    const P = ctx.playerHead;
    const toP = _c.copy(P).sub(this.pos); const dP = toP.length();
    switch (this.state) {
      case 'eat': {
        _a.copy(this.cart).add(_b.set(Math.sin(this.t * 0.8) * 0.4, 1.0 + Math.sin(this.t * 1.7) * 0.15, Math.cos(this.t * 0.6) * 0.3));
        this.steer(_a, 2, 3, dt);
        this.eatT -= dt;
        if (this.eatT <= 0) {
          this.eatT = rnd(1.1, 2.0); this.mouth = 1; this.say('ghost_eat', 0.9);
          const f = this.food.find((p) => !p.dead && !p.broken && !p.eaten && p.object3D);
          if (f) { f.eaten = true; f.dead = true; f.object3D.visible = false; try { f.body?.setEnabled(false); } catch {} }
        }
        if (ctx.engaged && (dP < 10 || this.st > 14)) { this.say('ghost_laugh'); this.set('roam'); }
        break;
      }
      case 'roam': {
        const w = this.route[this.wp % this.route.length];
        this.steer(w, 3.6 + this.anger * 2, 1.6, dt);
        if (this.pos.distanceTo(w) < 1.5) this.wp = (this.wp + 1 + (Math.random() < 0.25 ? 1 : 0)) % this.route.length;
        if (this.prankT <= 0) { this.set('prank'); this.prankT = rnd(7, 12); const live = this.plate.props.filter((p) => !p.dead && p.body); this.prankTarget = live.length ? live[(Math.random() * live.length) | 0] : null; }
        else if (this.tauntT <= 0 && ctx.engaged) { this.set('taunt'); this.tauntT = rnd(9, 15); }
        else if (this.swoopCd <= 0 && ctx.engaged && dP < 16 && this.anger > 0.25) { this.set('windup'); this.swoopCd = rnd(11, 16); this.say('ghost_roar'); }
        if (this.state === 'roam' && this.st > 1.2 && Math.random() < dt * 0.15) this.say('ghost_laugh', 0.7);
        break;
      }
      case 'prank': {
        const t = this.prankTarget;
        if (!t || t.dead) { this.set('roam'); break; }
        const tp = t.body.translation();
        _a.set(tp.x, tp.y + 0.6, tp.z);
        this.steer(_a, 7, 3, dt);
        if (this.pos.distanceTo(_a) < 1.3) { this.knockProps(1.6, 2); this.mouth = 1; this.say('ghost_laugh'); this.vel.y += 4; this.set('roam'); }
        if (this.st > 5) this.set('roam');
        break;
      }
      case 'taunt': {
        _a.copy(P).add(_b.set(Math.sin(this.t * 2) * 2.5, 1.2 + Math.sin(this.t * 3) * 0.5, 0)).addScaledVector(toP.normalize(), -4.5);
        this.steer(_a, 6, 3, dt);
        if (this.st > 0.6 && this.st < 0.7) { this.say('ghost_laugh', 1.1); this.mouth = 1; }
        if (this.st > 2.4) this.set('roam');
        break;
      }
      case 'windup': {
        _a.copy(this.pos).addScaledVector(toP.normalize(), -0.6).setY(Math.max(this.pos.y, P.y + 1.5));
        this.steer(_a, 2.5, 4, dt);
        this.mouth = 1; this.hurt = Math.max(this.hurt, 0.3);
        if (this.st > 0.65) { this.swoopDir = _c.copy(P).sub(this.pos).normalize().clone(); this.set('swoop'); this.say('ghost_whoosh', 1.2); this.slimed = false; }
        break;
      }
      case 'swoop': {
        this.vel.copy(this.swoopDir).multiplyScalar(15);
        if (!this.slimed && this.pos.distanceTo(P) < 1.25) { this.slimed = true; ctx.onSlime?.(); }
        this.knockProps(0.8, 1.2);
        if (this.st > 1.3) { this.vel.multiplyScalar(0.3); this.set('roam'); }
        break;
      }
      case 'flee': {
        this.jinkT -= dt;
        if (this.jinkT <= 0) { this.jinkT = rnd(0.35, 0.8); this.jink.set(rnd(-1, 1), rnd(-0.4, 0.8), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 7)); }
        _a.copy(this.pos).sub(P).setY(0).normalize().multiplyScalar(7).add(this.jink);
        _a.add(this.pos);
        this.steer(_a, 6.5 - (1 - this.will / 100) * 2.2, 2.8, dt);
        if (this.lastHit > 2.4) this.set(this.anger > 0.3 && this.swoopCd <= 0 && dP < 14 ? 'windup' : 'roam');
        break;
      }
      case 'stagger': {
        this.vel.multiplyScalar(Math.exp(-dt * 3));
        this.vel.y += Math.sin(this.t * 13) * dt * 2;
        if (this.st > 0.7) this.set('flee');
        break;
      }
      case 'wrangled': {
        this.vel.lerp(_a.copy(ctx.wrangle?.vel || this.vel), 1);
        if (Math.random() < dt * 0.5) this.say(Math.random() < 0.5 ? 'ghost_wail' : 'ghost_hurt', 0.9);
        break;
      }
      case 'slammed': {
        const s = this.slam;
        this.vel.copy(s.dir).multiplyScalar(s.speed);
        s.speed = Math.min(26, s.speed + dt * 60);
        if (this.pos.y <= this.radius + 0.15 || this.st > 0.7) {
          this.pos.y = Math.max(this.pos.y, this.radius + 0.1);
          ctx.onSlam?.(this.pos.clone());
          this.knockProps(3.2, 3);
          this.vel.set(0, 3, 0);
          this.set(ctx.wrangling ? 'wrangled' : 'stagger');
        }
        break;
      }
      case 'sucked': {
        this.suck = Math.min(1, this.suck + dt / 1.7);
        const s = this.suck, ang = s * 14;
        _a.copy(this.trapPos).add(_b.set(Math.cos(ang) * (1 - s) * 0.8, 0.25 + (1 - s) * 2.4, Math.sin(ang) * (1 - s) * 0.8));
        this.pos.lerp(_a, 1 - Math.exp(-dt * 9));
        this.vel.set(0, 0, 0);
        if (s >= 1) { this.state = 'captured'; this.alive = false; this.obj.visible = false; this.presence?.stop(0.3); ctx.onCaptured?.(); }
        break;
      }
    }
    if (this.state !== 'sucked') {
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
    this.obj.position.copy(this.pos);
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (hv > 0.4 && this.state !== 'taunt' && this.state !== 'windup') _a.set(this.vel.x, 0, this.vel.z).normalize();
    else _a.copy(toP.set(P.x - this.pos.x, 0, P.z - this.pos.z)).normalize();
    if (_a.lengthSq() > 0.5) this.lookDir.lerp(_a, 1 - Math.exp(-dt * 6)).normalize();
    this.obj.rotation.y = Math.atan2(this.lookDir.x, this.lookDir.z);
    const mood = { eat: 'eat', roam: 'idle', prank: 'taunt', taunt: 'taunt', windup: 'angry', swoop: 'angry', flee: 'flee', stagger: 'hurt', wrangled: 'wrangled', slammed: 'hurt', sucked: 'sucked' }[this.state] || 'idle';
    this.g.update(dt, { vel: this.vel, mood, hurt: this.hurt, struggle: this.struggle, suck: this.suck, trapPos: this.trapPos, mouth: this.mouth });
  }
}
