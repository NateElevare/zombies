import type { HiveInfo } from './hive-world';
import type { Rect, Vec } from './types';

type MapShape = Pick<HiveInfo, 'n' | 'tile' | 'floor' | 'zone'> & Partial<Pick<HiveInfo, 'dam'>>;
export interface HiveShape {
  step: number;
  bounds: Rect;
  floors: Rect[];
  interiors: Rect[];
  walls: Rect[];
  contours: { points: Vec[]; closed: boolean }[];
  isFloor(x: number, y: number): boolean;
}
const cache = new WeakMap<MapShape, Map<number, HiveShape>>();

/** The open-air Breach originally labels only carved floor. Give its adjacent
 * unassigned rock to the same boundary owner so its outer rim can round too. */
export function hiveBoundaryZone(h:MapShape,tx:number,ty:number):number {
  if(tx<0||ty<0||tx>=h.n||ty>=h.n)return 0;
  const own=h.zone[ty*h.n+tx];if(own)return own;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const x=tx+dx,y=ty+dy;if(x<0||y<0||x>=h.n||y>=h.n)continue;
    const k=y*h.n+x;if(h.zone[k]===8&&h.floor[k])return 8;
  }
  return 0;
}

/** A smooth occupancy field over the authored map. The coarse grid still supplies
 * mission/navigation tile centres; this finer boundary drives floor art AND physics.
 * Each sector owns its boundary; seals and the concrete dam stay fixed. No RNG is consumed. */
export function hiveShape(h: MapShape, area: number): HiveShape {
  let areas=cache.get(h);if(!areas){areas=new Map();cache.set(h,areas);}
  const old=areas.get(area); if(old)return old;
  const T=h.tile, step=T/8;
  const tileIndex=(x:number,y:number)=>{const tx=Math.floor(x/T),ty=Math.floor(y/T);return tx>=0&&ty>=0&&tx<h.n&&ty<h.n?ty*h.n+tx:-1;};
  const original=(x:number,y:number)=>!!h.floor[tileIndex(x,y)];
  const zone=(x:number,y:number)=>hiveBoundaryZone(h,Math.floor(x/T),Math.floor(y/T));
  let x0=h.n,y0=h.n,x1=-1,y1=-1;
  for(let i=0;i<h.zone.length;i++)if(hiveBoundaryZone(h,i%h.n,Math.floor(i/h.n))===area){const x=i%h.n,y=Math.floor(i/h.n);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  const ox=x0*T,oy=y0*T,w=Math.max(0,(x1-x0+1)*8),height=Math.max(0,(y1-y0+1)*8);
  const fine=new Uint8Array(w*height),owned=new Uint8Array(w*height),near=new Uint8Array(h.n*h.n);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    if(hiveBoundaryZone(h,x,y)!==area)continue;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(original((x+dx+.5)*T,(y+dy+.5)*T))near[y*h.n+x]=1;
  }
  const weights=(t:number)=>[(1-t)**3/6,(3*t**3-6*t*t+4)/6,(-3*t**3+3*t*t+3*t+1)/6,t**3/6];
  function field(x:number,y:number) {
    const dam=h.dam;
    if(dam&&x>=dam.x-T&&x<=dam.x+dam.w+T&&y>=dam.y-T&&y<=dam.y+dam.h+T)return original(x,y)?1:0;
    const u=x/T-.5,v=y/T-.5,ix=Math.floor(u),iy=Math.floor(v),wx=weights(u-ix),wy=weights(v-iy);
    let value=0;
    for(let j=0;j<4;j++)for(let i=0;i<4;i++)if(original((ix+i-.5)*T,(iy+j-.5)*T))value+=wx[i]*wy[j];
    // Low-amplitude, long-wavelength irregularity breaks long ruler-straight runs.
    // It vanishes at zone transitions so existing seals retain their exact footprint.
    let transition=false;
    for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const next=zone(x+i*T,y+j*T);if(next>0&&next!==area)transition=true;}
    if(transition)return original(x,y)?1:0;
    value+=.045*Math.sin(x/137+y/211)+.025*Math.sin(y/83-x/197);
    // Keep a rounded corridor around the original navigation skeleton. Smoothing
    // must never pinch a tile-centre route below a player's swept diameter.
    if(original(x,y)){
      const cx=(Math.floor(x/T)+.5)*T,cy=(Math.floor(y/T)+.5)*T;
      let distance=Math.hypot(x-cx,y-cy);
      if(original(cx+(x<cx?-T:T),cy))distance=Math.min(distance,Math.abs(y-cy));
      if(original(cx,cy+(y<cy?-T:T)))distance=Math.min(distance,Math.abs(x-cx));
      value=Math.max(value,.5+(T*.4-distance)/T);
    }
    return value;
  }
  for(let y=0;y<height;y++)for(let x=0;x<w;x++){
    const px=ox+(x+.5)*step,py=oy+(y+.5)*step,k=y*w+x;
    owned[k]=zone(px,py)===area?1:0;
    fine[k]=owned[k]?(field(px,py)>=.5?1:0):(original(px,py)?1:0);
  }
  const at=(x:number,y:number)=>x>=0&&y>=0&&x<w&&y<height?!!fine[y*w+x]:original(ox+(x+.5)*step,oy+(y+.5)*step);
  const isFloor=(x:number,y:number)=>{const ix=Math.floor((x-ox)/step),iy=Math.floor((y-oy)/step);return at(ix,iy);};
  // Merge adjacent equal rows. Collision and rendering remain bounded even in large rooms.
  function rectangles(floor:boolean,inset=false):Rect[]{
    const out:Rect[]=[];let prev=new Map<string,Rect>();
    for(let y=0;y<height;y++){
      const next=new Map<string,Rect>();
      const eligible=(x:number)=>{
        const k=y*w+x;if(!owned[k]||!!fine[k]!==floor||(!floor&&!near[tileIndex(ox+(x+.5)*step,oy+(y+.5)*step)]))return false;
        if(inset)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(!at(x+dx,y+dy))return false;
        return true;
      };
      for(let x=0;x<w;x++){
        if(!eligible(x))continue;let end=x+1;while(end<w&&eligible(end))end++;
        const key=`${x}:${end}`,r=prev.get(key);
        if(r){r.h+=step;next.set(key,r);}else{const a={x:ox+x*step,y:oy+y*step,w:(end-x)*step,h:step};out.push(a);next.set(key,a);}
        x=end-1;
      }
      prev=next;
    }
    return out;
  }
  type Edge={a:Vec;b:Vec;used:boolean};
  const edges:Edge[]=[],starts=new Map<string,Edge[]>(),key=(p:Vec)=>`${p.x},${p.y}`;
  const add=(x:number,y:number,X:number,Y:number)=>{const e={a:{x:ox+x*step,y:oy+y*step},b:{x:ox+X*step,y:oy+Y*step},used:false};edges.push(e);const k=key(e.a);if(!starts.has(k))starts.set(k,[]);starts.get(k)!.push(e);};
  for(let y=0;y<height;y++)for(let x=0;x<w;x++){
    if(!owned[y*w+x]||!at(x,y))continue;
    if(!at(x,y-1))add(x,y,x+1,y);
    if(!at(x+1,y))add(x+1,y,x+1,y+1);
    if(!at(x,y+1))add(x+1,y+1,x,y+1);
    if(!at(x-1,y))add(x,y+1,x,y);
  }
  const contours:HiveShape['contours']=[];
  // Start open chains at their actual endpoint, then consume remaining closed loops.
  const ends=new Set(edges.map(e=>key(e.b)));
  const ordered=[...edges.filter(e=>!ends.has(key(e.a))),...edges];
  for(const first of ordered){
    if(first.used)continue;
    let edge:Edge|undefined=first;const points=[first.a];
    while(edge&&!edge.used){
      edge.used=true;points.push(edge.b);
      const dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y;
      const candidates:Edge[]=(starts.get(key(edge.b))||[]).filter(e=>!e.used);
      const rank=(e:Edge)=>{const cross=dx*(e.b.y-e.a.y)-dy*(e.b.x-e.a.x),dot=dx*(e.b.x-e.a.x)+dy*(e.b.y-e.a.y);return cross>0?0:dot>0?1:cross<0?2:3;};
      candidates.sort((a,b)=>rank(a)-rank(b));edge=candidates[0];
    }
    const closed=key(points[0])===key(points[points.length-1]);if(closed)points.pop();
    contours.push({points,closed});
  }
  const shape={step,bounds:{x:ox,y:oy,w:w*step,h:height*step},floors:rectangles(true),interiors:rectangles(true,true),walls:rectangles(false),contours,isFloor};areas.set(area,shape);return shape;
}

/** Compatibility helper for the first-area material pack. */
export const warrensShape=(h:MapShape)=>hiveShape(h,1);

