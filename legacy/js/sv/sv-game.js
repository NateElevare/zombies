// sv-game.js — Survival game loop, day/night clock, new/continue/death/respawn, autosave. Owned by GAME agent.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const U = Z.util;
  const SV = (Z.sv = Z.sv || {});

  const DAY_LENGTH = 600, NIGHT_START = 420;
  let saveTimer = 0;

  function play(n) { if (Z.audio && Z.audio.play) { try { Z.audio.play(n); } catch (e) { /* ignore */ } } }
  function toast(m, c) { if (SV.toast) SV.toast(m, c); }
  function ui() { return SV.ui; }
  function smooth(x) { x = U.clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  function snapCamera(state) {
    const p = state.player;
    if (!p) return;
    state.camera.x = clampCam(p.x - Z.W / 2, Z.W, SV.WORLD.w);
    state.camera.y = clampCam(p.y - Z.H / 2, Z.H, SV.WORLD.h);
  }
  function clampCam(v, view, world) {
    if (view >= world) return (world - view) / 2;
    return U.clamp(v, 0, world - view);
  }
  function updateCamera(state, dt) {
    const p = state.player;
    if (!p) return;
    const m = Z.input.mouse;
    const lx = U.clamp((m.x - Z.W / 2) * 0.15, -110, 110), ly = U.clamp((m.y - Z.H / 2) * 0.15, -110, 110);
    const tx = clampCam(p.x + lx - Z.W / 2, Z.W, SV.WORLD.w), ty = clampCam(p.y + ly - Z.H / 2, Z.H, SV.WORLD.h);
    const k = 1 - Math.exp(-8 * dt);
    state.camera.x += (tx - state.camera.x) * k;
    state.camera.y += (ty - state.camera.y) * k;
  }

  function save(state) {
    state = state || Z.state;
    if (!state || state.mode !== 'survival' || !state.player || state.player.dead || state.screen === 'dead') return false;
    let saved = false;
    try { if (SV.save && SV.save.write) saved = SV.save.write(state); } catch (e) { console.error('save failed', e); }
    if (!saved) toast('Save failed - storage unavailable', '#f66');
    return saved;
  }

  function startState(state) {
    Z.state = state;
    state.screen = 'playing';
    if (Z.ui && Z.ui.showScreen) Z.ui.showScreen('playing');
    if (ui() && ui().close) ui().close();
    state.ui = null;
    saveTimer = 0;
    snapCamera(state);
    state._night = SV.game.isNight(state);
    play('waveStart');
  }

  function setupPlayer(state) {
    const sp = state.spawnPoint || { x: 8000, y: 8000 };
    return (state.player = SV.player.create(sp.x, sp.y));
  }

  function isEmptyInv(inv) {
    if (!inv || !inv.slots) return true;
    for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i]) return false;
    return true;
  }

  function onDied() {
    const s = Z.state;
    if (!s || s.mode !== 'survival' || s.screen === 'dead' || !s.player) return;
    const p = s.player;
    const stacks = [];
    if (p.inv && p.inv.slots) {
      for (let i = 0; i < p.inv.slots.length; i++) if (p.inv.slots[i]) { stacks.push(p.inv.slots[i]); p.inv.slots[i] = null; }
    }
    if (stacks.length) {
      const n = Math.max(stacks.length, 1);
      const inv = SV.inv && SV.inv.create ? SV.inv.create(n) : { size: n, slots: new Array(n).fill(null) };
      for (let i = 0; i < stacks.length; i++) inv.slots[i] = stacks[i];
      s.drops.push({ id: SV.uid('drop'), x: p.x, y: p.y, r: 12, inv, life: Infinity, kind: 'deathbag' });
    }
    s.stats.deaths++;
    s.screen = 'dead';
    s.search = null;
    s.interact = null;
    if (ui() && ui().open) ui().open('dead');
    else s.ui = 'dead';
  }
  Z.on('sv:playerDied', onDied);

  function toggleOverlay(state, name) {
    if (state.ui === name) { if (ui() && ui().close) ui().close(); return; }
    if (state.ui === 'build') exitBuild(state);
    if (!state.ui && ui() && ui().open) ui().open(name);
  }
  function exitBuild(state) {
    if (SV.base && SV.base.exitBuild) SV.base.exitBuild(state);
    if (state.ui === 'build') state.ui = null;
  }

  function handleKeys(state) {
    const I = Z.input, p = state.player;
    if (state.screen === 'dead') return;
    if (I.pressed('Escape')) {
      if (state.ui === 'build') exitBuild(state);
      else if (state.ui) { if (ui() && ui().close) ui().close(); }
      else if (ui() && ui().open) ui().open('pause');
      return;
    }
    if (state.screen !== 'playing' || !p) return;
    if (I.pressed('Tab') || I.pressed('KeyN')) toggleOverlay(state, 'map');
    if (I.pressed('KeyI')) toggleOverlay(state, 'inventory');
    if (I.pressed('KeyK')) toggleOverlay(state, 'tech');
    if (I.pressed('KeyC')) toggleOverlay(state, 'craft');
    if (!state.ui || state.ui === 'build') {
      if (I.pressed('KeyH') && SV.inv && SV.inv.quickHeal) SV.inv.quickHeal(state);
      if (I.pressed('KeyF')) p.flashlight = !p.flashlight;
    }
    if (I.pressed('KeyB')) {
      if (state.ui === 'build') exitBuild(state);
      else if (!state.ui && SV.base && SV.base.enterBuild) {
        SV.base.enterBuild(state);
        if (!state.ui) state.ui = 'build';
      }
    }
  }

  function updateClock(state, dt) {
    const c = state.clock;
    c.t += dt;
    const night = c.t >= NIGHT_START;
    if (night && !state._night) { state._night = true; Z.emit('sv:night'); toast('Night falls. Stay close to light.', '#8fa8ff'); play('night'); }
    if (c.t >= DAY_LENGTH) {
      c.t -= DAY_LENGTH;
      newDay(state);
    }
  }
  function newDay(state) {
    state.clock.day++;
    state._night = false;
    state.stats.daysSurvived++;
    Z.emit('sv:day');
    toast('Dawn breaks. Day ' + state.clock.day, '#ffd98a');
  }

  function expireDrops(state, dt) {
    const dr = state.drops;
    for (let i = 0; i < dr.length; i++) {
      const d = dr[i];
      if (d.life !== Infinity) { d.life -= dt; if (d.life <= 0) d.dead = true; }
      if (isEmptyInv(d.inv)) d.dead = true;
    }
    U.compact(dr);
  }

  SV.game = {
    DAY_LENGTH,
    isNight(state) { return state.clock.t >= NIGHT_START; },
    darkness(state) {
      const t = state.clock.t;
      if (t < 330) return 0;
      if (t < NIGHT_START) return 0.9 * smooth((t - 330) / (NIGHT_START - 330));
      if (t < 540) return 0.9;
      return 0.9 * (1 - smooth((t - 540) / (DAY_LENGTH - 540)));
    },
    skipToMorning(state) {
      state = state || Z.state;
      const c = state.clock;
      if (c.t >= NIGHT_START) { c.t = 20; newDay(state); }
      const p = state.player;
      if (p && !p.dead) { p.hp = Math.min(p.maxHp, p.hp + 20); p.stamina = p.maxStamina; }
      save(state);
    },
    timeLabel(state) {
      const hours = (6 + (state.clock.t / DAY_LENGTH) * 24) % 24;
      const h = Math.floor(hours), m = Math.floor((hours - h) * 60);
      return 'Day ' + state.clock.day + ' — ' + (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    },

    newGame() {
      const seed = (Math.random() * 4294967296) >>> 0;
      const state = SV.newState(seed);
      Z.state = state;
      if (SV.world && SV.world.generate) SV.world.generate(state);
      const p = setupPlayer(state);
      const inv = p.inv, eq = inv.equip;
      eq.secondary = { id: 'pistol', qty: 1, mag: 12 };
      eq.melee = { id: 'knife', qty: 1 };
      p.active = 'secondary';
      if (SV.inv && SV.inv.add) {
        SV.inv.add(inv, 'ammo_9mm', 24);
        SV.inv.add(inv, 'bandage', 2);
        SV.inv.add(inv, 'water_bottle', 1);
        SV.inv.add(inv, 'canned_food', 1);
      }
      startState(state);
      toast('You wake up in a ruined city. Find supplies. Survive.', '#e8e8e0');
      toast('WASD move, mouse aim, E search, B build, F flashlight', '#9aa09a');
      save(state);
    },

    continueGame() {
      let data = null;
      try { data = SV.save && SV.save.read ? SV.save.read() : null; } catch (e) { data = null; }
      if (!data) { SV.game.newGame(); return; }
      try {
        const state = SV.newState(data.seed >>> 0);
        Z.state = state;
        if (SV.world && SV.world.generate) SV.world.generate(state);
        setupPlayer(state);
        SV.save.apply(state, data);
        const p = state.player;
        if (!p || !p.inv) { setupPlayer(state); }
        state.player.dead = false;
        if (!(state.player.hp > 0)) state.player.hp = 60;
        startState(state);
        toast('Welcome back. ' + SV.game.timeLabel(state), '#e8e8e0');
      } catch (err) {
        console.error('continue failed', err);
        SV.game.newGame();
      }
    },

    respawn() {
      const s = Z.state;
      if (!s || s.mode !== 'survival' || !s.player) return;
      const p = s.player;
      let pos = s.spawnPoint || { x: 8000, y: 8000 };
      if (s.base && s.base.bed) {
        for (const st of s.structures) if (st.id === s.base.bed) { pos = { x: st.x + (st.w || 0) / 2, y: st.y + (st.h || 0) / 2 + 30 }; break; }
      }
      p.x = pos.x; p.y = pos.y;
      if (SV.phys && SV.phys.collideCircle) SV.phys.collideCircle(s, p);
      p.hp = Math.min(60, p.maxHp || 100); p.food = 60; p.water = 60; p.stamina = p.maxStamina || 100;
      p.dead = false; p.invuln = 2; p.bleeding = 0; p.reloadTimer = 0; p.swingTimer = 0; p.sprinting = false;
      s.search = null; s.interact = null;
      for (const z of s.zombies) if (Math.hypot(z.x - p.x, z.y - p.y) < 500) z.dead = true;
      U.compact(s.zombies);
      s.bullets.length = 0;
      s.screen = 'playing';
      if (ui() && ui().close) ui().close();
      s.ui = null;
      snapCamera(s);
      save(s);
    },

    save() { return save(Z.state); },

    quitToTitle() {
      if (!save(Z.state) && !confirm('Saving failed. Quit anyway and lose unsaved progress?')) return;
      if (ui() && ui().close) { try { ui().close(); } catch (e) { /* ignore */ } }
      if (Z.game && Z.game.toTitle) Z.game.toTitle();
    },

    frame(dt) {
      const state = Z.state;
      if (!state || state.mode !== 'survival') return;
      try {
        handleKeys(state);
        const playing = state.screen === 'playing' && (!state.ui || state.ui === 'build');
        if (playing && state.player) {
          state.time += dt;
          updateClock(state, dt);
          if (SV.player) SV.player.update(state, dt);
          if (!state.player.dead && state.screen === 'playing' && (!state.ui || state.ui === 'build')) {
            if (SV.combat && SV.combat.update) SV.combat.update(state, dt);
            if (SV.zombies && SV.zombies.update) SV.zombies.update(state, dt);
            if (SV.base && SV.base.update) SV.base.update(state, dt);
          }
          if (Z.particles && Z.particles.update) Z.particles.update(state, dt);
          expireDrops(state, dt);
          saveTimer += dt;
          if (saveTimer >= 60) { saveTimer = 0; save(state); }
        } else if (state.screen === 'dead' && Z.particles && Z.particles.update) {
          Z.particles.update(state, dt);
        }
        if (state.player) updateCamera(state, dt);
        state.shake = state.shake > 0.1 ? state.shake * Math.exp(-10 * dt) : 0;
      } catch (err) {
        console.error('sv frame sim error', err);
      }
      try {
        if (SV.render && SV.render.draw) SV.render.draw(state);
      } catch (err) {
        console.error('sv render error', err);
      }
    },
  };

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Tab' && Z.state && Z.state.mode === 'survival') e.preventDefault();
    });
  }
})();
