import { describe, it, expect, vi } from 'vitest';
import type { Building, GameState, Zombie } from '../src/sim/types';
import * as game from '../src/sim/game';
import * as base from '../src/sim/base';
import * as zombies from '../src/sim/zombies';
import * as inv from '../src/sim/inventory';
import { SIM_DT } from '../src/sim/core';

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });

const inside = (b: Building, z: Zombie) => z.x > b.x && z.x < b.x + b.w && z.y > b.y && z.y < b.y + b.h;
const run = (s: GameState, seconds: number) => { for (let t = 0; t < seconds; t += SIM_DT) { s.player.hp = s.player.maxHp; zombies.update(s, SIM_DT); s.events.length = 0; } };
/** A mid-size building, and a free spot for the player ~900px from it (close enough to fill, out of view). */
function scene(seed = 5) {
  const s = game.newGame(seed);
  s.zombies.length = 0;
  const b = s.buildings.find(b => b.kind !== 'military' && b.w > 200 && b.h > 200 && b.w < 500 && b.h < 500)!;
  s.player.x = b.x + b.w / 2 + 900; s.player.y = b.y + b.h / 2;
  return { s, b };
}

describe('indoor zombie packs', () => {
  it('sizes packs by building', () => {
    expect(zombies.packSize({ w: 200, h: 200, kind: 'house', tier: 0 })).toBe(1);
    expect(zombies.packSize({ w: 500, h: 400, kind: 'police', tier: 2 })).toBeGreaterThan(4);
  });

  it('fills nearby buildings out of sight, and a cleared building stays clear', () => {
    const { s, b } = scene();
    run(s, 1);
    const pack = s.zombies.filter(z => z.home === b.id);
    expect(pack.length).toBe(zombies.packSize(b));
    expect(pack.every(z => inside(b, z))).toBe(true);
    for (const z of pack) z.dead = true;
    run(s, 5);
    expect(s.zombies.filter(z => z.home === b.id && !z.dead)).toHaveLength(0);
  });

  it('wandering pack zombies mostly stay inside their building', () => {
    const { s, b } = scene();
    run(s, 1);
    run(s, 30);
    const pack = s.zombies.filter(z => z.home === b.id && !z.dead);
    expect(pack.length).toBeGreaterThan(0);
    expect(pack.filter(z => inside(b, z)).length).toBeGreaterThanOrEqual(Math.ceil(pack.length * 0.6));
  });

  it('never spawns zombies in a building the player has built in', () => {
    const { s, b } = scene();
    for (const [id, qty] of Object.entries({ wood: 40, nails: 20, scrap: 10 })) inv.add(s.player.inv, id, qty);
    const room = b.rooms[0] ?? b;
    let built = null;
    for (let y = room.y + 20; !built && y < room.y + room.h - 40; y += 32) for (let x = room.x + 20; !built && x < room.x + room.w - 40; x += 32) built = base.place(s, 'stash', x, y);
    expect(built).toBeTruthy();
    // the night population pushes hard; still nothing may appear inside the base
    game.devSetTime(s, 450);
    run(s, 20);
    expect(s.zombies.filter(z => !z.dead && inside(b, z))).toHaveLength(0);
  });
});

describe('doorway pursuit', () => {
  /** A single-door building, a spot inside, the doorway's outside point, and a spot on the far side outside. */
  function setup(seed = 5) {
    const s = game.newGame(seed);
    s.zombies.length = 0;
    const b = s.buildings.find(b => b.doors.length === 1 && b.w > 180 && b.h > 180 && b.w < 360 && b.h < 360)!;
    const d = b.doors[0], dc = { x: d.x + d.w / 2, y: d.y + d.h / 2 }, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const ux = Math.sign(Math.round((dc.x - cx) / (b.w / 2))), uy = Math.sign(Math.round((dc.y - cy) / (b.h / 2)));
    const outside = { x: dc.x + ux * 40, y: dc.y + uy * 40 }, inside = { x: dc.x - ux * 60, y: dc.y - uy * 60 };
    const far = { x: cx - ux * (b.w / 2 + 260), y: cy - uy * (b.h / 2 + 260) };
    return { s, b, outside, inside, far };
  }
  const chase = (s: GameState, z: Zombie) => { z.state = 'chase'; z.target = { x: s.player.x, y: s.player.y }; z.memory = 8; };
  function follow(s: GameState, mine: Zombie[], seconds: number) {
    for (let t = 0; t < seconds; t += SIM_DT) {
      s.player.hp = s.player.maxHp;
      zombies.update(s, SIM_DT); s.events.length = 0;
      s.zombies = s.zombies.filter(z => mine.includes(z));
    }
  }
  const dist = (s: GameState, z: Zombie) => Math.hypot(z.x - s.player.x, z.y - s.player.y);

  it('zombies close behind follow you through a doorway; distant ones do not', () => {
    const { s, outside, inside, far } = setup();
    s.player.x = outside.x; s.player.y = outside.y;
    const near = zombies.spawn(s, 'walker', outside.x + (outside.x === inside.x ? 120 : 0), outside.y + (outside.y === inside.y ? 120 : 0));
    const away = zombies.spawn(s, 'walker', far.x, far.y);
    chase(s, near); chase(s, away);
    follow(s, [near, away], SIM_DT * 2);
    s.player.x = inside.x; s.player.y = inside.y;    // duck inside
    chase(s, near); chase(s, away);
    follow(s, [near, away], 0.1);
    expect((near as Zombie & { pursuit: number }).pursuit).toBeGreaterThan(0);
    expect((away as Zombie & { pursuit: number }).pursuit).toBe(0);
    follow(s, [near, away], 12);
    expect(dist(s, near)).toBeLessThan(50);
    expect(dist(s, away)).toBeGreaterThan(100);
  });

  it('on a horde night every zombie paths through doorways', () => {
    const { s, inside, far } = setup();
    game.devSetTime(s, 450); s.base.hordeDay = s.clock.day;
    expect(zombies.hordeActive(s)).toBe(true);
    s.player.x = inside.x; s.player.y = inside.y;
    const away = zombies.spawn(s, 'walker', far.x, far.y);
    chase(s, away);
    follow(s, [away], 0.1); chase(s, away);
    follow(s, [away], 15);
    expect(dist(s, away)).toBeLessThan(50);
  });
});
