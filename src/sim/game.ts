// Survival lifecycle and fixed-step simulation. Rendering and overlay keys live in the shell.
import { clamp, emit, hash, newState, phys, snapshotInterp, sound, toast } from './core';
import type { GameState, InputState, Stack, UiName } from './types';
import * as world from './world';
import * as player from './player';
import * as cityBosses from './city-bosses';
import * as zombies from './zombies';
import * as combat from './combat';
import * as base from './base';
import * as inv from './inventory';
import * as loot from './loot';
import * as saves from './save';
import * as explore from './explore';

export const DAY_LENGTH = 600;
const NIGHT_START = 420;
const smooth = (v: number) => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x); };
export function isNight(state: GameState) { return state.clock.t >= NIGHT_START; }
export function darkness(state: GameState) {
  // The Hive Below has no daylight: dusk in the crater, then black as you go down the rift
  const hive = state.road?.world.hive;
  if (hive && state.player) {
    const b = hive.breach, e = Math.hypot((state.player.x - b.x) / b.rx, (state.player.y - b.y) / b.ry);
    return 0.8 + 0.08 * smooth((e - 0.95) / 0.55);
  }
  const t = state.clock.t;
  if (t < 330) return 0.15;
  if (t < NIGHT_START) return 0.15 + 0.82 * smooth((t - 330) / 90);
  if (t < 540) return 0.97;
  return 0.15 + 0.82 * (1 - smooth((t - 540) / 60));
}
export function timeLabel(state: GameState) {
  const hours = (6 + state.clock.t / DAY_LENGTH * 24) % 24;
  return `Day ${state.clock.day} — ${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.floor((hours % 1) * 60)).padStart(2, '0')}`;
}
export function setUi(state: GameState, ui: UiName | null) {
  if (state.ui === ui) return;
  if (state.ui === 'build' || state.build) base.exitBuild(state);
  if (ui === 'build') base.enterBuild(state);
  else state.ui = ui;
  if (state.ui) state.search = null;
}
export function save(state: GameState): boolean {
  if (state.mode !== 'survival' || !state.player || state.player.dead || state.screen === 'dead') return false;
  let saved = false;
  try { saved = saves.write(state); } catch { /* Storage access may be unavailable. */ }
  if (!saved) toast(state, 'Save failed - storage unavailable', '#f66');
  emit(state, { t: 'saved', ok: saved });
  return saved;
}
function startState(state: GameState) {
  state.screen = 'playing'; state.ui = null; state.paused = false;
  state._saveTimer = 0; state._night = isNight(state);
  snapshotInterp(state);
  sound(state, 'waveStart');
}
/** Spare 9mm rounds a new story run starts with (enough to get through the first night). */
export const START_AMMO = 96;
export function newGame(seed?: number, character: import('../characters').CharacterId = 'survivor'): GameState {
  const state = newState(seed === undefined ? hash(String(Date.now())) : seed);
  world.generate(state);
  const p = state.player = player.create(state.spawnPoint.x, state.spawnPoint.y);
  p.character = character;
  inv.bind(state);
  p.inv.equip.secondary = { id: 'pistol', qty: 1, mag: 12 };
  p.inv.equip.melee = { id: 'knife', qty: 1 };
  inv.add(p.inv, 'ammo_9mm', START_AMMO); inv.add(p.inv, 'bandage', 2);
  inv.add(p.inv, 'water_bottle', 1); inv.add(p.inv, 'canned_food', 1);
  startState(state);
  toast(state, 'Bellwether, a ruined city. Find Mara inside Station 3. Open the Haven journal for your objectives.', '#e8e8e0');
  toast(state, 'WASD move, mouse aim, E search, B build, F flashlight', '#9aa09a');
  save(state);
  return state;
}
export function continueGame(): GameState | null {
  try {
    const data = saves.read();
    if (!data) return null;
    const state = newState(data.seed >>> 0);
    world.generate(state);
    state.player = player.create(state.spawnPoint.x, state.spawnPoint.y);
    if (!saves.apply(state, data)) return null;
    state.player.dead = false;
    if (!(state.player.hp > 0)) state.player.hp = 60;
    startState(state);
    toast(state, 'Welcome back. ' + timeLabel(state), '#e8e8e0');
    return state;
  } catch { return null; }
}
function onDied(state: GameState) {
  if (state.screen === 'dead') return;
  const p = state.player, stacks: Stack[] = [];
  for (let i = 0; i < p.inv.slots.length; i++) {
    const stack = p.inv.slots[i];
    if (stack) { stacks.push(stack); p.inv.slots[i] = null; }
  }
  if (stacks.length) loot.makeDrop(state, p.x, p.y, stacks, 'deathbag');
  state.stats.deaths++; state.screen = 'dead'; state.search = null; state.interact = null;
  setUi(state, 'dead');
  emit(state, { t: 'openUi', ui: 'dead' });
}
function newDay(state: GameState) {
  state.clock.day++; state._night = false; state.stats.daysSurvived++;
  emit(state, { t: 'day', day: state.clock.day });
  toast(state, 'Dawn breaks. Day ' + state.clock.day, '#ffd98a');
}
function updateClock(state: GameState, dt: number) {
  const dev = state.dev;
  state.clock.t += dev ? (dev.freeze ? 0 : dt * dev.timeScale) : dt;
  if (isNight(state) && !state._night) {
    state._night = true; emit(state, { t: 'night' });
    toast(state, 'Night falls. Stay close to light.', '#8fa8ff'); sound(state, 'night');
  }
  while (state.clock.t >= DAY_LENGTH) { state.clock.t -= DAY_LENGTH; newDay(state); }
}
/** Testing: jump the clock to time-of-day t (0..DAY_LENGTH). Night/dawn events fire normally on the next tick. */
export function devSetTime(state: GameState, t: number) {
  state.clock.t = clamp(t, 0, DAY_LENGTH - 0.01);
  if (!isNight(state)) state._night = false;
}
export function skipToMorning(state: GameState) {
  if (isNight(state)) { state.clock.t = 20; newDay(state); }
  const p = state.player;
  if (p && !p.dead) { p.hp = Math.min(p.maxHp, p.hp + 20); p.stamina = p.maxStamina; }
  save(state);
}
export function respawn(state: GameState) {
  if (state.mode !== 'survival' || !state.player) return;
  const p = state.player;
  let pos = state.spawnPoint;
  const bed = state.structures.find(s => s.id === state.base.bed && !s.dead);
  if (bed) pos = { x: bed.x + bed.w / 2, y: bed.y + bed.h / 2 + 30 };
  p.x = pos.x; p.y = pos.y; phys.collideCircle(state, p);
  p.hp = Math.min(60, p.maxHp); p.food = p.water = 60; p.stamina = p.maxStamina;
  p.dead = false; p.invuln = 2; p.bleeding = 0; p.reloadTimer = p.swingTimer = p.fireCooldown = 0;
  p.burstQueue = 0; p.sprinting = false; p.vx = p.vy = 0;
  state.search = null; state.interact = null;
  state.zombies = state.zombies.filter(z => !z.dead && Math.hypot(z.x - p.x, z.y - p.y) >= 500);
  state.bullets.length = 0; state.screen = 'playing'; state.paused = false;
  setUi(state, null); snapshotInterp(state); save(state);
}
export function step(state: GameState, input: InputState, dt: number) {
  if (state.screen !== 'playing' || state.paused || (state.ui !== null && state.ui !== 'build')) return;
  if (!Number.isFinite(dt) || dt <= 0) return;
  snapshotInterp(state); state.tick++;
  // Build mode pauses the world (clock, zombies, bullets, needs); only build input runs.
  if (state.ui === 'build') { base.buildOnly(state, input); return; }
  // A damage action may have killed the player between fixed ticks.
  if (state.player.dead) { onDied(state); return; }
  state.time += dt;
  updateClock(state, dt);
  player.update(state, input, dt);
  explore.update(state, dt);
  if (state.dev?.god) { const p = state.player; p.hp = p.maxHp; p.stamina = p.maxStamina; p.food = 100; p.water = 100; p.bleeding = 0; }
  if (!state.player.dead && (state.ui === null || state.ui === 'build')) {
    combat.update(state, input, dt);
    if (!state.player.dead) zombies.update(state, dt);
    if (!state.player.dead) cityBosses.update(state, dt);
    if (!state.player.dead) base.update(state, input, dt);
  }
  if (state.player.dead) onDied(state);
  state.drops = state.drops.filter(drop => {
    if (drop.life !== Infinity) drop.life -= dt;
    return drop.life > 0 && drop.inv.slots.some(Boolean);
  });
  state._saveTimer = (state._saveTimer as number || 0) + dt;
  if ((state._saveTimer as number) >= 60) { state._saveTimer = (state._saveTimer as number) % 60; save(state); }
  state.shake = state.shake > 0.1 ? state.shake * Math.exp(-10 * dt) : 0;
}
