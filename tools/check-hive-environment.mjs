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
  await check(`window.deadzone.scene.textures.exists('hive_environment') && window.deadzone.scene.textures.exists('hive_floors')`, 'environment atlases load through the real boot flow');
  await ev(`(async()=>{
    const road = await import('/src/sim/road.ts'); road.devUnlockHiveBelow();
    window.deadzone.scene.api.newRoad('survivor','hive-below');
    const s=window.deadzone.scene.state; road.startMission(s,1); s.ui=null;
    s.dev={god:true,freeze:true,timeScale:1}; s.player.flashlight=true;
  })()`);
  for (let z = 1; z <= 8; z++) {
    await ev(`(async()=>{
      const s=window.deadzone.scene.state,h=s.road.world.hive;
      const hive=await import('/src/sim/hive.ts');
      const p=${z}===8 ? h.breach : h.burrows[${z}][0] || h.eggs[${z}][0] || h.arenas[${z}];
      s.zombies.length=0; s.events.length=0; s.ui=null;
      s.player.x=s.player.prevX=p.x; s.player.y=s.player.prevY=p.y;
      s.player.angle=s.player.prevAngle=0;
      hive.spawnFixture(s,'burrow',{x:p.x+100,y:p.y},'qa-burrow');
      hive.spawnFixture(s,'egg',{x:p.x,y:p.y+100},'qa-egg');
      hive.spawnBug(s,'drone',p.x+130,p.y+130);
      window.__render.attach(s);
    })()`);
    await delay(1200);
    await check(`window.__render.ground.builds>0 && [...window.__render.actors.zv.values()].some(v=>v.spr.visible&&v.spr.frame.name.startsWith('hive_env_'))`, `zone ${z} renders painted fixtures and cached ground`);
    await shot(`zone-${z}`);
    await ev(`window.__render.light.img.setVisible(false);window.deadzone.scene.scene.pause()`);
    await shot(`zone-${z}-materials`);
    await ev(`window.deadzone.scene.scene.resume();window.__render.light.img.setVisible(true)`);
    if(z===7||z===8){
      await ev(`(async()=>{
        const s=window.deadzone.scene.state,h=s.road.world.hive;
        const {hiveWallRibbons}=await import('/src/render/hive-materials.ts'),{phys}=await import('/src/sim/core.ts');
        const centre=${z}===8?h.breach:h.arenas[${z}];
        const choices=hiveWallRibbons(h,${z}).map(p=>({x:p.x-Math.sin(p.angle)*100,y:p.y+Math.cos(p.angle)*100})).filter(p=>phys.isFree(s,p.x,p.y,20));
        choices.sort((a,b)=>Math.hypot(a.x-centre.x,a.y-centre.y)-Math.hypot(b.x-centre.x,b.y-centre.y));
        if(!choices.length)throw Error('No accessible sector boundary');
        const p=choices[0];s.player.x=s.player.prevX=p.x;s.player.y=s.player.prevY=p.y;
        s.zombies.length=0;window.__render.attach(s);
      })()`);
      await delay(1200);await shot(`zone-${z}-boundary`);
      await ev(`window.__render.light.img.setVisible(false);window.deadzone.scene.scene.pause()`);
      await shot(`zone-${z}-boundary-materials`);
      await ev(`window.deadzone.scene.scene.resume();window.__render.light.img.setVisible(true)`);
    }
  }
  await ev(`(async()=>{
    const s=window.deadzone.scene.state,h=s.road.world.hive,at=h.seals[1];
    s.player.x=s.player.prevX=at.x;s.player.y=s.player.prevY=at.y;
    s.road.world.gates[1].open=false;window.__render.attach(s);
  })()`);
  await delay(800);
  await check(`window.__render.hive.props.items.some(o=>o.visible&&o.texture?.key==='hive_environment'&&String(o.frame?.name).endsWith('_seal'))`, 'closed gate uses the painted resin seal');
  await shot('seal-closed');
  await ev(`window.deadzone.scene.state.road.world.gates[1].open=true`); await delay(300); await shot('seal-open');
  await ev(`(async()=>{
    const s=window.deadzone.scene.state,h=s.road.world.hive,p=h.burrows[1][0],hive=await import('/src/sim/hive.ts'),zs=await import('/src/sim/zombies.ts');
    s.player.x=s.player.prevX=p.x;s.player.y=s.player.prevY=p.y;s.zombies.length=0;window.__render.attach(s);
    const b=hive.spawnFixture(s,'burrow',{x:p.x+100,y:p.y},'qa-collapse');zs.damage(s,b,1e9,0);
  })()`);
  await delay(800);
  await check(`window.__render.fx.dying.some(d=>d.collapse&&d.corpse==='hive_env_1_wall_1')`, 'destroyed fixture leaves painted rubble');
  await shot('collapsed-burrow');
  await ev(`window.deadzone.scene.api.newArcade('survivor')`); await delay(500);
  await check(`!window.deadzone.scene.state.road && !window.__render.hive.props.items.some(o=>o.visible) && !window.__render.hive.floor.items.some(o=>o.visible)`, 'switching to Arcade clears Hive-only sprites');
  await shot('arcade-unchanged');
  writeFileSync(join(out, 'verification.json'), JSON.stringify({ report, errors }, null, 2));
  if (errors.length) throw Error(errors.join('\n'));
  console.log('Hive environment browser checks passed.');
} finally { socket?.close(); child.kill(); }
