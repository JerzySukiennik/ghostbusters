// Onionhead, 1984 film look: glutton puppet ghost lit from inside, soft optical edge and halo, gap teeth, droopy eyes, eight moods, trap suck.
import * as THREE from 'three';
import { NOISE } from '../glsl.js';
import { lerp } from '../util.js';
import { GK_VS, GK_FS, GhostBase, ghostMaterial } from '../ghostkit.js';
import { EYE_L, EYE_R, EYE_RL, EYE_RR, TEETH_U, TEETH_L, TONGUE, LAYOUT, build } from './onionhead.sdf.js';

const glv = (a) => `vec3(${a[0].toFixed(4)}, ${a[1].toFixed(4)}, ${a[2].toFixed(4)})`;

const VS = /* glsl */`
${NOISE}
${GK_VS}
attribute vec4 aW1;
attribute vec4 aW2;
attribute float aMat;
attribute vec3 aBump;
uniform float uJaw;
uniform float uSmile;
uniform vec4 uBrow;
uniform vec4 uTongue;
uniform vec4 uArmL;
uniform vec4 uArmR;
uniform vec4 uTail;
uniform float uPuff;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vW;
varying float vTail;
varying float vSkin;
void main() {
  vec3 p = position;
  vec3 n = normalize(normal + aBump * 0.16);
  float jaw = aW1.x, arm = aW1.y, tail = aW1.z, brow = aW1.w;
  float tongue = aW2.x, crown = aW2.y, cheek = aW2.z;
  float bw = abs(brow);
  if (bw > 0.0) {
    float raise = brow > 0.0 ? uBrow.x : uBrow.y;
    float inner = clamp(1.0 - (abs(p.x) - 0.05) / 0.17, 0.0, 1.0);
    p.y += bw * (raise * 0.04 - uBrow.z * (inner - 0.35) * 0.06);
    p.z += bw * uBrow.z * inner * 0.012;
  }
  p += n * cheek * uPuff * 0.055;
  float corner = smoothstep(0.1, 0.26, abs(p.x)) * exp(-pow((p.y + 0.04) / 0.08, 2.0)) * smoothstep(0.05, 0.2, p.z);
  p.y += corner * uSmile * 0.05;
  if (tongue > 0.0 || (aMat > 1.5 && aMat < 2.5)) {
    float tw = tongue;
    float ret = 1.0 - uTongue.x;
    p += vec3(0.0, 0.03 + tw * 0.05, -0.08 - tw * 0.2) * ret * smoothstep(0.0, 0.2, tw + 0.05);
    p.y -= tw * tw * 0.12 * uTongue.x;
    p.x += sin(uTime * 13.0 - tw * 2.5) * uTongue.y * 0.08 * tw;
    p.y += sin(uTime * 8.0 - tw * 4.0) * uTongue.y * 0.04 * tw;
    p.z += uTongue.z * tw * 0.05;
  }
  if (jaw > 0.0) {
    vec3 hinge = vec3(0.0, -0.03, 0.0);
    float a = uJaw * jaw;
    p = hinge + rotX(p - hinge, a);
    n = rotX(n, a);
  }
  float aw = abs(arm);
  if (aw > 0.0) {
    float sd = arm > 0.0 ? 1.0 : -1.0;
    vec4 A = arm > 0.0 ? uArmL : uArmR;
    vec3 piv = vec3(0.33 * sd, -0.05, 0.07);
    vec3 r = p - piv;
    r = rotZ(r, A.x * sd * aw);
    r = rotX(r, -A.y * aw);
    r = rotY(r, A.z * sd * aw);
    p = piv + r;
    n = rotY(rotX(rotZ(n, A.x * sd * aw), -A.y * aw), A.z * sd * aw);
  }
  if (tail > 0.0) {
    float w = tail * tail;
    p.x += sin(uTime * 2.4 + uTail.z - tail * 3.2) * uTail.x * w;
    p.y += sin(uTime * 1.9 + uTail.z * 0.7 - tail * 2.6) * uTail.y * w;
    p.z += uTail.w * w;
  }
  p.x += sin(uTime * 1.7) * 0.035 * crown;
  p.z += sin(uTime * 1.3 + 1.0) * 0.025 * crown;
  gkWobble(p, n, 1.0);
  gkBody(p, n, 1.0);
  vRest = position;
  vTail = tail;
  vSkin = aW2.w;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const TEETH_GLSL = [...TEETH_U, ...TEETH_L].map((q) => `d = min(d, sdRBox(p, ${glv(q)}, vec3(${q[3].toFixed(4)}, ${q[4].toFixed(4)}, ${q[5].toFixed(4)}), 0.02, ${q[6].toFixed(4)}));`).join('\n  ');
const TONGUE_GLSL = TONGUE.map((a) => `d = smin(d, sdEllA(p, ${glv(a)}, vec3(${a[3].toFixed(4)}, ${a[4].toFixed(4)}, ${a[5].toFixed(4)})), 0.06);`).join('\n  ');

const FS = /* glsl */`
${NOISE}
${GK_FS}
uniform vec4 uEyes;
uniform vec3 uGazeL;
uniform vec3 uGazeR;
uniform float uBrowSlant;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vW;
varying float vTail;
varying float vSkin;
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float sdRBox(vec3 p, vec3 c, vec3 h, float r, float tilt) {
  vec3 d = p - c;
  float cs = cos(tilt), sn = sin(tilt);
  d.xy = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
  vec3 q = abs(d) - h + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
float sdEllA(vec3 p, vec3 c, vec3 r) { vec3 x = (p - c) / r; float k0 = length(x); float k1 = length(x / r); return k0 * (k0 - 1.0) / max(k1, 1e-6); }
int classify(vec3 p) {
  if (p.z < 0.1) return 0;
  if (p.y > 0.08) {
    if (abs(p.x) > 0.26 || p.y > 0.3) return 0;
    float de = min(length(p - ${glv(EYE_L)}) - ${EYE_RL.toFixed(4)}, length(p - ${glv(EYE_R)}) - ${EYE_RR.toFixed(4)});
    return de < 0.005 ? 4 : 0;
  }
  if (abs(p.x) > 0.35 || p.y < -0.36) return 0;
  float d = 1e9;
  ${TEETH_GLSL}
  if (d < 0.004) return 3;
  d = 1e9;
  ${TONGUE_GLSL}
  if (d < 0.005) return 2;
  if (p.z > 0.05 && abs(p.x) < 0.31 && p.y < 0.06 && p.y > -0.16 && sdEllA(p, vec3(0.0, -0.04, 0.3), vec3(0.27, 0.07, 0.2)) < 0.014) return 1;
  return 0;
}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (!gl_FrontFacing) N = -N;
  float NV = clamp(dot(N, V), 0.0, 1.0);
  float fres = 1.0 - NV;
  int mat = classify(vRest);
  vec3 col;
  float alpha = 1.0;
  vec3 spec;
  float shadeY = smoothstep(-0.55, 0.45, vRest.y);
  vec3 rim = vec3(0.0);
  if (mat == 4) {
    vec3 ec = vRest.x > 0.0 ? ${glv(EYE_L)} : ${glv(EYE_R)};
    vec3 en = normalize(vRest - ec);
    vec3 gz = vRest.x > 0.0 ? uGazeL : uGazeR;
    float lid = vRest.x > 0.0 ? uEyes.x : uEyes.y;
    float inner = vRest.x > 0.0 ? -en.x : en.x;
    float lidLine = mix(-1.05, 0.95, lid) - uBrowSlant * 0.35 * (inner + 0.2);
    float lower = mix(-1.0, -0.55, uEyes.w);
    float pd = dot(en, gz);
    float pupilR = mix(0.1, 0.42, uEyes.z);
    float iris = smoothstep(cos(pupilR + 0.17), cos(pupilR + 0.13), pd);
    float pupil = smoothstep(cos(pupilR), cos(pupilR - 0.04), pd);
    vec3 eye = mix(vec3(0.7, 0.72, 0.34), vec3(0.46, 0.3, 0.03), iris);
    eye = mix(eye, vec3(0.01), pupil);
    vec3 b = lightAll(N, V, vW, eye, 0.32, 0.4, spec);
    col = b * 0.7 + eye * 0.28 * uGlow + spec * 0.9;
    float lidMask = smoothstep(lidLine - 0.05, lidLine + 0.05, en.y) + smoothstep(lower + 0.05, lower - 0.05, en.y);
    vec3 lidC = vec3(0.12, 0.5, 0.05) * (0.55 + 0.45 * uGlow);
    col = mix(col, lidC * (0.55 + 0.45 * NV), clamp(lidMask, 0.0, 1.0));
    col *= 1.0 - 0.6 * smoothstep(0.1, 0.0, abs(en.y - lidLine)) * (1.0 - step(0.98, lid));
  } else if (mat == 3) {
    float tip = smoothstep(0.075, 0.015, abs(vRest.y + 0.045));
    vec3 tooth = mix(vec3(0.34, 0.33, 0.12), vec3(0.74, 0.66, 0.34), tip) * (0.82 + 0.18 * sn3(vRest * 40.0));
    vec3 b = lightAll(N, V, vW, tooth, 0.36, 0.45, spec);
    col = b * 0.85 + tooth * 0.1 * uGlow + vec3(0.04, 0.12, 0.015) * uGlow + spec * 0.5;
    col *= 0.45 + 0.55 * smoothstep(0.22, 0.33, vRest.z);
  } else if (mat == 2) {
    vec3 tg = vec3(0.6, 0.25, 0.33);
    vec3 b = lightAll(N, V, vW, tg, 0.42, 0.5, spec);
    col = b * 0.8 + tg * 0.2 * uGlow + spec * 0.6;
  } else if (mat == 1) {
    float depth = clamp((0.37 - vRest.z) / 0.16, 0.0, 1.0);
    vec3 m = mix(vec3(0.16, 0.02, 0.03), vec3(0.01, 0.0, 0.004), pow(depth, 0.7));
    col = m * (0.7 + 0.3 * uGlow) + lightAll(N, V, vW, m, 0.4, 0.5, spec) * 0.3;
  } else {
    float tq = uTimeQ;
    float boil = sn3(vRest * 2.3 + vec3(tq * 0.5, -tq * 0.7, tq * 0.4)) * 0.5 + 0.5;
    float swirl = sn3(vRest * 5.5 + vec3(-tq * 0.3, tq * 0.6, tq * 0.2)) * 0.5 + 0.5;
    float inner = smoothstep(0.05, 0.85, NV) * (0.7 + 0.3 * shadeY);
    vec3 emis = mix(vec3(0.02, 0.17, 0.012), vec3(0.11, 0.48, 0.04), inner);
    emis = mix(emis, vec3(0.4, 0.84, 0.15), smoothstep(0.5, 1.0, inner * 0.72 + vSkin * 0.3 + boil * 0.3) * 0.48);
    emis *= uGlow * (0.84 + 0.3 * boil) * (0.86 + 0.28 * swirl);
    vec3 base = mix(vec3(0.05, 0.28, 0.02), vec3(0.3, 0.8, 0.1), smoothstep(-0.3, 0.6, vSkin * 0.7 + N.y * 0.35 + shadeY * 0.3));
    base *= 0.78 + 0.44 * smoothstep(0.25, 0.75, vSkin);
    vec3 b = lightAll(N, V, vW, base, 0.4, 0.6, spec);
    vec3 bleed = vec3(0.09, 0.42, 0.05) * pow(fres, 1.4) * uGlow * 0.85;
    col = emis * 1.1 + b * 0.5 + bleed + spec * 1.0;
    alpha = mix(0.84, 0.05, pow(fres, 1.05)) * (1.0 - smoothstep(0.2, 0.92, vTail));
    rim = vec3(0.05, 0.3, 0.025) * pow(fres, 2.2) * uGlow * (1.0 - smoothstep(0.3, 0.95, vTail));
    float dl = length(vRest - ${glv(EYE_L)}) - ${EYE_RL.toFixed(4)}, dr = length(vRest - ${glv(EYE_R)}) - ${EYE_RR.toFixed(4)};
    float ao = 1.0 - 0.5 * smoothstep(0.05, 0.0, min(dl, dr));
    ao *= 1.0 - 0.45 * smoothstep(0.05, 0.0, abs(vRest.y + 0.035) - 0.06) * smoothstep(0.32, 0.22, abs(vRest.x)) * smoothstep(0.18, 0.3, vRest.z) * smoothstep(0.25, 0.4, length(vRest.xz));
    ao *= 1.0 - 0.3 * smoothstep(0.1, 0.0, abs(abs(vRest.x) - 0.33) - 0.02) * smoothstep(-0.25, -0.05, vRest.y) * smoothstep(0.05, -0.12, vRest.y);
    col *= ao;
    float cavD = sdEllA(vRest, vec3(0.0, -0.04, 0.3), vec3(0.27, 0.07, 0.2));
    float lip = smoothstep(0.075, 0.025, cavD) * smoothstep(0.17, 0.25, vRest.z) * step(abs(vRest.x), 0.34);
    vec3 lipC = vec3(0.46, 0.62, 0.12) * (0.7 + 0.5 * uGlow);
    col = mix(col, lipC * (0.55 + 0.45 * NV) + spec * 0.3, lip * 0.7);
  }
  gl_FragColor = gkFinish(col, alpha, vRest);
  gl_FragColor.rgb += rim * uOpacity * (1.0 - uSuck * 0.5);
}
`;

export const MOODS = {
  idle: { jaw: 0.22, smile: 0.35, browL: 0.1, browR: 0.0, slant: 0.0, lid: 0.72, pupil: 0.55, tongue: 0.2, wag: 0.1, armRaise: 0.15, armSwing: 0.2, flail: 0.15, puff: 0.0, glow: 1.0, wobble: 1.0, chomp: 0, tail: 0.06, tilt: 0.0, low: 0.0 },
  eat: { jaw: 0.55, smile: 0.5, browL: 0.35, browR: 0.3, slant: -0.1, lid: 0.5, pupil: 0.55, tongue: 0.55, wag: 0.35, armRaise: 0.45, armSwing: 0.9, flail: 0.25, puff: 0.7, glow: 1.1, wobble: 1.3, chomp: 1, tail: 0.08, tilt: 0.0, low: 0.3 },
  taunt: { jaw: 0.75, smile: 0.9, browL: 0.85, browR: -0.15, slant: 0.0, lid: 0.85, pupil: 0.5, tongue: 1.0, wag: 1.0, armRaise: 0.9, armSwing: 0.4, flail: 0.75, puff: 0.15, glow: 1.15, wobble: 1.2, chomp: 0, tail: 0.1, tilt: 0.22, low: 0.0 },
  angry: { jaw: 0.6, smile: -0.7, browL: -0.45, browR: -0.45, slant: 1.0, lid: 0.6, pupil: 0.32, tongue: 0.0, wag: 0.0, armRaise: 0.35, armSwing: 1.1, flail: 0.3, puff: 0.2, glow: 1.35, wobble: 1.8, chomp: 0, tail: 0.12, tilt: -0.08, low: 0.4 },
  flee: { jaw: 0.95, smile: -0.35, browL: 1.0, browR: 1.0, slant: -0.7, lid: 1.0, pupil: 0.18, tongue: 0.25, wag: 0.4, armRaise: 1.2, armSwing: -0.2, flail: 1.0, puff: 0.0, glow: 1.0, wobble: 1.5, chomp: 0, tail: 0.14, tilt: 0.0, low: 0.0 },
  hurt: { jaw: 0.8, smile: -0.85, browL: 0.4, browR: 0.4, slant: -0.4, lid: 0.12, pupil: 0.5, tongue: 0.75, wag: 0.6, armRaise: 0.9, armSwing: 0.5, flail: 0.9, puff: 0.0, glow: 1.6, wobble: 2.2, chomp: 0, tail: 0.16, tilt: 0.1, low: 0.0 },
  wrangled: { jaw: 0.65, smile: -0.55, browL: -0.1, browR: 0.2, slant: 0.65, lid: 0.32, pupil: 0.45, tongue: 0.35, wag: 0.8, armRaise: 1.0, armSwing: 0.6, flail: 1.0, puff: 0.0, glow: 1.35, wobble: 2.4, chomp: 0, tail: 0.2, tilt: 0.0, low: 0.0 },
  sucked: { jaw: 1.0, smile: -0.6, browL: 1.0, browR: 1.0, slant: -0.8, lid: 1.0, pupil: 0.16, tongue: 0.55, wag: 1.0, armRaise: 1.4, armSwing: -0.3, flail: 1.0, puff: 0.0, glow: 1.5, wobble: 2.0, chomp: 0, tail: 0.25, tilt: 0.0, low: 0.0 },
};

export const SPEC = { name: 'onionhead', LAYOUT, build, bound: 1.3 };

export class Onionhead extends GhostBase {
  constructor(fx, geometry) {
    super(fx, { name: 'onionhead', radius: 0.58, moods: MOODS, halo: [0.1, 0.62, 0.07], haloSize: 2.0, light: [0.35, 1.0, 0.25], lightI: 2.4 });
    const U = this.U;
    Object.assign(U, {
      uJaw: { value: 0.2 }, uSmile: { value: 0.3 }, uBrow: { value: new THREE.Vector4() }, uTongue: { value: new THREE.Vector4() },
      uArmL: { value: new THREE.Vector4() }, uArmR: { value: new THREE.Vector4() }, uTail: { value: new THREE.Vector4(0.05, 0.03, 0, 0) },
      uPuff: { value: 0 }, uEyes: { value: new THREE.Vector4(0.8, 0.8, 0.5, 0) }, uGazeL: { value: new THREE.Vector3(0, 0, 1) }, uGazeR: { value: new THREE.Vector3(0, 0, 1) },
      uBrowSlant: { value: 0 },
    });
    this.mat = ghostMaterial(VS, FS, U);
    this.mesh = new THREE.Mesh(geometry, this.mat);
    this.mesh.renderOrder = 20;
    this.mesh.frustumCulled = false;
    this.body.add(this.mesh);
    this.halo.U.uHaloK.value = 3.4;
    this.drip = 0;
    this.wisp = 0;
    this.center = new THREE.Vector3(0, -0.02, 0);
  }

  update(dt, p = {}) {
    dt = this.common(dt, p);
    const U = this.U, e = this.e, t = this.t, moodName = this.mood, struggle = this.struggleAmt;
    let jaw = Math.max(e.jaw, this.mouth);
    if (e.chomp > 0.05) jaw = lerp(jaw, 0.08 + 0.92 * Math.pow(0.5 + 0.5 * Math.sin(t * 11), 1.5), e.chomp);
    if (moodName === 'taunt') jaw += Math.sin(t * 7) * 0.08;
    U.uJaw.value = jaw * 0.62;
    U.uSmile.value = e.smile;
    const flail = e.flail;
    const fa = Math.sin(t * 9.5) * flail, fb = Math.sin(t * 8.3 + 1.7) * flail;
    U.uBrow.value.set(e.browL + Math.sin(t * 3.1) * 0.05, e.browR + Math.sin(t * 2.7) * 0.05, e.slant, 0);
    U.uBrowSlant.value = e.slant;
    U.uTongue.value.set(Math.min(1, Math.max(0, e.tongue)), e.wag, moodName === 'taunt' ? 0.6 : 0, 0);
    U.uArmL.value.set(e.armRaise * 0.9 + fa * 0.7 + Math.sin(t * 1.3) * 0.08, e.armSwing * 0.6 + fb * 0.4, Math.sin(t * 2.1) * 0.15 * flail, 0);
    U.uArmR.value.set(e.armRaise * 0.9 - fb * 0.7 + Math.sin(t * 1.2 + 2) * 0.08, e.armSwing * 0.6 + fa * 0.4, Math.sin(t * 1.9) * 0.15 * flail, 0);
    U.uPuff.value = e.puff * (0.75 + 0.25 * Math.sin(t * 11));
    U.uWobble.value = e.wobble + struggle * 1.5;
    U.uSquash.value = this.flinch * 0.9 + (moodName === 'eat' ? Math.max(0, Math.sin(t * 11)) * 0.12 : 0);
    const sp = this.speed;
    U.uTail.value.set(e.tail + sp * 0.01 + struggle * 0.1, e.tail * 0.6 + struggle * 0.06, 0, -Math.min(0.25, sp * 0.03));
    const bl = this.blinkStep(dt);
    let lid = e.lid * (1 - bl);
    if (moodName === 'hurt') lid *= 0.4 + 0.6 * Math.max(0, Math.sin(t * 13));
    const lidL = Math.min(1, Math.max(0, lid + (moodName === 'taunt' ? 0.1 : 0))), lidR = Math.min(1, Math.max(0, lid - (moodName === 'taunt' ? 0.25 : 0)));
    U.uEyes.value.set(lidL, lidR, e.pupil, moodName === 'eat' || moodName === 'hurt' || moodName === 'wrangled' ? 0.6 : 0.1);
    const gz = this.gazeStep(dt, moodName === 'flee' || moodName === 'sucked');
    if (moodName === 'sucked') gz.set(0, 0.6, 0.8).normalize();
    U.uGazeL.value.copy(gz).add(this.T[4].set(-0.06, 0, 0)).normalize();
    U.uGazeR.value.copy(gz).add(this.T[4].set(0.06, 0, 0)).normalize();
    this.body.rotation.z = Math.sin(t * 0.9) * 0.04 + e.tilt * Math.sin(t * 2.2);
    this.body.rotation.x = e.low * 0.12;
    this.body.position.y = Math.sin(t * 1.8) * 0.035 + Math.sin(t * 3.1) * 0.012;
    this.effects(dt, sp, struggle);
    this.finishCommon(e.glow * (1 + 0.06 * Math.sin(t * 3.3)), this.center, 0.3);
  }

  effects(dt, sp, struggle) {
    const fx = this.fx, r = fx.rng, P = fx.pools;
    if (!this.object3D.visible) return;
    const W = this.T[1];
    this.wisp += dt * 7 * (1 + sp * 0.1 + struggle);
    while (this.wisp >= 1) {
      this.wisp -= 1;
      W.set(r.signed() * 0.25 + 0.2, -0.55 + r.signed() * 0.1, -0.45 + r.signed() * 0.1);
      this.object3D.localToWorld(W);
      P.motes.emit(W.x, W.y, W.z, r.signed() * 0.15, r.range(-0.05, 0.2), r.signed() * 0.15, r.range(0.8, 1.8), r.range(0.02, 0.05), r.next(), 1.5, -0.02, -1e3, 2, 1, r.signed());
    }
    this.drip += dt * (this.mood === 'eat' ? 2.5 : 0.5) * (1 + struggle * 3);
    while (this.drip >= 1) {
      this.drip -= 1;
      W.set(r.signed() * 0.25, -0.18 + r.signed() * 0.05, 0.3);
      this.object3D.localToWorld(W);
      P.slime.emit(W.x, W.y, W.z, r.signed() * 0.3, -0.2, r.signed() * 0.3, r.range(0.8, 1.6), r.range(0.015, 0.028), r.next(), 0.4, 1, fx.groundY, 0, 0, 0);
    }
  }
}
