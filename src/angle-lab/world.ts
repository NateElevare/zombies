import { LAB_SPAWN_SECONDS } from './animations';
import { free, move, type Obstacle, type Point } from './math';

export type Actor = Point & {id:number; angle:number; moveAngle:number; phase:number; moving:boolean; running:boolean; hp:number; flash:number; action:string; actionTime:number; actionLength:number; deathTime:number; cooldown:number; route:Point[]; routeTime:number};
const actor=(id:number,x:number,y:number,hp:number):Actor=>({id,x,y,hp,angle:0,moveAngle:0,phase:0,moving:false,running:false,flash:0,action:'idle',actionTime:0,actionLength:0,deathTime:0,cooldown:0,route:[],routeTime:0});
export function actorPose(a:Actor):[string,number] {
  if(a.hp<=0)return a.deathTime<.8?['death',Math.min(7,Math.floor(a.deathTime*10))]:['corpse',0];
  if(a.actionTime>0){const frames=({shoot:2,reload:6,melee:4,attack:6,hit:3} as Record<string,number>)[a.action]||1;return[a.action,Math.min(frames-1,Math.floor((1-a.actionTime/a.actionLength)*frames))];}
  return a.moving?[a.running?'run':'walk',a.phase]:['idle',a.phase/4];
}
function action(a:Actor,name:string,length:number){a.action=name;a.actionTime=a.actionLength=length;}
export function clearLine(a:Point,b:Point,obstacles:Obstacle[]){const d=Math.hypot(b.x-a.x,b.y-a.y);for(let t=0;t<=d;t+=4){const u=d?t/d:0;if(!free({x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u},1,obstacles))return false;}return true;}

/** Small, isolated combat/spawn model; no main-game progression or save access. */
export class LabWorld {
  player=actor(0,-70,95,100);
  zombies:Actor[]=[];
  spawnIn=LAB_SPAWN_SECONDS;
  spawned=0; kills=0; ammo=8; message='A zombie arrives every 30 seconds.';
  private serial=0;
  constructor(readonly obstacles:Obstacle[]){this.reset();}
  reset(){this.player=actor(0,-70,95,100);this.zombies=[];this.spawnIn=LAB_SPAWN_SECONDS;this.spawned=0;this.serial=0;this.kills=0;this.ammo=8;this.spawn({x:180,y:-60});this.message='A zombie arrives every 30 seconds. Enter the house to test wall fading.';}
  spawn(at?:Point){
    const sites=[{x:410,y:-90},{x:-410,y:150},{x:270,y:260},{x:-180,y:260},{x:110,y:-275},{x:-410,y:-260}];
    const choices=sites.map((_,i)=>sites[(i+this.serial)%sites.length]);
    const point=at||choices.find(p=>free(p,14,this.obstacles)&&Math.hypot(p.x-this.player.x,p.y-this.player.y)>130&&!this.zombies.some(z=>z.hp>0&&Math.hypot(z.x-p.x,z.y-p.y)<30))||choices[0];
    const z=actor(++this.serial,point.x,point.y,3);z.angle=Math.PI;this.zombies.push(z);this.spawned++;
  }
  damage(a:Actor,n:number){if(a.hp<=0)return;a.hp=Math.max(0,a.hp-n);a.flash=.22;if(a.hp<=0){a.deathTime=0;a.moving=false;a.actionTime=0;if(a.id)this.kills++;else this.message='You are down. R resets the scene.';}else action(a,'hit',.25);}
  reload(){if(this.player.hp>0&&this.ammo<8&&this.player.action!=='reload'){action(this.player,'reload',1.2);this.message='Reloading…';}}
  melee(){const p=this.player;if(p.hp<=0||p.cooldown>0)return;action(p,'melee',.4);p.cooldown=.5;for(const z of this.zombies)if(z.hp>0&&Math.hypot(z.x-p.x,z.y-p.y)<65&&Math.cos(Math.atan2(z.y-p.y,z.x-p.x)-p.angle)>.3&&clearLine(p,z,this.obstacles))this.damage(z,1);}
  shoot(aim:Point){
    const p=this.player;if(p.hp<=0||p.cooldown>0||p.actionTime>0&&['reload','melee'].includes(p.action))return;
    if(this.ammo===0){this.reload();return;}
    this.ammo--;p.cooldown=.23;action(p,'shoot',.18);const a=p.angle=Math.atan2(aim.y-p.y,aim.x-p.x);
    let end={x:p.x,y:p.y};
    for(let d=4;d<460;d+=4){end={x:p.x+Math.cos(a)*d,y:p.y+Math.sin(a)*d};if(!free(end,1,this.obstacles))break;
      const hit=this.zombies.find(z=>z.hp>0&&Math.hypot(end.x-z.x,end.y-z.y)<16);
      if(hit){this.damage(hit,1);this.message=hit.hp?'Hit. Keep firing.':'Zombie down.';break;}}
    return{from:{x:p.x+Math.cos(a)*18,y:p.y+Math.sin(a)*18},to:end,life:.12};
  }
  update(dt:number,elapsed:number,follow:boolean){
    this.spawnIn-=elapsed;
    while(this.spawnIn<=1e-8){this.spawn();this.spawnIn+=LAB_SPAWN_SECONDS;this.message='Another zombie has arrived.';}
    for(const a of [this.player,...this.zombies]){
      a.cooldown=Math.max(0,a.cooldown-dt);a.flash=Math.max(0,a.flash-dt);
      if(a.hp<=0){a.deathTime+=dt;continue;}
      if(a.actionTime>0){a.actionTime=Math.max(0,a.actionTime-dt);if(a.actionTime===0){if(a===this.player&&a.action==='reload'){this.ammo=8;this.message='Reloaded.';}a.action='idle';}}
      // Locomotion advances from actual distance below/in the scene, not held input.
      if(!a.moving)a.phase+=dt*4;
    }
    for(const z of this.zombies){
      z.moving=false;if(z.hp<=0||!follow||this.player.hp<=0)continue;
      const d=Math.hypot(this.player.x-z.x,this.player.y-z.y);z.angle=Math.atan2(this.player.y-z.y,this.player.x-z.x);
      if(z.actionTime>0&&['attack','hit'].includes(z.action))continue;
      if(d<37&&clearLine(z,this.player,this.obstacles)){
        if(z.cooldown===0){action(z,'attack',.6);z.cooldown=1.2;this.damage(this.player,10);}continue;
      }
      z.routeTime-=dt;
      if(z.routeTime<=0){z.route=findRoute(z,this.player,this.obstacles);z.routeTime=.8;}
      const next=z.route[0];if(!next)continue;
      const nd=Math.hypot(next.x-z.x,next.y-z.y);if(nd<5){z.route.shift();continue;}
      const x=z.x,y=z.y;move(z,(next.x-z.x)/nd*39*dt,(next.y-z.y)/nd*39*dt,14,this.obstacles);
      const traveled=Math.hypot(z.x-x,z.y-y);z.moving=traveled>.01;if(z.moving){z.angle=z.moveAngle=Math.atan2(z.y-y,z.x-x);z.phase+=traveled/8;}
    }
    // Keep the newest corpses for visual reference without growing memory forever.
    const dead=this.zombies.filter(z=>z.hp<=0);if(dead.length>16){const drop=new Set(dead.slice(0,dead.length-16));this.zombies=this.zombies.filter(z=>!drop.has(z));}
  }
}

export function findRoute(start:Point,target:Point,obstacles:Obstacle[]):Point[]{
  // Grid flood fill routes through the doorway and around the parked car.
  const size=16,cols=57,rows=37;
  const cell=(p:Point)=>({x:Math.max(0,Math.min(cols-1,Math.round((p.x+448)/size))),y:Math.max(0,Math.min(rows-1,Math.round((p.y+288)/size)))});
  const world=(i:number)=>({x:(i%cols)*size-448,y:Math.floor(i/cols)*size-288});
  const s=cell(start),t=cell(target),begin=s.y*cols+s.x,end=t.y*cols+t.x;
  const prev=new Int32Array(cols*rows).fill(-1),queue=[begin];prev[begin]=begin;let reached=begin,best=Infinity;
  for(let k=0;k<queue.length;k++){
    const i=queue[k],point=world(i),distance=Math.hypot(point.x-target.x,point.y-target.y);
    if(distance<best){best=distance;reached=i;}if(i===end)break;
    const x=i%cols,y=Math.floor(i/cols);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,j=ny*cols+nx;if(nx<0||ny<0||nx>=cols||ny>=rows||prev[j]!==-1||!free(world(j),15,obstacles))continue;prev[j]=i;queue.push(j);}
  }
  if(reached===begin)return[];
  const route:Point[]=[];for(let i=reached;i!==begin;i=prev[i])route.push(world(i));return route.reverse();
}
