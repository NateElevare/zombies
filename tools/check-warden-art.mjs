// Browser verification against the real game; isolated temporary browser profile.
import { spawn } from 'node:child_process';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
const url=process.argv[2]||'http://127.0.0.1:5175/',out='tools/out/warden',port=9700+Math.floor(Math.random()*200);
const exe=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if(!exe)throw new Error('No test browser');mkdirSync(out,{recursive:true});
const child=spawn(exe,['--headless=new',`--remote-debugging-port=${port}`,'--window-size=1600,1000',`--user-data-dir=${process.env.TEMP}/deadzone-warden-${Date.now()}`,'--no-first-run','--ignore-gpu-blocklist','about:blank'],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let socket;
try{
  let tabs;for(let i=0;i<80&&!tabs;i++){try{tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();}catch{await delay(250);}}
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);
  let next=0;const pending=new Map(),logs=[];
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')logs.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')logs.push(m.params.args.map(a=>a.value||a.description).join(' '));};
  const send=(method,params={})=>new Promise((r,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},30000);pending.set(id,m=>{clearTimeout(timer);r(m);});socket.send(JSON.stringify({id,method,params}));});
  const ev=async expression=>{const m=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(m.result?.exceptionDetails)throw new Error(m.result.exceptionDetails.exception?.description||m.result.exceptionDetails.text);return m.result?.result?.value;};
  const shot=async name=>{await delay(600);const m=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`${name}.png`),Buffer.from(m.result.data,'base64'));};
  await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url});
  for(let i=0;i<120;i++){if(await ev('!!window.deadzone?.scene?.api').catch(()=>false))break;await delay(250);}
  const check=async(expression,label)=>{if(!await ev(expression))throw new Error(label);console.log('PASS',label);};
  await ev(`(()=>{
    const sc=window.deadzone.scene;sc.api.newRoad('responder');
    const s=sc.state,p=s.player,b=window.deadzone.sim.bosses,c=window.deadzone.sim.road.campOf(s,0);
    s.ui=null;s.paused=true;s.zombies=[];s.clock.t=90;s.shake=0;
    p.x=p.prevX=c.x-600;p.y=p.prevY=c.y+165;
    window.warden=b.spawnBossOf(s,'warden',0,p.x+100,p.y-170,1,{maxR:60,kit:1});
    window.regularBoss=b.spawnBossOf(s,'juggernaut',0,p.x-260,p.y-150,1,{maxR:26,kit:1});
    [window.warden,window.regularBoss].forEach(z=>Object.assign(z,{angle:0,prevAngle:0,attackT:10,hitFlash:0,act:'',cd:{},state:'chase'}));
    s.time=.3;window.__render.draw(s,1,.016);
  })()`);
  await delay(700);await ev('window.deadzone.scene.scene.pause()');
  const body='window.__render.bosses.views.get(window.warden.id).body';
  await check(`${body}.visible&&${body}.texture.key==='warden'&&${body}.frame.name==='boss_warden_idle_0'&&${body}.frame.width===384`,'Warden renders its dedicated high-resolution art');
  await check(`${body}.texture.source[0].scaleMode===1`,'nearest-neighbor pixel filtering');
  await check(`Math.abs(${body}.displayWidth-window.warden.drawR*2.7)<.01&&window.warden.drawR===156`,'existing giant scale retained');
  await check(`window.__render.bosses.views.get(window.regularBoss.id).body.texture.key==='bosses'`,'regular boss still uses original atlas');
  await shot('warden-lineup');
  for(const [act,pose]of [['chargeWind','windup'],['charging','special'],['stunned','hit']]){
    await ev(`Object.assign(window.warden,{act:${JSON.stringify(act)},actT:.25});window.__render.draw(window.deadzone.scene.state,1,.016)`);
    await check(`${body}.frame.name.startsWith('boss_warden_${pose}_')`,pose+' animation');
  }
  await ev(`Object.assign(window.warden,{act:'',stage:3,cd:{boulder:3}});window.__render.draw(window.deadzone.scene.state,1,.016)`);
  await check(`${body}.frame.name.startsWith('boss_warden_special_')`,'boulder throw animation');
  await shot('warden-attack');
  await ev(`(()=>{const s=window.deadzone.scene.state;s.events=[];window.deadzone.sim.zombies.damage(s,window.warden,1e9,0);for(const e of s.events)window.__render.onEvent(e,s);window.__render.draw(s,1,.016)})()`);
  await check(`window.__render.fx.dying.some(d=>d.on&&d.atlas==='warden'&&Math.abs(d.sc-window.warden.drawR*2.7/384)<.001)`,'death animation preserves giant scale');
  await ev('for(let i=0;i<40;i++)window.__render.draw(window.deadzone.scene.state,1,1/60)');
  await check(`window.__render.fx.corpses.items.some(d=>d.on&&d.img.texture.key==='warden'&&d.img.frame.name==='boss_warden_death_2'&&Math.abs(d.img.displayWidth-window.warden.drawR*2.7)<.01)`,'matching full-size corpse');
  await shot('warden-death');
  await check(`window.deadzone.sim.bosses.BOSS_IDS.length===5&&!window.deadzone.sim.bosses.BOSS_IDS.includes('warden')`,'Arcade boss roster unchanged');
  writeFileSync(join(out,'console.json'),JSON.stringify(logs,null,2));
  if(logs.length)throw new Error(logs.join('\n'));
  console.log('Warden artwork browser checks passed.');
}finally{socket?.close();child.kill();}

