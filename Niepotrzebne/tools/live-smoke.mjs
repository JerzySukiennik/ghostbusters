// Live online smoke test: two tabs in one browser context (shared cache) on the deployed site, A opens a test-realm room, B joins by code, both must see each other.
// node Niepotrzebne/tools/live-smoke.mjs [--url=https://ghostbusters.gzowo.fun/] [--out=/abs/dir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

const arg = {};
for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)(?:=(.*))?$/s); if (m) arg[m[1]] = m[2] ?? true; }
const url = (arg.url || 'https://ghostbusters.gzowo.fun/') + '?realm=test&fallback=plate,fx';
const out = arg.out || '/private/tmp/claude-501/-Users-jurek-Downloads-Claude-Projects/df7d1cdf-4072-44b1-a760-e004f02d6d10/scratchpad/live';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const kill = setTimeout(() => { console.log('[live] hard timeout'); browser.close().catch(() => {}); setTimeout(() => process.exit(2), 1500); }, 360000);
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
const errs = [];
const open = async (name) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`[${name}] ${e.message}`)); await p.goto(url, { timeout: 180000 }); await p.waitForFunction(() => window.__ready === true, null, { timeout: 240000 }); return p; };
let code = null, ok = false;
try {
  const A = await open('A');
  await A.evaluate(() => { document.getElementById('nick').value = 'Smoke A'; return window.__online('host'); });
  await A.waitForFunction(() => window.__net && window.__net.room.code, null, { timeout: 60000 });
  code = await A.evaluate(() => window.__net.room.code);
  const B = await open('B');
  await B.evaluate((c) => { document.getElementById('nick').value = 'Smoke B'; document.getElementById('code').value = c; return window.__online('join'); }, code);
  const both = 'window.__net && window.__net.room.connected && window.__net.remotes.size === 1 && [...window.__net.remotes.values()][0].ready';
  await Promise.all([A.waitForFunction(both, null, { timeout: 90000 }), B.waitForFunction(both, null, { timeout: 90000 })]);
  const s = (p) => p.evaluate(() => ({ code: window.__net.room.code, host: window.__net.isHost, players: window.__net.room.order.length, connected: window.__net.room.connected, origin: location.origin }));
  console.log('A', JSON.stringify(await s(A)));
  console.log('B', JSON.stringify(await s(B)));
  await A.screenshot({ path: `${out}/live_A.jpg`, type: 'jpeg', quality: 78 });
  ok = true;
  await B.evaluate(() => window.__net.leave()); await A.evaluate(() => window.__net.leave());
} catch (e) { errs.push('[live] ' + e.message); }
clearTimeout(kill);
console.log(ok ? `LIVE OK room ${code}` : 'LIVE FAILED');
if (errs.length) console.log(errs.slice(-10).join('\n'));
await browser.close();
