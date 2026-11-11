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
const exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!exe) { console.error('no Edge/Chrome found'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const proc = spawn(exe, [
  ...(args.headful ? [] : ['--headless=new']), `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`,
  `--user-data-dir=${process.env.TEMP || '/tmp'}/deadzone-probe-${PORT}`, '--no-first-run', '--enable-gpu-rasterization',
  '--ignore-gpu-blocklist', '--enable-webgl', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank',
], { stdio: 'ignore', windowsHide: true });
proc.on('error', console.error); proc.on('exit', c => console.log('browser exit', c));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let tabs;
  for (let i = 0; i < 60 && !tabs; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(250); } }
  const page = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, reject) => { const t = setTimeout(() => reject(new Error('WebSocket timeout')), 10000); ws.onopen = () => { clearTimeout(t); r(); }; ws.onerror = reject; }); console.log('CDP connected');
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




  const check=async(expression,label)=>{if(!await ev(expression))throw Error(label);console.log('PASS',label)};
  const until=async expression=>{for(let i=0;i<100;i++){if(await ev(expression))return;await sleep(100)}throw Error('Timed out: '+expression)};
  await check('!document.querySelector(".story-legacy-input").checked','new angled view remains the default');
  await ev('document.querySelector(".story-legacy-input").click();document.querySelector("[data-character=responder]").click()');
  await shot('legacy-checkbox');
  await ev('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="NEW GAME").click()');
  await until('deadzone.scene.state?.mode==="survival"');
  await ev('window.sc=deadzone.scene;window.s=sc.state;window.r=__render;window.p=s.player;p.hp=p.maxHp=10000;s.toasts=[];sc.input2.mouseX=1000;sc.input2.mouseY=450;');await sleep(500);
  await check('s.legacyStory&&!r.angled&&!r.art.story&&!r.ground.angled&&!r.objs.angled&&r.story.actors.size===0','Legacy starts with the complete overhead renderer');
  await check('p.character==="responder"','Legacy keeps the selected character');
  await check('Array.from(r.story.layers.values()).every(l=>l.inner.rotation===0&&l.outer.scaleY===1)','Legacy world layers have no angled transform');
  await ev('sc.input2.keys.add("KeyD");sc.input2.keys.add("KeyS")');await sleep(200);
  await check('Math.abs(sc.lastInput.moveX-sc.lastInput.moveY)<.0001&&sc.lastInput.moveX>0','Legacy diagonal input is not inverse-projected');
  await ev('sc.input2.keys.clear()');
  await check('Math.abs(Math.hypot(r.light.lastFlashOrigin.x-r.actors.px,r.light.lastFlashOrigin.y-r.actors.py)-6)<.01','Legacy flashlight retains its overhead origin');
  await shot('legacy-story');
  await ev('s.stats.kills=17;window.savedSeed=s.seed;sc.api.quitToTitle()');
  await until('document.querySelector(".story-legacy-input")?.checked');
  await ev('document.querySelector(".story-legacy-input").click();Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="CONTINUE").click()');
  await until('sc.state?.mode==="survival"&&__render.angled');
  await ev('window.s=sc.state;window.p=s.player;');await sleep(500);
  await check('!s.legacyStory&&s.seed===savedSeed&&s.stats.kills===17&&p.character==="responder"','Continue changes only the presentation choice, preserving progress');
  await check('sc.cameras.main.zoom===1.35&&r.story.actors.has(-1)&&r.art.story','unchecked Continue restores angled sprites and zoom');
  await shot('angled-continued');
  await ev('sc.api.quitToTitle();document.querySelector(".story-legacy-input").click();Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="CONTINUE").click()');
  await until('sc.state?.legacyStory===true&&!r.angled');
  await check('sc.state.stats.kills===17&&r.story.actors.size===0','switching back to Legacy clears angled actors and keeps progress');
  await ev('sc.api.quitToTitle()');
  await send('Page.reload');await until('!!document.querySelector(".story-legacy-input")');
  await check('document.querySelector(".story-legacy-input").checked','Legacy checkbox survives a browser refresh');
  const errors=logs.filter(l=>/\[exception\]|\[error\]/.test(l));writeFileSync(join(OUT,'checks.log'),logs.join('\n'));if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS zero browser errors');ws.close();
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{proc.kill();setTimeout(()=>process.exit(),300)});
