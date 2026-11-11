// augments.ts — arcade meta-progression: permanent upgrades bought with cores earned from runs.
// The tree is data (AUGS); `bonuses()` turns owned levels into numbers the run reads (state.arcade.run.aug).
// Persistence is localStorage only (per browser), wrapped so a blocked storage never breaks the game.
import type { GameState, GadgetId } from './types';
import { toast } from './core';

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
  { id: 'crit', name: 'Weak-Point Scanner', branch: 'offense', max: 3, base: 45, req: 'dmg', per: '+3% weapon critical chance', total: n => `+${pc(.03*n)} weapon critical chance` },
  { id: 'stability', name: 'Gyro Grip', branch: 'offense', max: 3, base: 25, req: 'reload', per: '10% tighter gun spread', total: n => `${pc(.1*n)} tighter gun spread` },
  { id: 'velocity', name: 'Rail Booster', branch: 'offense', max: 3, base: 30, req: 'rate', per: '+15% bullet speed', total: n => `+${pc(.15*n)} bullet speed` },
  { id: 'knock', name: 'Impact Driver', branch: 'offense', max: 3, base: 30, req: 'dmg', per: '+15% melee knockback', total: n => `+${pc(.15*n)} melee knockback` },
  { id: 'duration', name: 'Slow Burn', branch: 'offense', max: 3, base: 40, req: 'overclock', per: '+10% gadget fire duration', total: n => `+${pc(.1*n)} gadget fire duration` },
  { id: 'healing', name: 'Trauma Training', branch: 'defense', max: 3, base: 25, req: 'hp', per: '+15% healing from supply pickups', total: n => `+${pc(.15*n)} supply healing` },
  { id: 'grace', name: 'Reactive Weave', branch: 'defense', max: 3, base: 45, req: 'plate', per: '+0.08s protection after taking a hit', total: n => `+${(.08*n).toFixed(2)}s hit protection` },
  { id: 'waveHeal', name: 'Breathing Room', branch: 'defense', max: 3, base: 35, req: 'healing', per: 'heal 5 HP after clearing a wave', total: n => `heal ${5*n} HP per cleared wave` },
  { id: 'killHeal', name: 'Blood Bank', branch: 'defense', max: 3, base: 65, req: 'regen', per: 'heal 0.2 HP per kill', total: n => `heal ${(.2*n).toFixed(1)} HP per kill` },
  { id: 'levelHeal', name: 'Fresh Resolve', branch: 'defense', max: 3, base: 30, req: 'healing', per: 'heal 3 HP on each XP level', total: n => `heal ${3*n} HP on each XP level` },
  { id: 'supply', name: 'Long Reach', branch: 'mobility', max: 3, base: 25, req: 'magnet', per: '+15px supply pickup radius', total: n => `+${15*n}px supply pickup radius` },
  { id: 'escape', name: 'Emergency Adrenaline', branch: 'mobility', max: 3, base: 40, req: 'dash', per: '+5% move speed below 35% HP', total: n => `+${pc(.05*n)} move speed below 35% HP` },
  { id: 'magazine', name: 'Ammo Belts', branch: 'arsenal', max: 3, base: 35, req: 'ammo', per: '+10% base magazine capacity (at least 1 round per rank)', total: n => `+${pc(.1*n)} base magazine capacity` },
  { id: 'quality', name: 'Workshop Issue', branch: 'arsenal', max: 2, base: 100, req: 'kit', per: 'starting weapons gain one gear level', total: n => `starting weapons at level ${n+1}` },
  ...(['saw','molotov','drone','coil','frag'] as GadgetId[]).map((id,i): AugDef => ({
    id: 'starter_'+id, name: ['Saw Deployment','Firebug Kit','Drone Hangar','Tesla Kit','Demolition Kit'][i],
    branch:'arsenal', max:1, base:120, req:'ammo', per:'unlock '+['Saw Blades','Molotov','Drone','Shock Coil','Frag'][i]+' as your starting gadget',
    total:()=> 'choose this gadget in your starting loadout',
  })),
  { id: 'gadgetSlot', name: 'Utility Harness', branch: 'arsenal', max: 1, base: 300, req: 'kit', per: '+1 gadget slot per run', total: () => '5 gadget slots per run' },
  { id: 'passiveSlot', name: 'Adaptive Rig', branch: 'arsenal', max: 2, base: 180, req: 'kit', per: '+1 passive slot per run', total: n => `${4+n} passive slots per run` },
  { id: 'bounty', name: 'Boss Bounty', branch: 'fortune', max: 3, base: 60, req: 'cores', per: '+5 cores per defeated boss before Core Harvester', total: n => `+${5*n} cores per defeated boss` },
  { id: 'salvage', name: 'Golden Handshake', branch: 'fortune', max: 3, base: 35, req: 'xp', per: '+20% score from bonus score cards', total: n => `+${pc(.2*n)} bonus card score` },
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

export interface Meta { cores: number; earned: number; lv: Record<string, number>; tech?: Record<string, true>; starter?: GadgetId }
const KEY = 'deadzone_arcade_augments';
const integer = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(value)))) : 0;

export function load(): Meta {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      const lv: Record<string, number> = {};
      for (const a of AUGS) { const n = integer(raw.lv?.[a.id]); if (n > 0) lv[a.id] = Math.min(a.max, n); }
      const m: Meta = { cores: integer(raw.cores), earned: integer(raw.earned), lv };
      if (raw.tech && typeof raw.tech === 'object') m.tech = Object.fromEntries(Object.entries(raw.tech).filter(([id,v]) => /^[a-z]+_[a-z0-9_]+$/.test(id) && v === true)) as Record<string,true>;
      if (['saw','molotov','drone','coil','frag'].includes(raw.starter) && lv['starter_'+raw.starter]) m.starter = raw.starter;
      return m;
    }
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { cores: 0, earned: 0, lv: {} };
}
export function save(m: Meta) { try { localStorage.setItem(KEY, JSON.stringify(m)); return true; } catch { return false; } }

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
  const next = { ...m, cores: m.cores - cost(m,id)!, lv: { ...m.lv, [id]:level(m,id)+1 } };
  if (!save(next)) return false;
  Object.assign(m,next);
  return true;
}
/** Total cores spent so far. */
export function spent(m: Meta) {
  let t = 0;
  for (const a of AUGS) for (let i = 0; i < level(m, a.id); i++) t += Math.round(a.base * (1 + 0.6 * i));
  return t;
}
/** Refund every augment. */
export function respec(m: Meta) {
  const next = { ...m, cores: m.cores + spent(m), lv: {}, starter: undefined };
  if (!save(next)) return false;
  Object.assign(m,next); return true;
}
export function selectStarter(m: Meta, id?: GadgetId) {
  if (id && !level(m,'starter_'+id)) return false;
  const next = { ...m, starter:id };
  if (!save(next)) return false;
  Object.assign(m,next); return true;
}

/** Numbers a run reads (all 0 = no augments). */
export function bonuses(m: Meta) {
  const L = (id: string) => level(m, id);
  return {
    crit:.03*L('crit'), stability:.1*L('stability'), velocity:.15*L('velocity'), knock:.15*L('knock'), duration:.1*L('duration'),
    healing:.15*L('healing'), grace:.08*L('grace'), waveHeal:5*L('waveHeal'), killHeal:.2*L('killHeal'), levelHeal:3*L('levelHeal'),
    supply:15*L('supply'), escape:.05*L('escape'), magazine:.1*L('magazine'), quality:L('quality'),
    starter:m.starter && L('starter_'+m.starter) ? m.starter : undefined, gadgetSlots:L('gadgetSlot'), passiveSlots:L('passiveSlot'),
    bounty:5*L('bounty'), salvage:.2*L('salvage'),
    dmg: 0.06 * L('dmg'), rate: 0.05 * L('rate'), reload: 0.1 * L('reload'),
    gadgetCd: 0.06 * L('overclock'), gadgetArea: 0.08 * L('overclock'), boss: 0.12 * L('boss'),
    hp: 15 * L('hp'), dr: 0.04 * L('plate'), regen: 0.4 * L('regen'), revive: L('revive'),
    speed: 0.04 * L('speed'), magnet: 0.25 * L('magnet'), sprint: 0.05 * L('dash'),
    ammo: L('ammo'), luck: 0.1 * L('luck'), kit: L('kit'),
    xp: 0.06 * L('xp'), headstart: L('headstart'), rerolls: L('reroll'), choice: L('choice'), cores: 0.1 * L('cores'),
  };
}
export type AugBonus = ReturnType<typeof bonuses>;

/** Cumulative cores earned so far: cleared waves, score milestones, and bosses. */
export function coresFor(state: GameState) {
  const a = state.arcade; if (!a) return 0;
  const cleared = Math.max(0, a.wave - (a.intermission > 0 ? 0 : 1)), bossKills = a.bossKills ?? 0;
  const raw = 2 * cleared + 0.15 * cleared * cleared + Math.floor(a.score / 600) + (25 + (a.run?.aug?.bounty ?? 0)) * bossKills;
  return Math.floor(raw * (1 + (a.run?.aug?.cores ?? 0)));
}
/** Deposit only newly earned cores. Spending changes the bank, never this run's paid total. */
export function bankProgress(state: GameState, announce = true) {
  const a = state.arcade; if (!a || a.coresBanked) return 0;
  const n = Math.max(0, coresFor(state) - (a.coresEarned ?? 0));
  if (!n) return 0; // no storage read or write on ordinary frames
  const m = load(); m.cores += n; m.earned += n;
  if (!save(m)) return 0; // retry later; never mark an unsaved payment as paid
  a.coresEarned = (a.coresEarned ?? 0) + n;
  if (announce) toast(state, '+' + n + ' CORES', '#d77cff');
  return n;
}
/** Settle any remaining earnings on death/quit, without paying previous deposits twice. */
export function bankRun(state: GameState) {
  const a = state.arcade; if (!a || a.coresBanked) return 0;
  const n = bankProgress(state, false);
  if ((a.coresEarned ?? 0) >= coresFor(state)) a.coresBanked = true;
  return n;
}
