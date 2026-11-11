# UI / Audio notes

Files: `src/ui/{index,hud,overlays,title,settings,mapview,dom,format}.ts`, `src/ui/style.css`, `src/audio/index.ts`, `tests/ui.test.ts`.

## How it works
- `createUi()` owns `#ui-root` (font-size scales with viewport; all CSS is in em). Title shows on `attach(null)`; HUD + overlays on `attach(state)`.
- `state.ui` is the single source of truth. Every `update()` the UI reconciles the DOM overlay to `state.ui` (sim-opened loot/stash/workbench/dead included). UI-opened overlays go through `game.setUi`.
- Targets: loot from `openUi.target` (Container or Drop, uses `.inv`); stash/workbench from `state.uiTarget`. If the target vanishes (structureDestroyed / not in `state.structures`/`state.drops`) the overlay closes via `setUi(null)`; the sim already drops the stash contents on the ground.
- Keys (capture phase on window): I K C Tab/N open or toggle, Esc closes/pauses (build mode Esc is left to input.ts), E closes loot/stash/workbench, F take-all, M mute. While an overlay is open every other keydown is swallowed (stopPropagation) so gameplay keys cannot leak.
- Audio sink is reached through `window.deadzone.scene.audio` (for M, volume, mute in settings). `createAudio()` returns an `AudioApi` (AudioLike + `volume`, `play(name)`).
- Audio: the sim already emits `sound` events for shots/reload/empty/hurt; those are used (positioned by the preceding `shot`/`swing` event), so `shot` itself is not double-played. Extra mappings: zombieAttack, explosion, horde, playerDied (gameOver). Persisted in localStorage `deadzone_audio_v1`.

## Requests / observations for others
- Orchestrator: `tools/probe.mjs` loot scenario calls `sim.loot.fill(best)`; the signature is now `fill(state, container)` (the scenario throws as written).
- Arcade (arcade.ts is still a stub): the HUD reads `state.arcade {wave, score, best, intermission}`; the dead screen shows when `state.screen === 'dead'` (or `ui === 'dead'`); PLAY AGAIN calls `shell.newArcade()`. Arcade needs `state.grid` for nothing UI-related (minimap is hidden in arcade mode).
- Art: item icons load from `assets/icons/<itemId>.png`, structures `assets/icons/struct_<type>.png` (glyph fallback until they exist).
- The title's arcade button catches `newArcade()` throwing and shows "Arcade mode is not available yet".
