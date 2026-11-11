import { loadImage } from '@napi-rs/canvas';
import { join } from 'node:path';
import { canvas, packAtlas, contactSheet, type Frame, type ManifestFragment } from '../lib/core';
import { ZTYPES, type ZType } from '../characters/zombies';

const sheets: {file: string; rows: [ZType, number][]}[] = [
  {file:'walkers',rows:[['walker',0],['walker',1],['walker',2],['walker',3]]},
  {file:'runners-crawlers',rows:[['runner',0],['runner',1],['runner',2],['crawler',0],['crawler',1]]},
  {file:'heavies',rows:[['brute',0],['brute',1],['bloater',0],['bloater',1]]},
];
export default async function():Promise<ManifestFragment>{
  const frames:Frame[]=[],sprites:Record<string,unknown>={},anims:NonNullable<ManifestFragment['anims']>=[];
  for(const sheet of sheets){
    const source=await loadImage(join(process.cwd(),'art/source/zombie-climb',sheet.file+'.png'));
    const cw=source.width/4,ch=source.height/sheet.rows.length;
    for(const [row,[type,variant]]of sheet.rows.entries()){
      const names:string[]=[],size=ZTYPES[type].frame,pad=8;
      for(let col=0;col<4;col++){
        const {c,g}=canvas(size,size),name=`zombie_${type}_${variant}_climb_${col}`;
        g.imageSmoothingEnabled=false;
        // Generated sheet cells can be rectangular. Contain with a uniform scale:
        // never stretch anatomy or fit each pose independently.
        const scale=(size-pad*2)/Math.max(cw,ch),w=cw*scale,h=ch*scale;
        g.drawImage(source,col*cw,row*ch,cw,ch,(size-w)/2,(size-h)/2,w,h);
        const data=g.getImageData(0,0,size,size).data;let clear=0,visible=0;
        for(let p=3;p<data.length;p+=4){if(data[p]===0)clear++;if(data[p]>127)visible++;}
        if(clear<size*size*.25||visible<size*size*.03)throw new Error('Empty or opaque climb frame '+name);
        frames.push({name,canvas:c});names.push(name);
      }
      const key=`zombie_${type}_${variant}_climb`;
      sprites[key]={atlas:'zombie_climb',origin:[.5,.5]};
      anims.push({key,atlas:'zombie_climb',frames:names,frameRate:6,repeat:0});
    }
  }
  packAtlas('zombie_climb',frames);
  contactSheet(join(process.cwd(),'art/preview/zombie-climb.png'),frames,4,'#303437');
  return {atlases:['zombie_climb'],sprites,anims,zombieClimbArt:'reference-pixel-overhead-v1'};
}
