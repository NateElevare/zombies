// sv-ui.js — Survival mode UI: canvas HUD + HTML overlays (built from JS into #sv-root). Owner: UI agent.
// See SURVIVAL_SPEC.md ("UI agent").
//
// KEYS HANDLED HERE (all other keys, incl. Esc, are left to sv-game / sv-player):
//   Window keydown listener in the CAPTURE phase, active only when Z.state.mode === 'survival' AND a
//   survival HTML overlay is open (inventory/loot/stash/workbench/tech/craft/map/pause/dead):
//     I          inventory: close if open, else switch to it   (ignored on pause/dead)
//     K          tech tree: close if open, else switch to it   (ignored on pause/dead)
//     C          crafting:  close if open, else switch to it   (ignored on pause/dead)
//     Tab / N    map:       close if open, else switch to it   (ignored on pause/dead)
//     E          closes loot / stash / workbench overlays
//     F          "take all" in loot / stash overlays
//   Handled keys call preventDefault + stopPropagation so Z.input (window, bubble phase) never sees them,
//   which means sv-game cannot double-toggle the same press. Esc is NEVER handled here: sv-game calls
//   Z.sv.ui.close(). (close() refuses to close the 'dead' overlay; use the Respawn button.)
//   Additionally, in survival, Tab always gets preventDefault (no browser focus change) and M (mute,
//   toggled by arcade ui.js) shows a survival toast. Mouse wheel over the map canvas zooms.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const SV = (Z.sv = Z.sv || {});
  const now = () => performance.now();
  const FONT = 'Impact, "Arial Narrow Bold", "Arial Black", sans-serif';
  const OVERLAYS = ['inventory', 'loot', 'stash', 'workbench', 'tech', 'craft', 'map', 'pause', 'dead'];
  const EQUIP_KEYS = ['head', 'primary', 'body', 'secondary', 'melee', 'back'];
  const EQUIP_LABEL = { primary: 'Primary', secondary: 'Secondary', melee: 'Melee', head: 'Head', body: 'Body', back: 'Back' };
  const HINT_KEY = 'deadzone_sv_hints_seen';

  // ------------------------------------------------------------------ helpers
  const st = () => Z.state;
  const isSurvival = () => !!(Z.state && Z.state.mode === 'survival');
  const items = () => SV.ITEMS || {};
  const itemDef = (id) => items()[id] || null;
  const itemName = (id) => { const d = itemDef(id); return d && d.name ? d.name : String(id || '?').replace(/_/g, ' '); };
  const rarityColor = (r) => (SV.RARITY_COLORS && SV.RARITY_COLORS[r]) || ({ common: '#9a9a90', uncommon: '#4fbf4f', rare: '#3f8fff', epic: '#b45cff' })[r] || '#777';
  function play(n) { try { if (Z.audio && Z.audio.play) Z.audio.play(n); } catch (e) { /* ignore */ } }
  function call(obj, fn) {
    // safe call: call(Z.sv.inv, 'equip', a, b) -> result or undefined
    if (!obj || typeof obj[fn] !== 'function') return undefined;
    const args = Array.prototype.slice.call(arguments, 2);
    try { return obj[fn].apply(obj, args); } catch (err) { console.error('sv-ui call failed', fn, err); return undefined; }
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const fmt = (v, d) => (typeof v === 'number' && isFinite(v) ? (d ? v.toFixed(d) : String(Math.round(v))) : '-');
  const pct = (v) => Math.round((v || 0) * 100) + '%';
  const playerInv = () => { const s = st(); return s && s.player && s.player.inv; };
  const countItem = (id) => { const inv = playerInv(); if (!inv) return 0; const c = call(SV.inv, 'count', inv, id); return typeof c === 'number' ? c : 0; };

  // ------------------------------------------------------------------ DOM refs / UI state
  let root = null, overlay = null, panel = null, tooltip = null;
  let cur = null;              // { name, data, tab, tree, node, mapZoom }
  let lastTab = { workbench: 'tech' }, lastTree = null, selectedNode = null, mapZoom = 1;
  let dragSrc = null;          // { where:'player'|'other'|'equip', idx|key }
  let syncedState = null;      // last state object we hid arcade overlays for

  // ------------------------------------------------------------------ HUD state
  let toasts = [];             // {text,color,t0}
  let feed = [];               // {id,qty,t0}
  let banner = null;           // {text, sub, color, t0, dur}
  let hurtT0 = -1e9;
  let hintsSeen = false;
  try { hintsSeen = localStorage.getItem(HINT_KEY) === '1'; } catch (e) { /* ignore */ }

  function toast(msg, color) {
    if (msg == null) return;
    toasts.push({ text: String(msg), color: color || '#e8e8e0', t0: now() });
    if (toasts.length > 5) toasts.shift();
  }
  function showBanner(text, sub, color, dur) { banner = { text, sub: sub || '', color: color || '#d11', t0: now(), dur: dur || 3000 }; }

  // Hide arcade overlays when survival is active; body.menu only while a survival overlay is open.
  function syncArcade() {
    if (!isSurvival()) return;
    ['title', 'pause', 'gameover'].forEach((id) => { const e = document.getElementById(id); if (e) e.classList.add('hidden'); });
    document.body.classList.toggle('menu', !!cur);
    syncedState = Z.state;
  }

  // ------------------------------------------------------------------ item icon / slot rendering
  function makeIcon(stack, small) {
    const d = itemDef(stack.id) || {};
    const ic = el('div', 'sv-icon' + (small ? ' small' : ''));
    ic.style.background = d.color || '#555';
    ic.style.borderColor = rarityColor(d.rarity);
    ic.appendChild(el('span', 'sv-glyph', d.glyph || String(stack.id || '?').slice(0, 2).toUpperCase()));
    return ic;
  }

  function weaponDef(id) {
    let w = SV.prog && SV.prog.weaponStats && st() ? call(SV.prog, 'weaponStats', st(), id) : null;
    if (!w && SV.WEAPONS) w = SV.WEAPONS[id];
    return w || null;
  }

  // where: 'player' | 'other' | 'equip'; ref: slot index or equip key
  function makeSlot(stack, where, ref, extraCls) {
    const s = el('div', 'sv-slot' + (extraCls ? ' ' + extraCls : '') + (stack ? ' filled' : ''));
    s.dataset.where = where;
    s.dataset.ref = String(ref);
    if (stack) {
      const d = itemDef(stack.id) || {};
      s.style.setProperty('--rar', rarityColor(d.rarity));
      s.appendChild(makeIcon(stack));
      if (stack.qty > 1) s.appendChild(el('span', 'sv-qty', String(stack.qty)));
      if (d.type === 'weapon' && typeof stack.mag === 'number') {
        const wd = weaponDef(stack.id);
        if (!(wd && wd.melee) && !(wd && wd.class === 'melee')) s.appendChild(el('span', 'sv-mag', stack.mag + (wd && wd.magSize ? '/' + wd.magSize : '')));
      }
      s.draggable = true;
      s.addEventListener('dragstart', (e) => {
        dragSrc = { where, ref };
        hideTooltip();
        try { e.dataTransfer.setData('text/plain', where + ':' + ref); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* ignore */ }
        s.classList.add('dragging');
      });
      s.addEventListener('dragend', () => { s.classList.remove('dragging'); dragSrc = null; clearDropHi(); });
      s.addEventListener('mouseenter', (e) => showTooltip(stack, where, e));
      s.addEventListener('mousemove', moveTooltip);
      s.addEventListener('mouseleave', hideTooltip);
    } else if (where === 'equip') {
      s.appendChild(el('span', 'sv-slot-label', EQUIP_LABEL[ref] || ref));
    }
    s.addEventListener('dragover', (e) => { if (dragSrc) { e.preventDefault(); s.classList.add('drop-hi'); } });
    s.addEventListener('dragleave', () => s.classList.remove('drop-hi'));
    s.addEventListener('drop', (e) => { e.preventDefault(); s.classList.remove('drop-hi'); if (dragSrc) handleDrop(dragSrc, { where, ref }); dragSrc = null; });
    s.addEventListener('click', (e) => { if (stack) slotClick(where, ref, e.shiftKey ? 'shift' : 'left'); });
    s.addEventListener('contextmenu', (e) => { e.preventDefault(); if (stack) slotClick(where, ref, 'right'); });
    return s;
  }
  function clearDropHi() { if (!root) return; root.querySelectorAll('.drop-hi').forEach((n) => n.classList.remove('drop-hi')); }

  function otherInv() {
    if (!cur || !cur.data || !validTarget()) return null;
    return cur.data.inv || null;
  }
  function validTarget() {
    return !cur || !cur.data || !['stash', 'workbench'].includes(cur.name) ||
      !!(st() && st().structures.includes(cur.data));
  }
  function invFor(where) { return where === 'player' ? playerInv() : where === 'other' ? otherInv() : null; }

  function isEquippable(d) { return d && (d.type === 'weapon' || d.type === 'armor' || d.type === 'backpack'); }

  function slotClick(where, ref, btn) {
    if (!cur || !validTarget()) return;
    const s = st(); if (!s || !s.player) return;
    const inv = playerInv(); if (!inv) return;
    hideTooltip();
    const hasOther = !!(cur && otherInv() && (cur.name === 'loot' || cur.name === 'stash'));
    if (where === 'equip') {
      call(SV.inv, 'unequip', s, ref);
      play('pickup');
    } else if (where === 'other') {
      const oi = otherInv(); if (!oi) return;
      if (btn === 'right') {
        // take then use/equip immediately
        const before = inv.slots.slice();
        call(SV.inv, 'moveSlot', oi, ref, inv);
        const idx = inv.slots.findIndex((x, i) => x && x !== before[i]);
        if (idx >= 0) useOrEquip(idx, true);
      } else {
        call(SV.inv, 'moveSlot', oi, ref, inv);
        play('pickup');
      }
    } else { // player slot
      if (!inv.slots[ref]) return;
      if (btn === 'shift') { call(SV.inv, 'drop', s, ref); }
      else if (hasOther && btn === 'left') { call(SV.inv, 'moveSlot', inv, ref, otherInv()); play('pickup'); }
      else if (btn === 'right') useOrEquip(ref, true);
      else useOrEquip(ref, false);
    }
    rerender();
  }

  // preferUse: right-click semantics (use first, then equip). Left-click: equip first, then use.
  function useOrEquip(idx, preferUse) {
    const s = st(); const inv = playerInv(); if (!inv) return;
    const stack = inv.slots[idx]; if (!stack) return;
    const d = itemDef(stack.id) || {};
    const canUse = d.type === 'consumable' || !!d.use;
    const canEquip = isEquippable(d);
    if (preferUse ? canUse : !canEquip && canUse) {
      const ok = call(SV.inv, 'use', s, idx);
      if (ok === false) toast("Can't use that right now", '#c88');
    } else if (canEquip) {
      call(SV.inv, 'equip', s, idx);
      play('reload');
    } else {
      toast(itemName(stack.id) + ' is a material', '#999');
    }
  }

  function handleDrop(src, dst) {
    if (!cur || !validTarget()) return;
    const s = st(); const inv = playerInv(); if (!s || !inv) return;
    if (src.where === dst.where && String(src.ref) === String(dst.ref)) return;
    if (dst.where === 'drop') {
      if (src.where === 'player') call(SV.inv, 'drop', s, src.ref);
      else if (src.where === 'equip') {
        const moved = call(SV.inv, 'unequip', s, src.ref);
        if (moved && moved.inv === inv) call(SV.inv, 'drop', s, moved.index);
      }
      rerender(); return;
    }
    if (dst.where === 'equip') {
      if (src.where === 'player') {
        const d = itemDef(inv.slots[src.ref] && inv.slots[src.ref].id);
        if (isEquippable(d)) { call(SV.inv, 'equip', s, src.ref); play('reload'); } else toast("That doesn't go there", '#c88');
      } else if (src.where === 'other') {
        const before = inv.slots.slice();
        call(SV.inv, 'moveSlot', otherInv(), src.ref, inv);
        const idx = inv.slots.findIndex((x, i) => x && x !== before[i]);
        if (idx >= 0 && isEquippable(itemDef(inv.slots[idx].id))) call(SV.inv, 'equip', s, idx);
      }
      rerender(); return;
    }
    if (src.where === 'equip') {
      // Backpack shrink can land the unequipped stack in an overflow drop.
      const moved = call(SV.inv, 'unequip', s, src.ref);
      const to = invFor(dst.where);
      if (moved && to) call(SV.inv, 'moveSlot', moved.inv, moved.index, to, Number(dst.ref));
      rerender(); return;
    }
    const from = invFor(src.where), to = invFor(dst.where);
    if (from && to) { call(SV.inv, 'moveSlot', from, Number(src.ref), to, Number(dst.ref)); play('pickup'); }
    rerender();
  }

  // ------------------------------------------------------------------ tooltip
  function tooltipHTML(stack, where) {
    const d = itemDef(stack.id) || {};
    const rc = rarityColor(d.rarity);
    let h = '<div class="tt-name" style="color:' + rc + '">' + esc(d.name || stack.id) + (stack.qty > 1 ? ' <span class="tt-x">x' + stack.qty + '</span>' : '') + '</div>';
    h += '<div class="tt-sub"><span style="color:' + rc + '">' + esc((d.rarity || 'common').toUpperCase()) + '</span> ' + esc((d.type || '').toUpperCase()) + (d.slot ? ' &middot; ' + esc(String(d.slot).toUpperCase()) : '') + '</div>';
    if (d.desc) h += '<div class="tt-desc">' + esc(d.desc) + '</div>';
    const rows = [];
    if (d.type === 'weapon') {
      const w = weaponDef(stack.id) || {};
      const isMelee = w.class === 'melee' || !!w.melee;
      rows.push(['Damage', fmt(w.damage) + (w.pellets > 1 ? ' x' + w.pellets : '')]);
      if (w.fireRate) rows.push([isMelee ? 'Swings/min' : 'Fire rate', fmt(60 / w.fireRate) + (isMelee ? '' : ' rpm')]);
      if (!isMelee) {
        if (w.magSize) rows.push(['Magazine', (typeof stack.mag === 'number' ? stack.mag + ' / ' : '') + w.magSize]);
        if (w.reloadTime) rows.push(['Reload', fmt(w.reloadTime, 1) + 's']);
        if (typeof w.spread === 'number') rows.push(['Accuracy', Math.max(0, Math.round(100 - w.spread * 300)) + '%']);
        if (w.ammo) rows.push(['Ammo', itemName(w.ammo) + ' (' + countItem(w.ammo) + ')']);
        if (w.range) rows.push(['Range', fmt(w.range)]);
      } else if (w.melee) {
        if (w.melee.range) rows.push(['Reach', fmt(w.melee.range)]);
      }
      if (w.noise) rows.push(['Noise', fmt(w.noise)]);
      const perks = [];
      if (w.pierce) perks.push('Pierce ' + w.pierce);
      if (w.ricochet) perks.push('Ricochet ' + w.ricochet);
      if (w.burst > 1) perks.push(w.burst + '-round burst');
      if (w.explosive) perks.push('Explosive');
      if (w.incendiary) perks.push('Incendiary');
      if (w.crit) perks.push('Crit ' + pct(w.crit));
      if (w.lifesteal) perks.push('Lifesteal');
      if (perks.length) rows.push(['Perks', perks.join(', ')]);
    } else if (d.type === 'armor') {
      rows.push(['Armor', pct(d.armor)]);
    } else if (d.type === 'backpack') {
      rows.push(['Slots', '+' + (d.slots || 0)]);
    } else if (d.use) {
      const u = d.use;
      if (u.heal) rows.push(['Heal', '+' + u.heal]);
      if (u.food) rows.push(['Food', '+' + u.food]);
      if (u.water) rows.push(['Water', '+' + u.water]);
      if (u.stamina) rows.push(['Stamina', '+' + u.stamina]);
      if (u.stopBleed) rows.push(['Stops bleeding', 'yes']);
      if (u.time) rows.push(['Use time', u.time + 's']);
    }
    if (rows.length) {
      h += '<table class="tt-stats">' + rows.map((r) => '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>').join('') + '</table>';
    }
    let hint;
    const loot = cur && (cur.name === 'loot' || cur.name === 'stash');
    if (where === 'equip') hint = 'Click: unequip';
    else if (where === 'other') hint = 'Click: take · Right-click: take & use';
    else if (loot) hint = 'Click: store · Right-click: ' + (d.use ? 'use' : 'equip') + ' · Shift: drop';
    else if (isEquippable(d)) hint = 'Click: equip · Shift: drop';
    else if (d.use || d.type === 'consumable') hint = 'Click: use · Shift: drop';
    else hint = 'Shift-click: drop · Drag to move';
    h += '<div class="tt-hint">' + esc(hint) + '</div>';
    return h;
  }
  function showTooltip(stack, where, e) {
    if (!tooltip || dragSrc) return;
    tooltip.innerHTML = tooltipHTML(stack, where);
    tooltip.classList.remove('hidden');
    moveTooltip(e);
  }
  function moveTooltip(e) {
    if (!tooltip || tooltip.classList.contains('hidden') || !e) return;
    const w = tooltip.offsetWidth || 240, h = tooltip.offsetHeight || 120;
    let x = e.clientX + 16, y = e.clientY + 16;
    const vw = window.innerWidth || 1280, vh = window.innerHeight || 720;
    if (x + w > vw - 8) x = e.clientX - w - 12;
    if (y + h > vh - 8) y = Math.max(8, vh - h - 8);
    tooltip.style.left = x + 'px'; tooltip.style.top = y + 'px';
  }
  function hideTooltip() { if (tooltip) tooltip.classList.add('hidden'); }

  // ------------------------------------------------------------------ overlay frame
  function header(title, sub) {
    const h = el('div', 'sv-head');
    const t = el('div', 'sv-title', title);
    h.appendChild(t);
    if (sub) h.appendChild(el('div', 'sv-sub', sub));
    const x = el('button', 'sv-close', '×');
    x.title = 'Close (Esc)';
    x.addEventListener('click', () => ui.close());
    h.appendChild(x);
    return h;
  }
  function tabs(list, active, onPick) {
    const bar = el('div', 'sv-tabs');
    list.forEach((t) => {
      const b = el('button', 'sv-tab' + (t.id === active ? ' active' : ''));
      b.innerHTML = (t.icon ? '<span class="sv-tab-ic">' + esc(t.icon) + '</span>' : '') + esc(t.name) + (t.badge ? '<span class="sv-badge">' + esc(t.badge) + '</span>' : '');
      b.addEventListener('click', () => onPick(t.id));
      bar.appendChild(b);
    });
    return bar;
  }

  function rerender() {
    if (!cur || !panel) return;
    hideTooltip();
    const scrollers = Array.prototype.map.call(panel.querySelectorAll('[data-scroll]'), (n) => [n.dataset.scroll, n.scrollLeft, n.scrollTop]);
    panel.innerHTML = '';
    panel.className = 'sv-panel sv-' + cur.name;
    const R = RENDER[cur.name];
    if (R) {
      try { R(panel, cur); } catch (err) { console.error('sv-ui render failed', cur.name, err); panel.appendChild(el('div', 'sv-empty', 'UI error: ' + err.message)); }
    }
    scrollers.forEach(([k, l, t]) => { const n = panel.querySelector('[data-scroll="' + k + '"]'); if (n) { n.scrollLeft = l; n.scrollTop = t; } });
  }

  // ------------------------------------------------------------------ inventory pieces
  function invGrid(inv, where, cols) {
    const g = el('div', 'sv-grid');
    g.style.gridTemplateColumns = 'repeat(' + (cols || 6) + ', var(--slot))';
    if (!inv || !inv.slots) { g.appendChild(el('div', 'sv-empty', 'Nothing here')); return g; }
    for (let i = 0; i < inv.slots.length; i++) g.appendChild(makeSlot(inv.slots[i], where, i));
    return g;
  }
  function usedSlots(inv) { if (!inv || !inv.slots) return 0; let n = 0; for (const x of inv.slots) if (x) n++; return n; }

  function paperdoll() {
    const s = st(); const p = s && s.player; const inv = p && p.inv;
    const doll = el('div', 'sv-doll');
    const sil = el('div', 'sv-doll-sil');
    doll.appendChild(sil);
    EQUIP_KEYS.forEach((k) => {
      const stack = inv && inv.equip ? inv.equip[k] : null;
      const slot = makeSlot(stack, 'equip', k, 'eq eq-' + k + (p && p.active === k ? ' active' : ''));
      const cap = el('div', 'sv-eq-cap', EQUIP_LABEL[k] + (k === 'primary' ? ' [1]' : k === 'secondary' ? ' [2]' : k === 'melee' ? ' [3]' : ''));
      const wrap = el('div', 'sv-eq-wrap eqw-' + k);
      wrap.appendChild(cap); wrap.appendChild(slot);
      doll.appendChild(wrap);
    });
    return doll;
  }

  function playerStatsBox() {
    const s = st(); const p = s && s.player;
    const box = el('div', 'sv-statbox');
    if (!p) return box;
    const mods = (SV.prog && call(SV.prog, 'playerMods', s)) || {};
    const rows = [
      ['Health', Math.ceil(p.hp || 0) + ' / ' + Math.round(p.maxHp || 100)],
      ['Armor', pct(mods.armor || 0)],
      ['Food', Math.round(p.food || 0) + '%'],
      ['Water', Math.round(p.water || 0) + '%'],
      ['Level', (p.level || 1) + (p.sp ? '  (' + p.sp + ' SP)' : '')],
    ];
    box.innerHTML = '<table>' + rows.map((r) => '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>').join('') + '</table>';
    return box;
  }

  function dropZone() {
    const dz = el('div', 'sv-dropzone', 'DROP HERE');
    dz.title = 'Drag an item here to drop it on the ground (or shift-click it)';
    dz.addEventListener('dragover', (e) => { if (dragSrc && dragSrc.where !== 'other') { e.preventDefault(); dz.classList.add('drop-hi'); } });
    dz.addEventListener('dragleave', () => dz.classList.remove('drop-hi'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drop-hi'); if (dragSrc) handleDrop(dragSrc, { where: 'drop' }); dragSrc = null; });
    return dz;
  }

  function playerInvColumn(title) {
    const inv = playerInv();
    const col = el('div', 'sv-col');
    const hh = el('div', 'sv-col-head');
    hh.innerHTML = esc(title || 'Backpack') + ' <span class="sv-dim">' + usedSlots(inv) + ' / ' + (inv && inv.slots ? inv.slots.length : 0) + '</span>';
    col.appendChild(hh);
    const sc = el('div', 'sv-scroll'); sc.dataset.scroll = 'pinv';
    sc.appendChild(invGrid(inv, 'player', 6));
    col.appendChild(sc);
    return col;
  }

  // ------------------------------------------------------------------ renderers
  const RENDER = {};

  RENDER.inventory = function (pn) {
    pn.appendChild(header('INVENTORY', 'I to close'));
    const body = el('div', 'sv-body sv-row');
    const left = el('div', 'sv-col sv-col-doll');
    left.appendChild(el('div', 'sv-col-head', 'Equipment'));
    left.appendChild(paperdoll());
    left.appendChild(playerStatsBox());
    body.appendChild(left);
    const right = playerInvColumn('Backpack');
    right.appendChild(dropZone());
    right.appendChild(el('div', 'sv-help', 'Click equip/use · Right-click use · Shift-click drop · Drag to rearrange'));
    body.appendChild(right);
    pn.appendChild(body);
  };

  function containerTitle(data) {
    if (!data) return 'LOOT';
    if (data.kind === 'deathbag') return 'YOUR BACKPACK';
    if (data.type && SV.STRUCTURES && SV.STRUCTURES[data.type]) return String(SV.STRUCTURES[data.type].name || data.type).toUpperCase();
    if (data.name) return String(data.name).toUpperCase();
    if (data.kind === 'loot') return 'LOOT BAG';
    return String(data.kind || 'LOOT').replace(/_/g, ' ').toUpperCase();
  }

  function takeAll() {
    if (!cur || !validTarget()) return;
    const inv = playerInv(), oi = otherInv();
    if (!inv || !oi) return;
    const before = usedSlots(oi);
    call(SV.inv, 'takeAll', oi, inv);
    const after = usedSlots(oi);
    if (after < before) play('pickup');
    if (after > 0) toast('Backpack full', '#f84');
    if (after === 0 && cur && cur.name === 'loot') { ui.close(); return; }
    rerender();
  }

  function renderTransfer(pn, c, title, sub) {
    pn.appendChild(header(title, sub));
    const body = el('div', 'sv-body sv-row');
    body.appendChild(playerInvColumn('Your Backpack'));
    const right = el('div', 'sv-col');
    const oi = otherInv();
    const hh = el('div', 'sv-col-head');
    hh.innerHTML = esc(title) + ' <span class="sv-dim">' + usedSlots(oi) + ' / ' + (oi && oi.slots ? oi.slots.length : 0) + '</span>';
    right.appendChild(hh);
    const sc = el('div', 'sv-scroll'); sc.dataset.scroll = 'oinv';
    if (oi && oi.slots && usedSlots(oi) === 0 && c.name === 'loot') sc.appendChild(el('div', 'sv-empty', 'Empty.'));
    sc.appendChild(invGrid(oi, 'other', oi && oi.slots && oi.slots.length <= 8 ? 4 : 6));
    right.appendChild(sc);
    const btns = el('div', 'sv-btnrow');
    const ta = el('button', 'sv-btn primary', 'Take All [F]');
    ta.disabled = !oi || usedSlots(oi) === 0;
    ta.addEventListener('click', takeAll);
    btns.appendChild(ta);
    right.appendChild(btns);
    right.appendChild(el('div', 'sv-help', 'Click an item to move it across · Drag to place · E / Esc to close'));
    body.appendChild(right);
    pn.appendChild(body);
  }
  RENDER.loot = function (pn, c) { renderTransfer(pn, c, containerTitle(c.data), c.data && c.data.kind === 'deathbag' ? 'Everything you carried' : ''); };
  RENDER.stash = function (pn, c) {
    const isTurret = c.data && c.data.type === 'turret';
    renderTransfer(pn, c, containerTitle(c.data) || 'STASH', isTurret ? 'Load 9mm ammo to arm the turret' : 'Base storage');
  };

  // ---------------- tech tree
  function techTrees() { return (SV.TECH && Array.isArray(SV.TECH.trees)) ? SV.TECH.trees : []; }
  function nearWorkbench() { const s = st(); return !!(SV.base && s && call(SV.base, 'nearStation', s, 'workbench')); }
  function ownsNode(id) { const p = st() && st().player; return !!(p && p.tech && p.tech[id]); }

  function renderTech(pn, c, embedded) {
    const s = st(); const p = s && s.player;
    const trees = techTrees();
    if (!embedded) pn.appendChild(header('TECH TREE', 'K to close'));
    const wrap = el('div', 'sv-body sv-techwrap');
    if (!trees.length) { wrap.appendChild(el('div', 'sv-empty', 'No tech trees available.')); pn.appendChild(wrap); return; }
    let tree = trees.find((t) => t.id === lastTree) || trees[0];
    lastTree = tree.id;
    const top = el('div', 'sv-techtop');
    top.appendChild(tabs(trees.map((t) => {
      const total = (t.nodes || []).length, owned = (t.nodes || []).filter((n) => ownsNode(n.id)).length;
      return { id: t.id, name: t.name || t.id, icon: t.icon, badge: owned + '/' + total };
    }), tree.id, (id) => { lastTree = id; selectedNode = null; rerender(); }));
    const spb = el('div', 'sv-sp' + (p && p.sp > 0 ? ' has' : ''));
    spb.innerHTML = '<b>' + ((p && p.sp) || 0) + '</b> SKILL POINTS';
    top.appendChild(spb);
    wrap.appendChild(top);

    const locked = tree.workbench && !nearWorkbench();
    if (locked) wrap.appendChild(el('div', 'sv-notice', '⚠ Requires a workbench at your base — stand near one to unlock these upgrades.'));

    const main = el('div', 'sv-techmain');
    const graphBox = el('div', 'sv-techgraph'); graphBox.dataset.scroll = 'tech-' + tree.id;
    const nodes = tree.nodes || [];
    const CW = 170, RH = 96, PAD = 24, NW = 140, NH = 64;
    let maxC = 0, maxR = 0;
    nodes.forEach((n) => { maxC = Math.max(maxC, n.col || 0); maxR = Math.max(maxR, n.row || 0); });
    const GW = PAD * 2 + maxC * CW + NW, GH = PAD * 2 + maxR * RH + NH;
    const inner = el('div', 'sv-techinner');
    inner.style.width = GW + 'px'; inner.style.height = GH + 'px';
    const byId = {};
    nodes.forEach((n) => { byId[n.id] = n; });
    const pos = (n) => ({ x: PAD + (n.col || 0) * CW, y: PAD + (n.row || 0) * RH });
    // connector lines (SVG)
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', GW); svg.setAttribute('height', GH); svg.setAttribute('class', 'sv-techsvg');
    nodes.forEach((n) => {
      (n.requires || []).forEach((rid) => {
        const r = byId[rid]; if (!r) return;
        const a = pos(r), b = pos(n);
        const x1 = a.x + NW / 2, y1 = a.y + NH / 2, x2 = b.x + NW / 2, y2 = b.y + NH / 2;
        const path = document.createElementNS(NS, 'path');
        let d;
        if (Math.abs(a.x - b.x) > Math.abs(a.y - b.y)) {
          const mx = (x1 + x2) / 2; d = 'M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2;
        } else {
          const my = (y1 + y2) / 2; d = 'M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + my + ' ' + x2 + ' ' + my + ' ' + x2 + ' ' + y2;
        }
        path.setAttribute('d', d);
        path.setAttribute('class', 'sv-link' + (ownsNode(rid) ? (ownsNode(n.id) ? ' owned' : ' open') : ''));
        svg.appendChild(path);
      });
    });
    inner.appendChild(svg);
    nodes.forEach((n) => {
      const owned = ownsNode(n.id);
      const reqMet = (n.requires || []).every(ownsNode);
      const chk = !owned && SV.prog ? call(SV.prog, 'canUnlock', s, n.id) : null;
      const can = !!(chk && chk.ok);
      const cls = owned ? 'owned' : reqMet ? (can ? 'available can' : 'available') : 'locked';
      const b = el('div', 'sv-node ' + cls + (selectedNode === n.id ? ' sel' : ''));
      const ps = pos(n);
      b.style.left = ps.x + 'px'; b.style.top = ps.y + 'px'; b.style.width = NW + 'px'; b.style.height = NH + 'px';
      b.innerHTML = '<div class="sv-node-name">' + esc(n.name) + '</div><div class="sv-node-cost">' +
        (owned ? '✔ OWNED' : esc(((n.cost && n.cost.sp) || 0) + ' SP' + (n.cost && n.cost.items && Object.keys(n.cost.items).length ? ' + items' : ''))) + '</div>';
      b.title = n.desc || '';
      b.addEventListener('click', () => { selectedNode = n.id; rerender(); });
      inner.appendChild(b);
    });
    graphBox.appendChild(inner);
    main.appendChild(graphBox);

    // detail panel
    const det = el('div', 'sv-techdet');
    const node = byId[selectedNode] || nodes.find((n) => !ownsNode(n.id) && (n.requires || []).every(ownsNode)) || nodes[0];
    if (node) {
      selectedNode = node.id;
      const owned = ownsNode(node.id);
      det.appendChild(el('div', 'sv-det-name', node.name));
      det.appendChild(el('div', 'sv-det-desc', node.desc || ''));
      if (node.requires && node.requires.length) {
        const rq = el('div', 'sv-det-req');
        rq.innerHTML = 'Requires: ' + node.requires.map((rid) => '<span class="' + (ownsNode(rid) ? 'ok' : 'bad') + '">' + esc(byId[rid] ? byId[rid].name : rid) + '</span>').join(', ');
        det.appendChild(rq);
      }
      const cost = node.cost || {};
      const ul = el('ul', 'sv-cost');
      const spHave = (p && p.sp) || 0, spNeed = cost.sp || 0;
      ul.innerHTML = '<li class="' + (spHave >= spNeed ? 'ok' : 'bad') + '"><span>Skill points</span><b>' + spHave + ' / ' + spNeed + '</b></li>' +
        Object.keys(cost.items || {}).map((id) => {
          const need = cost.items[id], have = countItem(id);
          return '<li class="' + (have >= need ? 'ok' : 'bad') + '"><span>' + esc(itemName(id)) + '</span><b>' + have + ' / ' + need + '</b></li>';
        }).join('');
      det.appendChild(ul);
      if (owned) det.appendChild(el('div', 'sv-det-owned', '✔ UNLOCKED'));
      else {
        const chk = SV.prog ? call(SV.prog, 'canUnlock', s, node.id) : null;
        if (chk && !chk.ok && chk.reason) det.appendChild(el('div', 'sv-det-reason', chk.reason));
        const btn = el('button', 'sv-btn primary', 'Unlock');
        btn.disabled = !(chk && chk.ok);
        btn.addEventListener('click', () => {
          if (cur !== c || !validTarget()) return;
          const ok = call(SV.prog, 'unlock', st(), node.id);
          if (ok) { play('levelUp'); toast('Unlocked: ' + node.name, '#fc6'); }
          else toast((chk && chk.reason) || "Can't unlock yet", '#f66');
          rerender();
        });
        det.appendChild(btn);
      }
    }
    main.appendChild(det);
    wrap.appendChild(main);
    pn.appendChild(wrap);
  }
  RENDER.tech = function (pn, c) { renderTech(pn, c, false); };

  // ---------------- crafting
  function renderCraft(pn, c, embedded) {
    const s = st();
    if (!embedded) pn.appendChild(header('CRAFTING', 'C to close'));
    const body = el('div', 'sv-body sv-craft-body');
    const recipes = Array.isArray(SV.RECIPES) ? SV.RECIPES : [];
    if (!recipes.length) { body.appendChild(el('div', 'sv-empty', 'No recipes known.')); pn.appendChild(body); return; }
    const atBench = nearWorkbench();
    const list = el('div', 'sv-recipes'); list.dataset.scroll = 'craft';
    const rows = recipes.map((r) => {
      const chk = call(SV.inv, 'canCraft', s, r.id) || null;
      let ok = chk ? !!chk.ok : false;
      if (!chk) { // fallback check
        ok = Object.keys(r.in || {}).every((id) => countItem(id) >= r.in[id]) && (!r.station || atBench);
      }
      return { r, ok };
    });
    rows.sort((a, b) => (b.ok - a.ok));
    rows.forEach(({ r, ok }) => {
      const row = el('div', 'sv-recipe' + (ok ? ' ok' : ''));
      const out = r.out || { id: r.id, qty: 1 };
      row.appendChild(makeIcon(out));
      const mid = el('div', 'sv-recipe-mid');
      const d = itemDef(out.id) || {};
      mid.innerHTML = '<div class="sv-recipe-name" style="color:' + rarityColor(d.rarity) + '">' + esc(r.name || itemName(out.id)) + (out.qty > 1 ? ' <span class="sv-dim">x' + out.qty + '</span>' : '') +
        (r.station ? ' <span class="sv-station ' + (atBench ? 'ok' : 'bad') + '">' + esc(String(r.station).toUpperCase()) + '</span>' : '') + '</div>' +
        '<div class="sv-ings">' + Object.keys(r.in || {}).map((id) => {
          const need = r.in[id], have = countItem(id);
          return '<span class="sv-ing ' + (have >= need ? 'ok' : 'bad') + '">' + esc(itemName(id)) + ' <b>' + have + '/' + need + '</b></span>';
        }).join('') + '</div>';
      row.appendChild(mid);
      const btn = el('button', 'sv-btn' + (ok ? ' primary' : ''), 'Craft');
      btn.disabled = !ok;
      btn.addEventListener('click', () => {
        if (cur !== c || !validTarget()) return;
        const res = call(SV.inv, 'craft', st(), r.id);
        if (res) { play('craft'); toast('Crafted ' + (r.name || itemName(out.id)), '#9e9'); }
        else toast(r.station && !nearWorkbench() ? 'Needs a workbench' : 'Missing materials', '#f66');
        rerender();
      });
      row.appendChild(btn);
      list.appendChild(row);
    });
    body.appendChild(list);
    if (!atBench && recipes.some((r) => r.station)) body.appendChild(el('div', 'sv-help', 'Workbench recipes need you to stand at a workbench in your base (B to build one).'));
    pn.appendChild(body);
  }
  RENDER.craft = function (pn, c) { renderCraft(pn, c, false); };

  RENDER.workbench = function (pn, c) {
    pn.appendChild(header('WORKBENCH', ''));
    const tab = c.tab || lastTab.workbench || 'tech';
    pn.appendChild(tabs([{ id: 'tech', name: 'Tech Trees' }, { id: 'craft', name: 'Crafting' }], tab, (id) => { c.tab = lastTab.workbench = id; rerender(); }));
    if (tab === 'craft') renderCraft(pn, c, true); else renderTech(pn, c, true);
  };

  // ---------------- map
  RENDER.map = function (pn) {
    pn.appendChild(header('MAP', 'Tab / N to close · Wheel to zoom'));
    const body = el('div', 'sv-body sv-mapbody');
    const cv = el('canvas', 'sv-mapcanvas');
    body.appendChild(cv);
    pn.appendChild(body);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      mapZoom = clamp(mapZoom * (e.deltaY < 0 ? 1.25 : 0.8), 1, 6);
      drawMapCanvas(cv);
    }, { passive: false });
    // size after layout
    const doDraw = () => drawMapCanvas(cv);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(doDraw); else doDraw();
  };
  function drawMapCanvas(cv) {
    if (!cv || !cv.getContext) return;
    const r = cv.parentNode && cv.parentNode.getBoundingClientRect ? cv.parentNode.getBoundingClientRect() : { width: 800, height: 600 };
    const size = Math.max(200, Math.floor(Math.min(r.width || 800, r.height || 600)));
    cv.width = size; cv.height = size;
    cv.style.width = size + 'px'; cv.style.height = size + 'px';
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#0d0e0c'; ctx.fillRect(0, 0, size, size);
    const s = st();
    const W = (SV.WORLD && SV.WORLD.w) || 16000, H = (SV.WORLD && SV.WORLD.h) || 16000;
    const mw = size * mapZoom, mh = size * mapZoom;
    let ox = 0, oy = 0;
    if (mapZoom > 1 && s && s.player) {
      ox = clamp(size / 2 - (s.player.x / W) * mw, size - mw, 0);
      oy = clamp(size / 2 - (s.player.y / H) * mh, size - mh, 0);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.clip();
    if (SV.worldRender && SV.worldRender.drawMap && s) call(SV.worldRender, 'drawMap', ctx, s, ox, oy, mw, mh);
    else { ctx.fillStyle = '#777'; ctx.font = '20px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('MAP UNAVAILABLE', size / 2, size / 2); }
    ctx.restore();
    ctx.strokeStyle = '#3a1010'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, size - 2, size - 2);
    if (mapZoom > 1) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(8, size - 30, 70, 22); ctx.fillStyle = '#ccc'; ctx.font = '14px ' + FONT; ctx.textAlign = 'left'; ctx.fillText('ZOOM ' + mapZoom.toFixed(1) + 'x', 14, size - 14); }
  }

  // ---------------- pause / dead
  RENDER.pause = function (pn) {
    const s = st();
    const box = el('div', 'sv-center');
    box.appendChild(el('h2', 'sv-h2', 'PAUSED'));
    const tl = SV.game && s ? call(SV.game, 'timeLabel', s) : '';
    if (tl) box.appendChild(el('div', 'sv-sub big', tl));
    const t = el('table', 'stats');
    const ss = (s && s.stats) || {};
    t.innerHTML = '<tr><td>Kills</td><td>' + (ss.kills || 0) + '</td></tr><tr><td>Containers looted</td><td>' + (ss.containersLooted || 0) +
      '</td></tr><tr><td>Days survived</td><td>' + (ss.daysSurvived || 0) + '</td></tr><tr><td>Level</td><td>' + ((s && s.player && s.player.level) || 1) + '</td></tr>';
    box.appendChild(t);
    const r = el('button', 'big-btn', 'RESUME');
    r.addEventListener('click', () => ui.close());
    box.appendChild(r);
    const q = el('button', 'small-btn', 'SAVE & QUIT TO TITLE');
    q.addEventListener('click', quitToTitle);
    box.appendChild(q);
    box.appendChild(el('div', 'sv-keys', 'WASD move · Shift sprint · R reload · 1/2/3 weapons · E interact · H heal · F flashlight · I inventory · K tech · C craft · B build · Tab map · M mute'));
    pn.appendChild(box);
  };
  RENDER.dead = function (pn) {
    const s = st(); const ss = (s && s.stats) || {};
    const box = el('div', 'sv-center');
    box.appendChild(el('h2', 'dead sv-h2', 'YOU DIED'));
    const t = el('table', 'stats');
    t.innerHTML = '<tr><td>Days survived</td><td>' + (ss.daysSurvived || 0) + '</td></tr><tr><td>Kills</td><td>' + (ss.kills || 0) +
      '</td></tr><tr><td>Deaths</td><td>' + (ss.deaths || 0) + '</td></tr>';
    box.appendChild(t);
    box.appendChild(el('p', 'sv-deadmsg', 'Your backpack contents were dropped where you died.'));
    box.appendChild(el('p', 'sv-deadsub', 'Equipment, levels and tech are kept. Find your bag to recover your loot.'));
    const r = el('button', 'big-btn', 'RESPAWN');
    r.addEventListener('click', () => {
      if (SV.game && SV.game.respawn) call(SV.game, 'respawn');
      forceClose();
    });
    box.appendChild(r);
    const q = el('button', 'small-btn', 'SAVE & QUIT TO TITLE');
    q.addEventListener('click', () => {
      if (SV.game && SV.game.respawn) call(SV.game, 'respawn'); // respawn first so the save isn't a corpse
      quitToTitle();
    });
    box.appendChild(q);
    pn.appendChild(box);
  };

  function quitToTitle() {
    if (SV.game && SV.game.quitToTitle) call(SV.game, 'quitToTitle');
    else if (Z.game && Z.game.toTitle) { forceClose(); call(Z.game, 'toTitle'); }
    ui.refreshTitle();
  }

  function forceClose() {
    const s = st();
    const was = cur && cur.name;
    cur = null;
    if (overlay) overlay.classList.add('hidden');
    hideTooltip();
    dragSrc = null;
    if (s && s.mode === 'survival') {
      if (s.ui && OVERLAYS.indexOf(s.ui) >= 0) s.ui = null;
      if (was === 'pause' && s.screen === 'paused') s.screen = 'playing';
      document.body.classList.remove('menu');
    }
  }

  // ------------------------------------------------------------------ title buttons
  function hasSave() { return !!(SV.save && call(SV.save, 'has')); }
  function startNew() {
    if (Z.audio && Z.audio.init) Z.audio.init();
    if (hasSave() && typeof confirm === 'function' && !confirm('Start a new survival game? Your existing save will be overwritten.')) return;
    if (!SV.game || !SV.game.newGame) { console.error('Z.sv.game.newGame missing'); return; }
    forceClose();
    call(SV.game, 'newGame');
    toasts = []; feed = []; banner = null;
    syncArcade();
  }
  function startContinue() {
    if (Z.audio && Z.audio.init) Z.audio.init();
    if (!SV.game) return;
    forceClose();
    if (SV.game.continueGame) call(SV.game, 'continueGame'); else call(SV.game, 'newGame');
    toasts = []; feed = []; banner = null;
    syncArcade();
  }

  // ------------------------------------------------------------------ keys
  const KEYMAP = { KeyI: 'inventory', KeyK: 'tech', KeyC: 'craft', Tab: 'map', KeyN: 'map' };
  function onKeyCapture(e) {
    if (!isSurvival()) return;
    if (e.code === 'Tab') e.preventDefault();
    if (!cur) return;
    const name = cur.name;
    let handled = false;
    if (KEYMAP[e.code]) {
      handled = true;
      if (!e.repeat && name !== 'pause' && name !== 'dead') {
        const target = KEYMAP[e.code];
        const same = name === target || (name === 'workbench' && ((target === 'tech' && (cur.tab || 'tech') === 'tech') || (target === 'craft' && cur.tab === 'craft')));
        if (same) ui.close();
        else if (name === 'workbench' && (target === 'tech' || target === 'craft')) { cur.tab = lastTab.workbench = target; rerender(); }
        else ui.open(target);
      }
    } else if (e.code === 'KeyE' && (name === 'loot' || name === 'stash' || name === 'workbench')) {
      handled = true; if (!e.repeat) ui.close();
    } else if (e.code === 'KeyF' && (name === 'loot' || name === 'stash')) {
      handled = true; if (!e.repeat) takeAll();
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }
  function onKeyBubble(e) {
    if (!isSurvival()) return;
    if (e.code === 'KeyM' && !e.repeat && Z.audio) toast(Z.audio.muted ? 'MUTED' : 'SOUND ON', '#ccc');
  }

  // ------------------------------------------------------------------ public API
  const ui = (SV.ui = {
    init() {
      if (typeof document === 'undefined') return;
      root = document.getElementById('sv-root');
      if (!root) { root = el('div'); root.id = 'sv-root'; document.body.appendChild(root); }
      root.innerHTML = '';
      overlay = el('div', 'sv-overlay hidden');
      overlay.addEventListener('contextmenu', (e) => e.preventDefault());
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && cur && cur.name !== 'dead' && cur.name !== 'pause') ui.close(); });
      panel = el('div', 'sv-panel');
      overlay.appendChild(panel);
      root.appendChild(overlay);
      tooltip = el('div', 'sv-tooltip hidden');
      root.appendChild(tooltip);

      const bn = document.getElementById('btn-survival-new');
      if (bn) bn.addEventListener('click', startNew);
      const bc = document.getElementById('btn-survival-continue');
      if (bc) bc.addEventListener('click', startContinue);

      window.addEventListener('keydown', onKeyCapture, true);
      window.addEventListener('keydown', onKeyBubble);

      if (Z.on) {
        Z.on('sv:toast', (d) => { if (d) toast(d.msg, d.color); });
        Z.on('sv:playerHurt', () => { hurtT0 = now(); });
        Z.on('sv:levelUp', (lvl) => {
          const p = st() && st().player;
          const L = typeof lvl === 'number' ? lvl : (lvl && lvl.level) || (p && p.level) || '';
          showBanner('LEVEL UP', 'LEVEL ' + L + ' · ' + ((p && p.sp) || 0) + ' SKILL POINTS · PRESS K', '#fc3', 3200);
          play('levelUp');
        });
        Z.on('sv:night', () => { showBanner('NIGHTFALL', 'They are faster in the dark', '#8aa0ff', 3200); play('night'); });
        Z.on('sv:day', () => { const s = st(); showBanner('DAY ' + ((s && s.clock && s.clock.day) || ''), 'You made it through the night', '#fd8', 2800); });
        Z.on('sv:horde', () => { showBanner('HORDE INCOMING', 'Defend your base!', '#f22', 4500); play('waveStart'); });
        Z.on('sv:itemAdded', (d) => {
          if (!d || !d.id || !isSurvival() || cur) return; // no feed spam while moving items in overlays
          const t = now();
          const f = feed.find((x) => x.id === d.id && t - x.t0 < 2000);
          if (f) { f.qty += d.qty || 1; f.t0 = t; f.text = null; } else { feed.push({ id: d.id, qty: d.qty || 1, t0: t, text: null }); if (feed.length > 5) feed.shift(); }
        });
      }
      ui.refreshTitle();
    },

    refreshTitle() {
      if (typeof document === 'undefined') return;
      const bc = document.getElementById('btn-survival-continue');
      if (bc) bc.classList.toggle('hidden', !hasSave());
      if (!isSurvival()) {
        cur = null;
        if (overlay) overlay.classList.add('hidden');
        hideTooltip();
        toasts = []; feed = []; banner = null;
      }
    },

    open(name, data) {
      const s = st();
      if (!name) { ui.close(); syncArcade(); return; }
      if (!s) return;
      if (name === 'build') { // HUD-only mode
        if (cur) forceClose();
        s.ui = 'build';
        syncArcade();
        return;
      }
      if (OVERLAYS.indexOf(name) < 0) { console.warn('sv-ui: unknown overlay', name); return; }
      if (s.screen === 'dead' && name !== 'dead') return;
      if (cur && cur.name === 'dead' && name !== 'dead') return;
      if (s.ui === 'build' && SV.base && SV.base.exitBuild) call(SV.base, 'exitBuild', s);
      if (name === 'loot' && !(cur && cur.name === 'loot' && cur.data === data)) play('open');
      if (name === 'stash' || name === 'workbench') play('open');
      if (name === 'pause' && s.screen === 'playing') s.screen = 'paused';
      if (cur && cur.name === 'pause' && name !== 'pause' && s.screen === 'paused') s.screen = 'playing';
      const keepData = data !== undefined ? data : (cur && cur.name === name ? cur.data : null);
      if (keepData && ['stash', 'workbench'].includes(name) && !s.structures.includes(keepData)) return;
      cur = { name, data: keepData, tab: name === 'workbench' ? (lastTab.workbench || 'tech') : null };
      if (name === 'tech' || name === 'workbench') selectedNode = null;
      s.ui = name;
      if (overlay) overlay.classList.remove('hidden');
      syncArcade();
      rerender();
    },

    close() {
      const s = st();
      if (cur && cur.name === 'dead' && s && s.screen === 'dead') return; // must press Respawn
      if (!cur) {
        if (s && s.ui === 'build') { if (SV.base && SV.base.exitBuild) call(SV.base, 'exitBuild', s); s.ui = null; }
        else if (s && s.ui) s.ui = null;
        if (isSurvival()) document.body.classList.remove('menu');
        return;
      }
      forceClose();
    },

    isOpen() { return !!cur; },
    current() { return cur ? cur.name : null; },
    target() { return cur ? cur.data : null; },
    toast,
    refresh: rerender,

    // ------------------------------------------------------------------ HUD
    drawHUD(state, ctx) {
      if (!state || !ctx) return;
      if (syncedState !== state) syncArcade();
      // reconcile: someone cleared state.ui behind our back
      if (cur && state.ui !== cur.name) { cur = null; if (overlay) overlay.classList.add('hidden'); hideTooltip(); document.body.classList.remove('menu'); }
      const W = Z.W || 1280, H = Z.H || 720, t = now();
      const sc = clamp(Math.min(W / 1280, H / 720), 0.75, 1.6);
      const LW = W / sc, LH = H / sc;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const p = state.player;

      // vignettes (full res)
      const hurtAge = t - hurtT0;
      if (hurtAge < 450) vignette(ctx, W, H, 0.55 * (1 - hurtAge / 450), '180,0,0');
      if (p && !p.dead && p.maxHp && p.hp / p.maxHp < 0.3) vignette(ctx, W, H, 0.14 + 0.1 * Math.sin(t / 150), '180,0,0');
      if (p && (p.food <= 0 || p.water <= 0)) vignette(ctx, W, H, 0.12 + 0.05 * Math.sin(t / 300), '120,90,0');

      // minimap (full-res coordinates, top-right)
      const mm = Math.round(clamp(190 * sc, 150, 300));
      const mmX = W - mm - Math.round(16 * sc), mmY = Math.round(16 * sc);
      if (SV.worldRender && SV.worldRender.drawMinimap) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(mmX - 3, mmY - 3, mm + 6, mm + 6);
        ctx.save();
        ctx.beginPath(); ctx.rect(mmX, mmY, mm, mm); ctx.clip();
        try { SV.worldRender.drawMinimap(ctx, state, mmX, mmY, mm, mm); } catch (err) { /* ignore */ }
        ctx.restore();
        ctx.strokeStyle = '#5a1a1a'; ctx.lineWidth = 2; ctx.strokeRect(mmX - 1, mmY - 1, mm + 2, mm + 2);
      }

      ctx.scale(sc, sc);
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';

      // clock under minimap
      drawClock(ctx, state, LW - 16, (mmY + mm) / sc + 26, t);

      if (p) {
        drawVitals(ctx, p, state, 20, LH - 20, t);
        drawLevel(ctx, p, 20, 22, t);
        drawWeapon(ctx, p, state, LW - 20, LH - 20, t, LW);
      }

      // interaction prompt + search bar
      drawInteract(ctx, state, LW / 2, LH / 2 + 90, t);

      // build mode bar
      if (state.ui === 'build') drawBuildBar(ctx, state, LW / 2, LH - 24);

      // banners
      drawBannerHUD(ctx, LW, LH, t);

      // toasts (center-top)
      toasts = toasts.filter((o) => t - o.t0 < 3200);
      ctx.textAlign = 'center'; ctx.font = '22px ' + FONT;
      for (let i = 0; i < toasts.length; i++) {
        const o = toasts[i], age = t - o.t0;
        const a = age < 150 ? age / 150 : age > 2600 ? 1 - (age - 2600) / 600 : 1;
        ctx.globalAlpha = clamp(a, 0, 1);
        outlined(ctx, o.text, LW / 2, 130 + i * 28, o.color);
      }
      ctx.globalAlpha = 1;

      // pickup feed (right, above weapon)
      feed = feed.filter((f) => t - f.t0 < 2600);
      ctx.textAlign = 'right'; ctx.font = '17px ' + FONT;
      for (let i = 0; i < feed.length; i++) {
        const f = feed[i];
        if (!f.text) f.text = '+' + f.qty + ' ' + itemName(f.id);
        const age = t - f.t0;
        ctx.globalAlpha = clamp(age > 2000 ? 1 - (age - 2000) / 600 : 1, 0, 1);
        const d = itemDef(f.id);
        outlined(ctx, f.text, LW - 20, LH - 200 - (feed.length - 1 - i) * 22, d ? rarityColor(d.rarity) : '#ddd');
      }
      ctx.globalAlpha = 1;

      // first-play key hints
      if (!hintsSeen && p && !cur) {
        if (state.time > 75) { hintsSeen = true; try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* ignore */ } }
        else drawHints(ctx, LW, LH, state.time || 0);
      }
      ctx.restore();
    },
  });

  // ------------------------------------------------------------------ HUD pieces
  const cache = {};
  function cached(key, val, fn) { const c = cache[key]; if (c && c.v === val) return c.s; const s = fn(val); cache[key] = { v: val, s }; return s; }
  let modsCache = null, modsT = -1e9, ammoCache = {}, ammoT = -1e9, clockCache = '', clockT = -1e9;
  function getMods(state, t) {
    if (t - modsT > 300) { modsT = t; modsCache = (SV.prog && SV.prog.playerMods) ? call(SV.prog, 'playerMods', state) || null : null; }
    return modsCache;
  }

  function outlined(ctx, text, x, y, color) {
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function vignette(ctx, W, H, alpha, rgb) {
    if (alpha <= 0) return;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(' + rgb + ',0)');
    g.addColorStop(1, 'rgba(' + rgb + ',' + alpha.toFixed(3) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function bar(ctx, x, y, w, h, frac, color, border, alpha) {
    frac = clamp(frac || 0, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x, y, w, h);
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.fillStyle = color; ctx.fillRect(x, y, w * frac, h);
    ctx.globalAlpha = 1;
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h); }
  }

  function drawVitals(ctx, p, state, x, bottom, t) {
    const mods = getMods(state, t) || {};
    const bw = 260;
    // stamina
    const sy = bottom - 8;
    const stFrac = p.maxStamina ? p.stamina / p.maxStamina : 0;
    bar(ctx, x, sy, bw, 8, stFrac, stFrac < 0.2 ? '#c96' : '#e6d36a', null);
    // HP
    const hh = 24, hy = sy - 8 - hh;
    const frac = p.maxHp ? clamp(p.hp / p.maxHp, 0, 1) : 0;
    const low = frac < 0.3;
    bar(ctx, x, hy, bw, hh, frac, 'hsl(' + Math.round(frac * 110) + ',75%,42%)', low ? '#f33' : '#666', low ? 0.65 + 0.35 * Math.sin(t / 110) : 1);
    ctx.font = '16px ' + FONT; ctx.textAlign = 'left';
    outlined(ctx, cached('hp', Math.ceil(Math.max(0, p.hp || 0)) + '/' + Math.round(p.maxHp || 0), (v) => 'HP ' + v), x + 8, hy + 18, '#fff');
    // armor shield
    const arm = mods.armor || 0;
    if (arm > 0) {
      const ax = x + bw + 10, ay = hy + 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(ax + 22, ay); ctx.lineTo(ax + 22, ay + 12); ctx.quadraticCurveTo(ax + 11, ay + 26, ax, ay + 12); ctx.closePath();
      ctx.fillStyle = '#4a6c9a'; ctx.fill(); ctx.strokeStyle = '#9cc0f0'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = '15px ' + FONT;
      outlined(ctx, cached('arm', Math.round(arm * 100), (v) => v + '%'), ax + 28, ay + 17, '#9cc0f0');
    }
    // food & water meters
    const my = hy - 12 - 10, mw = (bw - 10) / 2;
    meter(ctx, x, my, mw, p.food, '#d98b3a', 'FOOD', t);
    meter(ctx, x + mw + 10, my, mw, p.water, '#3a9ad9', 'WATER', t);
    // bleeding
    if (p.bleeding > 0) {
      const bx = x + bw + 12, by = my + 2;
      const a = 0.6 + 0.4 * Math.sin(t / 160);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#c00';
      ctx.beginPath(); ctx.moveTo(bx + 8, by - 8); ctx.quadraticCurveTo(bx + 16, by + 4, bx + 8, by + 8); ctx.quadraticCurveTo(bx, by + 4, bx + 8, by - 8); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = '14px ' + FONT; ctx.textAlign = 'left';
      outlined(ctx, 'BLEEDING', bx + 20, by + 6, '#f44');
    }
  }
  function meter(ctx, x, y, w, v, color, label, t) {
    v = typeof v === 'number' ? v : 0;
    const frac = clamp(v / 100, 0, 1);
    const low = frac < 0.2;
    bar(ctx, x, y, w, 10, frac, color, low ? '#f33' : null, low ? 0.6 + 0.4 * Math.sin(t / 200) : 1);
    ctx.font = '13px ' + FONT; ctx.textAlign = 'left';
    outlined(ctx, label, x, y - 4, low ? '#f66' : '#bbb');
    ctx.textAlign = 'right';
    outlined(ctx, cached('m' + label, Math.round(v), (n) => n + '%'), x + w, y - 4, '#ddd');
  }

  function xpFrac(p) {
    const lvl = p.level || 1, xp = p.xp || 0;
    const f = SV.prog && SV.prog.xpForLevel;
    if (typeof f !== 'function') return 0;
    try {
      const base = f(lvl), next = f(lvl + 1);
      if (xp >= base && xp < next && next > base) return (xp - base) / (next - base);   // cumulative curve
      if (base > 0) return xp / base;                                                    // per-level curve
    } catch (e) { /* ignore */ }
    return 0;
  }
  function drawLevel(ctx, p, x, y, t) {
    const lvl = p.level || 1;
    // badge
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y - 2, 44, 44);
    ctx.strokeStyle = '#b00'; ctx.lineWidth = 2; ctx.strokeRect(x, y - 2, 44, 44);
    ctx.textAlign = 'center'; ctx.font = '11px ' + FONT;
    outlined(ctx, 'LVL', x + 22, y + 11, '#a88');
    ctx.font = '24px ' + FONT;
    outlined(ctx, cached('lvl', lvl, String), x + 22, y + 36, '#fff');
    // xp bar
    bar(ctx, x + 52, y + 26, 180, 8, xpFrac(p), '#c9a227', null);
    ctx.font = '13px ' + FONT; ctx.textAlign = 'left';
    outlined(ctx, cached('xp', p.xp || 0, (v) => 'XP ' + v), x + 52, y + 18, '#cc9');
    if (p.sp > 0) {
      const pulse = 0.75 + 0.25 * Math.sin(t / 220);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#a00'; ctx.fillRect(x + 140, y + 4, 92, 18);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center'; ctx.font = '13px ' + FONT;
      outlined(ctx, cached('sp', p.sp, (v) => v + ' SP · [K]'), x + 186, y + 18, '#fff');
    }
  }

  function drawClock(ctx, state, rx, y, t) {
    if (t - clockT > 250) { clockT = t; const l = SV.game && SV.game.timeLabel ? call(SV.game, 'timeLabel', state) : null; clockCache = l || ('Day ' + ((state.clock && state.clock.day) || 1)); }
    const night = !!(SV.game && SV.game.isNight && call(SV.game, 'isNight', state));
    ctx.textAlign = 'right'; ctx.font = '19px ' + FONT;
    outlined(ctx, clockCache, rx - 24, y, night ? '#a8b8ff' : '#e8e0c0');
    // sun / moon icon
    const ix = rx - 9, iy = y - 7;
    if (night) {
      ctx.fillStyle = '#cfd8ff'; ctx.beginPath(); ctx.arc(ix, iy, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1d1a'; ctx.beginPath(); ctx.arc(ix + 4, iy - 3, 7, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.arc(ix, iy, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(ix + Math.cos(a) * 8, iy + Math.sin(a) * 8); ctx.lineTo(ix + Math.cos(a) * 11, iy + Math.sin(a) * 11); ctx.stroke(); }
    }
    const day = (state.clock && state.clock.day) || 1;
    if (day % 3 === 0) {
      ctx.font = '13px ' + FONT;
      outlined(ctx, night ? 'HORDE NIGHT' : 'HORDE TONIGHT', rx, y + 18, night ? '#f44' : '#f96');
    }
  }

  function drawWeapon(ctx, p, state, rx, bottom, t, LW) {
    const inv = p.inv; const eq = inv && inv.equip;
    const active = p.active || 'primary';
    const stack = eq ? eq[active] : null;
    const d = stack ? itemDef(stack.id) : null;
    const w = stack && SV.WEAPONS ? SV.WEAPONS[stack.id] : null;
    ctx.textAlign = 'right';
    // slot strip
    const keys = ['primary', 'secondary', 'melee'];
    const sz = 46, gap = 6, sy = bottom - 128;
    for (let i = 0; i < 3; i++) {
      const sx = rx - (3 - i) * (sz + gap) + gap;
      const k = keys[i], s2 = eq ? eq[k] : null, sel = k === active;
      const dd = s2 ? itemDef(s2.id) : null;
      ctx.fillStyle = sel ? 'rgba(150,0,0,0.75)' : 'rgba(0,0,0,0.55)';
      ctx.fillRect(sx, sy, sz, sz);
      if (dd) {
        ctx.fillStyle = dd.color || '#555';
        ctx.fillRect(sx + 6, sy + 6, sz - 12, sz - 12);
        ctx.textAlign = 'center'; ctx.font = '15px ' + FONT;
        outlined(ctx, dd.glyph || '?', sx + sz / 2, sy + sz / 2 + 6, '#fff');
      }
      ctx.strokeStyle = sel ? '#f55' : dd ? rarityColor(dd.rarity) : '#333'; ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sz, sz);
      ctx.textAlign = 'left'; ctx.font = '12px ' + FONT;
      outlined(ctx, String(i + 1), sx + 3, sy + 13, sel ? '#fff' : '#999');
    }
    // name + ammo
    ctx.textAlign = 'right'; ctx.font = '20px ' + FONT;
    const name = d ? (d.name || stack.id) : (active === 'melee' ? 'Fists' : 'Empty');
    outlined(ctx, cached('wname', name, (v) => String(v).toUpperCase()), rx, bottom - 58, d ? rarityColor(d.rarity) : '#888');
    const isMelee = !w ? (active === 'melee' || !stack) : (w.class === 'melee' || !!w.melee || !w.ammo);
    if (stack && !isMelee) {
      if (t - ammoT > 200) { ammoT = t; ammoCache = {}; }
      const ammoId = w.ammo;
      let total = ammoCache[ammoId];
      if (total === undefined) { total = SV.inv && SV.inv.totalAmmo ? call(SV.inv, 'totalAmmo', state, ammoId) : countItem(ammoId); ammoCache[ammoId] = total = total || 0; }
      const mag = stack.mag || 0;
      const empty = mag === 0;
      ctx.font = '40px ' + FONT;
      outlined(ctx, cached('ammo', mag + '|' + total, () => mag + ' / ' + total), rx, bottom - 18, empty ? '#f44' : '#fff');
      if (p.reloadTimer > 0 && p.reloadTotal > 0) {
        const rp = clamp(1 - p.reloadTimer / p.reloadTotal, 0, 1);
        bar(ctx, rx - 160, bottom - 10, 160, 6, rp, '#fc6', null);
        ctx.font = '14px ' + FONT;
        outlined(ctx, 'RELOADING', rx, bottom - 82, '#fc6');
      } else if (empty && !cur && Math.floor(t / 250) % 2 === 0 && state.ui !== 'build') {
        ctx.textAlign = 'center'; ctx.font = '24px ' + FONT;
        outlined(ctx, total > 0 ? 'RELOAD (R)' : 'NO AMMO', LW / 2, bottom - 160, '#f44');
      }
    } else {
      ctx.font = '22px ' + FONT;
      outlined(ctx, 'MELEE', rx, bottom - 22, '#aaa');
    }
  }

  function drawInteract(ctx, state, cx, y, t) {
    if (cur) return;
    const se = state.search;
    if (se && se.total > 0) {
      const f = clamp(se.t / se.total, 0, 1);
      const label = se.target && (se.target.name || se.target.kind) ? 'SEARCHING ' + String(se.target.name || se.target.kind).replace(/_/g, ' ').toUpperCase() : 'SEARCHING';
      ctx.textAlign = 'center'; ctx.font = '18px ' + FONT;
      outlined(ctx, cached('srch', label, (v) => v + '...'), cx, y - 6, '#fc6');
      bar(ctx, cx - 110, y + 2, 220, 10, f, '#fc6', '#886');
      return;
    }
    const it = state.interact;
    if (it && it.label && state.ui !== 'build') {
      const text = cached('ia', it.label, (v) => (/^\[/.test(v) ? v : '[E] ' + v));
      ctx.font = '19px ' + FONT; ctx.textAlign = 'center';
      const w = ctx.measureText ? ctx.measureText(text).width : 200;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(cx - w / 2 - 12, y - 20, w + 24, 30);
      ctx.strokeStyle = 'rgba(180,0,0,' + (0.5 + 0.3 * Math.sin(t / 250)).toFixed(2) + ')'; ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - w / 2 - 12, y - 20, w + 24, 30);
      outlined(ctx, text, cx, y + 1, '#fff');
    }
  }

  function drawBuildBar(ctx, state, cx, bottom) {
    const type = SV.base && SV.base.selected;
    const def = type && SV.STRUCTURES ? SV.STRUCTURES[type] : null;
    const bw = 620, bh = 64, x = cx - bw / 2, y = bottom - bh - 70;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x, y, bw, bh);
    ctx.strokeStyle = '#b00'; ctx.lineWidth = 2; ctx.strokeRect(x, y, bw, bh);
    ctx.textAlign = 'left'; ctx.font = '13px ' + FONT;
    outlined(ctx, 'BUILD MODE', x + 12, y + 18, '#f55');
    ctx.font = '22px ' + FONT;
    outlined(ctx, def ? String(def.name || type).toUpperCase() : (type ? String(type).toUpperCase() : 'SELECT A STRUCTURE'), x + 12, y + 44, '#fff');
    if (def && def.cost) {
      let cx2 = x + 230;
      ctx.font = '15px ' + FONT;
      for (const id in def.cost) {
        const need = def.cost[id], have = countItem(id);
        const txt = itemName(id) + ' ' + have + '/' + need;
        outlined(ctx, txt, cx2, y + 30, have >= need ? '#9e9' : '#f66');
        cx2 += (ctx.measureText ? ctx.measureText(txt).width : 100) + 18;
        if (cx2 > x + bw - 60) break;
      }
      if (def.desc) { ctx.font = '12px ' + FONT; outlined(ctx, def.desc, x + 230, y + 50, '#999'); }
    }
    ctx.textAlign = 'center'; ctx.font = '13px ' + FONT;
    outlined(ctx, 'Q/E or WHEEL cycle · R rotate · CLICK place · X demolish · RMB/ESC exit', cx, y + bh + 18, '#bbb');
  }

  function drawBannerHUD(ctx, LW, LH, t) {
    if (!banner) return;
    const age = t - banner.t0;
    if (age > banner.dur) { banner = null; return; }
    const f = age / banner.dur;
    const a = f < 0.1 ? f / 0.1 : Math.min(1, (1 - f) / 0.35);
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.textAlign = 'center';
    const sc = 1 + 0.15 * (1 - Math.min(1, f * 5));
    ctx.font = Math.round(72 * sc) + 'px ' + FONT;
    ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(banner.text, LW / 2, LH * 0.3);
    ctx.fillStyle = banner.color; ctx.fillText(banner.text, LW / 2, LH * 0.3);
    if (banner.sub) { ctx.font = '22px ' + FONT; outlined(ctx, banner.sub, LW / 2, LH * 0.3 + 38, '#ddd'); }
    ctx.globalAlpha = 1;
  }

  const HINT_LINES = [
    ['WASD', 'move'], ['SHIFT', 'sprint'], ['CLICK', 'shoot'], ['E', 'search / interact'], ['I', 'inventory'],
    ['C', 'craft'], ['K', 'tech tree'], ['B', 'build'], ['TAB', 'map'], ['H', 'heal'], ['F', 'flashlight'],
  ];
  function drawHints(ctx, LW, LH, time) {
    const a = time < 1 ? time : time > 65 ? Math.max(0, (75 - time) / 10) : 1;
    if (a <= 0) return;
    ctx.globalAlpha = a * 0.95;
    const x = 20, y = 90, lh = 19, w = 200, h = HINT_LINES.length * lh + 34;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#3a1010'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    ctx.textAlign = 'left'; ctx.font = '14px ' + FONT;
    outlined(ctx, 'CONTROLS', x + 10, y + 20, '#d33');
    ctx.font = '14px ' + FONT;
    for (let i = 0; i < HINT_LINES.length; i++) {
      outlined(ctx, HINT_LINES[i][0], x + 10, y + 40 + i * lh, '#d33');
      outlined(ctx, HINT_LINES[i][1], x + 72, y + 40 + i * lh, '#bbb');
    }
    ctx.globalAlpha = 1;
  }
})();
