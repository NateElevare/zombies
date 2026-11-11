import * as Phaser from 'phaser';
import type { GameState } from '../sim/types';
import { available, has, sites, tracked, buildTargets } from '../sim/campaign';
import { scenery } from '../sim/campaign-scenery';
import { D, Pool, type View } from './common';
import { storyProject } from './story-projection';
import { isAngledStory } from '../story-mode';
import { campaignFrame } from '../campaign-art';

/** The campaign pack is overhead only. Angled play receives navigation labels, not overhead sprites. */
export class CampaignRender {
  private people:Pool<Phaser.GameObjects.Image>;
  private props:Pool<Phaser.GameObjects.Image>;
  private labels:Pool<Phaser.GameObjects.Text>;
  private marks:Phaser.GameObjects.Graphics;
  constructor(scene:Phaser.Scene){
    this.people=new Pool(()=>scene.add.image(0,0,'campaign_people','mara_idle_0').setDepth(D.zombieOver+2).setScale(.5));
    this.props=new Pool(()=>scene.add.image(0,0,'campaign_props','lantern_0').setDepth(D.floorObj+1));
    this.labels=new Pool(()=>scene.add.text(0,0,'',{fontFamily:'sans-serif',fontSize:'11px',color:'#e6d8b4',backgroundColor:'#14221cdd',padding:{x:5,y:3}}).setOrigin(.5).setDepth(D.overlay));
    this.marks=scene.add.graphics().setDepth(D.overlay-1);
  }
  clear(){this.people.begin();this.people.end();this.props.begin();this.props.end();this.labels.begin();this.labels.end();this.marks.clear();}
  draw(s:GameState,v:View){
    this.clear();if(s.mode!=='survival'||!s.campaign)return;
    const c=s.campaign,angled=isAngledStory(s),visible=(x:number,y:number,pad=160)=>x>v.x-pad&&x<v.x+v.w+pad&&y>v.y-pad&&y<v.y+v.h+pad;
    const project=(x:number,y:number)=>angled?storyProject({x,y}):{x,y};
    if(!angled)for(const p of scenery(s))if(visible(p.x,p.y,Math.max(p.w,p.h))){
      const sprite=this.props.get().setTexture('campaign_props',p.frame).setPosition(p.x,p.y).setRotation(p.angle||0);
      sprite.setScale(Math.min(p.w/sprite.frame.width,p.h/sprite.frame.height));
    }
    for(const r of c.residents)if(visible(r.x,r.y)){
      if(has(s,'boarding')&&!c.completed&&(r.id==='ruth'||r.id.startsWith('ridge-')))continue;
      const p=project(r.x,r.y);
      if(!angled){const pose=r.moving?'walk':r.id==='eli'&&!has(s,'medicine')?'injured':r.id==='june'&&!has(s,'june')?'cower':r.home&&s.clock.t>420?'sit':r.home?'work':'idle';
        this.people.get().setTexture('campaign_people',campaignFrame(r.look,pose,s.time)).setPosition(p.x,p.y).setRotation(r.angle).setScale(.5);
      }else{this.marks.lineStyle(2,0xc4db9e,.9).strokeCircle(p.x,p.y,11);}
      this.labels.get().setText(r.name.split(' ')[0]+(r.following?' • following':'')).setPosition(p.x,p.y-36);
    }
    const marked=new Set<string>();const chosen=tracked(s);
    for(const o of available(s)){
      if(!angled&&o.kind==='build')for(const target of buildTargets(s,o)){this.marks.lineStyle(2,0xbad88c,.9).strokeRect(target.x,target.y,o.id==='door'?32:64,16);}
      if(marked.has(o.site))continue;marked.add(o.site);const site=sites(s)![o.site];if(!visible(site.x,site.y))continue;const p=project(site.x,site.y),color=chosen?.site===o.site?0xf4cf80:0xa0bca7;
      this.marks.lineStyle(2,color,.95);this.marks.beginPath();this.marks.moveTo(p.x,p.y-12);this.marks.lineTo(p.x+9,p.y);this.marks.lineTo(p.x,p.y+12);this.marks.lineTo(p.x-9,p.y);this.marks.closePath();this.marks.strokePath();
      this.labels.get().setText(site.name).setPosition(p.x,p.y+27);
    }
    this.people.end();this.props.end();this.labels.end();
  }
}
