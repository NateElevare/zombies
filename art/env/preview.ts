// art/env/preview.ts — inspection sheets written to art/preview/ (not shipped).
import { join } from 'node:path';
import { canvas, rng, savePng, type Canvas } from '../lib/core';

export const PREVIEW = join(process.cwd(), 'art', 'preview');

/** Each material as a 3×3 repeat with RANDOM variants per cell (tests self- and cross-variant seams). */
export function tileRepeatSheet(path: string, mats: Record<string, Canvas[]>, cols = 4, scale = 1) {
  const names = Object.keys(mats), cell = 128 * 3 * scale, lab = 16;
  const rows = Math.ceil(names.length / cols);
  const { c, g } = canvas(cols * (cell + 8), rows * (cell + lab + 8));
  g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
  const R = rng(5);
  names.forEach((n, i) => {
    const x0 = (i % cols) * (cell + 8), y0 = Math.floor(i / cols) * (cell + lab + 8);
    const vs = mats[n];
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) {
      const t = vs[(R.next() * vs.length) | 0];
      g.drawImage(t, x0 + k * 128 * scale, y0 + lab + j * 128 * scale, 128 * scale, 128 * scale);
    }
    g.fillStyle = '#ddd'; g.font = '13px sans-serif'; g.fillText(n, x0 + 4, y0 + 12);
  });
  savePng(path, c);
}

/** Labeled grid of arbitrary-size sprites on a ground-ish background. */
export function spriteSheet(path: string, items: { name: string; canvas: Canvas }[], width = 2048, bg = '#3a3c36') {
  const pad = 10, lab = 14;
  // shelf layout
  let x = pad, y = pad, rowH = 0;
  const pos: [number, number][] = [];
  for (const it of items) {
    const w = it.canvas.width, h = it.canvas.height + lab;
    if (x + w + pad > width) { x = pad; y += rowH + pad; rowH = 0; }
    pos.push([x, y]); x += Math.max(w, 60) + pad; rowH = Math.max(rowH, h);
  }
  const H = y + rowH + pad;
  const { c, g } = canvas(width, H);
  g.fillStyle = bg; g.fillRect(0, 0, width, H);
  items.forEach((it, i) => {
    const [px, py] = pos[i];
    g.drawImage(it.canvas, px, py);
    g.fillStyle = '#e8e8e0'; g.font = '11px sans-serif'; g.fillText(it.name.replace(/^prop_/, '').slice(0, 28), px, py + it.canvas.height + 11);
  });
  savePng(path, c);
}
