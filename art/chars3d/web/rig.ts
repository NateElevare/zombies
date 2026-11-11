// art/chars3d/web/rig.ts — procedural humanoid: builds a posed THREE.Group from a Look (proportions, clothes,
// hair, gore) and a Pose (pelvis/chest/head rotations + IK targets for hands and feet).
// Space: meters, X forward (the sprite's +x), Y left, Z up. Root (0,0,0) is the ground under the body center.
import * as THREE from 'three';
import { mat, type MatSpec } from './materials';

export type V3 = [number, number, number];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const v3 = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);

// ------------------------------------------------------------------ look
export interface Build {
  w: number; d: number; h: number; head: number; arm: number; armT: number; leg: number; legT: number;
  belly: number; hunch: number; neck: number; hand: number;
}
export const BUILD: Record<string, Build> = {
  hero: { w: 1.03, d: 1, h: 1, head: 0.88, arm: 1, armT: 1, leg: 1, legT: 1, belly: 0, hunch: 0, neck: 1, hand: 1 },
  human: { w: 1, d: 1, h: 1, head: 1, arm: 1.04, armT: 0.9, leg: 1, legT: 0.95, belly: 0, hunch: 0.05, neck: 1.05, hand: 1.05 },
  lean: { w: 0.92, d: 0.88, h: 1.02, head: 1.0, arm: 1.1, armT: 0.8, leg: 1.04, legT: 0.85, belly: 0, hunch: 0.1, neck: 1.1, hand: 1.15 },
  brute: { w: 1.42, d: 1.3, h: 1.06, head: 0.9, arm: 1.12, armT: 1.75, leg: 0.95, legT: 1.5, belly: 0.25, hunch: 0.25, neck: 0.75, hand: 1.55 },
  bloat: { w: 1.15, d: 1.1, h: 0.98, head: 0.95, arm: 0.92, armT: 1.25, leg: 0.9, legT: 1.35, belly: 1, hunch: 0.05, neck: 0.8, hand: 1.1 },
  crawler: { w: 0.95, d: 0.95, h: 1, head: 1.02, arm: 1.12, armT: 0.85, leg: 1, legT: 0.9, belly: 0, hunch: 0, neck: 1.1, hand: 1.15 },
};

export type TopKind = 'field' | 'tee' | 'tank' | 'hoodie' | 'plaid' | 'scrubs' | 'suit' | 'shirtless' | 'overalls' | 'stripes';
export type HairKind = 'beanie' | 'bald' | 'short' | 'long' | 'ponytail' | 'buzz' | 'patchy';
export interface Look {
  seed: number; scale: number; build: Build; zombie: boolean;
  skin: string; skin2: string;
  top: TopKind; topColor: string; topColor2?: string; sleeve: 'long' | 'short' | 'none';
  pants: string; denim?: boolean; boots: string;
  hair: HairKind; hairColor: string;
  gloves?: string; scarf?: string;
  blood?: number; tear?: number; grime?: number; wounds?: number;
  pustule?: string; legless?: boolean; jaw?: boolean;
}

// ------------------------------------------------------------------ pose
export interface ArmT {
  /** wrist target */ p: V3;
  /** 'body' (root space, default) or 'chest' (chest-pivot space, follows the torso) */ space?: 'body' | 'chest';
  /** elbow pole direction (body space) */ pole?: V3;
  /** hand forward direction (body space); default = forearm direction */ fwd?: V3;
  hand?: 'fist' | 'claw' | 'open'; curl?: number;
}
export interface LegT { p: V3; yaw?: number; pitch?: number; pole?: V3 }
export interface Pose {
  hip: V3; hipYaw?: number; hipPitch?: number; hipRoll?: number;
  chYaw?: number; chPitch?: number; chRoll?: number;
  hdYaw?: number; hdPitch?: number; hdRoll?: number;
  armL: ArmT; armR: ArmT; legL: LegT; legR: LegT;
  /** bloater belly swell 0..1, pustule glow 0..1 */ swell?: number; glow?: number;
  /** extra props in body space (weapon placeholder for preview, blood pool) */
  pool?: { r: number; x: number; y: number; seed: number };
}

/** Which parts to draw; hidden parts still occlude (AO) and, with `depthOnly`, still hide overlays. */
export interface Show { legs: boolean; torso: boolean; head: boolean; arms: boolean }

// ------------------------------------------------------------------ builder
const SPH = new THREE.SphereGeometry(1, 30, 20);
const SPH_LO = new THREE.SphereGeometry(1, 18, 12);
const ID = new THREE.Matrix4();
const UPY = V(0, 1, 0);

export class Builder {
  group = new THREE.Group();
  occ: THREE.Vector4[] = [];
  anchors: Record<string, THREE.Vector3> = {};
  /** current visibility tag ('legs' | 'torso' | 'head' | 'arms' | 'gear') */
  tag = 'torso';
  private geos: THREE.BufferGeometry[] = [];
  constructor() { this.group.matrixAutoUpdate = false; }

  mesh(geo: THREE.BufferGeometry, m: THREE.Material, M: THREE.Matrix4) {
    const me = new THREE.Mesh(geo, m);
    me.matrixAutoUpdate = false; me.matrix.copy(M);
    me.castShadow = true; me.receiveShadow = true;
    me.userData.tag = this.tag;
    this.group.add(me); this.geos.push(geo);
    return me;
  }
  addOcc(c: THREE.Vector3, r: number) { this.occ.push(new THREE.Vector4(c.x, c.y, c.z, r)); }
  /** ellipsoid at local center c (radii r) in frame M, optional local euler rotation */
  ell(M: THREE.Matrix4, c: V3, r: V3, m: THREE.Material, o: { rot?: V3; occ?: number; lo?: boolean } = {}) {
    const g = (o.lo ? SPH_LO : SPH).clone().scale(r[0], r[1], r[2]);
    const L = new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]);
    if (o.rot) L.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o.rot[0], o.rot[1], o.rot[2], 'ZYX')));
    const W = M.clone().multiply(L);
    const me = this.mesh(g, m, W);
    if (o.occ !== 0) this.addOcc(V().applyMatrix4(W), ((r[0] + r[1] + r[2]) / 3) * (o.occ ?? 0.9));
    return me;
  }
  /** tapered limb segment between world points a..b with end spheres */
  seg(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, m: THREE.Material, o: { capA?: boolean; capB?: boolean; occ?: boolean; sides?: number } = {}) {
    const d = b.clone().sub(a), len = Math.max(1e-4, d.length());
    const g = new THREE.CylinderGeometry(rb, ra, len, o.sides ?? 22, 6, true);
    const q = new THREE.Quaternion().setFromUnitVectors(UPY, d.clone().normalize());
    const W = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1));
    this.mesh(g, m, W);
    if (o.capA !== false) this.ball(a, ra, m, false);
    if (o.capB !== false) this.ball(b, rb, m, false);
    if (o.occ !== false) { for (const t of [0.2, 0.5, 0.8]) this.addOcc(a.clone().lerp(b, t), (ra + (rb - ra) * t) * 0.95); }
  }
  ball(c: THREE.Vector3, r: number, m: THREE.Material, occ = true) {
    const g = SPH_LO.clone().scale(r, r, r);
    this.mesh(g, m, new THREE.Matrix4().makeTranslation(c.x, c.y, c.z));
    if (occ) this.addOcc(c, r);
  }
  torus(M: THREE.Matrix4, c: V3, R: number, t: number, m: THREE.Material, o: { rot?: V3; sx?: number; sy?: number; arc?: number } = {}) {
    const g = new THREE.TorusGeometry(R, t, 12, 36, o.arc ?? Math.PI * 2).scale(o.sx ?? 1, o.sy ?? 1, 1);
    const L = new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]);
    if (o.rot) L.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o.rot[0], o.rot[1], o.rot[2], 'ZYX')));
    return this.mesh(g, m, M.clone().multiply(L));
  }
  geo(g: THREE.BufferGeometry, M: THREE.Matrix4, m: THREE.Material) { return this.mesh(g, m, M); }
  /**
   * Per-vertex ambient occlusion: analytic sphere occlusion from every occluder sphere (the body parts approximated
   * as spheres) times a height falloff (seen from above, the lower a surface the more the body shadows it).
   * Written to the `ao` attribute read by the materials. Call after the group's matrices are final.
   */
  computeAO(heightRef: number) {
    this.group.updateMatrixWorld(true);
    const occ = this.occ, n = occ.length, ox = new Float32Array(n), oy = new Float32Array(n), oz = new Float32Array(n), orr = new Float32Array(n);
    occ.forEach((o, i) => { ox[i] = o.x; oy[i] = o.y; oz[i] = o.z; orr[i] = o.w; });
    const nm = new THREE.Matrix3(), p = new THREE.Vector3(), q = new THREE.Vector3();
    for (const o of this.group.children) {
      const me = o as THREE.Mesh, g = me.geometry as THREE.BufferGeometry;
      const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
      const ao = new Float32Array(pos.count);
      nm.getNormalMatrix(me.matrixWorld);
      const e = me.matrixWorld.elements;
      for (let v = 0; v < pos.count; v++) {
        p.set(pos.getX(v), pos.getY(v), pos.getZ(v));
        const x = e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12], y = e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13], z = e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14];
        if (nor) q.set(nor.getX(v), nor.getY(v), nor.getZ(v)).applyMatrix3(nm).normalize(); else q.set(0, 0, 1);
        let a = 1;
        for (let i = 0; i < n; i++) {
          const dx = ox[i] - x, dy = oy[i] - y, dz = oz[i] - z, l2 = dx * dx + dy * dy + dz * dz, r = orr[i];
          if (l2 < r * r * 1.04) continue;
          const l = Math.sqrt(l2), nl = (q.x * dx + q.y * dy + q.z * dz) / l;
          if (nl <= 0) continue;
          a *= 1 - nl * Math.min(1, (r * r) / l2) * 0.9;
        }
        const hz = Math.min(1, Math.max(0, z / heightRef));
        const t = Math.min(1, hz / 0.85), sm = t * t * (3 - 2 * t);
        ao[v] = a * (0.42 + 0.58 * sm);
      }
      g.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
    }
  }
  dispose() { for (const g of this.geos) g.dispose(); }
}

// ------------------------------------------------------------------ math helpers
/** rotation matrix: yaw about Z, then pitch about Y (+ = lean forward), then roll about X */
export function rotM(yaw = 0, pitch = 0, roll = 0) {
  return new THREE.Matrix4().makeRotationZ(yaw).multiply(new THREE.Matrix4().makeRotationY(pitch)).multiply(new THREE.Matrix4().makeRotationX(roll));
}
export function frameM(p: V3 | THREE.Vector3, yaw = 0, pitch = 0, roll = 0) {
  const t = Array.isArray(p) ? p : [p.x, p.y, p.z];
  return new THREE.Matrix4().makeTranslation(t[0], t[1], t[2]).multiply(rotM(yaw, pitch, roll));
}
const at = (M: THREE.Matrix4, x: number, y: number, z: number) => V(x, y, z).applyMatrix4(M);
const dirOf = (M: THREE.Matrix4, x: number, y: number, z: number) => V(x, y, z).applyMatrix3(new THREE.Matrix3().setFromMatrix4(M));

/** two-bone IK: returns the middle joint for root a, target t, lengths l1/l2 and a pole direction */
export function ik(a: THREE.Vector3, t: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3) {
  const d = t.clone().sub(a);
  let len = d.length();
  const maxL = (l1 + l2) * 0.999, minL = Math.abs(l1 - l2) * 1.01 + 1e-3;
  len = Math.min(maxL, Math.max(minL, len));
  const dir = d.normalize();
  const end = a.clone().add(dir.clone().multiplyScalar(len));
  const x = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const pp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
  if (pp.lengthSq() < 1e-8) pp.set(0, 0, -1);
  pp.normalize();
  return { mid: a.clone().add(dir.clone().multiplyScalar(x)).add(pp.multiplyScalar(h)), end };
}

/** basis matrix from forward and approximate up */
function basis(pos: THREE.Vector3, fwd: THREE.Vector3, upHint: THREE.Vector3) {
  const f = fwd.clone().normalize();
  let s = upHint.clone().cross(f); if (s.lengthSq() < 1e-6) s = V(0, 1, 0).cross(f); s.normalize(); // side = up x fwd (points left)
  const u = f.clone().cross(s).normalize();
  const M = new THREE.Matrix4().makeBasis(f, s, u); M.setPosition(pos);
  return M;
}

// ------------------------------------------------------------------ materials per look
export function lookMats(L: Look) {
  const z = L.zombie, s = L.seed;
  const blood = L.blood ?? 0, tear = L.tear ?? 0, grime = L.grime ?? 0;
  const skin: MatSpec = { color: L.skin, color2: L.skin2, pat: 'skin', rough: z ? 0.5 : 0.55, scale: 9, bump: 0.8, seed: s, blood: blood * 0.75, grime: z ? (L.grime ?? 0) * 0.6 : 0, rim: 0.4, vary: 0.18 };
  const topPat = ({ field: 'canvas', tee: 'cloth', tank: 'cloth', hoodie: 'cloth', plaid: 'plaid', scrubs: 'cloth', suit: 'cloth', shirtless: 'skin', overalls: 'denim', stripes: 'stripes' } as const)[L.top];
  const top: MatSpec = L.top === 'shirtless' ? skin : { color: L.topColor, color2: L.topColor2 || L.topColor, pat: topPat, rough: 0.92, scale: 14, bump: 1.4, seed: s + 1, blood, tear, tearColor: L.skin, grime, rim: 0.3 };
  const pants: MatSpec = L.denim ? { color: L.pants, color2: '#8d9db2', pat: 'denim', rough: 0.9, scale: 10, bump: 1.3, seed: s + 2, blood: blood * 0.6, tear: tear * 0.7, tearColor: L.skin, grime, rim: 0.25 }
    : { color: L.pants, pat: 'cloth', rough: 0.9, scale: 12, bump: 1.3, seed: s + 2, blood: blood * 0.6, tear: tear * 0.6, tearColor: L.skin, grime, rim: 0.25 };
  const boots: MatSpec = { color: L.boots, color2: '#2a2018', pat: 'leather', rough: 0.55, scale: 18, bump: 1.5, seed: s + 3, grime: grime * 0.6, rim: 0.3 };
  const sole: MatSpec = { color: '#1c1a18', pat: 'rubber', rough: 0.9, scale: 30, bump: 0.4, seed: s + 4, rim: 0.1 };
  const hair: MatSpec = L.hair === 'beanie' ? { color: L.hairColor, pat: 'knit', rough: 0.95, scale: 20, bump: 1.2, seed: s + 5, rim: 0.4 }
    : { color: L.hairColor, pat: 'hair', rough: 0.7, scale: 10, bump: 0.9, seed: s + 5, rim: 0.5, blood: blood * 0.4, tear: L.hair === 'patchy' ? 0.9 : 0, tearColor: L.skin };
  return {
    skin: mat(skin), top: mat(top), pants: mat(pants), boots: mat(boots), sole: mat(sole), hair: mat(hair),
    topDark: mat({ ...top, color: shadeHex(top.color, -0.25), tear: 0 }),
    gloves: mat({ color: L.gloves || L.skin, color2: '#111', pat: L.gloves ? 'leather' : 'skin', rough: 0.6, scale: 22, bump: 0.6, seed: s + 6, rim: 0.3, blood: z ? blood : 0 }),
    scarf: mat({ color: L.scarf || '#6a2a22', pat: 'knit', rough: 0.95, scale: 20, bump: 0.9, seed: s + 7, rim: 0.35 }),
    belt: mat({ color: '#2a2018', pat: 'leather', rough: 0.5, scale: 20, bump: 0.6, seed: s + 8 }),
    metal: mat({ color: '#9a9890', pat: 'metal', metal: 0.85, rough: 0.35, scale: 10, bump: 0.2 }),
    wound: mat({ color: '#6a1410', color2: '#2a0606', pat: 'flesh', rough: 0.35, scale: 30, bump: 1.2, seed: s + 9, rim: 0.3 }),
    bone: mat({ color: '#c8bca0', pat: 'plain', rough: 0.5, scale: 30, bump: 0.3, seed: s + 10 }),
    gut: mat({ color: '#8a4a48', color2: '#3a0a08', pat: 'flesh', rough: 0.3, scale: 18, bump: 1.4, seed: s + 11 }),
    pustule: mat({ color: L.pustule || '#c8d84a', emissive: L.pustule || '#c8d84a', emissiveI: 0.6, pat: 'plain', rough: 0.25, scale: 30, bump: 0.2, seed: s + 12, rim: 0.6 }),
    pustuleHot: mat({ color: L.pustule || '#c8d84a', emissive: L.pustule || '#c8d84a', emissiveI: 2.6, pat: 'plain', rough: 0.2, scale: 30, bump: 0.2, seed: s + 12, rim: 0.6 }),
    eye: mat({ color: '#d8d0a0', emissive: '#a0a070', emissiveI: 0.2, rough: 0.2 }),
    mouth: mat({ color: '#1a0806', rough: 0.4 }),
  };
}
export function shadeHex(hex: string, k: number) {
  const c = new THREE.Color(hex); const t = k < 0 ? 0 : 1, p = Math.abs(k);
  c.r += (t - c.r) * p; c.g += (t - c.g) * p; c.b += (t - c.b) * p;
  return '#' + c.getHexString();
}

// ------------------------------------------------------------------ the body
export interface Joints {
  pelvis: THREE.Matrix4; chest: THREE.Matrix4; head: THREE.Matrix4;
  shoulderL: THREE.Vector3; shoulderR: THREE.Vector3; elbowL: THREE.Vector3; elbowR: THREE.Vector3; wristL: THREE.Vector3; wristR: THREE.Vector3;
  handL: THREE.Matrix4; handR: THREE.Matrix4;
  hipL: THREE.Vector3; hipR: THREE.Vector3; kneeL: THREE.Vector3; kneeR: THREE.Vector3; ankleL: THREE.Vector3; ankleR: THREE.Vector3;
  footL: THREE.Matrix4; footR: THREE.Matrix4;
  dims: ReturnType<typeof dimsOf>;
}

export function dimsOf(B: Build) {
  return {
    hipW: 0.092 * B.w, upperArm: 0.285 * B.arm, foreArm: 0.255 * B.arm, thigh: 0.45 * B.leg, shin: 0.44 * B.leg,
    shoulderW: 0.192 * B.w, shoulderZ: 0.43 * B.h, waist: 0.1 * B.h, neckZ: 0.5 * B.h, neckLen: 0.075 * B.neck,
    armR: 0.047 * B.armT, legR: 0.07 * B.legT, headS: B.head, hand: B.hand,
  };
}

/** Solve the skeleton for a pose. */
export function solve(L: Look, P: Pose): Joints {
  const B = L.build, D = dimsOf(B);
  const pelvis = frameM(P.hip, P.hipYaw, P.hipPitch, P.hipRoll);
  const chest = pelvis.clone().multiply(frameM([0, 0, D.waist], P.chYaw, (P.chPitch ?? 0) + B.hunch * 0.5, P.chRoll));
  const head = chest.clone().multiply(frameM([0.012 + B.hunch * 0.06, 0, D.neckZ + D.neckLen], P.hdYaw, (P.hdPitch ?? 0) - B.hunch * 0.4, P.hdRoll));
  const shoulderL = at(chest, -0.005, D.shoulderW, D.shoulderZ), shoulderR = at(chest, -0.005, -D.shoulderW, D.shoulderZ);
  const arm = (A: ArmT, sh: THREE.Vector3, side: number) => {
    const t = A.space === 'chest' ? v3(A.p).applyMatrix4(chest) : v3(A.p);
    const pole = A.pole ? v3(A.pole) : V(-0.35, side * 0.9, -0.6);
    const { mid, end } = ik(sh, t, D.upperArm, D.foreArm, pole.normalize());
    const fwd = A.fwd ? v3(A.fwd) : end.clone().sub(mid);
    const up = A.fwd ? V(0, 0, 1) : V(0, 0, 1);
    return { elbow: mid, wrist: end, hand: basis(end, fwd, up) };
  };
  const aL = arm(P.armL, shoulderL, 1), aR = arm(P.armR, shoulderR, -1);
  const hipL = at(pelvis, 0, D.hipW, -0.03), hipR = at(pelvis, 0, -D.hipW, -0.03);
  const leg = (T: LegT, hip: THREE.Vector3, side: number) => {
    const t = v3(T.p);
    const yaw = (T.yaw ?? side * 0.1) + (P.hipYaw ?? 0) * 0.5;
    const pole = T.pole ? v3(T.pole) : V(Math.cos(yaw), Math.sin(yaw) + side * 0.15, 0.1);
    const { mid, end } = ik(hip, t, D.thigh, D.shin, pole.normalize());
    const foot = frameM(end, yaw, T.pitch ?? 0, 0);
    return { knee: mid, ankle: end, foot };
  };
  const lL = leg(P.legL, hipL, 1), lR = leg(P.legR, hipR, -1);
  return {
    pelvis, chest, head, shoulderL, shoulderR, elbowL: aL.elbow, elbowR: aR.elbow, wristL: aL.wrist, wristR: aR.wrist, handL: aL.hand, handR: aR.hand,
    hipL, hipR, kneeL: lL.knee, kneeR: lR.knee, ankleL: lL.ankle, ankleR: lR.ankle, footL: lL.foot, footR: lR.foot, dims: D,
  };
}

/** Build the posed character into the builder. Returns the joints (for overlays / anchors). */
export function buildBody(b: Builder, L: Look, P: Pose): Joints {
  const J = solve(L, P), D = J.dims, B = L.build, M = lookMats(L);
  const sleeveMat = L.sleeve === 'none' ? M.skin : M.top;
  // ---------------- legs + pelvis
  b.tag = 'legs';
  if (!L.legless) {
    b.ell(J.pelvis, [0, 0, 0], [0.105 * B.d, 0.158 * B.w, 0.11], M.pants);
    b.ell(J.pelvis, [0.002, 0, 0.07], [0.112 * B.d, 0.163 * B.w, 0.028], M.belt, { occ: 0 }); // belt
    if (!L.zombie) b.ell(J.pelvis, [0.112 * B.d, 0, 0.07], [0.01, 0.026, 0.02], M.metal, { occ: 0 }); // buckle
    for (const [hip, knee, ankle, foot] of [[J.hipL, J.kneeL, J.ankleL, J.footL], [J.hipR, J.kneeR, J.ankleR, J.footR]] as const) {
      const r = D.legR;
      b.seg(hip, knee, r, r * 0.74, M.pants);
      b.ball(knee, r * 0.78, M.pants);
      const shaft = ankle.clone().add(V(0, 0, 0.1));
      b.seg(knee, shaft, r * 0.74, r * 0.6, M.pants, { capB: false });
      // boot: shaft + upper + toe cap + sole
      b.seg(ankle.clone().add(V(0, 0, -0.01)), shaft, 0.044 * B.legT, 0.046 * B.legT, M.boots, { capA: false });
      const fs = B.legT * 0.9 + 0.1;
      b.ell(foot, [0.055, 0, -0.03], [0.125 * fs, 0.05 * fs, 0.048], M.boots);
      b.ell(foot, [0.11 * fs, 0, -0.045], [0.06 * fs, 0.047 * fs, 0.035], M.boots, { occ: 0 });
      b.ell(foot, [0.055, 0, -0.072], [0.135 * fs, 0.056 * fs, 0.016], M.sole, { occ: 0 });
    }
  } else {
    // legless crawler: ragged waist with bloody stump and trailing guts
    b.ell(J.pelvis, [0, 0, 0], [0.1 * B.d, 0.15 * B.w, 0.09], M.pants);
    b.ell(J.pelvis, [0, 0, -0.07], [0.09 * B.d, 0.135 * B.w, 0.05], M.wound);
    const g0 = at(J.pelvis, -0.02, 0.03, -0.09);
    let prev = g0;
    for (let i = 1; i <= 5; i++) {
      const p = at(J.pelvis, -0.02 - Math.sin(i * 0.9) * 0.05, 0.03 + Math.sin(i * 1.7) * 0.06, -0.09 - i * 0.07);
      p.z = Math.max(0.03, p.z);
      b.seg(prev, p, 0.024 - i * 0.002, 0.022 - i * 0.002, M.gut, { occ: false });
      prev = p;
    }
    for (const s of [1, -1]) { const st = at(J.pelvis, 0, s * 0.08, -0.08); b.seg(st, at(J.pelvis, 0.0, s * 0.085, -0.16), 0.06, 0.055, M.pants, { capB: false }); b.ball(at(J.pelvis, 0, s * 0.085, -0.165), 0.052, M.wound); b.ball(at(J.pelvis, 0, s * 0.085, -0.18), 0.018, M.bone, false); }
  }
  // ---------------- torso
  b.tag = 'torso';
  const C = J.chest, bw = B.w, bd = B.d;
  b.ell(C, [0.0, 0, 0.12], [0.1 * bd + B.belly * 0.03, 0.142 * bw, 0.13], M.top);                 // abdomen
  b.ell(C, [0.008, 0, 0.31], [0.118 * bd, 0.172 * bw, 0.165], M.top);                               // ribcage
  b.ell(C, [-0.025, 0, 0.42], [0.1 * bd, 0.185 * bw, 0.075], M.top, { rot: [0, 0.12, 0] });        // upper back / trapezius yoke
  if (B.belly > 0.5) {
    const sw = 1 + (P.swell ?? 0) * 0.07;
    b.ell(C, [0.1, 0, 0.12], [0.24 * sw, 0.26 * sw, 0.24 * sw], M.skin);                             // bloater gut
    b.ell(C, [-0.04, 0, 0.3], [0.17 * sw, 0.24 * sw, 0.2], M.skin);                                // swollen back
  }
  // shoulders (deltoids)
  for (const [sh, s] of [[J.shoulderL, 1], [J.shoulderR, -1]] as const) b.ball(sh.clone().add(dirOf(C, 0, s * 0.008, 0.004)), 0.062 * Math.sqrt(B.armT) * (B.w > 1.2 ? 1.25 : 1), L.sleeve === 'none' ? M.skin : M.top);
  // neck
  const nb = at(C, 0.0, 0, D.neckZ - 0.02), nt = V().applyMatrix4(J.head);
  b.seg(nb, nt, 0.052 * B.neck * (B.w > 1.2 ? 1.6 : 1), 0.045 * (B.w > 1.2 ? 1.4 : 1), M.skin, { capA: false });
  // clothing details visible from above
  topDetails(b, L, J, M);
  // ---------------- arms
  b.tag = 'arms';
  for (const [sh, el, wr, hand, side] of [[J.shoulderL, J.elbowL, J.wristL, J.handL, 1], [J.shoulderR, J.elbowR, J.wristR, J.handR, -1]] as const) {
    const r = D.armR;
    const longS = L.sleeve === 'long', shortS = L.sleeve === 'short';
    if (longS) {
      b.seg(sh, el, r * 1.28, r * 1.12, M.top);
      b.seg(el, wr, r * 1.12, r * 0.98, M.top, { capB: false });
      const cuff = wr.clone().lerp(el, 0.06);
      b.seg(cuff, wr.clone().lerp(el, -0.02), r * 1.0, r * 0.98, M.topDark, { occ: false });
    } else {
      b.seg(sh, el, r, r * 0.8, M.skin);
      b.seg(el, wr, r * 0.8, r * 0.62, M.skin);
      if (shortS) b.seg(sh, sh.clone().lerp(el, 0.55), r * 1.3, r * 1.18, M.top, { capB: true });
      if ((L.wounds ?? 0) > 0 && side === 1) b.ell(basis(el.clone().lerp(wr, 0.45), wr.clone().sub(el), V(0, 0, 1)), [0, 0, r * 0.55], [0.035, r * 0.6, 0.02], M.wound, { occ: 0 });
    }
    buildHand(b, L, P[side === 1 ? 'armL' : 'armR'], hand, M, side);
  }
  // ---------------- head
  b.tag = 'head';
  buildHead(b, L, J, M);
  b.tag = 'torso';
  // zombie wounds on the torso (exposed ribs / bite marks)
  if (L.zombie && (L.wounds ?? 0) > 0) {
    const n = L.wounds!;
    const R = mulberry(L.seed * 31 + 7);
    for (let i = 0; i < n; i++) {
      const a = (R() - 0.5) * 2.4 + (R() < 0.5 ? 0 : Math.PI), zz = 0.22 + R() * 0.2;
      const rr = 0.165 * bw;
      const c: V3 = [Math.cos(a) * 0.118 * bd * 0.97, Math.sin(a) * rr * 0.97, zz];
      // a flat, irregular gash lying on the surface (local x = surface normal)
      b.ell(C, c, [0.012, 0.03 + R() * 0.025, 0.022 + R() * 0.02], M.wound, { occ: 0, rot: [R() * 1.2 - 0.6, 0, a] });
      if (L.top === 'shirtless' && i === 0) for (let k = -2; k <= 2; k++) b.ell(C, [c[0] * 1.02, c[1] + k * 0.012, c[2]], [0.012, 0.004, 0.026], M.bone, { occ: 0 });
    }
  }
  if (L.pustule) {
    const R = mulberry(L.seed * 13 + 1);
    const glow = P.glow ?? 0;
    for (let i = 0; i < 13; i++) {
      const a = R() * Math.PI * 2, zz = 0.1 + R() * 0.32, sz = 0.026 + R() * 0.035;
      const sw = 1 + (P.swell ?? 0) * 0.07;
      const front = zz < 0.24;
      const c: V3 = front ? [0.1 + Math.cos(a) * 0.235 * sw, Math.sin(a) * 0.255 * sw, 0.12 + (zz - 0.17) * 0.8] : [-0.04 + Math.cos(a) * 0.16 * sw, Math.sin(a) * 0.235 * sw, 0.3 + (R() - 0.5) * 0.1];
      const hot = (i + Math.floor(glow * 9)) % 3 === 0 && glow > 0.2;
      b.ell(C, c, [sz, sz, sz * 0.8], hot ? M.pustuleHot : M.pustule, { occ: 0 });
    }
  }
  return J;
}

function topDetails(b: Builder, L: Look, J: Joints, M: ReturnType<typeof lookMats>) {
  const C = J.chest, D = J.dims, B = L.build;
  switch (L.top) {
    case 'field': {
      // stand-up collar, shoulder epaulettes, chest pockets, back yoke seam
      b.torus(C, [0.0, 0, D.neckZ - 0.025], 0.068, 0.022, M.top, { rot: [0, -0.15, 0], sx: 1.05 });
      for (const s of [1, -1]) {
        b.ell(C, [-0.01, s * 0.15 * B.w, 0.47], [0.05, 0.03, 0.012], M.topDark, { occ: 0, rot: [s * 0.15, 0, s * -0.4] });
        b.ell(C, [0.105, s * 0.085, 0.36], [0.022, 0.05, 0.05], M.topDark, { occ: 0 });
      }
      b.ell(C, [-0.075, 0, 0.36], [0.045, 0.14, 0.09], M.topDark, { occ: 0, rot: [0, 0.5, 0] });
      if (!L.zombie) {
        // rifle sling: diagonal strap over the left shoulder, across the back to the right hip, with a buckle
        const strap = mat({ color: '#2b2a24', pat: 'canvas', rough: 0.85, scale: 14, bump: 1.2, seed: 77, rim: 0.3 });
        const p0 = at(C, 0.07, 0.15, 0.44), p1 = at(C, -0.04, 0.155, 0.475), p2 = at(C, -0.128, 0.05, 0.36), p3 = at(C, -0.118, -0.11, 0.12);
        b.seg(p0, p1, 0.016, 0.016, strap, { occ: false }); b.seg(p1, p2, 0.016, 0.016, strap, { occ: false }); b.seg(p2, p3, 0.016, 0.016, strap, { occ: false });
        b.ell(C, [-0.132, 0.0, 0.3], [0.012, 0.022, 0.016], M.metal, { occ: 0 });
      }
      break;
    }
    case 'hoodie': {
      b.ell(C, [-0.1, 0, 0.47], [0.075, 0.13, 0.07], M.top, { rot: [0, 0.6, 0] }); // bunched hood
      b.torus(C, [-0.06, 0, 0.45], 0.06, 0.018, M.topDark, { rot: [0, 0.8, 0] });
      for (const s of [1, -1]) b.seg(at(C, 0.1, s * 0.03, 0.47), at(C, 0.125, s * 0.035, 0.32), 0.006, 0.006, M.topDark, { occ: false }); // drawstrings
      break;
    }
    case 'suit': {
      b.torus(C, [0.0, 0, D.neckZ - 0.03], 0.064, 0.016, mat({ color: '#d8d4c8', pat: 'cloth', rough: 0.8, blood: 0.5, seed: L.seed }), { rot: [0, -0.2, 0] });
      for (const s of [1, -1]) b.ell(C, [0.09, s * 0.07, 0.4], [0.03, 0.05, 0.08], M.topDark, { occ: 0, rot: [s * 0.4, 0, 0] });
      b.ell(C, [0.1, -0.01, 0.38], [0.02, 0.018, 0.1], mat({ color: '#5a1a1a', pat: 'cloth', rough: 0.6, seed: L.seed }), { occ: 0 }); // tie
      break;
    }
    case 'overalls': {
      for (const s of [1, -1]) b.seg(at(C, 0.11, s * 0.08, 0.2), at(C, -0.02, s * 0.11, 0.48), 0.012, 0.012, mat({ color: L.topColor2 || '#3e5470', pat: 'denim', scale: 10, blood: 0.4, seed: L.seed }), { occ: false });
      b.ell(C, [0.1, 0, 0.18], [0.03, 0.1, 0.09], mat({ color: L.topColor2 || '#3e5470', pat: 'denim', scale: 10, blood: 0.4, seed: L.seed }), { occ: 0 });
      break;
    }
    case 'tee': case 'stripes': case 'plaid': case 'scrubs': {
      b.torus(C, [0.0, 0, D.neckZ - 0.04], 0.062, 0.012, M.topDark, { rot: [0, -0.2, 0] });
      if (L.top === 'plaid') for (const s of [1, -1]) b.ell(C, [0.1, s * 0.03, 0.44], [0.028, 0.045, 0.012], M.top, { occ: 0, rot: [s * 0.5, 0.2, 0] });
      break;
    }
    case 'tank': {
      for (const s of [1, -1]) b.ell(C, [-0.0, s * 0.11, 0.455], [0.07, 0.025, 0.015], M.top, { occ: 0 });
      break;
    }
  }
  if (L.scarf) {
    const sc = M.scarf;
    b.torus(C, [0.01, 0, D.neckZ - 0.03], 0.066, 0.028, sc, { rot: [0, -0.25, 0], sx: 1.05 });
    b.ell(C, [0.035, 0.05, D.neckZ - 0.03], [0.05, 0.04, 0.03], sc, { occ: 0, rot: [0.4, 0, 0.3] });               // knot
    b.seg(at(C, 0.07, 0.055, D.neckZ - 0.04), at(C, 0.135, 0.06, 0.3), 0.028, 0.024, sc, { occ: false });         // tail over the chest
  }
}

function buildHand(b: Builder, L: Look, A: ArmT, H: THREE.Matrix4, M: ReturnType<typeof lookMats>, side: number) {
  const k = L.build.hand, kind = A.hand || (L.zombie ? 'claw' : 'fist');
  const glove = L.gloves ? M.gloves : M.skin;
  if (kind === 'fist') {
    b.ell(H, [0.045 * k, 0, 0], [0.05 * k, 0.044 * k, 0.03 * k], glove);
    b.ell(H, [0.082 * k, 0, -0.004], [0.026 * k, 0.046 * k, 0.03 * k], M.skin, { occ: 0 });          // curled fingers
    for (let i = -1.5; i <= 1.5; i++) b.ell(H, [0.09 * k, i * 0.023 * k, 0.012 * k], [0.013 * k, 0.011 * k, 0.012 * k], M.skin, { occ: 0, lo: true }); // knuckles
    const tb = V(0.03 * k, side * 0.04 * k, -0.005).applyMatrix4(H), tt = V(0.075 * k, side * 0.035 * k, 0.012).applyMatrix4(H);
    b.seg(tb, tt, 0.014 * k, 0.012 * k, M.skin, { occ: false });
  } else {
    // open / claw: palm plus splayed hooked fingers
    const curl = A.curl ?? (kind === 'claw' ? 0.6 : 0.2);
    b.ell(H, [0.045 * k, 0, 0], [0.05 * k, 0.045 * k, 0.02 * k], M.skin);
    for (let i = 0; i < 4; i++) {
      const sp = (i - 1.5) * 0.024 * k, splay = (i - 1.5) * 0.18;
      const base = V(0.088 * k, sp, 0).applyMatrix4(H);
      const midL = V(0.088 * k + 0.045 * k, sp + splay * 0.04, -0.012 * curl).applyMatrix4(H);
      const tip = V(0.088 * k + 0.07 * k, sp + splay * 0.07, -0.05 * curl).applyMatrix4(H);
      b.seg(base, midL, 0.011 * k, 0.01 * k, M.skin, { occ: false, sides: 10 });
      b.seg(midL, tip, 0.01 * k, 0.007 * k, kind === 'claw' && L.zombie ? M.skin : M.skin, { occ: false, sides: 10 });
    }
    const tb = V(0.03 * k, side * 0.045 * k, -0.005).applyMatrix4(H), tt = V(0.08 * k, side * 0.075 * k, -0.02 * curl).applyMatrix4(H);
    b.seg(tb, tt, 0.013 * k, 0.009 * k, M.skin, { occ: false, sides: 10 });
  }
}

function buildHead(b: Builder, L: Look, J: Joints, M: ReturnType<typeof lookMats>) {
  const Hm = J.head, s = J.dims.headS;
  const S = (v: V3): V3 => [v[0] * s, v[1] * s, v[2] * s];
  b.ell(Hm, S([0.012, 0, 0.1]), S([0.1, 0.082, 0.112]), M.skin);                       // cranium
  b.ell(Hm, S([0.052, 0, 0.03]), S([0.062, 0.066, 0.055]), M.skin, { occ: 0 });          // jaw/cheeks
  b.ell(Hm, S([0.108, 0, 0.075]), S([0.026, 0.014, 0.02]), M.skin, { occ: 0, rot: [0, -0.3, 0] }); // nose
  for (const sd of [1, -1]) b.ell(Hm, S([0.0, sd * 0.083, 0.085]), S([0.02, 0.012, 0.028]), M.skin, { occ: 0 }); // ears
  for (const sd of [1, -1]) b.ell(Hm, S([0.09, sd * 0.03, 0.105]), S([0.018, 0.022, 0.008]), M.skin, { occ: 0 }); // brow ridge
  if (L.zombie) {
    for (const sd of [1, -1]) b.ell(Hm, S([0.088, sd * 0.032, 0.09]), S([0.012, 0.014, 0.01]), M.eye, { occ: 0 });
    b.ell(Hm, S([0.098, 0, 0.022]), S([0.016, 0.03, 0.014]), M.mouth, { occ: 0 }); // gaping mouth
  }
  switch (L.hair) {
    case 'beanie':
      b.ell(Hm, S([-0.004, 0, 0.13]), S([0.104, 0.09, 0.098]), M.hair);
      b.torus(Hm, S([0.0, 0, 0.115]), 0.088 * s, 0.02 * s, mat({ color: shadeHex(L.hairColor, -0.12), pat: 'cloth', rough: 0.95, scale: 14, bump: 1.0, seed: L.seed + 21, rim: 0.4 }), { sx: 1.13, rot: [0, -0.2, 0] });
      b.ell(Hm, S([-0.088, 0.0, 0.07]), S([0.02, 0.06, 0.04]), mat({ color: '#2a2622', pat: 'hair', rough: 0.7, scale: 10, seed: L.seed }), { occ: 0 }); // hair at the nape
      break;
    case 'short': case 'buzz': case 'patchy':
      b.ell(Hm, S([-0.002, 0, L.hair === 'short' ? 0.112 : 0.105]), S([L.hair === 'short' ? 0.104 : 0.101, L.hair === 'short' ? 0.087 : 0.084, 0.106]), M.hair);
      break;
    case 'long':
      b.ell(Hm, S([-0.008, 0, 0.11]), S([0.106, 0.09, 0.11]), M.hair);
      b.ell(Hm, S([-0.08, 0, -0.03]), S([0.05, 0.088, 0.14]), M.hair, { occ: 0, rot: [0, 0.2, 0] });
      break;
    case 'ponytail':
      b.ell(Hm, S([-0.004, 0, 0.11]), S([0.104, 0.087, 0.108]), M.hair);
      b.seg(V(-0.1 * s, 0, 0.12 * s).applyMatrix4(Hm), V(-0.2 * s, 0.01, -0.05 * s).applyMatrix4(Hm), 0.028 * s, 0.014 * s, M.hair, { occ: false });
      break;
    case 'bald': break;
  }
  if (L.zombie && (L.wounds ?? 0) >= 2) b.ell(Hm, S([-0.02, -0.04, 0.19]), S([0.04, 0.03, 0.02]), M.wound, { occ: 0 }); // scalp wound
}

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export { V, v3, at, dirOf, basis, ID };
