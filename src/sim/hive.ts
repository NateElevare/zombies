// hive.ts — what makes the insects of "The Hive Below" a swarm: burrows that send columns, the Drone's alarm
// pheromone, the Honeypot's honey, eggs that hatch and Grubs that grow up. Pure sim (rand(state) only).
// The creatures themselves are ordinary zombies (sim/zombies.ts TYPES); burrow mouths and egg clusters are inert
// zombies, so every weapon, fire and corrosion already hurts them. sim/road.ts calls update() once per tick.
import { emit, phys, rand, sound } from './core';
import type { GameState, Vec, Zombie, ZombieType } from './types';
import * as zombies from './zombies';
import type { Weights } from './road-data';
import { isFloor } from './hive-world';
import { perkSum } from './progression';
import * as bugs from './hive-bugs';
import * as arms from './hive-arms';

/** How many live bugs the hive keeps around the player (fixtures and bosses not counted). */
/** The most bugs the hive keeps alive at once. 120 in the first build; doubled after Nate's second play (he wants the massive swarm). */
export const SWARM_CAP = 240;
export const ALARM_RANGE = 600, ALARM_TIME = 12, FRENZY_RANGE = 150, FRENZY_COUNT = 5, FRENZY_MUL = 1.2, RALLY_MUL = 1.3;
export const HONEY_R = 62, HONEY_TIME = 7, HONEY_SLOW = 0.5;
export const GRUB_GROWS = 25, HATCH_RANGE = 230, HATCH_TIME = 1.6;
/** Burrow columns must start inside the shared flow field around the player (pathing.RADIUS), or they cannot find the way. */
const COLUMN_MIN = 300, COLUMN_MAX = 840, COLUMN_GAP = 0.18;
export const FIXTURE = 'fixture';
/** You come down here with upgraded guns, skills and a full backpack, so everything in the hive is tougher than its
 *  base numbers (zombies.ts TYPES, bosses.ts BOSSES): health x1.5 and damage x1.3. A mission can set its own (`tough`). */
export interface Toughness { hp: number; dmg: number }
export const TOUGH: Toughness = { hp: 1.5, dmg: 1.3 };
/** Supplies from kills. The swarm is about three times the size of the city's dead, so each kill pays out about a third
 *  as often: per kill 3% ichor, 1.5% ordinary ammunition, 0.7% a bandage (the city: 4.5% ammunition, 2% a bandage).
 *  Ichor for the insect guns comes mostly from collapsed burrows, the hive's own crates and the camps. */
export const ICHOR_DROP = 0.03, AMMO_DROP = 0.015, BANDAGE_DROP = 0.007;

export interface SwarmDef {
  /** live bugs the burrows keep up */ cap: number;
  /** seconds between columns */ every: number;
  /** bugs per column */ size: [number, number];
}
export interface HoneyPool extends Vec { r: number; life: number; max: number }
interface Column extends Vec { left: number; t: number; types: Weights; tag?: string; horde: boolean; rally?: boolean }
export interface HiveRuntime {
  pools: HoneyPool[]; columns: Column[]; swarmT: number; senseT: number;
  // ---- the cells beyond the Warrens (sim/hive-bugs.ts, sim/hive-arms.ts). All of it is per mission: reset() clears it.
  /** Stinger venom on you: stacks and seconds left */ venom?: { n: number; t: number; acc: number };
  /** Dustwing dust on your lamp: seconds left (the beam reaches 40% less far) */ dust?: number;
  /** Skitterers that will get back up */ revives?: (Vec & { t: number })[];
  /** the cell's hazard: locust lanes about to sweep, steam vents and their clocks */ lanes?: (Vec & { angle: number; len: number; t: number })[]; laneT?: number;
  vents?: (Vec & { t: number; warned: boolean })[];
  /** thrown things in the air, lures on the floor, clouds of flies */ lobs?: (Vec & { kind: 'lure' | 'pod'; sx: number; sy: number; tx: number; ty: number; t: number; T: number })[];
  lures?: (Vec & { life: number; dmg: number })[]; clouds?: (Vec & { r: number; life: number; acc: number; dps: number })[];
}
export type Bug = Zombie & {
  roadTag?: string; _roadScored?: boolean; seesPlayer?: boolean; memory?: number; losTimer?: number; mul?: number;
  /** seconds of pheromone trail left: it keeps walking to wherever the player is */ alarm?: number;
  /** seconds of the Marshal's rally left */ rally?: number;
  /** grub: seconds alive */ age?: number;
  /** egg cluster: hatch countdown once the player has come close (renderer: wobble) */ hatchT?: number;
  /** burrow: seconds since it last sent a column (renderer: eruption) */ eruptT?: number;
  /** the hive's toughness has been applied to this one (once) */ tough?: boolean;
  /** bosses: multiplier on the damage of their special attacks (bosses.ts) */ bossMul?: number;
  /** seconds of a Shrieker's chorus left: it hurries */ chorus?: number;
};

const rt = (state: GameState): HiveRuntime => (state.road!.hiveRt ??= { pools: [], columns: [], swarmT: 6, senseT: 0 });
export const runtime = (state: GameState): HiveRuntime | null => state.road?.hiveRt ?? null;
export function reset(state: GameState) { if (state.road) state.road.hiveRt = { pools: [], columns: [], swarmT: 6, senseT: 0 }; }
const isBug = (z: Zombie) => !z.dead && !z.boss && !zombies.isInert(z);
const onFloor = (state: GameState, x: number, y: number) => { const h = state.road?.world.hive; return !h || isFloor(h, x, y); };
export function liveBugs(state: GameState) { let n = 0; for (const z of state.zombies) if (isBug(z)) n++; return n; }
export const burrowsAlive = (state: GameState) => state.zombies.filter(z => !z.dead && z.type === 'burrow');

function pickType(w: Weights, roll: number): ZombieType {
  const entries = Object.entries(w) as [ZombieType, number][];
  let total = 0; for (const [, v] of entries) total += v;
  let at = roll * total;
  for (const [k, v] of entries) { at -= v; if (at <= 0) return k; }
  return entries[0]?.[0] ?? 'drone';
}
/** One bug, already on the player's trail. `horde` = it never gives up (hold-outs, the Marshal's rally). */
export function spawnBug(state: GameState, type: ZombieType, x: number, y: number, horde = false, tag?: string): Bug {
  const z = zombies.spawn(state, type, x, y, horde) as Bug, p = state.player;
  z.state = 'chase'; z.target = { x: p.x, y: p.y }; z.memory = ALARM_TIME; z.alarm = ALARM_TIME;
  if (tag) z.roadTag = tag;
  return z;
}
/** A fixture: a burrow mouth or an egg cluster. */
export function spawnFixture(state: GameState, type: 'burrow' | 'egg', at: Vec, tag = FIXTURE): Bug {
  const z = zombies.spawn(state, type, at.x, at.y) as Bug;
  z.roadTag = tag; z.eruptT = 99; z.hatchT = 0;
  return z;
}
/** Queue `n` bugs to climb out at (x,y), one after another. */
export function column(state: GameState, at: Vec, n: number, types: Weights, opts: { tag?: string; horde?: boolean; rally?: boolean } = {}) {
  rt(state).columns.push({ x: at.x, y: at.y, left: n, t: 0, types, tag: opts.tag, horde: !!opts.horde, rally: opts.rally });
}

/** Apply the hive's toughness to everything that has arrived since the last tick. Called before anything can be hit, so a
 *  bug never fights at its base numbers. Egg clusters stay fragile (they are meant to be broken from a distance). */
export function toughen(state: GameState, t: Toughness = TOUGH) {
  for (const z of state.zombies as Bug[]) {
    if (z.tough || z.dead) continue;
    z.tough = true;
    if (z.type === 'egg') continue;
    z.maxHp = Math.round(z.maxHp * t.hp); z.hp = Math.round(z.hp * t.hp);
    z.damage *= t.dmg;
    if (z.boss && typeof z.bossMul === 'number') z.bossMul *= t.dmg;
  }
}

/** Something died this tick (called by road.rewardKills before scoring). Returns extra loot to drop there. */
export function onDeath(state: GameState, z: Zombie): { id: string; qty: number }[] {
  const loot: { id: string; qty: number }[] = [];
  // Hive Weapons perk "Harvester": ichor from kills twice as often, half again as much from burrows and eggs
  const harvest = perkSum(state, 'ichorDrop'), more = (n: number) => Math.round(n * (1 + 0.5 * harvest));
  if (z.type === 'honeypot') {
    rt(state).pools.push({ x: z.x, y: z.y, r: HONEY_R, life: HONEY_TIME, max: HONEY_TIME });
    emit(state, { t: 'hive', kind: 'honey', x: z.x, y: z.y });
  } else if (z.type === 'burrow') {
    emit(state, { t: 'hive', kind: 'collapse', x: z.x, y: z.y });
    state.shake = Math.max(state.shake, 9); sound(state, 'explosion', z.x, z.y);
    loot.push({ id: 'ichor', qty: more(24 + Math.floor(rand(state) * 13)) });
  } else if (z.type === 'egg' && (z as bugs.HBug).cocoon) {
    // a silk cocoon: supplies, or a Lurker that was waiting inside it
    if (rand(state) < 0.4) { const l = spawnBug(state, 'lurker', z.x, z.y) as bugs.HBug; l.do = 'reveal'; l.doT = 0; }
    else loot.push(rand(state) < 0.5 ? { id: 'ichor', qty: more(40 + Math.floor(rand(state) * 30)) } : { id: 'royal_jelly', qty: 1 }, { id: 'bandage', qty: 2 });
  } else if (z.type === 'egg') {
    const roll = rand(state);
    if (roll < 0.25) loot.push({ id: 'ichor', qty: more(10 + Math.floor(rand(state) * 9)) });
    else if (roll < 0.33) loot.push({ id: 'royal_jelly', qty: 1 });
  } else if (zombies.isHiveType(z.type) || z.boss) {
    bugs.onDeath(state, z);
    if (z.boss) loot.push({ id: 'ichor', qty: 120 });
    else if (rand(state) < ICHOR_DROP * (1 + harvest)) loot.push({ id: 'ichor', qty: 12 + Math.floor(rand(state) * 9) });
  }
  return loot;
}

/** The Marshal's rally: two columns of eight march in, and every Drone near it speeds up. */
export function rally(state: GameState, boss: Zombie) {
  const p = state.player;
  for (const z of state.zombies as Bug[]) if (isBug(z) && z.type === 'drone' && Math.hypot(z.x - boss.x, z.y - boss.y) < 900) z.rally = 8;
  if (liveBugs(state) + 16 > SWARM_CAP) return;
  // from the two nearest burrows if any are close, otherwise from the dark on either side of the arena
  const near = burrowsAlive(state).filter(b => Math.hypot(b.x - boss.x, b.y - boss.y) < 900).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const spots: Vec[] = near.slice(0, 2).map(b => ({ x: b.x, y: b.y }));
  const base = Math.atan2(p.y - boss.y, p.x - boss.x);
  for (let k = 0; spots.length < 2 && k < 24; k++) {
    const a = base + (spots.length ? -1 : 1) * (Math.PI / 2) + (rand(state) - 0.5) * 1.2, d = 300 + rand(state) * 260;
    const x = boss.x + Math.cos(a) * d, y = boss.y + Math.sin(a) * d;
    // solid rock has no colliders of its own, so "free" is not enough: it has to be carved floor
    if (phys.isFree(state, x, y, 20) && onFloor(state, x, y) && Math.hypot(x - p.x, y - p.y) > 240) spots.push({ x, y });
  }
  for (const s of spots) { column(state, s, 8, { drone: 1 }, { horde: true, rally: true }); emit(state, { t: 'hive', kind: 'erupt', x: s.x, y: s.y }); }
  emit(state, { t: 'hive', kind: 'rally', x: boss.x, y: boss.y });
  sound(state, 'horde', boss.x, boss.y);
}

function sense(state: GameState, step: number) {
  const p = state.player, r = rt(state), list = state.zombies as Bug[];
  // ---- alarm pheromone: the first drone to see you marks you; every drone within ALARM_RANGE of it joins in
  const sources: Bug[] = [];
  for (const z of list) if (isBug(z) && z.type === 'drone' && z.seesPlayer) { z.alarm = ALARM_TIME; sources.push(z); }
  let newly = 0;
  for (const z of list) {
    if (!isBug(z)) continue;
    if (z.type === 'drone' && !z.seesPlayer && (z.alarm ?? 0) <= 0) {
      for (const s of sources) if (Math.abs(s.x - z.x) < ALARM_RANGE && Math.abs(s.y - z.y) < ALARM_RANGE && Math.hypot(s.x - z.x, s.y - z.y) < ALARM_RANGE) { z.alarm = ALARM_TIME; newly++; break; }
    }
    if ((z.alarm ?? 0) > 0) {
      z.alarm! -= step;
      // on the trail: walk to where the player is now, not to where they were first seen
      if (!z.horde && !p.dead) { z.target = { x: p.x, y: p.y }; z.memory = Math.max(z.memory ?? 0, 1.5); if (z.state !== 'chase') z.state = 'investigate'; }
    }
    if ((z.rally ?? 0) > 0) z.rally! -= step;
    if ((z.chorus ?? 0) > 0) z.chorus! -= step;
    // ---- grubs grow up
    if (z.type === 'grub') {
      z.age = (z.age ?? 0) + step;
      if (z.age >= GRUB_GROWS && liveBugs(state) < SWARM_CAP) {
        z.dead = true; z._roadScored = true;   // it did not die: no kill, no reward
        const adult = spawnBug(state, bugs.adult(state), z.x, z.y);
        adult.angle = adult.prevAngle = z.angle;
        emit(state, { t: 'blood', x: z.x, y: z.y, amount: 6, angle: z.angle, ichor: true });
      }
    }
  }
  if (newly >= 3 && Math.hypot(sources[0].x - p.x, sources[0].y - p.y) < 700) sound(state, 'groan', sources[0].x, sources[0].y);
  // ---- speed: five or more drones together hurry; the rally hurries them more; honey halves everything
  const drones = list.filter(z => isBug(z) && z.type === 'drone');
  const crowd = new Uint8Array(drones.length);
  for (let i = 0; i < drones.length; i++) for (let j = i + 1; j < drones.length; j++) {
    const a = drones[i], b = drones[j], dx = a.x - b.x, dy = a.y - b.y;
    if (dx < FRENZY_RANGE && dx > -FRENZY_RANGE && dy < FRENZY_RANGE && dy > -FRENZY_RANGE && dx * dx + dy * dy < FRENZY_RANGE * FRENZY_RANGE) { if (crowd[i] < 250) crowd[i]++; if (crowd[j] < 250) crowd[j]++; }
  }
  drones.forEach((z, i) => { z.mul = (z.rally ?? 0) > 0 ? RALLY_MUL : crowd[i] >= FRENZY_COUNT - 1 ? FRENZY_MUL : 1; });
  for (const z of list) {
    if (!isBug(z)) continue;
    if (z.type !== 'drone') z.mul = 1;
    if ((z.chorus ?? 0) > 0) z.mul = (z.mul ?? 1) * bugs.CHORUS_MUL;   // a Shrieker has screamed
    if (bugs.flies(z)) continue;                                        // nothing on the floor slows what flies over it
    for (const q of r.pools) if (Math.hypot(z.x - q.x, z.y - q.y) < q.r + z.r * 0.5) { z.mul = (z.mul ?? 1) * HONEY_SLOW; break; }
  }
  // ---- eggs: linger close to a cluster and it hatches
  for (const z of list as bugs.HBug[]) {
    if (z.dead || z.type !== 'egg' || z.noHatch) continue;
    if (!(z.hatchT! > 0)) {
      if (Math.hypot(z.x - p.x, z.y - p.y) < HATCH_RANGE && phys.lineOfSight(state, z.x, z.y, p.x, p.y)) z.hatchT = step;
      continue;
    }
    z.hatchT! += step;
    if (z.hatchT! < (z.hatchTime ?? HATCH_TIME)) continue;
    z.dead = true; z._roadScored = true;
    // a brood comb hatches Stingers, a corpse heap Grubs (hive-bugs.ts); an ordinary cluster three or four Grubs
    const n = z.broodN ?? 3 + (rand(state) < 0.5 ? 1 : 0), brood = z.brood ?? 'grub';
    for (let i = 0; i < n && liveBugs(state) < SWARM_CAP; i++) {
      const a = rand(state) * Math.PI * 2, x = z.x + Math.cos(a) * 20, y = z.y + Math.sin(a) * 20;
      const ok = phys.isFree(state, x, y, 9) && onFloor(state, x, y);
      spawnBug(state, brood, ok ? x : z.x, ok ? y : z.y);
    }
    emit(state, { t: 'hive', kind: 'hatch', x: z.x, y: z.y });
    sound(state, 'zombieDie', z.x, z.y);
  }
}

/** Send the next column from a burrow the player can get to know: close enough to path, far enough to see it coming. */
function swarm(state: GameState, def: SwarmDef, types: Weights, pressure: number) {
  const r = rt(state), p = state.player;
  const queued = r.columns.reduce((n, c) => n + c.left, 0);
  if (liveBugs(state) + queued + def.size[0] > Math.min(def.cap, SWARM_CAP)) { r.swarmT = 2; return; }
  const near = burrowsAlive(state).filter(b => {
    const dx = Math.abs(b.x - p.x), dy = Math.abs(b.y - p.y), d = Math.hypot(dx, dy);
    return dx < COLUMN_MAX && dy < COLUMN_MAX && d > COLUMN_MIN;
  });
  if (!near.length) { r.swarmT = 1.5; return; }
  const b = near[Math.floor(rand(state) * near.length)] as Bug;
  const n = def.size[0] + Math.floor(rand(state) * (def.size[1] - def.size[0] + 1));
  column(state, b, n, types);
  b.eruptT = 0; emit(state, { t: 'hive', kind: 'erupt', x: b.x, y: b.y });
  if (Math.hypot(b.x - p.x, b.y - p.y) < 900) sound(state, 'groan', b.x, b.y);
  r.swarmT = def.every / Math.max(0.25, pressure);
}

/** Once per road tick, after zombies.update. `def` is the mission's swarm (null: burrows stay quiet, e.g. during a boss). */
export function update(state: GameState, dt: number, def: SwarmDef | null, types: Weights, pressure: number) {
  const r = rt(state), p = state.player;
  // honey: pools fade; standing in one halves your speed (read by player.update)
  for (const q of r.pools) q.life -= dt;
  if (r.pools.length) r.pools = r.pools.filter(q => q.life > 0);
  p.slowMul = r.pools.some(q => Math.hypot(p.x - q.x, p.y - q.y) < q.r + p.r * 0.5) ? HONEY_SLOW : 1;
  for (const z of state.zombies as Bug[]) if (z.type === 'burrow' && !z.dead) z.eruptT = (z.eruptT ?? 99) + dt;
  // columns climbing out
  for (const c of r.columns) {
    c.t -= dt;
    while (c.left > 0 && c.t <= 0) {
      c.t += COLUMN_GAP; c.left--;
      const a = rand(state) * Math.PI * 2, x = c.x + Math.cos(a) * 16, y = c.y + Math.sin(a) * 16;
      const free = phys.isFree(state, x, y, 14) && onFloor(state, x, y);
      const z = spawnBug(state, pickType(c.types, rand(state)), free ? x : c.x, free ? y : c.y, c.horde, c.tag);
      if (c.rally) z.rally = 8;
    }
  }
  if (r.columns.length) r.columns = r.columns.filter(c => c.left > 0);
  r.senseT -= dt;
  if (r.senseT <= 0) { r.senseT += 0.25; sense(state, 0.25); }
  if (def) { r.swarmT -= dt; if (r.swarmT <= 0) swarm(state, def, types, pressure); }
  bugs.update(state, dt);
  arms.update(state, dt);
}
