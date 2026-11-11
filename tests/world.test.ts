import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as core from '../src/sim/core';
import * as world from '../src/sim/world';
import type { Container, GameState } from '../src/sim/types';

function reachable(s: GameState, c: Container) {
  // Sample the same free standing positions used by the legacy headless reach check.
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  for (let r = 16; r < 70; r += 6) for (let a = 0; a < Math.PI * 2; a += 0.15) {
    const x = cx + Math.cos(a) * (c.w / 2 + r), y = cy + Math.sin(a) * (c.h / 2 + r);
    const d = Math.hypot(x - core.clamp(x, c.x, c.x + c.w), y - core.clamp(y, c.y, c.y + c.h));
    if (d < 70 && core.phys.isFree(s, x, y, 14) && core.phys.canReach(s, x, y, c)) return true;
  }
  return false;
}
describe('world', () => {
  it('preserves the legacy layout and container IDs exactly', () => {
    const s = core.newState(12345), legacy = core.newState(12345);
    const sv = { ...core } as typeof core & { world: typeof world };
    runInNewContext(readFileSync(new URL('../legacy/js/sv/sv-world.js', import.meta.url), 'utf8'), { window: { Z: { sv } }, console });
    sv.world.generate(legacy);
    world.generate(s);
    const buildings = (state: GameState) => state.buildings.map(b => [b.id, b.x, b.y, b.w, b.h, b.kind, b.tier, b.name]);
    const containers = (state: GameState) => state.containers.map(c => [c.id, c.x, c.y, c.w, c.h, c.kind, c.tier, c.buildingId]);
    expect(buildings(s)).toEqual(buildings(legacy));
    expect(containers(s)).toEqual(containers(legacy));
    expect(s.spawnPoint).toEqual(legacy.spawnPoint);
  });
  it('is deterministic including visual metadata, and generates in less than 1.5s', () => {
    const a = core.newState(8675309), b = core.newState(8675309);
    const start = performance.now(); world.generate(a);
    expect(performance.now() - start).toBeLessThan(1500);
    world.generate(b);
    expect(a.buildings.length).toBeGreaterThan(50);
    expect(a.buildings).toEqual(b.buildings);
    expect(a.containers.length).toBe(b.containers.length);
    expect(a.containers.slice(0, 20).map(c => c.id)).toEqual(b.containers.slice(0, 20).map(c => c.id));
    expect(a.decor).toEqual(b.decor);
    const visuals = (s: GameState) => s.grid.all().map(o => [o.x, o.y, o.kind, o.sub, o.vseed, o.orient, o.buildingId]);
    expect(visuals(a)).toEqual(visuals(b));
    expect(a.rngState).toBe(core.newState(8675309).rngState);
  });
  it.each([1, 12345, 8675309])('makes every container reachable and the spawn free (seed %i)', seed => {
    const s = core.newState(seed); world.generate(s);
    expect(s.containers.filter(c => !reachable(s, c)).map(c => ({ id: c.id, kind: c.kind, buildingId: c.buildingId }))).toEqual([]);
    expect(core.phys.isFree(s, s.spawnPoint.x, s.spawnPoint.y, 14)).toBe(true);
    for (const solid of s.grid.all()) {
      expect(solid.sub).toBeTruthy(); expect(Number.isInteger(solid.vseed)).toBe(true);
      expect(solid.orient).toBe(solid.w >= solid.h ? 0 : 1); expect(solid.buildingId).not.toBeUndefined();
    }
    for (const b of s.buildings) {
      expect(world.buildingAt(s, b.x + b.w / 2, b.y + b.h / 2)?.id).toBe(b.id);
      expect(['wood', 'tile', 'carpet', 'concrete', 'linoleum', 'military']).toContain(b.floor);
      expect(['shingle_red', 'shingle_grey', 'shingle_brown', 'flat_gravel', 'flat_tar', 'metal']).toContain(b.roof);
      expect(['brick', 'concrete', 'siding', 'military']).toContain(b.wall);
    }
  }, 15000);
  it('uses runtime RNG for reproducible random spawn queries', () => {
    const a = core.newState(5), b = core.newState(5);
    const point = world.randomSpawnPoint(a, 8000, 8000, 750, 1550);
    expect(point).toEqual(world.randomSpawnPoint(b, 8000, 8000, 750, 1550));
    expect(point && core.phys.isFree(a, point.x, point.y, 18)).toBe(true);
  });
});
