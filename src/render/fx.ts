// fx.ts — event-driven effects: pooled particles (lit and emissive), persistent decals (blood pools, scorch,
// corpses) with caps and fading, dying-zombie death anims, timed point lights (muzzle, explosions).
import * as Phaser from 'phaser';
import type { GameState, SimEvent, ZombieType } from '../sim/types';
import { TYPES } from '../sim/zombies';
import type { Art } from './art';
import { TX } from './art';
import { D, inView, type View } from './common';
import { PostFx } from './vfx-post';
import { DamageNumbers } from './vfx-numbers';
import { BOSSES, type BossId } from '../sim/bosses';
import { bossFrameSize, bossPrefix } from '../boss-art';
import { isHiveType } from '../sim/zombies';
import { hiveDesignR, hivePrefix } from './hive';
import { hiveMaterial, hiveMaterialZone } from './hive-materials';

// ---------------------------------------------------------------- particles
const enum Layer { Floor, Lit, Glow }
interface Particle {
  on: boolean; x: number; y: number; vx: number; vy: number; drag: number;
  t: number; life: number; rot: number; vr: number; s0: number; s1: number; a0: number; a1: number;
  /** fake height above the floor (px) + vertical velocity: debris/shells/gibs hop and bounce */
  z: number; vz: number; hop: boolean; asp: number;
  frames: string[] | null; atlas: string; loop: boolean; fps: number; img: Phaser.GameObjects.Image; tint: number;
}
const CAP = { [Layer.Floor]: 220, [Layer.Lit]: 300, [Layer.Glow]: 340 } as const;
const GRAV = 980;

export interface Light { x: number; y: number; r: number; col: number; i: number; t: number; life: number; flick: number }

// ---------------------------------------------------------------- decals
interface Decal { img: Phaser.GameObjects.Image; on: boolean; fade: number; x: number; y: number; r: number; a: number; age?: number }
class DecalRing {
  items: Decal[] = [];
  head = 0;
  /** life = seconds before a decal fades out on its own (0 = only when recycled). */
  constructor(private scene: Phaser.Scene, private cap: number, private depth: number, private life = 0) {}
  add(x: number, y: number, r: number): Decal {
    let d = this.items[this.head];
    if (!d) {
      d = { img: this.scene.add.image(0, 0, TX.px).setDepth(this.depth), on: true, fade: 0, x, y, r, a: 1 };
      this.items[this.head] = d;
    }
    d.on = true; d.fade = 0; d.x = x; d.y = y; d.r = r; d.a = 1; d.age = 0;
    d.img.setVisible(true).setAlpha(1).setPosition(x, y).clearTint();
    this.head = (this.head + 1) % this.cap;
    // fade the soon-to-be-recycled oldest decals out gracefully
    for (let k = 0; k < 8; k++) { const o = this.items[(this.head + k) % this.cap]; if (o && o.on && o.fade === 0) o.fade = 1.2 + k * 0.4; }
    return d;
  }
  update(v: View, dt: number, ageDt = dt) {
    for (const d of this.items) {
      if (!d || !d.on) continue;
      d.age = (d.age ?? 0) + ageDt;
      if (this.life > 0 && d.fade === 0 && d.age > this.life) d.fade = 3;   // slow 3 s fade (alpha ramps over the last 1.2 s)
      if (d.fade > 0) {
        d.fade -= dt;
        if (d.fade <= 0) { d.on = false; d.img.setVisible(false); continue; }
        if (d.fade < 1.2) d.img.setAlpha(d.a * (d.fade / 1.2));
      }
      const vis = inView(v, d.x, d.y, d.r + 20);
      if (d.img.visible !== vis) d.img.setVisible(vis);
    }
  }
  clear() { for (const d of this.items) if (d) { d.on = false; d.img.setVisible(false); } this.head = 0; }
  destroy() { for (const d of this.items) d?.img.destroy(); this.items.length = 0; }
}

const GIB = [0x5a0a0a, 0x7a1612, 0x40080a, 0x6a2a1e];
// insects: yellow-green ichor and bits of shell
const ICHOR = [0xb7e04a, 0x8fb52a, 0xd4ef89, 0x6f8f1f], CHITIN = [0x5a3a1c, 0x7a5226, 0x3a2410, 0x8fb52a];
const DEBRIS = [0x3a3632, 0x4e4842, 0x2a2622, 0x5a4a3a];

interface Dying { on: boolean; spr: Phaser.GameObjects.Image; t: number; frames: string[] | null; atlas: string; corpse: string | null; x: number; y: number; ang: number; sc: number; dur: number; collapse?: boolean }

export class Fx {
  private scene: Phaser.Scene;
  private art: Art;
  private parts: Particle[][] = [[], [], []];
  private free: number[][] = [[], [], []];
  lights: Light[] = [];
  private blood: DecalRing;
  private corpses: DecalRing;
  /** Set by the renderer each frame. */
  simRunning = true;
  private dying: Dying[] = [];
  private seed = 1;
  /** camera shake impulses requested by fx (read + cleared by the renderer) */
  shake = 0;
  /** world position of the player's muzzle (set by actors each frame), for flashes */
  muzzle = { x: 0, y: 0, ok: false };
  /** directional camera kick (world px, decays; read by the renderer) */
  kickX = 0; kickY = 0;
  /** camera post-processing (bloom, grade, vignette, hurt pulse) */
  readonly post: PostFx;
  /** floating damage numbers */
  readonly nums: DamageNumbers;
  /** last explosion (for gib bursts on kills it caused) */
  private boom = { x: 0, y: 0, r: 0, t: -1 };
  private clock = 0;

  constructor(scene: Phaser.Scene, art: Art) {
    this.scene = scene; this.art = art;
    const depth = [D.litFxLow, D.litFx, D.glow];
    for (const L of [Layer.Floor, Layer.Lit, Layer.Glow]) {
      for (let i = 0; i < CAP[L]; i++) {
        const img = scene.add.image(0, 0, TX.px).setDepth(depth[L]).setVisible(false);
        if (L === Layer.Glow) img.setBlendMode(Phaser.BlendModes.ADD);
        this.parts[L].push({ on: false, x: 0, y: 0, vx: 0, vy: 0, drag: 0, t: 0, life: 1, rot: 0, vr: 0, s0: 1, s1: 1, a0: 1, a1: 0, z: 0, vz: 0, hop: false, asp: 1, frames: null, atlas: '', loop: false, fps: 0, img, tint: 0xffffff });
        this.free[L].push(CAP[L] - 1 - i);
      }
    }
    for (let i = 0; i < 48; i++) this.lights.push({ x: 0, y: 0, r: 0, col: 0, i: 0, t: 0, life: 0, flick: 0 });
    this.blood = new DecalRing(scene, 220, D.decal, 180);
    this.corpses = new DecalRing(scene, 80, D.decal + 1, 90);   // bodies fade after ~90 s
    this.post = new PostFx(scene);
    this.nums = new DamageNumbers(scene);
  }
  private rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  private rr(a: number, b: number) { return a + (b - a) * this.rnd(); }

  clear() {
    for (const L of [0, 1, 2]) { this.free[L].length = 0; this.parts[L].forEach((p, i) => { p.on = false; p.img.setVisible(false); this.free[L].push(i); }); }
    for (const l of this.lights) l.life = 0;
    this.blood.clear(); this.corpses.clear();
    for (const d of this.dying) { d.on = false; d.spr.setVisible(false); }
    this.nums.clear(); this.post.clear();
    this.kickX = this.kickY = 0; this.boom.t = -1;
  }
  destroy() {
    this.nums.destroy(); this.post.destroy();
    for (const L of [0, 1, 2]) for (const p of this.parts[L]) p.img.destroy();
    this.blood.destroy(); this.corpses.destroy();
    for (const d of this.dying) d.spr.destroy();
  }

  // ---------------------------------------------------------------- spawning
  private spawn(L: Layer, seq: string | null, fallback: string, x: number, y: number, o: {
    vx?: number; vy?: number; drag?: number; life: number; rot?: number; vr?: number; s0?: number; s1?: number; a0?: number; a1?: number;
    tint?: number; loop?: boolean; fps?: number; origin?: [number, number]; frame?: number; z?: number; vz?: number; asp?: number;
  }) {
    const f = this.free[L].pop();
    if (f === undefined) return null;
    const p = this.parts[L][f];
    p.on = true; p.x = x; p.y = y; p.vx = o.vx || 0; p.vy = o.vy || 0; p.drag = o.drag ?? 0; p.t = 0; p.life = o.life;
    p.rot = o.rot || 0; p.vr = o.vr || 0; p.s0 = o.s0 ?? 1; p.s1 = o.s1 ?? p.s0; p.a0 = o.a0 ?? 1; p.a1 = o.a1 ?? 0;
    p.loop = !!o.loop; p.fps = o.fps || 0; p.tint = o.tint ?? 0xffffff; p.z = o.z || 0; p.vz = o.vz || 0; p.hop = p.vz !== 0 || p.z > 0; p.asp = o.asp ?? 1;
    const fr = seq ? this.art.seq(seq) : null;
    const img = p.img;
    if (fr) {
      p.frames = o.frame !== undefined ? [fr[o.frame % fr.length]] : fr;
      p.atlas = this.art.atlasOf(fr[0])!;
      img.setTexture(p.atlas, p.frames[0]);
      const meta = this.art.sprite(seq!);
      const org = o.origin || (meta && meta.origin) || [0.5, 0.5];
      img.setOrigin(org[0], org[1]);
    } else {
      p.frames = null; img.setTexture(fallback); img.setOrigin(o.origin ? o.origin[0] : 0.5, o.origin ? o.origin[1] : 0.5);
    }
    if (p.tint !== 0xffffff) img.setTint(p.tint); else img.clearTint();
    img.setVisible(true).setPosition(x, y - p.z).setRotation(p.rot).setScale(p.s0 * p.asp, p.s0).setAlpha(p.a0);
    return p;
  }
  light(x: number, y: number, r: number, col: number, i: number, life: number, flick = 0) {
    let best = this.lights[0];
    for (const l of this.lights) { if (l.life <= 0 || l.t >= l.life) { best = l; break; } if (l.life - l.t < best.life - best.t) best = l; }
    best.x = x; best.y = y; best.r = r; best.col = col; best.i = i; best.t = 0; best.life = life; best.flick = flick;
  }

  // ---------------------------------------------------------------- events
  onEvent(ev: SimEvent, state: GameState) {
    const s = this.art.scale;
    switch (ev.t) {
      case 'shot': {
        const player = ev.weapon !== 'turret';
        let x = ev.x, y = ev.y;
        if (player && this.muzzle.ok) { x = this.muzzle.x; y = this.muzzle.y; }
        const cls = ev.cls === 'shotgun' ? 'shotgun' : ev.cls === 'handgun' ? 'handgun' : 'long';
        const big = cls === 'shotgun' ? 1.25 : cls === 'long' ? 1.1 : 0.9;
        const ca = Math.cos(ev.angle), sa = Math.sin(ev.angle);
        this.spawn(Layer.Glow, 'muzzle_' + cls, TX.spark, x, y, { life: 0.065, rot: ev.angle, s0: s * big * this.rr(0.95, 1.2), s1: s * big * 1.15, a0: 1, a1: 0.6, origin: [0, 0.5], frame: Math.floor(this.rnd() * 3) });
        // hot core + warm halo (the bloom pass spreads these into a proper flash)
        this.spawn(Layer.Glow, null, TX.soft, x + ca * 6, y + sa * 6, { life: 0.05, s0: 0.09 * big, s1: 0.12 * big, a0: 0.9, a1: 0, tint: 0xfff4d8 });
        this.spawn(Layer.Glow, null, TX.soft, x + ca * 8, y + sa * 8, { life: 0.09, s0: 0.26 * big, s1: 0.36 * big, a0: 0.32, a1: 0, tint: 0xffa850 });
        this.light(x, y, 300 * big, 0xffc884, 1.0, 0.07);
        // smoke from the barrel: a quick forward jet + a lazy puff that lingers
        this.spawn(Layer.Lit, 'smoke', TX.puff, x + ca * 10, y + sa * 10, { vx: ca * 90, vy: sa * 90, drag: 4, life: 0.5, s0: s * 0.2, s1: s * 0.55, a0: 0.3, a1: 0, rot: this.rnd() * 6.28, vr: this.rr(-1, 1), frame: Math.floor(this.rnd() * 6) });
        this.spawn(Layer.Lit, 'smoke', TX.puff, x + ca * 4, y + sa * 4, { vx: ca * 20 + this.rr(-10, 10), vy: sa * 20 + this.rr(-10, 10), drag: 1.2, life: this.rr(0.9, 1.3), s0: s * 0.22 * big, s1: s * 0.8 * big, a0: 0.2, a1: 0, rot: this.rnd() * 6.28, vr: this.rr(-0.8, 0.8), frame: Math.floor(this.rnd() * 6) });
        if (player && ev.cls !== 'melee' && ev.cls !== 'unarmed') {
          // brass ejects to the right of the gun, hops and bounces, then lies on the floor a while
          const a = ev.angle + Math.PI / 2 + this.rr(-0.35, 0.25), sp = this.rr(90, 150);
          const shell = ev.cls === 'shotgun' ? 'shell_shotgun' : 'shell_casing';
          const px = state.player.x + ca * 8, py = state.player.y + sa * 8;
          const art = this.art.has('shell_casing_0');
          this.spawn(Layer.Floor, shell, TX.px, px, py, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 1.2, life: 7, rot: this.rnd() * 6.28, vr: this.rr(-30, 30), s0: shell === 'shell_casing' && art ? s : 1, a0: 1, a1: 1, tint: art ? 0xffffff : 0xc8a040, frame: Math.floor(this.rnd() * 2), z: 12, vz: this.rr(140, 230) });
          // recoil camera kick (opposite the shot)
          const kick = cls === 'shotgun' ? 5 : cls === 'long' ? 1.8 : 1.3;
          this.kickX -= ca * kick; this.kickY -= sa * kick;
        }
        if (ev.cls === 'shotgun') this.shake += 3;
        break;
      }
      case 'bulletHit': {
        const back = ev.angle + Math.PI;
        if (ev.sticky) {
          this.spawn(Layer.Lit, 'cola_splash', TX.drop, ev.x, ev.y, { life: 0.38, rot: ev.angle, s0: s * 0.55, s1: s * 0.95, a0: 0.95, a1: 0, tint: this.art.has('cola_splash_0') ? 0xffffff : 0xc2a477 });
          for (let i = 0; i < 3; i++) {
            const a = back + this.rr(-1.1, 1.1), speed = this.rr(35, 90);
            this.spawn(Layer.Lit, 'cola_foam', TX.drop, ev.x, ev.y, { life: 0.3, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, drag: 5, s0: s * 0.6, s1: s * 0.35, a0: 1, a1: 0, frame: i, tint: this.art.has('cola_foam_0') ? 0xffffff : 0xc2a477 });
          }
          break;
        }
        if (ev.acid) {
          // formic acid: a green hiss where the stream lands
          this.spawn(Layer.Lit, null, TX.puff, ev.x, ev.y, { life: 0.3, s0: 0.14, s1: 0.4, a0: 0.55, a1: 0, tint: 0xb7e04a, rot: this.rnd() * 6.28 });
          for (let i = 0; i < 2; i++) { const a = back + this.rr(-1.2, 1.2), speed = this.rr(40, 110); this.spawn(Layer.Lit, null, TX.drop, ev.x, ev.y, { life: 0.28, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, drag: 5, s0: this.rr(0.08, 0.14), s1: 0.05, a0: 1, a1: 0, tint: ICHOR[i] }); }
          break;
        }
        if (ev.surface === 'flesh' && ev.ichor) {
          for (let i = 0; i < 3; i++) { const a = back + this.rr(-0.8, 0.8), sp = this.rr(60, 150); this.spawn(Layer.Lit, null, TX.drop, ev.x, ev.y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 5, life: this.rr(0.2, 0.35), rot: this.rnd() * 6.28, s0: this.rr(0.09, 0.16), s1: 0.07, a0: 0.95, a1: 0.2, tint: ICHOR[i % ICHOR.length] }); }
          this.spawn(Layer.Lit, null, TX.puff, ev.x + Math.cos(ev.angle) * 8, ev.y + Math.sin(ev.angle) * 8, { vx: Math.cos(ev.angle) * 60, vy: Math.sin(ev.angle) * 60, drag: 5, life: 0.3, s0: 0.18, s1: 0.45, a0: 0.4, a1: 0, tint: 0x8fb52a });
          break;
        }
        if (ev.surface === 'flesh') {
          this.spawn(Layer.Lit, 'blood_spray', TX.drop, ev.x, ev.y, { life: 0.3, rot: ev.angle + this.rr(-0.2, 0.2), s0: s * 0.8, s1: s * 1.15, a0: 0.95, a1: 0, origin: [0.04, 0.5], tint: this.art.has('blood_spray_0') ? 0xffffff : 0x701010 });
          // exit mist + a small back-spatter toward the shooter
          this.spawn(Layer.Lit, null, TX.puff, ev.x + Math.cos(ev.angle) * 8, ev.y + Math.sin(ev.angle) * 8, { vx: Math.cos(ev.angle) * 60, vy: Math.sin(ev.angle) * 60, drag: 5, life: 0.35, s0: 0.2, s1: 0.55, a0: 0.45, a1: 0, tint: 0x8a1010 });
          for (let i = 0; i < 2; i++) {
            const a = back + this.rr(-0.7, 0.7), sp = this.rr(60, 140);
            this.spawn(Layer.Lit, 'blood_drop', TX.drop, ev.x, ev.y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 5, life: this.rr(0.2, 0.35), rot: this.rnd() * 6.28, s0: s * this.rr(0.35, 0.6), s1: s * 0.3, a0: 0.9, a1: 0.2, tint: this.art.has('blood_drop_0') ? 0xffffff : 0x6a0c0c, frame: i + 3 });
          }
          break;
        }
        this.spawn(Layer.Lit, 'impact_wall', TX.puff, ev.x, ev.y, { life: 0.22, rot: back, s0: s * 0.7, s1: s * 0.85, a0: 1, a1: 0.2 });
        // a flash at the impact point
        this.spawn(Layer.Glow, null, TX.soft, ev.x, ev.y, { life: 0.07, s0: 0.12, s1: 0.18, a0: ev.surface === 'metal' ? 1 : 0.6, a1: 0, tint: 0xffd8a0 });
        for (let i = 0; i < 4; i++) {
          const a = back + this.rr(-0.9, 0.9), sp = this.rr(60, 180);
          this.spawn(Layer.Lit, 'dust', TX.puff, ev.x, ev.y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 6, life: this.rr(0.3, 0.6), s0: s * 0.25, s1: s * 0.6, a0: 0.5, a1: 0, rot: this.rnd() * 6, frame: i });
        }
        const sparks = ev.surface === 'metal' ? 9 : ev.surface === 'wood' ? 1 : 3;
        for (let i = 0; i < sparks; i++) {
          const a = back + this.rr(-1.1, 1.1), sp = this.rr(220, 520);
          this.spawn(Layer.Glow, null, TX.spark, ev.x, ev.y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 6, life: this.rr(0.1, 0.26), rot: a, s0: this.rr(0.2, 0.32), s1: 0.08, a0: 1, a1: 0, tint: i & 1 ? 0xffe0a0 : 0xffa040 });
        }
        // chips: wood splinters (brown, long) / masonry grit (grey) — hop off the surface and settle
        const chips = ev.surface === 'wood' ? 5 : ev.surface === 'wall' ? 3 : 0;
        for (let i = 0; i < chips; i++) {
          const a = back + this.rr(-1, 1), sp = this.rr(70, 190);
          const wood = ev.surface === 'wood';
          this.spawn(Layer.Floor, null, TX.chunk, ev.x, ev.y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 1.5, life: this.rr(1.5, 3), rot: this.rnd() * 6.28, vr: this.rr(-18, 18), s0: wood ? this.rr(0.3, 0.45) : this.rr(0.2, 0.35), asp: wood ? 2.6 : 1, a0: 1, a1: 1, tint: wood ? (i & 1 ? 0x8a5a2e : 0xb07a44) : (i & 1 ? 0x6e6a64 : 0x8c867c), z: 6, vz: this.rr(80, 180) });
        }
        if (ev.surface === 'metal') this.light(ev.x, ev.y, 110, 0xffb060, 0.6, 0.06);
        break;
      }
      case 'hive': this.hiveFx(ev.kind, ev.x, ev.y); break;
      case 'blood': {
        const n = Math.min(12, 2 + Math.round(ev.amount * 1.4));
        if (ev.ichor) {
          // an insect: yellow-green ichor instead of blood
          for (let i = 0; i < n; i++) {
            const a = ev.angle + this.rr(-0.8, 0.8), sp = this.rr(50, 200);
            this.spawn(Layer.Lit, null, TX.drop, ev.x, ev.y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 6, life: this.rr(0.25, 0.55), rot: this.rnd() * 6.28, s0: this.rr(0.1, 0.2), s1: 0.08, a0: 0.95, a1: 0.2, tint: ICHOR[i % ICHOR.length] });
          }
          if (ev.amount >= 6 || this.rnd() < 0.2) this.bloodPool(ev.x + Math.cos(ev.angle) * 10, ev.y + Math.sin(ev.angle) * 10, 0.4 + Math.min(1, ev.amount * 0.1), ev.angle, true);
          break;
        }
        for (let i = 0; i < n; i++) {
          const a = ev.angle + this.rr(-0.8, 0.8), sp = this.rr(50, 200);
          this.spawn(Layer.Lit, 'blood_drop', TX.drop, ev.x, ev.y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 6, life: this.rr(0.25, 0.55), rot: this.rnd() * 6.28, s0: s * this.rr(0.6, 1.05), s1: s * 0.45, a0: 0.95, a1: 0.2, tint: this.art.has('blood_drop_0') ? 0xffffff : 0x6a0c0c, frame: i });
        }
        if (ev.amount >= 2 || this.rnd() < 0.35) this.bloodPool(ev.x + Math.cos(ev.angle) * 10, ev.y + Math.sin(ev.angle) * 10, 0.45 + Math.min(1.1, ev.amount * 0.12), ev.angle);
        break;
      }
      case 'zombieKilled': this.killed(ev.x, ev.y, ev.angle, ev.type, ev.variant, ev.boss, ev.radius, state, ev.conduit); break;
      case 'explosion': this.explosion(ev.x, ev.y, ev.radius || 120); break;
      case 'playerHurt': this.shake += 5 + Math.min(9, ev.amount * 0.35); this.post.onHurt(ev.amount); break;
      case 'structureDestroyed': {
        for (let i = 0; i < 8; i++) {
          const a = this.rnd() * 6.28, sp = this.rr(40, 160);
          this.spawn(Layer.Lit, 'dust', TX.puff, ev.x, ev.y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: this.rr(0.5, 1), s0: s * 0.5, s1: s * 1.2, a0: 0.6, a1: 0, frame: i });
        }
        break;
      }
      case 'swing': {
        // a faint dust swish in front
        const a = ev.angle;
        this.spawn(Layer.Lit, 'dust', TX.puff, ev.x + Math.cos(a) * 26, ev.y + Math.sin(a) * 26, { vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, drag: 4, life: 0.25, s0: s * 0.3, s1: s * 0.6, a0: 0.25, a1: 0, frame: 1 });
        break;
      }
    }
  }
  bloodPool(x: number, y: number, size: number, ang: number, ichor = false) {
    const d = this.blood.add(x, y, 40 * size);
    const fr = ichor ? null : this.art.seq(this.rnd() < 0.3 ? 'blood_smear' : 'blood_pool') || this.art.seq('blood_pool');
    if (ichor) d.img.setTexture(TX.drop).setOrigin(0.5, 0.5).setScale(size * 0.8).setTint(0x5f7a1a).setRotation(this.rnd() * 6.28);
    else if (fr) { const f = fr[Math.floor(this.rnd() * fr.length)]; d.img.setTexture(this.art.atlasOf(f)!, f).setOrigin(0.5, 0.5).setScale(this.art.scale * size).setRotation(ang + this.rr(-0.4, 0.4)); }
    else d.img.setTexture(TX.drop).setScale(size).setTint(0x4a0808).setRotation(this.rnd() * 6.28);
    d.a = 0.9; d.img.setAlpha(0.9);
  }
  private killed(x: number, y: number, ang: number, type: ZombieType, variant: number, boss?: BossId, radius?: number, state?: GameState, conduit = false) {
    const s = this.art.scale;
    const t = TYPES[type] || TYPES.walker;
    const design: Record<string, number> = { walker: 15, runner: 13, crawler: 13, brute: 24, bloater: 20 };
    const bossFrames = boss && this.art.has(`${bossPrefix(boss)}death_0`);
    const bug = !boss && isHiveType(type);
    const sc = bossFrames ? (radius || BOSSES[boss!].r) * 2.7 / bossFrameSize(boss!) : s * t.r / (bug ? hiveDesignR(this.art, type) : design[type] || 15);
    let d = this.dying.find((q) => !q.on);
    if (!d) {
      if (this.dying.length >= 40) { d = this.dying[0]; this.finishDying(d); }
      else { d = { on: false, spr: this.scene.add.image(0, 0, TX.px).setDepth(D.decal + 2), t: 0, frames: null, atlas: '', corpse: null, x, y, ang, sc, dur: 0.7 }; this.dying.push(d); }
    }
    const pre = bossFrames ? bossPrefix(boss!) : bug ? hivePrefix(type) : `zombie_${type}_${variant}_`;
    const fixture = type === 'burrow' || type === 'egg';
    if (fixture) ang = 0;
    d.on = true; d.t = 0; d.x = x; d.y = y; d.ang = ang; d.sc = sc;
    d.frames = this.art.seq(pre + 'death');
    d.corpse = bossFrames ? pre + 'death_2' : this.art.has(pre + 'corpse_0') ? pre + 'corpse_0' : null;
    d.collapse = false;
    if (fixture && state?.road?.world.hive) {
      const z = hiveMaterialZone(state.road.world.hive, x, y), live = conduit ? 'hive_queen_conduit_damaged' : hiveMaterial(z, type), rubble = conduit ? 'hive_queen_conduit_destroyed' : hiveMaterial(z, 'wall_1');
      if (this.art.has(live) && this.art.has(rubble)) {
        const b = this.art.manifest.hiveEnvironment.frames[live].bounds;
        d.sc = (radius || t.r) * 3 / Math.max(b.w, b.h);
        d.frames = [live, live, rubble, rubble]; d.corpse = rubble; d.collapse = true;
      }
    }
    d.dur = d.frames ? d.frames.length / (bossFrames ? 6 : bug ? 10 : 12) : 0.4;
    if (d.frames) { d.atlas = this.art.atlasOf(d.frames[0])!; d.spr.setTexture(d.atlas, d.frames[0]).setScale(d.sc).clearTint(); }
    else d.spr.setTexture(TX.ring).setScale(t.r / 52).setTint(0x5a6a48);
    d.spr.setVisible(true).setPosition(x, y).setRotation(ang).setAlpha(1);
    if (fixture) return;   // a burrow caves in and an egg cluster bursts: their own effect ('hive' events), no gore
    const ichor = bug || !!bossFrames && bossPrefix(boss!).startsWith('hive_');
    this.bloodPool(x, y, 0.8 + t.r / 30, ang, ichor);
    // gore burst: a fan of droplets plus a few chunky gibs that hop and settle (many more when blown up)
    const b = this.boom;
    const blast = b.t >= 0 && this.clock - b.t < 0.25 && Math.hypot(x - b.x, y - b.y) < b.r * 1.7;
    const big = type === 'brute' || type === 'bloater';
    const blood = this.art.has('blood_drop_0') && !ichor;
    const drops = blast ? 12 : big ? 9 : 6;
    for (let i = 0; i < drops; i++) {
      const a = ang + this.rr(-1.1, 1.1), sp = this.rr(80, blast ? 320 : 240);
      this.spawn(Layer.Lit, ichor ? null : 'blood_drop', TX.drop, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 5, life: this.rr(0.3, 0.6), rot: this.rnd() * 6.28, s0: (ichor ? 0.18 : s) * this.rr(0.7, 1.2), s1: (ichor ? 0.18 : s) * 0.5, a0: 0.95, a1: 0.3, tint: ichor ? ICHOR[i % ICHOR.length] : blood ? 0xffffff : 0x6a0c0c, frame: i });
    }
    if (!ichor) this.spawn(Layer.Lit, 'blood_spray', TX.drop, x, y, { life: 0.34, rot: ang, s0: s * 1.1, s1: s * 1.6, a0: 0.95, a1: 0, origin: [0.04, 0.5], tint: this.art.has('blood_spray_0') ? 0xffffff : 0x701010 });
    const gibs = blast ? 9 : big ? 5 : 3;
    const away = blast ? Math.atan2(y - b.y, x - b.x) : ang;
    for (let i = 0; i < gibs; i++) {
      const a = away + this.rr(blast ? -1.4 : -0.9, blast ? 1.4 : 0.9), sp = this.rr(70, blast ? 360 : 220);
      this.spawn(Layer.Floor, null, TX.chunk, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 1.2, life: this.rr(5, 8), rot: this.rnd() * 6.28, vr: this.rr(-20, 20), s0: this.rr(0.75, 1.2) * (blast ? 1.2 : 1), asp: this.rr(0.8, 1.4), a0: 1, a1: 1, tint: ichor ? CHITIN[i % CHITIN.length] : GIB[i % GIB.length], z: 8, vz: this.rr(140, blast ? 380 : 280) });
    }
    if (blast) this.bloodPool(x + Math.cos(away) * 26, y + Math.sin(away) * 26, 0.9, away, ichor);
    this.shake += blast ? 2 : big ? 4 : 1.2;
  }

  /** The Hive Below: honey, burrows and eggs have their own bursts (no fire). */
  private hiveFx(kind: 'honey' | 'erupt' | 'collapse' | 'hatch' | 'rally', x: number, y: number) {
    const s = this.art.scale;
    const spray = (n: number, tints: number[], speed: [number, number], size: [number, number], life: [number, number], layer = Layer.Lit) => {
      for (let i = 0; i < n; i++) {
        const a = this.rnd() * 6.28, sp = this.rr(speed[0], speed[1]);
        this.spawn(layer, null, TX.drop, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 4.5, life: this.rr(life[0], life[1]), rot: this.rnd() * 6.28, s0: this.rr(size[0], size[1]), s1: size[0] * 0.5, a0: 1, a1: 0.1, tint: tints[i % tints.length] });
      }
    };
    const dust = (n: number, r: number, tint: number, a0 = 0.5) => {
      for (let i = 0; i < n; i++) { const a = this.rnd() * 6.28, d = this.rnd() * r; this.spawn(Layer.Lit, 'dust', TX.puff, x + Math.cos(a) * d, y + Math.sin(a) * d, { vx: Math.cos(a) * this.rr(20, 90), vy: Math.sin(a) * this.rr(20, 90) - 12, drag: 2.5, life: this.rr(0.6, 1.3), rot: this.rnd() * 6.28, s0: s * 0.5, s1: s * 1.5, a0, a1: 0, tint }); }
    };
    if (kind === 'honey') {
      spray(16, [0xe8a020, 0xffd870, 0xb06a10], [80, 300], [0.12, 0.26], [0.3, 0.7]);
      this.spawn(Layer.Lit, null, TX.shock, x, y, { life: 0.35, s0: 0.2, s1: 1.1, a0: 0.6, a1: 0, tint: 0xffc850 });
      this.light(x, y, 220, 0xffb840, 0.7, 0.4);
      this.shake += 2.5;
    } else if (kind === 'erupt') {
      dust(7, 26, 0x8a6a40, 0.55);
      spray(10, [0x5a4028, 0x8a6a40, 0x2c1c10], [60, 220], [0.08, 0.16], [0.35, 0.8]);
      this.light(x, y, 200, 0xb48cff, 0.5, 0.5);
    } else if (kind === 'collapse') {
      dust(18, 40, 0x9a8a70, 0.7);
      spray(14, [0x5a4028, 0x8a6a40, 0x2c1c10], [80, 320], [0.1, 0.2], [0.4, 0.9]);
      for (let i = 0; i < 9; i++) { const a = this.rnd() * 6.28, sp = this.rr(70, 240); this.spawn(Layer.Floor, null, TX.chunk, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 1.3, life: this.rr(4, 7), rot: this.rnd() * 6.28, vr: this.rr(-16, 16), s0: this.rr(0.7, 1.3), asp: this.rr(0.8, 1.4), a0: 1, a1: 1, tint: CHITIN[i % 3], z: 6, vz: this.rr(140, 300) }); }
      this.spawn(Layer.Lit, null, TX.shock, x, y, { life: 0.6, s0: 0.3, s1: 1.5, a0: 0.45, a1: 0, tint: 0x9a8e7e });
      this.shake += 7;
    } else if (kind === 'hatch') {
      spray(14, ICHOR, [60, 240], [0.1, 0.2], [0.3, 0.6]);
      this.bloodPool(x, y, 1.1, 0, true);
    } else {
      // the Marshal's pheromone burst
      this.spawn(Layer.Glow, null, TX.shock, x, y, { life: 0.7, s0: 0.3, s1: 3.2, a0: 0.5, a1: 0, tint: 0xf0a93a });
      this.light(x, y, 420, 0xf0a93a, 0.6, 0.6);
    }
  }

  private explosion(x: number, y: number, R: number) {
    const s = this.art.scale;
    const b = this.boom; b.x = x; b.y = y; b.r = R; b.t = this.clock;
    // white-hot core, fireball, then a fast shockwave ring and a slower dust ring
    this.spawn(Layer.Glow, null, TX.soft, x, y, { life: 0.14, s0: R / 220, s1: R / 120, a0: 0.9, a1: 0, tint: 0xfff4dc });
    this.spawn(Layer.Glow, 'explosion', TX.soft, x, y, { life: 0.7, s0: s * R / 66, s1: s * R / 56, a0: 1, a1: 0.7, rot: this.rnd() * 6.28, tint: this.art.has('explosion_0') ? 0xffffff : 0xff8a30 });
    this.spawn(Layer.Glow, null, TX.shock, x, y, { life: 0.36, s0: (R * 0.4) / 128, s1: (R * 2.6) / 128, a0: 0.9, a1: 0, tint: 0xffd2a0 });
    this.spawn(Layer.Lit, null, TX.shock, x, y, { life: 0.7, s0: (R * 0.5) / 128, s1: (R * 3.2) / 128, a0: 0.5, a1: 0, tint: 0x9a8e7e });
    for (let i = 0; i < 26; i++) {
      const a = this.rnd() * 6.28, sp = this.rr(240, 720);
      this.spawn(Layer.Glow, null, TX.spark, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3.5, life: this.rr(0.2, 0.6), rot: a, s0: this.rr(0.3, 0.5), s1: 0.1, a0: 1, a1: 0, tint: i & 1 ? 0xffd080 : 0xff9a40 });
    }
    // embers: slow glowing motes that drift and wink out
    for (let i = 0; i < 16; i++) {
      const a = this.rnd() * 6.28, sp = this.rr(40, 200);
      this.spawn(Layer.Glow, null, TX.soft, x + Math.cos(a) * R * 0.3, y + Math.sin(a) * R * 0.3, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, drag: 1.6, life: this.rr(0.8, 2), s0: this.rr(0.05, 0.09), s1: 0.02, a0: 1, a1: 0, tint: i & 1 ? 0xff8a30 : 0xffc060 });
    }
    // debris: dark chunks thrown out that bounce and settle around the crater
    for (let i = 0; i < 12; i++) {
      const a = this.rnd() * 6.28, sp = this.rr(120, 360);
      this.spawn(Layer.Floor, null, TX.chunk, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 1, life: this.rr(4, 7), rot: this.rnd() * 6.28, vr: this.rr(-22, 22), s0: this.rr(0.6, 1.1), asp: this.rr(0.8, 1.5), a0: 1, a1: 1, tint: DEBRIS[i % DEBRIS.length], z: 10, vz: this.rr(200, 420) });
    }
    for (let i = 0; i < 8; i++) {
      const a = this.rnd() * 6.28, sp = this.rr(20, 90);
      this.spawn(Layer.Lit, 'smoke', TX.puff, x + Math.cos(a) * 20, y + Math.sin(a) * 20, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 1, life: this.rr(1.8, 3), rot: this.rnd() * 6, vr: this.rr(-0.6, 0.6), s0: s * R / 150, s1: s * R / 62, a0: 0.6, a1: 0, tint: 0x8a847c, frame: i });
    }
    const sc = this.blood.add(x, y, R * 0.7);
    const fr = this.art.seq('scorch');
    if (fr) { const f = fr[Math.floor(this.rnd() * fr.length)]; sc.img.setTexture(this.art.atlasOf(f)!, f).setScale(s * R / 85).setRotation(this.rnd() * 6.28); }
    else sc.img.setTexture(TX.blob).setScale(R / 85).setTint(0x000000);
    sc.a = 0.9; sc.img.setAlpha(0.9);
    this.light(x, y, R * 3.4, 0xffa050, 1.5, 0.6, 0.3);
    this.light(x, y, R * 1.6, 0xfff0d0, 0.8, 0.12);
    this.shake += 16;
  }

  /** True shortly after an explosion near (x, y) (damage numbers / gore use it). */
  nearBlast(x: number, y: number) { const b = this.boom; return b.t >= 0 && this.clock - b.t < 0.3 && Math.hypot(x - b.x, y - b.y) < b.r * 1.7; }

  /** Dust motes drifting in the flashlight beam (night / dark interiors). k = 0..1 visibility. */
  motes(x: number, y: number, aim: number, k: number, dt: number) {
    if (k <= 0.05 || this.rnd() > dt * 9) return;
    const a = aim + this.rr(-0.32, 0.32), d = this.rr(50, 380);
    const life = this.rr(1.4, 2.6);
    this.spawn(Layer.Glow, null, TX.soft, x + Math.cos(a) * d, y + Math.sin(a) * d, { vx: this.rr(-9, 9), vy: this.rr(-9, 9), drag: 0.2, life, s0: this.rr(0.012, 0.022), s1: 0.008, a0: 0.55 * k * (1 - d / 520), a1: 0, tint: 0xffe8c8 });
  }

  /** Per-frame embers + smoke for a burning zombie at (x, y) (called by actors). */
  burnFx(x: number, y: number, r: number, dt: number) {
    if (this.rnd() < dt * 14) {
      const a = this.rnd() * 6.28, d = this.rnd() * r * 0.7;
      this.spawn(Layer.Glow, null, TX.soft, x + Math.cos(a) * d, y + Math.sin(a) * d, { vx: this.rr(-30, 30), vy: this.rr(-70, -25), drag: 1.2, life: this.rr(0.45, 0.9), s0: this.rr(0.045, 0.075), s1: 0.015, a0: 1, a1: 0, tint: this.rnd() < 0.5 ? 0xff8a30 : 0xffcc66 });
    }
    if (this.rnd() < dt * 4) {
      this.spawn(Layer.Lit, 'smoke', TX.puff, x + this.rr(-6, 6), y + this.rr(-6, 6), { vx: this.rr(-12, 12), vy: this.rr(-40, -15), drag: 0.8, life: this.rr(0.9, 1.4), rot: this.rnd() * 6.28, vr: this.rr(-0.8, 0.8), s0: this.art.scale * 0.25, s1: this.art.scale * 0.75, a0: 0.3, a1: 0, tint: 0x55504a, frame: Math.floor(this.rnd() * 6) });
    }
  }
  private finishDying(d: Dying) {
    d.on = false; d.spr.setVisible(false);
    const c = this.corpses.add(d.x, d.y, 40);
    if (d.corpse) c.img.setTexture(this.art.atlasOf(d.corpse)!, d.corpse).setScale(d.sc).setRotation(d.ang);
    else if (d.frames) c.img.setTexture(d.atlas, d.frames[d.frames.length - 1]).setScale(d.sc).setRotation(d.ang);
    else c.img.setTexture(TX.ring).setScale(d.spr.scaleX).setRotation(d.ang).setTint(0x3a4030);
    c.a = 1;
    if (d.collapse) { c.img.setScale(d.sc * .7).setTint(0x68605a); c.a = .8; }
  }

  // ---------------------------------------------------------------- per frame
  update(v: View, dt: number) {
    const post = this.post;
    for (let L = 0; L < 3; L++) {
      const arr = this.parts[L];
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (!p.on) continue;
        p.t += dt;
        if (p.t >= p.life) { p.on = false; p.img.setVisible(false); this.free[L].push(i); continue; }
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vy *= k;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.vr) { p.vr *= k; p.rot += p.vr * dt; }
        if (p.hop) {
          // fake 3D hop: gravity on z, damped bounces, then floor friction
          if (p.vz !== 0 || p.z > 0) {
            p.vz -= GRAV * dt; p.z += p.vz * dt;
            if (p.z <= 0) {
              p.z = 0;
              if (p.vz < -90) { p.vz = -p.vz * 0.36; p.vx *= 0.6; p.vy *= 0.6; p.vr *= 0.55; }
              else { p.vz = 0; p.vr *= 0.25; }
            }
          } else { const f = Math.exp(-9 * dt); p.vx *= f; p.vy *= f; p.vr *= f; }
        }
        const u = p.t / p.life;
        const img = p.img;
        if (!inView(v, p.x, p.y, 120)) { if (img.visible) img.setVisible(false); continue; }
        if (!img.visible) img.setVisible(true);
        const sc = p.s0 + (p.s1 - p.s0) * u;
        const sz = p.z > 0 ? sc * (1 + p.z / 140) : sc;
        img.setPosition(p.x, p.y - p.z).setRotation(p.rot).setScale(sz * p.asp, sz);
        // floor debris stays opaque, fades in the last second
        const a = L === Layer.Floor ? (p.life - p.t < 1 ? (p.life - p.t) : 1) * p.a0 : p.a0 + (p.a1 - p.a0) * u;
        img.setAlpha(a);
        if (L === Layer.Glow) {
          // bloom halo around every emissive particle (centre of the sprite, not its origin)
          const dw = img.displayWidth, dh = img.displayHeight, off = dw * (0.5 - img.originX);
          post.glow(p.x + Math.cos(p.rot) * off, p.y - p.z + Math.sin(p.rot) * off, Math.max(dw, dh) * 0.75 + 4, p.tint === 0xffffff ? 0xffb870 : p.tint, a * 0.42);
        }
        if (p.frames && p.frames.length > 1) {
          const n = p.frames.length;
          const fi = p.loop ? Math.floor(p.t * p.fps) % n : Math.min(n - 1, Math.floor(u * n));
          const f = p.frames[fi];
          if (img.frame.name !== f) img.setFrame(f);
        }
      }
    }
    for (const l of this.lights) {
      if (l.life <= 0 || l.t >= l.life) continue;
      // short-lived lights (muzzle, impacts, blasts) also bloom
      const u = l.t / l.life;
      post.glow(l.x, l.y, l.r * 0.3, l.col, l.i * (1 - u) * (1 - u) * 0.3);
      l.t += dt;
    }
    for (const d of this.dying) {
      if (!d.on) continue;
      d.t += dt;
      if (d.t >= d.dur) { this.finishDying(d); continue; }
      if (d.frames) {
        const f = d.frames[Math.min(d.frames.length - 1, Math.floor((d.t / d.dur) * d.frames.length))];
        if (d.spr.frame.name !== f) d.spr.setFrame(f);
      } else d.spr.setScale(d.spr.scaleX * (1 - dt * 0.3));
      if (d.collapse) d.spr.setScale(d.sc * (1 - .3 * d.t / d.dur)).setTint(0x9a8b79);
    }
    // decal lifetimes only advance while the game is running (not in menus)
    const ageDt = this.simRunning ? dt : 0;
    this.blood.update(v, dt, ageDt);
    this.corpses.update(v, dt, ageDt);
    this.clock += dt;
    const kk = Math.exp(-14 * dt); this.kickX *= kk; this.kickY *= kk;
    this.nums.update(v, dt);
    this.post.update(v, dt, this.simRunning);
  }
}
