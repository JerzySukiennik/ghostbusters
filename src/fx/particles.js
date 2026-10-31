// GPU particle pools: analytic motion (drag, gravity, ground bounce, vortex, drift), ring-buffer spawns, one draw per pool.
import * as THREE from 'three';
import { NOISE } from './glsl.js';

const MOTION = /* glsl */`
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iC;
attribute vec4 iD;
uniform float uT;
uniform float uPx;
uniform vec3 uVortex;
uniform float uVortexK;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying float vFade;
varying float vCol;
bool motion(out vec3 p, out vec3 v, out float age, out float x) {
  age = uT - iA.w;
  float life = iB.w;
  if (age < 0.0 || age >= life || life <= 0.0) return false;
  x = age / life;
  float kind = iD.y;
  if (kind > 0.5 && kind < 1.5) {
    vec3 rel = iA.xyz - uVortex;
    float h0 = rel.y;
    vec2 rd = rel.xz;
    float r0 = length(rd);
    float a0 = atan(rd.y, rd.x);
    float k = uVortexK * (0.7 + iC.y * 0.6);
    float r = r0 * exp(-age * k * 1.1);
    float a = a0 + age * (2.5 + 1.6 / (r + 0.12)) * (iC.y > 0.5 ? 1.0 : 1.15);
    float h = h0 * exp(-age * k * 0.9) + sin(age * 5.0 + iC.y * 30.0) * 0.04;
    p = uVortex + vec3(cos(a) * r, h, sin(a) * r);
    v = vec3(-sin(a), -0.4, cos(a)) * (1.0 + r);
    return true;
  }
  float k = max(iC.z, 0.05);
  vec3 g = vec3(0.0, -9.81 * iC.w, 0.0);
  float e = exp(-k * age);
  vec3 vt = g / k;
  p = iA.xyz + vt * age + (iB.xyz - vt) * (1.0 - e) / k;
  v = vt + (iB.xyz - vt) * e;
  if (kind > 1.5) {
    float s = iC.y * 31.0;
    p += vec3(sn3(vec3(p.xz * 1.7, age * 0.9 + s)), sn3(vec3(p.zy * 1.3, age * 0.7 + s + 9.0)) * 0.4, sn3(vec3(p.yx * 1.5, age * 0.8 + s + 17.0))) * (0.15 + age * 0.35) * iD.w;
  }
  float gy = iD.x;
  if (p.y < gy) { p.y = gy + (gy - p.y) * 0.28; v.y = -v.y * 0.3; v.xz *= 0.55; }
  return true;
}
`;

const VS_STREAK = /* glsl */`
${NOISE}
${MOTION}
uniform float uStreak;
uniform float uMinPx;
void main() {
  vec3 p, v; float age, x;
  if (!motion(p, v, age, x)) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec3 hv = (viewMatrix * vec4(p, 1.0)).xyz;
  vec3 vv = (viewMatrix * vec4(v, 0.0)).xyz;
  float sp = length(vv);
  vec3 dir = sp > 1e-4 ? vv / sp : vec3(0.0, 1.0, 0.0);
  vec3 toCam = normalize(-hv);
  vec3 side = cross(dir, toCam);
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
  float size = iC.x * (1.0 - x * 0.5);
  float minW = uMinPx * uPx * max(-hv.z, 0.01);
  float w = max(size, minW);
  vFade = size / w;
  float len = sp * uStreak + w * 2.0;
  vec3 pv = hv + side * position.x * w + dir * (position.y * 0.5 - 0.5) * len;
  vUv = position.xy;
  vAge = x;
  vSeed = iC.y;
  vCol = iD.z;
  gl_Position = projectionMatrix * vec4(pv, 1.0);
}
`;

const VS_BILL = /* glsl */`
${NOISE}
${MOTION}
uniform float uGrow;
uniform float uMinPx;
void main() {
  vec3 p, v; float age, x;
  if (!motion(p, v, age, x)) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec3 hv = (viewMatrix * vec4(p, 1.0)).xyz;
  float size = iC.x * (1.0 + uGrow * x);
  float minW = uMinPx * uPx * max(-hv.z, 0.01);
  float w = max(size, minW);
  vFade = size / w;
  float rot = iD.w * age + iC.y * 6.2831;
  float c = cos(rot), s = sin(rot);
  vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
  vec3 pv = hv + vec3(q * w, 0.0);
  vUv = position.xy;
  vAge = x;
  vSeed = iC.y;
  vCol = iD.z;
  gl_Position = projectionMatrix * vec4(pv, 1.0);
}
`;

const FS_SPARK_MODERN = /* glsl */`
varying vec2 vUv; varying float vAge; varying float vSeed; varying float vFade; varying float vCol;
uniform float uGain;
void main() {
  float across = exp(-vUv.x * vUv.x * 3.5);
  float along = smoothstep(-1.0, -0.2, vUv.y) * (0.55 + 0.45 * smoothstep(0.2, 1.0, vUv.y));
  float a = across * along * vFade;
  float T = clamp(1.0 - vAge * (1.2 - min(vCol, 1.0) * 0.5), 0.0, 1.0);
  vec3 hot = mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.62, 0.22), smoothstep(0.0, 0.5, T));
  hot = mix(hot, vec3(1.0, 0.95, 0.8), smoothstep(0.55, 1.0, T));
  hot = mix(hot, mix(vec3(0.3, 1.0, 0.2), vec3(0.85, 1.0, 0.75), T), step(1.5, vCol));
  float I = uGain * (0.6 + 14.0 * T * T) * (1.0 - smoothstep(0.85, 1.0, vAge));
  gl_FragColor = vec4(hot * I * a, 1.0);
}
`;

const FS_SPARK_FILM = /* glsl */`
varying vec2 vUv; varying float vAge; varying float vSeed; varying float vFade; varying float vCol;
uniform float uGain;
void main() {
  float across = smoothstep(1.0, 0.35, abs(vUv.x));
  float along = smoothstep(-1.0, -0.6, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
  float a = across * along * vFade;
  float T = 1.0 - vAge;
  vec3 c = mix(vec3(1.0, 0.72, 0.35), vec3(0.85, 0.95, 1.0), step(0.45, fract(vSeed * 7.3)));
  c = mix(c, vec3(1.0), smoothstep(0.4, 1.0, T) * 0.6);
  c = mix(c, vec3(0.55, 1.0, 0.4), step(1.5, vCol));
  float I = uGain * (2.0 + 10.0 * T) * step(vAge, 0.92);
  gl_FragColor = vec4(c * I * a, 1.0);
}
`;

const FS_EMBER = /* glsl */`
varying vec2 vUv; varying float vAge; varying float vSeed; varying float vFade; varying float vCol;
uniform float uGain;
uniform float uFilm;
void main() {
  float r = length(vUv);
  float core = exp(-r * r * 9.0);
  float halo = exp(-r * r * 2.5) * 0.25;
  float tw = 0.65 + 0.35 * sin(vAge * 40.0 + vSeed * 60.0);
  float T = 1.0 - vAge;
  vec3 c = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.7, 0.3), T);
  vec3 g = vec3(0.45, 1.0, 0.3);
  c = mix(c, g, step(0.5, vCol) * step(vCol, 1.5));
  c = mix(c, vec3(0.75, 0.88, 1.0), step(1.5, vCol));
  float I = uGain * (1.5 + 5.0 * T) * tw * smoothstep(0.0, 0.06, vAge) * (1.0 - smoothstep(0.75, 1.0, vAge));
  gl_FragColor = vec4(c * I * (core + halo) * vFade, 1.0);
}
`;

const FS_SMOKE = /* glsl */`
varying vec2 vUv; varying float vAge; varying float vSeed; varying float vFade; varying float vCol;
uniform sampler2D uTex;
uniform vec3 uLightCol;
uniform vec3 uAmb;
uniform float uDensity;
void main() {
  vec4 t = texture2D(uTex, vUv * 0.5 + 0.5);
  float fade = smoothstep(0.0, 0.12, vAge) * (1.0 - smoothstep(0.45, 1.0, vAge));
  float d = t.r * fade * uDensity * (0.6 + 0.4 * vFade);
  vec3 base = mix(vec3(0.16, 0.15, 0.14), vec3(0.75, 0.75, 0.78), step(0.5, vCol));
  base = mix(base, vec3(0.35, 0.3, 0.24), step(1.5, vCol));
  vec3 lit = base * (uAmb + uLightCol * (0.35 + 0.65 * t.g) * (1.0 - vAge * 0.6));
  gl_FragColor = vec4(lit * d, d);
}
`;

const FS_SLIME = /* glsl */`
varying vec2 vUv; varying float vAge; varying float vSeed; varying float vFade; varying float vCol;
uniform float uGain;
uniform float uFilm;
void main() {
  vec2 q = vUv * vec2(1.0, 1.0);
  float r = length(q);
  if (r > 1.0) discard;
  float a = smoothstep(1.0, 0.75, r) * vFade;
  vec3 nrm = normalize(vec3(q * 0.9, 0.6));
  float spec = pow(max(dot(nrm, normalize(vec3(-0.4, 0.6, 0.7))), 0.0), 24.0);
  vec3 c = mix(vec3(0.12, 0.55, 0.06), vec3(0.4, 0.95, 0.2), 0.5 + 0.5 * nrm.y);
  c = c * uGain * (1.0 + uFilm * 1.5) + spec * vec3(1.6, 1.8, 1.3);
  float fade = 1.0 - smoothstep(0.85, 1.0, vAge);
  gl_FragColor = vec4(c * a * fade, a * fade * 0.92);
}
`;

const FS_CHIP = /* glsl */`
varying vec2 vUv; varying float vAge; varying float vSeed; varying float vFade; varying float vCol;
uniform vec3 uAmb;
uniform vec3 uLightCol;
void main() {
  vec2 q = abs(vUv);
  float shape = step(q.x + q.y * (0.6 + vSeed * 0.5), 1.0);
  if (shape < 0.5) discard;
  float fade = 1.0 - smoothstep(0.8, 1.0, vAge);
  float sh = 0.55 + 0.45 * fract(vSeed * 13.7);
  vec3 c = vec3(0.22, 0.2, 0.19) * sh * (uAmb + uLightCol * 0.6);
  gl_FragColor = vec4(c * fade, fade);
}
`;

const FS_MOTE = /* glsl */`
varying vec2 vUv; varying float vAge; varying float vSeed; varying float vFade; varying float vCol;
uniform float uGain;
uniform float uFilm;
uniform vec3 uTint;
void main() {
  float r = length(vUv);
  float core = exp(-r * r * 12.0);
  float star = (exp(-abs(vUv.x) * 18.0) * exp(-abs(vUv.y) * 2.5) + exp(-abs(vUv.y) * 18.0) * exp(-abs(vUv.x) * 2.5)) * uFilm;
  float tw = 0.55 + 0.45 * sin(vAge * 30.0 + vSeed * 80.0);
  float env = smoothstep(0.0, 0.1, vAge) * (1.0 - smoothstep(0.7, 1.0, vAge));
  vec3 c = mix(uTint, vec3(1.0), 0.35 * core);
  c = mix(c, vec3(0.55, 1.0, 0.35), step(0.5, vCol) * step(vCol, 1.5));
  float I = uGain * env * tw * vFade;
  gl_FragColor = vec4(c * I * (core * 3.0 + star * 2.0 + exp(-r * r * 3.0) * 0.4), 1.0);
}
`;

function quad() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export class ParticlePool {
  constructor(fx, name, capacity, mats, renderOrder) {
    this.fx = fx;
    this.name = name;
    this.cap = capacity;
    this.head = 0;
    this.dirty = false;
    this.data = new Float32Array(capacity * 16);
    for (let i = 0; i < capacity; i++) this.data[i * 16 + 7] = -1;
    const buf = new THREE.InstancedInterleavedBuffer(this.data, 16, 1);
    buf.setUsage(THREE.DynamicDrawUsage);
    this.buf = buf;
    const g = quad();
    g.setAttribute('iA', new THREE.InterleavedBufferAttribute(buf, 4, 0));
    g.setAttribute('iB', new THREE.InterleavedBufferAttribute(buf, 4, 4));
    g.setAttribute('iC', new THREE.InterleavedBufferAttribute(buf, 4, 8));
    g.setAttribute('iD', new THREE.InterleavedBufferAttribute(buf, 4, 12));
    g.instanceCount = capacity;
    this.mats = mats;
    this.mesh = new THREE.Mesh(g, mats.modern);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'fx-' + name;
    fx.root.add(this.mesh);
  }

  emit(x, y, z, vx, vy, vz, life, size, seed, drag, grav, groundY, kind, col, spin, t0) {
    const o = this.head * 16, d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = t0 === undefined ? this.fx.time : t0;
    d[o + 4] = vx; d[o + 5] = vy; d[o + 6] = vz; d[o + 7] = life;
    d[o + 8] = size; d[o + 9] = seed; d[o + 10] = drag; d[o + 11] = grav;
    d[o + 12] = groundY; d[o + 13] = kind; d[o + 14] = col; d[o + 15] = spin;
    this.head = (this.head + 1) % this.cap;
    this.dirty = true;
  }

  clear() { for (let i = 0; i < this.cap; i++) this.data[i * 16 + 7] = -1; this.dirty = true; }

  setStyle(style) { this.mesh.material = this.mats[style] || this.mats.modern; }

  flush() { if (this.dirty) { this.buf.needsUpdate = true; this.dirty = false; } }
}

function mat(vs, fs, uniforms, blend) {
  const m = new THREE.ShaderMaterial({
    vertexShader: vs, fragmentShader: fs, uniforms,
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false, fog: false,
  });
  if (blend === 'add') { m.blending = THREE.AdditiveBlending; }
  else if (blend === 'pre') {
    m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  } else { m.blending = THREE.NormalBlending; }
  return m;
}

export function createPools(fx, Q) {
  const U = fx.U;
  const base = (timeKey) => ({ uT: U[timeKey], uPx: U.uPx, uVortex: U.uVortex, uVortexK: U.uVortexK });
  const pools = {};
  pools.sparks = new ParticlePool(fx, 'sparks', Q.sparks, {
    modern: mat(VS_STREAK, FS_SPARK_MODERN, { ...base('uTime'), uStreak: { value: 0.022 }, uMinPx: { value: 1.3 }, uGain: { value: 1.0 } }, 'add'),
    film: mat(VS_STREAK, FS_SPARK_FILM, { ...base('uTimeQ'), uStreak: { value: 0.05 }, uMinPx: { value: 1.6 }, uGain: { value: 1.0 } }, 'add'),
  }, 52);
  pools.embers = new ParticlePool(fx, 'embers', Q.embers, {
    modern: mat(VS_BILL, FS_EMBER, { ...base('uTime'), uGrow: { value: -0.4 }, uMinPx: { value: 1.2 }, uGain: { value: 1.0 }, uFilm: { value: 0 } }, 'add'),
    film: mat(VS_BILL, FS_EMBER, { ...base('uTimeQ'), uGrow: { value: -0.4 }, uMinPx: { value: 1.5 }, uGain: { value: 1.3 }, uFilm: { value: 1 } }, 'add'),
  }, 51);
  pools.smoke = new ParticlePool(fx, 'smoke', Q.smoke, {
    modern: mat(VS_BILL, FS_SMOKE, { ...base('uTime'), uGrow: { value: 2.2 }, uMinPx: { value: 0 }, uTex: { value: fx.tex.smoke }, uLightCol: U.uSmokeLight, uAmb: U.uAmb, uDensity: { value: 0.75 } }, 'pre'),
    film: mat(VS_BILL, FS_SMOKE, { ...base('uTimeQ'), uGrow: { value: 2.0 }, uMinPx: { value: 0 }, uTex: { value: fx.tex.smoke }, uLightCol: U.uSmokeLight, uAmb: U.uAmb, uDensity: { value: 0.85 } }, 'pre'),
  }, 30);
  pools.slime = new ParticlePool(fx, 'slime', Q.slime, {
    modern: mat(VS_STREAK, FS_SLIME, { ...base('uTime'), uStreak: { value: 0.03 }, uMinPx: { value: 1.0 }, uGain: { value: 0.9 }, uFilm: { value: 0 } }, 'pre'),
    film: mat(VS_STREAK, FS_SLIME, { ...base('uTimeQ'), uStreak: { value: 0.04 }, uMinPx: { value: 1.0 }, uGain: { value: 1.0 }, uFilm: { value: 1 } }, 'pre'),
  }, 31);
  pools.chips = new ParticlePool(fx, 'chips', Q.chips, {
    modern: mat(VS_BILL, FS_CHIP, { ...base('uTime'), uGrow: { value: 0 }, uMinPx: { value: 0.8 }, uAmb: U.uAmb, uLightCol: U.uSmokeLight }, 'normal'),
    film: mat(VS_BILL, FS_CHIP, { ...base('uTimeQ'), uGrow: { value: 0 }, uMinPx: { value: 0.8 }, uAmb: U.uAmb, uLightCol: U.uSmokeLight }, 'normal'),
  }, 29);
  pools.motes = new ParticlePool(fx, 'motes', Q.motes, {
    modern: mat(VS_BILL, FS_MOTE, { ...base('uTime'), uGrow: { value: -0.3 }, uMinPx: { value: 1.2 }, uGain: { value: 1.0 }, uFilm: { value: 0 }, uTint: { value: new THREE.Color(1.0, 0.92, 0.75) } }, 'add'),
    film: mat(VS_BILL, FS_MOTE, { ...base('uTimeQ'), uGrow: { value: -0.3 }, uMinPx: { value: 1.5 }, uGain: { value: 1.4 }, uFilm: { value: 1 }, uTint: { value: new THREE.Color(0.8, 0.85, 1.0) } }, 'add'),
  }, 53);
  pools.chips.mats.modern.transparent = true;
  return pools;
}
