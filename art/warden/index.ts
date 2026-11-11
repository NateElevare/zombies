import { loadImage } from '@napi-rs/canvas';
import { join } from 'node:path';
import { canvas, packAtlas, contactSheet, savePng, type Frame, type ManifestFragment } from '../lib/core';
import { WARDEN_FRAME_SIZE, BOSS_SEQUENCES } from '../../src/boss-art';

/** Dedicated higher-resolution atlas; no regeneration of the five existing bosses. */
export default async function ():Promise<ManifestFragment>{
  const source=await loadImage(join(process.cwd(),'art/source/bosses-pixel/warden.png'));
  const cw=source.width/4,ch=source.height/4,size=WARDEN_FRAME_SIZE,pad=16;
  if(Math.abs(cw/ch-1)>.03)throw new Error('Warden needs a 4 by 4 square-cell sheet');
  const frames:Frame[]=[],sprites:Record<string,unknown>={},anims:NonNullable<ManifestFragment['anims']>=[];
  for(const [pose,seq]of Object.entries(BOSS_SEQUENCES)){
    const names:string[]=[];
    for(let i=0;i<seq.count;i++){
      const n=seq.start+i,{c,g}=canvas(size,size),name=`boss_warden_${pose}_${i}`;
      g.imageSmoothingEnabled=false;
      // Fixed centers and one uniform scale preserve registration through attacks and death.
      g.drawImage(source,n%4*cw,Math.floor(n/4)*ch,cw,ch,pad,pad,size-pad*2,size-pad*2);
      const pixels=g.getImageData(0,0,size,size).data;let visible=0,clear=0;
      for(let p=3;p<pixels.length;p+=4){if(pixels[p]>127)visible++;if(!pixels[p])clear++;}
      if(visible<2000||clear<size*size*.25)throw new Error(`Invalid Warden frame: ${name}`);
      frames.push({name,canvas:c});names.push(name);
      if(n===0)savePng(join(process.cwd(),'art/preview/warden-idle.png'),c);
    }
    const key=`boss_warden_${pose}`;
    sprites[key]={atlas:'warden',origin:[.5,.5]};
    anims.push({key,atlas:'warden',frames:names,frameRate:seq.rate,repeat:['idle','walk'].includes(pose)?-1:0});
  }
  packAtlas('warden',frames);
  contactSheet(join(process.cwd(),'art/preview/warden.png'),frames,4,'#242628');
  return {atlases:['warden'],sprites,anims,wardenArt:'reference-pixel-overhead-v1'};
}
