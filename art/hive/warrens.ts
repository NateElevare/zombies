/** Fit the six authored Warrens silhouettes; preserve all other zone materials. */
import { loadImage } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canvas, packAtlas, contactSheet, writeFile, type Canvas, type Frame } from '../lib/core';

const root = process.cwd(), file = 'art/source/hive-environment/warrens-ribbons.png';
const im = await loadImage(join(root, file));
const manifestPath = join(root, 'public/assets/hive-environment.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const frames: Frame[] = [];
const names = ['ribbon_0', 'ribbon_1', 'ribbon_2', 'fragments', 'wear', 'resin'];
function bounds(c: Canvas) {
  const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x=c.width,y=c.height,r=-1,b=-1;
  for(let j=0;j<c.height;j++)for(let i=0;i<c.width;i++)if(p[(j*c.width+i)*4+3]>=32){x=Math.min(x,i);y=Math.min(y,j);r=Math.max(r,i);b=Math.max(b,j);}
  return {x,y,w:r-x+1,h:b-y+1};
}
if(Math.abs(im.width/im.height-1.5)>.02)throw Error('Warrens: expected 3x2 sheet');
for(let i=0;i<6;i++) {
  const cw=im.width/3,ch=im.height/2,raw=canvas(cw,ch);
  raw.g.drawImage(im,(i%3)*cw,Math.floor(i/3)*ch,cw,ch,0,0,cw,ch);
  const b=bounds(raw.c);
  if(b.w<100||b.h<30||b.w>=cw||b.h>=ch)throw Error(`Warrens ${names[i]}: invalid silhouette`);
  const c=canvas(256,256),scale=232/Math.max(b.w,b.h);
  c.g.imageSmoothingEnabled=false;
  c.g.drawImage(raw.c,b.x,b.y,b.w,b.h,(256-b.w*scale)/2,(256-b.h*scale)/2,b.w*scale,b.h*scale);
  const name=`hive_warrens_${names[i]}`;
  frames.push({name,canvas:c.c});
  manifest.frames[name]={atlas:'hive_warrens',bounds:bounds(c.c)};
}
manifest.atlases=[...new Set([...manifest.atlases,'hive_warrens'])];
manifest.sources=[...new Set([...manifest.sources,file])];
packAtlas('hive_warrens',frames);
contactSheet(join(root,'art/preview/hive-warrens-ribbons.png'),frames,3,'#393b38');
writeFile(manifestPath,JSON.stringify(manifest));
console.log('Warrens: six painted wall ribbons and details.');
