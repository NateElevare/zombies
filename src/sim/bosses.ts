// bosses.ts — boss fights: every 5th arcade wave, and lairs in the city's largest buildings (city-bosses.ts).
// Each boss is a huge, slow, very tough zombie with special attacks and a signature weapon it drops.
// A boss is an ordinary Zombie (its `type` is a base type, so chase/melee/pathing/gadgets all just work) tagged
// with `boss: BossId`; this module layers the special attacks on top and owns their hazards (arcade.bfx / state.bossFx).
// Pure sim: deterministic via rand(state), no Phaser/DOM. The renderer selects pixel poses from the same data.
import { emit, phys, rand, sound, toast } from './core';
import type { GameState, Stack, Vec, Zombie, ZombieType } from './types';
import * as zombies from './zombies';
import * as player from './player';
import * as pathing from './pathing';
import * as hive from './hive';
import * as hiveBosses from './hive-bosses';

export type BossId = 'butcher' | 'broodmother' | 'howler' | 'juggernaut' | 'plague' | 'warden' | 'marshal'
  | 'famine' | 'vespa' | 'goliath' | 'prioress' | 'carrion_lord' | 'queen';
export interface BossDef {
  name: string; title: string; base: ZombieType; r: number; hp: number; speed: number; damage: number;
  /** Identity and attack-warning colours for the renderer. */
  color: string; glow: string;
  attacks: string[];
}
export const BOSSES: Record<BossId, BossDef> = {
  butcher:     { name: 'The Butcher', title: 'Charges in a straight line', base: 'brute', r: 38, hp: 4200, speed: 46, damage: 34, color: '#8e2a22', glow: '#ff5a3c', attacks: ['charge'] },
  broodmother: { name: 'Brood Mother', title: 'Births swarms and spits acid', base: 'bloater', r: 42, hp: 3800, speed: 32, damage: 22, color: '#6f7d2a', glow: '#c8ff3a', attacks: ['brood', 'acid'] },
  howler:      { name: 'The Howler', title: 'Screams shockwaves and leaps', base: 'runner', r: 32, hp: 3200, speed: 62, damage: 22, color: '#3a5f86', glow: '#7cc8ff', attacks: ['scream', 'leap'] },
  juggernaut:  { name: 'Juggernaut', title: 'Ground slams and hurls boulders', base: 'brute', r: 46, hp: 6500, speed: 34, damage: 44, color: '#5b5f66', glow: '#ffb43a', attacks: ['slam', 'boulder'] },
  plague:      { name: 'Plague Lord', title: 'Toxic aura, spit barrages, bursts on death', base: 'bloater', r: 38, hp: 4200, speed: 38, damage: 18, color: '#5e2f78', glow: '#d77cff', attacks: ['aura', 'spit', 'trail'] },
  // The Long Road's final boss: relentless pursuit, four stages (3/4, 1/2, 1/4 health). Not in the arcade rotation.
  warden:      { name: 'The Warden', title: 'Fort Ashgrove\'s last sentry', base: 'brute', r: 60, hp: 26000, speed: 42, damage: 52, color: '#4a2a2a', glow: '#ff7a3a', attacks: ['slam', 'rush', 'barrage', 'quake'] },
  // The Hive Below: the soldier ant that seals the Warrens. Bait its charge into a wall. Not in the arcade rotation.
  marshal:     { name: 'The Marshal', title: 'Charges, rallies the column, sprays acid', base: 'brute', r: 40, hp: 5000, speed: 52, damage: 30, color: '#8a5a22', glow: '#f0a93a', attacks: ['charge', 'rally', 'formic'] },
  // The Hive Below, the cells beyond the Warrens (their fights are in sim/hive-bosses.ts). Not in the arcade rotation.
  famine:      { name: 'Famine', title: 'Leaps out of sight, sweeps the floor with locusts', base: 'brute', r: 34, hp: 4500, speed: 74, damage: 26, color: '#6f8a2a', glow: '#b7e04a', attacks: ['skyfall', 'front'] },
  vespa:       { name: 'Matriarch Vespa', title: 'Strafes, lobs venom, hatches her comb', base: 'brute', r: 36, hp: 5200, speed: 80, damage: 24, color: '#a8862a', glow: '#f2d25a', attacks: ['strafe', 'volley', 'hatch', 'dash'] },
  goliath:     { name: 'Goliath', title: 'Armoured in front: make it ram the rock', base: 'brute', r: 48, hp: 7500, speed: 40, damage: 40, color: '#5a3a26', glow: '#ff8a3a', attacks: ['ram', 'vent', 'quake'] },
  prioress:    { name: 'The Prioress', title: 'Unseen outside your light', base: 'brute', r: 34, hp: 5000, speed: 86, damage: 34, color: '#2a6a5a', glow: '#58d0c0', attacks: ['cross', 'reap', 'vespers'] },
  carrion_lord: { name: 'The Carrion Lord', title: 'Infests the dead, floods the floor with bile', base: 'brute', r: 42, hp: 6000, speed: 50, damage: 28, color: '#4a3a5a', glow: '#a98bd0', attacks: ['infest', 'bile', 'buzz', 'aura'] },
  queen:       { name: 'The Queen', title: 'She holds the rift open', base: 'brute', r: 64, hp: 24000, speed: 55, damage: 45, color: '#4a2a7a', glow: '#b48cff', attacks: ['court', 'brood', 'unbound', 'anchor'] },
};
/** Bosses that belong to a story and never join the arcade rotation or the city lairs. */
export const STORY_BOSSES: ReadonlySet<BossId> = new Set<BossId>(['warden', 'marshal', 'famine', 'vespa', 'goliath', 'prioress', 'carrion_lord', 'queen']);
/** Arcade rotation (the Warden and the hive's bosses are story-only). */
export const BOSS_IDS = (Object.keys(BOSSES) as BossId[]).filter(id => !STORY_BOSSES.has(id));
export const BOSS_EVERY = 5;
export const isBossWave = (wave: number) => wave > 0 && wave % BOSS_EVERY === 0;
/** Which boss appears on a boss wave (cycles through all five), and how many times the cycle has repeated. */
export function bossFor(wave: number) {
  const n = Math.floor(wave / BOSS_EVERY) - 1;
  return { id: BOSS_IDS[((n % BOSS_IDS.length) + BOSS_IDS.length) % BOSS_IDS.length], cycle: Math.floor(n / BOSS_IDS.length) };
}
export const PLAGUE_AURA = 130;
/** Each boss drops its own signature weapon (plus ammo for it). */
export const BOSS_WEAPON: Record<BossId, string> = {
  butcher: 'butcher_cleaver', broodmother: 'brood_scattergun', howler: 'banshee_smg', juggernaut: 'rockbreaker', plague: 'cola_mints', warden: 'rockbreaker',
  marshal: 'mandible_shears',
  famine: 'locust_repeater', vespa: 'vespiary', goliath: 'hornbreaker', prioress: 'mantis_scythes', carrion_lord: 'carrion_hive', queen: 'queens_decree',
};
const TROPHY_AMMO: Record<string, [string, number]> = { brood_scattergun: ['ammo_12g', 24], banshee_smg: ['ammo_9mm', 135], rockbreaker: ['ammo_308', 18], cola_mints: ['mints', 6] };
const TROPHY_MAG: Record<string, number> = { brood_scattergun: 8, banshee_smg: 45, rockbreaker: 6, cola_mints: 50, locust_repeater: 40, vespiary: 100, carrion_hive: 3, queens_decree: 6 };
/** The signature weapon (loaded) and a supply of its ammo. */
export function trophyLoot(id: BossId): Stack[] {
  const w = BOSS_WEAPON[id], ammo = TROPHY_AMMO[w];
  return [{ id: w, qty: 1, ...(TROPHY_MAG[w] ? { mag: TROPHY_MAG[w] } : {}) }, ...(ammo ? [{ id: ammo[0], qty: ammo[1] }] : [])];
}

// ------------------------------------------------------------------ hazards (drawn by render/bosses.ts)
export interface BossShot { id: number; kind: 'spit' | 'acid' | 'rock' | 'cleaver'; x: number; y: number; prevX: number; prevY: number; vx: number; vy: number;
  /** lobbed shots fly from (sx,sy) to (tx,ty) over T seconds; t counts up */ sx: number; sy: number; tx: number; ty: number; t: number; T: number;
  r: number; dmg: number; dead: boolean }
export interface BossRing { x: number; y: number; r: number; maxR: number; speed: number; width: number; dmg: number; push: number; hit: boolean; color: string }
export interface BossPool { kind: 'acid' | 'toxic'; x: number; y: number; r: number; life: number; max: number; dmg: number; tick: number }
/** Telegraph of an attack about to land: a circle (target area) or a line (charge lane). Visual only. */
export interface BossTele { kind: 'circle' | 'line'; x: number; y: number; r: number; angle: number; len: number; t: number; T: number; color: string }
export interface BossFx { shots: BossShot[]; rings: BossRing[]; pools: BossPool[]; tele: BossTele[]; nextId: number }

type BossZ = Zombie & {
  boss: BossId; bossCycle: number; bossMul: number; baseSpeed: number;
  /** current special: '' when just chasing */ act: string; actT: number; actA: number; actX: number; actY: number;
  cd: Record<string, number>; slamN: number; auraT: number; trailT: number; hitPlayer: boolean;
  /** 0 = the original move set, 1 = with the second special (story bosses, arcade from the second cycle) */ kit: number;
  /** below half health: faster, shorter cooldowns (announced once) */ raged?: boolean;
  /** the Warden's phase 0..3 */ stage: number; leapN: number;
  /** Distance left in the Warden's committed rush. */ rushLeft?: number;
  /** drawn size, when larger than the collision radius (the renderer reads this) */ drawR?: number;
};

export function fx(state: GameState): BossFx {
  const fresh = () => ({ shots: [], rings: [], pools: [], tele: [], nextId: 1 });
  return state.arcade ? (state.arcade.bfx ??= fresh()) as BossFx : (state.bossFx ??= fresh());
}
export const isBoss = (z: Zombie | null | undefined): z is BossZ => !!z && typeof z.boss === 'string';
export function activeBoss(state: GameState): BossZ | null {
  for (const z of state.zombies) if (!z.dead && isBoss(z)) return z;
  return null;
}

/** Spawn the boss for `wave` at (x,y). hpMul is the wave's normal health multiplier. */
export function spawnBoss(state: GameState, wave: number, x: number, y: number, hpMul: number) {
  const { id, cycle } = bossFor(wave);
  return spawnBossOf(state, id, cycle, x, y, hpMul);
}
export interface SpawnOpts {
  /** lurk (idle, no fanfare) until it notices the player: city lairs */ lurk?: boolean;
  /** collision radius cap, so it fits through doorways (drawn at full size regardless) */ maxR?: number;
  /** damage multiplier on top of the cycle's */ dmgMul?: number;
  /** health multiplier on top of hpMul (second encounters) */ hpBoost?: number;
  /** full move set regardless of cycle */ kit?: number;
  /** drawn radius override */ drawR?: number;
}
export function spawnBossOf(state: GameState, id: BossId, cycle: number, x: number, y: number, hpMul: number, opts: SpawnOpts = {}) {
  const d = BOSSES[id];
  const z = zombies.spawn(state, d.base, x, y) as unknown as BossZ;
  const mul = (1 + 0.25 * cycle) * (opts.dmgMul ?? 1);   // damage / aggression grows each time the cycle repeats
  z.r = Math.min(d.r, opts.maxR ?? Infinity); z.boss = id; z.bossCycle = cycle; z.bossMul = mul;
  z.hp = z.maxHp = Math.round(d.hp * hpMul * (1 + 0.4 * cycle) * (opts.hpBoost ?? 1));
  z.baseSpeed = z.speed = d.speed * (1 + 0.05 * cycle);
  z.damage = d.damage * mul;
  z.kit = opts.kit ?? (cycle > 0 ? 1 : 0); z.stage = 0; z.leapN = 0; z.raged = false;
  z.drawR = opts.drawR ?? (id === 'warden' ? d.r * 2.6 : d.r);
  z.act = ''; z.actT = 0; z.actA = 0; z.actX = 0; z.actY = 0; z.slamN = 0; z.auraT = 0; z.trailT = 0; z.hitPlayer = false;
  // stagger the first specials so the fight opens with a breather
  z.cd = { charge: 4, brood: 3, acid: 2.5, scream: 4, leap: 7, slam: 4, boulder: 2.5, spit: 2.5, throw: 6, rain: 8, pounce: 9, quake: 7, miasma: 9, rally: 7, formic: 2.5 };
  if (opts.lurk) return z;
  announce(state, z);
  z.state = 'chase'; z.target = { x: state.player.x, y: state.player.y }; z.memory = 99;
  return z;
}
/** Fanfare when a boss enters the fight (immediately in the arcade; when it first hunts the player in the city). */
export function announce(state: GameState, z: Zombie) {
  if (!isBoss(z) || z.announced) return;
  const d = BOSSES[z.boss];
  z.announced = true;
  state.shake = Math.max(state.shake, 14);
  sound(state, 'horde');
  toast(state, `BOSS: ${d.name.toUpperCase()}`, d.glow);
  emit(state, { t: 'bossSpawn', id: z.boss, name: d.name, x: z.x, y: z.y });
}
/** The boss the player is fighting: any live one in the arcade, an announced one within range in the city. */
export function engagedBoss(state: GameState, range = 1100): BossZ | null {
  if (state.arcade) return activeBoss(state);
  const p = state.player;
  for (const z of state.zombies) if (!z.dead && isBoss(z) && z.announced && dist(z, p) < range) return z;
  return null;
}

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
function hurtPlayer(state: GameState, amount: number, from: Vec, push = 0) {
  const p = state.player; if (p.dead) return;
  const ang = Math.atan2(p.y - from.y, p.x - from.x);
  const before = p.hp;
  player.damage(state, amount, ang);
  if (push > 0 && p.hp < before) {
    const step = 8, n = Math.ceil(push / step);
    for (let i = 0; i < n; i++) { const nx = p.x + Math.cos(ang) * step, ny = p.y + Math.sin(ang) * step; if (!phys.isFree(state, nx, ny, p.r)) break; p.x = nx; p.y = ny; }
  }
}
/** Bosses bulldoze arena props: destroy every breakable solid the circle (x,y,r) touches. Returns how many broke. */
const SMASHABLE = new Set(['car', 'furniture', 'tree', 'fence', 'rock']);
/** In the story, bosses bulldoze the city's own props too (never walls, windows, gates or player structures). */
const canSmash = (state: GameState, o: import('./types').Solid) => !!o.breakable || (state.mode === 'road' && SMASHABLE.has(o.kind) && !(o as { campaignArt?: boolean }).campaignArt);
export function smash(state: GameState, x: number, y: number, r: number) {
  const hit: import('./types').Solid[] = [];
  state.grid.each(x - r, y - r, r * 2, r * 2, o => {
    if (!canSmash(state, o) || o.solid === false) return;
    const cx = Math.max(o.x, Math.min(o.x + o.w, x)), cy = Math.max(o.y, Math.min(o.y + o.h, y));
    if (Math.hypot(x - cx, y - cy) < r) hit.push(o);
  });
  for (const o of hit) {
    // cars stay behind as flattened wrecks you can walk over; everything else is gone
    if (o.kind === 'car') { o.solid = false; o.blocksBullets = false; o.blocksSight = false; o.breakable = false; (o as { wreck?: boolean }).wreck = true; }
    else phys.removeSolid(state, o);
    if (o.container) { state.containers = state.containers.filter(c => c !== o.container); }
    emit(state, { t: 'salvaged', x: o.x, y: o.y, w: o.w, h: o.h });   // repaints the baked ground under it
    emit(state, { t: 'explosion', x: o.x + o.w / 2, y: o.y + o.h / 2, radius: Math.max(24, Math.min(60, Math.hypot(o.w, o.h) / 2)) });
    emit(state, { t: 'propSmashed', x: o.x + o.w / 2, y: o.y + o.h / 2, kind: o.kind, sub: o.sub ?? '' });
    state.shake = Math.max(state.shake, 9);
  }
  if (hit.length) { pathing.reset(state); sound(state, 'explosion', x, y); }
  return hit.length;
}
/** Move a boss by (dx,dy) in small steps, smashing props in the way; returns false if blocked (arena wall). */
function shove(state: GameState, z: BossZ, dx: number, dy: number) {
  const len = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(len / 6));
  for (let i = 0; i < n; i++) {
    const nx = z.x + dx / n, ny = z.y + dy / n;
    smash(state, nx, ny, z.r + 2);
    if (!phys.isFree(state, nx, ny, z.r)) return false;
    z.x = nx; z.y = ny;
  }
  return true;
}
function lob(state: GameState, z: BossZ, kind: 'acid' | 'rock', tx: number, ty: number, T: number, dmg: number) {
  const f = fx(state);
  f.shots.push({ id: f.nextId++, kind, x: z.x, y: z.y, prevX: z.x, prevY: z.y, vx: 0, vy: 0, sx: z.x, sy: z.y, tx, ty, t: 0, T, r: kind === 'rock' ? 60 : 55, dmg, dead: false });
  f.tele.push({ kind: 'circle', x: tx, y: ty, r: kind === 'rock' ? 60 : 55, angle: 0, len: 0, t: 0, T, color: kind === 'rock' ? '#ffb43a' : '#c8ff3a' });
}
function spit(state: GameState, z: BossZ, ang: number, speed: number, dmg: number) {
  const f = fx(state), x = z.x + Math.cos(ang) * z.r, y = z.y + Math.sin(ang) * z.r;
  f.shots.push({ id: f.nextId++, kind: 'spit', x, y, prevX: x, prevY: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, sx: x, sy: y, tx: 0, ty: 0, t: 0, T: 3, r: 9, dmg, dead: false });
}
function ring(state: GameState, x: number, y: number, maxR: number, speed: number, dmg: number, push: number, color: string, width = 26) {
  fx(state).rings.push({ x, y, r: 10, maxR, speed, width, dmg, push, hit: false, color });
}
function minions(state: GameState, z: BossZ, n: number, types: ZombieType[], hpMul: number) {
  if (state.zombies.filter(o => !o.dead).length >= 60) return;
  for (let i = 0; i < n; i++) {
    const a = rand(state) * Math.PI * 2, d = z.r + 20 + rand(state) * 30, x = z.x + Math.cos(a) * d, y = z.y + Math.sin(a) * d;
    if (!phys.isFree(state, x, y, 12)) continue;
    const m = zombies.spawn(state, types[Math.floor(rand(state) * types.length)], x, y);
    m.hp = m.maxHp = Math.round(m.maxHp * hpMul);
    m.state = 'chase'; m.target = { x: state.player.x, y: state.player.y }; m.memory = 10;
  }
}

/** The boss kit, for the bosses that live in their own module (sim/hive-bosses.ts) and for hive creatures that hit like one. */
export const kit = { hurtPlayer, shove, lob, spit, ring, minions, dist };
/** Pick and run special attacks. Called once per arcade tick after zombies.update. */
function think(state: GameState, z: BossZ, dt: number, hpMul: number) {
  const p = state.player, d = BOSSES[z.boss], m = z.bossMul, dp = dist(z, p);
  // rage below half health: faster feet and shorter cooldowns, announced once
  const enraged = z.hp < z.maxHp * 0.5;
  if (enraged && !z.raged) { z.raged = true; toast(state, `${d.name.toUpperCase()} IS ENRAGED`, d.glow); state.shake = Math.max(state.shake, 10); sound(state, 'horde', z.x, z.y); }
  for (const k in z.cd) z.cd[k] -= dt * (enraged ? 1.35 : 1);
  // the hive's later bosses run their own fights on this kit
  if (hiveBosses.IDS.has(z.boss)) { hiveBosses.think(state, z, dt, { enraged, m, hpMul }); return; }
  // the Warden's stages
  if (z.boss === 'warden') {
    // Ordinary zombie sight ends at 350px. An engaged Warden keeps hunting at
    // attack range instead of losing every ranged special when the player retreats.
    if (z.announced && dp < 1600) {
      z.state = 'chase'; z.target = { x: p.x, y: p.y }; z.memory = 12;
    }
    const stage = z.hp <= z.maxHp * 0.25 ? 3 : z.hp <= z.maxHp * 0.5 ? 2 : z.hp <= z.maxHp * 0.75 ? 1 : 0;
    if (stage > z.stage) {
      z.stage = stage; z.act = ''; z.actT = 0;
      toast(state, `THE WARDEN · STAGE ${stage + 1}`, d.glow); state.shake = Math.max(state.shake, 18);
      emit(state, { t: 'explosion', x: z.x, y: z.y, radius: z.r + 40 });
      ring(state, z.x, z.y, 360, 420, 18 * m, 120, d.glow, 30);
      if (stage >= 2) minions(state, z, 2 + stage, ['brute', 'runner', 'runner'], hpMul);
      z.cd.slam = 2; z.cd.boulder = 1.5; z.cd.quake = 3; z.cd.charge = 4;
    }
  }
  const runSpeed = z.baseSpeed * (enraged ? 1.3 : 1) * (z.boss === 'warden' ? [1, 1.12, 1.25, 1.45][z.stage] : 1);
  if (!state.arcade && !z.act && z.state !== 'chase') { z.speed = runSpeed; return; }   // a lurking city boss saves its specials
  const toP = Math.atan2(p.y - z.y, p.x - z.x);
  // ---- an attack in progress
  if (z.act) {
    z.actT += dt;
    z.speed = 0; z.angle = z.act === 'charging' || z.act === 'leaping' || (z.boss === 'warden' && z.act === 'chargeWind') ? z.actA : toP;
    switch (z.act) {
      case 'chargeWind':   // lock on, then lunge
        if (z.boss !== 'warden' && z.actT < 0.55) z.actA = toP;
        if (z.actT >= 0.9) { z.act = 'charging'; z.actT = 0; z.hitPlayer = false; sound(state, 'zombieAttack', z.x, z.y); }
        break;
      case 'charging': {
        const warden = z.boss === 'warden';
        const step = warden ? Math.min(z.rushLeft ?? 0, 780 * dt) : 560 * dt;
        const ok = shove(state, z, Math.cos(z.actA) * step, Math.sin(z.actA) * step);
        if (warden) z.rushLeft = Math.max(0, (z.rushLeft ?? 0) - step);
        if (!z.hitPlayer && dist(z, p) < z.r + p.r + 6) { z.hitPlayer = true; hurtPlayer(state, 38 * m, z, 110); }
        if (!ok) { z.act = 'stunned'; z.actT = 0; state.shake = Math.max(state.shake, 12); emit(state, { t: 'explosion', x: z.x + Math.cos(z.actA) * z.r, y: z.y + Math.sin(z.actA) * z.r, radius: 40 }); }
        else if (warden ? z.rushLeft === 0 : z.actT >= 0.8) { z.act = 'recover'; z.actT = 0; }
        break;
      }
      case 'stunned': if (z.actT >= 1.4) { z.act = ''; } break;          // slammed into a wall: free hits
      case 'recover':
        if (z.actT >= (z.boss === 'warden' ? 0.65 : 0.35)) {
          z.act = '';
          // the Marshal in a rage charges twice in a row
          if (z.boss === 'marshal' && z.leapN > 0 && dp > 90) {
            z.leapN--; z.act = 'chargeWind'; z.actT = 0.2; z.actA = toP;
            fx(state).tele.push({ kind: 'line', x: z.x, y: z.y, r: z.r, angle: toP, len: 470, t: 0, T: 0.7, color: d.glow });
          }
        }
        break;
      case 'formicWind':   // the Marshal rears and sprays: a 90 degree fan of acid that stays on the floor
        if (z.actT < 0.4) z.actA = toP;
        if (z.actT >= 0.7) {
          const reach = Math.max(170, Math.min(400, dp));
          for (let i = 0; i < 5; i++) { const a = z.actA + (i - 2) * Math.PI / 8; lob(state, z, 'acid', z.x + Math.cos(a) * reach, z.y + Math.sin(a) * reach, 0.45 + i * 0.05, 9 * m); }
          sound(state, 'zombieAttack', z.x, z.y);
          z.act = 'recover'; z.actT = 0;
        }
        break;
      case 'screamWind':
        if (z.actT >= 0.65) {
          ring(state, z.x, z.y, 340, 520, 16 * m, 130, d.glow, 30);
          minions(state, z, 2, ['runner'], hpMul);
          state.shake = Math.max(state.shake, 10); sound(state, 'horde', z.x, z.y);
          z.act = 'recover'; z.actT = 0;
        }
        break;
      case 'leapWind':
        if (z.actT >= 0.55) { z.act = 'leaping'; z.actT = 0; z.actA = Math.atan2(z.actY - z.y, z.actX - z.x); (z as unknown as { lx: number; ly: number }).lx = z.x; (z as unknown as { lx: number; ly: number }).ly = z.y; }
        break;
      case 'leaping': {
        const o = z as unknown as { lx: number; ly: number }, k = Math.min(1, z.actT / 0.6);
        z.x = o.lx + (z.actX - o.lx) * k; z.y = o.ly + (z.actY - o.ly) * k;
        z.leapK = k;
        if (k >= 1) {
          z.leapK = 0;
          smash(state, z.x, z.y, z.r + 30);
          ring(state, z.x, z.y, 120, 420, 24 * m, 90, d.glow);
          emit(state, { t: 'explosion', x: z.x, y: z.y, radius: 70 }); state.shake = Math.max(state.shake, 12);
          z.act = 'recover'; z.actT = 0;
        }
        break;
      }
      case 'slamWind': {
        const R = z.boss === 'warden' ? 560 : 440, dmg = (z.boss === 'warden' ? 26 : 22) * m;
        if (z.actT >= 1.0 && z.slamN === 0) { z.slamN = 1; ring(state, z.x, z.y, R, 300, dmg, 70, d.glow); smash(state, z.x, z.y, z.r + 60); emit(state, { t: 'explosion', x: z.x, y: z.y, radius: 80 }); state.shake = Math.max(state.shake, 16); }
        if (z.actT >= 1.4 && z.slamN === 1) { z.slamN = 2; ring(state, z.x, z.y, R, 300, dmg, 70, d.glow); state.shake = Math.max(state.shake, 10); }
        if (z.actT >= 1.8 && z.slamN === 2) { z.slamN = 0; ring(state, z.x, z.y, R, 300, dmg, 70, d.glow); state.shake = Math.max(state.shake, 10); z.act = 'recover'; z.actT = 0; }
        break;
      }
      case 'throwWind':   // the Butcher hurls a fan of cleavers
        if (z.actT < 0.4) z.actA = toP;
        if (z.actT >= 0.55) {
          for (const off of [-0.26, 0, 0.26]) throwCleaver(state, z, z.actA + off, 440, 24 * m);
          sound(state, 'swing', z.x, z.y);
          z.act = 'recover'; z.actT = 0;
        }
        break;
      case 'pounceWind':  // the Howler chains three short pounces
        if (z.actT >= 0.4) {
          const dd = dist(z, p), reach = Math.min(dd, 260), a = toP;
          z.actX = z.x + Math.cos(a) * reach; z.actY = z.y + Math.sin(a) * reach;
          if (!phys.isFree(state, z.actX, z.actY, z.r)) { z.actX = z.x; z.actY = z.y; }
          z.act = 'pouncing'; z.actT = 0; z.actA = a;
          (z as unknown as { lx: number; ly: number }).lx = z.x; (z as unknown as { lx: number; ly: number }).ly = z.y;
          fx(state).tele.push({ kind: 'circle', x: z.actX, y: z.actY, r: 90, angle: 0, len: 0, t: 0, T: 0.35, color: d.glow });
        }
        break;
      case 'pouncing': {
        const o = z as unknown as { lx: number; ly: number }, k = Math.min(1, z.actT / 0.35);
        z.x = o.lx + (z.actX - o.lx) * k; z.y = o.ly + (z.actY - o.ly) * k; z.leapK = k;
        if (k >= 1) {
          z.leapK = 0; z.leapN++;
          smash(state, z.x, z.y, z.r + 20);
          ring(state, z.x, z.y, 90, 420, 14 * m, 60, d.glow, 20);
          state.shake = Math.max(state.shake, 6);
          if (z.leapN >= 3) { z.leapN = 0; z.act = 'recover'; z.actT = 0; } else { z.act = 'pounceWind'; z.actT = 0.25; }
        }
        break;
      }
      case 'quakeWind':   // Juggernaut / Warden: a line of eruptions racing toward the player
        if (z.boss !== 'warden' && z.actT < 0.45) z.actA = toP;
        if (z.actT >= 0.7) {
          const n = z.boss === 'warden' ? 14 : 7;
          for (let i = 0; i < n; i++) { const dd = 110 + i * 90; lob(state, z, 'rock', z.x + Math.cos(z.actA) * dd, z.y + Math.sin(z.actA) * dd, 0.3 + i * 0.13, 24 * m); }
          state.shake = Math.max(state.shake, 10); sound(state, 'explosion', z.x, z.y);
          z.act = 'recover'; z.actT = 0;
        }
        break;
      default: z.act = '';
    }
    if (!z.act) z.speed = runSpeed;
    return;
  }
  z.speed = runSpeed;
  // ---- start a special when it is ready
  const tele = (t: BossTele) => fx(state).tele.push(t);
  const full = z.kit >= 1;
  switch (z.boss) {
    case 'butcher':
      if (z.cd.charge <= 0 && dp < 700 && dp > 90) {
        z.act = 'chargeWind'; z.actT = 0; z.actA = toP; z.cd.charge = 5.5;
        tele({ kind: 'line', x: z.x, y: z.y, r: z.r, angle: toP, len: 470, t: 0, T: 0.9, color: d.glow });
      } else if (full && z.cd.throw <= 0 && dp > 170 && dp < 780) {
        z.act = 'throwWind'; z.actT = 0; z.actA = toP; z.cd.throw = 6.5;
        for (const off of [-0.26, 0, 0.26]) tele({ kind: 'line', x: z.x, y: z.y, r: 10, angle: toP + off, len: 520, t: 0, T: 0.55, color: d.glow });
      }
      break;
    case 'broodmother':
      if (z.cd.brood <= 0) { z.cd.brood = 7; minions(state, z, 3 + z.bossCycle, ['crawler', 'walker', 'crawler'], hpMul); sound(state, 'groan', z.x, z.y); }
      if (z.cd.acid <= 0 && dp < 650) {
        z.cd.acid = 3.4;
        for (let i = 0; i < 3; i++) lob(state, z, 'acid', p.x + (i ? (rand(state) - 0.5) * 160 : p.vx * 0.5), p.y + (i ? (rand(state) - 0.5) * 160 : p.vy * 0.5), 1.0 + i * 0.15, 14 * m);
      } else if (full && z.cd.rain <= 0 && dp < 760) {
        // acid rain: the ground around the player becomes a minefield for a few seconds
        z.cd.rain = 9;
        for (let i = 0; i < 7; i++) { const a = rand(state) * Math.PI * 2, dd = 50 + rand(state) * 190; lob(state, z, 'acid', p.x + Math.cos(a) * dd, p.y + Math.sin(a) * dd, 0.8 + rand(state) * 0.7, 12 * m); }
        sound(state, 'groan', z.x, z.y);
      }
      break;
    case 'howler':
      if (z.cd.scream <= 0 && dp < 360) {
        z.act = 'screamWind'; z.actT = 0; z.cd.scream = 5;
        tele({ kind: 'circle', x: z.x, y: z.y, r: 340, angle: 0, len: 0, t: 0, T: 0.65, color: d.glow });
      } else if (z.cd.leap <= 0 && dp > 220 && dp < 620) {
        z.act = 'leapWind'; z.actT = 0; z.cd.leap = 7; z.actX = p.x; z.actY = p.y;
        tele({ kind: 'circle', x: p.x, y: p.y, r: 120, angle: 0, len: 0, t: 0, T: 1.15, color: d.glow });
      } else if (full && z.cd.pounce <= 0 && dp > 120 && dp < 560) {
        z.act = 'pounceWind'; z.actT = 0; z.leapN = 0; z.cd.pounce = 10;
      }
      break;
    case 'juggernaut':
      if (z.cd.slam <= 0 && dp < 300) {
        z.act = 'slamWind'; z.actT = 0; z.cd.slam = 6.5; z.slamN = 0;
        tele({ kind: 'circle', x: z.x, y: z.y, r: 440, angle: 0, len: 0, t: 0, T: 1.0, color: d.glow });
      } else if (full && z.cd.quake <= 0 && dp > 220 && dp < 900) {
        z.act = 'quakeWind'; z.actT = 0; z.actA = toP; z.cd.quake = 8;
        tele({ kind: 'line', x: z.x, y: z.y, r: 56, angle: toP, len: 700, t: 0, T: 0.7, color: d.glow });
      } else if (z.cd.boulder <= 0 && dp > 160 && dp < 800) { z.cd.boulder = 3.6; lob(state, z, 'rock', p.x + p.vx * 0.6, p.y + p.vy * 0.6, 1.1, 32 * m); }
      break;
    case 'plague':
      if (z.cd.spit <= 0 && dp < 700) {
        z.cd.spit = 2.8;
        const n = 7 + 2 * z.bossCycle, spread = 1.3;
        for (let i = 0; i < n; i++) spit(state, z, toP - spread / 2 + spread * i / (n - 1), 270, 11 * m);
        sound(state, 'zombieAttack', z.x, z.y);
      }
      if (full && z.cd.miasma <= 0 && dp < 520) {
        // miasma: a slow wide wave plus a ring of toxic puddles that closes the escape routes around the player
        z.cd.miasma = 10;
        ring(state, z.x, z.y, 300, 230, 10 * m, 50, d.glow, 40);
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + rand(state) * 0.4; lob(state, z, 'acid', p.x + Math.cos(a) * 125, p.y + Math.sin(a) * 125, 1.0 + i * 0.08, 10 * m); }
        sound(state, 'groan', z.x, z.y);
      }
      break;
    case 'marshal':
      if (z.cd.charge <= 0 && dp < 760 && dp > 110) {
        z.act = 'chargeWind'; z.actT = 0; z.actA = toP; z.cd.charge = 6; z.leapN = enraged ? 1 : 0;
        tele({ kind: 'line', x: z.x, y: z.y, r: z.r, angle: toP, len: 470, t: 0, T: 0.9, color: d.glow });
      } else if (z.cd.rally <= 0) {
        z.cd.rally = 12; hive.rally(state, z);
        ring(state, z.x, z.y, 260, 520, 0.01, 0, d.glow, 22);   // the pheromone burst: a harmless ring you can see
      } else if (z.cd.formic <= 0 && dp > 100 && dp < 560) {
        z.act = 'formicWind'; z.actT = 0; z.actA = toP; z.cd.formic = 6.5; z.leapN = 0;
        tele({ kind: 'line', x: z.x, y: z.y, r: 60, angle: toP, len: Math.max(170, Math.min(400, dp)), t: 0, T: 0.7, color: '#c8ff3a' });
      }
      break;
    case 'warden':
      if (z.cd.slam <= 0 && dp < 360) {
        z.act = 'slamWind'; z.actT = 0; z.cd.slam = z.stage >= 3 ? 5 : 7.5; z.slamN = 0;
        tele({ kind: 'circle', x: z.x, y: z.y, r: 560, angle: 0, len: 0, t: 0, T: 1.0, color: d.glow });
      } else if (z.stage >= 1 && z.cd.quake <= 0 && dp > 200 && dp < 1400) {
        z.act = 'quakeWind'; z.actT = 0; z.actA = toP; z.cd.quake = z.stage >= 3 ? 6 : 8.5;
        tele({ kind: 'line', x: z.x, y: z.y, r: 75, angle: toP, len: 1340, t: 0, T: 0.7, color: d.glow });
      } else if (z.cd.charge <= 0 && dp > 240 && dp < 1400) {
        // Lead slightly, then commit to the exact marked lane: a sideways dodge
        // or baiting him into a wall works; simply backing away no longer does.
        z.act = 'chargeWind'; z.actT = 0; z.cd.charge = z.stage >= 3 ? 5.5 : 7;
        z.actA = Math.atan2(p.y + p.vy * 0.5 - z.y, p.x + p.vx * 0.5 - z.x);
        z.rushLeft = Math.min(1250, dp + 240);
        tele({ kind: 'line', x: z.x, y: z.y, r: (z.r + 6) * 1.25, angle: z.actA, len: z.rushLeft + z.r, t: 0, T: 0.9, color: d.glow });
      } else if (z.cd.boulder <= 0 && dp > 180 && dp < 1500) {
        // Interception barrage: cover the current position and two points ahead
        // along the running path. All impact positions freeze when thrown.
        z.cd.boulder = z.stage >= 3 ? 3.5 : 5;
        const moving = Math.hypot(p.vx, p.vy) > 40;
        for (let i = 0; i < 3; i++) {
          const lead = i * 0.7, side = moving ? 0 : (i === 1 ? -120 : i === 2 ? 120 : 0);
          lob(state, z, 'rock', p.x + p.vx * lead - Math.sin(toP) * side, p.y + p.vy * lead + Math.cos(toP) * side, 1.1 + i * 0.2, 30 * m);
        }
        sound(state, 'zombieAttack', z.x, z.y);
        z.act = 'recover'; z.actT = 0;
      }
      // Hold still from the first warning frame, keeping the marked lane aligned.
      if (z.act) z.speed = 0;
      break;
  }
}
/** A spinning cleaver: a straight, fast, heavy projectile (handled like spit). */
function throwCleaver(state: GameState, z: BossZ, ang: number, speed: number, dmg: number) {
  const f = fx(state), x = z.x + Math.cos(ang) * (z.r + 6), y = z.y + Math.sin(ang) * (z.r + 6);
  f.shots.push({ id: f.nextId++, kind: 'cleaver', x, y, prevX: x, prevY: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, sx: x, sy: y, tx: 0, ty: 0, t: 0, T: 1.6, r: 13, dmg, dead: false });
}

/** Run boss specials and their hazards. Call every tick after zombies.update (arcade.ts, city-bosses.ts). */
export function update(state: GameState, dt: number, hpMul: number) {
  const f = fx(state), p = state.player;
  for (const z of state.zombies) {
    if (z.dead || !isBoss(z)) continue;
    // walking into a prop breaks it (zombies.update has already pushed the boss flush against it)
    smash(state, z.x, z.y, z.r + 3);
    think(state, z, dt, hpMul);
    if (z.boss === 'plague' && (state.arcade || z.state === 'chase')) {
      // toxic aura and a trail of poison puddles
      z.auraT -= dt;
      if (z.auraT <= 0 && dist(z, p) < PLAGUE_AURA + p.r) { z.auraT = 0.5; hurtPlayer(state, 6 * z.bossMul, z); }
      z.trailT -= dt;
      if (z.trailT <= 0) { z.trailT = 1.6; f.pools.push({ kind: 'toxic', x: z.x, y: z.y, r: 46, life: 6, max: 6, dmg: 8 * z.bossMul, tick: 0 }); }
    }
  }
  // telegraphs
  for (const t of f.tele) t.t += dt;
  f.tele = f.tele.filter(t => t.t < t.T);
  // shots
  for (const s of f.shots) {
    s.prevX = s.x; s.prevY = s.y; s.t += dt;
    if (s.kind === 'spit' || s.kind === 'cleaver') {
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (!p.dead && Math.hypot(p.x - s.x, p.y - s.y) < p.r + s.r) { hurtPlayer(state, s.dmg, { x: s.x - s.vx, y: s.y - s.vy }, s.kind === 'cleaver' ? 40 : 0); s.dead = true; }
      else if (s.t >= s.T) s.dead = true;
      else if (!phys.isFree(state, s.x, s.y, 2)) { if (s.kind === 'cleaver') smash(state, s.x, s.y, 30); if (!phys.isFree(state, s.x, s.y, 2)) s.dead = true; }
      continue;
    }
    const k = Math.min(1, s.t / s.T);
    s.x = s.sx + (s.tx - s.sx) * k; s.y = s.sy + (s.ty - s.sy) * k;
    if (k < 1) continue;
    s.dead = true;
    if (s.kind === 'rock') {
      emit(state, { t: 'explosion', x: s.tx, y: s.ty, radius: s.r }); state.shake = Math.max(state.shake, 8);
      smash(state, s.tx, s.ty, s.r * 0.6);
      if (!p.dead && Math.hypot(p.x - s.tx, p.y - s.ty) < s.r + p.r) hurtPlayer(state, s.dmg, { x: s.tx, y: s.ty }, 60);
    } else f.pools.push({ kind: 'acid', x: s.tx, y: s.ty, r: s.r, life: 6, max: 6, dmg: s.dmg, tick: 0 });
  }
  f.shots = f.shots.filter(s => !s.dead);
  // expanding shockwaves: hurt once when the front passes over the player
  for (const r of f.rings) {
    r.r += r.speed * dt;
    const dd = Math.hypot(p.x - r.x, p.y - r.y);
    if (!r.hit && !p.dead && Math.abs(dd - r.r) < r.width / 2 + p.r) { r.hit = true; hurtPlayer(state, r.dmg, r, r.push); }
  }
  f.rings = f.rings.filter(r => r.r < r.maxR);
  // puddles: damage in pulses while standing in them
  for (const q of f.pools) {
    q.life -= dt; q.tick -= dt;
    if (q.tick <= 0 && !p.dead && Math.hypot(p.x - q.x, p.y - q.y) < q.r + p.r * 0.5) { q.tick = 0.5; hurtPlayer(state, q.dmg, q); }
  }
  f.pools = f.pools.filter(q => q.life > 0);
  if (f.pools.length > 40) f.pools.splice(0, f.pools.length - 40);
}

/** Boss died: death effects. Scoring and loot are handled by arcade.ts / city-bosses.ts. */
export function onBossDeath(state: GameState, z: Zombie, hpMul: number) {
  if (!isBoss(z)) return;
  const d = BOSSES[z.boss];
  emit(state, { t: 'explosion', x: z.x, y: z.y, radius: z.r * 2.2 });
  emit(state, { t: 'bossDefeated', id: z.boss, name: d.name, x: z.x, y: z.y });
  state.shake = Math.max(state.shake, 22);
  toast(state, `${d.name.toUpperCase()} DEFEATED`, '#ffcf4a');
  sound(state, 'waveStart');
  if (z.boss === 'plague') {
    for (let i = 0; i < 14; i++) spit(state, z, i * Math.PI * 2 / 14, 230, 12 * z.bossMul);
    minions(state, z, 4, ['crawler'], hpMul);
  }
}

/** Clear hazards (wave over / new run). */
export function clearFx(state: GameState) {
  if (state.arcade ? !state.arcade.bfx : !state.bossFx) return;
  const f = fx(state); f.shots.length = 0; f.rings.length = 0; f.pools.length = 0; f.tele.length = 0;
}
