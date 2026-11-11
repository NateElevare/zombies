// art/icons/index.ts — 96×96 inventory icons for every item id (legacy sv-items.js) and every structure
// (struct_<type>.png). Side / three-quarter view, top-left light, soft shadow, transparent background.
import { join } from 'node:path';
import { canvas, rng, savePng, OUT, type Ctx, type Rng, type Canvas, type ManifestFragment } from '../lib/core';
import { TAU, rrPath, litFill, ellipse, texRect, woodShader, fabricShader, metalShader, noiseShader, withShadow, blobPath } from '../lib/materials';
import { Registry } from '../env/prop';
import { buildStructures } from '../env/structures';
import { spriteSheet, PREVIEW } from '../env/preview';
import { colaIcon, mintsIcon } from '../cola/pixel';

const N = 96;
type Draw = (g: Ctx, R: Rng) => void;
const ink = 'rgba(16,14,12,0.85)';

function icon(draw: Draw, seed: number): Canvas {
  const { c, g } = canvas(N, N);
  draw(g, rng(seed));
  return withShadow(c, 3, 4, 3, 0.45);
}
// ---- shape helpers -------------------------------------------------------------------
function poly(g: Ctx, pts: number[][]) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
function bbox(pts: number[][]) { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); const x = Math.min(...xs), y = Math.min(...ys); return [x, y, Math.max(...xs) - x, Math.max(...ys) - y]; }
function part(g: Ctx, pts: number[][], col: string, mat: 'metal' | 'wood' | 'poly' | 'plain' = 'metal', seed = 1, light = 0.3) {
  const [x, y, w, h] = bbox(pts);
  poly(g, pts);
  const paint = mat === 'wood' ? (q: Ctx) => texRect(q, x, y, w + 1, h + 1, woodShader(col, seed, false, 0.5, 0.3))
    : mat === 'metal' ? (q: Ctx) => texRect(q, x, y, w + 1, h + 1, metalShader(col, seed, false, 0.08, 0.06))
      : (q: Ctx) => texRect(q, x, y, w + 1, h + 1, noiseShader(col, seed, 4, 0.06, 0.04));
  litFill(g, x, y, w, h, col, { light, dark: 0.35, bevel: 1.2, outline: ink, lw: 1.4, paint });
}
function box(g: Ctx, x: number, y: number, w: number, h: number, r: number, col: string, mat: 'metal' | 'wood' | 'poly' | 'plain' | 'fabric' = 'plain', seed = 1, light = 0.28) {
  rrPath(g, x, y, w, h, r);
  const paint = mat === 'wood' ? (q: Ctx) => texRect(q, x, y, w, h, woodShader(col, seed)) : mat === 'metal' ? (q: Ctx) => texRect(q, x, y, w, h, metalShader(col, seed))
    : mat === 'fabric' ? (q: Ctx) => texRect(q, x, y, w, h, fabricShader(col, seed)) : (q: Ctx) => texRect(q, x, y, w, h, noiseShader(col, seed, 5, 0.06, 0.04));
  litFill(g, x, y, w, h, col, { light, dark: 0.35, bevel: 1.5, outline: ink, lw: 1.5, paint });
}
function rot(g: Ctx, a: number, f: () => void, k = 1) { g.save(); g.translate(N / 2, N / 2); g.rotate(a); g.scale(k, k); g.translate(-N / 2, -N / 2); f(); g.restore(); }
function shine(g: Ctx, x: number, y: number, w: number, a = 0.5) { g.fillStyle = `rgba(255,255,250,${a})`; g.fillRect(x, y, w, 1.2); }
function label(g: Ctx, text: string, x: number, y: number, size: number, col: string) { g.fillStyle = col; g.font = `bold ${size}px sans-serif`; g.textAlign = 'center'; g.fillText(text, x, y); }

// ---- weapons (side view, muzzle to the right) ---------------------------------------
const GUN = '#2c2f31', GUN2 = '#3a3d40', POLY = '#262729', WOOD = '#6a4a2c';
const W: Record<string, Draw> = {
  pistol: (g) => rot(g, -0.1, () => {
    part(g, [[30, 52], [42, 52], [46, 74], [36, 76], [28, 58]], POLY, 'poly', 11); // grip
    g.strokeStyle = 'rgba(255,255,255,0.08)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(32 + k * 3, 58); g.lineTo(37 + k * 3, 73); g.stroke(); }
    part(g, [[26, 38], [74, 38], [74, 50], [26, 50]], GUN2, 'metal', 12); // slide
    for (let x = 30; x < 42; x += 3) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, 39, 1.2, 10); }
    part(g, [[38, 50], [62, 50], [62, 55], [38, 55]], POLY, 'poly', 13);
    g.strokeStyle = ink; g.lineWidth = 2; g.beginPath(); g.arc(46, 56, 5, 0, Math.PI); g.stroke();
    shine(g, 30, 40, 40); g.fillStyle = '#111'; g.fillRect(71, 42, 3, 3);
  }, 1.45),
  revolver: (g) => rot(g, 0, () => {
    part(g, [[24, 54], [34, 52], [40, 74], [28, 77], [22, 62]], WOOD, 'wood', 21);
    part(g, [[30, 40], [46, 38], [48, 56], [32, 56]], GUN, 'metal', 22);
    box(g, 38, 40, 14, 15, 4, '#45484b', 'metal', 23); // cylinder
    for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(40, 43 + k * 4, 10, 1.2); }
    part(g, [[50, 41], [82, 41], [82, 48], [50, 48]], GUN2, 'metal', 24); part(g, [[50, 48], [74, 48], [74, 52], [50, 52]], GUN, 'metal', 25);
    g.strokeStyle = ink; g.lineWidth = 2; g.beginPath(); g.arc(40, 58, 5, 0, Math.PI); g.stroke();
    part(g, [[28, 36], [34, 36], [36, 41], [30, 41]], GUN, 'metal', 26); shine(g, 52, 42, 28);
  }, 1.4),
  smg: (g) => rot(g, -0.35, () => {
    part(g, [[10, 44], [28, 42], [28, 50], [12, 54]], POLY, 'poly', 31); // folding stock
    part(g, [[26, 38], [66, 38], [66, 52], [26, 52]], GUN2, 'metal', 32);
    part(g, [[66, 42], [84, 42], [84, 47], [66, 47]], GUN, 'metal', 33);
    part(g, [[40, 52], [48, 52], [46, 76], [38, 76]], POLY, 'poly', 34); // magazine
    part(g, [[52, 52], [60, 52], [62, 66], [54, 67]], POLY, 'poly', 35);
    part(g, [[30, 34], [40, 34], [40, 38], [30, 38]], GUN, 'metal', 36); shine(g, 28, 39, 36);
  }, 1.2),
  shotgun: (g) => rot(g, -0.5, () => {
    part(g, [[2, 48], [24, 42], [28, 50], [6, 58]], WOOD, 'wood', 41);
    part(g, [[24, 41], [44, 41], [44, 51], [26, 52]], GUN, 'metal', 42);
    part(g, [[44, 42], [94, 42], [94, 46], [44, 46]], GUN2, 'metal', 43); // barrel
    part(g, [[52, 46], [72, 46], [72, 52], [52, 52]], WOOD, 'wood', 44); // pump
    for (let x = 55; x < 70; x += 3) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, 47, 1.2, 4); }
    part(g, [[72, 46], [92, 46], [92, 49], [72, 49]], GUN, 'metal', 45); shine(g, 46, 43, 46);
  }),
  assault_rifle: (g) => rot(g, -0.5, () => {
    part(g, [[0, 44], [18, 41], [18, 53], [2, 56]], POLY, 'poly', 51);
    part(g, [[18, 39], [52, 39], [52, 51], [18, 51]], '#3a3c34', 'metal', 52);
    part(g, [[52, 40], [74, 40], [74, 50], [52, 50]], '#2a2c28', 'poly', 53); // handguard
    for (let x = 55; x < 72; x += 4) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, 42, 2, 5); }
    part(g, [[74, 43], [94, 43], [94, 46], [74, 46]], GUN, 'metal', 54);
    part(g, [[34, 51], [42, 51], [44, 70], [36, 72]], POLY, 'poly', 55); // curved mag
    part(g, [[24, 51], [30, 51], [28, 63], [22, 62]], POLY, 'poly', 56);
    part(g, [[26, 33], [46, 33], [46, 39], [26, 39]], GUN, 'metal', 57); // optic rail/scope
    ellipse(g, 44, 36, 2.5, 2.5, '#5a7a8a', { lw: 0.8 }); shine(g, 20, 40, 30);
  }),
  hunting_rifle: (g) => rot(g, -0.5, () => {
    part(g, [[0, 47], [16, 42], [44, 44], [44, 52], [20, 52], [4, 58]], WOOD, 'wood', 61);
    part(g, [[44, 43], [74, 43], [74, 50], [44, 50]], WOOD, 'wood', 62);
    part(g, [[34, 40], [58, 40], [58, 45], [34, 45]], GUN, 'metal', 63);
    part(g, [[58, 41], [96, 41], [96, 44], [58, 44]], GUN2, 'metal', 64);
    box(g, 30, 30, 34, 7, 3, '#1e2022', 'metal', 65); ellipse(g, 63, 33.5, 2.5, 3.5, '#5a7a8a', { lw: 0.8 }); // scope
    part(g, [[44, 39], [48, 36], [50, 39]], GUN, 'metal', 66); shine(g, 32, 31, 30);
  }),
  knife: (g) => rot(g, -0.7, () => {
    part(g, [[14, 44], [40, 43], [40, 53], [14, 52]], '#2a2a26', 'poly', 71);
    for (let x = 18; x < 38; x += 4) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, 45, 1.5, 6); }
    part(g, [[40, 40], [44, 40], [44, 56], [40, 56]], '#6a6c6e', 'metal', 72);
    part(g, [[44, 42], [78, 43], [88, 48], [76, 53], [44, 53]], '#9aa0a2', 'metal', 73, 0.45);
    g.strokeStyle = 'rgba(40,40,40,0.4)'; g.beginPath(); g.moveTo(46, 49); g.lineTo(80, 49); g.stroke();
    for (let x = 48; x < 64; x += 3) { g.strokeStyle = 'rgba(30,30,30,0.6)'; g.beginPath(); g.moveTo(x, 42); g.lineTo(x + 1.5, 44.5); g.stroke(); }
  }),
  bat: (g) => rot(g, -0.7, () => {
    part(g, [[8, 46], [12, 45], [48, 44], [88, 41], [92, 46], [88, 52], [48, 50], [12, 50], [8, 49]], '#8a6a42', 'wood', 81, 0.4);
    g.fillStyle = '#2a2a2a'; g.fillRect(10, 45, 22, 5); g.strokeStyle = 'rgba(255,255,255,0.15)'; for (let x = 12; x < 32; x += 3) { g.beginPath(); g.moveTo(x, 45); g.lineTo(x + 2, 50); g.stroke(); }
    ellipse(g, 9, 47.5, 2.5, 4, '#6a5034', { lw: 1 });
    // dried blood & nails
    g.fillStyle = 'rgba(90,14,12,0.7)'; g.beginPath(); g.ellipse(76, 46, 8, 3, 0, 0, TAU); g.fill();
    for (const x of [70, 80, 86]) { g.fillStyle = '#8a8a84'; g.fillRect(x, 39, 1.5, 4); }
  }),
  machete: (g) => rot(g, -0.7, () => {
    part(g, [[8, 45], [30, 44], [30, 53], [8, 52]], '#3a2a1e', 'wood', 91);
    for (const x of [14, 24]) { g.fillStyle = '#b0a890'; g.beginPath(); g.arc(x, 48.5, 1.5, 0, TAU); g.fill(); }
    part(g, [[30, 43], [80, 40], [92, 44], [88, 52], [30, 53]], '#8a8e8a', 'metal', 92, 0.4);
    g.fillStyle = 'rgba(200,205,205,0.4)'; g.fillRect(32, 50, 54, 1.5);
    g.fillStyle = 'rgba(110,56,28,0.5)'; g.beginPath(); g.ellipse(60, 46, 10, 3, 0, 0, TAU); g.fill();
  }),
};

// ---- ammo --------------------------------------------------------------------------
function round(g: Ctx, x: number, y: number, len: number, d: number, case_: string, tip: string, a = 0) {
  g.save(); g.translate(x, y); g.rotate(a);
  rrPath(g, 0, -d / 2, len * 0.62, d, 1); litFill(g, 0, -d / 2, len * 0.62, d, case_, { light: 0.5, dark: 0.35, lw: 1.1, outline: ink, bevel: 0.8 });
  g.beginPath(); g.moveTo(len * 0.62, -d / 2 + 0.6); g.quadraticCurveTo(len, -d * 0.2, len, 0); g.quadraticCurveTo(len, d * 0.2, len * 0.62, d / 2 - 0.6); g.closePath();
  litFill(g, len * 0.6, -d / 2, len * 0.4, d, tip, { light: 0.45, lw: 1.1, outline: ink, bevel: 0.6 });
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(2, -d / 2 + 0.5, 1, d - 1);
  g.restore();
}
function ammoBox(g: Ctx, col: string, text: string, sub: string, seed: number) {
  // box in 3/4: top face + front face
  poly(g, [[16, 36], [54, 30], [80, 38], [42, 45]]); litFill(g, 16, 30, 64, 15, col, { light: 0.35, lw: 1.4, outline: ink });
  poly(g, [[16, 36], [42, 45], [42, 72], [16, 62]]); litFill(g, 16, 36, 26, 36, col, { light: 0.05, dark: 0.45, lw: 1.4, outline: ink });
  poly(g, [[42, 45], [80, 38], [80, 64], [42, 72]]); litFill(g, 42, 38, 38, 34, col, { light: 0.2, dark: 0.3, lw: 1.4, outline: ink, paint: (q) => texRect(q, 42, 38, 39, 35, noiseShader(col, seed, 4, 0.05)) });
  g.save(); g.transform(1, -0.19, 0, 1, 0, 0); label(g, text, 61, 70, 13, 'rgba(235,230,215,0.9)'); label(g, sub, 61, 80, 7, 'rgba(235,230,215,0.65)'); g.restore();
}
const AMMO: Record<string, Draw> = {
  ammo_9mm: (g) => { ammoBox(g, '#4a5a6a', '9mm', 'LUGER 50', 101); for (let k = 0; k < 3; k++) round(g, 20 + k * 9, 82 - k * 2, 14, 6, '#b08a3a', '#9a6a3a', -1.3); },
  ammo_357: (g) => { ammoBox(g, '#6a3a2e', '.357', 'MAGNUM', 102); for (let k = 0; k < 3; k++) round(g, 18 + k * 9, 84 - k * 2, 18, 6.5, '#b8b4a8', '#8a6a4a', -1.3); },
  ammo_12g: (g) => { ammoBox(g, '#2e4a3a', '12 GA', 'BUCKSHOT', 103); for (let k = 0; k < 2; k++) { g.save(); g.translate(16 + k * 13, 84); g.rotate(-1.3); box(g, 0, -5.5, 16, 11, 2, '#8a2420', 'plain', 104 + k); box(g, -5, -6, 6, 12, 1, '#b8943a', 'metal', 106); g.restore(); } },
  ammo_556: (g) => { ammoBox(g, '#4e5638', '5.56', 'NATO M855', 107); for (let k = 0; k < 3; k++) round(g, 16 + k * 8, 86 - k * 2, 24, 5.5, '#b08a3a', '#5a7a3a', -1.3); },
  ammo_308: (g) => { ammoBox(g, '#5a4a32', '.308', 'WIN 20', 108); for (let k = 0; k < 2; k++) round(g, 18 + k * 10, 88 - k * 2, 28, 6.5, '#b08a3a', '#8a5a3a', -1.3); },
};

// ---- armor / backpacks -------------------------------------------------------------
function helmet(g: Ctx, col: string, seed: number, extra: (g: Ctx) => void) {
  g.beginPath(); g.moveTo(14, 64); g.bezierCurveTo(14, 18, 82, 18, 82, 64); g.closePath();
  litFill(g, 14, 22, 68, 42, col, { radial: true, light: 0.35, dark: 0.4, outline: ink, lw: 1.6, paint: (q) => texRect(q, 10, 18, 76, 50, noiseShader(col, seed, 5, 0.08)) });
  extra(g);
}
function garment(g: Ctx, col: string, seed: number, hood: boolean, extra: (g: Ctx) => void) {
  const body = [[30, 22], [40, 18], [56, 18], [66, 22], [84, 34], [88, 60], [78, 62], [72, 44], [72, 82], [24, 82], [24, 44], [18, 62], [8, 60], [12, 34]];
  poly(g, body); litFill(g, 8, 18, 80, 64, col, { light: 0.25, dark: 0.35, outline: ink, lw: 1.6, paint: (q) => texRect(q, 8, 18, 81, 65, fabricShader(col, seed, 0.05, 0.14)) });
  if (hood) { g.beginPath(); g.ellipse(48, 24, 14, 9, 0, 0, Math.PI); litFill(g, 34, 18, 28, 16, col, { light: 0.1, dark: 0.4, outline: ink, lw: 1.2 }); }
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(24, 46); g.lineTo(26, 80); g.moveTo(72, 46); g.lineTo(70, 80); g.stroke();
  extra(g);
}
function vest(g: Ctx, col: string, seed: number, extra: (g: Ctx) => void) {
  const body = [[24, 20], [38, 18], [44, 30], [52, 30], [58, 18], [72, 20], [76, 40], [74, 82], [22, 82], [20, 40]];
  poly(g, body); litFill(g, 20, 18, 56, 64, col, { light: 0.25, dark: 0.35, outline: ink, lw: 1.6, paint: (q) => texRect(q, 20, 18, 57, 65, fabricShader(col, seed, 0.07, 0.12)) });
  extra(g);
}
function pack(g: Ctx, col: string, seed: number, h: number, extra: (g: Ctx) => void) {
  for (const x of [26, 64]) { rrPath(g, x, 16, 6, 30, 3); litFill(g, x, 16, 6, 30, '#2a2a24', { lw: 1.2, outline: ink }); }
  box(g, 20, 92 - h - 6, 56, h, 14, col, 'fabric', seed);
  extra(g);
}
const ARMOR: Record<string, Draw> = {
  cap: (g) => {
    g.beginPath(); g.ellipse(62, 66, 26, 9, -0.1, 0, TAU); litFill(g, 36, 56, 52, 18, '#3a4a5e', { light: 0.2, outline: ink, lw: 1.4 }); // brim
    g.beginPath(); g.moveTo(14, 66); g.bezierCurveTo(14, 26, 70, 22, 72, 64); g.closePath(); litFill(g, 14, 28, 58, 38, '#4a5a6e', { radial: true, light: 0.3, outline: ink, lw: 1.6, paint: (q) => texRect(q, 14, 26, 60, 42, fabricShader('#4a5a6e', 201)) });
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.moveTo(42, 30); g.quadraticCurveTo(40, 48, 42, 64); g.stroke();
    ellipse(g, 43, 30, 3, 2, '#4a5a6e', { lw: 1 }); box(g, 30, 52, 16, 6, 1, '#8a8a80', 'plain', 202);
  },
  bike_helmet: (g) => helmet(g, '#3a7a8a', 211, (q) => { q.fillStyle = 'rgba(10,10,10,0.7)'; for (let k = 0; k < 4; k++) { q.beginPath(); q.ellipse(28 + k * 13, 40 + Math.abs(1.5 - k) * 3, 4, 8, 0.3 - k * 0.2, 0, TAU); q.fill(); } q.strokeStyle = '#1a1a1a'; q.lineWidth = 2; q.beginPath(); q.moveTo(22, 64); q.lineTo(36, 82); q.lineTo(60, 82); q.lineTo(74, 64); q.stroke(); }),
  riot_helmet: (g) => helmet(g, '#2a2e34', 221, (q) => { q.beginPath(); q.moveTo(18, 48); q.bezierCurveTo(30, 42, 66, 42, 78, 48); q.lineTo(80, 74); q.bezierCurveTo(60, 80, 36, 80, 16, 74); q.closePath(); const gr = q.createLinearGradient(16, 44, 80, 78); gr.addColorStop(0, 'rgba(180,210,220,0.65)'); gr.addColorStop(0.5, 'rgba(70,90,100,0.45)'); gr.addColorStop(1, 'rgba(40,50,60,0.6)'); q.fillStyle = gr; q.fill(); q.strokeStyle = ink; q.lineWidth = 1.4; q.stroke(); q.fillStyle = 'rgba(255,255,255,0.45)'; q.fillRect(26, 50, 22, 2); label(q, 'POLICE', 48, 36, 8, 'rgba(220,220,210,0.8)'); }),
  military_helmet: (g) => helmet(g, '#4e5636', 231, (q) => { q.strokeStyle = 'rgba(20,20,10,0.6)'; q.lineWidth = 2.5; q.beginPath(); q.moveTo(16, 50); q.bezierCurveTo(40, 40, 60, 40, 80, 50); q.stroke(); for (let k = 0; k < 14; k++) { q.fillStyle = ['rgba(70,60,40,0.5)', 'rgba(40,50,30,0.5)', 'rgba(90,80,50,0.4)'][k % 3]; q.beginPath(); q.ellipse(22 + (k * 37) % 56, 32 + (k * 13) % 26, 5, 3, k, 0, TAU); q.fill(); } q.strokeStyle = '#2a2a1e'; q.lineWidth = 2; q.beginPath(); q.moveTo(22, 64); q.lineTo(30, 84); q.moveTo(74, 64); q.lineTo(66, 84); q.stroke(); }),
  hoodie: (g) => garment(g, '#5a5a5e', 241, true, (q) => { q.strokeStyle = '#d8d4c8'; q.lineWidth = 1.2; q.beginPath(); q.moveTo(44, 30); q.lineTo(43, 44); q.moveTo(52, 30); q.lineTo(53, 44); q.stroke(); rrPath(q, 34, 58, 28, 14, 3); q.strokeStyle = 'rgba(0,0,0,0.35)'; q.stroke(); }),
  leather_jacket: (g) => garment(g, '#3a2a22', 251, false, (q) => { q.strokeStyle = '#9a968a'; q.lineWidth = 1.5; q.beginPath(); q.moveTo(48, 22); q.lineTo(52, 82); q.stroke(); q.fillStyle = 'rgba(255,240,220,0.15)'; q.beginPath(); q.moveTo(40, 18); q.lineTo(48, 34); q.lineTo(40, 40); q.lineTo(32, 22); q.fill(); q.beginPath(); q.moveTo(56, 18); q.lineTo(48, 34); q.lineTo(58, 40); q.lineTo(64, 22); q.fill(); for (let k = 0; k < 3; k++) { q.fillStyle = 'rgba(255,240,220,0.12)'; q.fillRect(28 + k * 14, 50 + k * 6, 10, 1.5); } }),
  police_vest: (g) => vest(g, '#2a3446', 261, (q) => { box(q, 30, 46, 36, 12, 2, '#1e2430', 'plain', 262); label(q, 'POLICE', 48, 55.5, 9, '#d8d4c4'); q.fillStyle = '#b8a040'; q.beginPath(); q.moveTo(36, 34); q.lineTo(40, 30); q.lineTo(44, 34); q.lineTo(40, 40); q.fill(); for (const x of [28, 60]) { rrPath(q, x, 64, 10, 14, 2); litFill(q, x, 64, 10, 14, '#222a38', { lw: 1, outline: ink }); } }),
  military_vest: (g) => vest(g, '#4e5636', 271, (q) => { for (let i = 0; i < 3; i++) { box(q, 26 + i * 15, 52, 13, 22, 2, '#454c30', 'fabric', 272 + i); q.fillStyle = 'rgba(0,0,0,0.3)'; q.fillRect(27 + i * 15, 57, 11, 1.5); } q.strokeStyle = 'rgba(20,20,10,0.5)'; q.lineWidth = 1; for (let y = 36; y < 50; y += 4) { q.beginPath(); q.moveTo(26, y); q.lineTo(70, y); q.stroke(); } }),
  small_backpack: (g) => pack(g, '#4a5a6e', 281, 52, (q) => { box(q, 30, 64, 36, 18, 6, '#3e4c5e', 'fabric', 282); q.strokeStyle = '#c8c4b4'; q.lineWidth = 1; q.beginPath(); q.moveTo(26, 50); q.quadraticCurveTo(48, 44, 70, 50); q.stroke(); }),
  hiking_backpack: (g) => pack(g, '#6a3a2a', 291, 66, (q) => { box(q, 22, 12, 52, 12, 6, '#4e5a3a', 'fabric', 292); for (const x of [28, 64]) { q.fillStyle = '#1e1e1a'; q.fillRect(x, 10, 4, 16); } box(q, 30, 60, 36, 22, 6, '#5a3226', 'fabric', 293); q.fillStyle = '#c8b850'; q.fillRect(46, 44, 4, 8); }),
  military_backpack: (g) => pack(g, '#4e5636', 301, 64, (q) => { q.strokeStyle = 'rgba(20,20,10,0.5)'; q.lineWidth = 1.2; for (let y = 34; y < 54; y += 5) { q.beginPath(); q.moveTo(24, y); q.lineTo(72, y); q.stroke(); } for (const x of [18, 66]) box(q, x, 56, 14, 24, 3, '#454c30', 'fabric', 302 + x); box(q, 34, 58, 28, 22, 3, '#454c30', 'fabric', 305); }),
};

// ---- consumables ------------------------------------------------------------------
const CONS: Record<string, Draw> = {
  bandage: (g) => { g.beginPath(); g.ellipse(40, 50, 20, 26, 0, 0, TAU); litFill(g, 20, 24, 40, 52, '#cfcabb', { radial: true, light: 0.3, outline: ink, lw: 1.5, paint: (q) => texRect(q, 20, 24, 40, 52, fabricShader('#cfcabb', 311, 0.1, 0.06)) }); g.beginPath(); g.ellipse(40, 50, 7, 9, 0, 0, TAU); g.fillStyle = '#6a665c'; g.fill(); g.stroke(); box(g, 40, 58, 46, 16, 2, '#c8c2b2', 'fabric', 312); g.fillStyle = 'rgba(120,20,16,0.5)'; g.beginPath(); g.ellipse(74, 66, 6, 4, 0, 0, TAU); g.fill(); },
  medkit: (g) => { box(g, 14, 28, 68, 50, 6, '#a82a24', 'plain', 321); box(g, 38, 20, 20, 10, 3, '#3a3a3a', 'plain', 322); g.fillStyle = '#e8e4d8'; g.fillRect(40, 42, 16, 26); g.fillRect(35, 47, 26, 16); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.strokeRect(14, 50, 68, 1); shine(g, 18, 31, 60, 0.35); },
  painkillers: (g) => { box(g, 28, 30, 40, 52, 6, '#c8702a', 'plain', 331, 0.45); g.fillStyle = 'rgba(255,180,90,0.25)'; g.fillRect(32, 34, 6, 44); box(g, 26, 18, 44, 14, 3, '#e8e4d8', 'plain', 332); for (let x = 30; x < 68; x += 4) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, 19, 1.5, 12); } box(g, 30, 46, 36, 22, 1, '#e4dccc', 'plain', 333); label(g, 'Rx', 48, 61, 12, '#8a2420'); ellipse(g, 76, 80, 5, 3.5, '#e8e4d8', { lw: 1 }); },
  canned_food: (g) => { g.beginPath(); g.ellipse(48, 30, 22, 7, 0, 0, TAU); litFill(g, 26, 23, 44, 14, '#a8aaa8', { light: 0.5, lw: 1.4, outline: ink }); rrPath(g, 26, 30, 44, 50, 3); litFill(g, 26, 30, 44, 50, '#9a9c9a', { light: 0.4, lw: 1.4, outline: ink, paint: (q) => { const gr = q.createLinearGradient(26, 0, 70, 0); gr.addColorStop(0, '#6a6c6a'); gr.addColorStop(0.3, '#d0d2d0'); gr.addColorStop(1, '#5a5c5a'); q.fillStyle = gr; q.fillRect(26, 30, 44, 50); } }); g.fillStyle = '#8a3a24'; g.fillRect(26, 40, 44, 28); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(32, 40, 6, 28); label(g, 'BEANS', 48, 58, 9, '#e8d8b0'); g.strokeStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(48, 30, 16, 4.5, 0, 0, TAU); g.stroke(); },
  chips: (g) => { g.beginPath(); g.moveTo(26, 18); g.lineTo(70, 18); g.quadraticCurveTo(80, 50, 72, 84); g.lineTo(24, 84); g.quadraticCurveTo(16, 50, 26, 18); g.closePath(); litFill(g, 16, 18, 64, 66, '#c8a02a', { radial: true, light: 0.4, outline: ink, lw: 1.5 }); g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 28; x < 70; x += 3) g.fillRect(x, 18, 1.2, 5); g.fillRect(24, 79, 48, 1); g.fillStyle = '#8a2a1e'; g.beginPath(); g.ellipse(48, 50, 18, 12, -0.2, 0, TAU); g.fill(); label(g, 'CHIPS', 48, 54, 10, '#f0e0a0'); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(30, 26, 4, 46); },
  mre: (g) => { rot(g, 0.12, () => { box(g, 20, 14, 56, 70, 4, '#7a6a4a', 'plain', 351); g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 22; x < 74; x += 3) g.fillRect(x, 14, 1.2, 6); label(g, 'MEAL, READY', 48, 44, 7, '#2a2418'); label(g, 'TO EAT', 48, 53, 7, '#2a2418'); label(g, 'MENU 12', 48, 68, 9, '#2a2418'); }); },
  water_bottle: (g) => { rrPath(g, 32, 28, 32, 58, 8); const gr = g.createLinearGradient(32, 0, 64, 0); gr.addColorStop(0, 'rgba(150,180,200,0.6)'); gr.addColorStop(0.35, 'rgba(220,235,245,0.75)'); gr.addColorStop(1, 'rgba(90,120,140,0.6)'); g.fillStyle = gr; g.fill(); g.strokeStyle = ink; g.lineWidth = 1.4; g.stroke(); g.fillStyle = 'rgba(80,130,170,0.35)'; g.fillRect(33, 46, 30, 38); box(g, 38, 16, 20, 12, 2, '#2a5aa8', 'plain', 361); g.fillStyle = '#3a6ab0'; g.fillRect(32, 50, 32, 14); label(g, 'H2O', 48, 61, 9, '#e8f0f8'); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(36, 32, 3, 48); },
  soda: (g) => { g.beginPath(); g.ellipse(48, 24, 16, 5, 0, 0, TAU); litFill(g, 32, 19, 32, 10, '#b8b8b4', { light: 0.5, lw: 1.2, outline: ink }); rrPath(g, 32, 24, 32, 58, 4); litFill(g, 32, 24, 32, 58, '#9a2a24', { light: 0.3, lw: 1.4, outline: ink, paint: (q) => { const gr = q.createLinearGradient(32, 0, 64, 0); gr.addColorStop(0, '#5a1814'); gr.addColorStop(0.3, '#c8463a'); gr.addColorStop(1, '#4a1410'); q.fillStyle = gr; q.fillRect(32, 24, 32, 58); } }); g.save(); g.translate(48, 56); g.rotate(-Math.PI / 2); label(g, 'COLA', 0, 4, 11, '#f0e8e0'); g.restore(); g.fillStyle = '#7a7a76'; g.fillRect(44, 21, 8, 2); },
  energy_drink: (g) => { g.beginPath(); g.ellipse(48, 16, 13, 4, 0, 0, TAU); litFill(g, 35, 12, 26, 8, '#b8b8b4', { light: 0.5, lw: 1.2, outline: ink }); rrPath(g, 35, 16, 26, 70, 3); litFill(g, 35, 16, 26, 70, '#1e2420', { light: 0.3, lw: 1.4, outline: ink, paint: (q) => { const gr = q.createLinearGradient(35, 0, 61, 0); gr.addColorStop(0, '#0e100e'); gr.addColorStop(0.3, '#3a4a3a'); gr.addColorStop(1, '#0a0c0a'); q.fillStyle = gr; q.fillRect(35, 16, 26, 70); } }); g.strokeStyle = '#7ad04a'; g.lineWidth = 3; g.beginPath(); g.moveTo(42, 30); g.lineTo(50, 46); g.lineTo(44, 50); g.lineTo(54, 70); g.stroke(); },
};

// ---- materials -------------------------------------------------------------------
const MATS: Record<string, Draw> = {
  scrap: (g, R) => { const cols = ['#6a6e70', '#7a5a3a', '#5a5e60', '#8a8a84', '#6a4a34']; for (let i = 0; i < 7; i++) { const w = R.range(14, 28), h = R.range(8, 16), x = 26 + R.range(0, 40 - w * 0.5), y = 32 + R.range(0, 26); rot(g, R.range(-0.5, 0.5), () => { const pts = [[x, y], [x + w, y + R.range(-3, 3)], [x + w - R.range(0, 6), y + h], [x + R.range(0, 5), y + h + R.range(-3, 3)]]; part(g, pts, R.pick(cols), 'metal', 400 + i, 0.35); }); } ellipse(g, 30, 70, 8, 8, '#5a5c5e', { lw: 1.2 }); g.fillStyle = '#1e1e1e'; g.beginPath(); g.arc(30, 70, 3.5, 0, TAU); g.fill(); },
  wood: (g) => { for (let i = 0; i < 4; i++) { rot(g, -0.35, () => box(g, 6, 22 + i * 12 + (i % 2) * 2, 84, 11, 1.5, ['#7a5e3e', '#6e5236', '#86684a', '#73573a'][i], 'wood', 410 + i)); } g.strokeStyle = '#3a3a34'; g.lineWidth = 3; g.beginPath(); g.moveTo(30, 24); g.lineTo(38, 82); g.moveTo(60, 14); g.lineTo(66, 72); g.stroke(); },
  nails: (g, R) => { for (let i = 0; i < 14; i++) { const x = 20 + R.range(0, 50), y = 26 + R.range(0, 44), a = R.range(0, TAU); g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(1, 1, 22, 2.6); const gr = g.createLinearGradient(0, -1.3, 0, 1.3); gr.addColorStop(0, '#d0d0c8'); gr.addColorStop(1, '#5a5a56'); g.fillStyle = gr; g.fillRect(0, -1.3, 20, 2.6); g.beginPath(); g.moveTo(20, -1.3); g.lineTo(24, 0); g.lineTo(20, 1.3); g.fill(); g.fillRect(-1.5, -3.2, 2.5, 6.4); g.restore(); } },
  cloth: (g) => { for (let i = 0; i < 3; i++) { box(g, 16 + i * 2, 58 - i * 16, 62, 16, 5, ['#6a5a4a', '#4a5a6a', '#7a6a5a'][i], 'fabric', 420 + i); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(22 + i * 2, 64 - i * 16); g.quadraticCurveTo(48, 70 - i * 16, 74 + i * 2, 62 - i * 16); g.stroke(); } },
  gunpowder: (g) => { g.beginPath(); g.ellipse(48, 26, 22, 7, 0, 0, TAU); litFill(g, 26, 19, 44, 14, '#3a3c3e', { light: 0.5, lw: 1.4, outline: ink }); rrPath(g, 26, 26, 44, 56, 3); litFill(g, 26, 26, 44, 56, '#2a2c2e', { light: 0.35, lw: 1.4, outline: ink, paint: (q) => texRect(q, 26, 26, 44, 56, metalShader('#2a2c2e', 431, true)) }); box(g, 30, 40, 36, 26, 1, '#b89a40', 'plain', 432); label(g, 'POWDER', 48, 52, 8, '#2a1e10'); g.fillStyle = '#8a2420'; g.beginPath(); g.moveTo(48, 56); g.lineTo(53, 64); g.lineTo(43, 64); g.fill(); },
  gun_parts: (g) => { part(g, [[14, 40], [56, 40], [56, 52], [14, 52]], GUN2, 'metal', 441); for (let x = 18; x < 30; x += 3) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, 41, 1.2, 10); } g.strokeStyle = '#9a9a92'; g.lineWidth = 2; g.beginPath(); for (let k = 0; k < 9; k++) { const x = 52 + k * 3.4; g.moveTo(x, 66); g.lineTo(x + 1.7, 74); } g.stroke(); box(g, 60, 26, 24, 10, 2, '#3a3c3e', 'metal', 442); ellipse(g, 30, 70, 9, 9, '#5a5c5e', { lw: 1.4 }); g.fillStyle = '#1e1e1e'; g.beginPath(); g.arc(30, 70, 4, 0, TAU); g.fill(); part(g, [[62, 46], [84, 46], [84, 52], [62, 52]], GUN, 'metal', 443); },
  electronics: (g, R) => { rot(g, -0.15, () => { box(g, 14, 22, 68, 52, 3, '#2a5a3a', 'plain', 451, 0.3); g.strokeStyle = 'rgba(200,170,80,0.7)'; g.lineWidth = 1; for (let k = 0; k < 10; k++) { g.beginPath(); const y = 28 + k * 4.5; g.moveTo(18, y); g.lineTo(18 + R.range(10, 30), y); g.lineTo(26 + R.range(10, 30), y + 4); g.stroke(); } box(g, 44, 34, 22, 18, 1, '#1e1e20', 'plain', 452, 0.4); for (let k = 0; k < 5; k++) { g.fillStyle = '#b8b8b0'; g.fillRect(46 + k * 4, 31, 1.5, 3); g.fillRect(46 + k * 4, 52, 1.5, 3); } for (let k = 0; k < 3; k++) ellipse(g, 26 + k * 10, 64, 3.5, 3.5, ['#3a4a8a', '#8a6a2a', '#2a2a2a'][k], { lw: 0.8 }); }); },
  chemicals: (g) => { rrPath(g, 24, 28, 50, 56, 8); litFill(g, 24, 28, 50, 56, '#c8c8b8', { light: 0.35, lw: 1.5, outline: ink, paint: (q) => texRect(q, 24, 28, 50, 56, noiseShader('#c8c8b8', 461, 4, 0.04)) }); box(g, 40, 16, 16, 14, 2, '#2a5aa8', 'plain', 462); rrPath(g, 58, 32, 12, 26, 5); g.strokeStyle = ink; g.lineWidth = 3; g.stroke(); g.fillStyle = '#e8c83a'; g.beginPath(); g.moveTo(49, 44); g.lineTo(64, 70); g.lineTo(34, 70); g.closePath(); g.fill(); g.strokeStyle = '#1a1a1a'; g.lineWidth = 1.5; g.stroke(); label(g, '!', 49, 67, 14, '#1a1a1a'); g.fillStyle = 'rgba(120,180,60,0.4)'; g.fillRect(25, 74, 48, 9); },
};

// ---- structures --------------------------------------------------------------------
function structIcon(sp: Canvas, extra?: (g: Ctx) => void, under?: Canvas): Canvas {
  const { c, g } = canvas(N, N);
  const fit = (img: Canvas) => { const k = Math.min(88 / img.width, 88 / img.height); g.drawImage(img, (N - img.width * k) / 2, (N - img.height * k) / 2, img.width * k, img.height * k); };
  if (under) fit(under);
  fit(sp);
  extra?.(g);
  return c;
}
const flame = (g: Ctx) => { for (const [r, col] of [[16, 'rgba(255,120,30,0.55)'], [10, 'rgba(255,190,80,0.8)'], [5, 'rgba(255,240,190,0.95)']] as [number, string][]) { g.fillStyle = col; g.beginPath(); g.moveTo(48 - r, 50); g.quadraticCurveTo(48 - r, 50 - r * 2.2, 48, 50 - r * 2.8); g.quadraticCurveTo(48 + r, 50 - r * 2.2, 48 + r, 50); g.quadraticCurveTo(48, 50 + r * 0.6, 48 - r, 50); g.fill(); } };

export const ITEM_IDS = [
  'pistol', 'revolver', 'smg', 'shotgun', 'assault_rifle', 'hunting_rifle', 'knife', 'bat', 'machete',
  'ammo_9mm', 'ammo_357', 'ammo_12g', 'ammo_556', 'ammo_308',
  'cap', 'bike_helmet', 'riot_helmet', 'military_helmet', 'hoodie', 'leather_jacket', 'police_vest', 'military_vest',
  'small_backpack', 'hiking_backpack', 'military_backpack',
  'bandage', 'medkit', 'painkillers', 'canned_food', 'chips', 'mre', 'water_bottle', 'soda', 'energy_drink',
  'scrap', 'wood', 'nails', 'cloth', 'gunpowder', 'gun_parts', 'electronics', 'chemicals',
  'cola_mints', 'mints',
];
export const STRUCT_TYPES = ['bed', 'stash', 'workbench', 'wood_wall', 'metal_wall', 'wood_door', 'barricade', 'spike_trap', 'campfire', 'turret'];

export default async function icons(): Promise<ManifestFragment> {
  const t0 = Date.now();
  const all: Record<string, Draw> = { ...W, ...AMMO, ...ARMOR, ...CONS, ...MATS };
  const sheet: { name: string; canvas: Canvas }[] = [];
  const iconMap: Record<string, string> = {};
  ITEM_IDS.forEach((id, i) => {
    const fn = all[id];
    if (!fn && id !== 'cola_mints' && id !== 'mints') throw new Error('icons: no drawing for item ' + id);
    const c = id === 'cola_mints' ? colaIcon() : id === 'mints' ? mintsIcon() : icon(fn, 5000 + i * 31);
    savePng(join(OUT, 'icons', id + '.png'), c);
    sheet.push({ name: id, canvas: c }); iconMap[id] = `icons/${id}.png`;
  });
  const reg = new Registry();
  const st = buildStructures(reg);
  const sIcons: Record<string, Canvas> = {
    bed: structIcon(st.struct_bed), stash: structIcon(st.struct_stash), workbench: structIcon(st.struct_workbench),
    wood_wall: structIcon(st.struct_wood_wall), metal_wall: structIcon(st.struct_metal_wall), wood_door: structIcon(st.struct_wood_door),
    barricade: structIcon(st.struct_barricade), spike_trap: structIcon(st.struct_spike_trap), campfire: structIcon(st.struct_campfire, flame),
    turret: structIcon(st.struct_turret_head, undefined, st.struct_turret_base),
  };
  for (const t of STRUCT_TYPES) { savePng(join(OUT, 'icons', `struct_${t}.png`), sIcons[t]); sheet.push({ name: 'struct_' + t, canvas: sIcons[t] }); iconMap['struct_' + t] = `icons/struct_${t}.png`; }
  spriteSheet(join(PREVIEW, 'icons_sheet.png'), sheet, 1100, '#2a2c2e');
  console.log(`  icons: ${sheet.length} written, ${Date.now() - t0} ms`);
  void blobPath;
  return { icons: iconMap };
}
