// Library ghost, 1984 film look: translucent lilac librarian reading in mid-air; provoked she snaps into a skull-faced screaming horror and flings books.
import * as THREE from 'three';
import { NOISE } from '../glsl.js';
import { clamp } from '../util.js';
import { GK_VS, GK_FS, GhostBase, ghostMaterial } from '../ghostkit.js';
import { EYE_L, EYE_R, HINGE, MOUTH_Y, SHOULDER, ELBOW, BOOK_C, LAYOUT, build } from './library.sdf.js';

const glv = (a) => `vec3(${a[0].toFixed(4)}, ${a[1].toFixed(4)}, ${a[2].toFixed(4)})`;

const VS = /* glsl */`
${NOISE}
${GK_VS}
attribute vec4 aW1;
attribute vec4 aW2;
attribute float aMat;
attribute vec3 aBump;
attribute float aFore;
uniform float uJaw;
uniform float uHorror;
uniform vec4 uArmL;
uniform vec4 uArmR;
uniform vec2 uForeL;
uniform vec2 uForeR;
uniform vec3 uHead;
uniform float uHair;
uniform vec2 uSkirt;
uniform float uBook;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vW;
varying float vSkirt;
flat varying float vMat;
varying float vSkin;
varying float vSocket;
void main() {
  vec3 p = position;
  vec3 n = normalize(normal + aBump * 0.22);
  float jaw = aW1.x, arm = aW1.y, hair = aW1.z, head = aW1.w;
  float sink = aW2.x, socket = aW2.y, skirt = aW2.z;
  float H = uHorror;
  if (jaw > 0.0) {
    vec3 hg = ${glv(HINGE)};
    float a = uJaw * jaw;
    p = hg + rotX(p - hg, a);
    n = rotX(n, a);
    p.y -= jaw * H * 0.07 * smoothstep(${MOUTH_Y.toFixed(3)}, 0.33, position.y + 0.02);
  }
  if (head > 0.0) {
    p.y = mix(p.y, 0.33 + (p.y - 0.33) * (1.0 + 0.13 * H), head);
    p.x *= 1.0 - 0.08 * H * head * smoothstep(0.36, 0.43, position.y);
    p -= n * (sink * 0.016 + socket * 0.02) * H;
    p += n * hair * H * (0.006 + 0.022 * (sn3(position * 30.0 + uTime * 3.0) * 0.5 + 0.5)) + vec3(0.0, hair * H * 0.02, -hair * H * 0.015);
    p += n * hair * (sn3(position * 22.0 + uTime * 0.7) * 0.006);
    vec3 nk = vec3(0.0, 0.33, -0.01);
    p = mix(p, nk + (p - nk) * (1.0 + 0.55 * H), head);
    vec3 r = p - nk;
    r = rotX(r, uHead.x * head);
    r = rotY(r, uHead.y * head);
    r = rotZ(r, uHead.z * head);
    p = nk + r;
    n = rotZ(rotY(rotX(n, uHead.x * head), uHead.y * head), uHead.z * head);
  }
  float aw = abs(arm);
  if (aw > 0.0) {
    float sd = arm > 0.0 ? 1.0 : -1.0;
    vec4 A = arm > 0.0 ? uArmL : uArmR;
    vec2 F = arm > 0.0 ? uForeL : uForeR;
    vec3 el = vec3(${ELBOW[0].toFixed(3)} * sd, ${ELBOW[1].toFixed(3)}, ${ELBOW[2].toFixed(3)});
    vec3 q = p - el;
    q = rotX(q, -F.x * aFore);
    q = rotZ(q, F.y * sd * aFore);
    p = el + q;
    n = rotZ(rotX(n, -F.x * aFore), F.y * sd * aFore);
    vec3 piv = vec3(${SHOULDER[0].toFixed(3)} * sd, ${SHOULDER[1].toFixed(3)}, ${SHOULDER[2].toFixed(3)});
    vec3 r = p - piv;
    r = rotZ(r, A.x * sd * aw);
    r = rotX(r, -A.y * aw);
    r = rotY(r, A.z * sd * aw);
    p = piv + r;
    n = rotY(rotX(rotZ(n, A.x * sd * aw), -A.y * aw), A.z * sd * aw);
  }
  if (aMat > 2.5 && aMat < 3.5) p = mix(${glv(BOOK_C)} + vec3(0.0, -0.02, 0.0), p, uBook);
  if (skirt > 0.0) {
    float w = skirt * skirt;
    p.x += sin(uTime * 1.6 - skirt * 3.0 + position.z * 4.0) * uSkirt.x * w;
    p.z += sin(uTime * 1.3 - skirt * 2.4 + position.x * 5.0) * uSkirt.x * 0.7 * w - uSkirt.y * w;
    p.xz *= 1.0 + H * 0.25 * w * (0.8 + 0.2 * sin(uTime * 7.0 + position.y * 9.0));
  }
  gkWobble(p, n, 0.6);
  gkBody(p, n, 1.3);
  vRest = position;
  vSkirt = skirt;
  vMat = aMat;
  vSkin = aW2.w;
  vSocket = socket;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FS = /* glsl */`
${NOISE}
${GK_FS}
uniform float uHorror;
uniform float uJaw;
uniform vec2 uEyes;
uniform float uBook;
uniform vec3 uGlowCol;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vW;
varying float vSkirt;
flat varying float vMat;
varying float vSkin;
varying float vSocket;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (!gl_FrontFacing) N = -N;
  float NV = clamp(dot(N, V), 0.0, 1.0);
  float fres = 1.0 - NV;
  float H = uHorror;
  float tq = uTimeQ;
  float boil = sn3(vRest * 3.1 + vec3(tq * 0.6, -tq * 0.9, tq * 0.5)) * 0.5 + 0.5;
  int mat = int(vMat + 0.5);
  vec3 spec;
  vec3 col;
  float alpha;
  vec3 lilac = mix(vec3(0.5, 0.36, 0.9), vec3(0.5, 0.72, 1.0), H);
  vec3 rimC = mix(vec3(0.42, 0.28, 0.85), vec3(0.45, 0.75, 1.0), H);
  float inner = smoothstep(0.0, 0.9, NV);
  if (mat == 5) {
    vec3 ec = vRest.x > 0.0 ? ${glv(EYE_L)} : ${glv(EYE_R)};
    vec3 en = normalize(vRest - ec);
    float pupil = smoothstep(0.86, 0.94, en.z);
    vec3 eye = mix(vec3(0.75, 0.72, 0.85), vec3(0.12, 0.08, 0.2), pupil);
    float lid = smoothstep(uEyes.x - 0.1, uEyes.x + 0.1, en.y);
    eye = mix(eye, vec3(0.45, 0.36, 0.6), lid);
    vec3 b = lightAll(N, V, vW, eye, 0.3, 0.4, spec);
    col = b * 0.6 + eye * 0.35 + spec * 0.8;
    vec3 hollow = vec3(0.0) + vec3(1.0, 0.95, 0.75) * smoothstep(0.93, 0.99, en.z) * 3.2;
    col = mix(col, hollow, H);
    alpha = 0.95;
  } else if (mat == 4) {
    float depth = clamp((0.09 - vRest.z) / 0.07, 0.0, 1.0);
    col = mix(vec3(0.12, 0.04, 0.1), vec3(0.005, 0.0, 0.01), depth) * (1.0 - 0.6 * H);
    col = mix(vec3(0.32, 0.22, 0.48) * (0.6 + 0.4 * NV), col, smoothstep(0.02, 0.25, uJaw + H));
    alpha = 0.97;
  } else if (mat == 3) {
    vec3 cover = vec3(0.32, 0.08, 0.06);
    vec3 page = vec3(0.86, 0.8, 0.62) * (0.85 + 0.15 * sn3(vRest * vec3(400.0, 30.0, 30.0)));
    float pg = step(0.5, sn3(vRest * 3.0) * 0.0 + 0.5) * smoothstep(-0.2, 0.4, dot(N, vec3(0.0, 0.92, -0.39)));
    vec3 base = mix(cover, page, pg);
    vec3 b = lightAll(N, V, vW, base, 0.6, 0.5, spec);
    col = b * 0.9 + base * 0.25 + lilac * 0.08;
    alpha = 0.9 * uBook;
  } else if (mat == 2) {
    vec3 base = mix(vec3(0.62, 0.6, 0.72), vec3(0.42, 0.44, 0.5), H) * (0.8 + 0.3 * vSkin);
    vec3 b = lightAll(N, V, vW, base, 0.55, 0.6, spec);
    col = b * 0.7 + lilac * (0.22 + 0.3 * inner) * (1.0 - 0.5 * H) + spec * 0.3;
    alpha = mix(0.82, 0.2, pow(fres, 1.3)) * (1.0 - 0.35 * H);
  } else if (mat == 1) {
    vec3 skinC = mix(vec3(0.78, 0.68, 0.9), vec3(0.55, 0.6, 0.56), H);
    vec3 base = skinC * (0.85 + 0.25 * vSkin);
    vec3 b = lightAll(N, V, vW, base, 0.5, 0.7, spec);
    col = b * 0.75 + lilac * (0.2 + 0.32 * inner) * mix(uGlow, 0.7, H) + spec * 0.35;
    col *= 1.0 - 0.3 * H * (1.0 - vSkin);
    float hollowK = vSocket * H;
    col *= 1.0 - 0.92 * smoothstep(0.15, 0.7, hollowK);
    float cheek = smoothstep(0.6, 0.0, NV) * H;
    col *= 1.0 - 0.35 * cheek;
    alpha = mix(0.9, 0.3, pow(fres, 1.3));
  } else {
    vec3 dress = mix(vec3(0.4, 0.3, 0.72), vec3(0.42, 0.62, 0.95), H) * (0.75 + 0.35 * vSkin);
    vec3 b = lightAll(N, V, vW, dress, 0.6, 0.7, spec);
    vec3 emis = lilac * (0.12 + 0.38 * inner + 0.12 * boil) * uGlow;
    col = b * 0.6 + emis + spec * 0.25;
    alpha = mix(0.72, 0.1, pow(fres, 1.2));
    alpha *= 1.0 - smoothstep(0.35, 1.0, vSkirt + (boil - 0.5) * 0.35);
  }
  vec3 rim = rimC * pow(fres, 2.0) * uGlow * 0.55 * (1.0 - smoothstep(0.5, 1.0, vSkirt));
  gl_FragColor = gkFinish(col, alpha, vRest);
  gl_FragColor.rgb += rim * uOpacity * (1.0 - uSuck * 0.5);
}
`;

export const MOODS = {
  idle: { horror: 0, jaw: 0.0, armRaise: 0, armFwd: 0.0, elbow: 0, twist: 0, elbowOut: 0, shushR: 0, head: 0.22, book: 1, hair: 0, skirt: 0.04, glow: 1.0, wobble: 0.6, lid: 0.25, look: 0 },
  eat: { horror: 0, jaw: 0.04, armRaise: 0, armFwd: 0.08, elbow: 0.1, twist: 0, elbowOut: 0, shushR: 0, head: 0.3, book: 1, hair: 0, skirt: 0.03, glow: 1.0, wobble: 0.5, lid: 0.4, look: 0 },
  taunt: { horror: 0, jaw: 0.0, armRaise: 0, armFwd: 0.0, elbow: 0, twist: 0, elbowOut: 0, shushR: 1, head: -0.08, book: 1, hair: 0, skirt: 0.05, glow: 1.1, wobble: 0.7, lid: -0.1, look: 1 },
  angry: { horror: 1, jaw: 0.95, armRaise: 1.1, armFwd: 1.1, elbow: 0, twist: 0.3, elbowOut: 0.9, shushR: 0, head: -0.18, book: 0, hair: 1, skirt: 0.12, glow: 1.25, wobble: 1.6, lid: -1, look: 1 },
  flee: { horror: 0.6, jaw: 0.55, armRaise: 0.5, armFwd: 1.6, elbow: 0.9, twist: 0, elbowOut: 0, shushR: 0, head: 0.05, book: 0, hair: 0.6, skirt: 0.14, glow: 1.15, wobble: 1.3, lid: -1, look: 0 },
  hurt: { horror: 0.85, jaw: 0.8, armRaise: 0.9, armFwd: 1.2, elbow: 0.5, twist: 0, elbowOut: 0.5, shushR: 0, head: -0.25, book: 0, hair: 0.8, skirt: 0.12, glow: 1.6, wobble: 2.0, lid: -1, look: 1 },
  wrangled: { horror: 1, jaw: 0.9, armRaise: 1.0, armFwd: 0.9, elbow: 0.2, twist: 0.2, elbowOut: 0.8, shushR: 0, head: -0.15, book: 0, hair: 1, skirt: 0.16, glow: 1.4, wobble: 2.2, lid: -1, look: 1 },
  sucked: { horror: 1, jaw: 1.0, armRaise: 1.3, armFwd: 0.6, elbow: 0, twist: 0, elbowOut: 0.6, shushR: 0, head: -0.3, book: 0, hair: 1, skirt: 0.2, glow: 1.5, wobble: 2.0, lid: -1, look: 0 },
};

export const SPEC = { name: 'library', LAYOUT, build, bound: 1.6 };

export class LibraryGhost extends GhostBase {
  constructor(fx, geometry) {
    super(fx, { name: 'library', radius: 0.72, moods: MOODS, halo: [0.3, 0.2, 0.62], haloSize: 1.7, light: [0.6, 0.45, 1.0], lightI: 2.0 });
    const U = this.U;
    Object.assign(U, {
      uJaw: { value: 0 }, uHorror: { value: 0 }, uArmL: { value: new THREE.Vector4() }, uArmR: { value: new THREE.Vector4() }, uForeL: { value: new THREE.Vector2() }, uForeR: { value: new THREE.Vector2() },
      uHead: { value: new THREE.Vector3() }, uHair: { value: 0 }, uSkirt: { value: new THREE.Vector2(0.04, 0) }, uBook: { value: 1 },
      uEyes: { value: new THREE.Vector2(0.25, 0) }, uGlowCol: { value: new THREE.Vector3(0.6, 0.45, 1.0) },
    });
    this.mat = ghostMaterial(VS, FS, U);
    this.mesh = new THREE.Mesh(geometry, this.mat);
    this.mesh.renderOrder = 20;
    this.mesh.frustumCulled = false;
    this.body.add(this.mesh);
    this.halo.U.uHaloK.value = 3.6;
    this.center = new THREE.Vector3(0, 0.05, 0);
    this.haloC = new THREE.Vector3();
    this.lab = { y: 1.25, dist: 2.75, lift: 0.0, fov: 42, look: -0.2 };
    this.wisp = 0;
    this.flingSeen = 0;
    this.scream = 0;
    this.prevHorror = 0;
    this.pageT = 0;
  }

  update(dt, p = {}) {
    dt = this.common(dt, p, 0.25, 0.025);
    const U = this.U, e = this.e, t = this.t, moodName = this.mood, struggle = this.struggleAmt;
    const H = clamp(e.horror + this.hurt * 0.3, 0, 1);
    if (H > 0.55 && this.prevHorror <= 0.55) this.scream = 1;
    this.prevHorror = H;
    this.scream = Math.max(0, this.scream - dt * 1.6);
    U.uHorror.value = Math.pow(H, 0.8);
    let jaw = Math.max(e.jaw, this.mouth * (0.3 + 0.7 * H));
    jaw += H * 0.08 * Math.sin(t * 23) + this.scream * 0.15;
    U.uJaw.value = clamp(jaw, 0, 1.15) * 0.95;
    const fl = Math.sin(t * 9) * H * 0.18 + Math.sin(t * 13 + 1) * struggle * 0.25;
    const sh = e.shushR;
    U.uArmL.value.set(e.armRaise + fl + Math.sin(t * 1.1) * 0.03, e.armFwd + Math.sin(t * 7.3) * 0.12 * H, e.twist, 0);
    U.uForeL.value.set(e.elbow + Math.sin(t * 8.1) * 0.2 * H, e.elbowOut);
    U.uArmR.value.set(e.armRaise * (1 - sh) - fl - sh * 0.2 + Math.sin(t * 1.3) * 0.03, e.armFwd * (1 - sh) + sh * 1.4 + Math.sin(t * 6.1 + 2) * 0.12 * H, e.twist * (1 - sh), 0);
    U.uForeR.value.set(e.elbow * (1 - sh) + sh * 0.2 + Math.sin(t * 7.7) * 0.2 * H, e.elbowOut * (1 - sh) + sh * 0.4);
    this.pageT += dt;
    const read = (1 - H) * (1 - sh);
    U.uHead.value.set(e.head + Math.sin(t * 0.7) * 0.03 * read + Math.sin(t * 17) * 0.05 * H, (Math.sin(t * 0.45) * 0.18 * read) + e.look * Math.sin(t * 0.8) * 0.12 + Math.sin(t * 11) * 0.06 * H, Math.sin(t * 0.6) * 0.05 + Math.sin(t * 19) * 0.05 * H);
    U.uBook.value = clamp(e.book, 0, 1);
    U.uSkirt.value.set(e.skirt + this.speed * 0.012 + struggle * 0.1, Math.min(0.3, this.speed * 0.035));
    U.uEyes.value.set(e.lid + (this.blinkStep(dt) > 0.5 ? 1.2 : 0), 0);
    U.uWobble.value = e.wobble + struggle * 1.5;
    U.uSquash.value = this.flinch * 0.6;
    this.body.rotation.z = Math.sin(t * 0.8) * 0.03;
    this.body.rotation.x = -Math.min(0.3, this.speed * 0.03);
    this.body.position.y = Math.sin(t * 1.4) * 0.03;
    this.halo.U.uHaloCol.value.setRGB(0.3 - 0.06 * H, 0.2 + 0.25 * H, 0.62 + 0.2 * H);
    this.light[0] = 0.6 - 0.2 * H; this.light[1] = 0.45 + 0.35 * H; this.light[2] = 1.0;
    this.effects(dt, p.x, H);
    this.haloC.set(0, 0.0 + 0.1 * H, 0);
    this.finishCommon(e.glow * (1 + 0.05 * Math.sin(t * 2.7)) * (1 + this.scream * 0.4), this.haloC, 0.16 + 0.06 * H);
  }

  effects(dt, x, H) {
    const fx = this.fx, r = fx.rng, P = fx.pools;
    if (!this.object3D.visible) return;
    const W = this.T[1];
    this.wisp += dt * (5 + 10 * H) * (1 + this.speed * 0.1);
    while (this.wisp >= 1) {
      this.wisp -= 1;
      W.set(r.signed() * 0.3, -0.95 + r.signed() * 0.12, r.signed() * 0.25);
      this.object3D.localToWorld(W);
      P.motes.emit(W.x, W.y, W.z, r.signed() * 0.12, r.range(-0.1, 0.12), r.signed() * 0.12, r.range(0.8, 1.6), r.range(0.02, 0.045), r.next(), 1.5, -0.02, -1e3, 0, 0, r.signed());
    }
    const books = fx.shared.library;
    if (!books || !x) return;
    const n = x.fling | 0;
    if (n !== this.flingSeen) {
      const k = Math.min(3, Math.max(0, n - this.flingSeen));
      this.flingSeen = n;
      for (let i = 0; i < k; i++) {
        W.set(r.signed() * 0.6, r.range(-0.2, 0.5), r.range(0.1, 0.5));
        this.object3D.localToWorld(W);
        books.fling(W, x.at || null, r);
      }
    }
  }

  release() { this.flingSeen = 0; }
}
