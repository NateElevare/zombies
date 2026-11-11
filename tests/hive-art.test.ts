import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
const root=process.cwd();
const read=(p:string)=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const pack=read('public/assets/hive-art.json');
const brief=read('art/source/hive-pixel/prompts.json');
describe('Hive authored art contract',()=>{
 it('delivers every requested source, creature, held weapon and icon',()=>{
  expect(pack.missing).toEqual([]);expect(pack.sources).toHaveLength(44);
  for(const a of brief.assets){expect(existsSync(resolve(root,a.file)),a.file).toBe(true);expect(pack.sources).toContain(a.file);}
  expect(Object.keys(pack.creatures)).toHaveLength(19);expect(Object.keys(pack.weapons)).toHaveLength(11);expect(Object.keys(pack.icons)).toHaveLength(14);
 });
 it('resolves every animation to real atlas frames with the prescribed sizes',()=>{
  const atlases=Object.fromEntries(pack.atlases.map((id:string)=>[id,read(`public/assets/${id}.json`)]));
  expect(new Set(pack.anims.map((a:any)=>a.key)).size).toBe(123);
  expect(Object.keys(pack.frames)).toHaveLength(472);
  for(const a of Object.values(pack.creatures) as any[]){
   const poses=Object.entries(a.animations);expect(poses.length).toBe(a.kind==='enemy'?6:poses.some(([p])=>p==='sac')?8:7);
   let total=0;
   for(const[pose,key]of poses){const anim=pack.anims.find((x:any)=>x.key===key);expect(anim,key as string).toBeTruthy();expect(anim.repeat).toBe(['idle','walk'].includes(pose)?-1:0);total+=anim.frames.length;
    for(const name of anim.frames){const f=atlases[a.atlas].frames[name]?.frame;expect(f,name).toBeTruthy();expect([f.w,f.h]).toEqual([a.frameSize,a.frameSize]);}
   }
   expect(total).toBe(a.kind==='enemy'?29:16);
  }
 });
 it('keeps painted pixels inside transparent gutters and PNG atlas bounds',async()=>{
  for(const id of pack.atlases){const data=read(`public/assets/${id}.json`),im=await loadImage(resolve(root,`public/assets/${id}.png`));const c=createCanvas(im.width,im.height),g=c.getContext('2d');g.drawImage(im,0,0);
   const pixels=g.getImageData(0,0,im.width,im.height).data;
   for(const[name,entry]of Object.entries(data.frames) as [string,any][]){const f=entry.frame;
    expect(f.x+f.w<=im.width&&f.y+f.h<=im.height,name).toBe(true);
    let ink=0,edge=0;for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){const a=pixels[((y+f.y)*im.width+x+f.x)*4+3];if(a>0)ink++;if(x===0||y===0||x===f.w-1||y===f.h-1)edge+=a;}
    expect(ink,name+' blank').toBeGreaterThan(20);expect(edge,name+' clipped').toBe(0);
   }
  }
 },20000);
 it('ships UI icons and normalized grip metadata for every weapon',()=>{
  for(const[id,w]of Object.entries(pack.weapons) as [string,any][]){const m=pack.sprites[w.frame];expect(m.atlas).toBe('hive_weapons');expect(m.origin[0]).toBeGreaterThan(0);expect(m.origin[0]).toBeLessThan(1);expect(m.origin[1]).toBe(.5);expect(m.muzzle[0]).toBeGreaterThan(m.grip[0]);expect(pack.icons[id]).toBeTruthy();}
  for(const[id,url]of Object.entries(pack.icons) as [string,string][]){expect(existsSync(resolve(root,'public',url))).toBe(true);expect(existsSync(resolve(root,'public/assets/icons',id+'.png'))).toBe(true);}
 });
});
