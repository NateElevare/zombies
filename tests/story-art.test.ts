import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {ITEMS,lookOf} from '../src/sim/items';
import {WEAPONS} from '../src/sim/combat';
import {STRUCTURES} from '../src/sim/base';
import {VARIANTS,isHiveType} from '../src/sim/zombies';
import type {ZombieType} from '../src/sim/types';
import {CHARACTERS} from '../src/characters';
import {storyPropFrame,storyStructureFrame,storyBillboardPlacement,storyDumpsterPlacement,STORY_CARS,STORY_FURNITURE} from '../src/render/story-assets';
import type {Solid} from '../src/sim/types';
const art=JSON.parse(readFileSync('public/assets/story-art.json','utf8'));
// The Hive Below is drawn top-down only (the road renderer); its painted art is covered by tests/hive-art.test.ts.
const hiveArt=JSON.parse(readFileSync('public/assets/hive-art.json','utf8')),hiveItem=(id:string)=>Object.hasOwn(hiveArt.icons,id);
const dirs=['e','se','s','ne','n'];
const has=(name:string)=>expect(art.frames[name],name).toBeDefined();
describe('Story art runtime coverage',()=>{
  it('uses the actual wall-facing direction for desks, including near room corners',()=>{
    for(const [wallSide,direction] of [['w',0],['n',1],['e',2],['s',3]] as const){
      const o={kind:'furniture',sub:'desk',x:2,y:2,w:direction%2?70:36,h:direction%2?36:70,wallSide} as Solid;
      const name=storyPropFrame(o,[]);expect(name).toBe(`story_props_desk_${direction}`);
      const b=art.frames[name!].bounds,p=storyBillboardPlacement(o,b,undefined,48);
      expect(p.scale*b.w).toBeCloseTo(o.w);
      expect(p.scale*b.h).toBeGreaterThan(50);
      if(direction%2===0)expect(b.h/b.w).toBeGreaterThan(1.6);
    }
  });
  it('registers helmets to the head in every character pose',()=>{
    for(const skin of CHARACTERS)for(const d of dirs)for(let pose=0;pose<12;pose++){
      const head=art.frames[`story_torso_${skin.id}_${d}_${pose}`].head;
      expect(head.x).toBeGreaterThan(120);expect(head.x).toBeLessThan(170);
      expect(head.y).toBeGreaterThan(65);expect(head.y).toBeLessThan(110);
      if(d==='e')expect(head.x).toBeGreaterThan(138);
    }
  });
  it('keeps dumpsters the same height in all four views and anchored to the ground',()=>{
    for(const length of [56,60])for(let direction=0;direction<4;direction++){
      const rect={x:10,y:20,w:direction%2?length:34,h:direction%2?34:length};
      const bounds=art.frames[`story_props_dumpster_${direction}`].bounds,p=storyDumpsterPlacement(rect,bounds);
      expect(p.scale*bounds.h).toBeCloseTo(64*length/60);
      expect((bounds.y+bounds.h-p.originY*256)*p.scale).toBeCloseTo(rect.h*Math.SQRT1_2/2);
    }
  });
  it('supports every skin, weapon and wearable combination in all source directions',()=>{
    for(const skin of CHARACTERS)for(const d of dirs){for(let pose=0;pose<12;pose++)has(`story_torso_${skin.id}_${d}_${pose}`);for(let f=0;f<4;f++)has(`story_death_${skin.id}_${d}_${f}`);}
    for(const id of Object.keys(WEAPONS).filter(id=>id!=='unarmed'&&!hiveItem(id)))for(const d of dirs)has(`story_weapon_${lookOf(id)}_${d}`);
    for(const item of Object.values(ITEMS).filter(i=>i.type==='armor'||i.type==='backpack'))for(const d of dirs)has(`story_gear_${item.id}_${d}`);
    for(const d of dirs)for(const [pose,n]of Object.entries({idle:2,walk:8,run:8,strafe_left:8,strafe_right:8,backpedal:8}))for(let i=0;i<n;i++)has(`story_legs_${d}_${pose}_${i}`);
    expect(art.locomotion).toMatchObject({version:2,frames:8,hip:{x:128,y:134}});
  });
  it('covers all zombie variants through death and all vehicle wreck states',()=>{
    for(const[type,n]of Object.entries(VARIANTS).filter(([t])=>!isHiveType(t as ZombieType)))for(let variant=0;variant<n;variant++){
      if(type==='walker'&&variant===0){expect(existsSync('public/assets/angle_zombie_v3_256.json')).toBe(true);continue;}
      for(const d of dirs)for(let i=0;i<12;i++)has(`story_zombie_${type}_${variant}_${d}_${i}`);
    }
    for(const car of STORY_CARS)for(const wreck of ['','_wreck'])for(let d=0;d<4;d++)has(`story_car_${car}${wreck}_${d}`);
  });
  it('covers every furniture, buildable and collectible type',()=>{
    for(const id of STORY_FURNITURE)for(let d=0;d<4;d++)has(`story_props_${id}_${d}`);
    for(const id of [...Object.keys(STRUCTURES),'wood_door_open','stash_open'])for(let d=0;d<4;d++)has(`story_structures_${id}_${d}`);
    for(const item of Object.values(ITEMS)){if(!hiveItem(item.id))has(item.type==='weapon'?`story_weapon_${lookOf(item.id)}_e`:`story_item_${item.id}`);expect(existsSync(`public/assets/story-icons/${lookOf(item.id)}.png`),item.id).toBe(true);}
    for(const id of Object.keys(STRUCTURES))expect(existsSync(`public/assets/story-icons/struct_${id}.png`),id).toBe(true);
    const inventory=JSON.parse(readFileSync('art/angle/source/story-v1/inventory.json','utf8'));
    for(const [category,prefix]of [['wallMaterial','wall'],['roofMaterial','roof'],['floorMaterial','floor']])for(const id of inventory.world[category])has(`story_material_${prefix}_${id}`);
  });
  it('packs valid trimmed 256px logical frames with resolvable textures',()=>{
    for(const atlas of art.atlases){expect(existsSync(`public/assets/${atlas}.png`)).toBe(true);const data=JSON.parse(readFileSync(`public/assets/${atlas}.json`,'utf8'));for(const [name,f]of Object.entries(data.frames) as [string,any][]){
      expect(f.sourceSize).toEqual({w:256,h:256});expect(f.frame.w).toBeGreaterThan(0);expect(f.frame.h).toBeGreaterThan(0);expect(f.frame.x+f.frame.w).toBeLessThanOrEqual(data.meta.size.w);expect(f.frame.y+f.frame.h).toBeLessThanOrEqual(data.meta.size.h);expect(art.frames[name].atlas).toBe(atlas);
    }}
  });
  it('routes directional props and anchors their base to the physical footprint',()=>{
    const car={kind:'car',sub:'ambulance_wreck',x:0,y:0,w:44,h:100,flip:true} as unknown as Solid;
    expect(storyPropFrame(car,[])).toBe('story_car_ambulance_wreck_3');
    expect(storyStructureFrame({type:'wood_door',rot:0,open:true})).toBe('story_structures_wood_door_open_0');
    const rect={x:10,y:20,w:100,h:44},b={x:20,y:50,w:220,h:160},p=storyBillboardPlacement(rect,b);
    expect(p.scale*b.w).toBeCloseTo(rect.w);
    expect((b.y+b.h-p.originY*256)*p.scale).toBeCloseTo(rect.h*Math.SQRT1_2/2);
  });
});
