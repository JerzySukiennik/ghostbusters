// Boot: renderer, physics, assets with stand-ins, plate, systems, title screen and the main loop.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Renderer } from './engine/renderer.js';
import { Physics } from './engine/physics.js';
import { Input } from './engine/input.js';
import { AudioSys } from './engine/audio.js';
import { Assets } from './engine/assets.js';
import { Avatar } from './game/avatar.js';
import { Player } from './game/player.js';
import { CameraRig } from './game/camera.js';
import { Ecto } from './game/ecto.js';
import { Gear } from './game/gear.js';
import { Ghost } from './game/ghost.js';
import { Trap } from './game/trap.js';
import { Proton } from './game/proton.js';
import { Game } from './game/game.js';
import { HUD } from './ui/hud.js';
import * as FB from './game/fallbacks.js';

const params = new URLSearchParams(location.search);
const force = (params.get('fallback') || '').split(',');
const store = { get: (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
let style = params.get('style') || store.get('gb.style', 'modern');
let quality = params.get('q') || store.get('gb.q', 'medium');
const errEl = document.getElementById('err');
const report = (e) => { console.error(e); errEl.textContent = String(e?.stack || e?.message || e).slice(0, 600); };
addEventListener('error', (e) => report(e.error || e.message));
addEventListener('unhandledrejection', (e) => report(e.reason));

const loadBar = document.querySelector('#load i'), loadTxt = document.getElementById('loadtxt'), go = document.getElementById('go');
const progress = (k, label) => { loadBar.style.width = Math.round(k * 100) + '%'; if (label) loadTxt.textContent = label; };

async function glbOr(assets, url, label, fb, jsonUrl) {
  const g = force.includes(label) ? null : await assets.glb(url, label);
  if (!g) return fb();
  g.json = jsonUrl ? (await assets.json(jsonUrl)) || {} : {};
  return g;
}

async function loadFX(ctx) {
  if (!force.includes('fx')) {
    try { const m = await import('./fx/index.js'); const fx = new m.FX(ctx); await fx.ready; return fx; }
    catch (e) { console.warn('[fx] using stand-in:', e?.message || e); }
  }
  const fx = new FB.FallbackFX(ctx); fx.camera = ctx.camera; return fx;
}

async function loadPlate(ctx) {
  if (!force.includes('plate')) {
    try { const m = await import('./world/plate.js'); const p = await m.createPlate(ctx); if (p) return p; }
    catch (e) { console.warn('[plate] using stand-in:', e?.message || e); }
  }
  return FB.fallbackPlate(ctx);
}

async function boot() {
  const view = document.getElementById('view');
  const R = new Renderer(view);
  R.setPreset(quality);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 900);
  camera.position.set(8, 3, -10);
  R.build(scene, camera);
  const assets = new Assets(progress);
  progress(0.02, 'Physics');
  const phys = await Physics.create();
  const audio = new AudioSys();
  const input = new Input(R.canvas);
  const hud = new HUD();
  const ctxBase = { THREE, RAPIER: phys.RAPIER, world: phys.world, scene, renderer: R.renderer, camera, quality, style };
  progress(0.05, 'Plate');
  const plateP = loadPlate(ctxBase);
  const fxP = loadFX(ctxBase);
  const [plate, fx, ectoG, packG, wandG, trapG, avatar] = await Promise.all([
    plateP, fxP,
    glbOr(assets, 'assets/ecto1/ecto1.glb', 'ecto1', FB.fallbackEcto, 'assets/ecto1/ecto1.json'),
    glbOr(assets, 'assets/pack/protonpack.glb', 'pack', FB.fallbackPack, 'assets/pack/pack.json'),
    glbOr(assets, 'assets/pack/wand.glb', 'wand', FB.fallbackWand, 'assets/pack/pack.json'),
    glbOr(assets, 'assets/pack/trap.glb', 'trap', FB.fallbackTrap, 'assets/pack/pack.json'),
    Avatar.load(assets, store.get('gb.nick', 'JUREK')),
    audio.load(),
  ]);
  if (!scene.environment) {
    const pm = new THREE.PMREMGenerator(R.renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.22;
  }
  if (packG.json?.trap) trapG.json = { ...trapG.json, ...packG.json.trap };
  for (const p of plate.props || []) for (const c of p.colliders || (p.collider ? [p.collider] : [])) phys.own(c, p);
  if (!(fx instanceof FB.FallbackFX)) {
    fx.ownsStreamImpacts = true;
    fx.groundY = 0;
    let moon = plate.lights?.moon || null;
    if (!moon) scene.traverse((o) => { if (!moon && o.isDirectionalLight) moon = o; });
    if (moon && fx.setLighting) {
      const dir = moon.position.clone().sub(moon.target?.position || new THREE.Vector3()).normalize();
      fx.setLighting({ keyDir: dir, keyColor: moon.color.clone().multiplyScalar(Math.min(0.35, 0.12 * (moon.intensity || 1))) });
    }
  }
  const sp = plate.spawns;
  const ecto = new Ecto({ gltf: ectoG, phys, audio, scene, spawn: sp.ecto });
  const gear = new Gear({ packGltf: packG, wandGltf: wandG, scene, audio });
  const player = new Player(phys, avatar, sp.player.pos, sp.player.yaw || 0);
  player.spawn = sp.player.pos.clone();
  const rig = new CameraRig(camera, phys);
  const ghost = new Ghost({ fx, audio, plate, phys });
  const trap = new Trap({ gltf: trapG, scene, phys, audio, fx, renderer: R, hud });
  const proton = new Proton({ fx, gear, phys, ghost, plate, audio, renderer: R, rig, hud });
  const game = new Game({ renderer: R, scene, camera, phys, input, audio, hud, fx, plate, ecto, gear, avatar, player, rig, ghost, trap, proton, style, assets });
  game.setup();
  const applyPasses = () => R.setExtraPasses(typeof fx.postPasses === 'function' ? fx.postPasses() : []);
  game.onStyle = () => applyPasses();
  game.setStyle(style);
  ecto.sync(true); ecto.interp(1);
  progress(1, 'Warming shaders');
  try {
    const prevRT = R.renderer.getRenderTarget();
    R.renderer.setRenderTarget(R.composer.renderTarget1);
    const warm = R.renderer.compileAsync(scene, camera);
    R.renderer.setRenderTarget(prevRT);
    await warm;
  } catch (e) { console.warn('[warm]', e?.message || e); }
  game.info = { ecto: !ectoG.fallback, pack: !packG.fallback, wand: !wandG.fallback, trap: !trapG.fallback, avatar: avatar.real, fx: !(fx instanceof FB.FallbackFX), plate: !plate.fallback, audio: Object.keys(audio.manifest).length };
  loadTxt.textContent = '';
  go.disabled = false; go.textContent = 'Play';

  let running = false, t = 0, last = performance.now();
  const title = (tt, pos, look) => {
    const c = ecto.root.position, a = tt * 0.06 + 2.2;
    pos.set(c.x + Math.sin(a) * 9.5, 2.1 + Math.sin(tt * 0.2) * 0.3, c.z + Math.cos(a) * 9.5);
    look.copy(c).add(new THREE.Vector3(0, 1.0, 0));
    return 42;
  };
  title.ease = 0.01;
  rig.startCine(title);

  const start = () => {
    if (running) return;
    running = true; startedAt = performance.now();
    audio.unlock(); applySettings();
    input.enabled = true;
    input.lock();
    document.getElementById('start').classList.add('hide');
    document.body.classList.add('playing');
    rig.endCine('foot'); rig.yaw = player.yaw + 0.2; rig.pitch = -0.12;
  };
  go.onclick = start;
  window.__start = start;
  document.getElementById('again').onclick = () => location.reload();
  document.getElementById('free').onclick = () => game.freeRoam();
  const segs = [];
  for (const [ids, cur, set] of [[['lookSeg', 'pLook'], style, (v) => { game.setStyle(v); store.set('gb.style', v); }], [['qSeg', 'pQ'], quality, (v) => { R.setPreset(v); store.set('gb.q', v); }]]) {
    const all = ids.map((id) => document.getElementById(id));
    const mark = (v) => all.forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v)));
    mark(cur);
    segs.push(mark);
    all.forEach((seg) => seg.querySelectorAll('button').forEach((b) => (b.onclick = () => { mark(b.dataset.v); set(b.dataset.v); })));
  }
  const prevStyle = game.onStyle;
  game.onStyle = (s) => { prevStyle(s); segs[0](s); };
  const sens = document.getElementById('sens'), vol = document.getElementById('vol');
  sens.value = store.get('gb.sens', '1'); vol.value = store.get('gb.vol', '0.9');
  const applySettings = () => { rig.sensMul = +sens.value; if (audio.master) audio.master.gain.value = +vol.value; store.set('gb.sens', sens.value); store.set('gb.vol', vol.value); };
  sens.oninput = vol.oninput = applySettings; applySettings();
  const pauseEl = document.getElementById('pause');
  let paused = false, startedAt = 0;
  document.getElementById('resume').onclick = () => { input.lock(); };
  document.getElementById('restart').onclick = () => location.reload();
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === R.canvas;
    if (!running || game.done) return;
    if (!locked && performance.now() - startedAt > 400) { paused = true; pauseEl.classList.add('on'); }
    if (locked) { paused = false; pauseEl.classList.remove('on'); applySettings(); }
  });
  addEventListener('keydown', (e) => { if (!running && (e.code === 'Enter' || e.code === 'Space') && !go.disabled) start(); });

  window.__ready = true;
  window.__R = R;
  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; t += dt;
    if (running && paused) {
      input.dx = input.dy = 0;
    } else if (running) {
      const gdt = dt * R.timeScale(dt);
      phys.update(gdt, (h) => game.fixed(h), () => ecto.sync());
      game.update(gdt, phys.acc / phys.step);
    } else {
      phys.update(dt, (h) => ecto.fixed(h, null), () => ecto.sync());
      ecto.interp(1); ecto.update(dt, t);
      rig.update(dt, {});
      ghost.update(dt, { playerHead: player.feet.clone().setY(1.6), engaged: false });
      avatar.update({ speed: 0, grounded: true, vy: 0 }, dt, {});
      gear.update(dt, { firing: false, mode: 'blast', style: game.style });
      plate.update(dt);
      fx.update(dt, t);
    }
    audio.update(camera);
    input.endFrame(dt);
    R.render(t, dt);
  };
  requestAnimationFrame(frame);
}

boot().catch(report);
