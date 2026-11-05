// Terror dog, 1984 film look: stop-motion demon hound on twelves, wet black hide with ember cracks, glowing red eyes, horns, smoking paws, gait from velocity.
import * as THREE from 'three';
import { NOISE } from '../glsl.js';
import { clamp } from '../util.js';
import { GK_VS, GK_FS, GhostBase, ghostMaterial } from '../ghostkit.js';
import { EYE, EYE_R0, LEGS, NECK, JAW_HINGE, GROUND, LAYOUT, build } from './terror_dog.sdf.js';

const glv = (a) => `vec3(${a[0].toFixed(4)}, ${a[1].toFixed(4)}, ${a[2].toFixed(4)})`;
const F = LEGS[0], H = LEGS[1];

const VS = /* glsl */`
${NOISE}
${GK_VS}
attribute vec4 aW1;
attribute vec4 aW2;
attribute float aMat;
attribute float aLeg;
attribute vec3 aBump;
uniform vec4 uHip;
uniform vec4 uKnee;
uniform float uJaw;
uniform vec3 uHead;
uniform vec3 uTail;
uniform float uHackle;
uniform float uBreath;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vW;
flat varying float vMat;
varying float vSkin;
varying float vHorn;
varying float vJaw;
void main() {
  vec3 p = position;
  vec3 n = normalize(normal + aBump * 0.42);
  int leg = int(aLeg + 0.5);
  if (leg > 0) {
    float sd = (leg == 1 || leg == 3) ? 1.0 : -1.0;
    bool front = leg <= 2;
    vec3 hip = front ? vec3(${F.hip[0].toFixed(3)} * sd, ${F.hip[1].toFixed(3)}, ${F.hip[2].toFixed(3)}) : vec3(${H.hip[0].toFixed(3)} * sd, ${H.hip[1].toFixed(3)}, ${H.hip[2].toFixed(3)});
    vec3 knee = front ? vec3(${F.knee[0].toFixed(3)} * sd, ${F.knee[1].toFixed(3)}, ${F.knee[2].toFixed(3)}) : vec3(${H.knee[0].toFixed(3)} * sd, ${H.knee[1].toFixed(3)}, ${H.knee[2].toFixed(3)});
    float ha = leg == 1 ? uHip.x : leg == 2 ? uHip.y : leg == 3 ? uHip.z : uHip.w;
    float ka = leg == 1 ? uKnee.x : leg == 2 ? uKnee.y : leg == 3 ? uKnee.z : uKnee.w;
    float a = ka * aW1.y;
    p = knee + rotX(p - knee, a);
    n = rotX(n, a);
    a = ha * aW1.x;
    p = hip + rotX(p - hip, a);
    n = rotX(n, a);
  }
  float jaw = aW1.z;
  if (jaw > 0.0) {
    vec3 hg = ${glv(JAW_HINGE)};
    p = hg + rotX(p - hg, uJaw * jaw);
    n = rotX(n, uJaw * jaw);
  }
  float hd = aW1.w;
  if (hd > 0.0) {
    vec3 nk = ${glv(NECK)};
    vec3 r = p - nk;
    r = rotX(r, uHead.x * hd);
    r = rotY(r, uHead.y * hd);
    r = rotZ(r, uHead.z * hd);
    p = nk + r;
    n = rotZ(rotY(rotX(n, uHead.x * hd), uHead.y * hd), uHead.z * hd);
  }
  float tl = aW2.x;
  if (tl > 0.0) {
    float w = tl * tl;
    p.x += sin(uTime * 3.1 - tl * 2.5) * uTail.x * w;
    p.y += uTail.y * w;
    p.z += uTail.z * w;
  }
  float chest = exp(-dot(position - vec3(0.0, 0.0, 0.32), position - vec3(0.0, 0.0, 0.32)) * 9.0);
  p += n * (chest * uBreath * 0.018 + aW2.y * smoothstep(0.26, 0.4, position.y) * uHackle * 0.03);
  gkWobble(p, n, 0.35);
  gkBody(p, n, 1.4);
  vRest = position;
  vMat = aMat;
  vSkin = aW2.w;
  vHorn = aW2.z;
  vJaw = aW1.z;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FS = /* glsl */`
${NOISE}
${GK_FS}
uniform float uEye;
uniform float uEmber;
uniform float uMaw;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vW;
flat varying float vMat;
varying float vSkin;
varying float vHorn;
varying float vJaw;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (!gl_FrontFacing) N = -N;
  float NV = clamp(dot(N, V), 0.0, 1.0);
  float fres = 1.0 - NV;
  int mat = int(vMat + 0.5);
  vec3 spec;
  vec3 col;
  float alpha = 1.0;
  float tq = uTimeQ;
  if (mat == 2) {
    vec3 ec = vec3(vRest.x > 0.0 ? ${EYE[0].toFixed(4)} : ${(-EYE[0]).toFixed(4)}, ${EYE[1].toFixed(4)}, ${EYE[2].toFixed(4)});
    vec3 en = normalize(vRest - ec);
    float core = smoothstep(0.2, 0.95, en.z);
    float slit = smoothstep(0.16, 0.05, abs(en.x)) * smoothstep(0.55, 0.85, en.z);
    col = mix(vec3(1.2, 0.08, 0.02), vec3(3.4, 0.9, 0.25), core) * uEye;
    col = mix(col, vec3(0.05, 0.0, 0.0), slit * 0.85);
  } else if (mat == 3 || mat == 5) {
    vec3 bone = mix(vec3(0.42, 0.36, 0.25), vec3(0.62, 0.56, 0.42), smoothstep(-0.3, 0.6, N.y));
    vec3 b = lightAll(N, V, vW, bone, 0.35, 0.3, spec);
    col = b + spec * 0.6 + vec3(0.25, 0.05, 0.02) * uEmber * 0.15;
  } else if (mat == 1) {
    float ridge = 0.5 + 0.5 * sin((vRest.y + vRest.z) * 70.0);
    vec3 horn = mix(vec3(0.05, 0.035, 0.03), vec3(0.28, 0.22, 0.16), vHorn) * (0.75 + 0.35 * ridge);
    vec3 b = lightAll(N, V, vW, horn, 0.4, 0.25, spec);
    col = b + spec * 0.8;
  } else if (mat == 4) {
    float depth = clamp((1.2 - vRest.z) / 0.3, 0.0, 1.0);
    col = mix(vec3(0.06, 0.008, 0.004), vec3(0.4, 0.06, 0.015), depth * depth) * uMaw;
  } else {
    float cr = sn3(vRest * 9.0 + vec3(0.0, tq * 0.15, 0.0));
    float crack = smoothstep(0.04, 0.0, abs(cr)) * smoothstep(0.5, 0.85, vSkin);
    vec3 hide = mix(vec3(0.028, 0.02, 0.018), vec3(0.12, 0.055, 0.035), vSkin) * (0.85 + 0.3 * smoothstep(-0.2, 0.8, N.y));
    vec3 b = lightAll(N, V, vW, hide, 0.28, 0.35, spec);
    float lower = smoothstep(-0.55, -0.92, vRest.y);
    vec3 ember = vec3(1.5, 0.3, 0.05) * crack * uEmber * uEmber * (0.6 + 0.6 * (sn3(vRest * 3.0 + tq * 0.8) * 0.5 + 0.5));
    vec3 mq = (vRest - vec3(0.0, 0.33, 1.06)) * vec3(9.0, 12.0, 5.0);
    float lip = exp(-dot(mq, mq));
    vec3 rim = vec3(0.55, 0.07, 0.02) * pow(fres, 3.2) * uGlow * 0.6 * (1.0 - lip);
    float cheek = smoothstep(0.03, 0.22, vJaw) * smoothstep(0.97, 0.78, vJaw);
    col = mix(b + spec * 1.05 + ember + rim, vec3(0.07, 0.01, 0.005) * (0.4 + uMaw) + b * 0.25, cheek);
    float smoke = sn3(vRest * 6.0 + vec3(0.0, -tq * 1.2, 0.0)) * 0.5 + 0.5;
    alpha = 1.0 - lower * (0.45 + 0.4 * smoke);
    alpha *= mix(1.0, 0.8, pow(fres, 4.0));
  }
  gl_FragColor = gkFinish(col, alpha, vRest);
}
`;

export const MOODS = {
  idle: { jaw: 0.18, pant: 1, head: 0.12, look: 0.35, hackle: 0.1, ember: 0.35, eye: 1.0, maw: 0.6, tail: 0.25, tailUp: 0.0, crouch: 0.0, flail: 0, bark: 0, glow: 1.0, wobble: 0.6 },
  eat: { jaw: 0.35, pant: 0, head: 0.75, look: 0.1, hackle: 0.3, ember: 0.6, eye: 1.0, maw: 0.9, tail: 0.5, tailUp: 0.05, crouch: 0.35, flail: 0, bark: 0, glow: 1.0, wobble: 0.6 },
  taunt: { jaw: 0.35, pant: 0, head: -0.05, look: 0.0, hackle: 1.0, ember: 0.9, eye: 1.4, maw: 1.0, tail: 0.15, tailUp: 0.12, crouch: 0.55, flail: 0, bark: 1, glow: 1.15, wobble: 0.8 },
  angry: { jaw: 0.95, pant: 0, head: -0.28, look: 0.0, hackle: 1.0, ember: 1.25, eye: 1.8, maw: 1.4, tail: 0.1, tailUp: 0.15, crouch: 0.25, flail: 0, bark: 0, glow: 1.3, wobble: 1.0 },
  flee: { jaw: 0.5, pant: 1, head: 0.15, look: 0.6, hackle: 0.4, ember: 0.8, eye: 1.2, maw: 1.0, tail: 0.1, tailUp: -0.12, crouch: 0.0, flail: 0, bark: 0, glow: 1.1, wobble: 1.0 },
  hurt: { jaw: 0.85, pant: 0, head: -0.35, look: 0.5, hackle: 0.6, ember: 1.4, eye: 2.0, maw: 1.5, tail: 0.6, tailUp: -0.05, crouch: 0.2, flail: 0.4, bark: 0, glow: 1.5, wobble: 1.6 },
  wrangled: { jaw: 0.9, pant: 0, head: -0.25, look: 0.9, hackle: 1.0, ember: 1.3, eye: 1.8, maw: 1.4, tail: 0.9, tailUp: 0.05, crouch: 0.0, flail: 1, bark: 0, glow: 1.4, wobble: 1.8 },
  sucked: { jaw: 1.0, pant: 0, head: -0.4, look: 0.6, hackle: 1.0, ember: 1.5, eye: 2.0, maw: 1.6, tail: 1.0, tailUp: 0.1, crouch: 0.0, flail: 1, bark: 0, glow: 1.5, wobble: 1.6 },
};

export const SPEC = { name: 'terror_dog', LAYOUT, build, bound: 1.7 };

const TROT = [0, 0.5, 0.5, 0], GALLOP = [0, 0.1, 0.55, 0.66];
const PAWS = [[0.17, GROUND + 0.04, 0.48], [-0.17, GROUND + 0.04, 0.48], [0.17, GROUND + 0.04, -0.5], [-0.17, GROUND + 0.04, -0.5]];

export class TerrorDog extends GhostBase {
  constructor(fx, geometry) {
    super(fx, { name: 'terror_dog', radius: 0.85, moods: MOODS, halo: [0.42, 0.035, 0.012], haloSize: 1.35, light: [1.0, 0.22, 0.08], lightI: 1.6 });
    const U = this.U;
    Object.assign(U, {
      uHip: { value: new THREE.Vector4() }, uKnee: { value: new THREE.Vector4() }, uJaw: { value: 0.1 }, uHead: { value: new THREE.Vector3() },
      uTail: { value: new THREE.Vector3() }, uHackle: { value: 0 }, uBreath: { value: 0 }, uEye: { value: 1 }, uEmber: { value: 0.5 }, uMaw: { value: 0.6 },
    });
    U.uHurtC.value.set(0.55, 0.12, 0.03);
    this.mat = ghostMaterial(VS, FS, U);
    this.mesh = new THREE.Mesh(geometry, this.mat);
    this.mesh.renderOrder = 20;
    this.mesh.frustumCulled = false;
    this.body.add(this.mesh);
    this.halo.U.uHaloK.value = 4.2;
    this.center = new THREE.Vector3(0, 0.05, 0.15);
    this.lab = { y: -GROUND, dist: 3.5, lift: 0.45, fov: 40, look: -0.2, grounded: true, yaw: -0.8, lean: 0 };
    this.footY = GROUND;
    this.phase = 0;
    this.tick = -1;
    this.barkT = 0;
    this.smokeAcc = 0;
    this.air = 0;
    this.A = new Float32Array(4);
    this.K = new Float32Array(4);
  }

  update(dt, p = {}) {
    dt = this.common(dt, p, 0.12, 0.012);
    const U = this.U, e = this.e, t = this.t, struggle = this.struggleAmt;
    const v = this.vel;
    const sp = Math.hypot(v.x, v.z);
    const air = p.x && p.x.air !== undefined ? clamp(p.x.air, 0, 1) : clamp((Math.abs(v.y) - 2.5) / 2, 0, 1);
    this.air += (air - this.air) * Math.min(1, dt * 10);
    this.phase += dt * (0.25 + sp / 2.7);
    const tick = Math.floor(t * 12);
    if (tick !== this.tick) {
      this.tick = tick;
      this.pose(tick / 12, sp, struggle);
    }
    U.uWobble.value = e.wobble + struggle * 1.2;
    U.uSquash.value = this.flinch * 0.5;
    U.uEye.value = e.eye * (1 + this.hurt * 0.5) * (0.92 + 0.08 * Math.sin(t * 23));
    U.uEmber.value = e.ember * (1 + this.hurt * 0.4);
    U.uMaw.value = e.maw;
    this.effects(dt, sp, struggle);
    this.finishCommon(e.glow * (1 + 0.05 * Math.sin(t * 3.7)), this.center, 0.1 + 0.08 * e.ember);
  }

  pose(tq, sp, struggle) {
    const U = this.U, e = this.e, mood = this.mood;
    const amp = clamp(sp / 2.2, 0, 1) * (1 - this.air);
    const gal = clamp((sp - 3) / 3, 0, 1);
    const ph = this.phase;
    const flail = Math.max(e.flail, struggle);
    const crouch = e.crouch * (1 - amp);
    const hip = U.uHip.value, knee = U.uKnee.value;
    const A = this.A, K = this.K;
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const off = TROT[i] + (GALLOP[i] - TROT[i]) * gal;
      const a = (ph + off) * Math.PI * 2;
      const s = Math.sin(a), c = Math.cos(a);
      let h = s * amp * (front ? 0.5 : 0.42) * (1 + 0.6 * gal);
      let k = Math.max(0, -c) * amp * (front ? 1.0 : -0.85) * (1 + 0.3 * gal);
      h += front ? -crouch * 0.25 : crouch * 0.35;
      k += front ? crouch * 0.5 : -crouch * 0.6;
      const ax = this.air;
      h = h * (1 - ax) + (front ? -0.95 : 0.85) * ax;
      k = k * (1 - ax) + (front ? 0.25 : -0.2) * ax;
      if (flail > 0.01) {
        const f = Math.sin(tq * (9 + i * 1.7) + i * 2.1) * 0.9 + Math.sin(tq * (5.3 + i) + i) * 0.4;
        h = h * (1 - flail) + f * flail;
        k = k * (1 - flail) + Math.abs(Math.sin(tq * (7 + i) + i * 1.3)) * (front ? 1.1 : -1.0) * flail;
      }
      A[i] = h; K[i] = k;
    }
    hip.set(A[0], A[1], A[2], A[3]);
    knee.set(K[0], K[1], K[2], K[3]);
    let jaw = Math.max(e.jaw, this.mouth);
    if (e.pant > 0.05) jaw += e.pant * 0.08 * Math.sin(tq * 16);
    if (e.bark > 0.05) {
      this.barkT -= 1 / 12;
      if (this.barkT <= 0) this.barkT = 0.5 + (Math.sin(tq * 13.7) * 0.5 + 0.5) * 0.6;
      jaw += e.bark * (this.barkT > 0.38 ? 0.65 : 0);
    }
    if (mood === 'eat') jaw = 0.1 + 0.5 * Math.max(0, Math.sin(tq * 10));
    if (mood === 'angry' || mood === 'hurt' || flail > 0.5) jaw += Math.sin(tq * 21) * 0.08;
    U.uJaw.value = clamp(jaw, 0, 1.2) * 0.75;
    const look = e.look * Math.sin(tq * 1.3) * 0.5 + Math.sin(tq * 0.7) * 0.08;
    const thrash = flail * Math.sin(tq * 11) * 0.35;
    U.uHead.value.set(e.head + Math.sin(ph * Math.PI * 2) * 0.06 * amp + (mood === 'eat' ? Math.sin(tq * 5) * 0.1 : 0), look + thrash, flail * Math.sin(tq * 8) * 0.2);
    U.uTail.value.set(e.tail * 0.18 + flail * 0.12, e.tailUp, -amp * 0.08);
    U.uHackle.value = e.hackle;
    U.uBreath.value = e.pant * (0.5 + 0.5 * Math.sin(tq * 16)) + (1 - e.pant) * (0.5 + 0.5 * Math.sin(tq * 3));
    const bob = Math.abs(Math.sin(ph * Math.PI * 2 * (1 + gal))) * 0.05 * amp;
    this.body.position.y = -crouch * 0.07 - bob + this.air * 0.04;
    this.body.rotation.x = Math.sin(ph * Math.PI * 2) * 0.07 * gal * amp + crouch * 0.06 - this.air * 0.12;
    this.body.rotation.z = flail * Math.sin(tq * 6.3) * 0.25;
  }

  effects(dt, sp, struggle) {
    const fx = this.fx, r = fx.rng, P = fx.pools;
    if (!this.object3D.visible) return;
    const W = this.T[1];
    this.smokeAcc += dt * (2 + sp * 2.2 + struggle * 8 + this.e.ember * 2);
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      const k = (r.next() * 4) | 0, q = PAWS[k];
      W.set(q[0] + r.signed() * 0.05, q[1] + 0.08, q[2] + r.signed() * 0.08);
      this.object3D.localToWorld(W);
      if (r.next() < 0.6) P.smoke.emit(W.x, W.y, W.z, r.signed() * 0.25, r.range(0.2, 0.6), r.signed() * 0.25, r.range(0.9, 1.8), r.range(0.1, 0.2), r.next(), 1.6, -0.05, -1e3, 2, 0, r.signed());
      else P.embers.emit(W.x, W.y + 0.3, W.z, r.signed() * 0.5, r.range(0.4, 1.2), r.signed() * 0.5, r.range(0.4, 0.9), r.range(0.012, 0.025), r.next(), 1.2, -0.3, -1e3, 2, 0, r.signed());
    }
  }

  release() { this.phase = 0; this.tick = -1; this.air = 0; }
}
