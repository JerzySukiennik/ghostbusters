// FX lab: side-by-side modern | film viewports through the game's HDR pipeline, scenario timelines, mouse aiming, deterministic shots and GPU timing.
import * as THREE from 'three';
import { FX } from '../index.js';
import { buildSet } from './set.js';
import { Director, SCENARIOS, MOOD_LIST } from './scenarios.js';

const Q = new URLSearchParams(location.search);
const SHOT = Q.get('shot');
const VIEW = Q.get('view') || 'both';
const QUALITY = Q.get('quality') || 'medium';
const PRESET = Q.get('preset') || (Q.get('timing') ? 'medium' : 'high');
const STEP = 1 / 60;

async function getRendererClass() {
  try { const m = await import('../../engine/renderer.js'); if (m.Renderer) return m.Renderer; } catch (e) { console.warn('[fx-lab] engine renderer unavailable, using lab copy', e.message); }
  const m = await import('./pipeline.js');
  return m.Renderer;
}

class Viewport {
  constructor(el, style, Renderer) {
    this.el = el;
    this.style = style;
    this.R = new Renderer(el);
    if (this.R.setPreset) this.R.setPreset(PRESET);
    this.renderer = this.R.renderer;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  }

  async init() {
    this.set = await buildSet(this.renderer);
    this.set.trap.position.set(0.25, 0, -2.6);
    this.scene = this.set.scene;
    this.fx = new FX({ renderer: this.renderer, scene: this.scene, camera: this.camera, quality: QUALITY, style: this.style });
    this.R.build(this.scene, this.camera);
    if (this.R.setExtraPasses) this.R.setExtraPasses(this.fx.postPasses());
    await this.fx.ready;
    this.director = new Director(this.set, this.fx, this.camera);
    if (Q.get('cam')) this.director.camOverride = Q.get('cam');
    if (Q.get('layers')) {
      const mask = Q.get('layers');
      for (const st of this.fx._streams) for (const g of Object.values(st.groups)) g.children.forEach((m, i) => { m.material.uniforms.uGain.value *= mask[i] === '0' ? 0 : 1; });
    }
    if (Q.get('noghost')) { this.fx._ghosts[0].body.visible = false; this.fx._ghosts[0].shell.visible = false; }
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
  scenario: SHOT || Q.get('scenario') || 'blast-wall',
  t: 0,
  paused: false,
  views: [],
};

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }

function buildUI() {
  const stage = document.getElementById('stage');
  const styles = VIEW === 'both' ? ['modern', 'film'] : [VIEW === 'film' ? 'film' : 'modern'];
  document.body.classList.toggle('solo', styles.length === 1);
  document.body.classList.toggle('shot', !!SHOT || !!Q.get('timing'));
  const panes = styles.map((s) => {
    const pane = el('div', 'pane');
    const tag = el('div', 'tag', s === 'modern' ? '<b>MODERN</b><span>Afterlife-style plasma</span>' : '<b>FILM</b><span>1984 optical composite</span>');
    tag.dataset.style = s;
    pane.appendChild(tag);
    stage.appendChild(pane);
    return { pane, style: s, tag };
  });
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
  return panes;
}

function setScenario(k) {
  ui.scenario = k;
  ui.t = 0;
  for (const v of ui.views) { v.fx.reset(1984); v.director.prevT = -1; v.director.manual = null; }
  document.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === k));
  const S = SCENARIOS[k];
  document.getElementById('now').textContent = S ? S.label : k;
}

function simulateTo(t) {
  for (const v of ui.views) { v.fx.reset(1984); v.director.prevT = -1; }
  let tt = 0;
  while (tt + STEP <= t + 1e-6) { tt += STEP; for (const v of ui.views) v.step(ui.scenario, tt, STEP); }
  ui.t = tt;
}

function renderAll(dt) { for (const v of ui.views) v.render(ui.t, dt); }

async function strip(n, dt) {
  const cols = Math.min(n, 4), rows = Math.ceil(n / cols);
  const v0 = ui.views[0];
  const W = v0.renderer.domElement.width * ui.views.length, H = v0.renderer.domElement.height;
  const cw = Math.floor(innerWidth / cols), ch = Math.floor(cw * H / W);
  const c = document.createElement('canvas');
  c.width = cw * cols; c.height = ch * rows;
  c.className = 'stripcanvas';
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < n; i++) {
    if (i > 0) { let k = 0; while (k < dt - 1e-6) { const s = Math.min(STEP, dt - k); ui.t += s; k += s; for (const v of ui.views) v.step(ui.scenario, ui.t, s); } }
    renderAll(STEP);
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    let ox = 0;
    for (const v of ui.views) {
      const cv = v.renderer.domElement;
      const w = cw / ui.views.length;
      g.drawImage(cv, x + ox, y, w, ch);
      ox += w;
    }
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = '12px ui-monospace, monospace'; g.fillText(`t=${ui.t.toFixed(3)}`, x + 6, y + 16);
  }
  document.body.appendChild(c);
}

async function timing() {
  const v = ui.views[0];
  const r = v.renderer, gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
  const size = r.getDrawingBufferSize(new THREE.Vector2());
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
  const rtB = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
  const query = async (fn, reps, samples = 9) => {
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
  const objCost = async (obj, reps = 12) => {
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
  const passCost = async (pass, reps = 12) => {
    const en = pass.enabled;
    const t = await query(() => pass.render(r, rtB, rt, STEP, false), reps);
    pass.enabled = en;
    return t;
  };
  const fx = v.fx;
  const ghostObj = v.director.ghost.object3D;
  const res = { gpu, size: [size.x, size.y], style: v.style, preset: PRESET, method: ext ? 'EXT_disjoint_timer_query_webgl2, effect objects rendered alone into a HalfFloat target of the frame size, median of 9 samples x 12 reps' : 'no timer query' };
  if (!ext) { console.log('[fx-timing] ' + JSON.stringify(res)); return res; }
  const setup = (scen, t) => { ui.scenario = scen; simulateTo(t); v.render(ui.t, STEP); };
  for (let i = 0; i < 8; i++) v.render(ui.t, STEP);
  setup('blast-wall', 2.5);
  res.frameTotal = await query(() => v.render(ui.t, STEP), 4);
  res.sceneOnly = await objCost(v.scene, 4);
  res.streamBlast = await objCost(fx.root);
  setup('heat', 4.0);
  res.streamOverheat = await objCost(fx.root);
  setup('capture', 3.0);
  res.streamCapture = await objCost(fx.root);
  res.ghostInCapture = await objCost(ghostObj);
  setup('mood-taunt', 2.0);
  res.ghostCloseup = await objCost(ghostObj);
  setup('blast-ghost', 2.0);
  res.ghostMid = await objCost(ghostObj);
  setup('trap', 2.6);
  for (const s of fx._streams) { s.groups.modern.visible = false; s.groups.film.visible = false; }
  res.trapFX = await objCost(fx.root);
  setup('slime', 2.0);
  const passes = fx.postPasses();
  for (const { name, pass } of passes) res['pass_' + name] = await passCost(pass);
  for (const k of Object.keys(res)) if (typeof res[k] === 'number') res[k] = Math.round(res[k] * 1000) / 1000;
  res.ghostTris = fx.stats ? fx.stats.ghostTris : 0;
  res.ghostBuildMs = fx.stats ? fx.stats.ghostBuildMs : 0;
  rt.dispose(); rtB.dispose();
  console.log('[fx-timing] ' + JSON.stringify(res));
  window.__fxTimingResult = res;
  return res;
}

async function main() {
  const Renderer = await getRendererClass();
  const panes = buildUI();
  for (const p of panes) {
    const vp = new Viewport(p.pane, p.style, Renderer);
    ui.views.push(vp);
  }
  await Promise.all(ui.views.map((v) => v.init()));
  const info = ui.views[0].set;
  document.getElementById('assets').textContent = `${info.realWand ? 'wand.glb' : 'wand stand-in'} · ${info.realTrap ? 'trap.glb' : 'trap stand-in'}`;
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
    window.__fxShot = (name, tt) => { ui.scenario = name; simulateTo(tt); renderAll(STEP); renderAll(STEP); return true; };
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
      const manual = ui.views[0].director.manual && ui.views[0].director.manual.active;
      if (S && !manual && ui.t > S.len) { ui.t = 0; for (const v of ui.views) { v.fx.reset(1984); v.director.prevT = -1; } }
      for (const v of ui.views) v.step(ui.scenario, ui.t, dt);
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
    if (keys[e.key]) setScenario(keys[e.key]);
    else if (e.code === 'Space') { ui.paused = !ui.paused; e.preventDefault(); }
    else if (e.key === 'm' || e.key === 'M') { const cur = ui.scenario.startsWith('mood-') ? MOOD_LIST.indexOf(ui.scenario.slice(5)) : -1; setScenario('mood-' + MOOD_LIST[(cur + 1) % MOOD_LIST.length]); }
    else if ((e.key === 'v' || e.key === 'V') && ui.views.length === 1) {
      const v = ui.views[0];
      const s = v.fx.style === 'film' ? 'modern' : 'film';
      v.fx.setStyle(s);
      const tag = document.querySelector('.tag');
      tag.innerHTML = s === 'modern' ? '<b>MODERN</b><span>Afterlife-style plasma</span>' : '<b>FILM</b><span>1984 optical composite</span>';
    } else if (e.key === 'h' || e.key === 'H') {
      for (const v of ui.views) if (v.director.manual) v.director.manual.heat = v.director.manual.heat > 0.5 ? 0 : 1;
    }
  });
  const target = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const aim = (e) => {
    const pane = e.target.closest('.pane');
    if (!pane) return;
    const r = pane.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    for (const v of ui.views) {
      ray.setFromCamera(ndc, v.camera);
      const hits = ray.intersectObjects(v.set.props, false);
      target.copy(hits.length ? hits[0].point : ray.ray.at(30, target));
      const g = v.director.ghost.object3D;
      if (g.visible) {
        const s = new THREE.Sphere(g.position, 0.55);
        const hp = new THREE.Vector3();
        if (ray.ray.intersectSphere(s, hp) && (!hits.length || hp.distanceTo(ray.ray.origin) < hits[0].distance)) target.copy(g.position);
      }
      const d = v.director;
      if (!d.manual) d.manual = { active: true, down: false, capture: false, locked: false, heat: 0, target: new THREE.Vector3() };
      d.manual.active = true;
      d.manual.target.copy(target);
    }
  };
  const stage = document.getElementById('stage');
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('pointermove', (e) => { if (ui.views[0].director.manual) aim(e); });
  stage.addEventListener('pointerdown', (e) => {
    aim(e);
    for (const v of ui.views) { v.director.manual.down = true; v.director.manual.capture = e.button === 2 || e.shiftKey; }
    document.getElementById('now').textContent = 'Manual: LMB fire, RMB/Shift capture the ghost, H heat';
  });
  addEventListener('pointerup', () => { for (const v of ui.views) if (v.director.manual) { v.director.manual.down = false; v.director.manual.capture = false; } });
}

main().catch((e) => { console.error('[fx-lab] ' + (e && e.stack || e)); document.getElementById('now').textContent = 'Error: ' + e.message; });
