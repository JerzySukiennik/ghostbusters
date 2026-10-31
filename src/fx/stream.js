// Proton stream: rope-simulated path with capture coil, layered ribbons per style, muzzle and impact sprites, peel-off arcs, lights.
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { clamp, lerp, smooth } from './util.js';

const NP = 24;
const NT = 15;

const RIBBON_VS = /* glsl */`
${NOISE}
uniform vec3 uPath[24];
uniform float uArc[24];
uniform float uLen;
uniform float uHead;
uniform float uTail;
uniform float uTime;
uniform float uBoil;
uniform float uPx;
uniform float uIntensity;
uniform float uHeat;
uniform float uTension;
uniform float uCapture;
uniform float uSeed;
uniform float uFilSeed;
uniform float uEndKind;
uniform float uWidth;
uniform float uMinPx;
uniform float uRadius;
uniform float uTwist;
uniform float uSpin;
uniform float uStrands;
uniform float uLayerSeed;
uniform float uJag;
uniform float uJagFreq;
uniform float uCrawl;
uniform float uWob;
uniform float uSeg;
varying vec2 vUv;
varying float vA;
varying float vK;
varying float vT;
varying float vFront;
varying float vEnd;

vec3 beamAt(float t, out float s) {
  float f = clamp(t, 0.0, 1.0) * 23.0;
  float fi = min(floor(f), 22.0);
  int i = int(fi);
  float u = f - fi;
  vec3 p0 = uPath[max(i - 1, 0)];
  vec3 p1 = uPath[i];
  vec3 p2 = uPath[i + 1];
  vec3 p3 = uPath[min(i + 2, 23)];
  vec3 c1 = 0.5 * (p2 - p0);
  vec3 c2 = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
  vec3 c3 = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  s = mix(uArc[i], uArc[i + 1], u);
  return p1 + (c1 + (c2 + c3 * u) * u) * u;
}

float gAA = 1.0;
vec2 offsetAt(float s, float k, out float r) {
  float env = smoothstep(0.0, 0.3, s);
  float endFlare = uEndKind > 0.5 && uEndKind < 1.5 ? smoothstep(uLen - 0.5, uLen, s) : 0.0;
  float ph = k * 6.2831853 / max(uStrands, 1.0) + uLayerSeed;
  float th = uTwist * s - uSpin * uTime + ph + sn1(s * 0.9 + k * 3.7 + uBoil * 0.61) * 1.3;
  r = uRadius * env * gAA * (0.7 + 0.6 * (0.5 + 0.5 * sn1(s * 1.7 + k * 5.0 + uBoil * 0.37))) * (1.0 + uHeat * 0.7) * (1.0 + endFlare * 3.0);
  vec2 o = vec2(cos(th), sin(th)) * r;
  o += vec2(sn1(s * 3.1 + uBoil * 1.7 + k), sn1(s * 2.7 + uBoil * 1.3 + k + 9.0)) * uWob * env * (1.0 + uHeat * 1.5);
#ifdef FIL
  float x = s * uJagFreq - uTime * uCrawl;
  float sd = k * 7.31 + uFilSeed;
  o += vec2(jag(x, sd), jag(x + 23.1, sd + 3.7)) * uJag * env * (1.0 + endFlare * 2.0) * (1.0 + uTension * 0.6);
#endif
  return o;
}

void main() {
  float t = mix(uTail, uHead, position.x);
  float side = position.y;
  float k = position.z;
  float dsamp = uLen * max(uHead - uTail, 0.0) * 1.25 * pow(max(position.x, 1e-4), 0.2) / uSeg;
  gAA = smoothstep(1.15, 0.55, dsamp * max(uTwist, 1e-3));
  float s, sa, sb;
  vec3 C = beamAt(t, s);
  float dt = clamp(0.012 / uLen, 0.0004, 0.02);
  vec3 Ca = beamAt(t - dt, sa);
  vec3 Cb = beamAt(t + dt, sb);
  vec3 T = Cb - Ca;
  float tl = length(T);
  T = tl > 1e-6 ? T / tl : vec3(0.0, 0.0, 1.0);
  vec3 R = abs(T.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 N = normalize(cross(R, T));
  vec3 B = cross(T, N);
  float r, ra, rb;
  vec2 o = offsetAt(s, k, r);
  vec2 oa = offsetAt(sa, k, ra);
  vec2 ob = offsetAt(sb, k, rb);
  vec3 P = C + N * o.x + B * o.y;
  vec3 Pa = Ca + N * oa.x + B * oa.y;
  vec3 Pb = Cb + N * ob.x + B * ob.y;
  vec3 Ts = Pb - Pa;
  float tsl = length(Ts);
  Ts = tsl > 1e-6 ? Ts / tsl : T;
#ifdef GLOW
  Ts = T;
#endif
  vec3 V = cameraPosition - P;
  float dist = max(length(V), 1e-3);
  V /= dist;
  vec3 sd = cross(Ts, V);
  float sl = length(sd);
  sd = sl > 1e-5 ? sd / sl : N;
  float muzzle = 0.35 + 0.65 * smoothstep(0.0, 0.25, s);
  float endK = uEndKind < 0.5 ? smoothstep(uLen, uLen * 0.82, s) : 1.0;
  float headFade = uHead < 0.999 ? smoothstep(1.0, 0.9, position.x) : 1.0;
  float tailFade = uTail > 0.001 ? smoothstep(0.0, 0.25, position.x) : 1.0;
  float w = uWidth * muzzle * mix(1.0, endK, 0.7) * (1.0 + uHeat * 0.25);
  float minW = uMinPx * uPx * dist;
  float we = max(w, minW);
  vA = (w / we) * uIntensity * headFade * tailFade * endK;
  vFront = r > 1e-5 ? dot(N * o.x + B * o.y, V) / r : 0.0;
  vUv = vec2(s, side);
  vK = k;
  vT = t;
  vEnd = smoothstep(uLen - 0.6, uLen, s);
  P += sd * side * we;
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}
`;

const RIBBON_FS = /* glsl */`
${NOISE}
uniform sampler2D uNoiseTex;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform float uGain;
uniform float uTime;
uniform float uBoil;
uniform float uFlow;
uniform float uHeat;
uniform float uCapture;
uniform float uTension;
uniform float uFilSeed;
uniform float uLen;
varying vec2 vUv;
varying float vA;
varying float vK;
varying float vT;
varying float vFront;
varying float vEnd;
void main() {
  float s = vUv.x;
  float y = abs(vUv.y);
  vec3 col;
#if defined(GLOW)
  float prof = exp(-y * y * 3.2);
  float n = texture2D(uNoiseTex, vec2(s * 0.22 - uTime * uFlow * 0.04, vUv.y * 0.07 + vK * 0.31)).r;
  float n2 = texture2D(uNoiseTex, vec2(s * 0.6 - uTime * uFlow * 0.11, 0.5 + vUv.y * 0.11)).g;
  col = mix(uColA, uColB, smoothstep(0.25, 0.85, n)) * (0.7 + 0.6 * n2);
  col = mix(col, uColC, smoothstep(1.2, 0.0, s) * 0.7);
  col *= prof;
#elif defined(STRAND)
#ifdef FILM
  float prof = smoothstep(1.0, 0.45, y);
  float spot = step(0.55, h11(floor(s * 2.3 + vK * 13.0) + uBoil * 7.13));
  col = mix(uColB, uColA, smoothstep(0.9, 0.0, y)) * prof * (0.65 + 0.55 * spot);
  col *= 0.75 + 0.25 * step(0.0, vFront);
#else
  float prof = exp(-y * y * 3.0);
  float n1 = texture2D(uNoiseTex, vec2(s * 0.55 - uTime * uFlow, vK * 0.29 + vUv.y * 0.09)).r;
  float n2 = texture2D(uNoiseTex, vec2(s * 1.9 - uTime * uFlow * 1.7, vK * 0.53 + vUv.y * 0.21 + 0.5)).b;
  float T = prof * (0.25 + 1.25 * n1 * (0.55 + 0.9 * n2));
  T *= 0.8 + 0.35 * clamp(vFront, -1.0, 1.0);
  col = mix(uColB * 0.6, uColB, smoothstep(0.1, 0.45, T));
  col = mix(col, uColA, smoothstep(0.45, 0.85, T));
  col = mix(col, vec3(1.0, 0.97, 0.92), smoothstep(0.85, 1.25, T));
  col *= T * T * 1.6;
#endif
#elif defined(CORE)
#ifdef FILM
  float prof = smoothstep(1.0, 0.0, y);
  float hot = smoothstep(0.5, 0.0, y);
  col = mix(uColB, uColA, hot) * pow(prof, 1.1) * (0.55 + 0.45 * hot);
  float spot = smoothstep(0.82, 0.97, h11(floor(s * 1.1 + 3.0) + uBoil * 5.31)) * smoothstep(0.3, 1.0, s);
  col = mix(col, uColC * 1.4, spot * hot);
  col = mix(col, vec3(0.92, 0.82, 1.0) * prof, smoothstep(1.4, 0.2, s) * 0.8);
  col *= 0.85 + 0.3 * h11(floor(s * 4.0) + uBoil * 3.7);
#else
  float prof = exp(-y * y * 4.0);
  float n = texture2D(uNoiseTex, vec2(s * 1.3 - uTime * uFlow * 1.3, 0.25 + vUv.y * 0.05)).a;
  col = mix(uColB, uColA, smoothstep(0.35, 0.0, y)) * prof * (0.75 + 0.5 * n);
#endif
#elif defined(FIL)
  float on = step(0.0, sn1(s * 0.55 + vK * 5.3 + uFilSeed * 0.73) + 0.15 + uTension * 0.3);
  float core = smoothstep(1.0, 0.15, y);
  float glow = exp(-y * y * 2.0) * 0.3;
  vec3 c = mix(uColA, uColB, step(0.5, fract(vK * 0.5 + uFilSeed * 0.13)));
  col = mix(c, vec3(1.0), core * 0.45) * (core + glow) * on;
  col *= 0.6 + 0.4 * h11(floor(s * 3.0) + uFilSeed);
#endif
  col = mix(col, col * vec3(1.25, 0.72, 1.15), uHeat * 0.45);
  float I = uGain * vA * (1.0 + vEnd * 0.6);
  gl_FragColor = vec4(col * I, 1.0);
}
`;

function ribbonGeometry(seg, strands) {
  const verts = (seg + 1) * 2 * strands;
  const pos = new Float32Array(verts * 3);
  const idx = new Uint32Array(seg * 6 * strands);
  let v = 0, q = 0;
  for (let k = 0; k < strands; k++) {
    const base = v;
    for (let i = 0; i <= seg; i++) {
      const t = Math.pow(i / seg, 1.25);
      pos[v * 3] = t; pos[v * 3 + 1] = -1; pos[v * 3 + 2] = k; v++;
      pos[v * 3] = t; pos[v * 3 + 1] = 1; pos[v * 3 + 2] = k; v++;
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2;
      idx[q++] = a; idx[q++] = a + 1; idx[q++] = a + 2; idx[q++] = a + 1; idx[q++] = a + 3; idx[q++] = a + 2;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return g;
}

const C3 = (r, g, b) => new THREE.Color(r, g, b);

export const STREAM_LOOKS = {
  modern: {
    meander: 0.11, meanderK: 0.55, meanderSpeed: 1.6, boilRate: 0,
    flicker: 0.12, light: [1.0, 0.5, 0.28], lightEnd: [1.0, 0.55, 0.3], muzzleLight: 7, endLight: 34,
    sparkRate: 340, emberRate: 12, smokeRate: 7, arcColor: [0.62, 0.74, 1.0], arcRate: 22, filRate: 24,
    layers: [
      { def: 'GLOW', strands: 1, width: 0.15, minPx: 3.0, radius: 0, twist: 0, spin: 0, wob: 0.012, gain: 0.36, flow: 9, colA: C3(1.0, 0.07, 0.2), colB: C3(1.0, 0.26, 0.07), colC: C3(1.0, 0.7, 0.55), ro: 41 },
      { def: 'STRAND', strands: 3, width: 0.024, minPx: 1.5, radius: 0.034, twist: 9.5, spin: 14, wob: 0.006, gain: 1.5, flow: 3.2, colA: C3(1.0, 0.46, 0.2), colB: C3(1.0, 0.09, 0.1), colC: C3(1, 1, 1), ro: 50 },
      { def: 'CORE', strands: 1, width: 0.0095, minPx: 1.1, radius: 0.004, twist: 20, spin: 30, wob: 0.003, gain: 4.2, flow: 4, colA: C3(1.0, 0.95, 0.88), colB: C3(1.0, 0.5, 0.3), colC: C3(1, 1, 1), ro: 52 },
      { def: 'FIL', strands: 2, width: 0.0032, minPx: 1.0, radius: 0.05, twist: 3.5, spin: 6, wob: 0.0, gain: 1.7, flow: 0, jag: 0.07, jagFreq: 5.5, crawl: 9, colA: C3(0.62, 0.7, 1.0), colB: C3(0.85, 0.55, 1.0), colC: C3(1, 1, 1), ro: 53 },
    ],
  },
  film: {
    meander: 0.2, meanderK: 0.42, meanderSpeed: 0.9, boilRate: 12,
    flicker: 0.18, light: [1.0, 0.42, 0.3], lightEnd: [1.0, 0.6, 0.45], muzzleLight: 8, endLight: 30,
    sparkRate: 230, emberRate: 6, smokeRate: 4, arcColor: [0.42, 0.34, 1.0], arcRate: 12, filRate: 12,
    layers: [
      { def: 'GLOW FILM', strands: 1, width: 0.14, minPx: 4.0, radius: 0.0, twist: 0, spin: 0, wob: 0.012, gain: 0.6, flow: 2, colA: C3(1.0, 0.03, 0.1), colB: C3(1.0, 0.15, 0.02), colC: C3(0.75, 0.35, 1.0), ro: 41 },
      { def: 'STRAND FILM', strands: 1, width: 0.014, minPx: 1.3, radius: 0.022, twist: 15, spin: 0, wob: 0.01, gain: 1.6, flow: 0, colA: C3(1.0, 0.42, 0.05), colB: C3(0.95, 0.07, 0.03), colC: C3(1, 1, 1), ro: 50 },
      { def: 'CORE FILM', strands: 1, width: 0.03, minPx: 2.0, radius: 0.009, twist: 13, spin: 0, wob: 0.008, gain: 2.9, flow: 0, colA: C3(1.0, 0.88, 0.5), colB: C3(1.0, 0.26, 0.03), colC: C3(0.8, 0.5, 1.0), ro: 52 },
      { def: 'FIL FILM', strands: 2, width: 0.005, minPx: 1.25, radius: 0.075, twist: 1.6, spin: 0, wob: 0.03, gain: 2.0, flow: 0, jag: 0.085, jagFreq: 2.6, crawl: 0, colA: C3(0.28, 0.24, 1.0), colB: C3(0.55, 0.22, 1.0), colC: C3(1, 1, 1), ro: 53 },
    ],
  },
};

function h(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function sn(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (h(i) * (1 - u) + h(i + 1) * u) * 2 - 1; }

export class Stream {
  constructor(fx, index) {
    this.fx = fx;
    this.index = index;
    this.seed = 1 + index * 7.31;
    const Q = fx.quality;
    this.pos = new Float32Array(NP * 3);
    this.vel = new Float32Array(NP * 3);
    this.tgt = new Float32Array(NP * 3);
    this.out = new Float32Array(NP * 3);
    this.arc = new Float32Array(NP);
    this.inited = false;
    this.U = {
      uPath: { value: this.out }, uArc: { value: this.arc }, uLen: { value: 1 }, uHead: { value: 0 }, uTail: { value: 0 },
      uBoil: { value: 0 }, uIntensity: { value: 0 }, uHeat: { value: 0 }, uTension: { value: 0 }, uCapture: { value: 0 },
      uSeed: { value: this.seed }, uFilSeed: { value: 0 }, uEndKind: { value: 1 },
    };
    this.Uf = { uBoil: { value: 0 }, uFilSeed: { value: 0 } };
    this.groups = { modern: new THREE.Group(), film: new THREE.Group() };
    this.mats = [];
    for (const style of ['modern', 'film']) {
      const look = STREAM_LOOKS[style];
      const g = this.groups[style];
      g.name = `fx-stream${index}-${style}`;
      for (const L of look.layers) {
        const defines = {};
        for (const d of L.def.split(' ')) defines[d] = '';
        const film = style === 'film';
        const u = {
          ...this.U,
          uBoil: film ? this.Uf.uBoil : this.U.uBoil,
          uFilSeed: film ? this.Uf.uFilSeed : this.U.uFilSeed,
          uTime: film ? fx.U.uTimeQ : fx.U.uTime,
          uPx: fx.U.uPx,
          uNoiseTex: { value: fx.tex.noise },
          uWidth: { value: L.width }, uMinPx: { value: L.minPx }, uRadius: { value: L.radius }, uTwist: { value: L.twist },
          uSpin: { value: L.spin }, uStrands: { value: L.strands }, uLayerSeed: { value: index * 1.7 + L.strands * 0.37 },
          uJag: { value: L.jag || 0 }, uJagFreq: { value: L.jagFreq || 1 }, uCrawl: { value: L.crawl || 0 }, uWob: { value: L.wob },
          uColA: { value: L.colA }, uColB: { value: L.colB }, uColC: { value: L.colC }, uGain: { value: L.gain }, uFlow: { value: L.flow },
          uSeg: { value: 1 },
        };
        const m = new THREE.ShaderMaterial({
          vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS, uniforms: u, defines,
          transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false,
        });
        const seg = L.def.startsWith('GLOW') ? Math.round(Q.seg * 0.4) : Q.seg;
        u.uSeg.value = seg;
        const mesh = new THREE.Mesh(ribbonGeometry(seg, L.strands), m);
        mesh.frustumCulled = false;
        mesh.renderOrder = L.ro;
        g.add(mesh);
        this.mats.push(m);
      }
      fx.root.add(g);
    }
    this.flare = fx.flares.alloc(6);
    this.bolt = fx.bolts.alloc(5);
    this.on = false;
    this.lit = 0;
    this.head = 0;
    this.tail = 0;
    this.offTime = 0;
    this.prevOn = false;
    this.acc = { spark: 0, ember: 0, smoke: 0, slime: 0, decal: 0, fil: 0, arc: 0 };
    this.arcs = new Float32Array(5 * 8);
    this.lastDecal = new THREE.Vector3(1e9, 0, 0);
    this.decalAge = 0;
    this.end = new THREE.Vector3();
    this.endN = new THREE.Vector3(0, 1, 0);
    this.origin = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, 1);
    this.ghost = new THREE.Vector3();
    this.kind = 1;
    this.mode = 0;
    this.heat = 0;
    this.tension = 0;
    this.capture = 0;
    this.v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.style = fx.style;
    this.setStyle(fx.style);
  }

  setStyle(style) {
    this.style = style;
    this.look = STREAM_LOOKS[style];
    this.groups.modern.visible = style === 'modern';
    this.groups.film.visible = style === 'film';
  }

  reset() {
    this.inited = false; this.on = false; this.prevOn = false; this.head = 0; this.tail = 0; this.lit = 0;
    this.lastDecal.set(1e9, 0, 0);
    for (const k in this.acc) this.acc[k] = 0;
  }

  pathPoint(t, out) {
    const f = clamp(t, 0, 1) * (NP - 1);
    const i = Math.min(Math.floor(f), NP - 2), u = f - i;
    const P = this.out;
    const i0 = Math.max(i - 1, 0), i3 = Math.min(i + 2, NP - 1);
    for (let c = 0; c < 3; c++) {
      const p0 = P[i0 * 3 + c], p1 = P[i * 3 + c], p2 = P[(i + 1) * 3 + c], p3 = P[i3 * 3 + c];
      const c1 = 0.5 * (p2 - p0), c2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3, c3 = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
      out.setComponent(c, p1 + (c1 + (c2 + c3 * u) * u) * u);
    }
    return out;
  }

  targets(dt) {
    const [P1, P2, E, G, A, U1, U2, tmp] = this.v;
    const o = this.origin, d = this.dir, T = this.tgt;
    const cap = this.capture;
    const L = Math.max(0.3, o.distanceTo(this.end));
    E.copy(this.end);
    let nT = NP;
    if (cap > 0.001) {
      nT = NT;
      const R = this.fx._ghostRadius * (1.08 - 0.22 * this.tension);
      G.copy(this.ghost);
      tmp.copy(o).sub(G).normalize();
      E.copy(G).addScaledVector(tmp, R * 0.75);
      const Lg = Math.max(0.3, o.distanceTo(E));
      P1.copy(o).addScaledVector(d, Lg * (0.42 + 0.12 * this.tension));
      P2.copy(P1).lerp(E, 0.55);
      A.set(0, 1, 0).addScaledVector(tmp, 0.35);
      const tt = this.fx.time;
      A.x += sn(tt * 1.3 + this.seed) * 0.35; A.z += sn(tt * 1.1 + this.seed + 5) * 0.35;
      A.normalize();
      U1.copy(E).sub(G); U1.addScaledVector(A, -U1.dot(A));
      if (U1.lengthSq() < 1e-6) U1.set(1, 0, 0);
      U1.normalize();
      U2.crossVectors(A, U1);
      const turns = 1.55 + 0.35 * this.tension;
      for (let j = 0; j < NP - NT; j++) {
        const f = (j + 1) / (NP - NT);
        const th = f * turns * Math.PI * 2;
        const rr = R * (1 + 0.1 * sn(tt * 3.1 + j * 1.7 + this.seed)) * (0.92 + 0.08 * Math.cos(th * 2.0));
        const hh = (f - 0.45) * R * 1.1;
        const i = NT + j;
        T[i * 3] = lerp(E.x, G.x + (U1.x * Math.cos(th) + U2.x * Math.sin(th)) * rr + A.x * hh, Math.min(1, cap * 1.2));
        T[i * 3 + 1] = lerp(E.y, G.y + (U1.y * Math.cos(th) + U2.y * Math.sin(th)) * rr + A.y * hh, Math.min(1, cap * 1.2));
        T[i * 3 + 2] = lerp(E.z, G.z + (U1.z * Math.cos(th) + U2.z * Math.sin(th)) * rr + A.z * hh, Math.min(1, cap * 1.2));
      }
    } else {
      P1.copy(o).addScaledVector(d, L * 0.36);
      P2.copy(P1).lerp(E, 0.55);
    }
    for (let i = 0; i < nT; i++) {
      const u = i / (nT - 1), a = 1 - u;
      const b0 = a * a * a, b1 = 3 * a * a * u, b2 = 3 * a * u * u, b3 = u * u * u;
      T[i * 3] = o.x * b0 + P1.x * b1 + P2.x * b2 + E.x * b3;
      T[i * 3 + 1] = o.y * b0 + P1.y * b1 + P2.y * b2 + E.y * b3;
      T[i * 3 + 2] = o.z * b0 + P1.z * b1 + P2.z * b2 + E.z * b3;
    }
    return nT;
  }

  simulate(dt, nT) {
    const P = this.pos, V = this.vel, T = this.tgt;
    if (!this.inited) { P.set(T); V.fill(0); this.inited = true; }
    const cap = this.capture, ten = this.tension;
    const steps = Math.max(1, Math.min(8, Math.ceil(dt / (1 / 240))));
    const h = dt / steps;
    const struggle = this.fx._struggle;
    const tt = this.fx.time;
    for (let st = 0; st < steps; st++) {
      for (let i = 2; i < NP; i++) {
        if (cap < 0.001 && i === NP - 1) continue;
        const u = i / (NP - 1);
        const kaB = lerp(1400, 260, Math.pow(u, 0.8));
        const kaC = (40 + 260 * ten) * (i >= nT ? 3.5 : 1);
        const ka = lerp(kaB, kaC, cap);
        const c = 2 * Math.sqrt(ka) * lerp(0.9, 0.32, cap);
        const ks = cap * 650;
        for (let k = 0; k < 3; k++) {
          const j = i * 3 + k;
          let f = ka * (T[j] - P[j]) - c * V[j];
          if (ks > 0 && i < NP - 1) f += ks * (P[j - 3] + P[j + 3] - 2 * P[j]);
          if (cap > 0.001 && i > 2 && i < nT) {
            const env = Math.sin(Math.PI * i / nT);
            f += sn(tt * (4.5 + k) + i * 0.45 + k * 11 + this.seed) * (25 + 120 * struggle) * env * (1 - 0.55 * ten);
          }
          V[j] += f * h;
        }
      }
      for (let i = 2; i < NP; i++) {
        if (cap < 0.001 && i === NP - 1) continue;
        for (let k = 0; k < 3; k++) P[i * 3 + k] += V[i * 3 + k] * h;
      }
    }
    for (let k = 0; k < 3; k++) {
      P[k] = T[k]; P[3 + k] = T[3 + k]; V[k] = 0; V[3 + k] = 0;
      if (cap < 0.001) { P[(NP - 1) * 3 + k] = T[(NP - 1) * 3 + k]; V[(NP - 1) * 3 + k] = 0; }
    }
  }

  meander(nT) {
    const P = this.pos, O = this.out, look = this.look;
    O.set(P);
    const [Tg, N, B] = this.v;
    const tq = this.style === 'film' ? Math.floor(this.fx.time * 12) / 12 : this.fx.time;
    let L = 0;
    for (let i = 1; i < nT; i++) L += Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2], P[i * 3 + 2] - P[i * 3 - 1]);
    const amp = look.meander * clamp(L / 5, 0.25, 1) * (1 + this.heat * 0.5) * (1 - 0.5 * this.tension * this.capture) * (1 + this.capture * 0.6);
    let s = 0;
    for (let i = 1; i < nT - 1; i++) {
      const a = Math.max(0, i - 1), b = Math.min(NP - 1, i + 1);
      Tg.set(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]).normalize();
      if (Math.abs(Tg.y) < 0.92) N.set(0, 1, 0); else N.set(1, 0, 0);
      N.cross(Tg).normalize();
      B.crossVectors(Tg, N);
      s += Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2], P[i * 3 + 2] - P[i * 3 - 1]);
      const u = i / (nT - 1);
      const env = Math.pow(Math.sin(Math.PI * u), 0.75) * smooth(0, 0.8, s);
      const x = s * look.meanderK - tq * look.meanderSpeed + this.seed * 3.1;
      const m1 = sn(x) * amp * env, m2 = sn(x * 0.83 + 17.3 - tq * 0.3) * amp * env;
      O[i * 3] += N.x * m1 + B.x * m2;
      O[i * 3 + 1] += N.y * m1 + B.y * m2;
      O[i * 3 + 2] += N.z * m1 + B.z * m2;
    }
    let acc = 0;
    this.arc[0] = 0;
    for (let i = 1; i < NP; i++) {
      acc += Math.hypot(O[i * 3] - O[i * 3 - 3], O[i * 3 + 1] - O[i * 3 - 2], O[i * 3 + 2] - O[i * 3 - 1]);
      this.arc[i] = acc;
    }
    this.U.uLen.value = Math.max(acc, 0.05);
  }

  update(dt, p) {
    const fx = this.fx;
    const look = this.look;
    const film = this.style === 'film';
    const on = !!(p && p.on);
    dt = Math.min(Math.max(dt, 0), 0.1);
    if (p && p.origin) this.origin.copy(p.origin);
    if (p && p.dir) this.dir.copy(p.dir).normalize();
    if (p && p.end) this.end.copy(p.end);
    else this.end.copy(this.origin).addScaledVector(this.dir, 25);
    if (p && p.endNormal) this.endN.copy(p.endNormal).normalize(); else this.endN.copy(this.dir).negate();
    const kindStr = p && p.endKind;
    this.kind = kindStr === 'surface' ? 1 : kindStr === 'ghost' ? 2 : 0;
    const capMode = !!(p && p.mode === 'capture');
    if (p && p.ghostPos) this.ghost.copy(p.ghostPos); else this.ghost.copy(this.end);
    this.heat = clamp((p && p.heat) || 0, 0, 1);
    this.tension = clamp((p && p.tension) || 0, 0, 1);
    this.capture = capMode ? Math.min(1, this.capture + dt * 6) : Math.max(0, this.capture - dt * 8);
    if (capMode) this.kind = 2;

    if (on && !this.prevOn) { this.head = 0; this.tail = 0; this.fireBurst(); }
    if (!on && this.prevOn) { this.offTime = 0; this.releasePuff(); }
    this.prevOn = on;
    if (on) { this.head = Math.min(1, this.head + dt / 0.075); this.tail = 0; this.lit = Math.min(1, this.lit + dt * 30); }
    else { this.offTime += dt; this.tail = Math.min(1, this.tail + dt / 0.11); this.lit = Math.max(0, 1 - this.offTime / 0.14); }
    const visible = this.lit > 0.001 && this.head > 0;
    const g = this.groups[this.style];
    g.visible = visible;
    this.groups[film ? 'modern' : 'film'].visible = false;
    if (!visible) { this.sprites(false); this.arcsOff(); this.inited = false; return; }

    const nT = this.targets(dt);
    this.simulate(dt, nT);
    this.meander(nT);

    const tq = fx.time;
    const boil = film ? Math.floor(tq * look.boilRate) : tq * 1.3;
    this.Uf.uBoil.value = boil;
    this.U.uBoil.value = boil;
    this.acc.fil += dt * look.filRate;
    if (this.acc.fil >= 1) {
      this.acc.fil %= 1;
      const ns = fx.rng.next() * 97;
      if (film) this.Uf.uFilSeed.value = ns; else this.U.uFilSeed.value = ns;
    }
    let flick = 1 + (film ? (sn(Math.floor(tq * 12) * 3.7 + this.seed) * look.flicker) : (sn(tq * 31 + this.seed) * 0.6 + sn(tq * 73) * 0.4) * look.flicker);
    let sputter = 1;
    if (this.heat > 0.7) {
      const sp = sn(tq * 9 + this.seed * 3);
      if (sp > 0.55 - (this.heat - 0.7) * 1.2) sputter = 0.35 + 0.3 * h(Math.floor(tq * 30));
    }
    const intensity = this.lit * flick * sputter * (1 + this.capture * 0.15 + this.tension * 0.25 * this.capture);
    this.U.uIntensity.value = intensity;
    this.U.uHead.value = this.head;
    this.U.uTail.value = this.tail;
    this.U.uHeat.value = this.heat;
    this.U.uTension.value = this.tension;
    this.U.uCapture.value = this.capture;
    this.U.uEndKind.value = this.head < 1 ? 0 : this.kind;

    this.sprites(true, intensity, dt);
    if (on && this.head >= 1) this.impactFx(dt, intensity);
    this.updateArcs(dt, on && this.head >= 1, intensity);
    this.lights(intensity);
  }

  fireBurst() {
    const fx = this.fx, r = fx.rng, o = this.origin, d = this.dir;
    const film = this.style === 'film';
    for (let i = 0; i < 26; i++) {
      const sp = r.range(2, 7);
      fx.pools.sparks.emit(o.x + d.x * 0.05, o.y + d.y * 0.05, o.z + d.z * 0.05,
        (d.x * 0.6 + r.signed() * 0.7) * sp, (d.y * 0.6 + r.signed() * 0.7 + 0.25) * sp, (d.z * 0.6 + r.signed() * 0.7) * sp,
        r.range(0.15, 0.45), r.range(0.004, 0.009), r.next(), 2.5, 0.6, fx.groundY, 0, film ? 0.3 : 1, 0);
    }
  }

  releasePuff() {
    const fx = this.fx, r = fx.rng, o = this.origin, d = this.dir;
    for (let i = 0; i < 3; i++) {
      fx.pools.smoke.emit(o.x + d.x * 0.08, o.y + d.y * 0.08, o.z + d.z * 0.08, d.x * 0.3 + r.signed() * 0.1, 0.35 + r.next() * 0.2, d.z * 0.3 + r.signed() * 0.1,
        r.range(1.0, 1.8), r.range(0.05, 0.09), r.next(), 1.6, -0.06, -1e3, 2, 1, r.signed() * 0.6);
    }
    for (let i = 0; i < 6; i++) {
      fx.pools.embers.emit(o.x, o.y, o.z, d.x * 0.6 + r.signed() * 0.4, r.range(0.1, 0.6), d.z * 0.6 + r.signed() * 0.4,
        r.range(0.4, 0.9), r.range(0.006, 0.01), r.next(), 2.0, 0.1, fx.groundY, 2, 0, 1);
    }
  }

  sprites(show, I = 0, dt = 0) {
    const F = this.fx.flares, s = this.flare;
    if (!show) { for (let i = 0; i < 6; i++) F.off(s + i); return; }
    const film = this.style === 'film';
    const o = this.origin, d = this.dir, tq = this.fx.time;
    const mx = o.x + d.x * 0.03, my = o.y + d.y * 0.03, mz = o.z + d.z * 0.03;
    const fk = film ? Math.floor(tq * 12) : tq * 24;
    const jit = 0.85 + 0.3 * h(Math.floor(fk) + this.seed);
    if (film) {
      F.set(s, mx, my, mz, 0.22 * jit, 1.0, 0.92, 1.0, 0.9 * I, 1, 0, h(Math.floor(fk)), 0.05, 1);
      F.set(s + 1, mx, my, mz, 0.08, 0.45, 0.55, 1.0, 0.5 * I, 2, 0, 0, 0.05, 5);
    } else {
      F.set(s, mx, my, mz, 0.18 * jit, 1.0, 0.9, 0.82, 1.1 * I, 1, tq * 0.7, h(Math.floor(tq * 20)), 0.05, 1);
      F.set(s + 1, mx, my, mz, 0.045, 0.5, 0.62, 1.0, 0.25 * I, 2, 0, 0, 0.05, 6);
    }
    const P = this.v[7];
    if (this.head < 1) {
      this.pathPoint(this.head, P);
      F.set(s + 2, P.x, P.y, P.z, 0.18, 1.0, 0.8, 0.6, 1.5 * I, 0, 0, 0, 0.1, 1);
    } else F.off(s + 2);
    const e = this.end;
    if (this.head >= 1 && this.capture < 0.5) {
      const ex = e.x + this.endN.x * 0.02, ey = e.y + this.endN.y * 0.02, ez = e.z + this.endN.z * 0.02;
      if (this.kind === 1) {
        if (film) {
          F.set(s + 3, ex, ey, ez, 0.6 * jit, 0.85, 0.95, 1.0, 0.9 * I, 3, h(fk * 1.3) * 6.28, h(fk * 0.7 + 3), 0.6, 1);
          F.set(s + 4, ex, ey, ez, 0.25, 1.0, 0.75, 0.5, 0.8 * I, 0, 0, 0, 0.5, 1);
        } else {
          F.set(s + 3, ex, ey, ez, 0.45 * jit, 1.0, 0.62, 0.32, 0.7 * I, 5, tq * 2.0, h(Math.floor(tq * 15)), 0.6, 1);
          F.set(s + 4, ex, ey, ez, 0.16, 1.0, 0.92, 0.85, 1.6 * I, 0, 0, 0, 0.5, 1);
        }
      } else if (this.kind === 2) {
        F.set(s + 3, ex, ey, ez, (film ? 0.6 : 0.5) * jit, 0.6, 1.0, 0.45, 1.6 * I, 6, tq * 1.5, h(Math.floor(fk)), 0.7, 1);
        F.set(s + 4, ex, ey, ez, 0.2, 0.9, 1.0, 0.85, 2.5 * I, 0, 0, 0, 0.6, 1);
      } else {
        F.set(s + 3, ex, ey, ez, 0.22, 1.0, 0.6, 0.35, 0.8 * I, 0, 0, 0, 0.1, 1);
        F.off(s + 4);
      }
    } else { F.off(s + 3); F.off(s + 4); }
    if (this.capture > 0.3) {
      const G = this.ghost;
      F.set(s + 5, G.x, G.y, G.z, (film ? 1.3 : 1.1) * (0.9 + 0.2 * h(Math.floor(fk))), film ? 1.0 : 1.0, film ? 0.45 : 0.6, film ? 0.55 : 0.35, 0.55 * I * this.capture, 0, 0, 0, 0.9, 1);
    } else F.off(s + 5);
  }

  impactFx(dt, I) {
    const fx = this.fx, r = fx.rng, look = this.look, film = this.style === 'film';
    const e = this.end, n = this.endN, d = this.dir;
    const P = fx.pools;
    if (this.kind === 1 && this.capture < 0.5) {
      const dn = d.dot(n);
      const rx = d.x - 2 * dn * n.x, ry = d.y - 2 * dn * n.y, rz = d.z - 2 * dn * n.z;
      this.acc.spark += dt * look.sparkRate * (0.7 + 0.6 * I);
      while (this.acc.spark >= 1) {
        this.acc.spark -= 1;
        const sp = r.chance(0.25) ? r.range(6, 13) : r.range(2, 7);
        let vx = n.x * r.range(0.3, 1.1) + rx * 0.55 + r.signed() * 0.75;
        let vy = n.y * r.range(0.3, 1.1) + ry * 0.55 + r.signed() * 0.75 + 0.35;
        let vz = n.z * r.range(0.3, 1.1) + rz * 0.55 + r.signed() * 0.75;
        const l = Math.hypot(vx, vy, vz) || 1;
        vx = vx / l * sp; vy = vy / l * sp; vz = vz / l * sp;
        const big = r.chance(0.12);
        P.sparks.emit(e.x + n.x * 0.02, e.y + n.y * 0.02, e.z + n.z * 0.02, vx, vy, vz,
          r.range(0.3, big ? 1.4 : 0.9), big ? r.range(0.01, 0.016) : r.range(0.0035, 0.008), r.next(), r.range(0.4, 1.6), 1, fx.groundY, 0, r.next(), 0);
      }
      this.acc.ember += dt * look.emberRate;
      while (this.acc.ember >= 1) {
        this.acc.ember -= 1;
        P.embers.emit(e.x + n.x * 0.05, e.y + n.y * 0.05, e.z + n.z * 0.05, n.x * r.range(0.6, 2.0) + r.signed() * 0.9, r.range(0.2, 1.6), n.z * r.range(0.6, 2.0) + r.signed() * 0.9,
          r.range(0.7, 1.8), r.range(0.006, 0.012), r.next(), 1.6, 0.35, fx.groundY, 2, 0, 0.4);
      }
      this.acc.smoke += dt * look.smokeRate;
      while (this.acc.smoke >= 1) {
        this.acc.smoke -= 1;
        P.smoke.emit(e.x + n.x * 0.12, e.y + n.y * 0.12, e.z + n.z * 0.12, n.x * 0.5 + r.signed() * 0.15, 0.45 + r.next() * 0.4, n.z * 0.5 + r.signed() * 0.15,
          r.range(2.2, 4.0), r.range(0.18, 0.3), r.next(), 0.9, -0.1, -1e3, 2, 0, r.signed() * 0.5);
      }
      this.decalAge += dt;
      const moved = this.lastDecal.distanceToSquared(e);
      if ((moved > 0.03 && this.decalAge > 0.12) || this.decalAge > 1.4) {
        this.decalAge = 0;
        this.lastDecal.copy(e);
        fx.decals.add(e, n, r.range(0.28, 0.46), 0, 50, r.next());
      }
    } else if (this.kind === 2 && this.capture < 0.5) {
      this.acc.slime += dt * 38;
      const G = this.ghost;
      while (this.acc.slime >= 1) {
        this.acc.slime -= 1;
        let ox = e.x - G.x, oy = e.y - G.y, oz = e.z - G.z;
        const l = Math.hypot(ox, oy, oz) || 1; ox /= l; oy /= l; oz /= l;
        const sp = r.range(1.0, 4.0);
        P.slime.emit(e.x, e.y, e.z, (ox + r.signed() * 0.6 - d.x * 0.3) * sp, (oy + r.signed() * 0.6 + 0.3) * sp, (oz + r.signed() * 0.6 - d.z * 0.3) * sp,
          r.range(0.5, 1.1), r.range(0.012, 0.03), r.next(), 0.6, 1, fx.groundY, 0, 0, 0);
      }
      this.acc.spark += dt * look.sparkRate * 0.45;
      while (this.acc.spark >= 1) {
        this.acc.spark -= 1;
        const sp = r.range(2, 8);
        P.sparks.emit(e.x, e.y, e.z, (-d.x + r.signed() * 0.9) * sp, (-d.y + r.signed() * 0.9 + 0.3) * sp, (-d.z + r.signed() * 0.9) * sp,
          r.range(0.2, 0.6), r.range(0.003, 0.007), r.next(), 1.5, 0.7, fx.groundY, 0, 2, 0);
      }
    } else if (this.kind === 0) {
      this.acc.spark += dt * 30;
      while (this.acc.spark >= 1) {
        this.acc.spark -= 1;
        const sp = r.range(1, 4);
        P.sparks.emit(e.x, e.y, e.z, (d.x + r.signed()) * sp, (d.y + r.signed()) * sp, (d.z + r.signed()) * sp,
          r.range(0.1, 0.35), r.range(0.003, 0.006), r.next(), 2, 0.3, fx.groundY, 0, r.next(), 0);
      }
    }
    if (this.capture > 0.5) {
      this.acc.ember += dt * 26;
      const G = this.ghost;
      while (this.acc.ember >= 1) {
        this.acc.ember -= 1;
        const a = r.next() * 6.283, b = r.signed();
        const R = fx._ghostRadius * 1.05;
        const cx = Math.cos(a) * Math.sqrt(1 - b * b), cz = Math.sin(a) * Math.sqrt(1 - b * b);
        P.embers.emit(G.x + cx * R, G.y + b * R, G.z + cz * R, cx * 0.8, b * 0.8 + 0.2, cz * 0.8,
          r.range(0.3, 0.8), r.range(0.006, 0.012), r.next(), 2, 0, fx.groundY, 0, film ? 0 : 1, 0);
      }
    }
  }

  updateArcs(dt, active, I) {
    const fx = this.fx, B = fx.bolts, r = fx.rng, A = this.arcs, film = this.style === 'film';
    const look = this.look;
    const P = this.v[6], Q = this.v[5];
    const e = this.end, n = this.endN, G = this.ghost, R = fx._ghostRadius;
    for (let i = 0; i < 5; i++) {
      const o = i * 8;
      A[o + 7] -= dt;
      const want = active && (i < 3 || (i === 3 && (this.kind === 1 || this.capture > 0.5)) || (i === 4 && this.heat > 0.4));
      if (!want) { B.off(this.bolt + i); A[o + 6] = 0; continue; }
      if (A[o + 7] <= 0) {
        A[o + 7] = r.range(0.05, 0.16) * (film ? 1.4 : 1);
        A[o + 6] = r.chance(i === 4 ? 0.5 * this.heat : 0.68) ? 1 : 0;
        A[o + 4] = r.next() * 50;
        A[o + 5] = r.range(0.7, 1.2);
        if (i === 4) {
          A[o] = 0;
          A[o + 1] = r.signed() * 0.3; A[o + 2] = r.signed() * 0.3; A[o + 3] = r.signed() * 0.3;
        } else if (i === 3) {
          A[o] = r.range(0.4, 0.85);
          A[o + 1] = r.signed() * 0.5; A[o + 2] = 0; A[o + 3] = r.signed() * 0.5;
        } else if (this.capture > 0.5 || this.kind === 2) {
          A[o] = this.capture > 0.5 ? r.range(0.62, 0.99) : r.range(0.75, 0.98);
          const a = r.next() * 6.283, b = r.signed(), c = Math.sqrt(1 - b * b);
          A[o + 1] = G.x + Math.cos(a) * c * R * 1.02; A[o + 2] = G.y + b * R; A[o + 3] = G.z + Math.sin(a) * c * R * 1.02;
        } else if (this.kind === 1) {
          A[o] = r.range(0.6, 0.97);
          const ux = Math.abs(n.y) < 0.9 ? 0 : 1, uy = Math.abs(n.y) < 0.9 ? 1 : 0;
          let tx = uy * n.z, ty = -ux * n.z, tz = ux * n.y - uy * n.x;
          const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
          const bx = n.y * tz - n.z * ty, by = n.z * tx - n.x * tz, bz = n.x * ty - n.y * tx;
          const a = r.next() * 6.283, rad = r.range(0.25, 1.1);
          A[o + 1] = e.x + (tx * Math.cos(a) + bx * Math.sin(a)) * rad + n.x * 0.01;
          A[o + 2] = e.y + (ty * Math.cos(a) + by * Math.sin(a)) * rad + n.y * 0.01;
          A[o + 3] = e.z + (tz * Math.cos(a) + bz * Math.sin(a)) * rad + n.z * 0.01;
        } else {
          A[o] = r.range(0.4, 0.95);
          A[o + 1] = r.signed() * 0.6; A[o + 2] = r.signed() * 0.6; A[o + 3] = r.signed() * 0.6;
        }
      }
      if (A[o + 6] < 0.5) { B.off(this.bolt + i); continue; }
      let bx, by, bz;
      if (i === 4) {
        P.copy(this.origin).addScaledVector(this.dir, 0.04);
        bx = P.x + A[o + 1]; by = P.y + A[o + 2]; bz = P.z + A[o + 3];
      } else if (i === 3) {
        this.pathPoint(A[o], P);
        if (P.y - fx.groundY > 2.8 || P.y - fx.groundY < 0.15) { B.off(this.bolt + i); continue; }
        bx = P.x + A[o + 1]; by = fx.groundY + 0.01; bz = P.z + A[o + 3];
      } else if (this.capture > 0.5 || this.kind === 2 || this.kind === 1) {
        this.pathPoint(A[o], P);
        bx = A[o + 1]; by = A[o + 2]; bz = A[o + 3];
      } else {
        this.pathPoint(A[o], P);
        bx = P.x + A[o + 1]; by = P.y + A[o + 2]; bz = P.z + A[o + 3];
      }
      const c = look.arcColor;
      const len = Math.hypot(bx - P.x, by - P.y, bz - P.z);
      B.set(this.bolt + i, P.x, P.y, P.z, bx, by, bz, film ? 0.0045 : 0.0035, (film ? 2.2 : 3.0) * I * A[o + 5],
        A[o + 4], film ? 0.12 : 0.1, 6 + len * 14, c[0], c[1], c[2]);
    }
  }

  arcsOff() { for (let i = 0; i < 5; i++) this.fx.bolts.off(this.bolt + i); }

  lights(I) {
    const fx = this.fx, look = this.look, L = fx.lightPool;
    const o = this.origin, d = this.dir, V = this.v[4];
    const lc = look.light, le = look.lightEnd;
    V.copy(o).addScaledVector(d, 0.2);
    L.request(V, lc[0], lc[1], lc[2], look.muzzleLight * I, 3, 10);
    if (this.head >= 1) {
      if (this.capture > 0.5) {
        V.copy(this.ghost);
        L.request(V, 1.0, 0.62, 0.35, look.endLight * 0.8 * I, 4, 14);
      } else if (this.kind === 1) {
        V.copy(this.end).addScaledVector(this.endN, 0.35);
        L.request(V, le[0], le[1], le[2], look.endLight * I, 4, 14);
      } else if (this.kind === 2) {
        V.copy(this.end).addScaledVector(this.dir, -0.4);
        L.request(V, 0.75, 1.0, 0.55, look.endLight * 0.7 * I, 4, 12);
      } else {
        this.pathPoint(0.85, V);
        L.request(V, le[0], le[1], le[2], look.endLight * 0.25 * I, 2, 10);
      }
      this.pathPoint(0.5, V);
      L.request(V, lc[0], lc[1], lc[2], look.muzzleLight * 0.8 * I, 1, 10);
    }
  }
}
