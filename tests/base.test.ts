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
import * as zombies from '../src/sim/zombies';
import * as game from '../src/sim/game';
function fund(s: GameState, type: string) { for (const [id, n] of Object.entries(base.STRUCTURES[type].cost)) inv.add(s.player.inv, id, n); }
describe('base', () => {
  it('snaps placement, rotates dimensions, pays exact cost and registers solids', () => {
    const s = state(); fund(s, 'wood_wall');
    const wall = base.place(s, 'wood_wall', 201, 201, 1)!;
    expect(wall).toMatchObject({ x: 192, y: 192, w: 16, h: 64, rot: 1, hp: 320, hitFlash: 0 });
    expect(inv.count(s.player.inv, 'wood')).toBe(0); expect(inv.count(s.player.inv, 'nails')).toBe(0);
    expect(s.grid.all()).toContain(wall._solid); expect(base.place(s, 'wood_wall', 300, 300)).toBeNull();
    expect(s.events).toContainEqual({ t: 'structureBuilt', id: wall.id, type: 'wood_wall' });
  });
  it('rejects occupied cells, actors, bounds and duplicate beds without charging', () => {
    const s = state(); fund(s, 'bed');
    expect(base.place(s, 'bed', 128, 128)).toBeNull();
    phys.addSolid(s, { x: 192, y: 192, w: 32, h: 32, kind: 'wall' });
    expect(base.place(s, 'bed', 192, 192)).toBeNull(); expect(base.place(s, 'bed', -32, 0)).toBeNull();
    expect(inv.count(s.player.inv, 'wood')).toBe(12);
    const bed = base.place(s, 'bed', 256, 256)!; expect(s.base.bed).toBe(bed.id); expect(s.player.spawn).toEqual({ x: 272, y: 288 });
    fund(s, 'bed'); expect(base.place(s, 'bed', 384, 384)).toBeNull();
    base.damage(s, bed, 120); expect(s.base.bed).toBeNull(); expect(s.player.spawn).toEqual(s.spawnPoint);
  });
  it('computes a ghost, cycles, rotates, places on edge press and exits', () => {
    const s = state(); fund(s, 'stash'); base.enterBuild(s);
    base.update(s, input({ aimX: 210, aimY: 210, pressed: new Set(['cycleNext', 'rotate']) }), 0);
    expect(s.build).toMatchObject({ selected: 'stash', rot: 1, ghost: { x: 192, y: 192, w: 32, h: 32, ok: true } });
    base.update(s, input({ aimX: 210, aimY: 210, fire: true }), 0); expect(s.structures).toHaveLength(0);
    base.update(s, input({ aimX: 210, aimY: 210, firePressed: true }), 0); expect(s.structures).toHaveLength(1);
    base.update(s, input({ altPressed: true }), 0); expect(s.ui).toBeNull(); expect(s.build).toBeNull();
  });
  it('drops stash contents on destruction, closes its UI and refunds demolition only', () => {
    const s = state(); fund(s, 'stash'); const stash = base.place(s, 'stash', 192, 128)!;
    inv.add(stash.inv!, 'ammo_9mm', 30); base.interact(s, stash); expect(s.ui).toBe('stash');
    base.damage(s, stash, 10); expect(stash.hitFlash).toBe(0.15);
    base.damage(s, stash, 200);
    expect(s.ui).toBeNull(); expect(inv.count(s.drops[0].inv, 'ammo_9mm')).toBe(30); expect(inv.count(s.player.inv, 'wood')).toBe(0);
    expect(s.events).toContainEqual(expect.objectContaining({ t: 'structureDestroyed', id: stash.id }));
    fund(s, 'stash'); const next = base.place(s, 'stash', 192, 128)!; base.demolish(s, next);
    expect(inv.count(s.player.inv, 'wood')).toBe(5); expect(inv.count(s.player.inv, 'nails')).toBe(2);
  });
  it('does not interact across solid walls; beds sleep and save', () => {
    const s = state(); fund(s, 'bed'); const bed = base.place(s, 'bed', 192, 128)!;
    const wall = phys.addSolid(s, { x: 160, y: 100, w: 10, h: 120, kind: 'wall' });
    expect(base.nearestInteractable(s, 128, 128)).toBeNull(); base.interact(s, bed); expect(game.save).not.toHaveBeenCalled();
    phys.removeSolid(s, wall); s.clock.t = 450; base.interact(s, bed);
    expect(game.skipToMorning).toHaveBeenCalledWith(s); expect(game.save).toHaveBeenCalledWith(s);
  });
  it('turrets fire from outside their own proxy and consume ammunition', () => {
    const s = state(); fund(s, 'turret'); const turret = base.place(s, 'turret', 192, 192)!;
    inv.add(turret.inv!, 'ammo_9mm', 3); s.zombies.push(zombie('z', 400, 208));
    base.update(s, input(), 0);
    expect(inv.count(turret.inv!, 'ammo_9mm')).toBe(2); expect(turret.aim).toBe(0);
    expect(s.bullets).toHaveLength(1); expect(s.bullets[0].x).toBeGreaterThan(turret.x + turret.w);
    expect(s.bullets[0].prevX).toBe(s.bullets[0].x); expect(s.bullets[0].weapon).toBe('turret');
    expect(zombies.noise).toHaveBeenCalledWith(s, 208, 208, 700);
    base.update(s, input(), 0.1); expect(s.bullets).toHaveLength(1);
    phys.addSolid(s, { x: 250, y: 180, w: 20, h: 60, kind: 'wall' });
    base.update(s, input(), 0.3); expect(s.bullets).toHaveLength(1); expect(inv.count(turret.inv!, 'ammo_9mm')).toBe(2);
  });
  it('spike traps damage crossing zombies and wear down on a cooldown', () => {
    const s = state(); fund(s, 'spike_trap'); const trap = base.place(s, 'spike_trap', 192, 192)!;
    const z = zombie('z', 208, 208); s.zombies.push(z);
    base.update(s, input(), 0); expect(z.hp).toBe(984); expect(trap.hp).toBe(98);
    base.update(s, input(), 0.2); expect(z.hp).toBe(984);
    base.update(s, input(), 0.5); expect(z.hp).toBe(968); expect(trap.hp).toBe(96);
  });
});

describe('repairing structures', () => {
  it('costs materials scaled by damage and restores full HP', () => {
    const s = state(); inv.add(s.player.inv, 'wood', 20); inv.add(s.player.inv, 'nails', 10);
    const wall = base.place(s, 'wood_wall', 1000, 1000, 0)!;
    expect(wall).toBeTruthy();
    expect(base.repairCost(wall)).toBe(null);
    base.damage(s, wall, wall.maxHp / 2);
    const cost = base.repairCost(wall)!;
    expect(cost).toEqual({ wood: 2, nails: 1 });     // half of half the build cost (8 wood, 2 nails)
    const wood = inv.count(s.player.inv, 'wood');
    expect(base.repair(s, wall)).toBe(true);
    expect(wall.hp).toBe(wall.maxHp);
    expect(inv.count(s.player.inv, 'wood')).toBe(wood - 2);
  });
  it('refuses without materials and leaves the structure damaged', () => {
    const s = state(); fund(s, 'wood_wall');
    const wall = base.place(s, 'wood_wall', 1000, 1000, 0)!; base.damage(s, wall, 10);
    expect(base.repair(s, wall)).toBe(false);
    expect(wall.hp).toBe(wall.maxHp - 10);
  });
});
