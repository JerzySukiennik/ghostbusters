// Third-person camera rig: over-the-shoulder on foot, tighter when aiming, spring chase for the Ecto-1, scripted cinematic shots.
import * as THREE from 'three';
import { G } from '../engine/physics.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _p = V(), _d = V(), _r = V(), _c = V(), _t = V(), _f = V();

export class CameraRig {
  constructor(camera, physics) {
    this.cam = camera; this.phys = physics;
    this.yaw = 0; this.pitch = -0.12; this.dist = 3.2; this.side = 0.5;
    this.mode = 'foot'; this.fov = 62; this.blend = 1;
    this.pos = V(); this.look = V(); this.carPos = V(); this.carLook = V(); this.carInit = false;
    this.cine = null; this.cineT = 0; this.from = { pos: V(), look: V() };
    this.orbit = 0; this.orbitIdle = 0; this.kick = V();
    this.forward = V(0, 0, 1);
  }

  input(dx, dy, sens = 0.0021) {
    if (this.mode === 'cine') return;
    if (this.mode === 'car') { this.orbit = THREE.MathUtils.clamp(this.orbit - dx * sens, -Math.PI, Math.PI); this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens, -0.6, 0.5); this.orbitIdle = 0; return; }
    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens, -1.15, 0.95);
  }

  dir(out = V()) { return out.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)); }
  right(out = V()) { return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); }

  startCine(shot) {
    this.from.pos.copy(this.cam.position); this.cam.getWorldDirection(_f); this.from.look.copy(this.cam.position).addScaledVector(_f, 4);
    this.cine = shot; this.cineT = 0; this.mode = 'cine';
  }

  endCine(mode = 'foot') { this.cine = null; this.mode = mode; this.blend = 0; this.from.pos.copy(this.cam.position); this.cam.getWorldDirection(_f); this.from.look.copy(this.cam.position).addScaledVector(_f, 4); }

  update(dt, s) {
    let fovT = 62;
    if (this.mode === 'cine' && this.cine) {
      this.cineT += dt;
      const k = this.cine(this.cineT, _p, _t);
      const e = Math.min(1, this.cineT / (this.cine.ease || 0.8)); const w = e * e * (3 - 2 * e);
      this.cam.position.lerpVectors(this.from.pos, _p, w);
      _c.lerpVectors(this.from.look, _t, w);
      this.cam.lookAt(_c);
      fovT = k || 50;
    } else if (this.mode === 'car') {
      const car = s.car;
      car.getWorldPosition(_p);
      _f.set(0, 0, 1).applyQuaternion(car.quaternion); _f.y = 0; _f.normalize();
      const speed = s.speed || 0;
      this.orbitIdle += dt;
      if (this.orbitIdle > 1.4) this.orbit *= Math.exp(-dt * 2.2);
      const a = Math.atan2(_f.x, _f.z) + this.orbit + Math.PI;
      const back = 7.4 + Math.min(2.2, speed * 0.05);
      _t.set(_p.x + Math.sin(a) * back, _p.y + 2.5 - this.pitch * 3, _p.z + Math.cos(a) * back);
      _c.copy(_p).addScaledVector(_f, 2.5); _c.y += 1.1;
      if (!this.carInit) { this.carPos.copy(_t); this.carLook.copy(_c); this.carInit = true; }
      this.carPos.lerp(_t, 1 - Math.exp(-dt * 5.5)); this.carLook.lerp(_c, 1 - Math.exp(-dt * 9));
      this.clip(this.carLook, this.carPos, this.cam.position, 0.3, G.STATIC);
      if (this.blend < 1) { this.blend = Math.min(1, this.blend + dt * 1.6); const w = this.blend * this.blend * (3 - 2 * this.blend); this.cam.position.lerpVectors(this.from.pos, this.cam.position, w); }
      this.cam.lookAt(this.carLook);
      fovT = 62 + Math.min(10, speed * 0.25);
    } else {
      const aim = s.aim, sprint = s.sprint;
      this.carInit = false;
      const tDist = aim ? 2.35 : sprint ? 3.7 : 3.25, tSide = aim ? 0.66 : 0.52;
      this.dist += (tDist - this.dist) * (1 - Math.exp(-dt * 8));
      this.side += (tSide - this.side) * (1 - Math.exp(-dt * 8));
      _p.copy(s.pivot);
      this.dir(_d); this.right(_r);
      const head = _c.copy(_p).addScaledVector(_r, this.side * 0.6);
      _t.copy(_p).addScaledVector(_d, -this.dist).addScaledVector(_r, this.side); _t.y += 0.12;
      if (_t.y < s.ground + 0.38) _t.y = s.ground + 0.38 + (s.ground + 0.38 - _t.y) * 0.15;
      this.clip(head, _t, this.pos, 0.22);
      this.pos.add(this.kick);
      if (this.blend < 1) { this.blend = Math.min(1, this.blend + dt * 2.2); const w = this.blend * this.blend * (3 - 2 * this.blend); this.cam.position.lerpVectors(this.from.pos, this.pos, w); }
      else this.cam.position.copy(this.pos);
      _c.copy(this.cam.position).addScaledVector(_d, 10);
      this.cam.lookAt(_c);
      fovT = aim ? 55 : sprint ? 67 : 62;
    }
    this.kick.multiplyScalar(Math.exp(-dt * 10));
    this.fov += (fovT - this.fov) * (1 - Math.exp(-dt * 6));
    if (Math.abs(this.cam.fov - this.fov) > 0.01) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
    this.cam.getWorldDirection(this.forward);
  }

  clip(from, to, out, pad, mask = G.STATIC | G.VEHICLE) {
    _f.copy(to).sub(from);
    const L = _f.length();
    if (L < 1e-4) { out.copy(to); return; }
    _f.divideScalar(L);
    const h = this.phys.cast(from, _f, L + pad, mask);
    if (h && h.dist < L + pad) out.copy(from).addScaledVector(_f, Math.max(0.35, h.dist - pad));
    else out.copy(to);
  }
}
