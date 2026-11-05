// Taxi ghost, 1984 film look: rotting cabbie with flat cap and lipless grin gripping the wheel, plus a spectral Checker cab that materialises around him (second mesh group).
import * as THREE from 'three';
import { NOISE } from '../glsl.js';
import { clamp } from '../util.js';
import { GK_VS, GK_FS, GhostBase, ghostMaterial } from '../ghostkit.js';
import { G, CAB_X, NECK, JAW_HINGE, WHEEL_C, WHEEL_N, EYE_L, EYE_R, AXLES, WHEEL_RAD, LAYOUT, build } from './taxi.sdf.js';

const glv = (a) => `vec3(${a[0].toFixed(4)}, ${a[1].toFixed(4)}, ${a[2].toFixed(4)})`;

const VS = /* glsl */`
${NOISE}
${GK_VS}
attribute vec4 aW1;
attribute vec4 aW2;
attribute float aMat;
attribute vec3 aBump;
uniform float uJaw;
uniform vec3 uHead;
uniform float uSteer;
uniform vec2 uLean;
uniform vec3 uTail;
uniform float uHairK;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vW;
flat varying float vMat;
varying float vTail;
varying float vRot;
varying float vSkin;
vec3 rotA(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
void main() {
  vec3 p = position;
  vec3 n = normalize(normal + aBump * 0.3);
  float head = aW1.x, jaw = aW1.y, steer = aW1.z, lean = aW1.w;
  if (jaw > 0.0) {
    vec3 hg = ${glv(JAW_HINGE)};
    p = hg + rotX(p - hg, uJaw * jaw);
    n = rotX(n, uJaw * jaw);
  }
  float hair = aW2.y;
  if (hair > 0.0) {
    p.x += sin(uTime * 2.3 + position.y * 25.0 + position.x * 9.0) * hair * hair * uHairK * 0.018;
    p.z += sin(uTime * 1.7 + position.y * 19.0) * hair * hair * uHairK * 0.012 - hair * hair * uHairK * 0.01;
  }
  if (head > 0.0) {
    vec3 nk = ${glv(NECK)};
    vec3 r = p - nk;
    r = rotX(r, uHead.x * head);
    r = rotY(r, uHead.y * head);
    r = rotZ(r, uHead.z * head);
    p = nk + r;
    n = rotZ(rotY(rotX(n, uHead.x * head), uHead.y * head), uHead.z * head);
  }
  if (steer > 0.0) {
    vec3 wc = ${glv(WHEEL_C)};
    vec3 wn = ${glv(WHEEL_N)};
    p = wc + rotA(p - wc, wn, uSteer * steer);
    n = rotA(n, wn, uSteer * steer);
  }
  if (lean > 0.0) {
    vec3 pv = vec3(0.0, -0.3, -0.02);
    vec3 r = p - pv;
    r = rotX(r, uLean.x * lean);
    r = rotZ(r, uLean.y * lean);
    p = pv + r;
    n = rotZ(rotX(n, uLean.x * lean), uLean.y * lean);
  }
  float tl = aW2.x;
  if (tl > 0.0) {
    float w = tl * tl;
    p.x += sin(uTime * 2.2 + uTail.z - tl * 3.0) * uTail.x * w;
    p.y += sin(uTime * 1.8 - tl * 2.4) * uTail.y * w;
  }
  gkWobble(p, n, 0.5);
  gkBody(p, n, 1.1);
  vRest = position;
  vMat = aMat;
  vTail = tl;
  vRot = aW2.z;
  vSkin = aW2.w;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FS = /* glsl */`
${NOISE}
${GK_FS}
uniform vec3 uGaze;
uniform float uEyeGlow;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vW;
flat varying float vMat;
varying float vTail;
varying float vRot;
varying float vSkin;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (!gl_FrontFacing) N = -N;
  float NV = clamp(dot(N, V), 0.0, 1.0);
  float fres = 1.0 - NV;
  int mat = int(vMat + 0.5);
  vec3 spec;
  vec3 col;
  float alpha = 0.96;
  vec3 aura = vec3(0.36, 0.55, 0.16);
  if (mat == 4) {
    bool big = vRest.x > 0.0;
    vec3 ec = big ? ${glv(EYE_L)} : ${glv(EYE_R)};
    vec3 en = normalize(vRest - ec);
    float pd = dot(en, uGaze);
    float iris = smoothstep(0.86, 0.9, pd);
    float pupil = smoothstep(0.95, 0.97, pd);
    float vein = smoothstep(0.55, 0.0, abs(sn3(vRest * 260.0))) * smoothstep(0.75, 0.2, pd) * 0.6;
    vec3 sclera = mix(vec3(0.78, 0.7, 0.42), vec3(0.6, 0.12, 0.06), vein);
    vec3 eye = mix(sclera, vec3(0.35, 0.3, 0.1), iris);
    eye = mix(eye, vec3(0.01), pupil);
    if (!big) eye *= 0.45;
    vec3 b = lightAll(N, V, vW, eye, 0.25, 0.4, spec);
    col = b * 0.75 + eye * 0.25 + spec * 1.2 + vec3(0.45, 0.7, 0.15) * pupil * uEyeGlow;
    alpha = 1.0;
  } else if (mat == 3) {
    vec3 tooth = mix(vec3(0.42, 0.33, 0.16), vec3(0.62, 0.55, 0.36), vSkin) * (0.6 + 0.4 * smoothstep(0.35, 0.65, vRot));
    vec3 b = lightAll(N, V, vW, tooth, 0.35, 0.35, spec);
    col = b + spec * 0.6 + tooth * 0.08;
    alpha = 1.0;
  } else if (mat == 5) {
    col = vec3(0.03, 0.012, 0.008) + aura * 0.02;
    alpha = 1.0;
  } else if (mat == 6) {
    vec3 b = lightAll(N, V, vW, vec3(0.025, 0.025, 0.03), 0.22, 0.2, spec);
    col = b + spec * 1.4;
    alpha = 0.95;
  } else if (mat == 2) {
    vec3 cap = vec3(0.04, 0.04, 0.05) * (0.8 + 0.4 * vSkin);
    vec3 b = lightAll(N, V, vW, cap, 0.6, 0.4, spec);
    col = b + spec * 0.4;
  } else if (mat == 7) {
    vec3 hr = vec3(0.42, 0.4, 0.34) * (0.7 + 0.5 * vSkin);
    vec3 b = lightAll(N, V, vW, hr, 0.5, 0.6, spec);
    col = b + spec * 0.4 + aura * 0.06;
    alpha = 0.85;
  } else if (mat == 9) {
    vec3 sh = vec3(0.5, 0.46, 0.36) * (0.75 + 0.35 * vSkin);
    vec3 b = lightAll(N, V, vW, sh, 0.6, 0.5, spec);
    col = b + spec * 0.2;
  } else if (mat == 1) {
    vec3 leather = vec3(0.36, 0.26, 0.15);
    vec3 rotC = vec3(0.24, 0.26, 0.13);
    vec3 dark = vec3(0.07, 0.045, 0.03);
    vec3 base = mix(leather, rotC, smoothstep(0.35, 0.65, vRot));
    base = mix(base, dark, smoothstep(0.62, 0.8, vRot));
    base *= 0.75 + 0.4 * vSkin;
    vec3 b = lightAll(N, V, vW, base, 0.42, 0.5, spec);
    col = b + spec * (0.4 + 0.8 * smoothstep(0.5, 0.7, vRot)) + aura * pow(fres, 2.0) * 0.35 * uGlow;
  } else {
    vec3 cloth = mix(vec3(0.06, 0.05, 0.045), vec3(0.15, 0.12, 0.09), vSkin) * (0.8 + 0.3 * vRot);
    vec3 b = lightAll(N, V, vW, cloth, 0.7, 0.6, spec);
    col = b + spec * 0.25;
    float boil = sn3(vRest * 4.0 + vec3(0.0, -uTimeQ * 0.9, uTimeQ * 0.4)) * 0.5 + 0.5;
    alpha = mix(0.94, 0.3, pow(fres, 1.5)) * (1.0 - smoothstep(0.25, 0.95, vTail + (boil - 0.5) * 0.4));
    col += aura * (0.03 + 0.25 * smoothstep(0.1, 0.9, vTail)) * uGlow * (0.6 + 0.4 * boil);
  }
  col += aura * pow(fres, 3.0) * 0.4 * uGlow;
  gl_FragColor = gkFinish(col, alpha, vRest);
}
`;

const CAB_VS = /* glsl */`
${NOISE}
${GK_VS}
attribute vec3 aBump;
attribute vec4 aW2;
uniform float uCab;
uniform vec2 uLean;
varying vec3 vRest;
varying vec3 vRN;
varying vec3 vN;
varying vec3 vW;
varying float vDirt;
void main() {
  vec3 p = position;
  vec3 n = normal;
  float c = uCab;
  float k = 1.0 - c;
  p += n * (sn3(position * 1.7 + uTime * vec3(0.6, 0.9, 0.5)) * 0.12 * k + sin(uTime * 2.0 + position.z * 1.3) * 0.01);
  p.y = ${G.toFixed(3)} + (p.y - ${G.toFixed(3)}) * (0.6 + 0.4 * c);
  gkBody(p, n, 2.4);
  vRest = position;
  vRN = normal;
  vDirt = aW2.z;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const CAB_FS = /* glsl */`
${NOISE}
${GK_FS}
uniform float uCab;
uniform float uWheel;
uniform float uLights;
varying vec3 vRest;
varying vec3 vRN;
varying vec3 vN;
varying vec3 vW;
varying float vDirt;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (!gl_FrontFacing) N = -N;
  float NV = clamp(dot(N, V), 0.0, 1.0);
  float fres = 1.0 - NV;
  vec3 c = vRest - vec3(${CAB_X.toFixed(3)}, ${G.toFixed(3)}, 0.0);
  vec3 rn = normalize(vRN);
  float tq = uTimeQ;
  vec3 yellow = vec3(0.92, 0.66, 0.1) * (0.82 + 0.25 * vDirt);
  vec3 base = yellow;
  float a = 0.5;
  float emis = 0.0;
  vec3 ecol = vec3(0.0);
  float rough = 0.32;
  float specK = 1.2;
  float wheelD = min(length(c.yz - vec2(${WHEEL_RAD.toFixed(3)}, ${AXLES[0].toFixed(3)})), length(c.yz - vec2(${WHEEL_RAD.toFixed(3)}, ${AXLES[1].toFixed(3)})));
  bool tire = wheelD < ${(WHEEL_RAD + 0.01).toFixed(3)} && abs(c.x) > 0.7;
  if (tire) {
    float ang = atan(c.y - ${WHEEL_RAD.toFixed(3)}, c.z - (c.z > 0.0 ? ${AXLES[0].toFixed(3)} : ${AXLES[1].toFixed(3)})) + uWheel;
    float hub = smoothstep(0.2, 0.18, wheelD) * step(0.5, abs(rn.x));
    float spoke = smoothstep(0.6, 0.9, abs(sin(ang * 3.0))) * hub;
    base = mix(vec3(0.03, 0.03, 0.03), vec3(0.6, 0.62, 0.66) * (0.6 + 0.4 * spoke), hub);
    rough = mix(0.8, 0.2, hub);
    a = 0.75;
  } else if (c.y > 1.58 && abs(c.x) < 0.14) {
    base = vec3(0.12, 0.2, 0.55);
    float txt = step(0.55, sn3(vec3(c.z * 22.0, c.y * 40.0, 0.0)) * 0.5 + 0.5) * step(abs(c.y - 1.74), 0.07) * step(abs(c.z + 0.6), 0.38);
    ecol = mix(vec3(0.25, 0.4, 1.0), vec3(1.0, 0.95, 0.85), txt) * 0.9;
    emis = 1.0;
    a = 0.75;
  } else if (abs(c.z) > 2.17 && c.y > 0.33 && c.y < 0.51) {
    base = vec3(0.7, 0.72, 0.78);
    rough = 0.15;
    specK = 2.5;
    a = 0.7;
  } else {
    bool green = c.y > 0.94 && c.y < 1.54;
    bool sideG = green && abs(rn.x) > 0.55;
    bool front = green && rn.z > 0.35 && rn.y > 0.2;
    bool rear = green && rn.z < -0.35 && rn.y > 0.2;
    float pillar = sideG ? max(max(smoothstep(0.05, 0.02, abs(c.z + 0.6)), smoothstep(0.3, 0.42, c.z)), max(smoothstep(-1.6, -1.72, c.z), smoothstep(1.46, 1.52, c.y) + smoothstep(1.02, 0.96, c.y))) : 0.0;
    if (sideG || front || rear) {
      float frame = sideG ? pillar : smoothstep(0.84, 0.9, abs(c.x) / 0.86) + smoothstep(1.47, 1.53, c.y) + smoothstep(1.0, 0.95, c.y);
      frame = clamp(frame, 0.0, 1.0);
      base = mix(vec3(0.02, 0.03, 0.03), yellow, frame);
      a = mix(0.1, 0.55, frame);
      rough = mix(0.08, 0.32, frame);
      specK = mix(2.2, 1.2, frame);
    }
    if (abs(rn.x) > 0.6 && c.y > 0.82 && c.y < 0.9) {
      float ch = mod(floor(c.z * 12.5) + floor(c.y * 12.5), 2.0);
      base = mix(vec3(0.03), vec3(0.85, 0.85, 0.8), ch);
    }
    if (rn.z > 0.6 && c.z > 2.1) {
      vec2 hp = vec2(abs(c.x) - 0.6, c.y - 0.72);
      vec2 hp2 = vec2(abs(c.x) - 0.36, c.y - 0.72);
      float lamp = max(smoothstep(0.075, 0.06, length(hp)), smoothstep(0.075, 0.06, length(hp2)));
      float grille = step(abs(c.x), 0.24) * step(abs(c.y - 0.68), 0.12) * (0.5 + 0.5 * step(0.5, fract(c.x * 20.0)));
      base = mix(base, vec3(0.05, 0.05, 0.04), grille * 0.8);
      ecol += vec3(1.0, 0.9, 0.62) * lamp * 3.0 * uLights;
      emis = max(emis, lamp * uLights);
    }
    if (rn.z < -0.6 && c.z < -2.6) {
      float tl = step(abs(abs(c.x) - 0.82), 0.1) * step(abs(c.y - 0.72), 0.08);
      ecol += vec3(1.4, 0.08, 0.04) * tl * uLights;
      emis = max(emis, tl * uLights);
    }
  }
  vec3 spec;
  vec3 b = lightAll(N, V, vW, base, rough, 0.45, spec);
  vec3 ghost = vec3(0.55, 0.8, 0.28);
  vec3 col = b * 0.8 + base * 0.12 * uGlow + spec * specK + ecol + ghost * pow(fres, 2.2) * 0.55 * uGlow;
  float boil = sn3(vRest * 2.2 + vec3(tq * 0.4, tq * 0.7, -tq * 0.3)) * 0.5 + 0.5;
  float th = uCab * 1.25 - 0.12;
  float vis = smoothstep(boil - 0.06, boil + 0.06, th);
  float edge = smoothstep(0.12, 0.0, abs(boil - th)) * (1.0 - step(0.999, uCab));
  col += ghost * edge * 2.2;
  a = max(a, emis * 0.9);
  a *= vis * smoothstep(-0.02, 0.4, c.y + (boil - 0.5) * 0.2);
  a = mix(a, max(a, 0.35), pow(fres, 2.0) * vis);
  gl_FragColor = gkFinish(col, a + edge * 0.4 * vis, vRest);
}
`;

export const MOODS = {
  idle: { jaw: 0.08, chatter: 0, nod: 0.04, turn: 0.15, lean: 0.06, steer: 0.35, eye: 0.6, hair: 0.4, tail: 0.06, glow: 1.0, wobble: 0.5, tilt: 0 },
  eat: { jaw: 0.25, chatter: 0.6, nod: 0.15, turn: 0.3, lean: 0.12, steer: 0.2, eye: 0.6, hair: 0.4, tail: 0.06, glow: 1.0, wobble: 0.5, tilt: 0.05 },
  taunt: { jaw: 0.45, chatter: 1, nod: -0.12, turn: 1.0, lean: -0.04, steer: 0.1, eye: 1.2, hair: 0.7, tail: 0.1, glow: 1.15, wobble: 0.8, tilt: 0.22 },
  angry: { jaw: 0.75, chatter: 0.3, nod: -0.18, turn: 0.0, lean: 0.32, steer: 1.0, eye: 1.8, hair: 1.0, tail: 0.12, glow: 1.3, wobble: 1.0, tilt: 0 },
  flee: { jaw: 0.6, chatter: 0.5, nod: 0.2, turn: 0.8, lean: -0.22, steer: 0.8, eye: 1.0, hair: 1.0, tail: 0.15, glow: 1.1, wobble: 1.2, tilt: -0.1 },
  hurt: { jaw: 0.85, chatter: 0.8, nod: 0.28, turn: 0.4, lean: -0.3, steer: 0.6, eye: 1.6, hair: 1.0, tail: 0.15, glow: 1.5, wobble: 1.8, tilt: 0.2 },
  wrangled: { jaw: 0.8, chatter: 1, nod: -0.1, turn: 0.6, lean: 0.15, steer: 1.4, eye: 1.6, hair: 1.0, tail: 0.22, glow: 1.4, wobble: 2.0, tilt: 0 },
  sucked: { jaw: 1.0, chatter: 0.6, nod: 0.35, turn: 0.2, lean: -0.35, steer: 2.0, eye: 1.8, hair: 1.0, tail: 0.25, glow: 1.5, wobble: 1.8, tilt: 0 },
};

export const SPEC = { name: 'taxi', LAYOUT, build, bound: 3.4 };

const LAMPS = [[CAB_X + 0.6, G + 0.72, 2.33], [CAB_X - 0.6, G + 0.72, 2.33]];

export class TaxiGhost extends GhostBase {
  constructor(fx, geometry) {
    super(fx, { name: 'taxi', radius: 0.62, moods: MOODS, halo: [0.2, 0.32, 0.08], haloSize: 1.7, light: [0.65, 0.9, 0.35], lightI: 1.8 });
    const U = this.U;
    Object.assign(U, {
      uJaw: { value: 0 }, uHead: { value: new THREE.Vector3() }, uSteer: { value: 0 }, uLean: { value: new THREE.Vector2() }, uTail: { value: new THREE.Vector3(0.05, 0.03, 0) },
      uHairK: { value: 0.4 }, uGaze: { value: new THREE.Vector3(0, 0, 1) }, uEyeGlow: { value: 0.6 }, uCab: { value: 0 }, uWheel: { value: 0 }, uLights: { value: 0 },
    });
    this.mat = ghostMaterial(VS, FS, U);
    this.cabMat = ghostMaterial(CAB_VS, CAB_FS, U);
    this.mesh = new THREE.Mesh(geometry, [this.mat, this.cabMat]);
    this.mesh.renderOrder = 20;
    this.mesh.frustumCulled = false;
    this.body.add(this.mesh);
    this.halo.U.uHaloK.value = 3.8;
    this.center = new THREE.Vector3(0, 0.1, 0);
    this.lab = { y: -G, dist: 1.9, lift: 0.55, fov: 40, look: 0.42, grounded: true, yaw: 0.5, lean: 0 };
    this.cab = 0;
    this.flare = fx.flares.alloc(4);
    this.wisp = 0;
    this.exhaust = 0;
    this.footY = G;
  }

  update(dt, p = {}) {
    dt = this.common(dt, p, 0.18, 0.02);
    const U = this.U, e = this.e, t = this.t, mood = this.mood, struggle = this.struggleAmt;
    const x = p.x;
    const target = x && x.cab !== undefined ? clamp(+x.cab || 0, 0, 1) : 0;
    this.cab += (target - this.cab) * Math.min(1, dt * (target > this.cab ? 1.6 : 2.4));
    if (Math.abs(target - this.cab) < 0.002) this.cab = target;
    const cab = this.cab;
    U.uCab.value = cab;
    const L = this.lab, c2 = cab * cab * (3 - 2 * cab);
    L.dist = 1.9 + c2 * 4.6; L.lift = 0.55 + c2 * 1.0; L.look = 0.42 - c2 * 0.3; L.yaw = 0.5 + c2 * 0.45;
    this.cabMat.visible = cab > 0.005;
    U.uLights.value = cab * cab * (0.85 + 0.15 * Math.sin(t * 31) * (mood === 'angry' ? 1 : 0.2));
    const inv = this.T[3];
    const lv = this.T[2].copy(this.vel).applyQuaternion(inv);
    U.uWheel.value = (U.uWheel.value + dt * lv.z / WHEEL_RAD * cab) % (Math.PI * 200);
    let jaw = Math.max(e.jaw, this.mouth);
    if (e.chatter > 0.05) jaw += e.chatter * 0.18 * Math.max(0, Math.sin(t * 17) + Math.sin(t * 23) * 0.5);
    U.uJaw.value = clamp(jaw, 0, 1.1) * 0.62;
    const turn = e.turn * (mood === 'flee' ? Math.sign(Math.sin(t * 0.9)) * 0.9 : 0.85) + Math.sin(t * 0.6) * 0.1;
    const thrash = struggle * Math.sin(t * 13) * 0.3;
    U.uHead.value.set(e.nod + Math.sin(t * 1.3) * 0.04 + this.flinch * 0.3, turn + thrash, e.tilt * Math.sin(t * 2.4) + Math.sin(t * 0.8) * 0.04);
    const steer = e.steer * (Math.sin(t * 0.9) * 0.35 + Math.sin(t * 2.3) * 0.15) - clamp(lv.x * 0.08, -0.6, 0.6) + struggle * Math.sin(t * 9) * 0.6;
    U.uSteer.value = mood === 'sucked' ? t * 9 : steer;
    U.uLean.value.set(e.lean + Math.min(0.15, Math.max(0, lv.z) * 0.01) - this.flinch * 0.25, Math.sin(t * 0.7) * 0.04 + thrash * 0.3);
    U.uHairK.value = e.hair + this.speed * 0.05;
    U.uTail.value.set(e.tail + this.speed * 0.01 + struggle * 0.1, e.tail * 0.6 + struggle * 0.06, 0);
    U.uWobble.value = e.wobble + struggle * 1.5;
    U.uSquash.value = this.flinch * 0.5;
    U.uEyeGlow.value = e.eye;
    U.uGaze.value.copy(this.gazeStep(dt, mood === 'flee' || mood === 'sucked'));
    this.body.rotation.z = Math.sin(t * 0.9) * 0.03 * (1 - cab);
    this.body.position.y = (Math.sin(t * 1.6) * 0.03 + Math.sin(t * 2.9) * 0.01) * (1 - cab) + Math.sin(t * 13) * 0.004 * cab;
    this.lamps(cab);
    this.effects(dt, cab, struggle);
    this.finishCommon(e.glow * (1 + 0.05 * Math.sin(t * 2.9)), this.center, 0.14 + 0.06 * e.eye);
  }

  lamps(cab) {
    const F = this.fx.flares, W = this.T[1], I = this.U.uLights.value;
    if (I < 0.02 || !this.object3D.visible) { for (let i = 0; i < 4; i++) F.off(this.flare + i); return; }
    for (let i = 0; i < 2; i++) {
      const q = LAMPS[i];
      W.set(q[0], q[1], q[2]);
      this.body.localToWorld(W);
      F.set(this.flare + i * 2, W.x, W.y, W.z, 0.42, 1.0, 0.9, 0.65, 0.9 * I, 0, 0, 0, 0.2, 1);
      F.set(this.flare + i * 2 + 1, W.x, W.y, W.z, 0.5, 1.0, 0.92, 0.75, 0.45 * I, 2, 0, 0, 0.2, 7);
    }
  }

  effects(dt, cab, struggle) {
    const fx = this.fx, r = fx.rng, P = fx.pools;
    if (!this.object3D.visible) return;
    const W = this.T[1];
    this.wisp += dt * (5 + this.speed * 0.5 + struggle * 6) * (1 - cab * 0.7);
    while (this.wisp >= 1) {
      this.wisp -= 1;
      W.set(r.signed() * 0.2 + 0.05, -0.75 + r.signed() * 0.1, -0.45 + r.signed() * 0.12);
      this.object3D.localToWorld(W);
      P.motes.emit(W.x, W.y, W.z, r.signed() * 0.15, r.range(-0.05, 0.2), r.signed() * 0.15, r.range(0.8, 1.6), r.range(0.02, 0.045), r.next(), 1.5, -0.02, -1e3, 2, 1, r.signed());
    }
    if (cab < 0.3) return;
    this.exhaust += dt * (6 + this.speed * 1.5) * cab;
    while (this.exhaust >= 1) {
      this.exhaust -= 1;
      if (r.next() < 0.5) {
        W.set(CAB_X + 0.55, G + 0.3, -2.85);
        this.object3D.localToWorld(W);
        P.smoke.emit(W.x, W.y, W.z, r.signed() * 0.3, r.range(0.1, 0.4), r.signed() * 0.3, r.range(0.8, 1.6), r.range(0.12, 0.22), r.next(), 1.4, -0.05, -1e3, 2, 1, r.signed());
      } else {
        W.set(CAB_X + r.signed() * 0.9, G + 0.05, r.range(-2.4, 2.0));
        this.object3D.localToWorld(W);
        P.motes.emit(W.x, W.y, W.z, r.signed() * 0.3, r.range(0.05, 0.3), r.signed() * 0.3, r.range(0.6, 1.3), r.range(0.03, 0.06), r.next(), 1.5, -0.02, -1e3, 2, 1, r.signed());
      }
    }
  }

  release() { this.cab = 0; this.U.uCab.value = 0; this.cabMat.visible = false; for (let i = 0; i < 4; i++) this.fx.flares.off(this.flare + i); }
}
