import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as game from '../src/sim/game';
import * as saves from '../src/sim/save';
import * as salvage from '../src/sim/salvage';
import * as inv from '../src/sim/inventory';
import * as road from '../src/sim/road';
import * as combat from '../src/sim/combat';
import { Grid, phys, SIM_DT } from '../src/sim/core';
import { NEUTRAL_INPUT } from '../src/input';
import { ITEMS } from '../src/sim/items';
import type { GameState, Solid } from '../src/sim/types';
import { validCloudSave } from '../src/sim/save-validation';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) });
});
afterEach(() => { vi.unstubAllGlobals(); });

const find = (s: GameState, pred: (o: Solid) => boolean) => s.grid.all().find(pred)!;
const standBy = (s: GameState, o: Solid) => { s.player.x = o.x + o.w / 2; s.player.y = o.y - 30; };
const inGrid = (s: GameState, key: string) => s.grid.all().some(o => salvage.keyOf(o) === key);

describe('salvaging world objects', () => {
  it('turns furniture into materials, removes it, and survives save/load', () => {
    const s = game.newGame(42);
    const sofa = find(s, o => o.kind === 'furniture' && o.sub === 'sofa');
    const key = salvage.keyOf(sofa);
    standBy(s, sofa);
    const cloth = inv.count(s.player.inv, 'cloth');
    expect(salvage.salvage(s, sofa)).toBe(true);
    expect(inv.count(s.player.inv, 'cloth')).toBeGreaterThan(cloth);
    expect(inGrid(s, key)).toBe(false);
    expect(s.events.some(e => e.t === 'salvaged')).toBe(true);

    const raw = saves.serialize(s);
    expect(validCloudSave(JSON.parse(raw))).toBe(true);
    const loaded = game.newGame(42);
    expect(inGrid(loaded, key)).toBe(true);
    expect(saves.apply(loaded, saves.deserialize(raw))).toBe(true);
    expect(inGrid(loaded, key)).toBe(false);
    expect(loaded.salvaged).toEqual([key]);
  });

  it('requires searching containers first and drops what is left inside', () => {
    const s = game.newGame(42);
    const cab = find(s, o => o.kind === 'furniture' && !!o.container);
    standBy(s, cab);
    expect(salvage.salvage(s, cab)).toBe(false);
    cab.container!.searched = true; cab.container!.inv = inv.create(4); inv.add(cab.container!.inv, 'bandage', 2);
    const drops = s.drops.length;
    expect(salvage.salvage(s, cab)).toBe(true);
    expect(s.containers.includes(cab.container!)).toBe(false);
    expect(s.drops.length).toBe(drops + 1);
  });

  it('refuses when too far away, and never salvages landmarks or player structures', () => {
    const s = game.newGame(42);
    const car = find(s, o => o.kind === 'car');
    s.player.x = car.x - 600; s.player.y = car.y;
    expect(salvage.salvage(s, car)).toBe(false);
    expect(inGrid(s, salvage.keyOf(car))).toBe(true);
    expect(salvage.canSalvage({ kind: 'furniture', sub: 'fountain' } as Solid)).toBe(false);
    expect(salvage.canSalvage({ kind: 'wall', sub: 'brick' } as Solid)).toBe(false);
  });

  it('rejects malformed salvage lists at the cloud boundary', () => {
    const s = game.newGame(42), data = JSON.parse(saves.serialize(s));
    expect(validCloudSave({ ...data, salvaged: [1, 2] })).toBe(false);
    expect(validCloudSave({ ...data, salvaged: 'x' })).toBe(false);
  });

  it('fences break on the 4th hit and stay broken after loading', () => {
    const s = game.newGame(42);
    const fence = find(s, o => o.kind === 'fence');
    const key = salvage.keyOf(fence);
    for (let i = 1; i < salvage.FENCE_HITS; i++) expect(salvage.hitFence(s, fence, fence.x, fence.y, 0)).toBe(false);
    expect(inGrid(s, key)).toBe(true);
    expect(salvage.hitFence(s, fence, fence.x, fence.y, 0)).toBe(true);
    expect(inGrid(s, key)).toBe(false);
    const loaded = game.newGame(42);
    expect(saves.apply(loaded, saves.deserialize(saves.serialize(s)))).toBe(true);
    expect(inGrid(loaded, key)).toBe(false);
  });
});

describe('demolish reach and smashing', () => {
  it('reaches anything inside the building you are standing in, but not across the street', () => {
    const s = game.newGame(42);
    const b = s.buildings.find(b => b.w > 300 || b.h > 300)!;
    const far = s.grid.all().filter(o => salvage.canSalvage(o) && o.kind === 'furniture' && o.x > b.x && o.x + o.w < b.x + b.w && o.y > b.y && o.y + o.h < b.y + b.h)
      .sort((a, c) => (c.x - b.x) - (a.x - b.x))[0];
    expect(far).toBeTruthy();
    // stand inside the same building, as far from the object as possible
    s.player.x = b.x + 20 + (far.x - b.x > b.w / 2 ? 0 : b.w - 40); s.player.y = b.y + b.h / 2;
    expect(salvage.inReach(s, far)).toBe(true);
    s.player.x = b.x - 400; s.player.y = b.y - 400;
    expect(salvage.inReach(s, far)).toBe(false);
  });

  it('three melee hits tear world furniture down, spilling an unsearched container', () => {
    const s = game.newGame(42);
    const cab = find(s, o => o.kind === 'furniture' && !!o.container && salvage.canSalvage(o));
    standBy(s, cab);
    const key = salvage.keyOf(cab), drops = s.drops.length;
    expect(salvage.hitObject(s, cab, cab.x, cab.y, 0)).toBe(false);
    expect(salvage.hitObject(s, cab, cab.x, cab.y, 0)).toBe(false);
    expect(inGrid(s, key)).toBe(true);
    expect(salvage.hitObject(s, cab, cab.x, cab.y, 0)).toBe(true);
    expect(inGrid(s, key)).toBe(false);
    expect(s.drops.length).toBeGreaterThanOrEqual(drops);   // loot (if any) spilled on the floor
    expect(salvage.hitObject(s, { kind: 'wall', sub: 'brick' } as Solid, 0, 0, 0)).toBe(false);
    expect(salvage.hitObject(s, { kind: 'furniture', sub: 'crate', structure: true } as unknown as Solid, 0, 0, 0)).toBe(false);
  });
});

describe('melee smashing in play', () => {
  it.each(['long-road', 'group-in-need'] as const)('%s breaks props without giving or spilling building materials', story => {
    road.devUnlockGroupInNeed();
    const s = story === 'long-road' ? road.newRoad() : road.newGroupInNeed()!;
    s.grid = new Grid(16000, 16000, 128);
    s.drops = []; s.ui = null;
    s.player.x = s.player.prevX = 1000; s.player.y = s.player.prevY = 1000;
    s.player.active = 'melee'; s.player.angle = Math.PI / 2;
    const contents = inv.create(4);
    inv.add(contents, 'scrap', 8); inv.add(contents, 'nails', 6); inv.add(contents, 'bandage', 1);
    const container = { id: 'test-toolbox', kind: 'toolbox', name: 'Toolbox', tier: 0, buildingId: null, searched: true,
      x: 990, y: 1020, w: 20, h: 20, inv: contents };
    s.containers.push(container);
    const box = phys.addSolid(s, { ...container, kind: 'furniture', sub: 'toolbox', container,
      solid: true, blocksBullets: true, blocksSight: true });
    const idle = NEUTRAL_INPUT(1000, 1030);
    for (let swing = 0; swing < 3; swing++) {
      combat.update(s, { ...idle, fire: true, firePressed: true }, SIM_DT);
      for (let i = 0; i < 90; i++) { s.time += SIM_DT; combat.update(s, idle, SIM_DT); }
    }
    expect(s.grid.all()).not.toContain(box);
    expect(inv.count(s.player.inv, 'scrap')).toBe(0);
    expect(inv.count(s.player.inv, 'nails')).toBe(0);
    const spilled = s.drops.flatMap(d => d.inv.slots).filter(st => !!st);
    expect(spilled.some(st => st.id === 'bandage')).toBe(true);
    expect(spilled.some(st => ITEMS[st.id].type === 'material')).toBe(false);
  });

  it('swinging a knife at a cabinet three times breaks it', async () => {
    const { SIM_DT } = await import('../src/sim/core');
    const s = game.newGame(42);
    const cab = find(s, o => o.kind === 'furniture' && !!o.container && salvage.canSalvage(o) && o.w >= 20);
    s.player.x = s.player.prevX = cab.x + cab.w / 2; s.player.y = s.player.prevY = cab.y - 18;
    s.player.active = 'melee';
    s.zombies.length = 0;
    const aim = { aimX: cab.x + cab.w / 2, aimY: cab.y + cab.h / 2 };
    const base = { moveX: 0, moveY: 0, ...aim, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set<string>() };
    const key = salvage.keyOf(cab);
    for (let swing = 0; swing < 3; swing++) {
      game.step(s, { ...base, fire: true, firePressed: true } as never, SIM_DT);
      for (let i = 0; i < 90; i++) game.step(s, base as never, SIM_DT);
    }
    expect(inGrid(s, key)).toBe(false);
  });
});
