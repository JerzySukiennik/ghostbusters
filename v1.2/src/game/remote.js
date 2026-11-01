// A teammate seen over the network: cloned character with mocap and the shared wand hold, own pack lights and hose, stream, trap, sounds and a name label, all interpolated from 10 Hz states.
import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { Gear } from './gear.js';
import { WandHold } from './hold.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _q = new THREE.Quaternion();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function label(nick) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 30px -apple-system, "SF Pro Text", Helvetica, Arial, sans-serif';
  const w = Math.min(240, g.measureText(nick).width + 28);
  g.fillStyle = 'rgba(12,14,16,0.62)';
  g.beginPath(); g.roundRect((256 - w) / 2, 12, w, 40, 12); g.fill();
  g.fillStyle = '#f2f0ea'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(nick, 128, 33, 230);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false }));
  s.scale.set(0.16, 0.04, 1); s.renderOrder = 10;
  return s;
}

export class RemotePlayer {
  static async create(o) {
    const r = new RemotePlayer(o);
    await r.init();
    return r;
  }

  constructor({ pid, info, assets, scene, audio, fx, stream, trap, tpl, ecto, game }) {
    Object.assign(this, { pid, info, assets, scene, audio, fx, stream, trap, tpl, ecto, game });
    this.samples = []; this.st = null; this.t = 0;
    this.pos = V(); this.yaw = 0; this.speed = 0; this.hold = new WandHold(); this.aim = V(0, 1, 10); this.end = V(); this.endT = V();
    this.firing = 0; this.pk = 0; this.mode = 'f'; this.slot = -1; this.snd = {};
    this.ready = false; this.gone = false;
  }

  async init() {
    const a = await Avatar.load(this.assets, this.info.nick || 'BUSTER', this.info.char || 'jurek', true);
    if (this.gone) return;
    this.avatar = a;
    this.scene.add(a.object);
    this.gear = new Gear({ packGltf: { scene: this.tpl.pack.clone(true), json: this.tpl.packJson }, wandGltf: { scene: this.tpl.wand.clone(true) }, scene: this.scene, audio: this.audio });
    this.gear.state = 'stowed'; this.gear.pack.visible = false; this.gear.wand.visible = false;
    this.scene.add(this.gear.pack); this.scene.add(this.gear.wand);
    this.label = label((this.info.nick || 'BUSTER').toUpperCase());
    this.scene.add(this.label);
    this.ready = true;
  }

  setInfo(info) {
    if (info.nick !== this.info.nick && this.label) { this.scene.remove(this.label); this.label = label((info.nick || 'BUSTER').toUpperCase()); this.scene.add(this.label); this.avatar?.setNick(info.nick); }
    this.info = info;
  }

  apply(st, now) {
    this.st = st;
    if (st.p) this.samples.push({ t: now, p: V(st.p[0], st.p[1], st.p[2]), y: st.y || 0 });
    if (this.samples.length > 8) this.samples.shift();
    if (st.e) this.endT.set(st.e[0], st.e[1], st.e[2]);
    if (st.a) this.aim.set(st.a[0], st.a[1], st.a[2]);
    if (this.trap) this.trap.fromNet(st.tr);
  }

  sample() {
    const S = this.samples, rt = performance.now() - 130;
    if (!S.length) return;
    let a = S[0], b = S[S.length - 1];
    for (let i = 0; i < S.length - 1; i++) if (S[i].t <= rt && S[i + 1].t >= rt) { a = S[i]; b = S[i + 1]; break; }
    if (rt >= b.t || a === b) { this.pos.copy(b.p); this.yaw = b.y; return; }
    if (rt <= a.t) { this.pos.copy(a.p); this.yaw = a.y; return; }
    const k = (rt - a.t) / Math.max(1, b.t - a.t);
    this.pos.lerpVectors(a.p, b.p, k);
    this.yaw = a.y + wrap(b.y - a.y) * k;
  }

  wearState(pk) {
    if (pk === this.pk) return;
    const g = this.gear, av = this.avatar, prev = this.pk;
    this.carry = null;
    if (pk === 1) {
      if (av.anim.oneshot?.name === 'don_pack') av.anim.stopAction();
      av.wear(g.pack); g.pack.visible = true; g.wand.visible = true; g.holdWand(); g.state = 'worn';
      if (!g.power) { g.power = true; this.audio?.play('pack_powerup', { obj: g.pack, gain: 0.7 }); }
      this.taken = true;
    } else if (pk === 0) {
      if (av.anim.oneshot) av.anim.stopAction();
      this.scene.add(g.pack); g.pack.visible = false; g.wand.visible = false; g.state = 'stowed'; g.power = false; g.powered = 0;
      if (av.harness) av.harness.visible = false;
      this.taken = false;
    } else if (pk === 3) {
      this.scene.add(g.pack); g.dock(); g.pack.visible = true; g.wand.visible = true;
      this.ecto.slotPose(Math.max(0, this.slot), g.pack.position, g.pack.quaternion);
      this.donT = 0; this.drawn = false;
      const ev = av.json?.events?.don_pack || av.json?.don_pack || {};
      if (av.anim.has('don_pack') && av.carriers.pack) {
        const dur = av.anim.dur('don_pack'), at = (k, d) => (typeof ev[k] === 'number' ? ev[k] : d);
        av.anim.play('don_pack', { lock: true }); av.anim.oneshot.hold = true;
        this.carry = { clip: true, harness: av.json?.harnessShowAt ?? at('strapL', 1.4), draw: at('wandDraw', dur - 1.4), power: at('powerUp', dur - 0.6), cues: [[at('grab', 0.5), 'cloth_rustle'], [at('strapL', 1.4), 'strap_buckle'], [at('strapR', 2.2), 'cloth_rustle'], [at('buckle', 2.9), 'strap_buckle']] };
      } else {
        av.anim.play('PickUp_Table', { lock: true, rate: 0.9 });
        this.carry = { clip: false, p0: g.pack.position.clone(), q0: g.pack.quaternion.clone(), harness: 1.7, draw: 1.9, power: 2.1, cues: [[0.45, 'cloth_rustle'], [1.7, 'strap_buckle'], [2.0, 'strap_buckle']] };
      }
      this.taken = true;
    } else if (pk === 2 && prev === 1) av.anim.play('PickUp_Table', { lock: true, rate: 0.9 });
    if (this.slot >= 0) this.game.gear.markTaken(this.slot, !!this.taken);
    this.pk = pk;
  }

  donStep(dt) {
    const c = this.carry, av = this.avatar, g = this.gear, t0 = this.donT;
    this.donT += dt;
    if (c.clip) av.carrierPose('pack', g.pack.position, g.pack.quaternion);
    else {
      const k = Math.min(1, Math.max(0, this.donT - 0.45) / 1.25), e = k * k * (3 - 2 * k), w = av.wornPose(), b = av.bone(w.bone);
      b.updateWorldMatrix(true, false); _a.copy(w.pos).applyMatrix4(b.matrixWorld); b.getWorldQuaternion(_q).multiply(w.quat);
      g.pack.position.lerpVectors(c.p0, _a, e); g.pack.position.y += Math.sin(k * Math.PI) * 0.35; g.pack.quaternion.slerpQuaternions(c.q0, _q, e);
    }
    for (const [t, s] of c.cues) if (t0 < t && this.donT >= t) this.audio?.play(s, { obj: g.pack, gain: 0.7 });
    if (this.donT >= c.harness && av.harness) av.harness.visible = true;
    if (this.donT >= c.draw && !this.drawn) { this.drawn = true; this.audio?.play('wand_draw', { obj: g.wand, gain: 0.8 }); if (c.clip && av.carriers.wand) this.scene.add(g.wand); }
    if (this.drawn && c.clip && av.carriers.wand) av.carrierPose('wand', g.wand.position, g.wand.quaternion);
    if (this.donT >= c.power && !g.power) { g.power = true; this.audio?.play('pack_powerup', { obj: g.pack, gain: 0.7 }); }
  }

  seat(st) {
    const av = this.avatar;
    if (st.m === 'c' && this.ecto) {
      const s = this.ecto.seatPose(st.seat || 0);
      if (av.object.parent !== this.ecto.root) this.ecto.root.add(av.object);
      av.object.position.copy(s.pos); av.object.quaternion.copy(s.quat);
      if (av.anim.mode !== 'sit') av.anim.setMode('sit');
      return true;
    }
    if (av.object.parent !== this.scene) { this.scene.add(av.object); if (av.anim.mode === 'sit') av.anim.setMode('loco'); }
    return false;
  }

  update(dt, time, style) {
    if (!this.ready || !this.st) return;
    this.t += dt;
    const st = this.st, av = this.avatar;
    if (st.slot !== undefined && st.slot !== this.slot) { if (this.slot >= 0) this.game.gear.markTaken(this.slot, false); this.slot = st.slot; if (this.pk) this.game.gear.markTaken(this.slot, true); }
    this.wearState(st.pk || 0);
    this.sample();
    const inCar = this.seat(st);
    if (!inCar) { av.object.position.copy(this.pos); av.object.rotation.set(0, this.yaw, 0); }
    const sp = st.s || 0;
    this.speed += (sp - this.speed) * Math.min(1, dt * 10);
    if (av.anim.mode === 'action' && this.pk !== 2 && this.pk !== 3 && av.anim.oneshot?.name === 'PickUp_Table') av.anim.stopAction();
    av.update({ speed: inCar ? 0 : this.speed, grounded: st.g !== 0, vy: 0 }, dt, { dir: st.ad || 1, sitClip: 'Sitting_Idle_Loop' });
    if (this.carry && this.pk === 3) this.donStep(dt);
    const hold = this.pk === 1 && !inCar ? 1 : 0;
    this.hold.apply(av, dt, { hold, aimHold: st.f > 0 || st.am, wrangle: st.f === 2 ? 1 : 0, sprint: st.sp, wandObj: this.gear.wand, gripFront: this.gear.n.front, time, aimPoint: this.aim, hipOff: st.ho || 0 });
    const g = this.gear;
    g.heat = st.h || 0;
    g.update(dt, { firing: st.f > 0, mode: st.f === 2 ? 'capture' : 'blast', style });
    if (this.label) { av.object.getWorldPosition(_a); this.label.position.copy(_a).add(_b.set(0, (av.height || 1.75) + 0.28, 0)); this.label.visible = !inCar; }
    const on = this.pk === 1 && st.f > 0 && !inCar;
    if (on && g.n.tip) {
      g.n.tip.getWorldPosition(_a); g.n.tip.getWorldQuaternion(_q);
      const dir = _b.set(0, 0, 1).applyQuaternion(_q);
      if (!this.firing) this.end.copy(this.endT);
      this.end.lerp(this.endT, 1 - Math.exp(-dt * 16));
      this.stream?.update(dt, { on: true, mode: st.f === 2 ? 'capture' : 'blast', origin: _a, dir, end: this.end, endNormal: dir.clone().negate(), endKind: st.ek === 1 ? 'ghost' : st.ek === 2 ? 'surface' : 'air', heat: g.heat, tension: st.tn || 0, ghostPos: this.end });
      this.tip = this.tip || V(); this.tip.copy(_a);
      if (!this.snd.loop) { this.audio?.play('stream_start', { pos: _a, gain: 0.8 }); this.snd.loop = this.audio?.loop('stream_loop', { pos: _a, gain: 0.7, fadeIn: 0.08 }); }
      this.snd.loop?.pos(_a);
    } else {
      if (this.firing) this.stream?.update(dt, { on: false });
      if (this.snd.loop) { this.snd.loop.stop(0.12); this.snd.loop = null; this.audio?.play('stream_stop', { pos: this.tip || this.pos, gain: 0.6 }); }
    }
    this.firing = on ? st.f : 0;
    if (this.trap) { this.trap.netStep(dt); this.trap.update(dt, { steam: g.steam }); }
  }

  streamSeg(a, b) {
    if (!this.firing || !this.tip) return false;
    a.copy(this.tip); b.copy(this.end);
    return true;
  }

  dispose() {
    this.gone = true;
    if (this.slot >= 0) this.game.gear.markTaken(this.slot, false);
    this.snd.loop?.stop(0.1);
    this.stream?.update(0.016, { on: false });
    if (this.trap) { this.trap.fromNet({ s: 'belt', p: [0, -50, 0], v: 0 }); }
    if (this.avatar) this.avatar.object.removeFromParent();
    if (this.gear) { this.gear.pack.removeFromParent(); this.gear.wand.removeFromParent(); this.gear.hose.removeFromParent(); for (const it of this.gear.steam.items) it.s.removeFromParent(); this.gear.snd.hum?.stop(0.1); this.gear.snd.alarm?.stop(0.1); }
    this.label?.removeFromParent();
  }
}
