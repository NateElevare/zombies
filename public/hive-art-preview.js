const $=id=>document.getElementById(id),canvas=$('stage'),ctx=canvas.getContext('2d'),atlas={};
let manifest,animation,actor,elapsed=0,playing=true,last=performance.now();
async function json(url){const r=await fetch(url);if(!r.ok)throw Error(`${url}: ${r.status}`);return r.json();}
async function img(url){const i=new Image();i.src=url;await i.decode();return i;}
function drawFrame(g,atlasId,name,x,y,scale=1,angle=0){const a=atlas[atlasId],f=a.data.frames[name].frame;g.save();g.translate(x,y);g.rotate(angle);g.imageSmoothingEnabled=false;g.drawImage(a.image,f.x,f.y,f.w,f.h,-f.w*scale/2,-f.h*scale/2,f.w*scale,f.h*scale);g.restore();}
function selectPose(){animation=manifest.anims.find(a=>a.key===actor.animations[$('pose').value]);elapsed=0;$('frame').max=animation.frames.length-1;$('frame').value=0;draw();}
function selectCreature(){actor=manifest.creatures[$('creature').value];$('pose').replaceChildren(...Object.keys(actor.animations).map(id=>new Option(id,id)));selectPose();$('caption').textContent=`${actor.name} · ${actor.frameSize} × ${actor.frameSize} atlas cells · facing right at 0°`;}
function draw(){if(!animation)return;const bg=$('bg').value;ctx.fillStyle=bg==='light'?'#d3d2c1':bg==='dark'?'#10130f':'#293025';ctx.fillRect(0,0,900,700);if(bg==='grid'){ctx.strokeStyle='#394332';ctx.beginPath();for(let x=0;x<=900;x+=50){ctx.moveTo(x,0);ctx.lineTo(x,700);}for(let y=0;y<=700;y+=50){ctx.moveTo(0,y);ctx.lineTo(900,y);}ctx.stroke();}const frame=+$('frame').value;drawFrame(ctx,animation.atlas,animation.frames[frame],450,350,+$('zoom').value,+$('angle').value*Math.PI/180);$('frameLabel').textContent=`${frame+1} / ${animation.frames.length}`;$('angleLabel').textContent=$('angle').value+'°';}
function tick(now){const dt=Math.min((now-last)/1000,.1);last=now;if(playing&&animation){elapsed+=dt*+$('speed').value;$('frame').value=Math.floor(elapsed*animation.frameRate)%animation.frames.length;}draw();requestAnimationFrame(tick);}
try{
 manifest=await json('assets/hive-art.json');
 await Promise.all(manifest.atlases.map(async id=>{const [data,image]=await Promise.all([json(`assets/${id}.json`),img(`assets/${id}.png`)]);atlas[id]={data,image};}));
 for(const[id,a]of Object.entries(manifest.creatures))$('creature').add(new Option(`${a.kind==='boss'?'Boss · ':''}${a.name}`,id));
 selectCreature();$('creature').onchange=selectCreature;$('pose').onchange=selectPose;
 $('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play';};
 $('restart').onclick=()=>{elapsed=0;$('frame').value=0;};
 $('frame').oninput=()=>{playing=false;$('play').textContent='Play';elapsed=+$('frame').value/animation.frameRate;draw();};
 for(const id of ['angle','zoom','bg'])$(id).oninput=draw;
 for(const[id,url]of Object.entries(manifest.icons)){
  const card=document.createElement('div');card.className='card';const icon=await img(url);icon.alt=id.replaceAll('_',' ');card.append(icon);
  const label=document.createElement('div');label.textContent=manifest.weapons[id]?.name||id.replaceAll('_',' ');card.append(label);
  const w=manifest.weapons[id];if(w){const c=document.createElement('canvas');c.width=320;c.height=120;drawFrame(c.getContext('2d'),w.atlas,w.frame,160,60,2);card.append(c);}
  $('items').append(card);
 }
 $('status').textContent=`${Object.keys(manifest.creatures).length} creature sheets · ${manifest.anims.length} animations · ${Object.keys(manifest.frames).length} frames`;
 window.hivePreview={manifest,atlas};requestAnimationFrame(tick);
}catch(e){$('error').textContent='Could not load art: '+e.message;console.error(e);}
