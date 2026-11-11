import {loadImage} from '@napi-rs/canvas';
import {readFileSync,writeFileSync} from 'node:fs';
import {canvas} from '../lib/core';
/** Measure each pose's crown, rather than attaching helmets to the foot pivot. */
export async function buildStoryGearAnchors(){
 const path='public/assets/story-art.json',manifest=JSON.parse(readFileSync(path,'utf8')),atlas=JSON.parse(readFileSync('public/assets/story_torsos.json','utf8')),im=await loadImage('public/assets/story_torsos.png');
 for(const [name,f] of Object.entries(atlas.frames) as [string,any][]){
  if(!name.startsWith('story_torso_'))continue;
  const c=canvas(256,256),r=f.frame,b=f.spriteSourceSize;c.g.drawImage(im,r.x,r.y,r.w,r.h,b.x,b.y,b.w,b.h);
  const data=c.g.getImageData(0,0,256,256).data;
  const seen=new Set<number>(),groups:number[][]=[];
  for(let y=25;y<65;y++)for(let x=115;x<178;x++){
   const start=y*256+x;if(seen.has(start)||data[start*4+3]<=127)continue;
   const group=[start];seen.add(start);
   for(let i=0;i<group.length;i++)for(const n of [group[i]-1,group[i]+1,group[i]-256,group[i]+256]){
    const xx=n%256,yy=Math.floor(n/256);if(xx<115||xx>=178||yy<25||yy>=65||seen.has(n)||data[n*4+3]<=127)continue;seen.add(n);group.push(n);
   }
   groups.push(group);
  }
  const crown=groups.sort((a,b)=>b.length-a.length)[0];if(!crown)throw Error(`Missing crown: ${name}`);
  const top=Math.min(...crown.map(n=>Math.floor(n/256)));let left=178,right=115;
  for(const n of crown)if(Math.floor(n/256)<top+12){left=Math.min(left,n%256);right=Math.max(right,n%256);}
  manifest.frames[name].head={x:(left+right)/2,y:top+44};
  // These two cola poses join the ponytail to the crown silhouette.
  if(/^story_torso_scout_e_1[01]$/.test(name))manifest.frames[name].head.x=152;
 }
 writeFileSync(path,JSON.stringify(manifest));
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/story-gear-anchors.ts'))await buildStoryGearAnchors();
