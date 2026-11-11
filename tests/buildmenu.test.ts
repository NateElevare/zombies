import { describe, it, expect, vi } from 'vitest';
import type { InputState, Action } from '../src/sim/types';
import * as game from '../src/sim/game';
import * as base from '../src/sim/base';
import * as zombies from '../src/sim/zombies';
import * as inv from '../src/sim/inventory';
import { SIM_DT } from '../src/sim/core';

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });

const input = (extra: Partial<InputState> = {}, pressed: Action[] = []): InputState =>
  ({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set(pressed), ...extra });

function setup() {
  const s = game.newGame(7);
  const p = s.player;
  for (const [id, qty] of Object.entries({ wood: 60, nails: 30, scrap: 20 })) inv.add(p.inv, id, qty);
  return s;
}

describe('build menu', () => {
  it('pauses the world while building, and B exits', () => {
    const s = setup(), p = s.player;
    const z = zombies.spawn(s, 'walker', p.x + 200, p.y);
    z.state = 'chase'; z.target = { x: p.x, y: p.y };
    game.setUi(s, 'build');
    expect(s.ui).toBe('build');
    const zx = z.x, t = s.clock.t, px = p.x;
    for (let i = 0; i < 120; i++) game.step(s, input({ moveX: 1, aimX: p.x, aimY: p.y }), SIM_DT);
    expect(z.x).toBe(zx); expect(s.clock.t).toBe(t); expect(p.x).toBe(px);
    game.step(s, input({}, ['build']), SIM_DT);
    expect(s.ui).toBeNull();
    for (let i = 0; i < 60; i++) game.step(s, input(), SIM_DT);
    expect(s.clock.t).toBeGreaterThan(t);
  });

  it('selects from the menu and uses the repair and demolish tools with a click', () => {
    const s = setup(), p = s.player;
    game.setUi(s, 'build');
    base.selectBuild(s, 'wood_door');
    expect(s.build!.selected).toBe('wood_door');
    const ax = p.x + 100, ay = p.y + 100;
    game.step(s, input({ firePressed: true, aimX: ax, aimY: ay }), SIM_DT);
    const door = s.structures.find(st => st.type === 'wood_door')!;
    expect(door).toBeTruthy();
    expect(door.maxHp).toBe(360);
    door.hp = 40;
    base.setBuildTool(s, 'repair');
    game.step(s, input({ firePressed: true, aimX: door.x + 4, aimY: door.y + 4 }), SIM_DT);
    expect(door.hp).toBe(door.maxHp);
    expect(s.build!.ghost).toBeNull();
    base.setBuildTool(s, 'demolish');
    game.step(s, input({ firePressed: true, aimX: door.x + 4, aimY: door.y + 4 }), SIM_DT);
    expect(s.structures.includes(door)).toBe(false);
    // re-entering remembers the last selection
    game.setUi(s, null); game.setUi(s, 'build');
    expect(s.build!.selected).toBe('wood_door');
    expect(s.build!.tool).toBe('place');
  });

  it('offers "repair" with E next to a damaged structure outside build mode', () => {
    const s = setup(), p = s.player;
    const door = base.place(s, 'wood_door', p.x + 40, p.y - 8, 0)!;
    expect(door).toBeTruthy();
    door.hp = 100;
    for (let i = 0; i < 10; i++) game.step(s, input(), SIM_DT);   // prompt refreshes every 0.1s
    expect(s.interact?.kind).toBe('repair');
    expect(s.interact?.label).toMatch(/Repair Wood door/);
    game.step(s, input({}, ['interact']), SIM_DT);
    expect(door.hp).toBe(door.maxHp);
  });
});
