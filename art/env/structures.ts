// art/env/structures.ts — player-built base structures (atlas `structures`) + loot drops.
// Native sizes follow legacy STRUCTURES (world px, rot 0). Damaged variants for walls/doors/barricades.
import { type Ctx, type Rng, type Canvas } from '../lib/core';
import { TAU, rrPath, litFill, ellipse, blobPath, innerShadow } from '../lib/materials';
import { sprite, type Registry } from './prop';
import { woodBox, fabricBox, metalBox, plainBox, cushion, folds } from './furniture';

const A = 'structures';

function plank(g: Ctx, x: number, y: number, w: number, h: number, col: string, seed: number, R: Rng, nails = true) {
  woodBox(g, x, y, w, h, 1.5, col, seed, { lw: 1.2, bevel: 1.2, vertical: h > w });
  if (nails) for (const px of [x + 4, x + w - 5]) if (w > h) { g.fillStyle = '#2a2622'; g.beginPath(); g.arc(px, y + h / 2, 1.1, 0, TAU); g.fill(); g.fillStyle = 'rgba(200,200,190,0.5)'; g.fillRect(px - 0.6, y + h / 2 - 0.9, 0.8, 0.6); }
  void R;
}
function woodWall(damaged: boolean) {
  return (g: Ctx, W: number, H: number, R: Rng) => {
    // posts at the ends + horizontal planks (seen from above: plank edges stacked across the thickness)
    const n = 3, ph = (H - 2) / n;
    for (let i = 0; i < n; i++) {
      if (damaged && i === 1) {
        // broken plank: two splintered stubs
        plank(g, 6, 1 + i * ph, W * 0.35, ph - 0.8, '#6a5238', 9000 + i, R);
        plank(g, W * 0.62, 1 + i * ph, W * 0.38 - 6, ph - 0.8, '#6a5238', 9010 + i, R);
        g.fillStyle = '#8a7050'; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(W * 0.35 + 6, 1 + i * ph + k * ph / 4); g.lineTo(W * 0.35 + 6 + R.range(3, 8), 1 + i * ph + k * ph / 4 + 1); g.lineTo(W * 0.35 + 6, 1 + i * ph + (k + 1) * ph / 4); g.fill(); }
        continue;
      }
      plank(g, 4, 1 + i * ph, W - 8, ph - 0.8, ['#6a5238', '#5e4830', '#735a3e'][i], 9000 + i * 7 + (damaged ? 50 : 0), R);
    }
    for (const x of [0, W - 10]) woodBox(g, x, 0, 10, H, 2, '#4a3a28', 9020 + x, { lw: 1.4, vertical: true });
    if (damaged) { g.strokeStyle = 'rgba(10,8,6,0.6)'; g.lineWidth = 1; for (let k = 0; k < 3; k++) { const x = R.range(14, W - 14); g.beginPath(); g.moveTo(x, 2); g.lineTo(x + R.range(-6, 6), H - 2); g.stroke(); } }
  };
}
function metalWall(damaged: boolean) {
  return (g: Ctx, W: number, H: number, R: Rng) => {
    metalBox(g, 0, 0, W, H, 2, '#5c6062', 9100, { light: 0.25 });
    // corrugation across + weld seams + rivets + scrap patches
    g.save(); rrPath(g, 0, 0, W, H, 2); g.clip();
    for (let x = 0; x < W; x += 6) { g.fillStyle = 'rgba(255,255,250,0.1)'; g.fillRect(x, 0, 2, H); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 3.5, 0, 2, H); }
    const patches = [['#6a4a34', 0.2, 0.35], ['#4e5458', 0.6, 0.3]] as [string, number, number][];
    for (const [c, px, pw] of patches) { rrPath(g, W * px, 2, W * pw, H - 4, 1); litFill(g, W * px, 2, W * pw, H - 4, c, { lw: 1, light: 0.3, bevel: 1 }); for (let x = W * px + 3; x < W * (px + pw) - 2; x += 6) for (const y of [4, H - 4]) { g.fillStyle = '#9a9a92'; g.beginPath(); g.arc(x, y, 1, 0, TAU); g.fill(); } }
    for (let k = 0; k < 6; k++) { const x = R.range(4, W - 4), y = R.range(2, H - 2), gr = g.createRadialGradient(x, y, 0, x, y, 9); gr.addColorStop(0, 'rgba(110,60,30,0.5)'); gr.addColorStop(1, 'rgba(110,60,30,0)'); g.fillStyle = gr; g.fillRect(x - 9, y - 9, 18, 18); }
    if (damaged) { g.fillStyle = 'rgba(10,10,10,0.7)'; blobPath(g, W * 0.45, H / 2, 7, 4, R, 0.4); g.fill(); g.strokeStyle = 'rgba(200,200,190,0.5)'; g.lineWidth = 0.8; g.stroke(); for (let k = 0; k < 5; k++) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(R.range(6, W - 6), R.range(3, H - 3), 1.6, 0, TAU); g.fill(); } }
    g.restore();
    for (const x of [0, W - 8]) metalBox(g, x, -1, 8, H + 2, 1.5, '#3e4244', 9110 + x, {});
  };
}
function door(open: boolean, damaged = false) {
  return (g: Ctx, W: number, H: number, R: Rng) => {
    // jambs + leaf
    for (const x of [0, W - 6]) woodBox(g, x, 0, 6, H, 1.5, '#4a3a28', 9200 + x, { lw: 1.2, vertical: true });
    if (!open) {
      woodBox(g, 6, 2, W - 12, H - 4, 1, '#6e5438', 9210 + (damaged ? 3 : 0), { vertical: false });
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(8, H / 2); g.lineTo(W - 8, H / 2); g.stroke();
      // strap hinges + handle
      g.fillStyle = '#2e2e2c'; g.fillRect(7, 3, 8, 2.5); g.fillRect(7, H - 5.5, 8, 2.5);
      g.fillStyle = '#9a968a'; g.beginPath(); g.arc(W - 12, H / 2, 1.8, 0, TAU); g.fill();
      if (damaged) { g.strokeStyle = 'rgba(10,8,6,0.65)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(W * 0.5, 2); g.lineTo(W * 0.45, H / 2); g.lineTo(W * 0.55, H - 2); g.stroke(); }
    } else {
      // leaf swung 90° from the left jamb (extends into the pad area below)
      g.save(); g.translate(6, H / 2);
      woodBox(g, -2, 0, 6, W - 12, 1, '#6e5438', 9220, { vertical: true });
      g.restore();
      // threshold
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(6, H / 2 - 1, W - 12, 2);
    }
    void R;
  };
}
const barricade = (damaged: boolean) => (g: Ctx, W: number, H: number, R: Rng) => {
  // sawhorse X-frames + crossed planks + barbed wire
  for (const x of [8, W - 14]) { g.save(); g.translate(x + 3, H / 2); g.rotate(0.6); woodBox(g, -2.5, -H * 0.7, 5, H * 1.4, 1, '#4a3a28', 9300 + x, { lw: 1 }); g.rotate(-1.2); woodBox(g, -2.5, -H * 0.7, 5, H * 1.4, 1, '#4e3e2c', 9310 + x, { lw: 1 }); g.restore(); }
  const boards = damaged ? [[2, 3, 0.08], [W * 0.55, H - 10, -0.12]] : [[2, 3, 0.04], [2, H - 10, -0.05], [6, H / 2 - 3.5, 0.0]];
  for (const [x, y, a] of boards) { g.save(); g.translate(W / 2, y + 3.5); g.rotate(a); plank(g, -W / 2 + x, -3.5, damaged ? W * 0.45 : W - x * 2, 7, R.pick(['#6a5238', '#735a3e', '#5e4830']), 9320 + y, R); g.restore(); }
  // barbed wire coil
  g.strokeStyle = 'rgba(140,140,132,0.85)'; g.lineWidth = 0.8;
  g.beginPath(); for (let x = 2; x < W - 2; x += 1) { const y = H / 2 + Math.sin(x * 0.55) * (H * 0.38); if (x === 2) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
  for (let x = 6; x < W - 4; x += 9) { g.beginPath(); g.moveTo(x - 1.5, H / 2 - 1.5); g.lineTo(x + 1.5, H / 2 + 1.5); g.moveTo(x + 1.5, H / 2 - 1.5); g.lineTo(x - 1.5, H / 2 + 1.5); g.stroke(); }
};
const spikeTrap = (g: Ctx, W: number, H: number, R: Rng) => {
  // board with sharpened stakes + nails, dirt and blood stains
  woodBox(g, 2, 2, W - 4, H - 4, 2, '#5e4830', 9400, { vertical: false });
  for (let i = 1; i < 4; i++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(3, 2 + i * (H - 4) / 4, W - 6, 1); }
  const gr = g.createRadialGradient(W * 0.6, H * 0.55, 0, W * 0.6, H * 0.55, 18); gr.addColorStop(0, 'rgba(80,12,10,0.45)'); gr.addColorStop(1, 'rgba(80,12,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = 9 + i * (W - 18) / 3 + R.range(-2, 2), y = 9 + j * (H - 18) / 3 + R.range(-2, 2);
    // stake tip seen from above: pale sharpened cone with shadow down-right
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 7, y + 4); g.lineTo(x + 2, y + 6); g.fill();
    g.beginPath(); g.arc(x, y, 3.2, 0, TAU); const sg = g.createRadialGradient(x - 1, y - 1, 0, x, y, 3.2); sg.addColorStop(0, '#d8c8a0'); sg.addColorStop(1, '#6a5238'); g.fillStyle = sg; g.fill();
    g.fillStyle = '#9a9a92'; g.fillRect(x + 4, y - 4, 1.2, 1.2);
  }
};
const campfire = (g: Ctx, W: number, H: number, R: Rng) => {
  const c = W / 2;
  const gr = g.createRadialGradient(c, c, 0, c, c, c * 0.8); gr.addColorStop(0, '#2a1a10'); gr.addColorStop(0.5, '#1e1612'); gr.addColorStop(1, '#2e2a26');
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, c * 0.8, 0, TAU); g.fill();
  // embers glow under the logs
  const eg = g.createRadialGradient(c, c, 0, c, c, c * 0.45); eg.addColorStop(0, 'rgba(255,140,50,0.65)'); eg.addColorStop(1, 'rgba(160,50,20,0)'); g.fillStyle = eg; g.beginPath(); g.arc(c, c, c * 0.45, 0, TAU); g.fill();
  // teepee logs
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; g.save(); g.translate(c, c); g.rotate(a); woodBox(g, 2, -3, c * 0.75, 6, 3, '#4a3624', 9500 + i, { lw: 1, vertical: false }); g.fillStyle = 'rgba(20,14,10,0.6)'; g.fillRect(2, -3, 8, 6); ellipse(g, c * 0.75, 0, 2.6, 3, '#9a7a50', { lw: 0.8 }); g.restore(); }
  // stone ring
  const n = 10;
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU, x = c + Math.cos(a) * c * 0.84, y = c + Math.sin(a) * c * 0.84; blobPath(g, x, y, 5.5, 4.5, R, 0.2, 8, a); litFill(g, x - 6, y - 6, 12, 12, R.pick(['#6a6760', '#5a5750', '#77736a']), { radial: true, light: 0.35, lw: 1 }); }
};
const turretBase = (g: Ctx, W: number, H: number, R: Rng) => {
  // sandbag ring + steel base plate + slewing ring
  const c = W / 2, n = 9;
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; g.save(); g.translate(c + Math.cos(a) * c * 0.72, c + Math.sin(a) * c * 0.72); g.rotate(a + Math.PI / 2); fabricBox(g, -8, -5, 16, 10, 5, R.pick(['#5e5a40', '#666046', '#58543c']), 9600 + i, { light: 0.25, lw: 1 }); g.restore(); }
  g.beginPath(); g.arc(c, c, c * 0.5, 0, TAU); litFill(g, c - c * 0.5, c - c * 0.5, c, c, '#4a4e50', { radial: true, light: 0.3, lw: 1.5 });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.fillStyle = '#8a8c88'; g.beginPath(); g.arc(c + Math.cos(a) * c * 0.42, c + Math.sin(a) * c * 0.42, 1.2, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.beginPath(); g.arc(c, c, c * 0.3, 0, TAU); g.stroke();
};
const turretHead = (g: Ctx, W: number, H: number) => {
  // FACES RIGHT. pivot = sprite centre. receiver box + barrel + shroud + ammo box + sensor
  const cy = H / 2, px = W / 2;
  metalBox(g, px - 12, cy - 8, 22, 16, 3, '#3e4446', 9700, { light: 0.3 });
  rrPath(g, px + 8, cy - 3.5, W / 2 - 10, 7, 2); litFill(g, px + 8, cy - 3.5, W / 2 - 10, 7, '#2a2e30', { light: 0.35, lw: 1.2 });
  g.fillStyle = 'rgba(0,0,0,0.45)'; for (let x = px + 12; x < px + W / 2 - 10; x += 4) g.fillRect(x, cy - 3, 1.5, 6);
  rrPath(g, W - 6, cy - 2.5, 5, 5, 1); litFill(g, W - 6, cy - 2.5, 5, 5, '#1e2022', { lw: 1 });
  metalBox(g, px - 10, cy + 6, 14, 9, 1.5, '#4e5438', 9710, {});
  ellipse(g, px - 2, cy - 5, 3, 3, '#7a2a24', { light: 0.6, lw: 0.8 });
  g.fillStyle = 'rgba(255,255,240,0.25)'; g.fillRect(px - 10, cy - 7, 18, 1.2);
};
const bedStruct = (g: Ctx, W: number, H: number, R: Rng) => {
  // makeshift bed: pallet frame, stained mattress, pillow (head at TOP), blanket
  for (let y = 0; y < H; y += H / 6) woodBox(g, 0, y + 0.5, W, H / 6 - 1.5, 1, '#6a5a42', 9800 + y, { lw: 1, vertical: false });
  fabricBox(g, 2, 2, W - 4, H - 4, 4, '#8a8674', 9810, { light: 0.2, lw: 1.2 });
  cushion(g, 5, 4, W - 10, 13, 5, '#a29e8e', 9811, R, 1);
  fabricBox(g, 2, H * 0.38, W - 4, H * 0.6, 3, '#4a5240', 9812, { light: 0.18, lw: 1.2 });
  g.save(); rrPath(g, 2, H * 0.38, W - 4, H * 0.6, 3); g.clip(); folds(g, 2, H * 0.38, W - 4, H * 0.6, R, 4, 0.25); g.restore();
  rrPath(g, 2, H * 0.36, W - 4, 6, 2); litFill(g, 2, H * 0.36, W - 4, 6, '#5a6250', { light: 0.3, lw: 1 });
};
const stash = (g: Ctx, W: number, H: number, R: Rng) => {
  woodBox(g, 0, 0, W, H, 2, '#5e4830', 9900, { vertical: false });
  for (let i = 1; i < 4; i++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(2, (H / 4) * i, W - 4, 1.2); }
  for (const x of [6, W - 10]) metalBox(g, x, 0, 4, H, 1, '#3a3c3a', 9910 + x, {});
  rrPath(g, W / 2 - 5, H - 8, 10, 7, 1.5); litFill(g, W / 2 - 5, H - 8, 10, 7, '#8a7a4a', { lw: 1, light: 0.4 });
  g.fillStyle = '#2a2622'; g.fillRect(W / 2 - 1, H - 6, 2, 3);
  void R;
};
const workbench = (g: Ctx, W: number, H: number, R: Rng) => {
  woodBox(g, 0, 0, W, H, 2, '#6a5236', 9950, { vertical: false });
  // pegboard back rail with hanging tools
  woodBox(g, 0, 0, W, 6, 1, '#4a3a28', 9951, { lw: 1 });
  // vise at the right end
  metalBox(g, W - 18, H * 0.25, 16, 12, 2, '#3a5a6a', 9952, {}); g.fillStyle = '#9a9a92'; g.fillRect(W - 4, H * 0.25 + 4, 6, 3);
  // tools: hammer, saw, wrench, scattered nails, pieces of scrap
  g.save(); g.translate(W * 0.3, H * 0.55); g.rotate(-0.3); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-11, 0, 24, 4); woodBox(g, -12, -1.5, 18, 3.5, 1, '#8a6a40', 9953, { lw: 0.8, bevel: 0.5 }); metalBox(g, 5, -4.5, 5, 9, 1, '#5a5c5e', 9954, {}); g.restore();
  g.save(); g.translate(W * 0.55, H * 0.5); g.rotate(0.15); g.beginPath(); g.moveTo(-12, -4); g.lineTo(10, -2); g.lineTo(10, 2); g.lineTo(-12, 4); g.closePath(); litFill(g, -12, -4, 22, 8, '#9a9c9a', { lw: 0.8, light: 0.4 }); woodBox(g, 10, -3.5, 7, 7, 2, '#5a3a24', 9955, { lw: 0.8 }); g.restore();
  for (let i = 0; i < 8; i++) { g.fillStyle = '#a0a098'; g.fillRect(R.range(10, W * 0.7), R.range(H * 0.4, H - 4), 2.5, 0.8); }
  rrPath(g, W * 0.08, H * 0.4, 10, 8, 1); litFill(g, W * 0.08, H * 0.4, 10, 8, '#6a4a34', { lw: 0.8 });
};
const bag = (g: Ctx, W: number, H: number, R: Rng) => {
  // duffel bag: olive canvas, zipper, straps
  fabricBox(g, 0, 2, W, H - 4, H * 0.42, '#4e5234', 9960, { light: 0.25, dark: 0.4, lw: 1.5 });
  g.save(); rrPath(g, 0, 2, W, H - 4, H * 0.42); g.clip(); folds(g, 0, 2, W, H - 4, R, 4, 0.3); g.restore();
  g.strokeStyle = '#2a2a22'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(5, H / 2); g.lineTo(W - 5, H / 2); g.stroke();
  g.strokeStyle = '#8a8a7e'; g.lineWidth = 0.8; g.setLineDash([1.5, 1]); g.beginPath(); g.moveTo(5, H / 2); g.lineTo(W - 5, H / 2); g.stroke(); g.setLineDash([]);
  for (const x of [W * 0.3, W * 0.65]) { rrPath(g, x, 0, 4, H, 1.5); litFill(g, x, 0, 4, H, '#2e2e26', { lw: 0.8, bevel: 0.5 }); }
  ellipse(g, W - 6, H / 2, 2, 2, '#a8a294', { lw: 0.6 });
};
const deathbag = (g: Ctx, W: number, H: number, R: Rng) => {
  // the player's backpack, dropped on death, with a red tag + blood
  const gr = g.createRadialGradient(W * 0.6, H * 0.6, 0, W * 0.6, H * 0.6, W * 0.6); gr.addColorStop(0, 'rgba(80,12,10,0.5)'); gr.addColorStop(1, 'rgba(80,12,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  fabricBox(g, 3, 3, W - 6, H - 6, 8, '#4a4232', 9970, { light: 0.25, dark: 0.4, lw: 1.5 });
  cushion(g, 7, H * 0.5, W - 14, H * 0.38, 5, '#3e3828', 9971, R, 1); // front pocket
  rrPath(g, 6, 5, W - 12, H * 0.32, 5); litFill(g, 6, 5, W - 12, H * 0.32, '#3a3428', { light: 0.3, lw: 1 }); // lid
  for (const x of [W * 0.3, W * 0.62]) { rrPath(g, x, H * 0.2, 3.5, H * 0.6, 1); litFill(g, x, H * 0.2, 3.5, H * 0.6, '#22201a', { lw: 0.6, bevel: 0.4 }); }
  // red tag on a cord
  g.strokeStyle = '#c8c0a8'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(W * 0.7, H * 0.25); g.lineTo(W - 3, 4); g.stroke();
  g.save(); g.translate(W - 4, 4); g.rotate(0.5); rrPath(g, -4, -3, 9, 6, 1); litFill(g, -4, -3, 9, 6, '#b0261e', { lw: 0.8, light: 0.4 }); g.fillStyle = '#e8e0d0'; g.beginPath(); g.arc(-2, 0, 0.9, 0, TAU); g.fill(); g.restore();
};

export interface StructSprites { [key: string]: Canvas }
export function buildStructures(reg: Registry): StructSprites {
  const out: StructSprites = {};
  const add = (key: string, frame: string, w: number, h: number, draw: (g: Ctx, W: number, H: number, R: Rng) => void, elev: number, e: any = {}, atlas = A) => {
    const s = sprite(w, h, draw, { elev, seed: frame.length * 97 + w });
    reg.add(key, atlas, frame, [s], { single: true, fit: 'stretch', nativeSize: [w, h], orient: w >= h ? 'h' : 'v', ...e });
    out[frame] = s.canvas;
    return s;
  };
  add('structure:bed', 'struct_bed', 32, 64, bedStruct, 3, { back: 'n' });
  add('structure:stash', 'struct_stash', 32, 32, stash, 6, { back: 'n' });
  add('structure:workbench', 'struct_workbench', 64, 32, workbench, 5, { back: 'n' });
  add('structure:wood_wall', 'struct_wood_wall', 64, 16, woodWall(false), 9);
  add('structure:wood_wall_damaged', 'struct_wood_wall_damaged', 64, 16, woodWall(true), 9);
  add('structure:metal_wall', 'struct_metal_wall', 64, 16, metalWall(false), 9);
  add('structure:metal_wall_damaged', 'struct_metal_wall_damaged', 64, 16, metalWall(true), 9);
  add('structure:wood_door', 'struct_wood_door', 32, 16, door(false), 8);
  add('structure:wood_door_damaged', 'struct_wood_door_damaged', 32, 16, door(false, true), 8);
  add('structure:wood_door_open', 'struct_wood_door_open', 32, 16, door(true), 8);
  add('structure:barricade', 'struct_barricade', 64, 16, barricade(false), 4);
  add('structure:barricade_damaged', 'struct_barricade_damaged', 64, 16, barricade(true), 4);
  add('structure:spike_trap', 'struct_spike_trap', 32, 32, spikeTrap, 2);
  add('structure:campfire', 'struct_campfire', 32, 32, campfire, 2, { note: 'base only; overlay fx fire_* at the centre' });
  add('structure:turret', 'struct_turret_base', 32, 32, turretBase, 4, { head: 'struct_turret_head' });
  add('structure:turret_base', 'struct_turret_base', 32, 32, turretBase, 4);
  add('structure:turret_head', 'struct_turret_head', 44, 44, turretHead, 5, { fit: 'contain', orient: 'any', pivot: [22, 22], facing: 'right', note: 'rotate by structure.aim around pivot (world px in body rect)' });
  add('drop:loot', 'drop_bag', 26, 18, bag, 3, { orient: 'any' });
  add('drop:deathbag', 'drop_deathbag', 24, 24, deathbag, 3, { orient: 'any' });
  // aliases: drop sprites addressed by the spec names
  reg.alias('drop:bag', 'drop:loot');
  void plainBox; void innerShadow;
  return out;
}
