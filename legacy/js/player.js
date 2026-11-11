// player.js — player entity: movement, aiming, weapon switching, damage.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const U = Z.util;

  Z.player = {
    create() {
      return {
        x: Z.WORLD.w / 2, y: Z.WORLD.h / 2, r: 14, angle: 0, speed: 200, hp: 100, maxHp: 100, invuln: 0, dead: false,
        weapons: {
          pistol: { owned: true, mag: 12, reserve: Infinity },
          shotgun: { owned: false, mag: 0, reserve: 0 },
          smg: { owned: false, mag: 0, reserve: 0 },
        },
        current: 'pistol', reloadTimer: 0, reloadWeapon: null, fireCooldown: 0,
      };
    },
    update(state, dt) {
      const p = state.player, I = Z.input;
      if (!p || p.dead) return;
      let mx = 0, my = 0;
      if (I.keys.KeyW || I.keys.ArrowUp) my -= 1;
      if (I.keys.KeyS || I.keys.ArrowDown) my += 1;
      if (I.keys.KeyA || I.keys.ArrowLeft) mx -= 1;
      if (I.keys.KeyD || I.keys.ArrowRight) mx += 1;
      if (mx || my) {
        const l = Math.hypot(mx, my);
        p.x += (mx / l) * p.speed * dt;
        p.y += (my / l) * p.speed * dt;
      }
      Z.world.collideCircle(p);
      p.x = U.clamp(p.x, p.r, Z.WORLD.w - p.r);
      p.y = U.clamp(p.y, p.r, Z.WORLD.h - p.r);
      p.angle = Math.atan2(I.mouse.worldY - p.y, I.mouse.worldX - p.x);

      // weapon switching (only owned weapons)
      const names = ['pistol', 'shotgun', 'smg'];
      for (let i = 0; i < 3; i++) {
        if (I.pressed('Digit' + (i + 1)) || I.pressed('Numpad' + (i + 1))) {
          const k = names[i];
          if (p.weapons[k].owned && p.current !== k) {
            p.current = k;
            Z.weapons.cancelReload(state);
            p.fireCooldown = Math.max(p.fireCooldown, 0.15);
          }
        }
      }
      if (I.pressed('KeyR')) Z.weapons.startReload(state);
      if (I.mouse.down || I.pressed('Mouse0')) Z.weapons.tryFire(state);
      if (p.invuln > 0) p.invuln -= dt;
    },
    damage(state, amount) {
      const p = state.player;
      if (!p || p.dead || p.invuln > 0) return;
      p.hp -= amount;
      p.invuln = 0.4;
      state.shake = Math.max(state.shake, 10);
      if (Z.particles) Z.particles.blood(p.x, p.y, 8);
      if (Z.audio && Z.audio.play) Z.audio.play('playerHurt');
      Z.emit('playerHurt', amount);
      if (p.hp <= 0) { p.hp = 0; p.dead = true; Z.emit('playerDied'); }
    },
  };
})();
