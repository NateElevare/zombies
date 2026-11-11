// art/env/decals.ts — flat ground decals (no drop shadow): blood, debris, leaves, cracks, oil, trash, bones,
// tire marks, puddles, crosswalk stripe, manhole, firepit, helipad, gas-station canopy.
import { canvas, rng, ART_SCALE, type Ctx, type Rng } from '../lib/core';
import { TAU, blobPath, crack, litFill, rrPath, texRect, noiseShader, metalShader, ellipse, pnoise, shadePixels, C } from '../lib/materials';
import { sprite, type Registry } from './prop';

const A = 'env_props';
const flat = (w: number, h: number, draw: (g: Ctx, W: number, H: number, R: Rng) => void, seed: number, grain = 0) =>
  sprite(w, h, draw, { elev: 0, pad: 0, seed, grain });

function splat(g: Ctx, x: number, y: number, r: number, R: Rng, dry: number) {
  // pool body: dark core, slightly brighter glossy rim highlight on the top-left
  const base = dry > 0.5 ? [64, 14, 12] : [90, 16, 14];
  blobPath(g, x, y, r, r * R.range(0.6, 0.95), R, 0.35, 18, R.range(0, 3));
  const gr = g.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r * 1.1);
  gr.addColorStop(0, `rgba(${base[0] * 0.75},${base[1]},${base[2]},0.92)`); gr.addColorStop(0.75, `rgba(${base[0]},${base[1] + 4},${base[2]},0.85)`); gr.addColorStop(1, `rgba(${base[0] * 0.8},${base[1]},${base[2]},0.5)`);
  g.fillStyle = gr; g.fill();
  g.strokeStyle = `rgba(150,60,50,${dry > 0.5 ? 0.12 : 0.28})`; g.lineWidth = 1.2; g.save(); g.clip(); g.translate(1.5, 1.5); g.stroke(); g.restore();
  // droplets & satellite spatters
  for (let i = 0; i < 14; i++) {
    const a = R.range(0, TAU), d = r * R.range(1.0, 1.9), s = R.range(0.8, 2.8) * (1.6 - d / (r * 2));
    g.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${R.range(0.6, 0.9)})`;
    g.beginPath(); g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, s * 1.4, s, a, 0, TAU); g.fill();
  }
  // gloss specks
  if (dry < 0.5) for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(230,170,160,0.35)'; g.beginPath(); g.ellipse(x - r * R.range(0.1, 0.5), y - r * R.range(0.1, 0.4), R.range(1, 2.5), 0.8, -0.6, 0, TAU); g.fill(); }
}

export function buildDecals(reg: Registry) {
  // ---- blood
  const blood = [0, 1, 2, 3, 4].map((v) => flat(36, 30, (g, W, H, R) => {
    if (v === 4) { // drag smear
      g.lineCap = 'round';
      for (let k = 0; k < 5; k++) { g.strokeStyle = `rgba(80,12,10,${R.range(0.3, 0.6)})`; g.lineWidth = R.range(3, 7); g.beginPath(); g.moveTo(6, H / 2 + R.range(-8, 8)); g.bezierCurveTo(W * 0.4, H / 2 + R.range(-14, 14), W * 0.6, H / 2 + R.range(-14, 14), W - 6, H / 2 + R.range(-6, 6)); g.stroke(); }
      splat(g, W * 0.18, H / 2, 10, R, 0.2);
      return;
    }
    splat(g, W / 2, H / 2, Math.min(W, H) * 0.3, R, v === 2 ? 1 : 0);
    if (v === 1) splat(g, W * 0.75, H * 0.3, 7, R, 0);
  }, 8000 + v));
  reg.add('decor:blood', A, 'decal_blood', blood, { fit: 'contain', nativeSize: [36, 30], orient: 'any', decal: true, rotate: true });

  // ---- bones (on dried blood)
  const bones = [0, 1, 2].map((v) => flat(36, 30, (g, W, H, R) => {
    splat(g, W / 2, H / 2, 11, R, 1);
    const bone = (x: number, y: number, a: number, l: number) => {
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-l / 2 + 1, -1.2 + 1.2, l, 2.6);
      g.fillStyle = '#bcb6a2'; g.fillRect(-l / 2, -1.3, l, 2.6);
      for (const e of [-l / 2, l / 2]) { g.beginPath(); g.arc(e, -1.4, 1.7, 0, TAU); g.arc(e, 1.4, 1.7, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(255,255,240,0.4)'; g.fillRect(-l / 2, -1.3, l, 0.8);
      g.restore();
    };
    for (let i = 0; i < 4 + v; i++) bone(R.range(10, W - 10), R.range(8, H - 8), R.range(0, TAU), R.range(9, 16));
    // ribcage arcs / skull
    g.strokeStyle = '#aaa48e'; g.lineWidth = 1.6; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(W * 0.55, H * 0.5 + i * 3, 7, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    if (v !== 2) { ellipse(g, W * 0.25, H * 0.35, 5.5, 4.5, '#c4bea8', { lw: 1, light: 0.35 }); g.fillStyle = '#2a2018'; g.beginPath(); g.arc(W * 0.25 - 2, H * 0.35 + 1, 1.2, 0, TAU); g.arc(W * 0.25 + 2, H * 0.35 + 1, 1.2, 0, TAU); g.fill(); }
  }, 8100 + v));
  reg.add('decor:bones', A, 'decal_bones', bones, { fit: 'contain', nativeSize: [36, 30], orient: 'any', decal: true, rotate: true });

  // ---- debris (rubble chunks, brick bits, glass)
  const debris = [0, 1, 2, 3].map((v) => sprite(24, 20, (g, W, H, R) => {
    const pal = [['#5a5650', '#6a665e', '#4a4844'], ['#6a3e32', '#5e372d', '#74463a'], ['#3a3530', '#2e3236', '#463c2c'], ['#5a5a54', '#3e3c38', '#6e6a60']][v];
    for (let i = 0; i < 9; i++) {
      const x = R.range(4, W - 4), y = R.range(4, H - 4), s = R.range(2, 5.5);
      g.save(); g.translate(x, y); g.rotate(R.range(0, TAU));
      g.beginPath(); g.moveTo(-s, -s * 0.6); g.lineTo(s * 0.8, -s * 0.8); g.lineTo(s, s * 0.5); g.lineTo(-s * 0.4, s * 0.8); g.closePath();
      litFill(g, -s, -s, s * 2, s * 2, R.pick(pal), { lw: 0.8, bevel: 0.8, light: 0.3 });
      g.restore();
    }
    if (v === 3) for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(180,210,215,0.6)'; g.beginPath(); const x = R.range(3, W - 3), y = R.range(3, H - 3); g.moveTo(x, y); g.lineTo(x + R.range(1, 4), y + R.range(-2, 2)); g.lineTo(x + R.range(-1, 2), y + R.range(1, 3)); g.fill(); }
    for (let i = 0; i < 20; i++) { g.fillStyle = 'rgba(90,86,78,0.6)'; g.fillRect(R.range(1, W - 1), R.range(1, H - 1), 1, 1); }
  }, { elev: 1, seed: 8200 + v, grain: 0 }));
  reg.add('decor:debris', A, 'decal_debris', debris, { fit: 'contain', nativeSize: [24, 20], orient: 'any', decal: true, rotate: true });

  // ---- leaves (80×80 scatter)
  const leaves = [0, 1, 2].map((v) => flat(80, 80, (g, W, H, R) => {
    for (let i = 0; i < 70; i++) {
      const a = R.range(0, TAU), d = Math.sqrt(R.next()) * W * 0.45, x = W / 2 + Math.cos(a) * d, y = H / 2 + Math.sin(a) * d;
      const r = R.range(2.5, 4.5), ang = R.range(0, TAU), col = R.pick(['#6a4e2a', '#7a5a30', '#5a5a30', '#84602e', '#5e3a22', '#6e6436']);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 0.8, y + 1, r, r * 0.55, ang, 0, TAU); g.fill();
      g.fillStyle = col; g.globalAlpha = 0.9; g.beginPath(); g.ellipse(x, y, r, r * 0.55, ang, 0, TAU); g.fill(); g.globalAlpha = 1;
      g.strokeStyle = 'rgba(40,26,12,0.5)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(x - Math.cos(ang) * r, y - Math.sin(ang) * r); g.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r); g.stroke();
    }
    void v;
  }, 8300 + v));
  reg.add('decor:leaves', A, 'decal_leaves', leaves, { fit: 'contain', nativeSize: [80, 80], orient: 'any', decal: true, rotate: true });

  // ---- cracks
  const cracks = [0, 1, 2, 3].map((v) => flat(48, 40, (g, W, H, R) => {
    crack(g, R.range(4, 10), H / 2 + R.range(-8, 8), R.range(-0.4, 0.4), W * 0.9, R, 1.6);
    if (v % 2) crack(g, W / 2, H / 2, R.range(1, 2.2), H * 0.5, R, 1.1);
  }, 8400 + v));
  reg.add('decor:crack', A, 'decal_crack', cracks, { fit: 'contain', nativeSize: [48, 40], orient: 'any', decal: true, rotate: true });

  // ---- oil stains (with faint iridescent sheen)
  const oil = [0, 1, 2].map((v) => flat(40, 28, (g, W, H, R) => {
    blobPath(g, W / 2, H / 2, W * 0.42, H * 0.4, R, 0.3, 16);
    const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.45);
    gr.addColorStop(0, 'rgba(6,6,8,0.75)'); gr.addColorStop(0.7, 'rgba(10,10,12,0.55)'); gr.addColorStop(1, 'rgba(12,12,14,0.2)');
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    for (const [c, dx] of [['rgba(120,60,140,0.12)', -4], ['rgba(40,120,120,0.12)', 2], ['rgba(140,120,40,0.1)', 6]] as [string, number][]) { g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.ellipse(W / 2 + dx, H / 2 - 2, W * 0.22, H * 0.18, 0.3, 0, TAU); g.stroke(); }
    g.restore();
    for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(8,8,10,0.5)'; g.beginPath(); g.arc(R.range(2, W - 2), R.range(2, H - 2), R.range(0.8, 2), 0, TAU); g.fill(); }
    void v;
  }, 8500 + v));
  reg.add('decor:oil', A, 'decal_oil', oil, { fit: 'contain', nativeSize: [40, 28], orient: 'any', decal: true, rotate: true });

  // ---- trash
  const trash = [0, 1, 2, 3].map((v) => sprite(40, 30, (g, W, H, R) => {
    for (let i = 0; i < 7; i++) {
      const k = R.int(0, 4), x = R.range(6, W - 6), y = R.range(6, H - 6), a = R.range(0, TAU);
      g.save(); g.translate(x, y); g.rotate(a);
      if (k === 0) { g.beginPath(); g.moveTo(-5, -4); g.lineTo(5, -5); g.lineTo(4, 4); g.lineTo(-4, 5); g.closePath(); litFill(g, -5, -5, 10, 10, '#b4b0a2', { lw: 0.8, light: 0.3, bevel: 0.5 }); g.strokeStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.moveTo(-3, -1); g.lineTo(3, 1); g.stroke(); }
      else if (k === 1) { rrPath(g, -2.5, -4.5, 5, 9, 2); litFill(g, -2.5, -4.5, 5, 9, R.pick(['#8a2a24', '#2a5a8a', '#8a8a84']), { lw: 0.8, light: 0.45 }); }
      else if (k === 2) { g.beginPath(); blobPath(g, 0, 0, 7, 5.5, R, 0.25, 10); litFill(g, -7, -6, 14, 12, '#1e2022', { lw: 1, light: 0.35, radial: true }); }
      else if (k === 3) { rrPath(g, -2, -6, 4, 12, 1.5); litFill(g, -2, -6, 4, 12, R.pick(['#3a5a3a', '#5a3a1e']), { lw: 0.8, light: 0.5 }); g.fillStyle = 'rgba(200,230,200,0.3)'; g.fillRect(-1, -5, 1, 9); }
      else { rrPath(g, -5, -3.5, 10, 7, 1); litFill(g, -5, -3.5, 10, 7, R.pick(['#8a7050', '#a09a88', '#6a3a30']), { lw: 0.8, bevel: 0.5 }); }
      g.restore();
    }
    void v;
  }, { elev: 1, seed: 8600 + v, grain: 0 }));
  reg.add('decor:trash', A, 'decal_trash', trash, { fit: 'contain', nativeSize: [40, 30], orient: 'any', decal: true, rotate: true });

  // ---- tire / skid marks (long, along x)
  const tire = [0, 1, 2].map((v) => flat(128, 40, (g, W, H, R) => {
    const n = pnoise(8700 + v, 4);
    for (const y0 of [H * 0.25, H * 0.75]) {
      const dy = R.range(-3, 3), curve = v === 2 ? R.range(-10, 10) : 0;
      for (let x = 4; x < W - 4; x += 1) {
        const t = x / W, y = y0 + dy * t + curve * Math.sin(t * Math.PI);
        const a = 0.42 * Math.min(1, Math.min(x, W - x) / 25) * (0.6 + n(x, y0, 3) * 0.6);
        g.fillStyle = `rgba(10,10,10,${a})`; g.fillRect(x, y - 3.5, 1.2, 7);
      }
    }
  }, 8700 + v));
  reg.add('decor:tire', A, 'decal_tire', tire, { fit: 'stretch', nativeSize: [128, 40], orient: 'h', decal: true, rotate: true });

  // ---- puddles (reflective)
  const puddle = [0, 1, 2].map((v) => flat(60, 40, (g, W, H, R) => {
    blobPath(g, W / 2, H / 2, W * 0.45, H * 0.4, R, 0.3, 18, R.range(-0.3, 0.3));
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, 'rgba(110,125,135,0.55)'); gr.addColorStop(0.5, 'rgba(40,48,54,0.6)'); gr.addColorStop(1, 'rgba(20,24,28,0.55)');
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    g.fillStyle = 'rgba(200,215,225,0.18)'; g.beginPath(); g.moveTo(W * 0.15, 0); g.lineTo(W * 0.35, 0); g.lineTo(W * 0.15, H); g.lineTo(-W * 0.05, H); g.fill();
    g.strokeStyle = 'rgba(200,210,215,0.18)'; g.lineWidth = 0.8; for (let i = 0; i < 2; i++) { g.beginPath(); g.ellipse(W * R.range(0.4, 0.7), H * R.range(0.4, 0.6), 6 + i * 4, 3 + i * 2, 0, 0, TAU); g.stroke(); }
    g.restore();
    blobPath(g, W / 2, H / 2, W * 0.45, H * 0.4, rng(8800 + v), 0.3, 18); g.strokeStyle = 'rgba(30,26,20,0.3)'; g.lineWidth = 2; g.stroke();
  }, 8800 + v));
  reg.add('decor:puddle', A, 'decal_puddle', puddle, { fit: 'contain', nativeSize: [60, 40], orient: 'any', decal: true, rotate: true });

  // ---- crosswalk stripe: worn white paint 9×64 world, tiles along y
  const cw = canvas(9 * ART_SCALE, 64 * ART_SCALE);
  {
    const n = pnoise(8900, 5), R = rng(8901);
    shadePixels(cw.c, (x, y) => { const wear = n(x, y, 4) + (R.next() - 0.5) * 0.25; const a = wear < 0.38 ? 0.15 : wear < 0.45 ? 0.5 : 0.85; const edge = x < 1 || x > cw.c.width - 2 ? 0.6 : 1; return [206, 204, 192, 255 * a * edge * 0.6]; });
  }
  reg.sprites.push({ atlas: A, name: 'decal_crosswalk', canvas: cw.c });
  reg.props['decor:crosswalk'] = { atlas: A, frames: ['decal_crosswalk'], fit: 'tile', nativeSize: [9, 64], orient: 'v', pad: 0, decal: true, note: 'one stripe; repeat every 18 world px across the road, tile along its length' };

  // ---- manhole 28 world
  const mh = flat(28, 28, (g, W) => {
    const c = W / 2;
    g.beginPath(); g.arc(c, c, c - 0.5, 0, TAU); g.fillStyle = '#3e3c38'; g.fill();
    g.beginPath(); g.arc(c, c, c - 3, 0, TAU);
    litFill(g, 3, 3, W - 6, W - 6, '#4a4844', { radial: true, light: 0.18, dark: 0.3, lw: 1.5, paint: (q) => texRect(q, 0, 0, W, W, metalShader('#4a4844', 8950, false, 0.05, 0.15)) });
    g.save(); g.beginPath(); g.arc(c, c, c - 5, 0, TAU); g.clip();
    for (let y = 0; y < W; y += 5) for (let x = (y / 5) % 2 ? 2.5 : 0; x < W; x += 5) { g.fillStyle = 'rgba(255,255,240,0.1)'; g.fillRect(x, y, 2.5, 1.2); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 0.5, y + 1.2, 2.5, 1); }
    g.restore();
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(c - 3, c - 1, 6, 2); g.fillRect(c + 9, c - 1, 4, 2);
  }, 8950, 0);
  reg.sprites.push({ atlas: A, name: 'decal_manhole', canvas: mh.canvas });
  reg.props['decor:manhole'] = { atlas: A, frames: ['decal_manhole'], fit: 'contain', nativeSize: [28, 28], orient: 'any', pad: 0, decal: true };

  // ---- firepit (stone ring + ash) 30
  const firepit = [0, 1].map((v) => sprite(30, 30, (g, W, H, R) => {
    const c = W / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, c * 0.75); gr.addColorStop(0, '#1a1614'); gr.addColorStop(0.6, '#2e2a26'); gr.addColorStop(1, '#3a342c');
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, c * 0.75, 0, TAU); g.fill();
    for (let i = 0; i < 6; i++) { g.save(); g.translate(c + R.range(-6, 6), c + R.range(-6, 6)); g.rotate(R.range(0, TAU)); rrPath(g, -9, -2, 18, 4, 2); litFill(g, -9, -2, 18, 4, '#1e1a16', { lw: 0.8, light: 0.1 }); g.restore(); }
    for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(160,150,140,0.35)'; g.fillRect(c + R.range(-10, 10), c + R.range(-10, 10), 1.5, 1.5); }
    const n = 11;
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, x = c + Math.cos(a) * c * 0.8, y = c + Math.sin(a) * c * 0.8; g.beginPath(); blobPath(g, x, y, 4.5, 3.8, R, 0.2, 8, a); litFill(g, x - 5, y - 5, 10, 10, R.pick(['#6a6760', '#5a5750', '#77736a']), { radial: true, light: 0.35, lw: 1 }); }
    void v;
  }, { elev: 2, seed: 8960 + v }));
  reg.add('decor:firepit', A, 'decal_firepit', firepit, { fit: 'contain', nativeSize: [30, 30], orient: 'any', decal: true });

  // ---- helipad 160 world (contain)
  const heli = flat(160, 160, (g, W) => {
    const c = W / 2;
    g.beginPath(); g.arc(c, c, c - 1, 0, TAU);
    litFill(g, 0, 0, W, W, '#3a3a34', { light: 0.05, dark: 0.1, outline: 'rgba(0,0,0,0.4)', lw: 2, bevel: 0, paint: (q) => texRect(q, 0, 0, W, W, noiseShader('#3a3a34', 8970, 10, 0.12, 0.08)) });
    g.strokeStyle = 'rgba(210,190,90,0.6)'; g.lineWidth = 10; g.beginPath(); g.arc(c, c, c - 26, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(220,218,206,0.7)'; const s = W / 320; g.fillRect(c - 80 * s, c - 100 * s, 32 * s, 200 * s); g.fillRect(c + 48 * s, c - 100 * s, 32 * s, 200 * s); g.fillRect(c - 80 * s, c - 16 * s, 160 * s, 32 * s);
    // wear over paint
    const n = pnoise(8971, 6);
    g.globalCompositeOperation = 'destination-out';
    texRect(g, 0, 0, W, W, (x, y) => [0, 0, 0, n(x, y) > 0.6 ? 120 : 0]);
    g.globalCompositeOperation = 'source-over';
  }, 8970, 0);
  reg.add('decor:helipad', A, 'decal_helipad', [heli], { fit: 'contain', nativeSize: [160, 160], orient: 'any', decal: true });

  // ---- gas-station canopy roof: nine-slice, 128 world square
  const canopy = sprite(128, 128, (g, W, H) => {
    rrPath(g, 0, 0, W, H, 2);
    litFill(g, 0, 0, W, H, '#3c3c3a', { light: 0.1, lw: 2, paint: (q) => texRect(q, 0, 0, W, H, metalShader('#3c3c3a', 8980, true, 0.06, 0.08)) });
    g.fillStyle = '#6e2a24'; g.fillRect(0, 0, W, 12); g.fillRect(0, H - 12, W, 12); g.fillRect(0, 0, 12, H); g.fillRect(W - 12, 0, 12, H);
    g.fillStyle = 'rgba(255,240,230,0.15)'; g.fillRect(0, 0, W, 2); g.fillRect(0, 0, 2, H);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, H - 2, W, 2); g.fillRect(W - 2, 0, 2, H);
    for (let x = 30; x < W - 20; x += 32) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, 14, 1.5, H - 28); }
  }, { elev: 6, seed: 8980 });
  const sl = 14 + canopy.pad * 2;
  reg.add('decor:canopy', A, 'decal_canopy', [canopy], { fit: 'nine', nativeSize: [128, 128], orient: 'any', slice: [sl, sl, sl, sl], note: 'overhead roof; draw above actors with some alpha' });
  void C;
}
