// Gameplay harness: drives scenarios through window.__gb in headless Chrome (real GPU) and saves frames.
// node Niepotrzebne/tools/play.mjs <scenario> [--out=/abs/dir] [--q=...] [--w=1280 --h=720] [--style=modern|film]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

const arg = { _: [] };
for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)(?:=(.*))?$/s); if (m) arg[m[1]] = m[2] ?? true; else arg._.push(a); }
const scen = arg._[0] || 'walk';
const out = arg.out || '/private/tmp/claude-501/-Users-jurek--claude-spares-spare-8ni7op/df7d1cdf-4072-44b1-a760-e004f02d6d10/scratchpad/play';
fs.mkdirSync(out, { recursive: true });
const w = +(arg.w || 1280), h = +(arg.h || 720);
const qs = new URLSearchParams({ test: '1', ...(arg.q ? { q: arg.q } : {}), ...(arg.style ? { style: arg.style } : {}), ...(arg.fallback ? { fallback: arg.fallback } : {}) });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => { if (!/404|deprecated parameters/.test(m.text())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const kill = setTimeout(() => { console.log(logs.join('\n') + '\n[play] hard timeout'); browser.close().catch(() => {}); setTimeout(() => process.exit(2), 1500); }, 480000);
browser.on('disconnected', () => { console.log(logs.slice(-20).join('\n') + '\n[play] browser disconnected'); setTimeout(() => process.exit(3), 500); });
const E = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const until = (js, ms = 60000) => page.waitForFunction(js, null, { timeout: ms, polling: 200 }).catch(() => logs.push('[play] until timeout: ' + js));
const suited = () => until('window.__gb && !window.__gb.busy && window.__gb.gear.state === "worn" && window.__gb.mission !== "suit"', 90000);
let n = 0;
const shot = async (name) => { const p = `${out}/${scen}_${String(n++).padStart(2, '0')}_${name}.jpg`; await page.screenshot({ path: p, type: 'jpeg', quality: 82 }); return p; };
const aimAt = (x, y, z) => E(([x, y, z]) => { const g = window.__gb, c = g.camera.position; const dx = x - c.x, dy = y - c.y, dz = z - c.z; g.rig.yaw = Math.atan2(dx, dz); g.rig.pitch = Math.atan2(dy, Math.hypot(dx, dz)); }, [x, y, z]);
const state = () => E(() => { const g = window.__gb; return { mission: g.mission, obj: document.querySelector('#objective .t').textContent, ghost: g.ghost.state, will: +g.ghost.will.toFixed(1), heat: +g.gear.heat.toFixed(2), trap: g.trap.state, prog: +(g.trap.progress || 0).toFixed(2), proton: g.proton.on ? g.proton.mode : 'off', tension: +g.proton.tension.toFixed(2), gear: g.gear.state, player: g.player.feet.toArray().map((v) => +v.toFixed(2)), pyaw: +g.player.yaw.toFixed(2), cam: g.camera.position.toArray().map((v) => +v.toFixed(2)), rig: [g.rig.mode, +g.rig.yaw.toFixed(2), +g.rig.dist.toFixed(2), +g.rig.blend.toFixed(2)], rigpos: g.rig.pos.toArray().map((v) => +v.toFixed(2)), pivot: g.pivot.toArray().map((v) => +v.toFixed(2)) }; });

async function suit() {
  await E(() => { const g = window.__gb, p = g.ecto.rearPoint(new g.player.feet.constructor()); g.player.teleport(p, 0); });
  await wait(300);
  await E(() => { window.__gb.suitUp(); });
}

try {
  await page.goto('http://localhost:1984/?' + qs, { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => window.__ready === true || document.getElementById('err').textContent, null, { timeout: 300000 });
  await E(() => { window.__start(); const g = window.__gb; g.input.locked = true; g.input.enabled = true; });
  await wait(600);
  if (scen === 'walk') {
    await shot('start');
    await page.keyboard.down('KeyW'); await wait(1600); await shot('walk'); await page.keyboard.down('ShiftLeft'); await wait(1200); await shot('sprint');
    await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await wait(500); await shot('stop');
  } else if (scen === 'suit') {
    await suit();
    for (let i = 0; i < 12; i++) { await wait(550); await shot('t' + i); if (i >= 7) console.log('t' + i, JSON.stringify(await state())); }
    await wait(1500); await shot('done');
  } else if (scen === 'fire' || scen === 'capture' || scen === 'film') {
    await suit(); await suited(); await wait(400);
    await E(() => { const g = window.__gb, V = g.player.feet.constructor; g.player.teleport(new V(9, 0, 2), 0); g.rig.yaw = 0; g.ghost.set('roam'); g.ghost.pos.set(9.5, 2.6, 10); g.ghost.vel.set(0, 0, 0); g.engaged = true; g.mission = 'bust'; g.ghost.prankT = 99; g.ghost.tauntT = 99; g.ghost.swoopCd = 99; });
    await wait(300);
    const gp = await E(() => window.__gb.ghost.pos.toArray());
    await aimAt(gp[0], gp[1], gp[2]); await wait(200);
    await shot('aim');
    await E(() => { window.__gb.input.btn[0] = true; });
    for (let i = 0; i < 6; i++) {
      await wait(330);
      const g2 = await E(() => window.__gb.ghost.pos.toArray()); await aimAt(g2[0], g2[1], g2[2]);
      if (i % 2) await shot('fire' + i);
    }
    console.log('after blast', JSON.stringify(await state()));
    if (scen === 'capture' || scen === 'film') {
      await E(() => { window.__gb.ghost.will = 30; });
      for (let i = 0; i < 8; i++) { await wait(150); const g2 = await E(() => window.__gb.ghost.pos.toArray()); await aimAt(g2[0], g2[1], g2[2]); }
      console.log('lock?', JSON.stringify(await state()));
      await shot('wrangle');
      await page.keyboard.press('KeyQ'); await wait(1800);
      console.log('thrown', JSON.stringify(await state()));
      await shot('trap_thrown');
      await page.keyboard.press('KeyQ'); await wait(300);
      console.log('stomp', JSON.stringify(await state()));
      const tp = await E(() => window.__gb.trap.pos.toArray());
      for (let i = 0; i < 14; i++) {
        await aimAt(tp[0], tp[1] + 0.05, tp[2]); await wait(250); if (i === 4 || i === 10) await shot('drag' + i);
        if (i % 3 === 0) console.log('dbg', JSON.stringify(await E(() => { const g = window.__gb, f = (v) => v.toArray().map((x) => +x.toFixed(2)); const b = g.trap.beamPos(new g.player.feet.constructor()); return { gpos: f(g.ghost.pos), trap: f(g.trap.pos), beam: f(b), desired: f(g.proton.desired), aim: f(g.proton.aim), inCone: g.trap.inCone(g.ghost.pos), prog: g.trap.progress }; })));
      }
      console.log('drag', JSON.stringify(await state()));
      await wait(1800); await shot('caught');
      console.log('end', JSON.stringify(await state()));
    }
    await E(() => { window.__gb.input.btn[0] = false; });
  } else if (scen === 'pose') {
    await suit(); await suited(); await wait(400);
    await E(() => { const g = window.__gb, V = g.player.feet.constructor; g.player.teleport(new V(9, 0, 2), 0); g.ghost.set('roam'); g.ghost.prankT = g.ghost.tauntT = g.ghost.swoopCd = 99; g.engaged = true; g.mission = 'bust'; });
    for (const [gy, gz, side] of [[1.6, 9, 1], [4.5, 7, 1], [1.6, 9, -1], [6, 4, 1]]) {
      await E(([gy, gz, side]) => {
        const g = window.__gb, V = g.player.feet.constructor;
        g.ghost.pos.set(9, gy, 2 + gz); g.ghost.vel.set(0, 0, 0); g.ghost.update = () => {};
        const c = g.camera.position, dx = 9 - c.x, dy = gy - c.y, dz = 2 + gz - c.z;
        g.rig.yaw = Math.atan2(dx, dz); g.rig.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        g.input.btn[0] = true;
        const vp = new V(8.4, 1.75, -0.3), vd = new V(9, gy, 2 + gz).sub(vp).normalize();
        g.camera.getWorldPosition = (v) => v.copy(vp); g.camera.getWorldDirection = (v) => v.copy(vd);
        g.rig.yaw = Math.atan2(vd.x, vd.z); g.rig.pitch = Math.asin(vd.y);
        const f = (t, pos, look) => { pos.set(9 + side * 3.4, 1.35, 3.0); look.set(9, 1.2, 2.3); return 38; };
        f.ease = 0.01; g.rig.startCine(f);
      }, [gy, gz, side]);
      for (let k = 0; k < 3; k++) {
        await wait(300);
        console.log('pose', gy, side, JSON.stringify(await E(() => {
          const g = window.__gb, av = g.avatar, V = g.player.feet.constructor, out = {};
          for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck']) { const b = av.bone(n), p = b.getWorldPosition(new V()), c = b.children.find((x) => x.isBone); const q = c ? c.getWorldPosition(new V()).sub(p).normalize() : null; out[n] = q ? +Math.acos(Math.max(-1, Math.min(1, q.y))).toFixed(2) : null; }
          out.pitch = +g.player.wand.pitch.toFixed(2); out.hipOff = +g.player.hipOff.toFixed(2); out.mode = av.anim.mode; out.grounded = g.player.grounded;
          return out;
        })));
      }
      await shot(`pose_${gy}_${side}`);
    }
  } else if (scen === 'bot') {
    await suit(); await suited(); await wait(400);
    await E(() => { const g = window.__gb, V = g.player.feet.constructor; g.player.teleport(new V(4, 0, 6), 0); g.rig.yaw = 0; });
    let t0 = Date.now(), first = null;
    for (let i = 0; i < 90; i++) {
      const s = await E(() => {
        const g = window.__gb, gp = g.ghost.pos, c = g.camera.position;
        const lead = gp.clone().addScaledVector(g.ghost.vel, 0.08);
        const dx = lead.x - c.x, dy = lead.y - c.y, dz = lead.z - c.z;
        g.rig.yaw = Math.atan2(dx, dz); g.rig.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        const d = g.player.feet.distanceTo(gp);
        g.input.btn[0] = g.engaged && d < 20 && g.gear.over <= 0 && g.gear.heat < 0.9;
        if (!g.engaged || d > 16) { g.input.down.add('KeyW'); } else g.input.down.delete('KeyW');
        return { t: +g.time.toFixed(1), st: g.ghost.state, will: +g.ghost.will.toFixed(0), d: +d.toFixed(1), heat: +g.gear.heat.toFixed(2), on: g.proton.on ? g.proton.mode : '-', slimed: g.stats.slimed, cap: g.ghost.capturable };
      });
      if (i % 6 === 0) console.log('bot', JSON.stringify(s));
      if (s.cap && !first) first = s.t;
      if (s.on === 'capture') { console.log('LOCKED at', s.t); break; }
      if (i === 30 || i === 60) await shot('bot' + i);
      await wait(250);
    }
    console.log('first capturable at', first);
  } else if (scen === 'perf') {
    await wait(1500);
    console.log('perf title', JSON.stringify(await E(() => window.__bench(60))));
    await suit(); await suited(); await wait(400);
    console.log('perf street', JSON.stringify(await E(() => window.__bench(90))));
    await E(() => { const g = window.__gb, V = g.player.feet.constructor; g.player.teleport(new V(4, 0, 6), 0); g.ghost.set('roam'); g.ghost.pos.set(5, 2.4, 13); g.ghost.prankT = g.ghost.tauntT = g.ghost.swoopCd = 99; g.engaged = true; g.mission = 'bust'; });
    await wait(300);
    const gp = await E(() => window.__gb.ghost.pos.toArray()); await aimAt(gp[0], gp[1], gp[2]);
    await E(() => { window.__gb.input.btn[0] = true; });
    await wait(500);
    console.log('perf firing', JSON.stringify(await E(() => window.__bench(90))));
    await shot('firing');
    await E(() => { window.__gb.input.btn[0] = false; });
  } else if (scen === 'drive') {
    await E(() => { const g = window.__gb, p = g.ecto.doorPoint(new g.player.feet.constructor()); g.player.teleport(p, 0); });
    await wait(300); await page.keyboard.press('KeyF'); await wait(1600); await shot('seated');
    await page.keyboard.press('KeyH'); await page.keyboard.down('KeyW'); await wait(2500); await shot('drive');
    await page.keyboard.down('KeyA'); await wait(1500); await shot('turn'); await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW');
    console.log('car', JSON.stringify(await E(() => ({ v: window.__gb.ecto.fwdSpeed, rpm: window.__gb.ecto.rpm, gear: window.__gb.ecto.gear, pos: window.__gb.ecto.root.position.toArray() }))));
    await page.keyboard.down('KeyS'); await wait(2000); await page.keyboard.up('KeyS'); await wait(800);
    await page.keyboard.press('KeyF'); await wait(1500); await shot('out');
  }
  console.log('state', JSON.stringify(await state()));
  console.log('info', JSON.stringify(await E(() => ({ info: window.__gb.info, calls: window.__R.renderer.info.render.calls, tris: window.__R.renderer.info.render.triangles, err: document.getElementById('err').textContent }))));
} catch (e) { logs.push('[play error] ' + e.message); }
clearTimeout(kill);
console.log(logs.slice(-40).join('\n'));
await browser.close();
