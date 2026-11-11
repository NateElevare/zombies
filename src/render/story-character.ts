import * as Phaser from 'phaser';
import type { Player } from '../sim/types';
import type { Actor } from '../angle-lab/world';
import { characterVisual,spriteFacing } from '../angle-lab/sprite-set';
import { characterId } from '../characters';
import { WEAPONS, playerWeaponVisual } from '../sim/combat';
import { lookOf } from '../sim/items';
import { storyProject,STORY_CAMERA } from './story-projection';
import { depth } from '../angle-lab/math';
import { nearest } from './story-assets';

export type StoryArt={atlases:string[];frames:Record<string,{atlas:string;bounds:{x:number;y:number;w:number;h:number};hand?:{x:number;y:number};head?:{x:number;y:number};muzzle?:{x:number;y:number}}>};
/** Weapon and equipment are independent of the body, so every equipped combination is visible. */
export class StoryCharacter {
  legs:Phaser.GameObjects.Image;
  torso:Phaser.GameObjects.Image;
  weapon:Phaser.GameObjects.Image;
  hand:Phaser.GameObjects.Image;
  corpse:Phaser.GameObjects.Image;
  gear:Record<'head'|'body'|'back',Phaser.GameObjects.Image>;
  constructor(private scene:Phaser.Scene,private art:StoryArt){
    const image=()=>scene.add.image(0,0,'angle_responder_v3_256').setData('story',true).setOrigin(.5,224/256).setScale(.375).setVisible(false);
    this.legs=image();this.torso=image();this.weapon=image();this.corpse=image();this.hand=image();this.gear={head:image(),body:image(),back:image()};
  }
  hide(){for(const i of [this.legs,this.torso,this.weapon,this.corpse,this.hand,...Object.values(this.gear)])i.setVisible(false);}
  destroy(){for(const i of [this.legs,this.torso,this.weapon,this.corpse,this.hand,...Object.values(this.gear)])i.destroy();}
  draw(p:Player,a:Actor){
    this.hide();const skin=characterId(p.character),facing=spriteFacing(a.angle,STORY_CAMERA.yaw),q=storyProject(a),d=10000+depth(a,STORY_CAMERA.yaw),s=.375;
    const show=(img:Phaser.GameObjects.Image,name:string,layer:number)=>{
      const f=this.art.frames[name];if(!f)return false;img.setTexture(f.atlas,name).setVisible(true).setPosition(q.x,q.y).setOrigin(.5,224/256).setScale(s).setFlipX(facing.flip).setRotation(0).setDepth(layer).clearTint();nearest(img.texture);if(a.flash>0)img.setTint(0xffc5bd);return true;
    };
    if(a.hp<=0){const frame=Math.min(3,Math.floor(a.deathTime/.8*4));show(this.corpse,`story_death_${skin}_${facing.direction}_${frame}`,frame===3?19:d);return;}
    const locomotion=characterVisual('responder',{...a,actionTime:0},STORY_CAMERA.yaw);
    let legName=locomotion.frame.replace('lab3_responder_','story_legs_');
    const cycle=legName.replace(/_\d+$/,'');
    if(this.art.frames[cycle+'_7'])legName=cycle+'_'+Math.floor(a.phase)%8;
    show(this.legs,legName,d);
    const id=playerWeaponVisual(p),weapon=WEAPONS[id],melee=weapon?.class==='melee',unarmed=id==='unarmed',long=!!weapon&&!['handgun','melee','unarmed'].includes(weapon.class)&&id!=='cola_mints';
    let pose=unarmed?0:melee?2:id==='cola_mints'?10:long?7:5;
    const progress=a.actionLength?1-a.actionTime/a.actionLength:0;
    if(p.reloadTimer>0)pose=id==='cola_mints'?11:9;
    else if(p.swingTimer>0)pose=unarmed?1:progress<.45?3:4;
    else if(a.action==='shoot'&&a.actionTime>0&&id!=='cola_mints')pose=long?8:6;
    const torsoName=`story_torso_${skin}_${facing.direction}_${pose}`;
    show(this.torso,torsoName,d+.02);
    // Tiny distance-driven body bob follows the legs while facing remains tied to aim.
    // Waist registration is fixed across the gait. Move the entire assembly
    // together so the belt cannot wobble apart from the trousers.
    const bob=a.moving?-Math.abs(Math.sin(a.phase*Math.PI/4))*.6:0;this.torso.y+=bob;this.legs.y+=bob;
    for(const slot of ['back','body','head'] as const){
      const item=p.inv.equip[slot];if(!item)continue;
      const rear=facing.direction==='n'||facing.direction==='ne',layer=slot==='back'?(rear?.026:.005):slot==='body'?.024:.027;
      if(show(this.gear[slot],`story_gear_${item.id}_${facing.direction}`,d+layer)){
        const head=this.art.frames[torsoName]?.head||{x:128,y:80};
        this.gear[slot].y+=((slot==='head'?head.y:140)-224)*s+bob;
        if(slot==='head')this.gear[slot].x+=(head.x-128)*s*(facing.flip?-1:1);
        if(slot==='back'&&facing.direction==='e')this.gear[slot].x-=14*s*(facing.flip?-1:1);
      }
    }
    if(unarmed)return;
    const name=`story_weapon_${lookOf(id)}_${facing.direction}`,hand=this.art.frames[torsoName]?.hand;
    if(hand&&show(this.weapon,name,d+(facing.direction==='n'||facing.direction==='ne'?.01:.03))){
      this.weapon.setOrigin(.5,140/256).setPosition(q.x+(hand.x-128)*s*(facing.flip?-1:1),q.y+(hand.y-224)*s+bob);
      // A side-view knife angled upward disappears into the forearm. Let the
      // resting blade extend down/out from the fist; keep attack arcs unchanged.
      const restingAngle=id==='knife'&&facing.direction==='e'?.35:-1.25;
      if(melee)this.weapon.setRotation((p.swingTimer>0?(pose===3?-1.7:-.3):restingAngle)*(facing.flip?-1:1));
      if(long&&facing.direction==='se')this.weapon.setRotation(-.55*(facing.flip?-1:1));
      if(p.reloadTimer>0)this.weapon.setRotation(.35*(facing.flip?-1:1));
      show(this.hand,torsoName.replace('story_torso_','story_hand_'),d+.04);this.hand.y+=bob;
    }
  }
}
