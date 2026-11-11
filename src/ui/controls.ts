// controls.ts — key labels for hints (always reflect the player's bindings) and the Controls (rebinding) screen.
import { BIND_DEFS, SLOTS, captureKey, keybinds, setModal, type BindDef } from '../keybinds';
import { el } from './dom';

const k = (id: string) => keybinds.text(id, true);
const weapons = () => [k('slot1'), k('slot2'), k('slot3')].join(' ');

/** Short list for the in-game first-play hints. */
export function hintRows(): [string, string][] {
  return [
    [keybinds.moveText(), 'move'], [k('sprint'), 'sprint'], ['CLICK', 'shoot'], [k('interact'), 'search / interact'], [k('inventory'), 'inventory'],
    [k('craft'), 'craft'], [k('tech'), 'tech tree'], [k('build'), 'build'], [k('map'), 'map'], [k('heal'), 'heal'], [k('flashlight'), 'flashlight'],
  ];
}
/** Full list for the title screen. */
export function controlRows(): [string, string][] {
  return [
    [keybinds.moveText(), 'Move'], [k('sprint'), 'Sprint'], ['MOUSE', 'Aim'], ['CLICK', 'Fire / swing'], [k('reload'), 'Reload'], [weapons(), 'Weapons'],
    [k('interact'), 'Search / interact (hold)'], [k('heal'), 'Quick heal'], [k('flashlight'), 'Flashlight'], [k('build'), 'Build mode'],
    [k('inventory'), 'Inventory'], [k('craft'), 'Crafting'], [k('tech'), 'Tech tree'], [keybinds.text('map'), 'Map'], ['ESC', 'Pause / close'], [k('mute'), 'Mute'],
  ];
}
/** One-line summary (pause screen). */
export function controlsLine() {
  return `${keybinds.moveText()} move · ${k('sprint')} sprint · ${k('reload')} reload · ${weapons()} weapons · ${k('interact')} interact · ${k('heal')} heal · ` +
    `${k('flashlight')} flashlight · ${k('inventory')} inventory · ${k('tech')} tech · ${k('craft')} craft · ${k('build')} build · ${k('map')} map · ${k('mute')} mute`;
}
/** Build-mode key strip (HTML). */
export function buildKeysHtml() {
  const kb = (s: string) => `<kbd>${s.replace(/[&<>]/g, '')}</kbd>`;
  return `${kb('CLICK')} use tool · ${kb(k('rotate'))} rotate · ${kb(k('cyclePrev'))}${kb(k('cycleNext'))}/wheel cycle · ${kb('RIGHT CLICK')}/${kb('ESC')}/${kb(k('build'))} exit`;
}

// ------------------------------------------------------------------ Controls screen
let open: HTMLElement | null = null;

/** Open the rebinding screen on top of everything (title screen or pause menu). */
export function openControls(root: HTMLElement = document.getElementById('ui-root') ?? document.body) {
  if (open) return;
  const back = el('div', 'ctl-modal');
  const box = el('div', 'ctl-box');
  back.appendChild(box);
  const head = el('div', 'ctl-head');
  head.appendChild(el('div', 'set-h', 'CONTROLS'));
  const close = el('button', 'btn', 'Done');
  head.appendChild(close);
  box.appendChild(head);
  box.appendChild(el('div', 'ctl-help', 'Click a key to change it, then press the new key. Esc cancels, Backspace clears. Mouse buttons, Esc, F8 and F9 are fixed.'));
  const msg = el('div', 'ctl-msg', '');
  const list = el('div', 'ctl-list');
  box.appendChild(list);
  box.appendChild(msg);
  const foot = el('div', 'ctl-foot');
  const reset = el('button', 'btn', 'Reset to defaults');
  foot.appendChild(reset);
  box.appendChild(foot);

  let waiting: HTMLButtonElement | null = null;
  const render = () => {
    list.replaceChildren();
    let ctx = '';
    for (const d of BIND_DEFS) {
      if (d.ctx !== ctx) { ctx = d.ctx; list.appendChild(el('div', 'ctl-sec', ctx === 'play' ? 'Gameplay' : 'Build mode')); }
      list.appendChild(row(d));
    }
  };
  const row = (d: BindDef) => {
    const r = el('div', 'ctl-row');
    r.appendChild(el('span', 'ctl-name', d.label));
    for (let i = 0; i < SLOTS; i++) {
      const code = keybinds.slot(d.id, i);
      const b = el('button', 'ctl-key' + (code ? '' : ' unset'), code ? keybinds.label(code) : '—') as HTMLButtonElement;
      b.addEventListener('click', () => {
        if (waiting) return;
        waiting = b; b.textContent = 'press a key…'; b.classList.add('wait'); msg.textContent = '';
        captureKey((c) => {
          waiting = null;
          if (c === null) { render(); return; }               // Esc: cancel
          if (c && keybinds.isFixed(c)) { msg.textContent = `${keybinds.label(c)} can't be rebound.`; render(); return; }
          const stolen = keybinds.set(d.id, i, c);
          msg.textContent = stolen ? `${keybinds.label(c)} was moved from "${stolen}" to "${d.label}". That action has no key now unless it has a second one.` : '';
          render();
        });
      });
      r.appendChild(b);
    }
    return r;
  };
  const shut = () => {
    captureKey(null); setModal(null);
    back.remove(); open = null;
  };
  close.addEventListener('click', shut);
  back.addEventListener('mousedown', (e) => { e.stopPropagation(); if (e.target === back) shut(); });
  reset.addEventListener('click', () => { keybinds.reset(); msg.textContent = 'Controls reset to defaults.'; render(); });
  render();
  setModal(shut);
  root.appendChild(back);
  open = back;
}
