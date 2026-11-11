import { describe, expect, it } from 'vitest';
import { newState, phys, SIM_DT } from '../src/sim/core';
import * as player from '../src/sim/player';
import * as zombies from '../src/sim/zombies';
import type { Container, InputState } from '../src/sim/types';

function fixture() { const s = newState(9); s.player = player.create(8000, 8000); return s; }
function input(extra: Partial<InputState> = {}): InputState {
  return { moveX: 0, moveY: 0, aimX: 8100, aimY: 8000, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set(), ...extra };
}
function container(): Container { return { id: 'c0', x: 8030, y: 7980, w: 40, h: 40, kind: 'cabinet', name: 'Cabinet', tier: 0, buildingId: null, inv: null, searched: false }; }
describe('player', () => {
  it('initializes interpolation and animation fields and normalizes diagonal movement', () => {
    const s = fixture(), p = s.player;
    expect(p.lastShotT).toBe(-99); expect(p.prevX).toBe(p.x); expect(p.swingTotal).toBe(0);
    for (let i = 0; i < 60; i++) player.update(s, input({ moveX: 1, moveY: 1 }), SIM_DT);
    expect(Math.hypot(p.x - 8000, p.y - 8000)).toBeCloseTo(190);
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(190);
  });
  it('collides with walls and reports displacement rather than requested velocity', () => {
    const s = fixture(); phys.addSolid(s, { kind: 'wall', x: 8040, y: 7900, w: 20, h: 200 });
    for (let i = 0; i < 60; i++) player.update(s, input({ moveX: 1 }), SIM_DT);
    expect(s.player.x).toBeCloseTo(8026); expect(s.player.vx).toBe(0);
  });
  it('drains food, water and sprint stamina at legacy rates, then delays stamina regen', () => {
    const s = fixture(), p = s.player;
    for (let i = 0; i < 60; i++) player.update(s, input({ moveY: 1, sprint: true }), SIM_DT);
    expect(p.y).toBeCloseTo(8304); expect(p.stamina).toBeCloseTo(75);
    expect(p.food).toBeCloseTo(100 - 100 / 720); expect(p.water).toBeCloseTo(100 - 100 / 540);
    for (let i = 0; i < 30; i++) player.update(s, input(), SIM_DT);
    expect(p.stamina).toBeCloseTo(75);
    for (let i = 0; i < 60; i++) player.update(s, input(), SIM_DT);
    expect(p.stamina).toBeGreaterThan(75);
  });
  it('starts searching on press, continues while held, and opens loot on completion', () => {
    const s = fixture(), c = container(); s.containers.push(c);
    phys.addSolid(s, { ...c, kind: 'furniture', container: c });
    player.update(s, input({ pressed: new Set(['interact']), interactHeld: true }), SIM_DT);
    expect(s.search?.target).toBe(c);
    for (let i = 0; i < 60; i++) player.update(s, input({ interactHeld: true }), SIM_DT);
    expect(c.searched).toBe(true); expect(c.inv).not.toBeNull(); expect(s.search).toBeNull();
    expect(s.stats.containersLooted).toBe(1); expect(s.player.xp).toBe(5);
    expect(s.events).toContainEqual({ t: 'openUi', ui: 'loot', target: c }); expect(s.ui).toBe('loot');
    s.ui = null; player.update(s, input({ pressed: new Set(['interact']) }), SIM_DT);
    expect(s.stats.containersLooted).toBe(1);
  });
  it('cancels a search on release or when a wall blocks access', () => {
    const s = fixture(), c = container(); s.containers.push(c);
    player.update(s, input({ pressed: new Set(['interact']), interactHeld: true }), SIM_DT);
    player.update(s, input(), SIM_DT); expect(s.search).toBeNull(); expect(c.searched).toBe(false);
    player.update(s, input({ pressed: new Set(['interact']), interactHeld: true }), SIM_DT);
    phys.addSolid(s, { kind: 'wall', x: 8020, y: 7950, w: 5, h: 100 });
    player.update(s, input({ interactHeld: true }), SIM_DT); expect(s.search).toBeNull();
  });
  it('emits hurt and death events once and honors invulnerability', () => {
    const s = fixture(); player.damage(s, 10, 1); player.damage(s, 999, 1);
    expect(s.player.hp).toBe(90); expect(s.events.filter(e => e.t === 'playerHurt')).toHaveLength(1);
    s.player.invuln = 0; player.damage(s, 999, 1); player.damage(s, 999, 1);
    expect(s.player.dead).toBe(true); expect(s.events.filter(e => e.t === 'playerDied')).toHaveLength(1);
  });
  it('notifies combat of accepted hits so thorns and the regeneration delay work', () => {
    const s = fixture(); s.player.tech.armor_thorns = true;
    const z = zombies.spawn(s, 'walker', 8030, 8000);
    player.damage(s, 10, 0);
    expect(s.player.combatTimer).toBe(6); expect(z.hp).toBe(z.maxHp - 12);
    player.damage(s, 10, 0); expect(z.hp).toBe(z.maxHp - 12);
  });
});
