// Ecto-1: Rapier ray-cast vehicle with soft 1959 Cadillac handling, Hydra-Matic engine audio, siren + beacon, doors, rear door and the slide-out pack tray.
import * as THREE from 'three';
import { G, groups } from '../engine/physics.js';
import { findNode } from '../engine/assets.js';
import { segmentize } from '../engine/segments.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion();
const _v = V(), _q = Q(), _q2 = Q(), _m = new THREE.Matrix4();
const GEARS = [3.96, 2.55, 1.55, 1.0], FINAL = 3.36, IDLE = 650;
const ease = (t) => t * t * (3 - 2 * t);

export class Ecto {
  constructor({ gltf, phys, audio, scene, spawn }) {
    this.phys = phys; this.audio = audio;
    this.json = gltf.json || {};
    this.root = new THREE.Group(); this.root.name = 'EctoRoot';
    const model = gltf.scene;
    this.model = model;
    this.root.add(model);
    scene.add(this.root);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (/^Collider/.test(o.name)) o.visible = false; } });
    model.updateMatrixWorld(true);
    const n = (name) => findNode(model, name);
    this.node = n;
    this.wheels = ['FL', 'FR', 'RL', 'RR'].map((k) => { const o = n('Wheel_' + k); return o ? { o, rest: o.quaternion.clone(), p: o.position.clone(), spin: 0 } : null; });
    this.parts = {};
    const part = (key, name, kind, axis, amount) => {
      const o = n(name); if (!o) return;
      this.parts[key] = { o, kind, axis: new THREE.Vector3(...(axis || [0, 1, 0])).normalize(), amount, rq: o.quaternion.clone(), rp: o.position.clone(), t: 0, target: 0, speed: 1 };
    };
    const J = this.json;
    part('rear', 'RearDoor', 'rot', J.rearDoor?.axis || [1, 0, 0], THREE.MathUtils.degToRad(J.rearDoor?.open_deg ?? J.rearDoor?.openAngleDeg ?? -95));
    part('tray', 'PackTray', 'move', J.tray?.axis || [0, 0, -1], J.tray?.travel_m ?? J.tray?.travel ?? 1.4);
    if (n('PackTray2')) part('tray2', 'PackTray2', 'move', J.tray2?.axis || J.tray?.axis2 || J.tray?.axis || [0, 0, -1], J.tray2?.travel_m ?? J.tray?.travel2_m ?? 0.6);
    part('doorL', 'Door_FL', 'rot', J.doors?.Door_FL?.axis || [0, 1, 0], THREE.MathUtils.degToRad(J.doors?.Door_FL?.open_deg ?? 62));
    part('doorR', 'Door_FR', 'rot', J.doors?.Door_FR?.axis || [0, 1, 0], THREE.MathUtils.degToRad(J.doors?.Door_FR?.open_deg ?? -62));
    this.steerWheel = n('SteeringWheel'); this.steerRest = this.steerWheel?.quaternion.clone();
    this.steerAxis = new THREE.Vector3(...(J.steering?.axis || [0, 0, 1]));
    this.beacon = n('Beacon');
    this.beaconAxis = new THREE.Vector3(...(J.beacon?.axis || [0, 1, 0]));
    this.slots = [1, 2, 3, 4].map((i) => n('PackSlot_' + i)).filter(Boolean);
    this.pickups = [1, 2, 3, 4].map((i) => n('PackPickup_' + i));
    this.empties = { seat: n('Seat_Driver'), exit: n('Exit_Driver'), stow: n('TrapStow'), siren: n('Siren'), exhaust: n('Exhaust'), hl: n('Headlight_L'), hr: n('Headlight_R') };
    this.emit = {};
    for (const k of ['HeadlightEmit', 'TailLightEmit', 'BeaconEmit', 'InteriorEmit']) {
      const o = n(k); if (!o) continue;
      const meshes = []; o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); meshes.push(m); } });
      this.emit[k] = meshes;
    }
    const bar = n('LightBarEmit');
    this.bar = null;
    if (bar) { const m = bar.isMesh ? bar : (() => { let x = null; bar.traverse((o) => { if (!x && o.isMesh) x = o; }); return x; })(); if (m) this.bar = segmentize(m, bar.userData.segments || 8, 5); }

    this.lights = [];
    for (const e of [this.empties.hl, this.empties.hr]) {
      const s = new THREE.SpotLight(0xffe7c4, 0, 38, 0.48, 0.55, 1.6);
      s.position.set(0, 0, 0); (e || model).add(s);
      const t = new THREE.Object3D(); t.position.set(0, -0.6, 10); (e || model).add(t); s.target = t;
      this.lights.push(s);
    }
    this.beaconLight = new THREE.SpotLight(0xff2a14, 0, 26, 0.5, 0.7, 1.4);
    this.beaconLightTarget = new THREE.Object3D();
    (this.beacon || model).add(this.beaconLight); (this.beacon || model).add(this.beaconLightTarget);
    this.beaconLightTarget.position.set(0, -1.4, 6);
    this.beaconLight.target = this.beaconLightTarget;

    const R = phys.RAPIER, w = phys.world;
    const yaw = spawn.yaw || 0;
    this.body = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(spawn.pos.x, spawn.pos.y + 0.15, spawn.pos.z)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }).setLinearDamping(0.05).setAngularDamping(0.6).setCanSleep(true));
    const mass = J.mass_kg || 2600;
    const hulls = [];
    model.traverse((o) => { if (o.isMesh && /^Collider/.test(o.name)) hulls.push(o); });
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const cg = groups(G.VEHICLE, G.STATIC | G.PROP | G.PLAYER | G.VEHICLE | G.DEBRIS | G.TRAP);
    this.colliders = [];
    for (const h of hulls) {
      const pos = h.geometry.attributes.position, arr = new Float32Array(pos.count * 3);
      _m.multiplyMatrices(inv, h.matrixWorld);
      for (let i = 0; i < pos.count; i++) { _v.fromBufferAttribute(pos, i).applyMatrix4(_m); arr.set([_v.x, _v.y, _v.z], i * 3); }
      const d = R.ColliderDesc.convexHull(arr);
      if (d) { d.setMass(mass * 0.35 / hulls.length).setFriction(0.5).setCollisionGroups(cg); this.colliders.push(w.createCollider(d, this.body)); }
    }
    if (!this.colliders.length) this.colliders.push(w.createCollider(R.ColliderDesc.cuboid(1.0, 0.55, 3.0).setTranslation(0, 0.95, -0.1).setMass(mass * 0.35).setCollisionGroups(cg), this.body));
    this.colliders.push(w.createCollider(R.ColliderDesc.cuboid(0.75, 0.1, 2.2).setTranslation(0, 0.42, 0).setMass(mass * 0.65).setCollisionGroups(groups(G.VEHICLE, G.STATIC)), this.body));
    for (const c of this.colliders) phys.own(c, { kind: 'ecto', ecto: this });

    this.vc = w.createVehicleController(this.body);
    try { this.vc.indexUpAxis = 1; } catch {}
    try { this.vc.indexForwardAxis = 2; } catch {}
    try { this.vc.setIndexForwardAxis = 2; } catch {}
    const radius = J.wheel_radius || 0.4;
    this.radius = radius;
    this.rest = 0.26;
    this.wheels.forEach((wh, i) => {
      if (!wh) return;
      const p = wh.p;
      this.vc.addWheel({ x: p.x, y: p.y + this.rest * 0.75, z: p.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, this.rest, radius);
      this.vc.setWheelSuspensionStiffness(i, 22);
      this.vc.setWheelSuspensionCompression(i, 2.3);
      this.vc.setWheelSuspensionRelaxation(i, 2.9);
      this.vc.setWheelMaxSuspensionTravel(i, 0.22);
      this.vc.setWheelMaxSuspensionForce(i, 90000);
      this.vc.setWheelFrictionSlip(i, i < 2 ? 1.55 : 1.4);
      this.vc.setWheelSideFrictionStiffness(i, 0.95);
    });
    this.steer = 0; this.throttle = 0; this.brake = 0; this.gear = 0; this.rpm = IDLE; this.speed = 0; this.fwdSpeed = 0;
    this.engine = false; this.siren = false; this.lightsOn = false; this.beaconOn = true; this.occupied = false;
    this.snd = {}; this.t = 0; this.shiftT = 0;
    this.prevPos = V(); this.curPos = V(); this.prevQ = Q(); this.curQ = Q();
    this.sync(true);
  }

  sync(snap) {
    const t = this.body.translation(), r = this.body.rotation();
    this.prevPos.copy(this.curPos); this.prevQ.copy(this.curQ);
    this.curPos.set(t.x, t.y, t.z); this.curQ.set(r.x, r.y, r.z, r.w);
    if (snap) { this.prevPos.copy(this.curPos); this.prevQ.copy(this.curQ); }
  }

  interp(alpha) {
    this.root.position.lerpVectors(this.prevPos, this.curPos, alpha);
    this.root.quaternion.slerpQuaternions(this.prevQ, this.curQ, alpha);
    this.root.updateMatrixWorld(true);
  }

  forward(out = V()) { return out.set(0, 0, 1).applyQuaternion(this.root.quaternion); }
  world(node, out = V()) { node.updateWorldMatrix(true, false); return out.setFromMatrixPosition(node.matrixWorld); }
  rearPoint(out = V()) { return out.set(0, 0.0, -3.9).applyMatrix4(this.root.matrixWorld); }
  doorPoint(out = V()) { return out.set(1.45, 0, 0.45).applyMatrix4(this.root.matrixWorld); }

  slotPose(i, pos, quat) {
    const s = this.slots[i]; if (!s) return false;
    s.updateWorldMatrix(true, false); s.matrixWorld.decompose(pos, quat, _v); return true;
  }

  withTrayOut(fn) {
    const saved = [];
    for (const k of ['tray', 'tray2']) {
      const p = this.parts[k]; if (!p) continue;
      saved.push([p, p.o.position.clone()]);
      p.o.position.copy(p.rp).addScaledVector(p.axis, p.amount);
    }
    this.root.updateMatrixWorld(true);
    const r = fn();
    for (const [p, v] of saved) p.o.position.copy(v);
    this.root.updateMatrixWorld(true);
    return r;
  }

  pickupPose(i, pos) { return this.withTrayOut(() => this.pickupPoseNow(i, pos)); }

  pickupPoseNow(i, pos) {
    const pk = this.pickups[i];
    if (pk) { pk.updateWorldMatrix(true, false); pk.matrixWorld.decompose(pos, _q, _v); const f = V(0, 0, 1).applyQuaternion(_q); return { pos: pos.setY(0), yaw: Math.atan2(f.x, f.z) }; }
    const sp = V(), sq = Q();
    this.slotPose(i, sp, sq);
    const z = V(0, 0, 1).applyQuaternion(sq); z.y = 0; z.normalize();
    pos.copy(sp).addScaledVector(z, 0.55); pos.y = 0;
    return { pos, yaw: Math.atan2(-z.x, -z.z) };
  }

  set(key, target, speed = 1) { const p = this.parts[key]; if (p) { p.target = target; p.speed = speed; } }
  partT(key) { return this.parts[key]?.t ?? 0; }

  openRear(open) {
    this.set('rear', open ? 1 : 0, open ? 1.25 : 1.05);
    if (this.audio) this.audio.play(open ? 'reardoor_open' : 'reardoor_close', { obj: this.parts.rear?.o || this.root });
  }

  slideTray(out) {
    this.set('tray', out ? 1 : 0, out ? 0.8 : 0.95);
    if (this.parts.tray2) this.set('tray2', out ? 1 : 0, 0.8);
    if (this.audio) this.audio.play('tray_slide', { obj: this.parts.tray?.o || this.root });
  }

  startEngine() {
    if (this.engine) return;
    this.engine = true; this.lightsOn = true;
    const a = this.audio; if (!a) return;
    a.play('ecto_start', { obj: this.root, bus: 'car' });
    this.snd.idle = a.loop('ecto_idle', { obj: this.root, bus: 'car', gain: 0, delay: 0.9, ref: 5 });
    this.snd.drive = a.loop('ecto_drive', { obj: this.root, bus: 'car', gain: 0, delay: 0.9, ref: 5 });
    this.snd.idle.gain(1, 0.5);
  }

  stopEngine() {
    if (!this.engine) return;
    this.engine = false;
    if (this.snd.idle) this.snd.idle.stop(0.4);
    if (this.snd.drive) this.snd.drive.stop(0.4);
    this.snd.idle = this.snd.drive = null;
    if (this.audio) this.audio.play('ecto_off', { obj: this.root, bus: 'car' });
  }

  toggleSiren() {
    this.siren = !this.siren;
    this.beaconOn = this.siren || this.beaconOn;
    if (this.siren) this.snd.siren = this.audio?.loop('ecto_siren', { obj: this.empties.siren || this.root, bus: 'car', ref: 8, fadeIn: 0.25 });
    else if (this.snd.siren) { this.snd.siren.stop(0.5); this.snd.siren = null; }
  }

  fixed(dt, input) {
    let thr = 0, brk = 0, steerIn = 0, hand = false;
    if (this.occupied && input) {
      const fwd = input.key('KeyW') || input.key('ArrowUp'), back = input.key('KeyS') || input.key('ArrowDown');
      steerIn = (input.key('KeyA') || input.key('ArrowLeft') ? 1 : 0) - (input.key('KeyD') || input.key('ArrowRight') ? 1 : 0);
      hand = input.key('Space');
      if (fwd) { if (this.fwdSpeed < -0.6) brk = 1; else thr = 1; }
      if (back) { if (this.fwdSpeed > 0.6) brk = 1; else thr = -0.55; }
    } else brk = 0.35;
    this.throttle += (thr - this.throttle) * Math.min(1, dt * (thr ? 3 : 8));
    const sp = Math.abs(this.fwdSpeed);
    const maxSteer = THREE.MathUtils.lerp(0.62, 0.17, Math.min(1, sp / 30));
    this.steer += THREE.MathUtils.clamp(steerIn * maxSteer - this.steer, -2.4 * dt, 2.4 * dt);
    const g = GEARS[this.gear];
    const torqueCurve = THREE.MathUtils.clamp(1.15 - Math.pow(this.rpm / 4700, 3) * 0.6, 0.15, 1.15);
    const force = this.engine ? this.throttle * 2150 * g * torqueCurve * (this.fwdSpeed > 41 && this.throttle > 0 ? 0.05 : 1) : 0;
    for (let i = 0; i < 4; i++) {
      if (!this.wheels[i]) continue;
      if (i < 2) this.vc.setWheelSteering(i, this.steer);
      this.vc.setWheelEngineForce(i, i >= 2 ? force / 2 : 0);
      this.vc.setWheelBrake(i, brk * 55 + (hand && i >= 2 ? 90 : 0) + (!this.engine || !this.occupied ? 18 : 0));
    }
    this.vc.updateVehicle(dt, undefined, groups(G.VEHICLE, G.STATIC | G.PROP));
    this.fwdSpeed = this.vc.currentVehicleSpeed();
    const lv = this.body.linvel();
    this.speed = Math.hypot(lv.x, lv.z);
    const wheelRpm = Math.abs(this.fwdSpeed) / this.radius * 60 / (Math.PI * 2) * FINAL;
    this.shiftT = Math.max(0, this.shiftT - dt);
    let target = Math.max(IDLE, wheelRpm * g);
    if (this.fwdSpeed > 0.5 && this.shiftT <= 0) {
      if (target > 4200 && this.gear < 3) { this.gear++; this.shiftT = 0.45; }
      else if (target < 1700 && this.gear > 0) { this.gear--; this.shiftT = 0.35; }
    }
    if (this.fwdSpeed < 0.5) this.gear = 0;
    target = Math.max(IDLE + Math.abs(this.throttle) * (sp < 2 ? 1800 : 300), wheelRpm * GEARS[this.gear]);
    if (this.shiftT > 0.25) target *= 0.82;
    this.rpm += (target - this.rpm) * Math.min(1, dt * 6);
  }

  update(dt, time) {
    this.t += dt;
    for (const k in this.parts) {
      const p = this.parts[k];
      if (p.t !== p.target) p.t = p.t < p.target ? Math.min(p.target, p.t + dt * p.speed) : Math.max(p.target, p.t - dt * p.speed);
      const e = ease(p.t);
      if (p.kind === 'rot') p.o.quaternion.copy(p.rq).multiply(_q.setFromAxisAngle(p.axis, p.amount * e));
      else p.o.position.copy(p.rp).addScaledVector(p.axis, p.amount * e);
    }
    this.wheels.forEach((wh, i) => {
      if (!wh) return;
      const susp = this.vc.wheelSuspensionLength(i) ?? this.rest;
      wh.o.position.set(wh.p.x, wh.p.y + this.rest * 0.75 - susp, wh.p.z);
      wh.spin = this.vc.wheelRotation(i) ?? wh.spin;
      const st = i < 2 ? this.vc.wheelSteering(i) ?? 0 : 0;
      wh.o.quaternion.copy(_q.setFromAxisAngle(_v.set(0, 1, 0), st)).multiply(wh.rest).multiply(_q2.setFromAxisAngle(_v.set(1, 0, 0), wh.spin));
    });
    if (this.steerWheel) this.steerWheel.quaternion.copy(this.steerRest).multiply(_q.setFromAxisAngle(this.steerAxis, this.steer * 9));
    if (this.beacon && this.beaconOn) this.beacon.quaternion.multiply(_q.setFromAxisAngle(this.beaconAxis, dt * 9.5));
    const pulse = this.beaconOn ? 0.5 + 0.5 * Math.sin(this.t * 9.5) : 0;
    for (const m of this.emit.BeaconEmit || []) m.material.emissiveIntensity = this.beaconOn ? 3 + 9 * pulse : 0.05;
    this.beaconLight.intensity = this.beaconOn ? 60 : 0;
    for (const m of this.emit.HeadlightEmit || []) m.material.emissiveIntensity = this.lightsOn ? 9 : 0.1;
    for (const m of this.emit.TailLightEmit || []) m.material.emissiveIntensity = this.lightsOn ? (this.brakeLit ? 9 : 3.5) : 0.2;
    for (const m of this.emit.InteriorEmit || []) m.material.emissiveIntensity = this.engine ? 1.5 : 0.2;
    this.brakeLit = this.occupied && this.throttle < -0.05 || (this.occupied && this.fwdSpeed > 1 && this.throttle < 0.05);
    for (const l of this.lights) l.intensity = this.lightsOn ? 180 : 0;
    if (this.bar) {
      const lv = this.bar.levels, n = this.bar.count, ph = Math.floor(this.t * (this.siren ? 7 : 3.5));
      for (let i = 0; i < n; i++) lv[i] = this.beaconOn ? ((i + ph) % 2 ? 1.6 : 0.08) : 0.03;
    }
    if (this.engine && this.snd.idle) {
      const load = Math.min(1, Math.abs(this.throttle) * 0.8 + this.speed / 25);
      this.snd.idle.gain(1 - load * 0.85, 0.08);
      this.snd.drive.gain(0.25 + load * 0.85, 0.08);
      this.snd.idle.rate(THREE.MathUtils.clamp(this.rpm / 700, 0.85, 1.6), 0.05);
      this.snd.drive.rate(THREE.MathUtils.clamp(this.rpm / 2600, 0.55, 1.75), 0.05);
    }
  }
}
