// art/chars3d/web/main.ts — browser entry of the offline character renderer (bundled by esbuild and injected
// into headless Edge by art/chars3d/driver.ts). Exposes window.R3D.render(job) -> PNG data URL + metadata.
//
// Camera: straight down from CAM_H meters with a narrow FOV, so there is only a slight perspective (heads and
// shoulders ~14% larger than feet): limbs away from the center show a bit of their sides and read as volumes.
// Lighting: overhead-dominant (hemisphere sky + a near-vertical key light from the top-left that casts soft
// self-shadows), analytic sphere AO and a soft rim term in the materials. Because the key is almost vertical,
// rotating the sprite in-engine never shows obviously wrong lighting.
import * as THREE from 'three';
import { mat } from './materials';
import { Builder, buildBody, type Look, type Pose, type Joints, V } from './rig';
import { PLAYER_LOOK, torsoFrame, legsPose, type Gun } from './player';
import { buildWeapon, WEAPON_DEFS } from './weapons';
import { buildGear, GEAR } from './gear';
import { zombieLook, zombieFrame } from './zombies';

import { CAM_H, PPM0, WEAPON_Z } from './consts';
const SS = 2;              // supersampling

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const hemi = new THREE.HemisphereLight(0xc4ccd8, 0x3a3028, 0.6);
hemi.position.set(0, 0, 1);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff0dc, 4.2);
key.position.set(-2.6, 2.0, 5); // top-left (sprite space), mostly overhead
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -1.6; key.shadow.camera.right = 1.6; key.shadow.camera.top = 1.6; key.shadow.camera.bottom = -1.6;
key.shadow.camera.near = 1; key.shadow.camera.far = 12;
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.012; key.shadow.radius = 4;
scene.add(key); scene.add(key.target);
const fill = new THREE.DirectionalLight(0x9fb0c8, 0.55);
fill.position.set(2, -1.5, 3);
scene.add(fill);

export interface Job {
  kind: 'legs' | 'torso' | 'gear' | 'weapon' | 'zombie' | 'preview';
  w: number; h: number;
  anim?: string; i?: number; id?: string; slot?: string; type?: string; v?: number;
  /** preview: composite full player (legs+torso+weapon+gear) */
  weapon?: string; gear?: string[];
  shadow?: number; outline?: number; dx?: number; dy?: number;
  /** override camera center (body space meters) for big frames */
  cx?: number; cy?: number;
}
export interface Result { url: string; meta: any }

function setCamera(w: number, h: number, ortho: number | null, cx = 0, cy = 0): THREE.Camera {
  renderer.setSize(w * SS, h * SS, false);
  if (ortho !== null) {
    const ppm = PPM0 * CAM_H / (CAM_H - ortho);
    const cam = new THREE.OrthographicCamera(-w / 2 / ppm, w / 2 / ppm, h / 2 / ppm, -h / 2 / ppm, 0.1, 50);
    cam.position.set(cx, cy, CAM_H); cam.up.set(0, 1, 0); cam.lookAt(cx, cy, 0); cam.updateMatrixWorld();
    return cam;
  }
  const fov = (2 * Math.atan(h / 2 / PPM0 / CAM_H) * 180) / Math.PI;
  const cam = new THREE.PerspectiveCamera(fov, w / h, 0.5, 50);
  cam.position.set(cx, cy, CAM_H); cam.up.set(0, 1, 0); cam.lookAt(cx, cy, 0); cam.updateMatrixWorld();
  return cam;
}
/** body-space point -> sprite px offset from the frame center (y down) */
function proj(p: THREE.Vector3, ortho: number | null) {
  const k = ortho !== null ? PPM0 * CAM_H / (CAM_H - ortho) : PPM0 * CAM_H / (CAM_H - p.z);
  return [p.x * k, -p.y * k];
}

function setOcc(b: Builder, height: number) { b.computeAO(height); }

const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });

/** draw: render the builder's group; tags not in `show` are hidden, tags in `occluders` render depth-only */
function draw(b: Builder, cam: THREE.Camera, show: Set<string>, occluders: Set<string> = new Set()) {
  for (const o of b.group.children) {
    const m = o as THREE.Mesh, tag = m.userData.tag as string;
    if (show.has(tag)) { m.visible = true; m.renderOrder = 0; }
    else if (occluders.has(tag)) { m.visible = true; m.material = depthOnly; m.renderOrder = -1; m.castShadow = false; }
    else m.visible = false;
  }
  scene.add(b.group);
  b.group.updateMatrixWorld(true);
  renderer.render(scene, cam);
  scene.remove(b.group);
}

/** downsample + bake a soft contact shadow and a thin dark outline */
function post(w: number, h: number, o: { shadow?: number; outline?: number; dx?: number; dy?: number }) {
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  const g = src.getContext('2d')!;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(canvas, 0, 0, w * SS, h * SS, 0, 0, w, h);
  const sil = document.createElement('canvas'); sil.width = w; sil.height = h;
  const s = sil.getContext('2d')!;
  s.drawImage(src, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = '#0e0b08'; s.fillRect(0, 0, w, h);
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const q = out.getContext('2d')!;
  const sh = o.shadow ?? 0.34;
  if (sh > 0) { q.filter = 'blur(3px)'; q.globalAlpha = sh; q.drawImage(sil, o.dx ?? 1.5, o.dy ?? 2); q.filter = 'blur(1.2px)'; q.globalAlpha = sh * 0.6; q.drawImage(sil, 0.5, 0.8); q.filter = 'none'; }
  const ol = o.outline ?? 0.5;
  if (ol > 0) { q.globalAlpha = ol; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) q.drawImage(sil, dx, dy); q.globalAlpha = ol * 0.5; for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) q.drawImage(sil, dx * 0.8, dy * 0.8); }
  q.globalAlpha = 1; q.drawImage(src, 0, 0);
  return out.toDataURL('image/png');
}

const ALL = new Set(['legs', 'torso', 'arms', 'head', 'gear', 'weapon']);
const TORSO = new Set(['torso', 'arms', 'head']);

function playerTorso(anim: string, i: number) {
  const tf = torsoFrame(anim, i);
  const b = new Builder();
  const J = buildBody(b, PLAYER_LOOK, tf.pose);
  return { b, J, tf };
}

function gripMeta(J: Joints, gun: Gun | null) {
  const m: any = {
    handR: proj(V(0.045, 0, 0).applyMatrix4(J.handR), null),
    handL: proj(V(0.045, 0, 0).applyMatrix4(J.handL), null),
    head: proj(V().applyMatrix4(J.head), null),
  };
  if (gun) { m.grip = proj(V(...gun.grip), null); m.yaw = gun.yaw; m.pitch = gun.pitch ?? 0; m.gripZ = gun.grip[2]; }
  return m;
}

function render(job: Job): Result {
  const { w, h } = job;
  let meta: any = {};
  switch (job.kind) {
    case 'legs': {
      const b = new Builder();
      buildBody(b, PLAYER_LOOK, legsPose(job.anim === 'idle' ? 'idle' : job.i!));
      setOcc(b, 1.75);
      draw(b, setCamera(w, h, null), new Set(['legs']));
      b.dispose();
      return { url: post(w, h, job), meta };
    }
    case 'torso': {
      const { b, J, tf } = playerTorso(job.anim!, job.i!);
      setOcc(b, 1.75);
      draw(b, setCamera(w, h, null), TORSO);
      meta = gripMeta(J, tf.gun);
      b.dispose();
      return { url: post(w, h, job), meta };
    }
    case 'gear': {
      // armor/backpack overlay fitted to a specific torso frame; the body renders depth-only so arms hide it
      const { b, J, tf } = playerTorso(job.anim!, job.i!);
      b.tag = 'gear';
      buildGear(b, job.id!, J, PLAYER_LOOK, tf.pose);
      setOcc(b, 1.75);
      draw(b, setCamera(w, h, null), new Set(['gear']), new Set(job.slot === 'head' ? [] : ['arms']));
      b.dispose();
      return { url: post(w, h, { shadow: job.shadow ?? 0.22, dx: 1, dy: 1.5, outline: job.outline ?? 0.4 }), meta };
    }
    case 'weapon': {
      const def = WEAPON_DEFS.find((d) => d.id === job.id)!;
      const Z = WEAPON_Z;
      const b = new Builder(); b.tag = 'weapon';
      // grip at x = 0 => frame center offset so the whole weapon fits; camera centered on the weapon
      const cx = (def.front - def.back) / 2;
      const tip = buildWeapon(b, job.id!, new THREE.Matrix4().makeTranslation(0, 0, Z));
      setOcc(b, 1.75);
      draw(b, setCamera(w, h, Z, cx, 0), new Set(['weapon']));
      b.dispose();
      const ppm = PPM0 * CAM_H / (CAM_H - Z);
      meta = { ppm, gripPx: [w / 2 - cx * ppm, h / 2], tip, cx };
      return { url: post(w, h, { shadow: 0.3, dx: 1.5, dy: 2, outline: 0.45 }), meta };
    }
    case 'zombie': {
      const L = zombieLook(job.type!, job.v!);
      const P = zombieFrame(job.type!, job.v!, job.anim!, job.i!);
      const b = new Builder();
      buildBody(b, L, P);
      if (P.pool) pool(b, P.pool);
      b.group.matrix.makeScale(L.scale, L.scale, L.scale);
      for (const o of b.occ) o.multiplyScalar(L.scale);
      setOcc(b, 1.75 * L.scale);
      draw(b, setCamera(w, h, null, job.cx ?? 0, job.cy ?? 0), new Set([...ALL, 'pool']));
      b.dispose();
      return { url: post(w, h, { shadow: job.anim === 'corpse' || job.anim === 'death' ? 0.2 : 0.34 }), meta };
    }
    case 'preview': {
      // full composite in 3D (sanity check for hand/weapon alignment)
      const { b, J, tf } = playerTorso(job.anim!, job.i!);
      const lb = new Builder(); buildBody(lb, PLAYER_LOOK, legsPose(job.i! % 8));
      for (const o of [...lb.group.children]) if (o.userData.tag === 'legs') b.group.add(o);
      if (tf.gun && job.weapon) { b.tag = 'weapon'; buildWeapon(b, job.weapon, new THREE.Matrix4().compose(V(...tf.gun.grip), new THREE.Quaternion().setFromEuler(new THREE.Euler(tf.gun.roll ?? 0, tf.gun.pitch ?? 0, tf.gun.yaw, 'ZYX')), V(1, 1, 1))); }
      for (const gid of job.gear || []) { b.tag = 'gear'; buildGear(b, gid, J, PLAYER_LOOK, tf.pose); }
      setOcc(b, 1.75);
      draw(b, setCamera(w, h, null), ALL);
      b.dispose(); lb.dispose();
      return { url: post(w, h, {}), meta: gripMeta(J, tf.gun) };
    }
  }
  throw new Error('bad job ' + job.kind);
}

function pool(b: Builder, p: { r: number; x: number; y: number; seed: number }) {
  b.tag = 'pool';
  const g = new THREE.CircleGeometry(p.r * 1.6, 48);
  const m = mat({ color: '#4a0806', color2: '#1e0302', pat: 'pool', rough: 0.2, scale: p.r, seed: p.seed, bump: 0.6, rim: 0.2 });
  const me = b.geo(g, new THREE.Matrix4().makeTranslation(p.x, p.y, 0.004), m);
  me.castShadow = false;
}

(window as any).R3D = {
  render, GEAR, WEAPON_DEFS, PPM0, CAM_H,
  glInfo() { const gl = renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return (e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'webgl') + (gl.isContextLost() ? ' (LOST)' : ''); },
  renderMany(jobs: Job[]) { return jobs.map((j) => render(j)); },
};
