# DEAD ZONE: The Long Road (linear story campaign)

A second story mode, selectable on the title screen next to the old open-world campaign. It replaces the
"go anywhere, build a base" loop with a **very large map crossed by a fixed route of missions**: nine
quarantine sectors, one gate between each pair, a definitive checkpoint at the end of every mission.

Design rules (from Nate):
- Linear route with locked gates. Each mission ends at a checkpoint camp; the next sector opens when it ends.
- Dying restarts the current mission from its checkpoint (gear, XP and level as they were when the mission began).
- Streamlined pickups: walk over ammo, medkits and weapons. Weapon slots, XP levels and the tech tree stay.
  No backpack inventory, no crafting, no hunger/thirst, no building.
- Top-down (overhead) view and the existing overhead art. No angled projection.
- Reuse the cast (Mara, Eli, June, Ruth) with a new plot.

## Premise

Haven fell. On the night the generator died, the horde that had been circling the fire station came
through the yard wall. Ruth's last transmission from North Ridge said a convoy is leaving the dam relay in
four days and will not wait. Bellwether was sectioned off into quarantine sectors during the outbreak,
and the only way to North Ridge is through them, one checkpoint at a time.

You are the one with the gun. Mara, Eli and June travel with you between missions: they take the back
roads while you clear the way, and they are waiting at each checkpoint camp when you get there.

## Map (16000 x 16000, a serpentine of nine 5300px sectors)

```
 y 0-5500      S7 Rustwater North   S8 Blackpine Road    S9 Fort Ashgrove / North Ridge (finale)
 y 5500-11000  S6 Rustwater Yard    S5 St. Mercy         S4 Downtown
 y 11000-16000 S1 Maple Heights     S2 Cedar Hills       S3 The Interchange
                x 0-5300             x 5300-10600         x 10600-16000
```
Route: S1 -> S2 -> S3 (east), up into S4, S4 -> S5 -> S6 (west), up into S7, S7 -> S8 -> S9 (east).
Sector walls are concrete quarantine barriers (`wall` solids, military look). The only openings are the
gates on the route. Gates are closed solids drawn with the campaign `gate` prop; a finished mission opens
the next gate for good.

Each sector is a full district built with the normal world generators (roads, blocks, buildings, cars,
trees), so there is plenty to explore off the main path for supplies. Landmarks are hand placed.

## Missions

| # | Sector | Title | Time | Beats | Boss |
|---|---|---|---|---|---|
| 1 | S1 suburb | Last Night at Haven | dusk | Grab the shotgun in the engine bay, clear the yard, hold the rear gate 45s while Eli cuts the chain, go through | - |
| 2 | S2 suburb | Cedar Hills | morning | June is sick: fetch antibiotics from the pharmacy, clear the school gym where the group shelters, reach the gate | - |
| 3 | S3 highway | The Interchange | noon | Fuel can from the gas station, clear the pile-up on the overpass, open the toll gate | Howler on the overpass |
| 4 | S4 downtown | Downtown Crossing | afternoon | Police precinct armory (rifle), restart the dispatch radio to reach Ruth, hold the lobby | - |
| 5 | S5 hospital | St. Mercy | evening | Mara needs the trauma kit from the ER wing; the wing is a lair | Plague |
| 6 | S6 industrial | Rustwater Yard | dusk | Eli needs a truck battery from the depot; raise the roll-up door while the yard empties onto you | Butcher |
| 7 | S7 industrial north | The Dark Mile | night | Power is out: flashlight only, find the lantern, cross the rail cut, survive to the pumping station | - |
| 8 | S8 forest | Blackpine Road | dawn | Runners in the trees; ranger station; the clearing nest | Broodmother |
| 9 | S9 military | Fort Ashgrove | day | Breach the base, take the motor-pool keys, hold the gate for the group | Juggernaut |
| 10 | S9 relay | North Ridge | dusk to night | Final holdout at the relay while Ruth raises the convoy; waves, then dawn | all five, one at a time |

Every mission is a short list of objectives shown one at a time on the HUD with a marker and distance:
`reach`, `pickup` (a quest item or weapon), `clear` (kill the zombies tagged to an area), `holdout`
(survive N seconds at a point while waves come), `interact` (E on a prop: cut chain, start radio, raise
door), `boss`, `talk` (E on a cast member). The last objective of every mission is the checkpoint camp.

## Checkpoints

Reaching the camp: MISSION COMPLETE card (kills, time, deaths), the cast appears at the camp, the gate
behind the camp opens, progress is saved to `deadzone_road_v1` (local only; cloud saves are unchanged).
Press E on Eli at the camp (or the CONTINUE button on the card) to get the next mission's briefing card
and start it. Dying shows a RESTART MISSION screen: the sector's zombies, pickups and quest items reset,
the player snapshot from the mission start is restored.

## Engineering map

- `src/sim/road-data.ts`  sector layout, missions, objectives, dialogue, pickup caches
- `src/sim/road-world.ts` builds the nine sectors on top of world.ts generators (exported as `gen`)
- `src/sim/road.ts`       `newRoad`, `continueRoad`, `stepRoad`, objective logic, spawning, pickups, restart, save
- `src/render/road.ts`    gates, camps, cast, markers, pickup icons
- `src/ui/road.ts`        mission cards, HUD tracker, briefing dialogue
- `tests/road.test.ts`    scripted playthrough of every mission through the sim
