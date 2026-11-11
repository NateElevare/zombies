// Real WebGL verification in an isolated browser profile; never touches the player's saves.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const url = process.argv[2] || 'http://127.0.0.1:5183/';
const out = process.argv[3] || 'tools/out/queen-conduits';
const port = 9800 + Math.floor(Math.random() * 100);
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!exe) throw Error('No browser available');
mkdirSync(out, { recursive: true });
const child = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, '--window-size=1440,1000', `--user-data-dir=${process.env.TEMP}/queen-conduits-${Date.now()}`, '--no-first-run', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore', windowsHide: true });
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
  await check(`window.deadzone.scene.textures.exists('hive_queen_conduits')`, 'conduit atlas loads through the real boot flow');
  await ev(`(async()=>{
    const road=await import('/src/sim/road.ts'),data=await import('/src/sim/hive-data.ts');road.devUnlockHiveBelow();
    window.deadzone.scene.api.newRoad('survivor','hive-below');
    const s=window.deadzone.scene.state,i=data.HIVE_MISSIONS.findIndex(m=>m.id==='queen');
    road.startMission(s,i);s.ui=null;s.dev={god:true,freeze:true,timeScale:1};s.player.flashlight=true;
    window.__tick=()=>{s.paused=false;road.stepRoad(s,{moveX:0,moveY:0,aimX:s.player.x+100,aimY:s.player.y,fire:false,firePressed:false,altPressed:false,sprint:false,interactHeld:false,pressed:new Set()},1/60);s.paused=true;};
    window.__tick();
    const n=data.HIVE_MISSIONS[i].objectives.findIndex(o=>o.kind==='boss');
    for(let j=0;j<n;j++)road.devSkip(s);
    const c=road.currentRun(s).point;
    s.player.x=s.player.prevX=c.x-300;s.player.y=s.player.prevY=c.y;
    for(let j=0;j<10;j++)window.__tick();
    window.__queen=s.zombies.find(z=>z.boss==='queen');
    window.__cons=s.zombies.filter(z=>z.type==='burrow'&&z.roadTag==='conduit'&&!z.dead);
    const p=window.__cons[2];s.player.x=s.player.prevX=p.x+150;s.player.y=s.player.prevY=p.y+80;
    s.player.angle=s.player.prevAngle=0;s.shake=0;s.events.length=0;
    window.__render.attach(s);
  })()`);
  await delay(1400);
  await check(`window.__cons.length===4 && document.querySelector('.hb-objective').textContent==='SHIELDED · 4 CONDUITS REMAINING' && !document.querySelector('.hud-boss').classList.contains('hidden')`, 'actual Queen encounter starts with four conduits and a visible counter');
  await check(`[...window.__render.actors.zv.values()].some(v=>v.spr.visible&&String(v.spr.frame.name).startsWith('hive_queen_conduit_')) && window.__render.hive.labels.items.some(o=>o.visible&&o.text==='DESTROY CONDUIT')`, 'conduits render their own sprites and destroy labels');
  await shot('queen-four-conduits');
  await ev(`window.__cons[2].hp=window.__cons[2].maxHp*.4`);await delay(250);
  await check(`window.__render.actors.zv.get(window.__cons[2].id).spr.frame.name==='hive_queen_conduit_damaged'`, 'damaged conduit switches to cracked art');
  await shot('queen-damaged-conduit');
  await ev(`(async()=>{
    const s=window.deadzone.scene.state,zs=await import('/src/sim/zombies.ts');
    zs.damage(s,window.__cons[2],1e9,0);
    window.__death=s.events.find(e=>e.t==='zombieKilled'&&e.id===window.__cons[2].id);
    s.zombies=s.zombies.filter(z=>!z.dead);
  })()`);await delay(850);
  await check(`window.__death.conduit===true && document.querySelector('.hb-objective').textContent==='SHIELDED · 3 CONDUITS REMAINING'`, 'kill event preserves conduit identity after removal and counter drops immediately');
  await check(`window.__render.fx.dying.some(d=>d.corpse==='hive_queen_conduit_destroyed') && !window.__render.hive.labels.items.some(o=>o.visible&&o.text==='DESTROY CONDUIT'&&o.x===window.__cons[2].x&&Math.abs(o.y-window.__cons[2].y)<100)`, 'shattered remains use conduit art and their target label disappears');
  await shot('queen-three-conduits');
  await ev(`(async()=>{const s=window.deadzone.scene.state,zs=await import('/src/sim/zombies.ts');for(const z of window.__cons)if(!z.dead)zs.damage(s,z,1e9,0);for(let i=0;i<3;i++)window.__tick();})()`);await delay(700);
  await check(`window.__queen.stage===1 && document.querySelector('.hb-objective').textContent==='SHIELD BROKEN · ATTACK THE QUEEN' && !window.__render.hive.labels.items.some(o=>o.visible&&o.text==='DESTROY CONDUIT')`, 'destroying all four breaks the shield and switches the objective');
  await shot('queen-shield-broken');
  await ev(`window.deadzone.scene.api.newArcade('survivor')`);await delay(500);
  await check(`document.querySelector('.hb-objective').classList.contains('hidden') && !window.__render.hive.labels.items.some(o=>o.visible)`, 'Arcade clears the Queen objective and Hive target labels');
  writeFileSync(join(out,'verification.json'),JSON.stringify({report,errors},null,2));
  if(errors.length)throw Error(errors.join('\n'));
  console.log('Queen conduit browser checks passed.');
} finally {socket?.close();child.kill();}
