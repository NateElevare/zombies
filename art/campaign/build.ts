/** Imports authored overhead raster art; never invokes the retired humanoid generator. */
import { loadImage } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canvas, packAtlas, savePng, writeFile, contactSheet, type Frame, type Canvas } from '../lib/core';
import { CAMPAIGN_ART_STYLE, CAMPAIGN_FRAME_SIZE, NAMED_CAMPAIGN_POSES, RESIDENT_CAMPAIGN_POSES } from '../../src/campaign-art';

const source=join(process.cwd(),'art/source/campaign-pixel'),out=join(process.cwd(),'public/assets/campaign');
const named=['mara','eli','june','ruth'],residents=Array.from({length:6},(_,i)=>`resident${i}`);
const people:Frame[]=[],props:Frame[]=[],provenance:Record<string,string>={};

/** Respect actual output dimensions rather than assuming the requested generation size. */
async function sheet(name:string,cols:number,rows:number,inset=0):Promise<Canvas[]> {
  const image=await loadImage(join(source,`${name}.png`)),cells:Canvas[]=[];
  // Authored sheets have small gutter deviations: use inspected clear seams for props.
  const seams:Record<string,{x?:number[];y?:number[]}>= {
    machinery:{y:[0,319,603,899,1199]},
    civic:{x:[0,315,625,938,1261],y:[0,312,623,938,1247]},
    vehicles:{x:[0,317,634,953,1268]},
  };
  const cuts=seams[name],xx=(col:number)=>cuts?.x?.[col]??Math.round(col*image.width/cols),yy=(row:number)=>cuts?.y?.[row]??Math.round(row*image.height/rows);
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const x=xx(col)+inset,y=yy(row)+inset;
    const w=xx(col+1)-x-inset,h=yy(row+1)-y-inset;
    const {c,g}=canvas(w,h);g.drawImage(image,x,y,w,h,0,0,w,h);cells.push(c);
  }
  return cells;
}
function bounds(c:Canvas){
  const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  let x=c.width,y=c.height,right=0,bottom=0,visible=0;
  for(let yy=0;yy<c.height;yy++)for(let xx=0;xx<c.width;xx++)if(data[(yy*c.width+xx)*4+3]>32){
    x=Math.min(x,xx);y=Math.min(y,yy);right=Math.max(right,xx+1);bottom=Math.max(bottom,yy+1);visible++;
  }
  if(visible<80)throw new Error('Empty source cell');
  return {x,y,w:right-x,h:bottom-y};
}
/** One crop and scale per animated family, so powered states cannot pulse in size. */
function fitGroup(cells:Canvas[],w=256,h=192):Canvas[]{
  const bs=cells.map(bounds),x=Math.min(...bs.map(b=>b.x)),y=Math.min(...bs.map(b=>b.y));
  const bw=Math.max(...bs.map(b=>b.x+b.w))-x,bh=Math.max(...bs.map(b=>b.y+b.h))-y;
  const k=Math.min((w-16)/bw,(h-16)/bh),dw=Math.round(bw*k),dh=Math.round(bh*k);
  return cells.map(cell=>{const {c,g}=canvas(w,h);g.imageSmoothingEnabled=false;g.drawImage(cell,x,y,bw,bh,Math.round((w-dw)/2),Math.round((h-dh)/2),dw,dh);return c;});
}
for(const id of named){
  const cells=await sheet(id,8,5);let n=0;
  for(const [pose,count]of Object.entries(NAMED_CAMPAIGN_POSES))for(let i=0;i<count;i++){
    const cell=cells[n++],{c,g}=canvas(CAMPAIGN_FRAME_SIZE,CAMPAIGN_FRAME_SIZE);bounds(cell);
    // Fixed centers preserve registration; do not recenter individual walk/gesture poses.
    g.imageSmoothingEnabled=false;g.drawImage(cell,8,8,112,112);
    people.push({name:`${id}_${pose}_${i}`,canvas:c});
  }
}
const residentCells=await sheet('residents',6,8);
for(const [col,id]of residents.entries()){
  let row=0;
  for(const [pose,count]of Object.entries(RESIDENT_CAMPAIGN_POSES))for(let i=0;i<count;i++){
    const cell=residentCells[row++*6+col],{c,g}=canvas(128,128);bounds(cell);
    g.imageSmoothingEnabled=false;g.drawImage(cell,8,8,112,112);people.push({name:`${id}_${pose}_${i}`,canvas:c});
  }
}
packAtlas('campaign_people',people);
contactSheet(join(process.cwd(),'art/preview/campaign-people.png'),people.filter(f=>/_idle_0$|_walk_1$|_work_1$|_injured_0$/.test(f.name)),4,'#303437');
contactSheet(join(process.cwd(),'art/preview/campaign-animations.png'),people,8,'#303437');

const portraits=await sheet('portraits',4,4),residentPortraits=await sheet('resident-portraits',3,2);
const expressions=['neutral','worried','relieved','firm'];
for(const [row,id]of named.entries())for(const [col,expression]of expressions.entries()){
  const {c,g}=canvas(256,256);g.imageSmoothingEnabled=false;g.drawImage(portraits[row*4+col],0,0,256,256);savePng(join(out,`portrait-${id}-${expression}.png`),c);
}
// The resident UI uses neutral portraits; keep old expression filenames compatible.
for(const [i,id]of residents.entries())for(const expression of expressions){
  const {c,g}=canvas(256,256);g.imageSmoothingEnabled=false;g.drawImage(residentPortraits[i],0,0,256,256);savePng(join(out,`portrait-${id}-${expression}.png`),c);
}

function family(id:string,cells:Canvas[],origin:string,w=256,h=192){
  const fitted=fitGroup(cells,w,h);
  for(let i=0;i<4;i++){const name=`${id}_${i}`;props.push({name,canvas:fitted[Math.min(i,fitted.length-1)]});provenance[name]=origin;}
}
const machinery=await sheet('machinery',4,4),vehicles=await sheet('vehicles',4,4),civic=await sheet('civic',4,4);
family('generator',machinery.slice(0,4),'machinery.png:0-3');family('radio',machinery.slice(4,8),'machinery.png:4-7');
family('lantern',machinery.slice(8,10),'machinery.png:8-9');family('flare',machinery.slice(10,12),'machinery.png:10-11');
family('floodlight',machinery.slice(12,14),'machinery.png:12-13');family('tower',[machinery[14]],'machinery.png:14',192,192);family('solar',[machinery[15]],'machinery.png:15');
for(const [i,id]of ['fire_engine','bus','flatbed','semi'].entries())family(id,vehicles.slice(i*4,i*4+4),`vehicles.png:${i*4}-${i*4+3}`,256,160);
for(const [index,id]of Object.entries({0:'water_tank',1:'tent',2:'hose',3:'laundry',4:'hiding_nook',8:'notice',9:'logs',10:'iv',11:'dam',15:'barrier'})){
  family(id,[civic[Number(index)]],`civic.png:${index}`,id==='dam'||id==='barrier'?256:192,id==='dam'||id==='barrier'?72:192);
}
family('ledger',[civic[5],civic[5],civic[6],civic[7]],'civic.png:5-7');
for(const id of ['gate','inner_gate','rollup'])family(id,civic.slice(12,15),'civic.png:12-14',256,96);
// Reuse the city's actual furniture instead of drawing simpler approximations.
const existing=new Map<string,Canvas>();
for(const atlas of ['env_props','structures']){
  const image=await loadImage(`public/assets/${atlas}.png`),json=JSON.parse(readFileSync(`public/assets/${atlas}.json`,'utf8'));
  for(const [name,value]of Object.entries(json.frames) as [string,{frame:{x:number;y:number;w:number;h:number}}][]){
    const f=value.frame,{c,g}=canvas(f.w,f.h);g.drawImage(image,f.x,f.y,f.w,f.h,0,0,f.w,f.h);existing.set(name,c);
  }
}
const reuse:Record<string,string[]>={
  infirmary:['prop_hbed_0','prop_hbed_1'],gurney:['prop_hbed_0'],stretcher:['prop_cot_0'],bunks:['prop_bed_0','prop_bed_1'],
  workshop:['struct_workbench'],tool_shelf:['struct_workbench'],kitchen:['prop_stove_0'],fuel_tank:['prop_barrel_2'],
  cache:['prop_mcrate_0'],produce:['prop_shelf_0'],checkout:['prop_counter_0'],cooler:['prop_cooler_0'],crash_cart:['prop_cart_0'],plants:['prop_planter_0'],
};
for(const [id,keys]of Object.entries(reuse))family(id,keys.map(key=>{const c=existing.get(key);if(!c)throw new Error(`Missing shared art ${key}`);return c;}),keys.join(', '));
family('server',[machinery[4],machinery[6]],'machinery.png:4,6');family('dispatch',machinery.slice(4,8),'machinery.png:4-7');

const chapters=await sheet('chapters',2,4);
for(let i=0;i<7;i++){const {c,g}=canvas(960,300);g.imageSmoothingEnabled=false;g.drawImage(chapters[i],0,0,960,300);savePng(join(out,i===6?'ending.png':`chapter-${i+1}.png`),c);}
const signs={station_sign:'BELLWETHER • STATION 3',haven_sign:'H A V E N',hardware_sign:'BELLWETHER HARDWARE',grocery_sign:'GROCERY • CLOSED',hospital_sign:'EMERGENCY',depot_sign:'BELLWETHER PUBLIC WORKS',checkpoint_sign:'EVACUATION ROUTE',ridge_sign:'NORTH RIDGE RELAY',school_sign:'WAITING FOR BUS'};
for(const [id,label]of Object.entries(signs)){
  const {c,g}=canvas(512,96);g.imageSmoothingEnabled=false;g.drawImage(chapters[7],8,8,496,80);
  g.fillStyle='#10171488';g.fillRect(15,20,482,57);g.fillStyle='#e4d8b8';g.font=`bold ${id==='haven_sign'?36:24}px sans-serif`;g.textAlign='center';g.fillText(label,256,58);
  props.push({name:id,canvas:c});provenance[id]='chapters.png:7 + readable lettering';
}
packAtlas('campaign_props',props);contactSheet(join(process.cwd(),'art/preview/campaign-props.png'),props.filter(f=>f.name.endsWith('_0')||f.name.endsWith('_sign')),6,'#303437');
const icons=await sheet('icons',4,4,6),iconNames=['antibiotics','suture_kit','hinges','lantern','medical_crate','water_parts','notice','fuel_can','generator_parts','relay_module','evacuation_logs','bus_keys','bus_battery','community_ledger'];
for(const [i,id]of iconNames.entries())savePng(join(out,`icon-${id}.png`),fitGroup([icons[i]],80,80)[0]);
// Existing seamless water stays code-native, as do lights and other simulation effects.
const tiles:Frame[]=[];
for(let v=0;v<4;v++){const {c,g}=canvas(128,128),im=g.createImageData(128,128);for(let y=0;y<128;y++)for(let x=0;x<128;x++){const i=(y*128+x)*4,n=Math.sin((x+y*.5)/128*Math.PI*8+v)*2+Math.sin(y/128*Math.PI*16)*3;im.data[i]=40+n;im.data[i+1]=69+n;im.data[i+2]=70+n;im.data[i+3]=255;}g.putImageData(im,0,0);tiles.push({name:`campaign_water_${v}`,canvas:c,extrude:2});}packAtlas('campaign_materials',tiles);
writeFile(join(out,'pack.json'),JSON.stringify({version:2,style:CAMPAIGN_ART_STYLE,camera:'overhead',artScale:2,atlases:['campaign_people','campaign_props','campaign_materials'],characters:[...named,...residents],poses:NAMED_CAMPAIGN_POSES,residentPoses:RESIDENT_CAMPAIGN_POSES,props:[...new Set(props.map(f=>f.name.replace(/_\d+$/,'')))],provenance},null,2));
console.log(`Authored campaign art: ${people.length} character frames, ${props.length} prop frames, 40 portraits, 14 icons and seven chapter illustrations.`);
