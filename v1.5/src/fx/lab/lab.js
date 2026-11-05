// Ghost lab: 1984 film look through the game's HDR pipeline, ghost type and mood picker, scenario timelines, live behaviour runs, deterministic shots and GPU timing.
import * as THREE from 'three';
import { FX } from '../index.js';
import { GHOST_TYPE_LIST } from '../ghosts/index.js';
import { buildSet } from './set.js';
import { Director, SCENARIOS, MOOD_LIST } from './scenarios.js';

const Q = new URLSearchParams(location.search);
const SHOT = Q.get('shot');
const QUALITY = Q.get('quality') || 'medium';
const PRESET = Q.get('preset') || (Q.get('timing') ? 'medium' : 'high');
const STEP = 1 / 60;
const NAMES = { onionhead: 'Onionhead', library: 'Library ghost', taxi: 'Taxi ghost', terror_dog: 'Terror dog', swarm: 'Vapour swarm' };

async function getRendererClass() {
  try { const m = await import('../../engine/renderer.js'); if (m.Renderer) return m.Renderer; } catch (e) { console.warn('[fx-lab] engine renderer unavailable, using lab copy', e.message); }
  const m = await import('./pipeline.js');
  return m.Renderer;
}

class Viewport {
  constructor(el, Renderer) {
    this.el = el;
    this.R = new Renderer(el);
    if (this.R.setPreset) this.R.setPreset(PRESET);
    this.renderer = this.R.renderer;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  }

  async init(type) {
    this.set = await buildSet(this.renderer);
    this.set.trap.position.set(0.25, 0, -2.6);
    this.scene = this.set.scene;
    const t0 = performance.now();
    this.fx = new FX({ renderer: this.renderer, scene: this.scene, camera: this.camera, quality: QUALITY });
    this.R.build(this.scene, this.camera);
    if (this.R.setExtraPasses) this.R.setExtraPasses(this.fx.postPasses());
    await this.fx.ready;
    this.readyMs = Math.round(performance.now() - t0);
    this.director = new Director(this.set, this.fx, this.camera, type);
    try { const m = await import('./sim.js'); this.director.makeSim = m.makeSim; } catch (e) { console.warn('[fx-lab] behaviour sim unavailable', e.message); }
    if (Q.get('cam')) this.director.camOverride = Q.get('cam');
    if (Q.get('nopart')) { for (const p of Object.values(this.fx.pools)) p.mesh.visible = false; this.fx.flares.mesh.visible = false; }
    this.R.resize();
  }

  step(name, t, dt) {
    this.director.run(name, t, dt);
    this.scene.updateMatrixWorld();
    this.fx.update(dt, t);
  }

  render(t, dt) { this.R.render(t, dt); }
}

const ui = {
  scenario: SHOT || Q.get('scenario') || (Q.get('mood') ? 'mood-' + Q.get('mood') : 'moods'),
  type: GHOST_TYPE_LIST.includes(Q.get('type')) ? Q.get('type') : 'onionhead',
  t: 0,
  paused: false,
  view: null,
};

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }

function buildUI() {
  const stage = document.getElementById('stage');
  document.body.classList.toggle('shot', !!SHOT || !!Q.get('timing'));
  const pane = el('div', 'pane');
  pane.appendChild(el('div', 'tag', '<b id="tagname"></b><span>1984 optical composite</span>'));
  stage.appendChild(pane);
  const types = document.getElementById('types');
  GHOST_TYPE_LIST.forEach((k, i) => { const b = el('button', 'btn type', `<kbd>${'QWERT'[i] || ''}</kbd>${NAMES[k] || k}`); b.dataset.type = k; b.onclick = () => setType(k); types.appendChild(b); });
  const bar = document.getElementById('scenes');
  for (const [k, S] of Object.entries(SCENARIOS)) {
    if (S.hidden) continue;
    const b = el('button', 'btn', `<kbd>${S.key}</kbd>${S.label}`);
    b.dataset.s = k;
    b.onclick = () => setScenario(k);
    bar.appendChild(b);
  }
  const moods = document.getElementById('moods');
  MOOD_LIST.forEach((m) => { const b = el('button', 'chip', m); b.dataset.s = 'mood-' + m; b.onclick = () => setScenario('mood-' + m); moods.appendChild(b); });
  return pane;
}

function label() {
  const S = SCENARIOS[ui.scenario];
  document.getElementById('now').textContent = `${NAMES[ui.type] || ui.type} · ${S ? S.label : ui.scenario}`;
  const tn = document.getElementById('tagname');
  if (tn) tn.textContent = (NAMES[ui.type] || ui.type).toUpperCase();
}

function resetView() {
  const v = ui.view;
  v.fx.reset(1984);
  v.director.prevT = -1;
  v.director.manual = null;
  v.director.dropSim();
}

function setScenario(k) {
  ui.scenario = k;
  ui.t = 0;
  resetView();
  document.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === k));
  label();
}

function setType(k) {
  ui.type = k;
  ui.view.director.setType(k);
  document.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('on', b.dataset.type === k));
  setScenario(ui.scenario);
  const u = new URL(location.href);
  u.searchParams.set('type', k);
  history.replaceState(null, '', u);
}

function simulateTo(t) {
  resetView();
  let tt = 0;
  while (tt + STEP <= t + 1e-6) { tt += STEP; ui.view.step(ui.scenario, tt, STEP); }
  ui.t = tt;
}

function renderAll(dt) { ui.view.render(ui.t, dt); }

async function strip(n, dt) {
  const cols = Math.min(n, 4), rows = Math.ceil(n / cols);
  const v = ui.view;
  const W = v.renderer.domElement.width, H = v.renderer.domElement.height;
  const cw = Math.floor(innerWidth / cols), ch = Math.floor(cw * H / W);
  const c = document.createElement('canvas');
  c.width = cw * cols; c.height = ch * rows;
  c.className = 'stripcanvas';
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < n; i++) {
    if (i > 0) { let k = 0; while (k < dt - 1e-6) { const s = Math.min(STEP, dt - k); ui.t += s; k += s; v.step(ui.scenario, ui.t, s); } }
    renderAll(STEP);
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    g.drawImage(v.renderer.domElement, x, y, cw, ch);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = '12px ui-monospace, monospace'; g.fillText(`t=${ui.t.toFixed(3)}`, x + 6, y + 16);
  }
  document.body.appendChild(c);
}

async function timing() {
  const v = ui.view;
  const r = v.renderer, gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
  const size = r.getDrawingBufferSize(new THREE.Vector2());
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
  const rtB = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
  const query = async (fn, reps, samples = 7) => {
    const vals = [];
    for (let s = 0; s < samples; s++) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      for (let i = 0; i < reps; i++) fn();
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      gl.finish();
      let val = -1;
      for (let k = 0; k < 400; k++) { await sleep(2); if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { val = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 / reps; break; } }
      gl.deleteQuery(q);
      if (val > 0) vals.push(val);
    }
    vals.sort((a, b) => a - b);
    return vals.length ? vals[Math.floor(vals.length / 2)] : -1;
  };
  const objCost = async (obj, reps = 10) => {
    r.setRenderTarget(rt);
    r.clear();
    const ac = r.autoClear;
    r.autoClear = false;
    for (let i = 0; i < 3; i++) r.render(obj, v.camera);
    const t = await query(() => r.render(obj, v.camera), reps);
    r.autoClear = ac;
    r.setRenderTarget(null);
    return t;
  };
  const passCost = async (pass, reps = 10) => query(() => pass.render(r, rtB, rt, STEP, false), reps);
  const fx = v.fx;
  const res = { gpu, size: [size.x, size.y], preset: PRESET, quality: QUALITY, readyMs: v.readyMs, ghostLoadMs: fx.stats.ghostLoadMs, method: ext ? 'EXT_disjoint_timer_query_webgl2, ghost object rendered alone into a HalfFloat target of the frame size, median of 7 samples x 10 reps' : 'no timer query', ghosts: {} };
  if (!ext) { console.log('[fx-timing] ' + JSON.stringify(res)); return res; }
  const setup = (scen, t) => { ui.scenario = scen; simulateTo(t); v.render(ui.t, STEP); };
  for (let i = 0; i < 8; i++) v.render(ui.t, STEP);
  const only = Q.get('types') ? Q.get('types').split(',') : GHOST_TYPE_LIST;
  for (const type of only) {
    ui.type = type; v.director.setType(type);
    const o = v.director.ghost.object3D;
    const g = { tris: fx.stats.ghosts[type] ? fx.stats.ghosts[type].tris : 0 };
    setup('mood-taunt', 2.0); g.closeup = await objCost(o);
    setup('mood-angry', 2.0); g.closeupAngry = await objCost(o);
    setup('blast-ghost', 2.0); g.mid = await objCost(o);
    setup('capture', 3.0); g.capture = await objCost(o);
    for (const k of Object.keys(g)) g[k] = Math.round(g[k] * 1000) / 1000;
    res.ghosts[type] = g;
  }
  setup('blast-wall', 2.5);
  res.frameTotal = await query(() => v.render(ui.t, STEP), 4);
  res.streamBlast = await objCost(fx.root);
  for (const { name, pass } of fx.postPasses()) res['pass_' + name] = await passCost(pass);
  for (const k of Object.keys(res)) if (typeof res[k] === 'number') res[k] = Math.round(res[k] * 1000) / 1000;
  rt.dispose(); rtB.dispose();
  console.log('[fx-timing] ' + JSON.stringify(res));
  window.__fxTimingResult = res;
  return res;
}

async function main() {
  const Renderer = await getRendererClass();
  const pane = buildUI();
  ui.view = new Viewport(pane, Renderer);
  window.__lab = ui;
  await ui.view.init(ui.type);
  const info = ui.view.set;
  document.getElementById('assets').textContent = `${info.realWand ? 'wand.glb' : 'wand stand-in'} · ${info.realTrap ? 'trap.glb' : 'trap stand-in'} · ready ${ui.view.readyMs} ms`;
  document.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('on', b.dataset.type === ui.type));
  setScenario(ui.scenario);
  if (Q.get('timing')) {
    const r = await timing();
    document.getElementById('now').textContent = JSON.stringify(r);
    window.__fxReady = true;
    return;
  }
  if (SHOT) {
    const t = parseFloat(Q.get('t') || '2');
    simulateTo(t);
    const n = parseInt(Q.get('strip') || '0', 10);
    if (n > 1) { await strip(n, parseFloat(Q.get('dt') || '0.0833')); }
    else { renderAll(STEP); renderAll(STEP); }
    window.__fxShot = (name, tt, type) => { if (type) { ui.type = type; ui.view.director.setType(type); } ui.scenario = name; simulateTo(tt); renderAll(STEP); renderAll(STEP); return true; };
    window.__fxReady = true;
    return;
  }
  setupInput();
  window.__fxReady = true;
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!ui.paused) {
      ui.t += dt;
      const S = SCENARIOS[ui.scenario];
      const manual = ui.view.director.manual && ui.view.director.manual.active;
      if (S && !manual && ui.t > S.len) { ui.t = 0; ui.view.fx.reset(1984); ui.view.director.prevT = -1; }
      ui.view.step(ui.scenario, ui.t, dt);
    }
    renderAll(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function setupInput() {
  const keys = {};
  for (const [k, S] of Object.entries(SCENARIOS)) if (S.key) keys[S.key] = k;
  addEventListener('keydown', (e) => {
    const ti = 'qwert'.indexOf(e.key.toLowerCase());
    if (keys[e.key]) setScenario(keys[e.key]);
    else if (ti >= 0 && GHOST_TYPE_LIST[ti]) setType(GHOST_TYPE_LIST[ti]);
    else if (e.code === 'Space') { ui.paused = !ui.paused; e.preventDefault(); }
    else if (e.key === 'm' || e.key === 'M') { const cur = ui.scenario.startsWith('mood-') ? MOOD_LIST.indexOf(ui.scenario.slice(5)) : -1; setScenario('mood-' + MOOD_LIST[(cur + 1) % MOOD_LIST.length]); }
    else if (e.key === 'h' || e.key === 'H') { const d = ui.view.director; if (d.manual) d.manual.heat = d.manual.heat > 0.5 ? 0 : 1; }
  });
  const target = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const sphere = new THREE.Sphere();
  const hp = new THREE.Vector3();
  const aim = (e) => {
    const pane = e.target.closest('.pane');
    if (!pane) return;
    const r = pane.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const v = ui.view, d = v.director;
    ray.setFromCamera(ndc, v.camera);
    const hits = ray.intersectObjects(v.set.props, false);
    target.copy(hits.length ? hits[0].point : ray.ray.at(30, target));
    const g = d.ghost.object3D;
    if (g.visible) {
      sphere.set(g.position, d.ghost.radius * 0.95);
      if (ray.ray.intersectSphere(sphere, hp) && (!hits.length || hp.distanceTo(ray.ray.origin) < hits[0].distance)) target.copy(g.position);
    }
    if (!d.manual) d.manual = { active: true, down: false, capture: false, locked: false, heat: 0, target: new THREE.Vector3() };
    d.manual.active = true;
    d.manual.target.copy(target);
  };
  const stage = document.getElementById('stage');
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('pointermove', (e) => { if (ui.view.director.manual) aim(e); });
  stage.addEventListener('pointerdown', (e) => {
    aim(e);
    const m = ui.view.director.manual;
    m.down = true; m.capture = e.button === 2 || e.shiftKey;
    document.getElementById('now').textContent = 'Manual: LMB fire, RMB/Shift capture the ghost, H heat';
  });
  addEventListener('pointerup', () => { const m = ui.view.director.manual; if (m) { m.down = false; m.capture = false; } });
}

main().catch((e) => { console.error('[fx-lab] ' + (e && e.stack || e)); document.getElementById('now').textContent = 'Error: ' + e.message; });
