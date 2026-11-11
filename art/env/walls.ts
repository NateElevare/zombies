// art/env/walls.ts — wall-top strips seen from above. Every strip is drawn in "h" space (length along x,
// thickness along y) and the "v" version is the transpose, so the top-left light stays consistent.
// h strips: 128×32 px (64 world long × 16 world thick), seamless along their length.
import { canvas, rng, type Canvas, type Ctx } from '../lib/core';
import { shadePixels, tnoise2, pnoise, C, mixRGB, TAU, rrPath, type RGB } from '../lib/materials';

const L = 128, TH = 32;
type StripFn = (g: Ctx, len: number, th: number) => void;

function strip(fn: StripFn, len = L, th = TH) {
  const h = canvas(len, th);
  fn(h.g, len, th);
  const v = canvas(th, len);
  v.g.setTransform(0, 1, 1, 0, 0, 0); // transpose
  v.g.drawImage(h.c, 0, 0);
  v.g.setTransform(1, 0, 0, 1, 0, 0);
  return { h: h.c, v: v.c };
}
/** square cap (post / corner) built from a strip function's central part */
function cap(fn: StripFn, th = TH) {
  const t = canvas(L, th); fn(t.g, L, th);
  const { c, g } = canvas(th, th);
  g.drawImage(t.c, 40, 0, th, th, 0, 0, th, th);
  // corner piece: light top & left rim, dark bottom & right
  g.fillStyle = 'rgba(255,250,240,0.12)'; g.fillRect(0, 0, 2, th);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(th - 2, 0, 2, th);
  return c;
}
function rims(g: Ctx, len: number, th: number, light = 0.16, dark = 0.4) {
  g.fillStyle = `rgba(255,250,240,${light})`; g.fillRect(0, 0, len, 2);
  g.fillStyle = `rgba(255,250,240,${light * 0.4})`; g.fillRect(0, 2, len, 1);
  g.fillStyle = `rgba(0,0,0,${dark})`; g.fillRect(0, th - 2, len, 2);
  g.fillStyle = `rgba(0,0,0,${dark * 0.4})`; g.fillRect(0, th - 3, len, 1);
}
function shadeStrip(g: Ctx, len: number, th: number, fn: (x: number, y: number) => number[]) {
  const t = canvas(len, th); shadePixels(t.c, fn); g.drawImage(t.c, 0, 0);
}

const brick: StripFn = (g, len, th) => {
  const R = rng(11), mort = C('#57534b'), n = tnoise2(3, 16, 2, len);
  const BL = 32, rows = 2, rh = th / rows;
  const tones: RGB[] = [];
  const pal = [C('#6b3d31'), C('#5e372d'), C('#74463a'), C('#5a3a30'), C('#6e4a3c'), C('#4f3229')];
  for (let i = 0; i < 16; i++) tones.push(pal[R.int(0, pal.length - 1)]);
  shadeStrip(g, len, th, (x, y) => {
    const r = Math.min(rows - 1, Math.floor(y / rh)), off = r % 2 ? BL / 2 : 0;
    const bx = (((x - off) % BL) + BL) % BL, by = y - r * rh, bi = Math.floor((((x - off) % len) + len) % len / BL) + r * 4;
    const m = bx < 2 || by < 1.5 || by > rh - 1.5;
    const nn = n(x, y, 3);
    if (m) { const k = 0.85 + nn * 0.3; return [mort[0] * k, mort[1] * k, mort[2] * k]; }
    const col = tones[bi % tones.length];
    let k = 0.86 + nn * 0.25 + (R.next() - 0.5) * 0.14;
    if (bx < 3.5 || by < 3) k *= 1.12; else if (bx > BL - 2.5 || by > rh - 3) k *= 0.82;
    return [col[0] * k, col[1] * k, col[2] * k];
  });
  rims(g, len, th, 0.1, 0.35);
};
const concreteW: StripFn = (g, len, th) => {
  const b = C('#6b6a66'), n = tnoise2(21, 8, 2, len), f = tnoise2(22, 32, 4, len), R = rng(21);
  shadeStrip(g, len, th, (x, y) => {
    const k = 0.88 + n(x, y) * 0.22 + (f(x, y, 2) - 0.5) * 0.1 + (R.next() - 0.5) * 0.08 - (R.next() < 0.01 ? 0.25 : 0);
    return [b[0] * k, b[1] * k, b[2] * k];
  });
  // chamfered edges + form-tie holes
  g.fillStyle = 'rgba(255,250,240,0.2)'; g.fillRect(0, 0, len, 3);
  g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(0, th - 3, len, 3);
  for (const x of [32, 96]) {
    g.fillStyle = 'rgba(20,20,18,0.55)'; g.beginPath(); g.arc(x, th / 2, 1.8, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(x + 0.8, th / 2 + 0.8, 1.2, 0, TAU); g.fill();
  }
  // pour joint at the tile edge
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 1, th);
};
function framedWall(face: string, faceW: number, coreTone: string, studs: boolean): StripFn {
  return (g, len, th) => {
    const fc = C(face), core = C(coreTone), n = tnoise2(31, 6, 2, len), wood = tnoise2(32, 4, 16, len), R = rng(31);
    shadeStrip(g, len, th, (x, y) => {
      const edge = y < faceW || y >= th - faceW;
      if (edge) { const k = 0.92 + n(x, y) * 0.14 + (R.next() - 0.5) * 0.05; return [fc[0] * k, fc[1] * k, fc[2] * k]; }
      // wood top plate with grain along the length
      const k = 0.85 + Math.sin((y + wood(x, y, 3) * 6) * 2.2) * 0.07 + n(x, y) * 0.15 + (R.next() - 0.5) * 0.06;
      return [core[0] * k, core[1] * k, core[2] * k];
    });
    // seams between the face layer and the plate
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, faceW, len, 1); g.fillRect(0, th - faceW - 1, len, 1);
    if (studs) for (const x of [0, 64]) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, faceW + 1, 1.2, th - faceW * 2 - 2); }
    rims(g, len, th, 0.18, 0.4);
  };
}
const military: StripFn = (g, len, th) => {
  const b = C('#4f5440'), n = tnoise2(41, 8, 2, len), wear = tnoise2(42, 16, 4, len), R = rng(41);
  shadeStrip(g, len, th, (x, y) => {
    const bx = x % 32, w = wear(x, y, 4);
    let col: RGB = b;
    if (w > 0.66) col = mixRGB(b, C('#6e6c64'), Math.min(1, (w - 0.66) * 5));
    let k = 0.86 + n(x, y) * 0.22 + (R.next() - 0.5) * 0.1;
    if (bx < 1.5) k *= 0.55; else if (bx < 3) k *= 1.1;
    return [col[0] * k, col[1] * k, col[2] * k];
  });
  // reinforced cap rail (steel) along the top edge
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, th / 2 - 3, len, 7);
  g.fillStyle = '#5a5c56'; g.fillRect(0, th / 2 - 3.5, len, 6);
  g.fillStyle = 'rgba(255,255,240,0.18)'; g.fillRect(0, th / 2 - 3.5, len, 1.5);
  rims(g, len, th, 0.14, 0.42);
};
const chainlink: StripFn = (g, len, th) => {
  // see-through mesh (transparent background), top rail pipe, post at x=0
  g.save();
  g.strokeStyle = 'rgba(160,166,170,0.55)'; g.lineWidth = 0.9;
  const s = 8;
  g.beginPath();
  for (let x = -th; x < len + th; x += s) { g.moveTo(x, 0); g.lineTo(x + th, th); g.moveTo(x + th, 0); g.lineTo(x, th); }
  g.stroke();
  g.restore();
  // shadow of the rail on the ground (down-right)
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, th / 2 + 2, len, 4);
  const pipe = g.createLinearGradient(0, th / 2 - 3, 0, th / 2 + 3);
  pipe.addColorStop(0, '#b5b9bb'); pipe.addColorStop(0.4, '#8a8f92'); pipe.addColorStop(1, '#4a4e50');
  g.fillStyle = pipe; g.fillRect(0, th / 2 - 3, len, 6);
  // post (half at each end so tiling produces whole posts)
  const post = (cx: number) => {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(cx + 2, th / 2 + 2, 6, 0, TAU); g.fill();
    const pg = g.createRadialGradient(cx - 2, th / 2 - 2, 0, cx, th / 2, 6);
    pg.addColorStop(0, '#c5c8c8'); pg.addColorStop(0.6, '#7d8285'); pg.addColorStop(1, '#3e4244');
    g.fillStyle = pg; g.beginPath(); g.arc(cx, th / 2, 5.5, 0, TAU); g.fill();
  };
  post(0); post(len);
};
const woodFence: StripFn = (g, len, th) => {
  // picket tops seen from above: boards 12px wide, small gaps, rail shadow
  const R = rng(51);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(2, 3, len, th - 2);
  for (let x = 0; x < len; x += 8) {
    const w = 7, tone = R.range(-0.1, 0.1);
    const t = canvas(w, th - 2);
    const b = C('#5a4430'), n = pnoise(51 + x, 6);
    shadePixels(t.c, (px, py) => { const k = 1 + tone + Math.sin(py * 1.6 + n(px, py) * 4) * 0.05 + (R.next() - 0.5) * 0.08; return [b[0] * k, b[1] * k, b[2] * k]; });
    g.drawImage(t.c, x, 1);
    g.fillStyle = 'rgba(255,240,210,0.15)'; g.fillRect(x, 1, 1, th - 2);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + w - 1, 1, 1, th - 2);
  }
  // posts at the ends
  for (const x of [0, len]) {
    g.fillStyle = '#3e2e1e'; g.fillRect(x - 5, 0, 10, th);
    g.fillStyle = 'rgba(255,240,210,0.12)'; g.fillRect(x - 5, 0, 10, 2);
  }
};

function windowStrip(broken: boolean): StripFn {
  return (g, len, th) => {
    // sill/frame (painted wood) both sides, glass in the middle, end jambs
    const R = rng(broken ? 62 : 61);
    rrPath(g, 0, 0, len, th, 0); g.fillStyle = '#6c6a64'; g.fill();
    g.fillStyle = '#8a877e'; g.fillRect(0, 2, len, 8); g.fillRect(0, th - 10, len, 8);
    g.fillStyle = 'rgba(255,255,245,0.2)'; g.fillRect(0, 2, len, 1.5); g.fillRect(0, th - 10, len, 1.5);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 9, len, 1); g.fillRect(0, th - 3, len, 1);
    // glass channel
    const gy = 11, gh = th - 22;
    const gl = g.createLinearGradient(0, gy, 0, gy + gh);
    gl.addColorStop(0, '#5f7a88'); gl.addColorStop(0.5, '#38505c'); gl.addColorStop(1, '#22323a');
    g.fillStyle = gl; g.fillRect(0, gy, len, gh);
    if (!broken) {
      // reflections
      g.fillStyle = 'rgba(220,235,240,0.35)';
      for (const x of [14, 70]) { g.beginPath(); g.moveTo(x, gy); g.lineTo(x + 10, gy); g.lineTo(x + 6, gy + gh); g.lineTo(x - 4, gy + gh); g.fill(); }
      g.fillStyle = 'rgba(220,235,240,0.18)'; g.fillRect(0, gy, len, 1.5);
    } else {
      g.fillStyle = '#1c1f20'; g.fillRect(0, gy, len, gh);
      for (let i = 0; i < 9; i++) {
        const x = R.range(4, len - 4), w = R.range(3, 10);
        g.fillStyle = 'rgba(150,180,190,0.55)';
        g.beginPath(); g.moveTo(x, gy + (R.chance(0.5) ? 0 : gh)); g.lineTo(x + w, gy + R.range(0, gh)); g.lineTo(x + R.range(-3, 3), gy + R.range(0, gh)); g.fill();
      }
    }
    // mullion in the middle
    g.fillStyle = '#7a776e'; g.fillRect(len / 2 - 2, 2, 4, th - 4);
    g.fillStyle = 'rgba(255,255,245,0.2)'; g.fillRect(len / 2 - 2, 2, 1, th - 4);
    // end jambs (nine-slice borders: 8px)
    for (const x of [0, len - 8]) {
      g.fillStyle = '#56544e'; g.fillRect(x, 0, 8, th);
      g.fillStyle = 'rgba(255,255,245,0.14)'; g.fillRect(x, 0, 8, 2); g.fillRect(x, 0, 1.5, th);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 6.5, 0, 1.5, th);
    }
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, th - 2, len, 2);
  };
}
const doorFrame: StripFn = (g, len, th) => {
  // threshold plate (worn brushed aluminium) + jambs at both ends; transparent elsewhere
  const b = C('#7c7a72'), R = rng(71);
  const t = canvas(len - 16, 12);
  shadePixels(t.c, (x, y) => { const k = 0.9 + ((y * 7) % 3 === 0 ? 0.08 : 0) + (R.next() - 0.5) * 0.06; return [b[0] * k, b[1] * k, b[2] * k]; });
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(8, th / 2 - 4, len - 16, 13);
  g.drawImage(t.c, 8, th / 2 - 6);
  g.fillStyle = 'rgba(255,255,245,0.22)'; g.fillRect(8, th / 2 - 6, len - 16, 1.5);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(8, th / 2 + 5, len - 16, 1);
  for (const x of [0, len - 8]) {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 2, 2, 8, th);
    g.fillStyle = '#5c4a38'; g.fillRect(x, 0, 8, th);
    g.fillStyle = 'rgba(255,240,210,0.18)'; g.fillRect(x, 0, 8, 1.5); g.fillRect(x, 0, 1.5, th);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 6.5, 0, 1.5, th);
  }
};

export const WALL_MATERIALS: Record<string, StripFn> = {
  brick,
  concrete: concreteW,
  siding: framedWall('#7b766a', 6, '#6a5844', true),
  drywall: framedWall('#a3a29c', 4, '#6a5a46', true),
  military,
  chainlink,
};

export function buildWalls() {
  const frames: { name: string; canvas: Canvas }[] = [];
  const info: any = {
    atlas: 'env_walls', tilePx: L, thicknessPx: TH, worldLength: L / 2, worldThickness: TH / 2,
    note: 'h strips tile along x, v strips along y. Scale the strip thickness to the wall thickness (16 exterior, 10 interior). Caps are square posts for corners/ends. Light is top-left: h strips are lit on their top edge, v strips on their left edge.',
    materials: {} as Record<string, any>,
  };
  for (const [m, fn] of Object.entries(WALL_MATERIALS)) {
    const s = strip(fn);
    frames.push({ name: `wall_${m}_h`, canvas: s.h }, { name: `wall_${m}_v`, canvas: s.v }, { name: `wall_${m}_cap`, canvas: cap(fn) });
    info.materials[m] = { h: `wall_${m}_h`, v: `wall_${m}_v`, cap: `wall_${m}_cap`, seeThrough: m === 'chainlink' };
  }
  const fw = strip(woodFence, L, 16);
  frames.push({ name: 'fence_wood_h', canvas: fw.h }, { name: 'fence_wood_v', canvas: fw.v });
  const fc = strip(chainlink, L, 16);
  frames.push({ name: 'fence_chain_h', canvas: fc.h }, { name: 'fence_chain_v', canvas: fc.v });
  const w = strip(windowStrip(false)), wb = strip(windowStrip(true)), d = strip(doorFrame);
  frames.push({ name: 'window_h', canvas: w.h }, { name: 'window_v', canvas: w.v },
    { name: 'window_broken_h', canvas: wb.h }, { name: 'window_broken_v', canvas: wb.v },
    { name: 'door_frame_h', canvas: d.h }, { name: 'door_frame_v', canvas: d.v });
  info.window = { h: 'window_h', v: 'window_v', broken_h: 'window_broken_h', broken_v: 'window_broken_v', fit: 'nine', sliceH: [8, 0, 8, 0], sliceV: [0, 8, 0, 8] };
  info.door = { h: 'door_frame_h', v: 'door_frame_v', fit: 'nine', sliceH: [8, 0, 8, 0], sliceV: [0, 8, 0, 8], note: 'threshold+jambs drawn on the floor across the door gap' };
  info.fence = { wood: { h: 'fence_wood_h', v: 'fence_wood_v' }, chain: { h: 'fence_chain_h', v: 'fence_chain_v' }, thicknessPx: 16, worldThickness: 8, fit: 'tile' };
  return { frames, info };
}
