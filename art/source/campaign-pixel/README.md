# Legacy campaign artwork

These source PNGs were created with the built-in image generation tool to match the current overhead player, zombie and boss art. Exact prompts and perspective corrections are recorded in `prompts.json`. Runtime assets live in `public/assets/`, never in the tool's output directory.

Rebuild with `npm run art:campaign`. The importer at `art/campaign/build.ts` does not use `drawFigure` or the old humanoid rig. It preserves alpha, uses nearest-neighbor resizing, pads atlas frames, and keeps a fixed center and scale through each character's animation. Inspected prop seams are recorded in the importer to avoid neighboring-cell fragments.

| Source | Layout / use |
| --- | --- |
| mara, eli, june, ruth | 8 × 5 grid; 39 named poses plus one unused cell |
| residents | 6 columns (one identity each), 8 rows: idle, walk × 4, work × 2, sit |
| machinery | 4 × 4: generator/radio states, lantern/flare/light states, tower, solar |
| vehicles | 4 × 4: one row each fire engine, bus, flatbed, semi; parked/alternate/lit/damaged |
| civic | 4 × 4: tank, tent, hose, laundry, nook, ledgers, documents, IV, dam, gates, barrier |
| portraits | 4 × 4: named characters by row; neutral/worried/relieved/firm by column |
| resident-portraits | 3 × 2, six resident identities |
| icons | 4 × 4; first 14 cells are campaign cargo, last two unused |
| chapters | 2 × 4; six chapter scenes, ending, signboard material |

`src/campaign-art.ts` is the shared frame contract. Four named characters have 39 frames each; six residents have eight each: **204 actual character frames**. Residents use the smaller authored set rather than pretending unused combat/death sequences exist. Their portraits are neutral; legacy expression filenames alias those neutral images. Named characters have 16 distinct expression portraits.

`campaign_props` retains its 173-frame compatibility contract. Static objects repeat their art under existing state suffixes; generators, radios, lights, gates, vehicles and ledgers have meaningful authored states. Beds, workbenches, kitchen equipment and storage come directly from city atlases. `public/assets/campaign/pack.json` records prop provenance.

Output includes 14 cargo icons and seven narrative illustrations. Sign lettering remains code-rendered for readability. Water, light sources and interaction markers remain code-native. No Arcade atlas or angled source is rewritten by this build.

Check with `npm test -- tests/campaign-art.test.ts tests/campaign.test.ts`, `npm run build`, and `node tools/check-campaign.mjs` against the dev server. Contact sheets: `art/preview/campaign-people.png`, `campaign-animations.png`, `campaign-props.png`.
