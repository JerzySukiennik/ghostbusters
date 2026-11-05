// Runs janine_bake.html in headless Chrome and writes blender/people/work/janine_clips.json. node jbake.mjs --url=http://127.0.0.1:1993/blender/people/bake/janine_bake.html
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

const arg = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const kill = setTimeout(async () => { console.log(logs.join('\n') + '\n[jbake] timeout'); await browser.close(); process.exit(2); }, 60000);
try {
  await page.goto(arg.url, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__bake', null, { timeout: 55000 });
  const r = await page.evaluate('JSON.stringify(window.__bake)');
  writeFileSync(ROOT + '/blender/people/work/janine_clips.json', r);
  const j = JSON.parse(r);
  console.log(JSON.stringify({ seat: j.seat, phone: j.phone, clips: j.clips.map((c) => [c.name, c.dur, c.times.length]) }), r.length);
} catch (e) { console.log('[jbake error]', e.message); }
clearTimeout(kill);
console.log(logs.join('\n'));
await browser.close();
