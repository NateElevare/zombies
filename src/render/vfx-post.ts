// vfx-post.ts — post effects: bloom-style glow, a gentle colour grade, a soft vignette and the red "hurt"
// vignette pulse.
//
// Bloom: a full-res threshold+blur filter chain costs ~3-5 ms/frame on integrated GPUs (measured on Iris Xe),
// so glow is built from what we already know is emissive instead. Every frame the emitters (glow-layer
// particles, timed lights, tracer heads, fire) are stamped as soft halos into a quarter-resolution
// DynamicTexture, which is composited over the scene with ADD above the darkness. Low-res + bilinear upscale
// gives the wide soft bloom look for the cost of one small render and one full-screen quad.
// Grade: one cheap ColorMatrix camera filter (contrast + saturation). Vignettes: overlay quads, not passes.
//
// Toggle API (persisted in localStorage 'deadzone-vfx', default on):
//   getVfxEnabled(): boolean      setVfxEnabled(on: boolean): void
// Turning it off removes glow, grade and the static vignette; the hurt pulse stays (it is gameplay feedback).
import * as Phaser from 'phaser';
import { TX } from './art';
import { D, type View } from './common';

const KEY = 'deadzone-vfx';
let enabled = readFlag();
const listeners = new Set<(on: boolean) => void>();

function readFlag(): boolean {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}
/** True when bloom/glow, colour grading and vignette post effects are on (localStorage 'deadzone-vfx', default on). */
export function getVfxEnabled(): boolean { return enabled; }
/** Turn bloom/glow, colour grading and vignette on or off (persists; applies immediately). */
export function setVfxEnabled(on: boolean): void {
  enabled = !!on;
  try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch { /* storage blocked */ }
  for (const f of listeners) f(enabled);
}

const GS = 0.25;            // glow map resolution relative to the screen
const GM = 8;               // glow map margin (px)
const GMAX = 400;           // max halos per frame
const GLOW_KEY = 'rz_glowmap';

type Filters = { internal: Phaser.GameObjects.Components.FilterList; external: Phaser.GameObjects.Components.FilterList };
const VIG = 'rz_vignette', VIG_HURT = 'rz_vignette_hurt';

/** Screen-space radial edge darkening (transparent centre, smooth falloff from `inner` to the corners). */
function vignetteTexture(scene: Phaser.Scene, key: string, inner: number, span: number) {
  if (scene.textures.exists(key)) return;
  const W = 256, H = 144;
  const t = scene.textures.createCanvas(key, W, H);
  if (!t) return;
  const g = t.getContext(), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5) / W * 2 - 1, dy = (y + 0.5) / H * 2 - 1;
    const d = Math.sqrt(dx * dx * 0.85 + dy * dy * 0.85);          // 0 centre, ~1.3 corners
    const u = Math.max(0, Math.min(1, (d - inner) / span));
    const a = u * u * (3 - 2 * u);
    const i = (y * W + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  t.refresh();
}

export class PostFx {
  private cam: Phaser.Cameras.Scene2D.Camera;
  private gdt: Phaser.Textures.DynamicTexture | null = null;
  private gimg: Phaser.GameObjects.Image | null = null;
  private gq = new Float32Array(GMAX * 5);
  private gn = 0;
  private gw = 0; private gh = 0;
  private stampCfg = { scale: 1, tint: 0xffffff, alpha: 1, blendMode: Phaser.BlendModes.ADD as number };
  private scene: Phaser.Scene;
  private grade: Phaser.Filters.ColorMatrix | null = null;
  private ok = false;
  /** static edge vignette + red hurt vignette (cheap overlay quads, not filter passes) */
  private vig: Phaser.GameObjects.Image;
  private hurtVig: Phaser.GameObjects.Image;
  private on = enabled;
  /** 0..1 hurt pulse level (decays) */
  private hurt = 0;
  /** low-hp heartbeat level 0..1 (set by the owner each frame) */
  lowHp = 0;
  private time = 0;
  private onToggle = (on: boolean) => this.apply(on);

  constructor(scene: Phaser.Scene) {
    this.cam = scene.cameras.main;
    vignetteTexture(scene, VIG, 0.45, 0.85);
    vignetteTexture(scene, VIG_HURT, 0.7, 0.55);
    this.vig = scene.add.image(0, 0, VIG).setOrigin(0, 0).setDepth(D.overlay - 2).setTint(0x000000).setVisible(false);
    this.hurtVig = scene.add.image(0, 0, VIG_HURT).setOrigin(0, 0).setDepth(D.overlay - 1).setTint(0xa00000).setVisible(false);
    this.scene = scene;
    try {
      const W = Math.max(32, Math.ceil(scene.scale.width * GS) + GM * 2), H = Math.max(32, Math.ceil(scene.scale.height * GS) + GM * 2);
      this.gdt = scene.textures.exists(GLOW_KEY) ? (scene.textures.get(GLOW_KEY) as unknown as Phaser.Textures.DynamicTexture) : scene.textures.addDynamicTexture(GLOW_KEY, W, H)!;
      this.gw = W; this.gh = H;
      this.gimg = scene.add.image(0, 0, GLOW_KEY).setOrigin(0, 0).setDepth(D.glow).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    } catch (e) { console.warn('[render] glow map unavailable', e); this.gdt = null; }
    try {
      const f = (this.cam as unknown as { filters?: Filters }).filters;
      if (f) {
        // grade: a touch more contrast and saturation (punchier, less washed-out)
        const cm = f.internal.addColorMatrix();
        cm.colorMatrix.contrast(0.06, false);
        cm.colorMatrix.saturate(0.12, true);
        this.grade = cm;
        this.ok = true;
      }
    } catch (e) { console.warn('[render] colour grade unavailable', e); }
    listeners.add(this.onToggle);
    this.apply(enabled);
  }
  destroy() { listeners.delete(this.onToggle); this.vig.destroy(); this.hurtVig.destroy(); this.gimg?.destroy(); }

  /** Queue a soft halo (world px radius) for this frame's glow map. Cheap; call freely from fx/actors. */
  glow(x: number, y: number, r: number, col: number, a: number) {
    if (!this.on || this.gn >= GMAX || a <= 0.02 || r < 5) return;
    const q = this.gq, i = this.gn++ * 5;
    q[i] = x; q[i + 1] = y; q[i + 2] = r; q[i + 3] = col; q[i + 4] = a;
  }

  /** Render the queued halos into the glow map and place it over the view. Call once per frame. */
  private flushGlow(v: View) {
    const img = this.gimg, dt = this.gdt;
    if (!img || !dt) return;
    if (!this.on || this.gn === 0) { if (img.visible) img.setVisible(false); this.gn = 0; return; }
    const sc = this.scene.scale;
    const W = Math.max(32, Math.ceil(sc.width * GS) + GM * 2), H = Math.max(32, Math.ceil(sc.height * GS) + GM * 2);
    if (W !== this.gw || H !== this.gh) { dt.setSize(W, H); img.setTexture(GLOW_KEY); this.gw = W; this.gh = H; }
    const k = v.zoom * GS, q = this.gq, c = this.stampCfg;
    dt.clear();
    for (let n = 0; n < this.gn; n++) {
      const i = n * 5;
      const rr = q[i + 2] * k, sx = (q[i] - v.x) * k + GM, sy = (q[i + 1] - v.y) * k + GM;
      if (sx < -rr || sy < -rr || sx > W + rr || sy > H + rr) continue;
      c.scale = (rr * 2) / 256; c.tint = q[i + 3]; c.alpha = Math.min(1, q[i + 4]);
      dt.stamp(TX.soft, undefined, sx, sy, c);
    }
    dt.render();
    this.gn = 0;
    img.setVisible(true).setPosition(v.x - GM / k, v.y - GM / k).setScale(1 / k);
  }

  private apply(on: boolean) {
    this.on = on;
    if (!on) { this.gn = 0; if (this.gimg) this.gimg.setVisible(false); }
    if (this.ok) this.grade!.setActive(on);
  }

  /** Player took damage: pulse the red vignette (amount = hp lost). */
  onHurt(amount: number) { this.hurt = Math.min(0.62, Math.max(this.hurt, 0.32 + amount * 0.018)); }

  /** v = camera view (world px); active = a run is on screen and unpaused. */
  update(v: View, dt: number, active: boolean) {
    this.time += dt;
    this.flushGlow(v);
    const vg = this.vig;
    if (this.on) vg.setVisible(true).setPosition(v.x, v.y).setDisplaySize(v.w, v.h).setAlpha(0.42);
    else if (vg.visible) vg.setVisible(false);
    this.hurt = Math.max(0, this.hurt - dt * 1.7);
    const beat = this.lowHp > 0 ? this.lowHp * (0.12 + 0.28 * Math.pow(Math.max(0, Math.sin(this.time * 5.2)), 6)) : 0;
    const k = active ? Math.max(this.hurt, beat) : 0;
    const hv = this.hurtVig;
    if (k <= 0.01) { if (hv.visible) hv.setVisible(false); return; }
    hv.setVisible(true).setPosition(v.x, v.y).setDisplaySize(v.w, v.h).setAlpha(Math.min(1, k));
  }

  clear() { this.hurt = 0; this.lowHp = 0; this.hurtVig.setVisible(false); this.vig.setVisible(false); }
}
