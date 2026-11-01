// Street lighting: cobra-head davit poles and park globes, emissive heads, halos, haze cones, pooled real spots and analytic lamp uniforms; traffic signals.
import { LAMPS, LAMP, PARK_LAMP, MERC_COLOR, SIDEWALK_H, SIGNALS, BUILDINGS, SHOP_LIGHT, faceFrame } from './layout.js';
import { patchMaterial } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function lampDefs(THREE) {
  const street = LAMPS.map((L, i) => {
    const park = L.type === 'park';
    const P = park ? PARK_LAMP : LAMP;
    const [px, pz] = L.pole;
    const [dx, dz] = L.dir;
    const head = park ? new THREE.Vector3(px, SIDEWALK_H + P.height, pz) : new THREE.Vector3(px + dx * P.arm, SIDEWALK_H + P.height - 0.35, pz + dz * P.arm);
    const toLight = park ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(-dx * 0.12, 1, -dz * 0.12).normalize();
    const color = new THREE.Color().setRGB(...(L.merc ? MERC_COLOR : P.color));
    return { i, park, street: true, pole: [px, pz], dir: [dx, dz], head, toLight, color, intensity: P.intensity, range: P.range, angle: P.angle, penumbra: P.penumbra, weight: 0 };
  });
  const shops = [];
  for (const b of BUILDINGS) for (const sh of b.shop || []) {
    if (!(sh.lit >= 0.7) || !SHOP_LIGHT[sh.kind]) continue;
    const f = b.face.find((q) => q.dir === sh.dir);
    if (!f) continue;
    const F = faceFrame(b, f);
    const sMid = F.W / 2;
    const head = new THREE.Vector3(F.O[0] + F.u[0] * sMid + F.n[0] * 0.7, SIDEWALK_H + 2.9, F.O[1] + F.u[1] * sMid + F.n[1] * 0.7);
    const toLight = new THREE.Vector3(-F.n[0] * 1.6, 3.0, -F.n[1] * 1.6).normalize();
    const color = new THREE.Color().setRGB(...SHOP_LIGHT[sh.kind]);
    shops.push({ i: street.length + shops.length, park: false, street: false, shop: true, head, toLight, color, intensity: 22 * sh.lit, range: 8, angle: 1.3, penumbra: 1.0, weight: 0 });
  }
  return [...street, ...shops];
}

function tube(THREE, curve, r, segs, rad) {
  const g = new THREE.TubeGeometry(curve, segs, r, rad, false);
  return g;
}

function colorize(g, c) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE_.Float32BufferAttribute(a, 3));
  return g;
}
let THREE_ = null;

function clean(g) {
  let ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') ng.deleteAttribute(k);
  return ng;
}

export function buildLamps(ctx, allDefs) {
  const { THREE, lamps: U, root, quality, RAPIER, world, bodies } = ctx;
  THREE_ = THREE;
  const defs = allDefs.filter((d) => d.street);
  const poleGeos = [], lensGeos = [];
  const grey = [0.30, 0.31, 0.31], iron = [0.035, 0.045, 0.04];
  for (const d of defs) {
    const [px, pz] = d.pole;
    if (!d.park) {
      const base = new THREE.CylinderGeometry(0.15, 0.2, 0.75, 8); base.translate(px, SIDEWALK_H + 0.375, pz);
      const shaft = new THREE.CylinderGeometry(0.075, 0.12, 8.0, 8, 1); shaft.translate(px, SIDEWALK_H + 4.0, pz);
      const top = new THREE.Vector3(px, SIDEWALK_H + 8.0, pz);
      const [dx, dz] = d.dir;
      const curve = new THREE.CubicBezierCurve3(
        top.clone(), new THREE.Vector3(px, SIDEWALK_H + 8.9, pz),
        new THREE.Vector3(px + dx * 0.9, SIDEWALK_H + 9.05, pz + dz * 0.9),
        new THREE.Vector3(px + dx * (LAMP.arm - 0.35), SIDEWALK_H + 8.95, pz + dz * (LAMP.arm - 0.35)));
      const arm = tube(THREE, curve, 0.055, 14, 6);
      const yaw = Math.atan2(dx, dz);
      const housing = new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      housing.scale(0.42, 0.34, 1.0); housing.rotateY(yaw);
      housing.translate(d.head.x, d.head.y + 0.02, d.head.z);
      const rim = new THREE.CylinderGeometry(0.5, 0.5, 0.06, 14, 1, true); rim.scale(0.42, 1, 1.0); rim.rotateY(yaw); rim.translate(d.head.x, d.head.y, d.head.z);
      for (const g of [base, shaft, arm, housing, rim]) poleGeos.push(colorize(clean(g), grey));
      const lens = new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      lens.scale(0.36, 0.16, 0.86); lens.rotateY(yaw); lens.translate(d.head.x, d.head.y - 0.01, d.head.z);
      lensGeos.push(colorize(clean(lens), [d.color.r, d.color.g, d.color.b]));
    } else {
      const base = new THREE.CylinderGeometry(0.16, 0.24, 0.9, 10); base.translate(px, SIDEWALK_H + 0.45, pz);
      const shaft = new THREE.CylinderGeometry(0.055, 0.08, 3.2, 10); shaft.translate(px, SIDEWALK_H + 2.4, pz);
      const collar = new THREE.CylinderGeometry(0.13, 0.08, 0.25, 10); collar.translate(px, SIDEWALK_H + 3.9, pz);
      const cap = new THREE.ConeGeometry(0.2, 0.32, 10); cap.translate(px, d.head.y + 0.48, pz);
      for (const g of [base, shaft, collar, cap]) poleGeos.push(colorize(clean(g), iron));
      const globe = new THREE.SphereGeometry(0.29, 14, 10); globe.scale(1, 1.25, 1); globe.translate(px, d.head.y, pz);
      lensGeos.push(colorize(clean(globe), [0.45, 0.55, 0.5]));
    }
  }
  for (const s of SIGNALS) {
    const [x, z] = s.pos;
    const pole = new THREE.CylinderGeometry(0.08, 0.1, 5.0, 8); pole.translate(x, SIDEWALK_H + 2.5, z);
    poleGeos.push(colorize(clean(pole), iron));
  }
  const poleMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.65 }), { lamps: U, key: 'pole' });
  const poles = new THREE.Mesh(mergeGeometries(poleGeos), poleMat);
  poles.castShadow = true;
  poles.name = 'LampPoles';
  root.add(poles);
  const lensMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 1, 1).multiplyScalar(9) });
  const lenses = new THREE.Mesh(mergeGeometries(lensGeos), lensMat);
  lenses.name = 'LampLenses';
  root.add(lenses);

  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  bodies.push(fixed);
  for (const d of defs) world.createCollider(RAPIER.ColliderDesc.cylinder(2.5, d.park ? 0.12 : 0.16).setTranslation(d.pole[0], SIDEWALK_H + 2.5, d.pole[1]).setCollisionGroups(ctx.GROUP_STATIC), fixed);
  for (const s of SIGNALS) world.createCollider(RAPIER.ColliderDesc.cylinder(2.3, 0.12).setTranslation(s.pos[0], SIDEWALK_H + 2.3, s.pos[1]).setCollisionGroups(ctx.GROUP_STATIC), fixed);

  const halo = makeHalos(THREE, defs);
  root.add(halo.mesh);
  const cones = makeCones(THREE, defs);
  cones.mesh.visible = quality === 'high';
  root.add(cones.mesh);

  const K = quality === 'high' ? 3 : 2;
  const spots = [];
  for (let k = 0; k < K; k++) {
    const s = new THREE.SpotLight(0xffffff, 0, LAMP.range, LAMP.angle, LAMP.penumbra, 2);
    s.name = 'PlateLampSpot' + k;
    if (k === 0 && quality === 'high') {
      s.castShadow = true;
      s.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
      s.shadow.bias = -0.0006;
      s.shadow.normalBias = 0.03;
      s.shadow.radius = 3;
      s.shadow.camera.near = 0.5;
      s.shadow.camera.far = LAMP.range;
    }
    s.userData.lamp = -1;
    root.add(s); root.add(s.target);
    spots.push(s);
  }
  const signals = buildSignals(THREE, U, root, ctx.signs);
  const dist = new Float32Array(defs.length);
  const order = defs.map((d, i) => i);
  const camPos = new THREE.Vector3();
  function writeUniforms() {
    for (let i = 0; i < allDefs.length; i++) {
      const d = allDefs[i];
      U.uLampPos.value[i].set(d.head.x, d.head.y - 0.12, d.head.z, d.range);
      U.uLampDir.value[i].set(d.toLight.x, d.toLight.y, d.toLight.z, Math.cos(d.angle));
      const I = d.intensity * (1 - d.weight);
      U.uLampCol.value[i].set(d.color.r * I, d.color.g * I, d.color.b * I, Math.cos(d.angle * (1 - d.penumbra)));
      const F = d.intensity * (d.park ? 0.02 : d.shop ? 0.03 : 0.012);
      U.uLampFill.value[i].set(d.color.r * F, d.color.g * F, d.color.b * F, 0);
    }
  }
  function update(dt, camera, focus) {
    camPos.copy(focus || camera.position);
    for (let i = 0; i < defs.length; i++) {
      const h = defs[i].head;
      dist[i] = Math.hypot(h.x - camPos.x, (h.y - camPos.y) * 0.5, h.z - camPos.z);
    }
    order.sort((a, b) => dist[a] - dist[b]);
    const dK = dist[order[Math.min(K, order.length - 1)]];
    for (const d of defs) d.weight = 0;
    for (let k = 0; k < K; k++) {
      const i = order[k], d = defs[i], s = spots[k];
      const w = K >= order.length ? 1 : Math.max(0, Math.min(1, (1 - dist[i] / dK) * 3));
      d.weight = w;
      s.position.copy(d.head).y -= 0.12;
      s.target.position.copy(d.head).addScaledVector(d.toLight, -10);
      s.color.copy(d.color);
      s.intensity = d.intensity * w;
      s.distance = d.range; s.angle = d.angle; s.penumbra = d.penumbra;
      s.userData.lamp = i;
    }
    writeUniforms();
    signals.update(dt);
  }
  writeUniforms();
  return { defs, spots, halo, cones, update, signals, poles, lenses, writeUniforms };
}

function makeHalos(THREE, defs) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const n = defs.length * 2;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uFogDensity: { value: 0.012 } },
    vertexShader: /* glsl */`
      attribute vec4 aHalo;
      varying vec3 vCol; varying vec2 vUv; varying float vFade;
      uniform float uFogDensity;
      void main() {
        vec3 c = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
        vec4 mv = viewMatrix * vec4( c, 1.0 );
        float dist = -mv.z;
        float sz = aHalo.w * ( 1.0 + dist * 0.012 );
        mv.xy += position.xy * sz;
        vUv = uv; vCol = aHalo.rgb;
        float fog = exp( -uFogDensity * uFogDensity * dist * dist * 0.6 );
        vFade = smoothstep( 1.0, 4.0, dist ) * fog;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying vec2 vUv; varying float vFade;
      void main() {
        float r = length( vUv - 0.5 ) * 2.0;
        float g = exp( -r * r * 9.0 ) * 0.9 + exp( -r * 3.2 ) * 0.22;
        g *= smoothstep( 1.0, 0.75, r );
        gl_FragColor = vec4( vCol * g * vFade, 1.0 );
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const attr = new Float32Array(n * 4);
  const m4 = new THREE.Matrix4();
  defs.forEach((d, i) => {
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      m4.makeTranslation(d.head.x, d.head.y - (d.park ? 0 : 0.12), d.head.z);
      mesh.setMatrixAt(j, m4);
      const big = k === 1;
      const s = d.park ? (big ? 2.2 : 0.9) : (big ? 3.4 : 1.25);
      const I = d.park ? (big ? 0.035 : 0.8) : (big ? 0.035 : 1.15);
      attr.set([d.color.r * I, d.color.g * I, d.color.b * I, s], j * 4);
    }
  });
  geo.setAttribute('aHalo', new THREE.InstancedBufferAttribute(attr, 4));
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.name = 'LampHalos';
  return { mesh, mat };
}

function makeCones(THREE, defs) {
  const cobra = defs.filter((d) => !d.park);
  const geo = new THREE.CylinderGeometry(0.22, 1, 1, 24, 1, true);
  geo.translate(0, -0.5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0.006 } },
    vertexShader: /* glsl */`
      attribute vec3 aCol;
      varying vec3 vCol; varying float vH; varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4( position, 1.0 );
        vH = -position.y;
        vCol = aCol;
        vN = normalize( mat3( modelMatrix * instanceMatrix ) * vec3( normal.x, 0.0, normal.z ) );
        vV = normalize( cameraPosition - w.xyz );
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uStrength;
      varying vec3 vCol; varying float vH; varying vec3 vN; varying vec3 vV;
      void main() {
        float edge = abs( dot( normalize( vN ), vV ) );
        float a = pow( edge, 1.6 ) * ( 1.0 - vH ) * smoothstep( 0.0, 0.08, vH );
        gl_FragColor = vec4( vCol * a * uStrength, 1.0 );
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, cobra.length);
  const col = new Float32Array(cobra.length * 3);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  cobra.forEach((d, i) => {
    const h = d.head.y - 0.1;
    s.set(Math.tan(d.angle * 0.62) * h, h, Math.tan(d.angle * 0.62) * h * 1.25);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(d.dir[0], d.dir[1]));
    m4.compose(new THREE.Vector3(d.head.x, d.head.y - 0.1, d.head.z), q, s);
    mesh.setMatrixAt(i, m4);
    col.set([d.color.r, d.color.g, d.color.b], i * 3);
  });
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.name = 'LampHaze';
  return { mesh, mat };
}

function buildSignals(THREE, U, root, signs) {
  const heads = [], lenses = [], groupsA = [], peds = [];
  const dirs = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  const pushLens = (g, grp, col) => {
    const ng = clean(g);
    const n = ng.attributes.position.count;
    const ga = new Float32Array(n).fill(grp);
    ng.setAttribute('aGroup', new THREE.Float32BufferAttribute(ga, 1));
    colorize(ng, col);
    lenses.push(ng);
  };
  for (const s of SIGNALS) {
    const [x, z] = s.pos;
    for (const f of s.faces) {
      const [fx, fz] = dirs[f];
      const yaw = Math.atan2(fx, fz);
      const ave = f === 'n' || f === 's';
      const h = SIDEWALK_H + 3.4;
      const box = new THREE.BoxGeometry(0.34, 1.0, 0.24);
      box.rotateY(yaw); box.translate(x + fx * 0.22, h, z + fz * 0.22);
      heads.push(colorize(clean(box), [0.05, 0.06, 0.05]));
      const cols = [[1, 0.06, 0.03], [1, 0.45, 0.02], [0.15, 1, 0.55]];
      for (let k = 0; k < 3; k++) {
        const lens = new THREE.CircleGeometry(0.1, 12);
        lens.rotateY(yaw);
        lens.translate(x + fx * 0.345, h + 0.3 - k * 0.3, z + fz * 0.345);
        pushLens(lens, (ave ? 0 : 3) + k, cols[k]);
        const visor = new THREE.CylinderGeometry(0.12, 0.12, 0.16, 10, 1, true, -Math.PI * 0.75, Math.PI * 1.5);
        visor.rotateX(Math.PI / 2); visor.rotateY(yaw);
        visor.translate(x + fx * 0.42, h + 0.32 - k * 0.3, z + fz * 0.42);
        heads.push(colorize(clean(visor), [0.04, 0.05, 0.04]));
      }
      const ped = new THREE.BoxGeometry(0.42, 0.42, 0.2);
      ped.rotateY(yaw + Math.PI / 2); ped.translate(x + fz * 0.25, SIDEWALK_H + 2.5, z - fx * 0.25);
      heads.push(colorize(clean(ped), [0.05, 0.06, 0.05]));
      peds.push({ x: x + fz * 0.25, z: z - fx * 0.25, yaw: yaw + Math.PI / 2, ave });
    }
  }
  const headMat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }), { lamps: U, key: 'sighead' });
  const headMesh = new THREE.Mesh(mergeGeometries(heads), headMat);
  headMesh.name = 'Signals';
  root.add(headMesh);
  const uSig = { value: new Float32Array(6) };
  const lensMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  lensMat.onBeforeCompile = (sh) => {
    sh.uniforms.uSig = uSig;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGroup; varying float vGroup;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroup = aGroup;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSig[6]; varying float vGroup;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n{ int gi = int( vGroup + 0.5 ); float on = 0.0; for ( int k = 0; k < 6; k ++ ) if ( k == gi ) on = uSig[ k ]; diffuseColor.rgb *= mix( 0.025, 9.0, on ); }');
  };
  lensMat.customProgramCacheKey = () => 'plate-siglens';
  const lensMesh = new THREE.Mesh(mergeGeometries(lenses), lensMat);
  lensMesh.name = 'SignalLenses';
  root.add(lensMesh);
  let pedMesh = null;
  const walkCell = signs?.cell('walk'), dontCell = signs?.cell('dontwalk');
  if (walkCell && dontCell) {
    const pg = [];
    for (const p of peds) {
      for (const [cell, grp] of [[walkCell, p.ave ? 0 : 1], [dontCell, p.ave ? 2 : 3]]) {
        const q = new THREE.PlaneGeometry(0.34, 0.1);
        const uv = q.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, cell.uv[0] + uv.getX(i) * cell.uv[2], cell.uv[1] + uv.getY(i) * cell.uv[3]);
        q.translate(0, grp >= 2 ? -0.07 : 0.07, 0);
        q.rotateY(p.yaw);
        q.translate(p.x + Math.sin(p.yaw) * 0.105, SIDEWALK_H + 2.5, p.z + Math.cos(p.yaw) * 0.105);
        const ga = new Float32Array(q.attributes.position.count).fill(grp);
        q.setAttribute('aGroup', new THREE.Float32BufferAttribute(ga, 1));
        pg.push(q);
      }
    }
    const uPed = { value: new Float32Array(4) };
    const pm = new THREE.MeshBasicMaterial({ map: signs.texture, side: THREE.DoubleSide });
    pm.onBeforeCompile = (sh) => {
      sh.uniforms.uPed = uPed;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGroup; varying float vGroup;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroup = aGroup;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uPed[4]; varying float vGroup;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n{ int gi = int( vGroup + 0.5 ); float on = 0.0; for ( int k = 0; k < 4; k ++ ) if ( k == gi ) on = uPed[ k ]; diffuseColor.rgb *= mix( 0.05, 4.0, on ); }');
    };
    pm.customProgramCacheKey = () => 'plate-ped';
    pedMesh = new THREE.Mesh(mergeGeometries(pg), pm);
    pedMesh.name = 'PedSignals';
    pedMesh.userData.uPed = uPed;
    root.add(pedMesh);
  }
  const moore = signs?.cell('street_moore'), varick = signs?.cell('street_varick');
  if (moore && varick) {
    const sg = [];
    for (const s of SIGNALS) {
      const [x, z] = s.pos;
      for (const [cell, along, h] of [[varick, 'z', 4.62], [moore, 'x', 4.86]]) {
        for (const side of [1, -1]) {
          const q = new THREE.PlaneGeometry(1.25, 0.21);
          const uv = q.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, cell.uv[0] + uv.getX(i) * cell.uv[2], cell.uv[1] + uv.getY(i) * cell.uv[3]);
          if (along === 'z') q.rotateY(Math.PI / 2);
          if (side < 0) q.rotateY(Math.PI);
          const ox = along === 'x' ? (x < 0 ? -0.62 : 0.62) : side * 0.012, oz = along === 'z' ? (z < 0 ? -0.62 : 0.62) : side * 0.012;
          q.translate(x + ox, SIDEWALK_H + h, z + oz);
          sg.push(q);
        }
      }
    }
    const sm = patchMaterial(new THREE.MeshStandardMaterial({ map: signs.texture, roughness: 0.35, metalness: 0.2 }), { lamps: U, key: 'streetsign' });
    const mesh = new THREE.Mesh(mergeGeometries(sg), sm);
    mesh.name = 'StreetSigns';
    root.add(mesh);
  }
  const cycle = [['aveG', 16], ['aveY', 3], ['allR', 1.5], ['stG', 11], ['stY', 3], ['allR2', 1.5]];
  const total = cycle.reduce((a, c) => a + c[1], 0);
  let t = 4;
  function update(dt) {
    t = (t + dt) % total;
    let acc = 0, ph = 'aveG', pt = 0;
    for (const [name, dur] of cycle) { if (t < acc + dur) { ph = name; pt = t - acc; break; } acc += dur; }
    const s = uSig.value;
    s.fill(0);
    s[0] = ph === 'aveG' || ph === 'aveY' ? 0 : 1;
    s[1] = ph === 'aveY' ? 1 : 0;
    s[2] = ph === 'aveG' ? 1 : 0;
    s[3] = ph === 'stG' || ph === 'stY' ? 0 : 1;
    s[4] = ph === 'stY' ? 1 : 0;
    s[5] = ph === 'stG' ? 1 : 0;
    if (pedMesh) {
      const u = pedMesh.userData.uPed.value;
      const walkSt = ph === 'aveG' && pt < 9, walkAve = ph === 'stG' && pt < 6;
      const blinkSt = ph === 'aveG' && pt >= 9 ? (Math.floor(pt * 2) % 2) : 1;
      const blinkAve = ph === 'stG' && pt >= 6 ? (Math.floor(pt * 2) % 2) : 1;
      u[0] = walkAve ? 1 : 0; u[2] = walkAve ? 0 : blinkAve;
      u[1] = walkSt ? 1 : 0; u[3] = walkSt ? 0 : blinkSt;
    }
  }
  return { update, uSig, state: () => uSig.value };
}

