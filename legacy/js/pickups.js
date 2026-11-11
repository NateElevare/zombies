(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const DEFAULT_MAGS = { pistol: 12, shotgun: 6, smg: 30 };

  function magSize(type) {
    return Z.WEAPONS && Z.WEAPONS[type] ? Z.WEAPONS[type].magSize : DEFAULT_MAGS[type];
  }

  function spawn(state, type, x, y) {
    const pickup = {
      x: x, y: y, type: type, life: Z.CONFIG.pickupLife, r: 12, dead: false
    };
    state.pickups.push(pickup);
    return pickup;
  }

  function drop(state, x, y) {
    if (Math.random() >= Z.CONFIG.pickupChance) return;
    const roll = Math.random();
    const type = roll < 0.45 ? 'ammo' : roll < 0.8 ? 'health' : roll < 0.9 ? 'shotgun' : 'smg';
    return spawn(state, type, x, y);
  }

  function collect(state, pickup) {
    const player = state.player;
    const type = pickup.type;
    if (type === 'health') {
      player.hp = Math.min(player.maxHp, player.hp + 30);
    } else if (type === 'ammo') {
      Object.keys(player.weapons).forEach(function (name) {
        const weapon = player.weapons[name];
        if (name !== 'pistol' && weapon.owned) {
          weapon.reserve += Math.ceil(magSize(name) * 1.5);
        }
      });
    } else if (type === 'shotgun' || type === 'smg') {
      const weapon = player.weapons[type] || { owned: false, mag: 0, reserve: 0 };
      player.weapons[type] = weapon;
      weapon.owned = true;
      weapon.mag = magSize(type);
      weapon.reserve += magSize(type) * 2;
      player.current = type;
      player.reloadTimer = 0;
    }
    pickup.dead = true;
    if (Z.emit) Z.emit('pickup', type);
    if (Z.audio && Z.audio.play) Z.audio.play('pickup');
  }

  function update(state, dt) {
    const player = state.player;
    for (let i = 0; i < state.pickups.length; i++) {
      const pickup = state.pickups[i];
      if (pickup.dead) continue;
      pickup.life -= dt;
      if (pickup.life <= 0) {
        pickup.dead = true;
        continue;
      }
      if (!player || player.hp <= 0) continue;
      const dx = player.x - pickup.x;
      const dy = player.y - pickup.y;
      const radius = player.r + pickup.r;
      if (dx * dx + dy * dy <= radius * radius) collect(state, pickup);
    }
    if (Z.util && Z.util.compact) Z.util.compact(state.pickups);
  }

  Z.pickups = { drop: drop, spawn: spawn, update: update };
})();
