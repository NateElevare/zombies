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
  await ev('window.sc=deadzone.scene;window.sim=deadzone.sim;sc.api.newSurvival("responder")');await sleep(300);
  await ev(`window.s=sc.state;window.p=s.player;window.r=__render;window.sv=r.story;
    s.paused=true;s.zombies=[];s.buildings=[];s.containers=[];s.structures=[];s.roads=[];s.drops=[];
    s.grid=new sim.core.Grid(16000,16000,128);s.decor=[{kind:'lot',sub:'dirt',surface:'dirt',x:5400,y:5400,w:1400,h:1400}];
    p.x=p.prevX=6000;p.y=p.prevY=6200;p.angle=Math.PI/4;p.active='melee';p.inv.equip.melee={id:'knife',qty:1};s.toasts=[];s.clock.t=sim.game.DAY_LENGTH*.4;
    window.recenter=()=>{r.attach(s);r.camX=p.x;r.camY=p.y;};recenter();r.light.draw=()=>{};r.light.img.setVisible(false);r.light.haze.setVisible(false);
    let i=0;for(const [type,count]of Object.entries({walker:4,runner:3,brute:2,crawler:2,bloater:2}))for(let variant=0;variant<count;variant++,i++){
      const z=sim.zombies.spawn(s,type,5650+(i%7)*112,5950+Math.floor(i/7)*180);z.variant=variant;z.angle=Math.PI/4;z.attackT=2;
    }`);await sleep(700);
  await check('s.zombies.every(z=>sv.actors.get(z.id)?.image.visible)','all thirteen zombie variants render');
  await shot('all-zombies');
  await ev('p.angle=0');await sleep(150);await shot('knife-east');
  for(const skin of ['responder','survivor','scout']){
    await ev(`p.character=${JSON.stringify(skin)};p.inv.equip.head={id:'military_helmet',qty:1};p.inv.equip.body={id:'police_vest',qty:1};p.inv.equip.back={id:'hiking_backpack',qty:1};`);await sleep(100);
    for(const id of ['pistol','revolver','smg','shotgun','assault_rifle','hunting_rifle','knife','bat','machete','cola_mints']){
      await ev(`p.inv.equip.melee={id:${JSON.stringify(id)},qty:1,mag:30};`);await sleep(70);
      await check(`sv.character.weapon.visible&&sv.character.weapon.frame.name.startsWith('story_weapon_${id}_')&&sv.character.torso.frame.name.startsWith('story_torso_${skin}_')`,'equipped '+skin+' '+id);
    }
  }
  await shot('equipped-scout');
  await ev(`s.zombies=[];p.character='responder';p.inv.equip.head=null;p.inv.equip.body=null;p.inv.equip.back=null;p.inv.equip.melee={id:'knife',qty:1};p.y=p.prevY=6120;
    const cars=['sedan','hatchback','van','pickup','police','ambulance','box_truck','humvee','military_truck'];
    cars.forEach((sub,i)=>s.grid.insert({kind:'car',sub,x:5620+(i%5)*180,y:5800+Math.floor(i/5)*180,w:130,h:60,solid:true,blocksSight:true,blocksBullets:true,vseed:0}));recenter();`);await sleep(500);await shot('all-vehicles');
  await check('sv.props.images.items.filter(i=>i.visible&&i.frame.name.startsWith("story_car_")).length===9','all nine car families use their own art');
  await ev(`for(const o of s.grid.all())o.sub+='_wreck';`);await sleep(150);await shot('all-wrecks');
  await ev(`s.grid=new sim.core.Grid(16000,16000,128);p.y=p.prevY=6100;
    let structureIndex=0;for(const [type,def]of Object.entries(sim.base.STRUCTURES)){s.structures.push({id:'gallery-'+type,type,x:5660+(structureIndex%5)*175,y:5820+Math.floor(structureIndex/5)*170,w:def.w,h:def.h,hp:def.hp,maxHp:def.hp,rot:0});structureIndex++;}
    s.drops=Object.keys(sim.items.ITEMS).map((id,i)=>({id:'drop-'+id,x:5630+(i%15)*55,y:6230+Math.floor(i/15)*38,r:12,life:999,kind:'loot',inv:{size:1,slots:[{id,qty:1}]}}));recenter();`);await sleep(500);await shot('buildables-and-drops');
  await check('sv.props.images.items.filter(i=>i.visible&&i.frame.name.startsWith("story_structures_")).length===10','all ten buildable types render');
  await check('s.drops.length===44','all collectible drop types exercised');
  await ev('s.structures.find(st=>st.type==="wood_door").open=true;s.structures.find(st=>st.type==="workbench").hp=10;s.build={selected:"workbench",rot:1,ghost:{x:6000,y:6120,w:32,h:64,ok:true}}');await sleep(150);await shot('open-door-and-build-ghost');
  await check('sv.props.images.items.some(i=>i.visible&&i.frame.name==="story_structures_wood_door_open_0")','open door swaps art');
  await check('sv.props.images.items.some(i=>i.visible&&i.alpha===.55&&i.frame.name==="story_structures_workbench_0")','rotated build ghost uses matching art');
  const errors=logs.filter(l=>/\[exception\]|\[error\]/.test(l));writeFileSync(join(OUT,'checks.log'),logs.join('\n'));if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS zero browser errors');ws.close();

}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{proc.kill();setTimeout(()=>process.exit(),300)});
