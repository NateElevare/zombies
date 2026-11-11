// art/characters/zombies.ts — zombie types, variants and gait/attack/hit/death pose curves.
import { ART_SCALE, canvas, type Frame } from '../lib/core';
import { TAU, lerp, clamp, smooth, easeIn, finish, bloodPool } from '../lib/figure';
import { drawFigure, type Look, type Pose, type ArmP, type Build } from './humanoid';

export type ZType = 'walker' | 'runner' | 'brute' | 'crawler' | 'bloater';
export const ZTYPES: Record<ZType, { radius: number; frame: number; variants: number; build: Build; walkRate: number }> = {
  walker: { radius: 15, frame: 128, variants: 4, build: 'human', walkRate: 8 },
  runner: { radius: 13, frame: 128, variants: 3, build: 'lean', walkRate: 14 },
  brute: { radius: 24, frame: 192, variants: 2, build: 'brute', walkRate: 7 },
  crawler: { radius: 13, frame: 128, variants: 2, build: 'crawler', walkRate: 8 },
  bloater: { radius: 20, frame: 192, variants: 2, build: 'bloat', walkRate: 7 },
};
export const ANIM_FRAMES = { walk: 8, attack: 6, hit: 2, death: 8, corpse: 1, pulse: 4 } as const;

const PROP: Record<Build, Pick<Look, 'shoulderW' | 'torsoD' | 'headR' | 'armW' | 'legW' | 'handR' | 'upper' | 'fore'>> = {
  human: { shoulderW: 0.96, torsoD: 0.52, headR: 0.36, armW: 0.125, legW: 0.15, handR: 0.14, upper: 0.6, fore: 0.58 },
  lean: { shoulderW: 0.9, torsoD: 0.48, headR: 0.38, armW: 0.12, legW: 0.15, handR: 0.16, upper: 0.66, fore: 0.62 },
  brute: { shoulderW: 1.0, torsoD: 0.56, headR: 0.32, armW: 0.21, legW: 0.19, handR: 0.18, upper: 0.6, fore: 0.56 },
  bloat: { shoulderW: 0.95, torsoD: 0.88, headR: 0.34, armW: 0.16, legW: 0.19, handR: 0.14, upper: 0.42, fore: 0.4 },
  crawler: { shoulderW: 0.92, torsoD: 0.6, headR: 0.38, armW: 0.13, legW: 0.15, handR: 0.16, upper: 0.7, fore: 0.66 },
};

type V = Partial<Look> & Pick<Look, 'skin' | 'shirt' | 'shirtKind' | 'pants' | 'hair' | 'hairKind'>;
const VARIANTS: Record<ZType, V[]> = {
  walker: [
    { skin: '#8a9a7c', shirt: '#7a3d36', shirt2: '#2a2420', shirtKind: 'plaid', sleeve: 'long', pants: '#3e5470', denim: true, shoes: '#3b2f25', hair: '#3a2c22', hairKind: 'patchy', tears: 3, blood: 4, wounds: 1 },
    { skin: '#a3a892', shirt: '#a8a596', shirtKind: 'tee', sleeve: 'short', pants: '#4a4c4e', shoes: '#2a2826', hair: null, hairKind: 'bald', tears: 4, blood: 7, wounds: 2 },
    { skin: '#7d8c6a', shirt: '#2f3a4e', shirtKind: 'hoodie', sleeve: 'long', pants: '#3e5470', denim: true, shoes: '#55504a', hair: '#66583c', hairKind: 'long', tears: 2, blood: 3, wounds: 1 },
    { skin: '#8f9480', shirt: '#5e8a84', shirtKind: 'scrubs', sleeve: 'short', pants: '#557a75', shoes: '#7c7a72', hair: '#1e1c1a', hairKind: 'ponytail', tears: 2, blood: 5, wounds: 2 },
  ],
  runner: [
    { skin: '#93a07f', shirt: '#7a3d36', shirtKind: 'tank', sleeve: 'none', pants: '#4a4c4e', shoes: '#2e2e30', hair: '#2a2420', hairKind: 'buzz', tears: 2, blood: 4, wounds: 1 },
    { skin: '#a0a491', shirt: '#2f3a4e', shirt2: '#b8b4a8', shirtKind: 'stripes', sleeve: 'short', pants: '#3e5470', denim: true, shoes: '#5e4a36', hair: '#5e4a36', hairKind: 'patchy', tears: 3, blood: 3, wounds: 1 },
    { skin: '#7f8f6c', shirt: '#5c5f62', shirtKind: 'hoodie', sleeve: 'long', pants: '#222326', shoes: '#6a665e', hair: null, hairKind: 'bald', tears: 2, blood: 5, wounds: 2 },
  ],
  brute: [
    { skin: '#7f8b6e', shirt: '#7f8b6e', shirtKind: 'shirtless', sleeve: 'none', pants: '#4a4a32', shoes: '#2b241c', hair: null, hairKind: 'bald', tears: 0, blood: 6, wounds: 3 },
    { skin: '#8d9480', shirt: '#8a8478', shirt2: '#3e5470', shirtKind: 'overalls', sleeve: 'none', pants: '#3e5470', denim: true, shoes: '#3b2f25', hair: '#2a2622', hairKind: 'buzz', tears: 3, blood: 5, wounds: 2 },
  ],
  crawler: [
    { skin: '#8c957c', shirt: '#2b2d33', shirtKind: 'suit', sleeve: 'long', pants: '#2b2d33', shoes: '#1a1a1a', hair: '#77746c', hairKind: 'short', tears: 3, blood: 5, wounds: 1 },
    { skin: '#9ba08a', shirt: '#5e4a36', shirtKind: 'tee', sleeve: 'short', pants: '#3e5470', shoes: '#1a1a1a', hair: '#5a2a1a', hairKind: 'long', tears: 3, blood: 6, wounds: 2 },
  ],
  bloater: [
    { skin: '#9aa078', shirt: '#a8a596', shirtKind: 'tee', sleeve: 'none', pants: '#4a4c4e', shoes: '#2a2826', hair: null, hairKind: 'bald', tears: 0, blood: 2, wounds: 0, pustule: '#c8d84a' },
    { skin: '#8c9a7a', shirt: '#5a5f3a', shirtKind: 'tee', sleeve: 'none', pants: '#5e4a36', shoes: '#2a2826', hair: '#3a2c22', hairKind: 'patchy', tears: 0, blood: 3, wounds: 1, pustule: '#d9a93a' },
  ],
};

export function zombieLook(type: ZType, v: number): Look {
  const T = ZTYPES[type], V = VARIANTS[type][v];
  return {
    R: T.radius * ART_SCALE, seed: (type.length * 101 + v * 17 + 3), zombie: true, build: T.build,
    sleeve: 'short', shoes: '#2e2a26', tears: 2, blood: 3, wounds: 1, outline: '#14160f',
    ...PROP[T.build], ...V,
  } as Look;
}

const arm = (x: number, y: number, o: Partial<ArmP> = {}): ArmP => ({ x, y, bend: 1, claw: 0.6, ...o });
const mixArm = (a: ArmP, b: ArmP, t: number): ArmP => ({
  ...b, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), fore: lerp(a.fore ?? 1, b.fore ?? 1, t), lift: lerp(a.lift ?? 0, b.lift ?? 0, t), claw: lerp(a.claw ?? 0.5, b.claw ?? 0.5, t),
});
export function mixPose(a: Pose, b: Pose, t: number): Pose {
  const n = (k: keyof Pose, d = 0) => lerp((a[k] as number) ?? d, (b[k] as number) ?? d, t);
  return {
    ...b,
    bx: n('bx'), by: n('by'), brot: n('brot'), bob: n('bob', 1), hx: n('hx'), hy: n('hy'), hrot: n('hrot'), hs: n('hs', 1),
    hipX: n('hipX', -0.08), lie: n('lie'), swell: n('swell'), glow: n('glow'),
    armL: mixArm(a.armL, b.armL, t), armR: mixArm(a.armR, b.armR, t),
    footL: { x: lerp(a.footL.x, b.footL.x, t), y: lerp(a.footL.y, b.footL.y, t), lift: lerp(a.footL.lift ?? 0, b.footL.lift ?? 0, t), rot: lerp(a.footL.rot ?? -0.12, b.footL.rot ?? -0.12, t) },
    footR: { x: lerp(a.footR.x, b.footR.x, t), y: lerp(a.footR.y, b.footR.y, t), lift: lerp(a.footR.lift ?? 0, b.footR.lift ?? 0, t), rot: lerp(a.footR.rot ?? 0.12, b.footR.rot ?? 0.12, t) },
  };
}

// ---------------- walk cycles ----------------
function walkPose(type: ZType, v: number, i: number, n = 8): Pose {
  const ph = (i / n) * TAU, s = Math.sin(ph), c = Math.cos(ph);
  const tilt = [0.22, -0.18, 0.1, -0.28][v % 4];
  switch (type) {
    case 'walker': {
      const dangle = v % 2 === 1; // one arm hangs, the other reaches
      return {
        bx: 0.04, by: 0.08 * c, brot: -0.14 * s, bob: 1 + 0.03 * Math.cos(2 * ph),
        hx: 0.52, hy: 0.06 * Math.sin(ph + 0.7), hrot: tilt + 0.14 * Math.sin(ph + 1), hs: 0.97,
        armL: arm(1.08 + 0.16 * Math.sin(ph + 0.4), -0.74 + 0.08 * c, { lift: 0.15 + 0.1 * s, claw: 0.55 + 0.25 * Math.sin(ph * 2) }),
        armR: dangle ? arm(0.4 + 0.18 * Math.sin(ph + Math.PI), 1.02 + 0.05 * c, { fore: 0.72, claw: 0.25 })
          : arm(0.98 + 0.16 * Math.sin(ph + 2.2), 0.76 - 0.06 * c, { lift: 0.05, claw: 0.7 }),
        footL: { x: 0.66 * s - 0.02, y: -0.4, lift: Math.max(0, c) * 0.9, rot: -0.15 },
        footR: { x: -0.5 * s - 0.08, y: 0.42, lift: Math.max(0, -c) * 0.5, rot: 0.35 }, // dragging, turned-out foot
        hipX: -0.06,
      };
    }
    case 'runner': {
      return {
        bx: 0.2, by: 0.06 * c, brot: -0.24 * s, bob: 1 + 0.045 * Math.cos(2 * ph),
        hx: 0.62, hy: 0.04 * s, hrot: tilt * 0.5 + 0.1 * s, hs: 1,
        armL: arm(1.18 - 0.36 * s, -0.66 + 0.08 * s, { lift: 0.2 + 0.2 * Math.max(0, -s), claw: 0.8, fore: 0.95 }),
        armR: arm(1.18 + 0.36 * s, 0.66 + 0.08 * s, { lift: 0.2 + 0.2 * Math.max(0, s), claw: 0.8, fore: 0.95 }),
        footL: { x: 0.8 * s - 0.2, y: -0.26, lift: Math.max(0, c) * 1.0, rot: -0.08 },
        footR: { x: -0.8 * s - 0.2, y: 0.26, lift: Math.max(0, -c) * 1.0, rot: 0.08 },
        hipX: -0.16,
      };
    }
    case 'brute': {
      return {
        bx: 0.0, by: 0.1 * c, brot: -0.11 * s, bob: 1 + 0.025 * Math.cos(2 * ph),
        hx: 0.42, hy: 0.04 * s, hrot: 0.08 * s + tilt * 0.4, hs: 1,
        armL: arm(0.85 + 0.3 * Math.sin(ph + Math.PI), -1.0, { fore: 0.82, claw: 0.3, fist: v === 0, lift: 0.05, bend: -1 }),
        armR: arm(0.85 + 0.3 * s, 1.0, { fore: 0.82, claw: 0.3, fist: v === 0, lift: 0.05, bend: -1 }),
        footL: { x: 0.62 * s - 0.02, y: -0.5, lift: Math.max(0, c) * 0.7, rot: -0.25 },
        footR: { x: -0.62 * s - 0.02, y: 0.5, lift: Math.max(0, -c) * 0.7, rot: 0.25 },
        hipX: -0.1,
      };
    }
    case 'crawler': {
      // army crawl: one hand plants forward while the other drags back
      const reachL = 0.5 + 0.5 * s, reachR = 0.5 - 0.5 * s;
      return {
        bx: 0.05 + 0.06 * Math.cos(2 * ph), by: 0.03 * s, brot: 0.16 * s, bob: 1 + 0.02 * Math.cos(2 * ph),
        hx: 0.82, hy: 0.06 * s, hrot: tilt * 0.6 + 0.12 * Math.sin(ph + 1), hs: 0.94,
        armL: arm(lerp(0.15, 1.65, reachL), lerp(-1.15, -0.55, reachL), { lift: Math.max(0, c) * 0.35, claw: lerp(0.3, 0.9, reachL), fore: 1 }),
        armR: arm(lerp(0.15, 1.65, reachR), lerp(1.15, 0.55, reachR), { lift: Math.max(0, -c) * 0.35, claw: lerp(0.3, 0.9, reachR), fore: 1 }),
        footL: { x: 0, y: 0 }, footR: { x: 0, y: 0 },
      };
    }
    case 'bloater': {
      return {
        bx: 0.0, by: 0.12 * c, brot: 0.1 * s, bob: 1, swell: 0.025 * Math.cos(2 * ph), glow: 0.45 + 0.15 * Math.cos(2 * ph),
        hx: 0.66, hy: -0.03 * s, hrot: 0.1 * s + tilt * 0.3, hs: 1,
        armL: arm(0.55 + 0.2 * Math.sin(ph + 0.5), -1.22, { fore: 0.95, claw: 0.4, lift: 0.1 }),
        armR: arm(0.55 + 0.2 * Math.sin(ph + 0.5 + Math.PI), 1.22, { fore: 0.95, claw: 0.4, lift: 0.1 }),
        footL: { x: 0.5 * s - 0.05, y: -0.72, lift: Math.max(0, c) * 0.6, rot: -0.35 },
        footR: { x: -0.5 * s - 0.05, y: 0.72, lift: Math.max(0, -c) * 0.6, rot: 0.35 },
        hipX: -0.2,
      };
    }
  }
}

// ---------------- attack (6 frames) ----------------
function attackPose(type: ZType, v: number, i: number): Pose {
  const base = walkPose(type, v, 0);
  const plant = (p: Pose): Pose => ({ ...p, footL: { x: 0.4, y: base.footL.y, rot: -0.1 }, footR: { x: -0.3, y: base.footR.y, rot: 0.2 } });
  if (type === 'brute') { // double-fisted overhead smash
    const K: [number, number, number, number, number][] = [ // bx, handX, handY, lift, headX
      [-0.04, 0.45, 0.55, 0.55, 0.38], [-0.1, 0.2, 0.3, 1.0, 0.34], [-0.06, 0.12, 0.22, 1.15, 0.36],
      [0.22, 1.3, 0.3, 0.25, 0.55], [0.26, 1.42, 0.26, 0.0, 0.58], [0.1, 1.0, 0.7, 0.05, 0.46],
    ];
    const [bx, x, y, lift, hx] = K[i];
    return plant({ ...base, bx, by: 0, brot: 0, hx, hrot: i === 4 ? 0.2 : 0, armL: arm(x, -y, { lift, fist: v === 0, claw: 0.3 }), armR: arm(x, y, { lift, fist: v === 0, claw: 0.3 }) });
  }
  if (type === 'crawler') {
    const K: [number, number, number, number, number][] = [ // bx, lX, lY, rX, rY
      [0.0, 1.0, -1.0, 0.9, 1.0], [-0.06, 0.6, -1.25, 0.55, 1.25], [0.2, 1.75, -0.55, 1.7, 0.6],
      [0.28, 1.6, -0.08, 1.55, 0.12], [0.24, 1.45, 0.05, 1.4, -0.02], [0.1, 1.3, -0.6, 1.2, 0.7],
    ];
    const [bx, lx, ly, rx, ry] = K[i];
    return { ...base, bx, brot: 0, hx: 0.82 + bx * 0.6, hrot: [0, -0.1, 0.25, -0.3, 0.2, 0][i], armL: arm(lx, ly, { lift: i >= 2 && i <= 4 ? 0.4 : 0.1, claw: 1 }), armR: arm(rx, ry, { lift: i >= 2 && i <= 4 ? 0.4 : 0.1, claw: 1 }) };
  }
  const reach = type === 'runner' ? 1.25 : 1;
  const K: [number, number, number, number, number, number][] = [ // bx, armX, armY, lift, claw, headjerk
    [-0.04, 0.7, 1.05, 0.25, 0.9, 0], [-0.1, 0.45, 1.25, 0.35, 1, -0.1], [0.22, 1.55, 0.55, 0.35, 1, 0.12],
    [0.3, 1.7, 0.3, 0.25, 1, 0.2], [0.26, 1.45, 0.06, 0.15, 0.4, 0.12], [0.1, 1.2, 0.5, 0.15, 0.7, 0.04],
  ];
  const [bx, x, y, lift, claw, hj] = K[i];
  const p: Pose = {
    ...base, bx: bx * reach + (type === 'runner' ? 0.15 : 0), by: 0, brot: [0, 0.1, -0.12, 0, 0.1, 0][i],
    hx: base.hx + hj, hrot: [0, 0.25, -0.3, 0.2, -0.15, 0][i], swell: type === 'bloater' ? [0.02, 0.05, 0.08, 0.06, 0.04, 0.02][i] : 0,
    armL: arm(x * (type === 'bloater' ? 0.75 : 1), -y * (type === 'bloater' ? 1.3 : 1), { lift, claw }),
    armR: arm((x - 0.08) * (type === 'bloater' ? 0.75 : 1), y * (type === 'bloater' ? 1.3 : 1) + 0.05, { lift, claw }),
  };
  return type === 'bloater' ? { ...p, footL: base.footL, footR: base.footR } : plant(p);
}

// ---------------- hit flinch (2 frames) ----------------
function hitPose(type: ZType, v: number, i: number): Pose {
  const base = walkPose(type, v, 2);
  const k = i === 0 ? 1 : 0.5;
  const out = type === 'crawler' ? 1.2 : type === 'bloater' ? 1.35 : 1.18;
  return {
    ...base, bx: base.bx - 0.16 * k, brot: 0.18 * k, hx: base.hx - 0.2 * k, hrot: base.hrot + 0.4 * k, hs: (base.hs ?? 1) * (1 + 0.04 * k),
    armL: mixArm(base.armL, arm(0.2, -out, { lift: 0.3, claw: 1 }), 0.7 * k),
    armR: mixArm(base.armR, arm(0.35, out, { lift: 0.25, claw: 1 }), 0.7 * k),
    swell: type === 'bloater' ? 0.04 * k : 0,
  };
}

// ---------------- death (8 frames) + corpse ----------------
function deathPose(type: ZType, v: number, i: number): Pose {
  const t = i / 7;
  const base = walkPose(type, v, 0);
  const sideA = v % 2 ? 1 : -1;
  if (type === 'crawler') { // slumps flat, arms splay, head drops and turns
    const e = smooth(t * 1.3);
    const lying: Pose = {
      ...base, bx: -0.05, brot: 0.15 * sideA, bob: 0.97, hx: 0.7, hy: 0.15 * sideA, hrot: 0.9 * sideA, hs: 0.9,
      armL: arm(0.9, -1.45, { fore: 1, claw: 0.2 }), armR: arm(0.2, 1.45, { fore: 1, claw: 0.2 }),
    };
    const flail: Pose = { ...base, bx: -0.12, hx: 0.6, hrot: -0.4 * sideA, armL: arm(0.4, -1.3, { lift: 0.4, claw: 1 }), armR: arm(0.7, 1.3, { lift: 0.4, claw: 1 }) };
    return t < 0.3 ? mixPose(base, flail, t / 0.3) : mixPose(flail, lying, e);
  }
  const big = type === 'brute' || type === 'bloater';
  const lying: Pose = {
    bx: big ? 0.1 : 0.2, by: 0, brot: 0.12 * sideA, bob: 1, hx: -1.22 - zombieLook(type, v).headR * 0.55, hy: 0.06 * sideA, hrot: 0.5 * sideA, hs: 1,
    armL: arm(-0.55, -1.55, { fore: 1, claw: 0.2, bend: -1 }), armR: arm(0.25, 1.5, { fore: 1, claw: 0.2 }),
    footL: { x: 1.15, y: -0.5, rot: -0.5 }, footR: { x: 1.3, y: 0.32, rot: 0.6 }, hipX: 0.25,
    lie: 1, swell: type === 'bloater' ? -0.12 : 0, glow: 0,
  };
  const stagger: Pose = {
    ...base, bx: -0.18, brot: -0.25 * sideA, hx: base.hx - 0.3, hrot: 0.5 * sideA,
    armL: arm(0.3, -1.3, { lift: 0.45, claw: 1 }), armR: arm(0.6, 1.25, { lift: 0.5, claw: 1 }),
    swell: type === 'bloater' ? 0.12 : 0, glow: 1,
  };
  if (t <= 0.28) return mixPose(base, stagger, smooth(t / 0.28));
  const f = (t - 0.28) / 0.72;
  const e = f < 0.85 ? easeIn(f / 0.85) : 1; // accelerating fall, lands at ~frame 6
  const p = mixPose(stagger, lying, e);
  if (i === 6) p.bob = 1.02; // impact squash
  return p;
}

function poolUnder(type: ZType, v: number, S: number, k: number, lie: number, seed: number) {
  return (g: import('../lib/core').Ctx) => {
    if (k <= 0) return;
    const R = ZTYPES[type].radius * ART_SCALE, cx = S / 2 - R * (type === 'crawler' ? 0.3 : 0.25 * lie), cy = S / 2;
    if (type === 'bloater') bloodPool(g, cx, cy, R * 1.45 * k, seed + 7, '#5d6a1e', 0.8, 1.2); // bile
    bloodPool(g, cx, cy, R * (type === 'bloater' ? 1.0 : 1.05) * k, seed, '#5a0f0f', 0.92, type === 'crawler' ? 1.3 : 1.25);
    if (type === 'crawler') { // drag smear behind
      g.save(); g.globalAlpha = 0.6 * k; g.fillStyle = '#4a0c0c';
      g.beginPath(); g.ellipse(cx - R * 1.2, cy, R * 0.9, R * 0.4, 0, 0, TAU); g.fill(); g.restore();
    }
  };
}

export interface ZFrame extends Frame { type: ZType; v: number; anim: string; i: number }

export function buildZombieFrames(type: ZType, v: number): ZFrame[] {
  const T = ZTYPES[type], S = T.frame, L = zombieLook(type, v);
  const out: ZFrame[] = [];
  const render = (anim: string, i: number, P: Pose, under?: (g: import('../lib/core').Ctx) => void) => {
    const { c, g } = canvas(S, S);
    drawFigure(g, L, P, S / 2, S / 2);
    const fin = finish(c, { outline: L.outline, ow: S > 128 ? 2.6 : 2.2, under, sdx: (P.lie ?? 0) > 0.5 ? 3 : 4, sdy: (P.lie ?? 0) > 0.5 ? 3 : 5 });
    out.push({ name: `zombie_${type}_${v}_${anim}_${i}`, canvas: fin, type, v, anim, i });
  };
  for (let i = 0; i < 8; i++) {
    const p = walkPose(type, v, i);
    if (type === 'crawler') render('walk', i, p, (g) => { // fresh smear trail under the crawler
      const R = T.radius * ART_SCALE; g.save(); g.globalAlpha = 0.45; bloodPool(g, S / 2 - R * 1.25, S / 2, R * 0.55, 900 + v, '#4a0c0c', 0.7, 1.9); g.restore();
    });
    else render('walk', i, p);
  }
  for (let i = 0; i < 6; i++) render('attack', i, attackPose(type, v, i));
  for (let i = 0; i < 2; i++) render('hit', i, hitPose(type, v, i));
  const seed = 500 + v * 31 + type.length;
  for (let i = 0; i < 8; i++) {
    const p = deathPose(type, v, i);
    const k = clamp((i - 4) / 3, 0, 1) * 0.75;
    render('death', i, p, poolUnder(type, v, S, k, p.lie ?? 0, seed));
  }
  const last = deathPose(type, v, 7);
  render('corpse', 0, last, poolUnder(type, v, S, 1, last.lie ?? 0, seed));
  if (type === 'bloater') {
    for (let i = 0; i < 4; i++) {
      const p = walkPose(type, v, 0);
      render('pulse', i, { ...p, glow: [0.2, 0.65, 1.0, 0.6][i], swell: [0, 0.035, 0.07, 0.035][i] });
    }
  }
  return out;
}
