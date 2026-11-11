// tools/shot.mjs — Playwright screenshot driver for the cloud workspace (Chromium, software GL).
// Usage: node tools/shot.mjs --out dir --script file.mjs
//   The script default-exports async (page, shot) => {}; `shot(name)` saves a PNG.
import { createRequire } from 'node:module';
// playwright from the project, or from a global install (the cloud workspace keeps it under /opt/npm-tools)
const { chromium } = (() => { for (const base of [import.meta.url, '/opt/npm-tools/node_modules/']) { try { return createRequire(base)('playwright'); } catch { /* next */ } } throw new Error('playwright is not installed: npm i -D playwright'); })();
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const URL = args.url || 'http://127.0.0.1:5173/';
const OUT = args.out || 'tools/out/shots';
const [W, H] = (args.size || '1600x900').split('x').map(Number);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push('[exception] ' + e.message));
await page.goto(URL);
await page.waitForFunction(() => !!(window.deadzone && window.deadzone.scene && window.deadzone.scene.api), null, { timeout: 60000 });
await page.evaluate(() => localStorage.clear());
const shot = async (name) => { const p = join(OUT, name + '.png'); await page.screenshot({ path: p }); console.log('screenshot', p); };
try {
  const mod = await import(pathToFileURL(resolve(args.script)).href);
  await mod.default(page, shot);
} catch (e) { console.error('script failed:', e); process.exitCode = 1; }
if (logs.length) console.log('--- browser log ---\n' + logs.slice(0, 40).join('\n'));
await browser.close();
