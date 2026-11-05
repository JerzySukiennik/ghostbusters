// createCity: the streamed 1984 Manhattan island around the V1 Firehouse corner (CONTRACT-V2 3.1), chunks built in a worker from map.json, the V1 corner kept from src/world.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBuilder, atlasLayout, cityLamps, citySignals, LAYERS, SW, SHOP_TINTS } from './build.js';
import { createCityMaterials, noiseTexture, textureArray, farMaterial, FOG } from './materials.js';
import { paintAtlas } from './atlas.js';
import { createSurface } from './surface.js';
import { centroid, bounds, clipRect, rng } from './geom.js';
import { createTextures, createLampUniforms, patchMaterial, LAMP_SLOTS } from '../world/materials.js';
import { lampDefs, buildLamps, makeHalos } from '../world/lamps.js';
import { loadLandmark } from '../landmarks/index.js';
import { buildBuildings } from '../world/buildings.js';
import { buildSky } from '../world/sky.js';
import { buildProps } from '../world/props.js';
import { buildSteam } from '../world/steam.js';
import { treeKit, treeMaterials } from '../world/trees.js';
import { BUILDINGS, ECTO, HOTDOG, GHOST_ROUTE, SIDEWALK_H, GROUP_STATIC, GROUP_EDGE, LAMP, PARK_LAMP, MERC_COLOR } from '../world/layout.js';

const WORLD = new URL('../../assets/world/', import.meta.url).href;
const CITY = new URL('../../assets/city/', import.meta.url).href;
const LMS = new URL('../../assets/landmarks/', import.meta.url).href;
const V1H = 55;
const RADII = { low: [110, 230, 70], medium: [150, 300, 90], high: [190, 360, 100] };
const MASK = 32;
const CAR_COLS = [0x2b2f36, 0x6b1d18, 0x1d3b5e, 0xc8c2b0, 0x4a5a3a, 0x7a6a50, 0x151515, 0x8a8f96, 0x5c2a48, 0xb59a52, 0x23463f, 0x9a4a22];

const inV1 = (x, z) => Math.abs(x) < V1H && Math.abs(z) < V1H;

export async function createCity({ THREE, RAPIER, world, scene, renderer, camera, quality = 'medium', seed = 1984, onProgress = null }) {
  const q = RADII[quality] ? quality : 'medium';
  const [RA, RB, RC] = RADII[q];
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const root = new THREE.Group();
  root.name = 'City';
  const bodies = [];
  const saved = { fog: scene.fog, background: scene.background, environment: scene.environment };
  const say = (k, t) => onProgress?.(k, t);

  const map = await fetch(CITY + 'map.json').then((r) => r.json());
  const C = map.chunk || 128;
  const ckey = (x, z) => Math.floor(x / C) + ',' + Math.floor(z / C);
  const surface = createSurface(map);
  say(0.1, 'City map');

  const tx = createTextures(THREE, renderer, WORLD);
  const lamps = createLampUniforms(THREE);
  lamps.count = LAMP_SLOTS;

  const fh = map.landmarks.find((l) => l.id === 'firehouse');
  const fhBox = fh ? bounds(fh.footprint) : [0, 0, 0, 0];
  const inFirehouse = (x, z, pad = 0) => x > fhBox[0] - pad && x < fhBox[2] + pad && z > fhBox[1] - pad && z < fhBox[3] + pad;

  const v1lots = new Map(map.lots.filter((l) => l.id.startsWith('v1.')).map((l) => [l.id.slice(3), l]));
  const v1buildings = BUILDINGS.filter((b) => !inFirehouse((b.box[0] + b.box[2]) / 2, (b.box[1] + b.box[3]) / 2)).map((b) => {
    const lot = v1lots.get(b.id);
    if (!lot) return b;
    const [x0, z0, x1, z1] = bounds(lot.poly);
    const box = [Math.min(b.box[0], x0), Math.min(b.box[1], z0), Math.max(b.box[2], x1), Math.max(b.box[3], z1)];
    const face = b.face.map((f) => {
      const ns = f.dir === 'n' || f.dir === 's', lo = ns ? box[0] : box[1], hi = ns ? box[2] : box[3];
      return { ...f, a: f.a <= -V1H + 1 ? lo : f.a, b: f.b >= V1H - 1 ? hi : f.b };
    });
    return { ...b, box, face };
  });

  const defs = lampDefs(THREE).filter((d) => !(d.shop && inFirehouse(d.head.x, d.head.z, 2)));
  defs.forEach((d, i) => (d.i = i));
  const boothLamp = { i: defs.length, park: false, street: false, shop: true, dynamic: true, head: V3(0, -50, 0), toLight: V3(0, 1, 0), color: new THREE.Color(0.78, 0.92, 1.0), intensity: 26, range: 6, angle: 1.45, penumbra: 1, weight: 0 };
  const cartLamp = { i: defs.length + 1, park: false, street: false, shop: true, head: V3(HOTDOG.pos[0], SIDEWALK_H + 2.25, HOTDOG.pos[1]), toLight: V3(0, 1, 0), color: new THREE.Color(1.0, 0.72, 0.45), intensity: 14, range: 7, angle: 1.35, penumbra: 1, weight: 0 };
  defs.push(boothLamp, cartLamp);

  const [signsJson, atlasJson, propsGltf, fhL] = await Promise.all([
    fetch(WORLD + 'tex/signs.json').then((r) => r.json()),
    fetch(WORLD + 'tex/props_atlas.json').then((r) => r.json()),
    new GLTFLoader().loadAsync(WORLD + 'props.glb').catch(() => null),
    fh ? loadLandmark('firehouse', { renderer, lamps, patchMaterial, base: LMS }).catch((e) => { console.warn('[city] firehouse', e?.message || e); return null; }) : null,
  ]);
  say(0.3, 'Firehouse');
  const glbIds = fhL ? ['firehouse'] : [];

  const signTex = tx.tex('tex/signs.jpg', { srgb: true, wrap: false });
  const signs = { texture: signTex, cell: (k) => signsJson.cells.find((c) => c.key === k) };
  const atlas = { texture: tx.tex('tex/props_atlas.jpg', { srgb: true, wrap: false }), ...atlasJson };
  const meshByName = {};
  propsGltf?.scene.traverse((o) => { if (o.isMesh) meshByName[o.name] = o; });
  const assets = {
    trashcan: meshByName.TrashCan, trashlid: meshByName.TrashLid, hydrant: meshByName.Hydrant, hydrantcap: meshByName.HydrantCap,
    cardboard: meshByName.CardboardBox, trashbag: meshByName.TrashBag, barrel: meshByName.Barrel, manhole: meshByName.Manhole,
  };
  const shopTint = { bar: [1.0, 0.55, 0.3], liquor: [1.0, 0.85, 0.75], lobby: [1.0, 0.75, 0.45], records: [1.0, 0.7, 0.85], deli: [0.85, 0.95, 1.0], office: [0.82, 0.92, 1.0], pizza: [1.0, 0.78, 0.5], diner: [1.0, 0.88, 0.7], bakery: [1.0, 0.86, 0.62], cleaners: [0.8, 0.9, 1.0] };

  const brickNames = ['brick_red', 'brick_orange', 'brick_buff', 'brick_dark', 'stone'];
  const brickD = brickNames.map((n) => tx.tex(`tex/${n}_diff.jpg`, { srgb: true }));
  const brickN = brickNames.map((n) => tx.tex(`tex/${n}_nor.png`));
  const noise = noiseTexture(THREE);
  const layout = atlasLayout(map);
  const signsGen = new THREE.CanvasTexture(paintAtlas(layout));
  signsGen.colorSpace = THREE.SRGBColorSpace;
  signsGen.anisotropy = 4;
  await tx.ready();
  const brickArr = textureArray(THREE, brickD.map((t) => t.image), 512, true);
  const brickNArr = textureArray(THREE, brickN.map((t) => t.image), 512, false);
  const M = createCityMaterials({ THREE, tx, lamps, brick: brickArr, brickN: brickNArr, noise, signsV1: signTex, signsGen });
  const MAT = { walk: M.walk, shell: M.shell, decal: M.decal, trim: M.trim, iron: M.iron, signs: M.signs };
  say(0.4, 'Materials');

  const ctx = { THREE, RAPIER, world, scene, renderer, camera, quality: q, root, bodies, tx, lamps, signs, atlas, assets, shopTint, GROUP_STATIC, buildings: v1buildings };
  const sky = buildSky(ctx);
  sky.skyline.mesh.visible = false;
  sky.far.visible = false;
  scene.fog.density = FOG.density;
  buildBuildings(ctx);
  const lampSys = buildLamps(ctx, defs);
  const steam = buildSteam(ctx);
  let hydrants = 0;
  const flood = [];
  ctx.onHydrant = (p) => {
    const t = p.body.translation(), r = p.body.rotation();
    const fwd = V3(0, 0, 1).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
    steam.water.start(t.x + fwd.x * 0.2, t.y + 0.45, t.z + fwd.z * 0.2, fwd.x, fwd.z);
    const u = hydrants++ === 0 ? M.uniforms.uHydrant : M.uniforms.uHydrant2;
    u.value.set(t.x + fwd.x * 2.2, t.z + fwd.z * 2.2, 0.01, 1);
    flood.push({ u, r: 0.01 });
  };
  const propSys = buildProps(ctx);

  const moon = new THREE.DirectionalLight(new THREE.Color(0.58, 0.72, 1.0), 0.32);
  moon.name = 'PlateMoon';
  moon.position.copy(sky.moonDir).multiplyScalar(80);
  root.add(moon, moon.target);
  const hemi = new THREE.HemisphereLight(new THREE.Color(0.26, 0.38, 0.62), new THREE.Color(0.07, 0.07, 0.08), 0.68);
  hemi.name = 'PlateHemi';
  root.add(hemi);

  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  bodies.push(fixed);
  const land = map.water.land;
  {
    const hole = fh ? [[fhBox[0], fhBox[1]], [fhBox[2], fhBox[1]], [fhBox[2], fhBox[3]], [fhBox[0], fhBox[3]]] : null;
    const ring = land.concat(hole || []);
    const faces = THREE.ShapeUtils.triangulateShape(land.map((p) => new THREE.Vector2(p[0], p[1])), hole ? [hole.map((p) => new THREE.Vector2(p[0], p[1]))] : []);
    const idx = [];
    for (const [a, b, c] of faces) {
      const A = ring[a], B = ring[b], C = ring[c];
      const up = (B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1]);
      if (up >= 0) idx.push(a, b, c); else idx.push(a, c, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ring.flatMap(([x, z]) => [x, 0, z]), 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(ring.flatMap(() => [0, 1, 0]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(ring.flatMap(([x, z]) => [x, z]), 2));
    g.setAttribute('aDec', new THREE.Float32BufferAttribute(new Float32Array(ring.length * 3), 3));
    g.setIndex(idx);
    const ground = new THREE.Mesh(g, M.road);
    ground.name = 'CityGround';
    ground.frustumCulled = false;
    root.add(ground);
    const gd = RAPIER.ColliderDesc.trimesh(new Float32Array(g.attributes.position.array), new Uint32Array(idx));
    if (gd) world.createCollider(gd.setCollisionGroups(GROUP_STATIC), fixed);
    const wall = [], wn = [];
    const piers = map.water.piers.map((p) => bounds(p.poly));
    for (let i = 0; i < land.length; i++) {
      const a = land[i], b = land[(i + 1) % land.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      wall.push(a[0], 0, a[1], b[0], 0, b[1], b[0], map.water.y - 0.6, b[1], a[0], 0, a[1], b[0], map.water.y - 0.6, b[1], a[0], map.water.y - 0.6, a[1]);
      for (let k = 0; k < 6; k++) wn.push(uz, 0, -ux);
      for (let s = 0; s < L; s += 10) {
        const e = Math.min(L, s + 10), m = (s + e) / 2, mx = a[0] + ux * m, mz = a[1] + uz * m;
        if (piers.some((p) => mx > p[0] - 3 && mx < p[2] + 3 && mz > p[1] - 3 && mz < p[3] + 3)) continue;
        const ox = uz * 0.4, oz = -ux * 0.4;
        world.createCollider(RAPIER.ColliderDesc.cuboid((e - s) / 2, 0.8, 0.2).setTranslation(mx + ox, 0.8, mz + oz).setRotation(quatY(Math.atan2(-uz, ux))).setCollisionGroups(GROUP_EDGE), fixed);
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wall, 3));
    wg.setAttribute('normal', new THREE.Float32BufferAttribute(wn, 3));
    const bulk = new THREE.Mesh(wg, patchMaterial(new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.9, side: THREE.DoubleSide }), { lamps, key: 'bulk' }));
    bulk.name = 'Bulkhead';
    bulk.frustumCulled = false;
    root.add(bulk);
    for (const p of map.water.piers) {
      const pts = new Float32Array(p.poly.flatMap(([x, z]) => [x, p.deckY ?? SW, z, x, (p.deckY ?? SW) - 1.2, z]));
      const pd = RAPIER.ColliderDesc.convexHull(pts);
      if (pd) world.createCollider(pd.setCollisionGroups(GROUP_STATIC), fixed);
    }
  }
  const ripple = tx.tex('tex/ripples_nor.png');
  ripple.repeat.set(1 / 9, 1 / 9);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x03070a, roughness: 0.12, metalness: 0.2, normalMap: ripple, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.6 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), waterMat);
  water.position.y = map.water.y;
  water.name = 'Water';
  root.add(water);

  if (fhL) {
    fhL.place();
    fhL.scene.traverse((o) => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.name === 'DoorGlassEmit') m.envMapIntensity = 0; });
    for (const b of fhL.buildColliders({ RAPIER, world, groups: GROUP_STATIC })) bodies.push(b);
    root.add(fhL.scene);
  } else if (fh) hullCollider(fh.footprint, SW, 18);

  function hullCollider(poly, y0, h, body = fixed) {
    const pts = new Float32Array(poly.flatMap(([x, z]) => [x, y0, z, x, y0 + h, z]));
    const d = RAPIER.ColliderDesc.convexHull(pts);
    return d ? world.createCollider(d.setCollisionGroups(GROUP_STATIC), body) : null;
  }

  const sigs = citySignals(map);
  const sigOffset = new Map(map.roads.signals.map((s) => [s.id, s.offset || 0]));
  const sigLocal = { poles: sigs.poles.filter((p) => !inV1(p.p[0], p.p[1])), heads: sigs.heads.filter((h) => !inV1(h.p[0], h.p[1])) };
  root.add(...signalMeshes(THREE, sigLocal, M, lamps));

  const rawLamps = cityLamps(map).filter((l) => !l.v1);
  const lampByChunk = new Map();
  for (const l of rawLamps) {
    const P = l.park ? PARK_LAMP : LAMP;
    const head = l.park ? V3(l.x, SW + P.height, l.z) : V3(l.x + l.dx * P.arm, SW + P.height - 0.35, l.z + l.dz * P.arm);
    const toLight = l.park ? V3(0, 1, 0) : V3(-l.dx * 0.12, 1, -l.dz * 0.12).normalize();
    const d = { park: l.park, pole: [l.x, l.z], dir: [l.dx, l.dz], head, toLight, color: new THREE.Color().setRGB(...(l.merc ? MERC_COLOR : P.color)), intensity: P.intensity, range: P.range, angle: P.angle, penumbra: P.penumbra, weight: 0 };
    const k = ckey(l.x, l.z);
    if (!lampByChunk.has(k)) lampByChunk.set(k, []);
    lampByChunk.get(k).push(d);
  }
  const lampKit = lampGeometries(THREE);
  const poleMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.65 }), { lamps, key: 'cpole' });
  const lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 9, 9) });
  const trees = [0, 1, 2].map((i) => treeKit(THREE, lamps, 2201 + i * 977, q === 'low' ? 18 : q === 'high' ? 34 : 26));
  const treeMat = treeMaterials(THREE, lamps);
  const towerGeo = waterTower(THREE);
  const towerMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.95 }), { lamps, key: 'ctower' });
  const carGeo = carBox(THREE);
  const carMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.4, envMapIntensity: 1.2 }), { lamps, key: 'ccar' });
  const holeGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.02, 16).translate(0, 0.012, 0);
  const holeMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x18191a, roughness: 0.45, metalness: 0.7 }), { lamps, key: 'chole' });
  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.25, 0.15) });
  const beaconGeo = new THREE.SphereGeometry(0.7, 6, 4);
  const inst = {};
  const mkInst = (name, geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.name = name; m.frustumCulled = false; root.add(m); return m; };
  const resizeInst = (key, geo, mat, need) => {
    let m = inst[key];
    if (!m || m.instanceMatrix.count < need) {
      if (m) { root.remove(m); m.dispose(); }
      m = inst[key] = mkInst(key, geo, mat, Math.max(16, Math.ceil(need * 1.3)));
    }
    return m;
  };

  const farRowsP = { far: null };
  const maskData = new Uint8Array(MASK * MASK);
  const maskTex = new THREE.DataTexture(maskData, MASK, MASK, THREE.RedFormat, THREE.UnsignedByteType);
  maskTex.needsUpdate = true;
  const fogCol = scene.fog.color.clone();
  const farMat = farMaterial(THREE, fogCol, M.uFogHigh, maskTex);
  let farMesh = null;
  const makeFar = (rows) => {
    const extra = shoreRows(map);
    const all = new Float32Array(rows.length + extra.length);
    all.set(rows); all.set(extra, rows.length);
    const n = all.length / 15;
    const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const A = new Float32Array(n * 4), Bv = new Float32Array(n * 4);
    const mesh = new THREE.InstancedMesh(g, farMat, n);
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = V3(), ss = V3(), up = V3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const r = all.subarray(i * 15, i * 15 + 15);
      pp.set(r[0], r[5], r[1]); qq.setFromAxisAngle(up, r[2]); ss.set(Math.max(0.5, r[3]), Math.max(0.5, r[6] - r[5]), Math.max(0.5, r[4]));
      mesh.setMatrixAt(i, m4.compose(pp, qq, ss));
      A.set([r[8], r[7], r[9], r[10]], i * 4); Bv.set([r[12], r[13], r[14], r[11]], i * 4);
    }
    g.setAttribute('aFarA', new THREE.InstancedBufferAttribute(A, 4));
    g.setAttribute('aFarB', new THREE.InstancedBufferAttribute(Bv, 4));
    mesh.frustumCulled = false;
    mesh.name = 'CityFar';
    root.add(mesh);
    farMesh = mesh;
  };

  const opts = { glb: glbIds, v1cells: signsJson.cells };
  const pending = new Map();
  let nextId = 1, worker = null, local = null;
  const runLocal = (key, tier) => new Promise((res) => setTimeout(() => res(local.build(key, tier).res), 0));
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const ready = new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('city worker timeout')), 20000);
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.ready) { clearTimeout(t); farRowsP.far = m.far; res(); return; }
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        if (m.error) p.rej(new Error(m.error)); else p.res(m.res);
      };
      worker.onerror = (e) => { clearTimeout(t); rej(e.error || new Error(e.message || 'city worker failed')); };
    });
    worker.postMessage({ init: true, url: CITY + 'map.json', opts });
    await ready;
  } catch (e) {
    console.warn('[city] worker unavailable, building on the main thread:', e?.message || e);
    worker?.terminate(); worker = null;
    local = createBuilder(map, opts);
    farRowsP.far = local.far();
  }
  const build = (key, tier) => {
    if (!worker) return runLocal(key, tier);
    const id = nextId++;
    return new Promise((res, rej) => { pending.set(id, { res, rej }); worker.postMessage({ id, key, tier }); });
  };
  makeFar(farRowsP.far);
  say(0.5, 'Streets');

  const chunks = new Map();
  const [bx0, bz0, bx1, bz1] = map.bounds;
  for (let i = Math.floor((bx0 - 140) / C); i <= Math.floor((bx1 + 140) / C); i++)
    for (let j = Math.floor((bz0 - 40) / C); j <= Math.floor((bz1 + 40) / C); j++) {
      const key = i + ',' + j;
      chunks.set(key, { key, i, j, x0: i * C, z0: j * C, x1: (i + 1) * C, z1: (j + 1) * C, d: 1e9, A: null, B: null, busy: { A: false, B: false }, body: null, lots: [], lms: [] });
    }
  for (const l of map.lots) if ((l.kind === 'building' || l.kind === 'core' || l.kind === 'special') && !l.v1) { const [x, z] = centroid(l.poly); chunks.get(ckey(x, z))?.lots.push(l); }
  for (const lm of map.landmarks) if (!glbIds.includes(lm.id)) { const [x, z] = centroid(lm.footprint); chunks.get(ckey(x, z))?.lms.push(lm); }
  const sigByChunk = new Map();
  for (const p of sigLocal.poles) { const k = ckey(p.p[0], p.p[1]); if (!sigByChunk.has(k)) sigByChunk.set(k, []); sigByChunk.get(k).push(p.p); }

  const meshesOf = (res) => {
    const out = [];
    for (const name in res.layers) {
      const o = res.layers[name];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(o.position, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(o.normal, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(o.uv, 2));
      for (const k in LAYERS[name]) if (o.ex[k]) g.setAttribute(k, new THREE.BufferAttribute(o.ex[k], LAYERS[name][k]));
      g.setIndex(new THREE.BufferAttribute(o.index, 1));
      if (name === 'walk' && fhL) dropInside(g, (x, z) => inFirehouse(x, z, 0.05));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, MAT[name]);
      m.name = 'City_' + name + '_' + res.key;
      m.matrixAutoUpdate = false;
      m.userData.layer = name;
      out.push(m);
    }
    return out;
  };

  let instDirty = true, maskDirty = true, loadedLamps = [], shopDefs = [], steamSpots = [], parkedOff = false;
  const flying = new Set();
  const request = (ch, tier) => {
    ch.busy[tier] = true;
    const p = build(ch.key, tier).then((res) => {
      ch.busy[tier] = false;
      if (!ch.want?.[tier]) return;
      const pt = performance.now();
      const meshes = meshesOf(res);
      for (const m of meshes) root.add(m);
      ch[tier] = { meshes, inst: res.inst };
      instDirty = true;
      if (tier === 'B') maskDirty = true;
      prof('mesh' + tier, pt);
    }).catch((e) => { ch.busy[tier] = false; console.warn('[city] chunk', ch.key, tier, e?.message || e); }).finally(() => flying.delete(p));
    flying.add(p);
    return p;
  };
  const drop = (ch, tier) => {
    const t = ch[tier];
    if (!t) return;
    for (const m of t.meshes) { root.remove(m); m.geometry.dispose(); }
    ch[tier] = null;
    instDirty = true;
    if (tier === 'B') { maskDirty = true; dropBody(ch); }
  };
  const dropBody = (ch) => { if (ch.body) { world.removeRigidBody(ch.body); const k = bodies.indexOf(ch.body); if (k >= 0) bodies.splice(k, 1); ch.body = null; } };
  const buildBody = (ch) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    bodies.push(body);
    ch.body = body;
    const walk = ch.B?.meshes.find((m) => m.userData.layer === 'walk');
    if (walk) {
      const g = walk.geometry;
      const td = RAPIER.ColliderDesc.trimesh(new Float32Array(g.attributes.position.array), new Uint32Array(g.index.array));
      if (td) world.createCollider(td.setCollisionGroups(GROUP_STATIC), body);
    }
    for (const l of ch.lots) hullCollider(l.poly, SW, Math.min(320, (l.floors || 4) * 3.5 + 6), body);
    for (const lm of ch.lms) hullCollider(lm.footprint, SW, 40, body);
    for (const d of lampByChunk.get(ch.key) || []) world.createCollider(RAPIER.ColliderDesc.cylinder(2.5, d.park ? 0.12 : 0.16).setTranslation(d.pole[0], SW + 2.5, d.pole[1]).setCollisionGroups(GROUP_STATIC), body);
    for (const p of sigByChunk.get(ch.key) || []) world.createCollider(RAPIER.ColliderDesc.cylinder(2.3, 0.12).setTranslation(p[0], SW + 2.3, p[1]).setCollisionGroups(GROUP_STATIC), body);
    const I = ch.B?.inst, IA = ch.A?.inst;
    if (I) for (let k = 0; k < I.trees.length; k += 5) world.createCollider(RAPIER.ColliderDesc.cylinder(1.6, 0.2).setTranslation(I.trees[k], I.trees[k + 1] + 1.6, I.trees[k + 2]).setCollisionGroups(GROUP_STATIC), body);
    if (IA && !parkedOff) for (let k = 0; k < IA.cars.length; k += 4) world.createCollider(RAPIER.ColliderDesc.cuboid(0.95, 0.7, 2.55).setTranslation(IA.cars[k], 0.7, IA.cars[k + 1]).setRotation(quatY(IA.cars[k + 2])).setCollisionGroups(GROUP_STATIC), body);
  };

  const m4 = new THREE.Matrix4(), qy = new THREE.Quaternion(), pv = V3(), sv = V3(), UP = V3(0, 1, 0), col = new THREE.Color();
  function rebuildInstances() {
    instDirty = false;
    const tree = [[], [], []], towers = [], cars = [], holes = [], beacons = [], poleLamps = [];
    loadedLamps = []; shopDefs = []; steamSpots = [];
    for (const ch of chunks.values()) {
      const B = ch.B?.inst, A = ch.A?.inst;
      if (B) {
        for (let k = 0; k < B.trees.length; k += 5) tree[Math.abs(Math.round(B.trees[k] * 7 + B.trees[k + 2] * 3)) % 3].push(B.trees[k], B.trees[k + 1], B.trees[k + 2], B.trees[k + 3]);
        for (let k = 0; k < B.towers.length; k += 5) towers.push(B.towers[k], B.towers[k + 1], B.towers[k + 2], B.towers[k + 3], B.towers[k + 4]);
        for (let k = 0; k < B.beacons.length; k += 3) beacons.push(B.beacons[k], B.beacons[k + 1], B.beacons[k + 2]);
        for (const d of lampByChunk.get(ch.key) || []) loadedLamps.push(d);
      }
      if (A) {
        for (const d of lampByChunk.get(ch.key) || []) poleLamps.push(d);
        if (!parkedOff) for (let k = 0; k < A.cars.length; k += 4) if (!inV1(A.cars[k], A.cars[k + 1])) cars.push(A.cars[k], A.cars[k + 1], A.cars[k + 2], A.cars[k + 3]);
        for (let k = 0; k < A.manholes.length; k += 4) {
          if (inV1(A.manholes[k], A.manholes[k + 1])) continue;
          holes.push(A.manholes[k], A.manholes[k + 1], A.manholes[k + 2]);
          if (A.manholes[k + 3] > 0) steamSpots.push([A.manholes[k], A.manholes[k + 1], A.manholes[k + 3]]);
        }
        for (let k = 0; k < A.shopLights.length; k += 6) {
          const s = A.shopLights, n = [s[k + 3], s[k + 4]], c = SHOP_TINTS[s[k + 5] | 0] || SHOP_TINTS[4];
          shopDefs.push({ shop: true, head: V3(s[k], s[k + 1], s[k + 2]), toLight: V3(-n[0] * 1.6, 3.0, -n[1] * 1.6).normalize(), color: new THREE.Color(c[0], c[1], c[2]), intensity: 20, range: 8, angle: 1.3, penumbra: 1, weight: 0 });
        }
      }
    }
    tree.forEach((list, v) => {
      const n = list.length / 4;
      const a = resizeInst('treeW' + v, trees[v].wood, treeMat.bark, n), b = resizeInst('treeL' + v, trees[v].leaves, treeMat.leaf, n);
      for (let i = 0; i < n; i++) {
        const s = list[i * 4 + 3];
        m4.compose(pv.set(list[i * 4], list[i * 4 + 1], list[i * 4 + 2]), qy.setFromAxisAngle(UP, (list[i * 4] * 1.7 + list[i * 4 + 2]) % 6.28), sv.set(s, s, s));
        a.setMatrixAt(i, m4); b.setMatrixAt(i, m4);
      }
      a.count = b.count = n; a.instanceMatrix.needsUpdate = b.instanceMatrix.needsUpdate = true;
    });
    {
      const n = towers.length / 5, t = resizeInst('towers', towerGeo, towerMat, n);
      for (let i = 0; i < n; i++) { const s = towers[i * 5 + 4]; t.setMatrixAt(i, m4.compose(pv.set(towers[i * 5], towers[i * 5 + 1], towers[i * 5 + 2]), qy.setFromAxisAngle(UP, towers[i * 5 + 3]), sv.set(s, s, s))); }
      t.count = n; t.instanceMatrix.needsUpdate = true;
    }
    {
      const n = cars.length / 4, t = resizeInst('cars', carGeo, carMat, n);
      for (let i = 0; i < n; i++) {
        t.setMatrixAt(i, m4.compose(pv.set(cars[i * 4], 0, cars[i * 4 + 1]), qy.setFromAxisAngle(UP, cars[i * 4 + 2]), sv.set(1, 1, 1)));
        t.setColorAt(i, col.setHex(CAR_COLS[(cars[i * 4 + 3] | 0) % CAR_COLS.length]));
      }
      t.count = n; t.instanceMatrix.needsUpdate = true; if (t.instanceColor) t.instanceColor.needsUpdate = true;
    }
    {
      const n = holes.length / 3, t = resizeInst('holes', holeGeo, holeMat, n);
      for (let i = 0; i < n; i++) t.setMatrixAt(i, m4.compose(pv.set(holes[i * 3], 0, holes[i * 3 + 1]), qy.setFromAxisAngle(UP, holes[i * 3 + 2]), sv.set(1, 1, 1)));
      t.count = n; t.instanceMatrix.needsUpdate = true;
    }
    {
      const n = beacons.length / 3, t = resizeInst('beacons', beaconGeo, beaconMat, n);
      for (let i = 0; i < n; i++) t.setMatrixAt(i, m4.compose(pv.set(beacons[i * 3], beacons[i * 3 + 1], beacons[i * 3 + 2]), qy.identity(), sv.set(1, 1, 1)));
      t.count = n; t.instanceMatrix.needsUpdate = true;
    }
    {
      const st = poleLamps.filter((d) => !d.park), pk = poleLamps.filter((d) => d.park);
      const put = (list, key, geo, mat, head) => {
        const t = resizeInst(key, geo, mat, list.length);
        list.forEach((d, i) => {
          t.setMatrixAt(i, m4.compose(pv.set(d.pole[0], 0, d.pole[1]), qy.setFromAxisAngle(UP, Math.atan2(d.dir[0], d.dir[1])), sv.set(1, 1, 1)));
          if (head) t.setColorAt(i, d.color);
        });
        t.count = list.length; t.instanceMatrix.needsUpdate = true; if (head && t.instanceColor) t.instanceColor.needsUpdate = true;
      };
      put(st, 'cobra', lampKit.cobra, poleMat, false);
      put(st, 'cobraLens', lampKit.cobraLens, lensMat, true);
      put(pk, 'globe', lampKit.globe, poleMat, false);
      put(pk, 'globeLens', lampKit.globeLens, lensMat, true);
      putHalos(loadedLamps);
    }
    lampT = 0;
  }

  function putHalos(list) {
    if (!list.length) { if (inst.halos) inst.halos.count = 0; return; }
    if (!inst.halos || inst.halos.instanceMatrix.count < list.length * 2) {
      if (inst.halos) { root.remove(inst.halos); inst.halos.geometry.dispose(); inst.halos.material.dispose(); }
      const cap = Math.ceil(list.length * 1.4);
      inst.halos = makeHalos(THREE, Array.from({ length: cap }, (_, i) => list[i % list.length])).mesh;
      inst.halos.name = 'CityLampHalos';
      root.add(inst.halos);
    }
    const h = inst.halos, A = h.geometry.attributes.aHalo, a = A.array;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k, big = k === 1;
        h.setMatrixAt(j, m4.makeTranslation(d.head.x, d.head.y - (d.park ? 0 : 0.12), d.head.z));
        const sz = d.park ? (big ? 2.2 : 0.9) : (big ? 3.4 : 1.25), I = d.park ? (big ? 0.035 : 0.8) : (big ? 0.035 : 1.15);
        a[j * 4] = d.color.r * I; a[j * 4 + 1] = d.color.g * I; a[j * 4 + 2] = d.color.b * I; a[j * 4 + 3] = sz;
      }
    }
    h.count = list.length * 2;
    h.instanceMatrix.needsUpdate = true;
    A.needsUpdate = true;
  }

  function updateMask() {
    maskDirty = false;
    maskData.fill(0);
    for (const ch of chunks.values()) if (ch.B) { const ci = ch.i + 8, cj = ch.j + 24; if (ci >= 0 && ci < MASK && cj >= 0 && cj < MASK) maskData[cj * MASK + ci] = 255; }
    maskTex.needsUpdate = true;
  }

  const slotDist = [];
  let lampT = 0;
  const lp = V3();
  function updateLampSlots(cam) {
    const cands = defs.concat(loadedLamps, shopDefs);
    slotDist.length = 0;
    for (const d of cands) {
      const h = d.head;
      const dd = Math.hypot(h.x - cam.x, (h.y - cam.y) * 0.5, h.z - cam.z) - d.range * 0.6;
      slotDist.push([dd, d]);
    }
    slotDist.sort((a, b) => a[0] - b[0]);
    const U = lamps;
    for (let i = 0; i < LAMP_SLOTS; i++) {
      const d = slotDist[i]?.[1];
      if (!d) { U.uLampPos.value[i].set(0, -999, 0, 0); U.uLampCol.value[i].set(0, 0, 0, 1); U.uLampFill.value[i].set(0, 0, 0, 0); continue; }
      U.uLampPos.value[i].set(d.head.x, d.head.y - 0.12, d.head.z, d.range);
      U.uLampDir.value[i].set(d.toLight.x, d.toLight.y, d.toLight.z, Math.cos(d.angle));
      const I = d.intensity * (1 - (d.weight || 0));
      U.uLampCol.value[i].set(d.color.r * I, d.color.g * I, d.color.b * I, Math.cos(d.angle * (1 - d.penumbra)));
      const F = d.intensity * (d.park ? 0.02 : d.shop ? 0.03 : 0.012);
      U.uLampFill.value[i].set(d.color.r * F, d.color.g * F, d.color.b * F, 0);
    }
  }

  let steamT = 0;
  const v1Steam = steam.emitters.map((e) => [...e.base]);
  function updateSteam(cam) {
    const spots = v1Steam.map((b) => [b[0], b[2], 1]).concat(steamSpots);
    spots.sort((a, b) => Math.hypot(a[0] - cam.x, a[1] - cam.z) - Math.hypot(b[0] - cam.x, b[1] - cam.z));
    for (let i = 0; i < steam.emitters.length; i++) { const s = spots[i]; if (s) steam.setEmitter(i, s[0], 0.05, s[1]); }
  }

  const focusPts = [];
  const camPos = V3();
  let streamT = 0, instT = 0;
  const PROF = {};
  const prof = (k, t) => { const d = performance.now() - t; PROF[k] = Math.max(PROF[k] || 0, d); };
  function stream(focus, maxFly = 2, maxBodies = 1) {
    focusPts.length = 0;
    focusPts.push(camPos);
    for (const f of focus || []) if (f) focusPts.push(f);
    const order = [];
    for (const ch of chunks.values()) {
      let dv = 1e9, dc = 1e9;
      for (let k = 0; k < focusPts.length; k++) {
        const f = focusPts[k];
        const dx = Math.max(ch.x0 - f.x, 0, f.x - ch.x1), dz = Math.max(ch.z0 - f.z, 0, f.z - ch.z1);
        const d = Math.hypot(dx, dz);
        if (d < dv) dv = d;
        if (k > 0 && d < dc) dc = d;
      }
      if (focusPts.length === 1) dc = dv;
      ch.d = dv;
      const want = ch.want || (ch.want = { A: false, B: false });
      want.B = dv < RB || (want.B && dv < RB + 40);
      want.A = dv < RA || (want.A && dv < RA + 30);
      if (!want.A && ch.A) drop(ch, 'A');
      if (!want.B && ch.B) drop(ch, 'B');
      const wantCol = ch.B && (dc < RC || (ch.body && dc < RC + 30));
      if (!wantCol && ch.body) dropBody(ch);
      if (wantCol && !ch.body) order.push([dc - 1000, ch, 'col']);
      if (want.B && !ch.B && !ch.busy.B) order.push([dv, ch, 'B']);
      else if (want.A && ch.B && !ch.A && !ch.busy.A) order.push([dv + 20, ch, 'A']);
    }
    order.sort((a, b) => a[0] - b[0]);
    let inflight = 0;
    for (const ch of chunks.values()) inflight += (ch.busy.A ? 1 : 0) + (ch.busy.B ? 1 : 0);
    let bodiesMade = 0;
    for (const [, ch, t] of order) {
      if (t === 'col') { if (bodiesMade < maxBodies) { const pt = performance.now(); buildBody(ch); prof('body', pt); bodiesMade++; } continue; }
      if (inflight >= maxFly) continue;
      request(ch, t);
      inflight++;
    }
  }

  async function warm(points, onStep) {
    camera.getWorldPosition(camPos);
    for (let n = 0; n < 400; n++) {
      stream(points, 6, 99);
      const busy = flying.size > 0;
      const missing = [...chunks.values()].some((ch) => (ch.want?.B && !ch.B) || (ch.want?.A && !ch.A));
      const needCol = [...chunks.values()].some((ch) => ch.B && !ch.body && points.some((f) => Math.hypot(Math.max(ch.x0 - f.x, 0, f.x - ch.x1), Math.max(ch.z0 - f.z, 0, f.z - ch.z1)) < RC));
      if (!busy && !missing && !needCol) break;
      const total = [...chunks.values()].filter((ch) => ch.want?.B).length || 1, done = [...chunks.values()].filter((ch) => ch.B).length;
      onStep?.(done / total);
      if (busy) await Promise.race(flying);
      else await Promise.resolve();
    }
    if (instDirty) rebuildInstances();
    if (maskDirty) updateMask();
  }

  const spawnFocus = [V3(0, 0, 0), V3(ECTO.pos[0], 0, ECTO.pos[2])];
  camera.getWorldPosition(camPos);
  await warm(spawnFocus, (k) => say(0.5 + k * 0.4, 'Streets'));
  say(0.92, 'Lights');

  scene.add(root);
  root.updateMatrixWorld(true);
  lampSys.update(0, camera, V3(0, 2, 4));
  updateLampSlots(V3(0, 2, 4));
  {
    const others = [];
    for (const top of scene.children) { if (top === root) continue; top.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite) && o.visible) others.push(o); }); }
    for (const o of others) o.visible = false;
    const hidden = [steam.mesh, lampSys.cones.mesh].filter((o) => o.visible);
    for (const o of hidden) o.visible = false;
    const size = q === 'high' ? 512 : q === 'low' ? 128 : 256;
    const cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType });
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromCubemap(cubeRT.texture).texture;
    const cubeCam = new THREE.CubeCamera(0.2, 900, cubeRT);
    cubeCam.position.set(0, 2.2, 6);
    scene.add(cubeCam);
    const tm = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    cubeCam.update(renderer, scene);
    renderer.toneMapping = tm;
    scene.remove(cubeCam);
    const placeholder = scene.environment;
    scene.environment = pmrem.fromCubemap(cubeRT.texture).texture;
    placeholder.dispose(); pmrem.dispose(); cubeRT.dispose();
    for (const o of others) o.visible = true;
    for (const o of hidden) o.visible = true;
  }
  const envTex = scene.environment;

  const cart = propSys.cart;
  const cartTop = cart ? V3(cart.object3D.position.x, SIDEWALK_H + 1.0, cart.object3D.position.z) : V3(HOTDOG.pos[0], 1.15, HOTDOG.pos[1]);
  const spawns = {
    player: { pos: V3(ECTO.pos[0] + 2.35, SIDEWALK_H, ECTO.pos[2] + 1.6), yaw: -Math.PI / 2 },
    ecto: { pos: V3(ECTO.pos[0], 0, ECTO.pos[2]), yaw: ECTO.yaw },
    ghost: { pos: V3(HOTDOG.pos[0], 3.0, HOTDOG.pos[1]) },
    ghostRoute: GHOST_ROUTE.map((p) => V3(p[0], p[1], p[2])),
    hotdogCart: { pos: cartTop, prop: cart || null },
    firehouse: fh ? { pos: V3(...fh.anchor.pos), yaw: fh.anchor.yaw || 0 } : null,
  };
  const sites = map.sites.map((s) => ({ ...s, pos: V3(...s.pos), ghostSpawn: s.ghostSpawn ? V3(...s.ghostSpawn) : null, park: s.park ? { ...s.park, pos: V3(...s.park.pos) } : null }));

  let time = 0;
  const booth = propSys.lampProp;
  const shadowSpot = lampSys.spots[0];
  const propListeners = [];
  const city = {
    root, map, spawns, sites, props: propSys.props, debris: propSys.debris,
    roads: map.roads, walks: map.walks,
    bounds: { minX: bx0, maxX: bx1, minZ: bz0, maxZ: bz1 },
    lights: { moon, hemi, lampSpots: lampSys.spots, lamps: defs, signals: lampSys.signals, uniforms: lamps },
    envMap: envTex,
    fx: { steam, water: steam.water },
    surfaceAt: surface.surfaceAt, heightAt: surface.heightAt,
    propOfCollider: (c) => propSys.byCollider.get(typeof c === 'number' ? c : c?.handle) || null,
    buildings: v1buildings,
    minimap: {
      bounds: map.bounds,
      roads: map.streets.map((s) => ({ pts: s.pts, w: s.width })),
      blocks: map.blocks.filter((b) => b.kind !== 'park').map((b) => (b.lot && b.lot.length >= 3 ? b.lot : b.kerb)),
      water: map.water.rivers.map((r) => r.poly),
      parks: map.parks.flatMap((p) => p.polys || []),
      landmarks: map.landmarks.map((l) => ({ id: l.id, name: l.name, p: centroid(l.footprint) })),
    },
    landmarks: { firehouse: fhL },
    get time() { return time; },
    useTrafficParking() { parkedOff = true; instDirty = true; for (const ch of chunks.values()) dropBody(ch); },
    landmark(id) { const l = map.landmarks.find((x) => x.id === id); return l ? { pos: V3(...l.anchor.pos), yaw: l.anchor.yaw || 0, footprint: l.footprint } : null; },
    signalState(id, t = time) {
      const tt = (((t + (sigOffset.get(id) || 0)) % 36) + 36) % 36;
      return tt < 19 ? 'ns' : tt >= 20.5 && tt < 34.5 ? 'ew' : 'all_red';
    },
    onProps(fn) { propListeners.push(fn); },
    stats: () => {
      let a = 0, b = 0, cols = 0;
      for (const ch of chunks.values()) { if (ch.A) a++; if (ch.B) b++; if (ch.body) cols++; }
      return { chunksA: a, chunksB: b, colliders: cols, lamps: loadedLamps.length, shops: shopDefs.length, far: farMesh?.count || 0, worstMs: PROF };
    },
    warm: (pts) => warm(pts),
    update(dt, o = {}) {
      dt = Math.min(dt, 0.1);
      time += dt;
      lamps.uPlateTime.value = time;
      M.uSigTime.value = time;
      camera.getWorldPosition(camPos);
      sky.sky.position.copy(camPos);
      streamT -= dt;
      if (streamT <= 0) { streamT = 0.2; stream(o.focus); }
      instT -= dt;
      if (instDirty && instT <= 0) { instT = 0.35; const pt = performance.now(); rebuildInstances(); prof('inst', pt); }
      if (maskDirty) updateMask();
      if (cart && !cart.dead) { const p = cart.object3D.position, qq = cart.object3D.quaternion; cartLamp.head.set(0.1, 2.1, 0).applyQuaternion(qq).add(p); cartLamp.intensity = cart._hidden.has(1) ? 6 : 14; }
      if (booth) {
        if (booth._lampOff || booth.dead) boothLamp.intensity = 0;
        else { const p = booth.object3D.position, qq = booth.object3D.quaternion; boothLamp.head.set(0, 2.0, 0).applyQuaternion(qq).add(p); boothLamp.toLight.set(0, 1, 0).applyQuaternion(qq); }
      }
      lampSys.update(dt, camera, camPos);
      for (const s of lampSys.spots) if (s.userData.lamp >= 0 && s.position.distanceTo(camPos) > 70) { s.intensity = 0; lampSys.defs[s.userData.lamp].weight = 0; }
      lampT -= dt;
      if (lampT <= 0 || lp.distanceToSquared(camPos) > 4) { lampT = 0.12; lp.copy(camPos); updateLampSlots(camPos); }
      else updateLampSlots(lp);
      if (shadowSpot.castShadow) shadowSpot.shadow.needsUpdate = true;
      propSys.update(dt);
      fhL?.update(dt, { camera });
      steamT -= dt;
      if (steamT <= 0) { steamT = 1; updateSteam(camPos); }
      steam.update(dt);
      sky.update(time);
      waterMat.normalMap.offset.set(time * 0.004, time * 0.0025);
      for (const f of flood) { f.r = Math.min(6.5, f.r + dt * 0.35); f.u.value.z = f.r; }
    },
    dispose() {
      worker?.terminate();
      scene.remove(root);
      for (const b of bodies) { try { world.removeRigidBody(b); } catch {} }
      root.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose()); });
      for (const t of tx.cache.values()) t.dispose();
      brickArr.dispose(); brickNArr.dispose(); noise.dispose(); signsGen.dispose(); maskTex.dispose();
      envTex.dispose();
      scene.environment = saved.environment; scene.fog = saved.fog; scene.background = saved.background;
    },
  };
  city.update(0, { focus: spawnFocus });
  say(1, 'Ready');
  return city;
}

function quatY(a) { return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }; }

function dropInside(g, test) {
  const p = g.attributes.position.array, idx = g.index.array;
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    if (test(p[a], p[a + 2]) && test(p[b], p[b + 2]) && test(p[c], p[c + 2])) continue;
    keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  if (keep.length !== idx.length) g.setIndex(keep);
}

function lampGeometries(THREE) {
  const clean = (g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; };
  const tint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return g; };
  const grey = [0.30, 0.31, 0.31], iron = [0.035, 0.045, 0.04];
  const P = LAMP, hy = SW + P.height - 0.35;
  const base = new THREE.CylinderGeometry(0.15, 0.2, 0.75, 6, 1, true).translate(0, SW + 0.375, 0);
  const shaft = new THREE.CylinderGeometry(0.075, 0.12, 8.0, 6, 1, true).translate(0, SW + 4.0, 0);
  const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(0, SW + 8.0, 0), new THREE.Vector3(0, SW + 8.9, 0), new THREE.Vector3(0, SW + 9.05, 0.9), new THREE.Vector3(0, SW + 8.95, P.arm - 0.35));
  const arm = new THREE.TubeGeometry(curve, 6, 0.055, 4, false);
  const housing = new THREE.SphereGeometry(0.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.42, 0.34, 1.0).translate(0, hy + 0.02, P.arm);
  const cobra = mergeGeometries([base, shaft, arm, housing].map((g) => tint(clean(g), grey)));
  const cobraLens = new THREE.SphereGeometry(0.5, 8, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.36, 0.16, 0.86).translate(0, hy - 0.01, P.arm);
  const G = PARK_LAMP, gy = SW + G.height;
  const gbase = new THREE.CylinderGeometry(0.16, 0.24, 0.9, 6, 1, true).translate(0, SW + 0.45, 0);
  const gshaft = new THREE.CylinderGeometry(0.055, 0.08, 3.2, 6, 1, true).translate(0, SW + 2.4, 0);
  const collar = new THREE.CylinderGeometry(0.13, 0.08, 0.25, 6, 1, true).translate(0, SW + 3.9, 0);
  const cap = new THREE.ConeGeometry(0.2, 0.32, 6).translate(0, gy + 0.48, 0);
  const globe = mergeGeometries([gbase, gshaft, collar, cap].map((g) => tint(clean(g), iron)));
  const globeLens = new THREE.SphereGeometry(0.29, 8, 6).scale(1, 1.25, 1).translate(0, gy, 0);
  return { cobra, cobraLens: clean(cobraLens), globe, globeLens: clean(globeLens) };
}

function signalMeshes(THREE, sigs, M, lamps) {
  const poles = [], heads = [], lens = [];
  for (const p of sigs.poles) poles.push(new THREE.CylinderGeometry(0.08, 0.1, 4.6, 6, 1, true).translate(p.p[0], SW + 2.3, p.p[1]));
  const box = new THREE.BoxGeometry(0.34, 1.0, 0.26);
  const disc = new THREE.CircleGeometry(0.1, 6);
  const cols = [[1, 0.08, 0.04], [1, 0.55, 0.05], [0.1, 1, 0.55]];
  for (const h of sigs.heads) {
    const s = Math.sin(h.yaw), c = Math.cos(h.yaw);
    const ox = h.p[0] + s * 0.18, oz = h.p[1] + c * 0.18;
    heads.push(box.clone().rotateY(h.yaw).translate(ox, SW + 4.0, oz));
    for (let k = 0; k < 3; k++) {
      const g = disc.clone().rotateY(h.yaw).translate(ox + s * 0.135, SW + 4.33 - k * 0.33, oz + c * 0.135);
      const n = g.attributes.position.count;
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => cols[k][i % 3]), 3));
      g.setAttribute('aSig', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => [h.offset, h.grp, k === 0 ? 0 : k === 1 ? 1 : 2][i % 3]), 3));
      g.deleteAttribute('uv');
      lens.push(g.index ? g.toNonIndexed() : g);
    }
  }
  const out = [];
  const ironMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x15180f, roughness: 0.5, metalness: 0.5 }), { lamps, key: 'csig' });
  if (poles.length) { const m = new THREE.Mesh(mergeGeometries(poles.map((g) => g.toNonIndexed())), ironMat); m.name = 'CitySignalPoles'; m.frustumCulled = false; out.push(m); }
  if (heads.length) { const m = new THREE.Mesh(mergeGeometries(heads.map((g) => g.toNonIndexed())), ironMat); m.name = 'CitySignalHeads'; m.frustumCulled = false; out.push(m); }
  if (lens.length) { const m = new THREE.Mesh(mergeGeometries(lens), M.lens); m.name = 'CitySignalLenses'; m.frustumCulled = false; out.push(m); }
  return out;
}

function waterTower(THREE) {
  const parts = [];
  parts.push(new THREE.CylinderGeometry(2.0, 2.0, 3.6, 10, 1, true).translate(0, 3.4, 0));
  parts.push(new THREE.ConeGeometry(2.15, 1.3, 10, 1, true).translate(0, 5.85, 0));
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; parts.push(new THREE.BoxGeometry(0.18, 1.6, 0.18).translate(Math.cos(a) * 1.5, 0.8, Math.sin(a) * 1.5)); }
  parts.push(new THREE.CylinderGeometry(2.1, 2.1, 0.12, 10, 1, true).translate(0, 1.6, 0));
  parts.push(new THREE.CircleGeometry(2.1, 10).rotateX(Math.PI / 2).translate(0, 1.54, 0));
  return mergeGeometries(parts.map((g) => { const n = g.toNonIndexed(); n.deleteAttribute('uv'); return n; }));
}

function carBox(THREE) {
  const body = new THREE.BoxGeometry(1.86, 0.72, 5.0).translate(0, 0.62, 0);
  const cab = new THREE.BoxGeometry(1.62, 0.55, 2.5).translate(0, 1.25, -0.25);
  const g = mergeGeometries([body, cab].map((x) => { const n = x.toNonIndexed(); n.deleteAttribute('uv'); return n; }));
  return g;
}

function shoreRows(map) {
  const rows = [];
  const R = rng(4242);
  const put = (x, z, yaw, w, d, h, kind) => rows.push(x, z, yaw, w, d, 0, h, kind, R(), 4.6, 3.3, (R() * 5) | 0, 0, 0, 2.9);
  const f = map.far || {};
  const band = (x0, x1, z0, z1, n, hmin, hmax, tall) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      const t = R() < tall;
      put(x, z, 0, 14 + R() * 26, 14 + R() * 26, t ? 60 + R() * 120 : hmin + R() * (hmax - hmin), t ? 3 : R() < 0.5 ? 1 : 5);
    }
  };
  if (f.nj) band(f.nj.x[1] - 260, f.nj.x[1] - 20, f.nj.z[0] + 300, f.nj.z[1] - 200, 260, 8, 30, 0.06);
  if (f.brooklyn) band(f.brooklyn.x[0] + 20, f.brooklyn.x[0] + 300, f.brooklyn.z[0], f.brooklyn.z[1] - 300, 220, 8, 28, 0.08);
  if (f.queens) band(f.queens.x[0] + 20, f.queens.x[0] + 280, f.queens.z[0] + 300, f.queens.z[1], 200, 8, 26, 0.05);
  if (f.bronx) band(f.bronx.x[0] + 200, f.bronx.x[1] - 200, f.bronx.z[1] - 220, f.bronx.z[1] - 20, 140, 8, 30, 0.04);
  for (const b of f.bridges || []) {
    const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    for (const t of b.towers || []) rows.push(b.a[0] + dx * t, b.a[1] + dz * t, yaw, 9, 14, 0, b.h, 7, R(), 99, 99, 4, 0, 0, 2.9);
    rows.push((b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2, yaw, 18, L, (b.deck || 40) - 1.5, (b.deck || 40) + 1.5, 7, R(), 99, 99, 4, 0, 0, 2.9);
  }
  return new Float32Array(rows);
}

export { SW };
