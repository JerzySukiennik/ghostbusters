// FX lab test set: dark street corner block (floor, wall, pillar, crates), wand and trap stand-ins (or the real pack assets), night lighting.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function asphalt() {
  const r = rand(11);
  const col = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#2a2a2b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) { const v = 30 + r() * 40; g.fillStyle = `rgb(${v},${v},${v + 2})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    g.strokeStyle = 'rgba(15,15,15,0.7)'; g.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(10,10,12,0.35)'; g.beginPath(); g.ellipse(r() * w, r() * h, 20 + r() * 60, 10 + r() * 40, r() * 3, 0, 7); g.fill(); }
  });
  const rough = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) { const grd = g.createRadialGradient(0, 0, 0, 0, 0, 1); grd.addColorStop(0, '#303030'); grd.addColorStop(1, 'rgba(208,208,208,0)'); g.save(); g.translate(r() * w, r() * h); g.scale(30 + r() * 50, 15 + r() * 30); g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore(); }
  }, false);
  col.repeat.set(8, 8); rough.repeat.set(3, 3);
  return new THREE.MeshStandardMaterial({ map: col, roughnessMap: rough, roughness: 1.0, metalness: 0.0, envMapIntensity: 0.6 });
}

function bricks() {
  const r = rand(29);
  const col = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#1b1715'; g.fillRect(0, 0, w, h);
    const bh = 32, bw = 96;
    for (let y = 0; y < h; y += bh) for (let x = -bw; x < w; x += bw) {
      const ox = (y / bh) % 2 ? bw / 2 : 0;
      const v = 0.75 + r() * 0.35;
      g.fillStyle = `rgb(${Math.floor(78 * v)},${Math.floor(46 * v)},${Math.floor(38 * v)})`;
      g.fillRect(x + ox + 2, y + 2, bw - 4, bh - 4);
      for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(0,0,0,${r() * 0.25})`; g.fillRect(x + ox + 2 + r() * (bw - 6), y + 2 + r() * (bh - 6), 2, 2); }
    }
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.35)'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  col.repeat.set(5, 2.4);
  return new THREE.MeshStandardMaterial({ map: col, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.4 });
}

function concrete(tint = '#3b3b3d') {
  const r = rand(53);
  const col = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = tint; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 40 + r() * 35; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(0,0,0,${0.1 + r() * 0.15})`; g.fillRect(0, r() * h, w, 2 + r() * 6); }
  });
  return new THREE.MeshStandardMaterial({ map: col, roughness: 0.85, metalness: 0.0, envMapIntensity: 0.4 });
}

function crate() {
  const col = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a3a26'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2a2016'; g.lineWidth = 10; g.strokeRect(6, 6, w - 12, h - 12);
    g.lineWidth = 8; g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.stroke();
    for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y, w, 2); }
  });
  return new THREE.MeshStandardMaterial({ map: col, roughness: 0.8, envMapIntensity: 0.3 });
}

function nightEnv(renderer) {
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ vec3 d = normalize(vP); float h = d.y; vec3 sky = mix(vec3(0.05,0.045,0.04), vec3(0.012,0.016,0.03), smoothstep(-0.05,0.5,h)); sky += vec3(0.16,0.085,0.03) * exp(-abs(h)*9.0); sky = mix(sky, vec3(0.02,0.018,0.016), step(h, -0.02)); gl_FragColor = vec4(sky, 1.0); }',
  });
  s.add(new THREE.Mesh(geo, mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02);
  pm.dispose();
  return rt.texture;
}

function standinWand() {
  const g = new THREE.Group(); g.name = 'Wand';
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.55, metalness: 0.4 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x5a5a5e, roughness: 0.4, metalness: 0.8 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.085, 0.3), dark); body.position.set(0, 0.03, 0.06); g.add(body);
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.13, 20), black); shroud.rotation.x = Math.PI / 2; shroud.position.set(0, 0.035, 0.27); g.add(shroud);
  for (let i = 0; i < 5; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.004, 6, 20), grey); rib.position.set(0, 0.035, 0.215 + i * 0.026); g.add(rib); }
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.12, 14), grey); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.035, 0.39); g.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.035), black); grip.position.set(0, -0.04, -0.02); grip.rotation.x = 0.25; g.add(grip);
  const fgrip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.1, 12), black); fgrip.position.set(0, 0.11, 0.14); g.add(fgrip);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.09), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: new THREE.Color(4, 0.3, 0.1) })); bar.position.set(-0.031, 0.05, 0.02); g.add(bar);
  const tipL = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(6, 5, 4) })); tipL.position.set(0.02, 0.06, 0.33); g.add(tipL);
  const tip = new THREE.Object3D(); tip.name = 'Tip'; tip.position.set(0, 0.035, 0.455); g.add(tip);
  return g;
}

function standinTrap() {
  const g = new THREE.Group(); g.name = 'Trap';
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.5, metalness: 0.7 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.6, metalness: 0.3 });
  const stripe = canvasTex(128, 32, (c, w, h) => { c.fillStyle = '#1a1a1a'; c.fillRect(0, 0, w, h); c.fillStyle = '#d8b21a'; for (let x = -h; x < w; x += 22) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 11, h); c.lineTo(x + 11 + h, 0); c.lineTo(x + h, 0); c.fill(); } });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.26), metal); body.position.y = 0.06; body.name = 'TrapBody'; g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.28), black); top.position.y = 0.13; g.add(top);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.005, 0.07), new THREE.MeshStandardMaterial({ color: 0x050505, emissive: new THREE.Color(0, 0, 0) })); slot.position.y = 0.142; slot.name = 'TrapEmitSlot'; g.add(slot);
  for (const s of [1, -1]) {
    const hinge = new THREE.Group(); hinge.name = s > 0 ? 'DoorL' : 'DoorR'; hinge.position.set(0, 0.142, s * 0.045); g.add(hinge);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.012, 0.09), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6, metalness: 0.3 })); door.position.set(0, 0.006, -s * 0.045); hinge.add(door);
  }
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 8), metal); handle.rotation.z = Math.PI / 2; handle.position.set(-0.18, 0.2, 0.0); g.add(handle);
  const beam = new THREE.Object3D(); beam.name = 'BeamOrigin'; beam.position.set(0, 0.15, 0); g.add(beam);
  for (let i = 0; i < 3; i++) { const sm = new THREE.Object3D(); sm.name = 'Smoke_' + (i + 1); sm.position.set(-0.15 + i * 0.15, 0.15, (i % 2 ? 0.05 : -0.05)); g.add(sm); }
  const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.16), black); pedal.name = 'Pedal'; pedal.position.set(0.9, 0.02, 0.5); g.add(pedal);
  const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push(new THREE.Vector3(0.22 + t * 0.68, 0.012 + Math.sin(t * 3.1) * 0.01, t * 0.5 + Math.sin(t * 6) * 0.05)); }
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.006, 6), black); cable.name = 'Cable'; g.add(cable);
  return g;
}

async function tryGLB(url) {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) return null;
    const gltf = await new GLTFLoader().loadAsync(url);
    return gltf.scene;
  } catch (e) { return null; }
}

export async function buildSet(renderer, { useAssets = true } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030405);
  scene.fog = new THREE.FogExp2(0x040507, 0.028);
  scene.environment = nightEnv(renderer);
  scene.environmentIntensity = 0.7;
  const hemi = new THREE.HemisphereLight(0x2a3a5a, 0x0e0b08, 0.45);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x9fb2e0, 0.5);
  moon.position.set(-6, 12, 6);
  scene.add(moon);
  const sodium = new THREE.PointLight(0xff9a40, 9, 24, 2);
  sodium.position.set(-6.5, 5.2, -3.5);
  scene.add(sodium);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), asphalt());
  floor.rotation.x = -Math.PI / 2; floor.name = 'Floor';
  scene.add(floor);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(18, 7, 0.5), bricks());
  wall.position.set(0, 3.5, -9.25); wall.name = 'Wall';
  scene.add(wall);
  const sidewall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 12), bricks());
  sidewall.position.set(-8.5, 3.5, -3.5); sidewall.name = 'SideWall';
  scene.add(sidewall);
  const curb = new THREE.Mesh(new THREE.BoxGeometry(18, 0.15, 1.6), concrete('#4a4a4c'));
  curb.position.set(0, 0.075, -8.2); curb.name = 'Curb';
  scene.add(curb);
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 6.5, 0.9), concrete());
  pillar.position.set(3.4, 3.25, -5.4); pillar.name = 'Pillar';
  scene.add(pillar);
  const cm = crate();
  const crates = [[-3.2, 0.5, -6.2, 1.0, 0.3], [-2.3, 0.4, -4.6, 0.8, -0.4], [-3.0, 1.38, -6.1, 0.75, 0.6], [5.2, 0.45, -3.2, 0.9, 0.2]];
  const props = [floor, wall, sidewall, curb, pillar];
  for (const [x, y, z, s, ry] of crates) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), cm);
    b.position.set(x, y, z); b.rotation.y = ry; b.name = 'Crate';
    scene.add(b); props.push(b);
  }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5.6, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.6 }));
  lamp.position.set(-6.5, 2.8, -3.5); scene.add(lamp);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3, 1) }));
  bulb.position.set(-6.5, 5.5, -3.5); scene.add(bulb);

  let wand = useAssets ? await tryGLB('assets/pack/wand.glb') : null;
  const realWand = !!wand;
  if (!wand) wand = standinWand();
  scene.add(wand);
  let trap = useAssets ? await tryGLB('assets/pack/trap.glb') : null;
  const realTrap = !!trap;
  if (!trap) trap = standinTrap();
  scene.add(trap);
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { scene, props, wand, trap, realWand, realTrap, lights: { hemi, moon, sodium } };
}
