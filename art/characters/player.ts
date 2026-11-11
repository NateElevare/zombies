// art/characters/player.ts — player legs/torso poses, armor overlays, backpacks and held weapons.
import { Path2D } from '@napi-rs/canvas';
import { ART_SCALE, canvas, shade, rng, type Ctx, type Frame } from '../lib/core';
import { TAU, lerp, smooth, finish, shadedEllipse, shadedShape, superUnit, ellipseUnit, limb, tex } from '../lib/figure';
import { drawFigure, handPos, type Look, type Pose, type ArmP } from './humanoid';

export const PLAYER_RADIUS = 14;
export const PFRAME = 128;
/** The player figure is drawn 1.3x larger than its design radius so it reads at the same size as zombies (which fill more of their frame). */
export const PLAYER_FIG_SCALE = 1.3;
const S = PFRAME, R = PLAYER_RADIUS * ART_SCALE * PLAYER_FIG_SCALE;
const EDGE = 'rgba(25,20,16,0.45)';

export const PLAYER_LOOK: Look = {
  R, seed: 7, zombie: false, build: 'human',
  skin: '#c19476', shirt: '#4b5034', shirtKind: 'jacket', sleeve: 'long', pants: '#3a4658', denim: true, shoes: '#4e3d2c',
  hair: '#4a4c50', hairKind: 'beanie',
  shoulderW: 0.95, torsoD: 0.5, headR: 0.4, armW: 0.13, legW: 0.16, handR: 0.14, upper: 0.7, fore: 0.68,
  tears: 0, blood: 0, wounds: 0, outline: '#15140f',
};
const HEAD = { x: 0.14, y: 0 }; // fixed head position (R units) in every torso pose, so head armor lines up

const fist = (x: number, y: number, o: Partial<ArmP> = {}): ArmP => ({ x, y, bend: 1, fist: true, ...o });
const feet = { footL: { x: 0.08, y: -0.3 }, footR: { x: -0.08, y: 0.3 } };
/** Build a torso pose from hand targets given in ROOT space (R units); converts to torso-local. */
function tp(brot: number, l: ArmP, r: ArmP, hrot = 0): Pose {
  const c = Math.cos(-brot), s = Math.sin(-brot);
  const loc = (a: ArmP): ArmP => ({ ...a, x: a.x * c - a.y * s, y: a.x * s + a.y * c });
  return { bx: 0, by: 0, brot, hx: HEAD.x, hy: HEAD.y, hrot, armL: loc(l), armR: loc(r), ...feet, legs: false };
}

export type WClass = 'handgun' | 'long' | 'melee' | 'unarmed';
export const TORSO_POSES: Record<string, Pose[]> = {};
export interface HandInfo { hand: [number, number]; offHand: [number, number]; weaponAngle: number; torsoYaw: number }

function buildPoses() {
  // handgun: isosceles two-hand grip
  const hgIdle = tp(0, fist(1.12, -0.05), fist(1.2, 0.04));
  TORSO_POSES.handgun_idle = [hgIdle];
  TORSO_POSES.handgun_shoot = [tp(0.03, fist(0.96, -0.05), fist(1.03, 0.04)), tp(0.01, fist(1.06, -0.05), fist(1.13, 0.04))];
  const hgL: [number, number, number?][] = [[1.0, 0.0], [0.6, -0.72], [0.05, -0.92, 0.7], [0.45, -0.62], [0.92, 0.06], [1.08, -0.04]];
  const hgR: [number, number][] = [[1.0, 0.1], [0.95, 0.16], [0.92, 0.16], [0.95, 0.16], [1.0, 0.12], [1.12, 0.05]];
  TORSO_POSES.handgun_reload = hgL.map((l, i) => tp(i === 2 ? -0.08 : 0, fist(l[0], l[1], { fore: l[2] ?? 1 }), fist(hgR[i][0], hgR[i][1])));
  // long guns: rear hand on the grip, support hand on the handguard, slightly bladed
  const LY = 0.28;
  TORSO_POSES.long_idle = [tp(0.16, fist(1.42, LY - 0.03), fist(0.55, LY + 0.02), -0.1)];
  TORSO_POSES.long_shoot = [tp(0.2, fist(1.28, LY - 0.03), fist(0.42, LY + 0.02), -0.1), tp(0.18, fist(1.36, LY - 0.03), fist(0.5, LY + 0.02), -0.1)];
  const lgL: [number, number, number?][] = [[0.95, LY + 0.05], [0.55, -0.45], [0.05, -0.85, 0.7], [0.45, -0.35], [0.92, LY + 0.06], [1.42, LY - 0.03]];
  TORSO_POSES.long_reload = lgL.map((l, i) => tp(0.16, fist(l[0], l[1], { fore: l[2] ?? 1 }), fist(0.55, LY + 0.04), -0.1 + (i > 0 && i < 5 ? 0.15 : 0)));
  // melee: one weapon held in both hands, sweeping upper-left -> lower-right
  const mel = (th: number, rot: number) => {
    const px = 0.22, py = 0.1, rr = 0.85;
    const hx = px + Math.cos(th) * rr, hy = py + Math.sin(th) * rr;
    return tp(rot, fist(hx - Math.cos(th) * 0.22, hy - Math.sin(th) * 0.22), fist(hx, hy));
  };
  TORSO_POSES.melee_idle = [tp(0.05, fist(0.8, -0.45), fist(0.9, 0.55))];
  const sw = [-1.3, -1.05, -0.45, 0.3, 0.95, 1.2];
  TORSO_POSES.melee_swing = sw.map((th, i) => mel(th, th * 0.32 + (i === 0 ? -0.1 : 0)));
  // unarmed: boxing guard + right straight
  TORSO_POSES.unarmed_idle = [tp(0, fist(0.95, -0.4), fist(0.82, 0.48))];
  const pr: [number, number, number][] = [[0.95, 0.42, -0.05], [1.3, 0.2, -0.16], [1.38, 0.12, -0.2], [1.08, 0.38, -0.1]];
  TORSO_POSES.unarmed_punch = pr.map(([x, y, b]) => tp(b, fist(0.95, -0.4), fist(x, y)));
}
buildPoses();

const MELEE_ANG = { idle: -0.55, swing: [-1.3, -1.05, -0.45, 0.3, 0.95, 1.2] };
function weaponAngle(pose: string, i: number) {
  if (pose === 'melee_idle') return MELEE_ANG.idle;
  if (pose === 'melee_swing') return MELEE_ANG.swing[i];
  if (pose === 'handgun_reload') return [0.25, 0.55, 0.6, 0.55, 0.35, 0.1][i];
  if (pose === 'long_reload') return [0.15, 0.3, 0.35, 0.3, 0.2, 0.05][i];
  return 0;
}

export function buildPlayerFrames(look: Partial<Look> = {}) {
  const frames: Frame[] = [];
  const info: Record<string, HandInfo> = {};
  const L = { ...PLAYER_LOOK, ...look };
  const fin = (c: any) => finish(c, { outline: L.outline, ow: 2.2 });
  // legs
  const legPose = (fl: any, fr: any): Pose => ({ bx: 0, by: 0, brot: 0, hx: 0, hy: 0, hrot: 0, armL: fist(0, 0), armR: fist(0, 0), footL: fl, footR: fr, torso: false, hipX: -0.06 });
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * TAU, s = Math.sin(ph), c = Math.cos(ph);
    const { c: cv, g } = canvas(S, S);
    drawFigure(g, L, legPose({ x: 0.88 * s, y: -0.3, lift: Math.max(0, c), rot: -0.08 }, { x: -0.88 * s, y: 0.3, lift: Math.max(0, -c), rot: 0.08 }), S / 2, S / 2);
    frames.push({ name: `player_legs_walk_${i}`, canvas: fin(cv) });
  }
  { const { c: cv, g } = canvas(S, S); drawFigure(g, L, legPose({ x: 0.1, y: -0.32, rot: -0.15 }, { x: -0.06, y: 0.32, rot: 0.2 }), S / 2, S / 2); frames.push({ name: 'player_legs_idle_0', canvas: fin(cv) }); }
  // torsos
  for (const [pose, list] of Object.entries(TORSO_POSES)) {
    list.forEach((P, i) => {
      const { c: cv, g } = canvas(S, S);
      drawFigure(g, L, P, S / 2, S / 2);
      const name = `player_torso_${pose}_${i}`;
      frames.push({ name, canvas: fin(cv) });
      const hr = handPos(L, P, 1), hl = handPos(L, P, -1);
      const w = (v: number) => Math.round((v / ART_SCALE) * 10) / 10;
      info[name] = { hand: [w(hr.x), w(hr.y)], offHand: [w(hl.x), w(hl.y)], weaponAngle: weaponAngle(pose, i), torsoYaw: Math.round(P.brot * 1000) / 1000 };
    });
  }
  return { frames, info };
}

// ---------------- armor overlays (drawn over the torso, same 128 frame & origin) ----------------
const hx = S / 2 + HEAD.x * R, hy = S / 2, hrad = PLAYER_LOOK.headR * R;
function overlay(draw: (g: Ctx) => void) {
  const { c, g } = canvas(S, S); draw(g);
  return finish(c, { outline: '#15140f', ow: 1.6, shadow: 0.3, sdx: 2, sdy: 2.5, blur: 1.5 });
}
export function buildArmor(): Frame[] {
  const out: Frame[] = [];
  const head = (id: string, f: (g: Ctx) => void) => out.push({ name: `armor_head_${id}`, canvas: overlay(f) });
  const body = (id: string, f: (g: Ctx) => void) => out.push({ name: `armor_body_${id}`, canvas: overlay(f) });
  head('cap', (g) => {
    shadedEllipse(g, hx + hrad * 0.95, hy, hrad * 0.62, hrad * 0.82, 0, '#3f4a36', { edge: EDGE, hi: 0.15 }); // bill
    shadedEllipse(g, hx - hrad * 0.08, hy, hrad * 1.08, hrad * 1.02, 0, '#4a5640', {
      tex: tex('cloth', 4), texA: 0.25, edge: EDGE, hi: 0.3,
      deco: (gg) => { gg.strokeStyle = 'rgba(20,20,10,0.35)'; gg.lineWidth = 1; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; gg.beginPath(); gg.moveTo(0, 0); gg.lineTo(Math.cos(a) * hrad * 1.1, Math.sin(a) * hrad); gg.stroke(); } gg.fillStyle = '#2f3828'; gg.beginPath(); gg.arc(0, 0, 2, 0, TAU); gg.fill(); },
    });
  });
  head('bike_helmet', (g) => {
    const u = superUnit(2.2, 0.9, 1.15, (a) => (Math.cos(a) < -0.5 ? -Math.cos(a) * 0.12 : 0));
    shadedShape(g, { x: hx - hrad * 0.15, y: hy, rot: 0, sx: hrad * 1.3, sy: hrad * 1.1 }, u, '#3c6a8a', {
      edge: EDGE, hi: 0.4,
      deco: (gg, sx, sy) => {
        gg.fillStyle = '#1d2a33';
        for (let i = -2; i <= 2; i++) { gg.beginPath(); gg.ellipse(-sx * 0.1, i * sy * 0.3, sx * 0.42, sy * 0.07, 0, 0, TAU); gg.fill(); }
        gg.fillStyle = 'rgba(230,235,240,0.5)'; gg.fillRect(-sx, -1.2, sx * 2, 2.4);
      },
    });
  });
  head('riot_helmet', (g) => {
    shadedEllipse(g, hx + hrad * 0.75, hy, hrad * 0.55, hrad * 1.0, 0, '#3a4a58', { hi: 0.6, edge: EDGE, deco: (gg) => { gg.fillStyle = 'rgba(160,200,230,0.25)'; gg.fillRect(-20, -20, 40, 40); } }); // visor
    shadedEllipse(g, hx - hrad * 0.05, hy, hrad * 1.22, hrad * 1.15, 0, '#25282c', { hi: 0.35, edge: EDGE, deco: (gg) => { gg.strokeStyle = 'rgba(200,200,200,0.15)'; gg.lineWidth = 1.5; gg.beginPath(); gg.ellipse(0, 0, hrad * 0.95, hrad * 0.9, 0, 0, TAU); gg.stroke(); } });
  });
  head('military_helmet', (g) => {
    shadedEllipse(g, hx - hrad * 0.05, hy, hrad * 1.32, hrad * 1.26, 0, '#4a4f33', { tex: tex('cloth', 6), texA: 0.35, edge: EDGE, hi: 0.3, lo: 0.45,
      deco: (gg) => { // helmet cover netting + band
        gg.strokeStyle = 'rgba(30,30,15,0.35)'; gg.lineWidth = 0.8;
        for (let i = -6; i <= 6; i++) { gg.beginPath(); gg.moveTo(i * 4, -30); gg.lineTo(i * 4 + 20, 30); gg.stroke(); gg.beginPath(); gg.moveTo(i * 4, -30); gg.lineTo(i * 4 - 20, 30); gg.stroke(); }
        gg.strokeStyle = '#2e301f'; gg.lineWidth = 2.5; gg.beginPath(); gg.ellipse(0, 0, hrad * 1.0, hrad * 0.95, 0, 0, TAU); gg.stroke();
      } });
  });
  // body armor: vest-shaped (keeps the shoulder joints clear so arms still read)
  const vx = S / 2 - 0.04 * R, vsx = 0.5 * R, vsy = 0.78 * R;
  const vest = superUnit(2.6, 0.92, 1);
  body('hoodie', (g) => {
    shadedShape(g, { x: vx, y: hy, rot: 0, sx: vsx * 1.02, sy: vsy * 1.08 }, vest, '#5c5f62', { tex: tex('cloth', 2), texA: 0.25, edge: EDGE, deco: (gg) => {
      gg.fillStyle = '#4c4f52'; gg.beginPath(); gg.ellipse(-vsx * 0.1, 0, vsx * 0.55, vsy * 0.48, 0, 0, TAU); gg.fill();
      gg.strokeStyle = 'rgba(15,15,15,0.45)'; gg.lineWidth = 1.5; gg.beginPath(); gg.ellipse(-vsx * 0.02, 0, vsx * 0.36, vsy * 0.3, 0, 0, TAU); gg.stroke();
    } });
  });
  body('leather_jacket', (g) => {
    shadedShape(g, { x: vx, y: hy, rot: 0, sx: vsx * 1.02, sy: vsy * 1.08 }, vest, '#4a3020', { tex: tex('leather', 2), texA: 0.35, edge: EDGE, hi: 0.4, deco: (gg) => {
      gg.strokeStyle = 'rgba(0,0,0,0.4)'; gg.lineWidth = 1.2; gg.beginPath(); gg.moveTo(vsx * 0.2, -vsy); gg.quadraticCurveTo(-vsx * 0.2, 0, vsx * 0.2, vsy); gg.stroke();
      gg.fillStyle = '#3a2418'; gg.beginPath(); gg.ellipse(vsx * 0.78, 0, vsx * 0.3, vsy * 0.38, 0, 0, TAU); gg.fill(); // collar
      gg.fillStyle = 'rgba(255,240,220,0.12)'; gg.beginPath(); gg.ellipse(-vsx * 0.3, -vsy * 0.45, vsx * 0.4, vsy * 0.15, -0.3, 0, TAU); gg.fill();
    } });
  });
  body('police_vest', (g) => {
    shadedShape(g, { x: vx, y: hy, rot: 0, sx: vsx * 1.0, sy: vsy * 0.98 }, superUnit(3.2, 0.9, 1), '#232a38', { tex: tex('cloth', 3), texA: 0.25, edge: EDGE, deco: (gg) => {
      gg.fillStyle = '#c9c7b8'; gg.fillRect(-vsx * 0.55, -vsy * 0.62, vsx * 0.38, vsy * 1.24); // POLICE panel
      gg.fillStyle = '#232a38'; for (let i = 0; i < 6; i++) gg.fillRect(-vsx * 0.5, -vsy * 0.5 + i * vsy * 0.19, vsx * 0.28, vsy * 0.07);
      gg.fillStyle = 'rgba(0,0,0,0.35)'; gg.fillRect(vsx * 0.1, -vsy, 2, vsy * 2);
    } });
  });
  body('military_vest', (g) => {
    shadedShape(g, { x: vx, y: hy, rot: 0, sx: vsx * 1.05, sy: vsy * 1.0 }, superUnit(3.4, 0.9, 1), '#55583a', { tex: tex('cloth', 5), texA: 0.3, edge: EDGE, deco: (gg) => {
      gg.strokeStyle = 'rgba(25,25,12,0.5)'; gg.lineWidth = 1; // MOLLE webbing rows
      for (let i = -4; i <= 4; i++) { gg.beginPath(); gg.moveTo(-vsx, i * vsy * 0.2); gg.lineTo(vsx * 0.4, i * vsy * 0.2); gg.stroke(); }
      for (const y of [-0.55, 0, 0.55]) { // pouches
        gg.fillStyle = '#4a4d31'; gg.fillRect(-vsx * 0.75, y * vsy - vsy * 0.16, vsx * 0.6, vsy * 0.32);
        gg.strokeStyle = 'rgba(15,15,5,0.6)'; gg.strokeRect(-vsx * 0.75, y * vsy - vsy * 0.16, vsx * 0.6, vsy * 0.32);
      }
    } });
  });
  return out;
}

// ---------------- backpacks ----------------
export function buildBackpacks(): Frame[] {
  const out: Frame[] = [];
  const pack = (id: string, w: number, h: number, color: string, extra?: (g: Ctx, x: number, y: number) => void) => {
    const c = overlay((g) => {
      const x = S / 2 - R * 0.42 - w * 0.25, y = S / 2;
      // straps over the shoulders
      for (const s of [-1, 1]) limb(g, x, y + s * h * 0.55, 2.2, S / 2 + R * 0.25, y + s * R * 0.55, 2, shade(color, -0.35), { edge: EDGE });
      shadedShape(g, { x, y, rot: 0, sx: w * 0.5, sy: h * 0.5 }, superUnit(3, 1, 1), color, { tex: tex('cloth', 8), texA: 0.3, edge: EDGE, hi: 0.3, deco: (gg, sx, sy) => {
        gg.fillStyle = shade(color, -0.15); gg.fillRect(-sx * 0.85, -sy * 0.7, sx * 0.55, sy * 1.4); // front pocket
        gg.strokeStyle = 'rgba(10,10,10,0.4)'; gg.lineWidth = 1; gg.strokeRect(-sx * 0.85, -sy * 0.7, sx * 0.55, sy * 1.4);
        gg.strokeStyle = 'rgba(200,200,190,0.35)'; gg.beginPath(); gg.moveTo(sx * 0.2, -sy * 0.9); gg.lineTo(sx * 0.2, sy * 0.9); gg.stroke(); // zipper
      } });
      if (extra) extra(g, x, y);
    });
    out.push({ name: `backpack_${id}`, canvas: c });
  };
  pack('small', R * 0.42, R * 0.9, '#2f3a4e');
  pack('hiking', R * 0.58, R * 1.1, '#7a3d36', (g, x, y) => { // bedroll on top
    limb(g, x + R * 0.12, y - R * 0.62, R * 0.13, x + R * 0.12, y + R * 0.62, R * 0.13, '#5a5f3a', { edge: EDGE, deco: (gg, len) => { gg.fillStyle = 'rgba(0,0,0,0.4)'; gg.fillRect(len * 0.25, -8, 2, 16); gg.fillRect(len * 0.72, -8, 2, 16); } });
  });
  pack('military', R * 0.64, R * 1.2, '#4f5536', (g, x, y) => {
    for (const s of [-1, 1]) shadedEllipse(g, x - R * 0.05, y + s * R * 0.62, R * 0.2, R * 0.13, 0, '#454a2f', { edge: EDGE }); // side pouches
  });
  return out;
}

// ---------------- weapons (top-down, facing right; origin at the grip) ----------------
export interface WeaponDef { id: string; cls: WClass; back: number; front: number; w: number }
export const WEAPONS: WeaponDef[] = [
  { id: 'pistol', cls: 'handgun', back: 3, front: 10, w: 4 },
  { id: 'revolver', cls: 'handgun', back: 3, front: 12.5, w: 5 },
  { id: 'smg', cls: 'long', back: 7, front: 17, w: 5 },
  { id: 'shotgun', cls: 'long', back: 13, front: 27, w: 5 },
  { id: 'assault_rifle', cls: 'long', back: 13, front: 29, w: 6 },
  { id: 'hunting_rifle', cls: 'long', back: 15, front: 33, w: 6 },
  { id: 'knife', cls: 'melee', back: 4, front: 12, w: 4 },
  { id: 'bat', cls: 'melee', back: 5, front: 30, w: 6 },
  { id: 'machete', cls: 'melee', back: 5, front: 25, w: 7 },
];
const STEEL = '#3a3d42', BLACK = '#24262a', WOOD = '#6b4a2e';
function rect(g: Ctx, x0: number, x1: number, hw: number, color: string, r = 1.5, hi = 0.25) {
  const p = new Path2D(); p.roundRect(x0, -hw, x1 - x0, hw * 2, r);
  const gr = g.createLinearGradient(0, -hw, 0, hw);
  gr.addColorStop(0, shade(color, hi)); gr.addColorStop(0.45, color); gr.addColorStop(1, shade(color, -0.45));
  g.fillStyle = gr; g.fill(p); g.lineWidth = 1; g.strokeStyle = 'rgba(10,10,10,0.6)'; g.stroke(p);
}
export function buildWeapons() {
  const K = ART_SCALE * PLAYER_FIG_SCALE, pad = 6;
  const frames: Frame[] = [];
  const meta: Record<string, { w: number; h: number; ox: number; oy: number }> = {};
  for (const W of WEAPONS) {
    const w = Math.ceil((W.back + W.front) * K + pad * 2), h = Math.ceil(W.w * K * 2 + pad * 2);
    const ox = W.back * K + pad, oy = h / 2;
    const { c, g } = canvas(w, h);
    g.translate(ox, oy); g.scale(PLAYER_FIG_SCALE, PLAYER_FIG_SCALE);
    const b = -W.back * ART_SCALE, f = W.front * ART_SCALE;
    switch (W.id) {
      case 'pistol': rect(g, b, f, 2.6, BLACK, 1.5); g.fillStyle = 'rgba(255,255,255,0.18)'; for (let x = b + 2; x < b + 8; x += 2) g.fillRect(x, -2.2, 0.8, 4.4); g.fillStyle = '#111'; g.fillRect(f - 2, -0.8, 2, 1.6); break;
      case 'revolver': rect(g, b, 6, 2.6, '#5a4632', 2); rect(g, 0, f, 1.6, STEEL, 1, 0.4); shadedEllipse(g, 4, 0, 5.5, 4.6, 0, '#4a4d52', { hi: 0.5, deco: (gg) => { gg.fillStyle = '#1e1f22'; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; gg.beginPath(); gg.arc(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 0.9, 0, TAU); gg.fill(); } } }); break;
      case 'smg': rect(g, b, b + 8, 1.4, BLACK, 1); rect(g, b + 6, f - 6, 3.4, '#2c2e32', 2); rect(g, f - 8, f, 1.4, STEEL, 0.5, 0.4); rect(g, 2, 8, 4.6, '#1d1e21', 1); break;
      case 'shotgun': rect(g, b, -2, 3.4, WOOD, 3); rect(g, -4, 8, 3.0, BLACK, 1); rect(g, 6, f, 1.8, STEEL, 1, 0.45); rect(g, 18, 34, 3.4, '#5c4027', 2); g.fillStyle = 'rgba(0,0,0,0.35)'; for (let x = 20; x < 33; x += 3) g.fillRect(x, -3.2, 1, 6.4); break;
      case 'assault_rifle': rect(g, b, b + 14, 3.0, BLACK, 2); rect(g, b + 12, 12, 3.4, '#2a2c30', 1); rect(g, 10, 36, 3.8, '#34373b', 1.5); g.fillStyle = 'rgba(0,0,0,0.5)'; for (let x = 13; x < 35; x += 3) g.fillRect(x, -1, 1.6, 2); rect(g, 36, f, 1.4, STEEL, 0.5, 0.4); rect(g, f - 5, f, 2.0, '#1a1b1d', 0.5); rect(g, -6, 6, 2.2, '#16171a', 1, 0.5); break;
      case 'hunting_rifle': rect(g, b, 4, 4.0, WOOD, 4, 0.3); rect(g, 2, 30, 3.0, '#5c4027', 2, 0.3); rect(g, 2, f, 1.6, STEEL, 0.5, 0.45); rect(g, -8, 20, 2.6, '#1b1c1f', 2, 0.5); shadedEllipse(g, 20, 0, 3.2, 3.6, 0, '#1b1c1f', { hi: 0.4 }); shadedEllipse(g, -8, 0, 2.8, 3.2, 0, '#1b1c1f', { hi: 0.4 }); g.fillStyle = 'rgba(120,180,220,0.35)'; g.fillRect(-10, -0.8, 2, 1.6); break;
      case 'knife': rect(g, b, 2, 2.6, '#2a2620', 2); rect(g, 1, 4, 4, '#55585e', 1); {
        const p = new Path2D(); p.moveTo(4, -2.6); p.lineTo(f - 4, -2.2); p.quadraticCurveTo(f, -1, f, 0.2); p.lineTo(4, 2.4); p.closePath();
        const gr = g.createLinearGradient(0, -3, 0, 3); gr.addColorStop(0, '#e2e4e6'); gr.addColorStop(0.5, '#9a9ea4'); gr.addColorStop(1, '#5c6066');
        g.fillStyle = gr; g.fill(p); g.strokeStyle = 'rgba(20,20,20,0.6)'; g.lineWidth = 1; g.stroke(p); } break;
      case 'bat': { const p = new Path2D(); p.moveTo(b, -2.6); p.lineTo(4, -2.4); p.quadraticCurveTo(f * 0.45, -3, f - 5, -5.6); p.quadraticCurveTo(f, -5.6, f, 0); p.quadraticCurveTo(f, 5.6, f - 5, 5.6); p.quadraticCurveTo(f * 0.45, 3, 4, 2.4); p.lineTo(b, 2.6); p.closePath();
        const gr = g.createLinearGradient(0, -6, 0, 6); gr.addColorStop(0, '#d2b48a'); gr.addColorStop(0.45, '#a8865a'); gr.addColorStop(1, '#5e4630');
        g.fillStyle = gr; g.fill(p); g.strokeStyle = 'rgba(30,20,10,0.7)'; g.lineWidth = 1; g.stroke(p);
        rect(g, b, 5, 2.8, '#222', 1.5); shadedEllipse(g, b, 0, 1.6, 3.8, 0, '#2a2a2a');
        const R2 = rng(4); for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(90,15,15,0.7)'; g.beginPath(); g.arc(f - R2.range(3, 16), R2.range(-3, 3), R2.range(1, 2.4), 0, TAU); g.fill(); } } break;
      case 'machete': rect(g, b, 3, 2.8, '#2a2620', 2); {
        const p = new Path2D(); p.moveTo(3, -2.8); p.lineTo(f - 10, -4.2); p.quadraticCurveTo(f, -5.5, f, -1); p.quadraticCurveTo(f - 3, 3.2, f - 12, 3.4); p.lineTo(3, 2.8); p.closePath();
        const gr = g.createLinearGradient(0, -5, 0, 4); gr.addColorStop(0, '#b8bcc0'); gr.addColorStop(0.35, '#80858c'); gr.addColorStop(1, '#45494e');
        g.fillStyle = gr; g.fill(p); g.strokeStyle = 'rgba(20,20,20,0.6)'; g.lineWidth = 1; g.stroke(p);
        g.strokeStyle = 'rgba(240,240,240,0.5)'; g.beginPath(); g.moveTo(6, -2.4); g.lineTo(f - 8, -3.8); g.stroke(); } break;
    }
    const fin = finish(c, { outline: '#121212', ow: 1.2, shadow: 0.3, sdx: 2, sdy: 2.5, blur: 1.5 });
    frames.push({ name: `weapon_${W.id}`, canvas: fin });
    meta[W.id] = { w, h, ox, oy };
  }
  return { frames, meta };
}
export { lerp, smooth, ellipseUnit };
