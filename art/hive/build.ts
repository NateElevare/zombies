/** Cuts authored PNGs into padded Phaser atlases; preserves animation registration. */
import {loadImage} from '@napi-rs/canvas';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {canvas,packAtlas,contactSheet,savePng,writeFile,type Canvas,type Frame} from '../lib/core';
import {HIVE_ENEMY_SEQUENCES,HIVE_BOSS_SEQUENCES,HIVE_QUEEN_COURT_SEQUENCES} from '../../src/hive-art';
type Job={id:string;name:string;kind:string;file:string;imported_frame_px?:number;in_game_radius?:number;atlas_length_px?:number;flies?:boolean;build_step:number};
const root=process.cwd(),out=join(root,'public/assets');
const jobs:Job[]=JSON.parse(readFileSync(join(root,'art/source/hive-pixel/prompts.json'),'utf8')).assets;
const partial=process.argv.includes('--partial');
const manifest:any={version:1,style:'reference-pixel-overhead-v1',facing:'+x',atlases:[],sprites:{},anims:[],creatures:{},weapons:{},icons:{},frames:{},sources:[],missing:[]};
const groups=new Map<string,Frame[]>(),lineup:Frame[]=[],bosses:Frame[]=[],items:Frame[]=[];
function bounds(c:Canvas){const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let x=c.width,y=c.height,r=-1,b=-1;for(let j=0;j<c.height;j++)for(let i=0;i<c.width;i++)if(p[(j*c.width+i)*4+3]>=128){x=Math.min(x,i);y=Math.min(y,j);r=Math.max(r,i);b=Math.max(b,j);}return{x,y,w:r-x+1,h:b-y+1};}
function add(atlas:string,name:string,c:Canvas){if(!groups.has(atlas))groups.set(atlas,[]);groups.get(atlas)!.push({name,canvas:c});manifest.frames[name]={atlas,bounds:bounds(c)};}
// Eliminate detached atlas-gutter specks, without changing opaque body pixels.
function clean(c:Canvas){
 const g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height),p=d.data,w=c.width,h=c.height,seen=new Uint8Array(w*h),parts:number[][]=[];
 for(let n=0;n<w*h;n++){
  if(seen[n]||p[n*4+3]<128)continue;const q=[n];seen[n]=1;
  for(let i=0;i<q.length;i++){const k=q[i],x=k%w,y=Math.floor(k/w);for(const v of[x>0?k-1:-1,x<w-1?k+1:-1,y>0?k-w:-1,y<h-1?k+w:-1])if(v>=0&&!seen[v]&&p[v*4+3]>=128){seen[v]=1;q.push(v);}}
  parts.push(q);
 }
 const largest=Math.max(0,...parts.map(a=>a.length));
 for(const part of parts)if(part.length<Math.max(3,largest*.001))for(const n of part)p[n*4+3]=0;
 // Hard alpha edges suit nearest-neighbor pixel sprites; retain translucent wings.
 for(let n=0;n<w*h;n++)if(p[n*4+3]<32)p[n*4+3]=0;
 g.putImageData(d,0,0);
}
for(const job of jobs){
 const path=join(root,job.file);if(!existsSync(path)){manifest.missing.push(job.file);continue;}
 const im=await loadImage(path);manifest.sources.push(job.file);
 if(job.kind==='enemy'||job.kind==='boss'){
  const cols=job.kind==='enemy'?8:4,rows=4,size=job.imported_frame_px!,expected=cols/rows;
  if(Math.abs(im.width/im.height-expected)>.02)throw Error(`${job.id}: invalid sheet aspect ratio`);
  const seqs=job.kind==='enemy'?HIVE_ENEMY_SEQUENCES:job.id==='queen_court'?HIVE_QUEEN_COURT_SEQUENCES:HIVE_BOSS_SEQUENCES;
  const atlas=job.kind==='enemy'?'hive_enemies':job.id.startsWith('queen_')?'hive_queen':'hive_bosses';
  const prefix=job.kind==='enemy'?`hive_${job.id}_0`:`hive_boss_${job.id}`,animations:Record<string,string>={},frames:Frame[]=[];
  for(const[pose,seq]of Object.entries(seqs)){
   const names:string[]=[];
   for(let i=0;i<seq.count;i++){
    const n=seq.start+i,col=n%cols,row=Math.floor(n/cols),x=Math.round(col*im.width/cols),y=Math.round(row*im.height/rows),w=Math.round((col+1)*im.width/cols)-x,h=Math.round((row+1)*im.height/rows)-y;
    const c=canvas(size,size);c.g.imageSmoothingEnabled=false;
    // One fixed full-cell transform for the entire animation, never per-pose fitting.
    c.g.drawImage(im,x,y,w,h,8,8,size-16,size-16);clean(c.c);
    const b=bounds(c.c);if(b.w<5||b.h<5)throw Error(`${job.id}/${pose}/${i}: empty sprite`);
    const name=`${prefix}_${pose}_${i}`;add(atlas,name,c.c);names.push(name);frames.push({name,canvas:c.c});
   }
   const key=`${prefix}_${pose}`,repeat=['walk','idle'].includes(pose)?-1:0;
   manifest.anims.push({key,atlas,frames:names,frameRate:seq.rate,repeat});animations[pose]=key;
   manifest.sprites[key]={atlas,origin:[.5,.5]};
  }
  manifest.creatures[job.id]={name:job.name,kind:job.kind,atlas,frameSize:size,origin:[.5,.5],radius:job.in_game_radius??null,flies:job.flies||false,animations,source:job.file,buildStep:job.build_step};
  (job.kind==='enemy'?lineup:bosses).push(frames[0]);
  contactSheet(join(root,`art/preview/hive-${job.id}.png`),frames,cols,'#30352e');
 }else{
  const raw=canvas(im.width,im.height);raw.g.drawImage(im,0,0);clean(raw.c);const b=bounds(raw.c);if(b.w<5||b.h<5)throw Error(`Empty ${job.file}`);
  if(job.kind==='weapon_held'){
   const length=job.atlas_length_px!,scale=length/b.w,w=Math.ceil(length+16),h=Math.ceil(b.h*scale+16),c=canvas(w,h);c.g.imageSmoothingEnabled=false;
   c.g.drawImage(raw.c,b.x,b.y,b.w,b.h,8,8,length,b.h*scale);
   const name=`weapon_${job.id}`,grip=[8+length*.25,h/2],muzzle=[8+length,h/2];
   add('hive_weapons',name,c.c);manifest.sprites[name]={atlas:'hive_weapons',origin:[grip[0]/w,grip[1]/h],grip:grip.map(n=>n/2),muzzle:muzzle.map(n=>n/2)};
   manifest.weapons[job.id]={name:job.name,frame:name,atlas:'hive_weapons',source:job.file,length,origin:manifest.sprites[name].origin};items.push({name,canvas:c.c});
  }else{
   const c=canvas(80,80),s=70/Math.max(b.w,b.h);c.g.imageSmoothingEnabled=false;c.g.drawImage(raw.c,b.x,b.y,b.w,b.h,(80-b.w*s)/2,(80-b.h*s)/2,b.w*s,b.h*s);
   const name=`hive_icon_${job.id}`;add('hive_icons',name,c.c);manifest.icons[job.id]=`assets/story-icons/${job.id}.png`;
   for(const folder of ['story-icons','icons'])savePng(join(out,folder,job.id+'.png'),c.c);
   items.push({name,canvas:c.c});
  }
 }
}
if(manifest.missing.length&&!partial)throw Error(`Missing ${manifest.missing.length} sources: ${manifest.missing.join(', ')}`);
for(const[key,frames]of groups){packAtlas(key,frames);manifest.atlases.push(key);}
writeFile(join(out,'hive-art.json'),JSON.stringify(manifest));
if(lineup.length)contactSheet(join(root,'art/preview/hive-enemy-lineup.png'),lineup,6,'#30352e');
if(bosses.length)contactSheet(join(root,'art/preview/hive-boss-lineup.png'),bosses,4,'#30352e');
if(items.length)contactSheet(join(root,'art/preview/hive-items.png'),items,6,'#30352e');
console.log(`Hive pack: ${manifest.sources.length}/44 sources, ${Object.keys(manifest.frames).length} frames, ${manifest.anims.length} animations, ${manifest.atlases.length} atlases.`);
