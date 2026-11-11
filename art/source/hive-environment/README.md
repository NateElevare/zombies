# Chitin Hive environment

## Curved Hive boundaries

The first area now uses `warrens-ribbons.png`: three broad overlapping shingle bands, loose fragments, worn floor detail, and a thin resin seam. Generated with the built-in imagegen tool; the exact prompt and original output path are recorded in `warrens-revision.json`. `art/hive/warrens.ts` packs these into `public/assets/hive_warrens.{png,json}` and adds them to the environment manifest. The normal environment build runs this importer too.

All eight Hive areas use the curved perimeter renderer. `src/sim/hive-shape.ts` smooths the authored 80px grid into a curved occupancy field with subtle long-wave variation, sampled at 10px and cached by sector. Merged rectangles from that shared shape drive floor textures, movement, bullet collision, and line of sight. The original tile-centre route retains a rounded clearance corridor; the mission graph, sites, and saves stay intact. The Breach includes a narrow band of its exterior rock so its natural rim can round too; the concrete dam and sector seal openings retain their authored shape.

The Warrens use their shingle ribbons. Other areas overlap their own existing wall paintings along the curved contour, retaining their distinct materials. Wall art clips against the shared interior footprint with a small natural edge overhang. Resin details and lights share cached anchors on that contour. Existing area lighting is retained, including Warrens visual darkness of 0.42. No new source paintings or gameplay balance changes are part of this extension; Arcade is unchanged.

`tests/hive-shape.test.ts` checks floor/collider agreement, curved wall tangents, the dam and seal openings, and player-width clearance along the entire Hive route. `tests/hive.test.ts` and `tests/hive-cells.test.ts` cover progression, seals, spawning, later-sector hazards and bosses against the new boundary.

`node tools/check-warrens.mjs http://127.0.0.1:5183/` checks the boot-loaded atlas, Warrens/Granary lighting isolation, painted fixtures, seals, collapse, and Arcade cleanup in a separate browser profile. Gameplay screenshots use normal lighting; `-materials` screenshots hide the light overlay only for inspection.

Approved direction: the Chitin Hive concept in `reference-chitin.png`. Generated with the built-in imagegen tool. Original prompts are in `prompts.json`; selected output paths and the Paper Hive / Boiling Galleries revision prompts are in `generated.json`. The final floor revision is recorded in `floor-polish.json`: it removes large cracks that formed repeating shapes when tiled. The `-v1` files preserve revision inputs.

The eight area sheets each contain six separate transparent painted objects: two wall caps, a burrow, eggs, a light-source knot, and a resin seal. `floors.png` contains eight opaque floor materials, ordered by zone id in a 4 by 2 grid.

| Zone | Area | Materials |
| --- | --- | --- |
| 1 | Warrens | Rust-brown ant chitin and amber resin |
| 2 | Granary | Fungal growth over olive-brown shells |
| 3 | Paper Hive | Torn wasp paper, comb recesses, yellow wax |
| 4 | Boiling Galleries | Scorched beetle plates, ash, orange fissures |
| 5 | Lantern Deep | Cold dark shells, silk, sparse blue threads |
| 6 | Rot Cellar | Sodden roach shells, mycelium, grey-violet resin |
| 7 | Royal Cell | Violet queen carapace and crystalline resin |
| 8 | Breach | Reservoir silt, broken stone and encroaching shells |

Build with `npm run art:hive:environment`; `npm run art:hive` also rebuilds this pack. The importer detects the six separate silhouettes before cropping, preserving tips that cross an invisible grid line. It fits props into padded 256px frames and packs 512px floor tiles with extruded edges. It does not modify the source paintings.

Runtime files: `public/assets/hive_environment.{png,json}`, `hive_floors.{png,json}`, `hive_warrens.{png,json}`, and `hive-environment.json`. BootScene loads the pack separately from creature art. Only the Hive map consumes these materials. Floors use world-aligned mirrored repeats and cache-consistent wear patches, clipped to the curved footprint. Painted light sources are baked into the ground cache. Burrows and eggs use the current zone's art, retaining hatch/eruption pulses and existing collision sizes. Destroyed fixtures leave darkened shell rubble. Closed seals use painted plugs; opened gates retain small withered remnants.

Story progression, saves, enemy spawning rules, and Arcade balance are unchanged. Only the local cave boundaries are rounded; the authored rooms, routes, sites, and arenas are retained.

Validation: `npm test -- tests/hive-environment.test.ts tests/hive-art.test.ts tests/hive.test.ts tests/bosses.test.ts tests/arcade.test.ts`, `npm run build`, and `node tools/check-hive-environment.mjs http://127.0.0.1:5183/`. The browser check uses its own temporary profile, visits each area, checks seals/collapse, and switches to Arcade to check cleanup. Its `-materials` screenshots intentionally hide the lighting overlay for texture inspection; the other screenshots use actual gameplay lighting.
