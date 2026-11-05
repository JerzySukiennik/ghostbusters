// Onionhead sculpt (no three.js): SDF body with gap teeth, tongue, droopy eyes and wispy tail; rig weights and baked skin noise for surface nets.
import { sdEll, sdRoundCone, sdRBoxT, smin, smax, clamp, vn3, fbm, sculpt } from '../sculpt.js';

export const EYE_L = [0.135, 0.19, 0.305], EYE_R = [-0.125, 0.185, 0.31];
export const EYE_RL = 0.08, EYE_RR = 0.073;
export const TEETH_U = [[-0.14, 0.004, 0.3, 0.042, 0.046, 0.026, 0.07], [-0.048, -0.002, 0.326, 0.048, 0.05, 0.026, -0.03], [0.05, 0.002, 0.326, 0.046, 0.048, 0.026, 0.05], [0.148, 0.006, 0.298, 0.038, 0.04, 0.025, -0.09]];
export const TEETH_L = [[-0.105, -0.092, 0.298, 0.038, 0.034, 0.024, -0.1], [0.0, -0.097, 0.314, 0.034, 0.032, 0.022, 0.04], [0.11, -0.092, 0.298, 0.04, 0.034, 0.024, 0.12]];
export const TONGUE = [[0, -0.082, 0.2, 0.075, 0.032, 0.07], [0.0, -0.092, 0.31, 0.072, 0.032, 0.066], [0.012, -0.118, 0.405, 0.064, 0.03, 0.058], [0.028, -0.16, 0.47, 0.054, 0.028, 0.05], [0.04, -0.2, 0.5, 0.04, 0.024, 0.04]];
const TAIL = [[0, -0.3, -0.02, 0.24], [0.02, -0.46, -0.11, 0.17], [0.06, -0.58, -0.22, 0.115], [0.12, -0.65, -0.34, 0.075], [0.2, -0.66, -0.45, 0.046], [0.27, -0.62, -0.52, 0.026], [0.31, -0.55, -0.55, 0.013]];

export const LAYOUT = [
  { name: 'aW1', size: 4, type: 'i8' },
  { name: 'aW2', size: 4, type: 'u8' },
  { name: 'aMat', size: 1, type: 'u8i' },
  { name: 'aBump', size: 3, type: 'i8' },
];
export const CELLS = { lo: 0.024, md: 0.0186, hi: 0.0156 };

function bodySdf(x, y, z) {
  let d = sdEll(x, y, z, 0, 0.02, 0, 0.4, 0.4, 0.36);
  d = smin(d, sdEll(x, y, z, 0, 0.3, -0.03, 0.3, 0.25, 0.27), 0.14);
  d = smin(d, sdRoundCone(x, y, z, 0, 0.46, -0.05, 0.03, 0.58, -0.09, 0.085, 0.034), 0.1);
  d = smin(d, sdEll(x, y, z, 0.13, 0.42, 0.0, 0.14, 0.11, 0.14), 0.1);
  d = smin(d, sdEll(x, y, z, -0.12, 0.43, -0.05, 0.13, 0.1, 0.13), 0.1);
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

const _o = [0];
function partsSdf(x, y, z, out) {
  let best = 1e9, mat = 0;
  const el = Math.hypot(x - EYE_L[0], y - EYE_L[1], z - EYE_L[2]) - EYE_RL;
  const er = Math.hypot(x - EYE_R[0], y - EYE_R[1], z - EYE_R[2]) - EYE_RR;
  const e = Math.min(el, er);
  if (e < best) { best = e; mat = 4; }
  let t = 1e9;
  for (const q of TEETH_U) t = Math.min(t, sdRBoxT(x, y, z, q[0], q[1], q[2], q[3], q[4], q[5], 0.02, q[6]));
  for (const q of TEETH_L) t = Math.min(t, sdRBoxT(x, y, z, q[0], q[1], q[2], q[3], q[4], q[5], 0.02, q[6]));
  if (t < best) { best = t; mat = 3; }
  let g = 1e9;
  for (let i = 0; i < TONGUE.length; i++) { const a = TONGUE[i]; g = smin(g, sdEll(x, y, z, a[0], a[1], a[2], a[3], a[4], a[5]), 0.06); }
  if (g < best) { best = g; mat = 2; }
  out[0] = mat;
  return best;
}

export function sdf(x, y, z) {
  let d = bodySdf(x, y, z);
  d = smax(d, -cavitySdf(x, y, z), 0.035);
  return Math.min(d, partsSdf(x, y, z, _o));
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

function attr(x, y, z, nx, ny, nz, o) {
  const mat = classify(x, y, z);
  const sdx = x >= 0 ? 1 : -1;
  const jawFront = clamp((z + 0.05) / 0.17, 0, 1);
  let jaw = clamp((-0.022 - y) / 0.06, 0, 1) * jawFront * clamp((0.36 - Math.abs(x)) / 0.12, 0, 1);
  if (y < -0.32) jaw *= clamp((y + 0.42) / 0.1, 0, 1);
  if (mat === 2) jaw = 1;
  let arm = clamp((Math.abs(x) - 0.31) / 0.08, 0, 1) * clamp((y + 0.3) / 0.12, 0, 1) * clamp((0.12 - y) / 0.1, 0, 1);
  if (mat === 4) arm = 0;
  let tail = 0;
  if (y < -0.3) tail = clamp((-0.3 - y) / 0.36, 0, 1) * clamp((0.12 - z) / 0.25, 0, 1);
  if (z < -0.3 && y < -0.45) tail = Math.max(tail, clamp((-0.25 - z) / 0.3, 0, 1));
  const browD = Math.min(sdRoundCone(x, y, z, 0.05, 0.275, 0.31, 0.22, 0.295, 0.27, 0.036, 0.03), sdRoundCone(x, y, z, -0.05, 0.275, 0.31, -0.22, 0.295, 0.27, 0.036, 0.03));
  const brow = clamp(1 - browD / 0.045, 0, 1) * (mat === 4 ? 0 : 1) * sdx;
  const tongue = mat === 2 ? clamp((z - 0.2) / 0.3, 0, 1) : 0;
  const crown = clamp((y - 0.47) / 0.2, 0, 1);
  const cheek = clamp(1 - Math.abs(sdEll(x, y, z, 0.27 * sdx, -0.02, 0.14, 0.2, 0.19, 0.19)) / 0.05, 0, 1) * clamp(z / 0.12, 0, 1) * (mat === 0 ? 1 : 0);
  const skin = clamp((fbm(x * 3.5, y * 3.5, z * 3.5) * 0.6 + (vn3(x * 6, y * 22, z * 6) * 0.5 + 0.5) * 0.4) * 0.5 + 0.5, 0, 1);
  o[0] = jaw; o[1] = arm * sdx; o[2] = clamp(tail, 0, 1); o[3] = brow;
  o[4] = tongue; o[5] = crown; o[6] = cheek; o[7] = skin;
  o[8] = mat;
  if (mat === 0) {
    o[9] = (vn3(x * 11, y * 11, z * 11) * 0.2 + vn3(x * 38, y * 38, z * 38) * 0.08) / 0.3;
    o[10] = (vn3(x * 11 + 7, y * 11 + 7, z * 11 + 7) * 0.2 + vn3(x * 38 + 5, y * 38 + 5, z * 38 + 5) * 0.08) / 0.3;
    o[11] = (vn3(x * 11 + 13, y * 11 + 13, z * 11 + 13) * 0.2 + vn3(x * 38 + 9, y * 38 + 9, z * 38 + 9) * 0.08) / 0.3;
  }
}

export function build(res = 'md') {
  return sculpt({ sdf, bounds: [-0.66, -0.8, -0.66, 0.66, 0.76, 0.62], cell: CELLS[res] || CELLS.md, layout: LAYOUT, attr });
}

