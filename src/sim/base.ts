import type { GameState, InputState, Structure, Rect, Stack, Vec, Solid } from './types';
import { WORLD, phys, uid, emit, sound, toast } from './core';
import * as inv from './inventory';
import * as loot from './loot';
import * as zombies from './zombies';
import * as game from './game';
import * as salvage from './salvage';

export interface StructureDef { name: string; cost: Record<string, number>; w: number; h: number; hp: number; solid: boolean; blocksBullets: boolean; blocksSight: boolean; desc: string; glyph: string }
export const STRUCTURES: Record<string, StructureDef> = {
  bed: { name: 'Bed', cost: { wood: 12, cloth: 8, nails: 4 }, w: 32, h: 64, hp: 120, solid: false, blocksBullets: false, blocksSight: false, desc: 'Respawn, sleep at night, and save. One bed only.', glyph: 'BED' },
  stash: { name: 'Storage stash', cost: { wood: 10, nails: 4 }, w: 32, h: 32, hp: 150, solid: true, blocksBullets: true, blocksSight: false, desc: 'Stores 24 slots of supplies.', glyph: 'BOX' },
  workbench: { name: 'Workbench', cost: { wood: 18, scrap: 10, nails: 6 }, w: 64, h: 32, hp: 220, solid: true, blocksBullets: true, blocksSight: false, desc: 'Craft advanced supplies and unlock weapon and armor technology.', glyph: 'WB' },
  wood_wall: { name: 'Wood wall', cost: { wood: 8, nails: 2 }, w: 64, h: 16, hp: 320, solid: true, blocksBullets: true, blocksSight: true, desc: 'A solid wooden defense.', glyph: 'WW' },
  metal_wall: { name: 'Metal wall', cost: { scrap: 16, nails: 4 }, w: 64, h: 16, hp: 750, solid: true, blocksBullets: true, blocksSight: true, desc: 'Heavy defense against hordes.', glyph: 'MW' },
  wood_door: { name: 'Wood door', cost: { wood: 8, scrap: 2, nails: 2 }, w: 32, h: 16, hp: 360, solid: false, blocksBullets: false, blocksSight: false, desc: 'You can pass through; zombies must break it.', glyph: 'DR' },
  barricade: { name: 'Barricade', cost: { wood: 4 }, w: 64, h: 16, hp: 90, solid: true, blocksBullets: false, blocksSight: false, desc: 'Cheap defense you can shoot over.', glyph: 'BAR' },
  spike_trap: { name: 'Spike trap', cost: { wood: 6, nails: 6 }, w: 32, h: 32, hp: 100, solid: false, blocksBullets: false, blocksSight: false, desc: 'Hurts zombies crossing it; wears down with use.', glyph: 'SPK' },
  campfire: { name: 'Campfire', cost: { wood: 8, scrap: 2 }, w: 32, h: 32, hp: 80, solid: false, blocksBullets: false, blocksSight: false, desc: 'Lights your shelter at night.', glyph: 'FIRE' },
  turret: { name: 'Turret', cost: { scrap: 24, electronics: 8, gun_parts: 6, nails: 4 }, w: 32, h: 32, hp: 260, solid: true, blocksBullets: true, blocksSight: false, desc: 'Automatic defense. Load 9mm ammo with E.', glyph: 'TUR' },
};
const types = Object.keys(STRUCTURES);
/** Build menu sections (every structure appears exactly once). */
export const BUILD_GROUPS: { name: string; items: string[] }[] = [
  { name: 'Base', items: ['bed', 'stash', 'workbench', 'campfire'] },
  { name: 'Walls & doors', items: ['wood_wall', 'metal_wall', 'wood_door', 'barricade'] },
  { name: 'Defense', items: ['spike_trap', 'turret'] },
];
export type BuildTool = 'place' | 'repair' | 'demolish';
type RuntimeStructure = Structure & { fireCooldown?: number; trapCooldown?: number };
const uiTargets = new WeakMap<GameState, Structure>();
const dims = (type: string, rot: number) => { const t = STRUCTURES[type]; return rot % 2 ? { w: t.h, h: t.w } : { w: t.w, h: t.h }; };
const snap = (n: number) => Math.floor(n / 32) * 32;
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function distance(rect: Rect, x: number, y: number) { return Math.hypot(x - Math.max(rect.x, Math.min(rect.x + rect.w, x)), y - Math.max(rect.y, Math.min(rect.y + rect.h, y))); }
const circleOverlap = (rect: Rect, e: Vec & { r: number }) => distance(rect, e.x, e.y) < e.r;
export function canAfford(state: GameState, type: string) { return !!STRUCTURES[type] && !!state.player && inv.has(state.player.inv, STRUCTURES[type].cost); }
export function canPlace(state: GameState, type: string, x: number, y: number, rot = 0) {
  if (!STRUCTURES[type] || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const rect = { x, y, ...dims(type, rot) };
  if (x < 0 || y < 0 || x + rect.w > WORLD.w || y + rect.h > WORLD.h) return false;
  if (type === 'bed' && state.structures.some(s => s.type === 'bed' && !s.dead)) return false;
  let blocked = false;
  state.grid.each(x, y, rect.w, rect.h, o => { if ((o.solid !== false || o.structure) && intersects(rect, o)) { blocked = true; return true; } });
  if (blocked || state.structures.some(s => !s.dead && intersects(rect, s))) return false;
  if (state.player && circleOverlap(rect, state.player)) return false;
  return !state.zombies.some(z => !z.dead && circleOverlap(rect, z));
}
function register(state: GameState, s: Structure) {
  const def = STRUCTURES[s.type];
  const proxy: Solid = { x: s.x, y: s.y, w: s.w, h: s.h, kind: 'structure', sub: s.type, orient: s.rot, solid: def.solid, blocksBullets: def.blocksBullets, blocksSight: def.blocksSight, structure: s };
  Object.defineProperty(s, '_solid', { value: proxy, writable: true, configurable: true, enumerable: false });
  phys.addSolid(state, proxy); state.structures.push(s);
  if (s.type === 'bed') { state.base.bed = s.id; if (state.player) state.player.spawn = { x: s.x + s.w / 2, y: s.y + s.h / 2 }; }
  return s;
}
export function place(state: GameState, type: string, x: number, y: number, rotation = 0) {
  const rot = ((Math.round(rotation) % 2 + 2) % 2) as 0 | 1;
  x = snap(x); y = snap(y);
  if (!canPlace(state, type, x, y, rot) || !canAfford(state, type)) return null;
  inv.bind(state);
  const paid: [string, number][] = [], def = STRUCTURES[type];
  for (const [id, qty] of Object.entries(def.cost)) {
    if (!inv.remove(state.player.inv, id, qty)) { for (const [id, qty] of paid) inv.add(state.player.inv, id, qty); return null; }
    paid.push([id, qty]);
  }
  const s: RuntimeStructure = { id: uid('s'), type, x, y, rot, hp: def.hp, maxHp: def.hp, hitFlash: 0, ...dims(type, rot) };
  if (type === 'stash') s.inv = inv.create(24);
  if (type === 'turret') { s.inv = inv.create(1); s.fireCooldown = 0; s.aim = 0; }
  register(state, s); sound(state, 'build'); emit(state, { t: 'structureBuilt', id: s.id, type }); return s;
}
export function restore(state: GameState, list: Structure[]) {
  const saved = (list || []).slice();
  for (const s of state.structures) if (s._solid) phys.removeSolid(state, s._solid);
  state.structures = []; state.base.bed = null;
  const ids = new Set<string>();
  for (const raw of saved) {
    if (!raw || !STRUCTURES[raw.type] || !Number.isFinite(raw.x) || !Number.isFinite(raw.y) || raw.dead || raw.hp <= 0) continue;
    if (raw.type === 'bed' && state.base.bed) continue;
    const def = STRUCTURES[raw.type], rot = ((Math.round(raw.rot || 0) % 2 + 2) % 2) as 0 | 1;
    const s: Structure = { ...raw, ...dims(raw.type, rot), rot, maxHp: def.hp, hp: Math.min(def.hp, Number.isFinite(raw.hp) ? raw.hp : def.hp), hitFlash: 0, aim: 0, dead: false };
    if (!s.id || ids.has(s.id)) s.id = uid('s'); ids.add(s.id);
    if (s.x < 0 || s.y < 0 || s.x + s.w > WORLD.w || s.y + s.h > WORLD.h) continue;
    delete s._solid;
    if (s.type === 'stash' || s.type === 'turret') {
      const size = s.type === 'stash' ? 24 : 1;
      s.inv = raw.inv && Array.isArray(raw.inv.slots) ? { size, slots: Array.from({ length: size }, (_, i) => raw.inv!.slots[i] ? { ...raw.inv!.slots[i]! } : null) } : inv.create(size);
    }
    register(state, s);
  }
}
function remove(state: GameState, s: Structure, refund: boolean) {
  if (!s || s.dead || !state.structures.includes(s)) return false;
  if (state.ui && (uiTargets.get(state) === s || state.uiTarget === s)) { state.ui = null; state.uiTarget = null; uiTargets.delete(state); }
  s.dead = true; if (s._solid) phys.removeSolid(state, s._solid);
  state.structures.splice(state.structures.indexOf(s), 1);
  if (state.base.bed === s.id) { state.base.bed = null; if (state.player) state.player.spawn = { ...state.spawnPoint }; }
  const stacks: Stack[] = s.inv ? s.inv.slots.filter((s): s is Stack => !!s).map(s => ({ ...s })) : [];
  if (s.inv) s.inv.slots = Array(s.inv.size).fill(null);
  if (refund) for (const [id, qty] of Object.entries(STRUCTURES[s.type].cost)) {
    let left = Math.floor(qty / 2); if (!left) continue;
    if (state.player) left = inv.add(state.player.inv, id, left, undefined, state);
    if (left > 0) stacks.push({ id, qty: left });
  }
  if (stacks.length) loot.makeDrop(state, s.x + s.w / 2, s.y + s.h / 2, stacks);
  emit(state, { t: 'structureDestroyed', id: s.id, type: s.type, x: s.x + s.w / 2, y: s.y + s.h / 2 });
  if (state.interact?.target === s) state.interact = null;
  return true;
}
export function demolish(state: GameState, s: Structure) { const removed = remove(state, s, true); if (removed) sound(state, 'build'); return removed; }
/** Materials to restore s to full HP: up to half its build cost, scaled by damage (at least 1 of each). */
export function repairCost(s: Structure): Record<string, number> | null {
  const def = STRUCTURES[s.type];
  if (!def || s.dead || !(s.hp < s.maxHp)) return null;
  const missing = 1 - Math.max(0, s.hp) / s.maxHp, cost: Record<string, number> = {};
  for (const [id, n] of Object.entries(def.cost)) cost[id] = Math.max(1, Math.ceil(n * 0.5 * missing));
  return cost;
}
export function repair(state: GameState, s: Structure) {
  const cost = repairCost(s), p = state.player;
  if (!cost || !p) { toast(state, 'That is already in full repair.', '#bfc5ba'); return false; }
  if (!inv.has(p.inv, cost)) {
    toast(state, 'Need ' + Object.entries(cost).map(([id, n]) => `${n} ${id.replace(/_/g, ' ')}`).join(', ') + ' to repair.', '#e99a67');
    return false;
  }
  for (const [id, n] of Object.entries(cost)) inv.remove(p.inv, id, n);
  s.hp = s.maxHp;
  toast(state, `Repaired ${STRUCTURES[s.type].name.toLowerCase()}.`, '#c8e6a0');
  sound(state, 'build', s.x + s.w / 2, s.y + s.h / 2);
  return true;
}
export function damage(state: GameState, s: Structure, amount: number) {
  if (!s || s.dead || !Number.isFinite(amount) || amount <= 0) return;
  s.hp = Math.max(0, s.hp - amount); s.hitFlash = 0.15;
  if (s.hp <= 0) remove(state, s, false);
}
export function nearStation(state: GameState, type: string) {
  const p = state.player; if (!p) return null;
  return state.structures.find(s => !s.dead && s.type === type && distance(s, p.x, p.y) <= 140 && phys.canReach(state, p.x, p.y, s)) || null;
}
export function nearestInteractable(state: GameState, x: number, y: number, maxDist = 70) {
  let result: Structure | null = null, best = maxDist;
  for (const s of state.structures) {
    if (s.dead || !['bed', 'stash', 'workbench', 'turret'].includes(s.type)) continue;
    const d = distance(s, x, y);
    if (d <= best && phys.canReach(state, x, y, s)) { best = d; result = s; }
  }
  return result;
}
export function interact(state: GameState, s: Structure) {
  if (!s || s.dead || !state.player || !phys.canReach(state, state.player.x, state.player.y, s)) return;
  if (s.type === 'bed') {
    state.base.bed = s.id; state.player.spawn = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    if (game.isNight(state)) game.skipToMorning(state);
    game.save(state); toast(state, 'Respawn point set. Progress saved.');
  } else {
    const ui = s.type === 'stash' || s.type === 'turret' ? 'stash' : s.type === 'workbench' ? 'workbench' : null;
    if (ui) { state.ui = ui; state.uiTarget = s; uiTargets.set(state, s); emit(state, { t: 'openUi', ui, target: s }); }
  }
}
export function enterBuild(state: GameState) {
  if (!state.player || state.player.dead) return;
  if (state.ui === 'build') { exitBuild(state); return; }
  const last = state._lastBuild as { selected: string; rot: 0 | 1 } | undefined;
  state.build = { selected: last && STRUCTURES[last.selected] ? last.selected : 'bed', rot: last?.rot ?? 0, ghost: null, tool: 'place' };
  state.ui = 'build'; emit(state, { t: 'openUi', ui: 'build' });
}
export function exitBuild(state: GameState) {
  if (state.build) state._lastBuild = { selected: state.build.selected, rot: state.build.rot };
  state.build = null; state.ui = null;
}
/** Build menu: pick a structure to place (switches to the place tool). */
export function selectBuild(state: GameState, type: string) {
  if (!state.build || !STRUCTURES[type]) return;
  state.build.selected = type; state.build.tool = 'place';
}
/** Build menu: what a left click does. */
export function setBuildTool(state: GameState, tool: BuildTool) {
  if (!state.build || !['place', 'repair', 'demolish'].includes(tool)) return;
  state.build.tool = tool;
}
/** The player's damaged structure nearest to (x, y), for the "repair" interaction outside build mode. */
export function nearestDamaged(state: GameState, x: number, y: number, maxDist = 60) {
  let result: Structure | null = null, best = maxDist;
  for (const s of state.structures) {
    if (s.dead || !(s.hp < s.maxHp)) continue;
    const d = distance(s, x, y);
    if (d <= best) { best = d; result = s; }
  }
  return result;
}
function buildInput(state: GameState, input: InputState) {
  if (!state.build) return;
  if (input.altPressed || input.pressed.has('cancel')) { exitBuild(state); return; }
  const b = state.build;
  if (!STRUCTURES[b.selected]) b.selected = types[0];
  const direction = Number(input.pressed.has('cycleNext')) - Number(input.pressed.has('cyclePrev'));
  if (direction) { b.selected = types[(types.indexOf(b.selected) + direction + types.length) % types.length]; b.tool = 'place'; }
  if (input.pressed.has('rotate')) b.rot = b.rot === 0 ? 1 : 0;
  const tool: BuildTool = b.tool ?? 'place';
  const x = snap(input.aimX), y = snap(input.aimY), type = b.selected;
  const own = state.structures.slice().reverse().find(s => !s.dead && input.aimX >= s.x && input.aimX <= s.x + s.w && input.aimY >= s.y && input.aimY <= s.y + s.h);
  const scrap = own ? null : salvage.targetAt(state, input.aimX, input.aimY);
  const doRepair = () => { if (own) repair(state, own); else toast(state, 'Aim at one of your structures to repair it.', '#bfc5ba'); };
  const doDemolish = () => { if (own) demolish(state, own); else if (scrap) salvage.salvage(state, scrap); };
  if (input.pressed.has('repair')) doRepair();
  else if (input.pressed.has('demolish')) doDemolish();
  else if (input.firePressed) {
    if (tool === 'repair') doRepair();
    else if (tool === 'demolish') { if (own || scrap) doDemolish(); }
    else if (!place(state, type, x, y, b.rot)) toast(state, canAfford(state, type) ? 'Choose an empty spot for this structure.' : 'Not enough materials.', '#e99a67');
  }
  b.ghost = tool === 'place' ? { x, y, ...dims(type, b.rot), ok: canPlace(state, type, x, y, b.rot) && canAfford(state, type) } : null;
  const p = state.player, t = own ?? (scrap && !scrap.structure && tool !== 'repair' ? scrap : null);
  b.salvage = t ? { x: t.x, y: t.y, w: t.w, h: t.h, label: own ? 'demolish ' + STRUCTURES[own.type]?.name : 'salvage ' + salvage.nameOf(t as Solid),
    name: own ? STRUCTURES[own.type]?.name : salvage.nameOf(t as Solid),
    repair: own ? repairCost(own) : null, hp: own ? own.hp / own.maxHp : undefined,
    near: !!own || salvage.inReach(state, t) } : null;
}
/** Build mode pauses the world in survival: only build input runs (see game.step). */
export function buildOnly(state: GameState, input: InputState) {
  if (state.ui !== 'build') return;
  if (input.pressed.has('build')) { exitBuild(state); return; }
  buildInput(state, input);
}
function turret(state: GameState, s: RuntimeStructure, dt: number) {
  s.fireCooldown = Math.max(0, (s.fireCooldown || 0) - dt);
  if (s.fireCooldown > 0 || !s.inv || inv.count(s.inv, 'ammo_9mm') < 1) return;
  const x = s.x + s.w / 2, y = s.y + s.h / 2;
  let target = null, best = 400, muzzle: Vec | null = null;
  for (const z of state.zombies) {
    if (z.dead) continue;
    const d = Math.hypot(z.x - x, z.y - y); if (d >= best || d < 1) continue;
    const a = Math.atan2(z.y - y, z.x - x), offset = Math.hypot(s.w, s.h) * 0.5 + 6;
    const point = { x: x + Math.cos(a) * offset, y: y + Math.sin(a) * offset };
    if (phys.raycast(state, x, y, point.x, point.y, 3, o => o !== s._solid && o.blocksBullets !== false)) continue;
    if (!phys.lineOfSight(state, point.x, point.y, z.x, z.y)) continue;
    target = z; best = d; muzzle = point;
  }
  if (!target || !muzzle) { s.fireCooldown = 0.15; return; }
  if (!inv.remove(s.inv, 'ammo_9mm', 1)) return;
  const angle = Math.atan2(target.y - y, target.x - x); s.aim = angle; s.fireCooldown = 0.3;
  state.bullets.push({ x: muzzle.x, y: muzzle.y, prevX: muzzle.x, prevY: muzzle.y, vx: Math.cos(angle) * 900, vy: Math.sin(angle) * 900, angle, damage: 20, life: 0.55, r: 3, pierce: 0, ricochet: 0, explosive: 0, incendiary: false, hit: new Set(), dead: false, color: '#ffd875', weapon: 'turret' });
  emit(state, { t: 'shot', x: muzzle.x, y: muzzle.y, angle, weapon: 'turret', cls: 'handgun' });
  if (state.player && Math.hypot(x - state.player.x, y - state.player.y) < 800) sound(state, 'pistol');
  zombies.noise(state, x, y, 700);
}
export function update(state: GameState, input: InputState, dt: number) {
  if (!Number.isFinite(dt) || dt < 0) return;
  if (state.ui === 'build') buildInput(state, input);
  for (const s of state.structures.slice() as RuntimeStructure[]) {
    if (s.dead) continue;
    s.hitFlash = Math.max(0, (s.hitFlash || 0) - dt);
    if (s.type === 'turret') turret(state, s, dt);
    if (s.type === 'spike_trap') {
      s.trapCooldown = Math.max(0, (s.trapCooldown || 0) - dt); if (s.trapCooldown > 0) continue;
      let hits = 0;
      for (const z of state.zombies) if (!z.dead && circleOverlap(s, z)) { zombies.damage(state, z, 16, 0, { source: 'spike_trap' }); hits++; }
      if (hits) { s.trapCooldown = 0.65; damage(state, s, hits * 2); }
    }
  }
}
