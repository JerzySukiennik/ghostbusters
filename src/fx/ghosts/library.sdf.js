// Library ghost sculpt (no three.js): Victorian librarian with bun, high collar, gigot sleeves, open book and trailing skirt; jaw, socket and hair rig for the skull-faced horror.
import { sdEll, sdSph, sdRoundCone, sdBox, smin, smax, clamp, vn3, fbm, sculpt, merge } from '../sculpt.js';

export const EYE_L = [0.036, 0.452, 0.077], EYE_R = [-0.036, 0.452, 0.077];
export const EYE_R0 = 0.0165;
export const HINGE = [0, 0.432, -0.035];
export const MOUTH_Y = 0.401;
export const SHOULDER = [0.185, 0.175, -0.005];
export const ELBOW = [0.205, -0.05, 0.06];
export const NECK_Y = 0.3;
export const BOOK_C = [0, 0.045, 0.255];
const BW = [0, 0.92, -0.39], BV = [0, 0.39, 0.92];

export const LAYOUT = [
  { name: 'aW1', size: 4, type: 'i8' },
  { name: 'aW2', size: 4, type: 'u8' },
  { name: 'aMat', size: 1, type: 'u8i' },
  { name: 'aBump', size: 3, type: 'i8' },
  { name: 'aFore', size: 1, type: 'u8' },
];
export const CELLS = { lo: [0.026, 0.0095, 0.011], md: [0.02, 0.0072, 0.0085], hi: [0.016, 0.006, 0.007] };

function skull(x, y, z) {
  let d = sdEll(x, y, z, 0, 0.458, -0.008, 0.088, 0.112, 0.102);
  d = smin(d, sdEll(x, y, z, 0, 0.392, 0.03, 0.058, 0.05, 0.062), 0.035);
  d = smin(d, sdEll(x, y, z, 0, 0.372, 0.052, 0.03, 0.022, 0.03), 0.03);
  for (const s of [1, -1]) {
    d = smin(d, sdEll(x, y, z, 0.05 * s, 0.428, 0.058, 0.03, 0.026, 0.028), 0.03);
    d = smin(d, sdEll(x, y, z, 0.086 * s, 0.445, -0.01, 0.014, 0.026, 0.014), 0.012);
    d = smax(d, -sdSph(x, y, z, 0.036 * s, 0.454, 0.098, 0.021), 0.012);
  }
  d = smin(d, sdRoundCone(x, y, z, 0, 0.462, 0.088, 0, 0.428, 0.112, 0.01, 0.015), 0.018);
  d = smin(d, sdEll(x, y, z, 0, 0.49, 0.06, 0.06, 0.03, 0.04), 0.03);
  return d;
}

function hairSdf(x, y, z) {
  let h = sdEll(x, y, z, 0, 0.472, -0.02, 0.098, 0.1, 0.106);
  h = smax(h, -(y - 0.47 + (z - 0.02) * 0.9), 0.03);
  h = smin(h, sdEll(x, y, z, 0, 0.535, -0.075, 0.052, 0.045, 0.05), 0.03);
  h = smin(h, sdEll(x, y, z, 0, 0.5, -0.11, 0.058, 0.055, 0.045), 0.02);
  for (const s of [1, -1]) h = smin(h, sdEll(x, y, z, 0.07 * s, 0.49, 0.03, 0.04, 0.035, 0.04), 0.03);
  return h + vn3(x * 60, y * 160, z * 60) * 0.003;
}

function mouthCut(x, y, z) {
  const slit = sdEll(x, y, z, 0, MOUTH_Y, 0.084, 0.024, 0.0055, 0.03);
  const cav = sdEll(x, y, z, 0, MOUTH_Y - 0.004, 0.045, 0.036, 0.022, 0.04);
  return smin(slit, cav, 0.012);
}

function headSdf(x, y, z) {
  let d = smin(skull(x, y, z), hairSdf(x, y, z), 0.012);
  d = smin(d, sdRoundCone(x, y, z, 0, 0.27, -0.01, 0, 0.375, 0.0, 0.048, 0.04), 0.03);
  d = smin(d, sdRoundCone(x, y, z, 0, 0.27, -0.012, 0, 0.345, -0.004, 0.058, 0.051), 0.012);
  return smax(d, -mouthCut(x, y, z), 0.008);
}

function bookSdf(x, y, z, out) {
  const px = x - BOOK_C[0], py = y - BOOK_C[1], pz = z - BOOK_C[2];
  const u = px, v = py * BV[1] + pz * BV[2], w = py * BW[1] + pz * BW[2];
  let d = 1e9, pg = 1e9;
  for (const s of [1, -1]) {
    const a = 0.22 * s, c = Math.cos(a), sn = Math.sin(a);
    const lu = c * u + sn * w, lw = -sn * u + c * w;
    d = Math.min(d, sdBox(lu, v, lw, 0.052 * s, 0, -0.004, 0.053, 0.078, 0.0035, 0.002));
    pg = Math.min(pg, sdBox(lu, v, lw, 0.05 * s, 0, 0.003, 0.048, 0.073, 0.005, 0.003));
  }
  if (out) out[0] = pg < d ? 1 : 0;
  return Math.min(d, pg);
}

function handsSdf(x, y, z) {
  let d = 1e9;
  for (const s of [1, -1]) {
    d = smin(d, sdRoundCone(x, y, z, 0.2 * s, -0.05, 0.06, 0.115 * s, 0.015, 0.2, 0.036, 0.029), 0.02);
    d = smin(d, sdEll(x, y, z, 0.098 * s, 0.03, 0.235, 0.022, 0.03, 0.036), 0.02);
    d = smin(d, sdRoundCone(x, y, z, 0.098 * s, 0.045, 0.255, 0.075 * s, 0.07, 0.275, 0.011, 0.008), 0.01);
  }
  return d;
}

function torsoSdf(x, y, z) {
  let d = sdEll(x, y, z, 0, 0.2, -0.012, 0.15, 0.085, 0.1);
  d = smin(d, sdEll(x, y, z, 0, 0.09, 0.012, 0.155, 0.15, 0.11), 0.06);
  d = smin(d, sdEll(x, y, z, 0, -0.09, -0.002, 0.122, 0.12, 0.092), 0.07);
  return smin(d, sdEll(x, y, z, 0, -0.2, -0.01, 0.165, 0.11, 0.125), 0.08);
}

function armSdf(x, y, z) {
  const s = x >= 0 ? 1 : -1;
  let d = sdEll(x, y, z, 0.19 * s, 0.185, -0.01, 0.068, 0.065, 0.068);
  d = Math.min(d, sdRoundCone(x, y, z, 0.2 * s, 0.15, 0.0, 0.205 * s, -0.05, 0.06, 0.05, 0.04));
  d = Math.min(d, sdRoundCone(x, y, z, 0.2 * s, -0.05, 0.06, 0.115 * s, 0.015, 0.2, 0.036, 0.029));
  return Math.min(d, sdEll(x, y, z, 0.098 * s, 0.03, 0.235, 0.022, 0.03, 0.036) - 0.01);
}

function foreW(x, y, z) {
  const s = x >= 0 ? 1 : -1;
  const up = sdRoundCone(x, y, z, 0.2 * s, 0.15, 0.0, 0.205 * s, -0.05, 0.06, 0.05, 0.04);
  const lo = Math.min(sdRoundCone(x, y, z, 0.2 * s, -0.05, 0.06, 0.115 * s, 0.015, 0.2, 0.036, 0.029), sdEll(x, y, z, 0.098 * s, 0.03, 0.235, 0.022, 0.03, 0.036) - 0.01);
  return clamp((up - lo) / 0.035 + 0.5, 0, 1);
}

function armW(x, y, z) {
  if (y > 0.27) return 0;
  return clamp((torsoSdf(x, y, z) - armSdf(x, y, z)) / 0.05 + 0.5, 0, 1);
}

function bodySdf(x, y, z) {
  let d = sdEll(x, y, z, 0, 0.2, -0.012, 0.18, 0.085, 0.1);
  d = smin(d, sdEll(x, y, z, 0, 0.09, 0.012, 0.155, 0.15, 0.11), 0.06);
  d = smin(d, sdEll(x, y, z, 0, -0.09, -0.002, 0.122, 0.12, 0.092), 0.07);
  d = smin(d, sdEll(x, y, z, 0, -0.2, -0.01, 0.165, 0.11, 0.125), 0.08);
  const ang = Math.atan2(x, z + 0.03);
  const lo = clamp((-y - 0.28) / 0.7, 0, 1);
  d = smin(d, sdRoundCone(x, y, z, 0, -0.18, -0.01, 0, -1.03, -0.07, 0.165, 0.37), 0.08);
  d += Math.sin(ang * 9 + y * 2.5) * 0.014 * lo + vn3(x * 7, y * 3, z * 7) * 0.02 * lo;
  d = smax(d, -1.06 - y + Math.sin(ang * 5) * 0.04 + vn3(x * 5, 0, z * 5) * 0.05, 0.05);
  for (const s of [1, -1]) {
    d = smin(d, sdEll(x, y, z, 0.19 * s, 0.185, -0.01, 0.068, 0.065, 0.068), 0.03);
    d = smin(d, sdRoundCone(x, y, z, 0.2 * s, 0.15, 0.0, 0.205 * s, -0.05, 0.06, 0.05, 0.04), 0.03);
  }
  d = smin(d, handsSdf(x, y, z), 0.02);
  return d;
}

export function sdf(x, y, z) {
  let d = bodySdf(x, y, z);
  d = smin(d, headSdf(x, y, z), 0.02);
  d = Math.min(d, bookSdf(x, y, z));
  const e = Math.min(sdSph(x, y, z, EYE_L[0], EYE_L[1], EYE_L[2], EYE_R0), sdSph(x, y, z, EYE_R[0], EYE_R[1], EYE_R[2], EYE_R0));
  return Math.min(d, e);
}

const _b = [0];
function classify(x, y, z) {
  const e = Math.min(sdSph(x, y, z, EYE_L[0], EYE_L[1], EYE_L[2], EYE_R0), sdSph(x, y, z, EYE_R[0], EYE_R[1], EYE_R[2], EYE_R0));
  if (e < 0.0025) return 5;
  const bk = bookSdf(x, y, z, _b);
  if (bk < 0.004) return 3;
  if (y > 0.25) {
    if (mouthCut(x, y, z) < 0.006 && y < 0.42 && z > 0.0) return 4;
    const h = hairSdf(x, y, z), sk = skull(x, y, z);
    if (h < sk - 0.002 && y > 0.4) return 2;
    if (y > 0.35 || (y > 0.33 && z > 0.02)) return 1;
    return 0;
  }
  if (handsSdf(x, y, z) < 0.004 && z > 0.19) return 1;
  return 0;
}

function attr(x, y, z, nx, ny, nz, o) {
  const mat = classify(x, y, z);
  const head = clamp((y - 0.33) / 0.05, 0, 1);
  let jaw = 0;
  if (y > 0.3 && y < MOUTH_Y && mat !== 5) jaw = clamp((MOUTH_Y - 0.003 - y) / 0.012, 0, 1) * clamp((z + 0.02) / 0.05, 0, 1) * clamp((0.075 - Math.abs(x)) / 0.025, 0, 1);
  if (mat === 4 && y < MOUTH_Y - 0.004) jaw = 1;
  jaw *= clamp((y - 0.335) / 0.02, 0, 1);
  const sx = x >= 0 ? 1 : -1;
  let arm = mat === 3 ? 0.999 : armW(x, y, z) * sx;
  const hair = mat === 2 ? clamp((y - 0.43) / 0.08, 0.15, 1) : 0;
  const sink = mat === 1 && y > 0.36 ? clamp(1 - Math.abs(sdEll(x, y, z, 0.05 * Math.sign(x || 1), 0.415, 0.06, 0.035, 0.03, 0.03)) / 0.025, 0, 1) : 0;
  const so = Math.min(Math.hypot(x - EYE_L[0], y - EYE_L[1], z - EYE_L[2]), Math.hypot(x - EYE_R[0], y - EYE_R[1], z - EYE_R[2]));
  const socket = mat === 1 || mat === 5 ? clamp(1 - (so - 0.016) / 0.016, 0, 1) : 0;
  const skirt = clamp((-y - 0.25) / 0.82, 0, 1);
  const skin = clamp(fbm(x * 9, y * 9, z * 9) * 0.7 + 0.5, 0, 1);
  o[0] = jaw; o[1] = arm; o[2] = hair; o[3] = head;
  o[4] = sink; o[5] = socket; o[6] = skirt; o[7] = skin;
  o[8] = mat;
  o[12] = mat === 3 ? 1 : Math.abs(arm) > 0.01 ? foreW(x, y, z) : 0;
  const k = mat === 0 ? 0.6 : mat === 2 ? 1 : 0.35;
  o[9] = (vn3(x * 24, y * 24, z * 24) * 0.6 + vn3(x * 70, y * 70, z * 70) * 0.4) * k;
  o[10] = (vn3(x * 24 + 7, y * 24 + 7, z * 24 + 7) * 0.6 + vn3(x * 70 + 5, y * 70 + 5, z * 70 + 5) * 0.4) * k;
  o[11] = (vn3(x * 24 + 13, y * 24 + 13, z * 24 + 13) * 0.6 + vn3(x * 70 + 9, y * 70 + 9, z * 70 + 9) * 0.4) * k;
}

const inBook = (x, y, z) => z > 0.165 && y > -0.07 && y < 0.17 && Math.abs(x) < 0.17;

export function build(res = 'md') {
  const [body, head, hands] = CELLS[res] || CELLS.md;
  const parts = [
    sculpt({ sdf, bounds: [-0.46, -1.14, -0.5, 0.46, NECK_Y + 0.03, 0.4], cell: body, layout: LAYOUT, attr, keep: (x, y, z) => y < NECK_Y + 0.012 && !inBook(x, y, z) }),
    sculpt({ sdf, bounds: [-0.14, NECK_Y - 0.03, -0.2, 0.14, 0.62, 0.16], cell: head, layout: LAYOUT, attr, keep: (x, y) => y > NECK_Y - 0.012 }),
    sculpt({ sdf, bounds: [-0.18, -0.08, 0.15, 0.18, 0.18, 0.37], cell: hands, layout: LAYOUT, attr, keep: (x, y, z) => inBook(x, y, z) }),
  ];
  return merge(parts);
}
