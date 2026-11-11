(function () {
  'use strict';
  const Z = (window.Z = window.Z || {}), SV = (Z.sv = Z.sv || {});
  const TAU = Math.PI * 2, MAX_POPULATION = 120;
  const TYPES = {
    walker: { r: 14, hp: 38, speed: 65, damage: 10, xp: 10, color: '#6b8f4e' },
    runner: { r: 11, hp: 25, speed: 135, damage: 8, xp: 15, color: '#a3b545' },
    brute: { r: 22, hp: 160, speed: 43, damage: 26, xp: 40, color: '#4e6b3a' },
    crawler: { r: 9, hp: 20, speed: 92, damage: 6, xp: 12, color: '#7d6b4e' },
    bloater: { r: 19, hp: 78, speed: 48, damage: 12, xp: 25, color: '#8a9a3a' }
  };
  const sessions = new WeakMap();
  let nextId = 0;
  function runtime(state) {
    let rt = sessions.get(state);
    if (!rt) {
      rt = { rng: SV.makeRng ? SV.makeRng((state.seed ^ 0x7a0b1e) >>> 0) : null,
        populationTimer: 0, hordeRemaining: 0, groanTimer: 5 };
      sessions.set(state, rt);
    }
    return rt;
  }
  function random(state) { const rng = runtime(state).rng; return rng ? rng.next() : Math.random(); }
  function night(state) { return !!(SV.game && SV.game.isNight && SV.game.isNight(state)); }
  function sound(name) { if (Z.audio && Z.audio.play) Z.audio.play(name); }
  function blood(x, y, n) { if (Z.particles && Z.particles.blood) Z.particles.blood(x, y, n); }
  function sight(state, x, y, tx, ty) {
    return !SV.phys || !SV.phys.lineOfSight || SV.phys.lineOfSight(state, x, y, tx, ty);
  }
  function overlaps(z, o, margin) {
    const dx = z.x - Math.max(o.x, Math.min(o.x + o.w, z.x));
    const dy = z.y - Math.max(o.y, Math.min(o.y + o.h, z.y));
    return dx * dx + dy * dy < (z.r + (margin || 0)) ** 2;
  }
  function visible(state, x, y, r) {
    const cam = state.camera || { x: 0, y: 0 }, w = Z.W || 960, h = Z.H || 640;
    return x + r >= cam.x && x - r <= cam.x + w && y + r >= cam.y && y - r <= cam.y + h;
  }
  // Also protect the player's light/view when the camera is still catching up.
  function safeSpawn(state, point, r) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || visible(state, point.x, point.y, r + 80)) return false;
    const p = state.player;
    if (p) {
      const dx = point.x - p.x, dy = point.y - p.y, d = Math.hypot(dx, dy);
      if (d < 460) return false;
      if (p.flashlight && d < 700 && (dx * Math.cos(p.angle || 0) + dy * Math.sin(p.angle || 0)) / d > Math.cos(0.55)) return false;
    }
    if (!SV.phys || !SV.phys.isFree || !SV.phys.isFree(state, point.x, point.y, r + 2)) return false;
    if ((state.structures || []).some(s => !s.dead && overlaps({ x: point.x, y: point.y, r: r + 2 }, s))) return false;
    return !(state.zombies || []).some(z => !z.dead && Math.hypot(z.x - point.x, z.y - point.y) < z.r + r + 4);
  }
  function spawnPoint(state, r, cx, cy) {
    const p = state.player;
    cx = cx === undefined ? p.x : cx; cy = cy === undefined ? p.y : cy;
    for (let i = 0; i < 28; i++) {
      let point;
      if (i < 8 && SV.world && SV.world.randomSpawnPoint) {
        point = SV.world.randomSpawnPoint(state, cx, cy, 750, 1550, runtime(state).rng || undefined);
      } else {
        const a = random(state) * TAU, d = 750 + random(state) * 800;
        point = { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
      }
      if (safeSpawn(state, point, r)) return point;
    }
    return null;
  }
  function spawn(state, type, x, y, horde) {
    type = TYPES[type] ? type : 'walker';
    const t = TYPES[type];
    const z = { id: SV.uid ? SV.uid('z') : 'z' + (++nextId), x, y, r: t.r, type,
      hp: t.hp, maxHp: t.hp, speed: t.speed, damage: t.damage, angle: random(state) * TAU,
      state: horde ? 'chase' : 'idle', target: null, attackCooldown: 0, hitFlash: 0, burn: 0, dead: false,
      horde: !!horde, losTimer: random(state) * 0.25, seesPlayer: false, memory: 0,
      decisionTimer: 1 + random(state) * 3, side: random(state) < 0.5 ? -1 : 1,
      avoidTimer: 0, progressTimer: 0, progressX: x, progressY: y, stuckTime: 0, attackTarget: null };
    state.zombies.push(z);
    return z;
  }
  function bed(state) {
    const id = state.base && state.base.bed;
    return (state.structures || []).find(s => !s.dead && s.hp > 0 && s.type === 'bed' && (!id || s.id === id)) || null;
  }
  function pickType(state, horde) {
    const roll = random(state), day = state.clock ? state.clock.day : 1;
    if (roll < (horde || day > 2 ? 0.1 : 0.035)) return 'brute';
    if (roll < 0.18) return 'bloater';
    if (roll < 0.33) return 'crawler';
    if (roll < 0.53) return 'runner';
    return 'walker';
  }
  function population(state, dt, isNight) {
    const rt = runtime(state), p = state.player, day = state.clock ? state.clock.day : 1;
    state.base = state.base || { bed: null };
    if (isNight && day % 3 === 0 && state.base.hordeDay !== day) {
      state.base.hordeDay = day;
      rt.hordeRemaining = Math.min(80, 20 + 5 * day);
      if (Z.emit) Z.emit('sv:horde', { day, count: rt.hordeRemaining });
      if (SV.toast) SV.toast('Horde night! Defend your bed.', '#ff8061');
      sound('waveStart');
    }
    if (!isNight) rt.hordeRemaining = 0;
    rt.populationTimer -= dt;
    if (rt.populationTimer > 0) return;
    rt.populationTimer = 0.5;
    let alive = 0, local = 0;
    for (const z of state.zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (!z.horde && d > 2400 && (z.state === 'idle' || z.state === 'wander') && !visible(state, z.x, z.y, z.r)) {
        z.dead = true; continue; // Despawning is not a kill.
      }
      alive++; if (d < 1600) local++;
    }
    const district = SV.world && SV.world.districtAt ? SV.world.districtAt(state, p.x, p.y) : 'suburb';
    const density = { downtown: 1.45, military: 1.6, industrial: 1.15, suburb: 1, forest: 0.45 }[district] || 1;
    const desired = Math.round((isNight ? 45 : 25) * density);
    const horde = rt.hordeRemaining > 0;
    const count = Math.min(MAX_POPULATION - alive, horde ? Math.min(12, rt.hordeRemaining) : Math.min(4, Math.max(0, desired - local)));
    const base = horde && bed(state);
    for (let i = 0; i < count; i++) {
      const type = pickType(state, horde);
      const point = spawnPoint(state, TYPES[type].r, base ? base.x + base.w / 2 : p.x, base ? base.y + base.h / 2 : p.y);
      if (!point) break;
      spawn(state, type, point.x, point.y, horde);
      if (horde) rt.hordeRemaining--;
    }
  }
  function constrain(state, z) {
    let touched = SV.phys && SV.phys.collideCircle ? SV.phys.collideCircle(state, z) : null;
    // Doors deliberately have solid:false, so resolve their zombie-only collisions here.
    if (state.grid && state.grid.each) state.grid.each(z.x - z.r, z.y - z.r, z.r * 2, z.r * 2, o => {
      if (!o.structure || o.structure.dead || o.structure.type !== 'wood_door' || !overlaps(z, o)) return;
      const cx = Math.max(o.x, Math.min(o.x + o.w, z.x)), cy = Math.max(o.y, Math.min(o.y + o.h, z.y));
      const dx = z.x - cx, dy = z.y - cy, d = Math.hypot(dx, dy);
      if (d > 0.0001) { z.x += dx / d * (z.r - d); z.y += dy / d * (z.r - d); }
      else {
        const distances = [z.x - o.x, o.x + o.w - z.x, z.y - o.y, o.y + o.h - z.y];
        const edge = distances.indexOf(Math.min.apply(null, distances));
        if (edge === 0) z.x = o.x - z.r; else if (edge === 1) z.x = o.x + o.w + z.r;
        else if (edge === 2) z.y = o.y - z.r; else z.y = o.y + o.h + z.r;
      }
      touched = o;
    });
    return touched;
  }
  function obstacle(state, z, x, y) {
    return SV.phys && SV.phys.raycast ? SV.phys.raycast(state, z.x, z.y, x, y, z.r + 1,
      o => o.solid !== false || !!(o.structure && !o.structure.dead && o.structure.type === 'wood_door')) : null;
  }
  function attackStructure(state, z, s) {
    if (!s || s.dead || s.hp <= 0 || !overlaps(z, s, 7)) return false;
    z.state = 'attackStructure'; z.attackTarget = s.id;
    z.angle = Math.atan2(s.y + s.h / 2 - z.y, s.x + s.w / 2 - z.x);
    if (z.attackCooldown <= 0 && SV.base && SV.base.damage) {
      SV.base.damage(state, s, z.damage * (z.type === 'brute' ? 1.6 : 1));
      z.attackCooldown = z.type === 'crawler' ? 0.65 : 0.9;
    }
    return true;
  }
  function move(state, z, dt, isNight) {
    if (!z.target) return;
    const dx = z.target.x - z.x, dy = z.target.y - z.y, distance = Math.hypot(dx, dy);
    if (distance < 6) {
      if (!z.horde && z.state !== 'chase') { z.state = 'idle'; z.target = null; z.memory = 0; z.decisionTimer = 1 + random(state) * 2; }
      return;
    }
    let sx = dx / distance, sy = dy / distance;
    const p = state.player;
    const stop = z.state === 'chase' && !z.horde ? z.r + p.r : 0;
    const step = Math.min(z.speed * (isNight ? 1.25 : 1) * (z.state === 'wander' ? 0.4 : 1) * dt, Math.max(0, distance - stop));
    const probe = Math.max(step + 2, 34);
    const hit = obstacle(state, z, z.x + sx * probe, z.y + sy * probe);
    if (hit && hit.rect.structure && (z.horde || z.state === 'chase' || z.state === 'investigate')) {
      if (attackStructure(state, z, hit.rect.structure)) return;
    } else if (hit || z.avoidTimer > 0) {
      // Commit to the sidestep briefly so the probe toggling hit/no-hit can't zig-zag every frame.
      if (hit) z.avoidTimer = Math.max(z.avoidTimer, 0.3);
      // Follow a stable tangent with a small forward component; reverse only on sustained stalls.
      const tx = -sy * z.side + sx * 0.22, ty = sx * z.side + sy * 0.22, len = Math.hypot(tx, ty);
      sx = tx / len; sy = ty / len;
      if (obstacle(state, z, z.x + sx * (step + 4), z.y + sy * (step + 4))) {
        sx = -sy * z.side; sy = tx / len * z.side;
      }
    }
    // Turn toward the travel direction at a capped rate instead of snapping (no sprite flicker).
    let da = Math.atan2(sy, sx) - (z.angle || 0);
    da = Math.atan2(Math.sin(da), Math.cos(da));
    z.angle = (z.angle || 0) + da * Math.min(1, dt * 12);
    z.x += sx * step; z.y += sy * step;
    const touched = constrain(state, z);
    if (touched && touched.structure && (z.horde || z.state === 'chase' || z.state === 'investigate')) attackStructure(state, z, touched.structure);
    z.progressTimer += dt;
    if (z.progressTimer >= 0.6) {
      const moved = Math.hypot(z.x - z.progressX, z.y - z.progressY);
      if (moved < 4 && step > 0 && z.state !== 'attackStructure') {
        z.stuckTime += z.progressTimer;
        if (z.avoidTimer <= 0) z.side *= -1;
        z.avoidTimer = 1.4;
      } else z.stuckTime = 0;
      z.progressTimer = 0; z.progressX = z.x; z.progressY = z.y;
      if (z.stuckTime >= 6 && !visible(state, z.x, z.y, z.r + 80)) {
        const point = spawnPoint(state, z.r);
        if (point) { z.x = point.x; z.y = point.y; z.progressX = z.x; z.progressY = z.y; z.stuckTime = 0; z.losTimer = 0; }
      }
    }
  }
  function separate(state, dt) {
    const buckets = new Map(), size = 64, list = state.zombies;
    for (let i = 0; i < list.length; i++) {
      const z = list[i]; if (z.dead) continue;
      const key = Math.floor(z.x / size) + ',' + Math.floor(z.y / size);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(i);
    }
    const strength = Math.min(1, dt * 10);
    for (let i = 0; i < list.length; i++) {
      const a = list[i]; if (a.dead) continue;
      const col = Math.floor(a.x / size), row = Math.floor(a.y / size);
      for (let yy = row - 1; yy <= row + 1; yy++) for (let xx = col - 1; xx <= col + 1; xx++) {
        const neighbors = buckets.get(xx + ',' + yy); if (!neighbors) continue;
        for (const j of neighbors) {
          if (j <= i) continue;
          const b = list[j]; let dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy), radius = a.r + b.r + 2;
          if (d >= radius) continue;
          if (d > 0.001) { dx /= d; dy /= d; } else { dx = 1; dy = 0; }
          const push = (radius - d) * strength * 0.5;
          a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push;
        }
      }
    }
    for (const z of list) if (!z.dead) constrain(state, z);
  }
  function update(state, dt) {
    const p = state.player; if (!p || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    const isNight = night(state), rt = runtime(state);
    population(state, dt, isNight);
    const base = bed(state);
    let near = false;
    for (const z of state.zombies) {
      if (z.dead) continue;
      z.attackCooldown = Math.max(0, z.attackCooldown - dt); z.hitFlash = Math.max(0, z.hitFlash - dt);
      z.avoidTimer = Math.max(0, z.avoidTimer - dt); z.memory = Math.max(0, z.memory - dt);
      z.decisionTimer -= dt; z.losTimer -= dt;
      const distance = Math.hypot(p.x - z.x, p.y - z.y);
      if (distance < 380) near = true;
      if (z.losTimer <= 0) {
        const range = isNight ? (p.flashlight ? 430 : 220) : 350;
        z.seesPlayer = !p.dead && p.hp > 0 && distance < range && sight(state, z.x, z.y, p.x, p.y);
        z.losTimer = 0.20 + random(state) * 0.1;
        if (z.seesPlayer) { z.target = { x: p.x, y: p.y }; z.memory = 4; z.state = 'chase'; }
        else if (z.state === 'chase' && !z.horde) z.state = 'investigate';
      }
      if (z.horde) {
        z.target = base ? { x: base.x + base.w / 2, y: base.y + base.h / 2 } : { x: p.x, y: p.y };
        if (z.state !== 'attackStructure') z.state = 'chase';
      } else if (z.state === 'investigate' && z.memory <= 0) { z.target = null; z.state = 'idle'; z.decisionTimer = 0; }
      if (z.state === 'attackStructure') {
        const s = state.structures.find(s => s.id === z.attackTarget && !s.dead);
        if ((z.horde || z.memory > 0) && attackStructure(state, z, s)) continue;
        z.attackTarget = null; z.state = z.horde || z.seesPlayer ? 'chase' : 'investigate';
      }
      if ((z.state === 'idle' || z.state === 'wander') && z.decisionTimer <= 0) {
        const a = random(state) * TAU, d = 50 + random(state) * 130;
        z.target = { x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d };
        z.state = 'wander'; z.decisionTimer = 4 + random(state) * 5;
      }
      if (z.horde && base && attackStructure(state, z, base)) continue;
      move(state, z, dt, isNight);
    }
    separate(state, dt);
    for (const z of state.zombies) {
      if (z.dead || p.dead || p.hp <= 0 || z.attackCooldown > 0) continue;
      if (Math.hypot(p.x - z.x, p.y - z.y) <= p.r + z.r + 2 && sight(state, z.x, z.y, p.x, p.y)) {
        if (SV.player && SV.player.damage) SV.player.damage(state, z.damage, Math.atan2(p.y - z.y, p.x - z.x));
        z.attackCooldown = z.type === 'crawler' ? 0.65 : 0.9;
      }
    }
    rt.groanTimer -= dt;
    if (near && rt.groanTimer <= 0) { sound('groan'); rt.groanTimer = 8 + random(state) * 15; }
    let write = 0;
    for (const z of state.zombies) if (!z.dead) state.zombies[write++] = z;
    state.zombies.length = write;
  }
  function noise(state, x, y, radius) {
    if (!(radius > 0)) return;
    for (const z of state.zombies) {
      if (z.dead || z.horde || z.seesPlayer || Math.hypot(z.x - x, z.y - y) > radius) continue;
      z.target = { x, y }; z.memory = 8; z.state = 'investigate'; z.attackTarget = null;
    }
  }
  function explode(state, z) {
    const radius = 90, p = state.player;
    state.shake = Math.max(state.shake || 0, 10);
    if (Z.particles && Z.particles.spark) Z.particles.spark(z.x, z.y, 24);
    blood(z.x, z.y, 22); noise(state, z.x, z.y, 650);
    if (p && !p.dead && Math.hypot(p.x - z.x, p.y - z.y) <= radius + p.r && SV.player && SV.player.damage) {
      SV.player.damage(state, 30, Math.atan2(p.y - z.y, p.x - z.x));
    }
    // Mark the source dead before recursion so chained bloaters explode exactly once.
    for (const other of state.zombies) if (!other.dead && Math.hypot(other.x - z.x, other.y - z.y) <= radius + other.r) {
      damage(state, other, 48, Math.atan2(other.y - z.y, other.x - z.x), { source: 'bloater' });
    }
    for (const s of (state.structures || []).slice()) if (!s.dead && overlaps({ x: z.x, y: z.y, r: radius }, s) && SV.base && SV.base.damage) SV.base.damage(state, s, 48);
  }
  function damage(state, z, amount, angle, opts) {
    if (!z || z.dead || !Number.isFinite(amount) || amount <= 0) return;
    z.hp = Math.max(0, z.hp - amount); z.hitFlash = 0.12;
    // Combat owns ignition and burn duration; burn:true identifies its damage ticks.
    if (Number.isFinite(angle) && !(opts && opts.burn)) {
      const knock = z.type === 'brute' ? 2 : 6;
      z.x += Math.cos(angle) * knock; z.y += Math.sin(angle) * knock; constrain(state, z);
    }
    blood(z.x, z.y, 4);
    if (state.player && Math.hypot(z.x - state.player.x, z.y - state.player.y) < 700) sound('hit');
    if (z.hp > 0) {
      if (!z.horde && state.player && (!opts || opts.source !== 'bloater')) {
        z.target = { x: state.player.x, y: state.player.y }; z.memory = 8; z.state = 'investigate'; z.losTimer = 0;
      }
      return;
    }
    z.dead = true;
    if (state.stats) state.stats.kills = (state.stats.kills || 0) + 1;
    if (SV.prog && SV.prog.addXP) SV.prog.addXP(state, (TYPES[z.type] || TYPES.walker).xp);
    if (SV.loot && SV.loot.zombieDrop) SV.loot.zombieDrop(state, z);
    blood(z.x, z.y, 12);
    if (state.player && Math.hypot(z.x - state.player.x, z.y - state.player.y) < 700) sound('zombieDie');
    if (Z.emit) Z.emit('sv:zombieKilled', z);
    if (z.type === 'bloater') explode(state, z);
  }
  function draw(ctx, state, cam) {
    cam = cam || state.camera || { x: 0, y: 0 };
    for (const z of state.zombies) {
      if (z.dead || z.x + 45 < cam.x || z.y + 45 < cam.y || z.x - 45 > cam.x + (Z.W || 960) || z.y - 45 > cam.y + (Z.H || 640)) continue;
      const flash = z.hitFlash > 0, color = flash ? '#fff' : z.burn > 0 ? '#eb792e' : (TYPES[z.type] || TYPES.walker).color;
      ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(z.angle || 0);
      ctx.fillStyle = color; ctx.strokeStyle = '#172014'; ctx.lineWidth = 1.5;
      for (let side = -1; side <= 1; side += 2) {
        ctx.beginPath(); ctx.arc(z.r * 1.05, side * z.r * 0.65, Math.max(3, z.r * 0.29), 0, TAU); ctx.fill(); ctx.stroke();
      }
      ctx.beginPath();
      if (z.type === 'crawler') ctx.ellipse(0, 0, z.r * 1.25, z.r * 0.72, 0, 0, TAU);
      else ctx.arc(0, 0, z.r, 0, TAU);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = flash ? '#ddd' : 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.arc(z.r * 0.22, 0, z.r * 0.48, 0, TAU); ctx.fill();
      if (z.type === 'bloater') {
        ctx.fillStyle = '#bed454';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-z.r * 0.4, (i - 1) * 8, 3, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
      if (z.hp < z.maxHp) {
        ctx.fillStyle = '#181313'; ctx.fillRect(z.x - z.r, z.y - z.r - 9, z.r * 2, 4);
        ctx.fillStyle = '#c74335'; ctx.fillRect(z.x - z.r, z.y - z.r - 9, z.r * 2 * Math.max(0, z.hp / z.maxHp), 4);
      }
    }
  }
  SV.zombies = { TYPES, spawn, update, damage, noise, draw };
})();
