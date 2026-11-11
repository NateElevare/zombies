import type { GameState, Vec } from './types';
import { phys, toast, sound } from './core';
import { CHAPTERS, CAST, OBJECTIVES, type NpcId, type Objective } from './campaign-data';
import { prepare, sites, contains } from './campaign-world';
import * as inventory from './inventory';
import * as zombies from './zombies';
import * as world from './world';
import * as pathing from './pathing';
import * as game from './game';
import * as loot from './loot';
import * as explore from './explore';
import * as convoy from './campaign-convoy';
import * as base from './base';
export { CHAPTERS, CAST, OBJECTIVES, sites };
export { ride as rideConvoy } from './campaign-convoy';
export { validCampaign } from './campaign-save';

export interface Resident extends Vec { id:string; look:string; name:string; home:boolean; following:boolean; angle:number; moving:boolean }
export interface CampaignState {
  version:1; chapter:number; done:string[]; cargo:string[]; residents:Resident[];
  fuel:number; supplyDay:number; aidDay:number; radioDay:number; completed:boolean;
  encounter:null|{id:string; remaining:number; total:number; kills:number; spawnTimer:number};
  log:{speaker:NpcId; text:string}[]; tracked:string|null; bus:Vec|null;
  trip?:convoy.ConvoyTrip|null; busAngle?:number;
}
export function init(s:GameState,moveSpawn=true) {
  if(s.mode!=='survival'||s.campaign)return;
  const map=prepare(s),h=map.haven;
  s.campaign={version:1,chapter:1,done:[],cargo:[],residents:[],fuel:0,supplyDay:s.clock.day,aidDay:0,radioDay:0,completed:false,encounter:null,log:[],tracked:'meet',bus:null};
  for(const [id,dx,dy] of [['mara',395,180],['eli',440,190]] as const) s.campaign.residents.push({id,look:id,name:CAST[id].name,x:h.rect.x+dx,y:h.rect.y+dy,home:true,following:false,angle:0,moving:false});
  const g=map.grocery;s.campaign.residents.push({id:'june',look:'june',name:CAST.june.name,x:g.x,y:g.y,home:false,following:false,angle:0,moving:false});
  if(moveSpawn){s.spawnPoint={x:h.rect.x+h.rect.w/2,y:h.rect.y+h.rect.h+72};}
  speak(s,'mara','Station 3. A cold night is coming. Find us inside the fire station.');
}
export function has(s:GameState,id:string){return !!s.campaign?.done.includes(id);}
export function available(s:GameState):Objective[]{const c=s.campaign;if(!c)return [];return OBJECTIVES.filter(o=>o.chapter===c.chapter&&!c.done.includes(o.id)&&(!o.requires||o.requires.every(id=>c.done.includes(id))));}
export function tracked(s:GameState){const list=available(s);return list.find(o=>o.id===s.campaign?.tracked)||list.find(o=>!o.optional)||list[0];}
export function track(s:GameState,id:string){if(available(s).some(o=>o.id===id))s.campaign!.tracked=id;}
export function speak(s:GameState,speaker:NpcId,text:string){const c=s.campaign;if(!c)return;c.log.push({speaker,text});if(c.log.length>60)c.log.shift();toast(s,`${CAST[speaker].name.split(' ')[0]}: ${text}`,'#e5c890');}
export function near(s:GameState,p:Vec,r=105){return Math.hypot(s.player.x-p.x,s.player.y-p.y)<=r&&phys.canReach(s,s.player.x,s.player.y,p);}
export function atHome(s:GameState){const h=sites(s)?.haven;return !!h&&contains(h.rect,s.player,80);}
export function buildTargets(s:GameState,o:Objective):Vec[]{const h=sites(s)!.haven.rect;return o.id==='door'?[{x:h.x+288,y:h.y}]:o.id==='windows'?[{x:h.x+96,y:h.y},{x:h.x+416,y:h.y}]:[];}
function built(s:GameState,o:Objective){const h=sites(s)!.haven.rect,targets=buildTargets(s,o);return s.structures.filter(b=>!b.dead&&b.type===o.build&&(targets.length?targets.some(t=>b.x===t.x&&b.y===t.y)&&b.rot===0:contains(h,{x:b.x+b.w/2,y:b.y+b.h/2}))).length;}
export function reason(s:GameState,o:Objective):string|null {
  if(s.mode!=='survival'||!s.campaign||s.player.dead||s.screen!=='playing')return 'Unavailable';
  if(!available(s).some(q=>q.id===o.id))return 'Complete the preceding objectives first';
  if(s.campaign.encounter)return 'Finish the active defense first';
  if(s.campaign.trip)return 'The convoy is traveling. Ride with it or meet it at the next stop.';
  if(o.site==='haven'?!contains(sites(s)!.haven.rect,s.player):!near(s,sites(s)![o.site]))return `Travel to ${sites(s)![o.site].name}`;
  if(o.id==='signal'&&!game.isNight(s))return 'Return to the radio after dark';
  if((o.id==='signal'||o.id==='contact')&&s.campaign.fuel<=0)return 'Refuel the generator using Eli’s community service';
  if(o.id==='home'&&s.campaign.residents.some(r=>r.following))return 'Wait for June to reach Haven';
  if(o.id==='blackout'&&s.campaign.residents.some(r=>r.following))return 'Bring the school survivors home first';
  if(o.kind==='build'&&built(s,o)<(o.count||1))return `Build ${o.count||1} ${o.build!.replaceAll('_',' ')} at Haven (${built(s,o)}/${o.count||1})`;
  if(o.cost&&!inventory.has(s.player.inv,o.cost))return 'Bring '+Object.entries(o.cost).map(([k,v])=>`${v} ${k.replaceAll('_',' ')}`).join(', ');
  if(o.kind!=='defend'&&s.zombies.some(z=>!z.dead&&Math.hypot(z.x-sites(s)![o.site].x,z.y-sites(s)![o.site].y)<180))return 'Clear nearby infected first';
  return null;
}
function grant(s:GameState,items:Record<string,number>){const extra=[];for(const [id,qty]of Object.entries(items)){const left=inventory.add(s.player.inv,id,qty,undefined,s);if(left)extra.push({id,qty:left});}if(extra.length)loot.makeDrop(s,s.player.x,s.player.y,extra);}
function resident(s:GameState,id:string,look:string,name:string,p:Vec,following=false){s.campaign!.residents.push({id,look,name,x:p.x,y:p.y,home:false,following,angle:0,moving:false});}
function finish(s:GameState,o:Objective){
  const c=s.campaign!;if(c.done.includes(o.id))return;c.done.push(o.id);if(o.item&&!c.cargo.includes(o.item))c.cargo.push(o.item);
  if(o.id==='hardware')grant(s,{wood:44,nails:14,scrap:12,cloth:10});
  if(o.id==='june'){const j=c.residents.find(r=>r.id==='june')!;j.following=true;grant(s,{painkillers:1,canned_food:2,water_bottle:2});}
  if(o.id==='school')for(let i=0;i<3;i++)resident(s,`school-${i}`,`resident${i}`,['Ada','Leon','Sam'][i],sites(s)!.school,true);
  if(o.id==='power'){c.fuel=1200;s.clock.t=400;sound(s,'generator');}
  if(o.id==='signal'||o.id==='contact')sound(s,'radio');
  if(o.id==='contact'){explore.reveal(s,sites(s)!.ridge.x,sites(s)!.ridge.y,1000);resident(s,'ruth','ruth',CAST.ruth.name,sites(s)!.ridge);}
  if(o.id==='ridge')for(let i=0;i<7;i++)resident(s,`ridge-${i}`,`resident${i%6}`,['Alma','Ben','Cora','Dev','Esther','Finn','Gus'][i],{x:sites(s)!.ridge.x-140+(i%4)*56,y:sites(s)!.ridge.y-80-Math.floor(i/4)*64});
  if(o.id==='bus')c.bus={x:sites(s)!.checkpoint.x,y:sites(s)!.checkpoint.y+120};
  if(o.id==='launch')c.bus={x:sites(s)!.ridge.rect.x+sites(s)!.ridge.rect.w/2+100,y:sites(s)!.ridge.rect.y+sites(s)!.ridge.rect.h+80};
  if(o.id==='neighbors')grant(s,{ammo_9mm:60,ammo_12g:12});
  if(o.id==='boarding'||o.id==='crossing'||o.id==='shelter'){
    sound(s,'bus');
    const to=o.id==='boarding'?'highway':o.id==='crossing'?'fallback':'haven';
    if(!convoy.start(s,to)){const dest=sites(s)![to];c.bus={x:dest.x,y:dest.rect.y+dest.rect.h+100};speak(s,'eli','The road is blocked. We will take the outer service track and meet you at the next shelter.');}
  }
  if(o.id==='fallback'){
    // Two recoverable defense lines. They use normal structure HP, repairs and zombie path costs.
    const h=sites(s)!.haven.rect,added:import('./types').Structure[]=[];
    const add=(id:string,type:string,x:number,y:number)=>{if(!base.canPlace(s,type,x,y))return;const d=base.STRUCTURES[type];added.push({id,type,x,y,w:d.w,h:d.h,rot:0,hp:d.hp,maxHp:d.hp});};
    for(let i=0;i<4;i++)add(`campaign-main-${i}`,'wood_door',h.x+224+i*32,h.y+h.h-16);
    for(let i=0;i<3;i++)add(`campaign-inner-${i}`,'wood_wall',h.x+320+i*64,h.y+256);
    add('campaign-inner-door','wood_door',h.x+288,h.y+256);
    base.restore(s,[...s.structures,...added]);
  }
  if(o.id==='finale'){
    c.completed=true;c.fuel=Math.max(c.fuel,1200);if(game.isNight(s)){s.clock.day++;s.stats.daysSurvived++;}s.clock.t=20;
    for(const r of c.residents)if(r.id==='ruth'||r.id.startsWith('ridge-')){r.home=true;r.following=false;const h=sites(s)!.haven;r.x=h.rect.x+80+(c.residents.indexOf(r)%7)*55;r.y=h.rect.y+100+Math.floor(c.residents.indexOf(r)/7)*65;}
    speak(s,'ruth','This is Haven, Bellwether. We have shelter. We’re listening.');
  }
  speak(s,o.speaker,o.after);
  const required=OBJECTIVES.filter(q=>q.chapter===c.chapter&&!q.optional);
  if(!c.completed&&required.every(q=>c.done.includes(q.id))){c.chapter=Math.min(6,c.chapter+1);toast(s,`CHAPTER ${c.chapter} — ${CHAPTERS[c.chapter-1].title}`,'#f4d48a');sound(s,'haven');}
  c.tracked=available(s).find(q=>!q.optional)?.id||null;game.save(s);
}
export function act(s:GameState,id:string):boolean {
  const o=OBJECTIVES.find(q=>q.id===id);if(!o)return false;const why=reason(s,o);if(why){toast(s,why,'#e5bc80');return false;}
  if(o.cost)for(const [k,n]of Object.entries(o.cost))inventory.remove(s.player.inv,k,n);
  if(o.kind==='defend'){
    const total=o.id==='clear'?4:o.id==='finale'?(has(s,'quiet_road')?22:32):o.id==='crossing'?(has(s,'quiet_road')?12:20):Math.round(o.duration!/5);
    s.campaign!.encounter={id:o.id,remaining:o.duration!,total,kills:0,spawnTimer:0};
    if(o.id==='finale'){s.clock.t=490;s.clock.day=Math.max(s.clock.day,2);}
    if(o.id==='blackout')s.clock.t=440;
    speak(s,o.speaker,o.before);s.ui=null;s.paused=false;game.save(s);return true;
  }
  finish(s,o);return true;
}
export function open(s:GameState){if(s.mode==='survival'&&s.campaign&&!s.player.dead){s.ui='campaign';s.search=null;}}
export function nearest(s:GameState):{name:string;x:number;y:number}|null {
  if(!s.campaign)return null;
  for(const r of s.campaign.residents)if(near(s,r,65))return r;
  for(const o of available(s)){const p=sites(s)![o.site];if(near(s,p,80))return p;}
  return null;
}
export function service(s:GameState,action:'heal'|'supplies'|'fuel'|'radio') {
  const c=s.campaign;if(!c||s.player.dead||!atHome(s)||s.zombies.some(z=>!z.dead&&Math.hypot(z.x-s.player.x,z.y-s.player.y)<220))return false;
  if(action==='heal'&&has(s,'infirmary')){s.player.hp=s.player.maxHp;s.player.bleeding=0;speak(s,'mara','Clean dressing. Take a breath before you go back out.');}
  else if(action==='supplies'&&has(s,'water')&&c.supplyDay<s.clock.day){grant(s,{bandage:2,water_bottle:2,...(has(s,'power')?{canned_food:1}:{})});c.supplyDay=s.clock.day;}
  else if(action==='fuel'&&has(s,'power')&&inventory.has(s.player.inv,{chemicals:1,scrap:2})){inventory.remove(s.player.inv,'chemicals',1);inventory.remove(s.player.inv,'scrap',2);c.fuel=Math.min(2400,c.fuel+600);}
  else if(action==='radio'&&has(s,'contact')&&c.radioDay<s.clock.day&&inventory.has(s.player.inv,{bandage:2})){inventory.remove(s.player.inv,'bandage',2);grant(s,{ammo_9mm:36});c.radioDay=s.clock.day;speak(s,'ruth','Mill Creek confirms receipt. Their courier left ammunition at our cache.');}
  else return false;game.save(s);return true;
}

export function update(s:GameState,dt:number){
  const c=s.campaign;if(!c||s.mode!=='survival'||s.player.dead)return;
  const map=sites(s)!;
  convoy.update(s,dt);
  if(has(s,'power'))c.fuel=Math.max(0,c.fuel-dt);
  for(let i=0;i<c.residents.length;i++){
    const r=c.residents[i];r.moving=false;
    let goal:Vec|undefined;
    if(r.following){goal=s.player;if(contains(map.haven.rect,r,30)&&contains(map.haven.rect,s.player,30)){r.following=false;r.home=true;speak(s,r.id==='june'?'june':'mara',`${r.name} reached Haven.`);}}
    else if(r.home){const h=map.haven.rect;
      const duties:Record<string,Vec>={mara:{x:420,y:190},eli:has(s,'medicine')?{x:285,y:100}:{x:440,y:190},june:{x:365,y:100},ruth:{x:480,y:100}};
      const spot=duties[r.id]||{x:55+(i%7)*60,y:310-Math.floor(i/7)*55};goal={x:h.x+spot.x,y:h.y+spot.y};
    }
    if(goal){const d=Math.hypot(goal.x-r.x,goal.y-r.y);if(d>(r.following?55+(i%4)*24:10)&&d<1600){
      let vx=(goal.x-r.x)/d,vy=(goal.y-r.y)/d;
      if(!phys.canReach(s,r.x,r.y,goal)){const st=pathing.step(pathing.field(s,r.following?'campaign-follow':`resident-${i}`,goal.x,goal.y,true),r.x,r.y);if(st){vx=st.x;vy=st.y;}else continue;}
      const step=(r.following?(d>180?360:240):28)*dt,body={x:r.x+vx*step,y:r.y+vy*step,r:10};phys.collideCircle(s,body);r.moving=Math.hypot(body.x-r.x,body.y-r.y)>0.01;r.x=body.x;r.y=body.y;r.angle=Math.atan2(vy,vx);
    }}
  }
  const e=c.encounter;if(!e)return;
  const o=OBJECTIVES.find(o=>o.id===e.id)!;const target=map[o.site];
  // Abandoning a defense never advances its timer. Returning resumes it, including after a save.
  if(Math.hypot(s.player.x-target.x,s.player.y-target.y)>750)return;
  e.remaining=Math.max(0,e.remaining-dt);e.spawnTimer=Math.max(0,e.spawnTimer-dt);
  const live=s.zombies.filter(z=>!z.dead&&z.campaignEncounter===e.id);
  if(e.spawnTimer<=0&&live.length<6&&e.kills+live.length<e.total){
    const index=e.kills+live.length;
    const inside={x:target.rect.x+65+(index%4)*110,y:target.rect.y+80};
    const p=e.id==='clear'&&phys.isFree(s,inside.x,inside.y,16)?inside:world.randomSpawnPoint(s,target.x,target.y,230,400);
    if(p){const z=zombies.spawn(s,e.total>10&&e.kills%5===4?'runner':'walker',p.x,p.y,true);z.campaignEncounter=e.id;z.target={x:target.x,y:target.y};z.state='chase';e.spawnTimer=2.5;}
  }
  if(e.id==='finale'){
    // Residents help without replacing the player's defenses. Their cooldown is saved as supply progress.
    const interval=has(s,'extra_meds')?12:20;
    if(e.remaining<o.duration!-10&&Math.floor((e.remaining+dt)/interval)!==Math.floor(e.remaining/interval)){
      s.player.hp=Math.min(s.player.maxHp,s.player.hp+10);s.player.bleeding=0;
      const damaged=s.structures.find(b=>!b.dead&&b.hp<b.maxHp&&contains(map.haven.rect,{x:b.x,y:b.y},100));if(damaged)damaged.hp=Math.min(damaged.maxHp,damaged.hp+35);
      grant(s,{ammo_9mm:12});
    }
  }
  if(e.remaining<=0&&e.kills>=e.total){c.encounter=null;finish(s,o);}
}

