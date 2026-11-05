// Swarm vapour ghost sculpt (no three.js): small sheet-like wisp with hollow eyes, an O mouth, stubby arms and a curling tail.
import { sdEll, sdRoundCone, smin, smax, clamp, vn3, fbm, chain, sculpt } from '../sculpt.js';

export const EYES = [[0.046, 0.032, 0.1], [-0.046, 0.032, 0.1]];
export const MOUTH = [0, -0.05, 0.108];
const TAIL = [[0, -0.03, -0.01, 0.125], [0, -0.14, -0.06, 0.09], [0.025, -0.24, -0.14, 0.055], [0.06, -0.3, -0.24, 0.028], [0.085, -0.31, -0.33, 0.009]];

export const LAYOUT = [
  { name: 'aW1', size: 4, type: 'i8' },
  { name: 'aW2', size: 4, type: 'u8' },
  { name: 'aMat', size: 1, type: 'u8i' },
  { name: 'aBump', size: 3, type: 'i8' },
];
export const CELLS = { lo: 0.017, md: 0.013, hi: 0.0095 };

function body(x, y, z) {
  let d = sdEll(x, y, z, 0, 0.01, 0, 0.13, 0.14, 0.12);
  d = smin(d, chain(x, y, z, TAIL, 0.04), 0.07);
  for (const s of [1, -1]) d = smin(d, sdRoundCone(x, y, z, 0.1 * s, -0.04, 0.01, 0.185 * s, 0.005, 0.07, 0.04, 0.02), 0.04);
  return d + fbm(x * 9, y * 9, z * 9) * 0.008;
}

function eyesCut(x, y, z) {
  let d = 1e9;
  for (const e of EYES) d = Math.min(d, sdEll(x, y, z, e[0], e[1], e[2], 0.028, 0.038, 0.034));
  return d;
}

function mouthCut(x, y, z) { return sdEll(x, y, z, MOUTH[0], MOUTH[1], MOUTH[2], 0.03, 0.036, 0.034); }

export function sdf(x, y, z) {
  let d = body(x, y, z);
  d = smax(d, -eyesCut(x, y, z), 0.012);
  d = smax(d, -mouthCut(x, y, z), 0.012);
  return d;
}

function attr(x, y, z, nx, ny, nz, o) {
  const e = eyesCut(x, y, z), m = mouthCut(x, y, z);
  const mat = e < 0.008 ? 1 : m < 0.008 ? 2 : 0;
  const tail = clamp((-0.06 - y) / 0.25, 0, 1) * clamp((0.05 - z) / 0.2, 0, 1);
  const s = x >= 0 ? 1 : -1;
  const arm = clamp((Math.abs(x) - 0.11) / 0.05, 0, 1) * clamp((0.06 - Math.abs(y + 0.02)) / 0.04, 0, 1) * s;
  const mouth = clamp(1 - Math.abs(m) / 0.035, 0, 1) * (z > 0.06 ? 1 : 0);
  o[0] = tail; o[1] = arm; o[2] = mouth; o[3] = clamp(1 - Math.abs(e) / 0.03, 0, 1);
  o[4] = clamp(fbm(x * 12, y * 12, z * 12) * 0.9 + 0.5, 0, 1); o[5] = clamp((y + 0.35) / 0.5, 0, 1); o[6] = 0; o[7] = 0;
  o[8] = mat;
  o[9] = vn3(x * 40, y * 40, z * 40) * 0.5; o[10] = vn3(x * 40 + 7, y * 40 + 7, z * 40 + 7) * 0.5; o[11] = vn3(x * 40 + 13, y * 40 + 13, z * 40 + 13) * 0.5;
}

export function build(res = 'md') {
  return sculpt({ sdf, bounds: [-0.24, -0.36, -0.4, 0.24, 0.19, 0.17], cell: CELLS[res] || CELLS.md, layout: LAYOUT, attr });
}
