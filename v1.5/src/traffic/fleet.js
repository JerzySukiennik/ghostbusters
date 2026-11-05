// Traffic render fleet: loads the vehicle GLBs, merges each LOD into one geometry with per-vertex material data, draws them instanced (fake lamps, lights, paint) plus wet-road light pools and streaks.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const KINDS = ['checker', 'nypd', 'caprice', 'ltd', 'cutlass', 'aries', 'bus', 'boxtruck', 'garbage'];
const EMIT = { HeadlightEmit: 1, TailLightEmit: 2, IndicatorEmit: 3, ReverseLight: 4, SpecialEmit: 5 };
const CAP = [24, 40, 120];
const WCAP = 48;

const VPARS = /* glsl */`
attribute vec3 aBase;
attribute vec3 aRM;
attribute float aEmit;
#ifdef USE_INSTANCING
attribute vec3 iPaint;
attribute vec4 iLight;
attribute float iSpecial;
#endif
varying vec3 vTrBase;
varying vec3 vTrPaint;
varying vec3 vTrRM;
varying float vTrEmit;
`;
const VMAIN = /* glsl */`
vTrBase = aBase; vTrRM = aRM;
#ifdef USE_INSTANCING
vTrPaint = iPaint;
float trOn = iLight.x, trBrake = iLight.y, trBlink = position.x > 0.0 ? iLight.z : iLight.w, trSp = iSpecial;
#else
vTrPaint = aBase;
float trOn = 0.0, trBrake = 0.0, trBlink = 0.0, trSp = 0.0;
#endif
vTrEmit = aEmit < 0.5 ? 0.0 : aEmit < 1.5 ? 6.0 * trOn : aEmit < 2.5 ? 1.1 * trOn + 5.0 * trBrake : aEmit < 3.5 ? 0.5 * trOn + 5.0 * trBlink : aEmit < 4.5 ? 0.0 : 3.2 * trSp;
`;
const FPARS = /* glsl */`
uniform float uTrTint;
varying vec3 vTrBase;
varying vec3 vTrPaint;
varying vec3 vTrRM;
varying float vTrEmit;
`;
const FRAG = [
  ['map_fragment', /* glsl */`
vec4 trTex = texture2D( map, vMapUv );
diffuseColor.rgb *= trTex.rgb * mix( vTrBase, vTrPaint, uTrTint * vTrRM.z * step( 0.5, trTex.a ) );
`, 'replace'],
  ['roughnessmap_fragment', 'roughnessFactor = vTrRM.x;'],
  ['metalnessmap_fragment', 'metalnessFactor = vTrRM.y;'],
  ['emissivemap_fragment', 'totalEmissiveRadiance = trTex.rgb * vTrEmit;'],
];

function inject(src, anchor, code, mode = 'after') {
  const tag = `#include <${anchor}>`;
  if (!src.includes(tag)) return src;
  if (mode === 'replace') return src.replace(tag, code);
  return src.replace(tag, tag + '\n' + code);
}

function ownPatch(material, o) {
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, o.uniforms);
    let vs = sh.vertexShader, fs = sh.fragmentShader;
    vs = vs.replace('#include <common>', '#include <common>\n' + o.vertexPars);
    vs = vs.replace('#include <fog_vertex>', '#include <fog_vertex>\n' + o.vertexMain);
    fs = fs.replace('#include <common>', '#include <common>\n' + o.fragPars);
    for (const [a, c, m] of o.frag) fs = inject(fs, a, c, m);
    sh.vertexShader = vs; sh.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => 'traffic-v1';
  return material;
}

function prepGeo(THREE, src, matrix, mat) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = src.getAttribute(k);
    if (!a) return null;
    g.setAttribute(k, a.clone());
  }
  g.setIndex(src.index ? src.index.clone() : null);
  if (!g.index) {
    const n = g.getAttribute('position').count, idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.applyMatrix4(matrix);
  const n = g.getAttribute('position').count;
  const base = new Float32Array(n * 3), rm = new Float32Array(n * 3), em = new Float32Array(n);
  const c = mat.color || { r: 1, g: 1, b: 1 };
  const e = EMIT[mat.name] || 0, paint = mat.name === 'Paint' ? 1 : 0;
  const rough = mat.roughness ?? 0.6, metal = mat.metalness ?? 0;
  for (let i = 0; i < n; i++) {
    base[i * 3] = c.r; base[i * 3 + 1] = c.g; base[i * 3 + 2] = c.b;
    rm[i * 3] = rough; rm[i * 3 + 1] = metal; rm[i * 3 + 2] = paint;
    em[i] = e;
  }
  g.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
  g.setAttribute('aRM', new THREE.BufferAttribute(rm, 3));
  g.setAttribute('aEmit', new THREE.BufferAttribute(em, 1));
  return g;
}

function merge(THREE, list) {
  const gs = list.filter(Boolean);
  if (!gs.length) return null;
  const big = gs.reduce((a, g) => a + g.getAttribute('position').count, 0) > 65535;
  for (const g of gs) if (big && !(g.index.array instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1));
  const m = mergeGeometries(gs, false);
  for (const g of gs) g.dispose();
  m.computeBoundingSphere();
  return m;
}

async function loadKind(THREE, loader, base, kind) {
  const [gltf, json] = await Promise.all([loader.loadAsync(base + kind + '.glb'), fetch(base + kind + '.json').then((r) => r.json())]);
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const parts = [[], [], []], wheelGeo = {};
  let atlas = null;
  const inv = new THREE.Matrix4(), rel = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const chain = [];
    for (let p = o; p && p !== root; p = p.parent) chain.push(p.name || '');
    if (chain.some((n) => n.startsWith('Collider'))) return;
    const lod = chain.some((n) => /^LOD2(_\d+)?$/.test(n)) ? 2 : chain.some((n) => /^LOD1(_\d+)?$/.test(n)) ? 1 : 0;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (!atlas && m.map) atlas = m.map;
    const mat = mats[0];
    let wheel = null, wkey = '';
    for (let p = o; p && p !== root; p = p.parent) { const m = /^Wheel_[FR][LR]/.exec(p.name || ''); if (m) { wheel = p; wkey = m[0]; break; } }
    if (lod === 2) { parts[2].push(prepGeo(THREE, o.geometry, o.matrixWorld, mat)); return; }
    if (lod === 1) { parts[1].push(prepGeo(THREE, o.geometry, o.matrixWorld, mat)); return; }
    if (wheel) {
      inv.copy(wheel.matrixWorld).invert();
      rel.multiplyMatrices(inv, o.matrixWorld);
      (wheelGeo[wkey] ||= []).push(prepGeo(THREE, o.geometry, rel, mat));
      return;
    }
    parts[0].push(prepGeo(THREE, o.geometry, o.matrixWorld, mat));
  });
  const bodies = parts.map((p) => merge(THREE, p));
  const wheels = [];
  for (const [name, w] of Object.entries(json.wheels || {})) wheels.push({ name, x: w[0], y: w[1], z: w[2], left: name[7] === 'L', front: name[6] === 'F' });
  const wl = merge(THREE, wheelGeo.Wheel_FL || []), wr = merge(THREE, wheelGeo.Wheel_FR || []);
  for (const [k, list] of Object.entries(wheelGeo)) if (k !== 'Wheel_FL' && k !== 'Wheel_FR') for (const g of list) g && g.dispose();
  root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  if (atlas) { atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4; atlas.needsUpdate = true; }
  return { kind, json, bodies, wl, wr, wheels, atlas, len: json.length, wid: json.width, hgt: json.height, wb: json.wheelbase, wr0: json.wheel_radius, mass: json.mass_kg, tint: !!json.tint, paint: json.paint, tris: json.triangles };
}

export async function createFleet({ THREE, scene, base = 'assets/traffic/', lamps = null, patchMaterial = null, quality = 'medium', kinds = KINDS }) {
  const loader = new GLTFLoader();
  const K = await Promise.all(kinds.map((k) => loadKind(THREE, loader, base, k).catch((e) => { console.warn('[traffic] missing vehicle', k, e); return null; })));
  const group = new THREE.Group();
  group.name = 'Traffic';
  scene.add(group);
  const shadows = quality !== 'low';
  const meshes = [];
  const opts = (tint) => ({ lamps, key: 'traffic', uniforms: { uTrTint: { value: tint ? 1 : 0 } }, vertexPars: VPARS, vertexMain: VMAIN, fragPars: FPARS, frag: FRAG });
  const makeMat = (k) => {
    const m = new THREE.MeshStandardMaterial({ map: k.atlas, color: 0xffffff, roughness: 1, metalness: 1, envMapIntensity: 0.9 });
    m.name = 'traffic_' + k.kind;
    const o = opts(k.tint);
    if (patchMaterial && lamps) patchMaterial(m, o); else ownPatch(m, o);
    return m;
  };
  const inst = (geo, mat, cap, name, cast, lights) => {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.name = name;
    m.frustumCulled = false;
    m.count = 0;
    m.castShadow = cast && shadows;
    m.receiveShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (lights) {
      const a = (n) => { const b = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); b.setUsage(THREE.DynamicDrawUsage); return b; };
      m.userData.paint = a(3); m.userData.light = a(4); m.userData.special = a(1);
    }
    group.add(m);
    meshes.push(m);
    return m;
  };
  const sets = K.map((k, ki) => {
    if (!k) return null;
    const mat = makeMat(k);
    const S = { k, ki, mat, body: [], wl: null, wr: null, n: [0, 0, 0], nw: [0, 0] };
    for (let l = 0; l < 3; l++) {
      const geo = k.bodies[l] || k.bodies[1] || k.bodies[0];
      const g = geo.clone();
      const m = inst(g, mat, CAP[l], `traffic_${k.kind}_lod${l}`, l < 2, true);
      g.setAttribute('iPaint', m.userData.paint); g.setAttribute('iLight', m.userData.light); g.setAttribute('iSpecial', m.userData.special);
      S.body.push(m);
    }
    for (const b of k.bodies) b && b.dispose();
    if (k.wl && k.wr) {
      S.wl = inst(k.wl, mat, WCAP, `traffic_${k.kind}_wheelL`, false, false);
      S.wr = inst(k.wr, mat, WCAP, `traffic_${k.kind}_wheelR`, false, false);
    }
    return S;
  });
  const glow = createGlow(THREE, group);
  const M = new THREE.Matrix4(), W = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), Sc = new THREE.Vector3(1, 1, 1), QW = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ');
  let warm = 2;
  const fleet = {
    group, kinds: K, sets, glow, meshes,
    begin() { for (const S of sets) if (S) { S.n[0] = S.n[1] = S.n[2] = 0; S.nw[0] = S.nw[1] = 0; } glow.begin(); },
    push(ki, lod, px, py, pz, qx, qy, qz, qw, pr, pg, pb, l0, l1, l2, l3, sp, wheelSteer, wheelSpin) {
      const S = sets[ki];
      if (!S) return;
      const mesh = S.body[lod];
      const i = S.n[lod];
      if (i >= mesh.instanceMatrix.count) return;
      S.n[lod] = i + 1;
      P.set(px, py, pz); Q.set(qx, qy, qz, qw);
      M.compose(P, Q, Sc);
      M.toArray(mesh.instanceMatrix.array, i * 16);
      const pa = mesh.userData.paint.array, la = mesh.userData.light.array;
      pa[i * 3] = pr; pa[i * 3 + 1] = pg; pa[i * 3 + 2] = pb;
      la[i * 4] = l0; la[i * 4 + 1] = l1; la[i * 4 + 2] = l2; la[i * 4 + 3] = l3;
      mesh.userData.special.array[i] = sp;
      if (lod === 0 && S.wl) {
        for (const w of S.k.wheels) {
          const side = w.left ? 0 : 1;
          const wm = w.left ? S.wl : S.wr;
          const j = S.nw[side];
          if (j >= wm.instanceMatrix.count) continue;
          S.nw[side] = j + 1;
          E.set(wheelSpin, w.front ? wheelSteer : 0, 0, 'YXZ');
          QW.setFromEuler(E);
          W.compose(P.set(w.x, w.y, w.z), QW, Sc);
          W.premultiply(M);
          W.toArray(wm.instanceMatrix.array, j * 16);
        }
      }
    },
    end() {
      for (const S of sets) {
        if (!S) continue;
        for (let l = 0; l < 3; l++) {
          const m = S.body[l];
          let n = S.n[l];
          if (warm > 0 && n === 0) { M.makeTranslation(0, -400, 0); M.toArray(m.instanceMatrix.array, 0); n = 1; }
          m.count = n;
          if (n) {
            m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, n * 16); m.instanceMatrix.needsUpdate = true;
            for (const [a, s] of [[m.userData.paint, 3], [m.userData.light, 4], [m.userData.special, 1]]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * s); a.needsUpdate = true; }
          }
        }
        for (const [m, side] of [[S.wl, 0], [S.wr, 1]]) {
          if (!m) continue;
          let n = S.nw[side];
          if (warm > 0 && n === 0) { M.makeTranslation(0, -400, 0); M.toArray(m.instanceMatrix.array, 0); n = 1; }
          m.count = n;
          if (n) { m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, n * 16); m.instanceMatrix.needsUpdate = true; }
        }
      }
      if (warm > 0) warm--;
      glow.end(warm > 0);
    },
    stats() {
      let calls = 0, tris = 0, inst = 0;
      for (const S of sets) {
        if (!S) continue;
        for (let l = 0; l < 3; l++) if (S.n[l]) { calls++; inst += S.n[l]; tris += S.n[l] * (S.k.tris[`lod${l}`] || 0); }
        if (S.nw[0]) calls++;
        if (S.nw[1]) calls++;
      }
      return { calls: calls + glow.calls(), tris, instances: inst, glows: glow.count() };
    },
    dispose() {
      scene.remove(group);
      for (const m of meshes) { m.geometry.dispose(); m.dispose?.(); }
      for (const S of sets) if (S) S.mat.dispose();
      for (const k of K) if (k && k.atlas) k.atlas.dispose();
      glow.dispose();
    },
  };
  return fleet;
}

function createGlow(THREE, group) {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mk = (mode, cap) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMode: { value: mode }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 }, fogDensity: { value: 0 } },
      vertexShader: /* glsl */`
        attribute vec3 iCol;
        varying vec3 vCol; varying vec2 vP; varying float vFogDepth;
        void main() {
          vCol = iCol; vP = position.xz * 2.0;
          vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4( position, 1.0 );
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uMode; uniform float fogNear; uniform float fogFar; uniform float fogDensity;
        varying vec3 vCol; varying vec2 vP; varying float vFogDepth;
        void main() {
          float a;
          if ( uMode > 1.5 ) { vec2 q = abs( vP ); float r = pow( pow( q.x, 4.0 ) + pow( q.y, 4.0 ), 0.25 ); a = 1.0 - smoothstep( 0.35, 1.0, r ); }
          else if ( uMode < 0.5 ) { float r = dot( vP, vP ); a = exp( -r * 2.6 ) * ( 1.0 - smoothstep( 0.55, 1.0, r ) ); }
          else { float t = vP.y * 0.5 + 0.5; a = pow( 1.0 - t, 2.2 ) * smoothstep( 0.0, 0.08, t ) * exp( -vP.x * vP.x * 6.0 ) * ( 0.6 + 0.4 * sin( t * 37.0 + vP.x * 3.0 ) * sin( t * 13.0 ) ); }
          float f = 1.0;
          #ifdef USE_FOG
          #ifdef FOG_EXP2
          f = exp( -fogDensity * fogDensity * vFogDepth * vFogDepth );
          #else
          f = 1.0 - smoothstep( fogNear, fogFar, vFogDepth );
          #endif
          #endif
          gl_FragColor = uMode > 1.5 ? vec4( 0.0, 0.0, 0.0, a * vCol.r * f ) : vec4( vCol * a * f, 1.0 );
        }`,
      transparent: true, depthWrite: false, blending: mode > 1.5 ? THREE.NormalBlending : THREE.AdditiveBlending, fog: true, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const g = geo.clone();
    const m = new THREE.InstancedMesh(g, mat, cap);
    const col = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    col.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iCol', col);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; m.count = 0; m.renderOrder = mode > 1.5 ? 1 : 2;
    m.name = ['traffic_pools', 'traffic_streaks', 'traffic_shade'][mode];
    group.add(m);
    return { m, col, n: 0 };
  };
  const pools = mk(0, 160), streaks = mk(1, 200), shade = mk(2, 240);
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const put = (G, x, y, z, yaw, w, l, r, g, b) => {
    if (G.n >= G.m.instanceMatrix.count) return;
    const i = G.n++;
    P.set(x, y, z); Q.setFromAxisAngle(Y, yaw); S.set(w, 1, l);
    M.compose(P, Q, S);
    M.toArray(G.m.instanceMatrix.array, i * 16);
    G.col.array[i * 3] = r; G.col.array[i * 3 + 1] = g; G.col.array[i * 3 + 2] = b;
  };
  const fin = (G, warm) => {
    let n = G.n;
    if (warm && n === 0) { M.makeTranslation(0, -400, 0); M.toArray(G.m.instanceMatrix.array, 0); n = 1; }
    G.m.count = n;
    if (n) {
      G.m.instanceMatrix.clearUpdateRanges(); G.m.instanceMatrix.addUpdateRange(0, n * 16); G.m.instanceMatrix.needsUpdate = true;
      G.col.clearUpdateRanges(); G.col.addUpdateRange(0, n * 3); G.col.needsUpdate = true;
    }
  };
  return {
    pools: pools.m, streaks: streaks.m, shade: shade.m,
    begin() { pools.n = 0; streaks.n = 0; shade.n = 0; },
    blob(x, z, yaw, w, l, k) { put(shade, x, 0.025, z, yaw, w, l, k, 0, 0); },
    pool(x, z, yaw, w, l, r, g, b) { put(pools, x, 0.035, z, yaw, w, l, r, g, b); },
    streak(x, z, cx, cz, w, l, r, g, b) {
      const dx = cx - x, dz = cz - z, d = Math.hypot(dx, dz) || 1;
      const len = Math.min(l, d * 0.8);
      put(streaks, x + dx / d * len * 0.5, 0.04, z + dz / d * len * 0.5, Math.atan2(dx, dz), w, len, r, g, b);
    },
    end(warm) { fin(pools, warm); fin(streaks, warm); fin(shade, warm); },
    calls() { return (pools.n ? 1 : 0) + (streaks.n ? 1 : 0) + (shade.n ? 1 : 0); },
    count() { return pools.n + streaks.n; },
    dispose() { for (const G of [pools, streaks, shade]) { G.m.geometry.dispose(); G.m.material.dispose(); } geo.dispose(); },
  };
}
