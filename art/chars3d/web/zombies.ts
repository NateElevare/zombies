// art/chars3d/web/zombies.ts — zombie looks (5 types, 13 variants) and procedural animation:
// walk (shamble / sprint / heavy stomp / arm-drag crawl / waddle), attack, hit, death, corpse, bloater pulse.
import { BUILD, shadeHex, type Look, type Pose, type ArmT, type LegT, type V3 } from './rig';

const TAU = Math.PI * 2, sin = Math.sin, cos = Math.cos;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
const easeIn = (t: number) => t * t;

export const ZSCALE: Record<string, number> = { walker: 1.0, runner: 0.95, brute: 1.28, crawler: 1.1, bloater: 1.12 };

type ZV = Partial<Look> & Pick<Look, 'skin' | 'top' | 'topColor' | 'pants' | 'hair' | 'hairColor'>;
const VARIANTS: Record<string, ZV[]> = {
  walker: [
    { skin: '#8d9b80', skin2: '#5e5068', top: 'plaid', topColor: '#7a3530', topColor2: '#221c1a', sleeve: 'long', pants: '#3a4f6a', denim: true, boots: '#3b2f25', hair: 'patchy', hairColor: '#3a2c22', blood: 0.55, tear: 0.55, wounds: 1, grime: 0.5 },
    { skin: '#a6aa95', skin2: '#6a5a62', top: 'tee', topColor: '#b0aa98', sleeve: 'short', pants: '#4a4c4e', boots: '#2a2826', hair: 'bald', hairColor: '#333', blood: 0.85, tear: 0.6, wounds: 2, grime: 0.4 },
    { skin: '#7e8d6c', skin2: '#4c5a40', top: 'hoodie', topColor: '#2c374a', sleeve: 'long', pants: '#3a4f6a', denim: true, boots: '#55504a', hair: 'long', hairColor: '#5e5038', blood: 0.45, tear: 0.4, wounds: 1, grime: 0.5 },
    { skin: '#949a86', skin2: '#6a5468', top: 'scrubs', topColor: '#5a8a84', sleeve: 'short', pants: '#527570', boots: '#7c7a72', hair: 'ponytail', hairColor: '#1e1c1a', blood: 0.75, tear: 0.35, wounds: 2, grime: 0.3 },
  ],
  runner: [
    { skin: '#93a07f', skin2: '#5a6a48', top: 'tank', topColor: '#7a3530', sleeve: 'none', pants: '#4a4c4e', boots: '#2e2e30', hair: 'buzz', hairColor: '#2a2420', blood: 0.6, tear: 0.5, wounds: 2, grime: 0.4 },
    { skin: '#a2a693', skin2: '#6a5a66', top: 'stripes', topColor: '#2c374a', topColor2: '#b8b2a4', sleeve: 'short', pants: '#3a4f6a', denim: true, boots: '#5e4a36', hair: 'patchy', hairColor: '#5e4a36', blood: 0.5, tear: 0.55, wounds: 1, grime: 0.4 },
    { skin: '#7f8f6c', skin2: '#4e5a40', top: 'hoodie', topColor: '#5a5d60', sleeve: 'long', pants: '#232427', boots: '#6a665e', hair: 'bald', hairColor: '#333', blood: 0.75, tear: 0.45, wounds: 2, grime: 0.5 },
  ],
  brute: [
    { skin: '#7c8c5e', skin2: '#4e3a46', top: 'shirtless', topColor: '#7f8b6e', sleeve: 'none', pants: '#4a4a32', boots: '#2b241c', hair: 'bald', hairColor: '#333', blood: 0.7, tear: 0.5, wounds: 3, grime: 0.5 },
    { skin: '#86906a', skin2: '#54404c', top: 'overalls', topColor: '#8a8478', topColor2: '#3a4f6a', sleeve: 'none', pants: '#3a4f6a', denim: true, boots: '#3b2f25', hair: 'buzz', hairColor: '#2a2622', blood: 0.6, tear: 0.45, wounds: 2, grime: 0.6 },
  ],
  crawler: [
    { skin: '#8c957c', skin2: '#5a4e5e', top: 'suit', topColor: '#454852', sleeve: 'long', pants: '#3a3c44', boots: '#1a1a1a', hair: 'short', hairColor: '#77746c', blood: 0.7, tear: 0.6, wounds: 2, grime: 0.6, legless: true },
    { skin: '#9ba08a', skin2: '#6a5a5a', top: 'tee', topColor: '#5e4a36', sleeve: 'short', pants: '#3a4f6a', denim: true, boots: '#1a1a1a', hair: 'long', hairColor: '#5a2a1a', blood: 0.8, tear: 0.6, wounds: 2, grime: 0.6, legless: true },
  ],
  bloater: [
    { skin: '#9aa078', skin2: '#6a7a3a', top: 'shirtless', topColor: '#9aa078', sleeve: 'none', pants: '#4a4c4e', boots: '#2a2826', hair: 'bald', hairColor: '#333', blood: 0.3, tear: 0.4, wounds: 1, grime: 0.4, pustule: '#c8dc48' },
    { skin: '#8c9a7a', skin2: '#7a6a3a', top: 'shirtless', topColor: '#8c9a7a', sleeve: 'none', pants: '#5e4a36', boots: '#2a2826', hair: 'patchy', hairColor: '#3a2c22', blood: 0.4, tear: 0.5, wounds: 1, grime: 0.5, pustule: '#e0a838' },
  ],
};
const BUILD_OF: Record<string, keyof typeof BUILD> = { walker: 'human', runner: 'lean', brute: 'brute', crawler: 'crawler', bloater: 'bloat' };

export function zombieLook(type: string, v: number): Look {
  const V = VARIANTS[type][v];
  return {
    seed: type.length * 101 + v * 17 + 3, scale: ZSCALE[type], build: BUILD[BUILD_OF[type]], zombie: true,
    skin2: '#5e5068', sleeve: 'short', boots: '#2e2a26', topColor2: V.topColor,
    ...V,
    skin: shadeHex(V.skin, type === 'bloater' ? -0.38 : type === 'brute' ? -0.3 : -0.22),
  } as Look;
}

// ------------------------------------------------------------------ helpers
const claw = (p: V3, o: Partial<ArmT> = {}): ArmT => ({ p, space: 'chest', hand: 'claw', ...o });
const TILT = [0.22, -0.18, 0.12, -0.26];

/** walking pose for phase ph (radians) */
function walkPose(type: string, v: number, ph: number): Pose {
  const s = sin(ph), c = cos(ph), tilt = TILT[v % 4];
  switch (type) {
    case 'walker': {
      // shamble: left leg steps, right leg drags with the toe turned out; arms reach and sway; head lolls
      const limp = v === 1;
      const fl: LegT = { p: [0.22 * s, 0.11, 0.085 + Math.max(0, c) * 0.08], yaw: 0.1, pitch: -0.25 * s };
      const fr: LegT = { p: [-0.15 * s - 0.04, -0.13, 0.085 + Math.max(0, -c) * 0.02], yaw: -0.45, pitch: 0.1 };
      return {
        hip: [0.0, 0, 0.9 - 0.02 * Math.abs(s)], hipYaw: -0.14 * s, hipRoll: 0.06 * c,
        chPitch: 0.26, chRoll: 0.1 * s + tilt * 0.3, chYaw: 0.16 * s,
        hdRoll: tilt + 0.08 * s, hdPitch: -0.25, hdYaw: 0.1 * c,
        armL: claw([0.46 + 0.05 * c, 0.15 + 0.03 * s, 0.33 + 0.05 * s], { pole: [-0.3, 1, -0.8] }),
        armR: limp ? claw([0.06 - 0.06 * s, -0.25, -0.08], { hand: 'open', curl: 0.8, pole: [-0.5, -1, 0.2] })
          : claw([0.43 - 0.05 * c, -0.14 - 0.03 * s, 0.3 - 0.05 * s], { pole: [-0.3, -1, -0.8] }),
        legL: fl, legR: fr,
      };
    }
    case 'runner': {
      // sprint: strong forward lean, long stride with high knees, arms pumping (claws forward on the reach)
      const leg = (side: number): LegT => { const ss = side * s, cc = side * c; return { p: [0.36 * ss + 0.08, side * 0.1, 0.085 + Math.max(0, cc) * 0.2], yaw: side * 0.05, pitch: -0.4 * ss + Math.max(0, cc) * 0.3 }; };
      const arm = (side: number): ArmT => { const sw = -side * s; return claw([0.2 + sw * 0.28, side * 0.25, 0.18 + Math.max(0, sw) * 0.18], { pole: [-1, side * 0.4, -0.3], curl: 0.7 }); };
      return {
        hip: [-0.04, 0, 0.86 - 0.04 * Math.abs(cos(2 * ph))], hipYaw: -0.18 * s, hipPitch: 0.18, hipRoll: 0.04 * c,
        chPitch: 0.42, chYaw: 0.2 * s, chRoll: tilt * 0.2, hdPitch: -0.55, hdRoll: tilt * 0.5,
        armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1),
      };
    }
    case 'brute': {
      // heavy stomp: wide stance, body rolls side to side, huge arms swing low in front
      const leg = (side: number): LegT => { const ss = side * s, cc = side * c; return { p: [0.24 * ss, side * 0.17, 0.085 + Math.max(0, cc) * 0.09], yaw: side * 0.25, pitch: -0.2 * ss }; };
      return {
        hip: [0.0, 0, 0.9 - 0.03 * Math.abs(s)], hipYaw: -0.12 * s, hipRoll: 0.12 * c,
        chPitch: 0.32, chRoll: -0.14 * c, chYaw: 0.12 * s, hdPitch: -0.2, hdRoll: tilt * 0.4,
        armL: claw([0.24 - 0.12 * s, 0.33, -0.02 + 0.05 * c], { pole: [-0.6, 1, 0.1], hand: 'fist' }),
        armR: claw([0.24 + 0.12 * s, -0.33, -0.02 - 0.05 * c], { pole: [-0.6, -1, 0.1], hand: 'fist' }),
        legL: leg(1), legR: leg(-1),
      };
    }
    case 'crawler': {
      // prone, legless: alternately reaches forward and drags itself; the torso undulates
      const reach = (side: number): ArmT => {
        const ss = side * s, cc = side * c;
        const x = 0.5 + 0.2 * ss, z = 0.04 + Math.max(0, cc) * 0.1;
        return { p: [x, side * (0.24 - 0.04 * ss), z], hand: 'claw', curl: cc > 0 ? 0.3 : 0.9, pole: [0.1, side * 1, 0.8] };
      };
      return {
        hip: [-0.38, 0, 0.13], hipPitch: Math.PI / 2 - 0.08, hipYaw: 0.1 * s, hipRoll: 0.06 * c,
        chPitch: -0.22, chYaw: -0.12 * s, chRoll: 0.08 * s, hdPitch: -0.9, hdRoll: tilt * 0.5, hdYaw: 0.1 * s,
        armL: reach(1), armR: reach(-1),
        legL: { p: [-0.9, 0.1, 0.08] }, legR: { p: [-0.9, -0.1, 0.08] },
      };
    }
    case 'bloater': {
      // waddle: wide feet, big roll, belly swells with the step, arms held out over the gut
      const leg = (side: number): LegT => { const ss = side * s, cc = side * c; return { p: [0.15 * ss, side * 0.17, 0.085 + Math.max(0, cc) * 0.05], yaw: side * 0.35, pitch: -0.15 * ss }; };
      return {
        hip: [-0.05, 0, 0.88], hipYaw: -0.1 * s, hipRoll: 0.14 * c, hipPitch: -0.12,
        chPitch: 0.0, chRoll: -0.12 * c, chYaw: 0.08 * s, hdPitch: 0.1, hdRoll: tilt * 0.5,
        armL: claw([0.22 + 0.06 * s, 0.38, 0.12 + 0.03 * c], { hand: 'open', curl: 0.5, pole: [-0.4, 1, -0.2] }),
        armR: claw([0.22 - 0.06 * s, -0.38, 0.12 - 0.03 * c], { hand: 'open', curl: 0.5, pole: [-0.4, -1, -0.2] }),
        legL: leg(1), legR: leg(-1), swell: 0.5 + 0.5 * s, glow: 0.3,
      };
    }
  }
  throw new Error('type ' + type);
}

function attackPose(type: string, v: number, i: number): Pose {
  const P = walkPose(type, v, 0);
  const u = [0.0, -0.35, 0.6, 1.0, 0.65, 0.2][i]; // windup (negative), strike, recover
  const k = Math.max(0, u), w = Math.max(0, -u);
  if (type === 'brute') {
    // double-fisted overhead slam
    const up = [0.4, 1, 0.7, 0, 0, 0.2][i], down = [0, 0, 0.5, 1, 0.8, 0.3][i];
    return {
      ...P, chPitch: 0.32 - up * 0.35 + down * 0.35, hdPitch: -0.2 - up * 0.2,
      armL: claw([lerp(0.3, 0.2, up) + down * 0.32, 0.2 - down * 0.05, lerp(0.1, 0.75, up) - down * 0.25], { hand: 'fist', pole: [-0.5, 1, -0.4] }),
      armR: claw([lerp(0.3, 0.2, up) + down * 0.32, -0.2 + down * 0.05, lerp(0.1, 0.75, up) - down * 0.25], { hand: 'fist', pole: [-0.5, -1, -0.4] }),
    };
  }
  if (type === 'crawler') {
    return {
      ...P, hip: [-0.38 + k * 0.12, 0, 0.13], chPitch: -0.22 - k * 0.25 + w * 0.1, hdPitch: -0.9 - k * 0.2,
      armL: { p: [0.55 + k * 0.25 - w * 0.15, 0.2 - k * 0.08, 0.08 + w * 0.12 + k * 0.05], hand: 'claw', curl: 0.4 + k * 0.5, pole: [0.1, 1, 0.8] },
      armR: { p: [0.55 + k * 0.25 - w * 0.15, -0.2 + k * 0.08, 0.08 + w * 0.12 + k * 0.05], hand: 'claw', curl: 0.4 + k * 0.5, pole: [0.1, -1, 0.8] },
    };
  }
  const reachX = type === 'bloater' ? 0.45 : 0.56;
  return {
    ...P,
    hip: [P.hip[0] + k * 0.08 - w * 0.03, P.hip[1], P.hip[2] - k * 0.03],
    chPitch: (P.chPitch ?? 0) + k * 0.3 - w * 0.15, chYaw: 0, hdPitch: (P.hdPitch ?? 0) + k * 0.35 - w * 0.1, hdYaw: (i === 3 ? 0.25 : 0) * (v % 2 ? 1 : -1),
    armL: claw([lerp(0.3, reachX, k) - w * 0.15, 0.2 - k * 0.06 + w * 0.1, 0.32 + w * 0.22 - k * 0.04], { curl: 0.3 + k * 0.6, pole: [-0.3, 1, -0.6] }),
    armR: claw([lerp(0.3, reachX, k) - w * 0.15, -0.2 + k * 0.06 - w * 0.1, 0.32 + w * 0.22 - k * 0.04], { curl: 0.3 + k * 0.6, pole: [-0.3, -1, -0.6] }),
  };
}

function hitPose(type: string, v: number, i: number): Pose {
  const P = walkPose(type, v, 0.6);
  const k = i === 0 ? 1 : 0.5;
  if (type === 'crawler') return { ...P, chPitch: -0.22 - 0.35 * k, hdPitch: -0.9 - 0.35 * k, hdYaw: 0.3 * k };
  return {
    ...P, hip: [P.hip[0] - 0.05 * k, P.hip[1], P.hip[2]], chPitch: (P.chPitch ?? 0) - 0.4 * k, chYaw: 0.15 * k, hdPitch: (P.hdPitch ?? 0) - 0.45 * k, hdYaw: -0.3 * k,
    armL: claw([0.12, 0.38 * k + 0.12, 0.3 + 0.1 * k], { hand: 'open', pole: [-0.5, 1, -0.3] }),
    armR: claw([0.18, -0.36 * k - 0.12, 0.26 + 0.1 * k], { hand: 'open', pole: [-0.5, -1, -0.3] }),
  };
}

/** death: 8 frames collapsing, then lying still. Even variants fall back, odd forward; brutes crumple forward. */
function deathPose(type: string, v: number, t: number): Pose {
  const P = walkPose(type, v, 0.3);
  if (type === 'crawler') {
    const e = ease(t);
    return {
      ...P, hip: [-0.38, 0, 0.12 - 0.02 * e], hipRoll: 0.35 * e, chPitch: -0.22 + 0.24 * e, hdPitch: -0.9 + 1.0 * e, hdYaw: 0.7 * e,
      armL: { p: [lerp(0.5, 0.18, e), lerp(0.24, 0.5, e), 0.05], hand: 'open', curl: 0.3, pole: [0, 1, 0.8] },
      armR: { p: [lerp(0.5, 0.35, e), lerp(-0.24, -0.45, e), 0.05], hand: 'open', curl: 0.3, pole: [0, -1, 0.8] },
    };
  }
  const back = type !== 'brute' && v % 2 === 0;
  const dir = back ? -1 : 1;
  // phase 1 (0..0.25): knees buckle; phase 2 (0.25..0.85): topple; phase 3: settle with a small bounce
  const buckle = ease(Math.min(1, t / 0.25));
  const fall = easeIn(Math.min(1, Math.max(0, (t - 0.15) / 0.65)));
  const settle = t > 0.8 ? Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.06 : 0;
  const lieX = dir * 0.12, hipZ = lerp(lerp(P.hip[2], 0.7, buckle), 0.13, fall) + settle * 0.3;
  const pitch = dir * (Math.PI / 2 - 0.05) * fall;
  const legX = -dir * 0.55;
  return {
    hip: [lerp(P.hip[0], lieX, fall), 0, hipZ], hipPitch: pitch, hipYaw: 0.25 * fall * (v % 2 ? -1 : 1), hipRoll: 0.1 * fall,
    chPitch: lerp(P.chPitch ?? 0, back ? -0.05 : 0.0, fall) + buckle * 0.2 * (1 - fall), chYaw: 0.2 * fall, chRoll: (P.chRoll ?? 0) * (1 - fall),
    hdPitch: lerp(P.hdPitch ?? 0, back ? -0.3 : 0.3, fall), hdYaw: lerp(0, v % 2 ? 0.9 : -0.9, fall), hdRoll: (P.hdRoll ?? 0) * (1 - fall),
    armL: { p: [lerp(0.35, -0.05, fall), lerp(0.2, 0.55, fall), lerp(0.3, 0.42, fall)], space: 'chest', hand: 'open', curl: 0.5, pole: [-0.2, 1, 0] },
    armR: { p: [lerp(0.35, 0.0, fall), lerp(-0.2, -0.5, fall), lerp(0.3, 0.2, fall)], space: 'chest', hand: 'open', curl: 0.5, pole: [-0.2, -1, 0] },
    legL: { p: [lerp(P.legL.p[0], legX + 0.05, fall), lerp(0.11, 0.2, fall), lerp(0.085, 0.07, fall)], yaw: 0.4 * fall, pitch: dir * 1.2 * fall, pole: [dir * 0.3, 0.2, 1] },
    legR: { p: [lerp(P.legR.p[0], legX - 0.08, fall), lerp(-0.12, -0.24, fall), lerp(0.085, 0.07, fall)], yaw: -0.5 * fall, pitch: dir * 1.2 * fall, pole: [dir * 0.3, -0.2, 1] },
    swell: P.swell, glow: 0,
  };
}

export function zombieFrame(type: string, v: number, anim: string, i: number): Pose {
  switch (anim) {
    case 'walk': return walkPose(type, v, (i / 8) * TAU);
    case 'attack': return attackPose(type, v, i);
    case 'hit': return hitPose(type, v, i);
    case 'death': return deathPose(type, v, i / 7);
    case 'corpse': {
      const P = deathPose(type, v, 1);
      const back = type !== 'brute' && type !== 'crawler' && v % 2 === 0;
      return { ...P, pool: { r: type === 'brute' || type === 'bloater' ? 0.5 : 0.4, x: type === 'crawler' ? -0.1 : back ? -0.3 : 0.35, y: 0, seed: v * 3 + type.length } };
    }
    case 'pulse': {
      const P = walkPose(type, v, 0);
      const k = [0, 0.5, 1, 0.5][i];
      return { ...P, swell: k, glow: k, chPitch: (P.chPitch ?? 0) - 0.05 * k };
    }
  }
  throw new Error('anim ' + anim);
}
