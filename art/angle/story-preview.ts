import {loadImage} from '@napi-rs/canvas';
import {readFileSync} from 'node:fs';
import {canvas,contactSheet,type Frame} from '../lib/core';
const art=JSON.parse(readFileSync('public/assets/story-art.json','utf8')),atlases=new Map<string,any>();
async function sprite(name:string){const meta=art.frames[name];if(!meta)return null;let atlas=atlases.get(meta.atlas);if(!atlas){atlas={image:await loadImage(`public/assets/${meta.atlas}.png`),json:JSON.parse(readFileSync(`public/assets/${meta.atlas}.json`,'utf8'))};atlases.set(meta.atlas,atlas);}const raw=atlas.json.frames[name],r=raw.frame,d=raw.spriteSourceSize,c=canvas(256,256);c.g.drawImage(atlas.image,r.x,r.y,r.w,r.h,d.x,d.y,d.w,d.h);return c.c;}
const frames:Frame[]=[];
for(const skin of ['responder','survivor','scout'])for(const [weapon,pose]of [['unarmed',0],['knife',2],['bat',2],['pistol',5],['shotgun',7],['cola_mints',10]] as const){
 const c=canvas(256,256),torso=`story_torso_${skin}_se_${pose}`,leg=await sprite('story_legs_se_idle_0');if(leg)c.g.drawImage(leg,0,0);
 const top=await sprite(torso);if(top)c.g.drawImage(top,0,0);
 if(weapon!=='unarmed'){const held=await sprite(`story_weapon_${weapon}_se`),hand=art.frames[torso].hand;if(held){c.g.save();c.g.translate(hand.x,hand.y);c.g.rotate(weapon==='knife'||weapon==='bat'?-1.25:weapon==='shotgun'?-.55:0);c.g.drawImage(held,-128,-140);c.g.restore();}const fingers=await sprite(torso.replace('story_torso_','story_hand_'));if(fingers)c.g.drawImage(fingers,0,0);}
 frames.push({name:`${skin}: ${weapon}`,canvas:c.c});
}
contactSheet('art/preview/story-character-combinations.png',frames,6,'#3e4942');
const anchors:Frame[]=[];
for(const direction of ['e','se','s','ne','n'])for(let pose=0;pose<12;pose++){
 const name=`story_torso_responder_${direction}_${pose}`,c=canvas(256,256),im=await sprite(name);if(!im)continue;c.g.drawImage(im,0,0);const p=art.frames[name].hand;c.g.strokeStyle='#ff4c4c';c.g.lineWidth=2;c.g.beginPath();c.g.moveTo(p.x-5,p.y);c.g.lineTo(p.x+5,p.y);c.g.moveTo(p.x,p.y-5);c.g.lineTo(p.x,p.y+5);c.g.stroke();anchors.push({name,canvas:c.c});
}contactSheet('art/preview/story-hand-anchors.png',anchors,12,'#3e4942');
