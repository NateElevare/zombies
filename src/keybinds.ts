// keybinds.ts — rebindable keyboard controls (KeyboardEvent.code based), saved per browser in localStorage.
// Two contexts: 'play' (normal gameplay + menu shortcuts) and 'build' (only while in build mode, so build keys may
// reuse gameplay keys like E/R). A key can belong to one action per context. Esc, F8, F9 and the mouse are fixed.

export type BindCtx = 'play' | 'build';
export interface BindDef { id: string; label: string; ctx: BindCtx; keys: string[] }

export const BIND_DEFS: BindDef[] = [
  { id: 'up', label: 'Move up', ctx: 'play', keys: ['KeyW', 'ArrowUp'] },
  { id: 'down', label: 'Move down', ctx: 'play', keys: ['KeyS', 'ArrowDown'] },
  { id: 'left', label: 'Move left', ctx: 'play', keys: ['KeyA', 'ArrowLeft'] },
  { id: 'right', label: 'Move right', ctx: 'play', keys: ['KeyD', 'ArrowRight'] },
  { id: 'sprint', label: 'Sprint (hold)', ctx: 'play', keys: ['ShiftLeft', 'ShiftRight'] },
  { id: 'reload', label: 'Reload', ctx: 'play', keys: ['KeyR'] },
  { id: 'interact', label: 'Search / interact', ctx: 'play', keys: ['KeyE'] },
  { id: 'heal', label: 'Quick heal', ctx: 'play', keys: ['KeyH'] },
  { id: 'flashlight', label: 'Flashlight', ctx: 'play', keys: ['KeyF'] },
  { id: 'slot1', label: 'Primary weapon', ctx: 'play', keys: ['Digit1'] },
  { id: 'slot2', label: 'Sidearm', ctx: 'play', keys: ['Digit2'] },
  { id: 'slot3', label: 'Melee weapon', ctx: 'play', keys: ['Digit3'] },
  { id: 'build', label: 'Build mode', ctx: 'play', keys: ['KeyB'] },
  { id: 'inventory', label: 'Inventory', ctx: 'play', keys: ['KeyI'] },
  { id: 'craft', label: 'Crafting', ctx: 'play', keys: ['KeyC'] },
  { id: 'tech', label: 'Tech tree', ctx: 'play', keys: ['KeyK'] },
  { id: 'map', label: 'Map', ctx: 'play', keys: ['KeyM', 'Tab'] },
  { id: 'mute', label: 'Mute audio', ctx: 'play', keys: ['KeyU'] },
  { id: 'cyclePrev', label: 'Previous structure', ctx: 'build', keys: ['KeyQ'] },
  { id: 'cycleNext', label: 'Next structure', ctx: 'build', keys: ['KeyE'] },
  { id: 'rotate', label: 'Rotate structure', ctx: 'build', keys: ['KeyR'] },
  { id: 'demolish', label: 'Demolish / salvage', ctx: 'build', keys: ['KeyX'] },
  { id: 'repair', label: 'Repair structure', ctx: 'build', keys: ['KeyG'] },
];
export const SLOTS = 2;
const STORE = 'deadzone-keys';
const FIXED = new Set(['Escape', 'F8', 'F9', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight']);
const byId = new Map(BIND_DEFS.map((d) => [d.id, d]));

let binds: Record<string, string[]> = {};
const listeners = new Set<() => void>();
let lookup: Record<BindCtx, Map<string, string>> = { play: new Map(), build: new Map() };

function defaults(): Record<string, string[]> { return Object.fromEntries(BIND_DEFS.map((d) => [d.id, d.keys.slice(0, SLOTS)])); }
function rebuild() {
  lookup = { play: new Map(), build: new Map() };
  for (const d of BIND_DEFS) for (const k of binds[d.id] ?? []) if (k) lookup[d.ctx].set(k, d.id);
}
function load() {
  binds = defaults();
  try {
    const raw = globalThis.localStorage?.getItem(STORE);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && typeof saved === 'object') for (const d of BIND_DEFS) {
      const v = saved[d.id];
      if (Array.isArray(v)) binds[d.id] = v.filter((k: unknown): k is string => typeof k === 'string' && !!k && !FIXED.has(k)).slice(0, SLOTS);
    }
  } catch { /* defaults */ }
  rebuild();
}
function persist() {
  try {
    const diff: Record<string, string[]> = {};
    for (const d of BIND_DEFS) if ((binds[d.id] ?? []).join() !== d.keys.slice(0, SLOTS).join()) diff[d.id] = binds[d.id];
    if (Object.keys(diff).length) globalThis.localStorage?.setItem(STORE, JSON.stringify(diff));
    else globalThis.localStorage?.removeItem(STORE);
  } catch { /* storage unavailable: bindings last for this session */ }
  rebuild();
  for (const fn of listeners) { try { fn(); } catch { /* ignore */ } }
}
load();

export const keybinds = {
  /** Keys bound to an action (may be empty). */
  keys(id: string): string[] { return (binds[id] ?? []).filter(Boolean); },
  /** Action bound to a key in a context, if any. */
  action(code: string, ctx: BindCtx = 'play'): string | undefined { return lookup[ctx].get(code); },
  /** True if any key of the action is in the held-key set. */
  held(id: string, keys: Set<string>) { for (const k of binds[id] ?? []) if (k && keys.has(k)) return true; return false; },
  isFixed(code: string) { return FIXED.has(code); },
  /** Bind code to slot of action. Returns the label of the action it was taken from, if any. */
  set(id: string, slot: number, code: string | null): string | null {
    const def = byId.get(id); if (!def || slot < 0 || slot >= SLOTS) return null;
    if (code && FIXED.has(code)) return null;
    let stolen: string | null = null;
    if (code) for (const d of BIND_DEFS) {
      if (d.ctx !== def.ctx) continue;
      const list = binds[d.id] ?? [];
      const i = list.indexOf(code);
      if (i >= 0 && !(d.id === id && i === slot)) { list[i] = ''; if (d.id !== id) stolen = d.label; }
    }
    const list = (binds[id] ??= []);
    while (list.length < SLOTS) list.push('');
    list[slot] = code ?? '';
    persist();
    return stolen;
  },
  slot(id: string, slot: number): string { return binds[id]?.[slot] ?? ''; },
  reset() { binds = defaults(); persist(); },
  onChange(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
  /** Human-readable key name. */
  label(code: string): string {
    if (!code) return '';
    const m = /^Key([A-Z])$/.exec(code) || /^Digit(\d)$/.exec(code); if (m) return m[1];
    const n = /^Numpad(\d)$/.exec(code); if (n) return 'Num ' + n[1];
    const names: Record<string, string> = {
      ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'R-Alt',
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Tab: 'Tab', Enter: 'Enter', Backspace: 'Bksp',
      CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
      Quote: "'", Comma: ',', Period: '.', Slash: '/', Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
    };
    return names[code] ?? code.replace(/^Numpad/, 'Num ');
  },
  /** Label of the action's keys, e.g. "M / Tab". first=true gives only the first key. */
  text(id: string, first = false): string {
    const ks = keybinds.keys(id).map((k) => keybinds.label(k));
    if (!ks.length) return '—';
    return first ? ks[0] : ks.join(' / ');
  },
  /** WASD-style summary for the four movement actions when they are single letters/arrows. */
  moveText(): string { return ['up', 'left', 'down', 'right'].map((id) => keybinds.text(id, true)).join(''); },
};

// ---- key capture for the Controls screen (registered first, in the capture phase, so nothing else sees the key)
let capture: ((code: string | null) => void) | null = null;
let modalEsc: (() => void) | null = null;
/** Next keydown goes to fn (Escape cancels with null, Backspace/Delete clears with ''). */
export function captureKey(fn: ((code: string | null) => void) | null) { capture = fn; }
/** While a modal is open: Escape calls fn and no other key reaches the game. */
export function setModal(fn: (() => void) | null) { modalEsc = fn; }
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
  if (capture) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    const fn = capture; capture = null;
    fn(e.code === 'Escape' ? null : e.code === 'Backspace' || e.code === 'Delete' ? '' : e.code);
    return;
  }
  if (modalEsc) {
    if (e.code === 'F8' || e.code === 'F12' || e.code === 'F5') return;
    e.stopImmediatePropagation();
    if (e.code === 'Tab') e.preventDefault();
    if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); modalEsc(); }
  }
}, true);
