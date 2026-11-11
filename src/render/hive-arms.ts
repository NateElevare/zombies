// render/hive-arms.ts — what the thrown insect weapons leave in the world (sim/hive-arms.ts): the Lure Lantern's
// lure and its pull, the Carrion Hive's cloud of flies, and either one in the air. Overhead only. Glows and dots:
// no art of its own, so it never depends on an atlas.
import * as Phaser from 'phaser';
import type { GameState } from '../sim/types';
import { TX } from './art';
import { D, Pool, type View } from './common';
import { LURE_RANGE, LURE_TIME } from '../sim/hive-arms';

export class HiveArmsRender {
  private glows: Pool<Phaser.GameObjects.Image>;
  private dots: Pool<Phaser.GameObjects.Image>;
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.glows = new Pool(() => scene.add.image(0, 0, TX.soft).setDepth(D.glow).setBlendMode(Phaser.BlendModes.ADD));
    this.dots = new Pool(() => scene.add.image(0, 0, TX.soft).setDepth(D.zombie + 1));
    this.g = scene.add.graphics().setDepth(D.decal + 2);
  }
  clear() { for (const p of [this.glows, this.dots]) { p.begin(); p.end(); } this.g.clear(); }

  draw(s: GameState, v: View, time: number) {
    this.glows.begin(); this.dots.begin(); this.g.clear();
    const rt = s.mode === 'road' ? s.road?.hiveRt : null;
    if (rt) {
      const vis = (x: number, y: number, pad = 200) => x > v.x - pad && x < v.x + v.w + pad && y > v.y - pad && y < v.y + v.h + pad;
      const glow = (x: number, y: number, r: number, col: number, a: number) => this.glows.get().setPosition(x, y).setScale(r * 2 / 256).setTint(col).setAlpha(a);
      const dot = (x: number, y: number, r: number, col: number, a: number) => this.dots.get().setPosition(x, y).setScale(r * 2 / 256).setTint(col).setAlpha(a);
      // in the air: a small bright thing on an arc
      for (const l of rt.lobs ?? []) {
        if (!vis(l.x, l.y)) continue;
        const k = Math.min(1, l.t / l.T), up = Math.sin(Math.PI * k) * 46, col = l.kind === 'lure' ? 0xd8ff70 : 0x8a9a4a;
        dot(l.x, l.y - up, 14, col, 1); glow(l.x, l.y - up, 40, col, 0.6);
        dot(l.x + 3, l.y + 4, 10 * (1 - 0.4 * Math.sin(Math.PI * k)), 0x000000, 0.35);
      }
      // a lure: a hard little light, a ring that shows how far it calls, and a quickening pulse before it bursts
      for (const l of rt.lures ?? []) {
        if (!vis(l.x, l.y, LURE_RANGE)) continue;
        const last = l.life < 1.5, pulse = 0.5 + 0.5 * Math.sin(time * (last ? 26 : 7));
        dot(l.x, l.y, 12, 0xf4ffb0, 1);
        glow(l.x, l.y, 90 + 30 * pulse, 0xd8ff70, 0.55 + 0.25 * pulse);
        glow(l.x, l.y, 300, 0xb8e060, 0.1);
        this.g.lineStyle(2, last ? 0xff8a3a : 0xd8ff70, 0.16 + 0.1 * pulse).strokeCircle(l.x, l.y, LURE_RANGE * Math.min(1, (LURE_TIME - l.life) * 3 + 0.2));
      }
      // a cloud of flies: a dark smear with specks circling in it
      for (const c of rt.clouds ?? []) {
        if (!vis(c.x, c.y, c.r)) continue;
        const k = Math.min(1, c.life / 0.8);
        dot(c.x, c.y, c.r * 1.05, 0x2a3018, 0.42 * k); dot(c.x + 18, c.y - 12, c.r * 0.7, 0x1c2210, 0.3 * k);
        this.g.lineStyle(2, 0x9aa84a, 0.3 * k).strokeCircle(c.x, c.y, c.r);
        for (let i = 0; i < 26; i++) {
          const a = time * (1.6 + (i % 5) * 0.5) * (i % 2 ? 1 : -1) + i * 2.1, r = c.r * (0.2 + 0.75 * ((i * 37 % 100) / 100)), w = Math.sin(time * 9 + i) * 7;
          this.g.fillStyle(i % 3 ? 0x10140a : 0xb9c860, 0.85 * k).fillRect(Math.round(c.x + Math.cos(a) * r + w) - 2, Math.round(c.y + Math.sin(a) * r * 0.9) - 2, 4, 4);
        }
      }
    }
    this.glows.end(); this.dots.end();
  }
}
