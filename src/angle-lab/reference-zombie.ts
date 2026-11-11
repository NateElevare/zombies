import type { Actor } from './world';

/** The approved sheet is a single three-quarter view, mirrored for left-facing travel. */
export function referenceZombieVisual(actor: Actor, yaw: number) {
  const flip = Math.cos(actor.angle + yaw * Math.PI / 180) < 0;
  let pose = 'idle', frame = Math.floor(actor.phase / 4) % 4;
  if (actor.hp > 0 && actor.action === 'attack' && actor.actionTime > 0) {
    pose = 'attack'; frame = Math.min(3, Math.floor((1 - actor.actionTime / actor.actionLength) * 4));
  } else if (actor.hp > 0 && actor.moving) { pose = 'walk'; frame = Math.floor(actor.phase / 2) % 4; }
  else if (actor.hp <= 0 || actor.flash > 0) { frame = 0; }
  return { frame: `reference_zombie_${pose}_${frame}`, flip, alpha: actor.hp > 0 ? 1 : Math.max(0, 1 - actor.deathTime / 0.8) };
}
