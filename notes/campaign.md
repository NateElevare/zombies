# DEAD ZONE: A Light in the Valley (story campaign)

The story mode campaign. It starts with *"I need somewhere safe"* and gradually becomes *"people are counting on this place."* The signal arrives only once the player has built something worth protecting, so following it means leaving a home they actually care about.

**Emotional arc:** at first you return to the station because your supplies are there. By the end, you return because your people are there.

Art needed for all of this is listed in [campaign-art.md](campaign-art.md).

---

## Setting

**Bellwether**, a small city cut off during the outbreak, is the existing story map (16000×16000: suburb, downtown, industrial, forest and the military base). The evacuation has already failed. There's no opening mission to save humanity. There's a cold night approaching, dwindling supplies, and an abandoned **fire station** with doors that still lock.

The story follows that station becoming a community (**Haven**), then becoming part of something larger.

## Cast

Keep the cast small so players get to know them through repeated interactions at home.

| Character | Who they are | Role at Haven (gameplay) | Stance |
|---|---|---|---|
| **Mara Velez** | Former paramedic. Practical, exhausted, determined never to leave another person behind. | Medical lead. Runs the infirmary, which heals the player, cures bleeding and crafts medical items. | Takes people in. |
| **Eli Mercer** | Municipal maintenance worker. Knows Bellwether's utilities and back roads. | Engineer. Runs the workshop: repairs, the generator, the radio, and route knowledge (map reveals). | Protects what you have; worries that too many people will break Haven. |
| **June Park** | Teenage survivor. | Keeps the supply ledger and draws the community map. She is the community/stash screen and the map. Her contributions turn the bunker into a home. | Optimist; the heart of the place. |
| **Ruth Calder** | Radio technician. Introduced later, through the signal. | Radio contacts: optional requests, intel and trades with other settlements. | Has spent months reconnecting scattered survivors. |

Mara and Eli both have good reasons for their positions. Their disagreements give decisions weight without needing a villain inside your own community.

## Progression: community milestones (not a settlement XP bar)

Each milestone opens a new part of the map and visibly changes daily life at home.

| # | Milestone | Unlocked by | Opens / changes |
|---|---|---|---|
| 1 | **Secure shelter** | Chapter 1 | Fire station becomes Haven, the persistent home; respawn point; residents appear there |
| 2 | **Dependable supplies** | Chapter 2 | Infirmary, rainwater storage, workshop; residents get jobs and routines; base produces supplies |
| 3 | **Power** | Chapter 3 | Lights, cooking, infirmary fully open, radio receives |
| 4 | **Outside contact** | Chapter 4 | Radio transmits; world map expands beyond Bellwether (North Ridge) |
| 5 | **Evacuation capacity** | Chapter 5 | Accommodation, bus, cleared route, fallback shelter |
| 6 | **A connected community** | Chapter 6 | Ending; free play with expeditions and new radio contacts |

---

## Chapter 1: "A Door That Locks" (suburbs)

**Story.** You find Mara treating an injured Eli inside the fire station. They've been there two nights, surviving on supplies from the ambulance. The building has potential, but the back entrance is broken and the water is running out.

**Objectives**
1. Clear the fire station (indoor pack, as in every building).
2. Secure its entrances: repair the broken back door, barricade the windows. This uses the existing build system.
3. Find medicine for Eli (painkillers/medkit from a nearby house or pharmacy).
4. Establish somewhere to sleep (place a bed; this is the existing bed/respawn system).
5. **First expedition: the hardware store.** Two routes:
   - **The direct road** through a crowded intersection: fast but dangerous.
   - **Through houses and backyards**: slower and quieter (fences can be broken; see salvage.ts).
6. On the way: find **June** hiding in a closed grocery store and bring her back.

**Chapter end.** The first night everyone sleeps under the same roof. It's a modest victory: a lantern on a table, beds in the engine bay, someone taking watch so someone else can rest.

**What changes:** the station becomes your persistent home. The people you helped appear there, and the things you build have visible uses.

## Chapter 2: "Enough for Tomorrow" (commercial district and hospital)

**Story.** The station is secure, but surviving one supply run at a time isn't sustainable. Mara needs a proper treatment room. Eli wants rainwater storage and a workshop. June has found a **handwritten evacuation notice** mentioning survivors at a school.

**Community projects** can be tackled in any order. Each leads to a distinct expedition:

| Project | Asked by | Expedition |
|---|---|---|
| Treatment room | Mara | Recover medical equipment from the **hospital's emergency wing** |
| Rainwater storage + workshop | Eli | Bring back tools and water-storage equipment from the **commercial district** |
| The school survivors | June | Investigate the **school** and help its remaining survivors relocate to Haven |

At the school you learn why people distrust evacuation promises: they waited for buses that never arrived.

**Major event.** A **power failure** at the station during a medical emergency. You get through it with improvised supplies (light sources, scavenged painkillers, holding the dark station against a probe of zombies). It establishes the next goal naturally: this place needs reliable power.

**What changes:** residents gain names, jobs and routines. The base starts producing support (prepared supplies, repairs, treatment), so helping the community also makes your expeditions better.

## Chapter 3: "The Lights Come On" (industrial district)

**Story.** Eli identifies a **municipal maintenance depot** with a generator big enough to power the station's essential systems.

**Objectives**
1. Locate **transport equipment** (a flatbed truck or forklift).
2. **Clear access** to the depot (blocked gate, debris, the depot's pack).
3. **Secure fuel** (gas station / fuel depot).
4. **The loading operation**: noisy and drawing a horde. Your earlier preparations (cleared access, barricades, fuel found first) determine how hard the defense is.

**Back home: the lights come on.** Give that moment room to breathe. Mara opens the infirmary. Someone cooks a proper meal. June hangs a painted sign over the entrance: **HAVEN**.

Only now does Eli power up the station's old emergency radio. Through the static:

> "Bellwether relay, this is Calder at North Ridge. If anyone is receiving, please answer. We still have people up here."

The transmission repeats, but the next night its final sentence changes. It's a live person.

**This is the campaign's turning point.** You've achieved basic security. Now you have a reason to look beyond it.

## Chapter 4: "Someone Out There" (downtown and the forest ridge)

**Story.** You can receive Ruth's messages, but your transmitter can't reach her. Eli believes **downtown's emergency communications building** has the equipment needed to make contact.

That expedition also turns up fragments of the failed evacuation: contradictory orders, abandoned routes, and messages from shelters that never got an answer. There doesn't need to be a secret laboratory behind everything. Ordinary systems failed, and people paid for it. *(Collectible documents / logs.)*

Once you repair the connection, Ruth answers directly. She's keeping a **relay station above a reservoir** running, sheltering survivors who reached it after their evacuation convoy broke down. They have shelter but little food, and their generator is failing. Ruth has also heard other settlements. She knows Haven isn't alone.

**Expedition.** Cross the woodland service roads (the forest district) to reach her. At the relay station you finally meet the voice: a tired person keeping a radio alive with scavenged parts.

**What changes:** the world map expands beyond Bellwether. Radio conversations become relationships, with useful information and optional requests between major missions.

## Chapter 5: "Room at the Table" (the reservoir and the military checkpoint)

**Story.** Ruth's group can't stay at North Ridge. Haven could take them in, but it isn't ready.

This is the campaign's central commitment: prepare your community to bring another one home. Mara immediately supports it. Eli points out the real limits: beds, water, medicine, and the danger of moving a convoy through town. **The player chooses how to solve those problems**, rather than simply clicking "be generous" or "be selfish."

**Preparations**
- Expand Haven's accommodation and supplies (beds, water, food stock).
- Recover a working **bus** from the abandoned **evacuation checkpoint** (military district).
- Open a route around a **blocked highway**.
- Establish a **fallback shelter** along the journey.

**Optional missions directly affect the operation**

| Optional mission | Effect in Chapter 6 |
|---|---|
| Recover medical supplies | An injured survivor can travel safely |
| Clear a maintenance road | The convoy gets a quieter approach (smaller pursuit) |
| Help a distant settlement (radio request) | Extra supplies or assistance |

**Revelation.** Through Ruth's records you discover that Bellwether's evacuation drivers *did* come back, but were redirected to a checkpoint that had already fallen. At least some of the people everyone thought had abandoned them died trying to help. This reinforces the story's central idea: **promises matter when someone follows through.**

## Chapter 6: "Bring Them Home" (the return route and Haven)

The finale begins when the player chooses to launch the evacuation. There's time to prepare beforehand.

**The journey** is a series of encounters with clear purposes, not one long escort mission:
1. Help Ruth shut down North Ridge and load the bus.
2. Move the group along the route you secured.
3. **Bottleneck:** the convoy's noise draws infected out of the surrounding streets. Open a gate, hold a crossing, reach the fallback shelter.
4. The convoy reaches Haven near dusk, with a horde following.

**The final defense** happens in the place you've spent the campaign building. Your walls, sightlines, supplies and community projects all matter. Residents contribute according to their roles (Mara triages, Eli repairs, June runs ammo). Give the player chances to **retreat to an inner courtyard** or **recover from a breached gate**, so imperfect preparation produces a dramatic battle rather than an automatic failure.

At dawn, the last survivors come inside. Ruth closes the gate behind them. *You kept the promise.*

## Ending

Several days later, Haven is visibly fuller. The infirmary has patients recovering in beds. The bus sits in the yard. June has added North Ridge's names to the community ledger.

Ruth installs the recovered relay equipment at the station. This time, your community sends the message:

> "This is Haven, Bellwether. We have shelter. We're listening."

The campaign ends with a real accomplishment: you built a home, reached another community, and brought its people back alive. **Free play continues** afterwards with expeditions and new radio contacts.

---

## How it fits what the game already has

| Existing system | Campaign use |
|---|---|
| Base building (walls, doors, barricades, beds, workbench, stash, turrets) | Haven itself; securing entrances; final defense |
| Bed = respawn point | Haven is home from Chapter 1 |
| Indoor packs per building (zombies.ts) | Clearing the station, store, school, depot |
| Horde nights | The loading operation (Ch3), the convoy pursuit and the final defense (Ch6) |
| City boss lairs (city-bosses.ts) | Boss set pieces: pin specific bosses to story locations (e.g. the hospital emergency wing, the depot, the checkpoint) instead of the random lair pick |
| Salvage / breaking fences | The backyard route (Ch1), clearing access (Ch3) |
| Tech tree + skill points | Unchanged; community projects are a separate progression |
| Day/night clock | Radio messages arrive at night; convoy arrives at dusk |
| Districts: suburb, downtown, industrial, forest, military | Ch1 suburb, Ch2 downtown/commercial + hospital, Ch3 industrial, Ch4 downtown + forest, Ch5 military |

## New systems needed (engineering)

1. **Story/objective system**: chapter state, an objective list with markers on the map/minimap/HUD, triggers (enter area, pick up item, build X, survive until dawn), and saved progress.
2. **NPCs**: friendly survivors with home positions and daily routines at Haven; follow/escort behavior for rescues; simple defense roles in the finale.
3. **Dialogue**: short conversations with portraits and occasional choices (Mara vs Eli trade-offs).
4. **Story locations**: hand-placed landmark buildings in the procedural city (fire station, hardware store, grocery, depot, comms building, checkpoint, highway block) at fixed spots per seed.
5. **Community projects**: build/deliver-to-complete upgrades at Haven that change its look and give passive benefits (healing, crafting, supplies, power).
6. **Power**: a generator that powers lights, the infirmary and the radio; fuel upkeep.
7. **Radio**: night-time transmissions, a contact list, optional requests.
8. **Region map**: a second area (North Ridge relay + reservoir + service roads) beyond Bellwether, plus travel between them.
9. **Convoy**: a bus that drives a secured route, with stop-and-hold encounters.
10. **Inner courtyard / breach recovery** for the final defense.
