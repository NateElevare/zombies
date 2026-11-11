import { describe, expect, it } from 'vitest';
import { newState, phys, SIM_DT } from '../src/sim/core';
import * as zombies from '../src/sim/zombies';
import * as pathing from '../src/sim/pathing';
import * as player from '../src/sim/player';
import * as base from '../src/sim/base';
import * as inv from '../src/sim/inventory';
import * as world from '../src/sim/world';
import * as arcade from '../src/sim/arcade';
import type { GameState, Zombie } from '../src/sim/types';

// Arcade mode keeps the survival population director out of these isolated scenarios.
function fixture(px = 8000, py = 8000) {
  const s = newState(42, 'arcade'); s.player = player.create(px, py); return s;
}
function wall(s: GameState, x: number, y: number, w: number, h: number) { return phys.addSolid(s, { kind: 'wall', x, y, w, h }); }
/** Square room of world walls around (cx,cy) with one door gap of `gap` px centred on the given side. */
function room(s: GameState, cx: number, cy: number, half: number, side: 'n' | 's', gap = 64) {
  const t = 12, x0 = cx - half, y0 = cy - half, size = half * 2;
  const horiz = (y: number, withGap: boolean) => {
    if (!withGap) { wall(s, x0, y, size, t); return; }
    wall(s, x0, y, half - gap / 2, t); wall(s, cx + gap / 2, y, half - gap / 2, t);
  };
  horiz(y0, side === 'n'); horiz(y0 + size - t, side === 's');
  wall(s, x0, y0 + t, t, size - 2 * t); wall(s, x0 + size - t, y0 + t, t, size - 2 * t);
}
function chaseFor(s: GameState, z: Zombie, seconds: number, opts: { forced?: boolean; until?: () => boolean } = {}) {
  let stall = 0, worstStall = 0, lastX = z.x, lastY = z.y, check = 0;
  for (let t = 0; t < seconds; t += SIM_DT) {
    if (opts.forced) { z.state = z.state === 'attackStructure' ? z.state : 'chase'; z.target = { x: s.player.x, y: s.player.y }; z.memory = 8; z.losTimer = 1; }
    s.player.hp = s.player.maxHp;
    zombies.update(s, SIM_DT); s.events.length = 0;
    if ((check += SIM_DT) >= 0.5) {
      const moved = Math.hypot(z.x - lastX, z.y - lastY);
      stall = moved < 8 && z.state !== 'attackStructure' && near(s, z) > 60 ? stall + check : 0;
      worstStall = Math.max(worstStall, stall);
      lastX = z.x; lastY = z.y; check = 0;
    }
    if (opts.until?.()) break;
  }
  return { worstStall };
}
const near = (s: GameState, z: Zombie) => Math.hypot(z.x - s.player.x, z.y - s.player.y);
function materials(s: GameState) { for (const [id, q] of [['cloth', 10], ['scrap', 10], ['nails', 60], ['wood', 220]] as const) expect(inv.add(s.player.inv, id, q)).toBe(0); }

describe('zombie pathing', () => {
  it('walks round a building to its door instead of hugging the wall nearest the player', () => {
    const s = fixture(); room(s, 8000, 8000, 110, 'n');
    const z = zombies.spawn(s, 'walker', 8000, 8260);
    // It heard the player inside: no line of sight, only the 4s memory a real sighting gives.
    z.state = 'investigate'; z.target = { x: 8000, y: 8000 }; z.memory = 4; z.losTimer = 0;
    const { worstStall } = chaseFor(s, z, 15, { until: () => near(s, z) < 40 });
    expect(near(s, z)).toBeLessThan(40);
    expect(worstStall).toBeLessThan(1);
    expect(phys.isFree(s, z.x, z.y, z.r - 0.5)).toBe(true);
  });

  it('hordes find doors into real generated buildings; ordinary zombies do not hunt through doorways', () => {
    const s = newState(11, 'arcade'); world.generate(s); s.player = player.create(8000, 8000);
    let tried = 0, reached = 0, sneaked = 0;
    for (const b of s.buildings) {
      if (tried >= 8) break;
      if (!b.doors?.length || b.w > 500 || b.h > 500) continue;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2, d = b.doors[0];
      let spot: { x: number; y: number } | null = null;
      for (let r = 0; r < 80 && !spot; r += 8) for (let a = 0; a < 6.28 && !spot; a += 0.5) {
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (phys.isFree(s, x, y, 16)) spot = { x, y };
      }
      // Zombie outside, on the side away from the door.
      const dx = cx - (d.x + d.w / 2), dy = cy - (d.y + d.h / 2), dl = Math.hypot(dx, dy) || 1;
      let from: { x: number; y: number } | null = null;
      for (let k = 0; k < 20 && !from; k++) {
        const reach = Math.max(b.w, b.h) / 2 + 60 + k * 10, x = cx + dx / dl * reach, y = cy + dy / dl * reach;
        if (phys.isFree(s, x, y, 15) && !world.buildingAt(s, x, y)) from = { x, y };
      }
      if (!spot || !from) continue;
      tried++;
      s.player.x = spot.x; s.player.y = spot.y; s.zombies.length = 0;
      const z = zombies.spawn(s, 'walker', from.x, from.y, true);
      z.state = 'chase'; z.target = { ...spot }; z.memory = 4; z.losTimer = 0;
      chaseFor(s, z, 25, { until: () => near(s, z) < 50 });
      if (near(s, z) < 50) reached++;
      s.zombies.length = 0;
      const w = zombies.spawn(s, 'walker', from.x, from.y);
      w.state = 'chase'; w.target = { ...spot }; w.memory = 4; w.losTimer = 0;
      chaseFor(s, w, 10, { until: () => near(s, w) < 50 });
      // (a zombie that can see the player straight through a doorway still comes in; only single-door buildings count)
      if (b.doors.length === 1 && near(s, w) < 50) sneaked++;
    }
    expect(tried).toBe(8);
    expect(reached).toBe(tried);
    expect(sneaked).toBe(0);
  });

  it('goes round a prop instead of snagging on it', () => {
    const s = fixture();
    phys.addSolid(s, { kind: 'car', sub: 'van', x: 7900, y: 7790, w: 52, h: 110 });
    for (const type of ['brute', 'walker', 'runner'] as const) {
      s.zombies.length = 0;
      const z = zombies.spawn(s, type, 7800, 7845);
      z.state = 'chase'; z.target = { x: 8000, y: 7845 };
      s.player.x = 8000; s.player.y = 7845;
      const { worstStall } = chaseFor(s, z, 8, { forced: true, until: () => near(s, z) < z.r + s.player.r + 4 });
      expect(near(s, z), type).toBeLessThan(z.r + s.player.r + 4);
      expect(worstStall, type).toBeLessThan(1);
    }
  });

  it('uses a gap in a player-built wall instead of breaking the wall', () => {
    const s = fixture(8000, 8100); materials(s);
    // A long wood wall between zombie and player with one 64px opening two segments from the middle.
    for (let x = 7680; x < 8320; x += 64) if (x !== 8128) expect(base.place(s, 'wood_wall', x, 8000, 0)).toBeTruthy();
    const z = zombies.spawn(s, 'walker', 8000, 7800);
    z.state = 'chase'; z.target = { x: 8000, y: 8100 };
    chaseFor(s, z, 12, { forced: true, until: () => near(s, z) < 40 });
    expect(near(s, z)).toBeLessThan(40);
    expect(s.structures.every(st => st.hp === st.maxHp)).toBe(true);
  });

  it('still breaks in when player-built walls really seal the player in, picking the weakest piece', () => {
    const s = fixture(8000, 8000); materials(s);
    // Ring on the 32px build grid. The corner slivers left by the grid are 16px: too narrow for any zombie.
    const put = (type: string, x: number, y: number, rot = 0) => expect(base.place(s, type, x, y, rot), `${type}@${x},${y}`).toBeTruthy();
    put('wood_wall', 7872, 7872); put('barricade', 7936, 7872); put('wood_wall', 8000, 7872); put('wood_wall', 8064, 7872); put('wood_wall', 8096 + 32, 7872 + 0, 0);
    for (const x of [7840, 7904, 7968, 8032, 8096]) put('wood_wall', x, 8144);
    for (const y of [7872, 7936, 8000, 8064]) { put('wood_wall', 7840, y, 1); put('wood_wall', 8192, y, 1); }
    put('wood_wall', 8160, 8144);
    const weak = s.structures.find(st => st.type === 'barricade')!;
    expect(weak.maxHp).toBeLessThan(Math.min(...s.structures.filter(st => st !== weak).map(st => st.maxHp)));
    const z = zombies.spawn(s, 'walker', 8120, 7700);
    z.state = 'chase'; z.target = { x: 8000, y: 8000 };
    chaseFor(s, z, 40, { forced: true, until: () => near(s, z) < 60 });
    expect(near(s, z)).toBeLessThan(60);
    expect(weak.dead || weak.hp < weak.maxHp).toBe(true);
    expect(s.structures.filter(st => st !== weak && st.hp < st.maxHp)).toHaveLength(0);
  });

  it('a horde walks through the opening to the bed and hits the bed, not the walls', () => {
    const s = fixture(9000, 9000); materials(s);
    expect(base.place(s, 'bed', 8000, 7968, 0)).toBeTruthy();
    // Three walls around the bed; the south side is open.
    for (let i = 0; i < 4; i++) {
      base.place(s, 'wood_wall', 7872 + i * 64, 7872, 0);
      base.place(s, 'wood_wall', 7856, 7888 + i * 64, 1);
      base.place(s, 'wood_wall', 8128, 7888 + i * 64, 1);
    }
    const bed = s.structures.find(st => st.type === 'bed')!;
    const horde = [0, 1, 2, 3, 4].map(i => zombies.spawn(s, 'walker', 7900 + i * 50, 7650, true));
    for (let t = 0; t < 20 && bed.hp === bed.maxHp; t += SIM_DT) { zombies.update(s, SIM_DT); s.events.length = 0; }
    expect(bed.hp).toBeLessThan(bed.maxHp);
    expect(s.structures.filter(st => st.type === 'wood_wall' && st.hp < st.maxHp)).toHaveLength(0);
    expect(horde.some(z => z.state === 'attackStructure')).toBe(true);
  });

  it('keeps a crowd from collapsing into one blob or tunnelling through walls', () => {
    const s = fixture(); room(s, 8000, 8000, 60, 'n', 0); // sealed concrete box: unreachable
    const list: Zombie[] = [];
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * Math.PI * 2;
      list.push(zombies.spawn(s, (['walker', 'runner', 'brute', 'crawler'] as const)[i % 4], 8000 + Math.cos(a) * 320, 8000 + Math.sin(a) * 320));
    }
    for (let t = 0; t < 12; t += SIM_DT) {
      for (const z of list) { z.state = 'chase'; z.target = { x: 8000, y: 8000 }; z.memory = 8; z.losTimer = 1; }
      zombies.update(s, SIM_DT); s.events.length = 0;
    }
    for (const z of list) {
      expect(Math.max(Math.abs(z.x - 8000), Math.abs(z.y - 8000))).toBeGreaterThan(60); // still outside the box
      expect(phys.isFree(s, z.x, z.y, z.r - 1)).toBe(true);
    }
    // No pair sunk more than ~2/3 of the smaller radius into each other.
    let worst = 0;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], o = a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y);
      worst = Math.max(worst, o / Math.min(a.r, b.r));
    }
    expect(worst).toBeLessThan(0.7);
  });

  it('arcade waves do not stall on the props', () => {
    const s = arcade.newArcade(5); const p = s.player;
    s.arcade!.toSpawn = 0;
    const list: Zombie[] = [];
    // Spawn along the gate lanes, like the wave director does.
    for (let i = 0; i < 24; i++) {
      const x = 6900 + (i % 12) * 200, y = i < 12 ? 7290 : 8710;
      if (phys.isFree(s, x, y, 24)) list.push(zombies.spawn(s, (['walker', 'brute', 'runner'] as const)[i % 3], x, y));
    }
    let stalled = 0;
    const last = list.map(z => ({ x: z.x, y: z.y }));
    for (let t = 0, check = 0; t < 25; t += SIM_DT) {
      p.hp = p.maxHp;
      for (const z of list) { z.state = 'chase'; z.target = { x: p.x, y: p.y }; z.memory = 8; z.losTimer = 1; }
      zombies.update(s, SIM_DT); s.events.length = 0;
      if ((check += SIM_DT) >= 1) {
        list.forEach((z, i) => {
          if (Math.hypot(z.x - p.x, z.y - p.y) > 200 && Math.hypot(z.x - last[i].x, z.y - last[i].y) < 10) stalled++;
          last[i] = { x: z.x, y: z.y };
        });
        check = 0;
      }
    }
    expect(stalled).toBe(0);
    expect(list.filter(z => Math.hypot(z.x - p.x, z.y - p.y) < 200).length).toBe(list.length);
  });

  it('shares one field between all zombies chasing the same goal', () => {
    const s = fixture(); room(s, 8000, 8000, 110, 'n');
    const a = pathing.field(s, 'player', 8000, 8000), b = pathing.field(s, 'player', 8004, 8003);
    expect(b).toBe(a);
    // Cut-off cells stay unreachable; open cells point downhill toward the goal.
    const outside = pathing.step(a, 8000, 8300)!;
    expect(outside).not.toBeNull();
    expect(pathing.step(a, 8000, 7400)!.y).toBeGreaterThan(0.5);
  });
});
