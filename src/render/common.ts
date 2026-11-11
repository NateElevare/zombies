// common.ts — depth bands, small math helpers and an object pool shared by the render modules.
import type * as Phaser from 'phaser';

/** Fixed depth bands. Objects are created into a band and never change depth (no per-frame display-list sorts). */
export const D = {
  ground: 0,
  decal: 10,        // blood pools, scorch, corpses
  floorObj: 15,     // structures lying flat (spike trap, bed, campfire stones), drops
  litFxLow: 18,     // shell casings, dust on the floor
  shadow: 20,       // actor shadows
  zombie: 30,
  zombieOver: 31,   // zombie hit flash overlay
  player: 40,       // 40..46 player parts
  structure: 50,    // walls/doors/turrets built by the player
  tree: 60,         // canopies (above actors' feet, below roofs)
  litFx: 70,        // smoke, blood mist (lit by the lightmap)
  roof: 80,
  light: 100,       // the lightmap (MULTIPLY)
  glow: 110,        // emissive: muzzle flashes, tracers, fire, sparks (ADD, above the darkness)
  overlay: 120,     // build ghost, interact outline, crosshair
} as const;

export const TAU = Math.PI * 2;
export function angleLerp(a: number, b: number, t: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return a + d * t;
}
export function hash2(a: number, b: number, s = 0) {
  let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ (s | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}
/** Deterministic small RNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hexColor(s: string | undefined, fallback: number): number {
  if (!s || s[0] !== '#') return fallback;
  const v = parseInt(s.length === 4 ? s[1] + s[1] + s[2] + s[2] + s[3] + s[3] : s.slice(1, 7), 16);
  return Number.isFinite(v) ? v : fallback;
}

/** Grow-only pool of display objects; `begin()` each frame, `get()` for each use, `end()` hides the rest. */
export class Pool<T extends Phaser.GameObjects.GameObject & { setVisible(v: boolean): any; visible: boolean }> {
  items: T[] = [];
  used = 0;
  constructor(private make: () => T) {}
  begin() { this.used = 0; }
  get(): T {
    let o = this.items[this.used];
    if (!o) { o = this.make(); this.items.push(o); }
    this.used++;
    if (!o.visible) o.setVisible(true);
    return o;
  }
  end() { for (let i = this.used; i < this.items.length; i++) { const o = this.items[i]; if (o.visible) o.setVisible(false); } }
  destroy() { for (const o of this.items) o.destroy(); this.items.length = 0; this.used = 0; }
}

/** View rectangle in world px (with the camera's rendered position). */
export interface View { x: number; y: number; w: number; h: number; zoom: number }
export function inView(v: View, x: number, y: number, m: number) {
  return x > v.x - m && x < v.x + v.w + m && y > v.y - m && y < v.y + v.h + m;
}
