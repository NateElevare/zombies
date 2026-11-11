import * as Phaser from 'phaser';
import type { GameState,Rect,Solid } from '../sim/types';
import type { Art } from './art';
import { Pool,inView,type View } from './common';
import { storyProject,STORY_CAMERA,storyFrontDepth } from './story-projection';
import { wallOccludes } from '../angle-lab/math';
import { lookOf } from '../sim/items';
import { storyPropFrame,storyStructureFrame,storyBillboardPlacement,storyDumpsterPlacement,storyFurnitureHeight,nearest } from './story-assets';

/** Upright generated art, anchored to the existing physical footprint. */
export class StoryProps {
  private images:Pool<Phaser.GameObjects.Image>;
  constructor(private scene:Phaser.Scene,private art:Art){this.images=new Pool(()=>scene.add.image(0,0,'angle_house_materials').setData('story',true));}
  clear(){this.images.begin();this.images.end();}
  private drawImage(name:string,rect:Rect,treeRadius?:number,height?:number){
    const meta=this.art.manifest.storyArt.frames[name];if(!meta)return null;
    const q=storyProject({x:rect.x+rect.w/2,y:rect.y+rect.h/2});
    const p=name.startsWith('story_props_dumpster_')?storyDumpsterPlacement(rect,meta.bounds):storyBillboardPlacement(rect,meta.bounds,treeRadius,height);
    const image=this.images.get().setTexture(meta.atlas,name).setPosition(q.x,q.y).setOrigin(p.originX,p.originY).setScale(p.scale).setRotation(0).setFlip(false,false).clearTint().setAlpha(1).setDepth(10000+(treeRadius?rect.y+rect.h/2:storyFrontDepth(rect,q.x)));
    nearest(image.texture);return image;
  }
  draw(s:GameState,v:View){
    this.images.begin();
    s.grid.each(v.x-180,v.y-180,v.w+360,v.h+360,o=>{
      if(o.structure||o.kind==='fence')return;const name=storyPropFrame(o,s.buildings);if(!name)return;
      const cr=o.kind==='tree'?(o as Solid&{cr?:number}).cr||34:undefined;
      const image=this.drawImage(name,o,cr,o.kind==='furniture'?storyFurnitureHeight(o.sub||''):undefined);if(!image)return;
      if(wallOccludes(s.player,o,cr?cr*3:o.kind==='car'?60:45,STORY_CAMERA))image.setAlpha(.35);
    });
    for(const st of s.structures){if(st.dead||!inView(v,st.x,st.y,150))continue;
      const name=st.type==='stash'&&s.ui==='stash'&&s.uiTarget===st?`story_structures_stash_open_${st.rot?0:1}`:storyStructureFrame(st);
      const im=this.drawImage(name,st);if(im&&st.hitFlash)im.setTint(0xffb5a8);
      if(im&&st.hp<st.maxHp*.5){const damage=this.drawImage('story_decor_bullet_damage',{x:st.x+st.w*.2,y:st.y,w:st.w*.6,h:st.h});if(damage)damage.y-=12;damage?.setDepth(im.depth+.01).setAlpha(.65);}
    }
    for(const d of s.drops){
      if(!inView(v,d.x,d.y,60)||d.kind!=='deathbag'&&d.life<3&&Math.floor(s.time*8)%2===0)continue;
      const items=d.inv.slots.filter(Boolean).slice(0,3);
      if(d.kind==='deathbag'||!items.length)this.drawImage(`story_environment_${d.kind==='deathbag'?'deathbag':'loot'}_1`,{x:d.x-11,y:d.y-7,w:22,h:14});
      else for(const [i,item]of items.entries()){
        const id=lookOf(item!.id),weapon=this.art.has(`story_weapon_${id}_e`),name=weapon?`story_weapon_${id}_e`:`story_item_${id}`;
        const meta=this.art.manifest.storyArt.frames[name];if(!meta)continue;
        const im=this.images.get().setTexture(meta.atlas,name),q=storyProject({x:d.x+(i-1)*7,y:d.y+i*4});
        im.setPosition(q.x,q.y).setOrigin((meta.bounds.x+meta.bounds.w/2)/256,(meta.bounds.y+meta.bounds.h/2)/256).setScale((weapon?30:18)/Math.max(meta.bounds.w,meta.bounds.h)).setRotation(i*.2-.2).setFlip(false,false).clearTint().setAlpha(1).setDepth(18);
      }
    }
    const b=s.build,g=b?.ghost;
    if(b&&g&&!b.salvage){const im=this.drawImage(storyStructureFrame({type:b.selected,rot:b.rot}),g);im?.setAlpha(.55).setTint(g.ok?0xb0ffb8:0xff9090).setDepth(1001999);}
    this.images.end();
  }
}
