// Ghostbusters headless Chrome harness: real GPU (ANGLE/Metal) screenshots, frame strips and console capture.
// node Niepotrzebne/tools/shot.mjs --url=http://localhost:1984/fx-lab.html --out=/abs/x.jpg [--w=1280 --h=720]
//   [--ready="window.__ready===true"] [--eval="js"] [--wait=3000] [--frames=8 --every=250] [--eval2="js after wait"]
import { createRequire } from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

const arg = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/s);
  if (m) arg[m[1]] = m[2] === undefined ? true : m[2];
}
const url = arg.url || 'http://localhost:1984/';
const out = arg.out || 'shot.png';
const w = +(arg.w || 1280), h = +(arg.h || 720);
const wait = +(arg.wait || 3000), frames = +(arg.frames || 1), every = +(arg.every || 250);
const jpg = /\.jpe?g$/i.test(out);

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +(arg.dpr || 1) });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const kill = setTimeout(async () => { console.log(logs.slice(-80).join('\n') + '\n[shot] hard timeout 150 s'); await browser.close(); process.exit(2); }, 150000);

try {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  if (arg.ready) await page.waitForFunction(arg.ready, null, { timeout: 120000 }).catch(() => logs.push('[shot] ready timeout'));
  if (arg.eval) {
    try { const r = await page.evaluate(arg.eval); if (r !== undefined) logs.push('[eval] ' + JSON.stringify(r).slice(0, 4000)); }
    catch (e) { logs.push('[eval error] ' + e.message); }
  }
  await page.waitForTimeout(wait);
  if (arg.eval2) {
    try { const r = await page.evaluate(arg.eval2); if (r !== undefined) logs.push('[eval2] ' + JSON.stringify(r).slice(0, 4000)); }
    catch (e) { logs.push('[eval2 error] ' + e.message); }
  }
  for (let i = 0; i < frames; i++) {
    const p = frames === 1 ? out : out.replace(/(\.\w+)$/, `_${String(i).padStart(2, '0')}$1`);
    await page.screenshot({ path: p, type: jpg ? 'jpeg' : 'png', quality: jpg ? 85 : undefined });
    if (i < frames - 1) await page.waitForTimeout(every);
  }
} catch (e) {
  logs.push('[shot error] ' + e.message);
}
clearTimeout(kill);
console.log(logs.slice(-80).join('\n'));
await browser.close();
