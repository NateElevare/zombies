// story-bosses.ts — bosses (sim/bosses.ts) for the angled story camera: their bodies, drawn with the same
// overhead boss art and poses as the arcade (render/bosses.ts, boss-art.ts), and their attack hazards.
// The top-down BossRender only draws in the arcade; here the warnings are projected onto the tilted ground
// plane (circles become ellipses), and lobbed shots rise along the camera's up axis.
import * as Phaser from 'phaser';
import type { GameState, SimEvent, Zombie } from '../sim/types';
import { BOSSES, PLAGUE_AURA, isBoss, type BossFx, type BossId } from '../sim/bosses';
import { bossFrameSize, bossFrame, bossPose } from '../boss-art';
import { STORY_CAMERA, storyProject } from './story-projection';
import type { View } from './common';
import type { Art } from './art';

/** Ground ellipses are squashed by the camera tilt. */
const SQUASH = Math.cos(STORY_CAMERA.tilt * Math.PI / 180);
const hex = (c: string) => parseInt(c.slice(1), 16);
const near = (v: View, x: number, y: number, pad: number) => x > v.x - pad && y > v.y - pad && x < v.x + v.w + pad && y < v.y + v.h + pad;

/** Screen angle of a ground-plane heading after the camera tilt squashes y. */
const screenAngle = (a: number) => Math.atan2(Math.sin(a) * SQUASH, Math.cos(a));
/** Depth of world objects that must never be hidden by scenery (roofs, walls). */
const ON_TOP = 600040;
interface Body { z: Zombie; img: Phaser.GameObjects.Image; seen: number; deadT: number; x: number; y: number; angle: number; boss: BossId; r: number }

export class StoryBossFx {
  private ground: Phaser.GameObjects.Graphics;   // puddles, telegraphs, aura: on the floor, under every actor
  private air: Phaser.GameObjects.Graphics;      // shockwaves and projectiles: over everything in the world
  private bodies = new Map<string, Body>();
  private tick = 0;
  constructor(private scene: Phaser.Scene, private art: Art) {
    this.ground = scene.add.graphics().setDepth(21).setData('story', true);
    this.air = scene.add.graphics().setDepth(600050).setData('story', true);
  }
  clear() { this.ground.clear(); this.air.clear(); for (const b of this.bodies.values()) b.img.destroy(); this.bodies.clear(); }

  /** A boss died: keep its body and play the death frames where it fell. */
  event(ev: SimEvent) {
    if (ev.t !== 'zombieKilled' || !ev.boss) return;
    const b = this.bodies.get(ev.id);
    if (b && !b.deadT) { b.deadT = 0.0001; b.x = ev.x; b.y = ev.y; }
  }

  private body(z: Zombie & { boss: BossId }) {
    let b = this.bodies.get(z.id);
    if (!b) {
      const frame = bossFrame(z.boss, 'idle', 0);
      const img = this.scene.add.image(0, 0, this.art.atlasOf(frame) || '__DEFAULT', this.art.has(frame) ? frame : undefined).setData('story', true);
      b = { z, img, seen: 0, deadT: 0, x: z.x, y: z.y, angle: z.angle, boss: z.boss, r: BOSSES[z.boss].r };
      this.bodies.set(z.id, b);
    }
    return b;
  }

  /** Overhead boss art at the boss's projected ground point. A boss hunting you draws above roofs and walls. */
  private drawBodies(state: GameState, v: View, alpha: number, dt: number) {
    const st = ++this.tick, time = state.time;
    for (const z of state.zombies) {
      if (z.dead || !isBoss(z) || !near(v, z.x, z.y, 200)) continue;
      const b = this.body(z); b.seen = st;
      const x = z.prevX + (z.x - z.prevX) * alpha, y = z.prevY + (z.y - z.prevY) * alpha;
      b.x = x; b.y = y; b.angle = z.angle;
      const pose = bossPose(z), frame = bossFrame(z.boss, pose, pose === 'melee' ? z.attackT : z.act ? Number(z.actT) || 0 : time);
      if (this.art.has(frame) && b.img.frame.name !== frame) b.img.setTexture(this.art.atlasOf(frame)!, frame);
      const act = String(z.act || ''), lift = Number(z.leapK) > 0 ? Math.sin(Math.PI * Number(z.leapK)) : 0, winding = act.endsWith('Wind');
      const sc = (b.r * 2.7) / bossFrameSize(z.boss) * (1 + 0.45 * lift) * (winding ? 1 + 0.05 * Math.sin(time * 30) : 1);
      const wob = act === 'stunned' ? Math.sin(time * 18) * 0.25 : Math.sin(time * 3 + b.r) * 0.04;
      const q = storyProject({ x, y }, lift * 60);
      b.img.setVisible(true).setAlpha(1).setPosition(q.x, q.y).setRotation(screenAngle(z.angle) + wob).setScale(sc, sc * (0.82 + 0.18 * SQUASH));
      b.img.setDepth(z.announced ? ON_TOP : 10000 + y);
      if (z.hitFlash > 0.06) b.img.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);
      else if (winding) b.img.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xffd0c0);
      else b.img.setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
      this.ellipse(this.ground, x + 4, y + 6, b.r * 1.3 * (1 - 0.35 * lift), 0x000000, 0.45 * (1 - 0.4 * lift));
      if (act === 'stunned') for (let i = 0; i < 3; i++) {   // dizzy stars
        const an = time * 5 + i * Math.PI * 2 / 3, s = storyProject({ x: x + Math.cos(an) * b.r * 0.8, y }, b.r * 2.2 + Math.sin(an) * 6);
        this.air.fillStyle(0xfff080, 0.9).fillRect(s.x - 6, s.y - 2, 12, 4).fillRect(s.x - 2, s.y - 6, 4, 12);
      }
    }
    for (const [id, b] of this.bodies) {
      if (b.seen === st) continue;
      if (!b.deadT && b.z.dead && b.z.hp <= 0) b.deadT = 0.0001;   // killed (not despawned): the event may arrive after this draw
      if (b.deadT > 0 && b.deadT < 4) {   // death frames, then fade out
        b.deadT += dt;
        const frame = bossFrame(b.boss, 'death', b.deadT);
        if (this.art.has(frame) && b.img.frame.name !== frame) b.img.setTexture(this.art.atlasOf(frame)!, frame);
        const q = storyProject({ x: b.x, y: b.y });
        b.img.setVisible(true).setTintMode(Phaser.TintModes.MULTIPLY).clearTint().setPosition(q.x, q.y).setDepth(19).setAlpha(Math.min(1, (4 - b.deadT) / 1.5));
        continue;
      }
      b.img.destroy(); this.bodies.delete(id);
    }
  }

  private ellipse(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number, alpha: number, line = 0) {
    if (r <= 0 || alpha <= 0) return;
    const q = storyProject({ x, y });
    if (line) g.lineStyle(line, color, alpha).strokeEllipse(q.x, q.y, r * 2, r * 2 * SQUASH);
    else g.fillStyle(color, alpha).fillEllipse(q.x, q.y, r * 2, r * 2 * SQUASH);
  }

  draw(state: GameState, v: View, alpha: number, dt: number) {
    const g = this.ground, a = this.air, f = state.bossFx as BossFx | undefined, time = state.time;
    g.clear(); a.clear();
    if (state.arcade) return;
    this.drawBodies(state, v, alpha, dt);
    // plague aura around a hunting Plague Lord
    for (const z of state.zombies) {
      if (z.dead || !isBoss(z) || z.boss !== 'plague' || z.state !== 'chase' || !near(v, z.x, z.y, PLAGUE_AURA)) continue;
      const x = z.prevX + (z.x - z.prevX) * alpha, y = z.prevY + (z.y - z.prevY) * alpha, pulse = 0.5 + 0.5 * Math.sin(time * 4), c = hex(BOSSES.plague.glow);
      this.ellipse(g, x, y, PLAGUE_AURA, c, 0.08 + 0.05 * pulse);
      this.ellipse(g, x, y, PLAGUE_AURA, c, 0.3 + 0.2 * pulse, 3);
    }
    if (!f) return;
    for (const q of f.pools) {
      if (!near(v, q.x, q.y, q.r + 10)) continue;
      const k = Math.min(1, q.life / 0.8) * Math.min(1, (q.max - q.life) / 0.3 + 0.3), c = q.kind === 'toxic' ? 0x9b3fd0 : 0x8fd030;
      this.ellipse(g, q.x, q.y, q.r, c, 0.4 * k);
      this.ellipse(g, q.x, q.y, q.r, c, 0.75 * k, 3);
    }
    // telegraphs fill up as the attack lands
    for (const t of f.tele) {
      const k = Math.min(1, t.t / t.T), c = hex(t.color), blink = 0.55 + 0.45 * Math.sin(time * 26);
      if (t.kind === 'circle') {
        this.ellipse(g, t.x, t.y, t.r, c, 0.12);
        this.ellipse(g, t.x, t.y, t.r * k, c, 0.22);
        this.ellipse(g, t.x, t.y, t.r, c, 0.5 + 0.4 * blink, 3);
      } else {
        const ca = Math.cos(t.angle), sa = Math.sin(t.angle), w = t.r * 1.6, L = t.len;
        const pts = [[0, -w / 2], [L, -w / 2], [L, w / 2], [0, w / 2]].map(([u, s]) => {
          const q = storyProject({ x: t.x + ca * u - sa * s, y: t.y + sa * u + ca * s });
          return new Phaser.Math.Vector2(q.x, q.y);
        });
        g.fillStyle(c, 0.12 + 0.18 * k).fillPoints(pts, true);
        g.lineStyle(3, c, 0.5 + 0.4 * blink).strokePoints(pts, true);
      }
    }
    for (const r of f.rings) {
      const k = 1 - r.r / r.maxR, c = hex(r.color);
      this.ellipse(a, r.x, r.y, r.r, c, 0.35 * k, r.width * 0.5);
      this.ellipse(a, r.x, r.y, r.r, 0xffffff, 0.7 * k, 3);
    }
    for (const s of f.shots) {
      const x = s.prevX + (s.x - s.prevX) * alpha, y = s.prevY + (s.y - s.prevY) * alpha;
      if (!near(v, x, y, 120)) continue;
      if (s.kind === 'spit') {
        const q = storyProject({ x, y }, 30);
        a.fillStyle(0x8e3b9d, 1).fillCircle(q.x, q.y, s.r).fillStyle(0xd77cff, 1).fillCircle(q.x - 2, q.y - 2, s.r * 0.6);
        continue;
      }
      // lobbed: a shadow on the ground, the projectile arcing above it
      const k = Math.min(1, s.t / s.T), h = 30 + Math.sin(Math.PI * k) * 140, q = storyProject({ x, y }, h);
      this.ellipse(g, x, y, 10 + 6 * k, 0x000000, 0.3);
      if (s.kind === 'rock') a.fillStyle(0x272823, 1).fillCircle(q.x, q.y, 16).fillStyle(0x68685c, 1).fillCircle(q.x - 3, q.y - 3, 11);
      else a.fillStyle(0x435d1d, 1).fillCircle(q.x, q.y, 13).fillStyle(0xa8ce45, 1).fillCircle(q.x - 2, q.y - 2, 8);
    }
  }
}
