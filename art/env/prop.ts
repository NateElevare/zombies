// art/env/prop.ts — prop sprite factory + manifest registry for the environment atlases.
// Every sprite is drawn at ART_SCALE (2 px per world px) with a transparent margin `pad` (world px) on all
// sides that holds the baked drop shadow. The object body occupies the inner nativeSize rect.
import { canvas, rng, ART_SCALE, type Canvas, type Ctx, type Rng } from '../lib/core';
import { grain, withShadow } from '../lib/materials';

export type Fit = 'stretch' | 'contain' | 'tile' | 'nine';
export interface PropEntry {
  atlas: string;
  frames: string[];
  fit: Fit;
  /** world px of the object body (without shadow pad), long axis horizontal unless orient says otherwise */
  nativeSize: [number, number];
  /** 'h' = drawn with the long side horizontal; rotate 90° when the target rect is taller than wide */
  orient: 'h' | 'v' | 'any';
  /** transparent margin around the body on every side, in world px (shadow lives here) */
  pad: number;
  /** nine-slice borders in TEXTURE px measured from the frame edge [left, top, right, bottom] (fit 'nine') */
  slice?: [number, number, number, number];
  /** which edge of the sprite is the back (against a wall): 'n' = top. Beds use 'w' (headboard left). Cars 'w' = rear (front faces +x). */
  back?: 'n' | 's' | 'w' | 'e';
  [k: string]: any;
}

export interface Sprite { name: string; canvas: Canvas }
export type Draw = (g: Ctx, W: number, H: number, R: Rng) => void;

export interface SpriteOpts { elev?: number; seed?: number; grain?: number; pad?: number; shadowAlpha?: number }

/** elevation (world px) -> shadow offset/blur in texture px and the pad it needs (world px). */
export function shadowFor(elev: number) {
  const dx = Math.round(elev * 1.1), dy = Math.round(elev * 1.4), blur = 2 + elev * 0.9;
  const pad = Math.ceil((Math.max(dx, dy) + blur * 2.2) / ART_SCALE) + 1;
  return { dx, dy, blur, pad };
}

/** Draw a prop body (w×h world px) and bake its shadow. */
export function sprite(w: number, h: number, draw: Draw, o: SpriteOpts = {}): { canvas: Canvas; pad: number } {
  const elev = o.elev ?? 4;
  const sh = shadowFor(elev);
  const pad = o.pad ?? sh.pad;
  const S = ART_SCALE, W = Math.round(w * S), H = Math.round(h * S), P = pad * S;
  const body = canvas(W + P * 2, H + P * 2);
  body.g.translate(P, P);
  draw(body.g, W, H, rng(o.seed ?? (w * 131 + h * 7)));
  if ((o.grain ?? 0.05) > 0) grain(body.c, (o.seed ?? 1) + 17, o.grain ?? 0.05, 5, 0.035);
  const out = elev > 0 ? withShadow(body.c, sh.dx, sh.dy, sh.blur, o.shadowAlpha ?? 0.35) : body.c;
  return { canvas: out, pad };
}

export class Registry {
  sprites: { atlas: string; name: string; canvas: Canvas }[] = [];
  props: Record<string, PropEntry> = {};
  /** register a prop key with several variant canvases (all same native size + pad) */
  add(key: string, atlas: string, prefix: string, variants: { canvas: Canvas; pad: number }[], e: Omit<PropEntry, 'atlas' | 'frames' | 'pad'> & { pad?: number }) {
    const frames: string[] = [];
    const single = !!(e as any).single; delete (e as any).single;
    variants.forEach((v, i) => {
      const name = single && variants.length === 1 ? prefix : `${prefix}_${i}`;
      if (!this.sprites.some((s) => s.name === name)) this.sprites.push({ atlas, name, canvas: v.canvas });
      frames.push(name);
    });
    const prev = this.props[key];
    if (prev) { prev.frames.push(...frames.filter((f) => !prev.frames.includes(f))); return prev; }
    this.props[key] = { atlas, frames, pad: variants[0]?.pad ?? 0, ...e } as PropEntry;
    return this.props[key];
  }
  alias(key: string, of: string, extra: Partial<PropEntry> = {}) { this.props[key] = { ...this.props[of], ...extra }; }
}
