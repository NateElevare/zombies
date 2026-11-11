import { project, unproject, type Point } from '../angle-lab/math';

/** Story shares the approved lab camera. Simulation coordinates remain on the ground plane. */
export const STORY_CAMERA = { tilt:45, yaw:0, zoom:1, x:0, y:0 };
export const STORY_ZOOM = 1.35;
export const storyProject = (p:Point, height=0) => project(p,height,STORY_CAMERA);
export const storyUnproject = (p:Point) => unproject(p,STORY_CAMERA);
/** Near edge of a footprint on the camera ray through this screen X. Unlike a
 *  single corner/center depth, this works all along a long wall or roof. */
export function storyFrontDepth(rect:{x:number;y:number;w:number;h:number},screenX:number,yaw=STORY_CAMERA.yaw){
  const sn=Math.sin(yaw*Math.PI/180),cs=Math.cos(yaw*Math.PI/180);
  // An axis parallel to the camera ray imposes no finite depth limit. Avoid
  // division by zero when streets are unrotated (or rotated by a quarter turn).
  const alongX=Math.abs(sn)<1e-8?Infinity:((sn>0?rect.x+rect.w:rect.x)-screenX*cs)/sn;
  const alongY=Math.abs(cs)<1e-8?Infinity:((cs>0?rect.y+rect.h:rect.y)+screenX*sn)/cs;
  return Math.min(alongX,alongY);
}
/** Ground-plane offset equivalent to lifting an effect above the floor. */
export const storyEffectOffset = (height:number) => storyUnproject({x:0,y:-height*Math.sin(STORY_CAMERA.tilt*Math.PI/180)});
/** Short physical wall sections also sort correctly when viewed exactly side-on. */
export function storyWallSections(rect:{x:number;y:number;w:number;h:number}){
  const horizontal=rect.w>=rect.h,length=horizontal?rect.w:rect.h,count=Math.ceil(length/32);
  return Array.from({length:count},(_,i)=>horizontal
    ?{x:rect.x+i*length/count,y:rect.y,w:length/count,h:rect.h}
    :{x:rect.x,y:rect.y+i*length/count,w:rect.w,h:length/count});
}
export function storyMovement(x:number,y:number) {
  const p=storyUnproject({x,y}),length=Math.hypot(p.x,p.y),magnitude=Math.min(1,Math.hypot(x,y));
  return length?{x:p.x/length*magnitude,y:p.y/length*magnitude}:{x:0,y:0};
}
export function storyBounds(x:number,y:number,w:number,h:number) {
  const corners=[{x,y},{x:x+w,y},{x,y:y+h},{x:x+w,y:y+h}].map(storyUnproject);
  const left=Math.min(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y));
  return {x:left,y:top,w:Math.max(...corners.map(p=>p.x))-left,h:Math.max(...corners.map(p=>p.y))-top};
}
