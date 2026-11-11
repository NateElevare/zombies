import type { BossId } from './sim/bosses';

export const BOSS_FRAME_SIZE = 192;
export const WARDEN_FRAME_SIZE = 384;
export const bossFrameSize = (id: BossId) => id === 'warden' ? WARDEN_FRAME_SIZE : BOSS_FRAME_SIZE;
/** The Hive Below's bosses are painted sheets in the hive atlases (art/hive/build.ts), cut on the same pose layout. */
const HIVE_BOSSES: ReadonlySet<BossId> = new Set<BossId>(['marshal']);
/** Frame-name prefix of a boss, up to the pose: `boss_butcher_`, `hive_boss_marshal_`. */
export const bossPrefix = (id: BossId) => HIVE_BOSSES.has(id) ? `hive_boss_${id}_` : `boss_${id}_`;
export const BOSS_SEQUENCES = {
  idle: { start: 0, count: 2, rate: 3 },
  walk: { start: 2, count: 4, rate: 7 },
  melee: { start: 6, count: 2, rate: 8 },
  windup: { start: 8, count: 2, rate: 6 },
  special: { start: 10, count: 2, rate: 8 },
  hit: { start: 12, count: 1, rate: 1 },
  death: { start: 13, count: 3, rate: 6 },
} as const;
export type BossPose = keyof typeof BOSS_SEQUENCES;

export function bossFrame(id: BossId, pose: BossPose, seconds: number) {
  const seq = BOSS_SEQUENCES[pose], step = Math.max(0, Math.floor(seconds * seq.rate));
  const index = pose === 'death' ? Math.min(seq.count - 1, step) : step % seq.count;
  return `${bossPrefix(id)}${pose}_${index}`;
}

// Cooldown resets mark instantaneous attacks that don't have a sim `act` state.
// These are visual reactions only: no new windup, delay or damage is introduced.
export function bossPose(z: { boss: BossId; act?: string; actT?: number; stage?: number; cd?: Record<string, number>; hitFlash: number; attackT: number; x: number; y: number; prevX: number; prevY: number }): BossPose {
  if (z.act === 'stunned' || z.hitFlash > 0.06) return 'hit';
  if (z.act === 'slamWind' && (z.actT || 0) >= 1) return 'special';
  if (z.act?.endsWith('Wind')) return 'windup';
  if (['charging', 'leaping', 'pouncing', 'recover'].includes(z.act || '')) return 'special';
  const cd = z.cd || {};
  if (z.boss === 'broodmother' && (cd.brood > 6.4 || cd.acid > 2.8) ||
      z.boss === 'juggernaut' && cd.boulder > 3 || z.boss === 'plague' && cd.spit > 2.2 || z.boss === 'marshal' && cd.rally > 11.2) return 'special';
  if (z.attackT < 0.5) return 'melee';
  return Math.hypot(z.x - z.prevX, z.y - z.prevY) > 0.01 ? 'walk' : 'idle';
}
