import { join } from 'node:path';
import { loadImage } from '@napi-rs/canvas';
import { openRenderer, type Job } from '../chars3d/driver';
import { canvas, packAtlas, contactSheet, type Frame } from '../lib/core';
import { LAB_ANIMATIONS, type LabActorKind } from '../../src/angle-lab/animations';

const jobs: Job[] = [], names: string[] = [];
for (const tilt of [15, 30, 45]) for (const actor of ['survivor', 'zombie'] as LabActorKind[]) for (let direction = 0; direction < 8; direction++) {
  const animations = tilt === 45 ? Object.entries(LAB_ANIMATIONS[actor]) : [['idle', 1], ['walk', 4], ...(actor === 'zombie' ? [['corpse', 1]] : [])];
  for (const [pose, count] of animations as [string, number][]) {
    for (let i = 0; i < count; i++) { jobs.push({ kind: 'angle', w: 96, h: 128, actor, tilt, direction, pose, i }); names.push(`angle_${actor}_${tilt}_${direction}_${pose}_${i}`); }
  }
}
const renderer = await openRenderer(join(process.cwd(), 'art/angle/web.ts'));
try {
  const frames: Frame[] = [];
  for (let i = 0; i < jobs.length; i += 24) {
    const batch = await renderer.render(jobs.slice(i, i + 24));
    for (let j = 0; j < batch.length; j++) { const { c, g } = canvas(96, 128); g.drawImage(await loadImage(batch[j].png), 0, 0); frames.push({ name: names[i + j], canvas: c }); }
    console.log(`Angle Lab: ${frames.length}/${jobs.length} frames`);
  }
  packAtlas('angle_lab', frames);
  contactSheet(join(process.cwd(), 'art/preview/angle-lab-characters.png'), frames.filter(f => f.name.includes('_45_') && f.name.endsWith('_idle_0')), 8, '#303631');
  contactSheet(join(process.cwd(), 'art/preview/angle-lab-animations.png'), frames.filter(f => f.name.includes('_45_1_')), 8, '#303631');
} finally { await renderer.close(); }
