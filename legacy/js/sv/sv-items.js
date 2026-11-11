(function () {
  'use strict';
  const Z = (window.Z = window.Z || {}), SV = (Z.sv = Z.sv || {});
  const colors = SV.RARITY_COLORS = {
    common: '#bfc5ba', uncommon: '#79bd73', rare: '#70a9df', epic: '#c48ae0'
  };
  const items = SV.ITEMS = {};
  function item(id, name, type, rarity, glyph, desc, extra) {
    items[id] = Object.assign({ id, name, type, rarity, color: colors[rarity], glyph, desc, stack: 1 }, extra);
  }
  [
    ['pistol', '9mm Pistol', 'common', 'P', 'Reliable sidearm using 9mm ammunition.', 'secondary'],
    ['revolver', '.357 Revolver', 'uncommon', 'REV', 'Hard-hitting six-shooter.', 'secondary'],
    ['smg', 'Submachine Gun', 'rare', 'SMG', 'Rapid automatic fire using 9mm ammunition.', 'primary'],
    ['shotgun', 'Pump Shotgun', 'uncommon', 'SG', 'Devastating spread at close range.', 'primary'],
    ['assault_rifle', 'Assault Rifle', 'epic', 'AR', 'Automatic rifle chambered in 5.56mm.', 'primary'],
    ['hunting_rifle', 'Hunting Rifle', 'rare', 'HR', 'Accurate long-range rifle using .308 rounds.', 'primary'],
    ['knife', 'Survival Knife', 'common', 'KN', 'A quick, quiet close-range blade.', 'melee'],
    ['bat', 'Baseball Bat', 'common', 'BAT', 'Heavy wooden club with good reach.', 'melee'],
    ['machete', 'Machete', 'uncommon', 'MC', 'A broad blade for clearing a path.', 'melee']
  ].forEach(r => item(r[0], r[1], 'weapon', r[2], r[3], r[4], { slot: r[5] }));
  [
    ['ammo_9mm', '9mm Rounds', 'common', '9mm', 120, 'Ammunition for pistols and submachine guns.'],
    ['ammo_357', '.357 Rounds', 'uncommon', '357', 90, 'Ammunition for revolvers.'],
    ['ammo_12g', '12 Gauge Shells', 'uncommon', '12g', 60, 'Shotgun ammunition.'],
    ['ammo_556', '5.56mm Rounds', 'rare', '556', 120, 'Assault rifle ammunition.'],
    ['ammo_308', '.308 Rounds', 'rare', '308', 90, 'Hunting rifle ammunition.']
  ].forEach(r => item(r[0], r[1], 'ammo', r[2], r[3], r[5], { stack: r[4] }));
  [
    ['cap', 'Reinforced Cap', 'common', 'CAP', 'head', 0.08, true],
    ['bike_helmet', 'Bike Helmet', 'uncommon', 'BH', 'head', 0.12, true],
    ['riot_helmet', 'Riot Helmet', 'rare', 'RH', 'head', 0.18, false],
    ['military_helmet', 'Military Helmet', 'epic', 'MH', 'head', 0.22, false],
    ['hoodie', 'Padded Hoodie', 'common', 'HD', 'body', 0.08, true],
    ['leather_jacket', 'Leather Jacket', 'uncommon', 'LJ', 'body', 0.15, false],
    ['police_vest', 'Police Vest', 'rare', 'PV', 'body', 0.24, false],
    ['military_vest', 'Military Vest', 'epic', 'MV', 'body', 0.30, false]
  ].forEach(r => item(r[0], r[1], 'armor', r[2], r[3],
    'Reduces incoming damage by ' + Math.round(r[5] * 100) + '% before upgrades.',
    { slot: r[4], armor: r[5], weightless: r[6] }));
  [
    ['small_backpack', 'Small Backpack', 'common', 'BP', 4],
    ['hiking_backpack', 'Hiking Backpack', 'uncommon', 'HB', 8],
    ['military_backpack', 'Military Backpack', 'rare', 'MB', 12]
  ].forEach(r => item(r[0], r[1], 'backpack', r[2], r[3], 'Adds ' + r[4] + ' inventory slots.', { slots: r[4] }));
  [
    ['bandage', 'Bandage', 'common', '+', 10, 'Restores 15 health and stops bleeding.', { heal: 15, stopBleed: true, time: 1 }],
    ['medkit', 'Medical Kit', 'rare', 'MED', 5, 'Restores 60 health.', { heal: 60, time: 2.5 }],
    ['painkillers', 'Painkillers', 'uncommon', 'RX', 10, 'Restores 25 health.', { heal: 25, time: 1 }],
    ['canned_food', 'Canned Food', 'common', 'CAN', 10, 'Restores 35 food.', { food: 35, time: 1.5 }],
    ['chips', 'Chips', 'common', 'CH', 10, 'Restores 15 food.', { food: 15, time: 0.8 }],
    ['mre', 'Field Ration', 'rare', 'MRE', 5, 'Restores 65 food and 10 water.', { food: 65, water: 10, time: 2 }],
    ['water_bottle', 'Water Bottle', 'common', 'H2O', 10, 'Restores 45 water.', { water: 45, time: 1 }],
    ['soda', 'Soda', 'common', 'POP', 10, 'Restores 25 water and 5 food.', { water: 25, food: 5, time: 0.8 }],
    ['energy_drink', 'Energy Drink', 'uncommon', 'NRG', 5, 'Restores 60 stamina and 20 water.', { stamina: 60, water: 20, time: 0.8 }]
  ].forEach(r => item(r[0], r[1], 'consumable', r[2], r[3], r[5], { stack: r[4], use: r[6] }));
  [
    ['scrap', 'Scrap Metal', 'common', 'SC', 50, 'Salvaged metal for ammunition, tools, and construction.'],
    ['wood', 'Wood', 'common', 'WD', 50, 'Timber for structures and barricades.'],
    ['nails', 'Nails', 'common', 'NL', 50, 'Fasteners for construction and crafting.'],
    ['cloth', 'Cloth', 'common', 'CL', 50, 'Clean fabric for bandages and packs.'],
    ['gunpowder', 'Gunpowder', 'uncommon', 'GP', 40, 'Propellant for crafting ammunition.'],
    ['gun_parts', 'Gun Parts', 'rare', 'PTS', 30, 'Precision components for weapon upgrades.'],
    ['electronics', 'Electronics', 'uncommon', 'EL', 30, 'Recovered circuits for advanced equipment.'],
    ['chemicals', 'Chemicals', 'uncommon', 'CHM', 30, 'Medical and industrial reagents.']
  ].forEach(r => item(r[0], r[1], 'material', r[2], r[3], r[5], { stack: r[4] }));
  SV.RECIPES = [
    { id: 'bandage', name: 'Make Bandages', out: { id: 'bandage', qty: 1 }, in: { cloth: 2 }, station: null, time: 1 },
    { id: 'medkit', name: 'Assemble Medical Kit', out: { id: 'medkit', qty: 1 }, in: { bandage: 3, chemicals: 2 }, station: null, time: 3 },
    { id: 'ammo_9mm', name: 'Load 9mm Rounds', out: { id: 'ammo_9mm', qty: 24 }, in: { gunpowder: 2, scrap: 3 }, station: 'workbench', time: 2 },
    { id: 'ammo_357', name: 'Load .357 Rounds', out: { id: 'ammo_357', qty: 12 }, in: { gunpowder: 2, scrap: 3 }, station: 'workbench', time: 2 },
    { id: 'ammo_12g', name: 'Load Shotgun Shells', out: { id: 'ammo_12g', qty: 8 }, in: { gunpowder: 3, scrap: 3 }, station: 'workbench', time: 2 },
    { id: 'ammo_556', name: 'Load 5.56mm Rounds', out: { id: 'ammo_556', qty: 24 }, in: { gunpowder: 4, scrap: 5 }, station: 'workbench', time: 3 },
    { id: 'ammo_308', name: 'Load .308 Rounds', out: { id: 'ammo_308', qty: 12 }, in: { gunpowder: 3, scrap: 4 }, station: 'workbench', time: 3 },
    { id: 'nails', name: 'Forge Nails', out: { id: 'nails', qty: 8 }, in: { scrap: 2 }, station: null, time: 1 },
    { id: 'gun_parts', name: 'Machine Gun Parts', out: { id: 'gun_parts', qty: 1 }, in: { scrap: 12, electronics: 4 }, station: 'workbench', time: 5 },
    { id: 'small_backpack', name: 'Sew Small Backpack', out: { id: 'small_backpack', qty: 1 }, in: { cloth: 10, nails: 2 }, station: null, time: 4 }
  ];
})();
