// road-world.ts — the hand-laid map of "The Long Road": nine quarantine sectors in a serpentine across the
// 16000x16000 world, built with the city generator's own tools (world.ts `gen`). Deterministic per seed.
import { WORLD, CELL, Grid, makeRng, phys } from './core';
import { gen, finalizeVisuals } from './world';
import type { GameState, Building, Rect, Vec, District } from './types';

const N = 3;                                   // 3 x 3 sectors
export const SECTOR = WORLD.w / N;             // 5333
const WALL = 44;                               // quarantine wall thickness
const GATE_W = 230;                            // gate opening along the wall
const MARGIN = 420;                            // sector wall -> first road line

export type SiteId =
  | 'haven' | 'havenYard' | 'pharmacy' | 'school' | 'gas' | 'overpass' | 'toll' | 'precinct' | 'dispatch'
  | 'hospital' | 'depot' | 'railcut' | 'pumping' | 'ranger' | 'clearing' | 'fort' | 'motorpool' | 'relay' | 'reservoir';

export interface Gate extends Rect { id: number; from: number; to: number; dir: 'h' | 'v'; open: boolean; }
export interface Sector { id: number; col: number; row: number; rect: Rect; district: District; name: string; entry: Vec; exit: Vec; }
export interface RoadWorld {
  sectors: Sector[];
  gates: Gate[];
  sites: Partial<Record<SiteId, Rect & { name: string; door?: Vec }>>;
  /** quarantine wall segments (drawn as barriers by render/road.ts) */
  walls: Rect[];
  /** checkpoint camps, index = mission that ends there (0-based) */
  camps: Vec[];
  start: Vec;
}

// sector order along the route: (col,row) pairs, row 2 = bottom
const ORDER: [number, number][] = [[0, 2], [1, 2], [2, 2], [2, 1], [1, 1], [0, 1], [0, 0], [1, 0], [2, 0]];
const DISTRICT: District[] = ['suburb', 'suburb', 'suburb', 'downtown', 'downtown', 'industrial', 'industrial', 'forest', 'military'];
const NAMES = ['Maple Heights', 'Cedar Hills', 'The Interchange', 'Downtown', 'St. Mercy District', 'Rustwater Yard', 'Rustwater North', 'Blackpine Woods', 'Fort Ashgrove'];
// route y for each row (the avenue that runs through the gates) and x of the turns between rows
const ROW_Y = [2700, 8200, 13500];
const TURN_X = [2700, 13300];   // x of the turn into row 0 (S6->S7) and into row 1 (S3->S4)

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const center = (r: Rect): Vec => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Evenly fill gaps between required coordinates so blocks stay 1000-1500px wide. */
function lines(a0: number, a1: number, required: number[], rng: { range(a: number, b: number): number }) {
  const pts = [a0, a1, ...required.filter(v => v > a0 + 300 && v < a1 - 300)].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const gap = pts[i + 1] - pts[i], n = Math.max(1, Math.round(gap / rng.range(1150, 1450)));
    for (let k = 0; k < n; k++) out.push(Math.round(pts[i] + gap * k / n + (k ? rng.range(-140, 140) : 0)));
  }
  out.push(a1);
  return out;
}

export function build(state: GameState): RoadWorld {
  state.roads = []; state.buildings = []; state.containers = []; state.decor = []; state.pois = [];
  state.grid = new Grid(WORLD.w, WORLD.h, CELL);
  const world: RoadWorld = { sectors: [], gates: [], sites: {}, camps: [], start: { x: 0, y: 0 }, walls: [] };
  const rngAll = makeRng((state.seed ^ 0x9e3779b9) >>> 0);

  // ---- sector frames, entries and exits
  for (let i = 0; i < 9; i++) {
    const [col, row] = ORDER[i];
    const r = rect(col * SECTOR, row * SECTOR, SECTOR, SECTOR);
    const s: Sector = { id: i, col, row, rect: r, district: DISTRICT[i], name: NAMES[i], entry: { x: 0, y: 0 }, exit: { x: 0, y: 0 } };
    world.sectors.push(s);
  }
  for (let i = 0; i < 9; i++) {
    const s = world.sectors[i], prev = world.sectors[i - 1], next = world.sectors[i + 1];
    const y = ROW_Y[s.row];
    s.entry = !prev ? { x: s.rect.x + 700, y } : prev.row !== s.row ? { x: TURN_X[s.row], y: s.rect.y + s.rect.h } : prev.col < s.col ? { x: s.rect.x, y } : { x: s.rect.x + s.rect.w, y };
    s.exit = !next ? { x: s.rect.x + s.rect.w - 1100, y: s.rect.y + 1130 } : next.row !== s.row ? { x: TURN_X[next.row], y: s.rect.y } : next.col > s.col ? { x: s.rect.x + s.rect.w, y } : { x: s.rect.x, y };
  }
  // ---- gates (one per sector boundary on the route)
  for (let i = 0; i < 8; i++) {
    const s = world.sectors[i], n = world.sectors[i + 1];
    const g: Gate = { id: i, from: i, to: i + 1, dir: n.row !== s.row ? 'h' : 'v', open: false, x: 0, y: 0, w: 0, h: 0 };
    if (g.dir === 'v') { g.x = s.exit.x - WALL / 2; g.y = s.exit.y - GATE_W / 2; g.w = WALL; g.h = GATE_W; }
    else { g.x = s.exit.x - GATE_W / 2; g.y = s.exit.y - WALL / 2; g.w = GATE_W; g.h = WALL; }
    world.gates.push(g);
    // the camp is on the route, 320px before the gate inside the finished sector
    const c = center(g);
    world.camps.push(g.dir === 'v' ? { x: c.x + (s.exit.x === s.rect.x ? 330 : -330), y: c.y - 165 } : { x: c.x - 165, y: c.y + 330 });
  }
  world.camps.push({ x: world.sectors[8].exit.x, y: world.sectors[8].exit.y });

  // ---- each sector is generated with its own context so the fills stay deterministic per sector
  const metas: any[] = [];
  for (const s of world.sectors) metas.push(buildSector(state, world, s, rngAll.int(0, 1e9)));

  // ---- quarantine walls across the whole map (the gates are the only openings)
  const wallSolid = (r: Rect) => { world.walls.push(r); return phys.addSolid(state, { ...r, kind: 'wall', sub: 'military', blocksSight: true, blocksBullets: true, solid: true, base: true, campaignArt: true } as any); };
  const openings = world.gates.map(g => ({ ...g }));
  const wallLine = (dir: 'h' | 'v', c: number, a0: number, a1: number) => {
    // split the line at every gate that sits on it
    const cuts = openings.filter(g => (dir === 'h' ? g.dir === 'h' && Math.abs(g.y + g.h / 2 - c) < 1 : g.dir === 'v' && Math.abs(g.x + g.w / 2 - c) < 1))
      .map(g => dir === 'h' ? [g.x, g.x + g.w] : [g.y, g.y + g.h]).sort((p, q) => p[0] - q[0]);
    let cur = a0;
    for (const [s0, s1] of cuts) { if (s0 > cur) wallSolid(dir === 'h' ? rect(cur, c - WALL / 2, s0 - cur, WALL) : rect(c - WALL / 2, cur, WALL, s0 - cur)); cur = s1; }
    if (a1 > cur) wallSolid(dir === 'h' ? rect(cur, c - WALL / 2, a1 - cur, WALL) : rect(c - WALL / 2, cur, WALL, a1 - cur));
  };
  for (let k = 1; k < N; k++) { wallLine('v', k * SECTOR, 0, WORLD.h); wallLine('h', k * SECTOR, 0, WORLD.w); }
  // outer border
  const B = 60;
  wallSolid(rect(B, B, WORLD.w - 2 * B, WALL)); wallSolid(rect(B, WORLD.h - B - WALL, WORLD.w - 2 * B, WALL));
  wallSolid(rect(B, B, WALL, WORLD.h - 2 * B)); wallSolid(rect(WORLD.w - B - WALL, B, WALL, WORLD.h - 2 * B));

  // ---- shared lookups
  const M: any = { gen: state.seed, dcols: Math.ceil(WORLD.w / gen.DCELL), drows: Math.ceil(WORLD.h / gen.DCELL) };
  M.dgrid = new Uint8Array(M.dcols * M.drows);
  for (const s of world.sectors) {
    const code = gen.DCODE[s.district];
    const c0 = Math.floor(s.rect.x / gen.DCELL), c1 = Math.min(M.dcols - 1, Math.floor((s.rect.x + s.rect.w - 1) / gen.DCELL));
    const r0 = Math.floor(s.rect.y / gen.DCELL), r1 = Math.min(M.drows - 1, Math.floor((s.rect.y + s.rect.h - 1) / gen.DCELL));
    for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) M.dgrid[j * M.dcols + i] = code;
  }
  M.inters = metas.flatMap(m => m.inters || []);
  gen.buildGrid(M, state.buildings);
  gen.attachMeta(state, M);
  finalizeVisuals(state);
  // containers are set dressing in this mode (searching them handed out too much ammo): the supplies are the bags placed per mission
  for (const c of state.containers) c.searched = true;
  world.start = { x: world.sectors[0].entry.x, y: world.sectors[0].entry.y };
  state.spawnPoint = { ...world.start };
  return world;
}

// ------------------------------------------------------------------ one sector
function buildSector(state: GameState, world: RoadWorld, s: Sector, seed: number) {
  const G: any = gen.newCtx(state);
  G.rng = makeRng((state.seed ^ seed) >>> 0);
  const rng = G.rng, R = s.rect, d = s.district;
  // what the generic commercial filler may still add: suburbs get stores and gas, downtown its specials, the Interchange one gun shop
  G.quota = d === 'downtown' ? { police: 1, hospital: 1, gun_store: 1, school: 3, gas_station: 2 }
    : { police: 9, hospital: 9, gun_store: s.id === 2 ? 4 : 9, school: 9, gas_station: s.id === 2 ? 3 : 5 };
  const x0 = R.x + MARGIN, x1 = R.x + R.w - MARGIN, y0 = R.y + MARGIN, y1 = R.y + R.h - MARGIN;
  const M: any = G.meta = { gen: state.seed, dcols: Math.ceil(WORLD.w / gen.DCELL), drows: Math.ceil(WORLD.h / gen.DCELL), excl: rect(-10, -10, 1, 1), inters: [] };
  M.dgrid = new Uint8Array(M.dcols * M.drows).fill(gen.DCODE[d]);
  const routeY = ROW_Y[s.row];
  const turnX = s.id === 2 ? TURN_X[1] : s.id === 5 ? TURN_X[0] : null;   // sectors that turn north

  // ground base for the whole sector
  gen.lot(G, R, d === 'forest' ? 'forest' : d === 'downtown' ? 'concrete' : d === 'industrial' ? 'gravel' : d === 'military' ? 'dirt' : 'grass');

  // military base + exclusion (S9)
  if (s.id === 8) {
    const B = rect(R.x + 1000, routeY - 1000, 2400, 2000);
    M.baseRect = B; M.excl = gen.grow(B, 320); M.gateSide = 'w'; M.gateY = routeY;
    world.sites.fort = { ...B, name: 'Fort Ashgrove' };
  }

  // ---- roads: required route lines + a grid
  const vReq = turnX ?? (s.entry.y === R.y + R.h ? s.entry.x : null);   // the north-south avenue (a turn, or the entry from below)
  const VX = lines(x0, x1, vReq !== null ? [vReq] : [], rng);
  const HY = lines(y0, y1, [routeY], rng);
  const isAvenueV = (c: number) => vReq !== null && Math.abs(c - vReq) < 2;
  const isAvenueH = (c: number) => Math.abs(c - routeY) < 2;
  for (const c of VX) {
    const av = isAvenueV(c), aw = av ? 150 : 100;
    const top = av && s.exit.y === R.y ? R.y : y0, bot = av && s.entry.y === R.y + R.h ? R.y + R.h : y1;
    gen.addRoad(G, 'v', top, bot, c, aw, av ? 'avenue' : d === 'forest' ? 'rural' : 'street');
  }
  for (const c of HY) {
    const av = isAvenueH(c), aw = av ? 150 : 100;
    const left = av && (s.entry.x === R.x || s.exit.x === R.x) ? R.x : x0;
    const right = av && (s.entry.x === R.x + R.w || s.exit.x === R.x + R.w) ? R.x + R.w : x1;
    gen.addRoad(G, 'h', left, right, c, aw, av ? 'avenue' : d === 'forest' ? 'rural' : 'street');
  }
  // entry road for S1 (the start), relay road for S9
  if (s.id === 8) {
    const B = M.baseRect;
    gen.addRoadRaw(G, { x: B.x - 320, y: routeY - 60, w: 320, h: 120, kind: 'rural', dir: 'h', sw: 0 });   // base gate access
    const relayX = R.x + R.w - 1550;
    gen.addRoad(G, 'v', R.y + 1050, routeY, relayX, 100, 'rural');
    gen.addRoadRaw(G, { x: relayX - 50, y: R.y + 1000, w: 700, h: 100, kind: 'rural', dir: 'h', sw: 0 });
  }
  gen.computeCrossings(G);

  // ---- blocks
  const SW = gen.SWALK;
  const blocks: { K: Rect; i: number; j: number }[] = [];
  const widthOf = (c: number, vert: boolean) => (vert ? isAvenueV(c) : isAvenueH(c)) ? 150 : 100;
  for (let i = 0; i < VX.length - 1; i++) for (let j = 0; j < HY.length - 1; j++) {
    const K: Rect = { x: Math.round(VX[i] + widthOf(VX[i], true) / 2 + SW), y: Math.round(HY[j] + widthOf(HY[j], false) / 2 + SW), w: 0, h: 0 };
    K.w = Math.round(VX[i + 1] - widthOf(VX[i + 1], true) / 2 - SW) - K.x;
    K.h = Math.round(HY[j + 1] - widthOf(HY[j + 1], false) / 2 - SW) - K.y;
    if (K.w < 300 || K.h < 300) continue;
    if (s.id === 8 && gen.ov(K, M.excl)) continue;
    blocks.push({ K, i, j });
  }
  const nearest = (p: Vec, used: Set<number>, minW = 0, minH = 0) => {
    let best = -1, bd = 1e12;
    blocks.forEach((b, k) => { if (used.has(k) || b.K.w < minW || b.K.h < minH) return; const c = center(b.K), dd = (c.x - p.x) ** 2 + (c.y - p.y) ** 2; if (dd < bd) { bd = dd; best = k; } });
    return best;
  };
  const used = new Set<number>();
  const site = (id: SiteId, b: Building | null, label?: string) => {
    if (!b) return;
    if (label) b.name = label;
    const door = b.doors[0];
    world.sites[id] = { x: b.x, y: b.y, w: b.w, h: b.h, name: b.name, door: door ? center(door) : center(b) };
  };
  const landmark = (id: SiteId, near: Vec, kind: string, label: string, opts: any, surface = 'concrete', minW = 700, minH = 600) => {
    const k = nearest(near, used, minW, minH); if (k < 0) return null;
    used.add(k);
    const K = blocks[k].K;
    gen.reserve(G, K); gen.lot(G, K, surface);
    const c = center(K);
    const front = Math.abs(near.y - c.y) > Math.abs(near.x - c.x) ? (near.y < c.y ? 'n' : 's') : (near.x < c.x ? 'w' : 'e');
    const b: Building | null = gen.lotBuilding(G, K, front, kind, opts);
    if (b) { site(id, b, label); gen.poi(G, b); }
    return b;
  };

  // ---- hand placed landmarks per sector (before the generic fills claim the blocks)
  switch (s.id) {
    case 0: { // Haven: a fire station at the start of the route
      const b = landmark('haven', s.entry, 'warehouse', 'Bellwether Fire Station 3', { side: 60, setback: 120, back: 60, maxW: 620, maxD: 420, preset: { name: 'Bellwether Fire Station 3', wallColor: '#6a3a30', roofColor: '#3a2a26', roofStyle: 'flat', windows: 0.5, doors: [{ side: 'front', w: 150 }, { side: 'back', w: 72 }] } }, 'concrete');
      if (b) world.sites.havenYard = { x: b.x - 160, y: b.y - 160, w: b.w + 320, h: b.h + 320, name: 'Station yard' };
      break;
    }
    case 1: {
      landmark('pharmacy', { x: R.x + R.w * 0.35, y: routeY - 900 }, 'store', 'CarePlus Pharmacy', { side: 60, setback: 150, back: 40, maxW: 520, maxD: 360, preset: { sub: 'pharmacy', tier: 1, name: 'CarePlus Pharmacy' } }, 'concrete');
      const k = nearest({ x: R.x + R.w * 0.7, y: routeY + 900 }, used, 900, 800);
      if (k >= 0) { used.add(k); gen.reserve(G, blocks[k].K); if (gen.fillSchool(G, blocks[k].K)) { const b = state.buildings[state.buildings.length - 1]; site('school', b, 'Cedar Hills High School'); } }
      break;
    }
    case 2: {
      landmark('gas', { x: R.x + 1500, y: routeY + 700 }, 'gas_station', 'Highway Gas', { side: 80, setback: 220, back: 40, maxW: 480, maxD: 300 }, 'concrete');
      // the overpass: a stretch of the turn avenue choked with wrecks and barriers
      const ox = TURN_X[1];
      world.sites.overpass = { x: ox - 75, y: routeY - 2200, w: 150, h: 1200, name: 'The Overpass' };
      world.sites.toll = { x: ox - 200, y: R.y + 250, w: 400, h: 260, name: 'Toll Plaza' };
      break;
    }
    case 3: {
      landmark('precinct', { x: R.x + R.w * 0.55, y: routeY - 800 }, 'police', 'Bellwether Police HQ', { side: 60, setback: 60, back: 40, maxW: 720, maxD: 520 }, 'concrete');
      landmark('dispatch', { x: R.x + 1400, y: routeY + 900 }, 'office', 'Emergency Dispatch Center', { side: 60, setback: 60, back: 40, maxW: 640, maxD: 520, preset: { name: 'Emergency Dispatch Center', windows: 0.9 } }, 'concrete');
      break;
    }
    case 4: {
      landmark('hospital', { x: R.x + R.w / 2, y: routeY - 1200 }, 'hospital', 'St. Mercy Hospital', { side: 60, setback: 80, back: 40, maxW: 1000, maxD: 700 }, 'concrete', 900, 800);
      break;
    }
    case 5: {
      landmark('depot', { x: R.x + R.w * 0.45, y: routeY + 1000 }, 'warehouse', 'Rustwater Freight Depot', { side: 60, setback: 140, back: 40, maxW: 900, maxD: 560, preset: { windows: 0.6 } }, 'gravel', 900, 700);
      break;
    }
    case 6: {
      landmark('pumping', { x: R.x + R.w - 1500, y: routeY - 600 }, 'warehouse', 'Municipal Pumping Station', { side: 80, setback: 140, back: 40, maxW: 560, maxD: 420, preset: { name: 'Municipal Pumping Station', wallColor: '#3e4a52', windows: 0.75 } }, 'gravel');
      const k = nearest({ x: R.x + R.w * 0.45, y: routeY - 1300 }, used, 900, 600);
      if (k >= 0) { used.add(k); const K = blocks[k].K; gen.reserve(G, K); railCut(G, K); world.sites.railcut = { ...K, name: 'Rail Cut' }; }
      break;
    }
    case 7: {
      const k = nearest({ x: R.x + R.w * 0.4, y: routeY - 800 }, used, 700, 600);
      if (k >= 0) { used.add(k); const K = blocks[k].K; const cl = { x: K.x + 40, y: K.y + 40, w: Math.min(620, K.w - 80), h: Math.min(560, K.h - 80) }; const b = gen.cabin(G, cl, 's', true); site('ranger', b, 'Blackpine Ranger Station'); }
      const k2 = nearest({ x: R.x + R.w * 0.72, y: routeY + 900 }, used, 700, 600);
      if (k2 >= 0) { used.add(k2); const K = blocks[k2].K; gen.reserve(G, K); gen.lot(G, K, 'dirt'); world.sites.clearing = { ...K, name: 'The Nest' }; gen.scatterDebris(G, K, 30); }
      break;
    }
    case 8: {
      gen.militaryBase(G);
      const B = M.baseRect;
      world.sites.motorpool = { x: B.x + B.w - 900, y: B.y + B.h - 700, w: 700, h: 500, name: 'Motor Pool' };
      // the relay above the reservoir in the far corner
      const relay = rect(R.x + R.w - 1300, R.y + 300, 800, 600);
      gen.reserve(G, gen.grow(relay, 200)); gen.lot(G, gen.grow(relay, 120), 'gravel');
      const b: Building | null = gen.lotBuilding(G, relay, 's', 'police', { side: 100, setback: 180, back: 60, maxW: 560, maxD: 360, preset: { layout: 'bsp', rooms: 2, minDim: 140, tier: 2, name: 'North Ridge Relay', wallColor: '#4a4e52', roofColor: '#2e3236', roofStyle: 'flat', windows: 0.95 } });
      site('relay', b, 'North Ridge Relay');
      if (!world.sites.relay) world.sites.relay = { ...relay, name: 'North Ridge Relay', door: center(relay) };
      const water = rect(R.x + R.w - 1400, R.y + 1250, 1250, 750);
      gen.reserve(G, water); gen.lot(G, water, 'water');
      // keep the generic fills (cabins, warehouses, parking) well away from the relay hill and the water
      blocks.forEach((bl, k) => { if (gen.ov(bl.K, gen.grow(relay, 420)) || gen.ov(bl.K, gen.grow(water, 60))) used.add(k); });
      world.sites.reservoir = { ...water, name: 'Ashgrove Reservoir' };
      fenceLine(G, water);
      break;
    }
  }

  // ---- generic block fills
  blocks.forEach((b, k) => {
    if (used.has(k)) return;
    const K = b.K;
    if (d === 'forest') { gen.fillForestBlock(G, K); return; }
    if (s.id === 8) { // the fort sector: scrub, a few warehouses and parking around the base
      const roll = rng.next();
      if (roll < 0.3) gen.fillIndustrial(G, K); else if (roll < 0.5) gen.fillParking(G, K); else gen.fillForestBlock(G, K);
      return;
    }
    gen.reserve(G, K);
    const roll = rng.next();
    if (d === 'downtown') {
      if (roll < 0.08) gen.fillPark(G, K, true); else if (roll < 0.16) gen.fillParking(G, K); else gen.fillDowntown(G, K);
    } else if (d === 'industrial') {
      if (roll < 0.2) gen.fillCommercial(G, K, 'industrial'); else gen.fillIndustrial(G, K);
    } else {
      if (s.id === 2 && roll < 0.45) gen.fillCommercial(G, K, 'suburb');
      else if (roll < 0.12) gen.fillPark(G, K, false);
      else if (roll < 0.3) gen.fillCommercial(G, K, 'suburb');
      else gen.fillHouses(G, K);
    }
  });

  // ---- trees (forest, the fort's scrub, and the margins of every sector)
  const TS = 160;
  for (let y = R.y; y < R.y + R.h; y += TS) for (let x = R.x; x < R.x + R.w; x += TS) {
    const tx = x + rng.range(40, 120), ty = y + rng.range(40, 120);
    const inMargin = tx < x0 - 60 || tx > x1 + 60 || ty < y0 - 60 || ty > y1 + 60;
    const roll = rng.next();
    const chance = d === 'forest' ? 0.62 : s.id === 8 ? 0.25 : inMargin ? 0.35 : 0;
    if (roll > chance) continue;
    if (gen.hitsGrid(G.reserved, tx - 40, ty - 40, 80, 80)) continue;
    if (Math.abs(tx - R.x) < 110 || Math.abs(tx - (R.x + R.w)) < 110 || Math.abs(ty - R.y) < 110 || Math.abs(ty - (R.y + R.h)) < 110) continue;
    if (roll < 0.03) gen.addRock(G, tx, ty); else gen.addTree(G, tx, ty, roll < 0.3);
  }

  // ---- cars and road wear (the overpass gets a pile-up)
  for (const r of state.roads) {
    if (r.x < R.x - 1 || r.y < R.y - 1 || r.x + r.w > R.x + R.w + 1 || r.y + r.h > R.y + R.h + 1) continue;
    const len = r.dir === 'h' ? r.w : r.h;
    const k = (r as any).kind;
    const dens = k === 'rural' ? 1 / 1600 : k === 'avenue' ? 1 / 650 : 1 / 800;
    const n = Math.round(len * dens * (d === 'downtown' ? 1.4 : 1));
    for (let q = 0; q < n; q++) {
      const sAlong = rng.range(80, len - 80), abs = (r.dir === 'h' ? r.x : r.y) + sAlong;
      if ((r as any).cross.some((c: any) => abs > c[0] - 90 && abs < c[1] + 90)) continue;
      const lanesA = k === 'avenue' ? [0.2, 0.4, 0.6, 0.8] : [0.28, 0.72];
      const lane = rng.pick(lanesA) + rng.range(-0.04, 0.04);
      const x = r.dir === 'h' ? r.x + sAlong : r.x + r.w * lane, y = r.dir === 'h' ? r.y + r.h * lane : r.y + sAlong;
      // keep the gates and camps clear
      if (world.gates.some(g => Math.hypot(g.x + g.w / 2 - x, g.y + g.h / 2 - y) < 420)) continue;
      const car = gen.addCar(G, x, y, r.dir);
      if (car && rng.chance(0.15)) gen.addCar(G, r.dir === 'h' ? x + rng.pick([-1, 1]) * 105 : x + rng.range(-20, 20), r.dir === 'h' ? y + rng.range(-20, 20) : y + rng.pick([-1, 1]) * 105, r.dir, { wreck: rng.chance(0.4) });
    }
    const nd = Math.round(len / 500);
    for (let q = 0; q < nd; q++) {
      const sAlong = rng.range(0, len), f = rng.range(0.1, 0.9);
      const x = r.dir === 'h' ? r.x + sAlong : r.x + r.w * f, y = r.dir === 'h' ? r.y + r.h * f : r.y + sAlong;
      gen.decor(G, rng.weighted({ crack: 4, debris: 3, blood: 1.5, oil: 1.5 }), Math.round(x), Math.round(y), rng.int(10, 40), rng.int(8, 30), { rot: rng.range(0, 6.28), seed: rng.int(0, 1e6), c: rng.pick(['#3a3530', '#2e3236', '#463c2c']) });
    }
  }
  if (s.id === 2) overpass(G, world, rng);

  // ---- blood, bones and tufts
  const nBlood = d === 'forest' ? 60 : d === 'suburb' ? 120 : 220;
  for (let k = 0; k < nBlood; k++) {
    const x = rng.range(R.x + 100, R.x + R.w - 100), y = rng.range(R.y + 100, R.y + R.h - 100);
    gen.decor(G, rng.chance(0.75) ? 'blood' : 'bones', Math.round(x), Math.round(y), rng.int(14, 34), rng.int(10, 28), { rot: rng.range(0, 6.28), seed: rng.int(0, 1e6) });
  }
  if (d === 'suburb') for (let k = 0; k < 350; k++) gen.decor(G, 'tuft', Math.round(rng.range(R.x, R.x + R.w)), Math.round(rng.range(R.y, R.y + R.h)), rng.int(10, 26), rng.int(10, 26), { seed: rng.int(0, 1e6) });

  // keep the route near the gates and camps free of anything solid
  for (const g of world.gates) clearAround(state, { x: g.x + g.w / 2, y: g.y + g.h / 2 }, 260);
  for (const c of world.camps) clearAround(state, c, 150);
  clearAround(state, world.start, 200);
  state.pois.push({ x: R.x + R.w / 2, y: R.y + 700, name: s.name, kind: 'district' });
  return M;
}

function fenceLine(G: any, water: Rect) {
  gen.fenceLine(G, false, water.y - 6, water.x, water.x + water.w, [[water.x + water.w / 2 - 60, water.x + water.w / 2 + 60]], 'chain');
  gen.fenceLine(G, false, water.y + water.h + 6, water.x, water.x + water.w, [], 'chain');
  gen.fenceLine(G, true, water.x - 6, water.y, water.y + water.h, [], 'chain');
  gen.fenceLine(G, true, water.x + water.w + 6, water.y, water.y + water.h, [], 'chain');
}

/** The Interchange: wrecks across the turn avenue with gaps to weave through, concrete barriers, a toll plaza. */
function overpass(G: any, world: RoadWorld, rng: any) {
  const o = world.sites.overpass!, cx = o.x + o.w / 2;
  for (let y = o.y + 60; y < o.y + o.h - 60; y += rng.range(95, 135)) {
    const lanes = [-52, -18, 18, 52].sort(() => rng.next() - 0.5);
    const n = 2;
    for (let i = 0; i < n; i++) gen.addCar(G, cx + lanes[i] + rng.range(-6, 6), y + rng.range(-18, 18), 'v', { wreck: rng.chance(0.55), trunk: 0.6, tier: 1 });
    if (rng.chance(0.3)) { const r = { x: Math.round(cx + rng.range(-60, 40)), y: Math.round(y + 50), w: 28, h: 28 }; if (gen.placeOk(G, r, 2)) gen.furn(G, r, 'crate', false); }
  }
  // sandbag positions on alternating sidewalks (cover, never a full block)
  let side = -1;
  for (let y = o.y + 100; y < o.y + o.h - 100; y += 260) {
    const r = { x: Math.round(cx + side * 88 - 10), y: Math.round(y), w: 20, h: 70 };
    if (gen.placeOk(G, r, 2)) gen.solid(G, { ...r, kind: 'furniture', sub: 'sandbag', blocksSight: false, blocksBullets: true });
    side = -side;
  }
  const t = world.sites.toll!;
  for (const dx of [-130, 0, 130]) {
    const r = { x: Math.round(t.x + t.w / 2 + dx - 20), y: Math.round(t.y + 80), w: 40, h: 60 };
    if (gen.placeOk(G, r, 2)) gen.furn(G, r, 'booth', true);
  }
}

/** A fenced freight cut: gravel, rails (long cracks), stacked containers and barrels to fight around. */
function railCut(G: any, K: Rect) {
  const rng = G.rng;
  gen.lot(G, K, 'gravel');
  const horiz = K.w >= K.h;
  for (const t of [0.42, 0.58]) {
    if (horiz) gen.decor(G, 'crack', K.x, Math.round(K.y + K.h * t), K.w, 6, { rot: 0, seed: rng.int(0, 1e6), c: '#2a2a2c' });
    else gen.decor(G, 'crack', Math.round(K.x + K.w * t), K.y, 6, K.h, { rot: 0, seed: rng.int(0, 1e6), c: '#2a2a2c' });
  }
  gen.fenceLine(G, !horiz ? true : false, horiz ? K.y + 4 : K.x + 4, horiz ? K.x : K.y, horiz ? K.x + K.w : K.y + K.h, [[(horiz ? K.x : K.y) + 300, (horiz ? K.x : K.y) + 420]], 'chain');
  gen.fenceLine(G, !horiz ? true : false, horiz ? K.y + K.h - 4 : K.x + K.w - 4, horiz ? K.x : K.y, horiz ? K.x + K.w : K.y + K.h, [[(horiz ? K.x + K.w : K.y + K.h) - 420, (horiz ? K.x + K.w : K.y + K.h) - 300]], 'chain');
  const n = Math.round(K.w * K.h / 60000);
  for (let i = 0; i < n; i++) {
    const big = rng.chance(0.5);
    const w = big ? 160 : 48, h = big ? 56 : 48;
    const r = { x: Math.round(K.x + 40 + rng.next() * (K.w - 80 - w)), y: Math.round(K.y + 40 + rng.next() * (K.h - 80 - h)), w: horiz ? w : h, h: horiz ? h : w };
    if (!gen.placeOk(G, gen.grow(r, 40), 0)) continue;
    if (big) gen.solid(G, { ...r, kind: 'furniture', sub: 'container', blocksSight: true, blocksBullets: true, tall: true });
    else gen.cont(G, r, 'crate', 'Freight Crate', 1, null, 'crate', false);
  }
  for (let i = 0; i < n; i++) {
    const r = { x: Math.round(K.x + 30 + rng.next() * (K.w - 60)), y: Math.round(K.y + 30 + rng.next() * (K.h - 60)), w: 30, h: 30 };
    if (gen.placeOk(G, gen.grow(r, 10), 0)) gen.solid(G, { ...r, kind: 'furniture', sub: 'barrel', blocksSight: false, blocksBullets: true });
  }
  gen.scatterDebris(G, K, 40);
}

/** Remove trees, cars, fences and furniture within r of p (keeps walls, so buildings and sector walls survive). */
function clearAround(state: GameState, p: Vec, r: number) {
  const hits = state.grid.query(p.x - r, p.y - r, r * 2, r * 2).filter(o => o.kind !== 'wall' && o.kind !== 'window' && Math.hypot(o.x + o.w / 2 - p.x, o.y + o.h / 2 - p.y) < r);
  for (const o of hits) {
    if ((o as any).bid) continue;
    phys.removeSolid(state, o);
    if (o.container) state.containers = state.containers.filter(c => c !== o.container);
  }
}
