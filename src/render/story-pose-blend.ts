import * as Phaser from 'phaser';
import { smoothStep } from './story-zombie-animation';

type Snapshot={texture:string;frame:string|number;flip:boolean;ox:number;oy:number;sx:number;sy:number;rotation:number;dx:number;dy:number;tint:number};
/** A short, local pose dissolve. Both poses follow the same feet: no motion trails.
 * Allocate the second image only when needed, and reuse it for the actor's lifetime. */
export class StoryPoseBlend {
  private previous?:Snapshot;
  private outgoing?:Snapshot;
  private image?:Phaser.GameObjects.Image;
  private start=0;
  private duration=0;
  constructor(private scene:Phaser.Scene){}
  hide(){this.image?.setVisible(false);this.previous=undefined;this.outgoing=undefined;}
  destroy(){this.image?.destroy();}
  apply(current:Phaser.GameObjects.Image,foot:{x:number;y:number},time:number,seconds:number){
    const next:Snapshot={texture:current.texture.key,frame:current.frame.name,flip:current.flipX,
      ox:current.originX,oy:current.originY,sx:current.scaleX,sy:current.scaleY,rotation:current.rotation,
      dx:current.x-foot.x,dy:current.y-foot.y,tint:current.tintTopLeft};
    const prev=this.previous;
    if(prev&&(prev.texture!==next.texture||prev.frame!==next.frame||prev.flip!==next.flip)){
      this.outgoing=prev;this.start=time;this.duration=seconds;
    }
    this.previous=next;
    const t=this.duration>0?smoothStep((time-this.start)/this.duration):1,old=this.outgoing;
    current.setAlpha(old?t:1);
    if(old&&t<1){
      const im=this.image??=this.scene.add.image(0,0,old.texture,old.frame).setData('story',true);
      im.setTexture(old.texture,old.frame).setOrigin(old.ox,old.oy).setScale(old.sx,old.sy).setFlipX(old.flip)
        .setPosition(foot.x+old.dx,foot.y+old.dy).setRotation(old.rotation).setDepth(current.depth-.001)
        .setTint(old.tint).setAlpha(1-t).setVisible(true);
    }else{this.image?.setVisible(false);this.outgoing=undefined;}
  }
}
