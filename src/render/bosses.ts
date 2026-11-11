// bosses.ts — draws top-down bosses (arcade and legacy story) and their attack hazards.
// Overhead raster poses follow the simulation; pixel hazards preserve its warning geometry.
import * as Phaser from 'phaser';
import type { GameState, Zombie } from '../sim/types';
import { BOSSES, PLAGUE_AURA, fx as bossFx, isBoss, type BossId } from '../sim/bosses';
import { D, TAU, inView, type View } from './common';
import { type Art, TX } from './art';
import { bossFrameSize, bossFrame, bossPose } from '../boss-art';
import { isAngledStory } from '../story-mode';

const hex = (c: string) => parseInt(c.slice(1), 16);

// Scanline rectangles retain the actual danger radius with a crisp stepped edge.
// Optional width produces a ring rather than a filled disc.
function pixelCircle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number, alpha: number, width = 0) {
  if (r <= 0 || alpha <= 0) return;
  const step = 4, inner = Math.max(0, r - width);
  g.fillStyle(color, alpha);
  for (let dy = -Math.ceil(r / step) * step; dy < r; dy += step) {
    const yy = dy + step / 2;
    if (Math.abs(yy) >= r) continue;
    const outerX = Math.round(Math.sqrt(r * r - yy * yy) / step) * step;
    if (width && Math.abs(yy) < inner) {
      const innerX = Math.round(Math.sqrt(inner * inner - yy * yy) / step) * step;
      const span = Math.max(step, outerX - innerX);
      g.fillRect(x - outerX, y + dy, span, step);
      g.fillRect(x + outerX - span, y + dy, span, step);
    } else g.fillRect(x - outerX, y + dy, outerX * 2, step);
  }
}

interface BV { body: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; stamp: number }

export class BossRender {
  private ground: Phaser.GameObjects.Graphics;   // puddles, telegraphs, aura (under the actors)
  private air: Phaser.GameObjects.Graphics;      // shockwaves, projectiles (over the actors)
  private views = new Map<string, BV>();
  private stamp = 0;
  private soft: string;

  constructor(private scene: Phaser.Scene, private art: Art) {
    this.ground = scene.add.graphics().setDepth(D.decal + 2);
    this.air = scene.add.graphics().setDepth(D.player + 8);
    this.soft = 'boss_pixel_glow';
    if (!scene.textures.exists(this.soft)) {
      const t = scene.textures.createCanvas(this.soft, 64, 64);
      if (t) {
        const g = t.getContext();
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
          const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 32;
          if (d < 1) { g.fillStyle = 'rgba(255,255,255,' + Math.floor((1 - d) * 8) / 8 + ')'; g.fillRect(x, y, 1, 1); }
        }
        t.refresh(); t.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
  }

  clear() {
    this.ground.clear(); this.air.clear();
    for (const v of this.views.values()) { v.body.destroy(); v.glow.destroy(); v.shadow.destroy(); }
    this.views.clear();
  }

  private view(z: Zombie & { boss: BossId }) {
    let v = this.views.get(z.id);
    if (!v) {
      const frame = bossFrame(z.boss, 'idle', 0), key = this.art.atlasOf(frame) || TX.ring;
      v = {
        shadow: this.scene.add.image(0, 0, this.soft).setDepth(D.shadow).setTint(0x000000).setAlpha(0.55),
        glow: this.scene.add.image(0, 0, this.soft).setDepth(D.zombie - 1).setBlendMode(Phaser.BlendModes.ADD).setTint(hex(BOSSES[z.boss].glow)),
        body: this.scene.add.image(0, 0, key, this.art.has(frame) ? frame : undefined).setDepth(D.zombie + 0.5),
        stamp: 0,
      };
      this.views.set(z.id, v);
    }
    return v;
  }

  draw(state: GameState, alpha: number, _dt: number, view: View) {
    const g = this.ground, a = this.air, st = ++this.stamp, time = state.time;
    g.clear(); a.clear();
    // Angled story owns its projected bosses; both overhead modes use this renderer.
    if (isAngledStory(state)) { this.clear(); return; }
    const f = bossFx(state);
    // puddles
    for (const q of f.pools) {
      if (!inView(view, q.x, q.y, q.r + 10)) continue;
      const k = Math.min(1, q.life / 0.8) * Math.min(1, (q.max - q.life) / 0.3 + 0.3);
      const col = q.kind === 'toxic' ? 0x9b3fd0 : 0x8fd030;
      pixelCircle(g, q.x, q.y, q.r, col, 0.4 * k);
      pixelCircle(g, q.x, q.y, q.r, col, 0.7 * k, 4);
      for (let i = 0; i < 7; i++) {
        const an = i * 2.4 + q.x, radius = q.r * (0.2 + i * 0.085);
        const bx = q.x + Math.cos(an) * radius, by = q.y + Math.sin(an) * radius;
        const br = 3 + (Math.floor(time * 5 + i) % 3) * 2;
        pixelCircle(g, bx, by, br, q.kind === 'toxic' ? 0xe5b0ff : 0xd4ef89, 0.65 * k, 3);
      }
    }
    // telegraphs: fill grows to the edge as the attack lands
    for (const t of f.tele) {
      const k = Math.min(1, t.t / t.T), col = hex(t.color), blink = 0.55 + 0.45 * Math.sin(time * 26);
      if (t.kind === 'circle') {
        pixelCircle(g, t.x, t.y, t.r, col, 0.12);
        pixelCircle(g, t.x, t.y, t.r * k, col, 0.22);
        pixelCircle(g, t.x, t.y, t.r, col, 0.5 + 0.4 * blink, 4);
      } else {
        const ca = Math.cos(t.angle), sa = Math.sin(t.angle), w = t.r * 1.6, L = t.len;
        const pts = [[0, -w / 2], [L, -w / 2], [L, w / 2], [0, w / 2]].map(([u, v]) => new Phaser.Math.Vector2(t.x + ca * u - sa * v, t.y + sa * u + ca * v));
        g.fillStyle(col, 0.12 + 0.18 * k).fillPoints(pts, true);
        g.lineStyle(3, col, 0.5 + 0.4 * blink).strokePoints(pts, true);
        for (let u = 20; u < L; u += 32) {
          const cx = t.x + ca * u, cy = t.y + sa * u;
          g.fillStyle(col, 0.6 + 0.2 * blink).fillRect(Math.round(cx / 4) * 4 - 4, Math.round(cy / 4) * 4 - 4, 8, 8);
        }
      }
    }
    // bosses
    for (const z of state.zombies) {
      if (z.dead || !isBoss(z)) continue;
      const x = z.prevX + (z.x - z.prevX) * alpha, y = z.prevY + (z.y - z.prevY) * alpha;
      const R = Number((z as { drawR?: number }).drawR) || z.r;   // the Warden is drawn far bigger than its collision radius
      if (!inView(view, x, y, R * 4)) continue;
      const v = this.view(z); v.stamp = st;
      const pose = bossPose(z);
      const frame = bossFrame(z.boss, pose, pose === 'melee' ? z.attackT : z.act ? z.actT : time, z as { act?: string; stage?: number; hitFlash?: number });
      if (this.art.has(frame) && v.body.frame.name !== frame) v.body.setTexture(this.art.atlasOf(frame)!, frame);
      const d = BOSSES[z.boss], act = String(z.act || ''), leap = Number(z.leapK) || 0;
      const lift = leap > 0 ? Math.sin(Math.PI * leap) : 0;
      const winding = act.endsWith('Wind');
      const sc = (R * 2.7) / bossFrameSize(z.boss) * (1 + 0.45 * lift) * (winding ? 1 + 0.05 * Math.sin(time * 30) : 1);
      const wob = act === 'stunned' ? Math.sin(time * 18) * 0.25 : Math.sin(time * 3 + z.r) * 0.04;
      const raged = !!(z as { raged?: boolean }).raged;
      // The Hive Below: the Prioress fades out of sight outside your beam (sim/hive-bosses.ts sets `alpha`)
      const seen = typeof (z as { alpha?: number }).alpha === 'number' ? Math.max(0, Math.min(1, (z as { alpha?: number }).alpha!)) : 1;
      v.body.setVisible(true).setPosition(x, y - lift * 40).setRotation(z.angle + wob).setScale(sc).setAlpha(seen);
      if (z.hitFlash > 0.06) v.body.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);
      else if (winding) v.body.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xffd0c0);
      else if (raged) v.body.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xffb8b0);
      else v.body.setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
      v.glow.setVisible(true).setPosition(x, y - lift * 40).setScale(R * (winding || raged ? 4 : 3) / 64).setAlpha((winding ? 0.28 : raged ? 0.2 : 0.1) * seen);
      v.shadow.setVisible(true).setPosition(x + 4, y + 6).setScale(R * 2.8 / 64 * (1 - 0.35 * lift)).setAlpha(0.55 * (1 - 0.4 * lift) * seen);
      if (act === 'stunned') {   // dizzy stars
        for (let i = 0; i < 3; i++) {
          const an = time * 5 + i * TAU / 3, sx = Math.round(x + Math.cos(an) * R * 0.8), sy = Math.round(y - R - 6 + Math.sin(an) * 6);
          a.fillStyle(0xfff080, 0.9).fillRect(sx - 6, sy - 2, 12, 4).fillRect(sx - 2, sy - 6, 4, 12);
        }
      }
      if (z.boss === 'plague') {
        const pulse = 0.5 + 0.5 * Math.sin(time * 4);
        pixelCircle(g, x, y, PLAGUE_AURA, hex(d.glow), 0.08 + 0.05 * pulse);
        pixelCircle(g, x, y, PLAGUE_AURA, hex(d.glow), 0.25 + 0.2 * pulse, 4);
      }
    }
    for (const [id, v] of this.views) if (v.stamp !== st) { v.body.destroy(); v.glow.destroy(); v.shadow.destroy(); this.views.delete(id); }
    // shockwaves
    for (const r of f.rings) {
      const k = 1 - r.r / r.maxR, col = hex(r.color);
      pixelCircle(a, r.x, r.y, r.r + r.width * 0.25, col, 0.25 * k, r.width * 0.5);
      pixelCircle(a, r.x, r.y, r.r, 0xffffff, 0.7 * k, 4);
      pixelCircle(a, r.x, r.y, r.r - 6, col, 0.55 * k, 8);
    }
    // projectiles (lobbed ones arc up; a ground shadow shows where they are)
    for (const s of f.shots) {
      const x = s.prevX + (s.x - s.prevX) * alpha, y = s.prevY + (s.y - s.prevY) * alpha;
      if (!inView(view, x, y, 120)) continue;
      if (s.kind === 'cleaver') {   // a spinning blade
        const spin = time * 22 + s.id;
        for (let i = 0; i < 2; i++) {
          const an = spin + i * Math.PI / 2, dx = Math.cos(an) * 12, dy = Math.sin(an) * 12;
          a.fillStyle(0xd8d8d0, 1).fillRect(x + dx - 3, y + dy - 3, 6, 6).fillRect(x - dx - 3, y - dy - 3, 6, 6);
        }
        pixelCircle(a, x, y, 7, 0x5a3a2a, 1); pixelCircle(a, x, y, 4, 0xb0b0a8, 1);
        continue;
      }
      if (s.kind === 'spit') {
        const ang = Math.atan2(s.vy, s.vx);
        for (let i = 2; i >= 0; i--) pixelCircle(a, x - Math.cos(ang) * i * 7, y - Math.sin(ang) * i * 7, s.r - i * 2, i ? 0x8e3b9d : 0xd77cff, 1 - i * 0.2);
        a.fillStyle(0xf2c8ff, 1).fillRect(x - 4, y - 4, 4, 4);
        continue;
      }
      const k = Math.min(1, s.t / s.T), h = Math.sin(Math.PI * k) * 110;
      pixelCircle(g, x, y, 10 + 6 * k, 0x000000, 0.3);
      if (s.kind === 'rock') {
        pixelCircle(a, x, y - h, 16, 0x272823, 1);
        pixelCircle(a, x - 2, y - h - 2, 12, 0x68685c, 1);
        a.fillStyle(0xaaa18a, 1).fillRect(x - 8, y - h - 10, 12, 4).fillRect(x - 10, y - h - 6, 4, 8);
        a.fillStyle(0x43473f, 1).fillRect(x + 2, y - h + 2, 8, 8);
      } else {
        pixelCircle(a, x, y - h, 13, 0x435d1d, 1);
        pixelCircle(a, x - 2, y - h - 2, 9, 0xa8ce45, 1);
        a.fillStyle(0xe0f3a4, 1).fillRect(x - 5, y - h - 6, 6, 4);
      }
    }
  }
}
