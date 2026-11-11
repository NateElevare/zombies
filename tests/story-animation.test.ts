import {describe,it,expect} from 'vitest';
import {advanceZombieGait,zombieHeading,zombieMotion,zombieDeath,ZOMBIE_DEATH_SECONDS} from '../src/render/story-zombie-animation';
import {storyBillboardPlacement,storyFurnitureHeight,storyPropFrame} from '../src/render/story-assets';
import type {Solid} from '../src/sim/types';

describe('Story animation continuity',()=>{
 it('advances equally at 30, 60 and 144 Hz and freezes when paused',()=>{
  for(const type of ['walker','runner','brute','crawler','bloater']){
   const phases=[30,60,144].map(hz=>{let phase=0;for(let i=0;i<hz;i++)phase=advanceZombieGait(phase,65/hz,type,1/hz);return phase;});
   expect(phases[0]).toBeCloseTo(phases[1]);expect(phases[1]).toBeCloseTo(phases[2]);
   expect(advanceZombieGait(2,100,type,0)).toBe(2);
  }
 });
 it('does not run a whole gait because of a teleport or knockback',()=>{
  expect(advanceZombieGait(0,500,'walker',1/60)).toBeLessThan(.05);
  expect(advanceZombieGait(2,0,'walker',1/60)).toBe(2);
 });
 it('retains the view near a direction boundary and takes the short arc at pi',()=>{
  const boundary=Math.PI/8;
  for(const a of [boundary-.01,boundary+.02,boundary-.02])expect(zombieHeading(a,a,1,0)).toBe(0);
  expect(zombieHeading(boundary+.12,boundary+.12,1,0)).toBe(Math.PI/4);
  expect(Math.abs(zombieHeading(Math.PI-.02,-Math.PI+.02,.5,undefined))).toBeCloseTo(Math.PI);
 });
 it('settles the collapse once, without moving or rotating a settled corpse',()=>{
  expect(zombieDeath(.1).frame).toBe(9);expect(zombieDeath(.3).frame).toBe(10);expect(zombieDeath(.8).frame).toBe(11);
  expect(zombieDeath(.8).landed).toBe(false);
  for(const t of [ZOMBIE_DEATH_SECONDS,2,44])expect(zombieDeath(t)).toMatchObject({frame:11,landed:true,y:0,x:0,progress:1});
 });
 it('has continuous periodic body movement with no stationary rocking',()=>{
  const a=zombieMotion(.31,1,'walker'),b=zombieMotion(1.31,1,'walker');
  expect(a.y).toBeCloseTo(b.y);expect(a.x).toBeCloseTo(b.x);
  expect(zombieMotion(.31,0,'walker').y).toBeCloseTo(0);
 });
 it('caps tall end-on bathtub art without lifting it off the floor',()=>{
  const rect={x:0,y:0,w:100,h:44},bounds={x:70,y:4,w:110,h:220};
  const p=storyBillboardPlacement(rect,bounds,undefined,storyFurnitureHeight('tub'));
  expect(p.scale*bounds.h).toBeCloseTo(44*Math.SQRT1_2+26);
  expect((bounds.y+bounds.h-p.originY*256)*p.scale).toBeCloseTo(rect.h*Math.SQRT1_2/2);
  expect(storyPropFrame({...rect,kind:'furniture',sub:'tub'} as Solid,[])).toBe('story_props_tub_0');
  expect(storyPropFrame({...rect,w:40,h:80,kind:'furniture',sub:'tub'} as Solid,[])).toBe('story_props_tub_1');
 });
});
