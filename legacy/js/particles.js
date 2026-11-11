// particles.js — blood, sparks, muzzle flash.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const U = Z.util;
  const MAX = 700;

  function add(x, y, vx, vy, life, color, size) {
    const list = Z.state.particles;
    if (list.length >= MAX) return;
    list.push({ x, y, vx, vy, life, maxLife: life, color, size });
  }

  Z.particles = {
    blood(x, y, count) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, s = U.rand(40, 220);
        add(x, y, Math.cos(a) * s, Math.sin(a) * s, U.rand(0.4, 1.1), Math.random() < 0.5 ? '#7a0f0f' : '#a01515', U.rand(2, 4.5));
      }
    },
    spark(x, y, count) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, s = U.rand(60, 260);
        add(x, y, Math.cos(a) * s, Math.sin(a) * s, U.rand(0.1, 0.3), Math.random() < 0.5 ? '#ffd36b' : '#fff3c0', U.rand(1.5, 2.5));
      }
    },
    muzzle(x, y, angle) {
      for (let i = 0; i < 5; i++) {
        const a = angle + U.rand(-0.3, 0.3), s = U.rand(100, 320);
        add(x, y, Math.cos(a) * s, Math.sin(a) * s, U.rand(0.05, 0.14), i < 2 ? '#ffffff' : '#ffb347', U.rand(2, 4));
      }
    },
    update(state, dt) {
      const list = state.particles, f = Math.pow(0.02, dt);
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) { p.dead = true; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= f; p.vy *= f;
      }
      U.compact(list);
    },
  };
})();
