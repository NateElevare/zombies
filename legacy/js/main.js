// main.js — boot, game loop, screen state, camera.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const U = Z.util;
  let last = 0;

  function resize() {
    Z.W = window.innerWidth;
    Z.H = window.innerHeight;
    if (Z.canvas) { Z.canvas.width = Z.W; Z.canvas.height = Z.H; }
  }

  function showScreen(name) { if (Z.ui && Z.ui.showScreen) Z.ui.showScreen(name); }

  function snapCamera(state) {
    const p = state.player;
    if (!p) return;
    state.camera.x = clampCam(p.x - Z.W / 2, Z.W, Z.WORLD.w);
    state.camera.y = clampCam(p.y - Z.H / 2, Z.H, Z.WORLD.h);
  }

  function clampCam(v, view, world) {
    if (view >= world) return (world - view) / 2;
    return U.clamp(v, 0, world - view);
  }

  function updateCamera(state, dt) {
    const p = state.player;
    if (!p) return;
    const k = 1 - Math.exp(-8 * dt);
    const tx = clampCam(p.x - Z.W / 2, Z.W, Z.WORLD.w), ty = clampCam(p.y - Z.H / 2, Z.H, Z.WORLD.h);
    state.camera.x += (tx - state.camera.x) * k;
    state.camera.y += (ty - state.camera.y) * k;
  }

  Z.game = {
    start() {
      Z.state = Z.newState();
      const s = Z.state;
      Z.world.generate(s);
      s.player = Z.player.create();
      snapCamera(s);
      if (Z.waves && Z.waves.start) Z.waves.start(s);
      s.screen = 'playing';
      showScreen('playing');
    },
    pause() {
      if (Z.state.screen !== 'playing') return;
      Z.state.screen = 'paused';
      showScreen('paused');
    },
    resume() {
      if (Z.state.screen !== 'paused') return;
      showScreen('playing'); // ui checks state.screen === 'paused' here, so switch after
      Z.state.screen = 'playing';
    },
    gameOver() {
      const s = Z.state;
      if (s.screen !== 'playing') return;
      s.screen = 'gameover';
      try {
        const best = parseInt(localStorage.getItem('deadzone_best') || '0', 10) || 0;
        if (s.stats.score > best) localStorage.setItem('deadzone_best', String(s.stats.score));
      } catch (e) { /* storage unavailable */ }
      if (Z.audio && Z.audio.play) Z.audio.play('gameOver');
      showScreen('gameover');
    },
    // Return to the title screen from any mode (used by survival's quit).
    toTitle() {
      Z.state = Z.newState();
      Z.world.generate(Z.state);
      Z.state.camera.x = (Z.WORLD.w - Z.W) / 2;
      Z.state.camera.y = (Z.WORLD.h - Z.H) / 2;
      Z.state.screen = 'title';
      showScreen('title');
      if (Z.sv && Z.sv.ui && Z.sv.ui.refreshTitle) Z.sv.ui.refreshTitle();
    },
  };

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    const s = Z.state, I = Z.input;
    const cam = s.camera;
    I.mouse.worldX = I.mouse.x + cam.x;
    I.mouse.worldY = I.mouse.y + cam.y;

    // Survival mode runs its own loop (js/sv/sv-game.js).
    if (s.mode === 'survival') {
      try {
        Z.sv.game.frame(dt);
      } catch (err) {
        console.error('survival frame error', err);
      }
      I.endFrame();
      return;
    }

    if (I.pressed('Escape') || I.pressed('KeyP')) {
      if (s.screen === 'playing') Z.game.pause();
      else if (s.screen === 'paused') Z.game.resume();
    }

    if (s.screen === 'playing') {
      s.time += dt;
      Z.player.update(s, dt);
      Z.weapons.update(s, dt);
      if (Z.zombies && Z.zombies.update) Z.zombies.update(s, dt);
      if (Z.pickups && Z.pickups.update) Z.pickups.update(s, dt);
      if (Z.waves && Z.waves.update) Z.waves.update(s, dt);
      Z.particles.update(s, dt);
      updateCamera(s, dt);
      if (Z.ui && Z.ui.update) Z.ui.update(s);
    } else if (s.screen === 'title' || s.screen === 'gameover') {
      // attract mode: drift the camera around the map and keep particles alive
      const t = now / 1000 * 0.05;
      const tx = Z.WORLD.w / 2 + Math.cos(t) * 700 - Z.W / 2, ty = Z.WORLD.h / 2 + Math.sin(t * 1.3) * 700 - Z.H / 2;
      cam.x += (clampCam(tx, Z.W, Z.WORLD.w) - cam.x) * Math.min(1, dt * 2);
      cam.y += (clampCam(ty, Z.H, Z.WORLD.h) - cam.y) * Math.min(1, dt * 2);
      Z.particles.update(s, dt);
    }

    s.shake = s.shake > 0.1 ? s.shake * Math.exp(-10 * dt) : 0;
    Z.render.draw(s);
    I.endFrame();
  }

  window.addEventListener('load', () => {
    let canvas = document.getElementById('game');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'game';
      document.body.appendChild(canvas);
    }
    Z.canvas = canvas;
    Z.ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    Z.input.init(canvas);
    if (Z.ui && Z.ui.init) Z.ui.init();
    if (Z.sv && Z.sv.ui && Z.sv.ui.init) {
      try { Z.sv.ui.init(); } catch (err) { console.error('survival ui init failed', err); }
    }

    // audio unlock on first gesture (ui.js also does this; init is expected to be idempotent)
    const unlock = () => { if (Z.audio && Z.audio.init) Z.audio.init(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    Z.on('playerDied', () => Z.game.gameOver());

    // attract-mode background world (no player)
    Z.world.generate(Z.state);
    Z.state.camera.x = (Z.WORLD.w - Z.W) / 2;
    Z.state.camera.y = (Z.WORLD.h - Z.H) / 2;
    showScreen('title');

    last = performance.now();
    requestAnimationFrame(frame);
  });
})();
