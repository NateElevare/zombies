import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { campaignFrame, CAMPAIGN_ART_STYLE, NAMED_CAMPAIGN_POSES, RESIDENT_CAMPAIGN_POSES } from '../src/campaign-art';

describe('authored legacy campaign art',()=>{
  it('ships real transparent, distinct artwork for all character animations',async()=>{
    const pack=JSON.parse(readFileSync('public/assets/campaign/pack.json','utf8'));
    expect(pack.style).toBe(CAMPAIGN_ART_STYLE);
    const atlas=JSON.parse(readFileSync('public/assets/campaign_people.json','utf8'));
    const image=await loadImage('public/assets/campaign_people.png'),c=createCanvas(128,128),g=c.getContext('2d');
    let count=0;
    for(const id of pack.characters){
      const poses=id.startsWith('resident')?RESIDENT_CAMPAIGN_POSES:NAMED_CAMPAIGN_POSES;
      for(const [pose,n]of Object.entries(poses)){
        const hashes=new Set();
        for(let i=0;i<n;i++){
          const name=`${id}_${pose}_${i}`,f=atlas.frames[name]?.frame;
          expect(f,name).toBeDefined();expect([f.w,f.h]).toEqual([128,128]);
          g.clearRect(0,0,128,128);g.drawImage(image,f.x,f.y,128,128,0,0,128,128);
          const data=g.getImageData(0,0,128,128).data;let solid=0,clear=0,border=0;
          for(let y=0;y<128;y++)for(let x=0;x<128;x++){const a=data[(y*128+x)*4+3];if(a>127)solid++;if(!a)clear++;if(x<8||x>=120||y<8||y>=120)border+=a;}
          expect(solid,name).toBeGreaterThan(500);expect(clear,name).toBeGreaterThan(5000);expect(border,name).toBe(0);
          hashes.add(createHash('sha256').update(data).digest('hex'));count++;
        }
        expect(hashes.size,`${id} ${pose} must animate`).toBe(n);
      }
    }
    expect(count).toBe(204);expect(Object.keys(atlas.frames)).toHaveLength(count);
  });
  it('resolves every resident pose without asking for missing frames',()=>{
    const atlas=JSON.parse(readFileSync('public/assets/campaign_people.json','utf8'));
    for(const id of ['mara','eli','june','ruth','resident0','resident5'])for(const pose of ['idle','walk','work','sit','injured','cower'])for(let t=0;t<5;t+=.125){
      expect(atlas.frames[campaignFrame(id,pose,t)]).toBeDefined();
    }
  });
  it('records the origin of every prop and keeps sprite borders transparent',async()=>{
    const pack=JSON.parse(readFileSync('public/assets/campaign/pack.json','utf8'));
    const atlas=JSON.parse(readFileSync('public/assets/campaign_props.json','utf8'));
    const image=await loadImage('public/assets/campaign_props.png');
    for(const [name,entry]of Object.entries(atlas.frames) as [string,{frame:{x:number;y:number;w:number;h:number}}][]){
      expect(pack.provenance[name],name).toBeTruthy();
      const f=entry.frame,c=createCanvas(f.w,f.h),g=c.getContext('2d');g.drawImage(image,f.x,f.y,f.w,f.h,0,0,f.w,f.h);
      const pixels=g.getImageData(0,0,f.w,f.h).data;let border=0;
      for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)if(x<4||y<4||x>=f.w-4||y>=f.h-4)border+=pixels[(y*f.w+x)*4+3];
      expect(border,name).toBe(0);
    }
  });
});
