// road.ts — The Long Road UI: the objective tracker, cast subtitles, and the mission cards
// (briefing / mission complete / ending) that open while state.ui === 'road'.
import type { GameState } from '../sim/types';
import * as road from '../sim/road';
import * as bosses from '../sim/bosses';
import * as kit from '../sim/hive-kit';
import { CAST } from '../sim/road-data';
import { el } from './dom';
import { assetUrl } from '../asset-url';
import { keybinds } from '../keybinds';
import type { ShellApi } from '../shell';
import './road.css';

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class RoadUi {
  private tracker: HTMLElement; private sub: HTMLElement; private card: HTMLElement;
  private state: GameState | null = null; private shell: ShellApi | null = null;
  private sig = ''; private cardSig = '';
  constructor(root: HTMLElement) {
    this.tracker = el('div', 'road-tracker hidden');
    this.sub = el('div', 'road-sub hidden');
    this.card = el('section', 'road-card-wrap hidden'); this.card.setAttribute('role', 'dialog'); this.card.setAttribute('aria-modal', 'true');
    root.append(this.tracker, this.sub, this.card);
  }
  attach(s: GameState | null, shell: ShellApi | null) {
    this.state = s; this.shell = shell; this.sig = ''; this.cardSig = '';
    this.tracker.classList.add('hidden'); this.sub.classList.add('hidden'); this.card.classList.add('hidden');
  }
  update(s: GameState) {
    if (s !== this.state || s.mode !== 'road' || !s.road) return;
    const r = s.road, playing = r.phase === 'play' && s.screen === 'playing';
    // tracker
    const showTracker = playing && s.ui === null;
    this.tracker.classList.toggle('hidden', !showTracker);
    if (showTracker) {
      const m = road.missionOf(s), text = road.objectiveText(s), dist = road.markerDistance(s), step = r.step, total = m.objectives.length;
      const nearby = r.allies.filter(a => Math.hypot(a.x - s.player.x, a.y - s.player.y) < 300).length;
      const sig = `${m.id}|${text}|${dist}|${step}|${nearby}`;
      if (sig !== this.sig) {
        this.sig = sig;
        this.tracker.replaceChildren(
          el('div', 'rt-k', `${road.storyTitle(r.story).toUpperCase()} · ${r.mission + 1} / ${road.missionsOf(s).length} · ${m.title.toUpperCase()}`),
          el('div', 'rt-o', text),
          el('div', 'rt-d', `${dist} m · objective ${step + 1} of ${total}`),
          ...(r.allies.some(a => a.following) ? [el('div', 'rt-d', `SQUAD · ${r.allies.filter(a => Math.hypot(a.x - s.player.x, a.y - s.player.y) < 300).length}/4 nearby · following & covering you`)] : []),
        );
      }
    }
    // subtitle
    const st = r.subtitle, showSub = playing && s.ui === null && !!st;
    this.sub.classList.toggle('hidden', !showSub);
    this.sub.classList.toggle('raised', showSub && !!bosses.engagedBoss(s));   // keep clear of the boss health bar
    // The Hive Below: a camp has a prompt to read (rest, the lockbox) while someone is still talking: the line drops below it
    this.sub.classList.toggle('lowered', showSub && r.story === 'hive-below' && (!!s.interact || !!s.search) && !bosses.engagedBoss(s));
    if (showSub && st) {
      const k = `${st.who}|${st.text}`;
      if (this.sub.dataset.k !== k) {
        this.sub.dataset.k = k;
        const img = el('img', 'rs-img'); img.src = assetUrl(`assets/campaign/portrait-${st.who}-${st.mood ?? 'neutral'}.png`); img.alt = '';
        const txt = el('div', 'rs-t'); txt.append(el('b', '', CAST[st.who].name), el('span', '', st.text));
        this.sub.replaceChildren(img, txt);
      }
    }
    // card
    const open = s.ui === 'road' && r.phase !== 'play';
    this.card.classList.toggle('hidden', !open);
    if (!open) { this.cardSig = ''; return; }
    const sig = `${r.phase}|${r.mission}|${r.lastCompleted?.kills}`;
    if (sig === this.cardSig) return;
    this.cardSig = sig; this.renderCard(s);
  }

  private portraitLine(who: keyof typeof CAST, text: string, mood = 'neutral') {
    const row = el('div', 'rc-line');
    const img = el('img', 'rc-img'); img.src = assetUrl(`assets/campaign/portrait-${who}-${mood}.png`); img.alt = '';
    const t = el('div'); t.append(el('b', '', CAST[who].name), el('p', '', text));
    row.append(img, t); return row;
  }
  private renderCard(s: GameState) {
    const r = s.road!, box = el('div', 'road-card'), missions = road.missionsOf(s), sequel = r.story === 'group-in-need', hive = r.story === 'hive-below';
    this.card.replaceChildren(box);
    const go = (fn: () => void) => { fn(); this.cardSig = ''; };
    if (r.phase === 'briefing') {
      const m = road.missionOf(s), sector = r.world.sectors[m.sector];
      box.append(el('div', 'rc-k', `${road.storyTitle(r.story).toUpperCase()} · MISSION ${r.mission + 1} OF ${missions.length} · ${sector.name.toUpperCase()}`));
      box.append(el('h2', '', m.title));
      box.append(el('p', 'rc-tag', m.tagline));
      const lines = el('div', 'rc-lines'); for (const l of m.intro) lines.append(this.portraitLine(l.who, l.text, l.mood)); box.append(lines);
      if (m.handOver && r.lockbox) {
        // The Hive Below: what went down the rope with you, and what is waiting
        const n = kit.stored(r.lockbox), kitLine = el('p', 'rc-kit', `You carry: ${kit.carried(s)}. `);
        kitLine.append(el('span', '', `The other ${n} stack${n === 1 ? '' : 's'} stay with Mara until the rift is shut. Down here you fight with what the hive gives you.`));
        box.append(el('div', 'rc-k', 'DOWN THE ROPE'), kitLine);
      }
      const obj = el('ol', 'rc-obj'); for (const o of m.objectives) obj.append(el('li', '', o.text)); box.append(el('div', 'rc-k', 'OBJECTIVES'), obj);
      box.append(el('p', 'rc-hint', `${keybinds.text('inventory', true)} backpack & gear · ${keybinds.text('heal', true)} quick heal · ${keybinds.text('tech', true)} skills · ${keybinds.text('map', true)} map · ${keybinds.text('interact', true)} use · ${keybinds.text('flashlight', true)} flashlight · walk over supplies to pick them up`));
      const b = el('button', 'big-btn', 'MOVE OUT'); b.addEventListener('click', () => go(() => road.begin(s))); box.append(b);
    } else if (r.phase === 'complete') {
      const c = r.lastCompleted!, nextM = missions[r.mission + 1];
      box.append(el('div', 'rc-k rc-ok', 'CHECKPOINT REACHED · PROGRESS SAVED'));
      box.append(el('h2', '', 'Mission complete'));
      box.append(el('p', 'rc-tag', c.title));
      const stats = el('div', 'rc-stats');
      for (const [k, v] of [['Kills', String(c.kills)], ['Time', fmtTime(c.time)], ['Deaths', String(c.deaths)], ['Level', String(s.player.level)]]) { const d = el('div'); d.append(el('b', '', v), el('span', '', k)); stats.append(d); }
      box.append(stats);
      const m = road.missionOf(s);
      const lines = el('div', 'rc-lines'); for (const l of m.outro) lines.append(this.portraitLine(l.who, l.text, l.mood)); box.append(lines);
      const b = el('button', 'big-btn', nextM ? `CONTINUE · ${nextM.title.toUpperCase()}` : 'CONTINUE'); b.addEventListener('click', () => go(() => road.next(s))); box.append(b);
      const q = el('button', 'btn', 'QUIT TO TITLE'); q.addEventListener('click', () => { road.next(s); this.shell?.quitToTitle(true); }); box.append(q);
    } else {
      // the ending of a story
      box.append(el('div', 'rc-k rc-ok', `${road.storyTitle(r.story).toUpperCase()} · COMPLETE`));
      box.append(el('h2', '', hive ? 'It is just mud.' : sequel ? 'Everyone is accounted for.' : 'You kept the promise.'));
      if (!hive) { const img = el('img', 'rc-vignette'); img.src = assetUrl('assets/campaign/ending.png'); img.alt = ''; box.append(img); }
      box.append(el('p', 'rc-tag', hive
        ? 'Six seals, seven cells, one Queen. The rift is shut and North Ridge has its reservoir bed back. You keep everything you carried out, the Queen\'s Decree included.'
        : sequel ? 'Ada, Ben, Kit and Lewis are safe at North Ridge. The ground you cleared is home for four more.' : 'Four days. Nine sectors. All four of you made it to the convoy.'));
      const stats = el('div', 'rc-stats');
      for (const [k, v] of [['Total kills', String(r.totals.kills)], ['Deaths', String(r.totals.deaths)], ['Time', fmtTime(r.totals.time)], ['Level', String(s.player.level)]]) { const d = el('div'); d.append(el('b', '', v), el('span', '', k)); stats.append(d); }
      box.append(stats);
      const lines = el('div', 'rc-lines'); for (const l of missions[missions.length - 1].outro) lines.append(this.portraitLine(l.who, l.text, l.mood)); box.append(lines);
      if (sequel) {
        const saved = road.hasRoadSave('hive-below');
        const b = el('button', 'big-btn', saved ? 'CONTINUE THE HIVE BELOW' : 'PLAY THE HIVE BELOW');
        b.addEventListener('click', () => saved ? this.shell?.continueRoad('hive-below') : this.shell?.newRoad(undefined, 'hive-below'));
        box.append(el('p', 'rc-hint', 'Something has opened in the reservoir. Go down with your skills, level and equipment.'), b);
      } else if (!hive) {
        const saved = road.hasRoadSave('group-in-need');
        const b = el('button', 'big-btn', saved ? 'CONTINUE A GROUP IN NEED' : 'PLAY A GROUP IN NEED');
        b.addEventListener('click', () => saved ? this.shell?.continueRoad('group-in-need') : this.shell?.newRoad(undefined, 'group-in-need'));
        box.append(el('p', 'rc-hint', 'Continue the story with your skills, level and equipment.'), b);
      }
      const q = el('button', 'big-btn', 'BACK TO TITLE'); q.addEventListener('click', () => this.shell?.quitToTitle(true)); box.append(q);
    }
  }
}
