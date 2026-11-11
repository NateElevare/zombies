import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newArcade, stepArcade } from '../src/sim/arcade';
import { SIM_DT, newState } from '../src/sim/core';
import * as zombies from '../src/sim/zombies';
import * as upgrades from '../src/sim/upgrades';
import type { GadgetId, GameState, InputState, PassiveId } from '../src/sim/types';

const idle: InputState = { moveX: 0, moveY: 0, aimX: 8200, aimY: 8000, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set() };
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** Arena with no wave director interference. */
function quiet(seed = 1): GameState {
  const s = newArcade(seed);
  s.arcade!.toSpawn = 0; s.arcade!.intermission = 1e9;
  return s;
}
const run = (s: GameState) => s.arcade!.run!;
function give(s: GameState, id: GadgetId, level: number, evolved = false) {
  run(s).gadgets.push({ id, level, evolved, cd: 0, cd2: 0, angle: 0, prevAngle: 0 });
}
function passive(s: GameState, id: PassiveId, level: number) { run(s).passives.push({ id, level }); }
function ring(s: GameState, n: number, dist: number, type: 'walker' | 'brute' = 'walker') {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    zombies.spawn(s, type, s.player.x + Math.cos(a) * dist, s.player.y + Math.sin(a) * dist);
  }
}
function play(s: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) {
    if (s.ui === 'levelup') upgrades.choose(s, 0);
    s.player.hp = s.player.maxHp;   // isolate gadget output from zombie attacks
    stepArcade(s, idle, SIM_DT);
    s.events.length = 0;
  }
}

describe('arcade upgrades: cards', () => {
  it('offers only new gadgets on the first level-up', () => {
    const s = quiet();
    const offer = upgrades.makeOffer(s);
    expect(offer).toHaveLength(3);
    expect(offer.every(c => c.kind === 'gadget' && c.level === 1)).toBe(true);
    expect(new Set(offer.map(c => c.id)).size).toBe(3);
  });

  it('respects the 4 gadget / 4 passive limits and never offers maxed items', () => {
    const s = quiet(), r = run(s);
    for (const id of ['saw', 'molotov', 'drone', 'coil'] as GadgetId[]) give(s, id, id === 'saw' ? 5 : 2);
    for (const id of ['magnet', 'kevlar', 'hollow', 'mag'] as PassiveId[]) passive(s, id, id === 'magnet' ? 5 : 1);
    const cands = upgrades.candidates(r);
    expect(cands.some(c => c.id === 'frag')).toBe(false);                       // 5th gadget
    expect(cands.some(c => c.id === 'saw')).toBe(false);                        // maxed, pair (adren) not owned
    expect(cands.some(c => c.id === 'magnet')).toBe(false);                     // maxed passive
    expect(cands.some(c => ['powder', 'adren', 'fuel'].includes(c.id))).toBe(false); // 5th passive
    expect(cands.some(c => c.kind === 'evolve')).toBe(false);
    for (let i = 0; i < 50; i++) {
      const offer = upgrades.makeOffer(s);
      expect(new Set(offer.map(c => c.kind + c.id)).size).toBe(3);
      for (const c of offer) expect(cands).toContainEqual(c);
    }
  });

  it('offers gold and heal when everything is maxed', () => {
    const s = quiet();
    for (const id of ['saw', 'molotov', 'drone', 'coil'] as GadgetId[]) give(s, id, 5, true);
    for (const id of ['magnet', 'kevlar', 'powder', 'fuel'] as PassiveId[]) passive(s, id, 5);
    expect(upgrades.candidates(run(s))).toEqual([]);
    expect(upgrades.makeOffer(s).map(c => c.kind)).toEqual(['gold', 'heal']);
    s.ui = 'levelup'; run(s).offer = [{ kind: 'gold', id: 'gold', level: 0 }]; run(s).pending = 1;
    const before = s.arcade!.score;
    expect(upgrades.choose(s, 0)).toBe(true);
    expect(s.arcade!.score).toBe(before + upgrades.goldValue(s));
  });

  it('offers an evolution only for a level 5 gadget with its paired passive', () => {
    const s = quiet();
    give(s, 'saw', 4); passive(s, 'adren', 1);
    expect(upgrades.evolvable(run(s))).toEqual([]);
    run(s).gadgets[0].level = 5;
    expect(upgrades.evolvable(run(s))).toEqual(['saw']);
    for (let i = 0; i < 20; i++) expect(upgrades.makeOffer(s)[0]).toEqual({ kind: 'evolve', id: 'saw', level: 5 });
    // wrong pair: Frag needs Gunpowder, not Adrenaline
    give(s, 'frag', 5);
    expect(upgrades.evolvable(run(s))).toEqual(['saw']);
    passive(s, 'powder', 1);
    expect(upgrades.evolvable(run(s)).sort()).toEqual(['frag', 'saw']);
    // picking it evolves the gadget and it is no longer offered
    s.ui = 'levelup'; run(s).pending = 1; run(s).offer = [{ kind: 'evolve', id: 'saw', level: 5 }];
    upgrades.choose(s, 0);
    expect(upgrades.gadget(run(s), 'saw')!.evolved).toBe(true);
    expect(upgrades.evolvable(run(s))).toEqual(['frag']);
    expect(s.events).toContainEqual({ t: 'upgradePicked', kind: 'evolve', id: 'saw', level: 5 });
  });

  it('has every evolution paired with a distinct passive', () => {
    const pairs = upgrades.GADGET_IDS.map(id => upgrades.GADGETS[id].pair);
    expect(new Set(pairs).size).toBe(5);
    expect(Object.fromEntries(upgrades.GADGET_IDS.map(id => [id, upgrades.GADGETS[id].pair])))
      .toEqual({ saw: 'adren', molotov: 'fuel', drone: 'mag', coil: 'hollow', frag: 'powder' });
  });
});

describe('arcade upgrades: XP and level-up flow', () => {
  it('kills drop XP shards that magnet in, level up, pause the sim, and choosing resumes it', () => {
    const s = quiet(3), p = s.player;
    for (let i = 0; i < upgrades.xpNeed(1); i++) zombies.damage(s, zombies.spawn(s, 'walker', p.x + 40 + (i % 6) * 10, p.y + 60 + Math.floor(i / 6) * 30), 9999, 0);
    for (let i = 0; i < 240 && s.ui !== 'levelup'; i++) stepArcade(s, idle, SIM_DT);
    expect(s.ui).toBe('levelup');
    expect(run(s).level).toBe(2);
    expect(s.events).toContainEqual({ t: 'arcadeLevelUp', level: 2 });
    const tick = s.tick;
    stepArcade(s, idle, SIM_DT); stepArcade(s, idle, SIM_DT);
    expect(s.tick).toBe(tick);                                   // paused
    const card = run(s).offer![1];
    expect(upgrades.choose(s, 1)).toBe(true);
    expect(s.ui).toBeNull(); expect(run(s).offer).toBeNull();
    expect(upgrades.gadget(run(s), card.id as GadgetId)?.level).toBe(1);
    stepArcade(s, idle, SIM_DT);
    expect(s.tick).toBe(tick + 1);                               // resumed
    expect(upgrades.choose(s, 0)).toBe(false);                   // nothing open
  });

  it('queues several level-ups from one big pickup', () => {
    const s = quiet();
    upgrades.grantXp(s, upgrades.xpNeed(1) + upgrades.xpNeed(2) + upgrades.xpNeed(3));
    expect(run(s).level).toBe(4); expect(run(s).pending).toBe(3); expect(s.ui).toBe('levelup');
    upgrades.choose(s, 0); expect(s.ui).toBe('levelup'); expect(run(s).pending).toBe(2);
    upgrades.choose(s, 0); upgrades.choose(s, 0);
    expect(s.ui).toBeNull(); expect(run(s).gadgets.length + run(s).passives.length).toBeGreaterThanOrEqual(2);
  });

  it('does not use survival XP and shards outside the magnet stay put', () => {
    const s = quiet();
    s.arcade!.intermission = 0;   // a wave in progress (cleared waves vacuum all shards)
    const sentinel = zombies.spawn(s, 'walker', s.player.x - 900, s.player.y); sentinel.hp = 1e9; sentinel.speed = 0;
    zombies.damage(s, zombies.spawn(s, 'brute', s.player.x + 400, s.player.y), 9999, 0);
    play(s, 60);
    expect(run(s).shards).toHaveLength(1); expect(run(s).shards[0].value).toBe(upgrades.SHARD_XP.brute);
    expect(s.player.xp).toBe(0); expect(run(s).xp).toBe(0);
    passive(s, 'magnet', 5);   // 90 * 2.75 = 247px: still out of reach at 400
    play(s, 30); expect(run(s).shards).toHaveLength(1);
    s.arcade!.intermission = 3;   // wave cleared: vacuum everything
    play(s, 90); expect(run(s).shards).toHaveLength(0); expect(run(s).level).toBe(1); expect(run(s).xp).toBe(upgrades.SHARD_XP.brute);
  });
});

describe('arcade upgrades: gadgets', () => {
  const cases: [GadgetId, boolean][] = upgrades.GADGET_IDS.flatMap(id => [[id, false], [id, true]] as [GadgetId, boolean][]);
  it.each(cases)('%s (evolved: %s) damages and kills zombies through zombies.damage, deterministically', (id, evolved) => {
    const result = () => {
      const s = quiet(42);
      give(s, id, evolved ? 5 : 3, evolved);
      ring(s, 10, id === 'saw' ? (evolved ? 116 : 72) : 200);
      play(s, 60 * 12);
      return { kills: s.stats.kills, score: s.arcade!.score, rng: s.rngState };
    };
    const a = result(), b = result();
    expect(a.kills).toBeGreaterThanOrEqual(3);
    expect(a.score).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('evolved gadgets clearly out-damage level 5', () => {
    for (const id of upgrades.GADGET_IDS) {
      const dmg = (evolved: boolean) => {
        const s = quiet(9);
        give(s, id, 5, evolved);
        ring(s, 12, id === 'saw' ? 100 : 190, 'brute');
        for (const z of s.zombies) { z.hp = z.maxHp = 1e6; z.speed = 0; }
        play(s, 60 * 8);
        return s.zombies.reduce((t, z) => t + (z.maxHp - z.hp), 0);
      };
      expect(dmg(true), id).toBeGreaterThan(dmg(false) * 1.4);
    }
  });

  it('saw blades knock zombies back and drones/coil emit their feedback', () => {
    const s = quiet(5);
    give(s, 'saw', 1); give(s, 'coil', 1); give(s, 'drone', 1);
    const z = zombies.spawn(s, 'brute', s.player.x + 68, s.player.y);
    z.hp = z.maxHp = 1e6; z.speed = 0;
    let zaps = 0, droneShots = 0;
    for (let i = 0; i < 180; i++) {
      stepArcade(s, idle, SIM_DT);
      zaps += s.events.filter(e => e.t === 'zap').length;
      droneShots += s.bullets.filter(b => b.weapon === 'drone').length > 0 ? 1 : 0;
      s.events.length = 0;
    }
    expect(Math.hypot(z.x - s.player.x, z.y - s.player.y)).toBeGreaterThan(68);
    expect(zaps).toBeGreaterThan(0); expect(droneShots).toBeGreaterThan(0);
    expect(run(s).drones).toHaveLength(1);
  });

  it('passives buff the gun: Hollow Points damage, Kevlar max HP that survives ticks', () => {
    const s = quiet();
    passive(s, 'hollow', 2); passive(s, 'kevlar', 2);
    s.player.inv.equip.secondary!.mag = 12; s.player.active = 'secondary';
    stepArcade(s, { ...idle, fire: true }, SIM_DT);
    expect(s.bullets.length).toBeGreaterThan(0);
    expect(s.bullets[0].damage).toBeCloseTo(26 * 1.24);
    play(s, 120);
    expect(s.player.maxHp).toBe(140); expect(s.player.hp).toBe(140);
  });
});

describe('arcade upgrades: survival is unaffected', () => {
  it('every hook is a no-op outside arcade', () => {
    const s = newState(1, 'survival');
    s.player = newArcade(1).player;
    const before = JSON.stringify({ ui: s.ui, arcade: s.arcade, zombies: s.zombies.length, events: s.events });
    upgrades.update(s, SIM_DT); upgrades.pickups(s, SIM_DT); upgrades.gunBuffs(s); upgrades.syncPlayer(s); upgrades.grantXp(s, 999);
    upgrades.dropXp(s, zombies.spawn(s, 'walker', 100, 100));
    expect(upgrades.choose(s, 0)).toBe(false);
    s.zombies.length = 0;
    expect(JSON.stringify({ ui: s.ui, arcade: s.arcade, zombies: s.zombies.length, events: s.events })).toBe(before);
    expect(s.arcade).toBeUndefined();
  });
});
