(function () {
  'use strict';
  const Z = (window.Z = window.Z || {}), SV = (Z.sv = Z.sv || {});
  const KEY = 'deadzone_survival_v1', VERSION = 1;
  const equipment = ['primary', 'secondary', 'melee', 'head', 'body', 'back'];
  const playerFields = ['x', 'y', 'r', 'angle', 'speed', 'hp', 'maxHp', 'stamina', 'maxStamina', 'food', 'water', 'dead', 'active', 'xp', 'level', 'sp', 'tech', 'spawn', 'flashlight', 'bleeding'];
  const structureFields = ['id', 'type', 'x', 'y', 'w', 'h', 'hp', 'maxHp', 'rot'];
  const own = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
  const record = o => !!o && typeof o === 'object' && !Array.isArray(o);
  function copy(value) { return JSON.parse(JSON.stringify(value, (key, v) => typeof v === 'number' && !Number.isFinite(v) ? null : v)); }
  function pick(source, keys) {
    const result = {};
    for (const key of keys) if (own(source, key)) result[key] = copy(source[key]);
    return result;
  }
  function stack(s) {
    if (!record(s) || !SV.ITEMS || !own(SV.ITEMS, s.id) || !Number.isSafeInteger(s.qty) || s.qty <= 0) return null;
    const item = SV.ITEMS[s.id], result = { id: s.id, qty: Math.min(item.stack, s.qty) };
    if (item.type === 'weapon') result.mag = Number.isFinite(s.mag) ? Math.max(0, Math.floor(s.mag)) : 0;
    return result;
  }
  function inventory(data, isPlayer) {
    const size = data && Number.isInteger(data.size) && data.size >= 0 && data.size <= 4096 ? data.size : (isPlayer ? 12 : 0);
    const inv = isPlayer ? SV.inv.createPlayer() : SV.inv.create(size);
    inv.size = size; inv.slots = Array(size).fill(null);
    if (data && Array.isArray(data.slots)) for (let i = 0; i < size; i++) inv.slots[i] = stack(data.slots[i]);
    if (isPlayer && data && record(data.equip)) for (const key of equipment) {
      const s = stack(data.equip[key]), item = s && SV.ITEMS[s.id];
      const slot = item && (item.type === 'backpack' ? 'back' : ['weapon', 'armor'].includes(item.type) ? item.slot : null);
      inv.equip[key] = slot === key ? s : null;
    }
    return inv;
  }
  function valid(data) {
    return record(data) && data.version === VERSION && Number.isInteger(data.seed) && data.seed >= 0 && data.seed <= 4294967295 &&
      record(data.player) && Number.isFinite(data.player.x) && Number.isFinite(data.player.y) &&
      record(data.player.inv) && Array.isArray(data.player.inv.slots);
  }
  const api = SV.save = {
    KEY, VERSION,
    has() { try { return api.read() !== null; } catch (err) { return false; } },
    write(state) {
      try {
        if (!state || !state.player || !state.player.inv) return false;
        const p = state.player;
        const data = {
          version: VERSION, seed: state.seed >>> 0, clock: copy(state.clock), stats: copy(state.stats),
          player: Object.assign(pick(p, playerFields), { inv: inventory(p.inv, true) }),
          containers: {}, drops: [], structures: [], base: copy(state.base || { bed: null })
        };
        for (const c of state.containers || []) if (c.searched) {
          Object.defineProperty(data.containers, c.id, { value: { searched: true, inv: c.inv ? inventory(c.inv, false) : null }, enumerable: true });
        }
        for (const d of state.drops || []) {
          data.drops.push({ id: d.id, x: d.x, y: d.y, r: 12, kind: d.kind === 'deathbag' ? 'deathbag' : 'loot',
            life: d.life === Infinity ? null : d.life, inv: inventory(d.inv, false) });
        }
        for (const s of state.structures || []) {
          const saved = pick(s, structureFields);
          if (s.inv) saved.inv = inventory(s.inv, false);
          data.structures.push(saved);
        }
        if (!valid(data)) return false;
        window.localStorage.setItem(KEY, JSON.stringify(data));
        return true;
      } catch (err) { return false; }
    },
    read() {
      try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return valid(data) ? data : null;
      } catch (err) { return null; }
    },
    clear() { try { window.localStorage.removeItem(KEY); return true; } catch (err) { return false; } },
    apply(state, data) {
      try {
        if (!state || !valid(data)) return false;
        // Decode before mutating the regenerated world. Only persistent fields cross the boundary.
        const source = copy(data), savedPlayer = source.player;
        const fallback = {
          x: savedPlayer.x, y: savedPlayer.y, r: 14, angle: 0, speed: 190,
          hp: 100, maxHp: 100, stamina: 100, maxStamina: 100, food: 100, water: 100,
          active: 'secondary', xp: 0, level: 1, sp: 0, tech: {},
          spawn: copy(state.spawnPoint || { x: savedPlayer.x, y: savedPlayer.y }), flashlight: true, bleeding: 0
        };
        const created = SV.player && SV.player.create ? SV.player.create(savedPlayer.x, savedPlayer.y) : null;
        const player = Object.assign(fallback, created || {}, pick(savedPlayer, playerFields));
        player.inv = inventory(savedPlayer.inv, true);
        Object.assign(player, { invuln: 0, sprinting: false, fireCooldown: 0, reloadTimer: 0, reloadTotal: 0, swingTimer: 0 });
        const drops = (Array.isArray(source.drops) ? source.drops : []).filter(d => record(d) && Number.isFinite(d.x) && Number.isFinite(d.y)).map(d => ({
          id: d.id, x: d.x, y: d.y, r: 12, kind: d.kind === 'deathbag' ? 'deathbag' : 'loot',
          life: d.life === null || d.life === -1 ? Infinity : (Number.isFinite(d.life) ? Math.max(0, d.life) : 600), inv: inventory(d.inv, false)
        }));
        const structures = (Array.isArray(source.structures) ? source.structures : []).filter(s => record(s) && Number.isFinite(s.x) && Number.isFinite(s.y)).map(s => {
          const restored = pick(s, structureFields); if (s.inv) restored.inv = inventory(s.inv, false); return restored;
        });
        state.seed = source.seed >>> 0;
        state.player = player;
        if (record(source.clock)) state.clock = Object.assign({}, state.clock, source.clock);
        if (record(source.stats)) state.stats = Object.assign({}, state.stats, source.stats);
        const containers = record(source.containers) ? source.containers : {};
        for (const c of state.containers || []) if (own(containers, c.id) && record(containers[c.id])) {
          const saved = containers[c.id]; c.searched = !!saved.searched; c.inv = saved.inv ? inventory(saved.inv, false) : null;
        }
        state.drops = drops;
        if (SV.base && SV.base.restore) SV.base.restore(state, structures);
        else state.structures = structures;
        state.base = record(source.base) ? source.base : { bed: null };
        // Zombies are not saved; restart the night's horde once on continue.
        if (SV.game && SV.game.isNight && SV.game.isNight(state)) delete state.base.hordeDay;
        state.screen = player.dead ? 'dead' : 'playing'; state.ui = null;
        state.interact = null; state.search = null; state.shake = 0;
        state.zombies = []; state.bullets = []; state.particles = [];
        state.camera = { x: player.x, y: player.y };
        SV.inv.recalcSize(state);
        return true;
      } catch (err) { return false; }
    }
  };
})();
