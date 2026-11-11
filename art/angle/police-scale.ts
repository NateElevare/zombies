// Repack police views from the original source, excluding neighboring-cell specks.
// The full story-pack importer applies the same 4% connected-component cleanup.
import {loadImage} from '@napi-rs/canvas';
import {readFileSync,writeFileSync} from 'node:fs';
import {canvas,packAtlas,contactSheet,type Frame} from '../lib/core';
const source='art/angle/source/story-v1/car-police-clean.png',out='public/assets',key='story_car_police';
const im=await loadImage(source),frames:Frame[]=[],bounds=new Map<string,{x:number;y:number;w:number;h:number}>();
for(let row=0;row<2;row++)for(let col=0;col<4;col++){
 const x=Math.round(col*im.width/4),y=Math.round(row*im.height/2),w=Math.round((col+1)*im.width/4)-x,h=Math.round((row+1)*im.height/2)-y,c=canvas(w,h);
 c.g.drawImage(im,x,y,w,h,0,0,w,h);
 const data=c.g.getImageData(0,0,w,h),p=data.data,seen=new Uint8Array(w*h),groups:number[][]=[];
 for(let n=0;n<w*h;n++){
  if(seen[n]||p[n*4+3]<8)continue;const q=[n];seen[n]=1;
  for(let i=0;i<q.length;i++){const k=q[i],xx=k%w,yy=Math.floor(k/w);for(const v of[xx>0?k-1:-1,xx<w-1?k+1:-1,yy>0?k-w:-1,yy<h-1?k+w:-1])if(v>=0&&!seen[v]&&p[v*4+3]>=8){seen[v]=1;q.push(v);}}
  groups.push(q);
 }
 const largest=Math.max(...groups.map(g=>g.length));for(const group of groups)if(group.length<largest*.04)for(const k of group)p[k*4+3]=0;
 c.g.putImageData(data,0,0);
 let l=w,t=h,r=0,b=0;for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(p[(yy*w+xx)*4+3]>127){l=Math.min(l,xx);t=Math.min(t,yy);r=Math.max(r,xx);b=Math.max(b,yy);}
 const scale=220/Math.max(r-l+1,b-t+1),full=canvas(256,256);full.g.imageSmoothingEnabled=false;
 full.g.drawImage(c.c,Math.round(128-(l+(r-l+1)/2)*scale),Math.round(224-(b+1)*scale),Math.round(w*scale),Math.round(h*scale));
 const name=`story_car_police${row?'_wreck':''}_${col}`;frames.push({name,canvas:full.c});
}
const trimmed=frames.map(f=>{
 const p=f.canvas.getContext('2d').getImageData(0,0,256,256).data;let l=256,t=256,r=0,b=0;
 for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(p[(y*256+x)*4+3]>=8){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}
 const box={x:l,y:t,w:r-l+1,h:b-t+1},c=canvas(box.w,box.h);c.g.drawImage(f.canvas,l,t,box.w,box.h,0,0,box.w,box.h);bounds.set(f.name,box);return{name:f.name,canvas:c.c};
});
packAtlas(key,trimmed);
const json=JSON.parse(readFileSync(`${out}/${key}.json`,'utf8')),manifest=JSON.parse(readFileSync(`${out}/story-art.json`,'utf8'));
for(const f of frames){const box=bounds.get(f.name)!;Object.assign(json.frames[f.name],{trimmed:true,spriteSourceSize:box,sourceSize:{w:256,h:256}});manifest.frames[f.name]={atlas:key,bounds:box};}
writeFileSync(`${out}/${key}.json`,JSON.stringify(json));writeFileSync(`${out}/story-art.json`,JSON.stringify(manifest));
contactSheet('art/preview/story-car-police.png',frames,4,'#3f4942');
console.log('Repacked all eight police-car views from the clean source.');
