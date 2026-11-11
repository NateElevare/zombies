// Register generated animation cells, then export matched standard and 256px atlases.
// Source art is retained unchanged. Cropping/scaling here is sprite-atlas preparation.
import { loadImage } from '@napi-rs/canvas';
import { readFileSync,writeFileSync } from 'node:fs';
import { canvas,packAtlas,contactSheet,type Frame } from '../lib/core';
import { SPRITE_DIRECTIONS,SPRITE_SEQUENCES,spriteAtlas,type SpriteActor,type SpriteDetail } from '../../src/angle-lab/sprite-set';

const root='art/angle/source/characters-v3';
const report:any[]=[];
for(const actor of ['responder','zombie'] as SpriteActor[]) {
  const high:Frame[]=[],low:Frame[]=[];
  for(const direction of SPRITE_DIRECTIONS){
    const image=await loadImage(`${root}/${actor}-${direction}.png`),source=canvas(image.width,image.height);source.g.drawImage(image,0,0);
    const pixels=source.g.getImageData(0,0,image.width,image.height).data;
    const solid=(x:number,y:number)=>pixels[(y*image.width+x)*4+3]>127;
    // Generated sheets have slightly unequal row spacing. Find transparent row gutters.
    const bands:{top:number;bottom:number}[]=[];let start=-1;
    for(let y=0;y<image.height;y++){let count=0;for(let x=0;x<image.width;x++)if(solid(x,y))count++;
      if(count>5&&start<0)start=y;else if(count<=5&&start>=0){bands.push({top:start,bottom:y-1});start=-1;}}
    if(start>=0)bands.push({top:start,bottom:image.height-1});
    for(let i=bands.length-1;i>0;i--)if(bands[i].top-bands[i-1].bottom<8){bands[i-1].bottom=bands[i].bottom;bands.splice(i,1);}
    const expected=actor==='zombie'&&direction==='ne'?9:10;
    if(bands.length!==expected)throw Error(`${actor}-${direction}: expected ${expected} rows, saw ${bands.length}`);
    const cells=Array.from({length:bands.length*4},(_,i)=>{
      const row=Math.floor(i/4),col=i%4,x0=Math.round(col*image.width/4),x1=Math.round((col+1)*image.width/4);
      const y0=row===0?0:Math.floor((bands[row-1].bottom+bands[row].top)/2),y1=row===bands.length-1?image.height:Math.floor((bands[row].bottom+bands[row+1].top)/2);
      let left=x1,right=x0,top=y1,bottom=y0;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(solid(x,y)){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      if(right<=left||bottom<=top)throw Error(`Empty ${actor}-${direction} cell ${i}`);
      // Ground anchor = midpoint of the feet, independent of the aiming arms.
      let footL=x1,footR=x0;
      for(let y=Math.max(top,bottom-40);y<=bottom;y++)for(let x=x0;x<x1;x++)if(solid(x,y)){footL=Math.min(footL,x);footR=Math.max(footR,x);}
      return {x0,x1,y0,y1,left,right,top,bottom,footX:(footL+footR)/2,footY:bottom+1};
    });
    const idleHeights=cells.slice(0,actor==='responder'?2:4).map(c=>c.bottom-c.top+1).sort((a,b)=>a-b);
    const scale=185/idleHeights[Math.floor(idleHeights.length/2)];
    for(const [pose,indices] of Object.entries(SPRITE_SEQUENCES[actor]))for(const [i,originalIndex] of indices.entries()){
      let index=originalIndex;
      // In three generated directions the second run row was a repeated claw wind-up.
      // Use the four valid running contacts instead of mixing attack poses into a run.
      if(actor==='zombie'&&['e','se','ne'].includes(direction)&&pose==='run')index=12+i%4;
      if(actor==='zombie'&&direction==='e'&&pose==='hit')index=[28,29,30,24][i];
      if(actor==='zombie'&&direction==='e'&&pose==='death')index=[24,28,29,31,32,33,34,35][i];
      if(actor==='zombie'&&direction==='ne'&&pose==='corpse')index=35; // final settled body in row nine
      const cell=cells[index],f=canvas(256,256),fall=pose==='death'||pose==='corpse';
      const anchorX=fall?(cell.left+cell.right)/2:cell.footX;
      f.g.imageSmoothingEnabled=false;
      f.g.drawImage(image,cell.x0,cell.y0,cell.x1-cell.x0,cell.y1-cell.y0,
        Math.round(128+(cell.x0-anchorX)*scale),Math.round(224+(cell.y0-cell.footY)*scale),Math.round((cell.x1-cell.x0)*scale),Math.round((cell.y1-cell.y0)*scale));
      const name=`lab3_${actor}_${direction}_${pose}_${i}`;high.push({name,canvas:f.c});
      const small=canvas(96,128);small.g.imageSmoothingEnabled=false;small.g.drawImage(f.c,0,8,96,96);low.push({name,canvas:small.c});
    }
    report.push({actor,direction,rows:bands.length,sourceSize:[image.width,image.height],scale});
  }
  for(const [detail,frames]of [['256',high],['standard',low]]as[SpriteDetail,Frame[]][]){
    const metadata=new Map<string,{x:number;y:number;w:number;h:number;sourceW:number;sourceH:number}>();
    const trimmed=frames.map(f=>{const w=f.canvas.width,h=f.canvas.height,g=f.canvas.getContext('2d'),p=g.getImageData(0,0,w,h).data;let left=w,right=0,top=h,bottom=0;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(p[(y*w+x)*4+3]>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      left=Math.max(0,left-1);top=Math.max(0,top-1);right=Math.min(w-1,right+1);bottom=Math.min(h-1,bottom+1);
      const out=canvas(right-left+1,bottom-top+1);out.g.drawImage(f.canvas,left,top,out.c.width,out.c.height,0,0,out.c.width,out.c.height);
      metadata.set(f.name,{x:left,y:top,w:out.c.width,h:out.c.height,sourceW:w,sourceH:h});return {name:f.name,canvas:out.c};});
    const name=spriteAtlas(actor,detail);packAtlas(name,trimmed);const file=`public/assets/${name}.json`,json=JSON.parse(readFileSync(file,'utf8'));
    for(const [key,m]of metadata){json.frames[key].trimmed=true;json.frames[key].spriteSourceSize={x:m.x,y:m.y,w:m.w,h:m.h};json.frames[key].sourceSize={w:m.sourceW,h:m.sourceH};}
    writeFileSync(file,JSON.stringify(json));console.log(name,frames.length,json.meta.size);
  }
  contactSheet(`art/preview/angle-${actor}-v3-directions.png`,high.filter(f=>f.name.endsWith('_idle_0')),5,'#303631');
  contactSheet(`art/preview/angle-${actor}-v3-actions.png`,high.filter(f=>f.name.includes('_se_')),4,'#303631');
}
writeFileSync(`${root}/registration.json`,JSON.stringify(report,null,2));
