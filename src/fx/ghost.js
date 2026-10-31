// Onionhead: SDF-sculpted glutton ghost (surface nets mesh), shader-driven moods, squash and stretch, struggle, trap suck; modern and film looks.
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { clamp, lerp } from './util.js';

const EYE_L = [0.135, 0.19, 0.305], EYE_R = [-0.125, 0.185, 0.31];
const EYE_RL = 0.088, EYE_RR = 0.08;

function sdEll(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x2 = x / rx, y2 = y / ry, z2 = z / rz;
  const k1 = Math.sqrt(x2 * x2 + y2 * y2 + z2 * z2);
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}

function sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

function sdRBox(px, py, pz, cx, cy, cz, hx, hy, hz, r, tilt) {
  let x = px - cx, y = py - cy; const z = pz - cz;
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const xr = c * x - s * y, yr = s * x + c * y; x = xr; y = yr;
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r;
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
}

function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function smax(a, b, k) { return -smin(-a, -b, k); }

const TAIL = [[0, -0.3, -0.02, 0.24], [0.02, -0.46, -0.11, 0.17], [0.06, -0.58, -0.22, 0.115], [0.12, -0.65, -0.34, 0.075], [0.2, -0.66, -0.45, 0.046], [0.27, -0.62, -0.52, 0.026], [0.31, -0.55, -0.55, 0.013]];
const TEETH_U = [[-0.135, 0.0, 0.305, 0.034, 0.036, 0.02, 0.08], [-0.05, -0.004, 0.33, 0.04, 0.042, 0.02, -0.04], [0.045, 0.0, 0.33, 0.036, 0.038, 0.02, 0.06], [0.14, 0.004, 0.3, 0.03, 0.03, 0.02, -0.1]];
const TEETH_L = [[-0.1, -0.088, 0.3, 0.03, 0.03, 0.02, -0.12], [0.005, -0.093, 0.315, 0.026, 0.028, 0.018, 0.05], [0.105, -0.088, 0.3, 0.032, 0.03, 0.02, 0.14]];
const TONGUE = [[0, -0.075, 0.17, 0.065], [0.0, -0.095, 0.31, 0.06], [0.025, -0.17, 0.38, 0.05], [0.045, -0.27, 0.385, 0.042], [0.055, -0.34, 0.36, 0.03]];

function bodySdf(x, y, z) {
  let d = sdEll(x, y, z, 0, 0.02, 0, 0.4, 0.4, 0.36);
  d = smin(d, sdEll(x, y, z, 0, 0.3, -0.03, 0.3, 0.25, 0.27), 0.14);
  d = smin(d, sdRoundCone(x, y, z, 0, 0.47, -0.05, 0.02, 0.63, -0.1, 0.07, 0.022), 0.09);
  d = smin(d, sdRoundCone(x, y, z, 0.02, 0.63, -0.1, 0.075, 0.685, -0.07, 0.022, 0.01), 0.03);
  d = smin(d, sdEll(x, y, z, 0.27, -0.02, 0.14, 0.2, 0.19, 0.19), 0.1);
  d = smin(d, sdEll(x, y, z, -0.27, -0.02, 0.14, 0.2, 0.19, 0.19), 0.1);
  d = smin(d, sdEll(x, y, z, 0, -0.2, 0.06, 0.36, 0.28, 0.33), 0.12);
  d = smin(d, sdEll(x, y, z, 0, -0.135, 0.245, 0.3, 0.115, 0.135), 0.08);
  d = smin(d, sdEll(x, y, z, 0, 0.055, 0.285, 0.31, 0.07, 0.11), 0.06);
  for (let i = 0; i < TAIL.length - 1; i++) {
    const a = TAIL[i], b = TAIL[i + 1];
    d = smin(d, sdRoundCone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], a[3], b[3]), i === 0 ? 0.12 : 0.05);
  }
  for (const s of [1, -1]) {
    d = smin(d, sdRoundCone(x, y, z, 0.33 * s, -0.05, 0.07, 0.46 * s, -0.15, 0.17, 0.085, 0.066), 0.07);
    d = smin(d, sdRoundCone(x, y, z, 0.46 * s, -0.15, 0.17, 0.5 * s, -0.12, 0.27, 0.066, 0.058), 0.03);
    d = smin(d, sdEll(x, y, z, 0.51 * s, -0.105, 0.305, 0.07, 0.058, 0.064), 0.04);
    d = smin(d, sdRoundCone(x, y, z, 0.49 * s, -0.08, 0.34, 0.47 * s, -0.045, 0.405, 0.03, 0.024), 0.025);
    d = smin(d, sdRoundCone(x, y, z, 0.535 * s, -0.1, 0.345, 0.555 * s, -0.075, 0.41, 0.028, 0.022), 0.025);
    d = smin(d, sdRoundCone(x, y, z, 0.455 * s, -0.075, 0.31, 0.425 * s, -0.035, 0.345, 0.026, 0.02), 0.02);
    d = smin(d, sdRoundCone(x, y, z, 0.05 * s, 0.275, 0.31, 0.22 * s, 0.295, 0.27, 0.036, 0.03), 0.05);
  }
  return d;
}

function cavitySdf(x, y, z) { return sdEll(x, y, z, 0, -0.04, 0.3, 0.27, 0.07, 0.2); }

function partsSdf(x, y, z, out) {
  let best = 1e9, mat = 0;
  const el = Math.hypot(x - EYE_L[0], y - EYE_L[1], z - EYE_L[2]) - EYE_RL;
  const er = Math.hypot(x - EYE_R[0], y - EYE_R[1], z - EYE_R[2]) - EYE_RR;
  const e = Math.min(el, er);
  if (e < best) { best = e; mat = 4; }
  let t = 1e9;
  for (const q of TEETH_U) t = Math.min(t, sdRBox(x, y, z, q[0], q[1], q[2], q[3], q[4], q[5], 0.012, q[6]));
  for (const q of TEETH_L) t = Math.min(t, sdRBox(x, y, z, q[0], q[1], q[2], q[3], q[4], q[5], 0.012, q[6]));
  if (t < best) { best = t; mat = 3; }
  let g = 1e9;
  for (let i = 0; i < TONGUE.length - 1; i++) {
    const a = TONGUE[i], b = TONGUE[i + 1];
    g = smin(g, sdRoundCone(x, y * 1.0, z, a[0], a[1], a[2], b[0], b[1], b[2], a[3], b[3]), 0.03);
  }
  const tg = g;
  if (tg < best) { best = tg; mat = 2; }
  out[0] = mat;
  return best;
}

const _o = [0];
function sdf(x, y, z) {
  let d = bodySdf(x, y, z);
  d = smax(d, -cavitySdf(x, y, z), 0.035);
  const p = partsSdf(x, y, z, _o);
  return Math.min(d, p);
}

function classify(x, y, z) {
  let d = bodySdf(x, y, z);
  const cav = cavitySdf(x, y, z);
  d = smax(d, -cav, 0.035);
  const p = partsSdf(x, y, z, _o);
  if (p < d + 0.002) return _o[0];
  if (cav < 0.012) return 1;
  return 0;
}

export function buildOnionhead(res = 72) {
  const x0 = -0.66, x1 = 0.66, y0 = -0.8, y1 = 0.76, z0 = -0.66, z1 = 0.56;
  const h = (y1 - y0) / res;
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = res + 1, nz = Math.ceil((z1 - z0) / h) + 1;
  const F = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[id(i, j, k)] = sdf(x0 + i * h, y0 + j * h, z0 + k * h);
  const vIndex = new Int32Array(nx * ny * nz).fill(-1);
  const P = [];
  const cx = [0, 1, 0, 1, 0, 1, 0, 1], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const val = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { val[c] = F[id(i + cx[c], j + cy[c], k + cz[c])]; if (val[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((val[a] < 0) === (val[b] < 0)) continue;
      const t = val[a] / (val[a] - val[b]);
      sx += cx[a] + (cx[b] - cx[a]) * t; sy += cy[a] + (cy[b] - cy[a]) * t; sz += cz[a] + (cz[b] - cz[a]) * t; n++;
    }
    vIndex[id(i, j, k)] = P.length / 3;
    P.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = F[id(i, j, k)] < 0;
    if (v0 !== (F[id(i + 1, j, k)] < 0)) quad(vIndex[id(i, j - 1, k - 1)], vIndex[id(i, j, k - 1)], vIndex[id(i, j, k)], vIndex[id(i, j - 1, k)], v0);
    if (v0 !== (F[id(i, j + 1, k)] < 0)) quad(vIndex[id(i - 1, j, k - 1)], vIndex[id(i - 1, j, k)], vIndex[id(i, j, k)], vIndex[id(i, j, k - 1)], v0);
    if (v0 !== (F[id(i, j, k + 1)] < 0)) quad(vIndex[id(i - 1, j - 1, k)], vIndex[id(i, j - 1, k)], vIndex[id(i, j, k)], vIndex[id(i - 1, j, k)], v0);
  }
  const nv = P.length / 3;
  const pos = new Float32Array(P);
  const nor = new Float32Array(nv * 3);
  const w1 = new Float32Array(nv * 4), w2 = new Float32Array(nv * 4);
  const e = 0.0025;
  for (let v = 0; v < nv; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    for (let it = 0; it < 2; it++) {
      const d = sdf(x, y, z);
      let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
      x -= gx * d; y -= gy * d; z -= gz * d;
      if (it === 1) { nor[v * 3] = gx; nor[v * 3 + 1] = gy; nor[v * 3 + 2] = gz; }
    }
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    const mat = classify(x, y, z);
    const sdx = x >= 0 ? 1 : -1;
    const jawFront = clamp((z + 0.05) / 0.17, 0, 1);
    let jaw = clamp((-0.022 - y) / 0.06, 0, 1) * jawFront * clamp((0.36 - Math.abs(x)) / 0.12, 0, 1);
    if (y < -0.32) jaw *= clamp((y + 0.42) / 0.1, 0, 1);
    if (mat === 2) jaw = 1;
    const armD = Math.abs(x) - 0.31;
    let arm = clamp(armD / 0.08, 0, 1) * clamp((y + 0.3) / 0.12, 0, 1) * clamp((0.12 - y) / 0.1, 0, 1);
    if (mat === 4) arm = 0;
    let tail = 0;
    if (y < -0.3) tail = clamp((-0.3 - y) / 0.36, 0, 1) * clamp((0.12 - z) / 0.25, 0, 1);
    if (z < -0.3 && y < -0.45) tail = Math.max(tail, clamp((-0.25 - z) / 0.3, 0, 1));
    tail = clamp(tail, 0, 1);
    const browD = Math.min(
      sdRoundCone(x, y, z, 0.05, 0.275, 0.31, 0.22, 0.295, 0.27, 0.036, 0.03),
      sdRoundCone(x, y, z, -0.05, 0.275, 0.31, -0.22, 0.295, 0.27, 0.036, 0.03));
    let brow = clamp(1 - browD / 0.045, 0, 1) * (mat === 4 ? 0 : 1);
    brow *= sdx;
    let tongue = 0;
    if (mat === 2) tongue = clamp((z - 0.17) / 0.22 + (-0.1 - y) / 0.28, 0, 1);
    const crown = clamp((y - 0.47) / 0.2, 0, 1);
    const cheek = clamp(1 - Math.abs(sdEll(x, y, z, 0.27 * sdx, -0.02, 0.14, 0.2, 0.19, 0.19)) / 0.05, 0, 1) * clamp((z - 0.0) / 0.12, 0, 1) * (mat === 0 ? 1 : 0);
    w1[v * 4] = jaw; w1[v * 4 + 1] = arm * sdx; w1[v * 4 + 2] = tail; w1[v * 4 + 3] = brow;
    w2[v * 4] = tongue; w2[v * 4 + 1] = mat; w2[v * 4 + 2] = crown; w2[v * 4 + 3] = cheek;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aW1', new THREE.BufferAttribute(w1, 4));
  g.setAttribute('aW2', new THREE.BufferAttribute(w2, 4));
  g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.boundingSphere.radius += 0.6;
  return g;
}

const DEFORM = /* glsl */`
attribute vec4 aW1;
attribute vec4 aW2;
uniform float uTime;
uniform float uJaw;
uniform float uSmile;
uniform vec4 uBrow;
uniform vec4 uTongue;
uniform vec4 uArmL;
uniform vec4 uArmR;
uniform vec4 uTail;
uniform float uPuff;
uniform vec4 uStretch;
uniform vec3 uJiggle;
uniform float uWobble;
uniform float uStruggle;
uniform float uSuck;
uniform vec3 uTrap;
uniform float uSquash;
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
void deform(inout vec3 p, inout vec3 n) {
  float jaw = aW1.x, arm = aW1.y, tail = aW1.z, brow = aW1.w;
  float tongue = aW2.x, crown = aW2.z, cheek = aW2.w;
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
  if (tongue > 0.0 || aW2.y > 1.5 && aW2.y < 2.5) {
    float tw = tongue;
    p += vec3(0.0, 0.02 + tw * 0.12, -0.12 - tw * 0.08) * (1.0 - uTongue.x) * smoothstep(0.0, 0.25, tw + 0.05);
    p.x += sin(uTime * 13.0 - tw * 2.5) * uTongue.y * 0.07 * tw;
    p.y += sin(uTime * 8.0 - tw * 4.0) * uTongue.y * 0.035 * tw;
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
  vec3 q = p * 3.2 + uTime * vec3(0.45, 0.62, 0.53);
  p += n * (sn3(q) * 0.011 * uWobble + sin(uTime * 2.1) * 0.006);
  p += n * sn3(p * 7.5 + uTime * 11.0) * 0.022 * uStruggle;
  p.y *= 1.0 - uSquash * 0.16;
  p.xz *= 1.0 + uSquash * 0.09;
  vec3 ax = uStretch.xyz;
  float st = uStretch.w;
  float da = dot(p, ax);
  p = ax * da * st + (p - ax * da) / sqrt(st);
  float dn = dot(n, ax);
  n = normalize(ax * dn / st + (n - ax * dn) * sqrt(st));
  p += uJiggle * smoothstep(0.05, 0.6, length(p));
  if (uSuck > 0.0) {
    float D = max(length(uTrap), 0.01);
    vec3 axis = uTrap / D;
    float a = dot(p, axis);
    vec3 perp = p - axis * a;
    float near = clamp(a / 0.9 * 0.5 + 0.5, 0.0, 1.0);
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

const BODY_VS = /* glsl */`
${NOISE}
${DEFORM}
varying vec3 vRest;
varying vec3 vN;
varying vec3 vW;
varying float vMat;
varying float vTail;
varying float vJaw;
void main() {
  vec3 p = position;
  vec3 n = normal;
  deform(p, n);
  vRest = position;
  vMat = aW2.y;
  vTail = aW1.z;
  vJaw = aW1.x;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const BODY_FS = /* glsl */`
${NOISE}
uniform float uTime;
uniform float uTimeQ;
uniform float uGlow;
uniform float uHurt;
uniform vec4 uHit;
uniform vec4 uEyes;
uniform vec3 uGazeL;
uniform vec3 uGazeR;
uniform float uBrowSlant;
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uAmb;
uniform vec3 uLPos[4];
uniform vec3 uLCol[4];
uniform float uOpacity;
uniform float uSuck;
uniform vec3 uTint;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vW;
varying float vMat;
varying float vTail;
varying float vJaw;
vec3 lightAll(vec3 N, vec3 V, vec3 base, float rough, float wrap, out vec3 spec) {
  vec3 diff = uAmb;
  spec = vec3(0.0);
  float a = rough * rough;
  float kd = max((dot(N, uKeyDir) + wrap) / (1.0 + wrap), 0.0);
  diff += uKeyCol * kd;
  vec3 H = normalize(uKeyDir + V);
  float nh = max(dot(N, H), 0.0);
  float dd = nh * nh * (a * a - 1.0) + 1.0;
  spec += uKeyCol * (a * a / (3.1416 * dd * dd)) * max(dot(N, uKeyDir), 0.0) * 0.25;
  for (int i = 0; i < 4; i++) {
    vec3 L = uLPos[i] - vW;
    float d2 = dot(L, L);
    L *= inversesqrt(d2);
    float att = 1.0 / (d2 + 0.3);
    vec3 c = uLCol[i] * att;
    diff += c * max((dot(N, L) + wrap) / (1.0 + wrap), 0.0);
    vec3 Hl = normalize(L + V);
    float nhl = max(dot(N, Hl), 0.0);
    float dl = nhl * nhl * (a * a - 1.0) + 1.0;
    spec += c * (a * a / (3.1416 * dl * dl)) * max(dot(N, L), 0.0) * 0.25;
  }
  return base * diff;
}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (!gl_FrontFacing) N = -N;
  float NV = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - NV, 2.5);
  int mat = int(vMat + 0.5);
  vec3 col;
  float alpha = 1.0;
  vec3 spec;
  float tq = uTime;
#ifdef FILM
  tq = uTimeQ;
#endif
  if (mat == 4) {
    vec3 ec = vRest.x > 0.0 ? vec3(${EYE_L.join(', ')}) : vec3(${EYE_R.join(', ')});
    vec3 en = normalize(vRest - ec);
    vec3 gz = vRest.x > 0.0 ? uGazeL : uGazeR;
    float lid = vRest.x > 0.0 ? uEyes.x : uEyes.y;
    float inner = vRest.x > 0.0 ? -en.x : en.x;
    float lidLine = mix(-1.05, 0.95, lid) - uBrowSlant * 0.35 * (inner + 0.2);
    float lower = mix(-1.0, -0.55, uEyes.w);
    float pd = dot(en, gz);
    float pupilR = mix(0.1, 0.42, uEyes.z);
    float iris = smoothstep(cos(pupilR + 0.16), cos(pupilR + 0.12), pd);
    float pupil = smoothstep(cos(pupilR), cos(pupilR - 0.04), pd);
#ifdef FILM
    vec3 sclera = vec3(0.98, 0.96, 0.62);
    vec3 irisC = vec3(0.45, 0.3, 0.05);
#else
    vec3 sclera = vec3(0.93, 0.92, 0.66) * (0.85 + 0.15 * sn3(vRest * 60.0));
    vec3 irisC = vec3(0.55, 0.42, 0.06);
#endif
    vec3 eye = mix(sclera, irisC, iris);
    eye = mix(eye, vec3(0.01), pupil);
    vec3 b = lightAll(N, V, eye, 0.12, 0.3, spec);
    col = b + eye * 0.35 * uGlow + spec * 2.5;
    float lidMask = smoothstep(lidLine - 0.04, lidLine + 0.04, en.y) + smoothstep(lower + 0.04, lower - 0.04, en.y);
    vec3 lidC = vec3(0.2, 0.62, 0.08) * (0.7 + 0.6 * uGlow);
    col = mix(col, lidC * (0.6 + 0.4 * NV), clamp(lidMask, 0.0, 1.0));
    col *= 1.0 - 0.6 * smoothstep(0.08, 0.0, abs(en.y - lidLine)) * (1.0 - step(0.98, lid));
  } else if (mat == 3) {
    vec3 tooth = vec3(0.86, 0.84, 0.62) * (0.8 + 0.2 * sn3(vRest * 40.0));
    vec3 b = lightAll(N, V, tooth, 0.25, 0.4, spec);
    col = b + tooth * 0.18 * uGlow + spec * 1.2;
  } else if (mat == 2) {
#ifdef FILM
    vec3 tg = vec3(0.95, 0.38, 0.58);
#else
    vec3 tg = vec3(0.62, 0.18, 0.32) * (0.85 + 0.3 * sn3(vRest * 25.0));
#endif
    vec3 b = lightAll(N, V, tg, 0.18, 0.5, spec);
    col = b + tg * 0.25 * uGlow + spec * 2.0;
  } else if (mat == 1) {
    float depth = clamp((0.36 - vRest.z) / 0.2, 0.0, 1.0);
    vec3 m = mix(vec3(0.32, 0.05, 0.08), vec3(0.04, 0.0, 0.01), depth);
    col = m * (0.5 + 0.5 * uGlow) + lightAll(N, V, m, 0.3, 0.5, spec) * 0.4;
  } else {
#ifdef FILM
    float n1 = fbm3(vRest * 3.5);
    vec3 base = mix(vec3(0.28, 0.82, 0.14), vec3(0.62, 1.0, 0.3), smoothstep(-0.3, 0.5, n1 + N.y * 0.4));
    vec3 b = lightAll(N, V, base, 0.3, 0.6, spec);
    vec3 emis = mix(vec3(0.22, 0.85, 0.12), vec3(0.75, 1.0, 0.35), NV * NV) * (0.75 + 0.25 * sn3(vRest * 2.0 + tq * 0.6)) * uGlow * 1.1;
    vec3 rim = vec3(0.6, 1.0, 0.35) * fres * 1.6 * uGlow;
    col = b * 0.7 + emis + rim + spec * 1.6;
    alpha = mix(0.86, 0.45, fres) * mix(1.0, 0.0, smoothstep(0.55, 1.0, vTail));
#else
    float n1 = fbm3(vRest * 4.0 + vec3(0.0, uTime * 0.05, 0.0));
    float veins = smoothstep(0.03, 0.0, abs(fbm3(vRest * 9.0 + 3.1))) * 0.6;
    float blot = sn3(vRest * 14.0) * 0.5 + 0.5;
    vec3 base = mix(vec3(0.12, 0.42, 0.04), vec3(0.42, 0.78, 0.1), smoothstep(-0.4, 0.5, n1));
    base = mix(base, vec3(0.6, 0.85, 0.2), blot * 0.18);
    base *= 1.0 - veins * 0.45;
    vec3 Np = normalize(N + vec3(sn3(vRest * 30.0), sn3(vRest * 30.0 + 7.0), sn3(vRest * 30.0 + 13.0)) * 0.12);
    vec3 b = lightAll(Np, V, base, 0.22, 0.75, spec);
    float inner = sn3(vRest * 3.0 + vec3(uTime * 0.25, -uTime * 0.4, uTime * 0.2)) * 0.5 + 0.5;
    float thick = pow(NV, 1.5);
    vec3 sss = mix(vec3(0.15, 0.55, 0.05), vec3(0.55, 0.95, 0.2), inner) * (0.25 + 0.55 * thick) * uGlow;
    vec3 rim = vec3(0.45, 0.95, 0.3) * fres * 0.9 * uGlow;
    vec3 env = mix(vec3(0.02, 0.025, 0.05), vec3(0.18, 0.11, 0.06), smoothstep(-0.2, 0.3, -reflect(-V, Np).y)) * fres * 1.5;
    col = b + sss + rim + spec * 2.6 + env;
    alpha = mix(0.96, 0.62, fres) * mix(1.0, 0.0, smoothstep(0.55, 1.0, vTail));
#endif
    float hit = exp(-dot(vRest - uHit.xyz, vRest - uHit.xyz) * 30.0) * uHit.w;
    col += vec3(1.0, 0.75, 0.35) * hit * 3.0;
  }
  float fl = 0.6 + 0.4 * sin(tq * 55.0);
  col += vec3(1.0, 1.0, 0.8) * uHurt * fl * 1.8;
  col *= uTint;
  float sk = clamp(uSuck * 1.4, 0.0, 1.0);
  col = mix(col, col * 1.6 + vec3(0.6, 0.8, 1.0) * 0.8, sk * 0.6);
  gl_FragColor = vec4(col * alpha * uOpacity, alpha * uOpacity);
}
`;

const SHELL_VS = /* glsl */`
${NOISE}
${DEFORM}
uniform float uShell;
varying vec3 vN;
varying vec3 vW;
varying float vTail;
void main() {
  vec3 p = position;
  vec3 n = normal;
  deform(p, n);
  p += n * uShell * (1.0 + 0.25 * sn3(position * 4.0 + uTime * 0.7));
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vTail = aW1.z;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SHELL_FS = /* glsl */`
uniform vec3 uShellCol;
uniform float uGlow;
uniform float uHurt;
uniform float uOpacity;
uniform float uShellPow;
varying vec3 vN;
varying vec3 vW;
varying float vTail;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float d = clamp(-dot(N, V), 0.0, 1.0);
  float g = pow(smoothstep(0.0, 0.75, d), uShellPow) * (1.0 - smoothstep(0.6, 1.0, vTail) * 0.7);
  vec3 c = uShellCol * g * uGlow * uOpacity * (1.0 + uHurt * 1.5);
  gl_FragColor = vec4(c, 1.0);
}
`;

export const MOODS = {
  idle: { jaw: 0.22, smile: 0.35, browL: 0.1, browR: 0.0, slant: 0.0, lid: 0.82, pupil: 0.55, tongue: 0.2, wag: 0.1, armRaise: 0.15, armSwing: 0.2, flail: 0.15, puff: 0.0, glow: 1.0, wobble: 1.0, chomp: 0, tail: 0.06, tilt: 0.0, low: 0.0 },
  eat: { jaw: 0.55, smile: 0.5, browL: 0.35, browR: 0.3, slant: -0.1, lid: 0.55, pupil: 0.55, tongue: 0.55, wag: 0.35, armRaise: 0.45, armSwing: 0.9, flail: 0.25, puff: 0.7, glow: 1.1, wobble: 1.3, chomp: 1, tail: 0.08, tilt: 0.0, low: 0.3 },
  taunt: { jaw: 0.75, smile: 0.9, browL: 0.85, browR: -0.15, slant: 0.0, lid: 0.9, pupil: 0.5, tongue: 1.0, wag: 1.0, armRaise: 0.9, armSwing: 0.4, flail: 0.75, puff: 0.15, glow: 1.15, wobble: 1.2, chomp: 0, tail: 0.1, tilt: 0.22, low: 0.0 },
  angry: { jaw: 0.6, smile: -0.7, browL: -0.45, browR: -0.45, slant: 1.0, lid: 0.62, pupil: 0.32, tongue: 0.0, wag: 0.0, armRaise: 0.35, armSwing: 1.1, flail: 0.3, puff: 0.2, glow: 1.35, wobble: 1.8, chomp: 0, tail: 0.12, tilt: -0.08, low: 0.4 },
  flee: { jaw: 0.95, smile: -0.35, browL: 1.0, browR: 1.0, slant: -0.7, lid: 1.0, pupil: 0.18, tongue: 0.25, wag: 0.4, armRaise: 1.2, armSwing: -0.2, flail: 1.0, puff: 0.0, glow: 1.0, wobble: 1.5, chomp: 0, tail: 0.14, tilt: 0.0, low: 0.0 },
  hurt: { jaw: 0.8, smile: -0.85, browL: 0.4, browR: 0.4, slant: -0.4, lid: 0.12, pupil: 0.5, tongue: 0.75, wag: 0.6, armRaise: 0.9, armSwing: 0.5, flail: 0.9, puff: 0.0, glow: 1.6, wobble: 2.2, chomp: 0, tail: 0.16, tilt: 0.1, low: 0.0 },
  wrangled: { jaw: 0.65, smile: -0.55, browL: -0.1, browR: 0.2, slant: 0.65, lid: 0.32, pupil: 0.45, tongue: 0.35, wag: 0.8, armRaise: 1.0, armSwing: 0.6, flail: 1.0, puff: 0.0, glow: 1.35, wobble: 2.4, chomp: 0, tail: 0.2, tilt: 0.0, low: 0.0 },
  sucked: { jaw: 1.0, smile: -0.6, browL: 1.0, browR: 1.0, slant: -0.8, lid: 1.0, pupil: 0.16, tongue: 0.55, wag: 1.0, armRaise: 1.4, armSwing: -0.3, flail: 1.0, puff: 0.0, glow: 1.5, wobble: 2.0, chomp: 0, tail: 0.25, tilt: 0.0, low: 0.0 },
};
const KEYS = Object.keys(MOODS.idle);

function bodyUniforms(fx, shared) {
  return {
    ...shared,
    uTimeQ: fx.U.uTimeQ,
    uGlow: { value: 1 }, uHurt: { value: 0 }, uHit: { value: new THREE.Vector4(0, 0, 0, 0) },
    uEyes: { value: new THREE.Vector4(0.8, 0.8, 0.5, 0) }, uGazeL: { value: new THREE.Vector3(0, 0, 1) }, uGazeR: { value: new THREE.Vector3(0, 0, 1) },
    uBrowSlant: { value: 0 }, uKeyDir: fx.U.uKeyDir, uKeyCol: fx.U.uKeyCol, uAmb: fx.U.uAmb,
    uLPos: fx.U.uLPos, uLCol: fx.U.uLCol, uOpacity: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) },
  };
}

export class Ghost {
  constructor(fx, geometry) {
    this.fx = fx;
    this.object3D = new THREE.Group();
    this.object3D.name = 'Onionhead';
    this.radius = 0.58;
    this.S = {
      uTime: fx.U.uTime, uJaw: { value: 0.2 }, uSmile: { value: 0.3 }, uBrow: { value: new THREE.Vector4() }, uTongue: { value: new THREE.Vector4() },
      uArmL: { value: new THREE.Vector4() }, uArmR: { value: new THREE.Vector4() }, uTail: { value: new THREE.Vector4(0.05, 0.03, 0, 0) },
      uPuff: { value: 0 }, uStretch: { value: new THREE.Vector4(0, 1, 0, 1) }, uJiggle: { value: new THREE.Vector3() }, uWobble: { value: 1 },
      uStruggle: { value: 0 }, uSuck: { value: 0 }, uTrap: { value: new THREE.Vector3(0, -1, 0) }, uSquash: { value: 0 },
    };
    const bu = bodyUniforms(fx, this.S);
    this.BU = bu;
    const mk = (film) => new THREE.ShaderMaterial({
      vertexShader: BODY_VS, fragmentShader: BODY_FS, uniforms: bu, defines: film ? { FILM: '' } : {},
      transparent: true, depthWrite: true, depthTest: true, toneMapped: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mats = { modern: mk(false), film: mk(true) };
    const su = { ...this.S, uShell: { value: 0.05 }, uShellCol: { value: new THREE.Color(0.25, 0.9, 0.18) }, uShellPow: { value: 1.6 }, uGlow: bu.uGlow, uHurt: bu.uHurt, uOpacity: bu.uOpacity };
    this.SU = su;
    const sm = new THREE.ShaderMaterial({
      vertexShader: SHELL_VS, fragmentShader: SHELL_FS, uniforms: su,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    });
    this.shellMat = sm;
    this.body = new THREE.Mesh(geometry, this.mats.modern);
    this.body.renderOrder = 20;
    this.body.frustumCulled = false;
    this.shell = new THREE.Mesh(geometry, sm);
    this.shell.renderOrder = 21;
    this.shell.frustumCulled = false;
    this.object3D.add(this.body, this.shell);
    this.e = {};
    for (const k of KEYS) this.e[k] = MOODS.idle[k];
    this.mood = 'idle';
    this.t = 0;
    this.blink = 0;
    this.nextBlink = 2;
    this.gaze = new THREE.Vector3(0, 0, 1);
    this.gazeT = new THREE.Vector3(0, 0, 1);
    this.saccade = 0;
    this.vel = new THREE.Vector3();
    this.prevVel = new THREE.Vector3();
    this.jig = new THREE.Vector3();
    this.jigV = new THREE.Vector3();
    this.hitAmt = 0;
    this.flinch = 0;
    this.prevHurt = 0;
    this.drip = 0;
    this.wisp = 0;
    this.tmp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Quaternion(), new THREE.Matrix4()];
    this.setStyle(fx.style);
  }

  setStyle(style) {
    this.style = style;
    this.body.material = this.mats[style] || this.mats.modern;
    const film = style === 'film';
    this.SU.uShell.value = film ? 0.11 : 0.045;
    this.SU.uShellCol.value.setRGB(film ? 0.45 : 0.2, film ? 1.6 : 0.8, film ? 0.3 : 0.14);
    this.SU.uShellPow.value = film ? 1.1 : 1.8;
  }

  hit(localPoint, amount = 1) {
    this.BU.uHit.value.set(localPoint.x, localPoint.y, localPoint.z, Math.min(1.5, this.BU.uHit.value.w + amount));
  }

  update(dt, p = {}) {
    const fx = this.fx, e = this.e, S = this.S, BU = this.BU;
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.t += dt;
    const t = this.t;
    const moodName = p.mood && MOODS[p.mood] ? p.mood : 'idle';
    this.mood = moodName;
    const M = MOODS[moodName];
    const k = 1 - Math.exp(-dt * (moodName === 'hurt' ? 18 : 7));
    for (const key of KEYS) e[key] += (M[key] - e[key]) * k;

    const hurt = clamp(p.hurt || 0, 0, 1);
    if (hurt > this.prevHurt + 0.15) this.flinch = 1;
    this.prevHurt = hurt;
    this.flinch = Math.max(0, this.flinch - dt * 5);
    let struggle = 0;
    const sv = this.tmp[0];
    if (p.struggle && typeof p.struggle === 'object') { struggle = Math.min(1, p.struggle.length()); sv.copy(p.struggle); }
    else { struggle = clamp(+p.struggle || 0, 0, 1); sv.set(0, 0, 0); }
    if (moodName === 'wrangled') struggle = Math.max(struggle, 0.35);
    fx._struggle = struggle;
    const suck = clamp(p.suck || 0, 0, 1);
    const mouth = clamp(p.mouth || 0, 0, 1);

    let jaw = Math.max(e.jaw, mouth);
    if (e.chomp > 0.05) jaw = lerp(jaw, 0.08 + 0.92 * Math.pow(0.5 + 0.5 * Math.sin(t * 11), 1.5), e.chomp);
    if (moodName === 'taunt') jaw += Math.sin(t * 7) * 0.08;
    S.uJaw.value = jaw * 0.62;
    S.uSmile.value = e.smile;
    const flail = e.flail;
    const fa = Math.sin(t * 9.5) * flail, fb = Math.sin(t * 8.3 + 1.7) * flail;
    S.uBrow.value.set(e.browL + Math.sin(t * 3.1) * 0.05, e.browR + Math.sin(t * 2.7) * 0.05, e.slant, 0);
    BU.uBrowSlant.value = e.slant;
    S.uTongue.value.set(clamp(e.tongue, 0, 1), e.wag, moodName === 'taunt' ? 0.6 : 0, 0);
    S.uArmL.value.set(e.armRaise * 0.9 + fa * 0.7 + Math.sin(t * 1.3) * 0.08, e.armSwing * 0.6 + fb * 0.4, Math.sin(t * 2.1) * 0.15 * flail, 0);
    S.uArmR.value.set(e.armRaise * 0.9 - fb * 0.7 + Math.sin(t * 1.2 + 2) * 0.08, e.armSwing * 0.6 + fa * 0.4, Math.sin(t * 1.9) * 0.15 * flail, 0);
    S.uPuff.value = e.puff * (0.75 + 0.25 * Math.sin(t * 11));
    S.uWobble.value = e.wobble + struggle * 1.5;
    S.uStruggle.value = struggle;
    S.uSquash.value = this.flinch * 0.9 + (moodName === 'eat' ? Math.max(0, Math.sin(t * 11)) * 0.12 : 0);

    const v = this.vel;
    if (p.vel) v.copy(p.vel); else v.set(0, 0, 0);
    const inv = this.tmp[3].copy(this.object3D.getWorldQuaternion(this.tmp[3])).invert();
    const lv = this.tmp[1].copy(v).applyQuaternion(inv);
    const sp = lv.length();
    let stretch = 1 + Math.min(0.42, sp * 0.045) + struggle * 0.12 * Math.abs(Math.sin(t * 13));
    if (sp > 0.05) lv.multiplyScalar(1 / sp); else lv.set(0, 1, 0);
    if (struggle > 0.01 && sv.lengthSq() > 1e-6) {
      const ls = this.tmp[2].copy(sv).applyQuaternion(inv).normalize();
      lv.lerp(ls, clamp(struggle / (struggle + sp * 0.1 + 0.01), 0, 1)).normalize();
    }
    S.uStretch.value.set(lv.x, lv.y, lv.z, stretch);
    const acc = this.tmp[2].copy(v).sub(this.prevVel).multiplyScalar(dt > 0 ? 1 / dt : 0);
    this.prevVel.copy(v);
    acc.applyQuaternion(inv).clampLength(0, 60);
    this.jigV.addScaledVector(acc, -0.3 * dt);
    this.jigV.addScaledVector(this.jig, -60 * dt);
    this.jigV.multiplyScalar(Math.max(0, 1 - 4.6 * dt));
    this.jig.addScaledVector(this.jigV, dt);
    this.jig.clampLength(0, 0.12);
    S.uJiggle.value.copy(this.jig);
    S.uTail.value.set(e.tail + sp * 0.01 + struggle * 0.1, e.tail * 0.6 + struggle * 0.06, 0, -Math.min(0.25, sp * 0.03));

    S.uSuck.value = suck;
    if (p.trapPos && suck > 0) {
      const tl = this.tmp[0].copy(p.trapPos);
      this.body.updateWorldMatrix(true, false);
      this.body.worldToLocal(tl);
      S.uTrap.value.copy(tl);
    }
    this.object3D.visible = suck < 0.995;

    this.nextBlink -= dt;
    if (this.nextBlink <= 0) { this.blink = 1; this.nextBlink = fx.rng.range(1.8, 4.5); }
    this.blink = Math.max(0, this.blink - dt * 7);
    const bl = this.blink > 0 ? Math.sin(this.blink * Math.PI) : 0;
    let lid = e.lid * (1 - bl);
    if (moodName === 'hurt') lid *= 0.4 + 0.6 * Math.max(0, Math.sin(t * 13));
    const lidL = clamp(lid + (moodName === 'taunt' ? 0.1 : 0), 0, 1), lidR = clamp(lid - (moodName === 'taunt' ? 0.25 : 0), 0, 1);
    BU.uEyes.value.set(lidL, lidR, e.pupil, moodName === 'eat' || moodName === 'hurt' || moodName === 'wrangled' ? 0.6 : 0.1);

    this.saccade -= dt;
    const cam = fx.camera;
    if (this.saccade <= 0) {
      this.saccade = fx.rng.range(0.4, 1.6);
      const gz = this.gazeT;
      if (cam && moodName !== 'flee' && moodName !== 'sucked') {
        cam.getWorldPosition(gz);
        this.object3D.worldToLocal(gz);
        gz.normalize();
        gz.x += fx.rng.signed() * 0.15; gz.y += fx.rng.signed() * 0.1;
      } else if (moodName === 'sucked') gz.set(fx.rng.signed() * 0.2, 0.6, 0.8);
      else gz.set(fx.rng.signed() * 0.8, fx.rng.signed() * 0.3, 0.5);
      gz.normalize();
      if (gz.z < 0.25) { gz.z = 0.25; gz.normalize(); }
    }
    this.gaze.lerp(this.gazeT, 1 - Math.exp(-dt * 25)).normalize();
    BU.uGazeL.value.copy(this.gaze).add(this.tmp[0].set(-0.06, 0, 0)).normalize();
    BU.uGazeR.value.copy(this.gaze).add(this.tmp[0].set(0.06, 0, 0)).normalize();

    BU.uGlow.value = e.glow * (1 + 0.06 * Math.sin(t * 3.3)) * (1 + suck * 0.5);
    BU.uHurt.value = hurt;
    const hw = BU.uHit.value.w;
    BU.uHit.value.w = Math.max(0, hw - dt * 2.5);
    const tilt = e.tilt;
    this.body.rotation.z = Math.sin(t * 0.9) * 0.04 + tilt * Math.sin(t * 2.2);
    this.body.rotation.x = e.low * 0.12;
    this.shell.rotation.copy(this.body.rotation);
    const bob = Math.sin(t * 1.8) * 0.035 + Math.sin(t * 3.1) * 0.012;
    this.body.position.y = bob;
    this.shell.position.y = bob;

    this.effects(dt, sp, struggle, suck);
    const G = this.tmp[0];
    this.object3D.getWorldPosition(G);
    const film = this.style === 'film';
    fx.lightPool.request(G, 0.35, 1.0, 0.25, (film ? 2.6 : 2.0) * e.glow * (1 + hurt * 2) * (1 - suck * 0.5), 2, 6);
  }

  effects(dt, sp, struggle, suck) {
    const fx = this.fx, r = fx.rng, P = fx.pools;
    if (!this.object3D.visible) return;
    const W = this.tmp[1];
    const film = this.style === 'film';
    this.wisp += dt * (film ? 6 : 16) * (1 + sp * 0.1 + struggle);
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
