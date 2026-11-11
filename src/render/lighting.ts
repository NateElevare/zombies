// lighting.ts — the lightmap pass.
// A half-resolution DynamicTexture is rebuilt every frame and composited over the whole scene with
// MULTIPLY (WebGL blend DST_COLOR, ONE_MINUS_SRC_ALPHA with an opaque lightmap = scene * light):
//   1. fill opaque black
//   2. flashlight: stamp the cone gradient (hot core, penumbra, distance falloff, warm white, flicker)
//   3. wall occlusion: shadow volumes — every back-facing edge of each blocksSight rect near the player is
//      extruded away from the lens and filled black, which clips the cone exactly like a visibility polygon
//   4. ambient: ADD the ambient colour (darkness from game.darkness, darker indoors, blue-black at night)
//   5. point lights (ADD): the player's small personal light, muzzle flashes, campfires, burning zombies,
//      explosions — all soft radial textures with flicker
// A light blur filter on the composite image softens shadow edges into a penumbra.
import * as Phaser from 'phaser';
import type { Building, GameState, Solid } from '../sim/types';
import { darkness } from '../sim/game';
import * as world from '../sim/world';
import { TX, CONE_W, CONE_HALF_TEX } from './art';
import { D, type View } from './common';
import type { Light } from './fx';
import { getVfxEnabled } from './vfx-post';
import { storyEffectOffset } from './story-projection';
import { isAngledStory } from '../story-mode';

const LS = 0.5;                // lightmap resolution relative to the screen
const M = 10;                  // lightmap margin (px) so the blur never samples outside the texture
const RANGE = 650;             // flashlight range, world px
const HALF = 0.42;             // nominal beam half-angle

export interface PointLight { x: number; y: number; r: number; col: number; i: number }

export class Lighting {
  private scene: Phaser.Scene;
  private dt: Phaser.Textures.DynamicTexture;      // raw lightmap
  private dt2: Phaser.Textures.DynamicTexture;     // blurred copy (composited)
  private fdt: Phaser.Textures.DynamicTexture;     // occluded flashlight (cone minus shadow volumes)
  private flashImg: Phaser.GameObjects.Image;
  /** the occluded beam again, faintly ADDed above the darkness: beam haze + hot-spot bloom (vfx on) */
  private haze: Phaser.GameObjects.Image;
  private gi: Phaser.GameObjects.Graphics;         // interior ambient rects
  private tmpB: Building[] = [];
  private raw: Phaser.GameObjects.Image;           // off-list image of dt with the blur filter
  private img: Phaser.GameObjects.Image;
  private g: Phaser.GameObjects.Graphics;
  private w = 0; private h = 0;
  private indoor = 0;
  private tmp: Solid[] = [];
  private flick = 1; private flickT = 0;
  private ambient = 0;
  blurOk = false;
  /** Lightmap gain: with the custom 2x-multiply blend the lightmap stores light/2, so hot spots can over-expose. */
  private gain = 1;
  /** debug/probe readouts */
  lastDark = 0;
  /** unhalved ambient colour + level (for roofs drawn above the lightmap) */
  ambientColor = 0xffffff; ambientLevel = 1;
  shadowQuads = 0;
  lastFlashOrigin = {x:0,y:0};
  private softCfg = { scale: 1, tint: 0xffffff, alpha: 1, blendMode: Phaser.BlendModes.ADD as number };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const W = Math.max(64, Math.ceil(scene.scale.width * LS) + M * 2), H = Math.max(64, Math.ceil(scene.scale.height * LS) + M * 2);
    this.dt = scene.textures.addDynamicTexture('rz_lightmap_raw', W, H)!;
    this.dt2 = scene.textures.addDynamicTexture('rz_lightmap', W, H)!;
    this.w = W; this.h = H;
    this.img = scene.add.image(0, 0, 'rz_lightmap').setOrigin(0, 0).setDepth(D.light).setBlendMode(Phaser.BlendModes.MULTIPLY);
    // custom "2x multiply" blend: result = 2 * scene * light (light stored halved; 0.5 = unchanged)
    try {
      const r = scene.game.renderer as any, gl = r.gl as WebGLRenderingContext | undefined;
      if (gl && r.addBlendMode) {
        if (r.__rzMul2 === undefined) {
          // NB: Phaser 4.2.1 addBlendMode() returns index-1 (bug); use the real slot and set all 4 funcs
          r.addBlendMode([gl.DST_COLOR, gl.SRC_COLOR], gl.FUNC_ADD);
          r.__rzMul2 = r.blendModes.length - 1;
          r.updateBlendMode(r.__rzMul2, [gl.DST_COLOR, gl.SRC_COLOR, gl.ZERO, gl.ONE], gl.FUNC_ADD);
        }
        this.img.setBlendMode(r.__rzMul2);
        this.gain = 0.5;
      }
    } catch (e) { console.warn('[render] custom blend unavailable', e); }
    this.raw = new Phaser.GameObjects.Image(scene, 0, 0, 'rz_lightmap_raw').setOrigin(0, 0);
    this.fdt = scene.textures.addDynamicTexture('rz_flash', W, H)!;
    this.flashImg = new Phaser.GameObjects.Image(scene, 0, 0, 'rz_flash').setOrigin(0, 0).setBlendMode(Phaser.BlendModes.ADD);
    this.haze = scene.add.image(0, 0, 'rz_flash').setOrigin(0, 0).setDepth(D.light + 1).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe2bc).setVisible(false);
    this.gi = scene.make.graphics({}, false);
    this.g = scene.make.graphics({}, false);
    // Filters don't keep the MULTIPLY blend when compositing to the screen, so the blur is applied while
    // copying the raw lightmap into a second texture; that one is composited (unfiltered) with MULTIPLY.
    try {
      this.raw.enableFilters();
      this.raw.filters!.internal.addBlur(0, 1, 1, 0.7, 0xffffff, 2);
      this.blurOk = true;
    } catch (e) { console.warn('[render] blur filter unavailable', e); }
  }
  destroy() { this.haze.destroy(); this.img.destroy(); this.raw.destroy(); this.flashImg.destroy(); this.g.destroy(); this.gi.destroy(); this.dt.destroy(); this.dt2.destroy(); this.fdt.destroy(); }
  setVisible(v: boolean) { this.img.setVisible(v); if (!v) this.haze.setVisible(false); }

  /** Current effective darkness 0..1 (after indoor adjustment). */
  get dark() { return this.lastDark; }

  draw(state: GameState, v: View, px: number, py: number, aim: number, realDt: number, time: number, lights: Light[], fires: { x: number; y: number }[], nFires: number, burning: { x: number; y: number }[], nBurning: number) {
    const sc = this.scene.scale;
    const W = Math.max(64, Math.ceil(v.w * v.zoom * LS) + M * 2), H = Math.max(64, Math.ceil(v.h * v.zoom * LS) + M * 2);
    if (W !== this.w || H !== this.h) { this.dt.setSize(W, H); this.dt2.setSize(W, H); this.fdt.setSize(W, H); this.flashImg.setTexture('rz_flash'); this.haze.setTexture('rz_flash'); this.raw.setTexture('rz_lightmap_raw'); this.img.setTexture('rz_lightmap'); this.w = W; this.h = H; }
    const k = (v.zoom * LS);                     // world px -> lightmap px
    const lx = (wx: number) => (wx - v.x) * k + M, ly = (wy: number) => (wy - v.y) * k + M;
    const p = state.player;

    // ---- ambient: outdoors follows the day/night cycle; building interiors are always dim
    const d0 = darkness(state);
    const inside = p && !p.dead ? !!world.buildingAt(state, p.x, p.y) : false;
    this.indoor += ((inside ? 1 : 0) - this.indoor) * (1 - Math.exp(-4 * realDt));
    const dIn = Math.min(0.95, Math.max(0.64, d0 + 0.08));
    const d = d0 + this.indoor * (dIn - d0);          // darkness where the player stands
    this.lastDark = d;
    const night = Math.min(1, Math.max(0, (d0 - 0.15) / 0.82));
    const G = this.gain;
    const amb = (lev: number, f: number) => {
      // day: neutral warm-white; night: deep blue-black moonlight
      const r = lev * (1.0 - 0.12 * night) + 0.012 * night, g = lev * (0.98 - 0.04 * night) + 0.02 * night, b = lev * (0.95 + 0.12 * night) + 0.075 * night;
      return rgb(Math.min(1, r * f), Math.min(1, g * f), Math.min(1, b * f));
    };
    this.ambientColor = amb(1 - d0, 1.1); this.ambientLevel = 1 - d0;
    this.ambient = amb(1 - d0, G);
    const inAmb = amb(1 - dIn, G);
    const level = 1 - d;

    // ---- flashlight into its own texture: cone, then black shadow volumes
    this.shadowQuads = 0;
    let flashOn = false;
    if (p && !p.dead && p.flashlight !== false) {
      // flicker: mostly steady, with occasional tiny dips (old batteries)
      this.flickT -= realDt;
      if (this.flickT <= 0) { this.flickT = 0.05 + Math.random() * 0.12; this.flick = Math.random() < 0.06 ? 0.82 + Math.random() * 0.1 : 0.95 + Math.random() * 0.05; }
      const fl = this.flick;
      // by day the beam barely shows outdoors; it matters indoors, at dusk and at night
      const coneK = 0.9 * Math.min(1, Math.max(0.1, (d - 0.12) / 0.55));
      const lift=isAngledStory(state)?storyEffectOffset(64):{x:0,y:0};
      const reach=isAngledStory(state)?12:6;
      const ox = px + Math.cos(aim) * reach+lift.x, oy = py + Math.sin(aim) * reach+lift.y;
      this.lastFlashOrigin.x=ox;this.lastFlashOrigin.y=oy;
      const s = (RANGE * k) / CONE_W;
      const f = this.fdt;
      f.fill(0x000000, 1);
      f.stamp(TX.cone, undefined, lx(ox), ly(oy), { originX: 0, originY: 0.5, rotation: aim, scale: s, tint: 0xfff0d8, alpha: fl * coneK, blendMode: Phaser.BlendModes.ADD });
      // Query occluders at the physical player, then lift the cone and its mask
      // together. Moving the query itself would put the lens through nearby walls.
      this.occlude(state, px, py, aim, x=>lx(x+lift.x),y=>ly(y+lift.y));
      if (this.shadowQuads) f.draw(this.g);
      f.render();
      flashOn = true;
    }

    // ---- lightmap: outdoor ambient, dim interiors, + occluded flashlight, + point lights
    const dt = this.dt;
    dt.fill(this.ambient, 1);
    const gi = this.gi;
    gi.clear();
    this.tmpB.length = 0;
    world.buildingsIn(state, v.x - 20, v.y - 20, v.w + 40, v.h + 40, this.tmpB);
    if (this.tmpB.length && inAmb !== this.ambient) {
      gi.fillStyle(inAmb, 1);
      for (const bd of this.tmpB) gi.fillRect(lx(bd.x), ly(bd.y), bd.w * k, bd.h * k);
      dt.draw(gi);
    }
    if (flashOn) dt.draw(this.flashImg);

    // ---- point lights
    const soft = (wx: number, wy: number, rad: number, col: number, a: number) => {
      if (a <= 0.005) return;
      const sx = lx(wx), sy = ly(wy), rr = rad * k;
      if (sx < -rr || sy < -rr || sx > W + rr || sy > H + rr) return;
      const c = this.softCfg; c.scale = (rr * 2) / 256; c.tint = col; c.alpha = Math.min(1, a * this.gain);
      dt.stamp(TX.soft, undefined, sx, sy, c);
    };
    if (p && !p.dead) {
      // personal light so you can always read your own body (a touch more indoors / at night)
      soft(px, py, 150, 0xb8c4d8, 0.12 + 0.4 * Math.max(night, this.indoor) * (1 - level));
    }
    if (state.mode === 'survival' && state.legacyStory && state.campaign) {
      const station = state.buildings.find(b => b.id === 'campaign-haven');
      if (station && state.campaign.done.includes('clear')) {
        const powered = state.campaign.done.includes('power') && state.campaign.fuel > 0 && state.campaign.encounter?.id !== 'blackout';
        soft(station.x + 330, station.y + 175, powered ? 480 : 160, 0xf4d49a, powered ? .85 : .5);
        if (powered) soft(station.x + 70, station.y + 355, 260, 0xf5d5a5, .65);
      }
    }
    for (let i = 0; i < nFires; i++) {
      const f = fires[i];
      const fl = 0.85 + 0.08 * Math.sin(time * 9 + i) + 0.06 * Math.sin(time * 23.7 + i * 2.1) + 0.04 * Math.sin(time * 41 + i);
      soft(f.x, f.y, 330 * fl, 0xffa860, 0.95 * fl);
      soft(f.x, f.y, 120, 0xffd8a0, 0.5);
    }
    for (let i = 0; i < nBurning; i++) {
      const f = burning[i];
      soft(f.x, f.y, 170, 0xff9a50, 0.65 + 0.15 * Math.sin(time * 17 + i * 3));
    }
    for (const l of lights) {
      if (l.life <= 0 || l.t >= l.life) continue;
      const u = l.t / l.life, fade = (1 - u) * (1 - u);
      const fl = l.flick ? 1 + (Math.random() - 0.5) * l.flick : 1;
      soft(l.x, l.y, l.r * (0.85 + 0.15 * (1 - u)), l.col, l.i * fade * fl);
    }
    dt.render();
    this.dt2.clear().draw(this.raw).render();
    // composite: lightmap covers exactly the camera view
    this.img.setPosition(v.x - M / k, v.y - M / k).setScale(1 / k);
    // beam haze: only where it is dark enough for a beam to read
    const hz = flashOn && getVfxEnabled() ? 0.13 * Math.min(1, Math.max(0, (d - 0.35) / 0.4)) : 0;
    if (hz > 0.005) this.haze.setVisible(true).setPosition(v.x - M / k, v.y - M / k).setScale(1 / k).setAlpha(hz);
    else if (this.haze.visible) this.haze.setVisible(false);
  }

  /** Shadow volumes for every blocksSight rect within range of the lens; fills this.g (lightmap space). */
  private occlude(state: GameState, px: number, py: number, aim: number, lx: (x: number) => number, ly: (y: number) => number) {
    const g = this.g;
    g.clear();
    g.fillStyle(0x000000, 1);
    const list = this.tmp; list.length = 0;
    const R = RANGE + 20;
    // only the part of the world the cone can reach: bounding box of the (wide) cone
    const ca = Math.cos(aim), sa = Math.sin(aim), wa = CONE_HALF_TEX + 0.1;
    let x0 = px, x1 = px, y0 = py, y1 = py;
    for (let ai = -1; ai <= 1; ai++) { const a = ai * wa; const ex = px + Math.cos(aim + a) * R, ey = py + Math.sin(aim + a) * R; x0 = Math.min(x0, ex); x1 = Math.max(x1, ex); y0 = Math.min(y0, ey); y1 = Math.max(y1, ey); }
    x0 -= 16; y0 -= 16; x1 += 16; y1 += 16;
    state.grid.each(x0, y0, x1 - x0, y1 - y0, (o) => { if (o.blocksSight !== false && o.kind !== 'window') list.push(o); });
    const far = R * 3;
    const cosLim = Math.cos(wa + 0.25);
    for (const o of list) {
      const ax = o.x, ay = o.y, bx = o.x + o.w, by = o.y + o.h;
      if (px > ax && px < bx && py > ay && py < by) continue;      // lens inside (shouldn't happen)
      // cull rects fully outside the cone's angular span (nearest point test + corners)
      const nx = Math.max(ax, Math.min(px, bx)) - px, ny = Math.max(ay, Math.min(py, by)) - py;
      const nd = Math.hypot(nx, ny);
      if (nd > R) continue;
      if (nd > 40) {
        let inside = false;
        const cs = [ax, ay, bx, ay, bx, by, ax, by];
        for (let i = 0; i < 8 && !inside; i += 2) { const dx = cs[i] - px, dy = cs[i + 1] - py, dl = Math.hypot(dx, dy) || 1; if ((dx * ca + dy * sa) / dl > cosLim) inside = true; }
        if (!inside && (nx * ca + ny * sa) / nd < cosLim) continue;
      }
      // back-facing edges (normal points away from the light) are extruded to infinity
      if (py > by) this.edge(g, ax, ay, bx, ay, px, py, far, lx, ly);   // top edge faces away when light is below
      if (py < ay) this.edge(g, bx, by, ax, by, px, py, far, lx, ly);   // bottom
      if (px > bx) this.edge(g, ax, by, ax, ay, px, py, far, lx, ly);   // left
      if (px < ax) this.edge(g, bx, ay, bx, by, px, py, far, lx, ly);   // right
    }
  }
  private edge(g: Phaser.GameObjects.Graphics, ax: number, ay: number, bx: number, by: number, px: number, py: number, far: number, lx: (x: number) => number, ly: (y: number) => number) {
    const dax = ax - px, day = ay - py, dbx = bx - px, dby = by - py;
    const la = far / (Math.hypot(dax, day) || 1), lb = far / (Math.hypot(dbx, dby) || 1);
    const Ax = lx(ax), Ay = ly(ay), Bx = lx(bx), By = ly(by);
    const A2x = lx(ax + dax * la), A2y = ly(ay + day * la), B2x = lx(bx + dbx * lb), B2y = ly(by + dby * lb);
    g.fillTriangle(Ax, Ay, Bx, By, B2x, B2y);
    g.fillTriangle(Ax, Ay, B2x, B2y, A2x, A2y);
    this.shadowQuads++;
  }
}
function rgb(r: number, g: number, b: number) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}
