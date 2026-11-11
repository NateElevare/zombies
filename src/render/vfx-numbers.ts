// vfx-numbers.ts — floating damage numbers. Pooled glyph images (TX.digits, an outlined digit font built
// at runtime), drawn above the lightmap so they read at night. Each number pops in (overshoot), drifts up
// with drag and fades. Crits are bigger, yellow and get a '!'; burn ticks are small and orange.
import type * as Phaser from 'phaser';
import { TX, DIGIT_W } from './art';
import { D, inView, type View } from './common';

const MAX = 48, GLYPHS = 6;
export const enum NumKind { Normal, Crit, Burn, Big }
const STYLE: Record<NumKind, { col: number; sc: number; life: number }> = {
  [NumKind.Normal]: { col: 0xffffff, sc: 0.42, life: 0.7 },
  [NumKind.Crit]: { col: 0xffd23a, sc: 0.66, life: 0.95 },
  [NumKind.Burn]: { col: 0xffa040, sc: 0.32, life: 0.6 },
  [NumKind.Big]: { col: 0xff7a4a, sc: 0.56, life: 0.85 },
};

interface Num { on: boolean; x: number; y: number; vx: number; vy: number; t: number; life: number; sc: number; n: number; imgs: Phaser.GameObjects.Image[] }

export class DamageNumbers {
  private items: Num[] = [];
  private head = 0;
  private seed = 7;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < MAX; i++) {
      const imgs: Phaser.GameObjects.Image[] = [];
      for (let k = 0; k < GLYPHS; k++) imgs.push(scene.add.image(0, 0, TX.digits, 'd0').setDepth(D.glow + 1).setVisible(false));
      this.items.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, sc: 1, n: 0, imgs });
    }
  }
  private rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  spawn(x: number, y: number, value: number, kind: NumKind) {
    const v = Math.round(value);
    if (!(v > 0)) return;
    const st = STYLE[kind];
    // reuse the oldest slot when full
    let idx = this.head;
    for (let k = 0; k < MAX; k++) { const j = (this.head + k) % MAX; if (!this.items[j].on) { idx = j; break; } }
    this.head = (idx + 1) % MAX;
    const it = this.items[idx];
    const s = String(Math.min(99999, v)) + (kind === NumKind.Crit ? '!' : '');
    it.on = true; it.t = 0; it.life = st.life; it.sc = st.sc * (kind === NumKind.Normal ? Math.min(1.35, 0.9 + v / 160) : 1);
    it.x = x + (this.rnd() - 0.5) * 34; it.y = y - 10 - this.rnd() * 16;
    it.vx = (this.rnd() - 0.5) * 60; it.vy = -(kind === NumKind.Crit ? 150 : 110);
    it.n = Math.min(GLYPHS, s.length);
    for (let k = 0; k < GLYPHS; k++) {
      const img = it.imgs[k];
      if (k >= it.n) { if (img.visible) img.setVisible(false); continue; }
      const ch = s[k];
      img.setFrame(ch === '!' ? 'dx' : 'd' + ch).setTint(st.col).setVisible(true).setAlpha(1);
    }
  }

  update(v: View, dt: number) {
    for (const it of this.items) {
      if (!it.on) continue;
      it.t += dt;
      if (it.t >= it.life) { it.on = false; for (const img of it.imgs) if (img.visible) img.setVisible(false); continue; }
      const k = Math.exp(-5 * dt);
      it.vx *= k; it.vy *= k;
      it.x += it.vx * dt; it.y += it.vy * dt;
      const u = it.t / it.life;
      // pop: overshoot to 1.45x in 70 ms, settle to 1x by 160 ms
      const pop = it.t < 0.07 ? 0.4 + 1.05 * (it.t / 0.07) : it.t < 0.16 ? 1.45 - 0.45 * ((it.t - 0.07) / 0.09) : 1;
      const sc = it.sc * pop;
      const a = u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1;
      const vis = inView(v, it.x, it.y, 60);
      const step = DIGIT_W * sc * 0.78;
      const x0 = it.x - (step * (it.n - 1)) / 2;
      for (let g = 0; g < it.n; g++) {
        const img = it.imgs[g];
        if (img.visible !== vis) img.setVisible(vis);
        if (!vis) continue;
        img.setPosition(x0 + g * step, it.y).setScale(sc).setAlpha(a);
      }
    }
  }

  clear() { for (const it of this.items) { it.on = false; for (const img of it.imgs) img.setVisible(false); } }
  destroy() { for (const it of this.items) for (const img of it.imgs) img.destroy(); this.items.length = 0; }
}
