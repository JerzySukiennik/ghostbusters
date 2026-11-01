// createPlate: a 1984 Manhattan street corner at night on a bevelled 110 m slab (CONTRACT 4.5).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLATE, ECTO, HOTDOG, GHOST_ROUTE, SIDEWALK_H, GROUP_STATIC, BUILDINGS } from './layout.js';
import { createTextures, createLampUniforms } from './materials.js';
import { buildGround } from './ground.js';
import { lampDefs, buildLamps } from './lamps.js';
import { buildBuildings } from './buildings.js';
import { buildSky, NIGHT } from './sky.js';
import { buildProps } from './props.js';
import { buildSteam } from './steam.js';
import { buildTrees } from './trees.js';

const BASE = new URL('../../assets/world/', import.meta.url).href;

export async function createPlate({ THREE, RAPIER, world, scene, renderer, camera, quality = 'medium' }) {
  const q = ['low', 'medium', 'high'].includes(quality) ? quality : 'medium';
  const root = new THREE.Group();
  root.name = 'Plate';
  const bodies = [];
  const saved = { fog: scene.fog, background: scene.background, environment: scene.environment, envI: scene.environmentIntensity };
  try {
    const tx = createTextures(THREE, renderer, BASE);
    const lamps = createLampUniforms(THREE);
    const defs = lampDefs(THREE);
    const boothLamp = { i: defs.length, park: false, street: false, shop: true, dynamic: true, head: new THREE.Vector3(0, -50, 0), toLight: new THREE.Vector3(0, 1, 0), color: new THREE.Color(0.78, 0.92, 1.0), intensity: 26, range: 6, angle: 1.45, penumbra: 1, weight: 0 };
    defs.push(boothLamp);
    const cartLamp = { i: defs.length, park: false, street: false, shop: true, head: new THREE.Vector3(HOTDOG.pos[0], SIDEWALK_H + 2.25, HOTDOG.pos[1]), toLight: new THREE.Vector3(0, 1, 0), color: new THREE.Color(1.0, 0.72, 0.45), intensity: 14, range: 7, angle: 1.35, penumbra: 1, weight: 0 };
    defs.push(cartLamp);
    lamps.count = defs.length;

    const [signsJson, atlasJson, gltf] = await Promise.all([
      fetch(BASE + 'tex/signs.json').then((r) => r.json()),
      fetch(BASE + 'tex/props_atlas.json').then((r) => r.json()),
      new GLTFLoader().loadAsync(BASE + 'props.glb').catch((e) => { console.warn('[plate] props.glb missing', e); return null; }),
    ]);
    const signTex = tx.tex('tex/signs.jpg', { srgb: true, wrap: false });
    const signs = { texture: signTex, cell: (k) => signsJson.cells.find((c) => c.key === k) };
    const atlas = { texture: tx.tex('tex/props_atlas.jpg', { srgb: true, wrap: false }), ...atlasJson };
    const meshByName = {};
    gltf?.scene.traverse((o) => { if (o.isMesh) meshByName[o.name] = o; });
    const assets = {
      trashcan: meshByName.TrashCan, trashlid: meshByName.TrashLid, hydrant: meshByName.Hydrant, hydrantcap: meshByName.HydrantCap,
      cardboard: meshByName.CardboardBox, trashbag: meshByName.TrashBag, barrel: meshByName.Barrel, manhole: meshByName.Manhole,
    };
    const shopTint = { bar: [1.0, 0.55, 0.3], liquor: [1.0, 0.85, 0.75], lobby: [1.0, 0.75, 0.45], records: [1.0, 0.7, 0.85], deli: [0.85, 0.95, 1.0], office: [0.82, 0.92, 1.0], pizza: [1.0, 0.78, 0.5], diner: [1.0, 0.88, 0.7], bakery: [1.0, 0.86, 0.62], cleaners: [0.8, 0.9, 1.0] };
    const ctx = { THREE, RAPIER, world, scene, renderer, camera, quality: q, root, bodies, tx, lamps, signs, atlas, assets, shopTint, GROUP_STATIC };

    const sky = buildSky(ctx);
    const ground = buildGround(ctx);
    const lampSys = buildLamps(ctx, defs);
    const city = buildBuildings(ctx);
    const steam = buildSteam(ctx);
    buildTrees(ctx);
    let hydrants = 0;
    ctx.onHydrant = (p) => {
      const t = p.body.translation(), r = p.body.rotation();
      const qq = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(qq);
      steam.water.start(t.x + fwd.x * 0.2, t.y + 0.45, t.z + fwd.z * 0.2, fwd.x, fwd.z);
      const u = hydrants++ === 0 ? ground.uniforms.uHydrant : ground.uniforms.uHydrant2;
      u.value.set(t.x + fwd.x * 2.2, t.z + fwd.z * 2.2, 0.01, 1);
      flood.push({ u, r: 0.01 });
    };
    const flood = [];
    const propSys = buildProps(ctx);

    const moon = new THREE.DirectionalLight(new THREE.Color(0.58, 0.72, 1.0), 0.32);
    moon.name = 'PlateMoon';
    moon.position.copy(sky.moonDir).multiplyScalar(80);
    moon.target.position.set(0, 0, 0);
    moon.castShadow = false;
    moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 220 });
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.04;
    root.add(moon, moon.target);
    const hemi = new THREE.HemisphereLight(new THREE.Color(0.26, 0.38, 0.62), new THREE.Color(0.07, 0.07, 0.08), 0.68);
    hemi.name = 'PlateHemi';
    root.add(hemi);

    await tx.ready();
    scene.add(root);
    root.updateMatrixWorld(true);

    lampSys.update(0, camera, new THREE.Vector3(0, 2, 4));
    const others = [];
    for (const top of scene.children) {
      if (top === root) continue;
      top.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible) others.push(o); });
    }
    for (const o of others) o.visible = false;
    const pools = [...propSys.pools.values()].map((p) => p.im);
    for (const im of pools) im.visible = true;
    const hidden = [steam.mesh, lampSys.cones.mesh].filter((o) => o.visible);
    for (const o of hidden) o.visible = false;
    const envSize = q === 'high' ? 512 : q === 'low' ? 128 : 256;
    const cubeRT = new THREE.WebGLCubeRenderTarget(envSize, { type: THREE.HalfFloatType });
    const pmrem = new THREE.PMREMGenerator(renderer);
    const placeholder = pmrem.fromCubemap(cubeRT.texture).texture;
    scene.environment = placeholder;
    scene.environmentIntensity = 1.0;
    const prevRT = renderer.getRenderTarget();
    const tmpRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    renderer.setRenderTarget(tmpRT);
    if (renderer.compileAsync) { try { await renderer.compileAsync(root, camera, scene); } catch (e) { console.warn('[plate] compileAsync', e); } }
    renderer.setRenderTarget(prevRT);
    tmpRT.dispose();
    for (const im of pools) im.visible = false;
    const cubeCam = new THREE.CubeCamera(0.2, 900, cubeRT);
    cubeCam.position.set(0, 2.2, 6);
    scene.add(cubeCam);
    const prevTM = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    cubeCam.update(renderer, scene);
    renderer.toneMapping = prevTM;
    scene.remove(cubeCam);
    const envTex = pmrem.fromCubemap(cubeRT.texture).texture;
    placeholder.dispose();
    pmrem.dispose();
    cubeRT.dispose();
    for (const o of others) o.visible = true;
    for (const o of hidden) o.visible = true;
    scene.environment = envTex;

    const cart = propSys.cart;
    const cartTop = cart ? new THREE.Vector3(cart.object3D.position.x, SIDEWALK_H + 1.0, cart.object3D.position.z) : new THREE.Vector3(HOTDOG.pos[0], 1.15, HOTDOG.pos[1]);
    const spawns = {
      player: { pos: new THREE.Vector3(ECTO.pos[0] + 2.35, SIDEWALK_H, ECTO.pos[2] + 1.6), yaw: -Math.PI / 2 },
      ecto: { pos: new THREE.Vector3(ECTO.pos[0], 0, ECTO.pos[2]), yaw: ECTO.yaw },
      ghost: { pos: new THREE.Vector3(HOTDOG.pos[0], 3.0, HOTDOG.pos[1]) },
      ghostRoute: GHOST_ROUTE.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      hotdogCart: { pos: cartTop, prop: cart || null },
    };

    const focus = new THREE.Vector3();
    let time = 0;
    const booth = propSys.lampProp;
    const shadowSpot = lampSys.spots[0];
    const stack = propSys.props.find((p) => p.kind === 'stack');
    const plate = {
      root, spawns, props: propSys.props, debris: propSys.debris,
      bounds: { minX: -PLATE.half + 1, maxX: PLATE.half - 1, minZ: -PLATE.half + 1, maxZ: PLATE.half - 1 },
      lights: { moon, hemi, lampSpots: lampSys.spots, lamps: defs, signals: lampSys.signals, uniforms: lamps },
      envMap: envTex,
      fx: { steam, water: steam.water },
      surfaceAt: ground.surfaceAt,
      propOfCollider: (c) => propSys.byCollider.get(typeof c === 'number' ? c : c?.handle) || null,
      buildings: BUILDINGS,
      stats: city.stats,
      update(dt) {
        dt = Math.min(dt, 0.1);
        time += dt;
        lamps.uPlateTime.value = time;
        camera.getWorldPosition(focus);
        if (cart && !cart.dead) { const p = cart.object3D.position, qq = cart.object3D.quaternion; cartLamp.head.set(0.1, 2.1, 0).applyQuaternion(qq).add(p); cartLamp.intensity = cart._hidden.has(1) ? 6 : 14; }
        if (booth) {
          if (booth._lampOff || booth.dead) boothLamp.intensity = 0;
          else { const p = booth.object3D.position, qq = booth.object3D.quaternion; boothLamp.head.set(0, 2.0, 0).applyQuaternion(qq).add(p); boothLamp.toLight.set(0, 1, 0).applyQuaternion(qq); }
        }
        lampSys.update(dt, camera, focus);
        if (shadowSpot.castShadow) shadowSpot.shadow.needsUpdate = true;
        propSys.update(dt);
        if (stack && steam.emitters.length) {
          const sp = stack.object3D.position;
          const e0 = steam.emitters[0];
          const near = Math.hypot(sp.x - e0.base[0], sp.z - e0.base[2]) < 0.8 && stack.object3D.quaternion.w > 0.97;
          if (near) steam.setEmitter(0, sp.x, sp.y + 3.05, sp.z); else steam.setEmitter(0, e0.base[0], 0.05, e0.base[2]);
        }
        steam.update(dt);
        sky.update(time);
        for (const f of flood) { f.r = Math.min(6.5, f.r + dt * 0.35); f.u.value.z = f.r; }
      },
      dispose() {
        scene.remove(root);
        for (const b of bodies) { try { world.removeRigidBody(b); } catch {} }
        root.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose()); });
        for (const t of tx.cache.values()) t.dispose();
        envTex.dispose();
        if (scene.environment === envTex) scene.environment = saved.environment;
        scene.fog = saved.fog; scene.background = saved.background;
      },
    };
    plate.update(0);
    return plate;
  } catch (e) {
    scene.remove(root);
    for (const b of bodies) { try { world.removeRigidBody(b); } catch {} }
    scene.fog = saved.fog; scene.background = saved.background; scene.environment = saved.environment;
    throw e;
  }
}

export { NIGHT };
