// hive-world.ts — the Hollow, the map of "The Hive Below": seven six-sided cells carved out of solid rock
// (six brood cells in a ring, the royal cell in the middle) plus the Breach, the open-air crater you enter from.
// 200 x 200 tiles of 80px = the same 16000px world as the city. Deterministic: one authored layout.
// It presents the same RoadWorld shape as road-world.ts, so sim/road.ts drives missions over it unchanged.
import { WORLD, CELL, Grid, phys } from './core';
import { gen, finalizeVisuals } from './world';
import type { GameState, Rect, Vec } from './types';
import type { RoadWorld, Sector, Gate } from './road-world';

export const TILE = 80, N = WORLD.w / TILE;
const HEX = 36.25, CX = 100, CY = 100, D = Math.sqrt(3) * HEX, INNER = 0.93;
/** Zone ids: 1..6 brood cells along the route, 7 the royal cell, 8 the Breach. */
export const ZONE_NAMES = ['', 'The Warrens', 'The Granary', 'The Paper Hive', 'The Boiling Galleries', 'The Lantern Deep', 'The Rot Cellar', 'The Royal Cell', 'The Breach'];
/** Glow colour of each zone's resin / fungus (lighting) and its floor tint (ground, map). */
export const ZONE_GLOW = [0, 0xf0a93a, 0x9fd36b, 0xf2d25a, 0xff8a3a, 0x58b8d0, 0xa98bd0, 0xb48cff, 0xbfd6ff];
export const ZONE_FLOOR = [0x0c0a08, 0x7a5530, 0x5c7038, 0x9a8840, 0x8a4426, 0x28505c, 0x5a4a66, 0x6a44a8, 0x59636d];
/** Mission sector index (0 = the Breach, 1..7 = cells) -> zone id. */
export const zoneOfSector = (sector: number) => sector === 0 ? 8 : sector;

export interface HiveGlow extends Vec {
  r: number; col: number; i: number;
  /** wall: a lump of glowing resin or fungus. flood: a dam floodlight, dark until the breaker is thrown. fill: light with
   *  no visible source (arenas, the rift). camp: the lamp of checkpoint camp `camp`, lit once that camp has been made. */
  kind: 'wall' | 'flood' | 'fill' | 'camp'; camp?: number;
}
export interface HiveInfo {
  n: number; tile: number;
  /** 1 = floor */ floor: Uint8Array;
  /** zone id per tile (0 = rock outside every cell) */ zone: Uint8Array;
  /** burrow mouths per zone: floor spots against a wall */ burrows: Vec[][];
  /** egg nurseries per zone: dead-end spots */ eggs: Vec[][];
  /** per zone: open spots well off the route, where the hive left what it dragged down (supplies) */ nooks: Vec[][];
  glows: HiveGlow[];
  /** boss arena centre per zone */ arenas: Vec[];
  /** tile indices of the shortest walkable route through every arena, in order */ route: number[];
  /** the open-air crater (px): centre and radii of the drained bed. Darkness deepens as you leave it. */
  breach: { x: number; y: number; rx: number; ry: number };
  /** the dam wall along the bed's north side, and the tear in the mud (px) */ dam: Rect; rift: Vec;
  /** one per gate: the middle of the door tunnel and the direction it runs */ seals: (Vec & { angle: number })[];
}

// small deterministic generator (the layout must never depend on the run's seed)
function mulberry(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const TAU = Math.PI * 2;
const NB: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const px = (t: number) => (t + 0.5) * TILE;

export function build(state: GameState): RoadWorld {
  state.roads = []; state.buildings = []; state.containers = []; state.decor = []; state.pois = [];
  state.grid = new Grid(WORLD.w, WORLD.h, CELL);
  const grid = new Uint8Array(N * N), zone = new Uint8Array(N * N), rnd = mulberry(0x48495645);
  const I = (x: number, y: number) => y * N + x, inb = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;
  const centers: Vec[] = [{ x: 0, y: 0 }];
  for (const a of [240, 300, 0, 60, 120, 180]) centers.push({ x: CX + D * Math.cos(a * Math.PI / 180), y: CY + D * Math.sin(a * Math.PI / 180) });
  centers.push({ x: CX, y: CY });
  const hexD = (x: number, y: number, c: Vec, r = HEX) => { const dx = Math.abs(x - c.x), dy = Math.abs(y - c.y); return Math.max(dx / (r * 0.8660254), (dy + dx / 1.7320508) / r); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let z = 1; z <= 7; z++) if (hexD(x + 0.5, y + 0.5, centers[z]) <= 1) { zone[I(x, y)] = z; break; }
  const inside = (x: number, y: number, z: number) => inb(x, y) && zone[I(x, y)] === z && hexD(x + 0.5, y + 0.5, centers[z]) <= INNER;

  /** z = 0 carves anywhere (doors), z = 8 carves anywhere outside the cells (the Breach), v = 0 fills back in. */
  function disc(cx: number, cy: number, r: number, z: number, v = 1) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!inb(x, y) || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
      if (z > 0 && z < 8 && !inside(x, y, z)) continue;
      if (z === 8 && zone[I(x, y)] && zone[I(x, y)] !== 8) continue;
      grid[I(x, y)] = v; if (z === 8) zone[I(x, y)] = 8;
    }
  }
  function tunnel(a: Vec, b: Vec, w: number, z: number, wig = 0) {
    const len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(2, Math.ceil(len * 2)), nx = -(b.y - a.y) / (len || 1), ny = (b.x - a.x) / (len || 1), ph = rnd() * 6, waves = Math.max(1, Math.round(len / 9));
    for (let i = 0; i <= n; i++) { const t = i / n, o = Math.sin(t * Math.PI * waves + ph) * wig * Math.sin(t * Math.PI); disc(a.x + (b.x - a.x) * t + nx * o, a.y + (b.y - a.y) * t + ny * o, w / 2, z); }
  }
  const pick = (z: number): Vec => { for (let k = 0; k < 400; k++) { const x = centers[z].x + (rnd() * 2 - 1) * HEX, y = centers[z].y + (rnd() * 2 - 1) * HEX; if (hexD(x, y, centers[z]) <= 0.8) return { x, y }; } return { ...centers[z] }; };

  // ---- doors: the way in from the Breach, then one on each shared wall along the route
  interface Door { from: number; to: number; x: number; y: number; a: Vec; b: Vec; ux: number; uy: number }
  const doors: Door[] = [];
  const door = (from: number, to: number, m: Vec, u: Vec) => doors.push({ from, to, x: m.x, y: m.y, ux: u.x, uy: u.y, a: { x: m.x - u.x * 4.6, y: m.y - u.y * 4.6 }, b: { x: m.x + u.x * 4.6, y: m.y + u.y * 4.6 } });
  door(8, 1, { x: centers[1].x - HEX * 0.866, y: centers[1].y - 5 }, { x: 1, y: 0 });
  for (let z = 1; z <= 6; z++) { const a = centers[z], b = centers[z + 1], l = Math.hypot(b.x - a.x, b.y - a.y); door(z, z + 1, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, { x: (b.x - a.x) / l, y: (b.y - a.y) / l }); }
  const entry = (z: number) => doors[z - 1].b, exit = (z: number) => doors[z].a;

  // ---- boss arenas: just inside each cell's exit (the Granary's is its centre, the Queen's the middle of everything)
  const AR = [0, 6.5, 9.5, 7.5, 0, 8, 7.5, 10];
  const arenas: Vec[] = [{ x: 0, y: 0 }];
  for (let z = 1; z <= 6; z++) { const d = doors[z]; arenas.push(z === 2 ? { ...centers[2] } : { x: d.a.x - d.ux * (AR[z] + 5), y: d.a.y - d.uy * (AR[z] + 5) }); }
  arenas.push({ x: CX, y: CY });

  // ---- 8: the Breach. Open air: the drained reservoir bed, the dam along its north side, the rift at its south-east end.
  for (let y = 14; y < 40; y++) for (let x = 3; x < 35; x++) { const e = Math.hypot((x + 0.5 - 19.5) / 14.5, (y + 0.5 - 27) / 10.5); if (e <= 1 + 0.05 * Math.sin(x * 0.9) + 0.04 * Math.sin(y * 1.3 + x * 0.4) && !zone[I(x, y)]) { grid[I(x, y)] = 1; zone[I(x, y)] = 8; } }
  for (let x = 6; x < 33; x++) for (let y = 14; y <= 17; y++) if (zone[I(x, y)] === 8) grid[I(x, y)] = 0;   // the dam: a straight wall
  tunnel({ x: 29.5, y: 33.5 }, doors[0].a, 3, 8, 0.8);
  const rift = { x: 29.5, y: 33.5 }, dam = { x: 19.5, y: 19.8 }, start = { x: 8.5, y: 26.5 };

  // ---- 1: the Warrens: small chambers joined by narrow, winding tunnels
  const chambers: (Vec & { r: number })[] = [];
  { const z = 1;
    for (let k = 0; k < 500 && chambers.length < 17; k++) { const p = pick(z); if (Math.hypot(p.x - arenas[z].x, p.y - arenas[z].y) < 12 || chambers.some(q => Math.hypot(p.x - q.x, p.y - q.y) < 8)) continue; chambers.push({ ...p, r: 2.6 + rnd() * 2 }); }
    for (const p of chambers) disc(p.x, p.y, p.r, z);
    const tree = [chambers[0]], rest = chambers.slice(1);
    while (rest.length) { let bi = 0, bj = 0, bd = 1e9; rest.forEach((p, i) => tree.forEach((q, j) => { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd) { bd = d; bi = i; bj = j; } })); tunnel(rest[bi], tree[bj], 2.2, z, 1.6); tree.push(rest.splice(bi, 1)[0]); }
    for (let i = 0; i < chambers.length; i++) for (let j = i + 1; j < chambers.length; j++) if (Math.hypot(chambers[i].x - chambers[j].x, chambers[i].y - chambers[j].y) < 13 && rnd() < 0.35) tunnel(chambers[i], chambers[j], 2.1, z, 1.2);
    const near = (p: Vec) => chambers.reduce((a, q) => Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? q : a);
    tunnel(entry(z), near(entry(z)), 2.6, z, 1); disc(arenas[z].x, arenas[z].y, AR[z], z); tunnel(arenas[z], near(arenas[z]), 2.6, z, 1.2);
  }
  // ---- 2: the Granary: one huge open cavern with rock pillars
  { const z = 2, c = centers[z];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (zone[I(x, y)] === z && hexD(x + 0.5, y + 0.5, c) <= 0.83 + 0.035 * Math.sin(x * 0.37) + 0.03 * Math.sin(y * 0.43 + x * 0.11)) grid[I(x, y)] = 1;
    for (let k = 0, n = 0; k < 300 && n < 17; k++) { const p = pick(z); if (Math.hypot(p.x - c.x, p.y - c.y) < 12.5 || Math.hypot(p.x - entry(z).x, p.y - entry(z).y) < 8 || Math.hypot(p.x - exit(z).x, p.y - exit(z).y) < 8) continue; disc(p.x, p.y, 1.3 + rnd() * 1.6, z, 0); n++; }
    disc(c.x, c.y, AR[z], z);
  }
  // ---- 3: the Paper Hive: a comb of small six-sided rooms with thin walls
  { const z = 3, c = centers[z], rr = 3.5, sx = 8.1, sy = 7, rooms: Vec[] = [];
    for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) { const p = { x: c.x + i * sx + (j & 1 ? sx / 2 : 0), y: c.y + j * sy }; if (hexD(p.x, p.y, c) > 0.8 || Math.hypot(p.x - arenas[z].x, p.y - arenas[z].y) < AR[z] + 3.4) continue; rooms.push(p); }
    for (const p of rooms) for (let y = Math.floor(p.y - rr); y <= p.y + rr; y++) for (let x = Math.floor(p.x - rr); x <= p.x + rr; x++) if (inside(x, y, z) && hexD(x + 0.5, y + 0.5, p, rr) <= 1) grid[I(x, y)] = 1;
    rooms.forEach((p, i) => rooms.forEach((q, j) => { if (j > i && Math.hypot(p.x - q.x, p.y - q.y) < 8.6 && rnd() < 0.7) tunnel(p, q, 2, z, 0); }));
    const A = arenas[z]; for (let y = Math.floor(A.y - AR[z]); y <= A.y + AR[z]; y++) for (let x = Math.floor(A.x - AR[z]); x <= A.x + AR[z]; x++) if (inside(x, y, z) && hexD(x + 0.5, y + 0.5, A, AR[z]) <= 1) grid[I(x, y)] = 1;
    const near = (p: Vec) => rooms.reduce((a, q) => Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? q : a);
    tunnel(entry(z), near(entry(z)), 2.4, z, 0); tunnel(A, near(A), 2.4, z, 0);
  }
  // ---- 4: the Boiling Galleries: three ring galleries around a vent core, and a pillared hall
  const vents: Vec[] = [];
  { const z = 4, c = centers[z], off = rnd() * 6;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (!inside(x, y, z)) continue; const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y); if (d <= 5 || Math.abs(d - 10.5) <= 1.7 || Math.abs(d - 18.5) <= 1.8 || Math.abs(d - 26) <= 1.8) grid[I(x, y)] = 1; }
    for (let k = 0; k < 7; k++) { const a = off + k * TAU / 7, r0 = k % 2 ? 4 : 10, r1 = k % 3 === 0 ? 26 : 18.5; tunnel({ x: c.x + Math.cos(a) * r0, y: c.y + Math.sin(a) * r0 }, { x: c.x + Math.cos(a) * r1, y: c.y + Math.sin(a) * r1 }, 2.5, z, 0); }
    for (let k = 0; k < 16; k++) { const a = rnd() * TAU, r = [10.5, 18.5, 26][k % 3]; vents.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }); }
    const A = arenas[z]; for (let y = Math.floor(A.y - 6.5); y <= A.y + 6.5; y++) for (let x = Math.floor(A.x - 9); x <= A.x + 9; x++) if (inside(x, y, z)) grid[I(x, y)] = 1;
    for (const [dx, dy] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) disc(A.x + dx, A.y + dy, 1.2, z, 0);
    tunnel(entry(z), { x: c.x + (entry(z).x - c.x) * 0.72, y: c.y + (entry(z).y - c.y) * 0.72 }, 2.6, z, 0); tunnel(A, { x: c.x + (A.x - c.x) * 0.5, y: c.y + (A.y - c.y) * 0.5 }, 2.6, z, 0);
  }
  // ---- 5: the Lantern Deep: a forest of thin pillars, and a ringed chapel
  { const z = 5, c = centers[z], A = arenas[z];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (zone[I(x, y)] === z && hexD(x + 0.5, y + 0.5, c) <= 0.85 + 0.03 * Math.sin(x * 0.5 + y * 0.2)) grid[I(x, y)] = 1;
    for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) { const x = c.x + i * 4.7 + (j & 1 ? 2.3 : 0) + (rnd() - 0.5) * 2, y = c.y + j * 4.3 + (rnd() - 0.5) * 2; if (rnd() < 0.2 || Math.hypot(x - A.x, y - A.y) < AR[z] + 1.5 || Math.hypot(x - entry(z).x, y - entry(z).y) < 5) continue; disc(x, y, 0.8 + rnd() * 0.9, z, 0); }
    disc(A.x, A.y, AR[z], z); for (let k = 0; k < 8; k++) disc(A.x + Math.cos(k * TAU / 8 + 0.39) * 5.6, A.y + Math.sin(k * TAU / 8 + 0.39) * 5.6, 0.8, z, 0);
  }
  // ---- 6: the Rot Cellar: blobby, half-flooded cellars grown with a cave automaton
  { const z = 6, c = centers[z];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (zone[I(x, y)] === z && hexD(x + 0.5, y + 0.5, c) <= 0.86 && rnd() < 0.485) grid[I(x, y)] = 1;
    for (let it = 0; it < 5; it++) { const nx = grid.slice(); for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) { if (zone[I(x, y)] !== z) continue; if (hexD(x + 0.5, y + 0.5, c) > 0.86) { nx[I(x, y)] = 0; continue; } let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += grid[I(x + dx, y + dy)]; nx[I(x, y)] = n >= 5 ? 1 : 0; } grid.set(nx); }
    disc(arenas[z].x, arenas[z].y, AR[z], z);
    tunnel(entry(z), c, 2.6, z, 2.4); tunnel(c, arenas[z], 2.6, z, 2);
  }
  // ---- 7: the Royal Cell: guard ring, six seal alcoves, throne chamber
  { const z = 7, c = centers[z];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (!inside(x, y, z)) continue; const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y); if (d <= AR[z] || Math.abs(d - 23) <= 1.9) grid[I(x, y)] = 1; }
    for (let k = 0; k < 6; k++) { const a = k * TAU / 6; tunnel({ x: c.x + Math.cos(a) * 23, y: c.y + Math.sin(a) * 23 }, { x: c.x + Math.cos(a) * 28.6, y: c.y + Math.sin(a) * 28.6 }, 3, z, 0); }
    for (const a of [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6]) tunnel({ x: c.x + Math.cos(a) * 9, y: c.y + Math.sin(a) * 9 }, { x: c.x + Math.cos(a) * 23, y: c.y + Math.sin(a) * 23 }, 2.8, z, 0);
  }
  // ---- cut the doors, a camp pocket at every exit, link each arena to its exit, then make every cell one connected space
  for (const d of doors) tunnel(d.a, d.b, 3, 0, 0);
  for (let z = 1; z <= 6; z++) { tunnel(arenas[z], exit(z), 2.8, z, z === 2 ? 0 : 0.6); disc(exit(z).x - doors[z].ux * 1.2, exit(z).y - doors[z].uy * 1.2, 2.6, z); }
  for (let z = 1; z <= 7; z++) tunnel(entry(z), { x: entry(z).x + (centers[z].x - entry(z).x) * 0.16, y: entry(z).y + (centers[z].y - entry(z).y) * 0.16 }, 2.8, z, 0);
  function flood(sx: number, sy: number, seen: Uint8Array) { const q = [I(sx, sy)]; seen[q[0]] = 1; for (let h = 0; h < q.length; h++) { const p = q[h], x = p % N, y = (p / N) | 0; for (const [dx, dy] of NB) { const X = x + dx, Y = y + dy; if (!inb(X, Y)) continue; const k = I(X, Y); if (!seen[k] && grid[k]) { seen[k] = 1; q.push(k); } } } return q; }
  for (let z = 1; z <= 7; z++) for (let pass = 0; pass < 160; pass++) {
    const seen = new Uint8Array(N * N), e = entry(z), main = flood(Math.round(e.x), Math.round(e.y), seen);
    let lost = -1; for (let k = 0; k < N * N; k++) if (grid[k] && zone[k] === z && !seen[k]) { lost = k; break; }
    if (lost < 0) break;
    const comp = flood(lost % N, (lost / N) | 0, new Uint8Array(N * N));
    if (comp.length < 6) { for (const k of comp) grid[k] = 0; continue; }
    let best: [Vec, Vec] | null = null, bd = 1e9;
    for (let i = 0; i < comp.length; i += 3) { const x = comp[i] % N, y = (comp[i] / N) | 0; for (let j = 0; j < main.length; j += 5) { if (zone[main[j]] !== z) continue; const X = main[j] % N, Y = (main[j] / N) | 0, d = (X - x) * (X - x) + (Y - y) * (Y - y); if (d < bd) { bd = d; best = [{ x, y }, { x: X, y: Y }]; } } }
    if (!best) break; tunnel({ x: best[0].x + 0.5, y: best[0].y + 0.5 }, { x: best[1].x + 0.5, y: best[1].y + 0.5 }, 2.2, z, 0);
  }
  // single-tile pinches are too tight for a column: widen any floor tile with rock on both opposite sides
  for (let pass = 0; pass < 2; pass++) for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    if (!grid[I(x, y)]) continue; const z = zone[I(x, y)];
    if (!grid[I(x - 1, y)] && !grid[I(x + 1, y)]) { const X = inside(x + 1, y, z) || z === 8 ? x + 1 : x - 1; if (zone[I(X, y)] === z || z === 8) { grid[I(X, y)] = 1; if (z === 8) zone[I(X, y)] = 8; } }
    if (!grid[I(x, y - 1)] && !grid[I(x, y + 1)]) { const Y = inside(x, y + 1, z) || z === 8 ? y + 1 : y - 1; if (zone[I(x, Y)] === z || z === 8) { grid[I(x, Y)] = 1; if (z === 8) zone[I(x, Y)] = 8; } }
  }

  // door tunnels run through the rock between two cells: every floor tile belongs to the cell it is nearest to on foot
  { const q: number[] = []; for (let k = 0; k < N * N; k++) if (grid[k] && zone[k]) q.push(k);
    for (let h = 0; h < q.length; h++) { const p = q[h], x = p % N, y = (p / N) | 0; for (const [dx, dy] of NB) { const X = x + dx, Y = y + dy; if (!inb(X, Y)) continue; const k = I(X, Y); if (grid[k] && !zone[k]) { zone[k] = zone[p]; q.push(k); } } }
    for (let k = 0; k < N * N; k++) if (grid[k] && !zone[k]) grid[k] = 0; }

  // ---- the route: shortest walkable path through every arena, in order
  function path(a: Vec, b: Vec) {
    const s = I(Math.round(a.x), Math.round(a.y)), g = I(Math.round(b.x), Math.round(b.y)), prev = new Int32Array(N * N).fill(-1), q = [s]; prev[s] = s;
    for (let h = 0; h < q.length && prev[g] < 0; h++) { const p = q[h], x = p % N, y = (p / N) | 0; for (const [dx, dy] of NB) { const X = x + dx, Y = y + dy; if (!inb(X, Y)) continue; const k = I(X, Y); if (prev[k] < 0 && grid[k]) { prev[k] = p; q.push(k); } } }
    const out: number[] = []; if (prev[g] < 0) return out; for (let p = g; p !== s; p = prev[p]) out.push(p); out.push(s); return out.reverse();
  }
  const stops: Vec[] = [start]; for (let z = 1; z <= 6; z++) stops.push(entry(z), arenas[z], exit(z)); stops.push(entry(7), arenas[7]);
  const route: number[] = []; for (let i = 0; i < stops.length - 1; i++) route.push(...path(stops[i], stops[i + 1]));

  // ---- burrow mouths (floor against a wall) and egg nurseries (dead ends), a few per cell
  const burrows: Vec[][] = Array.from({ length: 9 }, () => []), eggs: Vec[][] = Array.from({ length: 9 }, () => []);
  const wallSide = (x: number, y: number) => NB.some(([dx, dy]) => !grid[I(x + dx, y + dy)]);
  const openSides = (x: number, y: number) => NB.reduce((n, [dx, dy]) => n + grid[I(x + dx, y + dy)], 0);
  for (let z = 1; z <= 6; z++) {
    for (let n = 0, k = 0; n < 10 && k < 6000; k++) {
      const p = pick(z), x = Math.round(p.x), y = Math.round(p.y);
      if (!grid[I(x, y)] || !wallSide(x, y) || openSides(x, y) < 2) continue;
      if (Math.hypot(x - arenas[z].x, y - arenas[z].y) < AR[z] + 3 || Math.hypot(x - entry(z).x, y - entry(z).y) < 9 || Math.hypot(x - exit(z).x, y - exit(z).y) < 7) continue;
      if (burrows[z].some(b => Math.hypot(b.x - px(x), b.y - px(y)) < 9 * TILE)) continue;
      burrows[z].push({ x: px(x), y: px(y) }); n++;
    }
  }
  // ---- nooks: open floor at least five tiles from the route and nine from each other
  const nooks: Vec[][] = Array.from({ length: 9 }, () => []);
  { const far = new Int16Array(N * N).fill(-1), q: number[] = [];
    for (const k of route) if (far[k] < 0) { far[k] = 0; q.push(k); }
    for (let h = 0; h < q.length; h++) { const p = q[h], x = p % N, y = (p / N) | 0; for (const [dx, dy] of NB) { const X = x + dx, Y = y + dy; if (!inb(X, Y)) continue; const k = I(X, Y); if (far[k] < 0 && grid[k]) { far[k] = far[p] + 1; q.push(k); } } }
    for (let z = 1; z <= 6; z++) for (let k = 0; k < 4000 && nooks[z].length < 12; k++) {
      const p = pick(z), x = Math.round(p.x), y = Math.round(p.y);
      if (!grid[I(x, y)] || far[I(x, y)] < 5 || openSides(x, y) < 4) continue;
      if (Math.hypot(x - arenas[z].x, y - arenas[z].y) < AR[z] + 2 || nooks[z].some(b => Math.hypot(b.x - px(x), b.y - px(y)) < 9 * TILE)) continue;
      nooks[z].push({ x: px(x), y: px(y) });
    }
  }
  // ---- sites (rects in px). The Warrens' three stops sit on the route, a quarter, a half and three quarters of the way in.
  const world: RoadWorld = { sectors: [], gates: [], sites: {}, camps: [], start: { x: px(start.x - 0.5), y: px(start.y - 0.5) }, walls: [] };
  const site = (id: string, c: Vec, half: number, name: string) => { (world.sites as Record<string, Rect & { name: string }>)[id] = { x: c.x - half, y: c.y - half, w: half * 2, h: half * 2, name }; };
  site('dam', { x: px(dam.x - 0.5), y: px(dam.y - 0.5) }, 200, 'The dam wall');
  site('rift', { x: px(rift.x - 0.5), y: px(rift.y - 0.5) }, 160, 'The rift');
  { const z = 1, seg = route.filter(k => zone[k] === z), a0 = route.indexOf(seg[0]);
    const arenaAt = seg.findIndex(k => Math.hypot(k % N - arenas[z].x, ((k / N) | 0) - arenas[z].y) < 2);
    const along = (f: number) => { const k = route[a0 + Math.round((arenaAt > 0 ? arenaAt : seg.length) * f)]; const t = { x: k % N + 0.5, y: ((k / N) | 0) + 0.5 }; const c = chambers.reduce((a, q) => Math.hypot(q.x - t.x, q.y - t.y) < Math.hypot(a.x - t.x, a.y - t.y) ? q : a); return Math.hypot(c.x - t.x, c.y - t.y) < 5 ? { x: c.x * TILE, y: c.y * TILE } : { x: t.x * TILE, y: t.y * TILE }; };
    const trail = along(0.2), nursery = along(0.48), cache = along(0.76);
    site('trail', trail, 170, 'The first chamber'); site('nursery', nursery, 240, 'The nursery'); site('cache', cache, 170, 'The dragged-down crates');
    site('parade', { x: arenas[z].x * TILE, y: arenas[z].y * TILE }, AR[z] * TILE, 'The parade ground');
    // the nursery gets three burrows of its own (the mission's objective) and the cell's egg clusters
    burrows[z] = burrows[z].filter(b => Math.hypot(b.x - nursery.x, b.y - nursery.y) > 6 * TILE);
    const ring: Vec[] = [];
    for (let y = Math.floor(nursery.y / TILE) - 6; y <= nursery.y / TILE + 6; y++) for (let x = Math.floor(nursery.x / TILE) - 6; x <= nursery.x / TILE + 6; x++) if (inb(x, y) && grid[I(x, y)] && zone[I(x, y)] === z && wallSide(x, y) && openSides(x, y) >= 2) ring.push({ x: px(x), y: px(y) });
    ring.sort((p, q) => Math.hypot(p.x - nursery.x, p.y - nursery.y) - Math.hypot(q.x - nursery.x, q.y - nursery.y));
    const own: Vec[] = []; for (const p of ring) { if (own.length >= 3) break; if (own.every(q => Math.hypot(p.x - q.x, p.y - q.y) > 3 * TILE)) own.push(p); }
    world.nurseryBurrows = own;
    for (const c of chambers) { const p = { x: c.x * TILE, y: c.y * TILE }; if (eggs[z].length < 6 && Math.hypot(p.x - nursery.x, p.y - nursery.y) > 5 * TILE && Math.hypot(p.x - trail.x, p.y - trail.y) > 4 * TILE && Math.hypot(p.x - cache.x, p.y - cache.y) > 4 * TILE && rnd() < 0.6) eggs[z].push(p); }
  }

  // ---- solids: every rock tile that touches floor, merged into rows; and the floor itself as flat decor rows
  const solidAt = (x: number, y: number) => { if (!inb(x, y) || grid[I(x, y)]) return false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inb(x + dx, y + dy) && grid[I(x + dx, y + dy)]) return true; return false; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!solidAt(x, y)) continue; let x1 = x; while (x1 + 1 < N && solidAt(x1 + 1, y)) x1++;
    phys.addSolid(state, { x: x * TILE, y: y * TILE, w: (x1 - x + 1) * TILE, h: TILE, kind: 'wall', sub: 'rock', solid: true, blocksSight: true, blocksBullets: true, campaignArt: true, hive: true } as never);
    x = x1;
  }

  // ---- sectors (0 = the Breach, 1..7 = cells), gates (the seals) and the camp at each exit
  const bbox = (z: number): Rect => { let x0 = N, y0 = N, x1 = 0, y1 = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((zone[I(x, y)] || 0) === z && (z !== 8 || grid[I(x, y)])) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x: (x0 - 2) * TILE, y: (y0 - 2) * TILE, w: (x1 - x0 + 5) * TILE, h: (y1 - y0 + 5) * TILE }; };
  const P = (v: Vec): Vec => ({ x: v.x * TILE, y: v.y * TILE });
  for (let s = 0; s <= 7; s++) {
    const z = zoneOfSector(s);
    const sec: Sector = { id: s, col: 0, row: 0, rect: bbox(z), district: 'industrial', name: ZONE_NAMES[z], entry: s === 0 ? world.start : P(entry(z)), exit: s === 0 ? P(doors[0].a) : s < 7 ? P(exit(z)) : P(arenas[7]) };
    world.sectors.push(sec);
  }
  doors.forEach((d, i) => {
    // a seal is a thin plug across a tunnel that runs straight along x or y; a diagonal tunnel needs the whole square
    const gw = Math.abs(d.ux) > 0.99 ? 112 : 340, gh = Math.abs(d.uy) > 0.99 ? 112 : 340;
    const g: Gate = { id: i, from: i, to: i + 1, dir: Math.abs(d.ux) >= Math.abs(d.uy) ? 'v' : 'h', open: false, x: d.x * TILE - gw / 2, y: d.y * TILE - gh / 2, w: gw, h: gh };
    world.gates.push(g);
  });
  world.camps.push({ x: px(rift.x - 0.5) - 60, y: px(rift.y - 0.5) - 90 });
  for (let z = 1; z <= 6; z++) world.camps.push({ x: (exit(z).x - doors[z].ux * 1.2) * TILE, y: (exit(z).y - doors[z].uy * 1.2) * TILE });
  world.camps.push(P(arenas[7]));

  // ---- lights: resin and fungus glow along the walls, the dam's floodlights, the rift, a lamp at every camp
  const glows: HiveGlow[] = [];
  for (let y = 2; y < N - 2; y += 1) for (let x = 2; x < N - 2; x += 1) {
    if (!grid[I(x, y)] || !wallSide(x, y)) continue; const z = zone[I(x, y)] || 8; if (z === 5 || z === 8) continue;
    const gx = px(x), gy = px(y); if (glows.some(g => Math.abs(g.x - gx) < 440 && Math.abs(g.y - gy) < 440 && Math.hypot(g.x - gx, g.y - gy) < 440)) continue;
    glows.push({ x: gx, y: gy, r: 380, col: ZONE_GLOW[z], i: 0.5, kind: 'wall' });
  }
  for (const k of [-2, -1, 0, 1, 2]) glows.push({ x: px(dam.x - 0.5) + k * 420, y: 18.6 * TILE, r: 620, col: 0xdfe8ff, i: 0.62, kind: 'flood' });
  glows.push({ x: px(rift.x - 0.5), y: px(rift.y - 0.5), r: 460, col: 0xb48cff, i: 0.9, kind: 'fill' });
  world.camps.forEach((c, i) => glows.push({ x: c.x, y: c.y, r: 340, col: 0xffd9a0, i: 0.7, kind: 'camp', camp: i }));
  for (let z = 1; z <= 7; z++) glows.push({ x: arenas[z].x * TILE, y: arenas[z].y * TILE, r: 620, col: ZONE_GLOW[z], i: 0.5, kind: 'fill' });

  const info: HiveInfo = {
    n: N, tile: TILE, floor: grid, zone, burrows, eggs, nooks, glows, arenas: arenas.map(P), route,
    breach: { x: 19.5 * TILE, y: 27 * TILE, rx: 14.5 * TILE, ry: 10.5 * TILE },
    dam: { x: 6 * TILE, y: 14 * TILE, w: 27 * TILE, h: 4 * TILE }, rift: { x: px(rift.x - 0.5), y: px(rift.y - 0.5) },
    seals: doors.map(d => ({ x: d.x * TILE, y: d.y * TILE, angle: Math.atan2(d.uy, d.ux) })),
  };
  for (let s = 0; s <= 7; s++) { const r = world.sectors[s].rect; state.pois.push({ x: s === 0 ? info.breach.x : centers[s].x * TILE, y: s === 0 ? info.breach.y - 520 : centers[s].y * TILE - (s === 7 ? 1200 : 0), name: ZONE_NAMES[zoneOfSector(s)], kind: 'district' }); void r; }
  world.hive = info;

  // ---- shared lookups the rest of the sim expects from any world
  const M: Record<string, unknown> = { gen: state.seed, dcols: Math.ceil(WORLD.w / gen.DCELL), drows: Math.ceil(WORLD.h / gen.DCELL), inters: [] };
  M.dgrid = new Uint8Array((M.dcols as number) * (M.drows as number)).fill(gen.DCODE.industrial);
  gen.buildGrid(M, state.buildings);
  gen.attachMeta(state, M);
  finalizeVisuals(state);
  for (const o of state.grid.all()) if ((o as { hive?: boolean }).hive) o.sub = 'rock';
  state.spawnPoint = { ...world.start };
  return world;
}

/** The hive map of a running story, or null in the city. */
export const hiveOf = (state: GameState): HiveInfo | null => state.road?.world.hive ?? null;
/** True when (x,y) in px is carved floor. */
export function isFloor(h: HiveInfo, x: number, y: number) {
  const tx = Math.floor(x / h.tile), ty = Math.floor(y / h.tile);
  return tx >= 0 && ty >= 0 && tx < h.n && ty < h.n && h.floor[ty * h.n + tx] === 1;
}
export function zoneAt(h: HiveInfo, x: number, y: number) {
  const tx = Math.floor(x / h.tile), ty = Math.floor(y / h.tile);
  return tx >= 0 && ty >= 0 && tx < h.n && ty < h.n ? h.zone[ty * h.n + tx] : 0;
}
