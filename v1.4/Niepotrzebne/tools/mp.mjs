// Two-player online test (test realm): A hosts, B joins by code, both suit up, cross streams on purpose, then shoot one ghost together, B wrangles and traps it, stows it, both see the win.
// node Niepotrzebne/tools/mp.mjs [--fallback=plate,fx] [--out=/abs/dir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

const arg = {};
for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)(?:=(.*))?$/s); if (m) arg[m[1]] = m[2] ?? true; }
const out = arg.out || '/private/tmp/claude-501/-Users-jurek-Downloads-Claude-Projects/df7d1cdf-4072-44b1-a760-e004f02d6d10/scratchpad/mp';
fs.mkdirSync(out, { recursive: true });
const qs = 'test=1&realm=test' + (arg.fallback ? '&fallback=' + arg.fallback : '');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const logs = [];
const kill = setTimeout(() => { console.log(logs.slice(-40).join('\n') + '\n[mp] hard timeout'); browser.close().catch(() => {}); setTimeout(() => process.exit(2), 1500); }, 900000);
const mk = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (!/404|deprecated parameters/.test(m.text())) logs.push(`[${name} ${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[${name} pageerror] ${e.message}`));
  return page;
};
const A = await mk('A'), B = await mk('B');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = (p, js, ms = 120000) => p.waitForFunction(js, null, { timeout: ms, polling: 250 }).then(() => true).catch(() => { logs.push('[mp] until timeout: ' + js); return false; });
let n = 0;
const shot = async (p, tag) => p.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}_${tag}.jpg`, type: 'jpeg', quality: 78 });
const st = (p) => p.evaluate(() => {
  const g = window.__gb, net = window.__net, gh = g.ghosts[0];
  return { host: net?.isHost, remotes: net ? net.remotes.size : 0, mission: g.mission, gear: g.gear.state, over: +g.gear.over.toFixed(2), trap: g.trap.state, ghost: gh.state, will: Math.round(gh.will), wr: [...gh.wranglers.keys()].map((k) => k.slice(0, 4)), proton: g.proton.on ? g.proton.mode : 'off', cross: +(net?.crossCd || 0).toFixed(2), t: +g.time.toFixed(1), done: g.done };
});
const log = async (tag) => console.log(tag, 'A', JSON.stringify(await st(A)), '\n' + ' '.repeat(tag.length), 'B', JSON.stringify(await st(B)));
const aimAt = (p, x, y, z) => p.evaluate(([x, y, z]) => { const g = window.__gb, c = g.camera.position; const dx = x - c.x, dy = y - c.y, dz = z - c.z; g.rig.yaw = Math.atan2(dx, dz); g.rig.pitch = Math.atan2(dy, Math.hypot(dx, dz)); }, [x, y, z]);
const ghostPos = (p) => p.evaluate(() => window.__gb.ghosts[0].pos.toArray());
const fire = (p, on) => p.evaluate((on) => { window.__gb.input.btn[0] = on; }, on);
const place = (p, x, z, yaw = 0) => p.evaluate(([x, z, yaw]) => { const g = window.__gb, V = g.player.feet.constructor; g.player.teleport(new V(x, 0, z), yaw); }, [x, z, yaw]);
const track = async (p, cond, tries, at) => {
  for (let i = 0; i < tries; i++) {
    const gp = at ? at : await ghostPos(p);
    await aimAt(p, gp[0], gp[1], gp[2]);
    if (await p.evaluate(cond)) return true;
    await wait(250);
  }
  logs.push('[mp] track gave up: ' + cond);
  return false;
};
try {
  await Promise.all([A.goto('http://localhost:1984/?' + qs), B.goto('http://localhost:1984/?' + qs)]);
  await Promise.all([until(A, 'window.__ready === true', 300000), until(B, 'window.__ready === true', 300000)]);
  await A.evaluate((q) => { document.getElementById('nick').value = 'Jurek'; return window.__online(q ? 'quick' : 'host'); }, !!arg.quick);
  await until(A, 'window.__net && window.__net.room.code');
  const code = await A.evaluate(() => window.__net.room.code);
  console.log('room', code, arg.quick ? '(quick play)' : '(code)');
  if (arg.quick) { await wait(1500); await B.evaluate(() => { document.getElementById('nick').value = 'Ray'; return window.__online('quick'); }); console.log('B quick play landed in', await B.evaluate(() => window.__net?.room.code)); }
  else await B.evaluate((c) => { document.getElementById('nick').value = 'Ray'; document.getElementById('code').value = c; return window.__online('join'); }, code);
  await until(B, 'window.__net && window.__net.remotes.size === 1 && [...window.__net.remotes.values()][0].ready');
  await until(A, 'window.__net && window.__net.remotes.size === 1 && [...window.__net.remotes.values()][0].ready');
  for (const p of [A, B]) await p.evaluate(() => { const g = window.__gb; g.input.locked = true; g.input.enabled = true; });
  await log('joined');

  await A.evaluate(() => { const g = window.__gb, p = g.ecto.rearPoint(new g.player.feet.constructor()); g.player.teleport(p, 0); g.suitUp(); });
  await B.evaluate(() => { const g = window.__gb, p = g.ecto.rearPoint(new g.player.feet.constructor()); p.x += 1.2; g.player.teleport(p, 0); setTimeout(() => g.suitUp(), 300); });
  await until(B, 'window.__gb.packState === 3', 60000);
  await shot(A, 'A_sees_B_donning');
  const suited = 'window.__gb && !window.__gb.busy && window.__gb.gear.state === "worn"';
  await Promise.all([until(A, suited, 200000), until(B, suited, 200000)]);
  await shot(A, 'A_suited'); await shot(B, 'B_suited');
  await log('suited');

  await place(A, -6, 3); await place(B, 2, 3);
  await wait(500);
  await aimAt(A, 2, 1.4, 11); await aimAt(B, -6, 1.4, 11);
  await fire(A, true); await fire(B, true);
  for (let i = 0; i < 40; i++) {
    await aimAt(A, 2, 1.4, 11); await aimAt(B, -6, 1.4, 11);
    if (await A.evaluate(() => window.__net.crossCd > 0) || await B.evaluate(() => window.__net.crossCd > 0)) break;
    await wait(250);
  }
  await shot(A, 'A_crossed'); await shot(B, 'B_crossed');
  await log('crossed');
  await fire(A, false); await fire(B, false);
  await Promise.all([until(A, 'window.__gb.gear.canFire()', 90000), until(B, 'window.__gb.gear.canFire()', 90000)]);

  await A.evaluate(() => { const g = window.__gb, V = g.player.feet.constructor; g.player.teleport(new V(4, 0, 6), 0); const gh = g.ghosts[0]; gh.set('roam'); gh.pos.set(6, 2.6, 14); gh.vel.set(0, 0, 0); gh.prankT = gh.tauntT = gh.swoopCd = 1e9; g.engaged = true; g.mission = 'bust'; gh.update = ((u) => function (dt, ctx) { if (this.state === 'roam' || this.state === 'flee') { this.vel.multiplyScalar(0.9); this.pos.lerp(new V(6, 2.6, 14), 0.08); } return u.call(this, dt, ctx); })(gh.update); });
  await B.evaluate(() => { const g = window.__gb, V = g.player.feet.constructor; g.player.teleport(new V(8.5, 0, 6), 0); g.engaged = true; g.mission = 'bust'; });
  await wait(800);
  await fire(A, true); await fire(B, true);
  const w0 = (await st(A)).will;
  await track(A, '(() => window.__gb.ghosts[0].will < ' + (w0 - 20) + ')()', 60);
  for (let i = 0; i < 4; i++) { for (const p of [A, B]) { const gp = await ghostPos(p); await aimAt(p, gp[0], gp[1], gp[2]); } await wait(250); }
  await shot(A, 'A_both_firing'); await shot(B, 'B_both_firing');
  await log('both firing');
  if (arg.bench) console.log('bench A (2 players, both firing)', JSON.stringify(await A.evaluate(() => window.__bench(60))));

  await fire(A, false);
  await A.evaluate(() => { const gh = window.__gb.ghosts[0]; gh.will = 30; });
  const locked = await track(B, '(() => window.__gb.proton.mode === "capture" && window.__gb.ghosts[0].state === "wrangled")()', 120);
  const hostHas = await A.evaluate(() => [...window.__gb.ghosts[0].wranglers.keys()].includes([...window.__net.remotes.keys()][0]));
  console.log('B locked', locked, 'host sees B wrangling', hostHas);
  await shot(B, 'B_wrangling'); await shot(A, 'A_sees_B_wrangle');
  await log('wrangle');

  await B.keyboard.press('KeyQ');
  await track(B, '(() => window.__gb.trap.state === "armed")()', 160);
  await B.keyboard.press('KeyQ');
  await track(B, '(() => window.__gb.trap.state === "open")()', 40);
  await log('trap open');
  const tp = await B.evaluate(() => window.__gb.trap.pos.toArray());
  const sucked = await track(B, '(() => { const s = window.__gb.ghosts[0].state; return s === "sucked" || s === "captured"; })()', 200, [tp[0], tp[1] + 0.05, tp[2]]);
  console.log('sucked', sucked);
  await shot(B, 'B_trapping'); await shot(A, 'A_sees_trapping');
  await until(B, 'window.__gb.trap.state === "full"', 90000);
  await fire(B, false);
  await log('caught');

  await B.evaluate(() => { const g = window.__gb; g.player.teleport(g.trap.pos.clone().setY(0), 0); });
  await wait(400);
  await B.evaluate(() => { window.__gb.pickTrap(); });
  await until(B, 'window.__gb.trap.state === "carried"', 20000);
  await B.evaluate(() => { const g = window.__gb, p = g.ecto.rearPoint(new g.player.feet.constructor()); g.player.teleport(p, 0); });
  await wait(500);
  await B.evaluate(() => window.__gb.stowTrap());
  await Promise.all([until(A, 'window.__gb.done === true', 90000), until(B, 'window.__gb.done === true', 90000)]);
  await log('end');
  await shot(A, 'A_won'); await shot(B, 'B_won');
  await A.evaluate(() => window.__net.leave()); await B.evaluate(() => window.__net.leave());
} catch (e) { logs.push('[mp error] ' + e.message); }
clearTimeout(kill);
console.log(logs.filter((l) => /error|timeout|warn|gave up/i.test(l)).slice(-30).join('\n'));
await browser.close();
