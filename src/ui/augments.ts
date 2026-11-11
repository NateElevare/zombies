// augments.ts — the arcade AUGMENTS screen: spend cores on permanent upgrades (sim/augments.ts).
// Opened from the title screen's arcade card and from the arcade death screen. Self-contained full-screen panel.
import * as aug from '../sim/augments';
import { el } from './dom';
import { setModal } from '../keybinds';
import { GADGETS } from '../sim/upgrades';
import type { GadgetId } from '../sim/types';

export class AugmentsPanel {
  readonly node: HTMLElement;
  private meta = aug.load();
  private confirmRespec = false;
  private branch: aug.AugBranch | 'all' = 'all';
  private error = '';

  constructor(private root: HTMLElement, private onClose: () => void, private duringRun = false) {
    this.node = el('div', 'augs');
    this.node.addEventListener('mousedown', (e) => { e.stopPropagation(); if (e.target === this.node) this.close(); });
    this.node.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.close(); } });
    root.appendChild(this.node);
    this.render();
  }
  close() { this.node.remove(); setModal(null); window.removeEventListener('keydown', this.esc, true); this.onClose(); }
  private esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); } };
  open() { setModal(()=>this.close()); window.addEventListener('keydown', this.esc, true); return this; }

  private render() {
    this.meta=aug.load();
    const m = this.meta, n = this.node, scroll=n.querySelector('.aug-panel')?.scrollTop||0;
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
    panel.appendChild(el('div', 'aug-help', 'Cores enter your bank during the fight as you clear waves, reach score milestones, and defeat bosses. Spend them on K skills now, or save them for augments and future runs.'));
    panel.appendChild(el('div','aug-help',this.duringRun?'Changes here apply on your NEXT run. Permanent skills in K apply immediately.':'Press K during Arcade for permanent weapon and survivor skill trees. Both use this core bank.'));
    if (this.error) panel.appendChild(el('div','form-err',this.error));
    const loadout=el('div','aug-loadout');
    loadout.appendChild(el('strong','','STARTING GADGET · choose one'));
    for (const id of [undefined,...Object.keys(GADGETS) as GadgetId[]]) {
      const owned=!id||aug.level(m,'starter_'+id)>0;
      const b=el('button','btn'+(m.starter===id?' primary':''),id?GADGETS[id].name:'None');
      b.disabled=!owned;b.setAttribute('aria-pressed',String(m.starter===id));
      b.title=owned?'Starts at level 1 next run':'Unlock this kit in Arsenal first';
      b.addEventListener('click',()=>{this.error=aug.selectStarter(m,id)?'':'Could not save your loadout.';this.render();});
      loadout.appendChild(b);
    }
    panel.appendChild(loadout);
    const filters=el('div','aug-filters');
    for (const b of [{id:'all' as const,name:'ALL BRANCHES'},...aug.BRANCHES]) {
      const button=el('button','btn'+(this.branch===b.id?' primary':''),b.name);
      button.setAttribute('aria-pressed',String(this.branch===b.id));
      button.addEventListener('click',()=>{this.branch=b.id;this.render();});filters.appendChild(button);
    }
    panel.appendChild(filters);

    const tree = el('div', 'aug-tree');
    for (const b of aug.BRANCHES) {
      if (this.branch!=='all'&&this.branch!==b.id) continue;
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
    if (this.branch!=='all') tree.classList.add('filtered');
    panel.appendChild(tree);

    const foot = el('div', 'aug-foot');
    const spent = aug.spent(m);
    foot.appendChild(el('span', '', `Spent ${spent} · earned ${m.earned} in total`));
    const r = el('button', 'btn aug-respec' + (this.confirmRespec ? ' warn' : ''), this.confirmRespec ? 'CONFIRM AUGMENT REFUND' : 'REFUND AUGMENTS') as HTMLButtonElement;
    r.disabled = spent === 0;
    r.addEventListener('click', () => {
      if (!this.confirmRespec) { this.confirmRespec = true; this.render(); return; }
      this.error=aug.respec(m)?'':'Could not save refund; no cores changed.'; this.confirmRespec = false; this.render();
    });
    foot.appendChild(r);
    panel.appendChild(foot);
    n.appendChild(panel);
    panel.scrollTop=scroll;
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
    card.addEventListener('click', () => {
      this.error=aug.buy(m,a.id)?'':'Purchase could not be saved. No cores were spent.';
      this.confirmRespec=false;this.render();
    });
    return card;
  }
}
