// Real WebGL verification in an isolated browser profile; never touches the player's saves.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const url = process.argv[2] || 'http://127.0.0.1:5183/';
const out = process.argv[3] || 'tools/out/hive-environment';
const port = 9800 + Math.floor(Math.random() * 100);
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!exe) throw Error('No browser available');
mkdirSync(out, { recursive: true });
const child = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, '--window-size=1440,1000', `--user-data-dir=${process.env.TEMP}/hive-environment-${Date.now()}`, '--no-first-run', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore', windowsHide: true });
const delay = ms => new Promise(r => setTimeout(r, ms));
let socket;
try {
  let tabs;
  for (let i = 0; i < 80 && !tabs; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await delay(250); } }
  if (!tabs) throw Error('Browser did not start');
  socket = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => socket.onopen = r);
  let next = 0; const pending = new Map(), errors = [], report = [];
  socket.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, m => { clearTimeout(timer); resolve(m); }); socket.send(JSON.stringify({ id, method, params }));
  });
  const ev = async expression => {
    const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (m.result?.exceptionDetails) throw Error(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text);
    return m.result?.result?.value;
  };
  const check = async (expression, label) => { if (!await ev(expression)) throw Error(label); console.log('PASS', label); report.push(label); };
  const shot = async name => { const m = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, name + '.png'), Buffer.from(m.result.data, 'base64')); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 160; i++) { if (await ev('!!window.deadzone?.scene?.api').catch(() => false)) break; await delay(250); }
  await ev(`(()=>{
    window.deadzone.scene.api.newArcade('survivor');
    const s=window.deadzone.scene.state;s.ui=null;s.dev={god:true,timeScale:.15};
    s.player.active='secondary';s.player.inv.equip.secondary={id:'pistol',qty:1,mag:12};s.player.inv.equip.melee={id:'bat',qty:1};
    s.arcade.toSpawn=0;s.arcade.intermission=100;s.zombies.length=0;
  })()`);
  await delay(800);
  const canvas=await ev(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x+r.width*.65,y:r.y+r.height*.5}})()`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:canvas.x,y:canvas.y});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:canvas.x,y:canvas.y,button:'right',buttons:2,clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:canvas.x,y:canvas.y,button:'right',buttons:0,clickCount:1});
  await delay(200);
  console.log(await ev(`(()=>{const s=window.deadzone.scene.state;return{active:s.player.active,swing:s.player.swingTimer,weapon:s.player.swingWeapon,frame:window.__render.actors.pWeapon.frame.name}})()`));
  await check(`window.deadzone.scene.state.player.swingTimer>0&&window.deadzone.scene.state.player.swingWeapon==='bat'`, 'real right-click starts the equipped melee swing');
  await check(`window.deadzone.scene.state.player.active==='secondary'&&window.deadzone.scene.state.player.inv.equip.secondary.mag===12`, 'selected gun and ammo remain unchanged');
  await check(`window.__render.actors.pWeapon.frame.name==='weapon_bat'`, 'top-down renderer shows the bat during the swing');
  await shot('quick-melee');
  await delay(1800);
  await check(`window.deadzone.scene.state.player.swingTimer===0&&window.__render.actors.pWeapon.frame.name==='weapon_pistol'`, 'gun returns visually after the swing');
  writeFileSync(join(out,'verification.json'),JSON.stringify({report,errors},null,2));
  if(errors.length)throw Error(errors.join('\n'));
  console.log('Quick-melee browser checks passed.');
} finally { socket?.close(); child.kill(); }
