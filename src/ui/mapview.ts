// mapview.ts — pre-rendered low-res world map + minimap / full-map drawing (port of legacy sv-worldrender drawMinimap/drawMap).
import type { GameState, Vec } from '../sim/types';
import * as explore from '../sim/explore';
import * as road from '../sim/road';
import { ZONE_FLOOR, type HiveInfo } from '../sim/hive-world';

const MAPRES = 2048;
export const POICOL: Record<string, string> = {
  police: '#6a9ae8', hospital: '#ff6a6a', gun_store: '#ffa04a', military: '#b8d070', school: '#e0b070', gas_station: '#ff7a5a',
  park: '#7ac070', warehouse: '#b0b0b0', district: '#e8e8e0', store: '#9ab0c8', office: '#9aa3b0', house: '#a89880',
};
const MAPSURF: Record<string, string> = {
  water: '#385e61',
  forest: '#1d2a19', grass: '#2b3624', park: '#2f4a28', concrete: '#3a3a37', gravel: '#38342b', asphalt: '#2c2c2e',
  dirt: '#3a3326', field: '#33502a', base: '#3a3d30',
};
const MAPB: Record<string, string> = {
  house: '#7d6a55', store: '#5f7487', police: '#4a6aa8', hospital: '#c9cbc6', gun_store: '#b0603a', military: '#6f7d48',
  warehouse: '#6c7076', office: '#80858d', school: '#94704c', gas_station: '#b04a3a', cabin: '#6a5238',
};

export function worldSize(state: GameState) {
  const g = state.grid;
  return g ? { w: g.cols * g.cell, h: g.rows * g.cell } : { w: 16000, h: 16000 };
}

const images = new WeakMap<GameState, HTMLCanvasElement | null>();
const hiveDrawn = new WeakMap<GameState, number>();
/** The Hive Below: the deepest cell June has mapped so far (the sector of the current mission). */
const hiveKnown = (state: GameState) => state.road?.world.hive ? road.missionOf(state)?.sector ?? 0 : -1;
const css = (c: number, k = 1) => `rgb(${Math.round(((c >> 16) & 255) * k)},${Math.round(((c >> 8) & 255) * k)},${Math.round((c & 255) * k)})`;
/** The Hollow: cells you have reached in their own colour, the rest of the comb as a faint shape in the rock. */
function drawHiveMap(g: CanvasRenderingContext2D, h: HiveInfo, known: number) {
  const T = h.tile, n = h.n;
  g.fillStyle = '#0b0908'; g.fillRect(0, 0, n * T, n * T);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!h.floor[y * n + x]) continue;
    const z = h.zone[y * n + x] || 8, sector = z === 8 ? 0 : z;
    g.fillStyle = sector <= known ? css(ZONE_FLOOR[z], 0.8) : '#1c1815';
    g.fillRect(x * T, y * T, T + 1, T + 1);
  }
  g.fillStyle = '#6a6c68'; g.fillRect(h.dam.x, h.dam.y + 60, h.dam.w, h.dam.h - 60);
  g.fillStyle = '#b48cff'; g.beginPath(); g.arc(h.rift.x, h.rift.y, 70, 0, Math.PI * 2); g.fill();
}

/** Pre-render (once per state) the whole world to a 2048px image. */
export function getMapImage(state: GameState): HTMLCanvasElement | null {
  const hive = state.road?.world.hive, known = hiveKnown(state);
  if (images.has(state) && (!hive || hiveDrawn.get(state) === known)) return images.get(state)!;
  let c: HTMLCanvasElement | null = null;
  try {
    c = document.createElement('canvas');
    c.width = c.height = MAPRES;
    const g = c.getContext('2d')!;
    const { w: W, h: H } = worldSize(state);
    const s = MAPRES / Math.max(W, H);
    g.setTransform(s, 0, 0, s, 0, 0);
    if (hive) { drawHiveMap(g, hive, known); g.setTransform(1, 0, 0, 1, 0, 0); images.set(state, c); hiveDrawn.set(state, known); return c; }
    g.fillStyle = MAPSURF.forest; g.fillRect(0, 0, W, H);
    for (const d of state.decor) {
      if (d.kind === 'lot') { g.fillStyle = MAPSURF[d.sub || 'grass'] || MAPSURF.grass; g.fillRect(d.x, d.y, d.w, d.h); }
      else if (d.kind === 'path' || d.kind === 'drive') { g.fillStyle = '#4a463c'; g.fillRect(d.x, d.y, d.w, d.h); }
    }
    g.fillStyle = '#16200f';
    state.grid.each(0, 0, W, H, (o) => { if (o.kind === 'tree') g.fillRect(o.x - 20, o.y - 20, 50, 50); });
    for (const r of state.roads as (typeof state.roads[number] & { sw?: number })[]) {
      const sw = r.sw ?? r.sidewalk ?? 0;
      if (sw) { g.fillStyle = '#4b4b47'; g.fillRect(r.x - sw, r.y - sw, r.w + sw * 2, r.h + sw * 2); }
    }
    for (const r of state.roads) {
      g.fillStyle = r.kind === 'avenue' ? '#6a6a6c' : r.kind === 'street' ? '#58585b' : '#4e4a40';
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    for (const b of state.buildings) {
      g.fillStyle = MAPB[b.kind] || '#777'; g.fillRect(b.x, b.y, b.w, b.h);
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 12; g.strokeRect(b.x, b.y, b.w, b.h);
    }
    state.grid.each(0, 0, W, H, (o) => {
      if (o.kind === 'wall' && o.sub === 'military' && !o.buildingId) { g.fillStyle = '#9aa080'; g.fillRect(o.x - 8, o.y - 8, o.w + 16, o.h + 16); }
    });
    g.setTransform(1, 0, 0, 1, 0, 0);
  } catch { c = null; }
  images.set(state, c);
  return c;
}

/** Draw world rect (wx,wy,ww,wh) into dest rect, clipping to the image. */
function blit(ctx: CanvasRenderingContext2D, state: GameState, wx: number, wy: number, ww: number, wh: number, dx: number, dy: number, dw: number) {
  const img = getMapImage(state); if (!img) return;
  const { w: W, h: H } = worldSize(state);
  const s = MAPRES / Math.max(W, H), k = dw / ww;
  const x0 = Math.max(0, wx), y0 = Math.max(0, wy), x1 = Math.min(W, wx + ww), y1 = Math.min(H, wy + wh);
  if (x1 <= x0 || y1 <= y0) return;
  ctx.drawImage(img, x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s, dx + (x0 - wx) * k, dy + (y0 - wy) * k, (x1 - x0) * k, (y1 - y0) * k);
}

// ---- fog of war: one pixel per explored cell, scaled up with smoothing so the edge is soft
const fogs = new WeakMap<GameState, { c: HTMLCanvasElement; img: ImageData; rev: number }>();
function fogCanvas(state: GameState): HTMLCanvasElement | null {
  if (state.mode !== 'survival') return null;
  let f = fogs.get(state);
  if (!f) {
    const c = document.createElement('canvas'); c.width = explore.COLS; c.height = explore.ROWS;
    const g = c.getContext('2d'); if (!g) return null;
    f = { c, img: g.createImageData(explore.COLS, explore.ROWS), rev: -1 }; fogs.set(state, f);
  }
  const rev = explore.rev(state);
  if (f.rev !== rev) {
    f.rev = rev;
    const grid = explore.grid(state), d = f.img.data;
    for (let i = 0; i < grid.length; i++) { const o = i * 4; d[o] = 10; d[o + 1] = 11; d[o + 2] = 9; d[o + 3] = grid[i] ? 0 : 255; }
    f.c.getContext('2d')!.putImageData(f.img, 0, 0);
  }
  return f.c;
}
/** Cover unexplored parts of world rect (wx,wy,ww,wh) drawn at (dx,dy) with width dw. */
function fogBlit(ctx: CanvasRenderingContext2D, state: GameState, wx: number, wy: number, ww: number, wh: number, dx: number, dy: number, dw: number) {
  const c = fogCanvas(state); if (!c) return;
  const k = dw / ww, cell = explore.CELL;
  // the fog grid covers COLS*CELL x ROWS*CELL; draw it whole (cheap: 128 px source) transformed into view
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, c.width, c.height, dx - wx * k, dy - wy * k, c.width * cell * k, c.height * cell * k);
  ctx.restore();
  void wh;
}
const seen = (state: GameState, x: number, y: number) => explore.isExplored(state, x, y);

function arrow(g: CanvasRenderingContext2D, x: number, y: number, ang: number, s: number) {
  g.save(); g.translate(x, y); g.rotate(ang || 0);
  g.fillStyle = '#5ab0ff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * 0.7, s * 0.65); g.lineTo(-s * 0.35, 0); g.lineTo(-s * 0.7, -s * 0.65); g.closePath();
  g.fill(); g.stroke(); g.restore();
}
function bedIcon(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.fillStyle = '#e8d070'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x + s * 0.65, y); g.lineTo(x + s * 0.65, y + s * 0.8); g.lineTo(x - s * 0.65, y + s * 0.8); g.lineTo(x - s * 0.65, y); g.lineTo(x - s, y); g.closePath();
  g.fill(); g.stroke();
}
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, col: string, bold: boolean) {
  g.font = (bold ? 'bold ' : '') + size + 'px "Barlow Condensed", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(text, x, y);
  g.fillStyle = col; g.fillText(text, x, y);
}
export function bedPos(state: GameState): Vec | null {
  const id = state.base && state.base.bed; if (!id) return null;
  const s = state.structures.find((o) => o.id === id);
  return s ? { x: s.x + s.w / 2, y: s.y + s.h / 2 } : null;
}

/** Minimap: square view, ~2600 world px across, centred on the player. size = css px, dpr already applied to ctx.canvas dims. */
export function drawMinimap(ctx: CanvasRenderingContext2D, state: GameState, px: number) {
  const p = state.player; if (!p) return;
  const span = 2600, k = px / span, wx = p.x - span / 2, wy = p.y - span / 2;
  ctx.save();
  ctx.fillStyle = '#0d0f0c'; ctx.fillRect(0, 0, px, px);
  blit(ctx, state, wx, wy, span, span, 0, 0, px);
  fogBlit(ctx, state, wx, wy, span, span, 0, 0, px);
  const toS = (x: number, y: number) => [(x - wx) * k, (y - wy) * k] as const;
  for (const q of state.pois) {
    if (q.kind === 'district' || !seen(state, q.x, q.y) || q.x < wx || q.y < wy || q.x > wx + span || q.y > wy + span) continue;
    const [sx, sy] = toS(q.x, q.y);
    ctx.fillStyle = POICOL[q.kind] || '#ddd'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // hostiles nearby (radar blips); a burrow is a bigger amber mark, an egg cluster is not a hostile
  for (const z of state.zombies) {
    if (z.dead || z.type === 'egg') continue;
    const dx = z.x - p.x, dy = z.y - p.y;
    if (dx * dx + dy * dy > 1100 * 1100) continue;
    const [sx, sy] = toS(z.x, z.y);
    if (z.type === 'burrow') { ctx.fillStyle = '#f0a93a'; ctx.fillRect(sx - 2.5, sy - 2.5, 5, 5); ctx.fillStyle = '#1a100a'; ctx.fillRect(sx - 1, sy - 1, 2, 2); }
    else { ctx.fillStyle = 'rgba(230,60,50,0.9)'; ctx.fillRect(sx - 1.2, sy - 1.2, 2.4, 2.4); }
  }
  for (const d of state.drops) {
    if (d.kind !== 'deathbag') continue;
    const [sx, sy] = toS(d.x, d.y); ctx.fillStyle = '#e04545'; ctx.fillRect(sx - 3, sy - 3, 6, 6);
  }
  const bp = bedPos(state);
  roadMarkers(ctx, state, toS, px, px, false);
  if (bp) { const [sx, sy] = toS(bp.x, bp.y); bedIcon(ctx, Math.max(7, Math.min(px - 7, sx)), Math.max(7, Math.min(px - 7, sy)), 5); }
  const [ax, ay] = toS(p.x, p.y); arrow(ctx, ax, ay, p.angle, 6);
  ctx.restore();
}

export interface MapView { cx: number; cy: number; zoom: number }

/** Full map: view centred on world (cx,cy); zoom 1 fits the whole world in the shorter canvas side. */
export function drawFullMap(ctx: CanvasRenderingContext2D, state: GameState, view: MapView, W: number, H: number) {
  const ws = worldSize(state), size = Math.min(W, H), k = (size / Math.max(ws.w, ws.h)) * view.zoom;
  const wx = view.cx - W / 2 / k, wy = view.cy - H / 2 / k;
  ctx.save();
  ctx.fillStyle = '#0a0b09'; ctx.fillRect(0, 0, W, H);
  blit(ctx, state, wx, wy, W / k, H / k, 0, 0, W);
  fogBlit(ctx, state, wx, wy, W / k, H / k, 0, 0, W);
  const toS = (x: number, y: number) => [(x - wx) * k, (y - wy) * k] as const;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let g = 2000; g < ws.w; g += 2000) { const [sx] = toS(g, 0); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); }
  for (let g = 2000; g < ws.h; g += 2000) { const [, sy] = toS(0, g); ctx.moveTo(0, sy); ctx.lineTo(W, sy); }
  ctx.stroke();
  const fs = Math.max(11, Math.round(size / 55));
  const PRIO: Record<string, number> = { military: 0, hospital: 1, police: 2, gun_store: 3, school: 4, park: 5 };
  const pois = state.pois.filter((q) => q.kind !== 'district' && seen(state, q.x, q.y)).slice().sort((a, b) => (PRIO[a.kind] ?? 9) - (PRIO[b.kind] ?? 9));
  // The Hive Below: only the cells already reached have a name on June's map
  const hiveNames = state.road?.world.hive ? new Set(state.road.world.sectors.filter(sec => sec.id <= hiveKnown(state)).map(sec => sec.name)) : null;
  for (const q of state.pois) {
    if (q.kind !== 'district' || !seen(state, q.x, q.y) || (hiveNames && !hiveNames.has(q.name))) continue;
    const [sx, sy] = toS(q.x, q.y);
    if (sx > -120 && sy > -20 && sx < W + 120 && sy < H + 20) label(ctx, q.name.toUpperCase(), sx, sy, Math.round(fs * 1.35), 'rgba(232,232,224,0.75)', true);
  }
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  ctx.font = fs + 'px "Barlow Condensed", sans-serif';
  for (const q of pois) {
    const [sx, sy] = toS(q.x, q.y);
    if (sx < -80 || sy < -20 || sx > W + 80 || sy > H + 20) continue;
    ctx.fillStyle = POICOL[q.kind] || '#ddd'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, Math.max(3, fs * 0.38), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const tw = ctx.measureText(q.name).width / 2 + 3, box = { x0: sx - tw, y0: sy - fs * 1.5, x1: sx + tw, y1: sy - fs * 0.5 };
    if (placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
    placed.push(box); label(ctx, q.name, sx, sy - fs, fs, POICOL[q.kind] || '#ddd', false);
  }
  for (const d of state.drops) {
    if (d.kind !== 'deathbag') continue;
    const [sx, sy] = toS(d.x, d.y); ctx.fillStyle = '#e04545'; ctx.fillRect(sx - 4, sy - 4, 8, 8);
    label(ctx, 'Your stuff', sx, sy - fs, fs, '#e04545', true);
  }
  const bp = bedPos(state);
  roadMarkers(ctx, state, toS, W, H, true);
  if (bp) { const [sx, sy] = toS(bp.x, bp.y); bedIcon(ctx, sx, sy, Math.max(6, fs * 0.7)); label(ctx, 'Base', sx, sy - fs * 1.2, fs, '#e8d070', true); }
  const p = state.player;
  if (p) { const [sx, sy] = toS(p.x, p.y); arrow(ctx, sx, sy, p.angle, Math.max(7, fs * 0.8)); }
  // world border
  const [bx, by] = toS(0, 0), [ex, ey] = toS(ws.w, ws.h);
  ctx.strokeStyle = 'rgba(200,60,50,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, ex - bx, ey - by);
  ctx.restore();
}

/** The Long Road: the current objective, the gates on the route and the group's camp. */
function roadMarkers(ctx: CanvasRenderingContext2D, state: GameState, toS: (x: number, y: number) => readonly [number, number], w: number, h: number, labels: boolean) {
  const r = state.road; if (!r || state.mode !== 'road') return;
  const clampP = (p: readonly [number, number]) => [Math.max(9, Math.min(w - 9, p[0])), Math.max(9, Math.min(h - 9, p[1]))] as const;
  const hive = !!r.world.hive, known = hiveKnown(state);
  for (const g of r.world.gates) {
    if (hive && g.id > known) continue;   // seals further in are not on the map yet
    const raw = toS(g.x + g.w / 2, g.y + g.h / 2);
    if (raw[0] < -10 || raw[0] > w + 10 || raw[1] < -10 || raw[1] > h + 10) continue;
    ctx.fillStyle = g.open ? '#8fd98a' : hive ? '#f0a93a' : '#e05050'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.rect(raw[0] - 5, raw[1] - 5, 10, 10); ctx.fill(); ctx.stroke();
    if (labels) label(ctx, hive ? (g.open ? 'Seal (broken)' : 'Resin seal') : g.open ? 'Gate (open)' : 'Gate (locked)', raw[0], raw[1] - 12, 11, g.open ? '#8fd98a' : hive ? '#f0a93a' : '#e05050', false);
  }
  for (const c of r.cast) { const [x, y] = toS(c.x, c.y); if (x < 0 || x > w || y < 0 || y > h) continue; ctx.fillStyle = '#9ed9ac'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); }
  for (const a of r.allies) {
    const [x, y] = toS(a.x, a.y); if (x < 0 || x > w || y < 0 || y > h) continue;
    ctx.fillStyle = '#9ed9dc'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    if (labels) label(ctx, a.name, x, y - 12, 11, '#9ed9dc', false);
  }
  const run = road.currentRun(state);
  if (run && r.phase === 'play') {
    const raw = toS(run.point.x, run.point.y), [x, y] = clampP(raw);
    const t = (performance.now() / 600) % 1, pulse = 7 + Math.sin(t * Math.PI * 2) * 2;
    ctx.fillStyle = '#f4cf80'; ctx.strokeStyle = '#2a2208'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - pulse); ctx.lineTo(x + pulse * 0.85, y); ctx.lineTo(x, y + pulse); ctx.lineTo(x - pulse * 0.85, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (labels) label(ctx, road.current(state)?.text ?? 'Objective', x, y - 17, 12, '#f4cf80', true);
  }
}
