// Arena and wave rules; movement, weapons, damage and collision stay in the shared sim.
import { emit, hash, newState, phys, rand, snapshotInterp, sound, toast } from './core';
import type { GameState, InputState, SolidKind, Stack, Zombie, ZombieType } from './types';
import * as player from './player';
import * as combat from './combat';
import * as zombies from './zombies';
import * as inv from './inventory';
import { ITEMS } from './items';
import { randomAmmoDrop } from './loot';
import * as upgrades from './upgrades';
import * as bosses from './bosses';
import * as augments from './augments';

const ARENA = { x: 6800, y: 7200, w: 2400, h: 1600 };
const BORDER = 40, VIEW_RADIUS = 700, BEST_KEY = 'deadzone_arcade_best';
const WEAPON_DROPS = ['shotgun', 'smg', 'revolver', 'bat', 'machete'];   // Cola & Mints is a boss trophy
const WEAPON_DROPS_LATE = [...WEAPON_DROPS, 'assault_rifle', 'hunting_rifle'];
const POINTS: Record<ZombieType, number> = { walker: 10, runner: 15, brute: 30, crawler: 12, bloater: 25, drone: 6, honeypot: 18, grub: 3, burrow: 30, egg: 8 };
const gates = [0.2, 0.5, 0.8].flatMap(t => [
  { x: ARENA.x + ARENA.w * t, y: ARENA.y + 80, horizontal: true },
  { x: ARENA.x + ARENA.w * t, y: ARENA.y + ARENA.h - 80, horizontal: true },
  { x: ARENA.x + 80, y: ARENA.y + ARENA.h * t, horizontal: false },
  { x: ARENA.x + ARENA.w - 80, y: ARENA.y + ARENA.h * t, horizontal: false },
]);

function readBest(): number {
  try {
    const value = Number(localStorage.getItem(BEST_KEY));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch { return 0; }
}
function saveBest(state: GameState) {
  const a = state.arcade!;
  a.best = Math.max(a.best, a.score);
  try { localStorage.setItem(BEST_KEY, String(Math.max(a.best, readBest()))); } catch { /* Storage is optional. */ }
}

function arena(state: GameState) {
  const { x, y, w, h } = ARENA;
  const visualSeed = () => Math.floor(rand(state) * 0x100000000);
  for (const rect of [
    { x, y, w, h: BORDER }, { x, y: y + h - BORDER, w, h: BORDER },
    { x, y: y + BORDER, w: BORDER, h: h - BORDER * 2 },
    { x: x + w - BORDER, y: y + BORDER, w: BORDER, h: h - BORDER * 2 },
  ]) phys.addSolid(state, { ...rect, kind: 'wall', sub: 'concrete', vseed: visualSeed() });

  // Leave a clear edge lane for gates, a central spawn area, and space between props.
  const props: [SolidKind, string, number, number][] = [
    ['car', 'sedan', 96, 48], ['car', 'van', 110, 52], ['car', 'pickup', 104, 50], ['car', 'police', 96, 48],
    ['furniture', 'crate', 48, 48], ['furniture', 'barrel', 32, 32], ['furniture', 'mcrate', 50, 50],
    ['wall', 'concrete', 150, 28],
  ];
  for (let i = 0; i < 13; i++) {   // props (was 40; thinned out for more open fighting space)
    const [kind, sub, width, height] = props[i % props.length];
    const orient = rand(state) < 0.5 ? 0 : 1;
    const pw = orient ? height : width, ph = orient ? width : height;
    for (let attempt = 0; attempt < 100; attempt++) {
      const px = x + 200 + rand(state) * (w - 400 - pw);
      const py = y + 200 + rand(state) * (h - 400 - ph);
      if (Math.hypot(px + pw / 2 - state.spawnPoint.x, py + ph / 2 - state.spawnPoint.y) < 300 + Math.hypot(pw, ph) / 2) continue;
      if (state.grid.query(px - 70, py - 70, pw + 140, ph + 140).length) continue;
      phys.addSolid(state, { x: px, y: py, w: pw, h: ph, kind, sub, orient, vseed: visualSeed(), breakable: true });
      break;
    }
  }
  state.decor.push({ x: x + BORDER, y: y + BORDER, w: w - 2 * BORDER, h: h - 2 * BORDER, kind: 'lot', sub: 'asphalt', vseed: visualSeed() });
  for (let i = 0; i < 65; i++) {
    const kind = i % 3 === 0 ? 'blood' : 'debris';
    state.decor.push({ x: x + 80 + rand(state) * (w - 160), y: y + 80 + rand(state) * (h - 160),
      w: 12 + rand(state) * 22, h: 10 + rand(state) * 18, kind, sub: kind, vseed: visualSeed(), angle: rand(state) * Math.PI * 2 });
  }
}

/** Zombie health multiplier: +12% per wave, compounding 3.5% (wave 5 = 1.7x, 10 = 2.8x, 20 = 6.3x). */
export const waveHp = (wave: number) => (1 + 0.12 * (wave - 1)) * 1.035 ** (wave - 1);
/** Zombie speed multiplier: +3.5% per wave, capped at +55% (reached at wave 17). */
export const waveSpeed = (wave: number) => 1 + Math.min(0.55, 0.035 * (wave - 1));
/** Knockback resistance: none through wave 40, then +2% per wave, capped at 90% (wave 60 = 40%, 80 = 80%, 85+ = 90%).
 *  Late runs with saw blades, drones and the mints can otherwise hold the whole arena in place from one spot. */
export const KNOCK_RES_WAVE = 40;
export const waveKnockRes = (wave: number) => Math.min(0.9, Math.max(0, 0.02 * (wave - KNOCK_RES_WAVE)));
function beginWave(state: GameState) {
  const a = state.arcade!;
  a.wave++; a.toSpawn = 6 + (a.wave - 1) * 4; a.spawnTimer = 0; a.intermission = 0;
  bosses.clearFx(state);
  if (a.wave === KNOCK_RES_WAVE + 1) toast(state, 'The dead are getting harder to push around', '#ffb43a');
  // every 10th wave: a boss plus a lighter escort
  a.bossDue = bosses.isBossWave(a.wave);
  if (a.bossDue) a.toSpawn = Math.ceil(a.toSpawn * 0.5);
  toast(state, a.bossDue ? `WAVE ${a.wave}: BOSS WAVE` : `WAVE ${a.wave}`, a.bossDue ? '#ff6a4a' : undefined); sound(state, 'waveStart');
}
function chooseType(state: GameState): ZombieType {
  const wave = state.arcade!.wave, roll = rand(state);
  let chance = wave >= 5 ? Math.min(0.25, 0.12 + (wave - 5) * 0.01) : 0;
  if (roll < chance) return 'brute';
  chance += wave >= 3 ? Math.min(0.4, 0.25 + (wave - 3) * 0.015) : 0;
  if (roll < chance) return 'runner';
  chance += wave >= 7 ? 0.1 : 0;
  if (roll < chance) return 'crawler';
  chance += wave >= 9 ? 0.08 : 0;
  return roll < chance ? 'bloater' : 'walker';
}
function chase(state: GameState, z: Zombie) {
  z.state = 'chase'; z.target = { x: state.player.x, y: state.player.y };
  // Keep shared survival sight checks from turning arena enemies into investigators.
  z.memory = 8; z.seesPlayer = true; z.losTimer = 1;
}
function waves(state: GameState, dt: number) {
  const a = state.arcade!;
  if (a.intermission > 0) {
    a.intermission = Math.max(0, a.intermission - dt);
    if (a.intermission <= 1e-8) beginWave(state);
    return;
  }
  const alive = state.zombies.filter(z => !z.dead).length;
  if (a.bossDue) spawnBossAtGate(state);
  if (a.toSpawn === 0 && alive === 0 && !a.bossDue) { a.intermission = 5; toast(state, `WAVE ${a.wave} CLEARED`); return; }
  a.spawnTimer = Math.max(0, a.spawnTimer - dt);
  if (a.toSpawn <= 0 || a.spawnTimer > 0 || alive >= 60) return;
  const type = chooseType(state), r = zombies.TYPES[type].r;
  const start = Math.floor(rand(state) * gates.length);
  for (let i = 0; i < gates.length; i++) {
    const gate = gates[(start + i) % gates.length], offset = (rand(state) - 0.5) * 140;
    const x = gate.x + (gate.horizontal ? offset : 0), y = gate.y + (gate.horizontal ? 0 : offset);
    if (Math.hypot(x - state.player.x, y - state.player.y) <= VIEW_RADIUS + r || !phys.isFree(state, x, y, r + 2)) continue;
    if (state.zombies.some(z => !z.dead && Math.hypot(x - z.x, y - z.y) < r + z.r + 4)) continue;
    const z = zombies.spawn(state, type, x, y);
    z.hp = z.maxHp = Math.round(z.maxHp * waveHp(a.wave));
    z.speed *= waveSpeed(a.wave);
    if (waveKnockRes(a.wave) > 0) z.knockRes = waveKnockRes(a.wave);
    chase(state, z);
    a.toSpawn--; a.spawnTimer = 0.6 / (1 + Math.min(1, (a.wave - 1) * 0.035));
    return;
  }
}

/** Bring the boss in through the gate farthest from the player. */
function spawnBossAtGate(state: GameState) {
  const a = state.arcade!, p = state.player, def = bosses.BOSSES[bosses.bossFor(a.wave).id];
  const order = gates.slice().sort((g, h) => Math.hypot(h.x - p.x, h.y - p.y) - Math.hypot(g.x - p.x, g.y - p.y));
  for (const g of order) {
    // step inward from the gate until there is room for the big body
    for (let k = 0; k < 6; k++) {
      const x = g.x + (g.horizontal ? 0 : (g.x < ARENA.x + ARENA.w / 2 ? 1 : -1) * k * 30);
      const y = g.y + (g.horizontal ? (g.y < ARENA.y + ARENA.h / 2 ? 1 : -1) * k * 30 : 0);
      if (!phys.isFree(state, x, y, def.r + 2)) continue;
      const z = bosses.spawnBoss(state, a.wave, x, y, waveHp(a.wave));
      chase(state, z);
      a.bossDue = false;
      return;
    }
  }
}
/** Per-tick augment effects: regeneration, and the Second Wind shockwave. */
function augmentTick(state: GameState, dt: number) {
  const a = state.arcade!, aug = a.run?.aug, p = state.player;
  if (!aug || p.dead) return;
  if (aug.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + aug.regen * dt);
  if (a.reviveNova) {
    a.reviveNova = false;
    for (const z of state.zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d < 260) zombies.damage(state, z, bosses.isBoss(z) ? 200 : 400, Math.atan2(z.y - p.y, z.x - p.x), { explosion: true, source: 'player' });
    }
    state.shake = Math.max(state.shake, 18);
  }
}
/** Testing panel: spawn the next boss in the rotation near the player (arcade only). */
let devBossN = 0;
export function devBoss(state: GameState) {
  if (state.mode !== 'arcade' || !state.arcade) return null;
  const n = devBossN++ % bosses.BOSS_IDS.length, wave = (n + 1) * bosses.BOSS_EVERY, p = state.player;
  for (let i = 0; i < 24; i++) {
    const a = i * 0.9, x = p.x + Math.cos(a) * 420, y = p.y + Math.sin(a) * 420;
    if (!phys.isFree(state, x, y, 50)) continue;
    const z = bosses.spawnBoss(state, wave, x, y, waveHp(Math.max(1, state.arcade.wave)));
    chase(state, z);
    return z;
  }
  return null;
}
function bossLoot(state: GameState, z: Zombie) {
  const a = state.arcade!;
  a.score += 250 * a.wave; a.bossKills = (a.bossKills ?? 0) + 1;
  for (let i = 0; i < 24; i++) upgrades.dropXp(state, { ...z, type: 'brute' } as Zombie);
  // the boss's signature weapon + its ammo, and a free upgrade card (the arcade's skill point)
  const loot: Stack[] = [...(bosses.isBoss(z) ? bosses.trophyLoot(z.boss) : []), { id: 'bandage', qty: 3 }, { id: 'bandage', qty: 3 }];
  upgrades.freePicks(state, 1);
  loot.forEach((stack, i) => {
    const ang = i * 2.1;
    state.drops.push({ id: `arcade-boss-${z.id}-${i}`, x: z.x + Math.cos(ang) * 30, y: z.y + Math.sin(ang) * 30, r: 12, kind: 'loot', life: 40, inv: { size: 1, slots: [stack] } });
  });
  bosses.onBossDeath(state, z, waveHp(a.wave));
}
function rewardKills(state: GameState, actors: Zombie[]) {
  const a = state.arcade!, oldBest = a.best;
  for (const z of actors) {
    if (!z.dead || z._arcadeScored) continue;
    z._arcadeScored = true;
    if (bosses.isBoss(z)) { bossLoot(state, z); continue; }
    a.score += POINTS[z.type] * Math.max(1, a.wave);
    upgrades.dropXp(state, z);
    if (rand(state) >= 0.18 * (1 + (a.run?.aug?.luck ?? 0))) continue;
    const roll = rand(state);
    let stack: Stack;
    if (roll < 0.45) {
      stack = randomAmmoDrop(state, 1.5 * (1 + 0.25 * (a.run?.aug?.ammo ?? 0)));
    } else if (roll < 0.8) stack = { id: 'bandage', qty: 2 };
    else {
      const pool = a.wave >= 4 ? WEAPON_DROPS_LATE : WEAPON_DROPS;
      const id = pool[Math.floor((roll - 0.8) / 0.2 * pool.length)] ?? pool[0];
      stack = { id, qty: 1, mag: combat.WEAPONS[id].magSize };
    }
    // Zombie IDs are per-state, unlike the survival loot factory's wall-clock IDs.
    state.drops.push({ id: `arcade-${z.id}`, x: z.x, y: z.y, r: 12, kind: 'loot', life: 20, inv: { size: 1, slots: [stack] } });
  }
  if (a.score > oldBest) saveBest(state);
}
function pickups(state: GameState, dt: number) {
  const p = state.player;
  state.drops = state.drops.filter(drop => {
    drop.life -= dt;
    const stack = drop.inv.slots[0];
    if (drop.life <= 0 || !stack) return false;
    if (drop.kind !== 'loot' || Math.hypot(p.x - drop.x, p.y - drop.y) > p.r + drop.r || !phys.canReach(state, p.x, p.y, drop)) return true;
    const item = ITEMS[stack.id];
    if (item?.type === 'consumable' && item.use?.heal) {
      p.hp = Math.min(p.maxHp, p.hp + item.use.heal * stack.qty);
    } else if (item?.type === 'ammo') {
      const left = inv.add(p.inv, stack.id, stack.qty);
      if (left === stack.qty) return true;
      stack.qty = left;
    } else if (item?.type === 'weapon' && combat.WEAPONS[stack.id]) {
      sound(state, 'pickup'); toast(state, collectWeapon(state, stack.id));
      return false;
    } else return true;
    sound(state, 'pickup'); toast(state, item.name);
    return item.type === 'ammo' && stack.qty > 0;
  });
}

// ---- armory: picked-up weapons never replace what you're holding
const ARMORY_SLOTS = ['primary', 'secondary', 'melee'] as const;
export const ARMORY_MAX = 12;
/** Every weapon the player owns this run: equipped ones first, then the armory. */
function owned(state: GameState) {
  const e = state.player.inv.equip;
  return [...ARMORY_SLOTS.map(k => e[k]).filter((x): x is Stack => !!x), ...(state.arcade!.armory ??= [])];
}
/** Pick up a weapon. A copy of one you own levels it up (max 5); a new one fills an empty slot or goes to the armory.
 *  Either way you get two magazines of its ammo. Returns the toast text. */
export function collectWeapon(state: GameState, id: string) {
  const p = state.player, a = state.arcade!, def = combat.WEAPONS[id], name = ITEMS[id]?.name ?? id;
  if (def.ammo) inv.add(p.inv, def.ammo, def.reloadAll ? 5 : def.magSize * 2);
  const have = owned(state).find(x => x.id === id);
  if (have) {
    const lvl = inv.gearLevel(have);
    if (lvl >= inv.GEAR_MAX) return `${name} (max level): +ammo`;
    have.lvl = lvl + 1;
    return `${name} upgraded to level ${lvl + 1}`;
  }
  const slot = ITEMS[id].slot as typeof ARMORY_SLOTS[number];
  const stack: Stack = { id, qty: 1, mag: def.magSize };
  if (!p.inv.equip[slot]) { p.inv.equip[slot] = stack; return `${name} equipped (${slot})`; }
  const box = a.armory ??= [];
  if (box.length >= ARMORY_MAX) box.shift();
  box.push(stack);
  return `${name} added to armory: press I to equip`;
}
/** Swap armory weapon i into its slot; the weapon it replaces goes back into the armory. */
export function armoryEquip(state: GameState, i: number) {
  const box = state.arcade?.armory, st = box?.[i], p = state.player;
  if (!box || !st || !combat.WEAPONS[st.id]) return false;
  const slot = ITEMS[st.id].slot as typeof ARMORY_SLOTS[number];
  const old = p.inv.equip[slot];
  p.inv.equip[slot] = st;
  if (old) box[i] = old; else box.splice(i, 1);
  if (p.active === slot) { p.reloadTimer = p.reloadTotal = 0; (p as { reloadStack?: unknown }).reloadStack = null; p.burstQueue = 0; }
  sound(state, 'pickup');
  return true;
}
/** Open / close the armory (pauses the run while open). */
export function toggleArmory(state: GameState) {
  if (state.mode !== 'arcade' || state.screen !== 'playing') return;
  if (state.ui === 'armory') state.ui = null;
  else if (state.ui === null) state.ui = 'armory';
}
function died(state: GameState) {
  const p = state.player;
  // Shared player.damage/update normally emits this; handle externally set hp too.
  if (!p.dead) { p.dead = true; emit(state, { t: 'playerDied' }); }
  p.hp = 0; p.vx = p.vy = 0;
  state.screen = 'dead'; state.stats.deaths++;
  state.interact = null; state.search = null;
  saveBest(state);
  const cores = augments.bankRun(state);
  toast(state, `GAME OVER - SCORE ${state.arcade!.score}` + (cores ? ` · +${cores} CORES` : '')); sound(state, 'gameOver');
}

export function newArcade(seed?: number, aug: augments.AugBonus = augments.bonuses(augments.load())): GameState {
  const state = newState(seed === undefined ? hash(String(Date.now())) : seed, 'arcade');
  state.spawnPoint = { x: ARENA.x + ARENA.w / 2, y: ARENA.y + ARENA.h / 2 };
  arena(state);
  const p = state.player = player.create(state.spawnPoint.x, state.spawnPoint.y);
  inv.bind(state);
  p.inv.equip.secondary = { id: 'pistol', qty: 1, mag: combat.WEAPONS.pistol.magSize };
  p.inv.equip.melee = { id: 'knife', qty: 1 };
  inv.add(p.inv, combat.WEAPONS.pistol.ammo!, Math.round(120 * (1 + 0.5 * aug.ammo)));
  const run = upgrades.newRun();
  run.aug = aug; run.rerolls = aug.rerolls; run.revives = aug.revive;
  state.arcade = { wave: 0, score: 0, toSpawn: 0, spawnTimer: 0, intermission: 0, best: readBest(), run, armory: [], bossKills: 0 };
  // augments that change the starting state
  p.speed *= 1 + aug.speed;
  p.maxHp = p.hp = 100 + aug.hp;
  if (aug.kit >= 1) {
    const id = rand(state) < 0.5 ? 'smg' : 'shotgun', def = combat.WEAPONS[id];
    p.inv.equip.primary = { id, qty: 1, mag: def.magSize };
    inv.add(p.inv, def.ammo!, Math.round(def.magSize * 3 * (1 + 0.5 * aug.ammo)));
  }
  if (aug.kit >= 2) { state.arcade.armory!.push(p.inv.equip.melee!); p.inv.equip.melee = { id: 'bat', qty: 1 }; }
  beginWave(state); snapshotInterp(state);
  if (aug.headstart > 0) upgrades.freePicks(state, aug.headstart);
  return state;
}

export function stepArcade(state: GameState, input: InputState, dt: number): void {
  if (state.screen !== 'playing' || state.paused || state.ui !== null) return;
  if (!Number.isFinite(dt) || dt <= 0) return;
  snapshotInterp(state); state.tick++;
  // Keep references through zombies.update's dead-actor compaction. Never consume FX events.
  const actors = state.zombies.slice();
  if (state.player.dead || state.player.hp <= 0) { rewardKills(state, actors); died(state); return; }
  state.time += dt;
  player.update(state, input, dt);
  upgrades.syncPlayer(state);
  combat.update(state, input, dt);
  upgrades.gunBuffs(state);
  if (!state.player.dead) {
    for (const z of state.zombies) if (!z.dead) chase(state, z);
    zombies.update(state, dt);
  }
  upgrades.update(state, dt);
  if (!state.player.dead) bosses.update(state, dt, waveHp(state.arcade!.wave));
  augmentTick(state, dt);
  rewardKills(state, actors);
  if (state.player.dead) died(state);
  else { pickups(state, dt); upgrades.pickups(state, dt); waves(state, dt); }
  state.shake = state.shake > 0.1 ? state.shake * Math.exp(-10 * dt) : 0;
}
