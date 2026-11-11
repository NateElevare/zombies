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
import * as prog from '../src/sim/progression';
import * as base from '../src/sim/base';
import { WEAPONS } from '../src/sim/combat';
describe('progression', () => {
  it('carries XP across levels and gives a bonus point every fifth level', () => {
    const s = state(); const xp = [1, 2, 3, 4].reduce((n, l) => n + prog.xpForLevel(l), 0);
    prog.addXP(s, xp + 7);
    expect(s.player.level).toBe(5); expect(s.player.xp).toBe(7); expect(s.player.sp).toBe(5);
    expect(s.events.filter(e => e.t === 'levelUp')).toHaveLength(4);
  });
  it('checks prerequisites, SP, materials and station before paying', () => {
    const s = state(); s.player.sp = 20;
    expect(prog.unlock(s, 'handgun_reload1')).toBe(false);
    expect(prog.unlock(s, 'handgun_dmg1')).toBe(false);
    base.restore(s, [{ id: 'wb', type: 'workbench', x: 192, y: 128, hp: 220, rot: 0 } as Structure]);
    expect(prog.unlock(s, 'handgun_dmg1')).toBe(true); expect(s.player.sp).toBe(19);
    expect(prog.unlock(s, 'handgun_reload1')).toBe(false);
    inv.add(s.player.inv, 'scrap', 6);
    expect(prog.unlock(s, 'handgun_reload1')).toBe(true); expect(s.player.sp).toBe(18);
    expect(inv.count(s.player.inv, 'scrap')).toBe(0); expect(prog.unlock(s, 'handgun_reload1')).toBe(false);
    expect(s.events).toContainEqual({ t: 'techUnlocked', id: 'handgun_reload1' });
  });
  it('survival technology needs no station and resizes immediately', () => {
    const s = state(); s.player.sp = 1;
    expect(prog.unlock(s, 'survival_pack1')).toBe(true); expect(s.player.inv.size).toBe(26);
  });
  it('computes additive upgrades, special magazine sizes and slug mode without mutating definitions', () => {
    const s = state(); s.player.tech = { handgun_dmg1: true, handgun_dmg2: true, handgun_mag1: true, rifle_mag1: true, shotgun_slug: true, shotgun_pellets: true, melee_arc1: true };
    expect(prog.weaponStats(s, 'pistol').damage).toBeCloseTo(26 * 1.35);
    expect(prog.weaponStats(s, 'revolver').magSize).toBe(8);
    expect(prog.weaponStats(s, 'hunting_rifle').magSize).toBe(8);
    expect(prog.weaponStats(s, 'assault_rifle').magSize).toBe(40);
    expect(prog.weaponStats(s, 'shotgun')).toMatchObject({ pellets: 1, damage: 78, pierce: 1, slug: true, range: 608 });
    expect(prog.weaponStats(s, 'knife').melee?.arc).toBeCloseTo(1.3); expect(WEAPONS.knife.melee?.arc).toBe(1);
  });
  it('sync heals only the max-stat increase and suppresses regen in combat', () => {
    const s = state(); s.player.hp = 50; s.player.tech = { armor_hp1: true, survival_stam1: true, armor_regen: true };
    prog.sync(s); expect(s.player.hp).toBe(65); expect(s.player.maxHp).toBe(115); expect(s.player.maxStamina).toBe(125);
    prog.sync(s); expect(s.player.hp).toBe(65);
    s.player.combatTimer = 1; expect(prog.playerMods(s).regen).toBe(0);
  });
});
