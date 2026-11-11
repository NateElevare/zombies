// art/lib/trimpack.ts — trimmed atlas packing (Phaser JSON-hash `trimmed: true` frames).
// Frames are cropped to their non-transparent bounds; `spriteSourceSize`/`sourceSize` keep the original frame
// box, so Phaser draws them exactly as if untrimmed (same origin/center) while the atlas stores only real pixels.
// Overflowing frames spill into further pages: name, name_2, name_3, ...
import { join } from 'node:path';
import { canvas, writeFile, OUT, type Canvas } from './core';

export interface TFrame { name: string; canvas: Canvas }
interface Trimmed { name: string; src: Canvas; x: number; y: number; w: number; h: number; sw: number; sh: number }

export function trim(f: TFrame, pad = 1): Trimmed {
  const c = f.canvas, W = c.width, H = c.height;
  const d = c.getContext('2d').getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { name: f.name, src: c, x: 0, y: 0, w: 1, h: 1, sw: W, sh: H };
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  return { name: f.name, src: c, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, sw: W, sh: H };
}

/** Pack frames (trimmed) into one or more pages of at most maxSize². Returns the page names written. */
export function packTrimmed(name: string, frames: TFrame[], maxSize = 4096, pad = 2) {
  const items = frames.map((f) => trim(f)).sort((a, b) => b.h - a.h || b.w - a.w);
  const pages: { name: string; w: number; h: number; count: number; bytes: number }[] = [];
  let rest = items;
  for (let pi = 0; rest.length; pi++) {
    const pname = pi === 0 ? name : `${name}_${pi + 1}`;
    // pick the smallest power-of-two width whose shelf layout fits (square-ish), else maxSize with overflow
    let W = 256, placed: { t: Trimmed; x: number; y: number }[] = [], H = 0, left: Trimmed[] = [];
    for (; W <= maxSize; W *= 2) {
      placed = []; left = []; let x = pad, y = pad, rowH = 0;
      for (const t of rest) {
        if (x + t.w + pad > W) { x = pad; y += rowH + pad; rowH = 0; }
        if (y + t.h + pad > maxSize) { left.push(t); continue; }
        placed.push({ t, x, y }); x += t.w + pad; rowH = Math.max(rowH, t.h);
      }
      H = y + rowH + pad;
      if ((H <= W && !left.length) || W === maxSize) break;
    }
    let PH = 64; while (PH < H) PH *= 2;
    const { c, g } = canvas(W, Math.min(PH, maxSize));
    const json: any = { frames: {}, meta: { app: 'deadzone-art3d', image: pname + '.png', size: { w: W, h: c.height }, scale: '1' } };
    for (const { t, x, y } of placed) {
      g.drawImage(t.src, t.x, t.y, t.w, t.h, x, y, t.w, t.h);
      json.frames[t.name] = { frame: { x, y, w: t.w, h: t.h }, rotated: false, trimmed: true, spriteSourceSize: { x: t.x, y: t.y, w: t.w, h: t.h }, sourceSize: { w: t.sw, h: t.sh } };
    }
    const png = c.toBuffer('image/png');
    writeFile(join(OUT, pname + '.png'), png);
    writeFile(join(OUT, pname + '.json'), JSON.stringify(json));
    pages.push({ name: pname, w: W, h: c.height, count: placed.length, bytes: png.length });
    if (!placed.length) throw new Error(`atlas ${name}: a frame is larger than ${maxSize}`);
    rest = left;
  }
  return pages;
}
