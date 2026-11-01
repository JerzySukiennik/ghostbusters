// Ghost trap: thrown and sliding on the asphalt, foot pedal on a cable, doors and the light cone, capture progress, snap shut, smoking full trap carried back.
import * as THREE from 'three';
import { G, groups } from '../engine/physics.js';
import { findNode } from '../engine/assets.js';
import { segmentize } from '../engine/segments.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _q = new THREE.Quaternion();
const ease = (t) => t * t * (3 - 2 * t);

export class Trap {
  constructor({ gltf, scene, phys, audio, fx, renderer, hud }) {
    Object.assign(this, { scene, phys, audio, fx, renderer, hud });
    const src = gltf.scene;
    this.root = src.getObjectByName('Trap') || src;
    this.pedal = src.getObjectByName('Pedal') || null;
    this.json = gltf.json || {};
    this.holder = new THREE.Group(); this.holder.name = 'TrapHolder'; scene.add(this.holder);
    this.holder.add(this.root); this.root.position.set(0, 0, 0); this.root.quaternion.identity();
    if (this.pedal) { scene.add(this.pedal); this.pedal.visible = false; }
    for (const o of [this.root, this.pedal]) o?.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const door = (name, def) => { const o = findNode(this.root, name); if (!o) return null; const j = this.json.doors?.[name] || {}; return { o, rq: o.quaternion.clone(), axis: V().fromArray(j.axis || [0, 0, 1]).normalize(), ang: THREE.MathUtils.degToRad(j.open_deg ?? def) }; };
    this.doors = [door('DoorL', 105), door('DoorR', -105)].filter(Boolean);
    this.beamO = findNode(this.root, 'BeamOrigin');
    this.cableA = findNode(this.root, 'CableAnchor');
    this.pedalA = this.pedal ? findNode(this.pedal, 'PedalAnchor') : null;
    this.smokes = [];
    this.root.traverse((o) => { if (/^Smoke_/.test(o.name)) this.smokes.push(o); });
    let em = null; const te = findNode(this.root, 'TrapEmit'); if (te) te.traverse((o) => { if (!em && o.isMesh) em = o; });
    this.lights = em ? segmentize(em, te.userData.segments || 4, 6) : null;
    this.tfx = fx.createTrapFX(this.root);
    this.cable = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3)), new THREE.LineBasicMaterial({ color: 0x0c0c0c }));
    this.cable.frustumCulled = false; this.cable.visible = false; scene.add(this.cable);
    const R = phys.RAPIER;
    this.body = phys.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, -50, 0).setLinearDamping(0.6).setAngularDamping(2.5).setCcdEnabled(true));
    this.col = phys.world.createCollider(R.ColliderDesc.cuboid(0.15, 0.06, 0.11).setTranslation(0, 0.06, 0).setMass(4).setFriction(0.45).setRestitution(0.1).setCollisionGroups(groups(G.TRAP, G.STATIC | G.PROP | G.VEHICLE)), this.body);
    this.body.setEnabled(false);
    phys.own(this.col, { kind: 'trap', trap: this });
    this.state = 'belt'; this.st = 0; this.door = 0; this.doorT = 0; this.beam = 0; this.progress = 0; this.openT = 0; this.smokeT = 0; this.t = 0;
    this.pedalPos = V(); this.holder.visible = false;
    this.snd = {};
  }

  get pos() { return this.holder.position; }
  get open() { return this.state === 'open'; }

  setState(s) { this.state = s; this.st = 0; }

  attachTo(obj, pos, quat) {
    this.body.setEnabled(false);
    this.holder.visible = true;
    if (pos) this.holder.position.copy(pos);
    if (quat) this.holder.quaternion.copy(quat);
  }

  throwFrom(p, dir, playerFeet) {
    this.setState('thrown');
    this.holder.visible = true;
    this.body.setEnabled(true);
    this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    const yaw = Math.atan2(dir.x, dir.z);
    this.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.body.setLinvel({ x: dir.x * 7.2, y: 1.6, z: dir.z * 7.2 }, true);
    this.body.setAngvel({ x: 0, y: (Math.random() - 0.5) * 2, z: 0 }, true);
    this.pedalPos.copy(playerFeet).addScaledVector(dir, 0.6);
    if (this.pedal) { this.pedal.visible = true; this.pedal.position.copy(this.pedalPos); this.pedal.rotation.set(0, yaw, 0); }
    this.cable.visible = true;
    this.landed = false;
    this.audio?.play('cloth_rustle', { pos: p });
  }

  pickUp() {
    this.body.setEnabled(false);
    if (this.pedal) this.pedal.visible = false;
    this.cable.visible = false;
    this.setState(this.state === 'full' ? 'carried' : 'belt');
    if (this.state === 'belt') this.holder.visible = false;
    this.snd.beep?.stop(0.2); if (this.state === 'belt') this.snd.beep = null;
  }

  stomp() {
    if (this.state !== 'armed') return false;
    this.setState('open'); this.openT = 12; this.progress = 0;
    if (this.pedal) { this.pedal.position.y = this.pedalPos.y - 0.01; }
    this.audio?.play('pedal_click', { pos: this.pedalPos });
    this.audio?.play('trap_open', { pos: this.pos, gain: 1.2 });
    this.snd.beam = this.audio?.loop('trap_beam_loop', { pos: this.pos, gain: 1, fadeIn: 0.2, ref: 4 });
    this.renderer.addFlash(0.85); this.renderer.addTrauma(0.3);
    this.hud?.toast?.("Don't look into the trap!", 1.6);
    return true;
  }

  close(full) {
    this.snd.beam?.stop(0.15); this.snd.beam = null;
    this.audio?.play('trap_close', { pos: this.pos, gain: 1.3 });
    if (full) {
      this.setState('full');
      this.renderer.addFlash(0.6); this.renderer.addTrauma(0.5); this.renderer.hitStop(0.14, 0.05);
      this.fx.impact(this.pos.clone().add(V(0, 0.15, 0)), V(0, 1, 0), 'spark');
      this.snd.beep = this.audio?.loop('trap_beep', { pos: this.pos, gain: 0.5, delay: 0.6 });
      this.audio?.play('trap_smoke', { pos: this.pos, delay: 0.25 });
      this.smokeT = 6;
    } else this.setState('armed');
  }

  inCone(p) {
    if (!this.beamO) return false;
    this.beamO.getWorldPosition(_a);
    const h = p.y - _a.y;
    if (h < 0.15 || h > 4.4) return false;
    const r = Math.hypot(p.x - _a.x, p.z - _a.z);
    return r < 0.55 + h * 0.42;
  }

  beamPos(out) { if (this.beamO) return this.beamO.getWorldPosition(out); return out.copy(this.pos); }

  update(dt, ctx) {
    this.t += dt; this.st += dt;
    if (this.state === 'thrown' || this.state === 'armed' || this.state === 'open' || this.state === 'full') {
      if (this.body.isEnabled()) {
        const t = this.body.translation(), r = this.body.rotation();
        this.holder.position.set(t.x, t.y, t.z); this.holder.quaternion.set(r.x, r.y, r.z, r.w);
      }
    }
    if (this.state === 'thrown') {
      const v = this.body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      if (!this.landed && this.holder.position.y < 0.2 && this.st > 0.1) { this.landed = true; this.audio?.play('trap_land', { pos: this.pos }); this.slide = this.audio?.play('trap_slide', { pos: this.pos, gain: 0.9 }); }
      if (this.st > 0.4 && sp < 0.25) { this.setState('armed'); this.slide?.stop(0.2); this.audio?.play('pedal_click', { pos: this.pos, gain: 0.5, rate: 1.3 }); }
      if (this.st > 4) this.setState('armed');
    }
    const want = this.state === 'open' ? 1 : 0;
    this.door += (want - this.door) * Math.min(1, dt * (want ? 14 : 22));
    for (const d of this.doors) d.o.quaternion.copy(d.rq).multiply(_q.setFromAxisAngle(d.axis, d.ang * ease(Math.min(1, this.door))));
    const beamT = this.state === 'open' ? 1 : this.state === 'sucking' ? 1 : 0;
    this.beam += (beamT - this.beam) * Math.min(1, dt * 10);
    if (this.state === 'open') {
      this.openT -= dt;
      const g = ctx.ghost;
      const inside = g && g.alive && this.inCone(g.pos);
      this.ghostInside = inside;
      if (inside && ctx.wrangling) this.progress += dt / (1.1 + Math.max(0, g.will) / 35 * 1.4);
      else this.progress = Math.max(0, this.progress - dt * 0.5);
      if (inside && !ctx.wrangling && g.state !== 'sucked') this.progress = Math.max(this.progress, this.progress + dt * 0.15);
      if (this.progress >= 1 && g) {
        this.setState('sucking');
        this.audio?.play('trap_suck', { pos: this.pos, gain: 1.2 });
        ctx.onSuck?.();
        g.startSuck(this.beamPos(V()));
        this.renderer.addTrauma(0.4);
      } else if (this.openT <= 0) this.close(false);
    }
    if (this.state === 'sucking') { this.renderer.addTrauma(dt * 1.2); if (ctx.ghost && !ctx.ghost.alive) this.close(true); }
    if (this.state === 'full' || this.state === 'carried' || this.state === 'stowed') {
      this.smokeT = Math.max(0, this.smokeT - dt * (this.state === 'stowed' ? 3 : 0.25));
      if (this.smokeT > 0 && Math.random() < dt * 5) for (const s of this.smokes) ctx.steam?.emit(s.getWorldPosition(V()), V(0, 1, 0), 1, 0.6);
    }
    if (this.lights) {
      const lv = this.lights.levels;
      const s = this.state;
      const blink = Math.sin(this.t * (s === 'open' ? 16 : 5)) > 0 ? 1 : 0.05;
      for (let i = 0; i < this.lights.count; i++) lv[i] = s === 'belt' ? 0.05 : s === 'open' || s === 'sucking' ? (i % 2 ? blink : 1 - blink) * 1.6 : s === 'full' || s === 'carried' || s === 'stowed' ? (i === 0 ? blink * 1.8 : 0.08) : (i === 1 ? 0.6 : 0.05);
    }
    this.tfx.update(dt, { open: this.door, beam: this.beam, suck: this.state === 'sucking' ? 1 : 0, closed: this.state === 'full', smoking: this.state === 'full' || this.state === 'carried' });
    this.snd.beep?.pos(this.pos); this.snd.beam?.pos(this.pos);
    if (this.cable.visible && this.cableA && this.pedalA) {
      this.cableA.getWorldPosition(_a); this.pedalA.getWorldPosition(_b);
      const arr = this.cable.geometry.attributes.position.array, n = arr.length / 3;
      const L = _a.distanceTo(_b);
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const y = THREE.MathUtils.lerp(_a.y, _b.y, u) - Math.sin(u * Math.PI) * Math.min(0.12, L * 0.05);
        arr[i * 3] = THREE.MathUtils.lerp(_a.x, _b.x, u); arr[i * 3 + 1] = Math.max(0.012, y); arr[i * 3 + 2] = THREE.MathUtils.lerp(_a.z, _b.z, u);
      }
      this.cable.geometry.attributes.position.needsUpdate = true;
    }
  }
}
