import * as Phaser from 'phaser';
import type { GameState, SimEvent } from '../sim/types';
import { characterVisual, spriteAtlas, SPRITE_RESOLUTIONS } from '../angle-lab/sprite-set';
import type { Actor } from '../angle-lab/world';
import { depth } from '../angle-lab/math';
import { storyProject, STORY_CAMERA } from './story-projection';
import { StoryScenery } from './story-scenery';
import type { View } from './common';
import type { Art } from './art';
import { StoryCharacter,type StoryArt } from './story-character';
import { StoryProps } from './story-props';
import { nearest } from './story-assets';
import { StoryPoseBlend } from './story-pose-blend';
import { BOSSES,isBoss } from '../sim/bosses';
import { StoryBossFx } from './story-bosses';
import { advanceZombieGait,zombieHeading,zombieMotion,zombieDeath,ZOMBIE_DEATH_SECONDS } from './story-zombie-animation';

type Visual={actor:Actor;image:Phaser.GameObjects.Image;blend:StoryPoseBlend;heading?:number;motion:number;seen:number;type:string;variant:number;corpse:boolean};
/** Upright billboards and raised scenery over the existing projected ground/effects layers. */
export class StoryView {
  scenery:StoryScenery;
  actors=new Map<number|string,Visual>();
  private layers=new Map<number,{outer:Phaser.GameObjects.Container;inner:Phaser.GameObjects.Container}>();
  private tick=0;
  private time=0;
  private shadows:Phaser.GameObjects.Graphics;
  private marks:Phaser.GameObjects.Graphics;
  enabled=false;
  private character:StoryCharacter;
  private storyArt:StoryArt;
  private props:StoryProps;
  private bossFx:StoryBossFx;
  constructor(private scene:Phaser.Scene,art:Art){this.props=new StoryProps(scene,art);this.storyArt=art.manifest.storyArt;this.character=new StoryCharacter(scene,this.storyArt);this.scenery=new StoryScenery(scene,art);this.shadows=scene.add.graphics().setDepth(20).setData('story',true);this.marks=scene.add.graphics().setDepth(600100).setData('story',true);this.bossFx=new StoryBossFx(scene,art);}
  configure(enabled:boolean){
    this.enabled=enabled;this.clear();
    for(const [d,l] of this.layers)this.configureLayer(d,l);
  }
  private configureLayer(d:number,l:{outer:Phaser.GameObjects.Container;inner:Phaser.GameObjects.Container}){
    l.outer.setScale(1,this.enabled?Math.cos(STORY_CAMERA.tilt*Math.PI/180):1);
    l.inner.setRotation(this.enabled?STORY_CAMERA.yaw*Math.PI/180:0);
    l.outer.setDepth(!this.enabled?d:d<30?d:d<70?500000+d:d<100?600000+d:1000000+(d-100)*100);
  }
  /** Legacy components keep their world-space positions, pooling and lighting. Two nested
   *  transforms apply rotation THEN ground foreshortening without shearing upright actors. */
  capture(){
    for(const obj of [...this.scene.children.list] as any[]){
      if(obj.getData?.('story'))continue;
      const d=obj.depth||0;
      let layer=this.layers.get(d);
      if(!layer){
        const outer=this.scene.add.container(0,0).setData('story',true),inner=this.scene.add.container(0,0).setData('story',true);
        outer.add(inner);layer={outer,inner};this.layers.set(d,layer);this.configureLayer(d,layer);
      }
      layer.inner.add(obj);
    }
  }
  clear(){this.props.clear();this.scenery.clear();this.character.hide();this.bossFx.clear();for(const a of this.actors.values()){a.image.destroy();a.blend.destroy();}this.actors.clear();this.shadows.clear();this.marks.clear();this.time=0;}
  private make(id:number|string,x:number,y:number,type:string):Visual {
    const actor:Actor={id:id===-1?-1:1,x,y,angle:0,moveAngle:0,phase:0,moving:false,running:false,hp:1,flash:0,action:'idle',actionTime:0,actionLength:1,deathTime:0,cooldown:0,route:[],routeTime:0};
    const image=this.scene.add.image(0,0,spriteAtlas(id===-1?'responder':'zombie','256')).setData('story',true);
    nearest(image.texture);
    const entry:Visual={actor,image,blend:new StoryPoseBlend(this.scene),motion:0,seen:this.tick,type,variant:0,corpse:false};this.actors.set(id,entry);return entry;
  }
  draw(s:GameState,v:View,alpha:number,realDt:number){
    const dt=s.screen==='playing'&&!s.paused&&(s.ui===null||s.ui==='build')?realDt:0;this.time+=dt;this.tick++;
    this.shadows.clear();this.marks.clear();this.bossFx.draw(s,v,alpha,dt);
    this.scenery.draw(s,v,realDt);this.props.draw(s,v);
    const draw=(id:number|string,source:any,type:string)=>{
      const x=source.prevX+(source.x-source.prevX)*alpha,y=source.prevY+(source.y-source.prevY)*alpha;
      const entry=this.actors.get(id)||this.make(id,x,y,type),a=entry.actor;
      const distance=Math.hypot(x-a.x,y-a.y),continuous=entry.seen>=this.tick-1&&distance<80;
      if(dt>0){
        a.moving=continuous&&distance/dt>2;
        if(a.moving){a.moveAngle=Math.atan2(y-a.y,x-a.x);a.phase=id===-1?a.phase+Math.min(distance,dt*400)/(source.sprinting?128:104)*8:advanceZombieGait(a.phase,distance,type,dt);}
        entry.motion+=((a.moving?1:0)-entry.motion)*(1-Math.exp(-dt*18));
      }
      a.x=x;a.y=y;a.hp=source.dead?0:source.hp;a.running=id===-1?source.sprinting:type==='runner';
      if(id===-1)a.angle=source.angle;
      else {entry.heading=zombieHeading(source.prevAngle??source.angle,source.angle,alpha,entry.heading);a.angle=entry.heading;}
      a.actionTime=Math.max(0,a.actionTime-dt);a.flash=Math.max(0,a.flash-dt);
      if(id===-1){
        if(source.reloadTimer>0){a.action='reload';a.actionLength=source.reloadTotal;a.actionTime=source.reloadTimer;}
        else if(source.swingTimer>0){a.action='melee';a.actionLength=source.swingTotal;a.actionTime=source.swingTimer;}
      }else if(source.attackT<.5){a.action='attack';a.actionLength=.5;a.actionTime=.5-source.attackT;}
      if(a.hp<=0)a.deathTime+=id===-1&&source.dead&&s.screen==='dead'?realDt:dt;
      entry.seen=this.tick;entry.variant=source.variant||0;
      if(id===-1){entry.image.setVisible(false);this.character.draw(s.player,a);const q=storyProject(a);this.shadows.fillStyle(0x101710,.4).fillEllipse(q.x,q.y,34,11);}else this.paint(entry);
      if(id!==-1&&source.hp<source.maxHp&&!source.dead){const q=storyProject(a);this.marks.fillStyle(0x101610,.8).fillRect(q.x-16,q.y-85,32,4).fillStyle(0xa85642,1).fillRect(q.x-16,q.y-85,32*Math.max(0,source.hp/source.maxHp),4);}
      if(id!==-1&&source.burn>0){const q=storyProject(a);for(let i=0;i<3;i++){const x=q.x+(i-1)*8,h=14+8*Math.sin(this.time*16+i*2);this.marks.fillStyle(i%2?0xffc65b:0xe56f27,.8).fillTriangle(x-5,q.y-10,x+5,q.y-10,x,q.y-10-h);}}
    };
    draw(-1,s.player,'responder');
    for(const z of s.zombies){if(z.dead||isBoss(z))continue;if(z.x<v.x-120||z.y<v.y-120||z.x>v.x+v.w+120||z.y>v.y+v.h+120)continue;draw(z.id,z,z.type);}
    for(const [id,e] of this.actors){
      if(e.corpse){e.actor.deathTime+=dt;this.paint(e);if(e.actor.deathTime>45){e.image.destroy();e.blend.destroy();this.actors.delete(id);}}
      else if(e.seen!==this.tick){e.image.setVisible(false);e.blend.hide();if(this.tick-e.seen>240){e.image.destroy();e.blend.destroy();this.actors.delete(id);}}
    }
  }
  private paint(e:Visual){
    const a=e.actor,kind=a.id===-1?'responder':'zombie';
    // Use authored body poses with continuous offsets. Tiny rotations of trimmed
    // atlas frames clip on this renderer, so keep the pixel-art quad axis aligned.
    const death=zombieDeath(a.deathTime,e.type==='crawler');
    const visual=characterVisual(kind,{...a,phase:a.phase*8,deathTime:a.deathTime*.8/ZOMBIE_DEATH_SECONDS},STORY_CAMERA.yaw),p=storyProject(a),r=SPRITE_RESOLUTIONS['256'];
    const scale=e.type==='brute'?1.38:e.type==='bloater'?1.2:e.type==='crawler'?.68:1;
    if(a.hp>0)this.shadows.fillStyle(0x101710,.4).fillEllipse(p.x,p.y,34*scale,11*scale);
    const motion=a.hp<=0?death:zombieMotion(a.phase,e.motion,e.type);
    e.image.setVisible(true).setTexture(spriteAtlas(kind,'256'),visual.frame).setOrigin(r.originX,r.originY).setFlipX(visual.flip).setPosition(p.x+motion.x*scale*(visual.flip?-1:1),p.y+motion.y*scale).setRotation(0).setScale(r.scale*scale,r.scale*scale*(e.type==='crawler'?.65:1)).setDepth(a.hp<=0&&death.landed?19:10000+depth(a,STORY_CAMERA.yaw));
    e.image.clearTint();
    if(a.id!==-1){
      let frame=0;
      if(a.hp<=0)frame=death.frame;
      else if(a.actionTime>0)frame=a.action==='hit'?9:a.action==='attack'?(a.actionTime/a.actionLength>.5?7:8):0;
      else if(a.moving)frame=a.running?5+Math.floor(a.phase*4)%2:1+Math.floor(a.phase*4)%4;
      const name=`story_zombie_${e.type}_${e.variant}_${visual.direction}_${frame}`,asset=this.storyArt.frames[name];
      if(asset)e.image.setTexture(asset.atlas,name).setScale(r.scale*scale);
    }
    if(a.flash>0)e.image.setTint(0xffc5bd);
    e.blend.apply(e.image,p,this.time,a.hp<=0?.14:.055);
  }
  event(ev:SimEvent){
    this.bossFx.event(ev);
    if(ev.t==='zombieKilled'){
      if(ev.boss)return;   // StoryBossFx plays the boss's own death
      const existing=this.actors.get(ev.id);if(existing?.corpse)return;
      const e=existing||this.make(ev.id,ev.x,ev.y,ev.type);e.variant=ev.variant;e.corpse=true;e.actor.hp=0;e.actor.deathTime=0;e.actor.moving=false;e.actor.actionTime=0;e.actor.flash=0;
      // Keep the displayed foot position/facing at impact; simulation knockback has
      // already happened and snapping to it skips the first part of the fall.
      if(!existing){e.actor.x=ev.x;e.actor.y=ev.y;e.actor.angle=ev.angle;}
    }else if(ev.t==='playerHurt'||ev.t==='zombieHurt'){
      const e=this.actors.get(ev.t==='playerHurt'?-1:ev.id);if(e){e.actor.flash=.18;e.actor.action='hit';e.actor.actionTime=e.actor.actionLength=.2;}
    }else if(ev.t==='shot'){
      const e=this.actors.get(-1);if(e){e.actor.action='shoot';e.actor.actionTime=e.actor.actionLength=.16;}
    }
  }
  aim(s:GameState,projected:{x:number;y:number},ground:{x:number;y:number}){
    if(s.ui==='build')return ground;
    let best=-Infinity,target=ground;
    for(const z of s.zombies){if(z.dead)continue;const p=storyProject(z),d=depth(z,STORY_CAMERA.yaw),height=isBoss(z)?BOSSES[z.boss].r*2.4:z.type==='brute'?100:z.type==='crawler'?35:76;
      if(Math.abs(projected.x-p.x)<22&&projected.y>p.y-height&&projected.y<p.y+5&&d>best){best=d;target={x:z.x,y:z.y};}}
    return target;
  }
}
