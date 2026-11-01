// Trap FX: wedge light cone with god rays, suction vortex, sparkles, open and close flashes, electric crawl, smoke.
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { clamp } from './util.js';

const CONE_VS = /* glsl */`
uniform vec2 uBase;
uniform vec2 uTop;
uniform float uH;
varying float vH;
varying float vA;
varying vec3 vW;
varying vec3 vN;
void main() {
  float a = position.x;
  float h = position.y;
  float hh = pow(h, 0.85);
  vec2 rr = mix(uBase, uTop, hh);
  vec3 p = vec3(cos(a) * rr.x, h * uH, sin(a) * rr.y);
  vec2 slope = (uTop - uBase) / uH;
  vec3 n = normalize(vec3(cos(a) / max(rr.x, 1e-3), -length(slope) * 0.6, sin(a) / max(rr.y, 1e-3)));
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vH = h;
  vA = a;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const CONE_FS = /* glsl */`
${NOISE}
uniform sampler2D uNoise;
uniform float uTime;
uniform float uBeam;
uniform float uSuck;
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uEdge;
uniform float uRayK;
varying float vH;
varying float vA;
varying vec3 vW;
varying vec3 vN;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float f = abs(dot(normalize(vN), V));
  float edge = pow(1.0 - f, 3.0);
  float u = vA / 6.2831853;
  float rays = texture2D(uNoise, vec2(u * 3.0 + uTime * 0.03, 0.15)).r;
  rays = mix(1.0, smoothstep(0.35, 0.8, rays) * 1.7, uRayK);
  float rays2 = texture2D(uNoise, vec2(u * 7.0 - uTime * 0.05, 0.6)).b;
  float flow = texture2D(uNoise, vec2(u * 2.0 + vH * 0.3, vH * 1.2 + uTime * (0.5 + uSuck * 2.0))).g;
  float vfade = pow(1.0 - vH, 1.6) * smoothstep(0.0, 0.04, vH);
  float I = uBeam * vfade * (0.18 + 0.55 * f * f + uEdge * edge) * rays * (0.65 + 0.7 * rays2) * (0.6 + 0.8 * flow);
  vec3 col = mix(uColB, uColA, pow(1.0 - vH, 2.0));
  gl_FragColor = vec4(col * I, 1.0);
}
`;

const VORTEX_VS = /* glsl */`
${NOISE}
uniform vec2 uBase;
uniform vec2 uTop;
uniform float uH;
uniform float uTime;
uniform float uSpin;
uniform float uPx;
uniform float uWidth;
varying float vSide;
varying float vH;
varying float vK;
vec3 at(float h, float k) {
  float hh = pow(h, 0.85);
  vec2 rr = mix(uBase, uTop, hh) * (0.75 + 0.15 * sn1(h * 6.0 + k * 3.0 + uTime));
  float a = h * 9.0 + k * 2.0944 - uTime * uSpin;
  return vec3(cos(a) * rr.x, h * uH * 0.92, sin(a) * rr.y);
}
void main() {
  float h = position.x;
  float k = position.z;
  vec3 p = at(h, k);
  vec3 pa = at(h - 0.01, k), pb = at(h + 0.01, k);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vec3 T = normalize(mat3(modelMatrix) * (pb - pa));
  vec3 V = cameraPosition - w.xyz;
  float d = length(V);
  vec3 sd = normalize(cross(T, V / d) + 1e-6);
  float wd = max(uWidth * (0.4 + 0.6 * (1.0 - h)), 1.2 * uPx * d);
  w.xyz += sd * position.y * wd;
  vSide = position.y;
  vH = h;
  vK = k;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const VORTEX_FS = /* glsl */`
uniform float uI;
uniform vec3 uCol;
varying float vSide;
varying float vH;
varying float vK;
void main() {
  float y = abs(vSide);
  float c = exp(-y * y * 4.0);
  float fade = smoothstep(0.0, 0.08, vH) * pow(1.0 - vH, 1.3);
  gl_FragColor = vec4(uCol * c * fade * uI, 1.0);
}
`;

function coneGeometry(radial = 56, rows = 20) {
  const pos = [], idx = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= radial; i++) pos.push((i / radial) * Math.PI * 2, j / rows, 0);
  for (let j = 0; j < rows; j++) for (let i = 0; i < radial; i++) {
    const a = j * (radial + 1) + i, b = a + radial + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), 3);
  return g;
}

function vortexGeometry(seg = 120, strands = 3) {
  const pos = [], idx = [];
  for (let k = 0; k < strands; k++) {
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) { const h = i / seg; pos.push(h, -1, k, h, 1, k); }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), 3);
  return g;
}

const LOOK = {
  modern: { base: [0.2, 0.06], top: [1.25, 0.95], H: 2.7, colA: [1.0, 0.9, 0.72], colB: [0.7, 0.62, 0.9], gain: 0.42, edge: 0.45, rayK: 0.7, vortex: [1.0, 0.35, 0.7], vI: 1.4, arc: [0.7, 0.8, 1.0], light: [1.0, 0.88, 0.7] },
  film: { base: [0.22, 0.05], top: [1.6, 0.5], H: 2.9, colA: [1.0, 0.9, 1.0], colB: [0.7, 0.42, 1.0], gain: 0.6, edge: 0.9, rayK: 0.9, vortex: [1.0, 0.45, 0.85], vI: 1.3, arc: [0.25, 0.35, 1.0], light: [0.95, 0.8, 1.0] },
};

export class TrapFX {
  constructor(fx) {
    this.fx = fx;
    this.holder = new THREE.Group();
    this.holder.name = 'fx-trap';
    fx.root.add(this.holder);
    this.trap = null;
    this.U = { uBase: { value: new THREE.Vector2(0.2, 0.06) }, uTop: { value: new THREE.Vector2(1.2, 0.9) }, uH: { value: 2.7 } };
    this.cones = {}; this.vortex = {}; this.cu = {}; this.vu = {};
    const cg = coneGeometry(), vg = vortexGeometry();
    for (const style of ['modern', 'film']) {
      const L = LOOK[style];
      const cu = {
        ...this.U, uNoise: { value: fx.tex.noise }, uTime: style === 'film' ? fx.U.uTimeQ : fx.U.uTime, uBeam: { value: 0 }, uSuck: { value: 0 },
        uColA: { value: new THREE.Color(...L.colA) }, uColB: { value: new THREE.Color(...L.colB) }, uEdge: { value: L.edge }, uRayK: { value: L.rayK },
      };
      this.cu[style] = cu;
      const cm = new THREE.ShaderMaterial({ vertexShader: CONE_VS, fragmentShader: CONE_FS, uniforms: cu, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
      const cone = new THREE.Mesh(cg, cm);
      cone.renderOrder = 45; cone.frustumCulled = false; cone.visible = false;
      this.cones[style] = cone;
      const vu = { ...this.U, uTime: style === 'film' ? fx.U.uTimeQ : fx.U.uTime, uSpin: { value: 9 }, uPx: fx.U.uPx, uWidth: { value: style === 'film' ? 0.035 : 0.025 }, uI: { value: 0 }, uCol: { value: new THREE.Color(...L.vortex) } };
      this.vu[style] = vu;
      const vm = new THREE.ShaderMaterial({ vertexShader: VORTEX_VS, fragmentShader: VORTEX_FS, uniforms: vu, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
      const vx = new THREE.Mesh(vg, vm);
      vx.renderOrder = 46; vx.frustumCulled = false; vx.visible = false;
      this.vortex[style] = vx;
      this.holder.add(cone, vx);
    }
    this.flare = fx.flares.alloc(4);
    this.bolt = fx.bolts.alloc(6);
    this.arcs = new Float32Array(6 * 8);
    this.box = new THREE.Box3(new THREE.Vector3(-0.22, 0, -0.14), new THREE.Vector3(0.22, 0.17, 0.14));
    this.smokePts = [];
    this.prevClosed = false;
    this.prevOpen = 0;
    this.flash = 0;
    this.acc = { mote: 0, smoke: 0, spark: 0 };
    this.v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.beam = 0;
    this.open = 0;
    this.suck = 0;
    this.closeTime = 99;
    this.setStyle(fx.style);
  }

  attach(trap) {
    this.trap = trap;
    if (this.holder.parent) this.holder.parent.remove(this.holder);
    this.measure(trap);
    const bo = trap.getObjectByName('BeamOrigin');
    if (bo) { bo.add(this.holder); this.holder.position.set(0, 0, 0); this.holder.quaternion.identity(); }
    else { trap.add(this.holder); this.holder.position.set(0, this.box.max.y + 0.005, 0); this.holder.quaternion.identity(); }
    this.holder.rotation.y = this.longZ ? Math.PI / 2 : 0;
    this.smokePts.length = 0;
    trap.traverse((o) => { if (/^Smoke_/i.test(o.name)) this.smokePts.push(o); });
  }

  measure(trap) {
    trap.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(trap.matrixWorld).invert();
    const box = new THREE.Box3();
    trap.traverse((o) => {
      if (!o.isMesh || !o.geometry || o.name.startsWith('fx-')) return;
      if (/pedal|cable/i.test(o.name) || (o.parent && /pedal/i.test(o.parent.name))) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      box.union(b);
    });
    if (!box.isEmpty() && box.getSize(new THREE.Vector3()).length() < 2) this.box.copy(box);
    const sz = this.box.getSize(new THREE.Vector3());
    this.longZ = sz.z > sz.x;
  }

  setStyle(style) {
    this.style = style;
    this.look = LOOK[style];
    const L = this.look;
    this.U.uBase.value.set(L.base[0], L.base[1]);
    this.U.uTop.value.set(L.top[0], L.top[1]);
    this.U.uH.value = L.H;
    this.cones.modern.visible = false; this.cones.film.visible = false;
    this.vortex.modern.visible = false; this.vortex.film.visible = false;
  }

  surfacePoint(out) {
    const r = this.fx.rng, b = this.box;
    const face = r.int(5);
    out.set(r.range(b.min.x, b.max.x), r.range(b.min.y, b.max.y), r.range(b.min.z, b.max.z));
    if (face === 0) out.x = b.min.x; else if (face === 1) out.x = b.max.x; else if (face === 2) out.z = b.min.z; else if (face === 3) out.z = b.max.z; else out.y = b.max.y;
    if (this.trap) this.trap.localToWorld(out);
    return out;
  }

  update(dt, p = {}) {
    const fx = this.fx, r = fx.rng, L = this.look, film = this.style === 'film';
    dt = Math.min(Math.max(dt, 0), 0.1);
    const open = clamp(+p.open || 0, 0, 1), beam = clamp(+p.beam || 0, 0, 1), suck = clamp(+p.suck || 0, 0, 1);
    const closed = !!p.closed, smoking = !!p.smoking;
    this.open = open; this.beam = beam; this.suck = suck;
    if (open > 0.2 && this.prevOpen <= 0.2) this.flash = Math.max(this.flash, 0.8);
    if (closed && !this.prevClosed) { this.flash = 1.4; this.closeTime = 0; this.closeBurst(); }
    this.prevClosed = closed; this.prevOpen = open;
    this.flash = Math.max(0, this.flash - dt * 3.2);
    this.closeTime += dt;
    const holder = this.holder;
    const O = this.v[0];
    holder.getWorldPosition(O);

    const nar = 1 - suck * 0.45;
    this.U.uBase.value.set(L.base[0] * (0.4 + 0.6 * open), L.base[1] * (0.4 + 0.6 * open));
    this.U.uTop.value.set(L.top[0] * nar * (0.5 + 0.5 * beam), L.top[1] * nar * (0.5 + 0.5 * beam));
    this.U.uH.value = L.H * (0.35 + 0.65 * Math.min(1, beam * 1.4));
    const cone = this.cones[this.style], vx = this.vortex[this.style];
    const tq = film ? Math.floor(fx.time * 12) / 12 : fx.time;
    const flick = film ? 0.85 + 0.3 * Math.abs(Math.sin(Math.floor(fx.time * 12) * 12.9898) % 1) : 0.92 + 0.08 * Math.sin(fx.time * 37);
    const cu = this.cu[this.style];
    cu.uBeam.value = beam * L.gain * flick * (1 + this.flash * 0.6);
    cu.uSuck.value = suck;
    cone.visible = beam > 0.002;
    const vu = this.vu[this.style];
    vu.uI.value = L.vI * Math.min(1, suck * 3 + beam * 0.25) * beam;
    vu.uSpin.value = 6 + suck * 14;
    vx.visible = beam > 0.002 && vu.uI.value > 0.01;
    this.cones[film ? 'modern' : 'film'].visible = false;
    this.vortex[film ? 'modern' : 'film'].visible = false;

    if (beam > 0.01) {
      fx.U.uVortex.value.copy(O);
      fx.U.uVortexK.value = 0.6 + suck * 1.8;
      this.acc.mote += dt * (film ? 70 : 110) * beam * (0.4 + suck);
      while (this.acc.mote >= 1) {
        this.acc.mote -= 1;
        const h = r.range(0.2, 2.2) * (0.4 + 0.6 * beam), a = r.next() * 6.283, rr = r.range(0.2, 1.0) * (0.3 + h * 0.4);
        fx.pools.motes.emit(O.x + Math.cos(a) * rr, O.y + h, O.z + Math.sin(a) * rr, 0, 0, 0, r.range(0.8, 1.8), r.range(0.012, 0.03), r.next(), 1, 0, -1e3, 1, film ? 2 : 0, 0);
      }
    }
    const F = fx.flares, s = this.flare;
    const lc = L.light;
    if (beam > 0.01 || this.flash > 0.01 || open > 0.05) {
      const I = beam * 0.55 + this.flash * 1.6 + open * 0.2;
      F.set(s, O.x, O.y + 0.03, O.z, film ? 0.55 : 0.45, lc[0], lc[1], lc[2], I, film ? 1 : 0, tq * 0.5, Math.floor(tq * 12) * 0.13, 0.25, 1);
      F.set(s + 1, O.x, O.y + 0.03, O.z, 0.22, 1, 1, 1, I * 1.4, 0, 0, 0, 0.25, 1);
      if (film) F.set(s + 2, O.x, O.y + 0.05, O.z, 0.2, 0.35, 0.5, 1.0, I * 1.2, 2, 0, 0, 0.3, 9); else F.off(s + 2);
      fx.lightPool.request(this.v[1].copy(O).setY(O.y + 0.35), lc[0], lc[1], lc[2], (film ? 12 : 10) * beam + 40 * this.flash + 3 * open, 5, 12);
    } else { F.off(s); F.off(s + 1); F.off(s + 2); }
    F.off(s + 3);

    this.updateArcs(dt, beam, open);
    if (smoking || this.closeTime < 3.5) {
      const rate = (smoking ? 5 : 0) + (this.closeTime < 3.5 ? 22 * (1 - this.closeTime / 3.5) : 0);
      this.acc.smoke += dt * rate;
      while (this.acc.smoke >= 1) {
        this.acc.smoke -= 1;
        const W = this.v[2];
        if (this.smokePts.length) this.smokePts[r.int(this.smokePts.length)].getWorldPosition(W);
        else W.copy(O).add(this.v[3].set(r.signed() * 0.15, 0.02, r.signed() * 0.08));
        fx.pools.smoke.emit(W.x, W.y, W.z, r.signed() * 0.08, r.range(0.25, 0.55), r.signed() * 0.08, r.range(1.8, 3.2), r.range(0.06, 0.12), r.next(), 1.2, -0.12, -1e3, 2, 1, r.signed() * 0.8);
      }
    }
  }

  closeBurst() {
    const fx = this.fx, r = fx.rng, O = this.v[0], film = this.style === 'film';
    this.holder.getWorldPosition(O);
    for (let i = 0; i < 70; i++) {
      const a = r.next() * 6.283, sp = r.range(0.6, 2.8);
      fx.pools.motes.emit(O.x, O.y + 0.05, O.z, Math.cos(a) * sp * 0.5, r.range(0.8, 3.0), Math.sin(a) * sp * 0.5, r.range(0.5, 1.4), r.range(0.012, 0.03), r.next(), 1.6, 0.25, fx.groundY, 0, film ? 2 : 0, 0);
    }
    for (let i = 0; i < 30; i++) {
      const sp = r.range(1.5, 5);
      fx.pools.sparks.emit(O.x, O.y + 0.04, O.z, r.signed() * sp * 0.6, r.range(0.5, 1) * sp, r.signed() * sp * 0.6, r.range(0.3, 0.8), r.range(0.004, 0.008), r.next(), 1.5, 0.8, fx.groundY, 0, film ? 0.2 : 1, 0);
    }
  }

  updateArcs(dt, beam, open) {
    const fx = this.fx, B = fx.bolts, r = fx.rng, A = this.arcs, film = this.style === 'film';
    const active = beam > 0.02 || this.closeTime < 0.9;
    const c = this.look.arc;
    for (let i = 0; i < 6; i++) {
      const o = i * 8;
      A[o + 7] -= dt;
      if (!active || (!film && i > 2)) { B.off(this.bolt + i); continue; }
      if (A[o + 7] <= 0) {
        A[o + 7] = r.range(0.06, 0.18);
        A[o + 6] = r.chance(0.7) ? 1 : 0;
        const P = this.v[2], Q = this.v[3];
        this.surfacePoint(P);
        if (i === 5 && film) { Q.copy(P).add(this.v[1].set(r.signed() * 0.6, -P.y + fx.groundY + 0.01, r.signed() * 0.6)); }
        else { this.surfacePoint(Q); }
        A[o] = P.x; A[o + 1] = P.y; A[o + 2] = P.z; A[o + 3] = Q.x; A[o + 4] = Q.y; A[o + 5] = Q.z;
        A[o + 6] *= 1 + r.next() * 50;
      }
      if (A[o + 6] < 0.5) { B.off(this.bolt + i); continue; }
      const I = (film ? 6 : 4) * Math.max(beam, this.closeTime < 0.9 ? 1 - this.closeTime / 0.9 : 0);
      B.set(this.bolt + i, A[o], A[o + 1], A[o + 2], A[o + 3], A[o + 4], A[o + 5], film ? 0.0035 : 0.0028, I * 0.6, A[o + 6], film ? 0.16 : 0.12, 14, c[0], c[1], c[2]);
    }
  }
}
