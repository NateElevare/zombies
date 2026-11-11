# Arcade implementation

`newArcade(seed?)` and `stepArcade(state, input, dt)` now implement the arena using shared player, combat, inventory, zombie and physics modules. No changes to `types.ts` or `core.ts`.

- The arena occupies (6800, 7200) through (9200, 8800), with solid concrete perimeter walls, seeded cars, furniture, barriers, trees, asphalt lot, blood and debris. The center stays clear. Twelve spawn gates are positions inside the perimeter, with a clear edge lane; they do not create holes through which the player could escape. Spawning requires free space, separation from other zombies, and distance greater than 700 plus the zombie radius from the player. All generation, type, drop and visual rolls use `rand(state)`.
- Legacy wave settings: six initial zombies, four more each wave, 0.6-second spawn interval accelerated by 3.5% per wave (capped at double pacing), 60 alive maximum, and five-second intermissions. Runners unlock at wave 3, brutes at 5, crawlers at 7, bloaters at 9. Shared zombie base stats gain the legacy 6% health and 1.5% speed per wave, with speed growth capped at 30%. Each tick refreshes chase target, sight and memory before shared AI runs.
- Kills award type points times wave: walker 10, runner 15, brute 30, crawler 12, bloater 25. `arcade.score` tracks the run and `arcade.best` tracks the record. Best loads from and saves to `deadzone_arcade_best`, guarded against absent or throwing storage. Actor references survive shared dead-zombie compaction so scoring is independent of event draining. A per-zombie marker prevents duplicate rewards.
- Legacy drop chance is 18%, then 45% ammo / 35% health / 10% shotgun / 10% SMG. Drops last 20 seconds, contain one stack and use deterministic IDs derived from zombie IDs. Health is two bandages in one stack for 30 HP; ammo uses an existing ammo item for the owned primary (or pistol) and supplies 1.5 magazines, rounded up. Weapon pickups equip primary with a full shared-stat magazine and two reserve magazines. Touch collection checks reachability and emits pickup sound and toast. Unaccepted ammo stays in the drop when inventory is full.
- Starter equipment is the shared pistol in secondary, knife in melee, and 120 reserve rounds. This uses finite inventory ammunition instead of the legacy infinite pistol reserve. Shared weapon stats, reloads and hold-to-fire behavior remain authoritative. Food, water and stamina stay full; there is no passive survival healing, starvation, bleeding, looting, building, XP or tech progression.
- Like `game.step`, inactive screens, pause, overlays and invalid dt return before interpolation snapshots or tick increments. Arcade pauses for every non-null UI, including build. Active ticks snapshot first, update player/combat/AI, award kills, collect pickups and run the wave director. Death ends the run once, persists best, and emits a toast and game-over sound; shared player code normally emits `playerDied`, with an arcade fallback for externally zeroed HP. No death bag or respawn is introduced.

## Necessary shared edits

- `player.ts`: arcade guards keep stamina full, skip survival needs and interactions, and prevent bleeding from damage. Movement, aiming, sprint speed, weapon switching and damage still use the shared implementation.
- `zombies.ts`: survival-only XP/loot prevents arcade kills from generating survival rewards; survival-only stuck relocation prevents world spawn queries from moving arena enemies outside the perimeter. Existing population/horde mode guards remain intact.
- `tests/zombies.test.ts`: the kill/XP test now explicitly selects survival mode. Its arcade fixture had only been a shortcut to disable population spawning, but arcade no longer grants XP. The test still asserts survival XP and all original hit/death feedback.

## Validation

`tests/arcade.test.ts` covers seeded arena and combat determinism, props/perimeter/starter kit, wave count/pacing/stat ramps and intermissions, type thresholds, safe gates, persistent chase and no survival population, pickup collection/expiry, score and best persistence, pause/input guards, death/storage failure, and a 60-second bot run using real combat and reloads.

Final checks: `npx tsc --noEmit` passes; `npx vitest run` passes all 82 tests across 13 files, including all 10 arcade tests.
