import * as Phaser from 'phaser';
import { LabScenery } from '../angle-lab/scenery';
import { depth, wallOccludes } from '../angle-lab/math';
import { STORY_CAMERA, storyProject,storyFrontDepth,storyWallSections } from './story-projection';
import type { Building, GameState, Solid } from '../sim/types';
import type { View } from './common';
import type { Art } from './art';
import {storyPropFrame,storyMaterialFrame} from './story-assets';

type Entry={mesh:LabScenery;used:number;roof?:Building;wall?:Solid;height:number};
const HOUSE='angle_house_materials';
const SIDING:[number,number,number,number]=[258,2,252,252],WINDOW:typeof SIDING=[2,2,252,252],ROOF:typeof SIDING=[2,258,252,252];
export class StoryScenery {
  entries=new Map<object,Entry>();
  private tick=0;
  constructor(private scene:Phaser.Scene,private art:Art){}
  clear(){for(const e of this.entries.values())e.mesh.destroy();this.entries.clear();}
  private create(o:Solid|Building,roof=false,building?:Building,door=false):Entry {
    const mesh=new LabScenery(this.scene,false),wall=!roof&&(door||['wall','window'].includes((o as Solid).kind));
    const height=roof||wall?82:(o as Solid).kind==='car'?62:(o as Solid).kind==='fence'?36:(o as Solid).kind==='rock'?22:27;
    const p=mesh.part({x:o.x+o.w,y:o.y+o.h},undefined,roof);p.height=height;
    const footprints=new Map<typeof p,{x:number;y:number;w:number;h:number}>();
    const {x,y,w,h}=o;
    const material=(name:string,fallback:typeof SIDING)=>{
      const atlas=this.art.atlasOf(name);if(!atlas)return {key:HOUSE,crop:fallback};
      const f=this.scene.textures.getFrame(atlas,name);return {key:atlas,crop:[f.cutX,f.cutY,f.cutWidth,f.cutHeight] as typeof SIDING};
    };
    const roofMat=material('story_material_roof_'+((o as Building).roof||'metal'),ROOF);
    if(roof){
      const pitched=/shingle/.test((o as Building).roof),e=6,z=84,ridge=pitched?84+Math.min(60,h*.24):87;
      if(pitched){
        mesh.face(p,[[x-e,y-e,z],[x+w+e,y-e,z],[x+w+e,y+h/2,ridge],[x-e,y+h/2,ridge]],'#40443e',roofMat.key,roofMat.crop,.15);
        mesh.face(p,[[x-e,y+h/2,ridge],[x+w+e,y+h/2,ridge],[x+w+e,y+h+e,z],[x-e,y+h+e,z]],'#4c4c43',roofMat.key,roofMat.crop);
        mesh.face(p,[[x+w+e,y-e,z],[x+w+e,y+h/2,ridge],[x+w+e,y+h+e,z]],'#b2ad93');
      }else mesh.face(p,[[x-e,y-e,z],[x+w+e,y-e,z],[x+w+e,y+h+e,z],[x-e,y+h+e,z]],'#494c48',roofMat.key,roofMat.crop,.25);
      mesh.box(p,x-e,y+h+e-3,w+e*2,3,4,'#b1ad98',80);
    }else if(door){
      const mat=material('story_material_'+(building?.kind==='house'?'wood_planks':'metal_panels'),SIDING);
      if(w>=h){for(const xx of [x,x+w-3])mesh.box(p,xx,y,3,h,74,'#aaa58e',0,mat.key,mat.crop);mesh.box(p,x,y,w,h,8,'#aaa58e',74,mat.key,mat.crop);}
      else{for(const yy of [y,y+h-3])mesh.box(p,x,yy,w,3,74,'#aaa58e',0,mat.key,mat.crop);mesh.box(p,x,y,w,h,8,'#aaa58e',74,mat.key,mat.crop);}
    }else if(wall||(o as Solid).kind==='fence'){
      const window=(o as Solid).kind==='window',mat=material(wall?storyMaterialFrame(o as Solid,building):'story_material_'+((o as Solid).sub==='chainlink'?'chainlink':'wood_planks'),window?WINDOW:SIDING);
      for(const [i,r] of storyWallSections(o).entries()){
        const part=i?mesh.part({x:r.x+r.w,y:r.y+r.h},r):p;part.height=height;footprints.set(part,r);
        const horizontal=w>=h,offset=horizontal?r.x-x:r.y-y,length=horizontal?r.w:r.h,total=horizontal?w:h,crop=[...mat.crop] as typeof SIDING;
        const span=window?total:82;crop[0]+=crop[2]*(window?offset/span:(offset%span)/span*.5);crop[2]*=Math.min(1,length/span);
        mesh.box(part,r.x,r.y,r.w,r.h,height,'#b3ac91',0,mat.key,crop);
        mesh.box(part,r.x-1,r.y-1,r.w+2,r.h+2,3,'#c3bda4',height-3);
      }
    }else if((o as Solid).kind==='car'){
      // Reuse the corrected sedan model, mapped once to the actual collision footprint.
      mesh.parts.pop();p.image.destroy();this.scene.textures.remove(p.texture.key);
      mesh.car();const car=mesh.parts[0];car.at={x:x+w/2,y:y+h/2};
      for(const f of car.faces)for(const v of f.points){const u=(v[0]-120)/155,t=(v[1]-85)/70;v[0]=x+(w>=h?u:1-t)*w;v[1]=y+(w>=h?t:u)*h;v[2]*=Math.min(1.15,Math.max(.65,Math.min(w,h)/70));}
      if(w<h)for(const f of car.faces)if(f.normal){const [nx,ny,nz]=f.normal;f.normal=[-ny,nx,nz];}
    }else{
      const material=wall?HOUSE:undefined,crop=(o as Solid).kind==='window'?WINDOW:SIDING;
      mesh.box(p,x,y,w,h,height,wall?'#b3ac91':(o as Solid).kind==='fence'?'#75674c':(o as Solid).kind==='rock'?'#62665b':'#716047',0,material,crop);
      if(wall)mesh.box(p,x-1,y-1,w+2,h+2,3,'#c3bda4',height-3);
      else if((o as Solid).kind==='furniture'){
        const sub=(o as Solid).sub||'';
        if(/bed|cot/.test(sub)){mesh.box(p,x+1,y+1,w-2,h-2,5,'#8e9791',height);mesh.box(p,x+3,y+3,Math.max(4,w-6),Math.min(15,h/3),4,'#c4c2a9',height+5);}
        else if(/sofa|couch/.test(sub))mesh.box(p,x,y,w,Math.min(8,h),15,'#606a50',height);
        const prop=this.art.prop('furniture:'+sub)||this.art.prop(sub),name=prop?.frames[0],atlas=name&&this.art.atlasOf(name);
        if(name&&atlas){
          const frame=this.scene.textures.getFrame(atlas,name),pad=(prop?.pad||0)/this.art.scale;
          const top=p.faces.find(f=>f.points.length===4&&f.points.every(v=>v[2]===height));
          if(top){top.material=atlas;top.crop=[frame.cutX+pad,frame.cutY+pad,Math.max(1,frame.cutWidth-pad*2),Math.max(1,frame.cutHeight-pad*2)];}
        }
      }
    }
    if(roof)for(const f of p.faces)if(f.material===roofMat.key&&f.crop===roofMat.crop&&f.points.length===4){
      const [a,b,c]=f.points;f.repeat=[Math.hypot(...b.map((v,i)=>v-a[i]))/96,Math.hypot(...c.map((v,i)=>v-b[i]))/96];
    }
    mesh.layout(STORY_CAMERA,false);
    // Sort narrow vertical image sections against the actual footprint at that
    // screen X. One far corner for an entire wall/roof incorrectly hid outside actors.
    const original=[...mesh.parts];mesh.parts=[];
    const footprint=roof?{x:x-7,y:y-7,w:w+14,h:h+14}:o;
    for(const part of original){
      const left=part.image.x,top=part.image.y;
      for(let sx=0;sx<part.texture.width;sx+=16){
        const width=Math.min(16,part.texture.width-sx),key=`section_${sx}`;
        part.texture.add(key,0,sx,0,width,part.texture.height);
        const image=this.scene.add.image(left+sx,top,part.texture.key,key).setOrigin(0).setData('story',true);
        image.setDepth(10000+storyFrontDepth(footprints.get(part)||footprint,left+sx+width/2)+(roof?1:0));
        mesh.parts.push({...part,image});
      }
      part.image.destroy();
    }
    const entry={mesh,used:this.tick,roof:roof?o as Building:undefined,wall:wall?o as Solid:undefined,height};this.entries.set(o,entry);return entry;
  }
  draw(s:GameState,v:View,dt:number){
    this.tick++;
    const show=(o:Solid|Building,roof=false,doorBuilding?:Building)=>{
      const e=this.entries.get(o)||this.create(o,roof,doorBuilding||s.buildings.find(b=>b.id===(o as Solid).buildingId),!!doorBuilding);e.used=this.tick;
      const inside=roof&&s.player.x>=o.x&&s.player.x<=o.x+o.w&&s.player.y>=o.y&&s.player.y<=o.y+o.h;
      const occludes=(roof||e.wall)&&wallOccludes(s.player,o,roof?145:e.height,STORY_CAMERA);
      const target=inside?0:occludes?.16:1;
      for(const p of e.mesh.parts)p.image.setVisible(true).setAlpha(Phaser.Math.Linear(p.image.alpha,target,1-Math.exp(-dt*10)));
    };
    s.grid.each(v.x-180,v.y-180,v.w+360,v.h+360,o=>{if(!o.structure&&['wall','window','car','fence','furniture','rock'].includes(o.kind)&&(o.kind==='fence'||!this.art.has(storyPropFrame(o,s.buildings)||'')))show(o);});
    for(const b of s.buildings)if(b.x+b.w>v.x-180&&b.x<v.x+v.w+180&&b.y+b.h>v.y-180&&b.y<v.y+v.h+180){show(b,true);for(const door of b.doors)show(door as Solid,false,b);}
    for(const [o,e] of this.entries)if(e.used!==this.tick){for(const p of e.mesh.parts)p.image.setVisible(false);if(this.tick-e.used>120){e.mesh.destroy();this.entries.delete(o);}}
  }
}
