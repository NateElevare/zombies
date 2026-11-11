// Import the approved overhead raster sheets into the existing 2D animation contract.
// This is atlas preparation only: no generated poses, recoloring or background removal.
import { loadImage } from '@napi-rs/canvas';
import { join } from 'node:path';
import { canvas } from '../lib/core';
import { ZTYPES, type ZType, type ZFrame } from './zombies';

export const PIXEL_ZOMBIE_SOURCE = join(process.cwd(), 'art', 'source', 'zombies-pixel');
export const PIXEL_GRID = { columns: 8, rows: 4 } as const;
export const PIXEL_SEQUENCES = [
  { anim: 'walk', start: 0, count: 8 },
  { anim: 'attack', start: 8, count: 6 },
  { anim: 'hit', start: 14, count: 2 },
  { anim: 'death', start: 16, count: 8 },
  { anim: 'corpse', start: 24, count: 1 },
  { anim: 'pulse', start: 25, count: 4 },
] as const;

export async function loadPixelZombieFrames(type: ZType, v: number): Promise<ZFrame[]> {
  const file = join(PIXEL_ZOMBIE_SOURCE, `${type}-${v}.png`);
  const image = await loadImage(file);
  if (Math.abs(image.width / image.height - 2) > 0.02) {
    throw new Error(`${file}: expected an 8 by 4 grid of square cells`);
  }
  const cw = image.width / PIXEL_GRID.columns, ch = image.height / PIXEL_GRID.rows;
  const size = ZTYPES[type].frame;
  // Keep the original cell center and one uniform scale across EVERY pose. Per-frame
  // bounding-box fitting would make the head drift and the corpse change body size.
  const pad = 8;
  const out: ZFrame[] = [];
  for (const seq of PIXEL_SEQUENCES) {
    if (seq.anim === 'pulse' && type !== 'bloater') continue;
    for (let i = 0; i < seq.count; i++) {
      const cell = seq.start + i;
      const { c, g } = canvas(size, size);
      g.imageSmoothingEnabled = false;
      g.drawImage(image, (cell % 8) * cw, Math.floor(cell / 8) * ch, cw, ch,
        pad, pad, size - pad * 2, size - pad * 2);
      const data = g.getImageData(pad, pad, size - pad * 2, size - pad * 2).data;
      let visible = 0, clear = 0;
      for (let p = 3; p < data.length; p += 4) {
        if (data[p] > 127) visible++;
        if (data[p] === 0) clear++;
      }
      const area = data.length / 4;
      if (visible < area * 0.025 || clear < area * 0.2) {
        throw new Error(`${file}: ${seq.anim} ${i} is empty or lacks transparent padding`);
      }
      out.push({ name: `zombie_${type}_${v}_${seq.anim}_${i}`, canvas: c, type, v, anim: seq.anim, i });
    }
  }
  return out;
}
