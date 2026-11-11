// art/characters/humanoid.ts — a small top-down skeletal figure: legs/feet, torso, IK arms with hands, neck and head.
// Poses are expressed in units of the body radius R (px at ART_SCALE), facing +x. Frame center = body root.
import { Path2D } from '@napi-rs/canvas';
import { rng, shade, mix, type Ctx } from '../lib/core';
import {
  TAU, lerp, clamp, limb, shadedEllipse, shadedShape, superUnit, ellipseUnit, ik2, tex, splat, tear, type ShadeOpts,
} from '../lib/figure';

export type ShirtKind = 'tee' | 'tank' | 'plaid' | 'stripes' | 'jacket' | 'hoodie' | 'shirtless' | 'scrubs' | 'suit' | 'overalls';
export type HairKind = 'short' | 'long' | 'bald' | 'patchy' | 'beanie' | 'ponytail' | 'buzz';
export type Build = 'human' | 'brute' | 'lean' | 'bloat' | 'crawler';

export interface Look {
  R: number; seed: number; zombie: boolean; build: Build;
  skin: string; shirt: string; shirt2?: string; shirtKind: ShirtKind; sleeve: 'long' | 'short' | 'none';
  pants: string; denim?: boolean; shoes: string;
  hair: string | null; hairKind: HairKind;
  shoulderW: number; torsoD: number; headR: number; armW: number; legW: number; handR: number; upper: number; fore: number;
  tears: number; blood: number; wounds: number;
  pustule?: string;
  outline?: string;
}
export interface ArmP { x: number; y: number; bend?: number; fore?: number; lift?: number; claw?: number; fist?: boolean; hide?: boolean }
export interface FootP { x: number; y: number; lift?: number; rot?: number }
export interface Pose {
  bx: number; by: number; brot: number; bob?: number;
  hx: number; hy: number; hrot: number; hs?: number;
  armL: ArmP; armR: ArmP;
  footL: FootP; footR: FootP; hipX?: number;
  lie?: number; swell?: number; glow?: number;
  legs?: boolean; torso?: boolean;
}

const BLOOD = ['#5a0f0f', '#6e1310', '#8a1a14'];
const EDGE = 'rgba(25,20,16,0.45)';

/** Draw the figure into g with root at (cx,cy). */
export function drawFigure(g: Ctx, L: Look, P: Pose, cx: number, cy: number) {
  const R = L.R * (P.bob ?? 1), lie = P.lie ?? 0;
  const ox = cx + P.bx * R, oy = cy + P.by * R, rot = P.brot;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const W = (lx: number, ly: number) => ({ x: ox + (lx * cr - ly * sr) * R, y: oy + (lx * sr + ly * cr) * R });
  const skinTex = tex('skin', L.seed % 3 + 1), clothTex = tex(L.denim ? 'denim' : 'cloth', 2);
  const wantLegs = P.legs !== false, wantTorso = P.torso !== false;

  // ---------------- legs & feet (root frame, no torso yaw) ----------------
  if (wantLegs && L.build !== 'crawler') {
    const hipX = P.hipX ?? -0.08, hipY = L.build === 'bloat' ? 0.45 : L.build === 'brute' ? 0.4 : 0.32;
    for (const side of [-1, 1]) {
      const f = side < 0 ? P.footL : P.footR;
      const hx = cx + hipX * R, hy = cy + side * hipY * R;
      const fx = cx + f.x * R, fy = cy + f.y * R, lift = f.lift ?? 0;
      const mx = (hx + fx) / 2, my = (hy + fy) / 2 + side * (0.1 + lie * 0.1) * R;
      const lw = L.legW * R * (1 + lift * 0.12);
      const pantsO: ShadeOpts = { tex: clothTex, texA: 0.2, edge: EDGE, hi: 0.15 };
      const bare = L.build === 'brute' && L.shirtKind === 'shirtless' ? false : false;
      limb(g, hx, hy, lw * 1.1, mx, my, lw, bare ? L.skin : L.pants, pantsO);
      const shin = L.zombie && (L.seed + side) % 3 === 0 ? mix(L.skin, '#3a3a2a', 0.15) : L.pants; // torn trouser leg shows skin
      limb(g, mx, my, lw, fx, fy, lw * 0.8, shin, shin === L.pants ? pantsO : { tex: skinTex, texA: 0.25, edge: EDGE });
      if (shin !== L.pants) limb(g, mx, my, lw * 1.05, lerp(mx, fx, 0.3), lerp(my, fy, 0.3), lw * 1.05, L.pants, pantsO);
      // shoe
      const fr = (f.rot ?? side * 0.12) + 0;
      const sl = L.R * (L.build === 'brute' ? 0.36 : 0.32) * (1 + lift * 0.18) * (1 - lie * 0.25), sw = L.R * (L.build === 'brute' ? 0.17 : 0.14) * (1 + lift * 0.18);
      const bare2 = false;
      shadedEllipse(g, fx + Math.cos(fr) * sl * 0.45, fy + Math.sin(fr) * sl * 0.45, sl, sw, fr, bare2 ? shade(L.skin, -0.1) : L.shoes, {
        tex: tex('leather', 3), texA: 0.25, edge: EDGE, hi: 0.3 + lift * 0.15,
        deco: (gg) => { if (!bare2) { gg.fillStyle = 'rgba(255,255,255,0.08)'; gg.fillRect(-sl, -0.6, sl * 2, 1.2); } },
      });
    }
    // pelvis / belt (player legs layer & bloater) — covered by torso otherwise
    if (!wantTorso || L.build === 'bloat') {
      shadedEllipse(g, cx + hipX * R, cy, L.R * 0.3, L.R * (hipY + 0.2), 0, L.pants, { tex: clothTex, texA: 0.2, edge: EDGE });
      g.fillStyle = 'rgba(30,24,18,0.75)'; g.fillRect(cx + hipX * R + L.R * 0.14, cy - L.R * (hipY + 0.14), L.R * 0.08, L.R * (hipY + 0.14) * 2);
    }
  }
  if (!wantTorso) return;

  // ---------------- crawler gore stump & drag (under torso) ----------------
  const tsx = lerp(L.torsoD, 0.8, lie) * R * (L.build === 'bloat' ? 1 + (P.swell ?? 0) : 1);
  const tsy = L.shoulderW * R * (1 - lie * 0.08) * (L.build === 'bloat' ? 1 + (P.swell ?? 0) * 0.7 : 1);
  const tShift = -0.45 * lie;
  const tc = W(tShift, 0);
  const R2 = rng(L.seed * 97 + 13);
  if (L.build === 'crawler') {
    const s = W(-L.torsoD * 0.9 + tShift, 0);
    // ragged waist stump: dark flesh + bits of spine
    shadedEllipse(g, s.x, s.y, R * 0.42, R * 0.62, rot, '#5c1a16', {
      hi: 0.1, edge: EDGE,
      deco: (gg) => {
        for (let i = 0; i < 7; i++) splat(gg, R2, R2.range(-R * 0.3, R * 0.1), R2.range(-R * 0.5, R * 0.5), R * 0.18, '#3a0a08', 0.9);
        gg.fillStyle = 'rgba(190,175,145,0.85)'; gg.beginPath(); gg.ellipse(-R * 0.12, R * 0.05, R * 0.1, R * 0.06, 0, 0, TAU); gg.fill(); // severed spine
        gg.fillStyle = 'rgba(60,15,12,0.9)'; gg.beginPath(); gg.arc(-R * 0.12, R * 0.05, R * 0.03, 0, TAU); gg.fill();
        gg.fillStyle = '#9c6b5e'; gg.beginPath(); gg.ellipse(-R * 0.2, R * 0.22, R * 0.12, R * 0.07, 0.6, 0, TAU); gg.fill();
      },
    });
    // dangling entrails / torn trouser scraps
    for (const side of [-1, 1]) {
      const a = W(-L.torsoD * 1.0 + tShift, side * 0.3), b = W(-L.torsoD * 1.0 - 0.55 + tShift, side * 0.42 + Math.sin(P.brot * 6 + side) * 0.08);
      limb(g, a.x, a.y, R * 0.08, b.x, b.y, R * 0.04, side < 0 ? '#4a1612' : shade(L.pants, -0.2), { edge: EDGE });
    }
  }

  // ---------------- torso ----------------
  const torsoColor = L.shirtKind === 'shirtless' ? L.skin : L.shirt;
  const torsoUnit = L.build === 'bloat' ? superUnit(2.1, 1.0, 0.95)
    : L.build === 'crawler' ? superUnit(2.3, 0.9, 0.85, (a) => (Math.cos(a) < -0.6 ? Math.sin(a * 9) * 0.06 : 0))
    : superUnit(2.35, 0.92, 1.0);
  shadedShape(g, { x: tc.x, y: tc.y, rot, sx: tsx, sy: tsy }, torsoUnit, torsoColor, {
    tex: L.shirtKind === 'shirtless' || L.build === 'bloat' ? skinTex : clothTex, texA: L.shirtKind === 'shirtless' ? 0.28 : 0.22,
    edge: EDGE, hi: 0.2, lo: 0.55,
    deco: (gg) => torsoDeco(gg, L, P, tsx, tsy, R2),
  });

  // ---------------- arms ----------------
  const shY = L.shoulderW - (L.build === 'bloat' ? 0.25 : 0.14);
  const shX = lerp(L.build === 'bloat' ? 0.05 : 0.02, -0.95, lie) + (L.build === 'crawler' ? 0.25 : 0);
  const arms: [number, ArmP][] = [[-1, P.armL], [1, P.armR]];
  arms.sort((a, b) => (a[1].lift ?? 0) - (b[1].lift ?? 0));
  const sleeveCol = L.shirtKind === 'shirtless' || L.shirtKind === 'tank' ? L.skin : L.shirt;
  for (const [side, A] of arms) {
    if (A.hide) continue;
    const s = W(shX, side * shY);
    const fk = A.fore ?? 1, lift = A.lift ?? 0;
    const l1 = L.upper * R * fk, l2 = L.fore * R * fk;
    const t = W(A.x, A.y);
    const k = ik2(s.x, s.y, t.x, t.y, l1, l2, side * (A.bend ?? 1));
    const aw = L.armW * R * (1 + lift * 0.25);
    const upCol = L.sleeve === 'none' ? L.skin : sleeveCol;
    const foreCol = L.sleeve === 'long' ? sleeveCol : L.skin;
    const armTexU: ShadeOpts = { tex: upCol === L.skin ? skinTex : clothTex, texA: 0.22, edge: EDGE };
    const armTexF: ShadeOpts = {
      tex: foreCol === L.skin ? skinTex : clothTex, texA: 0.22, edge: EDGE,
      deco: L.zombie ? (gg, len, r) => {
        const RR = rng(L.seed * 13 + side * 7);
        if (RR.chance(0.6)) splat(gg, RR, len * RR.range(0.3, 0.8), RR.range(-r * 0.3, r * 0.3), r * 0.7, RR.pick(BLOOD), 0.7);
        if (foreCol === L.skin && RR.chance(0.5)) { gg.strokeStyle = 'rgba(40,10,10,0.7)'; gg.lineWidth = 1.4; gg.beginPath(); gg.moveTo(len * 0.3, -r * 0.4); gg.lineTo(len * 0.55, r * 0.2); gg.stroke(); }
      } : undefined,
    };
    // shoulder cap (deltoid)
    shadedEllipse(g, s.x, s.y, aw * 1.25, aw * 1.15, rot, upCol, { ...armTexU, edge: null });
    limb(g, s.x, s.y, aw * 1.08, k.ex, k.ey, aw * 0.88, upCol, armTexU);
    limb(g, k.ex, k.ey, aw * 0.88, k.hx, k.hy, aw * 0.68, foreCol, armTexF);
    if (L.sleeve === 'short' && upCol !== L.skin) { /* short sleeve: bare forearm already */ }
    if (L.sleeve === 'long' && L.shirtKind !== 'shirtless') { // cuff
      const cxf = lerp(k.ex, k.hx, 0.82), cyf = lerp(k.ey, k.hy, 0.82);
      g.strokeStyle = 'rgba(20,16,12,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.arc(cxf, cyf, aw * 0.7, 0, TAU); g.stroke();
    }
    drawHand(g, L, k.hx, k.hy, Math.atan2(k.hy - k.ey, k.hx - k.ex), A, side, skinTex);
  }

  // ---------------- neck, head ----------------
  const hr = L.headR * R * (P.hs ?? 1);
  const hp = W(P.hx, P.hy), hrot = rot + P.hrot;
  const nb = W(lerp(L.torsoD * 0.55, -0.9, lie) + (L.build === 'bloat' ? 0.4 : 0), 0);
  if (lie < 0.35 && Math.hypot(hp.x - nb.x, hp.y - nb.y) > hr * 0.3) limb(g, nb.x, nb.y, hr * 0.68, hp.x, hp.y, hr * 0.6, L.skin, { tex: skinTex, texA: 0.2, edge: EDGE, lo: 0.25, hi: 0.1 });
  drawHead(g, L, hp.x, hp.y, hr, hrot, lie, P, skinTex, R2);
}

function drawHand(g: Ctx, L: Look, x: number, y: number, a: number, A: ArmP, side: number, skinTex: ReturnType<typeof tex>) {
  const lift = A.lift ?? 0, hr = L.handR * L.R * (1 + lift * 0.3);
  const ca = Math.cos(a), sa = Math.sin(a);
  const claws = L.zombie && !A.fist;
  if (claws) { // thumb under the palm
    const ta = a - side * 1.0;
    limb(g, x, y, hr * 0.3, x + Math.cos(ta) * hr * 1.05, y + Math.sin(ta) * hr * 1.05, hr * 0.2, L.skin, { edge: EDGE });
  }
  shadedEllipse(g, x, y, hr * (A.fist ? 0.95 : 0.85), hr * (A.fist ? 0.85 : 0.75), a, L.skin, {
    tex: skinTex, texA: 0.25, edge: EDGE, hi: 0.25 + lift * 0.1,
    deco: A.fist ? (gg) => { gg.strokeStyle = 'rgba(30,20,15,0.35)'; gg.lineWidth = 1; for (let i = -1; i <= 1; i++) { gg.beginPath(); gg.moveTo(hr * 0.3, i * hr * 0.32); gg.lineTo(hr * 0.75, i * hr * 0.32); gg.stroke(); } } : undefined,
  });
  if (claws) {
    const claw = A.claw ?? 0.5;
    for (let i = 0; i < 4; i++) { // long bony fingers, splayed and curled
      const fa = a + (i - 1.5) * (0.16 + claw * 0.26) + side * 0.05;
      const bx = x + Math.cos(fa) * hr * 0.35, by = y + Math.sin(fa) * hr * 0.35;
      const len = hr * (i === 0 || i === 3 ? 1.05 : 1.35) * (0.75 + claw * 0.4);
      const kx = bx + Math.cos(fa) * len * 0.55, ky = by + Math.sin(fa) * len * 0.55;
      const ca2 = fa - side * (i - 1.5) * 0.05 + (1 - claw) * 0.5 * (i < 2 ? side : -side) * 0.3;
      const ex = kx + Math.cos(ca2) * len * 0.5, ey = ky + Math.sin(ca2) * len * 0.5;
      limb(g, bx, by, hr * 0.27, kx, ky, hr * 0.22, shade(L.skin, -0.04), { edge: EDGE });
      limb(g, kx, ky, hr * 0.22, ex, ey, hr * 0.16, shade(L.skin, -0.1), { edge: EDGE });
      g.fillStyle = 'rgba(45,35,22,0.9)'; g.beginPath(); g.arc(ex, ey, hr * 0.14, 0, TAU); g.fill();
    }
  }
  if (L.zombie && (L.seed + side) % 2 === 0) { // bloody hands
    g.save(); g.globalAlpha = 0.55; g.fillStyle = '#5a0f0f'; g.beginPath(); g.ellipse(x + ca * hr * 0.4, y + sa * hr * 0.4, hr * 0.5, hr * 0.4, a, 0, TAU); g.fill(); g.restore();
  }
}

function torsoDeco(g: Ctx, L: Look, P: Pose, sx: number, sy: number, R: ReturnType<typeof rng>) {
  const k = L.shirtKind, dark = 'rgba(15,12,10,', lite = 'rgba(255,250,240,';
  const lie = P.lie ?? 0;
  // patterns
  if (k === 'plaid') {
    g.globalAlpha = 0.35;
    for (let i = -6; i <= 6; i++) {
      g.fillStyle = shade(L.shirt2 ?? '#222', -0.2); g.fillRect(-sx, i * sy / 5 - 1.5, sx * 2, 3);
      g.fillStyle = shade(L.shirt2 ?? '#222', 0); g.fillRect(i * sy / 5 - 1.5, -sy, 3, sy * 2);
    }
    g.globalAlpha = 0.18; g.fillStyle = '#fff';
    for (let i = -6; i <= 6; i++) { g.fillRect(-sx, i * sy / 5 + 4, sx * 2, 1); g.fillRect(i * sy / 5 + 4, -sy, 1, sy * 2); }
    g.globalAlpha = 1;
  } else if (k === 'stripes') {
    g.fillStyle = shade(L.shirt2 ?? '#ddd', 0, 0.35);
    for (let i = -8; i <= 8; i++) g.fillRect(i * sx / 3.5, -sy, sx / 9, sy * 2);
  } else if (k === 'overalls' || k === 'tank') {
    const strap = k === 'overalls' ? L.shirt2 ?? '#3e5470' : L.shirt;
    if (k === 'tank') { // bare shoulders at the sides
      g.fillStyle = L.skin; g.fillRect(-sx, -sy, sx * 2, sy * 0.38); g.fillRect(-sx, sy * 0.62, sx * 2, sy * 0.38);
    } else {
      g.fillStyle = shade(strap, 0); g.fillRect(-sx, -sy * 0.28, sx * 0.55, sy * 0.56);
    }
    g.fillStyle = shade(strap, -0.05);
    for (const s of [-1, 1]) { g.save(); g.translate(0, s * sy * 0.38); g.rotate(s * 0.15); g.fillRect(-sx, -sy * 0.09, sx * 2, sy * 0.18); g.restore(); }
  } else if (k === 'scrubs') {
    g.fillStyle = shade(L.shirt, -0.25, 0.8); g.beginPath(); g.moveTo(sx * 0.9, -sy * 0.3); g.lineTo(sx * 0.3, 0); g.lineTo(sx * 0.9, sy * 0.3); g.fill();
  } else if (k === 'suit') {
    g.fillStyle = shade(L.shirt, -0.3, 0.8); g.fillRect(-sx, -1, sx * 2, 2); // back seam
  } else if (k === 'jacket') {
    g.strokeStyle = dark + '0.35)'; g.lineWidth = 1.4; // yoke seam + shoulder seams
    g.beginPath(); g.moveTo(sx * 0.15, -sy * 0.9); g.quadraticCurveTo(-sx * 0.15, 0, sx * 0.15, sy * 0.9); g.stroke();
    g.beginPath(); g.moveTo(-sx, 0); g.lineTo(sx * 0.1, 0); g.stroke();
  } else if (k === 'shirtless') {
    // muscle relief: spine groove, shoulder blades, traps
    g.strokeStyle = dark + '0.3)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-sx, 0); g.lineTo(sx * 0.4, 0); g.stroke();
    for (const s of [-1, 1]) {
      g.strokeStyle = dark + '0.25)'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(-sx * 0.15, s * sy * 0.42, sx * 0.55, sy * 0.28, s * 0.3, 0.4, 3.6); g.stroke();
      g.fillStyle = lite + '0.08)'; g.beginPath(); g.ellipse(sx * 0.35, s * sy * 0.3, sx * 0.35, sy * 0.25, 0, 0, TAU); g.fill();
    }
  }
  // collar / neckline at the front
  if (k !== 'shirtless' && L.build !== 'bloat' && lie < 0.6) {
    g.fillStyle = k === 'hoodie' ? shade(L.shirt, -0.35) : k === 'jacket' || k === 'suit' ? shade(L.shirt, -0.3) : shade(L.skin, -0.15);
    g.beginPath(); g.ellipse(sx * 0.82, 0, sx * 0.32, sy * 0.28, 0, 0, TAU); g.fill();
    g.strokeStyle = dark + '0.4)'; g.lineWidth = 1.3; g.beginPath(); g.ellipse(sx * 0.82, 0, sx * 0.34, sy * 0.3, 0, 0, TAU); g.stroke();
  }
  if (k === 'hoodie') { // hood bunched on the upper back
    g.fillStyle = shade(L.shirt, -0.1); g.beginPath(); g.ellipse(sx * 0.15, 0, sx * 0.5, sy * 0.42, 0, 0, TAU); g.fill();
    g.strokeStyle = dark + '0.45)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(sx * 0.2, 0, sx * 0.32, sy * 0.28, 0, 0, TAU); g.stroke();
    g.fillStyle = lite + '0.1)'; g.beginPath(); g.ellipse(0, -sy * 0.12, sx * 0.3, sy * 0.16, 0, 0, TAU); g.fill();
  }
  // cloth folds / wrinkles
  if (k !== 'shirtless' && L.build !== 'bloat') {
    for (let i = 0; i < 4; i++) {
      const s = i % 2 ? 1 : -1, y0 = s * sy * R.range(0.5, 0.85), x0 = R.range(-sx * 0.6, sx * 0.4);
      g.strokeStyle = dark + '0.22)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 - sx * 0.2, y0 * 0.6, x0 - sx * 0.45, y0 * 0.25); g.stroke();
      g.strokeStyle = lite + '0.1)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0 + 2, y0); g.quadraticCurveTo(x0 - sx * 0.2 + 2, y0 * 0.6, x0 - sx * 0.45 + 2, y0 * 0.25); g.stroke();
    }
  }
  // bloater: veiny swollen belly with glowing pustules
  if (L.build === 'bloat') {
    g.strokeStyle = 'rgba(70,40,70,0.35)'; g.lineWidth = 1.3;
    for (let i = 0; i < 9; i++) {
      let x = R.range(-sx * 0.6, sx * 0.6), y = R.range(-sy * 0.6, sy * 0.6);
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += R.range(-8, 8); y += R.range(-8, 8); g.lineTo(x, y); }
      g.stroke();
    }
    // torn shirt remnants around the rim
    g.fillStyle = shade(L.shirt, -0.05, 0.95);
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(-sx * 0.1, s * sy * 0.92, sx * 0.9, sy * 0.22, 0, 0, TAU); g.fill(); }
    const glow = P.glow ?? 0.5;
    const RP = rng(L.seed * 3 + 1);
    for (let i = 0; i < 11; i++) {
      const a = RP.next() * TAU, d = Math.sqrt(RP.next()) * 0.75;
      const x = Math.cos(a) * sx * d, y = Math.sin(a) * sy * d, r = (3 + RP.next() * 5) * (L.R / 40) * (1 + glow * 0.25);
      const halo = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
      halo.addColorStop(0, shade(L.pustule ?? '#c8d84a', 0.2, 0.35 + glow * 0.4)); halo.addColorStop(1, shade(L.pustule ?? '#c8d84a', 0, 0));
      g.fillStyle = halo; g.beginPath(); g.arc(x, y, r * 2.4, 0, TAU); g.fill();
      const pg = g.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, r);
      pg.addColorStop(0, shade(L.pustule ?? '#c8d84a', 0.6 + glow * 0.3)); pg.addColorStop(0.6, L.pustule ?? '#c8d84a'); pg.addColorStop(1, shade(L.pustule ?? '#c8d84a', -0.45));
      g.fillStyle = pg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
  }
  // zombie damage: tears showing skin, wounds, blood
  if (L.zombie) {
    if (k !== 'shirtless') for (let i = 0; i < L.tears; i++) {
      const x = R.range(-sx * 0.7, sx * 0.5), y = R.range(-sy * 0.75, sy * 0.75);
      tear(g, R, x, y, R.range(3, 6.5) * L.R / 30, R.range(2, 4.5) * L.R / 30, R.range(0, TAU), shade(L.skin, -0.3));
      if (R.chance(0.5)) splat(g, R, x, y, 3 * L.R / 30, '#4a0c0c', 0.9);
    }
    for (let i = 0; i < L.wounds; i++) {
      const x = R.range(-sx * 0.6, sx * 0.5), y = R.range(-sy * 0.7, sy * 0.7), a = R.range(0, TAU), len = R.range(5, 10) * L.R / 30;
      g.strokeStyle = '#3a0808'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
      g.strokeStyle = 'rgba(150,40,35,0.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - Math.cos(a) * len + 1, y - Math.sin(a) * len + 1); g.lineTo(x + Math.cos(a) * len + 1, y + Math.sin(a) * len + 1); g.stroke();
    }
    for (let i = 0; i < L.blood; i++) splat(g, R, R.range(-sx * 0.8, sx * 0.8), R.range(-sy * 0.8, sy * 0.8), R.range(4, 10) * L.R / 30, R.pick(BLOOD), R.range(0.45, 0.8));
    // grime
    g.fillStyle = 'rgba(40,35,20,0.12)'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(R.range(-sx, sx), R.range(-sy, sy), R.range(4, 10), R.range(3, 7), R.range(0, 3), 0, TAU); g.fill(); }
  }
}

function drawHead(g: Ctx, L: Look, x: number, y: number, hr: number, rot: number, lie: number, P: Pose, skinTex: ReturnType<typeof tex>, R: ReturnType<typeof rng>) {
  const face = clamp((lie - 0.55) / 0.4, 0, 1);
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const at = (lx: number, ly: number) => ({ x: x + (lx * cr - ly * sr) * hr, y: y + (lx * sr + ly * cr) * hr });
  const skinHead = L.zombie ? mix(L.skin, '#9aa08a', 0.08) : L.skin;
  // long hair behind the head
  if (L.hair && (L.hairKind === 'long' || L.hairKind === 'ponytail') && face < 0.5) {
    const b = at(-0.75, 0);
    if (L.hairKind === 'long') { const b2 = at(-0.45, 0); shadedEllipse(g, b2.x, b2.y, hr * 1.15, hr * 1.12, rot, L.hair, { tex: tex('hair', 4), texA: 0.3, hi: 0.1 }); }
    else { const t = at(-1.25, 0.1); limb(g, b.x, b.y, hr * 0.35, t.x, t.y, hr * 0.2, L.hair, { tex: tex('hair', 4), texA: 0.35, edge: EDGE }); }
  }
  // ears
  for (const s of [-1, 1]) { const e = at(0.05, s * 0.95); shadedEllipse(g, e.x, e.y, hr * 0.22, hr * 0.17, rot, shade(skinHead, -0.08), { edge: EDGE }); }
  // nose peeking past the brow
  if (face < 0.3) { const n = at(0.98, 0); shadedEllipse(g, n.x, n.y, hr * 0.2, hr * 0.15, rot, shade(skinHead, -0.04), { edge: EDGE }); }
  const isBeanie = L.hairKind === 'beanie';
  shadedShape(g, { x, y, rot, sx: hr * 1.08, sy: hr * 0.96 }, ellipseUnit(), skinHead, {
    tex: skinTex, texA: 0.3, edge: EDGE, hi: 0.3, lo: 0.5,
    deco: (gg) => {
      const hc = L.hair;
      if (face > 0) { // lying on the back: face up
        gg.globalAlpha = face;
        gg.fillStyle = 'rgba(25,15,12,0.85)';
        for (const s of [-1, 1]) { gg.beginPath(); gg.ellipse(hr * 0.15, s * hr * 0.36, hr * 0.2, hr * 0.15, 0, 0, TAU); gg.fill(); }
        gg.fillStyle = 'rgba(60,10,10,0.9)'; gg.beginPath(); gg.ellipse(hr * 0.68, 0, hr * 0.14, hr * 0.26, 0, 0, TAU); gg.fill();
        gg.fillStyle = shade(skinHead, 0.12); gg.beginPath(); gg.ellipse(hr * 0.4, 0, hr * 0.12, hr * 0.09, 0, 0, TAU); gg.fill();
        if (hc) { gg.fillStyle = hc; gg.beginPath(); gg.ellipse(-hr * 1.0, 0, hr * 0.42, hr * 1.1, 0, 0, TAU); gg.fill(); }
        gg.globalAlpha = 1;
      }
      if (face < 1) {
        gg.globalAlpha = 1 - face;
        if (isBeanie) {
          gg.fillStyle = hc ?? '#3a3b3d'; gg.beginPath(); gg.ellipse(-hr * 0.22, 0, hr * 1.02, hr * 1.1, 0, 0, TAU); gg.fill();
          gg.globalAlpha = (1 - face) * 0.3; gg.drawImage(tex('cloth', 5), -96, -96); gg.globalAlpha = 1 - face;
          gg.strokeStyle = shade(hc ?? '#3a3b3d', -0.35); gg.lineWidth = hr * 0.28; gg.beginPath(); gg.ellipse(-hr * 0.22, 0, hr * 0.92, hr * 1.0, 0, -1.1, 1.1); gg.stroke();
          gg.strokeStyle = shade(hc ?? '#3a3b3d', 0.12); gg.lineWidth = 1; gg.beginPath(); gg.ellipse(-hr * 0.22, 0, hr * 0.8, hr * 0.88, 0, -1.0, 1.0); gg.stroke();
        } else if (hc && L.hairKind !== 'bald') {
          const cov = L.hairKind === 'buzz' ? 0.92 : 1.02;
          gg.fillStyle = hc; gg.beginPath(); gg.ellipse(-hr * 0.2, 0, hr * 0.96 * cov, hr * 1.04 * cov, 0, 0, TAU); gg.fill();
          { // strands combed front-to-back + crown sheen
            gg.save(); gg.globalAlpha = (1 - face) * (L.hairKind === 'buzz' ? 0.2 : 0.3); gg.drawImage(tex('hair', 4), -96, -96); gg.restore();
            const sh = gg.createRadialGradient(-hr * 0.35, -hr * 0.3, 0, -hr * 0.35, -hr * 0.3, hr * 0.7);
            sh.addColorStop(0, shade(hc, 0.3, 0.35)); sh.addColorStop(1, shade(hc, 0.3, 0));
            gg.fillStyle = sh; gg.beginPath(); gg.arc(-hr * 0.35, -hr * 0.3, hr * 0.7, 0, TAU); gg.fill();
          }
          if (L.hairKind === 'patchy') { // bald patches with scabs
            for (let i = 0; i < 3; i++) {
              const px = R.range(-hr * 0.8, -hr * 0.1), py = R.range(-hr * 0.7, hr * 0.7);
              gg.fillStyle = shade(skinHead, -0.18); gg.beginPath(); gg.ellipse(px, py, hr * R.range(0.12, 0.22), hr * R.range(0.1, 0.18), R.range(0, 3), 0, TAU); gg.fill();
            }
          }
        } else if (L.zombie) { // bald zombie: veins & liver spots
          gg.strokeStyle = 'rgba(60,40,70,0.3)'; gg.lineWidth = 1;
          for (let i = 0; i < 4; i++) { gg.beginPath(); let px = R.range(-hr * 0.6, hr * 0.3), py = R.range(-hr * 0.6, hr * 0.6); gg.moveTo(px, py); for (let j = 0; j < 3; j++) { px += R.range(-5, 5); py += R.range(-5, 5); gg.lineTo(px, py); } gg.stroke(); }
          gg.fillStyle = 'rgba(70,60,30,0.25)'; for (let i = 0; i < 5; i++) { gg.beginPath(); gg.arc(R.range(-hr * 0.7, hr * 0.5), R.range(-hr * 0.7, hr * 0.7), R.range(1, 2.5), 0, TAU); gg.fill(); }
        }
        // brow shadow at the front edge (eye sockets just visible from above)
        if (L.zombie) {
          gg.fillStyle = 'rgba(30,20,20,0.35)';
          for (const s of [-1, 1]) { gg.beginPath(); gg.ellipse(hr * 0.92, s * hr * 0.35, hr * 0.14, hr * 0.2, 0, 0, TAU); gg.fill(); }
        }
        gg.globalAlpha = 1;
      }
      if (L.zombie) {
        if (L.wounds > 2) { // torn scalp: dark crusted wound at the back of the head
          const px = -hr * 0.45, py = (L.seed % 2 ? 1 : -1) * hr * 0.3;
          splat(gg, R, px, py, hr * 0.32, '#3a0808', 0.95);
          gg.fillStyle = 'rgba(170,150,120,0.55)'; gg.beginPath(); gg.ellipse(px, py, hr * 0.12, hr * 0.07, 0.4, 0, TAU); gg.fill();
        }
        if (L.blood > 0) splat(gg, R, R.range(-hr * 0.5, hr * 0.5), R.range(-hr * 0.6, hr * 0.6), hr * 0.35, '#5a0f0f', 0.7);
      }
      { // volumetric rim over hair + skin
        const rg = gg.createRadialGradient(-hr * 0.3, -hr * 0.3, hr * 0.2, 0, 0, hr * 1.15);
        rg.addColorStop(0, 'rgba(255,250,235,0.12)'); rg.addColorStop(0.55, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(10,8,6,0.5)');
        gg.fillStyle = rg; gg.fillRect(-hr * 1.3, -hr * 1.3, hr * 2.6, hr * 2.6);
      }
    },
  });
}

/** Where a hand actually ends up (px offset from root, after IK clamping) — for weapon attachment metadata. */
export function handPos(L: Look, P: Pose, side: -1 | 1) {
  const R = L.R * (P.bob ?? 1), lie = P.lie ?? 0, rot = P.brot, cr = Math.cos(rot), sr = Math.sin(rot);
  const W = (lx: number, ly: number) => ({ x: P.bx * R + (lx * cr - ly * sr) * R, y: P.by * R + (lx * sr + ly * cr) * R });
  const A = side < 0 ? P.armL : P.armR;
  const shY = L.shoulderW - (L.build === 'bloat' ? 0.25 : 0.14), shX = lerp(L.build === 'bloat' ? 0.05 : 0.02, -0.95, lie);
  const s = W(shX, side * shY), t = W(A.x, A.y), fk = A.fore ?? 1;
  const k = ik2(s.x, s.y, t.x, t.y, L.upper * R * fk, L.fore * R * fk, side * (A.bend ?? 1));
  return { x: k.hx, y: k.hy, a: Math.atan2(k.hy - k.ey, k.hx - k.ex) };
}
