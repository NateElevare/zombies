(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const TYPES = {
    walker: { r: 14, hp: 30, speed: 70, damage: 10, points: 10 },
    runner: { r: 11, hp: 18, speed: 150, damage: 8, points: 15 },
    brute: { r: 22, hp: 140, speed: 50, damage: 25, points: 30 }
  };

  function constrain(z) {
    if (Z.world && Z.world.collideCircle) Z.world.collideCircle(z);
    if (Z.WORLD) {
      z.x = Math.max(z.r, Math.min(Z.WORLD.w - z.r, z.x));
      z.y = Math.max(z.r, Math.min(Z.WORLD.h - z.r, z.y));
    }
  }

  function spawn(state, type, x, y) {
    const wave = Math.max(1, state.wave.number);
    if (!TYPES[type] || (type === 'runner' && wave < 3) ||
        (type === 'brute' && wave < 5)) type = 'walker';
    const base = TYPES[type];
    const hp = Math.round(base.hp * (1 + (wave - 1) * 0.06));
    const z = {
      x: x, y: y, r: base.r, type: type, hp: hp, maxHp: hp,
      speed: base.speed * (1 + Math.min(0.3, (wave - 1) * 0.015)),
      damage: base.damage, attackCooldown: 0, hitFlash: 0, angle: 0,
      dead: false,
      losTimer: Math.random() * 0.25, blocked: false,
      avoidTimer: 0, sideTimer: 0, side: Math.random() < 0.5 ? -1 : 1,
      progressTimer: 0, progressX: x, progressY: y,
      stuckTimer: 0, stuckX: x, stuckY: y
    };
    constrain(z);
    z.progressX = z.stuckX = z.x;
    z.progressY = z.stuckY = z.y;
    state.zombies.push(z);
    return z;
  }

  function update(state, dt) {
    const list = state.zombies;
    const player = state.player;
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      if (z.dead) continue;
      z.attackCooldown = Math.max(0, z.attackCooldown - dt);
      z.hitFlash = Math.max(0, z.hitFlash - dt);
      if (player) {
        const dx = player.x - z.x;
        const dy = player.y - z.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        z.angle = Math.atan2(dy, dx);
        z.losTimer -= dt;
        z.avoidTimer = Math.max(0, z.avoidTimer - dt);
        z.sideTimer = Math.max(0, z.sideTimer - dt);
        if (z.losTimer <= 0) {
          z.blocked = !Z.world.lineOfSight(z.x, z.y, player.x, player.y);
          z.losTimer = 0.2 + Math.random() * 0.1;
        }
        z.progressTimer += dt;
        if (z.progressTimer >= 0.5) {
          const moved = Math.hypot(z.x - z.progressX, z.y - z.progressY);
          if (moved < 5 && distance > z.r + player.r + 1) {
            if (z.sideTimer <= 0) {
              if (z.avoidTimer > 0) z.side *= -1;
              z.sideTimer = 1;
            }
            z.avoidTimer = 1;
          }
          z.progressTimer = 0;
          z.progressX = z.x;
          z.progressY = z.y;
        }
        if (z.blocked) {
          if (z.avoidTimer <= 0) z.sideTimer = 1;
          z.avoidTimer = 1;
        }
        // Stop at contact instead of stepping through the player.
        const step = Math.min(z.speed * dt, Math.max(0, distance - z.r - player.r));
        if (distance > 0) {
          let sx = dx / distance, sy = dy / distance;
          if (z.avoidTimer > 0) {
            // Follow a consistent tangent, with a small bias toward the player.
            const tx = -sy * z.side + sx * 0.25;
            const ty = sx * z.side + sy * 0.25;
            const length = Math.hypot(tx, ty);
            sx = tx / length;
            sy = ty / length;
          }
          z.x += sx * step;
          z.y += sy * step;
        }
      }
    }

    // Resolve each overlapping pair once; squared distances avoid needless roots.
    const strength = Math.min(1, dt * 12);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const radius = a.r + b.r + 2;
        const d2 = dx * dx + dy * dy;
        if (d2 >= radius * radius) continue;
        const distance = Math.sqrt(d2);
        if (distance > 0) {
          dx /= distance;
          dy /= distance;
        } else {
          dx = 1;
          dy = 0;
        }
        const push = (radius - distance) * 0.5 * strength;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
      }
    }

    let alive = 0;
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      if (z.dead) continue;
      alive++;
      constrain(z);
      z.stuckTimer += dt;
      if (z.stuckTimer >= 4) {
        const cam = state.camera;
        const offscreen = z.x + z.r < cam.x || z.x - z.r > cam.x + Z.W ||
          z.y + z.r < cam.y || z.y - z.r > cam.y + Z.H;
        if (offscreen && Math.hypot(z.x - z.stuckX, z.y - z.stuckY) < 20) {
          const point = Z.world.randomOpenPoint(500);
          z.x = point.x;
          z.y = point.y;
          constrain(z);
          z.progressX = z.x;
          z.progressY = z.y;
          z.progressTimer = z.avoidTimer = z.sideTimer = z.losTimer = 0;
          z.blocked = false;
        }
        z.stuckTimer = 0;
        z.stuckX = z.x;
        z.stuckY = z.y;
      }
      if (player && player.hp > 0 && z.attackCooldown <= 0) {
        const dx = player.x - z.x;
        const dy = player.y - z.y;
        const reach = player.r + z.r + 1;
        if (dx * dx + dy * dy <= reach * reach) {
          if (Z.player && Z.player.damage) Z.player.damage(state, z.damage);
          z.attackCooldown = 0.8;
        }
      }
    }
    // One ambient roll per frame keeps large hordes from becoming noisy.
    if (alive && Math.random() < dt * 0.12 && Z.audio && Z.audio.play) {
      Z.audio.play('groan');
    }
    if (Z.util && Z.util.compact) Z.util.compact(list);
  }

  function damage(state, z, amount, angle) {
    if (!z || z.dead) return;
    z.hp -= amount;
    z.hitFlash = 0.1;
    if (Number.isFinite(angle)) {
      const knockback = z.type === 'brute' ? 3 : 7;
      z.x += Math.cos(angle) * knockback;
      z.y += Math.sin(angle) * knockback;
      constrain(z);
    }
    if (Z.particles && Z.particles.blood) Z.particles.blood(z.x, z.y, 4);
    if (Z.audio && Z.audio.play) Z.audio.play('hit');
    if (z.hp > 0) return;

    z.dead = true;
    state.stats.kills++;
    state.stats.score += TYPES[z.type].points * Math.max(1, state.wave.number);
    state.wave.remaining = Math.max(0, state.wave.remaining - 1);
    if (Z.particles && Z.particles.blood) Z.particles.blood(z.x, z.y, 16);
    if (Z.audio && Z.audio.play) Z.audio.play('zombieDie');
    if (Z.pickups && Z.pickups.drop) Z.pickups.drop(state, z.x, z.y);
    if (Z.emit) Z.emit('zombieKilled', z);
  }

  Z.zombies = { spawn: spawn, update: update, damage: damage };
})();
