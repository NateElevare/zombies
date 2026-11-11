import type { Building,Rect,Solid,Structure } from '../sim/types';

/** Pixel-art (NEAREST) filtering, applied once per texture. Phaser re-uploads the whole atlas to the GPU on every setFilter call, so calling it per frame costs seconds. */
const nearestDone=new WeakSet<object>();
export function nearest(t:{setFilter(mode:number):unknown}){if(nearestDone.has(t))return;nearestDone.add(t);t.setFilter(1);}

export const STORY_CARS=['sedan','hatchback','van','pickup','police','ambulance','box_truck','humvee','military_truck'];
export const STORY_FURNITURE=['armchair','barrel','bed','bench','bookshelf','booth','cabinet','cart','clothes','cooler','cot','counter','crate','desk','dresser','dumpster','filing','fountain','fridge','guncase','gunrack','hbed','locker','mcrate','medcab','monitor','nightstand','pallet','plant','planter','pump','rack','safe','sandbag','sdesk','shelf','ship','sink','sofa','statue','stove','table','toilet','toolbox','tower','tub','tv','wardrobe','woodpile'];
const alias:Record<string,string>={couch:'sofa',clothing:'clothes',weapon_case:'guncase',medical_cabinet:'medcab'};
export function storyPropFrame(o:Solid,buildings:Building[]){
  const horizontal=o.w>=o.h,variant=(o.vseed||0)%4;
  if(o.kind==='car')return `story_car_${o.sub||'sedan'}_${(horizontal?0:1)+((o as Solid&{flip?:boolean}).flip?2:0)}`;
  if(o.kind==='tree'||o.kind==='rock')return `story_environment_${o.kind==='tree'?o.sub||'oak':'rock'}_${variant}`;
  if(o.kind==='fence')return `story_environment_${o.sub==='chainlink'?'chainlink':'wood'}_fence_${horizontal?1:0}`;
  if(o.kind!=='furniture')return null;
  // Long fixtures follow their footprint. Choosing a tub's narrow end view by
  // the nearest wall makes an 80px-long tub look like an oversized upright basin.
  if(['tub','bed','cot','hbed'].includes(o.sub||''))return `story_props_${o.sub}_${horizontal?0:1}`;
  if(o.wallSide)return `story_props_${alias[o.sub||'']||o.sub}_${{w:0,n:1,e:2,s:3}[o.wallSide]}`;
  let direction=horizontal?1:0;
  const b=buildings.find(b=>b.id===o.buildingId);
  if(b){const x=o.x+o.w/2,y=o.y+o.h/2,r=b.rooms.find(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)||b;
    const distances=[o.x-r.x,o.y-r.y,r.x+r.w-o.x-o.w,r.y+r.h-o.y-o.h];
    const min=Math.min(...distances);if(min<40)direction=distances.indexOf(min);
  }
  return `story_props_${alias[o.sub||'']||o.sub}_${direction}`;
}
export function storyStructureFrame(o:Pick<Structure,'type'|'rot'|'open'|'aim'>){
  const id=o.type==='wood_door'&&o.open?'wood_door_open':o.type;
  const direction=o.type==='wood_door'&&o.open?(o.rot?2:0):o.type==='turret'?((Math.round((o.aim||0)/(Math.PI/2))%4)+4)%4:o.rot?0:1;
  return `story_structures_${id}_${direction}`;
}
export function storyMaterialFrame(o:Solid,b?:Building){
  const material=o.sub&&o.sub!=='window'?o.sub:b?.wall||'siding';
  if(o.kind!=='window')return `story_material_wall_${material}`;
  const specialty:Record<string,string>={store:'shop_glass',gas_station:'shop_glass',warehouse:'warehouse_door',hospital:'hospital_window',police:'police_window',school:'school_window',cabin:'cabin_window'};
  return 'story_material_'+(specialty[b?.kind||'']||'window_'+material);
}
/** End-on furniture must fit its height as well as its collision width. */
export function storyFurnitureHeight(sub:string){
  if(['tub','bed','cot','hbed','pallet','sandbag'].includes(sub))return 26;
  if(['toilet','sofa','couch','armchair','bench','nightstand','toolbox'].includes(sub))return 36;
  if(['wardrobe','locker','fridge','bookshelf','rack','shelf','gunrack','tower','statue'].includes(sub))return 82;
  return 48;
}
export function storyBillboardPlacement(rect:Rect,bounds:Rect,treeRadius?:number,height?:number){
  let scale=(treeRadius?treeRadius*2.4:rect.w)/Math.max(1,bounds.w);
  if(height!==undefined)scale=Math.min(scale,(rect.h*Math.SQRT1_2+height)/Math.max(1,bounds.h));
  return {scale,originX:(bounds.x+bounds.w/2)/256,originY:(bounds.y+bounds.h-(treeRadius?0:rect.h*Math.SQRT1_2/(2*scale)))/256};
}

/** Dumpster source views are individually fitted to their atlas cells. Use the
 * same world height in every view, rather than halving the whole bin when its
 * collision footprint rotates from 60x34 to 34x60. Keep the near ground edge. */
export function storyDumpsterPlacement(rect:Rect,bounds:Rect){
  const height=64*Math.max(rect.w,rect.h)/60;
  const width=height*bounds.w/Math.max(1,bounds.h);
  return storyBillboardPlacement({...rect,w:width},bounds);
}
