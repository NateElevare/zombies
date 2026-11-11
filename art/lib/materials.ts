// art/lib/materials.ts — ENVIRONMENT agent helpers: tileable noise in pixel space, per-pixel shaders,
// wrap-around drawing for seamless tiles, top-left-lit shape shading, grain and baked drop shadows.
import { canvas, makeNoise, hexToRgb, rng, type Canvas, type Ctx, type Rng } from './core';

export const TAU = Math.PI * 2;
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Tileable fbm over a `size`-px square: `cells` lattice cells across the tile. Returns 0..1. */
export function tnoise(seed: number, cells: number, size = 128) {
  const n = makeNoise(seed, cells);
  const k = cells / size;
  return (x: number, y: number, oct = 4) => n.fbm(x * k, y * k, oct);
}
/** Anisotropic tileable fbm: cx cells across x, cy cells across y (both wrap at `size`). */
export function tnoise2(seed: number, cx: number, cy: number, size = 128) {
  const R = rng(seed), P = new Float32Array(1024 * 64);
  for (let i = 0; i < P.length; i++) P[i] = R.next();
  const sm = (t: number) => t * t * (3 - 2 * t);
  const val = (x: number, y: number, px: number, py: number, o: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const at = (i: number, j: number) => {
      let h = Math.imul(((i % px) + px) % px, 374761393) ^ Math.imul(((j % py) + py) % py, 668265263) ^ Math.imul(o + 1, 2246822519) ^ seed;
      h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
      return P[(h >>> 0) % P.length];
    };
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x: number, y: number, oct = 4) => {
    let s = 0, amp = 0.5, f = 1, n = 0;
    for (let o = 0; o < oct; o++) {
      s += val((x / size) * cx * f, (y / size) * cy * f, cx * f, cy * f, o) * amp;
      n += amp; amp *= 0.5; f *= 2;
    }
    return s / n;
  };
}
/** Non-tiling fbm in pixel space with feature `scale` px. */
export function pnoise(seed: number, scale: number) {
  const n = makeNoise(seed, 256);
  return (x: number, y: number, oct = 4) => n.fbm(x / scale, y / scale, oct);
}

/** Window that is 0 at the tile borders and 1 inside a margin m: used to blend per-variant detail so that
 *  all variants of a material share identical edges (variants tile seamlessly with each other). */
export function edgeWindow(x: number, y: number, size: number, m: number) {
  return smooth(0, m, x) * smooth(0, m, size - x) * smooth(0, m, y) * smooth(0, m, size - y);
}

export type RGB = [number, number, number];
export const C = (hex: string): RGB => hexToRgb(hex);
export function mixRGB(a: RGB, b: RGB, t: number): RGB { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
export function css(c: RGB, a = 1) { return a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
export function scaleRGB(c: RGB, k: number): RGB { return [c[0] * k, c[1] * k, c[2] * k]; }

/** Per-pixel shader fill of a whole canvas: fn returns [r,g,b] or [r,g,b,a]. */
export function shadePixels(c: Canvas, fn: (x: number, y: number) => number[]) {
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  const img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = fn(x, y), i = (y * W + x) * 4;
    d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = v.length > 3 ? v[3] : 255;
  }
  g.putImageData(img, 0, 0);
}
/** Modify existing pixels in place (only where alpha > 0). */
export function modPixels(c: Canvas, fn: (x: number, y: number, p: Uint8ClampedArray, i: number) => void) {
  const g = c.getContext('2d');
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data, W = c.width;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] === 0) continue; const p = i >> 2; fn(p % W, (p / W) | 0, d, i); }
  g.putImageData(img, 0, 0);
}

/** Material grain: multiplies luminance by mid-frequency mottling + per-pixel speckle. */
export function grain(c: Canvas, seed: number, amt = 0.08, scale = 6, speck = 0.05) {
  const n = pnoise(seed, scale), R = rng(seed ^ 0x9e37);
  modPixels(c, (x, y, d, i) => {
    const k = 1 + (n(x, y, 3) - 0.5) * 2 * amt + (R.next() - 0.5) * speck;
    d[i] = d[i] * k; d[i + 1] = d[i + 1] * k; d[i + 2] = d[i + 2] * k;
  });
}

/** Draw fn at (x,y) plus wrapped copies when it crosses the tile border (r = element radius). */
export function wrapDraw(size: number, x: number, y: number, r: number, fn: (x: number, y: number) => void) {
  const xs = [0], ys = [0];
  if (x - r < 0) xs.push(size); if (x + r > size) xs.push(-size);
  if (y - r < 0) ys.push(size); if (y + r > size) ys.push(-size);
  for (const ox of xs) for (const oy of ys) fn(x + ox, y + oy);
}
export const crosses = (size: number, x: number, y: number, r: number) => x - r < 0 || y - r < 0 || x + r > size || y + r > size;

/** Scatter elements so variants tile with one another: border-crossing elements come from the SHARED rng
 *  (identical in all variants, drawn wrapped); interior elements come from the per-variant rng. */
export function scatter(size: number, shared: Rng, vary: Rng, count: number, radius: (R: Rng) => number,
  draw: (x: number, y: number, r: number, R: Rng) => void) {
  for (let i = 0; i < count; i++) {
    const x = shared.next() * size, y = shared.next() * size, r = radius(shared);
    const es = (shared.next() * 4294967296) >>> 0;
    if (crosses(size, x, y, r)) wrapDraw(size, x, y, r, (ax, ay) => draw(ax, ay, r, rng(es)));
  }
  for (let i = 0; i < count; i++) {
    const x = vary.next() * size, y = vary.next() * size, r = radius(vary);
    if (crosses(size, x, y, r)) continue;
    draw(x, y, r, vary);
  }
}

// ---------------------------------------------------------------- shapes
export function rrPath(g: Ctx, x: number, y: number, w: number, h: number, r: number | number[]) {
  const rs = Array.isArray(r) ? r : [r, r, r, r];
  const m = Math.min(w, h) / 2;
  const [a, b, c2, d] = rs.map((v) => Math.max(0, Math.min(v, m)));
  g.beginPath();
  g.moveTo(x + a, y); g.lineTo(x + w - b, y); g.quadraticCurveTo(x + w, y, x + w, y + b);
  g.lineTo(x + w, y + h - c2); g.quadraticCurveTo(x + w, y + h, x + w - c2, y + h);
  g.lineTo(x + d, y + h); g.quadraticCurveTo(x, y + h, x, y + h - d);
  g.lineTo(x, y + a); g.quadraticCurveTo(x, y, x + a, y); g.closePath();
}
/** irregular blob path around (cx,cy) */
export function blobPath(g: Ctx, cx: number, cy: number, rx: number, ry: number, R: Rng, jag = 0.25, n = 14, rot = 0) {
  g.beginPath();
  const pts: [number, number][] = [];
  const ph = R.range(0, TAU), ph2 = R.range(0, TAU), f1 = R.int(2, 4), f2 = R.int(4, 7);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + jag * (0.6 * Math.sin(a * f1 + ph) + 0.4 * Math.sin(a * f2 + ph2)) + jag * 0.5 * (R.next() - 0.5);
    const px = Math.cos(a) * rx * k, py = Math.sin(a) * ry * k;
    pts.push([cx + px * Math.cos(rot) - py * Math.sin(rot), cy + px * Math.sin(rot) + py * Math.cos(rot)]);
  }
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(p[0], p[1], mx, my);
  }
  const p0 = pts[0], q0 = pts[1 % n];
  g.quadraticCurveTo(p0[0], p0[1], (p0[0] + q0[0]) / 2, (p0[1] + q0[1]) / 2);
  g.closePath();
}

/** Fill the current path with top-left-lit shading: base color + diagonal light gradient + rim bevel + outline. */
export function litFill(g: Ctx, x: number, y: number, w: number, h: number, base: string, o: {
  light?: number; dark?: number; bevel?: number; outline?: string | null; lw?: number; radial?: boolean; paint?: (g: Ctx) => void;
} = {}) {
  const light = o.light ?? 0.16, dark = o.dark ?? 0.22;
  g.save();
  g.fillStyle = base; g.fill();
  g.clip();
  if (o.paint) o.paint(g);
  let gr;
  if (o.radial) {
    gr = g.createRadialGradient(x + w * 0.35, y + h * 0.32, 0, x + w * 0.5, y + h * 0.5, Math.max(w, h) * 0.7);
  } else gr = g.createLinearGradient(x, y, x + w * 0.6, y + h * 1.0);
  gr.addColorStop(0, `rgba(255,248,235,${light})`);
  gr.addColorStop(0.5, 'rgba(255,255,255,0)');
  gr.addColorStop(1, `rgba(0,0,0,${dark})`);
  g.fillStyle = gr; g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.restore();
  const bev = o.bevel ?? 2;
  if (bev > 0) {
    // inner rim: light on top/left, dark on bottom/right
    g.save(); g.clip();
    g.lineWidth = bev * 2;
    const rim = g.createLinearGradient(x, y, x + w, y + h);
    rim.addColorStop(0, 'rgba(255,250,240,0.22)'); rim.addColorStop(0.45, 'rgba(255,255,255,0.03)');
    rim.addColorStop(0.55, 'rgba(0,0,0,0.05)'); rim.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.strokeStyle = rim; g.stroke();
    g.restore();
  }
  if (o.outline !== null) {
    g.lineWidth = o.lw ?? 2; g.strokeStyle = o.outline ?? 'rgba(18,16,14,0.75)'; g.stroke();
  }
}
/** Convenience: rounded box lit from the top-left */
export function box(g: Ctx, x: number, y: number, w: number, h: number, r: number, base: string, o: Parameters<typeof litFill>[6] = {}) {
  rrPath(g, x, y, w, h, r); litFill(g, x, y, w, h, base, o);
}
export function ellipse(g: Ctx, cx: number, cy: number, rx: number, ry: number, base: string, o: Parameters<typeof litFill>[6] = {}) {
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); litFill(g, cx - rx, cy - ry, rx * 2, ry * 2, base, { radial: true, ...o });
}

/** Soft contact/AO shadow rim inside a rect (for recesses: tub basins, sinks, crate interiors) */
export function innerShadow(g: Ctx, pathFn: () => void, blur = 8, alpha = 0.5, dx = 3, dy = 3) {
  g.save(); pathFn(); g.clip();
  g.shadowColor = `rgba(0,0,0,${alpha})`; g.shadowBlur = blur; g.shadowOffsetX = dx; g.shadowOffsetY = dy;
  g.lineWidth = blur * 2; g.strokeStyle = 'rgba(0,0,0,1)';
  pathFn(); g.stroke();
  g.restore();
}

/** Copy a canvas adding a baked soft drop shadow (down-right, ~35%) behind it. */
export function withShadow(src: Canvas, dx: number, dy: number, blur: number, alpha = 0.35) {
  const { c, g } = canvas(src.width, src.height);
  // shadow silhouette
  const s = canvas(src.width, src.height);
  s.g.drawImage(src, 0, 0);
  s.g.globalCompositeOperation = 'source-in';
  s.g.fillStyle = `rgba(8,8,10,${alpha})`; s.g.fillRect(0, 0, src.width, src.height);
  (g as any).filter = `blur(${blur}px)`;
  g.drawImage(s.c, dx, dy);
  (g as any).filter = 'none';
  g.drawImage(src, 0, 0);
  return c;
}

/** Stroke a slightly wobbly line (cracks, seams, grain). */
export function wobbleLine(g: Ctx, x0: number, y0: number, x1: number, y1: number, R: Rng, amp = 1.5, seg = 6) {
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(L / seg));
  const nx = -(y1 - y0) / (L || 1), ny = (x1 - x0) / (L || 1);
  g.beginPath(); g.moveTo(x0, y0);
  for (let i = 1; i <= n; i++) {
    const t = i / n, o = i === n ? 0 : (R.next() - 0.5) * 2 * amp;
    g.lineTo(x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o);
  }
}
/** Branching crack polyline from (x,y) heading `a` */
export function crack(g: Ctx, x: number, y: number, a: number, len: number, R: Rng, width = 1.4, depth = 0) {
  let px = x, py = y;
  const pts: [number, number][] = [[px, py]];
  const steps = Math.max(3, Math.round(len / 5));
  for (let i = 0; i < steps; i++) {
    a += R.range(-0.55, 0.55);
    px += Math.cos(a) * (len / steps); py += Math.sin(a) * (len / steps);
    pts.push([px, py]);
    if (depth < 2 && R.chance(0.12)) crack(g, px, py, a + R.pick([-1, 1]) * R.range(0.6, 1.2), len * R.range(0.25, 0.5), R, width * 0.6, depth + 1);
  }
  // dark core + light lip (lit from top-left)
  const path = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]); };
  g.lineCap = 'round'; g.lineJoin = 'round';
  path(); g.save(); g.translate(0.8, 0.8); g.strokeStyle = 'rgba(210,205,190,0.10)'; g.lineWidth = width + 0.8; g.stroke(); g.restore();
  path(); g.strokeStyle = 'rgba(8,8,8,0.55)'; g.lineWidth = width; g.stroke();
}

/** Paint a per-pixel texture into the rect (clipped by whatever clip is active). */
export function texRect(g: Ctx, x: number, y: number, w: number, h: number, fn: (x: number, y: number) => number[]) {
  const W = Math.max(1, Math.ceil(w)), H = Math.max(1, Math.ceil(h));
  const t = canvas(W, H);
  shadePixels(t.c, fn);
  g.drawImage(t.c, x, y);
}
/** Wood: grain lines along x (or y when vertical), returns a shader in local rect coords. */
export function woodShader(base: string, seed: number, vertical = false, ring = 0.45, contrast = 0.22) {
  const b = C(base), n = pnoise(seed, 18), m = pnoise(seed + 7, 4), R = rng(seed);
  const freq = R.range(0.35, 0.6), knotX = R.range(0, 300), knotY = R.range(0, 60);
  return (x: number, y: number) => {
    const u = vertical ? y : x, v = vertical ? x : y;
    const warp = n(u * 0.25, v, 3) * 14 + Math.exp(-((u - knotX) ** 2 + (v - knotY) ** 2) / 200) * 6;
    const lines = Math.sin((v + warp) * freq * 2) * 0.5 + 0.5;
    const fine = m(u * 0.15, v * 2.5, 2);
    const k = 1 - contrast * 0.5 + contrast * (lines * ring + fine * (1 - ring));
    return [b[0] * k, b[1] * k, b[2] * k];
  };
}
/** Woven fabric: tight weave + soft mottling. */
export function fabricShader(base: string, seed: number, weave = 0.06, mottle = 0.12) {
  const b = C(base), n = pnoise(seed, 10), R = rng(seed ^ 77);
  return (x: number, y: number) => {
    const w = ((x + y) & 1 ? 1 : -1) * weave * 0.5 + (((x >> 1) + (y >> 1)) & 1 ? 0.5 : -0.5) * weave;
    const k = 1 + w + (n(x, y, 3) - 0.5) * 2 * mottle + (R.next() - 0.5) * 0.06;
    return [b[0] * k, b[1] * k, b[2] * k];
  };
}
/** Brushed / painted metal: fine streaks along one axis + faint mottling. */
export function metalShader(base: string, seed: number, vertical = false, streak = 0.07, mottle = 0.08) {
  const b = C(base), n = pnoise(seed, 14), R = rng(seed ^ 99);
  const rows: number[] = []; for (let i = 0; i < 1024; i++) rows.push(R.next() - 0.5);
  return (x: number, y: number) => {
    const s = rows[(vertical ? x : y) & 1023] * streak;
    const k = 1 + s + (n(x, y, 3) - 0.5) * 2 * mottle + (R.next() - 0.5) * 0.03;
    return [b[0] * k, b[1] * k, b[2] * k];
  };
}
/** Plain noisy surface (plastic, painted wood, concrete) */
export function noiseShader(base: string, seed: number, scale = 8, amt = 0.1, speck = 0.05) {
  const b = C(base), n = pnoise(seed, scale), R = rng(seed ^ 5);
  return (x: number, y: number) => {
    const k = 1 + (n(x, y, 4) - 0.5) * 2 * amt + (R.next() - 0.5) * speck;
    return [b[0] * k, b[1] * k, b[2] * k];
  };
}

export function jitterHex(hex: string, R: Rng, k = 0.06) {
  const [r, gg, b] = hexToRgb(hex), j = 1 + (R.next() - 0.5) * 2 * k;
  return `rgb(${Math.min(255, r * j) | 0},${Math.min(255, gg * j) | 0},${Math.min(255, b * j) | 0})`;
}
