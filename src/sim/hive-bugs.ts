// hive-bugs.ts — the insects of the cells beyond the Warrens, and what each cell does to you.
// Hopper (leaps), Shrieker (calls the swarm), Stinger (flies, venom), Spitter (ranged cone), Shieldback (front plate,
// charge), Lurker (camouflage, lunge), Dustwing (drawn to your light, dust), Skitterer (shuns the beam, gets back up).
// They are ordinary zombies (zombies.ts TYPES): this module runs after zombies.update and takes a bug over for the
// moment of its special, by holding its speed at zero and moving it itself. Pure sim (rand(state) only).
// Also here: Stinger venom and Dustwing dust on the player, and the two cell hazards (locust lanes, steam vents).
import { angleDiff, emit, phys, rand, sound, toast } from './core';
import type { GameState, Vec, Zombie, ZombieType } from './types';
import * as zombies from './zombies';
import type { DamageOptions } from './zombies';
import * as bosses from './bosses';
import * as hive from './hive';
import * as hiveBosses from './hive-bosses';
import { isFloor, zoneAt } from './hive-world';
import type { Weights } from './road-data';

export const CHORUS_MUL = 1.25, CHORUS_TIME = 6, CHORUS_RANGE = 900;
export const LEAP_MIN = 130, LEAP_MAX = 290, LEAP_TIME = 0.5, LEAP_EVERY = 2.5;
export const VENOM_MAX = 3, VENOM_TIME = 4, VENOM_DPS = 3;
export const SPIT_RANGE = 240, SPIT_HALF = 0.52, SPIT_TELL = 0.6;
export const PLATE = 0.2, PLATE_STRIP = 4, CHARGE_SPEED = 300;
export const LURK_WAKE = 170, LUNGE_SPEED = 320, LURK_EXPOSED = 1.5;
export const DUST_TIME = 6, DUST_BEAM = 0.6, DUST_NEAR = 120;
export const REVIVE_CHANCE = 1 / 3, REVIVE_TIME = 2;
export const LANE_HALF = 70, LANE_LEN = 1500, LANE_TELL = 1.5, VENT_R = 92, VENT_EVERY = 5, VENT_TELL = 1.2;

export type HBug = hive.Bug & {
  /** what it is in the middle of ('' = nothing) and for how long */ do?: string; doT?: number;
  /** seconds until it may use its special again */ wait?: number;
  /** the special's fixed direction, and where a leap began and ends */ aa?: number; ax?: number; ay?: number; bx?: number; by?: number;
  /** its own walking speed (this module holds z.speed at 0 while it is busy) */ base?: number;
  /** renderer: progress through the `special` frames (-1 = none), height off the floor 0..1, opacity */ sp?: number; lift?: number; alpha?: number;
  /** already hit you with this charge or lunge */ struck?: boolean;
  /** the last thing that hurt it was fire, acid or a blast (a Skitterer killed that way stays down) */ cooked?: boolean;
  /** a Skitterer that has already got back up once */ revived?: boolean;
  /** Dustwing: seconds since your light went out */ lost?: number;
  /** weapons (hive-arms.ts): knocked flat, poisoned by a needle, chasing a lure, marked by the Queen's Decree */
  stunT?: number; venomT?: number; venomAcc?: number; lureT?: number; lx?: number; ly?: number; markT?: number;
  /** fixtures: what an egg cluster hatches, how many, after how long; a cocoon never hatches on its own */
  brood?: ZombieType; broodN?: number; hatchTime?: number; noHatch?: boolean; cocoon?: boolean;
};

const FLIERS = new Set<ZombieType>(['stinger', 'dustwing']);
/** Stingers and Dustwings are off the floor: honey does not slow them. */
export const flies = (z: Zombie) => FLIERS.has(z.type);
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const onFloor = (state: GameState, x: number, y: number) => { const h = state.road?.world.hive; return !h || isFloor(h, x, y); };
const open = (state: GameState, x: number, y: number, r: number) => phys.isFree(state, x, y, r) && onFloor(state, x, y);
const sees = (state: GameState, z: Zombie) => phys.lineOfSight(state, z.x, z.y, state.player.x, state.player.y);
const hunting = (z: HBug) => z.state === 'chase' || (z.alarm ?? 0) > 0 || z.horde;
const tele = (state: GameState, t: Omit<bosses.BossTele, 't'>) => bosses.fx(state).tele.push({ ...t, t: 0 });

/** Is (x,y) inside the player's flashlight beam? */
export function inBeam(state: GameState, x: number, y: number, range = 520, half = 0.45) {
  const p = state.player;
  if (!p.flashlight || p.dead) return false;
  const d = Math.hypot(x - p.x, y - p.y);
  return d < range * (p.beamMul ?? 1) && Math.abs(angleDiff(p.angle, Math.atan2(y - p.y, x - p.x))) < half && phys.lineOfSight(state, p.x, p.y, x, y);
}
/** Damage that does not wait for the hit grace: venom, steam, a locust front. */
export function tickHurt(state: GameState, amount: number, from?: Vec) {
  const p = state.player;
  if (p.dead || state.dev?.god || !(amount > 0)) return;
  p.hp -= amount;
  emit(state, { t: 'playerHurt', amount, angle: from ? Math.atan2(p.y - from.y, p.x - from.x) : 0 });
}
/** What a Grub grows into: an adult of the cell it is in. */
export function adult(state: GameState): ZombieType {
  const types = state.road ? hiveTypes(state) : null;
  if (!types) return 'drone';
  const list = (Object.entries(types) as [ZombieType, number][]).filter(([k]) => k !== 'grub' && k !== 'shrieker' && k !== 'lurker');
  let total = 0; for (const [, v] of list) total += v;
  let at = rand(state) * total;
  for (const [k, v] of list) { at -= v; if (at <= 0) return k; }
  return 'drone';
}
let typesOf: ((state: GameState) => Weights) | null = null;
/** sim/road.ts tells this module how to read the current mission's bug mix (it owns the missions). */
export function setTypesOf(fn: (state: GameState) => Weights) { typesOf = fn; }
const hiveTypes = (state: GameState) => typesOf ? typesOf(state) : null;

// ------------------------------------------------------------------ hooks from zombies.ts
/** A bug has bitten the player. */
export function onBite(state: GameState, z: Zombie) {
  const rt = hive.runtime(state); if (!rt) return;
  if (z.type === 'stinger') {
    const v = rt.venom ??= { n: 0, t: 0, acc: 0 };
    v.n = Math.min(VENOM_MAX, v.n + 1); v.t = VENOM_TIME;
  } else if (z.type === 'dustwing') dust(state);
}
function dust(state: GameState) {
  const rt = hive.runtime(state); if (!rt) return;
  if (!((rt.dust ?? 0) > 0)) toast(state, 'Moth dust on your lamp', '#b0a890');
  rt.dust = DUST_TIME;
}
/** Every hit on anything in the hive passes through here: plates, marks, the Lurker's cover, and what killed it. */
export function armour(state: GameState, z: Zombie, amount: number, angle: number, opts?: DamageOptions): number {
  const b = z as HBug;
  b.cooked = !!(opts?.burn || opts?.explosion || opts?.source === 'acid');
  if (z.boss) return hiveBosses.armour(state, z, (b.markT ?? 0) > 0 ? amount * 1.25 : amount, angle, opts);
  if (z.type === 'shieldback' && Number.isFinite(angle) && !b.cooked && Math.cos(angle - z.angle) < -0.25 && (Number(z.corroStacks) || 0) < PLATE_STRIP) {
    // the Mandible Shears go through the plate
    const shears = !!opts?.melee && state.player.inv.equip.melee?.id === 'mandible_shears' && state.player.active === 'melee';
    if (!shears) { amount *= PLATE; emit(state, { t: 'bulletHit', x: z.x, y: z.y, angle, surface: 'metal' }); }
  }
  if (z.type === 'lurker' && b.do === 'hide') { b.do = 'reveal'; b.doT = 0; }
  return amount;
}
/** Something of the hive died (hive.onDeath). */
export function onDeath(state: GameState, z: Zombie) {
  const b = z as HBug, p = state.player, rt = hive.runtime(state);
  if (!rt) return;
  if (z.type === 'dustwing' && dist(z, p) < DUST_NEAR) dust(state);
  if (z.type === 'skitterer' && !b.revived && !b.cooked && rand(state) < REVIVE_CHANCE) (rt.revives ??= []).push({ x: z.x, y: z.y, t: REVIVE_TIME });
}

// ------------------------------------------------------------------ per tick
function busy(z: HBug) { z.speed = 0; }
/** Move a busy bug along its fixed direction; false when rock (or the edge of the cave) stops it. */
function push(state: GameState, z: HBug, step: number) {
  const n = Math.max(1, Math.ceil(step / 8));
  for (let i = 0; i < n; i++) {
    const nx = z.x + Math.cos(z.aa!) * step / n, ny = z.y + Math.sin(z.aa!) * step / n;
    if (!open(state, nx, ny, z.r)) return false;
    z.x = nx; z.y = ny;
  }
  return true;
}
function strike(state: GameState, z: HBug, mul: number, shove = 0) {
  const p = state.player;
  if (z.struck || p.dead || dist(z, p) > z.r + p.r + 6) return false;
  z.struck = true;
  const before = p.hp, ang = Math.atan2(p.y - z.y, p.x - z.x);
  bosses.kit.hurtPlayer(state, z.damage * mul, z, shove);
  if (p.hp < before) { z.attackT = 0; emit(state, { t: 'zombieAttack', id: z.id, x: z.x, y: z.y }); }
  void ang;
  return true;
}

function think(state: GameState, z: HBug, dt: number) {
  const p = state.player, d = dist(z, p);
  z.base ??= z.speed || 0;
  z.speed = z.base; z.sp = -1;
  if (z.do) z.doT = (z.doT ?? 0) + dt;
  if ((z.wait ?? 0) > 0) z.wait! -= dt;
  // ---- what the insect weapons have done to it
  if ((z.stunT ?? 0) > 0) { z.stunT! -= dt; busy(z); return; }
  if ((z.venomT ?? 0) > 0) {
    z.venomT! -= dt; z.venomAcc = (z.venomAcc ?? 0) + dt;
    if (z.venomAcc >= 0.5) { z.venomAcc -= 0.5; zombies.damage(state, z, 3.75, NaN, { burn: true, source: 'venom' }); if (z.dead) return; }
  }
  if ((z.markT ?? 0) > 0) z.markT! -= dt;
  if ((z.lureT ?? 0) > 0) {
    z.lureT! -= dt;
    z.target = { x: z.lx ?? z.x, y: z.ly ?? z.y }; z.state = 'investigate'; z.memory = 1;
    if (z.do && z.do !== 'hide') { z.do = ''; z.lift = FLIERS.has(z.type) ? 0.45 : 0; }
    return;
  }
  switch (z.type) {
    case 'hopper':
      if (z.do === 'leap') {
        busy(z);
        const k = Math.min(1, z.doT! / LEAP_TIME);
        z.x = z.ax! + (z.bx! - z.ax!) * k; z.y = z.ay! + (z.by! - z.ay!) * k;
        z.lift = Math.sin(Math.PI * k); z.sp = k; z.angle = z.aa!;
        if (k >= 1) { z.do = ''; z.lift = 0; z.wait = LEAP_EVERY; }
      } else if (!((z.wait ?? 0) > 0) && hunting(z) && d > LEAP_MIN && d < LEAP_MAX && sees(state, z)) {
        // land beside the player, not on them
        const a = rand(state) * Math.PI * 2, r = p.r + z.r + 10 + rand(state) * 24, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        if (open(state, x, y, z.r)) { z.do = 'leap'; z.doT = 0; z.ax = z.x; z.ay = z.y; z.bx = x; z.by = y; z.aa = Math.atan2(y - z.y, x - z.x); }
        else z.wait = 0.4;
      }
      break;
    case 'shrieker':
      if (z.do === 'wind') {
        busy(z); z.sp = Math.min(1, z.doT! / 1.2);
        if (z.doT! >= 1.2) { z.do = ''; z.wait = 9; scream(state, z); }
      } else if (!((z.wait ?? 0) > 0) && hunting(z) && d < 760) { z.do = 'wind'; z.doT = 0; tele(state, { kind: 'circle', x: z.x, y: z.y, r: 46, angle: 0, len: 0, T: 1.2, color: '#9fd36b' }); }
      else if (d < 400 && hunting(z) && sees(state, z)) busy(z);   // it hangs back and lets the others come
      break;
    case 'stinger': z.lift = 0.45; break;
    case 'spitter':
      if (z.do === 'aim') {
        busy(z); z.angle = z.aa!; z.sp = Math.min(1, z.doT! / SPIT_TELL);
        if (z.doT! >= SPIT_TELL) { spray(state, z); z.do = 'spent'; z.doT = 0; }
      } else if (z.do === 'spent') { busy(z); z.angle = z.aa!; if (z.doT! >= 0.5) { z.do = ''; z.wait = 3.2; } }
      else if (!((z.wait ?? 0) > 0) && hunting(z) && d < SPIT_RANGE - 10 && sees(state, z)) {
        z.do = 'aim'; z.doT = 0; z.aa = Math.atan2(p.y - z.y, p.x - z.x);
        tele(state, { kind: 'line', x: z.x, y: z.y, r: 60, angle: z.aa, len: SPIT_RANGE, T: SPIT_TELL, color: '#ff8a3a' });
      }
      break;
    case 'shieldback':
      if (z.do === 'wind') { busy(z); z.angle = z.aa!; z.sp = Math.min(1, z.doT! / 0.7); if (z.doT! >= 0.7) { z.do = 'charge'; z.doT = 0; z.struck = false; } }
      else if (z.do === 'charge') {
        busy(z); z.angle = z.aa!; z.sp = 1;
        const ok = push(state, z, CHARGE_SPEED * dt);
        strike(state, z, 1.2, 90);
        if (!ok || z.doT! >= 1.3) { z.do = 'spent'; z.doT = 0; if (!ok) state.shake = Math.max(state.shake, 5); }
      } else if (z.do === 'spent') { busy(z); if (z.doT! >= 0.8) { z.do = ''; z.wait = 5; } }
      else if (!((z.wait ?? 0) > 0) && hunting(z) && d > 150 && d < 430 && sees(state, z)) {
        z.do = 'wind'; z.doT = 0; z.aa = Math.atan2(p.y - z.y, p.x - z.x);
        tele(state, { kind: 'line', x: z.x, y: z.y, r: z.r, angle: z.aa, len: 390, T: 0.7, color: '#ffb43a' });
      }
      break;
    case 'lurker':
      if (z.do === 'hide') {
        busy(z); z.alpha = 0.1; z.state = 'idle'; z.target = null;
        if (d < LURK_WAKE || inBeam(state, z.x, z.y) || z.hp < z.maxHp) { z.do = 'reveal'; z.doT = 0; if (d < 600) sound(state, 'reload', z.x, z.y); }
      } else if (z.do === 'reveal') {
        busy(z); z.alpha = Math.min(1, 0.1 + z.doT! / 0.35); z.sp = Math.min(1, z.doT! / 0.35);
        z.aa = Math.atan2(p.y - z.y, p.x - z.x); z.angle = z.aa;
        if (z.doT! >= 0.35) { z.do = 'lunge'; z.doT = 0; z.struck = false; }
      } else if (z.do === 'lunge') {
        busy(z); z.alpha = 1; z.angle = z.aa!; z.sp = 1;
        const ok = push(state, z, LUNGE_SPEED * dt);
        if (strike(state, z, 1) || !ok || z.doT! >= 0.9) { z.do = 'spent'; z.doT = 0; }
      } else if (z.do === 'spent') { busy(z); z.alpha = 1; if (z.doT! >= LURK_EXPOSED) { z.do = ''; z.wait = 3; } }   // a miss leaves it open
      else {
        z.alpha = 1;
        if (!((z.wait ?? 0) > 0) && hunting(z) && d < 260 && sees(state, z)) { z.do = 'reveal'; z.doT = 0.1; }
      }
      break;
    case 'dustwing':
      z.lift = 0.4;
      if (p.flashlight && !p.dead) {
        z.lost = 0;
        if (d < 900) { z.state = 'chase'; z.target = { x: p.x, y: p.y }; z.memory = Math.max(z.memory ?? 0, 2); }
      } else if (!z.horde) {
        z.lost = (z.lost ?? 0) + dt;
        if (z.lost > 2) { z.losTimer = 1; z.seesPlayer = false; z.alarm = 0; if (z.state === 'chase' || z.state === 'investigate') { z.state = 'wander'; z.target = null; z.memory = 0; } }
      }
      break;
    case 'skitterer':
      if (d > 90 && d < 460 && inBeam(state, z.x, z.y, 460)) {
        // out of the light: sideways, round to the dark side of you
        const a = Math.atan2(p.y - z.y, p.x - z.x) + (Number(z.side) || 1) * Math.PI / 2, nx = z.x + Math.cos(a) * 80 * dt, ny = z.y + Math.sin(a) * 80 * dt;
        if (open(state, nx, ny, z.r)) { z.x = nx; z.y = ny; } else z.side = -(Number(z.side) || 1);
      }
      break;
  }
}
function scream(state: GameState, z: HBug) {
  const p = state.player;
  for (const o of state.zombies as HBug[]) {
    if (o.dead || o.boss || o.inert || dist(o, z) > CHORUS_RANGE) continue;
    o.chorus = CHORUS_TIME; o.alarm = hive.ALARM_TIME;
    if (o.do === 'hide') continue;
    o.state = 'chase'; o.target = { x: p.x, y: p.y }; o.memory = Math.max(o.memory ?? 0, CHORUS_TIME);
  }
  emit(state, { t: 'hive', kind: 'rally', x: z.x, y: z.y });
  bosses.kit.ring(state, z.x, z.y, 300, 620, 0.01, 0, '#9fd36b', 18);   // harmless: you see where it came from
  sound(state, 'horde', z.x, z.y);
  const rt = hive.runtime(state); if (rt && dist(z, p) < CHORUS_RANGE) (rt as { flicker?: number }).flicker = 0.9;
}
function spray(state: GameState, z: HBug) {
  const p = state.player, d = dist(z, p), a = z.aa!;
  if (d < SPIT_RANGE + p.r && Math.abs(angleDiff(a, Math.atan2(p.y - z.y, p.x - z.x))) < SPIT_HALF && sees(state, z)) bosses.kit.hurtPlayer(state, z.damage, z, 30);
  const x = z.x + Math.cos(a) * 150, y = z.y + Math.sin(a) * 150;
  if (onFloor(state, x, y)) bosses.fx(state).pools.push({ kind: 'acid', x, y, r: 46, life: 2, max: 2, dmg: 5, tick: 0.25 });
  emit(state, { t: 'hive', kind: 'erupt', x: z.x + Math.cos(a) * 60, y: z.y + Math.sin(a) * 60 });
  sound(state, 'zombieAttack', z.x, z.y);
}

/** Once per road tick, from hive.update (after zombies.update and the swarm's senses). */
export function update(state: GameState, dt: number) {
  const rt = hive.runtime(state), p = state.player; if (!rt) return;
  for (const z of state.zombies as HBug[]) if (!z.dead && !z.boss && !z.inert && zombies.isHiveType(z.type)) think(state, z, dt);
  // ---- venom and dust on you
  const v = rt.venom;
  if (v && v.n > 0) {
    v.t -= dt; v.acc += dt;
    if (v.acc >= 0.5) { v.acc -= 0.5; tickHurt(state, VENOM_DPS * v.n * 0.5); }
    if (v.t <= 0) { v.n = 0; v.acc = 0; }
  }
  if ((rt.dust ?? 0) > 0) rt.dust! -= dt;
  p.beamMul = (rt.dust ?? 0) > 0 ? DUST_BEAM : 1;
  // ---- Skitterers getting back up
  if (rt.revives?.length) {
    for (const r of rt.revives) {
      r.t -= dt;
      if (r.t > 0 || hive.liveBugs(state) >= hive.SWARM_CAP) continue;
      const z = hive.spawnBug(state, 'skitterer', r.x, r.y) as HBug;
      z.revived = true; z.hp = z.maxHp = Math.ceil(z.maxHp / 2);
      emit(state, { t: 'blood', x: r.x, y: r.y, amount: 5, angle: 0, ichor: true });
    }
    rt.revives = rt.revives.filter(r => r.t > 0);
  }
}

// ------------------------------------------------------------------ what the cell itself does
export type Hazard = 'lanes' | 'vents';
/** The Granary's locust clouds sweep marked lanes; the Boiling Galleries' vents fire on a clock. Called by sim/road.ts. */
export function hazards(state: GameState, dt: number, kind: Hazard, vents: Vec[], dmgMul: number) {
  const rt = hive.runtime(state), p = state.player, h = state.road?.world.hive; if (!rt || !h || p.dead) return;
  const f = bosses.fx(state);
  if (kind === 'lanes') {
    rt.laneT = (rt.laneT ?? 6) - dt;
    if (rt.laneT <= 0 && zoneAt(h, p.x, p.y) === 2) {
      rt.laneT = 8 + rand(state) * 4;
      // through a point near you, at any angle: step out of the strip
      const a = rand(state) * Math.PI, off = (rand(state) - 0.5) * 220, x = p.x + Math.cos(a + Math.PI / 2) * off, y = p.y + Math.sin(a + Math.PI / 2) * off;
      (rt.lanes ??= []).push({ x: x - Math.cos(a) * LANE_LEN / 2, y: y - Math.sin(a) * LANE_LEN / 2, angle: a, len: LANE_LEN, t: LANE_TELL });
      f.tele.push({ kind: 'line', x: x - Math.cos(a) * LANE_LEN / 2, y: y - Math.sin(a) * LANE_LEN / 2, r: LANE_HALF, angle: a, len: LANE_LEN, t: 0, T: LANE_TELL, color: '#9fb54a' });
      if (dist({ x, y }, p) < 500) sound(state, 'groan', x, y);
    }
    for (const l of rt.lanes ?? []) {
      l.t -= dt; if (l.t > 0) continue;
      // the front passes: anything of yours standing in the strip is stripped
      const dx = Math.cos(l.angle), dy = Math.sin(l.angle), along = (p.x - l.x) * dx + (p.y - l.y) * dy, across = Math.abs((p.x - l.x) * dy - (p.y - l.y) * dx);
      if (along > 0 && along < l.len && across < LANE_HALF + p.r) { tickHurt(state, 16 * dmgMul, { x: p.x - dx, y: p.y - dy }); state.shake = Math.max(state.shake, 7); }
      for (let k = 0; k < 7; k++) { const t = (k + 0.5) / 7 * l.len; emit(state, { t: 'hive', kind: 'erupt', x: l.x + dx * t, y: l.y + dy * t }); }
      sound(state, 'horde', p.x, p.y);
    }
    if (rt.lanes?.length) rt.lanes = rt.lanes.filter(l => l.t > 0);
  } else if (kind === 'vents') {
    rt.vents ??= vents.map((v, i) => ({ x: v.x, y: v.y, t: (i * 1.37) % VENT_EVERY, warned: false }));
    for (const v of rt.vents) {
      v.t += dt;
      if (Math.abs(v.x - p.x) > 1000 || Math.abs(v.y - p.y) > 1000) { if (v.t >= VENT_EVERY) { v.t -= VENT_EVERY; v.warned = false; } continue; }
      if (!v.warned && v.t >= VENT_EVERY - VENT_TELL) { v.warned = true; f.tele.push({ kind: 'circle', x: v.x, y: v.y, r: VENT_R, angle: 0, len: 0, t: 0, T: VENT_TELL, color: '#ff8a3a' }); }
      if (v.t < VENT_EVERY) continue;
      v.t -= VENT_EVERY; v.warned = false;
      emit(state, { t: 'hive', kind: 'erupt', x: v.x, y: v.y });
      if (dist(v, p) < 700) sound(state, 'explosion', v.x, v.y);
      if (dist(v, p) < VENT_R + p.r) { tickHurt(state, 18 * dmgMul, v); state.shake = Math.max(state.shake, 6); }
      // it scalds the hive's own as badly
      for (const z of state.zombies) if (!z.dead && !z.boss && !z.inert && dist(z, v) < VENT_R + z.r) zombies.damage(state, z, 45, NaN, { burn: true, source: 'steam' });
    }
  }
}
