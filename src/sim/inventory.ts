import type { GameState, Inventory, PlayerInventory, Stack, Player, EquipKey } from './types';
import { ITEMS, RECIPES, type ItemDef } from './items';
import { emit, sound } from './core';
import * as prog from './progression';
import * as loot from './loot';
import * as base from './base';

const owners = new WeakMap<Inventory, GameState>();
/** Associate inventory-only operations with their event destination. */
export function bind(state: GameState) { owners.set(state.player.inv, state); }
const equipKeys: EquipKey[] = ['primary', 'secondary', 'melee', 'head', 'body', 'back'];
const validQty = (n: number) => Number.isSafeInteger(n) && n >= 0;
const validInv = (inv: Inventory) => !!inv && Number.isInteger(inv.size) && inv.size >= 0 && Array.isArray(inv.slots);
const validIndex = (inv: Inventory, i: number) => validInv(inv) && Number.isInteger(i) && i >= 0 && i < inv.size;
const def = (id: string) => Object.hasOwn(ITEMS, id) ? ITEMS[id] : null;
const accepts = (inv: Inventory, id: string) => owners.get(inv)?.mode !== 'road' || def(id)?.type !== 'material';
/** Remove obsolete crafting supplies without shifting the remaining backpack slots. */
export function removeMaterials(inv: Inventory) {
  for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && def(inv.slots[i]!.id)?.type === 'material') inv.slots[i] = null;
}
function added(inv: Inventory, id: string, qty: number) {
  const state = owners.get(inv);
  if (state && qty > 0) emit(state, { t: 'itemAdded', id, qty });
}
function compatible(a: Stack | null, b: Stack | null) {
  if (!a || !b || a.id !== b.id) return false;
  const aa = a as unknown as Record<string, unknown>, bb = b as unknown as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every(k => k === 'qty' || aa[k] === bb[k]);
}
function resetWeapon(p: Player) { p.reloadTimer = p.reloadTotal = p.fireCooldown = p.swingTimer = 0; p.burstQueue = 0; }
function slotFor(item: ItemDef) { return item.type === 'backpack' ? 'back' : /^(weapon|armor)$/.test(item.type) ? item.slot : null; }
/** Base player backpack slots (before backpack items and Survival-tree bonuses). */
export const BASE_SLOTS = 24;
export function create(size: number): Inventory {
  size = Number.isInteger(size) && size >= 0 ? size : 0;
  return { size, slots: Array(size).fill(null) };
}
export function createPlayer(state?: GameState): PlayerInventory {
  const inv = { ...create(BASE_SLOTS), equip: Object.fromEntries(equipKeys.map(k => [k, null])) as PlayerInventory['equip'] };
  if (state) owners.set(inv, state);
  return inv;
}
export function recalcSize(state: GameState) {
  const p = state.player, inv = p?.inv;
  if (!validInv(inv)) return false;
  bind(state);
  if (state.mode === 'road') removeMaterials(inv);
  const back = inv.equip.back, item = back && def(back.id), mods = prog.playerMods(state);
  const bonus = Number.isFinite(mods.invSlots) ? Math.max(0, Math.floor(mods.invSlots)) : 0;
  const size = BASE_SLOTS + (item?.type === 'backpack' ? packSlots(back) : 0) + bonus;
  const next = create(size), overflow: Stack[] = [], quantities = new Map<Stack, number>();
  for (let i = 0; i < Math.min(size, inv.slots.length); i++) next.slots[i] = inv.slots[i] || null;
  for (let i = size; i < inv.slots.length; i++) {
    const stack = inv.slots[i]; if (!stack) continue;
    let left = stack.qty;
    for (const current of next.slots) {
      if (!current || !compatible(current, stack)) continue;
      const qty = quantities.get(current) ?? current.qty;
      const n = Math.min(left, Math.max(0, (def(stack.id)?.stack || 1) - qty));
      quantities.set(current, qty + n); left -= n;
    }
    quantities.set(stack, left);
    if (!left) continue;
    const index = next.slots.findIndex(s => !s);
    if (index >= 0) next.slots[index] = stack; else overflow.push(stack);
  }
  quantities.forEach((qty, stack) => { stack.qty = qty; });
  if (overflow.length) {
    const drop = loot.makeDrop(state, p.x, p.y, overflow);
    if (drop) { drop.inv.slots = overflow; drop.inv.size = overflow.length; }
  }
  inv.size = size; inv.slots = next.slots;
  return true;
}
export function add(inv: Inventory, id: string, qty = 1, extra?: Partial<Stack>, state?: GameState) {
  const item = def(id);
  if (!validInv(inv) || !item || !validQty(qty)) return qty;
  if (state) owners.set(inv, state);
  if (!accepts(inv, id)) return qty;
  const stack: Stack = { ...extra, id, qty: 1 };
  if (item.type === 'weapon') stack.mag = Number.isFinite(stack.mag) ? Math.max(0, Math.floor(stack.mag!)) : 0;
  let left = qty;
  for (let i = 0; i < inv.size && left; i++) {
    const current = inv.slots[i];
    if (current && item.stack > 1 && compatible(current, stack)) {
      const n = Math.min(left, Math.max(0, item.stack - current.qty)); current.qty += n; left -= n;
    }
  }
  for (let i = 0; i < inv.size && left; i++) if (!inv.slots[i]) {
    const n = Math.min(left, item.stack); inv.slots[i] = { ...stack, qty: n }; left -= n;
  }
  added(inv, id, qty - left);
  return left;
}
export function count(inv: Inventory, id: string) {
  return validInv(inv) ? inv.slots.slice(0, inv.size).reduce((n, s) => n + (s?.id === id ? s.qty : 0), 0) : 0;
}
export function remove(inv: Inventory, id: string, qty: number) {
  if (!validInv(inv) || !validQty(qty) || count(inv, id) < qty) return false;
  for (let i = 0; i < inv.size && qty; i++) {
    const s = inv.slots[i];
    if (s?.id === id) { const n = Math.min(s.qty, qty); s.qty -= n; qty -= n; if (!s.qty) inv.slots[i] = null; }
  }
  return true;
}
export function has(inv: Inventory, needs: Record<string, number>) { return !!needs && Object.keys(needs).every(id => validQty(needs[id]) && count(inv, id) >= needs[id]); }
export function moveSlot(from: Inventory, index: number, to: Inventory, target?: number | null) {
  if (!validIndex(from, index) || !validInv(to)) return false;
  const source = from.slots[index], item = source && def(source.id);
  if (!source || !item || !accepts(to, source.id)) return false;
  if (target === undefined || target === null) {
    if (from === to) return false;
    const left = add(to, source.id, source.qty, source), moved = source.qty - left;
    if (!moved) return false;
    if (left) source.qty = left; else from.slots[index] = null;
    return true;
  }
  if (!validIndex(to, target) || (from === to && index === target)) return false;
  const dest = to.slots[target];
  if (dest && item.stack > 1 && compatible(source, dest)) {
    const n = Math.min(source.qty, Math.max(0, item.stack - dest.qty)); if (!n) return false;
    dest.qty += n; source.qty -= n; if (!source.qty) from.slots[index] = null;
    if (from !== to) added(to, source.id, n);
  } else {
    if (dest && !accepts(from, dest.id)) return false;
    to.slots[target] = source; from.slots[index] = dest || null;
    if (from !== to) { added(to, source.id, source.qty); if (dest) added(from, dest.id, dest.qty); }
  }
  return true;
}
export function takeAll(from: Inventory, to: Inventory) {
  if (!validInv(from) || !validInv(to) || from === to) return false;
  let moved = false;
  for (let i = 0; i < from.size; i++) if (moveSlot(from, i, to)) moved = true;
  return moved;
}
export function equip(state: GameState, index: number) {
  const p = state.player, inv = p?.inv;
  if (!validIndex(inv, index) || !inv.equip) return false;
  bind(state);
  const stack = inv.slots[index], item = stack && def(stack.id), key = item && slotFor(item);
  if (!key || !equipKeys.includes(key)) return false;
  const previous = inv.equip[key]; inv.equip[key] = stack; inv.slots[index] = previous || null;
  if (key === 'back' && !recalcSize(state)) { inv.equip[key] = previous; inv.slots[index] = stack; return false; }
  if (item.type === 'weapon') resetWeapon(p);
  sound(state, 'pickup'); return true;
}
export function unequip(state: GameState, key: EquipKey) {
  const p = state.player, inv = p?.inv;
  if (!validInv(inv) || !inv.equip || !equipKeys.includes(key) || !inv.equip[key]) return null;
  bind(state);
  const index = inv.slots.findIndex(s => !s); if (index < 0) return null;
  const stack = inv.equip[key]; inv.slots[index] = stack; inv.equip[key] = null;
  if (key === 'back' && !recalcSize(state)) { inv.slots[index] = null; inv.equip[key] = stack; return null; }
  if (['primary', 'secondary', 'melee'].includes(key)) resetWeapon(p);
  const landed = inv.slots.includes(stack) ? inv : state.drops.map(d => d.inv).find(i => i.slots.includes(stack));
  return landed ? { inv: landed, index: landed.slots.indexOf(stack), stack } : null;
}
/** Merge stacks of the same item (and the same metadata) up to its stack limit, front to back. Slots that empty are freed.
 *  Called when a road checkpoint is restored, so a raised stack limit gives room back to a backpack saved under the old one. */
export function compact(inv: Inventory) {
  if (!validInv(inv)) return;
  for (let i = 0; i < inv.slots.length; i++) {
    const a = inv.slots[i], item = a && def(a.id);
    if (!a || !item || !(item.stack > 1)) continue;
    for (let j = i + 1; j < inv.slots.length && a.qty < item.stack; j++) {
      const b = inv.slots[j];
      if (!b || !compatible(a, b)) continue;
      const n = Math.min(b.qty, item.stack - a.qty);
      a.qty += n; b.qty -= n;
      if (b.qty <= 0) inv.slots[j] = null;
    }
  }
}
export function equippedWeapon(state: GameState) { const p = state.player; return p?.inv?.equip?.[p.active] || null; }
export function use(state: GameState, index: number) {
  const p = state.player, inv = p?.inv;
  if (!p || p.dead || !validIndex(inv, index)) return false;
  const stack = inv.slots[index], item = stack && def(stack.id);
  if (!stack || item?.type !== 'consumable' || !item.use) return false;
  const effect = item.use;
  if (effect.heal) p.hp = Math.min(p.maxHp || 100, Math.max(0, p.hp || 0) + effect.heal);
  if (effect.food) p.food = Math.min(100, Math.max(0, p.food || 0) + effect.food);
  if (effect.water) p.water = Math.min(100, Math.max(0, p.water || 0) + effect.water);
  if (effect.stamina) p.stamina = Math.min(p.maxStamina || 100, Math.max(0, p.stamina || 0) + effect.stamina);
  if (effect.stopBleed) p.bleeding = 0;
  if (effect.boost) p.jelly = Math.max(p.jelly ?? 0, effect.boost);
  if (--stack.qty <= 0) inv.slots[index] = null;
  sound(state, effect.heal ? 'pickup' : 'eat'); return true;
}
export function quickHeal(state: GameState) {
  const p = state.player;
  if (!p || !validInv(p.inv) || (p.hp >= p.maxHp && !p.bleeding)) return false;
  for (const id of ['medkit', 'royal_jelly', 'bandage', 'painkillers']) {
    if (p.hp >= p.maxHp && id !== 'bandage') continue;
    const index = p.inv.slots.findIndex(s => s?.id === id); if (index >= 0) return use(state, index);
  }
  return false;
}
export function drop(state: GameState, index: number) {
  const p = state.player, inv = p?.inv;
  if (!validIndex(inv, index) || !inv.slots[index]) return false;
  const dropped = loot.makeDrop(state, p.x, p.y, [inv.slots[index]!]);
  if (!dropped) return false;
  inv.slots[index] = null; return dropped;
}
export function canCraft(state: GameState, recipeId: string) {
  const recipe = RECIPES.find(r => r.id === recipeId), p = state.player, missing: Record<string, number> = {};
  if (!recipe || !p || !validInv(p.inv) || p.dead) return { ok: false, missing, reason: 'Unavailable recipe' };
  for (const id of Object.keys(recipe.in)) { const n = recipe.in[id] - count(p.inv, id); if (n > 0) missing[id] = n; }
  if (Object.keys(missing).length) return { ok: false, missing, reason: 'Missing materials' };
  if (recipe.station && !base.nearStation(state, recipe.station)) return { ok: false, missing, reason: 'Requires nearby ' + recipe.station };
  const next = create(p.inv.size); next.slots = p.inv.slots.map(s => s ? { ...s } : null);
  for (const id of Object.keys(recipe.in)) remove(next, id, recipe.in[id]);
  if (add(next, recipe.out.id, recipe.out.qty)) return { ok: false, missing, reason: 'Inventory full' };
  return { ok: true, missing };
}
export function craft(state: GameState, recipeId: string) {
  if (!canCraft(state, recipeId).ok) return false;
  const recipe = RECIPES.find(r => r.id === recipeId)!, inv = state.player.inv;
  bind(state);
  for (const id of Object.keys(recipe.in)) remove(inv, id, recipe.in[id]);
  add(inv, recipe.out.id, recipe.out.qty); prog.addXP(state, 3); sound(state, 'craft'); return true;
}
export function totalAmmo(state: GameState, id: string) { return count(state.player.inv, id); }

// ---- gear upgrades: spend duplicate copies of an equipped weapon / armor / backpack to level it up
export const GEAR_MAX = 5;
/** Armor: each level adds this much of the item's base armor (level 5 = +60%). */
export const GEAR_STEP = 0.15;
/** Weapons: per level, +12% damage, +4% fire rate, -5% reload time (see progression.weaponStats). */
export const WEAPON_STEP = { dmg: 0.12, rate: 0.04, reload: 0.05 };
/** Backpacks: extra inventory slots per level. */
export const PACK_STEP = 2;
export const GEAR_KEYS: readonly EquipKey[] = ['primary', 'secondary', 'melee', 'head', 'body', 'back'];
const UPGRADABLE = new Set(['weapon', 'armor', 'backpack']);
export const upgradable = (id: string) => UPGRADABLE.has(def(id)?.type ?? '');
export const gearLevel = (st: Stack | null | undefined) => Math.max(1, Math.min(GEAR_MAX, Math.floor(Number(st?.lvl) || 1)));
/** Armor value of a stack including its upgrade level. */
export function gearArmor(st: Stack | null | undefined) {
  const d = st && def(st.id);
  return d && d.armor ? d.armor * (1 + GEAR_STEP * (gearLevel(st) - 1)) : 0;
}
/** Extra inventory slots a backpack stack gives, including its upgrade level. */
export function packSlots(st: Stack | null | undefined) {
  const d = st && def(st.id);
  return d && d.type === 'backpack' ? (d.slots || 0) + PACK_STEP * (gearLevel(st) - 1) : 0;
}
/** One matching spare per upgrade at every level: four spare copies to max any piece. */
export const gearCost = (_level: number) => 1;
/** The headline stat of a piece of gear at a level (damage, armor fraction or backpack slots). */
function gearStat(state: GameState, id: string, level: number) {
  const d = def(id)!;
  if (d.type === 'weapon') return { stat: 'Damage', value: prog.weaponStats(state, id, level).damage };
  if (d.type === 'armor') return { stat: 'Armor', value: gearArmor({ id, qty: 1, lvl: level }) };
  return { stat: 'Slots', value: packSlots({ id, qty: 1, lvl: level }) };
}
/** Upgrade info for an equipped slot, or null if it can't be upgraded (empty slot). */
export function gearUpgrade(state: GameState, key: EquipKey) {
  const inv = state.player?.inv, st = inv?.equip[key], d = st && def(st.id);
  if (!inv || !st || !d || !UPGRADABLE.has(d.type)) return null;
  const level = gearLevel(st), need = level >= GEAR_MAX ? 0 : gearCost(level);
  const have = inv.slots.filter(x => x && x.id === st.id).length;
  const now = gearStat(state, st.id, level);
  return { key, id: st.id, name: d.name, type: d.type, level, max: GEAR_MAX, need, have, ok: level < GEAR_MAX && have >= need,
    stat: now.stat, value: now.value, next: level < GEAR_MAX ? gearStat(state, st.id, level + 1).value : null };
}
/** Spend spare copies (lowest-level copies first) to raise the equipped piece one level.
 *  Ammo loaded in a consumed gun goes back into the inventory. */
export function upgradeGear(state: GameState, key: EquipKey) {
  const u = gearUpgrade(state, key), inv = state.player.inv;
  if (!u || !u.ok) return false;
  const idx = inv.slots.map((x, i) => x && x.id === u.id ? i : -1).filter(i => i >= 0).sort((a, b) => gearLevel(inv.slots[a]) - gearLevel(inv.slots[b])).slice(0, u.need);
  let refund = 0;
  for (const i of idx) { refund += Math.max(0, Math.floor(Number(inv.slots[i]!.mag) || 0)); inv.slots[i] = null; }
  inv.equip[key]!.lvl = u.level + 1;
  const ammo = refund > 0 ? prog.weaponStats(state, u.id).ammo : null;
  if (ammo) {
    const left = add(inv, ammo, refund, undefined, state);
    if (left > 0) loot.makeDrop(state, state.player.x, state.player.y, [{ id: ammo, qty: left }]);
  }
  if (u.type === 'backpack') recalcSize(state);
  emit(state, { t: 'sound', name: 'build' });
  emit(state, { t: 'toast', msg: `${u.name} upgraded to level ${u.level + 1}`, color: '#c8e6a0' });
  return true;
}
export const inv = { gearUpgrade, upgradeGear, gearArmor, packSlots, upgradable, create, createPlayer, recalcSize, compact, add, count, remove, has, moveSlot, takeAll, equip, unequip, equippedWeapon, use, quickHeal, drop, canCraft, craft, totalAmmo, bind };
