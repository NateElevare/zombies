# DEAD ZONE: The Hive Below (third story)

**Status:** signed off by Nate on 2026-11-11. Nothing is built yet.
The proposal page, with the animated concepts and the sign-off record: https://claude.ai/artifact/EBwWYX2tQwybzWcf8EgG7B
Art brief for the image model: [`art/source/hive-pixel/README.md`](../art/source/hive-pixel/README.md)

A rift opens in the drained reservoir at North Ridge and a swarm comes through. You go down into a hive of seven
chambers, kill the six brood bosses that seal the royal cell, and then kill the Queen. One new map the size of
Bellwether, 11 enemy types, 7 bosses, 11 weapons, 10 missions.

The Long Road and A Group in Need are not touched. This is a third tab under Story, on its own map, playing by the
same rules: missions with one objective at a time, a checkpoint at the end of each, death restarts the mission,
walk-over pickups, XP and the skill tree. No building, no crafting.

## What was signed off

Nate kept all 37 items (8 places, 11 enemies, 7 bosses, 11 weapons). Nothing was cut or marked for change.

| Decision | Choice | Notes |
|---|---|---|
| Name | The Hive Below |  |
| What the creatures are | Giant dead insects on six legs |  |
| When it can be played | **Locked until A Group in Need is finished** | Changed by Nate. The survivor, level, skills and gear carry over from A Group in Need, the way that story carries them over from The Long Road. The F9 testing panel gets an unlock button like the existing one. |
| The rescued four | Ada, Ben, Kit and Lewis fight beside you in two hold-outs |  |
| The art | **Painted by an image model that Nate runs** | Changed in chat after sign-off (the page still shows "drawn by code"). The brief is `art/source/hive-pixel/README.md`. Assumption to confirm: the build uses code-drawn stand-ins until painted sheets arrive, in the same sheet layout, so painted sheets replace them with no code change. |
| Build order | Four playable steps, starting with the Breach and the Warrens |  |
| A Light in the Valley's code | Delete the story's own files and tests in step 1; keep the engine the other modes share | The tab is already off the title screen (done 2026-11-11). |
| Version control | **Yes: git, in a repository called `zombies` under Nate's account** | Nate's note: "add it under my account and call it zombies". First commit before any build work. `.env` is already in `.gitignore`. Assumed private unless Nate says otherwise. |

## Premise

North Ridge has been quiet since you brought Ada, Ben, Kit and Lewis home. Then the reservoir behind the dam drains
in one night. In the mud where the water was there is a tear that glows violet, and things are climbing out of it:
insects the size of people, dead, and still moving.

Eli works out that the tear is being held open from the far side. June starts a new map. Mara stays at the dam with
the wounded and Ruth stays on the radio. You are still the one with the gun, so you go down.

The cast is the one from the other two stories. Mara, Eli, June and Ruth talk you through every mission. Ada, Ben,
Kit and Lewis hold the checkpoint camps behind you and fight beside you in two hold-outs.

## Rules of the hive

- **Seven cells, one comb.** Six brood cells in a ring around the royal cell. The route runs clockwise through all six, then into the middle.
- **Seals.** Each brood cell's boss seals the door out. Kill it and the seal dissolves, a checkpoint camp goes up at the door, and one of the six locks on the Queen's chamber goes dark.
- **Burrows.** Bugs pour out of burrow mouths in the walls, where you can see them coming. A burrow has health: collapse it and that source stops. "Clear the area" objectives become "collapse the burrows".
- **Always dark.** No daylight. You have your flashlight and the glow of each cell's fungus or resin, a different colour in each. One cell has no glow at all.
- **Ichor.** Bugs drop ichor, the ammo for every insect gun. The more they swarm, the more you can shoot. Normal guns still work and still need bullets, which come from crates the hive has dragged down from the city.
- **Eggs and grubs.** Egg clusters hatch grubs if you linger near them. A grub left alive long enough comes back as an adult.

## The map

The Hollow is 16,000 by 16,000, the same world size as Bellwether. The layout below came out of a first version of the
level builder (200 by 200 tiles of 80 px, a different carving style per cell, every cell checked to be one connected
space, route found by shortest path). It is a first pass: landmark rooms get placed by hand in the build. The main route
is about 47,000 px end to end; the Long Road's line from gate to gate is about 46,000.

![Map of the Hollow](../art/source/hive-pixel/concepts/map.png)

Red diamonds are boss arenas, the violet diamond is the Queen, green squares are checkpoint camps, amber marks are
sealed doors and the six locks, the dotted line is the mission route.

| # | Place | Lives here | Light | Boss | Main path |
|---|---|---|---|---|---|
| 0 | **The Breach** | Drone, Hopper | Floodlights and moonlight | none | ~2,100 px |
| 1 | **The Warrens** | Drone, Honeypot, Grub | Amber resin light | The Marshal | ~9,000 px |
| 2 | **The Granary** | Hopper, Shrieker, Drone | Green fungus light | Famine | ~6,500 px |
| 3 | **The Paper Hive** | Stinger, Honeypot, Grub | Yellow, through paper | Matriarch Vespa | ~6,100 px |
| 4 | **The Boiling Galleries** | Spitter, Shieldback, Drone | Orange vent glow | Goliath | ~6,200 px |
| 5 | **The Lantern Deep** | Lurker, Dustwing, Skitterer | None. A few blue glow-worm threads. | The Prioress | ~6,200 px |
| 6 | **The Rot Cellar** | Skitterer, Grub, Honeypot | Dim grey-violet | The Carrion Lord | ~6,200 px |
| 7 | **The Royal Cell** | Every type | Violet rift light | The Queen | ~4,200 px |

**0. The Breach** (open air). The drained reservoir bed at North Ridge, at night. The dam wall is behind you and the rift is in the mud ahead. Small on purpose: one hold-out to learn the numbers, then you go through. Hazards: None yet.

**1. The Warrens** (ants). Small brood chambers joined by narrow, winding tunnels. You are always one corner from the next column, and a tunnel mouth is the only place you can hold a line. Hazards: Burrows in the tunnel walls. Egg nurseries.

**2. The Granary** (locusts and cicadas). One vast open cavern planted with rows of fungus. The rows are low cover: you shoot over them and Hoppers jump over them. There are no walls to put your back against, only rock pillars. Hazards: Locust clouds that sweep the floor in marked lanes.

**3. The Paper Hive** (wasps). A comb of small six-sided rooms with paper walls. Bullets go through the paper and fire burns it, so you can open your own doors. The gaps between some rooms are pits: Stingers fly across, you take the bridges. Hazards: Comb cells that hatch Stingers unless you shoot them first.

**4. The Boiling Galleries** (beetles). Three ring galleries around a core of steam vents, wide enough for a Shieldback to build up a charge. The vents fire on a rhythm and scald bugs as badly as they scald you. Hazards: Steam vents on a timer. Boulders rolled down the straight connectors.

**5. The Lantern Deep** (mantises and moths). A forest of thin rock pillars in total darkness. Your flashlight is the only real light, and it calls every moth in the cell. Lurkers stand against the pillars and wait for you to walk past. Hazards: The dark. Silk cocoons: some hold supplies, some hold a Lurker.

**6. The Rot Cellar** (flies and roaches). Low, blobby cellars half under water, where the hive keeps what it has killed. Wading slows you down, and roach holes in the walls let Skitterers come out behind you. Hazards: Corpse heaps that hatch grubs unless burned. Water halves your speed.

**7. The Royal Cell** (the queen and her guard). A guard ring around the throne chamber, with six sealed alcoves facing the six brood cells. Every type you have met is here at once. The rift is anchored under the Queen. Hazards: All of the above, together.

## The swarm

Every bug is the size of a current zombie, between a crawler and a brute. There are about three times as many around
you, and they arrive in groups.

- The Long Road keeps about 39 roaming zombies alive around you and adds them one at a time, out of sight.
- The Hive keeps up to about 120, sent in columns of 8 to 20 from burrows you can see.
- It stays fair because the fodder dies in one or two shots, most insect weapons hit groups, ichor drops keep ammo coming, and Honeypots and vents hurt or stall the bugs as much as you.
- The cap has to be measured. The zombie code already sorts neighbours into a grid, but nothing has run at this size. Record 150 and 200 on screen with the F8 recorder before fixing the cap at 120.

![Enemies at true size](../art/source/hive-pixel/concepts/scale-enemies.png)

## Enemies

Health, speed and hit numbers are starting points set against the current zombies, to be tuned in play. For reference:
walker 38 health, 65 speed; runner 25, 135; brute 160, 43; crawler 20, 92; bloater 78, 48.

| Enemy | Insect | Role | Radius | Health | Speed | Hit | First met |
|---|---|---|---|---|---|---|---|
| **Drone** | Worker ant | Fodder | 13 | 24 | 82 | 7 | The Warrens |
| **Hopper** | Locust | Fodder that jumps | 11 | 18 | 105 | 6 | The Granary |
| **Honeypot** | Honeypot ant | Walking hazard | 19 | 75 | 45 | 10 | The Warrens |
| **Shrieker** | Cicada | Caller | 14 | 45 | 55 | 6 | The Granary |
| **Stinger** | Wasp | Flier | 12 | 28 | 120 | 8 | The Paper Hive |
| **Spitter** | Bombardier beetle | Ranged | 17 | 65 | 50 | 16 | The Boiling Galleries |
| **Shieldback** | Rhinoceros beetle | Tank | 23 | 230 | 44 | 28 | The Boiling Galleries |
| **Lurker** | Praying mantis | Ambusher | 16 | 95 | waits, then 320 | 32 | The Lantern Deep |
| **Dustwing** | Moth | Light-seeker | 13 | 30 | 95 | 5 | The Lantern Deep |
| **Skitterer** | Cockroach | Flanker | 10 | 22 | 145 | 5 | The Rot Cellar |
| **Grub** | Larva | Hatchling | 8 | 12 | 95 | 4 | The Rot Cellar |

### Drone

![Drone](../art/source/hive-pixel/concepts/enemy-drone.png)

Worker ant. Fodder. A walker with a third less health, a little faster. Columns of 8 to 14.

- **Alarm pheromone:** The first drone to see you marks you. Every drone within 600 px joins in and none of them lose your trail for 12 seconds. Five or more together move 20% faster.
- **How you beat it:** Kill the scout before it reaches the others. Fight at tunnel mouths.

### Hopper

![Hopper](../art/source/hive-pixel/concepts/enemy-hopper.png)

Locust. Fodder that jumps. A runner, slower on foot. Clouds of 12 to 20.

- **Leap:** Jumps up to 280 px over other bugs and low cover to land beside you, every 2.5 seconds. It can be shot in the air.
- **How you beat it:** Keep moving sideways. Use spread weapons. A chokepoint will not hold them.

### Honeypot

![Honeypot](../art/source/hive-pixel/concepts/enemy-honeypot.png)

Honeypot ant. Walking hazard. The bloater, with honey instead of an explosion. One or two inside a column.

- **Honey burst:** Bursts on death into a pool of honey, 110 px across for 7 seconds, that halves movement speed. Yours and the bugs'.
- **How you beat it:** Pop it while the column is walking past and the whole column bogs down. Never pop it at your feet.

### Shrieker

![Shrieker](../art/source/hive-pixel/concepts/enemy-shrieker.png)

Cicada. Caller. New. Nothing in the game does this now. Alone, behind the others.

- **Chorus:** Hangs back. After a 1.2 second wind-up it screams: every bug within 900 px comes for you and moves 25% faster for 6 seconds. Your flashlight flickers.
- **How you beat it:** Kill it first. The glow during the wind-up gives its position away.

### Stinger

![Stinger](../art/source/hive-pixel/concepts/enemy-stinger.png)

Wasp. Flier. A runner that ignores the floor. Flights of 4 to 8.

- **Flight and venom:** Flies over pits, low cover and other bugs. Each sting adds a venom stack: 3 damage a second for 4 seconds, up to 3 stacks.
- **How you beat it:** Back into a tunnel so they come from one direction. Shotguns and the Bombardier.

### Spitter

![Spitter](../art/source/hive-pixel/concepts/enemy-spitter.png)

Bombardier beetle. Ranged. New. The first ordinary enemy that attacks from range. Two or three behind a column.

- **Boiling spray:** Plants its legs at 220 px and, after a 0.6 second tell, fires a 60° cone of scalding spray. The puddle burns for 2 seconds.
- **How you beat it:** Sidestep during the tell. It cannot turn while spraying, so hit it from the side.

### Shieldback

![Shieldback](../art/source/hive-pixel/concepts/enemy-shieldback.png)

Rhinoceros beetle. Tank. The brute, with armour on the front. One at the head of a column.

- **Front plate and charge:** Shots to its front do 20% damage. It lowers its horn and charges in a straight line at 300 speed, shoving other bugs aside.
- **How you beat it:** Flank it, burn it, or corrode it: acid strips the plate. Dodge the charge and shoot its back.

### Lurker

![Lurker](../art/source/hive-pixel/concepts/enemy-lurker.png)

Praying mantis. Ambusher. New. It does not chase; it waits. Alone.

- **Camouflage:** Stands motionless against a wall, almost invisible until your flashlight beam is on it or you come within 170 px. Then it lunges at 320 speed. It is exposed for 1.5 seconds after a miss.
- **How you beat it:** Sweep the walls with your beam before you walk past. Listen for the click.

### Dustwing

![Dustwing](../art/source/hive-pixel/concepts/enemy-dustwing.png)

Moth. Light-seeker. New. It reacts to your flashlight. Drifts in by threes and fours.

- **Drawn to light:** Homes on your flashlight. Switch it off and it loses you in 2 seconds. If it reaches you or dies close by, its dust cuts your beam's range by 40% for 6 seconds.
- **How you beat it:** Kill it at range, or go dark and let it drift past.

### Skitterer

![Skitterer](../art/source/hive-pixel/concepts/enemy-skitterer.png)

Cockroach. Flanker. A runner that avoids your light. Scatters of 6 to 10.

- **Light-shy, hard to kill:** Runs out of your beam and circles round to come at you from the dark. One in three gets back up after 2 seconds unless it died to fire, acid or an explosion.
- **How you beat it:** Fire and acid. Keep your back to a wall.

### Grub

![Grub](../art/source/hive-pixel/concepts/enemy-grub.png)

Larva. Hatchling. The crawler, weaker. Hatches three or four at a time.

- **Metamorphosis:** Hatches from egg clusters and infested corpses. A grub left alive for 25 seconds burrows and comes back as a random adult.
- **How you beat it:** Kill them early. Burn eggs and corpses before they hatch.

## Bosses

These sit on the existing boss system: specials with a warning before they land, rage below half health, and a trophy
weapon on death. Today's bosses run from 3,200 health (Howler) to 6,500 (Juggernaut); the Warden has 26,000.

![Bosses at true size](../art/source/hive-pixel/concepts/scale-bosses.png)

### The Marshal

Soldier ant, boss of The Warrens. Radius 40, 5,000 health. Drops the Mandible Shears.

- **Jaw charge:** A straight lane, marked before it goes. If it hits a wall it is stunned for 1.4 seconds.
- **Rally:** A pheromone burst. Two columns of eight Drones march in and every Drone in the arena speeds up.
- **Formic arc:** Sprays a 90° cone of acid that leaves pools on the floor.
- **Rage:** Below half health it charges twice in a row.
- **How you win:** Make it charge into a wall, then unload.

### Famine

Locust, boss of The Granary. Radius 34, 4,500 health. Drops the Locust Repeater.

- **Skyfall:** Leaps out of sight. A shadow marks where it lands, and the landing throws a shockwave ring.
- **Swarm front:** A wall of locusts sweeps a marked lane across the cavern. Stand in the gap or behind a pillar.
- **Strip:** Eats the fungus rows you are using for cover, so the arena opens up as the fight goes on.
- **Rage:** Below half health it leaps three times in a row.
- **How you win:** It is stuck in the ground for a moment after each landing.

### Matriarch Vespa

Hornet, boss of The Paper Hive. Radius 36, 5,200 health. Drops the Vespiary.

- **Strafing run:** Flies a marked lane across the room, firing stingers down it.
- **Venom volley:** Lobs three globs that become venom pools.
- **Hatch:** Three comb cells in the arena wall light up. Shoot them within 5 seconds or each one releases four Stingers.
- **Rage:** Below half health she lands and adds an impaling dash.
- **How you win:** She hovers still while the comb cells hatch.

### Goliath

Hercules beetle, boss of The Boiling Galleries. Radius 48, 7,500 health. Drops the Hornbreaker.

- **Ram:** A charge. Dodge it so the horn buries itself in a pillar: stuck for 2.5 seconds, and its soft back takes double damage.
- **Boiling vent:** Turns and sprays a wide scalding cone behind it, so you cannot camp its back.
- **Shell quake:** A line of eruptions racing toward you.
- **Rage:** Below half health the pillars shatter on the first hit, so each one only saves you once.
- **How you win:** Shots to the front do 15%. Everything depends on the pillars.

### The Prioress

Praying mantis, boss of The Lantern Deep. Radius 34, 5,000 health. Drops the Mantis Scythes.

- **Vanish:** Invisible outside your flashlight beam. Watch for the shimmer and her footprints.
- **Scythe cross:** Two dash lanes that cross where you are standing.
- **Reap:** A 200° sweep if you stay close.
- **Vespers:** Calls Dustwings to your light.
- **Rage:** Below half health she strikes twice each time she vanishes.
- **How you win:** She is slow to recover after the cross. Keep the beam on her.

### The Carrion Lord

Blowfly, boss of The Rot Cellar. Radius 42, 6,000 health. Drops the Carrion Hive.

- **Infest:** Lays eggs in every corpse in the arena. Five seconds later each one bursts into three Grubs. Burn or blow up the corpses first.
- **Bile flood:** Vomits a puddle that keeps spreading.
- **Buzz dash:** A zig-zag flight across the room.
- **Stench:** A toxic aura, the same as the Plague Lord's.
- **Rage:** Below half health carcasses fall from the roof, giving it more to infest.
- **How you win:** Fewer corpses means a weaker boss. Fire is the best weapon in the room.

### The Queen

Termite and ant queens, final boss, in the Royal Cell. 40,000 across four stages. Drops the Queen's Decree. She is drawn larger than the Warden.

1. **The Court.** She is sealed in resin. Destroy the four jelly conduits around the chamber while the royal guard comes at you. She lobs egg bombs.
2. **The Brood.** The resin cracks. Shoot the egg sac. She lays clutches that hatch into each cell's bugs in turn, and it rains acid.
3. **Unbound.** She tears free of the sac and moves: charge, leap, scream. The rift pulls you toward it.
4. **The Anchor.** She falls across the rift's anchor. Shoot the exposed heart while the roof comes down.

## Weapons

Seven are boss trophies and four are found in the cells. The guns run on ichor; the three melee weapons need nothing.

| Weapon | Insect | Slot | Where it comes from | What it does | Numbers |
|---|---|---|---|---|---|
| **Formic Sprayer** | Ant | Primary | Found in the Warrens | A stream of acid out to 240 px. Every hit adds a corrosion stack that keeps burning. Four stacks strip a Shieldback's plate. | Stream · 80 per tank |
| **Mandible Shears** | Soldier ant | Melee | Dropped by the Marshal | A heavy snap in a narrow arc. A kill cuts through to two more bugs behind it. Ignores armour plates. | 80 damage · 0.6 s |
| **Locust Repeater** | Locust | Primary | Dropped by Famine | Fast automatic. Every shot hops on to two more bugs within 140 px at 60% damage. | 14 damage · 40 per drum |
| **Needler** | Wasp | Primary | Found in the Paper Hive | A semi-automatic rifle. Needles pass through three bugs and inject venom, 30 damage over 4 seconds. | 60 damage · range 1,100 |
| **The Vespiary** | Hornet nest | Sidearm | Dropped by Matriarch Vespa | Fires hornets that home on the nearest bug. It breeds its own: holds 24 and refills 2 a second while holstered, so it never needs ammo. | 12 damage · homing |
| **Bombardier** | Bombardier beetle | Primary | Found in the Boiling Galleries | A short cone of boiling spray, 260 px. Sets bugs alight and shoves them back. | Shotgun class · 5 shots |
| **Hornbreaker** | Hercules beetle | Melee | Dropped by Goliath | A slow hammer. Every hit sends a shock line 300 px forward that knocks a column flat. | 110 damage · 1.0 s |
| **Lure Lantern** | Firefly | Sidearm | Found in the Lantern Deep | Lobs a glowing lure. Every ordinary bug within 500 px attacks it for 6 seconds, then it bursts for 120 damage. | Carry 6 |
| **Mantis Scythes** | Praying mantis | Melee | Dropped by the Prioress | Fast twin blades with a wide arc. Each swing steps you forward. Double damage from behind, and a little health back per hit. | 48 damage · 0.26 s |
| **Carrion Hive** | Blowfly | Primary | Dropped by the Carrion Lord | Lobs a pod. A cloud of flies hangs for 6 seconds, and any bug that dies inside it bursts and hurts the ones beside it. | 25 damage a second · 3 pods |
| **Queen's Decree** | Queen pheromone | Sidearm | Dropped by the Queen | Fires a pheromone dart. The swarm turns on the marked bug for 6 seconds. A marked boss takes 25% more damage instead. You keep it after the ending. | Mark · 6 s |

Also new:

- **Ichor.** Shared ammo for every insect gun. Any bug can drop it; bosses and burrows drop a lot.
- **Royal jelly.** A second healing item. Heals 50 and adds 20% damage for 10 seconds. Found in nurseries, dropped by bosses.
- **Carapace vest.** Body armour cut from a Shieldback, one step above the Military Vest (33% against 30%). Found in the Boiling Galleries.

## Missions

| # | Where | Mission | What you do | Boss |
|---|---|---|---|---|
| 1 | The Breach | **The Water Is Gone** | Reach the floodlights on the dam. Hold the dam wall for 60 seconds against the first swarm. Go through the rift. | none |
| 2 | 1 · The Warrens | **Follow the Column** | Follow the pheromone trail in. Collapse three burrows. Take the Formic Sprayer from a dragged-down supply crate. | The Marshal |
| 3 | 2 · The Granary | **The Choir** | Cross the open cavern. Silence three Shriekers. Hold a rock pillar with the squad while the cloud passes. | Famine |
| 4 | 3 · The Paper Hive | **Paper Walls** | Burn out the brood combs. Find the Needler. Cross the pits to the atrium. | Matriarch Vespa |
| 5 | 4 · The Boiling Galleries | **Pressure** | Time the steam vents. Take the Bombardier. Get down the long gallery past the rolling boulders. | Goliath |
| 6 | 5 · The Lantern Deep | **Lights Out** | Cross the dark with moths on your beam. Find the lantern flares. Cut down three cocoons. | The Prioress |
| 7 | 6 · The Rot Cellar | **What They Keep** | Wade the flooded cellars. Burn the corpse heaps before they hatch. | The Carrion Lord |
| 8 | 7 · The Royal Cell | **Six Seals** | All six locks are dark. Break through the guard ring. Hold the antechamber with the squad while Eli's charge is carried down. | none |
| 9 | 7 · The Royal Cell | **The Queen** | The four-stage fight. | The Queen |
| 10 | Back to the Breach | **Daylight** | The rift is closing. Run the shortcut shaft back to the surface before it shuts, with everything that is left behind you. | none |

## Build order

Before step 1: set up git and the `zombies` repository and make the first commit.

1. **First playable: the Breach and the Warrens.** The foundations: the cave map builder, the cave look (floor, rock, glow lighting), burrows, the bigger swarm spawner, the Story tab and its save slot, the unlock after A Group in Need. Delete A Light in the Valley's own files and tests. Then missions 1 and 2 with Drone, Honeypot, Grub, the Marshal, the Formic Sprayer and the Mandible Shears. This is where Nate judges the swarm size.
2. **The Granary and the Paper Hive.** Leaping, calling and flying enemies; paper walls that can be shot through; pits. Missions 3 and 4 with Hopper, Shrieker, Stinger, Famine, Matriarch Vespa, the Locust Repeater, the Needler and the Vespiary.
3. **The Boiling Galleries and the Lantern Deep.** Armour that has to be flanked, steam vents, enemies that react to the flashlight, the pitch-black cell. Missions 5 and 6 with Spitter, Shieldback, Lurker, Dustwing, Goliath, the Prioress, the Bombardier, Hornbreaker, Lure Lantern and Mantis Scythes.
4. **The Rot Cellar, the Royal Cell and the ending.** Corpses that hatch, the Queen's four stages, the run back to the surface, then a balance pass. Missions 7 to 10 with Skitterer, the Carrion Lord, the Queen, the Carrion Hive and the Queen's Decree.

Each step ships with the same kind of tests the Long Road has: a scripted playthrough of every mission and a check that
the whole route can be walked.

## Notes for whoever builds it

- **Reused:** missions, objectives, checkpoints and saves (`src/sim/road.ts`, `road-data.ts`), the boss kit (`bosses.ts`), flow-field pathing, acid and fire effects, the squad (`road-squad.ts`).
- **New:** the cave builder and its look, burrows, flying and leaping movement, armour facing, light-seeking, and six weapon behaviours (homing, hopping shots, lures, clouds, shock lines, pheromones).
- **Ids used in the art brief**, to keep code and art in step. Enemy types: `drone`, `hopper`, `honeypot`, `shrieker`, `stinger`, `spitter`, `shieldback`, `lurker`, `dustwing`, `skitterer`, `grub`. Bosses: `marshal`, `famine`, `vespa`, `goliath`, `prioress`, `carrion_lord`, `queen`. Weapons: `formic_sprayer`, `mandible_shears`, `locust_repeater`, `needler`, `vespiary`, `bombardier`, `hornbreaker`, `lure_lantern`, `mantis_scythes`, `carrion_hive`, `queens_decree`. Items: `ichor`, `royal_jelly`, `carapace_vest`.
- **Art sheets:** enemy sheets use the zombie layout (8 x 4) plus four "special" frames in row 4, cells 2 to 5, the slot the bloater's pulse frames use today. Boss sheets use the boss layout (4 x 4). The importer should scale each creature to its radius rather than trusting the sheet's scale.
- **The removed story:** `src/sim/campaign*.ts`, `src/ui/campaign.ts`, `src/render/campaign.ts`, their tests and `tools/check-story-legacy.mjs` are what "the story's own files" means. `src/campaign-art.ts` stays: the Long Road draws its gates, camps and cast from it.
- **What could still change:** the swarm cap, if 120 costs too many frames, and every number here once it has been played.

## Build log

### Step 1, built 2026-11-11: the Breach and the Warrens

Playable from the title screen: **Story → The Hive Below**. It is locked until A Group in Need is finished; for testing,
press **F9** and click **Unlock The Hive Below** (it does not mark the other stories complete). With no earlier save on
the machine the testing unlock starts a fresh survivor with an SMG; otherwise the survivor of A Group in Need (or of
The Long Road, if that is all there is) carries over.

What exists:

- **The Hollow** (`src/sim/hive-world.ts`): all seven cells and the Breach are carved, 200 x 200 tiles of 80 px, the same
  map every time. Route through every arena about 47,700 px. Only the Breach and the Warrens have missions; the other
  cells are behind their seals and show as faint shapes on the map.
- **Missions 1 and 2** (`src/sim/hive-data.ts`), run by the Long Road's mission code (`src/sim/road.ts`), with two new
  objective kinds: `burrows` (collapse them) and a boss that is already `fixed` in its arena, plus hold-out waves that
  climb out of one place (`from`).
- **The swarm** (`src/sim/hive.ts`): burrows that send columns of 8 to 14, the Drone's alarm pheromone and frenzy, the
  Honeypot's honey, egg clusters that hatch Grubs, Grubs that grow into Drones. Burrow mouths and egg clusters are inert
  zombie types, so every weapon already hurts them.
- **The Marshal** (`src/sim/bosses.ts`): jaw charge (stunned 1.4 s if it hits a wall), rally (two columns of eight and a
  speed-up), formic arc (five pools across 90 degrees), and a second charge in a row below half health.
- **Formic Sprayer, Mandible Shears, ichor, royal jelly** (`src/sim/combat.ts`, `items.ts`).
- **The look**: cave floor and walls per cell (`src/render/ground.ts`), cave light from resin lumps, floodlights, the
  rift and honey (`src/render/lighting.ts`), seals, rift and honey sprites (`src/render/hive.ts`), the map and minimap
  (`src/ui/mapview.ts`). Insects bleed yellow-green.
- **Art**: the painted sheets are used as delivered. `art/hive/props.ts` adds code-drawn pixel props the brief did not
  cover (burrow mouth, egg cluster, resin seal, the rift, honey, resin lumps); `npm run art:hive` packs them into a sixth
  atlas, `hive_props`. Replace them with painted ones by keeping the frame names.
- **A Light in the Valley** is deleted (see `notes/campaign-implementation.md`).

Numbers worth knowing when playing it (all in `src/sim/hive.ts` and `hive-data.ts` unless noted):

| What | Value | Where |
|---|---|---|
| Live bugs the hive will keep at most | 240 (`SWARM_CAP`; 120 until Nate's second play) | `hive.ts` |
| Warrens: bugs the burrows keep up, seconds between columns, column size | 60, 20 s (13 s at the story's pressure of 1.5), 8 to 14 | mission `swarm` in `hive-data.ts` |
| Breach hold-out | 60 s, a wave of 28 every 6 s, from the rift (7 until Nate's second play) | `hive-data.ts` |
| Burrow health, egg cluster health | 260, 45 | `zombies.ts` `TYPES` |
| Honey pool | radius 62 px, 7 s, half speed for you and for bugs | `hive.ts` |
| Corrosion (Sprayer) | up to 6 stacks, 2 damage per stack twice a second, 4 s | `zombies.ts` |
| Mandible Shears cut-through | 2 more bugs within 150 px behind a kill | `combat.ts` |

Measured: the simulation costs 0.44 ms a tick with 120 live bugs, 0.54 ms with 150 and 0.72 ms with 200 (Node, one
core; a tick has 16.7 ms). The renderer's cost at those counts could not be measured in the build machine's software
renderer: check it on the real machine with the F8 recorder before changing the cap.

Different from the plan, on purpose:

- The Breach has Drones only. Hoppers arrive with the Granary in step 2.
- A seal on a tunnel that runs straight along x or y is a thin plug. A diagonal tunnel still needs a square block; the
  first diagonal seal is the Granary's exit, so that is step 2's to solve.
- The honey pool is 124 px across, not 110, so it fills more of a tunnel.
- The checkpoint camp and its crates appear when you make camp, not before (nobody is ahead of you underground).
- Finishing mission 2 shows a "part one complete" card. The save is kept, and Continue goes on with mission 3 once it exists.

Tests: `tests/hive.test.ts` (map connectivity and seals, the unlock and carry-over, a scripted playthrough of both
missions, each swarm behaviour, the Marshal's moves, both weapons, the cost of 200 bugs) and `tests/hive-art.test.ts`.

Not done yet: steps 2 to 4. Nothing in the Warrens has been balanced by play, only by arithmetic.

### 2026-11-11, after Nate's first play: backpack room

- Ammunition and healing items stack three times as high (9mm and 5.56 to 720, 12 gauge 360, .357 and .308 540, ichor 1,200,
  mints 120; bandages and painkillers 60, medkits and royal jelly 30). `src/sim/items.ts`.
- A checkpoint saved under the old limits is folded together when it loads (`inventory.compact`, called from
  `road.ts` `restorePlayer`), so a full backpack gets its room back on Continue without losing anything.
- The inventory screen has tabs over the backpack: ALL, WEAPONS & GEAR, AMMO, HEALING (and OTHER when something fits
  none of them). They are views of the one backpack, not extra space. `src/ui/overlays.ts` `backpack()`.

### 2026-11-11, after Nate's first play: fewer drops from kills

Nate found the drops in the hive far too high. The two earlier stories were not changed (4.5% ammunition and 2% a
bandage per kill, as before); the hive had added ichor on 30% of kills on top of that. Now, per bug killed: 3% ichor
(12 to 20), 1.5% ordinary ammunition, 0.7% a bandage, and a kill pays out one thing at most (`ICHOR_DROP`, `AMMO_DROP`,
`BANDAGE_DROP` in `src/sim/hive.ts`). Egg clusters: 25% ichor, 8% royal jelly. Burrows (24 to 36 ichor) and bosses are
unchanged. This departs from the plan's "the more they swarm, the more you can shoot": the Sprayer now lives on
collapsed burrows, the hive's crates and the camps rather than on kills.

### 2026-11-11, after Nate's first play: tougher bugs

You arrive with upgraded weapons, skills and a lot of ammunition, so everything in the hive now has **1.5 times the
health and 1.3 times the damage** of its base numbers: Drone 36 health and 9 a bite, Honeypot 113 and 13, Grub 18 and 5,
burrow 390, the Marshal 7,500 with every attack 30% harder. Egg clusters stay at 45. One dial: `TOUGH` in
`src/sim/hive.ts`; a mission can set its own with `tough` in `hive-data.ts` (later cells will want more).

### 2026-11-11, after Nate's first play: a skill tree for the insect weapons

The K screen has an eighth tree in The Hive Below, **Hive Weapons** (nine perks, skill points only), and the other modes
never show it. It upgrades every weapon marked `tree: 'hive'` in `src/sim/combat.ts` (the Formic Sprayer and the
Mandible Shears today; the nine weapons of steps 2 to 4 join it), **on top of the tree of the weapon's class**: the
Sprayer still takes the SMG tree and the Shears the Melee tree (Nate's choice after trying it).

| Perk | What it does | Cost | Needs |
|---|---|---|---|
| Ripe Ichor I | +15% damage with insect weapons | 1 | |
| Swollen Tank | Formic Sprayer: +30 to a tank | 1 | Ripe Ichor I |
| Stronger Acid | Corrosion burns 50% harder | 1 | Ripe Ichor I |
| Longer Jaws | Mandible Shears: reach +15%, arc +25% | 1 | Ripe Ichor I |
| Ripe Ichor II | +20% damage | 1 | Swollen Tank |
| Deep Burn | Corrosion stacks 3 higher and lasts 2 s longer | 2 | Stronger Acid |
| Clean Through | Shears cut through to 2 more bugs, knockback +50% | 2 | Longer Jaws |
| Harvester | Ichor from kills twice as often; burrows and eggs give half again as much | 3 | Ripe Ichor II, Deep Burn |
| Queen's Venom | +25% damage, 10% chance of double damage | 3 | Deep Burn, Clean Through |

The tree is data in `src/sim/progression.ts` (`"id": "hive"`); `perkSum` reads the perks that act outside the weapon's
own numbers (corrosion in `zombies.ts`, ichor in `hive.ts`).

### 2026-11-11, after Nate's second play: down the rope with your belt, and the lockbox

The weapons carried over from the first two stories still trivialised the hive, so the old kit now stays on the
surface for one mission and comes back as a choice.

**The hand-over.** The way into the hive is a rope, and Mara needs the long guns to hold the dam. When the Warrens
start (`handOver: true` on the mission in `src/sim/hive-data.ts`), `handOver()` in `src/sim/hive-kit.ts` leaves you:

- whatever is equipped except the primary: the sidearm (with its level), the melee weapon, helmet, vest and backpack
- **300 rounds** for that sidearm (if you have fewer, Mara makes up the difference)
- **half your bandages**, rounded your way
- your level, skill points and skills, and anything that came out of the hive (ichor, royal jelly, insect weapons)

Everything else goes into the lockbox: the primary with the rounds in its magazine, every other weapon, all other
ammunition, medkits, painkillers, spare armour, and whatever was still lying on the reservoir bed. An empty holster is
filled from the pack, or with a pistol if there is none.

**Choosing your belt.** The Breach now ends with a held key at the camp ("Hand over the long guns and rest"), not the
moment you walk in. Mara says what the rope takes and a banner repeats it, so there is time to open the inventory and
put the handgun and the melee weapon you want on your belt. The Warrens' briefing card lists what you carry.

**The Warrens with a handgun.** The supply crates hold rounds for the sidearm (`ammo_sidearm` in a cache means
"whatever the handgun fires", counted in pistol magazines), the nooks hold no guns and no other calibre, and a kill
that drops ammunition drops it for the sidearm. The Formic Sprayer goes straight into the empty primary slot when you
pick it up. Toughness and the swarm are unchanged: this is meant to be the struggle.

**The lockbox.** When the Marshal dies and the camp at the seal is made, the lockbox comes down the rope (banner,
steel box beside the tent, label). E opens it as a two-way transfer with your equipment shown beside the backpack:
click to move a stack across, right-click a stored weapon or armour to put it on, click something you wear to take it
off. The camp then waits for a held key ("Rest at the camp") so you can sort first. From then on the lockbox is at the
camp you set out from and at each camp you make, and what you leave in it stays there. It is part of the checkpoint
(`PlayerSnapshot.lockbox`), so a restart puts both the belt and the box back as they were, and it is in the save.

A save that is already inside the Warrens is stripped the same way the next time it loads. A save that finished the
Warrens before this existed gets the box with everything in it at the start of the next mission.

Dials: `SIDEARM_ROUNDS` and `LOCKBOX_SLOTS` in `hive-kit.ts`; `handOver` and the `rest` label of a camp objective in
`hive-data.ts`. Not measured: how hard the Warrens are with an unskilled handgun. On paper a base pistol has enough
rounds for the scouts, the three burrows and the Marshal (with the Sprayer), but not for standing near live burrows;
if it is too much, lower `swarm` or set `tough` on the Warrens.

### 2026-11-11, after Nate's second play: the opening fight is four times the size

The hold-out at the dam was underwhelming with a full kit, and it is now the last fight with everything you own, so it
sends **28 Drones every 6 seconds instead of 7**: about 280 in the minute, one unbroken column out of the rift (a
column climbs out at one bug every 0.18 s, so a wave of 28 takes five of the six seconds). Still 60 seconds. The cap of
240 alive (`SWARM_CAP`, doubled the same day at Nate's request) holds a wave back when you fall behind, so a weaker kit is pressed, not buried. Whatever is
still alive when the minute ends has to be killed before you can rest at the camp. One number: `count` on the
hold-out in `hive-data.ts`.

### Steps 2 to 4, built 2026-11-11: the six cells beyond the Warrens, the Queen and the way back up

Nate played the Breach and the Warrens twice and asked for the rest in one go. The campaign is now ten missions:
The Water Is Gone, Follow the Column, **The Choir** (Granary, Famine), **Paper Walls** (Paper Hive, Matriarch Vespa),
**Pressure** (Boiling Galleries, Goliath), **Lights Out** (Lantern Deep, the Prioress), **What They Keep** (Rot Cellar,
the Carrion Lord), **Six Seals** (Royal Cell), **The Queen**, **Daylight**. A save that finished the Warrens carries on
with the Granary.

**Where things are.**

| What | File |
|---|---|
| Missions, dialogue, supplies, per-cell toughness and swarm | `src/sim/hive-data.ts` |
| The eight new insects, venom and dust on you, the two cell hazards | `src/sim/hive-bugs.ts` |
| The nine new weapons | `src/sim/hive-arms.ts` (numbers in `combat.ts` WEAPONS, items in `items.ts`) |
| The six new bosses | `src/sim/hive-bosses.ts` (numbers in `bosses.ts` BOSSES) |
| Mission stops, fixture spots, vents, Lurker spots, measured off the carved map | `src/sim/hive-sites.ts` |
| Lures, fly clouds and thrown things on screen | `src/render/hive-arms.ts` |
| Tests | `tests/hive-cells.test.ts` (38), and the ten-mission playthrough in `tests/hive.test.ts` |

The map builder (`hive-world.ts`) was not changed: another tool is repainting the cave and its shape at the moment, so
everything new measures the map instead of editing it.

**Insects** (numbers as in the table above; all take the cell's toughness).

| Insect | What it does in the game |
|---|---|
| Hopper | Leaps 130 to 290 px to land beside you, half a second in the air, every 2.5 s. Can be shot in the air. |
| Shrieker | Hangs back at 400 px. A 1.2 s wind-up (marked), then every bug within 900 px comes for you 25% faster for 6 s. |
| Stinger | On the wing: honey does not slow it. Each sting is a venom stack, 3 a second for 4 s, up to three. |
| Spitter | Plants its feet inside 240 px, shows the cone for 0.6 s, cannot turn, sprays, leaves a 2 s puddle. |
| Shieldback | Shots to its front do 20%. Fire, blasts, the Mandible Shears and four stacks of corrosion ignore the plate. Charges in a marked line at 300. |
| Lurker | Stands against the rock at 10% opacity and does not move until your beam is on it or you are within 170 px. Lunges at 320; a miss leaves it open for 1.5 s. |
| Dustwing | Comes to your lamp from 900 px. Lamp off: it loses you in 2 s. A bite, or dying within 120 px, dusts the lamp: beam 40% shorter for 6 s. |
| Skitterer | Runs sideways out of your beam. One in three gets back up after 2 s at half health, once, unless it burned, was blown apart or died to acid. |
| Grub | Now grows into an adult of the cell it is in (it was always a Drone). |

**Weapons.** All take the Hive tree and the tree of their class. The heavier guns cost more than one ichor a round
(`ammoPer`).

| Weapon | Slot, source | In the game |
|---|---|---|
| Locust Repeater | Primary, Famine | 14 damage, 40 a drum. Each hit hops to two more bugs within 140 px at 60%. |
| Needler | Primary, found in the Paper Hive | 60 damage, range 1,100, through three bugs, 30 venom over 4 s each. 4 ichor a needle, 8 a magazine. |
| The Vespiary | Sidearm, Vespa | Homing hornets, 12 damage. Holds 24, breeds 2 a second while holstered, never reloads. |
| Bombardier | Primary, found in the Galleries | Nine pellets out to 260 px, sets alight, shoves back. 8 ichor a shot, 5 shots. |
| Hornbreaker | Melee, Goliath | 110 damage, 1 s. Every swing sends a shock line 300 px forward: half damage and 1.1 s flat on their backs. |
| Lure Lantern | Sidearm, found in the Lantern Deep | Lobbed. Every ordinary bug within 500 px goes for it for 6 s (and does not bite you on the way), then 120 damage. 15 ichor a lure, carries 6. |
| Mantis Scythes | Melee, the Prioress | 48 damage, 0.26 s, wide. Steps you forward 22 px, double damage from behind, 4% of damage back as health. |
| Carrion Hive | Primary, the Carrion Lord | Lobbed pod: a cloud 105 px wide for 6 s at 25 a second; what dies in it bursts for 30 on its neighbours. 25 ichor a pod, 3 pods. |
| Queen's Decree | Sidearm, the Queen | A dart. Bugs within 450 px attack the marked bug for 6 s. A marked boss takes 25% more damage. 10 ichor a dart. |
| Carapace Vest | Body, a crate in the Galleries | 33% (Military Vest 30%). |

**Bosses.** Every special is marked on the floor before it lands, and every one rages below half health.

| Boss | Fight |
|---|---|
| Famine, 4,500 | Skyfall: leaps out of sight (cannot be hit), a marked circle, a shockwave, then stuck for 1.2 s. Swarm front: a marked lane across the cavern, and six Hoppers. Rage: three leaps in a row. |
| Matriarch Vespa, 5,200 | Strafing run down a marked lane firing stingers sideways. Three venom globs. Hatch: three comb cells that release four Stingers each after 5 s unless destroyed; she hovers still for 2.6 s. Rage: she lands and adds a dash. |
| Goliath, 7,500 | Front does 15%. Ram: a miss buries the horn in the rock, stuck 2.5 s, double damage. A scalding cone behind it if you stand there. A line of six eruptions. Rage: stuck only 1.6 s. |
| The Prioress, 5,000 | Fades to 6% outside your beam. Two dashes in a row, the second aimed at where you are now (three in a rage), then 1.2 s tired. A 200 degree reap inside 115 px. Four Dustwings every 15 s. |
| The Carrion Lord, 6,000 | Toxic aura inside 135 px. Infest: three heaps (five in a rage) that burst into three Grubs each after 5 s unless destroyed. Bile: a puddle that grows to 150 px. Buzz dash: three zig-zag legs. |
| The Queen, 40,000 | 1 the Court: cannot be hurt until the four conduits round the room are down; lobs egg bombs, sends the guard. 2 the Brood: lays each cell's bugs in turn, acid rain. 3 Unbound: charge, leap, scream; the rift pulls you toward the middle. 4 the Anchor: back on the anchor, takes 150%, the roof comes down. No stage can be skipped by one big hit. |

**Missions.** Every camp from the Warrens on has the lockbox and ends with a held key. Toughness rises cell by cell:
health x1.6, 1.7, 1.8, 1.9, 2.0, 2.1 (damage x1.35 to 1.6); the Queen's own mission is x1.5 so she has 60,000.
Swarm caps: Granary 110, Paper Hive 100, Galleries 120, Lantern Deep 70, Rot Cellar 130, Royal Cell 150, and the two
big hold-outs run to the global 240.

- Objective burrows now work anywhere, and can be other fixtures: brood combs (hatch Stingers), silk cocoons (supplies
  or a Lurker, never open on their own), corpse heaps (hatch Grubs). `fixture` on a `burrows` objective.
- Ada, Ben, Kit and Lewis stand with you in three hold-outs (`squad`): the Granary pillar, the antechamber, the dam.
- Hazards (`hazard` on a mission): the Granary's locust lanes (a marked strip, 1.5 s, then it sweeps), the Galleries'
  steam vents (five-second clock, 1.2 s warning, scald bugs as badly as you).
- The Lantern Deep starts with twelve Lurkers against the rock (`lurkers`).
- Daylight: you come up at the rift at first light, 45 seconds to reach the dam (`limit` on a `reach`), a last
  hold-out with everyone on the wall, and the breaker fires Eli's charge: the rift shuts and everything left dies.

**Not built, on purpose, and why.** These are parts of the plan that change the cave itself, and the cave is being
repainted by another tool right now, so they would have collided with that work:

- Granary: fungus rows as low cover, and Famine eating them.
- Paper Hive: paper walls bullets pass through and fire burns, pits and bridges. (The brood combs are in.)
- Boiling Galleries: rolling boulders. Goliath's pillars shattering in a rage (it is stuck for less time instead).
- Rot Cellar: water that halves your speed.
- The flashlight flicker when a Shrieker screams.
- The shortcut shaft is told, not walked: Daylight starts with you already out of it.

**Not measured.** Balance of every new fight (nothing here has been played by a person yet), and frame rate with 240
bugs on a real GPU. The sim costs 1.2 ms a tick at 240.

### 2026-11-11, after Nate's third play: the lockbox comes back once, at the very end

Nate: the lockbox should not come down after every mission; the whole hive is meant to be fought with the new guns.
This replaces the lockbox rules written above (it was at every camp from the Warrens on).

- Everything handed over at the rift **stays with Mara for all nine missions that follow**. No camp of a cell has the
  lockbox. It is handed back once: at the camp on the dam wall in Daylight, after the breaker has shut the rift
  (`lockbox: true` on that mission in `hive-data.ts`; `kitAway()` and `lockboxSpots()` in `road.ts`). You take what you
  want, sit down, and the campaign ends with it on you; the rest stays in the box in the save.
- Camps still end with a held key, so you can pick up the crates and spend skill points first.
- **While the kit is away, static supplies are ichor** (Nate asked for this the same evening: the crates were still
  giving .357 and 5.56). Every mission crate and every nook holds ichor and things that heal, never bullets and never a
  city gun. The one exception is the first crate of the Warrens, before you have an insect gun: two boxes for the
  handgun. A kill that drops ammunition (1.5%) still drops it for the handgun: the one in the holster, or the one in
  the pack once an insect sidearm has taken the holster.
- **Older checkpoints.** A save from when the lockbox came to every camp may have a rifle back in your hands. On the
  next mission start `kit.sendBack()` returns city long guns, and ammunition nothing you carry can fire, to the box.
  Bandages, medkits, handguns, blades and everything of the hive are left alone, and nothing is lost.
- Ichor is now the main ammunition for eight missions, and kill drops are still at the reduced rate Nate asked for
  (3% a kill). The crates carry the difference. Not measured in play: if ichor runs dry, raise `ICHOR_DROP` in
  `hive.ts` or the crate amounts in `hive-data.ts`.

Also: **the Vespiary** read as out of ammunition. It needs none. It now breeds in your hand too (1 a second once you
have stopped firing for a second; 2 a second holstered), the counter reads "n / ∞", and the HUD says BREEDING while it
refills.

Also: **the Queen had far too much health.** Nate spent thousands of rounds and had her at half. She had 40,000 times
the mission's 1.5, so 60,000; she now has **24,000 and no multiplier**. The first quarter is the four conduits, so
there are 18,000 to shoot through, and the last 6,000 go at 150%. Two crates of 300 ichor wait at the antechamber
camp where the mission starts. One number each: `hp` of `queen` in `bosses.ts`, `tough.hp` of the mission in
`hive-data.ts`. The other bosses were not changed (7,200 to 13,500 with their cells' multipliers): none of them has
been reported, and they have not been fought with insect guns only yet.
