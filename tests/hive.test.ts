// The Hive Below, step 1 (the Breach and the Warrens): the map, the story plumbing, the swarm's behaviours and a
// scripted playthrough through the sim (no Phaser), in the style of tests/road.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
// whole missions are simulated here: on a busy machine a case can take longer than vitest's five seconds
vi.setConfig({ testTimeout: 60_000 });
import * as core from '../src/sim/core';
import * as road from '../src/sim/road';
import * as zombies from '../src/sim/zombies';
import * as hive from '../src/sim/hive';
import * as bosses from '../src/sim/bosses';
import * as combat from '../src/sim/combat';
import * as inv from '../src/sim/inventory';
import * as progression from '../src/sim/progression';
import { HIVE_MISSIONS } from '../src/sim/hive-data';
import * as kit from '../src/sim/hive-kit';
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
    case 'reach': killBugs(s); teleport(s, runO.point); run(s, 5); break;
    case 'camp':
      killBugs(s); teleport(s, runO.point); run(s, 5);
      if (o.rest) { expect(runO.done, 'a camp with a lockbox waits for you to rest').toBe(false); run(s, 90, { interactHeld: true }); }
      break;
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
      // the tail of the last column is still climbing out: let it come up, and finish it
      for (let k = 0; k < 8 && (hive.runtime(s)!.columns.length || bugs(s).length); k++) { run(s, 60); killBugs(s); }
      expect(hive.runtime(s)!.columns).toHaveLength(0);
      break;
    }
    case 'clear': {
      teleport(s, runO.point); run(s, 3);
      const mine = s.zombies.filter(z => !z.dead && tagOf(z) === runO.tag);
      expect(mine.length, `"${o.text}" put its targets on the map`).toBe(o.count);
      for (const z of mine) expect(isFloor(s.road!.world.hive!, z.x, z.y), `${z.type} for "${o.text}" stands on carved floor`).toBe(true);
      for (const z of mine) zombies.damage(s, z, 1e6, 0);
      run(s, 3);
      break;
    }
    case 'burrows': {
      const mine = s.zombies.filter(z => zombies.isInert(z) && tagOf(z) === runO.tag);
      expect(mine.every(z => z.type === (o.fixture ? 'egg' : 'burrow'))).toBe(true);
      for (const z of mine) expect(isFloor(s.road!.world.hive!, z.x, z.y) && core.phys.isFree(s, z.x, z.y, 12), `fixture for "${o.text}" stands on open floor`).toBe(true);
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
      expect(isFloor(s.road!.world.hive!, boss.x, boss.y)).toBe(true);
      // the Queen: nothing marks her until her four conduits are down, and each stage has to be fought
      for (let k = 0; k < 40 && !boss.dead; k++) {
        for (const c of s.zombies.filter(z => !z.dead && tagOf(z) === 'conduit')) zombies.damage(s, c, 1e6, 0);
        teleport(s, { x: boss.x - 300, y: boss.y }); killBugs(s); run(s, 20);
        zombies.damage(s, boss, 1e7, NaN);
      }
      expect(boss.dead, `${o.boss} can be killed`).toBe(true);
      run(s, 3);
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
  it('folds a backpack saved under the old stack limits together when the checkpoint loads', () => {
    const s = start(), p = s.player;
    // the way a backpack full of saved-up ammunition looked before stacks were tripled
    for (let k = 0; k < p.inv.slots.length; k++) p.inv.slots[k] = k % 3 === 2 ? { id: 'bandage', qty: 20 } : { id: k % 3 ? 'ammo_556' : 'ammo_9mm', qty: 240 };
    const total = (id: string) => inv.count(p.inv, id), before = { a: total('ammo_9mm'), b: total('ammo_556'), c: total('bandage') }, size = p.inv.slots.length;
    expect(p.inv.slots.every(Boolean)).toBe(true);
    s.road!.snapshot = JSON.parse(JSON.stringify({ ...s.road!.snapshot, slots: p.inv.slots }));
    road.save(s);
    const again = road.continueRoad('hive-below')!, q = again.player;
    expect({ a: inv.count(q.inv, 'ammo_9mm'), b: inv.count(q.inv, 'ammo_556'), c: inv.count(q.inv, 'bandage') }).toEqual(before);   // nothing lost
    expect(q.inv.slots.length).toBe(size);
    expect(q.inv.slots.filter(Boolean).length).toBeLessThanOrEqual(Math.ceil(size / 3) + 3);   // two thirds of the backpack is free again
    expect(q.inv.slots.filter(st => st?.id === 'ammo_9mm').map(st => st!.qty).slice(0, -1).every(n => n === 720)).toBe(true);
  });
  it('the testing unlock opens it without marking the other stories complete', () => {
    expect(road.devUnlockHiveBelow()).toBe(true);
    expect(road.canStartHiveBelow()).toBe(true);
    expect(road.canStartGroupInNeed()).toBe(false);
    const s = road.newHiveBelow()!;
    expect(s.player.inv.equip.primary?.id).toBe('smg');   // a fresh survivor gets a kit that can face a swarm
  });
  it('plays all ten missions, from the Breach down through the six cells to the Queen and back up to daylight', () => {
    const s = start(), r = s.road!;
    expect(r.cast.map(c => c.id)).toEqual(['mara', 'eli', 'june']);
    expect(r.lights).toBe(false);
    let guard = 0;
    const got = new Set<string>(), seenMissions: string[] = [];
    while (r.phase !== 'ended' && guard++ < 600) {
      for (const d of s.drops) for (const st of d.inv.slots) if (st) got.add(st.id);
      if (r.phase === 'briefing') { expect(s.ui).toBe('road'); seenMissions.push(HIVE_MISSIONS[r.mission].id); s.ui = null; tick(s); continue; }
      if (r.phase === 'complete') { s.ui = null; tick(s); continue; }
      solve(s);
      if (r.mission === 0 && r.step >= 2) expect(r.lights, 'the floodlights stay on once the breaker is thrown').toBe(true);
    }
    expect(r.phase).toBe('ended');
    expect(HIVE_MISSIONS).toHaveLength(10);
    expect(r.mission).toBe(HIVE_MISSIONS.length - 1);
    expect(road.readSave('hive-below')?.done).toBe(true);
    // every seal is open and the rift is shut
    expect(r.world.gates.every(g => g.open)).toBe(true);
    expect(r.riftShut).toBe(true);
    expect(bugs(s)).toHaveLength(0);
    // all eleven insect weapons were handed over on the way: on you, in the lockbox or still lying where they fell
    const have = (id: string) => Object.values(s.player.inv.equip).some(st => st?.id === id) || inv.count(s.player.inv, id) > 0 || inv.count(r.lockbox!, id) > 0 || got.has(id);
    for (const id of ['formic_sprayer', 'mandible_shears', 'locust_repeater', 'needler', 'vespiary', 'bombardier', 'hornbreaker', 'lure_lantern', 'mantis_scythes', 'carrion_hive', 'queens_decree']) expect(have(id), id).toBe(true);
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

describe('down the rope: the hand-over and the lockbox', () => {
  const total = (s: GameState, id: string) => inv.count(s.player.inv, id) + (s.road!.lockbox ? inv.count(s.road!.lockbox, id) : 0)
    + Object.values(s.player.inv.equip).filter(st => st?.id === id).length;
  /** A survivor who comes out of two stories: a levelled rifle, a revolver, a machete, armour and a full pack. */
  function veteran() {
    const s = start(), p = s.player;
    p.inv.equip = { primary: { id: 'assault_rifle', qty: 1, mag: 17, lvl: 3 }, secondary: { id: 'revolver', qty: 1, mag: 6, lvl: 2 }, melee: { id: 'machete', qty: 1 },
      head: { id: 'riot_helmet', qty: 1 }, body: { id: 'police_vest', qty: 1 }, back: { id: 'hiking_backpack', qty: 1 } };
    inv.recalcSize(s); p.inv.slots.fill(null);
    for (const [id, qty] of [['ammo_357', 500], ['ammo_556', 400], ['ammo_12g', 90], ['bandage', 7], ['medkit', 3], ['painkillers', 2], ['ichor', 30]] as const) expect(inv.add(p.inv, id, qty)).toBe(0);
    inv.add(p.inv, 'shotgun', 1, { mag: 4 }); inv.add(p.inv, 'pistol', 1, { mag: 12 }); inv.add(p.inv, 'bike_helmet', 1);
    p.active = 'primary';
    return s;
  }
  it('you go down with your belt, 300 rounds and half your bandages; everything else is in the lockbox', () => {
    const s = veteran(), p = s.player, ids = ['assault_rifle', 'revolver', 'machete', 'shotgun', 'pistol', 'bike_helmet', 'ammo_357', 'ammo_556', 'ammo_12g', 'bandage', 'medkit', 'painkillers', 'ichor'];
    const before = Object.fromEntries(ids.map(id => [id, total(s, id)]));
    expect(s.road!.lockbox ?? null).toBeNull();
    warrens(s);
    const e = p.inv.equip, box = s.road!.lockbox!;
    expect(e.primary).toBeNull();
    expect(e.secondary).toMatchObject({ id: 'revolver', lvl: 2 });   // the handgun keeps its upgrades
    expect([e.melee?.id, e.head?.id, e.body?.id, e.back?.id]).toEqual(['machete', 'riot_helmet', 'police_vest', 'hiking_backpack']);
    expect(p.active).toBe('secondary');
    expect(inv.count(p.inv, 'ammo_357')).toBe(kit.SIDEARM_ROUNDS);
    expect(inv.count(p.inv, 'bandage')).toBe(4);   // half of seven, rounded your way
    expect(inv.count(p.inv, 'ichor')).toBe(30);    // the hive's own stays with you
    // nothing else is in the pack
    expect(p.inv.slots.filter(Boolean).map(st => st!.id).sort()).toEqual(['ammo_357', 'bandage', 'ichor']);
    // the rifle is in the box as it was: level and the rounds in its magazine
    expect(box.slots.find(st => st?.id === 'assault_rifle')).toMatchObject({ lvl: 3, mag: 17 });
    expect(inv.count(box, 'ammo_357')).toBe(200); expect(inv.count(box, 'bandage')).toBe(3 + 2); expect(inv.count(box, 'medkit')).toBe(3);
    for (const id of ['shotgun', 'pistol', 'bike_helmet', 'ammo_556', 'painkillers']) expect(inv.count(box, id), id).toBe(before[id]);
    expect(box.size).toBeGreaterThanOrEqual(kit.LOCKBOX_SLOTS);
    expect(box.slots.findIndex(st => !st)).toBe(kit.stored(box));   // packed from the top
    // what lay on the reservoir bed went into the box as well: nothing is lost, and nothing waits up there to be fetched
    expect(s.drops.every(d => d.mission === 1)).toBe(true);
    expect(inv.count(box, 'ammo_9mm')).toBe(48);
    // not one thing of yours was lost or made
    for (const id of ids) expect(total(s, id), id).toBe(before[id] + (id === 'ammo_12g' ? 12 : id === 'bandage' ? 2 : 0));
    // level and skills are yours
    expect(p.level).toBe(s.road!.snapshot.level);
  });
  it('makes a short sidearm up to 300 rounds, and puts a handgun in an empty holster', () => {
    const s = start(), p = s.player;
    p.inv.slots.fill(null); p.inv.equip.primary = { id: 'shotgun', qty: 1, mag: 6 }; p.inv.equip.secondary = null; p.inv.equip.melee = null;
    inv.add(p.inv, 'ammo_9mm', 40); inv.add(p.inv, 'revolver', 1, { mag: 3 });
    warrens(s);
    expect(p.inv.equip.secondary).toMatchObject({ id: 'revolver', mag: 3 });   // the one from the pack
    expect(inv.count(p.inv, 'ammo_357')).toBe(kit.SIDEARM_ROUNDS);
    expect(inv.count(s.road!.lockbox!, 'ammo_9mm')).toBe(40 + 48);   // yours, and the crate nobody opened at the dam
    // nothing at all to holster: Mara's own
    const t = start(), q = t.player;
    q.inv.slots.fill(null); q.inv.equip.secondary = null;
    warrens(t);
    expect(t.player.inv.equip.secondary?.id).toBe('pistol'); expect(inv.count(t.player.inv, 'ammo_9mm')).toBe(kit.SIDEARM_ROUNDS);
    expect(kit.carried(t)).toContain('300 × ');
  });
  it('is part of the checkpoint: a restart puts the belt and the box back, and never takes a second cut', () => {
    const s = veteran(); warrens(s);
    const p = s.player, r = s.road!, belt = JSON.stringify([p.inv.equip, p.inv.slots]), boxed = JSON.stringify(r.lockbox);
    // spend, lose and (impossibly) loot the box, then die
    inv.remove(p.inv, 'ammo_357', 250); inv.remove(p.inv, 'bandage', 4); r.lockbox!.slots.fill(null); p.inv.equip.melee = null;
    road.restart(s);
    expect(JSON.stringify([p.inv.equip, p.inv.slots])).toBe(belt);
    expect(JSON.stringify(r.lockbox)).toBe(boxed);
    // and through the save file
    const again = road.continueRoad('hive-below')!;
    expect(again.road!.mission).toBe(1);
    expect(JSON.stringify([again.player.inv.equip, again.player.inv.slots])).toBe(belt);
    expect(JSON.stringify(again.road!.lockbox)).toBe(boxed);
  });
  it('strips a checkpoint that was saved at the Warrens before the hand-over existed', () => {
    const s = veteran(); s.road!.mission = 1; s.road!.snapshot = JSON.parse(JSON.stringify({ ...s.road!.snapshot, equip: s.player.inv.equip, slots: s.player.inv.slots }));
    expect(s.road!.snapshot.lockbox).toBeUndefined();
    road.save(s);
    const again = road.continueRoad('hive-below')!;
    expect(again.player.inv.equip.primary).toBeNull();
    expect(again.road!.lockbox!.slots.some(st => st?.id === 'assault_rifle')).toBe(true);
    expect(again.road!.snapshot.lockbox).toBeTruthy();
  });
  it('the Warrens: bullets for the handgun in the first crate only, ichor everywhere else, no city guns in the nooks', () => {
    const s = veteran(); warrens(s);
    const lying = s.drops.flatMap(d => d.inv.slots.filter(Boolean).map(st => st!.id));
    expect(lying.length).toBeGreaterThan(8);
    expect(lying.filter(id => combat.WEAPONS[id]).every(id => id === 'formic_sprayer')).toBe(true);
    expect(new Set(lying.filter(id => id.startsWith('ammo_')))).toEqual(new Set(['ammo_357']));   // the revolver on the belt
    expect(lying).not.toContain('ammo_sidearm');
    // a cache of five pistol magazines is five cylinders for a revolver; the first chamber has two, and nothing else on the map is bullets
    const crate = s.drops.flatMap(d => d.inv.slots).filter(st => st?.id === 'ammo_357').map(st => st!.qty);
    expect(crate).toEqual([30, 30]);
    const trail = mid(s.road!.world.sites.trail!);
    for (const d of s.drops) if (d.inv.slots.some(st => st?.id === 'ammo_357')) expect(Math.hypot(d.x - trail.x, d.y - trail.y)).toBeLessThan(260);
    expect(lying.filter(id => id === 'ichor').length).toBeGreaterThan(4);
    // and what a kill gives up
    const seen = new Set<string>();
    for (let k = 0; k < 2500; k++) {
      const z = zombies.spawn(s, 'drone', s.player.x + 300, s.player.y); const n = s.drops.length;
      zombies.damage(s, z, 1e6, 0); run(s, 1);
      for (const d of s.drops.slice(n)) for (const st of d.inv.slots) if (st?.id.startsWith('ammo_')) seen.add(st.id);
      s.drops.length = n; s.zombies = s.zombies.filter(q => !q.dead || zombies.isInert(q));
    }
    expect([...seen]).toEqual(['ammo_357']);
  });
  it('the lockbox stays with Mara for the whole hive: no box at the Warrens camp, only a rest; it is handed back once, on the dam wall, when the rift is shut', () => {
    const s = veteran(); warrens(s);
    const r = s.road!, p = s.player;
    for (let guard = 0; road.current(s)?.kind !== 'camp' && guard < 40; guard++) { solve(s); expect(road.lockboxSpots(s), 'no lockbox in the Warrens').toHaveLength(0); }
    expect(road.current(s)?.kind).toBe('camp');
    // standing at the camp is not enough: you rest when you are ready (and there is nothing to open)
    killBugs(s); teleport(s, road.currentRun(s)!.point); run(s, 120);
    expect(r.phase).toBe('play'); expect(s.interact?.label).toBe('Rest at the camp (hold)');
    expect(s.events.some(e => e.t === 'banner' && /LOCKBOX|KIT IS BACK/.test((e as { title: string }).title))).toBe(false);
    run(s, 40, { interactHeld: true }); expect(r.phase).toBe('play'); expect(s.search?.t).toBeGreaterThan(0.5);
    run(s, 50, { interactHeld: true });
    expect(r.phase).toBe('complete');
    // the checkpoint still holds everything you left with Mara
    expect(r.snapshot.equip.primary?.id ?? 'formic_sprayer').toBe('formic_sprayer');
    expect(r.snapshot.lockbox!.slots.find(st => st?.id === 'assault_rifle')).toMatchObject({ lvl: 3 });
    expect(inv.count(r.snapshot.lockbox!, 'ammo_556')).toBe(400);
    const saved = road.readSave('hive-below')!;
    expect(saved.done).toBeFalsy(); expect(saved.mission).toBe(2);   // the Granary is next
    // no camp of any cell has it, and neither does the camp you set out from
    for (let m = 2; m < HIVE_MISSIONS.length; m++) {
      road.startMission(s, m); begin(s);
      expect(road.kitAway(s), HIVE_MISSIONS[m].id).toBe(true);
      expect(road.lockboxSpots(s), `${HIVE_MISSIONS[m].id}: at the start`).toHaveLength(0);
      if (m === HIVE_MISSIONS.length - 1) break;
      while (road.current(s)?.kind !== 'camp') road.devSkip(s);
      expect(road.lockboxSpots(s), `${HIVE_MISSIONS[m].id}: at its camp`).toHaveLength(0);
    }
    // ---- the very end: Daylight, the rift shut, the camp on the dam wall
    expect(HIVE_MISSIONS[r.mission].lockbox).toBe(true);
    while (road.current(s)?.kind !== 'camp') { expect(road.lockboxSpots(s)).toHaveLength(0); road.devSkip(s); }
    const [at] = road.lockboxSpots(s), camp = road.currentRun(s)!.point;
    expect(at).toBeTruthy();
    expect(Math.hypot(at.x - camp.x, at.y - camp.y)).toBeGreaterThan(80);   // the box and the wall are two places to stand
    expect(s.events.some(e => e.t === 'banner' && (e as { title: string }).title === 'YOUR KIT IS BACK')).toBe(true);
    killBugs(s); teleport(s, { x: at.x + 30, y: at.y + 20 }); run(s, 2);
    expect(s.interact?.label).toBe('Open the lockbox');
    s.events.length = 0;
    tick(s, { pressed: new Set(['interact']) as InputState['pressed'] });
    expect(s.ui).toBe('loot');
    const ev = s.events.find(e => e.t === 'openUi') as { ui: string; target: { kind: string; inv: unknown } };
    expect(ev.ui).toBe('loot'); expect(ev.target.kind).toBe('lockbox'); expect(ev.target.inv).toBe(r.lockbox);
    const t0 = s.time; run(s, 30); expect(s.time).toBe(t0);   // the game waits while it is open
    const i = r.lockbox!.slots.findIndex(st => st?.id === 'assault_rifle');
    expect(inv.moveSlot(r.lockbox!, i, p.inv)).toBe(true);
    expect(inv.equip(s, p.inv.slots.findIndex(st => st?.id === 'assault_rifle'))).toBe(true);
    s.ui = null;
    teleport(s, camp); run(s, 100, { interactHeld: true });
    expect(r.phase).toBe('complete');
    expect(r.snapshot.equip.primary).toMatchObject({ id: 'assault_rifle', lvl: 3 });   // you leave with it
    expect(inv.count(r.snapshot.lockbox!, 'ammo_556')).toBe(400);                        // and the rest is still yours, in the box
    expect(road.readSave('hive-below')!.done).toBe(true);
  });
  it('a checkpoint saved when the lockbox still came to every camp sends the long guns back to Mara, and leaves the rest alone', () => {
    const s = veteran(); warrens(s);
    const r = s.road!, p = s.player, box = r.lockbox!;
    // the way such a save looks: the rifle is back in your hands, its rounds and a shotgun in the pack, and a stray box of .308
    const take = (id: string) => { const i = box.slots.findIndex(st => st?.id === id); expect(inv.moveSlot(box, i, p.inv), id).toBe(true); };
    for (const id of ['assault_rifle', 'ammo_556', 'shotgun', 'medkit']) take(id);
    inv.equip(s, p.inv.slots.findIndex(st => st?.id === 'assault_rifle'));
    inv.add(p.inv, 'ammo_308', 20); inv.add(p.inv, 'formic_sprayer', 1, { mag: 80 }); inv.add(p.inv, 'ichor', 200); inv.add(p.inv, 'pistol', 1, { mag: 12 }); inv.add(p.inv, 'ammo_9mm', 30);
    const bandages = inv.count(p.inv, 'bandage'), rounds = inv.count(p.inv, 'ammo_357'), medkits = inv.count(p.inv, 'medkit');
    r.snapshot = JSON.parse(JSON.stringify({ ...r.snapshot, equip: p.inv.equip, slots: p.inv.slots, lockbox: box }));
    r.mission = 2; road.save(s);
    const again = road.continueRoad('hive-below')!, q = again.player, b2 = again.road!.lockbox!;
    expect(again.road!.mission).toBe(2);
    expect(q.inv.equip.primary).toBeNull();
    for (const id of ['assault_rifle', 'shotgun']) { expect(inv.count(q.inv, id), id).toBe(0); expect(inv.count(b2, id), id).toBe(1); }
    expect(b2.slots.find(st => st?.id === 'assault_rifle')).toMatchObject({ lvl: 3 });
    expect(inv.count(q.inv, 'ammo_556')).toBe(0); expect(inv.count(b2, 'ammo_556')).toBe(400);
    expect(inv.count(q.inv, 'ammo_308')).toBe(0); expect(inv.count(b2, 'ammo_308')).toBe(20);
    // the belt, what heals, and everything of the hive are untouched (a second handgun and its rounds too: they are sidearms)
    expect(q.inv.equip.secondary?.id).toBe('revolver'); expect(q.inv.equip.melee?.id).toBe('machete');
    expect([inv.count(q.inv, 'bandage'), inv.count(q.inv, 'ammo_357'), inv.count(q.inv, 'medkit')]).toEqual([bandages, rounds, medkits]);
    expect([inv.count(q.inv, 'formic_sprayer'), inv.count(q.inv, 'ichor'), inv.count(q.inv, 'pistol'), inv.count(q.inv, 'ammo_9mm')]).toEqual([1, 230, 1, 30]);
    expect(q.active).toBe('secondary');
    expect(again.events.some(e => e.t === 'toast' && /back up the rope/.test((e as { msg: string }).msg))).toBe(true);
    // and it is the same on every later start: nothing more to send
    const n = b2.slots.filter(Boolean).length; road.startMission(again, 3); expect(again.road!.lockbox!.slots.filter(Boolean).length).toBe(n);
  });
  it('while your kit is with Mara every crate and every nook of the cells holds ichor, never bullets or city guns; only a kill can give up handgun rounds', () => {
    const s = veteran(); warrens(s);
    for (const id of ['granary', 'galleries', 'seals']) {
      road.startMission(s, HIVE_MISSIONS.findIndex(m => m.id === id)); begin(s);
      const lying = s.drops.filter(d => d.mission === s.road!.mission).flatMap(d => d.inv.slots.filter(Boolean).map(st => st!.id));
      expect(lying.length, id).toBeGreaterThan(3);
      expect(lying.filter(x => combat.WEAPONS[x]).every(x => combat.WEAPONS[x].tree === 'hive'), id).toBe(true);
      expect(lying.filter(x => x.startsWith('ammo_')), id).toEqual([]);
      expect(lying.filter(x => x === 'ichor').length, id).toBeGreaterThanOrEqual(3);
    }
    for (const def of HIVE_MISSIONS.slice(1)) for (const c of def.caches) for (const it of c.items) expect(it.id.startsWith('ammo_') && !(def.id === 'warrens' && c.at === 'trail'), `${def.id}: ${it.id}`).toBe(false);
    const seen = new Set<string>();
    for (let k = 0; k < 2500; k++) {
      const z = zombies.spawn(s, 'drone', s.player.x + 300, s.player.y); const n = s.drops.length;
      zombies.damage(s, z, 1e6, 0); run(s, 1);
      for (const d of s.drops.slice(n)) for (const st of d.inv.slots) if (st?.id.startsWith('ammo_')) seen.add(st.id);
      s.drops.length = n; s.zombies = s.zombies.filter(q => !q.dead || zombies.isInert(q));
    }
    expect([...seen]).toEqual(['ammo_357']);
  });
  it('the last fight with everything you own is a big one: about 280 Drones in the minute at the dam, never more than the cap (240) at once', () => {
    const s = start(); begin(s);
    while (road.current(s)?.kind !== 'holdout') solve(s);
    const o = road.current(s)!, runO = road.currentRun(s)!;
    expect(o.kind === 'holdout' && [o.seconds, o.every, o.count]).toEqual([60, 6, 28]);
    teleport(s, runO.point);
    const seen = new Set<string>(); let peak = 0;
    for (let t = 0; t < 61 * 60 && !runO.done; t++) {
      tick(s);
      for (const z of s.zombies) if (tagOf(z) === runO.tag) seen.add(z.id);
      peak = Math.max(peak, bugs(s).length);
      if (t % 60 === 59) for (const z of bugs(s).slice(0, 30)) zombies.damage(s, z, 1e6, 0);   // a strong player: thirty kills a second
    }
    expect(runO.done).toBe(true);
    expect(seen.size).toBeGreaterThan(240); expect(seen.size).toBeLessThanOrEqual(280);
    expect(peak).toBeLessThanOrEqual(hive.SWARM_CAP);
    // and a player who cannot keep up is not buried: the cap holds waves back
    const t2 = start(); begin(t2);
    while (road.current(t2)?.kind !== 'holdout') solve(t2);
    teleport(t2, road.currentRun(t2)!.point);
    let most = 0; for (let t = 0; t < 40 * 60; t++) { tick(t2); most = Math.max(most, bugs(t2).length); }
    expect(most).toBeLessThanOrEqual(hive.SWARM_CAP); expect(most).toBeGreaterThan(160);
  });
  it('the Breach ends with a rest too, so what is on your belt is your choice', () => {
    const s = veteran(), r = s.road!;
    begin(s);
    for (let guard = 0; road.current(s)?.kind !== 'camp' && guard < 40; guard++) solve(s);
    const o = road.current(s)!;
    expect(o.kind === 'camp' && o.rest).toBe('Hand over the long guns and rest');
    expect(s.events.some(e => e.t === 'banner' && /BELT/.test((e as { title: string }).title))).toBe(true);
    killBugs(s); teleport(s, road.currentRun(s)!.point); run(s, 60);
    expect(r.phase).toBe('play'); expect(r.lockbox ?? null).toBeNull();
    // swap the sidearm at the last moment
    const i = s.player.inv.slots.findIndex(st => st?.id === 'pistol'); expect(inv.equip(s, i)).toBe(true);
    run(s, 90, { interactHeld: true });
    expect(r.phase).toBe('complete');
    s.ui = null; tick(s);   // CONTINUE
    expect(r.mission).toBe(1);
    expect(s.player.inv.equip.secondary?.id).toBe('pistol');
    expect(inv.count(s.player.inv, 'ammo_9mm')).toBe(kit.SIDEARM_ROUNDS);
    expect(r.lockbox!.slots.some(st => st?.id === 'revolver')).toBe(true);
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
    expect(b.hp).toBe(zombies.TYPES.burrow.hp * hive.TOUGH.hp - 10);
    expect(s.player.hp).toBe(hp);
    // a collapsed burrow pays out ichor
    zombies.damage(s, b, 1e6, 0); run(s, 2);
    expect(s.drops.some(d => d.inv.slots[0]?.id === 'ichor' && d.inv.slots[0].qty >= 24)).toBe(true);
  });
});

describe('toughness', () => {
  it('everything in the hive has half again the health and 30% more bite than its base numbers', () => {
    const s = begin(start()), p = s.player;
    const drone = zombies.spawn(s, 'drone', p.x + 400, p.y), pot = zombies.spawn(s, 'honeypot', p.x + 400, p.y + 60), egg = hive.spawnFixture(s, 'egg', { x: p.x + 400, y: p.y - 60 });
    run(s, 2);
    expect([drone.maxHp, drone.hp]).toEqual([36, 36]); expect(drone.damage).toBeCloseTo(7 * 1.3);
    expect(pot.maxHp).toBe(113); expect(pot.damage).toBeCloseTo(13);
    expect(egg.maxHp).toBe(zombies.TYPES.egg.hp);   // eggs stay fragile
    run(s, 30); expect(drone.maxHp).toBe(36);       // applied once, not every tick
    // a mission can set its own
    HIVE_MISSIONS[0].tough = { hp: 2, dmg: 1 };
    try { const z = zombies.spawn(s, 'drone', p.x + 400, p.y + 120); run(s, 2); expect(z.maxHp).toBe(48); expect(z.damage).toBe(7); } finally { delete HIVE_MISSIONS[0].tough; }
  });
  it('the Marshal hits harder with its specials too, and the earlier stories are untouched', () => {
    const s = warrens(start());
    s.road!.step = 3; (s.road!.objectives[3] as any).started = true;
    const at = s.road!.world.sites.parade!;
    teleport(s, { x: at.x + at.w / 2 - 420, y: at.y + at.h / 2 }); run(s, 3);
    const boss = s.zombies.find(z => z.boss === 'marshal')! as Zombie & { bossMul: number };
    expect(boss.maxHp).toBe(7500); expect(boss.bossMul).toBeCloseTo(0.85 * 1.3);
    const city = road.newRoad('survivor'); begin(city);
    const walker = zombies.spawn(city, 'walker', city.player.x + 400, city.player.y); run(city, 2);
    expect([walker.maxHp, walker.damage]).toEqual([zombies.TYPES.walker.hp, zombies.TYPES.walker.damage]);
  });
});

describe('supplies from kills', () => {
  /** Kill `n` of a type beside the player and count the drops that appear. */
  function harvest(s: GameState, type: 'drone' | 'walker', n: number) {
    const before = s.drops.length, seen = new Map<string, number>();
    for (let i = 0; i < n; i++) { const z = zombies.spawn(s, type, s.player.x + 300, s.player.y); (z as any).losTimer = 99; zombies.damage(s, z, 1e6, 0); if (i % 20 === 19) run(s, 1); }
    run(s, 1);
    for (const d of s.drops.slice(before)) { const id = d.inv.slots[0]!.id; seen.set(id.startsWith('ammo_') ? 'ammo' : id, (seen.get(id.startsWith('ammo_') ? 'ammo' : id) ?? 0) + 1); }
    return { drops: s.drops.length - before, seen };
  }
  it('a swarm pays out far less per kill than the city does: about one kill in twenty drops anything', () => {
    const s = begin(start()); for (const z of s.zombies) z.dead = true; run(s, 1);
    const { drops, seen } = harvest(s, 'drone', 2000);
    expect(drops / 2000).toBeGreaterThan(0.03); expect(drops / 2000).toBeLessThan(0.075);
    expect((seen.get('ichor') ?? 0) / 2000).toBeCloseTo(hive.ICHOR_DROP, 1);
    expect([...seen.keys()].sort()).toEqual(['ammo', 'bandage', 'ichor']);
    for (const d of s.drops) if (d.inv.slots[0]?.id === 'ichor' && d.life !== Infinity) expect(d.inv.slots[0].qty).toBeLessThanOrEqual(20);
  });
  it('leaves the drop rates of the two earlier stories exactly where they were', () => {
    const s = road.newRoad('survivor'); s.dev = { god: true } as GameState['dev']; begin(s);
    for (const z of s.zombies) z.dead = true; run(s, 1);
    const { drops, seen } = harvest(s, 'walker', 2000);
    expect(drops / 2000).toBeGreaterThan(0.05); expect(drops / 2000).toBeLessThan(0.08);   // 4.5% ammunition + 2% a bandage
    expect(seen.has('ichor')).toBe(false);
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
    expect(boss).toBeTruthy(); expect(boss.maxHp).toBe(5000 * hive.TOUGH.hp);
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
    run(s, 1);   // it gets the hive's toughness on its first tick
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

describe('Hive Weapons skill tree', () => {
  const stats = (s: GameState, id: string) => progression.weaponStats(s, id);
  const buy = (s: GameState, ...ids: string[]) => { for (const id of ids) { s.player.sp = 9; expect(progression.unlock(s, id), id).toBe(true); } };
  it('is an eighth tree on the skills screen in The Hive Below, and nowhere else', () => {
    const s = begin(start());
    const trees = progression.treesFor(s);
    expect(trees.map(t => t.id)).toEqual(['handgun', 'smg', 'shotgun', 'rifle', 'melee', 'armor', 'survival', 'hive']);
    const tree = trees.at(-1)!;
    expect(tree.name).toBe('Hive Weapons'); expect(tree.nodes).toHaveLength(9);
    for (const n of tree.nodes) { expect(n.cost.sp).toBeGreaterThan(0); expect(Object.keys(n.cost.items)).toHaveLength(0); for (const r of n.requires) expect(tree.nodes.some(q => q.id === r)).toBe(true); }
    const city = road.newRoad('survivor'); begin(city);
    expect(progression.treesFor(city).some(t => t.id === 'hive')).toBe(false);
    city.player.sp = 9;
    expect(progression.canUnlock(city, 'hive_dmg1')).toMatchObject({ ok: false });
    expect(progression.unlock(city, 'hive_dmg1')).toBe(false);
  });
  it('upgrades the insect weapons on top of the tree of their class, and nothing else', () => {
    const s = begin(start());
    const base = { smg: stats(s, 'smg'), bat: stats(s, 'bat') };
    // the Sprayer is an SMG and the Shears are a melee weapon: those trees still reach them
    buy(s, 'smg_dmg1', 'melee_dmg1');
    expect(stats(s, 'smg').damage).toBeCloseTo(base.smg.damage * 1.15);
    expect(stats(s, 'formic_sprayer').damage).toBeCloseTo(7 * 1.15);
    expect(stats(s, 'mandible_shears').damage).toBeCloseTo(80 * 1.2);
    // and the Hive Weapons tree adds to that, for the insect weapons only
    buy(s, 'hive_dmg1');
    expect(stats(s, 'formic_sprayer').damage).toBeCloseTo(7 * 1.3); expect(stats(s, 'mandible_shears').damage).toBeCloseTo(80 * 1.35);
    expect(stats(s, 'smg').damage).toBeCloseTo(base.smg.damage * 1.15); expect(stats(s, 'bat').damage).toBeCloseTo(base.bat.damage * 1.2);
    buy(s, 'hive_tank', 'hive_reach', 'hive_cleave', 'smg_mag1');
    expect(stats(s, 'formic_sprayer').magSize).toBe(80 + 30 + 15);   // Swollen Tank and the SMG tree's Extended Drum
    expect(stats(s, 'smg').magSize).toBe(base.smg.magSize + 15);
    const sh = stats(s, 'mandible_shears');
    expect(sh.magSize).toBe(0); expect(sh.cleave).toBe(4);
    expect(sh.melee!.range).toBeCloseTo(84 * 1.15); expect(sh.melee!.arc).toBeCloseTo(1.2 * 1.25); expect(sh.melee!.knock).toBeCloseTo(120 * 1.5);
    buy(s, 'hive_dmg2', 'hive_corrode1', 'hive_corrode2', 'hive_venom');
    expect(stats(s, 'formic_sprayer').damage).toBeCloseTo(7 * 1.75); expect(stats(s, 'formic_sprayer').crit).toBeCloseTo(0.1);
    expect(stats(s, 'smg').crit).toBe(0); expect(stats(s, 'bat').cleave).toBeUndefined();
  });
  it('Stronger Acid and Deep Burn change the corrosion itself', () => {
    const s = begin(start());
    const z = zombies.spawn(s, 'brute', s.player.x + 400, s.player.y), w = zombies.spawn(s, 'brute', s.player.x + 400, s.player.y + 80);
    run(s, 1);
    buy(s, 'hive_dmg1', 'hive_corrode1', 'hive_corrode2');
    for (let i = 0; i < 12; i++) zombies.corrode(s, z);
    expect(z.corroStacks).toBe(zombies.CORRODE_MAX + 3); expect(z.corro).toBe(zombies.CORRODE_TIME + 2);
    zombies.corrode(s, w);
    const hp = w.hp; run(s, 66);
    expect(hp - w.hp).toBeCloseTo(2 * 1.5 * 1 * 2, 0);   // one stack, two ticks, half again as hard
  });
  it('Harvester doubles the ichor from kills and adds half to a burrow', () => {
    const s = begin(start()); for (const z of s.zombies) z.dead = true; run(s, 1);
    buy(s, 'hive_dmg1', 'hive_tank', 'hive_dmg2', 'hive_corrode1', 'hive_corrode2', 'hive_harvest');
    let ichor = 0; const before = s.drops.length;
    for (let i = 0; i < 2000; i++) { const z = zombies.spawn(s, 'drone', s.player.x + 300, s.player.y); zombies.damage(s, z, 1e6, 0); if (i % 20 === 19) run(s, 1); }
    run(s, 1);
    for (const d of s.drops.slice(before)) if (d.inv.slots[0]?.id === 'ichor') ichor++;
    expect(ichor / 2000).toBeCloseTo(hive.ICHOR_DROP * 2, 1); expect(ichor / 2000).toBeGreaterThan(hive.ICHOR_DROP * 1.5);
    const b = hive.spawnFixture(s, 'burrow', { x: s.player.x + 200, y: s.player.y }); run(s, 1);
    const n = s.drops.length; zombies.damage(s, b, 1e6, 0); run(s, 2);
    expect(s.drops.slice(n).find(d => d.inv.slots[0]?.id === 'ichor')!.inv.slots[0]!.qty).toBeGreaterThanOrEqual(36);
  });
});

describe('swarm cost', () => {
  it('steps a full swarm (240 alive, and 300 for headroom) well inside a frame', () => {
    const s = warrens(start());
    const at = s.road!.world.sites.parade!, c = { x: at.x + at.w / 2, y: at.y + at.h / 2 };
    teleport(s, c);
    expect(hive.SWARM_CAP).toBe(240);
    for (const n of [150, hive.SWARM_CAP, 300]) {
      for (const z of s.zombies) if (!zombies.isInert(z) && !z.boss) z.dead = true;
      run(s, 1);
      for (let i = 0; bugs(s).length < n && i < 6000; i++) { const a = i * 2.399, d = 120 + (i % 60) * 8, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (core.phys.isFree(s, x, y, 14)) hive.spawnBug(s, 'drone', x, y, true); }
      expect(bugs(s).length).toBe(n);
      run(s, 30);
      const t0 = performance.now(); run(s, 120); const ms = (performance.now() - t0) / 120;
      console.log(`swarm cost: ${n} bugs ${ms.toFixed(2)} ms per tick`);
      // a 60 Hz tick has 16.7 ms; the sim's share must stay small (the renderer needs the rest)
      expect(ms, `${n} bugs: ${ms.toFixed(2)} ms per tick`).toBeLessThan(6);
    }
  });
});
