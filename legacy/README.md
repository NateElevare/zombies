# DEAD ZONE

A top-down zombie game for the browser with two modes. It uses plain HTML5 Canvas and vanilla JavaScript, with no build step and no dependencies.

## Play
Double-click `index.html`, or serve the folder with any static server. Pick a mode on the title screen.

### Arcade
Endless waves on a small map. Runners show up from wave 3 and brutes from wave 5. Zombies drop health, ammo, a shotgun or an SMG.

| Control | Action |
|---|---|
| WASD / arrows | Move |
| Mouse | Aim (flashlight follows) |
| Left click / hold | Shoot |
| R | Reload |
| 1 / 2 / 3 | Pistol / Shotgun / SMG (once picked up) |
| P / Esc | Pause |
| M | Mute |

### Survival
A zombie survival RPG in a procedurally generated 16,000px city. The city has downtown, suburbs, an industrial zone, forest and a walled military base.

- **Explore and loot.** Every building can be entered: the roof fades away when you walk in. There are about 1,200 containers to search, and better areas (police, gun stores, hospitals, military) hold better loot.
- **Inventory and equipment.** Your backpack has slots, plus primary, secondary and melee weapons, head and body armor, and a backpack slot that adds space.
- **Weapons.** Pistol, revolver, SMG, shotgun, assault rifle and hunting rifle, plus a knife, bat and machete. Guns use five ammo types.
- **Tech trees.** You earn XP from kills, searching and crafting, and get skill points as you level. There are seven trees: Handguns, SMGs, Shotguns, Rifles, Melee, Armor & Defense, and Survival. Upgrades change how guns shoot (double-tap bursts, piercing rounds, ricochets, explosive rounds, dragon's breath, slugs) and add reload, magazine and damage boosts. Weapon and armor trees need a workbench at your base.
- **Home base.** Build beds (respawn, sleep through the night, save), stashes, workbenches, wood and metal walls, doors, barricades, spike traps, campfires and turrets.
- **Survival needs.** You have to manage hunger, thirst, stamina and bleeding. Crafting turns cloth, scrap, gunpowder and other materials into bandages, medkits, ammo and gun parts.
- **Day and night.** Nights are dark and zombies get faster. Every 3rd night a horde comes for your base.
- **Death.** You respawn at your bed, and your backpack contents stay where you died until you go back for them.
- **Saving.** The game autosaves to the browser. Use CONTINUE on the title screen.

| Control | Action |
|---|---|
| WASD / Shift | Move / sprint |
| Mouse / click | Aim / shoot or swing |
| R | Reload |
| 1 / 2 / 3, wheel | Primary / secondary / melee |
| E | Search / interact |
| H | Quick heal |
| F | Flashlight (take-all in loot screens) |
| I / K / C | Inventory / tech tree / crafting |
| B | Build mode (Q/E or wheel cycle, R rotate, click place, X demolish) |
| Tab / N | Map |
| Esc | Close menu / pause |
| M | Mute |

## Code layout
- `SPEC.md` is the arcade module contract; arcade code is in `js/*.js` on the global `Z` namespace.
- `SURVIVAL_SPEC.md` is the survival module contract; survival code is in `js/sv/*.js` on `Z.sv`, with styles in `css/survival.css`.
- `js/main.js` boots the game and hands each frame to survival when `Z.state.mode === 'survival'`.

## Testing
- `node tools/smoke-test.js [seconds]` is a headless arcade bot run.
- `node tools/sv-smoke-test.js [seconds]` is a headless survival run. It covers looting, menus, leveling, tech, building, crafting, night, death, the death bag, respawn and save/continue.
- `tools/preview.html` and `tools/sv-preview.html?scene=street|indoor|night|inventory|tech|map|build|loot` are for headless screenshots.
