// hive-kit.ts — The Hive Below: what goes down the rope with you, and what waits in the lockbox.
// The way into the hive is a rope. It takes you and what is on your belt: the sidearm, the blade, what you are
// wearing, 300 rounds and half your bandages. Everything else stays with Mara at the dam (she needs the long guns
// to hold it) for the whole of the hive: the cells are fought with what the hive gives you. The lockbox is handed
// back at the very end, on the dam wall, once the rift is shut. Pure inventory code: sim/road.ts decides when.
import type { EquipKey, GameState, Inventory, Stack } from './types';
import { ITEMS } from './items';
import { WEAPONS } from './combat';
import * as inv from './inventory';

/** Rounds for the sidearm that go down with you. Short of that, Mara makes up the difference from the dam's stores. */
export const SIDEARM_ROUNDS = 300;
/** The lockbox always has room to swap things in. */
export const LOCKBOX_SLOTS = 60;
/** What came out of the hive stays with you: it is no use to anyone holding a dam. */
const OF_HIVE = new Set(['formic_sprayer', 'mandible_shears', 'ichor', 'royal_jelly']);
/** Worn slots that go down the rope. The primary is the one that does not. */
export const BELT: readonly EquipKey[] = ['secondary', 'melee', 'head', 'body', 'back'];

/** The handgun you kept: the one in the holster, or the one in the pack when an insect sidearm has taken its place. */
function handgun(state: GameState) {
  const pi = state.player.inv, bullets = (st: Stack | null) => !!st && ITEMS[st.id]?.slot === 'secondary' && !!WEAPONS[st.id]?.ammo?.startsWith('ammo_');
  const st = bullets(pi.equip.secondary) ? pi.equip.secondary : pi.slots.find(bullets) ?? null;
  return st ? WEAPONS[st.id] : null;
}
/** The ammunition of that handgun (9mm when you have none). */
export function sidearmAmmo(state: GameState): string { return handgun(state)?.ammo || 'ammo_9mm'; }
/** A kill's ammunition drop while your kit is with Mara: a magazine and a bit for the handgun. */
export function sidearmDrop(state: GameState): Stack { const w = handgun(state) ?? WEAPONS.pistol; return { id: w.ammo || 'ammo_9mm', qty: Math.ceil(w.magSize * 1.2) }; }

/** A cache written as 9mm pistol rounds, as rounds for the handgun you carry: the same number of magazines. */
export function sidearmRounds(state: GameState, pistolRounds: number): number {
  const mag = handgun(state)?.magSize || WEAPONS.pistol.magSize;
  return Math.max(1, Math.round(pistolRounds * mag / WEAPONS.pistol.magSize));
}

/** Strip the player down to the belt and return the lockbox holding everything else (and `also`: what lay on the ground). */
export function handOver(state: GameState, also: Stack[] = []): Inventory {
  const p = state.player, pi = p.inv, stored: Stack[] = [];
  const long = pi.equip.primary;
  if (long && !OF_HIVE.has(long.id)) { stored.push(long); pi.equip.primary = null; }
  // a sidearm: the one you wear, else the first handgun in the pack, else Mara's own
  if (!pi.equip.secondary) {
    const i = pi.slots.findIndex(st => !!st && ITEMS[st.id]?.slot === 'secondary');
    if (i >= 0) { pi.equip.secondary = pi.slots[i]; pi.slots[i] = null; }
    else pi.equip.secondary = { id: 'pistol', qty: 1, mag: WEAPONS.pistol.magSize };
  }
  const ammo = sidearmAmmo(state);
  let rounds = 0, bandages = Math.ceil(inv.count(pi, 'bandage') / 2);
  for (let i = 0; i < pi.slots.length; i++) {
    const st = pi.slots[i]; if (!st || OF_HIVE.has(st.id)) continue;
    let keep = 0;
    if (st.id === ammo) { keep = Math.min(st.qty, SIDEARM_ROUNDS - rounds); rounds += keep; }
    else if (st.id === 'bandage') { keep = Math.min(st.qty, bandages); bandages -= keep; }
    if (keep < st.qty) stored.push({ ...st, qty: st.qty - keep });
    if (keep) st.qty = keep; else pi.slots[i] = null;
  }
  inv.compact(pi);
  if (rounds < SIDEARM_ROUNDS) inv.add(pi, ammo, SIDEARM_ROUNDS - rounds);
  if (!pi.equip[p.active]) p.active = pi.equip.primary ? 'primary' : 'secondary';
  p.reloadTimer = p.reloadTotal = 0; p.burstQueue = 0;
  stored.push(...also.map(st => ({ ...st })));
  const box = inv.create(Math.max(LOCKBOX_SLOTS, stored.length + 12));
  stored.forEach((st, i) => { box.slots[i] = st; });
  inv.compact(box);
  // compacting leaves gaps: close them, so the box reads top to bottom
  const packed = box.slots.filter(Boolean); box.slots = [...packed, ...Array(box.size - packed.length).fill(null)];
  return box;
}

/** How many stacks are in the lockbox. */
export const stored = (box: Inventory | null | undefined) => box ? box.slots.reduce((n, st) => n + (st ? 1 : 0), 0) : 0;

/** One line for the briefing card: what is on your belt. */
export function carried(state: GameState): string {
  const pi = state.player.inv, name = (id: string) => ITEMS[id]?.name ?? id, ammo = sidearmAmmo(state);
  const parts = (['primary', 'secondary', 'melee'] as const).map(k => pi.equip[k]).filter(Boolean).map(st => name(st!.id));
  const rounds = inv.count(pi, ammo), bandages = inv.count(pi, 'bandage');
  if (rounds) parts.push(`${rounds} × ${name(ammo)}`);
  if (bandages) parts.push(`${bandages} bandage${bandages === 1 ? '' : 's'}`);
  return parts.join(' · ') + ' · what you are wearing';
}

/** While the kit is with Mara nothing of it comes back down: any long gun of the city that is on you (a checkpoint
 *  saved when the lockbox still came to every camp), and ammunition nothing you carry can fire, go into the box.
 *  Bandages, medkits, the handgun, blades and everything of the hive are left alone. Returns how many stacks went. */
export function sendBack(state: GameState, box: Inventory): number {
  const p = state.player, pi = p.inv, gone: Stack[] = [];
  const city = (st: Stack | null) => !!st && !OF_HIVE_GUNS.has(st.id) && ITEMS[st.id]?.type === 'weapon' && ITEMS[st.id]?.slot === 'primary';
  if (city(pi.equip.primary)) { gone.push(pi.equip.primary!); pi.equip.primary = null; }
  pi.slots.forEach((st, i) => { if (city(st)) { gone.push(st!); pi.slots[i] = null; } });
  const fired = new Set([...Object.values(pi.equip), ...pi.slots].map(st => st && WEAPONS[st.id]?.ammo).filter(Boolean) as string[]);
  pi.slots.forEach((st, i) => { if (st && st.id.startsWith('ammo_') && !fired.has(st.id)) { gone.push(st); pi.slots[i] = null; } });
  for (const st of gone) {
    let left = inv.add(box, st.id, st.qty, st);
    while (left > 0) { box.size += 6; box.slots.push(...Array(6).fill(null)); left = inv.add(box, st.id, left, st); }
  }
  if (gone.length && !pi.equip[p.active]) p.active = pi.equip.primary ? 'primary' : pi.equip.secondary ? 'secondary' : 'melee';
  return gone.length;
}
/** Every weapon of the hive (anything with an `arm`, and the two from the Warrens): these stay with you. */
const OF_HIVE_GUNS = new Set(Object.keys(WEAPONS).filter(id => WEAPONS[id].tree === 'hive'));
