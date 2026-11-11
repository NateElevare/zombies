import { loadImage, createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
// Preserve the source art; make compact runtime textures without the atlas dividers.
for (const name of ['house', 'sedan']) {
  const source = await loadImage(`art/angle/source/${name}-materials.png`);
  const canvas = createCanvas(512, 512), g = canvas.getContext('2d');
  g.drawImage(source, 0, 0, 512, 512);
  writeFileSync(`public/assets/angle_${name}_materials.png`, canvas.toBuffer('image/png'));
}
