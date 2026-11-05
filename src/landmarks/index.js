// Landmarks runtime: loads assets/landmarks/<id>.glb + json, baked interior lighting, lamp-lit exteriors, doors, interior culling, colliders, ECU controls.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { segmentize } from '../engine/segments.js';

const G_STATIC = 0x0001;
const STATIC_GROUPS = ((G_STATIC << 16) | 0xffff) >>> 0;

const BAKE_VERT = [
  'attribute vec4 bake;\nattribute vec3 _tint;\nvarying vec3 vLmBake;\nvarying vec3 vLmTint;\nuniform float uLmGain;',
  'vLmBake = bake.rgb * 8.0 * uLmGain;\nvLmTint = _tint;',
];
const BAKE_FRAG_PARS = 'varying vec3 vLmBake;\nvarying vec3 vLmTint;\nuniform float uLmSpec;';
const LIGHTS_POINT_ONLY = ['( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )', '( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )', '( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )', '( NUM_HEMI_LIGHTS > 0 )']
  .reduce((src, cond) => src.replace('#if ' + cond, '#if 0'), THREE.ShaderChunk.lights_fragment_begin);
const BAKE_LIGHT = 'reflectedLight.indirectDiffuse = vLmBake * material.diffuseColor;\nreflectedLight.indirectSpecular = vLmBake * uLmSpec * material.specularColor * ( 1.0 - 0.6 * material.roughness );';

export const bakeUniforms = { uLmGain: { value: 1.0 }, uLmSpec: { value: 0.45 } };

export function patchBaked(material) {
  if (material.userData.lmBaked) return material;
  material.userData.lmBaked = true;
  material.vertexColors = false;
  material.envMapIntensity = 0;
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uLmGain = bakeUniforms.uLmGain;
    sh.uniforms.uLmSpec = bakeUniforms.uLmSpec;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + BAKE_VERT[0])
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + BAKE_VERT[1]);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + BAKE_FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vLmTint;')
      .replace('#include <lights_fragment_begin>', LIGHTS_POINT_ONLY)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + BAKE_LIGHT);
  };
  material.customProgramCacheKey = () => 'lmbake2';
  material.needsUpdate = true;
  return material;
}

function prepBakedGeometry(geo) {
  const c = geo.getAttribute('color');
  if (c) { geo.setAttribute('bake', c); geo.deleteAttribute('color'); }
  else {
    const n = geo.getAttribute('position').count;
    geo.setAttribute('bake', new THREE.BufferAttribute(new Float32Array(n * 4).fill(0.04), 4));
  }
}

export async function loadLandmark(id, { renderer = null, lamps = null, patchMaterial = null, base = './assets/landmarks/', loader = null } = {}) {
  const [gltf, json] = await Promise.all([
    (loader || new GLTFLoader()).loadAsync(`${base}${id}.glb`),
    fetch(`${base}${id}.json`).then((r) => r.json()),
  ]);
  const root = gltf.scene.getObjectByName(json.root || 'Firehouse') || gltf.scene;
  const scene = gltf.scene;
  scene.name = 'Landmark_' + id;
  const nodes = {};
  const colliders = [];
  const patched = new Set();
  scene.traverse((o) => {
    if (o.name) nodes[o.name] = o;
    if (!o.isMesh) return;
    if (o.name.startsWith('Collider')) { o.visible = false; colliders.push(o); return; }
    o.castShadow = false;
    o.receiveShadow = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (o.geometry.getAttribute('_tint')) {
      prepBakedGeometry(o.geometry);
      for (const m of mats) if (!patched.has(m)) { patchBaked(m); patched.add(m); }
    } else if (lamps && patchMaterial) {
      for (const m of mats) {
        if (patched.has(m) || /Emit/.test(m.name)) continue;
        patchMaterial(m, { lamps, key: 'lm_' + m.name });
        patched.add(m);
      }
    }
  });
  const groups = {
    exterior: nodes.Exterior || null,
    garage: nodes.Interior_Garage || null,
    upper: nodes.Interior_Upper || null,
    basement: nodes.Interior_Basement || null,
  };
  const building = nodes.Building || root;
  const box = json.interior_box ? { x0: json.interior_box.x[0], x1: json.interior_box.x[1], z0: json.interior_box.z[0], z1: json.interior_box.z[1] } : null;
  const lv = json.levels || {};

  const doorDefs = json.doors || {};
  const doors = Object.keys(doorDefs).filter((k) => k.startsWith('GarageDoor_') && nodes[k]).map((k, i) => ({
    name: k, node: nodes[k], open: THREE.MathUtils.degToRad(doorDefs[k].open_deg), t: 0, delay: k.endsWith('_R') ? (doorDefs.timing_s?.stagger_R ?? 0.25) : 0, wait: 0,
  }));
  const timing = doorDefs.timing_s || { open: 2.2, close: 2.6 };
  let doorTarget = 0;
  const doorGlass = [];
  const signMats = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.name === 'DoorGlassEmit' && !doorGlass.includes(m)) doorGlass.push(m);
      if (m.name === 'X_SignEmit' && !signMats.includes(m)) signMats.push(m);
    }
  });

  const ecuMesh = nodes.ECU_LightEmit?.isMesh ? nodes.ECU_LightEmit : nodes.ECU_LightEmit?.getObjectByProperty('isMesh', true);
  const ecuSeg = ecuMesh ? segmentize(ecuMesh, 3, 5) : null;
  const ecuGlowMesh = nodes.ECU_DoorEmit?.isMesh ? nodes.ECU_DoorEmit : nodes.ECU_DoorEmit?.getObjectByProperty('isMesh', true);
  if (ecuGlowMesh) { ecuGlowMesh.material = ecuGlowMesh.material.clone(); ecuGlowMesh.material.emissiveIntensity = 0; }
  const ecu = {
    root: nodes.ECU || null,
    lever: nodes.ECU_Lever || null,
    slotDoor: nodes.ECU_SlotDoor || null,
    set({ red, green, amber, lever, slotDoor, glow } = {}) {
      if (ecuSeg) {
        if (red !== undefined) ecuSeg.levels[0] = red;
        if (green !== undefined) ecuSeg.levels[1] = green;
        if (amber !== undefined) ecuSeg.levels[2] = amber;
      }
      if (lever !== undefined && this.lever) this.lever.rotation.set(THREE.MathUtils.degToRad(lever), 0, 0);
      if (slotDoor !== undefined && this.slotDoor) this.slotDoor.rotation.set(THREE.MathUtils.degToRad(slotDoor), 0, 0);
      if (glow !== undefined && ecuGlowMesh) ecuGlowMesh.material.emissiveIntensity = glow;
    },
  };
  ecu.set({ red: 1, green: 0, amber: 0.6, lever: json.ECU?.ECU_Lever?.rest_deg ?? -12, slotDoor: 0, glow: 0 });

  const inv = new THREE.Matrix4();
  const local = new THREE.Vector3();
  const vis = { garage: true, upper: true, basement: true };
  function setInterior(v) {
    Object.assign(vis, v);
    if (groups.garage) groups.garage.visible = vis.garage;
    if (groups.upper) groups.upper.visible = vis.upper;
    if (groups.basement) groups.basement.visible = vis.basement;
  }
  function cameraInside(camPos) {
    inv.copy(root.matrixWorld).invert();
    local.copy(camPos).applyMatrix4(inv);
    if (!box) return { inside: false, p: local };
    const inside = local.x > box.x0 - 0.3 && local.x < box.x1 + 0.3 && local.z > box.z0 - 0.3 && local.z < box.z1 + 0.6 && local.y > (lv.basement_floor ?? -4) - 0.5 && local.y < (lv.upper_ceiling ?? 10) + 0.5;
    return { inside, p: local };
  }
  function updateVisibility(camPos) {
    const { inside, p } = cameraInside(camPos);
    const doorOpen = doors.some((d) => d.t > 0.02);
    if (inside) {
      setInterior({ garage: true, upper: p.y > 2.5 || (p.z < -10 && p.z > -19), basement: p.y < 1.2 || p.z < -18 });
    } else {
      const front = p.z > -0.8 && p.z < 70 && Math.abs(p.x - (box ? (box.x0 + box.x1) / 2 : 0)) < 45;
      setInterior({ garage: doorOpen && front, upper: false, basement: false });
    }
    return inside;
  }

  function setDoors(open) { doorTarget = open ? 1 : 0; for (const d of doors) d.wait = open ? d.delay : 0; }
  function setDoorsNow(t) { doorTarget = t; for (const d of doors) { d.t = t; d.node.rotation.set(0, d.open * ease(t), 0); } }
  const ease = (t) => t * t * (3 - 2 * t);

  const bodies = [];
  const kin = [];
  const tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
  function buildColliders({ RAPIER, world, groups: cg = STATIC_GROUPS }) {
    scene.updateMatrixWorld(true);
    const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    bodies.push(fixed);
    const vtx = new THREE.Vector3();
    for (const c of colliders) {
      const door = doors.find((d) => isChild(c, d.node));
      const pos = c.geometry.getAttribute('position');
      const pts = new Float32Array(pos.count * 3);
      if (door) {
        c.updateMatrix();
        for (let i = 0; i < pos.count; i++) { vtx.fromBufferAttribute(pos, i).applyMatrix4(c.matrix); pts.set([vtx.x, vtx.y, vtx.z], i * 3); }
        door.node.matrixWorld.decompose(tmpP, tmpQ, tmpS);
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(tmpP.x, tmpP.y, tmpP.z).setRotation({ x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w }));
        const desc = RAPIER.ColliderDesc.convexHull(pts);
        if (desc) world.createCollider(desc.setCollisionGroups(cg), body);
        bodies.push(body);
        kin.push({ body, node: door.node });
      } else {
        for (let i = 0; i < pos.count; i++) { vtx.fromBufferAttribute(pos, i).applyMatrix4(c.matrixWorld); pts.set([vtx.x, vtx.y, vtx.z], i * 3); }
        const desc = RAPIER.ColliderDesc.convexHull(pts);
        if (desc) world.createCollider(desc.setCollisionGroups(cg), fixed);
      }
    }
    return bodies;
  }
  function isChild(o, p) { for (let q = o.parent; q; q = q.parent) if (q === p) return true; return false; }

  function update(dt, { camera = null } = {}) {
    for (const d of doors) {
      if (d.wait > 0) { d.wait -= dt; continue; }
      const dur = doorTarget > d.t ? timing.open : timing.close;
      const step = dt / Math.max(0.1, dur);
      const nt = doorTarget > d.t ? Math.min(doorTarget, d.t + step) : Math.max(doorTarget, d.t - step);
      if (nt !== d.t) { d.t = nt; d.node.rotation.set(0, d.open * ease(d.t), 0); }
    }
    if (kin.length) {
      for (const k of kin) {
        k.node.updateWorldMatrix(true, false);
        k.node.matrixWorld.decompose(tmpP, tmpQ, tmpS);
        k.body.setNextKinematicTranslation(tmpP);
        k.body.setNextKinematicRotation(tmpQ);
      }
    }
    if (camera) updateVisibility(camera.getWorldPosition(tmpP));
  }

  function place(city = null) {
    const lot = city?.landmark?.(id);
    if (lot && lot.pos) { scene.position.copy(lot.pos); scene.rotation.set(0, lot.yaw || 0, 0); }
    else if (json.anchor) { scene.position.fromArray(json.anchor.pos); scene.rotation.set(0, json.anchor.yaw || 0, 0); }
    scene.updateMatrixWorld(true);
    return scene;
  }

  function empty(name) {
    const n = nodes[name];
    if (!n) return null;
    n.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3(), q = new THREE.Quaternion();
    n.matrixWorld.decompose(pos, q, tmpS);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    return { pos, quaternion: q, yaw: Math.atan2(fwd.x, fwd.z), node: n };
  }

  function stats() {
    let tris = 0, meshes = 0;
    scene.traverse((o) => { if (o.isMesh && o.visible && !o.name.startsWith('Collider')) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3; } });
    return { tris: Math.round(tris), meshes };
  }

  function dispose() {
    scene.parent?.remove(scene);
    scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); } } });
  }

  return {
    id, json, scene, root, building, nodes, groups, doors, ecu, colliders,
    place, setDoors, setDoorsNow, setInterior, updateVisibility, cameraInside, buildColliders, update, empty, stats, dispose,
    setGarageGlow(v) { for (const m of doorGlass) m.emissiveIntensity = v; },
    setSign(v) { for (const m of signMats) m.emissiveIntensity = v; },
    get doorOpen() { return doors.length ? doors.reduce((a, d) => a + d.t, 0) / doors.length : 0; },
  };
}
