import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as aug from '../src/sim/augments';
import { newArcade, stepArcade, devBoss } from '../src/sim/arcade';
import * as upgrades from '../src/sim/upgrades';
import * as zombies from '../src/sim/zombies';
import * as player from '../src/sim/player';
import * as inv from '../src/sim/inventory';
import { SIM_DT } from '../src/sim/core';
import type { InputState } from '../src/sim/types';

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
});
afterEach(() => { vi.unstubAllGlobals(); });
const idle: InputState = { moveX: 0, moveY: 0, aimX: 8200, aimY: 8000, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set() };
/** Bonuses as if every listed augment were owned at the given level. */
const withLv = (lv: Record<string, number>) => aug.bonuses({ cores: 0, earned: 0, lv });

describe('augment shop', () => {
  it('buys levels for cores, respects prerequisites and max level, persists, and refunds', () => {
    const m = aug.load();
    expect(m).toEqual({ cores: 0, earned: 0, lv: {} });
    m.cores = 1000;
    expect(aug.canBuy(m, 'rate')).toBe(false);            // needs Hollow Core first
    expect(aug.cost(m, 'dmg')).toBe(20);
    expect(aug.buy(m, 'dmg')).toBe(true);
    expect(aug.cost(m, 'dmg')).toBe(32);                  // +60% of base per level
    expect(aug.buy(m, 'rate')).toBe(true);
    expect(aug.load().lv).toEqual({ dmg: 1, rate: 1 });   // saved
    for (let i = 0; i < 10; i++) aug.buy(m, 'dmg');
    expect(aug.level(m, 'dmg')).toBe(5); expect(aug.cost(m, 'dmg')).toBeNull();
    const before = m.cores;
    aug.respec(m);
    expect(m.lv).toEqual({}); expect(m.cores).toBe(before + aug.spent({ ...m, lv: { dmg: 5, rate: 1 } }));
    m.cores = 5; expect(aug.buy(m, 'dmg')).toBe(false);   // too poor
    expect(aug.AUGS.every(a => !a.req || aug.AUG[a.req].branch === a.branch)).toBe(true);
  });

  it('banks cores once when an arcade run ends, scaling with waves, bosses and Core Harvester', () => {
    const s = newArcade(3);
    s.arcade!.wave = 12; s.arcade!.score = 6000; s.arcade!.bossKills = 1;
    const n = aug.coresFor(s);
    expect(n).toBe(Math.floor(2 * 11 + 0.15 * 121 + 10 + 25));
    s.player.hp = 0;
    stepArcade(s, idle, SIM_DT);
    expect(s.screen).toBe('dead');
    expect(aug.load().cores).toBe(n); expect(s.arcade!.coresEarned).toBe(n);
    expect(aug.bankRun(s)).toBe(0);                       // only once
    const t = newArcade(3, withLv({ cores: 5 }));
    t.arcade!.wave = 12; t.arcade!.score = 6000; t.arcade!.bossKills = 1;
    expect(aug.coresFor(t)).toBe(Math.floor(n * 1.5));
  });
});

describe('augments in a run', () => {
  it('change the starting loadout and stats', () => {
    const plain = newArcade(4), s = newArcade(4, withLv({ hp: 5, speed: 5, ammo: 3, kit: 2 }));
    expect(s.player.maxHp).toBe(175); expect(s.player.hp).toBe(175);
    expect(s.player.speed).toBeCloseTo(plain.player.speed * 1.2);
    const kit = s.player.inv.equip.primary?.id;
    expect(['smg', 'shotgun']).toContain(kit);
    expect(inv.count(s.player.inv, 'ammo_9mm')).toBe(300 + (kit === 'smg' ? 30 * 3 * 2.5 : 0));   // +150% start ammo, plus the kit gun's
    expect(s.player.inv.equip.melee?.id).toBe('bat'); expect(s.arcade!.armory!.map(x => x.id)).toEqual(['knife']);
    stepArcade(s, idle, SIM_DT);
    expect(s.player.maxHp).toBe(175);                     // syncPlayer keeps the augment HP
  });

  it('Head Start opens free picks, Wider Options shows 4 cards, and rerolls are limited', () => {
    const s = newArcade(5, withLv({ headstart: 2, choice: 1, reroll: 2 }));
    expect(s.ui).toBe('levelup');
    const run = s.arcade!.run!;
    expect(run.pending).toBe(2); expect(run.offer).toHaveLength(4);
    expect(upgrades.reroll(s)).toBe(true); expect(upgrades.reroll(s)).toBe(true); expect(upgrades.reroll(s)).toBe(false);
    upgrades.choose(s, 0); upgrades.choose(s, 0);
    expect(s.ui).toBeNull(); expect(run.gadgets.length).toBeGreaterThan(0);
  });

  it('Second Wind saves you once; plating cuts damage; Giant Slayer hurts bosses more', () => {
    const s = newArcade(6, withLv({ plate: 5 }));
    const p = s.player;
    p.hp = 200; p.invuln = 0; player.damage(s, 100, 0);
    expect(p.hp).toBeCloseTo(200 - 80);                   // 20% less, then...
    // ... a lethal hit with Second Wind leaves you at half health
    const t = newArcade(6, withLv({ revive: 1 }));
    t.player.hp = 10; t.player.invuln = 0;
    player.damage(t, 500, 0);
    expect(t.player.dead).toBe(false); expect(t.player.hp).toBe(t.player.maxHp / 2);
    t.player.invuln = 0; player.damage(t, 500, 0);
    expect(t.player.dead).toBe(true);
    // boss damage
    const u = newArcade(7, withLv({ boss: 5 })); u.arcade!.toSpawn = 0;
    const b = devBoss(u)!, hp = b.hp;
    zombies.damage(u, b, 100, 0);
    expect(hp - b.hp).toBeCloseTo(160);
  });
});
