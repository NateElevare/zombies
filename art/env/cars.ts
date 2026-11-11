// art/env/cars.ts — top-down vehicles, FRONT FACING RIGHT (+x). Glossy paint, glass with reflections,
// roof panels, light bars; every type in several paints plus a burnt-out wreck.
import { type Ctx, type Rng } from '../lib/core';
import { TAU, rrPath, litFill, texRect, noiseShader, fabricShader, pnoise, ellipse, C, css } from '../lib/materials';
import { sprite, type Registry } from './prop';

const A = 'env_props2';

interface Spec {
  w: number; h: number; elev: number;
  /** fractions of length along x (0 = rear, 1 = front) */
  rearGlass?: [number, number]; roof?: [number, number]; wind?: [number, number];
  front: number; rear: number; // corner radii (px)
  kind: 'car' | 'pickup' | 'van' | 'box' | 'mil' | 'humvee' | 'ambulance';
  paints: string[];
}
const S: Record<string, Spec> = {
  sedan: { w: 92, h: 44, elev: 6, kind: 'car', rearGlass: [0.2, 0.3], roof: [0.3, 0.56], wind: [0.56, 0.7], front: 16, rear: 12, paints: ['#6e2a26', '#2b4560', '#55575a', '#7d7046', '#8d8c84', '#262626'] },
  hatchback: { w: 84, h: 42, elev: 6, kind: 'car', rearGlass: [0.07, 0.16], roof: [0.16, 0.52], wind: [0.52, 0.67], front: 16, rear: 10, paints: ['#3b5536', '#5b2f3d', '#74552a', '#66676c', '#a8a69e'] },
  pickup: { w: 98, h: 46, elev: 7, kind: 'pickup', rearGlass: [0.4, 0.43], roof: [0.43, 0.57], wind: [0.57, 0.68], front: 12, rear: 5, paints: ['#2b4560', '#7d7046', '#463a55', '#55575a', '#6e2a26'] },
  van: { w: 98, h: 46, elev: 9, kind: 'van', roof: [0.04, 0.76], wind: [0.76, 0.86], front: 14, rear: 6, paints: ['#a8a69e', '#66676c', '#2b4560', '#74552a', '#3b5536'] },
  police: { w: 94, h: 44, elev: 6, kind: 'car', rearGlass: [0.2, 0.3], roof: [0.3, 0.56], wind: [0.56, 0.7], front: 16, rear: 12, paints: ['police', 'police_w', 'police', 'police_w'] },
  ambulance: { w: 112, h: 50, elev: 10, kind: 'ambulance', wind: [0.76, 0.84], front: 12, rear: 4, paints: ['#b4b2aa', '#a8a69c', '#b0aea2', '#9e9c94'] },
  box_truck: { w: 130, h: 52, elev: 12, kind: 'box', wind: [0.8, 0.88], front: 10, rear: 3, paints: ['#3e4a52', '#6e2a26', '#a8a69e', '#55575a'] },
  military_truck: { w: 140, h: 56, elev: 12, kind: 'mil', wind: [0.8, 0.88], front: 8, rear: 3, paints: ['#4a5236', '#3e4630', '#565a40', '#5a5640'] },
  humvee: { w: 100, h: 48, elev: 8, kind: 'humvee', roof: [0.26, 0.6], wind: [0.6, 0.66], front: 7, rear: 6, paints: ['#4a5236', '#6e664a', '#3e4630', '#565a40'] },
};

function glass(g: Ctx, path: () => void, x0: number, y0: number, x1: number, y1: number, broken = false) {
  path();
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, '#5a6e78'); gr.addColorStop(0.45, '#25323a'); gr.addColorStop(1, '#141c22');
  g.fillStyle = gr; g.fill();
  g.save(); path(); g.clip();
  // sky reflection streaks
  g.fillStyle = 'rgba(220,235,240,0.28)';
  const w = x1 - x0, h = y1 - y0;
  g.beginPath(); g.moveTo(x0 + w * 0.15, y0); g.lineTo(x0 + w * 0.45, y0); g.lineTo(x0 + w * 0.15, y1); g.lineTo(x0 - w * 0.15, y1); g.fill();
  g.fillStyle = 'rgba(220,235,240,0.12)';
  g.beginPath(); g.moveTo(x0 + w * 0.55, y0); g.lineTo(x0 + w * 0.65, y0); g.lineTo(x0 + w * 0.4, y1); g.lineTo(x0 + w * 0.3, y1); g.fill();
  if (broken) {
    g.strokeStyle = 'rgba(230,240,240,0.55)'; g.lineWidth = 0.7;
    const cx = x0 + w * 0.6, cy = y0 + h * 0.4;
    for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU + 0.3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * h * 0.5); g.stroke(); }
    g.beginPath(); g.arc(cx, cy, 3, 0, TAU); g.stroke();
  }
  g.restore();
  path(); g.strokeStyle = 'rgba(10,12,14,0.8)'; g.lineWidth = 1.4; g.stroke();
}
function trap(g: Ctx, x0: number, x1: number, yIn0: number, yIn1: number, yOut0: number, yOut1: number) {
  // quad from x0 (narrow, inset yIn) to x1 (wide, yOut) with slightly curved ends
  return () => {
    g.beginPath(); g.moveTo(x0, yIn0); g.quadraticCurveTo(x0 - 2, (yIn0 + yIn1) / 2, x0, yIn1);
    g.lineTo(x1, yOut1); g.quadraticCurveTo(x1 + 3, (yOut0 + yOut1) / 2, x1, yOut0); g.closePath();
  };
}
function paintFill(g: Ctx, x: number, y: number, w: number, h: number, base: string, seed: number, wreck: boolean) {
  // convex body: lighter along the spine, darker toward the sides, plus top-left key light & metallic flake
  litFill(g, x, y, w, h, base, {
    light: wreck ? 0.05 : 0.2, dark: 0.3, bevel: 2.5, outline: 'rgba(12,12,12,0.85)', lw: 2,
    paint: (q) => {
      texRect(q, x, y, w, h, noiseShader(base, seed, wreck ? 5 : 12, wreck ? 0.25 : 0.05, wreck ? 0.12 : 0.04));
      const sg = q.createLinearGradient(0, y, 0, y + h);
      sg.addColorStop(0, 'rgba(0,0,0,0.32)'); sg.addColorStop(0.18, 'rgba(255,255,255,0.03)'); sg.addColorStop(0.38, 'rgba(255,255,250,0.12)');
      sg.addColorStop(0.62, 'rgba(0,0,0,0.0)'); sg.addColorStop(0.85, 'rgba(0,0,0,0.18)'); sg.addColorStop(1, 'rgba(0,0,0,0.45)');
      q.fillStyle = sg; q.fillRect(x, y, w, h);
    },
  });
}
function specular(g: Ctx, x0: number, x1: number, y: number, a = 0.35) {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,250,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(x0, y, x1 - x0, 1.6);
}
function wheels(g: Ctx, W: number, H: number, xs: number[], wreck: boolean, wide = 1) {
  for (const fx of xs) for (const side of [0, 1]) {
    const tw = 15 * wide, th = 5, x = fx * W - tw / 2, y = side ? H - th + 2 : -2;
    rrPath(g, x, y, tw, th, 2); g.fillStyle = wreck ? '#2a2420' : '#141414'; g.fill();
    if (!wreck) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 2, y + (side ? th - 1.5 : 0.5), tw - 4, 1); }
    else { g.fillStyle = '#4a3a2e'; g.fillRect(x + 3, y + 1, tw - 6, th - 2); }
  }
}
function lights(g: Ctx, W: number, H: number, inset: number, wreck: boolean) {
  for (const y of [inset, H - inset - 5]) {
    // headlights (front = right)
    rrPath(g, W - 5, y, 4, 5, 1.5); g.fillStyle = wreck ? '#1a1612' : '#d8d4bc'; g.fill();
    if (!wreck) { g.fillStyle = 'rgba(255,255,230,0.6)'; g.fillRect(W - 4, y + 1, 1.5, 2); }
    // tail lights
    rrPath(g, 1, y, 3, 5, 1); g.fillStyle = wreck ? '#1a1612' : '#7a1c18'; g.fill();
  }
}
function mirrors(g: Ctx, x: number, H: number, col: string) {
  for (const [y, s] of [[0, -1], [H, 1]] as [number, number][]) {
    g.save(); g.translate(x, y + s * 1.5);
    rrPath(g, -3, -2.5, 6, 5, 2); litFill(g, -3, -2.5, 6, 5, col, { lw: 1, bevel: 0.6 });
    g.restore();
  }
}
function interior(g: Ctx, x0: number, x1: number, H: number, inset: number) {
  // burnt-out cabin: black void, seat frames and springs
  rrPath(g, x0, inset, x1 - x0, H - inset * 2, 4); g.fillStyle = '#0e0c0a'; g.fill();
  g.strokeStyle = 'rgba(110,90,70,0.6)'; g.lineWidth = 1;
  const seatW = (x1 - x0) * 0.3;
  for (const sx of [x0 + (x1 - x0) * 0.55, x0 + (x1 - x0) * 0.15]) for (const y of [inset + 3, H / 2 + 1]) {
    g.strokeRect(sx, y, seatW, H / 2 - inset - 4);
    for (let k = 2; k < seatW; k += 3) { g.beginPath(); g.moveTo(sx + k, y + 1); g.lineTo(sx + k, y + H / 2 - inset - 5); g.stroke(); }
  }
  // steering wheel ring
  g.strokeStyle = 'rgba(90,80,70,0.7)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x0 + (x1 - x0) * 0.82, inset + (H / 2 - inset) * 0.55 + 2, 4.5, 0, TAU); g.stroke();
}
function soot(g: Ctx, W: number, H: number, R: Rng, path: () => void) {
  g.save(); path(); g.clip();
  for (let k = 0; k < 14; k++) {
    const x = R.range(0, W), y = R.range(0, H), r = R.range(6, 22);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const rust = R.chance(0.45);
    gr.addColorStop(0, rust ? 'rgba(110,56,28,0.55)' : 'rgba(8,6,4,0.6)'); gr.addColorStop(1, rust ? 'rgba(110,56,28,0)' : 'rgba(8,6,4,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // flaking paint speckle
  const n = pnoise(R.int(0, 1e6), 4);
  texRect(g, 0, 0, W, H, (x, y) => [0, 0, 0, n(x, y) > 0.62 ? 60 : 0]);
  g.restore();
}

function drawVehicle(type: string, sp: Spec, paint: string, wreck: boolean, seed: number) {
  return (g: Ctx, W: number, H: number, R: Rng) => {
    const police = paint.startsWith('police');
    const base = wreck ? R.pick(['#2a2622', '#3a2e26', '#33302c']) : police ? '#1e2022' : paint;
    const taper = sp.kind === 'car' ? 0.06 : sp.kind === 'pickup' || sp.kind === 'van' ? 0.035 : 0.012;
    const bodyPath = () => carBody(g, W, H, sp.rear, sp.front, taper);
    const wx = sp.kind === 'mil' || sp.kind === 'box' ? [0.12, 0.3, 0.85] : sp.kind === 'ambulance' ? [0.18, 0.84] : [0.2, 0.8];
    wheels(g, W, H, wx, wreck, sp.kind === 'humvee' || sp.kind === 'mil' ? 1.3 : 1);
    bodyPath(); paintFill(g, 0, 0, W, H, base, seed, wreck);
    const inset = Math.round(H * 0.12);
    if (!wreck) { g.save(); bodyPath(); g.clip(); g.strokeStyle = 'rgba(255,255,245,0.16)'; g.lineWidth = 1; g.beginPath(); g.moveTo(6, H * 0.09); g.bezierCurveTo(W * 0.3, H * 0.06, W * 0.7, H * 0.06, W - 6, H * 0.1); g.stroke(); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(6, H * 0.91); g.bezierCurveTo(W * 0.3, H * 0.94, W * 0.7, H * 0.94, W - 6, H * 0.9); g.stroke(); g.restore(); }
    // panel seams / hood lines
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;

    if (sp.kind === 'car') {
      const [r0, r1] = sp.rearGlass!, [f0, f1] = sp.roof!, [w0, w1] = sp.wind!;
      // police: white doors / roof band
      if (police && !wreck) {
        g.save(); bodyPath(); g.clip();
        const white = paint === 'police_w' ? '#b8b8b0' : '#a9aaa4';
        g.fillStyle = white; g.fillRect(W * (r0 - 0.02), 0, W * (w1 - r0 + 0.04), H);
        const sg = g.createLinearGradient(0, 0, 0, H); sg.addColorStop(0, 'rgba(0,0,0,0.3)'); sg.addColorStop(0.4, 'rgba(255,255,255,0.1)'); sg.addColorStop(1, 'rgba(0,0,0,0.4)');
        g.fillStyle = sg; g.fillRect(0, 0, W, H); g.restore();
        bodyPath(); g.strokeStyle = 'rgba(12,12,12,0.85)'; g.lineWidth = 2; g.stroke();
      }
      // hood creases
      g.beginPath(); g.moveTo(W * w1 + 4, H * 0.3); g.quadraticCurveTo(W * 0.85, H * 0.28, W - 6, H * 0.32); g.moveTo(W * w1 + 4, H * 0.7); g.quadraticCurveTo(W * 0.85, H * 0.72, W - 6, H * 0.68); g.stroke();
      g.beginPath(); g.moveTo(W * r0 - 2, inset); g.lineTo(W * r0 - 2, H - inset); g.stroke(); // trunk seam
      if (wreck) interior(g, W * r0, W * w1, H, inset - 1);
      else {
        // one glass greenhouse (rear glass + side windows + windshield), roof panel laid over it
        glass(g, () => greenhouse(g, W, H, W * r0, W * r1, W * w0, W * w1, 0.13, 0.17), W * r0, H * 0.13, W * w1, H * 0.87, R.chance(0.12));
        const ri = H * 0.215;
        rrPath(g, W * f0 + 2, ri, W * (f1 - f0) - 4, H - ri * 2, 6); litFill(g, W * f0 + 2, ri, W * (f1 - f0) - 4, H - ri * 2, police ? (paint === 'police_w' ? '#c2c2ba' : '#b4b5ae') : base, { light: 0.28, dark: 0.25, bevel: 1.5, lw: 1, outline: 'rgba(0,0,0,0.35)', paint: (q) => texRect(q, W * f0, inset + 2, W * (f1 - f0), H - inset * 2 - 4, noiseShader(police ? '#b4b5ae' : base, seed + 3, 12, 0.04, 0.03)) });
        specular(g, W * f0 + 4, W * f1 - 4, inset + 5, 0.45);
        if (police) {
          // light bar: chrome housing with red / blue lenses
          const lx = W * (f0 + (f1 - f0) * 0.62), lw = 7;
          g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(lx + 1.5, inset + 3, lw, H - inset * 2 - 4);
          rrPath(g, lx, inset + 2, lw, H - inset * 2 - 4, 2); litFill(g, lx, inset + 2, lw, H - inset * 2 - 4, '#3a3c3e', { lw: 1, bevel: 0.5 });
          const hh = (H - inset * 2 - 8) / 2;
          rrPath(g, lx + 1, inset + 4, lw - 2, hh - 1, 1.5); g.fillStyle = '#b8302a'; g.fill();
          rrPath(g, lx + 1, inset + 4 + hh + 1, lw - 2, hh - 1, 1.5); g.fillStyle = '#2a4aa8'; g.fill();
          g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(lx + 1.5, inset + 5, 1.5, hh - 3); g.fillRect(lx + 1.5, inset + 5 + hh + 1, 1.5, hh - 3);
          // unit number on the roof
          g.fillStyle = 'rgba(20,20,22,0.75)'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center';
          g.save(); g.translate(W * (f0 + (f1 - f0) * 0.3), H / 2); g.rotate(-Math.PI / 2); g.fillText(String(R.int(10, 99)), 0, 3.5); g.restore();
          // push bar
          g.fillStyle = '#1a1a1a'; g.fillRect(W - 3, H * 0.25, 4, H * 0.5);
        }
        specular(g, W * w1 + 6, W - 10, H * 0.36, 0.25);
        specular(g, 8, W * r0 - 4, H * 0.36, 0.2);
      }
      mirrors(g, W * w0 + 2, H, police ? '#1e2022' : base);
    } else if (sp.kind === 'pickup') {
      const [r0, r1] = sp.rearGlass!, [f0, f1] = sp.roof!, [w0, w1] = sp.wind!;
      // bed: open cargo box with ribs and tailgate
      const bx0 = 4, bx1 = W * 0.38;
      rrPath(g, bx0, inset - 2, bx1 - bx0, H - inset * 2 + 4, 2); g.fillStyle = wreck ? '#14100c' : '#1e2022'; g.fill();
      g.save(); rrPath(g, bx0, inset - 2, bx1 - bx0, H - inset * 2 + 4, 2); g.clip();
      for (let y = inset + 2; y < H - inset; y += 5) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(bx0, y, bx1 - bx0, 1.5); }
      g.restore();
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5; g.strokeRect(bx0, inset - 2, bx1 - bx0, H - inset * 2 + 4);
      if (!wreck && R.chance(0.6)) { for (let k = 0; k < 3; k++) { const x = R.range(bx0 + 4, bx1 - 18), y = R.range(inset + 2, H - inset - 14); rrPath(g, x, y, 14, 11, 1); litFill(g, x, y, 14, 11, R.pick(['#6a5a44', '#4a4c44', '#2e4a3e']), { lw: 1, bevel: 1 }); } }
      if (wreck) interior(g, W * r0, W * w1, H, inset - 1);
      else {
        glass(g, () => greenhouse(g, W, H, W * r0, W * r1, W * w0, W * w1, 0.13, 0.17), W * r0, H * 0.13, W * w1, H * 0.87);
        const ri = H * 0.215;
        rrPath(g, W * f0, ri, W * (f1 - f0), H - ri * 2, 4); litFill(g, W * f0, ri, W * (f1 - f0), H - ri * 2, base, { light: 0.28, lw: 1, outline: 'rgba(0,0,0,0.35)', bevel: 1.5 });
        specular(g, W * f0 + 2, W * f1 - 2, inset + 5, 0.45);
        specular(g, W * w1 + 6, W - 10, H * 0.36, 0.25);
      }
      g.beginPath(); g.moveTo(W * w1 + 4, H * 0.3); g.lineTo(W - 6, H * 0.3); g.moveTo(W * w1 + 4, H * 0.7); g.lineTo(W - 6, H * 0.7); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; g.stroke();
      mirrors(g, W * w0 + 2, H, base);
    } else if (sp.kind === 'van' || sp.kind === 'ambulance' || sp.kind === 'box') {
      const [w0, w1] = sp.wind!;
      const boxEnd = sp.kind === 'van' ? w0 : w0 - 0.04;
      if (wreck) interior(g, W * (boxEnd - 0.02), W * w1, H, inset - 1);
      else glass(g, trap(g, W * w1, W * w0, inset + 4, H - inset - 4, inset, H - inset), W * w0, inset, W * w1, H - inset, R.chance(0.15));
      // roof (box) panel
      const rx0 = 3, rx1 = W * boxEnd;
      const roofCol = sp.kind === 'box' && !wreck ? '#9a9c98' : base;
      rrPath(g, rx0, 3, rx1 - rx0, H - 6, 4);
      litFill(g, rx0, 3, rx1 - rx0, H - 6, roofCol, { light: 0.22, lw: 1.5, bevel: 2, paint: (q) => texRect(q, rx0, 3, rx1 - rx0, H - 6, noiseShader(roofCol, seed + 9, wreck ? 5 : 14, wreck ? 0.25 : 0.04, 0.03)) });
      if (sp.kind === 'box' || sp.kind === 'van') {
        // roof ribs
        for (let x = rx0 + 10; x < rx1 - 6; x += sp.kind === 'box' ? 9 : 14) {
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 1.5, 5, 1.5, H - 10);
          g.fillStyle = 'rgba(255,255,250,0.12)'; g.fillRect(x, 5, 1.5, H - 10);
        }
      }
      if (sp.kind === 'ambulance' && !wreck) {
        // red stripe band + star of life + light bars + AC unit
        g.fillStyle = '#8a2a24'; g.fillRect(rx0, 4, rx1 - rx0, 4); g.fillRect(rx0, H - 8, rx1 - rx0, 4);
        g.fillStyle = '#8a2a24'; g.fillRect(W * 0.86, 3, W * 0.1, 3); g.fillRect(W * 0.86, H - 6, W * 0.1, 3);
        const cx = W * 0.3, cy = H / 2;
        g.save(); g.translate(cx, cy); g.fillStyle = '#2a4a8a';
        for (let k = 0; k < 3; k++) { g.rotate(Math.PI / 3); g.fillRect(-3, -10, 6, 20); }
        g.fillStyle = '#c8c8c0'; g.fillRect(-0.8, -6, 1.6, 12); g.restore();
        metalBox(g, W * 0.48, H * 0.3, 18, H * 0.4, '#8a8c88', seed + 4);
        for (const y of [5, H - 11]) for (const x of [rx0 + 2, rx1 - 12]) { rrPath(g, x, y, 10, 6, 2); g.fillStyle = (x < W / 2) === (y < H / 2) ? '#b8302a' : '#c8b8a0'; g.fill(); }
        rrPath(g, rx1 - 6, H * 0.2, 6, H * 0.6, 2); g.fillStyle = '#3a3c3e'; g.fill();
        g.fillStyle = '#b8302a'; g.fillRect(rx1 - 5, H * 0.22, 4, H * 0.27); g.fillStyle = '#2a4aa8'; g.fillRect(rx1 - 5, H * 0.51, 4, H * 0.27);
      }
      if (sp.kind === 'van' && !wreck) {
        // roof rack w/ ladder or a roof vent
        if (R.chance(0.5)) { g.strokeStyle = '#2a2c2e'; g.lineWidth = 2; g.strokeRect(W * 0.2, inset, W * 0.45, H - inset * 2); for (let x = W * 0.25; x < W * 0.65; x += 8) { g.beginPath(); g.moveTo(x, inset); g.lineTo(x, H - inset); g.stroke(); } }
        else { rrPath(g, W * 0.4, H * 0.35, 14, H * 0.3, 2); litFill(g, W * 0.4, H * 0.35, 14, H * 0.3, '#8a8c88', { lw: 1 }); }
      }
      specular(g, 10, rx1 - 10, 7, 0.3);
      mirrors(g, W * w0 + 2, H, base);
    } else if (sp.kind === 'mil') {
      const [w0, w1] = sp.wind!;
      // cab + windshield
      if (wreck) interior(g, W * 0.72, W * w1, H, inset);
      else glass(g, trap(g, W * w1, W * w0, inset + 2, H - inset - 2, inset, H - inset), W * w0, inset, W * w1, H - inset);
      rrPath(g, W * 0.72, inset, W * (w0 - 0.72), H - inset * 2, 3); litFill(g, W * 0.72, inset, W * (w0 - 0.72), H - inset * 2, base, { lw: 1, light: 0.25 });
      // canvas-covered bed with bows (sagging between them)
      const bx0 = 3, bx1 = W * 0.69;
      if (wreck) { rrPath(g, bx0, 4, bx1 - bx0, H - 8, 3); g.fillStyle = '#16120e'; g.fill(); g.strokeStyle = 'rgba(90,70,50,0.7)'; g.lineWidth = 2; for (let x = bx0 + 12; x < bx1; x += 16) { g.beginPath(); g.moveTo(x, 5); g.lineTo(x, H - 5); g.stroke(); } }
      else {
        const can = '#5a5a40';
        rrPath(g, bx0, 3, bx1 - bx0, H - 6, 6);
        litFill(g, bx0, 3, bx1 - bx0, H - 6, can, { light: 0.2, dark: 0.35, bevel: 3, paint: (q) => texRect(q, bx0, 3, bx1 - bx0, H - 6, fabricShader(can, seed + 5, 0.05, 0.14)) });
        g.save(); rrPath(g, bx0, 3, bx1 - bx0, H - 6, 6); g.clip();
        for (let x = bx0 + 14; x < bx1 - 4; x += 16) {
          const gr = g.createLinearGradient(x - 8, 0, x + 8, 0);
          gr.addColorStop(0, 'rgba(0,0,0,0.2)'); gr.addColorStop(0.45, 'rgba(255,255,230,0.12)'); gr.addColorStop(0.55, 'rgba(255,255,230,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)');
          g.fillStyle = gr; g.fillRect(x - 8, 3, 16, H - 6);
        }
        g.restore();
        g.strokeStyle = 'rgba(40,36,24,0.6)'; g.lineWidth = 1; for (let x = bx0 + 8; x < bx1; x += 16) { g.beginPath(); g.moveTo(x, 3); g.lineTo(x, 7); g.moveTo(x, H - 3); g.lineTo(x, H - 7); g.stroke(); }
        g.fillStyle = 'rgba(220,210,170,0.5)'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.fillText('U.S. ARMY', W * 0.86, H - 6);
      }
      // spare + jerrycans on cab back
      ellipse(g, W * 0.705, H * 0.5, 6, 9, '#151515', { lw: 1 });
      mirrors(g, W * w0 + 2, H, base);
    } else if (sp.kind === 'humvee') {
      const [f0, f1] = sp.roof!, [w0, w1] = sp.wind!;
      // hood vents + grille, wide flat cabin roof with turret ring hatch, rear cargo deck
      g.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = H * 0.25; y < H * 0.75; y += 4) g.fillRect(W * 0.78, y, W * 0.12, 1.6);
      g.beginPath(); g.moveTo(W * w1 + 2, inset); g.lineTo(W - 4, inset + 2); g.moveTo(W * w1 + 2, H - inset); g.lineTo(W - 4, H - inset - 2); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.stroke();
      if (wreck) interior(g, W * f0, W * w1, H, inset - 2);
      else {
        glass(g, () => { g.beginPath(); g.rect(W * w0, inset, W * (w1 - w0), (H - inset * 2) / 2 - 1); g.rect(W * w0, H / 2 + 1, W * (w1 - w0), (H - inset * 2) / 2 - 1); }, W * w0, inset, W * w1, H - inset);
        rrPath(g, W * f0, inset - 2, W * (f1 - f0), H - inset * 2 + 4, 3); litFill(g, W * f0, inset - 2, W * (f1 - f0), H - inset * 2 + 4, base, { light: 0.22, lw: 1.2, paint: (q) => texRect(q, W * f0, inset - 2, W * (f1 - f0), H - inset * 2 + 4, noiseShader(base, seed + 2, 8, 0.12, 0.05)) });
        const cx = W * (f0 + f1) / 2, cy = H / 2;
        g.beginPath(); g.arc(cx, cy, H * 0.24, 0, TAU); litFill(g, cx - H * 0.24, cy - H * 0.24, H * 0.48, H * 0.48, '#3a3e30', { radial: true, light: 0.2, lw: 1.5 });
        g.beginPath(); g.arc(cx, cy, H * 0.16, 0, TAU); litFill(g, cx - H * 0.16, cy - H * 0.16, H * 0.32, H * 0.32, base, { radial: true, light: 0.3, lw: 1 });
      }
      // rear deck cargo
      rrPath(g, 4, inset, W * 0.2, H - inset * 2, 2); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill();
      for (let k = 0; k < 2; k++) { rrPath(g, 7 + k * 9, inset + 3, 7, 11, 1); litFill(g, 7 + k * 9, inset + 3, 7, 11, '#4a4e36', { lw: 0.8, bevel: 0.6 }); }
      ellipse(g, W * 0.12, H * 0.66, 7, 7, '#141414', { lw: 1 });
      mirrors(g, W * w0, H, base);
    }
    lights(g, W, H, Math.max(4, inset - 2), wreck);
    if (wreck) soot(g, W, H, R, bodyPath);
    else {
      // road grime along the lower sides
      g.save(); bodyPath(); g.clip();
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(60,50,40,0.18)'); gr.addColorStop(0.15, 'rgba(60,50,40,0)'); gr.addColorStop(0.85, 'rgba(60,50,40,0)'); gr.addColorStop(1, 'rgba(60,50,40,0.25)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
    }
    void C; void css;
  };
}
/** tapered, bowed body outline (front = +x) */
function carBody(g: Ctx, W: number, H: number, rr: number, fr: number, taper: number) {
  const tR = H * taper * 0.7, tF = H * taper;
  g.beginPath();
  g.moveTo(rr, tR);
  g.bezierCurveTo(W * 0.3, -0.4, W * 0.7, -0.4, W - fr, tF);
  g.quadraticCurveTo(W - 1, tF, W, tF + fr);
  g.quadraticCurveTo(W + 2.5, H / 2, W, H - tF - fr);
  g.quadraticCurveTo(W - 1, H - tF, W - fr, H - tF);
  g.bezierCurveTo(W * 0.7, H + 0.4, W * 0.3, H + 0.4, rr, H - tR);
  g.quadraticCurveTo(0, H - tR, 0, H - tR - rr);
  g.quadraticCurveTo(-1.5, H / 2, 0, tR + rr);
  g.quadraticCurveTo(0, tR, rr, tR);
  g.closePath();
}
/** glass greenhouse: rear glass x0..x1, roof x1..x2, windshield x2..x3; insets as fractions of H */
function greenhouse(g: Ctx, W: number, H: number, x0: number, x1: number, x2: number, x3: number, base: number, top: number) {
  g.beginPath();
  g.moveTo(x0, H * base + 2); g.lineTo(x1, H * top); g.lineTo(x2, H * top); g.lineTo(x3, H * base);
  g.quadraticCurveTo(x3 + 3, H / 2, x3, H * (1 - base));
  g.lineTo(x2, H * (1 - top)); g.lineTo(x1, H * (1 - top)); g.lineTo(x0, H * (1 - base) - 2);
  g.quadraticCurveTo(x0 - 2.5, H / 2, x0, H * base + 2);
  g.closePath();
}
function metalBox(g: Ctx, x: number, y: number, w: number, h: number, col: string, seed: number) {
  rrPath(g, x, y, w, h, 2); litFill(g, x, y, w, h, col, { lw: 1, light: 0.25, paint: (q) => texRect(q, x, y, w, h, noiseShader(col, seed, 6, 0.05)) });
  g.fillStyle = 'rgba(0,0,0,0.3)'; for (let k = x + 3; k < x + w - 2; k += 3) g.fillRect(k, y + 3, 1.2, h - 6);
}

export function buildCars(reg: Registry) {
  const wrecks: string[] = [];
  for (const [type, sp] of Object.entries(S)) {
    const vs = sp.paints.map((p, i) => sprite(sp.w, sp.h, drawVehicle(type, sp, p, false, 2000 + i * 17 + type.length), { elev: sp.elev, seed: 3000 + i + type.length * 31 }));
    reg.add(`car:${type}`, A, `car_${type}`, vs, { fit: 'stretch', nativeSize: [sp.w, sp.h], orient: 'h', back: 'w', front: 'e' });
    const nw = type === 'sedan' || type === 'hatchback' ? 2 : 1;
    const ws = Array.from({ length: nw }, (_, i) => sprite(sp.w, sp.h, drawVehicle(type, sp, sp.paints[0], true, 2500 + i * 7 + type.length), { elev: sp.elev * 0.8, seed: 3500 + i + type.length }));
    const e = reg.add(`car:${type}_wreck`, A, `car_${type}_wreck`, ws, { fit: 'stretch', nativeSize: [sp.w, sp.h], orient: 'h', back: 'w', front: 'e' });
    if (['sedan', 'hatchback', 'pickup', 'van'].includes(type)) wrecks.push(...e.frames);
  }
  reg.props['car:wreck'] = { ...reg.props['car:sedan_wreck'], frames: wrecks };
  // legacy `truck:true` cars (industrial 130×52) and military 140×56 / 100×48
  reg.alias('car:truck', 'car:box_truck');
  reg.alias('car:military', 'car:military_truck');
}
