// Runs bake.html in headless Chrome and writes assets/people/crowd_anim.bin + crowd_anim.json. node bake.mjs --url=http://127.0.0.1:1993/blender/people/bake/bake.html
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

const arg = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const kill = setTimeout(async () => { console.log(logs.join('\n') + '\n[bake] timeout'); await browser.close(); process.exit(2); }, 60000);
try {
  await page.goto(arg.url, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__bake', null, { timeout: 55000 });
  const r = await page.evaluate('window.__bake');
  writeFileSync(ROOT + '/assets/people/crowd_anim.bin', Buffer.from(r.b64, 'base64'));
  writeFileSync(ROOT + '/assets/people/crowd_anim.json', JSON.stringify(r.meta, null, 1));
  console.log(JSON.stringify(r.report), r.meta.width + 'x' + r.meta.height, Buffer.from(r.b64, 'base64').length);
} catch (e) { console.log('[bake error]', e.message); }
clearTimeout(kill);
console.log(logs.join('\n'));
await browser.close();
