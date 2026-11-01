// On-foot Ghostbuster: Rapier character controller, facing, strafe hips, aim spine and two-handed wand hold through arm IK.
import * as THREE from 'three';
import { G, groups } from '../engine/physics.js';
import { WandHold } from './hold.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);
const _w = V(), _f = V(), _r = V(), _a = V(), _b = V(), _c = V(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Player {
  constructor(phys, avatar, spawn, yaw = 0) {
    const R = phys.RAPIER, w = phys.world;
    this.phys = phys; this.avatar = avatar;
    this.radius = 0.28; this.half = 0.57;
    const y = spawn.y + this.half + this.radius + 0.02;
    this.body = w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, y, spawn.z));
    this.col = w.createCollider(R.ColliderDesc.capsule(this.half, this.radius).setCollisionGroups(groups(G.PLAYER, G.STATIC | G.PROP | G.VEHICLE)), this.body);
    phys.own(this.col, { kind: 'player', player: this });
    this.kcc = w.createCharacterController(0.03);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setMaxSlopeClimbAngle(0.9); this.kcc.setMinSlopeSlideAngle(0.6);
    this.kcc.enableAutostep(0.32, 0.18, true);
    this.kcc.enableSnapToGround(0.35);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setCharacterMass(85);
    this.vel = V(); this.yaw = yaw; this.grounded = true; this.vy = 0;
    this.feet = V(spawn.x, spawn.y, spawn.z); this.prev = this.feet.clone(); this.cur = this.feet.clone();
    this.mode = 'foot'; this.speed = 0; this.moveRel = 0; this.animDir = 1; this.hipOff = 0;
    this.stun = 0; this.packed = false;
    this.hold = new WandHold();
    this.wand = this.hold;
    this.aimPoint = V(0, 1, 10);
    this.lean = 0; this.shake = 0;
    avatar.object.position.copy(this.feet); avatar.object.rotation.y = yaw;
  }

  teleport(p, yaw) {
    this.body.setTranslation({ x: p.x, y: p.y + this.half + this.radius + 0.02, z: p.z }, true);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + this.half + this.radius + 0.02, z: p.z });
    this.feet.copy(p); this.prev.copy(p); this.cur.copy(p); this.vel.set(0, 0, 0); this.vy = 0;
    if (yaw !== undefined) this.yaw = yaw;
  }

  setActive(on) {
    this.col.setEnabled(on);
    this.avatar.object.visible = true;
  }

  step(dt, it) {
    if (this.mode !== 'foot') return;
    this.prev.copy(this.cur);
    const pack = this.packed ? 0.87 : 1;
    const top = it.aim ? 1.9 : it.sprint ? 5.6 * pack : 3.35 * pack;
    _f.set(Math.sin(it.camYaw), 0, Math.cos(it.camYaw)); _r.set(-Math.cos(it.camYaw), 0, Math.sin(it.camYaw));
    _w.set(0, 0, 0).addScaledVector(_f, it.move.z).addScaledVector(_r, it.move.x);
    if (_w.lengthSq() > 1) _w.normalize();
    if (this.stun > 0 || it.locked) _w.set(0, 0, 0);
    _w.multiplyScalar(top * (it.walk ? 0.45 : 1));
    const acc = this.grounded ? (_w.lengthSq() > 0.01 ? 16 : 20) : 3;
    _a.set(this.vel.x, 0, this.vel.z);
    _b.copy(_w).sub(_a);
    const dv = Math.min(_b.length(), acc * dt);
    if (_b.lengthSq() > 1e-8) _a.addScaledVector(_b.normalize(), dv);
    this.vel.x = _a.x; this.vel.z = _a.z;
    if (this.grounded && it.jump && this.stun <= 0 && !it.locked) { this.vy = this.packed ? 3.9 : 4.6; this.grounded = false; this.jumped = true; }
    this.vy = this.grounded && this.vy < 0 ? -1 : this.vy - 17 * dt;
    _c.set(this.vel.x * dt, this.vy * dt, this.vel.z * dt);
    this.kcc.computeColliderMovement(this.col, _c, undefined, groups(G.PLAYER, G.STATIC | G.PROP | G.VEHICLE));
    const m = this.kcc.computedMovement();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    const was = this.grounded;
    this.grounded = this.kcc.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = 0;
    if (!was && this.grounded) this.landed = this.lastVy;
    this.lastVy = this.vy;
    if (dt > 0) { this.vel.x = m.x / dt; this.vel.z = m.z / dt; }
    this.cur.set(t.x + m.x, t.y + m.y - this.half - this.radius - 0.02, t.z + m.z);
    if (this.cur.y < -30) this.teleport(this.spawn || V(0, 0, 0), this.yaw);
  }

  update(dt, alpha, it) {
    this.stun = Math.max(0, this.stun - dt);
    if (this.mode === 'foot') this.feet.lerpVectors(this.prev, this.cur, alpha);
    const hv = Math.hypot(this.vel.x, this.vel.z);
    this.speed += (hv - this.speed) * Math.min(1, dt * 12);
    let target = this.yaw;
    if (it.face !== undefined) target = it.face;
    else if (hv > 0.25) target = Math.atan2(this.vel.x, this.vel.z);
    const rate = it.aim ? 18 : 11;
    this.yaw += THREE.MathUtils.clamp(wrap(target - this.yaw), -rate * dt, rate * dt);
    const mv = hv > 0.3 ? Math.atan2(this.vel.x, this.vel.z) : this.yaw;
    const rel = wrap(mv - this.yaw);
    let off = 0, dir = 1;
    if (hv > 0.3 && it.aim) {
      if (Math.abs(rel) > 1.95) { dir = -1; off = wrap(rel - Math.PI); } else off = THREE.MathUtils.clamp(rel, -1.25, 1.25);
    }
    this.hipOff += (off - this.hipOff) * Math.min(1, dt * 8);
    this.animDir = dir;
    if (this.mode === 'car') return;
    this.avatar.object.position.copy(this.feet);
    this.avatar.object.rotation.set(0, this.yaw, 0);
  }

  pose(dt, it) {
    this.hold.apply(this.avatar, dt, { ...it, hipOff: this.hipOff, aimPoint: this.aimPoint });
  }
}
