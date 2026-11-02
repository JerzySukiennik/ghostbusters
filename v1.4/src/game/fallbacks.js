// Stand-ins with the exact contract names (Ecto-1, pack, wand, trap, plate, FX) so the game runs before every lane delivers.
import * as THREE from 'three';
import { G, groups } from '../engine/physics.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
const emitMat = (color, name) => { const m = std(0x222222, { emissive: new THREE.Color(color), emissiveIntensity: 4 }); m.name = name; return m; };
const empty = (name, x, y, z, parent, ry = 0) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };
const mesh = (geo, mat, name, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

function segGeo(parts) {
  const geos = parts.map(([g, s]) => { const gg = g.index ? g.toNonIndexed() : g; const n = gg.attributes.position.count; gg.setAttribute('_seg', new THREE.BufferAttribute(new Float32Array(n).fill(s), 1)); return gg; });
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv', '_seg']) {
    const arrs = geos.map((g) => g.attributes[k]);
    if (arrs.some((a) => !a)) continue;
    const size = arrs[0].itemSize, len = arrs.reduce((s, a) => s + a.array.length, 0), buf = new Float32Array(len);
    let o = 0; for (const a of arrs) { buf.set(a.array, o); o += a.array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(buf, size));
  }
  return out;
}

export function fallbackEcto() {
  const root = new THREE.Group(); root.name = 'Ecto1';
  const white = std(0xf2f0ea, { roughness: 0.25, metalness: 0.05 }), red = std(0xb3201c, { roughness: 0.35 }), chrome = std(0xdddddd, { roughness: 0.12, metalness: 1 }), glass = std(0x223040, { roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55 }), tyre = std(0x111111, { roughness: 0.85 }), dark = std(0x1a1a1a, { roughness: 0.7 });
  const body = new THREE.Group(); body.name = 'Body'; root.add(body);
  mesh(new THREE.BoxGeometry(2.0, 0.62, 6.1), white, 'Hull', body, 0, 0.72, -0.1);
  mesh(new THREE.BoxGeometry(1.86, 0.62, 3.9), white, 'Cabin', body, 0, 1.33, -0.75);
  mesh(new THREE.BoxGeometry(1.8, 0.52, 3.86), glass, 'Glass', body, 0, 1.35, -0.75);
  for (const s of [-1, 1]) { const f = mesh(new THREE.BoxGeometry(0.08, 0.5, 1.4), red, 'Fin', body, s * 0.95, 1.12, -2.55); f.rotation.x = -0.25; }
  mesh(new THREE.BoxGeometry(2.04, 0.16, 0.2), chrome, 'BumperF', body, 0, 0.5, 3.0);
  mesh(new THREE.BoxGeometry(2.04, 0.16, 0.2), chrome, 'BumperR', body, 0, 0.5, -3.2);
  mesh(new THREE.BoxGeometry(1.5, 0.08, 2.4), dark, 'Rack', body, 0, 1.68, -0.9);
  const beacon = new THREE.Group(); beacon.name = 'Beacon'; beacon.position.set(0, 1.84, 0.25); root.add(beacon);
  mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.24, 16), emitMat(0xff2a1a, 'BeaconEmitMat'), 'BeaconEmit', beacon);
  const bar = mesh(segGeo([[new THREE.BoxGeometry(0.36, 0.1, 0.14), 0], [new THREE.BoxGeometry(0.36, 0.1, 0.14).translate(0.5, 0, 0), 1], [new THREE.BoxGeometry(0.36, 0.1, 0.14).translate(-0.5, 0, 0), 2]]), emitMat(0xff3322, 'LightBarEmitMat'), 'LightBarEmit', root, 0, 1.76, 0.75);
  bar.userData.segments = 3;
  const hl = mesh(new THREE.BoxGeometry(1.7, 0.12, 0.04), emitMat(0xfff2d0, 'HeadEmitMat'), 'HeadlightEmit', root, 0, 0.82, 3.06);
  hl.material.emissiveIntensity = 2;
  mesh(new THREE.BoxGeometry(1.9, 0.08, 0.04), emitMat(0xff1a10, 'TailEmitMat'), 'TailLightEmit', root, 0, 0.98, -3.2);
  const wheels = [['FL', 0.84, 1.98], ['FR', -0.84, 1.98], ['RL', 0.84, -1.98], ['RR', -0.84, -1.98]];
  for (const [n, x, z] of wheels) {
    const w = new THREE.Group(); w.name = 'Wheel_' + n; w.position.set(x, 0.4, z); root.add(w);
    const t = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.26, 24), tyre, 'Tyre', w); t.rotation.z = Math.PI / 2;
    const c = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.27, 20), chrome, 'Hub', w); c.rotation.z = Math.PI / 2;
  }
  const dfl = new THREE.Group(); dfl.name = 'Door_FL'; dfl.position.set(1.0, 0.95, 0.9); root.add(dfl);
  mesh(new THREE.BoxGeometry(0.05, 0.6, 1.1), white, 'DoorPanel', dfl, 0, 0, -0.55);
  const dfr = new THREE.Group(); dfr.name = 'Door_FR'; dfr.position.set(-1.0, 0.95, 0.9); root.add(dfr);
  mesh(new THREE.BoxGeometry(0.05, 0.6, 1.1), white, 'DoorPanel', dfr, 0, 0, -0.55);
  const rd = new THREE.Group(); rd.name = 'RearDoor'; rd.position.set(0, 1.62, -2.72); root.add(rd);
  mesh(new THREE.BoxGeometry(1.7, 1.0, 0.05), white, 'RearPanel', rd, 0, -0.52, 0);
  const tray = new THREE.Group(); tray.name = 'PackTray'; tray.position.set(0, 0.7, -1.45); root.add(tray);
  mesh(new THREE.BoxGeometry(1.36, 0.04, 2.3), chrome, 'TrayPlate', tray);
  const slots = [[0.3, -0.85], [-0.3, -0.85], [0.3, -0.05], [-0.3, -0.05]];
  slots.forEach(([x, z], i) => empty('PackSlot_' + (i + 1), x, 0.38, z, tray, Math.PI));
  const sw = new THREE.Group(); sw.name = 'SteeringWheel'; sw.position.set(0.42, 1.25, 0.55); sw.rotation.x = -0.45; root.add(sw);
  mesh(new THREE.TorusGeometry(0.2, 0.02, 8, 24), dark, 'Rim', sw);
  empty('Seat_Driver', 0.42, 0.62, -0.05, root);
  empty('Exit_Driver', 1.65, 0, 0.35, root, Math.PI / 2);
  empty('TrapStow', 0, 0.8, -1.9, root);
  empty('Siren', 0, 1.8, 0.6, root);
  empty('Exhaust', -0.6, 0.3, -3.2, root);
  empty('Headlight_L', 0.7, 0.82, 3.1, root);
  empty('Headlight_R', -0.7, 0.82, 3.1, root);
  const col = mesh(new THREE.BoxGeometry(2.0, 1.2, 6.3), std(0), 'Collider', root, 0, 1.05, -0.1); col.visible = false;
  const json = { wheelbase: 3.96, track_front: 1.68, track_rear: 1.68, wheel_radius: 0.4, wheel_width: 0.26, mass_kg: 2600, ride_height: 0.2,
    rearDoor: { axis: [1, 0, 0], open_deg: -95 }, tray: { axis: [0, 0, -1], travel_m: 1.55 }, doors: { Door_FL: { axis: [0, 1, 0], open_deg: 62 }, Door_FR: { axis: [0, 1, 0], open_deg: -62 } },
    steering: { axis: [0, 0, 1], ratio: 14 }, beacon: { axis: [0, 1, 0] } };
  return { scene: root, json, fallback: true };
}

export function fallbackPack() {
  const root = new THREE.Group(); root.name = 'ProtonPack';
  const black = std(0x1c1c1e, { roughness: 0.55 }), alu = std(0x8a8d90, { roughness: 0.35, metalness: 0.9 }), olive = std(0x3a3f2e, { roughness: 0.8 });
  mesh(new THREE.BoxGeometry(0.34, 0.66, 0.03), olive, 'Frame', root, 0, 0, -0.015);
  mesh(new THREE.BoxGeometry(0.40, 0.56, 0.2), black, 'Motherboard', root, 0, 0.02, -0.13);
  const cyc = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 32), alu, 'Cyclotron', root, 0.02, -0.22, -0.2); cyc.rotation.x = Math.PI / 2;
  const lights = []; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; lights.push([new THREE.SphereGeometry(0.03, 12, 8).translate(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0), i]); }
  const ce = mesh(segGeo(lights), emitMat(0xff2010, 'CycEmitMat'), 'CyclotronEmit', root, 0.02, -0.22, -0.26); ce.userData.segments = 4;
  const cells = []; for (let i = 0; i < 15; i++) cells.push([new THREE.BoxGeometry(0.06, 0.014, 0.012).translate(0, i * 0.02, 0), i]);
  const pc = mesh(segGeo(cells), emitMat(0x3a7bff, 'CellEmitMat'), 'PowerCellEmit', root, 0.13, -0.05, -0.235); pc.userData.segments = 15;
  mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 16), alu, 'Booster', root, -0.13, 0.05, -0.24);
  empty('GunMount', -0.23, -0.16, -0.1, root);
  empty('HoseAnchor', -0.18, -0.3, -0.14, root);
  empty('Vent', 0.0, 0.34, -0.16, root);
  for (const [n, x, y] of [['StrapTop_L', 0.09, 0.3], ['StrapTop_R', -0.09, 0.3], ['StrapBottom_L', 0.17, -0.18], ['StrapBottom_R', -0.17, -0.18], ['Belt_L', 0.2, -0.22], ['Belt_R', -0.2, -0.22]]) empty(n, x, y, 0, root);
  empty('Handle', 0, 0.36, -0.1, root);
  const hs = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 12), std(0x161616, { roughness: 0.7 }), 'HoseSample', root); hs.visible = false;
  return { scene: root, json: { hose_radius: 0.018 }, fallback: true };
}

export function fallbackWand() {
  const root = new THREE.Group(); root.name = 'Wand';
  const black = std(0x1a1a1a, { roughness: 0.5 }), grey = std(0x55575a, { roughness: 0.4, metalness: 0.6 });
  mesh(new THREE.BoxGeometry(0.035, 0.12, 0.05), black, 'GripRear', root, 0, -0.03, 0);
  mesh(new THREE.BoxGeometry(0.075, 0.1, 0.26), grey, 'GunBox', root, 0, 0.07, 0.1);
  const b = mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.32, 16), black, 'Barrel', root, 0, 0.075, 0.38); b.rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.03, 0.1, 0.04), black, 'GripFrontMesh', root, 0, 0.0, 0.3);
  const segs = []; for (let i = 0; i < 16; i++) segs.push([new THREE.BoxGeometry(0.004, 0.01, 0.009).translate(0, 0, i * 0.011), i]);
  const bg = mesh(segGeo(segs), emitMat(0xff3a1a, 'BarEmitMat'), 'BargraphEmit', root, 0.039, 0.09, 0.02); bg.userData.segments = 16;
  const lw = mesh(segGeo([[new THREE.SphereGeometry(0.008, 8, 6), 0], [new THREE.SphereGeometry(0.008, 8, 6).translate(0, 0.0, 0.08), 1], [new THREE.SphereGeometry(0.008, 8, 6).translate(0, 0, 0.16), 2], [new THREE.SphereGeometry(0.008, 8, 6).translate(-0.06, 0, 0.16), 3]]), emitMat(0xffaa44, 'WandLightsMat'), 'WandLightsEmit', root, 0.03, 0.125, 0.0); lw.userData.segments = 4;
  mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12).rotateX(Math.PI / 2), emitMat(0xffffff, 'TipEmitMat'), 'TipEmit', root, 0, 0.075, 0.545);
  empty('GripFront', 0, 0.0, 0.3, root);
  empty('Tip', 0, 0.075, 0.56, root);
  empty('HoseAnchor', 0, -0.02, -0.02, root);
  return { scene: root, json: {}, fallback: true };
}

export function fallbackTrap() {
  const root = new THREE.Group(); root.name = 'Trap';
  const black = std(0x202022, { roughness: 0.5, metalness: 0.4 }), steel = std(0x9a9da0, { roughness: 0.3, metalness: 0.9 });
  mesh(new THREE.BoxGeometry(0.3, 0.11, 0.22), black, 'TrapBody', root, 0, 0.055, 0);
  const dl = new THREE.Group(); dl.name = 'DoorL'; dl.position.set(0.15, 0.115, 0); root.add(dl);
  mesh(new THREE.BoxGeometry(0.15, 0.012, 0.2), steel, 'DoorLPanel', dl, -0.075, 0, 0);
  const dr = new THREE.Group(); dr.name = 'DoorR'; dr.position.set(-0.15, 0.115, 0); root.add(dr);
  mesh(new THREE.BoxGeometry(0.15, 0.012, 0.2), steel, 'DoorRPanel', dr, 0.075, 0, 0);
  const te = mesh(segGeo([[new THREE.BoxGeometry(0.02, 0.02, 0.01), 0], [new THREE.BoxGeometry(0.02, 0.02, 0.01).translate(0.04, 0, 0), 1]]), emitMat(0xffcc33, 'TrapEmitMat'), 'TrapEmit', root, -0.05, 0.07, 0.112); te.userData.segments = 2;
  empty('BeamOrigin', 0, 0.12, 0, root);
  empty('CableAnchor', 0, 0.04, -0.11, root);
  for (let i = 0; i < 3; i++) empty('Smoke_' + (i + 1), -0.1 + i * 0.1, 0.12, 0, root);
  const pedal = new THREE.Group(); pedal.name = 'Pedal';
  mesh(new THREE.BoxGeometry(0.1, 0.04, 0.16), black, 'PedalBody', pedal, 0, 0.02, 0);
  empty('PedalAnchor', 0, 0.02, -0.08, pedal);
  const scene = new THREE.Group(); scene.add(root); scene.add(pedal);
  return { scene, json: { doors: { DoorL: { axis: [0, 0, 1], open_deg: 105 }, DoorR: { axis: [0, 0, 1], open_deg: -105 } } }, fallback: true };
}

export async function fallbackPlate({ THREE: T = THREE, RAPIER, world, scene }) {
  const root = new THREE.Group(); root.name = 'Plate'; scene.add(root);
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'); g.fillStyle = '#2b2c2e'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { const v = 30 + Math.random() * 30; g.fillStyle = `rgb(${v},${v},${v + 2})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(24, 24); tex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.BoxGeometry(110, 1, 110), std(0xffffff, { map: tex, roughness: 0.55 }));
  ground.position.y = -0.5; ground.receiveShadow = true; root.add(ground);
  const gb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(55, 0.5, 55).setTranslation(0, -0.5, 0).setCollisionGroups(groups(G.STATIC)), gb);
  const hemi = new THREE.HemisphereLight(0x405070, 0x101010, 0.6); root.add(hemi);
  const moon = new THREE.DirectionalLight(0xaabbdd, 0.8); moon.position.set(-20, 40, -10); moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 }); moon.shadow.bias = -0.0004; root.add(moon); root.add(moon.target);
  scene.fog = new THREE.FogExp2(0x0b0f16, 0.018);
  scene.background = new THREE.Color(0x0b0f16);
  const props = [];
  const crate = std(0x8a6a44, { roughness: 0.8 }), can = std(0x6d7276, { roughness: 0.4, metalness: 0.7 });
  const add = (kind, geo, mat, x, y, z, mass, desc, material) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; root.add(m);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.1).setAngularDamping(0.2));
    const col = world.createCollider(desc.setMass(mass).setFriction(0.7).setCollisionGroups(groups(G.PROP)), body);
    const p = { id: kind + props.length, kind, object3D: m, body, collider: col, material, mass, breakable: kind === 'crate', hp: 40, onBreak() { m.visible = false; world.removeRigidBody(body); p.dead = true; } };
    props.push(p);
  };
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, r = 9 + (i % 3) * 4; add('crate', new THREE.BoxGeometry(0.8, 0.8, 0.8), crate, Math.cos(a) * r, 0.4, 16 + Math.sin(a) * r, 25, RAPIER.ColliderDesc.cuboid(0.4, 0.4, 0.4), 'wood'); }
  for (let i = 0; i < 8; i++) { const x = -8 + i * 2.3; add('trashcan', new THREE.CylinderGeometry(0.3, 0.27, 0.85, 16), can, x, 0.43, 9 + (i % 2) * 1.5, 12, RAPIER.ColliderDesc.cylinder(0.425, 0.3), 'metal'); }
  const cart = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.9), std(0xc8c2b4, { roughness: 0.4, metalness: 0.4 })); cart.position.set(7, 0.5, 14); cart.castShadow = true; root.add(cart);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(1, 0.62, 0.25), emissiveIntensity: 8 });
  for (const [x, z] of [[-12, 4], [12, 4], [-12, 28], [12, 28]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 8), std(0x2a2c2e)); pole.position.set(x, 3, z); root.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), lampMat); lamp.position.set(x, 6, z); root.add(lamp);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.02, z); root.add(pool);
  }
  const route = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; route.push(new THREE.Vector3(Math.cos(a) * 13, 3 + Math.sin(a * 2) * 1.5, 17 + Math.sin(a) * 10)); }
  return {
    root, props, lights: { hemi, moon }, fallback: true,
    spawns: { player: { pos: new THREE.Vector3(3.2, 0, -5.5), yaw: 0.4 }, ecto: { pos: new THREE.Vector3(0, 0, -2), yaw: 0 }, ghost: { pos: new THREE.Vector3(0, 4, 22) }, ghostRoute: route, hotdogCart: { pos: new THREE.Vector3(7, 1.1, 14) } },
    bounds: { minX: -55, maxX: 55, minZ: -55, maxZ: 55 },
    surfaceAt: () => 'asphalt',
    update() { for (const p of props) { if (p.dead) continue; const t = p.body.translation(), r = p.body.rotation(); p.object3D.position.set(t.x, t.y, t.z); p.object3D.quaternion.set(r.x, r.y, r.z, r.w); } },
    dispose() {},
  };
}

export class FallbackFX {
  constructor({ scene }) {
    this.scene = scene; this.style = 'modern'; this.ready = Promise.resolve();
    this.sparks = new SparkPool(scene);
    this.slime = document.getElementById('slime');
    this.slimeAmt = 0;
  }
  setStyle(s) { this.style = s; }
  createStream() { return new StubStream(this.scene, this); }
  createGhost() { return new StubGhost(this.scene); }
  createTrapFX(trap) { return new StubTrap(trap); }
  impact(p, n, kind) { this.sparks.burst(p, n, kind === 'slam' ? 40 : kind === 'scorch' ? 4 : 12, kind === 'slime' || kind === 'ghostHit' ? 0x8dff5a : 0xffb45a); }
  slimeScreen(a) { this.slimeAmt = Math.min(1, this.slimeAmt + a); }
  update(dt) {
    this.sparks.update(dt);
    if (!this.slime) return;
    this.slimeAmt = Math.max(0, this.slimeAmt - dt * 0.35);
    const c = this.slime, w = c.width = innerWidth / 2, h = c.height = innerHeight / 2;
    if (this.slimeAmt <= 0.01) return;
    const g = c.getContext('2d');
    g.fillStyle = `rgba(110,220,60,${this.slimeAmt * 0.5})`;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(((i * 97) % 10) / 10 * w, ((i * 53) % 10) / 10 * h, 60 + i * 9, 0, 7); g.fill(); }
  }
  postPasses() { return []; }
}

class SparkPool {
  constructor(scene, n = 400) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.col = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.06, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.pts.frustumCulled = false; scene.add(this.pts);
    this.c = new THREE.Color();
  }
  burst(p, n, count, color) {
    this.c.set(color);
    for (let k = 0; k < count; k++) {
      const i = this.i = (this.i + 1) % this.n;
      this.pos.set([p.x, p.y, p.z], i * 3);
      const s = 2 + Math.random() * 5;
      this.vel[i * 3] = (n.x + (Math.random() - 0.5) * 1.6) * s; this.vel[i * 3 + 1] = (n.y + Math.random() * 0.8) * s; this.vel[i * 3 + 2] = (n.z + (Math.random() - 0.5) * 1.6) * s;
      this.life[i] = 0.4 + Math.random() * 0.5;
      this.col.set([this.c.r * 6, this.c.g * 6, this.c.b * 6], i * 3);
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.life[i] -= dt; this.vel[i * 3 + 1] -= 9.8 * dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.35; }
      const f = Math.max(0, this.life[i]); for (let k = 0; k < 3; k++) this.col[i * 3 + k] *= 0.97 + 0.02 * f;
    }
    this.pts.geometry.attributes.position.needsUpdate = true; this.pts.geometry.attributes.color.needsUpdate = true;
  }
}

class StubStream {
  constructor(scene, fx) {
    this.fx = fx; this.N = 40;
    this.pos = new Float32Array(this.N * 2 * 3);
    const idx = []; for (let i = 0; i < this.N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setIndex(idx);
    this.core = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.2, 1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide }));
    this.core.frustumCulled = false; scene.add(this.core);
    this.light = new THREE.PointLight(0xff8a40, 0, 14, 1.6); scene.add(this.light);
    this.tipLight = new THREE.PointLight(0xffa060, 0, 6, 1.6); scene.add(this.tipLight);
    this.t = 0; this.cam = new THREE.Vector3(); this.P = new THREE.Vector3(); this.T = new THREE.Vector3(); this.S = new THREE.Vector3(); this.C = new THREE.Vector3();
  }
  update(dt, s) {
    this.t += dt;
    this.core.visible = !!s.on;
    this.light.intensity = s.on ? 18 + Math.random() * 8 : 0;
    this.tipLight.intensity = s.on ? 6 : 0;
    if (!s.on) return;
    const cam = this.fx.camera;
    const o = s.origin, e = s.end, d = s.dir;
    const L = o.distanceTo(e);
    this.C.copy(o).addScaledVector(d, L * 0.45);
    for (let i = 0; i < this.N; i++) {
      const u = i / (this.N - 1);
      const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      this.P.set(o.x * a + this.C.x * b + e.x * c, o.y * a + this.C.y * b + e.y * c, o.z * a + this.C.z * b + e.z * c);
      const wob = Math.sin(u * 18 - this.t * 40) * 0.05 * (s.mode === 'capture' ? 3 : 1) * Math.sin(u * Math.PI);
      this.T.set(0, wob, 0); this.P.add(this.T);
      if (cam) { cam.getWorldPosition(this.cam); this.S.copy(this.P).sub(this.cam).cross(d).normalize().multiplyScalar(0.05 + 0.03 * Math.random()); } else this.S.set(0.05, 0, 0);
      this.pos.set([this.P.x + this.S.x, this.P.y + this.S.y, this.P.z + this.S.z, this.P.x - this.S.x, this.P.y - this.S.y, this.P.z - this.S.z], i * 6);
    }
    this.core.geometry.attributes.position.needsUpdate = true;
    this.light.position.copy(e).addScaledVector(s.endNormal || d, 0.4);
    this.tipLight.position.copy(o);
    this.core.material.color.setRGB(s.mode === 'capture' ? 2.5 : 6, s.mode === 'capture' ? 3.5 : 3.2, s.mode === 'capture' ? 7 : 1.6);
  }
}

class StubGhost {
  constructor(scene) {
    this.object3D = new THREE.Group(); this.radius = 0.6;
    this.body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 3), new THREE.MeshStandardMaterial({ color: 0x6fd94a, emissive: new THREE.Color(0.35, 1, 0.2), emissiveIntensity: 1.2, transparent: true, opacity: 0.82, roughness: 0.3 }));
    this.object3D.add(this.body);
    const eye = new THREE.MeshBasicMaterial({ color: 0xffffee });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), eye); e.position.set(s * 0.17, 0.15, 0.47); this.object3D.add(e); }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: 0x1a3a10 })); mouth.scale.set(1.4, 0.6, 0.6); mouth.position.set(0, -0.12, 0.46); this.object3D.add(mouth); this.mouth = mouth;
    this.light = new THREE.PointLight(0x7dff4a, 6, 7, 1.8); this.object3D.add(this.light);
    scene.add(this.object3D);
    this.t = 0;
  }
  update(dt, s) {
    this.t += dt;
    const sp = s.vel ? s.vel.length() : 0;
    const st = 1 + Math.min(0.35, sp * 0.04) + (s.struggle ? Math.min(0.3, s.struggle.length() * 0.05) : 0);
    this.body.scale.set(1 / Math.sqrt(st) + Math.sin(this.t * 7) * 0.03, st * (1 - (s.suck || 0) * 0.5), 1 / Math.sqrt(st));
    this.object3D.scale.setScalar(1 - (s.suck || 0) * 0.95);
    this.body.material.emissiveIntensity = 1.2 + (s.hurt || 0) * 4;
    this.mouth.scale.y = 0.6 + (s.mouth || 0) * 1.2;
    this.light.intensity = 6 + (s.hurt || 0) * 10;
  }
}

class StubTrap {
  constructor(trap) {
    this.trap = trap;
    this.cone = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.12, 3.2, 32, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.2), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.cone.position.y = 1.7; trap.add(this.cone);
    this.light = new THREE.PointLight(0xfff0c0, 0, 8, 1.5); this.light.position.y = 0.5; trap.add(this.light);
  }
  update(dt, s) {
    const k = s.beam || 0;
    this.cone.material.opacity = k * (0.25 + Math.random() * 0.06);
    this.cone.visible = k > 0.01;
    this.light.intensity = k * 30;
  }
}
