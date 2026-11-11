/** Presentation only: never changes zombie collision, AI, attack or damage timing. */
export const ZOMBIE_DEATH_SECONDS = 1.05;
const TAU = Math.PI * 2;
const clamp = (n:number) => Math.max(0,Math.min(1,n));
export const smoothStep = (n:number) => { const t=clamp(n);return t*t*(3-2*t); };
export const angleDelta = (from:number,to:number) => Math.atan2(Math.sin(to-from),Math.cos(to-from));

/** Interpolate through the short arc, then retain a view near octant boundaries.
 * This avoids left/right view chatter as pathfinding gently steers around obstacles. */
export function zombieHeading(previous:number,current:number,alpha:number,view:number|undefined) {
  const angle=previous+angleDelta(previous,current)*clamp(alpha),step=Math.PI/4;
  if(view===undefined)return Math.round(angle/step)*step;
  return Math.abs(angleDelta(view,angle))<=step*.5+.09?view:Math.round(angle/step)*step;
}

/** Phase is a complete stride, independent of the number of authored frames. */
export function zombieStride(type:string) {
  return type==='runner'?76:type==='brute'?72:type==='crawler'?48:type==='bloater'?60:64;
}
export function advanceZombieGait(phase:number,distance:number,type:string,dt:number) {
  // Teleports, knockback and re-entering the view must not race through footwork.
  return dt>0?phase+Math.min(distance,dt*180)/zombieStride(type):phase;
}

export function zombieMotion(phase:number,weight:number,type:string) {
  const crawler=type==='crawler',wave=phase*TAU;
  return {x:Math.sin(wave)*(crawler?.3:.55)*weight,
    y:-Math.abs(Math.sin(wave))*(crawler?.35:1.15)*weight};
}

/** Keep the body on the actor layer until the collapse has finished. The sparse
 * atlas gets anticipation, falling and settling time instead of a sudden corpse swap. */
export function zombieDeath(time:number,crawler=false) {
  const t=Math.max(0,time),fall=smoothStep((t-.12)/.58),settle=1-smoothStep((t-.72)/.33);
  return {frame:t<.17?9:t<.67?10:11,
    y:t>=ZOMBIE_DEATH_SECONDS?0:t<.67?fall*(crawler?1:3):Math.sin(clamp((t-.67)/.38)*Math.PI)*1.5,
    x:(crawler?.3:1.4)*Math.sin(fall*Math.PI)*settle,
    landed:t>=ZOMBIE_DEATH_SECONDS,
    progress:clamp(t/ZOMBIE_DEATH_SECONDS)};
}
