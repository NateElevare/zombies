// art/env/tiles.ts — seamless 128×128 ground / floor / roof tiles (64 world px), 4+ variants per material.
// Variants of one material share their border band (shared noise + shared border-crossing elements) so any
// variant can sit next to any other without seams; per-variant detail is windowed into the interior.
import { canvas, rng, type Canvas, type Ctx, type Rng } from '../lib/core';
import {
  tnoise, tnoise2, edgeWindow, shadePixels, modPixels, scatter, wrapDraw, crack, blobPath, TAU, C, mixRGB, css,
  clamp01, smooth, lerp, type RGB,
} from '../lib/materials';

export const TS = 128;
const VARIANTS = 4;

type TileFn = (v: number) => Canvas;
const hashStr = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

function speck(R: Rng, amt: number) { return 1 + (R.next() - 0.5) * amt; }

/** Base field = shared noise everywhere + variant noise windowed inside. Returns a 0..1 sampler. */
function field(seed: number, v: number, cells: number, varAmt = 0.3, margin = 44) {
  const a = tnoise(seed, cells), b = tnoise(seed + 101 + v * 37, cells);
  return (x: number, y: number, oct = 4) => {
    const w = edgeWindow(x, y, TS, margin) * varAmt;
    // variance-preserving blend (a plain lerp flattens contrast in the interior => visible tile grid)
    const p = a(x, y, oct) - 0.5, q = b(x, y, oct) - 0.5;
    return 0.5 + (p * (1 - w) + q * w) / Math.sqrt((1 - w) * (1 - w) + w * w);
  };
}

// ------------------------------------------------------------------ ground
function asphalt(seed: number, cracked: boolean): TileFn {
  // No distinctive one-off features: everything is either per-pixel aggregate or a SOFT low-frequency field.
  // Each variant gets its own broad wear/tone blotch (windowed, so edges stay shared) to break long-road rhythm.
  return (v) => {
    const { c, g } = canvas(TS, TS);
    const big = field(seed, v, 4, 0.55, 40), mid = field(seed + 1, v, 12, 0.5, 30), R = rng(seed * 31 + v);
    const wear = tnoise(seed + 50 + v * 13, 2); // variant-only broad tone, windowed below
    const dark = C('#2a2c2e'), light = C('#38393b'), warm = C('#363431');
    const Q = rng(seed * 7 + v * 13 + 3);
    const tone = [-0.035, 0.03, -0.01, 0.045][v % 4];
    shadePixels(c, (x, y) => {
      const b = big(x, y), m = mid(x, y, 3);
      let col = mixRGB(dark, light, clamp01(b * 1.1 - 0.05));
      col = mixRGB(col, warm, clamp01((m - 0.55) * 1.2) * 0.6);
      const w = edgeWindow(x, y, TS, 40);
      const lf = 1 + w * (tone + (wear(x, y, 2) - 0.5) * 0.08);
      const r = R.next();
      // fine aggregate: small, low-contrast specks (reads as grain, not salt)
      const k = r < 0.035 ? 1.18 + R.next() * 0.12 : r < 0.1 ? 0.82 : 1 + (R.next() - 0.5) * 0.12;
      return [col[0] * k * lf, col[1] * k * lf, col[2] * k * lf];
    });
    if (cracked) {
      // hairline cracks only, low contrast, positions differ per variant, kept off the border
      const n = 1 + (v % 2);
      for (let i = 0; i < n; i++) {
        g.save(); g.globalAlpha = 0.45;
        crack(g, Q.range(34, 94), Q.range(34, 94), Q.range(0, TAU), Q.range(14, 26), Q, 0.9);
        g.restore();
      }
      // faint fine-crazing field (windowed) instead of tar snakes / square patches
      const cz = tnoise(seed + 77 + v, 16);
      modPixels(c, (x, y, d, i) => {
        const e = cz(x, y, 2), w = edgeWindow(x, y, TS, 30);
        if (Math.abs(e - 0.5) < 0.012 * w) { d[i] *= 0.82; d[i + 1] *= 0.82; d[i + 2] *= 0.82; }
      });
    }
    return c;
  };
}

/** concrete slab (sidewalk / parking / concrete floor). Joint = sawcut on the tile border. */
function concrete(seed: number, base: string, opts: { joint?: number; broom?: number; oil?: boolean; polish?: boolean; stain?: number } = {}): TileFn {
  return (v) => {
    const { c, g } = canvas(TS, TS);
    const big = field(seed, v, 3), mid = field(seed + 1, v, 10), fine = tnoise2(seed + 3, 64, 4), R = rng(seed * 17 + v);
    const b = C(base);
    shadePixels(c, (x, y) => {
      const m = big(x, y), n = mid(x, y, 3);
      let k = 0.86 + m * 0.24 + (n - 0.5) * 0.12;
      if (opts.broom) k += (fine(x, y, 2) - 0.5) * opts.broom;
      // tooled smooth margin near the joints
      const dEdge = Math.min(x, y, TS - x, TS - y);
      if (opts.joint && dEdge < 7) k += 0.035 * (1 - dEdge / 7);
      k *= speck(R, opts.polish ? 0.04 : 0.1);
      // pores
      if (R.next() < 0.012) k *= 0.7;
      const warm = (n - 0.5) * 6;
      return [b[0] * k + warm, b[1] * k + warm * 0.6, b[2] * k];
    });
    const Q = rng(seed * 3 + v * 11 + 1);
    // stains (windowed interior)
    const nst = opts.stain ?? 2;
    for (let i = 0; i < nst; i++) {
      const x = Q.range(30, 98), y = Q.range(30, 98), r = Q.range(8, 20);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const a = Q.range(0.05, 0.12);
      gr.addColorStop(0, `rgba(30,28,22,${a})`); gr.addColorStop(1, 'rgba(30,28,22,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * Q.range(0.6, 1), Q.range(0, 3), 0, TAU); g.fill();
    }
    if (opts.oil) {
      const n = v === 0 ? 0 : Q.int(1, 2);
      for (let i = 0; i < n; i++) {
        const x = Q.range(36, 92), y = Q.range(36, 92);
        g.save(); blobPath(g, x, y, Q.range(8, 16), Q.range(6, 12), Q, 0.35, 16, Q.range(0, 3));
        const gr = g.createRadialGradient(x, y, 0, x, y, 18);
        gr.addColorStop(0, 'rgba(10,10,12,0.55)'); gr.addColorStop(0.7, 'rgba(14,14,16,0.35)'); gr.addColorStop(1, 'rgba(20,20,20,0.12)');
        g.fillStyle = gr; g.fill(); g.restore();
        for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(12,12,14,0.3)'; g.beginPath(); g.arc(x + Q.range(-22, 22), y + Q.range(-18, 18), Q.range(1, 3), 0, TAU); g.fill(); }
      }
    }
    if (v === 3 || (v === 1 && !opts.polish)) crack(g, Q.range(36, 92), Q.range(36, 92), Q.range(0, TAU), Q.range(20, 38), Q, 1.1);
    if (opts.joint) {
      const jw = opts.joint;
      // groove: dark core, lit far wall (bottom / right), shadowed near edge
      const line = (horiz: boolean) => {
        const f = (o: number, w: number, col: string) => {
          g.fillStyle = col;
          if (horiz) { g.fillRect(0, o, TS, w); g.fillRect(0, TS + o, TS, w); } else { g.fillRect(o, 0, w, TS); g.fillRect(TS + o, 0, w, TS); }
        };
        f(-jw / 2, jw, 'rgba(18,17,15,0.75)');
        f(jw / 2, 1, 'rgba(230,225,210,0.16)');
        f(-jw / 2 - 1, 1, 'rgba(0,0,0,0.18)');
      };
      line(true); line(false);
    }
    return c;
  };
}

function grass(seed: number, dry: boolean): TileFn {
  return (v) => {
    const { c, g } = canvas(TS, TS);
    const big = field(seed, v, 5), mid = field(seed + 1, v, 10), R = rng(seed + v);
    const g0 = C(dry ? '#46452c' : '#2c3522'), g1 = C(dry ? '#655e3e' : '#465030'), soil = C(dry ? '#4a3d2c' : '#3a3224');
    shadePixels(c, (x, y) => {
      const b = big(x, y), m = mid(x, y, 3);
      let col = mixRGB(g0, g1, clamp01(b * 1.4 - 0.2));
      const bare = clamp01((m - (dry ? 0.5 : 0.6)) * 4);
      col = mixRGB(col, soil, bare * (dry ? 0.75 : 0.55));
      const k = speck(R, 0.35);
      return [col[0] * k, col[1] * k, col[2] * k];
    });
    // blades: short strokes, many layers (dark first, light tips last)
    const sh = rng(seed + 50), vr = rng(seed + 60 + v * 3);
    const pal = dry ? ['#5a5636', '#6e6842', '#7c7448', '#4c4a30', '#857a4c', '#5e5a3a'] : ['#283220', '#323d26', '#3c472b', '#465032', '#3a4229', '#535a3a'];
    for (let layer = 0; layer < 3; layer++) {
      scatter(TS, sh, vr, layer === 2 ? 260 : 340, (Q) => Q.range(2.5, 5.5), (x, y, r, Q) => {
        const a = -Math.PI / 2 + Q.range(-1.3, 1.3) + (Q.chance(0.5) ? Math.PI : 0) * 0.0;
        const col = pal[Math.min(pal.length - 1, Q.int(layer * 2, layer * 2 + 1))];
        g.strokeStyle = col; g.globalAlpha = 0.6; g.lineWidth = Q.range(0.7, 1.3); g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.4) * r * 0.5, y + Math.sin(a + 0.4) * r * 0.5, x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
        g.globalAlpha = 1;
      });
    }
    // little clover / weed clumps and dry stalks
    scatter(TS, rng(seed + 70), rng(seed + 80 + v), 8, (Q) => Q.range(3, 5), (x, y, r, Q) => {
      for (let i = 0; i < 4; i++) {
        const a = Q.range(0, TAU);
        g.fillStyle = dry ? 'rgba(110,100,62,0.55)' : 'rgba(70,88,48,0.6)';
        g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.45, r * 0.3, a, 0, TAU); g.fill();
      }
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.arc(x + 1, y + 1.2, r * 0.4, 0, TAU); g.fill();
    });
    return c;
  };
}

function dirt(seed: number): TileFn {
  return (v) => {
    const { c, g } = canvas(TS, TS);
    const big = field(seed, v, 3), mid = field(seed + 1, v, 10), R = rng(seed + v);
    const d0 = C('#3a3024'), d1 = C('#54473a');
    shadePixels(c, (x, y) => {
      const col = mixRGB(d0, d1, clamp01(big(x, y) * 1.3 - 0.15 + (mid(x, y, 3) - 0.5) * 0.5));
      const k = speck(R, 0.22);
      return [col[0] * k, col[1] * k, col[2] * k];
    });
    pebbles(g, seed + 5, v, 60, 0.6, 2.2, ['#6a6050', '#5a5246', '#4a4238', '#7a7062']);
    // dried cracks / footprints-ish depressions
    const Q = rng(seed + 33 + v);
    for (let i = 0; i < 3; i++) {
      const x = Q.range(30, 98), y = Q.range(30, 98);
      const gr = g.createRadialGradient(x - 2, y - 2, 0, x, y, 12);
      gr.addColorStop(0, 'rgba(0,0,0,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 12, 8, Q.range(0, 3), 0, TAU); g.fill();
    }
    return c;
  };
}

function pebbles(g: Ctx, seed: number, v: number, n: number, r0: number, r1: number, pal: string[]) {
  scatter(TS, rng(seed), rng(seed + 1 + v * 19), n, (Q) => Q.range(r0, r1), (x, y, r, Q) => {
    const col = Q.pick(pal), ry = r * Q.range(0.6, 1), rot = Q.range(0, 3);
    g.fillStyle = 'rgba(10,8,6,0.45)'; g.beginPath(); g.ellipse(x + r * 0.35, y + r * 0.45, r, ry, rot, 0, TAU); g.fill();
    g.fillStyle = col; g.beginPath(); g.ellipse(x, y, r, ry, rot, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,250,235,0.22)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.45, ry * 0.4, rot, 0, TAU); g.fill();
  });
}

/** Pebble bed as a tileable cellular (Worley) field: soft lit pebbles, dark gaps, low contrast.
 *  Cell layout is shared by all variants; only interior cell tones vary per variant (seamless). */
function gravel(seed: number, base: string, pal: string[], cells: number, contrast = 0.1, gapDark = 0.62): TileFn {
  const n = cells, cs = TS / n;
  const SH = rng(seed);
  const px: number[] = [], py: number[] = [], shTone: number[] = [], shCol: number[] = [];
  for (let i = 0; i < n * n; i++) { px.push(SH.range(0.05, 0.95)); py.push(SH.range(0.05, 0.95)); shTone.push(SH.range(-1, 1)); shCol.push(SH.int(0, pal.length - 1)); }
  const palC = pal.map(C), b = C(base);
  return (v) => {
    const { c } = canvas(TS, TS);
    const Q = rng(seed + 100 + v * 31), R = rng(seed + 7 + v), big = field(seed + 3, v, 3, 0.5, 40);
    const tone = shTone.slice(), colI = shCol.slice();
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (i > 1 && j > 1 && i < n - 2 && j < n - 2) { tone[j * n + i] = Q.range(-1, 1); colI[j * n + i] = Q.int(0, pal.length - 1); }
    shadePixels(c, (x, y) => {
      const ci = Math.floor(x / cs), cj = Math.floor(y / cs);
      let f1 = 1e9, f2 = 1e9, best = 0, bdx = 0, bdy = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = ci + di, jj = cj + dj, wi = ((ii % n) + n) % n, wj = ((jj % n) + n) % n, id = wj * n + wi;
        const qx = (ii + px[id]) * cs, qy = (jj + py[id]) * cs, dx = x - qx, dy = y - qy, d = Math.hypot(dx, dy);
        if (d < f1) { f2 = f1; f1 = d; best = id; bdx = dx; bdy = dy; } else if (d < f2) f2 = d;
      }
      const edge = f2 - f1;
      const inPebble = smooth(0.2, 3.2, edge) * 0.85 + 0.15 * smooth(0, 1, edge);
      // soft dome shading: lit toward the top-left of each pebble, darker bottom-right
      const lit = -(bdx + bdy) / (cs * 1.2);
      const pc = palC[colI[best]];
      const k = (1 + tone[best] * contrast + lit * 0.14) * (0.9 + big(x, y, 3) * 0.2) * (1 + (R.next() - 0.5) * 0.05);
      const gap = gapDark * (0.9 + big(x, y, 3) * 0.2);
      return [lerp(b[0] * gap, pc[0] * k, inPebble), lerp(b[1] * gap, pc[1] * k, inPebble), lerp(b[2] * gap, pc[2] * k, inPebble)];
    });
    return c;
  };
}

function forestFloor(seed: number): TileFn {
  return (v) => {
    const { c, g } = canvas(TS, TS);
    const big = field(seed, v, 3), mid = field(seed + 1, v, 9), R = rng(seed + v);
    const e0 = C('#241e16'), e1 = C('#3a3022'), moss = C('#33402a');
    shadePixels(c, (x, y) => {
      let col = mixRGB(e0, e1, clamp01(big(x, y) * 1.3 - 0.1));
      col = mixRGB(col, moss, clamp01((mid(x, y, 3) - 0.58) * 3) * 0.6);
      const k = speck(R, 0.25);
      return [col[0] * k, col[1] * k, col[2] * k];
    });
    // needles
    scatter(TS, rng(seed + 20), rng(seed + 21 + v), 140, (Q) => Q.range(3, 6), (x, y, r, Q) => {
      const a = Q.range(0, TAU);
      g.strokeStyle = Q.pick(['rgba(110,84,52,0.7)', 'rgba(90,70,44,0.7)', 'rgba(130,100,62,0.6)', 'rgba(70,60,40,0.7)']);
      g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
    });
    // fallen leaves (with shadow, midrib)
    scatter(TS, rng(seed + 30), rng(seed + 31 + v), 34, (Q) => Q.range(3, 5.5), (x, y, r, Q) => {
      const a = Q.range(0, TAU), col = Q.pick(['#5e4426', '#6e5230', '#4e4a2a', '#7a5a32', '#5a3a22', '#635a34']);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 1, y + 1.2, r, r * 0.5, a, 0, TAU); g.fill();
      g.fillStyle = col; g.beginPath(); g.ellipse(x, y, r, r * 0.5, a, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(30,22,12,0.45)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
      g.fillStyle = 'rgba(255,240,200,0.10)'; g.beginPath(); g.ellipse(x - 0.6, y - 0.6, r * 0.6, r * 0.25, a, 0, TAU); g.fill();
    });
    // twigs
    scatter(TS, rng(seed + 40), rng(seed + 41 + v), 5, (Q) => Q.range(6, 10), (x, y, r, Q) => {
      const a = Q.range(0, TAU);
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - Math.cos(a) * r + 1, y - Math.sin(a) * r + 1); g.lineTo(x + Math.cos(a) * r + 1, y + Math.sin(a) * r + 1); g.stroke();
      g.strokeStyle = '#4a3a28'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
    });
    return c;
  };
}

// ------------------------------------------------------------------ interior floors
function woodFloor(seed: number, base: string): TileFn {
  const ROWS = 8, PH = TS / ROWS;
  return (v) => {
    const { c, g } = canvas(TS, TS);
    const sh = rng(seed), Q = rng(seed + 100 + v * 7);
    const b = C(base);
    // per row: shared edge tone; interior segments variant tones, joints at variant positions
    const rows: { joints: number[]; tones: number[] }[] = [];
    for (let r = 0; r < ROWS; r++) {
      const edgeTone = sh.range(-0.18, 0.18);
      const nj = Q.int(1, 2), joints: number[] = [];
      for (let k = 0; k < nj; k++) joints.push(Q.range(18 + k * 50, 60 + k * 50));
      joints.sort((a, b2) => a - b2);
      const tones = [edgeTone]; for (let k = 1; k < nj; k++) tones.push(Q.range(-0.18, 0.18)); tones.push(edgeTone);
      rows.push({ joints, tones });
    }
    const grainN = tnoise2(seed + 5, 3, 16), fineN = tnoise2(seed + 6, 16, 64), dirtN = field(seed + 9, v, 4);
    const R = rng(seed + v);
    shadePixels(c, (x, y) => {
      const r = Math.floor(y / PH), ly = y - r * PH, row = rows[r];
      let seg = 0; while (seg < row.joints.length && x > row.joints[seg]) seg++;
      const tone = row.tones[seg];
      const warp = grainN(x, y, 3) * 10;
      const lines = Math.sin((y + warp) * 2.1 + r * 1.7) * 0.5 + 0.5;
      let k = 1 + tone + (lines - 0.5) * 0.26 + (fineN(x, y, 2) - 0.5) * 0.18;
      // plank edge bevel: top highlight, bottom shadow
      if (ly < 1) k *= 1.12; else if (ly >= PH - 1) k *= 0.55; else if (ly >= PH - 2) k *= 0.85;
      // traffic wear / grime
      k *= 0.9 + dirtN(x, y, 3) * 0.2;
      k *= speck(R, 0.05);
      return [b[0] * k, b[1] * k * 0.98, b[2] * k * 0.95];
    });
    // butt joints + nail holes
    rows.forEach((row, r) => {
      for (const jx of row.joints) {
        g.fillStyle = 'rgba(12,8,4,0.7)'; g.fillRect(jx - 0.5, r * PH, 1.2, PH - 1);
        g.fillStyle = 'rgba(255,230,200,0.08)'; g.fillRect(jx + 0.8, r * PH, 1, PH - 1);
      }
      for (const nx of [...row.joints.map((j) => j - 3), ...row.joints.map((j) => j + 3)]) {
        g.fillStyle = 'rgba(15,10,6,0.6)';
        g.fillRect(nx, r * PH + 3, 1, 1); g.fillRect(nx, r * PH + PH - 5, 1, 1);
      }
    });
    // scratches
    for (let i = 0; i < 5; i++) {
      const x = Q.range(20, 100), y = Q.range(20, 100), a = Q.range(-0.4, 0.4);
      g.strokeStyle = 'rgba(200,180,150,0.08)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); g.stroke();
    }
    return c;
  };
}

function ceramic(seed: number, base: string, n = 4, alt?: string): TileFn {
  const cell = TS / n;
  return (v) => {
    const { c, g } = canvas(TS, TS);
    const Q = rng(seed + v * 9), b = C(base), a2 = alt ? C(alt) : b;
    const tones: number[] = []; for (let i = 0; i < n * n; i++) tones.push(Q.range(-0.05, 0.05));
    const dirtN = field(seed + 2, v, 4), R = rng(seed + v);
    const gr = 2;
    shadePixels(c, (x, y) => {
      const i = Math.floor(x / cell), j = Math.floor(y / cell), lx = x - i * cell, ly = y - j * cell;
      const grout = lx < gr / 2 || lx >= cell - gr / 2 || ly < gr / 2 || ly >= cell - gr / 2;
      const d = dirtN(x, y, 3);
      if (grout) { const k = 0.42 + d * 0.15; return [b[0] * k, b[1] * k * 0.97, b[2] * k * 0.92]; }
      const col = (i + j) % 2 && alt ? a2 : b;
      let k = 1 + tones[j * n + i] + (d - 0.5) * 0.16;
      // glazed bevel: lit top-left inner edges
      const ex = lx - gr / 2, ey = ly - gr / 2, inner = cell - gr;
      if (ex < 1.5 || ey < 1.5) k *= 1.1; else if (ex > inner - 1.5 || ey > inner - 1.5) k *= 0.82;
      // soft specular sheen
      k += 0.05 * Math.max(0, 1 - Math.hypot(ex - inner * 0.3, ey - inner * 0.3) / (inner * 0.7));
      k *= speck(R, 0.035);
      return [col[0] * k, col[1] * k, col[2] * k];
    });
    // cracked tile / grime in the variant interior (only cells not touching the border)
    if (v > 0) {
      const ci = Q.int(1, n - 2), cj = Q.int(1, n - 2);
      crack(g, ci * cell + Q.range(4, cell - 4), cj * cell + 2, Math.PI / 2 + Q.range(-0.5, 0.5), cell * 0.9, Q, 0.9);
    }
    if (v === 2) { const ci = Q.int(1, n - 2), cj = Q.int(1, n - 2); g.fillStyle = 'rgba(40,34,24,0.25)'; g.fillRect(ci * cell + 1, cj * cell + 1, cell - 2, cell - 2); }
    return c;
  };
}

function carpet(seed: number, base: string): TileFn {
  return (v) => {
    const { c, g } = canvas(TS, TS);
    const b = C(base), big = field(seed, v, 3), mid = field(seed + 1, v, 14), R = rng(seed + v);
    const loop = tnoise(seed + 3, 64);
    shadePixels(c, (x, y) => {
      let k = 0.88 + big(x, y) * 0.2 + (mid(x, y, 3) - 0.5) * 0.14 + (loop(x, y, 2) - 0.5) * 0.25;
      k *= speck(R, 0.22);
      return [b[0] * k, b[1] * k, b[2] * k];
    });
    const Q = rng(seed + 7 + v * 5);
    if (v > 0) {
      const x = Q.range(36, 92), y = Q.range(36, 92), r = Q.range(10, 18);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(40,30,18,0.3)'); gr.addColorStop(0.8, 'rgba(40,30,18,0.18)'); gr.addColorStop(1, 'rgba(40,30,18,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 0.7, Q.range(0, 3), 0, TAU); g.fill();
    }
    return c;
  };
}

function linoleum(seed: number, a: string, b2: string): TileFn {
  return (v) => {
    const { c, g } = canvas(TS, TS);
    const A = C(a), B = C(b2), dirtN = field(seed, v, 4), R = rng(seed + v), cell = 32;
    shadePixels(c, (x, y) => {
      const i = Math.floor(x / cell), j = Math.floor(y / cell);
      const col = (i + j) % 2 ? A : B;
      let k = 0.9 + dirtN(x, y, 4) * 0.18;
      const lx = x % cell, ly = y % cell;
      if (lx === 0 || ly === 0) k *= 0.8;
      // fleck pattern typical of VCT tiles
      const r = R.next();
      if (r < 0.03) k *= 0.8; else if (r < 0.05) k *= 1.12;
      return [col[0] * k, col[1] * k, col[2] * k];
    });
    // scuffs (black heel marks) + glossy sheen streak
    const Q = rng(seed + 11 + v * 7);
    for (let i = 0; i < 4 + v; i++) {
      const x = Q.range(24, 104), y = Q.range(24, 104), a = Q.range(0, TAU), l = Q.range(3, 9);
      g.strokeStyle = 'rgba(20,18,16,0.35)'; g.lineWidth = Q.range(0.8, 1.6); g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.6, y + Math.sin(a + 0.5) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    return c;
  };
}

function diamondPlate(seed: number, base: string): TileFn {
  return (v) => {
    const { c, g } = canvas(TS, TS);
    const b = C(base), big = field(seed, v, 3), wear = field(seed + 1, v, 6), R = rng(seed + v), cell = 16;
    const metal = tnoise2(seed + 4, 64, 2);
    shadePixels(c, (x, y) => {
      let k = 0.85 + big(x, y) * 0.25 + (metal(x, y, 2) - 0.5) * 0.08;
      const i = Math.floor(x / cell), j = Math.floor(y / cell), lx = x - i * cell - cell / 2, ly = y - j * cell - cell / 2;
      const flip = (i + j) % 2 ? 1 : -1;
      // rotated lozenge: long axis ±45°
      const u = (lx + flip * ly) / Math.SQRT2, w = (lx - flip * ly) / Math.SQRT2;
      const d = (u * u) / 36 + (w * w) / 3;
      if (d < 1) {
        // raised lug, lit from top-left: brighten upper-left half, darken lower-right
        const s = (lx + ly) / 8;
        k *= 1.14 - s * 0.32;
        if (d > 0.7) k *= 0.92;
      } else if (d < 1.4) {
        // shadow down-right of the lug
        if (lx + ly > 0) k *= 0.8;
      }
      // paint wear: olive paint over bare steel
      const wv = wear(x, y, 4);
      const paint = wv < 0.7 ? 1 : 0;
      let col: RGB = paint ? b : [118, 118, 112];
      if (paint && wv > 0.62) col = mixRGB(b, [104, 102, 92], (wv - 0.62) * 8);
      k *= speck(R, 0.06);
      return [col[0] * k, col[1] * k, col[2] * k];
    });
    if (v >= 2) { // rust stain
      const Q = rng(seed + v), x = Q.range(40, 88), y = Q.range(40, 88);
      const gr = g.createRadialGradient(x, y, 0, x, y, 18);
      gr.addColorStop(0, 'rgba(96,52,24,0.35)'); gr.addColorStop(1, 'rgba(96,52,24,0)');
      g.fillStyle = gr; g.fillRect(x - 20, y - 20, 40, 40);
    }
    return c;
  };
}

// ------------------------------------------------------------------ roofs
function shingles(seed: number, base: string): TileFn {
  const RH = 16, TW = 32, ROWS = TS / RH;
  return (v) => {
    const { c, g } = canvas(TS, TS);
    const b = C(base), R = rng(seed + v), dirtN = field(seed + 3, v, 4), moss = field(seed + 4, v, 6, 1);
    // tab tones: tabs that are entirely inside get variant tones, otherwise shared
    const Q = rng(seed + 50 + v * 13), SH = rng(seed + 49);
    const tone = new Map<string, number>();
    for (let r = 0; r < ROWS; r++) for (let t = -1; t <= TS / TW; t++) {
      const off = (r % 2) * (TW / 2), x0 = t * TW + off;
      const shared = SH.range(-0.12, 0.12), own = Q.range(-0.14, 0.14);
      const inside = x0 >= 0 && x0 + TW <= TS && r > 0 && r < ROWS - 1;
      tone.set(r + ':' + (((t * TW + off) % TS + TS) % TS), inside ? own : shared);
    }
    shadePixels(c, (x, y) => {
      const r = Math.floor(y / RH), ly = y - r * RH, off = (r % 2) * (TW / 2);
      const tx = Math.floor((x - off) / TW), x0 = (((tx * TW + off) % TS) + TS) % TS, lx = (((x - off) % TW) + TW) % TW;
      let k = 1 + (tone.get(r + ':' + x0) ?? 0);
      // each row: top part is overlapped by the row above => gradient light at top, shadow line at the exposed bottom edge
      k *= 0.86 + (ly / RH) * 0.2;
      if (ly >= RH - 2) k *= 0.45; // shadow under the next tab's butt edge
      if (ly < 1) k *= 1.15;
      if (lx < 1) k *= 0.55; // keyway gap between tabs
      k *= 0.9 + dirtN(x, y, 3) * 0.2;
      k *= speck(R, 0.25); // granules
      let col: RGB = b;
      const m = moss(x, y, 4);
      if (m > 0.62) col = mixRGB(b, [70, 78, 52], Math.min(0.6, (m - 0.62) * 4));
      return [col[0] * k, col[1] * k, col[2] * k];
    });
    // a few missing / replaced tabs
    if (v === 3) { const x = Q.int(1, 2) * TW + 8, y = Q.int(2, 5) * RH; g.fillStyle = 'rgba(30,24,20,0.55)'; g.fillRect(x, y + 1, TW - 2, RH - 3); g.fillStyle = 'rgba(80,60,40,0.4)'; g.fillRect(x + 3, y + 3, TW - 8, 2); }
    return c;
  };
}

function tarRoof(seed: number): TileFn {
  // modified-bitumen membrane: soft mottling, roll seams with a lit lip, faint ponding stains; no speckle
  return (v) => {
    const { c, g } = canvas(TS, TS);
    const b = C('#303032'), big = field(seed, v, 3, 0.55, 40), mid = field(seed + 1, v, 8, 0.5, 30), R = rng(seed + v);
    const granule = tnoise(seed + 5, 64);
    shadePixels(c, (x, y) => {
      let k = 0.88 + big(x, y) * 0.22 + (mid(x, y, 3) - 0.5) * 0.08 + (granule(x, y, 1) - 0.5) * 0.05;
      k *= 1 + (R.next() - 0.5) * 0.04;
      const warm = (big(x, y) - 0.5) * 8;
      return [b[0] * k + warm, b[1] * k + warm * 0.7, b[2] * k];
    });
    for (const y of [0, 64]) {
      g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(0, y + 2, TS, 1.5);
      g.fillStyle = 'rgba(190,190,180,0.07)'; g.fillRect(0, y, TS, 2);
      if (y === 0) g.fillRect(0, TS, TS, 2);
    }
    const Q = rng(seed + 9 + v * 3);
    // dried ponding ring + a soft repair patch (low contrast, interior only)
    const px = Q.range(38, 90), py = Q.range(38, 90), pr = Q.range(14, 22);
    const gr = g.createRadialGradient(px, py, pr * 0.6, px, py, pr);
    gr.addColorStop(0, 'rgba(110,108,100,0.0)'); gr.addColorStop(0.85, 'rgba(110,108,100,0.045)'); gr.addColorStop(1, 'rgba(110,108,100,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(px, py, pr, pr * 0.75, Q.range(0, 3), 0, TAU); g.fill();
    if (v % 2) { const x = Q.range(26, 70), y = Q.range(14, 36); g.fillStyle = 'rgba(14,14,16,0.16)'; g.fillRect(x, y, 30, 18); g.strokeStyle = 'rgba(160,160,150,0.07)'; g.strokeRect(x + 0.5, y + 0.5, 29, 17); }
    return c;
  };
}

function metalRoof(seed: number, base: string): TileFn {
  return (v) => {
    const { c, g } = canvas(TS, TS);
    const b = C(base), big = field(seed, v, 3), rust = field(seed + 2, v, 6, 1), streak = tnoise2(seed + 3, 32, 2), R = rng(seed + v);
    const P = 16;
    shadePixels(c, (x, y) => {
      // corrugation profile (vertical ribs), lit from the left
      const ph = (x % P) / P;
      const slope = Math.cos(ph * TAU); // derivative of sin
      let k = 0.92 + slope * 0.16 + big(x, y) * 0.12 + (streak(x, y, 2) - 0.5) * 0.08;
      if (ph < 0.06) k *= 1.12;
      const ru = rust(x, y, 4) + (streak(x, y, 2) - 0.5) * 0.3;
      let col: RGB = b;
      if (ru > 0.66) col = mixRGB(b, [88, 62, 44], Math.min(0.6, (ru - 0.66) * 3));
      k *= speck(R, 0.02);
      return [col[0] * k, col[1] * k, col[2] * k];
    });
    // panel overlap seam on the tile border (horizontal) + screw rows
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, TS, 1.5); g.fillRect(0, TS - 1, TS, 1);
    g.fillStyle = 'rgba(230,230,220,0.15)'; g.fillRect(0, 1.5, TS, 1);
    for (let x = 8; x < TS; x += 16) for (const y of [5, 69]) {
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(x + 0.6, y + 0.6, 1.4, 0, TAU); g.fill();
      g.fillStyle = 'rgba(200,200,190,0.5)'; g.beginPath(); g.arc(x, y, 1.1, 0, TAU); g.fill();
    }
    return c;
  };
}

// ------------------------------------------------------------------ registry
export const TILE_MATERIALS: Record<string, TileFn> = {
  // ground
  asphalt: asphalt(hashStr('asphalt'), false),
  asphalt_cracked: asphalt(hashStr('asphalt'), true), // same base seed => edges match plain asphalt
  sidewalk: concrete(hashStr('sidewalk'), '#6d6c67', { joint: 2.2, broom: 0.08, stain: 2 }),
  grass: grass(hashStr('grass'), false),
  grass_dry: grass(hashStr('grass_dry'), true),
  dirt: dirt(hashStr('dirt')),
  gravel: gravel(hashStr('gravel'), '#272522', ['#56524b', '#4e4b45', '#5c574e', '#4a463f', '#534c42'], 20, 0.12, 0.74),
  forest_floor: forestFloor(hashStr('forest_floor')),
  parking: concrete(hashStr('parking'), '#5f5e5a', { joint: 1.6, oil: true, stain: 3 }),
  // interior floors
  wood: woodFloor(hashStr('wood'), '#58463a'),
  tile: ceramic(hashStr('tile'), '#8f8d84'),
  carpet: carpet(hashStr('carpet'), '#4a4a4c'),
  concrete: concrete(hashStr('concrete_floor'), '#5e5d58', { joint: 1.4, polish: true, stain: 3 }),
  linoleum: linoleum(hashStr('linoleum'), '#88857a', '#6c6c64'),
  military: diamondPlate(hashStr('military'), '#525744'),
  // roofs
  shingle_red: shingles(hashStr('shingle_red'), '#5e3229'),
  shingle_grey: shingles(hashStr('shingle_grey'), '#4a4b4d'),
  shingle_brown: shingles(hashStr('shingle_brown'), '#54402e'),
  flat_gravel: gravel(hashStr('flat_gravel'), '#33322f', ['#5e5c57', '#575550', '#64615b', '#53514c'], 28, 0.08, 0.8),
  flat_tar: tarRoof(hashStr('flat_tar')),
  metal: metalRoof(hashStr('metal_roof'), '#5c6266'),
};

export function buildTiles() {
  const frames: { name: string; canvas: Canvas; extrude: number }[] = [];
  const tiles: Record<string, string[]> = {};
  for (const [mat, fn] of Object.entries(TILE_MATERIALS)) {
    tiles[mat] = [];
    for (let v = 0; v < VARIANTS; v++) {
      const name = `tile_${mat}_${v}`;
      frames.push({ name, canvas: fn(v), extrude: 2 });
      tiles[mat].push(name);
    }
  }
  return { frames, tiles };
}
export { smooth };
