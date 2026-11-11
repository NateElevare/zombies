// armory.ts — arcade weapon locker (state.ui === 'armory'). Weapons you pick up in arcade are stored here
// instead of replacing what you hold; click one to swap it into its slot. The run is paused while it is open.
import type { GameState, Stack } from '../sim/types';
import * as arcade from '../sim/arcade';
import * as inv from '../sim/inventory';
import * as progression from '../sim/progression';
import { WEAPONS } from '../sim/combat';
import { el, itemIcon, itemName, rarityColor, itemDef } from './dom';

const SLOTS = [['primary', 'PRIMARY', '1'], ['secondary', 'SIDEARM', '2'], ['melee', 'MELEE', '3']] as const;

export class Armory {
  readonly node: HTMLElement;
  private body: HTMLElement;
  private state: GameState | null = null;
  private key = '';

  constructor(root: HTMLElement, private close: () => void) {
    this.node = el('div', 'armory hidden');
    const panel = el('div', 'arm-panel');
    const head = el('div', 'arm-head');
    head.appendChild(el('div', 'arm-t', 'ARMORY'));
    head.appendChild(el('div', 'arm-s', 'GAME PAUSED'));
    panel.appendChild(head);
    this.body = el('div', 'arm-body'); panel.appendChild(this.body);
    const foot = el('div', 'arm-foot');
    foot.innerHTML = 'Click a stored weapon to equip it · picking up a weapon you own levels it up · <kbd>I</kbd> / <kbd>Esc</kbd> close';
    panel.appendChild(foot);
    this.node.appendChild(panel);
    this.node.addEventListener('mousedown', (e) => { e.stopPropagation(); if (e.target === this.node) this.close(); });
    root.appendChild(this.node);
  }

  attach(s: GameState | null) { this.state = s; this.key = ''; this.node.classList.add('hidden'); }

  update(s: GameState) {
    const open = s.ui === 'armory' && s.screen === 'playing' && !!s.arcade;
    this.node.classList.toggle('hidden', !open);
    if (!open) { this.key = ''; return; }
    const e = s.player.inv.equip, box = s.arcade!.armory ?? [];
    const key = [e.primary, e.secondary, e.melee, ...box].map(x => x ? `${x.id}:${x.lvl ?? 1}:${x.mag ?? 0}` : '-').join('|') + s.player.active;
    if (key === this.key) return;
    this.key = key;
    this.render(s);
  }

  private card(s: GameState, st: Stack, onClick?: () => void, label?: string) {
    const d = itemDef(st.id), w = WEAPONS[st.id], ws = progression.weaponStats(s, st.id, st.lvl), lvl = inv.gearLevel(st);
    const c = el(onClick ? 'button' : 'div', 'arm-card' + (onClick ? ' pick' : ''));
    c.style.setProperty('--cc', rarityColor(d?.rarity));
    if (label) c.appendChild(el('div', 'arm-lbl', label));
    c.appendChild(itemIcon(st.id, 'arm-ic'));
    const info = el('div', 'arm-info');
    info.appendChild(el('div', 'arm-name', itemName(st.id) + (lvl > 1 ? ` +${lvl - 1}` : '')));
    const stats = [`DMG ${Math.round(ws.damage * (ws.pellets > 1 ? ws.pellets : 1))}`];
    if (w?.ammo) stats.push(`${(1 / ws.fireRate).toFixed(1)}/s`, `MAG ${ws.magSize}`);
    else if (ws.melee) stats.push('MELEE');
    info.appendChild(el('div', 'arm-stats', stats.join(' · ')));
    const pips = el('div', 'arm-pips');
    for (let k = 1; k <= inv.GEAR_MAX; k++) pips.appendChild(el('i', k <= lvl ? 'on' : ''));
    info.appendChild(pips);
    c.appendChild(info);
    if (onClick) c.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
    return c;
  }

  private render(s: GameState) {
    this.body.replaceChildren();
    const e = s.player.inv.equip, box = s.arcade!.armory ?? [];
    const eq = el('div', 'arm-eq');
    for (const [slot, label, k] of SLOTS) {
      const st = e[slot];
      const wrap = el('div', 'arm-slot' + (s.player.active === slot ? ' active' : ''));
      wrap.appendChild(el('kbd', 'arm-k', k));
      if (st) wrap.appendChild(this.card(s, st, undefined, label));
      else { const c = el('div', 'arm-card empty'); c.appendChild(el('div', 'arm-lbl', label)); c.appendChild(el('div', 'arm-name', 'Empty')); wrap.appendChild(c); }
      eq.appendChild(wrap);
    }
    this.body.appendChild(el('div', 'arm-h', 'EQUIPPED'));
    this.body.appendChild(eq);
    this.body.appendChild(el('div', 'arm-h', `STORED (${box.length}/${arcade.ARMORY_MAX})`));
    const list = el('div', 'arm-list');
    box.forEach((st, i) => {
      const slot = itemDef(st.id)?.slot;
      list.appendChild(this.card(s, st, () => { if (arcade.armoryEquip(s, i)) this.key = ''; }, 'EQUIP AS ' + (SLOTS.find(x => x[0] === slot)?.[1] ?? '')));
    });
    if (!box.length) list.appendChild(el('div', 'arm-empty', 'No stored weapons yet. Weapons zombies drop land here when that slot is already full.'));
    this.body.appendChild(list);
  }
}
