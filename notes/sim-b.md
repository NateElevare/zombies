# SIM-B integration notes

## Shared-type requests

No blocking shared-type changes. `types.ts` and `core.ts` were not edited.

- Player's private `_exhausted`, `_regenDelay`, `_noiseT`, `_bleedFx`, and `_intT` fields use a local `RuntimePlayer` extension. They need not be public or saved.
- Zombie AI bookkeeping uses a local `AiZombie` extension. Population timers and the per-state zombie ID sequence are in `state._zombies`.
- World generation preserves the legacy's extra layout and visual metadata internally (room types, facade colors, road crossings, district lookup). Public fields include every new visual key. No RNG is consumed to add these keys.

## SIM-A integration request

The real-module smoke test exposed a bullet source mismatch: `combat.ts`'s direct bullet hit currently calls `zombies.damage(..., { source: 'player', crit })` (around line 243). Please change that direct bullet path to `source: 'bullet'`, per the requested SIM-B contract. This is nonblocking: zombies currently also recognize that precise legacy direct-bullet signature (requires a boolean `crit` and excludes melee/burn/explosions), emitting the same flesh impact. Melee, burn, explosions and thorns retain their own source flags. SIM-B does not edit SIM-A files.

SIM-A's notes have been integrated: `player.damage` calls `combat.onPlayerHurt(state)` after an accepted hit for thorns/combat regen timers, and `newGame` binds inventory events before adding starter items.

## API differences from legacy

- All modules use ES imports, explicit `GameState`, and queued sim events; no drawing, camera, DOM or global `Z` access.
- `world.generate(state)` preserves the legacy layout and container ID sequence. Queries remain state-first; `buildingsIn` is also retained. Runtime spawn queries default to `rand(state)`. Road `rural` becomes the shared contract's `dirt` after generation; lanes and sidewalk are populated.
- `zombies.spawn` initializes variant, interpolation, velocity and attack animation fields. Runtime randomness uses `rand(state)`; IDs are per-state counters. Spawn visibility is a fixed player-relative 960×640 exclusion area, independent of camera/rendering. Arcade mode skips survival population/horde generation.
- `player.update(state,input,dt)` accepts action input, normalized movement, world aim, and held-search input. Search completion sets `ui='loot'` immediately and emits `openUi` plus `searchDone`, preventing subsequent fixed ticks from running under the loot overlay.
- `game.newGame(seed?)` and `continueGame()` return state; continue returns null for missing/invalid saves. `step` snapshots and increments ticks only while the sim runs. Death handling occurs during `step`, including damage applied between ticks. Timers are per state. `respawn`, `save`, `skipToMorning`, `setUi` take state explicitly. Lighting is 0.15 by day and 0.97 at deep night.
- `loot.fill(state, container)` is the state-first SIM-A export consumed by player searches.

## Validation

World tests include an exact geometry/container comparison against the legacy generator, deterministic visual metadata, generation under 1.5 seconds, all-container reachability for seeds 1/12345/8675309, and free spawn points. Full smoke coverage uses `describe.skipIf(!exists)` only for missing SIM-A modules; all modules were present for the final run.

Final checks: `npx tsc --noEmit` passes across the entire workspace. `npx vitest run tests/world.test.ts tests/zombies.test.ts tests/player.test.ts tests/game.test.ts tests/smoke.test.ts` passes all 30 tests in five files, including the full real-module smoke run. No missing-module errors remain.
