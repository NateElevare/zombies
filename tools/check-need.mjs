// Isolated-browser smoke test; never touches the player's browser profile or saves.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const url = process.argv[2] || 'http://127.0.0.1:5173/', out = 'tools/out/group-in-need', port = 9800 + Math.floor(Math.random() * 100);
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!exe) throw Error('No test browser');
mkdirSync(out, { recursive: true });
const child = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, '--window-size=1600,1000', `--user-data-dir=${process.env.TEMP}/deadzone-need-${Date.now()}`, '--no-first-run', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore', windowsHide: true });
const delay = ms => new Promise(r => setTimeout(r, ms));
let socket;
try {
  let tabs;
  for (let i = 0; i < 80 && !tabs; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await delay(250); } }
  socket = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => socket.onopen = r);
  let next = 0; const pending = new Map(), logs = [];
  socket.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') logs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(m.params.args.map(a => a.value || a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(Error(`Timeout: ${method}`)); }, 30000);
    pending.set(id, m => { clearTimeout(timer); m.error ? reject(Error(JSON.stringify(m.error))) : resolve(m); });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const ev = async expression => {
    const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (m.result?.exceptionDetails) throw Error(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text);
    return m.result?.result?.value;
  };
  const shot = async name => { await delay(800); const m = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, `${name}.png`), Buffer.from(m.result.data, 'base64')); };
  const click = text => ev(`(()=>{ const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)}); if(!b) throw Error('Button missing: '+${JSON.stringify(text)}); b.click(); })()`);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 120; i++) { if (await ev('!!window.deadzone?.scene?.api').catch(() => false)) break; await delay(250); }
  if (!await ev('!!window.deadzone?.scene?.api')) {
    await shot('boot-failed');
    console.log(await ev('({url:location.href,text:document.body.innerText})'), logs);
    throw Error('Game did not boot');
  }
  await click('A GROUP IN NEED'); await shot('locked-title');
  await ev(`(()=>{ const {scene:sc,sim}=window.deadzone;sc.api.newRoad('scout');const s=sc.state;s.player.sp=10;sim.progression.unlock(s,'survival_pack1');s.player.level=14;sim.road.startMission(s,9);sim.road.begin(s);while(s.road.phase==='play')sim.road.devSkip(s);sim.road.next(s); })()`);
  await shot('long-road-ending');
  await click('PLAY A GROUP IN NEED'); await shot('opening-briefing');
  console.log(await ev(`(()=>{const s=window.deadzone.scene.state;if(!s.player.tech.survival_pack1||s.player.level!==14||s.road.story!=='group-in-need')throw Error('Carryover failed');return {story:s.road.story,level:s.player.level,skills:s.player.tech};})()`));
  await click('MOVE OUT'); await delay(300); await shot('north-ridge-start');
  await ev(`(()=>{const {scene:sc,sim}=window.deadzone,s=sc.state;sim.road.startMission(s,4);sim.road.begin(s);s.dev={god:true};const p=sim.road.currentRun(s).point;s.player.x=s.player.prevX=p.x;s.player.y=s.player.prevY=p.y;})()`);
  await delay(600); await shot('hospital-siege');
  await ev(`(()=>{const {scene:sc,sim}=window.deadzone,s=sc.state;while(sim.road.current(s).kind!=='rescue')sim.road.devSkip(s);for(const z of s.zombies)if(!z.dead)sim.zombies.damage(s,z,1e6,0);const p=sim.road.currentRun(s).point;s.player.x=s.player.prevX=p.x;s.player.y=s.player.prevY=p.y;})()`);
  await delay(900); await shot('rescued-squad');
  console.log(await ev(`(()=>{const s=window.deadzone.scene.state;if(s.road.allies.filter(a=>a.following).length!==4)throw Error('Squad did not rally');return {squad:s.road.allies.map(a=>a.name),objective:window.deadzone.sim.road.objectiveText(s)};})()`));
  await ev(`(()=>{const {scene:sc,sim}=window.deadzone,s=sc.state;sim.road.startMission(s,5);sim.road.begin(s);s.clock.t=100;const p=s.player;for(let i=0;i<4;i++)sim.zombies.spawn(s,'walker',p.x+230+i*38,p.y+35);})()`);
  await delay(1200); await shot('squad-covering-fire');
  await ev(`(()=>{const {scene:sc,sim}=window.deadzone,s=sc.state;sim.road.startMission(s,9);sim.road.begin(s);while(s.road.phase==='play')sim.road.devSkip(s);sim.road.next(s);})()`);
  await shot('homecoming');
  await click('BACK TO TITLE'); await click('A GROUP IN NEED'); await shot('completed-title');
  await send('Emulation.setDeviceMetricsOverride', { width: 700, height: 900, deviceScaleFactor: 1, mobile: false }); await shot('narrow-title');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await click('CONTINUE'); await shot('continued-ending');
  if (!await ev(`window.deadzone.scene.state.road.phase==='ended'&&JSON.parse(localStorage.getItem('deadzone_road_v1')).done&&JSON.parse(localStorage.getItem('deadzone_need_v1')).done`)) throw Error('Independent save / completed reload failed');
  writeFileSync(join(out, 'console.json'), JSON.stringify(logs, null, 2));
  if (logs.length) throw Error(logs.join('\n'));
  console.log('Sequel browser checks passed.');
} finally { socket?.close(); child.kill(); }
