import { loadImage } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHARACTERS } from '../../src/characters';
import { canvas, savePng, contactSheet, type Frame } from '../lib/core';
import { buildPlayerFrames, buildWeapons, PFRAME, type HandInfo } from './player';

const SOURCE = join(process.cwd(), 'art/source/player-pixel');
const COLORS = {
  survivor: { pants: '#3a4658', shoes: '#4e3d2c', denim: true },
  scout: { pants: '#303036', shoes: '#38312e', denim: false },
  responder: { pants: '#44494d', shoes: '#262526', denim: false },
};

export async function buildPixelPlayerFrames(): Promise<Frame[]> {
  const layout = JSON.parse(readFileSync(join(SOURCE, 'layout.json'), 'utf8')) as { frames: string[]; hands: Record<string, HandInfo> };
  const frames: Frame[] = [];
  const weapons = buildWeapons(), pistol = weapons.frames.find(f => f.name === 'weapon_pistol')!;
  const grip = weapons.meta.pistol;
  for (const character of CHARACTERS) {
    const image = await loadImage(join(SOURCE, `${character.id}.png`));
    if (Math.abs(image.width / image.height - 2) > 0.02) throw new Error(`${character.id}: invalid torso sheet grid`);
    const cw = image.width / 8, ch = image.height / 4;
    const own: Frame[] = [];
    for (const [i, base] of layout.frames.entries()) {
      const { c, g } = canvas(PFRAME, PFRAME);
      g.imageSmoothingEnabled = false;
      g.drawImage(image, (i % 8) * cw, Math.floor(i / 8) * ch, cw, ch, 0, 0, PFRAME, PFRAME);
      const pixels = g.getImageData(0, 0, PFRAME, PFRAME).data;
      let clear = 0, visible = 0;
      for (let p = 3; p < pixels.length; p += 4) { if (pixels[p] === 0) clear++; if (pixels[p] > 127) visible++; }
      if (clear < PFRAME * PFRAME * 0.25 || visible < 100) throw new Error(`${character.id} ${base}: empty frame or opaque background`);
      own.push({ name: base.replace('player_', `player_${character.id}_`), canvas: c });
    }
    const legs = buildPlayerFrames(COLORS[character.id]).frames.filter(f => f.name.startsWith('player_legs_'));
    own.push(...legs.map(f => ({ ...f, name: f.name.replace('player_', `player_${character.id}_`) })));
    // Preview uses exactly the same layered pose and weapon grip as the game.
    const { c, g } = canvas(PFRAME, PFRAME);
    g.drawImage(legs.find(f => f.name === 'player_legs_idle_0')!.canvas, 0, 0);
    const hand = layout.hands.player_torso_handgun_idle_0;
    g.save(); g.translate(PFRAME / 2 + hand.hand[0] * 2, PFRAME / 2 + hand.hand[1] * 2); g.rotate(hand.weaponAngle);
    g.drawImage(pistol.canvas, -grip.ox, -grip.oy); g.restore();
    g.drawImage(own[0].canvas, 0, 0);
    savePng(join(process.cwd(), 'public/assets/players', `${character.id}.png`), c);
    contactSheet(join(process.cwd(), 'art/preview', `player_${character.id}.png`), own, 8, '#303437');
    frames.push(...own);
  }
  return frames;
}
