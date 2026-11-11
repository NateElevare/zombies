import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newArcade, stepArcade, waveHp, waveSpeed } from '../src/sim/arcade';
// waveHp(10) ~ 2.8x, waveSpeed caps at +55%
import * as arcade from '../src/sim/arcade';
import { SIM_DT, phys } from '../src/sim/core';
import { WEAPONS } from '../src/sim/combat';
import * as zombies from '../src/sim/zombies';
import * as player from '../src/sim/player';
import * as inv from '../src/sim/inventory';
import { respawn } from '../src/sim/game';
import * as upgrades from '../src/sim/upgrades';
import type { GameState, InputState, Stack, UiName, ZombieType } from '../src/sim/types';

const idle: InputState = { moveX: 0, moveY: 0, aimX: 8200, aimY: 8000, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set() };
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
// Arcade level-ups pause the sim on a card picker; scripted runs take the first card.
function step(state: GameState, input: InputState) {
  if (state.ui === 'levelup') upgrades.choose(state, 0);
  stepArcade(state, input, SIM_DT);
}
function ticks(state: GameState, count: number, input = idle) {
  for (let i = 0; i < count; i++) step(state, input);
}
function drop(state: GameState, stack: Stack, x = state.player.x, y = state.player.y, life = 20) {
  state.drops.push({ id: `test-${state.drops.length}`, x, y, r: 12, life, kind: 'loot', inv: { size: 1, slots: [stack] } });
}
function bot(state: GameState): InputState {
  const p = state.player;
  const target = state.zombies.filter(z => !z.dead && phys.lineOfSight(state, p.x, p.y, z.x, z.y))
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  if (!target) return idle;
  const distance = Math.hypot(target.x - p.x, target.y - p.y);
  const retreat = distance < 180;
  return { ...idle, aimX: target.x, aimY: target.y, fire: distance < 650,
    moveX: retreat ? p.x - target.x : 0, moveY: retreat ? p.y - target.y : 0 };
}
function simulationSnapshot(s: GameState) {
  return { seed: s.seed, rng: s.rngState, tick: s.tick, time: s.time, player: s.player,
    arcade: s.arcade, zombies: s.zombies, bullets: s.bullets, drops: s.drops, stats: s.stats, decor: s.decor, events: s.events,
    solids: s.grid.all().map(({ _q, ...solid }) => solid) };
}

describe('arcade', () => {
  it('generates deterministic arena geometry and gameplay, with no Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Unseeded randomness'); });
    const a = newArcade(12345), b = newArcade(12345), other = newArcade(12346);
    expect(simulationSnapshot(a)).toEqual(simulationSnapshot(b));
    expect(a.decor).not.toEqual(other.decor);
    for (let i = 0; i < 1800; i++) {
      stepArcade(a, bot(a), SIM_DT); stepArcade(b, bot(b), SIM_DT);
      // The rendering shell is free to consume all feedback every frame.
      a.events.length = b.events.length = 0;
    }
    expect(a.stats.kills).toBeGreaterThan(0);
    expect(simulationSnapshot(a)).toEqual(simulationSnapshot(b));
  });

  it('uses renderer props, a free center, a solid perimeter, and the shared starter kit', () => {
    const s = newArcade(7), p = s.player, solids = s.grid.all();
    expect(s.mode).toBe('arcade'); expect(s.roads).toEqual([]); expect(s.buildings).toEqual([]);
    expect(s.containers).toEqual([]); expect({ x: p.x, y: p.y }).toEqual({ x: 8000, y: 8000 });
    expect(phys.isFree(s, p.x, p.y, 250)).toBe(true);
    expect(solids.some(o => o.kind === 'tree')).toBe(false);   // no trees in the arena
    for (const sub of ['sedan', 'van', 'pickup', 'police', 'crate', 'barrel', 'mcrate']) {
      expect(solids.some(o => o.sub === sub && Number.isFinite(o.vseed))).toBe(true);
    }
    for (const [x, y] of [[6800, 8000], [9200, 8000], [8000, 7200], [8000, 8800]]) {
      expect(phys.raycast(s, p.x, p.y, x, y)?.rect).toBeDefined();
    }
    p.x = 6856; p.y = 8000;
    ticks(s, 60, { ...idle, moveX: -1 });
    expect(p.x).toBeGreaterThanOrEqual(6840 + p.r);
    expect(p.inv.equip.secondary).toEqual({ id: 'pistol', qty: 1, mag: WEAPONS.pistol.magSize });
    expect(p.inv.equip.melee?.id).toBe('knife'); expect(inv.count(p.inv, 'ammo_9mm')).toBe(120);
    expect(s.decor.map(d => d.kind)).toEqual(expect.arrayContaining(['lot', 'blood', 'debris']));
  });

  it('ramps wave counts, pacing, health and speed with five-second intermissions', () => {
    const s = newArcade(10), a = s.arcade!;
    let previousInterval = Infinity;
    for (let wave = 1; wave <= 9; wave++) {
      expect(a.wave).toBe(wave); expect(a.toSpawn).toBe(6 + (wave - 1) * 4);
      expect(s.events).toContainEqual(expect.objectContaining({ t: 'toast', msg: `WAVE ${wave}` }));
      stepArcade(s, idle, SIM_DT);
      expect(a.spawnTimer).toBeLessThan(previousInterval); previousInterval = a.spawnTimer;
      const first = s.zombies[0];
      expect(first.maxHp).toBe(Math.round(zombies.TYPES[first.type].hp * waveHp(wave)));
      expect(first.speed).toBeCloseTo(zombies.TYPES[first.type].speed * waveSpeed(wave));
      let spawned = 0;
      for (let frame = 0; frame < 2400 && a.intermission === 0; frame++) {
        for (const z of s.zombies) if (!z.dead) { spawned++; zombies.damage(s, z, 9999, 0); }
        step(s, idle);
      }
      expect(spawned).toBe(6 + (wave - 1) * 4); expect(a.intermission).toBe(5);
      ticks(s, 299); expect(a.wave).toBe(wave);
      ticks(s, 1); expect(a.wave).toBe(wave + 1);
    }
    expect(s.events.filter(e => e.t === 'sound' && e.name === 'waveStart')).toHaveLength(10);
  });

  it('gives zombies knockback resistance after wave 40 so late runs cannot stun-lock the arena', () => {
    expect(arcade.waveKnockRes(1)).toBe(0); expect(arcade.waveKnockRes(40)).toBe(0);
    expect(arcade.waveKnockRes(50)).toBeCloseTo(0.2); expect(arcade.waveKnockRes(80)).toBeCloseTo(0.8);
    expect(arcade.waveKnockRes(200)).toBe(0.9);
    // early zombies have no resistance; a wave-60 spawn resists 40%
    const early = newArcade(10); stepArcade(early, idle, SIM_DT);
    expect(early.zombies[0].knockRes).toBeUndefined();
    const late = newArcade(10); late.arcade!.wave = 60; stepArcade(late, idle, SIM_DT);
    const z = late.zombies[0];
    expect(z.knockRes).toBeCloseTo(0.4);
    expect(zombies.knockMul(z)).toBeCloseTo(0.6);
    // a hit from the left pushes a resistant zombie less than a fresh one
    const push = (res: number | undefined) => {
      const s = newArcade(10); stepArcade(s, idle, SIM_DT);
      const t = s.zombies[0]; t.knockRes = res; t.x = 8000; t.y = 8000;
      zombies.damage(s, t, 1, 0);
      return t.x - 8000;
    };
    const full = push(undefined), resisted = push(0.4);
    expect(full).toBeGreaterThan(0); expect(resisted).toBeCloseTo(full * 0.6);
    expect(push(1)).toBe(0);
  });

  it('unlocks special types at their wave thresholds and spawns offscreen at free edge gates', () => {
    const seen = new Set<ZombieType>();
    for (const wave of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const s = newArcade(wave);
      s.arcade!.wave = wave;
      for (let i = 0; i < 100; i++) {
        s.zombies.length = 0; s.arcade!.toSpawn = 1; s.arcade!.spawnTimer = 0;
        stepArcade(s, idle, SIM_DT);
        const z = s.zombies[0]; seen.add(z.type);
        expect(Math.hypot(z.x - s.player.x, z.y - s.player.y)).toBeGreaterThan(700 + z.r);
        expect(phys.isFree(s, z.x, z.y, z.r)).toBe(true);
        expect(z.x === 6880 || z.x === 9120 || z.y === 7280 || z.y === 8720).toBe(true);
        if (wave < 3) expect(z.type).toBe('walker');
        if (wave < 5) expect(z.type).not.toBe('brute');
        if (wave < 7) expect(z.type).not.toBe('crawler');
        if (wave < 9) expect(z.type).not.toBe('bloater');
      }
    }
    expect([...seen].sort()).toEqual(['bloater', 'brute', 'crawler', 'runner', 'walker']);
  });

  it('keeps zombies chasing without sight and never adds survival population or relocates outside', () => {
    const s = newArcade(3);
    s.arcade!.toSpawn = 0;
    const z = zombies.spawn(s, 'walker', 6880, 7280);
    z.stuckTime = 7; z.progressTimer = 0.6; z.speed = 0;
    s.clock = { t: 450, day: 3 };
    ticks(s, 120);
    expect(s.zombies).toHaveLength(1); expect(z.state).toBe('chase');
    expect(z.target).toEqual({ x: s.player.x, y: s.player.y }); expect(z.memory).toBeGreaterThan(7);
    expect({ x: z.x, y: z.y }).toEqual({ x: 6880, y: 7280 });
    expect(s.events.some(e => e.t === 'horde')).toBe(false);
  });

  it('auto-collects health, ammo and weapons, cancels reloads, and expires old drops', () => {
    const s = newArcade(4), p = s.player;
    p.hp = 50;
    drop(s, { id: 'bandage', qty: 2 }); drop(s, { id: 'ammo_9mm', qty: 18 });
    drop(s, { id: 'shotgun', qty: 1 });
    ticks(s, 1);
    expect(p.hp).toBe(80); expect(inv.count(p.inv, 'ammo_9mm')).toBe(138);
    // an empty slot gets filled, but the gun in your hands never changes
    expect(p.active).toBe('secondary'); expect(p.inv.equip.primary?.id).toBe('shotgun');
    expect(inv.count(p.inv, 'ammo_12g')).toBe(WEAPONS.shotgun.magSize * 2);
    p.reloadTimer = 1; p.reloadTotal = 2; p.burstQueue = 2;
    drop(s, { id: 'smg', qty: 1 }); ticks(s, 1);
    expect(p.inv.equip.primary?.id).toBe('shotgun'); expect(s.arcade!.armory!.map(x => x.id)).toEqual(['smg']);
    expect(s.drops).toHaveLength(0);
    expect(s.events.filter(e => e.t === 'sound' && e.name === 'pickup')).toHaveLength(4);
    // a copy of an owned weapon levels it up
    drop(s, { id: 'shotgun', qty: 1 }); ticks(s, 1);
    expect(p.inv.equip.primary?.lvl).toBe(2); expect(s.arcade!.armory).toHaveLength(1);
    // the armory swaps a stored weapon into its slot and keeps the old one
    expect(arcade.armoryEquip(s, 0)).toBe(true);
    expect(p.inv.equip.primary?.id).toBe('smg'); expect(s.arcade!.armory!.map(x => [x.id, x.lvl])).toEqual([['shotgun', 2]]);
    drop(s, { id: 'bandage', qty: 2 }, p.x, p.y, SIM_DT / 2);
    drop(s, { id: 'ammo_9mm', qty: 18 }, p.x + 200, p.y);
    ticks(s, 1); expect(p.hp).toBe(80); expect(s.drops).toHaveLength(1);
    // Isolate expiry from wave attacks, while still running the full orchestrator.
    s.arcade!.toSpawn = 0; s.arcade!.intermission = 100; s.zombies.length = 0;
    ticks(s, 1200); expect(s.drops).toHaveLength(0);
  });

  it('scores each type once, persists best, and drops only arcade single-stack loot', () => {
    const s = newArcade(19); s.arcade!.wave = 5;
    const types: ZombieType[] = ['walker', 'runner', 'brute', 'crawler', 'bloater'];
    for (const type of types) zombies.damage(s, zombies.spawn(s, type, 8000, 8400), 9999, 0);
    s.events.length = 0;
    ticks(s, 1);
    expect(s.stats.kills).toBe(5); expect(s.arcade!.score).toBe((10 + 15 + 30 + 12 + 25) * 5);
    expect(s.arcade!.best).toBe(s.arcade!.score);
    expect(storage.get('deadzone_arcade_best')).toBe(String(s.arcade!.score));
    ticks(s, 1); expect(s.arcade!.score).toBe(460);
    expect(newArcade(20).arcade!.best).toBe(460); expect(s.player.xp).toBe(0);
    for (let i = 0; i < 250; i++) zombies.damage(s, zombies.spawn(s, 'walker', 8000, 8400), 9999, 0);
    ticks(s, 1);
    expect(s.drops.length).toBeGreaterThan(15);
    for (const d of s.drops) {
      expect(d.kind).toBe('loot'); expect(d.inv.size).toBe(1); expect(d.inv.slots).toHaveLength(1);
      expect(['bandage', 'ammo_9mm', 'ammo_357', 'ammo_12g', 'ammo_556', 'ammo_308', 'shotgun', 'smg', 'revolver', 'bat', 'machete', 'cola_mints', 'assault_rifle', 'hunting_rifle']).toContain(d.inv.slots[0]!.id);
      expect(d.life).toBeGreaterThan(19); expect(d.life).toBeLessThanOrEqual(20);
    }
    expect(new Set(s.drops.map(d => d.inv.slots[0]!.id).filter(id => id.startsWith('ammo_'))).size).toBeGreaterThan(1);
  });

  it('freezes paused and overlay ticks, snapshots active movement, and ignores survival actions', () => {
    for (const ui of ['inventory', 'loot', 'tech', 'build', 'dead', 'armory'] as UiName[]) {
      const s = newArcade(1); s.ui = ui; s.player.prevX = 5;
      ticks(s, 10); expect(s.tick).toBe(0); expect(s.time).toBe(0); expect(s.player.prevX).toBe(5);
    }
    const s = newArcade(1); s.paused = true; ticks(s, 1); expect(s.tick).toBe(0);
    s.paused = false;
    for (const dt of [0, -1, NaN, Infinity]) stepArcade(s, idle, dt);
    expect(s.tick).toBe(0);
    s.player.food = s.player.water = s.player.stamina = 0;
    stepArcade(s, { ...idle, moveX: 1, sprint: true, interactHeld: true, pressed: new Set(['interact', 'build', 'heal', 'demolish']) }, SIM_DT);
    expect(s.player.prevX).toBe(8000); expect(s.player.x).toBeGreaterThan(8000);
    expect(s.player.food).toBe(100); expect(s.player.water).toBe(100); expect(s.player.stamina).toBe(100);
    expect(s.player.sprinting).toBe(true); expect(s.ui).toBeNull(); expect(s.build).toBeNull(); expect(s.interact).toBeNull();
    expect(s.events.some(e => e.t === 'openUi')).toBe(false);
  });

  it('ends death once, saves best, does not respawn or make a death bag, and tolerates unavailable storage', () => {
    const s = newArcade(22); s.arcade!.score = 123;
    player.damage(s, 9999, 0); ticks(s, 2);
    expect(s.screen).toBe('dead'); expect(s.stats.deaths).toBe(1);
    expect(s.events.filter(e => e.t === 'playerDied')).toHaveLength(1);
    expect(s.events).toContainEqual(expect.objectContaining({ t: 'toast', msg: 'GAME OVER - SCORE 123' }));
    expect(storage.get('deadzone_arcade_best')).toBe('123');
    expect(s.drops.some(d => d.kind === 'deathbag')).toBe(false);
    respawn(s); expect(s.screen).toBe('dead'); expect(s.player.hp).toBe(0);
    const tick = s.tick; ticks(s, 1); expect(s.tick).toBe(tick);
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
    const blocked = newArcade(22); blocked.player.hp = 0;
    expect(() => ticks(blocked, 1)).not.toThrow(); expect(blocked.screen).toBe('dead');
    expect(blocked.events.filter(e => e.t === 'playerDied')).toHaveLength(1);
  });

  it('runs a 60-second scripted bot with real combat, kills, reloads and advancing waves', () => {
    const s = newArcade(12345);
    let shots = 0, reloads = 0;
    for (let i = 0; i < 60 * 60; i++) {
      step(s, bot(s));
      shots += s.events.filter(e => e.t === 'shot').length;
      reloads += s.events.filter(e => e.t === 'reloadDone').length;
      s.events.length = 0;
    }
    expect(s.time).toBeCloseTo(60, 6); expect(s.screen).toBe('playing');
    expect(s.stats.kills).toBeGreaterThanOrEqual(6); expect(s.arcade!.wave).toBeGreaterThanOrEqual(2);
    expect(s.arcade!.score).toBeGreaterThan(0); expect(shots).toBeGreaterThan(12); expect(reloads).toBeGreaterThan(0);
    expect(s.player.food).toBe(100); expect(s.player.water).toBe(100); expect(s.player.stamina).toBe(100);
  });
});
