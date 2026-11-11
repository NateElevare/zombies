// art/chars3d/web/player.ts — the survivor: look, leg cycle, torso poses (with the held weapon's transform per
// frame so hands, weapon sprite placement and overlays all agree).
import * as THREE from 'three';
import { BUILD, frameM, V, type Look, type Pose, type ArmT, type LegT, type V3 } from './rig';

export const PLAYER_LOOK: Look = {
  seed: 7, scale: 1, build: BUILD.hero, zombie: false,
  skin: '#c49a7c', skin2: '#a87a62',
  top: 'field', topColor: '#4d5038', topColor2: '#36382a', sleeve: 'long',
  pants: '#34425a', denim: true, boots: '#5a4330',
  hair: 'beanie', hairColor: '#623628', gloves: '#2a2622', scarf: '#585a4c',
  grime: 0.25,
};

export const TAU = Math.PI * 2;
const HIP = 0.925;
export const STAND_LEGS = { legL: { p: [0.04, 0.11, 0.085], yaw: 0.14 } as LegT, legR: { p: [-0.03, -0.11, 0.085], yaw: -0.18 } as LegT };

/** gun (or melee weapon) transform for a torso frame: grip point in body space + yaw/pitch/roll */
export interface Gun { grip: V3; yaw: number; pitch?: number; roll?: number }
export interface TorsoFrame { pose: Pose; gun: Gun | null }

const sin = Math.sin, cos = Math.cos;
function gunM(g: Gun) { return frameM(g.grip, g.yaw, g.pitch ?? 0, g.roll ?? 0); }
function gl(g: Gun, x: number, y: number, z: number): V3 { const p = V(x, y, z).applyMatrix4(gunM(g)); return [p.x, p.y, p.z]; }
function gd(g: Gun, x: number, y: number, z: number): V3 { const p = V(x, y, z).transformDirection(gunM(g)); return [p.x, p.y, p.z]; }

/** right hand on the grip (wrist sits behind and slightly below the grip point) */
function gripHand(g: Gun, cls: 'handgun' | 'long' | 'melee'): ArmT {
  if (cls === 'melee') return { p: gl(g, -0.03, 0, -0.012), fwd: gd(g, 0.25, -0.2, -1), hand: 'fist', pole: [-0.2, -1, -0.5] };
  return { p: gl(g, -0.045, -0.004, -0.02), fwd: gd(g, 1, 0, -0.35), hand: 'fist', pole: [-0.3, -1, -0.7] };
}
function supportHand(g: Gun, cls: 'handgun' | 'long' | 'melee'): ArmT {
  if (cls === 'handgun') return { p: gl(g, -0.05, 0.04, -0.03), fwd: gd(g, 1, -0.55, -0.2), hand: 'fist', pole: [-0.3, 1, -0.7] };
  if (cls === 'long') return { p: gl(g, 0.24, 0.035, -0.03), fwd: gd(g, 0.35, -1, 0.1), hand: 'fist', pole: [-0.2, 1, -0.8] };
  return { p: gl(g, -0.1, 0, -0.012), fwd: gd(g, 0.25, -0.2, -1), hand: 'fist', pole: [-0.2, 1, -0.6] };
}
const base = (o: Partial<Pose>): Pose => ({ hip: [0, 0, HIP], armL: { p: [0, 0.3, 1.0] }, armR: { p: [0, -0.3, 1.0] }, ...STAND_LEGS, ...o });

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---------------------------------------------------------------- torso animations
export const TORSO_ANIMS: Record<string, number> = {
  handgun_idle: 1, handgun_shoot: 2, handgun_reload: 6,
  long_idle: 1, long_shoot: 2, long_reload: 6,
  melee_idle: 1, melee_swing: 6,
  unarmed_idle: 1, unarmed_punch: 4, unarmed_walk: 8,
};

const HG: Gun = { grip: [0.43, -0.035, 1.3], yaw: 0 };
const LG: Gun = { grip: [0.21, -0.125, 1.355], yaw: 0 };
const LONG_CH = { chYaw: -0.32, hdYaw: 0.3, hdPitch: 0.2, hdRoll: -0.12 };

export function torsoFrame(anim: string, i: number): TorsoFrame {
  const n = TORSO_ANIMS[anim] || 1, u = n > 1 ? i / (n - 1) : 0;
  switch (anim) {
    case 'handgun_idle': return hg(HG, { chPitch: 0.06, hdPitch: 0.12 });
    case 'handgun_shoot': {
      const k = i === 0 ? 1 : 0.45;
      return hg({ grip: [HG.grip[0] - 0.05 * k, HG.grip[1], HG.grip[2] + 0.02 * k], yaw: 0, pitch: -0.35 * k }, { chPitch: 0.06 - 0.05 * k, hdPitch: 0.12 - 0.06 * k });
    }
    case 'handgun_reload': {
      const G: Gun[] = [
        { grip: [0.38, -0.05, 1.26], yaw: -0.2, roll: 0.4 },
        { grip: [0.3, -0.07, 1.2], yaw: -0.5, roll: 0.8, pitch: -0.2 },
        { grip: [0.3, -0.07, 1.2], yaw: -0.55, roll: 0.85, pitch: -0.25 },
        { grip: [0.31, -0.07, 1.21], yaw: -0.5, roll: 0.8, pitch: -0.2 },
        { grip: [0.33, -0.06, 1.23], yaw: -0.35, roll: 0.5 },
        { grip: [0.41, -0.04, 1.29], yaw: -0.08, roll: 0.1 },
      ];
      const g = G[i];
      const off: ArmT[] = [
        supportHand(g, 'handgun'),
        { p: [0.12, 0.17, 1.05], hand: 'fist', pole: [-0.5, 1, -0.3] },
        { p: [0.02, 0.18, 0.99], hand: 'open', pole: [-0.6, 1, -0.2] },
        { p: [0.2, 0.08, 1.12], hand: 'fist', pole: [-0.5, 1, -0.4] },
        { p: gl(g, -0.03, 0.01, -0.09), fwd: [0.3, -0.2, 1], hand: 'fist', pole: [-0.4, 1, -0.6] },
        supportHand(g, 'handgun'),
      ];
      return { pose: base({ chPitch: 0.1, hdPitch: 0.35 + (i > 0 && i < 5 ? 0.15 : 0), hdYaw: i === 2 ? 0.25 : 0, armR: gripHand(g, 'handgun'), armL: off[i] }), gun: g };
    }
    case 'long_idle': return lg(LG, LONG_CH);
    case 'long_shoot': {
      const k = i === 0 ? 1 : 0.45;
      return lg({ grip: [LG.grip[0] - 0.04 * k, LG.grip[1], LG.grip[2] + 0.01 * k], yaw: 0, pitch: -0.12 * k }, { ...LONG_CH, chYaw: LONG_CH.chYaw - 0.04 * k, chPitch: -0.04 * k });
    }
    case 'long_reload': {
      const G: Gun[] = [
        { grip: [0.2, -0.13, 1.33], yaw: -0.12, roll: 0.25 },
        { grip: [0.18, -0.13, 1.3], yaw: -0.3, roll: 0.5, pitch: 0.1 },
        { grip: [0.18, -0.13, 1.3], yaw: -0.33, roll: 0.55, pitch: 0.12 },
        { grip: [0.18, -0.13, 1.3], yaw: -0.3, roll: 0.5, pitch: 0.1 },
        { grip: [0.19, -0.13, 1.32], yaw: -0.2, roll: 0.3 },
        { grip: [0.21, -0.125, 1.35], yaw: -0.04, roll: 0.05 },
      ];
      const g = G[i];
      const off: ArmT[] = [
        { p: gl(g, 0.1, 0.02, -0.1), fwd: gd(g, 0.2, -0.3, 1), hand: 'fist', pole: [-0.3, 1, -0.6] },
        { p: [0.16, 0.15, 1.08], hand: 'fist', pole: [-0.5, 1, -0.3] },
        { p: [0.03, 0.18, 0.99], hand: 'open', pole: [-0.6, 1, -0.2] },
        { p: [0.24, 0.06, 1.14], hand: 'fist', pole: [-0.5, 1, -0.4] },
        { p: gl(g, 0.1, 0.02, -0.1), fwd: gd(g, 0.2, -0.3, 1), hand: 'fist', pole: [-0.3, 1, -0.6] },
        supportHand(g, 'long'),
      ];
      return { pose: base({ chYaw: -0.22, hdYaw: 0.2, hdPitch: 0.35, chPitch: 0.08, armR: gripHand(g, 'long'), armL: off[i] }), gun: g };
    }
    case 'melee_idle': return ml({ grip: [0.26, -0.17, 1.28], yaw: 0.55, pitch: -0.75 }, { chYaw: 0.05, hdPitch: 0.1 });
    case 'melee_swing': {
      const Y = [1.3, 1.05, 0.45, -0.3, -0.95, -1.2], P = [-0.7, -0.45, -0.05, 0.05, 0.25, 0.4];
      const y = Y[i], piv = [0.1, -0.04, 1.27];
      const r = 0.34 + (i >= 2 && i <= 3 ? 0.06 : 0);
      const g: Gun = { grip: [piv[0] + cos(y) * r, piv[1] + sin(y) * r, piv[2] - (i >= 4 ? 0.06 : 0)], yaw: y, pitch: P[i] };
      return ml(g, { chYaw: y * 0.38, hdYaw: -y * 0.15, chPitch: i >= 3 ? 0.12 : 0.02 });
    }
    case 'unarmed_idle': return { pose: base({ chYaw: 0.08, hdYaw: -0.08, ...guard() }), gun: null };
    case 'unarmed_punch': {
      const R: V3[] = [[0.3, -0.11, 1.4], [0.47, -0.08, 1.43], [0.56, -0.05, 1.44], [0.36, -0.1, 1.41]];
      const Y = [0.1, 0.3, 0.42, 0.18];
      const g = guard();
      return { pose: base({ chYaw: Y[i], hdYaw: -Y[i] * 0.6, chPitch: 0.05 + Y[i] * 0.1, armL: g.armL, armR: { p: R[i], hand: 'fist', fwd: [1, 0.05, 0.05], pole: [-0.2, -0.6, -1] } }), gun: null };
    }
    case 'unarmed_walk': {
      const ph = (i / n) * TAU, s = sin(ph);
      const arm = (side: number): ArmT => {
        const sw = -side * s; // left arm swings opposite the left foot
        return { p: [0.04 + sw * 0.16, side * 0.24, 0.13 + (sw > 0 ? sw * 0.12 : -sw * 0.03)], space: 'chest', hand: 'fist', pole: [-0.5, side * 0.4, -1] };
      };
      return { pose: base({ chYaw: 0.13 * s, hdYaw: -0.08 * s, armL: arm(1), armR: arm(-1) }), gun: null };
    }
  }
  return { pose: base({}), gun: null };
  void u;
}
function guard() {
  return {
    armL: { p: [0.27, 0.1, 1.38], hand: 'fist', fwd: [1, -0.25, 0.5], pole: [-0.2, 0.6, -1] } as ArmT,
    armR: { p: [0.22, -0.12, 1.37], hand: 'fist', fwd: [1, 0.25, 0.5], pole: [-0.2, -0.6, -1] } as ArmT,
  };
}
function hg(g: Gun, o: Partial<Pose>): TorsoFrame { return { pose: base({ ...o, armR: gripHand(g, 'handgun'), armL: supportHand(g, 'handgun') }), gun: g }; }
function lg(g: Gun, o: Partial<Pose>): TorsoFrame { return { pose: base({ ...o, armR: gripHand(g, 'long'), armL: supportHand(g, 'long') }), gun: g }; }
function ml(g: Gun, o: Partial<Pose>): TorsoFrame { return { pose: base({ ...o, armR: gripHand(g, 'melee'), armL: supportHand(g, 'melee') }), gun: g }; }

// ---------------------------------------------------------------- legs
export const LEG_FRAMES = 8;
export function legsPose(i: number | 'idle'): Pose {
  if (i === 'idle') return base({ hip: [0, 0, HIP] });
  const ph = (i / LEG_FRAMES) * TAU, s = sin(ph), c = cos(ph);
  const foot = (side: number): LegT => {
    const ss = side * s, cc = side * c; // left: phase ph, right: ph + PI
    const lift = Math.max(0, cc);
    return { p: [0.3 * ss, side * 0.1, 0.085 + lift * 0.11], yaw: side * 0.06, pitch: -0.32 * ss + lift * 0.15 };
  };
  return base({ hip: [0, 0, HIP - 0.012 - 0.022 * cos(2 * ph)], hipYaw: -0.13 * s, hipRoll: 0.03 * c, legL: foot(1), legR: foot(-1) });
}
export { lerp3 };
export type { THREE };
