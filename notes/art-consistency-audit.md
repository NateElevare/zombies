# Legacy art consistency audit

The current player sprites establish the target: textured, muted pixel illustration with charcoal outlines and readable human silhouettes. The campaign had used the earlier procedural humanoid renderer and flat shape-based props, portraits and vignettes. The art specification still claimed the player was procedural and forbade pixel art, inviting further mismatches.

| Family reviewed | Result |
| --- | --- |
| Player variants, equipment and weapons | Retained approved artwork and attachment system; these define scale and facing. |
| Zombies and five bosses | Existing authored pixel sheets match the actors; retained. |
| Blood, fire, smoke, combat warnings | Existing pixel FX and code-native geometry retained. |
| Terrain, walls, roofs, trees, city furniture and vehicles | Retained established textured city baseline shared with Arcade; this is not a wholesale pixel conversion of the city. |
| Named campaign NPCs | Replaced procedural bodies with authored Mara, Eli, June and Ruth sheets, wardrobe details and distinct animations. |
| Generic residents | Six authored identities with idle, walking, working and resting art. |
| Campaign rendering | Matched player scale (0.5), selected real frame counts, enabled nearest filtering, preserved prop aspect ratios. |
| Shared campaign furniture | Reused city bed, cot, workbench, stove, storage, shelf, cart and planter artwork. |
| Unique campaign props / vehicles | Authored sheets with powered, damaged and progression states; corrected camera perspective before import. |
| Dam | Repeated overhead wall segments instead of stretching one sprite over the entire wall. |
| Dialogue / community portraits | Replaced procedural faces with painted pixel portraits. Named expressions are distinct; generic portraits are neutral. |
| Cargo icons | Replaced tiny furniture crops with recognizable pills, sutures, hinges, keys, battery, relay components and supplies. |
| Chapter / ending art | Replaced repeated geometric drawings with seven distinct narrative scenes. |
| Journal, HUD, markers, lettering | Existing functional typography/layout retained; sign lettering over authored worn wood. |
| Documentation / regeneration | Corrected active direction; recorded prompts and provenance. Campaign rebuild cannot fall back to the humanoid generator. |

Scope is the legacy top-down campaign. The separate angled camera's campaign markers remain as before. Existing Arcade textures, mechanics, weapon attachments and enemy behavior were not changed.

Validation covers transparent padded character/prop frames, all 204 distinct character frames and runtime pose references, milestone scenery references, campaign gameplay, TypeScript/build, and real-browser campaign/journal/mode-switch checks. Visual review includes contact sheets and screenshots in `tools/out/campaign/`.
