export type Point = { x: number; y: number };
export type LabCamera = { tilt: number; yaw: number; zoom: number; x: number; y: number };
export type Obstacle = { x: number; y: number; w: number; h: number };
export const LAB_DEFAULTS = { tilt: 45, yaw: 0, zoom: 1.35 };
export function project(p: Point, height: number, c: LabCamera): Point {
  const a = c.yaw * Math.PI / 180, tilt = c.tilt * Math.PI / 180;
  return { x: c.x + (p.x * Math.cos(a) - p.y * Math.sin(a)) * c.zoom,
    y: c.y + ((p.x * Math.sin(a) + p.y * Math.cos(a)) * Math.cos(tilt) - height * Math.sin(tilt)) * c.zoom };
}
export function unproject(p: Point, c: LabCamera): Point {
  const a = c.yaw * Math.PI / 180, x = (p.x - c.x) / c.zoom, y = (p.y - c.y) / c.zoom / Math.cos(c.tilt * Math.PI / 180);
  return { x: x * Math.cos(a) + y * Math.sin(a), y: -x * Math.sin(a) + y * Math.cos(a) };
}
export function depth(p: Point, yaw: number) { const a = yaw * Math.PI / 180; return p.x * Math.sin(a) + p.y * Math.cos(a); }
export function direction(angle: number, yaw: number) { return ((Math.round((angle + yaw * Math.PI / 180) / (Math.PI / 4)) % 8) + 8) % 8; }
export function free(p: Point, radius: number, obstacles: Obstacle[]) {
  return Math.abs(p.x) < 460 - radius && Math.abs(p.y) < 310 - radius && !obstacles.some(o => {
    const x = Math.max(o.x, Math.min(o.x + o.w, p.x)), y = Math.max(o.y, Math.min(o.y + o.h, p.y));
    return Math.hypot(p.x - x, p.y - y) < radius;
  });
}
export function move(p: Point, dx: number, dy: number, radius: number, obstacles: Obstacle[]) {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
  for (let i = 0; i < n; i++) {
    if (free({ x: p.x + dx / n, y: p.y }, radius, obstacles)) p.x += dx / n;
    if (free({ x: p.x, y: p.y + dy / n }, radius, obstacles)) p.y += dy / n;
  }
}

// Cast parallel camera rays from several points on the actor's body into a wall prism.
// This detects actual visual obstruction, including a player standing outside a house.
export function wallOccludes(p: Point, wall: Obstacle, height: number, c: LabCamera) {
  const a=c.yaw*Math.PI/180,t=Math.tan(c.tilt*Math.PI/180);
  for(const z of [8,30,55,75])for(const side of [-8,0,8]){
    const start={x:p.x+Math.cos(a)*side,y:p.y-Math.sin(a)*side};
    const len=(height-z)*t;if(len<=0)continue;
    const dx=Math.sin(a)*len,dy=Math.cos(a)*len;
    let lo=0,hi=1;
    for(const [pos,d,min,max] of [[start.x,dx,wall.x,wall.x+wall.w],[start.y,dy,wall.y,wall.y+wall.h]]){
      if(Math.abs(d)<1e-8){if(pos<min||pos>max){hi=-1;break;}}
      else{const u=(min-pos)/d,v=(max-pos)/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));}
    }
    if(lo<=hi&&hi>=0&&lo<=1)return true;
  }
  return false;
}
