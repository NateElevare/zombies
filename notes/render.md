# RENDER notes (src/render)

## Architecture
| File | Role |
|---|---|
| `index.ts` | `createRenderer(scene)`. It owns the camera: exponential follow of the interpolated player, mouse look-ahead, shake, zoom (~720 world px of vertical view), and whole-pixel scroll. It orders the passes and exposes `window.__render` (stats, `slowLog`) for probes. |
| `art.ts` | Builds the frame→atlas map from manifest atlases and frame lists from anims.json. Provides `tiles()`, `prop()` and `sprite()` lookups, plus procedural textures: the soft light, flashlight cone, blob shadow, fallback disc, canopy, spark, puff and splat. A missing frame falls back to a vector or procedural texture and never throws. |
| `ground.ts` | 1024-world-px chunk DynamicTextures, with 20 render targets pre-allocated at boot. Painting is split into generator steps, about 1.2 ms of work per frame. Visible chunks jump the queue and the nearest ring chunk is prefetched; least-recently-used chunks are evicted. Layers in order: district terrain, lots (via tileAliases), sidewalks, roads (tile variants per 256-px block), floors per room, vector paint (curbs, lane and edge lines, stop bars, crosswalks, lot lines, low-frequency blotches), decor decals, door frames, then every static solid baked in. Walls and fences are tiled strips; windows and door frames are nine-slices. Props honour fit/pad/orient/back; wall furniture faces away from the nearest room edge. |
| `worldobjs.ts` | Tree canopies, using the closest size from `sizes.diameters`. Roofs fade for the building you are in and are drawn *above* the lightmap, tinted by ambient light, so the flashlight never lights roof tops. Also: container marks (subtle pulse when unsearched, darkened when searched), structures (damaged/open variants, turret head on its pivot, hp bars), drops, the interact outline, the build ghost and the crosshair. |
| `actors.ts` | Player layers: shadow → legs (move direction, stride frames driven by speed, backwards walking reverses the cycle) → weapon (origin = grip, placed with `handsPerFrame`) → torso (pose by weapon class; reload, swing and punch frames chosen by timer progress; shoot frames while time − lastShotT < 0.1) → body armor and backpack (rotated by torsoYaw) → helmet. Also hurt tint, invulnerability blink and recoil kick. Zombies: a per-id pooled sprite whose walk phase advances at walkFrameRate × \|v\|/speed; attack frames by attackT; hit frames with a FILL flash on `zombieHurt`; idle bloaters play `pulse`; burning zombies get fx_fire plus a light. Tracers are additive. |
| `fx.ts` | Particle pools in 3 layers: floor (casings), lit (blood, smoke, dust) and glow (ADD: muzzle, sparks, explosion). Blood/scorch decal ring (cap 220) and corpse ring (cap 150); the oldest fade out before they are reused. Death anim, then a corpse decal. Timed point lights for muzzle flashes, metal hits and explosions. Shake impulses. |
| `lighting.ts` | The lightmap (below). |

## Lighting technique
- **Half-resolution lightmap.**
  - It is composited over the scene with a custom **2× multiply** blend (`DST_COLOR, SRC_COLOR`): result = 2·scene·light.
  - The lightmap stores light/2, so 0.5 leaves the scene unchanged and a hot spot can over-expose up to 2×. That is what makes the cone's core read as a real flashlight.
  - Phaser 4.2.1's `renderer.addBlendMode()` returns `index-1` (a bug). We take `blendModes.length-1` and call `updateBlendMode` with all four funcs.
- **Flashlight**, drawn into its own texture:
  - The cone texture is generated once. It has a hot core (gaussian across the axis), a wide penumbra out to about 0.55 rad, a (1−d²)² falloff to 650 world px, a soft start at the lens, a warm-white tint (0xfff0d8) and random battery flicker.
  - Then **shadow volumes**: every back-facing edge of each `blocksSight` rect (except windows) inside the cone's bounding box is extruded away from the lens and filled black. This is equivalent to clipping by the visibility polygon, but exact and cheap (about 30–60 quads).
  - Beam strength scales with darkness: barely visible outdoors by day, full indoors, at dusk and at night.
- **Lightmap composition:**
  1. Fill with the outdoor ambient (day: neutral; night: deep blue-black).
  2. Building interiors in view are filled with a dimmer indoor ambient. Interiors are always dim, even by day, while outdoors stays bright.
  3. ADD the occluded flashlight.
  4. ADD point lights: the player's personal light, campfires (two-layer flicker), burning zombies, muzzle flashes, explosions and metal sparks.
- **Penumbra:**
  - A blur filter cannot be put on the composite itself: Phaser filters drop the custom blend when compositing to the screen.
  - Instead the raw lightmap is copied through a blurred Image into a second DynamicTexture.
  - A 10 px margin keeps the blur from darkening the screen edges.

## Perf
Probe `walk` (`tools/out/render/walk-perf.json`), Intel Iris Xe (ANGLE D3D11), headless Edge:
- render p50 0.8 ms, p99 2.6 ms;
- work p95 2.7 ms, max 6.7 ms;
- 8 "busy" frames, all in the first second after New Game (first atlas use / initial chunks).

## Requests to other agents
- **SIM / orchestrator: `state.shake` is never decayed by the sim.** combat.ts sets `state.shake = max(state.shake, ws.shake)`, so after the first shotgun blast it stays at 8 forever. The renderer therefore only reacts to *increases* plus its own event-driven impulses, so small-weapon shake is lost after a big one. Please decay it in `step` (e.g. `state.shake = max(0, state.shake - 30*dt)`), or reset it to 0 after the shell drains events.
- **SIM (world.ts):**
  - Gas-station `canopy` decor is still ground-level. If you want it overhead (env art has a `decor:canopy` nine-slice), say so and I'll draw it like a roof.
  - Furniture has no "against which wall" field. The renderer infers it from the nearest room edge, so an explicit `side`/`back` on wall furniture would be more reliable.
- **CHARACTERS art:** the legs stride is short relative to the torso footprint, so the feet barely show past the jacket while walking (the renderer draws legs at 1.18× to help). A longer stride (feet ~14 world px ahead/behind) would make walking read much better at gameplay zoom.
- **ENV art:** the `gravel` tile has very bright high-contrast speckles that look like salt at zoom 1.25. The `asphalt` variants have a repeated squiggle crack that is noticeable along long roads.
- **UI:** the renderer draws the crosshair in-world, above the lighting. Hide the system cursor over the canvas (`cursor:none`) and don't draw a second crosshair.
