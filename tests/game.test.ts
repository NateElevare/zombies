import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as game from '../src/sim/game';
import * as saves from '../src/sim/save';
import * as player from '../src/sim/player';
import * as inv from '../src/sim/inventory';
import { newState, SIM_DT } from '../src/sim/core';
import type { GameState, InputState, UiName } from '../src/sim/types';

const idle: InputState = { moveX: 0, moveY: 0, aimX: 8100, aimY: 8000, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set() };
function fixture() { const s = newState(17); s.player = player.create(8000, 8000); return s; }
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('game', () => {
  it('creates a seeded game with the exact starter kit', () => {
    const s = game.newGame(12345), p = s.player;
    expect(s.seed).toBe(12345); expect(p.x).toBe(s.spawnPoint.x); expect(p.prevX).toBe(p.x);
    expect(p.inv.equip.secondary).toEqual({ id: 'pistol', qty: 1, mag: 12 });
    expect(p.inv.equip.melee).toEqual({ id: 'knife', qty: 1 });
    expect(inv.count(p.inv, 'ammo_9mm')).toBe(96); expect(inv.count(p.inv, 'bandage')).toBe(2);
    expect(inv.count(p.inv, 'water_bottle')).toBe(1); expect(inv.count(p.inv, 'canned_food')).toBe(1);
    expect(s.events.some(e => e.t === 'toast' && e.msg.includes('ruined city'))).toBe(true);
    expect(saves.has()).toBe(true);
  });
  it('does not tick, snapshot, or advance timers when paused or in an overlay', () => {
    for (const ui of ['inventory', 'loot', 'map', 'pause', 'dead'] as UiName[]) {
      const s = fixture(); s.ui = ui; s.player.prevX = 5; s.shake = 10;
      game.step(s, idle, SIM_DT);
      expect(s.tick).toBe(0); expect(s.time).toBe(0); expect(s.clock.t).toBe(60);
      expect(s.player.prevX).toBe(5); expect(s.shake).toBe(10);
    }
    const s = fixture(); s.paused = true; game.step(s, idle, SIM_DT); expect(s.tick).toBe(0);
    s.paused = false; s.screen = 'dead'; game.step(s, idle, SIM_DT); expect(s.tick).toBe(0);
  });
  it('snapshots before movement and advances while building', () => {
    const s = fixture(); game.step(s, { ...idle, moveX: 1 }, SIM_DT);
    expect(s.player.prevX).toBe(8000); expect(s.player.x).toBeCloseTo(8000 + 190 * SIM_DT);
    expect(s.tick).toBe(1); expect(s.time).toBe(SIM_DT);
    game.setUi(s, 'build'); expect(s.build).not.toBeNull(); game.step(s, idle, SIM_DT); expect(s.tick).toBe(2);
    game.setUi(s, 'inventory'); expect(s.build).toBeNull(); expect(s.ui).toBe('inventory');
  });
  it('emits night and morning transitions and uses the new lighting curve', () => {
    const s = fixture(); s.clock.t = 420 - SIM_DT / 2;
    game.step(s, idle, SIM_DT); expect(s.events.filter(e => e.t === 'night')).toHaveLength(1);
    game.step(s, idle, SIM_DT); expect(s.events.filter(e => e.t === 'night')).toHaveLength(1);
    s.clock.t = 600 - SIM_DT / 2; game.step(s, idle, SIM_DT);
    expect(s.clock.day).toBe(2); expect(s.stats.daysSurvived).toBe(1);
    expect(s.events).toContainEqual({ t: 'day', day: 2 });
    for (const [t, expected] of [[100, 0.15], [375, 0.56], [480, 0.97], [600, 0.15]]) { s.clock.t = t; expect(game.darkness(s)).toBeCloseTo(expected); }
    s.clock.t = 0; expect(game.timeLabel(s)).toBe('Day 2 — 06:00');
  });
  it('drops carried items once on death and respawns with equipment and progression', () => {
    const s = game.newGame(99); s.player.level = 4;
    const equip = structuredClone(s.player.inv.equip);
    player.damage(s, 9999, 0); game.step(s, idle, SIM_DT); game.step(s, idle, SIM_DT);
    expect(s.screen).toBe('dead'); expect(s.ui).toBe('dead'); expect(s.stats.deaths).toBe(1);
    const bag = s.drops.find(d => d.kind === 'deathbag'); expect(bag?.life).toBe(Infinity);
    expect(inv.count(bag!.inv, 'ammo_9mm')).toBe(96); expect(s.player.inv.slots.every(x => x === null)).toBe(true);
    expect(game.save(s)).toBe(false); game.respawn(s);
    expect(s.screen).toBe('playing'); expect(s.player.hp).toBe(60); expect(s.player.level).toBe(4);
    expect(s.player.food).toBe(60); expect(s.player.inv.equip).toEqual(equip); expect(s.player.prevX).toBe(s.player.x);
  });
  it('expires empty and timed drops, autosaves per state, and reports unavailable storage', () => {
    const a = fixture(), b = fixture();
    a.drops.push({ id: 'drop', x: 8000, y: 8000, r: 12, inv: { size: 1, slots: [{ id: 'wood', qty: 1 }] }, life: 0.001, kind: 'loot' });
    a._saveTimer = 60 - SIM_DT / 2;
    const write = vi.spyOn(saves, 'write');
    game.step(b, idle, SIM_DT); expect(write).not.toHaveBeenCalled();
    game.step(a, idle, SIM_DT); expect(write).toHaveBeenCalledTimes(1); expect(a.drops).toHaveLength(0);
    vi.stubGlobal('localStorage', { setItem() { throw new Error('disabled'); } });
    expect(game.save(a)).toBe(false); expect(a.events).toContainEqual(expect.objectContaining({ t: 'toast', msg: 'Save failed - storage unavailable' }));
  });
  it('returns null without a valid save and restores a saved game', () => {
    expect(game.continueGame()).toBeNull();
    const s = game.newGame(123); s.clock.day = 5; s.player.level = 3; game.save(s);
    const restored = game.continueGame() as GameState;
    expect(restored.seed).toBe(123); expect(restored.clock.day).toBe(5); expect(restored.player.level).toBe(3);
    expect(restored.player.lastShotT).toBe(-99); expect(restored.player.prevX).toBe(restored.player.x);
  });
});

describe('testing toggles (state.dev)', () => {
  it('scales and freezes the clock, and devSetTime crosses into night cleanly', () => {
    const s = fixture(); s.clock.t = 100;
    s.dev = { timeScale: 20, freeze: false, god: false };
    game.step(s, idle, SIM_DT);
    expect(s.clock.t).toBeCloseTo(100 + 20 * SIM_DT, 5);
    s.dev.freeze = true; game.step(s, idle, SIM_DT);
    expect(s.clock.t).toBeCloseTo(100 + 20 * SIM_DT, 5);
    s.dev = undefined;
    game.devSetTime(s, 450); game.step(s, idle, SIM_DT);
    expect(game.isNight(s)).toBe(true);
    expect(s.events.some(e => e.t === 'night')).toBe(true);
    game.devSetTime(s, 100);
    expect(s._night).toBe(false);
  });
  it('god mode blocks damage and keeps needs full', () => {
    const s = fixture(); s.dev = { timeScale: 1, freeze: false, god: true };
    player.damage(s, 50, 0);
    expect(s.player.hp).toBe(s.player.maxHp);
    s.player.food = 3; s.player.hp = 10; game.step(s, idle, SIM_DT);
    expect(s.player.food).toBe(100); expect(s.player.hp).toBe(s.player.maxHp);
  });
  it('is never written into saves', () => {
    const s = fixture(); s.dev = { timeScale: 60, freeze: true, god: true };
    expect(saves.serialize(s)).not.toContain('timeScale');
  });
});
