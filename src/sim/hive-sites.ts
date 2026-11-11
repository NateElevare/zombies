// hive-sites.ts — the places the missions beyond the Warrens happen at, read off the carved map (sim/hive-world.ts).
// The map builder owns the cave; this module only measures it: stops along the route through each cell, the boss
// arenas, the spots a mission's burrows, combs, cocoons and heaps stand on, the steam vents of the Boiling Galleries
// and the walls the Lurkers of the Lantern Deep stand against. Deterministic: nothing here depends on the run's seed.
import { phys } from './core';
import type { GameState, Rect, Vec } from './types';
import type { RoadWorld, SiteId } from './road-world';
import { isFloor, type HiveInfo } from './hive-world';

type Named = Rect & { name: string };
/** [site id, share of the way from the cell's door to its arena, half size in px, name] */
const STOPS: Record<number, [SiteId, number, number, string][]> = {
  2: [['g_cross', 0.3, 200, 'The fungus rows'], ['g_choir', 0.58, 260, 'The choir'], ['g_pillar', 0.84, 200, 'The rock pillar']],
  3: [['p_combs', 0.3, 240, 'The brood combs'], ['p_cache', 0.56, 170, 'The paper store'], ['p_atrium', 0.86, 180, 'The atrium']],
  4: [['b_vents', 0.25, 200, 'The first gallery'], ['b_cache', 0.5, 170, 'The scalded crates'], ['b_gallery', 0.78, 240, 'The long gallery']],
  5: [['l_dark', 0.25, 200, 'The pillar forest'], ['l_cache', 0.5, 170, 'The dropped flares'], ['l_cocoons', 0.76, 260, 'The silk']],
  6: [['r_cellar', 0.3, 200, 'The flooded cellar'], ['r_heaps', 0.64, 260, 'The larder']],
  7: [['q_ring', 0.34, 220, 'The guard ring'], ['q_ante', 0.74, 200, 'The antechamber']],
};
const ARENAS: [number, SiteId, string][] = [[2, 'g_arena', 'The threshing floor'], [3, 'p_arena', 'The great comb'], [4, 'b_arena', 'The pillared hall'], [5, 'l_arena', 'The chapel'], [6, 'r_arena', 'The pit'], [7, 'q_throne', 'The throne']];

const centre = (h: HiveInfo, k: number): Vec => ({ x: (k % h.n + 0.5) * h.tile, y: (Math.floor(k / h.n) + 0.5) * h.tile });

/** Add the sites of cells 2 to 7 to a freshly built hive map. */
export function addSites(world: RoadWorld) {
  const h = world.hive; if (!h) return;
  const sites = world.sites as Record<string, Named>;
  const put = (id: string, c: Vec, half: number, name: string) => { sites[id] = { x: c.x - half, y: c.y - half, w: half * 2, h: half * 2, name }; };
  for (const [z, id, name] of ARENAS) put(id, h.arenas[z], 520, name);
  for (const z of Object.keys(STOPS).map(Number)) {
    const first = h.route.findIndex(k => h.zone[k] === z); if (first < 0) continue;
    // the part of the route from the cell's door to its arena
    let last = first; while (last + 1 < h.route.length && h.zone[h.route[last + 1]] === z) last++;
    const A = h.arenas[z];
    let arena = last; for (let i = first; i <= last; i++) { const c = centre(h, h.route[i]); if (Math.hypot(c.x - A.x, c.y - A.y) < 2.5 * h.tile) { arena = i; break; } }
    for (const [id, f, half, name] of STOPS[z]) put(id, centre(h, h.route[Math.round(first + (arena - first) * f)]), half, name);
  }
}

const NB: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function tiles(h: HiveInfo, zone: number, want: 'wall' | 'open') {
  const out: number[] = [], f = (x: number, y: number) => x >= 0 && y >= 0 && x < h.n && y < h.n && h.floor[y * h.n + x] === 1;
  for (let y = 1; y < h.n - 1; y++) for (let x = 1; x < h.n - 1; x++) {
    const k = y * h.n + x; if (!h.floor[k] || h.zone[k] !== zone) continue;
    let n = 0; for (const [dx, dy] of NB) if (f(x + dx, y + dy)) n++;
    if (want === 'wall' ? n >= 2 && n <= 3 : n === 4 && f(x + 1, y + 1) && f(x - 1, y - 1) && f(x + 1, y - 1) && f(x - 1, y + 1)) out.push(k);
  }
  return out;
}
const hash = (k: number) => { let t = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b); t ^= t >>> 13; t = Math.imul(t, 0xc2b2ae35); return (t ^ (t >>> 16)) >>> 0; };

/** `n` spots near `at` for a mission's own fixtures: against the rock for burrows, on open floor for the rest.
 *  Nearest first, at least three tiles apart and two and a half from the marker itself. */
export function fixtureSpots(state: GameState, at: Vec, n: number, wall: boolean): Vec[] {
  const h = state.road?.world.hive; if (!h) return [];
  const tx = Math.floor(at.x / h.tile), ty = Math.floor(at.y / h.tile), zone = h.zone[ty * h.n + tx];
  const cand = tiles(h, zone, wall ? 'wall' : 'open').map(k => centre(h, k)).filter(c => { const d = Math.hypot(c.x - at.x, c.y - at.y); return d > 2.5 * h.tile && d < 9 * h.tile && isFloor(h, c.x, c.y) && phys.isFree(state, c.x, c.y, 30); })
    .sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
  const out: Vec[] = [];
  for (const c of cand) { if (out.length >= n) break; if (out.every(o => Math.hypot(o.x - c.x, o.y - c.y) > 3 * h.tile)) out.push(c); }
  return out;
}
/** The steam vents of the Boiling Galleries: open floor, six tiles apart. */
export function vents(h: HiveInfo): Vec[] {
  const out: Vec[] = [];
  for (const k of tiles(h, 4, 'open').sort((a, b) => hash(a) - hash(b))) {
    const c = centre(h, k);
    if (h.arenas.some(a => Math.hypot(a.x - c.x, a.y - c.y) < 7 * h.tile)) continue;   // never in a boss arena
    if (out.every(o => Math.hypot(o.x - c.x, o.y - c.y) > 6 * h.tile)) out.push(c);
    if (out.length >= 44) break;
  }
  return out;
}
/** Where the Lurkers of a cell stand: against the rock, well apart, away from the camps and the arena. */
export function lurkSpots(state: GameState, zone: number, n: number, avoid: Vec[]): Vec[] {
  const h = state.road?.world.hive; if (!h) return [];
  const out: Vec[] = [];
  for (const k of tiles(h, zone, 'wall').sort((a, b) => hash(a) - hash(b))) {
    const c = centre(h, k);
    if (!phys.isFree(state, c.x, c.y, 18) || avoid.some(a => Math.hypot(a.x - c.x, a.y - c.y) < 9 * h.tile)) continue;
    if (out.every(o => Math.hypot(o.x - c.x, o.y - c.y) > 8 * h.tile)) out.push(c);
    if (out.length >= n) break;
  }
  return out;
}
