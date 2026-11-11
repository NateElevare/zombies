// art/lib/core.ts — shared helpers for procedural art generators (orchestrator-owned; agents may ADD helpers
// in their own files under art/lib/, e.g. art/lib/shading.ts — do not rewrite this file's existing exports).
import { createCanvas, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const ART_SCALE = 2;
export const OUT = join(process.cwd(), 'public', 'assets');
export type Ctx = SKRSContext2D;
export type { Canvas };

// ---------- deterministic RNG (mulberry32) ----------
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + next() * (hi - lo),
    int: (lo: number, hi: number) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: <T>(a: readonly T[]) => a[Math.floor(next() * a.length)],
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof rng>;

// ---------- canvas ----------
export function canvas(w: number, h: number): { c: Canvas; g: Ctx } {
  const c = createCanvas(Math.ceil(w), Math.ceil(h));
  return { c, g: c.getContext('2d') };
}

// ---------- value noise (tileable with the given lattice period) ----------
export function makeNoise(seed: number, period = 256) {
  const R = rng(seed), P = new Float32Array(period * period);
  for (let i = 0; i < P.length; i++) P[i] = R.next();
  const at = (x: number, y: number) => P[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const value = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  /** fractal noise 0..1; x,y in lattice units. Tileable over `period` lattice units at f=1. */
  const fbm = (x: number, y: number, oct = 4) => {
    let s = 0, amp = 0.5, f = 1, n = 0;
    for (let o = 0; o < oct; o++) { s += value(x * f, y * f) * amp; n += amp; amp *= 0.5; f *= 2; }
    return s / n;
  };
  return { value, fbm };
}

// ---------- color ----------
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgb(r: number, g: number, b: number, a = 1) {
  return a >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}
/** Lighten (k>0) or darken (k<0) a hex color, k in -1..1 */
export function shade(hex: string, k: number, a = 1) {
  const [r, g, b] = hexToRgb(hex);
  const t = k < 0 ? 0 : 255, p = Math.abs(k);
  return rgb(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p, a);
}
export function mix(h1: string, h2: string, t: number) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ---------- atlas packing (shelf packer) ----------
export interface Frame { name: string; canvas: Canvas; extrude?: number }
export function packAtlas(name: string, frames: Frame[], maxSize = 4096, pad = 2) {
  const sorted = [...frames].sort((a, b) => b.canvas.height - a.canvas.height || b.canvas.width - a.canvas.width);
  let W = 512, H = 0;
  let placed: { f: Frame; x: number; y: number }[] = [];
  for (; W <= maxSize; W *= 2) {
    placed = []; let x = pad, y = pad, rowH = 0;
    for (const f of sorted) {
      const e = f.extrude || 0, w = f.canvas.width + e * 2, h = f.canvas.height + e * 2;
      if (x + w + pad > W) { x = pad; y += rowH + pad; rowH = 0; }
      placed.push({ f, x: x + e, y: y + e });
      x += w + pad; rowH = Math.max(rowH, h);
    }
    H = y + rowH + pad;
    if (H <= W || W === maxSize) break;
  }
  if (H > maxSize) throw new Error(`atlas ${name} overflow (${W}x${H}); split it into more atlases`);
  let PH = 64; while (PH < H) PH *= 2;
  const { c, g } = canvas(W, PH);
  const json: any = { frames: {}, meta: { app: 'deadzone-art', image: name + '.png', size: { w: W, h: PH }, scale: '1' } };
  for (const { f, x, y } of placed) {
    const w = f.canvas.width, h = f.canvas.height, e = f.extrude || 0;
    if (e) { // extrude edges (tiles) so linear filtering does not bleed
      g.drawImage(f.canvas, 0, 0, w, 1, x, y - e, w, e); g.drawImage(f.canvas, 0, h - 1, w, 1, x, y + h, w, e);
      g.drawImage(f.canvas, 0, 0, 1, h, x - e, y, e, h); g.drawImage(f.canvas, w - 1, 0, 1, h, x + w, y, e, h);
    }
    g.drawImage(f.canvas, x, y);
    json.frames[f.name] = { frame: { x, y, w, h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w, h }, sourceSize: { w, h } };
  }
  writeFile(join(OUT, name + '.png'), c.toBuffer('image/png'));
  writeFile(join(OUT, name + '.json'), JSON.stringify(json));
  return { name, w: W, h: PH, count: frames.length };
}

// ---------- manifest fragments (merged by art/build.ts) ----------
export interface ManifestFragment {
  atlases?: string[];
  sprites?: Record<string, any>;
  tiles?: Record<string, string[]>;
  props?: Record<string, any>;
  anims?: { key: string; atlas: string; frames: string[]; frameRate: number; repeat: number }[];
  [k: string]: any;
}

export function writeFile(path: string, data: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}
export function savePng(path: string, c: Canvas) { writeFile(path, c.toBuffer('image/png')); }

/** Contact sheet: frames in a labeled grid for visual inspection (write under art/preview/). */
export function contactSheet(path: string, frames: Frame[], cols = 8, bg = '#556') {
  const cw = Math.max(...frames.map((f) => f.canvas.width)), ch = Math.max(...frames.map((f) => f.canvas.height)) + 14;
  const rows = Math.ceil(frames.length / cols);
  const { c, g } = canvas(cols * cw, rows * ch);
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  frames.forEach((f, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    g.drawImage(f.canvas, x, y);
    g.fillStyle = '#fff'; g.font = '10px sans-serif'; g.fillText(f.name.slice(-22), x + 2, y + ch - 3);
  });
  savePng(path, c);
}
