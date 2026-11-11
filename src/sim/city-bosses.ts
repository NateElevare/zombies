// city-bosses.ts — story mode bosses. The city's largest buildings (warehouses, schools, the hospital, big
// offices and stores) are lairs: from day 2 each one's indoor pack is joined by one of the five arcade bosses,
// which lurks inside until it notices the player. Killing it drops its signature weapon and grants a skill
// point; the lair stays empty for good (saved in state.base.bossesKilled). Pure sim, deterministic.
import type { Building, GameState, Zombie } from './types';
import { hash, phys, toast, sound } from './core';
import * as bosses from './bosses';
import * as zombies from './zombies';
import * as prog from './progression';

/** Floor area (px^2) that makes a building a lair: about 30 of ~270 buildings. */
export const LAIR_AREA = 250_000;
/** Bosses move in on this day (the first day and night are hard enough). */
export const FIRST_DAY = 2;
/** Collision radius cap so a boss fits through a 60px doorway; it is still drawn at full size. */
const MAX_R = 26;
/** Lairs this close (to the building edge) get their boss. Matches zombies.ts PACK_RADIUS. */
const NEAR = 1500;

export const isLair = (b: Building) => b.w * b.h >= LAIR_AREA;
/** Which boss lives in a lair: fixed per world seed and building. */
export const lairBoss = (state: GameState, b: Building): bosses.BossId => {
  const sites = state.campaign ? state._campaignSites as import('./campaign-world').Sites | undefined : undefined;
  if (sites?.hospital.building === b.id) return 'plague';
  if (sites?.depot.building === b.id) return 'juggernaut';
  if (sites?.checkpoint.building === b.id) return 'butcher';
  return bosses.BOSS_IDS[hash(`${state.seed}:${b.id}`) % bosses.BOSS_IDS.length];
};
/** City bosses are tuned for a scavenger with a pistol, then grow with the days survived. */
export const hpMul = (day: number) => Math.min(1.5, 0.3 + 0.07 * (Math.max(1, day) - 1));
export const dmgMul = (day: number) => Math.min(1.3, 0.8 + 0.05 * (Math.max(1, day) - 1));

/** Lair building ids whose boss is dead (saved inside state.base, so the save format is unchanged). */
export function killed(state: GameState): string[] {
  const b = state.base;
  if (!Array.isArray(b.bossesKilled)) b.bossesKilled = [];
  else if (!b.bossesKilled.every(k => typeof k === 'string')) b.bossesKilled = b.bossesKilled.filter(k => typeof k === 'string');
  return b.bossesKilled;
}

const rectDist = (b: Building, x: number, y: number) => Math.max(Math.abs(b.x + b.w / 2 - x) - b.w / 2, Math.abs(b.y + b.h / 2 - y) - b.h / 2, 0);

/** Put a lair's boss in with its pack (called when the pack is live and the boss is not). */
function spawnIn(state: GameState, b: Building) {
  const id = lairBoss(state, b), day = state.clock.day;
  const pt = zombies.indoorPoint(state, b, MAX_R + 6);
  if (!pt) return null;
  const z = bosses.spawnBossOf(state, id, 0, pt.x, pt.y, hpMul(day), { lurk: true, maxR: MAX_R, dmgMul: dmgMul(day) });
  z.home = b.id;
  return z;
}

function reward(state: GameState, z: Zombie & { boss: bosses.BossId }) {
  const p = state.player, d = bosses.BOSSES[z.boss];
  const stacks = bosses.trophyLoot(z.boss);
  state.drops.push({ id: `boss-${z.id}`, x: z.x, y: z.y, r: 12, kind: 'loot', life: Infinity, inv: { size: stacks.length, slots: stacks } });
  if (typeof z.home === 'string' && !killed(state).includes(z.home)) killed(state).push(z.home);
  p.sp = (p.sp || 0) + 1;
  prog.addXP(state, 250 + 50 * state.clock.day);
  bosses.onBossDeath(state, z, hpMul(state.clock.day));
  toast(state, `+1 SKILL POINT · ${d.name} dropped its weapon`, '#ffcf4a');
  sound(state, 'levelUp');
}

/** Survival tick, after zombies.update: spawn lair bosses near the player, announce, reward, run their attacks. */
export function update(state: GameState, dt: number) {
  if (state.arcade || !state.player) return;
  const p = state.player, day = state.clock.day;
  // Our own list of live bosses: zombies.update drops dead zombies from state.zombies the tick they die.
  const live = (state._cityBosses ??= []) as (Zombie & { boss: bosses.BossId })[];
  for (const z of state.zombies) if (!z.dead && bosses.isBoss(z) && !live.includes(z)) live.push(z);
  for (let i = live.length - 1; i >= 0; i--) {
    const z = live[i];
    if (!z.dead && !state.zombies.includes(z)) { live.splice(i, 1); continue; }   // world was reset (load / respawn)
    if (z.dead) {
      // despawned (pack put away) bosses still have health: only real kills pay out
      if (z.hp <= 0) reward(state, z);
      live.splice(i, 1);
      continue;
    }
    if (!z.announced && z.state === 'chase' && Math.hypot(z.x - p.x, z.y - p.y) < 800) bosses.announce(state, z);
  }
  state._lairT = Number(state._lairT || 0) - dt;
  if (Number(state._lairT) <= 0 && day >= FIRST_DAY) {
    state._lairT = 0.5;
    const dead = killed(state);
    for (const b of state.buildings) {
      if (!isLair(b) || rectDist(b, p.x, p.y) > NEAR || dead.includes(b.id) || zombies.isBase(state, b)) continue;
      // the boss joins its building's indoor pack (zombies.ts packs) out of sight, never in front of the player
      let pack = false, boss = false;
      for (const z of state.zombies) if (!z.dead && z.home === b.id) { pack = true; if (bosses.isBoss(z)) boss = true; }
      if (!pack || boss || rectDist(b, p.x, p.y) === 0) continue;
      if (zombies.visible(state, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) / 2 + 60)) continue;
      spawnIn(state, b);
    }
  }
  bosses.update(state, dt, hpMul(day));
}

/** Testing panel: the next boss in the rotation, near the player and already hunting (story mode). */
let devN = 0;
export function devBoss(state: GameState) {
  if (state.arcade || !state.player) return null;
  const p = state.player, id = bosses.BOSS_IDS[devN++ % bosses.BOSS_IDS.length], day = state.clock.day;
  for (let i = 0; i < 24; i++) {
    const a = i * 0.9, x = p.x + Math.cos(a) * 320, y = p.y + Math.sin(a) * 320;
    if (!phys.isFree(state, x, y, MAX_R + 4)) continue;
    const z = bosses.spawnBossOf(state, id, 0, x, y, hpMul(day), { maxR: MAX_R, dmgMul: dmgMul(day) });
    z.home = null;
    return z;
  }
  return null;
}
