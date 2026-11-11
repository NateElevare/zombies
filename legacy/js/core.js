// core.js — shared namespace, constants, utilities. Loaded first.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});

  Z.W = window.innerWidth;
  Z.H = window.innerHeight;
  Z.WORLD = { w: 3000, h: 3000 };

  Z.CONFIG = {
    waveBreak: 5,           // seconds between waves
    baseZombies: 6,         // zombies in wave 1
    zombiesPerWave: 4,      // added each wave
    spawnInterval: 0.6,     // seconds between spawns within a wave
    maxAlive: 60,           // cap on simultaneous zombies
    pickupChance: 0.18,     // chance a kill drops something
    pickupLife: 15,         // seconds before pickups vanish
  };

  // ---- tiny event bus ----
  const handlers = {};
  Z.on = function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); };
  Z.emit = function (name, data) {
    const list = handlers[name];
    if (!list) return;
    for (const fn of list) {
      try { fn(data); } catch (err) { console.error('event handler error', name, err); }
    }
  };

  // ---- math utils ----
  Z.util = {
    clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (lo, hi) => lo + Math.random() * (hi - lo),
    randInt: (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1)),
    choice: (arr) => arr[Math.floor(Math.random() * arr.length)],
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    dist2: (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay),
    angle: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
    circlesOverlap: (a, b) => Z.util.dist2(a.x, a.y, b.x, b.y) < (a.r + b.r) * (a.r + b.r),
    // remove dead items in place (avoids per-frame array allocation)
    compact(arr) {
      let j = 0;
      for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
      arr.length = j;
    },
  };

  Z.newState = function () {
    return {
      screen: 'title',
      time: 0,
      player: null, // set by Z.player.create()
      zombies: [],
      bullets: [],
      pickups: [],
      particles: [],
      obstacles: [],
      camera: { x: 0, y: 0 },
      wave: { number: 0, remaining: 0, toSpawn: 0, spawnTimer: 0, breakTimer: 0, inBreak: false },
      stats: { kills: 0, score: 0, shotsFired: 0 },
      shake: 0,
    };
  };

  Z.state = Z.newState();
  Z.canvas = null; // set in main.js
  Z.ctx = null;
})();
