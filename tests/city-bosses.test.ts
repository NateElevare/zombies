import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as game from '../src/sim/game';
import * as saves from '../src/sim/save';
import * as bosses from '../src/sim/bosses';
import * as city from '../src/sim/city-bosses';
import * as zombies from '../src/sim/zombies';
import * as loot from '../src/sim/loot';
import { ITEMS } from '../src/sim/items';
import { WEAPONS } from '../src/sim/combat';
import { SIM_DT } from '../src/sim/core';
import type { Building, GameState, InputState } from '../src/sim/types';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) });
});
afterEach(() => { vi.unstubAllGlobals(); });

const idle: InputState = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set() };
const run = (s: GameState, seconds: number) => { for (let i = 0; i < seconds * 60; i++) { s.player.hp = s.player.maxHp; game.step(s, idle, SIM_DT); } };
/** Stand just out of "sight" of a lair (zombies.visible) but within pack range, in the open. */
function nearLair(s: GameState): Building {
  for (const b of s.buildings.filter(city.isLair)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = b.x + b.w / 2 + dx * (b.w / 2 + 700), y = b.y + b.h / 2 + dy * (b.h / 2 + 700);
    const off = Math.abs(x - (b.x + b.w / 2)) > 480 + Math.max(b.w, b.h) / 2 + 60 || Math.abs(y - (b.y + b.h / 2)) > 320 + Math.max(b.w, b.h) / 2 + 60;
    if (off && s.grid && !s.buildings.some(o => x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h)) {
      s.player.x = s.player.prevX = x; s.player.y = s.player.prevY = y; return b;
    }
  }
  throw new Error('no lair spot');
}
const lairBoss = (s: GameState, b: Building) => s.zombies.find(z => !z.dead && bosses.isBoss(z) && z.home === b.id);

describe('city bosses', () => {
  it('the largest buildings are lairs, each with a fixed boss type', () => {
    const s = game.newGame(42), lairs = s.buildings.filter(city.isLair);
    expect(lairs.length).toBeGreaterThan(15); expect(lairs.length).toBeLessThan(60);
    expect(new Set(lairs.map(b => city.lairBoss(s, b))).size).toBe(5);
    expect(city.lairBoss(game.newGame(42), lairs[0])).toBe(city.lairBoss(s, lairs[0]));
  });

  it('a boss lurks in its lair from day 2, sized to fit doorways, and announces itself when it hunts you', () => {
    const s = game.newGame(42), b = nearLair(s);
    run(s, 2);
    expect(s.zombies.some(z => !z.dead && z.home === b.id)).toBe(true);   // the pack moved in...
    expect(lairBoss(s, b)).toBeUndefined();                              // ...but no boss on day 1
    s.clock.day = 2;
    run(s, 1);
    const z = lairBoss(s, b)!;
    expect(z).toBeTruthy();
    expect(z.r).toBeLessThanOrEqual(26); expect(z.announced).toBeFalsy(); expect(z.state).not.toBe('chase');
    expect(z.x > b.x && z.x < b.x + b.w && z.y > b.y && z.y < b.y + b.h).toBe(true);
    expect(z.maxHp).toBe(Math.round(bosses.BOSSES[z.boss as bosses.BossId].hp * city.hpMul(2)));
    z.state = 'chase'; s.player.x = z.x + 300; s.player.y = z.y;
    city.update(s, SIM_DT);
    expect(z.announced).toBe(true); expect(s.events.some(e => e.t === 'bossSpawn')).toBe(true);
    expect(bosses.engagedBoss(s)).toBe(z);
  });

  it('killing it drops its signature weapon and a skill point; the lair stays empty after loading', () => {
    const s = game.newGame(42), b = nearLair(s); s.clock.day = 3;
    run(s, 1);
    const z = lairBoss(s, b)!, sp = s.player.sp, level = s.player.level;
    zombies.damage(s, z, 1e9, 0);
    game.step(s, idle, SIM_DT);                                          // the real order: zombies.update culls the dead first
    const fromLevels = s.player.sp - sp - 1;                            // the kill's XP can also level you up
    expect(fromLevels).toBeGreaterThanOrEqual(s.player.level - level);
    const bag = s.drops.find(d => d.id === `boss-${z.id}`)!;
    expect(bag.inv.slots[0]?.id).toBe(bosses.BOSS_WEAPON[z.boss as bosses.BossId]);
    expect(s.player.sp).toBeGreaterThanOrEqual(sp + 1);
    expect(s.base.bossesKilled).toEqual([b.id]);
    const after = s.player.sp; run(s, 1); expect(s.player.sp).toBe(after);   // paid once
    const loaded = game.newGame(42);
    expect(saves.apply(loaded, saves.deserialize(saves.serialize(s)))).toBe(true);
    expect(loaded.base.bossesKilled).toEqual([b.id]);
    nearLair(loaded); loaded.clock.day = 3;
    run(loaded, 2);
    expect(lairBoss(loaded, b)).toBeUndefined();
  });

  it('a boss put away with its pack (player walked off) pays nothing and comes back later', () => {
    const s = game.newGame(42), b = nearLair(s); s.clock.day = 2;
    run(s, 1);
    const z = lairBoss(s, b)!, sp = s.player.sp;
    z.dead = true;                                                       // despawn, not a kill
    game.step(s, idle, SIM_DT);
    expect(s.player.sp).toBe(sp); expect(s.base.bossesKilled ?? []).toEqual([]);
  });

  it('every boss has a legendary trophy weapon; Cola & Mints is a trophy now, with triple damage', () => {
    for (const id of bosses.BOSS_IDS) {
      const w = bosses.BOSS_WEAPON[id];
      expect(ITEMS[w]?.rarity, w).toBe('legendary'); expect(WEAPONS[w], w).toBeTruthy();
      expect(bosses.trophyLoot(id)[0].id).toBe(w);
    }
    expect(WEAPONS.cola_mints.damage).toBeCloseTo(10.5);
    expect(Object.values(loot.TABLES).flat().some(e => e.id === 'cola_mints')).toBe(false);
  });
});
