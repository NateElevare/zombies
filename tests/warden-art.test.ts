import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { BOSS_IDS, spawnBossOf } from '../src/sim/bosses';
import { newArcade } from '../src/sim/arcade';
import { damage } from '../src/sim/zombies';
import { bossFrame, bossFrameSize, bossPose, BOSS_SEQUENCES, type BossPose } from '../src/boss-art';

describe('Warden artwork',()=>{
  it('ships sixteen distinct transparent high-resolution frames in its own registered atlas',async()=>{
    const manifest=JSON.parse(readFileSync('public/assets/manifest.json','utf8'));
    const atlas=JSON.parse(readFileSync('public/assets/warden.json','utf8'));
    const anims=JSON.parse(readFileSync('public/assets/anims.json','utf8')).filter((a:{atlas:string})=>a.atlas==='warden');
    expect(manifest.atlases).toContain('warden');expect(anims).toHaveLength(7);expect(Object.keys(atlas.frames)).toHaveLength(16);
    expect(BOSS_IDS).not.toContain('warden');expect(bossFrameSize('warden')).toBe(384);expect(bossFrameSize('juggernaut')).toBe(192);
    const image=await loadImage('public/assets/warden.png'),c=createCanvas(384,384),g=c.getContext('2d'),hashes=new Set();
    for(const [pose,seq]of Object.entries(BOSS_SEQUENCES))for(let i=0;i<seq.count;i++){
      const name=bossFrame('warden',pose as BossPose,(i+.01)/seq.rate),f=atlas.frames[name].frame;
      expect(name).toBe(`boss_warden_${pose}_${i}`);expect([f.w,f.h]).toEqual([384,384]);
      expect(anims.find((a:{key:string})=>a.key===`boss_warden_${pose}`).frames[i]).toBe(name);
      g.clearRect(0,0,384,384);g.drawImage(image,f.x,f.y,384,384,0,0,384,384);
      const pixels=g.getImageData(0,0,384,384).data;let visible=0,clear=0,border=0;
      for(let y=0;y<384;y++)for(let x=0;x<384;x++){const a=pixels[(y*384+x)*4+3];if(a>127)visible++;if(!a)clear++;if(x<16||y<16||x>=368||y>=368)border+=a;}
      expect(visible).toBeGreaterThan(2000);expect(clear).toBeGreaterThan(384*384*.25);expect(border).toBe(0);
      hashes.add(createHash('sha256').update(pixels).digest('hex'));
    }
    expect(hashes.size).toBe(16);
  });
  it('uses Warden frames for windups, rushes, barrage recovery and death',()=>{
    const z={boss:'warden' as const,hitFlash:0,attackT:10,x:0,y:0,prevX:0,prevY:0};
    for(const act of ['slamWind','chargeWind','quakeWind'])expect(bossPose({...z,act,actT:.1})).toBe('windup');
    expect(bossPose({...z,act:'slamWind',actT:1.1})).toBe('special');
    expect(bossPose({...z,act:'charging'})).toBe('special');
    for(const stage of [0,1,2,3])expect(bossPose({...z,stage,act:'recover'})).toBe('special');
    expect(bossPose({...z,stage:0,cd:{boulder:2.5}})).toBe('idle');
    expect(bossFrame('warden','death',99)).toBe('boss_warden_death_2');
  });
  it('preserves giant visual size on death instead of shrinking to the collision radius',()=>{
    const state=newArcade(7),z=spawnBossOf(state,'warden',0,400,400,1,{maxR:60});
    damage(state,z,1e9,0);
    expect(z.drawR).toBeGreaterThan(z.r*2);
    expect(state.events.find(e=>e.t==='zombieKilled'&&e.id===z.id)).toMatchObject({boss:'warden',radius:z.drawR});
  });
});
