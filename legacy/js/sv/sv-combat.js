// sv-combat.js — weapon definitions, firing, reloading, melee, bullet simulation. Owned by COMBAT agent.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const SV = (Z.sv = Z.sv || {});
  const U = Z.util;

  // spread = half-angle (rad). range in px (bullet life = range / bulletSpeed). noise = px radius.
  SV.WEAPONS = {
    pistol:        { name: 'Pistol', class: 'handgun', ammo: 'ammo_9mm', damage: 26, fireRate: 0.27, magSize: 12, reloadTime: 1.3, spread: 0.03, pellets: 1, bulletSpeed: 1200, range: 700, auto: false, noise: 650, shake: 2, sound: 'pistol' },
    revolver:      { name: 'Revolver', class: 'handgun', ammo: 'ammo_357', damage: 72, fireRate: 0.7, magSize: 6, reloadTime: 2.6, spread: 0.015, pellets: 1, bulletSpeed: 1300, range: 800, auto: false, noise: 850, shake: 5, sound: 'shotgun', pitch: 1.3 },
    smg:           { name: 'SMG', class: 'smg', ammo: 'ammo_9mm', damage: 13, fireRate: 0.075, magSize: 30, reloadTime: 1.6, spread: 0.075, pellets: 1, bulletSpeed: 1150, range: 520, auto: true, noise: 700, shake: 1.5, sound: 'smg' },
    shotgun:       { name: 'Shotgun', class: 'shotgun', ammo: 'ammo_12g', damage: 13, fireRate: 0.9, magSize: 6, reloadTime: 2.3, spread: 0.17, pellets: 8, bulletSpeed: 950, range: 380, auto: false, noise: 950, shake: 8, sound: 'shotgun' },
    assault_rifle: { name: 'Assault Rifle', class: 'rifle', ammo: 'ammo_556', damage: 24, fireRate: 0.1, magSize: 30, reloadTime: 2.1, spread: 0.04, pellets: 1, bulletSpeed: 1500, range: 900, auto: true, noise: 1000, shake: 3, sound: 'smg' },
    hunting_rifle: { name: 'Hunting Rifle', class: 'rifle', ammo: 'ammo_308', damage: 120, fireRate: 1.1, magSize: 5, reloadTime: 2.7, spread: 0.006, pellets: 1, bulletSpeed: 2000, range: 1400, auto: false, noise: 1150, shake: 6, sound: 'shotgun', pitch: 0.8, pierce: 1 },
    knife:         { name: 'Knife', class: 'melee', ammo: null, damage: 22, fireRate: 0.32, magSize: 0, reloadTime: 0, spread: 0, pellets: 1, bulletSpeed: 0, range: 0, auto: true, noise: 60, shake: 0.5, sound: 'swing', melee: { range: 54, arc: 1.0, knock: 60 } },
    bat:           { name: 'Baseball Bat', class: 'melee', ammo: null, damage: 36, fireRate: 0.62, magSize: 0, reloadTime: 0, spread: 0, pellets: 1, bulletSpeed: 0, range: 0, auto: true, noise: 120, shake: 2, sound: 'swing', melee: { range: 72, arc: 1.5, knock: 380 } },
    machete:       { name: 'Machete', class: 'melee', ammo: null, damage: 40, fireRate: 0.5, magSize: 0, reloadTime: 0, spread: 0, pellets: 1, bulletSpeed: 0, range: 0, auto: true, noise: 120, shake: 1.5, sound: 'swing', melee: { range: 78, arc: 2.2, knock: 140 } },
    unarmed:       { name: 'Fists', class: 'unarmed', ammo: null, damage: 8, fireRate: 0.5, magSize: 0, reloadTime: 0, spread: 0, pellets: 1, bulletSpeed: 0, range: 0, auto: true, noise: 40, shake: 0.5, sound: 'swing', melee: { range: 42, arc: 1.0, knock: 100 } },
  };

  function audio(n) { if (Z.audio && Z.audio.play) Z.audio.play(n); }
  function prog() { return SV.prog; }
  function mods(state) { return SV.prog && SV.prog.playerMods ? SV.prog.playerMods(state) : { noiseMult: 1 }; }
  function stats(state, id) { return SV.prog.weaponStats(state, id); }

  function equipped(state) {
    const p = state.player;
    if (SV.inv && SV.inv.equippedWeapon) return SV.inv.equippedWeapon(state);
    return p && p.inv && p.inv.equip ? p.inv.equip[p.active] || null : null;
  }
  function ammoCount(state, ammoId) {
    const p = state.player;
    if (SV.inv && SV.inv.count) return SV.inv.count(p.inv, ammoId);
    return 0;
  }
  function addParticle(state, x, y, vx, vy, life, color, size) {
    const list = state.particles;
    if (list.length >= 700) return;
    list.push({ x, y, vx, vy, life, maxLife: life, color, size });
  }
  function burstParticles(state, x, y, n, colors, smin, smax, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = U.rand(smin, smax);
      addParticle(state, x, y, Math.cos(a) * s, Math.sin(a) * s, U.rand(life * 0.5, life), colors[i % colors.length], U.rand(2, 4.5));
    }
  }
  function spark(state, x, y, n) { if (Z.particles && Z.particles.spark) Z.particles.spark(x, y, n); }

  function hurtZombie(state, z, dmg, angle, opts) {
    if (SV.zombies && SV.zombies.damage) SV.zombies.damage(state, z, dmg, angle, opts);
    else { z.hp -= dmg; if (z.hp <= 0) z.dead = true; }
  }

  function addCombatTimer(state, t) { if (state.player) state.player.combatTimer = Math.max(state.player.combatTimer || 0, t); }

  function noise(state, x, y, radius) {
    if (SV.zombies && SV.zombies.noise) SV.zombies.noise(state, x, y, radius * (mods(state).noiseMult || 1));
  }

  // ---------- explosions ----------
  function explode(state, x, y, radius, damage, ignore) {
    spark(state, x, y, 14);
    burstParticles(state, x, y, 18, ['#ff9a2e', '#ffd36b', '#ff5a1e', '#5a5a5a'], 80, 320, 0.5);
    state.shake = Math.max(state.shake || 0, 6);
    audio('shotgun');
    for (const z of state.zombies) {
      if (z.dead || z === ignore) continue;
      const d = Math.hypot(z.x - x, z.y - y);
      if (d < radius + z.r) hurtZombie(state, z, damage * (1 - 0.5 * d / (radius + z.r)), Math.atan2(z.y - y, z.x - x), { explosion: true, source: 'player' });
    }
  }

  // ---------- bullets ----------
  const bulletFilter = (o) => o.blocksBullets !== false && (o.solid !== false || o.blocksBullets === true);

  function igniteZombie(z) { z.burn = Math.max(z.burn || 0, 3); }

  function onZombieHit(state, b, z) {
    let dmg = b.damage;
    const crit = b.crit > 0 && Math.random() < b.crit;
    if (crit) {
      dmg *= 2;
      spark(state, z.x, z.y, 6);
      burstParticles(state, z.x, z.y, 8, ['#ffe14a', '#ffffff'], 120, 340, 0.3);
    }
    hurtZombie(state, z, dmg, b.angle, { source: 'player', crit });
    if (b.incendiary && !z.dead) { igniteZombie(z); burstParticles(state, z.x, z.y, 3, ['#ff8a1e', '#ffc23a'], 40, 120, 0.4); }
    if (b.explosive > 0) explode(state, b.x, b.y, b.explosive, b.damage * 0.6, z);
  }

  // Advance bullet over [b.x,b.y] -> +dt*velocity. Returns nothing; sets b.dead.
  function stepBullet(state, b, dt) {
    const travel = Math.min(dt, Math.max(0, b.life));
    const x1 = b.x, y1 = b.y, dx = b.vx * travel, dy = b.vy * travel;
    const x2 = x1 + dx, y2 = y1 + dy;
    const len2 = dx * dx + dy * dy;
    b.life -= dt;
    if (len2 > 0) {
      const wall = SV.phys.raycast(state, x1, y1, x2, y2, 1, bulletFilter);
      const tWall = wall ? wall.t : Infinity;
      // zombie hits (swept circle), closest first
      const hits = [];
      for (let i = 0; i < state.zombies.length; i++) {
        const z = state.zombies[i];
        if (z.dead || (b.hit && b.hit.has(z))) continue;
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
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        b.x = x1 + dx * h.t; b.y = y1 + dy * h.t;
        if (!b.hit) b.hit = new Set();
        b.hit.add(h.z);
        onZombieHit(state, b, h.z);
        if (b.pierce > 0) { b.pierce--; b.damage *= 0.85; }
        else { b.dead = true; return; }
      }
      if (wall) {
        const o = wall.rect, px = x1 + dx * wall.t, py = y1 + dy * wall.t;
        b.x = px; b.y = py;
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
          spark(state, px, py, 5);
          return;
        }
        b.dead = true;
        spark(state, px, py, 4);
        return;
      }
    }
    b.x = x2; b.y = y2;
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > SV.WORLD.w || b.y > SV.WORLD.h) b.dead = true;
  }

  // ---------- firing ----------
  function fireShot(state, ws, stack) {
    const p = state.player;
    stack.mag = Math.max(0, (stack.mag || 0) - 1);
    const mx = p.x + Math.cos(p.angle) * (p.r + 18), my = p.y + Math.sin(p.angle) * (p.r + 18);
    const speedBase = ws.bulletSpeed;
    const multi = ws.pellets > 1;
    for (let i = 0; i < ws.pellets; i++) {
      const a = p.angle + (multi ? U.rand(-ws.spread, ws.spread) : (Math.random() + Math.random() - 1) * ws.spread);
      const sp = speedBase * (multi ? U.rand(0.88, 1.05) : 1);
      const b = {
        x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, angle: a, damage: ws.damage,
        life: ws.range / sp, r: 3, pierce: ws.pierce, ricochet: ws.ricochet, explosive: ws.explosive,
        incendiary: ws.incendiary, hit: ws.pierce > 0 || ws.ricochet > 0 ? new Set() : null, dead: false,
        crit: ws.crit, color: ws.incendiary ? '#ff8a1e' : ws.explosive ? '#ff5a3e' : ws.crit > 0.2 ? '#ffe14a' : '#ffe9a8',
      };
      stepBullet(state, b, (p.r + 18) / sp);
      if (!b.dead) state.bullets.push(b);
    }
    if (Z.particles && Z.particles.muzzle) Z.particles.muzzle(mx, my, p.angle);
    state.shake = Math.max(state.shake || 0, ws.shake || 0);
    audio(ws.sound);
    noise(state, p.x, p.y, ws.noise);
    addCombatTimer(state, 6);
    if (state.stats) state.stats.shotsFired = (state.stats.shotsFired || 0) + 1;
  }

  function trySwing(state, ws) {
    const p = state.player;
    p.fireCooldown = ws.fireRate;
    p.swingTimer = Math.min(0.22, ws.fireRate * 0.8);
    p.swingTotal = p.swingTimer;
    p.swingArc = ws.melee.arc;
    p.swingDir = p.angle;
    audio(ws.sound);
    state.shake = Math.max(state.shake || 0, ws.shake || 0);
    noise(state, p.x, p.y, ws.noise);
    addCombatTimer(state, 6);
    const reach = ws.melee.range + p.r;
    let hitAny = false;
    for (const z of state.zombies) {
      if (z.dead) continue;
      const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy);
      if (d > reach + z.r) continue;
      let da = Math.atan2(dy, dx) - p.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      // allow for body radius widening the arc at close range
      const slack = d > 1 ? Math.atan2(z.r, d) : Math.PI;
      if (Math.abs(da) > ws.melee.arc / 2 + slack) continue;
      if (SV.phys.raycast(state, p.x, p.y, z.x, z.y, 0, bulletFilter)) continue;
      let dmg = ws.damage;
      const crit = ws.crit > 0 && Math.random() < ws.crit;
      if (crit) { dmg *= 2; spark(state, z.x, z.y, 6); burstParticles(state, z.x, z.y, 8, ['#ffe14a', '#ffffff'], 120, 340, 0.3); }
      const ang = Math.atan2(dy, dx);
      hurtZombie(state, z, dmg, ang, { source: 'player', melee: true, knock: ws.melee.knock, crit });
      hitAny = true;
      if (!z.dead && ws.melee.knock > 0) {
        const nx = z.x + Math.cos(ang) * ws.melee.knock * 0.12, ny = z.y + Math.sin(ang) * ws.melee.knock * 0.12;
        if (SV.phys.isFree(state, nx, ny, z.r)) { z.x = nx; z.y = ny; }
      }
      if (ws.lifesteal > 0) p.hp = Math.min(p.maxHp, p.hp + dmg * ws.lifesteal);
    }
    if (hitAny) state.shake = Math.max(state.shake || 0, (ws.shake || 0) + 1.5);
  }

  function startReload(state) {
    const p = state.player, stack = equipped(state);
    if (!p || !stack || p.reloadTimer > 0) return false;
    const def = SV.WEAPONS[stack.id];
    if (!def || !def.ammo) return false;
    const ws = stats(state, stack.id);
    if ((stack.mag || 0) >= ws.magSize) return false;
    if (ammoCount(state, def.ammo) <= 0) return false;
    p.burstLeft = 0;
    p.reloadTimer = p.reloadTotal = ws.reloadTime;
    p.reloadStack = stack;
    audio('reload');
    return true;
  }
  function finishReload(state) {
    const p = state.player, stack = p.reloadStack;
    p.reloadTimer = 0; p.reloadTotal = 0; p.reloadStack = null;
    if (!stack || stack !== equipped(state)) return;
    const def = SV.WEAPONS[stack.id];
    if (!def || !def.ammo) return;
    const ws = stats(state, stack.id);
    const take = Math.min(ws.magSize - (stack.mag || 0), ammoCount(state, def.ammo));
    if (take > 0 && SV.inv.remove(p.inv, def.ammo, take)) stack.mag = (stack.mag || 0) + take;
  }

  function tryFire(state, wantHeld, wantClick) {
    const p = state.player, stack = equipped(state);
    const id = stack ? stack.id : 'unarmed';
    const def = SV.WEAPONS[id];
    if (!def) return;
    const ws = stats(state, id);
    if (p.fireCooldown > 0 || p.reloadTimer > 0 || (p.burstLeft || 0) > 0) return;
    // Hold-to-fire for every weapon (matches arcade); fireRate alone paces semi-auto guns.
    if (!(wantHeld || wantClick)) return;
    if (def.melee) { trySwing(state, ws); return; }
    if ((stack.mag || 0) <= 0) {
      audio('empty');
      p.fireCooldown = 0.3;
      startReload(state);
      return;
    }
    fireShot(state, ws, stack);
    p.fireCooldown = ws.fireRate;
    if (ws.burst >= 2 && stack.mag > 0) { p.burstLeft = ws.burst - 1; p.burstTimer = 0.07; p.fireCooldown = ws.fireRate + 0.07 * (ws.burst - 1); }
    if (stack.mag <= 0) startReload(state);
  }

  // ---------- burn ticks ----------
  function tickBurn(state, dt) {
    for (let i = 0; i < state.zombies.length; i++) {
      const z = state.zombies[i];
      if (z.dead || !(z.burn > 0)) continue;
      z.burn -= dt;
      z._burnAcc = (z._burnAcc || 0) + dt;
      if (Math.random() < dt * 8) addParticle(state, z.x + U.rand(-z.r, z.r), z.y + U.rand(-z.r, z.r), U.rand(-20, 20), U.rand(-60, -20), 0.35, Math.random() < 0.5 ? '#ff8a1e' : '#ffd36b', U.rand(2, 3.5));
      if (z._burnAcc >= 0.5) {
        z._burnAcc -= 0.5;
        hurtZombie(state, z, 4, 0, { burn: true, source: 'player' });
      }
      if (z.burn <= 0) { z.burn = 0; z._burnAcc = 0; }
    }
  }

  // ---------- thorns ----------
  let hooked = false;
  function hook() {
    if (hooked || !Z.on) return;
    hooked = true;
    Z.on('sv:playerHurt', function () {
      const state = Z.state;
      if (!state || state.mode !== 'survival' || !state.player) return;
      addCombatTimer(state, 6);
      const th = mods(state).thorns;
      if (th > 0) {
        let best = null, bd = 90;
        for (const z of state.zombies) {
          if (z.dead) continue;
          const d = Math.hypot(z.x - state.player.x, z.y - state.player.y) - z.r - state.player.r;
          if (d < bd) { bd = d; best = z; }
        }
        if (best) {
          hurtZombie(state, best, th, Math.atan2(best.y - state.player.y, best.x - state.player.x), { source: 'thorns' });
          spark(state, best.x, best.y, 4);
        }
      }
    });
  }

  // ---------- public API ----------
  SV.combat = {
    reload: startReload,
    switchTo(state, slot) {
      const p = state.player;
      if (!p || (slot !== 'primary' && slot !== 'secondary' && slot !== 'melee')) return;
      if (p.active === slot) return;
      p.active = slot;
      p.reloadTimer = 0; p.reloadTotal = 0; p.reloadStack = null; p.burstLeft = 0;
      p.fireCooldown = Math.max(p.fireCooldown || 0, 0.18);
      if (SV.inv && SV.inv.equippedWeapon && !SV.inv.equippedWeapon(state) && slot !== 'melee') { /* empty slot: unarmed */ }
    },
    update(state, dt) {
      hook();
      const p = state.player;
      if (!p || p.dead) { SV.combat._bullets(state, dt); tickBurn(state, dt); return; }
      if (SV.prog && SV.prog.sync) { p.syncT = (p.syncT || 0) - dt; if (p.syncT <= 0) { p.syncT = 0.5; SV.prog.sync(state); } }
      if (p.fireCooldown > 0) p.fireCooldown -= dt;
      if (p.swingTimer > 0) p.swingTimer = Math.max(0, p.swingTimer - dt);
      if (p.combatTimer > 0) p.combatTimer -= dt;
      const stack = equipped(state);
      // reload progress (cancel if the weapon changed)
      if (p.reloadTimer > 0) {
        if (p.reloadStack !== stack) { p.reloadTimer = 0; p.reloadTotal = 0; p.reloadStack = null; }
        else { p.reloadTimer -= dt; if (p.reloadTimer <= 0) finishReload(state); }
      }
      // burst follow-up shots
      if ((p.burstLeft || 0) > 0) {
        p.burstTimer -= dt;
        if (p.burstTimer <= 0) {
          if (stack && stack.mag > 0 && p.reloadTimer <= 0 && SV.WEAPONS[stack.id] && !SV.WEAPONS[stack.id].melee) {
            fireShot(state, stats(state, stack.id), stack);
            p.burstLeft--; p.burstTimer = 0.07;
            if (stack.mag <= 0) { p.burstLeft = 0; startReload(state); }
          } else p.burstLeft = 0;
        }
      }
      if (state.screen === 'playing' && !state.ui && Z.input) {
        const inp = Z.input;
        if (inp.pressed && inp.pressed('KeyR')) startReload(state);
        const click = inp.pressed && inp.pressed('Mouse0');
        const held = (inp.mouse && inp.mouse.down) || click;
        if (held || click) tryFire(state, !!held, !!click);
      }
      SV.combat._bullets(state, dt);
      tickBurn(state, dt);
    },
    _bullets(state, dt) {
      const bl = state.bullets;
      for (let i = 0; i < bl.length; i++) {
        const b = bl[i];
        if (!b.dead) stepBullet(state, b, dt);
      }
      U.compact(bl);
    },
  };
})();
