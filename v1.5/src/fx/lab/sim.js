// Lab behaviour sim: a stand-in for the lead's Ghost (same fields and call order) that runs src/ghosts/<type>.js live, with fake props, one fake player and periodic fake stream hits.
import * as THREE from 'three';
import { behaviour } from '../../ghosts/index.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _c = V();
const rnd = (a, b) => a + Math.random() * (b - a);
const MOOD = { eat: 'eat', roam: 'idle', prank: 'taunt', taunt: 'taunt', windup: 'angry', swoop: 'angry', flee: 'flee', stagger: 'hurt', wrangled: 'wrangled', slammed: 'hurt', sucked: 'sucked' };

class MockGhost {
  constructor(beh, id, home, route, props) {
    this.beh = beh; this.type = beh.type; this.id = id;
    this.radius = beh.radius; this.maxWill = beh.will;
    this.cart = home.clone(); this.home = home.clone(); this.route = route;
    this.food = []; this.plate = { props };
    this.pos = V(); this.vel = V(); this.lookDir = V(0, 0, 1); this.struggle = V(); this.trapPos = V();
    this.yaw = 0;
    this.reset();
  }

  reset() {
    this.state = 'eat'; this.st = 0; this.t = 0; this.wp = (this.id * 3) % this.route.length;
    this.pos.copy(this.home).add(_a.set(Math.sin(this.id * 2.4) * 1.2, 1 + this.id * 0.2, Math.cos(this.id * 2.4) * 1.2));
    this.vel.set(0, 0, 0);
    this.will = this.maxWill; this.hurt = 0; this.mouth = 0; this.lastHit = 99; this.anger = 0.1;
    this.prankT = rnd(4, 8); this.tauntT = rnd(5, 9); this.swoopCd = rnd(6, 10); this.eatT = 1;
    this.active = true; this.alive = true; this.suck = 0;
    this.jink = V(); this.jinkT = 0;
    if (this.beh.init) this.beh.init(this, {});
  }

  get gone() { return !this.alive; }
  set(s) { if (this.state !== s) { this.state = s; this.st = 0; } }
  say() { }
  knockProps() { }
  steer(target, speed, k, dt) {
    _a.copy(target).sub(this.pos);
    const d = _a.length();
    if (d > 1e-3) _a.multiplyScalar(Math.min(speed, d * 2) / d);
    this.vel.lerp(_a, 1 - Math.exp(-dt * k));
  }

  hit(amount) {
    this.lastHit = 0; this.hurt = Math.min(1, this.hurt + 0.08); this.anger = Math.min(1, this.anger + amount * 0.01);
    if (this.beh.hit) this.beh.hit(this, amount);
    if (this.state === 'eat' || this.state === 'roam' || this.state === 'taunt' || this.state === 'prank') this.set('flee');
  }

  fallback(dt, target) {
    switch (this.state) {
      case 'flee': {
        this.jinkT -= dt;
        if (this.jinkT <= 0) { this.jinkT = rnd(0.35, 0.8); this.jink.set(rnd(-1, 1), rnd(-0.4, 0.8), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 7)); }
        _a.copy(this.pos).sub(target).setY(0).normalize().multiplyScalar(7).add(this.jink).add(this.pos);
        this.steer(_a, 6, 2.8, dt);
        if (this.lastHit > 2.4) this.set('roam');
        break;
      }
      default: this.set('roam');
    }
  }

  update(dt, ctx) {
    this.t += dt; this.st += dt; this.lastHit += dt;
    this.hurt = Math.max(0, this.hurt - dt * 2.2);
    this.mouth = Math.max(0, this.mouth - dt * 3);
    this.swoopCd -= dt; this.prankT -= dt; this.tauntT -= dt;
    const target = ctx.players[0];
    if (!this.beh.step(this, dt, ctx)) this.fallback(dt, target);
    this.pos.addScaledVector(this.vel, dt);
    const B = 13;
    if (Math.abs(this.pos.x) > B) this.vel.x -= Math.sign(this.pos.x) * (Math.abs(this.pos.x) - B) * dt * 8;
    if (this.pos.z > 4) this.vel.z -= (this.pos.z - 4) * dt * 8;
    if (this.pos.z < -20) this.vel.z += (-20 - this.pos.z) * dt * 8;
    const floor = this.beh.floor ?? this.radius + 0.35;
    if (this.pos.y < floor) { this.pos.y = floor; if (this.vel.y < 0) this.vel.y *= -0.3; }
    if (this.pos.y > 7) this.vel.y -= (this.pos.y - 7) * dt * 4;
    if (!this.beh.ground && this.state !== 'wrangled') this.pos.y += Math.sin(this.t * 2.1) * dt * 0.25;
    if (this.beh.face && this.beh.face(this, _b)) { if (_b.lengthSq() > 0.5) this.lookDir.lerp(_b, 1 - Math.exp(-dt * 8)).normalize(); }
    else {
      const hv = Math.hypot(this.vel.x, this.vel.z);
      if (hv > 0.4 && this.state !== 'taunt' && this.state !== 'windup') _b.set(this.vel.x, 0, this.vel.z).normalize();
      else _b.set(target.x - this.pos.x, 0, target.z - this.pos.z).normalize();
      if (_b.lengthSq() > 0.5) this.lookDir.lerp(_b, 1 - Math.exp(-dt * 6)).normalize();
    }
    this.yaw = Math.atan2(this.lookDir.x, this.lookDir.z);
  }

  params(gp) {
    gp.mood = this.beh.mood ? this.beh.mood(this) : MOOD[this.state] || 'idle';
    gp.hurt = this.hurt; gp.mouth = this.mouth; gp.suck = 0;
    gp.vel.copy(this.vel);
    gp.x = this.fxx || null;
    return gp;
  }
}

export function makeSim(type, director) {
  const beh = behaviour(type);
  const fx = director.fx;
  const ground = beh.ground || beh.floor;
  const route = [];
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; route.push(V(Math.cos(a) * 8, ground ? 0 : 2.6 + Math.sin(a * 2) * 0.8, -7 + Math.sin(a) * 6)); }
  const props = [V(-4, 0.4, -6), V(3.5, 0.4, -9), V(-1, 0.4, -12), V(5, 0.4, -4)].map((p) => ({ object3D: { position: p }, body: {}, dead: false }));
  const home = V(-1, 0, -6);
  const n = type === 'swarm' ? 5 : 1;
  const ghosts = [];
  for (let i = 0; i < n; i++) ghosts.push(new MockGhost(beh, i, home, route, props));
  const extras = [];
  for (let i = 1; i < n; i++) { const g = fx.createGhost(type); if (g.setTint) g.setTint(i); extras.push(g); }
  if (director.ghost.setTint) director.ghost.setTint(0);
  const player = V(0.6, 1.7, 3.0);
  const ctx = { players: [player], engaged: true, ghosts, props, onSlime: (i, g) => { fx.impact(g.pos, _c.set(0, 1, 0), 'slime'); }, onBook: null, groundAt: () => 0 };
  const gps = extras.map(() => ({ vel: V(), mood: 'idle', hurt: 0, struggle: V(), suck: 0, trapPos: V(), mouth: 0, x: null }));
  let hitT = 9;
  const sim = {
    type,
    ghost: { pos: ghosts[0].pos, vel: ghosts[0].vel, yaw: 0 },
    step(dt, gp) {
      hitT -= dt;
      if (hitT < 0) {
        const k = (Math.random() * ghosts.length) | 0;
        ghosts[k].hit(4);
        if (hitT < -1.2) hitT = rnd(10, 15);
      }
      for (const g of ghosts) g.update(dt, ctx);
      ghosts[0].params(gp);
      this.ghost.yaw = ghosts[0].yaw;
      for (let i = 0; i < extras.length; i++) {
        const g = ghosts[i + 1], o = extras[i].object3D;
        o.position.copy(g.pos);
        o.rotation.set(0, g.yaw, 0);
        o.visible = true;
        extras[i].update(dt, g.params(gps[i]));
      }
    },
    dispose() { for (const g of extras) fx.releaseGhost(g); extras.length = 0; },
  };
  return sim;
}
