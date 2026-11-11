import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { BOSS_IDS } from '../src/sim/bosses';
import { BOSS_FRAME_SIZE, BOSS_SEQUENCES, bossFrame, bossPose, type BossPose } from '../src/boss-art';
import { newArcade, devBoss } from '../src/sim/arcade';
import * as zombies from '../src/sim/zombies';

describe('arcade boss pixel art', () => {
  it('ships transparent, distinct frames for every boss pose and valid animation references', async () => {
    const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8'));
    expect(manifest.bossArt).toBe('reference-pixel-overhead-v1');
    expect(manifest.atlases).toContain('bosses');
    const atlas = JSON.parse(readFileSync('public/assets/bosses.json', 'utf8'));
    const anims = JSON.parse(readFileSync('public/assets/anims.json', 'utf8')).filter((a: { atlas: string }) => a.atlas === 'bosses');
    expect(Object.keys(atlas.frames)).toHaveLength(80);
    expect(anims).toHaveLength(35);
    const image = await loadImage('public/assets/bosses.png'), c = createCanvas(BOSS_FRAME_SIZE, BOSS_FRAME_SIZE), g = c.getContext('2d');
    const hashes = new Set<string>();
    for (const id of BOSS_IDS) for (const [pose, seq] of Object.entries(BOSS_SEQUENCES)) {
      const key = `boss_${id}_${pose}`, anim = anims.find((a: { key: string }) => a.key === key);
      expect(anim.frames).toHaveLength(seq.count);
      for (let i = 0; i < seq.count; i++) {
        const name = bossFrame(id, pose as BossPose, (i + 0.01) / seq.rate), f = atlas.frames[name].frame;
        expect(anim.frames[i]).toBe(name);
        expect([f.w, f.h]).toEqual([192, 192]);
        expect(f.x + f.w).toBeLessThanOrEqual(image.width);
        expect(f.y + f.h).toBeLessThanOrEqual(image.height);
        g.clearRect(0, 0, 192, 192); g.drawImage(image, f.x, f.y, f.w, f.h, 0, 0, 192, 192);
        const pixels = g.getImageData(0, 0, 192, 192).data;
        let opaque = 0, clear = 0, border = 0;
        for (let y = 0; y < 192; y++) for (let x = 0; x < 192; x++) {
          const a = pixels[(y * 192 + x) * 4 + 3];
          if (a > 127) opaque++; if (a === 0) clear++;
          if (x < 8 || y < 8 || x >= 184 || y >= 184) border += a;
        }
        expect(opaque).toBeGreaterThan(500); expect(clear).toBeGreaterThan(192 * 192 * 0.25); expect(border).toBe(0);
        hashes.add(createHash('sha256').update(pixels).digest('hex'));
      }
    }
    expect(hashes.size).toBe(80);
  });

  it('maps actual attack states, cooldown resets and movement to boss poses', () => {
    const z = { boss: 'butcher' as const, hitFlash: 0, attackT: 10, x: 0, y: 0, prevX: 0, prevY: 0 };
    expect(bossPose(z)).toBe('idle'); expect(bossPose({ ...z, x: 1 })).toBe('walk');
    expect(bossPose({ ...z, attackT: 0.1 })).toBe('melee');
    for (const act of ['chargeWind', 'screamWind', 'leapWind', 'slamWind']) expect(bossPose({ ...z, act, actT: 0.2 })).toBe('windup');
    for (const act of ['charging', 'leaping', 'recover']) expect(bossPose({ ...z, act })).toBe('special');
    expect(bossPose({ ...z, act: 'slamWind', actT: 1.2 })).toBe('special');
    expect(bossPose({ ...z, act: 'stunned' })).toBe('hit');
    expect(bossPose({ ...z, hitFlash: 0.1 })).toBe('hit');
    expect(bossPose({ ...z, boss: 'broodmother', cd: { brood: 7 } })).toBe('special');
    expect(bossPose({ ...z, boss: 'broodmother', cd: { acid: 3.4 } })).toBe('special');
    expect(bossPose({ ...z, boss: 'juggernaut', cd: { boulder: 3.6 } })).toBe('special');
    expect(bossPose({ ...z, boss: 'plague', cd: { spit: 2.8 } })).toBe('special');
    expect(bossFrame('butcher', 'death', 90)).toBe('boss_butcher_death_2');
  });

  it('retains boss identity and size in the death event for the correct corpse', () => {
    const state = newArcade(7), z = devBoss(state)!;
    zombies.damage(state, z, 1e9, 0);
    expect(state.events.find(e => e.t === 'zombieKilled' && e.id === z.id)).toMatchObject({ boss: z.boss, radius: z.r });
  });
});
