# DEAD ZONE

A top-down zombie survival RPG built with **Phaser 4 + TypeScript**. It has a Node 24 server with MongoDB accounts and cloud saves.

- **Story:** three linked stories on the title screen, each with its own checkpoint save. *The Long Road* and *A Group in Need* cross the city of Bellwether (`notes/road.md`). *The Hive Below* goes underground into a hive of giant dead insects on its own map, with swarms, burrows, brood bosses and insect weapons; it unlocks when A Group in Need is finished and carries that survivor over. The first of its four parts is built: the Breach and the Warrens (`notes/hive-below.md`).
- **Survival engine:** the open-world city (looting, inventory, base building, 7 tech trees, nights and hordes) is still in the code and its tests, and the other modes are built on it. It has no button on the title screen since the story that used it, A Light in the Valley, was removed.
- **Arcade:** endless waves in an arena. Kills drop XP, and each level-up offers a choice of 3 cards: auto-firing gadgets (saw blades, molotov, drone, shock coil, frag) and passives. A max-level gadget plus its paired passive evolves into a stronger form (`src/sim/upgrades.ts`).
- **Effects:** glow, color grading, damage numbers, particles and hit-stop. Turn the glow off in **Settings** if the game stutters.

Art is built in `art/`. The 2D zombie set imports reference-based pixel artwork from `art/source/zombies-pixel/`; the three selectable player designs import layered pixel sprites, and the effects use a native pixel-art generator. Environment and icons retain their procedural generators.

## Art
```sh
npm run art            # rebuild all art -> public/assets (needs Edge or Chrome for the 3D characters)
npm run art:chars      # only the player + zombies (pre-rendered 3D, ~2 min)
npm run art:chars2d    # three selectable players + overhead pixel zombies + pixel FX
npm run art:chars2d:procedural # original procedural 2D zombies, for comparison
npm run art:sheet -- out.png zombie:walker 1   # look-dev contact sheet of 3D frames
```
The default `art` and `art:chars` commands still build procedural 3D characters. The active asset set uses the 2D pipeline. Run `npm run art:chars2d` to restore it after a 3D build.

The pixel zombie set provides 333 frames across 13 variants: 4 walkers (including the infected appearance), 3 runners, 2 brutes, 2 crawlers and 2 bloaters. Every variant has walk, attack, hit, death and corpse frames; bloaters add pulse frames. Frames face right from overhead and use the existing animation names and centered origins. See `art/source/zombies-pixel/README.md` for the layout, rebuild commands and validation.

## Character selection

Choose Survivor, Scout or Responder on the main menu before starting a new Survival or Arcade run. The choice is cosmetic and is remembered on this device. Continue restores the character from that save; older saves use Survivor. The 2D build includes all three designs with layered walking, aiming, recoil, reload, melee and unarmed poses. See `art/source/player-pixel/README.md` for source sheets and rebuild details.

Pixel effects cover blood sprays, drops, pools and smears, plus fire, smoke, explosions, muzzle flashes, sparks and debris. Rebuild them alone with `npm run art:fx`.

## Run it
```sh
npm install
npm run dev            # game at http://localhost:5173 (local saves only)
npm run dev:server     # optional, second terminal: accounts + cloud saves (needs .env, see DEPLOYMENT.md)
```
Production: `npm run serve` builds the client and serves it from the Node server on `PORT` (8090). See **DEPLOYMENT.md** for MongoDB, nginx, Docker and HTTPS.

## Controls
| Key | Action |
|---|---|
| WASD / Shift | Move / sprint |
| Mouse, click | Aim, shoot or swing |
| R | Reload |
| 1 / 2 / 3, wheel | Primary / sidearm / melee |
| E (hold) | Search / interact |
| H / F | Quick heal / flashlight |
| I / K / C | Inventory / tech tree / crafting |
| B | Build mode: pauses the game and opens the build menu (pick a structure, or the Repair / Demolish-salvage tools). R rotates, click uses the tool, X and G are shortcuts |
| E near damage | Repair a damaged structure without entering build mode |
| M / Tab | Map (fog of war: it reveals as you explore) |
| Esc / U | Pause or close / mute |
| **F8** | Performance recorder: a live frame graph, plus **Save report** for stutter analysis |
| | All keys can be rebound: **Pause → Controls** or **Settings → Controls…** (saved per browser) |
| **F9** | Testing panel: jump time of day, speed or freeze the clock, god mode, item kits, spawn zombies or a horde |

## Saves
- Survival autosaves every 60s, when you use a bed, and on quit.
- Saves always go to the browser first.
- When you're signed in, each save also uploads to your account in MongoDB (`zombies.users`). Uploads are conflict-checked and the previous save is kept as a backup.
- If the server is unreachable, the game keeps playing and saving locally and syncs later.

## Project layout
| Path | What |
|---|---|
| `src/sim/` | Pure game simulation (no Phaser/DOM): world gen, zombies, combat, inventory, loot, tech, base, saves, arcade. Fixed 60Hz step. |
| `src/render/` | Phaser rendering: chunked ground, props, animated characters, FX, lighting (darkness, flashlight cone with wall shadows) |
| `src/ui/`, `src/audio/` | DOM HUD and menus, account panel, synthesized sound |
| `src/scenes/` | Boot (asset loading) and Game (the loop: input → sim steps → interpolated render → events) |
| `src/net/cloud.ts` | Cloud-save client: session, journal, conflict resolution |
| `server/` | Node server: static hosting, auth, saves (MongoDB) |
| `art/` | Procedural art generators → `public/assets` (`npm run art`) |
| `tests/` | Vitest: sim, saves, server, cloud client |
| `tools/probe.mjs` | Headless browser driver for screenshots and perf runs |
| `legacy/` | The original vanilla-JS prototype (open `legacy/index.html`) |
| `ARCHITECTURE.md`, `ART_SPEC.md`, `notes/` | Contracts and design notes |

## Checks
```sh
npm run typecheck && npm test && npm run build
node tools/probe.mjs --url http://localhost:5173/ --scenario street,night,indoor,zombies,build,inventory,arcade
node tools/probe.mjs --url http://localhost:5173/ --scenario walk --seconds 20     # perf summary
```
