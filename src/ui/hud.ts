// hud.ts — DOM heads-up display. Built once; update() only writes to the DOM when a value actually changed.
import type { GameState, WeaponSlot, SimEvent } from '../sim/types';
import { WEAPONS } from '../sim/combat';
import { STRUCTURES, BUILD_GROUPS, selectBuild, setBuildTool, type BuildTool } from '../sim/base';
import * as inventory from '../sim/inventory';
import * as game from '../sim/game';
import * as progression from '../sim/progression';
import { el, itemDef, itemIcon, itemName, rarityColor, setCls, setText, setW, structIcon } from './dom';
import { barWidth, pct, prettyId } from './format';
import { drawMinimap } from './mapview';
import { keybinds } from '../keybinds';
import { buildKeysHtml, hintRows } from './controls';
import * as upgrades from '../sim/upgrades';
import { load as loadCoreBank } from '../sim/augments';
import { upgradeIcon } from './levelup';
import * as bosses from '../sim/bosses';
import { queenConduitObjective } from '../hive-conduits';

const HINT_KEY = 'deadzone_hints_seen_v1';
const SLOTS: { key: WeaponSlot; n: string }[] = [{ key: 'primary', n: '1' }, { key: 'secondary', n: '2' }, { key: 'melee', n: '3' }];

const HTML = `
<div class="hud-vig hurt"></div><div class="hud-vig low"></div><div class="hud-vig starve"></div>
<div class="hud-tl surv">
  <div class="lvl"><span>LVL</span><b class="lvl-n">1</b></div>
  <div class="xp"><div class="bar xp-bar"><i></i></div><div class="xp-t"></div></div>
  <div class="sp-badge hidden"><b></b><span>SKILL POINTS</span><kbd>K</kbd></div>
</div>
<div class="hud-axp arc"><i></i></div>
<div class="hud-load arc"><div class="ld-row ld-g"></div><div class="ld-row ld-p"></div></div>
<div class="hud-boss hidden"><div class="hb-top"><span class="hb-name"></span><span class="hb-t"></span></div><div class="hb-bar"><i></i></div><div class="hb-objective hidden" role="status"></div></div>
<div class="hud-arc arc"><div><span>LEVEL</span><b class="a-lvl">1</b></div><div><span>WAVE</span><b class="a-wave">1</b></div><div class="a-main"><span>SCORE</span><b class="a-score">0</b></div><div><span>BEST</span><b class="a-best">0</b></div><div class="a-sub"></div></div>
<div class="hud-tr surv">
  <div class="mm-wrap"><canvas class="mm"></canvas><div class="mm-n">N</div></div>
  <div class="clock"><span class="clock-ic"></span><span class="clock-t"></span></div>
  <div class="horde hidden"></div>
</div>
<div class="hud-bl">
  <div class="hp-row">
    <div class="bar hp-bar"><i class="hp-fill"></i><span class="bar-t hp-t"></span></div>
    <div class="armor hidden" title="Armor"><svg viewBox="0 0 16 18"><path d="M8 1 15 3.5v5.2c0 4-3 7.1-7 8.3-4-1.200-7-4.300-7-8.300V3.5z"/></svg><b></b></div>
    <div class="bleed hidden" title="Bleeding"><svg viewBox="0 0 16 20"><path d="M8 1c3 4.500 6 7.500 6 11a6 6 0 0 1-12 0c0-3.500 3-6.500 6-11z"/></svg><span>BLEEDING</span></div>
  </div>
  <div class="bar st-bar"><i></i></div>
  <div class="needs surv">
    <div class="need food"><span>FOOD</span><div class="bar"><i></i></div><b></b></div>
    <div class="need water"><span>WATER</span><div class="bar"><i></i></div><b></b></div>
  </div>
</div>
<div class="hud-br">
  <div class="feed"></div>
  <div class="w-name"></div>
  <div class="w-ammo"><b class="a-mag"></b><span class="a-tot"></span></div>
  <div class="bar reload hidden"><i></i><span>RELOADING</span></div>
  <div class="slots"></div>
</div>
<div class="hud-center">
  <div class="warn hidden"></div>
  <div class="prompt hidden"><kbd>E</kbd><span></span></div>
  <div class="search hidden"><span></span><div class="bar"><i></i></div></div>
</div>
<div class="toasts"></div>
<div class="banner"><div class="b-t"></div><div class="b-s"></div></div>
<div class="build hidden">
  <div class="bp-head"><b>BUILD</b><span class="bp-paused">GAME PAUSED</span></div>
  <div class="bp-tools"></div>
  <div class="bp-list"></div>
  <div class="bp-detail"><div class="b-name"></div><div class="b-desc"></div><div class="b-cost"></div></div>
  <div class="b-target hidden"></div>
  <div class="b-keys"></div>
</div>
<div class="hints hidden"><div class="h-t">CONTROLS</div></div>`;

interface Toast { node: HTMLElement; t: number }
interface FeedItem { id: string; qty: number; t: number; node: HTMLElement }

export class Hud {
  readonly node: HTMLElement;
  private state: GameState | null = null;
  private q = (s: string) => this.node.querySelector(s) as HTMLElement;
  private r!: Record<string, HTMLElement>;
  private mm!: HTMLCanvasElement; private mmCtx: CanvasRenderingContext2D | null = null; private mmPx = 0;
  private slotEls: { box: HTMLElement; icon: HTMLElement; a: HTMLElement; key: string }[] = [];
  private toasts: Toast[] = [];
  private feed: FeedItem[] = [];
  private hurtT = 0; private now = 0;
  private bannerUntil = 0;
  private armorT = -1; private armor = 0;
  private hintsSeen = false;
  private buildKey = '';
  private frame = 0;
  private ico: { weapon: string; stash: string } = { weapon: '', stash: '' };
  private loadKey = '';
  private coreBalance = 0;

  constructor(root: HTMLElement) {
    this.node = el('div', 'hud hidden'); this.node.innerHTML = HTML; root.appendChild(this.node);
    const q = this.q;
    this.r = {
      lvl: q('.lvl-n'), xpFill: q('.xp-bar i'), xpT: q('.xp-t'), sp: q('.sp-badge'), spN: q('.sp-badge b'),
      clock: q('.clock-t'), clockIc: q('.clock-ic'), horde: q('.horde'),
      hpFill: q('.hp-fill'), hpT: q('.hp-t'), armor: q('.armor'), armorT: q('.armor b'), bleed: q('.bleed'),
      st: q('.st-bar i'), foodF: q('.food i'), foodT: q('.food b'), waterF: q('.water i'), waterT: q('.water b'),
      feed: q('.feed'), wName: q('.w-name'), wAmmo: q('.w-ammo'), mag: q('.a-mag'), tot: q('.a-tot'), reload: q('.reload'), reloadF: q('.reload i'), slots: q('.slots'),
      warn: q('.warn'), prompt: q('.prompt'), promptT: q('.prompt span'), search: q('.search'), searchT: q('.search span'), searchF: q('.search i'),
      toasts: q('.toasts'), banner: q('.banner'), bT: q('.b-t'), bS: q('.b-s'),
      build: q('.build'), bName: q('.b-name'), bDesc: q('.b-desc'), bCost: q('.b-cost'), bTarget: q('.b-target'), bTools: q('.bp-tools'), bList: q('.bp-list'),
      hints: q('.hints'), vHurt: q('.hud-vig.hurt'), vLow: q('.hud-vig.low'), vStarve: q('.hud-vig.starve'),
      aWave: q('.a-wave'), aLvl: q('.a-lvl'), axp: q('.hud-axp i'), ldG: q('.ld-g'), ldP: q('.ld-p'), aScore: q('.a-score'), aBest: q('.a-best'), aSub: q('.a-sub'),
      boss: q('.hud-boss'), bossName: q('.hb-name'), bossT: q('.hb-t'), bossF: q('.hb-bar i'), bossObjective: q('.hb-objective'),
    };
    this.mm = q('.mm') as HTMLCanvasElement;
    for (const s of SLOTS) {
      const box = el('div', 'slot'); box.appendChild(el('span', 'k', s.n));
      const icon = el('div', 'slot-ic'); box.appendChild(icon);
      const a = el('span', 'sa'); box.appendChild(a);
      this.r.slots.appendChild(box); this.slotEls.push({ box, icon, a, key: '\0' });
    }
    this.r.build.addEventListener('mousedown', (e) => e.stopPropagation());
    this.r.build.addEventListener('click', (e) => {
      const st = this.state; if (!st?.build) return;
      const t = (e.target as HTMLElement).closest('[data-struct],[data-tool]') as HTMLElement | null; if (!t) return;
      if (t.dataset.struct) selectBuild(st, t.dataset.struct);
      else if (t.dataset.tool) setBuildTool(st, t.dataset.tool as BuildTool);
      this.buildKey = '';
    });
    this.refreshKeys();
    keybinds.onChange(() => this.refreshKeys());
    try { this.hintsSeen = localStorage.getItem(HINT_KEY) === '1'; } catch { /* ignore */ }
  }

  /** Rewrite every key label from the current bindings (called on start and whenever controls change). */
  private refreshKeys() {
    const hl = this.r.hints;
    hl.querySelectorAll('.h-r').forEach((n) => n.remove());
    for (const [k, v] of hintRows()) { const row = el('div', 'h-r'); row.appendChild(el('kbd', '', k)); row.appendChild(el('span', '', v)); hl.appendChild(row); }
    const pk = this.node.querySelector('.prompt kbd'); if (pk) pk.textContent = keybinds.text('interact', true);
    const sk = this.node.querySelector('.sp-badge kbd'); if (sk) sk.textContent = keybinds.text('tech', true);
    const bk = this.node.querySelector('.b-keys'); if (bk) bk.innerHTML = buildKeysHtml();
    this.buildKey = '';
  }

  attach(state: GameState) {
    this.state = state; this.node.classList.remove('hidden');
    this.node.classList.toggle('mode-arcade', state.mode === 'arcade');
    this.node.classList.toggle('mode-road', state.mode === 'road');
    this.toasts.forEach((t) => t.node.remove()); this.toasts = []; this.feed.forEach((f) => f.node.remove()); this.feed = [];
    this.buildKey = ''; this.armorT = -1; this.hurtT = 0; this.bannerUntil = 0; this.r.banner.classList.remove('show');
    for (const s of this.slotEls) s.key = '\0';
    this.ico = { weapon: '', stash: '' }; this.loadKey = '';
    for (const k of Object.keys(this.r)) { delete this.r[k].dataset.v; delete this.r[k].dataset.w; }
    this.mmPx = 0;
  }
  detach() { this.state = null; this.node.classList.add('hidden'); }

  private banner(text: string, sub: string, color: string, ms: number) {
    this.r.bT.textContent = text; this.r.bS.textContent = sub; this.r.banner.style.setProperty('--bc', color);
    this.r.banner.classList.remove('show'); void this.r.banner.offsetWidth; this.r.banner.classList.add('show');
    this.bannerUntil = this.now + ms / 1000;
  }
  toast(msg: string, color?: string) {
    const n = el('div', 'toast', msg); if (color) n.style.color = color;
    this.r.toasts.appendChild(n); this.toasts.push({ node: n, t: this.now });
    while (this.toasts.length > 5) this.toasts.shift()!.node.remove();
  }

  onEvent(ev: SimEvent, s: GameState, overlayOpen: boolean) {
    switch (ev.t) {
      case 'toast': this.toast(ev.msg, ev.color); break;
      case 'banner': this.banner(ev.title, ev.sub, ev.color ?? '#ffcf4a', ev.ms ?? 2600); break;
      case 'playerHurt': this.hurtT = this.now; break;
      case 'levelUp': this.banner('LEVEL UP', 'LEVEL ' + ev.level + ' · ' + (s.player?.sp || 0) + ' SKILL POINTS · PRESS K', '#ffcf4a', 3200); break;
      case 'night': this.banner('NIGHTFALL', 'They are faster in the dark', '#8aa0ff', 3200); break;
      case 'day': this.banner('DAY ' + ev.day, 'You made it through the night', '#ffd98a', 2800); break;
      case 'horde': this.banner('HORDE INCOMING', 'Defend your base!', '#ff3b2e', 4500); break;
      case 'upgradePicked': if (ev.kind === 'evolve' && ev.id in upgrades.GADGETS) this.banner('EVOLVED', upgrades.GADGETS[ev.id as keyof typeof upgrades.GADGETS].evoName.toUpperCase(), '#ffcf4a', 2600); break;
      case 'itemAdded': if (!overlayOpen && s.mode !== 'arcade') this.addFeed(ev.id, ev.qty); break;
      default: break;
    }
  }
  private addFeed(id: string, qty: number) {
    const f = this.feed.find((x) => x.id === id && this.now - x.t < 2);
    if (f) { f.qty += qty; f.t = this.now; f.node.textContent = '+' + f.qty + ' ' + itemName(id); return; }
    const n = el('div', 'feed-i', '+' + qty + ' ' + itemName(id)); n.style.color = rarityColor(itemDef(id)?.rarity);
    this.r.feed.appendChild(n); this.feed.push({ id, qty, t: this.now, node: n });
    while (this.feed.length > 5) this.feed.shift()!.node.remove();
  }

  update(s: GameState, dt: number, overlayOpen: boolean) {
    this.now += dt; this.frame++;
    const p = s.player; if (!p) return;
    const r = this.r, surv = s.mode === 'survival', roadMode = s.mode === 'road', now = this.now;

    // expire toasts / feed / banner
    if (this.toasts.length && now - this.toasts[0].t > 3.4) this.toasts.shift()!.node.remove();
    if (this.feed.length && now - this.feed[0].t > 2.6) this.feed.shift()!.node.remove();
    if (this.bannerUntil && now > this.bannerUntil) { this.bannerUntil = 0; r.banner.classList.remove('show'); }

    // vitals
    setW(r.hpFill, barWidth(p.hp / (p.maxHp || 100)));
    setText(r.hpT, 'HP ' + Math.ceil(Math.max(0, p.hp)) + ' / ' + Math.round(p.maxHp));
    setCls(r.hpFill, 'low', p.hp / p.maxHp < 0.3);
    setW(r.st, barWidth(p.stamina / (p.maxStamina || 100)));
    setCls(r.st.parentElement!, 'low', p.stamina < 12);
    setCls(r.bleed, 'hidden', !(p.bleeding > 0));
    if (now - this.armorT > 0.5) {
      this.armorT = now;
      this.armor = progression.playerMods(s).armor;
    }
    setCls(r.armor, 'hidden', !(this.armor > 0));
    if (this.armor > 0) setText(r.armorT, pct(this.armor));
    if (roadMode) {
      const need = progression.xpForLevel(p.level || 1);
      setText(r.lvl, String(p.level || 1));
      setW(r.xpFill, barWidth((p.xp || 0) / need));
      setText(r.xpT, 'XP ' + Math.floor(p.xp || 0) + ' / ' + need);
      setCls(r.sp, 'hidden', !(p.sp > 0)); if (p.sp > 0) setText(r.spN, String(p.sp));
      setCls(this.node, 'is-night', game.isNight(s));
      if (this.frame % 2 === 0) this.drawMini(s);
    } else if (surv) {
      setW(r.foodF, barWidth(p.food / 100)); setText(r.foodT, Math.round(p.food) + '%'); setCls(r.foodF.parentElement!.parentElement!, 'low', p.food < 15);
      setW(r.waterF, barWidth(p.water / 100)); setText(r.waterT, Math.round(p.water) + '%'); setCls(r.waterF.parentElement!.parentElement!, 'low', p.water < 15);
      // level / xp
      const need = progression.xpForLevel(p.level || 1);
      setText(r.lvl, String(p.level || 1));
      setW(r.xpFill, barWidth((p.xp || 0) / need));
      setText(r.xpT, 'XP ' + Math.floor(p.xp || 0) + ' / ' + need);
      setCls(r.sp, 'hidden', !(p.sp > 0)); if (p.sp > 0) setText(r.spN, String(p.sp));
      // clock
      const ck = s.clock.day * 10000 + Math.floor(s.clock.t * 2.5);
      if (r.clock.dataset.ck !== String(ck)) {
        r.clock.dataset.ck = String(ck);
        const night = game.isNight(s);
        setText(r.clock, game.timeLabel(s).replace('—', '·'));
        setCls(this.node, 'is-night', night);
        const hd = s.clock.day % 3 === 0;
        setCls(r.horde, 'hidden', !hd);
        if (hd) setText(r.horde, night ? 'HORDE NIGHT' : 'HORDE TONIGHT');
        setCls(r.horde, 'now', night);
      }
      // minimap (every other frame is plenty)
      if (this.frame % 2 === 0) this.drawMini(s);
    } else if (s.arcade) {
      const a = s.arcade;
      if (this.frame % 15 === 0 || !r.aSub.dataset.v) this.coreBalance = loadCoreBank().cores;
      setText(r.aWave, String(a.wave)); setText(r.aScore, String(Math.floor(a.score))); setText(r.aBest, String(Math.floor(a.best)));
      setText(r.aSub, (a.intermission > 0 ? 'NEXT ' + Math.ceil(a.intermission) + 's · ' : '') + this.coreBalance + ' CORES · ' + keybinds.text('tech',true) + (a.intermission > 0 ? '' : ' SKILLS'));
      if (a.run) this.updateRun(a.run);
    }
    // boss health bar: arcade boss waves, and city lair bosses once they come for you
    const boss = s.player ? bosses.engagedBoss(s) : null;
    setCls(r.boss, 'hidden', !boss);
    const queenObjective = queenConduitObjective(s, boss);
    setText(r.bossObjective, queenObjective);
    setCls(r.bossObjective, 'hidden', !queenObjective);
    if (boss) {
      const d = bosses.BOSSES[boss.boss];
      setText(r.bossName, d.name.toUpperCase()); setText(r.bossT, d.title);
      r.boss.style.setProperty('--bc', d.glow);
      setW(r.bossF, barWidth(boss.hp / boss.maxHp));
      setCls(r.boss, 'enraged', boss.hp < boss.maxHp * 0.5);
    }

    // weapon
    const eq = p.inv.equip, w = eq[p.active];
    const wid = w ? w.id : '';
    const wd = w ? itemDef(w.id) : undefined;
    setText(r.wName, (wd ? wd.name : p.active === 'melee' ? 'Fists' : 'No weapon').toUpperCase());
    r.wName.style.color = wd ? rarityColor(wd.rarity) : '#8a8c84';
    const wdef = w ? WEAPONS[w.id] : undefined;
    if (wdef && wdef.ammo && w) {
      const total = inventory.count(p.inv, wdef.ammo);
      setText(r.mag, String(w.mag ?? 0)); setText(r.tot, '/ ' + total);
      setCls(r.wAmmo, 'empty', (w.mag ?? 0) <= 0); setCls(r.wAmmo, 'hidden', false);
      const rl = p.reloadTimer > 0 && p.reloadTotal > 0;
      setCls(r.reload, 'hidden', !rl);
      if (rl) setW(r.reloadF, barWidth(1 - p.reloadTimer / p.reloadTotal));
      const needR = (w.mag ?? 0) <= 0 && !rl;
      setCls(r.warn, 'hidden', !needR);
      if (needR) setText(r.warn, total > 0 ? 'RELOAD [R]' : 'NO AMMO');
    } else {
      // a gun that needs no ammunition (the Vespiary breeds its own) still shows what is in it
      const own = !!(wdef && w && !wdef.melee && wdef.magSize > 0);
      setText(r.mag, own ? String(w!.mag ?? 0) : wid ? 'MELEE' : '—'); setText(r.tot, own ? '/ ∞' : ''); setCls(r.wAmmo, 'empty', own && (w!.mag ?? 0) <= 0);
      setCls(r.reload, 'hidden', true);
      const breeding = own && (w!.mag ?? 0) < wdef!.magSize;
      setCls(r.warn, 'hidden', !breeding);
      if (breeding) setText(r.warn, 'BREEDING · 2 A SECOND');
    }
    this.ico.weapon = wid;
    SLOTS.forEach((sl, i) => {
      const st = eq[sl.key], se = this.slotEls[i];
      const key = st ? st.id : '';
      if (se.key !== key) {
        se.key = key; se.icon.replaceChildren();
        if (st) { se.icon.appendChild(itemIcon(st.id)); se.icon.style.setProperty('--rar', rarityColor(itemDef(st.id)?.rarity)); }
      }
      setCls(se.box, 'active', p.active === sl.key); setCls(se.box, 'empty', !st);
      const wdf = st ? WEAPONS[st.id] : undefined;
      setText(se.a, wdf && (wdf.ammo || (!wdf.melee && wdf.magSize > 0)) && st ? String(st.mag ?? 0) : '');
    });

    // interaction prompt + search
    const showPrompt = !overlayOpen && s.ui !== 'build' && !!s.interact && !s.search;
    setCls(r.prompt, 'hidden', !showPrompt);
    if (showPrompt) setText(r.promptT, s.interact!.label);
    const searching = !overlayOpen && !!s.search;
    setCls(r.search, 'hidden', !searching);
    if (searching) {
      const se = s.search!;
      setText(r.searchT, 'SEARCHING ' + prettyId(se.target.name || se.target.kind || '').toUpperCase() + '…');
      setW(r.searchF, barWidth(se.t / se.total));
    }

    // vignettes
    const hurtAge = now - this.hurtT;
    const hv = this.hurtT && hurtAge < 0.5 ? 0.85 * (1 - hurtAge / 0.5) : 0;
    if (r.vHurt.dataset.v !== String(Math.round(hv * 50))) { r.vHurt.dataset.v = String(Math.round(hv * 50)); r.vHurt.style.opacity = String(hv); }
    setCls(r.vLow, 'on', !p.dead && p.hp / p.maxHp < 0.3);
    setCls(r.vStarve, 'on', surv && (p.food <= 0 || p.water <= 0));

    // build bar
    const b = s.build;
    setCls(r.build, 'hidden', !b);
    if (b) {
      this.updateBuild(s);
      const sv = b.salvage, tool = b.tool ?? 'place';
      const show = !!sv && tool !== 'place';
      setCls(this.r.bTarget, 'hidden', !show);
      if (show && sv) {
        const costTxt = (c: Record<string, number>) => Object.entries(c).map(([id, n]) => `${n} ${id.replace(/_/g, ' ')}`).join(', ');
        let t: string;
        if (tool === 'repair') t = sv.hp === undefined ? '' : sv.repair ? `Click: repair ${sv.name} (${Math.round(sv.hp * 100)}%) for ${costTxt(sv.repair)}` : `${sv.name}: full health`;
        else t = sv.near ? `Click: ${sv.label}` : `${sv.label}: get closer`;
        setText(this.r.bTarget, t); setCls(this.r.bTarget, 'far', !sv.near || (tool === 'repair' && !sv.repair));
      }
    }

    // first-play hints
    if (!this.hintsSeen && surv) {
      if (s.time > 75) { this.hintsSeen = true; try { localStorage.setItem(HINT_KEY, '1'); } catch { /* ignore */ } setCls(r.hints, 'hidden', true); }
      else setCls(r.hints, 'hidden', overlayOpen || !!b || s.time < 1.5);
    } else setCls(r.hints, 'hidden', true);
  }

  /** Arcade XP bar + gadget/passive loadout (rebuilt only when it changes). */
  private updateRun(run: NonNullable<NonNullable<GameState['arcade']>['run']>) {
    const r = this.r, shownLevel = run.level - run.pending;
    setText(r.aLvl, String(shownLevel));
    setW(r.axp, run.pending > 0 ? '100%' : barWidth(run.xp / upgrades.xpNeed(run.level)));
    const key = run.gadgets.map((g) => g.id + g.level + (g.evolved ? 'e' : '')).join() + '|' + run.passives.map((p) => p.id + p.level).join();
    if (key === this.loadKey) return;
    this.loadKey = key;
    const slot = (id: string, name: string, color: string, level: number, evolved: boolean) => {
      const b = el('div', 'ld-s' + (evolved ? ' evo' : ''));
      b.title = name + (evolved ? '' : ' · LV ' + level);
      b.style.setProperty('--cc', color);
      b.appendChild(upgradeIcon(id, color));
      b.appendChild(el('b', '', evolved ? '★' : String(level)));
      return b;
    };
    const empty = () => el('div', 'ld-s empty');
    r.ldG.replaceChildren(); r.ldP.replaceChildren();
    for (let i = 0; i < upgrades.MAX_GADGETS+(run.aug?.gadgetSlots||0); i++) {
      const g = run.gadgets[i], d = g && upgrades.GADGETS[g.id];
      r.ldG.appendChild(g && d ? slot(g.id, g.evolved ? d.evoName : d.name, g.evolved ? '#ffcf4a' : d.color, g.level, g.evolved) : empty());
    }
    for (let i = 0; i < upgrades.MAX_PASSIVES+(run.aug?.passiveSlots||0); i++) {
      const p = run.passives[i], d = p && upgrades.PASSIVES[p.id];
      r.ldP.appendChild(p && d ? slot(p.id, d.name, d.color, p.level, false) : empty());
    }
  }

  private updateBuild(s: GameState) {
    const b = s.build; if (!b) return;
    const p = s.player, tool = b.tool ?? 'place', type = b.selected, def = STRUCTURES[type]; if (!def) return;
    const mats = new Set<string>(); for (const k of Object.keys(STRUCTURES)) for (const id of Object.keys(STRUCTURES[k].cost)) mats.add(id);
    const have: Record<string, number> = {}; for (const id of mats) have[id] = inventory.count(p.inv, id);
    const key = type + '|' + tool + '|' + Object.values(have).join(',') + '|' + (b.ghost?.ok ? 1 : 0);
    if (key === this.buildKey) return;
    this.buildKey = key;
    // tools
    const tools: [BuildTool, string, string][] = [['place', 'Build', ''], ['repair', 'Repair', keybinds.text('repair', true)], ['demolish', 'Demolish / salvage', keybinds.text('demolish', true)]];
    this.r.bTools.replaceChildren(...tools.map(([id, label, k]) => {
      const t = el('button', 'bp-tool' + (tool === id ? ' on' : ''), label); t.dataset.tool = id;
      if (k) t.appendChild(el('kbd', '', k));
      return t;
    }));
    // structure list
    const list = this.r.bList; list.replaceChildren();
    for (const g of BUILD_GROUPS) {
      list.appendChild(el('div', 'bp-sec', g.name));
      for (const id of g.items) {
        const d = STRUCTURES[id]; if (!d) continue;
        const afford = Object.entries(d.cost).every(([m, n]) => have[m] >= n);
        const row = el('button', 'bp-item' + (id === type && tool === 'place' ? ' sel' : '') + (afford ? '' : ' poor'));
        row.dataset.struct = id;
        row.appendChild(structIcon(id, d.glyph));
        const info = el('div', 'bp-info');
        info.appendChild(el('div', 'bp-name', d.name));
        const cc = el('div', 'bp-cost');
        for (const [m, n] of Object.entries(d.cost)) { const c = el('span', have[m] >= n ? 'ok' : 'bad'); c.appendChild(itemIcon(m, 'tiny')); c.appendChild(el('b', '', String(n))); c.title = itemName(m); cc.appendChild(c); }
        info.appendChild(cc); row.appendChild(info);
        list.appendChild(row);
      }
    }
    // detail for the selected structure
    setText(this.r.bName, tool === 'place' ? def.name.toUpperCase() : tool === 'repair' ? 'REPAIR' : 'DEMOLISH / SALVAGE');
    setText(this.r.bDesc, tool === 'place' ? `${def.desc} ${def.hp} HP.` : tool === 'repair'
      ? 'Click one of your damaged structures. Costs up to half its build price, depending on damage.'
      : 'Click your structure to tear it down (half the materials back), or furniture, cars and fences in reach to salvage them.');
    const cost = this.r.bCost; cost.replaceChildren();
    if (tool === 'place') for (const [id, need] of Object.entries(def.cost)) {
      const c = el('span', 'bcost ' + (have[id] >= need ? 'ok' : 'bad'));
      c.appendChild(itemIcon(id, 'tiny')); c.appendChild(el('b', '', have[id] + '/' + need));
      c.title = itemName(id); cost.appendChild(c);
    }
    cost.classList.toggle('placeable', !!b.ghost?.ok);
  }

  private drawMini(s: GameState) {
    const cv = this.mm, px = cv.clientWidth; if (!px) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), want = Math.round(px * dpr);
    if (this.mmPx !== want) { cv.width = cv.height = want; this.mmPx = want; this.mmCtx = cv.getContext('2d'); }
    const ctx = this.mmCtx; if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMinimap(ctx, s, px);
  }
}
