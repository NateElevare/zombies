import type { GameState, Player, Inventory, PlayerInventory, Stack, Structure, Drop, EquipKey } from './types';
import { validSaveCore } from './save-validation.ts';
import { ITEMS } from './items';
import * as inv from './inventory';
import * as base from './base';
import * as game from './game';
import * as salvage from './salvage';
import * as explore from './explore';
import { characterId } from '../characters';

export const SAVE_KEY = 'deadzone_survival_v2';
export const KEY = SAVE_KEY;
export const SAVE_TIME_KEY = 'deadzone_survival_saved_at';
export const VERSION = 2;
const equipment: EquipKey[] = ['primary', 'secondary', 'melee', 'head', 'body', 'back'];
const playerFields = ['character', 'x', 'y', 'r', 'angle', 'speed', 'hp', 'maxHp', 'stamina', 'maxStamina', 'food', 'water', 'dead', 'active', 'xp', 'level', 'sp', 'tech', 'spawn', 'flashlight', 'bleeding'] as const;
const structureFields = ['id', 'type', 'x', 'y', 'w', 'h', 'hp', 'maxHp', 'rot'] as const;
export interface SaveData {
  version: number; seed: number; rngState: number; clock: GameState['clock']; stats: GameState['stats'];
  player: Pick<Player, typeof playerFields[number]> & { inv: PlayerInventory };
  containers: Record<string, { searched: boolean; inv: Inventory | null }>;
  drops: Drop[]; structures: Structure[]; base: GameState['base'];
  /** World furniture/cars torn down for materials (sim/salvage.ts keys). Optional: older saves have none. */
  salvaged?: string[];
  /** Fog of war bitset, base64 (sim/explore.ts). Optional: older saves start unexplored. */
  explored?: string;
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const encode = (v: unknown) => JSON.stringify(v, (_key, value: unknown) => value === Infinity ? { numberValue: 'Infinity' } : value === -Infinity ? { numberValue: '-Infinity' } : value);
const decode = (raw: string): unknown => JSON.parse(raw, (_key, value: unknown) => record(value) && Object.keys(value).length === 1 && (value.numberValue ?? value.$number) === 'Infinity' ? Infinity : record(value) && Object.keys(value).length === 1 && (value.numberValue ?? value.$number) === '-Infinity' ? -Infinity : value);
function copy<T>(value: T): T { return decode(encode(value)) as T; }
function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) if (Object.hasOwn(source, key)) result[key] = copy(source[key]);
  return result;
}
function stack(s: unknown): Stack | null {
  if (!record(s) || typeof s.id !== 'string' || !Object.hasOwn(ITEMS, s.id) || !Number.isSafeInteger(s.qty) || Number(s.qty) <= 0) return null;
  const item = ITEMS[s.id], result: Stack = { id: s.id, qty: Math.min(item.stack, Number(s.qty)) };
  if (item.type === 'weapon') result.mag = Number.isFinite(s.mag) ? Math.max(0, Math.floor(Number(s.mag))) : 0;
  if ((item.type === 'armor' || item.type === 'weapon' || item.type === 'backpack') && Number.isInteger(s.lvl) && Number(s.lvl) > 1) result.lvl = Math.min(5, Number(s.lvl));
  return result;
}
function inventory(data: unknown, isPlayer: true): PlayerInventory;
function inventory(data: unknown, isPlayer: false): Inventory;
function inventory(data: unknown, isPlayer: boolean): Inventory | PlayerInventory {
  const d = record(data) ? data : {};
  const size = Number.isInteger(d.size) && Number(d.size) >= 0 && Number(d.size) <= 4096 ? Number(d.size) : isPlayer ? 12 : 0;
  const result = isPlayer ? inv.createPlayer() : inv.create(size);
  result.size = size; result.slots = Array(size).fill(null);
  if (Array.isArray(d.slots)) for (let i = 0; i < size; i++) result.slots[i] = stack(d.slots[i]);
  if (isPlayer && record(d.equip)) for (const key of equipment) {
    const s = stack(d.equip[key]), item = s && ITEMS[s.id];
    const slot = item && (item.type === 'backpack' ? 'back' : ['weapon', 'armor'].includes(item.type) ? item.slot : null);
    (result as PlayerInventory).equip[key] = slot === key ? s : null;
  }
  return result;
}
function valid(data: unknown): data is SaveData { return validSaveCore(data); }
/** Pure JSON boundary: no storage access and no mutation of live inventories. */
export function serialize(state: GameState): string {
  if (!state?.player?.inv) throw new Error('Cannot save without a player');
  const p = state.player;
  const data: SaveData = {
    version: VERSION, seed: state.seed >>> 0, rngState: state.rngState >>> 0, clock: copy(state.clock), stats: copy(state.stats),
    player: { ...pick(p, playerFields), inv: inventory(p.inv, true) }, containers: {}, drops: [], structures: [], base: copy(state.base || { bed: null }),
  };
  for (const c of state.containers) if (c.searched) Object.defineProperty(data.containers, c.id, { value: { searched: true, inv: c.inv ? inventory(c.inv, false) : null }, enumerable: true });
  for (const d of state.drops) data.drops.push({ id: d.id, x: d.x, y: d.y, r: 12, kind: d.kind === 'deathbag' ? 'deathbag' : 'loot', life: d.life, inv: inventory(d.inv, false) });
  if (state.salvaged?.length) data.salvaged = state.salvaged.slice();
  if (state.mode === 'survival') data.explored = explore.encode(state);
  for (const s of state.structures) if (!s.dead) data.structures.push({ ...pick(s, structureFields), ...(s.inv ? { inv: inventory(s.inv, false) } : {}) });
  // Zombies and queued horde spawns are transient. Legacy restarts the night's horde on continue.
  if (game.isNight(state) || state.zombies.some(z => z.horde && !z.dead) || Number((state._zombies as { hordeRemaining?: number } | undefined)?.hordeRemaining || 0) > 0) delete data.base.hordeDay;
  if (!valid(data)) throw new Error('Invalid save state');
  return encode(data);
}
export function deserialize(raw: string): SaveData | null {
  try { const data = decode(raw); return valid(data) ? data : null; } catch { return null; }
}
export function has() { return read() !== null; }
export function write(state: GameState): boolean {
  try { globalThis.localStorage.setItem(SAVE_KEY, serialize(state)); globalThis.localStorage.setItem(SAVE_TIME_KEY, String(Date.now())); return true; } catch { return false; }
}
/** Install a cloud snapshot through the same local save boundary used by CONTINUE. */
export function writeRaw(raw: string, savedAt = Date.now()): boolean {
  if (!deserialize(raw)) return false;
  try { globalThis.localStorage.setItem(SAVE_KEY, raw); globalThis.localStorage.setItem(SAVE_TIME_KEY, String(savedAt)); return true; } catch { return false; }
}
export function savedAt(): number {
  try { return Number(globalThis.localStorage.getItem(SAVE_TIME_KEY)) || 0; } catch { return 0; }
}
export function read(): SaveData | null {
  try { const raw = globalThis.localStorage.getItem(SAVE_KEY); return raw ? deserialize(raw) : null; } catch { return null; }
}
export function clear(): boolean { try { globalThis.localStorage.removeItem(SAVE_KEY); globalThis.localStorage.removeItem(SAVE_TIME_KEY); return true; } catch { return false; } }
export function apply(state: GameState, data: unknown): boolean {
  try {
    if (!state || !valid(data)) return false;
    const source = copy(data), saved = source.player;
    const player: Player = {
      x: saved.x, y: saved.y, r: 14, angle: 0, speed: 190, hp: 100, maxHp: 100, stamina: 100, maxStamina: 100,
      food: 100, water: 100, dead: false, active: 'secondary', xp: 0, level: 1, sp: 0, tech: {},
      spawn: copy(state.spawnPoint || { x: saved.x, y: saved.y }), flashlight: true, bleeding: 0,
      ...(pick(saved, playerFields) as Partial<Player>), inv: inventory(saved.inv, true),
      character: characterId(saved.character),
      prevX: saved.x, prevY: saved.y, prevAngle: saved.angle || 0, vx: 0, vy: 0, invuln: 0, sprinting: false,
      fireCooldown: 0, reloadTimer: 0, reloadTotal: 0, swingTimer: 0, swingTotal: 0, lastShotT: -99, burstQueue: 0, combatTimer: 0,
    };
    const drops: Drop[] = (Array.isArray(source.drops) ? source.drops : []).filter(d => record(d) && Number.isFinite(d.x) && Number.isFinite(d.y)).map(d => ({
      id: d.id, x: d.x, y: d.y, r: 12, kind: d.kind === 'deathbag' ? 'deathbag' : 'loot',
      life: d.life === Infinity || d.life === null || d.life === -1 ? Infinity : Number.isFinite(d.life) ? Math.max(0, d.life) : 600, inv: inventory(d.inv, false),
    }));
    const structures = (Array.isArray(source.structures) ? source.structures : []).filter(s => record(s) && Number.isFinite(s.x) && Number.isFinite(s.y)).map(s => ({ ...pick(s, structureFields), ...(s.inv ? { inv: inventory(s.inv, false) } : {}) }));
    state.seed = source.seed >>> 0;
    if (Number.isInteger(source.rngState)) state.rngState = source.rngState >>> 0;
    state.player = player;
    if (record(source.clock)) state.clock = { ...state.clock, ...source.clock };
    if (record(source.stats)) state.stats = { ...state.stats, ...source.stats };
    const containers = record(source.containers) ? source.containers : {};
    for (const c of state.containers) if (Object.hasOwn(containers, c.id) && record(containers[c.id])) {
      const saved = containers[c.id]; c.searched = !!saved.searched; c.inv = saved.inv ? inventory(saved.inv, false) : null;
    }
    state.drops = drops; state.base = record(source.base) ? source.base : { bed: null };
    salvage.restore(state, source.salvaged);
    explore.decode(state, source.explored);
    base.restore(state, structures);
    if (game.isNight(state)) delete state.base.hordeDay;
    state.screen = player.dead ? 'dead' : 'playing'; state.ui = null; state.paused = false; state.build = null; state.uiTarget = null;
    state.interact = null; state.search = null; state.shake = 0; state.zombies = []; state.bullets = []; state.events = [];
    delete state._zombies;
    inv.recalcSize(state);
    return true;
  } catch { return false; }
}

