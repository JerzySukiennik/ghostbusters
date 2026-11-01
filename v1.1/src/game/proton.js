// Proton stream gameplay: whippy lagging blast, damage and prop physics, capture lock, wrangling with struggle and tension, slams, boson darts.
import * as THREE from 'three';
import { G } from '../engine/physics.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V();
const RANGE = 22;

function raySphere(o, d, c, r, maxT) {
  _e.copy(o).sub(c);
  const b = _e.dot(d), cc = _e.dot(_e) - r * r, h = b * b - cc;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t >= 0 && t <= maxT ? t : -1;
}

function segSphere(a, b, c, r) {
  _e.copy(b).sub(a);
  const L2 = _e.lengthSq();
  const t = L2 > 0 ? THREE.MathUtils.clamp(_d.copy(c).sub(a).dot(_e) / L2, 0, 1) : 0;
  return _d.copy(a).addScaledVector(_e, t).distanceTo(c) <= r;
}

export class Proton {
  constructor({ fx, gear, phys, ghost, plate, audio, renderer, rig, hud }) {
    Object.assign(this, { fx, gear, phys, ghost, plate, audio, renderer, rig, hud });
    this.stream = fx.createStream();
    this.on = false; this.mode = 'blast'; this.t = 0;
    this.aim = V(); this.end = V(); this.endV = V(); this.endN = V(0, 1, 0); this.endKind = 'air'; this.dir = V(0, 0, 1);
    this.onGhostT = 0; this.tension = 0; this.lockD = 6; this.desired = V();
    this.sDir = V(); this.sT = 0; this.sMag = 0; this.counter = 0;
    this.slamCd = 0; this.dartCd = 0; this.sparkT = 0; this.scorchT = 0; this.crackT = 0;
    this.darts = [];
    this.snd = {};
    this.stats = { damage: 0, darts: 0, slams: 0 };
    this.dartMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 4.5, 2) });
    this.dartGeo = new THREE.SphereGeometry(0.11, 12, 8);
    this.pool = [];
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(this.dartGeo, this.dartMat); m.visible = false; this.pool.push(m); }
  }

  attachPool(scene) { for (const m of this.pool) if (!m.parent) scene.add(m); }

  get wrangling() { return this.on && this.mode === 'capture'; }

  stopAll() {
    if (this.on) this.audio?.play('stream_stop', { obj: this.gear.wand });
    this.on = false; this.mode = 'blast'; this.tension = 0; this.onGhostT = 0;
    for (const k of ['loop', 'cap', 'hit']) { this.snd[k]?.stop(0.12); this.snd[k] = null; }
    if (this.ghost.state === 'wrangled') this.ghost.release(10);
  }

  update(dt, c) {
    this.t += dt;
    this.slamCd = Math.max(0, this.slamCd - dt); this.dartCd = Math.max(0, this.dartCd - dt);
    const gear = this.gear, ghost = this.ghost;
    const can = gear.canFire() && c.enabled;
    const camPos = c.camPos, camDir = c.camDir;
    const startT = Math.max(0, c.camPos.distanceTo(c.pivot) - 0.2);
    let aimT = 40;
    const gh = !this.wrangling && ghost.alive && ghost.visible ? raySphere(camPos, camDir, ghost.pos, ghost.radius * 1.15, 60) : -1;
    _a.copy(camPos).addScaledVector(camDir, startT);
    const h = this.phys.cast(_a, camDir, 40, G.STATIC | G.PROP | G.VEHICLE | G.DEBRIS);
    if (h) aimT = startT + h.dist;
    if (gh > startT && gh < aimT) aimT = gh;
    this.aim.copy(camPos).addScaledVector(camDir, aimT);
    c.aimOut.copy(this.aim);
    if (c.fire && can && !this.on) this.begin(c);
    if ((!c.fire || !can) && this.on) this.stopAll();
    if (c.rmb && can && !this.wrangling && this.dartCd <= 0) this.fireDart(c);
    this.updateDarts(dt, c);
    if (!this.on) { this.stream.update(dt, { on: false }); return; }
    const tip = c.tip;
    this.dir.copy(c.wandDir);
    if (this.mode === 'blast') this.blast(dt, c, tip);
    else this.capture(dt, c, tip);
    this.stream.update(dt, { on: true, mode: this.mode, origin: tip, dir: this.dir, end: this.end, endNormal: this.endN, endKind: this.endKind, heat: gear.heat, tension: this.tension, ghostPos: ghost.pos });
    gear.addHeat(dt * (this.mode === 'capture' ? 0.052 : 0.072));
    this.renderer.addTrauma(dt * (this.mode === 'capture' ? 0.9 + this.tension * 1.4 : 0.55));
    this.snd.loop?.pos(tip);
    this.snd.cap?.pos(tip);
    this.crackT -= dt;
    if (this.crackT <= 0) { this.crackT = 0.12 + Math.random() * 0.3; this.audio?.play(Math.random() < 0.3 ? 'zap' : 'stream_crackle', { pos: Math.random() < 0.5 ? tip : this.end, gain: 0.55, jitter: 0.25 }); }
  }

  begin(c) {
    this.on = true; this.mode = 'blast'; this.onGhostT = 0;
    this.end.copy(c.tip).addScaledVector(c.wandDir, 1.5); this.endV.set(0, 0, 0);
    this.audio?.play('stream_start', { pos: c.tip, gain: 1 });
    this.snd.loop = this.audio?.loop('stream_loop', { pos: c.tip, gain: 0.9, fadeIn: 0.08 });
    this.rig.kick.addScaledVector(c.camDir, -0.12);
    this.renderer.addTrauma(0.25);
  }

  blast(dt, c, tip) {
    const ghost = this.ghost;
    _a.copy(this.aim).sub(tip);
    const L = Math.min(RANGE, _a.length());
    _a.normalize();
    const h = this.phys.cast(tip, _a, L, G.STATIC | G.PROP | G.VEHICLE | G.DEBRIS);
    _b.copy(tip).addScaledVector(_a, h ? h.dist : L);
    const k = 1 - Math.exp(-dt * 26);
    this.endV.copy(_b).sub(this.end).multiplyScalar(k / Math.max(dt, 1e-4));
    this.end.lerp(_b, k);
    this.endKind = h ? 'surface' : 'air';
    if (h) this.endN.copy(h.normal); else this.endN.copy(_a).negate();
    let onGhost = false;
    if (ghost.alive && ghost.state !== 'sucked') {
      onGhost = segSphere(tip, this.end, ghost.pos, ghost.radius + 0.5) || this.end.distanceTo(ghost.pos) < ghost.radius + 0.9;
    }
    if (onGhost) {
      this.endKind = 'ghost';
      this.end.lerp(ghost.pos, 1 - Math.exp(-dt * 12));
      const dmg = 13.5 * dt;
      ghost.hit(dmg, _a); this.stats.damage += dmg;
      this.onGhostT += dt;
      this.sparkT -= dt;
      if (this.sparkT <= 0) { this.sparkT = 0.05; this.fx.impact(ghost.pos.clone().addScaledVector(_a, -ghost.radius * 0.8), _a.clone().negate(), 'ghostHit'); }
      if (ghost.capturable && this.onGhostT > 0.22) this.lock(tip);
    } else {
      this.onGhostT = Math.max(0, this.onGhostT - dt * 2);
      if (h) this.hitSurface(dt, h, _a);
    }
    this.hitSound(!onGhost && !!h);
  }

  hitSurface(dt, h, dir) {
    this.sparkT -= dt; this.scorchT -= dt;
    if (!this.fx.ownsStreamImpacts) {
      if (this.sparkT <= 0) { this.sparkT = 0.045; this.fx.impact(this.end.clone(), h.normal.clone(), 'spark'); }
      if (this.scorchT <= 0) { this.scorchT = 0.09; this.fx.impact(this.end.clone(), h.normal.clone(), 'scorch'); }
    }
    const p = h.owner;
    if (p && p.body && !p.dead && !p.broken && p.kind !== 'ecto' && p.kind !== 'player') {
      if (p.body.isDynamic && p.body.isDynamic()) {
        const m = Math.max(2, p.mass || p.body.mass() || 10);
        const k = Math.min(260, m * 9) * dt;
        p.body.applyImpulseAtPoint({ x: dir.x * k, y: dir.y * k + k * 0.45, z: dir.z * k }, { x: this.end.x, y: this.end.y, z: this.end.z }, true);
      }
      if (p.breakable) this.wreck(p, 34 * dt, dir);
    } else if (h.owner && h.owner.kind === 'ecto' && this.t - (this.carT || -9) > 6) {
      this.carT = this.t;
      this.hud?.toast?.('Not the car!', 1.2);
    }
  }

  wreck(p, amount, dir) {
    if (p.dead || p.broken) return;
    if (p.damage) p.damage(amount, dir.clone());
    else { p.hp = (p.hp ?? 40) - amount; if (p.hp <= 0 && p.onBreak) p.onBreak(dir.clone()); }
    if (p.dead || p.broken || (p.hp !== undefined && p.hp <= 0)) {
      this.hud?.damage?.(p);
      this.audio?.play(p.material === 'glass' ? 'break_glass' : p.material === 'wood' ? 'break_wood' : p.material === 'plastic' ? 'hit_plastic' : 'hit_metal', { pos: this.end });
    }
  }

  hitSound(on) {
    if (on && !this.snd.hit) this.snd.hit = this.audio?.loop('stream_hit_loop', { pos: this.end, gain: 0.7, fadeIn: 0.05 });
    if (!on && this.snd.hit) { this.snd.hit.stop(0.1); this.snd.hit = null; }
    this.snd.hit?.pos(this.end);
  }

  lock(tip) {
    this.mode = 'capture'; this.tension = 0;
    this.lockD = THREE.MathUtils.clamp(this.ghost.pos.distanceTo(tip), 3.5, 10);
    this.ghost.lock();
    this.snd.loop?.gain(0.35, 0.15);
    this.snd.cap = this.audio?.loop('stream_capture_loop', { pos: tip, gain: 0.95, fadeIn: 0.15 });
    this.hitSound(false);
    this.renderer.addTrauma(0.45); this.renderer.addFlash(0.05); this.renderer.hitStop(0.05, 0.15);
    this.hud?.toast?.('Wrangle it!', 1.4);
    this.sT = 0;
  }

  capture(dt, c, tip) {
    const ghost = this.ghost;
    if (ghost.state !== 'wrangled' && ghost.state !== 'slammed') { this.stopAll(); return; }
    this.lockD = THREE.MathUtils.clamp(this.lockD - c.wheel * 0.6, 3, 11);
    const cam0 = c.camPos.distanceTo(c.pivot);
    let D = cam0 + this.lockD;
    _a.copy(c.camPos).addScaledVector(c.camDir, cam0);
    const gh = this.phys.cast(_a, c.camDir, this.lockD + 1.5, G.STATIC | G.PROP | G.VEHICLE);
    if (gh) D = Math.min(D, cam0 + gh.dist);
    this.desired.copy(c.camPos).addScaledVector(c.camDir, D);
    if (gh && gh.normal.y > 0.6) this.desired.y += 1.25;
    if (this.desired.y < ghost.radius + 0.45) this.desired.y = ghost.radius + 0.45;
    if (c.trapOpen) {
      const hx = this.desired.x - c.trapPos.x, hz = this.desired.z - c.trapPos.z, hd = Math.hypot(hx, hz);
      if (hd < 2.6) { const k = 0.65 * (1 - hd / 2.6); this.desired.x -= hx * k; this.desired.z -= hz * k; this.desired.y += (c.trapPos.y + 1.35 - this.desired.y) * k; }
    }
    this.sT -= dt;
    const w01 = THREE.MathUtils.clamp(ghost.will / 35, 0, 1);
    if (this.sT <= 0) {
      this.sT = 0.7 + Math.random() * 0.7;
      this.sDir.set(Math.random() - 0.5, (Math.random() - 0.35) * 0.7, Math.random() - 0.5);
      _a.copy(ghost.pos).sub(c.pivot).setY(0).normalize();
      this.sDir.addScaledVector(_a, 0.5);
      if (c.trapOpen) { _b.copy(ghost.pos).sub(c.trapPos).setY(0).normalize(); this.sDir.addScaledVector(_b, 0.8); }
      this.sDir.normalize();
      this.sMag = 8 + 9 * w01;
      this.ghost.say('ghost_wail', 0.6);
    }
    const sx = this.sDir.dot(c.camRight), sy = this.sDir.y;
    const fl = c.flick, fm = Math.hypot(fl.x, fl.y);
    this.counter = fm > 2 ? THREE.MathUtils.clamp(-(fl.x * sx - fl.y * sy) / (fm * Math.max(0.2, Math.hypot(sx, sy))), -1, 1) : 0;
    const resist = this.counter > 0.25 ? 0.35 : 1;
    const vel = ghost.vel;
    _a.copy(this.desired).sub(ghost.pos).multiplyScalar(17).addScaledVector(vel, -5.5).addScaledVector(this.sDir, this.sMag * resist);
    if (c.trapOpen && c.inCone) _a.addScaledVector(_b.copy(c.trapPos).sub(ghost.pos), 3.2);
    vel.addScaledVector(_a, dt);
    ghost.struggle.copy(this.sDir).multiplyScalar(this.sMag * resist / 17);
    const off = ghost.pos.distanceTo(this.desired);
    this.tension = THREE.MathUtils.clamp(this.tension + (off > 1.35 ? (off - 1.35) * 0.42 : -0.32) * dt + (this.counter > 0.25 ? -0.25 * dt : 0), 0, 1);
    ghost.will = Math.max(0, ghost.will - dt * (this.counter > 0.25 ? 6.5 : 2.6));
    this.end.copy(ghost.pos); this.endKind = 'ghost'; this.endN.copy(this.dir).negate();
    this.sparkT -= dt;
    if (this.sparkT <= 0) { this.sparkT = 0.07; this.fx.impact(ghost.pos.clone(), this.dir.clone().negate(), 'ghostHit'); }
    if (c.pull) c.pull(_c.copy(ghost.pos).sub(c.pivot).setY(0).normalize().multiplyScalar(this.tension * 1.6));
    if (c.rmb && this.slamCd <= 0) this.doSlam(c);
    if (this.tension >= 1) {
      this.hud?.toast?.('It broke free!', 1.4);
      this.gear.addHeat(0.12);
      this.renderer.addTrauma(0.6);
      ghost.release(16);
      this.stopAll();
    }
  }

  doSlam(c) {
    const fl = c.flick, fm = Math.hypot(fl.x, fl.y);
    _a.set(0, -1, 0);
    if (fm > 3) _a.copy(c.camRight).multiplyScalar(fl.x / fm).addScaledVector(V(0, -1, 0), Math.max(0.6, fl.y / fm + 0.4));
    _a.normalize();
    this.ghost.slam = { dir: _a.clone(), speed: 12 };
    this.ghost.set('slammed');
    this.slamCd = 1.0; this.stats.slams++;
    this.tension = Math.max(0, this.tension - 0.35);
    this.audio?.play('stream_start', { pos: c.tip, gain: 0.7, rate: 0.8 });
    this.renderer.addTrauma(0.3);
  }

  onSlam(pos) {
    this.fx.impact(pos, V(0, 1, 0), 'slam');
    this.phys.explode(pos, 4, 70);
    this.renderer.addTrauma(0.75); this.renderer.addFlash(0.08); this.renderer.hitStop(0.075);
    this.audio?.play('hit_metal', { pos, gain: 1.2 }); this.audio?.play('debris_small', { pos });
    this.ghost.will = Math.max(0, this.ghost.will - 11);
    this.ghost.hurt = 1;
    this.ghost.say('ghost_hurt', 1.1);
  }

  fireDart(c) {
    const m = this.pool.find((x) => !x.visible);
    if (!m) return;
    this.dartCd = 1.15; this.stats.darts++;
    this.gear.addHeat(0.2);
    m.visible = true; m.position.copy(c.tip);
    _a.copy(this.aim).sub(c.tip).normalize();
    this.darts.push({ m, v: _a.clone().multiplyScalar(44), life: 1.2 });
    this.audio?.play('stream_start', { pos: c.tip, gain: 0.9, rate: 1.35 });
    this.audio?.play('zap', { pos: c.tip });
    this.rig.kick.addScaledVector(c.camDir, -0.22);
    this.renderer.addTrauma(0.3);
  }

  updateDarts(dt, c) {
    for (let i = this.darts.length - 1; i >= 0; i--) {
      const d = this.darts[i];
      d.life -= dt;
      const step = d.v.length() * dt;
      _b.copy(d.v).normalize();
      const h = this.phys.cast(d.m.position, _b, step, G.STATIC | G.PROP | G.VEHICLE | G.DEBRIS);
      const gt = this.ghost.alive ? raySphere(d.m.position, _b, this.ghost.pos, this.ghost.radius + 0.35, step) : -1;
      let boom = null;
      if (gt >= 0) boom = d.m.position.clone().addScaledVector(_b, gt);
      else if (h) boom = h.point.clone();
      else if (d.life <= 0) boom = d.m.position.clone();
      d.m.position.addScaledVector(d.v, dt);
      d.m.scale.setScalar(1 + Math.sin(this.t * 60) * 0.25);
      if (boom) {
        d.m.visible = false; this.darts.splice(i, 1);
        this.fx.impact(boom, h ? h.normal.clone() : _b.clone().negate(), 'slam');
        this.phys.explode(boom, 3.6, 55);
        const dg = this.ghost.pos.distanceTo(boom);
        if (this.ghost.alive && dg < 2.8 && !this.wrangling) { this.ghost.hit(17 * (1 - dg / 3.2), _b.clone(), 'dart'); this.stats.damage += 17; }
        this.renderer.addTrauma(0.45); this.renderer.addFlash(0.06);
        this.audio?.play('hit_metal', { pos: boom, gain: 0.8 }); this.audio?.play('zap', { pos: boom });
        for (const p of this.plate.props) {
          if (!p.breakable || p.dead || p.broken || !p.body) continue;
          const t = p.object3D ? p.object3D.position : p.body.translation();
          if (Math.hypot(t.x - boom.x, t.y - boom.y, t.z - boom.z) < 2.2) this.wreck(p, 45, _b);
        }
      }
    }
  }
}
