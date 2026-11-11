import { describe, it, expect } from 'vitest';
import type { GameState, Zombie } from '../src/sim/types';
import { isQueenConduit, queenConduitFrame, queenConduitObjective } from '../src/hive-conduits';

const conduit = () => ({ type: 'burrow', roadTag: 'conduit', hp: 100, maxHp: 100, dead: false }) as unknown as Zombie;
describe('Queen conduit presentation', () => {
  it('counts only surviving conduits and switches instructions when the shield breaks', () => {
    const queen = { boss: 'queen', stage: 0, clutch: 0 } as unknown as Zombie & { stage: number };
    const cons = Array.from({ length: 4 }, conduit);
    const s = { zombies: [...cons, { type: 'burrow' }, { type: 'egg', roadTag: 'conduit' }] } as GameState;
    expect(queenConduitObjective(s, queen)).toContain('4 CONDUITS REMAINING');
    cons[0].dead = true;
    expect(queenConduitObjective(s, queen)).toContain('3 CONDUITS REMAINING');
    cons[1].dead = cons[2].dead = true;
    expect(queenConduitObjective(s, queen)).toContain('1 CONDUIT REMAINING');
    cons[3].dead = true;
    expect(queenConduitObjective(s, queen)).toContain('0 CONDUITS REMAINING');
    queen.stage = 1;
    expect(queenConduitObjective(s, queen)).toBe('SHIELD BROKEN · ATTACK THE QUEEN');
    expect(queenConduitObjective(s, null)).toBe('');
    expect(queenConduitObjective(s, { boss: 'warden' } as unknown as Zombie)).toBe('');
    expect(queenConduitObjective(s, { boss: 'queen', dead: true } as unknown as Zombie)).toBe('');
    expect(queenConduitObjective(s, { boss: 'queen', stage: 0 } as unknown as Zombie)).toBe('SHIELDED · DESTROY THE GLOWING CONDUITS');
  });
  it('keeps its identity after death and selects distinct live, injured and shattered art', () => {
    const z = conduit();
    expect(isQueenConduit(z)).toBe(true);
    expect(isQueenConduit({ type: 'burrow' } as Zombie)).toBe(false);
    expect(queenConduitFrame(z, 0)).toBe('hive_queen_conduit_idle');
    expect(queenConduitFrame(z, Math.PI / 6)).toBe('hive_queen_conduit_pulse');
    z.hp = 50;
    expect(queenConduitFrame(z, Math.PI / 6)).toBe('hive_queen_conduit_damaged');
    z.dead = true;
    expect(queenConduitFrame(z, 0)).toBe('hive_queen_conduit_destroyed');
    expect(isQueenConduit(z)).toBe(true);
  });
});
