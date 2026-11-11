// art/chars3d/web/materials.ts — procedural PBR materials for the offline character renderer (runs in the browser).
// MeshStandardMaterial patched with: object-space procedural albedo/bump patterns (denim twill, leather creases,
// knit ribs, plaid, skin mottling, brushed metal, wood grain), blood/grime/torn-cloth masks, analytic sphere
// ambient occlusion from the character's own body parts, a height falloff (lower parts darker, as seen from
// above) and a soft rim term. Everything is deterministic: noise is a hash of position + per-material seed.
import * as THREE from 'three';

export const PAT = { plain: 0, denim: 1, leather: 2, knit: 3, skin: 4, plaid: 5, metal: 6, wood: 7, cloth: 8, rubber: 9, pool: 10, hair: 11, stripes: 12, flesh: 13, canvas: 14 } as const;
export type PatName = keyof typeof PAT;

export interface MatSpec {
  color: string; color2?: string; pat?: PatName; rough?: number; metal?: number;
  /** detail noise frequency (per meter) and bump strength */
  scale?: number; bump?: number;
  /** 0..1 masks (zombies): blood splatter, grime, torn holes showing `tearColor` (skin) */
  blood?: number; grime?: number; tear?: number; tearColor?: string;
  emissive?: string; emissiveI?: number; seed?: number; rim?: number;
  /** extra albedo variation amplitude */
  vary?: number;
  transparent?: boolean;
}



const GLSL_COMMON = /* glsl */ `
uniform vec3 uColor2; uniform float uSeed; uniform float uScale; uniform float uBump; uniform float uBlood; uniform float uGrime;
uniform float uTear; uniform vec3 uTearColor; uniform float uRim; uniform float uVary;
uniform int uPat;
varying vec3 vLocal; varying vec3 vWPos; varying float vAO;
float h31(vec3 p) { p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s / 0.875; }
float ridge(vec3 p) { return 1.0 - abs(fbm(p) * 2.0 - 1.0); }
`;

const PATTERN = /* glsl */ `
  vec3 P = vLocal * min(uScale, 14.0) + vec3(uSeed * 7.31, uSeed * 3.17, uSeed * 5.53);
  float n1 = fbm(P * 0.5);
  float bumpH = 0.0; float roughAdj = 0.0; float metalAdj = 0.0;
  vec3 base = diffuseColor.rgb;
  base *= 1.0 + (n1 - 0.5) * uVary;
if (uPat == 1) {
  // denim: diagonal twill + washed fading
  float tw = 0.0;
  float wash = fbm(P * 0.6);
  base = mix(base, uColor2, smoothstep(0.45, 0.85, wash) * 0.55);
  float fd = fbm(vec3(P.x * 0.4, P.y * 0.4, P.z * 0.9));
  float wr2 = sin(vLocal.y * 50.0 + fd * 7.0);
  base *= 0.96 + 0.12 * (fd - 0.5) + 0.04 * wr2;
  bumpH = fd * 2.0 + wr2 * 0.8;
} else if (uPat == 2) {
  // leather: creases + scuffs, low roughness on the raised parts
  float cr = ridge(P * 0.8);
  float sc = fbm(P * 1.2);
  bumpH = -pow(cr, 6.0) * 2.5 + sc * 1.0;
  base *= 0.8 + 0.35 * sc;
  base = mix(base, uColor2, smoothstep(0.62, 0.82, fbm(P * 0.5)) * 0.5);
  roughAdj = -0.2 * (1.0 - pow(cr, 6.0));
} else if (uPat == 3) {
  // knit: vertical ribs around the axis
  float ang = atan(vLocal.y, vLocal.x);
  float rib = sin(ang * 26.0);
  float st = 0.0;
  float side = 1.0 - smoothstep(-0.03, 0.05, vLocal.z);
  bumpH = rib * 0.5 * side + n1 * 1.4;
  base *= 0.96 + 0.06 * rib * side;
} else if (uPat == 4) {
  // skin: mottling, veins tint toward color2
  float m = fbm(P * 1.5);
  float zk = step(0.001, uBlood);                       // zombie skin: bruising, veins, lividity
  base = mix(base, uColor2, smoothstep(0.45, 0.8, m) * (0.35 + 0.4 * zk));
  float vein = pow(ridge(P * 1.6 + vec3(3.1)), 10.0) * zk;
  base = mix(base, uColor2 * 0.55, vein * 0.6);
  base *= 1.0 - zk * 0.25 * smoothstep(0.55, 0.85, fbm(P * 0.6 + vec3(7.0)));
  bumpH = fbm(P * 2.0) * 0.8 + vein * 0.6;
} else if (uPat == 5) {
  // plaid: two crossing band sets (color2 dark bands) in the part's local frame
  float bx = smoothstep(0.35, 0.45, abs(fract(vLocal.z * 9.0) - 0.5));
  float by = smoothstep(0.35, 0.45, abs(fract((vLocal.x + vLocal.y) * 9.0) - 0.5));
  float thin = step(0.47, abs(fract(vLocal.z * 18.0 + 0.25) - 0.5));
  base = mix(base, uColor2, (bx + by) * 0.35 + bx * by * 0.3);
  base = mix(base, vec3(0.75, 0.72, 0.6), thin * 0.25);
  bumpH = n1 * 0.6;
} else if (uPat == 6) {
  // brushed metal
  float br = vnoise(vec3(vLocal.x * 60.0, vLocal.y * 8.0, vLocal.z * 8.0));
  base *= 0.85 + 0.3 * br;
  roughAdj = (br - 0.5) * 0.2; bumpH = br * 0.15;
} else if (uPat == 7) {
  // wood grain along x
  float g = sin((vLocal.x * 30.0 + fbm(P * 0.7) * 6.0) * 6.2831);
  base *= 0.82 + 0.18 * g;
  base = mix(base, uColor2, smoothstep(0.55, 0.9, fbm(P * 0.4)) * 0.4);
  bumpH = g * 0.2;
} else if (uPat == 8) {
  // cloth: fine weave + folds
  float wv = 0.0;
  float fold = fbm(vec3(P.x * 0.35, P.y * 0.35, P.z * 0.8));
  float wr1 = sin(vLocal.y * 55.0 + fold * 8.0 + vLocal.z * 15.0);
  base *= 0.97 + 0.14 * (fold - 0.5) + 0.04 * wr1;
  bumpH = fold * 2.2 + wr1 * 0.8;
} else if (uPat == 9) {
  float rb = fbm(P * 2.0); base *= 0.85 + 0.3 * rb; bumpH = rb * 0.4;
} else if (uPat == 10) {
  // blood pool: irregular wet shape (discarded outside), glossy, darker in the middle
  float r = length(vLocal.xy);
  float shape = fbm(vec3(vLocal.xy * 3.2, uSeed)) * 0.55 + 0.7 - r / max(uScale, 0.01);
  float sat = fbm(vec3(vLocal.xy * 9.0, uSeed + 3.0));
  if (shape < 0.25) discard;
  base = mix(uColor2, base, smoothstep(0.25, 0.6, shape)) * (0.85 + 0.3 * sat);
  roughAdj = -0.45; bumpH = smoothstep(0.25, 0.32, shape) * 2.0;
} else if (uPat == 11) {
  // hair: strands along the local z/x direction
  float s1 = vnoise(vec3(vLocal.y * 90.0, vLocal.x * 20.0, vLocal.z * 20.0 + uSeed));
  base *= 0.75 + 0.5 * s1; bumpH = s1 * 0.6;
} else if (uPat == 12) {
  // horizontal stripes
  float sp = step(0.5, fract(vLocal.z * 14.0));
  base = mix(base, uColor2, sp); bumpH = n1 * 0.5;
} else if (uPat == 13) {
  // raw flesh/gore: wet, lumpy, dark crevices
  float lump = fbm(P * 2.5);
  base = mix(uColor2, base, smoothstep(0.3, 0.7, lump));
  bumpH = lump * 1.6; roughAdj = -0.35;
} else if (uPat == 14) {
  // canvas (tactical jacket): coarse weave + panel folds
  float wv2 = 0.0;
  float fold2 = fbm(vec3(P.x * 0.35, P.y * 0.35, P.z * 0.8));
  float wr = sin(vLocal.y * 62.0 + fold2 * 7.0 + vLocal.x * 20.0);
  float seam = 1.0 - smoothstep(0.003, 0.009, abs(vLocal.y));
  base *= 0.97 + 0.14 * (fold2 - 0.5) + 0.05 * wr;
  base *= 1.0 - seam * 0.25;
  bumpH = fold2 * 2.2 + wr * 0.9 - seam * 1.2;
} else {
  bumpH = n1 * 0.5;
  }
  // torn cloth: holes showing skin, dark frayed rim
  if (uTear > 0.0) {
    float t = fbm(vLocal * 13.0 + vec3(uSeed * 1.3 + 11.0));
    float hole = smoothstep(1.0 - uTear * 0.42, 1.0 - uTear * 0.42 + 0.03, t);
    float rimT = smoothstep(1.0 - uTear * 0.42 - 0.05, 1.0 - uTear * 0.42, t) - hole;
    base = mix(base, uTearColor * (0.8 + 0.3 * fbm(vLocal * 30.0)), hole);
    base *= 1.0 - rimT * 0.55;
    bumpH -= hole * 1.2;
  }
  // grime: dirt build-up in a broad pattern
  if (uGrime > 0.0) { float gm = fbm(vLocal * 9.0 + vec3(uSeed * 2.1)); base *= 1.0 - uGrime * smoothstep(0.4, 0.8, gm) * 0.55; }
  // blood: fresh (wet, red) inside, dried (brown) at the rim; speckles
  if (uBlood > 0.0) {
    float b = fbm(vLocal * 9.0 + vec3(uSeed * 4.7 + 3.0));
    float sp2 = vnoise(vLocal * 70.0 + vec3(uSeed));
    float th = 1.0 - uBlood * 0.5;
    float wet = smoothstep(th, th + 0.04, b);
    float dry = smoothstep(th - 0.08, th, b) - wet;
    float spk = step(0.93 - uBlood * 0.08, sp2) * (1.0 - wet);
    base = mix(base, vec3(0.20, 0.018, 0.012), wet * 0.95);
    base = mix(base, vec3(0.16, 0.05, 0.03), dry * 0.55 + spk * 0.8);
    roughAdj -= wet * 0.45; bumpH += wet * 0.4;
  }
  diffuseColor.rgb = base;
`;

const BUMP = /* glsl */ `
  {
    vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
    float hx = dFdx(bumpH), hy = dFdy(bumpH);
    vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (hx * r1 + hy * r2) * uBump * 0.006;
    normal = normalize(abs(det) * normal - grad);
  }
`;

const AO = /* glsl */ `
  {
    // vAO: analytic sphere occlusion from the body's own parts + height falloff, computed per vertex (rig.ts)
    float ao = clamp(vAO, 0.0, 1.0);
    reflectedLight.indirectDiffuse *= ao;
    reflectedLight.indirectSpecular *= ao;
    reflectedLight.directDiffuse *= mix(1.0, ao, 0.65);
    reflectedLight.directSpecular *= mix(1.0, ao, 0.65);
  }
`;

const RIM = /* glsl */ `
  {
    float fr = pow(1.0 - clamp(normal.z, 0.0, 1.0), 2.6);
    totalEmissiveRadiance += vec3(0.62, 0.68, 0.78) * fr * uRim * diffuseColor.rgb * 2.2 + vec3(0.06, 0.065, 0.075) * fr * uRim;
  }
`;

const cache = new Map<string, THREE.MeshStandardMaterial>();
const col = (h: string) => new THREE.Color(h);

export function mat(s: MatSpec): THREE.MeshStandardMaterial {
  const key = JSON.stringify(s);
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({
    color: col(s.color), roughness: s.rough ?? 0.8, metalness: s.metal ?? 0,
    emissive: s.emissive ? col(s.emissive) : new THREE.Color(0), emissiveIntensity: s.emissiveI ?? 1,
    transparent: !!s.transparent,
  });
  const pat = PAT[s.pat || 'plain'];
  const uni = {
    uColor2: { value: col(s.color2 || s.color) }, uSeed: { value: s.seed ?? 0 }, uScale: { value: s.scale ?? 20 }, uBump: { value: s.bump ?? 0.6 },
    uBlood: { value: s.blood ?? 0 }, uGrime: { value: s.grime ?? 0 }, uTear: { value: s.tear ?? 0 }, uTearColor: { value: col(s.tearColor || '#8a9a7c') },
    uRim: { value: s.rim ?? 0.35 }, uVary: { value: s.vary ?? 0.12 }, uPat: { value: pat },
  };
  const dbg = (globalThis as any).__dbg || '';
  m.onBeforeCompile = (sh) => {
    if (dbg.includes('plain')) return;
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float ao; varying vec3 vLocal; varying vec3 vWPos; varying float vAO;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position; vWPos = (modelMatrix * vec4(position, 1.0)).xyz; vAO = ao;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + PATTERN)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + roughAdj, 0.05, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + BUMP)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + RIM)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + AO);
  };
  m.customProgramCacheKey = () => 'dz3d';
  cache.set(key, m);
  return m;
}
