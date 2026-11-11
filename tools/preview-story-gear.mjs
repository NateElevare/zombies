import {createCanvas,loadImage} from '@napi-rs/canvas';
import {readFileSync,writeFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync('public/assets/story-art.json')),cache={};
async function frame(name){const key=manifest.frames[name].atlas;if(!cache[key])cache[key]={im:await loadImage(`public/assets/${key}.png`),json:JSON.parse(readFileSync(`public/assets/${key}.json`))};const {im,json}=cache[key],f=json.frames[name],c=createCanvas(256,256);c.getContext('2d').drawImage(im,f.frame.x,f.frame.y,f.frame.w,f.frame.h,f.spriteSourceSize.x,f.spriteSourceSize.y,f.spriteSourceSize.w,f.spriteSourceSize.h);return c;}
const c=createCanvas(1280,900),g=c.getContext('2d');g.fillStyle='#46534b';g.fillRect(0,0,c.width,c.height);g.imageSmoothingEnabled=false;
const dirs=['e','se','s','ne','n'];
for(const [row,skin] of ['responder','survivor','scout'].entries())for(const [col,dir] of dirs.entries()){
 const x=col*256,y=row*300;
 g.drawImage(await frame(`story_legs_${dir}_idle_0`),x,y);
 g.drawImage(await frame(`story_torso_${skin}_${dir}_5`),x,y);
 const head=Object.keys(manifest.frames).find(n=>n.startsWith('story_gear_military_helmet_')&&n.endsWith('_'+dir));
 const anchor=manifest.frames[`story_torso_${skin}_${dir}_5`].head||{x:128,y:80};
 if(head)g.drawImage(await frame(head),x+anchor.x-128,y+anchor.y-224);
 g.fillStyle='white';g.font='14px sans-serif';g.fillText(skin+' '+dir,x+25,y+280);
}
writeFileSync('art/preview/story-gear-alignment.png',c.toBuffer('image/png'));
const heads=createCanvas(1200,1500),h=heads.getContext('2d');h.fillStyle='#46534b';h.fillRect(0,0,1200,1500);h.imageSmoothingEnabled=false;
for(const [si,skin] of ['responder','survivor','scout'].entries())for(const [di,dir] of dirs.entries())for(let pose=0;pose<12;pose++){
 h.drawImage(await frame(`story_torso_${skin}_${dir}_${pose}`),96,0,100,95,pose*100,(si*5+di)*100,100,95);
 h.fillStyle='white';h.font='10px sans-serif';h.fillText(`${skin.slice(0,1)} ${dir} ${pose}`,pose*100,(si*5+di)*100+98);
}
writeFileSync('art/preview/story-head-anchors.png',heads.toBuffer('image/png'));

