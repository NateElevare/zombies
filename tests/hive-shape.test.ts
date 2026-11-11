import { beforeEach, describe, expect, it } from 'vitest';
import { hiveShape, warrensShape } from '../src/sim/hive-shape';
import { isFloor, zoneAt } from '../src/sim/hive-world';
import { hiveWallRibbons, warrensWallRibbons } from '../src/render/hive-materials';
import * as road from '../src/sim/road';
import { phys } from '../src/sim/core';

beforeEach(()=>{
  const store=new Map<string,string>();
  (globalThis as any).localStorage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)};
});
function map(){road.devUnlockHiveBelow();return road.newHiveBelow()!;}
describe('rounded Hive boundaries',()=>{
  it('curves the old steps while keeping floors, collision, and all other zones consistent',()=>{
    const s=map(),h=s.road!.world.hive!,shape=warrensShape(h);
    let changed=0;
    for(const c of shape.contours)for(let i=0;i<c.points.length;i+=13){
      const p=c.points[i];
      for(const dx of [-15,15])for(const dy of [-15,15]){
        const x=p.x+dx,y=p.y+dy,k=Math.floor(y/h.tile)*h.n+Math.floor(x/h.tile);
        if(h.zone[k]!==1)continue;
        const floor=isFloor(h,x,y);
        if(floor!==!!h.floor[k])changed++;
        let wall=false;s.grid.each(x-.1,y-.1,.2,.2,o=>{if(o.sub==='rock'&&x>o.x&&x<o.x+o.w&&y>o.y&&y<o.y+o.h)wall=true;});
        expect(wall,`floor/collider mismatch ${x},${y}`).toBe(!floor);
      }
    }
    expect(changed).toBeGreaterThan(100);
    for(let k=0;k<h.floor.length;k++)if(h.zone[k]!==1){const x=(k%h.n+.5)*h.tile,y=(Math.floor(k/h.n)+.5)*h.tile;expect(shape.isFloor(x,y)).toBe(!!h.floor[k]);}
    const art=warrensWallRibbons(h);
    expect(art.filter(p=>Math.abs(Math.sin(p.angle*2))>.35).length).toBeGreaterThan(art.length*.2);
    expect(warrensShape(h)).toBe(shape);
  });
  it('preserves player-width clearance along every sector and connecting mission-route segment',()=>{
    const s=map(),h=s.road!.world.hive!;
    let checked=0;
    for(let i=1;i<h.route.length;i++){
      const a=h.route[i-1],b=h.route[i];
      const x=(a%h.n+.5)*h.tile,y=(Math.floor(a/h.n)+.5)*h.tile,X=(b%h.n+.5)*h.tile,Y=(Math.floor(b/h.n)+.5)*h.tile;
      expect(phys.raycast(s,x,y,X,Y,18,o=>o.sub==='rock'),`blocked route ${a} -> ${b}`).toBeNull();checked++;
    }
    expect(checked).toBeGreaterThan(400);
    for(let z=1;z<=7;z++)for(const p of [...h.burrows[z],...h.eggs[z],...h.nooks[z],h.arenas[z]])expect(isFloor(h,p.x,p.y),`zone ${z} fixture`).toBe(true);
  });
  it('rounds every remaining sector with matching floor and collision boundaries',()=>{
    const s=map(),h=s.road!.world.hive!;
    for(let z=2;z<=8;z++){
      const shape=hiveShape(h,z);let changed=0;
      for(const c of shape.contours)for(let i=0;i<c.points.length;i+=17){
        const p=c.points[i];
        for(const dx of [-15,15])for(const dy of [-15,15]){
          const x=p.x+dx,y=p.y+dy,k=Math.floor(y/h.tile)*h.n+Math.floor(x/h.tile);if(zoneAt(h,x,y)!==z)continue;
          const floor=isFloor(h,x,y);if(floor!==!!h.floor[k])changed++;
          let wall=false;s.grid.each(x-.1,y-.1,.2,.2,o=>{if(o.sub==='rock'&&x>o.x&&x<o.x+o.w&&y>o.y&&y<o.y+o.h)wall=true;});
          expect(wall,`zone ${z} floor/collider ${x},${y}`).toBe(!floor);
        }
      }
      expect(changed,`zone ${z} must change the old stepped boundary`).toBeGreaterThan(0);
      const art=hiveWallRibbons(h,z);
      expect(art.filter(p=>Math.abs(Math.sin(p.angle*2))>.35).length,`zone ${z} curved tangents`).toBeGreaterThan(art.length*.15);
      expect(hiveShape(h,z)).toBe(shape);
    }
  },15000);
  it('keeps the concrete dam straight and all seals on their original openings',()=>{
    const s=map(),h=s.road!.world.hive!,d=h.dam;
    const raw=(x:number,y:number)=>!!h.floor[Math.floor(y/h.tile)*h.n+Math.floor(x/h.tile)];
    for(let y=d.y-70;y<=d.y+d.h+70;y+=20)for(let x=d.x-70;x<=d.x+d.w+70;x+=20)expect(isFloor(h,x,y)).toBe(raw(x,y));
    for(const p of h.seals){
      for(const offset of [-20,0,20])expect(isFloor(h,p.x+offset,p.y)).toBe(raw(p.x+offset,p.y));
    }
    for(const p of hiveWallRibbons(h,8))expect(p.x>d.x&&p.x<d.x+d.w&&p.y>d.y&&p.y<d.y+d.h).toBe(false);
  });
});
