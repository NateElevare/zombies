// The Long Road: a scripted playthrough through the sim (no Phaser). Every mission is driven with the real
// step function; the player is teleported to objective points and zombies are killed with sim damage.
import { beforeEach, describe, expect, it } from 'vitest';
import * as core from '../src/sim/core';
import * as road from '../src/sim/road';
import * as zombies from '../src/sim/zombies';
import { MISSIONS } from '../src/sim/road-data';
import * as inv from '../src/sim/inventory';
import * as progression from '../src/sim/progression';
import { ITEMS } from '../src/sim/items';
import type { GameState, InputState } from '../src/sim/types';

const input = (s: GameState, extra: Partial<InputState> = {}): InputState => ({ moveX: 0, moveY: 0, aimX: s.player.x + 100, aimY: s.player.y, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set(), ...extra });
const tick = (s: GameState, extra: Partial<InputState> = {}) => road.stepRoad(s, input(s, extra), core.SIM_DT);
const run = (s: GameState, n: number, extra: Partial<InputState> = {}) => { for (let i = 0; i < n; i++) tick(s, extra); };
const killAll = (s: GameState) => { for (const z of s.zombies) if (!z.dead) zombies.damage(s, z, 1e6, 0); };
const teleport = (s: GameState, p: { x: number; y: number }) => { s.player.x = s.player.prevX = p.x; s.player.y = s.player.prevY = p.y; core.phys.collideCircle(s, s.player); };

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k), clear: () => store.clear() };
});

/** Drive the current objective to completion the way a player would (teleporting instead of walking). */
function solve(s: GameState) {
  const r = s.road!, o = road.current(s)!, runO = road.currentRun(s)!;
  switch (o.kind) {
    case 'reach': case 'camp': killAll(s); teleport(s, runO.point); run(s, 5); break;
    case 'pickup': {
      const drop = s.drops.find(d => d.inv.slots[0]?.id === o.item)!;
      expect(drop, `quest item ${o.item} placed`).toBeTruthy();
      teleport(s, drop); run(s, 3);
      break;
    }
    case 'clear': {
      const tagged = s.zombies.filter(z => !z.dead && (z as any).roadTag === runO.tag).length;
      expect(tagged, `clear objective "${o.text}" spawned its zombies`).toBeGreaterThanOrEqual(Math.ceil(o.count * 0.6));
      run(s, 2); killAll(s); run(s, 3); break;
    }
    case 'holdout': {
      teleport(s, runO.point);
      let spawned = 0;
      for (let t = 0; t < o.seconds * 60 + 120 && !runO.done; t++) { tick(s); if (t % 60 === 0) { spawned += s.zombies.filter(z => !z.dead && (z as any).roadTag === runO.tag).length; killAll(s); } }
      expect(spawned, `holdout "${o.text}" sent waves`).toBeGreaterThan(o.seconds / o.every);
      break;
    }
    case 'interact': teleport(s, runO.point); run(s, Math.ceil(((o.hold ?? 0.3) + 0.2) * 60), { interactHeld: true }); break;
    case 'boss': {
      teleport(s, runO.point); run(s, 3);
      const boss = s.zombies.find(z => z.id === runO.bossId);
      expect(boss, 'boss spawned').toBeTruthy();
      killAll(s); run(s, 3);
      break;
    }
  }
  void r;
}

describe('The Long Road', () => {
  it('builds the map with every site, gate and camp', () => {
    const s = road.newRoad('scout');
    const w = s.road!.world;
    expect(w.sectors).toHaveLength(9); expect(w.gates).toHaveLength(8); expect(w.camps).toHaveLength(9);
    for (const id of ['haven', 'pharmacy', 'school', 'gas', 'precinct', 'dispatch', 'hospital', 'depot', 'pumping', 'ranger', 'clearing', 'fort', 'motorpool', 'relay'] as const) expect(w.sites[id], id).toBeTruthy();
    expect(s.player.character).toBe('scout');
    expect(s.ui).toBe('road'); expect(s.road!.phase).toBe('briefing');
  });

  it('plays every mission to the end, with checkpoints saved along the way', () => {
    const s = road.newRoad();
    for (let m = 0; m < MISSIONS.length; m++) {
      const r = s.road!;
      expect(r.mission).toBe(m);
      expect(r.phase).toBe('briefing');
      s.ui = null; tick(s);                       // dismiss the briefing card
      expect(r.phase).toBe('play');
      // the gate out of this sector is closed until the mission ends
      if (m < 8) expect(r.world.gates[m].open).toBe(false);
      let guard = 0;
      while (r.phase === 'play' && guard++ < 40) solve(s);
      expect(r.phase, `mission ${m} (${MISSIONS[m].title}) completes`).toBe('complete');
      if (m < 8) expect(r.world.gates[m].open).toBe(true);
      const saved = road.readSave()!;
      expect(saved.mission).toBe(Math.min(m + 1, MISSIONS.length - 1));
      s.ui = null; tick(s);                       // dismiss MISSION COMPLETE
    }
    expect(s.road!.phase).toBe('ended');
    expect(road.readSave()!.done).toBe(true);
  }, 30000);

  it('restarts the mission from its start snapshot after a death', () => {
    const s = road.newRoad();
    s.ui = null; tick(s);
    const r = s.road!;
    solve(s);                                   // shotgun picked up
    expect(s.player.inv.equip.primary?.id).toBe('shotgun');
    const kills = r.missionKills;
    s.player.hp = 0; tick(s);
    expect(s.screen).toBe('dead');
    road.restart(s);
    expect(s.screen).toBe('playing'); expect(r.phase).toBe('play'); expect(r.step).toBe(0);
    expect(s.player.inv.equip.primary).toBeNull();          // gear is as it was when the mission began
    expect(s.player.hp).toBe(s.player.maxHp);
    expect(r.missionDeaths).toBe(1); expect(r.missionKills).toBe(0); void kills;
    expect(s.drops.some(d => d.inv.slots[0]?.id === 'shotgun')).toBe(true);   // the pickup is back
  });

  it('continues from the saved checkpoint with the saved gear', () => {
    const s = road.newRoad();
    s.ui = null; tick(s);
    while (s.road!.phase === 'play') solve(s);
    s.ui = null; tick(s);                         // mission 2 starts and saves
    expect(s.road!.mission).toBe(1);
    const c = road.continueRoad()!;
    expect(c).toBeTruthy();
    expect(c.road!.mission).toBe(1); expect(c.road!.phase).toBe('briefing');
    expect(c.player.inv.equip.primary?.id).toBe('shotgun');
    expect(c.road!.world.gates[0].open).toBe(true);
    expect(c.road!.world.gates[1].open).toBe(false);
    const cp = road.campOf(c, 0);
    expect(Math.hypot(c.player.x - cp.x, c.player.y - cp.y)).toBeLessThan(80);
  });

  it('is deterministic: two runs place the same quest items', () => {
    const a = road.newRoad(), b = road.newRoad();
    expect(a.drops.map(d => [d.x, d.y, d.inv.slots[0]?.id])).toEqual(b.drops.map(d => [d.x, d.y, d.inv.slots[0]?.id]));
  });
});

describe('The Long Road: inventory, quick heal, upgrades and skills', () => {
  const pickUp = (s: GameState, id: string) => { const d = s.drops.find(d => d.inv.slots[0]?.id === id)!; expect(d, id).toBeTruthy(); teleport(s, d); run(s, 3); };
  it('puts meds in the backpack and quick-heals with H', () => {
    const s = road.newRoad(); s.ui = null; tick(s);
    const medkit = s.drops.find(d => d.inv.slots[0]?.id === 'medkit')!;
    teleport(s, medkit); run(s, 3);
    expect(inv.count(s.player.inv, 'medkit')).toBe(1);
    expect(s.player.hp).toBe(s.player.maxHp);
    s.player.hp = 30; tick(s, { pressed: new Set(['heal']) });
    expect(s.player.hp).toBe(90); expect(inv.count(s.player.inv, 'medkit')).toBe(0);
  });
  it('equips a gun for an empty slot, sends spares to the backpack, and upgrades from spares', () => {
    const s = road.newRoad(); s.ui = null; tick(s);
    pickUp(s, 'shotgun');
    expect(s.player.inv.equip.primary?.id).toBe('shotgun'); expect(s.player.active).toBe('primary');
    road.dropAt(s, { x: s.player.x + 200, y: s.player.y }, { id: 'shotgun', qty: 1, mag: 6 });
    pickUp(s, 'shotgun');
    expect(s.player.inv.equip.primary?.lvl ?? 1).toBe(1);
    expect(inv.count(s.player.inv, 'shotgun')).toBe(1);
    expect(inv.gearUpgrade(s, 'primary')?.ok).toBe(true);
    expect(inv.upgradeGear(s, 'primary')).toBe(true);
    expect(s.player.inv.equip.primary?.lvl).toBe(2); expect(inv.count(s.player.inv, 'shotgun')).toBe(0);
  });
  it('a better backpack or armor piece replaces the worn one and the old piece goes in the bag', () => {
    const s = road.newRoad(); s.ui = null; tick(s);
    s.player.inv.equip.back = { id: 'small_backpack', qty: 1 }; inv.recalcSize(s);
    s.player.inv.equip.body = { id: 'hoodie', qty: 1 };
    const before = s.player.inv.slots.length;
    road.dropAt(s, { x: s.player.x + 200, y: s.player.y }, { id: 'military_backpack', qty: 1 }); pickUp(s, 'military_backpack');
    expect(s.player.inv.equip.back?.id).toBe('military_backpack'); expect(s.player.inv.slots.length).toBeGreaterThan(before);
    expect(inv.count(s.player.inv, 'small_backpack')).toBe(1);
    road.dropAt(s, { x: s.player.x + 200, y: s.player.y }, { id: 'military_vest', qty: 1 }); pickUp(s, 'military_vest');
    expect(s.player.inv.equip.body?.id).toBe('military_vest'); expect(inv.count(s.player.inv, 'hoodie')).toBe(1);
    road.dropAt(s, { x: s.player.x + 200, y: s.player.y }, { id: 'cap', qty: 1 }); // worse than nothing? no: head is empty -> equips
    pickUp(s, 'cap'); expect(s.player.inv.equip.head?.id).toBe('cap');
    road.dropAt(s, { x: s.player.x + 200, y: s.player.y }, { id: 'hoodie', qty: 1 }); pickUp(s, 'hoodie');   // worse than the vest: stays a spare
    expect(s.player.inv.equip.body?.id).toBe('military_vest'); expect(inv.count(s.player.inv, 'hoodie')).toBe(2);
  });
  it('spends skill points on the tech tree with no workbench and no materials', () => {
    const s = road.newRoad(); s.ui = null; tick(s);
    // a node with a material cost whose prerequisites we grant
    const node = Object.values(progression.TECH.nodes).find(n => Object.keys(n.cost.items).length > 0)!;
    for (const r of node.requires) s.player.tech[r] = true;
    s.player.sp = 5;
    expect(progression.canUnlock(s, node.id).ok).toBe(true);
    expect(progression.unlock(s, node.id)).toBe(true);
    expect(s.player.tech[node.id]).toBe(true);
  });
  it('hides the perks that do nothing here and rewires what needed them', () => {
    const s = road.newRoad(); s.ui = null; tick(s);
    const trees = progression.treesFor(s), ids = new Set(trees.flatMap(t => t.nodes.map(n => n.id)));
    for (const gone of ['survival_hunger1', 'survival_hunger2', 'survival_search1', 'survival_luck1', 'survival_luck2', 'armor_bleed1']) expect(ids.has(gone), gone).toBe(false);
    for (const kept of ['survival_pack1', 'survival_pack2', 'survival_stam1', 'survival_stam2', 'survival_sneak', 'armor_thorns', 'armor_regen2']) expect(ids.has(kept), kept).toBe(true);
    const pack2 = trees.flatMap(t => t.nodes).find(n => n.id === 'survival_pack2')!;
    expect(pack2.requires).toEqual(['survival_pack1']);                       // used to need Efficient Metabolism
    s.player.sp = 9;
    expect(progression.unlock(s, 'survival_pack1')).toBe(true);
    expect(progression.unlock(s, 'survival_pack2')).toBe(true);
    expect(progression.canUnlock(s, 'survival_hunger1').ok).toBe(false);
    // the open world still shows everything
    const surv = { mode: 'survival' } as GameState;
    expect(progression.treesFor(surv).flatMap(t => t.nodes).some(n => n.id === 'survival_hunger1')).toBe(true);
  });
  it('does not immediately re-pick an item the player dropped', () => {
    const s = road.newRoad(); s.ui = null; tick(s);
    const i = s.player.inv.slots.findIndex(st => st?.id === 'ammo_9mm');
    expect(inv.drop(s, i)).toBeTruthy();
    run(s, 10);
    expect(inv.count(s.player.inv, 'ammo_9mm')).toBe(0);
    teleport(s, { x: s.player.x + 120, y: s.player.y }); run(s, 2);
    teleport(s, { x: s.player.x - 120, y: s.player.y }); run(s, 3);
    expect(inv.count(s.player.inv, 'ammo_9mm')).toBe(72);
  });
});

describe('The Long Road: hold-outs wait for you', () => {
  it('spawns no waves and runs no clock until the player reaches the position', () => {
    const s = road.newRoad(); s.ui = null; tick(s);
    solve(s); solve(s);                          // shotgun, yard cleared -> the gate hold-out is current
    const o = road.current(s)!, runO = road.currentRun(s)!;
    expect(o.kind).toBe('holdout');
    teleport(s, { x: runO.point.x - 1200, y: runO.point.y }); for (const z of s.zombies) z.dead = true;
    run(s, 600);                                  // ten seconds, far away
    expect(s.zombies.filter(z => !z.dead && (z as any).roadTag === runO.tag).length).toBe(0);
    expect(runO.timer).toBe(45); expect(runO.armed).toBeFalsy();
    expect(road.objectiveText(s)).toContain('Get to the position');
    teleport(s, runO.point); run(s, 120);
    expect(runO.armed).toBe(true); expect(runO.timer).toBeLessThan(45);
  });
});

describe('The Long Road: bags on the ground', () => {
  it('keeps the checkpoint cache after MISSION COMPLETE and clears only its own bags on a restart', () => {
    const s = road.newRoad(); s.ui = null; tick(s);
    const r = s.road!;
    while (r.phase === 'play') solve(s);
    const camp = road.campOf(s, 0);
    const atCamp = () => s.drops.filter(d => Math.hypot(d.x - camp.x, d.y - camp.y) < 200 && !d.quest);
    const before = atCamp().length;
    expect(before).toBeGreaterThan(0);
    s.ui = null; tick(s);                       // mission 2 starts at that camp
    expect(r.mission).toBe(1); expect(atCamp().length).toBe(before);
    s.ui = null; tick(s);                       // briefing dismissed
    const mine = s.drops.filter(d => d.mission === 1).length;
    expect(mine).toBeGreaterThan(0);
    s.player.hp = 0; tick(s); road.restart(s);
    expect(atCamp().length).toBe(before);       // mission 1's cache is still there
    expect(s.drops.filter(d => d.mission === 1).length).toBe(mine);   // mission 2's bags were re-placed, not duplicated
  });
});

describe('The Long Road: clear objectives never stall', () => {
  it('drives the last tagged zombies to the player and completes once they die', () => {
    const s = road.newRoad(); s.ui = null; tick(s);
    const r = s.road!;
    solve(s);                                   // shotgun -> "clear the station yard" starts
    const runO = road.currentRun(s)!;
    const tagged = s.zombies.filter(z => (z as any).roadTag === runO.tag);
    expect(tagged.length).toBe(runO.need);
    // kill all but two, park those two far away and idle, as if they had wandered into a back lot
    for (const z of tagged.slice(2)) zombies.damage(s, z, 1e6, 0);
    for (const z of tagged.slice(0, 2)) { z.x = z.prevX = runO.point.x + 1500; z.y = z.prevY = runO.point.y; z.state = 'idle'; }
    teleport(s, runO.point); run(s, 400);
    for (const z of tagged.slice(0, 2)) {
      expect(Math.hypot(z.x - s.player.x, z.y - s.player.y)).toBeLessThan(900);   // relocated near the player
      expect(['chase', 'investigate']).toContain(z.state);
    }
    expect(road.objectiveText(s)).toContain('2 left');
    killAll(s); run(s, 3);
    expect(r.step).toBe(2);
  });
});

describe('The Long Road: no container searching', () => {
  it('never offers a cabinet to search; supplies come from the bags placed in buildings', () => {
    const s = road.newRoad(); s.ui = null; tick(s);
    expect(s.containers.every(c => c.searched)).toBe(true);
    const c = s.containers.find(c => core.phys.isFree(s, c.x + c.w / 2, c.y + c.h + 30, 14))!;
    teleport(s, { x: c.x + c.w / 2, y: c.y + c.h + 30 }); for (const z of s.zombies) z.dead = true;
    tick(s, { pressed: new Set(['interact']) }); run(s, 30, { interactHeld: true });
    expect(s.interact).toBeNull(); expect(s.search).toBeNull(); expect(s.ui).toBeNull();
    const sec = s.road!.world.sectors[0].rect;
    const indoors = s.drops.filter(d => d.mission === 0 && s.buildings.some(b => d.x > b.x && d.x < b.x + b.w && d.y > b.y && d.y < b.y + b.h && b.x >= sec.x && b.x < sec.x + sec.w));
    expect(indoors.length).toBeGreaterThan(10);
  });
});

describe('The Long Road: the route is walkable', () => {
  it.each(['long-road', 'group-in-need'] as const)('%s reaches every objective point on foot from the mission start (BFS over free cells)', story => {
    let s = road.newRoad();
    if (story === 'group-in-need') {
      road.startMission(s, 9); road.begin(s);
      while (s.road!.phase === 'play') road.devSkip(s);
      s = road.newGroupInNeed()!;
    }
    const missions = road.missionsOf(s);
    const CELL = 20, R = 13;
    for (let m = 0; m < missions.length; m++) {
      road.startMission(s, m);
      const r = s.road!, sec = r.world.sectors[missions[m].sector].rect;
      const prev = m > 0 ? r.world.sectors[missions[m - 1].sector].rect : sec;
      const x0 = Math.min(sec.x, prev.x), y0 = Math.min(sec.y, prev.y), x1 = Math.max(sec.x + sec.w, prev.x + prev.w), y1 = Math.max(sec.y + sec.h, prev.y + prev.h);
      const cols = Math.ceil((x1 - x0) / CELL), rows = Math.ceil((y1 - y0) / CELL);
      const seen = new Uint8Array(cols * rows);
      const key = (x: number, y: number) => Math.floor((y - y0) / CELL) * cols + Math.floor((x - x0) / CELL);
      const queue: number[] = [];
      const push = (x: number, y: number) => { if (x < x0 || y < y0 || x >= x1 || y >= y1) return; const k = key(x, y); if (seen[k]) return; seen[k] = 1; if (core.phys.isFree(s, x, y, R)) { seen[k] = 2; queue.push(k); } };
      // start from the player's actual cell
      push(s.player.x, s.player.y);
      if (!queue.length) { // nudge: the start may sit on a cell boundary
        for (const [dx, dy] of [[CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL]]) push(s.player.x + dx, s.player.y + dy);
      }
      while (queue.length) {
        const k = queue.pop()!, cx = x0 + (k % cols) * CELL + CELL / 2, cy = y0 + Math.floor(k / cols) * CELL + CELL / 2;
        push(cx + CELL, cy); push(cx - CELL, cy); push(cx, cy + CELL); push(cx, cy - CELL);
      }
      const reachable = (p: { x: number; y: number }) => {
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = p.x + dx * CELL, y = p.y + dy * CELL; if (x >= x0 && y >= y0 && x < x1 && y < y1 && seen[key(x, y)] === 2) return true; }
        return false;
      };
      missions[m].objectives.forEach((o, i) => {
        const pt = r.objectives[i].point;
        expect(reachable(pt), `mission ${m + 1} "${missions[m].title}" objective ${i + 1} "${o.text}" at ${Math.round(pt.x)},${Math.round(pt.y)}`).toBe(true);
      });
      for (const d of s.drops) if (d.mission === m) expect(reachable(d), `mission ${m + 1} pickup ${d.inv.slots[0]?.id} at ${Math.round(d.x)},${Math.round(d.y)}`).toBe(true);
    }
  }, 30000);
});
