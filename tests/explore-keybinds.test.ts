import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as game from '../src/sim/game';
import * as saves from '../src/sim/save';
import * as explore from '../src/sim/explore';
import { validCloudSave } from '../src/sim/save-validation';
import { SIM_DT } from '../src/sim/core';
import type { InputState } from '../src/sim/types';

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
const idle = (s: { player: { x: number; y: number } }): InputState => ({ moveX: 0, moveY: 0, aimX: s.player.x + 50, aimY: s.player.y, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set() });

describe('fog of war', () => {
  it('starts hidden, reveals around the player, and round-trips through saves', () => {
    const s = game.newGame(9), p = s.player;
    expect(explore.isExplored(s, p.x, p.y)).toBe(false);
    game.step(s, idle(s), SIM_DT);
    expect(explore.isExplored(s, p.x, p.y)).toBe(true);
    expect(explore.isExplored(s, p.x + 400, p.y)).toBe(true);
    expect(explore.isExplored(s, p.x + 3000, p.y)).toBe(false);
    explore.reveal(s, 200, 200, 300);
    const raw = saves.serialize(s), data = JSON.parse(raw);
    expect(validCloudSave(data)).toBe(true);
    expect(data.explored.length).toBeLessThan(3000);
    const t = game.newGame(9);
    expect(saves.apply(t, saves.deserialize(raw))).toBe(true);
    expect(Array.from(explore.grid(t))).toEqual(Array.from(explore.grid(s)));
    expect(validCloudSave({ ...data, explored: '<script>' })).toBe(false);
  });
  it('old saves without fog data load fine (everything unexplored)', () => {
    const s = game.newGame(9); game.step(s, idle(s), SIM_DT);
    const data = JSON.parse(saves.serialize(s)); delete data.explored;
    const t = game.newGame(9);
    expect(saves.apply(t, data)).toBe(true);
    expect(explore.fraction(t)).toBe(0);
  });
});

describe('keybinds', () => {
  it('rebinds, moves a key off its previous action, persists, and resets', async () => {
    const { keybinds } = await import('../src/keybinds');
    expect(keybinds.action('KeyM')).toBe('map');
    expect(keybinds.action('KeyE', 'build')).toBe('cycleNext');
    const stolen = keybinds.set('map', 0, 'KeyI');
    expect(stolen).toBe('Inventory');
    expect(keybinds.action('KeyI')).toBe('map');
    expect(keybinds.keys('inventory')).toEqual([]);
    expect(keybinds.action('KeyE', 'build')).toBe('cycleNext');  // other context untouched
    expect(JSON.parse(store.get('deadzone-keys')!).map).toEqual(['KeyI', 'Tab']);
    vi.resetModules();
    const again = (await import('../src/keybinds')).keybinds;
    expect(again.action('KeyI')).toBe('map');
    again.reset();
    expect(again.action('KeyI')).toBe('inventory');
    expect(store.has('deadzone-keys')).toBe(false);
    expect(again.set('map', 0, 'Escape')).toBe(null);
    expect(again.action('KeyM')).toBe('map');
  });
});
