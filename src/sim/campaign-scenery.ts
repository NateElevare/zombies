import type { GameState } from './types';
import { sites } from './campaign-world';
export interface CampaignProp { id:string; frame:string; x:number;y:number;w:number;h:number; angle?:number; glow?:boolean }
/** Overhead props are a view of saved milestones; no second copy of progression. */
export function scenery(s:GameState):CampaignProp[]{
  const map=sites(s),c=s.campaign;if(!map||!c)return [];
  const done=(id:string)=>c.done.includes(id),power=done('power')&&c.fuel>0;
  const out:CampaignProp[]=[];
  const put=(id:string,frame:string,x:number,y:number,w:number,h:number,glow=false)=>out.push({id,frame,x,y,w,h,glow});
  const h=map.haven.rect;
  put('sign',done('power')?'haven_sign':'station_sign',h.x+h.w/2,h.y+h.h+16,300,56);
  put('engine','fire_engine_0',h.x+135,h.y+195,185,125);
  put('hose','hose_0',h.x+80,h.y+40,38,38);
  put('lantern',`lantern_${done('clear')?1:0}`,h.x+330,h.y+175,28,22,done('clear'));
  put('ledger',`ledger_${done('finale')?3:done('school')?2:0}`,h.x+365,h.y+55,34,26);
  put('radio',`radio_${done('contact')?2:power?1:0}`,h.x+485,h.y+60,72,48);
  put('rear-door',`rollup_${done('door')?0:2}`,h.x+304,h.y+8,32,18);
  if(done('infirmary')){put('medical',`infirmary_${done('finale')?2:0}`,h.x+460,h.y+145,76,48);put('iv','iv_0',h.x+510,h.y+145,20,20);}
  if(done('water'))put('tank','water_tank_0',h.x+h.w+55,h.y+130,100,90);
  if(done('workshop'))put('toolwall','tool_shelf_0',h.x+285,h.y+45,80,48);
  if(done('power')){
    put('generator',`generator_${power?1+Math.floor(s.time*4)%2:0}`,h.x+h.w+65,h.y+260,120,90);
    put('kitchen','kitchen_0',h.x+460,h.y+265,58,44);
    put('lights',`floodlight_${power?1:0}`,h.x+24,h.y+h.h-20,32,26,power);
    put('plants','plants_0',h.x+95,h.y+h.h+40,48,40);
  }
  if(done('school'))put('laundry','laundry_0',h.x+h.w+25,h.y+45,120,60);
  if(done('beds'))for(let i=0;i<4;i++)put(`bunks${i}`,'bunks_0',h.x+50+i*62,h.y+325,61,83);
  if(done('fallback')){
    put('inner',`inner_gate_${s.structures.some(b=>b.id==='campaign-inner-door'&&!b.dead)?0:2}`,h.x+304,h.y+264,32,22);
    put('main',`gate_${s.structures.filter(b=>b.id.startsWith('campaign-main-')&&!b.dead).length===4?0:2}`,h.x+h.w/2,h.y+h.h-8,128,24);
  }
  const signMap={hardware:'hardware_sign',grocery:'grocery_sign',hospital:'hospital_sign',depot:'depot_sign',school:'school_sign',ridge:'ridge_sign',checkpoint:'checkpoint_sign'} as const;
  for(const [id,frame]of Object.entries(signMap)){const b=map[id as keyof typeof signMap].rect;put(`sign-${id}`,frame,b.x+b.w/2,b.y+b.h+18,220,42);}
  // Explicit world sizes: a document, a hospital bed and a truck must not share a generic footprint.
  const homeProp=(site:keyof typeof map,id:string,frame:string,dx:number,dy:number,w:number,hh:number)=>{const b=map[site].rect;put(id,frame,b.x+dx,b.y+dy,w,hh);};
  homeProp('hardware','tools','tool_shelf_0',70,70,80,48);homeProp('grocery','nook','hiding_nook_0',80,80,54,54);
  homeProp('hospital','gurney','gurney_0',95,90,72,44);homeProp('school','notice','notice_0',90,80,20,26);
  homeProp('depot','skid',`generator_${done('loading')?0:2}`,100,95,130,95);homeProp('depot','truck',`flatbed_${done('loading')?1:0}`,240,140,180,120);
  homeProp('comms','server','server_1',85,75,72,48);homeProp('comms','records','logs_0',175,75,28,24);
  homeProp('checkpoint','tent','tent_0',110,90,160,120);
  homeProp('highway','semi','semi_3',150,80,220,120);
  const r=map.ridge.rect;put('tower','tower_0',r.x+r.w+65,r.y+100,130,160);put('solar','solar_0',r.x+100,r.y+65,120,80);put('ridge-radio','radio_1',r.x+320,r.y+65,72,48);
  // Repeat the overhead wall segment along the dam rather than stretching one sprite 1,020px.
  for(let i=0;i<9;i++){put(`dam-${i}`,'dam_0',8490,350+i*120,128,46);out[out.length-1].angle=Math.PI/2;}
  if(done('fallback'))homeProp('fallback','cache','cache_0',90,70,48,40);
  if(c.bus){put('bus',`bus_${c.trip||c.encounter&&c.chapter===6?2:0}`,c.bus.x,c.bus.y,170,102);out[out.length-1].angle=c.busAngle||0;}
  return out;
}
