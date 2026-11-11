// gadgets.ts — draws arcade upgrade state (sim/upgrades.ts): saw blades, drones, molotov bottles + fire pools,
// grenades/bomblets, chain lightning and XP shards. Textures are generated here on a canvas; glow layers use ADD.
import * as Phaser from 'phaser';
import type { ArcadeRun, GameState, SimEvent, Vec } from '../sim/types';
import { sawLayout } from '../sim/upgrades';
import { D, Pool, TAU, hash2, inView, type View } from './common';

const K = {
  saw: 'gx_saw', sawEvo: 'gx_saw_evo', drone: 'gx_drone', droneEvo: 'gx_drone_evo', glow: 'gx_glow',
  shard: 'gx_shard', bottle: 'gx_bottle', grenade: 'gx_grenade', bomblet: 'gx_bomblet', flame: 'gx_flame',
};
const BODY = D.player + 7;   // above the player sprite parts (40..46), below built structures

function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  if (!t) return;
  draw(t.getContext()); t.refresh();
}
function makeTextures(scene: Phaser.Scene) {
  const blade = (hot: boolean) => (g: CanvasRenderingContext2D) => {
    const c = 32, teeth = 14;
    g.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * TAU, r = i % 2 ? 23 : 31, a2 = a + (i % 2 ? 0 : 0.12);
      g.lineTo(c + Math.cos(a2) * r, c + Math.sin(a2) * r);
    }
    g.closePath();
    const grad = g.createRadialGradient(c - 6, c - 6, 2, c, c, 31);
    if (hot) { grad.addColorStop(0, '#fffbe0'); grad.addColorStop(0.45, '#ffb43a'); grad.addColorStop(0.8, '#ff4a12'); grad.addColorStop(1, '#8a1205'); }
    else { grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.5, '#c9d0da'); grad.addColorStop(1, '#6c7480'); }
    g.fillStyle = grad; g.fill();
    g.lineWidth = 1.5; g.strokeStyle = hot ? '#5a0a02' : '#2a2e34'; g.stroke();
    g.beginPath(); g.arc(c, c, 17, 0, TAU); g.strokeStyle = hot ? 'rgba(255,240,180,0.6)' : 'rgba(40,44,50,0.45)'; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.arc(c, c, 7, 0, TAU); g.fillStyle = hot ? '#3a0a04' : '#2b2f36'; g.fill();
    g.fillStyle = hot ? '#ffd27a' : '#9aa3ae';
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; g.beginPath(); g.arc(c + Math.cos(a) * 12, c + Math.sin(a) * 12, 2.2, 0, TAU); g.fill(); }
    g.beginPath(); g.arc(c, c, 26, -2.4, -1.2); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.stroke();
  };
  tex(scene, K.saw, 64, 64, blade(false));
  tex(scene, K.sawEvo, 64, 64, blade(true));
  const drone = (accent: string) => (g: CanvasRenderingContext2D) => {
    const c = 24;
    g.strokeStyle = '#1c1f24'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(9, 9); g.lineTo(39, 39); g.moveTo(39, 9); g.lineTo(9, 39); g.stroke();
    for (const [x, y] of [[9, 9], [39, 9], [9, 39], [39, 39]]) {
      const rg = g.createRadialGradient(x, y, 1, x, y, 8.5);
      rg.addColorStop(0, 'rgba(220,230,240,0.85)'); rg.addColorStop(0.6, 'rgba(160,170,180,0.35)'); rg.addColorStop(1, 'rgba(160,170,180,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, 8.5, 0, TAU); g.fill();
      g.fillStyle = '#2a2e35'; g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill();
    }
    g.fillStyle = '#39404a'; g.strokeStyle = '#111'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(c - 8, c - 7, 16, 14, 4); g.fill(); g.stroke();
    g.fillStyle = accent; g.fillRect(c - 6, c - 1.5, 12, 3);
    g.fillStyle = '#e8f6ff'; g.beginPath(); g.arc(c + 7, c, 2.4, 0, TAU); g.fill();   // camera/gun at +x
  };
  tex(scene, K.drone, 48, 48, drone('#5ff0ff'));
  tex(scene, K.droneEvo, 48, 48, drone('#ff6cf0'));
  tex(scene, K.glow, 64, 64, (g) => {
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,255,255,0.55)'); rg.addColorStop(0.6, 'rgba(255,255,255,0.14)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  });
  tex(scene, K.flame, 32, 48, (g) => {
    // teardrop flame, white core (tinted per pool)
    const rg = g.createRadialGradient(16, 32, 1, 16, 30, 18);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.5, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.beginPath(); g.moveTo(16, 2); g.bezierCurveTo(26, 18, 30, 30, 16, 46); g.bezierCurveTo(2, 30, 6, 18, 16, 2); g.fill();
  });
  tex(scene, K.shard, 20, 24, (g) => {
    g.beginPath(); g.moveTo(10, 1); g.lineTo(18, 12); g.lineTo(10, 23); g.lineTo(2, 12); g.closePath();
    const lg = g.createLinearGradient(2, 1, 18, 23); lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.5, '#d8d8d8'); lg.addColorStop(1, '#8a8a8a');
    g.fillStyle = lg; g.fill(); g.strokeStyle = 'rgba(20,20,20,0.7)'; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.moveTo(10, 1); g.lineTo(10, 23); g.moveTo(2, 12); g.lineTo(18, 12); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 0.8; g.stroke();
  });
  tex(scene, K.bottle, 26, 12, (g) => {
    g.fillStyle = '#3d6b2a'; g.strokeStyle = '#13240c'; g.lineWidth = 1;
    g.beginPath(); g.roundRect(1, 1.5, 15, 9, 3); g.fill(); g.stroke();
    g.fillRect(15, 4, 5, 4); g.strokeRect(15, 4, 5, 4);
    g.fillStyle = 'rgba(200,255,170,0.45)'; g.fillRect(3, 3, 10, 2);
    g.fillStyle = '#e9dcc0'; g.beginPath(); g.moveTo(20, 3.5); g.lineTo(25, 1.5); g.lineTo(24, 6); g.lineTo(25, 10.5); g.lineTo(20, 8.5); g.fill();
  });
  tex(scene, K.grenade, 18, 18, (g) => {
    g.fillStyle = '#4f5a2a'; g.strokeStyle = '#161a0a'; g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(9, 10, 6.5, 7, 0, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.moveTo(3, 10); g.lineTo(15, 10); g.moveTo(9, 3.5); g.lineTo(9, 16.5); g.stroke();
    g.fillStyle = '#8b8f86'; g.fillRect(6.5, 1, 5, 3.5); g.fillRect(11, 1.5, 6, 1.6);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(6.5, 7.5, 2, 0, TAU); g.fill();
  });
  tex(scene, K.bomblet, 12, 12, (g) => {
    g.fillStyle = '#2a2a2a'; g.strokeStyle = '#000'; g.beginPath(); g.arc(6, 6, 4.5, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#ff3a2a'; g.beginPath(); g.arc(6, 6, 1.8, 0, TAU); g.fill();
  });
}

interface Zap { segs: Vec[][]; src: Vec[]; life: number; max: number; strike: boolean; evolved: boolean; jit: number }

function img(scene: Phaser.Scene, key: string, depth: number, add = false) {
  const o = scene.add.image(0, 0, key).setDepth(depth).setVisible(false);
  if (add) o.setBlendMode(Phaser.BlendModes.ADD);
  return o;
}

export class Gadgets {
  private scene: Phaser.Scene;
  private ground: Phaser.GameObjects.Graphics;   // scorch under pools, drop shadows
  private glowG: Phaser.GameObjects.Graphics;    // lightning, orbit trails (ADD)
  private bodies: Pool<Phaser.GameObjects.Image>;
  private glows: Pool<Phaser.GameObjects.Image>;
  private flames: Pool<Phaser.GameObjects.Image>;
  private zaps: Zap[] = [];
  private flashes: { x: number; y: number; life: number; max: number; r: number; color: number }[] = [];
  private t = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    makeTextures(scene);
    this.ground = scene.add.graphics().setDepth(D.decal + 2);
    this.glowG = scene.add.graphics().setDepth(D.glow).setBlendMode(Phaser.BlendModes.ADD);
    this.bodies = new Pool(() => img(scene, K.saw, BODY));
    this.glows = new Pool(() => img(scene, K.glow, D.glow, true));
    this.flames = new Pool(() => img(scene, K.flame, D.glow, true));
  }

  clear() {
    this.zaps.length = 0; this.flashes.length = 0;
    this.ground.clear(); this.glowG.clear();
    for (const p of [this.bodies, this.glows, this.flames]) { p.begin(); p.end(); }
  }

  onEvent(ev: SimEvent) {
    if (ev.t !== 'zap' || ev.points.length < 2) return;
    const strike = !!ev.strike, max = strike ? 0.32 : 0.22;
    const z: Zap = { segs: [], src: ev.points.map((p) => ({ x: p.x, y: p.y })), life: max, max, strike, evolved: !!ev.evolved, jit: 0 };
    this.jag(z);
    this.zaps.push(z);
    const last = ev.points[ev.points.length - 1];
    if (strike) this.flashes.push({ x: last.x, y: last.y, life: 0.35, max: 0.35, r: 120, color: 0xbfd4ff });
    else for (let i = 1; i < ev.points.length; i++) this.flashes.push({ x: ev.points[i].x, y: ev.points[i].y, life: 0.18, max: 0.18, r: 46, color: 0x9fc0ff });
    if (this.zaps.length > 40) this.zaps.shift();
    if (this.flashes.length > 80) this.flashes.splice(0, this.flashes.length - 80);
  }
  /** Rebuild the jagged polyline (re-run every few frames so the bolt crackles). */
  private jag(z: Zap) {
    z.segs = [];
    const main: Vec[] = [];
    for (let i = 0; i < z.src.length - 1; i++) {
      const a = z.src[i], b = z.src[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(3, Math.round(len / (z.strike ? 34 : 18)));
      const nx = -(b.y - a.y) / (len || 1), ny = (b.x - a.x) / (len || 1), amp = Math.min(z.strike ? 26 : 14, len * 0.12);
      for (let k = 0; k <= n; k++) {
        if (i > 0 && k === 0) continue;
        const f = k / n, o = k === 0 || k === n ? 0 : (Math.random() * 2 - 1) * amp;
        main.push({ x: a.x + (b.x - a.x) * f + nx * o, y: a.y + (b.y - a.y) * f + ny * o });
      }
    }
    z.segs.push(main);
    // a couple of short forks
    for (let f = 0; f < (z.strike ? 4 : 2); f++) {
      const i = 1 + Math.floor(Math.random() * Math.max(1, main.length - 2)), s = main[i];
      if (!s) continue;
      const fork: Vec[] = [s]; let x = s.x, y = s.y, ang = Math.random() * TAU;
      for (let k = 0; k < 3; k++) { ang += (Math.random() - 0.5) * 1.2; x += Math.cos(ang) * 12; y += Math.sin(ang) * 12; fork.push({ x, y }); }
      z.segs.push(fork);
    }
  }

  draw(state: GameState, alpha: number, dt: number, v: View) {
    this.t += dt;
    const g = this.ground, gg = this.glowG;
    g.clear(); gg.clear();
    this.bodies.begin(); this.glows.begin(); this.flames.begin();
    const run = state.mode === 'arcade' ? state.arcade?.run : undefined;
    if (run && state.player) this.drawRun(state, run, alpha, v);
    this.drawZaps(dt);
    this.bodies.end(); this.glows.end(); this.flames.end();
  }

  private glow(x: number, y: number, size: number, color: number, a: number) {
    this.glows.get().setPosition(x, y).setScale(size / 64).setTint(color).setAlpha(a);
  }
  private body(key: string, x: number, y: number, scale: number, rot: number, a = 1) {
    const o = this.bodies.get();
    if (o.texture.key !== key) o.setTexture(key);
    o.setPosition(x, y).setScale(scale).setRotation(rot).setAlpha(a);
    return o;
  }

  private drawRun(state: GameState, run: ArcadeRun, alpha: number, v: View) {
    const p = state.player, g = this.ground, gg = this.glowG, t = this.t;
    const px = p.prevX + (p.x - p.prevX) * alpha, py = p.prevY + (p.y - p.prevY) * alpha;

    // ---- fire pools: scorched ground + layered flickering flames
    for (const f of run.pools) {
      if (!inView(v, f.x, f.y, f.r + 40)) continue;
      const fade = Math.min(1, f.life / 0.6), grow = f.r;
      g.fillStyle(0x140a04, 0.32 * fade).fillCircle(f.x, f.y, grow * 1.05);
      g.fillStyle(0x2a1006, 0.28 * fade).fillCircle(f.x, f.y, grow * 0.75);
      this.glow(f.x, f.y, grow * 3.0, f.evolved ? 0xff7a1a : 0xff5a14, 0.38 * fade);
      this.glow(f.x, f.y, grow * 1.5, f.evolved ? 0xffd25a : 0xff9a2a, 0.45 * fade);
      const n = Math.max(4, Math.min(16, Math.round(grow / (f.evolved ? 8 : 10))));
      for (let i = 0; i < n; i++) {
        const h = hash2(f.id, i, 7), a = (h % 6283) / 1000, d = ((h >>> 13) % 1000) / 1000;
        const rr = Math.sqrt(d) * grow * 0.85, fl = 0.75 + 0.35 * Math.sin(t * (9 + (h % 7)) + i * 1.7);
        const x = f.x + Math.cos(a) * rr, y = f.y + Math.sin(a) * rr * 0.85;
        const s = (0.55 + ((h >>> 7) % 100) / 160) * fl * (f.evolved ? 1.25 : 1) * fade;
        const fo = this.flames.get().setPosition(x, y - 10 * s).setScale(s * 0.9, s * 1.15).setAlpha(0.85 * fade);
        fo.setTint(i % 3 === 0 ? 0xffe08a : i % 3 === 1 ? 0xff8a2a : 0xff4a12);
      }
    }

    // ---- XP shards
    for (const s of run.shards) {
      const x = s.prevX + (s.x - s.prevX) * alpha, y = s.prevY + (s.y - s.prevY) * alpha;
      if (!inView(v, x, y, 30)) continue;
      const color = s.value >= 6 ? 0xffc94a : s.value >= 4 ? 0xd07bff : s.value >= 2 ? 0x5ab8ff : 0x5dffb0;
      const bob = s.pull ? 0 : Math.sin(t * 4 + s.id) * 2.5, sc = 0.8 + Math.min(0.6, s.value * 0.08);
      this.glow(x, y + bob, 44 + s.value * 4, color, 0.7);
      this.body(K.shard, x, y + bob, sc, s.pull ? Math.atan2(s.vy, s.vx) + Math.PI / 2 : Math.sin(t * 2 + s.id) * 0.3).setTint(color);
    }

    // ---- gadgets
    for (const gd of run.gadgets) {
      const ang = gd.prevAngle + (gd.angle - gd.prevAngle) * alpha;
      if (gd.id === 'saw') {
        const L = sawLayout(run, gd), hot = gd.evolved;
        gg.lineStyle(L.blade * 1.1, hot ? 0xff5a14 : 0xb8c4d8, hot ? 0.16 : 0.07).strokeCircle(px, py, L.radius);
        for (let i = 0; i < L.count; i++) {
          const a = ang + i * TAU / L.count, x = px + Math.cos(a) * L.radius, y = py + Math.sin(a) * L.radius;
          // motion streak behind each blade
          gg.lineStyle(L.blade * 0.9, hot ? 0xff8a2a : 0xe0e8ff, hot ? 0.35 : 0.16);
          gg.beginPath(); gg.arc(px, py, L.radius, a - 0.45, a, false); gg.strokePath();
          g.fillStyle(0x000000, 0.22).fillEllipse(x + 4, y + 6, L.blade * 1.9, L.blade * 1.4);
          this.body(hot ? K.sawEvo : K.saw, x, y, (L.blade * 2.9) / 64, t * (hot ? 28 : 20) + i).clearTint();
          if (hot) this.glow(x, y, L.blade * 6.5, 0xff6a1a, 0.7);
          else this.glow(x, y, L.blade * 4, 0xdfe8ff, 0.3);
        }
      } else if (gd.id === 'coil') {
        // charged coil: a crackling halo that brightens as the discharge comes up
        const charge = 1 - Math.max(0, Math.min(1, gd.cd / 2.4));
        this.glow(px, py, 70 + charge * 40, gd.evolved ? 0xb090ff : 0x7fa8ff, 0.12 + charge * 0.22 + Math.random() * 0.05);
        if (charge > 0.6 && Math.random() < 0.5) {
          const a = Math.random() * TAU, r1 = 16, r2 = 30 + Math.random() * 10;
          gg.lineStyle(1.5, 0xcfe0ff, 0.8).beginPath();
          gg.moveTo(px + Math.cos(a) * r1, py + Math.sin(a) * r1);
          gg.lineTo(px + Math.cos(a + 0.3) * (r1 + r2) / 2, py + Math.sin(a + 0.3) * (r1 + r2) / 2);
          gg.lineTo(px + Math.cos(a - 0.1) * r2, py + Math.sin(a - 0.1) * r2); gg.strokePath();
        }
      }
    }

    // ---- drones (with a ground shadow; they hover)
    const evoDrone = run.gadgets.some((gd) => gd.id === 'drone' && gd.evolved);
    for (const d of run.drones) {
      const x = d.prevX + (d.x - d.prevX) * alpha, y = d.prevY + (d.y - d.prevY) * alpha - 14;
      const bob = Math.sin(t * 6 + d.phase) * 1.5;
      g.fillStyle(0x000000, 0.28).fillEllipse(x + 6, y + 30, 26, 14);
      this.body(evoDrone ? K.droneEvo : K.drone, x, y + bob, 1.1, d.aim).clearTint();
      this.glow(x, y + bob, 70, evoDrone ? 0xff6cf0 : 0x5ff0ff, 0.35 + 0.15 * Math.sin(t * 10 + d.phase));
    }

    // ---- lobbed bottles / grenades / bomblets with arcing height and a ground shadow
    for (const l of run.lobs) {
      const x = l.prevX + (l.x - l.prevX) * alpha, y = l.prevY + (l.y - l.prevY) * alpha;
      if (!inView(v, x, y, 120)) continue;
      const k = Math.min(1, l.t / l.dur), lift = 4 * k * (1 - k) * l.h;
      g.fillStyle(0x000000, 0.3).fillEllipse(x, y + 4, 14 - lift * 0.05, 7 - lift * 0.03);
      const spin = l.t * (l.kind === 'molotov' ? 14 : 10);
      if (l.kind === 'molotov') {
        this.body(K.bottle, x, y - lift, 1, spin).clearTint();
        const nx = x + Math.cos(spin) * 11, ny = y - lift + Math.sin(spin) * 11;
        this.glow(nx, ny, 34, 0xff8a2a, 0.8);
        this.flames.get().setPosition(nx, ny - 5).setScale(0.35, 0.45).setTint(0xffb040).setAlpha(0.9);
      } else if (l.kind === 'frag') {
        this.body(K.grenade, x, y - lift, 1.1, spin).clearTint();
        if (Math.floor(l.t * 10) % 2 === 0) this.glow(x, y - lift, 20, 0xff4030, 0.7);
      } else {
        this.body(K.bomblet, x, y - lift, 1.1, spin).clearTint();
        this.glow(x, y - lift, 22, 0xff3a2a, 0.5 + 0.5 * Math.sin(l.t * 40));
      }
    }
  }

  private drawZaps(dt: number) {
    const gg = this.glowG;
    for (const f of this.flashes) {
      f.life -= dt;
      if (f.life <= 0) continue;
      const a = f.life / f.max;
      this.glow(f.x, f.y, f.r * (1.6 - a * 0.6), f.color, 0.75 * a);
      if (f.r > 80) gg.lineStyle(3, 0xdfe8ff, 0.6 * a).strokeCircle(f.x, f.y, 30 + (1 - a) * 70);
    }
    this.flashes = this.flashes.filter((f) => f.life > 0);
    for (const z of this.zaps) {
      z.life -= dt; z.jit -= dt;
      if (z.life <= 0) continue;
      if (z.jit <= 0) { z.jit = 0.05; this.jag(z); }
      const a = Math.min(1, z.life / z.max * 1.4);
      const outer = z.evolved ? 0x9a6cff : 0x4a7cff, mid = z.evolved ? 0xc8b0ff : 0x9fc0ff, w = z.strike ? 1.8 : 1;
      z.segs.forEach((pts, si) => {
        const k = si === 0 ? 1 : 0.55;
        for (const [lw, col, al] of [[10 * w, outer, 0.22], [4.5 * w, mid, 0.7], [1.6 * w, 0xffffff, 1]] as [number, number, number][]) {
          gg.lineStyle(lw * k, col, al * a).beginPath();
          gg.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) gg.lineTo(pts[i].x, pts[i].y);
          gg.strokePath();
        }
      });
    }
    this.zaps = this.zaps.filter((z) => z.life > 0);
  }

  destroy() {
    this.clear();
    this.bodies.destroy(); this.glows.destroy(); this.flames.destroy();
    this.ground.destroy(); this.glowG.destroy();
  }
}
