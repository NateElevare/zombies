# The Hive Below: delivered art

All 44 images from the art brief are generated with the built-in ImageGen tool and saved beside the brief. `generated.json` records the actual prompts, references, selected originals, and cleanup prompts. The untouched generated originals remain in Codex's generated-image directory.

## Contents

- 11 enemy sheets: walk (8), attack (6), hit (2), death (8), corpse (1), special (4).
- 8 boss sheets: six individual bosses plus both Queen forms. Each has 16 frames; the Queen's court uses the dedicated laying/lobbing/slamming/command/tearing sequence contract.
- 11 inventory weapon icons and 11 overhead held weapons.
- Ichor, royal jelly, and carapace vest icons.
- Five packed atlases, 472 frames, and 123 registered animations.

## Rebuild and preview

Run `npm run art:hive` from the project root. No image service is needed to rebuild the supplied PNGs. The importer preserves a fixed full-cell transform across each creature's animation, pads atlas frames, and writes runtime metadata to `public/assets/hive-art.json`. It fails if any required source is missing. `--partial` is a development-only option.

With the normal game server running, open `/hive-art-preview.html`. The preview includes creature/action selectors, animation playback, frame scrubbing, facing rotation, magnification, backgrounds, and all inventory/held weapons. The still contact sheets are under `art/preview/hive-*.png`.

## Runtime contract

BootScene loads these atlases, merges sprite metadata, and registers their animations. `manifest.hiveArt` holds the creature, weapon, and icon dictionaries. Enemy keys are `hive_<id>_0_<action>`; boss keys are `hive_boss_<id>_<action>`. Frame names append `_<frame number>`. All creature art faces +X at zero rotation. Cell sizes are 128/192 px for enemies, 192 px for bosses, and 384 px for the Queen. Origins stay at the cell centre. The manifest retains each supplied collision radius; consumers must apply their world sizing rather than equating full padded cell dimensions with collision diameter.

Held frames are `weapon_<id>` in `hive_weapons`. Origins use the brief's quarter-length grip, centred vertically. Grip/muzzle metadata is expressed at the existing art scale of 2; atlas positions are pixels. Icons are 80 px, available in both `assets/story-icons` and `assets/icons`. Creature action playback rates live in `src/hive-art.ts`.

The checkout contained the Hive plan and concept art, but no Hive enemy/weapon gameplay definitions when this pack was authored. These assets and animations are loaded and ready for that implementation; this delivery does not add spawning, attacks, damage, weapon statistics, or a playable Hive campaign. In-world grip/size tuning should be checked when those entities are implemented. AI-generated poses have been checked as sprite sheets, but their gameplay timing still needs that playtest.

Validation: `npx vitest run tests/hive-art.test.ts` checks source coverage, all animation references, actual PNG transparency/padding, frame dimensions, and weapon/icon metadata. `npm run build` checks the game integration.

## Code-drawn props (added with step 1 of the build)

The gameplay needed a few things the brief did not ask for. `art/hive/props.ts` draws them in code, in the same pixel
style, and `npm run art:hive` packs them into a sixth atlas, `hive_props` (32 frames, 9 animations; the pack is now
504 frames and 132 animations):

- `hive_burrow_0_walk|special|death|corpse` (192 px frames): a burrow mouth, erupting, caving in, rubble.
- `hive_egg_0_walk|special|death|corpse` (128 px frames): an egg cluster, wobbling, bursting, shells.
- `hive_rift_0..3` (256 px), `hive_seal_0` and `hive_seal_1` (192 px, sealed and withered), `hive_honey_0` (160 px),
  `hive_lump_0..2` (48 px, near-white so the renderer tints them to each cell's glow).

Burrow and egg use the enemy naming, so the zombie renderer draws them like any creature. To replace any of these
with painted art, deliver frames under the same names and drop the matching function from `props.ts`.
