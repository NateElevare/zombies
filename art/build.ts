// art/build.ts — runs every generator and merges their manifest fragments.
// Each generator module default-exports `async () => ManifestFragment`.
// `npm run art` builds everything; `npm run art -- env` builds a subset and merges into the existing manifest.
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { OUT, writeFile, ART_SCALE, type ManifestFragment } from './lib/core';

// Characters: pre-rendered 3D (art/characters3d, Three.js in headless Edge/Chrome) by default.
// The original 2D canvas generator stays available for comparison/rollback: `ART_CHARS=2d npm run art`
// (or `npm run art -- --chars2d`).
const args = process.argv.slice(2);
const CHARS_2D = process.env.ART_CHARS === '2d' || args.includes('--chars2d');
const GENERATORS = [
  CHARS_2D ? 'characters/index.ts' : 'characters3d/index.ts', // player, zombies
  'fx/index.ts',         // CHARACTERS agent: fx
  'bosses/index.ts',     // overhead arcade boss sprites
  'warden/index.ts',     // story-only giant; separate atlas preserves existing boss art
  'climb/index.ts',      // overhead window traversal poses, all ordinary zombie variants
  'env/index.ts',        // ENVIRONMENT agent: tiles, walls, props, structures, drops
  'icons/index.ts',      // ENVIRONMENT agent: item + structure icons
  'cola/index.ts',       // Cola & Mints props, icons and foam
];
const only = args.filter((a) => !a.startsWith('--'));

const manifest: any = { artScale: ART_SCALE, atlases: [], sprites: {}, tiles: {}, props: {} };
const anims: any[] = [];
for (const rel of GENERATORS) {
  if (only.length && !only.some((o) => rel.startsWith(o) || (o === 'characters' && rel.startsWith('characters')))) continue;
  const file = join(process.cwd(), 'art', rel);
  if (!existsSync(file)) { console.log('skip (missing)', rel); continue; }
  const t = Date.now();
  const mod = await import(pathToFileURL(file).href);
  const frag: ManifestFragment = await mod.default();
  for (const [k, v] of Object.entries(frag)) {
    if (k === 'anims') anims.push(...(v as any[]));
    else if (k === 'atlases') manifest.atlases.push(...(v as string[]));
    else if (manifest[k] && typeof v === 'object' && !Array.isArray(v)) Object.assign(manifest[k], v);
    else manifest[k] = v;
  }
  console.log('built', rel, Date.now() - t, 'ms');
}
if (only.length) {
  try {
    const prev = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
    const prevAnims = JSON.parse(readFileSync(join(OUT, 'anims.json'), 'utf8'));
    const rebuilt = new Set(manifest.atlases);
    manifest.atlases = [...new Set([...prev.atlases, ...manifest.atlases])];
    // Switching character pipelines replaces the atlas contents. Drop old entries
    // owned by those atlases (e.g. 3D-only torso/gear frames) instead of retaining
    // animations that now reference nonexistent frames.
    const oldSprites = Object.fromEntries(Object.entries(prev.sprites || {}).filter(([, value]) => !rebuilt.has((value as any).atlas)));
    manifest.sprites = { ...oldSprites, ...manifest.sprites };
    for (const k of ['tiles', 'props', 'icons']) manifest[k] = { ...prev[k], ...manifest[k] };
    for (const k of Object.keys(prev)) if (!(k in manifest)) manifest[k] = prev[k];
    const keys = new Set(anims.map((a) => a.key));
    anims.unshift(...prevAnims.filter((a: any) => !keys.has(a.key) && !rebuilt.has(a.atlas)));
  } catch { /* first run */ }
}
writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
writeFile(join(OUT, 'anims.json'), JSON.stringify(anims, null, 1));
console.log('manifest:', manifest.atlases.length, 'atlases,', anims.length, 'anims');
