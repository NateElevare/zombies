// levelup.ts — arcade card picker (state.ui === 'levelup'), plus the upgrade icons the HUD loadout reuses.
// The sim owns the offer (state.arcade.run.offer); this only renders it and calls upgrades.choose().
import type { GameState, GadgetId, PassiveId, UpgradeCard } from '../sim/types';
import * as upgrades from '../sim/upgrades';
import { GADGETS, PASSIVES } from '../sim/upgrades';
import { el, setCls } from './dom';

// 24x24 line icons, drawn in currentColor.
const ICONS: Record<string, string> = {
  saw: '<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 2l2 3.2 3.6-1.3.3 3.8 3.8.3-1.3 3.6L22 12l-3.2 2 1.3 3.6-3.8.3-.3 3.8-3.6-1.3L12 22l-2-3.2-3.6 1.3-.3-3.8-3.8-.3 1.3-3.6L2 12l3.2-2-1.3-3.6 3.8-.3.3-3.8 3.6 1.3z"/>',
  molotov: '<path d="M10 9h4v2.5c2 1 3 2.5 3 4.5v5a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-5c0-2 1-3.5 3-4.5z"/><path d="M10.5 6h3v3h-3z"/><path d="M12 6c-1.5-1.5-.5-3 .5-4 .3 1.5 2 2 1 4" fill="currentColor"/>',
  drone: '<path d="M6 6l12 12M18 6L6 18"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="currentColor"/>',
  coil: '<path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6.2z" fill="currentColor" fill-opacity=".25"/>',
  frag: '<circle cx="11" cy="14" r="6.5"/><path d="M8 10.5l6 7M14 10.5l-6 7"/><path d="M9.5 7.5h4V5h-4zM13.5 6l4.5-2.5"/>',
  hollow: '<path d="M9 21V10c0-3 1.5-6 3-8 1.5 2 3 5 3 8v11z"/><path d="M12 2v4M9 14h6"/>',
  mag: '<path d="M8 3h7l-1 18H7z"/><path d="M8.5 7h6M8.2 11h6M7.9 15h6"/>',
  powder: '<path d="M12 2l1.8 5.2L19 5l-2.2 5.2L22 12l-5.2 1.8L19 19l-5.2-2.2L12 22l-1.8-5.2L5 19l2.2-5.2L2 12l5.2-1.8L5 5l5.2 2.2z" fill="currentColor" fill-opacity=".25"/>',
  adren: '<path d="M2 12h5l2-5 3 10 2.5-7 1.5 2h6"/>',
  kevlar: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M12 6v12" />',
  magnet: '<path d="M6 3v9a6 6 0 0 0 12 0V3"/><path d="M6 3h3v4H6zM15 3h3v4h-3z" fill="currentColor"/>',
  fuel: '<path d="M6 6h9l3 3v12H6z"/><path d="M8 3h5v3H8zM9 11l6 6M15 11l-6 6"/>',
  gold: '<circle cx="12" cy="12" r="8"/><path d="M14.5 8.5h-3.5a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9.5M12 6.5v11"/>',
  heal: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor" fill-opacity=".25"/>',
};
export function upgradeIcon(id: string, color: string): HTMLElement {
  const box = el('div', 'up-ic');
  box.style.color = color;
  box.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">${ICONS[id] ?? ''}</svg>`;
  return box;
}
const isGadget = (id: string): id is GadgetId => id in GADGETS;
const isPassive = (id: string): id is PassiveId => id in PASSIVES;

function cardInfo(s: GameState, c: UpgradeCard) {
  const run = s.arcade!.run!;
  if (c.kind === 'evolve' && isGadget(c.id)) {
    const g = GADGETS[c.id];
    return { name: g.evoName, color: '#ffcf4a', tag: 'EVOLUTION', desc: g.evo, hint: `${g.name} + ${PASSIVES[g.pair].name}`, ok: true };
  }
  if (c.kind === 'gadget' && isGadget(c.id)) {
    const g = GADGETS[c.id], owned = upgrades.passiveLevel(run, g.pair) > 0;
    return { name: g.name, color: g.color, tag: c.level === 1 ? 'NEW GADGET' : 'GADGET', desc: g.levels[c.level - 1], hint: `Evolves with ${PASSIVES[g.pair].name}` + (owned ? ' ✓' : ''), ok: owned };
  }
  if (c.kind === 'passive' && isPassive(c.id)) {
    const p = PASSIVES[c.id], pairs = upgrades.GADGET_IDS.filter((id) => GADGETS[id].pair === c.id);
    const owned = pairs.some((id) => upgrades.gadget(run, id));
    return { name: p.name, color: p.color, tag: c.level === 1 ? 'NEW PASSIVE' : 'PASSIVE', desc: p.desc,
      hint: pairs.length ? `Evolves ${pairs.map((id) => GADGETS[id].name).join(', ')}` + (owned ? ' ✓' : '') : 'No evolution', ok: owned };
  }
  if (c.kind === 'gold') return { name: 'Bounty', color: '#ffcf4a', tag: 'BONUS', desc: `+${upgrades.goldValue(s)} score`, hint: 'Everything is maxed', ok: false };
  return { name: 'Patch Up', color: '#79bd73', tag: 'BONUS', desc: 'Heal 50% of max HP', hint: 'Everything is maxed', ok: false };
}

export class LevelUp {
  readonly node: HTMLElement;
  private cards: HTMLElement;
  private sub: HTMLElement;
  private shownFor: unknown = null;   // the offer array currently rendered
  private openedAt = 0;
  private now = 0;
  private state: GameState | null = null;
  private rerollBtn!: HTMLButtonElement;

  constructor(root: HTMLElement) {
    this.node = el('div', 'lvlup hidden');
    const head = el('div', 'lu-head');
    head.appendChild(el('div', 'lu-t', 'LEVEL UP'));
    this.sub = el('div', 'lu-s'); head.appendChild(this.sub);
    this.node.appendChild(head);
    this.cards = el('div', 'lu-cards'); this.node.appendChild(this.cards);
    const foot = el('div', 'lu-foot'); foot.innerHTML = 'Press the card number or click a card';
    this.node.appendChild(foot);
    this.rerollBtn = el('button', 'btn lu-reroll hidden') as HTMLButtonElement;
    this.rerollBtn.addEventListener('click', (e) => { e.stopPropagation(); this.reroll(); });
    this.node.appendChild(this.rerollBtn);
    root.appendChild(this.node);
  }

  attach(s: GameState | null) { this.state = s; this.shownFor = null; this.node.classList.add('hidden'); }

  /** Choose card i (keyboard / click). Ignored for a moment after opening so held keys and clicks don't misfire. */
  pick(i: number) {
    const s = this.state;
    if (!s || this.now - this.openedAt < 0.3) return;
    if (upgrades.choose(s, i)) this.shownFor = null;
  }

  /** Spend a reroll (Second Opinion augment). */
  reroll() {
    const s = this.state;
    if (!s || this.now - this.openedAt < 0.3) return;
    if (upgrades.reroll(s)) this.shownFor = null;
  }

  update(s: GameState, dt: number) {
    this.now += dt;
    const run = s.arcade?.run, open = s.ui === 'levelup' && s.screen === 'playing' && !!run?.offer;
    setCls(this.node, 'hidden', !open);
    if (!open || !run || run.offer === this.shownFor) return;
    this.shownFor = run.offer;
    this.openedAt = this.now;
    this.sub.textContent = `LEVEL ${run.level - run.pending + 1} · CHOOSE AN UPGRADE` + (run.pending > 1 ? ` · ${run.pending - 1} MORE` : '');
    this.cards.replaceChildren();
    const rr = run.rerolls ?? 0;
    setCls(this.rerollBtn, 'hidden', rr <= 0);
    this.rerollBtn.innerHTML = `<kbd>R</kbd> REROLL (${rr} left)`;
    run.offer!.forEach((c, i) => {
      const info = cardInfo(s, c);
      const card = el('button', 'lu-card' + (c.kind === 'evolve' ? ' evo' : ''));
      card.style.setProperty('--cc', info.color);
      card.style.animationDelay = (i * 0.06).toFixed(2) + 's';
      card.appendChild(el('kbd', 'lu-k', String(i + 1)));
      card.appendChild(el('div', 'lu-tag', info.tag));
      card.appendChild(upgradeIcon(c.kind === 'evolve' ? c.id : c.id, info.color));
      card.appendChild(el('div', 'lu-name', info.name));
      if (c.level > 0 && c.kind !== 'evolve') {
        const pips = el('div', 'lu-pips');
        for (let k = 1; k <= upgrades.MAX_LEVEL; k++) pips.appendChild(el('i', k < c.level ? 'on' : k === c.level ? 'new' : ''));
        card.appendChild(pips);
      } else if (c.kind === 'evolve') card.appendChild(el('div', 'lu-evo-badge', 'MAX + PAIR'));
      card.appendChild(el('div', 'lu-desc', info.desc));
      card.appendChild(el('div', 'lu-hint' + (info.ok ? ' ok' : ''), info.hint));
      card.addEventListener('click', (e) => { e.stopPropagation(); this.pick(i); });
      this.cards.appendChild(card);
    });
  }
}
