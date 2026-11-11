# Angle Lab 03

Open **OPEN ANGLE LAB** in the main menu. Defaults: **45° tilt, 0° street rotation, 1.35× zoom**. This scene remains separate from Survival/Arcade and never writes their saves.

## Controls and behavior

- WASD/arrows move; mouse aims; click/Space fires. Shift runs, E reloads, Q shoves. R resets the scene and spawn countdown; Escape returns to the menu.
- One zombie starts in the scene, and another spawns every 30 seconds. Zombies navigate around the car and into the house. Disable **Zombies follow you** to inspect the art safely.
- Individual obstructing walls fade and recover smoothly. Their collision and bullet blocking remain active. The roof remains independently removable.
- **Sprite detail** switches BOTH characters between Standard (96×128 logical frames) and Detailed (256×256 logical frames). Detailed is the default. Ground position, visible body size, aiming envelope and collision do not change.
- The responder aims independently of travel. Forward movement uses walk/run, sideways movement uses the corresponding strafe, and backward movement uses backpedal. Animation cadence follows actual distance traveled; blocked movement does not keep walking. Mirrored directions swap left/right strafe sources appropriately.
- Firing while moving preserves the walking/strafe footwork with shot effects. Reload, shove and hurt reactions briefly plant the feet so these stationary poses do not slide.
- Touch movement buttons and Fire are available on narrow screens. Fire targets the nearest living zombie. Tapping the ground sets a movement target.

## Current character art

The responder is newly generated in the approved navy-and-yellow rescue outfit, with brown hair, black boots, medical pouch, radio, utility belt and pistol. The zombie retains the approved bald green head, red eyes, mauve vest and torn trousers. Both have five authored views (east, southeast, south, northeast, north), mirrored to cover eight screen-facing directions. These sheets are designed for the chosen 45° view. The other tilt presets still change world projection; they do not regenerate character art.

| Character | Animation frames per authored direction |
| --- | --- |
| Responder | Idle 2, shoot 2, walk 4, run 4, strafe left 4, strafe right 4, backpedal 4, reload 4, shove 4, hit 2, death 4, corpse 1 |
| Zombie | Idle 4, walk 8, run 8, attack 4, hit 4, death 8, corpse 1 |

There are 195 responder and 185 zombie frames per resolution. Death plays a collapse sequence and retains a corpse; it no longer fades the character away. To bound scene memory, only the newest sixteen zombie corpses remain.

Build with `npm run art:angle:characters`. The resulting atlases are:

- `public/assets/angle_responder_v3_standard.png` and `.json`
- `public/assets/angle_responder_v3_256.png` and `.json`
- `public/assets/angle_zombie_v3_standard.png` and `.json`
- `public/assets/angle_zombie_v3_256.png` and `.json`

Source PNGs and the exact built-in imagegen prompts are preserved in `art/angle/source/characters-v3/`. The importer detects transparent row gutters, registers the feet, keeps a uniform scale per direction, and exports both resolutions from the detailed source. Atlas rectangles are trimmed to save texture memory; JSON `sourceSize` records the complete logical frame dimensions and `spriteSourceSize` preserves the registration. The 256 version is sourced directly from the new detailed artwork, not enlarged from the Standard atlas. These are generated sprite sheets, not a single motion-captured rig; further frame-to-frame polish remains possible.

`registration.json` records source dimensions and scale. `art/preview/angle-responder-v3-directions.png`, `angle-zombie-v3-directions.png`, and the corresponding `*-actions.png` files provide inspection sheets. The importer records specific source-layout corrections: three zombie run rows repeated attack poses, so only valid running frames are used; the nine-row northeast source reuses its final settled body for corpse. These choices keep the exported animation contract complete without exposing incorrect poses.

## Environment and code

The sedan and bungalow use generated surface materials projected onto independent 2D faces. Materials: `public/assets/angle_house_materials.png` and `angle_sedan_materials.png`. Their originals and prompts are in `art/angle/source/`; rebuild via `npm run art:angle:materials`.

- `src/angle-lab/sprite-set.ts`: frame contracts, facing, gait selection and resolution registration.
- `src/angle-lab/math.ts`: projection, aiming inversion, collision, wall obstruction rays and defaults.
- `src/angle-lab/layout.ts` and `scenery.ts`: obstacles, textured props, roof and wall fade.
- `src/angle-lab/world.ts`: isolated combat, spawning, navigation and actor state.
- `src/scenes/AngleLabScene.ts`: input, scene lifecycle and drawing.

Earlier baked and reference-zombie atlases remain available for development but are not loaded by Angle Lab 03. Story now uses the same projection with the expanded pack described below; Arcade retains its overhead renderer. There is no runtime Three.js renderer in this scene.

Validation: `npm test -- tests/angle-lab.test.ts tests/angle-sprites.test.ts tests/ui-regressions.test.ts`, `npm run build`, and `tools/out/angle-lab/check-v3.mjs` against the local server.

## Story art pack

Story uses 45° tilt, zero street rotation and 1.35× zoom. Simulation coordinates and collision footprints remain on the ground plane; mouse aiming and movement are converted through the projection. Short wall sections sort against nearby actor feet, and obstructing walls and roofs fade independently.

The built-in imagegen source images and exact generation prompts are preserved in `source/story-v1/` and its `prompts/` directory. `inventory.json` records the code/world audit. The pack contains 46 atlases with 1,864 logical 256×256 frames and 56 inventory/build icons. Coverage includes all three player skins, ten held weapons, eleven wearables, twelve additional zombie variants (the approved original walker is retained), nine vehicle families with wrecks, 49 furniture types, ten buildables with door/stash states, item drops, wall/roof/floor materials, facades, vegetation and decals.

Player legs, torso, weapon and equipment are separate layers. Travel direction selects the gait while aim selects the body/weapon view; changing to a knife replaces both the pose and held weapon. Five authored directions mirror to eight. Imported frame rectangles are trimmed, with registration retained in atlas metadata. This is generated animation art; individual transitions can still benefit from further polish.

Run `npm run art:story` to pack the saved sources (preferring `-clean.png` corrections), then `npm run art:story:preview` for character combination previews, and `npm run build` to publish assets to the local server. Packing must finish before running tests or building. `public/assets/story-art.json` is the runtime manifest; `src/render/story-*.ts` implements routing, projection, character composition and scenery.

Validate with `npm test`, `npm run build`, and the local-browser scripts `tools/check-story.mjs` and `tools/check-story-art.mjs` using `--url http://localhost:8090`. Screenshots and browser logs go to the supplied `--out` directory.

## Animation polish pass

Story player locomotion uses 210 hip-registered frames: eight each for walk, run, left/right strafe and backpedal in five authored views, plus idle. The three built-in imagegen sheets are `source/story-v1/legs-v2-walk.png`, `legs-v2-run.png`, and `legs-v2-strafe.png`; their exact prompts are in `source/story-v1/prompts/legs-v2-*.json`. Opposite strafe and backpedal reverse the corresponding cycle. `story-legs.ts` registers the waistband at logical (128,134), preserving foot movement instead of recentering around boot bounds. Run `npx tsx art/angle/story-legs.ts` to repack only locomotion; the full Story pack invokes this automatically.

Zombie presentation uses distance-based strides, direction-boundary hysteresis, brief local pose dissolves and a 1.05-second collapse/settle. Pause freezes animation and dissolves; corpses move to the ground layer only after settling. Collision, AI speed and damage timing are unchanged. The newer variants still have sparse authored collapse poses; these transitions improve playback rather than supplying a fully articulated rig. Small whole-sprite rotations are avoided because they clip trimmed atlas frames in the current renderer.

Long tubs and beds choose views from their footprint axis; furniture height caps prevent end-on artwork from being stretched into oversized upright fixtures. The Story flashlight cone and its shadow mask are lifted together to hand/chest height while occluder queries stay at the physical player position.

`tools/check-story-motion.mjs` checks the eight-frame player cycle, all thirteen zombie deaths, pause, ground settling, both bathtub orientations, flashlight origin and Arcade cleanup.
