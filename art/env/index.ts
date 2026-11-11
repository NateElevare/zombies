// art/env/index.ts — ENVIRONMENT generator: tiles, walls, props (furniture, cars, nature, decals),
// structures and drops. Writes atlases + a manifest fragment; previews go to art/preview/.
import { join } from 'node:path';
import { packAtlas, type ManifestFragment, type Canvas } from '../lib/core';
import { buildTiles } from './tiles';
import { buildWalls } from './walls';
import { Registry } from './prop';
import { buildFurniture } from './furniture';
import { buildCars } from './cars';
import { buildNature } from './nature';
import { buildDecals } from './decals';
import { buildStructures } from './structures';
import { PREVIEW, tileRepeatSheet, spriteSheet } from './preview';
import { streetScene } from './scene';

export default async function env(): Promise<ManifestFragment> {
  const t0 = Date.now();
  const atlases: string[] = [];
  const log = (r: { name: string; w: number; h: number; count: number }) => { atlases.push(r.name); console.log(`  ${r.name}: ${r.w}x${r.h}, ${r.count} frames`); };

  // ---- tiles
  const { frames: tileFrames, tiles } = buildTiles();
  log(packAtlas('env_tiles', tileFrames));

  // ---- walls
  const { frames: wallFrames, info: wallInfo } = buildWalls();
  log(packAtlas('env_walls', wallFrames));

  // ---- props + structures
  const reg = new Registry();
  buildFurniture(reg);
  buildDecals(reg);
  buildCars(reg);
  buildNature(reg);
  const structCanvases = buildStructures(reg);
  // fences live in env_walls as strips
  reg.props['fence:wood'] = { atlas: 'env_walls', frames: ['fence_wood_h', 'fence_wood_v'], fit: 'tile', nativeSize: [64, 8], orient: 'h', pad: 0, note: 'h strip for horizontal fences, v strip for vertical; tile along length, scale thickness to rect' };
  reg.props['fence:chain'] = { atlas: 'env_walls', frames: ['fence_chain_h', 'fence_chain_v'], fit: 'tile', nativeSize: [64, 8], orient: 'h', pad: 0, seeThrough: true };
  reg.alias('fence:chainlink', 'fence:chain');

  const byAtlas = new Map<string, { name: string; canvas: Canvas }[]>();
  for (const s of reg.sprites) { if (!byAtlas.has(s.atlas)) byAtlas.set(s.atlas, []); byAtlas.get(s.atlas)!.push({ name: s.name, canvas: s.canvas }); }
  for (const [atlas, frames] of byAtlas) log(packAtlas(atlas, frames));

  // ---- sprite metadata for directly-addressed frames
  const sprites: Record<string, any> = {};
  for (const s of reg.sprites) if (/^(drop_|struct_|decal_crosswalk$|decal_manhole$)/.test(s.name)) sprites[s.name] = { atlas: s.atlas, origin: [0.5, 0.5] };

  const propsFallback = {
    furniture: 'furniture:cabinet', car: 'car:sedan', tree: 'tree:oak', rock: 'rock:rock', fence: 'fence:wood',
    decor: 'decor:debris', structure: 'structure:stash', drop: 'drop:loot',
  };
  // lot surfaces / ground decor -> tile materials
  const tileAliases = {
    park: 'grass', field: 'grass', lawn: 'grass', forest: 'forest_floor', base: 'parking', lot: 'parking',
    concrete_lot: 'sidewalk', plaza: 'sidewalk', path: 'dirt', path_plaza: 'sidewalk', drive: 'parking', alley: 'asphalt_cracked',
    rural: 'dirt', street: 'asphalt', avenue: 'asphalt', dirt_road: 'dirt', floor_default: 'wood',
  };

  // ---- previews
  try {
    const mats: Record<string, Canvas[]> = {};
    for (const [m, names] of Object.entries(tiles)) mats[m] = names.map((n) => tileFrames.find((f) => f.name === n)!.canvas);
    const keys = Object.keys(mats);
    tileRepeatSheet(join(PREVIEW, 'env_tiles_3x3_a.png'), Object.fromEntries(keys.slice(0, 11).map((k) => [k, mats[k]])), 4);
    tileRepeatSheet(join(PREVIEW, 'env_tiles_3x3_b.png'), Object.fromEntries(keys.slice(11).map((k) => [k, mats[k]])), 4);
    spriteSheet(join(PREVIEW, 'env_walls.png'), wallFrames, 1200, '#3a3c36');
    for (const [atlas, frames] of byAtlas) spriteSheet(join(PREVIEW, `${atlas}_sheet.png`), frames, 1800, atlas === 'env_props2' ? '#353a2e' : '#4a4740');
    streetScene(join(PREVIEW, 'street_scene.png'), { tiles: mats, reg, walls: Object.fromEntries(wallFrames.map((f) => [f.name, f.canvas])) });
    void structCanvases;
  } catch (e) { console.warn('  preview failed:', (e as Error).stack); }

  console.log(`  env: ${Object.keys(reg.props).length} prop keys, ${Date.now() - t0} ms`);
  return { atlases, tiles, props: reg.props, sprites, wallInfo, propsFallback, tileAliases };
}
