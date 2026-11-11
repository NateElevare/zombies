// overlays.ts — blocking DOM overlays: inventory, loot, stash, workbench, tech, craft, map, pause, dead.
// Port of legacy/js/sv/sv-ui.js (RENDER.*), upgraded. Overlays re-render on every action (the sim is paused while one is open).
import { AugmentsPanel } from './augments';
import { load as loadAugments } from '../sim/augments';
import type { Container, Drop, EquipKey, GameState, Inventory, Stack, Structure, UiName } from '../sim/types';
import type { ShellApi } from '../shell';
import { RECIPES } from '../sim/items';
import { WEAPONS } from '../sim/combat';
import { toast } from '../sim/core';
import { STRUCTURES, nearStation } from '../sim/base';
import * as inv from '../sim/inventory';
import * as progression from '../sim/progression';
import * as game from '../sim/game';
import * as road from '../sim/road';
import { cloud } from '../net/cloud';
import { el, esc, itemDef, itemIcon, itemName, rarityColor } from './dom';
import { pct, weaponRows } from './format';
import { drawFullMap, getMapImage, worldSize, type MapView } from './mapview';
import { settingsPanel } from './settings';
import { controlsLine, openControls } from './controls';
import * as explore from '../sim/explore';
import { keybinds } from '../keybinds';
import { cloudLabel, info } from './cloudinfo';

type Where = 'player' | 'other' | 'equip' | 'drop';
interface DragSrc { where: Where; ref: number | string }
type Target = Container | Drop | Structure | null;

export const OVERLAY_NAMES: UiName[] = ['inventory', 'loot', 'stash', 'workbench', 'tech', 'craft', 'map', 'pause', 'dead'];
const EQUIP_KEYS: EquipKey[] = ['primary', 'secondary', 'melee', 'head', 'body', 'back'];
const EQUIP_LABEL: Record<string, string> = { primary: 'PRIMARY [1]', secondary: 'SIDEARM [2]', melee: 'MELEE [3]', head: 'HEAD', body: 'BODY', back: 'PACK' };
const isEquippable = (t?: string) => t === 'weapon' || t === 'armor' || t === 'backpack';

export interface OverlayHost {
  /** Ask the host to close the current overlay (sets state.ui = null). */
  close(): void;
  /** Open another overlay by name. */
  open(name: UiName): void;
}

export class Overlays {
  readonly node: HTMLElement;
  private panel: HTMLElement;
  private tip: HTMLElement;
  private state: GameState | null = null;
  private shell: ShellApi | null = null;
  current: UiName | null = null;
  target: Target = null;
  private drag: DragSrc | null = null;
  private tab: 'tech' | 'craft' = 'tech';
  private tree = ''; private selNode = '';
  private mapView: MapView = { cx: 8000, cy: 8000, zoom: 1 };
  private showSettings = false;
  private confirmQuit = false;
  private quitFailed = false;
  private cleanupMap: (() => void) | null = null;

  constructor(root: HTMLElement, private host: OverlayHost) {
    this.node = el('div', 'ov hidden');
    this.node.addEventListener('contextmenu', (e) => e.preventDefault());
    this.node.addEventListener('mousedown', (e) => { if (e.target === this.node && this.current && this.current !== 'dead' && this.current !== 'pause') this.host.close(); });
    this.panel = el('div', 'ov-panel'); this.node.appendChild(this.panel);
    this.tip = el('div', 'tip hidden');
    cloud.on(() => { if (this.current === 'pause' && this.state) this.render(); });
    root.appendChild(this.node); root.appendChild(this.tip);
  }

  attach(state: GameState, shell: ShellApi) { this.state = state; this.shell = shell; this.quitFailed = false; this.hide(); }
  detach() { this.hide(); this.state = null; this.shell = null; }

  show(name: UiName, target: Target) {
    if (!this.state) return;
    const changed = name !== this.current;
    this.current = name; this.target = target;
    if (changed) { this.showSettings = false; this.confirmQuit = false; this.selNode = ''; }
    if (name === 'map' && changed) {
      const p = this.state.player, ws = worldSize(this.state);
      this.mapView = { cx: p?.x ?? ws.w / 2, cy: p?.y ?? ws.h / 2, zoom: 1.6 };
    }
    this.node.classList.remove('hidden');
    this.render();
  }
  hide() {
    this.cleanupMap?.(); this.cleanupMap = null;
    this.current = null; this.target = null; this.drag = null; this.hideTip();
    this.node.classList.add('hidden'); this.panel.replaceChildren();
  }

  // ------------------------------------------------------------------ helpers
  private get s() { return this.state!; }
  private get playerInv() { return this.s.player?.inv ?? null; }
  private other(): Inventory | null {
    const t = this.target as { inv?: Inventory | null } | null;
    if (!t || (this.current !== 'loot' && this.current !== 'stash')) return null;
    return t.inv ?? null;
  }
  /** Is the stash/workbench/drop we are looking at still in the world? */
  targetValid() {
    const s = this.s, t = this.target;
    if (this.current === 'stash' || this.current === 'workbench') return !!t && s.structures.includes(t as Structure) && !(t as Structure).dead;
    if (this.current === 'loot' && t && 'life' in t) return s.drops.includes(t as Drop);
    return true;
  }
  private countItem(id: string) { return this.playerInv ? inv.count(this.playerInv, id) : 0; }
  private used(i: Inventory | null) { return i ? i.slots.reduce((n, x) => n + (x ? 1 : 0), 0) : 0; }
  private nearBench() { return !!nearStation(this.s, 'workbench'); }
  rerender() { if (this.current) this.render(); }

  private render() {
    if (!this.current || !this.state) return;
    this.cleanupMap?.(); this.cleanupMap = null;
    this.hideTip();
    const scrollers = Array.from(this.panel.querySelectorAll<HTMLElement>('[data-scroll]')).map((n) => [n.dataset.scroll!, n.scrollLeft, n.scrollTop] as const);
    this.panel.replaceChildren();
    this.panel.className = 'ov-panel p-' + this.current;
    try {
      switch (this.current) {
        case 'inventory': this.rInventory(); break;
        case 'loot': this.rTransfer(); break;
        case 'stash': this.rTransfer(); break;
        case 'tech': this.panel.appendChild(this.header('TECH TREE', 'K to close')); this.rTech(); break;
        case 'craft': this.panel.appendChild(this.header('CRAFTING', 'C to close')); this.rCraft(); break;
        case 'workbench': this.rWorkbench(); break;
        case 'map': this.rMap(); break;
        case 'pause': this.rPause(); break;
        case 'dead': this.rDead(); break;
        default: break;
      }
    } catch (err) {
      console.error('ui render failed', this.current, err);
      this.panel.appendChild(el('div', 'empty', 'UI error: ' + (err as Error).message));
    }
    for (const [k, l, t] of scrollers) { const n = this.panel.querySelector<HTMLElement>(`[data-scroll="${k}"]`); if (n) { n.scrollLeft = l; n.scrollTop = t; } }
  }

  private header(title: string, sub?: string, closable = true) {
    const h = el('div', 'head'); h.appendChild(el('div', 'title', title));
    if (sub) h.appendChild(el('div', 'sub', sub));
    if (closable) { const x = el('button', 'close', '×'); x.title = 'Close (Esc)'; x.addEventListener('click', () => this.host.close()); h.appendChild(x); }
    return h;
  }
  private tabs(list: { id: string; name: string; icon?: string; badge?: string }[], active: string, pick: (id: string) => void) {
    const bar = el('div', 'tabs');
    for (const t of list) {
      const b = el('button', 'tab' + (t.id === active ? ' active' : ''));
      b.innerHTML = (t.icon ? `<span class="tab-ic">${esc(t.icon)}</span>` : '') + esc(t.name) + (t.badge ? `<span class="badge">${esc(t.badge)}</span>` : '');
      b.addEventListener('click', () => pick(t.id)); bar.appendChild(b);
    }
    return bar;
  }

  // ------------------------------------------------------------------ slots
  private slot(stack: Stack | null, where: Where, ref: number | string, extra = ''): HTMLElement {
    const s = el('div', 'slot' + (extra ? ' ' + extra : '') + (stack ? ' filled' : ''));
    if (stack) {
      const d = itemDef(stack.id);
      s.style.setProperty('--rar', rarityColor(d?.rarity));
      s.appendChild(itemIcon(stack.id));
      if (stack.qty > 1) s.appendChild(el('span', 'qty', String(stack.qty)));
      if (d?.type === 'weapon' && typeof stack.mag === 'number') {
        const w = WEAPONS[stack.id];
        if (w && w.ammo) s.appendChild(el('span', 'mag', stack.mag + '/' + w.magSize));
      }
      s.draggable = true;
      s.addEventListener('dragstart', (e) => {
        this.drag = { where, ref }; this.hideTip();
        try { e.dataTransfer!.setData('text/plain', where + ':' + ref); e.dataTransfer!.effectAllowed = 'move'; } catch { /* ignore */ }
        s.classList.add('dragging');
      });
      s.addEventListener('dragend', () => { s.classList.remove('dragging'); this.drag = null; this.node.querySelectorAll('.drop-hi').forEach((n) => n.classList.remove('drop-hi')); });
      s.addEventListener('mouseenter', (e) => this.showTip(stack, where, e));
      s.addEventListener('mousemove', (e) => this.moveTip(e));
      s.addEventListener('mouseleave', () => this.hideTip());
    }
    s.addEventListener('dragover', (e) => { if (this.drag) { e.preventDefault(); s.classList.add('drop-hi'); } });
    s.addEventListener('dragleave', () => s.classList.remove('drop-hi'));
    s.addEventListener('drop', (e) => { e.preventDefault(); s.classList.remove('drop-hi'); if (this.drag) this.handleDrop(this.drag, { where, ref }); this.drag = null; });
    s.addEventListener('click', (e) => { if (stack) this.slotClick(where, ref, e.shiftKey ? 'shift' : 'left'); });
    s.addEventListener('contextmenu', (e) => { e.preventDefault(); if (stack) this.slotClick(where, ref, 'right'); });
    return s;
  }

  private slotClick(where: Where, ref: number | string, btn: 'left' | 'right' | 'shift') {
    if (!this.targetValid()) return;
    const s = this.s, pinv = this.playerInv; if (!pinv) return;
    this.hideTip();
    const oi = this.other();
    if (where === 'equip') inv.unequip(s, ref as EquipKey);
    else if (where === 'other') {
      if (!oi) return;
      if (btn === 'right') {
        const before = pinv.slots.map(stack => ({ stack, qty: stack?.qty }));
        inv.moveSlot(oi, ref as number, pinv);
        const idx = pinv.slots.findIndex((x, i) => x && (x !== before[i].stack || x.qty !== before[i].qty));
        if (idx >= 0) this.useOrEquip(idx, true);
      } else inv.moveSlot(oi, ref as number, pinv);
    } else {
      const i = ref as number; if (!pinv.slots[i]) return;
      if (btn === 'shift') inv.drop(s, i);
      else if (oi && btn === 'left') inv.moveSlot(pinv, i, oi);
      else this.useOrEquip(i, btn === 'right');
    }
    this.render();
  }

  /** preferUse (right click): use first, then equip. Left click: equip first, then use. */
  private useOrEquip(idx: number, preferUse: boolean) {
    const s = this.s, pinv = this.playerInv!, stack = pinv.slots[idx]; if (!stack) return;
    const d = itemDef(stack.id), canUse = d?.type === 'consumable' && !!d.use, canEquip = isEquippable(d?.type);
    if (preferUse ? canUse : !canEquip && canUse) { if (inv.use(s, idx) === false) toast(s, "Can't use that right now", '#c88'); }
    else if (canEquip) inv.equip(s, idx);
    else toast(s, itemName(stack.id) + ' is a crafting material', '#999');
  }

  private handleDrop(src: DragSrc, dst: DragSrc) {
    if (!this.targetValid()) return;
    const s = this.s, pinv = this.playerInv; if (!pinv) return;
    if (src.where === dst.where && String(src.ref) === String(dst.ref)) return;
    const oi = this.other();
    if (dst.where === 'drop') {
      if (src.where === 'player') inv.drop(s, src.ref as number);
      else if (src.where === 'equip') {
        const moved = inv.unequip(s, src.ref as EquipKey);
        if (moved && moved.inv === pinv) inv.drop(s, moved.index);
      }
      this.render(); return;
    }
    if (dst.where === 'equip') {
      if (src.where === 'player') {
        const d = itemDef(pinv.slots[src.ref as number]?.id ?? '');
        if (isEquippable(d?.type)) inv.equip(s, src.ref as number); else toast(s, "That doesn't go there", '#c88');
      } else if (src.where === 'other' && oi) {
        const before = pinv.slots.slice();
        inv.moveSlot(oi, src.ref as number, pinv);
        const idx = pinv.slots.findIndex((x, i) => x && x !== before[i]);
        if (idx >= 0 && isEquippable(itemDef(pinv.slots[idx]!.id)?.type)) inv.equip(s, idx);
      }
      this.render(); return;
    }
    const to = dst.where === 'player' ? pinv : dst.where === 'other' ? oi : null;
    if (src.where === 'equip') {
      const moved = inv.unequip(s, src.ref as EquipKey); // backpack shrink may land the stack in an overflow drop
      if (moved && to) inv.moveSlot(moved.inv, moved.index, to, Number(dst.ref));
      this.render(); return;
    }
    const from = src.where === 'player' ? pinv : src.where === 'other' ? oi : null;
    if (from && to) inv.moveSlot(from, Number(src.ref), to, Number(dst.ref));
    this.render();
  }

  takeAll() {
    if (!this.state || !this.targetValid()) return;
    const pinv = this.playerInv, oi = this.other(); if (!pinv || !oi) return;
    inv.takeAll(oi, pinv);
    const after = this.used(oi);
    if (after > 0) toast(this.s, 'Backpack full - some items left behind', '#f84');
    if (after === 0 && this.current === 'loot') { this.host.close(); return; }
    this.render();
  }

  // ------------------------------------------------------------------ tooltip
  private tipHtml(stack: Stack, where: Where) {
    const d = itemDef(stack.id), rc = rarityColor(d?.rarity);
    let h = `<div class="tt-name" style="color:${rc}">${esc(d?.name ?? stack.id)}${(stack.lvl ?? 1) > 1 ? ` <span class="tt-lvl">+${(stack.lvl ?? 1) - 1}</span>` : ''}${stack.qty > 1 ? ` <span class="tt-x">x${stack.qty}</span>` : ''}</div>`;
    h += `<div class="tt-sub"><span style="color:${rc}">${esc((d?.rarity ?? 'common').toUpperCase())}</span> ${esc((d?.type ?? '').toUpperCase())}${d?.slot ? ' &middot; ' + esc(String(d.slot).toUpperCase()) : ''}</div>`;
    if (d?.desc) h += `<div class="tt-desc">${esc(d.desc)}</div>`;
    let rows: [string, string][] = [];
    if (d?.type === 'weapon') {
      const ws = progression.weaponStats(this.s, stack.id, stack.lvl);
      const ammo = WEAPONS[stack.id]?.ammo;
      rows = weaponRows(ws, stack.mag, ammo ? itemName(ammo) : '', ammo ? this.countItem(ammo) : 0);
    } else if (d?.type === 'armor') rows.push(['Armor', pct(inv.gearArmor(stack))]);
    else if (d?.type === 'backpack') rows.push(['Slots', '+' + inv.packSlots(stack)]);
    if (inv.upgradable(stack.id)) rows.push(['Level', (stack.lvl ?? 1) + ' / ' + inv.GEAR_MAX]);
    else if (d?.use) {
      const u = d.use;
      if (u.heal) rows.push(['Heal', '+' + u.heal]); if (u.food) rows.push(['Food', '+' + u.food]);
      if (u.water) rows.push(['Water', '+' + u.water]); if (u.stamina) rows.push(['Stamina', '+' + u.stamina]);
      if (u.stopBleed) rows.push(['Stops bleeding', 'yes']); if (u.time) rows.push(['Use time', u.time + 's']);
    }
    if (rows.length) h += '<table class="tt-stats">' + rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('') + '</table>';
    const xfer = this.current === 'loot' || this.current === 'stash';
    let hint: string;
    if (where === 'equip') hint = 'Click: unequip';
    else if (where === 'other') hint = 'Click: take · Right-click: take & use';
    else if (xfer) hint = 'Click: store · Right-click: ' + (d?.use ? 'use' : 'equip') + ' · Shift: drop';
    else if (inv.upgradable(stack.id) && Object.values(this.s.player.inv.equip).some(e => e?.id === stack.id)) hint = 'Spare copy: use it to upgrade your equipped one (Upgrade gear, left) · Click: equip';
    else if (isEquippable(d?.type)) hint = 'Click: equip · Shift: drop';
    else if (d?.use) hint = 'Click: use · Shift: drop';
    else hint = 'Shift-click: drop · Drag to move';
    return h + `<div class="tt-hint">${esc(hint)}</div>`;
  }
  private showTip(stack: Stack, where: Where, e: MouseEvent) {
    if (this.drag || !this.state) return;
    this.tip.innerHTML = this.tipHtml(stack, where); this.tip.classList.remove('hidden'); this.moveTip(e);
  }
  private moveTip(e: MouseEvent) {
    if (this.tip.classList.contains('hidden')) return;
    const w = this.tip.offsetWidth, h = this.tip.offsetHeight;
    let x = e.clientX + 18, y = e.clientY + 18;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
    this.tip.style.left = x + 'px'; this.tip.style.top = y + 'px';
  }
  private hideTip() { this.tip.classList.add('hidden'); }

  // ------------------------------------------------------------------ inventory pieces
  private grid(i: Inventory | null, where: Where, cols: number) {
    const g = el('div', 'grid'); g.style.setProperty('--cols', String(cols));
    if (!i) { g.appendChild(el('div', 'empty', 'Nothing here')); return g; }
    for (let n = 0; n < i.slots.length; n++) g.appendChild(this.slot(i.slots[n], where, n));
    return g;
  }
  private paperdoll() {
    const p = this.s.player, doll = el('div', 'doll');
    doll.innerHTML = '<svg class="doll-sil" viewBox="0 0 100 200"><circle cx="50" cy="26" r="17"/><path d="M26 54h48l8 56-14 4-4 76H36l-4-76-14-4z"/></svg>';
    for (const k of EQUIP_KEYS) {
      const wrap = el('div', 'eqw eqw-' + k);
      wrap.appendChild(el('div', 'eq-cap', EQUIP_LABEL[k]));
      wrap.appendChild(this.slot(p.inv.equip[k], 'equip', k, 'eq' + (p.active === k ? ' active' : '')));
      doll.appendChild(wrap);
    }
    return doll;
  }
  private statBox() {
    const s = this.s, p = s.player, mods = progression.playerMods(s);
    const rows: [string, string][] = [
      ['Health', Math.ceil(p.hp) + ' / ' + Math.round(p.maxHp)], ['Armor', pct(mods.armor)],
      ...(s.mode === 'survival' ? [['Food', Math.round(p.food) + '%'], ['Water', Math.round(p.water) + '%']] as [string, string][] : []),
      ['Level', p.level + (p.sp ? '  (' + p.sp + ' SP)' : '')],
    ];
    const box = el('div', 'statbox');
    box.innerHTML = '<table>' + rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('') + '</table>';
    return box;
  }
  /** Upgrade equipped weapons / armor / backpack with spare copies of the same item. */
  private gearBox() {
    const box = el('div', 'gearbox');
    box.appendChild(el('div', 'gb-h', 'UPGRADE GEAR'));
    let any = false;
    const fmt = (stat: string, v: number) => stat === 'Armor' ? pct(v) : stat === 'Slots' ? '+' + v : String(Math.round(v));
    for (const key of inv.GEAR_KEYS) {
      const u = inv.gearUpgrade(this.s, key);
      if (!u) continue;
      any = true;
      const row = el('div', 'gb-row');
      const info = el('div', 'gb-info');
      info.appendChild(el('div', 'gb-name', `${u.name}  LV ${u.level}`));
      info.appendChild(el('div', 'gb-sub', u.next === null ? `Max level · ${u.stat.toLowerCase()} ${fmt(u.stat, u.value)}`
        : `${u.stat} ${fmt(u.stat, u.value)} → ${fmt(u.stat, u.next)} · uses ${u.need} spare (have ${u.have})`));
      row.appendChild(info);
      const b = el('button', 'btn gb-btn' + (u.ok ? '' : ' off'), u.next === null ? 'MAX' : 'UPGRADE') as HTMLButtonElement;
      b.disabled = !u.ok;
      b.addEventListener('click', () => { if (inv.upgradeGear(this.s, key)) this.render(); });
      row.appendChild(b);
      box.appendChild(row);
    }
    if (!any) box.appendChild(el('div', 'gb-sub', 'Equip a weapon, armor or backpack, then spend spare copies of it here to level it up.'));
    return box;
  }
  private dropZone() {
    const dz = el('div', 'dropzone', 'DROP ON GROUND'); dz.title = 'Drag an item here to drop it (or shift-click it)';
    dz.addEventListener('dragover', (e) => { if (this.drag && this.drag.where !== 'other') { e.preventDefault(); dz.classList.add('drop-hi'); } });
    dz.addEventListener('dragleave', () => dz.classList.remove('drop-hi'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drop-hi'); if (this.drag) this.handleDrop(this.drag, { where: 'drop', ref: 0 }); this.drag = null; });
    return dz;
  }
  private col(title: string, i: Inventory | null, where: Where, scrollKey: string, cols: number) {
    const c = el('div', 'col'), h = el('div', 'col-head');
    h.innerHTML = `${esc(title)} <span class="dim">${this.used(i)} / ${i ? i.slots.length : 0}</span>`;
    c.appendChild(h);
    const sc = el('div', 'scroll'); sc.dataset.scroll = scrollKey; sc.appendChild(this.grid(i, where, cols)); c.appendChild(sc);
    return c;
  }

  private rInventory() {
    this.panel.appendChild(this.header('INVENTORY', 'I to close'));
    const body = el('div', 'body row');
    const left = el('div', 'col col-doll'); left.dataset.scroll = 'doll';   // scrolls when the upgrade list doesn't fit
    left.appendChild(el('div', 'col-head', 'EQUIPMENT')); left.appendChild(this.paperdoll()); left.appendChild(this.statBox()); left.appendChild(this.gearBox());
    body.appendChild(left);
    const right = this.col('BACKPACK', this.playerInv, 'player', 'pinv', (this.playerInv?.size ?? 0) > 30 ? 8 : 6);
    right.appendChild(this.dropZone());
    right.appendChild(el('div', 'help', 'Click equip/use · Right-click use · Shift-click drop · Drag to rearrange'));
    body.appendChild(right); this.panel.appendChild(body);
  }

  private title(): string {
    const t = this.target as (Container & Drop & Structure) | null;
    if (!t) return 'LOOT';
    if (t.kind === 'deathbag') return 'YOUR BACKPACK';
    if (t.type && STRUCTURES[t.type]) return STRUCTURES[t.type].name.toUpperCase();
    if (t.name) return String(t.name).toUpperCase();
    if (t.kind === 'loot') return 'LOOT BAG';
    return String(t.kind || 'LOOT').replace(/_/g, ' ').toUpperCase();
  }
  private rTransfer() {
    const t = this.target as (Container & Drop & Structure) | null;
    const sub = this.current === 'stash' ? (t?.type === 'turret' ? 'Load 9mm ammo to arm the turret' : 'Base storage') : t?.kind === 'deathbag' ? 'Everything you carried' : '';
    this.panel.appendChild(this.header(this.title(), sub));
    const body = el('div', 'body row');
    body.appendChild(this.col('YOUR BACKPACK', this.playerInv, 'player', 'pinv', 6));
    const oi = this.other(), right = this.col(this.title(), oi, 'other', 'oinv', oi && oi.slots.length <= 8 ? 4 : 6);
    if (oi && this.used(oi) === 0 && this.current === 'loot') right.querySelector('.scroll')!.prepend(el('div', 'empty', 'Empty.'));
    const btns = el('div', 'btnrow'), ta = el('button', 'btn primary', 'TAKE ALL  [F]');
    ta.disabled = !oi || this.used(oi) === 0; ta.addEventListener('click', () => this.takeAll());
    btns.appendChild(ta); right.appendChild(btns);
    right.appendChild(el('div', 'help', 'Click to move across · Drag to place · E / Esc to close'));
    body.appendChild(right); this.panel.appendChild(body);
  }

  // ------------------------------------------------------------------ tech tree
  private owns(id: string) { return !!this.s.player.tech?.[id]; }
  private rTech() {
    const s = this.s, p = s.player, trees = progression.treesFor(s);
    const wrap = el('div', 'body techwrap');
    if (!trees.length) { wrap.appendChild(el('div', 'empty', 'No tech trees available.')); this.panel.appendChild(wrap); return; }
    const tree = trees.find((t) => t.id === this.tree) ?? trees[0]; this.tree = tree.id;
    const top = el('div', 'techtop');
    top.appendChild(this.tabs(trees.map((t) => ({ id: t.id, name: t.name, icon: t.icon, badge: t.nodes.filter((n) => this.owns(n.id)).length + '/' + t.nodes.length })), tree.id, (id) => { this.tree = id; this.selNode = ''; this.render(); }));
    const spb = el('div', 'sp' + (p.sp > 0 ? ' has' : '')); spb.innerHTML = `<b>${p.sp || 0}</b> SKILL POINTS`; top.appendChild(spb);
    wrap.appendChild(top);
    if (tree.workbench && s.mode === 'survival' && !this.nearBench()) wrap.appendChild(el('div', 'notice', 'Requires a workbench at your base. Stand near one to unlock these upgrades.'));
    const main = el('div', 'techmain'), box = el('div', 'techgraph'); box.dataset.scroll = 'tech-' + tree.id;
    const CW = 170, RH = 96, PAD = 24, NW = 140, NH = 64, nodes = tree.nodes;
    let maxC = 0, maxR = 0; for (const n of nodes) { maxC = Math.max(maxC, n.col); maxR = Math.max(maxR, n.row); }
    const GW = PAD * 2 + maxC * CW + NW, GH = PAD * 2 + maxR * RH + NH, u = (n: number) => n / 16 + 'em';
    const inner = el('div', 'techinner'); inner.style.width = u(GW); inner.style.height = u(GH);
    const byId: Record<string, (typeof nodes)[number]> = {}; for (const n of nodes) byId[n.id] = n;
    const pos = (n: { col: number; row: number }) => ({ x: PAD + n.col * CW, y: PAD + n.row * RH });
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${GW} ${GH}`); svg.setAttribute('class', 'techsvg'); svg.style.width = u(GW); svg.style.height = u(GH);
    for (const n of nodes) for (const rid of n.requires) {
      const r = byId[rid]; if (!r) continue;
      const a = pos(r), b = pos(n), x1 = a.x + NW / 2, y1 = a.y + NH / 2, x2 = b.x + NW / 2, y2 = b.y + NH / 2;
      const path = document.createElementNS(NS, 'path');
      const d = Math.abs(a.x - b.x) > Math.abs(a.y - b.y)
        ? `M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`
        : `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;
      path.setAttribute('d', d);
      path.setAttribute('class', 'link' + (this.owns(rid) ? (this.owns(n.id) ? ' owned' : ' open') : ''));
      svg.appendChild(path);
    }
    inner.appendChild(svg);
    for (const n of nodes) {
      const owned = this.owns(n.id), reqMet = n.requires.every((r) => this.owns(r));
      const can = !owned && progression.canUnlock(s, n.id).ok;
      const b = el('div', 'node ' + (owned ? 'owned' : reqMet ? (can ? 'available can' : 'available') : 'locked') + (this.selNode === n.id ? ' sel' : ''));
      const ps = pos(n); b.style.left = u(ps.x); b.style.top = u(ps.y); b.style.width = u(NW); b.style.height = u(NH);
      const items = Object.keys(progression.itemCost(s, n)).length;
      b.innerHTML = `<div class="node-name">${esc(n.name)}</div><div class="node-cost">${owned ? '✔ OWNED' : esc(n.cost.sp + ' SP' + (items ? ' + items' : ''))}</div>`;
      b.title = n.desc; b.addEventListener('click', () => { this.selNode = n.id; this.render(); });
      inner.appendChild(b);
    }
    box.appendChild(inner); main.appendChild(box);
    // detail
    const det = el('div', 'techdet');
    const node = byId[this.selNode] ?? nodes.find((n) => !this.owns(n.id) && n.requires.every((r) => this.owns(r))) ?? nodes[0];
    if (node) {
      this.selNode = node.id;
      det.appendChild(el('div', 'det-name', node.name)); det.appendChild(el('div', 'det-desc', node.desc));
      if (node.requires.length) {
        const rq = el('div', 'det-req');
        rq.innerHTML = 'Requires: ' + node.requires.map((rid) => `<span class="${this.owns(rid) ? 'ok' : 'bad'}">${esc(byId[rid]?.name ?? rid)}</span>`).join(', ');
        det.appendChild(rq);
      }
      const ul = el('ul', 'cost'), spHave = p.sp || 0, spNeed = node.cost.sp;
      ul.innerHTML = `<li class="${spHave >= spNeed ? 'ok' : 'bad'}"><span>Skill points</span><b>${spHave} / ${spNeed}</b></li>` +
        Object.entries(progression.itemCost(s, node)).map(([id, need]) => { const have = this.countItem(id); return `<li class="${have >= need ? 'ok' : 'bad'}"><span>${esc(itemName(id))}</span><b>${have} / ${need}</b></li>`; }).join('');
      det.appendChild(ul);
      if (this.owns(node.id)) det.appendChild(el('div', 'det-owned', '✔ UNLOCKED'));
      else {
        const chk = progression.canUnlock(s, node.id);
        if (!chk.ok && chk.reason) det.appendChild(el('div', 'det-reason', chk.reason));
        const btn = el('button', 'btn primary', 'UNLOCK'); btn.disabled = !chk.ok;
        btn.addEventListener('click', () => { progression.unlock(this.s, node.id); this.render(); });
        det.appendChild(btn);
      }
    }
    main.appendChild(det); wrap.appendChild(main); this.panel.appendChild(wrap);
  }

  // ------------------------------------------------------------------ crafting
  private rCraft() {
    const s = this.s, body = el('div', 'body craftbody');
    const atBench = this.nearBench();
    const list = el('div', 'recipes'); list.dataset.scroll = 'craft';
    const rows = RECIPES.map((r) => ({ r, ok: inv.canCraft(s, r.id).ok })).sort((a, b) => Number(b.ok) - Number(a.ok));
    for (const { r, ok } of rows) {
      const row = el('div', 'recipe' + (ok ? ' ok' : '')), od = itemDef(r.out.id);
      row.appendChild(itemIcon(r.out.id));
      const mid = el('div', 'recipe-mid');
      mid.innerHTML = `<div class="recipe-name" style="color:${rarityColor(od?.rarity)}">${esc(r.name)}${r.out.qty > 1 ? ` <span class="dim">x${r.out.qty}</span>` : ''}` +
        (r.station ? ` <span class="station ${atBench ? 'ok' : 'bad'}">${esc(r.station.toUpperCase())}</span>` : '') + '</div>' +
        '<div class="ings">' + Object.keys(r.in).map((id) => { const need = r.in[id], have = this.countItem(id); return `<span class="ing ${have >= need ? 'ok' : 'bad'}">${esc(itemName(id))} <b>${have}/${need}</b></span>`; }).join('') + '</div>';
      row.appendChild(mid);
      const btn = el('button', 'btn' + (ok ? ' primary' : ''), 'CRAFT'); btn.disabled = !ok;
      btn.addEventListener('click', () => {
        if (!inv.craft(this.s, r.id)) toast(this.s, inv.canCraft(this.s, r.id).reason ?? 'Cannot craft', '#f66');
        this.render();
      });
      row.appendChild(btn); list.appendChild(row);
    }
    body.appendChild(list);
    if (!atBench && RECIPES.some((r) => r.station)) body.appendChild(el('div', 'help', 'Workbench recipes need you standing near a workbench (B to build one).'));
    this.panel.appendChild(body);
  }
  private rWorkbench() {
    this.panel.appendChild(this.header('WORKBENCH'));
    this.panel.appendChild(this.tabs([{ id: 'tech', name: 'Tech Trees' }, { id: 'craft', name: 'Crafting' }], this.tab, (id) => { this.tab = id as 'tech' | 'craft'; this.render(); }));
    if (this.tab === 'craft') this.rCraft(); else this.rTech();
  }
  setTab(t: 'tech' | 'craft') { this.tab = t; if (this.current === 'workbench') this.render(); }
  get workbenchTab() { return this.tab; }

  // ------------------------------------------------------------------ map
  private rMap() {
    const pctSeen = this.s.mode === 'survival' ? `Explored ${Math.max(1, Math.round(explore.fraction(this.s) * 100))}% · ` : '';
    this.panel.appendChild(this.header('MAP', `${pctSeen}${keybinds.text('map')} to close · Wheel to zoom · Drag to pan`));
    const body = el('div', 'body mapbody'), wrap = el('div', 'mapwrap'), cv = el('canvas', 'mapcanvas');
    wrap.appendChild(cv); body.appendChild(wrap); this.panel.appendChild(body);
    getMapImage(this.s);
    let raf = 0;
    const draw = () => {
      raf = 0;
      const r = wrap.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(200, Math.floor(r.width)), H = Math.max(200, Math.floor(r.height));
      if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
      const ctx = cv.getContext('2d'); if (!ctx || !this.state) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFullMap(ctx, this.state, this.mapView, W, H);
    };
    const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const v = this.mapView, ws = worldSize(this.s), r = cv.getBoundingClientRect(), size = Math.min(r.width, r.height);
      const k0 = (size / Math.max(ws.w, ws.h)) * v.zoom;
      const wx = v.cx + (e.clientX - r.left - r.width / 2) / k0, wy = v.cy + (e.clientY - r.top - r.height / 2) / k0;
      v.zoom = Math.max(0.8, Math.min(10, v.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      const k1 = (size / Math.max(ws.w, ws.h)) * v.zoom;
      v.cx = wx - (e.clientX - r.left - r.width / 2) / k1; v.cy = wy - (e.clientY - r.top - r.height / 2) / k1; redraw();
    }, { passive: false });
    let dragging = false, lx = 0, ly = 0;
    cv.addEventListener('mousedown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; cv.classList.add('grab'); });
    const release = () => { dragging = false; cv.classList.remove('grab'); };
    window.addEventListener('mouseup', release);
    this.cleanupMap = () => { window.removeEventListener('mouseup', release); if (raf) cancelAnimationFrame(raf); };
    cv.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const ws = worldSize(this.s), r = cv.getBoundingClientRect(), k = (Math.min(r.width, r.height) / Math.max(ws.w, ws.h)) * this.mapView.zoom;
      this.mapView.cx -= (e.clientX - lx) / k; this.mapView.cy -= (e.clientY - ly) / k; lx = e.clientX; ly = e.clientY; redraw();
    });
    redraw();
  }

  // ------------------------------------------------------------------ pause / dead
  private quit() {
    if (this.shell!.quitToTitle()) return;
    this.host.open('pause');
    this.quitFailed = true; this.confirmQuit = false; this.render();
  }
  private statsTable(rows: [string, string | number][]) {
    const t = el('table', 'stats');
    t.innerHTML = rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join(''); return t;
  }
  private rPause() {
    const s = this.s, box = el('div', 'center');
    box.appendChild(el('h2', 'h2', 'PAUSED'));
    if (s.mode === 'survival') {
      box.appendChild(el('div', 'sub big', game.timeLabel(s)));
      box.appendChild(this.statsTable([['Kills', s.stats.kills], ['Containers looted', s.stats.containersLooted], ['Days survived', s.stats.daysSurvived], ['Level', s.player.level]]));
    } else if (s.arcade) box.appendChild(this.statsTable([['Wave', s.arcade.wave], ['Score', Math.floor(s.arcade.score)], ['Best', Math.floor(s.arcade.best)]]));
    else if (s.road) {
      const m = road.missionOf(s);
      box.appendChild(el('div', 'sub big', `MISSION ${s.road.mission + 1} · ${m.title.toUpperCase()}`));
      box.appendChild(this.statsTable([['Objective', road.objectiveText(s)], ['Kills this mission', s.road.missionKills], ['Level', s.player.level], ['Deaths', s.road.totals.deaths]]));
    }
    if (cloud.user) box.appendChild(el('div', 'cloud-pill st-' + cloud.status, 'Cloud: ' + (cloud.status === 'synced' ? '✓ ' : '') + cloudLabel()));
    if (this.quitFailed) box.appendChild(el('div', 'form-err', 'Save failed - storage unavailable. Your run is still open. Retry saving or explicitly quit without saving.'));
    if (this.showSettings) {
      box.appendChild(settingsPanel(this.shell!));
      const back = el('button', 'btn', 'BACK'); back.addEventListener('click', () => { this.showSettings = false; this.render(); }); box.appendChild(back);
    } else {
      const r = el('button', 'big-btn', 'RESUME'); r.addEventListener('click', () => this.host.close()); box.appendChild(r);
      const st = el('button', 'btn', 'SETTINGS'); st.addEventListener('click', () => { this.showSettings = true; this.render(); }); box.appendChild(st);
      const ct = el('button', 'btn', 'CONTROLS'); ct.addEventListener('click', () => openControls()); box.appendChild(ct);
      const q = el('button', 'btn danger', s.mode === 'survival' ? 'SAVE & QUIT TO TITLE' : s.mode === 'road' ? (this.confirmQuit ? 'CONFIRM: QUIT (BACK TO LAST CHECKPOINT)' : 'QUIT TO TITLE') : this.confirmQuit ? 'CONFIRM: QUIT (ARCADE RUN LOST)' : 'QUIT TO TITLE');
      q.addEventListener('click', () => { if (!this.confirmQuit && s.mode !== 'survival') { this.confirmQuit = true; this.render(); return; } this.quit(); });
      box.appendChild(q);
      if (s.mode === 'road') box.appendChild(el('p', 'deadsub', 'Progress is saved at every checkpoint. Quitting now returns you to the start of this mission.'));
      if (this.quitFailed) {
        const discard = el('button', 'btn danger', this.confirmQuit ? 'CONFIRM: QUIT WITHOUT SAVING' : 'QUIT WITHOUT SAVING');
        discard.addEventListener('click', () => {
          if (!this.confirmQuit) { this.confirmQuit = true; this.render(); return; }
          this.shell!.quitToTitle(true);
        });
        box.appendChild(discard);
      }
      box.appendChild(el('div', 'keys', controlsLine()));
    }
    this.panel.appendChild(box);
  }
  private rDead() {
    const s = this.s, box = el('div', 'center dead');
    box.appendChild(el('h2', 'h2 dead', 'YOU DIED'));
    if (s.mode === 'survival') {
      box.appendChild(this.statsTable([['Days survived', s.stats.daysSurvived], ['Kills', s.stats.kills], ['Level', s.player.level], ['Deaths', s.stats.deaths]]));
      box.appendChild(el('p', 'deadmsg', 'Your backpack contents were dropped where you died.'));
      box.appendChild(el('p', 'deadsub', 'Equipment, levels and tech are kept. Find your bag to recover your loot.'));
      const r = el('button', 'big-btn', 'RESPAWN'); r.addEventListener('click', () => game.respawn(this.s)); box.appendChild(r);
      const q = el('button', 'btn', 'SAVE & QUIT TO TITLE');
      q.addEventListener('click', () => { game.respawn(this.s); this.quit(); }); box.appendChild(q);
    } else if (s.mode === 'road' && s.road) {
      const r = s.road, m = road.missionOf(s);
      box.appendChild(el('div', 'sub big', `MISSION ${r.mission + 1} · ${m.title.toUpperCase()}`));
      box.appendChild(this.statsTable([['Objective', road.objectiveText(s)], ['Kills this attempt', r.missionKills], ['Attempts', r.missionDeaths + 1], ['Level', s.player.level]]));
      box.appendChild(el('p', 'deadmsg', 'The mission restarts from its checkpoint.'));
      box.appendChild(el('p', 'deadsub', 'Weapons, ammo, level and skills are restored to what you had when the mission began.'));
      const rb = el('button', 'big-btn', 'RESTART MISSION'); rb.addEventListener('click', () => road.restart(this.s)); box.appendChild(rb);
      const q = el('button', 'btn', 'QUIT TO TITLE'); q.addEventListener('click', () => this.shell!.quitToTitle(true)); box.appendChild(q);
    } else {
      const a = s.arcade, best = a ? Math.floor(a.best) : 0, score = a ? Math.floor(a.score) : 0;
      if (a && score >= best && score > 0) box.appendChild(el('div', 'newbest', 'NEW BEST!'));
      const rows: [string, string | number][] = [['Wave reached', a?.wave ?? 0], ['Kills', s.stats.kills], ['Bosses killed', a?.bossKills ?? 0], ['Score', score], ['Best', best], ['Cores earned', '+' + (a?.coresEarned ?? 0)]];
      if (cloud.user) rows.push(['Best (cloud)', Math.max(best, info.snap?.arcadeBest ?? 0)]);
      box.appendChild(this.statsTable(rows));
      const r = el('button', 'big-btn', 'PLAY AGAIN'); r.addEventListener('click', () => this.shell!.newArcade()); box.appendChild(r);
      const g = el('button', 'btn', `AUGMENTS (${loadAugments().cores} cores)`);
      g.addEventListener('click', () => new AugmentsPanel(document.getElementById('ui-root') ?? document.body, () => this.render()).open());
      box.appendChild(g);
      const q = el('button', 'btn', 'QUIT TO TITLE'); q.addEventListener('click', () => this.shell!.quitToTitle()); box.appendChild(q);
    }
    this.panel.appendChild(box);
  }
}
