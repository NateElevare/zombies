// core.ts — sim foundation: constants, seeded RNG, spatial grid, physics, events, state factory.
// Owned by the orchestrator. Port of legacy/js/sv/sv-core.js. No Phaser, no DOM.
import type { GameMode, GameState, Rect, SimEvent, Solid, Player } from './types';

export const WORLD = { w: 16000, h: 16000 };
export const CELL = 256;
export const SIM_DT = 1 / 60;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const TAU = Math.PI * 2;
export function angleDiff(a: number, b: number) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }

// ---------------------------------------------------------------- RNG
export interface Rng {
  next(): number; range(lo: number, hi: number): number; int(lo: number, hi: number): number;
  pick<T>(arr: readonly T[]): T; chance(p: number): boolean;
  weighted<T>(table: readonly (T & { w: number })[] | Record<string, number>): any;
  state(): number;
}
function mulberry(a: number) {
  a >>>= 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, get: () => a };
}
export function makeRng(seed: number): Rng {
  const m = mulberry(seed);
  const next = m.next;
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    weighted(table: any) {
      const entries: [any, number][] = Array.isArray(table) ? table.map((e: any) => [e, e.w]) : Object.entries(table);
      let total = 0;
      for (const [, w] of entries) total += w;
      let r = next() * total;
      for (const [k, w] of entries) if ((r -= w) <= 0) return k;
      return entries[entries.length - 1][0];
    },
    state: m.get,
  };
}
/** Runtime randomness: advances state.rngState (deterministic, serializable). */
export function rand(state: GameState): number {
  let a = (state.rngState = (state.rngState + 0x6d2b79f5) >>> 0);
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randRange = (s: GameState, lo: number, hi: number) => lo + rand(s) * (hi - lo);
export const randInt = (s: GameState, lo: number, hi: number) => Math.floor(lo + rand(s) * (hi - lo + 1));
export const randPick = <T>(s: GameState, arr: readonly T[]): T => arr[Math.floor(rand(s) * arr.length)];

export function hash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------- spatial grid
export class Grid {
  cell: number; cols: number; rows: number; cells: Solid[][]; stamp = 1; count = 0;
  constructor(w: number, h: number, cell: number) {
    this.cell = cell; this.cols = Math.ceil(w / cell); this.rows = Math.ceil(h / cell);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }
  private range(x: number, y: number, w: number, h: number): [number, number, number, number] {
    const c = this.cell;
    return [
      clamp(Math.floor(x / c), 0, this.cols - 1), clamp(Math.floor(y / c), 0, this.rows - 1),
      clamp(Math.floor((x + w) / c), 0, this.cols - 1), clamp(Math.floor((y + h) / c), 0, this.rows - 1),
    ];
  }
  insert(o: Solid) {
    const [c0, r0, c1, r1] = this.range(o.x, o.y, o.w, o.h);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c].push(o);
    o._q = 0; this.count++;
  }
  remove(o: Solid) {
    const [c0, r0, c1, r1] = this.range(o.x, o.y, o.w, o.h);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const list = this.cells[r * this.cols + c], i = list.indexOf(o);
      if (i >= 0) list.splice(i, 1);
    }
    this.count--;
  }
  /** fn(o) once per rect whose cells overlap the box; return true to stop early. */
  each(x: number, y: number, w: number, h: number, fn: (o: Solid) => boolean | void) {
    const s = ++this.stamp;
    const [c0, r0, c1, r1] = this.range(x, y, w, h);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const list = this.cells[r * this.cols + c];
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o._q === s) continue;
        o._q = s;
        if (fn(o)) return;
      }
    }
  }
  /** Rects actually overlapping the box. */
  query(x: number, y: number, w: number, h: number, out: Solid[] = []): Solid[] {
    this.each(x, y, w, h, (o) => { if (o.x < x + w && o.x + o.w > x && o.y < y + h && o.y + o.h > y) out.push(o); });
    return out;
  }
  /** Every solid exactly once (renderer chunk building, debug). */
  all(): Solid[] { const out: Solid[] = []; this.each(0, 0, this.cols * this.cell, this.rows * this.cell, (o) => { out.push(o); }); return out; }
}

// ---------------------------------------------------------------- physics
export function slab(x: number, y: number, dx: number, dy: number, o: Rect, r: number): number {
  let near = 0, far = 1;
  if (dx === 0) { if (x < o.x - r || x > o.x + o.w + r) return Infinity; }
  else {
    const a = (o.x - r - x) / dx, b = (o.x + o.w + r - x) / dx;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
  }
  if (dy === 0) { if (y < o.y - r || y > o.y + o.h + r) return Infinity; }
  else {
    const a = (o.y - r - y) / dy, b = (o.y + o.h + r - y) / dy;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
  }
  return near <= far ? near : Infinity;
}
type Circle = { x: number; y: number; r: number };
export const phys = {
  slab,
  /** Push a circle out of every solid rect. Returns the last rect touched (or null). */
  collideCircle(state: GameState, e: Circle, ignore?: (o: Solid) => boolean): Solid | null {
    let touched: Solid | null = null;
    for (let pass = 0; pass < 2; pass++) {
      state.grid.each(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2, (o) => {
        if (o.solid === false || (ignore && ignore(o))) return;
        if (e.x + e.r <= o.x || e.x - e.r >= o.x + o.w || e.y + e.r <= o.y || e.y - e.r >= o.y + o.h) return;
        const cx = clamp(e.x, o.x, o.x + o.w), cy = clamp(e.y, o.y, o.y + o.h);
        const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
        if (d2 >= e.r * e.r) return;
        touched = o;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2), push = e.r - d;
          e.x += (dx / d) * push; e.y += (dy / d) * push;
        } else {
          const l = e.x - o.x, r = o.x + o.w - e.x, t = e.y - o.y, b = o.y + o.h - e.y, m = Math.min(l, r, t, b);
          if (m === l) e.x = o.x - e.r; else if (m === r) e.x = o.x + o.w + e.r;
          else if (m === t) e.y = o.y - e.r; else e.y = o.y + o.h + e.r;
        }
      });
    }
    e.x = clamp(e.x, e.r, WORLD.w - e.r);
    e.y = clamp(e.y, e.r, WORLD.h - e.r);
    return touched;
  },
  /** First rect hit by a moving circle along (x1,y1)->(x2,y2). Default filter: blocksBullets. */
  raycast(state: GameState, x1: number, y1: number, x2: number, y2: number, r = 0, filter?: (o: Solid) => boolean): { t: number; rect: Solid } | null {
    const dx = x2 - x1, dy = y2 - y1;
    const bx = Math.min(x1, x2) - r, by = Math.min(y1, y2) - r;
    let best = Infinity, hit: Solid | null = null;
    state.grid.each(bx, by, Math.abs(dx) + r * 2, Math.abs(dy) + r * 2, (o) => {
      if (filter ? !filter(o) : o.blocksBullets === false) return;
      const t = slab(x1, y1, dx, dy, o, r);
      if (t < best) { best = t; hit = o; }
    });
    return hit ? { t: best, rect: hit } : null;
  },
  lineOfSight(state: GameState, x1: number, y1: number, x2: number, y2: number) {
    return !phys.raycast(state, x1, y1, x2, y2, 0, (o) => o.blocksSight !== false);
  },
  /** True when nothing solid (other than the target itself) lies between (x,y) and the target's nearest point. */
  canReach(state: GameState, x: number, y: number, target: any) {
    let tx: number, ty: number;
    if (target.w !== undefined && target.h !== undefined) {
      tx = clamp(x, target.x, target.x + target.w); ty = clamp(y, target.y, target.y + target.h);
    } else {
      const dx = target.x - x, dy = target.y - y, d = Math.hypot(dx, dy);
      const f = d ? Math.max(0, d - (target.r || 12)) / d : 0;
      tx = x + dx * f; ty = y + dy * f;
    }
    return !phys.raycast(state, x, y, tx, ty, 0,
      (o) => o.solid !== false && o.container !== target && o.structure !== target && o !== target._solid);
  },
  isFree(state: GameState, x: number, y: number, r: number) {
    if (x < r || y < r || x > WORLD.w - r || y > WORLD.h - r) return false;
    let free = true;
    state.grid.each(x - r, y - r, r * 2, r * 2, (o) => {
      if (o.solid === false) return;
      const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) { free = false; return true; }
    });
    return free;
  },
  addSolid<T extends Partial<Solid> & Rect>(state: GameState, o: T): Solid {
    const s = o as unknown as Solid;
    if (s.solid === undefined) s.solid = true;
    if (s.blocksBullets === undefined) s.blocksBullets = true;
    if (s.blocksSight === undefined) s.blocksSight = true;
    state.grid.insert(s);
    return s;
  },
  removeSolid(state: GameState, o: Solid) { state.grid.remove(o); },
};

// ---------------------------------------------------------------- events & helpers
export function emit(state: GameState, ev: SimEvent) { state.events.push(ev); }
export function toast(state: GameState, msg: string, color?: string) { emit(state, { t: 'toast', msg, color: color || '#e8e8e0' }); }
export function sound(state: GameState, name: string, x?: number, y?: number, vol?: number) { emit(state, { t: 'sound', name, x, y, vol }); }
let uidN = 0;
export function uid(prefix = 'u') { return prefix + Date.now().toString(36) + (uidN++).toString(36); }

// ---------------------------------------------------------------- state factory
export function newState(seed: number, mode: GameMode = 'survival', worldSize = WORLD): GameState {
  return {
    mode,
    screen: 'playing',
    ui: null,
    paused: false,
    seed: seed >>> 0,
    rngState: (hash('runtime') ^ seed) >>> 0,
    tick: 0,
    time: 0,
    clock: { t: 60, day: 1 },
    grid: new Grid(worldSize.w, worldSize.h, CELL),
    roads: [], buildings: [], containers: [], decor: [], pois: [], spawnPoint: { x: 8000, y: 8000 },
    player: null as unknown as Player, // set by game.newGame / arcade.newArcade
    zombies: [], bullets: [], drops: [], structures: [],
    base: { bed: null },
    stats: { kills: 0, containersLooted: 0, deaths: 0, daysSurvived: 0 },
    interact: null, search: null, build: null,
    shake: 0,
    events: [],
  };
}

/** Copy current transforms into prev* (call at the start of each fixed tick). */
export function snapshotInterp(state: GameState) {
  const p = state.player;
  if (p) { p.prevX = p.x; p.prevY = p.y; p.prevAngle = p.angle; }
  for (const z of state.zombies) { z.prevX = z.x; z.prevY = z.y; z.prevAngle = z.angle; }
  for (const b of state.bullets) { b.prevX = b.x; b.prevY = b.y; }
}
