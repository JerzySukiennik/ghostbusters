// Ground: wet-down asphalt with paint and puddles, concrete sidewalks with rounded granite kerbs, park, manholes, grates and the bevelled slab.
import { PLATE, SIDEWALK_H, AVE, ST, CURB_R, PARK, MANHOLES, GRATES, DRAINS, LAMPS, streetSurface, curbOutline, curbDist, facadeDist, GROUP_STATIC, GROUP_EDGE } from './layout.js';
import { makeNoise, smooth, clamp01 } from './noise.js';
import { patchMaterial, setUV } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MW = 1024;
const MK = 2048;
const HALF = PLATE.half;
const toPx = (v, n) => ((v + HALF) / PLATE.size) * n;

function buildMasks(THREE) {
  const nz = makeNoise(1984), nz2 = makeNoise(77), nz3 = makeNoise(5);
  const data = new Uint8Array(MW * MW * 4);
  const patches = [];
  const pr = makeNoise(31);
  for (let i = 0; i < 26; i++) {
    const r = pr.noise(i * 3.7, 1.3), r2 = pr.noise(1.7, i * 2.9), r3 = pr.noise(i * 1.1, i * 0.7);
    const onAve = i % 2 === 0;
    const cx = onAve ? AVE.x0 + 1 + r * 18 : -50 + r * 100;
    const cz = onAve ? -50 + r2 * 100 : ST.z0 + 1 + r2 * 10;
    const w = 0.9 + r3 * 2.6, h = 1.2 + r * 4.5;
    patches.push([cx - w / 2, cz - h / 2, cx + w / 2, cz + h / 2, 0.55 + r2 * 0.5]);
  }
  for (let j = 0; j < MW; j++) {
    const z = -HALF + ((j + 0.5) / MW) * PLATE.size;
    for (let i = 0; i < MW; i++) {
      const x = -HALF + ((i + 0.5) / MW) * PLATE.size;
      const s = streetSurface(x, z);
      const n1 = nz.fbm(x * 0.085, z * 0.085, 4);
      const n2 = nz2.fbm(x * 0.31 + 13, z * 0.31 - 7, 3);
      const n3 = nz3.fbm(x * 0.028, z * 0.028, 3);
      let wet = 0, pud = 0, grime = 0.5 + (n3 - 0.5) * 0.9, ao = 1;
      if (s === 'road') {
        const cd = curbDist(x, z);
        const gutter = clamp01(1 - cd / 0.9);
        wet = 0.62 + (n2 - 0.5) * 0.5 + gutter * 0.35;
        let track = 0;
        if (Math.abs(z) > ST.z1 + 0.5) for (const lc of [-5.6, -1.9, 1.9, 5.6]) for (const o of [-0.8, 0.8]) track = Math.max(track, 1 - Math.abs(x - lc - o) / 0.32);
        if (Math.abs(x) > AVE.x1 + 0.5) for (const lc of [-1.8, 1.8]) for (const o of [-0.8, 0.8]) track = Math.max(track, 1 - Math.abs(z - lc - o) / 0.32);
        wet -= clamp01(track) * 0.28;
        let man = 0;
        for (const m of MANHOLES) man = Math.max(man, clamp01(1 - Math.hypot(x - m.pos[0], z - m.pos[1]) / 1.8));
        const field = n1 * 0.8 + n2 * 0.2 + gutter * 0.3 + man * 0.12 - clamp01(track) * 0.1;
        pud = smooth(0.545, 0.62, field);
        for (const p of patches) if (x > p[0] && x < p[2] && z > p[1] && z < p[3]) { grime = grime * 0.5 + p[4] * 0.5 - 0.18; pud = Math.max(pud, smooth(0.5, 0.6, n2) * 0.6); }
        let oil = 0;
        if (Math.abs(z) > ST.z1 + 1) for (const lc of [-5.6, -1.9, 1.9, 5.6]) oil = Math.max(oil, 1 - Math.abs(x - lc) / 0.55);
        grime -= clamp01(oil) * (0.15 + n2 * 0.2);
        ao = 0.55 + 0.45 * smooth(0.0, 0.35, cd);
      } else if (s === 'walk' || s === 'park') {
        const fd = s === 'walk' ? facadeDist(x, z) : 99;
        wet = 0.42 + (n2 - 0.5) * 0.45;
        wet *= 0.45 + 0.55 * smooth(0.4, 1.8, fd);
        const edge = clamp01(1 - curbDist(x, z) / 0.7);
        pud = smooth(0.66, 0.72, n1 * 0.7 + n2 * 0.3 + edge * 0.08) * 0.85;
        ao = 0.45 + 0.55 * smooth(0.0, 0.55, fd);
        grime = 0.5 + (n3 - 0.5) * 0.7;
      } else {
        wet = 0.2; ao = 0.6;
      }
      for (const L of LAMPS) {
        const d = Math.hypot(x - L.pole[0], z - L.pole[1]);
        if (d < 0.6) ao = Math.min(ao, 0.45 + 0.55 * d / 0.6);
      }
      const k = (j * MW + i) * 4;
      data[k] = clamp01(wet) * 255;
      data[k + 1] = clamp01(pud) * 255;
      data[k + 2] = clamp01(grime) * 255;
      data[k + 3] = clamp01(ao) * 255;
    }
  }
  const wetTex = new THREE.DataTexture(data, MW, MW, THREE.RGBAFormat);
  wetTex.generateMipmaps = true;
  wetTex.minFilter = THREE.LinearMipmapLinearFilter;
  wetTex.magFilter = THREE.LinearFilter;
  wetTex.needsUpdate = true;

  const c = document.createElement('canvas');
  c.width = c.height = MK;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, MK, MK);
  g.globalCompositeOperation = 'lighter';
  const rect = (x0, z0, x1, z1, col) => {
    g.fillStyle = col;
    const a = toPx(x0, MK), b = toPx(z0, MK), cc = toPx(x1, MK), d = toPx(z1, MK);
    g.fillRect(a, b, cc - a, d - b);
  };
  const W = 'rgb(255,0,0)', Y = 'rgb(0,255,0)';
  for (const [a, b] of [[-HALF, -10.95], [10.95, HALF]]) {
    rect(-0.22, a, -0.1, b, Y); rect(0.1, a, 0.22, b, Y);
    for (const lx of [-3.75, 3.75]) for (let z = a; z < b; z += 12) rect(lx - 0.06, z, lx + 0.06, Math.min(b, z + 3), W);
  }
  for (const [a, b] of [[-HALF, -14.9], [14.9, HALF]]) for (let x = a; x < b; x += 12) rect(x, -0.06, Math.min(b, x + 3), 0.06, W);
  for (const zc of [-8.6, 8.6]) {
    rect(-9.7, zc - 1.75, 9.7, zc - 1.6, W); rect(-9.7, zc + 1.6, 9.7, zc + 1.75, W);
    for (let x = -9.2; x < 9.3; x += 1.2) rect(x, zc - 1.6, x + 0.6, zc + 1.6, W);
  }
  for (const xc of [-12.6, 12.6]) {
    rect(xc - 1.75, -5.7, xc - 1.6, 5.7, W); rect(xc + 1.6, -5.7, xc + 1.75, 5.7, W);
    for (let z = -5.3; z < 5.4; z += 1.2) rect(xc - 1.6, z, xc + 1.6, z + 0.6, W);
  }
  rect(-7.5, -11.0, -0.35, -10.55, W);
  rect(0.35, 10.55, 7.5, 11.0, W);
  rect(14.6, -3.6, 15.05, 3.6, W);
  const markTex = new THREE.CanvasTexture(c);
  markTex.flipY = false;
  markTex.colorSpace = THREE.NoColorSpace;
  markTex.anisotropy = 8;
  return { wetTex, markTex, wetData: data };
}

export function buildGround(ctx) {
  const { THREE, RAPIER, world, tx, lamps, quality, root, bodies, assets } = ctx;
  const masks = buildMasks(THREE);
  const asphalt = tx.set('asphalt');
  const walk = tx.set('sidewalk');
  const curb = tx.set('curb');
  const ripple = tx.tex('tex/ripples_nor.png');
  for (const t of Object.values(asphalt)) t.repeat.set(PLATE.size / 3.2, PLATE.size / 3.2);
  const U = {
    uWetMap: { value: masks.wetTex },
    uMarkMap: { value: masks.markTex },
    uRipple: { value: ripple },
    uPlateBox: { value: new THREE.Vector4(-HALF, -HALF, PLATE.size, PLATE.size) },
    uHydrant: { value: new THREE.Vector4(0, 0, 0.01, 0) },
    uHydrant2: { value: new THREE.Vector4(0, 0, 0.01, 0) },
    uWetness: { value: 1 },
    uSheen: { value: new THREE.Color(0.028, 0.037, 0.056) },
  };
  const wetPars = /* glsl */`
    uniform sampler2D uWetMap, uMarkMap, uRipple;
    uniform vec4 uPlateBox, uHydrant, uHydrant2;
    uniform float uWetness;
    uniform vec3 uSheen;
    float gWet, gPud, gPaint;
  `;
  const wetMap = (paint) => /* glsl */`
    {
      vec2 puv = ( vPlateWorld.xz - uPlateBox.xy ) / uPlateBox.zw;
      vec4 wm = texture2D( uWetMap, puv );
      float grime = wm.b;
      #if defined( USE_MAP ) && ${paint ? 1 : 0}
      vec3 alt = texture2D( map, vMapUv * 0.41 + vec2( 0.37, 0.71 ) ).rgb;
      diffuseColor.rgb = mix( diffuseColor.rgb, alt, smoothstep( 0.35, 0.65, grime ) * 0.55 );
      float altL = dot( alt, vec3( 0.333 ) );
      #else
      float altL = 0.5;
      #endif
      diffuseColor.rgb *= mix( 0.62, 1.22, grime );
      gPaint = 0.0;
      ${paint ? `
      vec4 mk = texture2D( uMarkMap, puv );
      float wear = smoothstep( 0.2, 0.8, altL * 1.6 + ( grime - 0.5 ) * 0.7 );
      float pw = mk.r * ( 1.0 - 0.75 * wear ), py = mk.g * ( 1.0 - 0.6 * wear );
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.4, 0.395, 0.37 ), pw );
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.5, 0.33, 0.05 ), py );
      gPaint = max( pw, py );` : ''}
      gWet = wm.r * uWetness;
      gPud = wm.g * uWetness;
      float hd = length( vPlateWorld.xz - uHydrant.xy );
      gPud = max( gPud, uHydrant.w * smoothstep( uHydrant.z, uHydrant.z * 0.35, hd ) );
      float hd2 = length( vPlateWorld.xz - uHydrant2.xy );
      gPud = max( gPud, uHydrant2.w * smoothstep( uHydrant2.z, uHydrant2.z * 0.35, hd2 ) );
      gWet = max( gWet, gPud );
      diffuseColor.rgb *= mix( 1.0, 0.52, gWet );
      diffuseColor.rgb *= mix( 1.0, 0.4, gPud * ( 1.0 - gPaint * 0.5 ) );
      diffuseColor.rgb *= wm.a;
    }
  `;
  const wetFrag = (paint) => paint ? [
    ['lights_fragment_maps', /* glsl */`
      #if defined( RE_IndirectSpecular )
      {
        vec3 wN2 = inverseTransformDirection( geometryNormal, viewMatrix );
        vec3 wV2 = inverseTransformDirection( geometryViewDir, viewMatrix );
        vec3 rw = reflect( -wV2, wN2 );
        float el = clamp( rw.y, 0.0, 1.0 );
        radiance += uSheen * exp( -el * 7.0 ) * ( 0.35 + 0.65 * gWet ) * ( 1.0 - 0.5 * gPaint );
      }
      #endif
    `],
    ['map_fragment', wetMap(paint)],
    ['roughnessmap_fragment', /* glsl */`
      roughnessFactor = mix( roughnessFactor, 0.085, smoothstep( 0.45, 0.92, gWet ) * 0.92 );
      roughnessFactor = mix( roughnessFactor, 0.04, gPud );
      roughnessFactor = mix( roughnessFactor, 0.42, gPaint * 0.6 * ( 1.0 - gPud ) );
    `],
    ['normal_fragment_maps', /* glsl */`
      if ( gWet > 0.45 || gPud > 0.02 ) {
        vec2 rp = vPlateWorld.xz;
        vec3 r1 = texture2D( uRipple, rp * 0.42 + vec2( uPlateTime * 0.011, uPlateTime * 0.006 ) ).xyz * 2.0 - 1.0;
        vec3 r2 = texture2D( uRipple, rp * 0.19 - vec2( uPlateTime * 0.007, -uPlateTime * 0.009 ) ).xyz * 2.0 - 1.0;
        vec2 sl = ( r1.xy + r2.xy * 0.8 ) * mix( 0.025, 0.1, gPud );
        vec3 nRip = normalize( ( viewMatrix * vec4( normalize( vec3( sl.x, 1.0, -sl.y ) ), 0.0 ) ).xyz );
        normal = normalize( mix( normal, nRip, max( gPud * 0.95, smoothstep( 0.5, 1.0, gWet ) * 0.6 ) ) );
      }
    `],
  ] : [
    ['map_fragment', wetMap(false)],
    ['roughnessmap_fragment', /* glsl */`
      roughnessFactor = mix( roughnessFactor, 0.16, smoothstep( 0.45, 0.92, gWet ) * 0.85 );
      roughnessFactor = mix( roughnessFactor, 0.05, gPud );
    `],
    ['normal_fragment_maps', 'normal = normalize( mix( normal, nonPerturbedNormal, max( gPud, gWet * 0.4 ) ) );'],
  ];
  const wetMat = (set, paint, key) => {
    const m = new THREE.MeshStandardMaterial({
      map: set.map, normalMap: set.nor, roughnessMap: set.arm, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1, 1), envMapIntensity: 1.7,
    });
    return patchMaterial(m, { lamps, world: true, uniforms: U, fragPars: wetPars, frag: wetFrag(paint), key });
  };
  const roadMat = wetMat(asphalt, true, 'road');
  const walkMat = wetMat(walk, false, 'walk');
  for (const t of Object.values(walk)) t.repeat.set(1, 1);

  const roadGeo = new THREE.PlaneGeometry(PLATE.size - PLATE.bevel * 2, PLATE.size - PLATE.bevel * 2, 1, 1);
  roadGeo.rotateX(-Math.PI / 2);
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  road.name = 'Road';
  root.add(road);

  const inner = HALF - PLATE.bevel;
  const walkGeos = [], curbGeos = [];
  const WT = 1.55, CW = 0.24;
  for (const qx of [-1, 1]) for (const qz of [-1, 1]) {
    const clampPts = (pts) => pts.map(([x, z]) => [clampE(x, inner), clampE(z, inner)]);
    const outline = clampPts(curbOutline(qx, qz, 12, 0, inner));
    const inset = clampPts(curbOutline(qx, qz, 12, CW, inner));
    const shape = new THREE.Shape();
    const pts = [...inset, [qx * inner, qz * inner]];
    pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const sg = new THREE.ShapeGeometry(shape, 1);
    sg.rotateX(-Math.PI / 2);
    sg.translate(0, SIDEWALK_H, 0);
    setUV(sg, (x, y, z) => [x / WT, z / WT]);
    walkGeos.push(sg);
    curbGeos.push(curbStrip(THREE, outline, qx, qz, CW));
  }
  const walkMesh = new THREE.Mesh(mergeGeometries(walkGeos), walkMat);
  walkMesh.receiveShadow = true;
  walkMesh.name = 'Sidewalks';
  root.add(walkMesh);

  for (const t of Object.values(curb)) t.repeat.set(1, 1);
  const curbMat = patchMaterial(new THREE.MeshStandardMaterial({ map: curb.map, normalMap: curb.nor, roughnessMap: curb.arm, roughness: 0.55, metalness: 0, color: 0x8d8f92, vertexColors: true }), {
    lamps, world: true, key: 'curb',
    frag: [['roughnessmap_fragment', 'roughnessFactor *= 0.55;'], ['color_fragment', 'diffuseColor.rgb *= 0.7;']],
  });
  const curbMesh = new THREE.Mesh(mergeGeometries(curbGeos), curbMat);
  curbMesh.receiveShadow = true;
  curbMesh.castShadow = false;
  curbMesh.name = 'Kerbs';
  root.add(curbMesh);

  const slab = buildSlab(THREE, lamps);
  root.add(slab);

  const parkMeshes = buildPark(THREE, lamps, tx, U);
  for (const m of parkMeshes) root.add(m);

  const metal = buildMetalBits(THREE, lamps, tx, assets);
  for (const m of metal) root.add(m);

  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  bodies.push(fixed);
  world.createCollider(RAPIER.ColliderDesc.cuboid(HALF, 0.5, HALF).setTranslation(0, -0.5, 0).setCollisionGroups(GROUP_STATIC).setFriction(0.9), fixed);
  for (const qx of [-1, 1]) for (const qz of [-1, 1]) {
    const cx = qx < 0 ? AVE.x0 : AVE.x1, cz = qz < 0 ? ST.z0 : ST.z1;
    const ox = cx + qx * CURB_R, oz = cz + qz * CURB_R;
    const boxes = [
      [Math.min(cx, qx * inner), Math.min(oz, qz * inner), Math.max(cx, qx * inner), Math.max(oz, qz * inner)],
      [Math.min(ox, qx * inner), Math.min(cz, qz * inner), Math.max(ox, qx * inner), Math.max(cz, qz * inner)],
    ];
    for (const [x0, z0, x1, z1] of boxes) {
      world.createCollider(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, SIDEWALK_H / 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, SIDEWALK_H / 2, (z0 + z1) / 2).setCollisionGroups(GROUP_STATIC).setFriction(0.9), fixed);
    }
    world.createCollider(RAPIER.ColliderDesc.cylinder(SIDEWALK_H / 2, CURB_R).setTranslation(ox, SIDEWALK_H / 2, oz).setCollisionGroups(GROUP_STATIC).setFriction(0.9), fixed);
  }
  const wallH = 4;
  for (const [x, z, hx, hz] of [[0, -HALF - 0.25, HALF, 0.25], [0, HALF + 0.25, HALF, 0.25], [-HALF - 0.25, 0, 0.25, HALF], [HALF + 0.25, 0, 0.25, HALF]]) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, wallH / 2, hz).setTranslation(x, wallH / 2, z).setCollisionGroups(GROUP_EDGE), fixed);
  }

  const surfaceAt = (x, z) => {
    const s = streetSurface(x, z);
    for (const m of MANHOLES) if (Math.hypot(x - m.pos[0], z - m.pos[1]) < 0.4) return 'metal';
    for (const gr of GRATES) if (x > gr.box[0] && x < gr.box[2] && z > gr.box[1] && z < gr.box[3]) return 'metal';
    if (s === 'park') {
      for (const b of PARK.beds) if (x > b[0] && x < b[2] && z > b[1] && z < b[3]) return 'grass';
      return 'concrete';
    }
    if (s === 'void' || s === 'building') return 'concrete';
    const i = Math.min(MW - 1, Math.max(0, Math.floor(((x + HALF) / PLATE.size) * MW)));
    const j = Math.min(MW - 1, Math.max(0, Math.floor(((z + HALF) / PLATE.size) * MW)));
    const pud = masks.wetData[(j * MW + i) * 4 + 1] / 255;
    const hy = U.uHydrant.value, hy2 = U.uHydrant2.value;
    const flood = Math.max(hy.w * (Math.hypot(x - hy.x, z - hy.y) < hy.z * 0.7 ? 1 : 0), hy2.w * (Math.hypot(x - hy2.x, z - hy2.y) < hy2.z * 0.7 ? 1 : 0));
    if (pud > 0.55 || flood > 0.5) return 'water';
    return s === 'road' ? 'asphalt' : 'concrete';
  };

  return { uniforms: U, surfaceAt, materials: { roadMat, walkMat, curbMat }, masks };
}

const clampE = (v, m) => Math.max(-m, Math.min(m, v));

function curbStrip(THREE, outline, qx, qz, w) {
  const top = SIDEWALK_H, bot = -0.03, chamf = 0.025;
  const pos = [], uv = [], col = [], idx = [];
  let acc = 0;
  for (let i = 0; i < outline.length; i++) {
    const [x, z] = outline[i];
    const [xp, zp] = outline[Math.max(0, i - 1)], [xn, zn] = outline[Math.min(outline.length - 1, i + 1)];
    let tx = xn - xp, tz = zn - zp;
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    let nx = tz, nz = -tx;
    const midx = qx * 30, midz = qz * 30;
    if ((midx - x) * nx + (midz - z) * nz > 0) { nx = -nx; nz = -nz; }
    if (i > 0) acc += Math.hypot(x - outline[i - 1][0], z - outline[i - 1][1]);
    const ring = [
      [x + nx * 0.004, bot, z + nz * 0.004],
      [x, top - chamf, z],
      [x - nx * chamf, top, z - nz * chamf],
      [x - nx * w, top, z - nz * w],
    ];
    const vv = [0, 0.18, 0.21, 0.45];
    ring.forEach((p, k) => { pos.push(...p); uv.push(acc / 1.2, vv[k]); col.push(1, 1, 1); });
  }
  const R = 4;
  for (let i = 0; i < outline.length - 1; i++) for (let k = 0; k < R - 1; k++) {
    const a = i * R + k, b = (i + 1) * R + k;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.attributes.normal, p = g.attributes.position;
  let flip = 0;
  for (let i = 0; i < nrm.count; i += R) {
    const ny = nrm.getY(i + 3);
    if (ny < 0) flip++;
  }
  if (flip > nrm.count / R / 2) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  void p;
  return g;
}

function buildSlab(THREE, lamps) {
  const H = HALF, b = PLATE.bevel, D = PLATE.slabDepth;
  const pos = [], idx = [];
  const ring = (s, y) => [[-s, y, -s], [s, y, -s], [s, y, s], [-s, y, s]];
  const rings = [ring(H - b, 0.0), ring(H, -b), ring(H, -D)];
  for (const r of rings) for (const p of r) pos.push(...p);
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < 4; i++) {
    const a = k * 4 + i, c = k * 4 + ((i + 1) % 4), a2 = a + 4, c2 = c + 4;
    idx.push(a, a2, c, c, a2, c2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  const m = patchMaterial(new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.32, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.18, side: THREE.DoubleSide }), {
    lamps, world: true, key: 'slab',
    frag: [['color_fragment', 'diffuseColor.rgb *= smoothstep( -3.4, -0.2, vPlateWorld.y ) * 0.9 + 0.1;']],
  });
  const mesh = new THREE.Mesh(ng, m);
  mesh.name = 'SlabEdge';
  return mesh;
}

function buildPark(THREE, lamps, tx, U) {
  const out = [];
  const bedGeos = [], edgeGeos = [], fenceGeos = [];
  for (const [x0, z0, x1, z1] of PARK.beds) {
    const g = new THREE.BoxGeometry(x1 - x0, 0.12, z1 - z0, 1, 1, 1);
    g.translate((x0 + x1) / 2, SIDEWALK_H + 0.06, (z0 + z1) / 2);
    bedGeos.push(g);
    for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) {
      const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
      const e = new THREE.BoxGeometry(len + 0.3, 0.3, 0.15);
      e.rotateY(-ang);
      e.translate((ax + bx) / 2, SIDEWALK_H + 0.15, (az + bz) / 2);
      edgeGeos.push(e);
      const n = Math.max(2, Math.round(len / 0.55));
      for (let i = 0; i <= n; i++) {
        const t = i / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        if (i < n) {
          const hoop = new THREE.TorusGeometry(0.29, 0.012, 4, 10, Math.PI);
          hoop.rotateY(-ang);
          const mx = px + (bx - ax) / n / 2, mz = pz + (bz - az) / n / 2;
          hoop.translate(mx, SIDEWALK_H + 0.3, mz);
          fenceGeos.push(hoop);
        }
      }
      const rail = new THREE.BoxGeometry(len, 0.02, 0.02);
      rail.rotateY(-ang);
      rail.translate((ax + bx) / 2, SIDEWALK_H + 0.42, (az + bz) / 2);
      fenceGeos.push(rail);
    }
  }
  const soilMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x2a2418, roughness: 0.95 }), {
    lamps, world: true, key: 'soil',
    fragPars: 'uniform sampler2D uWetMap; uniform vec4 uPlateBox;',
    uniforms: U,
    frag: [['color_fragment', /* glsl */`
      { vec2 p = vPlateWorld.xz;
        float n = fract( sin( dot( floor( p * 9.0 ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        float m = texture2D( uWetMap, ( p - uPlateBox.xy ) / uPlateBox.zw ).b;
        vec3 leaf = mix( vec3( 0.22, 0.12, 0.04 ), vec3( 0.32, 0.22, 0.06 ), n );
        vec3 grass = mix( vec3( 0.05, 0.08, 0.03 ), vec3( 0.09, 0.12, 0.04 ), n );
        diffuseColor.rgb = mix( grass, leaf, step( 0.55, fract( n * 7.13 + m ) ) * 0.8 ); }
    `]],
  });
  const beds = new THREE.Mesh(mergeGeometries(bedGeos), soilMat);
  beds.receiveShadow = true;
  out.push(beds);
  const stoneMat = patchMaterial(new THREE.MeshStandardMaterial({ map: tx.tex('tex/stone_diff.jpg', { srgb: true }), color: 0x77736c, roughness: 0.6 }), { lamps, world: true, key: 'bedstone' });
  const edges = mergeGeometries(edgeGeos.map((g) => { setUV(g, (x, y, z, nx, ny, nz) => [Math.abs(nx) > 0.5 ? z : x, Math.abs(ny) > 0.5 ? z : y]); return g; }));
  const em = new THREE.Mesh(edges, stoneMat);
  em.receiveShadow = true;
  out.push(em);
  const ironMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x14181a, roughness: 0.45, metalness: 0.6 }), { lamps, key: 'iron' });
  const fence = new THREE.Mesh(mergeGeometries(fenceGeos.map((g) => g.index ? g.toNonIndexed() : g).map((g) => { g.deleteAttribute('uv'); return g; })), ironMat);
  fence.name = 'ParkFence';
  out.push(fence);
  return out;
}

function buildMetalBits(THREE, lamps, tx, assets) {
  const out = [];
  const man = assets.manhole;
  if (man) {
    const mat = man.material.clone();
    patchMaterial(mat, { lamps, key: 'manhole', frag: [['roughnessmap_fragment', 'roughnessFactor *= 0.55;'], ['color_fragment', 'diffuseColor.rgb *= 0.55;']] });
    const im = new THREE.InstancedMesh(man.geometry, mat, MANHOLES.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1.05, 1, 1.05);
    MANHOLES.forEach((h, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.3); m4.compose(new THREE.Vector3(h.pos[0], -0.045, h.pos[1]), q, s); im.setMatrixAt(i, m4); });
    im.receiveShadow = true;
    im.name = 'Manholes';
    out.push(im);
  }
  const dia = tx.set('diamond');
  for (const t of Object.values(dia)) t.repeat.set(1, 1);
  const grateTex = makeGrateTexture(THREE);
  const cellarGeos = [], subwayGeos = [];
  for (const g of GRATES) {
    const [x0, z0, x1, z1] = g.box;
    const p = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    p.rotateX(-Math.PI / 2);
    p.translate((x0 + x1) / 2, SIDEWALK_H + 0.004, (z0 + z1) / 2);
    setUV(p, (x, y, z) => g.kind === 'cellar' ? [x / 0.5, z / 0.5] : [(x - x0) / 0.6, (z - z0) / 0.6]);
    (g.kind === 'cellar' ? cellarGeos : subwayGeos).push(p);
    if (g.kind === 'cellar') {
      const seam = new THREE.BoxGeometry(Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 0.02 : x1 - x0, 0.01, Math.abs(x1 - x0) > Math.abs(z1 - z0) ? z1 - z0 : 0.02);
      seam.translate((x0 + x1) / 2, SIDEWALK_H + 0.006, (z0 + z1) / 2);
      setUV(seam, () => [0, 0]);
      cellarGeos.push(seam);
    }
  }
  for (const [x, z, along] of DRAINS) {
    const w = along ? 0.45 : 0.9, d = along ? 0.9 : 0.45;
    const p = new THREE.PlaneGeometry(w, d);
    p.rotateX(-Math.PI / 2);
    p.translate(x, 0.006, z);
    setUV(p, (px, py, pz) => [(px - x) / 0.3, (pz - z) / 0.3]);
    subwayGeos.push(p);
  }
  const cellarMat = patchMaterial(new THREE.MeshStandardMaterial({ map: dia.map, normalMap: dia.nor, roughnessMap: dia.arm, metalness: 0.75, roughness: 0.6, color: 0x77746e, polygonOffset: true, polygonOffsetFactor: -2 }), {
    lamps, key: 'cellar', frag: [['roughnessmap_fragment', 'roughnessFactor *= 0.5;']],
  });
  const cm = new THREE.Mesh(mergeGeometries(cellarGeos), cellarMat);
  cm.receiveShadow = true;
  cm.name = 'CellarDoors';
  out.push(cm);
  const grMat = patchMaterial(new THREE.MeshStandardMaterial({ map: grateTex, color: 0xffffff, metalness: 0.8, roughness: 0.42, polygonOffset: true, polygonOffsetFactor: -2 }), { lamps, key: 'grate' });
  const gm = new THREE.Mesh(mergeGeometries(subwayGeos), grMat);
  gm.name = 'Grates';
  out.push(gm);
  return out;
}

function makeGrateTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#020202';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#5a5854';
  for (let i = 0; i < 128; i += 16) { g.fillRect(i, 0, 5, 128); }
  g.fillStyle = '#3c3a37';
  for (let j = 0; j < 128; j += 32) g.fillRect(0, j, 128, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
