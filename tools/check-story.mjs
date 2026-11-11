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
  await ev('window.sc=deadzone.scene;window.sim=deadzone.sim;sc.api.newSurvival("responder")');
  await until('!!sc.state&&!!window.__render.story.actors.get(-1)');
  await ev('window.s=sc.state;window.p=s.player;window.r=window.__render;window.sv=r.story;p.hp=p.maxHp=10000;s.toasts=[]');
  await check('r.angled&&sc.cameras.main.zoom===1.35&&sv.character.torso.texture.key==="story_torsos"','story uses approved projection, zoom and responder');
  await ev('sc.input2.mouseX=800;sc.input2.mouseY=450;window.start={x:p.x,y:p.y};sc.input2.keys.add("KeyD")');
  await until('Math.hypot(p.x-start.x,p.y-start.y)>20');
  await ev('sc.input2.keys.clear()');
  await check('p.x>start.x&&Math.abs(p.y-start.y)<2','D moves horizontally on screen');
  await ev('p.x=p.prevX=start.x;p.y=p.prevY=start.y;window.zpos=Array.from({length:16},(_,i)=>({x:p.x+Math.cos(i*Math.PI/8)*100,y:p.y+Math.sin(i*Math.PI/8)*100})).find(q=>sim.core.phys.isFree(s,q.x,q.y,16)&&!sim.core.phys.raycast(s,p.x,p.y,q.x,q.y));window.z=sim.zombies.spawn(s,"walker",zpos.x,zpos.y);z.variant=0;z.speed=0;z.hp=z.maxHp=200;');
  await until('sv.actors.has(z.id)');
  await check('sv.actors.get(z.id).image.texture.key==="angle_zombie_v3_256"','story zombie uses approved atlas');
  await check('(()=>{const im=sv.actors.get(z.id).image,v=r.projectedView;const q=r.screenToWorld((im.x-v.x)*v.zoom,(im.y-40-v.y)*v.zoom);return Math.hypot(q.x-z.x,q.y-z.y)<1})()','aiming at upright zombie body targets its collision position');
  await ev('(()=>{const im=sv.actors.get(z.id).image,v=r.projectedView;sc.input2.mouseX=(im.x-v.x)*v.zoom;sc.input2.mouseY=(im.y-40-v.y)*v.zoom;sc.input2.mouseDown=true})()');
  await until('z.hp<200');
  await ev('sc.input2.mouseDown=false');
  await check('z.hp<200','real story shooting hits upright zombie');
  await shot('story-combat');
  await ev('sim.zombies.damage(s,z,999,0)');
  await until('sv.actors.get(z.id)?.corpse');
  await until('sv.actors.get(z.id).image.frame.name.includes("corpse")');
  await check('sv.actors.get(z.id).image.depth===19','approved death settles on the ground layer');
  await ev('s.paused=true;window.deadTime=sv.actors.get(z.id).actor.deathTime');await sleep(300);
  await check('sv.actors.get(z.id).actor.deathTime===deadTime','pause freezes animation timers');
  await ev('s.paused=false');
  await ev('window.b=s.buildings.reduce((best,b)=>Math.hypot(b.x-p.x,b.y-p.y)<Math.hypot(best.x-p.x,best.y-p.y)?b:best);outer:for(let y=b.y+b.h-25;y>b.y+15;y-=16)for(let x=b.x+b.w-25;x>b.x+15;x-=16)if(sim.core.phys.isFree(s,x,y,p.r)){p.x=p.prevX=x;p.y=p.prevY=y;break outer}');
  await until('sv.scenery.entries.get(b)?.mesh.parts[0].image.alpha<.02');
  await check('Array.from(sv.scenery.entries.values()).some(e=>e.wall&&e.mesh.parts[0].image.alpha<.4)','walls blocking the player fade');
  await shot('story-cutaway');
  await ev('window.wall=Array.from(s.grid.all()).filter(o=>o.kind==="wall"&&o.w>200&&o.h<25).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];p.x=p.prevX=wall.x+wall.w*.3;p.y=p.prevY=wall.y+wall.h+18;s.paused=true;window.frontZombie=sim.zombies.spawn(s,"runner",wall.x+wall.w*.65,p.y);frontZombie.variant=0;frontZombie.attackT=2;');
  await until('sv.scenery.entries.has(wall)&&sv.actors.has(frontZombie.id)');
  await check('sv.scenery.entries.get(wall).mesh.parts.every(part=>part.image.depth<sv.character.torso.depth&&part.image.depth<sv.actors.get(frontZombie.id).image.depth)','outside player and zombie both sort in front of long wall');
  await shot('story-outside-wall');
  await ev('s.paused=false');
  await ev('s.clock.t=sim.game.DAY_LENGTH*.85;s.toasts=[]');await sleep(400);await shot('story-night');
  await ev('s.clock.t=sim.game.DAY_LENGTH*.4;sc.api.quitToTitle(true);sc.api.newArcade()');await sleep(500);
  await check('!r.angled&&sv.actors.size===0&&Array.from(sv.layers.values()).every(l=>l.inner.rotation===0&&l.outer.scaleY===1)','Arcade restores overhead rendering without story sprites');
  await shot('arcade-after-story');
  await ev('sc.api.quitToTitle(true);sc.api.openAngleLab()');await until('window.__phaser.scene.getScene("AngleLab").ready');
  await ev('window.lab=window.__phaser.scene.getScene("AngleLab");lab.settings.follow=false;lab.settings.cutaway=false;lab.syncControls();lab.layout()');await sleep(700);await check('lab.settings.yaw===0&&lab.settings.zoom===1.35','Lab defaults to zero rotation and 1.35 zoom');await shot('lab-roof-car');
  const errors=logs.filter(l=>/\[exception\]|\[error\]/.test(l));writeFileSync(join(OUT,'checks.log'),logs.join('\n'));if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS zero browser errors');ws.close();
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{proc.kill();setTimeout(()=>process.exit(),300)});
