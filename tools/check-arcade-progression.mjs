// Browser verification against the real game; isolated temporary browser profile.
import { spawn } from 'node:child_process';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
const url=process.argv[2]||'http://127.0.0.1:5182/',out='tools/out/arcade-progression',port=9700+Math.floor(Math.random()*200);
const exe=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if(!exe)throw new Error('No test browser');mkdirSync(out,{recursive:true});
const child=spawn(exe,['--headless=new',`--remote-debugging-port=${port}`,'--window-size=1600,1000',`--user-data-dir=${process.env.TEMP}/deadzone-arcade-progression-${Date.now()}`,'--no-first-run','--ignore-gpu-blocklist','about:blank'],{stdio:'ignore',windowsHide:true});
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
  const key=async(code,key,vk)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',code,key,windowsVirtualKeyCode:vk});await send('Input.dispatchKeyEvent',{type:'keyUp',code,key,windowsVirtualKeyCode:vk});await delay(150);};
  const click=async(selector,label)=>ev(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing button: '+${JSON.stringify(label)});b.click()})()`);
  await ev(`localStorage.setItem('deadzone_arcade_augments',JSON.stringify({cores:3000,earned:3000,lv:{}}));window.deadzone.scene.api.newArcade('survivor')`);
  await delay(600);await key('KeyK','k',75);
  await check(`window.deadzone.scene.state.ui==='tech'&&document.querySelector('.p-tech').textContent.includes('ARCADE SKILLS')&&document.querySelector('.sp').textContent.includes('3000')`,'K opens core-funded permanent skills');
  const tick=await ev('window.deadzone.scene.state.tick');await delay(400);
  await check(`window.deadzone.scene.state.tick===${tick}`,'upgrade screen pauses gameplay');
  await click('.techdet button','UNLOCK');
  await check(`window.deadzone.scene.state.player.tech.handgun_dmg1&&JSON.parse(localStorage.getItem('deadzone_arcade_augments')).cores===2975`,'skill purchase spends cores and saves immediately');
  await shot('permanent-skills');
  await click('.arcade-skill-note button','CORE AUGMENTS & LOADOUT');
  await check(`document.querySelectorAll('.aug-node').length>=40`,'expanded core catalog is available from K');
  await key('KeyK','k',75);
  await check(`window.deadzone.scene.state.ui==='tech'&&!!document.querySelector('.augs')`,'nested shop blocks gameplay hotkeys');
  await click('.aug-filters button','ARSENAL');
  const buy=async(name)=>ev(`(()=>{const title=[...document.querySelectorAll('.aug-nn')].find(b=>b.textContent===${JSON.stringify(name)});if(!title)throw Error('Missing augment');const b=title.closest('button');if(b.disabled)throw Error('Locked augment');b.click()})()`);
  await buy('Deep Pockets');await buy('Drone Hangar');await click('.aug-loadout button','Drone');
  await buy('Field Kit');await buy('Utility Harness');await buy('Adaptive Rig');
  await check(`JSON.parse(localStorage.getItem('deadzone_arcade_augments')).starter==='drone'&&window.deadzone.scene.state.arcade.run.gadgets.length===0`,'loadout saves for next run without changing the current build');
  await shot('arsenal-unlocks');
  await click('.aug-filters button','ALL BRANCHES');await shot('all-core-branches');
  await key('Escape','Escape',27);
  await check(`!document.querySelector('.augs')&&window.deadzone.scene.state.ui==='tech'`,'Escape returns from augments to skills');
  await key('KeyK','k',75);
  await check(`window.deadzone.scene.state.ui===null`,'K closes skills and resumes');
  await send('Page.reload');
  await delay(800);
  for(let i=0;i<120;i++){if(await ev('!!window.deadzone?.scene?.api').catch(()=>false))break;await delay(250);}
  await ev("window.deadzone.scene.api.newArcade('survivor')");
  await delay(600);
  await check(`window.deadzone.scene.state.player.tech.handgun_dmg1&&window.deadzone.scene.state.arcade.run.gadgets[0].id==='drone'&&window.deadzone.scene.state.arcade.run.aug.gadgetSlots===1`,'skills and loadout survive a full page reload and new run');
  await key('KeyK','k',75);await shot('skills-after-reload');
  // Fit the shop to a smaller viewport as well.
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:720,deviceScaleFactor:1,mobile:false});
  await click('.arcade-skill-note button','CORE AUGMENTS & LOADOUT');
  await shot('shop-small-viewport');
  await check(`(()=>{const r=document.querySelector('.aug-panel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`,'shop remains inside the smaller viewport');
  await key('Escape','Escape',27);await key('KeyK','k',75);
  await ev("window.deadzone.scene.api.newRoad('survivor')");
  await check(`!window.deadzone.scene.state.player.tech.handgun_dmg1`,'Arcade unlocks do not leak into a new story');
  writeFileSync(join(out,'console.json'),JSON.stringify(logs,null,2));
  if(logs.length)throw new Error(logs.join('\n'));
  console.log('Arcade progression browser checks passed.');
}finally{socket?.close();child.kill();}
