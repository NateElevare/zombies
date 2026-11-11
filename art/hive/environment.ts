/** Import the approved painted Chitin Hive sheets. Run `npm run art:hive:environment`.
 *  Source art is immutable: this only slices, fits, and packs it into runtime atlases. */
import { loadImage } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canvas, packAtlas, contactSheet, writeFile, type Canvas, type Frame } from '../lib/core';

const root = process.cwd(), source = join(root, 'art/source/hive-environment');
const brief = JSON.parse(readFileSync(join(source, 'prompts.json'), 'utf8'));
const slots = ['wall_0', 'wall_1', 'burrow', 'egg', 'glow', 'seal'];
const manifest: any = { version: 1, style: 'chitin-hive-painted-v1', atlases: ['hive_environment', 'hive_floors'], tiles: {}, frames: {}, zones: {}, sources: [] };
const frames: Frame[] = [], floors: Frame[] = [];

function bounds(c: Canvas) {
  const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x = c.width, y = c.height, right = -1, bottom = -1, transparent = 0;
  for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
    const a = p[(j * c.width + i) * 4 + 3];
    if (a === 0) transparent++;
    if (a < 32) continue;
    x = Math.min(x, i); y = Math.min(y, j); right = Math.max(right, i); bottom = Math.max(bottom, j);
  }
  return { x, y, w: right - x + 1, h: bottom - y + 1, transparent };
}

/** Read the six separate silhouettes before cutting. A hand-painted tip may cross an
 *  invisible cell line; cutting its connected silhouette avoids clipping that tip or
 *  importing it as a stray fragment of the neighbouring sprite. */
function regions(c: Canvas) {
  const w = c.width, h = c.height, p = c.getContext('2d').getImageData(0, 0, w, h).data;
  const seen = new Uint8Array(w * h), out: ({ x: number; y: number; w: number; h: number; area: number } | undefined)[] = Array(6);
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || p[i * 4 + 3] < 32) continue;
    const q = [i]; seen[i] = 1; let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let k = 0; k < q.length; k++) {
      const n = q[k], x = n % w, y = Math.floor(n / w);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      for (const j of [x > 0 ? n - 1 : -1, x < w - 1 ? n + 1 : -1, y > 0 ? n - w : -1, y < h - 1 ? n + w : -1]) {
        if (j < 0 || seen[j] || p[j * 4 + 3] < 32) continue;
        seen[j] = 1; q.push(j);
      }
    }
    const slot = Math.min(2, Math.floor((x0 + x1) / 2 / (w / 3))) + Math.min(1, Math.floor((y0 + y1) / 2 / (h / 2))) * 3;
    if (!out[slot] || q.length > out[slot]!.area) out[slot] = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area: q.length };
  }
  return out;
}

for (const job of brief.assets.filter((a: any) => a.id > 0)) {
  const im = await loadImage(join(root, job.file));
  if (Math.abs(im.width / im.height - 1.5) > .02) throw Error(`${job.key}: expected 3x2 sheet`);
  manifest.sources.push(job.file);
  manifest.zones[job.id] = { key: job.key, name: job.name, materials: job.look };
  const raw = canvas(im.width, im.height); raw.g.drawImage(im, 0, 0);
  if (bounds(raw.c).transparent < im.width * im.height * .12) throw Error(`${job.key}: opaque sprite background`);
  const parts = regions(raw.c);
  for (let i = 0; i < slots.length; i++) {
    const b = parts[i];
    if (!b || b.area < 5000 || b.w > im.width * .39 || b.h > im.height * .49) throw Error(`${job.key}/${slots[i]}: missing or overlapping silhouette`);
    const c = canvas(256, 256), scale = 232 / Math.max(b.w, b.h);
    c.g.imageSmoothingEnabled = false;
    c.g.drawImage(raw.c, b.x, b.y, b.w, b.h, (256 - b.w * scale) / 2, (256 - b.h * scale) / 2, b.w * scale, b.h * scale);
    const name = `hive_env_${job.id}_${slots[i]}`;
    frames.push({ name, canvas: c.c });
    const fitted = bounds(c.c);
    manifest.frames[name] = { atlas: 'hive_environment', bounds: { x: fitted.x, y: fitted.y, w: fitted.w, h: fitted.h } };
  }
}

const floorJob = brief.assets.find((a: any) => a.id === 0), im = await loadImage(join(root, floorJob.file));
if (Math.abs(im.width / im.height - 2) > .02) throw Error('Floors: expected 4x2 sheet');
manifest.sources.push(floorJob.file);
for (let z = 1; z <= 8; z++) {
  const c = canvas(512, 512), i = z - 1, cw = im.width / 4, ch = im.height / 2;
  c.g.imageSmoothingEnabled = false;
  c.g.drawImage(im, (i % 4) * cw, Math.floor(i / 4) * ch, cw, ch, 0, 0, 512, 512);
  const name = `hive_env_${z}_floor`;
  floors.push({ name, canvas: c.c, extrude: 2 });
  manifest.tiles[`hive_floor_${z}`] = [name];
  manifest.frames[name] = { atlas: 'hive_floors', bounds: { x: 0, y: 0, w: 512, h: 512 } };
}
packAtlas('hive_environment', frames);
packAtlas('hive_floors', floors);
contactSheet(join(root, 'art/preview/hive-environment.png'), frames, 6, '#242323');
contactSheet(join(root, 'art/preview/hive-floors.png'), floors, 4, '#242323');
writeFile(join(root, 'public/assets/hive-environment.json'), JSON.stringify(manifest));
console.log(`Chitin Hive: ${frames.length} painted props, ${floors.length} floor materials, 8 zones.`);
await import('./warrens');
await import('./conduits');
