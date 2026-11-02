// Destructible street props: instanced visuals driven by Rapier bodies, pre-fractured debris pools, impact damage, hot-dog cart with edible food.
import { PROPS, HOTDOG, SIDEWALK_H, GROUP_PROP, GROUP_DEBRIS, GROUP_STATIC, AVE, ST, PLATE, streetSurface, curbDist, rng } from './layout.js';
import { patchMaterial } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PHYS = { metal: [0.5, 0.22], wood: [0.7, 0.12], plastic: [0.75, 0.32], glass: [0.5, 0.1], paper: [0.9, 0.04], cloth: [0.95, 0.0] };

function colorGeo(T, g, c) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set(c, i * 3);
  g.setAttribute('color', new T.Float32BufferAttribute(a, 3));
  return g;
}
function norm(g) {
  let ng = g.index ? g.toNonIndexed() : g;
  if (!ng.attributes.uv) ng.setAttribute('uv', new ng.attributes.position.constructor(new Float32Array(ng.attributes.position.count * 2), 2));
  for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) ng.deleteAttribute(k);
  return ng;
}
function cellUV(g, cell, faces = null) {
  const uv = g.attributes.uv;
  if (!cell) return g;
  for (let i = 0; i < uv.count; i++) {
    const f = Math.floor(i / 4);
    if (faces && !faces.includes(f)) continue;
    uv.setXY(i, cell[0] + uv.getX(i) * cell[2], cell[1] + uv.getY(i) * cell[3]);
  }
  return g;
}
const GEO = new Map();
function memo(key, make) { if (!GEO.has(key)) GEO.set(key, make()); return GEO.get(key); }
function merge(T, list) {
  return mergeGeometries(list.map((g) => norm(g)));
}

export function buildProps(ctx) {
  const { THREE: T, RAPIER, world, root, lamps, tx, assets, atlas, quality } = ctx;
  const A = (k) => atlas[k];
  const wood = tx.set('wood_rough');
  for (const t of Object.values(wood)) t.repeat.set(1, 1);
  const mats = {
    wood: patchMaterial(new T.MeshStandardMaterial({ map: wood.map, normalMap: wood.nor, vertexColors: true, roughness: 0.82 }), { lamps, key: 'pwood' }),
    atlas: patchMaterial(new T.MeshStandardMaterial({ map: atlas.texture, vertexColors: true, roughness: 0.55, metalness: 0.05 }), { lamps, key: 'patlas' }),
    paint: patchMaterial(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 }), { lamps, key: 'ppaint' }),
    steel: patchMaterial(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.9 }), { lamps, key: 'psteel' }),
    card: patchMaterial(new T.MeshStandardMaterial({ map: tx.tex('tex/plywood_diff.jpg', { srgb: true }), color: 0xb08a58, roughness: 0.92 }), { lamps, key: 'pcard' }),
    glass: patchMaterial(new T.MeshStandardMaterial({ color: 0x9fb4b8, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.22, depthWrite: false }), { lamps, key: 'pglass' }),
    lit: new T.MeshBasicMaterial({ vertexColors: true, color: new T.Color(3.2, 3.2, 3.2) }),
  };
  const glbMat = (m, key, extra = '') => patchMaterial(m.clone(), { lamps, key, frag: extra ? [['roughnessmap_fragment', extra]] : [] });
  const kinds = {};
  const def = (k, o) => { kinds[k] = { kind: k, parts: [], pieces: [], ...o }; return kinds[k]; };

  if (assets.trashcan) {
    def('trashcan', { material: 'metal', mass: 10, breakable: true, hp: 60, spill: true,
      parts: [{ geo: assets.trashcan.geometry, mat: glbMat(assets.trashcan.material, 'pcan', 'roughnessFactor *= 0.8;') }],
      colliders: () => [[RAPIER.ColliderDesc.cylinder(0.45, 0.285), [0, 0.45, 0], 1]] });
    def('trashcan_lid', { material: 'metal', mass: 1.3, breakable: false, hp: 999,
      parts: [{ geo: assets.trashlid.geometry, mat: kinds.trashcan.parts[0].mat }],
      colliders: () => [[RAPIER.ColliderDesc.cylinder(0.04, 0.272), [0, 0.08, 0], 1]] });
  }
  if (assets.trashbag) def('trashbag', { material: 'plastic', mass: 4, breakable: false, hp: 999,
    parts: [{ geo: assets.trashbag.geometry, mat: glbMat(assets.trashbag.material, 'pbag') }],
    colliders: () => [[RAPIER.ColliderDesc.roundCuboid(0.19, 0.2, 0.17, 0.06), [0, 0.27, 0], 1]] });
  if (assets.barrel) def('barrel', { material: 'metal', mass: 18, breakable: false, hp: 999,
    parts: [{ geo: assets.barrel.geometry, mat: glbMat(assets.barrel.material, 'pbarrel') }],
    colliders: () => [[RAPIER.ColliderDesc.cylinder(0.465, 0.31), [0, 0.465, 0], 1]] });
  if (assets.cardboard) {
    const flaps = [];
    const bx = 0.39, by = 0.34, bz = 0.515;
    const fl = (w, h, d, o) => { const g = memo(`flap${w},${h},${d}`, () => new T.BoxGeometry(w, h, d)); return { geo: g, mat: mats.card, offset: o, half: [w / 2, h / 2, d / 2] }; };
    flaps.push(fl(bx, 0.01, bz, [0, 0.005, 0]), fl(bx, 0.01, bz, [0, by, 0]), fl(0.01, by, bz, [-bx / 2, by / 2, 0]), fl(0.01, by, bz, [bx / 2, by / 2, 0]), fl(bx, by, 0.01, [0, by / 2, -bz / 2]), fl(bx, by, 0.01, [0, by / 2, bz / 2]));
    def('cardboard', { material: 'paper', mass: 1.6, breakable: true, hp: 25,
      parts: [{ geo: assets.cardboard.geometry, mat: glbMat(assets.cardboard.material, 'pcardboard') }],
      colliders: () => [[RAPIER.ColliderDesc.cuboid(0.195, 0.17, 0.258), [0, 0.17, 0], 1]], pieces: flaps });
  }
  if (assets.hydrant) {
    const cap = assets.hydrantcap.geometry.clone();
    cap.computeBoundingBox();
    const cc = cap.boundingBox.getCenter(new T.Vector3());
    cap.translate(-cc.x, -cc.y, -cc.z);
    const hm = glbMat(assets.hydrant.material, 'phyd');
    def('hydrant', { material: 'metal', mass: 120, breakable: true, hp: 110, fixed: true, water: true,
      parts: [{ geo: assets.hydrant.geometry, mat: hm }, { geo: assets.hydrantcap.geometry, mat: hm, detach: true }],
      colliders: () => [[RAPIER.ColliderDesc.cylinder(0.4, 0.14), [0, 0.4, 0], 1]],
      pieces: [{ geo: cap, mat: hm, offset: [cc.x, cc.y, cc.z], half: [0.12, 0.05, 0.12], fromPart: 1 }] });
  }

  {
    const L = 0.6, Wd = 0.4, H = 0.38;
    const pcs = [];
    const add = (w, h, d, o, tint) => { const g = memo(`box${w},${h},${d},${tint}`, () => colorGeo(T, new T.BoxGeometry(w, h, d), tint)); pcs.push({ geo: g, mat: mats.wood, offset: o, half: [w / 2, h / 2, d / 2] }); };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(0.045, H, 0.045, [sx * (L / 2 - 0.0225), H / 2, sz * (Wd / 2 - 0.0225)], [0.7, 0.62, 0.52]);
    for (const sz of [-1, 1]) for (let k = 0; k < 3; k++) add(L, 0.085, 0.014, [0, 0.06 + k * 0.125, sz * (Wd / 2 + 0.007)], [0.82, 0.74, 0.62]);
    for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) add(0.016, H / 2 - 0.01, Wd, [sx * (L / 2 + 0.008), H / 4 + k * H / 2, 0], [0.86, 0.78, 0.66]);
    for (let k = 0; k < 3; k++) add(L - 0.02, 0.014, 0.1, [0, 0.007, -0.13 + k * 0.13], [0.76, 0.68, 0.56]);
    const whole = merge(T, pcs.map((p) => p.geo.clone().translate(...p.offset)));
    def('crate', { material: 'wood', mass: 6, breakable: true, hp: 45, parts: [{ geo: whole, mat: mats.wood }],
      colliders: () => [[RAPIER.ColliderDesc.cuboid(L / 2 + 0.01, H / 2, Wd / 2 + 0.01), [0, H / 2, 0], 1]], pieces: pcs });
  }
  {
    const pcs = [];
    const add = (w, h, d, o, tint) => { const g = memo(`box${w},${h},${d},${tint}`, () => colorGeo(T, new T.BoxGeometry(w, h, d), tint)); pcs.push({ geo: g, mat: mats.wood, offset: o, half: [w / 2, h / 2, d / 2] }); };
    for (let k = 0; k < 3; k++) add(1.2, 0.09, 0.045, [0, 0.06, -0.48 + k * 0.48], [0.75, 0.66, 0.52]);
    for (let k = 0; k < 7; k++) add(0.09, 0.018, 1.02, [-0.55 + k * (1.1 / 6), 0.114, 0], [0.82, 0.72, 0.58]);
    for (let k = 0; k < 3; k++) add(0.09, 0.016, 1.02, [-0.55 + k * 0.55, 0.008, 0], [0.7, 0.62, 0.5]);
    const whole = merge(T, pcs.map((p) => p.geo.clone().translate(...p.offset)));
    def('pallet', { material: 'wood', mass: 20, breakable: true, hp: 75, parts: [{ geo: whole, mat: mats.wood }],
      colliders: () => [[RAPIER.ColliderDesc.cuboid(0.6, 0.062, 0.51), [0, 0.062, 0], 1]], pieces: pcs });
  }
  {
    const pcs = [];
    const board = new T.BoxGeometry(2.4, 0.26, 0.045);
    cellUV(board, A('blue_paint'), [0, 1, 2, 3]);
    cellUV(board, A('sawhorse_board'), [4, 5]);
    colorGeo(T, board, [1, 1, 1]);
    pcs.push({ geo: board, mat: mats.atlas, offset: [0, 0.98, 0], half: [1.2, 0.13, 0.025] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = memo('sawleg' + sz, () => { const g = new T.BoxGeometry(0.06, 1.0, 0.06); cellUV(g, A('blue_paint')); colorGeo(T, g, [0.85, 0.85, 0.85]); g.applyQuaternion(new T.Quaternion().setFromEuler(new T.Euler(sz * 0.32, 0, 0))); return g; });
      pcs.push({ geo: leg, mat: mats.atlas, offset: [sx * 1.0, 0.48, sz * 0.15], half: [0.03, 0.5, 0.06] });
    }
    const cross = new T.BoxGeometry(0.05, 0.05, 0.62); cellUV(cross, A('blue_paint')); colorGeo(T, cross, [0.8, 0.8, 0.8]);
    const whole = merge(T, [...pcs.map((p) => p.geo.clone().translate(...p.offset)), cross.clone().translate(-1, 0.3, 0), cross.clone().translate(1, 0.3, 0)]);
    def('sawhorse', { material: 'wood', mass: 12, breakable: true, hp: 40, parts: [{ geo: whole, mat: mats.atlas }],
      colliders: () => [[RAPIER.ColliderDesc.cuboid(1.2, 0.13, 0.03), [0, 0.98, 0], 0.5], [RAPIER.ColliderDesc.cuboid(0.05, 0.46, 0.32), [-1.0, 0.46, 0], 0.25], [RAPIER.ColliderDesc.cuboid(0.05, 0.46, 0.32), [1.0, 0.46, 0], 0.25]],
      pieces: pcs });
  }
  {
    const prof = [[0.0, 0.7], [0.022, 0.7], [0.03, 0.66], [0.13, 0.04], [0.14, 0.03], [0.0, 0.03]].map(([r, y]) => new T.Vector2(r, y));
    const body = new T.LatheGeometry(prof, 18);
    const pos = body.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const white = (y > 0.42 && y < 0.5) || (y > 0.27 && y < 0.34); col.set(white ? [0.95, 0.95, 0.92] : [1.0, 0.27, 0.03], i * 3); }
    body.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    const base = new T.BoxGeometry(0.38, 0.03, 0.38); base.translate(0, 0.015, 0); colorGeo(T, base, [0.03, 0.03, 0.03]);
    def('cone', { material: 'plastic', mass: 2.8, breakable: false, hp: 999, parts: [{ geo: merge(T, [body, base]), mat: mats.paint }],
      colliders: () => [[RAPIER.ColliderDesc.cone(0.33, 0.14), [0, 0.36, 0], 0.4], [RAPIER.ColliderDesc.cuboid(0.19, 0.015, 0.19), [0, 0.015, 0], 0.6]] });
  }
  {
    const make = (cell, tint) => {
      const box = new T.BoxGeometry(0.5, 0.56, 0.42); box.translate(0, 0.78, 0); colorGeo(T, box, tint);
      const top = new T.BoxGeometry(0.52, 0.04, 0.44); top.translate(0, 1.08, 0); colorGeo(T, top, tint.map((c) => c * 0.8));
      const post = new T.BoxGeometry(0.08, 0.5, 0.08); post.translate(0, 0.25, 0); colorGeo(T, post, [0.1, 0.1, 0.1]);
      const foot = new T.BoxGeometry(0.4, 0.02, 0.36); foot.translate(0, 0.01, 0); colorGeo(T, foot, [0.1, 0.1, 0.1]);
      return merge(T, [box, top, post, foot]);
    };
    const tints = [[0.62, 0.12, 0.1], [0.8, 0.62, 0.1], [0.12, 0.25, 0.55]];
    const doorGeo = (i) => { const d = new T.BoxGeometry(0.46, 0.5, 0.02); cellUV(d, A('news_' + i), [4]); colorGeo(T, d, [1, 1, 1]); return d; };
    const papers = [];
    const paperGeo = (() => { const p = new T.BoxGeometry(0.3, 0.004, 0.4); cellUV(p, A('newspaper'), [2, 3]); colorGeo(T, p, [0.95, 0.94, 0.9]); return p; })();
    for (let k = 0; k < 6; k++) { const p = paperGeo; papers.push({ geo: p, mat: mats.atlas, offset: [(k % 2 - 0.5) * 0.12, 0.62 + k * 0.03, 0.02], half: [0.15, 0.01, 0.2], light: true }); }
    for (let i = 0; i < 3; i++) {
      const dg = doorGeo(i);
      def('newsbox' + i, { material: 'metal', mass: 32, breakable: true, hp: 70, family: 'newsbox',
        parts: [{ geo: make(null, tints[i]), mat: mats.paint }, { geo: dg, mat: mats.atlas, offset: [0, 0.78, 0.22], detach: true }],
        colliders: () => [[RAPIER.ColliderDesc.cuboid(0.25, 0.3, 0.21), [0, 0.8, 0], 0.8], [RAPIER.ColliderDesc.cuboid(0.2, 0.25, 0.18), [0, 0.25, 0], 0.2]],
        pieces: [{ geo: dg, mat: mats.atlas, offset: [0, 0.78, 0.22], half: [0.23, 0.25, 0.012], fromPart: 1 }, ...papers] });
    }
  }
  {
    const body = new T.BoxGeometry(0.52, 0.86, 0.48); body.translate(0, 0.62, 0); cellUV(body, A('mailbox'), [4, 0, 1]); colorGeo(T, body, [1, 1, 1]);
    const dome = new T.CylinderGeometry(0.26, 0.26, 0.48, 16, 1, false, 0, Math.PI); dome.rotateZ(Math.PI / 2); dome.rotateY(Math.PI / 2); dome.translate(0, 1.05, 0);
    cellUV(dome, A('blue_paint')); colorGeo(T, dome, [0.85, 0.85, 0.9]);
    const legs = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = new T.BoxGeometry(0.05, 0.2, 0.05); l.translate(sx * 0.22, 0.1, sz * 0.2); cellUV(l, A('blue_paint')); colorGeo(T, l, [0.6, 0.6, 0.65]); legs.push(l); }
    const chute = new T.BoxGeometry(0.34, 0.12, 0.06); cellUV(chute, A('grey_metal')); colorGeo(T, chute, [0.6, 0.62, 0.66]);
    const letters = [];
    const letterGeo = colorGeo(T, new T.BoxGeometry(0.16, 0.003, 0.1), [0.9, 0.88, 0.82]);
    for (let k = 0; k < 8; k++) { const e = letterGeo; letters.push({ geo: e, mat: mats.paint, offset: [(k % 3 - 1) * 0.1, 0.5 + k * 0.04, 0.0], half: [0.08, 0.01, 0.05], light: true }); }
    def('mailbox', { material: 'metal', mass: 80, breakable: true, hp: 140,
      parts: [{ geo: merge(T, [body, dome, ...legs]), mat: mats.atlas }, { geo: chute, mat: mats.atlas, offset: [0, 0.98, 0.26], detach: true }],
      colliders: () => [[RAPIER.ColliderDesc.cuboid(0.27, 0.6, 0.25), [0, 0.62, 0], 1]],
      pieces: [{ geo: chute, mat: mats.atlas, offset: [0, 0.98, 0.26], half: [0.17, 0.06, 0.03], fromPart: 1 }, ...letters] });
  }
  {
    const fr = [];
    const steel = [0.62, 0.64, 0.66];
    const bar = (w, h, d, x, y, z, c = steel) => { const g = new T.BoxGeometry(w, h, d); g.translate(x, y, z); colorGeo(T, g, c); fr.push(g); };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(0.05, 2.2, 0.05, sx * 0.43, 1.1, sz * 0.43);
    bar(0.92, 0.06, 0.92, 0, 2.2, 0); bar(0.92, 0.05, 0.92, 0, 0.03, 0);
    for (const sx of [-1, 1]) bar(0.02, 0.85, 0.86, sx * 0.43, 0.48, 0);
    bar(0.86, 0.85, 0.02, 0, 0.48, -0.43);
    bar(0.86, 0.3, 0.02, 0, 2.02, -0.43, [0.2, 0.2, 0.22]);
    bar(0.22, 0.38, 0.12, 0, 1.45, -0.36, [0.06, 0.06, 0.07]);
    bar(0.06, 0.2, 0.06, 0.13, 1.42, -0.3, [0.02, 0.02, 0.02]);
    bar(0.3, 0.02, 0.2, 0, 1.08, -0.33, [0.5, 0.5, 0.5]);
    const header = [];
    for (const [ry, ox, oz] of [[0, 0, 0.465], [Math.PI / 2, 0.465, 0], [-Math.PI / 2, -0.465, 0]]) {
      const h = new T.PlaneGeometry(0.84, 0.2); cellUV(h, A('phone_header')); h.rotateY(ry); h.translate(ox, 2.08, oz); colorGeo(T, h, [1, 1, 1]); header.push(h);
    }
    const glassPieces = [];
    const shard = (w, h, x, y, z, ry) => {
      const g = memo(`shard${w},${h},${ry}`, () => { const gg = new T.BoxGeometry(w, h, 0.008); gg.rotateY(ry); colorGeo(T, gg, [1, 1, 1]); return gg; });
      glassPieces.push({ geo: g, mat: mats.glass, offset: [x, y, z], half: [Math.max(0.01, Math.abs(Math.cos(ry)) * w / 2), h / 2, Math.max(0.01, Math.abs(Math.sin(ry)) * w / 2)], light: true });
    };
    for (const [ry, ox, oz] of [[0, 0, 0.43], [Math.PI / 2, 0.43, 0], [Math.PI / 2, -0.43, 0], [0, 0, -0.43]]) {
      for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) {
        const w = 0.4, h = 0.36;
        const s = (a - 0.5) * 0.41;
        shard(w, h, ox + Math.cos(ry) * s, 1.08 + b * 0.37, oz - Math.sin(ry) * s, ry);
      }
    }
    const glassWhole = merge(T, glassPieces.map((p) => p.geo.clone().translate(...p.offset)));
    const light = new T.BoxGeometry(0.5, 0.03, 0.12); light.translate(0, 2.15, 0); colorGeo(T, light, [0.75, 0.9, 1.0]);
    def('phonebooth', { material: 'glass', mass: 190, breakable: true, hp: 80, lamp: { y: 2.0, color: [0.78, 0.92, 1.0], intensity: 26 },
      parts: [{ geo: merge(T, fr), mat: mats.steel }, { geo: merge(T, header), mat: mats.lit }, { geo: light, mat: mats.lit }, { geo: glassWhole, mat: mats.glass, detach: true }],
      colliders: () => [[RAPIER.ColliderDesc.cuboid(0.46, 1.1, 0.46), [0, 1.1, 0], 1]],
      pieces: glassPieces.map((p) => ({ ...p, fromPart: 3 })) });
  }
  {
    const pcs = [];
    const slat = (y, z, rx) => { const g = memo('slat' + rx, () => { const gg = new T.BoxGeometry(1.8, 0.035, 0.09); gg.rotateX(rx); colorGeo(T, gg, [0.42, 0.55, 0.36]); return gg; }); pcs.push({ geo: g, mat: mats.wood, offset: [0, y, z], half: [0.9, 0.03, 0.05] }); };
    for (let k = 0; k < 3; k++) slat(0.45, -0.05 + k * 0.12, 0);
    for (let k = 0; k < 3; k++) slat(0.62 + k * 0.13, -0.24 - k * 0.025, -0.25);
    const benchFrame = (() => {
      const fr = [];
      const b = (w, h, d, x, y, z, rx = 0) => { const g = new T.BoxGeometry(w, h, d); g.rotateX(rx); g.translate(x, y, z); colorGeo(T, g, [0.03, 0.035, 0.03]); fr.push(g); };
      b(0.05, 0.45, 0.05, 0, 0.225, 0.14); b(0.05, 0.85, 0.05, 0, 0.42, -0.2, -0.12); b(0.05, 0.05, 0.42, 0, 0.42, -0.02); b(0.05, 0.04, 0.3, 0, 0.62, 0.05);
      return merge(T, fr);
    })();
    for (const sx of [-1, 1]) {
      pcs.push({ geo: benchFrame, mat: mats.paint, offset: [sx * 0.82, 0, 0], half: [0.03, 0.42, 0.22], center: [0, 0.42, -0.02] });
    }
    const whole = [mergeGeometries(pcs.filter((p) => p.mat === mats.wood).map((p) => norm(p.geo.clone().translate(...p.offset)))), mergeGeometries(pcs.filter((p) => p.mat === mats.paint).map((p) => norm(p.geo.clone().translate(...p.offset))))];
    def('bench', { material: 'wood', mass: 45, breakable: true, hp: 90, parts: [{ geo: whole[0], mat: mats.wood }, { geo: whole[1], mat: mats.paint }],
      colliders: () => [[RAPIER.ColliderDesc.cuboid(0.9, 0.04, 0.2), [0, 0.45, 0.07], 0.4], [RAPIER.ColliderDesc.cuboid(0.9, 0.2, 0.04), [0, 0.72, -0.27], 0.2], [RAPIER.ColliderDesc.cuboid(0.04, 0.22, 0.22), [-0.82, 0.22, 0], 0.2], [RAPIER.ColliderDesc.cuboid(0.04, 0.22, 0.22), [0.82, 0.22, 0], 0.2]],
      pieces: pcs });
  }
  {
    const pole = new T.CylinderGeometry(0.028, 0.034, 1.15, 8); pole.translate(0, 0.575, 0); colorGeo(T, pole, [0.25, 0.26, 0.26]);
    const headG = merge(T, [colorGeo(T, new T.BoxGeometry(0.16, 0.26, 0.11), [0.45, 0.46, 0.47]), colorGeo(T, new T.SphereGeometry(0.075, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.13, 0), [0.6, 0.62, 0.62])]);
    def('meter', { material: 'metal', mass: 25, breakable: true, hp: 50, fixed: true,
      parts: [{ geo: pole, mat: mats.steel }, { geo: headG, mat: mats.steel, offset: [0, 1.28, 0], detach: true }],
      colliders: () => [[RAPIER.ColliderDesc.cylinder(0.65, 0.05), [0, 0.65, 0], 1]],
      pieces: [{ geo: headG, mat: mats.steel, offset: [0, 1.28, 0], half: [0.08, 0.15, 0.06], fromPart: 1 }] });
  }
  {
    const tube = new T.CylinderGeometry(0.24, 0.24, 2.9, 20, 1, true); tube.translate(0, 1.6, 0); cellUV(tube, A('stack_stripes')); colorGeo(T, tube, [1, 1, 1]);
    const flare = new T.CylinderGeometry(0.24, 0.42, 0.18, 20); flare.translate(0, 0.09, 0); colorGeo(T, flare, [0.85, 0.3, 0.05]);
    const rim = new T.TorusGeometry(0.24, 0.025, 6, 20); rim.rotateX(Math.PI / 2); rim.translate(0, 3.05, 0); colorGeo(T, rim, [0.9, 0.9, 0.88]);
    def('stack', { material: 'plastic', mass: 22, breakable: false, hp: 999, parts: [{ geo: merge(T, [tube, flare, rim]), mat: mats.atlas }],
      colliders: () => [[RAPIER.ColliderDesc.cylinder(1.5, 0.25), [0, 1.55, 0], 0.8], [RAPIER.ColliderDesc.cylinder(0.09, 0.42), [0, 0.09, 0], 0.2]] });
  }
  {
    const st = [0.72, 0.74, 0.76];
    const box = new T.BoxGeometry(1.5, 0.62, 0.78); box.translate(0, 0.62, 0); cellUV(box, A('cart_panel'), [4, 5]); cellUV(box, A('grey_metal'), [0, 1, 2, 3]); colorGeo(T, box, [1, 1, 1]);
    const top = new T.BoxGeometry(1.56, 0.06, 0.84); top.translate(0, 0.96, 0); colorGeo(T, top, st);
    const lid1 = new T.BoxGeometry(0.42, 0.1, 0.36); lid1.translate(-0.45, 1.04, 0); colorGeo(T, lid1, [0.8, 0.82, 0.84]);
    const lid2 = new T.BoxGeometry(0.42, 0.1, 0.36); lid2.translate(0.45, 1.04, 0); colorGeo(T, lid2, [0.8, 0.82, 0.84]);
    const wheels = [];
    for (const sz of [-1, 1]) { const w = new T.CylinderGeometry(0.3, 0.3, 0.07, 18); w.rotateX(Math.PI / 2); w.translate(-0.55, 0.3, sz * 0.43); colorGeo(T, w, [0.06, 0.06, 0.06]); wheels.push(w); }
    const leg = new T.BoxGeometry(0.05, 0.31, 0.05); leg.translate(0.68, 0.155, 0); colorGeo(T, leg, st);
    const handle = new T.CylinderGeometry(0.02, 0.02, 0.8, 8); handle.rotateX(Math.PI / 2); handle.translate(0.86, 0.95, 0); colorGeo(T, handle, st);
    const pole = new T.CylinderGeometry(0.025, 0.025, 1.65, 8); pole.translate(0.1, 1.82, 0); colorGeo(T, pole, st);
    const umb = new T.ConeGeometry(1.05, 0.45, 16, 1, true); umb.translate(0, 0, 0);
    const uv = umb.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i));
    cellUV(umb, A('umbrella')); colorGeo(T, umb, [1, 1, 1]);
    const umbPiece = { geo: umb, mat: mats.atlas, offset: [0.1, 2.62, 0], half: [0.8, 0.2, 0.8], fromPart: 1 };
    const polePiece = { geo: pole.clone().translate(-0.1, -1.82, 0), mat: mats.steel, offset: [0.1, 1.82, 0], half: [0.03, 0.8, 0.03], fromPart: 2 };
    const lidC = lid1.clone(); lidC.translate(0.45, -1.04, 0);
    const lidPieces = [0, 1].map((k) => ({ geo: lidC, mat: mats.steel, offset: [k ? 0.45 : -0.45, 1.04, 0], half: [0.21, 0.05, 0.18], fromPart: 3 }));
    def('hotdogcart', { material: 'metal', mass: 150, breakable: true, hp: 200,
      parts: [{ geo: merge(T, [box, top, ...wheels, leg, handle]), mat: mats.atlas }, { geo: umb, mat: mats.atlas, offset: [0.1, 2.62, 0], detach: true },
        { geo: pole.clone().translate(-0.1, -1.82, 0), mat: mats.steel, offset: [0.1, 1.82, 0], detach: true }, { geo: merge(T, [lid1, lid2]), mat: mats.steel, detach: true }],
      colliders: () => [[RAPIER.ColliderDesc.cuboid(0.78, 0.35, 0.42), [0, 0.65, 0], 0.85], [RAPIER.ColliderDesc.cylinder(0.3, 0.3).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }), [-0.55, 0.3, 0], 0.1], [RAPIER.ColliderDesc.cuboid(0.03, 0.15, 0.03), [0.68, 0.16, 0], 0.05]],
      pieces: [umbPiece, polePiece, ...lidPieces] });
    const frank = new T.CapsuleGeometry(0.014, 0.15, 4, 8); frank.rotateZ(Math.PI / 2); frank.translate(0, 0.035, 0); cellUV(frank, A('frank')); colorGeo(T, frank, [1, 1, 1]);
    const bun = new T.CylinderGeometry(0.032, 0.032, 0.17, 10, 1, false, Math.PI * 0.15, Math.PI * 1.7); bun.rotateZ(Math.PI / 2); bun.translate(0, 0.03, 0); cellUV(bun, A('bun')); colorGeo(T, bun, [1, 1, 1]);
    def('hotdog', { material: 'cloth', mass: 0.16, breakable: false, hp: 999, food: true, parts: [{ geo: merge(T, [frank, bun]), mat: mats.atlas }],
      colliders: () => [[RAPIER.ColliderDesc.cuboid(0.085, 0.03, 0.033), [0, 0.03, 0], 1]] });
    const pretz = new T.TorusGeometry(0.055, 0.017, 6, 14); pretz.rotateX(Math.PI / 2); pretz.translate(0, 0.017, 0); cellUV(pretz, A('frank')); colorGeo(T, pretz, [0.75, 0.5, 0.3]);
    def('pretzel', { material: 'cloth', mass: 0.12, breakable: false, hp: 999, food: true, parts: [{ geo: pretz, mat: mats.atlas }],
      colliders: () => [[RAPIER.ColliderDesc.cylinder(0.017, 0.07), [0, 0.017, 0], 1]] });
    const can = new T.CylinderGeometry(0.033, 0.033, 0.122, 12); can.translate(0, 0.061, 0); cellUV(can, A('soda')); colorGeo(T, can, [1, 1, 1]);
    def('soda', { material: 'metal', mass: 0.37, breakable: false, hp: 999, food: true, parts: [{ geo: can, mat: mats.atlas }],
      colliders: () => [[RAPIER.ColliderDesc.cylinder(0.061, 0.033), [0, 0.061, 0], 1]] });
    for (const [k, cell] of [['mustard', 'mustard'], ['ketchup', 'ketchup']]) {
      const b = new T.CylinderGeometry(0.03, 0.035, 0.17, 12); b.translate(0, 0.085, 0);
      const tip = new T.ConeGeometry(0.02, 0.06, 10); tip.translate(0, 0.2, 0);
      cellUV(b, A(cell)); cellUV(tip, A(cell)); colorGeo(T, b, [1, 1, 1]); colorGeo(T, tip, [1, 1, 1]);
      def(k, { material: 'plastic', mass: 0.4, breakable: false, hp: 999, food: true, parts: [{ geo: merge(T, [b, tip]), mat: mats.atlas }],
        colliders: () => [[RAPIER.ColliderDesc.cylinder(0.1, 0.034), [0, 0.1, 0], 1]] });
    }
  }
  {
    const paper = colorGeo(T, new T.IcosahedronGeometry(0.06, 0), [0.8, 0.78, 0.72]);
    const tin = colorGeo(T, new T.CylinderGeometry(0.033, 0.033, 0.12, 8), [0.55, 0.12, 0.1]);
    const bottle = colorGeo(T, new T.CylinderGeometry(0.035, 0.04, 0.24, 8), [0.08, 0.2, 0.1]);
    kinds.trashcan && (kinds.trashcan.pieces = [
      { geo: paper, mat: mats.paint, offset: [0.05, 0.7, 0.02], half: [0.05, 0.05, 0.05], light: true },
      { geo: paper, mat: mats.paint, offset: [-0.08, 0.75, -0.04], half: [0.05, 0.05, 0.05], light: true },
      { geo: paper, mat: mats.paint, offset: [0.0, 0.8, 0.09], half: [0.05, 0.05, 0.05], light: true },
      { geo: tin, mat: mats.paint, offset: [0.1, 0.72, -0.08], half: [0.033, 0.06, 0.033], light: true },
      { geo: bottle, mat: mats.paint, offset: [-0.1, 0.7, 0.08], half: [0.037, 0.12, 0.037], light: true },
      { geo: paper, mat: mats.paint, offset: [0.02, 0.84, -0.1], half: [0.05, 0.05, 0.05], light: true },
    ]);
  }

  const list = [];
  const place = (kind, x, y, z, yaw, extra = {}) => list.push({ kind, x, y, z, yaw, ...extra });
  for (const p of PROPS) {
    const [x, z] = p.at;
    const s = streetSurface(x, z);
    const gy = s === 'road' ? 0 : SIDEWALK_H;
    const yaw = p.rot || 0;
    if (p.kind === 'trashcan') { place('trashcan', x, gy, z, yaw); place('trashcan_lid', x, gy + 0.868, z, yaw); }
    else if (p.kind === 'newsbox') place('newsbox' + (p.v || 0), x, gy, z, yaw);
    else if (p.kind === 'crate' && p.stack) place('crate', x, gy + 0.39, z, yaw);
    else if (p.kind === 'pallet') { place('pallet', x, gy, z, yaw); place('pallet', x + 0.02, gy + 0.127, z - 0.01, yaw + 0.05); }
    else if (kinds[p.kind]) place(p.kind, x, gy, z, yaw);
  }
  const cartY = SIDEWALK_H;
  place('hotdogcart', HOTDOG.pos[0], cartY, HOTDOG.pos[1], HOTDOG.yaw);
  const cy = Math.cos(HOTDOG.yaw), sy = Math.sin(HOTDOG.yaw);
  const onCart = (lx, lz) => [HOTDOG.pos[0] + lx * cy + lz * sy, HOTDOG.pos[1] - lx * sy + lz * cy];
  const foods = [['hotdog', -0.15, 0.27], ['hotdog', 0.05, 0.26], ['hotdog', 0.2, 0.3], ['hotdog', -0.05, 0.05], ['pretzel', 0.6, 0.3], ['pretzel', 0.02, -0.08],
    ['soda', -0.7, 0.32], ['soda', -0.6, 0.33], ['soda', -0.5, 0.26], ['mustard', 0.12, -0.3], ['ketchup', 0.0, -0.31]];
  for (const [k, lx, lz] of foods) { const [x, z] = onCart(lx, lz); place(k, x, cartY + 1.004, z, HOTDOG.yaw + (lx * 3)); }

  const counts = {};
  for (const it of list) counts[it.kind] = (counts[it.kind] || 0) + 1;
  const imeshes = {};
  for (const k in counts) {
    const K = kinds[k];
    K.im = K.parts.map((pt, j) => {
      const im = new T.InstancedMesh(pt.geo, pt.mat, counts[k]);
      im.name = 'Prop_' + k + '_' + j;
      im.castShadow = pt.mat !== mats.glass && pt.mat !== mats.lit;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(T.DynamicDrawUsage);
      im.frustumCulled = false;
      root.add(im);
      return im;
    });
    K.n = 0;
    imeshes[k] = K.im;
  }
  const pools = new Map();
  for (const k in counts) {
    const K = kinds[k];
    if (!K.pieces.length || !(K.breakable || K.spill)) continue;
    for (const pc of K.pieces) {
      const key = pc.geo.uuid + ':' + pc.mat.uuid;
      if (!pools.has(key)) pools.set(key, { geo: pc.geo, mat: pc.mat, n: 0, used: 0, active: 0, im: null });
      pools.get(key).n += counts[k];
    }
  }
  const zeroM0 = new T.Matrix4().makeScale(0, 0, 0);
  for (const pool of pools.values()) {
    const im = new T.InstancedMesh(pool.geo, pool.mat, pool.n);
    im.name = 'Debris_' + pool.n;
    im.castShadow = pool.mat !== mats.glass;
    im.receiveShadow = true;
    im.instanceMatrix.setUsage(T.DynamicDrawUsage);
    im.frustumCulled = false;
    im.visible = false;
    for (let i = 0; i < pool.n; i++) im.setMatrixAt(i, zeroM0);
    root.add(im);
    pool.im = im;
  }
  const props = [];
  const debris = [];
  const byCollider = new Map();
  const q = new T.Quaternion(), e = new T.Euler(), m4 = new T.Matrix4(), v3 = new T.Vector3(), one = new T.Vector3(1, 1, 1);
  const zeroM = new T.Matrix4().makeScale(0, 0, 0);
  let uid = 0;
  for (const it of list) {
    const K = kinds[it.kind];
    const idx = K.n++;
    q.setFromEuler(e.set(0, it.yaw, 0));
    const [fr, rest] = PHYS[K.material] || [0.6, 0.2];
    const desc = (K.fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.06).setAngularDamping(0.25).setCanSleep(true).setSleeping(true))
      .setTranslation(it.x, it.y, it.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    if (K.food) desc.setCcdEnabled(true);
    const body = world.createRigidBody(desc);
    ctx.bodies.push(body);
    const cols = [];
    for (const [cd, off, frac] of K.colliders()) {
      cd.setTranslation(off[0], off[1], off[2]).setCollisionGroups(GROUP_PROP).setFriction(fr).setRestitution(rest);
      if (!K.fixed) cd.setMass(K.mass * frac);
      cols.push(world.createCollider(cd, body));
    }
    const o3 = new T.Group();
    o3.name = it.kind + '_' + idx;
    o3.position.set(it.x, it.y, it.z);
    o3.quaternion.copy(q);
    o3.updateMatrix();
    o3.updateMatrixWorld();
    root.add(o3);
    const id = it.kind.replace(/\d+$/, '') + '_' + (uid++);
    const prop = {
      id, kind: K.family || it.kind, object3D: o3, body, collider: cols[0], colliders: cols, material: K.material, mass: K.mass, breakable: K.breakable, hp: K.hp,
      dead: false, broken: false, food: !!K.food, fixed: !!K.fixed,
      _K: K, _i: idx, _hidden: new Set(), _lv: new T.Vector3(), _sleep: false, _pieces: [],
    };
    prop.onBreak = (dir) => breakProp(prop, dir);
    prop.damage = (amount, dir) => { if (!prop.breakable || prop.dead) return; prop.hp -= amount; if (prop.hp <= 0) prop.onBreak(dir || new T.Vector3(0, 1, 0)); };
    for (const c of cols) byCollider.set(c.handle, prop);
    if (K.pieces.length && (K.breakable || K.spill)) {
      K.pieces.forEach((pc, j) => {
        const pool = pools.get(pc.geo.uuid + ':' + pc.mat.uuid);
        const slot = pool.used++;
        const pdesc = RAPIER.RigidBodyDesc.dynamic().setLinearDamping(pc.light ? 0.9 : 0.12).setAngularDamping(pc.light ? 1.2 : 0.3).setCanSleep(true).setTranslation(it.x, it.y - 50 - j, it.z).setEnabled(false);
        if (pc.half[0] < 0.04 || pc.half[2] < 0.04 || pc.light) pdesc.setCcdEnabled(true);
        const pb = world.createRigidBody(pdesc);
        ctx.bodies.push(pb);
        const vol = pc.half[0] * pc.half[1] * pc.half[2];
        const cd = RAPIER.ColliderDesc.cuboid(Math.max(0.006, pc.half[0]), Math.max(0.006, pc.half[1]), Math.max(0.006, pc.half[2])).setCollisionGroups(GROUP_DEBRIS).setFriction(fr).setRestitution(rest * 0.8);
        if (pc.center) cd.setTranslation(...pc.center);
        cd.setMass(Math.max(0.05, K.mass * Math.min(0.5, vol * 300 / Math.max(1, K.pieces.length))));
        world.createCollider(cd, pb);
        const d = { body: pb, im: pool.im, pool, i: slot, pc, active: false, prop, sleep: false };
        prop._pieces.push(d);
        debris.push(d);
      });
    }
    if (K.lamp) prop._lamp = K.lamp;
    props.push(prop);
    writeProp(prop, true);
  }

  function writeProp(p, force = false) {
    const K = p._K;
    if (p.dead && !p._keepVisual) { for (const im of K.im) { im.setMatrixAt(p._i, zeroM); im.instanceMatrix.needsUpdate = true; } return; }
    const o = p.object3D;
    if (!force && !o.visible) { for (const im of K.im) { im.setMatrixAt(p._i, zeroM); im.instanceMatrix.needsUpdate = true; } return; }
    o.updateMatrix();
    K.parts.forEach((pt, j) => {
      const im = K.im[j];
      if (p._hidden.has(j) || !o.visible) im.setMatrixAt(p._i, zeroM);
      else if (pt.offset) { m4.makeTranslation(pt.offset[0], pt.offset[1], pt.offset[2]); m4.premultiply(o.matrix); im.setMatrixAt(p._i, m4); }
      else im.setMatrixAt(p._i, o.matrix);
      im.instanceMatrix.needsUpdate = true;
    });
  }

  const tq = new T.Quaternion(), tv = new T.Vector3(), tv2 = new T.Vector3();
  function breakProp(p, dir) {
    if (p.dead || p.broken) return;
    const K = p._K;
    const t = p.body.translation(), r = p.body.rotation();
    const lv = p.body.isDynamic() ? p.body.linvel() : { x: 0, y: 0, z: 0 };
    tq.set(r.x, r.y, r.z, r.w);
    const dx = dir ? dir.x : 0, dy = dir ? dir.y : 0, dz = dir ? dir.z : 0;
    p.broken = true;
    p.hp = 0;
    const keep = K.spill || K.parts.some((pt) => pt.detach) || K.water;
    for (const d of p._pieces) {
      tv.set(...d.pc.offset).applyQuaternion(tq).add(tv2.set(t.x, t.y, t.z));
      d.body.setTranslation({ x: tv.x, y: tv.y, z: tv.z }, false);
      d.body.setRotation({ x: tq.x, y: tq.y, z: tq.z, w: tq.w }, false);
      const out = tv.sub(tv2.set(t.x, t.y + (K.spill ? 0.2 : 0.3), t.z)).normalize();
      const kick = K.spill ? 3.2 : K.water ? 9 : 2.6;
      d.body.setLinvel({ x: lv.x + dx * 3.5 + out.x * kick * (0.6 + Math.random()), y: lv.y + Math.abs(dy) * 2 + (K.water ? 7 : 2.2) + Math.random() * 2, z: lv.z + dz * 3.5 + out.z * kick * (0.6 + Math.random()) }, false);
      d.body.setAngvel({ x: (Math.random() - 0.5) * 14, y: (Math.random() - 0.5) * 14, z: (Math.random() - 0.5) * 14 }, false);
      d.body.setEnabled(true);
      d.body.wakeUp();
      d.active = true;
      d.sleep = false;
      d.pool.active++;
      d.im.visible = true;
    }
    if (keep) {
      for (let j = 0; j < K.parts.length; j++) if (K.parts[j].detach) p._hidden.add(j);
      p.breakable = false;
      p.hp = 999;
      p.broken = true;
      if (K.lamp) p._lampOff = true;
      writeProp(p, true);
      if (K.water && ctx.onHydrant) ctx.onHydrant(p);
      if (p.body.isDynamic()) p.body.wakeUp();
    } else {
      p.dead = true;
      p.body.setEnabled(false);
      for (const im of K.im) { im.setMatrixAt(p._i, zeroM); im.instanceMatrix.needsUpdate = true; }
    }
    ctx.onBreak?.(p, dir);
  }

  const lampDef = props.find((p) => p._lamp);
  function update(dt) {
    for (const p of props) {
      if (p.fixed && !p.broken) continue;
      if (p.eaten || (p.dead && !p._keepVisual)) { if (!p._gone) { p._gone = true; blobs.hide(p); for (const im of p._K.im) { im.setMatrixAt(p._i, zeroM); im.instanceMatrix.needsUpdate = true; } } continue; }
      if (!p.object3D.visible) { if (!p._hid) { p._hid = true; writeProp(p); blobs.hide(p); } continue; }
      p._hid = false;
      const b = p.body;
      if (!b.isEnabled()) continue;
      const sleeping = b.isSleeping();
      if (sleeping && p._sleep) continue;
      p._sleep = sleeping;
      const t = b.translation(), r = b.rotation();
      p.object3D.position.set(t.x, t.y, t.z);
      p.object3D.quaternion.set(r.x, r.y, r.z, r.w);
      writeProp(p);
      blobs.set(p);
      if (p.breakable && b.isDynamic()) {
        const v = b.linvel();
        const dv = Math.hypot(v.x - p._lv.x, v.y - p._lv.y, v.z - p._lv.z);
        if (dv > 7.5 && dt > 0) {
          const dmg = (dv - 7.5) * 9;
          p.hp -= dmg;
          if (p.hp <= 0) { tv.set(p._lv.x, p._lv.y, p._lv.z); if (tv.lengthSq() < 1e-4) tv.set(v.x, v.y, v.z); tv.normalize(); breakProp(p, tv.clone()); }
        }
        p._lv.set(v.x, v.y, v.z);
      }
      if (t.y < -25 && !p.dead) { p.dead = true; b.setEnabled(false); }
    }
    for (const d of debris) {
      if (!d.active) continue;
      const b = d.body;
      const sleeping = b.isSleeping();
      if (sleeping && d.sleep) continue;
      d.sleep = sleeping;
      const t = b.translation(), r = b.rotation();
      if (t.y < -25) { d.active = false; b.setEnabled(false); d.im.setMatrixAt(d.i, zeroM); d.im.instanceMatrix.needsUpdate = true; if (--d.pool.active <= 0) d.im.visible = false; continue; }
      tq.set(r.x, r.y, r.z, r.w);
      m4.compose(tv.set(t.x, t.y, t.z), tq, one);
      d.im.setMatrixAt(d.i, m4);
      d.im.instanceMatrix.needsUpdate = true;
    }
  }

  buildLitter(T, root, mats, A);
  const blobs = buildBlobs(T, root, props);
  const cart = props.find((p) => p.kind === 'hotdogcart');
  return { props, debris, kinds, pools, update, byCollider, cart, lampProp: lampDef, mats };
}

function buildLitter(T, root, mats, A) {
  const R = rng(4242);
  const kinds = [
    { geo: colorGeo(T, new T.IcosahedronGeometry(0.055, 0), [0.62, 0.6, 0.55]), mat: mats.paint, n: 70, y: 0.03, flat: false },
    { geo: (() => { const g = new T.PlaneGeometry(0.34, 0.44, 2, 2); g.rotateX(-Math.PI / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, Math.abs(p.getX(i)) * 0.06 + Math.abs(p.getZ(i)) * 0.02); g.computeVertexNormals(); cellUV(g, A('newspaper')); colorGeo(T, g, [0.7, 0.68, 0.62]); return g; })(), mat: mats.atlas, n: 46, y: 0.004, flat: true },
    { geo: colorGeo(T, new T.CylinderGeometry(0.04, 0.03, 0.095, 10), [0.82, 0.8, 0.76]), mat: mats.paint, n: 18, y: 0.035, lie: true },
    { geo: colorGeo(T, new T.CylinderGeometry(0.033, 0.033, 0.12, 10), [0.5, 0.1, 0.08]), mat: mats.paint, n: 18, y: 0.033, lie: true },
  ];
  const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3(1, 1, 1);
  for (const k of kinds) {
    const im = new T.InstancedMesh(k.geo, k.mat, k.n);
    im.name = 'Litter';
    im.receiveShadow = true;
    let i = 0, guard = 0;
    while (i < k.n && guard++ < 4000) {
      const x = (R() - 0.5) * (PLATE.size - 4), z = (R() - 0.5) * (PLATE.size - 4);
      const s = streetSurface(x, z);
      if (s === 'building' || s === 'void') continue;
      const cd = curbDist(x, z);
      const near = s === 'road' ? Math.exp(-cd / 0.8) : Math.exp(-cd / 1.4) * 0.6 + 0.12;
      const inRoad = s === 'road' && Math.abs(x) < AVE.x1 + 6 && Math.abs(z) < ST.z1 + 30;
      if (R() > near * (inRoad ? 1 : 0.8)) continue;
      const gy = s === 'road' ? 0 : SIDEWALK_H;
      e.set(k.lie ? Math.PI / 2 : (k.flat ? 0 : R() * 6), R() * Math.PI * 2, k.lie ? 0 : (k.flat ? 0 : R() * 6));
      q.setFromEuler(e);
      const ss = 0.75 + R() * 0.5;
      sc.set(ss, ss, ss);
      m4.compose(v.set(x, gy + k.y * ss, z), q, sc);
      im.setMatrixAt(i++, m4);
    }
    im.count = i;
    root.add(im);
  }
}

function buildBlobs(T, root, props) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.42)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const tex = new T.CanvasTexture(c);
  const geo = new T.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new T.MeshBasicMaterial({ color: 0x000000, map: tex, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const list = props.filter((p) => !p.fixed && !p.food);
  const im = new T.InstancedMesh(geo, mat, list.length);
  im.name = 'PropBlobs';
  im.frustumCulled = false;
  im.renderOrder = 2;
  im.instanceMatrix.setUsage(T.DynamicDrawUsage);
  const slot = new Map(list.map((p, i) => [p, i]));
  const m4 = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), v = new T.Vector3(), zero = new T.Matrix4().makeScale(0, 0, 0);
  const size = { trashcan: 0.9, trashcan_lid: 0.0, trashbag: 0.8, barrel: 0.95, cardboard: 0.7, crate: 0.85, pallet: 1.5, sawhorse: 2.2, cone: 0.55, newsbox: 0.75, mailbox: 0.9, phonebooth: 1.4, bench: 1.9, stack: 0.9, hotdogcart: 1.8 };
  const set = (p) => {
    const i = slot.get(p);
    if (i === undefined) return;
    const k = size[p.kind] ?? 0.8;
    const o = p.object3D.position;
    const gy = streetSurface(o.x, o.z) === 'road' ? 0.004 : SIDEWALK_H + 0.004;
    const hgt = Math.max(0, o.y - gy);
    const f = Math.max(0, 1 - hgt / 1.6);
    if (!k || f <= 0 || !p.object3D.visible) { im.setMatrixAt(i, zero); im.instanceMatrix.needsUpdate = true; return; }
    q.setFromAxisAngle(v.set(0, 1, 0), 0);
    const r = k * (1 + hgt * 0.6) * f;
    m4.compose(v.set(o.x, gy, o.z), q, s.set(r, 1, r * (p.kind === 'sawhorse' || p.kind === 'bench' || p.kind === 'hotdogcart' ? 0.45 : 1)));
    if (p.kind === 'sawhorse' || p.kind === 'bench' || p.kind === 'hotdogcart' || p.kind === 'pallet') { const rq = p.object3D.quaternion; const yaw = Math.atan2(2 * (rq.w * rq.y + rq.x * rq.z), 1 - 2 * (rq.y * rq.y + rq.z * rq.z)); q.setFromAxisAngle(v.set(0, 1, 0), yaw); m4.compose(v.set(o.x, gy, o.z), q, s); }
    im.setMatrixAt(i, m4);
    im.instanceMatrix.needsUpdate = true;
  };
  for (const p of list) set(p);
  root.add(im);
  return { set, hide: (p) => { const i = slot.get(p); if (i !== undefined) { im.setMatrixAt(i, zero); im.instanceMatrix.needsUpdate = true; } } };
}
