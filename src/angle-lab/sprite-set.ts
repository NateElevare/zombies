import type { Actor } from './world';

export const SPRITE_DIRECTIONS = ['e', 'se', 's', 'ne', 'n'] as const;
export type SpriteDirection = typeof SPRITE_DIRECTIONS[number];
export type SpriteActor = 'responder' | 'zombie';
export type SpriteDetail = 'standard' | '256';
// Source-cell assignments are shared by the importer, runtime and asset checks.
export const SPRITE_SEQUENCES: Record<SpriteActor, Record<string, number[]>> = {
  responder: {
    idle:[0,1], shoot:[2,3], walk:[4,5,6,7], run:[8,9,10,11],
    strafe_left:[12,13,14,15], strafe_right:[16,17,18,19], backpedal:[20,21,22,23],
    reload:[24,25,26,27], melee:[28,29,30,31], hit:[32,33], death:[34,35,36,37], corpse:[39],
  },
  zombie: {idle:[0,1,2,3],walk:[4,5,6,7,8,9,10,11],run:[12,13,14,15,16,17,18,19],attack:[20,21,22,23],hit:[24,25,26,27],death:[28,29,30,31,32,33,34,35],corpse:[39]},
};
export const SPRITE_RESOLUTIONS = { standard:{w:96,h:128,originX:.5,originY:92/128,scale:1}, '256':{w:256,h:256,originX:.5,originY:224/256,scale:3/8} } as const;
export const spriteAtlas = (actor:SpriteActor, detail:SpriteDetail) => `angle_${actor}_v3_${detail}`;

export function spriteFacing(angle:number,yaw:number):{direction:SpriteDirection;flip:boolean} {
  const octant=((Math.round((angle+yaw*Math.PI/180)/(Math.PI/4))%8)+8)%8;
  return [ {direction:'e',flip:false},{direction:'se',flip:false},{direction:'s',flip:false},{direction:'se',flip:true},
    {direction:'e',flip:true},{direction:'ne',flip:true},{direction:'n',flip:false},{direction:'ne',flip:false} ][octant] as {direction:SpriteDirection;flip:boolean};
}

export function locomotion(aimAngle:number,moveAngle:number,running:boolean) {
  const relative=Math.atan2(Math.sin(moveAngle-aimAngle),Math.cos(moveAngle-aimAngle));
  if(Math.abs(relative)>Math.PI*3/4)return 'backpedal';
  if(relative>Math.PI/4)return 'strafe_right';
  if(relative<-Math.PI/4)return 'strafe_left';
  return running?'run':'walk';
}

export function characterVisual(kind:SpriteActor,actor:Actor,yaw:number) {
  const facing=spriteFacing(actor.angle,yaw),sequences=SPRITE_SEQUENCES[kind];
  let pose='idle',phase=actor.phase/4;
  if(actor.hp<=0){pose=actor.deathTime<.8?'death':'corpse';phase=pose==='death'?Math.min(sequences.death.length-1,Math.floor(actor.deathTime/.8*sequences.death.length)):0;}
  else if(actor.actionTime>0&&sequences[actor.action]&&!(actor.action==='shoot'&&actor.moving)){pose=actor.action;phase=Math.min(sequences[pose].length-1,Math.floor((1-actor.actionTime/actor.actionLength)*sequences[pose].length));}
  else if(actor.moving){pose=kind==='responder'?locomotion(actor.angle,actor.moveAngle,actor.running):actor.running?'run':'walk';phase=actor.phase;}
  // Mirroring swaps the character's left and right. Swap the source strafe sequence too.
  let sourcePose=pose;
  if(facing.flip&&pose==='strafe_left')sourcePose='strafe_right';else if(facing.flip&&pose==='strafe_right')sourcePose='strafe_left';
  const frame=Math.max(0,Math.floor(phase))%sequences[sourcePose].length;
  return {...facing,pose,frame:`lab3_${kind}_${facing.direction}_${sourcePose}_${frame}`};
}
