// Terror dog sculpt (no three.js): deep-chested demon hound with back-swept horns, spine spikes, fangs and four rigged legs (hip and knee pivots per leg) for a stop-motion gait.
import { sdEll, sdSph, sdRoundCone, smin, smax, clamp, vn3, fbm, chain, sculpt, merge } from '../sculpt.js';

export const EYE = [0.083, 0.452, 1.0], EYE_R0 = 0.03;
export const LEGS = [
  { hip: [0.17, -0.04, 0.42], knee: [0.185, -0.45, 0.35], pts: [[0.17, -0.04, 0.42, 0.175], [0.185, -0.45, 0.35, 0.115], [0.17, -0.82, 0.41, 0.078], [0.17, -0.875, 0.46, 0.068]] },
  { hip: [0.17, -0.02, -0.5], knee: [0.185, -0.38, -0.34], pts: [[0.17, -0.02, -0.5, 0.205], [0.185, -0.38, -0.34, 0.12], [0.175, -0.63, -0.6, 0.075], [0.17, -0.86, -0.55, 0.06], [0.17, -0.89, -0.5, 0.058]] },
];
export const NECK = [0, 0.2, 0.5];
export const JAW_HINGE = [0, 0.36, 0.86];
export const HIP_PIVOT = [0, 0.0, -0.5];
export const GROUND = -0.95;
const FANGS = [[0.05, 0.375, 1.0, 0.327, 0.012], [0.042, 0.372, 1.08, 0.326, 0.011], [0.026, 0.368, 1.16, 0.325, 0.009]];
const LOW_FANGS = [[0.05, 0.28, 0.96, 0.335, 0.011], [0.042, 0.28, 1.04, 0.334, 0.01], [0.03, 0.282, 1.12, 0.33, 0.008]];
const SPIKES = [[0.58, 0.44], [0.4, 0.4], [0.2, 0.38], [0.0, 0.33], [-0.2, 0.3], [-0.4, 0.3], [-0.6, 0.27]];
const HORN = [[0.09, 0.52, 0.9, 0.072], [0.14, 0.63, 0.8, 0.056], [0.185, 0.7, 0.66, 0.043], [0.215, 0.73, 0.53, 0.031], [0.228, 0.745, 0.45, 0.019], [0.232, 0.79, 0.42, 0.007]];
const TAIL = [[0, 0.08, -0.72, 0.08], [0, -0.04, -0.88, 0.055], [0, -0.19, -0.95, 0.03], [0, -0.31, -0.96, 0.012]];

export const LAYOUT = [
  { name: 'aW1', size: 4, type: 'u8' },
  { name: 'aW2', size: 4, type: 'u8' },
  { name: 'aMat', size: 1, type: 'u8i' },
  { name: 'aLeg', size: 1, type: 'u8i' },
  { name: 'aBump', size: 3, type: 'i8' },
];
export const CELLS = { lo: [0.032, 0.016], md: [0.024, 0.012], hi: [0.019, 0.0095] };

const mir = (p, s) => [p[0] * s, p[1], p[2], p[3]];

function torso(x, y, z) {
  let d = sdEll(x, y, z, 0, -0.04, 0.3, 0.3, 0.4, 0.4);
  d = smin(d, sdEll(x, y, z, 0, 0.29, 0.3, 0.3, 0.22, 0.27), 0.12);
  for (const s of [1, -1]) d = smin(d, sdEll(x, y, z, 0.17 * s, 0.12, 0.42, 0.16, 0.24, 0.2), 0.08);
  d = smin(d, sdEll(x, y, z, 0, 0.07, -0.1, 0.2, 0.22, 0.32), 0.12);
  d = smin(d, sdEll(x, y, z, 0, 0.05, -0.5, 0.24, 0.25, 0.25), 0.12);
  d = smin(d, sdRoundCone(x, y, z, 0, 0.2, 0.52, 0, 0.34, 0.8, 0.25, 0.185), 0.1);
  d += vn3(x * 9, y * 9, z * 9) * 0.012 + Math.abs(Math.sin(z * 26 + Math.sin(x * 8) * 1.5)) * 0.006 * clamp((y + 0.1) / 0.3, 0, 1);
  return d;
}

function headBase(x, y, z) {
  let d = sdEll(x, y, z, 0, 0.43, 0.88, 0.185, 0.16, 0.18);
  d = smin(d, sdRoundCone(x, y, z, 0, 0.41, 0.97, 0, 0.365, 1.21, 0.112, 0.068), 0.06);
  d = smin(d, sdEll(x, y, z, 0, 0.46, 1.0, 0.07, 0.04, 0.14), 0.05);
  d = smin(d, sdEll(x, y, z, 0, 0.505, 0.95, 0.145, 0.045, 0.075), 0.04);
  for (const s of [1, -1]) {
    d = smin(d, sdEll(x, y, z, 0.125 * s, 0.38, 0.87, 0.095, 0.095, 0.1), 0.04);
    d = smin(d, sdRoundCone(x, y, z, 0.11 * s, 0.5, 0.8, 0.15 * s, 0.6, 0.73, 0.035, 0.008), 0.03);
    d = smax(d, -sdSph(x, y, z, EYE[0] * s, EYE[1] + 0.005, EYE[2] + 0.02, 0.035), 0.015);
  }
  d = smin(d, sdRoundCone(x, y, z, 0, 0.355, 1.17, 0, 0.37, 1.24, 0.045, 0.03), 0.03);
  for (const s of [1, -1]) d = smin(d, sdEll(x, y, z, 0.05 * s, 0.355, 1.08, 0.035, 0.03, 0.11), 0.025);
  return d;
}

function jawSdf(x, y, z) { return sdRoundCone(x, y, z, 0, 0.305, 0.88, 0, 0.292, 1.16, 0.09, 0.046); }
function mouthCut(x, y, z) {
  const t = clamp((z - 0.9) / 0.3, 0, 1), k = 1 - 0.35 * t;
  return sdEll(x / k, y, z, 0, 0.335 - 0.006 * t, 1.08, 0.15, 0.03, 0.24) * k;
}

function hornSdf(x, y, z) {
  return chain(Math.abs(x), y, z, HORN, 0.02) + Math.sin((y + z) * 70) * 0.002;
}

function upperFangs(x, y, z) {
  const ax = Math.abs(x);
  let d = 1e9;
  for (const f of FANGS) d = Math.min(d, sdRoundCone(ax, y, z, f[0], f[1], f[2], f[0] - 0.004, f[3], f[2] + 0.006, f[4], 0.002));
  return d;
}

function lowerFangs(x, y, z) {
  const ax = Math.abs(x);
  let d = 1e9;
  for (const f of LOW_FANGS) d = Math.min(d, sdRoundCone(ax, y, z, f[0], f[1], f[2], f[0] - 0.003, f[3], f[2] - 0.004, f[4], 0.002));
  return d;
}

function fangSdf(x, y, z) { return Math.min(upperFangs(x, y, z), lowerFangs(x, y, z)); }

function spikes(x, y, z) {
  let d = 1e9;
  for (const s of SPIKES) d = Math.min(d, sdRoundCone(x, y, z, 0, s[1] - 0.05, s[0], 0, s[1] + 0.07, s[0] - 0.07, 0.035, 0.004));
  return d;
}

function legSdf(i, s, x, y, z) {
  const L = LEGS[i];
  const P = L.pts.map((p) => mir(p, s));
  let d = chain(x, y, z, P, 0.05);
  const paw = P[P.length - 1];
  d = smin(d, sdEll(x, y, z, paw[0], paw[1] - 0.01, paw[2] + 0.03, 0.065, 0.045, 0.085), 0.03);
  return d;
}

function claws(x, y, z) {
  let d = 1e9;
  for (const L of LEGS) {
    const paw = L.pts[L.pts.length - 1];
    for (const s of [1, -1]) for (const k of [-1, 0, 1]) {
      const cx = paw[0] * s + k * 0.03, cz = paw[2] + 0.1;
      d = Math.min(d, sdRoundCone(x, y, z, cx, paw[1] - 0.02, cz, cx, paw[1] - 0.05, cz + 0.045, 0.012, 0.003));
    }
  }
  return d;
}

function tailSdf(x, y, z) { return chain(x, y, z, TAIL, 0.04); }

function bodyAll(x, y, z) {
  let d = torso(x, y, z);
  d = smin(d, tailSdf(x, y, z), 0.06);
  d = smin(d, spikes(x, y, z), 0.03);
  for (let i = 0; i < 2; i++) for (const s of [1, -1]) d = smin(d, legSdf(i, s, x, y, z), 0.07);
  return d;
}

function headAll(x, y, z) {
  let d = smin(headBase(x, y, z), jawSdf(x, y, z), 0.03);
  d = smax(d, -mouthCut(x, y, z), 0.01);
  return d;
}

export function sdf(x, y, z) {
  let d = smin(bodyAll(x, y, z), headAll(x, y, z), 0.08);
  d = smin(d, hornSdf(x, y, z), 0.025);
  d = Math.min(d, fangSdf(x, y, z));
  d = Math.min(d, claws(x, y, z));
  d = Math.min(d, sdSph(x, y, z, EYE[0], EYE[1], EYE[2], EYE_R0), sdSph(x, y, z, -EYE[0], EYE[1], EYE[2], EYE_R0));
  return d;
}

function classify(x, y, z) {
  if (Math.min(sdSph(x, y, z, EYE[0], EYE[1], EYE[2], EYE_R0), sdSph(x, y, z, -EYE[0], EYE[1], EYE[2], EYE_R0)) < 0.003) return 2;
  if (z > 0.8 && fangSdf(x, y, z) < 0.003) return 3;
  if (y < -0.8 && claws(x, y, z) < 0.003) return 5;
  if (y > 0.45 && hornSdf(x, y, z) < 0.006 && Math.abs(x) > 0.06) return 1;
  if (z > 0.85 && y > 0.25 && y < 0.37 && mouthCut(x, y, z) < 0.012) return 4;
  return 0;
}

function legInfo(x, y, z) {
  let best = 1e9, leg = 0, li = 0, side = 1;
  for (let i = 0; i < 2; i++) for (const s of [1, -1]) {
    const d = legSdf(i, s, x, y, z);
    if (d < best) { best = d; li = i; side = s; leg = 1 + i * 2 + (s > 0 ? 0 : 1); }
  }
  const P = LEGS[li].pts.map((p) => mir(p, side));
  const up = sdRoundCone(x, y, z, P[0][0], P[0][1], P[0][2], P[1][0], P[1][1], P[1][2], P[0][3], P[1][3]);
  let lo = 1e9;
  for (let k = 1; k < P.length - 1; k++) lo = Math.min(lo, sdRoundCone(x, y, z, P[k][0], P[k][1], P[k][2], P[k + 1][0], P[k + 1][1], P[k + 1][2], P[k][3], P[k + 1][3]));
  const paw = P[P.length - 1];
  lo = Math.min(lo, sdEll(x, y, z, paw[0], paw[1] - 0.01, paw[2] + 0.03, 0.065, 0.045, 0.085), claws(x, y, z));
  const body = Math.min(torso(x, y, z), tailSdf(x, y, z));
  const hipW = clamp((body - best) / 0.09 + 0.5, 0, 1) * clamp((0.16 - y) / 0.08, 0, 1);
  const kneeW = clamp((up - lo) / 0.06 + 0.5, 0, 1);
  return [hipW > 0.001 ? leg : 0, hipW, kneeW];
}

function attr(x, y, z, nx, ny, nz, o) {
  const mat = classify(x, y, z);
  const [leg, hipW, kneeW] = legInfo(x, y, z);
  const jaw = mat === 2 || mat === 1 || mat === 3 ? 0 : clamp((jawSdf(x, y, z) < headBase(x, y, z) ? 1 : 0) * clamp((0.335 - y) / 0.02 + 0.5, 0, 1) * clamp((z - 0.84) / 0.05, 0, 1), 0, 1);
  const lowerFang = mat === 3 && lowerFangs(x, y, z) < upperFangs(x, y, z) ? 1 : 0;
  const head = clamp((z - 0.52) / 0.2, 0, 1) * clamp((y - 0.05) / 0.15, 0, 1);
  const tail = clamp((-z - 0.66) / 0.3, 0, 1);
  const spine = clamp((0.6 - z) / 1.2, 0, 1);
  const horn = mat === 1 ? clamp((Math.hypot(x, y - 0.52, z - 0.9) - 0.03) / 0.35, 0, 1) : 0;
  const skin = clamp(fbm(x * 7, y * 7, z * 7) * 0.8 + 0.5, 0, 1);
  o[0] = hipW; o[1] = kneeW; o[2] = Math.max(jaw, lowerFang); o[3] = head;
  o[4] = tail; o[5] = spine; o[6] = horn; o[7] = skin;
  o[8] = mat; o[9] = leg;
  const k = mat === 0 ? 1 : 0.3;
  o[10] = vn3(x * 30, y * 30, z * 30) * 0.7 * k; o[11] = vn3(x * 30 + 5, y * 30 + 5, z * 30 + 5) * 0.7 * k; o[12] = vn3(x * 30 + 9, y * 30 + 9, z * 30 + 9) * 0.7 * k;
}

const inHead = (x, y, z) => (z > 0.7 && y > 0.17) || (y > 0.5 && z > 0.36);

export function build(res = 'md') {
  const [body, head] = CELLS[res] || CELLS.md;
  return merge([
    sculpt({ sdf, bounds: [-0.46, -1.0, -1.14, 0.46, 0.84, 0.86], cell: body, layout: LAYOUT, attr, keep: (x, y, z) => !(z > 0.712 && y > 0.182) && !(y > 0.512 && z > 0.372) }),
    sculpt({ sdf, bounds: [-0.27, 0.12, 0.34, 0.27, 0.84, 1.3], cell: head, layout: LAYOUT, attr, keep: (x, y, z) => inHead(x, y, z) }),
  ]);
}
