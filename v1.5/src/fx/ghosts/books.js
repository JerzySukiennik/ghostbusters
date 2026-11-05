// Flung library books: one instanced draw of a hardback (boards, spine, page block), ballistic arcs with a faint ectoplasm rim, tumbling, bounce and settle, fade out.
import * as THREE from 'three';

const VS = /* glsl */`
attribute float aGlow;
attribute float aPart;
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
varying vec3 vC;
varying float vGlow;
varying float vPart;
void main() {
  vL = position;
  vC = instanceColor;
  vGlow = aGlow;
  vPart = aPart;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FS = /* glsl */`
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uAmb;
uniform vec3 uLPos[4];
uniform vec3 uLCol[4];
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
varying vec3 vC;
varying float vGlow;
varying float vPart;
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 diff = uAmb + uKeyCol * max(dot(N, uKeyDir), 0.0);
  vec3 spec = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec3 L = uLPos[i] - vW;
    float d2 = dot(L, L);
    L *= inversesqrt(d2);
    vec3 c = uLCol[i] / (d2 + 0.6) * 0.32;
    diff += c * max(dot(N, L), 0.0);
    spec += c * pow(max(dot(N, normalize(L + V)), 0.0), 24.0) * 0.25;
  }
  vec3 base;
  float sheen;
  if (vPart > 0.5) {
    float lines = 0.82 + 0.18 * sin(vL.y * 1400.0 + h3(floor(vL * 300.0)) * 0.8);
    float age = smoothstep(0.06, 0.1, max(abs(vL.x - 0.004) * 1.4, abs(vL.z)));
    base = mix(vec3(0.8, 0.74, 0.58), vec3(0.6, 0.5, 0.34), age * 0.6) * lines;
    sheen = 0.05;
  } else {
    float grain = 0.85 + 0.15 * h3(floor(vL * 420.0)) + 0.08 * sin(vL.x * 90.0 + vL.z * 70.0);
    vec3 a = abs(vL) / vec3(0.075, 0.015, 0.105);
    float wear = smoothstep(0.86, 1.0, max(a.x, a.z)) * smoothstep(0.6, 1.0, a.y);
    base = vC * grain * (1.0 + wear * 0.9);
    float onSpine = step(vL.x, -0.0735);
    float band = smoothstep(0.004, 0.0, abs(abs(vL.z) - 0.074)) + smoothstep(0.003, 0.0, abs(abs(vL.z) - 0.086)) + smoothstep(0.012, 0.0, abs(vL.z) - 0.018) * step(abs(vL.y), 0.007) * 0.8;
    base = mix(base, vec3(0.62, 0.46, 0.16), clamp(band, 0.0, 1.0) * onSpine);
    sheen = 0.35 + onSpine * band * 1.5;
  }
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);
  vec3 col = base * (diff + 0.06) + spec * sheen + vec3(0.5, 0.66, 1.0) * vGlow * (0.025 + 0.4 * fres);
  gl_FragColor = vec4(col, 1.0);
}
`;

const COVERS = [[0.36, 0.07, 0.05], [0.08, 0.2, 0.12], [0.3, 0.2, 0.1], [0.07, 0.1, 0.28], [0.42, 0.3, 0.12], [0.2, 0.06, 0.12]];

function bookGeometry() {
  const parts = [[0.15, 0.0045, 0.21, 0, 0.01275, 0, 0], [0.15, 0.0045, 0.21, 0, -0.01275, 0, 0], [0.006, 0.03, 0.21, -0.072, 0, 0, 0], [0.14, 0.021, 0.2, 0.001, 0, 0, 1]];
  const pos = [], nor = [], part = [], idx = [];
  for (const [w, h, d, x, y, z, k] of parts) {
    const b = new THREE.BoxGeometry(w, h, d);
    const P = b.attributes.position.array, Nn = b.attributes.normal.array, I = b.index.array, o = pos.length / 3;
    for (let i = 0; i < P.length; i += 3) { pos.push(P[i] + x, P[i + 1] + y, P[i + 2] + z); nor.push(Nn[i], Nn[i + 1], Nn[i + 2]); part.push(k); }
    for (let i = 0; i < I.length; i++) idx.push(I[i] + o);
    b.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  return g;
}

export class BookPool {
  constructor(fx) {
    this.fx = fx;
    const n = fx.quality.books || 32;
    this.n = n;
    const geo = bookGeometry();
    const glow = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    glow.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aGlow', glow);
    this.glowAttr = glow;
    const U = fx.U;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, fog: false, toneMapped: false,
      uniforms: { uKeyDir: U.uKeyDir, uKeyCol: U.uKeyCol, uAmb: U.uAmb, uLPos: U.uLPos, uLCol: U.uLCol },
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'fx-books';
    this.mesh.renderOrder = 5;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) { const k = COVERS[i % COVERS.length]; this.mesh.setColorAt(i, c.setRGB(k[0], k[1], k[2])); }
    this.mesh.instanceColor.needsUpdate = true;
    this.s = new Float32Array(n * 16);
    this.head = 0;
    this.live = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.q2 = new THREE.Quaternion();
    this.p = new THREE.Vector3();
    this.sc = new THREE.Vector3();
    this.ax = new THREE.Vector3();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, this.zero);
    this.mesh.count = n;
    fx.root.add(this.mesh);
  }

  fling(from, at, r) {
    const i = this.head, o = i * 16, S = this.s;
    this.head = (this.head + 1) % this.n;
    let tx, ty, tz;
    if (at) { tx = at.x + r.signed() * 0.6; ty = at.y + r.range(-0.3, 0.2); tz = at.z + r.signed() * 0.6; }
    else { tx = from.x + r.signed() * 5; ty = from.y - 0.5; tz = from.z + r.signed() * 5; }
    const dx = tx - from.x, dy = ty - from.y, dz = tz - from.z;
    const T = Math.max(0.35, Math.min(1.1, Math.hypot(dx, dz) / 11));
    S[o] = from.x; S[o + 1] = from.y; S[o + 2] = from.z;
    S[o + 3] = dx / T; S[o + 4] = dy / T + 0.5 * 6.5 * T; S[o + 5] = dz / T;
    S[o + 6] = 0; S[o + 7] = 0; S[o + 8] = 0; S[o + 9] = 1;
    S[o + 10] = r.signed() * 9; S[o + 11] = r.signed() * 12; S[o + 12] = r.signed() * 6;
    S[o + 13] = 0; S[o + 14] = 1; S[o + 15] = 0;
  }

  clear() {
    this.s.fill(0);
    for (let i = 0; i < this.n; i++) this.mesh.setMatrixAt(i, this.zero);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  flush(dt) {
    const S = this.s, n = this.n, gy = this.fx.groundY + 0.015, G = this.glowAttr.array;
    const q = this.q, q2 = this.q2, ax = this.ax, m = this.m, p = this.p, sc = this.sc;
    let any = false;
    for (let i = 0; i < n; i++) {
      const o = i * 16;
      if (S[o + 14] <= 0) { G[i] = 0; continue; }
      any = true;
      const age = S[o + 13] += dt;
      const airborne = S[o + 15] < 0.5;
      if (airborne) {
        S[o + 4] -= 6.5 * dt;
        S[o] += S[o + 3] * dt; S[o + 1] += S[o + 4] * dt; S[o + 2] += S[o + 5] * dt;
        if (S[o + 1] < gy) {
          S[o + 1] = gy;
          if (Math.abs(S[o + 4]) > 2.2) { S[o + 4] *= -0.3; S[o + 3] *= 0.5; S[o + 5] *= 0.5; S[o + 10] *= 0.4; S[o + 11] *= 0.4; S[o + 12] *= 0.4; }
          else { S[o + 15] = 1; S[o + 4] = 0; S[o + 10] = 0; S[o + 12] = 0; S[o + 11] *= 0.3; S[o + 6] = 0; S[o + 8] = 0; const l = Math.hypot(S[o + 7], S[o + 9]) || 1; S[o + 7] /= l; S[o + 9] /= l; }
        }
      } else {
        S[o] += S[o + 3] * dt; S[o + 2] += S[o + 5] * dt;
        S[o + 3] *= Math.exp(-dt * 6); S[o + 5] *= Math.exp(-dt * 6); S[o + 11] *= Math.exp(-dt * 6);
      }
      q.set(S[o + 6], S[o + 7], S[o + 8], S[o + 9]);
      const w = Math.hypot(S[o + 10], S[o + 11], S[o + 12]);
      if (w > 1e-3) { ax.set(S[o + 10] / w, S[o + 11] / w, S[o + 12] / w); q2.setFromAxisAngle(ax, w * dt); q.premultiply(q2).normalize(); }
      S[o + 6] = q.x; S[o + 7] = q.y; S[o + 8] = q.z; S[o + 9] = q.w;
      const fade = age > 9 ? Math.max(0, 1 - (age - 9) / 1.5) : 1;
      if (fade <= 0) { S[o + 14] = 0; this.mesh.setMatrixAt(i, this.zero); G[i] = 0; continue; }
      p.set(S[o], S[o + 1], S[o + 2]);
      sc.setScalar(fade);
      m.compose(p, q, sc);
      this.mesh.setMatrixAt(i, m);
      G[i] = airborne ? 1 : Math.max(0, 1 - age * 0.5);
    }
    if (any || this.live) { this.mesh.instanceMatrix.needsUpdate = true; this.glowAttr.needsUpdate = true; }
    this.live = any;
  }
}
