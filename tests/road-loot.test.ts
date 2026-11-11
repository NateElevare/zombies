import { beforeEach, describe, expect, it } from 'vitest';
import * as core from '../src/sim/core';
import * as road from '../src/sim/road';
import * as inv from '../src/sim/inventory';
import * as zombies from '../src/sim/zombies';
import { ITEMS } from '../src/sim/items';
import { NEUTRAL_INPUT } from '../src/input';
import type { GameState } from '../src/sim/types';

beforeEach(() => {
  const store = new Map<string, string>();
  Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
});
const tick = (s: GameState) => road.stepRoad(s, NEUTRAL_INPUT(s.player.x + 100, s.player.y), core.SIM_DT);

describe.each(['long-road', 'group-in-need'] as const)('%s material exclusion', story => {
  function start() {
    road.devUnlockGroupInNeed();
    const s = story === 'long-road' ? road.newRoad() : road.newGroupInNeed()!;
    road.begin(s); s.ui = null;
    s.zombies = []; s.drops = [];
    s.dev = { god: true, freeze: false, timeScale: 1 };
    return s;
  }

  it('cleans old checkpoint materials on Continue and retry, keeping gear and skills', () => {
    start();
    const data = road.readSave(story)!;
    data.snapshot.slots[1] = { id: 'scrap', qty: 15 };
    data.snapshot.slots[2] = { id: 'nails', qty: 7 };
    data.snapshot.slots[3] = { id: 'shotgun', qty: 1, mag: 4, lvl: 2 };
    data.snapshot.tech = { handgun_damage1: true };
    data.snapshot.level = 8; data.snapshot.sp = 3;
    const key = story === 'long-road' ? road.ROAD_SAVE_KEY : road.NEED_SAVE_KEY;
    localStorage.setItem(key, JSON.stringify(data));
    const s = road.continueRoad(story)!;
    const verify = () => {
      expect(inv.count(s.player.inv, 'scrap')).toBe(0);
      expect(inv.count(s.player.inv, 'nails')).toBe(0);
      expect(s.player.inv.slots[3]).toEqual(data.snapshot.slots[3]);
      expect(s.player.tech).toEqual(data.snapshot.tech);
      expect(s.player.sp).toBe(3); expect(s.player.level).toBe(8);
      expect(s.road!.mission).toBe(data.mission);
    };
    verify(); road.restart(s); verify();
    road.save(s);
    expect(road.readSave(story)!.snapshot.slots.some(st => st && ITEMS[st.id]?.type === 'material')).toBe(false);
  });

  it('discards materials in an existing mixed bag and picks up the usable contents', () => {
    const s = start();
    const d = road.dropAt(s, s.player, { id: 'scrap', qty: 10 });
    d.inv = { size: 3, slots: [{ id: 'scrap', qty: 10 }, { id: 'nails', qty: 4 }, { id: 'bandage', qty: 2 }] };
    s.events = [];
    tick(s);
    expect(inv.count(s.player.inv, 'scrap')).toBe(0);
    expect(inv.count(s.player.inv, 'nails')).toBe(0);
    expect(inv.count(s.player.inv, 'bandage')).toBe(2);
    expect(s.drops).not.toContain(d);
    expect(s.events.some(e => e.t === 'itemAdded' && ['scrap', 'nails'].includes(e.id))).toBe(false);
  });

  it('never awards materials through the real zombie death and road reward loop', () => {
    const s = start();
    const seen = new Set<string>();
    for (let batch = 0; batch < 20; batch++) {
      for (let i = 0; i < 30; i++) {
        const z = zombies.spawn(s, i % 2 ? 'walker' : 'brute', s.player.x + 500, s.player.y);
        zombies.damage(s, z, 1e6, 0);
      }
      tick(s);
      for (const d of s.drops) for (const st of d.inv.slots) if (st) {
        expect(ITEMS[st.id]?.type).not.toBe('material'); seen.add(st.id);
      }
    }
    expect(seen.has('bandage')).toBe(true);
    expect([...seen].filter(id => ITEMS[id].type === 'ammo').length).toBeGreaterThan(1);
    expect(s.road!.totals.kills).toBeGreaterThanOrEqual(600);
  });
});

it('does not carry obsolete materials from an old Long Road save into the sequel', () => {
  road.newRoad();
  const data = road.readSave()!;
  data.done = true; data.mission = 9;
  data.snapshot.slots[1] = { id: 'scrap', qty: 22 };
  data.snapshot.slots[2] = { id: 'nails', qty: 9 };
  data.snapshot.slots[3] = { id: 'ammo_12g', qty: 30 };
  localStorage.setItem(road.ROAD_SAVE_KEY, JSON.stringify(data));
  const s = road.newGroupInNeed()!;
  expect(inv.count(s.player.inv, 'scrap')).toBe(0);
  expect(inv.count(s.player.inv, 'nails')).toBe(0);
  expect(inv.count(s.player.inv, 'ammo_12g')).toBe(30);
  expect(s.player.inv.equip).toEqual(data.snapshot.equip);
});
