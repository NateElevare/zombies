(function () {
  'use strict';
  const Z = (window.Z = window.Z || {}), SV = (Z.sv = Z.sv || {});
  const entry = (id, w, min, max) => ({ id, w, min: min || 1, max: max || min || 1 });
  const food = [entry('canned_food', 8, 1, 3), entry('chips', 7, 1, 3), entry('water_bottle', 9, 1, 3), entry('soda', 6, 1, 3), entry('energy_drink', 3, 1, 2), entry('mre', 2)];
  const medical = [entry('bandage', 12, 1, 4), entry('medkit', 5, 1, 2), entry('painkillers', 8, 1, 3), entry('chemicals', 6, 1, 4), entry('cloth', 4, 2, 6)];
  const materials = [entry('scrap', 12, 3, 12), entry('wood', 10, 3, 12), entry('nails', 8, 3, 10), entry('cloth', 7, 2, 8), entry('gunpowder', 6, 2, 5), entry('electronics', 4, 1, 4), entry('chemicals', 4, 1, 4), entry('gun_parts', 3, 1, 2)];
  const ammo = [entry('ammo_9mm', 12, 8, 24), entry('ammo_357', 7, 6, 18), entry('ammo_12g', 8, 4, 12), entry('ammo_556', 7, 10, 30), entry('ammo_308', 5, 6, 16)];
  const guns = [entry('pistol', 9), entry('revolver', 6), entry('shotgun', 6), entry('smg', 5), entry('hunting_rifle', 4), entry('assault_rifle', 4)];
  const clothes = [entry('cloth', 10, 2, 6), entry('cap', 6), entry('hoodie', 7), entry('bike_helmet', 4), entry('leather_jacket', 4), entry('small_backpack', 5), entry('hiking_backpack', 3), entry('military_backpack', 1)];
  const tactical = [entry('police_vest', 6), entry('riot_helmet', 5), entry('military_vest', 4), entry('military_helmet', 4), entry('military_backpack', 4)];
  const household = food.concat([entry('cloth', 12, 2, 7), entry('bandage', 4, 1, 2), entry('scrap', 4, 1, 4), entry('knife', 2), entry('bat', 2)]);
  const tables = {
    cabinet: household,
    fridge: food,
    desk: [entry('scrap', 6, 1, 5), entry('electronics', 8, 1, 3), entry('cloth', 4, 1, 4), entry('painkillers', 2), entry('ammo_9mm', 2, 4, 12), entry('soda', 3)],
    wardrobe: clothes,
    crate: materials,
    locker: clothes.concat(ammo, [entry('bat', 4), entry('machete', 3), entry('police_vest', 3), entry('riot_helmet', 2)]),
    weapon_case: guns.concat(ammo, tactical, [entry('gun_parts', 6, 1, 3), entry('machete', 4)]),
    medical_cabinet: medical,
    dumpster: [entry('scrap', 14, 1, 6), entry('cloth', 10, 1, 4), entry('wood', 9, 1, 6), entry('nails', 5, 1, 5), entry('chips', 3), entry('water_bottle', 2)],
    car_trunk: materials.concat(food, [entry('pistol', 2), entry('shotgun', 1), entry('bandage', 4, 1, 3), entry('small_backpack', 3)]),
    toolbox: [entry('scrap', 12, 3, 10), entry('nails', 12, 3, 12), entry('electronics', 6, 1, 4), entry('gun_parts', 2, 1, 2), entry('wood', 5, 2, 6)],
    shelf: food.concat(materials)
  };
  const districtTables = {
    house: household, store: food, gas_station: food.concat([entry('scrap', 5, 2, 6), entry('chemicals', 3, 1, 3)]),
    warehouse: materials, office: tables.desk, school: food.concat(clothes),
    hospital: medical, gun_store: guns.concat(ammo, tactical, [entry('gun_parts', 8, 1, 3)]),
    police: guns.concat(ammo, tactical),
    military: [entry('assault_rifle', 10), entry('smg', 6), entry('hunting_rifle', 3), entry('ammo_556', 14, 15, 40), entry('ammo_9mm', 8, 15, 35), entry('ammo_308', 5, 10, 24), entry('mre', 5, 1, 3), entry('medkit', 3), entry('gun_parts', 6, 1, 4)].concat(tactical)
  };
  const fallbackMags = { pistol: 12, revolver: 6, smg: 30, shotgun: 6, assault_rifle: 30, hunting_rifle: 5 };
  const rarityRank = { common: 0, uncommon: 1, rare: 2, epic: 3 };
  let serial = 0;
  function luck(state) {
    const mods = state && state.player && SV.prog && SV.prog.playerMods ? SV.prog.playerMods(state) : null;
    return mods && Number.isFinite(mods.lootLuck) ? Math.max(0, mods.lootLuck) : 0;
  }
  function randomFor(state, id) {
    if (SV.makeRng && SV.hash) return SV.makeRng(((state && state.seed) || 0) ^ SV.hash(String(id))).next;
    return Math.random;
  }
  function choose(table, tier, bonus, random) {
    const weighted = table.filter(e => SV.ITEMS && SV.ITEMS[e.id]).map(e => {
      const rank = rarityRank[SV.ITEMS[e.id].rarity] || 0;
      // Higher tiers and luck shift relative probability toward rare equipment.
      const factor = rank ? Math.pow(0.38 + tier * 0.44 + bonus, rank) : 1;
      return { entry: e, weight: e.w * factor };
    });
    let roll = random() * weighted.reduce((n, e) => n + e.weight, 0);
    for (const e of weighted) { roll -= e.weight; if (roll <= 0) return e.entry; }
    return weighted.length ? weighted[weighted.length - 1].entry : null;
  }
  function stackFor(e, tier, random) {
    const item = SV.ITEMS[e.id];
    const qty = Math.min(item.stack, Math.max(1, Math.floor((e.min + Math.floor(random() * (e.max - e.min + 1))) * (item.stack > 1 ? 1 + tier * 0.2 : 1))));
    const stack = { id: e.id, qty };
    if (item.type === 'weapon') {
      const weapon = SV.WEAPONS && SV.WEAPONS[e.id];
      const cap = weapon && Number.isFinite(weapon.magSize) ? weapon.magSize : fallbackMags[e.id] || 0;
      stack.mag = cap > 1 ? Math.min(cap - 1, Math.max(1, Math.floor(cap * (0.2 + random() * 0.5)))) : 0;
    }
    return stack;
  }
  const api = SV.loot = {
    TABLES: tables,
    fill(container) {
      if (!container) return null;
      if (container.inv) return container.inv;
      const state = Z.state, tier = Math.max(0, Math.min(3, Math.floor(container.tier || 0)));
      const random = randomFor(state, container.id), bonus = luck(state);
      let table = tables[container.kind] || household;
      const building = state && Array.isArray(state.buildings) && state.buildings.find(b => b.id === container.buildingId);
      const kind = container.buildingKind || (building && building.kind);
      // Dedicated containers retain their role; generic containers reflect their building.
      if (districtTables[kind] && !['medical_cabinet', 'weapon_case', 'fridge', 'toolbox', 'dumpster'].includes(container.kind)) table = districtTables[kind];
      const inv = SV.inv.create(8);
      const rolls = Math.min(5, 1 + Math.floor(random() * 4) + (random() < tier * 0.22 + Math.min(0.3, bonus * 0.2) ? 1 : 0));
      for (let i = 0; i < rolls; i++) {
        const selected = choose(table, tier, bonus, random);
        if (selected) { const s = stackFor(selected, tier, random); SV.inv.add(inv, s.id, s.qty, s); }
      }
      container.inv = inv;
      return inv;
    },
    makeDrop(state, x, y, stacks, kind) {
      if (!state || !Array.isArray(stacks)) return null;
      const valid = stacks.filter(s => s && SV.ITEMS && SV.ITEMS[s.id] && Number.isSafeInteger(s.qty) && s.qty > 0);
      if (!valid.length) return null;
      const size = valid.reduce((n, s) => n + Math.ceil(s.qty / SV.ITEMS[s.id].stack), 0);
      const inv = SV.inv.create(size);
      valid.forEach(s => SV.inv.add(inv, s.id, s.qty, s));
      const drop = {
        id: SV.uid ? SV.uid('drop') : 'drop' + Date.now().toString(36) + serial++, x, y, r: 12, inv,
        life: kind === 'deathbag' ? Infinity : 600, kind: kind === 'deathbag' ? 'deathbag' : 'loot'
      };
      if (!Array.isArray(state.drops)) state.drops = [];
      state.drops.push(drop);
      return drop;
    },
    zombieDrop(state, zombie) {
      if (!state || !zombie) return null;
      const bonus = luck(state), heavy = zombie.type === 'brute' || zombie.type === 'bloater';
      if (Math.random() >= Math.min(0.65, (heavy ? 0.30 : 0.15) * (1 + bonus))) return null;
      const table = [entry('ammo_9mm', 12, 3, 10), entry('ammo_357', 4, 2, 6), entry('ammo_12g', 4, 2, 5), entry('ammo_556', 4, 4, 10), entry('ammo_308', 3, 2, 6), entry('scrap', 10, 1, 4), entry('cloth', 10, 1, 3), entry('gunpowder', 4, 1, 3), entry('bandage', 2), entry('gun_parts', 1)];
      const selected = choose(table, heavy ? 1 : 0, bonus, Math.random);
      return selected ? api.makeDrop(state, zombie.x, zombie.y, [stackFor(selected, 0, Math.random)]) : null;
    }
  };
})();
