# DEAD ZONE — Survival Mode Spec (v0.2)

Second game mode next to Arcade (arcade is untouched; see SPEC.md). Survival is a zombie survival RPG:
a huge procedurally generated city (16000x16000 px) with roads, enterable buildings, lootable containers,
inventory + equipment, crafting, a player-built home base, XP/levels and tech trees for weapons and armor,
hunger/thirst/stamina, day/night with nastier nights and periodic horde nights. Progress autosaves to localStorage.

Same tech rules as arcade: plain Canvas + vanilla JS classic scripts (IIFE + 'use strict'), no modules,
no dependencies, must run from file://. All survival code lives in `js/sv/` on the `Z.sv` namespace.

**Read `js/sv/sv-core.js` first** — it is done and provides: `Z.sv.WORLD`, `Z.sv.makeRng(seed)`, `Z.sv.hash(str)`,
`Z.sv.Grid`, `Z.sv.phys.{collideCircle, raycast, lineOfSight, isFree, addSolid, removeSolid, slab}`,
`Z.sv.toast(msg,color)`, `Z.sv.uid(prefix)`, `Z.sv.newState(seed)` (read its field list — it is the state contract).

Shared modules you may use (already exist, do not edit): `Z.util` (clamp, lerp, rand, randInt, choice, dist, dist2, angle,
compact), `Z.on/Z.emit`, `Z.input` (keys by e.code incl. 'Mouse0'/'Mouse2', mouse.{x,y,worldX,worldY,down}, pressed(code)),
`Z.particles.{blood(x,y,n), spark(x,y,n), muzzle(x,y,angle)}` (they write into `Z.state.particles`; in survival
`Z.state` IS the survival state), `Z.audio.play(name)` (names: pistol, shotgun, smg, reload, empty, hit, zombieDie,
playerHurt, pickup, waveStart, gameOver, groan — plus survival names added by the UI agent: swing, open, craft, build,
levelUp, eat, night). `Z.W, Z.H` = canvas size. Main loop (`js/main.js`) computes `Z.input.mouse.worldX/Y` from
`state.camera` and then, when `Z.state.mode === 'survival'`, calls `Z.sv.game.frame(dt)` and nothing else.

Always guard calls into modules you don't own: `Z.sv.ui && Z.sv.ui.toast && ...`.

---------------------------------------------------------------------------------------------------
## File ownership & load order (index.html loads these after arcade scripts, before js/main.js)
| # | File | Owner |
|---|------|-------|
| 1 | js/sv/sv-core.js | orchestrator (done) |
| 2 | js/sv/sv-items.js | ITEMS agent — item database, recipes |
| 3 | js/sv/sv-inventory.js | ITEMS agent — inventory ops, crafting |
| 4 | js/sv/sv-loot.js | ITEMS agent — loot tables |
| 5 | js/sv/sv-save.js | ITEMS agent — save/load |
| 6 | js/sv/sv-world.js | WORLD agent — city generation |
| 7 | js/sv/sv-worldrender.js | WORLD agent — chunk-cached ground, walls, roofs, minimap, full map |
| 8 | js/sv/sv-progression.js | COMBAT agent — XP, levels, tech trees, computed stats |
| 9 | js/sv/sv-combat.js | COMBAT agent — weapon defs, firing, reload, melee, bullets |
| 10 | js/sv/sv-zombies.js | ZOMBIE agent — AI, spawning, hordes |
| 11 | js/sv/sv-base.js | ZOMBIE agent — base building structures |
| 12 | js/sv/sv-player.js | GAME agent — player movement, needs, interaction, damage |
| 13 | js/sv/sv-render.js | GAME agent — survival draw orchestration, entities, lighting |
| 14 | js/sv/sv-game.js | GAME agent — loop, day/night, new/continue/death/respawn, autosave |
| 15 | js/sv/sv-ui.js | UI agent — HUD, all survival overlays (DOM built from JS), title buttons |
| — | css/survival.css | UI agent |
| — | js/audio.js | UI agent may APPEND new sound names to its SFX table only |

---------------------------------------------------------------------------------------------------
## Canonical IDs (use these exact strings everywhere)
**Weapons** (item id === weapon id): `pistol`, `revolver`, `smg`, `shotgun`, `assault_rifle`, `hunting_rifle`, melee: `knife`, `bat`, `machete`.
Weapon classes: `handgun` (pistol, revolver), `smg`, `shotgun`, `rifle` (assault_rifle, hunting_rifle), `melee`.
**Ammo**: `ammo_9mm` (pistol, smg), `ammo_357` (revolver), `ammo_12g` (shotgun), `ammo_556` (assault_rifle), `ammo_308` (hunting_rifle).
**Armor**: head `cap`, `bike_helmet`, `riot_helmet`, `military_helmet`; body `hoodie`, `leather_jacket`, `police_vest`, `military_vest`.
**Backpacks**: `small_backpack` (+4 slots), `hiking_backpack` (+8), `military_backpack` (+12).
**Consumables**: `bandage`, `medkit`, `painkillers`, `canned_food`, `chips`, `mre`, `water_bottle`, `soda`, `energy_drink`.
**Materials**: `scrap`, `wood`, `nails`, `cloth`, `gunpowder`, `gun_parts`, `electronics`, `chemicals`.

---------------------------------------------------------------------------------------------------
## Core data shapes
**Stack**: `{ id, qty }` plus for weapons `mag` (rounds loaded). Weapons/armor/backpacks have stack size 1.
**Inventory**: `{ size, slots: Array(size) of Stack|null }`. Player inventory additionally has
`equip: { primary, secondary, melee, head, body, back }` (each Stack|null). Containers, stash structures and
ground drops each own an `inv` (plain Inventory). Player inventory size = 12 + backpack bonus + tech bonus.

**Solid rect** (in `state.grid`, added via `Z.sv.phys.addSolid`): `{x,y,w,h,kind, solid, blocksBullets, blocksSight, ...}`.
kinds used by world: `wall`, `window` (blocksSight false), `furniture`, `car`, `tree`, `fence` (blocksSight false, blocksBullets false), `rock`.
Structures from sv-base are also solid rects (with `structure: <structure obj>`).

**Building**: `{ id, x,y,w,h, kind, name, tier, doors:[{x,y,w,h}], rooms:[{x,y,w,h}], floorColor, roofColor }`
(the footprint; interior = inside the walls). Kinds: `house`, `store`, `gas_station`, `warehouse`, `office`, `police`,
`hospital`, `gun_store`, `military`, `school`. Tier 0..3 drives loot quality.

**Container**: `{ id, x,y,w,h, kind, name, tier, buildingId|null, searched:false, inv:null }` — `inv` created lazily
by `Z.sv.loot.fill(container)` on first search. Kinds: `cabinet`, `fridge`, `desk`, `wardrobe`, `crate`, `locker`,
`weapon_case`, `medical_cabinet`, `dumpster`, `car_trunk`, `toolbox`, `shelf`. Containers are also solid furniture
except `car_trunk`/`dumpster` which sit on solid cars/dumpsters. `id` must be deterministic from the world seed.

**Drop** (ground loot bag): `{ id, x, y, r:12, inv, life (seconds, Infinity for death bag), kind: 'loot'|'deathbag' }`.

**Structure** (base piece): `{ id, type, x,y,w,h, hp, maxHp, rot, inv? }` — see sv-base.

**Player** (created by `Z.sv.player.create(x,y)`):
```
{ x,y,r:14, angle, speed:190, hp, maxHp, stamina, maxStamina, food:100, water:100, invuln:0, dead:false,
  inv,                      // Z.sv.inv.createPlayer()
  active: 'primary'|'secondary'|'melee',
  fireCooldown:0, reloadTimer:0, reloadTotal:0, swingTimer:0,   // combat-owned timers
  xp:0, level:1, sp:0, tech:{},                                 // progression-owned (tech: {nodeId:true})
  spawn:{x,y}, sprinting:false, flashlight:true, bleeding:0 }
```

**Zombie**: `{ id, x,y,r, type, hp, maxHp, speed, damage, angle, state:'idle'|'wander'|'investigate'|'chase'|'attackStructure',
target:{x,y}|null, attackCooldown, hitFlash, burn:0, dead }`. Types: `walker`, `runner`, `brute`, `crawler` (low, fast-ish,
small), `bloater` (explodes on death, area damage). Colors: walker #6b8f4e, runner #a3b545, brute #4e6b3a, crawler #7d6b4e, bloater #8a9a3a.

**Bullet**: `{ x,y,vx,vy,angle,damage,life,r:3, pierce (remaining extra hits), ricochet (remaining bounces),
explosive (radius|0), incendiary (bool), hit:Set|null, dead, color }`.

---------------------------------------------------------------------------------------------------
## Module APIs (exact names)

### ITEMS agent
**sv-items.js**
- `Z.sv.ITEMS[id] = { id, name, type:'weapon'|'ammo'|'armor'|'backpack'|'consumable'|'material', stack, rarity:'common'|'uncommon'|'rare'|'epic', color, glyph (1-3 chars shown on icon), desc, ... }`
  - armor: `slot:'head'|'body', armor: 0..0.5 (fraction of damage blocked), weightless`
  - backpack: `slots: n`
  - consumable: `use:{ heal?, food?, water?, stamina?, stopBleed?, time (seconds to use) }`
  - weapon: `slot:'primary'|'secondary'|'melee'` (handguns → secondary, smg/shotgun/rifles → primary, melee → melee)
- `Z.sv.RARITY_COLORS = { common, uncommon, rare, epic }`
- `Z.sv.RECIPES = [{ id, name, out:{id,qty}, in:{itemId:qty,...}, station: null|'workbench', time }]` — at least:
  bandage (cloth), ammo crafting for every ammo type (gunpowder+scrap), medkit (bandage+chemicals), gun_parts (scrap+electronics… expensive), nails (scrap), wood? (no).
**sv-inventory.js** — `Z.sv.inv`:
- `create(size)`, `createPlayer()` (size 12, equip all null), `recalcSize(state)` (player size = 12 + backpack + `Z.sv.prog.playerMods(state).invSlots`; overflow → ground drop at player)
- `add(inv, id, qty, extra?) -> leftover qty` (fills existing stacks first; extra merges fields like `mag`)
- `remove(inv, id, qty) -> bool` (all-or-nothing), `count(inv, id)`, `has(inv, needs:{id:qty}) -> bool`
- `moveSlot(fromInv, fromIdx, toInv, toIdx?)` (merge/swap; toIdx omitted = first fit), `takeAll(fromInv, toInv)`
- `equip(state, slotIdx)` (moves stack from player slot to the matching equip slot, swapping; calls recalcSize for backpacks),
  `unequip(state, equipKey)`, `equippedWeapon(state) -> Stack|null` (= `inv.equip[player.active]`)
- `use(state, slotIdx) -> bool` consumable effects on player (hp capped by maxHp, food/water capped 100), plays 'eat'/'pickup'
- `quickHeal(state)` uses best healing item (medkit > bandage > painkillers)
- `drop(state, slotIdx)` → spawns a Drop at player
- `craft(state, recipeId) -> bool` (needs station check: `Z.sv.base.nearStation(state,'workbench')`; consumes from player inv)
- `canCraft(state, recipeId) -> {ok, missing:{id:qty}}`
- `totalAmmo(state, ammoId)` (player inv count)
**sv-loot.js** — `Z.sv.loot`:
- `TABLES` by container kind; quality scales with `tier` (0..3); `fill(container)` creates `container.inv` (size 8) with 1–5 stacks if not yet filled.
- `zombieDrop(state, zombie)` — chance-based small drop (ammo, materials, rare gun_parts); pushes a Drop into `state.drops` when non-empty.
- `makeDrop(state, x, y, stacks, kind?) -> Drop`
- Weapons in loot spawn with partly filled `mag`. Gun stores / police / military give weapons & armor; hospitals medical; houses food/cloth/common; warehouses materials.
**sv-save.js** — `Z.sv.save`: `KEY='deadzone_survival_v1'`, `has()`, `write(state)`, `read() -> data|null`, `clear()`, `apply(state, data)`.
  Save = seed, clock, stats, player (minus transient), containers that were searched (`{id: {searched, inv}}`), drops, structures, base.
  `apply` runs AFTER the world was regenerated from the seed; it restores those fields and re-adds structures to the grid via `Z.sv.base.restore(state, list)`.
  All localStorage access in try/catch. Infinity must survive JSON (store as null/-1 and restore).

### WORLD agent
**sv-world.js** — `Z.sv.world`:
- `generate(state)` deterministic from `state.seed` using `Z.sv.makeRng` (never Math.random). Fills `state.roads`, `state.buildings`,
  `state.containers`, `state.decor` (non-solid visuals: road markings, grass patches, blood stains, debris), `state.pois`
  (`{x,y,name,kind}` labels for the map), all solid rects into `state.grid` via `Z.sv.phys.addSolid`, and `state.spawnPoint`
  (an open street point in a quiet suburb near the map center).
  Layout: road grid with main avenues + streets (blocks ~900–1400px), sidewalks; districts: downtown (offices, stores,
  police, hospital, gun store), suburbs (houses with yards & fences), industrial (warehouses), outskirts/forest (trees, rocks,
  cabins), one military base (walled, tier 3) far from spawn. Buildings have walls (thickness ~16) with door gaps (~56px), interior
  partition walls with doorways, windows, furniture, containers. Abandoned cars on roads (solid, some with `car_trunk`).
  Keep a few hundred buildings total; must generate in < 1.5s.
- `buildingAt(state, x, y) -> Building|null` (point inside footprint; use a coarse lookup, called every frame)
- `randomSpawnPoint(state, nearX, nearY, minD, maxD, rng?) -> {x,y}|null` outdoor/indoor free point for zombie spawning (`Z.sv.phys.isFree`)
- `districtAt(state, x, y) -> 'downtown'|'suburb'|'industrial'|'forest'|'military'` (zombie density uses it)
**sv-worldrender.js** — `Z.sv.worldRender`:
- `drawGround(ctx, state, cam)` — terrain/roads/sidewalks/building floors/decor, pre-rendered into cached offscreen chunks (e.g. 1024px) built lazily and evicted LRU.
- `drawSolids(ctx, state, cam)` — walls, furniture, cars, trees, fences, containers (containers: highlight outline if `!searched`; dim if searched) — query the grid for visible rects only.
- `drawRoofs(ctx, state, cam)` — opaque roofs over buildings; the building the player is in (via `buildingAt`) fades roof to 0 (smooth per-building alpha).
- `drawMinimap(ctx, state, x, y, w, h)` and `drawMap(ctx, state, x, y, w, h)` (full map; roads, buildings, POI labels, player arrow, bed/base icon, explored fog optional). Pre-render a low-res map image once after generate.

### COMBAT agent
**sv-progression.js** — `Z.sv.prog`:
- `addXP(state, n)`, level curve (`xpForLevel(l)`), +1 skill point per level (+1 bonus every 5), emits `sv:levelUp`.
  XP sources (callers): kills (walker 10, runner 15, crawler 12, brute 40, bloater 25), first search of a container (5), crafting (3).
- `Z.sv.TECH = { trees: [ { id, name, icon, workbench:bool, nodes:[ { id, name, desc, cost:{sp, items:{id:qty}}, requires:[nodeId], col, row, effect } ] } ] }`
  Trees: `handgun`, `smg`, `shotgun`, `rifle`, `melee`, `armor` (all workbench:true) and `survival` (workbench:false).
  Each weapon tree ~8–10 nodes in 3–4 tiers: damage I/II/III, fire rate, mag size, reload speed, stability (spread), and
  **shooting-pattern** capstones, e.g. handgun: double-tap (2-round burst), hollow points (pierce 1); smg: extended drum, ricochet
  rounds (1 bounce); shotgun: +2 pellets, tight choke, dragon's breath (incendiary), slug mode; rifle: armor-piercing (pierce 2),
  explosive rounds (small radius), marksman (crit chance). melee: damage, swing speed, wider arc, lifesteal.
  armor: max HP +, armor effectiveness %, damage reduction, bleed resistance, regen out of combat, thorns.
  survival: +inventory slots, sprint stamina, slower hunger/thirst, faster searching, better loot luck, quieter footsteps.
  Costs use skill points plus materials (`gun_parts`, `scrap`, `electronics`, `cloth`) for higher tiers.
- `canUnlock(state, nodeId) -> {ok, reason}` (checks sp, items, requires, workbench via `Z.sv.base.nearStation(state,'workbench')`), `unlock(state, nodeId) -> bool`.
- `weaponStats(state, weaponId) -> computed { ...Z.sv.WEAPONS[id] with upgrades applied, pierce, ricochet, burst, explosive, incendiary, crit }`
- `playerMods(state) -> { maxHp, armor (total fraction from equipped armor * effectiveness, cap 0.75), dmgReduction, regen, speedMult, maxStamina, staminaRegenMult, hungerMult, searchMult, lootLuck, invSlots, noiseMult, thorns, bleedResist }`
**sv-combat.js** — `Z.sv.WEAPONS[id] = { name, class, ammo|null, damage, fireRate, magSize, reloadTime, spread, pellets, bulletSpeed, range, auto, noise (px radius), shake, sound, melee?:{range, arc, knock} }` and `Z.sv.combat`:
- `update(state, dt)` — timers, held-mouse firing (`Z.input.mouse.down || pressed('Mouse0')`, skip when `state.ui` is set), R reload, bullets sim with
  `Z.sv.phys.raycast` vs walls and swept-circle vs zombies (`state.zombies`), pierce/ricochet/explosive/incendiary, damage via `Z.sv.zombies.damage`.
- Firing consumes `stack.mag`; reload pulls ammo from player inv via `Z.sv.inv.remove`. Each shot calls `Z.sv.zombies.noise(state, x, y, radius)`.
- Melee weapons swing (arc hit test) — no ammo. If no weapon equipped in the active slot: unarmed punch.
- `reload(state)`, `switchTo(state, 'primary'|'secondary'|'melee')`.

### ZOMBIE agent
**sv-zombies.js** — `Z.sv.zombies`:
- `update(state, dt)` — population management: keep ~25 (day) / ~45 (night) zombies within ~1600px of the player scaled by district
  (downtown/military denser, forest sparse); spawn out of view via `Z.sv.world.randomSpawnPoint`; despawn idle ones beyond ~2400px.
  AI: idle/wander → notice player by sight (`Z.sv.phys.lineOfSight`, ~350px day / ~220px night but player flashlight raises it) or
  noise → chase; lose track → investigate last seen pos → wander. Obstacle steering (tangent slide + stuck detection, cheap LOS throttling).
  Melee player via `Z.sv.player.damage(state, amount, angle)`. If a structure blocks the way to the player/base, attack it via `Z.sv.base.damage`.
  Separation between nearby zombies. Night: +25% speed. Use `Z.sv.game.isNight(state)` (guard).
- **Horde nights**: every 3rd night (`state.clock.day % 3 === 0`, at nightfall) spawn a horde (20 + 5*day, capped 80) that targets the base bed
  (or player if no bed); emit `sv:horde`. Toast it.
- `damage(state, z, amount, angle, opts?)` (opts: {burn:true, source}) — hit flash, knockback, blood, death: XP via `Z.sv.prog.addXP`,
  `state.stats.kills++`, `Z.sv.loot.zombieDrop`, bloater explosion (damages player & zombies in radius), `Z.emit('sv:zombieKilled', z)`.
- `noise(state, x, y, radius)` — zombies within radius investigate.
- `draw(ctx, state, cam)` — draw visible zombies (style like arcade: circle body + reaching arms, white hit flash, hp bar when damaged, orange tint when burning).
**sv-base.js** — `Z.sv.base` and `Z.sv.STRUCTURES[type] = { name, cost:{itemId:qty}, w, h, hp, solid, blocksBullets, blocksSight, desc, glyph }`:
  types: `bed` (respawn point + sleep through night + save; max 1), `stash` (storage inv size 24), `workbench` (enables tech trees for weapons/armor and workbench recipes),
  `wood_wall`, `metal_wall`, `wood_door` (player passes, zombies don't — simplest: solid only for zombies → implement as solid:false and zombies treat as blocking), `barricade` (cheap), `spike_trap` (non-solid, damages zombies over it, loses hp),
  `campfire` (light at night, regen/no hunger effect nearby optional), `turret` (auto-shoots nearest zombie in LOS within 400px using ammo_9mm stored in its own inv size 1).
- `update(state, dt)` — build mode logic when `state.ui === 'build'`: ghost follows mouse (snap 32px grid), Q/E or wheel cycle type, R rotate (swap w/h), left click place if
  `Z.sv.phys.isFree`-ish (no overlap with solids, player, zombies) and player has materials, right click / Esc exits build mode, X over a structure demolishes (50% refund).
  Also runs traps, turrets, structure damage flashes.
- `enterBuild(state)`, `exitBuild(state)`, `selected` type, `place(state, type, x, y, rot) -> structure|null`, `restore(state, list)` (rebuild from save), `damage(state, s, amount)`,
  `interact(state, s)` (bed: set spawn, save, if night sleep → `Z.sv.game.skipToMorning(state)`; stash: `Z.sv.ui.open('stash', s)`; workbench: `Z.sv.ui.open('workbench', s)`; turret: `Z.sv.ui.open('stash', s)` to load ammo),
  `nearStation(state, type) -> structure|null` (within 140px of the player), `draw(ctx, state, cam)` (structures + build ghost green/red + cost),
  `nearestInteractable(state, x, y, maxDist) -> structure|null`.

### GAME agent
**sv-player.js** — `Z.sv.player`: `create(x,y)`, `update(state, dt)`:
- WASD movement, Shift sprint (stamina drain 25/s, regen 18/s after 0.8s), speed × `playerMods.speedMult`; collide with `Z.sv.phys.collideCircle`.
- Aim at mouse; scroll wheel or 1/2/3 switch weapon slots via `Z.sv.combat.switchTo`.
- Needs: food −100 over ~12 min, water −100 over ~9 min (× hungerMult); at 0 lose 1 HP/s. Slow regen when food & water > 60 (+ tech regen). Bleeding from runner/brute hits stops with bandage.
- Interaction: every 0.1s find nearest interactable within 70px (container, drop, structure via `Z.sv.base.nearestInteractable`) → `state.interact = {kind:'container'|'drop'|'structure', target, label}`.
  E on container: if searched → open immediately; else start `state.search = {target, t:0, total: searchTime*searchMult}` (cancel if moving away >90px);
  on completion: `Z.sv.loot.fill`, `searched = true`, `Z.sv.prog.addXP(5)`, `state.stats.containersLooted++`, `Z.sv.ui.open('loot', container)`.
  E on drop → `Z.sv.ui.open('loot', drop)`. E on structure → `Z.sv.base.interact`.
- Keys: H quick heal (`Z.sv.inv.quickHeal`), F flashlight toggle, B build mode (`Z.sv.base.enterBuild`).
- `damage(state, amount, angle)` — invuln 0.35s, apply `playerMods` armor & dmgReduction, chance to bleed, shake, blood, 'playerHurt', `Z.emit('sv:playerHurt')`, death → `Z.emit('sv:playerDied')`.
- `draw(ctx, state)` — player with weapon-appropriate barrel / melee swing arc, armor tint.
**sv-render.js** — `Z.sv.render.draw(state)`: clear → camera transform (+shake) → `worldRender.drawGround` → drops → `base.draw` → `worldRender.drawSolids` →
  zombies (`Z.sv.zombies.draw`) → player → bullets → particles → `worldRender.drawRoofs` → lighting overlay (day/night: darkness from `Z.sv.game.darkness(state)`
  0..0.92; player ambient radius + flashlight cone when flashlight on; campfires light) → `Z.sv.ui.drawHUD(state, ctx)` → crosshair.
  Indoors (player inside a building): darker ambient, flashlight matters.
**sv-game.js** — `Z.sv.game`:
- `DAY_LENGTH = 600` seconds (day 0–420, dusk, night 420–600). `isNight(state)`, `darkness(state)`, `skipToMorning(state)`, `timeLabel(state)` ("Day 3 — 21:40").
- `newGame()` → seed = random uint32, `Z.state = Z.sv.newState(seed)`, `Z.sv.world.generate`, create player at spawnPoint with starter kit
  (pistol w/ 12 mag, 24 ammo_9mm, knife, 2 bandage, 1 water_bottle, 1 canned_food), snap camera, `Z.sv.ui.open(null)`/HUD, toast intro.
- `continueGame()` → read save, regenerate world from its seed, `Z.sv.save.apply`, else newGame.
- `frame(dt)` — Esc: if `state.ui` → `Z.sv.ui.close()`; else toggle pause (`Z.sv.ui.open('pause')`). Tab or N toggles map (`Z.sv.ui.open('map')`), I toggles inventory, K tech tree, C crafting.
  Simulate only when `state.screen === 'playing'` and (`!state.ui` or `state.ui === 'build'`): clock, player, combat, zombies, base, particles, drops expiry, camera follow (clamped to Z.sv.WORLD), autosave every 60s.
  Always render. Decay shake.
- Death: on `sv:playerDied` → put all player slot items (not equipped) into a deathbag Drop at the death spot, `stats.deaths++`, `state.screen='dead'`, `Z.sv.ui.open('dead')`.
  `respawn()` → player at bed (if any) else spawnPoint, hp 60, food/water 60, keep equipment/levels/tech, save.
- `quitToTitle()` → save, then `Z.game.toTitle()` (provided by main.js; restores arcade attract state & title screen).
- On nightfall emit `sv:night` + toast; on morning emit `sv:day`, `stats.daysSurvived++`.

### UI agent
**sv-ui.js** — `Z.sv.ui` (build all survival DOM overlays from JS into a `#sv-root` div; styles in css/survival.css; same gritty look as arcade's style.css):
- `init()` (called on load by main.js; wires title buttons `#btn-survival-new`, `#btn-survival-continue` → `Z.sv.game.newGame()/continueGame()`;
  hide continue if `!Z.sv.save.has()`; confirm before overwriting a save with New), `open(name, data)`, `close()`, `isOpen()`, `toast(msg, color)` (also listen to `sv:toast`).
  Setting `Z.state.ui = name` when opening, null when closing. Build mode (`'build'`) has no overlay, just a HUD hint bar.
- Overlays: `inventory` (player slots grid, equipment paperdoll slots, item tooltip w/ stats, click to equip/use, right-click use/equip, shift-click/drag to move, drop button),
  `loot` (container/drop inv beside player inv; click moves; "Take all" button; F key take all), `stash` (structure inv ↔ player inv), `workbench` (tabs: Tech Trees | Crafting),
  `tech` (tree tabs; node graph laid out by col/row with connecting lines; locked/available/owned states; cost; unlock button; workbench-only trees show a lock notice when not at a workbench),
  `craft` (recipe list w/ have/need counts, craft button), `map` (canvas, calls `Z.sv.worldRender.drawMap`), `pause` (resume, save & quit to title), `dead` (stats, Respawn button → `Z.sv.game.respawn()`).
- `drawHUD(state, ctx)` (canvas, screen space): HP bar + armor indicator, stamina bar, food & water meters, bleeding icon; level + XP bar + unspent SP badge;
  active weapon name + mag/total ammo + reload bar; weapon slot strip (1/2/3); clock/day + night indicator; minimap top-right via `Z.sv.worldRender.drawMinimap`;
  interaction prompt ("[E] Search Kitchen Cabinet") + search progress bar; toasts; build-mode bar (selected structure, cost, have counts, controls);
  horde warning banner; level-up banner; damage vignette; hints for keys on first play.
- Append to js/audio.js SFX: swing, open, craft, build, levelUp, eat, night.

---------------------------------------------------------------------------------------------------
## Events
`sv:toast {msg,color}`, `sv:playerHurt`, `sv:playerDied`, `sv:zombieKilled z`, `sv:levelUp level`, `sv:night`, `sv:day`, `sv:horde`, `sv:itemAdded {id,qty}`.

## Keys (survival)
WASD move · Shift sprint · Mouse aim/shoot · R reload · 1/2/3 primary/secondary/melee · E interact/search · H quick heal · F flashlight ·
I inventory · K tech tree · C crafting · B build mode · Tab/N map · Esc close/pause · M mute.

## Testing
Every agent: `node --check` your files. Headless harness `tools/sv-smoke-test.js` (orchestrator) loads all scripts with stubs and runs the game.
