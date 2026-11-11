(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});

  function begin(state, number) {
    const wave = state.wave;
    wave.number = number;
    wave.toSpawn = Z.CONFIG.baseZombies + (number - 1) * Z.CONFIG.zombiesPerWave;
    wave.remaining = wave.toSpawn;
    wave.spawnTimer = 0;
    wave.breakTimer = 0;
    wave.inBreak = false;
    if (Z.emit) Z.emit('waveStart', number);
    if (Z.audio && Z.audio.play) Z.audio.play('waveStart');
  }

  function start(state) {
    begin(state, 1);
  }

  function chooseType(number) {
    const roll = Math.random();
    const bruteChance = number >= 5 ? Math.min(0.25, 0.12 + (number - 5) * 0.01) : 0;
    const runnerChance = number >= 3 ? Math.min(0.4, 0.25 + (number - 3) * 0.015) : 0;
    if (roll < bruteChance) return 'brute';
    if (roll < bruteChance + runnerChance) return 'runner';
    return 'walker';
  }

  function update(state, dt) {
    const wave = state.wave;
    if (wave.number < 1) return;
    if (wave.inBreak) {
      wave.breakTimer = Math.max(0, wave.breakTimer - dt);
      if (wave.breakTimer <= 0) begin(state, wave.number + 1);
      return;
    }

    let alive = 0;
    for (let i = 0; i < state.zombies.length; i++) {
      if (!state.zombies[i].dead) alive++;
    }
    if (wave.toSpawn === 0 && alive === 0) {
      wave.remaining = 0;
      wave.inBreak = true;
      wave.breakTimer = Z.CONFIG.waveBreak;
      if (Z.emit) Z.emit('waveCleared', wave.number);
      return;
    }

    wave.spawnTimer = Math.max(0, wave.spawnTimer - dt);
    if (wave.toSpawn > 0 && wave.spawnTimer <= 0 && alive < Z.CONFIG.maxAlive &&
        Z.world && Z.world.randomOpenPoint && Z.zombies && Z.zombies.spawn) {
      const point = Z.world.randomOpenPoint(500);
      if (!point) return;
      Z.zombies.spawn(state, chooseType(wave.number), point.x, point.y);
      wave.toSpawn--;
      // Cap acceleration so later waves still arrive as a staggered horde.
      wave.spawnTimer = Z.CONFIG.spawnInterval / (1 + Math.min(1, (wave.number - 1) * 0.035));
    }
  }

  Z.waves = { start: start, update: update };
})();
