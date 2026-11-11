(function () {
  'use strict';
  const Z = (window.Z = window.Z || {}), SV = (Z.sv = Z.sv || {});
  const TABLE = {
    bed: { name: 'Bed', cost: { wood: 12, cloth: 8, nails: 4 }, w: 32, h: 64, hp: 120, solid: false, blocksBullets: false, blocksSight: false, desc: 'Respawn, sleep at night, and save. One bed only.', glyph: 'BED' },
    stash: { name: 'Storage stash', cost: { wood: 10, nails: 4 }, w: 32, h: 32, hp: 150, solid: true, blocksBullets: true, blocksSight: false, desc: 'Stores 24 slots of supplies.', glyph: 'BOX' },
    workbench: { name: 'Workbench', cost: { wood: 18, scrap: 10, nails: 6 }, w: 64, h: 32, hp: 220, solid: true, blocksBullets: true, blocksSight: false, desc: 'Craft advanced supplies and unlock weapon and armor technology.', glyph: 'WB' },
    wood_wall: { name: 'Wood wall', cost: { wood: 8, nails: 2 }, w: 64, h: 16, hp: 220, solid: true, blocksBullets: true, blocksSight: true, desc: 'A solid wooden defense.', glyph: 'WW' },
    metal_wall: { name: 'Metal wall', cost: { scrap: 16, nails: 4 }, w: 64, h: 16, hp: 650, solid: true, blocksBullets: true, blocksSight: true, desc: 'Heavy defense against hordes.', glyph: 'MW' },
    wood_door: { name: 'Wood door', cost: { wood: 8, scrap: 2, nails: 2 }, w: 32, h: 16, hp: 160, solid: false, blocksBullets: false, blocksSight: false, desc: 'You can pass through; zombies must break it.', glyph: 'DR' },
    barricade: { name: 'Barricade', cost: { wood: 4 }, w: 64, h: 16, hp: 90, solid: true, blocksBullets: false, blocksSight: false, desc: 'Cheap defense you can shoot over.', glyph: 'BAR' },
    spike_trap: { name: 'Spike trap', cost: { wood: 6, nails: 6 }, w: 32, h: 32, hp: 100, solid: false, blocksBullets: false, blocksSight: false, desc: 'Hurts zombies crossing it; wears down with use.', glyph: 'SPK' },
    campfire: { name: 'Campfire', cost: { wood: 8, scrap: 2 }, w: 32, h: 32, hp: 80, solid: false, blocksBullets: false, blocksSight: false, desc: 'Lights your shelter at night.', glyph: 'FIRE' },
    turret: { name: 'Turret', cost: { scrap: 24, electronics: 8, gun_parts: 6, nails: 4 }, w: 32, h: 32, hp: 260, solid: true, blocksBullets: true, blocksSight: false, desc: 'Automatic defense. Load 9mm ammo with E.', glyph: 'TUR' }
  };
  SV.STRUCTURES = TABLE;
  const types = Object.keys(TABLE), sessions = new WeakMap();
  let nextId = 0;
  function runtime(state) {
    let rt = sessions.get(state);
    if (!rt) { rt = { rot: 0, ghost: null, suppressB: false, wheel: 0 }; sessions.set(state, rt); }
    return rt;
  }
  function sound(name) { if (Z.audio && Z.audio.play) Z.audio.play(name); }
  function toast(message, color) { if (SV.toast) SV.toast(message, color); }
  function pressed(code) { return !!(Z.input && Z.input.pressed && Z.input.pressed(code)); }
  function dims(type, rot) { const t = TABLE[type]; return rot % 2 ? { w: t.h, h: t.w } : { w: t.w, h: t.h }; }
  function snap(n) { return Math.floor(n / 32) * 32; }
  function intersects(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function circleOverlap(rect, e) {
    const dx = e.x - Math.max(rect.x, Math.min(rect.x + rect.w, e.x));
    const dy = e.y - Math.max(rect.y, Math.min(rect.y + rect.h, e.y));
    return dx * dx + dy * dy < e.r * e.r;
  }
  function distance(rect, x, y) {
    return Math.hypot(x - Math.max(rect.x, Math.min(rect.x + rect.w, x)), y - Math.max(rect.y, Math.min(rect.y + rect.h, y)));
  }
  function canAfford(state, type) {
    if (!TABLE[type] || !state.player || !state.player.inv || !SV.inv || !SV.inv.count || !SV.inv.remove) return false;
    return Object.entries(TABLE[type].cost).every(([id, qty]) => SV.inv.count(state.player.inv, id) >= qty);
  }
  function canPlace(state, type, x, y, rot) {
    if (!TABLE[type] || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (!state.grid || !state.grid.each || !SV.phys || !SV.phys.addSolid) return false;
    const rect = Object.assign({ x, y }, dims(type, rot || 0)), world = SV.WORLD || { w: 16000, h: 16000 };
    if (x < 0 || y < 0 || x + rect.w > world.w || y + rect.h > world.h) return false;
    if (type === 'bed' && state.structures.some(s => s.type === 'bed' && !s.dead)) return false;
    let blocked = false;
    state.grid.each(x, y, rect.w, rect.h, o => {
      if ((o.solid !== false || o.structure) && intersects(rect, o)) { blocked = true; return true; }
    });
    if (blocked || state.structures.some(s => !s.dead && intersects(rect, s))) return false;
    if (state.player && circleOverlap(rect, state.player)) return false;
    return !state.zombies.some(z => !z.dead && circleOverlap(rect, z));
  }
  function inventory(size) {
    return SV.inv && SV.inv.create ? SV.inv.create(size) : { size, slots: Array(size).fill(null) };
  }
  function register(state, s) {
    const def = TABLE[s.type];
    const proxy = { x: s.x, y: s.y, w: s.w, h: s.h, kind: 'structure', solid: def.solid,
      blocksBullets: def.blocksBullets, blocksSight: def.blocksSight, structure: s };
    // Keep the back-reference out of save JSON (the grid proxy itself is never saved).
    Object.defineProperty(s, '_solid', { value: proxy, writable: true, configurable: true, enumerable: false });
    if (SV.phys && SV.phys.addSolid) SV.phys.addSolid(state, proxy);
    state.structures.push(s);
    if (s.type === 'bed') {
      state.base = state.base || {};
      state.base.bed = s.id;
      if (state.player) state.player.spawn = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    }
    return s;
  }
  function place(state, type, x, y, rot) {
    rot = ((Math.round(rot || 0) % 4) + 4) % 4;
    x = snap(x); y = snap(y);
    if (!canPlace(state, type, x, y, rot) || !canAfford(state, type)) return null;
    const paid = [], def = TABLE[type];
    for (const [id, qty] of Object.entries(def.cost)) {
      if (!SV.inv.remove(state.player.inv, id, qty)) {
        for (const [paidId, paidQty] of paid) if (SV.inv && SV.inv.add) SV.inv.add(state.player.inv, paidId, paidQty);
        return null;
      }
      paid.push([id, qty]);
    }
    const s = Object.assign({ id: SV.uid ? SV.uid('s') : 's' + (++nextId), type, x, y, rot, hp: def.hp, maxHp: def.hp, hitFlash: 0 }, dims(type, rot));
    if (type === 'stash') s.inv = inventory(24);
    if (type === 'turret') { s.inv = inventory(1); s.fireCooldown = 0; s.angle = 0; }
    register(state, s); sound('build');
    return s;
  }
  function restore(state, list) {
    const saved = (list || []).slice();
    for (const s of state.structures || []) if (s._solid && SV.phys && SV.phys.removeSolid) SV.phys.removeSolid(state, s._solid);
    state.structures = [];
    state.base = state.base || {}; state.base.bed = null;
    const ids = new Set();
    for (const raw of saved) {
      if (!raw || !TABLE[raw.type] || !Number.isFinite(raw.x) || !Number.isFinite(raw.y) || raw.dead || raw.hp <= 0) continue;
      if (raw.type === 'bed' && state.base.bed) continue;
      const def = TABLE[raw.type], rot = ((Math.round(raw.rot || 0) % 4) + 4) % 4;
      const s = Object.assign({}, raw, dims(raw.type, rot), { rot, maxHp: def.hp, hp: Math.min(def.hp, Number.isFinite(raw.hp) ? raw.hp : def.hp), hitFlash: 0, dead: false });
      if (!s.id || ids.has(s.id)) s.id = SV.uid ? SV.uid('s') : 's' + (++nextId);
      ids.add(s.id);
      const world = SV.WORLD || { w: 16000, h: 16000 };
      if (s.x < 0 || s.y < 0 || s.x + s.w > world.w || s.y + s.h > world.h) continue;
      delete s._solid;
      if (s.type === 'stash' || s.type === 'turret') {
        const size = s.type === 'stash' ? 24 : 1;
        s.inv = raw.inv && Array.isArray(raw.inv.slots) ? { size, slots: Array.from({ length: size }, (_, i) => raw.inv.slots[i] ? Object.assign({}, raw.inv.slots[i]) : null) } : inventory(size);
      }
      register(state, s);
    }
  }
  function dropStacks(state, s, stacks) {
    if (!stacks.length) return;
    const x = s.x + s.w / 2, y = s.y + s.h / 2;
    if (SV.loot && SV.loot.makeDrop) { SV.loot.makeDrop(state, x, y, stacks, 'loot'); return; }
    // Inventory contents must survive destruction even while the loot module is unavailable.
    const inv = inventory(stacks.length); inv.slots = stacks.map(stack => Object.assign({}, stack));
    state.drops.push({ id: SV.uid ? SV.uid('d') : 'd' + (++nextId), x, y, r: 12, inv, life: 600, kind: 'loot' });
  }
  function remove(state, s, refund) {
    if (!s || s.dead || state.structures.indexOf(s) < 0) return false;
    if (state.ui && SV.ui && SV.ui.target && SV.ui.target() === s && SV.ui.close) SV.ui.close();
    s.dead = true;
    if (s._solid && SV.phys && SV.phys.removeSolid) SV.phys.removeSolid(state, s._solid);
    state.structures.splice(state.structures.indexOf(s), 1);
    if (state.base && state.base.bed === s.id) {
      state.base.bed = null;
      if (state.player && state.spawnPoint) state.player.spawn = { x: state.spawnPoint.x, y: state.spawnPoint.y };
    }
    const stacks = s.inv && s.inv.slots ? s.inv.slots.filter(Boolean).map(stack => Object.assign({}, stack)) : [];
    if (s.inv) s.inv.slots = Array(s.inv.size).fill(null);
    if (refund) {
      for (const [id, qty] of Object.entries(TABLE[s.type].cost)) {
        let left = Math.floor(qty / 2); if (!left) continue;
        if (state.player && SV.inv && SV.inv.add) left = SV.inv.add(state.player.inv, id, left);
        if (left > 0) stacks.push({ id, qty: left });
      }
    }
    dropStacks(state, s, stacks);
    if (Z.particles && Z.particles.spark) Z.particles.spark(s.x + s.w / 2, s.y + s.h / 2, 12);
    if (state.interact && state.interact.target === s) state.interact = null;
    return true;
  }
  function demolish(state, s) { const removed = remove(state, s, true); if (removed) sound('build'); return removed; }
  function damage(state, s, amount) {
    if (!s || s.dead || !Number.isFinite(amount) || amount <= 0) return;
    s.hp = Math.max(0, s.hp - amount); s.hitFlash = 0.15;
    if (s.hp <= 0) remove(state, s, false);
  }
  function nearStation(state, type) {
    const p = state.player; if (!p) return null;
    return state.structures.find(s => !s.dead && s.type === type && distance(s, p.x, p.y) <= 140) || null;
  }
  function nearestInteractable(state, x, y, maxDist) {
    let result = null, best = maxDist === undefined ? 70 : maxDist;
    for (const s of state.structures) {
      if (s.dead || !['bed', 'stash', 'workbench', 'turret'].includes(s.type)) continue;
      const d = distance(s, x, y);
      if (d <= best && (!SV.phys || !SV.phys.canReach || SV.phys.canReach(state, x, y, s))) { best = d; result = s; }
    }
    return result;
  }
  function interact(state, s) {
    if (!s || s.dead || !state.player) return;
    if (s.type === 'bed') {
      state.base = state.base || {}; state.base.bed = s.id;
      state.player.spawn = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
      if (SV.game && SV.game.isNight && SV.game.isNight(state) && SV.game.skipToMorning) SV.game.skipToMorning(state);
      if (SV.save && SV.save.write) SV.save.write(state);
      toast('Respawn point set. Progress saved.');
    } else if (SV.ui && SV.ui.open) {
      if (s.type === 'stash' || s.type === 'turret') SV.ui.open('stash', s);
      else if (s.type === 'workbench') SV.ui.open('workbench', s);
    }
  }
  function enterBuild(state) {
    if (!state.player || state.player.dead) return;
    if (state.ui === 'build') { exitBuild(state); return; }
    const rt = runtime(state); rt.suppressB = pressed('KeyB'); rt.wheel = 0;
    state.ui = 'build';
    if (SV.ui && SV.ui.open) SV.ui.open('build');
  }
  function exitBuild(state) {
    if (state.ui !== 'build') return;
    state.ui = null; runtime(state).ghost = null;
    if (SV.ui && SV.ui.close) SV.ui.close();
  }
  function cycle(direction) {
    const index = types.indexOf(api.selected);
    api.selected = types[(Math.max(0, index) + direction + types.length) % types.length];
  }
  if (window.addEventListener) window.addEventListener('wheel', event => {
    const state = Z.state;
    if (!state || state.mode !== 'survival' || state.ui !== 'build' || !event.deltaY) return;
    if (event.preventDefault) event.preventDefault();
    runtime(state).wheel += event.deltaY > 0 ? 1 : -1;
  }, { passive: false });
  function buildInput(state) {
    const rt = runtime(state);
    if (pressed('Mouse2') || pressed('Escape') || (pressed('KeyB') && !rt.suppressB)) { exitBuild(state); return; }
    rt.suppressB = false;
    if (pressed('KeyQ')) cycle(-1);
    if (pressed('KeyE')) cycle(1);
    if (rt.wheel) { cycle(rt.wheel > 0 ? 1 : -1); rt.wheel = 0; }
    if (pressed('KeyR')) rt.rot = (rt.rot + 1) % 4;
    if (!TABLE[api.selected]) api.selected = types[0];
    const mouse = Z.input && Z.input.mouse;
    if (!mouse) return;
    const x = snap(mouse.worldX), y = snap(mouse.worldY), type = api.selected;
    if (pressed('KeyX')) {
      const s = state.structures.slice().reverse().find(s => !s.dead && mouse.worldX >= s.x && mouse.worldX <= s.x + s.w && mouse.worldY >= s.y && mouse.worldY <= s.y + s.h);
      if (s) demolish(state, s);
    } else if (pressed('Mouse0')) {
      if (!place(state, type, x, y, rt.rot)) toast(canAfford(state, type) ? 'Choose an empty spot for this structure.' : 'Not enough materials.', '#e99a67');
    }
    rt.ghost = Object.assign({ type, x, y, rot: rt.rot, valid: canPlace(state, type, x, y, rt.rot) && canAfford(state, type) }, dims(type, rt.rot));
  }
  function turret(state, s, dt) {
    s.fireCooldown = Math.max(0, (s.fireCooldown || 0) - dt);
    if (s.fireCooldown > 0 || !s.inv || !SV.inv || !SV.inv.count || !SV.inv.remove || SV.inv.count(s.inv, 'ammo_9mm') < 1) return;
    const x = s.x + s.w / 2, y = s.y + s.h / 2;
    let target = null, best = 400, muzzle = null;
    for (const z of state.zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - x, z.y - y); if (d >= best || d < 1) continue;
      const a = Math.atan2(z.y - y, z.x - x), offset = Math.hypot(s.w, s.h) * 0.5 + 6;
      const point = { x: x + Math.cos(a) * offset, y: y + Math.sin(a) * offset };
      if (SV.phys && SV.phys.raycast && SV.phys.raycast(state, x, y, point.x, point.y, 3, o => o !== s._solid && o.blocksBullets !== false)) continue;
      if (SV.phys && SV.phys.lineOfSight && !SV.phys.lineOfSight(state, point.x, point.y, z.x, z.y)) continue;
      target = z; best = d; muzzle = point;
    }
    if (!target) { s.fireCooldown = 0.15; return; }
    if (!SV.inv.remove(s.inv, 'ammo_9mm', 1)) return;
    const angle = Math.atan2(target.y - y, target.x - x); s.angle = angle; s.fireCooldown = 0.3;
    state.bullets.push({ x: muzzle.x, y: muzzle.y, vx: Math.cos(angle) * 900, vy: Math.sin(angle) * 900,
      angle, damage: 20, life: 0.55, r: 3, pierce: 0, ricochet: 0, explosive: 0, incendiary: false, hit: new Set(), dead: false, color: '#ffd875' });
    if (Z.particles && Z.particles.muzzle) Z.particles.muzzle(muzzle.x, muzzle.y, angle);
    if (state.player && Math.hypot(x - state.player.x, y - state.player.y) < 800) sound('pistol');
    if (SV.zombies && SV.zombies.noise) SV.zombies.noise(state, x, y, 700);
  }
  function update(state, dt) {
    if (!Number.isFinite(dt) || dt < 0) return;
    if (state.ui === 'build') buildInput(state);
    for (const s of state.structures.slice()) {
      if (s.dead) continue;
      s.hitFlash = Math.max(0, (s.hitFlash || 0) - dt);
      if (s.type === 'turret') turret(state, s, dt);
      if (s.type === 'spike_trap') {
        s.trapCooldown = Math.max(0, (s.trapCooldown || 0) - dt);
        if (s.trapCooldown > 0) continue;
        let hits = 0;
        for (const z of state.zombies) {
          if (!z.dead && circleOverlap(s, z) && SV.zombies && SV.zombies.damage) { SV.zombies.damage(state, z, 16, undefined, { source: 'spike_trap' }); hits++; }
        }
        if (hits) { s.trapCooldown = 0.65; damage(state, s, hits * 2); }
      }
    }
  }
  function drawPiece(ctx, s, time) {
    const w = s.w, h = s.h;
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.lineWidth = 2; ctx.strokeStyle = '#25261d';
    const colors = { bed: '#686d57', stash: '#856640', workbench: '#8d724c', wood_wall: '#80603d', metal_wall: '#66717a', wood_door: '#ac8451', barricade: '#7e6043', spike_trap: '#4c4537', campfire: '#4b493f', turret: '#58615b' };
    ctx.fillStyle = s.hitFlash > 0 ? '#fff' : colors[s.type];
    ctx.fillRect(0, 0, w, h); ctx.strokeRect(0, 0, w, h);
    if (s.type === 'bed') {
      ctx.fillStyle = '#c2bba0'; ctx.fillRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = '#546d75'; ctx.fillRect(4, h * 0.35, w - 8, h * 0.65 - 4);
      ctx.fillStyle = '#ddd6bd'; ctx.fillRect(6, 6, Math.max(8, w - 12), Math.max(8, h * 0.2));
    } else if (s.type === 'stash') {
      ctx.strokeStyle = '#c6a570'; ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = '#d0ba7a'; ctx.fillRect(w / 2 - 3, h / 2 - 3, 6, 6);
    } else if (s.type === 'workbench') {
      ctx.fillStyle = '#383b3c'; ctx.fillRect(6, 6, 16, 12);
      ctx.strokeStyle = '#b6c1c1'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(w - 20, 7); ctx.lineTo(w - 9, h - 8); ctx.stroke();
      ctx.fillStyle = '#d2c7a4'; ctx.fillRect(w / 2 - 6, h / 2 - 4, 12, 8);
    } else if (s.type === 'wood_wall' || s.type === 'metal_wall' || s.type === 'wood_door') {
      ctx.strokeStyle = s.type === 'metal_wall' ? '#a1abb0' : '#c39a63'; ctx.lineWidth = 1;
      ctx.beginPath();
      if (w >= h) for (let x = 8; x < w; x += 12) { ctx.moveTo(x, 1); ctx.lineTo(x, h - 1); }
      else for (let y = 8; y < h; y += 12) { ctx.moveTo(1, y); ctx.lineTo(w - 1, y); }
      ctx.stroke();
      if (s.type === 'wood_door') { ctx.fillStyle = '#f1d483'; ctx.fillRect(w - 8, h / 2 - 2, 4, 4); }
    } else if (s.type === 'barricade') {
      ctx.strokeStyle = '#bd9a69'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(3, 3); ctx.lineTo(w - 3, h - 3); ctx.moveTo(w - 3, 3); ctx.lineTo(3, h - 3); ctx.stroke();
    } else if (s.type === 'spike_trap') {
      ctx.fillStyle = '#cab997';
      for (let y = 7; y < h; y += 10) for (let x = 7; x < w; x += 10) {
        ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x - 3, y + 3); ctx.lineTo(x + 3, y + 3); ctx.closePath(); ctx.fill();
      }
    } else if (s.type === 'campfire') {
      ctx.fillStyle = '#252721'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f58b32'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 7 + Math.sin(time * 9) * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe49a'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2); ctx.fill();
    } else if (s.type === 'turret') {
      ctx.translate(w / 2, h / 2); ctx.rotate(s.angle || 0);
      ctx.fillStyle = '#202826'; ctx.fillRect(0, -4, 24, 8);
      ctx.fillStyle = '#a7b4a1'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#efc45b'; ctx.fillRect(2, -2, 4, 4);
    }
    ctx.restore();
    if (s.hp < s.maxHp) {
      ctx.fillStyle = '#181b17'; ctx.fillRect(s.x, s.y - 7, w, 4);
      ctx.fillStyle = '#d5a553'; ctx.fillRect(s.x, s.y - 7, w * Math.max(0, s.hp / s.maxHp), 4);
    }
  }
  function draw(ctx, state, cam) {
    cam = cam || state.camera || { x: 0, y: 0 };
    for (const s of state.structures) {
      if (s.dead || s.x + s.w < cam.x - 30 || s.y + s.h < cam.y - 30 || s.x > cam.x + (Z.W || 960) + 30 || s.y > cam.y + (Z.H || 640) + 30) continue;
      drawPiece(ctx, s, state.time || 0);
    }
    const ghost = runtime(state).ghost;
    if (state.ui !== 'build' || !ghost) return;
    ctx.save(); ctx.globalAlpha = 0.55; drawPiece(ctx, ghost, state.time || 0); ctx.globalAlpha = 1;
    ctx.strokeStyle = ghost.valid ? '#8ee887' : '#f46b61'; ctx.fillStyle = ghost.valid ? 'rgba(90,210,100,0.2)' : 'rgba(240,70,60,0.25)';
    ctx.lineWidth = 2; ctx.fillRect(ghost.x, ghost.y, ghost.w, ghost.h); ctx.strokeRect(ghost.x, ghost.y, ghost.w, ghost.h);
    const def = TABLE[ghost.type];
    const cost = Object.entries(def.cost).map(([id, qty]) => {
      const have = SV.inv && SV.inv.count && state.player ? SV.inv.count(state.player.inv, id) : 0;
      return id.replace(/_/g, ' ') + ' ' + have + '/' + qty;
    }).join('  ');
    ctx.font = '12px sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    const width = Math.max(ctx.measureText(def.name).width, ctx.measureText(cost).width) + 16;
    const x = Math.max(cam.x + 6, Math.min(ghost.x, cam.x + (Z.W || 960) - width - 6));
    const y = Math.max(cam.y + 6, Math.min(ghost.y + ghost.h + 8, cam.y + (Z.H || 640) - 46));
    ctx.fillStyle = 'rgba(12,16,12,0.92)'; ctx.fillRect(x, y, width, 40);
    ctx.fillStyle = ghost.valid ? '#a3ed96' : '#ff9a8b'; ctx.fillText(def.name, x + 8, y + 5);
    ctx.fillStyle = '#e1dfcc'; ctx.fillText(cost, x + 8, y + 22); ctx.restore();
  }
  const api = SV.base = { selected: 'bed', enterBuild, exitBuild, place, restore, damage, demolish,
    canPlace, canAfford, interact, nearStation, nearestInteractable, update, draw };
})();
