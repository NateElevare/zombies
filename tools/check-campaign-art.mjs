// Browser verification against the real game; isolated temporary browser profile.
import { spawn } from 'node:child_process';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
const url=process.argv[2]||'http://127.0.0.1:5175/',out='tools/out/campaign-art',port=9700+Math.floor(Math.random()*200);
const exe=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if(!exe)throw new Error('No test browser');mkdirSync(out,{recursive:true});
const child=spawn(exe,['--headless=new',`--remote-debugging-port=${port}`,'--window-size=1600,1000',`--user-data-dir=${process.env.TEMP}/deadzone-campaign-art-${Date.now()}`,'--no-first-run','--ignore-gpu-blocklist','about:blank'],{stdio:'ignore',windowsHide:true});
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
  await ev(`window.deadzone.scene.api.newSurvival('responder',true)`);
  await ev(`(()=>{const s=window.deadzone.scene.state,p=s.player,c=s.campaign;s.paused=true;s.zombies=[];s.clock.t=90;p.x=p.prevX=8090;p.y=p.prevY=14140;p.flashlight=false;
    const looks=['mara','eli','june','ruth',...Array.from({length:6},(_,i)=>'resident'+i)];
    c.residents=looks.map((look,i)=>({...c.residents[0],id:look,look,name:look,x:p.x+(i%5-2)*105,y:p.y+(i<5?-100:80),home:true,moving:false,following:false,angle:0}));
    c.done=['medicine','june'];window.__render.draw(s,1,.016);
  })()`);await delay(6000);await shot('survivor-lineup');
  await check(`window.__render.campaign.people.items.filter(p=>p.visible).length===10`,'all ten survivors render');
  await check(`window.__render.campaign.people.items.filter(p=>p.visible).every(p=>p.texture.key==='campaign_people'&&p.frame.name!=='__BASE'&&p.scaleX===.5&&p.texture.source[0].scaleMode===1)`,'authored frames, player scale and nearest filtering');
  await ev(`(()=>{const s=window.deadzone.scene.state;s.campaign.residents.forEach(r=>r.moving=true);s.time=.2;window.__render.draw(s,1,.016);})()`);
  await check(`window.__render.campaign.people.items.filter(p=>p.visible).every(p=>p.frame.name.includes('_walk_'))`,'all survivors have walking art');
  await shot('survivor-walking');
  await ev(`(()=>{const s=window.deadzone.scene.state,h=window.deadzone.sim.campaign.sites(s).haven;s.campaign.done=window.deadzone.sim.campaign.OBJECTIVES.map(o=>o.id);s.campaign.fuel=1000;s.campaign.chapter=6;s.player.x=s.player.prevX=h.x;s.player.y=s.player.prevY=h.y-110;s.clock.t=90;})()`);await shot('haven-upgraded');
  await check(`window.__render.campaign.props.items.filter(p=>p.visible).every(p=>p.frame.name!=='__BASE'&&Math.abs(p.scaleX-p.scaleY)<.00001)`,'all upgraded props use real frames without stretching');
  await ev(`window.deadzone.sim.campaign.open(window.deadzone.scene.state)`);await shot('journal');
  await ev(`Array.from(document.querySelectorAll('.campaign-tabs button')).find(b=>b.textContent==='Community').click()`);await shot('community');
  await check(`Array.from(document.querySelectorAll('.campaign-overlay img')).every(i=>i.complete&&i.naturalWidth>0)`,'community portraits load');
  await ev(`(()=>{const s=window.deadzone.scene.state,h=window.deadzone.sim.campaign.sites(s).hospital.rect,p=s.player;s.ui=null;p.x=p.prevX=h.x+200;p.y=p.prevY=h.y+180;p.flashlight=true;p.angle=p.prevAngle=Math.atan2(-90,-105);})()`);await shot('hospital-prop-scale');
  await check(`window.__render.campaign.props.items.filter(p=>p.visible&&p.frame.name==='gurney_0').some(p=>p.displayWidth<=72&&p.displayHeight<=44)`,'hospital gurney uses its furniture-sized footprint');
  await ev(`window.deadzone.scene.api.newArcade('responder')`);await shot('arcade');
  await check(`window.__render.campaign.people.items.every(p=>!p.visible)&&window.__render.campaign.props.items.every(p=>!p.visible)`,'campaign art clears in Arcade');
  writeFileSync(join(out,'console.json'),JSON.stringify(logs,null,2));if(logs.length)throw new Error(logs.join('\n'));
  console.log('Campaign art browser checks passed.');
}finally{socket?.close();child.kill();}

