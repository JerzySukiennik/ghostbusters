// Swarm vapour ghost, 1984 film look: small translucent wisp with hollow eyes and an O mouth, tinted per instance, boiling optical edge, cheap enough for six at once.
import * as THREE from 'three';
import { NOISE } from '../glsl.js';
import { clamp } from '../util.js';
import { GK_VS, GK_FS, GhostBase, ghostMaterial } from '../ghostkit.js';
import { MOUTH, LAYOUT, build } from './swarm.sdf.js';

const glv = (a) => `vec3(${a[0].toFixed(4)}, ${a[1].toFixed(4)}, ${a[2].toFixed(4)})`;

const VS = /* glsl */`
${NOISE}
${GK_VS}
attribute vec4 aW1;
attribute vec4 aW2;
attribute float aMat;
attribute vec3 aBump;
uniform float uMouth;
uniform vec2 uArms;
uniform vec3 uTail;
uniform float uPuff;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vW;
varying float vMat;
varying float vTail;
varying float vSkin;
varying float vEye;
void main() {
  vec3 p = position;
  vec3 n = normalize(normal + aBump * 0.3);
  float tail = aW1.x, arm = aW1.y, mouth = aW1.z;
  if (mouth > 0.0) {
    vec3 mc = ${glv(MOUTH)};
    vec3 d = p - mc;
    p = mc + d * vec3(1.0 + uMouth * 0.35 * mouth, 1.0 + uMouth * 0.9 * mouth, 1.0);
  }
  float aw = abs(arm);
  if (aw > 0.0) {
    float sd = arm > 0.0 ? 1.0 : -1.0;
    vec3 piv = vec3(0.1 * sd, -0.04, 0.01);
    float a = (arm > 0.0 ? uArms.x : uArms.y) * aw;
    p = piv + rotZ(p - piv, a * sd);
    n = rotZ(n, a * sd);
  }
  if (tail > 0.0) {
    float w = tail * tail;
    p.x += sin(uTime * 3.1 + uTail.z - tail * 3.5) * uTail.x * w;
    p.y += sin(uTime * 2.6 + uTail.z - tail * 2.8) * uTail.y * w;
  }
  p += n * uPuff * 0.012 * (1.0 - tail);
  gkWobble(p, n, 0.45);
  gkBody(p, n, 0.4);
  vRest = position;
  vMat = aMat;
  vTail = tail;
  vSkin = aW2.x;
  vEye = aW1.w;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FS = /* glsl */`
${NOISE}
${GK_FS}
uniform vec3 uCol;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vW;
varying float vMat;
varying float vTail;
varying float vSkin;
varying float vEye;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (!gl_FrontFacing) N = -N;
  float NV = clamp(dot(N, V), 0.0, 1.0);
  float fres = 1.0 - NV;
  int mat = int(vMat + 0.5);
  float tq = uTimeQ;
  float b1 = sn3(vRest * vec3(8.0, 5.0, 8.0) + vec3(tq * 0.7, -tq * 1.8, tq * 0.5)) * 0.5 + 0.5;
  float b2 = sn3(vRest * 17.0 + vec3(-tq * 1.3, -tq * 2.4, tq)) * 0.5 + 0.5;
  float boil = b1 * 0.65 + b2 * 0.35;
  vec3 col;
  float alpha;
  if (mat > 0) {
    col = uCol * 0.03;
    alpha = 0.62;
  } else {
    float inner = smoothstep(0.0, 0.9, NV);
    float wisp = smoothstep(0.38, 0.8, boil);
    float rim = pow(fres, 1.6);
    vec3 spec;
    vec3 b = lightAll(N, V, vW, uCol * 0.5, 0.45, 0.8, spec);
    vec3 em = uCol * uGlow * (0.05 + 0.26 * wisp * inner + 0.75 * rim + 0.06 * vSkin) + b * 0.12 + spec * 0.15;
    em *= 1.0 - 0.8 * smoothstep(0.2, 0.9, vEye);
    float edge = 1.0 - smoothstep(0.8, 1.0, fres + (boil - 0.5) * 0.3);
    float tail = 1.0 - smoothstep(0.15, 0.9, vTail + (boil - 0.5) * 0.6);
    alpha = (0.1 + 0.3 * wisp * inner + 0.42 * rim) * edge * tail;
    col = em / max(alpha, 0.06) * min(alpha * 8.0, 1.0);
  }
  gl_FragColor = gkFinish(col, alpha, vRest);
}
`;

export const MOODS = {
  idle: { mouth: 0.15, arms: 0.3, flap: 0.4, tail: 0.04, puff: 0, glow: 1.0, wobble: 1.0, spin: 0 },
  eat: { mouth: 0.6, arms: 0.5, flap: 0.6, tail: 0.05, puff: 0.6, glow: 1.1, wobble: 1.2, spin: 0 },
  taunt: { mouth: 0.75, arms: 1.0, flap: 1.0, tail: 0.06, puff: 0.2, glow: 1.2, wobble: 1.2, spin: 1 },
  angry: { mouth: 1.0, arms: 0.9, flap: 0.5, tail: 0.08, puff: 0.4, glow: 1.4, wobble: 1.6, spin: 0 },
  flee: { mouth: 0.9, arms: 1.2, flap: 1.4, tail: 0.1, puff: 0, glow: 1.1, wobble: 1.4, spin: 0 },
  hurt: { mouth: 1.0, arms: 1.0, flap: 1.6, tail: 0.1, puff: 0, glow: 1.7, wobble: 2.2, spin: 0 },
  wrangled: { mouth: 0.95, arms: 1.1, flap: 1.8, tail: 0.12, puff: 0, glow: 1.5, wobble: 2.4, spin: 0 },
  sucked: { mouth: 1.0, arms: 1.3, flap: 1.0, tail: 0.15, puff: 0, glow: 1.6, wobble: 2.0, spin: 0 },
};

export const SPEC = { name: 'swarm', LAYOUT, build, bound: 0.6 };

const TINTS = [[0.62, 0.9, 1.0], [0.8, 0.72, 1.0], [0.66, 1.0, 0.78], [0.88, 0.94, 1.0], [1.0, 0.78, 0.86], [0.7, 0.85, 1.0]];
let made = 0;

export class SwarmGhost extends GhostBase {
  constructor(fx, geometry) {
    const k = made++ % TINTS.length, c = TINTS[k];
    super(fx, { name: 'swarm', radius: 0.26, moods: MOODS, halo: [c[0] * 0.28, c[1] * 0.28, c[2] * 0.32], haloSize: 2.2, light: [c[0], c[1], c[2]], lightI: 0.5 });
    const U = this.U;
    Object.assign(U, { uMouth: { value: 0 }, uArms: { value: new THREE.Vector2() }, uTail: { value: new THREE.Vector3(0.03, 0.02, k * 1.7) }, uPuff: { value: 0 }, uCol: { value: new THREE.Color(c[0], c[1], c[2]) } });
    this.mat = ghostMaterial(VS, FS, U);
    this.mesh = new THREE.Mesh(geometry, this.mat);
    this.mesh.renderOrder = 20;
    this.mesh.frustumCulled = false;
    this.body.add(this.mesh);
    this.halo.U.uHaloK.value = 3.0;
    this.center = new THREE.Vector3(0, -0.02, 0);
    this.lab = { y: 1.62, dist: 0.95, lift: 0.0, fov: 40, look: -0.05 };
    this.seed = k * 2.3;
    this.wisp = 0;
    this.spin = 0;
  }

  setTint(i) {
    const c = TINTS[((i % TINTS.length) + TINTS.length) % TINTS.length];
    this.U.uCol.value.setRGB(c[0], c[1], c[2]);
    this.halo.U.uHaloCol.value.setRGB(c[0] * 0.28, c[1] * 0.28, c[2] * 0.32);
    this.light[0] = c[0]; this.light[1] = c[1]; this.light[2] = c[2];
  }

  update(dt, p = {}) {
    dt = this.common(dt, p, 0.5, 0.06);
    const U = this.U, e = this.e, t = this.t + this.seed, struggle = this.struggleAmt;
    U.uMouth.value = clamp(Math.max(e.mouth, this.mouth) + Math.sin(t * 6) * 0.1, 0, 1.2);
    const f = e.flap + struggle;
    U.uArms.value.set(e.arms * 0.8 + Math.sin(t * 7.5) * 0.5 * f, e.arms * 0.8 + Math.sin(t * 7.5 + 1.3) * 0.5 * f);
    U.uTail.value.x = e.tail + this.speed * 0.008 + struggle * 0.05;
    U.uTail.value.y = e.tail * 0.6 + struggle * 0.04;
    U.uPuff.value = e.puff * (0.6 + 0.4 * Math.sin(t * 9));
    U.uWobble.value = e.wobble + struggle * 1.5;
    U.uSquash.value = this.flinch * 0.9;
    this.spin += dt * e.spin * 9;
    this.body.rotation.y = Math.sin(this.spin) * 0.6 * e.spin;
    this.body.rotation.z = Math.sin(t * 1.3) * 0.08;
    this.body.position.y = Math.sin(t * 2.2) * 0.025;
    this.effects(dt);
    this.finishCommon(e.glow * (1 + 0.08 * Math.sin(t * 4.1)), this.center, 0.22);
  }

  effects(dt) {
    const fx = this.fx, r = fx.rng, P = fx.pools;
    if (!this.object3D.visible) return;
    const W = this.T[1];
    this.wisp += dt * (2.5 + this.speed * 0.6);
    while (this.wisp >= 1) {
      this.wisp -= 1;
      W.set(r.signed() * 0.05 + 0.06, -0.3 + r.signed() * 0.03, -0.3 + r.signed() * 0.04);
      this.object3D.localToWorld(W);
      P.motes.emit(W.x, W.y, W.z, r.signed() * 0.08, r.range(-0.02, 0.12), r.signed() * 0.08, r.range(0.5, 1.1), r.range(0.012, 0.026), r.next(), 1.5, -0.02, -1e3, 2, 0, r.signed() * 0.5);
    }
  }
}
