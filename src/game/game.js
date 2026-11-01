// Mission director: wires player, Ecto-1, gear, stream, ghosts and traps into the bust, solo or as one of up to four online Ghostbusters, and owns every interaction and sequence.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion();
const _a = V(), _b = V(), _c = V(), _q = Q(), _q2 = Q(), _s = V(), _t = V(), _u = V();
const UP = new THREE.Vector3(0, 1, 0);

export class Game {
  constructor(o) {
    Object.assign(this, o);
    this.time = 0; this.timers = [];
    this.mission = 'suit'; this.busy = false; this.engaged = false;
    this.stats = { time: 0, slimed: 0, slams: 0, darts: 0 };
    this.packMode = 'slot'; this.wandMode = 'dock'; this.wandBlend = 1;
    this.camPos = V(); this.camDir = V(); this.camRight = V(); this.pivot = V(); this.head = V();
    this.startT = 0; this.done = false; this.net = null; this.seat = 0;
    this.tipW = V(); this.wandDirW = V(0, 0, 1);
    this.heads = [this.head];
  }

  get ghost() {
    const t = this.proton?.target;
    if (t && t.active && t.alive) return t;
    let best = null, bd = Infinity;
    for (const g of this.ghosts) { if (!g.active || !g.alive) continue; const d = g.pos.distanceToSquared(this.player.feet); if (d < bd) { bd = d; best = g; } }
    return best || this.ghosts[0];
  }

  get authority() { return !this.net || this.net.isHost; }

  wait(s) { return new Promise((r) => this.timers.push({ t: this.time + s, r })); }

  setup() {
    const { ecto, gear, player, avatar } = this;
    gear.spawnSpares(ecto, 4, 0);
    gear.slot = 0;
    this.slotIndex = 0;
    ecto.slots[0]?.add(gear.pack); gear.pack.position.set(0, 0, 0); gear.pack.quaternion.identity();
    gear.dock();
    this.scene.add(avatar.object);
    this.rig.yaw = player.yaw + 0.25;
    this.hud.objective('Suit up at the back of the Ecto-1');
    this.ghosts.forEach((g, i) => {
      g.onWreck = (p) => { this.hud.damage(p); this.net?.wrecked(p); };
      g.onKnock = (p, imp) => this.net?.knocked(p, imp);
      g.onEat = (p) => this.net?.ate(p);
      if (i > 0) g.deactivate(); else g.start();
    });
    this.proton.onWreck = (p, dir) => this.net?.wrecked(p, dir);
    this.proton.onBoom = (p, n, d) => this.net?.boom(p, n, d);
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
    this.onStyle?.(s);
    try { localStorage.setItem('gb.style', s); } catch {}
  }

  wornPose() { return this.avatar.wornPose(); }

  packToBack() {
    this.avatar.wear(this.gear.pack);
    this.packMode = 'worn'; this.gear.state = 'worn';
  }

  backPose(pos, quat) {
    const w = this.wornPose(), b = this.avatar.bone(w.bone);
    b.updateWorldMatrix(true, false);
    _a.copy(w.pos).applyMatrix4(b.matrixWorld); pos.copy(_a);
    b.getWorldQuaternion(_q); quat.copy(_q).multiply(w.quat);
  }

  detachToScene(o) { o.updateWorldMatrix(true, false); o.matrixWorld.decompose(_a, _q, _s); this.scene.add(o); o.position.copy(_a); o.quaternion.copy(_q); }

  near(p, r) { return this.player.feet.distanceTo(p) < r; }

  car(action, v, broadcast = true) {
    const e = this.ecto;
    let d = 0;
    if (action === 'rear') e.openRear(!!v);
    else if (action === 'tray') d = v ? e.deployTray() : e.stowTray();
    if (broadcast) this.net?.emit('car', { a: action, v: v ? 1 : 0 });
    return d;
  }

  async suitUp() {
    const { ecto, gear, avatar, player, rig, audio } = this;
    this.busy = true; player.packed = false; this.packState = 2;
    const target = ecto.pickupPose(this.slotIndex, V());
    const from = player.feet.clone(), fy = player.yaw;
    rig.startCine(this.cineSuit());
    this.car('rear', 1);
    const walk = 0.8;
    let t0 = this.time;
    this.autopilot = () => {
      const k = Math.min(1, (this.time - t0) / walk), e = k * k * (3 - 2 * k);
      player.teleport(_a.lerpVectors(from, target.pos, e).setY(target.pos.y), fy + Math.atan2(Math.sin(target.yaw - fy), Math.cos(target.yaw - fy)) * e);
      player.vel.set(0, 0, 0); player.speed = k < 1 ? 1.2 : 0;
    };
    await this.wait(Math.max(0.85, ecto.seq.slideAt));
    this.autopilot = null;
    if (ecto.partT('tray') < 0.99) await this.wait(this.car('tray', 1) + 0.1);
    const clip = avatar.anim.has('don_pack');
    if (clip && avatar.carriers.pack) {
      const ev = avatar.json?.events?.don_pack || avatar.json?.don_pack || {};
      const dur = avatar.anim.dur('don_pack');
      this.detachToScene(gear.pack); this.packMode = 'carrier';
      avatar.anim.play('don_pack', { lock: true });
      avatar.anim.oneshot.hold = true;
      this.packState = 3;
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
      this.packState = 3;
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
    player.packed = true; this.packState = 1;
    this.hud.toast('Pack powered up', 1.4);
    await this.wait(0.7);
    const others = this.net ? this.net.suiting() : 0;
    const back = others ? 0 : this.car('tray', 0);
    rig.endCine('foot'); rig.yaw = player.yaw; rig.pitch = -0.1;
    await this.wait(back);
    if (!others) this.car('rear', 0);
    this.busy = false;
    if (this.mission === 'suit') this.mission = this.engaged ? 'bust' : 'find';
  }

  async unsuit() {
    const { ecto, gear, player, audio } = this;
    this.busy = true; this.proton.stopAll(); gear.powerDown(); this.packState = 2;
    this.car('rear', 1);
    await this.wait(ecto.seq.slideAt);
    if (ecto.partT('tray') < 0.99) await this.wait(this.car('tray', 1) + 0.1);
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
    this.packMode = 'slot'; gear.state = 'stowed'; player.packed = false; this.packState = 0;
    await this.wait(0.3);
    if (!(this.net && this.net.suiting())) { await this.wait(this.car('tray', 0)); this.car('rear', 0); }
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
    let seat = 0;
    if (this.net) { seat = await this.net.takeSeat(); if (seat < 0) { this.hud.toast('The Ecto-1 is full', 1.4); return; } }
    this.busy = true; this.seat = seat;
    const door = seat === 1 || seat === 3 ? 'doorR' : 'doorL';
    ecto.set(door, 1, 2.6);
    this.audio.play('door_open', { obj: ecto.parts[door]?.o || ecto.root });
    player.mode = 'script';
    await this.wait(0.38);
    player.setActive(false);
    player.mode = 'car';
    ecto.root.add(avatar.object);
    const s = ecto.seatPose(seat);
    avatar.object.position.copy(s.pos); avatar.object.quaternion.copy(s.quat);
    avatar.anim.setMode('sit');
    if (seat === 0) { ecto.occupied = true; ecto.setLocal(true); }
    rig.mode = 'car'; rig.blend = 0; rig.from.pos.copy(this.camera.position); rig.from.look.copy(this.camera.position);
    await this.wait(0.25);
    ecto.set(door, 0, 2.4);
    await this.wait(0.42);
    this.audio.play('door_close', { obj: ecto.root });
    if (seat === 0) ecto.startEngine();
    this.busy = false;
  }

  async exitCar() {
    const { ecto, player, avatar, rig } = this;
    this.busy = true;
    const seat = this.seat, door = seat === 1 || seat === 3 ? 'doorR' : 'doorL';
    if (seat === 0) ecto.occupied = false;
    ecto.set(door, 1, 2.6);
    this.audio.play('door_open', { obj: ecto.root });
    await this.wait(0.35);
    const ex = ecto.empties.exit;
    if (ex) ex.getWorldPosition(_a); else ecto.doorPoint(_a);
    if (seat === 1 || seat === 3) { ecto.root.worldToLocal(_t.copy(_a)); _t.x = -_t.x; ecto.root.localToWorld(_a.copy(_t)); }
    if (seat >= 2) { ecto.root.worldToLocal(_t.copy(_a)); _t.z -= 1.05; ecto.root.localToWorld(_a.copy(_t)); }
    _a.y = Math.max(0, _a.y);
    let yaw = player.yaw;
    if (ex) { ex.getWorldQuaternion(_q); _b.set(0, 0, 1).applyQuaternion(_q); if (seat === 1 || seat === 3) _b.negate(); yaw = Math.atan2(_b.x, _b.z); }
    this.scene.add(avatar.object);
    avatar.anim.setMode('loco');
    player.teleport(_a, yaw); player.setActive(true); player.mode = 'foot';
    ecto.forward(_c); rig.mode = 'foot'; rig.yaw = Math.atan2(_c.x, _c.z) - 0.35; rig.pitch = -0.12; rig.blend = 0; rig.from.pos.copy(this.camera.position); this.camera.getWorldDirection(_b); rig.from.look.copy(this.camera.position).add(_b);
    if (seat === 0) { ecto.stopEngine(); if (this.net) ecto.setLocal(false); }
    if (this.net) this.net.leaveSeat(seat);
    await this.wait(0.3);
    ecto.set(door, 0, 2.4);
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

  ghostsLeft() { return this.ghosts.filter((g) => g.active && g.alive).length; }

  updateObjective() {
    const g = this.ghost, t = this.trap, m = this.mission;
    if (m === 'suit' || this.done) return;
    const left = this.ghostsLeft(), many = this.ghosts.filter((x) => x.active).length > 1;
    const tail = many && left > 0 ? ` (${left} ghosts left)` : '';
    if (t.state === 'full' || t.state === 'carried') { this.hud.objective(t.state === 'carried' ? 'Carry the trap back to the Ecto-1' : 'Pick up the trap (E)'); return; }
    if (m === 'wait') { this.hud.objective('Waiting for the team to stow their traps'); return; }
    if (!left) { this.hud.objective(this.net ? 'All ghosts trapped. Stow the traps' : 'Pick up the trap (E)'); return; }
    if (m === 'find') { this.hud.objective('Find the ghost. Follow the munching.' + tail); return; }
    if (t.state === 'sucking') this.hud.objective("It's going in!");
    else if (this.proton.wrangling) {
      if (t.state === 'belt') this.hud.objective('Got it! Throw the trap under it (Q)');
      else if (t.state === 'armed') this.hud.objective(this.near(t.pedalPos, 9) ? 'Stomp the pedal to open the trap (Q)' : 'Get back to the pedal');
      else if (t.state === 'open') this.hud.objective('Drag it into the light!');
      else this.hud.objective('Hold on to it!');
    } else if (g.capturable) this.hud.objective('It is weak. Hit it again to lock the capture stream' + tail);
    else this.hud.objective((t.state === 'belt' ? 'Weaken it with the stream (LMB)' : 'Weaken it and drag it over a trap') + tail);
  }

  interactions() {
    const { input, ecto, trap, player, gear, hud } = this;
    let prompt = null;
    this.useAt = null;
    if (this.busy || player.mode === 'script') { hud.prompt(null); return; }
    if (player.mode === 'car') {
      const canOut = Math.abs(ecto.fwdSpeed) < 3;
      hud.prompt(canOut ? 'F' : null, 'Get out');
      if (input.pressed('KeyF') && canOut) this.exitCar();
      if (this.seat === 0 && input.pressed('KeyH')) ecto.toggleSiren();
      if (input.pressed('KeyG')) { this.audio.play('ecto_horn', { obj: ecto.root, bus: 'car' }); this.net?.emit('horn', {}); }
      return;
    }
    const rear = ecto.rearPoint(_a), door = ecto.doorPoint(_b);
    const nearRear = this.near(rear, 2.1), nearDoor = this.near(door, 1.7);
    ecto.root.worldToLocal(_t.copy(this.player.feet));
    const nearPass = Math.abs(_t.x + 1.45) < 0.9 && Math.abs(_t.z) < 1.6;
    const side = nearDoor ? 'door' : 'pass';
    if (trap.state === 'carried' && nearRear) prompt = ['E', 'Stow the trap', () => this.stowTrap(), 'rear'];
    else if (trap.state === 'full' && this.near(trap.pos, 1.8)) prompt = ['E', 'Pick up the trap', () => this.pickTrap(), 'trap'];
    else if (trap.state === 'armed' && this.near(trap.pos, 1.6)) prompt = ['E', 'Pick up the trap', () => { trap.pickUp(); this.audio.play('cloth_rustle', { pos: trap.pos }); }, 'trap'];
    else if (nearRear && gear.state === 'stowed') prompt = ['E', 'Suit up', () => this.suitUp(), 'rear'];
    else if (nearRear && gear.state === 'worn' && (trap.state === 'belt' || trap.state === 'stowed') && (this.mission === 'done' || this.mission === 'wait' || trap.state === 'stowed' || !this.ghostsLeft())) prompt = ['E', 'Stow your gear', () => this.unsuit(), 'rear'];
    else if (nearDoor || (this.net && nearPass)) prompt = gear.state === 'stowed' ? ['F', this.net && this.net.carDriver() ? 'Ride along' : 'Drive', () => this.enterCar(), side] : ['F', 'Stow your gear first', null, side];
    this.useAt = prompt ? prompt[3] : null;
    hud.prompt(prompt ? prompt[0] : null, prompt ? prompt[1] : '', prompt ? this.anchor(prompt[3], _u) : null, !!(prompt && prompt[2]));
    if (prompt && prompt[2] && input.pressed('Key' + prompt[0])) prompt[2]();
    if (gear.state === 'worn' && input.pressed('KeyQ')) {
      if (trap.state === 'belt') this.throwTrap();
      else if (trap.state === 'armed') { if (this.near(trap.pedalPos, 9)) { trap.stomp(); if (this.avatar.anim.has('stomp_pedal')) this.avatar.anim.play('stomp_pedal', { upper: false }); } else hud.toast('Too far from the pedal', 1.2); }
    }
    if (gear.state === 'worn' && input.pressed('KeyR') && gear.manualVent()) hud.toast('Venting', 0.9);
  }

  anchor(at, out) {
    const m = this.ecto.root.matrixWorld;
    if (at === 'rear') return out.set(0, 1.0, -3.05).applyMatrix4(m);
    if (at === 'door') return out.set(1.0, 1.05, 0.45).applyMatrix4(m);
    if (at === 'pass') return out.set(-1.0, 1.05, 0.0).applyMatrix4(m);
    return out.copy(this.trap.pos).add(_t.set(0, 0.35, 0));
  }

  guides() {
    const { hud, trap, gear, player } = this;
    if (this.done || player.mode !== 'foot' || this.busy) return;
    const at = this.useAt, feet = player.feet;
    if (at !== 'rear') {
      const label = trap.state === 'carried' ? 'Stow the trap' : gear.state === 'stowed' && this.mission === 'suit' ? 'Suit up' : gear.state === 'worn' && trap.state === 'stowed' ? 'Stow your gear' : '';
      if (label) { this.anchor('rear', _u); hud.mark('rear', _u, { kind: 'hint', key: 'E', label, dist: feet.distanceTo(_u), edge: true }); }
    }
    if (trap.state === 'full' && at !== 'trap') { this.anchor('trap', _u); hud.mark('trap', _u, { kind: 'hint', key: 'E', label: 'Trap', dist: feet.distanceTo(_u), edge: true }); }
    if (gear.state === 'stowed' && this.mission !== 'suit' && at !== 'door' && at !== 'pass') {
      this.anchor('door', _u);
      const d = feet.distanceTo(_u);
      if (d < 45) hud.mark('door', _u, { kind: 'hint', key: 'F', label: 'Drive', dist: d });
    }
    if (!this.engaged && !this.net?.engaged) return;
    for (const g of this.ghosts) {
      if (!g.active || !g.alive || g.puppet || g.state === 'wrangled' || g.state === 'sucked') continue;
      const d = feet.distanceTo(g.pos);
      hud.mark('g' + g.id, g.pos, { kind: 'ghost', label: g.name || 'Onionhead', dist: d, edge: true, offOnly: d < 22 });
    }
  }

  pickTrap() {
    this.trap.pickUp();
    this.audio.play('cloth_rustle', { pos: this.trap.pos });
    if (this.mission !== 'done') this.mission = 'return';
  }

  async stowTrap() {
    const { ecto, trap } = this;
    this.busy = true;
    this.car('rear', 1);
    await this.wait(0.9);
    const st = ecto.empties.stow;
    trap.setState('stowed');
    if (st) { st.add(trap.holder); trap.holder.position.set(0, 0, 0); trap.holder.quaternion.identity(); }
    else trap.holder.visible = false;
    this.audio.play('trap_land', { obj: ecto.root });
    await this.wait(0.6);
    if (!(this.net && this.net.suiting())) this.car('rear', 0);
    await this.wait(1.0);
    trap.snd.beep?.stop(0.4);
    this.busy = false;
    if (!this.net) this.finish();
    else { this.mission = 'wait'; this.net.checkWin(); }
  }

  finish(team) {
    if (this.done) return;
    this.done = true; this.mission = 'done';
    this.stats.time = this.time - this.startT;
    this.stats.slams = this.proton.stats.slams; this.stats.darts = this.proton.stats.darts;
    if (team) { this.hud.bill = team.bill ?? this.hud.bill; this.hud.broken = team.broken ?? this.hud.broken; this.stats.team = team.n; }
    if (this.net) this.stats.crew = this.net.room.order.map((p) => String(this.net.room.players[p]?.nick || 'Buster').toUpperCase()).join(', ');
    this.hud.objective('Bust complete');
    this.hud.report(this.stats);
    document.exitPointerLock?.();
    this.input.enabled = false;
  }

  captureStep(dt) {
    const traps = [{ owner: this.net ? this.net.pid : 'me', trap: this.trap }];
    if (this.net) for (const r of this.net.remotes.values()) if (r.trap && r.st) traps.push({ owner: r.pid, trap: r.trap });
    for (const g of this.ghosts) { g.trapPull = null; g.trapNear = null; }
    for (const { owner, trap } of traps) {
      if (trap.state !== 'open') { trap.progress = Math.max(0, (trap.progress || 0) - dt); continue; }
      trap.beamPos(_a);
      let any = false;
      for (const g of this.ghosts) {
        if (!g.active || !g.alive || g.puppet) continue;
        const dn = Math.hypot(g.pos.x - _a.x, g.pos.z - _a.z);
        if (dn < 6 && (!g.trapNear || dn < g.trapNear.distanceTo(g.pos))) g.trapNear = _a.clone();
        if (!trap.inCone(g.pos)) continue;
        any = true;
        g.trapPull = _a.clone();
        if (g.state === 'wrangled') trap.progress = (trap.progress || 0) + dt / (1.1 + Math.max(0, g.will) / 35 * 1.4);
        else if (g.state !== 'sucked') trap.progress = (trap.progress || 0) + dt * 0.15;
        if (trap.progress >= 1) {
          trap.progress = 0;
          g.startSuck(_a.clone(), owner);
          if (trap === this.trap) { this.trap.beginSuck(g); this.proton.stopAll(); }
          else this.net?.emit('suck', { to: owner, g: g.id });
          break;
        }
      }
      if (!any) trap.progress = Math.max(0, (trap.progress || 0) - dt * 0.5);
    }
  }

  onCaptured(g) {
    const by = this.net && g.owner && g.owner !== this.net.pid ? String(this.net.room.players[g.owner]?.nick || 'They').toUpperCase() : null;
    this.hud.toast(by ? `${by} got one!` : 'We got one!', 2.2);
    if (this.proton.target === g) this.proton.stopAll();
    if (!this.ghostsLeft() && this.mission !== 'done') this.mission = 'return';
    this.net?.ghostCaptured(g);
  }

  demo() {
    const { gear, player, rig, input } = this;
    const ghost = this.ghosts[0];
    this.packToBack(); gear.holdWand(); this.wandMode = 'hold'; this.wandBlend = 1;
    gear.power = true; gear.powered = 1; player.packed = true; this.packState = 1;
    this.mission = 'bust'; this.engaged = true;
    player.teleport(V(6.2, 0, 9.5), 0.15);
    ghost.set('roam'); ghost.pos.set(7.6, 2.9, 16.5); ghost.vel.set(0, 0, 0); ghost.will = 30;
    ghost.prankT = ghost.tauntT = ghost.swoopCd = 1e9;
    rig.yaw = 0.12; rig.pitch = 0.06;
    input.enabled = true; input.locked = true;
    this.demoOn = true;
  }

  demoTick() {
    const { gear, rig, input, camera, proton } = this;
    const ghost = this.ghosts[0];
    if (!ghost.alive) return;
    const home = _a.set(7.6 + Math.sin(this.time * 0.9) * 1.2, 2.9 + Math.sin(this.time * 1.3) * 0.5, 16.5);
    if (ghost.state !== 'wrangled') ghost.pos.lerp(home, 0.05);
    camera.getWorldPosition(_b);
    const d = _c.copy(proton.wrangling ? home : ghost.pos).sub(_b);
    rig.yaw += (Math.atan2(d.x, d.z) - rig.yaw) * 0.08;
    rig.pitch += (Math.atan2(d.y, Math.hypot(d.x, d.z)) - rig.pitch) * 0.08;
    input.btn[0] = true; input.locked = true;
    gear.heat = Math.min(gear.heat, 0.35); gear.over = 0;
    proton.tension = 0; ghost.will = Math.max(ghost.will, 18);
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
    const { input, rig, player, avatar, ecto, gear, trap, proton, hud, fx } = this;
    if (this.demoOn) this.demoTick();
    this.jumpQ = input.pressed('Space') ? 0.15 : Math.max(0, (this.jumpQ || 0) - dt);
    rig.input(input.dx, input.dy);
    this.interactions();
    this.autopilot?.(dt);
    const onFoot = player.mode === 'foot';
    const armed = gear.state === 'worn' && this.wandMode === 'hold' && !this.wandHide && onFoot && !this.busy;
    const firing = armed && input.btn[0] && input.locked;
    const aim = armed && (firing || input.btn[2] || proton.wrangling);
    this.aimHeld = aim;
    player.update(dt, alpha, { aim, face: aim ? Math.atan2(proton.aim.x - player.feet.x, proton.aim.z - player.feet.z) : undefined });
    ecto.interp(alpha);
    ecto.update(dt, this.time);
    this.pivot.copy(player.feet).add(_a.set(0, avatar.height * 0.9, 0));
    if (player.mode === 'car') rig.update(dt, { car: ecto.root, speed: ecto.speed });
    else rig.update(dt, { pivot: this.pivot, aim, sprint: input.key('ShiftLeft') && !aim, ground: player.feet.y });
    this.camera.getWorldPosition(this.camPos); this.camera.getWorldDirection(this.camDir); rig.right(this.camRight);
    if (player.mode === 'car') this.camRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const sp = player.mode === 'foot' ? player.speed : 0;
    avatar.update({ speed: sp, grounded: player.grounded, vy: player.vy }, dt, { overlay: null, dir: player.animDir, sitClip: 'Sitting_Idle_Loop' });
    if (this.packMode === 'carrier' && avatar.carriers.pack) avatar.carrierPose('pack', gear.pack.position, gear.pack.quaternion);
    if (this.wandMode === 'carrier' && avatar.carriers.wand) avatar.carrierPose('wand', gear.wand.position, gear.wand.quaternion);
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
    this.heads.length = 1;
    if (this.net) for (const r of this.net.remotes.values()) if (r.st && r.ready && r.st.m !== 'c') this.heads.push((r.head ||= V()).copy(r.pos).add(_a.set(0, (r.avatar.height || 1.75) - 0.1, 0)));
    let openTrap = trap.state === 'open' ? trap : null;
    if (!openTrap && this.net) for (const r of this.net.remotes.values()) if (r.trap && r.trap.state === 'open' && (!openTrap || r.trap.pos.distanceTo(player.feet) < openTrap.pos.distanceTo(player.feet))) openTrap = r.trap;
    proton.update(dt, {
      enabled: armed, fire: firing, rmb: armed && input.btnHit[2] && input.locked, camPos: this.camPos, camDir: this.camDir, camRight: this.camRight, pivot: this.pivot,
      tip: this.tipW, wandDir: this.wandDirW, aimOut: _c, flick: input.flick, wheel: input.wheel, trapOpen: !!openTrap, trapPos: openTrap ? openTrap.beamPos(_s) : _s,
      pull: (v) => { player.vel.x += v.x * dt * 3; player.vel.z += v.z * dt * 3; },
    });
    if (!this.engaged && this.mission !== 'suit') {
      for (const g of this.ghosts) if (g.active && g.alive && (g.lastHit < 0.2 || player.feet.distanceTo(g.pos) < 15)) { this.engaged = true; this.net?.emit('engage', {}); break; }
      if (this.engaged) { this.mission = 'bust'; this.ghost.say('ghost_laugh', 1.2); hud.toast('There it is!', 1.4); }
    } else if (this.engaged && this.mission === 'find') this.mission = 'bust';
    if (this.authority) this.captureStep(dt);
    else if (trap.state === 'open') trap.progress = this.ghosts.some((g) => g.active && g.alive && trap.inCone(g.pos)) ? 0.5 : 0;
    const gctx = {
      playerHead: this.head, players: this.heads, engaged: this.engaged || !!this.net?.engaged,
      onSlime: (i) => { if (i === 0) this.slime(); else this.net?.slimeHead(i); },
      onSlam: (p, g) => { proton.onSlam(p, g); this.net?.emit('slamfx', { p: [p.x, p.y, p.z] }); },
      onCaptured: (g) => this.onCaptured(g),
    };
    for (const g of this.ghosts) { gctx.trapPull = g.trapPull; gctx.trapNear = g.trapNear; g.update(dt, gctx); }
    trap.update(dt, { steam: gear.steam, near: true });
    gear.update(dt, { firing: proton.on, mode: proton.mode, style: this.style });
    this.net?.update(dt, this.time);
    this.plate.update(dt);
    fx.update(dt, this.time);
    this.updateObjective();
    const gh = this.ghost;
    const fightUI = (this.engaged || this.net?.engaged) && !this.done && gh.alive && gh.active;
    hud.ghost(fightUI, gh.will, gh.state === 'wrangled' ? (proton.wrangling ? (proton.counter > 0.25 ? 'Holding it' : 'Fight its pull') : 'Wrangled. Help hold it!') : gh.capturable ? 'Weak. Lock the capture stream' : '');
    hud.cross(armed && player.mode === 'foot', proton.wrangling ? proton.tension : 0, this.ghosts.some((g) => g.alive && g.active && proton.aim.distanceTo(g.pos) < g.radius * 1.4));
    hud.heat(gear.state === 'worn' && player.mode === 'foot', gear.heat, gear.heat > 0.82, gear.over > 0);
    hud.speed(player.mode === 'car' && this.seat === 0, Math.abs(ecto.fwdSpeed) * 2.237);
    this.guides();
    hud.update(dt, this);
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
    if (this.ecto.local === false) this.ecto.netFixed(h);
    else this.ecto.fixed(h, input.enabled && this.seat === 0 ? input : null);
  }
}
