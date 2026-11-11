import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadPixelZombieFrames } from '../art/characters/pixel-zombies';
import { ZTYPES, type ZType } from '../art/characters/zombies';
import { VARIANTS } from '../src/sim/zombies';

describe('overhead pixel zombie assets', () => {
  it('covers every simulated variant and animation with padded, distinct raster poses', async () => {
    let total = 0;
    for (const type of Object.keys(VARIANTS) as ZType[]) {
      expect(ZTYPES[type].variants).toBe(VARIANTS[type]);
      for (let v = 0; v < VARIANTS[type]; v++) {
        const frames = await loadPixelZombieFrames(type, v);
        expect(frames).toHaveLength(type === 'bloater' ? 29 : 25);
        total += frames.length;
        for (const [anim, count] of Object.entries({ walk: 8, attack: 6, hit: 2, death: 8, corpse: 1, ...(type === 'bloater' ? { pulse: 4 } : {}) })) {
          const seq = frames.filter(f => f.anim === anim);
          expect(seq.map(f => f.name)).toEqual(Array.from({ length: count }, (_, i) => `zombie_${type}_${v}_${anim}_${i}`));
          const hashes = seq.map(f => createHash('sha256').update(f.canvas.toBuffer('image/png')).digest('hex'));
          expect(new Set(hashes).size).toBe(count);
        }
        for (const f of frames) {
          const size = ZTYPES[type].frame;
          expect([f.canvas.width, f.canvas.height]).toEqual([size, size]);
          const data = f.canvas.getContext('2d').getImageData(0, 0, size, size).data;
          for (let p = 0; p < size; p++) {
            expect(data[p * 4 + 3]).toBe(0);
            expect(data[((size - 1) * size + p) * 4 + 3]).toBe(0);
            expect(data[p * size * 4 + 3]).toBe(0);
            expect(data[(p * size + size - 1) * 4 + 3]).toBe(0);
          }
        }
      }
    }
    expect(total).toBe(333);
  }, 30000);

  it('ships valid Phaser frames for every registered zombie animation', () => {
    const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8'));
    // The alternative 3D and procedural builds are allowed to replace the live atlases.
    if (manifest.characterInfo?.zombieArt !== 'reference-pixel-overhead-v1') return;
    const atlases = Object.fromEntries(['zombies', 'zombies2'].map(key => [key, JSON.parse(readFileSync(`public/assets/${key}.json`, 'utf8'))]));
    const anims = JSON.parse(readFileSync('public/assets/anims.json', 'utf8'));
    // Supplemental traversal poses have their own atlas and validation suite.
    const zombieAnims = anims.filter((a: { key: string; atlas: string }) => a.key.startsWith('zombie_') && a.atlas in atlases);
    expect(zombieAnims).toHaveLength(67);
    for (const anim of zombieAnims) for (const name of anim.frames) {
      const atlas = atlases[anim.atlas], frame = atlas.frames[name];
      expect(frame, name).toBeDefined();
      expect(frame.rotated).toBe(false);
      expect(frame.frame.x + frame.frame.w).toBeLessThanOrEqual(atlas.meta.size.w);
      expect(frame.frame.y + frame.frame.h).toBeLessThanOrEqual(atlas.meta.size.h);
    }
  });
});
