/** Code-drawn pixel props for The Hive Below: the things the painted sheets do not cover (burrow mouths, egg
 *  clusters, resin seals, the rift, honey, resin lumps). Drawn at half size on a pixel grid with a hard outline and
 *  doubled, so they sit beside the painted creatures. Deterministic. art/hive/build.ts packs them as `hive_props`. */
import { canvas, rng, type Canvas } from '../lib/core';

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A half-resolution pixel buffer. */
class Pix {
  d: Float32Array;
  constructor(public w: number, public h: number) { this.d = new Float32Array(w * h * 4); }
  put(x: number, y: number, c: RGB, a = 1) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, k = a, o = this.d[i + 3] * (1 - k);
    const out = k + o; if (out <= 0) return;
    for (let j = 0; j < 3; j++) this.d[i + j] = (c[j] * k + this.d[i + j] * o) / out;
    this.d[i + 3] = out;
  }
  alpha(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[((y | 0) * this.w + (x | 0)) * 4 + 3]; }
  /** A lumpy filled shape: radius varies with the angle. `shade` lights it from the upper left. */
  blob(cx: number, cy: number, rx: number, ry: number, col: RGB, o: { lump?: number; seed?: number; shade?: number; hi?: RGB; lo?: RGB; a?: number; grain?: number } = {}) {
    const R = rng(o.seed ?? 1), ph = [R.next() * 6.3, R.next() * 6.3, R.next() * 6.3], lump = o.lump ?? 0;
    const hi = o.hi ?? mix(col, [255, 255, 255], 0.35), lo = o.lo ?? mix(col, [0, 0, 0], 0.45), G = rng((o.seed ?? 1) * 7 + 3);
    for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, ang = Math.atan2(dy, dx);
      const edge = 1 + lump * (Math.sin(ang * 3 + ph[0]) * 0.5 + Math.sin(ang * 5 + ph[1]) * 0.3 + Math.sin(ang * 9 + ph[2]) * 0.2);
      const d = Math.hypot(dx, dy) / edge;
      if (d > 1) continue;
      let c = col;
      if (o.shade) { const l = (-dx - dy) * 0.5 * o.shade + (1 - d) * 0.15; c = l > 0 ? mix(col, hi, Math.min(1, l)) : mix(col, lo, Math.min(1, -l)); }
      if (o.grain) { const n = (G.next() - 0.5) * o.grain; c = n > 0 ? mix(c, [255, 255, 255], n) : mix(c, [0, 0, 0], -n); }
      this.put(x, y, c, o.a ?? 1);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    for (let i = 0; i <= n; i++) this.put(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c, a);
  }
  /** Dark one-pixel rim around everything opaque (the painted sprites have one). */
  outline(c: RGB, a = 1) {
    const edge: number[] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y) > 0.5) continue;
      if (this.alpha(x - 1, y) > 0.5 || this.alpha(x + 1, y) > 0.5 || this.alpha(x, y - 1) > 0.5 || this.alpha(x, y + 1) > 0.5) edge.push(x, y);
    }
    for (let i = 0; i < edge.length; i += 2) { const k = (edge[i + 1] * this.w + edge[i]) * 4; this.d[k] = c[0]; this.d[k + 1] = c[1]; this.d[k + 2] = c[2]; this.d[k + 3] = a; }
  }
  /** Doubled onto a canvas of `size` x `size` (centred). */
  toCanvas(size = this.w * 2): Canvas {
    const { c, g } = canvas(size, size), im = g.createImageData(this.w * 2, this.h * 2);
    for (let y = 0; y < this.h * 2; y++) for (let x = 0; x < this.w * 2; x++) {
      const s = ((y >> 1) * this.w + (x >> 1)) * 4, t = (y * this.w * 2 + x) * 4, a = this.d[s + 3];
      im.data[t] = this.d[s]; im.data[t + 1] = this.d[s + 1]; im.data[t + 2] = this.d[s + 2]; im.data[t + 3] = a >= 0.99 ? 255 : a < 0.06 ? 0 : Math.round(a * 255);
    }
    g.putImageData(im, (size - this.w * 2) / 2, (size - this.h * 2) / 2);
    return c;
  }
}

const EARTH = hex('#5a4028'), EARTH_HI = hex('#8a6a40'), EARTH_LO = hex('#2c1c10'), RESIN = hex('#d89a3a'), INK = hex('#1a100a');
const VIOLET = hex('#b48cff'), SHELL = hex('#e8e2c0'), SHELL_LO = hex('#a89a70'), ICHOR = hex('#b7e04a'), HONEY = hex('#e8a020');

// ------------------------------------------------------------------ burrow mouth (192 px frame, drawn at 96)
function burrow(phase: 'idle' | 'erupt' | 'fall' | 'rubble', t: number): Canvas {
  const p = new Pix(96, 96), R = rng(41), cx = 48, cy = 48;
  const fallen = phase === 'rubble' ? 1 : phase === 'fall' ? t : 0, bulge = phase === 'erupt' ? Math.sin(t * Math.PI) * 2.5 : 0;
  // the heap: a ring of thrown earth, taller on the far side
  p.blob(cx, cy, 39 + bulge - fallen * 5, 37 + bulge - fallen * 5, EARTH, { lump: 0.09, seed: 5, shade: 0.9, hi: EARTH_HI, lo: EARTH_LO, grain: 0.22 });
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2 + R.next() * 0.2, r = 27 + R.next() * 9 + bulge - fallen * 6, s = 3 + R.next() * 3.5;
    p.blob(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.95, s, s * 0.85, mix(EARTH, R.chance(0.5) ? EARTH_HI : EARTH_LO, R.next() * 0.5), { lump: 0.2, seed: 60 + i, shade: 1, grain: 0.15 });
  }
  // resin: the hive glues its tunnels
  for (let i = 0; i < 9; i++) { const a = R.next() * Math.PI * 2, r = 24 + R.next() * 12 - fallen * 5; p.blob(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.6 + R.next() * 1.4, 1.4 + R.next(), RESIN, { shade: 1.2, seed: 90 + i }); }
  // the hole
  const hole = Math.max(0, 21 - fallen * 23);
  if (hole > 1) {
    p.blob(cx, cy + 1, hole, hole * 0.94, mix(EARTH_LO, INK, 0.3), { lump: 0.1, seed: 11 });
    p.blob(cx + 1, cy + 2, hole * 0.82, hole * 0.78, hex('#0a0605'), { lump: 0.1, seed: 12 });
    // something moves down there
    const glow = phase === 'erupt' ? 0.5 + 0.5 * Math.sin(t * Math.PI) : 0.18;
    p.blob(cx + 1, cy + 3, hole * 0.45, hole * 0.4, mix(hex('#0a0605'), VIOLET, glow * 0.7), { seed: 13 });
    if (phase === 'erupt') for (let i = 0; i < 6; i++) { const a = i * 1.05 + t * 2, r = hole * (0.25 + 0.5 * t); p.blob(cx + Math.cos(a) * r, cy + 2 + Math.sin(a) * r, 2.2, 1.6, hex('#3a2416'), { seed: 30 + i, shade: 0.8 }); }
  }
  if (fallen > 0) {
    // the roof comes down: clods fill the mouth, dust rises and thins
    const C = rng(77);
    for (let i = 0; i < 34; i++) {
      const a = C.next() * Math.PI * 2, r = C.next() * 22 * Math.min(1, fallen * 1.4), s = 2.5 + C.next() * 4;
      p.blob(cx + Math.cos(a) * r, cy + Math.sin(a) * r, s, s * 0.8, mix(EARTH, C.chance(0.5) ? EARTH_HI : EARTH_LO, C.next() * 0.6), { lump: 0.25, seed: 200 + i, shade: 1, grain: 0.2 });
    }
    if (phase === 'fall') for (let i = 0; i < 14; i++) { const a = C.next() * Math.PI * 2, r = 12 + t * 30 * C.next(), s = (2 + C.next() * 5) * (1 - t * 0.5); p.blob(cx + Math.cos(a) * r, cy + Math.sin(a) * r, s, s, hex('#b8a888'), { seed: 300 + i, a: 0.75 * (1 - t), lump: 0.2 }); }
  }
  if (phase === 'erupt') { const C = rng(99); for (let i = 0; i < 18; i++) { const a = C.next() * Math.PI * 2, r = 20 + t * 18 + C.next() * 5; p.put(cx + Math.cos(a) * r, cy + Math.sin(a) * r, C.chance(0.5) ? EARTH_HI : EARTH_LO); } }
  p.outline(INK);
  return p.toCanvas(192);
}

// ------------------------------------------------------------------ egg cluster (128 px frame, drawn at 64)
const EGGS: [number, number, number][] = [[-9, -6, 0], [3, -9, 1], [12, -2, 2], [-13, 4, 3], [-2, 2, 4], [8, 8, 5], [-5, 12, 6]];
function eggs(phase: 'idle' | 'wobble' | 'burst' | 'shells', t: number): Canvas {
  const p = new Pix(64, 64), cx = 32, cy = 32, R = rng(17);
  // a bed of resin and slime
  p.blob(cx, cy + 1, 25, 23, hex('#5c4420'), { lump: 0.12, seed: 3, shade: 0.5, grain: 0.18 });
  for (let i = 0; i < 7; i++) { const a = R.next() * 6.3, r = 12 + R.next() * 10; p.blob(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2 + R.next() * 2, 1.5 + R.next(), mix(RESIN, hex('#5c4420'), 0.3), { shade: 1.1, seed: 40 + i }); }
  const broken = phase === 'shells' ? 1 : phase === 'burst' ? t : 0;
  if (broken > 0) {
    const C = rng(51);
    for (let i = 0; i < 9; i++) { const a = C.next() * 6.3, r = C.next() * (8 + broken * 14), s = 2 + C.next() * 3 * broken; p.blob(cx + Math.cos(a) * r, cy + Math.sin(a) * r, s, s * 0.8, mix(ICHOR, hex('#5a7a20'), C.next() * 0.6), { lump: 0.3, seed: 70 + i, a: phase === 'shells' ? 0.8 : 1 }); }
  }
  for (const [ex, ey, id] of EGGS) {
    const wob = phase === 'wobble' ? Math.sin(t * Math.PI * 2 + id * 1.7) * 1.2 : 0, swell = phase === 'wobble' ? 0.6 * Math.sin(t * Math.PI) : 0;
    const x = cx + ex + wob, y = cy + ey + (phase === 'wobble' ? Math.cos(t * Math.PI * 2 + id) * 0.8 : 0);
    if (broken >= 0.5 || (broken > 0 && id % 2 === 0)) {
      // split shell: two halves fallen apart, wet inside
      p.blob(x - 3, y, 3.6, 4.4, SHELL_LO, { seed: 100 + id, shade: 0.8 });
      p.blob(x + 3.5, y + 1, 3.4, 4.2, SHELL, { seed: 110 + id, shade: 0.8 });
      p.blob(x, y + 0.5, 2.2, 2.6, hex('#39401c'), { seed: 120 + id });
      continue;
    }
    p.blob(x, y, 6.2 + swell, 5 + swell, SHELL, { seed: 130 + id, shade: 0.9, hi: hex('#fffbe6'), lo: SHELL_LO });
    // what is curled up inside shows through
    p.blob(x + 0.8, y + 0.8, 2.6 + swell, 2.1 + swell, hex('#6a6a44'), { seed: 140 + id, a: 0.8 });
    p.put(x - 2.5, y - 2.5, hex('#fffbe6'));
    if (phase === 'wobble' && t > 0.35) { p.line(x - 3, y - 1, x - 0.5, y + 1, INK, 0.9); if (t > 0.65) p.line(x - 0.5, y + 1, x + 2, y - 2, INK, 0.9); }
  }
  p.outline(INK);
  return p.toCanvas(128);
}

// ------------------------------------------------------------------ resin seal across a door tunnel (192 px, drawn at 96)
function seal(open: boolean): Canvas {
  const p = new Pix(96, 96), R = rng(23);
  if (open) {
    // what is left when the brood boss dies: curled, blackened rims on either wall
    for (const side of [-1, 1]) for (let i = 0; i < 9; i++) p.blob(48 + (R.next() - 0.5) * 30, 48 + side * (30 + R.next() * 7), 5 + R.next() * 6, 3 + R.next() * 3, mix(hex('#6a4418'), INK, R.next() * 0.6), { lump: 0.3, seed: 20 + i + side * 50, shade: 0.9, grain: 0.2 });
    p.outline(INK);
    return p.toCanvas(192);
  }
  p.blob(48, 48, 22, 43, hex('#b87a22'), { lump: 0.05, seed: 2, shade: 0.7, hi: hex('#f4c860'), lo: hex('#6a4010'), grain: 0.1 });
  // comb cells pressed into it
  for (let j = -6; j <= 6; j++) for (let i = -2; i <= 2; i++) {
    const x = 48 + i * 9 + (j & 1 ? 4.5 : 0), y = 48 + j * 7.5;
    if (Math.abs(x - 48) > 17 || Math.abs(y - 48) > 40) continue;
    p.blob(x, y, 3.3, 3, hex('#e2a43a'), { seed: 400 + i * 20 + j, shade: 1.1, hi: hex('#ffe08a'), lo: hex('#8a5a18') });
    p.put(x - 1, y - 1, hex('#fff2c0'));
  }
  // dark veins: it is alive
  for (let k = 0; k < 5; k++) { let x = 38 + R.next() * 20, y = 8; while (y < 82) { const nx = x + (R.next() - 0.5) * 5, ny = y + 3 + R.next() * 4; p.line(x, y, nx, ny, hex('#5a2e0c'), 0.85); x = Math.max(31, Math.min(65, nx)); y = ny; } }
  p.outline(INK);
  return p.toCanvas(192);
}

// ------------------------------------------------------------------ the rift: a tear in the mud (256 x 256 frame, drawn at 128)
function rift(f: number): Canvas {
  const p = new Pix(128, 128), R = rng(61);
  // lips of heaved mud
  const spine: [number, number][] = []; let x = 18, y = 64;
  while (x < 110) { spine.push([x, y]); x += 5 + R.next() * 5; y += (R.next() - 0.5) * 14; y = Math.max(44, Math.min(84, y)); }
  spine.push([112, y]);
  const width = (i: number) => Math.sin((i / (spine.length - 1)) * Math.PI) * 13 + 2;
  for (let i = 0; i < spine.length; i++) for (const s of [-1, 1]) p.blob(spine[i][0] + (R.next() - 0.5) * 4, spine[i][1] + s * (width(i) + 5), 7 + R.next() * 4, 4.5 + R.next() * 3, mix(hex('#4a3e34'), hex('#241c16'), R.next() * 0.6), { lump: 0.25, seed: 10 + i * 2 + s, shade: 0.9, grain: 0.2 });
  // the tear itself: black, then violet, then white where it is thinnest
  for (let i = 0; i < spine.length - 1; i++) {
    const [x0, y0] = spine[i], [x1, y1] = spine[i + 1], n = 8;
    for (let k = 0; k <= n; k++) {
      const u = k / n, cx = x0 + (x1 - x0) * u, cy = y0 + (y1 - y0) * u, w = width(i + u), flick = 0.85 + 0.15 * Math.sin(f * 2.1 + i * 1.3 + k);
      p.blob(cx, cy, 3.4, w, hex('#07040c'), { seed: 3 });
      p.blob(cx, cy, 3, w * 0.62 * flick, hex('#5a2ea8'), { seed: 4 });
      p.blob(cx, cy, 2.6, w * 0.34 * flick, VIOLET, { seed: 5 });
      p.blob(cx, cy, 2.2, w * 0.13 * flick, hex('#f6ecff'), { seed: 6 });
    }
  }
  p.outline(INK);
  return p.toCanvas(256);
}

// ------------------------------------------------------------------ honey pool (160 px, drawn at 80) and a resin lump (48 px, drawn at 24)
function honey(): Canvas {
  const p = new Pix(80, 80), R = rng(9);
  p.blob(40, 40, 33, 31, mix(HONEY, hex('#7a4a08'), 0.35), { lump: 0.14, seed: 4 });
  p.blob(39, 39, 29, 27, HONEY, { lump: 0.14, seed: 4, shade: 0.5, hi: hex('#ffd870'), lo: hex('#b06a10') });
  for (let i = 0; i < 9; i++) { const a = R.next() * 6.3, r = R.next() * 20; p.blob(40 + Math.cos(a) * r, 40 + Math.sin(a) * r, 1.5 + R.next() * 3, 1 + R.next() * 1.6, hex('#fff0b0'), { seed: 30 + i, a: 0.85 }); }
  for (let i = 0; i < 6; i++) { const a = R.next() * 6.3, r = 28 + R.next() * 4; p.blob(40 + Math.cos(a) * r, 40 + Math.sin(a) * r, 2 + R.next() * 1.5, 2 + R.next() * 1.5, HONEY, { seed: 50 + i, shade: 1 }); }
  p.outline(hex('#5a3404'));
  return p.toCanvas(160);
}
/** Near-white, so the renderer can tint it to each cell's glow colour. */
function lump(v: number): Canvas {
  const p = new Pix(24, 24), R = rng(70 + v);
  p.blob(12, 12, 6.5 + v * 0.8, 6, hex('#c8c8c8'), { lump: 0.2, seed: 5 + v, shade: 1, hi: hex('#ffffff'), lo: hex('#6a6a6a') });
  for (let i = 0; i < 3; i++) p.blob(12 + (R.next() - 0.5) * 10, 12 + (R.next() - 0.5) * 9, 2.4, 2, hex('#e8e8e8'), { seed: 20 + i, shade: 1.1 });
  p.outline(hex('#202020'));
  return p.toCanvas(48);
}

export interface PropAnim { key: string; frames: { name: string; canvas: Canvas }[]; frameRate: number; repeat: number }
/** Burrow and egg clusters follow the enemy naming (`hive_<id>_0_<action>_<n>`), so the zombie renderer draws them. */
export function hiveProps(): { anims: PropAnim[]; sprites: { name: string; canvas: Canvas }[] } {
  const seq = (key: string, n: number, rate: number, repeat: number, draw: (i: number) => Canvas): PropAnim =>
    ({ key, frameRate: rate, repeat, frames: Array.from({ length: n }, (_, i) => ({ name: `${key}_${i}`, canvas: draw(i) })) });
  const anims: PropAnim[] = [
    seq('hive_burrow_0_walk', 1, 1, -1, () => burrow('idle', 0)),
    seq('hive_burrow_0_special', 4, 8, 0, i => burrow('erupt', (i + 0.5) / 4)),
    seq('hive_burrow_0_death', 6, 10, 0, i => burrow('fall', (i + 1) / 6)),
    seq('hive_burrow_0_corpse', 1, 1, 0, () => burrow('rubble', 1)),
    seq('hive_egg_0_walk', 1, 1, -1, () => eggs('idle', 0)),
    seq('hive_egg_0_special', 4, 8, 0, i => eggs('wobble', (i + 1) / 4)),
    seq('hive_egg_0_death', 4, 10, 0, i => eggs('burst', (i + 1) / 4)),
    seq('hive_egg_0_corpse', 1, 1, 0, () => eggs('shells', 1)),
    seq('hive_rift', 4, 6, -1, i => rift(i * 1.6)),
  ];
  const sprites = [
    { name: 'hive_seal_0', canvas: seal(false) }, { name: 'hive_seal_1', canvas: seal(true) },
    { name: 'hive_honey_0', canvas: honey() },
    ...[0, 1, 2].map(v => ({ name: `hive_lump_${v}`, canvas: lump(v) })),
  ];
  return { anims, sprites };
}
