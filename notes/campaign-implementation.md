> **Removed on 2026-11-11.** A Light in the Valley was taken out of the game at Nate's request: `src/sim/campaign*.ts`, `src/ui/campaign.ts`, `src/render/campaign.ts`, `tests/campaign.test.ts`, `tools/check-campaign.mjs` and `tools/check-story-legacy.mjs` are deleted (they are in git history on `main`). The cast art in `src/campaign-art.ts` stays: the road stories use it. What follows describes the story as it was.

# A Light in the Valley — playable campaign

Implemented from `campaign.md` and `campaign-art.md`, with the requested **legacy / overhead art** scope. The angled art pack is not regenerated or replaced.

## Playing

Start **Story / Survival → Legacy mode → New Game**. You start outside Bellwether Station 3. Click the objective tracker to open the Haven journal, or use the normal interact key near a survivor/objective. Ordinary loot, bed and structure interactions take priority over the journal.

The journal contains objectives, dialogue, the community ledger, radio records, and a valley map. Track an objective to highlight its map marker; known mission destinations remain visible through fog. Followers also appear on the map. Build the chapter-one rear door and two barricades in the highlighted north-wall openings, and place your bed inside Haven.

All six chapters have a completion path. Chapter 2 projects can be completed in any order. Power precedes the first nighttime signal. Evacuation preparations include optional medicine, a quieter road and a neighboring settlement. Launch is a deliberate player action. The ending opens continued free play and daily radio trades.

Existing saves without campaign data continue as their original survival worlds. Starting a new game uses the existing save-overwrite confirmation; no existing save is silently converted.

## Systems

- `src/sim/campaign-data.ts`: six chapters, cast and 38 authored objectives.
- `src/sim/campaign.ts`: prerequisites, costs, construction checks, quest cargo, escorts, services, power, encounters, progression and ending.
- `src/sim/campaign-world.ts`: deterministic landmarks, nearby starter shops, emergency supplies, a reservoir and northern service road. Haven has actual rear-door/window openings and reserved furniture collision.
- `src/sim/campaign-convoy.ts`: obstacle-aware bus routing, optional riding between encounters, saved route progress. If player construction blocks every route, Eli uses an offscreen outer service track so the campaign cannot be permanently blocked.
- `src/sim/campaign-save.ts`: shared local/cloud validation. Defense kills are explicitly recorded; unloading attackers, leaving an encounter or reloading does not award progress.
- Civilian navigation respects solid barricades and passes through player-accessible doors. Residents are protected noncombatants. In the finale their support provides treatment, repairs and ammunition.
- Main gates and the inner defense line use the normal breakable/repairable structure system. Player defenses and optional preparation affect the battle.

North Ridge is a newly authored **connected northern region within the existing 16,000 × 16,000 world**, with a reservoir and service road. It is not a separately streamed world/save. The campaign uses compact text dialogue and journal records; it does not add voiced cutscenes or a branching dialogue editor.

## Art

Run `npm run art:campaign` to rebuild only this pack. It imports authored pixel sheets from `art/source/campaign-pixel/` and reuses the city's existing furniture. See `art-consistency-audit.md` for the style audit.

- `campaign_people`: 204 authored frames, four named survivors (39 each) and six civilians (8 each). Overhead characters face right and rotate in the renderer; the angled five-direction contract does not apply.
- `campaign_props`: 173 frames, including Haven upgrade states, vehicles, landmark signs and mission props.
- `campaign_materials`: four water tiles for the reservoir.
- `public/assets/campaign/`: portraits, 80px cargo icons, six chapter cards, the ending card and pack metadata.
- `art/preview/campaign-people.png` and `campaign-props.png`: inspection sheets.

Art and lighting are connected to saved milestones. The overhead renderer shows the station gaining medical facilities, water storage, workshop equipment, power, kitchen, signage, radio, bunks and home furnishings. The angled renderer retains navigation labels without importing the overhead actor/prop art.

## Verification

`tests/campaign.test.ts` exercises the whole campaign, objective gating, construction, escorts, one-time rewards, daily services, optional preparation, convoy routing, save/load during defense and transit, invalid saves, and arcade isolation.

`node tools/check-campaign.mjs http://127.0.0.1:5175/` runs the real game in a temporary headless browser profile and saves screenshots under `tools/out/campaign/`. Use an already-running dev server. This checks desktop/mobile journal layout and returning to arcade, and reports browser exceptions.
