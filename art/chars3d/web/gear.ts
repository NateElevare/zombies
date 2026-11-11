// art/chars3d/web/gear.ts — armor and backpack overlays, modeled as shells fitted to the posed body
// (rendered per torso frame so they follow every pose exactly; arms occlude them via a depth-only pass).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mat } from './materials';
import { Builder, type Joints, type Look, type Pose, at, V } from './rig';

export const GEAR = {
  head: ['cap', 'bike_helmet', 'riot_helmet', 'military_helmet'],
  body: ['hoodie', 'leather_jacket', 'police_vest', 'military_vest'],
  back: ['small', 'hiking', 'military'],
};

function rbox(b: Builder, M: THREE.Matrix4, c: [number, number, number], s: [number, number, number], m: THREE.Material, r = 0.012, rot?: [number, number, number]) {
  const g = new RoundedBoxGeometry(s[0], s[1], s[2], 3, Math.min(r, s[0] / 2.1, s[1] / 2.1, s[2] / 2.1));
  const L = new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]);
  if (rot) L.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'ZYX')));
  return b.geo(g, M.clone().multiply(L), m);
}

/** torso shell: the body's abdomen/ribcage/yoke ellipsoids inflated by `t` */
function shell(b: Builder, J: Joints, L: Look, m: THREE.Material, t: number, o: { yoke?: boolean } = {}) {
  const C = J.chest, bw = L.build.w, bd = L.build.d;
  b.ell(C, [0.0, 0, 0.12], [0.1 * bd + t, 0.142 * bw + t, 0.13 + t * 0.5], m, { occ: 0 });
  b.ell(C, [0.008, 0, 0.31], [0.118 * bd + t, 0.172 * bw + t, 0.165 + t * 0.5], m, { occ: 0 });
  if (o.yoke !== false) b.ell(C, [-0.025, 0, 0.42], [0.1 * bd + t, 0.185 * bw + t, 0.075 + t * 0.6], m, { occ: 0, rot: [0, 0.12, 0] });
}
function sleeves(b: Builder, J: Joints, m: THREE.Material, cuff: THREE.Material, t: number) {
  const r = J.dims.armR;
  for (const [sh, el, wr] of [[J.shoulderL, J.elbowL, J.wristL], [J.shoulderR, J.elbowR, J.wristR]] as const) {
    b.ball(sh, 0.062 + t + 0.004, m, false);
    b.seg(sh, el, r * 1.28 + t, r * 1.12 + t, m, { occ: false });
    const end = wr.clone().lerp(el, 0.12);
    b.seg(el, end, r * 1.12 + t, r * 1.0 + t, m, { occ: false, capB: false });
    b.seg(end, wr.clone().lerp(el, 0.02), r * 1.04 + t, r * 1.02 + t, cuff, { occ: false });
  }
}

export function buildGear(b: Builder, id: string, J: Joints, L: Look, _P: Pose) {
  const C = J.chest, H = J.head, D = J.dims;
  switch (id) {
    // ---------------- head
    case 'cap': {
      const m = mat({ color: '#4a5236', pat: 'cloth', rough: 0.9, scale: 16, bump: 0.6, seed: 31, rim: 0.4, grime: 0.3 });
      b.ell(H, [0.0, 0, 0.13], [0.108, 0.093, 0.09], m, { occ: 0 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.seg(at(H, 0, 0, 0.222), at(H, Math.cos(a) * 0.1, Math.sin(a) * 0.087, 0.15), 0.003, 0.003, mat({ color: '#30361f', rough: 0.9 }), { occ: false, sides: 6, capA: false }); }
      b.ell(H, [0.0, 0, 0.222], [0.012, 0.012, 0.006], m, { occ: 0 });
      const s = new THREE.Shape(); s.moveTo(0.06, -0.075); s.quadraticCurveTo(0.21, -0.07, 0.21, 0); s.quadraticCurveTo(0.21, 0.07, 0.06, 0.075); s.lineTo(0.06, -0.075);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2 });
      b.geo(g, H.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.12)).multiply(new THREE.Matrix4().makeRotationY(0.22)), mat({ color: '#3e4530', pat: 'cloth', rough: 0.85, scale: 16, seed: 32, rim: 0.4 }));
      break;
    }
    case 'bike_helmet': {
      const m = mat({ color: '#2f6a92', pat: 'plain', rough: 0.3, scale: 20, bump: 0.2, seed: 33, rim: 0.6 });
      b.ell(H, [-0.01, 0, 0.14], [0.135, 0.105, 0.095], m, { occ: 0, rot: [0, -0.1, 0] });
      const dark = mat({ color: '#141a20', rough: 0.6 });
      for (let i = -2; i <= 2; i++) rbox(b, H, [-0.01, i * 0.032, 0.232], [0.13, 0.012, 0.012], dark, 0.005);
      rbox(b, H, [-0.02, 0, 0.235], [0.2, 0.006, 0.008], mat({ color: '#d8dde0', rough: 0.4, rim: 0.5 }), 0.003);
      break;
    }
    case 'riot_helmet': {
      const m = mat({ color: '#22262b', pat: 'plain', rough: 0.35, scale: 20, bump: 0.2, seed: 34, rim: 0.6 });
      b.ell(H, [-0.005, 0, 0.12], [0.13, 0.115, 0.12], m, { occ: 0 });
      b.torus(H, [-0.005, 0, 0.085], 0.118, 0.008, mat({ color: '#111', rough: 0.6 }), { sx: 1.1 });
      const visor = mat({ color: '#2a3c4a', emissive: '#3a5a72', emissiveI: 0.25, metal: 0.3, rough: 0.08, rim: 0.9 });
      b.ell(H, [0.095, 0, 0.09], [0.06, 0.12, 0.11], visor, { occ: 0, rot: [0, -0.2, 0] });
      break;
    }
    case 'military_helmet': {
      const m = mat({ color: '#4c5232', color2: '#363a22', pat: 'canvas', rough: 0.95, scale: 18, bump: 0.9, seed: 35, rim: 0.4 });
      b.ell(H, [-0.008, 0, 0.13], [0.14, 0.124, 0.105], m, { occ: 0 });
      b.torus(H, [-0.008, 0, 0.1], 0.124, 0.009, mat({ color: '#2a2c1a', pat: 'cloth', rough: 0.9 }), { sx: 1.12 });
      // goggles strapped on top
      rbox(b, H, [0.04, 0, 0.225], [0.05, 0.13, 0.03], mat({ color: '#1c1e1a', rough: 0.6 }), 0.012);
      for (const s of [1, -1]) b.ell(H, [0.055, s * 0.035, 0.24], [0.022, 0.03, 0.012], mat({ color: '#203040', emissive: '#4a6a80', emissiveI: 0.3, rough: 0.05, metal: 0.4, rim: 0.9 }), { occ: 0 });
      break;
    }
    // ---------------- body
    case 'hoodie': {
      const m = mat({ color: '#5a5d61', pat: 'cloth', rough: 0.95, scale: 12, bump: 0.7, seed: 36, rim: 0.35, grime: 0.2 });
      const dk = mat({ color: '#45484c', pat: 'cloth', rough: 0.95, scale: 12, bump: 0.7, seed: 37, rim: 0.3 });
      shell(b, J, L, m, 0.016);
      sleeves(b, J, m, dk, 0.012);
      b.ell(C, [-0.1, 0, 0.5], [0.08, 0.135, 0.075], m, { occ: 0, rot: [0, 0.6, 0] }); // hood
      b.torus(C, [-0.06, 0, 0.48], 0.065, 0.02, dk, { rot: [0, 0.75, 0] });
      for (const s of [1, -1]) b.seg(at(C, 0.11, s * 0.03, 0.47), at(C, 0.14, s * 0.035, 0.3), 0.006, 0.006, mat({ color: '#d8d4cc', rough: 0.8 }), { occ: false });
      break;
    }
    case 'leather_jacket': {
      const m = mat({ color: '#4a2e1c', color2: '#2e1a0e', pat: 'leather', rough: 0.45, scale: 9, bump: 0.9, seed: 38, rim: 0.55 });
      const dk = mat({ color: '#2e1c10', pat: 'leather', rough: 0.4, scale: 9, bump: 0.9, seed: 39, rim: 0.5 });
      shell(b, J, L, m, 0.014);
      sleeves(b, J, m, dk, 0.01);
      b.torus(C, [0.0, 0, D.neckZ - 0.02], 0.08, 0.03, dk, { rot: [0, -0.2, 0], sx: 1.15 }); // collar
      for (const s of [1, -1]) b.ell(C, [0.1, s * 0.06, 0.42], [0.03, 0.06, 0.05], dk, { occ: 0, rot: [s * 0.5, 0, 0] }); // lapels
      const zip = mat({ color: '#a8a8a0', pat: 'metal', metal: 0.9, rough: 0.3 });
      b.seg(at(C, 0.135, -0.02, 0.4), at(C, 0.12, -0.02, 0.06), 0.004, 0.004, zip, { occ: false });
      break;
    }
    case 'police_vest': {
      const m = mat({ color: '#1f2633', pat: 'canvas', rough: 0.85, scale: 14, bump: 0.6, seed: 40, rim: 0.4 });
      shell(b, J, L, m, 0.022, { yoke: false });
      for (const s of [1, -1]) b.seg(at(C, 0.07, s * 0.12, 0.45), at(C, -0.07, s * 0.12, 0.45), 0.03, 0.03, m, { occ: false }); // shoulder straps
      const patch = mat({ color: '#d8d6c8', pat: 'plain', rough: 0.7, scale: 30, rim: 0.3 });
      rbox(b, C, [-0.135, 0, 0.33], [0.012, 0.2, 0.08], patch, 0.004);                      // POLICE back panel
      const ink = mat({ color: '#1f2633', rough: 0.8 });
      for (let i = 0; i < 6; i++) rbox(b, C, [-0.141, -0.075 + i * 0.03, 0.33], [0.004, 0.018, 0.05], ink, 0.002); // letters
      rbox(b, C, [0.14, 0.07, 0.36], [0.012, 0.045, 0.035], mat({ color: '#b8a040', pat: 'metal', metal: 0.8, rough: 0.3 }), 0.006); // badge
      rbox(b, C, [0.13, -0.08, 0.3], [0.03, 0.05, 0.08], mat({ color: '#15181e', rough: 0.7 }), 0.01); // radio
      break;
    }
    case 'military_vest': {
      const m = mat({ color: '#565a3a', color2: '#3e4228', pat: 'canvas', rough: 0.9, scale: 14, bump: 0.8, seed: 41, rim: 0.4, grime: 0.25 });
      const p = mat({ color: '#4a4e30', pat: 'canvas', rough: 0.9, scale: 14, bump: 0.8, seed: 42, rim: 0.4 });
      shell(b, J, L, m, 0.026, { yoke: false });
      for (const s of [1, -1]) b.seg(at(C, 0.08, s * 0.12, 0.45), at(C, -0.08, s * 0.12, 0.45), 0.034, 0.034, m, { occ: false });
      for (let i = -1; i <= 1; i++) rbox(b, C, [0.15, i * 0.075, 0.24], [0.05, 0.065, 0.11], p, 0.014);   // mag pouches front
      rbox(b, C, [0.14, 0.0, 0.38], [0.04, 0.14, 0.06], p, 0.012);                                         // admin pouch
      rbox(b, C, [-0.15, 0.0, 0.3], [0.05, 0.18, 0.2], p, 0.02);                                            // back panel
      for (let i = 0; i < 4; i++) rbox(b, C, [-0.178, 0, 0.22 + i * 0.05], [0.006, 0.17, 0.01], mat({ color: '#30331f', rough: 0.9 }), 0.003); // MOLLE
      break;
    }
    // ---------------- backpacks (on the back: -X)
    case 'small': case 'hiking': case 'military': {
      const col = id === 'small' ? '#2f3a4e' : id === 'hiking' ? '#7a3a30' : '#4f5536';
      const m = mat({ color: col, pat: 'canvas', rough: 0.9, scale: 14, bump: 0.8, seed: 43, rim: 0.4, grime: 0.25 });
      const dk = mat({ color: col, pat: 'canvas', rough: 0.9, scale: 14, bump: 0.8, seed: 44, rim: 0.3, vary: 0.4 });
      const strap = mat({ color: '#1e1e1c', pat: 'cloth', rough: 0.9, scale: 20 });
      const sz = id === 'small' ? [0.11, 0.26, 0.3] : id === 'hiking' ? [0.15, 0.3, 0.46] : [0.17, 0.33, 0.4];
      const bx = -(0.125 + sz[0] / 2);
      rbox(b, C, [bx, 0, 0.3], [sz[0], sz[1], sz[2]], m, 0.05);
      rbox(b, C, [bx - sz[0] * 0.45, 0, 0.24], [sz[0] * 0.4, sz[1] * 0.7, sz[2] * 0.45], dk, 0.03);         // front pocket
      rbox(b, C, [bx + 0.01, 0, 0.3 + sz[2] / 2 - 0.02], [sz[0] * 0.9, sz[1] * 0.92, 0.04], dk, 0.02);      // top lid
      for (const s of [1, -1]) b.seg(at(C, -0.12, s * 0.1, 0.47), at(C, 0.1, s * 0.11, 0.42), 0.013, 0.013, strap, { occ: false }); // shoulder straps
      if (id === 'hiking') {
        const roll = mat({ color: '#5a5f3a', pat: 'cloth', rough: 0.95, scale: 10, bump: 0.8, seed: 45, rim: 0.4 });
        b.seg(at(C, bx, 0.2, 0.3 + sz[2] / 2 + 0.05), at(C, bx, -0.2, 0.3 + sz[2] / 2 + 0.05), 0.055, 0.055, roll, { occ: false }); // bedroll
        for (const y of [0.1, -0.1]) b.torus(C, [bx, y, 0.3 + sz[2] / 2 + 0.05], 0.057, 0.006, strap, { rot: [Math.PI / 2, 0, 0] });
      }
      if (id === 'military') for (const s of [1, -1]) rbox(b, C, [bx + 0.01, s * (sz[1] / 2 + 0.03), 0.26], [0.1, 0.06, 0.18], dk, 0.02); // side pouches
      break;
    }
  }
  void V;
}
