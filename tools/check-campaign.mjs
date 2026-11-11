// Browser verification against the real game; isolated temporary browser profile.
import { spawn } from 'node:child_process';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
const url=process.argv[2]||'http://127.0.0.1:5175/',out='tools/out/campaign',port=9700+Math.floor(Math.random()*200);
const exe=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if(!exe)throw new Error('No test browser');mkdirSync(out,{recursive:true});
const child=spawn(exe,['--headless=new',`--remote-debugging-port=${port}`,'--window-size=1600,1000',`--user-data-dir=${process.env.TEMP}/deadzone-campaign-${Date.now()}`,'--no-first-run','--ignore-gpu-blocklist','about:blank'],{stdio:'ignore',windowsHide:true});
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
  console.log(await ev(`(async()=>{const sc=window.deadzone.scene;await sc.api.newSurvival('survivor',true);const s=sc.state;s.dev={god:true,freeze:true,timeScale:1};s.clock.t=90;return {campaign:!!s.campaign,legacy:s.legacyStory};})()`));
  await shot('haven-exterior');
  await ev(`(()=>{const s=window.deadzone.scene.state,h=window.deadzone.sim.campaign.sites(s).haven;s.player.x=s.player.prevX=h.x;s.player.y=s.player.prevY=h.y-150;})()`);await delay(700);await shot('haven-interior');
  await ev(`window.deadzone.sim.campaign.open(window.deadzone.scene.state)`);await shot('journal');
  console.log(await ev(`(()=>{const s=window.deadzone.scene.state,c=window.deadzone.sim.campaign;return {objectives:c.available(s).map(o=>o.id),journal:document.querySelector('.campaign-overlay').className};})()`));
  await ev(`document.querySelector('.campaign-objective .campaign-actions button:last-child').click()`);await delay(150);
  if(!await ev(`window.deadzone.scene.state.campaign.done.includes('meet')`))throw new Error('Journal action did not complete the conversation');
  await ev(`document.querySelector('.campaign-objective .campaign-actions button:last-child').click()`);await delay(200);
  if(!await ev(`window.deadzone.scene.state.campaign.encounter?.id==='clear'&&window.deadzone.scene.state.ui===null`))throw new Error('Defense action did not resume gameplay');
  await shot('first-defense');
  await ev(`(()=>{const sc=window.deadzone.scene,s=sc.state,c=window.deadzone.sim.campaign;s.ui=null;s.campaign.encounter=null;s.zombies=[];s.campaign.done=c.OBJECTIVES.filter(o=>o.chapter<=3).map(o=>o.id);s.campaign.chapter=4;s.campaign.tracked='signal';s.campaign.fuel=1000;s.clock.t=460;})()`);await shot('haven-powered-night');
  await ev(`(()=>{const s=window.deadzone.scene.state,c=window.deadzone.sim.campaign,h=c.sites(s).haven;s.player.x=h.x;s.player.y=h.y;c.open(s);})()`);await shot('radio-objective');
  await send('Emulation.setDeviceMetricsOverride',{width:640,height:900,deviceScaleFactor:1,mobile:true});await shot('journal-mobile');
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await ev(`(()=>{const s=window.deadzone.scene.state;s.ui=null;s.player.x=s.player.prevX=8380;s.player.y=s.player.prevY=850;s.clock.t=90;})()`);await delay(900);await shot('north-ridge');
  await ev(`window.deadzone.scene.api.newArcade()`);await shot('arcade-unaffected');
  const isolation=await ev(`({campaign:!!window.deadzone.scene.state.campaign,trackerHidden:document.querySelector('.campaign-tracker').classList.contains('hidden'),journalHidden:document.querySelector('.campaign-overlay').classList.contains('hidden')})`);console.log(isolation);
  writeFileSync(join(out,'console.json'),JSON.stringify(logs,null,2));if(logs.length)throw new Error(logs.join('\n'));
  if(isolation.campaign||!isolation.trackerHidden||!isolation.journalHidden)throw new Error('Campaign leaked into arcade');
  console.log('Campaign browser checks passed.');
}finally{socket?.close();child.kill();}
