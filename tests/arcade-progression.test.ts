import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as aug from '../src/sim/augments';
import * as prog from '../src/sim/progression';
import * as upgrades from '../src/sim/upgrades';
import * as player from '../src/sim/player';
import * as zombies from '../src/sim/zombies';
import { newArcade, stepArcade } from '../src/sim/arcade';
import { newState, phys, SIM_DT } from '../src/sim/core';
import { ITEMS } from '../src/sim/items';
import type { InputState } from '../src/sim/types';

let store:Map<string,string>;
beforeEach(()=>{store=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)});});
afterEach(()=>vi.unstubAllGlobals());
const idle:InputState={moveX:0,moveY:0,aimX:8200,aimY:8000,fire:false,firePressed:false,altPressed:false,sprint:false,interactHeld:false,pressed:new Set()};
const fund=()=>{const m=aug.load();m.cores=10000;aug.save(m);return m;};
const bonus=(lv:Record<string,number>)=>aug.bonuses({cores:0,earned:0,lv});

describe('permanent Arcade skills',()=>{
  it('spends banked cores, enforces prerequisites, applies now and survives new runs',()=>{
    fund();const s=newArcade(12),old=prog.weaponStats(s,'pistol').damage;
    expect(prog.canUnlock(s,'handgun_reload1').ok).toBe(false);
    expect(prog.unlock(s,'handgun_dmg1')).toBe(true);
    expect(s.player.sp).toBe(0);expect(aug.load().cores).toBe(9975);
    expect(prog.weaponStats(s,'pistol').damage).toBeCloseTo(old*1.15);
    expect(prog.unlock(s,'handgun_reload1')).toBe(true);expect(aug.load().cores).toBe(9930);
    expect(prog.unlock(s,'handgun_reload1')).toBe(false);expect(aug.load().cores).toBe(9930);
    s.player.hp=0;stepArcade(s,idle,SIM_DT);
    const next=newArcade(13);
    expect(next.player.tech).toEqual({handgun_dmg1:true,handgun_reload1:true});
    expect(prog.weaponStats(next,'pistol').reloadTime).toBeLessThan(prog.weaponStats(newState(1,'survival'),'pistol').reloadTime);
  });
  it('keeps story SP, tech and materials separate and filters useless Arcade skills',()=>{
    fund();const a=newArcade(1);prog.unlock(a,'handgun_dmg1');
    const story=newState(2,'road');story.player=player.create(8000,8000);story.player.sp=1;
    expect(story.player.tech).toEqual({});
    expect(prog.unlock(story,'handgun_dmg1')).toBe(true);expect(story.player.sp).toBe(0);expect(aug.load().cores).toBe(9975);
    const nodes=prog.treesFor(a).flatMap(t=>t.nodes);
    for(const id of ['survival_hunger1','survival_stam1','survival_sneak','armor_eff1'])expect(nodes.some(n=>n.id===id)).toBe(false);
    expect(nodes.every(n=>n.requires.every(id=>nodes.some(p=>p.id===id)))).toBe(true);
    expect(nodes.every(n=>Object.keys(prog.itemCost(a,n)).length===0)).toBe(true);
    expect(prog.canUnlock(a,'survival_stam1').ok).toBe(false);
  });
  it('combines skill HP with augments and Kevlar without healing or resetting each tick',()=>{
    fund();const s=newArcade(3,bonus({hp:2}));prog.unlock(s,'armor_hp1');
    s.arcade!.run!.passives.push({id:'kevlar',level:2});upgrades.syncPlayer(s);
    const expected=130+40+Number(prog.TECH.nodes.armor_hp1.effect.maxHp);
    expect(s.player.maxHp).toBe(expected);s.player.hp=expected-30;
    for(let i=0;i<180;i++)stepArcade(s,idle,SIM_DT);
    expect(s.player.maxHp).toBe(expected);expect(s.player.hp).toBeCloseTo(expected-30);
  });
  it('migrates old saves, rejects malformed ranks and orphaned skills, and refunds only augments',()=>{
    store.set('deadzone_arcade_augments',JSON.stringify({cores:500,earned:800,lv:{dmg:1,hp:900,rate:'no'},tech:{handgun_dmg1:true,handgun_burst:true,made_up:true},starter:'drone'}));
    const m=aug.load();expect(m.lv).toEqual({dmg:1,hp:5});expect(m.starter).toBeUndefined();
    const s=newArcade(1);expect(s.player.tech).toEqual({handgun_dmg1:true});
    expect(aug.respec(m)).toBe(true);expect(aug.load().tech?.handgun_dmg1).toBe(true);
    expect(newArcade(2).player.tech).toEqual({handgun_dmg1:true});
  });
  it('does not charge or grant permanent purchases when saving fails',()=>{
    fund();const s=newArcade(1),m=aug.load();
    vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:()=>{throw Error('full');}});
    expect(prog.unlock(s,'handgun_dmg1')).toBe(false);expect(s.player.tech?.handgun_dmg1).toBeUndefined();
    expect(aug.buy(m,'dmg')).toBe(false);expect(m.cores).toBe(10000);expect(m.lv).toEqual({});
    expect(aug.load().cores).toBe(10000);
  });
});
describe('expanded core augments',()=>{
  it('has working loadout unlocks, one selected starter, gear quality and extra build slots',()=>{
    const m=fund();expect(aug.selectStarter(m,'drone')).toBe(false);
    aug.buy(m,'ammo');aug.buy(m,'starter_drone');aug.buy(m,'starter_saw');
    expect(aug.selectStarter(m,'drone')).toBe(true);expect(aug.load().starter).toBe('drone');
    let s=newArcade(3);expect(s.arcade!.run!.gadgets.map(g=>g.id)).toEqual(['drone']);
    aug.selectStarter(m,'saw');s=newArcade(4);expect(s.arcade!.run!.gadgets.map(g=>g.id)).toEqual(['saw']);
    const t=newArcade(5,bonus({quality:2,magazine:3,gadgetSlot:1,passiveSlot:2}));
    expect(t.player.inv.equip.secondary?.lvl).toBe(3);expect(t.player.inv.equip.secondary?.mag).toBeGreaterThan(12);
    const run=t.arcade!.run!;
    run.gadgets=upgrades.GADGET_IDS.slice(0,4).map(id=>({id,level:1,evolved:false,cd:1,cd2:1,angle:0,prevAngle:0}));
    run.passives=upgrades.PASSIVE_IDS.slice(0,4).map(id=>({id,level:1}));
    expect(upgrades.candidates(run).some(c=>c.kind==='gadget'&&c.id===upgrades.GADGET_IDS[4])).toBe(true);
    expect(upgrades.candidates(run).some(c=>c.kind==='passive'&&c.id===upgrades.PASSIVE_IDS[4])).toBe(true);
  });
  it('applies weapon handling, emergency speed, hit protection, duration and bounty',()=>{
    const a=newArcade(8),b=newArcade(8,bonus({crit:3,stability:3,velocity:3,knock:3,escape:3,grace:3,duration:3,bounty:3,salvage:3}));
    const plain=prog.weaponStats(a,'pistol'),buff=prog.weaponStats(b,'pistol');
    expect(buff.crit).toBeCloseTo(.09);expect(buff.spread).toBeLessThan(plain.spread);expect(buff.bulletSpeed).toBeCloseTo(plain.bulletSpeed*1.45);
    expect(prog.weaponStats(b,'knife').melee!.knock).toBeGreaterThan(prog.weaponStats(a,'knife').melee!.knock);
    b.player.hp=30;expect(prog.playerMods(b).speedMult).toBeCloseTo(1.15);
    b.player.invuln=0;player.damage(b,1,0);expect(b.player.invuln).toBeCloseTo(.59);
    expect(upgrades.mods(b.arcade!.run!).dur).toBeCloseTo(1.3);
    a.arcade!.bossKills=b.arcade!.bossKills=2;expect(aug.coresFor(b)-aug.coresFor(a)).toBe(30);
    expect(upgrades.goldValue(b)).toBe(400);
    a.player.tech.shotgun_slug=b.player.tech.shotgun_slug=true;
    expect(prog.weaponStats(b,'shotgun').bulletSpeed).toBeCloseTo(prog.weaponStats(a,'shotgun').bulletSpeed*1.45);
  });
  it('collects supplies farther away with stronger healing, but never through walls',()=>{
    const s=newArcade(5,bonus({supply:3,healing:3})),p=s.player;
    p.hp=20;s.arcade!.toSpawn=1;s.arcade!.spawnTimer=999;
    const drop={id:'test-heal',x:p.x+60,y:p.y,r:12,kind:'loot' as const,life:20,inv:{size:1,slots:[{id:'bandage',qty:1}]}};
    s.drops=[drop];
    const wall=phys.addSolid(s,{kind:'wall',x:p.x+25,y:p.y-25,w:12,h:50});
    stepArcade(s,idle,SIM_DT);expect(p.hp).toBe(20);expect(s.drops).toHaveLength(1);
    phys.removeSolid(s,wall);stepArcade(s,idle,SIM_DT);
    expect(p.hp).toBeCloseTo(20+ITEMS.bandage.use!.heal!*1.45);expect(s.drops).toHaveLength(0);
  });
  it('heals once per cleared wave, XP level and kill',()=>{
    const s=newArcade(9,bonus({waveHeal:2,killHeal:3,levelHeal:2}));s.player.hp=20;
    s.arcade!.toSpawn=0;s.zombies=[];stepArcade(s,idle,SIM_DT);expect(s.player.hp).toBe(30);
    stepArcade(s,idle,SIM_DT);expect(s.player.hp).toBe(30);
    upgrades.grantXp(s,upgrades.xpNeed(1));expect(s.player.hp).toBe(36);
    s.ui=null;s.arcade!.run!.offer=null;s.arcade!.intermission=5;
    const z=zombies.spawn(s,'walker',s.player.x+400,s.player.y);zombies.damage(s,z,1e6,0);
    stepArcade(s,idle,SIM_DT);expect(s.player.hp).toBeCloseTo(36.6);
    stepArcade(s,idle,SIM_DT);expect(s.player.hp).toBeCloseTo(36.6);
  });
});
