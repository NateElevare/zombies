# SIM-A integration notes

No changes to shared types are required. Reload/burst bookkeeping and bullet crit chance use local extensions of Player/Bullet. Turret/trap cooldowns use a local Structure extension.

- **SIM-B integration needed:** call `combat.onPlayerHurt(state)` in `player.damage` after an accepted damage hit. This replaces the legacy `sv:playerHurt` listener, sets the six-second combat timer, and applies thorns to the nearest zombie. Calling it directly avoids losing the event when the shell drains `state.events`.
- **Inventory events:** call `inventory.bind(state)` after assigning `state.player` in new-game setup, before starter inventory additions. `createPlayer(state?)` and `add(inv,id,qty,extra?,state?)` also accept an optional event destination. `recalcSize`, combat updates, equip/unequip, crafting and building bind automatically. Inventory-only APIs preserve their legacy signatures and need an owner binding to emit `itemAdded` without global state.
- `loot.fill` is now `fill(state, container)`.
- `save.serialize(state)` returns a JSON string; `deserialize(raw)` returns validated save data or null. `apply(state,data)` consumes that data after world regeneration. `SAVE_KEY`/`KEY` is `deadzone_survival_v2`, `VERSION` is 2.
- Build selection/rotation/ghost live in `state.build`; there is no global `base.selected`. `canPlace` and `canAfford` remain exported.
- Base interactions set `state.uiTarget` (permitted by GameState's runtime index signature) and emit `openUi`. Destruction clears a matching target and emits `structureDestroyed`.
- All drawing and global event listeners were removed. `combat._bullets` remains available for isolated simulation tests; `weaponClass` and `onPlayerHurt` are new named exports.
- Nearby crafting/tech stations also require `phys.canReach`; solid walls cannot be bypassed by using a station from the other side.
