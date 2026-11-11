import { beforeEach, describe, expect, it } from 'vitest';
import * as road from '../src/sim/road';
import { NEED_MISSIONS } from '../src/sim/need-data';
import { createSquad, updateSquad } from '../src/sim/road-squad';
import * as core from '../src/sim/core';
import * as zombies from '../src/sim/zombies';
import * as combat from '../src/sim/combat';
import * as progression from '../src/sim/progression';
import * as pathing from '../src/sim/pathing';
import { NEUTRAL_INPUT } from '../src/input';
import type { GameState, Vec } from '../src/sim/types';

beforeEach(() => {
  const store = new Map<string, string>();
  Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
});

function finishFirstStory() {
  const s = road.newRoad('scout');
  s.player.sp = 50;
  expect(progression.unlock(s, 'survival_pack1')).toBe(true);
  expect(progression.unlock(s, 'survival_pack2')).toBe(true);
  s.player.level = 16; s.player.xp = 123;
  s.player.inv.equip.primary = { id: 'assault_rifle', qty: 1, mag: 17, lvl: 3 };
  road.startMission(s, 9); road.begin(s);
  while (s.road!.phase === 'play') road.devSkip(s);
  road.next(s);
  return road.readSave()!;
}
const tick = (s: GameState) => road.stepRoad(s, NEUTRAL_INPUT(s.player.x + 100, s.player.y), core.SIM_DT);
const killAll = (s: GameState) => { for (const z of s.zombies) if (!z.dead) zombies.damage(s, z, 1e6, 0); };
function teleport(s: GameState, at: Vec, squad = false) {
  s.player.x = s.player.prevX = at.x; s.player.y = s.player.prevY = at.y;
  core.phys.collideCircle(s, s.player);
  if (squad) createSquad(s, s.player, true);
}

describe('A group in need', () => {
  it('allows a fresh test run without creating or completing a Long Road save', () => {
    expect(road.canStartGroupInNeed()).toBe(false);
    expect(road.devUnlockGroupInNeed()).toBe(true);
    expect(road.canStartGroupInNeed()).toBe(true);
    const s = road.newGroupInNeed()!;
    expect(s.road!.story).toBe('group-in-need'); expect(s.road!.mission).toBe(0);
    expect(s.player.level).toBe(1); expect(road.readSave()).toBeNull();
    const checkpoint = localStorage.getItem(road.NEED_SAVE_KEY);
    road.devUnlockGroupInNeed();
    expect(localStorage.getItem(road.NEED_SAVE_KEY)).toBe(checkpoint);
    expect(road.hasGroupInNeedTestUnlock()).toBe(true);
  });

  it('uses an unfinished Long Road checkpoint for testing without modifying it', () => {
    const first = road.newRoad('scout'); first.player.sp = 5;
    expect(progression.unlock(first, 'survival_pack1')).toBe(true);
    road.startMission(first, 1);
    const original = localStorage.getItem(road.ROAD_SAVE_KEY);
    expect(road.newGroupInNeed()).toBeNull();
    road.devUnlockGroupInNeed();
    const sequel = road.newGroupInNeed()!;
    expect(sequel.player.character).toBe('scout'); expect(sequel.player.tech.survival_pack1).toBe(true);
    expect(sequel.player.sp).toBe(first.player.sp);
    expect(localStorage.getItem(road.ROAD_SAVE_KEY)).toBe(original);
    expect(road.readSave()!.done).toBe(false);
  });

  it('requires a completed Long Road and imports skills, unspent points, gear and character without changing its save', () => {
    expect(road.newGroupInNeed()).toBeNull();
    const source = finishFirstStory(), raw = localStorage.getItem(road.ROAD_SAVE_KEY);
    const s = road.newGroupInNeed()!;
    expect(s.player.tech).toEqual(source.snapshot.tech);
    expect(s.player.tech.survival_pack2).toBe(true);
    expect(s.player.sp).toBe(source.snapshot.sp);
    expect(s.player.level).toBe(16); expect(s.player.xp).toBe(123);
    expect(s.player.character).toBe('scout');
    expect(s.player.inv.equip).toEqual(source.snapshot.equip);
    expect(s.road!.world.gates.every(g => g.open)).toBe(true);
    expect(s.player).toMatchObject(road.campOf(s, -1));
    expect(localStorage.getItem(road.ROAD_SAVE_KEY)).toBe(raw);
    // Loading a completed chapter must preserve the final survivor and completion flag.
    const ended = road.continueRoad()!;
    expect(ended.road!.phase).toBe('ended'); expect(ended.player.tech).toEqual(source.snapshot.tech);
    expect(localStorage.getItem(road.ROAD_SAVE_KEY)).toBe(raw);
  });

  it('plays all ten missions, rescues the squad and saves a separate completed homecoming', () => {
    finishFirstStory(); const original = localStorage.getItem(road.ROAD_SAVE_KEY), s = road.newGroupInNeed()!;
    s.dev = { god: true, freeze: false, timeScale: 1 };
    expect(NEED_MISSIONS).toHaveLength(10);
    for (let m = 0; m < NEED_MISSIONS.length; m++) {
      expect(s.road!.mission).toBe(m); road.begin(s);
      let guard = 0;
      while (s.road!.phase === 'play' && guard++ < 20) {
        const o = road.current(s)!, run = road.currentRun(s)!;
        if (o.kind === 'clear') { killAll(s); tick(s); }
        else if (o.kind === 'boss') { teleport(s, run.point, m >= 5); tick(s); expect(run.bossId).toBeTruthy(); killAll(s); tick(s); }
        else if (o.kind === 'pickup') { const d = s.drops.find(d => d.quest && d.inv.slots[0]?.id === o.item)!; expect(d).toBeTruthy(); teleport(s, d); tick(s); }
        else if (o.kind === 'interact') {
          teleport(s, run.point);
          for (let t = 0; t < 400 && !run.done; t++) road.stepRoad(s, { ...NEUTRAL_INPUT(0, 0), interactHeld: true }, core.SIM_DT);
        } else if (o.kind === 'holdout') {
          teleport(s, run.point, m >= 5);
          for (let t = 0; t < o.seconds * 60 + 10 && !run.done; t++) { if (t % 60 === 0) killAll(s); tick(s); }
        } else {
          killAll(s); teleport(s, run.point, o.kind === 'escort' || (m >= 4 && o.kind === 'camp')); tick(s);
          if (o.kind === 'rescue') expect(s.road!.allies.every(a => a.following)).toBe(true);
        }
        expect(run.done, `Mission ${m + 1}: ${o.text}`).toBe(true);
      }
      expect(s.road!.phase).toBe('complete');
      expect(road.readSave('group-in-need')!.mission).toBe(Math.min(m + 1, 9));
      road.next(s);
    }
    expect(s.road!.phase).toBe('ended'); expect(road.readSave('group-in-need')!.done).toBe(true);
    expect(s.road!.allies).toHaveLength(4);
    expect(Math.hypot(s.player.x - road.campOf(s, -1).x, s.player.y - road.campOf(s, -1).y)).toBeLessThan(100);
    expect(localStorage.getItem(road.ROAD_SAVE_KEY)).toBe(original);
  }, 60000);

  it('does not complete an escort or checkpoint until all four arrive; restores the squad on retry and reload', () => {
    finishFirstStory(); const s = road.newGroupInNeed()!;
    road.startMission(s, 5); road.begin(s);
    const run = road.currentRun(s)!;
    teleport(s, run.point); tick(s); expect(run.done).toBe(false);
    createSquad(s, s.player, true); tick(s); expect(run.done).toBe(true);
    road.restart(s);
    expect(s.road!.step).toBe(0); expect(s.road!.allies).toHaveLength(4);
    expect(s.road!.allies.every(a => a.following)).toBe(true);
    const raw = localStorage.getItem(road.NEED_SAVE_KEY), loaded = road.continueRoad('group-in-need')!;
    expect(loaded.road!.mission).toBe(5); expect(loaded.road!.allies).toHaveLength(4);
    expect(loaded.player.tech).toEqual(s.player.tech);
    expect(localStorage.getItem(road.NEED_SAVE_KEY)).toBe(raw);
    while (road.current(s)!.kind !== 'camp') road.devSkip(s);
    teleport(s, road.currentRun(s)!.point); killAll(s); tick(s);
    expect(s.road!.phase).toBe('play');
    createSquad(s, s.player, true); tick(s); expect(s.road!.phase).toBe('complete');
  });

  it('fires real bullets that damage zombies, and cannot fire through walls', () => {
    finishFirstStory(); const s = road.newGroupInNeed()!;
    // Isolated physical arena: avoid incidental map geometry or ambient AI.
    s.grid = new core.Grid(16000, 16000, core.CELL); s.zombies = [];
    teleport(s, { x: 1000, y: 1000 }); createSquad(s, s.player, true);
    const z = zombies.spawn(s, 'walker', 1250, 1000), hp = z.hp;
    const ammo = JSON.stringify(s.player.inv);
    for (let i = 0; i < 30; i++) { updateSquad(s, core.SIM_DT); combat.update(s, NEUTRAL_INPUT(0, 0), core.SIM_DT); }
    expect(z.hp).toBeLessThan(hp); expect(JSON.stringify(s.player.inv)).toBe(ammo);
    s.bullets = []; for (const a of s.road!.allies) a.cooldown = 0;
    core.phys.addSolid(s, { x: 1100, y: 800, w: 40, h: 400, kind: 'wall', solid: true, blocksBullets: true, blocksSight: true });
    updateSquad(s, 1); expect(s.bullets).toHaveLength(0);
  });

  it('routes all four followers around a wall and through a doorway without teleporting', () => {
    finishFirstStory(); const s = road.newGroupInNeed()!;
    s.grid = new core.Grid(16000, 16000, core.CELL); s.zombies = [];
    core.phys.addSolid(s, { x: 1200, y: 700, w: 40, h: 470, kind: 'wall', solid: true, blocksBullets: true, blocksSight: true });
    core.phys.addSolid(s, { x: 1200, y: 1234, w: 40, h: 500, kind: 'wall', solid: true, blocksBullets: true, blocksSight: true });
    teleport(s, { x: 1000, y: 1000 }); createSquad(s, s.player, true);
    teleport(s, { x: 1500, y: 1000 });
    for (let i = 0; i < 1200; i++) {
      const before = s.road!.allies.map(a => ({ x: a.x, y: a.y }));
      pathing.tick(s, core.SIM_DT); updateSquad(s, core.SIM_DT);
      for (let j = 0; j < 4; j++) expect(Math.hypot(s.road!.allies[j].x - before[j].x, s.road!.allies[j].y - before[j].y)).toBeLessThan(30);
    }
    for (const a of s.road!.allies) { expect(a.x).toBeGreaterThan(1240); expect(Math.hypot(a.x - s.player.x, a.y - s.player.y)).toBeLessThan(200); }
  });

  it('walks the actual return route with all four followers, through every escort destination and sector gate', () => {
    finishFirstStory(); const s = road.newGroupInNeed()!;
    for (let m = 4; m < 10; m++) {
      road.startMission(s, m);
      if (m === 4) {
        const rescue = s.road!.objectives[NEED_MISSIONS[m].objectives.findIndex(o => o.kind === 'rescue')].point;
        teleport(s, rescue); createSquad(s, s.player, true);
      }
      const sec = road.sectorOf(s).rect, prev = s.road!.world.sectors[NEED_MISSIONS[Math.max(0, m - 1)].sector].rect;
      const bounds = { x: Math.min(sec.x, prev.x), y: Math.min(sec.y, prev.y),
        w: Math.max(sec.x + sec.w, prev.x + prev.w) - Math.min(sec.x, prev.x),
        h: Math.max(sec.y + sec.h, prev.y + prev.h) - Math.min(sec.y, prev.y) };
      for (let j = 0; j < NEED_MISSIONS[m].objectives.length; j++) {
        const o = NEED_MISSIONS[m].objectives[j];
        if (o.kind !== 'escort' && o.kind !== 'camp') continue;
        const goal = s.road!.objectives[j].point;
        const route = walkingRoute(s, goal, bounds);
        expect(route.length, `Path to ${o.text}`).toBeGreaterThan(0);
        for (const waypoint of route) {
          let d = Math.hypot(waypoint.x - s.player.x, waypoint.y - s.player.y);
          while (d > 1) {
            const dx = (waypoint.x - s.player.x) / d, dy = (waypoint.y - s.player.y) / d;
            s.player.vx = dx * 190; s.player.vy = dy * 190;
            s.player.x += dx * Math.min(d, 19); s.player.y += dy * Math.min(d, 19);
            pathing.tick(s, 0.1); updateSquad(s, 0.1);
            d = Math.hypot(waypoint.x - s.player.x, waypoint.y - s.player.y);
          }
        }
        s.player.vx = s.player.vy = 0;
        for (let t = 0; t < 300; t++) { pathing.tick(s, 0.1); updateSquad(s, 0.1); }
        for (const a of s.road!.allies) expect(Math.hypot(a.x - goal.x, a.y - goal.y), `${a.name} reaches mission ${m + 1}: ${o.text}`).toBeLessThan(240);
      }
    }
  }, 60000);
});

/** Independent coarse BFS walks the player along real, collision-free streets. Companions use their own AI. */
function walkingRoute(s: GameState, goal: Vec, bounds: Vec & { w: number; h: number }): Vec[] {
  const cell = 32, cols = Math.ceil(bounds.w / cell), rows = Math.ceil(bounds.h / cell);
  const at = (k: number) => ({ x: bounds.x + (k % cols) * cell + cell / 2, y: bounds.y + Math.floor(k / cols) * cell + cell / 2 });
  const key = (p: Vec) => Math.floor((p.y - bounds.y) / cell) * cols + Math.floor((p.x - bounds.x) / cell);
  const parent = new Int32Array(cols * rows).fill(-2), queue: number[] = [];
  const root = key(s.player); parent[root] = -1; queue.push(root);
  let found = -1;
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head], p = at(k);
    if (Math.hypot(p.x - goal.x, p.y - goal.y) < 55) { found = k; break; }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = k % cols + dc, r = Math.floor(k / cols) + dr;
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const n = r * cols + c; if (parent[n] !== -2) continue;
      const q = at(n);
      if (!core.phys.isFree(s, q.x, q.y, 14) || core.phys.raycast(s, p.x, p.y, q.x, q.y, 14, o => o.solid !== false)) continue;
      parent[n] = k; queue.push(n);
    }
  }
  if (found < 0) return [];
  const result: Vec[] = [];
  for (let k = found; k >= 0; k = parent[k]) result.push(at(k));
  return result.reverse();
}
