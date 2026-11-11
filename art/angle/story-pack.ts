// Atlas preparation only: preserves generated sources and their alpha, registers pivots,
// extracts modular layers, and packs logical 256px cells for the runtime.
import {loadImage} from '@napi-rs/canvas';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {canvas,packAtlas,contactSheet,type Frame} from '../lib/core';
import {SPRITE_DIRECTIONS,SPRITE_SEQUENCES} from '../../src/angle-lab/sprite-set';
const root='art/angle/source/story-v1',out='public/assets';
mkdirSync(`${out}/story-icons`,{recursive:true});
const manifest:any={version:1,atlases:[],frames:{},sources:[],coverage:{}};
type Box={x:number;y:number;w:number;h:number};
function bounds(c:ReturnType<typeof canvas>['c'],threshold=127):Box{
 const g=c.getContext('2d'),p=g.getImageData(0,0,c.width,c.height).data;let x=c.width,y=c.height,r=-1,b=-1;
 for(let j=0;j<c.height;j++)for(let i=0;i<c.width;i++)if(p[(j*c.width+i)*4+3]>threshold){x=Math.min(x,i);y=Math.min(y,j);r=Math.max(r,i);b=Math.max(b,j);}
 return r<0?{x:0,y:0,w:0,h:0}:{x,y,w:r-x+1,h:b-y+1};
}
async function sheet(file:string,cols:number,rows:number){
 const image=await loadImage(file),cells=[];
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const x=Math.round(col*image.width/cols),y=Math.round(row*image.height/rows),w=Math.round((col+1)*image.width/cols)-x,h=Math.round((row+1)*image.height/rows)-y;
  const c=canvas(w,h);c.g.drawImage(image,x,y,w,h,0,0,w,h);
  if(file.includes('/torso-')||file.includes('/props-6')||file.includes('/car-police')){
    // Atlas extraction: reject disconnected fragments that spill across a cell gutter.
    const data=c.g.getImageData(0,0,w,h),p=data.data,seen=new Uint8Array(w*h),groups:number[][]=[];
    for(let n=0;n<w*h;n++){if(seen[n]||p[n*4+3]<8)continue;const q=[n];seen[n]=1;
      for(let i=0;i<q.length;i++){const k=q[i],xx=k%w,yy=Math.floor(k/w);for(const v of [xx>0?k-1:-1,xx<w-1?k+1:-1,yy>0?k-w:-1,yy<h-1?k+w:-1])if(v>=0&&!seen[v]&&p[v*4+3]>=8){seen[v]=1;q.push(v);}}groups.push(q);
    }
    const largest=Math.max(...groups.map(g=>g.length));for(const g of groups)if(g.length<largest*.04)for(const k of g)p[k*4+3]=0;c.g.putImageData(data,0,0);
  }
  cells.push({c:c.c,box:bounds(c.c),col,row,w,h});
 }return cells;
}
function packed(atlas:string,frames:Frame[]){
 if(!frames.length)return;
 const meta=new Map<string,Box>();const trimmed=frames.map(f=>{const b=bounds(f.canvas,8);if(!b.w||!b.h)throw Error(`Empty runtime sprite ${f.name}`);const c=canvas(b.w,b.h);c.g.drawImage(f.canvas,b.x,b.y,b.w,b.h,0,0,b.w,b.h);meta.set(f.name,b);return{name:f.name,canvas:c.c};});
 packAtlas(atlas,trimmed);const file=`${out}/${atlas}.json`,json=JSON.parse(readFileSync(file,'utf8'));
 for(const f of frames){const b=meta.get(f.name)!;json.frames[f.name].trimmed=true;json.frames[f.name].spriteSourceSize=b;json.frames[f.name].sourceSize={w:256,h:256};manifest.frames[f.name]={...manifest.frames[f.name],atlas,bounds:bounds(f.canvas)};
  const id=f.name.startsWith('story_item_')?f.name.slice(11):f.name.startsWith('story_weapon_')&&f.name.endsWith('_e')?f.name.slice(13,-2):f.name.startsWith('story_structures_')&&f.name.endsWith('_1')?'struct_'+f.name.slice(17,-2):null;
  if(id){const icon=canvas(80,80),s=70/Math.max(b.w,b.h);icon.g.imageSmoothingEnabled=false;icon.g.drawImage(f.canvas,b.x,b.y,b.w,b.h,(80-b.w*s)/2,(80-b.h*s)/2,b.w*s,b.h*s);writeFileSync(`${out}/story-icons/${id}.png`,icon.c.toBuffer('image/png'));}
 }
 writeFileSync(file,JSON.stringify(json));manifest.atlases.push(atlas);console.log(atlas,frames.length,json.meta.size);
}
function register(cell:Awaited<ReturnType<typeof sheet>>[number],scale:number,anchorX:number,anchorY:number,targetX=128,targetY=224){
 const c=canvas(256,256);c.g.imageSmoothingEnabled=false;c.g.drawImage(cell.c,Math.round(targetX-anchorX*scale),Math.round(targetY-anchorY*scale),Math.round(cell.w*scale),Math.round(cell.h*scale));return c.c;
}
const torsoFrames:Frame[]=[];
// Hand pivots in source-cell fractions. The importer records the exact registration transform.
const hands=[
 [[.72,.53],[.89,.56],[.46,.76],[.38,.25],[.85,.56],[.88,.57],[.78,.46],[.52,.54],[.52,.51],[.62,.6],[.68,.66],[.68,.58]],
 [[.67,.56],[.86,.57],[.46,.78],[.39,.25],[.82,.59],[.77,.65],[.69,.51],[.50,.59],[.50,.56],[.58,.64],[.62,.71],[.66,.59]],
 [[.37,.55],[.45,.60],[.38,.79],[.28,.25],[.42,.64],[.50,.68],[.50,.55],[.37,.59],[.37,.57],[.46,.69],[.50,.75],[.50,.60]],
 [[.67,.47],[.90,.52],[.54,.72],[.40,.22],[.83,.49],[.85,.53],[.73,.43],[.55,.50],[.55,.47],[.67,.59],[.67,.62],[.73,.53]],
 [[.60,.45],[.72,.47],[.62,.69],[.35,.20],[.69,.46],[.61,.49],[.61,.39],[.64,.47],[.64,.43],[.60,.55],[.60,.62],[.62,.50]],
];
for(const skin of ['responder','survivor','scout']){
 const file=`${root}/torso-${skin}${existsSync(`${root}/torso-${skin}-clean.png`)?'-clean':''}.png`;if(!existsSync(file))continue;
 const cells=await sheet(file,12,5);manifest.sources.push(file);
 for(const cell of cells){const base=cells[cell.row*12],scale=105/base.box.h;
  // Belt center ignores the extended hands and ponytail.
  const g=cell.c.getContext('2d'),pixels=g.getImageData(0,0,cell.w,cell.h).data;let left=cell.w,right=0;
  for(let y=cell.box.y+cell.box.h-14;y<cell.box.y+cell.box.h;y++)for(let x=0;x<cell.w;x++)if(pixels[(y*cell.w+x)*4+3]>127){left=Math.min(left,x);right=Math.max(right,x);}
  const ax=(left+right)/2,ay=cell.box.y+cell.box.h,name=`story_torso_${skin}_${SPRITE_DIRECTIONS[cell.row]}_${cell.col}`;
  const torso=register(cell,scale,ax,ay,128,140);torsoFrames.push({name,canvas:torso});
  const hand=hands[cell.row][cell.col],point={x:128+(hand[0]*cell.w-ax)*scale-(cell.col===2&&cell.row<3?4:0),y:140+(hand[1]*cell.h-ay)*scale};manifest.frames[name]={hand:point};
  if(cell.col>=2){const h=canvas(256,256);h.g.beginPath();h.g.arc(point.x,point.y,7,0,Math.PI*2);h.g.clip();h.g.drawImage(torso,0,0);if(bounds(h.c).w)torsoFrames.push({name:name.replace('story_torso_','story_hand_'),canvas:h.c});}
 }
}
packed('story_torsos',torsoFrames);contactSheet('art/preview/story-torsos.png',torsoFrames.filter(f=>f.name.includes('_se_')),12,'#3f4942');
const legFrames:Frame[]=[];
if(existsSync(`${root}/legs.png`)){
 const cells=await sheet(`${root}/legs.png`,16,5);
 const source:Record<string,number[]>={idle:[0,1],walk:[2,3,4,5],run:[6,7,8,9],strafe_left:[10,11,10,11],strafe_right:[12,13,12,13],backpedal:[14,15,14,15]};
 for(let row=0;row<5;row++)for(const[pose,indices]of Object.entries(source))for(const[i,index]of indices.entries()){
  const cell=cells[row*16+index],b=cell.box,scale=90/cells[row*16].box.h;
  legFrames.push({name:`story_legs_${SPRITE_DIRECTIONS[row]}_${pose}_${i}`,canvas:register(cell,scale,b.x+b.w/2,b.y+b.h)});
 }
}else{
const old=JSON.parse(readFileSync(`${out}/angle_responder_v3_256.json`,'utf8')),oldImage=await loadImage(`${out}/angle_responder_v3_256.png`);
for(const[name,raw]of Object.entries(old.frames)){
 const f=raw as any,c=canvas(256,256),r=f.frame,d=f.spriteSourceSize;c.g.drawImage(oldImage,r.x,r.y,r.w,r.h,d.x,d.y,d.w,d.h);c.g.clearRect(0,0,256,136);
 if(bounds(c.c).h)legFrames.push({name:name.replace('lab3_responder_','story_legs_'),canvas:c.c});
}}
packed('story_legs',legFrames);
const weaponIds=['pistol','revolver','smg','shotgun','assault_rifle','hunting_rifle','knife','bat','machete','cola_mints'];
if(existsSync(`${root}/weapons.png`)){
 const cells=await sheet(`${root}/weapons.png`,10,5),frames:Frame[]=[],lengths=[45,52,76,110,105,118,52,110,80,65],angles=[0,Math.PI/4,Math.PI/2,-Math.PI/4,-Math.PI/2];
 for(const cell of cells){const b=cell.box,base=cells[cell.col].box,scale=lengths[cell.col]/Math.max(base.w,base.h),a=angles[cell.row],len=Math.max(b.w,b.h),ax=b.x+b.w/2-Math.cos(a)*len*.24,ay=b.y+b.h/2-Math.sin(a)*len*.24;
  const name=`story_weapon_${weaponIds[cell.col]}_${SPRITE_DIRECTIONS[cell.row]}`;
  // Trigger/handle sits below the barrel axis in oblique views.
  const gripY=ay+([0,1,3].includes(cell.row)?b.h*.16:0);
  frames.push({name,canvas:register(cell,scale,ax,gripY,128,140)});
  manifest.frames[name]={muzzle:{x:128+Math.cos(a)*len*.7*scale,y:140+Math.sin(a)*len*.7*scale}};
 }packed('story_weapons',frames);contactSheet('art/preview/story-weapons.png',frames.filter(f=>f.name.endsWith('_se')),10,'#3f4942');
}
for(const skin of ['responder','survivor','scout'])if(existsSync(`${root}/death-${skin}.png`)){
 const cells=await sheet(`${root}/death-${skin}.png`,4,5),frames:Frame[]=[];
 for(const cell of cells){const b=cell.box,scale=185/cells[cell.row*4].box.h;frames.push({name:`story_death_${skin}_${SPRITE_DIRECTIONS[cell.row]}_${cell.col}`,canvas:register(cell,scale,b.x+b.w/2,b.y+b.h)});}
 packed(`story_death_${skin}`,frames);
}
const plan=JSON.parse(readFileSync(`${root}/plan.json`,'utf8'));
for(const job of plan){const file=`${root}/${job.id}${existsSync(`${root}/${job.id}-clean.png`)?'-clean':''}.png`;if(!existsSync(file))continue;const cells=await sheet(file,job.cols,job.rows),frames:Frame[]=[];manifest.sources.push(file);
 for(const cell of cells){const b=cell.box;if(!b.w)continue;let name='',scale=1,ax=b.x+b.w/2,ay=b.y+b.h;
  if(job.kind==='zombie'){const base=cells[cell.row*12].box;scale=185/(job.type==='crawler'?Math.max(base.w,base.h):base.h);name=`story_zombie_${job.type}_${job.variant}_${SPRITE_DIRECTIONS[cell.row]}_${cell.col}`;}
  else if(job.kind==='car'){scale=220/Math.max(b.w,b.h);name=`story_car_${job.type}${cell.row?'_wreck':''}_${cell.col}`;}
  else if(['props','structures','environment'].includes(job.kind)){scale=220/Math.max(b.w,b.h);name=`story_${job.kind}_${job.types[cell.row]}_${cell.col}`;}
  else if(job.kind==='gear'){scale=(job.slot==='head'?48:job.slot==='body'?72:84)/b.h;const row=job.slot==='back'?[0,3,4,1,2][cell.row]:cell.row;name=`story_gear_${job.types[cell.col]}_${SPRITE_DIRECTIONS[row]}`;}
  else if(job.kind==='decals'){scale=220/Math.max(b.w,b.h);name=`story_decor_${job.types[cell.row*job.cols+cell.col]}`;}
  else if(job.kind==='materials'){
    name=`story_material_${job.types[cell.row*job.cols+cell.col]}`;
    const c=canvas(256,256);c.g.imageSmoothingEnabled=false;c.g.drawImage(cell.c,1,1,cell.w-2,cell.h-2,0,0,256,256);
    frames.push({name,canvas:c.c});continue;
  }
  else if(job.kind==='items'){const id=job.types[cell.row*job.cols+cell.col];if(!id)continue;scale=180/Math.max(b.w,b.h);name=`story_item_${id}`;}
  if(!name)continue;frames.push({name,canvas:register(cell,scale,ax,ay)});
 }
 packed('story_'+job.id.replaceAll('-','_'),frames);manifest.coverage[job.id]=frames.length;
 contactSheet(`art/preview/story-${job.id}.png`,frames.filter((_,i)=>job.kind==='zombie'?i%12===0:true),job.kind==='zombie'?5:job.cols,'#3f4942');
}
writeFileSync(`${out}/story-art.json`,JSON.stringify(manifest));
await (await import('./story-legs')).buildStoryLegs();
await (await import('./story-desks')).buildStoryDesks();
await (await import('./story-gear-anchors')).buildStoryGearAnchors();
