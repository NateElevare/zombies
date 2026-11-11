// AI and combat feedback ported from sv-zombies.js (including committed sidesteps and bounded turning).
import { rand, phys, emit, toast, sound, angleDiff } from './core';
import type { GameState, Zombie, ZombieType, Rect, Vec, Structure, Solid } from './types';
import { isNight } from './game';
import * as world from './world';
import * as base from './base';
import * as player from './player';
import * as progression from './progression';
import * as loot from './loot';
import * as pathing from './pathing';
import * as hiveBugs from './hive-bugs';
import { isQueenConduit } from '../hive-conduits';

/** Story-mode spawn density: scales indoor packs, the outdoor trickle, horde size and the population cap. */
export const SPAWN_SCALE = 0.5;
const TAU = Math.PI * 2, MAX_POPULATION = Math.round(120 * SPAWN_SCALE);
export const TYPES = {
  walker: { r: 14, hp: 38, speed: 65, damage: 10, xp: 10, color: '#6b8f4e' },
  runner: { r: 11, hp: 25, speed: 135, damage: 8, xp: 15, color: '#a3b545' },
  brute: { r: 22, hp: 160, speed: 43, damage: 26, xp: 40, color: '#4e6b3a' },
  crawler: { r: 9, hp: 20, speed: 92, damage: 6, xp: 12, color: '#7d6b4e' },
  bloater: { r: 19, hp: 78, speed: 48, damage: 12, xp: 25, color: '#8a9a3a' },
  // The Hive Below (sim/hive.ts). Tuned for the dark: they get no night speed bonus.
  drone: { r: 13, hp: 24, speed: 82, damage: 7, xp: 6, color: '#c98a3a' },
  honeypot: { r: 19, hp: 75, speed: 45, damage: 10, xp: 18, color: '#e0a83a' },
  grub: { r: 8, hp: 12, speed: 95, damage: 4, xp: 3, color: '#d8cfa8' },
  // the cells beyond the Warrens (behaviours in sim/hive-bugs.ts)
  hopper: { r: 11, hp: 18, speed: 105, damage: 6, xp: 7, color: '#9fb54a' },
  shrieker: { r: 14, hp: 45, speed: 55, damage: 6, xp: 20, color: '#7fae8a' },
  stinger: { r: 12, hp: 28, speed: 120, damage: 8, xp: 10, color: '#e0c23a' },
  spitter: { r: 17, hp: 65, speed: 50, damage: 16, xp: 22, color: '#d0703a' },
  shieldback: { r: 23, hp: 230, speed: 44, damage: 28, xp: 45, color: '#6a4a30' },
  lurker: { r: 16, hp: 95, speed: 60, damage: 32, xp: 35, color: '#5a9a6a' },
  dustwing: { r: 13, hp: 30, speed: 95, damage: 5, xp: 10, color: '#b0a890' },
  skitterer: { r: 10, hp: 22, speed: 145, damage: 5, xp: 9, color: '#6a3a2a' },
  // inert: a burrow mouth and an egg cluster. No AI, no attack, nothing pushes them; they are shot, cut or burned.
  burrow: { r: 30, hp: 260, speed: 0, damage: 0, xp: 30, color: '#3a2a1c' },
  egg: { r: 18, hp: 45, speed: 0, damage: 0, xp: 8, color: '#cfd8a0' }
};
export const VARIANTS: Record<ZombieType, number> = { walker: 4, runner: 3, brute: 2, crawler: 2, bloater: 2, drone: 1, honeypot: 1, grub: 1, burrow: 1, egg: 1,
  hopper: 1, shrieker: 1, stinger: 1, spitter: 1, shieldback: 1, lurker: 1, dustwing: 1, skitterer: 1 };
const CITY_TYPES = new Set<ZombieType>(['walker', 'runner', 'brute', 'crawler', 'bloater']);
/** The Hive Below's creatures (and its two fixtures). */
export const isHiveType = (t: ZombieType) => !CITY_TYPES.has(t);
/** A burrow mouth or an egg cluster: a target, not a creature. */
export const isInert = (z: Zombie) => z.type === 'burrow' || z.type === 'egg';
interface AiZombie extends Zombie {
  losTimer: number; seesPlayer: boolean; memory: number; decisionTimer: number; side: number;
  avoidTimer: number; progressTimer: number; progressX: number; progressY: number; stuckTime: number; attackTarget: string | null;
  startX: number; startY: number;
  // Navigation: periodic straight-line check, smoothed flow-field heading, unstick nudge.
  // All set in spawn() so every zombie keeps one object shape (hot loops stay monomorphic).
  pathTimer: number; direct: boolean; navX: number; navY: number; navOn: boolean; unstick: number;
  crowded: boolean;  // another zombie overlaps us on the side we're walking toward (set by separate())
  inert: boolean;    // a fixture (burrow, egg cluster): skipped by the AI, the crowd and the bite loop
  mul: number;       // speed multiplier owned by sim/hive.ts (honey 0.5, frenzy 1.2); 1 everywhere else
  nightMul: number;  // 1.25 for the city's dead, 1 for the hive's (they live in the dark)
  home: string | null;   // building this zombie was spawned in (indoor packs stay inside while wandering)
  cutoff: boolean;       // no path to the player (e.g. it would have to go through a doorway): stand and stare
  pursuit: number;       // seconds left of close pursuit: it was near when the player ducked through a doorway, so it follows
}
/** Indoor pack of one building: how many are left, whether they're spawned right now, and when it refills. */
interface Pack { left: number; live: boolean; clearedDay: number }
/** Zombies this close when the player goes through a doorway keep chasing through it (no safe rooms). */
export const PURSUIT_RANGE = 350;
const PURSUIT_TIME = 30;
/** Horde night: every zombie paths through doorways. */
export function hordeActive(state: GameState) { return night(state) && !!state.base && state.base.hordeDay === (state.clock ? state.clock.day : 1) && state.mode === 'survival'; }
interface Runtime { populationTimer: number; hordeRemaining: number; groanTimer: number; nextId: number; outdoorTimer: number; packs: Map<string, Pack>; playerIn: string | null | undefined }
function runtime(state: GameState): Runtime {
  const rt = (state._zombies ??= { populationTimer: 0, hordeRemaining: 0, groanTimer: 5, nextId: 0 }) as Runtime;
  rt.packs ??= new Map(); rt.outdoorTimer ??= 0;
  return rt;
}
const PACK_RADIUS = 1500;          // buildings this close get their indoor pack
const PACK_KEEP = 2100;            // packs further than this are put away (survivors remembered)
const REFILL_DAYS = 2;             // a cleared building stays empty this many days
/** True if the player has built something inside this building: it's their base, nothing spawns there. */
export function isBase(state: GameState, b: Rect) {
  for (const s of state.structures || []) {
    if (s.dead) continue;
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    if (cx >= b.x - 8 && cx <= b.x + b.w + 8 && cy >= b.y - 8 && cy <= b.y + b.h + 8) return true;
  }
  return false;
}
/** No spawning inside a building the player built in, or right next to anything they built outdoors. */
function nearBase(state: GameState, x: number, y: number) {
  const b = world.buildingAt ? world.buildingAt(state, x, y) : null;
  if (b && isBase(state, b)) return true;
  for (const s of state.structures || []) {
    if (s.dead) continue;
    if (Math.abs(s.x + s.w / 2 - x) < 260 && Math.abs(s.y + s.h / 2 - y) < 260) return true;
  }
  return false;
}
const random = rand;
const night = isNight;
const sight = phys.lineOfSight;
function blood(state: GameState, x: number, y: number, amount: number, angle = 0, ichor = false) { emit(state, ichor ? { t: 'blood', x, y, amount, angle, ichor } : { t: 'blood', x, y, amount, angle }); }
function overlaps(z: { x: number; y: number; r: number }, o: Rect, margin = 0) {
  const dx = z.x - Math.max(o.x, Math.min(o.x + o.w, z.x));
  const dy = z.y - Math.max(o.y, Math.min(o.y + o.h, z.y));
  return dx * dx + dy * dy < (z.r + (margin || 0)) ** 2;
}
export function visible(state: GameState, x: number, y: number, r: number) {
  // Fixed player-relative view exclusion keeps spawning independent of rendering/camera resolution.
  const p = state.player;
  return !!p && Math.abs(x - p.x) <= 480 + r && Math.abs(y - p.y) <= 320 + r;
}
// Also protect the player's light/view when the camera is still catching up.
function safeSpawn(state: GameState, point: Vec | null, r: number) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || visible(state, point.x, point.y, r + 80)) return false;
  const p = state.player;
  if (p) {
    const dx = point.x - p.x, dy = point.y - p.y, d = Math.hypot(dx, dy);
    if (d < 460) return false;
    if (p.flashlight && d < 700 && (dx * Math.cos(p.angle || 0) + dy * Math.sin(p.angle || 0)) / d > Math.cos(0.55)) return false;
  }
  if (!phys.isFree(state, point.x, point.y, r + 2)) return false;
  if (nearBase(state, point.x, point.y)) return false;
  if ((state.structures || []).some(s => !s.dead && overlaps({ x: point.x, y: point.y, r: r + 2 }, s))) return false;
  return !((state.zombies as AiZombie[]) || []).some(z => !z.dead && Math.hypot(z.x - point.x, z.y - point.y) < z.r + r + 4);
}
function spawnPoint(state: GameState, r: number, cx?: number, cy?: number) {
  const p = state.player;
  cx = cx === undefined ? p.x : cx; cy = cy === undefined ? p.y : cy;
  for (let i = 0; i < 28; i++) {
    let point;
    if (i < 8 && world.randomSpawnPoint) {
      point = world.randomSpawnPoint(state, cx, cy, 750, 1550, { next: () => rand(state) });
    } else {
      const a = random(state) * TAU, d = 750 + random(state) * 800;
      point = { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
    }
    if (safeSpawn(state, point, r)) return point;
  }
  return null;
}
export function spawn(state: GameState, type: ZombieType, x: number, y: number, horde = false) {
  type = Object.hasOwn(TYPES, type) ? type : 'walker';
  const t = TYPES[type];
  const z: AiZombie = { id: 'z' + runtime(state).nextId++, x, y, r: t.r, type,
    variant: Math.floor(rand(state) * VARIANTS[type]), vx: 0, vy: 0, prevX: x, prevY: y, prevAngle: 0, attackT: 99, startX: x, startY: y,
    hp: t.hp, maxHp: t.hp, speed: t.speed, damage: t.damage, angle: random(state) * TAU,
    state: horde ? 'chase' : 'idle', target: null, attackCooldown: 0, hitFlash: 0, burn: 0, dead: false,
    horde: !!horde, losTimer: random(state) * 0.25, seesPlayer: false, memory: 0,
    decisionTimer: 1 + random(state) * 3, side: random(state) < 0.5 ? -1 : 1,
    avoidTimer: 0, progressTimer: 0, progressX: x, progressY: y, stuckTime: 0, attackTarget: null,
    pathTimer: 0, direct: false, navX: 0, navY: 0, navOn: false, unstick: 0, crowded: false, home: null, cutoff: false, pursuit: 0,
    inert: type === 'burrow' || type === 'egg', mul: 1, nightMul: isHiveType(type) ? 1 : 1.25 };
  if (z.inert) { z.angle = 0; z.state = 'idle'; z.horde = false; }
  z.prevAngle = z.angle;
  (state.zombies as AiZombie[]).push(z);
  return z;
}
function bed(state: GameState) {
  const id = state.base && state.base.bed;
  return (state.structures || []).find(s => !s.dead && s.hp > 0 && s.type === 'bed' && (!id || s.id === id)) || null;
}
function pickType(state: GameState, horde: boolean) {
  const roll = random(state), day = state.clock ? state.clock.day : 1;
  if (roll < (horde || day > 2 ? 0.1 : 0.035)) return 'brute';
  if (roll < 0.18) return 'bloater';
  if (roll < 0.33) return 'crawler';
  if (roll < 0.53) return 'runner';
  return 'walker';
}
/** Testing: start a horde now (only spawns while it is night; targets the bed if there is one). */
export function devHorde(state: GameState) {
  const rt = runtime(state), day = state.clock.day;
  rt.hordeRemaining = hordeSize(day);
  rt.populationTimer = 0;
  state.base.hordeDay = day;
  emit(state, { t: 'horde', count: rt.hordeRemaining });
  toast(state, 'Horde incoming! (test)', '#ff8061');
  sound(state, 'waveStart');
}
/** Zombies in a horde-night wave. */
export const hordeSize = (day: number) => Math.round(Math.min(80, 20 + 5 * day) * SPAWN_SCALE);
function population(state: GameState, dt: number, isNight: boolean) {
  const rt = runtime(state), p = state.player, day = state.clock ? state.clock.day : 1;
  state.base = state.base || { bed: null };
  if (isNight && day % 3 === 0 && state.base.hordeDay !== day) {
    state.base.hordeDay = day;
    rt.hordeRemaining = hordeSize(day);
    emit(state, { t: 'horde', count: rt.hordeRemaining });
    toast(state, 'Horde night! Defend your bed.', '#ff8061');
    sound(state, 'waveStart');
  }
  if (!isNight) rt.hordeRemaining = 0;
  rt.populationTimer -= dt; rt.outdoorTimer -= dt;
  if (rt.populationTimer > 0) return;
  rt.populationTimer = 0.5;
  let alive = 0, local = 0;
  for (const z of (state.zombies as AiZombie[])) {
    if (z.dead) continue;
    const d = Math.hypot(z.x - p.x, z.y - p.y);
    if (!z.horde && !z.home && d > 2400 && (z.state === 'idle' || z.state === 'wander') && !visible(state, z.x, z.y, z.r)) {
      z.dead = true; continue; // Despawning is not a kill.
    }
    alive++; if (d < 1600 && !z.home) local++;
  }
  packs(state, rt, alive);
  const horde = rt.hordeRemaining > 0;
  if (horde) {
    const home = bed(state), count = Math.min(MAX_POPULATION - alive, 12, rt.hordeRemaining);
    for (let i = 0; i < count; i++) {
      const type = pickType(state, true);
      const point = spawnPoint(state, TYPES[type].r, home ? home.x + home.w / 2 : p.x, home ? home.y + home.h / 2 : p.y);
      if (!point) break;
      spawn(state, type, point.x, point.y, true);
      rt.hordeRemaining--;
    }
    return;
  }
  // Outdoors: a thin trickle, so a cleared street stays quiet for a while (most zombies live indoors now).
  const district = world.districtAt ? world.districtAt(state, p.x, p.y) : 'suburb';
  const density = { downtown: 1.45, military: 1.6, industrial: 1.15, suburb: 1, forest: 0.45 }[district] || 1;
  const desired = Math.round((isNight ? 22 : 10) * density * SPAWN_SCALE);
  if (rt.outdoorTimer > 0 || local >= desired || alive >= MAX_POPULATION) return;
  rt.outdoorTimer = isNight ? 2.5 : 5;
  const type = pickType(state, false), point = spawnPoint(state, TYPES[type].r);
  if (point) spawn(state, type, point.x, point.y, false);
}
/** How many zombies a building holds when full: bigger buildings and dangerous places hold more. */
export function packSize(b: { w: number; h: number; kind: string; tier: number }) {
  const base = Math.max(2, Math.min(9, Math.round(b.w * b.h / 26000)));
  const kind = ({ military: 1.6, police: 1.4, hospital: 1.5, warehouse: 1.2, store: 1.2 } as Record<string, number>)[b.kind] ?? 1;
  return Math.max(1, Math.round(Math.min(12, Math.round(base * kind + (b.tier || 0))) * SPAWN_SCALE));
}
export function indoorPoint(state: GameState, b: import('./types').Building, r: number) {
  const rooms = b.rooms && b.rooms.length ? b.rooms : [b];
  for (let i = 0; i < 12; i++) {
    const room = rooms[Math.floor(random(state) * rooms.length)], m = r + 10;
    if (room.w <= m * 2 || room.h <= m * 2) continue;
    const x = room.x + m + random(state) * (room.w - m * 2), y = room.y + m + random(state) * (room.h - m * 2);
    if (!phys.isFree(state, x, y, r + 2)) continue;
    if ((state.zombies as AiZombie[]).some(z => !z.dead && Math.hypot(z.x - x, z.y - y) < z.r + r + 4)) continue;
    return { x, y };
  }
  return null;
}
/** Indoor packs: every building near the player holds a group of zombies; kill them and it stays clear for a while. */
function packs(state: GameState, rt: Runtime, alive: number) {
  const p = state.player, day = state.clock ? state.clock.day : 1;
  const count = new Map<string, number>();
  for (const z of state.zombies as AiZombie[]) if (!z.dead && z.home) count.set(z.home, (count.get(z.home) || 0) + 1);
  for (const b of state.buildings || []) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, d = Math.max(Math.abs(cx - p.x) - b.w / 2, Math.abs(cy - p.y) - b.h / 2);
    let pack = rt.packs.get(b.id);
    if (pack?.live) {
      const n = count.get(b.id) || 0;
      pack.left = n;
      if (n === 0) { pack.live = false; pack.clearedDay = day; continue; }
      if (d > PACK_KEEP) {
        // Put the pack away; the survivors come back when the player returns.
        for (const z of state.zombies as AiZombie[]) if (!z.dead && z.home === b.id && z.state !== 'chase' && !visible(state, z.x, z.y, z.r)) z.dead = true;
        const kept = (state.zombies as AiZombie[]).filter(z => !z.dead && z.home === b.id).length;
        if (!kept) pack.live = false;
      }
      continue;
    }
    if (d > PACK_RADIUS) continue;
    if (!pack) { pack = { left: packSize(b), live: false, clearedDay: -99 }; rt.packs.set(b.id, pack); }
    if (pack.left <= 0) {
      if (day - pack.clearedDay < REFILL_DAYS) continue;
      pack.left = packSize(b);
    }
    if (isBase(state, b)) continue;
    // Only fill buildings the player can't see into right now.
    if (visible(state, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) / 2 + 60)) continue;
    if (p.x > b.x - 40 && p.x < b.x + b.w + 40 && p.y > b.y - 40 && p.y < b.y + b.h + 40) continue;
    let made = 0;
    for (let i = 0; i < pack.left && alive + made < MAX_POPULATION; i++) {
      const type = pickType(state, false), pt = indoorPoint(state, b, TYPES[type].r);
      if (!pt) break;
      const z = spawn(state, type, pt.x, pt.y, false); z.home = b.id; made++;
    }
    pack.left = made; pack.live = made > 0;
    alive += made;
  }
}
/** The Long Road: ordinary zombies climb through windows (bosses do not fit). The window's glass breaks the first time. */
const climbsWindows = (state: GameState, z: Zombie) => state.mode === 'road' && !z.boss;
const isWindow = (o: Solid) => o.kind === 'window';
function climbing(state: GameState, z: Zombie): Solid | null {
  let hit: Solid | null = null;
  state.grid.each(z.x - z.r, z.y - z.r, z.r * 2, z.r * 2, o => { if (isWindow(o) && overlaps(z, o)) { hit = o; return true; } return false; });
  return hit;
}
function updateWindowClimb(state: GameState, z: Zombie) {
  const win = !z.dead && climbsWindows(state, z) ? climbing(state, z) : null;
  if (!win) { z.windowClimb = undefined; return; }
  const axis = win.w < win.h ? 'x' : 'y', center = win[axis] + (axis === 'x' ? win.w : win.h) / 2;
  const old = z.windowClimb;
  const same = old && old.x === win.x && old.y === win.y && old.axis === axis;
  const direction = same ? old.direction : z[axis] < center ? 1 : z[axis] > center ? -1 : (axis === 'x' ? Math.cos(z.angle) : Math.sin(z.angle)) >= 0 ? 1 : -1;
  const extent = (axis === 'x' ? win.w : win.h) / 2 + z.r;
  z.windowClimb = { x: win.x, y: win.y, axis, direction, progress: Math.max(0, Math.min(1, .5 + direction * (z[axis] - center) / (extent * 2))) };
}
function smashWindow(state: GameState, o: Solid) {
  const w = o as Solid & { smashed?: boolean };
  if (w.smashed) return;
  w.smashed = true; o.blocksBullets = false;   // broken glass: a lane you can shoot down too
  emit(state, { t: 'salvaged', x: o.x, y: o.y, w: o.w, h: o.h });   // repaint the wall strip with the broken pane
  emit(state, { t: 'bulletHit', x: o.x + o.w / 2, y: o.y + o.h / 2, angle: 0, surface: 'wall' });
  sound(state, 'open', o.x, o.y);
}
function constrain(state: GameState, z: Zombie) {
  const climb = climbsWindows(state, z);
  let touched = phys.collideCircle ? phys.collideCircle(state, z, climb ? isWindow : undefined) : null;
  // Doors deliberately have solid:false, so resolve their zombie-only collisions here.
  if (state.grid && state.grid.each) state.grid.each(z.x - z.r, z.y - z.r, z.r * 2, z.r * 2, o => {
    if (!o.structure || o.structure.dead || o.structure.type !== 'wood_door' || !overlaps(z, o)) return;
    const cx = Math.max(o.x, Math.min(o.x + o.w, z.x)), cy = Math.max(o.y, Math.min(o.y + o.h, z.y));
    const dx = z.x - cx, dy = z.y - cy, d = Math.hypot(dx, dy);
    if (d > 0.0001) { z.x += dx / d * (z.r - d); z.y += dy / d * (z.r - d); }
    else {
      const distances = [z.x - o.x, o.x + o.w - z.x, z.y - o.y, o.y + o.h - z.y];
      const edge = distances.indexOf(Math.min.apply(null, distances));
      if (edge === 0) z.x = o.x - z.r; else if (edge === 1) z.x = o.x + o.w + z.r;
      else if (edge === 2) z.y = o.y - z.r; else z.y = o.y + o.h + z.r;
    }
    touched = o;
  });
  return touched;
}
function obstacle(state: GameState, z: Zombie, x: number, y: number) {
  return phys.raycast ? phys.raycast(state, z.x, z.y, x, y, z.r + 1, pathing.blocksZombie) : null;
}
const aggressive = (z: AiZombie) => z.horde || z.state === 'chase' || z.state === 'investigate' || z.state === 'attackStructure';
/** Bed center while a horde has a bed to hit, otherwise null. */
function homePoint(home: Structure | null) { return home ? { x: home.x + home.w / 2, y: home.y + home.h / 2 } : null; }
/**
 * Flow-field step for zombies heading at the player (or the bed during a horde) when the straight line is blocked.
 * Returns null when the zombie should use plain local steering: open line of sight, a target that isn't the
 * player/bed (noise, wandering), or a zombie outside the field.
 */
function navigate(state: GameState, z: AiZombie, dt: number, home: Structure | null): pathing.Step | null {
  const t = z.target, p = state.player;
  z.cutoff = false;
  if (!t || !aggressive(z)) return null;
  const bedGoal = z.horde ? homePoint(home) : null;
  let key: string, gx: number, gy: number;
  if (bedGoal) { key = 'bed'; gx = bedGoal.x; gy = bedGoal.y; }
  else if (p && Math.hypot(t.x - p.x, t.y - p.y) < 96) { key = z.horde || z.pursuit > 0 || hordeActive(state) ? 'playerOpen' : 'player'; gx = p.x; gy = p.y; }
  else return null;
  if (Math.abs(z.x - gx) > pathing.RADIUS - 24 || Math.abs(z.y - gy) > pathing.RADIUS - 24) return null;
  // Re-check the straight line a few times a second (staggered per zombie), not every tick.
  z.pathTimer -= dt;
  if (z.pathTimer <= 0) { z.pathTimer = 0.3; z.direct = !obstacle(state, z, t.x, t.y); }
  if (z.direct) return null;
  const st = pathing.step(pathing.field(state, key, gx, gy), z.x, z.y);
  // No route (the only way in or out is a doorway): don't grind along the walls.
  if (!st && key === 'player') z.cutoff = true;
  return st;
}
function attackStructure(state: GameState, z: AiZombie, s: Structure | null | undefined, dt: number) {
  if (!s || s.dead || s.hp <= 0 || !overlaps(z, s, 7)) return false;
  z.state = 'attackStructure'; z.attackTarget = s.id;
  const targetAngle = Math.atan2(s.y + s.h / 2 - z.y, s.x + s.w / 2 - z.x);
  z.angle += angleDiff(z.angle, targetAngle) * Math.min(1, dt * 12);
  if (z.attackCooldown <= 0 && base.damage) {
    base.damage(state, s, z.damage * (z.type === 'brute' ? 1.6 : 1));
    z.attackCooldown = z.type === 'crawler' ? 0.65 : 0.9;
    z.attackT = 0; emit(state, { t: 'zombieAttack', id: z.id, x: z.x, y: z.y });
  }
  return true;
}
function move(state: GameState, z: AiZombie, dt: number, isNight: boolean, home: Structure | null) {
  if (!z.target) return;
  const dx = z.target.x - z.x, dy = z.target.y - z.y, distance = Math.hypot(dx, dy);
  if (distance < 6) {
    if (!z.horde && z.state !== 'chase') { z.state = 'idle'; z.target = null; z.memory = 0; z.decisionTimer = 1 + random(state) * 2; }
    return;
  }
  let sx = dx / distance, sy = dy / distance;
  const p = state.player;
  const stop = z.state === 'chase' && !z.horde ? z.r + p.r : 0;
  // Queue behind a zombie that's in the way instead of shoving into it (stops crowds collapsing into one blob).
  // halfway through a window frame: slow, and the pane goes
  let climbSlow = 1;
  if (climbsWindows(state, z)) { const win = climbing(state, z); if (win) { climbSlow = 0.32; smashWindow(state, win); } }
  const step = Math.min(z.speed * z.mul * stickySlow(z) * (isNight ? z.nightMul : 1) * (z.state === 'wander' ? 0.4 : 1) * (z.crowded ? CROWD_SLOW : 1) * climbSlow * dt, Math.max(0, distance - stop));
  const nav = navigate(state, z, dt, home);
  if (nav) {
    // The path leads through a player structure: break it once in reach.
    if (nav.structure && attackStructure(state, z, nav.structure, dt)) return;
    // Smooth the heading so cell-to-cell changes in the field don't wobble the walk.
    const k = Math.min(1, dt * 10);
    let nx = z.navOn ? z.navX + (nav.x - z.navX) * k : nav.x, ny = z.navOn ? z.navY + (nav.y - z.navY) * k : nav.y;
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl; z.navX = nx; z.navY = ny; z.navOn = true;
    sx = nx; sy = ny;
    // Lost sight but still walking the path to where the player was: don't give up halfway round the building.
    if (z.state === 'investigate') z.memory = Math.max(z.memory, Math.min(12, pathing.costToPx(nav.cost) / z.speed + 1.5));
    if (z.unstick > 0) {
      // Pinned (usually by the crowd at a doorway): lean sideways for a moment.
      const lx = sx - sy * z.side * 0.9, ly = sy + sx * z.side * 0.9, ll = Math.hypot(lx, ly);
      sx = lx / ll; sy = ly / ll;
    }
  } else z.navOn = false;
  if (!nav && z.cutoff) {
    // Can't get to the player: stand and stare (and lose interest once they're out of sight).
    z.angle += angleDiff(z.angle, Math.atan2(dy, dx)) * Math.min(1, dt * 6);
    z.progressTimer = 0; z.progressX = z.x; z.progressY = z.y; z.stuckTime = 0;
    return;
  }
  const probe = Math.max(step + 2, 34);
  const hit = nav ? null : obstacle(state, z, z.x + sx * probe, z.y + sy * probe);
  if (hit && hit.rect.structure && aggressive(z)) {
    if (attackStructure(state, z, hit.rect.structure, dt)) return;
  } else if (!nav && (hit || z.avoidTimer > 0)) {
    // Commit to the sidestep briefly so the probe toggling hit/no-hit can't zig-zag every frame.
    if (hit) z.avoidTimer = Math.max(z.avoidTimer, 0.3);
    // Follow a stable tangent with a small forward component; reverse only on sustained stalls.
    const tx = -sy * z.side + sx * 0.22, ty = sx * z.side + sy * 0.22, len = Math.hypot(tx, ty);
    sx = tx / len; sy = ty / len;
    if (obstacle(state, z, z.x + sx * (step + 4), z.y + sy * (step + 4))) {
      sx = -sy * z.side; sy = tx / len * z.side;
    }
  }
  // Turn toward the travel direction at a capped rate instead of snapping (no sprite flicker).
  let da = Math.atan2(sy, sx) - (z.angle || 0);
  da = Math.atan2(Math.sin(da), Math.cos(da));
  z.angle = (z.angle || 0) + da * Math.min(1, dt * 12);
  z.x += sx * step; z.y += sy * step;
  const touched = constrain(state, z);
  // When following a path, only break what the path goes through: brushing past a wall on the way to its gap is not a reason to stop.
  if (touched && touched.structure && aggressive(z) && (!nav || touched.structure === nav.structure)) attackStructure(state, z, touched.structure, dt);
  if (z.unstick > 0) z.unstick = Math.max(0, z.unstick - dt);
  z.progressTimer += dt;
  if (z.progressTimer >= 0.6) {
    const moved = Math.hypot(z.x - z.progressX, z.y - z.progressY);
    if (moved < 4 && step > 0 && z.state !== 'attackStructure') {
      z.stuckTime += z.progressTimer;
      if (nav) { z.side *= -1; z.unstick = 0.5; }
      else { if (z.avoidTimer <= 0) z.side *= -1; z.avoidTimer = 1.4; }
    } else z.stuckTime = 0;
    z.progressTimer = 0; z.progressX = z.x; z.progressY = z.y;
    // A wandering indoor zombie that bumped into furniture just picks a new spot (no teleporting out of its building).
    if (z.home && z.stuckTime >= 1.2 && (z.state === 'wander' || z.state === 'idle')) { z.stuckTime = 0; z.decisionTimer = 0; z.state = 'idle'; z.target = null; }
    else if (state.mode === 'survival' && z.stuckTime >= 6 && !visible(state, z.x, z.y, z.r + 80)) {
      const point = spawnPoint(state, z.r);
      if (point) { z.x = point.x; z.y = point.y; z.progressX = z.x; z.progressY = z.y; z.stuckTime = 0; z.losTimer = 0; }
    }
  }
}
// Spatial hash for separation, reused between ticks (typed arrays, no per-tick Map/string allocation).
const SEP_CELL = 64, CROWD_SLOW = 0.3, CROWD_AHEAD = 0.5;
let sepHead = new Int32Array(1024), sepNext = new Int32Array(256), sepCx = new Int32Array(256), sepCy = new Int32Array(256);
const sepHash = (cx: number, cy: number, mask: number) => (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & mask;
function separate(state: GameState, dt: number) {
  const list = (state.zombies as AiZombie[]), n = list.length;
  if (sepNext.length < n) { const m = Math.max(n, sepNext.length * 2); sepNext = new Int32Array(m); sepCx = new Int32Array(m); sepCy = new Int32Array(m); }
  if (sepHead.length < n * 4) sepHead = new Int32Array(1 << Math.ceil(Math.log2(n * 4)));
  const mask = sepHead.length - 1;
  sepHead.fill(-1);
  // Insert in reverse so each chain lists lower indices first (same pair order as a plain bucket scan).
  for (let i = n - 1; i >= 0; i--) {
    const z = list[i]; if (z.dead || z.inert) continue;
    const cx = Math.floor(z.x / SEP_CELL), cy = Math.floor(z.y / SEP_CELL), h = sepHash(cx, cy, mask);
    sepCx[i] = cx; sepCy[i] = cy; sepNext[i] = sepHead[h]; sepHead[h] = i;
  }
  const strength = Math.min(1, dt * 10);
  for (let i = 0; i < n; i++) list[i].crowded = false;
  for (let i = 0; i < n; i++) {
    const a = list[i]; if (a.dead || a.inert) continue;
    const ax = Math.cos(a.angle), ay = Math.sin(a.angle);
    const col = sepCx[i], row = sepCy[i];
    for (let yy = row - 1; yy <= row + 1; yy++) for (let xx = col - 1; xx <= col + 1; xx++) {
      for (let j = sepHead[sepHash(xx, yy, mask)]; j >= 0; j = sepNext[j]) {
        if (j <= i || sepCx[j] !== xx || sepCy[j] !== yy) continue;
        const b = list[j]; let dx = b.x - a.x, dy = b.y - a.y;
        const radius = a.r + b.r + 2;
        if (dx >= radius || dx <= -radius || dy >= radius || dy <= -radius) continue;
        const d = Math.hypot(dx, dy);
        if (d >= radius) continue;
        if (d > 0.001) { dx /= d; dy /= d; } else { dx = 1; dy = 0; }
        // Facing follows the walking direction, so "ahead" is along the facing.
        // Only queue behind zombies that are going somewhere too; idle ones just get shouldered aside.
        if (aggressive(b) && dx * ax + dy * ay > CROWD_AHEAD) a.crowded = true;
        if (aggressive(a) && -(dx * Math.cos(b.angle) + dy * Math.sin(b.angle)) > CROWD_AHEAD) b.crowded = true;
        // bosses are heavy: the crowd moves around them, not the other way round
        const push = (radius - d) * strength, ka = a.boss ? (b.boss ? 0.5 : 0.04) : b.boss ? 0.96 : 0.5;
        a.x -= dx * push * ka; a.y -= dy * push * ka; b.x += dx * push * (1 - ka); b.y += dy * push * (1 - ka);
      }
    }
  }
  for (const z of list) if (!z.dead && !z.inert) constrain(state, z);
}
export function update(state: GameState, dt: number) {
  const p = state.player; if (!p || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.1);
  const isNight = night(state), rt = runtime(state);
  pathing.tick(state, dt);
  if (state.mode === 'survival') population(state, dt, isNight);
  for (const z of (state.zombies as AiZombie[]) as AiZombie[]) { z.startX = z.x; z.startY = z.y; z.attackT += dt; }
  const home = bed(state);
  // The player went in or out of a building: zombies chasing close behind follow through the doorway.
  const inB = world.buildingAt ? world.buildingAt(state, p.x, p.y)?.id ?? null : null;
  if (rt.playerIn !== undefined && inB !== rt.playerIn) {
    for (const z of state.zombies as AiZombie[]) {
      if (!z.dead && (z.state === 'chase' || z.state === 'investigate' || z.state === 'attackStructure') && Math.hypot(z.x - p.x, z.y - p.y) <= PURSUIT_RANGE) z.pursuit = PURSUIT_TIME;
    }
  }
  rt.playerIn = inB;
  let near = false;
  for (const z of (state.zombies as AiZombie[])) {
    if (z.dead) continue;
    z.attackCooldown = Math.max(0, z.attackCooldown - dt); z.hitFlash = Math.max(0, z.hitFlash - dt);
    stickyTick(state, z, dt); if (!z.dead) corrodeTick(state, z, dt); if (z.dead || z.inert) continue;
    z.avoidTimer = Math.max(0, z.avoidTimer - dt); z.memory = Math.max(0, z.memory - dt);
    z.decisionTimer -= dt; z.losTimer -= dt;
    if (z.pursuit > 0) z.pursuit = z.state === 'idle' || z.state === 'wander' ? 0 : Math.max(0, z.pursuit - dt);
    const distance = Math.hypot(p.x - z.x, p.y - z.y);
    if (distance < 380) near = true;
    const lured = Number(z.lureT) > 0;   // The Hive Below: it is after a lure or a marked bug, not you (sim/hive-arms.ts)
    if (z.losTimer <= 0 && !lured) {
      const range = isNight ? (p.flashlight ? 430 : 220) : 350;
      z.seesPlayer = !p.dead && p.hp > 0 && distance < range && sight(state, z.x, z.y, p.x, p.y);
      z.losTimer = 0.20 + random(state) * 0.1;
      if (z.seesPlayer) { z.target = { x: p.x, y: p.y }; z.memory = 4; z.state = 'chase'; }
      else if (z.state === 'chase' && !z.horde) z.state = 'investigate';
    }
    if (z.horde && !lured) {
      z.target = home ? { x: home.x + home.w / 2, y: home.y + home.h / 2 } : { x: p.x, y: p.y };
      if (z.state !== 'attackStructure') z.state = 'chase';
    } else if (!lured && z.state === 'investigate' && z.memory <= 0) { z.target = null; z.state = 'idle'; z.decisionTimer = 0; }
    if (z.state === 'attackStructure') {
      const s = state.structures.find(s => s.id === z.attackTarget && !s.dead);
      // Stop hacking at a wall once the shared path finds a way around it (e.g. someone else broke through).
      const nav = s && (z.horde || z.memory > 0) ? navigate(state, z, dt, home) : null;
      if ((z.horde || z.memory > 0) && !(nav && !nav.structure) && attackStructure(state, z, s, dt)) continue;
      z.attackTarget = null; z.state = z.horde || z.seesPlayer ? 'chase' : 'investigate';
    }
    if ((z.state === 'idle' || z.state === 'wander') && z.decisionTimer <= 0) {
      const a = random(state) * TAU, d = 50 + random(state) * 130;
      z.target = { x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d };
      const hb = z.home ? state.buildings.find(b => b.id === z.home) : null;
      const isIn = !!hb && z.x > hb.x && z.x < hb.x + hb.w && z.y > hb.y && z.y < hb.y + hb.h;
      if (hb && isIn && random(state) < 0.97) {
        // Mostly shuffle around inside; now and then one drifts out through a doorway.
        z.target.x = Math.max(hb.x + z.r + 12, Math.min(hb.x + hb.w - z.r - 12, z.target.x));
        z.target.y = Math.max(hb.y + z.r + 12, Math.min(hb.y + hb.h - z.r - 12, z.target.y));
      }
      z.state = 'wander'; z.decisionTimer = 4 + random(state) * 5;
    }
    if (z.horde && home && attackStructure(state, z, home, dt)) continue;
    move(state, z, dt, isNight, home);
  }
  separate(state, dt);
  // Read final constrained positions so the art enters/exits on the same tick as the crossing.
  for (const z of state.zombies) updateWindowClimb(state, z);
  for (const z of (state.zombies as AiZombie[])) {
    if (z.dead || z.inert || p.dead || p.hp <= 0 || z.attackCooldown > 0) continue;
    if (Math.hypot(p.x - z.x, p.y - z.y) <= p.r + z.r + 2 && sight(state, z.x, z.y, p.x, p.y)) {
      if (Number(z.lureT) > 0) continue;   // busy with a lure
      if (player.damage) player.damage(state, z.damage, Math.atan2(p.y - z.y, p.x - z.x));
      if (isHiveType(z.type)) hiveBugs.onBite(state, z);
      z.attackCooldown = z.type === 'crawler' ? 0.65 : 0.9;
    z.attackT = 0; emit(state, { t: 'zombieAttack', id: z.id, x: z.x, y: z.y });
    }
  }
  for (const z of (state.zombies as AiZombie[]) as AiZombie[]) { z.vx = (z.x - z.startX) / dt; z.vy = (z.y - z.startY) / dt; }
  rt.groanTimer -= dt;
  if (near && rt.groanTimer <= 0) { sound(state, 'groan'); rt.groanTimer = 8 + random(state) * 15; }
  let write = 0;
  for (const z of (state.zombies as AiZombie[])) if (!z.dead) (state.zombies as AiZombie[])[write++] = z;
  (state.zombies as AiZombie[]).length = write;
}
export function noise(state: GameState, x: number, y: number, radius: number) {
  if (!(radius > 0)) return;
  for (const z of (state.zombies as AiZombie[])) {
    if (z.dead || z.inert || z.horde || z.seesPlayer || Math.hypot(z.x - x, z.y - y) > radius) continue;
    z.target = { x, y }; z.memory = 8; z.state = 'investigate'; z.attackTarget = null;
  }
}
function explode(state: GameState, z: Zombie) {
  const radius = 90, p = state.player;
  state.shake = Math.max(state.shake || 0, 10);
  emit(state, { t: 'explosion', x: z.x, y: z.y, radius });
  blood(state, z.x, z.y, 22, z.angle); noise(state, z.x, z.y, 650);
  if (p && !p.dead && Math.hypot(p.x - z.x, p.y - z.y) <= radius + p.r && player.damage) {
    player.damage(state, 30, Math.atan2(p.y - z.y, p.x - z.x));
  }
  // Mark the source dead before recursion so chained bloaters explode exactly once.
  for (const other of (state.zombies as AiZombie[])) if (!other.dead && Math.hypot(other.x - z.x, other.y - z.y) <= radius + other.r) {
    damage(state, other, 48, Math.atan2(other.y - z.y, other.x - z.x), { source: 'bloater' });
  }
  for (const s of (state.structures || []).slice()) if (!s.dead && overlaps({ x: z.x, y: z.y, r: radius }, s) && base.damage) base.damage(state, s, 48);
}
export interface DamageOptions {
  source?: string; burn?: boolean; crit?: boolean; melee?: boolean; explosion?: boolean; knock?: number;
}
/** Cola & Mints foam: each hit adds a stack (max 6) and refreshes 3.5s of slow + acid damage. */
export const STICKY_MAX = 6, STICKY_TIME = 3.5;
export function stick(state: GameState, zombie: Zombie) {
  const z = zombie as AiZombie;
  z.sticky = STICKY_TIME;
  z.stickyStacks = Math.min(STICKY_MAX, (Number(z.stickyStacks) || 0) + 1);
  if (z.stickyT === undefined || Number(z.stickyT) <= 0) z.stickyT = 0.5;
}
/** Movement multiplier from sticky foam (bosses resist half of it). */
export function stickySlow(z: Zombie) {
  const n = Number(z.stickyStacks) || 0;
  if (!(Number(z.sticky) > 0) || n <= 0) return 1;
  const slow = Math.min(0.65, 0.2 + 0.075 * n);
  return 1 - (z.boss ? slow * 0.5 : slow);
}
function stickyTick(state: GameState, z: AiZombie, dt: number) {
  if (!(Number(z.sticky) > 0)) return;
  z.sticky = Number(z.sticky) - dt;
  z.stickyT = Number(z.stickyT) - dt;
  if (Number(z.stickyT) <= 0) {
    z.stickyT = 0.5;
    damage(state, z, 1.5 * (Number(z.stickyStacks) || 1), NaN, { burn: true, source: 'acid' });
  }
  if (Number(z.sticky) <= 0) { z.sticky = 0; z.stickyStacks = 0; }
}
/** Formic acid: each hit adds a stack (max 6) and refreshes 4s of corrosion. Damage over time only; it does not slow. */
export const CORRODE_MAX = 6, CORRODE_TIME = 4;
export function corrode(state: GameState, zombie: Zombie) {
  const z = zombie as AiZombie;
  // Hive Weapons perks: Deep Burn stacks higher and lasts longer
  z.corro = CORRODE_TIME + progression.perkSum(state, 'corrodeTime');
  z.corroStacks = Math.min(CORRODE_MAX + progression.perkSum(state, 'corrodeMax'), (Number(z.corroStacks) || 0) + 1);
  if (z.corroT === undefined || Number(z.corroT) <= 0) z.corroT = 0.5;
}
function corrodeTick(state: GameState, z: AiZombie, dt: number) {
  if (!(Number(z.corro) > 0)) return;
  z.corro = Number(z.corro) - dt;
  z.corroT = Number(z.corroT) - dt;
  if (Number(z.corroT) <= 0) {
    z.corroT = 0.5;
    damage(state, z, 2 * (1 + progression.perkSum(state, 'corrodeDmg')) * (Number(z.corroStacks) || 1), NaN, { burn: true, source: 'acid' });   // Stronger Acid
  }
  if (Number(z.corro) <= 0) { z.corro = 0; z.corroStacks = 0; }
}
/** How far a push moves this zombie, as a fraction of normal: bosses never budge, late arcade waves resist (knockRes). */
export function knockMul(z: Zombie) {
  return z.boss || isInert(z) ? 0 : Math.max(0, 1 - (Number(z.knockRes) || 0));
}
export function damage(state: GameState, zombie: Zombie, amount: number, angle: number, opts?: DamageOptions) {
  const z = zombie as AiZombie;
  if (!z || z.dead || !Number.isFinite(amount) || amount <= 0) return;
  if (z.boss) amount *= 1 + (state.arcade?.run?.aug?.boss ?? 0);   // Giant Slayer augment
  if (state.road?.world.hive) { amount = hiveBugs.armour(state, z, amount, angle, opts); if (!(amount > 0)) return; }
  z.hp = Math.max(0, z.hp - amount); z.hitFlash = 0.12;
  emit(state, { t: 'zombieHurt', id: z.id, x: z.x, y: z.y, angle });
  // SIM-A's legacy bullet path identifies hits with source:'player' and a crit flag.
  // Accept that precise form during integration, as well as the new explicit bullet source.
  const legacyBullet = opts?.source === 'player' && typeof opts.crit === 'boolean' && !opts.melee && !opts.burn && !opts.explosion;
  const bug = isHiveType(z.type);
  if (opts?.source === 'bullet' || legacyBullet) emit(state, z.type === 'burrow' ? { t: 'bulletHit', x: z.x, y: z.y, angle, surface: 'wall' } : bug ? { t: 'bulletHit', x: z.x, y: z.y, angle, surface: 'flesh', ichor: true } : { t: 'bulletHit', x: z.x, y: z.y, angle, surface: 'flesh' });
  // Combat owns ignition and burn duration; burn:true identifies its damage ticks.
  if (Number.isFinite(angle) && !(opts && opts.burn)) {
    const knock = (z.type === 'brute' ? 2 : 6) * knockMul(z);
    if (knock > 0) { z.x += Math.cos(angle) * knock; z.y += Math.sin(angle) * knock; constrain(state, z); }
  }
  if (z.type !== 'burrow') blood(state, z.x, z.y, 4, angle, bug);
  if (state.player && Math.hypot(z.x - state.player.x, z.y - state.player.y) < 700) sound(state, 'hit');
  if (z.hp > 0) {
    if (!z.horde && !z.inert && state.player && (!opts || opts.source !== 'bloater')) {
      z.target = { x: state.player.x, y: state.player.y }; z.memory = 8; z.state = 'investigate'; z.losTimer = 0;
    }
    return;
  }
  z.dead = true;
  if (state.stats) state.stats.kills = (state.stats.kills || 0) + 1;
  if (state.mode === 'survival') {
    if (progression.addXP) progression.addXP(state, (TYPES[z.type] || TYPES.walker).xp);
    if (loot.zombieDrop) loot.zombieDrop(state, z);
  }
  if (z.type !== 'burrow') blood(state, z.x, z.y, 12, angle, bug);
  if (state.player && Math.hypot(z.x - state.player.x, z.y - state.player.y) < 700) sound(state, 'zombieDie');
  emit(state, { t: 'zombieKilled', id: z.id, x: z.x, y: z.y, type: z.type, variant: z.variant, angle: z.angle, ...(z.boss ? { boss: z.boss as import('./bosses').BossId, radius: Number((z as { drawR?: number }).drawR) || z.r } : {}), ...(isQueenConduit(z) ? { conduit: true, radius: z.r } : {}) });
  if (z.type === 'bloater') explode(state, z);
}
