// Long Road boss rules: props get smashed, rage at half health, return matches, the second specials, the Warden's stages.
import { beforeEach, describe, expect, it } from 'vitest';
import * as core from '../src/sim/core';
import * as road from '../src/sim/road';
import * as bosses from '../src/sim/bosses';
import * as zombies from '../src/sim/zombies';
import type { GameState, InputState } from '../src/sim/types';

const input = (s: GameState, extra: Partial<InputState> = {}): InputState => ({ moveX: 0, moveY: 0, aimX: s.player.x + 100, aimY: s.player.y, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set(), ...extra });
const run = (s: GameState, n: number) => { for (let i = 0; i < n; i++) road.stepRoad(s, input(s), core.SIM_DT); };
const teleport = (s: GameState, p: { x: number; y: number }) => { s.player.x = s.player.prevX = p.x; s.player.y = s.player.prevY = p.y; };
type BossZ = ReturnType<typeof bosses.spawnBossOf>;

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k), clear: () => store.clear() };
});
/** A playing road state with god mode, the player parked on open ground in sector 1 and no zombies. */
function arena() {
  const s = road.newRoad(); s.ui = null; run(s, 1);
  s.dev = { timeScale: 1, freeze: false, god: true };
  const c = road.campOf(s, 0); teleport(s, { x: c.x - 600, y: c.y + 165 });   // on the avenue west of the first gate
  s.zombies.length = 0;
  return s;
}
const spawn = (s: GameState, id: bosses.BossId, dx: number, opts: bosses.SpawnOpts = {}) => bosses.spawnBossOf(s, id, 0, s.player.x + dx, s.player.y, 1, { maxR: 26, kit: 1, ...opts });

describe('Long Road bosses', () => {
  it('bulldoze cars, furniture and trees but never walls', () => {
    const s = arena();
    const p = s.player;
    const car = core.phys.addSolid(s, { x: p.x + 120, y: p.y - 22, w: 90, h: 44, kind: 'car', sub: 'sedan' } as any);
    const tree = core.phys.addSolid(s, { x: p.x + 240, y: p.y - 11, w: 22, h: 22, kind: 'tree' } as any);
    const wall = core.phys.addSolid(s, { x: p.x + 360, y: p.y - 60, w: 16, h: 120, kind: 'wall', sub: 'brick' } as any);
    expect(bosses.smash(s, car.x + 10, car.y + 10, 30)).toBe(1);
    expect(car.solid).toBe(false);                               // flattened wreck you can walk over
    expect(bosses.smash(s, tree.x + 11, tree.y + 11, 30)).toBe(1);
    expect(s.grid.query(tree.x, tree.y, 22, 22).includes(tree)).toBe(false);
    expect(bosses.smash(s, wall.x + 8, wall.y + 60, 40)).toBe(0);
    expect(s.grid.query(wall.x, wall.y, 16, 120).includes(wall)).toBe(true);
  });

  it('rage: below half health a boss moves faster and says so once', () => {
    const s = arena();
    const z = spawn(s, 'butcher', 420) as BossZ & { baseSpeed: number; raged?: boolean };
    run(s, 2);
    const calm = z.speed;
    z.hp = z.maxHp * 0.4; run(s, 2);
    expect(z.raged).toBe(true);
    expect(z.speed).toBeGreaterThan(calm * 1.2);
  });

  it('a return match has double health and 2.5x damage', () => {
    const s = arena();
    const first = spawn(s, 'butcher', 400), again = spawn(s, 'butcher', -400, { hpBoost: 2, dmgMul: 2.5 });
    expect(again.maxHp).toBe(first.maxHp * 2);
    expect(again.damage).toBeCloseTo(first.damage * 2.5, 5);
  });

  it('the Butcher throws cleavers and the Juggernaut opens a quake line (the second specials)', () => {
    const s = arena();
    const b = spawn(s, 'butcher', 420) as BossZ; b.cd.charge = 99; b.cd.throw = 0;
    let cleavers = false;
    for (let i = 0; i < 12; i++) { run(s, 6); cleavers ||= bosses.fx(s).shots.some(x => x.kind === 'cleaver'); }
    expect(cleavers).toBe(true);
    for (const z of s.zombies) z.dead = true; s.zombies.length = 0; bosses.clearFx(s);
    const j = spawn(s, 'juggernaut', 500) as BossZ; j.cd.slam = 99; j.cd.boulder = 99; j.cd.quake = 0;
    let rocks = 0;
    for (let i = 0; i < 12; i++) { run(s, 6); rocks = Math.max(rocks, bosses.fx(s).shots.filter(x => x.kind === 'rock').length); }   // the eruptions land in sequence
    expect(rocks).toBeGreaterThanOrEqual(5);
  });

  it('the Howler chains pounces and the Brood Mother rains acid', () => {
    const s = arena();
    const h = spawn(s, 'howler', 300) as BossZ; h.cd.scream = 99; h.cd.leap = 99; h.cd.pounce = 0;
    const x0 = h.x; run(s, 120);
    expect(Math.abs(h.x - x0)).toBeGreaterThan(100);
    expect(bosses.fx(s).rings.length + s.zombies.length).toBeGreaterThan(0);
    for (const z of s.zombies) z.dead = true; s.zombies.length = 0; bosses.clearFx(s);
    const m = spawn(s, 'broodmother', 400) as BossZ; m.cd.brood = 99; m.cd.acid = 99; m.cd.rain = 0;
    run(s, 10);
    expect(bosses.fx(s).shots.filter(x => x.kind === 'acid').length).toBeGreaterThanOrEqual(6);
  });

  it('the Warden is huge, pursues faster than the Juggernaut, and escalates through four stages', () => {
    const s = arena();
    const w = spawn(s, 'warden', 700, { maxR: 60 }) as BossZ & { stage: number; drawR?: number; baseSpeed: number };
    expect(w.maxHp).toBeGreaterThanOrEqual(bosses.BOSSES.juggernaut.hp * 4);
    expect(w.drawR!).toBeGreaterThanOrEqual(bosses.BOSSES.juggernaut.r * 3);
    expect(w.baseSpeed).toBeGreaterThan(bosses.BOSSES.juggernaut.speed);
    run(s, 2); const s0 = w.speed;
    w.hp = w.maxHp * 0.7; run(s, 2); expect(w.stage).toBe(1);
    w.hp = w.maxHp * 0.45; run(s, 2); expect(w.stage).toBe(2); expect(w.speed).toBeGreaterThan(s0 * 1.3);
    w.hp = w.maxHp * 0.2; run(s, 2); expect(w.stage).toBe(3);
    expect(s.zombies.filter(z => !z.dead && !z.boss).length).toBeGreaterThan(0);   // stage minions
  });

  it('zombies climb through windows (and break the glass), the player cannot', () => {
    const s = road.newRoad(); s.ui = null; run(s, 1);
    s.dev = { timeScale: 1, freeze: false, god: true };
    const haven = s.road!.world.sites.haven!;
    const b = s.buildings.find(x => x.x === haven.x && x.y === haven.y)!;
    const win = s.grid.query(b.x - 4, b.y - 4, b.w + 8, b.h + 8).find(o => o.kind === 'window' && (o.y <= b.y + 2 || o.y + o.h >= b.y + b.h - 2))!;   // a window on the north or south wall
    expect(win).toBeTruthy();
    const north = win.y <= b.y + 2, cx = win.x + win.w / 2, cy = win.y + win.h / 2;
    const inside = { x: cx, y: north ? cy + 70 : cy - 70 }, outside = { x: cx, y: north ? cy - 70 : cy + 70 };
    expect(core.phys.isFree(s, inside.x, inside.y, 14)).toBe(true);
    teleport(s, inside); s.zombies.length = 0;
    const zom = zombies.spawn(s, 'walker', outside.x, outside.y, true);
    run(s, 900);
    expect((win as any).smashed).toBe(true);
    expect(win.blocksBullets).toBe(false);
    expect(Math.hypot(zom.x - s.player.x, zom.y - s.player.y)).toBeLessThan(60);
    // the player is still stopped by the pane
    teleport(s, inside); s.player.y += north ? -60 : 60; core.phys.collideCircle(s, s.player);
    expect(north ? s.player.y > cy : s.player.y < cy).toBe(true);
  });
});
