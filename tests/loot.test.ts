import { describe, it, expect, vi, afterEach } from 'vitest';
import { newState, phys, rand } from '../src/sim/core';
import type { GameState, Player, Zombie, InputState, Container, Bullet, Structure } from '../src/sim/types';
import * as inv from '../src/sim/inventory';
vi.mock('../src/sim/zombies', () => ({
  noise: vi.fn(),
  damage: vi.fn((_s: GameState, z: Zombie, n: number) => { z.hp -= n; if (z.hp <= 0) z.dead = true; }),
}));
vi.mock('../src/sim/game', () => ({ isNight: (s: GameState) => s.clock.t >= 420, skipToMorning: vi.fn(), save: vi.fn(() => true) }));
vi.mock('../src/sim/player', () => ({ damage: vi.fn() }));
vi.mock('../src/sim/world', () => ({ buildingAt: vi.fn(() => null) }));
function state(seed = 1) {
  const s = newState(seed);
  s.player = { x: 128, y: 128, prevX: 128, prevY: 128, prevAngle: 0, vx: 0, vy: 0, r: 14, angle: 0, speed: 190,
    hp: 100, maxHp: 100, stamina: 100, maxStamina: 100, food: 100, water: 100, invuln: 0, dead: false,
    inv: inv.createPlayer(s), active: 'secondary', fireCooldown: 0, reloadTimer: 0, reloadTotal: 0, swingTimer: 0, swingTotal: 0,
    lastShotT: -99, xp: 0, level: 1, sp: 0, tech: {}, spawn: { x: 128, y: 128 }, sprinting: false, flashlight: true, bleeding: 0 };
  return s;
}
function input(extra: Partial<InputState> = {}): InputState { return { moveX: 0, moveY: 0, aimX: 512, aimY: 128, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set(), ...extra }; }
function zombie(id: string, x: number, y = 128): Zombie { return { id, x, y, r: 12, hp: 1000, maxHp: 1000, dead: false, burn: 0, type: 'walker' } as Zombie; }
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
import * as loot from '../src/sim/loot';
import { ITEMS } from '../src/sim/items';
import { WEAPONS } from '../src/sim/combat';
function container(id: string, tier = 0, kind = 'weapon_case'): Container { return { id, tier, kind, name: kind, x: 0, y: 0, w: 32, h: 32, buildingId: null, searched: false, inv: null }; }
describe('loot', () => {
  it.each(['road', 'arcade'] as const)('never uses survival zombie loot in %s', mode => {
    const s = state(); s.mode = mode;
    const before = s.rngState;
    for (let i = 0; i < 100; i++) expect(loot.zombieDrop(s, zombie('z', 200))).toBeNull();
    expect(s.drops).toHaveLength(0); expect(s.rngState).toBe(before);
  });

  it('excludes all building materials from regular road drops while retaining supplies', () => {
    const s = state(); s.mode = 'road';
    const materials = Object.values(ITEMS).filter(it => it.type === 'material').map(it => ({ id: it.id, qty: 2 }));
    expect(loot.makeDrop(s, 100, 100, materials)).toBeNull();
    const d = loot.makeDrop(s, 100, 100, [...materials, { id: 'ammo_556', qty: 30 }, { id: 'medkit', qty: 1 }])!;
    expect(d.inv.slots.filter(Boolean).map(st => st!.id)).toEqual(['ammo_556', 'medkit']);
  });

  it('filters cached container contents and death bags in road mode', () => {
    const s = state(); s.mode = 'road';
    const c = container('old-container'); c.inv = inv.create(3);
    inv.add(c.inv, 'scrap', 10); inv.add(c.inv, 'nails', 4); inv.add(c.inv, 'medkit', 1);
    expect(loot.fill(s, c)!.slots.filter(Boolean)).toEqual([{ id: 'medkit', qty: 1 }]);
    const d = loot.makeDrop(s, 100, 100, [{ id: 'scrap', qty: 5 }, { id: 'bandage', qty: 1 }], 'deathbag')!;
    expect(d.inv.slots).toEqual([{ id: 'bandage', qty: 1 }]);
  });

  it('is deterministic per container and fills only once', () => {
    const a = state(42), b = state(42), c = container('case');
    const result = loot.fill(a, c);
    expect(result).toEqual(loot.fill(b, container('case')));
    expect(loot.fill(a, c)).toBe(result); expect(result?.size).toBe(8);
    expect(result?.slots.filter(Boolean).length).toBeGreaterThan(0);
  });
  it('higher tiers shift weapon cases toward rare equipment', () => {
    const s = state(123), rank = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
    const average = (tier: number) => {
      let sum = 0, count = 0;
      for (let i = 0; i < 500; i++) for (const st of loot.fill(s, container('case'+i, tier))!.slots) if (st) { sum += rank[ITEMS[st.id].rarity]; count++; }
      return sum / count;
    };
    expect(average(3)).toBeGreaterThan(average(0) + 0.5);
  });
  it('preserves dedicated medical tables and generates partly loaded weapons', () => {
    const s = state(); let guns = 0;
    for (let i = 0; i < 100; i++) {
      const c = container('med'+i, 3, 'medical_cabinet');
      for (const st of loot.fill(s, c)!.slots) if (st) expect(loot.TABLES.medical_cabinet.some(e => e.id === st.id)).toBe(true);
      for (const st of loot.fill(s, container('gun'+i, 3))!.slots) if (st && ITEMS[st.id].type === 'weapon' && WEAPONS[st.id].ammo) {
        guns++; expect(st.mag).toBeGreaterThan(0); expect(st.mag).toBeLessThan(WEAPONS[st.id].magSize);
      }
    }
    expect(guns).toBeGreaterThan(20);
  });
  it('splits drops, preserves loaded ammo and gives death bags infinite lifetime', () => {
    const s = state(), drop = loot.makeDrop(s, 100, 200, [{ id: 'scrap', qty: 220 }, { id: 'pistol', qty: 1, mag: 8 }], 'deathbag')!;
    expect(drop.life).toBe(Infinity); expect(drop.inv.size).toBe(4);
    expect(drop.inv.slots.map(s => s?.qty)).toEqual([100, 100, 20, 1]);
    expect(drop.inv.slots[3]?.mag).toBe(8);
    expect(loot.makeDrop(s, 0, 0, [{ id: 'invalid', qty: 5 }])).toBeNull();
  });
  it('zombie drops advance the state RNG reproducibly', () => {
    const a = state(81), b = state(81), z = zombie('z', 200);
    const rolls = (s: GameState) => Array.from({ length: 100 }, () => loot.zombieDrop(s, z)?.inv || null);
    expect(rolls(a)).toEqual(rolls(b)); expect(a.rngState).toBe(b.rngState);
    expect(a.drops.length).toBeGreaterThan(0);
  });
});
