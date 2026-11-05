// Taxi ghost sculpt (no three.js): rotting cabbie with flat cap, lipless grin, one bulging eye, hands on the wheel and a vapour tail, plus a spectral Checker cab as a second mesh group.
import { sdEll, sdSph, sdRoundCone, sdBox, sdRBoxT, sdCylX, smin, smax, clamp, vn3, fbm, chain, sculpt, merge } from '../sculpt.js';

export const G = -0.95;
export const CAB_X = -0.42;
export const NECK = [0, 0.26, -0.01];
export const JAW_HINGE = [0, 0.385, 0.05];
export const WHEEL_C = [0, 0.03, 0.4];
export const WHEEL_N = [0, 0.5, -0.866];
export const WHEEL_R = 0.19;
export const EYE_L = [0.034, 0.445, 0.124], EYE_LR = 0.022;
export const EYE_R = [-0.034, 0.442, 0.116], EYE_RR = 0.014;
export const AXLES = [1.35, -1.75];
export const WHEEL_RAD = 0.36;
const UPW = [0, 0.866, 0.5];
const GRIP = [[0.165, 0.112, 0.4475], [-0.165, 0.112, 0.4475]];
const TAIL = [[0, -0.36, -0.03, 0.19], [0, -0.56, -0.14, 0.14], [0.03, -0.72, -0.32, 0.085], [0.06, -0.8, -0.5, 0.045], [0.08, -0.82, -0.64, 0.016]];
const HAIR = [[-1, 0.03, 0.02], [1, 0.03, -0.01], [-1, -0.03, -0.015], [1, -0.035, 0.02], [-0.65, -0.075, 0.01], [0.65, -0.08, -0.02], [0.1, -0.1, 0.0], [-0.2, -0.095, 0.015]];

export const LAYOUT = [
  { name: 'aW1', size: 4, type: 'u8' },
  { name: 'aW2', size: 4, type: 'u8' },
  { name: 'aMat', size: 1, type: 'u8i' },
  { name: 'aBump', size: 3, type: 'i8' },
];
export const CELLS = { lo: [0.028, 0.01, 0.013, 0.095], md: [0.022, 0.0078, 0.0105, 0.075], hi: [0.018, 0.0062, 0.0085, 0.06] };

const teeth = [];
for (let i = -3; i <= 3; i++) {
  const a = i * 0.21;
  teeth.push([Math.sin(a) * 0.048, 0.38, 0.083 + Math.cos(a) * 0.046, 0.0075, 0.0105, 0.006, a * 0.15 + (i % 2) * 0.12, 0]);
  if (Math.abs(i) < 3) teeth.push([Math.sin(a) * 0.044, 0.36, 0.082 + Math.cos(a) * 0.042, 0.007, 0.0095, 0.0055, -a * 0.1 + (i % 2) * 0.1, 1]);
}
export const TEETH = teeth;

function sdWheel(x, y, z) {
  const qx = x - WHEEL_C[0], qy = y - WHEEL_C[1], qz = z - WHEEL_C[2];
  const a = qx * WHEEL_N[0] + qy * WHEEL_N[1] + qz * WHEEL_N[2];
  const rx = qx - WHEEL_N[0] * a, ry = qy - WHEEL_N[1] * a, rz = qz - WHEEL_N[2] * a;
  const rim = Math.hypot(Math.hypot(rx, ry, rz) - WHEEL_R, a) - 0.016;
  const hub = sdEll(x, y, z, WHEEL_C[0], WHEEL_C[1] - 0.004, WHEEL_C[2] + 0.007, 0.045, 0.03, 0.03);
  let d = Math.min(rim, hub);
  for (const s of [1, -1]) {
    const ex = WHEEL_C[0] + s * 0.866 * WHEEL_R * 0.95, ey = WHEEL_C[1] - UPW[1] * 0.5 * WHEEL_R * 0.95, ez = WHEEL_C[2] - UPW[2] * 0.5 * WHEEL_R * 0.95;
    d = Math.min(d, sdRoundCone(x, y, z, WHEEL_C[0], WHEEL_C[1], WHEEL_C[2], ex, ey, ez, 0.012, 0.01));
  }
  d = Math.min(d, sdRoundCone(x, y, z, WHEEL_C[0], WHEEL_C[1] - UPW[1] * WHEEL_R * 0.95, WHEEL_C[2] - UPW[2] * WHEEL_R * 0.95, WHEEL_C[0], WHEEL_C[1], WHEEL_C[2], 0.012, 0.012));
  d = Math.min(d, sdRoundCone(x, y, z, WHEEL_C[0], WHEEL_C[1], WHEEL_C[2], WHEEL_C[0], WHEEL_C[1] - 0.12, WHEEL_C[2] + 0.2, 0.028, 0.024));
  return d;
}

function handSdf(x, y, z) {
  let d = 1e9;
  for (const g of GRIP) {
    const s = Math.sign(g[0]);
    d = smin(d, sdEll(x, y, z, g[0] + s * 0.012, g[1] - 0.012, g[2] - 0.028, 0.03, 0.036, 0.03), 0.02);
    for (let k = 0; k < 4; k++) {
      const off = (k - 1.5) * 0.017;
      const bx = g[0] + s * 0.008 + UPW[0] * off, by = g[1] - 0.006 + UPW[1] * off, bz = g[2] - 0.02 + UPW[2] * off;
      d = smin(d, sdRoundCone(x, y, z, bx, by, bz, bx - s * 0.016, by + 0.018, bz + 0.03, 0.0085, 0.0065), 0.008);
      d = smin(d, sdRoundCone(x, y, z, bx - s * 0.016, by + 0.018, bz + 0.03, bx - s * 0.03, by - 0.002, bz + 0.042, 0.0065, 0.005), 0.006);
    }
    d = smin(d, sdRoundCone(x, y, z, g[0] - s * 0.01, g[1] - 0.03, g[2] - 0.05, g[0] - s * 0.035, g[1] + 0.01, g[2] - 0.005, 0.009, 0.007), 0.01);
  }
  return d;
}

function armSdf(x, y, z) {
  const s = x >= 0 ? 1 : -1;
  let d = sdRoundCone(x, y, z, 0.19 * s, 0.155, -0.04, 0.25 * s, -0.085, 0.1, 0.06, 0.052);
  d = smin(d, sdRoundCone(x, y, z, 0.25 * s, -0.085, 0.1, 0.19 * s, 0.07, 0.36, 0.05, 0.04), 0.03);
  d = smin(d, sdRoundCone(x, y, z, 0.19 * s, 0.07, 0.36, 0.178 * s, 0.093, 0.398, 0.03, 0.024), 0.015);
  return d;
}

function torsoSdf(x, y, z) {
  let d = sdEll(x, y, z, 0, 0.05, -0.02, 0.2, 0.19, 0.13);
  d = smin(d, sdRoundCone(x, y, z, -0.18, 0.16, -0.045, 0.18, 0.16, -0.045, 0.065, 0.065), 0.08);
  d = smin(d, sdEll(x, y, z, 0, -0.18, 0.005, 0.185, 0.18, 0.145), 0.08);
  d = smin(d, sdEll(x, y, z, 0, -0.34, -0.02, 0.19, 0.1, 0.15), 0.06);
  d = smin(d, chain(x, y, z, TAIL, 0.05), 0.08);
  d += vn3(x * 14, y * 5, z * 14) * 0.006;
  return d;
}

function skullSdf(x, y, z) {
  let d = sdEll(x, y, z, 0, 0.445, 0.04, 0.088, 0.1, 0.098);
  d = smin(d, sdEll(x, y, z, 0, 0.4, 0.083, 0.058, 0.05, 0.058), 0.03);
  d = smin(d, sdEll(x, y, z, 0, 0.35, 0.085, 0.052, 0.034, 0.052), 0.025);
  d = smin(d, sdEll(x, y, z, 0, 0.468, 0.108, 0.07, 0.018, 0.03), 0.02);
  for (const s of [1, -1]) {
    d = smin(d, sdEll(x, y, z, 0.055 * s, 0.418, 0.103, 0.03, 0.02, 0.028), 0.015);
    d = smin(d, sdEll(x, y, z, 0.09 * s, 0.428, 0.032, 0.012, 0.027, 0.018), 0.012);
    d = smax(d, -sdEll(x, y, z, 0.066 * s, 0.383, 0.11, 0.022, 0.028, 0.028), 0.018);
  }
  d = smin(d, sdRoundCone(x, y, z, 0, 0.215, -0.012, 0, 0.36, 0.03, 0.045, 0.04), 0.03);
  d += vn3(x * 90, y * 90, z * 90) * 0.0022 + vn3(x * 30, y * 30, z * 30) * 0.003;
  return d;
}

function carveSdf(x, y, z) {
  let d = sdEll(x, y, z, 0, 0.37, 0.122, 0.054, 0.017, 0.04);
  d = Math.min(d, sdEll(x, y, z, 0, 0.415, 0.138, 0.011, 0.018, 0.02));
  for (const s of [1, -1]) d = Math.min(d, sdSph(x, y, z, 0.034 * s, 0.445, 0.128, 0.024));
  return d;
}

function capSdf(x, y, z) {
  let c = sdEll(x, y, z, 0, 0.53, 0.032, 0.113, 0.05, 0.122);
  c = smax(c, -(y - 0.49), 0.01);
  c = smin(c, sdEll(x, y, z, 0, 0.506, 0.032, 0.1, 0.02, 0.108), 0.015);
  c = smin(c, sdRBoxT(x, y, z, 0, 0.5, 0.13, 0.075, 0.007, 0.05, 0.006, 0), 0.015);
  return c + vn3(x * 40, y * 40, z * 40) * 0.0015;
}

function hairSdf(x, y, z) {
  let d = 1e9;
  for (const h of HAIR) {
    const bx = h[0] * 0.088, bz = h[1];
    d = Math.min(d, sdRoundCone(x, y, z, bx, 0.49, bz, bx * 1.12 + h[2], 0.37 + Math.abs(h[2]) * 2, bz - 0.03, 0.014, 0.006));
  }
  return d;
}

function collarSdf(x, y, z) {
  let d = 1e9;
  for (const s of [1, -1]) d = Math.min(d, sdRBoxT(x, y, z, 0.045 * s, 0.245, 0.06, 0.04, 0.026, 0.008, 0.006, 0.5 * s));
  return d;
}

function teethSdf(x, y, z) {
  let d = 1e9;
  for (const q of TEETH) d = Math.min(d, sdRBoxT(x, y, z, q[0], q[1], q[2], q[3], q[4], q[5], 0.003, q[6]));
  return d;
}

function eyesSdf(x, y, z) {
  return Math.min(sdSph(x, y, z, EYE_L[0], EYE_L[1], EYE_L[2], EYE_LR), sdSph(x, y, z, EYE_R[0], EYE_R[1], EYE_R[2], EYE_RR));
}

function driverBase(x, y, z) {
  let d = smin(torsoSdf(x, y, z), armSdf(x, y, z), 0.03);
  d = smin(d, handSdf(x, y, z), 0.012);
  if (y > 0.18) {
    let h = smax(skullSdf(x, y, z), -carveSdf(x, y, z), 0.006);
    h = smin(h, capSdf(x, y, z), 0.006);
    h = smin(h, hairSdf(x, y, z), 0.008);
    d = smin(d, h, 0.025);
    d = smin(d, collarSdf(x, y, z), 0.01);
  }
  return d;
}

export function sdf(x, y, z) {
  let d = driverBase(x, y, z);
  d = Math.min(d, sdWheel(x, y, z));
  if (y > 0.3) d = Math.min(d, teethSdf(x, y, z), eyesSdf(x, y, z));
  return d;
}

function classify(x, y, z) {
  if (y > 0.3) {
    if (eyesSdf(x, y, z) < 0.0015) return 4;
    if (teethSdf(x, y, z) < 0.0015) return 3;
  }
  if (sdWheel(x, y, z) < 0.003) return 6;
  if (y > 0.2) {
    if (y > 0.47 && capSdf(x, y, z) < 0.004) return 2;
    if (hairSdf(x, y, z) < 0.003) return 7;
    if (collarSdf(x, y, z) < 0.004) return 9;
    if (y > 0.3 && carveSdf(x, y, z) < 0.006) return 5;
    if (y > 0.235) return 1;
  }
  if (z > 0.37 || handSdf(x, y, z) < 0.004) return 1;
  return 0;
}

function attr(x, y, z, nx, ny, nz, o) {
  const mat = classify(x, y, z);
  const head = mat === 6 ? 0 : clamp((y - 0.24) / 0.05, 0, 1) * (z < 0.3 ? 1 : 0);
  let jaw = 0;
  if (head > 0.5 && y < 0.37 && z > 0.04 && Math.abs(x) < 0.07) jaw = clamp((0.369 - y) / 0.008, 0, 1) * clamp((z - 0.04) / 0.03, 0, 1) * clamp((y - 0.3) / 0.02, 0, 1);
  if (mat === 3) { const q = TEETH.reduce((b, t) => (Math.hypot(x - t[0], y - t[1], z - t[2]) < Math.hypot(x - b[0], y - b[1], z - b[2]) ? t : b)); jaw = q[7]; }
  let steer = 0;
  if (mat === 6 || handSdf(x, y, z) < 0.01) steer = 1;
  else if (Math.abs(x) > 0.1 && y < 0.2 && y > -0.2) steer = clamp((z - 0.12) / 0.22, 0, 1);
  const lean = mat === 6 ? 0.6 : clamp((y + 0.32) / 0.4, 0, 1);
  const tail = clamp((-0.42 - y) / 0.4, 0, 1) * clamp((0.1 - z) / 0.3, 0, 1);
  const hair = mat === 7 ? clamp((0.48 - y) / 0.1, 0, 1) : 0;
  const rot = clamp(fbm(x * 18, y * 18, z * 18) * 1.1 + 0.5, 0, 1);
  const skin = clamp(fbm(x * 6 + 3, y * 6, z * 6) * 0.8 + 0.5, 0, 1);
  o[0] = head; o[1] = jaw; o[2] = steer; o[3] = lean;
  o[4] = tail; o[5] = hair; o[6] = rot; o[7] = skin;
  o[8] = mat;
  const k = mat === 1 ? 0.9 : mat === 0 ? 0.45 : mat === 2 ? 0.3 : 0.15;
  o[9] = (vn3(x * 60, y * 60, z * 60) * 0.6 + vn3(x * 160, y * 160, z * 160) * 0.4) * k;
  o[10] = (vn3(x * 60 + 7, y * 60 + 7, z * 60 + 7) * 0.6 + vn3(x * 160 + 5, y * 160 + 5, z * 160 + 5) * 0.4) * k;
  o[11] = (vn3(x * 60 + 13, y * 60 + 13, z * 60 + 13) * 0.6 + vn3(x * 160 + 9, y * 160 + 9, z * 160 + 9) * 0.4) * k;
}

export function cabSdf(x, y, z) {
  const cx = CAB_X;
  let d = sdBox(x, y, z, cx, G + 0.6, -0.25, 0.98, 0.32, 2.45, 0.11);
  let gh = sdBox(x, y, z, cx, G + 1.24, -0.6, 0.86, 0.33, 1.2, 0.07);
  gh = smax(gh, (y - (G + 0.92)) * 0.575 + (z - 0.62) * 0.818, 0.05);
  gh = smax(gh, (y - (G + 0.92)) * 0.53 - (z + 1.98) * 0.848, 0.05);
  d = smin(d, gh, 0.06);
  for (const az of AXLES) for (const s of [1, -1]) d = smax(d, -sdCylX(x, y, z, cx + s * 0.86, G + WHEEL_RAD, az, 0.43, 0.24, 0.03), 0.03);
  for (const az of AXLES) for (const s of [1, -1]) d = Math.min(d, sdCylX(x, y, z, cx + s * 0.84, G + WHEEL_RAD, az, WHEEL_RAD, 0.115, 0.05));
  d = Math.min(d, sdBox(x, y, z, cx, G + 0.42, 2.25, 1.0, 0.065, 0.07, 0.04));
  d = Math.min(d, sdBox(x, y, z, cx, G + 0.42, -2.75, 1.0, 0.065, 0.07, 0.04));
  d = Math.min(d, sdBox(x, y, z, cx, G + 1.74, -0.6, 0.05, 0.13, 0.44, 0.025));
  d = smin(d, sdBox(x, y, z, cx, G + 1.6, -0.6, 0.1, 0.03, 0.3, 0.02), 0.03);
  return d;
}

function cabAttr(x, y, z, nx, ny, nz, o) {
  o[8] = 8;
  o[6] = clamp(fbm(x * 3, y * 3, z * 3) + 0.5, 0, 1);
  o[7] = clamp(vn3(x * 9, y * 9, z * 9) * 0.5 + 0.5, 0, 1);
}

const inHands = (x, y, z) => z > 0.335 && y > -0.12;

export function buildCab(res = 'md') {
  const c = (CELLS[res] || CELLS.md)[3];
  return sculpt({ sdf: cabSdf, bounds: [CAB_X - 1.08, G - 0.02, -2.9, CAB_X + 1.08, G + 1.92, 2.4], cell: c, layout: LAYOUT, attr: cabAttr });
}

export function build(res = 'md') {
  const [body, head, hands] = CELLS[res] || CELLS.md;
  const parts = [
    sculpt({ sdf, bounds: [-0.36, -0.95, -0.76, 0.36, 0.26, 0.4], cell: body, layout: LAYOUT, attr, keep: (x, y, z) => y < 0.248 && !inHands(x, y, z) }),
    sculpt({ sdf, bounds: [-0.15, 0.22, -0.11, 0.15, 0.6, 0.2], cell: head, layout: LAYOUT, attr, keep: (x, y) => y > 0.232 }),
    sculpt({ sdf, bounds: [-0.25, -0.13, 0.3, 0.25, 0.25, 0.56], cell: hands, layout: LAYOUT, attr, keep: (x, y, z) => inHands(x, y, z) && y < 0.25 }),
  ];
  const driver = merge(parts);
  const cab = buildCab(res);
  const m = merge([driver, cab]);
  m.split = driver.index.length;
  return m;
}
