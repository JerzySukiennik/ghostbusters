// Player avatar: loads the Ghostbuster GLB (or the plain Jurek fallback), owns the animator, prop carriers, name tag, harness and arm IK.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Animator } from './anim.js';
import { findNode } from '../engine/assets.js';

const CUSTOM = ['don_pack', 'fire_ready', 'fire_aim', 'wrangle', 'throw_trap', 'stomp_pedal', 'celebrate'];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion();
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _t = V(), _p = V(), _q = Q(), _q2 = Q(), _pq = Q();
export const CHARACTERS = ['jurek', 'crew_1', 'crew_2', 'crew_3'];
const URL = (c) => (c === 'jurek' ? 'assets/avatar/jurek_gb.glb' : `assets/avatar/${c}.glb`);
const hipY = (root) => { root.updateMatrixWorld(true); let y = 0; root.traverse((o) => { if (o.isBone && o.name === 'Hips') y = o.getWorldPosition(V()).y; }); return y || 0.925; };

export class Avatar {
  static async available(assets) {
    const out = [];
    for (const c of CHARACTERS) if (await assets.exists(URL(c))) out.push(c);
    return out;
  }

  static async load(assets, nick = 'JUREK', char = 'jurek', clone = false) {
    if (!CHARACTERS.includes(char)) char = 'jurek';
    let key = char, gltf = await assets.glb(URL(char), 'Ghostbuster');
    if (!gltf && char !== 'jurek') { key = 'jurek'; gltf = await assets.glb(URL('jurek'), 'Ghostbuster'); }
    const real = !!gltf;
    if (!gltf) { key = 'base'; gltf = await assets.glb('assets/lead/jurek_base.glb', 'Avatar'); }
    const json = real ? await assets.json('assets/avatar/avatar.json') : null;
    const crew = real && key !== 'jurek' ? (await assets.json('assets/avatar/crew.json'))?.characters?.[key] : null;
    const shared = real && key !== 'jurek' ? await assets.glb(URL('jurek'), 'Ghostbuster') : null;
    if (!gltf.pristine) gltf.pristine = cloneSkinned(gltf.scene);
    const src = clone || gltf.used ? { scene: cloneSkinned(gltf.pristine), animations: gltf.animations } : gltf;
    gltf.used = true;
    const own = !!(src.animations && src.animations.length);
    const anims = (own ? src.animations : shared?.animations) || [];
    const a = new Avatar({ scene: src.scene, animations: anims }, real, crew?.packWorn ? { ...json, packWorn: crew.packWorn } : json);
    if (!own && shared) { if (!shared.pristine) shared.pristine = cloneSkinned(shared.scene); a.clipScale = a.d.restWorldP.get('Hips').y / hipY(shared.pristine); }
    a.char = key;
    a.setNick(nick);
    await a.init(key);
    return a;
  }

  constructor(gltf, real, json) {
    this.real = real; this.json = json || {};
    this.object = new THREE.Group(); this.object.name = 'Player';
    this.root = gltf.scene;
    this.object.add(this.root);
    this.bones = new Map();
    this.root.traverse((o) => { if (o.isBone) this.bones.set(o.name, o); });
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      if (o.isSkinnedMesh) o.frustumCulled = false;
      for (const m of [].concat(o.material)) if (m && 'envMapIntensity' in m) m.envMapIntensity = 0.7;
    });
    this.harness = findNode(this.root, 'Harness');
    if (this.harness) this.harness.visible = false;
    this.tag = findNode(this.root, 'NameTag');
    this.carriers = { pack: findNode(this.root, 'PackCarrier'), wand: findNode(this.root, 'WandCarrier'), trap: findNode(this.root, 'TrapCarrier') };
    this.root.updateMatrixWorld(true);
    const rest = new Map(), rq = new Map(), rp = new Map();
    for (const [n, b] of this.bones) { rest.set(n, { p: b.position.clone(), q: b.quaternion.clone() }); rq.set(n, b.getWorldQuaternion(Q())); rp.set(n, b.getWorldPosition(V())); }
    this.d = { root: this.root, bones: this.bones, rest, restWorldQ: rq, restWorldP: rp };
    this.clipsRaw = (gltf.animations || []).filter((c) => CUSTOM.includes(c.name));
    this.height = rp.get('Head') ? rp.get('Head').y + 0.12 : 1.74;
    this.scale = (rp.get('Hips')?.y || 0.925) / 0.925;
    this.hand = {};
    for (const s of ['Left', 'Right']) {
      const h = this.bones.get(s + 'Hand');
      if (!h) continue;
      const hp = rp.get(s + 'Hand'), mid = rp.get(s + 'HandMiddle1') || rp.get(s + 'HandIndex1');
      const idx = rp.get(s + 'HandIndex1'), lit = rp.get(s + 'HandLittle1') || rp.get(s + 'HandRing1');
      const inv = rq.get(s + 'Hand').clone().invert();
      const axis = mid ? mid.clone().sub(hp).normalize().applyQuaternion(inv) : new THREE.Vector3(0, 1, 0);
      let palm = new THREE.Vector3(0, 0, 1);
      if (idx && lit) {
        const n = idx.clone().sub(hp).cross(lit.clone().sub(hp)).normalize();
        const toBody = rp.get('Hips').clone().setY(hp.y).sub(hp).normalize();
        if (n.dot(toBody) < 0) n.negate();
        palm = n.applyQuaternion(inv);
      }
      const fingers = [];
      for (const f of ['Index', 'Middle', 'Ring', 'Little']) for (let i = 1; i <= 3; i++) { const b = this.bones.get(`${s}Hand${f}${i}`); if (b) fingers.push(b); }
      const thumb = [1, 2, 3].map((i) => this.bones.get(`${s}HandThumb${i}`)).filter(Boolean);
      this.hand[s] = { axis, palm, fingers, thumb };
    }
    this.curlAxis = new THREE.Vector3(1, 0, 0);
  }

  async init(key) {
    this.anim = await Animator.create(this.d, this.clipsRaw, key, this.clipScale || 1);
  }

  setNick(nick) {
    if (!this.tag) return;
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#1b1b1b'; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
    g.fillStyle = '#1b1b1b'; g.font = '700 74px "Arial Narrow", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(nick).toUpperCase().slice(0, 12), 256, 68, 470);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4;
    if (!this.tagOwn) { this.tag.material = Array.isArray(this.tag.material) ? this.tag.material.map((x) => x.clone()) : this.tag.material.clone(); this.tagOwn = true; }
    const m = [].concat(this.tag.material)[0];
    if (m) { m.map = t; m.needsUpdate = true; }
  }

  bone(n) { return this.bones.get(n); }

  wornPose() {
    const j = this.json?.packWorn;
    if (j && j.position) return { bone: j.bone || 'Spine2', pos: V().fromArray(j.position), quat: Q().fromArray(j.quaternion || [0, 0, 0, 1]) };
    const s2 = this.d.restWorldP.get('Spine2'), s2q = this.d.restWorldQ.get('Spine2');
    const want = V(0, s2.y - 0.1, s2.z - 0.115);
    return { bone: 'Spine2', pos: want.sub(s2).applyQuaternion(s2q.clone().invert()), quat: s2q.clone().invert() };
  }

  wear(pack) {
    const w = this.wornPose(), b = this.bone(w.bone);
    if (!b) return;
    b.add(pack); pack.position.copy(w.pos); pack.quaternion.copy(w.quat);
    if (this.harness) this.harness.visible = true;
  }

  setWorldQuat(bone, qw) {
    bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.copy(_pq.invert().multiply(qw));
    bone.updateMatrixWorld(true);
  }

  rotateToward(bone, childPos, target) {
    bone.getWorldPosition(_a);
    _b.copy(childPos).sub(_a).normalize();
    _c.copy(target).sub(_a).normalize();
    if (_b.lengthSq() < 1e-8 || _c.lengthSq() < 1e-8) return;
    _q.setFromUnitVectors(_b, _c);
    bone.getWorldQuaternion(_q2);
    this.setWorldQuat(bone, _q.multiply(_q2));
  }

  solveArm(side, target, pole, weight = 1) {
    const up = this.bones.get(side + 'Arm'), lo = this.bones.get(side + 'ForeArm'), end = this.bones.get(side + 'Hand');
    if (!up || !lo || !end || weight <= 0) return;
    const A = up.getWorldPosition(V()), B = lo.getWorldPosition(V()), C = end.getWorldPosition(V());
    const tgt = weight < 1 ? C.clone().lerp(target, weight) : target;
    const la = A.distanceTo(B), lb = B.distanceTo(C);
    _d.copy(tgt).sub(A);
    const dist = THREE.MathUtils.clamp(_d.length(), Math.abs(la - lb) + 1e-3, (la + lb) * 0.999);
    _d.normalize();
    const cosA = THREE.MathUtils.clamp((la * la + dist * dist - lb * lb) / (2 * la * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    _e.copy(pole).sub(A); _e.addScaledVector(_d, -_e.dot(_d));
    if (_e.lengthSq() < 1e-8) { _e.copy(B).sub(A); _e.addScaledVector(_d, -_e.dot(_d)); }
    _e.normalize();
    const E = A.clone().addScaledVector(_d, la * cosA).addScaledVector(_e, la * sinA);
    this.rotateToward(up, B, E);
    const C2 = end.getWorldPosition(V());
    _t.copy(A).addScaledVector(_d, dist);
    this.rotateToward(lo, C2, _t);
  }

  orientHand(side, dirW, palmW, weight = 1) {
    const h = this.hand[side], b = this.bones.get(side + 'Hand');
    if (!h || !b || weight <= 0) return;
    const q1 = Q().setFromUnitVectors(h.axis, _a.copy(dirW).normalize());
    const p1 = h.palm.clone().applyQuaternion(q1);
    p1.addScaledVector(_a, -p1.dot(_a)).normalize();
    _b.copy(palmW).addScaledVector(_a, -_b.copy(palmW).dot(_a)).normalize();
    const q2 = Q().setFromUnitVectors(p1, _b);
    const qw = q2.multiply(q1);
    if (weight < 1) { b.getWorldQuaternion(_q2); qw.copy(_q2.slerp(qw, weight)); }
    this.setWorldQuat(b, qw);
  }

  curl(side, amount, thumb = 0.5) {
    const h = this.hand[side];
    if (!h || amount <= 0) return;
    h.fingers.forEach((b, i) => { b.quaternion.multiply(_q.setFromAxisAngle(this.curlAxis, amount * (i % 3 === 0 ? 1.05 : 1.2))); });
    h.thumb.forEach((b) => b.quaternion.multiply(_q.setFromAxisAngle(this.curlAxis, amount * thumb)));
  }

  bend(boneNames, axisW, angle) {
    const k = angle / boneNames.length;
    for (const n of boneNames) {
      const b = this.bones.get(n);
      if (!b) continue;
      b.updateMatrixWorld(true);
      b.getWorldQuaternion(_q2);
      _q.setFromAxisAngle(axisW, k);
      this.setWorldQuat(b, _q.multiply(_q2));
    }
  }

  carrierPose(name, pos, quat) {
    const c = this.carriers[name];
    if (!c) return false;
    c.updateWorldMatrix(true, false);
    c.matrixWorld.decompose(pos, quat, _p);
    return true;
  }

  update(state, dt, opt) {
    if (!this.boneList) { this.boneList = [...this.bones.values()]; this.clean = this.boneList.map((b) => b.quaternion.clone()); }
    const L = this.boneList, C = this.clean;
    for (let i = 0; i < L.length; i++) L[i].quaternion.copy(C[i]);
    this.anim.update(state, dt, opt);
    for (let i = 0; i < L.length; i++) C[i].copy(L[i].quaternion);
    this.root.updateMatrixWorld(true);
  }
}
