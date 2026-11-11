// art/chars3d/web/weapons.ts — 3D weapon models. Local frame: grip at the origin, +X = muzzle direction,
// +Z = up (top of the weapon), +Y = left. Dimensions in meters.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mat } from './materials';
import { Builder, V } from './rig';

export interface WeaponDef { id: string; cls: 'handgun' | 'long' | 'melee'; back: number; front: number; halfW: number }
/** back = how far the weapon reaches behind the grip, front = grip -> muzzle/tip (meters) */
export const WEAPON_DEFS: WeaponDef[] = [
  { id: 'pistol', cls: 'handgun', back: 0.05, front: 0.155, halfW: 0.03 },
  { id: 'revolver', cls: 'handgun', back: 0.05, front: 0.215, halfW: 0.035 },
  { id: 'smg', cls: 'long', back: 0.2, front: 0.33, halfW: 0.04 },
  { id: 'shotgun', cls: 'long', back: 0.34, front: 0.64, halfW: 0.04 },
  { id: 'assault_rifle', cls: 'long', back: 0.3, front: 0.6, halfW: 0.045 },
  { id: 'hunting_rifle', cls: 'long', back: 0.36, front: 0.74, halfW: 0.05 },
  { id: 'knife', cls: 'melee', back: 0.07, front: 0.2, halfW: 0.03 },
  { id: 'bat', cls: 'melee', back: 0.07, front: 0.72, halfW: 0.04 },
  { id: 'machete', cls: 'melee', back: 0.08, front: 0.5, halfW: 0.045 },
];

const M = {
  steel: () => mat({ color: '#3b3e43', pat: 'metal', metal: 0.85, rough: 0.38, scale: 10, bump: 0.15, rim: 0.5 }),
  blued: () => mat({ color: '#25282d', pat: 'metal', metal: 0.8, rough: 0.32, scale: 10, bump: 0.15, rim: 0.5 }),
  poly: () => mat({ color: '#222326', pat: 'rubber', rough: 0.7, scale: 40, bump: 0.5, rim: 0.4 }),
  polyTan: () => mat({ color: '#6b5f48', pat: 'rubber', rough: 0.75, scale: 40, bump: 0.5, rim: 0.4 }),
  wood: () => mat({ color: '#6b4426', color2: '#3e2614', pat: 'wood', rough: 0.45, scale: 6, bump: 0.3, rim: 0.4 }),
  woodLight: () => mat({ color: '#b08a5a', color2: '#7a5a36', pat: 'wood', rough: 0.55, scale: 5, bump: 0.3, rim: 0.4, blood: 0.55, seed: 4 }),
  blade: () => mat({ color: '#b9bdc2', pat: 'metal', metal: 0.95, rough: 0.22, scale: 10, bump: 0.1, rim: 0.6 }),
  bladeDirty: () => mat({ color: '#8d9196', pat: 'metal', metal: 0.9, rough: 0.35, scale: 10, bump: 0.1, rim: 0.6, blood: 0.45, seed: 9 }),
  tape: () => mat({ color: '#1e1e1e', pat: 'cloth', rough: 0.9, scale: 30, bump: 0.8, rim: 0.2 }),
  glass: () => mat({ color: '#203040', emissive: '#4a7a9a', emissiveI: 0.35, metal: 0.2, rough: 0.1, rim: 0.8 }),
  red: () => mat({ color: '#ff3020', emissive: '#ff3020', emissiveI: 2.0, rough: 0.3 }),
  brass: () => mat({ color: '#9a7a3a', pat: 'metal', metal: 0.9, rough: 0.3, scale: 10 }),
};

function box(b: Builder, G: THREE.Matrix4, x0: number, x1: number, w: number, z0: number, z1: number, m: THREE.Material, r = 0.004, y = 0) {
  const g = new RoundedBoxGeometry(x1 - x0, w, z1 - z0, 2, Math.min(r, (x1 - x0) / 2.1, w / 2.1, (z1 - z0) / 2.1));
  return b.geo(g, G.clone().multiply(new THREE.Matrix4().makeTranslation((x0 + x1) / 2, y, (z0 + z1) / 2)), m);
}
function tube(b: Builder, G: THREE.Matrix4, x0: number, x1: number, r0: number, r1: number, z: number, m: THREE.Material, y = 0, sides = 20) {
  const g = new THREE.CylinderGeometry(r1, r0, x1 - x0, sides, 1, false);
  const R = new THREE.Matrix4().makeRotationZ(-Math.PI / 2); // cylinder Y axis -> +X
  return b.geo(g, G.clone().multiply(new THREE.Matrix4().makeTranslation((x0 + x1) / 2, y, z)).multiply(R), m);
}
/** extruded top-view outline (points in x,y), thickness t centered at z */
function slab(b: Builder, G: THREE.Matrix4, pts: [number, number][], t: number, z: number, m: THREE.Material, bevel = 0.002) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -t / 2);
  return b.geo(g, G.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, z)), m);
}
function lathe(b: Builder, G: THREE.Matrix4, prof: [number, number][], m: THREE.Material, z = 0) {
  // profile: [x along weapon, radius]
  const g = new THREE.LatheGeometry(prof.map(([x, r]) => new THREE.Vector2(r, x)), 28);
  return b.geo(g, G.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, z)).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2)), m);
}

/** Build weapon `id` with its grip at frame G. Returns local muzzle/tip x. */
export function buildWeapon(b: Builder, id: string, G: THREE.Matrix4) {
  switch (id) {
    case 'pistol': {
      box(b, G, -0.045, 0.155, 0.027, 0.02, 0.05, M.blued(), 0.005);            // slide
      for (let i = 0; i < 6; i++) box(b, G, -0.04 + i * 0.006, -0.037 + i * 0.006, 0.029, 0.024, 0.048, M.steel(), 0.0008); // serrations
      box(b, G, 0.06, 0.1, 0.029, 0.025, 0.045, M.steel(), 0.002);              // ejection port
      box(b, G, -0.035, 0.13, 0.024, -0.005, 0.022, M.poly(), 0.004);           // frame
      box(b, G, -0.04, 0.02, 0.03, -0.09, 0.0, M.poly(), 0.008);                // grip
      box(b, G, 0.14, 0.15, 0.006, 0.05, 0.056, M.steel(), 0.001);              // front sight
      box(b, G, -0.04, -0.03, 0.02, 0.05, 0.056, M.steel(), 0.001);             // rear sight
      return 0.155;
    }
    case 'revolver': {
      tube(b, G, 0.06, 0.215, 0.011, 0.011, 0.04, M.steel());                    // barrel
      box(b, G, 0.06, 0.212, 0.012, 0.045, 0.054, M.steel(), 0.003);            // top rib
      tube(b, G, 0.01, 0.06, 0.022, 0.022, 0.03, M.steel(), 0, 6);              // cylinder (hex-ish)
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; tube(b, G, 0.058, 0.0615, 0.005, 0.005, 0.03 + Math.sin(a) * 0.013, M.brass(), Math.cos(a) * 0.013, 8); }
      box(b, G, -0.03, 0.065, 0.024, 0.0, 0.045, M.steel(), 0.006);            // frame
      box(b, G, -0.045, 0.005, 0.034, -0.09, 0.012, M.wood(), 0.012);           // wooden grip
      box(b, G, -0.04, -0.02, 0.01, 0.04, 0.052, M.steel(), 0.003);             // hammer
      return 0.215;
    }
    case 'smg': {
      box(b, G, -0.06, 0.2, 0.042, 0.02, 0.075, M.poly(), 0.008);               // receiver
      box(b, G, -0.02, 0.17, 0.02, 0.075, 0.085, M.steel(), 0.002);             // top rail
      for (let i = 0; i < 10; i++) box(b, G, -0.015 + i * 0.018, -0.008 + i * 0.018, 0.024, 0.08, 0.09, M.blued(), 0.001);
      box(b, G, 0.02, 0.07, 0.03, 0.09, 0.115, M.poly(), 0.006);                // red dot body
      box(b, G, 0.065, 0.07, 0.022, 0.093, 0.112, M.glass(), 0.002);
      box(b, G, 0.2, 0.28, 0.034, 0.03, 0.065, M.blued(), 0.01);                // shroud
      tube(b, G, 0.28, 0.33, 0.012, 0.012, 0.05, M.steel());                    // barrel / suppressor stub
      box(b, G, 0.06, 0.1, 0.03, -0.12, 0.02, M.blued(), 0.004);                // magazine
      box(b, G, -0.03, 0.01, 0.03, -0.09, 0.02, M.poly(), 0.008);               // grip
      for (const s of [1, -1]) tube(b, G, -0.2, -0.06, 0.006, 0.006, 0.045, M.steel(), s * 0.016, 8); // folding stock rails
      box(b, G, -0.215, -0.195, 0.05, 0.02, 0.07, M.poly(), 0.008);             // butt plate
      return 0.33;
    }
    case 'shotgun': {
      // stock (tapers toward the butt)
      slab(b, G, [[-0.34, -0.032], [-0.06, -0.022], [-0.04, -0.018], [-0.04, 0.018], [-0.06, 0.022], [-0.34, 0.032]], 0.05, 0.035, M.wood(), 0.008);
      box(b, G, -0.35, -0.335, 0.064, 0.0, 0.07, M.poly(), 0.008);              // recoil pad
      box(b, G, -0.045, 0.14, 0.038, 0.015, 0.075, M.blued(), 0.006);           // receiver
      tube(b, G, 0.13, 0.64, 0.012, 0.012, 0.065, M.steel());                   // barrel
      tube(b, G, 0.13, 0.55, 0.011, 0.011, 0.035, M.blued());                   // magazine tube
      tube(b, G, 0.22, 0.42, 0.024, 0.024, 0.045, M.wood(), 0, 16);             // pump
      for (let i = 0; i < 6; i++) tube(b, G, 0.24 + i * 0.03, 0.25 + i * 0.03, 0.0255, 0.0255, 0.045, M.poly(), 0, 16);
      box(b, G, 0.62, 0.635, 0.006, 0.075, 0.084, M.brass(), 0.001);           // bead sight
      return 0.64;
    }
    case 'assault_rifle': {
      box(b, G, -0.3, -0.12, 0.04, -0.01, 0.07, M.poly(), 0.012);               // stock
      box(b, G, -0.12, -0.06, 0.022, 0.03, 0.06, M.blued(), 0.006);             // buffer tube
      box(b, G, -0.07, 0.19, 0.046, 0.015, 0.08, M.polyTan(), 0.008);           // receiver
      box(b, G, -0.06, 0.4, 0.024, 0.08, 0.09, M.blued(), 0.002);               // top rail
      for (let i = 0; i < 24; i++) box(b, G, -0.055 + i * 0.019, -0.047 + i * 0.019, 0.028, 0.086, 0.096, M.blued(), 0.001);
      box(b, G, 0.0, 0.08, 0.036, 0.095, 0.13, M.poly(), 0.008);                // optic body
      tube(b, G, 0.0, 0.085, 0.018, 0.02, 0.112, M.poly());
      box(b, G, 0.082, 0.087, 0.026, 0.1, 0.124, M.glass(), 0.002);
      box(b, G, 0.19, 0.44, 0.05, 0.02, 0.08, M.poly(), 0.01);                  // handguard
      for (let i = 0; i < 6; i++) box(b, G, 0.21 + i * 0.038, 0.23 + i * 0.038, 0.052, 0.035, 0.065, M.blued(), 0.003); // vents
      tube(b, G, 0.44, 0.56, 0.009, 0.009, 0.05, M.steel());                    // barrel
      tube(b, G, 0.55, 0.6, 0.014, 0.014, 0.05, M.blued(), 0, 10);              // flash hider
      box(b, G, 0.06, 0.12, 0.03, -0.14, 0.02, M.blued(), 0.006);               // magazine
      box(b, G, -0.03, 0.01, 0.03, -0.1, 0.02, M.poly(), 0.008);                // grip
      return 0.6;
    }
    case 'hunting_rifle': {
      slab(b, G, [[-0.36, -0.035], [-0.12, -0.024], [-0.02, -0.02], [0.05, -0.024], [0.46, -0.02], [0.48, 0], [0.46, 0.02], [0.05, 0.024], [-0.02, 0.02], [-0.12, 0.024], [-0.36, 0.035]], 0.05, 0.035, M.wood(), 0.01);
      box(b, G, -0.37, -0.355, 0.07, 0.0, 0.07, M.poly(), 0.008);               // butt pad
      box(b, G, -0.02, 0.16, 0.03, 0.04, 0.075, M.blued(), 0.01);               // action
      tube(b, G, 0.15, 0.74, 0.01, 0.008, 0.065, M.blued());                    // barrel
      // scope
      tube(b, G, -0.05, 0.25, 0.015, 0.015, 0.11, M.poly());
      lathe(b, G, [[-0.07, 0.0], [-0.07, 0.02], [-0.04, 0.02], [-0.02, 0.015]], M.poly(), 0.11);
      lathe(b, G, [[0.2, 0.015], [0.24, 0.024], [0.28, 0.024], [0.28, 0.0]], M.poly(), 0.11);
      tube(b, G, 0.276, 0.282, 0.02, 0.02, 0.11, M.glass());
      tube(b, G, 0.08, 0.12, 0.019, 0.019, 0.11, M.poly());                     // turret ring
      box(b, G, 0.09, 0.11, 0.01, 0.13, 0.145, M.poly(), 0.003);                // elevation turret
      for (const x of [0.0, 0.18]) box(b, G, x, x + 0.025, 0.026, 0.07, 0.1, M.blued(), 0.004); // rings
      // bolt handle sticking out to the right with a knob
      b.seg(V(0.11, -0.015, 0.06).applyMatrix4(G), V(0.09, -0.065, 0.05).applyMatrix4(G), 0.006, 0.006, M.steel(), { occ: false, sides: 8 });
      b.ball(V(0.09, -0.07, 0.05).applyMatrix4(G), 0.012, M.steel(), false);
      box(b, G, -0.03, 0.01, 0.028, -0.06, 0.03, M.wood(), 0.01);               // pistol grip
      return 0.74;
    }
    case 'knife': {
      box(b, G, -0.07, 0.0, 0.026, -0.012, 0.014, M.tape(), 0.009);             // handle
      box(b, G, -0.075, -0.065, 0.028, -0.012, 0.014, M.steel(), 0.004);        // pommel
      box(b, G, 0.0, 0.012, 0.05, -0.008, 0.008, M.steel(), 0.003);             // guard
      slab(b, G, [[0.012, -0.014], [0.15, -0.013], [0.2, 0.004], [0.17, 0.012], [0.012, 0.014]], 0.004, 0, M.blade(), 0.002);
      slab(b, G, [[0.03, 0.006], [0.15, 0.006], [0.168, 0.011], [0.03, 0.012]], 0.0045, 0.0, M.blued(), 0.001); // spine
      return 0.2;
    }
    case 'bat': {
      lathe(b, G, [[-0.075, 0], [-0.075, 0.022], [-0.065, 0.024], [-0.06, 0.015], [0.1, 0.017], [0.3, 0.024], [0.5, 0.032], [0.68, 0.034], [0.71, 0.03], [0.72, 0.0]], M.woodLight(), 0.0);
      lathe(b, G, [[-0.06, 0.0165], [0.09, 0.018], [0.09, 0.0]], M.tape(), 0.0);
      // nails driven through the barrel
      for (let i = 0; i < 7; i++) {
        const x = 0.45 + i * 0.035, a = i * 2.1;
        const dir = V(0, Math.cos(a), Math.sin(a));
        const p0 = V(x, 0, 0).add(dir.clone().multiplyScalar(0.02)).applyMatrix4(G), p1 = V(x, 0, 0).add(dir.clone().multiplyScalar(0.06)).applyMatrix4(G);
        b.seg(p0, p1, 0.0025, 0.0018, M.steel(), { occ: false, sides: 6, capA: false });
      }
      return 0.72;
    }
    case 'machete': {
      box(b, G, -0.08, 0.015, 0.03, -0.014, 0.016, M.poly(), 0.01);             // grip
      for (const x of [-0.05, -0.015]) tube(b, G, x, x + 0.004, 0.017, 0.017, 0.001, M.brass(), 0, 10); // rivets ring
      slab(b, G, [[0.015, -0.016], [0.35, -0.03], [0.47, -0.034], [0.505, -0.02], [0.49, 0.008], [0.4, 0.02], [0.015, 0.017]], 0.004, 0, M.bladeDirty(), 0.002);
      slab(b, G, [[0.03, 0.01], [0.38, 0.014], [0.39, 0.019], [0.03, 0.016]], 0.0046, 0, M.blued(), 0.001);
      return 0.5;
    }
  }
  return 0.2;
}
