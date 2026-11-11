// Browser verification against the real game; isolated temporary browser profile.
import { spawn } from 'node:child_process';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
const url=process.argv[2]||'http://127.0.0.1:5175/',out='tools/out/boss-render',port=9700+Math.floor(Math.random()*200);
const exe=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if(!exe)throw new Error('No test browser');mkdirSync(out,{recursive:true});
const child=spawn(exe,['--headless=new',`--remote-debugging-port=${port}`,'--window-size=1600,1000',`--user-data-dir=${process.env.TEMP}/deadzone-boss-render-${Date.now()}`,'--no-first-run','--ignore-gpu-blocklist','about:blank'],{stdio:'ignore',windowsHide:true});
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
  // Exercise the real renderer and atlas in each camera, including mode switches.
  for(const mode of ['legacy','angled','arcade','legacy']){
    await ev('window.deadzone.scene.scene.resume()');
    await ev(mode==='arcade' ? 'window.deadzone.scene.api.newArcade()' : `window.deadzone.scene.api.newSurvival('survivor',${mode==='legacy'})`);
    await ev(`(()=>{
      const sc=window.deadzone.scene,s=sc.state,p=s.player,b=window.deadzone.sim.bosses;
      s.paused=true;s.zombies=[];s.clock.t=90;s.shake=0;
      // Place the lineup in the open approach to Haven, clear of roofs and trees.
      if(!s.arcade){p.x=p.prevX=8000;p.y=p.prevY=14220;}
      window.testBosses=b.BOSS_IDS.map((id,i)=>{
        const z=b.spawnBossOf(s,id,0,p.x+(i-2)*140,p.y-130,1,s.arcade?{}:{maxR:26});
        Object.assign(z,{angle:0,prevAngle:0,attackT:10,hitFlash:0,act:'',cd:{},state:'chase'});return z;
      });
      s.time=.3;window.__render.draw(s,1,.016);
    })()`);
    await delay(700);
    await ev('window.deadzone.scene.scene.pause()');
    const bodies=mode==='angled' ? 'Array.from(window.__render.story.bossFx.bodies.values()).map(v=>v.img)' : 'Array.from(window.__render.bosses.views.values()).map(v=>v.body)';
    await check(`${bodies}.length===5&&${bodies}.every(b=>b.visible&&b.alpha>0&&b.texture.key==='bosses'&&b.frame.name.includes('_idle_')&&b.displayWidth>40)`,mode+' renders all five boss bodies');
    if(mode==='angled')await check('window.__render.bosses.views.size===0','angled camera has no duplicate overhead bosses');
    for(const [act,pose] of [['chargeWind','windup'],['charging','special'],['stunned','hit']]){
      await ev(`window.testBosses.forEach(z=>Object.assign(z,{act:${JSON.stringify(act)},actT:.25}));window.__render.draw(window.deadzone.scene.state,1,.016)`);
      await check(`${bodies}.every(b=>b.frame.name.includes('_${pose}_'))`,mode+' '+pose+' frames');
    }
    await ev(`(()=>{const s=window.deadzone.scene.state,p=s.player,f=window.deadzone.sim.bosses.fx(s);
      window.testBosses.forEach(z=>Object.assign(z,{act:'',cd:{}}));
      f.pools=[{kind:'acid',x:p.x-220,y:p.y+90,r:55,life:3,max:6}];
      f.tele=[{kind:'circle',x:p.x+160,y:p.y+80,r:70,t:.4,T:1,color:'#ffb43a'}];
      f.rings=[{x:p.x,y:p.y,r:90,maxR:340,width:26,color:'#7cc8ff'}];
      f.shots=[{kind:'spit',x:p.x+160,y:p.y+110,prevX:p.x+160,prevY:p.y+110,r:9,vx:100,vy:0}];
      window.__render.draw(s,1,.016);
    })()`);
    const renderer=mode==='angled'?'window.__render.story.bossFx':'window.__render.bosses';
    await check(`${renderer}.ground.commandBuffer.length>0&&${renderer}.air.commandBuffer.length>0`,mode+' draws ground warnings and airborne attacks');
    await shot(mode+'-bosses');
    if(mode!=='angled'){
      await ev(`(()=>{const s=window.deadzone.scene.state;s.events=[];for(const z of window.testBosses)window.deadzone.sim.zombies.damage(s,z,1e9,0);for(const e of s.events)window.__render.onEvent(e,s);window.__render.draw(s,1,.016)})()`);
      await check('window.__render.fx.dying.filter(d=>d.on&&d.atlas==="bosses").length===5',mode+' plays boss death animations');
      await ev('for(let i=0;i<40;i++)window.__render.draw(window.deadzone.scene.state,1,1/60)');
      await check('window.__render.fx.corpses.items.filter(d=>d.on&&d.img.texture.key==="bosses"&&d.img.frame.name.endsWith("_death_2")).length===5',mode+' leaves matching boss corpses');
    }
  }
  writeFileSync(join(out,'console.json'),JSON.stringify(logs,null,2));
  if(logs.length)throw new Error(logs.join('\n'));
  console.log('Boss rendering browser checks passed.');
}finally{socket?.close();child.kill();}

