import { hiveShape } from '../sim/hive-shape';
import type { HiveInfo } from '../sim/hive-world';

/** Authored environment frames use the map's zone ids, including 8 for the Breach. */
export const hiveMaterial = (zone: number, part: string) => `hive_env_${zone}_${part}`;
export function hiveMaterialZone(h: HiveInfo, x: number, y: number): number {
  const tx = Math.floor(x / h.tile), ty = Math.floor(y / h.tile);
  if (tx < 0 || ty < 0 || tx >= h.n || ty >= h.n) return 8;
  const own = h.zone[ty * h.n + tx];
  if (own) return own;
  // A wall lamp can sit just outside the carved zone. Match the nearest floor.
  for (let r = 1; r <= 2; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = tx + dx, ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= h.n || ny >= h.n) continue;
    const i = ny * h.n + nx;
    if (h.floor[i] && h.zone[i]) return h.zone[i];
  }
  return 8;
}

/** Wall caps extend at most eight pixels beyond a solid 80px tile. Their broad axis stays
 *  aligned with collision; quarter turns keep rotated corners out of walkable space. */
export function hiveWallCap(h: HiveInfo, tx: number, ty: number) {
  if (tx < 0 || ty < 0 || tx >= h.n || ty >= h.n || h.floor[ty * h.n + tx]) return null;
  const x = (tx + .5) * h.tile, y = (ty + .5) * h.tile, d = h.dam;
  if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return null;
  for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0],[-1,-1],[1,-1],[1,1],[-1,1]]) {
    const nx = tx + dx, ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= h.n || ny >= h.n || !h.floor[ny * h.n + nx]) continue;
    return { x, y, zone: h.zone[ny * h.n + nx] || 8, width: h.tile + 16 };
  }
  return null;
}

export interface HiveWallRibbon { x: number; y: number; angle: number; index: number }
const ribbonCache = new WeakMap<HiveInfo, Map<number,HiveWallRibbon[]>>();
/** Use the shared curved floor boundary; average its tangent over a short arc so
 * the 10px physics approximation never creates right-angle artwork. */
export function hiveWallRibbons(h: HiveInfo, area: number): HiveWallRibbon[] {
  let areas=ribbonCache.get(h);if(!areas){areas=new Map();ribbonCache.set(h,areas);}
  const old=areas.get(area);if(old)return old;
  const out:HiveWallRibbon[]=[];
  for(const contour of hiveShape(h,area).contours){
    let points=contour.points;
    // Two corner-cutting passes move the visible edge by less than one fine cell.
    for(let pass=0;pass<2;pass++){
      const next:typeof points=[];
      if(!contour.closed)next.push(points[0]);
      for(let i=0;i<(contour.closed?points.length:points.length-1);i++){
        const a=points[i],b=points[(i+1)%points.length];
        next.push({x:a.x*.75+b.x*.25,y:a.y*.75+b.y*.25},{x:a.x*.25+b.x*.75,y:a.y*.25+b.y*.75});
      }
      if(!contour.closed)next.push(points[points.length-1]);points=next;
    }
    if(contour.closed)points.push(points[0]);
    const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
    const total=lengths[lengths.length-1];if(!total)continue;
    const at=(s:number)=>{
      s=contour.closed?((s%total)+total)%total:Math.max(0,Math.min(total,s));
      let lo=0,hi=lengths.length-1;while(lo+1<hi){const m=(lo+hi)>>1;if(lengths[m]<s)lo=m;else hi=m;}
      const a=points[lo],b=points[hi],t=(s-lengths[lo])/(lengths[hi]-lengths[lo]||1);return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
    };
    for(let s=0;s<total;s+=28){
      const p=at(s),a=at(s-22),b=at(s+22),angle=Math.atan2(b.y-a.y,b.x-a.x);
      const dam=h.dam;
      if(dam&&p.x>=dam.x-40&&p.x<=dam.x+dam.w+40&&p.y>=dam.y-40&&p.y<=dam.y+dam.h+40)continue;
      const depth=29+4*Math.sin(p.x/173+p.y/127);
      out.push({x:p.x+Math.sin(angle)*depth,y:p.y-Math.cos(angle)*depth,angle,index:out.length});
    }
  }
  areas.set(area,out);return out;
}
const resinCache=new WeakMap<HiveInfo,Map<string,{x:number;y:number;angle:number}>>();
/** Lamps were placed in floor tiles next to a wall. Move their visible resin seam to
 *  the curved wall, keeping the glow and material at the same position. */
export function hiveResinAnchor(h: HiveInfo, x: number, y: number) {
  const area=hiveMaterialZone(h,x,y);
  let anchors=resinCache.get(h);if(!anchors){anchors=new Map();resinCache.set(h,anchors);}
  const key=`${x}:${y}`,old=anchors.get(key);if(old)return old;
  let best:HiveWallRibbon|undefined,distance=h.tile*2;
  for(const p of hiveWallRibbons(h,area)){
    const d=Math.hypot(p.x-x,p.y-y);if(d<distance){distance=d;best=p;}
  }
  const anchor=best?{x:best.x,y:best.y,angle:best.angle}:{x,y,angle:0};anchors.set(key,anchor);return anchor;
}


export const warrensWallRibbons=(h:HiveInfo)=>hiveWallRibbons(h,1);
export const warrensResinAnchor=(h:HiveInfo,x:number,y:number)=>hiveMaterialZone(h,x,y)===1?hiveResinAnchor(h,x,y):{x,y,angle:0};

