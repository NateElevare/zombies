// upgrades.ts — arcade-only XP, level-up cards, auto-firing gadgets, passives and evolutions.
// Pure sim: all randomness via rand(state); damage always goes through zombies.damage so kills, score and blood work.
// Runtime state lives on state.arcade.run (arcade is never saved). Called from arcade.ts; never touches survival.
import { emit, phys, rand, sound, toast } from './core';
import * as zombies from './zombies';
import * as progression from './progression';
import { bankProgress } from './augments';
import type {
  ArcadeRun, Bullet, FirePool, GadgetId, GadgetState, GameState, Lob, PassiveId, UpgradeCard, Vec, Zombie, ZombieType,
} from './types';

const TAU = Math.PI * 2;
export const MAX_LEVEL = 5;
export const MAX_GADGETS = 4;
export const MAX_PASSIVES = 4;

// ------------------------------------------------------------------ definitions
export interface GadgetDef { name: string; evoName: string; pair: PassiveId; color: string; levels: string[]; evo: string }
export const GADGETS: Record<GadgetId, GadgetDef> = {
  saw: {
    name: 'Saw Blades', evoName: 'Buzzsaw Halo', pair: 'adren', color: '#d9dee8',
    levels: ['2 blades orbit you, shoving zombies back', '+30% blade damage', '+1 blade', 'Wider orbit, bigger blades', '+1 blade, +25% damage, faster spin'],
    evo: '6 red-hot blades on a huge, fast ring. Shreds anything that touches it.',
  },
  molotov: {
    name: 'Molotov', evoName: 'Inferno', pair: 'fuel', color: '#ff8a2a',
    levels: ['Lobs a fire bottle at a nearby zombie', '+20% fire damage, throws faster', '+1 bottle', 'Bigger, longer-burning pools', '+1 bottle, hotter fire'],
    evo: '4 bottles that blaze a fire trail; pools spread wider and burn hotter.',
  },
  drone: {
    name: 'Drone', evoName: 'Drone Swarm', pair: 'mag', color: '#7ff3ff',
    levels: ['A drone circles you and shoots the nearest zombie', '25% faster fire', '+20% damage', 'Fires 2-round bursts', 'Piercing rounds, faster fire'],
    evo: '3 drones, rapid piercing bursts.',
  },
  coil: {
    name: 'Shock Coil', evoName: 'Thunderstorm', pair: 'hollow', color: '#9fc0ff',
    levels: ['Chain lightning jumps between 3 zombies', '+1 chain jump', '+20% damage', '+1 jump, discharges faster', '+1 jump, +20% damage'],
    evo: 'Lightning strikes from the sky all around you, then chains onward.',
  },
  frag: {
    name: 'Frag', evoName: 'Cluster Bomb', pair: 'powder', color: '#c9d46a',
    levels: ['Throws a grenade at the biggest crowd', '+25% damage', '+1 grenade', 'Bigger blast', '+1 grenade, throws faster'],
    evo: 'Each blast scatters 6 bomblets that explode again.',
  },
};
export interface PassiveDef { name: string; color: string; desc: string }
export const PASSIVES: Record<PassiveId, PassiveDef> = {
  hollow: { name: 'Hollow Points', color: '#ff6a5a', desc: '+12% damage for your gun and every gadget' },
  mag: { name: 'Extra Mag', color: '#ffd24a', desc: '+1 blade / bottle / shot / chain at levels 1, 3, 5 · gun reloads 8% faster' },
  powder: { name: 'Gunpowder', color: '#ff9f43', desc: '+10% area: blast radius, pools, orbit, chain reach' },
  adren: { name: 'Adrenaline', color: '#6dff9a', desc: '-8% gadget cooldowns, faster blades · gun fires 8% faster' },
  kevlar: { name: 'Kevlar', color: '#7fb0e8', desc: '+20 max HP and heals 30 when picked' },
  magnet: { name: 'Magnet', color: '#c58cff', desc: '+35% XP pickup radius' },
  fuel: { name: 'Fuel', color: '#ff5a1e', desc: '+15% fire pool and burn duration' },
};
export const GADGET_IDS = Object.keys(GADGETS) as GadgetId[];
export const PASSIVE_IDS = Object.keys(PASSIVES) as PassiveId[];
/** XP per kill, by zombie type. */
export const SHARD_XP: Record<ZombieType, number> = { walker: 1, runner: 2, crawler: 2, bloater: 4, brute: 6, drone: 1, honeypot: 3, grub: 1, burrow: 4, egg: 1,
  hopper: 1, shrieker: 3, stinger: 2, spitter: 3, shieldback: 6, lurker: 5, dustwing: 2, skitterer: 2 };

// Per-level tables (index = level - 1). Evolved values are separate.
const T = {
  saw: { count: [2, 2, 3, 3, 4], dmg: [10, 13, 13, 15, 19], radius: [68, 68, 72, 86, 90], blade: [12, 12, 12, 15, 15], spin: [3.6, 3.6, 3.6, 3.6, 4.2] },
  molotov: { cd: [4, 3.4, 3.4, 3.4, 3.1], count: [1, 1, 2, 2, 3], r: [46, 46, 48, 60, 62], life: [3, 3, 3, 4, 4], dps: [10, 12, 12, 13, 16] },
  drone: { cd: [0.75, 0.6, 0.6, 0.6, 0.5], dmg: [12, 12, 14.5, 14.5, 15.5], volley: [1, 1, 1, 2, 2], pierce: [0, 0, 0, 0, 1] },
  coil: { cd: [2.4, 2.4, 2.4, 2.0, 2.0], jumps: [3, 4, 4, 5, 6], dmg: [26, 26, 31, 31, 37] },
  frag: { cd: [4.5, 4.5, 4.5, 4.5, 3.8], count: [1, 1, 2, 2, 3], dmg: [45, 56, 56, 60, 64], r: [80, 80, 82, 100, 102] },
};
const lv = (arr: number[], level: number) => arr[Math.max(0, Math.min(arr.length - 1, level - 1))];

/** XP needed to go from level L to L+1. */
/** XP to go from `level` to the next (8, 14, 21, 29, 39 ... ~98 at level 10, ~180 at level 15). */
export function xpNeed(level: number) { return Math.round(8 + 6 * (level - 1) + 0.45 * (level - 1) ** 2); }

export function newRun(): ArcadeRun {
  return { xp: 0, level: 1, pending: 0, offer: null, gadgets: [], passives: [], shards: [], lobs: [], pools: [], drones: [], nextId: 1, gold: 0 };
}
function runOf(state: GameState): ArcadeRun | null {
  if (state.mode !== 'arcade' || !state.arcade) return null;
  return state.arcade.run ??= newRun();
}

// ------------------------------------------------------------------ modifiers
export function passiveLevel(run: ArcadeRun, id: PassiveId) { return run.passives.find((p) => p.id === id)?.level ?? 0; }
export function gadget(run: ArcadeRun, id: GadgetId) { return run.gadgets.find((g) => g.id === id); }
export function mods(run: ArcadeRun) {
  const a = run.aug;
  return {
    dmg: (1 + 0.12 * passiveLevel(run, 'hollow')) * (1 + (a?.dmg ?? 0)),
    extra: Math.ceil(passiveLevel(run, 'mag') / 2),
    area: (1 + 0.1 * passiveLevel(run, 'powder')) * (1 + (a?.gadgetArea ?? 0)),
    cd: (1 - 0.08 * passiveLevel(run, 'adren')) * (1 - (a?.gadgetCd ?? 0)),
    fireRate: (1 + 0.08 * passiveLevel(run, 'adren')) * (1 + (a?.rate ?? 0)),
    reload: (1 - 0.08 * passiveLevel(run, 'mag')) * (1 - (a?.reload ?? 0)),
    maxHp: 20 * passiveLevel(run, 'kevlar') + (a?.hp ?? 0),
    magnet: 90 * (1 + 0.35 * passiveLevel(run, 'magnet')) * (1 + (a?.magnet ?? 0)),
    dur: (1 + 0.15 * passiveLevel(run, 'fuel')) * (1 + (a?.duration ?? 0)),
  };
}
type Mods = ReturnType<typeof mods>;

/** Saw blade ring geometry (renderer uses this too). */
export function sawLayout(run: ArcadeRun, g: GadgetState) {
  const m = mods(run), L = g.level;
  return {
    count: (g.evolved ? 6 : lv(T.saw.count, L)) + m.extra,
    radius: (g.evolved ? 116 : lv(T.saw.radius, L)) * m.area,
    blade: (g.evolved ? 19 : lv(T.saw.blade, L)) * Math.sqrt(m.area),
    spin: (g.evolved ? 6.2 : lv(T.saw.spin, L)) / m.cd,
    dmg: g.evolved ? 30 : lv(T.saw.dmg, L),
    hitCd: g.evolved ? 0.22 : 0.4,
  };
}

// ------------------------------------------------------------------ helpers
function hurt(state: GameState, m: Mods, z: Zombie, amount: number, angle: number, opts: { burn?: boolean; explosion?: boolean } = {}) {
  zombies.damage(state, z, amount * m.dmg, angle, { source: 'player', ...opts });
}
function nearest(state: GameState, x: number, y: number, maxD: number, skip?: Set<string>): Zombie | null {
  let best: Zombie | null = null, bd = maxD;
  for (const z of state.zombies) {
    if (z.dead || (skip && skip.has(z.id))) continue;
    const d = Math.hypot(z.x - x, z.y - y) - z.r;
    if (d < bd) { bd = d; best = z; }
  }
  return best;
}
function inRange(state: GameState, x: number, y: number, maxD: number) {
  return state.zombies.filter((z) => !z.dead && Math.hypot(z.x - x, z.y - y) < maxD);
}
function blast(state: GameState, m: Mods, x: number, y: number, radius: number, damage: number, shake: number) {
  emit(state, { t: 'explosion', x, y, radius });
  state.shake = Math.max(state.shake || 0, shake);
  for (const z of state.zombies) {
    if (z.dead) continue;
    const d = Math.hypot(z.x - x, z.y - y);
    if (d < radius + z.r) hurt(state, m, z, damage * (1 - 0.5 * d / (radius + z.r)), Math.atan2(z.y - y, z.x - x), { explosion: true });
  }
}
function lob(state: GameState, run: ArcadeRun, kind: Lob['kind'], sx: number, sy: number, tx: number, ty: number, dur: number, h: number, evolved: boolean) {
  run.lobs.push({ id: run.nextId++, kind, x: sx, y: sy, prevX: sx, prevY: sy, sx, sy, tx, ty, t: 0, dur, h, evolved, trailD: 0 });
}
function addPool(run: ArcadeRun, x: number, y: number, r: number, maxR: number, life: number, dps: number, evolved: boolean) {
  if (run.pools.length >= 60) run.pools.shift();
  run.pools.push({ id: run.nextId++, x, y, r, maxR, life, maxLife: life, tick: 0, dps, evolved });
}

// ------------------------------------------------------------------ gadgets
function updateSaw(state: GameState, run: ArcadeRun, g: GadgetState, m: Mods, dt: number) {
  const p = state.player, s = sawLayout(run, g);
  g.angle += s.spin * dt;
  if (g.angle > TAU * 64) { g.angle -= TAU * 64; g.prevAngle -= TAU * 64; }
  let hits = 0;
  for (let i = 0; i < s.count; i++) {
    const a = g.angle + i * TAU / s.count, bx = p.x + Math.cos(a) * s.radius, by = p.y + Math.sin(a) * s.radius;
    for (const z of state.zombies) {
      if (z.dead || Math.hypot(z.x - bx, z.y - by) > s.blade + z.r) continue;
      if (Number(z._sawT ?? -1) > state.time) continue;
      z._sawT = state.time + s.hitCd;
      const ang = Math.atan2(z.y - p.y, z.x - p.x);
      hurt(state, m, z, s.dmg, ang);
      hits++;
      if (!z.dead) {
        const push = (z.type === 'brute' ? 6 : 16) * (g.evolved ? 0.7 : 1) * zombies.knockMul(z);
        const nx = z.x + Math.cos(ang) * push, ny = z.y + Math.sin(ang) * push;
        if (phys.isFree(state, nx, ny, z.r)) { z.x = nx; z.y = ny; }
      }
    }
  }
  if (hits) sound(state, 'swing', p.x, p.y, 0.35);
}

function updateMolotov(state: GameState, run: ArcadeRun, g: GadgetState, m: Mods, dt: number) {
  g.cd -= dt;
  if (g.cd > 0) return;
  const p = state.player, cands = inRange(state, p.x, p.y, 430);
  if (!cands.length) { g.cd = 0.3; return; }
  g.cd = (g.evolved ? 2.2 : lv(T.molotov.cd, g.level)) * m.cd;
  const n = (g.evolved ? 4 : lv(T.molotov.count, g.level)) + m.extra;
  for (let i = 0; i < n; i++) {
    const z = cands.length ? cands.splice(Math.floor(rand(state) * cands.length), 1)[0] : null;
    let tx: number, ty: number;
    if (z) { tx = z.x + z.vx * 0.3; ty = z.y + z.vy * 0.3; }
    else { const a = rand(state) * TAU, d = 120 + rand(state) * 200; tx = p.x + Math.cos(a) * d; ty = p.y + Math.sin(a) * d; }
    const d = Math.hypot(tx - p.x, ty - p.y);
    lob(state, run, 'molotov', p.x, p.y, tx, ty, 0.45 + d / 900, 40 + d * 0.15, g.evolved);
  }
  sound(state, 'swing', p.x, p.y, 0.6);
}

function updateDrones(state: GameState, run: ArcadeRun, g: GadgetState, m: Mods, dt: number) {
  const p = state.player, n = g.evolved ? 3 : 1;
  while (run.drones.length < n) run.drones.push({ x: p.x, y: p.y, prevX: p.x, prevY: p.y, aim: 0, cd: 0.3 + run.drones.length * 0.1, phase: 0 });
  run.drones.length = n;
  const interval = (g.evolved ? 0.26 : lv(T.drone.cd, g.level)) * m.cd;
  const dmg = g.evolved ? 22 : lv(T.drone.dmg, g.level);
  const volley = (g.evolved ? 2 : lv(T.drone.volley, g.level)) + m.extra;
  const pierce = g.evolved ? 2 : lv(T.drone.pierce, g.level);
  g.angle += 1.6 * dt;
  run.drones.forEach((d, i) => {
    const a = g.angle + i * TAU / n, R = 62 + Math.sin(g.angle * 2.3 + i) * 6;
    const tx = p.x + Math.cos(a) * R, ty = p.y + Math.sin(a) * R, k = Math.min(1, 10 * dt);
    d.prevX = d.x; d.prevY = d.y;
    d.x += (tx - d.x) * k; d.y += (ty - d.y) * k;
    d.phase += dt;
    d.cd -= dt;
    const z = nearest(state, d.x, d.y, 440);
    if (!z) return;
    const want = Math.atan2(z.y - d.y, z.x - d.x);
    d.aim = want;
    if (d.cd > 0) return;
    if (phys.raycast(state, d.x, d.y, z.x, z.y, 0, (o) => o.blocksBullets !== false)) { d.cd = 0.1; return; }
    d.cd = interval;
    for (let k2 = 0; k2 < volley; k2++) {
      const ang = want + (k2 - (volley - 1) / 2) * 0.07, sp = 1100;
      const b: Bullet = {
        x: d.x, y: d.y, prevX: d.x, prevY: d.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, angle: ang,
        damage: dmg * m.dmg, life: 480 / sp, r: 3, pierce, ricochet: 0, explosive: 0, incendiary: false,
        hit: pierce > 0 ? new Set() : null, dead: false, color: g.evolved ? '#ff7cf2' : '#7ff3ff', weapon: 'drone',
      };
      state.bullets.push(b);
    }
    sound(state, 'smg', d.x, d.y, 0.25);
  });
}

function chain(state: GameState, m: Mods, from: Vec, first: Zombie, jumps: number, dmg: number, reach: number, hit: Set<string>): Vec[] {
  const pts: Vec[] = [{ x: from.x, y: from.y }];
  let cur: Zombie | null = first;
  for (let j = 0; j < jumps && cur; j++) {
    hit.add(cur.id);
    pts.push({ x: cur.x, y: cur.y });
    hurt(state, m, cur, dmg * (1 - 0.05 * j), Math.atan2(cur.y - pts[pts.length - 2].y, cur.x - pts[pts.length - 2].x));
    cur = nearest(state, cur.x, cur.y, reach, hit);
  }
  return pts;
}
function updateCoil(state: GameState, run: ArcadeRun, g: GadgetState, m: Mods, dt: number) {
  const p = state.player;
  g.cd -= dt;
  if (g.cd <= 0) {
    const first = nearest(state, p.x, p.y, 320 * m.area);
    if (!first) g.cd = 0.25;
    else {
      g.cd = (g.evolved ? 1.3 : lv(T.coil.cd, g.level)) * m.cd;
      const jumps = (g.evolved ? 8 : lv(T.coil.jumps, g.level)) + m.extra;
      const pts = chain(state, m, p, first, jumps, g.evolved ? 52 : lv(T.coil.dmg, g.level), 170 * m.area, new Set());
      emit(state, { t: 'zap', points: pts, evolved: g.evolved });
      sound(state, 'click', p.x, p.y, 0.9);
    }
  }
  if (!g.evolved) return;
  // Thunderstorm: bolts from the sky on random zombies around the player, each splashing and chaining onward.
  g.cd2 -= dt;
  if (g.cd2 > 0) return;
  const cands = inRange(state, p.x, p.y, 520);
  if (!cands.length) { g.cd2 = 0.2; return; }
  g.cd2 = 0.7 * m.cd;
  const z = cands[Math.floor(rand(state) * cands.length)], x = z.x, y = z.y, r = 72 * m.area;
  emit(state, { t: 'zap', points: [{ x: x + 30, y: y - 520 }, { x, y }], strike: true, evolved: true });
  state.shake = Math.max(state.shake || 0, 3);
  sound(state, 'rifle', x, y, 0.7);
  const hit = new Set<string>();
  for (const o of state.zombies) {
    if (o.dead || Math.hypot(o.x - x, o.y - y) > r + o.r) continue;
    hit.add(o.id); hurt(state, m, o, 60, Math.atan2(o.y - y, o.x - x));
  }
  const next = nearest(state, x, y, 170 * m.area, hit);
  if (next) emit(state, { t: 'zap', points: chain(state, m, { x, y }, next, 3 + m.extra, 40, 170 * m.area, hit), evolved: true });
}

function updateFrag(state: GameState, run: ArcadeRun, g: GadgetState, m: Mods, dt: number) {
  g.cd -= dt;
  if (g.cd > 0) return;
  const p = state.player, cands = inRange(state, p.x, p.y, 470);
  if (!cands.length) { g.cd = 0.3; return; }
  g.cd = (g.evolved ? 2.6 : lv(T.frag.cd, g.level)) * m.cd;
  const n = (g.evolved ? 3 : lv(T.frag.count, g.level)) + m.extra;
  const taken: Vec[] = [];
  for (let i = 0; i < n; i++) {
    let best: Zombie | null = null, bs = -1;
    for (const z of cands) {
      if (taken.some((t) => Math.hypot(t.x - z.x, t.y - z.y) < 110)) continue;
      let s = 0;
      for (const o of cands) if (Math.hypot(o.x - z.x, o.y - z.y) < 95) s++;
      s += rand(state) * 0.5;   // break ties without favouring array order
      if (s > bs) { bs = s; best = z; }
    }
    if (!best) best = cands[Math.floor(rand(state) * cands.length)];
    taken.push(best);
    const tx = best.x + best.vx * 0.35, ty = best.y + best.vy * 0.35;
    lob(state, run, 'frag', p.x, p.y, tx, ty, 0.6 + Math.hypot(tx - p.x, ty - p.y) / 1400, 70, g.evolved);
  }
  sound(state, 'swing', p.x, p.y, 0.6);
}

// ------------------------------------------------------------------ projectiles and pools
function updateLobs(state: GameState, run: ArcadeRun, m: Mods, dt: number) {
  const fuelLife = m.dur;
  const molo = gadget(run, 'molotov'), frag = gadget(run, 'frag');
  const keep: Lob[] = [], list = run.lobs;
  run.lobs = [];   // bomblets spawned below land here and start flying next tick
  for (const l of list) {
    l.prevX = l.x; l.prevY = l.y;
    l.t += dt;
    const k = Math.min(1, l.t / l.dur);
    l.x = l.sx + (l.tx - l.sx) * k; l.y = l.sy + (l.ty - l.sy) * k;
    if (l.kind === 'molotov' && l.evolved) {
      // Inferno bottles drip a trail of small fires along the arc.
      l.trailD = (l.trailD ?? 0) + Math.hypot(l.x - l.prevX, l.y - l.prevY);
      if (l.trailD > 58 && k > 0.15) { l.trailD = 0; addPool(run, l.x, l.y, 24 * m.area, 30 * m.area, 2.4 * fuelLife, 14, true); }
    }
    if (k < 1) { keep.push(l); continue; }
    if (l.kind === 'molotov') {
      const L = molo?.level ?? 1, evo = l.evolved;
      const r = (evo ? 82 : lv(T.molotov.r, L)) * m.area;
      addPool(run, l.x, l.y, r * 0.55, evo ? r * 1.4 : r, (evo ? 6 : lv(T.molotov.life, L)) * fuelLife, evo ? 30 : lv(T.molotov.dps, L), evo);
      emit(state, { t: 'bulletHit', x: l.x, y: l.y, angle: 0, surface: 'wall' });
      sound(state, 'hit', l.x, l.y, 0.8);
    } else if (l.kind === 'frag') {
      const L = frag?.level ?? 1, evo = l.evolved;
      blast(state, m, l.x, l.y, (evo ? 125 : lv(T.frag.r, L)) * m.area, evo ? 105 : lv(T.frag.dmg, L), 6);
      if (evo) {
        for (let i = 0; i < 6; i++) {
          const a = i * TAU / 6 + rand(state) * 0.6, d = (70 + rand(state) * 70) * m.area;
          lob(state, run, 'bomblet', l.x, l.y, l.x + Math.cos(a) * d, l.y + Math.sin(a) * d, 0.32 + rand(state) * 0.18, 34, true);
        }
      }
    } else blast(state, m, l.x, l.y, 56 * m.area, 42, 2.5);
  }
  run.lobs = keep.concat(run.lobs);
}
function updatePools(state: GameState, run: ArcadeRun, m: Mods, dt: number) {
  const keep: FirePool[] = [];
  for (const f of run.pools) {
    f.life -= dt;
    if (f.life <= 0) continue;
    keep.push(f);
    f.r = Math.min(f.maxR, f.r + (f.maxR - f.r) * Math.min(1, (f.evolved ? 2.2 : 6) * dt));
    f.tick -= dt;
    if (f.tick > 0) continue;
    f.tick = 0.25;
    for (const z of state.zombies) {
      if (z.dead || Math.hypot(z.x - f.x, z.y - f.y) > f.r + z.r * 0.5) continue;
      hurt(state, m, z, f.dps * 0.25, 0, { burn: true });
      if (!z.dead) z.burn = Math.max(z.burn || 0, 1.5 * m.dur);
    }
  }
  run.pools = keep;
}

// ------------------------------------------------------------------ XP shards and levelling
export function dropXp(state: GameState, z: Zombie) {
  const run = runOf(state); if (!run) return;
  const value = SHARD_XP[z.type] ?? 1;
  if (run.shards.length >= 300) { run.shards[0].value += value; return; }
  const a = rand(state) * TAU, sp = 60 + rand(state) * 80;
  run.shards.push({ id: run.nextId++, x: z.x, y: z.y, prevX: z.x, prevY: z.y, value, pull: false, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
}

function collect(state: GameState, run: ArcadeRun, m: Mods, dt: number) {
  const p = state.player, a = state.arcade!, vacuum = a.intermission > 0;
  let got = 0;
  const keep = [];
  for (const s of run.shards) {
    s.prevX = s.x; s.prevY = s.y;
    const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy);
    if (!s.pull && (d < m.magnet || vacuum)) s.pull = true;
    if (s.pull) {
      const sp = Math.min(1100, Math.hypot(s.vx, s.vy) + 1600 * dt);
      const ux = dx / (d || 1), uy = dy / (d || 1);
      // steer: blend current heading toward the player, so shards swoop in instead of snapping
      const k = d < 140 ? 1 : Math.min(1, 9 * dt);
      const hx = s.vx / (Math.hypot(s.vx, s.vy) || 1), hy = s.vy / (Math.hypot(s.vx, s.vy) || 1);
      let nx = hx + (ux - hx) * k, ny = hy + (uy - hy) * k; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      s.vx = nx * sp; s.vy = ny * sp;
    } else { s.vx *= Math.exp(-6 * dt); s.vy *= Math.exp(-6 * dt); }
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (Math.hypot(p.x - s.x, p.y - s.y) < p.r + 8 || (s.pull && d < Math.hypot(s.vx, s.vy) * dt + p.r)) { got += s.value; continue; }
    keep.push(s);
  }
  run.shards = keep;
  if (!got) return;
  run.xp += got * (1 + (run.aug?.xp ?? 0));
  sound(state, 'pickup', p.x, p.y, 0.3);
  while (run.xp >= xpNeed(run.level)) { run.xp -= xpNeed(run.level); run.level++; run.pending++; p.hp=Math.min(p.maxHp,p.hp+(run.aug?.levelHeal||0)); }
  if (run.pending > 0 && !run.offer) openPicker(state, run);
}
function openPicker(state: GameState, run: ArcadeRun) {
  run.offer = makeOffer(state);
  state.ui = 'levelup';
  emit(state, { t: 'arcadeLevelUp', level: run.level });
  sound(state, 'levelUp');
}

// ------------------------------------------------------------------ cards
/** Gadgets that would evolve if offered: level 5, not evolved, paired passive owned. */
export function evolvable(run: ArcadeRun): GadgetId[] {
  return run.gadgets.filter((g) => g.level >= MAX_LEVEL && !g.evolved && passiveLevel(run, GADGETS[g.id].pair) > 0).map((g) => g.id);
}
/** Every card that may currently be offered (evolutions first). */
export function candidates(run: ArcadeRun): UpgradeCard[] {
  const out: UpgradeCard[] = evolvable(run).map((id) => ({ kind: 'evolve', id, level: MAX_LEVEL }));
  for (const g of run.gadgets) if (g.level < MAX_LEVEL) out.push({ kind: 'gadget', id: g.id, level: g.level + 1 });
  if (run.gadgets.length < MAX_GADGETS + (run.aug?.gadgetSlots || 0)) for (const id of GADGET_IDS) if (!gadget(run, id)) out.push({ kind: 'gadget', id, level: 1 });
  if (!run.gadgets.length) return out;   // first pick is always a gadget
  for (const p of run.passives) if (p.level < MAX_LEVEL) out.push({ kind: 'passive', id: p.id, level: p.level + 1 });
  if (run.passives.length < MAX_PASSIVES + (run.aug?.passiveSlots || 0)) for (const id of PASSIVE_IDS) if (!passiveLevel(run, id)) out.push({ kind: 'passive', id, level: 1 });
  return out;
}
export function makeOffer(state: GameState): UpgradeCard[] {
  const run = runOf(state)!;
  const all = candidates(run);
  const offer: UpgradeCard[] = [];
  const evo = all.filter((c) => c.kind === 'evolve');
  if (evo.length) offer.push(evo.splice(Math.floor(rand(state) * evo.length), 1)[0]);
  const rest = all.filter((c) => c.kind !== 'evolve' || !offer.includes(c));
  const weight = (c: UpgradeCard) => c.kind === 'evolve' ? 3 : c.level > 1 ? 1.25 : c.kind === 'gadget' ? 1 : 0.8;
  const size = 3 + (run.aug?.choice ? 1 : 0);
  while (offer.length < size && rest.length) {
    let total = 0; for (const c of rest) total += weight(c);
    let r = rand(state) * total, i = 0;
    for (; i < rest.length - 1; i++) { r -= weight(rest[i]); if (r <= 0) break; }
    offer.push(rest.splice(i, 1)[0]);
  }
  if (offer.length < 3) offer.push({ kind: 'gold', id: 'gold', level: 0 });
  if (offer.length < 3) offer.push({ kind: 'heal', id: 'heal', level: 0 });
  return offer;
}
export function goldValue(state: GameState) { return Math.round(250 * Math.max(1, state.arcade?.wave ?? 1) * (1+(state.arcade?.run?.aug?.salvage||0))); }

function apply(state: GameState, run: ArcadeRun, c: UpgradeCard) {
  const p = state.player;
  if (c.kind === 'gadget') {
    const g = gadget(run, c.id as GadgetId);
    if (g) g.level = Math.min(MAX_LEVEL, g.level + 1);
    else run.gadgets.push({ id: c.id as GadgetId, level: 1, evolved: false, cd: 0.6, cd2: 1, angle: 0, prevAngle: 0 });
    toast(state, `${GADGETS[c.id as GadgetId].name.toUpperCase()} LV ${c.level}`, GADGETS[c.id as GadgetId].color);
  } else if (c.kind === 'passive') {
    const e = run.passives.find((x) => x.id === c.id);
    if (e) e.level = Math.min(MAX_LEVEL, e.level + 1); else run.passives.push({ id: c.id as PassiveId, level: 1 });
    if (c.id === 'kevlar') { syncPlayer(state); p.hp = Math.min(p.maxHp, p.hp + 30); }
    toast(state, `${PASSIVES[c.id as PassiveId].name.toUpperCase()} LV ${c.level}`, PASSIVES[c.id as PassiveId].color);
  } else if (c.kind === 'evolve') {
    const g = gadget(run, c.id as GadgetId);
    if (g) { g.evolved = true; g.cd = 0.2; g.cd2 = 0.5; }
    toast(state, `EVOLVED: ${GADGETS[c.id as GadgetId].evoName.toUpperCase()}`, '#ffcf4a');
    state.shake = Math.max(state.shake || 0, 5);
  } else if (c.kind === 'gold') {
    const v = goldValue(state); state.arcade!.score += v; run.gold += v;
    bankProgress(state);
    toast(state, `+${v} SCORE`, '#ffcf4a');
  } else {
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5);
    toast(state, 'PATCHED UP', '#79bd73');
  }
  emit(state, { t: 'upgradePicked', kind: c.kind, id: c.id, level: c.level });
  sound(state, 'pickup');
}

/** UI action: pick card `index` from the open offer. Resumes the sim when no level-ups remain. */
export function choose(state: GameState, index: number): boolean {
  const run = runOf(state);
  if (!run || state.ui !== 'levelup' || !run.offer || state.screen !== 'playing') return false;
  const c = run.offer[index];
  if (!c) return false;
  apply(state, run, c);
  run.pending = Math.max(0, run.pending - 1);
  if (run.pending > 0) { run.offer = makeOffer(state); emit(state, { t: 'arcadeLevelUp', level: run.level }); }
  else { run.offer = null; state.ui = null; }
  return true;
}
/** UI action: spend a reroll (Second Opinion augment) for a fresh offer. */
export function reroll(state: GameState): boolean {
  const run = runOf(state);
  if (!run || state.ui !== 'levelup' || !run.offer || !(run.rerolls! > 0)) return false;
  run.rerolls!--;
  run.offer = makeOffer(state);
  emit(state, { t: 'arcadeLevelUp', level: run.level });
  sound(state, 'click');
  return true;
}
/** Head Start augment: open the picker for `n` free cards right away. */
export function freePicks(state: GameState, n: number) {
  const run = runOf(state); if (!run || n <= 0) return;
  run.pending += n;
  if (!run.offer) openPicker(state, run);
}
/** Dev/test helper: grant XP as if collected (may open the picker). */
export function grantXp(state: GameState, amount: number) {
  const run = runOf(state); if (!run) return;
  run.xp += amount;
  while (run.xp >= xpNeed(run.level)) { run.xp -= xpNeed(run.level); run.level++; run.pending++; state.player.hp=Math.min(state.player.maxHp,state.player.hp+(run.aug?.levelHeal||0)); }
  if (run.pending > 0 && !run.offer && state.screen === 'playing') openPicker(state, run);
}

// ------------------------------------------------------------------ per-tick hooks (called from stepArcade)
/** Keep permanent skills, augments and this run's Kevlar on the same HP calculation. */
export function syncPlayer(state: GameState) {
  const run = runOf(state); if (!run) return;
  const p = state.player as GameState['player'] & { syncT?: number };
  p.syncT = 1e9;
  p.maxHp = progression.playerMods(state).maxHp;
}

const scaledBullets = new WeakSet<Bullet>();
const lastScaledShot = new WeakMap<object, number>();
/** After combat.update: Hollow Points / Adrenaline / Extra Mag also buff the player's gun. */
export function gunBuffs(state: GameState) {
  const run = runOf(state); if (!run) return;
  const m = mods(run), p = state.player;
  if (m.dmg > 1) for (const b of state.bullets) {
    if (b.weapon === 'drone' || scaledBullets.has(b)) continue;
    scaledBullets.add(b); b.damage *= m.dmg;
  }
  if (m.fireRate > 1 && p.lastShotT === state.time && p.fireCooldown > 0 && lastScaledShot.get(p) !== state.tick) {
    lastScaledShot.set(p, state.tick); p.fireCooldown /= m.fireRate;
  }
  if (m.reload < 1 && p.reloadTotal > 0 && p.reloadTimer === p.reloadTotal) { p.reloadTotal *= m.reload; p.reloadTimer = p.reloadTotal; }
}

/** Gadgets, projectiles and pools. */
export function update(state: GameState, dt: number) {
  const run = runOf(state); if (!run || state.player.dead) return;
  const m = mods(run);
  for (const g of run.gadgets) {
    g.prevAngle = g.angle;
    if (g.id === 'saw') updateSaw(state, run, g, m, dt);
    else if (g.id === 'molotov') updateMolotov(state, run, g, m, dt);
    else if (g.id === 'drone') updateDrones(state, run, g, m, dt);
    else if (g.id === 'coil') updateCoil(state, run, g, m, dt);
    else updateFrag(state, run, g, m, dt);
  }
  updateLobs(state, run, m, dt);
  updatePools(state, run, m, dt);
}
/** XP magnet + level-up check. */
export function pickups(state: GameState, dt: number) {
  const run = runOf(state); if (!run || state.player.dead) return;
  if (run.offer && state.ui === null) { state.ui = 'levelup'; return; }   // something closed the picker without choosing
  collect(state, run, mods(run), dt);
}
