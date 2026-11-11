// augments.ts — arcade meta-progression: permanent upgrades bought with cores earned from runs.
// The tree is data (AUGS); `bonuses()` turns owned levels into numbers the run reads (state.arcade.run.aug).
// Persistence is localStorage only (per browser), wrapped so a blocked storage never breaks the game.
import type { GameState } from './types';

export type AugBranch = 'offense' | 'defense' | 'mobility' | 'arsenal' | 'fortune';
export interface AugDef {
  id: string; name: string; branch: AugBranch; max: number;
  /** cost of the first level; each further level costs +60% of this */
  base: number;
  /** another augment that must be at least level 1 first */
  req?: string;
  /** what one level gives, and the total at level n */
  per: string; total: (n: number) => string;
}
export const BRANCHES: { id: AugBranch; name: string; color: string; desc: string }[] = [
  { id: 'offense', name: 'OFFENSE', color: '#ff6a4a', desc: 'Hit harder, shoot faster' },
  { id: 'defense', name: 'DEFENSE', color: '#5fb0ff', desc: 'Take more punishment' },
  { id: 'mobility', name: 'MOBILITY', color: '#8cff9a', desc: 'Move and collect' },
  { id: 'arsenal', name: 'ARSENAL', color: '#ffcf4a', desc: 'Start strong, find more' },
  { id: 'fortune', name: 'FORTUNE', color: '#d77cff', desc: 'Level up and earn faster' },
];
const pc = (v: number) => `${Math.round(v * 100)}%`;
export const AUGS: AugDef[] = [
  // offense
  { id: 'dmg', name: 'Hollow Core', branch: 'offense', max: 5, base: 20, per: '+6% weapon damage', total: n => `+${pc(0.06 * n)} weapon damage` },
  { id: 'rate', name: 'Trigger Discipline', branch: 'offense', max: 5, base: 25, req: 'dmg', per: '+5% fire rate', total: n => `+${pc(0.05 * n)} fire rate` },
  { id: 'reload', name: 'Speed Loader', branch: 'offense', max: 3, base: 20, req: 'dmg', per: '10% faster reloads', total: n => `${pc(0.1 * n)} faster reloads` },
  { id: 'overclock', name: 'Overclock', branch: 'offense', max: 3, base: 50, req: 'rate', per: 'gadgets: -6% cooldown, +8% area', total: n => `gadgets: -${pc(0.06 * n)} cooldown, +${pc(0.08 * n)} area` },
  { id: 'boss', name: 'Giant Slayer', branch: 'offense', max: 5, base: 40, req: 'rate', per: '+12% damage to bosses', total: n => `+${pc(0.12 * n)} damage to bosses` },
  // defense
  { id: 'hp', name: 'Thick Skin', branch: 'defense', max: 5, base: 20, per: '+15 max HP', total: n => `+${15 * n} max HP` },
  { id: 'plate', name: 'Bone Plating', branch: 'defense', max: 5, base: 30, req: 'hp', per: '-4% damage taken', total: n => `-${pc(0.04 * n)} damage taken` },
  { id: 'regen', name: 'Regeneration', branch: 'defense', max: 3, base: 40, req: 'hp', per: '+0.4 HP per second', total: n => `+${(0.4 * n).toFixed(1)} HP per second` },
  { id: 'revive', name: 'Second Wind', branch: 'defense', max: 1, base: 300, req: 'plate', per: 'once per run, survive a killing blow at 50% HP', total: () => 'once per run, survive a killing blow at 50% HP' },
  // mobility
  { id: 'speed', name: 'Fleet Foot', branch: 'mobility', max: 5, base: 20, per: '+4% move speed', total: n => `+${pc(0.04 * n)} move speed` },
  { id: 'magnet', name: 'Scavenger', branch: 'mobility', max: 3, base: 20, req: 'speed', per: '+25% XP pickup range', total: n => `+${pc(0.25 * n)} XP pickup range` },
  { id: 'dash', name: 'Iron Lungs', branch: 'mobility', max: 3, base: 35, req: 'speed', per: '+5% sprint speed', total: n => `+${pc(0.05 * n)} sprint speed` },
  // arsenal
  { id: 'ammo', name: 'Deep Pockets', branch: 'arsenal', max: 3, base: 15, per: '+50% starting ammo, +25% ammo pickups', total: n => `+${pc(0.5 * n)} starting ammo, +${pc(0.25 * n)} ammo pickups` },
  { id: 'luck', name: 'Lucky Finds', branch: 'arsenal', max: 5, base: 25, req: 'ammo', per: '+10% chance zombies drop loot', total: n => `+${pc(0.1 * n)} loot drop chance` },
  { id: 'kit', name: 'Field Kit', branch: 'arsenal', max: 2, base: 80, req: 'ammo', per: 'start with an SMG or shotgun; level 2 adds a bat', total: n => n >= 2 ? 'start with an SMG or shotgun, and a bat' : 'start with an SMG or shotgun' },
  // fortune
  { id: 'xp', name: 'Quick Study', branch: 'fortune', max: 5, base: 25, per: '+6% XP', total: n => `+${pc(0.06 * n)} XP` },
  { id: 'headstart', name: 'Head Start', branch: 'fortune', max: 2, base: 60, req: 'xp', per: 'one free card pick at the start of a run', total: n => `${n} free card pick${n > 1 ? 's' : ''} at the start of a run` },
  { id: 'reroll', name: 'Second Opinion', branch: 'fortune', max: 3, base: 60, req: 'xp', per: '+1 card reroll per run', total: n => `${n} card reroll${n > 1 ? 's' : ''} per run` },
  { id: 'choice', name: 'Wider Options', branch: 'fortune', max: 1, base: 250, req: 'headstart', per: '4 cards to choose from on every level-up', total: () => '4 cards to choose from on every level-up' },
  { id: 'cores', name: 'Core Harvester', branch: 'fortune', max: 5, base: 30, req: 'xp', per: '+10% cores earned', total: n => `+${pc(0.1 * n)} cores earned` },
];
export const AUG = Object.fromEntries(AUGS.map(a => [a.id, a])) as Record<string, AugDef>;

export interface Meta { cores: number; earned: number; lv: Record<string, number> }
const KEY = 'deadzone_arcade_augments';

export function load(): Meta {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      const lv: Record<string, number> = {};
      for (const a of AUGS) { const n = Math.floor(Number(raw.lv?.[a.id]) || 0); if (n > 0) lv[a.id] = Math.min(a.max, n); }
      return { cores: Math.max(0, Math.floor(Number(raw.cores) || 0)), earned: Math.max(0, Math.floor(Number(raw.earned) || 0)), lv };
    }
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { cores: 0, earned: 0, lv: {} };
}
export function save(m: Meta) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* optional */ } }

export const level = (m: Meta, id: string) => m.lv[id] ?? 0;
/** Cost to buy the next level of `id` (null when maxed). */
export function cost(m: Meta, id: string) {
  const a = AUG[id], n = level(m, id);
  return !a || n >= a.max ? null : Math.round(a.base * (1 + 0.6 * n));
}
export const unlocked = (m: Meta, id: string) => !AUG[id]?.req || level(m, AUG[id].req!) > 0;
export function canBuy(m: Meta, id: string) { const c = cost(m, id); return c !== null && unlocked(m, id) && m.cores >= c; }
export function buy(m: Meta, id: string) {
  if (!canBuy(m, id)) return false;
  m.cores -= cost(m, id)!; m.lv[id] = level(m, id) + 1; save(m);
  return true;
}
/** Total cores spent so far. */
export function spent(m: Meta) {
  let t = 0;
  for (const a of AUGS) for (let i = 0; i < level(m, a.id); i++) t += Math.round(a.base * (1 + 0.6 * i));
  return t;
}
/** Refund every augment. */
export function respec(m: Meta) { m.cores += spent(m); m.lv = {}; save(m); }

/** Numbers a run reads (all 0 = no augments). */
export function bonuses(m: Meta) {
  const L = (id: string) => level(m, id);
  return {
    dmg: 0.06 * L('dmg'), rate: 0.05 * L('rate'), reload: 0.1 * L('reload'),
    gadgetCd: 0.06 * L('overclock'), gadgetArea: 0.08 * L('overclock'), boss: 0.12 * L('boss'),
    hp: 15 * L('hp'), dr: 0.04 * L('plate'), regen: 0.4 * L('regen'), revive: L('revive'),
    speed: 0.04 * L('speed'), magnet: 0.25 * L('magnet'), sprint: 0.05 * L('dash'),
    ammo: L('ammo'), luck: 0.1 * L('luck'), kit: L('kit'),
    xp: 0.06 * L('xp'), headstart: L('headstart'), rerolls: L('reroll'), choice: L('choice'), cores: 0.1 * L('cores'),
  };
}
export type AugBonus = ReturnType<typeof bonuses>;

/** Cores a finished run is worth: waves cleared, score, and bosses killed. */
export function coresFor(state: GameState) {
  const a = state.arcade; if (!a) return 0;
  const cleared = Math.max(0, a.wave - 1), bossKills = a.bossKills ?? 0;
  const raw = 2 * cleared + 0.15 * cleared * cleared + Math.floor(a.score / 600) + 25 * bossKills;
  return Math.floor(raw * (1 + (a.run?.aug?.cores ?? 0)));
}
/** Bank a finished run's cores (once). Returns the amount added. */
export function bankRun(state: GameState) {
  const a = state.arcade; if (!a || a.coresBanked) return 0;
  const n = coresFor(state);
  a.coresBanked = true; a.coresEarned = n;
  if (n > 0) { const m = load(); m.cores += n; m.earned += n; save(m); }
  return n;
}
