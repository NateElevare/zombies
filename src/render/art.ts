// art.ts — asset lookup over the generated manifest (frame -> atlas), anim frame lists, prop/tile hints,
// and procedural fallback/utility textures (soft light, flashlight cone, blobs) so nothing ever crashes
// when the art pipeline output is partial or missing.
import type * as Phaser from 'phaser';

export type PropDef = { frames: string[]; fit?: string; atlas?: string; [k: string]: any };
export type FrameRef = { key: string; frame: string | undefined };

/** Keys of the procedural textures created by makeTextures(). */
export const TX = {
  px: 'rz_px',           // 4x4 white
  soft: 'rz_soft',       // radial white -> transparent (lights, glows)
  blob: 'rz_blob',       // soft dark blob (shadows)
  cone: 'rz_cone',       // flashlight cone, origin (0, 0.5), facing +x
  ring: 'rz_ring',       // shaded disc (fallback actor body)
  spark: 'rz_spark',     // elongated glow streak (tracers, sparks)
  puff: 'rz_puff',       // soft grey puff (smoke/dust fallback)
  drop: 'rz_drop',       // irregular splat (blood fallback)
  canopy: 'rz_canopy',   // tree canopy fallback (white, tinted)
  shock: 'rz_shock',     // thin soft ring (explosion shockwaves)
  chunk: 'rz_chunk',     // small irregular chunk (gibs, debris, splinters; white, tinted)
  digits: 'rz_digits',   // outlined digit glyphs '0'..'9' + '!' as frames 'd0'..'d9','dx' (damage numbers)
} as const;

/** Glyph cell size of TX.digits (texture px). */
export const DIGIT_W = 28, DIGIT_H = 40;

export const CONE_W = 512;           // texture px along the beam
export const CONE_HALF_TEX = 0.62;   // half-angle (rad) covered by the texture (beam itself is narrower)

export class Art {
  story=false;
  readonly scene: Phaser.Scene;
  manifest: any;
  private frameAtlas = new Map<string, string>();
  private animFrames = new Map<string, string[]>();
  readonly scale: number; // 1 / artScale

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.manifest = scene.registry.get('manifest') || { artScale: 2, atlases: [], sprites: {}, tiles: {}, props: {} };
    this.scale = 1 / (this.manifest.artScale || 2);
    for (const a of this.manifest.atlases || []) {
      if (!scene.textures.exists(a)) continue;
      for (const f of scene.textures.get(a).getFrameNames()) if (!this.frameAtlas.has(f)) this.frameAtlas.set(f, a);
    }
    const anims = (scene.cache.json.get('anims') || []) as { key: string; atlas: string; frames: string[] }[];
    for (const a of anims) {
      const fr = a.frames.filter((f) => this.frameAtlas.has(f));
      if (fr.length) this.animFrames.set(a.key, fr);
    }
    makeTextures(scene);
  }

  has(frame: string) { return this.frameAtlas.has(frame); }
  atlasOf(frame: string) { return this.frameAtlas.get(frame); }
  /** Frames of an anim key (only frames that actually exist), or null. */
  frames(key: string): string[] | null { return this.animFrames.get(key) || null; }
  /** Frame list for prefix: anim frames if registered, else probe prefix_0..n. */
  seq(prefix: string): string[] | null {
    const a = this.animFrames.get(prefix);
    if (a) return a;
    const out: string[] = [];
    for (let i = 0; i < 64; i++) { const f = prefix + '_' + i; if (this.frameAtlas.has(f)) out.push(f); else break; }
    if (out.length) { this.animFrames.set(prefix, out); return out; }
    return null;
  }
  sprite(prefix: string): any { return (this.manifest.sprites && this.manifest.sprites[prefix]) || null; }
  tiles(name: string): string[] | null {
    if(this.story){for(const f of ['story_material_'+name,'story_material_floor_'+name])if(this.has(f))return [f];}
    const t = this.manifest.tiles && this.manifest.tiles[name];
    if (!t || !t.length) return null;
    const ok = (t as string[]).filter((f) => this.frameAtlas.has(f));
    return ok.length ? ok : null;
  }
  prop(key: string): PropDef | null {
    if(this.story&&key.startsWith('decor:')){const f=key==='decor:bush'?'story_environment_bush_1':'story_decor_'+key.slice(6);if(this.has(f))return {frames:[f],pad:18};}
    const p = this.manifest.props && this.manifest.props[key];
    if (!p) return null;
    const frames = (Array.isArray(p) ? p : p.frames || []).filter((f: string) => this.frameAtlas.has(f));
    if (!frames.length) return null;
    return Array.isArray(p) ? { frames } : { ...p, frames };
  }
  animExists(key: string) { return this.scene.anims.exists(key); }
}

// ------------------------------------------------------------------ procedural textures
function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  if (!t) return;
  const g = t.getContext();
  draw(g, w, h);
  t.refresh();
}

export function makeTextures(scene: Phaser.Scene) {
  canvasTex(scene, TX.px, 4, 4, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 4); });
  canvasTex(scene, TX.soft, 256, 256, (g, w) => {
    // smooth (1 - d^2)^2 falloff: bright centre, no visible edge
    const img = g.createImageData(w, w), r = w / 2;
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - r) / r, dy = (y + 0.5 - r) / r, d2 = dx * dx + dy * dy;
      const v = d2 >= 1 ? 0 : (1 - d2) * (1 - d2);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(v * 255);
    }
    g.putImageData(img, 0, 0);
  });
  canvasTex(scene, TX.blob, 128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  canvasTex(scene, TX.ring, 128, 128, (g, w) => {
    const c = w / 2;
    const gr = g.createRadialGradient(c - 14, c - 14, 4, c, c, c - 6);
    gr.addColorStop(0, '#f2f2f2'); gr.addColorStop(0.7, '#a8a8a8'); gr.addColorStop(1, '#606060');
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, c - 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(30,30,30,0.9)'; g.lineWidth = 4; g.stroke();
    g.fillStyle = 'rgba(40,40,40,0.8)'; g.beginPath(); g.arc(c + 26, c, 10, 0, Math.PI * 2); g.fill(); // "face" marker (+x)
  });
  canvasTex(scene, TX.spark, 64, 16, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w - 4, h / 2 - 3); g.arc(w - 4, h / 2, 3, -Math.PI / 2, Math.PI / 2); g.lineTo(0, h / 2); g.fill();
  });
  canvasTex(scene, TX.puff, 64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  canvasTex(scene, TX.drop, 64, 64, (g, w) => {
    let s = 1234567;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(w / 2, w / 2, 18, 14, 0.3, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, d = 12 + rnd() * 14; g.beginPath(); g.arc(w / 2 + Math.cos(a) * d, w / 2 + Math.sin(a) * d, 2 + rnd() * 5, 0, 6.28); g.fill(); }
  });
  canvasTex(scene, TX.canopy, 128, 128, (g, w) => {
    let s = 987654;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const c = w / 2;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(c + 6, c + 7, c - 10, 0, 6.29); g.fill();
    for (let i = 0; i < 26; i++) {
      const a = rnd() * 6.28, d = rnd() * (c - 30), r = 12 + rnd() * 16, x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
      const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r);
      gr.addColorStop(0, 'rgb(150,170,120)'); gr.addColorStop(0.6, 'rgb(95,110,75)'); gr.addColorStop(1, 'rgb(55,62,45)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
    }
  });
  canvasTex(scene, TX.shock, 256, 256, (g, w) => {
    // bright thin rim with a soft inner falloff (reads as a pressure wave when scaled up quickly)
    const img = g.createImageData(w, w), r = w / 2;
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
      const rim = Math.exp(-((d - 0.9) * (d - 0.9)) / (0.045 * 0.045));
      const inner = d < 0.9 ? 0.22 * Math.pow(d / 0.9, 3) : 0;
      const v = Math.min(1, rim + inner) * (d > 1 ? 0 : 1);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(v * 255);
    }
    g.putImageData(img, 0, 0);
  });
  canvasTex(scene, TX.chunk, 16, 16, (g) => {
    if (scene.registry.get('manifest')?.effectsStyle === 'pixel-v1') {
      g.fillStyle = '#bbbbbb'; g.fillRect(2, 6, 12, 4); g.fillRect(4, 4, 8, 8); g.fillRect(6, 2, 4, 12);
      g.fillStyle = '#ffffff'; g.fillRect(4, 4, 6, 4);
      g.fillStyle = '#777777'; g.fillRect(6, 10, 6, 2);
      return;
    }
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(3, 5); g.lineTo(9, 2); g.lineTo(14, 6); g.lineTo(12, 12); g.lineTo(6, 14); g.lineTo(2, 10); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.moveTo(12, 12); g.lineTo(6, 14); g.lineTo(2, 10); g.lineTo(8, 9); g.closePath(); g.fill();
  });
  if (scene.registry.get('manifest')?.effectsStyle === 'pixel-v1') scene.textures.get(TX.chunk).setFilter(0); // NEAREST
  if (!scene.textures.exists(TX.digits)) {
    const glyphs = '0123456789!';
    const t = scene.textures.createCanvas(TX.digits, DIGIT_W * glyphs.length, DIGIT_H);
    if (t) {
      const g = t.getContext();
      g.font = `900 ${DIGIT_H - 6}px "Arial Black", Impact, "Segoe UI", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round';
      for (let i = 0; i < glyphs.length; i++) {
        const cx = i * DIGIT_W + DIGIT_W / 2, cy = DIGIT_H / 2 + 1;
        g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.9)'; g.strokeText(glyphs[i], cx, cy);
        g.fillStyle = '#fff'; g.fillText(glyphs[i], cx, cy);
        t.add(i < 10 ? 'd' + i : 'dx', 0, i * DIGIT_W, 0, DIGIT_W, DIGIT_H);
      }
      t.refresh();
    }
  }
  // Flashlight cone. Facing +x, origin at (0, h/2). Encodes: hot core along the axis, wide soft spill,
  // smooth penumbra at the beam edge, distance falloff to 0 at the far end, and a soft start at the lens.
  canvasTex(scene, TX.cone, CONE_W, Math.round(2 * CONE_W * Math.tan(CONE_HALF_TEX)) & ~1, (g, w, h) => {
    const img = g.createImageData(w, h), cy = h / 2, HALF = 0.42;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = x + 0.5, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) / w;
      if (d >= 1) continue;
      const a = Math.abs(Math.atan2(dy, dx)) / HALF;            // 0 on axis, 1 at the nominal beam edge
      const edge = 1 - smooth(0.62, 1.32, a);                    // wide soft penumbra
      const core = Math.exp(-(a * a) / (0.38 * 0.38));           // hot spot
      const fall = Math.pow(1 - d * d, 2) * (0.35 + 0.65 * smooth(0, 0.16, d)); // dim right at the lens, long reach
      let v = fall * edge * (0.5 + 0.75 * core);
      // a little spill just around the lens so the hands/front are lit
      v += 0.1 * Math.exp(-(d * d) / (0.03 * 0.03)) * (1 - smooth(0.9, 2.4, a));
      v = Math.min(1, v);
      const i = (y * w + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = Math.round(v * 255);
    }
    g.putImageData(img, 0, 0);
  });
}
function smooth(a: number, b: number, x: number) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
