import {loadImage} from '@napi-rs/canvas';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {canvas,packAtlas,contactSheet,type Frame} from '../lib/core';
const root='art/angle/source/story-v1',out='public/assets',key='story_props_1';
function bounds(c:Frame['canvas']){const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let x=c.width,y=c.height,r=-1,b=-1;for(let j=0;j<c.height;j++)for(let i=0;i<c.width;i++)if(p[(j*c.width+i)*4+3]>16){x=Math.min(x,i);y=Math.min(y,j);r=Math.max(r,i);b=Math.max(b,j);}return{x,y,w:r-x+1,h:b-y+1};}
export async function buildStoryDesks(){
 const source=`${root}/desks-v2.png`;if(!existsSync(source))return;
 const im=await loadImage(source),old=await loadImage(`${out}/${key}.png`),atlas=JSON.parse(readFileSync(`${out}/${key}.json`,'utf8')),manifest=JSON.parse(readFileSync(`${out}/story-art.json`,'utf8')),frames:Frame[]=[];
 for(const [name,f] of Object.entries(atlas.frames) as [string,any][]){
  const c=canvas(256,256);
  if(name.startsWith('story_props_desk_')){
   const col=Number(name.at(-1)),x=Math.round(col*im.width/4),w=Math.round((col+1)*im.width/4)-x,cell=canvas(w,im.height);
   cell.g.drawImage(im,x,0,w,im.height,0,0,w,im.height);
   // Generated border debris is outside the isolated object area.
   cell.g.clearRect(0,0,w,Math.floor(im.height*.20));cell.g.clearRect(0,Math.ceil(im.height*.85),w,im.height);
   const b=bounds(cell.c),scale=220/Math.max(b.w,b.h);c.g.imageSmoothingEnabled=false;
   c.g.drawImage(cell.c,b.x,b.y,b.w,b.h,Math.round(128-b.w*scale/2),Math.round(224-b.h*scale),Math.round(b.w*scale),Math.round(b.h*scale));
  }else {const r=f.frame,b=f.spriteSourceSize;c.g.drawImage(old,r.x,r.y,r.w,r.h,b.x,b.y,b.w,b.h);}
  frames.push({name,canvas:c.c});
 }
 const boxes=new Map<string,ReturnType<typeof bounds>>();packAtlas(key,frames.map(f=>{const b=bounds(f.canvas),c=canvas(b.w,b.h);c.g.drawImage(f.canvas,b.x,b.y,b.w,b.h,0,0,b.w,b.h);boxes.set(f.name,b);return{name:f.name,canvas:c.c};}));
 const json=JSON.parse(readFileSync(`${out}/${key}.json`,'utf8'));
 for(const f of frames){const b=boxes.get(f.name)!;Object.assign(json.frames[f.name],{trimmed:true,spriteSourceSize:b,sourceSize:{w:256,h:256}});manifest.frames[f.name]={atlas:key,bounds:b};}
 if(!manifest.sources.includes(source))manifest.sources.push(source);
 writeFileSync(`${out}/${key}.json`,JSON.stringify(json));writeFileSync(`${out}/story-art.json`,JSON.stringify(manifest));
 contactSheet('art/preview/story-desks-v2.png',frames.filter(f=>f.name.startsWith('story_props_desk_')),4,'#3f4942');
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/story-desks.ts'))await buildStoryDesks();
