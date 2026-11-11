// art/env/furniture.ts — every legacy furniture / container `sub`, drawn top-down with top-left light.
// Convention: back edge (against the wall) = TOP of the sprite; the open/front side faces down (+y).
import { rng, type Ctx, type Rng } from '../lib/core';
import {
  TAU, rrPath, litFill, texRect, woodShader, fabricShader, metalShader, noiseShader, innerShadow, blobPath, ellipse, box,
} from '../lib/materials';
import { sprite, type Registry, type Draw } from './prop';

const A = 'env_props';
type Opt = Parameters<typeof litFill>[6];

// ---------------------------------------------------------------- material boxes
export function woodBox(g: Ctx, x: number, y: number, w: number, h: number, r: number, col: string, seed: number, o: Opt & { vertical?: boolean } = {}) {
  rrPath(g, x, y, w, h, r);
  litFill(g, x, y, w, h, col, { ...o, paint: (q) => texRect(q, x, y, w, h, woodShader(col, seed, o.vertical ?? h > w)) });
}
export function fabricBox(g: Ctx, x: number, y: number, w: number, h: number, r: number, col: string, seed: number, o: Opt = {}) {
  rrPath(g, x, y, w, h, r);
  litFill(g, x, y, w, h, col, { radial: true, light: 0.14, dark: 0.3, ...o, paint: (q) => texRect(q, x, y, w, h, fabricShader(col, seed)) });
}
export function metalBox(g: Ctx, x: number, y: number, w: number, h: number, r: number, col: string, seed: number, o: Opt & { vertical?: boolean } = {}) {
  rrPath(g, x, y, w, h, r);
  litFill(g, x, y, w, h, col, { light: 0.22, ...o, paint: (q) => texRect(q, x, y, w, h, metalShader(col, seed, o.vertical ?? false)) });
}
export function plainBox(g: Ctx, x: number, y: number, w: number, h: number, r: number, col: string, seed: number, o: Opt & { scale?: number; amt?: number } = {}) {
  rrPath(g, x, y, w, h, r);
  litFill(g, x, y, w, h, col, { ...o, paint: (q) => texRect(q, x, y, w, h, noiseShader(col, seed, o.scale ?? 8, o.amt ?? 0.08)) });
}
/** soft puffy cushion with seam and wrinkles */
export function cushion(g: Ctx, x: number, y: number, w: number, h: number, r: number, col: string, seed: number, R: Rng, wrinkles = 3) {
  fabricBox(g, x, y, w, h, r, col, seed, { light: 0.2, dark: 0.38, bevel: 3, outline: 'rgba(20,16,14,0.55)', lw: 1.5 });
  // puff highlight
  g.save(); rrPath(g, x, y, w, h, r); g.clip();
  const pg = g.createRadialGradient(x + w * 0.42, y + h * 0.4, 0, x + w * 0.5, y + h * 0.5, Math.max(w, h) * 0.6);
  pg.addColorStop(0, 'rgba(255,250,240,0.10)'); pg.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = pg; g.fillRect(x, y, w, h);
  // seam
  rrPath(g, x + 3, y + 3, w - 6, h - 6, Math.max(1, r - 2));
  g.setLineDash([2, 2]); g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 0.8; g.stroke(); g.setLineDash([]);
  folds(g, x, y, w, h, R, wrinkles);
  g.restore();
}
export function folds(g: Ctx, x: number, y: number, w: number, h: number, R: Rng, n: number, a = 0.22) {
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const sx = x + R.range(0.1, 0.9) * w, sy = y + R.range(0.1, 0.9) * h;
    const ang = R.range(0, TAU), len = R.range(0.2, 0.45) * Math.min(w, h) + 4;
    const ex = sx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len;
    const cx = (sx + ex) / 2 + R.range(-6, 6), cy = (sy + ey) / 2 + R.range(-6, 6);
    g.strokeStyle = `rgba(0,0,0,${a})`; g.lineWidth = R.range(1.2, 2.4);
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(cx, cy, ex, ey); g.stroke();
    g.strokeStyle = `rgba(255,250,240,${a * 0.5})`; g.lineWidth = 1;
    g.beginPath(); g.moveTo(sx - 1.2, sy - 1.2); g.quadraticCurveTo(cx - 1.2, cy - 1.2, ex - 1.2, ey - 1.2); g.stroke();
  }
}
function handle(g: Ctx, x: number, y: number, w: number, h: number) {
  g.fillStyle = 'rgba(0,0,0,0.4)'; rrPath(g, x + 1, y + 1, w, h, h / 2); g.fill();
  g.fillStyle = '#a9a69c'; rrPath(g, x, y, w, h, h / 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(x + 1, y, w - 2, 1);
}
function smallBox(g: Ctx, x: number, y: number, w: number, h: number, col: string) {
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 1.5, y + 2, w, h);
  rrPath(g, x, y, w, h, 1); litFill(g, x, y, w, h, col, { bevel: 1, lw: 1, outline: 'rgba(0,0,0,0.5)' });
}
function paper(g: Ctx, x: number, y: number, w: number, h: number, a: number) {
  g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(a);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-w / 2 + 1, -h / 2 + 1.5, w, h);
  g.fillStyle = '#c9c6b8'; g.fillRect(-w / 2, -h / 2, w, h);
  g.fillStyle = 'rgba(60,60,70,0.35)'; for (let i = 3; i < h - 2; i += 2.5) g.fillRect(-w / 2 + 2, -h / 2 + i, w * 0.7, 0.7);
  g.restore();
}
function mug(g: Ctx, x: number, y: number, col: string) {
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(x + 1.5, y + 2, 4.5, 0, TAU); g.fill();
  ellipse(g, x, y, 4.5, 4.5, col, { lw: 1 });
  g.fillStyle = '#2a1e16'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill();
  g.fillStyle = col; g.fillRect(x + 4, y - 1.2, 3, 2.4);
}
function book(g: Ctx, x: number, y: number, w: number, h: number, a: number, col: string) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-w / 2 + 1, -h / 2 + 1.5, w, h);
  rrPath(g, -w / 2, -h / 2, w, h, 1); litFill(g, -w / 2, -h / 2, w, h, col, { bevel: 1, lw: 1 });
  g.fillStyle = 'rgba(220,215,200,0.6)'; g.fillRect(w / 2 - 2, -h / 2 + 1, 1.5, h - 2);
  g.restore();
}

// ---------------------------------------------------------------- definitions
interface Def { w: number; h: number; elev: number; fit?: 'stretch' | 'contain' | 'tile' | 'nine'; slice?: number; variants: Draw[]; back?: 'n' | 'w'; orient?: 'h' | 'v' | 'any'; extra?: any }
const D: Record<string, Def> = {};
const pal = {
  fabric: ['#4a5652', '#5a573e', '#5c3432', '#56493c', '#4c4e54', '#3e4656'],
  woodDark: '#4a3a2c', wood: '#5e4a36', woodLight: '#7a6650', woodRed: '#5a3a2c',
  white: '#a9a8a0', steel: '#7a7e80', olive: '#4e5638',
};

function sofa(col: string, seed: number, armchair = false): Draw {
  return (g, W, H, R) => {
    const arm = armchair ? W * 0.18 : 16, back = H * 0.3;
    fabricBox(g, 0, 0, W, H, 10, col, seed, { light: 0.12, dark: 0.35, bevel: 3 });
    // back cushion band
    cushion(g, arm - 2, 2, W - arm * 2 + 4, back, 7, col, seed + 1, R, 2);
    // arms
    cushion(g, 1, 2, arm, H - 4, 8, col, seed + 2, R, 1);
    cushion(g, W - arm - 1, 2, arm, H - 4, 8, col, seed + 3, R, 1);
    // seat cushions
    const n = armchair ? 1 : W > 180 ? 3 : 2, sw = (W - arm * 2) / n;
    for (let i = 0; i < n; i++) cushion(g, arm + i * sw + 1, back - 2, sw - 2, H - back - 3, 6, col, seed + 10 + i, R, 3);
    // a throw pillow + occasional stain
    if (!armchair && R.chance(0.6)) {
      g.save(); g.translate(arm + 16, back + 12); g.rotate(R.range(-0.5, 0.5));
      cushion(g, -12, -10, 24, 20, 5, R.pick(['#7a6a4a', '#6a4a40', '#4a5a5a']), seed + 40, R, 1); g.restore();
    }
    if (R.chance(0.5)) { const x = R.range(arm + 10, W - arm - 10), y = R.range(back + 6, H - 8); const gr = g.createRadialGradient(x, y, 0, x, y, 10); gr.addColorStop(0, 'rgba(50,20,14,0.35)'); gr.addColorStop(1, 'rgba(50,20,14,0)'); g.fillStyle = gr; g.fillRect(x - 10, y - 10, 20, 20); }
  };
}
D.sofa = { w: 110, h: 42, elev: 4, back: 'n', variants: pal.fabric.slice(0, 5).map((c, i) => sofa(c, 100 + i)) };
D.armchair = { w: 40, h: 40, elev: 4, back: 'n', variants: [pal.fabric[0], pal.fabric[2], pal.fabric[3], pal.fabric[1]].map((c, i) => sofa(c, 200 + i, true)) };

D.tv = {
  w: 70, h: 20, elev: 4, back: 'n', variants: [0, 1].map((v) => (g, W, H, R) => {
    // low wooden stand + thin flat screen standing on it
    woodBox(g, 0, 4, W, H - 6, 3, v ? pal.woodDark : '#3c3a38', 300 + v);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(W * 0.1 + 2, H * 0.36 + 3, W * 0.8, 7);
    rrPath(g, W * 0.1, H * 0.36, W * 0.8, 6, 2); litFill(g, W * 0.1, H * 0.36, W * 0.8, 6, '#1d1f22', { light: 0.35, bevel: 1 });
    g.fillStyle = '#2a2c30'; g.fillRect(W * 0.45, H * 0.36 + 6, W * 0.1, 6);
    // remote + dvd box
    smallBox(g, W * 0.75, H * 0.66, 10, 5, '#26282a');
    if (v === 0) book(g, W * 0.18, H * 0.75, 12, 8, 0.2, '#3a4a6a');
    void R;
  }),
};

function tableDraw(top: string, seed: number, clutter: number): Draw {
  return (g, W, H, R) => {
    woodBox(g, 0, 0, W, H, 4, top, seed, { vertical: false, bevel: 2.5 });
    // edge lip
    g.strokeStyle = 'rgba(255,240,210,0.08)'; g.lineWidth = 1; rrPath(g, 4, 4, W - 8, H - 8, 3); g.stroke();
    for (let i = 0; i < clutter; i++) {
      const k = R.int(0, 3), x = R.range(14, W - 14), y = R.range(12, H - 12);
      if (k === 0) paper(g, x - 8, y - 10, 16, 20, R.range(-0.6, 0.6));
      else if (k === 1) mug(g, x, y, R.pick(['#8a8a80', '#6a3a30', '#3a4a5a']));
      else if (k === 2) { // plate
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(x + 1.5, y + 2, 9, 0, TAU); g.fill();
        ellipse(g, x, y, 9, 9, '#a8a69e', { lw: 1 });
        g.strokeStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.stroke();
        if (R.chance(0.5)) { g.fillStyle = '#4a3020'; g.beginPath(); g.arc(x + 1, y, 3, 0, TAU); g.fill(); }
      } else { g.save(); g.translate(x, y); g.rotate(R.range(0, 3)); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-2, -8, 5, 16); rrPath(g, -2.5, -9, 5, 16, 2); litFill(g, -2.5, -9, 5, 16, '#3a5a3a', { lw: 1, bevel: 1 }); g.restore(); }
    }
  };
}
D.table = { w: 70, h: 40, elev: 3, fit: 'nine', slice: 14, orient: 'any', variants: [tableDraw(pal.wood, 400, 3), tableDraw(pal.woodLight, 401, 2), tableDraw(pal.woodDark, 402, 4), tableDraw('#6a5e4c', 403, 0)] };

function bedDraw(frame: string, sheet: string, blanket: string, seed: number, hospital = false): Draw {
  return (g, W, H, R) => {
    // headboard at the LEFT (−x)
    if (hospital) metalBox(g, 0, 0, W, H, 6, '#8a8e8e', seed, { bevel: 2 });
    else woodBox(g, 0, 0, W, H, 5, frame, seed, { vertical: true });
    const hb = hospital ? 8 : 12;
    if (hospital) { g.fillStyle = '#6a6e70'; g.fillRect(0, 0, hb, H); g.fillRect(W - 6, 0, 6, H); }
    // mattress + sheet
    fabricBox(g, hb, 4, W - hb - 5, H - 8, 6, sheet, seed + 1, { light: 0.2, bevel: 2, lw: 1.2 });
    // pillows
    const pw = 26, ph = (H - 16) / (H > 90 ? 2 : 1);
    for (let i = 0; i < (H > 90 ? 2 : 1); i++) cushion(g, hb + 4, 8 + i * ph, pw, ph - 4, 7, '#b6b4aa', seed + 5 + i, R, 2);
    // blanket, folded back edge
    const bx = hb + pw + 12;
    fabricBox(g, bx, 3, W - bx - 3, H - 6, 5, blanket, seed + 2, { light: 0.16, dark: 0.32, bevel: 2, lw: 1.2 });
    g.save(); rrPath(g, bx, 3, W - bx - 3, H - 6, 5); g.clip();
    folds(g, bx, 3, W - bx - 3, H - 6, R, 6, 0.24);
    g.restore();
    rrPath(g, bx - 6, 3, 9, H - 6, 3); litFill(g, bx - 6, 3, 9, H - 6, sheet, { light: 0.3, bevel: 1, lw: 1 });
    if (hospital) { // side rails
      g.fillStyle = 'rgba(200,205,205,0.75)'; g.fillRect(bx, 1, (W - bx) * 0.6, 3); g.fillRect(bx, H - 4, (W - bx) * 0.6, 3);
    }
    if (R.chance(0.35)) { const x = R.range(bx, W - 20), y = R.range(10, H - 10); const gr = g.createRadialGradient(x, y, 0, x, y, 14); gr.addColorStop(0, 'rgba(80,14,12,0.45)'); gr.addColorStop(1, 'rgba(80,14,12,0)'); g.fillStyle = gr; g.fillRect(x - 14, y - 14, 28, 28); }
  };
}
D.bed = { w: 100, h: 60, elev: 4, back: 'w', variants: [
  bedDraw(pal.wood, '#a8a59a', '#4e4258', 500), bedDraw(pal.woodDark, '#9ea29e', '#4a5a4a', 501),
  bedDraw(pal.woodLight, '#aaa496', '#6a4a3a', 502), bedDraw('#3e3a36', '#a09c90', '#3e4a5e', 503)] };
D.hbed = { w: 90, h: 54, elev: 4, back: 'w', variants: [bedDraw('', '#b4bab8', '#7f9aa0', 510, true), bedDraw('', '#b2b6b2', '#8a9a8a', 511, true)] };
D.cot = { w: 90, h: 40, elev: 3, back: 'w', variants: [0, 1, 2].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  // tubular frame + olive canvas + rolled blanket
  g.strokeStyle = '#3a3c34'; g.lineWidth = 3; rrPath(g, 1.5, 1.5, W - 3, H - 3, 3); g.stroke();
  fabricBox(g, 4, 4, W - 8, H - 8, 2, v === 2 ? '#5d5f4a' : '#58603f', 520 + v, { light: 0.16, lw: 1.2 });
  g.save(); rrPath(g, 4, 4, W - 8, H - 8, 2); g.clip(); folds(g, 4, 4, W - 8, H - 8, R, 4, 0.2); g.restore();
  for (const x of [W * 0.33, W * 0.66]) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, 4, 2, H - 8); }
  if (v !== 1) { const bx = W - 30; g.save(); g.translate(bx + 12, H / 2); fabricBox(g, -11, -H / 2 + 6, 22, H - 12, 9, '#4a4a3c', 525 + v, { light: 0.25 }); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; for (const k of [-5, 0, 5]) { g.beginPath(); g.moveTo(k, -H / 2 + 7); g.lineTo(k, H / 2 - 7); g.stroke(); } g.restore(); }
  cushion(g, 7, 7, 20, H - 14, 5, '#7a7a68', 528 + v, R, 1);
}) };

function caseTop(col: string, seed: number, handles: number, items: number, kind: 'wood' | 'metal' | 'white' = 'wood'): Draw {
  return (g, W, H, R) => {
    if (kind === 'wood') woodBox(g, 0, 0, W, H, 3, col, seed, { vertical: false, bevel: 2.5 });
    else if (kind === 'metal') metalBox(g, 0, 0, W, H, 3, col, seed);
    else plainBox(g, 0, 0, W, H, 3, col, seed, { amt: 0.05 });
    // crown/top panel inset
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1; rrPath(g, 4, 3, W - 8, H - 8, 2); g.stroke();
    g.strokeStyle = 'rgba(255,245,225,0.08)'; rrPath(g, 5, 4, W - 8, H - 8, 2); g.stroke();
    // front lip (drawer/door faces peek out at the bottom edge) with handles
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(2, H - 5, W - 4, 3);
    for (let i = 0; i < handles; i++) handle(g, (W / handles) * (i + 0.5) - 5, H - 5, 10, 3);
    for (let i = 0; i < items; i++) {
      const k = R.int(0, 2), x = R.range(10, W - 10), y = R.range(8, H - 12);
      if (k === 0) book(g, x, y, R.range(10, 16), R.range(7, 10), R.range(-0.4, 0.4), R.pick(['#5a3a30', '#3a4a5a', '#4a5a3a', '#6a5a3a']));
      else if (k === 1) smallBox(g, x - 6, y - 4, 12, 9, R.pick(['#7a6a4a', '#5a5a5a', '#6a4a3a']));
      else paper(g, x - 6, y - 6, 12, 14, R.range(-0.5, 0.5));
    }
  };
}
D.cabinet = { w: 64, h: 28, elev: 6, back: 'n', variants: [caseTop(pal.wood, 600, 2, 1), caseTop(pal.woodLight, 601, 2, 2), caseTop('#6a6862', 602, 2, 0, 'white'), caseTop(pal.woodDark, 603, 3, 1)] };
D.nightstand = { w: 28, h: 26, elev: 4, back: 'n', variants: [0, 1, 2].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  caseTop([pal.wood, pal.woodDark, pal.woodLight][v], 610 + v, 1, 0)(g, W, H, R);
  // lamp seen from above: round shade
  if (v !== 2) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(W * 0.42 + 3, H * 0.42 + 4, 10, 0, TAU); g.fill(); ellipse(g, W * 0.42, H * 0.42, 10, 10, '#a89c80', { light: 0.3 }); g.fillStyle = '#5a5040'; g.beginPath(); g.arc(W * 0.42, H * 0.42, 2.5, 0, TAU); g.fill(); }
  else mug(g, W * 0.5, H * 0.45, '#8a8a80');
}) };
D.dresser = { w: 70, h: 28, elev: 5, back: 'n', variants: [caseTop(pal.wood, 620, 3, 2), caseTop(pal.woodRed, 621, 3, 1), caseTop(pal.woodLight, 622, 3, 3)] };
D.wardrobe = { w: 66, h: 30, elev: 9, back: 'n', variants: [caseTop(pal.woodDark, 630, 2, 1), caseTop(pal.wood, 631, 2, 0), caseTop('#5a5650', 632, 2, 2, 'white')] };
D.bookshelf = { w: 80, h: 22, elev: 9, back: 'n', variants: [0, 1, 2].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  woodBox(g, 0, 0, W, H, 2, [pal.wood, pal.woodDark, pal.woodLight][v], 640 + v, { vertical: false });
  // top shelf: spines of books standing in a row seen from above, plus a lying stack
  const x0 = 4; let x = x0;
  while (x < W - 6) {
    const bw = R.range(3, 6.5), bh = R.range(H * 0.5, H - 6), col = R.pick(['#5a3a30', '#3a4a5a', '#4a5a3a', '#6a5a3a', '#4a3a4a', '#7a6a5a', '#2e3a3a', '#6a4a2a']);
    if (R.chance(0.08)) { x += bw + 4; continue; }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 1, H - 4 - bh + 1.5, bw, bh);
    rrPath(g, x, H - 4 - bh, bw, bh, 0.8); litFill(g, x, H - 4 - bh, bw, bh, col, { bevel: 0.8, lw: 0.8, outline: 'rgba(0,0,0,0.45)' });
    x += bw + 0.3;
  }
}) };
function deskDraw(top: string, seed: number, pc: boolean): Draw {
  return (g, W, H, R) => {
    woodBox(g, 0, 0, W, H, 3, top, seed, { vertical: false });
    if (pc) {
      // monitor (thin slab near the back) + keyboard + mouse
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(W * 0.3 + 3, 8, W * 0.4, 8);
      rrPath(g, W * 0.3, 5, W * 0.4, 7, 2); litFill(g, W * 0.3, 5, W * 0.4, 7, '#1e2124', { light: 0.3, bevel: 1 });
      g.fillStyle = '#2a2c30'; g.fillRect(W * 0.46, 12, W * 0.08, 7);
      rrPath(g, W * 0.3, H * 0.55, W * 0.34, 10, 2); litFill(g, W * 0.3, H * 0.55, W * 0.34, 10, '#2c2e30', { bevel: 1, lw: 1 });
      g.fillStyle = 'rgba(160,160,150,0.25)'; for (let i = 0; i < 14; i++) g.fillRect(W * 0.31 + i * (W * 0.32 / 14), H * 0.55 + 2, 2, 2), g.fillRect(W * 0.31 + i * (W * 0.32 / 14), H * 0.55 + 5.5, 2, 2);
      ellipse(g, W * 0.72, H * 0.62, 3, 4.5, '#2c2e30', { lw: 1 });
    } else { paper(g, W * 0.4, H * 0.3, 18, 22, R.range(-0.3, 0.3)); }
    paper(g, W * 0.06, H * 0.25, 16, 20, R.range(-0.4, 0.4));
    if (R.chance(0.6)) mug(g, W * 0.86, H * 0.3, R.pick(['#8a8a80', '#4a3a30']));
    // drawer pedestal handles at the front edge
    handle(g, W * 0.8, H - 5, 10, 3);
  };
}
D.desk = { w: 70, h: 36, elev: 4, back: 'n', variants: [deskDraw(pal.wood, 650, true), deskDraw('#5e5a52', 651, true), deskDraw(pal.woodLight, 652, false), deskDraw(pal.woodDark, 653, true)] };
D.sdesk = { w: 36, h: 28, elev: 3, back: 'n', variants: [0, 1, 2].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  // school desk: laminate top + chair (seat + backrest) behind (bottom)
  g.strokeStyle = '#3a3c3e'; g.lineWidth = 2; g.strokeRect(4, 2, W - 8, H * 0.5);
  plainBox(g, 0, 0, W, H * 0.55, 3, ['#8a7a5e', '#7a6e58', '#8e8268'][v], 660 + v, { amt: 0.05 });
  g.fillStyle = 'rgba(20,20,20,0.25)'; g.fillRect(6, 4, 8, 1);
  plainBox(g, W * 0.22, H * 0.62, W * 0.56, H * 0.24, 3, ['#4a5a6a', '#6a4a3a', '#4a5a4a'][v], 663 + v);
  plainBox(g, W * 0.18, H * 0.86, W * 0.64, H * 0.12, 2, ['#3e4c5a', '#5a3e30', '#3e4c3e'][v], 666 + v);
  if (R.chance(0.6)) paper(g, W * 0.3, 3, 12, 14, R.range(-0.5, 0.5));
}) };
D.filing = { w: 32, h: 30, elev: 7, back: 'n', variants: ['#6a6e6c', '#5a6064', '#7a766a'].map((c, i) => (g: Ctx, W: number, H: number, R: Rng) => {
  metalBox(g, 0, 0, W, H, 2, c, 670 + i);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.strokeRect(3, 3, W - 6, H - 8);
  handle(g, W / 2 - 6, H - 5, 12, 3);
  if (R.chance(0.7)) paper(g, 6, 5, 14, 16, R.range(-0.4, 0.4));
}) };
D.plant = { w: 22, h: 22, elev: 5, fit: 'contain', orient: 'any', variants: [0, 1, 2].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  ellipse(g, W / 2, H / 2, W * 0.36, H * 0.36, ['#6a4a3a', '#5a5a58', '#7a5a40'][v], {});
  g.fillStyle = '#2a2018'; g.beginPath(); g.arc(W / 2, H / 2, W * 0.28, 0, TAU); g.fill();
  const n = 9 + v * 2, dead = v === 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R.range(-0.2, 0.2), l = W * R.range(0.38, 0.62);
    g.save(); g.translate(W / 2, H / 2); g.rotate(a);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(l * 0.55 + 2, 2, l * 0.5, 4, 0, 0, TAU); g.fill();
    const col = dead ? R.pick(['#6a5a36', '#5a4a2e', '#7a6a42']) : R.pick(['#3e5a30', '#4a6a36', '#355028', '#56703e']);
    g.beginPath(); g.ellipse(l * 0.55, 0, l * 0.5, 4.2, 0, 0, TAU); g.fillStyle = col; g.fill();
    g.strokeStyle = 'rgba(255,255,220,0.18)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(3, 0); g.lineTo(l, 0); g.stroke();
    g.restore();
  }
}) };

// ---------------------------------------------------------------- kitchen / bath
D.stove = { w: 44, h: 40, elev: 4, back: 'n', variants: ['#9a9890', '#6e7072', '#a29a88'].map((c, i) => (g: Ctx, W: number, H: number, R: Rng) => {
  metalBox(g, 0, 0, W, H, 3, c, 700 + i);
  // back control panel
  rrPath(g, 2, 2, W - 4, 13, 2); litFill(g, 2, 2, W - 4, 13, '#3a3c3e', { bevel: 1, lw: 1 });
  for (let k = 0; k < 4; k++) { ellipse(g, 12 + k * ((W - 24) / 3), 8.5, 3.2, 3.2, '#c0beb6', { lw: 0.8 }); }
  // cooktop with 4 burners + grates
  rrPath(g, 4, 18, W - 8, H - 22, 2); litFill(g, 4, 18, W - 8, H - 22, '#26282a', { bevel: 1, lw: 1 });
  const bx = [W * 0.3, W * 0.7], by = [18 + (H - 22) * 0.28, 18 + (H - 22) * 0.72];
  for (const x of bx) for (const y of by) {
    const r = 10;
    g.strokeStyle = '#4c4e50'; g.lineWidth = 2.2; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
    g.fillStyle = '#121314'; g.beginPath(); g.arc(x, y, r * 0.55, 0, TAU); g.fill();
    g.strokeStyle = '#5a5c5e'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke();
  }
  if (i !== 1) { // a pot on one burner
    const x = bx[R.int(0, 1)], y = by[R.int(0, 1)];
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(x + 2, y + 3, 11, 0, TAU); g.fill();
    ellipse(g, x, y, 11, 11, '#7a7c7e', { light: 0.35 });
    g.fillStyle = '#3a2e22'; g.beginPath(); g.arc(x, y, 8.5, 0, TAU); g.fill();
    g.fillStyle = '#6a6c6e'; g.fillRect(x + 10, y - 1.5, 9, 3);
  }
}) };
D.fridge = { w: 44, h: 40, elev: 8, back: 'n', variants: ['#a6a59c', '#8a8e90', '#9c9686', '#6a6c6e'].map((c, i) => (g: Ctx, W: number, H: number, R: Rng) => {
  metalBox(g, 0, 0, W, H, 4, c, 710 + i, { light: 0.28 });
  // rear condenser vent + door gasket line at the front
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 6; x < W - 6; x += 3) g.fillRect(x, 4, 1.5, 6);
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(2, H - 6, W - 4, 1.5);
  handle(g, W - 14, H - 4.5, 10, 3);
  // stuff stored on top (boxes / bottles / dust)
  if (i % 2 === 0) smallBox(g, 8, 14, 18, 12, R.pick(['#7a6a4a', '#6a5a4a']));
  if (i !== 3) { ellipse(g, W - 12, 18, 3.5, 3.5, '#3a5a4a', { lw: 0.8 }); }
}) };
D.sink = { w: 36, h: 24, elev: 3, back: 'n', variants: [0, 1].map((v) => (g: Ctx, W: number, H: number) => {
  plainBox(g, 0, 0, W, H, 4, v ? '#a8a69c' : '#8e8a7e', 720 + v, { amt: 0.04 });
  const bx = 5, by = 7, bw = W - 10, bh = H - 10;
  rrPath(g, bx, by, bw, bh, 7); g.fillStyle = '#c0bfb6'; g.fill();
  innerShadow(g, () => rrPath(g, bx, by, bw, bh, 7), 6, 0.5, 2, 3);
  g.fillStyle = '#2a2c2e'; g.beginPath(); g.arc(W / 2, by + bh * 0.6, 2, 0, TAU); g.fill();
  // faucet
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(W / 2 - 1, 3, 4, 8);
  rrPath(g, W / 2 - 2, 1.5, 4, 9, 2); litFill(g, W / 2 - 2, 1.5, 4, 9, '#b8bcbe', { light: 0.5, lw: 0.8, bevel: 0 });
  if (v) { g.fillStyle = 'rgba(90,70,40,0.25)'; g.beginPath(); g.arc(W / 2 + 3, by + bh * 0.5, 5, 0, TAU); g.fill(); }
}) };
function counterDraw(top: string, seed: number, mode: 'kitchen' | 'store' | 'plain'): Draw {
  return (g, W, H, R) => {
    if (mode === 'store') woodBox(g, 0, 0, W, H, 2, top, seed, { vertical: false });
    else plainBox(g, 0, 0, W, H, 2, top, seed, { scale: 5, amt: 0.1 });
    g.fillStyle = 'rgba(255,255,245,0.1)'; g.fillRect(2, 2, W - 4, 2);
    if (mode === 'kitchen') {
      // cutting board, kettle, jar
      woodBox(g, W * 0.15, H * 0.3, 26, 18, 2, '#8a7050', seed + 1);
      ellipse(g, W * 0.6, H * 0.45, 9, 8, '#6a6e70', { light: 0.35 });
      g.fillStyle = '#2a2c2e'; g.fillRect(W * 0.6 - 2, H * 0.45 - 12, 4, 6);
      if (R.chance(0.6)) ellipse(g, W * 0.82, H * 0.4, 5, 5, '#7a5a3a', { lw: 1 });
    } else if (mode === 'store') {
      // cash register + card reader + scattered receipts
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(W * 0.18 + 3, H * 0.2 + 3, 26, 22);
      rrPath(g, W * 0.18, H * 0.2, 26, 22, 3); litFill(g, W * 0.18, H * 0.2, 26, 22, '#3a3c3e', { light: 0.25 });
      g.fillStyle = '#5a6a5a'; g.fillRect(W * 0.18 + 4, H * 0.2 + 3, 18, 6);
      g.fillStyle = 'rgba(180,180,170,0.35)'; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g.fillRect(W * 0.18 + 5 + i * 6, H * 0.2 + 12 + j * 3.5, 4, 2.5);
      smallBox(g, W * 0.48, H * 0.3, 10, 14, '#2a2c2e');
      paper(g, W * 0.7, H * 0.25, 10, 16, R.range(-0.6, 0.6));
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(4, H - 6, W - 8, 2);
    }
  };
}
D.counter = { w: 100, h: 34, elev: 4, back: 'n', fit: 'nine', slice: 12, variants: [counterDraw('#6a6a64', 730, 'kitchen'), counterDraw('#7a7468', 731, 'kitchen'), counterDraw('#5a4a3a', 732, 'store'), counterDraw('#4e4c48', 733, 'store'), counterDraw('#706e66', 734, 'plain')] };
D.toilet = { w: 26, h: 30, elev: 4, back: 'n', orient: 'any', variants: [0, 1].map((v) => (g: Ctx, W: number, H: number) => {
  const col = v ? '#a09e94' : '#b4b2a8';
  // tank at the back
  plainBox(g, 1, 0, W - 2, H * 0.3, 3, col, 740 + v, { amt: 0.04, light: 0.3 });
  g.fillStyle = '#c8c8c0'; g.fillRect(W * 0.38, 2.5, W * 0.24, 3);
  // bowl + seat
  g.beginPath(); g.ellipse(W / 2, H * 0.62, W * 0.42, H * 0.36, 0, 0, TAU); litFill(g, W * 0.08, H * 0.26, W * 0.84, H * 0.72, col, { radial: true, light: 0.3 });
  g.beginPath(); g.ellipse(W / 2, H * 0.64, W * 0.27, H * 0.24, 0, 0, TAU); g.fillStyle = v ? '#4a5048' : '#5a6a6e'; g.fill();
  innerShadow(g, () => { g.beginPath(); g.ellipse(W / 2, H * 0.64, W * 0.27, H * 0.24, 0, 0, TAU); }, 5, 0.6, 1.5, 2);
  g.fillStyle = 'rgba(200,220,220,0.25)'; g.beginPath(); g.ellipse(W / 2 - 2, H * 0.6, W * 0.1, H * 0.07, 0, 0, TAU); g.fill();
}) };
D.tub = { w: 80, h: 40, elev: 4, back: 'n', variants: [0, 1].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  plainBox(g, 0, 0, W, H, 10, '#b0aea4', 750 + v, { amt: 0.05, light: 0.25 });
  const bx = 7, by = 7, bw = W - 14, bh = H - 14;
  rrPath(g, bx, by, bw, bh, 16); g.fillStyle = '#c4c4bc'; g.fill();
  innerShadow(g, () => rrPath(g, bx, by, bw, bh, 16), 9, 0.55, 3, 4);
  if (v) { // dirty standing water
    g.save(); rrPath(g, bx + 4, by + 4, bw - 8, bh - 8, 12); g.clip();
    const wg = g.createLinearGradient(bx, by, bx + bw, by + bh); wg.addColorStop(0, 'rgba(70,80,60,0.75)'); wg.addColorStop(1, 'rgba(50,48,36,0.8)');
    g.fillStyle = wg; g.fillRect(bx, by, bw, bh);
    g.fillStyle = 'rgba(200,210,200,0.2)'; g.fillRect(bx + 8, by + 6, bw * 0.4, 2); g.restore();
  }
  g.fillStyle = '#2a2c2e'; g.beginPath(); g.arc(bx + 12, by + bh / 2, 2.5, 0, TAU); g.fill();
  // faucet at the end
  rrPath(g, 2, H / 2 - 3, 9, 6, 2); litFill(g, 2, H / 2 - 3, 9, 6, '#b8bcbe', { light: 0.5, lw: 0.8, bevel: 0 });
  void R;
}) };
D.cooler = { w: 50, h: 30, elev: 8, back: 'n', variants: [0, 1, 2].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  // glass-door drinks cooler: branded metal top with a vent grille + lit glass front edge
  metalBox(g, 0, 0, W, H, 3, ['#7a2a26', '#2a4a6a', '#3a3c3e'][v], 760 + v, { light: 0.25 });
  g.fillStyle = 'rgba(0,0,0,0.35)'; for (let x = 6; x < W - 6; x += 3) g.fillRect(x, 4, 1.5, H * 0.35);
  g.fillStyle = 'rgba(230,230,220,0.6)'; g.fillRect(6, H * 0.55, W * 0.45, 3);
  g.fillStyle = 'rgba(150,200,220,0.45)'; g.fillRect(2, H - 6, W - 4, 4);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(4, H - 6, W * 0.3, 1);
  void R;
}) };

// ---------------------------------------------------------------- store / storage
const productCols = ['#7a3a30', '#3a5a7a', '#8a7a3a', '#4a6a3a', '#7a6a5a', '#5a3a5a', '#8a5a2a', '#3a6a6a', '#9a8a6a', '#6a2a2a'];
function shelfDraw(seed: number, frameCol: string, fill: number, cols = productCols): Draw {
  return (g, W, H, R) => {
    metalBox(g, 0, 0, W, H, 2, frameCol, seed);
    // gondola: central divider + products on both faces (top shelf seen from above)
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(2, H / 2 - 1, W - 4, 2);
    for (const side of [0, 1]) {
      let x = 4;
      const y0 = side ? H / 2 + 2 : 3, hh = H / 2 - 5;
      while (x < W - 6) {
        const bw = R.range(5, 14), col = R.pick(cols);
        if (R.next() > fill) { x += bw + 1; continue; }
        const k = R.int(0, 2);
        if (k === 0) smallBox(g, x, y0 + R.range(0, 2), bw, hh - R.range(0, 3), col);
        else if (k === 1) { const r = Math.min(bw, hh) / 2 - 0.5; for (let yy = y0 + r; yy < y0 + hh - r + 0.1; yy += r * 2 + 0.5) ellipse(g, x + r, yy, r, r, col, { lw: 0.8, bevel: 0.8 }); }
        else { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 1, y0 + 1.5, bw, hh); rrPath(g, x, y0, bw, hh, 2); litFill(g, x, y0, bw, hh, col, { lw: 0.8, bevel: 1, light: 0.3 }); }
        x += bw + 1;
      }
    }
  };
}
D.shelf = { w: 80, h: 28, elev: 8, fit: 'nine', slice: 8, variants: [shelfDraw(800, '#6a6e70', 0.85), shelfDraw(801, '#5a5e60', 0.55), shelfDraw(802, '#7a7a74', 0.3), shelfDraw(803, '#6a6a64', 0.7)] };
function rackDraw(seed: number, fill: number): Draw {
  return (g, W, H, R) => {
    // pallet racking: orange beams, grey uprights, boxes / sacks on the top level
    g.fillStyle = '#2a2a28'; g.fillRect(2, 2, W - 4, H - 4);
    for (const y of [0, H - 5]) { rrPath(g, 0, y, W, 5, 1); litFill(g, 0, y, W, 5, '#9a5a2a', { bevel: 1, lw: 1 }); }
    for (let x = 0; x <= W - 5; x += Math.max(40, (W - 5) / Math.max(1, Math.round((W - 5) / 70)))) { rrPath(g, x, 0, 5, H, 1); litFill(g, x, 0, 5, H, '#4a5a6a', { bevel: 1, lw: 1 }); }
    let x = 7;
    while (x < W - 12) {
      const bw = R.range(16, 30);
      if (R.next() < fill && x + bw < W - 5) {
        const k = R.int(0, 2), col = k === 2 ? '#7a7466' : R.pick(['#8a7050', '#7a6448', '#6a5a44']);
        if (k === 2) { fabricBox(g, x, 6, bw, H - 12, 6, col, seed + x, { light: 0.2 }); g.fillStyle = 'rgba(40,30,20,0.35)'; g.fillRect(x + 3, H / 2 - 1, bw - 6, 2); }
        else { smallBox(g, x, 6, bw, H - 12, col); g.fillStyle = 'rgba(200,180,120,0.35)'; g.fillRect(x + bw / 2 - 1.5, 6, 3, H - 12); }
      }
      x += bw + 3;
    }
  };
}
D.rack = { w: 80, h: 28, elev: 8, fit: 'nine', slice: 10, variants: [rackDraw(810, 0.8), rackDraw(811, 0.5), rackDraw(812, 0.95)] };
D.clothes = { w: 110, h: 30, elev: 6, fit: 'nine', slice: 10, variants: [0, 1, 2].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  // chrome rail + hanging garments seen from above (thin folded shapes across the rail)
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(4, H / 2, W - 8, 3);
  let x = 6;
  while (x < W - 8) {
    const gw = R.range(3, 6), col = R.pick(['#5a4a5a', '#3a4a6a', '#5a5a3a', '#6a3a3a', '#4a4a4a', '#7a6a5a', '#2e3a4a', '#6a5a3a']);
    if (R.chance(v === 2 ? 0.45 : 0.1)) { x += gw + 2; continue; }
    fabricBox(g, x, 2, gw + 1, H - 4, 1.5, col, 820 + x, { lw: 0.8, bevel: 0.8, light: 0.25 });
    x += gw - 0.5;
  }
  g.fillStyle = '#b4b8ba'; g.fillRect(2, H / 2 - 1, W - 4, 2);
  for (const ex of [2, W - 8]) ellipse(g, ex + 3, H / 2, 4, 4, '#8a8e90', { lw: 1 });
}) };
function crateDraw(col: string, seed: number, open = false): Draw {
  return (g, W, H, R) => {
    woodBox(g, 0, 0, W, H, 2, col, seed, { vertical: false, bevel: 2 });
    // planks
    const n = Math.max(3, Math.round(H / 14));
    for (let i = 1; i < n; i++) { const y = (H / n) * i; g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(2, y - 0.8, W - 4, 1.6); g.fillStyle = 'rgba(255,235,200,0.1)'; g.fillRect(2, y + 0.8, W - 4, 1); }
    if (open) {
      g.fillStyle = '#1a1612'; g.fillRect(6, 6, W - 12, H - 12);
      innerShadow(g, () => rrPath(g, 6, 6, W - 12, H - 12, 1), 6, 0.7, 2, 3);
      g.fillStyle = '#8a7a5a'; for (let i = 0; i < 12; i++) g.fillRect(R.range(8, W - 14), R.range(8, H - 12), R.range(3, 7), 1); // straw
    } else {
      // frame battens + diagonal brace + stencil
      g.strokeStyle = 'rgba(30,22,14,0.55)'; g.lineWidth = 1.2; g.strokeRect(4, 4, W - 8, H - 8);
      woodBox(g, 3, 3, W - 6, 6, 1, col, seed + 2, { lw: 1, bevel: 1 }); woodBox(g, 3, H - 9, W - 6, 6, 1, col, seed + 3, { lw: 1, bevel: 1 });
      g.save(); g.translate(W / 2, H / 2); g.rotate(Math.atan2(H - 18, W - 8));
      woodBox(g, -Math.hypot(W - 8, H - 18) / 2, -3, Math.hypot(W - 8, H - 18), 6, 1, col, seed + 4, { lw: 1, bevel: 1, vertical: false }); g.restore();
      for (const [x, y] of [[6, 6], [W - 6, 6], [6, H - 6], [W - 6, H - 6]]) { g.fillStyle = '#2a2622'; g.beginPath(); g.arc(x, y, 1.2, 0, TAU); g.fill(); }
    }
  };
}
D.crate = { w: 40, h: 40, elev: 6, orient: 'any', variants: [crateDraw('#7a6448', 840), crateDraw('#6a5a42', 841), crateDraw('#857050', 842), crateDraw('#6e5c44', 843, true)] };
function mcrateDraw(col: string, seed: number): Draw {
  return (g, W, H, R) => {
    plainBox(g, 0, 0, W, H, 3, col, seed, { amt: 0.1, light: 0.2 });
    // lid panel + reinforced corners + latches + stencil
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5; rrPath(g, 5, 5, W - 10, H - 10, 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,230,0.08)'; rrPath(g, 6, 6, W - 10, H - 10, 2); g.stroke();
    for (const [x, y] of [[0, 0], [W - 9, 0], [0, H - 9], [W - 9, H - 9]]) { rrPath(g, x, y, 9, 9, 2); litFill(g, x, y, 9, 9, '#3a3c34', { lw: 1, bevel: 1 }); }
    for (const x of [W * 0.3, W * 0.7]) { rrPath(g, x - 4, H - 6, 8, 5, 1); litFill(g, x - 4, H - 6, 8, 5, '#6a6c64', { lw: 0.8, light: 0.4, bevel: 0.5 }); }
    g.fillStyle = 'rgba(210,200,150,0.55)'; g.font = `bold ${Math.round(H * 0.16)}px sans-serif`; g.textAlign = 'center';
    g.fillText(R.pick(['AMMO', '5.56', 'MRE', 'U.S.', '7.62']), W / 2, H / 2 + H * 0.06);
    g.fillRect(W / 2 - W * 0.22, H / 2 + H * 0.12, W * 0.44, 1.5);
  };
}
D.mcrate = { w: 50, h: 50, elev: 6, orient: 'any', variants: [mcrateDraw('#4e5638', 850), mcrateDraw('#565a3e', 851), mcrateDraw('#4a5040', 852)] };
D.pallet = { w: 50, h: 34, elev: 5, fit: 'tile', variants: [0, 1, 2].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  // wooden pallet slats + shrink-wrapped boxes
  for (let x = 0; x < W; x += W / 5) woodBox(g, x + 1, 0, W / 5 - 3, H, 1, '#7a6a50', 860 + x + v, { lw: 1, bevel: 1, vertical: true });
  if (v < 2) {
    const cols = R.pick([['#8a7050', '#7a6448'], ['#6a6a62', '#5a5a54'], ['#7a5a3a', '#8a6a4a']]);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) smallBox(g, 3 + i * (W / 2 - 3), 3 + j * (H / 2 - 3), W / 2 - 4, H / 2 - 4, cols[(i + j) % 2]);
    g.fillStyle = 'rgba(220,230,235,0.12)'; g.fillRect(2, 2, W - 4, H - 4);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(4, 6); g.lineTo(W - 10, 3); g.moveTo(6, H - 5); g.lineTo(W - 4, H - 9); g.stroke();
  }
}) };
D.barrel = { w: 50, h: 50, elev: 6, fit: 'contain', orient: 'any', variants: ['#3a4a5a', '#6a3a2a', '#4e5638', '#5a5a58'].map((c, i) => (g: Ctx, W: number, H: number, R: Rng) => {
  // two drums in the slot? legacy 50×50 rect -> a single 55-gallon drum seen from the top
  const cx = W / 2, cy = H / 2, r = W / 2 - 1;
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); litFill(g, 0, 0, W, H, c, { radial: true, light: 0.25, dark: 0.35 });
  for (const k of [0.92, 0.8]) { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.6; g.beginPath(); g.arc(cx, cy, r * k, 0, TAU); g.stroke(); g.strokeStyle = 'rgba(255,255,240,0.12)'; g.lineWidth = 1; g.beginPath(); g.arc(cx - 0.8, cy - 0.8, r * k - 1.5, Math.PI, Math.PI * 1.5); g.stroke(); }
  // bungs
  ellipse(g, cx - r * 0.45, cy - r * 0.2, 4, 4, '#8a8a84', { lw: 1 }); ellipse(g, cx + r * 0.5, cy + r * 0.1, 2.5, 2.5, '#8a8a84', { lw: 1 });
  // rust / hazard
  g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
  for (let k = 0; k < 4; k++) { const x = R.range(4, W - 4), y = R.range(4, H - 4), gr = g.createRadialGradient(x, y, 0, x, y, R.range(5, 12)); gr.addColorStop(0, 'rgba(100,56,28,0.5)'); gr.addColorStop(1, 'rgba(100,56,28,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  g.restore();
  if (i === 1) { g.fillStyle = 'rgba(220,180,40,0.6)'; g.beginPath(); g.moveTo(cx + 4, cy + 6); g.lineTo(cx + 12, cy + 18); g.lineTo(cx - 4, cy + 18); g.fill(); }
}) };
D.woodpile = { w: 50, h: 26, elev: 5, variants: [0, 1].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  // split logs lying side by side, two layers; log ends visible at the sides
  const rows = 4, rh = H / rows;
  for (let layer = 0; layer < 2; layer++) for (let j = 0; j < rows - layer; j++) {
    const y = j * rh + layer * rh * 0.5, x0 = layer * 6 + R.range(0, 4), x1 = W - layer * 6 - R.range(0, 4);
    woodBox(g, x0, y, x1 - x0, rh + 1, rh / 2, R.pick(['#5a4430', '#6a5038', '#4e3a28']), 870 + j * 7 + layer + v * 50, { lw: 1, vertical: false });
    // bark texture + end grain
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.8; for (let k = 0; k < 4; k++) { const xx = R.range(x0 + 4, x1 - 8); g.beginPath(); g.moveTo(xx, y + 2); g.lineTo(xx + R.range(4, 9), y + 2.5); g.stroke(); }
    for (const ex of [x0 + rh / 2, x1 - rh / 2]) { ellipse(g, ex, y + rh / 2 + 0.5, rh * 0.42, rh * 0.42, '#a08458', { lw: 1, bevel: 0.5 }); g.strokeStyle = 'rgba(80,50,30,0.5)'; g.lineWidth = 0.6; g.beginPath(); g.arc(ex, y + rh / 2 + 0.5, rh * 0.22, 0, TAU); g.stroke(); }
  }
}) };
D.ship = { w: 200, h: 56, elev: 10, fit: 'nine', slice: 24, variants: ['#5a3a2a', '#2f4a5a', '#4a5a3a', '#6a5a2a', '#5a5a5a'].map((c, i) => (g: Ctx, W: number, H: number, R: Rng) => {
  // shipping container roof: corrugated across the short axis, corner castings, rust
  metalBox(g, 0, 0, W, H, 2, c, 880 + i, { vertical: true, light: 0.18 });
  g.save(); rrPath(g, 0, 0, W, H, 2); g.clip();
  for (let x = 10; x < W - 10; x += 8) {
    const gr = g.createLinearGradient(x, 0, x + 8, 0);
    gr.addColorStop(0, 'rgba(255,255,240,0.14)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = gr; g.fillRect(x, 6, 8, H - 12);
  }
  for (let k = 0; k < 7; k++) { const x = R.range(10, W - 10), y = R.range(6, H - 6), gr = g.createRadialGradient(x, y, 0, x, y, R.range(8, 22)); gr.addColorStop(0, 'rgba(96,58,30,0.45)'); gr.addColorStop(1, 'rgba(96,58,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2; g.strokeRect(5, 5, W - 10, H - 10);
  for (const [x, y] of [[0, 0], [W - 10, 0], [0, H - 10], [W - 10, H - 10]]) { rrPath(g, x, y, 10, 10, 1); litFill(g, x, y, 10, 10, '#2e2e2c', { lw: 1, bevel: 1 }); g.fillStyle = '#111'; g.fillRect(x + 3, y + 3.5, 4, 3); }
}) };
D.dumpster = { w: 60, h: 34, elev: 6, back: 'n', variants: ['#3a5040', '#2e4458', '#5a4a30', '#4a4c4a'].map((c, i) => (g: Ctx, W: number, H: number, R: Rng) => {
  metalBox(g, 0, 0, W, H, 3, c, 890 + i, { light: 0.2 });
  // two plastic lids with ribs; one ajar showing trash
  const lw = (W - 6) / 2;
  for (let k = 0; k < 2; k++) {
    const x = 3 + k * lw, open = i % 2 === 0 && k === 1;
    if (open) {
      g.fillStyle = '#1e1c18'; g.fillRect(x + 1, 4, lw - 2, H - 8);
      for (let t = 0; t < 7; t++) smallBox(g, x + R.range(2, lw - 12), R.range(5, H - 14), R.range(6, 11), R.range(5, 9), R.pick(['#2a2a2a', '#5a5040', '#3a3a44', '#6a6a60', '#20241e']));
      // lid flipped open against the back
      plainBox(g, x, -3, lw, 8, 2, '#262826', 895 + i, { light: 0.2 });
    } else {
      plainBox(g, x, 3, lw, H - 6, 3, '#2a2c2a', 893 + k + i, { light: 0.22 });
      g.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 8; y < H - 8; y += 6) g.fillRect(x + 3, y, lw - 6, 1.5);
      g.fillStyle = 'rgba(255,255,255,0.06)'; for (let y = 9.5; y < H - 8; y += 6) g.fillRect(x + 3, y, lw - 6, 1);
    }
  }
  // fork pockets on the sides
  for (const y of [H * 0.3, H * 0.7]) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(-1, y - 2, 3, 4); g.fillRect(W - 2, y - 2, 3, 4); }
}) };
D.pump = { w: 60, h: 24, elev: 8, variants: [0, 1].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  // concrete island + pump housing + hoses
  plainBox(g, 0, 0, W, H, 6, '#7a7870', 900 + v, { amt: 0.1 });
  g.fillStyle = 'rgba(200,170,40,0.5)'; g.fillRect(2, 2, W - 4, 2); g.fillRect(2, H - 4, W - 4, 2);
  const hx = W * 0.25, hw = W * 0.5;
  rrPath(g, hx, 4, hw, H - 8, 3); litFill(g, hx, 4, hw, H - 8, v ? '#8a8a84' : '#6e2a24', { light: 0.25 });
  g.fillStyle = '#1e2224'; g.fillRect(hx + 4, 7, hw * 0.4, H - 14);
  g.fillStyle = 'rgba(150,200,170,0.4)'; g.fillRect(hx + 5, 8, hw * 0.3, 3);
  g.fillStyle = v ? '#6e2a24' : '#c8c0a0'; g.fillRect(hx + hw * 0.55, 6, hw * 0.35, 3);
  // hoses (curled) + nozzles
  for (const s of [-1, 1]) {
    g.strokeStyle = '#141414'; g.lineWidth = 2.5; g.beginPath();
    const x0 = s < 0 ? hx : hx + hw;
    g.moveTo(x0, H / 2); g.bezierCurveTo(x0 + s * 12, H * 0.1, x0 + s * 14, H * 0.9, x0 + s * 6, H * 0.75); g.stroke();
    rrPath(g, x0 + s * 6 - 3, H * 0.75 - 2, 6, 4, 1); litFill(g, x0 + s * 6 - 3, H * 0.75 - 2, 6, 4, '#3a3c3a', { lw: 0.8, bevel: 0.5 });
  }
  if (R.chance(0.5)) { g.fillStyle = 'rgba(10,10,10,0.35)'; g.beginPath(); g.ellipse(W * 0.85, H * 0.6, 6, 3, 0, 0, TAU); g.fill(); }
}) };
D.planter = { w: 52, h: 52, elev: 5, fit: 'contain', orient: 'any', variants: [0, 1].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  plainBox(g, 0, 0, W, H, 4, '#77756d', 910 + v, { amt: 0.12, light: 0.2 });
  rrPath(g, 6, 6, W - 12, H - 12, 3); g.fillStyle = '#2e2419'; g.fill();
  innerShadow(g, () => rrPath(g, 6, 6, W - 12, H - 12, 3), 6, 0.6, 2, 3);
  for (let k = 0; k < 30; k++) { g.fillStyle = 'rgba(80,60,40,0.5)'; g.fillRect(R.range(8, W - 10), R.range(8, H - 10), 1.5, 1.5); }
  // shrub (alive or dead)
  const dead = v === 1;
  for (let k = 0; k < 16; k++) {
    const a = R.range(0, TAU), d = R.range(0, W * 0.2), x = W / 2 + Math.cos(a) * d, y = H / 2 + Math.sin(a) * d, r = R.range(5, 9);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(x + 2, y + 2, r, 0, TAU); g.fill();
    ellipse(g, x, y, r, r, dead ? R.pick(['#5a4e34', '#6a5a3a', '#4a4030']) : R.pick(['#34482a', '#3e5430', '#2c3e24']), { outline: null, bevel: 0, light: 0.25 });
  }
}) };
D.bench = { w: 60, h: 20, elev: 3, fit: 'nine', slice: 12, variants: [0, 1, 2].map((v) => (g: Ctx, W: number, H: number) => {
  if (v === 2) { metalBox(g, 0, 0, W, H, 2, '#5e6466', 920, {}); for (let y = 4; y < H - 2; y += 4) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(3, y, W - 6, 1.5); } return; }
  // cast iron ends + wooden slats
  for (const x of [2, W - 8]) { rrPath(g, x, 0, 6, H, 2); litFill(g, x, 0, 6, H, '#2a2c2a', { lw: 1 }); }
  const n = 4, sh = (H - 2) / n;
  for (let i = 0; i < n; i++) woodBox(g, 0, 1 + i * sh, W, sh - 1.4, 1.5, v ? '#6a5236' : '#5a4a38', 921 + i + v * 10, { lw: 1, bevel: 1, vertical: false });
}) };
D.sandbag = { w: 32, h: 22, elev: 5, fit: 'tile', variants: [0, 1].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  // two staggered rows of burlap bags; tiles along x
  const bags = [[0, 0, W / 2, H / 2], [W / 2, 0, W / 2, H / 2], [-W / 4, H / 2, W / 2, H / 2], [W / 4, H / 2, W / 2, H / 2], [W * 0.75, H / 2, W / 2, H / 2]];
  g.save(); g.beginPath(); g.rect(0, -4, W, H + 8); g.clip();
  for (const [x, y, w, h] of bags) {
    fabricBox(g, x + 0.5, y + 0.5, w - 1, h - 1, h / 2.2, R.pick(v ? ['#6a6048', '#5e5640', '#726850'] : ['#5e5a40', '#666046', '#58543c']), 930 + x * 3 + y, { light: 0.25, dark: 0.4, lw: 1.2 });
    g.strokeStyle = 'rgba(40,30,20,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + w - 5, y + 3); g.lineTo(x + w - 5, y + h - 3); g.stroke();
  }
  g.restore();
}) };
D.tower = { w: 60, h: 60, elev: 16, fit: 'contain', orient: 'any', variants: [0, 1].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  // guard tower roof: corrugated sheet metal hip roof over a timber platform
  woodBox(g, 0, 0, W, H, 2, '#4e4234', 940 + v, {});
  const m = 6;
  g.beginPath(); g.moveTo(m, m); g.lineTo(W - m, m); g.lineTo(W / 2, H / 2); g.closePath(); g.fillStyle = v ? '#5a5e5c' : '#4e5440'; g.fill(); g.fillStyle = 'rgba(255,255,240,0.14)'; g.fill();
  g.beginPath(); g.moveTo(m, m); g.lineTo(W / 2, H / 2); g.lineTo(m, H - m); g.closePath(); g.fillStyle = v ? '#5a5e5c' : '#4e5440'; g.fill(); g.fillStyle = 'rgba(255,255,240,0.06)'; g.fill();
  g.beginPath(); g.moveTo(W - m, m); g.lineTo(W - m, H - m); g.lineTo(W / 2, H / 2); g.closePath(); g.fillStyle = v ? '#5a5e5c' : '#4e5440'; g.fill(); g.fillStyle = 'rgba(0,0,0,0.22)'; g.fill();
  g.beginPath(); g.moveTo(m, H - m); g.lineTo(W - m, H - m); g.lineTo(W / 2, H / 2); g.closePath(); g.fillStyle = v ? '#5a5e5c' : '#4e5440'; g.fill(); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(m, m); g.lineTo(W - m, H - m); g.moveTo(W - m, m); g.lineTo(m, H - m); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 1; for (let k = 0; k < 8; k++) { const t = (k + 1) / 9; g.beginPath(); g.moveTo(m + (W / 2 - m) * t, m + (H / 2 - m) * t); g.lineTo(W - m - (W / 2 - m) * t, m + (H / 2 - m) * t); g.stroke(); }
  g.strokeStyle = 'rgba(20,18,14,0.7)'; g.lineWidth = 2; g.strokeRect(m, m, W - m * 2, H - m * 2);
  ellipse(g, W - 10, H - 10, 4, 4, '#ccc6a0', { lw: 1 }); // searchlight
  void R;
}) };
D.booth = { w: 50, h: 50, elev: 12, fit: 'contain', orient: 'any', variants: [(g, W, H) => {
  // checkpoint booth: flat roof with overhang, AC unit, vent
  plainBox(g, 0, 0, W, H, 3, '#6a6c62', 950, { amt: 0.08, light: 0.2 });
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.5; g.strokeRect(5, 5, W - 10, H - 10);
  metalBox(g, W * 0.15, H * 0.18, 26, 20, 2, '#8a8c86', 951, {});
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; g.beginPath(); g.arc(W * 0.15 + 13, H * 0.18 + 10, 7, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(200,160,40,0.7)'; for (let x = 4; x < W - 4; x += 10) g.fillRect(x, H - 6, 5, 3);
  ellipse(g, W * 0.75, H * 0.7, 4, 4, '#4a4c48', { lw: 1 });
}] };
D.fountain = { w: 110, h: 110, elev: 4, fit: 'contain', orient: 'any', variants: [0, 1].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  const cx = W / 2, cy = H / 2, r = W / 2 - 2;
  // outer stone rim
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); litFill(g, 0, 0, W, H, '#7a776e', { radial: true, light: 0.25, paint: (q) => texRect(q, 0, 0, W, H, noiseShader('#7a776e', 960 + v, 6, 0.14)) });
  // water basin (murky)
  g.beginPath(); g.arc(cx, cy, r - 14, 0, TAU);
  const wg = g.createRadialGradient(cx - 20, cy - 20, 5, cx, cy, r);
  wg.addColorStop(0, v ? '#4a5444' : '#3e5660'); wg.addColorStop(1, v ? '#2a3226' : '#22343c');
  g.fillStyle = wg; g.fill();
  innerShadow(g, () => { g.beginPath(); g.arc(cx, cy, r - 14, 0, TAU); }, 10, 0.6, 4, 5);
  // algae / floating leaves, ripple highlights
  for (let k = 0; k < 14; k++) { const a = R.range(0, TAU), d = R.range(r * 0.35, r - 18); g.fillStyle = R.pick(['rgba(90,80,40,0.6)', 'rgba(70,90,50,0.5)']); g.beginPath(); g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 3, 1.8, a, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(200,220,220,0.18)'; g.lineWidth = 1.2; for (const k of [0.45, 0.6]) { g.beginPath(); g.arc(cx, cy, r * k, Math.PI * 1.05, Math.PI * 1.45); g.stroke(); }
  // central tier
  g.beginPath(); g.arc(cx, cy, r * 0.3, 0, TAU); litFill(g, cx - r * 0.3, cy - r * 0.3, r * 0.6, r * 0.6, '#85827a', { radial: true, light: 0.3 });
  g.beginPath(); g.arc(cx, cy, r * 0.2, 0, TAU); g.fillStyle = v ? '#3a4436' : '#3a525c'; g.fill();
  g.beginPath(); g.arc(cx, cy, r * 0.08, 0, TAU); litFill(g, cx - 5, cy - 5, 10, 10, '#8a877e', { radial: true, light: 0.4, lw: 1 });
}) };
D.statue = { w: 110, h: 110, elev: 10, fit: 'contain', orient: 'any', variants: [(g, W, H, R) => {
  const cx = W / 2, cy = H / 2;
  // stepped plinth
  for (const [m, col] of [[0, '#6a675f'], [14, '#77746b'], [26, '#827f75']] as [number, string][]) plainBox(g, m, m, W - m * 2, H - m * 2, 3, col, 970 + m, { amt: 0.12, light: 0.22 });
  // bronze figure seen from above (verdigris): shoulders, head, raised arm
  g.save(); g.translate(cx, cy); g.rotate(-0.3);
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(6, 8, 20, 12, 0, 0, TAU); g.fill();
  ellipse(g, 0, 0, 19, 11, '#4e6a5e', { light: 0.35 });
  ellipse(g, 0, 0, 8, 8, '#5a7a6c', { light: 0.4 });
  g.fillStyle = '#4a6458'; rrPath(g, 14, -18, 8, 22, 4); g.fill(); ellipse(g, 18, -20, 4.5, 4.5, '#5a7a6c', { lw: 1 });
  g.fillStyle = 'rgba(220,220,200,0.35)'; for (let k = 0; k < 6; k++) g.fillRect(R.range(-15, 15), R.range(-8, 8), 1.5, 1.5); // bird droppings
  g.restore();
}] };
D.safe = { w: 40, h: 40, elev: 8, orient: 'any', back: 'n', variants: ['#4a4c4c', '#3e4440', '#5a5450'].map((c, i) => (g: Ctx, W: number, H: number) => {
  metalBox(g, 0, 0, W, H, 3, c, 980 + i, { light: 0.25, dark: 0.35, bevel: 3 });
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.2; rrPath(g, 5, 5, W - 10, H - 12, 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.08)'; rrPath(g, 6, 6, W - 10, H - 12, 2); g.stroke();
  // door front edge with dial + handle
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(2, H - 6, W - 4, 2);
  ellipse(g, W * 0.35, H - 3, 4, 3, '#a8a69c', { lw: 1 }); handle(g, W * 0.6, H - 4.5, 10, 3);
}) };
D.locker = { w: 30, h: 22, elev: 9, back: 'n', variants: ['#4a5a6a', '#5a6458', '#6a6a66', '#5a4a3e'].map((c, i) => (g: Ctx, W: number, H: number, R: Rng) => {
  metalBox(g, 0, 0, W, H, 1.5, c, 990 + i, { light: 0.22 });
  g.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = 5; x < W - 5; x += 3) g.fillRect(x, 4, 1.5, 4);
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(1, H - 4, W - 2, 1.5);
  handle(g, W - 9, H - 3.5, 5, 2.5);
  if (R.chance(0.5)) smallBox(g, 4, H * 0.45, 10, 6, '#3a3c3a');
}) };
D.medcab = { w: 50, h: 24, elev: 7, back: 'n', variants: [0, 1].map((v) => (g: Ctx, W: number, H: number) => {
  plainBox(g, 0, 0, W, H, 2, v ? '#9a9c96' : '#a8a8a0', 1000 + v, { amt: 0.05, light: 0.25 });
  const s = Math.min(W, H) * 0.42, cx = W / 2, cy = H * 0.45;
  g.fillStyle = '#8a2a24'; g.fillRect(cx - s / 2, cy - s / 6, s, s / 3); g.fillRect(cx - s / 6, cy - s / 2, s / 3, s);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(2, H - 4, W - 4, 1.5);
  handle(g, W * 0.7, H - 3.5, 7, 2.5);
}) };
D.gunrack = { w: 60, h: 18, elev: 6, back: 'n', variants: [0, 1].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  woodBox(g, 0, 0, W, H, 2, v ? pal.woodDark : '#5a3e2a', 1010 + v, { vertical: false });
  // rifles standing in the rack, seen from above: muzzles + stocks in slots
  const n = 4;
  for (let i = 0; i < n; i++) {
    const x = 6 + i * ((W - 12) / n) + 3;
    if (R.chance(0.2)) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, 3, 6, H - 6); continue; }
    rrPath(g, x, 2, 7, H - 4, 3); litFill(g, x, 2, 7, H - 4, R.pick(['#5a3a24', '#3a2a1e']), { lw: 1, light: 0.25 });
    rrPath(g, x + 1.5, 3, 4, H * 0.45, 1); litFill(g, x + 1.5, 3, 4, H * 0.45, '#2a2c2e', { lw: 0.8, light: 0.35, bevel: 0.5 });
  }
}) };
D.guncase = { w: 80, h: 30, elev: 6, fit: 'nine', slice: 10, variants: [0, 1, 2].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  // glass-topped display case with weapons inside
  woodBox(g, 0, 0, W, H, 2, v === 2 ? '#3e3a36' : pal.woodDark, 1020 + v, { vertical: false });
  rrPath(g, 5, 5, W - 10, H - 10, 1); g.fillStyle = '#4a4232'; g.fill();
  g.fillStyle = 'rgba(120,40,30,0.25)'; g.fillRect(5, 5, W - 10, H - 10); // felt
  // guns lying inside
  const n = Math.max(1, Math.round((W - 10) / 34));
  for (let i = 0; i < n; i++) {
    if (v === 1 && R.chance(0.5)) continue;
    const x = 9 + i * ((W - 18) / n), w = (W - 18) / n - 6, y = H / 2;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 1, y - 1, w, 4);
    g.fillStyle = '#2a2c2e'; g.fillRect(x, y - 2, w * 0.7, 3);
    g.fillStyle = R.pick(['#5a3a24', '#2a2a2a', '#4a3a28']); g.beginPath(); g.moveTo(x + w * 0.65, y - 3); g.lineTo(x + w, y - 4); g.lineTo(x + w, y + 3); g.lineTo(x + w * 0.65, y + 2); g.fill();
    g.fillStyle = '#2a2c2e'; g.fillRect(x + w * 0.45, y + 1, 3, 5);
  }
  // glass with reflection streaks (cracked on v1)
  g.fillStyle = 'rgba(170,200,210,0.16)'; g.fillRect(5, 5, W - 10, H - 10);
  g.fillStyle = 'rgba(230,240,245,0.22)'; g.beginPath(); g.moveTo(10, 5); g.lineTo(22, 5); g.lineTo(14, H - 5); g.lineTo(2 + 5, H - 5); g.fill();
  if (v === 1) { g.strokeStyle = 'rgba(230,240,245,0.5)'; g.lineWidth = 0.8; const cx = W * 0.6, cy = H * 0.45; for (let k = 0; k < 7; k++) { const a = R.range(0, TAU); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R.range(6, 16), cy + Math.sin(a) * R.range(4, 10)); g.stroke(); } }
}) };
D.toolbox = { w: 48, h: 24, elev: 6, back: 'n', variants: ['#7a2a24', '#2e4a6a', '#8a7a2a'].map((c, i) => (g: Ctx, W: number, H: number, R: Rng) => {
  metalBox(g, 0, 0, W, H, 3, c, 1030 + i, { light: 0.3 });
  // lid with handle + tools on top
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(3, H * 0.35, W - 6, 1.2);
  handle(g, W * 0.3, H * 0.15, W * 0.4, 3.5);
  if (R.chance(0.7)) { g.save(); g.translate(W * 0.6, H * 0.65); g.rotate(R.range(-0.3, 0.3)); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-13, -1, 26, 4); g.fillStyle = '#8a8c8e'; g.fillRect(-14, -2, 20, 3); g.fillStyle = '#7a2a20'; g.fillRect(4, -2.5, 10, 4); g.restore(); }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(2, H - 4, W - 4, 1.5);
}) };
D.cart = { w: 50, h: 22, elev: 5, variants: [0, 1].map((v) => (g: Ctx, W: number, H: number, R: Rng) => {
  // medical supply cart: plastic top tray + drawers handle + supplies
  for (const [x, y] of [[3, 3], [W - 3, 3], [3, H - 3], [W - 3, H - 3]]) { g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(x, y, 2.5, 0, TAU); g.fill(); }
  plainBox(g, 2, 1, W - 4, H - 2, 3, v ? '#8a9a9c' : '#a8aca4', 1040 + v, { amt: 0.04, light: 0.3 });
  rrPath(g, 5, 4, W - 10, H - 8, 2); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
  smallBox(g, 8, 6, 10, 8, '#c8c4b8'); ellipse(g, 25, 10, 3, 3, '#a03a30', { lw: 0.8 });
  smallBox(g, 30, 6, 8, 10, '#5a7a8a');
  g.fillStyle = '#c0c4c4'; g.fillRect(0, H / 2 - 1.5, 3, 3); void R;
}) };
D.monitor = { w: 30, h: 30, elev: 9, fit: 'contain', orient: 'any', variants: [(g, W, H) => {
  // IV / vitals monitor pole: wheeled base star + monitor head
  g.strokeStyle = '#2a2c2e'; g.lineWidth = 2.5; for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; g.beginPath(); g.moveTo(W / 2, H / 2); g.lineTo(W / 2 + Math.cos(a) * W * 0.42, H / 2 + Math.sin(a) * H * 0.42); g.stroke(); }
  rrPath(g, W * 0.2, H * 0.28, W * 0.6, H * 0.44, 3); litFill(g, W * 0.2, H * 0.28, W * 0.6, H * 0.44, '#c4c6c0', { light: 0.3 });
  g.fillStyle = '#1a2a24'; g.fillRect(W * 0.26, H * 0.34, W * 0.48, H * 0.18);
  g.strokeStyle = '#5ad08a'; g.lineWidth = 1; g.beginPath(); g.moveTo(W * 0.27, H * 0.44); g.lineTo(W * 0.4, H * 0.44); g.lineTo(W * 0.44, H * 0.36); g.lineTo(W * 0.48, H * 0.48); g.lineTo(W * 0.72, H * 0.44); g.stroke();
}] };

/** subs whose legacy name differs or that should reuse another sprite */
const ALIAS: Record<string, string> = { couch: 'sofa', container: 'ship', cabinet_kitchen: 'cabinet' };

export function buildFurniture(reg: Registry) {
  for (const [sub, d] of Object.entries(D)) {
    const vs = d.variants.map((fn, i) => sprite(d.w, d.h, fn, { elev: d.elev, seed: (sub.length * 977 + i * 131) >>> 0 }));
    const e: any = { fit: d.fit ?? 'stretch', nativeSize: [d.w, d.h], orient: d.orient ?? 'h', elev: d.elev };
    if (d.back) e.back = d.back;
    if (d.slice) { const s = d.slice + vs[0].pad * 2; e.slice = [s, s, s, s]; }
    reg.add(`furniture:${sub}`, A, `prop_${sub}`, vs, e);
  }
  for (const [a, b] of Object.entries(ALIAS)) reg.alias(`furniture:${a}`, `furniture:${b}`);
  void rng; void blobPath; void box;
}
export const FURNITURE_SUBS = () => [...Object.keys(D), ...Object.keys(ALIAS)];
