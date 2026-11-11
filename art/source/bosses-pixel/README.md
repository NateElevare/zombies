# Arcade boss art

## The Warden (story-only)

The Warden has its own overhead sheet at `warden.png`: concrete and rebar back armor, chipped olive military plates, chains, burgundy coat scraps and oversized fists. Built-in image generation prompts, including the overhead-camera correction, are in `warden-prompts.json`.

Run `npm run art:warden` to build only its dedicated `public/assets/warden.png` / `.json` atlas and seven animation sequences. Sixteen 384px frames retain detail at the existing giant draw radius; other bosses stay at 192px. Pose order is the same 4 × 4 contract below. `art/preview/warden.png` is the animation contact sheet, and `art/preview/warden-idle.png` is the isolated preview.

The Warden no longer borrows or recolors the Juggernaut. Its living and death art share the visual radius, independently of collision size. Normal rage/hit/windup feedback remains. Combat stats, stages and the five-boss Arcade rotation are unchanged. Verify with `tests/warden-art.test.ts` and `tools/check-warden-art.mjs`.

Five overhead, east-facing pixel-art sheets generated with the built-in image tool.
Exact prompts are stored in `prompts.json`. Each transparent source uses a 4 by 4
grid, with consistent cell centers and scale. The atlas importer preserves alpha
and resizes uniformly with nearest-neighbor sampling.

Cells: idle (2), walk (4), melee (2), windup (2), special (2), hit (1), death (3).
The last death frame is also the corpse. The renderer uses the existing boss
attack state/cooldowns to select poses without changing damage or timing.

Rebuild: `npm run art:bosses`, then `npm run build`.

Output: `public/assets/bosses.png` and `bosses.json` (80 frames, 192px cells),
registered in the normal manifest and animation files. The cache-versioned boot
loader uses nearest-neighbor filtering. `art/preview/boss-lineup.png` shows all
five designs; `art/preview/bosses.png` shows the complete animation set.

Hazards remain code-native in `src/render/bosses.ts`: pixel acid/toxic bubbles,
spit trails, faceted boulders, stepped shockwaves, and stun stars. Danger radii,
charge lanes, attack timing and damage still come from the existing simulation.

Quick in-game check: start Arcade, press F9, then use **Boss (arcade)** to cycle
through the five bosses. Tests: `npm test -- tests/boss-art.test.ts tests/bosses.test.ts`.
