// types.ts — THE shared state contract for DEAD ZONE (owned by the orchestrator).
// The simulation (src/sim) is pure TypeScript: no Phaser, no DOM (except guarded localStorage in save.ts).
// Renderer (src/render), UI (src/ui) and audio read this state and call sim functions; they never mutate
// sim state directly except through the documented actions. Add fields only via the orchestrator.

export type Vec = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

// ------------------------------------------------------------------ solids (spatial grid)
export type SolidKind =
  | 'wall' | 'window' | 'furniture' | 'car' | 'tree' | 'fence' | 'rock' | 'structure';
export interface Solid extends Rect {
  /** Collision-only proxy drawn by the campaign renderer. */
  campaignArt?: boolean;
  kind: SolidKind;
  solid: boolean;          // blocks movement (default true)
  blocksBullets: boolean;  // default true
  blocksSight: boolean;    // default true; also what casts flashlight shadows
  /** Visual sub-type, e.g. furniture: 'couch' | 'bed' | 'fridge' | 'planter' | 'tower'...; car: 'sedan'|'van'|'police'...; tree: 'oak'|'pine'; wall: 'brick'|'concrete'|'drywall'|'chainlink'|'military' */
  sub?: string;
  /** Building this solid belongs to, if any (walls/windows/furniture). */
  buildingId?: string | null;
  /** Deterministic per-solid visual seed (variant selection, color tint). */
  vseed?: number;
  /** Rotation hint for sprite orientation: 0 = long side horizontal, 1 = long side vertical. */
  orient?: 0 | 1;
  /** Wall the furniture was placed against; its usable face points into the room. */
  wallSide?: 'n' | 's' | 'e' | 'w';
  container?: Container;   // set when this solid IS a lootable container
  structure?: Structure;   // set when this solid belongs to a player-built structure
  /** arcade props a boss can smash through (cars, crates, barriers; never the arena wall) */
  breakable?: boolean;
  _q?: number;             // grid query stamp (internal)
}

// ------------------------------------------------------------------ items & inventory
export type ItemType = 'weapon' | 'ammo' | 'armor' | 'backpack' | 'consumable' | 'material';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export interface Stack { id: string; qty: number; mag?: number; /** gear upgrade level (weapons, armor, backpacks), 1 = base; see inventory.upgradeGear */ lvl?: number }
export interface Inventory { size: number; slots: (Stack | null)[] }
export type EquipKey = 'primary' | 'secondary' | 'melee' | 'head' | 'body' | 'back';
export interface PlayerInventory extends Inventory { equip: Record<EquipKey, Stack | null> }
export type WeaponSlot = 'primary' | 'secondary' | 'melee';
export type WeaponClass = 'handgun' | 'smg' | 'shotgun' | 'rifle' | 'melee' | 'unarmed';

// ------------------------------------------------------------------ world
export type District = 'downtown' | 'suburb' | 'industrial' | 'forest' | 'military';
export type BuildingKind =
  | 'house' | 'store' | 'gas_station' | 'warehouse' | 'office' | 'police'
  | 'hospital' | 'gun_store' | 'military' | 'school' | 'cabin' | string;
export interface Building extends Rect {
  id: string; kind: BuildingKind; name: string; tier: 0 | 1 | 2 | 3;
  doors: Rect[]; rooms: (Rect & { floor?: string })[];
  /** Visual keys chosen by world gen; renderer maps them to textures. */
  floor: string;   // 'wood' | 'tile' | 'carpet' | 'concrete' | 'linoleum' | ...
  roof: string;    // 'shingle_red' | 'shingle_grey' | 'flat_gravel' | 'metal' | ...
  wall: string;    // 'brick' | 'concrete' | 'siding' | 'military' | ...
}
export interface Road extends Rect { dir: 'h' | 'v'; lanes: number; sidewalk: number; kind?: 'avenue' | 'street' | 'dirt' }
/** Non-solid visuals (markings, lots, grass, decals). */
export interface Decor extends Rect { kind: string; sub?: string; vseed?: number; angle?: number }
export interface Poi extends Vec { name: string; kind: string }
export interface Container extends Rect {
  id: string; kind: string; name: string; tier: number;
  buildingId: string | null; searched: boolean; inv: Inventory | null;
  _solid?: Solid;
}
export interface Drop extends Vec {
  id: string; r: number; inv: Inventory; life: number; kind: 'loot' | 'deathbag';
  /** road mode: item id drawn as an icon over the bag, and whether this is a quest item */
  icon?: string; quest?: boolean;
  /** road mode: walk-over pickup is armed once the player has been away from the bag (so dropped items stay dropped) */
  armed?: boolean;
  /** road mode: the mission this bag belongs to; a mission restart removes its own bags, a new mission keeps older ones */
  mission?: number;
}
/** A mission prop the player can use with E (sim/road.ts). */
export interface MissionTarget extends Rect { id: string; name: string }
export interface Structure extends Rect {
  id: string; type: string; hp: number; maxHp: number; rot: 0 | 1;
  inv?: Inventory; dead?: boolean; open?: boolean;
  hitFlash?: number;
  aim?: number;            // turret head angle
  _solid?: Solid;
}

// ------------------------------------------------------------------ actors
export interface Interp { prevX: number; prevY: number; prevAngle: number } // set at the START of every sim tick
export interface Player extends Vec, Interp {
  character?: import('../characters').CharacterId;
  r: number; angle: number; speed: number;
  vx: number; vy: number;                    // actual velocity this tick (px/s) — drives leg animation
  hp: number; maxHp: number; stamina: number; maxStamina: number;
  food: number; water: number; invuln: number; dead: boolean;
  inv: PlayerInventory; active: WeaponSlot;
  fireCooldown: number; reloadTimer: number; reloadTotal: number; swingTimer: number; swingTotal: number;
  /** Quick melee has its own recovery so it can interrupt a gun's fire cooldown. */
  meleeCooldown?: number;
  /** Weapon captured for the current swing; active gun selection stays unchanged. */
  swingWeapon?: string;
  lastShotT: number;                          // state.time of last shot (renderer: recoil pose / muzzle)
  xp: number; level: number; sp: number; tech: Record<string, true>;
  spawn: Vec; sprinting: boolean; flashlight: boolean; bleeding: number;
  burstQueue?: number; combatTimer?: number;
  /** The Hive Below: movement multiplier while standing in honey (sim/hive.ts sets it every tick) */ slowMul?: number;
  /** The Hive Below: reach of the flashlight beam, 1 = full (moth dust shortens it: sim/hive-bugs.ts) */ beamMul?: number;
  /** seconds of royal jelly left: +20% damage dealt */ jelly?: number;
}
export type ZombieType = 'walker' | 'runner' | 'brute' | 'crawler' | 'bloater'
  // The Hive Below (sim/hive.ts): giant dead insects, and two things that only sit there to be destroyed
  | 'drone' | 'honeypot' | 'grub' | 'burrow' | 'egg'
  | 'hopper' | 'shrieker' | 'stinger' | 'spitter' | 'shieldback' | 'lurker' | 'dustwing' | 'skitterer';
export type ZombieState = 'idle' | 'wander' | 'investigate' | 'chase' | 'attackStructure';
export interface Zombie extends Vec, Interp {
  id: string; r: number; type: ZombieType;
  variant: number;                            // visual variant index (0..n-1), deterministic at spawn
  hp: number; maxHp: number; speed: number; damage: number; angle: number;
  vx: number; vy: number;                     // actual velocity this tick (px/s) — drives walk anim speed
  state: ZombieState; target: Vec | null;
  attackCooldown: number;
  attackT: number;                            // seconds since the last attack swing started (renderer plays attack anim while < 0.5)
  /** Visual crossing phase, measured across the sill; does not change movement or combat. */
  windowClimb?: { x: number; y: number; axis: 'x' | 'y'; direction: number; progress: number };
  hitFlash: number; burn: number; dead: boolean; horde?: boolean;
  knockRes?: number;                          // 0..1 fraction of knockback ignored (arcade late waves; zombies.knockMul)
  [k: string]: unknown;                       // AI bookkeeping fields owned by zombies.ts
}
export interface Bullet extends Vec {
  prevX: number; prevY: number;
  vx: number; vy: number; angle: number; damage: number; life: number; r: number;
  pierce: number; ricochet: number; explosive: number; incendiary: boolean; sticky?: boolean; corrode?: boolean;
  hit: Set<string> | null; dead: boolean; color: string; weapon: string;
}

// ------------------------------------------------------------------ events (sim -> render/audio/ui)
// Sim pushes into state.events during a tick; the game shell drains the queue once per rendered frame.
export type SimEvent =
  | { t: 'toast'; msg: string; color?: string }
  | { t: 'banner'; title: string; sub: string; color?: string; ms?: number }   // big centre banner (objective complete, checkpoint)
  | { t: 'sound'; name: string; x?: number; y?: number; vol?: number }
  | { t: 'shot'; x: number; y: number; angle: number; weapon: string; cls: WeaponClass }
  | { t: 'swing'; x: number; y: number; angle: number; weapon: string }
  | { t: 'bulletHit'; x: number; y: number; angle: number; surface: 'flesh' | 'wall' | 'metal' | 'wood'; sticky?: boolean; /** formic acid splash */ acid?: boolean; /** the target bleeds ichor (an insect) */ ichor?: boolean }
  | { t: 'blood'; x: number; y: number; angle: number; amount: number; /** yellow-green: an insect's */ ichor?: boolean }
  /** The Hive Below: honey bursting, a burrow sending a column or caving in, eggs hatching (render + audio cue) */
  | { t: 'hive'; kind: 'honey' | 'erupt' | 'collapse' | 'hatch' | 'rally'; x: number; y: number }
  | { t: 'zombieHurt'; id: string; x: number; y: number; angle: number }
  | { t: 'zombieKilled'; id: string; x: number; y: number; angle: number; type: ZombieType; variant: number; boss?: import('./bosses').BossId; radius?: number; conduit?: boolean }
  | { t: 'zombieAttack'; id: string; x: number; y: number }
  | { t: 'explosion'; x: number; y: number; radius: number }
  | { t: 'playerHurt'; amount: number; angle: number }
  | { t: 'playerDied' }
  | { t: 'levelUp'; level: number }
  | { t: 'itemAdded'; id: string; qty: number }
  | { t: 'techUnlocked'; id: string }
  | { t: 'structureBuilt'; id: string; type: string }
  | { t: 'structureDestroyed'; id: string; type: string; x: number; y: number }
  | { t: 'salvaged'; x: number; y: number; w: number; h: number }
  | { t: 'night' } | { t: 'day'; day: number } | { t: 'horde'; count: number }
  | { t: 'searchDone'; containerId: string }
  | { t: 'saved'; ok: boolean }                    // a survival save was written locally (cloud sync listens)
  | { t: 'openUi'; ui: UiName; target?: unknown }   // sim asks the UI to open something (e.g. loot after a search)
  | { t: 'reloadStart'; weapon: string } | { t: 'reloadDone'; weapon: string } | { t: 'empty' }
  // ---- arcade upgrades (sim/upgrades.ts)
  | { t: 'zap'; points: Vec[]; strike?: boolean; evolved?: boolean }   // chain lightning polyline (strike: bolt from the sky at points[0])
  | { t: 'arcadeLevelUp'; level: number }                              // arcade XP level reached; the card picker opens (state.ui = 'levelup')
  | { t: 'upgradePicked'; kind: UpgradeKind; id: string; level: number }
  // ---- arcade bosses (sim/bosses.ts)
  | { t: 'bossSpawn'; id: string; name: string; x: number; y: number }
  | { t: 'bossDefeated'; id: string; name: string; x: number; y: number }
  | { t: 'propSmashed'; x: number; y: number; kind: string; sub: string };   // a boss broke an arena prop

export type UiName =
  | 'road'                        // Long Road mission cards: briefing / mission complete / ending (sim paused)
  | 'inventory' | 'loot' | 'stash' | 'workbench' | 'tech' | 'craft' | 'map' | 'pause' | 'dead' | 'build'
  | 'levelup'                     // arcade card picker (sim paused until upgrades.choose)
  | 'armory';                     // arcade weapon locker: pick the equipped weapons (sim paused)

// ------------------------------------------------------------------ input (action based; built by the input layer each frame)
export type Action =
  | 'reload' | 'interact' | 'heal' | 'flashlight' | 'build' | 'slot1' | 'slot2' | 'slot3'
  | 'nextWeapon' | 'prevWeapon' | 'rotate' | 'demolish' | 'repair' | 'cycleNext' | 'cyclePrev' | 'cancel';
export interface InputState {
  moveX: number; moveY: number;   // -1..1 (normalized by sim)
  aimX: number; aimY: number;     // aim point in WORLD coordinates
  fire: boolean;                  // primary button held
  firePressed: boolean;           // primary pressed since last tick (latched by shell until consumed by a tick)
  altPressed: boolean;            // right-click: quick melee in combat, cancel in build mode
  sprint: boolean;
  interactHeld: boolean;          // E held (container search)
  pressed: Set<Action>;           // edge-triggered actions since last tick
}

// ------------------------------------------------------------------ game state
export type GameMode = 'survival' | 'arcade' | 'road';
export interface Clock { t: number; day: number }
export interface GameState {
  /** The Long Road linear campaign (sim/road.ts). Runtime; saved separately under its own key. */
  road?: import('./road').RoadState;
  mode: GameMode;
  /** Session presentation choice, applied by the title screen for new/continued Story runs. */
  legacyStory?: boolean;
  screen: 'playing' | 'dead';
  ui: UiName | null;              // open overlay; simulation is paused while non-null except 'build'
  paused: boolean;
  seed: number;
  rngState: number;               // runtime RNG state (sim randomness MUST use state rng, never Math.random)
  tick: number;                   // fixed-step tick counter
  time: number;                   // simulated seconds this session
  clock: Clock;
  grid: import('./core').Grid;
  roads: Road[]; buildings: Building[]; containers: Container[]; decor: Decor[]; pois: Poi[];
  spawnPoint: Vec;
  player: Player;
  zombies: Zombie[]; bullets: Bullet[]; drops: Drop[]; structures: Structure[];
  base: { bed: string | null; hordeDay?: number; /** story bosses killed, by lair building id (sim/city-bosses.ts) */ bossesKilled?: string[] };
  stats: { kills: number; containersLooted: number; deaths: number; daysSurvived: number };
  interact: { kind: 'container' | 'drop' | 'structure' | 'repair' | 'mission'; target: Container | Drop | Structure | MissionTarget; label: string } | null;
  search: { target: Container; t: number; total: number } | null;
  build: { selected: string; rot: 0 | 1; tool?: 'place' | 'repair' | 'demolish'; ghost: (Rect & { ok: boolean }) | null; salvage?: (Rect & { label: string; name?: string; near: boolean; repair?: Record<string, number> | null; hp?: number }) | null } | null; // non-null while in build mode
  shake: number;                  // camera shake intensity requested by sim (renderer decays its own copy)
  events: SimEvent[];
  /** Testing toggles (F9 panel). Transient: never saved. */
  dev?: { timeScale: number; freeze: boolean; god: boolean };
  /** Keys of world solids the player has salvaged (see sim/salvage.ts). Saved. */
  salvaged?: string[];
  /** Fog of war: 1 per explored map cell (sim/explore.ts). Saved as base64. */
  explored?: Uint8Array;
  exploredRev?: number;
  /** story-mode boss attack hazards (arcade keeps its own in arcade.bfx) */
  bossFx?: import('./bosses').BossFx;
  arcade?: { wave: number; score: number; toSpawn: number; spawnTimer: number; intermission: number; best: number; run?: ArcadeRun; /** weapons picked up but not equipped (choose them in the armory) */ armory?: Stack[]; /** boss attack hazards */ bfx?: import('./bosses').BossFx; /** this wave's boss has not spawned yet */ bossDue?: boolean;
    bossKills?: number; reviveNova?: boolean; /** final settlement completed on death/quit */ coresBanked?: boolean; /** cumulative cores deposited during this run, including those already spent */ coresEarned?: number };
  [k: string]: unknown;           // module-private runtime bags (e.g. _zombies, _world); must be non-essential for save
}

// ------------------------------------------------------------------ arcade upgrades (sim/upgrades.ts). Runtime only: arcade is never saved.
export type GadgetId = 'saw' | 'molotov' | 'drone' | 'coil' | 'frag';
export type PassiveId = 'hollow' | 'mag' | 'powder' | 'adren' | 'kevlar' | 'magnet' | 'fuel';
export type UpgradeKind = 'gadget' | 'passive' | 'evolve' | 'gold' | 'heal';
export interface UpgradeCard { kind: UpgradeKind; id: string; level: number }   // level = the level after picking (0 for gold/heal)
export interface XpShard extends Vec { id: number; prevX: number; prevY: number; value: number; pull: boolean; vx: number; vy: number }
export interface GadgetState { id: GadgetId; level: number; evolved: boolean; cd: number; cd2: number; angle: number; prevAngle: number }
export interface Lob extends Vec {                 // molotov bottle / frag grenade / cluster bomblet in flight
  id: number; kind: 'molotov' | 'frag' | 'bomblet'; prevX: number; prevY: number;
  sx: number; sy: number; tx: number; ty: number; t: number; dur: number; h: number;  // h: arc height (render), t/dur: progress
  evolved: boolean; trailD?: number;
}
export interface FirePool extends Vec { id: number; r: number; maxR: number; life: number; maxLife: number; tick: number; dps: number; evolved: boolean }
export interface Drone extends Vec { prevX: number; prevY: number; aim: number; cd: number; phase: number }
export interface ArcadeRun {
  xp: number; level: number; pending: number;      // pending: level-ups still to pick
  offer: UpgradeCard[] | null;                     // cards on screen while state.ui === 'levelup'
  gadgets: GadgetState[]; passives: { id: PassiveId; level: number }[];
  shards: XpShard[]; lobs: Lob[]; pools: FirePool[]; drones: Drone[];
  nextId: number; gold: number;
  /** permanent augment bonuses snapshotted at run start (sim/augments.ts) */ aug?: import('./augments').AugBonus;
  rerolls?: number; revives?: number;
}
