# Overhead pixel zombie assets

These source PNGs were generated with the built-in image generation tool using the user's zombie reference. The exact generation prompts are in `prompts.json`; `cleanup-prompt.txt` records the background-extraction pass. The upright concepts are saved separately in `public/assets/reference-zombie/`.

## Use in the game

Run `npm run art:chars2d`, then `npm run dev`. The build uses the existing procedural 2D player and these overhead zombie sprites. The current `public/assets` files already contain this set.

`npm run art:chars2d:procedural` restores the original procedural 2D zombies. `npm run art:chars` builds the existing 3D character set. These choices share output names; rerun the desired command to switch. Generated source PNGs survive every rebuild.

## Contract

| Type | Variants | Frame size | Frames per variant |
| --- | ---: | ---: | ---: |
| walker | 4 | 128 x 128 | 25 |
| runner | 3 | 128 x 128 | 25 |
| brute | 2 | 192 x 192 | 25 |
| crawler | 2 | 128 x 128 | 25 |
| bloater | 2 | 192 x 192 | 29 |

Total: **333 frames, 67 zombie animation sequences**. The infected appearance occupies walker variant 1, so no new enemy type or gameplay rules are required.

Each source sheet uses an 8-column, 4-row grid, read left to right:

- Row 1: walk 0 through 7.
- Row 2: attack 0 through 5, then hit 0 and 1.
- Row 3: death 0 through 7.
- Row 4: corpse 0; bloaters also use columns 2 through 5 for pulse 0 through 3. Remaining cells are unused.

The importer reads actual PNG dimensions rather than assuming the requested generation size. It preserves cell centers and uses one uniform nearest-neighbor scale for the entire sheet, with eight pixels of transparent padding. It does not stretch individual poses to their bounding boxes. All frames face +X from directly overhead, with origin (0.5, 0.5) and the existing ART_SCALE of 2.

The build writes `public/assets/zombies.png` + `.json` (225 frames) and `zombies2.png` + `.json` (108 frames), plus the existing manifest and animation JSON. Frame keys remain `zombie_<type>_<variant>_<animation>_<index>`. Zombie textures use nearest-neighbor sampling when this set is active. No directional sheets are needed because the renderer rotates overhead sprites continuously.

## Validation

`npm test -- --run tests/pixel-zombies.test.ts` checks every variant, frame count, unique pose, output dimensions, transparent borders and active zombie atlas references. `npm run build` checks TypeScript and produces the client. Inspect `art/preview/zombies_*.png` and `walkstrip_<type>_<variant>.png` after rebuilding.

The raster artwork is AI-generated; its animation timing follows the existing game and may still benefit from artistic polish after playtesting. The source PNGs are retained so the atlas build is reproducible without another generation call.
