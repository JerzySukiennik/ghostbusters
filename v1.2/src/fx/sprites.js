// Instanced flares (glow, star, anamorphic streak, starburst, lens ghost, splash) and jagged lightning bolts, slot based.
import * as THREE from 'three';
import { NOISE } from './glsl.js';

const FLARE_VS = /* glsl */`
attribute vec4 iP;
attribute vec4 iC;
attribute vec4 iT;
attribute vec4 iX;
uniform float uPx;
varying vec2 vUv;
varying vec3 vCol;
varying float vType;
varying float vSeed;
varying float vI;
varying vec4 vX;
void main() {
  if (iC.w <= 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec3 hv = (viewMatrix * vec4(iP.xyz, 1.0)).xyz;
  float d = length(hv);
  float pull = min(iT.w, d * 0.6);
  hv += normalize(-hv) * pull;
  float size = max(iP.w, 2.0 * uPx * max(-hv.z, 0.01));
  float rot = iT.y;
  float c = cos(rot), s = sin(rot);
  vec2 q = position.xy * vec2(iX.x, 1.0);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  hv.xy += q * size;
  vUv = position.xy;
  vCol = iC.rgb;
  vI = iC.w;
  vType = iT.x;
  vSeed = iT.z;
  vX = iX;
  gl_Position = projectionMatrix * vec4(hv, 1.0);
}
`;

const FLARE_FS = /* glsl */`
${NOISE}
varying vec2 vUv;
varying vec3 vCol;
varying float vType;
varying float vSeed;
varying float vI;
varying vec4 vX;
void main() {
  vec2 p = vUv;
  float r = length(p);
  float a = atan(p.y, p.x);
  float v = 0.0;
  vec3 col = vCol;
  if (vType < 0.5) {
    v = exp(-r * r * 5.0) + exp(-r * 14.0) * 1.5;
  } else if (vType < 1.5) {
    float rays = pow(abs(cos(a * 2.0 + vSeed * 6.0)), 60.0) * 0.8 + pow(abs(cos(a * 3.0 + vSeed * 13.0)), 200.0) * 0.6;
    float rn = 0.6 + 0.4 * h11(floor((a + 3.1416) * 9.0) + floor(vSeed * 40.0));
    v = exp(-r * 22.0) * 4.0 + exp(-r * r * 9.0) * 0.6 + rays * exp(-r * 3.2 / rn) * (1.0 - r);
  } else if (vType < 2.5) {
    float yy = abs(p.y), xx = abs(p.x);
    v = exp(-yy * 26.0) * exp(-xx * 2.4) * 0.9 + exp(-yy * 90.0) * exp(-xx * 1.1) * 0.6;
    v *= 1.0 - smoothstep(0.85, 1.0, xx);
  } else if (vType < 3.5) {
    float n = 48.0;
    float id = floor((a + 3.1416) / 6.2832 * n);
    float fa = fract((a + 3.1416) / 6.2832 * n) - 0.5;
    float len = 0.25 + 0.75 * pow(h11(id + vSeed * 91.0), 1.6);
    float th = (0.08 + 0.1 * h11(id * 3.1 + vSeed * 17.0)) * (1.0 - r);
    float spike = smoothstep(th, 0.0, abs(fa)) * smoothstep(len, len * 0.6, r);
    float blob = smoothstep(0.42, 0.0, r + sn2(p * 5.0 + vSeed * 9.0) * 0.12);
    v = spike * 1.3 + blob * 2.2 + exp(-r * 9.0) * 1.5;
  } else if (vType < 4.5) {
    float ring = exp(-pow((r - 0.72) * 9.0, 2.0)) * 0.5;
    float disc = smoothstep(0.75, 0.55, r) * 0.25;
    v = (ring + disc) * smoothstep(1.0, 0.85, r);
  } else if (vType < 5.5) {
    float n1 = sn2(vec2(a * 3.0, r * 3.0 - vSeed * 20.0));
    float streak = pow(max(0.0, sn1(a * 9.0 + vSeed * 30.0) * 0.5 + 0.5), 3.0);
    v = smoothstep(1.0, 0.1, r + n1 * 0.2) * (0.4 + streak * 1.4) + exp(-r * 8.0) * 2.5;
  } else {
    float wob = sn2(vec2(a * 2.0 + vSeed * 9.0, vSeed * 5.0)) * 0.18;
    float blob = smoothstep(0.85 + wob, 0.2, r);
    float splat = pow(max(0.0, sn1(a * 7.0 + vSeed * 50.0)), 2.0) * smoothstep(1.0, 0.4, r) * 1.2;
    v = blob * 1.2 + splat + exp(-r * 7.0) * 2.0;
  }
  gl_FragColor = vec4(col * v * vI, 1.0);
}
`;

const BOLT_VS = /* glsl */`
${NOISE}
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iS;
attribute vec4 iK;
uniform float uPx;
varying float vSide;
varying float vI;
varying vec3 vCol;
varying float vT;
vec3 boltAt(float t, vec3 A, vec3 B, vec3 N1, vec3 N2, float amp, float seed, float freq) {
  float env = pow(sin(3.14159 * clamp(t, 0.0, 1.0)), 0.65);
  float L = length(B - A);
  float x = t * freq;
  vec3 p = mix(A, B, t);
  p += (N1 * jag(x, seed) + N2 * jag(x + 19.3, seed + 4.1)) * amp * L * env;
  return p;
}
void main() {
  if (iB.w <= 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  float t = position.x;
  float side = position.y;
  vec3 A = iA.xyz, B = iB.xyz;
  vec3 D = B - A;
  float L = max(length(D), 1e-4);
  vec3 T0 = D / L;
  vec3 R = abs(T0.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 N1 = normalize(cross(R, T0));
  vec3 N2 = cross(T0, N1);
  float freq = iS.z;
  float e = 1.0 / 48.0;
  vec3 P = boltAt(t, A, B, N1, N2, iS.y, iS.x, freq);
  vec3 Pa = boltAt(t - e, A, B, N1, N2, iS.y, iS.x, freq);
  vec3 Pb = boltAt(t + e, A, B, N1, N2, iS.y, iS.x, freq);
  vec3 Ts = Pb - Pa;
  float tl = length(Ts);
  Ts = tl > 1e-6 ? Ts / tl : T0;
  vec3 V = cameraPosition - P;
  float dist = length(V);
  V /= max(dist, 1e-4);
  vec3 sd = cross(Ts, V);
  float sl = length(sd);
  sd = sl > 1e-5 ? sd / sl : N1;
  float w = iA.w * (0.6 + 0.4 * sin(3.14159 * t));
  float we = max(w, 1.15 * uPx * dist);
  vI = iB.w * (w / we);
  vSide = side;
  vT = t;
  vCol = iK.rgb;
  P += sd * side * we * 3.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}
`;

const BOLT_FS = /* glsl */`
varying float vSide;
varying float vI;
varying vec3 vCol;
varying float vT;
void main() {
  float y = abs(vSide) * 3.0;
  float core = smoothstep(1.0, 0.0, y);
  float glow = exp(-y * y * 0.6) * 0.35;
  vec3 c = mix(vCol, vec3(1.0), core * core * 0.4);
  gl_FragColor = vec4(c * (core * 1.0 + glow) * vI, 1.0);
}
`;

export class FlarePool {
  constructor(fx, capacity = 48) {
    this.fx = fx;
    this.cap = capacity;
    this.data = new Float32Array(capacity * 16);
    const buf = new THREE.InstancedInterleavedBuffer(this.data, 16, 1);
    buf.setUsage(THREE.DynamicDrawUsage);
    this.buf = buf;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('iP', new THREE.InterleavedBufferAttribute(buf, 4, 0));
    g.setAttribute('iC', new THREE.InterleavedBufferAttribute(buf, 4, 4));
    g.setAttribute('iT', new THREE.InterleavedBufferAttribute(buf, 4, 8));
    g.setAttribute('iX', new THREE.InterleavedBufferAttribute(buf, 4, 12));
    g.instanceCount = capacity;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: FLARE_VS, fragmentShader: FLARE_FS,
      uniforms: { uPx: fx.U.uPx },
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 60;
    this.mesh.name = 'fx-flares';
    fx.root.add(this.mesh);
    this.next = 0;
  }

  alloc(n) { const s = this.next; this.next += n; if (this.next > this.cap) throw new Error('FlarePool full'); return s; }

  set(slot, x, y, z, size, r, g, b, intensity, type, rot, seed, pull, aspect) {
    const o = slot * 16, d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = size;
    d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = intensity;
    d[o + 8] = type; d[o + 9] = rot; d[o + 10] = seed; d[o + 11] = pull;
    d[o + 12] = aspect || 1; d[o + 13] = 0; d[o + 14] = 0; d[o + 15] = 0;
  }

  off(slot) { this.data[slot * 16 + 7] = 0; }
  clear() { for (let i = 0; i < this.cap; i++) this.data[i * 16 + 7] = 0; }
  flush() { this.buf.needsUpdate = true; }
}

export class BoltPool {
  constructor(fx, capacity = 48, segments = 40) {
    this.fx = fx;
    this.cap = capacity;
    this.data = new Float32Array(capacity * 16);
    const buf = new THREE.InstancedInterleavedBuffer(this.data, 16, 1);
    buf.setUsage(THREE.DynamicDrawUsage);
    this.buf = buf;
    const pos = [], idx = [];
    for (let i = 0; i <= segments; i++) { const t = i / segments; pos.push(t, -1, 0, t, 1, 0); }
    for (let i = 0; i < segments; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.setAttribute('iA', new THREE.InterleavedBufferAttribute(buf, 4, 0));
    g.setAttribute('iB', new THREE.InterleavedBufferAttribute(buf, 4, 4));
    g.setAttribute('iS', new THREE.InterleavedBufferAttribute(buf, 4, 8));
    g.setAttribute('iK', new THREE.InterleavedBufferAttribute(buf, 4, 12));
    g.instanceCount = capacity;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: BOLT_VS, fragmentShader: BOLT_FS,
      uniforms: { uPx: fx.U.uPx },
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 55;
    this.mesh.name = 'fx-bolts';
    fx.root.add(this.mesh);
    this.next = 0;
  }

  alloc(n) { const s = this.next; this.next += n; if (this.next > this.cap) throw new Error('BoltPool full'); return s; }

  set(slot, ax, ay, az, bx, by, bz, width, intensity, seed, amp, freq, r, g, b) {
    const o = slot * 16, d = this.data;
    d[o] = ax; d[o + 1] = ay; d[o + 2] = az; d[o + 3] = width;
    d[o + 4] = bx; d[o + 5] = by; d[o + 6] = bz; d[o + 7] = intensity;
    d[o + 8] = seed; d[o + 9] = amp; d[o + 10] = freq; d[o + 11] = 0;
    d[o + 12] = r; d[o + 13] = g; d[o + 14] = b; d[o + 15] = 0;
  }

  off(slot) { this.data[slot * 16 + 7] = 0; }
  clear() { for (let i = 0; i < this.cap; i++) this.data[i * 16 + 7] = 0; }
  flush() { this.buf.needsUpdate = true; }
}
