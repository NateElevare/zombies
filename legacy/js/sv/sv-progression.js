// sv-progression.js — XP, levels, tech trees, computed weapon/player stats. Owned by COMBAT agent.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const SV = (Z.sv = Z.sv || {});

  // Cost by tier: 1 = 1 SP | 2 = 1 SP + scrap | 3 = 2 SP + gun_parts | 4 (capstone) = 3 SP + gun_parts + electronics
  const COSTS = {
    1: () => ({ sp: 1, items: {} }),
    2: () => ({ sp: 1, items: { scrap: 6 } }),
    3: () => ({ sp: 2, items: { gun_parts: 1, scrap: 8 } }),
    4: (extra) => ({ sp: 3, items: Object.assign({ gun_parts: 2 }, extra || { electronics: 2 }) }),
  };
  function mk(tree) {
    return function (key, name, desc, col, row, tier, requires, effect, cost) {
      return {
        id: tree + '_' + key, name, desc, tier, col, row, effect,
        requires: (requires || []).map((r) => tree + '_' + r),
        cost: cost || COSTS[tier](),
      };
    };
  }
  function weaponTree(id, name, icon, defs) {
    return { id, name, icon, workbench: true, nodes: defs(mk(id)) };
  }

  const TREES = [
    weaponTree('handgun', 'Handguns', 'P', (t) => [
      t('dmg1', 'Hot Loads I', '+15% damage.', 1, 0, 1, [], { dmg: 0.15 }),
      t('reload1', 'Quick Hands', 'Reload 20% faster.', 0, 1, 2, ['dmg1'], { reload: 0.2 }),
      t('stab', 'Steady Grip', 'Spread -30%.', 1, 1, 2, ['dmg1'], { spread: 0.3 }),
      t('mag1', 'Extended Mag', '+4 rounds per magazine (+2 revolver).', 2, 1, 2, ['dmg1'], { magAdd: 4 }),
      t('dmg2', 'Hot Loads II', '+20% damage.', 0, 2, 2, ['reload1'], { dmg: 0.2 }),
      t('rate', 'Trigger Job', 'Fire rate +25%.', 1, 2, 3, ['stab'], { rate: 0.25 }),
      t('crit', 'Dead Eye', '12% chance for double damage.', 2, 2, 3, ['mag1'], { crit: 0.12 }),
      t('burst', 'Double Tap', 'Each trigger pull fires 2 rounds in quick succession (uses 2 rounds).', 0, 3, 4, ['dmg2', 'rate'], { burst: 2 }),
      t('pierce', 'Hollow Points', 'Bullets pass through 1 extra zombie and hit 15% harder.', 2, 3, 4, ['rate', 'crit'], { pierce: 1, dmg: 0.15 }),
    ]),
    weaponTree('smg', 'SMGs', 'S', (t) => [
      t('dmg1', 'Hot Loads I', '+15% damage.', 1, 0, 1, [], { dmg: 0.15 }),
      t('stab', 'Recoil Springs', 'Spread -30%.', 0, 1, 2, ['dmg1'], { spread: 0.3 }),
      t('reload1', 'Speed Loader', 'Reload 20% faster.', 1, 1, 2, ['dmg1'], { reload: 0.2 }),
      t('mag1', 'Extended Drum', '+15 rounds per magazine.', 2, 1, 2, ['dmg1'], { magAdd: 15 }),
      t('dmg2', 'Hot Loads II', '+20% damage.', 0, 2, 2, ['stab'], { dmg: 0.2 }),
      t('rate', 'Hair Trigger', 'Fire rate +20%.', 1, 2, 3, ['reload1'], { rate: 0.2 }),
      t('mag2', 'Casket Magazine', '+20 more rounds per magazine.', 2, 2, 3, ['mag1'], { magAdd: 20 }),
      t('ricochet', 'Ricochet Rounds', 'Bullets bounce off walls once.', 0, 3, 4, ['dmg2', 'rate'], { ricochet: 1 }),
      t('dmg3', 'Overpressure', '+30% damage, 8% crit chance.', 2, 3, 4, ['rate', 'mag2'], { dmg: 0.3, crit: 0.08 }),
    ]),
    weaponTree('shotgun', 'Shotguns', 'G', (t) => [
      t('dmg1', 'Heavy Shot I', '+15% damage.', 1, 0, 1, [], { dmg: 0.15 }),
      t('reload1', 'Shell Loops', 'Reload 20% faster.', 0, 1, 2, ['dmg1'], { reload: 0.2 }),
      t('choke', 'Tight Choke', 'Spread -35%.', 1, 1, 2, ['dmg1'], { spread: 0.35 }),
      t('mag1', 'Tube Extension', '+2 shells.', 2, 1, 2, ['dmg1'], { magAdd: 2 }),
      t('pellets', 'Magnum Load', '+2 pellets per shot.', 0, 2, 3, ['reload1'], { pellets: 2 }),
      t('rate', 'Pump Action', 'Fire rate +25%.', 1, 2, 3, ['choke'], { rate: 0.25 }),
      t('dmg2', 'Heavy Shot II', '+25% damage.', 2, 2, 2, ['mag1'], { dmg: 0.25 }),
      t('dragon', 'Dragon Breath', 'Pellets ignite zombies.', 0, 3, 4, ['pellets'], { incendiary: true }),
      t('slug', 'Slug Mode', 'Fire a single heavy, tight slug that pierces 1 zombie.', 1, 3, 4, ['rate', 'choke'], { slug: true, pierce: 1 }),
      t('mag2', 'Drum Feed', '+4 more shells, reload 15% faster.', 2, 3, 4, ['dmg2'], { magAdd: 4, reload: 0.15 }),
    ]),
    weaponTree('rifle', 'Rifles', 'R', (t) => [
      t('dmg1', 'Match Grade I', '+15% damage.', 1, 0, 1, [], { dmg: 0.15 }),
      t('reload1', 'Speed Reload', 'Reload 20% faster.', 0, 1, 2, ['dmg1'], { reload: 0.2 }),
      t('stab', 'Bipod Stability', 'Spread -35%.', 1, 1, 2, ['dmg1'], { spread: 0.35 }),
      t('mag1', 'High-Cap Mag', '+10 rounds (assault rifle), +3 (hunting rifle).', 2, 1, 2, ['dmg1'], { magAdd: 10, magAddBolt: 3 }),
      t('dmg2', 'Match Grade II', '+25% damage.', 0, 2, 2, ['reload1'], { dmg: 0.25 }),
      t('rate', 'Action Tune', 'Fire rate +20%.', 1, 2, 3, ['stab'], { rate: 0.2 }),
      t('ap', 'Armor-Piercing', 'Bullets pierce 2 extra zombies.', 2, 2, 3, ['mag1'], { pierce: 2 }),
      t('explosive', 'Explosive Rounds', 'Bullets detonate on impact (small radius).', 0, 3, 4, ['dmg2', 'rate'], { explosive: 70 }),
      t('marksman', 'Marksman', '25% crit chance, +15% damage.', 1, 3, 4, ['rate'], { crit: 0.25, dmg: 0.15 }),
      t('dmg3', 'Match Grade III', '+35% damage.', 2, 3, 4, ['ap'], { dmg: 0.35 }),
    ]),
    weaponTree('melee', 'Melee', 'M', (t) => [
      t('dmg1', 'Brute Force I', '+20% melee damage.', 1, 0, 1, [], { dmg: 0.2 }),
      t('speed1', 'Quick Swing', 'Swing speed +20%.', 0, 1, 2, ['dmg1'], { rate: 0.2 }),
      t('arc1', 'Wide Swing', 'Swing arc +30%.', 1, 1, 2, ['dmg1'], { arc: 0.3 }),
      t('knock', 'Heavy Hands', 'Knockback +50%, reach +10%.', 2, 1, 2, ['dmg1'], { knock: 0.5, range: 0.1 }),
      t('dmg2', 'Brute Force II', '+30% melee damage.', 0, 2, 2, ['speed1'], { dmg: 0.3 }),
      t('crit', 'Killing Blow', '15% chance for double damage.', 1, 2, 3, ['arc1'], { crit: 0.15 }),
      t('speed2', 'Flurry', 'Swing speed +25%.', 2, 2, 3, ['knock'], { rate: 0.25 }),
      t('lifesteal', 'Bloodthirst', 'Heal 8% of melee damage dealt.', 0, 3, 4, ['dmg2', 'crit'], { lifesteal: 0.08 }, COSTS[4]({ cloth: 4 })),
      t('arc2', 'Whirlwind', 'Swing arc +60%, damage +15%.', 2, 3, 4, ['crit', 'speed2'], { arc: 0.6, dmg: 0.15 }),
    ]),
    {
      id: 'armor', name: 'Armor & Defense', icon: 'A', workbench: true,
      nodes: (function () {
        const t = mk('armor');
        return [
          t('hp1', 'Tough I', '+15 max HP.', 1, 0, 1, [], { maxHp: 15 }),
          t('eff1', 'Fitted Plates', 'Equipped armor +20% effective.', 0, 1, 2, ['hp1'], { armorMul: 0.2 }),
          t('dr1', 'Padding', 'Flat damage reduction 5%.', 1, 1, 2, ['hp1'], { dmgReduction: 0.05 }),
          t('bleed1', 'Clotting', 'Bleed resistance +30%.', 2, 1, 2, ['hp1'], { bleedResist: 0.3 }),
          t('hp2', 'Tough II', '+20 max HP.', 0, 2, 2, ['eff1'], { maxHp: 20 }),
          t('regen', 'Second Wind', 'Regenerate 1 HP/s after 6s out of combat.', 1, 2, 3, ['dr1'], { regen: 1 }),
          t('thorns', 'Barbed Wear', 'Zombies hitting you take 12 damage.', 2, 2, 3, ['bleed1'], { thorns: 12 }),
          t('eff2', 'Reinforced', 'Equipped armor +35% effective.', 0, 3, 3, ['hp2'], { armorMul: 0.35 }),
          t('dr2', 'Juggernaut', 'Damage reduction +10%, +25 max HP.', 1, 3, 4, ['regen', 'eff2'], { dmgReduction: 0.1, maxHp: 25 }),
          t('regen2', 'Adrenal Gland', 'Regen +1.5 HP/s, bleed resistance +40%.', 2, 3, 4, ['regen', 'thorns'], { regen: 1.5, bleedResist: 0.4 }),
        ];
      })(),
    },
    {
      id: 'survival', name: 'Survival', icon: 'V', workbench: false,
      nodes: (function () {
        const t = mk('survival');
        return [
          t('pack1', 'Pack Rat I', '+2 inventory slots.', 1, 0, 1, [], { invSlots: 2 }),
          t('stam1', 'Lungs', '+25 max stamina.', 0, 1, 1, ['pack1'], { maxStamina: 25 }),
          t('hunger1', 'Efficient Metabolism', 'Hunger and thirst 20% slower.', 1, 1, 1, ['pack1'], { hungerMult: 0.2 }),
          t('search1', 'Quick Fingers', 'Search 25% faster.', 2, 1, 1, ['pack1'], { searchMult: 0.25 }),
          t('stam2', 'Second Lungs', 'Stamina regenerates 40% faster, +25 max stamina.', 0, 2, 2, ['stam1'], { maxStamina: 25, staminaRegen: 0.4 }),
          t('pack2', 'Pack Rat II', '+4 inventory slots.', 1, 2, 2, ['hunger1'], { invSlots: 4 }),
          t('luck1', 'Scavenger', 'Better loot luck, search 10% faster.', 2, 2, 2, ['search1'], { lootLuck: 0.25, searchMult: 0.1 }),
          t('sneak', 'Soft Steps', 'Your noise radius is 30% smaller.', 0, 3, 3, ['stam2'], { noise: 0.3 }),
          t('hunger2', 'Camel', 'Hunger/thirst 25% slower, +5% move speed.', 1, 3, 3, ['pack2'], { hungerMult: 0.25, speed: 0.05 }),
          t('luck2', 'Lucky Find', 'Much better loot luck, search 15% faster.', 2, 3, 3, ['luck1'], { lootLuck: 0.5, searchMult: 0.15 }),
        ];
      })(),
    },
  ];

  const NODES = {};
  const TREE_OF = {};
  for (const tr of TREES) for (const n of tr.nodes) {
    if (NODES[n.id]) throw new Error('duplicate tech node ' + n.id);
    NODES[n.id] = n; TREE_OF[n.id] = tr;
  }
  SV.TECH = { trees: TREES, nodes: NODES };

  function toast(msg, color) { if (SV.toast) SV.toast(msg, color); }
  function audio(n) { if (Z.audio && Z.audio.play) Z.audio.play(n); }
  function techOf(state) { return (state && state.player && state.player.tech) || {}; }

  const prog = (SV.prog = {});
  // XP needed to go from level l to l+1. player.xp is progress within the current level.
  prog.xpForLevel = function (l) { return Math.round(100 * Math.pow(l, 1.5)); };

  prog.addXP = function (state, n) {
    const p = state && state.player;
    if (!p || !(n > 0)) return;
    p.xp = (p.xp || 0) + n;
    if (!p.level) p.level = 1;
    let leveled = false;
    while (p.xp >= prog.xpForLevel(p.level)) {
      p.xp -= prog.xpForLevel(p.level);
      p.level++;
      const bonus = p.level % 5 === 0 ? 1 : 0;
      p.sp = (p.sp || 0) + 1 + bonus;
      leveled = true;
      if (Z.emit) Z.emit('sv:levelUp', p.level);
      toast('LEVEL UP! Level ' + p.level + ' - skill point gained' + (bonus ? ' (+1 bonus)' : ''), '#ffd36b');
    }
    if (leveled) audio('levelUp');
  };

  prog.canUnlock = function (state, nodeId) {
    const p = state && state.player, node = NODES[nodeId];
    if (!p || !node) return { ok: false, reason: 'Unknown node' };
    if (p.tech && p.tech[nodeId]) return { ok: false, reason: 'Already unlocked' };
    for (const r of node.requires) {
      if (!(p.tech && p.tech[r])) return { ok: false, reason: 'Requires ' + (NODES[r] ? NODES[r].name : r) };
    }
    if ((p.sp || 0) < node.cost.sp) return { ok: false, reason: 'Need ' + node.cost.sp + ' skill point' + (node.cost.sp > 1 ? 's' : '') };
    for (const id in node.cost.items) {
      const have = SV.inv && SV.inv.count && p.inv ? SV.inv.count(p.inv, id) : 0;
      if (have < node.cost.items[id]) return { ok: false, reason: 'Need ' + node.cost.items[id] + ' ' + id.replace(/_/g, ' ') + ' (have ' + have + ')' };
    }
    if (TREE_OF[nodeId].workbench && SV.base && SV.base.nearStation && !SV.base.nearStation(state, 'workbench')) {
      return { ok: false, reason: 'Must be near a workbench' };
    }
    return { ok: true, reason: '' };
  };

  prog.unlock = function (state, nodeId) {
    const c = prog.canUnlock(state, nodeId);
    if (!c.ok) { toast(c.reason, '#ff7a6b'); return false; }
    const p = state.player, node = NODES[nodeId];
    for (const id in node.cost.items) SV.inv.remove(p.inv, id, node.cost.items[id]);
    p.sp -= node.cost.sp;
    p.tech = p.tech || {};
    p.tech[nodeId] = true;
    prog.sync(state);
    if (SV.inv && SV.inv.recalcSize) SV.inv.recalcSize(state);
    toast('Unlocked: ' + node.name, '#9be37a');
    audio('craft');
    if (Z.emit) Z.emit('sv:techUnlocked', nodeId);
    return true;
  };

  // Push derived maxHp / maxStamina onto the player (heals by the increase). Cheap; safe to call often.
  prog.sync = function (state) {
    const p = state && state.player;
    if (!p) return;
    const m = prog.playerMods(state);
    if (p.maxHp !== m.maxHp) {
      const d = m.maxHp - (p.maxHp || m.maxHp);
      p.maxHp = m.maxHp;
      p.hp = d > 0 ? Math.min(p.maxHp, (p.hp || 0) + d) : Math.min(p.hp, p.maxHp);
    }
    if (p.maxStamina !== m.maxStamina) {
      const d = m.maxStamina - (p.maxStamina || m.maxStamina);
      p.maxStamina = m.maxStamina;
      p.stamina = d > 0 ? Math.min(p.maxStamina, (p.stamina || 0) + d) : Math.min(p.stamina, p.maxStamina);
    }
  };

  prog.weaponStats = function (state, weaponId) {
    const W = SV.WEAPONS || {};
    const base = W[weaponId] || W.unarmed || {};
    const s = Object.assign({}, base);
    if (base.melee) s.melee = Object.assign({}, base.melee);
    s.id = weaponId;
    s.pierce = base.pierce || 0; s.ricochet = 0; s.burst = 0; s.explosive = 0; s.incendiary = false;
    s.crit = 0; s.critMul = 2; s.lifesteal = 0; s.slug = false;
    const tr = TREES.find((x) => x.id === base.class);
    if (!tr) return s;
    const tech = techOf(state);
    let dmg = 0, rate = 0, reload = 0, spread = 0, magAdd = 0, pellets = 0, arc = 0, knock = 0, range = 0;
    for (const n of tr.nodes) {
      if (!tech[n.id]) continue;
      const e = n.effect;
      dmg += e.dmg || 0; rate += e.rate || 0; reload += e.reload || 0; spread += e.spread || 0;
      if (e.magAdd) {
        if (weaponId === 'hunting_rifle' && e.magAddBolt !== undefined) magAdd += e.magAddBolt;
        else if (weaponId === 'revolver') magAdd += Math.ceil(e.magAdd / 2);
        else magAdd += e.magAdd;
      }
      pellets += e.pellets || 0; arc += e.arc || 0; knock += e.knock || 0; range += e.range || 0;
      s.pierce += e.pierce || 0; s.ricochet += e.ricochet || 0; s.burst = Math.max(s.burst, e.burst || 0);
      s.explosive = Math.max(s.explosive, e.explosive || 0);
      if (e.incendiary) s.incendiary = true;
      s.crit += e.crit || 0; s.lifesteal += e.lifesteal || 0;
      if (e.slug) s.slug = true;
    }
    s.damage = base.damage * (1 + dmg);
    s.fireRate = base.fireRate / (1 + rate);
    s.reloadTime = base.reloadTime * Math.max(0.35, 1 - reload);
    s.spread = base.spread * Math.max(0.1, 1 - spread);
    s.magSize = base.magSize ? base.magSize + magAdd : 0;
    s.pellets = (base.pellets || 1) + pellets;
    if (s.slug && base.class === 'shotgun') {
      s.damage = s.damage * (base.pellets || 1) * 0.75;
      s.pellets = 1; s.spread = base.spread * 0.2; s.range = base.range * 1.6; s.bulletSpeed = base.bulletSpeed * 1.4;
    } else s.slug = false;
    s.crit = Math.min(0.75, s.crit);
    if (base.melee) {
      s.melee.arc = base.melee.arc * (1 + arc);
      s.melee.knock = base.melee.knock * (1 + knock);
      s.melee.range = base.melee.range * (1 + range);
    }
    if (base.melee || s.burst < 2) s.burst = 0;
    return s;
  };

  prog.playerMods = function (state) {
    const p = state && state.player, tech = techOf(state);
    const sum = (k) => {
      let v = 0;
      for (const tr of TREES) for (const n of tr.nodes) if (tech[n.id] && n.effect[k]) v += n.effect[k];
      return v;
    };
    let armor = 0;
    if (p && p.inv && p.inv.equip && SV.ITEMS) {
      for (const slot of ['head', 'body']) {
        const st = p.inv.equip[slot];
        if (st && SV.ITEMS[st.id] && SV.ITEMS[st.id].armor) armor += SV.ITEMS[st.id].armor;
      }
    }
    armor = Math.min(0.75, armor * (1 + sum('armorMul')));
    const inCombat = !!p && (p.combatTimer || 0) > 0;
    return {
      maxHp: 100 + sum('maxHp'),
      armor,
      dmgReduction: Math.min(0.5, sum('dmgReduction')),
      regen: inCombat ? 0 : sum('regen'),
      speedMult: 1 + sum('speed'),
      maxStamina: 100 + sum('maxStamina'),
      staminaRegenMult: 1 + sum('staminaRegen'),
      hungerMult: Math.max(0.3, 1 - sum('hungerMult')),
      searchMult: Math.max(0.3, 1 - sum('searchMult')),
      lootLuck: sum('lootLuck'),
      invSlots: sum('invSlots'),
      noiseMult: Math.max(0.3, 1 - sum('noise')),
      thorns: sum('thorns'),
      bleedResist: Math.min(0.9, sum('bleedResist')),
    };
  };
})();
