import { join } from 'node:path';
import { OUT, packAtlas, savePng, contactSheet, type ManifestFragment } from '../lib/core';
import { bottle, colaIcon, mintsIcon, foam } from './pixel';

export default async function (): Promise<ManifestFragment> {
  const icons = { cola_mints: colaIcon(), mints: mintsIcon() };
  for (const [id, image] of Object.entries(icons)) savePng(join(OUT, 'icons', `${id}.png`), image);
  const frames = [
    { name: 'weapon_cola_mints', canvas: bottle() },
    { name: 'weapon_cola_mints_spray', canvas: bottle(true) },
    ...Array.from({ length: 4 }, (_, i) => ({ name: `cola_foam_${i}`, canvas: foam(i) })),
    ...Array.from({ length: 3 }, (_, i) => ({ name: `cola_splash_${i}`, canvas: foam(i, true) })),
  ];
  packAtlas('cola', frames);
  contactSheet(join(process.cwd(), 'art/preview/cola-mints.png'), [
    ...Object.entries(icons).map(([name, canvas]) => ({ name, canvas })), ...frames,
  ], 4, '#292d29');
  return { atlases: ['cola'], colaArt: 'pixel-v1', icons: { cola_mints: 'icons/cola_mints.png', mints: 'icons/mints.png' },
    sprites: { weapon_cola_mints: { atlas: 'cola', origin: [0.3, 0.5] }, weapon_cola_mints_spray: { atlas: 'cola', origin: [0.3, 0.5] }, cola_foam: { atlas: 'cola', origin: [0.5, 0.5] }, cola_splash: { atlas: 'cola', origin: [0.5, 0.5] } },
    anims: ['cola_foam', 'cola_splash'].map(key => ({ key, atlas: 'cola', frames: frames.filter(f => f.name.startsWith(key)).map(f => f.name), frameRate: key === 'cola_foam' ? 10 : 8, repeat: key === 'cola_foam' ? -1 : 0 })) };
}
