export const LAB_ANIMATIONS = {
  survivor: { idle: 4, walk: 8, run: 8, shoot: 2, reload: 6, melee: 4, hit: 3, death: 8, corpse: 1 },
  zombie: { idle: 4, walk: 8, attack: 6, hit: 3, death: 8, corpse: 1 },
} as const;
export type LabActorKind = keyof typeof LAB_ANIMATIONS;
export const LAB_SPAWN_SECONDS = 30;

export function labFrame(actor: LabActorKind, tilt: number, facing: number, pose: string, phase: number) {
  const full = tilt === 45;
  if (!full && !['idle', 'walk', 'corpse'].includes(pose)) pose = pose === 'run' ? 'walk' : 'idle';
  if (!full && actor === 'survivor' && pose === 'corpse') pose = 'idle';
  const counts = LAB_ANIMATIONS[actor] as Record<string, number>;
  const count = full ? counts[pose] ?? 1 : pose === 'walk' ? 4 : 1;
  return `angle_${actor}_${tilt}_${facing}_${pose}_${Math.max(0, Math.floor(phase)) % count}`;
}
