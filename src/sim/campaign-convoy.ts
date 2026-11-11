import type { GameState, Vec } from './types';
import type { SiteId } from './campaign-data';
import { sites } from './campaign-world';
import { phys } from './core';
import * as game from './game';

export interface ConvoyTrip { to:SiteId; path:Vec[]; index:number }
const CELL=64,COLS=250;
/** A coarse, inflated obstacle grid for long-distance convoy travel, independent of zombie flow fields. */
export function route(s:GameState,from:Vec,to:Vec):Vec[]|null {
  const blocked=new Uint8Array(COLS*COLS);
  for(const o of s.grid.all())if(o.solid!==false){
    const x0=Math.max(0,Math.ceil((o.x-28)/CELL-.5)),x1=Math.min(COLS-1,Math.floor((o.x+o.w+28)/CELL-.5));
    const y0=Math.max(0,Math.ceil((o.y-28)/CELL-.5)),y1=Math.min(COLS-1,Math.floor((o.y+o.h+28)/CELL-.5));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)blocked[y*COLS+x]=1;
  }
  const point=(i:number)=>({x:(i%COLS+.5)*CELL,y:(Math.floor(i/COLS)+.5)*CELL});
  const nearest=(p:Vec)=>{let result=-1,dist=Infinity;for(let y=Math.max(1,Math.floor(p.y/CELL)-8);y<Math.min(COLS-1,Math.floor(p.y/CELL)+9);y++)for(let x=Math.max(1,Math.floor(p.x/CELL)-8);x<Math.min(COLS-1,Math.floor(p.x/CELL)+9);x++){const i=y*COLS+x,q=point(i),d=Math.hypot(q.x-p.x,q.y-p.y);if(!blocked[i]&&d<dist){dist=d;result=i;}}return result;};
  const start=nearest(from),goal=nearest(to);if(start<0||goal<0)return null;
  const costs=new Float32Array(blocked.length);costs.fill(Infinity);costs[start]=0;
  const previous=new Int32Array(blocked.length);previous.fill(-1);const closed=new Uint8Array(blocked.length);
  const heap:{i:number;f:number}[]=[];
  const push=(i:number,f:number)=>{let j=heap.length;heap.push({i,f});while(j>0){const p=(j-1)>>1;if(heap[p].f<=f)break;heap[j]=heap[p];j=p;}heap[j]={i,f};};
  const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(heap[j].f>=last.f)break;heap[i]=heap[j];i=j;}heap[i]=last;}return first.i;};
  const goalP=point(goal);const estimate=(i:number)=>Math.hypot(point(i).x-goalP.x,point(i).y-goalP.y)/CELL;
  push(start,estimate(start));
  while(heap.length){const i=pop();if(closed[i])continue;closed[i]=1;if(i===goal){const path:Vec[]=[];for(let j=goal;j!==-1;j=previous[j])path.push(point(j));return path.reverse();}
    const x=i%COLS,y=Math.floor(i/COLS);
    for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const nx=x+dx,ny=y+dy,j=ny*COLS+nx;if(nx<1||ny<1||nx>=COLS-1||ny>=COLS-1||blocked[j]||closed[j]||dx&&dy&&(blocked[y*COLS+nx]||blocked[ny*COLS+x]))continue;
      const cost=costs[i]+(dx&&dy?Math.SQRT2:1);if(cost<costs[j]){costs[j]=cost;previous[j]=i;push(j,cost+estimate(j));}
    }
  }return null;
}
export function start(s:GameState,to:SiteId){
  const c=s.campaign!,map=sites(s)!,b=map[to].rect,dest={x:b.x+b.w/2,y:b.y+b.h+120};
  const from=c.bus||{x:map.ridge.x,y:map.ridge.rect.y+map.ridge.rect.h+100};
  const path=route(s,from,dest);if(!path)return false;
  c.bus={...path[0]};c.trip={to,path,index:1};return true;
}
export function update(s:GameState,dt:number){
  const c=s.campaign;if(!c?.trip||!c.bus)return;const trip=c.trip;let distance=190*dt;
  while(distance>0&&trip.index<trip.path.length){const target=trip.path[trip.index],dx=target.x-c.bus.x,dy=target.y-c.bus.y,d=Math.hypot(dx,dy);c.busAngle=Math.atan2(dy,dx);
    if(d<=distance){c.bus={...target};trip.index++;distance-=d;}else{c.bus.x+=dx/d*distance;c.bus.y+=dy/d*distance;distance=0;}}
  if(trip.index>=trip.path.length){c.trip=null;game.save(s);}
}
/** Optional travel between encounter scenes. Players can also follow the simulated bus on foot. */
export function ride(s:GameState){
  const c=s.campaign;if(!c?.trip||c.encounter||s.player.dead)return false;
  const dest=c.trip.path.at(-1)!;let point:Vec|undefined;
  for(let r=70;r<=180&&!point;r+=20)for(let a=0;a<Math.PI*2;a+=Math.PI/4){const p={x:dest.x+Math.cos(a)*r,y:dest.y+Math.sin(a)*r};if(phys.isFree(s,p.x,p.y,16)){point=p;break;}}
  if(!point)return false;c.bus={...dest};c.trip=null;s.player.x=s.player.prevX=point.x;s.player.y=s.player.prevY=point.y;
  s.player.invuln=3;s.ui=null;s.search=null;s.interact=null;game.save(s);return true;
}
