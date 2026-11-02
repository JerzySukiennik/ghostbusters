// Shared posture layer for any Ghostbuster avatar: strafe hips, aim pitch through the spine and a two-handed wand hold by arm IK.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const _a = V(), _b = V(), _c = V(), _f = V(), _r = V(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class WandHold {
  constructor() {
    this.pos = V(-0.19, 0.93, 0.05);
    this.dir = V(0, -0.3, 1).normalize();
    this.weight = 0;
    this.pitch = 0;
  }

  apply(av, dt, it) {
    av.object.updateMatrixWorld(true);
    const hipOff = it.hipOff || 0;
    if (Math.abs(hipOff) > 0.01) {
      const hips = av.bone('Hips');
      if (hips) { hips.getWorldQuaternion(_q); av.setWorldQuat(hips, new THREE.Quaternion().setFromAxisAngle(UP, hipOff).multiply(_q)); }
      av.bend(['Spine', 'Spine1', 'Spine2'], UP, -hipOff * 0.9);
    }
    const hold = it.hold || 0;
    this.weight += (hold - this.weight) * Math.min(1, dt * 7);
    if (this.weight < 0.01 || !it.wandObj) return;
    const aim = it.aimHold ? 1 : 0, wr = it.wrangle || 0, sprint = it.sprint && !it.aimHold ? 1 : 0, s = av.scale || 1;
    _m.copy(av.object.matrixWorld).invert();
    _a.copy(it.aimPoint).applyMatrix4(_m);
    const tgt = _b.set(-0.19 + 0.02 * aim, 0.93 + 0.05 * aim + 0.04 * wr - 0.05 * sprint, 0.05 + 0.06 * aim - 0.03 * wr - 0.06 * sprint).multiplyScalar(s);
    const lift = THREE.MathUtils.clamp(_a.y - s, -1.5, 6) / Math.max(2, Math.hypot(_a.x, _a.z));
    tgt.y += THREE.MathUtils.clamp(lift, -0.2, 1.2) * 0.16 * aim;
    tgt.x += Math.sin(it.time * 31) * 0.006 * (aim + wr * 2) + Math.sin(it.time * 47.3) * 0.004 * wr;
    tgt.y += Math.sin(it.time * 27.1) * 0.006 * (aim + wr * 2);
    this.pos.lerp(tgt, 1 - Math.exp(-dt * 14));
    const d = aim || wr ? _c.copy(_a).sub(this.pos).normalize() : _c.set(0.08, sprint ? -0.95 : -0.45, 1).normalize();
    this.dir.lerp(d, 1 - Math.exp(-dt * (aim ? 18 : 8))).normalize();
    if (aim || wr) {
      const pitch = Math.atan2(this.dir.y, Math.hypot(this.dir.x, this.dir.z));
      this.pitch += (pitch - this.pitch) * Math.min(1, dt * 10);
      _r.set(1, 0, 0).applyQuaternion(av.object.quaternion);
      av.bend(['Spine', 'Spine1', 'Spine2'], _r, -this.pitch * 0.35 - wr * 0.2);
    } else this.pitch *= Math.exp(-dt * 6);
    const W = it.wandObj;
    const fwd = _f.copy(this.dir).transformDirection(av.object.matrixWorld);
    W.position.copy(this.pos).applyMatrix4(av.object.matrixWorld);
    _c.copy(W.position).add(fwd);
    _m.lookAt(_c, W.position, UP);
    W.quaternion.setFromRotationMatrix(_m);
    W.updateMatrixWorld(true);
    const k = this.weight;
    const wx = V(1, 0, 0).applyQuaternion(W.quaternion), wy = V(0, 1, 0).applyQuaternion(W.quaternion);
    const sideR = V(-1, 0, 0).applyQuaternion(av.object.quaternion);
    const dirR = fwd.clone().addScaledVector(wy, -0.5).normalize();
    const palmR = wx.clone();
    const gripR = W.position.clone().addScaledVector(dirR, -0.075).addScaledVector(palmR, -0.02);
    const shR = av.bone('RightArm');
    if (shR) {
      shR.getWorldPosition(_a);
      av.solveArm('Right', gripR, _a.clone().addScaledVector(sideR, 0.45).addScaledVector(UP, -0.45).addScaledVector(fwd, -0.25), k);
      av.orientHand('Right', dirR, palmR, k);
      av.curl('Right', 0.95 * k, 0.6);
    }
    const front = it.gripFront ? it.gripFront.getWorldPosition(V()) : W.position.clone().addScaledVector(fwd, 0.3);
    const dirL = fwd.clone().addScaledVector(wy, -0.35).normalize();
    const palmL = wx.clone().negate();
    const gripL = front.addScaledVector(dirL, -0.075).addScaledVector(palmL, -0.02);
    const shL = av.bone('LeftArm');
    if (shL) {
      shL.getWorldPosition(_a);
      av.solveArm('Left', gripL, _a.clone().addScaledVector(sideR, -0.5).addScaledVector(UP, -0.5).addScaledVector(fwd, -0.15), k);
      av.orientHand('Left', dirL, palmL, k);
      av.curl('Left', 0.9 * k, 0.5);
    }
  }
}
