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
import * as base from '../src/sim/base';
describe('inventory', () => {
  it('rejects road materials from direct grants, take-all, drag transfers and swaps', () => {
    const s = state(); s.mode = 'road';
    const pack = s.player.inv, box = inv.create(2);
    inv.add(box, 'scrap', 10); inv.add(box, 'bandage', 1);
    expect(inv.add(pack, 'nails', 5)).toBe(5);
    expect(inv.moveSlot(box, 0, pack, 0)).toBe(false);
    expect(inv.takeAll(box, pack)).toBe(true);
    expect(inv.count(pack, 'bandage')).toBe(1);
    expect(inv.moveSlot(pack, 0, box, 0)).toBe(false);
    expect(inv.count(pack, 'scrap')).toBe(0);
    expect(inv.count(box, 'scrap')).toBe(10);
  });

  it('does not reintroduce old road materials through mixed backpack overflow', () => {
    const s = state(); s.mode = 'road';
    const pack = s.player.inv;
    pack.equip.back = { id: 'small_backpack', qty: 1 }; inv.recalcSize(s);
    for (let i = 0; i < inv.BASE_SLOTS; i++) pack.slots[i] = { id: 'knife', qty: 1, mag: 0 };
    pack.slots[inv.BASE_SLOTS] = { id: 'scrap', qty: 10 };
    const medicine = pack.slots[inv.BASE_SLOTS + 1] = { id: 'medkit', qty: 1 };
    pack.equip.back = null; inv.recalcSize(s);
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0].inv.slots).toEqual([medicine]);
    expect(s.drops[0].inv.slots[0]).toBe(medicine);
    expect(inv.count(pack, 'scrap')).toBe(0);
  });

  it('stacks to capacity, reports leftovers, and removes atomically', () => {
    const i = inv.create(2);
    expect(inv.add(i, 'ammo_9mm', 500)).toBe(20);
    expect(i.slots.map(s => s?.qty)).toEqual([240, 240]);
    expect(inv.remove(i, 'ammo_9mm', 481)).toBe(false);
    expect(inv.count(i, 'ammo_9mm')).toBe(480);
    expect(inv.remove(i, 'ammo_9mm', 260)).toBe(true);
    expect(i.slots).toEqual([null, { id: 'ammo_9mm', qty: 220 }]);
    expect(inv.add(i, 'scrap', -1)).toBe(-1);
    expect(inv.add(i, 'no_item', 2)).toBe(2);
  });
  it('keeps distinct stack metadata and moves partial quantities', () => {
    const a = inv.create(2), b = inv.create(1);
    inv.add(a, 'ammo_9mm', 20); inv.add(b, 'ammo_9mm', 230);
    expect(inv.moveSlot(a, 0, b)).toBe(true);
    expect(a.slots[0]?.qty).toBe(10); expect(b.slots[0]?.qty).toBe(240);
    expect(inv.moveSlot(a, 0, b)).toBe(false);
    inv.add(a, 'pistol', 1, { mag: 7 });
    expect(inv.moveSlot(a, 1, b, 0)).toBe(true);
    expect(b.slots[0]).toEqual({ id: 'pistol', qty: 1, mag: 7 });
  });
  it('equips by identity, swaps equipment, and returns unequip location', () => {
    const s = state(); inv.add(s.player.inv, 'pistol', 1, { mag: 7 });
    const stack = s.player.inv.slots[0]; s.player.reloadTimer = 1;
    expect(inv.equip(s, 0)).toBe(true); expect(inv.equippedWeapon(s)).toBe(stack);
    expect(s.player.reloadTimer).toBe(0);
    const result = inv.unequip(s, 'secondary');
    expect(result).toEqual({ inv: s.player.inv, index: 0, stack });
    expect(result?.stack).toBe(stack);
  });
  it('preserves stack identity and overflow when removing a backpack', () => {
    const s = state(), i = s.player.inv;
    i.equip.back = { id: 'small_backpack', qty: 1 }; inv.recalcSize(s);
    for (let n = 0; n < inv.BASE_SLOTS; n++) i.slots[n] = { id: 'knife', qty: 1, mag: 0 };
    const retained = i.slots[2], pack = i.equip.back;
    const result = inv.unequip(s, 'back');
    expect(i.size).toBe(inv.BASE_SLOTS); expect(i.slots[2]).toBe(retained);
    expect(result?.inv).toBe(s.drops[0].inv); expect(result?.stack).toBe(pack);
    expect(result?.inv.slots[result.index]).toBe(pack);
  });
  it('folds backpack overflow into partial stacks without replacing them', () => {
    const s = state(), i = s.player.inv;
    i.equip.back = { id: 'small_backpack', qty: 1 }; inv.recalcSize(s);
    for (let n = 1; n < inv.BASE_SLOTS; n++) i.slots[n] = { id: 'knife', qty: 1, mag: 0 };
    i.slots[0] = { id: 'wood', qty: 90 }; i.slots[inv.BASE_SLOTS] = { id: 'wood', qty: 15 };
    const first = i.slots[0], overflow = i.slots[inv.BASE_SLOTS]; i.equip.back = null; inv.recalcSize(s);
    expect(i.slots[0]).toBe(first); expect(first.qty).toBe(100);
    expect(overflow.qty).toBe(5); expect(s.drops).toHaveLength(1); expect(s.drops[0].inv.slots).toContain(overflow);
  });
  it('crafts without a station and requires reachable workbenches for ammo', () => {
    const s = state(); inv.add(s.player.inv, 'cloth', 2);
    expect(inv.craft(s, 'bandage')).toBe(true); expect(inv.count(s.player.inv, 'cloth')).toBe(0);
    expect(inv.count(s.player.inv, 'bandage')).toBe(1); expect(s.player.xp).toBe(3);
    inv.add(s.player.inv, 'scrap', 3); inv.add(s.player.inv, 'gunpowder', 2);
    expect(inv.canCraft(s, 'ammo_9mm').reason).toContain('workbench');
    base.restore(s, [{ id: 'wb', type: 'workbench', x: 192, y: 128, hp: 220, rot: 0 } as Structure]);
    const wall = phys.addSolid(s, { x: 160, y: 100, w: 10, h: 100, kind: 'wall' });
    expect(inv.craft(s, 'ammo_9mm')).toBe(false); phys.removeSolid(s, wall);
    expect(inv.craft(s, 'ammo_9mm')).toBe(true); expect(inv.count(s.player.inv, 'ammo_9mm')).toBe(24);
    expect(s.events).toContainEqual({ t: 'itemAdded', id: 'ammo_9mm', qty: 24 });
  });
  it('rejects crafting into a full inventory before consuming materials', () => {
    const s = state(); s.player.inv.slots.fill(null);
    s.player.inv.slots[0] = { id: 'cloth', qty: 4 };
    for (let n = 1; n < inv.BASE_SLOTS; n++) s.player.inv.slots[n] = { id: 'knife', qty: 1 };
    expect(inv.canCraft(s, 'bandage').reason).toBe('Inventory full');
    expect(inv.craft(s, 'bandage')).toBe(false); expect(inv.count(s.player.inv, 'cloth')).toBe(4);
  });
  it('uses bandages for bleeding at full health', () => {
    const s = state(); s.player.bleeding = 1;
    inv.add(s.player.inv, 'medkit', 1); inv.add(s.player.inv, 'bandage', 1);
    expect(inv.quickHeal(s)).toBe(true); expect(s.player.bleeding).toBe(0); expect(inv.count(s.player.inv, 'medkit')).toBe(1);
  });
});
