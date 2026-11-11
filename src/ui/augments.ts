// augments.ts — the arcade AUGMENTS screen: spend cores on permanent upgrades (sim/augments.ts).
// Opened from the title screen's arcade card and from the arcade death screen. Self-contained full-screen panel.
import * as aug from '../sim/augments';
import { el } from './dom';

export class AugmentsPanel {
  readonly node: HTMLElement;
  private meta = aug.load();
  private confirmRespec = false;

  constructor(private root: HTMLElement, private onClose: () => void) {
    this.node = el('div', 'augs');
    this.node.addEventListener('mousedown', (e) => { e.stopPropagation(); if (e.target === this.node) this.close(); });
    this.node.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.close(); } });
    root.appendChild(this.node);
    this.render();
  }
  close() { this.node.remove(); window.removeEventListener('keydown', this.esc, true); this.onClose(); }
  private esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); } };
  open() { window.addEventListener('keydown', this.esc, true); return this; }

  private render() {
    const m = this.meta, n = this.node;
    n.replaceChildren();
    const panel = el('div', 'aug-panel');
    const head = el('div', 'aug-head');
    const t = el('div', 'aug-title'); t.appendChild(el('div', 'aug-t', 'AUGMENTS')); t.appendChild(el('div', 'aug-s', 'Permanent upgrades for every arcade run'));
    head.appendChild(t);
    const bank = el('div', 'aug-bank');
    bank.appendChild(el('span', 'aug-core'));
    bank.appendChild(el('b', '', String(m.cores)));
    bank.appendChild(el('span', 'aug-bank-l', 'CORES'));
    head.appendChild(bank);
    const x = el('button', 'btn aug-x', 'CLOSE'); x.addEventListener('click', () => this.close()); head.appendChild(x);
    panel.appendChild(head);
    panel.appendChild(el('div', 'aug-help', 'Earn cores by playing arcade: every wave cleared, your score, and each boss killed. Cores are banked when a run ends (or you quit).'));

    const tree = el('div', 'aug-tree');
    for (const b of aug.BRANCHES) {
      const col = el('div', 'aug-col'); col.style.setProperty('--ac', b.color);
      const ch = el('div', 'aug-ch'); ch.appendChild(el('div', 'aug-cn', b.name)); ch.appendChild(el('div', 'aug-cd', b.desc)); col.appendChild(ch);
      // order: roots first, then children under their parent
      const list = aug.AUGS.filter(a => a.branch === b.id);
      const ordered: aug.AugDef[] = [];
      const add = (parent: string | undefined, depth: number) => { for (const a of list.filter(q => q.req === parent)) { ordered.push(a); (a as aug.AugDef & { depth?: number }).depth = depth; add(a.id, depth + 1); } };
      add(undefined, 0);
      for (const a of ordered) col.appendChild(this.node_(a, (a as aug.AugDef & { depth?: number }).depth ?? 0));
      tree.appendChild(col);
    }
    panel.appendChild(tree);

    const foot = el('div', 'aug-foot');
    const spent = aug.spent(m);
    foot.appendChild(el('span', '', `Spent ${spent} · earned ${m.earned} in total`));
    const r = el('button', 'btn aug-respec' + (this.confirmRespec ? ' warn' : ''), this.confirmRespec ? 'CLICK AGAIN TO REFUND ALL' : 'REFUND ALL') as HTMLButtonElement;
    r.disabled = spent === 0;
    r.addEventListener('click', () => {
      if (!this.confirmRespec) { this.confirmRespec = true; this.render(); return; }
      aug.respec(m); this.confirmRespec = false; this.render();
    });
    foot.appendChild(r);
    panel.appendChild(foot);
    n.appendChild(panel);
  }

  private node_(a: aug.AugDef, depth: number) {
    const m = this.meta, lvl = aug.level(m, a.id), cost = aug.cost(m, a.id), open = aug.unlocked(m, a.id), ok = aug.canBuy(m, a.id);
    const card = el('button', 'aug-node' + (lvl >= a.max ? ' max' : '') + (!open ? ' locked' : '') + (ok ? ' buy' : '') + (lvl > 0 ? ' own' : '')) as HTMLButtonElement;
    card.style.marginLeft = depth * 0.9 + 'em';
    if (depth) card.appendChild(el('span', 'aug-link'));
    const top = el('div', 'aug-ntop');
    top.appendChild(el('div', 'aug-nn', a.name));
    top.appendChild(el('div', 'aug-lv', `${lvl}/${a.max}`));
    card.appendChild(top);
    const pips = el('div', 'aug-pips');
    for (let i = 0; i < a.max; i++) pips.appendChild(el('i', i < lvl ? 'on' : ''));
    card.appendChild(pips);
    card.appendChild(el('div', 'aug-nd', lvl > 0 ? a.total(lvl) : a.per));
    let foot: string;
    if (lvl >= a.max) foot = 'MAXED';
    else if (!open) foot = `Requires ${aug.AUG[a.req!].name}`;
    else foot = (lvl > 0 ? `Next: ${a.total(lvl + 1)} · ` : '') + `${cost} cores`;
    card.appendChild(el('div', 'aug-nf' + (ok ? ' ok' : ''), foot));
    card.disabled = !ok;
    card.title = ok ? 'Click to buy' : lvl >= a.max ? 'Maxed' : !open ? 'Locked' : 'Not enough cores';
    card.addEventListener('click', () => { if (aug.buy(m, a.id)) { this.confirmRespec = false; this.render(); } });
    return card;
  }
}
