import { loadImage } from '@napi-rs/canvas';
import { join } from 'node:path';
import { canvas, packAtlas, contactSheet, type Frame, type ManifestFragment } from '../lib/core';
import { BOSS_IDS } from '../../src/sim/bosses';
import { BOSS_FRAME_SIZE, BOSS_SEQUENCES } from '../../src/boss-art';

export default async function (): Promise<ManifestFragment> {
  const frames: Frame[] = [], portraits: Frame[] = [], sprites: Record<string, any> = {}, anims: NonNullable<ManifestFragment['anims']> = [];
  for (const id of BOSS_IDS) {
    const source = await loadImage(join(process.cwd(), 'art/source/bosses-pixel', `${id}.png`));
    if (source.width !== source.height) throw new Error(`${id}: expected a square 4 by 4 sheet`);
    const cell = source.width / 4;
    for (const [pose, seq] of Object.entries(BOSS_SEQUENCES)) {
      const names: string[] = [];
      for (let i = 0; i < seq.count; i++) {
        const n = seq.start + i, { c, g } = canvas(BOSS_FRAME_SIZE, BOSS_FRAME_SIZE);
        g.imageSmoothingEnabled = false;
        g.drawImage(source, n % 4 * cell, Math.floor(n / 4) * cell, cell, cell, 8, 8, BOSS_FRAME_SIZE - 16, BOSS_FRAME_SIZE - 16);
        const pixels = g.getImageData(0, 0, c.width, c.height).data;
        let visible = 0, clear = 0;
        for (let p = 3; p < pixels.length; p += 4) { if (pixels[p] > 127) visible++; if (pixels[p] === 0) clear++; }
        if (visible < 500 || clear < c.width * c.height * 0.25) throw new Error(`${id} ${pose} ${i}: missing sprite or transparency`);
        const name = `boss_${id}_${pose}_${i}`;
        frames.push({ name, canvas: c }); names.push(name);
        if (pose === 'idle' && i === 0) portraits.push({ name: id, canvas: c });
      }
      const key = `boss_${id}_${pose}`;
      sprites[key] = { atlas: 'bosses', origin: [0.5, 0.5] };
      anims.push({ key, atlas: 'bosses', frames: names, frameRate: seq.rate, repeat: ['idle', 'walk'].includes(pose) ? -1 : 0 });
    }
  }
  packAtlas('bosses', frames);
  contactSheet(join(process.cwd(), 'art/preview/bosses.png'), frames, 8, '#242628');
  contactSheet(join(process.cwd(), 'art/preview/boss-lineup.png'), portraits, 5, '#242628');
  return { atlases: ['bosses'], sprites, anims, bossArt: 'reference-pixel-overhead-v1' };
}
