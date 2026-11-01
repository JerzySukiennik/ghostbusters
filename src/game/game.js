// Mission director: wires player, Ecto-1, gear, stream, ghost and trap into the phase-1 bust and owns every interaction and sequence.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion();
const _a = V(), _b = V(), _c = V(), _q = Q(), _q2 = Q(), _s = V();
const UP = new THREE.Vector3(0, 1, 0);

export class Game {
  constructor(o) {
    Object.assign(this, o);
    this.time = 0; this.timers = [];
    this.mission = 'suit'; this.busy = false; this.engaged = false;
    this.stats = { time: 0, slimed: 0, slams: 0, darts: 0 };
    this.packMode = 'slot'; this.wandMode = 'dock'; this.wandBlend = 1;
    this.camPos = V(); this.camDir = V(); this.camRight = V(); this.pivot = V(); this.head = V();
    this.carry = false; this.startT = 0; this.done = false;
    this.tipW = V(); this.wandDirW = V(0, 0, 1);
    this.packPose = { p: V(), q: Q() };
  }

  wait(s) { return new Promise((r) => this.timers.push({ t: this.time + s, r })); }

  setup() {
    const { ecto, gear, plate, player, avatar } = this;
    gear.spawnSpares(ecto, 4);
    this.slotIndex = 0;
    ecto.slots[0]?.add(gear.pack); gear.pack.position.set(0, 0, 0); gear.pack.quaternion.identity();
    gear.dock();
    this.scene.add(avatar.object);
    this.rig.yaw = player.yaw + 0.25;
    this.hud.objective('Suit up at the back of the Ecto-1');
    this.hud.style(this.style);
    this.ghost.obj.visible = true;
    this.ghost.onWreck = (p) => this.hud.damage(p);
    this.ghost.start();
    this.ambience = this.audio.loop('amb_city_night', { bus: 'amb', gain: 0.8, fadeIn: 2 });
    this.wind = this.audio.loop('amb_wind', { bus: 'amb', gain: 0.35, fadeIn: 3 });
    this.proton.attachPool(this.scene);
    this.startT = this.time;
    window.__gb = this;
  }

  setStyle(s) {
    this.style = s;
    this.fx.setStyle(s);
    this.gear.setStyle?.(s);
    this.hud.style(s);
    this.onStyle?.(s);
    try { localStorage.setItem('gb.style', s); } catch {}
  }

  wornPose() {
    const j = this.avatar.json?.packWorn;
    if (j && j.position) return { bone: j.bone || 'Spine2', pos: V().fromArray(j.position), quat: Q().fromArray(j.quaternion || [0, 0, 0, 1]) };
    const d = this.avatar.d, s2 = d.restWorldP.get('Spine2'), s2q = d.restWorldQ.get('Spine2');
    const want = V(0, s2.y - 0.1, s2.z - 0.115);
    return { bone: 'Spine2', pos: want.sub(s2).applyQuaternion(s2q.clone().invert()), quat: s2q.clone().invert() };
  }

  packToBack() {
    const w = this.wornPose(), b = this.avatar.bone(w.bone);
    b.add(this.gear.pack); this.gear.pack.position.copy(w.pos); this.gear.pack.quaternion.copy(w.quat);
    this.packMode = 'worn'; this.gear.state = 'worn';
    if (this.avatar.harness) this.avatar.harness.visible = true;
  }

  backPose(pos, quat) {
    const w = this.wornPose(), b = this.avatar.bone(w.bone);
    b.updateWorldMatrix(true, false);
    _a.copy(w.pos).applyMatrix4(b.matrixWorld); pos.copy(_a);
    b.getWorldQuaternion(_q); quat.copy(_q).multiply(w.quat);
  }

  detachToScene(o) { o.updateWorldMatrix(true, false); o.matrixWorld.decompose(_a, _q, _s); this.scene.add(o); o.position.copy(_a); o.quaternion.copy(_q); }

  near(p, r) { return this.player.feet.distanceTo(p) < r; }

  async suitUp() {
    const { ecto, gear, avatar, player, rig, audio } = this;
    this.busy = true; player.packed = false;
    const target = ecto.pickupPose(this.slotIndex, V());
    const from = player.feet.clone(), fy = player.yaw;
    rig.startCine(this.cineSuit());
    ecto.openRear(true);
    const walk = 0.8;
    let t0 = this.time;
    this.autopilot = (dt) => {
      const k = Math.min(1, (this.time - t0) / walk), e = k * k * (3 - 2 * k);
      player.teleport(_a.lerpVectors(from, target.pos, e).setY(target.pos.y), fy + Math.atan2(Math.sin(target.yaw - fy), Math.cos(target.yaw - fy)) * e);
      player.vel.set(0, 0, 0); player.speed = k < 1 ? 1.2 : 0;
    };
    await this.wait(Math.max(0.85, ecto.seq.slideAt));
    this.autopilot = null;
    await this.wait(ecto.deployTray() + 0.1);
    const clip = avatar.anim.has('don_pack');
    if (clip && avatar.carriers.pack) {
      const ev = avatar.json?.events?.don_pack || avatar.json?.don_pack || {};
      const dur = avatar.anim.dur('don_pack');
      this.detachToScene(gear.pack); this.packMode = 'carrier';
      avatar.anim.play('don_pack', { lock: true });
      avatar.anim.oneshot.hold = true;
      const at = (k, d) => (typeof ev[k] === 'number' ? ev[k] : d);
      this.cue(at('grab', 0.5), () => audio.play('cloth_rustle', { obj: gear.pack }));
      this.cue(at('strapL', 1.4), () => audio.play('strap_buckle', { obj: gear.pack }));
      this.cue(at('strapR', 2.2), () => audio.play('cloth_rustle', { obj: gear.pack }));
      this.cue(at('buckle', 2.9), () => audio.play('strap_buckle', { obj: gear.pack }));
      const hs = avatar.json?.harnessShowAt ?? at('strapL', 1.4);
      this.cue(hs, () => { if (avatar.harness) avatar.harness.visible = true; });
      this.cue(at('wandDraw', dur - 1.4), () => { audio.play('wand_draw', { obj: gear.wand }); if (avatar.carriers.wand) { this.detachToScene(gear.wand); this.wandMode = 'carrier'; } });
      this.cue(at('powerUp', dur - 0.6), () => gear.powerUp());
      await this.wait(dur - 0.02);
      avatar.anim.oneshot && (avatar.anim.oneshot.hold = false);
      avatar.anim.stopAction();
      this.packToBack();
      this.wandMode = 'hold'; this.wandBlend = 1; gear.holdWand();
      gear.powerUp();
    } else {
      avatar.anim.play('PickUp_Table', { lock: true, rate: 0.9 });
      await this.wait(0.45);
      audio.play('cloth_rustle', { obj: gear.pack });
      this.detachToScene(gear.pack); this.packMode = 'fly';
      const p0 = gear.pack.position.clone(), q0 = gear.pack.quaternion.clone();
      const T = 1.25; t0 = this.time;
      this.packFly = () => {
        const k = Math.min(1, (this.time - t0) / T), e = k * k * (3 - 2 * k);
        this.backPose(_b, _q2);
        gear.pack.position.lerpVectors(p0, _b, e); gear.pack.position.y += Math.sin(k * Math.PI) * 0.35;
        gear.pack.quaternion.slerpQuaternions(q0, _q2, e);
      };
      await this.wait(T);
      this.packFly = null; this.packToBack();
      audio.play('strap_buckle', { obj: gear.pack });
      await this.wait(0.3);
      audio.play('strap_buckle', { obj: gear.pack });
      audio.play('wand_draw', { obj: gear.wand });
      this.wandFrom = { p: V(), q: Q() };
      gear.wand.updateWorldMatrix(true, false); gear.wand.matrixWorld.decompose(this.wandFrom.p, this.wandFrom.q, _s);
      gear.holdWand(); this.wandMode = 'hold'; this.wandBlend = 0;
      avatar.anim.stopAction();
      await this.wait(0.35);
      gear.powerUp();
    }
    player.packed = true;
    this.hud.toast('Pack powered up', 1.4);
    await this.wait(0.7);
    const back = ecto.stowTray();
    rig.endCine('foot'); rig.yaw = player.yaw; rig.pitch = -0.1;
    await this.wait(back);
    ecto.openRear(false);
    this.busy = false;
    this.mission = 'find';
    this.hud.objective('Find the ghost. Follow the munching.');
  }

  async unsuit() {
    const { ecto, gear, player, audio } = this;
    this.busy = true; this.proton.stopAll(); gear.powerDown();
    ecto.openRear(true);
    await this.wait(ecto.seq.slideAt);
    await this.wait(ecto.deployTray() + 0.1);
    gear.dock(); this.wandMode = 'dock';
    this.detachToScene(gear.pack); this.packMode = 'fly';
    if (this.avatar.harness) this.avatar.harness.visible = false;
    const p0 = gear.pack.position.clone(), q0 = gear.pack.quaternion.clone(), t0 = this.time, sp = V(), sq = Q();
    this.packFly = () => {
      const k = Math.min(1, (this.time - t0) / 1.0), e = k * k * (3 - 2 * k);
      ecto.slotPose(this.slotIndex, sp, sq);
      gear.pack.position.lerpVectors(p0, sp, e); gear.pack.position.y += Math.sin(k * Math.PI) * 0.3; gear.pack.quaternion.slerpQuaternions(q0, sq, e);
    };
    audio.play('cloth_rustle', { obj: gear.pack });
    await this.wait(1.0);
    this.packFly = null;
    ecto.slots[this.slotIndex].add(gear.pack); gear.pack.position.set(0, 0, 0); gear.pack.quaternion.identity();
    this.packMode = 'slot'; gear.state = 'stowed'; player.packed = false;
    await this.wait(0.3);
    await this.wait(ecto.stowTray());
    ecto.openRear(false);
    this.busy = false;
  }

  cue(t, fn) { this.wait(t).then(fn); }

  cineSuit() {
    const ecto = this.ecto, player = this.player;
    const fw = V(), rt = V();
    const f = (t, pos, look) => {
      const s = Math.min(1, t / 6), e = s * s * (3 - 2 * s);
      fw.set(0, 0, 1).applyQuaternion(ecto.root.quaternion).setY(0).normalize();
      rt.set(fw.z, 0, -fw.x);
      pos.copy(player.feet).addScaledVector(rt, 2.7 - e * 0.8).addScaledVector(fw, -2.4 + e * 0.6);
      pos.y = player.feet.y + 1.55 - e * 0.1;
      look.copy(player.feet).addScaledVector(fw, 0.35); look.y += 1.1;
      return 46;
    };
    f.ease = 0.9;
    return f;
  }

  async enterCar() {
    const { ecto, player, avatar, rig } = this;
    this.busy = true;
    ecto.set('doorL', 1, 2.6);
    this.audio.play('door_open', { obj: ecto.parts.doorL?.o || ecto.root });
    player.mode = 'script';
    await this.wait(0.38);
    player.setActive(false);
    player.mode = 'car';
    ecto.root.add(avatar.object);
    const seat = ecto.empties.seat;
    if (seat) { avatar.object.position.copy(seat.position).add(_a.set(0, -0.53, -0.05)); avatar.object.quaternion.copy(seat.quaternion); }
    else { avatar.object.position.set(0.42, 0.1, -0.1); avatar.object.quaternion.identity(); }
    avatar.anim.setMode('sit');
    ecto.occupied = true;
    rig.mode = 'car'; rig.blend = 0; rig.from.pos.copy(this.camera.position); rig.from.look.copy(this.camera.position);
    await this.wait(0.25);
    ecto.set('doorL', 0, 2.4);
    await this.wait(0.42);
    this.audio.play('door_close', { obj: ecto.root });
    ecto.startEngine();
    this.busy = false;
  }

  async exitCar() {
    const { ecto, player, avatar, rig } = this;
    this.busy = true;
    ecto.occupied = false;
    ecto.set('doorL', 1, 2.6);
    this.audio.play('door_open', { obj: ecto.root });
    await this.wait(0.35);
    const ex = ecto.empties.exit;
    if (ex) ex.getWorldPosition(_a); else ecto.doorPoint(_a);
    _a.y = Math.max(0, _a.y);
    let yaw = player.yaw;
    if (ex) { ex.getWorldQuaternion(_q); _b.set(0, 0, 1).applyQuaternion(_q); yaw = Math.atan2(_b.x, _b.z); }
    this.scene.add(avatar.object);
    avatar.anim.setMode('loco');
    player.teleport(_a, yaw); player.setActive(true); player.mode = 'foot';
    ecto.forward(_c); rig.mode = 'foot'; rig.yaw = Math.atan2(_c.x, _c.z) - 0.35; rig.pitch = -0.12; rig.blend = 0; rig.from.pos.copy(this.camera.position); this.camera.getWorldDirection(_b); rig.from.look.copy(this.camera.position).add(_b);
    ecto.stopEngine();
    await this.wait(0.3);
    ecto.set('doorL', 0, 2.4);
    await this.wait(0.4);
    this.audio.play('door_close', { obj: ecto.root });
    this.busy = false;
  }

  async throwTrap() {
    const { avatar, trap, player, proton } = this;
    if (trap.state !== 'belt') return;
    const quick = proton.on;
    const fwd = V(Math.sin(this.rig.yaw), 0, Math.cos(this.rig.yaw));
    if (quick) {
      trap.state = 'hip'; trap.holder.visible = true;
      await this.wait(0.16);
      avatar.bone('Hips').getWorldPosition(_a);
      _a.addScaledVector(V(Math.cos(player.yaw), 0, -Math.sin(player.yaw)), 0.22).add(V(0, -0.15, 0));
      trap.throwFrom(_a, fwd, player.feet);
      return;
    }
    this.busy = true;
    const clip = avatar.anim.has('throw_trap');
    const rel = clip ? (avatar.json?.events?.throw_trap?.release ?? avatar.json?.throw_trap?.release ?? 0.5) : 0.42;
    if (clip) avatar.anim.play('throw_trap', { upper: true });
    else avatar.anim.play('OverhandThrow', { upper: true, rate: 1.25 });
    this.wandHide = true;
    trap.holder.visible = true; trap.state = 'hand';
    await this.wait(rel);
    const h = avatar.bone('RightHand') || avatar.bone('Hips');
    h.getWorldPosition(_a); _a.y = Math.max(0.5, _a.y);
    trap.throwFrom(_a, fwd, player.feet);
    await this.wait(0.25);
    this.wandHide = false;
    this.busy = false;
  }

  updateObjective() {
    const g = this.ghost, t = this.trap, m = this.mission;
    if (m === 'suit' || this.done) return;
    if (m === 'find') { this.hud.objective('Find the ghost. Follow the munching.'); return; }
    if (m === 'bust') {
      if (t.state === 'sucking') this.hud.objective("It's going in!");
      else if (this.proton.wrangling) {
        if (t.state === 'belt') this.hud.objective('Got it! Throw the trap under it (Q)');
        else if (t.state === 'armed') this.hud.objective(this.near(t.pedalPos, 9) ? 'Stomp the pedal to open the trap (Q)' : 'Get back to the pedal');
        else if (t.state === 'open') this.hud.objective('Drag it into the light!');
        else this.hud.objective('Hold on to it!');
      } else if (g.capturable) this.hud.objective('It is weak. Hit it again to lock the capture stream');
      else this.hud.objective(t.state === 'belt' ? 'Weaken it with the stream (LMB)' : 'Weaken it and drag it over the trap');
      return;
    }
    if (m === 'return') this.hud.objective(t.state === 'carried' ? 'Carry the trap back to the Ecto-1' : 'Pick up the trap (E)');
  }

  interactions() {
    const { input, ecto, trap, player, gear, hud } = this;
    let prompt = null;
    if (this.busy || player.mode === 'script') { hud.prompt(null); return; }
    if (player.mode === 'car') {
      hud.prompt(Math.abs(ecto.fwdSpeed) < 3 ? 'F' : null, 'Get out');
      if (input.pressed('KeyF') && Math.abs(ecto.fwdSpeed) < 3) this.exitCar();
      if (input.pressed('KeyH')) ecto.toggleSiren();
      if (input.pressed('KeyG')) this.audio.play('ecto_horn', { obj: ecto.root, bus: 'car' });
      return;
    }
    const rear = ecto.rearPoint(_a), door = ecto.doorPoint(_b);
    const nearRear = this.near(rear, 2.1), nearDoor = this.near(door, 1.7);
    if (trap.state === 'carried' && nearRear) prompt = ['E', 'Stow the trap', () => this.stowTrap()];
    else if (trap.state === 'full' && this.near(trap.pos, 1.8)) prompt = ['E', 'Pick up the trap', () => this.pickTrap()];
    else if (trap.state === 'armed' && this.near(trap.pos, 1.6)) prompt = ['E', 'Pick up the trap', () => { trap.pickUp(); this.audio.play('cloth_rustle', { pos: trap.pos }); }];
    else if (nearRear && gear.state === 'stowed') prompt = ['E', 'Suit up', () => this.suitUp()];
    else if (nearRear && gear.state === 'worn' && trap.state === 'belt' && this.mission !== 'bust' && this.mission !== 'find') prompt = ['E', 'Stow your gear', () => this.unsuit()];
    else if (nearDoor) prompt = gear.state === 'stowed' ? ['F', 'Drive', () => this.enterCar()] : ['F', 'Stow your gear first', null];
    hud.prompt(prompt ? prompt[0] : null, prompt ? prompt[1] : '');
    if (prompt && prompt[2] && input.pressed('Key' + prompt[0])) prompt[2]();
    if (gear.state === 'worn' && input.pressed('KeyQ')) {
      if (trap.state === 'belt') this.throwTrap();
      else if (trap.state === 'armed') { if (this.near(trap.pedalPos, 9)) { trap.stomp(); if (this.avatar.anim.has('stomp_pedal')) this.avatar.anim.play('stomp_pedal', { upper: false }); } else hud.toast('Too far from the pedal', 1.2); }
    }
    if (gear.state === 'worn' && input.pressed('KeyR') && gear.manualVent()) hud.toast('Venting', 0.9);
  }

  pickTrap() {
    this.trap.pickUp();
    this.audio.play('cloth_rustle', { pos: this.trap.pos });
    this.mission = 'return';
  }

  async stowTrap() {
    const { ecto, trap } = this;
    this.busy = true;
    ecto.openRear(true);
    await this.wait(0.9);
    const st = ecto.empties.stow;
    trap.setState('stowed');
    if (st) { st.add(trap.holder); trap.holder.position.set(0, 0, 0); trap.holder.quaternion.identity(); }
    else trap.holder.visible = false;
    this.audio.play('trap_land', { obj: ecto.root });
    await this.wait(0.6);
    ecto.openRear(false);
    await this.wait(1.0);
    trap.snd.beep?.stop(0.4);
    this.busy = false;
    this.finish();
  }

  finish() {
    this.done = true; this.mission = 'done';
    this.stats.time = this.time - this.startT;
    this.stats.slams = this.proton.stats.slams; this.stats.darts = this.proton.stats.darts;
    this.hud.objective('Bust complete');
    this.hud.report(this.stats);
    document.exitPointerLock?.();
    this.input.enabled = false;
  }

  freeRoam() { this.hud.hideReport(); this.input.enabled = true; this.input.lock(); this.hud.objective('Free roam. Take the Ecto-1 for a spin.'); }

  slime() {
    this.fx.slimeScreen(1);
    this.audio.play('slime_splat', { pos: this.head, gain: 1.2 });
    this.player.stun = 0.6; this.stats.slimed++;
    this.hud.toast('Slimed!', 1.4);
    this.renderer.addTrauma(0.5);
  }

  update(dt, alpha) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].t <= this.time) { const r = this.timers[i].r; this.timers.splice(i, 1); r(); }
    const { input, rig, player, avatar, ecto, gear, ghost, trap, proton, hud, fx, renderer } = this;
    if (input.enabled && input.pressed('KeyV')) this.setStyle(this.style === 'film' ? 'modern' : 'film');
    this.jumpQ = input.pressed('Space') ? 0.15 : Math.max(0, (this.jumpQ || 0) - dt);
    rig.input(input.dx, input.dy);
    this.interactions();
    this.autopilot?.(dt);
    const onFoot = player.mode === 'foot';
    const armed = gear.state === 'worn' && this.wandMode === 'hold' && !this.wandHide && onFoot && !this.busy;
    const firing = armed && input.btn[0] && input.locked;
    const aim = armed && (firing || input.btn[2] || proton.wrangling);
    player.update(dt, alpha, { aim, face: aim ? Math.atan2(proton.aim.x - player.feet.x, proton.aim.z - player.feet.z) : undefined });
    if (player.mode === 'car') { ecto.interp(alpha); }
    else ecto.interp(alpha);
    ecto.update(dt, this.time);
    this.pivot.copy(player.feet).add(_a.set(0, avatar.height * 0.9, 0));
    if (player.mode === 'car') rig.update(dt, { car: ecto.root, speed: ecto.speed });
    else rig.update(dt, { pivot: this.pivot, aim, sprint: input.key('ShiftLeft') && !aim, ground: player.feet.y });
    this.camera.getWorldPosition(this.camPos); this.camera.getWorldDirection(this.camDir); rig.right(this.camRight);
    if (player.mode === 'car') this.camRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const sp = player.mode === 'foot' ? player.speed : 0;
    avatar.update({ speed: sp, grounded: player.grounded, vy: player.vy }, dt, { overlay: null, dir: player.animDir, sitClip: 'Sitting_Idle_Loop' });
    if (this.packMode === 'carrier' && avatar.carriers.pack) { avatar.carrierPose('pack', gear.pack.position, gear.pack.quaternion); }
    if (this.wandMode === 'carrier' && avatar.carriers.wand) { avatar.carrierPose('wand', gear.wand.position, gear.wand.quaternion); }
    this.packFly?.();
    const hold = this.wandMode === 'hold' && !this.wandHide && player.mode === 'foot' ? 1 : 0;
    player.aimPoint.copy(proton.aim);
    player.pose(dt, { hold, aimHold: aim, wrangle: proton.wrangling ? 1 : 0, sprint: input.key('ShiftLeft'), wandObj: gear.wand, gripFront: gear.n.front, time: this.time });
    if (this.wandMode === 'hold' && this.wandBlend < 1 && this.wandFrom) {
      this.wandBlend = Math.min(1, this.wandBlend + dt / 0.35);
      const e = this.wandBlend * this.wandBlend * (3 - 2 * this.wandBlend);
      gear.wand.position.lerpVectors(this.wandFrom.p, gear.wand.position, e);
      gear.wand.quaternion.slerpQuaternions(this.wandFrom.q, gear.wand.quaternion, e);
    }
    gear.wand.visible = !this.wandHide || this.wandMode !== 'hold';
    if (trap.state === 'hip') { avatar.bone('Hips').getWorldPosition(_a); trap.holder.position.copy(_a).add(_b.set(Math.cos(player.yaw) * 0.24, -0.2, -Math.sin(player.yaw) * 0.24)); trap.holder.quaternion.setFromAxisAngle(UP, player.yaw); }
    if (trap.state === 'hand') { const h = avatar.bone('RightHand'); if (h) { h.getWorldPosition(_a); trap.holder.position.copy(_a).add(_b.set(0, -0.12, 0)); trap.holder.quaternion.setFromAxisAngle(UP, player.yaw); } }
    if (trap.state === 'carried') { const h = avatar.bone('LeftHand'); if (h) { h.getWorldPosition(_a); trap.holder.position.copy(_a).add(_b.set(0, -0.2, 0)); trap.holder.quaternion.setFromAxisAngle(UP, player.yaw + Math.PI / 2); } }
    gear.wand.updateMatrixWorld(true);
    if (gear.n.tip) { gear.n.tip.getWorldPosition(this.tipW); gear.n.tip.getWorldQuaternion(_q); this.wandDirW.set(0, 0, 1).applyQuaternion(_q); }
    else { gear.wand.getWorldPosition(this.tipW); this.wandDirW.set(0, 0, 1).applyQuaternion(gear.wand.quaternion); }
    this.head.copy(player.feet).add(_a.set(0, avatar.height - 0.1, 0));
    const trapOpen = trap.state === 'open';
    proton.update(dt, {
      enabled: armed, fire: firing, rmb: armed && input.btnHit[2] && input.locked, camPos: this.camPos, camDir: this.camDir, camRight: this.camRight, pivot: this.pivot,
      tip: this.tipW, wandDir: this.wandDirW, aimOut: _c, flick: input.flick, wheel: input.wheel, trapOpen, trapPos: trap.beamPos(_s), inCone: trapOpen && trap.inCone(ghost.pos),
      pull: (v) => { player.vel.x += v.x * dt * 3; player.vel.z += v.z * dt * 3; },
    });
    if (!this.engaged && this.mission !== 'suit' && (ghost.lastHit < 0.2 || player.feet.distanceTo(ghost.pos) < 15)) {
      this.engaged = true; this.mission = 'bust'; ghost.say('ghost_laugh', 1.2); hud.toast('There it is!', 1.4);
    }
    ghost.update(dt, {
      playerHead: this.head, engaged: this.engaged, wrangling: proton.wrangling, wrangle: { vel: ghost.vel },
      onSlime: () => this.slime(), onSlam: (p) => proton.onSlam(p),
      onCaptured: () => { this.hud.toast('We got one!', 2.2); this.mission = 'return'; proton.stopAll(); },
    });
    trap.update(dt, { ghost, wrangling: proton.wrangling, steam: gear.steam, onSuck: () => { proton.stopAll(); } });
    gear.update(dt, { firing: proton.on, mode: proton.mode, style: this.style });
    this.plate.update(dt);
    fx.update(dt, this.time);
    this.updateObjective();
    const fightUI = this.engaged && !this.done && ghost.alive;
    hud.ghost(fightUI, ghost.will, ghost.state === 'wrangled' ? (proton.counter > 0.25 ? 'Holding it' : 'Fight its pull') : ghost.capturable ? 'Weak. Lock the capture stream' : '');
    hud.cross(armed && player.mode === 'foot', proton.wrangling ? proton.tension : 0, ghost.alive && proton.aim.distanceTo(ghost.pos) < ghost.radius * 1.4);
    hud.heat(gear.state === 'worn' && player.mode === 'foot', gear.heat, gear.heat > 0.82, gear.over > 0);
    hud.speed(player.mode === 'car', Math.abs(ecto.fwdSpeed) * 2.237);
    hud.update(dt);
    if (player.landed !== undefined && player.landed < -4) this.audio.play('land', { pos: player.feet });
    player.landed = undefined;
    this.footsteps(dt);
  }

  footsteps(dt) {
    const p = this.player;
    if (p.mode !== 'foot' || !p.grounded || p.speed < 0.6) { this.stepPh = 0; return; }
    const rate = p.speed > 4 ? 2.9 : p.speed > 2.2 ? 2.4 : 1.8;
    this.stepPh = (this.stepPh || 0) + dt * rate;
    if (this.stepPh >= 1) {
      this.stepPh -= 1;
      this.audio.play('step_asphalt', { pos: p.feet, gain: 0.45 + Math.min(0.4, p.speed * 0.06), jitter: 0.12 });
      if (this.gear.state === 'worn' && Math.random() < 0.35) this.audio.play('cloth_rustle', { pos: p.feet, gain: 0.25, jitter: 0.2 });
    }
  }

  fixed(h) {
    const { input, player, rig } = this;
    const a = input.axis();
    const locked = this.busy || player.mode !== 'foot' || !input.enabled;
    const jump = this.jumpQ > 0 && !locked;
    if (jump) this.jumpQ = 0;
    player.step(h, { move: { x: a.x, z: a.z }, camYaw: rig.yaw, sprint: input.key('ShiftLeft') && !input.btn[0], walk: input.key('AltLeft'), jump, aim: (input.btn[0] || input.btn[2] || this.proton.wrangling) && this.gear.state === 'worn', locked });
    this.ecto.fixed(h, input.enabled ? input : null);
  }
}
