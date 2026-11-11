# Player character set

Survivor, Scout and Responder are available from the main-menu picker. Selection applies to new Survival and Arcade runs. The menu preference is stored under `deadzone_character`; Survival saves include `player.character`. Continue keeps the saved character, and legacy saves default to Survivor. These are cosmetic choices with identical gameplay stats.

Run `npm run art:chars2d` to rebuild the 2D characters, zombies and pixel effects. Player artwork lives in `public/assets/player_variants.png` and `.json`: 117 frames total, 39 per character. Menu previews are in `public/assets/players/`. `npm run art:fx` rebuilds only the pixel effects.

The three source sheets were generated with built-in image generation. Exact prompts are in `prompts.json`; the approved concepts are in `art/concepts/player-options/`. `pose-reference.png` preserves the original procedural pose geometry. `layout.json` records the 30 torso poses and weapon grip coordinates in row-major order on an 8-by-4 grid; the final two cells are unused.

The importer uses a uniform scale from each source cell to a 128-by-128 frame, retaining the centered torso pivot. It never independently centers each pose. Each character also gets nine procedural leg frames in matching trouser and boot colors. Runtime frame selection uses `player_<character>_torso_*` and `player_<character>_legs_*`; existing weapon and armor layers continue using the original attachment metadata. This keeps aiming separate from walking and supports reloads, recoil, melee and unarmed attacks. Alternative procedural and 3D builds fall back to their original player frames.

The particle atlas keeps all 76 existing frame names, sizes and origins. `art/fx/pixel.ts` draws native two-pixel clusters with a limited palette and crisp transparency. Blood, fire, smoke, dust, sparks, explosions, muzzle flashes and debris use this style in the 2D build. `art/fx/index.ts` retains the smooth recipes for the default 3D art build.

Checks: `npm test -- --run tests/ui-regressions.test.ts tests/save.test.ts tests/pixel-player-fx.test.ts tests/pixel-zombies.test.ts` and `npm run build`. Contact sheets are generated in `art/preview/player_<character>.png` and `art/preview/fx*.png`.
