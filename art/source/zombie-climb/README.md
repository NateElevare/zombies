# Window climbing poses

Generated with the built-in imagegen tool using `art/preview/pixel-zombie-variants.png` as the character/style reference. Exact prompts and the heavy-sheet background cleanup are recorded in `prompts.json`.

Four columns: reach and brace, pull and tuck, drag the trailing leg across, release and land. All poses face east in the existing overhead style. No window is baked into the sprites; the existing environment window and broken-glass art remains responsible for the sill.

- `walkers.png`: walker variants 0–3, one per row.
- `runners-crawlers.png`: runner variants 0–2, then crawler variants 0–1.
- `heavies.png`: brute variants 0–1, then bloater variants 0–1.

Rebuild with `npm run art:climb`. The separate `zombie_climb` atlas contains 52 frames and 13 sequences; existing zombie atlases are preserved. The importer keeps alpha, uses nearest-neighbor filtering and a uniform scale across each sheet, with 128px standard frames and 192px heavy frames matching the existing character contract.

The simulation publishes `windowClimb` from actual window overlap in Long Road only. Progress follows distance across the window, not a timed loop; the renderer chooses the corresponding pose and rotates across either wall orientation. It switches back to the normal atlas when the zombie clears the window. Damage tint remains active while climbing. Bosses and Arcade do not use these poses. No movement speed, collision, damage, pathfinding or window-breaking rules were changed.

Verify with `tests/zombie-climb.test.ts` and `tools/check-zombie-climb.mjs`. Preview: `art/preview/zombie-climb.png`.
