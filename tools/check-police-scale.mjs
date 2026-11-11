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
  await ev('window.sc=deadzone.scene;window.sim=deadzone.sim;sc.api.newSurvival("responder",false)');
  await ev(`
    window.s=sc.state;window.p=s.player;window.r=__render;window.sv=r.story;s.paused=true;s.toasts=[];
    s.zombies=[];s.buildings=[];s.containers=[];s.structures=[];s.roads=[];s.drops=[];s.grid=new sim.core.Grid(16000,16000,128);
    s.decor=[{kind:'lot',sub:'dirt',surface:'dirt',x:5400,y:5400,w:1400,h:1400}];
    p.x=p.prevX=6000;p.y=p.prevY=6200;p.angle=0;
    for(const [i,sub]of ['sedan','police','police_wreck'].entries())for(const [row,flip]of [false,true].entries())s.grid.insert({kind:'car',sub,x:5800+i*130,y:5880+row*170,w:44,h:92,flip,solid:true,blocksSight:false});
    r.attach(s);r.camX=p.x;r.camY=p.y*Math.SQRT1_2;r.light.draw=()=>{};r.light.img.setVisible(false);r.light.haze.setVisible(false);
  `);await sleep(700);await shot('police-size-comparison');
  await check('sv.props.images.items.filter(im=>im.visible&&im.frame.name.startsWith("story_car_")).length===6','sedan, police and police wreck render in both front/rear views');
  await check('sv.props.images.items.filter(im=>im.visible&&im.frame.name.startsWith("story_car_police")).every(im=>im.frame.cutWidth*im.scaleX>43&&im.frame.cutHeight*im.scaleY>48)','police sprites fill their actual car footprint');
  const errors=logs.filter(l=>/\[exception\]|\[error\]/.test(l));if(errors.length)throw Error(errors.join('\n'));console.log('PASS zero browser errors');ws.close();
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{proc.kill();setTimeout(()=>process.exit(),300)});


