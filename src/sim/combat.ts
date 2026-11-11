import type { GameState, InputState, Player, Stack, Bullet, Zombie, Solid, WeaponClass, WeaponSlot } from './types';
import { emit, sound, rand, randRange, phys, WORLD } from './core';
import * as inv from './inventory';
import * as prog from './progression';
import * as zombies from './zombies';
import * as salvage from './salvage';
export interface WeaponDef { name: string; class: WeaponClass; ammo: string | null; damage: number; fireRate: number; magSize: number; reloadTime: number; spread: number; pellets: number; bulletSpeed: number; range: number; auto: boolean; noise: number; shake: number; sound: string; pitch?: number; pierce?: number; melee?: { range: number; arc: number; knock: number };
  /** a reload uses ONE ammo item and fills the whole magazine (Cola & Mints: one mint per blast) */ reloadAll?: boolean;
  /** shots coat zombies in sticky acid foam (zombies.stick: slow + damage over time) */ sticky?: boolean;
  /** built-in perks (normally unlocked through tech): explosion radius, set targets on fire, heal by a share of melee damage */
  explosive?: number; incendiary?: boolean; lifesteal?: number;
  /** The Hive Below: every hit adds a stack of corrosion (zombies.corrode: damage over time, no slow) */ corrode?: boolean;
  /** melee: a kill carries the blow on to this many more bugs standing behind it */ cleave?: number }
export interface WeaponStats extends WeaponDef { id: string; pierce: number; ricochet: number; burst: number; explosive: number; incendiary: boolean; crit: number; critMul: number; lifesteal: number; slug: boolean }
export const WEAPONS: Record<string, WeaponDef> = {
  // ---- The Hive Below: insect weapons. The guns run on ichor.
  "formic_sprayer": { "name": "Formic Sprayer", "class": "smg", "ammo": "ichor", "damage": 7, "fireRate": 0.07, "magSize": 80, "reloadTime": 1.6, "spread": 0.13, "pellets": 1,
    "bulletSpeed": 560, "range": 240, "auto": true, "noise": 240, "shake": 0.5, "sound": "fizz", "pierce": 1, "corrode": true },
  "mandible_shears": { "name": "Mandible Shears", "class": "melee", "ammo": null, "damage": 80, "fireRate": 0.6, "magSize": 0, "reloadTime": 0, "spread": 0, "pellets": 1,
    "bulletSpeed": 0, "range": 0, "auto": true, "noise": 120, "shake": 3, "sound": "swing", "melee": { "range": 84, "arc": 1.2, "knock": 120 }, "cleave": 2 },
  // ---- boss trophies (sim/bosses.ts BOSS_WEAPON)
  "butcher_cleaver": { "name": "Butcher's Cleaver", "class": "melee", "ammo": null, "damage": 95, "fireRate": 0.55, "magSize": 0, "reloadTime": 0, "spread": 0, "pellets": 1,
    "bulletSpeed": 0, "range": 0, "auto": true, "noise": 140, "shake": 3, "sound": "swing", "melee": { "range": 92, "arc": 2.5, "knock": 220 }, "lifesteal": 0.06 },
  "brood_scattergun": { "name": "Brood Scattergun", "class": "shotgun", "ammo": "ammo_12g", "damage": 15, "fireRate": 0.55, "magSize": 8, "reloadTime": 1.5, "spread": 0.19,
    "pellets": 10, "bulletSpeed": 950, "range": 400, "auto": false, "noise": 950, "shake": 8, "sound": "shotgun", "incendiary": true },
  "banshee_smg": { "name": "Banshee", "class": "smg", "ammo": "ammo_9mm", "damage": 17, "fireRate": 0.06, "magSize": 45, "reloadTime": 1.5, "spread": 0.07, "pellets": 1,
    "bulletSpeed": 1250, "range": 600, "auto": true, "noise": 700, "shake": 1.5, "sound": "smg", "pitch": 1.15, "pierce": 1 },
  "rockbreaker": { "name": "Rockbreaker", "class": "rifle", "ammo": "ammo_308", "damage": 165, "fireRate": 1.0, "magSize": 6, "reloadTime": 2.5, "spread": 0.005, "pellets": 1,
    "bulletSpeed": 2100, "range": 1500, "auto": false, "noise": 1150, "shake": 7, "sound": "shotgun", "pitch": 0.7, "pierce": 2, "explosive": 70 },
  "cola_mints": {
    "name": "Cola & Mints",
    "class": "smg",
    "ammo": "mints",
    "damage": 10.5,
    "fireRate": 0.06,
    "magSize": 50,
    "reloadTime": 1.1,
    "spread": 0.2,
    "pellets": 2,
    "bulletSpeed": 470,
    "range": 270,
    "auto": true,
    "noise": 260,
    "shake": 0.6,
    "sound": "fizz",
    "pierce": 1,
    "reloadAll": true,
    "sticky": true
  },
  "pistol": {
    "name": "Pistol",
    "class": "handgun",
    "ammo": "ammo_9mm",
    "damage": 26,
    "fireRate": 0.27,
    "magSize": 12,
    "reloadTime": 1.3,
    "spread": 0.03,
    "pellets": 1,
    "bulletSpeed": 1200,
    "range": 700,
    "auto": false,
    "noise": 650,
    "shake": 2,
    "sound": "pistol"
  },
  "revolver": {
    "name": "Revolver",
    "class": "handgun",
    "ammo": "ammo_357",
    "damage": 72,
    "fireRate": 0.7,
    "magSize": 6,
    "reloadTime": 2.6,
    "spread": 0.015,
    "pellets": 1,
    "bulletSpeed": 1300,
    "range": 800,
    "auto": false,
    "noise": 850,
    "shake": 5,
    "sound": "shotgun",
    "pitch": 1.3
  },
  "smg": {
    "name": "SMG",
    "class": "smg",
    "ammo": "ammo_9mm",
    "damage": 13,
    "fireRate": 0.075,
    "magSize": 30,
    "reloadTime": 1.6,
    "spread": 0.075,
    "pellets": 1,
    "bulletSpeed": 1150,
    "range": 520,
    "auto": true,
    "noise": 700,
    "shake": 1.5,
    "sound": "smg"
  },
  "shotgun": {
    "name": "Shotgun",
    "class": "shotgun",
    "ammo": "ammo_12g",
    "damage": 13,
    "fireRate": 0.65,
    "magSize": 6,
    "reloadTime": 1.7,
    "spread": 0.17,
    "pellets": 8,
    "bulletSpeed": 950,
    "range": 380,
    "auto": false,
    "noise": 950,
    "shake": 8,
    "sound": "shotgun"
  },
  "assault_rifle": {
    "name": "Assault Rifle",
    "class": "rifle",
    "ammo": "ammo_556",
    "damage": 24,
    "fireRate": 0.1,
    "magSize": 30,
    "reloadTime": 2.1,
    "spread": 0.04,
    "pellets": 1,
    "bulletSpeed": 1500,
    "range": 900,
    "auto": true,
    "noise": 1000,
    "shake": 3,
    "sound": "smg"
  },
  "hunting_rifle": {
    "name": "Hunting Rifle",
    "class": "rifle",
    "ammo": "ammo_308",
    "damage": 120,
    "fireRate": 1.1,
    "magSize": 5,
    "reloadTime": 2.7,
    "spread": 0.006,
    "pellets": 1,
    "bulletSpeed": 2000,
    "range": 1400,
    "auto": false,
    "noise": 1150,
    "shake": 6,
    "sound": "shotgun",
    "pitch": 0.8,
    "pierce": 1
  },
  "knife": {
    "name": "Knife",
    "class": "melee",
    "ammo": null,
    "damage": 22,
    "fireRate": 0.32,
    "magSize": 0,
    "reloadTime": 0,
    "spread": 0,
    "pellets": 1,
    "bulletSpeed": 0,
    "range": 0,
    "auto": true,
    "noise": 60,
    "shake": 0.5,
    "sound": "swing",
    "melee": {
      "range": 54,
      "arc": 1,
      "knock": 60
    }
  },
  "bat": {
    "name": "Baseball Bat",
    "class": "melee",
    "ammo": null,
    "damage": 36,
    "fireRate": 0.62,
    "magSize": 0,
    "reloadTime": 0,
    "spread": 0,
    "pellets": 1,
    "bulletSpeed": 0,
    "range": 0,
    "auto": true,
    "noise": 120,
    "shake": 2,
    "sound": "swing",
    "melee": {
      "range": 72,
      "arc": 1.5,
      "knock": 380
    }
  },
  "machete": {
    "name": "Machete",
    "class": "melee",
    "ammo": null,
    "damage": 40,
    "fireRate": 0.5,
    "magSize": 0,
    "reloadTime": 0,
    "spread": 0,
    "pellets": 1,
    "bulletSpeed": 0,
    "range": 0,
    "auto": true,
    "noise": 120,
    "shake": 1.5,
    "sound": "swing",
    "melee": {
      "range": 78,
      "arc": 2.2,
      "knock": 140
    }
  },
  "unarmed": {
    "name": "Fists",
    "class": "unarmed",
    "ammo": null,
    "damage": 8,
    "fireRate": 0.5,
    "magSize": 0,
    "reloadTime": 0,
    "spread": 0,
    "pellets": 1,
    "bulletSpeed": 0,
    "range": 0,
    "auto": true,
    "noise": 40,
    "shake": 0.5,
    "sound": "swing",
    "melee": {
      "range": 42,
      "arc": 1,
      "knock": 100
    }
  }
};

// These fields are transient and intentionally excluded from save data.
type CombatPlayer = Player & { reloadStack?: Stack | null; burstTimer?: number; syncT?: number };
type CombatBullet = Bullet & { crit?: number };
export function weaponClass(id: string): WeaponClass { return WEAPONS[id]?.class || 'unarmed'; }
/** Ammo items that fill one magazine (1 for Cola & Mints, magSize for guns). */
export const ammoPerMag = (id: string) => WEAPONS[id]?.reloadAll ? 1 : WEAPONS[id]?.magSize ?? 0;
  const mods = prog.playerMods;
  const stats = prog.weaponStats;

  const equipped = inv.equippedWeapon;
  const ammoCount = inv.totalAmmo;
  function hurtZombie(state: GameState, z: Zombie, amount: number, angle: number, opts: { source?: string; burn?: boolean; explosion?: boolean; crit?: boolean; melee?: boolean; knock?: number }) {
    // royal jelly: 20% more damage dealt while it lasts
    zombies.damage(state, z, (state.player?.jelly ?? 0) > 0 ? amount * 1.2 : amount, angle, opts);
  }
  function addCombatTimer(state: GameState, t: number) { if (state.player) state.player.combatTimer = Math.max(state.player.combatTimer || 0, t); }

  function noise(state: GameState, x: number, y: number, radius: number) {
    if (zombies && zombies.noise) zombies.noise(state, x, y, radius * (mods(state).noiseMult || 1));
  }

  // ---------- explosions ----------
  function explode(state: GameState, x: number, y: number, radius: number, damage: number, ignore: Zombie | null) {
    emit(state, { t: 'explosion', x, y, radius });
    state.shake = Math.max(state.shake || 0, 6);
    sound(state, 'shotgun');
    for (const z of state.zombies) {
      if (z.dead || z === ignore) continue;
      const d = Math.hypot(z.x - x, z.y - y);
      if (d < radius + z.r) hurtZombie(state, z, damage * (1 - 0.5 * d / (radius + z.r)), Math.atan2(z.y - y, z.x - x), { explosion: true, source: 'player' });
    }
  }

  // ---------- bullets ----------
  const fenceFilter = (o: Solid) => o.kind === 'fence' && !o.structure;
  const bulletFilter = (o: Solid) => o.blocksBullets !== false && (o.solid !== false || o.blocksBullets === true);

  function igniteZombie(z: Zombie) { z.burn = Math.max(z.burn || 0, 3); }

  function onZombieHit(state: GameState, b: CombatBullet, z: Zombie) {
    let dmg = b.damage;
    const crit = (b.crit || 0) > 0 && rand(state) < b.crit!;
    if (crit) {
      dmg *= 2;
    }
    hurtZombie(state, z, dmg, b.angle, { source: 'bullet', crit });
    if (b.incendiary && !z.dead) { igniteZombie(z); }
    if (b.sticky && !z.dead) zombies.stick(state, z);
    if (b.sticky) emit(state, { t: 'bulletHit', x: b.x, y: b.y, angle: b.angle, surface: 'flesh', sticky: true });
    if (b.corrode && !z.dead) zombies.corrode(state, z);
    if (b.corrode) emit(state, { t: 'bulletHit', x: b.x, y: b.y, angle: b.angle, surface: 'flesh', acid: true });
    if (b.explosive > 0) explode(state, b.x, b.y, b.explosive, b.damage * 0.6, z);
  }

  // Advance bullet over [b.x,b.y] -> +dt*velocity. Returns nothing; sets b.dead.
  function stepBullet(state: GameState, b: CombatBullet, dt: number) {
    const travel = Math.min(dt, Math.max(0, b.life));
    const x1 = b.x, y1 = b.y, dx = b.vx * travel, dy = b.vy * travel;
    const x2 = x1 + dx, y2 = y1 + dy;
    const len2 = dx * dx + dy * dy;
    b.life -= dt;
    if (len2 > 0) {
      const wall = phys.raycast(state, x1, y1, x2, y2, 1, bulletFilter);
      const tWall = wall ? wall.t : Infinity;
      // zombie hits (swept circle), closest first
      const hits = [];
      for (let i = 0; i < state.zombies.length; i++) {
        const z = state.zombies[i];
        if (z.dead || (b.hit && b.hit.has(z.id))) continue;
        const ox = x1 - z.x, oy = y1 - z.y, r = z.r + b.r;
        const c = ox * ox + oy * oy - r * r;
        let t = Infinity;
        if (c <= 0) t = 0;
        else {
          const dot = ox * dx + oy * dy, disc = dot * dot - len2 * c;
          if (disc >= 0) t = (-dot - Math.sqrt(disc)) / len2;
        }
        if (t >= 0 && t <= 1 && t <= tWall) hits.push({ t, z });
      }
      hits.sort((a, c) => a.t - c.t);
      // fences don't stop bullets, but each bullet chips the first fence it crosses (4 hits knock it down)
      const fence = phys.raycast(state, x1, y1, x2, y2, 1, fenceFilter);
      if (fence && fence.t <= tWall && (!hits.length || hits[0].t >= fence.t || b.pierce > 0)) {
        const fb = b as CombatBullet & { fences?: Set<Solid> };
        if (!(fb.fences ??= new Set()).has(fence.rect)) {
          fb.fences.add(fence.rect);
          salvage.hitFence(state, fence.rect, x1 + dx * fence.t, y1 + dy * fence.t, b.angle);
        }
      }
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        b.x = x1 + dx * h.t; b.y = y1 + dy * h.t;
        if (!b.hit) b.hit = new Set();
        b.hit.add(h.z.id);
        onZombieHit(state, b, h.z);
        if (b.pierce > 0) { b.pierce--; b.damage *= 0.85; }
        else { b.dead = true; return; }
      }
      if (wall) {
        const o = wall.rect, px = x1 + dx * wall.t, py = y1 + dy * wall.t;
        b.x = px; b.y = py;
        const surface = o.kind === 'car' || o.sub === 'metal_wall' || o.sub === 'turret' ? 'metal' : o.kind === 'tree' || o.kind === 'furniture' || (o.kind === 'structure' && o.sub !== 'metal_wall') ? 'wood' : 'wall';
        emit(state, { t: 'bulletHit', x: px, y: py, angle: b.angle, surface, ...(b.sticky ? { sticky: true } : {}) });
        if (b.explosive > 0) { explode(state, px, py, b.explosive, b.damage * 0.6, null); b.dead = true; return; }
        if (b.ricochet > 0) {
          // pick the slab axis we entered through: nearest rect edge (expanded by bullet radius) to the hit point
          const ex = Math.min(Math.abs(px - (o.x - 1)), Math.abs(px - (o.x + o.w + 1)));
          const ey = Math.min(Math.abs(py - (o.y - 1)), Math.abs(py - (o.y + o.h + 1)));
          if (ex < ey) b.vx = -b.vx; else b.vy = -b.vy;
          b.angle = Math.atan2(b.vy, b.vx);
          b.ricochet--; b.damage *= 0.8;
          b.x -= (b.vx / Math.hypot(b.vx, b.vy)) * -2; b.y -= (b.vy / Math.hypot(b.vx, b.vy)) * -2;
          if (b.hit) b.hit.clear();
          return;
        }
        b.dead = true;
        return;
      }
    }
    b.x = x2; b.y = y2;
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.w || b.y > WORLD.h) b.dead = true;
  }

  // ---------- firing ----------
  function fireShot(state: GameState, ws: WeaponStats, stack: Stack) {
    const p = state.player as CombatPlayer;
    stack.mag = Math.max(0, (stack.mag || 0) - 1);
    const mx = p.x + Math.cos(p.angle) * (p.r + 18), my = p.y + Math.sin(p.angle) * (p.r + 18);
    const speedBase = ws.bulletSpeed;
    const multi = ws.pellets > 1;
    for (let i = 0; i < ws.pellets; i++) {
      const a = p.angle + (multi ? randRange(state, -ws.spread, ws.spread) : (rand(state) + rand(state) - 1) * ws.spread);
      const sp = speedBase * (multi ? randRange(state, 0.88, 1.05) : 1);
      const b: CombatBullet = {
        x: p.x, y: p.y, prevX: p.x, prevY: p.y, weapon: stack.id, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, angle: a, damage: ws.damage,
        life: ws.range / sp, r: 3, pierce: ws.pierce, ricochet: ws.ricochet, explosive: ws.explosive,
        incendiary: ws.incendiary, hit: ws.pierce > 0 || ws.ricochet > 0 ? new Set() : null, dead: false,
        sticky: ws.sticky || undefined, corrode: ws.corrode || undefined,
        crit: ws.crit, color: ws.corrode ? '#b7e04a' : ws.sticky ? '#8a4a22' : ws.incendiary ? '#ff8a1e' : ws.explosive ? '#ff5a3e' : ws.crit > 0.2 ? '#ffe14a' : '#ffe9a8',
      };
      stepBullet(state, b, (p.r + 18) / sp);
      if (!b.dead) { b.prevX = b.x; b.prevY = b.y; state.bullets.push(b); }
    }
    p.lastShotT = state.time;
    // a soda spray has no muzzle flash, smoke or casings: the foam blobs are the effect
    if (!ws.sticky && !ws.corrode) emit(state, { t: 'shot', x: mx, y: my, angle: p.angle, weapon: stack.id, cls: weaponClass(stack.id) });
    state.shake = Math.max(state.shake || 0, ws.shake || 0);
    sound(state, ws.sound);
    noise(state, p.x, p.y, ws.noise);
    addCombatTimer(state, 6);
  }

  function trySwing(state: GameState, ws: WeaponStats & { melee: NonNullable<WeaponStats["melee"]> }) {
    const p = state.player as CombatPlayer;
    p.fireCooldown = ws.fireRate;
    p.swingTimer = Math.min(0.22, ws.fireRate * 0.8);
    p.swingTotal = p.swingTimer;
    emit(state, { t: 'swing', x: p.x, y: p.y, angle: p.angle, weapon: ws.id });
    sound(state, ws.sound);
    state.shake = Math.max(state.shake || 0, ws.shake || 0);
    noise(state, p.x, p.y, ws.noise);
    addCombatTimer(state, 6);
    const reach = ws.melee.range + p.r;
    let hitAny = false;
    const struck = ws.cleave ? new Set<Zombie>() : null, felled: Zombie[] = [];
    for (const z of state.zombies) {
      if (z.dead) continue;
      const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy);
      if (d > reach + z.r) continue;
      let da = Math.atan2(dy, dx) - p.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      // allow for body radius widening the arc at close range
      const slack = d > 1 ? Math.atan2(z.r, d) : Math.PI;
      if (Math.abs(da) > ws.melee.arc / 2 + slack) continue;
      if (phys.raycast(state, p.x, p.y, z.x, z.y, 0, bulletFilter)) continue;
      let dmg = ws.damage;
      const crit = ws.crit > 0 && rand(state) < ws.crit;
      if (crit) dmg *= 2;
      const ang = Math.atan2(dy, dx);
      hurtZombie(state, z, dmg, ang, { source: 'player', melee: true, knock: ws.melee.knock, crit });
      hitAny = true;
      if (struck) { struck.add(z); if (z.dead) felled.push(z); }
      const knock = ws.melee.knock * 0.12 * zombies.knockMul(z);
      if (!z.dead && knock > 0) {
        const nx = z.x + Math.cos(ang) * knock, ny = z.y + Math.sin(ang) * knock;
        if (phys.isFree(state, nx, ny, z.r)) { z.x = nx; z.y = ny; }
      }
      if (ws.lifesteal > 0) p.hp = Math.min(p.maxHp, p.hp + dmg * ws.lifesteal);
    }
    // Mandible Shears: each kill cuts through to the nearest bugs behind it (beyond the normal reach)
    if (struck && ws.cleave) for (const dead of felled) {
      const far = Math.hypot(dead.x - p.x, dead.y - p.y), line = Math.atan2(dead.y - p.y, dead.x - p.x);
      const behind = state.zombies.filter(z => !z.dead && !struck.has(z) && Math.hypot(z.x - dead.x, z.y - dead.y) < 150 + z.r
        && Math.hypot(z.x - p.x, z.y - p.y) > far - 10 && Math.abs(Math.atan2(Math.sin(Math.atan2(z.y - p.y, z.x - p.x) - line), Math.cos(Math.atan2(z.y - p.y, z.x - p.x) - line))) < 0.5)
        .sort((a, b) => Math.hypot(a.x - dead.x, a.y - dead.y) - Math.hypot(b.x - dead.x, b.y - dead.y)).slice(0, ws.cleave);
      for (const z of behind) { struck.add(z); hurtZombie(state, z, ws.damage, Math.atan2(z.y - p.y, z.x - p.x), { source: 'player', melee: true, knock: ws.melee.knock }); }
    }
    // swing at a fence or salvageable world object in the arc (nearest one only)
    let fence: Solid | null = null, fd = Infinity, fx = 0, fy = 0;
    state.grid.each(p.x - reach, p.y - reach, reach * 2, reach * 2, (o) => {
      if (!fenceFilter(o) && (state.arcade || !salvage.canSalvage(o))) return;   // story mode only: arcade props are fixed cover
      const nx = Math.max(o.x, Math.min(p.x, o.x + o.w)), ny = Math.max(o.y, Math.min(p.y, o.y + o.h));
      const d = Math.hypot(nx - p.x, ny - p.y);
      if (d > reach || d >= fd) return;
      let da = Math.atan2(ny - p.y, nx - p.x) - p.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (d > 4 && Math.abs(da) > ws.melee.arc / 2 + 0.25) return;
      fence = o; fd = d; fx = nx; fy = ny;
    });
    if (fence) { const o = fence as Solid; if (o.kind === 'fence') salvage.hitFence(state, o, fx, fy, p.angle); else salvage.hitObject(state, o, fx, fy, p.angle); hitAny = true; }
    if (hitAny) state.shake = Math.max(state.shake || 0, (ws.shake || 0) + 1.5);
  }

  function startReload(state: GameState) {
    const p = state.player as CombatPlayer, stack = equipped(state);
    if (!p || !stack || p.reloadTimer > 0) return false;
    const def = WEAPONS[stack.id];
    if (!def || !def.ammo) return false;
    const ws = stats(state, stack.id, stack.lvl);
    if ((stack.mag || 0) >= ws.magSize) return false;
    if (ammoCount(state, def.ammo) <= 0) return false;
    p.burstQueue = 0;
    p.reloadTimer = p.reloadTotal = ws.reloadTime;
    p.reloadStack = stack;
    sound(state, 'reload');
    emit(state, { t: 'reloadStart', weapon: stack.id });
    return true;
  }
  function finishReload(state: GameState) {
    const p = state.player as CombatPlayer, stack = p.reloadStack;
    p.reloadTimer = 0; p.reloadTotal = 0; p.reloadStack = null;
    if (!stack || stack !== equipped(state)) return;
    const def = WEAPONS[stack.id];
    if (!def || !def.ammo) return;
    const ws = stats(state, stack.id, stack.lvl);
    if (def.reloadAll) {
      if ((stack.mag || 0) < ws.magSize && inv.remove(p.inv, def.ammo, 1)) { stack.mag = ws.magSize; emit(state, { t: 'reloadDone', weapon: stack.id }); }
      return;
    }
    const take = Math.min(ws.magSize - (stack.mag || 0), ammoCount(state, def.ammo));
    if (take > 0 && inv.remove(p.inv, def.ammo, take)) { stack.mag = (stack.mag || 0) + take; emit(state, { t: 'reloadDone', weapon: stack.id }); }
  }

  function tryFire(state: GameState, wantHeld: boolean, wantClick: boolean) {
    const p = state.player as CombatPlayer, stack = equipped(state);
    const id = stack ? stack.id : 'unarmed';
    const def = WEAPONS[id];
    if (!def) return;
    const ws = stats(state, id, stack?.lvl);
    if (p.fireCooldown > 0 || p.reloadTimer > 0 || (p.burstQueue || 0) > 0) return;
    // Hold-to-fire for every weapon (matches arcade); fireRate alone paces semi-auto guns.
    if (!(wantHeld || wantClick)) return;
    if (ws.melee) { trySwing(state, ws as WeaponStats & { melee: NonNullable<WeaponStats["melee"]> }); return; }
    if (!stack) return;
    if ((stack.mag || 0) <= 0) {
      sound(state, 'empty'); emit(state, { t: 'empty' });
      p.fireCooldown = 0.3;
      startReload(state);
      return;
    }
    fireShot(state, ws, stack);
    p.fireCooldown = ws.fireRate;
    if (ws.burst >= 2 && (stack.mag || 0) > 0) { p.burstQueue = ws.burst - 1; p.burstTimer = 0.07; p.fireCooldown = ws.fireRate + 0.07 * (ws.burst - 1); }
    if ((stack.mag || 0) <= 0) startReload(state);
  }

  // ---------- burn ticks ----------
  function tickBurn(state: GameState, dt: number) {
    for (let i = 0; i < state.zombies.length; i++) {
      const z = state.zombies[i];
      if (z.dead || !(z.burn > 0)) continue;
      z.burn -= dt;
      z._burnAcc = Number(z._burnAcc || 0) + dt;
      if (Number(z._burnAcc) >= 0.5) {
        z._burnAcc = Number(z._burnAcc) - 0.5;
        hurtZombie(state, z, 4, 0, { burn: true, source: 'player' });
      }
      if (z.burn <= 0) { z.burn = 0; z._burnAcc = 0; }
    }
  }

  /** Call from player.damage after an accepted hit (replaces the legacy event hook). */
  export function onPlayerHurt(state: GameState) {
    if (state.mode === 'arcade' || !state.player) return;
    addCombatTimer(state, 6);
    const th = mods(state).thorns;
    if (th <= 0) return;
    let best: Zombie | null = null, bd = 90;
    for (const z of state.zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - state.player.x, z.y - state.player.y) - z.r - state.player.r;
      if (d < bd) { bd = d; best = z; }
    }
    if (best) hurtZombie(state, best, th, Math.atan2(best.y - state.player.y, best.x - state.player.x), { source: 'thorns' });
  }

  // ---------- public API ----------
  const combat = {
    reload: startReload,
    switchTo(state: GameState, slot: WeaponSlot) {
      const p = state.player as CombatPlayer;
      if (!p || (slot !== 'primary' && slot !== 'secondary' && slot !== 'melee')) return;
      if (p.active === slot) return;
      p.active = slot;
      p.reloadTimer = 0; p.reloadTotal = 0; p.reloadStack = null; p.burstQueue = 0;
      p.fireCooldown = Math.max(p.fireCooldown || 0, 0.18);
      if (inv && inv.equippedWeapon && !inv.equippedWeapon(state) && slot !== 'melee') { /* empty slot: unarmed */ }
    },
    update(state: GameState, input: InputState, dt: number) {
      const p = state.player as CombatPlayer;
      if (p) inv.bind(state);
      if (!p || p.dead) { combat._bullets(state, dt); tickBurn(state, dt); return; }
      if (prog && prog.sync) { p.syncT = (p.syncT || 0) - dt; if (p.syncT <= 0) { p.syncT = 0.5; prog.sync(state); } }
      if (p.fireCooldown > 0) p.fireCooldown -= dt;
      if (p.swingTimer > 0) p.swingTimer = Math.max(0, p.swingTimer - dt);
      if ((p.combatTimer || 0) > 0) p.combatTimer = (p.combatTimer || 0) - dt;
      const stack = equipped(state);
      // reload progress (cancel if the weapon changed)
      if (p.reloadTimer > 0) {
        if (p.reloadStack !== stack) { p.reloadTimer = 0; p.reloadTotal = 0; p.reloadStack = null; }
        else { p.reloadTimer -= dt; if (p.reloadTimer <= 0) finishReload(state); }
      }
      // burst follow-up shots
      if ((p.burstQueue || 0) > 0) {
        p.burstTimer = (p.burstTimer || 0) - dt;
        if (p.burstTimer <= 0) {
          if (stack && (stack.mag || 0) > 0 && p.reloadTimer <= 0 && WEAPONS[stack.id] && !WEAPONS[stack.id].melee) {
            fireShot(state, stats(state, stack.id, stack.lvl), stack);
            p.burstQueue = (p.burstQueue || 0) - 1; p.burstTimer = 0.07;
            if ((stack.mag || 0) <= 0) { p.burstQueue = 0; startReload(state); }
          } else p.burstQueue = 0;
        }
      }
      if (state.screen === 'playing' && !state.ui) {
        if (input.pressed.has('reload')) startReload(state);
        if (input.fire || input.firePressed) tryFire(state, input.fire, input.firePressed);
      }
      combat._bullets(state, dt);
      tickBurn(state, dt);
    },
    _bullets(state: GameState, dt: number) {
      const bl = state.bullets;
      for (let i = 0; i < bl.length; i++) {
        const b = bl[i];
        if (!b.dead) stepBullet(state, b, dt);
      }
      let write = 0; for (const b of bl) if (!b.dead) bl[write++] = b; bl.length = write;
    },
  };

export const { reload, switchTo, update, _bullets } = combat;
