// art/fx/index.ts — FX atlas: muzzle flashes, blood, sparks, smoke, dust, casings, explosion, fire, tracers, impacts.
import { join } from 'node:path';
import { Path2D } from '@napi-rs/canvas';
import { canvas, packAtlas, contactSheet, rng, shade, makeNoise, type Ctx, type Frame, type ManifestFragment, type Canvas } from '../lib/core';
import { TAU, lerp, clamp, bloodPool, splat } from '../lib/figure';
import { pixelEffect } from './pixel';

const PREVIEW = join(process.cwd(), 'art', 'preview');
type R = ReturnType<typeof rng>;

function glow(g: Ctx, x: number, y: number, r: number, stops: [number, string][]) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [t, c] of stops) gr.addColorStop(t, c);
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
/** flame petal: a pointed lobe from (x,y) along angle a */
function petal(g: Ctx, x: number, y: number, a: number, len: number, wid: number, inner: string, outer: string) {
  const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
  const p = new Path2D();
  p.moveTo(x + nx * wid * 0.4, y + ny * wid * 0.4);
  p.quadraticCurveTo(x + ca * len * 0.45 + nx * wid, y + sa * len * 0.45 + ny * wid, x + ca * len, y + sa * len);
  p.quadraticCurveTo(x + ca * len * 0.45 - nx * wid, y + sa * len * 0.45 - ny * wid, x - nx * wid * 0.4, y - ny * wid * 0.4);
  p.closePath();
  const gr = g.createLinearGradient(x, y, x + ca * len, y + sa * len);
  gr.addColorStop(0, inner); gr.addColorStop(0.55, outer); gr.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = gr; g.fill(p);
}

function muzzle(kind: 'handgun' | 'long' | 'shotgun', i: number): Canvas {
  const [w, h] = kind === 'handgun' ? [64, 48] : kind === 'long' ? [96, 56] : [96, 80];
  const { c, g } = canvas(w, h), R = rng(100 + i * 7 + kind.length);
  const y = h / 2, len = (kind === 'handgun' ? 40 : kind === 'long' ? 74 : 62) * [1, 0.8, 0.55][i];
  g.globalCompositeOperation = 'lighter';
  glow(g, 4, y, len * 0.75, [[0, 'rgba(255,200,120,0.55)'], [1, 'rgba(255,120,30,0)']]);
  const spread = kind === 'shotgun' ? 0.5 : 0.28;
  petal(g, 2, y, R.range(-0.05, 0.05), len, h * (kind === 'shotgun' ? 0.22 : 0.16), 'rgba(255,250,220,1)', 'rgba(255,170,60,0.85)');
  for (const s of [-1, 1]) petal(g, 2, y, s * (spread + R.range(-0.08, 0.08)), len * R.range(0.45, 0.65), h * 0.1, 'rgba(255,240,200,0.95)', 'rgba(255,140,40,0.75)');
  if (kind !== 'handgun') for (const s of [-1, 1]) petal(g, 2, y, s * (1.2 + R.range(-0.1, 0.1)), len * 0.28, h * 0.07, 'rgba(255,230,180,0.9)', 'rgba(255,130,40,0.6)');
  glow(g, 3, y, h * 0.24 * [1, 0.85, 0.6][i], [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,245,200,0.9)'], [1, 'rgba(255,200,100,0)']]);
  if (kind === 'shotgun') for (let k = 0; k < 10; k++) { // burning powder sparks
    const a = R.range(-0.5, 0.5), d = R.range(len * 0.5, len * 1.15);
    glow(g, 2 + Math.cos(a) * d, y + Math.sin(a) * d, 2.4, [[0, 'rgba(255,240,200,1)'], [1, 'rgba(255,150,40,0)']]);
  }
  return c;
}

function bloodSpray(i: number): Canvas {
  const w = 96, h = 64, { c, g } = canvas(w, h), R = rng(300 + 0), t = (i + 1) / 6;
  const y = h / 2;
  // mist cone
  for (let k = 0; k < 14; k++) {
    const a = R.range(-0.45, 0.45), d = R.range(0.2, 1) * w * 0.85 * (0.35 + t * 0.65), r = R.range(5, 12) * (0.6 + t * 0.7);
    g.globalAlpha = 0.28 * (1 - t * 0.75);
    glow(g, 4 + Math.cos(a) * d, y + Math.sin(a) * d, r, [[0, 'rgba(120,16,14,0.9)'], [1, 'rgba(90,10,10,0)']]);
  }
  g.globalAlpha = 1;
  // droplets flying outward along their rays
  const R2 = rng(301);
  for (let k = 0; k < 30; k++) {
    const a = R2.range(-0.5, 0.5), sp = R2.range(0.35, 1), d = 6 + sp * w * 0.9 * t, r = R2.range(0.9, 2.4) * (1 - t * 0.35);
    const x = 4 + Math.cos(a) * d, yy = y + Math.sin(a) * d;
    g.fillStyle = R2.chance(0.5) ? '#7a1512' : '#5a0f0f';
    g.beginPath(); g.ellipse(x, yy, r * (1 + sp * 1.4 * (1 - t)), r, a, 0, TAU); g.fill();
  }
  return c;
}

function fireFrame(i: number, n = 8): Canvas {
  const w = 64, h = 88, { c, g } = canvas(w, h);
  const ph = (i / n) * TAU, N = makeNoise(77, 64);
  const bx = w / 2, by = h * 0.74;
  g.globalCompositeOperation = 'lighter';
  glow(g, bx, by - 6, 30, [[0, 'rgba(255,140,40,0.45)'], [1, 'rgba(255,80,10,0)']]);
  // tongues: each sways and pulses on a looping phase
  const tongues = 7;
  for (let k = 0; k < tongues; k++) {
    const off = (k / (tongues - 1) - 0.5) * 26, p0 = k * 1.7;
    const hgt = 30 + 22 * (0.5 + 0.5 * Math.sin(ph * (k % 2 ? 1 : 2) + p0)) * (1 - Math.abs(off) / 30);
    const sway = Math.sin(ph + p0) * 5 + (N.value(k * 3, Math.cos(ph) * 2 + 5) - 0.5) * 4;
    const a = -Math.PI / 2 + sway * 0.03 + off * 0.012;
    petal(g, bx + off * 0.7, by, a, hgt, 7 + (1 - Math.abs(off) / 30) * 5, 'rgba(255,200,90,0.85)', 'rgba(230,80,20,0.6)');
  }
  for (let k = 0; k < 4; k++) { // bright inner core
    const off = (k - 1.5) * 6, hgt = 18 + 8 * Math.sin(ph * 2 + k);
    petal(g, bx + off, by + 2, -Math.PI / 2 + Math.sin(ph + k) * 0.12, hgt, 6, 'rgba(255,250,220,0.95)', 'rgba(255,200,90,0.7)');
  }
  glow(g, bx, by, 12, [[0, 'rgba(255,255,230,0.9)'], [1, 'rgba(255,200,100,0)']]);
  // a rising ember
  const ey = by - 20 - ((i / n) * 50) % 50, ex = bx + Math.sin(ph * 2) * 8;
  glow(g, ex, ey, 2.5, [[0, 'rgba(255,230,150,1)'], [1, 'rgba(255,120,30,0)']]);
  return c;
}

function puff(g: Ctx, R: R, x: number, y: number, r: number, color: string, a: number, lobes = 7) {
  for (let k = 0; k < lobes; k++) {
    const ang = R.range(0, TAU), d = R.range(0, r * 0.45), rr = r * R.range(0.45, 0.7);
    const px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d;
    const gr = g.createRadialGradient(px - rr * 0.25, py - rr * 0.25, 0, px, py, rr);
    gr.addColorStop(0, shade(color, 0.15, a)); gr.addColorStop(0.6, shade(color, 0, a * 0.7)); gr.addColorStop(1, shade(color, -0.1, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, rr, 0, TAU); g.fill();
  }
}

function billow(g: Ctx, R: R, x: number, y: number, r: number, inner: string, outer: string, a: number, n: number) {
  for (let k = 0; k < n; k++) {
    const ang = R.range(0, TAU), d = Math.sqrt(R.next()) * r * 0.55, rr = r * R.range(0.32, 0.5);
    const px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d;
    const gr = g.createRadialGradient(px - rr * 0.3, py - rr * 0.3, rr * 0.05, px, py, rr);
    gr.addColorStop(0, shade(inner, 0.1, a)); gr.addColorStop(0.55, shade(outer, 0, a * 0.9)); gr.addColorStop(0.85, shade(outer, -0.3, a * 0.5)); gr.addColorStop(1, shade(outer, -0.4, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, rr, 0, TAU); g.fill();
  }
}
function explosion(i: number): Canvas {
  const S = 256, { c, g } = canvas(S, S), m = S / 2, R = rng(900);
  if (i <= 5) { // fireball: hot core, billowing orange lobes, sooty rim
    const k = (i + 1) / 6, r = 34 + 78 * Math.sqrt(k);
    billow(g, rng(910), m, m, r * 1.1, '#5a4c44', '#2e2826', 0.25 + 0.5 * k, 14);           // soot rim
    billow(g, rng(911), m, m, r * 0.95, '#ffb347', '#b8380e', 0.95, 18);                   // flame lobes
    billow(g, rng(912), m, m, r * 0.6, '#fff1b8', '#ff8a24', 0.9 * (1.15 - k), 12);        // hot core
    g.globalCompositeOperation = 'lighter';
    glow(g, m, m, r * 1.25, [[0, `rgba(255,160,60,${0.45 * (1.2 - k)})`], [1, 'rgba(255,80,10,0)']]);
    if (i < 3) glow(g, m, m, r * 0.45, [[0, 'rgba(255,255,235,0.9)'], [1, 'rgba(255,220,140,0)']]);
    for (let j = 0; j < 14; j++) { // debris sparks streaking out
      const a = R.range(0, TAU), d = r * (0.85 + R.range(0, 0.55)) * (0.6 + k * 0.5);
      g.strokeStyle = 'rgba(255,210,140,0.9)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(m + Math.cos(a) * d * 0.85, m + Math.sin(a) * d * 0.85); g.lineTo(m + Math.cos(a) * d, m + Math.sin(a) * d); g.stroke();
    }
  } else { // smoke column billows and thins, dying fire glows inside
    const k = (i - 6) / 5, r = 112 + 14 * k;
    billow(g, rng(920), m, m, r, '#5c5652', '#2f2b29', 0.9 * (1 - k * 0.8), 18);
    billow(g, rng(921), m + 5, m - 5, r * 0.75, '#6a625c', '#3a3533', 0.7 * (1 - k * 0.85), 10);
    if (k < 0.7) billow(g, rng(922), m, m, r * 0.85 * (1 - k), '#ffa040', '#902a0c', 0.9 * (1 - k / 0.7), 12);
    g.globalCompositeOperation = 'lighter';
    const Re = rng(905);
    for (let j = 0; j < 12; j++) glow(g, m + Re.range(-r, r) * 0.6, m + Re.range(-r, r) * 0.6, 3, [[0, `rgba(255,200,120,${1 - k})`], [1, 'rgba(255,100,20,0)']]);
  }
  return c;
}

export default async function (): Promise<ManifestFragment> {
  const F: Frame[] = [];
  const pixel = process.argv.includes('--chars2d') || process.argv.includes('--pixel-fx') || process.env.ART_CHARS === '2d';
  const add = (name: string, c: Canvas) => F.push({ name, canvas: pixel ? pixelEffect(name, c.width, c.height) : c });
  for (const k of ['handgun', 'long', 'shotgun'] as const) for (let i = 0; i < 3; i++) add(`muzzle_${k}_${i}`, muzzle(k, i));
  for (let i = 0; i < 6; i++) add(`blood_spray_${i}`, bloodSpray(i));
  for (let i = 0; i < 4; i++) {
    const { c, g } = canvas(16, 16), R = rng(40 + i);
    g.fillStyle = '#6e1310'; g.beginPath(); g.ellipse(8, 8, 3 + i * 0.8, 2.5 + i * 0.5, R.range(0, 3), 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,200,200,0.35)'; g.beginPath(); g.arc(7, 7, 1, 0, TAU); g.fill();
    add(`blood_drop_${i}`, c);
  }
  for (let i = 0; i < 6; i++) {
    const { c, g } = canvas(128, 128), R = rng(60 + i);
    bloodPool(g, 64, 64, 34 + i * 4, 60 + i, i % 2 ? '#5a0f0f' : '#6e1310', 0.92, R.range(0.85, 1.25));
    add(`blood_pool_${i}`, c);
  }
  for (let i = 0; i < 3; i++) {
    const { c, g } = canvas(128, 64), R = rng(80 + i);
    for (let k = 0; k < 6; k++) { // drag streaks
      const y = 32 + R.range(-12, 12), x0 = R.range(4, 20), x1 = R.range(90, 124);
      const gr = g.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, 'rgba(90,15,15,0)'); gr.addColorStop(0.3, 'rgba(100,18,16,0.7)'); gr.addColorStop(1, 'rgba(70,10,10,0.9)');
      g.strokeStyle = gr; g.lineWidth = R.range(2, 7); g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y); g.quadraticCurveTo((x0 + x1) / 2, y + R.range(-6, 6), x1, y + R.range(-4, 4)); g.stroke();
    }
    g.save(); g.beginPath(); g.rect(0, 0, 128, 64); g.clip(); splat(g, R, 108, 32, 14, '#5a0f0f', 0.85); g.restore();
    add(`blood_smear_${i}`, c);
  }
  for (let i = 0; i < 4; i++) {
    const { c, g } = canvas(32, 32), R = rng(120 + i);
    g.globalCompositeOperation = 'lighter';
    glow(g, 16, 16, 9 - i * 1.5, [[0, 'rgba(255,240,200,0.9)'], [1, 'rgba(255,160,40,0)']]);
    for (let k = 0; k < 5; k++) {
      const a = R.range(0, TAU), l = R.range(6, 14) * (1 - i * 0.18);
      g.strokeStyle = 'rgba(255,220,150,0.95)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(16 + Math.cos(a) * 2, 16 + Math.sin(a) * 2); g.lineTo(16 + Math.cos(a) * l, 16 + Math.sin(a) * l); g.stroke();
    }
    add(`spark_${i}`, c);
  }
  for (let i = 0; i < 6; i++) { const { c, g } = canvas(96, 96); puff(g, rng(140 + i), 48, 48, 26 + i * 3, '#8a8784', 0.55 - i * 0.06, 8); add(`smoke_${i}`, c); }
  for (let i = 0; i < 4; i++) { const { c, g } = canvas(64, 64); puff(g, rng(160 + i), 32, 32, 16 + i * 4, '#8f7f63', 0.5 - i * 0.08, 6); add(`dust_${i}`, c); }
  for (let i = 0; i < 2; i++) {
    const { c, g } = canvas(14, 8);
    g.translate(7, 4); g.rotate(i * 0.4);
    const gr = g.createLinearGradient(0, -2, 0, 2); gr.addColorStop(0, '#f2d27a'); gr.addColorStop(0.5, '#c9973a'); gr.addColorStop(1, '#7a5520');
    g.fillStyle = gr; g.fillRect(-4.5, -1.6, 9, 3.2); g.fillStyle = '#9a7030'; g.fillRect(-5, -1.8, 1.4, 3.6);
    add(`shell_casing_${i}`, c);
  }
  {
    const { c, g } = canvas(18, 10);
    const gr = g.createLinearGradient(0, 2, 0, 8); gr.addColorStop(0, '#c0473c'); gr.addColorStop(1, '#6a1e18');
    g.fillStyle = gr; g.fillRect(5, 2, 11, 6); g.fillStyle = '#c9973a'; g.fillRect(2, 1.5, 4, 7);
    add('shell_shotgun_0', c);
  }
  for (let i = 0; i < 12; i++) add(`explosion_${i}`, explosion(i));
  for (let i = 0; i < 2; i++) {
    const { c, g } = canvas(192, 192), R = rng(200 + i);
    glow(g, 96, 96, 80, [[0, 'rgba(12,10,8,0.85)'], [0.5, 'rgba(25,20,16,0.6)'], [1, 'rgba(30,25,20,0)']]);
    for (let k = 0; k < 18; k++) { // radial blast streaks
      const a = R.range(0, TAU), l = R.range(60, 92);
      g.strokeStyle = 'rgba(15,12,10,0.22)'; g.lineWidth = R.range(3, 9); g.filter = 'blur(2px)';
      g.beginPath(); g.moveTo(96 + Math.cos(a) * 30, 96 + Math.sin(a) * 30); g.lineTo(96 + Math.cos(a) * l, 96 + Math.sin(a) * l); g.stroke();
    }
    g.filter = 'none';
    add(`scorch_${i}`, c);
  }
  for (let i = 0; i < 8; i++) add(`fire_${i}`, fireFrame(i));
  for (let i = 0; i < 3; i++) {
    const { c, g } = canvas(12, 12);
    g.globalCompositeOperation = 'lighter';
    glow(g, 6, 6, 5.5 - i, [[0, 'rgba(255,240,180,1)'], [0.4, 'rgba(255,150,40,0.9)'], [1, 'rgba(200,60,10,0)']]);
    add(`ember_${i}`, c);
  }
  {
    const { c, g } = canvas(64, 8);
    const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(255,200,120,0)'); gr.addColorStop(0.8, 'rgba(255,230,170,0.75)'); gr.addColorStop(1, 'rgba(255,255,240,1)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(32, 4, 32, 1.6, 0, 0, TAU); g.fill();
    g.globalCompositeOperation = 'lighter'; glow(g, 60, 4, 4, [[0, 'rgba(255,255,230,0.9)'], [1, 'rgba(255,200,100,0)']]);
    add('bullet_tracer', c);
  }
  for (let i = 0; i < 4; i++) {
    const { c, g } = canvas(48, 48), R = rng(220 + i), k = i / 3;
    puff(g, rng(230), 24, 24, 8 + k * 12, '#9a9286', 0.6 * (1 - k * 0.7), 5);
    for (let j = 0; j < 9; j++) { // chips flying back toward the shooter (-x)
      const a = Math.PI + R.range(-1.1, 1.1), d = 3 + (k + 0.3) * R.range(8, 20);
      g.fillStyle = R.chance(0.5) ? '#6b6a66' : '#4a4844';
      g.fillRect(24 + Math.cos(a) * d - 1, 24 + Math.sin(a) * d - 1, 2.2, 2.2);
    }
    if (i === 0) { g.globalCompositeOperation = 'lighter'; glow(g, 24, 24, 7, [[0, 'rgba(255,230,170,0.9)'], [1, 'rgba(255,150,40,0)']]); }
    add(`impact_wall_${i}`, c);
  }
  {
    const { c, g } = canvas(24, 14);
    g.fillStyle = 'rgba(30,26,20,0.28)';
    g.beginPath(); g.ellipse(14, 7, 8, 5, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(4.5, 7, 3.5, 4, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(30,26,20,0.18)'; for (let x = 8; x < 21; x += 3) g.fillRect(x, 3, 1.2, 8);
    add('footprint_0', c);
  }

  const atlas = 'fx';
  const page = packAtlas(atlas, F);
  console.log(`  atlas ${page.name}: ${page.w}x${page.h}, ${page.count} frames`);
  contactSheet(join(PREVIEW, 'fx.png'), F.filter((f) => f.canvas.width <= 128), 10, '#3a3c3e');
  contactSheet(join(PREVIEW, 'fx_explosion.png'), F.filter((f) => f.name.startsWith('explosion') || f.name.startsWith('scorch')), 7, '#3a3c3e');

  const names = (pre: string) => F.filter((f) => f.name.startsWith(pre + '_') && /^\d+$/.test(f.name.slice(pre.length + 1))).map((f) => f.name);
  const anims: ManifestFragment['anims'] = [
    { key: 'fx_explosion', atlas, frames: names('explosion'), frameRate: 18, repeat: 0 },
    { key: 'fx_fire', atlas, frames: names('fire'), frameRate: 12, repeat: -1 },
    { key: 'fx_muzzle_handgun', atlas, frames: names('muzzle_handgun'), frameRate: 40, repeat: 0 },
    { key: 'fx_muzzle_long', atlas, frames: names('muzzle_long'), frameRate: 40, repeat: 0 },
    { key: 'fx_muzzle_shotgun', atlas, frames: names('muzzle_shotgun'), frameRate: 36, repeat: 0 },
    { key: 'fx_blood_spray', atlas, frames: names('blood_spray'), frameRate: 24, repeat: 0 },
    { key: 'fx_spark', atlas, frames: names('spark'), frameRate: 24, repeat: 0 },
    { key: 'fx_smoke', atlas, frames: names('smoke'), frameRate: 8, repeat: 0 },
    { key: 'fx_dust', atlas, frames: names('dust'), frameRate: 12, repeat: 0 },
    { key: 'fx_impact_wall', atlas, frames: names('impact_wall'), frameRate: 20, repeat: 0 },
    { key: 'fx_ember', atlas, frames: names('ember'), frameRate: 10, repeat: -1 },
  ];
  const o = (origin: [number, number], extra: Record<string, any> = {}) => ({ atlas, origin, ...extra });
  const sprites: Record<string, any> = {
    muzzle_handgun: o([0, 0.5], { note: 'place origin at weapon muzzle, rotate to aim' }), muzzle_long: o([0, 0.5]), muzzle_shotgun: o([0, 0.5]),
    blood_spray: o([0.04, 0.5]), blood_drop: o([0.5, 0.5]), blood_pool: o([0.5, 0.5], { decal: true }), blood_smear: o([0.85, 0.5], { decal: true }),
    spark: o([0.5, 0.5], { blend: 'add' }), smoke: o([0.5, 0.5]), dust: o([0.5, 0.5]), shell_casing: o([0.5, 0.5]), shell_shotgun: o([0.5, 0.5]),
    explosion: o([0.5, 0.5]), scorch: o([0.5, 0.5], { decal: true }), fire: o([0.5, 0.74]), ember: o([0.5, 0.5], { blend: 'add' }),
    bullet_tracer: o([1, 0.5], { blend: 'add' }), impact_wall: o([0.5, 0.5]), footprint: o([0.5, 0.5], { decal: true }),
  };
  return { atlases: [atlas], sprites, anims, effectsStyle: pixel ? 'pixel-v1' : 'smooth' };
}
void lerp; void clamp;
