# DEAD ZONE — Top-down Zombie Survival (v0.1)

Browser game. Plain HTML5 Canvas + vanilla JavaScript. **No build step, no frameworks, no ES modules**
(must run by double-clicking `index.html` from file://). Every script attaches to the global `Z` namespace
defined in `js/core.js`. Scripts are loaded with plain `<script>` tags in the order listed below.

## Gameplay (v0.1 scope — keep it simple)
- Top-down view, world 3000x3000 px, camera follows the player.
- WASD / arrow keys move. Mouse aims. Hold left mouse to fire. R reloads. 1/2/3 switch weapon. Esc / P pauses.
- Weapons: Pistol (infinite reserve), Shotgun (spread, 6 pellets), SMG (fast fire). Start with Pistol only; others from pickups.
- Endless waves. Each wave spawns more/faster zombies. Short break (5s) between waves.
- Zombie types: `walker` (slow, normal), `runner` (fast, fragile, wave 3+), `brute` (slow, tanky, big, wave 5+).
- Pickups dropped by zombies: `health`, `ammo`, `shotgun`, `smg`.
- Obstacles: rectangular walls/crates/cars scattered on the map; block player, zombies, and bullets.
- Score = kills * 10 * wave-ish; show score, wave, kills on game over. Store best score in localStorage (try/catch).
- Screens: title -> playing -> paused -> gameover -> (restart).

## Script load order (index.html)
1. `js/core.js`      (orchestrator) namespace, constants, math utils, state
2. `js/audio.js`     (UI agent)
3. `js/input.js`     (core agent)
4. `js/world.js`     (core agent)
5. `js/particles.js` (core agent)
6. `js/weapons.js`   (core agent)
7. `js/player.js`    (core agent)
8. `js/zombies.js`   (zombie agent)
9. `js/pickups.js`   (zombie agent)
10. `js/waves.js`    (zombie agent)
11. `js/ui.js`       (UI agent)
12. `js/render.js`   (core agent)
13. `js/main.js`     (core agent) — boots the game on `window.load`

## Shared state: `Z.state` (created by `Z.newState()` in core.js)
```
{
  screen: 'title' | 'playing' | 'paused' | 'gameover',
  time: number,              // seconds since run started (only advances while playing)
  player: Player,
  zombies: Zombie[],
  bullets: Bullet[],
  pickups: Pickup[],
  particles: Particle[],
  obstacles: Rect[],         // {x,y,w,h,kind:'wall'|'crate'|'car'}
  camera: {x,y},             // top-left of view in world coords
  wave: { number, remaining, toSpawn, spawnTimer, breakTimer, inBreak },
  stats: { kills, score, shotsFired },
  shake: number,             // screen shake magnitude, decays
}
```

## Entity shapes
- **Player**: `{x,y,r:14,angle,speed:200,hp,maxHp:100,invuln:0, weapons:{pistol:{owned,mag,reserve},shotgun:{...},smg:{...}}, current:'pistol', reloadTimer:0, fireCooldown:0}`
- **Zombie**: `{x,y,r,type,hp,maxHp,speed,damage,attackCooldown,hitFlash,angle,dead:false}`
- **Bullet**: `{x,y,vx,vy,damage,life,r:3,dead:false}`
- **Pickup**: `{x,y,type,life,r:12,dead:false}`
- **Particle**: `{x,y,vx,vy,life,maxLife,color,size}`

## Module APIs (the contract — implement exactly these names)
### core.js (done)
`Z.W, Z.H` canvas size (updated on resize), `Z.WORLD`, `Z.CONFIG`, `Z.util.*`, `Z.newState()`, `Z.state`, `Z.canvas`, `Z.ctx`, `Z.events` (tiny pub/sub: `Z.on(name, fn)`, `Z.emit(name, data)`).

### input.js
`Z.input = { keys:{} (by e.code), mouse:{x,y,worldX,worldY,down}, pressed(code)->bool (true once per press), init(canvas), endFrame() }`

### world.js
`Z.world = { generate(state), collideCircle(entity) /*pushes circle out of obstacles*/, rectHitsCircle(rect,x,y,r)->bool, pointInObstacle(x,y)->bool, lineOfSight(x1,y1,x2,y2)->bool, randomOpenPoint(minDistFromPlayer)->{x,y} }`

### particles.js
`Z.particles = { blood(x,y,count), spark(x,y,count), muzzle(x,y,angle), update(state,dt) }`

### weapons.js
`Z.WEAPONS = { pistol:{name,damage,fireRate,magSize,reloadTime,spread,pellets,bulletSpeed,auto}, shotgun:{...}, smg:{...} }`
`Z.weapons = { tryFire(state), startReload(state), update(state,dt) /* moves bullets, hits obstacles & zombies */ }`
Bullet hits zombie -> call `Z.zombies.damage(state, zombie, dmg, bulletAngle)`.

### player.js
`Z.player = { create()->Player, update(state,dt), damage(state, amount) }`
Player death -> `Z.emit('playerDied')`.

### zombies.js
`Z.zombies = { spawn(state, type, x, y), update(state,dt), damage(state, zombie, amount, angle) }`
On kill: mark dead, add kills/score, maybe drop pickup via `Z.pickups.drop(state,x,y)`, `Z.emit('zombieKilled', zombie)`.
Zombies chase player, separate from each other (simple boids-style push), collide with obstacles via `Z.world.collideCircle`, melee player via `Z.player.damage`.

### pickups.js
`Z.pickups = { drop(state,x,y) /*random chance*/, spawn(state,type,x,y), update(state,dt) /*expire, collect on overlap*/ }` → `Z.emit('pickup', type)`.

### waves.js
`Z.waves = { start(state) /*begin wave 1*/, update(state,dt) }` → `Z.emit('waveStart', n)`, `Z.emit('waveCleared', n)`. Spawns at `Z.world.randomOpenPoint(500)`, staggered.

### audio.js
`Z.audio = { init() /*on first user gesture*/, play(name) }` names: `pistol, shotgun, smg, reload, empty, hit, zombieDie, playerHurt, pickup, waveStart, gameOver, groan`. Synthesized with WebAudio (no files). Must never throw if audio unavailable. Also `Z.audio.muted` toggled with M.

### render.js
`Z.render = { draw(state) }` — draws ground (tiled grid/noise pattern), obstacles, pickups, bullets, zombies, player, particles, with camera + shake. Then calls `Z.ui.drawHUD(state, ctx)` in screen space. Simple shapes, but readable and moody (dark palette, flashlight-ish vignette around player is a nice bonus).

### ui.js
`Z.ui = { init(), drawHUD(state, ctx), showScreen(name), update(state) }` — HUD on canvas (HP bar, ammo `mag / reserve`, weapon name, wave, score, reload indicator, wave banner text, damage vignette). Title / pause / game over are HTML overlays in index.html (`#title`, `#pause`, `#gameover`) with buttons that call `Z.game.start()` / `Z.game.resume()`.

### main.js
`Z.game = { start(), pause(), resume(), gameOver() }`; requestAnimationFrame loop with dt clamped to 0.05; updates modules in order: input → player → weapons → zombies → pickups → waves → particles → camera → render → input.endFrame(). Handles resize.

## Style
- Readable, commented, no dependencies. Defensive: if a module function is missing, don't crash (`Z.x && Z.x.fn && ...` at call sites in main.js only).
- Colors: dark asphalt ground `#1b1d1a`, player `#5ab0ff`, walker `#6b8f4e`, runner `#a3b545`, brute `#4e6b3a`, blood `#7a0f0f`.
