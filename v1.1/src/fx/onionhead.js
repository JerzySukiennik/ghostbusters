// Onionhead mesh: SDF sculpt, narrow-band surface nets, rig weights and baked skin noise; also the binary cache format (no three.js dependency).
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export const EYE_L = [0.135, 0.19, 0.305], EYE_R = [-0.125, 0.185, 0.31];
export const EYE_RL = 0.088, EYE_RR = 0.08;

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
export const TEETH_U = [[-0.14, 0.004, 0.3, 0.042, 0.046, 0.026, 0.07], [-0.048, -0.002, 0.326, 0.048, 0.05, 0.026, -0.03], [0.05, 0.002, 0.326, 0.046, 0.048, 0.026, 0.05], [0.148, 0.006, 0.298, 0.038, 0.04, 0.025, -0.09]];
export const TEETH_L = [[-0.105, -0.092, 0.298, 0.038, 0.034, 0.024, -0.1], [0.0, -0.097, 0.314, 0.034, 0.032, 0.022, 0.04], [0.11, -0.092, 0.298, 0.04, 0.034, 0.024, 0.12]];
export const TONGUE = [[0, -0.082, 0.2, 0.075, 0.032, 0.07], [0.0, -0.092, 0.31, 0.072, 0.032, 0.066], [0.012, -0.118, 0.405, 0.064, 0.03, 0.058], [0.028, -0.16, 0.47, 0.054, 0.028, 0.05], [0.04, -0.2, 0.5, 0.04, 0.024, 0.04]];

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
  for (let i = 0; i < TONGUE.length; i++) {
    const a = TONGUE[i];
    g = smin(g, sdEll(x, y, z, a[0], a[1], a[2], a[3], a[4], a[5]), 0.06);
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


function hash3(x, y, z) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vn3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi), c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1), c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
  return l(l(l(c000, c100, fx), l(c010, c110, fx), fy), l(l(c001, c101, fx), l(c011, c111, fx), fy), fz) * 2 - 1;
}

function fbm(x, y, z) { return vn3(x, y, z) * 0.5 + vn3(x * 2.03 + 7.1, y * 2.03 + 7.1, z * 2.03 + 7.1) * 0.25 + vn3(x * 4.01 + 3.3, y * 4.01 + 3.3, z * 4.01 + 3.3) * 0.125; }
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function buildOnionheadArrays(res = 84) {
  const x0 = -0.66, x1 = 0.66, y0 = -0.8, y1 = 0.76, z0 = -0.66, z1 = 0.62;
  const h = (y1 - y0) / res;
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = res + 1, nz = Math.ceil((z1 - z0) / h) + 1;
  const F = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  const S = 4;
  const cx0 = Math.ceil((nx - 1) / S) + 1, cy0 = Math.ceil((ny - 1) / S) + 1, cz0 = Math.ceil((nz - 1) / S) + 1;
  const C = new Float32Array(cx0 * cy0 * cz0);
  const cid = (i, j, k) => i + cx0 * (j + cy0 * k);
  for (let k = 0; k < cz0; k++) for (let j = 0; j < cy0; j++) for (let i = 0; i < cx0; i++) C[cid(i, j, k)] = sdf(x0 + i * S * h, y0 + j * S * h, z0 + k * S * h);
  const band = S * h * 1.9;
  for (let k = 0; k < nz; k++) {
    const ck = Math.min(Math.floor(k / S), cz0 - 2), fk = k / S - ck;
    for (let j = 0; j < ny; j++) {
      const cj = Math.min(Math.floor(j / S), cy0 - 2), fj = j / S - cj;
      for (let i = 0; i < nx; i++) {
        const ci = Math.min(Math.floor(i / S), cx0 - 2), fi = i / S - ci;
        const c000 = C[cid(ci, cj, ck)], c100 = C[cid(ci + 1, cj, ck)], c010 = C[cid(ci, cj + 1, ck)], c110 = C[cid(ci + 1, cj + 1, ck)];
        const c001 = C[cid(ci, cj, ck + 1)], c101 = C[cid(ci + 1, cj, ck + 1)], c011 = C[cid(ci, cj + 1, ck + 1)], c111 = C[cid(ci + 1, cj + 1, ck + 1)];
        const mn = Math.min(Math.abs(c000), Math.abs(c100), Math.abs(c010), Math.abs(c110), Math.abs(c001), Math.abs(c101), Math.abs(c011), Math.abs(c111));
        const sg = Math.sign(c000);
        if (mn > band && sg === Math.sign(c111) && sg === Math.sign(c100) && sg === Math.sign(c010) && sg === Math.sign(c001) && sg === Math.sign(c110) && sg === Math.sign(c101) && sg === Math.sign(c011)) {
          const a = c000 + (c100 - c000) * fi, b = c010 + (c110 - c010) * fi, c = c001 + (c101 - c001) * fi, d = c011 + (c111 - c011) * fi;
          const e = a + (b - a) * fj, f = c + (d - c) * fj;
          F[id(i, j, k)] = e + (f - e) * fk;
        } else F[id(i, j, k)] = sdf(x0 + i * h, y0 + j * h, z0 + k * h);
      }
    }
  }
  const vIndex = new Int32Array(nx * ny * nz).fill(-1);
  const P = [];
  const ox = [0, 1, 0, 1, 0, 1, 0, 1], oy = [0, 0, 1, 1, 0, 0, 1, 1], oz = [0, 0, 0, 0, 1, 1, 1, 1];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const val = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { val[c] = F[id(i + ox[c], j + oy[c], k + oz[c])]; if (val[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((val[a] < 0) === (val[b] < 0)) continue;
      const t = val[a] / (val[a] - val[b]);
      sx += ox[a] + (ox[b] - ox[a]) * t; sy += oy[a] + (oy[b] - oy[a]) * t; sz += oz[a] + (oz[b] - oz[a]) * t; n++;
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
  const position = new Float32Array(P);
  const normal = new Float32Array(nv * 3);
  const w1 = new Float32Array(nv * 4), w2 = new Float32Array(nv * 4), noise = new Float32Array(nv * 4), bump = new Float32Array(nv * 3);
  const e = 0.0025;
  for (let v = 0; v < nv; v++) {
    let x = position[v * 3], y = position[v * 3 + 1], z = position[v * 3 + 2];
    for (let it = 0; it < 2; it++) {
      const d = sdf(x, y, z);
      let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1; gx /= gl; gy /= gl; gz /= gl;
      x -= gx * d; y -= gy * d; z -= gz * d;
      if (it === 1) { normal[v * 3] = gx; normal[v * 3 + 1] = gy; normal[v * 3 + 2] = gz; }
    }
    position[v * 3] = x; position[v * 3 + 1] = y; position[v * 3 + 2] = z;
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
    if (mat === 2) tongue = clamp((z - 0.2) / 0.3, 0, 1);
    const crown = clamp((y - 0.47) / 0.2, 0, 1);
    const cheek = clamp(1 - Math.abs(sdEll(x, y, z, 0.27 * sdx, -0.02, 0.14, 0.2, 0.19, 0.19)) / 0.05, 0, 1) * clamp((z - 0.0) / 0.12, 0, 1) * (mat === 0 ? 1 : 0);
    w1[v * 4] = jaw; w1[v * 4 + 1] = arm * sdx; w1[v * 4 + 2] = tail; w1[v * 4 + 3] = brow;
    w2[v * 4] = tongue; w2[v * 4 + 1] = mat; w2[v * 4 + 2] = crown; w2[v * 4 + 3] = cheek;
    noise[v * 4] = fbm(x * 4, y * 4, z * 4);
    noise[v * 4 + 1] = sstep(0.09, 0.0, Math.abs(fbm(x * 6 + 3.1, y * 6 + 3.1, z * 6 + 3.1))) * sstep(0.1, 0.5, fbm(x * 2 + 9, y * 2 + 9, z * 2 + 9) + 0.3) * 0.5;
    noise[v * 4 + 2] = vn3(x * 14, y * 14, z * 14) * 0.5 + 0.5;
    noise[v * 4 + 3] = fbm(x * 3.5, y * 3.5, z * 3.5) * 0.6 + (vn3(x * 6, y * 22, z * 6) * 0.5 + 0.5) * 0.4;
    if (mat === 0) {
      bump[v * 3] = vn3(x * 11, y * 11, z * 11) * 0.2 + vn3(x * 38, y * 38, z * 38) * 0.08;
      bump[v * 3 + 1] = vn3(x * 11 + 7, y * 11 + 7, z * 11 + 7) * 0.2 + vn3(x * 38 + 5, y * 38 + 5, z * 38 + 5) * 0.08;
      bump[v * 3 + 2] = vn3(x * 11 + 13, y * 11 + 13, z * 11 + 13) * 0.2 + vn3(x * 38 + 9, y * 38 + 9, z * 38 + 9) * 0.08;
    }
  }
  const index = nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  return { res, position, normal, w1, w2, noise, bump, index };
}

const MAGIC = 0x4f4e4844;
export function encodeOnionhead(a) {
  const nv = a.position.length / 3, ni = a.index.length, wide = a.index instanceof Uint32Array;
  const floats = nv * (3 + 3 + 4 + 4 + 4 + 3);
  const bytes = 32 + floats * 4 + ni * (wide ? 4 : 2);
  const buf = new ArrayBuffer(bytes + (bytes % 4 ? 4 - (bytes % 4) : 0));
  const head = new Uint32Array(buf, 0, 8);
  head.set([MAGIC, 1, nv, ni, a.res, wide ? 1 : 0, 0, 0]);
  let o = 32;
  for (const k of ['position', 'normal', 'w1', 'w2', 'noise', 'bump']) { new Float32Array(buf, o, a[k].length).set(a[k]); o += a[k].length * 4; }
  if (wide) new Uint32Array(buf, o, ni).set(a.index); else new Uint16Array(buf, o, ni).set(a.index);
  return buf;
}

export function decodeOnionhead(buf) {
  const head = new Uint32Array(buf, 0, 8);
  if (head[0] !== MAGIC || head[1] !== 1) throw new Error('bad onionhead mesh');
  const nv = head[2], ni = head[3], wide = head[5] === 1;
  let o = 32;
  const take = (n) => { const a = new Float32Array(buf, o, n); o += n * 4; return a; };
  const position = take(nv * 3), normal = take(nv * 3), w1 = take(nv * 4), w2 = take(nv * 4), noise = take(nv * 4), bump = take(nv * 3);
  const index = wide ? new Uint32Array(buf, o, ni) : new Uint16Array(buf, o, ni);
  return { res: head[4], position, normal, w1, w2, noise, bump, index };
}
