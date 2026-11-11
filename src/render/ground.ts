// ground.ts — chunked, lazily built, LRU-cached ground textures (1024 world px per chunk).
// Each chunk is a DynamicTexture painted once with: district terrain, lots, sidewalks, roads + markings +
// crosswalks, building floors per room, flat decor decals, and every STATIC solid baked on top (walls,
// windows, fences, furniture, cars, rocks). Static solids never overlap actors (they collide), so baking
// them is visually identical to drawing them as sprites, and makes the per-frame cost ~0.
// Containers' searched/unsearched marks, trees (canopies overlap actors), roofs and structures are dynamic
// and live in world.ts.
import * as Phaser from 'phaser';
import type { Building, Decor, GameState, Road, Solid } from '../sim/types';
import { WORLD } from '../sim/core';
import * as world from '../sim/world';
import type { Art } from './art';
import { TX } from './art';
import { D, hash2, rng, hexColor, type View } from './common';
import { doorSide } from './worldobjs';
import { ZONE_FLOOR, type HiveInfo } from '../sim/hive-world';

export const CH = 1024;
const MAXCH = 20;
const IDX = 512;

const SURF: Record<string, number> = {
  water: 0x294849,
  forest: 0x1b2317, grass: 0x222b1c, park: 0x26351f, concrete: 0x2c2c2a, gravel: 0x2b2822, asphalt: 0x222224,
  dirt: 0x2d281f, field: 0x28381f, base: 0x2a2b25,
};
// lot surface -> tile family (falls back down the list)
const SURF_TILE: Record<string, string[]> = {
  water: ['campaign_water'],
  forest: ['forest_floor', 'grass_dry'], grass: ['grass_dry', 'grass'], park: ['grass'], concrete: ['parking', 'sidewalk'],
  gravel: ['gravel', 'dirt'], asphalt: ['asphalt'], dirt: ['dirt'], field: ['grass'], base: ['gravel', 'dirt'],
};
const DISTRICT_TILE: Record<string, string[]> = {
  forest: ['forest_floor', 'grass_dry'], suburb: ['grass_dry', 'grass'], downtown: ['grass_dry', 'dirt'],
  industrial: ['dirt', 'gravel'], military: ['dirt', 'gravel'],
};
const DISTRICT_COL: Record<string, number> = { forest: 0x1b2317, suburb: 0x222b1c, downtown: 0x23261f, industrial: 0x2a2620, military: 0x2a2b25 };
const FLOOR_COL: Record<string, number> = { wood: 0x43352a, tile: 0x4a4a44, carpet: 0x33373d, concrete: 0x363633, linoleum: 0x4e5452, military: 0x36382e };
const DECOR_ART = new Set(['blood', 'bones', 'debris', 'leaves', 'crack', 'oil', 'bush', 'tuft', 'firepit', 'helipad', 'trash', 'tire', 'puddle', 'manhole']);
const DLAYER: Record<string, number> = { lot: 0, alley: 0, drive: 0, path: 0, canopy: 0, helipad: 0, crosswalk: 4, crack: 4, oil: 4, tuft: 4, leaves: 4, bush: 4, firepit: 4, blood: 6, bones: 6, debris: 6 };
const FCOL: Record<string, string> = {
  sofa: '#5a3434', couch: '#5a3434', bed: '#55586a', hbed: '#8b979c', cot: '#4c5240', table: '#5a4836', desk: '#4c3c2b', counter: '#4b4a47', cabinet: '#5a4430',
  fridge: '#a3a7a4', stove: '#38393b', wardrobe: '#4b3624', nightstand: '#5a4430', dresser: '#54402b', toilet: '#bdbdb4', tub: '#aab0ae',
  sink: '#9ea4a4', medcab: '#cfcfc6', filing: '#5a5f64', plant: '#2a4f26', tv: '#19191b', bookshelf: '#46321f', armchair: '#5a4838',
  bench: '#4a3b2b', locker: '#4b5764', rack: '#3c4045', crate: '#6b4a28', mcrate: '#4a5236', shelf: '#3d3933', clothes: '#4a3a4c', clothing: '#4a3a4c',
  guncase: '#2a2a2d', weapon_case: '#2a2a2d', safe: '#3a3e41', cooler: '#3f5a6c', pump: '#8a2a22', tower: '#3c3b31', sandbag: '#6c6249', fountain: '#55565a',
  statue: '#5a5a54', planter: '#4a3f36', ship: '#5a3a2a', booth: '#55564c', dumpster: '#2c4a34', toolbox: '#8c2c22', pallet: '#6c5332',
  barrel: '#4a5a38', woodpile: '#5a3f27', sdesk: '#5a4936', monitor: '#3a4048', cart: '#9aa3a6', gunrack: '#46321f',
};
// furniture sub aliases for manifest prop keys
const PROP_ALIAS: Record<string, string[]> = {
  sofa: ['couch', 'sofa'], couch: ['couch', 'sofa'], clothing: ['clothes'], weapon_case: ['guncase'], military_truck: ['military_truck', 'truck'],
};

type Item = { x: number; y: number; w: number; h: number; o: any; L: number; t: 'd' | 'sw' | 'road' | 'mark' | 'b'; i: number; q: number };
type Chunk = { cx: number; cy: number; key: string; dt: Phaser.Textures.DynamicTexture; img: Phaser.GameObjects.Image; used: number; job: Generator<void, void, void> | null; replaces?: Chunk | null };

export class Ground {
  angled = false;
  private scene: Phaser.Scene;
  private art: Art;
  private state: GameState | null = null;
  private chunks = new Map<number, Chunk>();
  private free: Chunk[] = [];
  private idx: Item[][] = [];
  private icols = 0;
  private qstamp = 1;
  private tick = 0;
  private g: Phaser.GameObjects.Graphics;
  private nextId = 0;
  private tmpItems: Item[] = [];
  private tmpSolids: Solid[] = [];
  private nines: Phaser.GameObjects.NineSlice[] = [];
  private queue: Chunk[] = [];
  stepLog: number[] = [];
  private builtThisFrame = 0;
  /** stats */
  builds = 0;

  constructor(scene: Phaser.Scene, art: Art) {
    this.scene = scene; this.art = art;
    this.g = scene.make.graphics({}, false);
    // allocate every chunk framebuffer up front (boot/title time): creating a 1024² render target mid-game
    // costs several ms on D3D-backed WebGL and showed up as hitches while walking
    for (let i = 0; i < MAXCH; i++) this.free.push(this.newChunk());
  }
  private newChunk(): Chunk {
    const key = 'rz_chunk_' + this.nextId++;
    const dt = this.scene.textures.addDynamicTexture(key, CH, CH)!;
    dt.clear().render();
    const img = this.scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(D.ground).setVisible(false);
    return { cx: 0, cy: 0, key, dt, img, used: 0, job: null };
  }

  attach(state: GameState) {
    this.detach();
    this.state = state;
    this.buildIndex(state);
  }
  detach() {
    for (const c of this.chunks.values()) { c.img.setVisible(false); c.job = null; this.free.push(c); }
    for (const c of this.queue) if (c.replaces) { c.img.setVisible(false); c.job = null; c.replaces = null; this.free.push(c); }
    this.chunks.clear();
    this.queue.length = 0;
    this.state = null;
  }
  destroy() {
    this.detach();
    for (const c of this.free) { c.img.destroy(); c.dt.destroy(); }
    this.free.length = 0;
    this.g.destroy();
  }

  // ---------------------------------------------------------------- index
  private buildIndex(state: GameState) {
    this.icols = Math.ceil(WORLD.w / IDX);
    const rows = Math.ceil(WORLD.h / IDX);
    this.idx = Array.from({ length: this.icols * rows }, () => []);
    let i = 0;
    const add = (x: number, y: number, w: number, h: number, o: any, L: number, t: Item['t']) => {
      const it: Item = { x, y, w, h, o, L, t, i: i++, q: 0 };
      const c0 = Math.max(0, Math.floor(x / IDX)), c1 = Math.min(this.icols - 1, Math.floor((x + w) / IDX));
      const r0 = Math.max(0, Math.floor(y / IDX)), r1 = Math.min(rows - 1, Math.floor((y + h) / IDX));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.idx[r * this.icols + c].push(it);
    };
    for (const d of state.decor) {
      const L = DLAYER[d.kind] ?? 6;
      const pad = d.kind === 'blood' || d.kind === 'bones' || d.kind === 'leaves' || d.kind === 'crack' || d.kind === 'oil' ? 30 : 4;
      add(d.x - pad, d.y - pad, d.w + pad * 2, d.h + pad * 2, d, L, 'd');
    }
    for (const r of state.roads) {
      const sw = (r as any).sw ?? r.sidewalk ?? 0;
      add(r.x - sw, r.y - sw, r.w + sw * 2, r.h + sw * 2, r, 1, 'sw');
      add(r.x, r.y, r.w, r.h, r, 2, 'road');
      add(r.x, r.y, r.w, r.h, r, 3, 'mark');
    }
    for (const b of state.buildings) add(b.x - 30, b.y - 30, b.w + 60, b.h + 60, b, 5, 'b');
  }
  private query(x: number, y: number, w: number, h: number, out: Item[]) {
    out.length = 0;
    const s = ++this.qstamp;
    const c0 = Math.max(0, Math.floor(x / IDX)), c1 = Math.min(this.icols - 1, Math.floor((x + w) / IDX));
    const rows = this.idx.length / this.icols;
    const r0 = Math.max(0, Math.floor(y / IDX)), r1 = Math.min(rows - 1, Math.floor((y + h) / IDX));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) for (const it of this.idx[r * this.icols + c]) {
      if (it.q === s) continue; it.q = s;
      if (it.x < x + w && it.x + it.w > x && it.y < y + h && it.y + it.h > y) out.push(it);
    }
    return out;
  }

  // ---------------------------------------------------------------- per frame
  /** Show ready chunks in view; paint missing ones in time-sliced steps (~1.5 ms/frame), prefetching
   *  the ring around the view. The first frame after attach paints everything visible synchronously. */
  update(v: View, first: boolean) {
    if (!this.state) return;
    this.tick++;
    this.builtThisFrame = 0;
    const m = 48;
    const nc = Math.ceil(WORLD.w / CH), nr = Math.ceil(WORLD.h / CH);
    const c0 = Math.max(0, Math.floor((v.x - m) / CH)), c1 = Math.min(nc - 1, Math.floor((v.x + v.w + m) / CH));
    const r0 = Math.max(0, Math.floor((v.y - m) / CH)), r1 = Math.min(nr - 1, Math.floor((v.y + v.h + m) / CH));
    for (const c of this.chunks.values()) if (c.img.visible && (c.cx < c0 || c.cx > c1 || c.cy < r0 || c.cy > r1)) c.img.setVisible(false);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      let c = this.chunks.get(cy * 1000 + cx);
      if (!c) { c = this.build(cx, cy); this.queue.unshift(c); }   // visible chunks jump the queue
      else if (c.job && this.queue[0] !== c) { const i = this.queue.indexOf(c); if (i > 0) { this.queue.splice(i, 1); this.queue.unshift(c); } }
      c.used = this.tick;
    }
    // prefetch the nearest missing ring chunk when idle
    if (!this.queue.length && !first) {
      const vcx = (v.x + v.w / 2) / CH - 0.5, vcy = (v.y + v.h / 2) / CH - 0.5;
      let best = -1, bx = 0, by = 0;
      for (let cy = r0 - 1; cy <= r1 + 1; cy++) for (let cx = c0 - 1; cx <= c1 + 1; cx++) {
        if (cx < 0 || cy < 0 || cx >= nc || cy >= nr || this.chunks.has(cy * 1000 + cx)) continue;
        const d = (cx - vcx) * (cx - vcx) + (cy - vcy) * (cy - vcy);
        if (best < 0 || d < best) { best = d; bx = cx; by = cy; }
      }
      if (best >= 0) { const c = this.build(bx, by); c.used = this.tick - 1; this.queue.push(c); }
    }
    // run paint steps within the time budget (always at least one step)
    const t0 = performance.now();
    let steps = 0;
    while (this.queue.length && (first || steps === 0 || performance.now() - t0 < 1.2)) {
      const c = this.queue[0];
      const ts = performance.now();
      const done = !c.job || c.job.next().done;
      if (this.stepLog.length < 400) this.stepLog.push(Math.round((performance.now() - ts) * 10) / 10, this.prof.length);
      if (done) { c.job = null; this.queue.shift(); this.builtThisFrame++; this.builds++; if (c.replaces) this.swapIn(c); }
      steps++;
    }
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const c = this.chunks.get(cy * 1000 + cx);
      if (c && !c.job && !c.img.visible) c.img.setVisible(true);
    }
  }
  get built() { return this.builtThisFrame; }

  /** A static solid changed (salvaged): repaint the chunks it touches. The old texture stays on screen
   *  until the repaint finishes in the background, so there is no flicker and no frame hitch. */
  invalidate(x: number, y: number, w: number, h: number) {
    const m = 48; // furniture/car shadows reach past the rect
    const c0 = Math.floor((x - m) / CH), c1 = Math.floor((x + w + m) / CH), r0 = Math.floor((y - m) / CH), r1 = Math.floor((y + h + m) / CH);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const old = this.chunks.get(cy * 1000 + cx);
      if (!old) continue;
      if (old.job) { old.job = this.paint(old); continue; }       // still painting: just restart it
      const pending = this.queue.find((q) => q.replaces === old);
      if (pending) { pending.job = this.paint(pending); continue; }
      const c = this.free.pop() ?? this.newChunk();
      c.cx = cx; c.cy = cy; c.used = old.used; c.replaces = old;
      c.img.setPosition(cx * CH, cy * CH).setVisible(false);
      c.job = this.paint(c);
      this.queue.unshift(c);
    }
  }
  private swapIn(c: Chunk) {
    const old = c.replaces!, k = c.cy * 1000 + c.cx;
    c.replaces = null;
    if (this.chunks.get(k) === old) {
      this.chunks.set(k, c); c.used = old.used;
      c.img.setVisible(old.img.visible); old.img.setVisible(false); this.free.push(old);
    } else { c.img.setVisible(false); this.free.push(c); }  // the old chunk was evicted meanwhile
  }
  get pending() { return this.queue.length; }

  private build(cx: number, cy: number): Chunk {
    let c: Chunk | undefined;
    if (this.chunks.size >= MAXCH) {
      let old: Chunk | null = null;
      for (const e of this.chunks.values()) if (!e.job && e.used < this.tick && (!old || e.used < old.used)) old = e;
      if (old) { this.chunks.delete(old.cy * 1000 + old.cx); c = old; }
    }
    if (!c) c = this.free.pop();
    if (!c) c = this.newChunk();
    c.cx = cx; c.cy = cy; c.used = this.tick;
    c.img.setPosition(cx * CH, cy * CH).setVisible(false);
    this.chunks.set(cy * 1000 + cx, c);
    c.job = this.paint(c);
    return c;
  }

  // ---------------------------------------------------------------- painting
  private ox = 0; private oy = 0; private dt!: Phaser.Textures.DynamicTexture;

  private ctx(c: Chunk) { this.ox = c.cx * CH; this.oy = c.cy * CH; this.dt = c.dt; }
  /** Fill a world rect (clipped to the chunk) with a tile family, or a flat colour. */
  private tileRect(fams: string[] | string, seed: number, x: number, y: number, w: number, h: number, col: number, alpha = 1) {
    const ox = this.ox, oy = this.oy;
    const x0 = Math.max(x, ox - 2), y0 = Math.max(y, oy - 2), x1 = Math.min(x + w, ox + CH + 2), y1 = Math.min(y + h, oy + CH + 2);
    if (x1 <= x0 || y1 <= y0) return;
    let frames: string[] | null = null;
    for (const f of typeof fams === 'string' ? [fams] : fams) { frames = this.art.tiles(f); if (frames) break; }
    if (frames) {
      // variants change per 256-px world block (aligned, so neighbouring chunks agree) to break the rhythm
      const s = this.art.scale, B = 256;
      for (let by = Math.floor(y0 / B) * B; by < y1; by += B) for (let bx = Math.floor(x0 / B) * B; bx < x1; bx += B) {
        const sx0 = Math.max(x0, bx), sy0 = Math.max(y0, by), sx1 = Math.min(x1, bx + B), sy1 = Math.min(y1, by + B);
        if (sx1 <= sx0 || sy1 <= sy0) continue;
        const fr = frames[hash2(bx / B, by / B, seed) % frames.length], atlas = this.art.atlasOf(fr)!;
        this.dt.repeat(atlas, fr, sx0 - ox, sy0 - oy, sx1 - sx0, sy1 - sy0, { tileScaleX: s, tileScaleY: s, tilePositionX: sx0 / s, tilePositionY: sy0 / s, alpha } as any);
      }
    } else this.dt.fill(col, alpha, x0 - ox, y0 - oy, x1 - x0, y1 - y0);
  }
  /** Vector pass through the scratch Graphics (world coordinates). Executes immediately. */
  private vector(fn: (g: Phaser.GameObjects.Graphics) => void) {
    const g = this.g;
    g.clear(); g.setPosition(-this.ox, -this.oy);
    fn(g);
    this.dt.draw(g);
    this.dt.render();
  }

  /** A flat colour over a world rect, clipped to the chunk. */
  private wash(col: number, alpha: number, x: number, y: number, w: number, h: number) {
    const x0 = Math.max(x, this.ox), y0 = Math.max(y, this.oy), x1 = Math.min(x + w, this.ox + CH), y1 = Math.min(y + h, this.oy + CH);
    if (x1 > x0 && y1 > y0 && alpha > 0) this.dt.fill(col, alpha, x0 - this.ox, y0 - this.oy, x1 - x0, y1 - y0);
  }
  /** The Hive Below: solid rock with the cave carved out of it (sim/hive-world.ts). Each cell has its own floor
   *  colour; the walls get a lit rim and lumps so the tile edges read as dug earth; the dam is poured concrete. */
  private *paintHive(c: Chunk, h: HiveInfo): Generator<void, void, void> {
    const T = h.tile, n = h.n, ox = this.ox, oy = this.oy;
    const tx0 = Math.max(0, Math.floor(ox / T) - 1), ty0 = Math.max(0, Math.floor(oy / T) - 1), tx1 = Math.min(n - 1, Math.floor((ox + CH) / T) + 1), ty1 = Math.min(n - 1, Math.floor((oy + CH) / T) + 1);
    const F = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && h.floor[y * n + x] === 1;
    const Z = (x: number, y: number) => h.zone[y * n + x] || 8;
    const mixc = (a: number, b: number, t: number) => { const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t); return (ch(16) << 16) | (ch(8) << 8) | ch(0); };
    const floorCol = (z: number) => mixc(ZONE_FLOOR[z], 0x000000, 0.22), wallCol = (z: number) => mixc(ZONE_FLOOR[z], 0x0a0705, 0.62), wallHi = (z: number) => mixc(ZONE_FLOOR[z], 0x0a0705, 0.3);
    // 1. rock: almost black, with a little grain for the flashlight to catch
    this.tileRect(['gravel', 'dirt'], hash2(c.cx, c.cy, 5), ox, oy, CH, CH, 0x100d0a);
    this.wash(0x070504, 0.8, ox, oy, CH, CH);
    this.dt.render();
    yield; this.ctx(c);
    // 2. the floor: earth texture washed with the cell's colour, one run of tiles at a time
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (!F(tx, ty)) continue;
      const z = Z(tx, ty); let x1 = tx; while (x1 < tx1 && F(x1 + 1, ty) && Z(x1 + 1, ty) === z) x1++;
      const w = (x1 - tx + 1) * T;
      this.tileRect(['dirt', 'gravel'], hash2(tx, ty, 9), tx * T, ty * T, w, T, floorCol(z));
      this.wash(floorCol(z), 0.56, tx * T, ty * T, w, T);
      tx = x1;
    }
    this.dt.render();
    yield; this.ctx(c);
    // 3. shading and edges
    const dam = h.dam;
    this.vector((g) => {
      // the bugs' trail: a faint line of slime along the way they walk
      const inChunk = (k: number) => { const x = k % n, y = (k / n) | 0; return x >= tx0 && x <= tx1 && y >= ty0 && y <= ty1; };
      g.fillStyle(0xb7e04a, 0.2);
      for (let i = 0; i + 1 < h.route.length; i++) {
        const a = h.route[i], b = h.route[i + 1]; if (!inChunk(a)) continue;
        const ax = (a % n + 0.5) * T, ay = (((a / n) | 0) + 0.5) * T, bx = (b % n + 0.5) * T, by = (((b / n) | 0) + 0.5) * T, hs = hash2(a, i, 21);
        const jx = ((hs & 15) - 7) * 1.4, jy = (((hs >>> 4) & 15) - 7) * 1.4, horiz = Math.abs(bx - ax) > Math.abs(by - ay);
        g.fillEllipse((ax + bx) / 2 + jx, (ay + by) / 2 + jy, horiz ? 34 : 9, horiz ? 9 : 34, 10);
        if (hs & 64) g.fillEllipse(ax + jy, ay + jx, 7, 7, 8);
      }
      // big soft blotches break up the tiling (damp patches, trodden ground)
      const B = rng(hash2(c.cx, c.cy, 311));
      for (let k = 0; k < 26; k++) {
        const bx = ox + B() * CH, by = oy + B() * CH, dark = B() < 0.6;
        if (!F(Math.floor(bx / T), Math.floor(by / T))) continue;
        g.fillStyle(dark ? 0x000000 : 0xfff2d8, dark ? 0.09 : 0.03);
        g.fillEllipse(bx, by, 90 + B() * 240, 60 + B() * 150, 14);
      }
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (!F(tx, ty)) continue;
        const x = tx * T, y = ty * T, hs = hash2(tx, ty, 77), z = Z(tx, ty);
        // stones, and standing water on the bed of the reservoir
        if (((hs >>> 6) & 7) < 3) { g.fillStyle(0x000000, 0.28); g.fillEllipse(x + 10 + ((hs >>> 9) % 60), y + 10 + ((hs >>> 15) % 60), 5 + ((hs >>> 21) & 7), 4 + ((hs >>> 24) & 3), 8); }
        if (((hs >>> 11) & 7) < 2) { g.fillStyle(0xfff2d8, 0.08); g.fillEllipse(x + 8 + ((hs >>> 13) % 64), y + 8 + ((hs >>> 19) % 64), 4 + ((hs >>> 5) & 3), 3, 8); }
        if (z === 8 && ((hs >>> 17) & 15) === 0) { g.fillStyle(0x10181c, 0.5); g.fillEllipse(x + 40, y + 40, 60 + (hs & 31), 34 + ((hs >>> 5) & 15), 14); g.fillStyle(0x8fa4b0, 0.1); g.fillEllipse(x + 34, y + 36, 26, 8, 10); }
        // the wall throws a soft shadow onto the floor beside it
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
          if (F(tx + dx, ty + dy)) continue;
          for (const [depth, a] of [[30, 0.16], [16, 0.2]] as const) {
            g.fillStyle(0x000000, a);
            if (dy < 0) g.fillRect(x, y, T, depth); else if (dy > 0) g.fillRect(x, y + T - depth, T, depth); else if (dx < 0) g.fillRect(x, y, depth, T); else g.fillRect(x + T - depth, y, depth, T);
          }
        }
      }
      // the walls: a lit rim of dug earth on every rock tile that borders the cave, lumpy so the grid does not show
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (F(tx, ty)) continue;
        const x = tx * T, y = ty * T, R = rng(hash2(tx, ty, 131));
        if (tx >= dam.x / T && tx < (dam.x + dam.w) / T && ty >= dam.y / T && ty < (dam.y + dam.h) / T) continue;   // the dam is drawn below
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
          if (!F(tx + dx, ty + dy)) continue;
          const z = Z(tx + dx, ty + dy), W = 18;
          g.fillStyle(wallCol(z), 1);
          if (dy < 0) g.fillRect(x, y, T, W); else if (dy > 0) g.fillRect(x, y + T - W, T, W); else if (dx < 0) g.fillRect(x, y, W, T); else g.fillRect(x + T - W, y, W, T);
          // lumps along the edge, pushing a little way into the cave
          for (let k = 0; k < 4; k++) {
            const t = (k + 0.2 + R() * 0.6) / 4 * T, rad = 9 + R() * 8, push = 2 + R() * 6;
            const cx = dy !== 0 ? x + t : dx < 0 ? x - push + 4 : x + T + push - 4, cy = dx !== 0 ? y + t : dy < 0 ? y - push + 4 : y + T + push - 4;
            g.fillStyle(wallCol(z), 1); g.fillCircle(cx, cy, rad);
            g.fillStyle(wallHi(z), 0.55); g.fillCircle(cx - rad * 0.25, cy - rad * 0.3, rad * 0.5);
            g.fillStyle(0x000000, 0.3); g.fillEllipse(cx + rad * 0.3, cy + rad * 0.45, rad * 1.1, rad * 0.5, 8);
          }
          g.fillStyle(wallHi(z), 0.7);
          if (dy < 0) g.fillRect(x, y, T, 3); else if (dy > 0) g.fillRect(x, y + T - 3, T, 3); else if (dx < 0) g.fillRect(x, y, 3, T); else g.fillRect(x + T - 3, y, 3, T);
        }
        // inner corners
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          if (!F(tx + dx, ty + dy) || F(tx + dx, ty) || F(tx, ty + dy)) continue;
          const z = Z(tx + dx, ty + dy);
          g.fillStyle(wallCol(z), 1); g.fillCircle(dx < 0 ? x : x + T, dy < 0 ? y : y + T, 14);
        }
      }
      // the dam: poured concrete along the north side of the bed, stained to the old water line
      if (dam.x < ox + CH + 40 && dam.x + dam.w > ox - 40 && dam.y < oy + CH + 40 && dam.y + dam.h > oy - 40) {
        g.fillStyle(0x5b5d59, 1); g.fillRect(dam.x, dam.y, dam.w, dam.h);
        g.fillStyle(0x3d3f3c, 1); g.fillRect(dam.x, dam.y, dam.w, 70);                      // the far lip
        g.fillStyle(0x7a7c77, 1); g.fillRect(dam.x, dam.y + 70, dam.w, 26);                 // the walkway along the top
        g.fillStyle(0x24302c, 0.5); g.fillRect(dam.x, dam.y + dam.h - 120, dam.w, 120);     // the old water line
        g.fillStyle(0x000000, 0.35); for (let x = dam.x; x <= dam.x + dam.w; x += 160) g.fillRect(x - 2, dam.y + 96, 4, dam.h - 96);
        g.fillStyle(0x000000, 0.3); g.fillRect(dam.x, dam.y + dam.h, dam.w, 26); g.fillStyle(0x000000, 0.18); g.fillRect(dam.x, dam.y + dam.h + 26, dam.w, 26);
        const R = rng(hash2(c.cx, c.cy, 9));
        for (let k = 0; k < 40; k++) { g.fillStyle(0x1c2622, 0.25); g.fillRect(dam.x + R() * dam.w, dam.y + 110 + R() * 60, 6 + R() * 10, 60 + R() * 140); }
      }
    });
    yield; this.ctx(c);
    // 4. the lumps of resin and fungus that light the place, in each cell's own colour
    const lump = this.art.atlasOf('hive_lump_0');
    if (lump) {
      for (const gl of h.glows) {
        if (gl.kind !== 'wall' || gl.x < ox - 40 || gl.y < oy - 40 || gl.x > ox + CH + 40 || gl.y > oy + CH + 40) continue;
        const hs = hash2(gl.x, gl.y, 5);
        for (let k = 0; k < 3; k++) {
          const a = ((hs >>> (k * 5)) & 31) / 31 * Math.PI * 2, d = k ? 12 + ((hs >>> (k * 3)) & 7) * 2 : 0;
          this.dt.stamp(lump, `hive_lump_${(hs + k) % 3}`, gl.x + Math.cos(a) * d - ox, gl.y + Math.sin(a) * d - oy, { tint: gl.col, scale: k ? 0.5 : 0.8, rotation: a } as any);
        }
      }
      this.dt.render();
    }
  }

  prof: number[] = [];
  private *paint(c: Chunk): Generator<void, void, void> {
    const T = performance.now(); const pf = this.prof; pf.length = 0;
    const state = this.state!;
    const ox = (this.ox = c.cx * CH), oy = (this.oy = c.cy * CH);
    const dt = (this.dt = c.dt);
    dt.clear();
    const hive = state.road?.world.hive;
    if (hive) { yield* this.paintHive(c, hive); return; }
    // 1. district terrain per 256 cell
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const x = ox + i * 256, y = oy + j * 256;
      const d = world.districtAt(state, x + 128, y + 128);
      this.tileRect(DISTRICT_TILE[d] || DISTRICT_TILE.suburb, hash2(c.cx * 4 + i, c.cy * 4 + j, 3), x, y, 256, 256, DISTRICT_COL[d] ?? SURF.forest);
    }
    dt.render();
    pf.push(performance.now() - T);
    yield; this.ctx(c);
    const seed = hash2(c.cx, c.cy, state.seed);
    const items = this.query(ox, oy, CH, CH, []);
    items.sort((a, b) => a.L - b.L || a.i - b.i);
    // 2. lots / flat decor (L0), sidewalks, roads — tile passes
    for (const it of items) {
      const o = it.o;
      if (it.t === 'd' && it.L === 0) {
        if (o.kind === 'lot') { const s = (o as any).surface || o.sub || 'grass'; const al = this.art.manifest.tileAliases?.[s]; this.tileRect(al ? [al, ...(SURF_TILE[s] || [])] : SURF_TILE[s] || ['grass_dry'], o.vseed || 0, o.x, o.y, o.w, o.h, SURF[s] ?? SURF.grass); }
        else if (o.kind === 'alley') this.tileRect(['asphalt_cracked', 'asphalt'], o.vseed || 0, o.x, o.y, o.w, o.h, 0x262624);
        else if (o.kind === 'drive') this.tileRect(['parking', 'sidewalk'], o.vseed || 0, o.x, o.y, o.w, o.h, 0x353532);
        else if (o.kind === 'path' && !o.round) this.tileRect(o.plaza ? ['sidewalk'] : ['gravel', 'dirt'], o.vseed || 0, o.x, o.y, o.w, o.h, o.plaza ? 0x3a3935 : 0x4a4236);
        else if (o.kind === 'canopy') this.tileRect(['parking', 'sidewalk'], o.vseed || 0, o.x, o.y, o.w, o.h, 0x353533);
      } else if (it.t === 'sw') {
        const r = o as Road & { sw?: number }, sw = r.sw ?? r.sidewalk ?? 0;
        if (sw) this.tileRect(['sidewalk'], hash2(r.x, r.y, 1), r.x - sw, r.y - sw, r.w + sw * 2, r.h + sw * 2, 0x383835);
      } else if (it.t === 'road') {
        const r = o as Road;
        if (r.kind === 'dirt') this.tileRect(['dirt', 'gravel'], hash2(r.x, r.y, 2), r.x, r.y, r.w, r.h, 0x292825);
        else this.tileRect(hash2(r.x, r.y, 9) % 3 === 0 ? ['asphalt_cracked', 'asphalt'] : ['asphalt'], hash2(r.x, r.y, 2), r.x, r.y, r.w, r.h, 0x232325);
      } else if (it.t === 'b') {
        const b = o as Building;
        this.tileRect(['concrete'], 1, b.x, b.y, b.w, b.h, 0x1e1d1b);
        for (const rm of b.rooms) {
          const f = rm.floor || b.floor || 'wood';
          this.tileRect([f, 'concrete'], hash2(rm.x, rm.y, 5), rm.x, rm.y, rm.w, rm.h, FLOOR_COL[f] ?? 0x3a342c);
        }
      }
    }
    dt.render();
    pf.push(performance.now() - T);
    yield; this.ctx(c);
    // 3. vector paint: lot lines, curbs, markings, crosswalks, decals, thresholds
    const tilesOk = !!this.art.tiles('asphalt');
    this.vector((g) => {
      const R = rng(seed);
      // big soft blotches break up tiling
      for (let k = 0; k < 22; k++) {
        g.fillStyle(R() < 0.5 ? 0x000000 : 0xfff8e8, R() < 0.5 ? 0.06 : 0.025);
        g.fillEllipse(ox + R() * CH, oy + R() * CH, 60 + R() * 220, 40 + R() * 140, 12);
      }
      if (!tilesOk) for (let k = 0; k < 700; k++) {
        const v = R();
        g.fillStyle(v < 0.5 ? 0x000000 : v < 0.85 ? 0xfffff0 : 0x463c28, v < 0.5 ? 0.16 : v < 0.85 ? 0.05 : 0.18);
        g.fillRect(ox + R() * CH, oy + R() * CH, 1 + R() * 2, 1 + R() * 2);
      }
      for (const it of items) {
        const o = it.o;
        if (it.t === 'd') { if (!this.decorProp(o)) this.decorVec(g, o, it.L); }
        else if (it.t === 'sw') this.sidewalkVec(g, o);
        else if (it.t === 'road') this.curbVec(g, o);
        else if (it.t === 'mark') this.markVec(g, o);
        else if (it.t === 'b') this.buildingVec(g, o);
      }
    });
    pf.push(performance.now() - T);
    yield; this.ctx(c);
    // 3b. decor decals with art
    for (const it of items) if (it.t === 'd') {
      const o = it.o, p = this.decorProp(o);
      if (!p) continue;
      let r: { x: number; y: number; w: number; h: number; vseed?: number } = o;
      if (o.kind === 'oil') r = { x: o.x - o.w * 0.7, y: o.y - o.h * 0.5, w: o.w * 1.4, h: o.h, vseed: o.vseed };
      else if (o.kind === 'crack') r = { x: o.x - 30, y: o.y - 30, w: 60, h: 60, vseed: o.vseed };
      else if (o.kind === 'leaves' || o.kind === 'tuft') r = { x: o.x, y: o.y, w: Math.max(o.w, 24), h: Math.max(o.h, 24), vseed: o.vseed };
      this.stampProp(p, r, { spin: o.kind !== 'helipad' && o.kind !== 'firepit' ? true : undefined });
    }
    dt.render();
    pf.push(performance.now() - T);
    yield; this.ctx(c);
    // 4. static solids baked on top
    const solids: Solid[] = [];
    state.grid.each(ox - 8, oy - 8, CH + 16, CH + 16, (o) => {
      if (o.campaignArt || o.structure || o.kind === 'tree' || o.kind === 'structure') return;
      if (this.angled && ['wall','window','car','fence','furniture','rock'].includes(o.kind)) return;
      if (o.x < ox + CH + 8 && o.x + o.w > ox - 8 && o.y < oy + CH + 8 && o.y + o.h > oy - 8) solids.push(o);
    });
    // floor-level first (furniture/cars cast shadows on the floor), walls last
    solids.sort((a, b) => solidOrder(a) - solidOrder(b));
    const vecSolids: Solid[] = [];
    for (const it of items) if (it.t === 'b') this.stampDoors(it.o);
    for (let i = 0; i < solids.length; i++) {
      if (!this.stampSolid(solids[i])) vecSolids.push(solids[i]);
      if (i % 60 === 59) { dt.render(); for (const n of this.nines) n.destroy(); this.nines.length = 0; yield; this.ctx(c); }
    }
    dt.render();
    for (const n of this.nines) n.destroy();
    this.nines.length = 0;
    pf.push(performance.now() - T);
    if (vecSolids.length) this.vector((g) => { for (const o of vecSolids) this.solidVec(g, o); });
    pf.push(performance.now() - T, solids.length, items.length);
  }

  // ---------------------------------------------------------------- sprite solids
  private propFor(o: Solid) {
    const sub = o.sub || o.kind;
    const keys = [o.kind + ':' + sub, sub];
    for (const a of PROP_ALIAS[sub] || []) keys.push(o.kind + ':' + a);
    if (o.kind === 'car' && (o as any).wreck && !/_wreck$/.test(sub)) keys.unshift('car:' + sub + '_wreck', 'car:wreck');
    for (const k of keys) { const p = this.art.prop(k); if (p) return p; }
    const fb = this.art.manifest.propsFallback && this.art.manifest.propsFallback[o.kind];
    return fb ? this.art.prop(fb) : null;
  }
  /** Strip (wall/fence/window) along a rect: tile along the length, thickness scaled to the rect. */
  private strip(frH: string, frV: string, o: { x: number; y: number; w: number; h: number }, nine: boolean) {
    const horiz = o.w >= o.h, fr = horiz ? frH : frV;
    if (!this.art.has(fr)) return false;
    const atlas = this.art.atlasOf(fr)!, frame = this.scene.textures.getFrame(atlas, fr);
    const k = horiz ? o.h / frame.height : o.w / frame.width;
    if (nine) {
      // nine-slice with 8px end caps along the length (window frames, door frames)
      const len = (horiz ? o.w : o.h) / k;
      const ns = new Phaser.GameObjects.NineSlice(this.scene, 0, 0, atlas, fr, horiz ? len : frame.width, horiz ? frame.height : len, horiz ? 8 : 0, horiz ? 8 : 0, horiz ? 0 : 8, horiz ? 0 : 8);
      ns.setOrigin(0, 0).setScale(k).setPosition(o.x - this.ox, o.y - this.oy);
      this.nines.push(ns);
      this.dt.draw(ns);
      return true;
    }
    this.dt.repeat(atlas, fr, o.x - this.ox, o.y - this.oy, o.w, o.h, { tileScaleX: k, tileScaleY: k, tilePositionX: horiz ? o.x / k : 0, tilePositionY: horiz ? 0 : o.y / k } as any);
    return true;
  }
  private decorProp(o: Decor) {
    if (!DECOR_ART.has(o.kind)) return null;
    return this.art.prop('decor:' + o.kind);
  }
  /** Which side of its room a piece of furniture is backed against (nearest room edge). */
  private wallSide(o: Solid): 'n' | 's' | 'e' | 'w' | null {
    const b = o.buildingId ? this.state!.buildings.find((q) => q.id === o.buildingId) : null;
    if (!b) return null;
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const r = b.rooms.find((q) => cx >= q.x && cx <= q.x + q.w && cy >= q.y && cy <= q.y + q.h) || b;
    const dn = o.y - r.y, ds = r.y + r.h - (o.y + o.h), dw = o.x - r.x, de = r.x + r.w - (o.x + o.w);
    const m = Math.min(dn, ds, dw, de);
    if (m > 40) return null;
    return m === dn ? 'n' : m === ds ? 's' : m === dw ? 'w' : 'e';
  }
  /** Stamp any manifest prop into a world rect honouring fit/pad/orient/back. */
  stampProp(p: any, o: { x: number; y: number; w: number; h: number; vseed?: number }, opts: { rot?: number; side?: string | null; spin?: boolean } = {}) {
    const s = this.art.scale;
    const fr = p.frames[(o.vseed ?? hash2(o.x, o.y)) % p.frames.length];
    const atlas = this.art.atlasOf(fr)!;
    const frame = this.scene.textures.getFrame(atlas, fr);
    const pad = (p.pad ?? 0) as number;
    let rot = opts.rot ?? 0;
    if (opts.rot === undefined) {
      const orient = p.orient ?? 'h';
      if (opts.side && p.back && ANG[p.back] !== undefined) rot = ANG[opts.side] - ANG[p.back];
      else if ((orient === 'h' && o.h > o.w * 1.05) || (orient === 'v' && o.w > o.h * 1.05)) rot = Math.PI / 2 * (((o.vseed ?? 0) & 1) ? -1 : 1);
      else if (opts.spin || p.rotate) rot = ((o.vseed ?? 0) % 628) / 100;
    }
    const quarter = Math.abs(Math.sin(rot)) > 0.7;
    const L = quarter ? o.h : o.w, W = quarter ? o.w : o.h;          // extent along the sprite's x / y
    const bodyW = frame.width * s - pad * 2, bodyH = frame.height * s - pad * 2;
    const cx = o.x + o.w / 2 - this.ox, cy = o.y + o.h / 2 - this.oy;
    if (p.fit === 'contain') {
      const k = Math.min(L / bodyW, W / bodyH);
      this.dt.stamp(atlas, fr, cx, cy, { rotation: rot, scale: k * s });
    } else if (p.fit === 'nine' && p.slice) {
      const [l, t, r, b] = p.slice as number[];
      const ns = new Phaser.GameObjects.NineSlice(this.scene, cx, cy, atlas, fr, (L + pad * 2) / s, (W + pad * 2) / s, l, r, t, b);
      ns.setOrigin(0.5, 0.5).setScale(s).setRotation(rot);
      this.nines.push(ns);
      this.dt.draw(ns);
    } else if (p.fit === 'tile') {
      this.dt.repeat(atlas, fr, o.x - this.ox, o.y - this.oy, o.w, o.h, { tileScaleX: s, tileScaleY: s, tilePositionX: o.x / s, tilePositionY: o.y / s } as any);
    } else {
      this.dt.stamp(atlas, fr, cx, cy, { rotation: rot, scaleX: (L / bodyW) * s, scaleY: (W / bodyH) * s });
    }
  }
  /** Draw a solid with art; returns false if no art exists (vector fallback). */
  private stampSolid(o: Solid): boolean {
    const any = o as any, wi = this.art.manifest.wallInfo;
    if (o.kind === 'wall') {
      const mat = (wi && wi.materials && (wi.materials[any.inner ? 'drywall' : o.sub || 'concrete'] || wi.materials.concrete)) || { h: 'wall_concrete_h', v: 'wall_concrete_v' };
      return this.strip(mat.h, mat.v, o, false);
    }
    if (o.kind === 'window') {
      const w = (wi && wi.window) || { h: 'window_h', v: 'window_v' };
      const broken = (((o.vseed ?? 0) % 5) === 0 || (o as { smashed?: boolean }).smashed) && w.broken_h;
      return this.strip(broken ? w.broken_h : w.h, broken ? w.broken_v : w.v, o, true);
    }
    if (o.kind === 'fence') {
      const f = wi && wi.fence && (o.sub === 'chainlink' || any.style === 'chain' ? wi.fence.chain : wi.fence.wood);
      if (f && this.strip(f.h, f.v, o, false)) return true;
    }
    const p = this.propFor(o);
    if (!p) return false;
    if (o.kind === 'car') {
      const dirV = any.dir === 'v' || (any.dir === undefined && o.h > o.w);
      // front faces +x in the sprite; legacy: front is the +axis end unless flipped
      const rot = dirV ? (any.flip ? -Math.PI / 2 : Math.PI / 2) : (any.flip ? Math.PI : 0);
      this.stampProp(p, o, { rot });
      return true;
    }
    if (o.kind === 'rock') { this.stampProp(p, o, { spin: true }); return true; }
    this.stampProp(p, o, { side: o.kind === 'furniture' && p.back ? this.wallSide(o) : null });
    return true;
  }
  private stampDoors(b: Building) {
    if(this.angled)return;
    const wi = this.art.manifest.wallInfo, d = wi && wi.door;
    if (!d) return;
    for (const r of b.doors) this.strip(d.h, d.v, r, true);
  }

  // ---------------------------------------------------------------- vector fallbacks / paint
  private decorVec(g: Phaser.GameObjects.Graphics, d: Decor & any, L: number) {
    const R = rng(d.vseed || hash2(d.x, d.y, 7));
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    switch (d.kind) {
      case 'lot': {
        const s = d.surface || d.sub;
        if (s === 'asphalt' && d.lines !== 'none') {
          g.fillStyle(0xd2d2c8, 0.22);
          if (d.lines === 'v') for (let x = d.x + 20; x < d.x + d.w - 10; x += 56) {
            g.fillRect(x - 1, d.y + 6, 2, Math.min(d.h - 12, 84));
            if (d.big || d.h > 300) g.fillRect(x - 1, d.y + d.h - Math.min(d.h - 6, 90), 2, Math.min(d.h - 12, 84));
          } else for (let y = d.y + 20; y < d.y + d.h - 10; y += 56) {
            g.fillRect(d.x + 6, y - 1, Math.min(d.w - 12, 84), 2);
            if (d.big || d.w > 300) g.fillRect(d.x + d.w - Math.min(d.w - 6, 90), y - 1, Math.min(d.w - 12, 84), 2);
          }
        } else if (s === 'field') {
          g.lineStyle(3, 0xdcdcd2, 0.18); g.strokeRect(d.x + 10, d.y + 10, d.w - 20, d.h - 20);
          if (d.w >= d.h) g.lineBetween(cx, d.y + 10, cx, d.y + d.h - 10); else g.lineBetween(d.x + 10, cy, d.x + d.w - 10, cy);
          g.strokeCircle(cx, cy, Math.min(d.w, d.h) * 0.15);
        } else if (s === 'concrete' && d.stripes) {
          g.lineStyle(3, 0xc8aa3c, 0.3); g.strokeRect(d.x + 6, d.y + 6, d.w - 12, d.h - 12);
        }
        return;
      }
      case 'path': if (d.round) { g.fillStyle(d.plaza ? 0x3a3935 : 0x4a4236, 1); g.fillCircle(cx, cy, d.w / 2); } return;
      case 'canopy': g.lineStyle(4, 0xc83c32, 0.35); g.strokeRect(d.x + 2, d.y + 2, d.w - 4, d.h - 4); return;
      case 'helipad':
        g.fillStyle(0x34352f, 1); g.fillCircle(cx, cy, d.w / 2);
        g.lineStyle(6, 0xdcd278, 0.5); g.strokeCircle(cx, cy, d.w / 2 - 14);
        g.fillStyle(0xe6e6dc, 0.55); g.fillRect(cx - 40, cy - 50, 16, 100); g.fillRect(cx + 24, cy - 50, 16, 100); g.fillRect(cx - 40, cy - 8, 80, 16);
        return;
      case 'crosswalk':
        g.fillStyle(0xd7d7cd, 0.5);
        if (d.dir === 'h') for (let x = d.x + 4; x < d.x + d.w - 6; x += 18) g.fillRect(x, d.y, 9, d.h);
        else for (let y = d.y + 4; y < d.y + d.h - 6; y += 18) g.fillRect(d.x, y, d.w, 9);
        return;
      case 'blood':
        g.fillStyle(0x5c0c0a, 0.5); g.fillEllipse(cx, cy, d.w, d.h, 16);
        g.fillStyle(0x460808, 0.45);
        for (let k = 0; k < 5; k++) g.fillCircle(cx + (R() * 2 - 1) * d.w * 0.8, cy + (R() * 2 - 1) * d.h * 0.8, 2 + R() * 4);
        return;
      case 'bones':
        g.fillStyle(0x500c0a, 0.45); g.fillEllipse(cx, cy, d.w * 1.4, d.h * 1.2, 16);
        g.lineStyle(2.5, 0xc8c3af, 0.6);
        for (let k = 0; k < 4; k++) { const a = R() * 6.28, x = cx + (R() * 20 - 10), y = cy + (R() * 20 - 10); g.lineBetween(x, y, x + Math.cos(a) * 12, y + Math.sin(a) * 12); }
        g.fillStyle(0xd2cdb9, 0.7); g.fillCircle(cx + R() * 12 - 6, cy + R() * 12 - 6, 4.5);
        return;
      case 'debris':
        g.fillStyle(hexColor(d.c, 0x3a3530), 1); g.fillRect(d.x, d.y, d.w, d.h);
        g.fillStyle(0x000000, 0.25); g.fillRect(d.x + 1, d.y + d.h - 2, d.w, 2);
        return;
      case 'crack': {
        g.lineStyle(1.2, 0x000000, 0.45); g.beginPath(); let x = d.x, y = d.y; g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += R() * 36 - 18; y += R() * 36 - 18; g.lineTo(x, y); }
        g.strokePath(); return;
      }
      case 'oil': g.fillStyle(0x08080a, 0.45); g.fillEllipse(d.x, d.y, d.w * 1.4, d.h, 14); return;
      case 'tuft':
        g.lineStyle(1, 0x465a32, 0.5);
        for (let k = 0; k < 6; k++) { const x = d.x + R() * d.w, y = d.y + R() * d.h; g.lineBetween(x, y, x + R() * 6 - 3, y - 3 - R() * 5); }
        return;
      case 'leaves':
        for (let k = 0; k < 14; k++) { const v = R(); g.fillStyle(v < 0.33 ? 0x5a4628 : v < 0.66 ? 0x3c4623 : 0x6e5028, 0.5); g.fillRect(d.x + R() * d.w, d.y + R() * d.h, 2 + R() * 2, 2 + R() * 2); }
        return;
      case 'bush':
        g.fillStyle(0x000000, 0.3); g.fillEllipse(cx + 4, cy + 5, d.w, d.h, 14);
        g.fillStyle(0x1e321a, 1); g.fillEllipse(cx, cy, d.w, d.h, 14);
        g.fillStyle(0x50783c, 0.25); g.fillCircle(d.x + d.w * 0.4, d.y + d.h * 0.4, d.w * 0.25);
        return;
      case 'firepit':
        g.fillStyle(0x1a1816, 1); g.fillCircle(cx, cy, d.w / 2); g.lineStyle(4, 0x55524c, 1); g.strokeCircle(cx, cy, d.w / 2);
        return;
      default: void L;
    }
  }
  private sidewalkVec(g: Phaser.GameObjects.Graphics, r: Road & any) {
    const sw = r.sw ?? r.sidewalk ?? 0;
    if (!sw) return;
    const ox = this.ox, oy = this.oy;
    g.fillStyle(0x000000, 0.22);
    if (r.dir === 'h') {
      const a0 = Math.max(r.x - sw, ox), a1 = Math.min(r.x + r.w + sw, ox + CH);
      for (let x = Math.ceil(a0 / 40) * 40; x < a1; x += 40) { g.fillRect(x, r.y - sw, 1, sw); g.fillRect(x, r.y + r.h, 1, sw); }
    } else {
      const a0 = Math.max(r.y - sw, oy), a1 = Math.min(r.y + r.h + sw, oy + CH);
      for (let y = Math.ceil(a0 / 40) * 40; y < a1; y += 40) { g.fillRect(r.x - sw, y, sw, 1); g.fillRect(r.x + r.w, y, sw, 1); }
    }
  }
  private curbVec(g: Phaser.GameObjects.Graphics, r: Road & any) {
    const sw = r.sw ?? r.sidewalk ?? 0;
    if (!sw) return;
    // curb: a light lip on the sidewalk edge and a shadow on the asphalt
    if (r.dir === 'h') {
      g.fillStyle(0x9a9a92, 0.35); g.fillRect(r.x, r.y - 2, r.w, 2); g.fillRect(r.x, r.y + r.h, r.w, 2);
      g.fillStyle(0x000000, 0.3); g.fillRect(r.x, r.y, r.w, 3); g.fillRect(r.x, r.y + r.h - 3, r.w, 3);
    } else {
      g.fillStyle(0x9a9a92, 0.35); g.fillRect(r.x - 2, r.y, 2, r.h); g.fillRect(r.x + r.w, r.y, 2, r.h);
      g.fillStyle(0x000000, 0.3); g.fillRect(r.x, r.y, 3, r.h); g.fillRect(r.x + r.w - 3, r.y, 3, r.h);
    }
  }
  private markVec(g: Phaser.GameObjects.Graphics, r: Road & any) {
    const horiz = r.dir === 'h';
    const s0 = horiz ? r.x : r.y, s1 = horiz ? r.x + r.w : r.y + r.h;
    const c0 = Math.max(s0, (horiz ? this.ox : this.oy) - 40), c1 = Math.min(s1, (horiz ? this.ox : this.oy) + CH + 40);
    if (c1 <= c0) return;
    const mid = horiz ? r.y + r.h / 2 : r.x + r.w / 2, thick = horiz ? r.h : r.w;
    const kind = r.kind;
    const segs = runs(r.cross || [], c0, c1, kind === 'dirt' ? 6 : 34);
    const line = (fixed: number, a: number, b: number, w: number) => { if (horiz) g.fillRect(a, fixed - w / 2, b - a, w); else g.fillRect(fixed - w / 2, a, w, b - a); };
    const dash = (fixed: number, a0: number, a1: number, dl: number, gap: number, w: number) => {
      const per = dl + gap;
      for (let s = Math.floor(a0 / per) * per; s < a1; s += per) { const p0 = Math.max(s, a0), p1 = Math.min(s + dl, a1); if (p1 > p0) line(fixed, p0, p1, w); }
    };
    for (const [a, b] of segs) {
      if (kind === 'avenue') {
        g.fillStyle(0xc8aa3c, 0.6); line(mid - 3.75, a, b, 2.5); line(mid + 3.75, a, b, 2.5);
        g.fillStyle(0xd2d2c8, 0.42); dash(mid - thick / 4, a, b, 26, 34, 2.5); dash(mid + thick / 4, a, b, 26, 34, 2.5);
        g.fillStyle(0xd2d2c8, 0.3); line(horiz ? r.y + 9 : r.x + 9, a, b, 2); line(horiz ? r.y + r.h - 9 : r.x + r.w - 9, a, b, 2);
      } else if (kind === 'street') {
        g.fillStyle(0xc8aa3c, 0.5); dash(mid, a, b, 30, 30, 3);
        g.fillStyle(0xd2d2c8, 0.22); line(horiz ? r.y + 7 : r.x + 7, a, b, 2); line(horiz ? r.y + r.h - 7 : r.x + r.w - 7, a, b, 2);
      } else {
        g.fillStyle(0x3a3326, 0.5); line(mid - thick * 0.22, a, b, 6); line(mid + thick * 0.22, a, b, 6); // wheel ruts
      }
    }
    // stop bars before each crossing (streets and avenues)
    if (kind !== 'dirt') {
      g.fillStyle(0xdcdcd2, 0.42);
      for (const [x0, x1] of r.cross || []) {
        for (const p of [x0 - 30, x1 + 26]) if (p >= c0 - 8 && p <= c1 + 8) {
          if (horiz) g.fillRect(p, p < x0 ? mid : r.y + 4, 4, r.h / 2 - 4); else g.fillRect(p < x0 ? r.x + 4 : mid, p, r.w / 2 - 4, 4);
        }
      }
    }
  }
  private buildingVec(g: Phaser.GameObjects.Graphics, b: Building & any) {
    // room edge shadow (ambient occlusion along walls), door thresholds + mats
    g.lineStyle(6, 0x000000, 0.18);
    for (const r of b.rooms) g.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    for (const d of b.doors as any[]) {
      g.fillStyle(0x4a4238, 1); g.fillRect(d.x, d.y, d.w, d.h);
      // pale concrete step + worn mat outside every doorway, so openings read from the street
      const side = doorSide(b, d), S = 22;
      const sx = side === 'w' ? d.x - S : side === 'e' ? d.x + d.w : d.x - 6, sy = side === 'n' ? d.y - S : side === 's' ? d.y + d.h : d.y - 6;
      const sw = side === 'w' || side === 'e' ? S : d.w + 12, sh = side === 'n' || side === 's' ? S : d.h + 12;
      g.fillStyle(0x000000, 0.25); g.fillRect(sx + 2, sy + 3, sw, sh);
      g.fillStyle(0x8c8a82, 1); g.fillRect(sx, sy, sw, sh);
      g.fillStyle(0xffffff, 0.12); g.fillRect(sx, sy, sw, 2);
      g.fillStyle(0x5a3c28, 0.75);
      if (side === 'n' || side === 's') g.fillRect(d.x + 8, sy + 5, d.w - 16, S - 10); else g.fillRect(sx + 5, d.y + 8, S - 10, d.h - 16);
    }
  }
  private solidVec(g: Phaser.GameObjects.Graphics, o: Solid & any) {
    const x = o.x, y = o.y, w = o.w, h = o.h, horiz = w >= h;
    switch (o.kind) {
      case 'wall': {
        const col = hexColor(o.color, 0x4a4c4f);
        g.fillStyle(0x000000, 0.35); g.fillRect(x + 2, y + 3, w, h);
        g.fillStyle(col, 1); g.fillRect(x, y, w, h);
        g.fillStyle(0xffffff, o.inner ? 0.08 : 0.12); if (horiz) g.fillRect(x, y, w, Math.min(3, h)); else g.fillRect(x, y, Math.min(3, w), h);
        g.fillStyle(0x000000, 0.3); if (horiz) g.fillRect(x, y + h - 2, w, 2); else g.fillRect(x + w - 2, y, 2, h);
        return;
      }
      case 'window':
        g.fillStyle(0x25313a, 1); g.fillRect(x, y, w, h);
        g.fillStyle(0x96b9cd, 0.45); if (horiz) g.fillRect(x + 2, y + h / 2 - 1.5, w - 4, 3); else g.fillRect(x + w / 2 - 1.5, y + 2, 3, h - 4);
        g.fillStyle(hexColor(o.color, 0x4a4c4f), 1);
        if (horiz) { g.fillRect(x, y, 3, h); g.fillRect(x + w - 3, y, 3, h); } else { g.fillRect(x, y, w, 3); g.fillRect(x, y + h - 3, w, 3); }
        return;
      case 'fence':
        if (o.sub === 'chainlink' || o.style === 'chain') {
          g.fillStyle(0x969ba0, 0.35); if (horiz) g.fillRect(x, y + h / 2 - 1, w, 2); else g.fillRect(x + w / 2 - 1, y, 2, h);
          g.fillStyle(0x7a7e82, 1);
          if (horiz) for (let k = x; k <= x + w; k += 60) g.fillRect(k - 2, y, 4, h); else for (let k = y; k <= y + h; k += 60) g.fillRect(x, k - 2, w, 4);
          return;
        }
        g.fillStyle(0x000000, 0.3); g.fillRect(x + 2, y + 3, w, h);
        g.fillStyle(0x4e3c28, 1); g.fillRect(x, y, w, h);
        g.fillStyle(0xffe6be, 0.08); if (horiz) g.fillRect(x, y, w, 2); else g.fillRect(x, y, 2, h);
        g.fillStyle(0x3a2c1c, 1);
        if (horiz) for (let k = x; k <= x + w; k += 40) g.fillRect(k - 3, y - 1, 6, h + 2); else for (let k = y; k <= y + h; k += 40) g.fillRect(x - 1, k - 3, w + 2, 6);
        return;
      case 'rock': {
        const r = Math.min(w, h) * 0.4;
        g.fillStyle(0x000000, 0.3); g.fillRoundedRect(x + 4, y + 4, w, h, r);
        g.fillStyle(0x4c4c48, 1); g.fillRoundedRect(x, y, w, h, r);
        g.fillStyle(0xffffff, 0.08); g.fillRoundedRect(x + 4, y + 3, w * 0.55, h * 0.45, r * 0.5);
        return;
      }
      case 'car': {
        const col = hexColor(o.color, 0x555a60), R = rng(o.vseed || 1);
        g.fillStyle(0x000000, 0.35); g.fillRoundedRect(x + 4, y + 5, w, h, o.truck ? 5 : 10);
        g.fillStyle(col, 1); g.fillRoundedRect(x, y, w, h, o.truck ? 5 : 10);
        g.lineStyle(2, 0x000000, 0.55); g.strokeRoundedRect(x, y, w, h, o.truck ? 5 : 10);
        const L = horiz ? w : h, along = (f: number, len: number) => (o.flip ? L - f * L - len : f * L);
        g.fillStyle(o.wreck ? 0x141210 : 0x1b2731, 1);
        const ws = along(0.58, L * 0.14), rs = along(0.2, L * 0.1);
        if (horiz) { g.fillRect(x + ws, y + 6, L * 0.14, h - 12); g.fillRect(x + rs, y + 6, L * 0.1, h - 12); }
        else { g.fillRect(x + 6, y + ws, w - 12, L * 0.14); g.fillRect(x + 6, y + rs, w - 12, L * 0.1); }
        g.fillStyle(0xffffff, 0.08);
        if (horiz) g.fillRect(x + along(0.3, L * 0.28), y + 5, L * 0.28, h - 10); else g.fillRect(x + 5, y + along(0.3, L * 0.28), w - 10, L * 0.28);
        if (o.wreck) for (let k = 0; k < 4; k++) { g.fillStyle(R() < 0.5 ? 0x783c1e : 0x000000, 0.45); g.fillCircle(x + 6 + R() * (w - 12), y + 6 + R() * (h - 12), 3 + R() * 5); }
        return;
      }
      case 'furniture': default: {
        const col = hexColor(o.color || FCOL[o.sub], 0x4a4540);
        if (o.tall) { g.fillStyle(0x000000, 0.35); g.fillRect(x + 3, y + 4, w, h); }
        else { g.fillStyle(0x000000, 0.22); g.fillRect(x + 2, y + 2, w, h); }
        if (o.sub === 'barrel' || o.sub === 'fountain' || o.sub === 'statue') {
          g.fillStyle(col, 1); g.fillCircle(x + w / 2, y + h / 2, w / 2);
          g.fillStyle(0xffffff, 0.08); g.fillCircle(x + w / 2 - w * 0.12, y + h / 2 - h * 0.12, w * 0.28);
          return;
        }
        if (o.sub === 'planter' || o.sub === 'plant') {
          g.fillStyle(col, 1); g.fillRect(x, y, w, h);
          g.fillStyle(0x24401f, 1); g.fillCircle(x + w / 2, y + h / 2, w / 2 + 4);
          g.fillStyle(0x78a05a, 0.2); g.fillCircle(x + w / 2 - 5, y + h / 2 - 5, w / 4);
          return;
        }
        g.fillStyle(col, 1); g.fillRect(x, y, w, h);
        g.fillStyle(0xffffff, 0.07); g.fillRect(x + 2, y + 2, w - 4, 3);
        g.lineStyle(1.5, 0x000000, 0.45); g.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
        if (o.sub === 'bed' || o.sub === 'hbed' || o.sub === 'cot') {
          g.fillStyle(o.sub === 'cot' ? 0x5d6450 : 0xc8c8c0, 1); if (horiz) g.fillRect(x + 4, y + 4, 16, h - 8); else g.fillRect(x + 4, y + 4, w - 8, 16);
          if (o.sub !== 'cot') { g.fillStyle(o.sub === 'hbed' ? 0xb8c4c8 : 0x6e5a7a, 1); if (horiz) g.fillRect(x + w * 0.4, y + 2, w * 0.58, h - 4); else g.fillRect(x + 2, y + h * 0.4, w - 4, h * 0.58); }
        } else if (o.sub === 'shelf' || o.sub === 'rack' || o.sub === 'bookshelf' || o.sub === 'clothes' || o.sub === 'clothing') {
          const R = rng(o.vseed || 3), n = Math.max(2, Math.floor((horiz ? w : h) / 12));
          const pal = [0x7a5a3a, 0x4a6a7a, 0x8a3a3a, 0x6a7a4a, 0x9a8a5a, 0x5a4a6a];
          for (let k = 0; k < n; k++) {
            if (R() < 0.3) continue;
            g.fillStyle(pal[Math.floor(R() * pal.length)], 1);
            if (horiz) g.fillRect(x + 3 + k * ((w - 6) / n), y + 3, (w - 6) / n - 2, h - 6); else g.fillRect(x + 3, y + 3 + k * ((h - 6) / n), w - 6, (h - 6) / n - 2);
          }
        } else if (o.sub === 'crate' || o.sub === 'mcrate' || o.sub === 'pallet') {
          g.lineStyle(2, 0x000000, 0.45); g.lineBetween(x + 3, y + 3, x + w - 3, y + h - 3); g.lineBetween(x + w - 3, y + 3, x + 3, y + h - 3);
        } else if (o.sub === 'stove') {
          g.lineStyle(2, 0x1a1a1a, 1);
          for (const [px, py] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) g.strokeCircle(x + w * px, y + h * py, Math.min(w, h) * 0.13);
        } else if (o.sub === 'tv') { g.fillStyle(0x506e8c, 0.4); g.fillRect(x + 4, y + 4, w - 8, h - 8); }
        else if (o.sub === 'toilet' || o.sub === 'tub' || o.sub === 'sink') { g.fillStyle(0x7a8a90, 1); g.fillRoundedRect(x + 5, y + 5, w - 10, h - 10, 6); }
        else if (o.sub === 'medcab') { g.fillStyle(0xb02a2a, 1); const s = Math.min(w, h) * 0.5; g.fillRect(x + w / 2 - s / 2, y + h / 2 - s / 6, s, s / 3); g.fillRect(x + w / 2 - s / 6, y + h / 2 - s / 2, s / 3, s); }
        else if (o.sub === 'pump') { g.fillStyle(0xe8d8a0, 1); g.fillRect(x + 4, y + h / 2 - 5, w - 8, 10); }
      }
    }
  }
}

function solidOrder(o: Solid) {
  switch (o.kind) {
    case 'rock': return 0; case 'car': return 1; case 'furniture': return (o as any).tall ? 3 : 2;
    case 'fence': return 4; case 'window': return 5; case 'wall': return 6; default: return 2;
  }
}
const ANG: Record<string, number> = { e: 0, s: Math.PI / 2, w: Math.PI, n: -Math.PI / 2 };
function backRotation(back: string, side: string, cur: number) {
  // sprite's back edge -> world side the furniture's back faces
  const ang: Record<string, number> = { e: 0, s: Math.PI / 2, w: Math.PI, n: -Math.PI / 2 };
  const s = side === 'left' ? 'w' : side === 'right' ? 'e' : side === 'top' ? 'n' : side === 'bottom' ? 's' : side;
  if (ang[s] === undefined || ang[back] === undefined) return cur;
  return ang[s] - ang[back];
}
function runs(cross: [number, number][], a0: number, a1: number, pad: number) {
  const out: [number, number][] = [];
  const cs = cross.slice().sort((p, q) => p[0] - q[0]);
  let cur = a0;
  for (const c of cs) {
    const s = c[0] - pad, e = c[1] + pad;
    if (e <= cur) continue;
    if (s > cur) out.push([cur, Math.min(s, a1)]);
    cur = Math.max(cur, e);
    if (cur >= a1) break;
  }
  if (cur < a1) out.push([cur, a1]);
  return out.filter((p) => p[1] > p[0]);
}
export { TX };
