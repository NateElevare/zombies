// Pack the approved original sheet without redrawing or recoloring its artwork.
import { loadImage } from '@napi-rs/canvas';
import { canvas, packAtlas, contactSheet, type Frame } from '../lib/core';
const source = await loadImage('public/assets/reference-zombie/runner-sprites-v1.png');
const { c, g } = canvas(source.width, source.height); g.drawImage(source, 0, 0);
const pixels = g.getImageData(0, 0, c.width, c.height).data;
const frames: Frame[] = [];
for (const [row, pose] of ['idle', 'walk', 'attack'].entries()) for (let col = 0; col < 4; col++) {
  const x0 = Math.round(col * c.width / 4), x1 = Math.round((col + 1) * c.width / 4);
  const y0 = Math.round(row * c.height / 3), y1 = Math.round((row + 1) * c.height / 3);
  let bottom = y0, top = y1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (pixels[(y * c.width + x) * 4 + 3] > 127) { bottom = Math.max(bottom, y); top = Math.min(top, y); }
  // Align each source cell's planted feet; the original sheet has varying margins.
  let left = x1, right = x0;
  for (let y = bottom - 55; y <= bottom; y++) for (let x = x0; x < x1; x++) if (pixels[(y * c.width + x) * 4 + 3] > 127) { left = Math.min(left, x); right = Math.max(right, x); }
  if (bottom <= top || right < left) throw Error(`Empty reference cell ${row}, ${col}`);
  const scale = 0.2, footX = (left + right) / 2 - x0, footY = bottom + 1 - y0;
  const frame = canvas(96, 128); frame.g.imageSmoothingEnabled = false;
  frame.g.drawImage(source, x0, y0, x1 - x0, y1 - y0, 48 - footX * scale, 92 - footY * scale, (x1 - x0) * scale, (y1 - y0) * scale);
  frames.push({ name: `reference_zombie_${pose}_${col}`, canvas: frame.c });
}
packAtlas('angle_zombie_pixel', frames);
contactSheet('art/preview/angle-lab-reference-zombie.png', frames, 4, '#303631');
