import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as aug from '../src/sim/augments';
import * as prog from '../src/sim/progression';
import * as upgrades from '../src/sim/upgrades';
import * as zombies from '../src/sim/zombies';
import { newArcade, stepArcade, devBoss } from '../src/sim/arcade';
import { SIM_DT } from '../src/sim/core';
import type { InputState } from '../src/sim/types';

let store:Map<string,string>,write:ReturnType<typeof vi.fn>;
beforeEach(()=>{store=new Map();write=vi.fn((k:string,v:string)=>{store.set(k,v);});vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:write});});
afterEach(()=>vi.unstubAllGlobals());
const input:InputState={moveX:0,moveY:0,aimX:8200,aimY:8000,fire:false,firePressed:false,altPressed:false,sprint:false,interactHeld:false,pressed:new Set()};
const hold=(s:ReturnType<typeof newArcade>)=>{s.arcade!.toSpawn=1;s.arcade!.spawnTimer=999;};

describe('cores earned during Arcade',()=>{
  it('deposits score earnings during combat and lets K spend them before the run ends',()=>{
    const s=newArcade(1);hold(s);s.arcade!.score=15000;
    stepArcade(s,input,SIM_DT);
    expect(s.screen).toBe('playing');expect(aug.load().cores).toBe(25);expect(s.arcade!.coresEarned).toBe(25);
    expect(prog.unlock(s,'handgun_dmg1')).toBe(true);expect(aug.load().cores).toBe(0);
    s.arcade!.score+=600;stepArcade(s,input,SIM_DT);
    expect(aug.load().cores).toBe(1);expect(s.arcade!.coresEarned).toBe(26);
    expect(aug.load().earned).toBe(26);
    s.player.hp=0;stepArcade(s,input,SIM_DT);
    expect(aug.load().cores).toBe(1);expect(s.arcade!.coresEarned).toBe(26);
    expect(aug.bankRun(s)).toBe(0);expect(aug.bankProgress(s)).toBe(0);
  });
  it('pays a wave on clear, once, before the next wave starts',()=>{
    const s=newArcade(2);s.arcade!.toSpawn=0;s.zombies=[];
    stepArcade(s,input,SIM_DT);expect(s.arcade!.wave).toBe(1);expect(s.arcade!.intermission).toBe(5);
    expect(aug.load().cores).toBe(2);
    for(let i=0;i<305;i++)stepArcade(s,input,SIM_DT);
    expect(s.arcade!.wave).toBe(2);expect(aug.load().cores).toBe(2);
    aug.bankRun(s);expect(aug.load().cores).toBe(2);
  });
  it('credits boss rewards before the free upgrade picker is dismissed',()=>{
    const s=newArcade(3);hold(s);
    const boss=devBoss(s)!;zombies.damage(s,boss,1e9,0);
    stepArcade(s,input,SIM_DT);
    expect(s.arcade!.bossKills).toBe(1);expect(s.ui).toBe('levelup');expect(s.screen).toBe('playing');
    expect(aug.load().cores).toBe(aug.coresFor(s));expect(aug.load().cores).toBeGreaterThanOrEqual(25);
  });
  it('deposits bonus-card score even with more choices keeping the fight paused',()=>{
    const s=newArcade(4),r=s.arcade!.run!;s.arcade!.score=550;
    s.ui='levelup';r.pending=2;r.offer=[{kind:'gold',id:'gold',level:0}];
    expect(upgrades.choose(s,0)).toBe(true);
    expect(s.ui).toBe('levelup');expect(aug.load().cores).toBe(1);
  });
  it('keeps fractional reward multipliers cumulative and settles only unpaid earnings on quit',()=>{
    const s=newArcade(5,aug.bonuses({cores:0,earned:0,lv:{cores:3,bounty:2}}));
    for(let i=1;i<=10;i++){s.arcade!.score=i*600;aug.bankProgress(s);}
    expect(aug.load().cores).toBe(13);
    const m=aug.load();expect(aug.buy(m,'ammo')).toBe(false); // cannot spend more than the current balance
    s.arcade!.bossKills=1;s.arcade!.wave=3;
    const total=aug.coresFor(s);const paid=aug.bankRun(s);
    expect(paid).toBe(total-13);expect(aug.load().cores).toBe(total);expect(aug.bankRun(s)).toBe(0);
  });
  it('retries failed deposits and avoids storage writes on frames without new rewards',()=>{
    const s=newArcade(6);s.arcade!.score=600;
    write.mockImplementationOnce(()=>{throw Error('storage unavailable');});
    expect(aug.bankRun(s)).toBe(0);expect(s.arcade!.coresBanked).not.toBe(true);expect(s.arcade!.coresEarned).toBeUndefined();
    expect(aug.bankProgress(s)).toBe(1);expect(aug.load().cores).toBe(1);
    write.mockClear();for(let i=0;i<100;i++)aug.bankProgress(s);
    expect(write).not.toHaveBeenCalled();expect(aug.bankRun(s)).toBe(0);expect(s.arcade!.coresBanked).toBe(true);
  });
});
