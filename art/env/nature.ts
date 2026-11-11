// art/env/nature.ts — trees (oak / pine × 3 sizes × 3 variants), bushes, rocks, grass tufts.
import { canvas, rng, ART_SCALE, type Ctx, type Rng, type Canvas } from '../lib/core';
import { TAU, pnoise, modPixels, withShadow, blobPath, litFill, texRect, noiseShader, C, mixRGB, css, type RGB } from '../lib/materials';
import { sprite, type Registry } from './prop';

const A = 'env_props2';
const LIGHT = { x: -0.62, y: -0.78 }; // direction TOWARD the light (top-left)

/** a leaf clump: soft blob, lit top-left, with leaf speckle on its lit side */
function clump(g: Ctx, x: number, y: number, r: number, col: RGB, R: Rng, leafy = 1) {
  // soft contact shadow on what is below
  (g as any).filter = `blur(${Math.max(1.5, r * 0.12)}px)`;
  g.fillStyle = 'rgba(6,10,4,0.35)'; blobPath(g, x + r * 0.2, y + r * 0.28, r * 0.98, r * 0.95, R, 0.18, 12); g.fill();
  (g as any).filter = 'none';
  const rot = R.range(0, 3), sq = R.range(0.85, 1);
  blobPath(g, x, y, r * 0.92, r * 0.92 * sq, R, 0.16, 14, rot);
  const gr = g.createRadialGradient(x + LIGHT.x * r * 0.4, y + LIGHT.y * r * 0.4, r * 0.05, x, y, r * 1.05);
  gr.addColorStop(0, css(mixRGB(col, [170, 185, 120], 0.18)));
  gr.addColorStop(0.6, css(col));
  gr.addColorStop(1, css([col[0] * 0.55, col[1] * 0.6, col[2] * 0.55]));
  g.fillStyle = gr; g.fill();
  // dense leaf texture: small leaves everywhere, shaded by facing; fringe leaves break the outline
  const n = Math.round(r * r * 0.32 * leafy);
  for (let i = 0; i < n; i++) {
    const a = R.range(0, TAU), d = (i % 4 === 0 ? R.range(0.85, 1.05) : Math.sqrt(R.next()) * 0.95) * r;
    const lx = x + Math.cos(a) * d, ly = y + Math.sin(a) * d;
    const lit = ((lx - x) * LIGHT.x + (ly - y) * LIGHT.y) / r; // -1..1
    const k = 0.78 + lit * 0.4 + R.range(-0.18, 0.18);
    let c: RGB = [col[0] * k, col[1] * k * 1.02, col[2] * k];
    if (lit > 0.35 && R.chance(0.3)) c = mixRGB(c, [175, 185, 120], 0.3);
    const lr = R.range(1.1, 2.3), ang = R.range(0, TAU);
    g.fillStyle = css(c, R.range(0.6, 0.95));
    g.beginPath(); g.ellipse(lx, ly, lr, lr * 0.6, ang, 0, TAU); g.fill();
  }
}

function oak(Dpx: number, seed: number, palette: RGB[], autumn: number) {
  return (g: Ctx, W: number, H: number, R: Rng) => {
    const cx = W / 2, cy = H / 2, Rr = W / 2;
    // a few branch tips peeking out at the rim
    g.strokeStyle = 'rgba(48,38,28,0.9)'; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const a = R.range(0, TAU); g.lineWidth = R.range(1.5, 3); g.beginPath(); g.moveTo(cx + Math.cos(a) * Rr * 0.5, cy + Math.sin(a) * Rr * 0.5); g.lineTo(cx + Math.cos(a + 0.2) * Rr * 0.98, cy + Math.sin(a + 0.2) * Rr * 0.98); g.stroke(); }
    // layers: big dark outer clumps -> smaller bright top clumps
    const layers = [{ n: 11, r: 0.36, d: 0.66, t: 0 }, { n: 8, r: 0.32, d: 0.48, t: 1 }, { n: 6, r: 0.28, d: 0.3, t: 2 }, { n: 3, r: 0.24, d: 0.12, t: 3 }];
    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        const a = (i / L.n) * TAU + R.range(-0.3, 0.3) + L.t, d = Rr * L.d * R.range(0.8, 1.05);
        const r = Rr * L.r * R.range(0.8, 1.15);
        let col = palette[Math.min(palette.length - 1, L.t + R.int(0, 1))];
        if (autumn > 0 && R.chance(autumn)) col = mixRGB(col, R.pick([[120, 90, 40], [110, 70, 36], [130, 110, 50]] as RGB[]), R.range(0.3, 0.7));
        clump(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, col, R);
      }
    }
    // global form shading (sphere lit from top-left) + dappled light
    const dn = pnoise(seed, Dpx * 0.08);
    modPixels(g.canvas as unknown as Canvas, (x, y, p, i) => {
      const nx = (x - cx) / Rr, ny = (y - cy) / Rr;
      const lit = nx * LIGHT.x + ny * LIGHT.y;
      const k = 0.92 + lit * 0.22 + (dn(x, y, 3) - 0.5) * 0.35;
      p[i] *= k; p[i + 1] *= k; p[i + 2] *= k;
    });
  };
}

function pine(Dpx: number, seed: number, base: RGB) {
  return (g: Ctx, W: number, H: number, R: Rng) => {
    const cx = W / 2 + R.range(-2, 2), cy = H / 2 + R.range(-2, 2), Rr = W / 2;
    const tiers = 5;
    for (let t = 0; t < tiers; t++) {
      const rr = Rr * (1 - t * 0.17), nb = 17 + R.int(0, 4) - t * 2;
      const col = mixRGB(base, [150, 170, 120], t * 0.07);
      // shadow of this tier on the one below
      for (let b = 0; b < nb; b++) {
        const a = (b / nb) * TAU + R.range(-0.2, 0.2) + t * 0.37;
        const len = rr * R.range(0.8, 1.0), wid = rr * R.range(0.26, 0.34);
        const lit = Math.cos(a) * LIGHT.x + Math.sin(a) * LIGHT.y;
        const k = 0.8 + lit * 0.25;
        const c: RGB = [col[0] * k, col[1] * k, col[2] * k];
        g.save(); g.translate(cx, cy); g.rotate(a);
        // soft shadow of this branch on the tier below
        if (t > 0) { g.save(); g.rotate(-a); g.translate(3, 4); g.rotate(a); (g as any).filter = 'blur(2px)'; g.fillStyle = 'rgba(4,8,6,0.35)'; g.beginPath(); g.moveTo(0, -wid * 0.5); g.quadraticCurveTo(len * 0.6, -wid * 0.55, len, 0); g.quadraticCurveTo(len * 0.6, wid * 0.55, 0, wid * 0.5); g.fill(); (g as any).filter = 'none'; g.restore(); }
        // branch body
        g.beginPath(); g.moveTo(0, -wid * 0.5); g.quadraticCurveTo(len * 0.6, -wid * 0.55, len, 0); g.quadraticCurveTo(len * 0.6, wid * 0.55, 0, wid * 0.5); g.closePath();
        const gr = g.createLinearGradient(0, 0, len, 0);
        gr.addColorStop(0, css([c[0] * 0.55, c[1] * 0.6, c[2] * 0.6])); gr.addColorStop(0.7, css(c)); gr.addColorStop(1, css([c[0] * 0.85, c[1] * 0.9, c[2] * 0.85]));
        g.fillStyle = gr; g.fill();
        // needles: short strokes angled outward along both edges
        g.lineWidth = 0.8;
        for (let s = 0; s < len; s += 2.2) {
          const ww = wid * 0.5 * (1 - (s / len) ** 1.5) + 2;
          for (const sd of [-1, 1]) {
            g.strokeStyle = css(R.chance(0.3) ? mixRGB(c, [170, 180, 130], 0.25) : [c[0] * R.range(0.7, 1.05), c[1] * R.range(0.7, 1.05), c[2] * R.range(0.7, 1.05)], 0.85);
            g.beginPath(); g.moveTo(s, sd * ww * 0.2); g.lineTo(s + 3.5, sd * (ww + R.range(0, 2.5))); g.stroke();
          }
        }
        // rachis highlight
        g.strokeStyle = css([c[0] * 0.6, c[1] * 0.55, c[2] * 0.45], 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.85, 0); g.stroke();
        g.restore();
      }
    }
    // leader tip
    g.fillStyle = css(mixRGB(base, [170, 180, 130], 0.35)); g.beginPath(); g.arc(cx, cy, 3, 0, TAU); g.fill();
    const dn = pnoise(seed, Dpx * 0.07);
    modPixels(g.canvas as unknown as Canvas, (x, y, p, i) => {
      const nx = (x - cx) / Rr, ny = (y - cy) / Rr;
      const k = 0.94 + (nx * LIGHT.x + ny * LIGHT.y) * 0.18 + (dn(x, y, 3) - 0.5) * 0.25;
      p[i] *= k; p[i + 1] *= k; p[i + 2] *= k;
    });
  };
}

/** canopy sprites: draw directly (they ARE the whole footprint) and bake a long soft shadow. */
function canopy(D: number, draw: (g: Ctx, W: number, H: number, R: Rng) => void, seed: number) {
  const elev = Math.round(D * 0.12) + 6; // tall objects throw longer shadows
  return sprite(D, D, draw, { elev, seed, grain: 0.03, shadowAlpha: 0.4 });
}

const OAK_PAL: RGB[][] = [
  [[42, 58, 32], [50, 68, 36], [60, 78, 42], [72, 88, 50]],
  [[46, 56, 34], [56, 66, 38], [66, 76, 44], [78, 86, 52]],
  [[38, 52, 34], [46, 62, 38], [56, 72, 44], [66, 82, 50]],
];
const PINE_BASE: RGB[] = [[40, 60, 42], [48, 64, 44], [38, 54, 40]];
export const TREE_SIZES = { s: 64, m: 92, l: 124 };

export function buildNature(reg: Registry) {
  for (const [sz, D] of Object.entries(TREE_SIZES)) {
    const oaks = [0, 1, 2].map((v) => canopy(D, oak(D * ART_SCALE, 7000 + v + D, OAK_PAL[v], v === 1 ? 0.25 : v === 2 ? 0.08 : 0), 7100 + v * 13 + D));
    reg.add(`tree:oak_${sz}`, A, `tree_oak_${sz}`, oaks, { fit: 'contain', nativeSize: [D, D], orient: 'any', canopy: D, note: 'centre on the trunk solid; scale so canopy diameter = 2*cr' });
    reg.add('tree:oak', A, `tree_oak_${sz}`, oaks, { fit: 'contain', nativeSize: [D, D], orient: 'any' });
    const pines = [0, 1, 2].map((v) => canopy(D, pine(D * ART_SCALE, 7200 + v + D, PINE_BASE[v]), 7300 + v * 13 + D));
    reg.add(`tree:pine_${sz}`, A, `tree_pine_${sz}`, pines, { fit: 'contain', nativeSize: [D, D], orient: 'any', canopy: D });
    reg.add('tree:pine', A, `tree_pine_${sz}`, pines, { fit: 'contain', nativeSize: [D, D], orient: 'any' });
  }
  reg.props['tree:oak'].nativeSize = [TREE_SIZES.m, TREE_SIZES.m];
  reg.props['tree:pine'].nativeSize = [TREE_SIZES.m, TREE_SIZES.m];
  reg.props['tree:oak'].sizes = { s: reg.props['tree:oak_s'].frames, m: reg.props['tree:oak_m'].frames, l: reg.props['tree:oak_l'].frames, diameters: TREE_SIZES };
  reg.props['tree:pine'].sizes = { s: reg.props['tree:pine_s'].frames, m: reg.props['tree:pine_m'].frames, l: reg.props['tree:pine_l'].frames, diameters: TREE_SIZES };

  // bushes (decor:bush) 30×30
  const bushes = [0, 1, 2, 3].map((v) => sprite(30, 28, (g, W, H, R) => {
    const pal: RGB[] = v === 3 ? [[70, 64, 40], [86, 78, 48], [96, 88, 56]] : v === 2 ? [[40, 52, 32], [50, 64, 38], [62, 74, 44]] : [[34, 48, 30], [44, 60, 36], [56, 72, 42]];
    for (let i = 0; i < 7; i++) { const a = R.range(0, TAU), d = R.range(0, W * 0.2); clump(g, W / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d, W * R.range(0.18, 0.26), pal[Math.min(2, (i / 3) | 0)], R, 1.4); }
  }, { elev: 4, seed: 7400 + v, grain: 0.03 }));
  reg.add('decor:bush', A, 'bush', bushes, { fit: 'contain', nativeSize: [30, 28], orient: 'any' });

  // rocks 40×32
  const rocks = [0, 1, 2, 3, 4].map((v) => sprite(40, 32, (g, W, H, R) => {
    const col = ['#4a4945', '#43413d', '#514c44', '#464843', '#4d4a43'][v];
    blobPath(g, W / 2, H / 2, W * 0.47, H * 0.46, rng(7650 + v), 0.3, 9, 0.5);
    litFill(g, 0, 0, W, H, col, { radial: true, light: 0.3, dark: 0.45, bevel: 3, outline: 'rgba(20,20,18,0.8)', lw: 1.5, paint: (q) => texRect(q, 0, 0, W, H, noiseShader(col, 7500 + v, 5, 0.18, 0.1)) });
    // facets: a few angled planes shaded by their normal
    g.save(); blobPath(g, W / 2, H / 2, W * 0.47, H * 0.46, rng(7650 + v), 0.3, 9, 0.5); g.clip();
    for (let i = 0; i < 4; i++) {
      const a = R.range(0, TAU), px = W / 2 + Math.cos(a) * W * 0.25, py = H / 2 + Math.sin(a) * H * 0.25;
      const lit = Math.cos(a) * LIGHT.x + Math.sin(a) * LIGHT.y;
      g.fillStyle = lit > 0 ? `rgba(255,250,235,${0.12 * lit})` : `rgba(0,0,0,${-0.2 * lit})`;
      g.beginPath(); g.moveTo(W / 2 + R.range(-4, 4), H / 2 + R.range(-4, 4)); g.lineTo(px + Math.cos(a - 1) * 30, py + Math.sin(a - 1) * 30); g.lineTo(px + Math.cos(a + 1) * 30, py + Math.sin(a + 1) * 30); g.fill();
    }
    // cracks + lichen
    g.strokeStyle = 'rgba(15,15,12,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(W * 0.3, H * 0.2); g.lineTo(W * 0.45, H * 0.5); g.lineTo(W * 0.4, H * 0.8); g.stroke();
    for (let i = 0; i < 6; i++) { g.fillStyle = R.pick(['rgba(110,120,70,0.35)', 'rgba(150,150,110,0.25)', 'rgba(70,90,50,0.35)']); g.beginPath(); g.arc(R.range(W * 0.2, W * 0.8), R.range(H * 0.2, H * 0.8), R.range(2, 5), 0, TAU); g.fill(); }
    g.restore();
  }, { elev: 4, seed: 7600 + v }));
  reg.add('rock:rock', A, 'rock', rocks, { fit: 'stretch', nativeSize: [40, 32], orient: 'any' });

  // grass tufts (decor:tuft) 22×22, flat
  const tufts = [0, 1, 2, 3].map((v) => sprite(22, 22, (g, W, H, R) => {
    const dry = v >= 2;
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI / 2 + R.range(-1.4, 1.4) + (R.chance(0.3) ? Math.PI : 0), l = R.range(W * 0.2, W * 0.48);
      const col = dry ? R.pick(['#6e6644', '#7a7048', '#5e583a', '#857a50']) : R.pick(['#3a4a2a', '#46582f', '#52643a', '#2e3a24']);
      g.strokeStyle = col; g.lineWidth = R.range(0.8, 1.6); g.lineCap = 'round';
      g.beginPath(); g.moveTo(W / 2 + R.range(-2, 2), H / 2 + R.range(-2, 2)); g.quadraticCurveTo(W / 2 + Math.cos(a + 0.4) * l * 0.5, H / 2 + Math.sin(a + 0.4) * l * 0.5, W / 2 + Math.cos(a) * l, H / 2 + Math.sin(a) * l); g.stroke();
    }
  }, { elev: 1, seed: 7700 + v, grain: 0 }));
  reg.add('decor:tuft', A, 'tuft', tufts, { fit: 'contain', nativeSize: [22, 22], orient: 'any', decal: true });
  void withShadow; void C; void canvas;
}
