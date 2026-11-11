import { describe,it,expect,beforeEach } from 'vitest';
import * as game from '../src/sim/game';
import * as campaign from '../src/sim/campaign';
import * as saves from '../src/sim/save';
import * as base from '../src/sim/base';
import * as inventory from '../src/sim/inventory';
import * as zombies from '../src/sim/zombies';
import * as arcade from '../src/sim/arcade';
import * as world from '../src/sim/world';
import { newState,phys } from '../src/sim/core';
import { scenery } from '../src/sim/campaign-scenery';
import type { GameState } from '../src/sim/types';
import type { Objective } from '../src/sim/campaign-data';
import * as convoy from '../src/sim/campaign-convoy';
import { validCloudSave } from '../src/sim/save-validation';
import * as pathing from '../src/sim/pathing';
import { readFileSync,existsSync } from 'node:fs';

beforeEach(()=>{const data=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)}});});
function at(s:GameState,o:Objective){const site=campaign.sites(s)![o.site];s.player.x=s.player.prevX=site.x;s.player.y=s.player.prevY=site.y;s.zombies=[];}
function build(s:GameState,o:Objective){
  const h=campaign.sites(s)!.haven.rect;for(const [id,n]of Object.entries(base.STRUCTURES[o.build!].cost))inventory.add(s.player.inv,id,n*(o.count||1));
  let made=0;const targets=campaign.buildTargets(s,o);
  if(targets.length){for(const t of targets)if(base.place(s,o.build!,t.x,t.y))made++;}
  else for(let y=h.y+32;y<h.y+h.h-64&&made<(o.count||1);y+=32)for(let x=h.x+32;x<h.x+h.w-64&&made<(o.count||1);x+=32)if(base.place(s,o.build!,x,y))made++;
  expect(made).toBe(o.count||1);
}
function defend(s:GameState){
  const start=s.campaign!.encounter!.id;
  for(let i=0;i<450&&s.campaign!.encounter;i++){
    campaign.update(s,.5);
    for(const z of s.zombies.filter(z=>!z.dead))zombies.damage(s,z,1e6,0);
    s.zombies=s.zombies.filter(z=>!z.dead);
  }
  expect(s.campaign!.encounter,`encounter ${start} finishes`).toBeNull();expect(campaign.has(s,start)).toBe(true);
}
function complete(s:GameState,o:Objective){
  if(s.campaign?.trip)expect(campaign.rideConvoy(s)).toBe(true);
  at(s,o);if(o.id==='signal')s.clock.t=440;
  if(o.cost)for(const [id,n]of Object.entries(o.cost))inventory.add(s.player.inv,id,n);
  if(o.kind==='build')build(s,o);
  // Simulate the end of the escort at the actual Haven threshold, then let the resident system acknowledge arrival.
  if(o.id==='home'||o.id==='blackout'){for(const r of s.campaign!.residents)if(r.following){r.x=s.player.x;r.y=s.player.y;}campaign.update(s,.1);}
  expect(campaign.reason(s,o),o.id).toBeNull();expect(campaign.act(s,o.id),o.id).toBe(true);
  if(o.kind==='defend')defend(s);
}
describe('Haven campaign',()=>{
  it('places reachable landmarks deterministically and keeps arcade independent',()=>{
    const a=game.newGame(42),b=game.newGame(42);expect(campaign.sites(a)).toEqual(campaign.sites(b));
    for(const site of Object.values(campaign.sites(a)!)){expect(phys.isFree(a,site.x,site.y,14),site.id).toBe(true);expect(world.buildingAt(a,site.x,site.y)?.id,site.id).toBe(site.building);}
    const arc=arcade.newArcade(42);expect(arc.campaign).toBeUndefined();expect(campaign.available(arc)).toEqual([]);expect(scenery(arc)).toEqual([]);expect(campaign.act(arc,'meet')).toBe(false);
  });
  it('enforces location, prerequisites, resource costs, and one-time rewards',()=>{
    const s=game.newGame(44);expect(campaign.act(s,'power')).toBe(false);expect(campaign.act(s,'meet')).toBe(false);
    complete(s,campaign.OBJECTIVES[0]);expect(campaign.act(s,'meet')).toBe(false);
    complete(s,campaign.OBJECTIVES.find(o=>o.id==='clear')!);const med=campaign.OBJECTIVES.find(o=>o.id==='medicine')!;at(s,med);
    expect(campaign.act(s,'medicine')).toBe(false);inventory.add(s.player.inv,'painkillers',1);expect(campaign.act(s,'medicine')).toBe(true);expect(inventory.count(s.player.inv,'painkillers')).toBe(0);
  });
  it('plays all six chapters, retains preparation effects and enters free play',()=>{
    const s=game.newGame(2026);s.player.inv.size=128;s.player.inv.slots=Array(128).fill(null);
    for(const o of campaign.OBJECTIVES){complete(s,o);if(s.campaign!.chapter<4)expect(campaign.available(s).some(o=>o.id==='signal')).toBe(false);}
    expect(s.campaign!.completed).toBe(true);expect(s.campaign!.residents.filter(r=>!r.home)).toEqual([]);expect(s.campaign!.residents).toHaveLength(14);
    expect(campaign.available(s)).toEqual([]);expect(s.campaign!.log.some(l=>l.text.includes('We’re listening'))).toBe(true);
    expect(scenery(s).some(p=>p.frame==='haven_sign')).toBe(true);
    expect(saves.deserialize(saves.serialize(s))?.campaign?.completed).toBe(true);
  });
  it('persists an unfinished defense without granting kills for despawn or leaving',()=>{
    const s=game.newGame(13);complete(s,campaign.OBJECTIVES[0]);const clear=campaign.OBJECTIVES.find(o=>o.id==='clear')!;at(s,clear);campaign.act(s,'clear');campaign.update(s,3);
    const z=s.zombies[0];expect(z).toBeDefined();zombies.damage(s,z,10000,0);
    const data=saves.deserialize(saves.serialize(s))!;const resumed=newState(13);world.generate(resumed);expect(saves.apply(resumed,data)).toBe(true);
    expect(resumed.campaign!.encounter!.kills).toBe(1);const remaining=resumed.campaign!.encounter!.remaining;resumed.player.x=100;resumed.player.y=100;campaign.update(resumed,60);expect(resumed.campaign!.encounter!.remaining).toBe(remaining);
    at(resumed,clear);defend(resumed);expect(saves.deserialize(saves.serialize(resumed))).not.toBeNull();
  });
  it('keeps old saves valid and rejects malformed campaign data',()=>{
    const s=game.newGame(7),data=JSON.parse(saves.serialize(s));delete data.campaign;expect(saves.deserialize(JSON.stringify(data))).not.toBeNull();
    data.campaign={version:1,chapter:99};expect(saves.deserialize(JSON.stringify(data))).toBeNull();
  });
  it('requires a real escort arrival and stops repeated daily rewards',()=>{
    const s=game.newGame(8),c=s.campaign!,h=campaign.sites(s)!.haven;
    const j=c.residents.find(r=>r.id==='june')!;j.following=true;s.player.x=j.x+200;s.player.y=j.y;
    const before=j.x;campaign.update(s,.1);expect(j.x).not.toBe(before);expect(j.home).toBe(false);
    j.x=h.x;j.y=h.y;s.player.x=h.x;s.player.y=h.y;campaign.update(s,.1);expect(j.home).toBe(true);expect(j.following).toBe(false);
    c.done.push('water');s.clock.day++;expect(campaign.service(s,'supplies')).toBe(true);expect(campaign.service(s,'supplies')).toBe(false);
  });
  it('drives a collision-free convoy route, saves it, and supports riding between encounters',()=>{
    const s=game.newGame(42),map=campaign.sites(s)!;s.campaign!.bus={x:map.ridge.x,y:map.ridge.rect.y+map.ridge.rect.h+100};
    expect(convoy.start(s,'highway')).toBe(true);const trip=s.campaign!.trip!;expect(trip.path.length).toBeGreaterThan(20);
    for(const p of trip.path)expect(phys.isFree(s,p.x,p.y,25)).toBe(true);
    const from={...s.campaign!.bus!};convoy.update(s,1);expect(s.campaign!.bus).not.toEqual(from);
    const data=saves.deserialize(saves.serialize(s))!;expect(validCloudSave(JSON.parse(saves.serialize(s)))).toBe(true);
    const restored=newState(42);world.generate(restored);expect(saves.apply(restored,data)).toBe(true);expect(restored.campaign!.trip).toEqual(s.campaign!.trip);
    expect(campaign.rideConvoy(restored)).toBe(true);expect(restored.campaign!.trip).toBeNull();expect(phys.isFree(restored,restored.player.x,restored.player.y,14)).toBe(true);
  });
  it('optional preparation reduces pursuit and launches only at the player’s request',()=>{
    const s=game.newGame(20),c=s.campaign!;c.chapter=5;c.done=campaign.OBJECTIVES.filter(o=>o.chapter<5||o.chapter===5&&!o.optional&&o.id!=='launch').map(o=>o.id);
    expect(c.chapter).toBe(5);expect(campaign.available(s).some(o=>o.id==='launch')).toBe(true);
    const launch=campaign.OBJECTIVES.find(o=>o.id==='launch')!;at(s,launch);campaign.act(s,'launch');expect(c.chapter).toBe(6);
    c.done.push('boarding');const crossing=campaign.OBJECTIVES.find(o=>o.id==='crossing')!;at(s,crossing);campaign.act(s,'crossing');const unprepared=c.encounter!.total;c.encounter=null;c.done.push('quiet_road');campaign.act(s,'crossing');expect(c.encounter!.total).toBeLessThan(unprepared);
  });
  it('rejects hostile campaign and convoy save payloads at local and cloud boundaries',()=>{
    const s=game.newGame(3),data=JSON.parse(saves.serialize(s));data.campaign.trip={to:'haven',path:[{x:Infinity,y:2}],index:0};
    expect(saves.deserialize(JSON.stringify(data))).toBeNull();expect(validCloudSave(data)).toBe(false);
    data.campaign.trip=null;data.campaign.residents.push({...data.campaign.residents[0]});expect(validCloudSave(data)).toBe(false);
  });
  it('routes civilians around furniture and solid defenses without treating them as breakable shortcuts',()=>{
    const s=newState(4);const wall={id:'test-defense',type:'wood_wall',x:320,y:128,w:16,h:320,hp:1,maxHp:320,rot:0 as const};
    phys.addSolid(s,{...wall,kind:'structure',structure:wall,solid:true,blocksSight:false,blocksBullets:true});
    const body={x:200,y:280,r:10};for(let i=0;i<500&&Math.hypot(body.x-500,body.y-280)>15;i++){
      pathing.tick(s,.05);const step=pathing.step(pathing.field(s,'civilian-test',500,280,true),body.x,body.y);expect(step).not.toBeNull();body.x+=step!.x*3;body.y+=step!.y*3;phys.collideCircle(s,body);
    }
    expect(Math.hypot(body.x-500,body.y-280)).toBeLessThan(20);expect(wall.hp).toBe(1);
  });
  it('ships every overhead prop and cargo icon referenced by the campaign',()=>{
    const s=game.newGame(19),atlas=JSON.parse(readFileSync(new URL('../public/assets/campaign_props.json',import.meta.url),'utf8'));
    for(let chapter=1;chapter<=6;chapter++){
      s.campaign!.chapter=chapter;s.campaign!.done=campaign.OBJECTIVES.filter(o=>o.chapter<=chapter).map(o=>o.id);s.campaign!.fuel=1000;
      for(const prop of scenery(s))expect(atlas.frames[prop.frame],prop.frame).toBeDefined();
    }
    for(const o of campaign.OBJECTIVES)if(o.item)expect(existsSync(new URL(`../public/assets/campaign/icon-${o.item}.png`,import.meta.url)),o.item).toBe(true);
  });
});
