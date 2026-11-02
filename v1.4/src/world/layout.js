// Plate layout: a 1984 Manhattan corner (avenue N-S, street E-W), blocks, lamps, prop placements, spawns, surfaces.
export const PLATE = { half: 55, size: 110, slabDepth: 3.2, bevel: 0.45 };
export const SIDEWALK_H = 0.15;
export const AVE = { x0: -10, x1: 10, walk: 5 };
export const ST = { z0: -6, z1: 6, walk: 4.5 };
export const FACADE = { w: AVE.x0 - AVE.walk, e: AVE.x1 + AVE.walk, n: ST.z0 - ST.walk, s: ST.z1 + ST.walk };
export const CURB_R = 3.2;
export const GROUND_FLOOR = 4.3;
export const FLOOR = 3.15;

export const G_STATIC = 0x0001, G_PROP = 0x0002, G_PLAYER = 0x0004, G_VEHICLE = 0x0008,
  G_DEBRIS = 0x0010, G_GHOST = 0x0020, G_TRAP = 0x0040, G_SENSOR = 0x0080;
export const groups = (member, filter) => ((member << 16) | filter) >>> 0;
export const GROUP_STATIC = groups(G_STATIC, 0xffff);
export const GROUP_PROP = groups(G_PROP, 0xffff);
export const GROUP_DEBRIS = groups(G_DEBRIS, G_STATIC | G_PROP | G_VEHICLE);
export const GROUP_EDGE = groups(G_STATIC, G_PLAYER | G_VEHICLE);

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = FACADE.w, E = FACADE.e, N = FACADE.n, S = FACADE.s, H = PLATE.half - 0.5;

export const BUILDINGS = [
  { id: 'nw_corner', face: [{ dir: 'e', a: N - 19, b: N }, { dir: 's', a: W - 16, b: W }], box: [W - 16, N - 19, W, N], floors: 6, brick: 'red', base: 'stone', shop: [{ dir: 's', sign: 'tavern', blade: 'bar_v', lit: 1, kind: 'bar' }, { dir: 'e', sign: 'liquors', lit: 1, kind: 'liquor', window: 'open' }], fire: ['s'], cornice: 'deep', corner: true },
  { id: 'nw_ave_1', face: [{ dir: 'e', a: N - 30, b: N - 19 }], box: [W - 14, N - 30, W, N - 19], floors: 5, brick: 'dark', shop: [{ dir: 'e', sign: 'shoe', lit: 0, kind: 'closed' }], fire: ['e'], cornice: 'bracket' },
  { id: 'nw_hotel', face: [{ dir: 'e', a: -H, b: N - 30 }], box: [W - 20, -H, W, N - 30], floors: 8, brick: 'buff', base: 'stone', shop: [{ dir: 'e', sign: 'hotel_fascia', blade: 'hotel_v', lit: 0.8, kind: 'lobby', window: 'rooms' }], cornice: 'deep', water: true, ad: 's' },
  { id: 'nw_st_1', face: [{ dir: 's', a: W - 27, b: W - 16 }], box: [W - 27, N - 18, W - 16, N], floors: 4, brick: 'orange', shop: [{ dir: 's', sign: 'hardware', lit: 0, kind: 'closed' }], fire: ['s'], cornice: 'bracket' },
  { id: 'nw_st_2', face: [{ dir: 's', a: -H, b: W - 27 }], box: [-H, N - 22, W - 27, N], floors: 5, brick: 'red', shop: [{ dir: 's', sign: 'records', lit: 1, kind: 'records' }], fire: ['s'], cornice: 'simple', water: true },
  { id: 'nw_back', face: [], box: [-H, -H, W - 20, N - 22], floors: 6, brick: 'dark', cornice: 'none', back: true },
  { id: 'ne_corner', face: [{ dir: 'w', a: N - 17, b: N }, { dir: 's', a: E, b: E + 15 }], box: [E, N - 17, E + 15, N], floors: 5, brick: 'orange', shop: [{ dir: 's', sign: 'deli', lit: 1, kind: 'deli', awning: 'green' }, { dir: 'w', sign: 'checks', lit: 1, kind: 'office' }], fire: ['s'], cornice: 'bracket', corner: true },
  { id: 'ne_st_1', face: [{ dir: 's', a: E + 15, b: E + 25 }], box: [E + 15, N - 18, E + 25, N], floors: 4, brick: 'red', shop: [{ dir: 's', sign: 'pizza', lit: 1, kind: 'pizza', window: 'pizza_neon', awning: 'red' }], fire: ['s'], cornice: 'simple' },
  { id: 'ne_st_2', face: [{ dir: 's', a: E + 25, b: H }], box: [E + 25, N - 20, H, N], floors: 6, brick: 'buff', base: 'stone', shop: [{ dir: 's', sign: 'laundromat', lit: 0, kind: 'closed' }], fire: ['s'], cornice: 'deep', water: true },
  { id: 'ne_ave_1', face: [{ dir: 'w', a: N - 30, b: N - 17 }], box: [E, N - 30, E + 16, N - 17], floors: 6, brick: 'dark', shop: [{ dir: 'w', sign: 'pawn', lit: 0, kind: 'closed' }], fire: ['w'], cornice: 'bracket' },
  { id: 'ne_ave_2', face: [{ dir: 'w', a: -H, b: N - 30 }], box: [E, -H, E + 18, N - 30], floors: 7, brick: 'red', base: 'stone', shop: [{ dir: 'w', sign: 'cleaners', lit: 0, kind: 'cleaners' }], cornice: 'deep' },
  { id: 'ne_back', face: [], box: [E + 16, -H, H, N - 20], floors: 5, brick: 'red', cornice: 'none', back: true },
  { id: 'sw_corner', face: [{ dir: 'e', a: S, b: S + 17 }, { dir: 'n', a: W - 15, b: W }], box: [W - 15, S, W, S + 17], floors: 5, brick: 'buff', base: 'stone', shop: [{ dir: 'n', sign: 'coffee', lit: 1, kind: 'diner', window: 'open' }, { dir: 'e', sign: 'coffee', lit: 1, kind: 'diner' }], fire: ['n'], cornice: 'deep', corner: true },
  { id: 'sw_ave_1', face: [{ dir: 'e', a: S + 17, b: S + 28 }], box: [W - 15, S + 17, W, S + 28], floors: 4, brick: 'red', shop: [{ dir: 'e', sign: 'bakery', lit: 0.7, kind: 'bakery', awning: 'blue' }], fire: ['e'], cornice: 'bracket' },
  { id: 'sw_ave_2', face: [{ dir: 'e', a: S + 28, b: H }], box: [W - 18, S + 28, W, H], floors: 6, brick: 'orange', shop: [{ dir: 'e', sign: 'checks', lit: 0, kind: 'closed' }], fire: ['e'], cornice: 'simple', water: true },
  { id: 'sw_st_1', face: [{ dir: 'n', a: W - 27, b: W - 15 }], box: [W - 27, S, W - 15, S + 18], floors: 4, brick: 'dark', shop: [{ dir: 'n', sign: 'cleaners', lit: 0, kind: 'closed' }], fire: ['n'], cornice: 'bracket' },
  { id: 'sw_st_2', face: [{ dir: 'n', a: -H, b: W - 27 }], box: [-H, S, W - 27, S + 20], floors: 5, brick: 'red', shop: [{ dir: 'n', sign: 'hardware', lit: 0, kind: 'closed' }], fire: ['n'], cornice: 'simple' },
  { id: 'sw_back', face: [], box: [-H, S + 20, W - 18, H], floors: 4, brick: 'dark', cornice: 'none', back: true },
];

export const LAMP = { height: 9.2, arm: 2.6, color: [1.0, 0.62, 0.34], intensity: 300, range: 21, angle: 1.15, penumbra: 0.8 };
export const MERC_COLOR = [0.78, 0.92, 1.0];
export const PARK_LAMP = { height: 4.1, color: [0.78, 0.95, 0.86], intensity: 70, range: 13, angle: 1.5, penumbra: 0.9 };

export const LAMPS = [
  { pole: [AVE.x0 - 0.55, -36], dir: [1, 0], type: 'cobra', merc: true },
  { pole: [AVE.x0 - 0.55, -12.5], dir: [1, 0], type: 'cobra' },
  { pole: [AVE.x0 - 0.55, 20], dir: [1, 0], type: 'cobra', merc: true },
  { pole: [AVE.x0 - 0.55, 46], dir: [1, 0], type: 'cobra' },
  { pole: [AVE.x1 + 0.55, -24], dir: [-1, 0], type: 'cobra' },
  { pole: [AVE.x1 + 0.55, 12.4], dir: [-1, 0], type: 'cobra' },
  { pole: [AVE.x1 + 0.55, 29.5], dir: [-1, 0], type: 'cobra' },
  { pole: [AVE.x1 + 0.55, 50], dir: [-1, 0], type: 'cobra', merc: true },
  { pole: [-32, ST.z0 - 0.55], dir: [0, 1], type: 'cobra', merc: true },
  { pole: [34, ST.z0 - 0.55], dir: [0, 1], type: 'cobra', merc: true },
  { pole: [-44, ST.z1 + 0.55], dir: [0, -1], type: 'cobra' },
  { pole: [29, ST.z1 + 0.55], dir: [0, -1], type: 'cobra' },
  { pole: [27, 27], dir: [0, 0], type: 'park' },
  { pole: [43, 21], dir: [0, 0], type: 'park' },
  { pole: [36, 44], dir: [0, 0], type: 'park' },
  { pole: [21, 39], dir: [0, 0], type: 'park' },
];

export const SIGNALS = [
  { pos: [AVE.x1 + 0.7, ST.z1 + 0.7], faces: ['n', 'w'] },
  { pos: [AVE.x0 - 0.7, ST.z0 - 0.7], faces: ['s', 'e'] },
  { pos: [AVE.x0 - 0.7, ST.z1 + 0.7], faces: ['n', 'e'] },
  { pos: [AVE.x1 + 0.7, ST.z0 - 0.7], faces: ['s', 'w'] },
];

export const MANHOLES = [
  { pos: [-4.5, -20], steam: 1 },
  { pos: [3.2, 26], steam: 0 },
  { pos: [-22, 1.8], steam: 1 },
  { pos: [24, -1.6], steam: 0 },
  { pos: [2.4, -1.2], steam: 0.6 },
];
export const CONED_STACK = { pos: [-4.5, -20] };
export const GRATES = [
  { box: [AVE.x0 - 4.3, -45, AVE.x0 - 2.9, -40.5], kind: 'subway' },
  { box: [AVE.x1 + 2.6, 30, AVE.x1 + 4.0, 34.5], kind: 'subway' },
  { box: [W - 6.0, ST.z0 - 4.2, W - 3.6, ST.z0 - 2.9], kind: 'cellar' },
  { box: [E + 4.0, ST.z0 - 4.2, E + 6.4, ST.z0 - 2.9], kind: 'cellar' },
  { box: [W + 0.6, S + 6.0, W + 1.9, S + 8.4], kind: 'cellar' },
];
export const DRAINS = [[AVE.x0 + 0.35, ST.z0 - 4.6, 0], [AVE.x1 - 0.35, ST.z1 + 4.6, 0], [AVE.x0 - 4.6, ST.z1 - 0.35, 1], [AVE.x1 + 4.6, ST.z0 + 0.35, 1]];

export const PARK = {
  box: [E, S, H, H],
  beds: [[E + 4.5, S + 14, E + 13, S + 26], [E + 19, S + 6.5, E + 33, S + 12.5], [E + 22, S + 22, E + 34, S + 36], [E + 6, S + 32, E + 14, S + 40]],
  trees: [[E + 8.5, S + 18], [E + 9.6, S + 23.4], [E + 24, S + 9.5], [E + 30.5, S + 9.4], [E + 26, S + 27], [E + 31, S + 32.5], [E + 10, S + 36]],
};

export const ECTO = { pos: [AVE.x1 - 1.25, 0, 24.5], yaw: Math.PI, length: 6.3, width: 2.1 };
export const HOTDOG = { pos: [E + 2.6, S + 2.2], yaw: -0.55 };

export const PROPS = [
  { kind: 'trashcan', at: [AVE.x0 - 0.75, -15.2] }, { kind: 'trashcan', at: [AVE.x0 - 0.8, -16.1] },
  { kind: 'trashcan', at: [AVE.x1 + 0.85, 7.9] }, { kind: 'trashcan', at: [W + 0.7, 13.6] },
  { kind: 'trashcan', at: [E + 0.8, -12.4] }, { kind: 'trashcan', at: [E + 1.6, -12.1] },
  { kind: 'trashbag', at: [AVE.x0 - 0.7, -17.2] }, { kind: 'trashbag', at: [AVE.x0 - 1.3, -17.6] }, { kind: 'trashbag', at: [AVE.x0 - 0.9, -18.3] },
  { kind: 'trashbag', at: [E + 2.6, -12.3] }, { kind: 'trashbag', at: [E + 3.1, -11.9] }, { kind: 'trashbag', at: [W + 0.8, 14.8] },
  { kind: 'trashbag', at: [W + 1.2, 15.5] }, { kind: 'trashbag', at: [-23, ST.z1 + 0.7] },
  { kind: 'crate', at: [W + 1.0, -21.5], rot: 0.1 }, { kind: 'crate', at: [W + 1.05, -22.2], rot: -0.05, stack: 1 },
  { kind: 'crate', at: [W + 1.7, -22.4], rot: 0.3 }, { kind: 'crate', at: [E + 1.0, -20.5], rot: 0.2 },
  { kind: 'crate', at: [E + 1.1, -21.3], rot: -0.1 }, { kind: 'crate', at: [-26.5, S + 0.9], rot: 0.05 },
  { kind: 'pallet', at: [E + 0.3, -19.3], rot: 1.57, lean: 1 }, { kind: 'pallet', at: [-27.8, S + 0.25], rot: 0, lean: 1 },
  { kind: 'cardboard', at: [W + 1.6, -20.8], rot: 0.4 }, { kind: 'cardboard', at: [W + 2.1, -21.2], rot: 1.1 },
  { kind: 'cardboard', at: [E + 1.9, -21.4], rot: 0.2 }, { kind: 'cardboard', at: [-25.6, S + 1.0], rot: 0.7 },
  { kind: 'cardboard', at: [AVE.x0 - 1.6, -18.1], rot: 0.3 }, { kind: 'cardboard', at: [W + 2.3, 15.1], rot: 0.9 },
  { kind: 'sawhorse', at: [-4.8, -15.6], rot: 0.15 }, { kind: 'sawhorse', at: [-1.5, -15.2], rot: -0.08 },
  { kind: 'sawhorse', at: [-7.0, -23.8], rot: 1.45 }, { kind: 'sawhorse', at: [-2.2, -24.6], rot: 0.05 },
  { kind: 'cone', at: [-6.6, -17.6] }, { kind: 'cone', at: [-6.8, -21.5] }, { kind: 'cone', at: [-2.0, -18.4] },
  { kind: 'cone', at: [-1.8, -22.2] }, { kind: 'cone', at: [5.9, 31.8] }, { kind: 'cone', at: [6.4, 33.6] },
  { kind: 'newsbox', at: [AVE.x1 + 0.75, -7.6], rot: -Math.PI / 2, v: 0 }, { kind: 'newsbox', at: [AVE.x1 + 0.75, -8.35], rot: -Math.PI / 2, v: 1 },
  { kind: 'newsbox', at: [AVE.x0 - 0.75, 8.2], rot: Math.PI / 2, v: 2 },
  { kind: 'mailbox', at: [AVE.x1 + 0.9, 9.6], rot: -Math.PI / 2 },
  { kind: 'phonebooth', at: [AVE.x0 - 0.95, -9.3], rot: Math.PI / 2 },
  { kind: 'hydrant', at: [AVE.x1 + 0.6, 17.2], rot: -Math.PI / 2 }, { kind: 'hydrant', at: [-19.5, ST.z0 - 0.55], rot: 0 },
  { kind: 'bench', at: [E + 7.5, S + 12.0], rot: 0 }, { kind: 'bench', at: [E + 17.5, S + 15.2], rot: -Math.PI / 2 },
  { kind: 'bench', at: [E + 16.6, S + 29], rot: Math.PI / 2 },
  { kind: 'barrel', at: [-25.2, ST.z1 + 0.9] }, { kind: 'barrel', at: [E + 3.6, -13.0] },
  { kind: 'meter', at: [AVE.x1 + 0.45, 21.0] }, { kind: 'meter', at: [AVE.x1 + 0.45, 28.5] },
  { kind: 'meter', at: [AVE.x0 - 0.45, 27.0] }, { kind: 'meter', at: [AVE.x0 - 0.45, -27.5] },
  { kind: 'stack', at: [-4.5, -20.0] },
];

export const GHOST_ROUTE = [
  [E + 2.6, 2.6, S + 2.2], [6, 3.4, 13], [-3, 4.6, 8], [-8, 3.0, -1], [-5, 2.4, -12],
  [-4, 4.2, -21], [3, 5.6, -26], [7.5, 3.2, -14], [2, 2.6, -4], [6, 4.0, 4], [14, 5.5, 15], [22, 3.2, 20], [16, 2.3, 18],
];

export function faceFrame(b, f) {
  const [x0, z0, x1, z1] = b.box;
  switch (f.dir) {
    case 'e': return { O: [x1, f.b], u: [0, -1], n: [1, 0], W: f.b - f.a };
    case 'w': return { O: [x0, f.a], u: [0, 1], n: [-1, 0], W: f.b - f.a };
    case 's': return { O: [f.a, z1], u: [1, 0], n: [0, 1], W: f.b - f.a };
    default: return { O: [f.b, z0], u: [-1, 0], n: [0, -1], W: f.b - f.a };
  }
}

export const SHOP_LIGHT = {
  bar: [1.0, 0.5, 0.26], liquor: [1.0, 0.32, 0.25], lobby: [1.0, 0.72, 0.42], records: [1.0, 0.45, 0.8], deli: [0.86, 0.95, 1.0],
  office: [0.82, 0.92, 1.0], pizza: [1.0, 0.72, 0.42], diner: [1.0, 0.86, 0.66], bakery: [1.0, 0.86, 0.62], cleaners: [0.85, 0.93, 1.0],
};

export function streetSurface(x, z) {
  const half = PLATE.half;
  if (Math.abs(x) > half || Math.abs(z) > half) return 'void';
  if ((x > AVE.x0 && x < AVE.x1) || (z > ST.z0 && z < ST.z1)) return 'road';
  const cx = x < 0 ? AVE.x0 : AVE.x1, cz = z < 0 ? ST.z0 : ST.z1;
  const ox = x < 0 ? cx - CURB_R : cx + CURB_R, oz = z < 0 ? cz - CURB_R : cz + CURB_R;
  const inSq = (x < 0 ? x > ox : x < ox) && (z < 0 ? z > oz : z < oz);
  if (inSq && Math.hypot(x - ox, z - oz) > CURB_R) return 'road';
  if (x > PARK.box[0] && z > PARK.box[1]) return 'park';
  const inBlock = (x < FACADE.w || x > FACADE.e) && (z < FACADE.n || z > FACADE.s);
  return inBlock ? 'building' : 'walk';
}

export function curbOutline(qx, qz, segs = 10, inset = 0, far = PLATE.half) {
  const cx = qx < 0 ? AVE.x0 : AVE.x1, cz = qz < 0 ? ST.z0 : ST.z1;
  const ox = cx + qx * CURB_R, oz = cz + qz * CURB_R, r = CURB_R - inset;
  const pts = [[cx + qx * inset, qz * far]];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI / 2;
    pts.push([ox - qx * r * Math.cos(a), oz - qz * r * Math.sin(a)]);
  }
  pts.push([qx * far, cz + qz * inset]);
  return pts;
}

export function curbDist(x, z) {
  let d = 99;
  for (const qx of [-1, 1]) for (const qz of [-1, 1]) {
    const cx = qx < 0 ? AVE.x0 : AVE.x1, cz = qz < 0 ? ST.z0 : ST.z1;
    const ox = cx + qx * CURB_R, oz = cz + qz * CURB_R;
    const ez = (z - oz) * qz;
    d = Math.min(d, ez >= 0 ? Math.abs(x - cx) : Math.hypot(x - cx, z - oz));
    const ex = (x - ox) * qx;
    d = Math.min(d, ex >= 0 ? Math.abs(z - cz) : Math.hypot(x - ox, z - cz));
    if ((x - ox) * qx <= 0 && (z - oz) * qz <= 0) d = Math.min(d, Math.abs(Math.hypot(x - ox, z - oz) - CURB_R));
  }
  return d;
}

export function facadeDist(x, z) {
  let d = 99;
  for (const qx of [-1, 1]) for (const qz of [-1, 1]) {
    if (qx > 0 && qz > 0) continue;
    const fx = qx < 0 ? FACADE.w : FACADE.e, fz = qz < 0 ? FACADE.n : FACADE.s;
    const ex = Math.max(0, qx * (fx - x)), ez = Math.max(0, qz * (fz - z));
    d = Math.min(d, Math.hypot(ex, ez));
  }
  return d;
}
