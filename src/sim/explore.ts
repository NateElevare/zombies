// explore.ts — fog of war for the map: which parts of the world the player has seen. Survival only.
// A CELL-px grid over the world (128 x 128 for the 16k world), revealed in a radius around the player.
// Saved as a base64 bitset (~2.7 KB). state.exploredRev bumps on every change so map views can redraw cheaply.
import type { GameState } from './types';
import { WORLD } from './core';

export const CELL = 125;
export const COLS = Math.ceil(WORLD.w / CELL), ROWS = Math.ceil(WORLD.h / CELL);
export const RADIUS = 720;          // about what you can see on screen
const EVERY = 0.25;                 // seconds between reveals

export function grid(state: GameState): Uint8Array {
  let g = state.explored as Uint8Array | undefined;
  if (!(g instanceof Uint8Array) || g.length !== COLS * ROWS) { g = new Uint8Array(COLS * ROWS); state.explored = g; state.exploredRev = ((state.exploredRev as number) || 0) + 1; }
  return g;
}
export const rev = (state: GameState) => (state.exploredRev as number) || 0;
export function isExplored(state: GameState, x: number, y: number) {
  if (state.mode !== 'survival') return true;
  const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
  return grid(state)[r * COLS + c] === 1;
}

/** Reveal a circle; returns how many cells were newly revealed. */
export function reveal(state: GameState, x: number, y: number, radius = RADIUS) {
  const g = grid(state);
  const c0 = Math.max(0, Math.floor((x - radius) / CELL)), c1 = Math.min(COLS - 1, Math.floor((x + radius) / CELL));
  const r0 = Math.max(0, Math.floor((y - radius) / CELL)), r1 = Math.min(ROWS - 1, Math.floor((y + radius) / CELL));
  const rr = (radius + CELL * 0.5) ** 2;
  let n = 0;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const i = r * COLS + c;
    if (g[i]) continue;
    const dx = (c + 0.5) * CELL - x, dy = (r + 0.5) * CELL - y;
    if (dx * dx + dy * dy <= rr) { g[i] = 1; n++; }
  }
  if (n) state.exploredRev = rev(state) + 1;
  return n;
}

export function update(state: GameState, dt: number) {
  if (state.mode !== 'survival' || !state.player || state.player.dead) return;
  const t = ((state._exploreT as number) || 0) - dt;
  if (t > 0) { state._exploreT = t; return; }
  state._exploreT = EVERY;
  reveal(state, state.player.x, state.player.y);
}

/** Fraction of the world explored (0..1). */
export function fraction(state: GameState) { const g = grid(state); let n = 0; for (let i = 0; i < g.length; i++) n += g[i]; return n / g.length; }

// ---- save encoding: bitset -> base64 (works in browsers and Node; no DOM needed)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function encode(state: GameState): string {
  const g = grid(state), bytes = new Uint8Array(Math.ceil(g.length / 8));
  for (let i = 0; i < g.length; i++) if (g[i]) bytes[i >> 3] |= 1 << (i & 7);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0, n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}
export function decode(state: GameState, s: unknown) {
  const g = grid(state); g.fill(0);
  if (typeof s === 'string' && s.length <= 8192) {
    const bytes: number[] = [];
    for (let i = 0; i < s.length; i += 4) {
      const v = [0, 1, 2, 3].map((j) => B64.indexOf(s[i + j] ?? '='));
      if (v[0] < 0 || v[1] < 0) break;
      const n = (v[0] << 18) | (v[1] << 12) | (Math.max(0, v[2]) << 6) | Math.max(0, v[3]);
      bytes.push((n >> 16) & 255); if (v[2] >= 0) bytes.push((n >> 8) & 255); if (v[3] >= 0) bytes.push(n & 255);
    }
    for (let i = 0; i < g.length && (i >> 3) < bytes.length; i++) g[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  }
  state.exploredRev = rev(state) + 1;
}
