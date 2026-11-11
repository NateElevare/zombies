// UI entry: createUi() returns the UiLike the shell drives. Owns #ui-root, the title screen, the HUD and the overlays.
import type { ShellApi, UiLike } from '../shell';
import type { Container, Drop, GameState, SimEvent, Structure, UiName } from '../sim/types';
import * as game from '../sim/game';
import { el } from './dom';
import { Hud } from './hud';
import { OVERLAY_NAMES, Overlays } from './overlays';
import { Title } from './title';
import { toggleMute } from './settings';
import { DevTools } from './devtools';
import { LevelUp } from './levelup';
import { Armory } from './armory';
import * as arcade from '../sim/arcade';
import * as road from '../sim/road';
import { keybinds } from '../keybinds';
import { CampaignUi } from './campaign';
import { RoadUi } from './road';

const OPENERS = new Set<string>(['inventory', 'tech', 'craft', 'map']);
/** Overlay opened by this key (from the rebindable controls), if any. */
const openerFor = (code: string): UiName | undefined => { const a = keybinds.action(code, 'play'); return a && OPENERS.has(a) ? a as UiName : undefined; };
const SURVIVAL_ONLY = ['inventory', 'craft', 'tech', 'map', 'workbench', 'stash', 'loot'];
/** Overlays a mode cannot open: arcade has none of the survival screens, the Long Road keeps the tech tree and the map. */
const ROAD_LOCKED = ['craft', 'workbench', 'stash', 'loot'];
const locked = (s: GameState, name: UiName | null) => !!name && (s.mode === 'arcade' ? SURVIVAL_ONLY : s.mode === 'road' ? ROAD_LOCKED : []).includes(name);
type Target = Container | Drop | Structure | null;

export function createUi(): UiLike {
  let root = document.getElementById('ui-root');
  if (!root) { root = el('div'); root.id = 'ui-root'; document.body.appendChild(root); }
  root.replaceChildren();
  const rootEl = root;

  let state: GameState | null = null;
  let pendingTarget: Target = null;

  const hud = new Hud(rootEl);
  const campaignUi = new CampaignUi(rootEl);
  const roadUi = new RoadUi(rootEl);
  const overlays: Overlays = new Overlays(rootEl, {
    close: () => closeOverlay(),
    open: (n) => openOverlay(n),
  });
  const title = new Title(rootEl);
  let shellApi: ShellApi | null = null;
  const dev = new DevTools(rootEl, () => { shellApi?.quitToTitle(true); }, () => title.refreshStories());
  const levelup = new LevelUp(rootEl);
  const armory = new Armory(rootEl, () => { if (state?.ui === 'armory') game.setUi(state, null); });

  // ---- scale the whole UI with the viewport (everything is sized in em) ----
  const rescale = () => {
    const k = Math.max(0.8, Math.min(2.2, Math.min(innerWidth / 1280, innerHeight / 720)));
    rootEl.style.fontSize = (16 * k).toFixed(2) + 'px';
  };
  rescale(); window.addEventListener('resize', rescale);

  const blocking = (s: GameState | null) => !!s && ((s.ui !== null && s.ui !== 'build') || s.screen === 'dead');

  // ---- opening / closing (state.ui is the single source of truth; the sim pauses on it) ----
  function openOverlay(name: UiName) {
    const s = state; if (!s || s.screen === 'dead' || !s.player || s.player.dead) return;
    if (locked(s, name)) return;
    if (name === 'workbench' || name === 'stash' || name === 'loot') return; // opened by the sim (E interact)
    game.setUi(s, name);
    reconcile(s);
  }
  function closeOverlay() {
    const s = state; if (!s) return;
    if (s.screen === 'dead' || s.ui === 'dead') return;
    game.setUi(s, null);
    reconcile(s);
  }

  /** Make the DOM overlay match state.ui. Called every frame (cheap) and after UI-driven changes. */
  function reconcile(s: GameState) {
    if (locked(s, s.ui)) { game.setUi(s, null); s.uiTarget = null; pendingTarget = null; }
    let want: UiName | null = s.ui && OVERLAY_NAMES.includes(s.ui) ? s.ui : null;
    if (s.screen === 'dead') want = 'dead';
    if (want === 'loot' || want === 'stash' || want === 'workbench') {
      let t: Target = null;
      if (want === 'loot') t = overlays.current === 'loot' ? overlays.target as Target : pendingTarget;
      else t = (s.uiTarget as Structure | undefined) ?? (overlays.current === want ? overlays.target as Target : pendingTarget);
      if (!t) { game.setUi(s, null); want = null; }
      else if (overlays.current !== want || overlays.target !== t) overlays.show(want, t);
      if (want && !overlays.targetValid()) { game.setUi(s, null); s.uiTarget = null; want = null; }
    } else if (want && overlays.current !== want) overlays.show(want, null);
    if (!want && overlays.current) { overlays.hide(); pendingTarget = null; }
  }

  // ---- keyboard (capture phase so overlays can swallow keys before the gameplay input sees them) ----
  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && e.code !== 'Escape') return;
    if (!e.repeat && keybinds.action(e.code, 'play') === 'mute') { toggleMute(); }
    const s = state;
    if (!s) return;
    if (e.code === 'Tab' && s.ui !== 'campaign') e.preventDefault();
    const ui = s.ui;
    if (s.screen === 'dead' || ui === 'dead') { if (e.code !== 'F8' && e.code !== 'F9' && e.code !== 'F5' && e.code !== 'F12') { e.stopPropagation(); } return; }
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (ui === 'road') {
      // mission cards: Enter / Space continue, everything else is swallowed (buttons keep focus keys)
      if (e.code === 'F8' || e.code === 'F9' || e.code === 'F5' || e.code === 'F12') return;
      e.stopPropagation();
      if (!e.repeat && (e.code === 'Enter' || e.code === 'Space') && (e.target as HTMLElement | null)?.tagName !== 'BUTTON') {
        e.preventDefault();
        if (s.road?.phase === 'briefing') road.begin(s); else if (s.road?.phase === 'complete') road.next(s);
      }
      return;
    }
    if (ui === 'campaign') {
      if (e.code === 'F8' || e.code === 'F9' || e.code === 'F5' || e.code === 'F12') return;
      // Let native buttons receive Tab/Enter/Space while keeping gameplay keys out.
      e.stopPropagation();
      if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); closeOverlay(); }
      return;
    }
    if (ui === 'levelup') {
      // arcade card picker: 1/2/3 choose; it cannot be dismissed, everything else is swallowed
      if (e.code === 'F8' || e.code === 'F9') return;
      stop();
      const n = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
      if (n && !e.repeat) levelup.pick(Number(n[1]) - 1);
      else if (e.code === 'KeyR' && !e.repeat) levelup.reroll();
      return;
    }
    if (ui === 'armory') {
      // arcade weapon locker: I (inventory key) or Esc closes, everything else is swallowed
      if (e.code === 'F8' || e.code === 'F9') return;
      stop();
      if (!e.repeat && (e.code === 'Escape' || openerFor(e.code) === 'inventory')) arcade.toggleArmory(s);
      return;
    }
    if (ui === null && s.mode === 'arcade' && openerFor(e.code) === 'inventory') { stop(); if (!e.repeat) arcade.toggleArmory(s); return; }
    if (ui === null || ui === 'build') {
      if (e.code === 'Escape') {
        if (ui === 'build') return; // the input layer cancels build mode
        if (!e.repeat) { stop(); openOverlay('pause'); }
        return;
      }
      // in build mode the build keys win (e.g. E cycles structures)
      const name = ui === 'build' && keybinds.action(e.code, 'build') ? undefined : openerFor(e.code);
      if (name) { stop(); if (!e.repeat) openOverlay(name); }
      return;
    }
    // an overlay is open: handle our keys, swallow everything else
    if (e.code === 'F8' || e.code === 'F9') return;
    stop();
    if (e.repeat) return;
    if (e.code === 'Escape') { closeOverlay(); return; }
    if (ui === 'pause') return;
    const name = openerFor(e.code);
    if (name) {
      if (ui === name) closeOverlay();
      else if (ui === 'workbench' && (name === 'tech' || name === 'craft')) {
        if (overlays.workbenchTab === name) closeOverlay(); else overlays.setTab(name);
      } else openOverlay(name);
      return;
    }
    if (keybinds.action(e.code, 'play') === 'interact' && (ui === 'loot' || ui === 'stash' || ui === 'workbench')) closeOverlay();
    else if (e.code === 'KeyF' && (ui === 'loot' || ui === 'stash')) overlays.takeAll();
  }
  window.addEventListener('keydown', onKey, true);

  return {
    capturesInput() { return !state || blocking(state); },

    attach(s, sh) {
      shellApi = sh;
      campaignUi.attach(s); roadUi.attach(s, sh);
      overlays.hide(); hud.detach(); pendingTarget = null;
      dev.attach(s); levelup.attach(s); armory.attach(s);
      if (!s) { state = null; overlays.detach(); title.show(sh); return; }
      state = s; title.hide();
      overlays.attach(s, sh); hud.attach(s);
    },

    update(s, dt) {
      if (!s || s !== state) return;
      reconcile(s);
      hud.update(s, dt, blocking(s));
      campaignUi.update(s); roadUi.update(s);
      levelup.update(s, dt);
      armory.update(s);
      dev.update();
    },

    onEvent(ev: SimEvent, s: GameState) {
      if (!s || s !== state) return;
      if (ev.t === 'openUi') {
        if (locked(s, ev.ui)) return;
        if (ev.target) pendingTarget = ev.target as Target;
        // the sim normally sets state.ui itself before emitting; be tolerant of emitters that only send the event
        if (ev.ui !== 'build' && s.ui !== ev.ui) { game.setUi(s, ev.ui); if (ev.target) s.uiTarget = ev.target; }
        return;
      }
      if (ev.t === 'structureDestroyed') {
        const t = overlays.target as Structure | null;
        if (t && 'type' in t && (t.id === ev.id || t.dead) && (overlays.current === 'stash' || overlays.current === 'workbench')) {
          // the sim already cleared state.ui; make sure the DOM closes too (items were dropped on the ground by the sim)
          game.setUi(s, null); s.uiTarget = null; overlays.hide();
        }
      }
      hud.onEvent(ev, s, blocking(s));
    },

    detach() {
      campaignUi.attach(null); roadUi.attach(null, null);
      title.hide();
      state = null; pendingTarget = null; dev.attach(null); levelup.attach(null); armory.attach(null);
      overlays.detach(); hud.detach();
    },
  };
}
