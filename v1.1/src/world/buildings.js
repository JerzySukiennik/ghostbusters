// Facades: brick tenements with real window openings, interior-mapped lit rooms, storefronts, signs, awnings, shutters, fire escapes, cornices, roofs, water towers.
import { BUILDINGS, SIDEWALK_H, GROUND_FLOOR, FLOOR, PLATE, FACADE, faceFrame, rng, GROUP_STATIC } from './layout.js';
import { patchMaterial } from './materials.js';

const UP = [0, 1, 0];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

class Builder {
  constructor(extras = {}) {
    this.p = []; this.n = []; this.uv = []; this.c = [];
    this.ex = {};
    for (const k in extras) this.ex[k] = { size: extras[k], data: [] };
    this.cur = {};
    this.col = [1, 1, 1];
  }
  vert(p, n, uv, ex) {
    this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.uv.push(uv[0], uv[1]);
    this.c.push(this.col[0], this.col[1], this.col[2]);
    for (const k in this.ex) {
      const e = this.ex[k], v = (ex && ex[k]) || this.cur[k];
      for (let i = 0; i < e.size; i++) e.data.push(v ? v[i] : 0);
    }
  }
  quad(a, b, c, d, n, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]], exs = null) {
    const cr = cross(sub(b, a), sub(c, a));
    if (dot(cr, n) < 0) { [b, d] = [d, b]; uvs = [uvs[0], uvs[3], uvs[2], uvs[1]]; if (exs) exs = [exs[0], exs[3], exs[2], exs[1]]; }
    const e = exs || [null, null, null, null];
    this.vert(a, n, uvs[0], e[0]); this.vert(b, n, uvs[1], e[1]); this.vert(c, n, uvs[2], e[2]);
    this.vert(a, n, uvs[0], e[0]); this.vert(c, n, uvs[2], e[2]); this.vert(d, n, uvs[3], e[3]);
  }
  boxW(c, ax, ay, az, hx, hy, hz, uvScale = 1, skip = '') {
    const P = (sx, sy, sz) => [c[0] + ax[0] * sx * hx + ay[0] * sy * hy + az[0] * sz * hz, c[1] + ax[1] * sx * hx + ay[1] * sy * hy + az[1] * sz * hz, c[2] + ax[2] * sx * hx + ay[2] * sy * hy + az[2] * sz * hz];
    const faces = [
      ['px', ax, [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]], hz, hy],
      ['nx', ax.map((v) => -v), [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]], hz, hy],
      ['py', ay, [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]], hx, hz],
      ['ny', ay.map((v) => -v), [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]], hx, hz],
      ['pz', az, [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], hx, hy],
      ['nz', az.map((v) => -v), [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], hx, hy],
    ];
    for (const [name, n, q, a, b] of faces) {
      if (skip.includes(name)) continue;
      const u = a * 2 * uvScale, v = b * 2 * uvScale;
      this.quad(P(...q[0]), P(...q[1]), P(...q[2]), P(...q[3]), n, [[0, 0], [u, 0], [u, v], [0, v]]);
    }
  }
  box(x0, y0, z0, x1, y1, z1, uvScale = 1, skip = '') {
    this.boxW([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1], (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, uvScale, skip);
  }
  build(THREE) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    for (const k in this.ex) g.setAttribute(k, new THREE.Float32BufferAttribute(this.ex[k].data, this.ex[k].size));
    g.computeBoundingSphere();
    return g;
  }
  get tris() { return this.p.length / 9; }
}

function fr(F, base = SIDEWALK_H) {
  const n3 = [F.n[0], 0, F.n[1]], u3 = [F.u[0], 0, F.u[1]];
  const P = (s, y, d) => [F.O[0] + F.u[0] * s + F.n[0] * d, base + y, F.O[1] + F.u[1] * s + F.n[1] * d];
  return { P, n3, u3, nn: [-n3[0], 0, -n3[2]], un: [-u3[0], 0, -u3[2]] };
}

function panel(B, f, s0, s1, y0, y1, d, uvMode = 'm') {
  const uvs = uvMode === 'm' ? [[s0, y0], [s1, y0], [s1, y1], [s0, y1]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
  B.quad(f.P(s0, y0, d), f.P(s1, y0, d), f.P(s1, y1, d), f.P(s0, y1, d), f.n3, uvs);
}

function fbox(B, f, s0, s1, y0, y1, d0, d1, skip = '') {
  const c = f.P((s0 + s1) / 2, (y0 + y1) / 2, (d0 + d1) / 2);
  B.boxW(c, f.u3, UP, f.n3, Math.abs(s1 - s0) / 2, Math.abs(y1 - y0) / 2, Math.abs(d1 - d0) / 2, 1, skip);
}

function wallWithOpenings(Bupper, Blower, f, W, H, openings, splitY) {
  const xs = new Set([0, W]), ys = new Set([0, H]);
  for (const o of openings) { xs.add(o.s0); xs.add(o.s1); ys.add(o.y0); ys.add(o.y1); }
  if (splitY) ys.add(splitY);
  const X = [...xs].filter((v) => v >= 0 && v <= W).sort((a, b) => a - b);
  const Y = [...ys].filter((v) => v >= 0 && v <= H).sort((a, b) => a - b);
  for (let j = 0; j < Y.length - 1; j++) {
    const y0 = Y[j], y1 = Y[j + 1], cy = (y0 + y1) / 2;
    const B = splitY && cy < splitY ? Blower : Bupper;
    let run = null;
    for (let i = 0; i < X.length - 1; i++) {
      const x0 = X[i], x1 = X[i + 1], cx = (x0 + x1) / 2;
      const hole = openings.some((o) => cx > o.s0 && cx < o.s1 && cy > o.y0 && cy < o.y1);
      if (!hole) { if (run) run[1] = x1; else run = [x0, x1]; }
      if ((hole || i === X.length - 2) && run) { panel(B, f, run[0], run[1], y0, y1, 0); run = null; }
    }
  }
  for (const o of openings) {
    const B = splitY && (o.y0 + o.y1) / 2 < splitY ? Blower : Bupper;
    const D = o.depth;
    B.quad(f.P(o.s0, o.y0, 0), f.P(o.s0, o.y0, -D), f.P(o.s0, o.y1, -D), f.P(o.s0, o.y1, 0), f.u3, [[o.s0, o.y0], [o.s0 + D, o.y0], [o.s0 + D, o.y1], [o.s0, o.y1]]);
    B.quad(f.P(o.s1, o.y0, 0), f.P(o.s1, o.y0, -D), f.P(o.s1, o.y1, -D), f.P(o.s1, o.y1, 0), f.un, [[o.s1, o.y0], [o.s1 + D, o.y0], [o.s1 + D, o.y1], [o.s1, o.y1]]);
    B.quad(f.P(o.s0, o.y1, 0), f.P(o.s1, o.y1, 0), f.P(o.s1, o.y1, -D), f.P(o.s0, o.y1, -D), [0, -1, 0], [[o.s0, o.y1], [o.s1, o.y1], [o.s1, o.y1 + D], [o.s0, o.y1 + D]]);
    if (o.y0 > 0.01) B.quad(f.P(o.s0, o.y0, 0), f.P(o.s1, o.y0, 0), f.P(o.s1, o.y0, -D), f.P(o.s0, o.y0, -D), [0, 1, 0], [[o.s0, o.y0], [o.s1, o.y0], [o.s1, o.y0 + D], [o.s0, o.y0 + D]]);
  }
}

const FRAME_COLS = [[0.62, 0.6, 0.55], [0.035, 0.035, 0.035], [0.05, 0.12, 0.07], [0.2, 0.11, 0.06], [0.22, 0.05, 0.04], [0.5, 0.48, 0.42]];
const TRIM_COLS = [[0.72, 0.68, 0.6], [0.6, 0.57, 0.5], [0.16, 0.17, 0.16], [0.3, 0.22, 0.16], [0.55, 0.5, 0.44]];
const WALLPAPER = [[0.72, 0.62, 0.45], [0.55, 0.62, 0.5], [0.6, 0.55, 0.62], [0.75, 0.7, 0.6], [0.5, 0.58, 0.66], [0.7, 0.5, 0.42], [0.8, 0.78, 0.72]];
const ROOM_LIGHT = [[1.0, 0.62, 0.32], [1.0, 0.7, 0.42], [1.0, 0.78, 0.55], [0.75, 0.85, 1.0], [1.0, 0.55, 0.3]];

export function buildBuildings(ctx) {
  const { THREE, root, lamps, tx, signs, world, RAPIER, bodies } = ctx;
  const R = rng(1984);
  const B = {
    red: new Builder(), orange: new Builder(), buff: new Builder(), dark: new Builder(), stone: new Builder(),
    trim: new Builder(), frames: new Builder(), roof: new Builder(), awn: new Builder(), shutter: new Builder(),
    wood: new Builder(), signs: new Builder({ aLit: 2 }), glass: new Builder({ aWin: 4, aDim: 4, aTan: 3, aTint: 3 }),
    iron: new Builder(), ad: new Builder(),
  };
  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  bodies.push(fixed);
  const stats = { windows: 0, lit: 0 };

  const addWindowGlass = (f, s0, s1, y0, y1, d, type, lit, tint, seed, depth) => {
    const w = s1 - s0, h = y1 - y0;
    const corners = [[s0, y0, 0, 0], [s1, y0, 1, 0], [s1, y1, 1, 1], [s0, y1, 0, 1]];
    const exs = corners.map(([, , u, v]) => ({ aWin: [u, v, seed, type], aDim: [w, h, depth, lit], aTan: f.u3, aTint: tint }));
    B.glass.quad(...corners.map(([s, y]) => f.P(s, y, d)), f.n3, corners.map(([, , u, v]) => [u, v]), exs);
    stats.windows++;
    if (lit > 0) stats.lit++;
  };

  const sign = (f, key, s0, s1, y0, y1, d, lit, rotate = false, flip = false) => {
    const cell = signs.cell(key);
    if (!cell) return;
    const [u0, v0, du, dv] = cell.uv;
    let uvs = [[u0, v0], [u0 + du, v0], [u0 + du, v0 + dv], [u0, v0 + dv]];
    if (rotate) uvs = [[u0 + du, v0], [u0 + du, v0 + dv], [u0, v0 + dv], [u0, v0]];
    if (flip) uvs = [uvs[1], uvs[0], uvs[3], uvs[2]];
    B.signs.cur.aLit = [lit * (cell.kind === 'fascia' && cell.lit < 0.95 ? 0.85 : 4.0), R() * 100];
    B.signs.quad(f.P(s0, y0, d), f.P(s1, y0, d), f.P(s1, y1, d), f.P(s0, y1, d), f.n3, uvs);
  };

  for (const b of BUILDINGS) {
    const r = rng(b.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    const floors = b.floors;
    const roofY = GROUND_FLOOR + (floors - 1) * FLOOR + 0.35;
    const parapet = b.back ? 0.6 : 1.0;
    const H = roofY + parapet;
    const tintK = 0.82 + r() * 0.3;
    const brickCol = [tintK * (0.96 + r() * 0.08), tintK, tintK * (0.94 + r() * 0.08)];
    const frameCol = FRAME_COLS[(r() * FRAME_COLS.length) | 0];
    const trimCol = TRIM_COLS[(r() * TRIM_COLS.length) | 0];
    const corniceCol = r() < 0.5 ? trimCol : TRIM_COLS[2 + ((r() * 3) | 0)];
    const brick = B[b.brick];
    const [x0, z0, x1, z1] = b.box;
    const faces = b.face.map((f) => ({ f, F: faceFrame(b, f) }));
    world.createCollider(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, H / 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, SIDEWALK_H + H / 2, (z0 + z1) / 2).setCollisionGroups(GROUP_STATIC), fixed);

    const sides = [
      { dir: 's', a: x0, b: x1 }, { dir: 'n', a: x0, b: x1 }, { dir: 'e', a: z0, b: z1 }, { dir: 'w', a: z0, b: z1 },
    ];
    for (const sd of sides) {
      if (faces.some((q) => q.f.dir === sd.dir)) continue;
      const F = faceFrame(b, sd);
      const f = fr(F);
      brick.col = brickCol;
      const ops = [];
      if (b.back) {
        const nb = Math.max(2, Math.round(F.W / 3.2)), bw = F.W / nb;
        for (let k = 2; k < floors; k++) for (let i = 0; i < nb; i++) {
          if (r() < 0.25) continue;
          const fy = GROUND_FLOOR + (k - 1) * FLOOR;
          ops.push({ s0: i * bw + bw / 2 - 0.5, s1: i * bw + bw / 2 + 0.5, y0: fy + 0.9, y1: fy + 2.5, depth: 0.16 });
        }
      }
      wallWithOpenings(brick, brick, f, F.W, H, ops, 0);
      for (const o of ops) {
        B.frames.col = frameCol;
        fbox(B.frames, f, o.s0, o.s1, o.y0 - 0.02, o.y0 + 0.04, -o.depth + 0.02, -o.depth - 0.04);
        const lit = r() < 0.34 ? 0.6 + r() * 0.8 : 0;
        addWindowGlass(f, o.s0, o.s1, o.y0, o.y1, -o.depth + 0.02, 0, lit, ROOM_LIGHT[(r() * ROOM_LIGHT.length) | 0], r(), 3.5);
      }
      if (b.ad === sd.dir) {
        const nb = BUILDINGS.find((o) => o !== b && o.box[0] < x1 && o.box[2] > x0 && Math.abs(o.box[1] - z1) < 0.5);
        const lowH = nb ? GROUND_FLOOR + (nb.floors - 1) * FLOOR + 1.6 : H - 8;
        const y0 = lowH + 0.4, y1 = Math.min(H - 0.6, y0 + 7.5);
        const w = (y1 - y0) * 2;
        const s0 = Math.max(0.5, F.W / 2 - w / 2);
        B.ad.quad(f.P(s0, y0, 0.02), f.P(s0 + w, y0, 0.02), f.P(s0 + w, y1, 0.02), f.P(s0, y1, 0.02), f.n3, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      }
      B.trim.col = trimCol;
      fbox(B.trim, f, -0.05, F.W + 0.05, H, H + 0.1, 0.06, -0.36);
    }

    for (const { f: face, F } of faces) {
      const f = fr(F);
      const W = F.W;
      const nb = Math.max(2, Math.round(W / 2.75));
      const bw = W / nb;
      const shop = (b.shop || []).find((s) => s.dir === face.dir);
      const ops = [];
      const winW = 1.08, winH = 1.72;
      for (let k = 1; k < floors; k++) {
        const fy = GROUND_FLOOR + (k - 1) * FLOOR;
        for (let i = 0; i < nb; i++) {
          const cs = i * bw + bw / 2;
          ops.push({ s0: cs - winW / 2, s1: cs + winW / 2, y0: fy + 0.88, y1: fy + 0.88 + winH, depth: 0.2, kind: 'win', k, i });
        }
      }
      const corner = !!b.corner;
      let store = null, door = null;
      if (shop) {
        const sA = corner ? 0.55 : 2.0, sB = W - 0.55;
        store = { s0: sA, s1: sB, y0: 0, y1: 3.2, depth: 0.32, kind: 'store' };
        ops.push(store);
        if (!corner) { door = { s0: 0.45, s1: 1.55, y0: 0, y1: 2.75, depth: 0.55, kind: 'door' }; ops.push(door); }
      } else {
        door = { s0: W / 2 - 0.6, s1: W / 2 + 0.6, y0: 0, y1: 2.75, depth: 0.55, kind: 'door' };
        ops.push(door);
        for (const cs of [W * 0.2, W * 0.8]) ops.push({ s0: cs - 0.55, s1: cs + 0.55, y0: 1.0, y1: 2.8, depth: 0.2, kind: 'win', k: 0, i: -1 });
      }
      brick.col = brickCol;
      B.stone.col = [trimCol[0] * 1.15, trimCol[1] * 1.15, trimCol[2] * 1.15];
      const split = b.base === 'stone' ? GROUND_FLOOR - 0.05 : 0;
      wallWithOpenings(brick, split ? B.stone : brick, f, W, H, ops, split);

      for (const o of ops) {
        if (o.kind !== 'win') continue;
        const seed = r();
        B.trim.col = trimCol;
        fbox(B.trim, f, o.s0 - 0.1, o.s1 + 0.1, o.y0 - 0.09, o.y0, 0.07, -0.05);
        fbox(B.trim, f, o.s0 - 0.12, o.s1 + 0.12, o.y1, o.y1 + 0.24, 0.035, -0.02, 'nz');
        B.frames.col = frameCol;
        const d = -o.depth + 0.05, ft = 0.055;
        fbox(B.frames, f, o.s0, o.s1, o.y0, o.y0 + ft, d, d - 0.06);
        fbox(B.frames, f, o.s0, o.s1, o.y1 - ft, o.y1, d, d - 0.06);
        fbox(B.frames, f, o.s0, o.s0 + ft, o.y0, o.y1, d, d - 0.06);
        fbox(B.frames, f, o.s1 - ft, o.s1, o.y0, o.y1, d, d - 0.06);
        const mid = (o.y0 + o.y1) / 2;
        fbox(B.frames, f, o.s0 + ft, o.s1 - ft, mid - 0.03, mid + 0.03, d + 0.02, d - 0.05);
        const floorBias = o.k <= 1 ? 0.08 : 0;
        const lit = r() < 0.36 + floorBias ? 0.6 + r() * 1.0 : (r() < 0.12 ? 0.08 : 0);
        const tint = ROOM_LIGHT[(r() * ROOM_LIGHT.length) | 0];
        addWindowGlass(f, o.s0 + ft, o.s1 - ft, o.y0 + ft, o.y1 - ft, d - 0.03, 0, lit, tint, seed, 3.6);
        if (o.k >= 1 && r() < 0.13) {
          B.frames.col = [0.55, 0.55, 0.52];
          const ac0 = o.s0 + 0.12, ac1 = o.s1 - 0.12;
          fbox(B.frames, f, ac0, ac1, o.y0 + 0.08, o.y0 + 0.5, d + 0.25, d - 0.35);
        }
      }

      if (store) {
        const sh = shop;
        const closed = sh.kind === 'closed' || sh.lit <= 0;
        const trimSign = [trimCol[0] * 0.9, trimCol[1] * 0.9, trimCol[2] * 0.9];
        B.trim.col = trimSign;
        fbox(B.trim, f, -0.05, W + 0.05, GROUND_FLOOR - 0.28, GROUND_FLOOR + 0.02, 0.22, -0.02);
        fbox(B.trim, f, store.s0 - 0.3, store.s0, 0, 3.2, 0.08, -0.05, 'nz');
        fbox(B.trim, f, store.s1, store.s1 + 0.3, 0, 3.2, 0.08, -0.05, 'nz');
        const sw = Math.min(store.s1 - store.s0 - 0.3, 7.2);
        const sc = (store.s0 + store.s1) / 2;
        const sh0 = Math.min(0.95, Math.max(0.62, sw / 6.2));
        sign(f, sh.sign, sc - sw / 2, sc + sw / 2, 3.3, 3.3 + sh0, 0.07, sh.lit);
        B.frames.col = [0.05, 0.05, 0.05];
        fbox(B.frames, f, sc - sw / 2 - 0.05, sc + sw / 2 + 0.05, 3.25, 3.35 + sh0, 0.065, 0.0);
        if (closed) {
          B.shutter.col = [0.55 + r() * 0.2, 0.56 + r() * 0.2, 0.55 + r() * 0.2];
          B.shutter.quad(f.P(store.s0, 0, -0.06), f.P(store.s1, 0, -0.06), f.P(store.s1, 3.2, -0.06), f.P(store.s0, 3.2, -0.06), f.n3,
            [[store.s0, 0], [store.s1, 0], [store.s1, 3.2], [store.s0, 3.2]]);
          B.frames.col = [0.28, 0.28, 0.27];
          fbox(B.frames, f, store.s0, store.s1, 2.95, 3.22, 0.1, -0.06);
          fbox(B.frames, f, store.s0 - 0.02, store.s0 + 0.06, 0, 3.0, 0.02, -0.08);
          fbox(B.frames, f, store.s1 - 0.06, store.s1 + 0.02, 0, 3.0, 0.02, -0.08);
        } else {
          const d = -store.depth + 0.04;
          const bulk = 0.55;
          B.frames.col = sh.kind === 'bar' ? [0.12, 0.06, 0.03] : [0.32, 0.33, 0.34];
          fbox(B.frames, f, store.s0, store.s1, 0, bulk, -0.02, d - 0.1);
          fbox(B.frames, f, store.s0, store.s1, 2.55, 2.63, d + 0.02, d - 0.06);
          fbox(B.frames, f, store.s0, store.s1, 3.12, 3.2, d + 0.02, d - 0.06);
          fbox(B.frames, f, store.s0, store.s1, bulk - 0.02, bulk + 0.05, d + 0.02, d - 0.06);
          const nm = Math.max(1, Math.round((store.s1 - store.s0) / 1.7));
          for (let m = 0; m <= nm; m++) {
            const ms = store.s0 + (store.s1 - store.s0) * (m / nm);
            fbox(B.frames, f, ms - 0.04, ms + 0.04, 0, 3.2, d + 0.02, d - 0.06);
          }
          const tint = (ctx.shopTint[sh.kind] || [1, 0.85, 0.6]);
          addWindowGlass(f, store.s0, store.s1, bulk, 3.12, d - 0.02, 1, 0.5 * sh.lit + 0.15, tint, r(), 6.5);
          if (sh.window) {
            const wc = store.s0 + (store.s1 - store.s0) * 0.28;
            sign(f, sh.window, wc - 0.62, wc + 0.62, 1.6, 1.82, d + 0.01, 1);
          }
          if (sh.awning) {
            const ac = sh.awning === 'green' ? [0.05, 0.25, 0.1] : sh.awning === 'red' ? [0.45, 0.04, 0.03] : [0.06, 0.12, 0.38];
            const a0 = store.s0 - 0.1, a1 = store.s1 + 0.1, ns = Math.max(2, Math.round((a1 - a0) / 0.33));
            for (let k = 0; k < ns; k++) {
              const u0 = a0 + (a1 - a0) * k / ns, u1 = a0 + (a1 - a0) * (k + 1) / ns;
              B.awn.col = k % 2 ? [0.72, 0.7, 0.64] : ac;
              B.awn.quad(f.P(u0, 3.22, 0.02), f.P(u1, 3.22, 0.02), f.P(u1, 2.5, 1.45), f.P(u0, 2.5, 1.45), [f.n3[0] * 0.45, 0.9, f.n3[2] * 0.45], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
              B.awn.quad(f.P(u0, 2.5, 1.45), f.P(u1, 2.5, 1.45), f.P(u1, 2.22, 1.45), f.P(u0, 2.22, 1.45), f.n3, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
            }
            B.awn.col = [0.06, 0.06, 0.06];
            B.awn.quad(f.P(a0, 3.22, 0.02), f.P(a0, 2.5, 1.45), f.P(a0, 2.22, 1.45), f.P(a0, 2.22, 1.42), f.un, [[0, 0], [1, 0], [1, 1], [0, 1]]);
          }
        }
        if (sh.blade) {
          const bs = corner ? W - 0.7 : W - 1.0;
          const y0 = GROUND_FLOOR + 0.6, y1 = y0 + (sh.blade === 'hotel_v' ? 4.6 : 2.6);
          const bfr = { P: (s, y, d) => f.P(bs, y, 0.15 + s), n3: f.un, u3: f.n3 };
          const bfr2 = { P: (s, y, d) => f.P(bs + 0.012, y, 0.15 + s), n3: f.u3, u3: f.n3 };
          const wdt = 0.95;
          B.signs.cur.aLit = [sh.lit * 4.5, R() * 100];
          const cell = signs.cell(sh.blade);
          if (cell) {
            const [u0, v0, du, dv] = cell.uv;
            const rot = [[u0, v0 + dv], [u0, v0], [u0 + du, v0], [u0 + du, v0 + dv]];
            B.signs.quad(bfr.P(0, y0, 0), bfr.P(wdt, y0, 0), bfr.P(wdt, y1, 0), bfr.P(0, y1, 0), bfr.n3, [rot[1], rot[2], rot[3], rot[0]]);
            B.signs.quad(bfr2.P(0, y0, 0), bfr2.P(wdt, y0, 0), bfr2.P(wdt, y1, 0), bfr2.P(0, y1, 0), bfr2.n3, [rot[2], rot[1], rot[0], rot[3]]);
          }
          B.frames.col = [0.05, 0.05, 0.05];
          const c = f.P(bs + 0.006, (y0 + y1) / 2, 0.15 + wdt / 2);
          B.frames.boxW(c, f.u3, UP, f.n3, 0.03, (y1 - y0) / 2 + 0.05, wdt / 2 + 0.05, 1, '');
          fbox(B.frames, f, bs - 0.02, bs + 0.04, y1 + 0.05, y1 + 0.1, 0.0, 0.15 + wdt);
          fbox(B.frames, f, bs - 0.02, bs + 0.04, y0 - 0.1, y0 - 0.05, 0.0, 0.15 + wdt);
        }
      }
      if (door) {
        B.frames.col = [0.09, 0.06, 0.04];
        const d = -door.depth + 0.03;
        fbox(B.frames, f, door.s0 + 0.08, door.s1 - 0.08, 0, 2.15, d, d - 0.06);
        B.frames.col = frameCol;
        fbox(B.frames, f, door.s0, door.s1, 2.15, 2.25, d + 0.02, d - 0.07);
        addWindowGlass(f, door.s0 + 0.1, door.s1 - 0.1, 2.27, 2.7, d + 0.01, 2, 0.9, [1, 0.78, 0.5], r(), 4);
        B.trim.col = trimCol;
        fbox(B.trim, f, door.s0 - 0.25, door.s1 + 0.25, 2.75, 3.0, 0.1, -0.02);
        fbox(B.trim, f, door.s0 - 0.25, door.s0, 0, 2.75, 0.06, -0.02, 'nz');
        fbox(B.trim, f, door.s1, door.s1 + 0.25, 0, 2.75, 0.06, -0.02, 'nz');
      }

      B.trim.col = corniceCol;
      const cst = b.cornice || 'simple';
      if (cst === 'deep' || cst === 'bracket') {
        const proj = cst === 'deep' ? 0.75 : 0.5;
        fbox(B.trim, f, -0.1, W + 0.1, roofY - 0.1, roofY + 0.55, proj, -0.02);
        fbox(B.trim, f, -0.05, W + 0.05, roofY - 0.42, roofY - 0.1, proj * 0.45, -0.02);
        fbox(B.trim, f, -0.12, W + 0.12, roofY + 0.55, roofY + 0.68, proj + 0.06, -0.02);
        const nbk = Math.max(2, Math.round(W / 1.1));
        for (let k = 0; k <= nbk; k++) {
          const s = 0.15 + (W - 0.3) * k / nbk;
          fbox(B.trim, f, s - 0.09, s + 0.09, roofY - 0.62, roofY - 0.1, proj * 0.92, 0.0);
        }
        B.trim.col = trimCol;
        fbox(B.trim, f, -0.04, W + 0.04, H - 0.02, H + 0.1, 0.05, -0.36);
      } else {
        fbox(B.trim, f, -0.04, W + 0.04, roofY - 0.2, roofY + 0.08, 0.22, -0.02);
        fbox(B.trim, f, -0.04, W + 0.04, H - 0.02, H + 0.1, 0.06, -0.36);
      }
      if (b.base === 'stone') {
        B.trim.col = trimCol;
        fbox(B.trim, f, -0.04, W + 0.04, GROUND_FLOOR + FLOOR - 0.2, GROUND_FLOOR + FLOOR - 0.05, 0.08, -0.02);
      }
      if ((b.fire || []).includes(face.dir) && floors >= 3) fireEscape(B.iron, f, nb, bw, floors, r);
    }

    const inset = 0.3;
    brick.col = [brickCol[0] * 0.8, brickCol[1] * 0.8, brickCol[2] * 0.8];
    const pi = [[x0 + inset, z0 + inset], [x1 - inset, z0 + inset], [x1 - inset, z1 - inset], [x0 + inset, z1 - inset]];
    for (let k = 0; k < 4; k++) {
      const [ax, az] = pi[k], [bx, bz] = pi[(k + 1) % 4];
      const nx = (bz - az), nz = -(bx - ax), ln = Math.hypot(nx, nz);
      brick.quad([ax, SIDEWALK_H + roofY, az], [bx, SIDEWALK_H + roofY, bz], [bx, SIDEWALK_H + H, bz], [ax, SIDEWALK_H + H, az], [nx / ln, 0, nz / ln], [[0, 0], [Math.hypot(bx - ax, bz - az), 0], [Math.hypot(bx - ax, bz - az), parapet], [0, parapet]]);
    }
    B.roof.col = [0.9 + r() * 0.2, 0.9 + r() * 0.2, 0.9 + r() * 0.2];
    B.roof.quad([x0, SIDEWALK_H + roofY, z0], [x1, SIDEWALK_H + roofY, z0], [x1, SIDEWALK_H + roofY, z1], [x0, SIDEWALK_H + roofY, z1], [0, 1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
    const bulk = !b.back && r() < 0.8;
    if (bulk) {
      const bx = x0 + 1.5 + r() * Math.max(0.1, x1 - x0 - 5), bz = z0 + 1.5 + r() * Math.max(0.1, z1 - z0 - 5);
      brick.col = brickCol;
      brick.box(bx, SIDEWALK_H + roofY, bz, bx + 2.6, SIDEWALK_H + roofY + 2.7, bz + 2.4, 1, 'ny');
      B.trim.col = trimCol;
      B.trim.box(bx - 0.05, SIDEWALK_H + roofY + 2.7, bz - 0.05, bx + 2.65, SIDEWALK_H + roofY + 2.8, bz + 2.45, 1, 'ny');
    }
    for (let c = 0; c < 2 + ((r() * 3) | 0); c++) {
      const side = r() < 0.5;
      const cx = side ? (r() < 0.5 ? x0 + 0.5 : x1 - 1.1) : x0 + 1 + r() * (x1 - x0 - 2);
      const cz = side ? z0 + 1 + r() * (z1 - z0 - 2) : (r() < 0.5 ? z0 + 0.5 : z1 - 1.1);
      brick.col = brickCol;
      brick.box(cx, SIDEWALK_H + roofY, cz, cx + 0.6, SIDEWALK_H + roofY + 1.6 + r() * 1.4, cz + 0.6, 1, 'ny');
    }
    if (b.water) waterTower(B.wood, B.iron, x0, z0, x1, z1, SIDEWALK_H + roofY, r);
  }

  for (const [x0, z0, x1, z1] of [[-PLATE.half + 0.5, -PLATE.half + 0.5, FACADE.w - 0.4, FACADE.n - 0.4], [FACADE.e + 0.4, -PLATE.half + 0.5, PLATE.half - 0.5, FACADE.n - 0.4], [-PLATE.half + 0.5, FACADE.s + 0.4, FACADE.w - 0.4, PLATE.half - 0.5]]) {
    B.dark.col = [0.7, 0.7, 0.7];
    B.dark.box(x0, SIDEWALK_H, z0, x1, SIDEWALK_H + 3.9, z1, 1, 'ny');
    B.roof.col = [0.8, 0.8, 0.8];
    B.roof.quad([x0, SIDEWALK_H + 3.91, z0], [x1, SIDEWALK_H + 3.91, z0], [x1, SIDEWALK_H + 3.91, z1], [x0, SIDEWALK_H + 3.91, z1], [0, 1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
  }

  const meshes = makeMeshes(ctx, B);
  for (const m of meshes) root.add(m);
  return { meshes, stats };
}

function fireEscape(I, f, nb, bw, floors, r) {
  const i0 = Math.max(0, Math.floor(nb / 2) - 1), i1 = Math.min(nb - 1, i0 + 1);
  const s0 = i0 * bw + 0.2, s1 = (i1 + 1) * bw - 0.2;
  const depth = 1.15, railH = 0.95;
  I.col = [0.035, 0.035, 0.034];
  for (let k = 1; k < floors; k++) {
    const y = GROUND_FLOOR + (k - 1) * FLOOR + 0.42;
    for (let j = 0; j < 7; j++) {
      const d = 0.08 + (depth - 0.12) * j / 6;
      fbox(I, f, s0, s1, y - 0.02, y + 0.012, d - 0.035, d + 0.035);
    }
    fbox(I, f, s0, s1, y - 0.09, y - 0.02, depth - 0.03, depth + 0.02);
    fbox(I, f, s0, s1, y + railH - 0.03, y + railH + 0.01, depth - 0.02, depth + 0.02);
    fbox(I, f, s0, s1, y + 0.12, y + 0.14, depth - 0.015, depth + 0.015);
    for (const ss of [s0, s1]) {
      fbox(I, f, ss - 0.02, ss + 0.02, y + railH - 0.03, y + railH + 0.01, 0.0, depth);
      fbox(I, f, ss - 0.02, ss + 0.02, y - 0.09, y - 0.02, 0.0, depth);
    }
    const nbal = Math.round((s1 - s0) / 0.13);
    for (let j = 0; j <= nbal; j++) {
      const s = s0 + (s1 - s0) * j / nbal;
      fbox(I, f, s - 0.008, s + 0.008, y, y + railH, depth - 0.008, depth + 0.008, 'pyny');
    }
    for (const ss of [s0, s1]) for (let j = 1; j < 8; j++) {
      const d = depth * j / 8;
      fbox(I, f, ss - 0.008, ss + 0.008, y, y + railH, d - 0.008, d + 0.008, 'pyny');
    }
    for (const ss of [s0 + 0.15, (s0 + s1) / 2, s1 - 0.15]) {
      const a = f.P(ss, y - 0.05, depth * 0.85), bpt = f.P(ss, y - 0.85, 0.02);
      const c = [(a[0] + bpt[0]) / 2, (a[1] + bpt[1]) / 2, (a[2] + bpt[2]) / 2];
      const dirv = sub(a, bpt), L = Math.hypot(...dirv);
      const ay = dirv.map((v) => v / L), ax = f.u3, az = cross(ax, ay);
      I.boxW(c, ax, ay, az, 0.02, L / 2, 0.02, 1, 'pyny');
    }
    if (k < floors - 1) {
      const up = k % 2 === 1;
      const sa = up ? s0 + 0.35 : s1 - 0.35, sb = up ? s1 - 1.3 : s0 + 1.3;
      const yA = y, yB = y + FLOOR;
      for (const dd of [depth * 0.45, depth * 0.95]) {
        const a = f.P(sa, yA, dd), bpt = f.P(sb, yB, dd);
        const c = [(a[0] + bpt[0]) / 2, (a[1] + bpt[1]) / 2, (a[2] + bpt[2]) / 2];
        const dv = sub(bpt, a), L = Math.hypot(...dv);
        const ax = dv.map((v) => v / L), ay = UP, az = cross(ax, ay);
        const azn = Math.hypot(...az);
        I.boxW(c, ax, cross(az.map((v) => v / azn), ax), az.map((v) => v / azn), L / 2, 0.06, 0.012, 1, '');
      }
      const steps = 11;
      for (let j = 1; j < steps; j++) {
        const t = j / steps;
        const s = sa + (sb - sa) * t, yy = yA + (yB - yA) * t;
        fbox(I, f, s - 0.1, s + 0.1, yy - 0.012, yy + 0.012, depth * 0.45, depth * 0.95, '');
      }
    } else if (floors >= 3) {
      fbox(I, f, s1 - 0.4, s1 - 0.36, y, y + 1.6, depth * 0.5, depth * 0.52);
    }
    if (k === 1) {
      const ls = s0 + 0.5;
      for (const dd of [depth * 0.55, depth * 0.95]) fbox(I, f, ls - 0.02, ls + 0.02, y - 2.0, y, dd - 0.02, dd + 0.02, '');
      for (let j = 0; j < 7; j++) fbox(I, f, ls - 0.015, ls + 0.015, y - 1.9 + j * 0.28, y - 1.88 + j * 0.28, depth * 0.55, depth * 0.95, '');
    }
  }
}

function waterTower(Wd, I, x0, z0, x1, z1, y, r) {
  const cx = x0 + 3.2 + r() * Math.max(0.1, x1 - x0 - 6.4), cz = z0 + 3.2 + r() * Math.max(0.1, z1 - z0 - 6.4);
  const R = 1.7 + r() * 0.4, H = 3.6, legH = 2.6;
  const seg = 18;
  Wd.col = [0.42 + r() * 0.12, 0.33, 0.24];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * R, y + legH, cz + Math.sin(a0) * R], p1 = [cx + Math.cos(a1) * R, y + legH, cz + Math.sin(a1) * R];
    const am = (a0 + a1) / 2;
    Wd.quad(p0, p1, [p1[0], p1[1] + H, p1[2]], [p0[0], p0[1] + H, p0[2]], [Math.cos(am), 0, Math.sin(am)], [[i * 0.6, 0], [(i + 1) * 0.6, 0], [(i + 1) * 0.6, H], [i * 0.6, H]]);
    const tip = [cx, y + legH + H + 1.3, cz];
    const q0 = [cx + Math.cos(a0) * (R + 0.15), y + legH + H, cz + Math.sin(a0) * (R + 0.15)], q1 = [cx + Math.cos(a1) * (R + 0.15), y + legH + H, cz + Math.sin(a1) * (R + 0.15)];
    Wd.col = [0.16, 0.13, 0.11];
    Wd.quad(q0, q1, tip, tip, [Math.cos(am) * 0.6, 0.8, Math.sin(am) * 0.6], [[0, 0], [1, 0], [0.5, 1], [0.5, 1]]);
    Wd.col = [0.42, 0.33, 0.24];
    const b0 = [cx + Math.cos(a0) * R, y + legH, cz + Math.sin(a0) * R];
    Wd.quad([cx, y + legH, cz], b0, [cx + Math.cos(a1) * R, y + legH, cz + Math.sin(a1) * R], [cx, y + legH, cz], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  I.col = [0.05, 0.05, 0.05];
  for (const hh of [0.4, 1.3, 2.2, 3.1]) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const rr = R + 0.025;
      const p0 = [cx + Math.cos(a0) * rr, y + legH + hh, cz + Math.sin(a0) * rr], p1 = [cx + Math.cos(a1) * rr, y + legH + hh, cz + Math.sin(a1) * rr];
      I.quad(p0, p1, [p1[0], p1[1] + 0.05, p1[2]], [p0[0], p0[1] + 0.05, p0[2]], [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
  }
  const legs = 6;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2;
    const lx = cx + Math.cos(a) * R * 0.8, lz = cz + Math.sin(a) * R * 0.8;
    I.box(lx - 0.06, y, lz - 0.06, lx + 0.06, y + legH, lz + 0.06, 1, '');
  }
  I.box(cx - R * 0.85, y + legH - 0.18, cz - 0.06, cx + R * 0.85, y + legH, cz + 0.06, 1, '');
  I.box(cx - 0.06, y + legH - 0.18, cz - R * 0.85, cx + 0.06, y + legH, cz + R * 0.85, 1, '');
  I.box(cx - R * 0.8, y + 1.2, cz - 0.03, cx + R * 0.8, y + 1.28, cz + 0.03, 1, '');
  I.box(cx - 0.03, y + 1.2, cz - R * 0.8, cx + 0.03, y + 1.28, cz + R * 0.8, 1, '');
}

function makeMeshes(ctx, B) {
  const { THREE, lamps, tx, signs } = ctx;
  const out = [];
  const brickSets = { red: ['brick_red', 1.0], orange: ['brick_orange', 2.0], buff: ['brick_buff', 1.0], dark: ['brick_dark', 1.05] };
  const grime = /* glsl */`
    { float hy = vPlateWorld.y;
      float base = smoothstep( 0.15, 2.6, hy );
      diffuseColor.rgb *= mix( 0.55, 1.0, base );
      float n = fract( sin( dot( floor( vPlateWorld.xz * 0.35 + vPlateWorld.y * 0.05 ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
      diffuseColor.rgb *= 0.9 + 0.12 * n; }
  `;
  for (const [k, [set, size]] of Object.entries(brickSets)) {
    const g = B[k].build(THREE);
    if (!g) continue;
    const t = tx.set(set);
    for (const tt of Object.values(t)) tt.repeat.set(1 / size, 1 / size);
    const m = patchMaterial(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.nor, roughnessMap: t.arm, vertexColors: true, roughness: 1, metalness: 0 }), {
      lamps, key: 'brick', frag: [['color_fragment', grime], ['roughnessmap_fragment', 'roughnessFactor *= mix( 0.75, 1.0, smoothstep( 0.15, 1.5, vPlateWorld.y ) );']],
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.name = 'Walls_' + k; mesh.castShadow = false; mesh.receiveShadow = false;
    out.push(mesh);
  }
  const stone = tx.set('stone');
  for (const tt of Object.values(stone)) tt.repeat.set(1 / 2.4, 1 / 2.4);
  const stoneMat = (key) => patchMaterial(new THREE.MeshStandardMaterial({ map: stone.map, normalMap: stone.nor, roughnessMap: stone.arm, vertexColors: true, roughness: 1 }), { lamps, key, frag: [['color_fragment', grime]] });
  const add = (b, mat, name, cast = false) => {
    const g = b.build(THREE);
    if (!g) return null;
    const m = new THREE.Mesh(g, mat);
    m.name = name; m.castShadow = cast; m.receiveShadow = false;
    out.push(m);
    return m;
  };
  add(B.stone, stoneMat('stonewall'), 'Walls_stone');
  add(B.trim, stoneMat('trim'), 'Trim');
  add(B.frames, patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 }), { lamps, key: 'frames' }), 'Frames');
  add(B.roof, patchMaterial(new THREE.MeshStandardMaterial({ color: 0x2b2a29, vertexColors: true, roughness: 0.9 }), { lamps, key: 'roof' }), 'Roofs', false);
  add(B.iron, patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.55 }), { lamps, key: 'ironfe' }), 'FireEscapes', true);
  add(B.awn, patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), { lamps, key: 'awning' }), 'Awnings', true);
  const sh = tx.set('shutter');
  for (const tt of Object.values(sh)) tt.repeat.set(1 / 1.2, 1 / 1.2);
  add(B.shutter, patchMaterial(new THREE.MeshStandardMaterial({ map: sh.map, normalMap: sh.nor, roughnessMap: sh.arm, vertexColors: true, metalness: 0.55, roughness: 1 }), { lamps, key: 'shutter' }), 'Shutters');
  const pl = tx.set('planks');
  for (const tt of Object.values(pl)) { tt.repeat.set(1 / 1.5, 1 / 1.5); }
  add(B.wood, patchMaterial(new THREE.MeshStandardMaterial({ map: pl.map, normalMap: pl.nor, vertexColors: true, roughness: 0.85 }), { lamps, key: 'tower' }), 'WaterTowers');
  const adTex = tx.tex('tex/ad_staypuft.png', { srgb: true, wrap: false });
  add(B.ad, patchMaterial(new THREE.MeshStandardMaterial({ map: adTex, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }), { lamps, key: 'ad' }), 'PaintedAd', false);

  const signMat = new THREE.MeshStandardMaterial({ map: signs.texture, emissiveMap: signs.texture, emissive: new THREE.Color(1, 1, 1), roughness: 0.45, metalness: 0.0 });
  patchMaterial(signMat, {
    lamps, key: 'signs',
    vertexPars: 'attribute vec2 aLit; varying vec2 vLit;',
    vertexMain: 'vLit = aLit;',
    fragPars: 'varying vec2 vLit;',
    frag: [['emissivemap_fragment', /* glsl */`
      { float fl = 1.0;
        float ph = vLit.y;
        if ( ph > 96.0 ) { float t = uPlateTime * 7.0 + ph; fl = step( 0.22, fract( sin( floor( t ) * 12.9898 ) * 43758.5453 ) ) * 0.85 + 0.15; }
        totalEmissiveRadiance *= vLit.x * fl; }
    `]],
  });
  add(B.signs, signMat, 'Signs', false);

  const glassMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.07, metalness: 0.0, emissive: 0xffffff });
  patchMaterial(glassMat, {
    lamps, key: 'glass',
    vertexPars: 'attribute vec4 aWin; attribute vec4 aDim; attribute vec3 aTan; attribute vec3 aTint; varying vec4 vWin; varying vec4 vDim; varying vec3 vTanW; varying vec3 vTint; varying vec3 vNW;',
    vertexMain: 'vWin = aWin; vDim = aDim; vTanW = aTan; vTint = aTint; vNW = normalize( mat3( modelMatrix ) * objectNormal );',
    fragPars: /* glsl */`
      varying vec4 vWin; varying vec4 vDim; varying vec3 vTanW; varying vec3 vTint; varying vec3 vNW;
      float h11( float n ) { return fract( sin( n * 91.345 ) * 47453.5453 ); }
      vec3 wallpaper( float s ) {
        float k = floor( s * 7.0 );
        vec3 c = vec3( 0.72, 0.62, 0.45 );
        if ( k == 1.0 ) c = vec3( 0.55, 0.62, 0.5 ); else if ( k == 2.0 ) c = vec3( 0.62, 0.56, 0.64 ); else if ( k == 3.0 ) c = vec3( 0.78, 0.72, 0.6 );
        else if ( k == 4.0 ) c = vec3( 0.5, 0.58, 0.68 ); else if ( k == 5.0 ) c = vec3( 0.72, 0.5, 0.42 ); else if ( k == 6.0 ) c = vec3( 0.82, 0.8, 0.74 );
        return c;
      }
      vec3 interior( vec3 V ) {
        float W = vDim.x, H = vDim.y, D = vDim.z;
        float seed = vWin.z, type = vWin.w;
        vec3 T = normalize( vTanW ), N = normalize( vNW ), B = normalize( cross( N, T ) );
        vec3 rd = vec3( dot( V, T ), dot( V, B ), dot( V, N ) );
        rd.z = min( rd.z, -0.02 );
        float mx = type > 0.5 ? 0.6 : 0.9;
        vec3 ro = vec3( vWin.x * W, vWin.y * H, 0.0 );
        vec3 bmin = vec3( -mx, type > 0.5 ? -0.6 : -0.95, -D ), bmax = vec3( W + mx, H + ( type > 0.5 ? 0.6 : 0.55 ), 0.0 );
        vec3 t1 = ( bmin - ro ) / rd, t2 = ( bmax - ro ) / rd;
        vec3 tf = max( t1, t2 );
        float t = min( min( tf.x, tf.y ), tf.z );
        vec3 hp = ro + rd * t;
        vec3 lampP = vec3( W * 0.5 + ( h11( seed * 3.1 ) - 0.5 ) * W * 0.6, bmax.y - 0.15, -D * ( 0.35 + 0.3 * h11( seed * 5.7 ) ) );
        float ld = length( hp - lampP );
        float light = 1.0 / ( 1.0 + ld * ld * ( type > 0.5 ? 0.06 : 0.35 ) );
        vec3 wall = type > 0.5 ? vec3( 0.75, 0.74, 0.7 ) : wallpaper( h11( seed * 7.7 ) );
        vec3 col;
        if ( type > 0.5 ) {
          float tubes = 0.0;
          if ( t == tf.y && rd.y > 0.0 ) {
            float zz = fract( -hp.z / 1.7 );
            tubes = step( abs( zz - 0.5 ), 0.045 ) * step( abs( hp.x - W * 0.5 ), W * 0.3 );
            col = vec3( 0.42 ) + vec3( 5.0 ) * tubes;
          } else if ( t == tf.y ) {
            vec2 ck = floor( hp.xz / 0.3 );
            col = mod( ck.x + ck.y, 2.0 ) < 1.0 ? vec3( 0.42, 0.41, 0.38 ) : vec3( 0.05 );
          } else {
            bool back = t == tf.z;
            vec2 q = back ? hp.xy : vec2( -hp.z, hp.y );
            col = wall * ( back ? 0.5 : 0.32 );
            float band = floor( q.y / 0.5 );
            float inShelf = step( -0.4, q.y ) * step( q.y, 1.9 );
            float bx = floor( q.x / 0.19 + band * 3.7 );
            float hb = h11( bx * 1.31 + band * 7.3 + seed * 13.0 );
            vec3 goods = vec3( h11( hb * 9.1 ), h11( hb * 3.3 + 1.0 ), h11( hb * 5.7 + 2.0 ) );
            goods = mix( goods, vec3( dot( goods, vec3( 0.33 ) ) ), 0.5 ) * 0.7;
            float gy = fract( q.y / 0.5 );
            float item = step( 0.1, gy ) * step( gy, 0.1 + 0.6 * ( 0.5 + 0.5 * hb ) ) * step( 0.12, fract( q.x / 0.19 + band * 3.7 ) ) * step( 0.3, hb );
            col = mix( col, goods * ( back ? 1.0 : 0.6 ), item * inShelf );
            col = mix( col, vec3( 0.25, 0.26, 0.27 ), step( gy, 0.07 ) * inShelf );
            if ( back && q.y > 2.0 && q.y < 2.6 && abs( q.x - W * 0.5 ) < W * 0.3 ) col = mix( col, vTint * 0.9, 0.7 );
            if ( back && h11( seed * 2.9 ) > 0.5 && abs( q.x - W * 0.82 ) < 0.45 && q.y < 1.6 ) col = vec3( 0.03 );
          }
          float tc = ( -2.0 - ro.z ) / rd.z;
          vec3 ch = ro + rd * tc;
          float cx0 = W * ( 0.08 + 0.3 * h11( seed * 4.3 ) ), cx1 = cx0 + W * 0.42;
          if ( tc > 0.0 && tc < t && ch.y < 0.5 && ch.x > cx0 && ch.x < cx1 ) { col = vec3( 0.07, 0.06, 0.055 ) + vec3( 0.2 ) * step( 0.42, ch.y ); t = tc; }
          float tw = ( -0.6 - ro.z ) / rd.z;
          vec3 wh = ro + rd * tw;
          if ( tw > 0.0 && tw < t && wh.y < 0.15 && wh.y > -0.6 ) col = vec3( 0.04, 0.035, 0.03 );
          col *= ( 1.0 - smoothstep( 0.0, D * 1.1, -hp.z ) * 0.4 ) * 0.5;
        } else if ( t == tf.z ) {
          col = wall;
          vec2 q = hp.xy;
          float fr = h11( seed * 11.3 );
          float fx0 = W * ( 0.1 + 0.5 * fr ), fx1 = fx0 + W * 0.45;
          if ( q.x > fx0 && q.x < fx1 && q.y < bmin.y + 1.0 + fr * 0.6 ) col *= 0.25;
          if ( q.x > fx1 + 0.3 && q.x < fx1 + 0.75 && q.y > 0.4 && q.y < 1.0 ) col = mix( col, vec3( 0.15, 0.1, 0.08 ), 0.8 );
          if ( fr > 0.6 && q.x > -0.4 && q.x < 0.6 && q.y < 1.9 && q.y > bmin.y ) col *= 0.18;
        } else if ( t == tf.y ) {
          col = rd.y > 0.0 ? vec3( 0.85, 0.84, 0.8 ) * ( 1.2 + 1.5 * exp( -length( hp.xz - lampP.xz ) * 1.2 ) ) : vec3( 0.22, 0.14, 0.08 );
        } else {
          col = wall * 0.75;
        }
        col *= type > 0.5 ? 0.9 : light;
        float tv = step( 0.86, h11( seed * 17.1 ) ) * step( type, 0.5 );
        if ( tv > 0.0 ) col = mix( col, vec3( 0.35, 0.5, 1.0 ) * ( 0.55 + 0.45 * sin( uPlateTime * 9.0 + seed * 40.0 ) * sin( uPlateTime * 3.1 + seed ) ), 0.65 );
        if ( type < 0.5 ) {
          float u = vWin.x, v = vWin.y;
          float cur = h11( seed * 23.7 );
          if ( cur < 0.4 ) {
            float lvl = 0.35 + 0.6 * h11( seed * 29.3 );
            if ( v > lvl ) {
              float slat = smoothstep( 0.35, 0.5, fract( v * H / 0.035 ) );
              col = mix( vTint * 0.9 * ( 0.6 + 0.4 * light ), col, slat * 0.35 );
            }
          } else if ( cur < 0.8 ) {
            float c0 = 0.22 + 0.15 * h11( seed * 31.0 ), c1 = 0.78 - 0.15 * h11( seed * 37.0 );
            float folds = 0.75 + 0.25 * sin( u * 70.0 + seed * 9.0 );
            vec3 cloth = mix( vec3( 0.75, 0.68, 0.55 ), vec3( 0.6, 0.12, 0.08 ), step( 0.6, h11( seed * 41.0 ) ) );
            if ( u < c0 || u > c1 ) col = cloth * folds * 0.9;
          }
        }
        return col;
      }
    `,
    frag: [['emissivemap_fragment', /* glsl */`
      { vec3 V = normalize( vPlateWorld - cameraPosition );
        float lit = vDim.w;
        vec3 ins = interior( V );
        totalEmissiveRadiance = ins * vTint * lit * ( vWin.w > 0.5 ? 1.0 : 0.9 ) + ins * 0.0025;
        diffuseColor.rgb = vec3( 0.012 ); }
    `], ['roughnessmap_fragment', 'roughnessFactor = 0.05 + 0.1 * fract( sin( dot( floor( vPlateWorld.xz * 3.0 + vPlateWorld.y ), vec2( 4.1, 7.7 ) ) ) * 991.3 );']],
  });
  add(B.glass, glassMat, 'Windows', false);
  return out;
}
