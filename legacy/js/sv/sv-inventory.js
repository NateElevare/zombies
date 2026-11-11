(function () {
  'use strict';
  const Z = (window.Z = window.Z || {}), SV = (Z.sv = Z.sv || {});
  const players = new WeakSet();
  const equipKeys = ['primary', 'secondary', 'melee', 'head', 'body', 'back'];
  const validQty = n => Number.isSafeInteger(n) && n >= 0;
  const validInv = inv => !!inv && Number.isInteger(inv.size) && inv.size >= 0 && Array.isArray(inv.slots);
  const validIndex = (inv, i) => validInv(inv) && Number.isInteger(i) && i >= 0 && i < inv.size;
  const def = id => SV.ITEMS && Object.prototype.hasOwnProperty.call(SV.ITEMS, id) ? SV.ITEMS[id] : null;
  function added(inv, id, qty) {
    if (qty > 0 && (players.has(inv) || (Z.state && Z.state.player && Z.state.player.inv === inv)) && Z.emit) {
      Z.emit('sv:itemAdded', { id, qty });
    }
  }
  function compatible(a, b) {
    if (!a || !b || a.id !== b.id) return false;
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    for (const key of keys) if (key !== 'qty' && a[key] !== b[key]) return false;
    return true;
  }
  function play(name) { if (Z.audio && Z.audio.play) Z.audio.play(name); }
  function resetWeapon(p) { p.reloadTimer = 0; p.reloadTotal = 0; p.fireCooldown = 0; p.swingTimer = 0; }
  function slotFor(item) { return item.type === 'backpack' ? 'back' : /^(weapon|armor)$/.test(item.type) ? item.slot : null; }
  const api = SV.inv = {
    create(size) {
      size = Number.isInteger(size) && size >= 0 ? size : 0;
      return { size, slots: Array(size).fill(null) };
    },
    createPlayer() {
      const inv = api.create(12);
      inv.equip = {};
      equipKeys.forEach(key => { inv.equip[key] = null; });
      players.add(inv);
      return inv;
    },
    recalcSize(state) {
      const p = state && state.player, inv = p && p.inv;
      if (!validInv(inv)) return false;
      const back = inv.equip && inv.equip.back, item = back && def(back.id);
      const mods = SV.prog && SV.prog.playerMods ? SV.prog.playerMods(state) : {};
      const bonus = mods && Number.isFinite(mods.invSlots) ? Math.max(0, Math.floor(mods.invSlots)) : 0;
      const size = 12 + (item && item.type === 'backpack' ? item.slots : 0) + bonus;
      const next = api.create(size), overflow = [], quantities = new Map();
      // Preserve slot positions, then fold overflow into partial stacks or empty slots.
      for (let i = 0; i < Math.min(size, inv.slots.length); i++) {
        next.slots[i] = inv.slots[i] || null;
      }
      for (let i = size; i < inv.slots.length; i++) {
        const stack = inv.slots[i];
        if (!stack) continue;
        let left = stack.qty;
        for (const current of next.slots) {
          if (!compatible(current, stack)) continue;
          const qty = quantities.has(current) ? quantities.get(current) : current.qty;
          const n = Math.min(left, Math.max(0, def(stack.id).stack - qty));
          quantities.set(current, qty + n); left -= n;
        }
        quantities.set(stack, left);
        if (!left) continue;
        const index = next.slots.findIndex(s => !s);
        if (index >= 0) next.slots[index] = stack;
        else overflow.push(stack);
      }
      if (overflow.length && (!SV.loot || !SV.loot.makeDrop)) return false;
      quantities.forEach((qty, stack) => { stack.qty = qty; });
      if (overflow.length) {
        const drop = SV.loot.makeDrop(state, p.x, p.y, overflow);
        drop.inv.slots = overflow; drop.inv.size = overflow.length;
      }
      inv.size = size; inv.slots = next.slots;
      return true;
    },
    add(inv, id, qty, extra) {
      qty = qty === undefined ? 1 : qty;
      const item = def(id);
      if (!validInv(inv) || !item || !validQty(qty)) return qty;
      const stack = Object.assign({}, extra || {}, { id, qty: 1 });
      if (item.type === 'weapon') stack.mag = Number.isFinite(stack.mag) ? Math.max(0, Math.floor(stack.mag)) : 0;
      let left = qty;
      for (let i = 0; i < inv.size && left; i++) {
        const current = inv.slots[i];
        if (item.stack > 1 && compatible(current, stack)) {
          const n = Math.min(left, Math.max(0, item.stack - current.qty));
          current.qty += n; left -= n;
        }
      }
      for (let i = 0; i < inv.size && left; i++) if (!inv.slots[i]) {
        const n = Math.min(left, item.stack);
        inv.slots[i] = Object.assign({}, stack, { qty: n }); left -= n;
      }
      added(inv, id, qty - left);
      return left;
    },
    count(inv, id) {
      if (!validInv(inv)) return 0;
      return inv.slots.slice(0, inv.size).reduce((n, s) => n + (s && s.id === id ? s.qty : 0), 0);
    },
    remove(inv, id, qty) {
      if (!validInv(inv) || !validQty(qty) || api.count(inv, id) < qty) return false;
      for (let i = 0; i < inv.size && qty; i++) {
        const s = inv.slots[i];
        if (s && s.id === id) { const n = Math.min(s.qty, qty); s.qty -= n; qty -= n; if (!s.qty) inv.slots[i] = null; }
      }
      return true;
    },
    has(inv, needs) { return !!needs && Object.keys(needs).every(id => validQty(needs[id]) && api.count(inv, id) >= needs[id]); },
    moveSlot(from, index, to, target) {
      if (!validIndex(from, index) || !validInv(to)) return false;
      const source = from.slots[index];
      if (!source || !def(source.id)) return false;
      if (target === undefined || target === null) {
        if (from === to) return false;
        const left = api.add(to, source.id, source.qty, source), moved = source.qty - left;
        if (!moved) return false;
        if (left) source.qty = left; else from.slots[index] = null;
        return true;
      }
      if (!validIndex(to, target) || (from === to && index === target)) return false;
      const dest = to.slots[target], item = def(source.id);
      if (item.stack > 1 && compatible(source, dest)) {
        const n = Math.min(source.qty, Math.max(0, item.stack - dest.qty));
        if (!n) return false;
        dest.qty += n; source.qty -= n;
        if (!source.qty) from.slots[index] = null;
        if (from !== to) added(to, source.id, n);
      } else {
        to.slots[target] = source; from.slots[index] = dest || null;
        if (from !== to) { added(to, source.id, source.qty); if (dest) added(from, dest.id, dest.qty); }
      }
      return true;
    },
    takeAll(from, to) {
      if (!validInv(from) || !validInv(to) || from === to) return false;
      let moved = false;
      for (let i = 0; i < from.size; i++) if (api.moveSlot(from, i, to)) moved = true;
      return moved;
    },
    equip(state, index) {
      const p = state && state.player, inv = p && p.inv;
      if (!validIndex(inv, index) || !inv.equip) return false;
      const stack = inv.slots[index], item = stack && def(stack.id), key = item && slotFor(item);
      if (!key || !equipKeys.includes(key)) return false;
      const previous = inv.equip[key];
      inv.equip[key] = stack; inv.slots[index] = previous || null;
      if (key === 'back' && !api.recalcSize(state)) { inv.equip[key] = previous; inv.slots[index] = stack; return false; }
      if (item.type === 'weapon') resetWeapon(p);
      play('pickup'); return true;
    },
    unequip(state, key) {
      const p = state && state.player, inv = p && p.inv;
      if (!validInv(inv) || !inv.equip || !equipKeys.includes(key) || !inv.equip[key]) return null;
      const index = inv.slots.findIndex(s => !s);
      if (index < 0) return null;
      const stack = inv.equip[key]; inv.slots[index] = stack; inv.equip[key] = null;
      if (key === 'back' && !api.recalcSize(state)) { inv.slots[index] = null; inv.equip[key] = stack; return null; }
      if (['primary', 'secondary', 'melee'].includes(key)) resetWeapon(p);
      const landed = inv.slots.includes(stack) ? inv : (state.drops || []).map(d => d.inv).find(i => i.slots.includes(stack));
      return landed ? { inv: landed, index: landed.slots.indexOf(stack), stack } : null;
    },
    equippedWeapon(state) {
      const p = state && state.player;
      if (!p || !p.inv || !p.inv.equip || !['primary', 'secondary', 'melee'].includes(p.active)) return null;
      return p.inv.equip[p.active] || null;
    },
    use(state, index) {
      const p = state && state.player, inv = p && p.inv;
      if (!p || p.dead || !validIndex(inv, index)) return false;
      const stack = inv.slots[index], item = stack && def(stack.id);
      if (!item || item.type !== 'consumable' || !item.use) return false;
      const effect = item.use;
      if (effect.heal) p.hp = Math.min(p.maxHp || 100, Math.max(0, p.hp || 0) + effect.heal);
      if (effect.food) p.food = Math.min(100, Math.max(0, p.food || 0) + effect.food);
      if (effect.water) p.water = Math.min(100, Math.max(0, p.water || 0) + effect.water);
      if (effect.stamina) p.stamina = Math.min(p.maxStamina || 100, Math.max(0, p.stamina || 0) + effect.stamina);
      if (effect.stopBleed) p.bleeding = 0;
      if (--stack.qty <= 0) inv.slots[index] = null;
      play(effect.heal ? 'pickup' : 'eat'); return true;
    },
    quickHeal(state) {
      const p = state && state.player;
      if (!p || !validInv(p.inv) || (p.hp >= p.maxHp && !p.bleeding)) return false;
      for (const id of ['medkit', 'bandage', 'painkillers']) {
        if (p.hp >= p.maxHp && id !== 'bandage') continue;
        const index = p.inv.slots.findIndex(s => s && s.id === id);
        if (index >= 0) return api.use(state, index);
      }
      return false;
    },
    drop(state, index) {
      const p = state && state.player, inv = p && p.inv;
      if (!validIndex(inv, index) || !inv.slots[index] || !SV.loot || !SV.loot.makeDrop) return false;
      const drop = SV.loot.makeDrop(state, p.x, p.y, [inv.slots[index]]);
      if (!drop) return false;
      inv.slots[index] = null; return drop;
    },
    canCraft(state, recipeId) {
      const recipe = (SV.RECIPES || []).find(r => r.id === recipeId), p = state && state.player;
      const missing = {};
      if (!recipe || !p || !validInv(p.inv) || p.dead) return { ok: false, missing, reason: 'Unavailable recipe' };
      for (const id of Object.keys(recipe.in)) {
        const n = recipe.in[id] - api.count(p.inv, id); if (n > 0) missing[id] = n;
      }
      if (Object.keys(missing).length) return { ok: false, missing, reason: 'Missing materials' };
      if (recipe.station && !(SV.base && SV.base.nearStation && SV.base.nearStation(state, recipe.station))) {
        return { ok: false, missing, reason: 'Requires nearby ' + recipe.station };
      }
      const next = api.create(p.inv.size); next.slots = p.inv.slots.map(s => s ? Object.assign({}, s) : null);
      for (const id of Object.keys(recipe.in)) api.remove(next, id, recipe.in[id]);
      if (api.add(next, recipe.out.id, recipe.out.qty)) return { ok: false, missing, reason: 'Inventory full' };
      return { ok: true, missing };
    },
    craft(state, recipeId) {
      if (!api.canCraft(state, recipeId).ok) return false;
      const recipe = SV.RECIPES.find(r => r.id === recipeId), inv = state.player.inv;
      for (const id of Object.keys(recipe.in)) api.remove(inv, id, recipe.in[id]);
      api.add(inv, recipe.out.id, recipe.out.qty);
      if (SV.prog && SV.prog.addXP) SV.prog.addXP(state, 3);
      play('craft'); return true;
    },
    totalAmmo(state, id) { return api.count(state && state.player && state.player.inv, id); }
  };
})();
