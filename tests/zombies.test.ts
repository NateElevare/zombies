import { describe, expect, it } from 'vitest';
import { angleDiff, newState, phys, SIM_DT } from '../src/sim/core';
import * as zombies from '../src/sim/zombies';
import * as player from '../src/sim/player';
import type { ZombieType } from '../src/sim/types';

function fixture() {
  const s = newState(42, 'arcade'); // Disable survival population director for isolated AI tests.
  s.player = player.create(8000, 8000); return s;
}
describe('zombies', () => {
  it('sees and chases the player, recording actual velocity', () => {
    const s = fixture(), z = zombies.spawn(s, 'walker', 8200, 8000);
    z.losTimer = 0;
    for (let i = 0; i < 60; i++) zombies.update(s, SIM_DT);
    expect(z.state).toBe('chase'); expect(z.x).toBeCloseTo(8135, 5);
    expect(z.vx).toBeCloseTo(-65); expect(z.vy).toBeCloseTo(0);
  });
  it('attacks on contact and resets attack animation only on a swing', () => {
    const s = fixture(), z = zombies.spawn(s, 'walker', 8028, 8000);
    z.losTimer = 0; zombies.update(s, SIM_DT);
    expect(s.player.hp).toBe(90); expect(z.attackT).toBe(0);
    expect(s.events.filter(e => e.t === 'zombieAttack')).toHaveLength(1);
    zombies.update(s, SIM_DT);
    expect(z.attackT).toBeCloseTo(SIM_DT); expect(s.player.hp).toBe(90);
    expect(s.events.filter(e => e.t === 'zombieAttack')).toHaveLength(1);
  });
  it('separates overlapping zombies without passing through solids', () => {
    const s = fixture(); s.player.x = 7000;
    const a = zombies.spawn(s, 'walker', 8000, 8000), b = zombies.spawn(s, 'walker', 8000, 8000);
    phys.addSolid(s, { kind: 'wall', x: 7970, y: 7900, w: 10, h: 200 });
    for (let i = 0; i < 60; i++) zombies.update(s, SIM_DT);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(28);
    expect(phys.isFree(s, a.x, a.y, a.r - 0.01)).toBe(true);
    expect(phys.isFree(s, b.x, b.y, b.r - 0.01)).toBe(true);
    expect(a.vx).toBeLessThanOrEqual(0); expect(b.vx).toBeGreaterThanOrEqual(0);
  });
  it('commits to obstacle avoidance and turns gradually', () => {
    // A noise far from the player uses local steering (the shared flow field only leads to the player/bed).
    const s = fixture(), z = zombies.spawn(s, 'walker', 8100, 8000); s.player.x = 7000;
    z.losTimer = 99; z.memory = 4; z.state = 'investigate'; z.target = { x: 8000, y: 8000 }; z.angle = 0;
    const wall = phys.addSolid(s, { kind: 'wall', x: 8060, y: 7950, w: 10, h: 100 });
    zombies.update(s, SIM_DT);
    expect(z.avoidTimer).toBeCloseTo(0.3);
    expect(Math.abs(angleDiff(0, z.angle))).toBeLessThanOrEqual(Math.PI * SIM_DT * 12);
    phys.removeSolid(s, wall); zombies.update(s, SIM_DT);
    expect(z.avoidTimer).toBeGreaterThan(0); expect(Math.abs(z.vy)).toBeGreaterThan(20);
  });
  it('spawns exactly one horde (half-size: 18 zombies) on night three', () => {
    const s = fixture(); s.mode = 'survival'; s.clock = { day: 3, t: 430 };
    for (let i = 0; i < 150; i++) zombies.update(s, SIM_DT);
    expect(s.base.hordeDay).toBe(3);
    expect(s.events.filter(e => e.t === 'horde')).toEqual([{ t: 'horde', count: 18 }]);
    expect(s.zombies.filter(z => z.horde)).toHaveLength(18);
  });
  it('assigns deterministic variants in the published ranges', () => {
    const a = fixture(), b = fixture();
    for (const type of Object.keys(zombies.VARIANTS) as ZombieType[]) for (let i = 0; i < 30; i++) {
      const z = zombies.spawn(a, type, 8100, 8000), twin = zombies.spawn(b, type, 8100, 8000);
      expect(z).toEqual(twin); expect(z.variant).toBeGreaterThanOrEqual(0); expect(z.variant).toBeLessThan(zombies.VARIANTS[type]);
      expect(z.attackT).toBeGreaterThan(0.5); expect(z.prevAngle).toBe(z.angle);
    }
  });
  it('emits flesh impacts, damage and death metadata, awarding a kill once', () => {
    const s = fixture(), z = zombies.spawn(s, 'walker', 8100, 8000);
    s.mode = 'survival'; // XP is a survival reward; this test never runs the population director.
    zombies.damage(s, z, 999, 0.2, { source: 'bullet' }); zombies.damage(s, z, 999, 0.2);
    expect(s.stats.kills).toBe(1); expect(s.player.xp).toBe(10);
    expect(s.events).toContainEqual(expect.objectContaining({ t: 'bulletHit', surface: 'flesh', angle: 0.2 }));
    expect(s.events).toContainEqual(expect.objectContaining({ t: 'zombieHurt', id: z.id }));
    expect(s.events).toContainEqual(expect.objectContaining({ t: 'zombieKilled', type: z.type, variant: z.variant, angle: z.angle }));
    expect(s.events).toContainEqual(expect.objectContaining({ t: 'sound', name: 'zombieDie' }));
  });
  it('explodes chained bloaters only once each', () => {
    const s = fixture(), a = zombies.spawn(s, 'bloater', 8300, 8000), b = zombies.spawn(s, 'bloater', 8350, 8000);
    b.hp = 40; zombies.damage(s, a, 1000, 0);
    expect(s.stats.kills).toBe(2); expect(s.events.filter(e => e.t === 'explosion')).toHaveLength(2);
  });
  it('accepts the legacy direct bullet signature without marking melee, burn or blast hits as bullets', () => {
    const s = fixture(), z = zombies.spawn(s, 'brute', 8100, 8000);
    zombies.damage(s, z, 1, 0, { source: 'player', crit: false });
    zombies.damage(s, z, 1, 0, { source: 'player', crit: false, melee: true });
    zombies.damage(s, z, 1, 0, { source: 'player', crit: false, burn: true });
    zombies.damage(s, z, 1, 0, { source: 'player', crit: false, explosion: true });
    expect(s.events.filter(e => e.t === 'bulletHit')).toHaveLength(1);
  });
});
