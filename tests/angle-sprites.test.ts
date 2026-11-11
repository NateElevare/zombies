import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {LabWorld} from '../src/angle-lab/world';
import {LAB_OBSTACLES} from '../src/angle-lab/layout';
import {LAB_DEFAULTS} from '../src/angle-lab/math';
import {characterVisual,locomotion,spriteFacing,spriteAtlas,SPRITE_DIRECTIONS,SPRITE_SEQUENCES,SPRITE_RESOLUTIONS,type SpriteActor,type SpriteDetail} from '../src/angle-lab/sprite-set';

describe('Angle Lab finished sprite sets',()=>{
  it('ships all states and facings in both resolutions with correct logical frame dimensions',()=>{
    for(const actor of ['responder','zombie']as SpriteActor[])for(const detail of ['standard','256']as SpriteDetail[]){
      const atlas=JSON.parse(readFileSync(`public/assets/${spriteAtlas(actor,detail)}.json`,'utf8')),r=SPRITE_RESOLUTIONS[detail];
      let expected=0;
      for(const dir of SPRITE_DIRECTIONS)for(const[pose,frames]of Object.entries(SPRITE_SEQUENCES[actor]))for(let i=0;i<frames.length;i++){
        expected++;const f=atlas.frames[`lab3_${actor}_${dir}_${pose}_${i}`];expect(f).toBeDefined();expect(f.sourceSize).toEqual({w:r.w,h:r.h});
        expect(f.spriteSourceSize.x+f.frame.w).toBeLessThanOrEqual(r.w);expect(f.spriteSourceSize.y+f.frame.h).toBeLessThanOrEqual(r.h);
      }
      expect(Object.keys(atlas.frames)).toHaveLength(expected);
    }
    expect(LAB_DEFAULTS.zoom).toBe(1.35);
  });
  it('chooses side steps and backward gait relative to aim instead of forward walking',()=>{
    for(const aim of [0,Math.PI/3,-Math.PI/2,Math.PI]){
      expect(locomotion(aim,aim,false)).toBe('walk');expect(locomotion(aim,aim,true)).toBe('run');
      expect(locomotion(aim,aim+Math.PI/2,false)).toBe('strafe_right');expect(locomotion(aim,aim-Math.PI/2,false)).toBe('strafe_left');
      expect(locomotion(aim,aim+Math.PI,true)).toBe('backpedal');
    }
  });
  it('selects rear views and swaps the strafe artwork when mirrored',()=>{
    expect(spriteFacing(-Math.PI/2,0)).toEqual({direction:'n',flip:false});
    expect(spriteFacing(-Math.PI/4,0)).toEqual({direction:'ne',flip:false});
    const w=new LabWorld(LAB_OBSTACLES),p=w.player;Object.assign(p,{moving:true,angle:Math.PI,moveAngle:Math.PI/2});
    const v=characterVisual('responder',p,0);expect(v.flip).toBe(true);expect(v.pose).toBe('strafe_left');expect(v.frame).toContain('strafe_right');
    p.action='shoot';p.actionTime=.1;p.actionLength=.2;expect(characterVisual('responder',p,0).pose).toBe('strafe_left');
  });
  it('uses real damage, death and stable corpse frames for both characters',()=>{
    const w=new LabWorld(LAB_OBSTACLES);
    for(const[kind,a]of [['responder',w.player],['zombie',w.zombies[0]]]as const){
      w.damage(a,1);expect(characterVisual(kind,a,30).pose).toBe('hit');
      w.damage(a,100);a.deathTime=.4;expect(characterVisual(kind,a,30).frame).toContain('_death_');
      a.deathTime=30;expect(characterVisual(kind,a,30).frame).toContain('_corpse_0');
    }
  });
});
