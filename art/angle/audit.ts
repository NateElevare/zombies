import {writeFileSync,mkdirSync} from 'node:fs';
import {newState} from '../../src/sim/core';
import {generate} from '../../src/sim/world';
import {WEAPONS} from '../../src/sim/combat';
import {ITEMS} from '../../src/sim/items';
import {STRUCTURES} from '../../src/sim/base';
import {TYPES,VARIANTS} from '../../src/sim/zombies';
import {CHARACTERS} from '../../src/characters';
const sets:Record<string,Set<string>>={};
const add=(category:string,value:string)=>{(sets[category]??=new Set()).add(value);};
for(const seed of [1,7,42,101,2026]){
  const s=generate(newState(seed));
  for(const o of s.grid.all())add(o.kind,o.sub||o.kind);
  for(const b of s.buildings){add('building',b.kind);add('wallMaterial',b.wall);add('roofMaterial',b.roof);add('floorMaterial',b.floor);for(const r of b.rooms)if(r.floor)add('floorMaterial',r.floor);}
  for(const c of s.containers)add('container',c.kind);
  for(const d of s.decor)add('decor',d.sub||d.kind);
}
const inventory={camera:{tilt:45,yaw:0,zoom:1.35},characters:CHARACTERS,weapons:Object.fromEntries(Object.entries(WEAPONS).map(([id,v])=>[id,{name:v.name,class:v.class}])),zombies:Object.fromEntries(Object.entries(TYPES).map(([id,v])=>[id,{variants:VARIANTS[id as keyof typeof VARIANTS],radius:v.r}])),structures:Object.keys(STRUCTURES),items:Object.values(ITEMS).map(i=>({id:i.id,name:i.name,type:i.type,slot:i.slot})),world:Object.fromEntries(Object.entries(sets).map(([k,v])=>[k,[...v].sort()]))};
mkdirSync('art/angle/source/story-v1',{recursive:true});writeFileSync('art/angle/source/story-v1/inventory.json',JSON.stringify(inventory,null,2));
console.log(JSON.stringify({characters:inventory.characters.length,weapons:inventory.weapons,zombies:inventory.zombies,structures:inventory.structures,items:inventory.items.length,world:inventory.world},null,2));
