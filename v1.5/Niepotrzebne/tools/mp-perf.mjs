// Render cost of teammates in one page: bench alone, then with 3 suited teammates firing (fake states fed through the real Net code, test realm).
// node Niepotrzebne/tools/mp-perf.mjs [--q=medium] [--out=/abs/dir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

const arg = {};
for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)(?:=(.*))?$/s); if (m) arg[m[1]] = m[2] ?? true; }
const out = arg.out || '/private/tmp/claude-501/-Users-jurek-Downloads-Claude-Projects/df7d1cdf-4072-44b1-a760-e004f02d6d10/scratchpad/mpperf';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const kill = setTimeout(() => { console.log('[perf] hard timeout'); browser.close().catch(() => {}); setTimeout(() => process.exit(2), 1500); }, 480000);
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await page.goto('http://localhost:1984/?realm=test' + (arg.q ? '&q=' + arg.q : ''), { timeout: 240000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.evaluate(() => window.__online('host'));
  await page.waitForFunction(() => window.__net && window.__net.room.code, null, { timeout: 60000 });
  await page.evaluate(() => { const g = window.__gb, V = g.player.feet.constructor; g.input.locked = true; g.input.enabled = true; g.packToBack(); g.gear.holdWand(); g.wandMode = 'hold'; g.gear.power = true; g.gear.powered = 1; g.player.packed = true; g.packState = 1; g.player.teleport(new V(6.2, 0, 9.5), 0.15); g.rig.yaw = 0.12; g.rig.pitch = 0.06; });
  await wait(1500);
  const solo = await page.evaluate(() => window.__bench(90));
  await page.screenshot({ path: `${out}/solo.jpg`, type: 'jpeg', quality: 80 });
  await page.evaluate(() => {
    const net = window.__net, room = net.room, ps = { ...room.players };
    const fake = ['fakeaaaa01', 'fakebbbb02', 'fakecccc03'];
    fake.forEach((id, i) => { ps[id] = { nick: ['Ray', 'Egon', 'Winston'][i], char: 'jurek', joined: Date.now() + i }; });
    net.onPlayers(ps, [room.pid, ...fake]);
    window.__fakeT = setInterval(() => {
      const t = performance.now() / 1000;
      fake.forEach((id, i) => {
        const x = 4.4 + i * 1.6, z = 8.6 - (i % 2) * 0.8;
        net.onState(id, { p: [x, 0, z], y: 0.1, s: 0, g: 1, m: 'f', seat: 0, ad: 1, ho: 0, am: 1, sp: 0, pk: 1, slot: i + 1, h: 0.3, a: [7.6, 2.9, 16.5], f: 1, tr: { s: 'belt', p: [0, -50, 0], y: 0, v: 0 }, e: [7.6 + Math.sin(t * 3 + i) * 0.4, 2.9, 16.5], ek: 1, tn: 0 });
      });
    }, 100);
  });
  await page.waitForFunction(() => [...window.__net.remotes.values()].filter((r) => r.ready).length === 3, null, { timeout: 120000 });
  await wait(2500);
  const four = await page.evaluate(() => window.__bench(90));
  await page.screenshot({ path: `${out}/four.jpg`, type: 'jpeg', quality: 80 });
  console.log('alone      ', JSON.stringify(solo));
  console.log('3 teammates', JSON.stringify(four));
  await page.evaluate(() => { clearInterval(window.__fakeT); return window.__net.leave(); });
} catch (e) { errs.push('[perf] ' + e.message); }
clearTimeout(kill);
if (errs.length) console.log(errs.slice(-10).join('\n'));
await browser.close();
