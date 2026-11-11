// road.ts — "The Long Road": a linear mission campaign across the hand-laid map in road-world.ts.
// Own fixed-step loop (stepRoad) built from the shared player/combat/zombie/boss modules, like arcade.ts.
// Rules: locked gates between sectors, one objective at a time, checkpoint at every mission end,
// death restarts the current mission from its start snapshot, walk-over pickups, no needs, no building.
import { emit, hash, makeRng, newState, phys, rand, snapshotInterp, sound, toast, type Rng } from './core';
import type { Building, Drop, EquipKey, GameState, InputState, MissionTarget, Stack, Vec, Zombie, ZombieType } from './types';
import type { CharacterId } from '../characters';
import * as player from './player';
import * as combat from './combat';
import * as zombies from './zombies';
import * as bosses from './bosses';
import * as inv from './inventory';
import * as progression from './progression';
import * as pathing from './pathing';
import { ITEMS } from './items';
import { randomAmmoDrop } from './loot';
import { build, type RoadWorld, type SiteId } from './road-world';
import { buildingAt } from './world';
import { CAST, MISSIONS, QUEST_ITEMS, type Line, type MissionDef, type ObjectiveDef, type Place, type Speaker, type Weights } from './road-data';
import { NEED_MISSIONS, RESCUED_GROUP } from './need-data';
import { createSquad, updateSquad, type RoadAlly } from './road-squad';
import * as hive from './hive';
import { build as buildHive, isFloor, zoneAt, zoneOfSector } from './hive-world';
import { HIVE_MISSIONS } from './hive-data';

export const ROAD_SAVE_KEY = 'deadzone_road_v1';
export const NEED_SAVE_KEY = 'deadzone_need_v1';
export const NEED_TEST_UNLOCK_KEY = 'deadzone_need_test_unlock';
export function hasGroupInNeedTestUnlock(): boolean {
  try { return globalThis.localStorage?.getItem(NEED_TEST_UNLOCK_KEY) === '1'; } catch { return false; }
}
export function canStartGroupInNeed(): boolean { return hasGroupInNeedTestUnlock() || !!readSave()?.done; }
/** Testing access is separate from story progress: never marks The Long Road complete. */
export function devUnlockGroupInNeed(): boolean {
  try { globalThis.localStorage?.setItem(NEED_TEST_UNLOCK_KEY, '1'); return hasGroupInNeedTestUnlock(); } catch { return false; }
}
/** The Hive Below: its own save slot; locked until A Group in Need is finished (or unlocked for testing). */
export const HIVE_SAVE_KEY = 'deadzone_hive_v1';
export const HIVE_TEST_UNLOCK_KEY = 'deadzone_hive_test_unlock';
export function hasHiveBelowTestUnlock(): boolean {
  try { return globalThis.localStorage?.getItem(HIVE_TEST_UNLOCK_KEY) === '1'; } catch { return false; }
}
export function canStartHiveBelow(): boolean { return hasHiveBelowTestUnlock() || !!readSave('group-in-need')?.done; }
/** Testing access is separate from story progress: never marks A Group in Need complete. */
export function devUnlockHiveBelow(): boolean {
  try { globalThis.localStorage?.setItem(HIVE_TEST_UNLOCK_KEY, '1'); return hasHiveBelowTestUnlock(); } catch { return false; }
}
export type RoadStory = 'long-road' | 'group-in-need' | 'hive-below';
export const missionsFor = (story: RoadStory = 'long-road') => story === 'group-in-need' ? NEED_MISSIONS : story === 'hive-below' ? HIVE_MISSIONS : MISSIONS;
export const storyTitle = (story: RoadStory = 'long-road') => story === 'group-in-need' ? 'A group in need' : story === 'hive-below' ? 'The Hive Below' : 'The Long Road';
const saveKey = (story: RoadStory) => story === 'group-in-need' ? NEED_SAVE_KEY : story === 'hive-below' ? HIVE_SAVE_KEY : ROAD_SAVE_KEY;
export const ROAD_SEED = 0x4c6f6e67;   // one authored map: every run plays the same city
const SECTOR_PAD = 60;
/** Global pressure dial: ambient spawn rate and the zombie count of every clear / hold-out objective are multiplied by this. */
export const PRESSURE = 1.5;
/** Kill XP multiplier for this mode: the road is finite, so levels have to come faster than in the open world. */
export const XP_MUL = 2;
const AMBIENT_CAP = Math.round(26 * PRESSURE);
/** A mission can soften the dial (the first sector is a warm-up). */
const pressureOf = (state: GameState) => missionOf(state).pressure ?? PRESSURE;
const scaled = (state: GameState, n: number) => Math.max(1, Math.round(n * pressureOf(state)));
const PICK_R = 6;
/** Hold-out radius around the marker: the building and its yard. Zombies come through the doors and the windows. */
export const HOLD_R = 420;

export interface PlayerSnapshot {
  equip: Record<EquipKey, Stack | null>; slots: (Stack | null)[]; active: Player['active'];
  xp: number; level: number; sp: number; tech: Record<string, true>; maxHp: number; flashlight: boolean;
}
type Player = GameState['player'];
export interface Subtitle extends Line { until: number }
export interface CastMember { id: Speaker; x: number; y: number; angle: number }
export interface ObjectiveRun {
  started: boolean; done: boolean;
  point: Vec;                 // where the marker is
  kills: number; need: number;
  timer: number;              // holdout seconds left
  waveT: number;              // next wave countdown
  hold: number;               // interact hold progress
  away: boolean;              // holdout: player left the position
  armed?: boolean;            // holdout: the player has reached the position once (waves and the clock start then)
  near?: boolean;             // camp: at the checkpoint but zombies are still close
  bossId: string | null;      // zombie id of the spawned boss
  tag: string;
}
export interface RoadState {
  version: 1;
  story: RoadStory;
  allies: RoadAlly[];
  trail: Vec[];
  character: CharacterId;
  mission: number; step: number;
  phase: 'briefing' | 'play' | 'complete' | 'ended';
  attempts: number;
  world: RoadWorld;
  snapshot: PlayerSnapshot;
  missionStart: number; missionKills: number; missionDeaths: number;
  objectives: ObjectiveRun[];
  cast: CastMember[];
  subtitle: Subtitle | null;
  log: Line[];
  collected: string[];
  totals: { kills: number; deaths: number; time: number };
  lights: boolean;
  /** runtime */
  gateSolids: (import('./types').Solid | null)[];
  seenPacks: Set<string>;
  ambientT: number; cullT: number;
  rng: Rng;
  interactTarget: MissionTarget | null;
  fullToastT: number;
  lastCompleted: { title: string; kills: number; time: number; deaths: number } | null;
  /** The Hive Below: honey pools, queued columns and spawner timers (sim/hive.ts) */
  hiveRt?: hive.HiveRuntime;
}

export const missionsOf = (state: GameState) => missionsFor(state.road!.story);
export const missionOf = (state: GameState) => missionsOf(state)[state.road!.mission];
export const current = (state: GameState): ObjectiveDef | null => missionOf(state)?.objectives[state.road!.step] ?? null;
export const currentRun = (state: GameState) => state.road!.objectives[state.road!.step] ?? null;
export const sectorOf = (state: GameState) => state.road!.world.sectors[missionOf(state).sector];

// ------------------------------------------------------------------ lifecycle
export function newRoad(character: CharacterId = 'survivor', seed = ROAD_SEED): GameState {
  const state = createRoad(character, seed, 'long-road');
  save(state); return state;
}

/** Carry over the first chapter's survivor. Testing access also permits an unfinished checkpoint or a fresh survivor. */
export function newGroupInNeed(): GameState | null {
  const source = readSave();
  if (!source?.done && !hasGroupInNeedTestUnlock()) return null;
  const state = createRoad(source?.character ?? 'survivor', source?.seed ?? ROAD_SEED, 'group-in-need', source?.snapshot);
  save(state); return state;
}

/** Carry over the survivor of A Group in Need: level, skills and gear. Testing access also permits an unfinished checkpoint or a fresh survivor. */
export function newHiveBelow(): GameState | null {
  const need = readSave('group-in-need');
  if (!need?.done && !hasHiveBelowTestUnlock()) return null;
  const source = need ?? readSave('long-road');
  const state = createRoad(source?.character ?? 'survivor', ROAD_SEED, 'hive-below', source?.snapshot);
  if (!source) {
    // testing with no earlier story on this machine: a kit that can face a swarm
    const p = state.player;
    p.inv.equip.primary = { id: 'smg', qty: 1, mag: combat.WEAPONS.smg.magSize };
    inv.add(p.inv, 'ammo_9mm', 180); inv.add(p.inv, 'medkit', 2);
    p.active = 'primary';
    state.road!.snapshot = snapshotPlayer(p);
  }
  save(state); return state;
}

function createRoad(character: CharacterId, seed: number, story: RoadStory, snapshot?: PlayerSnapshot, mission = 0): GameState {
  const state = newState(seed, 'road');
  const world = story === 'hive-below' ? buildHive(state) : build(state);
  const p = state.player = player.create(world.start.x, world.start.y);
  p.character = character;
  inv.bind(state);
  p.inv.equip.secondary = { id: 'pistol', qty: 1, mag: combat.WEAPONS.pistol.magSize };
  p.inv.equip.melee = { id: 'knife', qty: 1 };
  inv.add(p.inv, 'ammo_9mm', 72);
  p.flashlight = false;
  state.road = {
    version: 1, story, allies: [], trail: [], character, mission: 0, step: 0, phase: 'briefing', attempts: 0, world,
    snapshot: snapshotPlayer(p), missionStart: 0, missionKills: 0, missionDeaths: 0, objectives: [], cast: [], subtitle: null, log: [],
    collected: [], totals: { kills: 0, deaths: 0, time: 0 }, lights: false,
    gateSolids: world.gates.map(() => null), seenPacks: new Set(), ambientT: 0, cullT: 0, rng: makeRng(seed), interactTarget: null, fullToastT: -9, lastCompleted: null,
  };
  state.screen = 'playing'; state.ui = null; state.paused = false;
  startMission(state, mission, snapshot, false);
  return state;
}

export function continueRoad(story: RoadStory = 'long-road'): GameState | null {
  const data = readSave(story);
  if (!data) return null;
  // a story that has grown since it was finished (The Hive Below is built in steps) carries on with the next mission
  const more = !!data.done && data.mission + 1 < missionsFor(story).length;
  const state = createRoad(data.character, data.seed, story, data.snapshot, more ? data.mission + 1 : data.mission);
  const r = state.road!;
  r.totals = data.totals; r.attempts = data.attempts;
  if (data.done && !more) { r.phase = 'ended'; state.ui = 'road'; }
  return state;
}

export interface RoadSave { version: 1; story?: RoadStory; seed: number; character: CharacterId; mission: number; snapshot: PlayerSnapshot; attempts: number; totals: RoadState['totals']; done?: boolean; savedAt: number }
export function hasRoadSave(story: RoadStory = 'long-road') { return !!readSave(story); }
export function readSave(story: RoadStory = 'long-road'): RoadSave | null {
  try {
    const raw = globalThis.localStorage?.getItem(saveKey(story)); if (!raw) return null;
    const d = JSON.parse(raw) as RoadSave;
    if (d.version !== 1 || !Number.isInteger(d.mission) || d.mission < 0 || d.mission >= missionsFor(story).length || !d.snapshot || typeof d.seed !== 'number') return null;
    return d;
  } catch { return null; }
}
export function clearRoadSave(story: RoadStory = 'long-road') { try { globalThis.localStorage?.removeItem(saveKey(story)); } catch { /* optional */ } }
export function save(state: GameState, done?: boolean): boolean {
  const r = state.road!;
  const last = missionsOf(state).length - 1;
  const mission = r.phase === 'complete' ? Math.min(r.mission + 1, last) : r.mission;
  const finished = done ?? (r.phase === 'ended' || (r.phase === 'complete' && r.mission === last));
  const data: RoadSave = { version: 1, story: r.story, seed: state.seed, character: r.character, mission, snapshot: r.snapshot, attempts: r.attempts, totals: r.totals, done: finished, savedAt: Date.now() };
  try { globalThis.localStorage?.setItem(saveKey(r.story), JSON.stringify(data)); return true; } catch { return false; }
}

function snapshotPlayer(p: Player): PlayerSnapshot {
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  return { equip: clone(p.inv.equip), slots: clone(p.inv.slots.map(st => st && ITEMS[st.id]?.type === 'material' ? null : st)), active: p.active, xp: p.xp, level: p.level, sp: p.sp, tech: clone(p.tech), maxHp: p.maxHp, flashlight: p.flashlight };
}
function restorePlayer(state: GameState, s: PlayerSnapshot) {
  const p = state.player, clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  p.inv.equip = clone(s.equip); p.inv.slots = clone(s.slots); p.active = s.active;
  p.xp = s.xp; p.level = s.level; p.sp = s.sp; p.tech = clone(s.tech); p.maxHp = s.maxHp; p.flashlight = s.flashlight;
  inv.recalcSize(state);
  progression.sync(state);
}

// ------------------------------------------------------------------ places
const isSite = (at: Place): at is SiteId => at !== 'camp' && at !== 'entry' && at !== 'prevCamp';
function siteRect(state: GameState, id: Place) { return isSite(id) ? state.road!.world.sites[id] ?? null : null; }
function buildingOf(state: GameState, id: Place): Building | null {
  const s = siteRect(state, id); if (!s) return null;
  return state.buildings.find(b => Math.abs(b.x - s.x) < 1 && Math.abs(b.y - s.y) < 1 && Math.abs(b.w - s.w) < 1) ?? null;
}
export function campOf(state: GameState, m: number): Vec {
  const w = state.road!.world;
  if (w.hive) return m < 0 ? w.start : w.camps[Math.min(m, w.camps.length - 1)];
  if (state.road!.story === 'group-in-need') {
    if (m < 0) { const relay = w.sites.relay!; return { x: relay.x + relay.w / 2, y: relay.y + relay.h + 140 }; }
    const def = NEED_MISSIONS[m], sec = w.sectors[def.sector];
    if (def.checkpoint === 'entry') {
      const c = { x: sec.rect.x + sec.rect.w / 2, y: sec.rect.y + sec.rect.h / 2 };
      const dx = c.x - sec.entry.x, dy = c.y - sec.entry.y, d = Math.hypot(dx, dy);
      return freeNear(state, { x: sec.entry.x + dx / d * 220, y: sec.entry.y + dy / d * 220 }, 18, makeRng(m), 300);
    }
    if (def.checkpoint === 'exit') return w.camps[def.sector];
    if (def.checkpoint === 'relay') return campOf(state, -1);
    return placeOf(state, def.checkpoint!, 'door', makeRng(m));
  }
  if (m < 8) return w.camps[m];
  const s = w.sectors[8];
  if (m === 8) return { x: s.rect.x + s.rect.w - 1550, y: 2700 - 260 };
  const relay = w.sites.relay!;
  return { x: relay.x + relay.w / 2, y: relay.y + relay.h + 140 };
}
/** Resolve a symbolic place. mode 'door' = outside the entrance, 'inside' = a free indoor spot, 'center' = middle. */
function placeOf(state: GameState, at: Place, mode: 'door' | 'inside' | 'center', rng: Rng): Vec {
  const r = state.road!;
  if (at === 'camp') return campOf(state, r.mission);
  if (at === 'prevCamp') return r.mission === 0 && r.story !== 'group-in-need' ? r.world.start : campOf(state, r.mission - 1);
  if (at === 'entry') return sectorOf(state).entry;
  const s = siteRect(state, at);
  if (!s) return campOf(state, r.mission);
  const b = buildingOf(state, at);
  if (b && mode === 'door') {
    const d = b.doors[0]; if (!d) return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const c = { x: d.x + d.w / 2, y: d.y + d.h / 2 }, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const out = { x: c.x + Math.sign(c.x - cx) * (d.w > d.h ? 0 : 60), y: c.y + Math.sign(c.y - cy) * (d.w > d.h ? 60 : 0) };
    return freeNear(state, out, 18, rng, 90);
  }
  if (b && mode === 'inside') return indoorSpot(state, b, rng) ?? { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  if (at === 'fort' && mode === 'door') return { x: s.x + 180, y: 2700 };
  const c = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
  return mode === 'inside' ? freeNear(state, c, 18, rng, Math.min(s.w, s.h) / 2 - 40) : c;
}
function indoorSpot(state: GameState, b: Building, rng: Rng): Vec | null {
  const rooms = b.rooms.length ? b.rooms.slice().sort((p, q) => q.w * q.h - p.w * p.h) : [b];
  for (let i = 0; i < 60; i++) {
    const room = rooms[Math.min(rooms.length - 1, Math.floor(rng.next() * rng.next() * rooms.length))], m = 30;
    if (room.w <= m * 2 || room.h <= m * 2) continue;
    const x = room.x + m + rng.next() * (room.w - m * 2), y = room.y + m + rng.next() * (room.h - m * 2);
    if (phys.isFree(state, x, y, 20)) return { x, y };
  }
  return null;
}
function freeNear(state: GameState, c: Vec, r: number, rng: Rng, maxD = 200): Vec {
  if (phys.isFree(state, c.x, c.y, r)) return { x: c.x, y: c.y };
  for (let d = 30; d <= maxD; d += 30) for (let k = 0; k < 10; k++) {
    const a = rng.next() * Math.PI * 2, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
    if (phys.isFree(state, x, y, r)) return { x, y };
  }
  return { x: c.x, y: c.y };
}

// ------------------------------------------------------------------ missions
function missionRng(state: GameState, salt = 0) { return makeRng(hash(`${state.seed}:road:${state.road!.mission}:${salt}`)); }

export function startMission(state: GameState, m: number, snapshot?: PlayerSnapshot, persist = true) {
  const r = state.road!, p = state.player, def = missionsOf(state)[m];
  r.mission = m; r.step = 0; r.phase = 'briefing'; r.missionKills = 0; r.missionDeaths = 0; r.collected = []; r.subtitle = null; r.interactTarget = null;
  r.seenPacks = new Set(); r.ambientT = 0; r.cullT = 0;
  if (snapshot) restorePlayer(state, snapshot);
  // fresh body at the checkpoint
  p.dead = false; p.hp = p.maxHp; p.stamina = p.maxStamina; p.food = p.water = 100; p.bleeding = 0; p.invuln = 1.5;
  p.reloadTimer = p.reloadTotal = 0; p.swingTimer = 0; p.fireCooldown = 0; p.burstQueue = 0; p.vx = p.vy = 0;
  const start = m === 0 && r.story !== 'group-in-need' ? r.world.start : campOf(state, m - 1);
  p.x = start.x; p.y = start.y; phys.collideCircle(state, p);
  state.clock.t = def.clock; state.clock.day = m + 1;
  r.snapshot = snapshotPlayer(p);
  // world reset
  state.zombies.length = 0; state.bullets.length = 0; state.search = null; state.interact = null;
  // bags placed by this mission (or a later one) are re-placed below; everything older stays where it lies,
  // so the supply cache at a checkpoint survives the MISSION COMPLETE card
  state.drops = state.drops.filter(d => (d.mission ?? m) < m);
  bosses.clearFx(state); pathing.reset(state);
  syncGates(state);
  // objectives
  const rng = missionRng(state);
  r.objectives = def.objectives.map((o, i) => ({
    started: false, done: false, kills: 0, need: 0, timer: 0, waveT: 0, hold: 0, away: false, bossId: null, tag: `m${m}o${i}`,
    // hold-outs happen outside the entrance (open ground, no doorway to camp); pickups and switches are indoors; areas use their centre
    point: o.kind === 'camp' ? campOf(state, m) : placeOf(state, o.at, o.kind === 'pickup' || (o.kind === 'interact' && buildingOf(state, o.at)) ? 'inside' : o.kind === 'reach' || o.kind === 'rescue' || o.kind === 'escort' ? 'door' : 'center', rng),
  }));
  placeCaches(state, def, rng);
  placeQuestItems(state, def, rng);
  placeScavenge(state, rng);
  placeCast(state);
  r.allies = []; r.trail = [];
  if (r.world.hive) {
    // the floodlights on the dam come on in the first mission and stay on; underground you want your torch
    r.lights = m >= 1;
    if (def.clock >= 420) p.flashlight = true;
    placeHive(state, def, rng);
  }
  if (r.story === 'group-in-need') {
    r.lights = m >= 3;
    if (m >= 5) createSquad(state, p, true);
    else if (m === 4) createSquad(state, placeOf(state, 'hospital', 'door', rng), false);
  }
  r.missionStart = state.time;
  state.screen = 'playing'; state.paused = false; state.ui = 'road';
  snapshotInterp(state);
  if (persist) save(state);
}

/** The card was dismissed: play. */
export function begin(state: GameState) {
  const r = state.road!;
  if (r.phase !== 'briefing') return;
  r.phase = 'play'; state.ui = null; r.missionStart = state.time;
  save(state);
  for (const l of missionOf(state).intro) r.log.push(l);
  startObjective(state);
  sound(state, 'waveStart');
}
/** Death: back to the mission start. */
export function restart(state: GameState) {
  const r = state.road!;
  r.attempts++; r.totals.deaths++;
  const deaths = r.missionDeaths + 1;
  startMission(state, r.mission, r.snapshot);
  r.missionDeaths = deaths;
  r.phase = 'play'; state.ui = null;
  startObjective(state);
  toast(state, 'Mission restarted from the checkpoint', '#ffd36b');
}
/** After the MISSION COMPLETE card. */
export function next(state: GameState) {
  const r = state.road!;
  if (r.phase !== 'complete') return;
  if (r.mission + 1 >= missionsOf(state).length) { r.phase = 'ended'; save(state, true); state.ui = 'road'; return; }
  startMission(state, r.mission + 1);
}
function complete(state: GameState) {
  const r = state.road!, def = missionOf(state);
  r.phase = 'complete'; state.ui = 'road'; state.interact = null; state.search = null;
  r.lastCompleted = { title: def.title, kills: r.missionKills, time: state.time - r.missionStart, deaths: r.missionDeaths };
  r.totals.time += state.time - r.missionStart;
  for (const l of def.outro) r.log.push(l);
  // open the gate out of this sector for good and save the checkpoint
  if (r.story !== 'group-in-need' && r.mission < r.world.gates.length) { r.world.gates[r.mission].open = true; syncGates(state); }
  r.snapshot = snapshotPlayer(state.player);
  save(state);
  sound(state, 'levelUp');
  emit(state, { t: 'banner', title: 'CHECKPOINT', sub: 'PROGRESS SAVED', color: '#8fd98a', ms: 2600 });
}

function syncGates(state: GameState) {
  const r = state.road!;
  r.world.gates.forEach((g, i) => {
    g.open = r.story === 'group-in-need' || i < r.mission || g.open;
    const have = r.gateSolids[i];
    if (g.open && have) { phys.removeSolid(state, have); r.gateSolids[i] = null; }
    // a quarantine gate is bars you can see through; a hive seal is a plug of resin
    if (!g.open && !have) r.gateSolids[i] = phys.addSolid(state, { x: g.x, y: g.y, w: g.w, h: g.h, kind: 'wall', sub: r.world.hive ? 'seal' : 'gate', solid: true, blocksBullets: true, blocksSight: !!r.world.hive, campaignArt: true } as any);
  });
}

function placeCast(state: GameState) {
  const r = state.road!, c = campOf(state, r.mission), rng = missionRng(state, 7);
  if (r.world.hive) {
    // Mara, Eli and June watch from the dam; nobody follows you underground (the radio does)
    const home = r.world.start;
    r.cast = r.mission === 0 ? (['mara', 'eli', 'june'] as Speaker[]).map((id, i) => ({ id, ...freeNear(state, { x: home.x - 70 + i * 50, y: home.y - 90 - (i % 2) * 30 }, 14, rng, 160), angle: Math.PI / 4 })) : [];
    return;
  }
  if (r.story === 'group-in-need') {
    const home = campOf(state, -1);
    r.cast = (['mara', 'eli', 'june', 'ruth'] as Speaker[]).map((id, i) => ({ id, ...freeNear(state, { x: home.x + (i - 1.5) * 60, y: home.y + 80 }, 14, rng), angle: -Math.PI / 2 }));
    return;
  }
  const ids: Speaker[] = r.mission >= 7 ? ['mara', 'eli', 'june', 'ruth'] : ['mara', 'eli', 'june'];
  r.cast = ids.map((id, i) => {
    const a = i * 2.1 + 0.6, d = 55 + (i % 2) * 25;
    const p = freeNear(state, { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d }, 14, rng, 120);
    return { id, x: p.x, y: p.y, angle: Math.atan2(c.y - p.y, c.x - p.x) };
  });
}

export function dropAt(state: GameState, at: Vec, stack: Stack, quest = false) {
  const d: Drop = { id: `road-${state.drops.length}-${stack.id}`, x: at.x, y: at.y, r: 12, kind: 'loot', life: Infinity, inv: { size: 1, slots: [stack] }, icon: stack.id, quest, armed: true, mission: state.road!.mission };
  state.drops.push(d);
  return d;
}
/** `camp` selects the checkpoint's own supplies: in the hive they arrive when the camp does, not before. */
function placeCaches(state: GameState, def: MissionDef, rng: Rng, camp?: boolean) {
  const late = !!state.road!.world.hive;
  for (const c of def.caches) {
    if (camp !== undefined ? (c.at === 'camp') !== camp : late && c.at === 'camp') continue;
    const b = c.at !== 'camp' && c.at !== 'entry' && c.at !== 'prevCamp' ? buildingOf(state, c.at) : null;
    const centre = placeOf(state, c.at, b ? 'inside' : 'center', rng);
    c.items.forEach((it, i) => {
      let p: Vec | null = null;
      if (b && !c.spread) p = indoorSpot(state, b, rng);
      if (!p) {
        const a = rng.next() * Math.PI * 2, d = c.spread ? rng.next() * c.spread : 30 + i * 26;
        p = freeNear(state, { x: centre.x + Math.cos(a) * d, y: centre.y + Math.sin(a) * d }, 26, rng, 220);
      }
      const def2 = ITEMS[it.id];
      dropAt(state, p, { id: it.id, qty: it.qty ?? 1, ...(def2?.type === 'weapon' && combat.WEAPONS[it.id] ? { mag: combat.WEAPONS[it.id].magSize } : {}) });
    });
  }
}
/** Supplies hidden in ordinary buildings of the sector: a reason to scavenge off the route. Deterministic per mission. */
const SCAVENGE: { id: string; qty: [number, number]; w: number; min?: number }[] = [
  { id: 'ammo_9mm', qty: [12, 24], w: 5 }, { id: 'ammo_12g', qty: [6, 12], w: 4 }, { id: 'ammo_556', qty: [20, 40], w: 3 }, { id: 'ammo_357', qty: [6, 12], w: 1 }, { id: 'ammo_308', qty: [5, 10], w: 1 },
  { id: 'bandage', qty: [1, 2], w: 5 }, { id: 'medkit', qty: [1, 1], w: 1.2 }, { id: 'painkillers', qty: [1, 1], w: 0.8 },
  // spare guns and armor: equip in the inventory, or feed copies to what you carry to level it up
  { id: 'pistol', qty: [1, 1], w: 0.9 }, { id: 'shotgun', qty: [1, 1], w: 0.5, min: 1 }, { id: 'smg', qty: [1, 1], w: 0.4, min: 2 }, { id: 'revolver', qty: [1, 1], w: 0.3, min: 3 },
  { id: 'assault_rifle', qty: [1, 1], w: 0.35, min: 4 }, { id: 'hunting_rifle', qty: [1, 1], w: 0.25, min: 7 }, { id: 'bat', qty: [1, 1], w: 0.3 }, { id: 'machete', qty: [1, 1], w: 0.3, min: 3 },
  { id: 'cap', qty: [1, 1], w: 0.4 }, { id: 'hoodie', qty: [1, 1], w: 0.4 }, { id: 'bike_helmet', qty: [1, 1], w: 0.3, min: 1 }, { id: 'leather_jacket', qty: [1, 1], w: 0.3, min: 2 },
  { id: 'riot_helmet', qty: [1, 1], w: 0.2, min: 3 }, { id: 'police_vest', qty: [1, 1], w: 0.2, min: 3 }, { id: 'military_helmet', qty: [1, 1], w: 0.15, min: 7 }, { id: 'military_vest', qty: [1, 1], w: 0.15, min: 7 },
  { id: 'small_backpack', qty: [1, 1], w: 0.35 }, { id: 'hiking_backpack', qty: [1, 1], w: 0.2, min: 3 }, { id: 'military_backpack', qty: [1, 1], w: 0.12, min: 7 },
];
function placeScavenge(state: GameState, rng: Rng) {
  const r = state.road!, sec = sectorOf(state).rect, m = r.mission;
  const owned = new Set(['ammo_9mm', ...Object.values(state.player.inv.equip).map(st => st && combat.WEAPONS[st.id]?.ammo).filter(Boolean) as string[]]);
  const sites = new Set(Object.values(r.world.sites).filter(Boolean).map(s => `${s!.x}:${s!.y}`));
  let placed = 0;
  for (const b of state.buildings) {
    if (placed >= 28) break;
    if (b.x < sec.x || b.x + b.w > sec.x + sec.w || b.y < sec.y || b.y + b.h > sec.y + sec.h) continue;
    if (sites.has(`${b.x}:${b.y}`) || rng.next() > 0.4) continue;
    const pool = SCAVENGE.filter(e => (e.min ?? 0) <= m && (!e.id.startsWith('ammo_') || owned.has(e.id) || (m >= 3 && e.id === 'ammo_556')));
    let total = 0; for (const e of pool) total += e.w;
    let roll = rng.next() * total, pick = pool[0];
    for (const e of pool) { roll -= e.w; if (roll <= 0) { pick = e; break; } }
    const at = indoorSpot(state, b, rng); if (!at) continue;
    const wdef = combat.WEAPONS[pick.id];
    dropAt(state, at, { id: pick.id, qty: pick.qty[0] + Math.floor(rng.next() * (pick.qty[1] - pick.qty[0] + 1)), ...(wdef ? { mag: wdef.magSize } : {}) });
    placed++;
  }
}
/** The Hive Below: the cell's burrows and egg clusters, the burrows an objective asks for, wanderers, and supplies in the nooks. */
function placeHive(state: GameState, def: MissionDef, rng: Rng) {
  const r = state.road!, h = r.world.hive!, p = state.player, zone = zoneOfSector(def.sector), sec = sectorOf(state).rect;
  hive.reset(state);
  for (const b of h.burrows[zone]) hive.spawnFixture(state, 'burrow', b);
  for (const e of h.eggs[zone]) hive.spawnFixture(state, 'egg', e);
  def.objectives.forEach((o, i) => {
    if (o.kind === 'burrows') for (const b of (r.world.nurseryBurrows ?? []).slice(0, o.count)) hive.spawnFixture(state, 'burrow', b, r.objectives[i].tag);
  });
  // wanderers: idle until one of them sees you (and then the pheromone does the rest)
  for (let k = 0, placed = 0; k < 600 && placed < (def.scouts ?? 0); k++) {
    const x = sec.x + rng.next() * sec.w, y = sec.y + rng.next() * sec.h;
    if (zoneAt(h, x, y) !== zone || !isFloor(h, x, y) || !phys.isFree(state, x, y, 24) || Math.hypot(x - p.x, y - p.y) < 650) continue;
    (zombies.spawn(state, pickType(def.types, rng), x, y) as Zombie & { roadTag?: string }).roadTag = 'scout';
    placed++;
  }
  // what the hive dragged down from the city: bullets, bandages and the odd gun, in the corners off the route
  const owned = new Set(['ammo_9mm', ...Object.values(p.inv.equip).map(st => st && combat.WEAPONS[st.id]?.ammo).filter(Boolean) as string[]]);
  const pool = [...SCAVENGE.filter(e => !e.id.startsWith('ammo_') || owned.has(e.id) || e.id === 'ammo_556'), { id: 'ichor', qty: [20, 40] as [number, number], w: 6 }, { id: 'royal_jelly', qty: [1, 1] as [number, number], w: 0.8 }];
  let total = 0; for (const e of pool) total += e.w;
  for (const n of h.nooks[zone]) {
    if (rng.next() > 0.8) continue;
    let roll = rng.next() * total, pick = pool[0];
    for (const e of pool) { roll -= e.w; if (roll <= 0) { pick = e; break; } }
    const wdef = combat.WEAPONS[pick.id];
    dropAt(state, freeNear(state, n, 26, rng, 120), { id: pick.id, qty: pick.qty[0] + Math.floor(rng.next() * (pick.qty[1] - pick.qty[0] + 1)), ...(wdef ? { mag: wdef.magSize } : {}) });
  }
}
function placeQuestItems(state: GameState, def: MissionDef, rng: Rng) {
  const r = state.road!;
  def.objectives.forEach((o, i) => {
    if (o.kind !== 'pickup') return;
    const run = r.objectives[i];
    const isWeapon = !!combat.WEAPONS[o.item] || ITEMS[o.item]?.type === 'armor';
    dropAt(state, run.point, { id: o.item, qty: o.qty ?? 1, ...(combat.WEAPONS[o.item] ? { mag: combat.WEAPONS[o.item].magSize } : {}) }, !isWeapon);
    void rng;
  });
}

// ------------------------------------------------------------------ objectives
function say(state: GameState, line: Line | undefined, secs = 6.5) {
  if (!line) return;
  const r = state.road!;
  r.subtitle = { ...line, until: state.time + secs };
  r.log.push(line);
  emit(state, { t: 'sound', name: 'pickup', vol: 0.3 });
}
function startObjective(state: GameState) {
  const r = state.road!, o = current(state), run = currentRun(state);
  if (!o || !run) return;
  run.started = true;
  const rng = missionRng(state, 100 + r.step + r.attempts * 1000);
  say(state, o.line);
  switch (o.kind) {
    case 'clear': {
      const b = buildingOf(state, o.at), types = o.types ?? missionOf(state).types, count = scaled(state, o.count);
      run.need = 0;   // counts what actually spawned
      for (let i = 0; i < count; i++) {
        let p: Vec | null = null;
        if (b && (o.indoor || !o.r)) p = indoorSpot(state, b, rng);
        if (!p) {
          for (let k = 0; k < 20 && !p; k++) {
            const a = rng.next() * Math.PI * 2, d = 120 + rng.next() * ((o.r ?? 300) - 120);
            const x = run.point.x + Math.cos(a) * d, y = run.point.y + Math.sin(a) * d;
            // outdoors: never inside a building (a zombie in a locked back room would stall the counter)
            if (phys.isFree(state, x, y, 24) && Math.hypot(x - state.player.x, y - state.player.y) > 260 && (b ? true : !buildingAt(state, x, y))) p = { x, y };
          }
        }
        if (!p) continue;
        const z = zombies.spawn(state, pickType(types, rng), p.x, p.y) as Zombie & { roadTag?: string };
        z.roadTag = run.tag; run.need++;
      }
      run.waveT = 4;
      break;
    }
    case 'holdout': run.timer = o.seconds; run.waveT = 1.5; run.need = o.seconds; break;
    case 'burrows': run.need = objectiveBurrows(state, run.tag).length; run.kills = 0; break;
    case 'interact': run.hold = 0; break;
    case 'boss': break;   // spawns when the player comes close
    case 'camp': if (r.world.hive) placeCaches(state, missionOf(state), rng, true); break;   // the camp and its crates are carried down to you
  }
}
function finishObjective(state: GameState) {
  const r = state.road!, run = currentRun(state), o = current(state);
  if (!run || !o) return;
  run.done = true; r.interactTarget = null; state.interact = null; state.search = null;
  if (o.kind === 'camp') { complete(state); return; }
  sound(state, 'pickup');
  const nextDef = missionOf(state).objectives[r.step + 1];
  emit(state, { t: 'banner', title: 'OBJECTIVE COMPLETE', sub: nextDef ? 'NEXT: ' + nextDef.text.toUpperCase() : '', color: '#8fd98a', ms: 2400 });
  r.step++;
  startObjective(state);
}
const objectiveBurrows = (state: GameState, tag: string) => state.zombies.filter(z => !z.dead && z.type === 'burrow' && (z as Zombie & { roadTag?: string }).roadTag === tag);
export function objectiveText(state: GameState) {
  const o = current(state), run = currentRun(state);
  if (!o || !run) return '';
  if (o.kind === 'clear' || o.kind === 'burrows') return `${o.text} (${Math.max(0, run.need - run.kills)} left)`;
  if (o.kind === 'holdout') return !run.armed ? `Get to the position: ${o.text.replace(/^Hold /, 'hold ')}` : run.away ? `${o.text} — GET BACK TO THE POSITION (${Math.ceil(run.timer)}s)` : `${o.text} (${Math.ceil(run.timer)}s)`;
  if (o.kind === 'camp' && run.near) return `${o.text} — clear the area first`;
  if (o.kind === 'escort' || (o.kind === 'camp' && state.road!.allies.some(a => a.following))) {
    const arrived = state.road!.allies.filter(a => a.following && Math.hypot(a.x - run.point.x, a.y - run.point.y) < 240).length;
    return `${o.text} (${arrived}/${RESCUED_GROUP.length} together)`;
  }
  return o.text;
}

function updateObjective(state: GameState, input: InputState, dt: number) {
  const r = state.road!, o = current(state), run = currentRun(state), p = state.player;
  if (!o || !run || run.done) return;
  const d = Math.hypot(p.x - run.point.x, p.y - run.point.y);
  switch (o.kind) {
    case 'rescue':
      if (d < 120) {
        r.trail = [{ x: p.x, y: p.y }];
        for (const a of r.allies) { a.following = true; a.trailIndex = 0; }
        finishObjective(state);
        emit(state, { t: 'banner', title: 'FOUR MORE ON YOUR SIDE', sub: 'KEEP TOGETHER · YOUR SQUAD FOLLOWS AND FIRES', color: '#9ed9dc', ms: 4000 });
      }
      break;
    case 'escort':
      if (d < (o.r ?? 130) && r.allies.length === RESCUED_GROUP.length && r.allies.every(a => a.following && Math.hypot(a.x - run.point.x, a.y - run.point.y) < 240)) finishObjective(state);
      break;
    case 'reach': if (d < (o.r ?? 110)) finishObjective(state); break;
    case 'camp': {
      const hostile = state.zombies.some(z => !z.dead && !zombies.isInert(z) && Math.hypot(z.x - p.x, z.y - p.y) < 240);
      run.near = d < 130 && hostile;
      const together = r.allies.every(a => !a.following || Math.hypot(a.x - run.point.x, a.y - run.point.y) < 240);
      if (d < 130 && !hostile && together) finishObjective(state);
      break;
    }
    case 'pickup': if (r.collected.includes(o.item)) finishObjective(state); break;
    case 'burrows': {
      const left = objectiveBurrows(state, run.tag);
      run.kills = run.need - left.length;
      if (!left.length) { finishObjective(state); break; }
      // the marker sits on the nearest burrow still standing
      let best = left[0]; for (const b of left) if (Math.hypot(b.x - p.x, b.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)) best = b;
      run.point = { x: best.x, y: best.y };
      break;
    }
    case 'clear': {
      const tagged = state.zombies.filter(z => !z.dead && (z as Zombie & { roadTag?: string }).roadTag === run.tag) as (Zombie & { memory?: number; seesPlayer?: boolean; losTimer?: number })[];
      if (run.kills >= run.need || !tagged.length) { finishObjective(state); break; }
      // Stragglers: once the player is in the area, whatever is left comes looking for them, and anything that
      // wandered far off (or spawned somewhere it cannot path from) is moved to a spot just out of sight.
      run.waveT -= dt;
      if (run.waveT <= 0) {
        run.waveT = 2.5;
        const area = (o.r ?? 300) + 420;
        if (d < area) {
          for (const z of tagged) {
            const dz = Math.hypot(z.x - p.x, z.y - p.y);
            if (dz > 1000 || (tagged.length <= 4 && dz > 700)) {
              const spot = outOfSightNear(state, p, 480, 760);
              if (spot) { z.x = z.prevX = spot.x; z.y = z.prevY = spot.y; }
            }
            if (z.state === 'idle' || z.state === 'wander' || z.state === 'investigate') { z.state = 'chase'; z.target = { x: p.x, y: p.y }; z.memory = 12; z.seesPlayer = true; z.losTimer = 1; }
          }
        }
      }
      break;
    }
    case 'holdout': {
      // nothing happens until you get there: no waves chasing you across the sector on the way to the position
      if (!run.armed) { if (d > HOLD_R) break; run.armed = true; run.waveT = 1.5; emit(state, { t: 'banner', title: 'HOLD THE POSITION', sub: `${Math.ceil(run.timer)} SECONDS`, color: '#f4cf80', ms: 2200 }); }
      run.away = d > HOLD_R;
      if (!run.away) run.timer -= dt;
      run.waveT -= dt;
      if (run.waveT <= 0 && run.timer > 2) {
        run.waveT = o.every;
        const types = o.types ?? missionOf(state).types;
        if (o.from) {
          // the whole wave climbs out of one place, where you can watch it come
          if (hive.liveBugs(state) + scaled(state, o.count) <= hive.SWARM_CAP) hive.column(state, placeOf(state, o.from, 'center', r.rng), scaled(state, o.count), types, { tag: run.tag, horde: true });
        } else for (let i = 0; i < scaled(state, o.count); i++) spawnAround(state, run.point, 520, 900, types, true, run.tag);
      }
      if (run.timer <= 0) finishObjective(state);
      break;
    }
    case 'interact': {
      const near = d < 95;
      if (!r.interactTarget) r.interactTarget = { id: run.tag, name: o.label, x: run.point.x - 24, y: run.point.y - 24, w: 48, h: 48 };
      if (near) {
        state.interact = { kind: 'mission', target: r.interactTarget, label: `${o.label}${o.hold ? ' (hold)' : ''}` };
        if (input.interactHeld || input.pressed.has('interact')) {
          run.hold += dt;
          state.search = { target: { name: o.label } as any, t: run.hold, total: o.hold ?? 0.3 };
          if (run.hold >= (o.hold ?? 0.3)) { if (o.at === 'pumping' || o.at === 'dam') r.lights = true; finishObjective(state); }
        } else { run.hold = Math.max(0, run.hold - dt * 2); state.search = run.hold > 0 ? { target: { name: o.label } as any, t: run.hold, total: o.hold ?? 0.3 } : null; }
      } else { state.search = null; }
      break;
    }
    case 'boss': {
      if (!run.bossId && o.fixed) {
        // already standing in its arena: it turns on you when you walk in, or when you shoot it
        if (d < 1100) {
          const at = freeNear(state, run.point, 44, missionRng(state, 500 + r.step), 200);
          const z = bosses.spawnBossOf(state, o.boss, 0, at.x, at.y, o.hp, { maxR: 34, dmgMul: 0.85, kit: 1, lurk: true, drawR: 46 }) as Zombie & { roadTag?: string };
          z.roadTag = run.tag; run.bossId = z.id;
        }
      } else if (!run.bossId) {
        if (d < 760) {
          const rng = missionRng(state, 500 + r.step);
          const b = buildingOf(state, o.at);
          const giant = o.boss === 'warden', rad = giant ? 70 : 40;
          // indoors only for the set-piece lairs (hospital, depot); everything else arrives in the open, just out of sight,
          // so it never has to find its way out of a building to reach you
          const at = (b && !giant && !o.outdoors ? indoorSpot(state, b, rng) : null)
            ?? outOfSightNear(state, p, 520, 820, rad) ?? freeNear(state, run.point, rad, rng, giant ? 500 : 300);
          // story bosses always have the full move set; a return match is tougher and hits far harder
          const z = bosses.spawnBossOf(state, o.boss, 0, at.x, at.y, o.hp, { maxR: giant ? 60 : 26, dmgMul: 0.85 * (o.second ? 2.5 : 1), hpBoost: o.second ? 2 : 1, kit: 1 }) as Zombie & { roadTag?: string };
          z.roadTag = run.tag; run.bossId = z.id;
        }
      } else {
        const z = state.zombies.find(z => z.id === run.bossId);
        if (!z || z.dead) finishObjective(state);
        else {
          run.point = { x: z.x, y: z.y };
          if (o.fixed && !z.announced && (d < 470 || z.hp < z.maxHp || z.state === 'chase')) { bosses.announce(state, z); z.state = 'chase'; z.target = { x: p.x, y: p.y }; (z as Zombie & { memory?: number }).memory = 99; }
          // an engaged arena boss does not lose you behind a pillar
          if (o.fixed && z.announced && z.state !== 'chase' && d < 1500) { z.state = 'chase'; z.target = { x: p.x, y: p.y }; (z as Zombie & { memory?: number }).memory = 12; }
        }
      }
      break;
    }
  }
}

// ------------------------------------------------------------------ zombies: ambient pressure, packs, culling, kills
function pickType(w: Weights, rng: Rng): ZombieType {
  const entries = Object.entries(w) as [ZombieType, number][];
  let total = 0; for (const [, v] of entries) total += v;
  let roll = rng.next() * total;
  for (const [k, v] of entries) { roll -= v; if (roll <= 0) return k; }
  return entries[0]?.[0] ?? 'walker';
}
function spawnAround(state: GameState, c: Vec, minD: number, maxD: number, types: Weights, chase: boolean, tag?: string) {
  const r = state.road!, sec = sectorOf(state).rect;
  for (let k = 0; k < 14; k++) {
    const a = r.rng.next() * Math.PI * 2, d = minD + r.rng.next() * (maxD - minD);
    const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
    if (x < sec.x + SECTOR_PAD || y < sec.y + SECTOR_PAD || x > sec.x + sec.w - SECTOR_PAD || y > sec.y + sec.h - SECTOR_PAD) continue;
    if (zombies.visible(state, x, y, 30) || !phys.isFree(state, x, y, 24)) continue;
    if (r.world.hive && !isFloor(r.world.hive, x, y)) continue;   // solid rock has no colliders of its own
    const z = zombies.spawn(state, pickType(types, r.rng), x, y, chase) as Zombie & { roadTag?: string; memory?: number; seesPlayer?: boolean };
    if (tag) z.roadTag = tag;
    if (chase) { z.state = 'chase'; z.target = { x: state.player.x, y: state.player.y }; z.memory = 8; z.seesPlayer = true; }
    return z;
  }
  return null;
}
/** A free outdoor spot the player cannot currently see, minD..maxD away (null if none found). */
function outOfSightNear(state: GameState, c: Vec, minD: number, maxD: number, rad = 24): Vec | null {
  const r = state.road!, sec = sectorOf(state).rect;
  for (let k = 0; k < 40; k++) {
    const a = r.rng.next() * Math.PI * 2, d = minD + r.rng.next() * (maxD - minD);
    const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
    if (x < sec.x + SECTOR_PAD || y < sec.y + SECTOR_PAD || x > sec.x + sec.w - SECTOR_PAD || y > sec.y + sec.h - SECTOR_PAD) continue;
    if (zombies.visible(state, x, y, rad + 10) || !phys.isFree(state, x, y, rad + 6) || buildingAt(state, x, y)) continue;
    if (r.world.hive && !isFloor(r.world.hive, x, y)) continue;
    return { x, y };
  }
  return null;
}
function ambient(state: GameState, dt: number) {
  const r = state.road!, def = missionOf(state), p = state.player;
  r.ambientT -= dt;
  if (r.ambientT > 0) return;
  r.ambientT = 60 / (def.density * pressureOf(state));
  // the hive counts every live bug against its own cap (columns from the burrows are the main supply there)
  const alive = r.world.hive ? hive.liveBugs(state) : state.zombies.reduce((n, z) => n + (z.dead || (z as Zombie & { roadTag?: string }).roadTag || z.boss ? 0 : 1), 0);
  if (alive >= (r.world.hive ? Math.min(def.swarm?.cap ?? 30, hive.SWARM_CAP) : AMBIENT_CAP)) return;
  spawnAround(state, p, 620, 1050, def.types, false);
}
function packs(state: GameState) {
  const r = state.road!, p = state.player, sec = sectorOf(state).rect, def = missionOf(state);
  const landmarks = new Set(def.objectives.map(o => 'at' in o ? siteRect(state, o.at as SiteId) : null).filter(Boolean).map(s => `${s!.x}:${s!.y}`));
  for (const b of state.buildings) {
    if (r.seenPacks.has(b.id)) continue;
    if (b.x + b.w < sec.x || b.x > sec.x + sec.w || b.y + b.h < sec.y || b.y > sec.y + sec.h) continue;
    const dx = Math.max(b.x - p.x, 0, p.x - b.x - b.w), dy = Math.max(b.y - p.y, 0, p.y - b.y - b.h);
    if (Math.hypot(dx, dy) > 520) continue;
    r.seenPacks.add(b.id);
    if (landmarks.has(`${b.x}:${b.y}`)) continue;
    const n = Math.max(1, Math.round(zombies.packSize(b) * 0.8 * Math.min(1, pressureOf(state) / PRESSURE)));
    for (let i = 0; i < n; i++) {
      const at = zombies.indoorPoint(state, b, 14); if (!at) break;
      zombies.spawn(state, pickType(def.types, r.rng), at.x, at.y);
    }
  }
}
function cull(state: GameState, dt: number) {
  const r = state.road!, p = state.player;
  r.cullT -= dt; if (r.cullT > 0) return; r.cullT = 1.5;
  state.zombies = state.zombies.filter(z => {
    if (z.dead || z.boss || (z as Zombie & { roadTag?: string }).roadTag) return true;
    const far = Math.hypot(z.x - p.x, z.y - p.y) > 2300;
    return !(far && (z.state === 'idle' || z.state === 'wander') && !zombies.visible(state, z.x, z.y, z.r));
  });
}
function rewardKills(state: GameState, actors: Zombie[]) {
  const r = state.road!, run = currentRun(state), def = missionOf(state);
  for (const z of actors) {
    const zz = z as Zombie & { roadTag?: string; _roadScored?: boolean };
    if (!z.dead || zz._roadScored) continue;
    zz._roadScored = true;
    r.missionKills++; r.totals.kills++;
    if (run && zz.roadTag === run.tag) run.kills++;
    // the hive: honey where a Honeypot bursts, a cave-in where a burrow falls, ichor from anything with six legs
    const ichor = r.world.hive ? hive.onDeath(state, z) : [];
    ichor.forEach((st, i) => { const d = dropAt(state, { x: z.x + (i ? 22 : 0), y: z.y + (i ? 14 : 0) }, st); if (!z.boss) d.life = 60; });
    if (bosses.isBoss(z)) {
      progression.addXP(state, 400 * XP_MUL);
      const loot: Stack[] = [...bosses.trophyLoot(z.boss), { id: r.world.hive ? 'royal_jelly' : 'medkit', qty: 1 }];
      loot.forEach((st, i) => dropAt(state, { x: z.x + Math.cos(i * 2.1) * 34, y: z.y + Math.sin(i * 2.1) * 34 }, st));
      bosses.onBossDeath(state, z, def.bossHp ?? 1);
      state.player.sp++;
      continue;
    }
    progression.addXP(state, zombies.TYPES[z.type].xp * XP_MUL);
    if (zombies.isInert(z)) continue;
    const roll = rand(state);
    if (roll < 0.045) {
      // Random standard ammo; mints remain a Plague Lord reward.
      const d = dropAt(state, { x: z.x, y: z.y }, randomAmmoDrop(state, 1.2)); d.life = 45;
    } else if (roll < 0.065) { const d = dropAt(state, { x: z.x, y: z.y }, { id: 'bandage', qty: 1 }); d.life = 45; }
  }
}

// ------------------------------------------------------------------ pickups (walk over)
// Ammo, meds, weapons and armor go into the backpack (the inventory screen equips, upgrades and uses them).
// A weapon or armor piece for an empty slot is equipped on the spot. Full backpack: the bag stays on the ground.
const SLOT_OF: Record<string, EquipKey> = { primary: 'primary', secondary: 'secondary', melee: 'melee', head: 'head', body: 'body', back: 'back' };
function equipDirect(state: GameState, stack: Stack): string | null {
  const p = state.player, item = ITEMS[stack.id];
  const slot: EquipKey | undefined = item?.type === 'backpack' ? 'back' : item?.slot ? SLOT_OF[item.slot] : undefined;
  if (!slot) return null;
  const worn = p.inv.equip[slot];
  if (worn) {
    // a strictly better helmet, vest or backpack replaces what you wear; the old piece goes into the bag (guns never auto-swap)
    const better = item.type === 'armor' ? (item.armor ?? 0) > (ITEMS[worn.id]?.armor ?? 0) : item.type === 'backpack' ? (item.slots ?? 0) > (ITEMS[worn.id]?.slots ?? 0) : false;
    if (!better) return null;
    p.inv.equip[slot] = { id: stack.id, qty: 1, ...(stack.lvl ? { lvl: stack.lvl } : {}) };
    if (item.type === 'backpack') inv.recalcSize(state);
    if (inv.add(p.inv, worn.id, 1, worn.lvl ? { lvl: worn.lvl } : undefined, state) > 0) dropAt(state, { x: p.x, y: p.y }, worn).armed = false;
    progression.sync(state);
    return `${item.name} equipped (${ITEMS[worn.id]?.name ?? worn.id} → backpack)`;
  }
  const def = combat.WEAPONS[stack.id];
  p.inv.equip[slot] = { id: stack.id, qty: 1, ...(def ? { mag: stack.mag ?? def.magSize } : {}), ...(stack.lvl ? { lvl: stack.lvl } : {}) };
  if (def) {
    if (def.ammo) inv.add(p.inv, def.ammo, def.reloadAll ? 5 : def.magSize * 2);
    // a new gun goes straight into your hands unless you are already holding a primary
    if (slot === 'primary' || (slot === 'secondary' && p.active === 'melee')) combat.switchTo(state, slot);
  } else { progression.sync(state); inv.recalcSize(state); }
  return `${item.name} equipped`;
}
function pickups(state: GameState, dt: number) {
  const p = state.player, r = state.road!;
  state.drops = state.drops.filter(drop => {
    if (drop.life !== Infinity) drop.life -= dt;
    // Also catch existing bags and direct/scripted drops that bypass makeDrop.
    // Quest tokens are not ordinary inventory items.
    if (!drop.quest) {
      inv.removeMaterials(drop.inv);
      if (drop.icon && ITEMS[drop.icon]?.type === 'material') drop.icon = undefined;
    }
    const stack = drop.inv.slots.find(Boolean);
    if (drop.life <= 0 || !drop.inv.slots.some(Boolean)) return false;
    if (drop.kind !== 'loot') return true;
    drop.icon ??= stack?.id; drop.mission ??= r.mission;   // bags the player drops belong to the current mission (a restart clears them)
    const d = Math.hypot(p.x - drop.x, p.y - drop.y), within = d <= p.r + drop.r + PICK_R;
    if (!drop.armed) { if (d > p.r + drop.r + PICK_R + 24) drop.armed = true; return true; }
    if (!within || !phys.canReach(state, p.x, p.y, drop)) return true;
    // a dropped backpack bag can hold several stacks: take what fits
    let took = false;
    for (let i = 0; i < drop.inv.slots.length; i++) {
      const st = drop.inv.slots[i]; if (!st) continue;
      if (drop.quest) { r.collected.push(st.id); drop.inv.slots[i] = null; took = true; toast(state, `Picked up: ${QUEST_ITEMS[st.id] ?? st.id}`, '#ffd36b'); continue; }
      const item = ITEMS[st.id];
      if (!item) { drop.inv.slots[i] = null; continue; }
      if (item.type === 'weapon' || item.type === 'armor' || item.type === 'backpack') {
        const msg = equipDirect(state, st);
        if (msg) { drop.inv.slots[i] = null; took = true; toast(state, msg); r.collected.push(st.id); continue; }
      }
      const left = inv.add(p.inv, st.id, st.qty, { ...(st.mag !== undefined ? { mag: st.mag } : {}), ...(st.lvl ? { lvl: st.lvl } : {}) }, state);
      if (left < st.qty) {
        took = true; r.collected.push(st.id);
        emit(state, { t: 'itemAdded', id: st.id, qty: st.qty - left });
        if (item.type === 'weapon' || item.type === 'armor') toast(state, `${item.name} → backpack (press I to equip or upgrade)`);
      }
      if (left > 0) { st.qty = left; if (state.time - r.fullToastT > 3) { toast(state, 'Backpack full — drop or use something (I)', '#ff9a80'); r.fullToastT = state.time; } }
      else drop.inv.slots[i] = null;
    }
    if (took) sound(state, 'pickup');
    return drop.inv.slots.some(Boolean);
  });
}

// ------------------------------------------------------------------ death
function died(state: GameState) {
  const p = state.player;
  if (!p.dead) { p.dead = true; emit(state, { t: 'playerDied' }); }
  p.hp = 0; p.vx = p.vy = 0;
  state.screen = 'dead'; state.stats.deaths++;
  state.interact = null; state.search = null;
  toast(state, 'You died. The mission restarts from the checkpoint.', '#f66'); sound(state, 'gameOver');
}

// ------------------------------------------------------------------ step
export function stepRoad(state: GameState, input: InputState, dt: number) {
  const r = state.road; if (!r) return;
  if (state.screen !== 'playing' || state.paused) return;
  if (state.ui !== null) return;
  if (!Number.isFinite(dt) || dt <= 0) return;
  if (r.phase === 'briefing') { begin(state); return; }
  if (r.phase === 'complete') { next(state); return; }
  if (r.phase === 'ended') return;
  snapshotInterp(state); state.tick++;
  const actors = state.zombies.slice();
  if (state.player.dead || state.player.hp <= 0) { rewardKills(state, actors); died(state); return; }
  state.time += dt;
  if (r.subtitle && state.time > r.subtitle.until) r.subtitle = null;
  player.update(state, input, dt);
  state.interact = null;   // no container searching in this mode: supplies are bags on the floor (see placeScavenge)
  if (input.pressed.has('heal')) inv.quickHeal(state);
  if (state.dev?.god) { const p = state.player; p.hp = p.maxHp; p.stamina = p.maxStamina; }
  combat.update(state, input, dt);
  updateSquad(state, dt);
  if (!state.player.dead) zombies.update(state, dt);
  if (!state.player.dead) bosses.update(state, dt, missionOf(state).bossHp ?? 1);
  rewardKills(state, actors);
  if (r.world.hive) {
    // burrows fall quiet while an arena boss is up: its own rally brings the adds
    const o = current(state), def = missionOf(state), bossUp = o?.kind === 'boss' && !!currentRun(state)?.bossId;
    hive.update(state, dt, bossUp ? null : def.swarm ?? null, def.types, pressureOf(state));
  }
  if (state.player.dead || state.player.hp <= 0) { died(state); return; }
  pickups(state, dt);
  ambient(state, dt); packs(state); cull(state, dt);
  updateObjective(state, input, dt);
  state.shake = state.shake > 0.1 ? state.shake * Math.exp(-10 * dt) : 0;
}

/** For the HUD: distance in metres (10px = 1m, as the campaign tracker does). */
export function markerDistance(state: GameState) {
  const run = currentRun(state); if (!run) return 0;
  return Math.round(Math.hypot(run.point.x - state.player.x, run.point.y - state.player.y) / 10);
}
export const castName = (id: Speaker) => CAST[id].name.split(' ')[0];
/** Testing panel: finish the current objective. */
export function devSkip(state: GameState) { if (state.road?.phase === 'play') finishObjective(state); }
