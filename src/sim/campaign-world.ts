import type { Building, GameState, Rect, Vec } from './types';
import type { SiteId } from './campaign-data';
import { phys } from './core';
import * as world from './world';

export interface Site extends Vec { id: SiteId; name: string; building: string; rect: Rect }
export type Sites = Record<SiteId, Site>;
const overlaps = (a: Rect,b: Rect) => a.x < b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;

function landmark(s: GameState,id: SiteId,name: string,x: number,y: number,w: number,h: number): Building {
  const area={x:x-80,y:y-80,w:w+160,h:h+160};
  const removed=new Set(s.buildings.filter(b=>overlaps(area,b)).map(b=>b.id));
  s.buildings=s.buildings.filter(b=>!removed.has(b.id));
  for(const o of s.grid.all()) if(overlaps(area,o)||o.buildingId&&removed.has(o.buildingId)) phys.removeSolid(s,o);
  s.containers=s.containers.filter(c=>!overlaps(area,c)&&!removed.has(c.buildingId||''));
  s.decor=s.decor.filter(d=>!overlaps(area,d));
  const b:Building={id:`campaign-${id}`,name,kind:id==='haven'?'fire_station':'cabin',x,y,w,h,tier:0,doors:[{x:x+w/2-64,y:y+h-16,w:128,h:16}],rooms:[],floor:'concrete',wall:'brick',roof:'flat_tar'};
  s.buildings.push(b);
  const wall=(rx:number,ry:number,rw:number,rh:number)=>phys.addSolid(s,{x:rx,y:ry,w:rw,h:rh,kind:'wall',sub:'brick',buildingId:b.id,solid:true,blocksSight:true,blocksBullets:true});
  if(id==='haven'){
    // Two broken windows and a rear doorway are actual openings, aligned to the build grid.
    for(const [dx,width]of [[0,96],[160,128],[320,96],[480,96]])wall(x+dx,y,width,16);
    b.doors.push({x:x+288,y,w:32,h:16});
    for(const dx of [96,416])phys.addSolid(s,{x:x+dx,y,w:64,h:16,kind:'window',buildingId:b.id,solid:false,blocksSight:false,blocksBullets:false});
  }else wall(x,y,w,16);
  wall(x,y,16,h);wall(x+w-16,y,16,h);wall(x,y+h-16,w/2-64,16);wall(x+w/2+64,y+h-16,w/2-64,16);
  s.decor.push({kind:'lot',sub:'concrete',...area});
  return b;
}

/** Additional landmarks are deterministic and installed only for campaign saves. */
export function prepare(s:GameState):Sites {
  if(s._campaignSites) return s._campaignSites as Sites;
  const haven=landmark(s,'haven','Bellwether Fire Dept. Station 3',7808,14336,576,416);
  const hardware=landmark(s,'hardware','Bellwether Hardware',7104,14336,352,288);
  const grocery=landmark(s,'grocery','Shuttered Grocery',8704,14336,352,288);
  hardware.kind=grocery.kind='store';
  const ridge=landmark(s,'ridge','North Ridge Relay',7808,448,512,352);
  const fallback=landmark(s,'fallback','Ranger Station — Fallback Shelter',14272,7040,352,288);
  const highway=landmark(s,'highway','Highway Service Crossing',14272,10304,384,288);
  // North Ridge is a distinct wilderness district joined to Bellwether by its service road.
  const road={x:8016,y:800,w:160,h:1200,dir:'v' as const,lanes:1,sidewalk:0,kind:'dirt' as const};
  for(const o of s.grid.all()) if(overlaps(road,o)&&!o.buildingId) phys.removeSolid(s,o);
  s.roads.push(road);
  s.decor.push({kind:'lot',sub:'water',x:8500,y:320,w:1000,h:1060});
  // Water has a collision boundary; its shoreline is not a walkable shortcut.
  for(const o of s.grid.all())if(overlaps({x:8500,y:320,w:1000,h:1060},o)&&!o.buildingId)phys.removeSolid(s,o);
  phys.addSolid(s,{x:8500,y:320,w:1000,h:1060,kind:'rock',sub:'reservoir',campaignArt:true,solid:true,blocksSight:false,blocksBullets:false});
  s.pois.push({x:9000,y:600,name:'North Ridge Reservoir',kind:'district'});
  const used=new Set([haven.id,ridge.id,fallback.id,highway.id,hardware.id,grocery.id]);
  const pick=(kind:string,near:Vec,sub?:string)=>{
    let list=s.buildings.filter(b=>!used.has(b.id)&&b.kind===kind&&(!sub||(b as Building&{sub?:string}).sub===sub));
    if(!list.length) list=s.buildings.filter(b=>!used.has(b.id)&&b.kind===kind);
    if(!list.length) list=s.buildings.filter(b=>!used.has(b.id));
    list.sort((a,b)=>Math.hypot(a.x-near.x,a.y-near.y)-Math.hypot(b.x-near.x,b.y-near.y));
    const b=list[0];if(!b)throw new Error(`Campaign landmark missing: ${kind}`);used.add(b.id);return b;
  };
  const depot=pick('warehouse',world.meta(s).industrial),comms=pick('office',world.meta(s).downtown);
  const buildings:Record<SiteId,Building>={haven,ridge,fallback,highway,hardware,grocery,depot,comms,hospital:pick('hospital',haven),school:pick('school',haven),fuel:pick('gas_station',depot),checkpoint:pick('military',world.meta(s).baseRect)};
  const names:Record<SiteId,string>={haven:'Haven • Station 3',hardware:'Bellwether Hardware',grocery:'Shuttered Grocery',hospital:'Mercy Emergency Wing',school:'School Survivor Camp',depot:'Bellwether Public Works',fuel:'Reserve Fuel Station',comms:'Emergency Communications',ridge:'North Ridge Relay',checkpoint:'Evacuation Checkpoint',highway:'Highway Service Crossing',fallback:'Fallback Shelter'};
  const sites={} as Sites;
  for(const id of Object.keys(buildings) as SiteId[]) {
    const b=buildings[id];b.name=names[id];
    // Use a reachable point just inside a real door, never an arbitrary furniture-filled center.
    const d=b.doors[0];let point:Vec|undefined;
    if(d){const cx=d.x+d.w/2,cy=d.y+d.h/2;
      for(let r=36;r<=100&&!point;r+=16) for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const q={x:cx+dx*r,y:cy+dy*r};
        if(q.x>b.x+20&&q.x<b.x+b.w-20&&q.y>b.y+20&&q.y<b.y+b.h-20&&phys.isFree(s,q.x,q.y,18)){point=q;break;}
      }
    }
    if(!point)for(let y=b.y+40;y<b.y+b.h-30&&!point;y+=32)for(let x=b.x+40;x<b.x+b.w-30;x+=32)if(phys.isFree(s,x,y,18)){point={x,y};break;}
    if(!point)throw new Error(`No campaign interaction space at ${id}`);
    if(id!=='haven'){
      // Retrieval markers belong inside the landmark, so searching it is an expedition rather than a doorstep click.
      let best=Infinity;
      for(let y=b.y+56;y<b.y+b.h-48;y+=32)for(let x=b.x+56;x<b.x+b.w-48;x+=32){const d=Math.hypot(x-(b.x+b.w/2),y-(b.y+b.h/2));if(d<best&&phys.isFree(s,x,y,20)){point={x,y};best=d;}}
    }
    sites[id]={id,name:names[id],building:b.id,rect:{x:b.x,y:b.y,w:b.w,h:b.h},...point};
    const poi=s.pois.find(p=>p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h);if(poi)poi.name=names[id];
  }
  // Extend the generator's lookup for the new buildings and discard removed ones.
  const m=world.meta(s);m.bgrid=Array.from({length:m.bcols*m.brows},()=>null);
  for(const b of s.buildings) for(let y=Math.floor(b.y/256);y<=Math.floor((b.y+b.h)/256);y++)for(let x=Math.floor(b.x/256);x<=Math.floor((b.x+b.w)/256);x++)(m.bgrid[y*m.bcols+x]??=[]).push(b);
  s._campaignSites=sites;
  const supplies=(b:Building,contents:{id:string;qty:number}[])=>{
    const c={id:`campaign-crate-${b.id}`,kind:'crate',name:'Emergency supplies',x:b.x+35,y:b.y+35,w:40,h:32,tier:0,buildingId:b.id,searched:false,inv:{size:12,slots:Array.from({length:12},(_,i)=>contents[i]||null)}};
    s.containers.push(c);const solid=phys.addSolid(s,{x:c.x,y:c.y,w:c.w,h:c.h,kind:'furniture',sub:'crate',buildingId:b.id,solid:true,blocksSight:false,blocksBullets:true,container:c});Object.defineProperty(c,'_solid',{value:solid,configurable:true,writable:true});
  };
  supplies(hardware,[{id:'wood',qty:20},{id:'nails',qty:12},{id:'scrap',qty:12},{id:'cloth',qty:10}]);
  supplies(grocery,[{id:'painkillers',qty:1},{id:'canned_food',qty:3},{id:'water_bottle',qty:3}]);
  // Permanent furniture reserves real space in Haven; new art is drawn separately from ground chunks.
  for(const [dx,dy,w,h]of [[60,166,150,58],[330,34,66,42],[445,38,77,44]])phys.addSolid(s,{x:haven.x+dx,y:haven.y+dy,w,h,kind:'furniture',sub:'campaign_fixture',campaignArt:true,buildingId:haven.id,solid:true,blocksSight:false,blocksBullets:true});
  const street={x:6900,y:14880,w:2400,h:96,dir:'h' as const,lanes:2,sidewalk:20,kind:'street' as const};
  const drive={x:8480,y:13900,w:100,h:1076,dir:'v' as const,lanes:1,sidewalk:12,kind:'street' as const};
  for(const road of [street,drive]){for(const o of s.grid.all())if(overlaps(road,o)&&!o.buildingId)phys.removeSolid(s,o);s.roads.push(road);}
  s.pois.push({x:8000,y:15120,name:'Bellwether South / Haven',kind:'district'});
  return sites;
}

export function sites(s:GameState):Sites|null{return s.campaign?(s._campaignSites as Sites||prepare(s)):null;}
export function contains(rect:Rect,p:Vec,pad=0){return p.x>=rect.x-pad&&p.x<=rect.x+rect.w+pad&&p.y>=rect.y-pad&&p.y<=rect.y+rect.h+pad;}
