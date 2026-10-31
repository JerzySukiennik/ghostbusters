// FX lab scenarios: deterministic timelines (blast, ghost hit, capture, slam, trap, slime, moods, overheat) driving one FX instance.
import * as THREE from 'three';

const V = () => new THREE.Vector3();
const ease = (x) => x * x * (3 - 2 * x);
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export const CAMS = {
  shoulder: { pos: [1.2, 1.95, 4.3], look: [-0.35, 1.55, -5], fov: 50 },
  trap: { pos: [1.75, 1.45, 1.35], look: [0.15, 1.05, -2.6], fov: 50 },
  face: { pos: [0.05, 1.62, 2.95], look: [0.0, 1.58, 0.6], fov: 42 },
  side: { pos: [5.2, 1.7, -0.4], look: [-0.6, 1.6, -3.4], fov: 50 },
  close: { pos: [2.1, 1.55, 0.2], look: [-0.4, 1.55, -3.2], fov: 40 },
};

export const MOOD_LIST = ['idle', 'eat', 'taunt', 'angry', 'flee', 'hurt', 'wrangled', 'sucked'];

export const SCENARIOS = {
  'blast-wall': { label: 'Blast: wall', key: '1', len: 8, cam: 'shoulder' },
  'blast-ghost': { label: 'Blast: ghost', key: '2', len: 6, cam: 'shoulder' },
  capture: { label: 'Capture / wrangle', key: '3', len: 8, cam: 'shoulder' },
  slam: { label: 'Slam', key: '4', len: 5, cam: 'shoulder' },
  trap: { label: 'Trap: open, suck, close', key: '5', len: 7, cam: 'trap' },
  slime: { label: 'Slime swoop', key: '6', len: 4.5, cam: 'shoulder' },
  moods: { label: 'Ghost moods', key: '7', len: 12.8, cam: 'face' },
  heat: { label: 'Overheat', key: '8', len: 6, cam: 'shoulder' },
  side: { label: 'Side view', key: '9', len: 8, cam: 'side' },
};
for (const m of MOOD_LIST) SCENARIOS['mood-' + m] = { label: m, len: 6, cam: 'face', mood: m, hidden: true };

export class Director {
  constructor(set, fx, camera) {
    this.set = set; this.fx = fx; this.camera = camera;
    this.stream = fx.createStream();
    this.ghost = fx.createGhost();
    this.trapFX = fx.createTrapFX(set.trap);
    this.ray = new THREE.Raycaster();
    this.tip = set.wand.getObjectByName('Tip') || set.wand;
    this.v = { o: V(), d: V(), e: V(), n: V(), g: V(), gp: V(), gv: V(), t: V(), a: V(), b: V(), c: V(), sv: V(), cam: V() };
    this.sp = { on: false, mode: 'blast', origin: this.v.o, dir: this.v.d, end: this.v.e, endNormal: this.v.n, endKind: 'surface', heat: 0, tension: 0, ghostPos: this.v.g };
    this.gp = { vel: this.v.gv, mood: 'idle', hurt: 0, struggle: this.v.sv, suck: 0, trapPos: V(), mouth: 0 };
    this.tp = { open: 0, beam: 0, suck: 0, closed: false, smoking: false };
    this.prevT = -1;
    this.manual = null;
    this.doors = [set.trap.getObjectByName('DoorL'), set.trap.getObjectByName('DoorR')];
    this.sphere = new THREE.Sphere(V(), 0.55);
  }

  setCam(name) {
    const c = CAMS[name] || CAMS.shoulder;
    this.camera.position.set(...c.pos);
    this.camera.fov = c.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.v.cam.set(...c.look));
  }

  aimAt(target, withGhost) {
    const { o, d, e, n } = this.v;
    const w = this.set.wand;
    w.position.set(0.52, 1.2, 2.55);
    w.lookAt(target);
    w.updateMatrixWorld(true);
    this.tip.getWorldPosition(o);
    d.copy(target).sub(o).normalize();
    this.ray.set(o, d);
    this.ray.far = 60;
    let kind = 'air';
    let best = 60;
    e.copy(o).addScaledVector(d, 30);
    n.copy(d).negate();
    const hits = this.ray.intersectObjects(this.set.props, false);
    if (hits.length) { best = hits[0].distance; e.copy(hits[0].point); n.copy(hits[0].face.normal).transformDirection(hits[0].object.matrixWorld); kind = 'surface'; }
    if (withGhost && this.ghost.object3D.visible) {
      this.sphere.center.copy(this.ghost.object3D.position);
      this.sphere.radius = 0.5;
      const hp = this.v.c;
      if (this.ray.ray.intersectSphere(this.sphere, hp)) {
        const dist = hp.distanceTo(o);
        if (dist < best) { e.copy(hp); n.copy(hp).sub(this.sphere.center).normalize(); kind = 'ghost'; }
      }
    }
    return kind;
  }

  ghostAt(pos, dt, face = true) {
    const g = this.ghost.object3D, { gp, gv, cam } = this.v;
    gv.copy(pos).sub(g.position).multiplyScalar(dt > 0 ? 1 / dt : 0);
    if (gv.lengthSq() > 900) gv.setLength(30);
    g.position.copy(pos);
    if (face) {
      this.camera.getWorldPosition(cam);
      const yaw = Math.atan2(cam.x - pos.x, cam.z - pos.z);
      g.rotation.set(0, yaw, 0);
      const lean = Math.max(-0.35, Math.min(0.35, -gv.x * 0.05));
      g.rotateZ(lean * Math.cos(yaw));
    }
  }

  events(t, list) {
    for (const [te, fn] of list) if (this.prevT < te && t >= te) fn();
  }

  run(name, t, dt) {
    const S = SCENARIOS[name] || SCENARIOS['blast-wall'];
    const fx = this.fx, sp = this.sp, gp = this.gp, tp = this.tp, v = this.v;
    if (t < this.prevT) this.prevT = -1;
    this.setCam(this.camOverride || S.cam);
    sp.on = false; sp.mode = 'blast'; sp.heat = 0; sp.tension = 0; sp.endKind = 'surface';
    gp.mood = 'idle'; gp.hurt = 0; gp.suck = 0; gp.mouth = 0; v.sv.set(0, 0, 0);
    tp.open = 0; tp.beam = 0; tp.suck = 0; tp.closed = false; tp.smoking = false;
    let ghostVisible = true;
    let trapOn = false;
    const gpos = v.gp;
    const T = v.t;
    if (this.manual && this.manual.active) {
      this.ghostIdle(t, dt);
      const kind = this.aimAt(this.manual.target, true);
      sp.on = this.manual.down;
      sp.endKind = kind;
      if (this.manual.capture && kind === 'ghost') this.manual.locked = true;
      if (!this.manual.down) this.manual.locked = false;
      if (this.manual.locked) { sp.mode = 'capture'; sp.endKind = 'ghost'; gp.mood = 'wrangled'; sp.tension = 0.5 + 0.4 * Math.sin(t * 2.0); v.g.copy(this.ghost.object3D.position); }
      else if (kind === 'ghost' && sp.on) { gp.mood = 'hurt'; gp.hurt = 0.6 + 0.4 * Math.sin(t * 20); }
      sp.heat = this.manual.heat;
      this.finish(t, dt, ghostVisible, false);
      return;
    }
    switch (S.mood ? 'mood' : name) {
      case 'blast-wall': case 'side': {
        ghostVisible = false;
        T.set(-1.0 + 2.6 * Math.sin(t * 0.55), 1.7 + 0.55 * Math.sin(t * 1.13), -9);
        sp.endKind = this.aimAt(T, false);
        sp.on = !(t > 5.0 && t < 5.45);
        sp.heat = cl(0.15 + t * 0.05);
        break;
      }
      case 'heat': {
        ghostVisible = false;
        T.set(3.4 + 0.25 * Math.sin(t * 1.7), 1.5 + 0.4 * Math.sin(t * 0.9), -5.0);
        sp.endKind = this.aimAt(T, false);
        sp.on = true;
        sp.heat = cl(t / 3.2);
        break;
      }
      case 'blast-ghost': {
        gpos.set(-0.4 + 0.9 * Math.sin(t * 1.3), 2.1 + 0.35 * Math.sin(t * 2.1), -4.2 + 0.4 * Math.sin(t * 0.7));
        this.ghostAt(gpos, dt);
        T.copy(gpos).add(v.a.set(0.12 * Math.sin(t * 3.0), 0.08 * Math.cos(t * 2.3), 0));
        sp.endKind = this.aimAt(T, true);
        sp.on = t > 0.3;
        gp.mood = sp.endKind === 'ghost' && sp.on ? 'hurt' : 'angry';
        gp.hurt = sp.endKind === 'ghost' && sp.on ? cl(0.55 + 0.45 * Math.sin(t * 11)) : 0;
        const evs = [];
        for (let k = 0; k < 12; k++) evs.push([0.6 + k * 0.45, () => { if (sp.endKind === 'ghost') fx.impact(v.e, v.n, 'ghostHit'); }]);
        this.events(t, evs);
        break;
      }
      case 'capture': {
        this.capturePos(t, gpos);
        this.ghostAt(gpos, dt);
        this.capturePos(t - 0.4, T);
        this.aimAt(T, false);
        sp.on = true; sp.mode = 'capture'; sp.endKind = 'ghost';
        v.g.copy(gpos);
        sp.tension = cl(0.55 + 0.4 * Math.sin(t * 1.9));
        v.sv.copy(v.gv).normalize().multiplyScalar(0.5 + 0.5 * Math.abs(Math.sin(t * 3)));
        gp.mood = 'wrangled';
        gp.hurt = 0.15 + 0.15 * Math.sin(t * 7);
        break;
      }
      case 'slam': {
        const base = v.c.set(0.1, 0.62, -3.6);
        if (t < 1.4) { this.capturePos(t, gpos); gpos.lerp(v.a.set(0.1, 3.3, -3.6), ease(cl(t / 1.4))); }
        else if (t < 1.68) { const k = (t - 1.4) / 0.28; gpos.set(0.1, 3.3 + (base.y - 3.3) * k * k, -3.6); }
        else if (t < 2.6) { gpos.copy(base); gpos.y += Math.max(0, Math.sin((t - 1.68) * 9) * 0.06 * (2.6 - t)); }
        else { gpos.copy(base); gpos.y += ease(cl((t - 2.6) / 1.6)) * 1.4; }
        this.ghostAt(gpos, dt);
        this.aimAt(gpos, false);
        sp.on = true; sp.mode = 'capture'; sp.endKind = 'ghost'; v.g.copy(gpos);
        sp.tension = t < 1.68 ? 0.9 : 0.4;
        gp.mood = t < 1.4 ? 'wrangled' : t < 2.8 ? 'hurt' : 'wrangled';
        gp.hurt = t >= 1.68 && t < 2.4 ? 1 - (t - 1.68) / 0.72 : 0.1;
        v.sv.set(0, t < 1.68 && t > 1.4 ? -1 : 0, 0);
        this.events(t, [[1.68, () => fx.impact(v.a.set(0.1, 0.0, -3.6), v.b.set(0, 1, 0), 'slam')]]);
        break;
      }
      case 'trap': {
        trapOn = true;
        const tr = this.set.trap.position;
        const open = ease(cl((t - 0.4) / 0.35)) * (t < 3.4 ? 1 : 1 - ease(cl((t - 3.4) / 0.15)));
        tp.open = open;
        tp.beam = ease(cl((t - 0.55) / 0.45)) * (t < 3.42 ? 1 : 0);
        const suck = ease(cl((t - 1.6) / 1.8));
        tp.suck = suck;
        tp.closed = t >= 3.4;
        tp.smoking = t >= 3.5;
        gpos.set(tr.x + 0.25 * Math.sin(t * 2.3) * (1 - suck), 2.15 + 0.12 * Math.sin(t * 3.1), tr.z + 0.15 * Math.sin(t * 1.7));
        this.ghostAt(gpos, dt);
        gp.mood = t < 1.6 ? 'wrangled' : 'sucked';
        gp.suck = suck;
        gp.trapPos.set(tr.x, tr.y + 0.15, tr.z);
        gp.hurt = suck > 0 ? 0.25 * suck : 0.1;
        ghostVisible = t < 3.4;
        if (t < 2.1) {
          this.aimAt(gpos, false);
          sp.on = true; sp.mode = 'capture'; sp.endKind = 'ghost'; v.g.copy(gpos); sp.tension = 0.6;
        } else this.aimAt(gpos, false);
        break;
      }
      case 'slime': {
        const k = cl(t / 1.45);
        this.camera.getWorldPosition(v.cam);
        gpos.set(-1.6 + 2.0 * ease(k), 2.5 - 0.7 * ease(k), -7.5);
        gpos.lerp(v.a.copy(v.cam).add(v.b.set(-0.25, -0.15, -0.9)), Math.pow(k, 2.2));
        if (t > 1.45) gpos.copy(v.cam).add(v.b.set(-0.25 - (t - 1.45) * 4, -0.15 + (t - 1.45) * 2.5, -0.9 + (t - 1.45) * 2));
        this.ghostAt(gpos, dt);
        gp.mood = t < 0.9 ? 'angry' : 'taunt';
        gp.mouth = t > 0.8 && t < 1.6 ? 1 : 0.3;
        ghostVisible = t < 1.6;
        T.set(0, 1.4, -9);
        this.aimAt(T, false);
        this.events(t, [
          [0.45, () => fx.impact(v.a.set(-1.4, 2.6, -9.0), v.b.set(0, 0, 1), 'slime')],
          [0.8, () => fx.impact(v.a.set(-0.7, 0.0, -5.2), v.b.set(0, 1, 0), 'slime')],
          [1.15, () => fx.impact(v.a.set(0.3, 0.0, -1.2), v.b.set(0, 1, 0), 'slime')],
          [1.42, () => fx.slimeScreen(0.95)],
        ]);
        break;
      }
      case 'moods': {
        const idx = Math.min(MOOD_LIST.length - 1, Math.floor(t / 1.6));
        this.moodPose(t, MOOD_LIST[idx], dt);
        ghostVisible = true;
        break;
      }
      case 'mood': {
        this.moodPose(t, S.mood, dt);
        break;
      }
      default: break;
    }
    if (!trapOn) { tp.open = 0; tp.beam = 0; }
    this.finish(t, dt, ghostVisible, trapOn);
  }

  moodPose(t, mood, dt) {
    const { gp: gpos } = this.v;
    gpos.set(0.0 + 0.05 * Math.sin(t * 0.7), 1.62 + 0.04 * Math.sin(t * 1.1), 0.6);
    if (mood === 'flee') gpos.x += Math.sin(t * 2.5) * 0.12;
    if (mood === 'wrangled') gpos.x += Math.sin(t * 7.0) * 0.05;
    this.ghostAt(gpos, dt);
    this.gp.mood = mood === 'sucked' ? 'sucked' : mood;
    this.gp.hurt = mood === 'hurt' ? cl(0.5 + 0.5 * Math.sin(t * 9)) : 0;
    if (mood === 'wrangled') this.v.sv.set(Math.sin(t * 5), 0.3, 0).multiplyScalar(0.7);
    const T = this.v.t.set(-0.2, 1.4, -9);
    this.aimAt(T, false);
  }

  capturePos(t, out) {
    return out.set(-0.2 + Math.sin(t * 2.3) * 1.0 + Math.sin(t * 5.1) * 0.25, 2.0 + Math.sin(t * 1.7) * 0.5 + Math.sin(t * 4.3) * 0.15, -4.0 + Math.sin(t * 1.1) * 0.4);
  }

  ghostIdle(t, dt) {
    const p = this.v.gp.set(-0.4 + 0.8 * Math.sin(t * 0.4), 2.0 + 0.2 * Math.sin(t * 0.9), -4.4);
    this.ghostAt(p, dt);
  }

  finish(t, dt, ghostVisible, trapOn) {
    const fx = this.fx;
    if (this.doors[0] && this.doors[1]) {
      const a = this.tp.open * 1.35;
      this.doors[0].rotation.x = -a;
      this.doors[1].rotation.x = a;
    }
    this.stream.update(dt, this.sp);
    this.ghost.update(dt, this.gp);
    if (!ghostVisible) this.ghost.object3D.visible = false;
    this.trapFX.update(dt, this.tp);
    this.prevT = t;
  }
}
