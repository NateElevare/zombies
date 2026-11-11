// pathing.ts — shared flow fields for zombie navigation (pure sim, deterministic, no RNG).
// One Dijkstra field per goal (the player, or the bed during a horde) covers a square around the goal.
// Every zombie that is chasing toward that goal reads its next step from the same field, so the cost is
// one search every few ticks, independent of how many zombies follow it.
// - World solids are impassable (inflated by CLEAR so paths keep off walls and corners).
// - Player structures (walls, doors, barricades, turrets...) are passable at a cost that grows with their hp:
//   zombies route through a nearby gap when one exists, and break through only when that is cheaper.
import type { GameState, Solid, Structure } from './types';

/** Field keys whose paths may not pass through building doorways (zombies don't hunt the player through doors). */
const NO_DOORS = new Set(['player']);

export const CELL = 16;            // field resolution (px); building doorways are 60-64px wide
const SNAP = 16;                   // the region moves in steps of SNAP cells (256px) so its raster can be reused
export const RADIUS = 896;         // the goal always has at least this much field around it (px)
const HALF = Math.ceil(RADIUS / CELL) + SNAP / 2;
const CLEAR = 10;                  // cells closer than this to a solid are blocked (smallest zombie r is 9)
const NEAR = 26;                   // cells closer than this cost a little extra, so paths keep off walls
const ORTH = 10, DIAG = 14, NEAR_COST = 5, MAX_STEP = 1500;
const REFRESH = 0.9;               // re-search at least this often (structure hp changes the costs)
const RASTER_AGE = 4;              // re-rasterize at least this often even if the solid count looks unchanged
const MIN_GAP = 0.3;               // never re-search one field more often than this
const MOVE = 3;                    // re-search early once the goal has moved this many cells
const UNREACHED = 0x7fffffff;
const RING = 2048;                 // bucket-queue ring size (> MAX_STEP + DIAG + NEAR_COST)

// Roughly: a wood wall is worth an ~800px walk around; a barricade ~300px. Each crossed cell pays half.
export function structureCost(s: Structure) { return 40 + Math.max(0, s.hp) * 1.2; }
/** Solids that zombies treat as walls. Doors have solid:false for the player but stop zombies. */
export function blocksZombie(o: Solid) {
  return o.structure ? !o.structure.dead && (o.solid !== false || o.structure.type === 'wood_door') : o.solid !== false;
}

export interface Field {
  x0: number; y0: number; cols: number; rows: number;
  goalX: number; goalY: number; builtAt: number; rasterAt: number; gridCount: number;
  cost: Int32Array;        // path cost to the goal (UNREACHED when blocked or unreachable)
  blocked: Uint8Array;     // 1 = impassable, 2 = near a wall (passable, small extra cost)
  struct: Int32Array;      // index+1 into structs for cells inside a player structure, else 0
  structs: Structure[];
}
interface Nav { clock: number; fields: Map<string, Field>; head: Int32Array; node: Int32Array; next: Int32Array }
const navs = new WeakMap<GameState, Nav>();
function nav(state: GameState): Nav {
  let n = navs.get(state);
  if (!n) { n = { clock: 0, fields: new Map(), head: new Int32Array(RING), node: new Int32Array(1 << 16), next: new Int32Array(1 << 16) }; navs.set(state, n); }
  return n;
}
/** Advance the pathing clock once per zombies.update tick (fields go stale by sim time, not wall time). */
export function tick(state: GameState, dt: number) { nav(state).clock += dt; }
/** Drop all cached fields (tests, or when the world is rebuilt). */
export function reset(state: GameState) { navs.delete(state); }

/** The field toward (gx,gy) under `key`, re-searched when stale. */
export function field(state: GameState, key: string, gx: number, gy: number, civilian = false): Field {
  const n = nav(state);
  let f = n.fields.get(key);
  if (f) {
    const age = n.clock - f.builtAt;
    if (age < MIN_GAP) return f;
    const moved = Math.max(Math.abs(Math.floor(gx / CELL) - Math.floor(f.goalX / CELL)), Math.abs(Math.floor(gy / CELL) - Math.floor(f.goalY / CELL)));
    if (age < REFRESH && moved < MOVE && state.grid.count === f.gridCount) return f;
  }
  f = build(state, n, gx, gy, f, NO_DOORS.has(key), civilian);
  n.fields.set(key, f);
  return f;
}

function build(state: GameState, n: Nav, gx: number, gy: number, old: Field | undefined, doors: boolean, civilian: boolean): Field {
  // Snap the region so small goal moves keep the same region (and its raster).
  const gc = Math.floor(gx / CELL), gr = Math.floor(gy / CELL);
  const sc = Math.round(gc / SNAP) * SNAP, sr = Math.round(gr / SNAP) * SNAP;
  const maxC = Math.ceil(state.grid.cols * state.grid.cell / CELL), maxR = Math.ceil(state.grid.rows * state.grid.cell / CELL);
  const c0 = Math.max(0, sc - HALF), r0 = Math.max(0, sr - HALF);
  const cols = Math.min(maxC, sc + HALF) - c0, rows = Math.min(maxR, sr + HALF) - r0, size = cols * rows;
  const same = !!old && old.x0 === c0 * CELL && old.y0 === r0 * CELL && old.cols === cols && old.rows === rows;
  const keep = same && old.gridCount === state.grid.count && n.clock - old.rasterAt < RASTER_AGE;
  const f: Field = {
    x0: c0 * CELL, y0: r0 * CELL, cols, rows, goalX: gx, goalY: gy, builtAt: n.clock,
    rasterAt: keep ? old.rasterAt : n.clock, gridCount: state.grid.count,
    cost: same ? old.cost : new Int32Array(size), blocked: same ? old.blocked : new Uint8Array(size),
    struct: same ? old.struct : new Int32Array(size), structs: keep ? old.structs : [],
  };
  if (!keep) { f.blocked.fill(0); f.struct.fill(0); rasterize(state, f, civilian); if (doors) blockDoors(state, f); }
  f.cost.fill(UNREACHED);
  search(n, f, gx, gy);
  return f;
}

function rasterize(state: GameState, f: Field, civilian = false) {
  const climbWindows = state.mode === 'road';   // zombies climb through windows in The Long Road (zombies.ts)
  const { x0, y0, cols, rows, blocked, struct, structs } = f;
  state.grid.each(x0 - NEAR, y0 - NEAR, cols * CELL + NEAR * 2, rows * CELL + NEAR * 2, o => {
    if (civilian ? o.solid === false : !blocksZombie(o) || (climbWindows && o.kind === 'window')) return;
    const s = civilian ? undefined : o.structure;
    // A structure (grown by CLEAR, so slivers between two pieces that no zombie fits through count too)
    // costs hp to cross; everything else blocks out to CLEAR and costs a little extra out to NEAR.
    const grow = s ? CLEAR : NEAR;
    const ca = Math.max(0, Math.floor((o.x - grow - x0) / CELL)), cb = Math.min(cols - 1, Math.floor((o.x + o.w + grow - x0) / CELL));
    const ra = Math.max(0, Math.floor((o.y - grow - y0) / CELL)), rb = Math.min(rows - 1, Math.floor((o.y + o.h + grow - y0) / CELL));
    let si = 0;
    if (s) { structs.push(s); si = structs.length; }
    for (let r = ra; r <= rb; r++) {
      const cy = y0 + r * CELL + CELL / 2, dy = cy < o.y ? o.y - cy : cy > o.y + o.h ? cy - o.y - o.h : 0;
      for (let c = ca; c <= cb; c++) {
        const cx = x0 + c * CELL + CELL / 2, dx = cx < o.x ? o.x - cx : cx > o.x + o.w ? cx - o.x - o.w : 0;
        const d = Math.hypot(dx, dy), i = r * cols + c;
        if (s) { if (d <= grow && !struct[i]) struct[i] = si; }
        else if (d < CLEAR) blocked[i] = 1;
        else if (d < NEAR && !blocked[i]) blocked[i] = 2;
      }
    }
  });
}

/** Building doorways are walls for this field (wandering zombies still walk through them; see zombies.ts). */
function blockDoors(state: GameState, f: Field) {
  const { x0, y0, cols, rows, blocked } = f, x1 = x0 + cols * CELL, y1 = y0 + rows * CELL, G = 6;
  for (const b of state.buildings || []) {
    if (b.x > x1 || b.y > y1 || b.x + b.w < x0 || b.y + b.h < y0) continue;
    for (const d of b.doors) {
      const ca = Math.max(0, Math.floor((d.x - G - x0) / CELL)), cb = Math.min(cols - 1, Math.floor((d.x + d.w + G - x0) / CELL));
      const ra = Math.max(0, Math.floor((d.y - G - y0) / CELL)), rb = Math.min(rows - 1, Math.floor((d.y + d.h + G - y0) / CELL));
      for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) blocked[r * cols + c] = 1;
    }
  }
}

// Dijkstra with a bucket queue (Dial): integer step costs bounded by MAX_STEP, so a ring of buckets is exact.
function search(n: Nav, f: Field, gx: number, gy: number) {
  const { cols, rows, cost, blocked, struct, structs } = f;
  const head = n.head, mask = RING - 1;
  let node = n.node, next = n.next, used = 0, pending = 0;
  head.fill(-1);
  const push = (c: number, i: number) => {
    if (used >= node.length) {
      const a = new Int32Array(node.length * 2), b = new Int32Array(node.length * 2);
      a.set(node); b.set(next); node = n.node = a; next = n.next = b;
    }
    const e = used++, k = c & mask;
    node[e] = i; next[e] = head[k]; head[k] = e; pending++;
  };
  // Structure crossing costs, looked up once per search (hp changes as zombies hit them).
  const sCost = new Int32Array(structs.length + 1);
  for (let k = 0; k < structs.length; k++) sCost[k + 1] = Math.min(MAX_STEP, structureCost(structs[k]) / 2 | 0);
  // Seed from the goal cell; if the goal hugs a wall, seed from the open cells around it instead.
  const gc = Math.floor((gx - f.x0) / CELL), gr = Math.floor((gy - f.y0) / CELL);
  for (let rad = 0; rad <= 3 && pending === 0; rad++) {
    for (let r = gr - rad; r <= gr + rad; r++) for (let c = gc - rad; c <= gc + rad; c++) {
      if (c < 0 || r < 0 || c >= cols || r >= rows || blocked[r * cols + c] === 1) continue;
      if (Math.max(Math.abs(c - gc), Math.abs(r - gr)) !== rad) continue;
      const i = r * cols + c, c0 = rad * ORTH;
      if (c0 < cost[i]) { cost[i] = c0; push(c0, i); }
    }
  }
  let cur = 0;
  while (pending > 0) {
    let e = head[cur & mask];
    if (e < 0) { cur++; continue; }
    head[cur & mask] = next[e]; pending--;
    const i = node[e];
    if (cost[i] !== cur) continue;
    const c = i % cols, r = (i - c) / cols;
    for (let k = 0; k < 8; k++) {
      const dc = DC[k], dr = DR[k], nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const j = i + dr * cols + dc, bj = blocked[j];
      if (bj === 1) continue;
      let step = ORTH;
      if (dc && dr) {
        // No diagonal corner-cutting past a blocked cell.
        if (blocked[i + dc] === 1 || blocked[i + dr * cols] === 1) continue;
        step = DIAG;
      }
      if (bj === 2) step += NEAR_COST;
      const sj = struct[j];
      if (sj) step += sCost[sj];
      const nc2 = cur + step;
      if (nc2 < cost[j]) { cost[j] = nc2; push(nc2, j); }
    }
  }
}
const DC = [1, -1, 0, 0, 1, 1, -1, -1], DR = [0, 0, 1, -1, 1, -1, 1, -1];

/** Rough walking distance (px) for a field cost. */
export function costToPx(cost: number) { return cost * CELL / ORTH; }

export interface Step { x: number; y: number; structure: Structure | null; cost: number }
/**
 * Downhill direction for a circle at (x,y), or null when (x,y) is outside the field or cut off from the goal.
 * Uses the cost-weighted average of all lower neighbours, which is much smoother than "best neighbour".
 * `structure` is set when the step leads into (or the circle stands in) a player structure on the path.
 */
export function step(f: Field, x: number, y: number): Step | null {
  const { cols, rows, cost, blocked, struct, structs } = f;
  let c = Math.floor((x - f.x0) / CELL), r = Math.floor((y - f.y0) / CELL);
  if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
  let i = r * cols + c;
  if (cost[i] === UNREACHED) {
    // Standing in a blocked rim cell (pushed against a wall): head for the best open neighbour.
    let best = UNREACHED, bi = -1;
    for (let k = 0; k < 8; k++) {
      const nc = c + DC[k], nr = r + DR[k];
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const j = nr * cols + nc;
      if (cost[j] < best) { best = cost[j]; bi = j; }
    }
    if (bi < 0) return null;
    const bc = bi % cols, br = (bi - bc) / cols;
    const tx = f.x0 + bc * CELL + CELL / 2 - x, ty = f.y0 + br * CELL + CELL / 2 - y, d = Math.hypot(tx, ty) || 1;
    return { x: tx / d, y: ty / d, structure: struct[bi] ? structs[struct[bi] - 1] : null, cost: best };
  }
  const here = cost[i];
  if (here === 0) {
    const tx = f.goalX - x, ty = f.goalY - y, d = Math.hypot(tx, ty) || 1;
    return { x: tx / d, y: ty / d, structure: null, cost: 0 };
  }
  let sx = 0, sy = 0, best = here, bi = -1;
  for (let k = 0; k < 8; k++) {
    const dc = DC[k], dr = DR[k], nc = c + dc, nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
    const j = nr * cols + nc, cj = cost[j];
    if (cj >= here) continue;
    if (dc && dr && (blocked[r * cols + nc] === 1 || blocked[nr * cols + c] === 1)) continue;
    const w = (here - cj) / (dc && dr ? 1.414 : 1);
    sx += dc * w; sy += dr * w;
    if (cj < best) { best = cj; bi = j; }
  }
  if (bi < 0) return null;
  // Aim from the circle's actual position toward the best neighbour's centre, blended with the gradient,
  // so a circle off the cell centre still rounds corners instead of grinding along them.
  const bc = bi % cols, br = (bi - bc) / cols;
  let tx = f.x0 + bc * CELL + CELL / 2 - x, ty = f.y0 + br * CELL + CELL / 2 - y;
  const td = Math.hypot(tx, ty) || 1, gd = Math.hypot(sx, sy) || 1;
  tx = tx / td + sx / gd; ty = ty / td + sy / gd;
  const d = Math.hypot(tx, ty) || 1;
  return { x: tx / d, y: ty / d, structure: struct[bi] ? structs[struct[bi] - 1] : null, cost: here };
}
