import type { GameState, Zombie } from './sim/types';

/** Conduits use burrow combat rules, but have their own visual identity. */
export function isQueenConduit(z: Zombie): boolean {
  return z.type === 'burrow' && (z as Zombie & { roadTag?: string }).roadTag === 'conduit';
}

export function queenConduitFrame(z: Zombie, time: number): string {
  const state = z.dead || z.hp <= 0 ? 'destroyed' : z.hp <= z.maxHp * .5 ? 'damaged' : Math.sin(time * 3) > .4 ? 'pulse' : 'idle';
  return `hive_queen_conduit_${state}`;
}

export function queenConduitObjective(state: GameState, boss: Zombie | null): string {
  if (!boss || boss.dead || boss.boss !== 'queen') return '';
  const queen = boss as Zombie & { stage?: number; clutch?: number };
  if ((queen.stage ?? 0) > 0) return 'SHIELD BROKEN · ATTACK THE QUEEN';
  if (queen.clutch === undefined) return 'SHIELDED · DESTROY THE GLOWING CONDUITS';
  const left = state.zombies.filter(z => !z.dead && isQueenConduit(z)).length;
  return left ? `SHIELDED · ${left} CONDUIT${left === 1 ? '' : 'S'} REMAINING` : '0 CONDUITS REMAINING · SHIELD BREAKING';
}
