import { describe, expect, it, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { CHARACTERS, characterFrame, preferredCharacter, rememberCharacter } from '../src/characters';
import { pixelEffect } from '../art/fx/pixel';

afterEach(() => vi.unstubAllGlobals());
describe('character rendering', () => {
  it('resolves every existing player pose for all three characters', () => {
    const base = JSON.parse(readFileSync('public/assets/characters.json', 'utf8')).frames;
    const variants = JSON.parse(readFileSync('public/assets/player_variants.json', 'utf8')).frames;
    const poses = Object.keys(base).filter(k => /^player_(torso|legs)_/.test(k));
    expect(poses).toHaveLength(39);
    expect(Object.keys(variants)).toHaveLength(117);
    for (const { id } of CHARACTERS) for (const pose of poses) {
      const chosen = characterFrame(pose, id, true, name => !!variants[name]);
      expect(chosen).toBe(pose.replace('player_', `player_${id}_`));
      expect(variants[chosen].sourceSize).toEqual({ w: 128, h: 128 });
    }
    expect(characterFrame('player_legs_walk_0', 'scout', false, () => true)).toBe('player_legs_walk_0');
    expect(characterFrame('player_legs_walk_0', 'scout', true, () => false)).toBe('player_legs_walk_0');
  });
  it('remains usable when browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } });
    expect(preferredCharacter()).toBe('survivor');
    expect(() => rememberCharacter('scout')).not.toThrow();
  });
});
describe('pixel particle effects', () => {
  it('preserves every FX frame size and draws crisp alpha with nonempty frames', () => {
    const frames = JSON.parse(readFileSync('public/assets/fx.json', 'utf8')).frames;
    for (const [name, item] of Object.entries(frames) as [string, any][]) {
      const { w, h } = item.sourceSize;
      const c = pixelEffect(name, w, h), pixels = c.getContext('2d').getImageData(0, 0, w, h).data;
      let solid = 0, clear = 0, partial = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] !== 0 && pixels[i] !== 255) partial++;
        if (pixels[i] === 255) solid++; else clear++;
      }
      expect(solid, name).toBeGreaterThan(0);
      expect(clear, name).toBeGreaterThan(0);
      expect(partial, name).toBe(0);
    }
  });
});
