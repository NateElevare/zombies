// tools/probe.mjs — drive the real game in headless Edge/Chrome via CDP: screenshots + perf summary.
// Usage:
//   node tools/probe.mjs [--url http://localhost:5173] [--scenario street|night|indoor|inventory|tech|map|build|loot|arcade|walk]
//                        [--seconds 10] [--out tools/out] [--size 1600x900] [--headful]
// Needs a running server: `npm run dev` (or `npm run build && npm run preview -- --port 5173`).
// Scenarios use the debug handle window.deadzone (GameScene + perf) and the sim modules on it.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const URL = args.url || 'http://localhost:5173/';
const SCEN = (args.scenario || 'street').split(',');
const SECONDS = +(args.seconds || 6);
const OUT = args.out || 'tools/out';
const [W, H] = (args.size || '1600x900').split('x').map(Number);
const PORT = 9300 + Math.floor(Math.random() * 500);
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const exe = BROWSERS.find(existsSync);
if (!exe) { console.error('no Edge/Chrome found'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const proc = spawn(exe, [
  ...(args.headful ? [] : ['--headless=new']), `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`,
  `--user-data-dir=${process.env.TEMP || '/tmp'}/deadzone-probe-${PORT}`, '--no-first-run', '--enable-gpu-rasterization',
  '--ignore-gpu-blocklist', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let tabs;
  for (let i = 0; i < 60 && !tabs; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(250); } }
  const page = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === 'Runtime.consoleAPICalled') logs.push(`[${d.params.type}] ` + d.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    if (d.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const p = join(OUT, name + '.png'); writeFileSync(p, Buffer.from(r.result.data, 'base64')); console.log('screenshot', p);
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  for (let i = 0; i < 80; i++) { if (await ev('!!(window.deadzone && window.deadzone.scene && window.deadzone.scene.api)').catch(() => false)) break; await sleep(250); }
  await ev(`localStorage.clear()`);

  for (const scen of SCEN) {
    const setup = await ev(`(async () => {
      const dz = window.deadzone, sc = dz.scene, api = sc.api;
      const scen = ${JSON.stringify(scen)};
      if (scen === 'arcade') { api.newArcade(); return 'arcade'; }
      await api.newSurvival();
      const S = sc.state, p = S.player;
      const sim = dz.sim;
      if (sim && (scen === 'indoor' || scen === 'loot')) {
        let best = null, bd = 1e9;
        for (const c of S.containers) { if (!c.buildingId) continue; const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c; } }
        const cx = best.x + best.w / 2, cy = best.y + best.h / 2;
        outer: for (let r = 20; r < 90; r += 6) for (let a = 0; a < 6.28; a += 0.3) {
          const x = cx + Math.cos(a) * (best.w / 2 + r), y = cy + Math.sin(a) * (best.h / 2 + r);
          if (sim.core.phys.isFree(S, x, y, p.r) && sim.world.buildingAt(S, x, y)) { p.x = p.prevX = x; p.y = p.prevY = y; break outer; }
        }
        if (scen === 'loot') { sim.loot.fill(S, best); best.searched = true; S.events.push({ t: 'openUi', ui: 'loot', target: best }); }
      }
      if (sim && (scen === 'zombies' || scen === 'zombies-night')) {
        const types = ['walker', 'walker', 'runner', 'brute', 'crawler', 'bloater', 'walker', 'runner'];
        types.forEach((t, i) => { const a = -0.9 + i * 0.26, d = 170 + (i % 3) * 70;
          const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
          if (sim.core.phys.isFree(S, x, y, 26)) sim.zombies.spawn(S, t, x, y); });
        if (scen === 'zombies-night') S.clock.t = sim.game.DAY_LENGTH * 0.85;
        p.hp = 1e6; p.maxHp = 1e6;
      }
      if (scen === 'night' || scen === 'build') S.clock.t = sim ? sim.game.DAY_LENGTH * 0.82 : 500;
      if (sim && scen === 'build') {
        for (const [id, q] of [['wood', 60], ['nails', 20], ['scrap', 30], ['cloth', 10]]) sim.inventory.add(p.inv, id, q);
        for (const [t, dx, dy] of [['workbench', 120, -40], ['bed', -120, -30], ['wood_wall', 0, -120], ['wood_wall', 64, -120], ['campfire', 0, 110]]) sim.base.place(S, t, p.x + dx, p.y + dy, 0);
        sim.game.setUi(S, 'build');
      }
      if (sim && ['inventory', 'tech', 'map'].includes(scen)) {
        for (const [id, q] of [['shotgun', 1], ['ammo_12g', 30], ['police_vest', 1], ['medkit', 2], ['wood', 20], ['gun_parts', 3], ['hiking_backpack', 1]]) sim.inventory.add(p.inv, id, q);
        sim.progression.addXP(S, 1500);
        S.events.push({ t: 'openUi', ui: scen });
      }
      return scen;
    })()`);
    // aim right of the player, and for 'walk' hold D+Shift to sprint across the city
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(W * 0.72), y: Math.round(H * 0.45) });
    if (scen === 'walk' || scen === 'arcade') {
      await ev(`(() => { const i = window.deadzone.scene.input2; i.keys.add('KeyD'); i.keys.add('ShiftLeft'); window.deadzone.perf.setOn(true);
        window.__god = setInterval(() => { const p = window.deadzone.scene.state?.player; if (p) { p.hp = p.maxHp; p.stamina = p.maxStamina; p.food = 100; p.water = 100; } }, 200); })()`);
    }
    await sleep(SECONDS * 1000);
    if (args.eval) console.log('eval:', JSON.stringify(await ev(args.eval)));
    await shot(`${scen}`);
    if (scen === 'walk' || scen === 'arcade') {
      const sum = await ev(`(() => { const s = window.deadzone.perf.summary(Infinity); window.deadzone.perf.setOn(false);
        const i = window.deadzone.scene.input2; i.keys.clear(); clearInterval(window.__god); return s; })()`);
      writeFileSync(join(OUT, `${scen}-perf.json`), JSON.stringify(sum, null, 1));
      const { slow, ...brief } = sum; console.log(`perf ${scen}:`, JSON.stringify(brief));
    }
    console.log('scenario', setup, 'done');
  }
  const errs = logs.filter((l) => /error|exception/i.test(l));
  writeFileSync(join(OUT, 'console.log'), logs.join('\n'));
  console.log(`console: ${logs.length} lines, ${errs.length} errors`); errs.slice(0, 15).forEach((e) => console.log('  ', e.slice(0, 300)));
  ws.close();
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { proc.kill(); setTimeout(() => process.exit(), 300); });
