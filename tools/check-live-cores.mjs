// Browser verification against the real game; isolated temporary browser profile.
import { spawn } from 'node:child_process';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
const url=process.argv[2]||'http://127.0.0.1:5182/',out='tools/out/live-cores',port=9700+Math.floor(Math.random()*200);
const exe=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if(!exe)throw new Error('No test browser');mkdirSync(out,{recursive:true});
const child=spawn(exe,['--headless=new',`--remote-debugging-port=${port}`,'--window-size=1600,1000',`--user-data-dir=${process.env.TEMP}/deadzone-live-cores-${Date.now()}`,'--no-first-run','--ignore-gpu-blocklist','about:blank'],{stdio:'ignore',windowsHide:true});
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
  await ev(`(async()=>{
    localStorage.removeItem('deadzone_arcade_augments');
    window.deadzone.scene.api.newArcade('survivor');
    const s=window.deadzone.scene.state;s.dev={god:true,freeze:false,timeScale:1};s.arcade.toSpawn=1;s.arcade.spawnTimer=999;
    const arcade=await import('/src/sim/arcade.ts');const boss=arcade.devBoss(s);
    window.deadzone.sim.zombies.damage(s,boss,1e9,0);
  })()`);
  await delay(700);
  await check(`window.deadzone.scene.state.screen==='playing'&&JSON.parse(localStorage.getItem('deadzone_arcade_augments')).cores>=25`,'boss cores are available before the run ends');
  await ev(`(async()=>{const u=await import('/src/sim/upgrades.ts');for(let i=0;i<100&&window.deadzone.scene.state.ui==='levelup';i++)u.choose(window.deadzone.scene.state,0)})()`);
  await delay(350);
  await check(`document.querySelector('.a-sub').textContent.includes('CORES')`,'HUD shows the live core bank');
  await shot('live-core-bank');
  const before=await ev(`JSON.parse(localStorage.getItem('deadzone_arcade_augments')).cores`);
  await key('KeyK','k',75);
  await check(`window.deadzone.scene.state.ui==='tech'&&!document.querySelector('.techdet button').disabled`,'K can spend cores earned in this fight');
  await click('.techdet button','UNLOCK');
  await check(`window.deadzone.scene.state.player.tech.handgun_dmg1&&JSON.parse(localStorage.getItem('deadzone_arcade_augments')).cores===${before-25}`,'mid-fight purchase saved without ending the run');
  await shot('live-core-purchase');
  await key('KeyK','k',75);
  await ev('window.deadzone.scene.state.player.hp=0');
  await delay(450);
  await check(`window.deadzone.scene.state.screen==='dead'&&JSON.parse(localStorage.getItem('deadzone_arcade_augments')).cores===${before-25}`,'death does not repay already spent cores');
  await check(`window.deadzone.scene.state.arcade.coresEarned===${before}`,'results retain total earnings including spent cores');
  writeFileSync(join(out,'console.json'),JSON.stringify(logs,null,2));
  if(logs.length)throw new Error(logs.join('\n'));
  console.log('Live core browser checks passed.');
}finally{socket?.close();child.kill();}
