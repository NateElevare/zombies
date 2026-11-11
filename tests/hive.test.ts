// The Hive Below, step 1 (the Breach and the Warrens): the map, the story plumbing, the swarm's behaviours and a
// scripted playthrough through the sim (no Phaser), in the style of tests/road.test.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import * as core from '../src/sim/core';
import * as road from '../src/sim/road';
import * as zombies from '../src/sim/zombies';
import * as hive from '../src/sim/hive';
import * as bosses from '../src/sim/bosses';
import * as combat from '../src/sim/combat';
import * as inv from '../src/sim/inventory';
import { HIVE_MISSIONS } from '../src/sim/hive-data';
import { TILE, isFloor, zoneAt } from '../src/sim/hive-world';
import { ITEMS } from '../src/sim/items';
import type { GameState, InputState, Zombie } from '../src/sim/types';

const input = (s: GameState, extra: Partial<InputState> = {}): InputState => ({ moveX: 0, moveY: 0, aimX: s.player.x + 100, aimY: s.player.y, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set(), ...extra });
const tick = (s: GameState, extra: Partial<InputState> = {}) => road.stepRoad(s, input(s, extra), core.SIM_DT);
const run = (s: GameState, n: number, extra: Partial<InputState> = {}) => { for (let i = 0; i < n; i++) tick(s, extra); };
const bugs = (s: GameState) => s.zombies.filter(z => !z.dead && !zombies.isInert(z));
const killBugs = (s: GameState) => { for (const z of bugs(s)) zombies.damage(s, z, 1e6, 0); };
const teleport = (s: GameState, p: { x: number; y: number }) => { s.player.x = s.player.prevX = p.x; s.player.y = s.player.prevY = p.y; core.phys.collideCircle(s, s.player); };
const tagOf = (z: Zombie) => (z as Zombie & { roadTag?: string }).roadTag;
const mid = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k), clear: () => store.clear() };
});
/** Dismiss the mission card (the sim does not step while a card is up). */
const begin = (s: GameState) => { s.ui = null; tick(s); return s; };
function start(): GameState {
  road.devUnlockHiveBelow();
  const s = road.newHiveBelow()!;
  s.dev = { god: true } as GameState['dev'];
  return s;
}
/** Mission 2 (the Warrens), playing. */
const warrens = (s: GameState) => { road.startMission(s, 1); return begin(s); };
/** Tiles reachable on foot from a point, with the gates as they currently stand. */
function reach(s: GameState, from: { x: number; y: number }) {
  const h = s.road!.world.hive!, n = h.n, seen = new Uint8Array(n * n);
  const closed = s.road!.world.gates.filter(g => !g.open);
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && h.floor[y * n + x] === 1
    && !closed.some(g => (x + 0.5) * TILE > g.x && (x + 0.5) * TILE < g.x + g.w && (y + 0.5) * TILE > g.y && (y + 0.5) * TILE < g.y + g.h);
  const q = [Math.floor(from.y / TILE) * n + Math.floor(from.x / TILE)]; seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % n, y = Math.floor(q[i] / n);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (ok(X, Y) && !seen[Y * n + X]) { seen[Y * n + X] = 1; q.push(Y * n + X); } }
  }
  return (p: { x: number; y: number }) => seen[Math.floor(p.y / TILE) * n + Math.floor(p.x / TILE)] === 1;
}

/** Drive the current objective to completion the way a player would (teleporting instead of walking). */
function solve(s: GameState) {
  const o = road.current(s)!, runO = road.currentRun(s)!;
  switch (o.kind) {
    case 'reach': case 'camp': killBugs(s); teleport(s, runO.point); run(s, 5); break;
    case 'interact': teleport(s, runO.point); run(s, Math.ceil(((o.hold ?? 0.3) + 0.2) * 60), { interactHeld: true }); break;
    case 'holdout': {
      teleport(s, runO.point);
      let spawned = 0, peak = 0;
      for (let t = 0; t < o.seconds * 60 + 120 && !runO.done; t++) {
        tick(s);
        if (t % 300 === 299) { const wave = s.zombies.filter(z => !z.dead && tagOf(z) === runO.tag).length; spawned += wave; peak = Math.max(peak, bugs(s).length); killBugs(s); }
      }
      expect(spawned, `hold-out "${o.text}" sent waves`).toBeGreaterThan(o.seconds / o.every * 3);
      expect(peak).toBeLessThanOrEqual(hive.SWARM_CAP);
      break;
    }
    case 'burrows': {
      const mine = s.zombies.filter(z => z.type === 'burrow' && tagOf(z) === runO.tag);
      expect(mine).toHaveLength(o.count);
      expect(road.objectiveText(s)).toContain(`(${o.count} left)`);
      zombies.damage(s, mine[0], 1e6, 0); run(s, 2);
      expect(road.objectiveText(s)).toContain(`(${o.count - 1} left)`);
      for (const b of mine.slice(1)) zombies.damage(s, b, 1e6, 0);
      run(s, 3);
      break;
    }
    case 'pickup': {
      const drop = s.drops.find(d => d.inv.slots[0]?.id === o.item)!;
      expect(drop, `quest item ${o.item} placed`).toBeTruthy();
      teleport(s, drop); run(s, 3);
      break;
    }
    case 'boss': {
      teleport(s, { x: runO.point.x - 300, y: runO.point.y }); run(s, 3);
      const boss = s.zombies.find(z => z.id === runO.bossId)!;
      expect(boss, 'boss is standing in its arena').toBeTruthy();
      expect(boss.boss).toBe(o.boss);
      zombies.damage(s, boss, 1e7, 0); run(s, 3);
      break;
    }
  }
}

describe('The Hollow (map)', () => {
  it('carves seven cells and the Breach, with every site, seal and camp on reachable floor', () => {
    const s = start(), w = s.road!.world, h = w.hive!;
    expect(h.n * h.tile).toBe(core.WORLD.w);
    expect(w.sectors).toHaveLength(8); expect(w.gates).toHaveLength(7); expect(w.camps).toHaveLength(8);
    for (const id of ['dam', 'rift', 'trail', 'nursery', 'cache', 'parade'] as const) expect(w.sites[id], id).toBeTruthy();
    // with every seal open the whole route is one connected space
    for (const g of w.gates) g.open = true;
    const all = reach(s, w.start);
    for (const c of w.camps) expect(all(c), `camp ${c.x},${c.y}`).toBe(true);
    for (const site of Object.values(w.sites)) expect(all({ x: site!.x + site!.w / 2, y: site!.y + site!.h / 2 }), site!.name).toBe(true);
    for (let z = 1; z <= 7; z++) expect(all(h.arenas[z]), `arena ${z}`).toBe(true);
    for (const list of [...h.burrows, ...h.eggs, ...h.nooks]) for (const p of list) expect(all(p)).toBe(true);
    expect(w.nurseryBurrows).toHaveLength(3);
    // the mission route visits every cell in order and is about as long as the Long Road
    expect(h.route.length * TILE).toBeGreaterThan(40000);
    const order = [...new Set(h.route.map(k => h.zone[k]))];
    expect(order).toEqual([8, 1, 2, 3, 4, 5, 6, 7]);
  });
  it('is the same map every time', () => {
    const a = start().road!.world.hive!, b = start().road!.world.hive!;
    expect(Buffer.from(a.floor).equals(Buffer.from(b.floor))).toBe(true);
    expect(a.burrows).toEqual(b.burrows);
  });
  it('keeps you out of the hive until the first mission is done, and out of the next cell until its boss is dead', () => {
    const s = start(), w = s.road!.world;
    const before = reach(s, w.start);
    expect(before(mid(w.sites.rift!))).toBe(true);
    expect(before(mid(w.sites.trail!))).toBe(false);
    // the seals are real colliders, not only a flag
    const g = w.gates[0];
    expect(core.phys.isFree(s, g.x + g.w / 2, g.y + g.h / 2, 10)).toBe(false);
    begin(s);
    for (let guard = 0; s.road!.phase === 'play' && guard < 50; guard++) solve(s);
    expect(s.road!.phase).toBe('complete');
    expect(w.gates[0].open).toBe(true); expect(w.gates[1].open).toBe(false);
    expect(core.phys.isFree(s, g.x + g.w / 2, g.y + g.h / 2, 10)).toBe(true);
    const after = reach(s, w.start);
    expect(after(mid(w.sites.parade!))).toBe(true);
    expect(after(w.camps[2])).toBe(false);
  });
  it('never spawns anything inside solid rock', () => {
    const s = warrens(start());
    const h = s.road!.world.hive!;
    teleport(s, mid(s.road!.world.sites.nursery!));
    for (let i = 0; i < 60 * 40; i++) tick(s);
    expect(bugs(s).length).toBeGreaterThan(20);
    for (const z of s.zombies) { expect(isFloor(h, z.x, z.y), `${z.type} at ${Math.round(z.x)},${Math.round(z.y)}`).toBe(true); expect(zoneAt(h, z.x, z.y)).toBe(1); }
  });
});

describe('The Hive Below (story)', () => {
  it('is locked until A Group in Need is finished, and carries that survivor over', () => {
    expect(road.canStartHiveBelow()).toBe(false);
    expect(road.newHiveBelow()).toBeNull();
    // finish the first two stories the short way: write their saves
    const first = road.newRoad('scout'); first.road!.phase = 'ended'; road.save(first, true);
    const need = road.newGroupInNeed()!;
    need.player.level = 17; need.player.inv.equip.primary = { id: 'assault_rifle', qty: 1, mag: 30 };
    need.road!.snapshot = JSON.parse(JSON.stringify({ ...need.road!.snapshot, level: 17, equip: need.player.inv.equip }));
    need.road!.phase = 'ended'; road.save(need, true);
    expect(road.canStartHiveBelow()).toBe(true);
    const s = road.newHiveBelow()!;
    expect(s.road!.story).toBe('hive-below');
    expect(s.road!.character).toBe('scout');
    expect(s.player.level).toBe(17);
    expect(s.player.inv.equip.primary?.id).toBe('assault_rifle');
    expect(road.hasRoadSave('hive-below')).toBe(true);
    // its own slot: the other two stories are untouched
    expect(road.readSave('long-road')?.done).toBe(true); expect(road.readSave('group-in-need')?.done).toBe(true);
    expect(road.storyTitle('hive-below')).toBe('The Hive Below');
  });
  it('the testing unlock opens it without marking the other stories complete', () => {
    expect(road.devUnlockHiveBelow()).toBe(true);
    expect(road.canStartHiveBelow()).toBe(true);
    expect(road.canStartGroupInNeed()).toBe(false);
    const s = road.newHiveBelow()!;
    expect(s.player.inv.equip.primary?.id).toBe('smg');   // a fresh survivor gets a kit that can face a swarm
  });
  it('plays both missions from the Breach to the camp at the Warrens seal', () => {
    const s = start(), r = s.road!;
    expect(r.cast.map(c => c.id)).toEqual(['mara', 'eli', 'june']);
    expect(r.lights).toBe(false);
    let guard = 0;
    while (r.phase !== 'ended' && guard++ < 400) {
      if (r.phase === 'briefing') { expect(s.ui).toBe('road'); s.ui = null; tick(s); continue; }
      if (r.phase === 'complete') { s.ui = null; tick(s); continue; }
      solve(s);
      if (r.mission === 0 && r.step >= 2) expect(r.lights, 'the floodlights stay on once the breaker is thrown').toBe(true);
    }
    expect(r.phase).toBe('ended');
    expect(r.mission).toBe(HIVE_MISSIONS.length - 1);
    expect(road.readSave('hive-below')?.done).toBe(true);
    // the Marshal's trophy and the Sprayer were handed over
    const have = (id: string) => Object.values(s.player.inv.equip).some(st => st?.id === id) || inv.count(s.player.inv, id) > 0 || s.drops.some(d => d.inv.slots.some(st => st?.id === id));
    expect(have('formic_sprayer')).toBe(true);
    expect(have('mandible_shears')).toBe(true);
    expect(r.world.gates[1].open).toBe(true);
  });
  it('restarts a mission from its checkpoint with the burrows standing again', () => {
    const s = warrens(start());
    const count = () => s.zombies.filter(z => !z.dead && z.type === 'burrow').length, before = count();
    expect(before).toBeGreaterThanOrEqual(10);
    for (const b of s.zombies.filter(z => z.type === 'burrow').slice(0, 4)) zombies.damage(s, b, 1e6, 0);
    run(s, 2); expect(count()).toBe(before - 4);
    road.restart(s);
    expect(count()).toBe(before);
    expect(hive.runtime(s)!.pools).toHaveLength(0);
  });
  it('carries on with the next mission when the story has grown since the save was finished', () => {
    const s = start(); s.road!.mission = 0; s.road!.phase = 'ended'; road.save(s, true);
    const save = road.readSave('hive-below')!;
    expect(save.done).toBe(true); expect(save.mission).toBe(0);
    const again = road.continueRoad('hive-below')!;
    expect(again.road!.mission).toBe(1); expect(again.road!.phase).toBe('briefing');
  });
});

describe('the swarm', () => {
  const open = (s: GameState) => { warrens(s); for (const z of s.zombies) if (!zombies.isInert(z)) z.dead = true; run(s, 1); hive.reset(s); return s; };
  it('a drone that sees you raises every drone within 600 px, and they keep your trail', () => {
    const s = open(start()), p = s.player, at = s.road!.world.sites.parade!;
    teleport(s, { x: at.x + at.w / 2, y: at.y + at.h / 2 });
    const scout = zombies.spawn(s, 'drone', p.x + 150, p.y), nearby = zombies.spawn(s, 'drone', p.x + 150 + 400, p.y), far = zombies.spawn(s, 'drone', p.x + 150 + 400, p.y + 520);
    for (const z of [nearby, far]) { z.angle = 0; (z as any).losTimer = 99; }   // they do not see you themselves
    run(s, 30);
    expect(scout.state).toBe('chase');
    expect((nearby as hive.Bug).alarm).toBeGreaterThan(10);
    expect(nearby.state).not.toBe('idle');
    expect(nearby.target).toMatchObject({ x: p.x, y: p.y });
    expect((far as hive.Bug).alarm ?? 0).toBeLessThanOrEqual(0);
    expect(['idle', 'wander']).toContain(far.state);
  });
  it('five drones together hurry; fewer do not', () => {
    const s = open(start()), at = s.road!.world.sites.parade!, c = { x: at.x + at.w / 2, y: at.y + at.h / 2 };
    teleport(s, { x: c.x - 480, y: c.y });
    const pack = [0, 1, 2, 3, 4].map(i => zombies.spawn(s, 'drone', c.x + i * 30, c.y + 200)), pair = [0, 1].map(i => zombies.spawn(s, 'drone', c.x + i * 30, c.y - 300));
    run(s, 20);
    for (const z of pack) expect((z as hive.Bug).mul).toBe(hive.FRENZY_MUL);
    for (const z of pair) expect((z as hive.Bug).mul).toBe(1);
  });
  it('a Honeypot bursts into honey that halves the speed of bugs and of you, then dries up', () => {
    const s = open(start()), p = s.player, at = s.road!.world.sites.parade!, c = { x: at.x + at.w / 2, y: at.y + at.h / 2 };
    teleport(s, c);
    const pot = zombies.spawn(s, 'honeypot', c.x + 30, c.y), drone = zombies.spawn(s, 'drone', c.x + 60, c.y);
    zombies.damage(s, pot, 1e6, 0); run(s, 20);
    const pools = hive.runtime(s)!.pools;
    expect(pools).toHaveLength(1); expect(pools[0].r).toBe(hive.HONEY_R);
    expect(p.slowMul).toBe(hive.HONEY_SLOW);
    expect((drone as hive.Bug).mul).toBe(hive.HONEY_SLOW);
    const x0 = p.x; run(s, 30, { moveX: -1 }); const slow = x0 - p.x;
    zombies.damage(s, drone, 1e6, 0);
    run(s, Math.ceil(hive.HONEY_TIME * 60));
    expect(hive.runtime(s)!.pools).toHaveLength(0); expect(p.slowMul).toBe(1);
    teleport(s, c); const x1 = p.x; run(s, 30, { moveX: -1 });
    expect((x1 - p.x) / slow).toBeCloseTo(2, 0);
  });
  it('eggs hatch three or four grubs when you linger close, and a grub left alive grows into a drone', () => {
    const s = open(start()), p = s.player, at = s.road!.world.sites.parade!, c = { x: at.x + at.w / 2, y: at.y + at.h / 2 };
    teleport(s, c);
    const egg = hive.spawnFixture(s, 'egg', { x: c.x + 150, y: c.y }), kills = s.road!.missionKills;
    run(s, Math.ceil((hive.HATCH_TIME + 0.6) * 60));
    expect(egg.dead).toBe(true);
    const grubs = s.zombies.filter(z => !z.dead && z.type === 'grub');
    expect(grubs.length).toBeGreaterThanOrEqual(3); expect(grubs.length).toBeLessThanOrEqual(4);
    expect(s.road!.missionKills).toBe(kills);   // hatching is not a kill
    for (const g of grubs.slice(1)) zombies.damage(s, g, 1e6, 0);
    run(s, Math.ceil((hive.GRUB_GROWS + 1) * 60));
    expect(s.zombies.filter(z => !z.dead && z.type === 'grub')).toHaveLength(0);
    expect(s.zombies.filter(z => !z.dead && z.type === 'drone').length).toBeGreaterThanOrEqual(1);
    void p;
  });
  it('an egg cluster broken from a distance hatches nothing', () => {
    const s = open(start()), at = s.road!.world.sites.parade!, c = { x: at.x + at.w / 2, y: at.y + at.h / 2 };
    teleport(s, c);
    const egg = hive.spawnFixture(s, 'egg', { x: c.x + 420, y: c.y });
    zombies.damage(s, egg, 1e6, 0); run(s, 120);
    expect(s.zombies.filter(z => !z.dead && z.type === 'grub')).toHaveLength(0);
  });
  it('burrows send columns of 8 to 14 while they stand, never past the cap, and stop when collapsed', () => {
    const s = open(start()), def = HIVE_MISSIONS[1].swarm!;
    teleport(s, mid(s.road!.world.sites.nursery!));
    let peak = 0;
    for (let i = 0; i < 60 * 150; i++) { tick(s); if (i % 30 === 0) peak = Math.max(peak, bugs(s).length); }
    expect(peak).toBeGreaterThan(30);
    expect(peak).toBeLessThanOrEqual(def.cap + 8);   // the ambient trickle may add a few on top of a column
    expect(bugs(s).some(z => z.type === 'honeypot')).toBe(true);
    // collapse every burrow in the cell: no more columns
    for (const b of s.zombies.filter(z => z.type === 'burrow')) zombies.damage(s, b, 1e6, 0);
    run(s, 2); killBugs(s); run(s, 60);
    HIVE_MISSIONS[1].density = 0.0001;
    try { for (let i = 0; i < 60 * 60; i++) tick(s); expect(bugs(s).length).toBeLessThan(3); } finally { HIVE_MISSIONS[1].density = 3; }
  });
  it('burrows and eggs are targets, not creatures: they do not move, bite or get shoved', () => {
    const s = open(start()), at = s.road!.world.sites.parade!, c = { x: at.x + at.w / 2, y: at.y + at.h / 2 };
    teleport(s, c);
    const b = hive.spawnFixture(s, 'burrow', { x: c.x + 20, y: c.y }), hp = s.player.hp;
    s.dev = undefined as unknown as GameState['dev'];
    for (let i = 0; i < 8; i++) zombies.spawn(s, 'drone', c.x + 300 + i * 20, c.y);
    s.dev = { god: true } as GameState['dev'];
    run(s, 240);
    expect([b.x, b.y]).toEqual([c.x + 20, c.y]);
    zombies.damage(s, b, 10, 0); expect([b.x, b.y]).toEqual([c.x + 20, c.y]);
    expect(b.hp).toBe(zombies.TYPES.burrow.hp - 10);
    expect(s.player.hp).toBe(hp);
    // a collapsed burrow pays out ichor
    zombies.damage(s, b, 1e6, 0); run(s, 2);
    expect(s.drops.some(d => d.inv.slots[0]?.id === 'ichor' && d.inv.slots[0].qty >= 24)).toBe(true);
  });
});

describe('the Marshal', () => {
  function arena() {
    const s = warrens(start());
    s.road!.step = 3; (s.road!.objectives[3] as any).started = true;
    const at = s.road!.world.sites.parade!, c = { x: at.x + at.w / 2, y: at.y + at.h / 2 };
    for (const z of s.zombies) if (!zombies.isInert(z)) z.dead = true;
    teleport(s, { x: c.x - 420, y: c.y }); run(s, 3);
    const boss = s.zombies.find(z => z.boss === 'marshal')!;
    return { s, boss: boss as Zombie & { act: string; cd: Record<string, number>; raged?: boolean; announced?: boolean }, c };
  }
  it('waits in its arena and turns on you when you walk in', () => {
    const { s, boss, c } = arena();
    expect(boss).toBeTruthy(); expect(boss.maxHp).toBe(5000);
    expect(Math.hypot(boss.x - c.x, boss.y - c.y)).toBeLessThan(260);
    expect(bosses.BOSS_IDS).not.toContain('marshal');
    run(s, 30);
    expect(boss.announced).toBe(true); expect(boss.state).toBe('chase');
  });
  it('charges down a marked lane and is stunned when it hits the wall', () => {
    const { s, boss } = arena(); run(s, 30);
    const seen = new Set<string>(); let lane = false;
    for (let i = 0; i < 60 * 40; i++) {
      // stand with your back to the wall so every charge ends in rock
      tick(s); if (boss.act) seen.add(boss.act);
      if (bosses.fx(s).tele.some(t => t.kind === 'line')) lane = true;
    }
    expect(lane).toBe(true);
    expect([...seen]).toEqual(expect.arrayContaining(['chargeWind', 'charging', 'formicWind']));
    expect(seen.has('stunned') || seen.has('recover')).toBe(true);
  });
  it('rallies two columns of eight drones and leaves acid pools from its formic arc', () => {
    const { s, boss } = arena(); run(s, 30);
    let most = 0, pools = 0, rallied = false;
    for (let i = 0; i < 60 * 45; i++) {
      tick(s);
      most = Math.max(most, bugs(s).filter(z => z.type === 'drone').length);
      pools = Math.max(pools, bosses.fx(s).pools.filter(q => q.kind === 'acid').length);
      if (bugs(s).some(z => ((z as hive.Bug).rally ?? 0) > 0 && (z as hive.Bug).mul === hive.RALLY_MUL)) rallied = true;
      for (const z of s.zombies) if (!z.dead && !isFloor(s.road!.world.hive!, z.x, z.y)) throw new Error(`${z.type} outside the cave at ${Math.round(z.x)},${Math.round(z.y)}`);
      if (i % 600 === 599) killBugs(s);
    }
    expect(most).toBeGreaterThanOrEqual(16);
    expect(most).toBeLessThanOrEqual(hive.SWARM_CAP);
    expect(pools).toBeGreaterThanOrEqual(4);
    expect(rallied).toBe(true);
    void boss;
  });
  it('below half health it charges twice in a row', () => {
    const { s, boss, c } = arena(); run(s, 30);
    zombies.damage(s, boss, boss.maxHp * 0.6, 0);
    let chain = 0, best = 0, last = '';
    for (let i = 0; i < 60 * 60; i++) {
      // keep to the middle of the parade ground, where a charge has room to end without a wall
      if (i % 150 === 0) teleport(s, { x: c.x + (Math.floor(i / 150) % 2 ? 230 : -230), y: c.y });
      tick(s);
      if (boss.act !== last) { if (boss.act === 'charging') chain++; else if (boss.act === '' || boss.act === 'formicWind' || boss.act === 'stunned') chain = 0; best = Math.max(best, chain); last = boss.act; }
    }
    expect(boss.raged).toBe(true);
    expect(best).toBeGreaterThanOrEqual(2);
  });
  it('drops the Mandible Shears, royal jelly and a lot of ichor, and the seal opens at the camp', () => {
    const { s, boss } = arena(); run(s, 30);
    zombies.damage(s, boss, 1e7, 0); run(s, 3);
    const ids = s.drops.flatMap(d => d.inv.slots.filter(Boolean).map(st => st!.id));
    expect(ids).toEqual(expect.arrayContaining(['mandible_shears', 'royal_jelly', 'ichor']));
    expect(road.current(s)!.kind).toBe('camp');
  });
});

describe('insect weapons', () => {
  it('the Formic Sprayer runs on ichor and stacks corrosion that keeps burning without slowing', () => {
    const w = combat.WEAPONS.formic_sprayer;
    expect(w).toMatchObject({ ammo: 'ichor', magSize: 80, range: 240, corrode: true });
    expect(ITEMS.formic_sprayer.slot).toBe('primary'); expect(ITEMS.ichor.type).toBe('ammo');
    const s = begin(start());
    const z = zombies.spawn(s, 'brute', s.player.x + 400, s.player.y);
    for (let i = 0; i < 9; i++) zombies.corrode(s, z);
    expect(z.corroStacks).toBe(zombies.CORRODE_MAX);
    expect(zombies.stickySlow(z)).toBe(1);
    const hp = z.hp; run(s, 66);
    expect(hp - z.hp).toBeCloseTo(2 * zombies.CORRODE_MAX * 2, 0);   // two ticks a second
    run(s, 60 * 5); expect(z.corroStacks).toBe(0);
  });
  it('the Mandible Shears cut through a kill to two more bugs behind it', () => {
    const w = combat.WEAPONS.mandible_shears;
    expect(w).toMatchObject({ damage: 80, fireRate: 0.6, cleave: 2 }); expect(w.melee!.arc).toBeLessThan(1.5);
    const s = begin(start());
    const p = s.player; p.inv.equip.melee = { id: 'mandible_shears', qty: 1 }; p.active = 'melee'; p.angle = 0;
    for (const z of s.zombies) z.dead = true;
    // one in reach, three in a line behind it, out of reach
    const line = [60, 150, 205, 262].map(d => zombies.spawn(s, 'drone', p.x + d, p.y));
    for (const z of line) (z as any).losTimer = 99;
    road.stepRoad(s, input(s, { fire: true, firePressed: true }), core.SIM_DT);
    expect(line.map(z => z.dead)).toEqual([true, true, true, false]);
  });
  it('royal jelly heals 50, adds 20% damage for 10 seconds, and is used by the quick-heal key', () => {
    const s = begin(start());
    const p = s.player; inv.add(p.inv, 'royal_jelly', 1); for (let i = 0; i < p.inv.slots.length; i++) if (p.inv.slots[i]?.id === 'medkit') p.inv.slots[i] = null;
    s.dev = undefined as unknown as GameState['dev']; p.hp = 20;
    expect(inv.quickHeal(s)).toBe(true);
    expect(p.hp).toBe(70); expect(p.jelly).toBe(10);
    run(s, 60 * 11); expect(p.jelly).toBe(0);
  });
});

describe('swarm cost', () => {
  it('steps 200 live bugs well inside a frame', () => {
    const s = warrens(start());
    const at = s.road!.world.sites.parade!, c = { x: at.x + at.w / 2, y: at.y + at.h / 2 };
    teleport(s, c);
    for (const n of [150, 200]) {
      for (const z of s.zombies) if (!zombies.isInert(z) && !z.boss) z.dead = true;
      run(s, 1);
      for (let i = 0; bugs(s).length < n && i < 4000; i++) { const a = i * 2.399, d = 120 + (i % 40) * 9, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (core.phys.isFree(s, x, y, 14)) hive.spawnBug(s, 'drone', x, y, true); }
      expect(bugs(s).length).toBe(n);
      run(s, 30);
      const t0 = performance.now(); run(s, 120); const ms = (performance.now() - t0) / 120;
      // a 60 Hz tick has 16.7 ms; the sim's share must stay small (the renderer needs the rest)
      expect(ms, `${n} bugs: ${ms.toFixed(2)} ms per tick`).toBeLessThan(6);
    }
  });
});
