import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { newState, phys, SIM_DT } from '../src/sim/core';
import * as zombies from '../src/sim/zombies';
import * as player from '../src/sim/player';
import { spawnBossOf } from '../src/sim/bosses';
import type { ZombieType } from '../src/sim/types';

describe('window climbing artwork',()=>{
  for(const axis of ['x','y'] as const)for(const direction of [-1,1]){
    it(`follows an actual ${axis} crossing in direction ${direction}, then clears`,()=>{
      const s=newState(42,'road');s.clock.t=90;
      s.player=player.create(8000,8000);s.player[axis]+=direction*120;
      const win=phys.addSolid(s,{kind:'window',x:axis==='x'?7994:7950,y:axis==='y'?7994:7950,w:axis==='x'?12:100,h:axis==='y'?12:100,blocksSight:false});
      const z=zombies.spawn(s,'walker',8000,8000);z[axis]-=direction*65;
      const seen:number[]=[];
      for(let tick=0;tick<500;tick++){
        zombies.update(s,SIM_DT);
        if(z.windowClimb){expect(z.windowClimb.axis).toBe(axis);expect(z.windowClimb.direction).toBe(direction);seen.push(z.windowClimb.progress);}
      }
      expect(seen.length).toBeGreaterThan(20);expect(seen[0]).toBeLessThan(.1);expect(seen.at(-1)).toBeGreaterThan(.9);
      expect(seen.every((v,i)=>!i||v>=seen[i-1])).toBe(true);
      expect(z.windowClimb).toBeUndefined();expect(direction*(z[axis]-8000)).toBeGreaterThan(25);
      expect(win.blocksBullets).toBe(false);
      expect(s.events.filter(e=>e.t==='salvaged')).toHaveLength(1);
    });
  }
  it('does not show climbing in Arcade or on bosses, and clears after knockback',()=>{
    const s=newState(42,'road');s.player=player.create(8200,8000);
    phys.addSolid(s,{kind:'window',x:7994,y:7950,w:12,h:100,blocksSight:false});
    const z=zombies.spawn(s,'walker',7990,8000);
    zombies.update(s,SIM_DT);expect(z.windowClimb).toBeDefined();
    z.x=7900;zombies.update(s,SIM_DT);expect(z.windowClimb).toBeUndefined();
    z.x=7990;s.mode='arcade';zombies.update(s,SIM_DT);expect(z.windowClimb).toBeUndefined();
    s.mode='road';s.zombies=[];const b=spawnBossOf(s,'juggernaut',0,7990,8000,1);
    zombies.update(s,SIM_DT);expect(b.windowClimb).toBeUndefined();
  });
  it('registers four transparent, distinct poses for every existing zombie variant',async()=>{
    const manifest=JSON.parse(readFileSync('public/assets/manifest.json','utf8'));
    const atlas=JSON.parse(readFileSync('public/assets/zombie_climb.json','utf8'));
    const anims=JSON.parse(readFileSync('public/assets/anims.json','utf8')).filter((a:{atlas:string})=>a.atlas==='zombie_climb');
    expect(manifest.atlases).toContain('zombie_climb');expect(anims).toHaveLength(13);expect(Object.keys(atlas.frames)).toHaveLength(52);
    const image=await loadImage('public/assets/zombie_climb.png');
    for(const type of (Object.keys(zombies.VARIANTS) as ZombieType[]).filter(t=>!zombies.isHiveType(t)))for(let v=0;v<zombies.VARIANTS[type];v++){
      const key=`zombie_${type}_${v}_climb`,seq=anims.find((a:{key:string})=>a.key===key),size=['brute','bloater'].includes(type)?192:128;
      expect(seq.frames).toHaveLength(4);const hashes=new Set();
      for(const name of seq.frames){
        const f=atlas.frames[name].frame;expect([f.w,f.h]).toEqual([size,size]);
        const c=createCanvas(size,size),g=c.getContext('2d');g.drawImage(image,f.x,f.y,size,size,0,0,size,size);
        const data=g.getImageData(0,0,size,size).data;let clear=0,visible=0,border=0;
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){const a=data[(y*size+x)*4+3];if(a===0)clear++;if(a>127)visible++;if(x<8||y<8||x>=size-8||y>=size-8)border+=a;}
        expect(clear).toBeGreaterThan(size*size*.25);expect(visible).toBeGreaterThan(size*size*.03);expect(border).toBe(0);
        hashes.add(createHash('sha256').update(data).digest('hex'));
      }
      expect(hashes.size).toBe(4);
    }
  });
});
