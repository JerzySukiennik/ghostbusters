// Pooled surface decals (scorch with cooling glow, slime splats, slam craters) in one instanced draw.
import * as THREE from 'three';

const VS = /* glsl */`
attribute vec4 iP;
attribute vec4 iN;
attribute vec4 iE;
uniform float uT;
varying vec2 vUv;
varying float vAge;
varying float vType;
varying float vSeed;
varying float vLife;
varying vec3 vN;
varying vec3 vW;
void main() {
  float age = uT - iP.w;
  if (iE.w <= 0.0 || age < 0.0 || age > iE.w) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec3 n = normalize(iN.xyz);
  vec3 r = abs(n.y) < 0.98 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t = normalize(cross(r, n));
  vec3 b = cross(n, t);
  float c = cos(iE.y), s = sin(iE.y);
  vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
  float grow = iE.x > 0.5 && iE.x < 1.5 ? 0.55 + 0.45 * smoothstep(0.0, 0.1, age) : 1.0;
  vec3 wp = iP.xyz + (t * q.x + b * q.y) * iN.w * grow + n * 0.008;
  vUv = position.xy;
  vAge = age;
  vType = iE.x;
  vSeed = iE.z;
  vLife = iE.w;
  vN = n;
  vW = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FS = /* glsl */`
uniform sampler2D uScorch;
uniform sampler2D uSlime;
uniform vec3 uAmb;
uniform vec3 uLightCol;
uniform float uFilm;
varying vec2 vUv;
varying float vAge;
varying float vType;
varying float vSeed;
varying float vLife;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec2 uv = vUv * 0.5 + 0.5;
  float fade = 1.0 - smoothstep(vLife * 0.75, vLife, vAge);
  if (vType > 2.5) {
    float a = clamp(vAge / vLife, 0.0, 1.0);
    float r = length(vUv);
    float R = 0.12 + 0.86 * (1.0 - pow(1.0 - a, 3.0));
    float w = 0.05 + 0.12 * a;
    float ring = exp(-pow((r - R) / w, 2.0)) * step(r, 1.0);
    vec3 c = mix(vec3(0.9, 1.0, 0.75), vec3(0.4, 1.0, 0.3), a) * (1.0 + uFilm * 0.4);
    gl_FragColor = vec4(c * ring * pow(1.0 - a, 2.0) * 2.4, 0.0);
    return;
  }
  if (vType < 0.5 || vType > 1.5) {
    vec4 t = texture2D(uScorch, uv);
    float crater = step(1.5, vType);
    float soot = t.r * (0.88 + crater * 0.1);
    float heat = exp(-vAge * (crater > 0.5 ? 0.9 : 0.85));
    float hotMask = t.g * (0.6 + 0.4 * t.a) + t.b * crater * 0.6;
    vec3 glow = mix(vec3(1.0, 0.16, 0.02), vec3(1.0, 0.55, 0.15), heat) * hotMask * heat * heat * (1.6 + 3.0 * heat);
    glow *= 1.0 - uFilm * 0.3;
    float a = clamp(soot * fade, 0.0, 1.0);
    gl_FragColor = vec4(glow * fade, a);
  } else {
    vec4 t = texture2D(uSlime, uv);
    float cov = t.r;
    float h = t.g;
    vec3 sx = dFdx(vW), sy = dFdy(vW);
    vec3 R1 = cross(sy, vN), R2 = cross(vN, sx);
    float det = dot(sx, R1);
    vec2 dh = vec2(dFdx(h), dFdy(h)) * 0.035;
    vec3 nrm = normalize(abs(det) * vN - sign(det) * (dh.x * R1 + dh.y * R2) + vN * 1e-6);
    if (cov < 0.01) discard;
    vec3 V = normalize(cameraPosition - vW);
    vec3 L = normalize(vec3(-0.3, 1.0, 0.4));
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(nrm, H), 0.0), 60.0) * 2.5 + pow(1.0 - max(dot(nrm, V), 0.0), 4.0) * 0.4;
    vec3 base = mix(vec3(0.05, 0.28, 0.03), vec3(0.22, 0.75, 0.12), h);
    vec3 col = base * (uAmb * 2.0 + uLightCol * 0.5) + base * (0.35 + uFilm * 0.4) * (0.6 + 0.4 * t.b) + spec * (uLightCol * 0.4 + vec3(0.5, 0.6, 0.5));
    float a = cov * fade * (0.7 + 0.25 * h);
    gl_FragColor = vec4(col * a, a);
  }
}
`;

export class DecalPool {
  constructor(fx, capacity) {
    this.fx = fx;
    this.cap = capacity;
    this.head = 0;
    this.dirty = false;
    this.data = new Float32Array(capacity * 12);
    const buf = new THREE.InstancedInterleavedBuffer(this.data, 12, 1);
    buf.setUsage(THREE.DynamicDrawUsage);
    this.buf = buf;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('iP', new THREE.InterleavedBufferAttribute(buf, 4, 0));
    g.setAttribute('iN', new THREE.InterleavedBufferAttribute(buf, 4, 4));
    g.setAttribute('iE', new THREE.InterleavedBufferAttribute(buf, 4, 8));
    g.instanceCount = capacity;
    const U = fx.U;
    const make = (film, timeKey) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: VS, fragmentShader: FS,
        uniforms: { uT: U[timeKey], uScorch: { value: fx.tex.scorch }, uSlime: { value: fx.tex.slime }, uAmb: U.uAmb, uLightCol: U.uSmokeLight, uFilm: { value: film } },
        transparent: true, depthWrite: false, toneMapped: false, fog: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      });
      m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
      m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
      return m;
    };
    this.mats = { modern: make(0, 'uTime'), film: make(1, 'uTime') };
    this.mesh = new THREE.Mesh(g, this.mats.modern);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'fx-decals';
    fx.root.add(this.mesh);
  }

  add(p, n, size, type, life, seed) {
    const o = this.head * 12, d = this.data;
    const nx = n ? n.x : 0, ny = n ? n.y : 1, nz = n ? n.z : 0;
    d[o] = p.x + nx * 0.004; d[o + 1] = p.y + ny * 0.004; d[o + 2] = p.z + nz * 0.004; d[o + 3] = this.fx.time;
    d[o + 4] = nx; d[o + 5] = ny; d[o + 6] = nz; d[o + 7] = size;
    d[o + 8] = type; d[o + 9] = seed * 6.2831; d[o + 10] = seed; d[o + 11] = life;
    this.head = (this.head + 1) % this.cap;
    this.dirty = true;
  }

  clear() { for (let i = 0; i < this.cap; i++) this.data[i * 12 + 11] = 0; this.dirty = true; }
  setStyle(style) { this.mesh.material = this.mats[style] || this.mats.modern; }
  flush() { if (this.dirty) { this.buf.needsUpdate = true; this.dirty = false; } }
}
