// art/lib/figure.ts — shading primitives for procedural top-down figures (CHARACTERS agent).
// Everything is drawn at ART_SCALE. Key light from the top-left (sprite space), baked drop shadow down-right.
import { Path2D } from '@napi-rs/canvas';
import { canvas, makeNoise, rng, shade, type Canvas, type Ctx } from './core';

export const TAU = Math.PI * 2;
const ll = Math.hypot(-0.6, -0.8);
export const LIGHT = { x: -0.6 / ll, y: -0.8 / ll };

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeIn = (t: number) => clamp(t, 0, 1) ** 2;
export const easeOut = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 2;

export interface Xf { x: number; y: number; rot: number; sx: number; sy: number }

// ---------- unit paths ----------
export function ellipseUnit() { const p = new Path2D(); p.arc(0, 0, 1, 0, TAU); return p; }
/** Superellipse in unit space (n=2 ellipse, larger n = boxier). `front` squashes the +x half. */
export function superUnit(n = 2.6, front = 1, back = 1, wobble?: (a: number) => number) {
  const p = new Path2D();
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * TAU, c = Math.cos(a), s = Math.sin(a);
    let x = Math.sign(c) * Math.abs(c) ** (2 / n), y = Math.sign(s) * Math.abs(s) ** (2 / n);
    x *= x > 0 ? front : back;
    const w = wobble ? 1 + wobble(a) : 1;
    if (i === 0) p.moveTo(x * w, y * w); else p.lineTo(x * w, y * w);
  }
  p.closePath();
  return p;
}
export function capsulePath(ax: number, ay: number, ra: number, bx: number, by: number, rb: number) {
  const p = new Path2D();
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  if (d <= Math.abs(ra - rb) + 0.01) {
    if (ra >= rb) p.arc(ax, ay, ra, 0, TAU); else p.arc(bx, by, rb, 0, TAU);
    return p;
  }
  const th = Math.atan2(dy, dx), al = Math.acos(clamp((ra - rb) / d, -1, 1));
  p.arc(ax, ay, ra, th + al, th + TAU - al);
  p.arc(bx, by, rb, th - al, th + al);
  p.closePath();
  return p;
}

// ---------- textures (black/white alpha grain drawn inside clipped parts) ----------
export type TexKind = 'cloth' | 'denim' | 'skin' | 'leather' | 'knit' | 'hair' | 'metal';
const texCache = new Map<string, Canvas>();
export function tex(kind: TexKind, seed = 1): Canvas {
  const key = kind + seed;
  const hit = texCache.get(key); if (hit) return hit;
  const S = 192, { c, g } = canvas(S, S), id = g.createImageData(S, S), d = id.data;
  const N = makeNoise(seed * 7919 + kind.length, 64), R = rng(seed * 31 + 5);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0; // -1..1 signed brightness
    const lo = N.fbm(x / 14, y / 14, 3) - 0.5, grain = R.next() - 0.5;
    switch (kind) {
      case 'cloth': v = lo * 0.9 + grain * 0.7 + (((x + y) % 3 === 0) ? 0.12 : 0); break;
      case 'denim': v = lo * 0.7 + grain * 0.6 + (((x + y * 2) % 4 < 2) ? 0.22 : -0.1); break;
      case 'skin': v = (N.fbm(x / 9, y / 9, 4) - 0.5) * 1.5 + grain * 0.25; break;
      case 'leather': v = (N.fbm(x / 4, y / 4, 3) - 0.5) * 1.2 + grain * 0.2; break;
      case 'knit': v = (Math.sin(x * 1.6) * 0.5 + (y % 4 < 2 ? 0.2 : -0.2)) * 0.8 + grain * 0.4; break;
      case 'hair': v = (N.value(x / 7, y / 1.3) - 0.5) * 1.6 + (N.value(x / 2.5, y / 0.8) - 0.5) * 0.6 + grain * 0.25; break;
      case 'metal': v = lo * 0.5 + grain * 0.3 + Math.sin(x * 0.15) * 0.1; break;
    }
    const i = (y * S + x) * 4, w = v > 0 ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = w; d[i + 3] = clamp(Math.abs(v) * 255, 0, 255);
  }
  g.putImageData(id, 0, 0);
  texCache.set(key, c);
  return c;
}

export interface ShadeOpts {
  hi?: number;          // highlight strength
  lo?: number;          // rim darkening
  edge?: string | null; // inner edge stroke color
  edgeW?: number;
  tex?: Canvas | null;
  texA?: number;
  deco?: (g: Ctx, sx: number, sy: number) => void; // drawn in the part's local px frame (clipped)
  glow?: boolean;       // no dark rim (emissive)
}

/** Fill a unit-space path placed by xf with soft volumetric (dome) shading, texture and decoration. */
export function shadedShape(g: Ctx, xf: Xf, unit: Path2D, color: string, o: ShadeOpts = {}) {
  const { x, y, rot, sx, sy } = xf;
  g.save();
  g.translate(x, y); g.rotate(rot); g.scale(sx, sy);
  const c = Math.cos(rot), s = Math.sin(rot);
  let lx = (LIGHT.x * c + LIGHT.y * s) * sy, ly = (-LIGHT.x * s + LIGHT.y * c) * sx;
  const l = Math.hypot(lx, ly) || 1; lx /= l; ly /= l;
  const gr = g.createRadialGradient(lx * 0.45, ly * 0.45, 0.02, lx * 0.18, ly * 0.18, 1.22);
  const hi = o.hi ?? 0.22, lo = o.lo ?? 0.5;
  gr.addColorStop(0, shade(color, hi));
  gr.addColorStop(0.42, color);
  gr.addColorStop(0.8, shade(color, -lo * 0.55));
  gr.addColorStop(1, shade(color, o.glow ? 0 : -lo));
  g.fillStyle = gr; g.fill(unit);
  g.clip(unit);
  g.scale(1 / sx, 1 / sy);
  if (o.tex) { g.globalAlpha = o.texA ?? 0.18; g.drawImage(o.tex, -o.tex.width / 2, -o.tex.height / 2); g.globalAlpha = 1; }
  if (o.deco) o.deco(g, sx, sy);
  g.restore();
  if (o.edge) {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(sx, sy);
    g.lineWidth = (o.edgeW ?? 1.2) * 2 / (sx + sy); g.strokeStyle = o.edge; g.stroke(unit);
    g.restore();
  }
}
export function shadedEllipse(g: Ctx, x: number, y: number, rx: number, ry: number, rot: number, color: string, o: ShadeOpts = {}) {
  shadedShape(g, { x, y, rot, sx: rx, sy: ry }, ellipseUnit(), color, o);
}

/** Tapered limb A→B with cylindrical shading across its width. deco runs in a frame where +x runs A→B. */
export function limb(g: Ctx, ax: number, ay: number, ra: number, bx: number, by: number, rb: number, color: string, o: ShadeOpts = {}) {
  const p = capsulePath(ax, ay, ra, bx, by, rb);
  const th = Math.atan2(by - ay, bx - ax);
  let nx = -Math.sin(th), ny = Math.cos(th);
  if (nx * LIGHT.x + ny * LIGHT.y < 0) { nx = -nx; ny = -ny; }
  const r = Math.max(ra, rb) * 1.05, mx = (ax + bx) / 2, my = (ay + by) / 2;
  const gr = g.createLinearGradient(mx + nx * r, my + ny * r, mx - nx * r, my - ny * r);
  const hi = o.hi ?? 0.2, lo = o.lo ?? 0.5;
  gr.addColorStop(0, shade(color, -lo * 0.3));
  gr.addColorStop(0.18, shade(color, hi));
  gr.addColorStop(0.45, color);
  gr.addColorStop(0.85, shade(color, -lo * 0.6));
  gr.addColorStop(1, shade(color, -lo));
  g.fillStyle = gr; g.fill(p);
  if (o.tex || o.deco) {
    g.save(); g.clip(p); g.translate(ax, ay); g.rotate(th);
    if (o.tex) { g.globalAlpha = o.texA ?? 0.18; g.drawImage(o.tex, -40, -o.tex.height / 2); g.globalAlpha = 1; }
    if (o.deco) o.deco(g, Math.hypot(bx - ax, by - ay), r);
    g.restore();
  }
  if (o.edge) { g.lineWidth = o.edgeW ?? 1.1; g.strokeStyle = o.edge; g.stroke(p); }
  return p;
}

// ---------- 2-bone IK ----------
export function ik2(sx: number, sy: number, tx: number, ty: number, l1: number, l2: number, bend: number) {
  let d = Math.hypot(tx - sx, ty - sy);
  const a = Math.atan2(ty - sy, tx - sx);
  d = clamp(d, Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.01);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ea = a + bend * A;
  return { ex: sx + Math.cos(ea) * l1, ey: sy + Math.sin(ea) * l1, hx: sx + Math.cos(a) * d, hy: sy + Math.sin(a) * d };
}

// ---------- blood / grime helpers (call inside a clip) ----------
export function splat(g: Ctx, R: ReturnType<typeof rng>, x: number, y: number, r: number, color = '#5a0f0f', a = 0.8) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, shade(color, -0.15, a)); gr.addColorStop(0.6, shade(color, 0, a * 0.8)); gr.addColorStop(1, shade(color, 0, 0));
  g.fillStyle = gr;
  g.beginPath();
  for (let i = 0; i <= 14; i++) {
    const ang = (i / 14) * TAU, rr = r * (0.7 + R.next() * 0.45);
    if (i === 0) g.moveTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); else g.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
  }
  g.fill();
  for (let i = 0; i < 3; i++) { // satellite droplets
    const ang = R.next() * TAU, dd = r * (1 + R.next() * 0.6), rr = r * 0.12 * (0.5 + R.next());
    g.fillStyle = shade(color, -0.1, a * 0.85); g.beginPath(); g.arc(x + Math.cos(ang) * dd, y + Math.sin(ang) * dd, rr, 0, TAU); g.fill();
  }
}
/** jagged tear: hole in cloth showing `under` color. */
export function tear(g: Ctx, R: ReturnType<typeof rng>, x: number, y: number, w: number, h: number, rot: number, under: string) {
  g.save(); g.translate(x, y); g.rotate(rot);
  const p = new Path2D();
  const n = 9;
  for (let i = 0; i <= n * 2; i++) {
    const t = i / (n * 2), ang = t * TAU, j = i % 2 ? 0.55 + R.next() * 0.25 : 1;
    const px = Math.cos(ang) * w * j, py = Math.sin(ang) * h * j;
    if (i === 0) p.moveTo(px, py); else p.lineTo(px, py);
  }
  p.closePath();
  g.fillStyle = under; g.fill(p);
  g.lineWidth = 1.2; g.strokeStyle = 'rgba(20,16,12,0.55)'; g.stroke(p);
  g.restore();
}

// ---------- finishing: soft outline + baked drop shadow ----------
export interface FinishOpts { outline?: string; ow?: number; shadow?: number; sdx?: number; sdy?: number; blur?: number; under?: (g: Ctx) => void }
export function finish(layer: Canvas, o: FinishOpts = {}): Canvas {
  const w = layer.width, h = layer.height;
  const sil = (color: string) => {
    const s = canvas(w, h); s.g.drawImage(layer, 0, 0);
    s.g.globalCompositeOperation = 'source-in'; s.g.fillStyle = color; s.g.fillRect(0, 0, w, h);
    return s.c;
  };
  const { c, g } = canvas(w, h);
  if (o.under) o.under(g);
  const sh = o.shadow ?? 0.35;
  if (sh > 0) {
    g.save(); g.filter = `blur(${o.blur ?? 3}px)`; g.globalAlpha = sh;
    g.drawImage(sil('#0b0d0c'), o.sdx ?? 4, o.sdy ?? 5); g.restore();
  }
  const ow = o.ow ?? 2.2;
  if (ow > 0) {
    const ol = canvas(w, h), s = sil(o.outline ?? '#16130f');
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ol.g.drawImage(s, Math.cos(a) * ow, Math.sin(a) * ow); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; ol.g.drawImage(s, Math.cos(a) * ow * 0.5, Math.sin(a) * ow * 0.5); }
    g.save(); g.filter = 'blur(0.6px)'; g.globalAlpha = 0.9; g.drawImage(ol.c, 0, 0); g.restore();
  }
  g.drawImage(layer, 0, 0);
  return c;
}

/** Scale a canvas (for previews / 50% readability checks). */
export function scaled(src: Canvas, k: number) {
  const { c, g } = canvas(Math.max(1, Math.round(src.width * k)), Math.max(1, Math.round(src.height * k)));
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Irregular glossy blood pool decal centered at (x,y). */
export function bloodPool(g: Ctx, x: number, y: number, r: number, seed: number, color = '#5a0f0f', alpha = 0.92, sx = 1) {
  const R = rng(seed);
  const p = new Path2D();
  const n = 40, ph = R.range(0, TAU), lobes = R.int(3, 6);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (0.78 + 0.18 * Math.sin(a * lobes + ph) + 0.08 * Math.sin(a * 11 + ph * 2) + R.range(-0.03, 0.03));
    const px = x + Math.cos(a) * rr * sx, py = y + Math.sin(a) * rr;
    if (i === 0) p.moveTo(px, py); else p.lineTo(px, py);
  }
  p.closePath();
  g.save();
  g.globalAlpha = alpha;
  const gr = g.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.05, x, y, r * 1.05);
  gr.addColorStop(0, shade(color, 0.1)); gr.addColorStop(0.55, shade(color, -0.15)); gr.addColorStop(0.9, shade(color, -0.4)); gr.addColorStop(1, shade(color, -0.55));
  g.fillStyle = gr; g.fill(p);
  g.clip(p);
  // glossy highlight crescent (light from top-left)
  g.globalAlpha = alpha * 0.35;
  const hl = g.createRadialGradient(x - r * 0.35 * sx, y - r * 0.4, 0, x - r * 0.35 * sx, y - r * 0.4, r * 0.5);
  hl.addColorStop(0, 'rgba(255,220,210,0.7)'); hl.addColorStop(1, 'rgba(255,220,210,0)');
  g.fillStyle = hl; g.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
  g.restore();
  g.save(); g.globalAlpha = alpha * 0.6; g.lineWidth = 1.2; g.strokeStyle = shade(color, -0.6); g.stroke(p); g.restore();
  // satellite drops
  g.save(); g.globalAlpha = alpha;
  for (let i = 0; i < 6; i++) {
    const a = R.range(0, TAU), d = r * R.range(1.0, 1.35), rr = r * R.range(0.04, 0.1);
    g.fillStyle = shade(color, -0.25); g.beginPath(); g.arc(x + Math.cos(a) * d * sx, y + Math.sin(a) * d, rr, 0, TAU); g.fill();
  }
  g.restore();
}
