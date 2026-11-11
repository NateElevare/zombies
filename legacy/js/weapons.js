// weapons.js — weapon definitions, firing, reloading, bullet simulation.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const U = Z.util;

  Z.WEAPONS = {
    pistol:  { name: 'Pistol',  damage: 25, fireRate: 0.25, magSize: 12, reloadTime: 1.1, spread: 0.02, pellets: 1, bulletSpeed: 1000, auto: true, shake: 2 },
    shotgun: { name: 'Shotgun', damage: 14, fireRate: 0.8,  magSize: 6,  reloadTime: 1.8, spread: 0.175, pellets: 6, bulletSpeed: 900,  auto: true, shake: 7 },
    smg:     { name: 'SMG',     damage: 12, fireRate: 0.08, magSize: 30, reloadTime: 1.5, spread: 0.06, pellets: 1, bulletSpeed: 1100, auto: true,  shake: 1.5 },
  };
  // NOTE: spread is the half-angle in radians (shotgun total cone ~0.35 rad).

  function audio(n) { if (Z.audio && Z.audio.play) Z.audio.play(n); }

  // Segment entry time against a rectangle expanded by the bullet radius.
  function rectHit(x, y, dx, dy, o, r) {
    let near = 0, far = 1;
    if (dx === 0) {
      if (x < o.x - r || x > o.x + o.w + r) return Infinity;
    } else {
      const a = (o.x - r - x) / dx, b = (o.x + o.w + r - x) / dx;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
    }
    if (dy === 0) {
      if (y < o.y - r || y > o.y + o.h + r) return Infinity;
    } else {
      const a = (o.y - r - y) / dy, b = (o.y + o.h + r - y) / dy;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
    }
    return near <= far ? near : Infinity;
  }

  function sweep(state, b, x, y) {
    const dx = x - b.x, dy = y - b.y, length2 = dx * dx + dy * dy;
    let closest = Infinity, target = null;
    for (let i = 0; i < state.obstacles.length; i++) {
      closest = Math.min(closest, rectHit(b.x, b.y, dx, dy, state.obstacles[i], b.r));
    }
    for (let i = 0; i < state.zombies.length; i++) {
      const z = state.zombies[i];
      if (z.dead) continue;
      const ox = b.x - z.x, oy = b.y - z.y, r = z.r + b.r;
      const c = ox * ox + oy * oy - r * r;
      let t = Infinity;
      if (c <= 0) t = 0;
      else if (length2 > 0) {
        const dot = ox * dx + oy * dy;
        const discriminant = dot * dot - length2 * c;
        if (discriminant >= 0) t = (-dot - Math.sqrt(discriminant)) / length2;
      }
      if (t >= 0 && t <= 1 && t < closest) { closest = t; target = z; }
    }
    const t = closest === Infinity ? 1 : closest;
    b.x += dx * t;
    b.y += dy * t;
    if (closest === Infinity) return;
    b.dead = true;
    if (target) {
      if (Z.zombies && Z.zombies.damage) Z.zombies.damage(state, target, b.damage, b.angle);
    } else if (Z.particles) Z.particles.spark(b.x, b.y, 4);
  }

  const W = (Z.weapons = {
    startReload(state) {
      const p = state.player;
      if (!p || p.reloadTimer > 0) return false;
      const def = Z.WEAPONS[p.current], ws = p.weapons[p.current];
      if (ws.mag >= def.magSize || ws.reserve <= 0) return false;
      p.reloadTimer = def.reloadTime;
      p.reloadWeapon = p.current;
      audio('reload');
      return true;
    },
    cancelReload(state) {
      const p = state.player;
      if (p) { p.reloadTimer = 0; p.reloadWeapon = null; }
    },
    tryFire(state) {
      const p = state.player;
      if (!p || p.reloadTimer > 0 || p.fireCooldown > 0) return false;
      const def = Z.WEAPONS[p.current], ws = p.weapons[p.current];
      if (!def.auto && !Z.input.pressed('Mouse0')) return false;
      if (ws.mag <= 0) {
        audio('empty');
        p.fireCooldown = 0.25;
        W.startReload(state);
        return false;
      }
      ws.mag--;
      p.fireCooldown = def.fireRate;
      state.stats.shotsFired++;
      const mx = p.x + Math.cos(p.angle) * (p.r + 16), my = p.y + Math.sin(p.angle) * (p.r + 16);
      const multi = def.pellets > 1;
      for (let i = 0; i < def.pellets; i++) {
        const a = p.angle + U.rand(-def.spread, def.spread);
        const sp = def.bulletSpeed * (multi ? U.rand(0.85, 1.05) : 1);
        const b = { x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, angle: a, damage: def.damage, life: multi ? 0.5 : 0.9, r: 3, dead: false };
        sweep(state, b, mx, my);
        if (!b.dead) state.bullets.push(b);
      }
      if (Z.particles) Z.particles.muzzle(mx, my, p.angle);
      state.shake = Math.max(state.shake, def.shake);
      audio(p.current);
      if (ws.mag <= 0) W.startReload(state);
      return true;
    },
    update(state, dt) {
      const p = state.player;
      if (p) {
        if (p.fireCooldown > 0) p.fireCooldown -= dt;
        if (p.reloadTimer > 0) {
          p.reloadTimer -= dt;
          if (p.reloadTimer <= 0) {
            p.reloadTimer = 0;
            const key = p.reloadWeapon || p.current, def = Z.WEAPONS[key], ws = p.weapons[key];
            const take = Math.min(def.magSize - ws.mag, ws.reserve);
            ws.mag += take;
            if (ws.reserve !== Infinity) ws.reserve -= take;
            p.reloadWeapon = null;
          }
        }
      }
      const bullets = state.bullets, WW = Z.WORLD.w, HH = Z.WORLD.h;
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        if (b.dead) continue;
        const travel = Math.min(dt, Math.max(0, b.life));
        sweep(state, b, b.x + b.vx * travel, b.y + b.vy * travel);
        b.life -= dt;
        if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WW || b.y > HH) b.dead = true;
      }
      U.compact(bullets);
    },
  });
})();
