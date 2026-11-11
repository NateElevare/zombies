import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { DomNode } from './helpers/dom';
import { itemIcon } from '../src/ui/dom';

describe('Cola & Mints artwork', () => {
  it('ships both item icons and all held/spray/impact frames with transparent padding', async () => {
    const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8'));
    const atlas = JSON.parse(readFileSync('public/assets/cola.json', 'utf8'));
    const anims = JSON.parse(readFileSync('public/assets/anims.json', 'utf8'));
    expect(manifest.atlases).toContain('cola'); expect(manifest.colaArt).toBe('pixel-v1');
    expect(manifest.icons.pistol).toBeTruthy(); // subset builds preserve the existing icon map
    const expected = ['weapon_cola_mints', 'weapon_cola_mints_spray', ...Array.from({ length: 4 }, (_, i) => `cola_foam_${i}`), ...Array.from({ length: 3 }, (_, i) => `cola_splash_${i}`)];
    expect(Object.keys(atlas.frames).sort()).toEqual(expected.sort());
    for (const key of ['cola_foam', 'cola_splash']) {
      const seq = anims.find((a: { key: string }) => a.key === key);
      expect(seq.atlas).toBe('cola'); for (const frame of seq.frames) expect(atlas.frames[frame]).toBeTruthy();
    }
    for (const id of ['cola_mints', 'mints']) {
      expect(manifest.icons[id]).toBe(`icons/${id}.png`);
      const image = await loadImage(`public/assets/icons/${id}.png`);
      expect([image.width, image.height]).toEqual([96, 96]);
      const c = createCanvas(96, 96), g = c.getContext('2d'); g.drawImage(image, 0, 0);
      const data = g.getImageData(0, 0, 96, 96).data;
      let visible = 0, border = 0;
      for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
        const a = data[(y * 96 + x) * 4 + 3]; if (a > 127) visible++;
        if (x === 0 || y === 0 || x === 95 || y === 95) border += a;
      }
      expect(visible).toBeGreaterThan(500); expect(border).toBe(0);
    }
  });

  it('loads versioned PNG icons instead of overriding them with runtime drawings', () => {
    vi.stubGlobal('document', { createElement: (tag: string) => new DomNode(tag) });
    vi.stubGlobal('Image', class extends DomNode {});
    try {
      for (const id of ['cola_mints', 'mints']) {
        const box = itemIcon(id) as unknown as DomNode;
        expect((box.children[1] as unknown as { src: string }).src).toMatch(new RegExp(`assets/story-icons/${id}\\.png\\?v=`));
      }
    } finally { vi.unstubAllGlobals(); }
  });
});
