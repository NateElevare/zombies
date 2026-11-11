// input.ts — keyboard/mouse -> action-based InputState for the sim. Owned by the orchestrator.
// Edge-triggered things (pressed actions, firePressed, altPressed) are LATCHED until a sim tick consumes them,
// so a quick click/tap between ticks is never lost. Keys come from src/keybinds.ts (rebindable); menu keys
// (inventory, map, ... and Esc) are handled by src/ui.
import type { Action, InputState } from './sim/types';
import { keybinds } from './keybinds';

/** Bindable ids that are sim actions (the rest are UI shortcuts handled by src/ui). */
const PLAY_ACTIONS = new Set<string>(['reload', 'interact', 'heal', 'flashlight', 'build', 'slot1', 'slot2', 'slot3']);

export class Input {
  readonly keys = new Set<string>();
  mouseX = 0; mouseY = 0;          // screen px (canvas space)
  mouseDown = false;
  private latched = new Set<Action>();
  private fireLatch = false;
  private altLatch = false;
  private el: HTMLElement;
  /** Set by the shell: true while in build mode (Q/E/wheel cycle, R rotate). */
  buildMode = false;
  /** Set by the shell: true while a UI overlay captures input. */
  blocked = false;

  constructor(el: HTMLElement) {
    this.el = el;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    el.addEventListener('mousemove', this.onMove);
    window.addEventListener('mousemove', this.onMove);
    el.addEventListener('mousedown', this.onDown);
    window.addEventListener('mouseup', this.onUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', this.onWheel, { passive: true });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    this.keys.add(e.code);
    if (this.blocked) return;
    if (this.buildMode) {
      if (e.code === 'Escape') { this.latched.add('cancel'); return; }
      const b = keybinds.action(e.code, 'build');
      if (b) { this.latched.add(b as Action); return; }
    }
    const a = keybinds.action(e.code, 'play');
    if (a && PLAY_ACTIONS.has(a)) this.latched.add(a as Action);
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onBlur = () => { this.keys.clear(); this.mouseDown = false; };
  private onMove = (e: MouseEvent) => {
    const r = this.el.getBoundingClientRect();
    this.mouseX = e.clientX - r.left; this.mouseY = e.clientY - r.top;
  };
  private onDown = (e: MouseEvent) => {
    if (this.blocked) return;
    if (e.button === 0) { this.mouseDown = true; this.fireLatch = true; }
    if (e.button === 2) this.altLatch = true;
  };
  private onUp = (e: MouseEvent) => { if (e.button === 0) this.mouseDown = false; };
  private onWheel = (e: WheelEvent) => {
    if (this.blocked || !e.deltaY) return;
    if (this.buildMode) this.latched.add(e.deltaY > 0 ? 'cycleNext' : 'cyclePrev');
    else this.latched.add(e.deltaY > 0 ? 'nextWeapon' : 'prevWeapon');
  };

  /** Build the InputState for the next tick(s). aim = world coords of the mouse. */
  sample(aimX: number, aimY: number): InputState {
    const k = this.keys, on = !this.blocked;
    let mx = 0, my = 0;
    if (on) {
      if (keybinds.held('left', k)) mx -= 1;
      if (keybinds.held('right', k)) mx += 1;
      if (keybinds.held('up', k)) my -= 1;
      if (keybinds.held('down', k)) my += 1;
    }
    return {
      moveX: mx, moveY: my, aimX, aimY,
      fire: on && this.mouseDown,
      firePressed: on && this.fireLatch,
      altPressed: on && this.altLatch,
      sprint: on && keybinds.held('sprint', k),
      interactHeld: on && keybinds.held('interact', k),
      pressed: new Set(this.latched),
    };
  }
  /** Call after a sim tick consumed the edge-triggered input. */
  consume() { this.latched.clear(); this.fireLatch = false; this.altLatch = false; }
  /** Drop everything (e.g. when an overlay opens). */
  reset() { this.consume(); this.mouseDown = false; }
}

export const NEUTRAL_INPUT = (aimX: number, aimY: number): InputState => ({
  moveX: 0, moveY: 0, aimX, aimY, fire: false, firePressed: false, altPressed: false, sprint: false, interactHeld: false, pressed: new Set(),
});
