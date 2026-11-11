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
import * as saves from '../src/sim/save';
import * as loot from '../src/sim/loot';
import * as base from '../src/sim/base';
function storage() {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } });
  return map;
}
describe('save', () => {
  it('persists the chosen character and defaults legacy or invalid choices safely', () => {
    const s = state(); s.player.character = 'responder';
    const data = saves.deserialize(saves.serialize(s))!;
    const target = state();
    expect(saves.apply(target, data)).toBe(true);
    expect(target.player.character).toBe('responder');
    delete data.player.character;
    expect(saves.apply(target, data)).toBe(true);
    expect(target.player.character).toBe('survivor');
    (data.player as any).character = '__proto__';
    expect(saves.apply(target, data)).toBe(true);
    expect(target.player.character).toBe('survivor');
  });
  it('roundtrips Infinity, loaded equipment, searched containers, structures and RNG', () => {
    const s = state(123); rand(s); rand(s);
    s.player.inv.equip.secondary = { id: 'pistol', qty: 1, mag: 8 };
    s.player.tech.survival_pack1 = true; inv.recalcSize(s);
    loot.makeDrop(s, 160, 180, [{ id: 'scrap', qty: 7 }], 'deathbag');
    s.containers.push({ id: 'cab', kind: 'cabinet', name: 'cab', tier: 0, x: 100, y: 100, w: 32, h: 32, buildingId: null, searched: true, inv: inv.create(8) });
    inv.add(s.containers[0].inv!, 'bandage', 3);
    base.restore(s, [{ id: 'bed', type: 'bed', x: 256, y: 256, hp: 50, maxHp: 120, rot: 0, w: 32, h: 64 }]);
    const before = s.rngState, raw = saves.serialize(s), data = saves.deserialize(raw)!;
    expect(raw).not.toContain('_solid'); expect(data.drops[0].life).toBe(Infinity); expect(s.rngState).toBe(before);
    const target = state(999); target.containers.push({ ...s.containers[0], searched: false, inv: null });
    expect(saves.apply(target, data)).toBe(true);
    expect(target.seed).toBe(123); expect(target.rngState).toBe(before); expect(rand(target)).toBe(rand(s));
    expect(target.drops[0].life).toBe(Infinity); expect(target.player.inv.equip.secondary?.mag).toBe(8);
    expect(target.player.inv.size).toBe(26); expect(target.containers[0].searched).toBe(true);
    expect(inv.count(target.containers[0].inv!, 'bandage')).toBe(3);
    expect(target.base.bed).toBe('bed'); expect(target.structures[0].hp).toBe(50); expect(target.grid.all()).toContain(target.structures[0]._solid);
    expect(target.player.prevX).toBe(target.player.x);
  });
  it('does not persist an unfinished horde marker or mutate the live marker', () => {
    const s = state(); s.clock = { t: 450, day: 3 }; s.base.hordeDay = 3;
    s._zombies = { hordeRemaining: 20 };
    expect(saves.deserialize(saves.serialize(s))?.base.hordeDay).toBeUndefined(); expect(s.base.hordeDay).toBe(3);
    s.clock.t = 100; s._zombies = { hordeRemaining: 0 };
    expect(saves.deserialize(saves.serialize(s))?.base.hordeDay).toBe(3);
  });
  it('returns real booleans for successful and failed storage operations', () => {
    const map = storage(), s = state();
    expect(saves.write(s)).toBe(true); expect(map.has('deadzone_survival_v2')).toBe(true); expect(saves.has()).toBe(true);
    expect(saves.read()?.seed).toBe(s.seed); expect(saves.clear()).toBe(true); expect(saves.has()).toBe(false);
    vi.stubGlobal('localStorage', { setItem() { throw new Error('quota'); }, getItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } });
    expect(saves.write(s)).toBe(false); expect(saves.read()).toBeNull(); expect(saves.has()).toBe(false); expect(saves.clear()).toBe(false);
  });
  it('reads legacy Infinity markers and writes cloud-safe markers with timestamps', () => {
    const map = storage(), s = state();
    loot.makeDrop(s, 160, 180, [{ id: 'scrap', qty: 7 }], 'deathbag');
    const raw = saves.serialize(s);
    expect(raw).toContain('"numberValue":"Infinity"'); expect(raw).not.toContain('"$number"');
    expect(saves.deserialize(raw.replaceAll('"numberValue"', '"$number"'))?.drops[0].life).toBe(Infinity);
    expect(saves.writeRaw(raw, 123)).toBe(true); expect(saves.savedAt()).toBe(123);
    expect(saves.writeRaw('{}', 456)).toBe(false); expect(saves.savedAt()).toBe(123);
    saves.clear(); expect(map.has(saves.SAVE_TIME_KEY)).toBe(false);
  });
  it('rejects malformed saves and sanitizes invalid inventory stacks and equip slots', () => {
    expect(saves.deserialize('{')).toBeNull(); expect(saves.deserialize('{"version":1}')).toBeNull();
    const s = state(), data = saves.deserialize(saves.serialize(s))!;
    data.player.inv.slots[0] = { id: 'invalid', qty: 1 }; data.player.inv.slots[1] = { id: 'scrap', qty: 200 };
    data.player.inv.equip.head = { id: 'pistol', qty: 1, mag: 8 };
    expect(saves.apply(s, data)).toBe(true); expect(s.player.inv.slots[0]).toBeNull(); expect(s.player.inv.slots[1]?.qty).toBe(100); expect(s.player.inv.equip.head).toBeNull();
    const player = s.player; expect(saves.apply(s, {})).toBe(false); expect(s.player).toBe(player);
  });
  it('serializing is pure and resuming clears transient combat state', () => {
    const s = state(); inv.add(s.player.inv, 'wood', 5); const stack = s.player.inv.slots[0];
    s.player.reloadTimer = 1; s.player.fireCooldown = 1; s.player.swingTimer = 1;
    const raw = saves.serialize(s); expect(s.player.inv.slots[0]).toBe(stack); expect(stack?.qty).toBe(5);
    expect(saves.apply(s, saves.deserialize(raw))).toBe(true);
    expect(s.player.reloadTimer).toBe(0); expect(s.player.fireCooldown).toBe(0); expect(s.player.swingTimer).toBe(0); expect(s.ui).toBeNull();
  });
});
