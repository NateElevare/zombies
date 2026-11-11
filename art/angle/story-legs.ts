// Import generated gait sheets, registering the waistband instead of the boot bounds.
import {loadImage} from '@napi-rs/canvas';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {canvas,packAtlas,contactSheet,type Frame} from '../lib/core';
import {SPRITE_DIRECTIONS} from '../../src/angle-lab/sprite-set';
const root='art/angle/source/story-v1',out='public/assets';
type Box={x:number;y:number;w:number;h:number};
function box(c:ReturnType<typeof canvas>['c']):Box{
 const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let l=c.width,t=c.height,r=0,b=0;
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]>16){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}
 return{x:l,y:t,w:r-l+1,h:b-t+1};
}
export async function buildStoryLegs(){
 if(!['walk','run','strafe'].every(p=>existsSync(`${root}/legs-v2-${p}.png`)))return;
 const frames:Frame[]=[],registration:any={version:2,hip:{x:128,y:134},gaits:{}};
 for(const gait of ['walk','run','strafe']){
  const im=await loadImage(`${root}/legs-v2-${gait}.png`),cells=[];
  for(let row=0;row<5;row++)for(let col=0;col<8;col++){
   const x=Math.round(col*im.width/8),y=Math.round(row*im.height/5),w=Math.round((col+1)*im.width/8)-x,h=Math.round((row+1)*im.height/5)-y;
   const c=canvas(w,h);c.g.drawImage(im,x,y,w,h,0,0,w,h);cells.push(c);
  }
  for(let row=0;row<5;row++){
   const scale=90/box(cells[row*8].c).h;
   for(let i=0;i<8;i++){
    const cell=cells[row*8+i],b=box(cell.c),data=cell.g.getImageData(0,0,cell.c.width,cell.c.height).data;
    let left=cell.c.width,right=0;
    for(let y=b.y;y<b.y+Math.max(3,Math.floor(b.h*.08));y++)for(let x=0;x<cell.c.width;x++)if(data[(y*cell.c.width+x)*4+3]>127){left=Math.min(left,x);right=Math.max(right,x);}
    const hipX=(left+right)/2,c=canvas(256,256);c.g.imageSmoothingEnabled=false;
    c.g.drawImage(cell.c,Math.round(128-hipX*scale),Math.round(134-b.y*scale),Math.round(cell.c.width*scale),Math.round(cell.c.height*scale));
    const dir=SPRITE_DIRECTIONS[row],add=(pose:string,n:number)=>frames.push({name:`story_legs_${dir}_${pose}_${n}`,canvas:c.c});
    if(gait==='walk'){add('walk',i);add('backpedal',(8-i)%8);if(i===2||i===6)add('idle',i===2?0:1);}
    else if(gait==='run')add('run',i);
    else {add('strafe_left',i);add('strafe_right',(8-i)%8);}
    registration.gaits[`${gait}_${dir}_${i}`]={sourceHip:{x:hipX,y:b.y},scale};
   }
  }
 }
 const bounds=new Map<string,Box>(),trimmed=frames.map(f=>{const b=box(f.canvas),c=canvas(b.w,b.h);c.g.drawImage(f.canvas,b.x,b.y,b.w,b.h,0,0,b.w,b.h);bounds.set(f.name,b);return{name:f.name,canvas:c.c};});
 packAtlas('story_legs',trimmed);
 const atlasPath=`${out}/story_legs.json`,atlas=JSON.parse(readFileSync(atlasPath,'utf8')),manifestPath=`${out}/story-art.json`,manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
 for(const name of Object.keys(manifest.frames))if(name.startsWith('story_legs_'))delete manifest.frames[name];
 for(const f of frames){const b=bounds.get(f.name)!;Object.assign(atlas.frames[f.name],{trimmed:true,spriteSourceSize:b,sourceSize:{w:256,h:256}});manifest.frames[f.name]={atlas:'story_legs',bounds:b};}
 manifest.locomotion={version:2,frames:8,hip:{x:128,y:134}};
 for(const pose of ['walk','run','strafe']){const source=`${root}/legs-v2-${pose}.png`;if(!manifest.sources.includes(source))manifest.sources.push(source);}
 writeFileSync(atlasPath,JSON.stringify(atlas));writeFileSync(manifestPath,JSON.stringify(manifest));writeFileSync(`${root}/legs-v2-registration.json`,JSON.stringify(registration,null,2));
 contactSheet('art/preview/story-legs-v2.png',frames.filter(f=>f.name.includes('_e_walk_')||f.name.includes('_se_walk_')||f.name.includes('_e_run_')||f.name.includes('_e_strafe_left_')),8,'#354038');
 console.log('Hip-registered player locomotion:',frames.length,'frames');
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/story-legs.ts'))await buildStoryLegs();
