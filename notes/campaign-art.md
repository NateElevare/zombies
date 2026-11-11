# Campaign art list: "A Light in the Valley"

> Legacy update: the current top-down campaign imports authored pixel art from `art/source/campaign-pixel/`, matching the current player sprites. The 45° specifications below remain the separate angled-camera wishlist. See `art/source/campaign-pixel/README.md` for the shipped legacy frame contract and `notes/art-consistency-audit.md` for the audit.

New art the story campaign ([campaign.md](campaign.md)) needs, grouped by type and tagged with the chapter that first needs it. **Ch1 items block the first playable chapter**, so make those first.

## Specs (match the existing story art)

- **Camera:** story mode's 45° tilt, 0° street rotation. Characters and props are upright billboards; floors and roofs are materials.
- **Characters:** 256×256 frames, feet anchored at (128, 224). Five authored directions: **e, se, s, ne, n** (the renderer mirrors them for w/sw/nw). Same proportions and outline treatment as the responder and zombies.
- **Props, structures and cars:** 256×256 frames in `story_props_*` / `story_structures_*` / `story_car_*` atlases. Props have 4 variants or rotations (`_0` to `_3`). Cars have `_0` to `_3` orientations plus `_wreck`.
- **Inventory icons:** 80×80 PNG in `public/assets/story-icons/<item_id>.png`.
- **Materials:** tileable squares in the `story_materials` atlas (walls, windows, doors, roofs, floors, ground).
- **Look:** grounded, gritty, desaturated (see `ART_SPEC.md` for the palette). Haven should get visibly **warmer** as the campaign goes on (lantern light, paint, plants), against the cold city.

**Already exists, so reuse it:** ambulance, police car, humvee, military truck, box truck; beds, cots, medicine cabinet, stove, sandbags, crates, barrels, shelves, workbench, campfire, walls, doors and barricades; hospital, school and police window materials; helipad decal; water and forest-floor ground; all zombies and the five bosses.

---

## 1. Characters (named NPCs)

Every named NPC needs the **full animation set: idle 2, walk 4, run 4, interact/work 4, talk gesture 2, sit 1, sleep 1, hit 2, death 4, corpse 1** in all 5 directions. The final defense also needs a combat pose: aim or shoot 2, or melee 4.

| Character | Look | Extra poses | Ch |
|---|---|---|---|
| **Mara Velez** | 30s paramedic. Faded paramedic jacket with reflective stripes, trauma bag, hair tied back, tired eyes. | Treating a patient (kneeling, 4); carry medical bag. Defense: pistol. | 1 |
| **Eli Mercer** | 40s municipal worker. Hi-vis work vest over a flannel, tool belt, beanie. Injured version: arm sling and bandaged leg, for Ch1. | **Injured, seated against wall (2)**; working with tools (4); limp walk (Ch1 only, 4). Defense: shotgun. | 1 |
| **June Park** | Teen. Oversized hoodie, backpack covered in pins, notebook and pencil. | Writing in the ledger (2); hiding / crouched (2, for the grocery store). Defense: runs ammo (carry box, 4). | 1 |
| **Ruth Calder** | 50s radio tech. Weatherproof coat, headset around her neck, fingerless gloves. | Working at the radio desk (seated, 4). Defense: rifle. | 4 |

**Generic residents** (school survivors, North Ridge group): **6 body variants** (mixed ages and builds, civilian clothes) sharing one rig. Poses: idle, walk, sit, sleep, carry, work, cower. Plus **1 injured survivor** on a stretcher, carried by two people (Ch5/6). Ch2+.

### Dialogue portraits

Head and shoulders, 256×256, same lighting as the sprites, framed for a dialogue box. **Expressions:** neutral, worried, relieved/smiling, angry/firm.

- **Mara:** 4. Ch1.
- **Eli:** 4, plus an injured version. Ch1.
- **June:** 4. Ch1.
- **Ruth:** 4, plus a "radio only" version (blurred, with static overlay). Ch3/4.
- **Generic resident portraits:** 3. Ch2.

---

## 2. Story landmarks (buildings)

Each building needs a **facade/roof treatment**: wall material, window material and door material, plus a roof material where the existing set doesn't fit. Each also needs **signature props** and an **interior layout**, which is placed in code.

| Landmark | District | What it needs | Ch |
|---|---|---|---|
| **Fire station (Haven)** | Suburb | Red brick wall material; **engine-bay roll-up doors** (closed, open, damaged); "BELLWETHER FIRE DEPT. STATION 3" sign; hose tower or roof siren; **broken back door** and repaired versions. Engine bay floor (sealed concrete with painted lines). | 1 |
| **Hardware store** | Suburb | Facade with signage; props: tool aisle shelving, paint cans, lumber rack, chain-link cage, key-cutting counter. | 1 |
| **Grocery store (June's hiding place)** | Suburb | Shuttered roll-down front (closed/forced); props: checkout lane, refrigerated cases, empty produce bins, a knocked-over display; June's hiding nook (blanket, flashlight, cans). | 1 |
| **Hospital emergency wing** | Downtown | Ambulance bay canopy, "EMERGENCY" sign; props: gurney, IV stand, crash cart, triage curtains, portable monitor. | 2 |
| **School (survivor camp)** | Suburb/Downtown | Interior camp: cots in the gym, gym floor material, hand-drawn "WAITING FOR BUS" banner, chalkboard with tallies. | 2 |
| **Municipal maintenance depot** | Industrial | Yard with a big gate (locked/open), "CITY OF BELLWETHER PUBLIC WORKS" sign, salt dome or garage bays, **large generator on a skid** (see §5), fuel tanks. | 3 |
| **Emergency communications building** | Downtown | Concrete bunker-ish facade, **roof antenna mast**, server racks, dispatch consoles, wall-mounted maps with pins, papers everywhere. | 4 |
| **North Ridge relay station** | New region | Small radio station on a ridge: **lattice radio tower**, prefab hut, solar panels, a failing generator, a cot area for the group. | 4 |
| **Reservoir / dam** | New region | Dam wall material, spillway, water edge, railing, maintenance walkway. | 4 |
| **Evacuation checkpoint** | Military | Fallen checkpoint: jersey barriers, gate arm, command tent, floodlight towers (lit/unlit), "EVACUATION ROUTE" signs, abandoned luggage, sandbags (existing). | 5 |
| **Blocked highway** | Edge of the city | Overpass section, pile-up of wrecks (existing cars + **jackknifed semi**), concrete barriers, overhead highway sign. | 5 |
| **Fallback shelter** | On the route | Small shelter (ranger station or chapel): facade + interior with supply cache and bunks. | 5 |

---

## 3. Haven upgrade states (visible progression)

The station must **look** different at each milestone. These are the most important pieces for the emotional arc.

| Piece | States | Ch |
|---|---|---|
| Lantern on a table | unlit / lit (with light-glow sprite) | 1 |
| Engine-bay sleeping area | bedrolls → cots → proper beds with blankets (reuse beds/cots where possible) | 1 |
| Watch post | chair + binoculars by a window → raised lookout platform | 1 |
| **Infirmary** | improvised (table, first-aid box) → treatment room (exam bed, IV stand, curtain, med shelf) → busy (patients in beds) | 2–6 |
| **Rainwater storage** | gutter downspout + barrels → large tank with tap | 2 |
| **Workshop** | workbench (existing) → tool wall, vise, parts bins | 2 |
| **Kitchen** | camp stove → cooking station with pot (steam fx) and a shared table | 3 |
| **Generator** | broken/missing → installed, off → running (animated, 2–4 frames: shake + exhaust) | 3 |
| **Lights** | string lights and floodlights: off / on (with glow) | 3 |
| **HAVEN sign** | hand-painted sign over the entrance (signature moment) | 3 |
| **Radio station** | old emergency radio (dusty) → powered (dials lit) → full relay rig with a roof antenna | 3–6 |
| **Community ledger / map board** | June's corkboard with map, names and notes; grows fuller over the chapters (3 states) | 2–6 |
| **Main gate** | closed / open / **breached** (damaged) | 6 |
| **Inner courtyard gate** | fallback barricade for the final defense | 6 |
| Homey touches | potted plants, drying laundry line, kids' drawings, mismatched chairs | 2–6 |

---

## 4. Vehicles

All need `_0` to `_3` orientations plus a wreck; moving vehicles also need a **headlights-on** variant.

| Vehicle | Notes | Ch |
|---|---|---|
| **Fire engine** | Parked in the bay (dead battery), as set dressing for Haven | 1 |
| **Evacuation bus** | School-yellow or transit; needs **driving frames** (wheels/suspension bob 2) and **damaged** state | 5–6 |
| **Flatbed truck / forklift** | Transport for the depot generator; flatbed with the generator **loaded** | 3 |
| **Jackknifed semi** | Blocked highway centerpiece | 5 |

---

## 5. Props (story objects)

| Prop | Ch |
|---|---|
| Handwritten evacuation notice (taped to a door) | 2 |
| Generator on a skid (large, 2×2 tiles), plus fuel cans | 3 |
| Fuel tank / pump at the depot | 3 |
| Radio equipment: transmitter, antenna parts crate, relay rack | 3–4 |
| Evacuation documents / log binders on desks (collectible look) | 4 |
| Tents (military command tent, civilian dome tents) | 5 |
| Jersey barriers, gate arm, floodlight tower | 5 |
| Supply drop / cache crates with Haven's spray-painted mark | 5 |
| Stretcher | 5 |
| Signal flare (prop + fx) | 6 |

---

## 6. Items and icons (80×80)

| Item | Ch |
|---|---|
| Antibiotics, suture kit (Eli's treatment) | 1 |
| Door hinge set / lock (back-door repair) | 1 |
| Lantern | 1 |
| Medical equipment crate (hospital) | 2 |
| Water-storage parts (pump, hose, tarp) | 2 |
| Handwritten evacuation notice | 2 |
| Fuel canister | 3 |
| Generator parts | 3 |
| Radio transmitter components / relay module | 4 |
| Evacuation logs (Ruth's records) | 4–5 |
| Bus keys, bus battery | 5 |
| Community ledger | 6 |

---

## 7. Environment (new region beyond Bellwether)

Ch4.

| Material / decal | Use |
|---|---|
| Woodland service road (dirt/gravel with ruts) | Route to North Ridge |
| Ridge rock / cliff edge tiles | The ridge |
| Reservoir water with shoreline and dam concrete | Reservoir |
| Pine forest density variants (reuse pine trees) | Woodland |
| Highway asphalt with lane lines + rumble strips | Blocked highway (Ch5) |

---

## 8. UI art

| Piece | Ch |
|---|---|
| Dialogue box frame + nameplate | 1 |
| Objective tracker icons: go-to, retrieve, build, defend, escort | 1 |
| Map markers for story locations (fire station, store, hospital, depot, comms, checkpoint, North Ridge) | 1 |
| **Chapter title cards** (6), each with a painted vignette | 1–6 |
| Community screen (June's ledger): parchment/notebook styling, resident cards | 2 |
| Radio screen: frequency dial, static, contact list | 3 |
| Region map: Bellwether + North Ridge (June's hand-drawn style) | 4 |
| Milestone icons (6): shelter, supplies, power, contact, evacuation, community | 1 |
| Ending card / epilogue illustration (Haven at dawn, bus in the yard) | 6 |

---

## 9. Effects (fx)

| Effect | Ch |
|---|---|
| Lantern / string light / floodlight glow (lighting system light sources) | 1–3 |
| Generator exhaust smoke; sparks on startup | 3 |
| "Lights come on" moment: power surge flicker across Haven | 3 |
| Radio static shimmer on the radio UI / portraits | 3 |
| Bus headlights and dust trail | 6 |
| Flare (red light + smoke) | 6 |

---

## Not art, but needed (audio)

Radio static loop and tuning squelch; Ruth's transmission (voice or text-with-static); generator start, run and stop; bus engine; gate open/close; a warm home ambience bed for Haven (crackling lantern, distant talk); a chapter-complete sting.

---

## Suggested order

1. **Ch1 vertical slice:** Mara, Eli (injured + healthy), June; their portraits; fire station facade, doors and interior; hardware store; grocery store; lantern; sleeping area; dialogue box; objective icons; map markers.
2. **Ch2–3:** generic residents, the hospital wing, the school camp, the depot, the generator, the Haven upgrade states (infirmary, water, workshop, kitchen, lights, HAVEN sign, radio).
3. **Ch4–6:** Ruth, the comms building, the North Ridge region, the checkpoint, the highway, the bus, the convoy fx, the final-defense gates, the ending art.
