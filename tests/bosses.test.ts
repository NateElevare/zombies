import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newArcade, stepArcade, waveHp, devBoss } from '../src/sim/arcade';
import * as bosses from '../src/sim/bosses';
import * as zombies from '../src/sim/zombies';
import * as upgrades from '../src/sim/upgrades';
import { SIM_DT, phys } from '../src/sim/core';
import type { GameState, InputState } from '../src/sim/types';

const idle: InputState = { moveX: 0, moveY: 0, aimX: 8200, aimY: 8000, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set() };
beforeEach(() => { vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} }); });
afterEach(() => { vi.unstubAllGlobals(); });
function ticks(s: GameState, n: number, immortal = true) {
  for (let i = 0; i < n; i++) {
    if (s.ui === 'levelup') upgrades.choose(s, 0);
    if (immortal) s.player.hp = s.player.maxHp;
    stepArcade(s, idle, SIM_DT);
  }
}
/** Arcade run sitting at the start of `wave` with no other zombies. */
function atWave(wave: number, seed = 7) {
  const s = newArcade(seed), a = s.arcade!;
  s.zombies.length = 0;
  a.wave = wave - 1; a.toSpawn = 0; a.intermission = SIM_DT / 2;
  ticks(s, 1);
  expect(a.wave).toBe(wave);
  return s;
}

describe('arcade bosses', () => {
  it('appear every 10th wave and cycle through all five', () => {
    expect([9, 10, 11, 20, 25, 50].map(bosses.isBossWave)).toEqual([false, true, false, true, false, true]);
    expect([10, 20, 30, 40, 50].map(w => bosses.bossFor(w).id)).toEqual(['butcher', 'broodmother', 'howler', 'juggernaut', 'plague']);
    expect(bosses.bossFor(60)).toEqual({ id: 'butcher', cycle: 1 });
  });

  it('a boss wave spawns one huge, slow, tough boss and does not clear until it dies', () => {
    const s = atWave(10), a = s.arcade!;
    ticks(s, 2);
    const boss = bosses.activeBoss(s)!;
    expect(boss).toBeTruthy(); expect(boss.boss).toBe('butcher');
    expect(s.zombies.filter(z => bosses.isBoss(z))).toHaveLength(1);
    const walker = zombies.TYPES.walker;
    expect(boss.maxHp).toBeGreaterThan(walker.hp * waveHp(10) * 40);
    expect(boss.r).toBeGreaterThan(30);
    expect(boss.speed).toBeLessThan(walker.speed);
    // kill the escort; the boss keeps the wave open
    a.toSpawn = 0;
    for (const z of s.zombies) if (z !== boss) z.dead = true;
    ticks(s, 30);
    expect(a.intermission).toBe(0);
    const score = a.score;
    zombies.damage(s, boss, 1e9, 0);
    ticks(s, 1);
    expect(a.score).toBeGreaterThan(score + 2000);
    expect(s.drops.filter(d => d.id.startsWith('arcade-boss')).length).toBe(3);
    // the Butcher drops its signature cleaver, and the kill grants a free upgrade card
    expect(s.drops.some(d => d.inv.slots.some(x => x?.id === 'butcher_cleaver'))).toBe(true);
    expect(s.arcade!.run!.pending).toBeGreaterThan(0);
    expect(s.events.some(e => e.t === 'bossDefeated')).toBe(true);
    for (const z of s.zombies) z.dead = true;
    ticks(s, 2);
    expect(a.intermission).toBeGreaterThan(0);
  });

  it('bosses shrug off knockback', () => {
    const s = atWave(1); s.arcade!.toSpawn = 0;
    const boss = devBoss(s)!, x = boss.x, y = boss.y;
    boss.speed = boss.baseSpeed = 0;
    zombies.damage(s, boss, 10, 0);
    expect([boss.x, boss.y]).toEqual([x, y]);
  });

  it('bosses smash through props instead of getting stuck, but never through the arena wall', () => {
    const s = atWave(1); s.arcade!.toSpawn = 0;
    const p = s.player;
    for (const id of bosses.BOSS_IDS) {
      for (const z of s.zombies) z.dead = true;
      // wall the boss in with a ring of crates and a car between it and the player
      const bx = p.x + 420, by = p.y;
      for (const o of s.grid.query(bx - 160, by - 160, 320, 320)) if (o.breakable) s.grid.remove(o);
      const props = [
        phys.addSolid(s, { x: bx - 120, y: by - 40, w: 50, h: 80, kind: 'car', sub: 'sedan', breakable: true }),
        phys.addSolid(s, { x: bx - 40, y: by - 110, w: 80, h: 48, kind: 'furniture', sub: 'crate', breakable: true }),
        phys.addSolid(s, { x: bx - 40, y: by + 62, w: 80, h: 48, kind: 'furniture', sub: 'crate', breakable: true }),
        phys.addSolid(s, { x: bx + 62, y: by - 40, w: 48, h: 80, kind: 'furniture', sub: 'crate', breakable: true }),
      ];
      const boss = bosses.spawnBoss(s, (bosses.BOSS_IDS.indexOf(id) + 1) * 10, bx, by, 1);
      boss.hp = boss.maxHp = 1e9;
      let reached = false;
      for (let i = 0; i < 60 * 25 && !reached; i++) {
        p.hp = p.maxHp; p.x = 8000; p.y = 8000;
        stepArcade(s, idle, SIM_DT); s.events.length = 0;
        if (s.ui === 'levelup') upgrades.choose(s, 0);
        reached = Math.hypot(boss.x - p.x, boss.y - p.y) < boss.r + p.r + 40;
      }
      expect(reached, `${id} reached the player`).toBe(true);
      expect(props[0].solid).toBe(false);                       // the car is now a wreck
      expect((props[0] as { wreck?: boolean }).wreck).toBe(true);
      bosses.clearFx(s);
    }
    // the perimeter is not breakable
    expect(s.grid.all().filter(o => o.kind === 'wall' && !o.breakable).length).toBeGreaterThanOrEqual(4);
    expect(bosses.smash(s, 6800 + 20, 8000, 60)).toBe(0);
  });

  it.each(bosses.BOSS_IDS)('%s uses its special attacks and hurts a player who stands still', (id) => {
    const s = atWave(1); const a = s.arcade!; a.toSpawn = 0; a.intermission = 0;
    // devBoss cycles the rotation; spawn until we get the one under test
    let boss = null;
    for (let i = 0; i < bosses.BOSS_IDS.length && (!boss || boss.boss !== id); i++) { if (boss) boss.dead = true; boss = devBoss(s); }
    expect(boss!.boss).toBe(id);
    const before = s.zombies.length;
    let hazards = 0, hurt = 0, maxZ = 0;
    for (let i = 0; i < 60 * 14; i++) {
      s.player.hp = s.player.maxHp; s.player.invuln = 0;
      stepArcade(s, idle, SIM_DT);
      if (s.ui === 'levelup') upgrades.choose(s, 0);
      const f = bosses.fx(s);
      hazards += f.shots.length + f.rings.length + f.tele.length + f.pools.length;
      hurt += s.events.filter(e => e.t === 'playerHurt').length; s.events.length = 0;
      maxZ = Math.max(maxZ, s.zombies.filter(z => !z.dead).length);
    }
    expect(boss!.dead).toBe(false);
    expect(hazards).toBeGreaterThan(0);
    expect(hurt).toBeGreaterThan(0);
    if (id === 'broodmother') expect(maxZ).toBeGreaterThan(before);
  });
});
