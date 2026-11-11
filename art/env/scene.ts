// art/env/scene.ts — mock "street scene" composite that exercises the manifest contract the same way the
// renderer will (tiles, wall strips, stretch/nine/tile/contain props with shadow pad, decals).
import { canvas, rng, savePng, ART_SCALE, type Canvas, type Ctx } from '../lib/core';
import type { Registry, PropEntry } from './prop';

interface Ctx2 { tiles: Record<string, Canvas[]>; reg: Registry; walls: Record<string, Canvas> }

export function streetScene(path: string, C: Ctx2) {
  const S = ART_SCALE, WW = 900, WH = 560; // world px
  const { c, g } = canvas(WW * S, WH * S);
  const R = rng(42);
  const spr = (name: string) => C.reg.sprites.find((s) => s.name === name)?.canvas ?? C.walls[name];

  const fillTiles = (mat: string, x: number, y: number, w: number, h: number) => {
    const vs = C.tiles[mat];
    g.save(); g.beginPath(); g.rect(x * S, y * S, w * S, h * S); g.clip();
    for (let ty = Math.floor(y / 64) * 64; ty < y + h; ty += 64) for (let tx = Math.floor(x / 64) * 64; tx < x + w; tx += 64) {
      const v = vs[(Math.abs(tx * 7 + ty * 13) / 64 | 0) % vs.length];
      g.drawImage(v, tx * S, ty * S);
    }
    g.restore();
  };
  /** draw prop `key` into world rect (x,y,w,h); rot in quarter turns; uses fit/pad like the renderer */
  const prop = (key: string, x: number, y: number, w: number, h: number, rot = 0, vi = -1) => {
    const e = C.reg.props[key] as PropEntry;
    if (!e) { console.warn('scene: missing', key); return; }
    const frame = e.frames[vi >= 0 ? vi % e.frames.length : R.int(0, e.frames.length - 1)];
    const img = spr(frame);
    const [nw, nh] = e.nativeSize, p = e.pad;
    g.save();
    g.translate((x + w / 2) * S, (y + h / 2) * S);
    g.rotate(rot * Math.PI / 2);
    const tw = rot % 2 ? h : w, th = rot % 2 ? w : h; // target size in sprite space
    if (e.fit === 'contain') {
      const k = Math.min(tw / nw, th / nh);
      g.drawImage(img, -(nw / 2 + p) * k * S, -(nh / 2 + p) * k * S, (nw + 2 * p) * k * S, (nh + 2 * p) * k * S);
    } else if (e.fit === 'nine' && e.slice) {
      const [l, t, r, b] = e.slice, IW = img.width, IH = img.height;
      const dw = (tw + 2 * p) * S, dh = (th + 2 * p) * S, dx = -dw / 2, dy = -dh / 2;
      const sx = [0, l, IW - r, IW], sy = [0, t, IH - b, IH], ex = [0, l, dw - r, dw], ey = [0, t, dh - b, dh];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const sw = sx[i + 1] - sx[i], sh = sy[j + 1] - sy[j], ew = ex[i + 1] - ex[i], eh = ey[j + 1] - ey[j];
        if (sw > 0 && sh > 0 && ew > 0 && eh > 0) g.drawImage(img, sx[i], sy[j], sw, sh, dx + ex[i], dy + ey[j], ew, eh);
      }
    } else if (e.fit === 'tile') {
      const k = th / nh, segW = nw * k;
      for (let ox = -tw / 2; ox < tw / 2 - 0.1; ox += segW) {
        const cw = Math.min(segW, tw / 2 - ox);
        g.drawImage(img, 0, 0, (cw / k + 2 * p) * S, img.height, (ox - p * k) * S, -(th / 2 + p * k) * S, (cw + 2 * p * k) * S, (th + 2 * p * k) * S);
      }
    } else {
      const kx = tw / nw, ky = th / nh;
      g.drawImage(img, -(tw / 2 + p * kx) * S, -(th / 2 + p * ky) * S, (tw + 2 * p * kx) * S, (th + 2 * p * ky) * S);
    }
    g.restore();
  };
  const strip = (name: string, x: number, y: number, w: number, h: number, horiz: boolean) => {
    const img = C.walls[name];
    g.save(); g.beginPath(); g.rect(x * S, y * S, w * S, h * S); g.clip();
    if (horiz) { const k = (h * S) / img.height; for (let ox = 0; ox < w * S; ox += img.width * k) g.drawImage(img, x * S + ox, y * S, img.width * k, h * S); }
    else { const k = (w * S) / img.width; for (let oy = 0; oy < h * S; oy += img.height * k) g.drawImage(img, x * S, y * S + oy, w * S, img.height * k); }
    g.restore();
  };
  const nine = (name: string, x: number, y: number, w: number, h: number, horiz: boolean) => {
    const img = C.walls[name], b = 8;
    if (horiz) { const dh = h * S; g.drawImage(img, 0, 0, b, img.height, x * S, y * S, b * dh / img.height, dh); g.drawImage(img, b, 0, img.width - 2 * b, img.height, x * S + b * dh / img.height, y * S, w * S - 2 * b * dh / img.height, dh); g.drawImage(img, img.width - b, 0, b, img.height, (x + w) * S - b * dh / img.height, y * S, b * dh / img.height, dh); }
    else { const dw = w * S; g.drawImage(img, 0, 0, img.width, b, x * S, y * S, dw, b * dw / img.width); g.drawImage(img, 0, b, img.width, img.height - 2 * b, x * S, y * S + b * dw / img.width, dw, h * S - 2 * b * dw / img.width); g.drawImage(img, 0, img.height - b, img.width, b, x * S, (y + h) * S - b * dw / img.width, dw, b * dw / img.width); }
  };

  // ---------------- ground
  fillTiles('grass', 0, 0, WW, WH);
  fillTiles('sidewalk', 0, 0, WW, 24);
  fillTiles('asphalt', 0, 24, WW, 150);
  fillTiles('asphalt_cracked', 320, 24, 192, 150);
  fillTiles('sidewalk', 0, 174, WW, 24);
  // curbs
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 24 * S, WW * S, 2); g.fillRect(0, 172 * S, WW * S, 3);
  g.fillStyle = 'rgba(220,215,200,0.15)'; g.fillRect(0, 22 * S, WW * S, 2); g.fillRect(0, 174 * S, WW * S, 2);
  // road paint (vector, as the renderer will do)
  g.fillStyle = 'rgba(190,160,60,0.55)'; for (let x = 0; x < WW; x += 40) g.fillRect(x * S, 98 * S, 22 * S, 2 * S);
  g.fillStyle = 'rgba(205,205,195,0.35)'; g.fillRect(0, 30 * S, WW * S, 2 * S); g.fillRect(0, 166 * S, WW * S, 2 * S);
  for (let k = 0; k < 8; k++) prop('decor:crosswalk', 760 + k * 18, 28, 9, 142, 0, 0);
  prop('decor:manhole', 600, 120, 28, 28, 0);
  prop('decor:crack', 120, 60, 48, 40, 0); prop('decor:oil', 420, 70, 40, 28, 0); prop('decor:oil', 220, 128, 40, 28, 0);
  prop('decor:tire', 300, 110, 170, 40, 0); prop('decor:debris', 520, 40, 24, 20, 0); prop('decor:blood', 680, 132, 36, 30, 0);
  prop('decor:trash', 60, 2, 40, 22, 0); prop('decor:puddle', 860, 130, 40, 30, 0);
  // cars (front faces +x; rot 2 = facing left)
  prop('car:sedan', 40, 36, 92, 44, 0, 1); prop('car:police', 180, 112, 94, 44, 2, 0); prop('car:pickup', 440, 34, 98, 46, 0, 0);
  prop('car:sedan_wreck', 560, 100, 92, 44, 2, 0); prop('car:van', 760, 108, 98, 46, 2, 1); prop('car:hatchback', 300, 40, 84, 42, 0, 2);

  // ---------------- house lot
  const hx = 30, hy = 220, hw = 440, hh = 300, T = 16, PT = 10;
  fillTiles('dirt', 470, 330, 90, 230);
  fillTiles('wood', hx, hy, 280, hh);
  fillTiles('tile', hx + 280, hy, hw - 280, 150);
  fillTiles('linoleum', hx + 280, hy + 150, hw - 280, hh - 150);
  // furniture (back edge = top for wall items, bed headboard = left)
  prop('furniture:sofa', hx + 40, hy + T + 2, 110, 42, 0, 0);
  prop('furniture:armchair', hx + 170, hy + T + 4, 40, 40, 0, 1);
  prop('furniture:table', hx + 80, hy + 120, 80, 56, 0, 0);
  prop('furniture:tv', hx + 60, hy + hh - T - 22, 70, 20, 2, 0);
  prop('furniture:bookshelf', hx + T + 2, hy + 150, 22, 80, 3, 0);
  prop('furniture:plant', hx + 230, hy + hh - T - 26, 22, 22, 0);
  prop('decor:blood', hx + 190, hy + 160, 36, 30, 0, 4);
  prop('furniture:fridge', hx + 290, hy + T + 2, 44, 40, 0, 0);
  prop('furniture:stove', hx + 338, hy + T + 2, 44, 40, 0, 0);
  prop('furniture:counter', hx + 386, hy + T + 2, 40, 34, 0, 0);
  prop('furniture:counter', hx + hw - T - 36, hy + 62, 34, 80, 1, 1);
  prop('furniture:toilet', hx + 300, hy + hh - T - 32, 26, 30, 2, 0);
  prop('furniture:tub', hx + 340, hy + hh - T - 42, 80, 40, 2, 1);
  prop('furniture:sink', hx + 300, hy + 160, 36, 24, 0, 0);
  prop('furniture:crate', hx + 230, hy + 200, 40, 40, 0, 3);
  // walls (brick exterior, drywall partitions) + windows + doors
  strip('wall_brick_h', hx, hy, hw, T, true); strip('wall_brick_h', hx, hy + hh - T, 200, T, true); strip('wall_brick_h', hx + 264, hy + hh - T, hw - 264, T, true);
  strip('wall_brick_v', hx, hy, T, hh, false); strip('wall_brick_v', hx + hw - T, hy, T, 120, false); strip('wall_brick_v', hx + hw - T, hy + 184, T, hh - 184, false);
  nine('window_h', hx + 330, hy + hh - T, 80, T, true);
  nine('window_v', hx, hy + 200, T, 70, false); nine('window_h', hx + 120, hy, 90, T, true);
  nine('door_frame_h', hx + 200, hy + hh - T, 64, T, true); nine('door_frame_v', hx + hw - T, hy + 120, T, 64, false);
  strip('wall_drywall_v', hx + 280, hy + T, PT, 90, false); strip('wall_drywall_v', hx + 280, hy + 166, PT, hh - 166 - T, false);
  strip('wall_drywall_h', hx + 280, hy + 150, hw - 280 - T, PT, true);
  for (const [x, y] of [[hx, hy], [hx + hw - T, hy], [hx, hy + hh - T], [hx + hw - T, hy + hh - T]]) g.drawImage(C.walls.wall_brick_cap, x * S, y * S, T * S, T * S);

  // ---------------- yard / nature / base bits
  prop('fence:wood', 480, 206, 400, 8, 0);
  prop('tree:oak_l', 560, 210, 124, 124, 0, 0);
  prop('tree:pine_m', 760, 330, 92, 92, 0, 1);
  prop('tree:oak_m', 820, 200, 92, 92, 0, 2);
  prop('tree:oak_s', 480, 470, 64, 64, 0, 1);
  prop('decor:bush', 700, 250, 30, 28, 0); prop('decor:bush', 720, 470, 30, 28, 0, 3);
  prop('rock:rock', 650, 400, 40, 32, 0); prop('decor:tuft', 600, 350, 22, 22, 0); prop('decor:tuft', 860, 460, 22, 22, 0, 2);
  prop('structure:wood_wall', 560, 500, 64, 16, 0); prop('structure:wood_door', 624, 500, 32, 16, 0); prop('structure:metal_wall', 656, 500, 64, 16, 0);
  prop('structure:barricade', 740, 520, 64, 16, 0);
  prop('structure:campfire', 600, 440, 32, 32, 0); prop('structure:workbench', 520, 380, 64, 32, 0);
  prop('structure:turret', 820, 420, 32, 32, 0); prop('structure:turret_head', 814, 414, 44, 44, 0);
  prop('drop:loot', 690, 450, 26, 18, 0); prop('drop:deathbag', 640, 470, 24, 24, 0);
  prop('furniture:dumpster', 420, 524, 60, 34, 0, 0);

  savePng(path, c);
  // half-size version = what the game shows at zoom 1
  const h = canvas(c.width / 2, c.height / 2);
  h.g.drawImage(c, 0, 0, c.width / 2, c.height / 2);
  savePng(path.replace('.png', '_zoom1.png'), h.c);
}
export type { Ctx };
