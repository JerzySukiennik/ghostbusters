// Ghost runtime kit: shared GLSL (squash, stretch, struggle, trap suck, FX-light shading, finish), optical halo, mood easing, mesh loading and the GhostBase class.
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { clamp } from './util.js';
import { decodeMesh, encodeMesh } from './sculpt.js';

export const GK_VS = /* glsl */`
uniform float uTime;
uniform vec4 uStretch;
uniform vec3 uJiggle;
uniform float uSquash;
uniform float uSuck;
uniform vec3 uTrap;
uniform float uStruggle;
uniform float uWobble;
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
void gkWobble(inout vec3 p, vec3 n, float k) {
  vec3 q = p * 3.2 + uTime * vec3(0.45, 0.62, 0.53);
  p += n * (sn3(q) * 0.011 * uWobble + sin(uTime * 2.1) * 0.006) * k;
  p += n * sn3(p * 7.5 + uTime * 11.0) * 0.022 * uStruggle * k;
}
void gkBody(inout vec3 p, inout vec3 n, float scale) {
  p.y *= 1.0 - uSquash * 0.16;
  p.xz *= 1.0 + uSquash * 0.09;
  vec3 ax = uStretch.xyz;
  float st = uStretch.w;
  float da = dot(p, ax);
  p = ax * da * st + (p - ax * da) / sqrt(st);
  float dn = dot(n, ax);
  n = normalize(ax * dn / st + (n - ax * dn) * sqrt(st));
  p += uJiggle * smoothstep(0.05 * scale, 0.6 * scale, length(p));
  if (uSuck > 0.0) {
    float D = max(length(uTrap), 0.01);
    vec3 axis = uTrap / D;
    float a = dot(p, axis);
    vec3 perp = p - axis * a;
    float near = clamp(a / (0.9 * scale) * 0.5 + 0.5, 0.0, 1.0);
    float prog = clamp(uSuck * 1.75 - (1.0 - near) * 0.75, 0.0, 1.0);
    float pr = prog * prog * (3.0 - 2.0 * prog);
    float ang = pr * 8.0 + uSuck * 4.0 + uTime * 6.0 * uSuck;
    float c = cos(ang), s = sin(ang);
    perp = perp * c + cross(axis, perp) * s;
    n = n * c + cross(axis, n) * s + axis * dot(axis, n) * (1.0 - c);
    perp *= 1.0 - pr * 0.94;
    p = axis * mix(a, D, pr * pr) + perp;
    p *= 1.0 - uSuck * uSuck * 0.3;
  }
}
`;

export const GK_FS = /* glsl */`
uniform float uTime;
uniform float uTimeQ;
uniform float uGlow;
uniform float uHurt;
uniform vec4 uHit;
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uAmb;
uniform vec3 uLPos[4];
uniform vec3 uLCol[4];
uniform float uOpacity;
uniform float uSuck;
uniform vec3 uTint;
uniform vec3 uSelf;
uniform vec3 uHurtC;
vec3 lightAll(vec3 N, vec3 V, vec3 W, vec3 base, float rough, float wrap, out vec3 spec) {
  vec3 diff = uAmb;
  spec = vec3(0.0);
  float a = rough * rough;
  float a2 = a * a;
  float kd = max((dot(N, uKeyDir) + wrap) / (1.0 + wrap), 0.0);
  diff += uKeyCol * kd;
  vec3 H = normalize(uKeyDir + V);
  float nh = max(dot(N, H), 0.0);
  float dd = nh * nh * (a2 - 1.0) + 1.0;
  spec += uKeyCol * a2 / (3.1416 * dd * dd) * max(dot(N, uKeyDir), 0.0) * 0.25;
  for (int i = 0; i < 4; i++) {
    vec3 L = uLPos[i] - W;
    float d2 = dot(L, L);
    L *= inversesqrt(d2);
    float att = 1.0 / (d2 + 0.6);
    vec3 so = uLPos[i] - uSelf;
    vec3 c = uLCol[i] * att * 0.32 * step(0.5, dot(so, so));
    diff += c * max((dot(N, L) + wrap) / (1.0 + wrap), 0.0);
    vec3 Hl = normalize(L + V);
    float nhl = max(dot(N, Hl), 0.0);
    float dl = nhl * nhl * (a2 - 1.0) + 1.0;
    spec += c * a2 / (3.1416 * dl * dl) * max(dot(N, L), 0.0) * 0.25;
  }
  return base * diff;
}
vec4 gkFinish(vec3 col, float alpha, vec3 rest) {
  float hit = exp(-dot(rest - uHit.xyz, rest - uHit.xyz) * 30.0) * uHit.w;
  col += vec3(1.0, 0.7, 0.3) * hit * 1.1;
  float fl = 0.6 + 0.4 * sin(uTimeQ * 55.0);
  col += uHurtC * uHurt * fl;
  col *= uTint;
  float sk = clamp(uSuck * 1.4, 0.0, 1.0);
  col = mix(col, col * 1.25 + vec3(0.25, 0.35, 0.5) * 0.3, sk * 0.5);
  return vec4(col * alpha * uOpacity, alpha * uOpacity);
}
`;

const HALO_VS = /* glsl */`
uniform vec3 uHaloC;
uniform vec2 uHaloR;
varying vec2 vUv;
void main() {
  vec4 c = modelViewMatrix * vec4(uHaloC, 1.0);
  c.xyz += normalize(c.xyz) * uHaloR.x * 0.3;
  c.xy += position.xy * uHaloR;
  vUv = position.xy;
  gl_Position = projectionMatrix * c;
}
`;

const HALO_FS = /* glsl */`
${NOISE}
uniform vec3 uHaloCol;
uniform float uHaloI;
uniform float uTimeQ;
uniform float uSeed;
uniform float uHaloK;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = atan(vUv.y, vUv.x);
  float n = sn2(vec2(a * 2.2 + uSeed, r * 3.0 - uTimeQ * 1.7)) * 0.5 + 0.5;
  float n2 = sn2(vec2(a * 5.0 - uSeed, r * 6.0 + uTimeQ * 2.3)) * 0.5 + 0.5;
  float g = exp(-r * r * uHaloK) * (0.65 + 0.45 * n + 0.2 * n2) * smoothstep(1.0, 0.6, r);
  gl_FragColor = vec4(uHaloCol * g * uHaloI, 1.0);
}
`;

let haloGeo = null;
export function makeHalo(fx, color, seed = 0) {
  if (!haloGeo) haloGeo = new THREE.PlaneGeometry(2, 2);
  const u = {
    uHaloC: { value: new THREE.Vector3() }, uHaloR: { value: new THREE.Vector2(1, 1) }, uHaloCol: { value: new THREE.Color(...color) },
    uHaloI: { value: 0 }, uTimeQ: fx.U.uTimeQ, uSeed: { value: seed }, uHaloK: { value: 3.2 },
  };
  const m = new THREE.ShaderMaterial({ vertexShader: HALO_VS, fragmentShader: HALO_FS, uniforms: u, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
  const mesh = new THREE.Mesh(haloGeo, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 19;
  mesh.name = 'fx-halo';
  mesh.U = u;
  return mesh;
}

export function commonUniforms(fx) {
  return {
    uTime: fx.U.uTime, uTimeQ: fx.U.uTimeQ,
    uStretch: { value: new THREE.Vector4(0, 1, 0, 1) }, uJiggle: { value: new THREE.Vector3() }, uSquash: { value: 0 },
    uSuck: { value: 0 }, uTrap: { value: new THREE.Vector3(0, -1, 0) }, uStruggle: { value: 0 }, uWobble: { value: 1 },
    uGlow: { value: 1 }, uHurt: { value: 0 }, uHit: { value: new THREE.Vector4(0, 0, 0, 0) },
    uKeyDir: fx.U.uKeyDir, uKeyCol: fx.U.uKeyCol, uAmb: fx.U.uAmb, uLPos: fx.U.uLPos, uLCol: fx.U.uLCol,
    uOpacity: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uSelf: { value: new THREE.Vector3() }, uHurtC: { value: new THREE.Vector3(0.405, 0.45, 0.36) },
  };
}

export function ghostMaterial(vs, fs, uniforms, opts = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: vs, fragmentShader: fs, uniforms, defines: opts.defines || {},
    transparent: true, depthWrite: true, depthTest: true, toneMapped: false, fog: false, side: opts.side || THREE.FrontSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}

export function meshToGeometry(m, radius = 1.5) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3, true));
  for (const [k, a] of Object.entries(m.attrs)) g.setAttribute(k, new THREE.BufferAttribute(a.array, a.size, a.normalized));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  if (m.split) { g.addGroup(0, m.split, 0); g.addGroup(m.split, m.index.length - m.split, 1); }
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
  return g;
}

export async function loadGhostMesh(name, res, build, layout) {
  try {
    const r = await fetch(new URL(`../../assets/fx/${name}_${res}.bin`, import.meta.url));
    if (r.ok) return decodeMesh(await r.arrayBuffer());
  } catch (e) { }
  console.warn(`[fx] ${name}_${res}.bin missing, sculpting in the browser`);
  return decodeMesh(encodeMesh(build(res), layout));
}

export class GhostBase {
  constructor(fx, { name, radius, moods, halo, haloSize = 2.2, light = [0.35, 1.0, 0.25], lightI = 2.4 }) {
    this.fx = fx;
    this.type = name;
    this.object3D = new THREE.Group();
    this.object3D.name = name;
    this.radius = radius;
    this.body = new THREE.Group();
    this.body.name = name + '-rig';
    this.object3D.add(this.body);
    this.U = commonUniforms(fx);
    this.moods = moods;
    this.keys = Object.keys(moods.idle);
    this.e = {};
    for (const k of this.keys) this.e[k] = moods.idle[k];
    this.mood = 'idle';
    this.t = 0;
    this.vel = new THREE.Vector3();
    this.prevVel = new THREE.Vector3();
    this.jig = new THREE.Vector3();
    this.jigV = new THREE.Vector3();
    this.sv = new THREE.Vector3();
    this.flinch = 0;
    this.prevHurt = 0;
    this.hurt = 0;
    this.suck = 0;
    this.mouth = 0;
    this.speed = 0;
    this.struggleAmt = 0;
    this.suckHid = false;
    this.light = light;
    this.lightI = lightI;
    this.haloSize = haloSize;
    this.halo = halo ? makeHalo(fx, halo, Math.random() * 10) : null;
    if (this.halo) this.body.add(this.halo);
    this.T = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(), new THREE.Vector3()];
    this.blink = 0;
    this.nextBlink = 2;
    this.gaze = new THREE.Vector3(0, 0, 1);
    this.gazeT = new THREE.Vector3(0, 0, 1);
    this.saccade = 0;
  }

  hit(localPoint, amount = 1) {
    this.U.uHit.value.set(localPoint.x, localPoint.y, localPoint.z, Math.min(1.5, this.U.uHit.value.w + amount));
  }

  hitWorld(p, amount = 1) {
    const l = this.T[5].copy(p);
    this.body.worldToLocal(l);
    this.hit(l, amount);
  }

  get active() { return this.object3D.visible && this.object3D.parent !== null; }

  ease(dt, moodName, fast) {
    const M = this.moods[moodName] || this.moods.idle;
    const k = 1 - Math.exp(-dt * (fast ? 18 : 7));
    const e = this.e, K = this.keys;
    for (let i = 0; i < K.length; i++) { const key = K[i]; e[key] += (M[key] - e[key]) * k; }
  }

  common(dt, p, stretchMax = 0.42, stretchK = 0.045) {
    const U = this.U;
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.t += dt;
    const moodName = p.mood && this.moods[p.mood] ? p.mood : 'idle';
    this.mood = moodName;
    this.ease(dt, moodName, moodName === 'hurt');
    const hurt = clamp(p.hurt || 0, 0, 1);
    if (hurt > this.prevHurt + 0.15) this.flinch = 1;
    this.prevHurt = hurt;
    this.hurt = hurt;
    this.flinch = Math.max(0, this.flinch - dt * 5);
    let struggle = 0;
    const sv = this.sv;
    if (p.struggle && typeof p.struggle === 'object') { struggle = Math.min(1, p.struggle.length()); sv.copy(p.struggle); }
    else { struggle = clamp(+p.struggle || 0, 0, 1); sv.set(0, 0, 0); }
    if (moodName === 'wrangled') struggle = Math.max(struggle, 0.35);
    this.struggleAmt = struggle;
    const suck = clamp(p.suck || 0, 0, 1);
    this.suck = suck;
    this.mouth = clamp(p.mouth || 0, 0, 1);
    const v = this.vel;
    if (p.vel) v.copy(p.vel); else v.set(0, 0, 0);
    const inv = this.T[3];
    this.object3D.getWorldQuaternion(inv).invert();
    const lv = this.T[1].copy(v).applyQuaternion(inv);
    const sp = lv.length();
    this.speed = sp;
    const t = this.t;
    const stretch = 1 + Math.min(stretchMax, sp * stretchK) + struggle * 0.12 * Math.abs(Math.sin(t * 13));
    if (sp > 0.05) lv.multiplyScalar(1 / sp); else lv.set(0, 1, 0);
    if (struggle > 0.01 && sv.lengthSq() > 1e-6) {
      const ls = this.T[2].copy(sv).applyQuaternion(inv).normalize();
      lv.lerp(ls, clamp(struggle / (struggle + sp * 0.1 + 0.01), 0, 1)).normalize();
    }
    U.uStretch.value.set(lv.x, lv.y, lv.z, stretch);
    const acc = this.T[2].copy(v).sub(this.prevVel).multiplyScalar(dt > 0 ? 1 / dt : 0);
    this.prevVel.copy(v);
    acc.applyQuaternion(inv).clampLength(0, 60);
    this.jigV.addScaledVector(acc, -0.3 * dt);
    this.jigV.addScaledVector(this.jig, -60 * dt);
    this.jigV.multiplyScalar(Math.max(0, 1 - 4.6 * dt));
    this.jig.addScaledVector(this.jigV, dt);
    this.jig.clampLength(0, 0.12 * this.radius / 0.58);
    U.uJiggle.value.copy(this.jig);
    U.uStruggle.value = struggle;
    U.uSuck.value = suck;
    if (p.trapPos && suck > 0) {
      const tl = this.T[0].copy(p.trapPos);
      this.body.updateWorldMatrix(true, false);
      this.body.worldToLocal(tl);
      U.uTrap.value.copy(tl);
    }
    if (suck >= 0.995) { if (this.object3D.visible) { this.object3D.visible = false; this.suckHid = true; } }
    else if (this.suckHid) { this.object3D.visible = true; this.suckHid = false; }
    U.uHurt.value = hurt;
    U.uHit.value.w = Math.max(0, U.uHit.value.w - dt * 2.5);
    return dt;
  }

  blinkStep(dt) {
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) { this.blink = 1; this.nextBlink = this.fx.rng.range(1.8, 4.5); }
    this.blink = Math.max(0, this.blink - dt * 7);
    return this.blink > 0 ? Math.sin(this.blink * Math.PI) : 0;
  }

  gazeStep(dt, wander = false) {
    const fx = this.fx;
    this.saccade -= dt;
    const cam = fx.camera;
    if (this.saccade <= 0) {
      this.saccade = fx.rng.range(0.4, 1.6);
      const gz = this.gazeT;
      if (cam && !wander) {
        cam.getWorldPosition(gz);
        this.object3D.worldToLocal(gz);
        gz.normalize();
        gz.x += fx.rng.signed() * 0.15; gz.y += fx.rng.signed() * 0.1;
      } else gz.set(fx.rng.signed() * 0.8, fx.rng.signed() * 0.3, 0.5);
      gz.normalize();
      if (gz.z < 0.25) { gz.z = 0.25; gz.normalize(); }
    }
    this.gaze.lerp(this.gazeT, 1 - Math.exp(-dt * 25)).normalize();
    return this.gaze;
  }

  finishCommon(glow, haloC, haloI = 1) {
    const U = this.U, suck = this.suck;
    U.uGlow.value = glow * (1 + suck * 0.5);
    const G = this.T[0];
    this.object3D.getWorldPosition(G);
    U.uSelf.value.copy(G);
    if (this.halo) {
      const h = this.halo.U;
      if (haloC) h.uHaloC.value.copy(haloC); else h.uHaloC.value.set(0, 0, 0);
      const s = this.haloSize * this.radius * (1 - suck * 0.6);
      h.uHaloR.value.set(s, s);
      h.uHaloI.value = haloI * glow * (1 + this.hurt * 0.8) * (1 - suck * 0.4) * U.uOpacity.value;
    }
    const l = this.light;
    if (this.lightI > 0) this.fx.lightPool.request(G, l[0], l[1], l[2], this.lightI * glow * (1 + this.hurt * 0.6) * (1 - suck * 0.5), 2, 6);
  }
}
