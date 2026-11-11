// Dependency-free validation shared by browser saves and cloud uploads.
import { CAST, OBJECTIVES } from './campaign-data.ts';
import type { CampaignState } from './campaign';
export function validCampaign(v:any):v is CampaignState {
  const num=(x:unknown,max:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=max;
  const point=(p:any)=>p&&num(p.x,16000)&&num(p.y,16000);
  const trip=v?.trip;
  return !!v&&v.version===1&&Number.isInteger(v.chapter)&&v.chapter>=1&&v.chapter<=6&&typeof v.completed==='boolean'&&
    Array.isArray(v.done)&&v.done.length<=OBJECTIVES.length&&v.done.every((id:unknown)=>OBJECTIVES.some(o=>o.id===id))&&new Set(v.done).size===v.done.length&&
    Array.isArray(v.cargo)&&v.cargo.length<=32&&v.cargo.every((x:unknown)=>typeof x==='string'&&x.length<64)&&
    Array.isArray(v.residents)&&v.residents.length<=24&&new Set(v.residents.map((r:any)=>r?.id)).size===v.residents.length&&v.residents.every((r:any)=>r&&typeof r.id==='string'&&r.id.length<=64&&typeof r.name==='string'&&r.name.length<80&&/^(mara|eli|june|ruth|resident[0-5])$/.test(r.look)&&point(r)&&Number.isFinite(r.angle)&&typeof r.home==='boolean'&&typeof r.following==='boolean')&&
    num(v.fuel,2400)&&num(v.supplyDay,1e7)&&num(v.aidDay,1e7)&&num(v.radioDay,1e7)&&
    Array.isArray(v.log)&&v.log.length<=60&&v.log.every((l:any)=>l&&Object.hasOwn(CAST,l.speaker)&&typeof l.text==='string'&&l.text.length<=1000)&&
    (v.tracked===null||OBJECTIVES.some(o=>o.id===v.tracked))&&(v.bus===null||point(v.bus))&&
    (v.busAngle===undefined||Number.isFinite(v.busAngle))&&
    (trip===undefined||trip===null||(trip&&['haven','highway','fallback'].includes(trip.to)&&Array.isArray(trip.path)&&trip.path.length>0&&trip.path.length<=2048&&trip.path.every(point)&&Number.isInteger(trip.index)&&trip.index>=0&&trip.index<=trip.path.length))&&
    (v.encounter===null||(OBJECTIVES.some(o=>o.id===v.encounter?.id&&o.kind==='defend')&&num(v.encounter.remaining,180)&&num(v.encounter.total,100)&&Number.isInteger(v.encounter.total)&&num(v.encounter.kills,v.encounter.total)&&Number.isInteger(v.encounter.kills)&&num(v.encounter.spawnTimer,10)));
}
