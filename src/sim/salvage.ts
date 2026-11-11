// salvage.ts — tear down world furniture and cars for building materials (build mode, X on the object).
// World solids are regenerated from the seed, so removals persist as a list of stable keys (state.salvaged)
// that save.ts writes and re-applies on load.
import type { GameState, Rect, Solid, Stack } from './types';
import { clamp, emit, phys, rand, sound, toast } from './core';
import * as inv from './inventory';
import * as loot from './loot';
import * as zombies from './zombies';
import { buildingAt } from './world';

/** [item, min, max] rolls. */
type Yield = [string, number, number][];
const WOOD: Yield = [['wood', 4, 7], ['nails', 1, 3]];
const BIG_WOOD: Yield = [['wood', 7, 11], ['nails', 2, 4]];
const SOFT: Yield = [['cloth', 3, 6], ['wood', 2, 4], ['nails', 1, 2]];
const BED: Yield = [['cloth', 4, 7], ['wood', 4, 6], ['nails', 1, 3]];
const METAL: Yield = [['scrap', 4, 7], ['nails', 0, 2]];
const APPLIANCE: Yield = [['scrap', 5, 8], ['electronics', 1, 2]];
const FIXTURE: Yield = [['scrap', 2, 4]];

const FURNITURE: Record<string, Yield> = {
  cabinet: WOOD, nightstand: WOOD, desk: WOOD, sdesk: WOOD, counter: WOOD, table: WOOD, bench: WOOD, booth: SOFT,
  shelf: WOOD, bookshelf: BIG_WOOD, wardrobe: BIG_WOOD, dresser: BIG_WOOD, crate: WOOD, pallet: [['wood', 5, 8], ['nails', 2, 4]],
  woodpile: [['wood', 10, 16]], planter: [['wood', 2, 3]], plant: [['wood', 1, 2]],
  sofa: SOFT, armchair: SOFT, bed: BED, hbed: BED, cot: [['cloth', 2, 4], ['scrap', 2, 3]], sandbag: [['cloth', 2, 4]],
  fridge: APPLIANCE, stove: APPLIANCE, tv: [['electronics', 1, 3], ['scrap', 1, 2]], cooler: [['scrap', 2, 4], ['electronics', 0, 1]],
  locker: METAL, filing: METAL, toolbox: [['scrap', 3, 5], ['nails', 2, 4]], rack: METAL, medcab: METAL, mcrate: METAL,
  safe: [['scrap', 8, 12]], guncase: [['scrap', 3, 5], ['gun_parts', 0, 1]], gunrack: [['scrap', 3, 5], ['gun_parts', 0, 1]],
  barrel: [['scrap', 3, 5], ['chemicals', 0, 1]], dumpster: [['scrap', 8, 12]],
  toilet: FIXTURE, sink: FIXTURE, tub: [['scrap', 3, 5]],
};
const CAR: Yield = [['scrap', 10, 16], ['electronics', 1, 3], ['cloth', 0, 2]];
const WRECK: Yield = [['scrap', 6, 10], ['electronics', 0, 1]];
const MILITARY: Yield = [['scrap', 14, 20], ['electronics', 2, 3], ['gun_parts', 0, 1]];
/** Not salvageable (too big / decorative landmarks). */
const NEVER = new Set(['fountain', 'statue', 'tower', 'pump', 'ship']);
const NAMES: Record<string, string> = { sdesk: 'desk', hbed: 'bed', medcab: 'medicine cabinet', mcrate: 'metal crate', filing: 'filing cabinet', tv: 'TV' };

export const REACH = 180;
const rectDist = (x: number, y: number, o: Rect) => Math.hypot(x - clamp(x, o.x, o.x + o.w), y - clamp(y, o.y, o.y + o.h));
/** Close enough to salvage: within REACH, or anywhere inside the same building as the object. */
export function inReach(state: GameState, o: Rect) {
  const p = state.player;
  if (!p) return false;
  if (rectDist(p.x, p.y, o) <= REACH) return true;
  const b = buildingAt(state, p.x, p.y);
  return !!b && buildingAt(state, o.x + o.w / 2, o.y + o.h / 2) === b;
}

/** Stable id for a world-generated solid (generation is deterministic per seed). */
export function keyOf(o: Solid) { return `${o.kind}:${Math.round(o.x)}:${Math.round(o.y)}:${Math.round(o.w)}x${Math.round(o.h)}`; }

function yieldOf(o: Solid): Yield | null {
  if(o.campaignArt)return null;
  if (o.structure) return null;
  const sub = String(o.sub || '');
  if (o.kind === 'car') return /military|humvee/.test(sub) ? MILITARY : /_wreck$/.test(sub) || (o as { wreck?: boolean }).wreck ? WRECK : CAR;
  if (o.kind !== 'furniture' || NEVER.has(sub)) return null;
  return FURNITURE[sub] ?? WOOD;
}
export function nameOf(o: Solid) {
  const sub = String(o.sub || o.kind).replace(/_wreck$/, ' wreck');
  if (o.kind === 'car') return 'car (' + sub.replace(/_/g, ' ') + ')';
  return NAMES[sub] ?? sub.replace(/_/g, ' ');
}
export function canSalvage(o: Solid | null | undefined): o is Solid { return !!o && !o.campaignArt && !!yieldOf(o); }

/** The salvageable world object under the aim point, if any. */
export function targetAt(state: GameState, x: number, y: number): Solid | null {
  let found: Solid | null = null;
  state.grid.each(x - 1, y - 1, 2, 2, (o) => {
    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h && canSalvage(o)) { found = o; return true; }
  });
  return found;
}

/** Remove a world solid (and its container) without yields. Used for salvage and when loading a save. */
function removeSolid(state: GameState, o: Solid) {
  phys.removeSolid(state, o);
  if (o.container) {
    const i = state.containers.indexOf(o.container);
    if (i >= 0) state.containers.splice(i, 1);
    if (state.interact?.target === o.container) state.interact = null;
    if (state.search?.target === o.container) state.search = null;
  }
}

/** Try to salvage o. Road stories clear props without awarding building materials. */
export function salvage(state: GameState, o: Solid): boolean {
  const p = state.player, y = yieldOf(o);
  if (!p || p.dead || !y) return false;
  if (!inReach(state, o)) { toast(state, 'Get closer to salvage that.', '#e99a67'); return false; }
  const c = o.container;
  if (c && !c.searched) { toast(state, 'Search it first (hold E), then salvage it.', '#e99a67'); return false; }
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  // anything still inside goes on the floor
  const leftovers: Stack[] = [];
  if (c?.inv) for (const s of c.inv.slots) if (s) leftovers.push({ ...s });
  const got: string[] = [];
  let full = false;
  for (const [id, lo, hi] of state.mode === 'road' ? [] : y) {
    const n = lo + Math.floor(rand(state) * (hi - lo + 1));
    if (n <= 0) continue;
    const left = inv.add(p.inv, id, n, undefined, state);
    if (left > 0) { leftovers.push({ id, qty: left }); full = true; }
    got.push(`${n} ${id.replace(/_/g, ' ')}`);
  }
  removeSolid(state, o);
  const list = ((state.salvaged as string[] | undefined) ??= []);
  list.push(keyOf(o));
  if (leftovers.length) loot.makeDrop(state, cx, cy, leftovers);
  if (full) toast(state, 'Backpack full - some materials dropped on the floor.', '#e99a67');
  toast(state, state.mode === 'road' ? `Cleared ${nameOf(o)}` : `Salvaged ${nameOf(o)}: ${got.join(', ') || 'nothing useful'}`, '#c8e6a0');
  sound(state, 'build', cx, cy);
  emit(state, { t: 'salvaged', x: o.x, y: o.y, w: o.w, h: o.h });
  // tearing things apart is loud
  zombies.noise(state, cx, cy, o.kind === 'car' ? 520 : 360);
  return true;
}

export const SMASH_HITS = 3;
/** A melee swing hit salvageable world furniture or a car. The 3rd hit tears it down for materials
 *  (an unsearched container spills its loot on the floor). Player-built structures never break this way. */
export function hitObject(state: GameState, o: Solid, x: number, y: number, angle: number) {
  if (!canSalvage(o)) return false;
  const f = o as Solid & { _hits?: number };
  f._hits = (f._hits || 0) + 1;
  const metal = o.kind === 'car' || METAL_SUBS.test(String(o.sub || ''));
  emit(state, { t: 'bulletHit', x, y, angle, surface: metal ? 'metal' : 'wood' });
  zombies.noise(state, x, y, 160);
  if (f._hits < SMASH_HITS) return false;
  const c = o.container;
  if (c && !c.searched) { loot.fill(state, c); c.searched = true; }
  return salvage(state, o);
}
const METAL_SUBS = /locker|filing|rack|medcab|mcrate|safe|guncase|gunrack|barrel|dumpster|fridge|stove|cooler|toolbox|sink|toilet|tub/;

export const FENCE_HITS = 4;
/** A bullet or melee swing hit a fence. The 4th hit knocks the whole fence section down (saved like salvage). */
export function hitFence(state: GameState, o: Solid, x: number, y: number, angle: number) {
  if (o.kind !== 'fence' || o.structure) return false;
  const f = o as Solid & { _hits?: number };
  f._hits = (f._hits || 0) + 1;
  emit(state, { t: 'bulletHit', x, y, angle, surface: o.sub === 'chainlink' ? 'metal' : 'wood' });
  if (f._hits < FENCE_HITS) return false;
  removeSolid(state, o);
  ((state.salvaged as string[] | undefined) ??= []).push(keyOf(o));
  emit(state, { t: 'salvaged', x: o.x, y: o.y, w: o.w, h: o.h });
  sound(state, 'build', x, y);
  zombies.noise(state, x, y, 260);
  return true;
}

/** Re-apply removals from a save (world was just regenerated from the seed). */
export function restore(state: GameState, keys: unknown) {
  const list = Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string').slice(0, 20000) : [];
  state.salvaged = list;
  if (!list.length) return;
  const want = new Set(list), hit: Solid[] = [];
  for (const o of state.grid.all()) if ((o.kind === 'furniture' || o.kind === 'car' || o.kind === 'fence') && !o.structure && want.has(keyOf(o))) hit.push(o);
  for (const o of hit) removeSolid(state, o);
}
