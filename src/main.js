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
import { Radio } from './game/radio.js';
import { GPS } from './game/gps.js';
import { RouteLine } from './game/routeline.js';
import { Room } from './net/room.js';
import { Net } from './net/sync.js';
import * as FB from './game/fallbacks.js';
import * as L from './world/layout.js';

const params = new URLSearchParams(location.search);
const force = (params.get('fallback') || '').split(',');
const store = { get: (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const style = 'film';
let quality = params.get('q') || store.get('gb.q', 'medium');
const errEl = document.getElementById('err');
const report = (e) => { console.error(e); errEl.textContent = String(e?.stack || e?.message || e).slice(0, 600); };
addEventListener('error', (e) => report(e.error || e.message));
addEventListener('unhandledrejection', (e) => report(e.reason));

const leader = document.getElementById('leader'), lNum = leader.querySelector('.num'), lBar = leader.querySelector('.bar i'), lLab = leader.querySelector('.txt em');
const loadTxt = document.getElementById('loadtxt'), go = document.getElementById('go');
const progress = (k, label) => {
  lBar.style.width = Math.round(k * 100) + '%';
  const n = String(Math.max(1, 8 - Math.floor(k * 8)));
  if (lNum.textContent !== n) lNum.textContent = n;
  if (label) lLab.textContent = label;
};
const plateMap = () => {
  const h = L.PLATE.half;
  return { bounds: [-h, -h, h, h], roads: [{ pts: [[0, -h], [0, h]], w: L.AVE.x1 - L.AVE.x0 }, { pts: [[-h, 0], [h, 0]], w: L.ST.z1 - L.ST.z0 }], blocks: L.BUILDINGS.map((b) => b.box) };
};

const plateRoads = () => {
  const h = L.PLATE.half - 1;
  return {
    nodes: [{ id: 'c', p: [0, 0] }, { id: 'n', p: [0, -h] }, { id: 's', p: [0, h] }, { id: 'w', p: [-h, 0] }, { id: 'e', p: [h, 0] }],
    lanes: [{ from: 'n', to: 'c', name: 'Varick St' }, { from: 'c', to: 's', name: 'Varick St' }, { from: 'w', to: 'c', name: 'N Moore St' }, { from: 'c', to: 'e', name: 'N Moore St' }],
  };
};

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
  if (!force.includes('plate') && !force.includes('city') && params.get('plate') !== 'v1') {
    try { const m = await import('./city/index.js'); const c = await m.createCity({ ...ctx, onProgress: (k, t) => progress(0.05 + k * 0.5, t) }); if (c) return c; }
    catch (e) { console.warn('[city] falling back to the V1 plate:', e?.message || e); }
  }
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
  const radio = new Radio(audio, hud);
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
    radio.load(),
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
  const tpl = { pack: packG.scene.clone(true), wand: wandG.scene.clone(true), packJson: packG.json, trap: trapG.scene.clone(true) };
  const sp = plate.spawns;
  const ecto = new Ecto({ gltf: ectoG, phys, audio, scene, spawn: sp.ecto });
  const gear = new Gear({ packGltf: packG, wandGltf: wandG, scene, audio });
  const player = new Player(phys, avatar, sp.player.pos, sp.player.yaw || 0);
  player.spawn = sp.player.pos.clone();
  const rig = new CameraRig(camera, phys);
  const ghosts = [new Ghost({ fx, audio, plate, phys, id: 0 }), new Ghost({ fx, audio, plate, phys, id: 1 })];
  const trap = new Trap({ gltf: trapG, scene, phys, audio, fx, renderer: R, hud });
  gear.trapRoot = trap.root;
  const proton = new Proton({ fx, gear, phys, ghosts, plate, audio, renderer: R, rig, hud });
  const remoteStreams = [fx.createStream(), fx.createStream(), fx.createStream()];
  const remoteTraps = [0, 1, 2].map(() => new Trap({ gltf: { scene: tpl.trap.clone(true), json: trapG.json }, scene, phys, audio, fx, renderer: R, hud, remote: true }));
  const gps = new GPS(plate.roads || plateRoads(), { side: plate.roads ? 0 : 4, lanes: !!plate.roads });
  const routeLine = new RouteLine(scene, plate.heightAt ? (x, z) => plate.heightAt(x, z) : null);
  const game = new Game({ renderer: R, scene, camera, phys, input, audio, hud, fx, plate, ecto, gear, avatar, player, rig, ghosts, trap, proton, style, assets, radio, gps, routeLine });
  game.setup();
  hud.setMap(plate.minimap || plateMap());
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
  for (const id of ['go', 'quick', 'host', 'join']) document.getElementById(id).disabled = false;

  let running = false, t = 0, last = performance.now();
  const title = (tt, pos, look) => {
    const c = ecto.root.position, a = tt * 0.06 + 2.2;
    pos.set(c.x + Math.sin(a) * 9.5, 2.1 + Math.sin(tt * 0.2) * 0.3, c.z + Math.cos(a) * 9.5);
    look.copy(c).add(new THREE.Vector3(0, 1.0, 0));
    return 42;
  };
  title.ease = 0.01;
  rig.startCine(title);

  const nickEl = document.getElementById('nick'), codeEl = document.getElementById('code'), charsEl = document.getElementById('chars');
  nickEl.value = store.get('gb.nick', '');
  if (params.get('room')) codeEl.value = params.get('room').toUpperCase().slice(0, 4);
  let char = store.get('gb.char', 'jurek');
  const nick = () => (nickEl.value.trim() || 'Buster').slice(0, 12);
  Avatar.available(assets).then(async (list) => {
    if (list.length < 2) { charsEl.parentElement.querySelector('.lbl').style.display = charsEl.style.display = 'none'; return; }
    if (!list.includes(char)) char = list[0];
    const info = (await assets.json('assets/avatar/crew.json'))?.characters || {};
    for (const c of list) {
      const name = c === 'jurek' ? 'Jurek' : info[c]?.shortName || c.replace('crew_', 'Crew ');
      const b = document.createElement('button'); b.dataset.c = c; b.title = info[c]?.displayName || name;
      const img = new Image(); img.alt = name; img.src = `assets/avatar/portrait_${c}.jpg`; img.onerror = () => img.remove();
      const tag = document.createElement('span'); tag.textContent = name;
      b.append(img, tag); charsEl.append(b);
      b.onclick = () => { char = c; store.set('gb.char', c); charsEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.c === c)); };
    }
    charsEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.c === char));
  });
  const swapAvatar = async () => {
    store.set('gb.nick', nickEl.value.trim());
    if (char === game.avatar.char) { game.avatar.setNick(nick()); return; }
    const nav = await Avatar.load(assets, nick(), char);
    if (nav.char === game.avatar.char) { game.avatar.setNick(nick()); return; }
    game.avatar.object.removeFromParent();
    scene.add(nav.object);
    player.avatar = nav; game.avatar = nav;
    nav.object.position.copy(player.feet); nav.object.rotation.set(0, player.yaw, 0);
  };
  let room = null, net = null, connecting = false;
  const online = async (mode) => {
    if (running || connecting) return;
    connecting = true;
    const btns = ['go', 'quick', 'host', 'join'].map((id) => document.getElementById(id));
    btns.forEach((b) => (b.disabled = true));
    loadTxt.textContent = 'Connecting';
    try {
      await swapAvatar();
      room = room || await Room.connect(params.get('realm') || '');
      const profile = { nick: nick(), char: game.avatar.char === 'base' ? 'jurek' : game.avatar.char };
      const r = mode === 'quick' ? await room.quickPlay(profile) : mode === 'host' ? await room.create(profile, false) : await room.join(codeEl.value, profile);
      net = new Net({ game, room, assets, tpl, streams: remoteStreams, traps: remoteTraps });
      if (room.order.length) net.onPlayers(room.players, room.order);
      window.__net = net;
      history.replaceState(null, '', `?room=${r.code}${params.get('realm') ? '&realm=' + params.get('realm') : ''}`);
      loadTxt.textContent = '';
      start();
      hud.toast(r.fresh ? `Room ${r.code}. Share the code` : `Joined room ${r.code}`, 2.4);
    } catch (e) {
      loadTxt.textContent = String(e?.message || e);
      btns.forEach((b) => (b.disabled = false));
    }
    connecting = false;
  };
  document.getElementById('quick').onclick = () => online('quick');
  document.getElementById('host').onclick = () => online('host');
  document.getElementById('join').onclick = () => { if (!codeEl.value.trim()) { codeEl.focus(); return; } online('join'); };
  codeEl.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Enter') online('join'); });
  nickEl.addEventListener('keydown', (e) => e.stopPropagation());
  window.__online = online;
  addEventListener('beforeunload', () => { net?.leave(); });

  const start = () => {
    if (running) return;
    running = true; startedAt = performance.now();
    audio.unlock(); applySettings();
    input.enabled = true;
    input.lock();
    document.getElementById('start').classList.add('hide');
    document.body.classList.add('playing');
    pauseSet.append(setEl); setPanel.classList.remove('on');
    rig.endCine('foot'); rig.yaw = player.yaw + 0.2; rig.pitch = -0.12;
    game.setGoal(ghosts[0].cart, 'Hot dog stand');
    setTimeout(() => game.dispatchCall('job_hotdog_corner', { when: '9:42 PM', title: 'Hot dog stand', text: 'N Moore St & Varick St. Something green is eating everything on the cart. Then the cart.', pay: '$5,000 · Class 5' }), 1400);
  };
  go.onclick = async () => { await swapAvatar(); start(); };
  window.__start = start;
  document.getElementById('again').onclick = () => { const u = new URL(location.href); u.searchParams.delete('room'); location.href = u.toString(); };
  document.getElementById('free').onclick = () => game.freeRoam();
  const segs = [];
  for (const [ids, cur, set] of [[['qSeg'], quality, (v) => { R.setPreset(v); store.set('gb.q', v); }]]) {
    const all = ids.map((id) => document.getElementById(id));
    const mark = (v) => all.forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v)));
    mark(cur);
    segs.push(mark);
    all.forEach((seg) => seg.querySelectorAll('button').forEach((b) => (b.onclick = () => { mark(b.dataset.v); set(b.dataset.v); })));
  }
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
  const setEl = document.getElementById('settings'), setPanel = document.getElementById('setPanel'), pauseSet = document.getElementById('pauseSet');
  document.getElementById('setBtn').onclick = () => { if (!setPanel.contains(setEl)) setPanel.append(setEl); setPanel.classList.toggle('on'); };
  const menuBtns = ['go', 'quick', 'host', 'join', 'setBtn'].map((id) => document.getElementById(id));
  let sel = 0;
  const pick = (i) => { sel = i; menuBtns.forEach((b, j) => b.classList.toggle('on', j === i)); };
  menuBtns.forEach((b, i) => b.addEventListener('pointerenter', () => pick(i)));
  addEventListener('keydown', (e) => {
    if (running || document.activeElement?.tagName === 'INPUT') return;
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      let i = sel;
      do i = (i + (e.code === 'ArrowDown' ? 1 : -1) + menuBtns.length) % menuBtns.length; while (menuBtns[i].disabled && i !== sel);
      pick(i); e.preventDefault();
    } else if (e.code === 'Enter' || e.code === 'Space') { if (!menuBtns[sel].disabled) menuBtns[sel].click(); e.preventDefault(); }
  });

  window.__ready = true;
  window.__R = R;
  setTimeout(() => leader.classList.add('hide'), 350);
  if (params.has('demo')) {
    running = true; startedAt = performance.now();
    document.getElementById('start').classList.add('hide');
    rig.endCine('foot');
    game.demo();
  }
  window.__bench = (n = 90) => {
    const gl = R.renderer.getContext(), out = [];
    window.__hold = true;
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      phys.update(1 / 60, (h) => game.fixed(h), () => ecto.sync());
      game.update(1 / 60, 1);
      audio.update(camera);
      R.render(t + i / 60, 1 / 60);
      gl.finish();
      out.push(performance.now() - t0);
    }
    window.__hold = false;
    out.sort((a, b) => a - b);
    const avg = out.reduce((a, b) => a + b, 0) / n;
    return { avg: +avg.toFixed(2), p50: +out[n >> 1].toFixed(2), p95: +out[Math.floor(n * 0.95)].toFixed(2), calls: R.renderer.info.render.calls, tris: R.renderer.info.render.triangles };
  };
  const frame = (now) => {
    requestAnimationFrame(frame);
    if (window.__hold) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; t += dt;
    if (running && paused && !net) {
      input.dx = input.dy = 0;
    } else if (running) {
      const gdt = dt * R.timeScale(dt);
      phys.update(gdt, (h) => game.fixed(h), () => ecto.sync());
      game.update(gdt, phys.acc / phys.step);
    } else {
      phys.update(dt, (h) => ecto.fixed(h, null), () => ecto.sync());
      ecto.interp(1); ecto.update(dt, t);
      rig.update(dt, {});
      for (const g of ghosts) g.update(dt, { playerHead: player.feet.clone().setY(1.6), engaged: false });
      game.avatar.update({ speed: 0, grounded: true, vy: 0 }, dt, {});
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
