// Browser verification against the real game; isolated temporary browser profile.
import { spawn } from 'node:child_process';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
const url=process.argv[2]||'http://127.0.0.1:5175/',out='tools/out/zombie-climb',port=9700+Math.floor(Math.random()*200);
const exe=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if(!exe)throw new Error('No test browser');mkdirSync(out,{recursive:true});
const child=spawn(exe,['--headless=new',`--remote-debugging-port=${port}`,'--window-size=1600,1000',`--user-data-dir=${process.env.TEMP}/deadzone-climb-${Date.now()}`,'--no-first-run','--ignore-gpu-blocklist','about:blank'],{stdio:'ignore',windowsHide:true});
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
    const sc=window.deadzone.scene;sc.api.newRoad('responder');const s=sc.state,p=s.player,c=window.deadzone.sim.road.campOf(s,0);
    s.ui=null;s.paused=true;s.zombies=[];s.clock.t=90;s.shake=0;p.x=p.prevX=c.x-600;p.y=p.prevY=c.y+165;
    window.climbers=[];let i=0;
    for(const [type,n]of Object.entries(window.deadzone.sim.zombies.VARIANTS))for(let variant=0;variant<n;variant++){
      const z=window.deadzone.sim.zombies.spawn(s,type,p.x+(i%5-2)*130,p.y-200+Math.floor(i/5)*130);z.variant=variant;
      z.windowClimb={x:z.x,y:z.y,axis:'x',direction:1,progress:.1};z.attackT=10;z.vx=0;z.vy=0;
      window.climbers.push(z);i++;
    }
    window.__render.draw(s,1,.016);
  })()`);
  await delay(700);await ev('window.deadzone.scene.scene.pause()');
  await check(`window.climbers.every(z=>{const b=window.__render.actors.zv.get(z.id).spr;return b.visible&&b.texture.key==='zombie_climb'&&b.frame.name==='zombie_'+z.type+'_'+z.variant+'_climb_0'})`,'all 13 variants use their own climb artwork');
  await check(`window.deadzone.scene.textures.get('zombie_climb').source[0].scaleMode===1`,'crisp pixel filtering');
  await shot('climb-gallery');
  for(let i=0;i<4;i++){
    await ev(`window.climbers.forEach(z=>z.windowClimb.progress=${(i+.1)/4});window.__render.draw(window.deadzone.scene.state,1,.016)`);
    await check(`window.climbers.every(z=>window.__render.actors.zv.get(z.id).spr.frame.name.endsWith('_climb_${i}'))`,'crossing phase '+i);
  }
  await ev(`window.climbers.forEach(z=>{z.windowClimb=undefined;z.attackT=10});window.__render.draw(window.deadzone.scene.state,1,.016)`);
  await check(`window.climbers.every(z=>{const b=window.__render.actors.zv.get(z.id).spr;return ['zombies','zombies2'].includes(b.texture.key)&&!b.frame.name.includes('_climb_')})`,'all variants return to the original atlas after landing');
  // Exercise an actual intact Haven window, including its broken-pane repaint event.
  await ev(`(()=>{
    const s=window.deadzone.scene.state,site=s.road.world.sites.haven,b=s.buildings.find(b=>b.x===site.x&&b.y===site.y);
    const w=s.grid.query(b.x-4,b.y-4,b.w+8,b.h+8).find(o=>o.kind==='window'&&(o.y<=b.y+2||o.y+o.h>=b.y+b.h-2));
    const north=w.y<=b.y+2,cx=w.x+w.w/2,cy=w.y+w.h/2;
    s.zombies=[];s.player.x=s.player.prevX=cx;s.player.y=s.player.prevY=cy+(north?90:-90);s.dev={timeScale:1,freeze:false,god:true};
    window.pane=w;window.crossing=window.deadzone.sim.zombies.spawn(s,'walker',cx,cy+(north?-65:65));
    window.seenClimb=new Set();window.__render.draw(s,1,.016);
    for(let i=0;i<80;i++)window.__render.draw(s,1,1/60);
  })()`);
  for(let phase=0;phase<4;phase++){
    await ev(`(()=>{const s=window.deadzone.scene.state,z=window.crossing;
      for(let i=0;i<400;i++){
        z.prevX=z.x;z.prevY=z.y;z.prevAngle=z.angle;s.events=[];window.deadzone.sim.zombies.update(s,1/60);
        for(const e of s.events)window.__render.onEvent(e,s);window.__render.draw(s,1,1/60);
        if(z.windowClimb&&Math.floor(z.windowClimb.progress*4)===${phase}){window.seenClimb.add(${phase});break;}
      }
    })()`);
    await check(`window.seenClimb.has(${phase})&&window.__render.actors.zv.get(window.crossing.id).spr.frame.name.endsWith('_climb_${phase}')`,'actual window traversal phase '+phase);
    await shot('window-phase-'+phase);
  }
  await ev(`(()=>{const s=window.deadzone.scene.state,z=window.crossing;for(let i=0;i<180;i++){z.prevX=z.x;z.prevY=z.y;window.deadzone.sim.zombies.update(s,1/60)}window.__render.draw(s,1,.016)})()`);
  await check(`!window.crossing.windowClimb&&window.pane.smashed&&window.pane.blocksBullets===false&&!window.__render.actors.zv.get(window.crossing.id).spr.frame.name.includes('_climb_')`,'clears sill, broken glass remains, normal animation resumes');
  await ev(`(()=>{const s=window.deadzone.scene.state,z=window.crossing;s.mode='arcade';z.windowClimb={axis:'x',direction:1,progress:.5};window.__render.draw(s,1,.016)})()`);
  await check(`!window.__render.actors.zv.get(window.crossing.id).spr.frame.name.includes('_climb_')`,'Arcade never selects climbing art');
  writeFileSync(join(out,'console.json'),JSON.stringify(logs,null,2));
  if(logs.length)throw new Error(logs.join('\n'));
  console.log('Window climbing artwork browser checks passed.');
}finally{socket?.close();child.kill();}
