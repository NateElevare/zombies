// Offline only: bake the existing character rigs into directional 2D sprites.
import * as THREE from 'three';
import { Builder, buildBody, frameM, type Pose } from '../chars3d/web/rig';
import { PLAYER_LOOK, torsoFrame, legsPose } from '../chars3d/web/player';
import { zombieLook, zombieFrame } from '../chars3d/web/zombies';
import { buildWeapon } from '../chars3d/web/weapons';

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
renderer.setSize(96, 128); renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
const sky = new THREE.HemisphereLight(0xc8d6df, 0x54412d, 1.8); sky.position.set(0, 0, 10); scene.add(sky);
const sun = new THREE.DirectionalLight(0xffe6be, 3); sun.position.set(-4, -5, 9); scene.add(sun);
const fill = new THREE.DirectionalLight(0x9bb7cb, 0.7); fill.position.set(3, 3, 4); scene.add(fill);
const output = document.createElement('canvas'); output.width = 96; output.height = 128;
const ctx = output.getContext('2d')!;
type Job = { actor: 'survivor' | 'zombie'; tilt: number; direction: number; pose: string; i: number };
function render(job: Job) {
  const b = new Builder();
  if (job.actor === 'survivor') {
    const anim = job.pose === 'shoot' ? 'handgun_shoot' : job.pose === 'reload' ? 'handgun_reload' : job.pose === 'melee' ? 'unarmed_punch' : 'handgun_idle';
    const tf = torsoFrame(anim, ['shoot', 'reload', 'melee'].includes(job.pose) ? job.i : 0);
    const walking = job.pose === 'walk' || job.pose === 'run';
    const legs = legsPose(walking ? job.i * (job.tilt === 45 ? 1 : 2) : 'idle');
    let pose: Pose = { ...tf.pose, hip: legs.hip, legL: legs.legL, legR: legs.legR };
    if (job.pose === 'run') { pose.chPitch = 0.24; pose.hip[2] -= 0.035; }
    if (job.pose === 'idle') { pose.chPitch = 0.06 + Math.sin(job.i * Math.PI / 2) * 0.015; pose.hdYaw = Math.sin(job.i * Math.PI / 2) * 0.025; }
    if (job.pose === 'hit') { pose.chPitch = -0.22 * (1 - job.i / 3); pose.chRoll = 0.14; }
    if (job.pose === 'death' || job.pose === 'corpse') pose = zombieFrame('walker', 1, job.pose, job.i);
    buildBody(b, { ...PLAYER_LOOK, hairColor: '#343637' }, pose);
    if (tf.gun && !['death','corpse'].includes(job.pose)) { b.tag = 'weapon'; buildWeapon(b, 'pistol', frameM(tf.gun.grip, tf.gun.yaw, tf.gun.pitch || 0, tf.gun.roll || 0)); }
  } else {
    const look = { ...zombieLook('walker', 1), skin: '#748968', top: 'tank' as const, topColor: '#ada27c', sleeve: 'none' as const };
    const pose = zombieFrame('walker', 1, job.pose === 'idle' ? 'walk' : job.pose, job.pose === 'walk' ? job.i * (job.tilt === 45 ? 1 : 2) : job.pose === 'idle' ? 0 : job.i);
    if (job.pose === 'idle') { pose.chPitch = 0.26 + Math.sin(job.i * Math.PI / 2) * 0.025; pose.hdRoll = -0.18 + Math.sin(job.i * Math.PI / 2) * 0.04; }
    buildBody(b, look, pose);
  }
  // Cheap fixed AO gives the rigs' shader its required attribute without an expensive bake per angle.
  b.group.traverse(o => { if (o instanceof THREE.Mesh) { const n = o.geometry.getAttribute('position').count; o.geometry.setAttribute('ao', new THREE.BufferAttribute(new Float32Array(n).fill(0.85), 1)); } });
  b.group.matrix.makeRotationZ(-job.direction * Math.PI / 4);
  const ppm = 48, elevation = (90 - job.tilt) * Math.PI / 180;
  const camera = new THREE.OrthographicCamera(-48 / ppm, 48 / ppm, 128 * 0.72 / ppm, -128 * 0.28 / ppm, 0.1, 40);
  camera.up.set(0, 0, 1); camera.position.set(0, -Math.cos(elevation) * 10, Math.sin(elevation) * 10); camera.lookAt(0, 0, 0);
  scene.add(b.group); renderer.render(scene, camera); scene.remove(b.group);
  ctx.clearRect(0, 0, 96, 128); ctx.drawImage(renderer.domElement, 0, 0);
  const image = ctx.getImageData(0, 0, 96, 128), data = image.data;
  // Limited palette + a one-pixel dark outline to fit the surrounding pixel assets.
  const original = new Uint8ClampedArray(data);
  for (let y = 1; y < 127; y++) for (let x = 1; x < 95; x++) {
    const p = (y * 96 + x) * 4;
    if (original[p + 3] > 127) { for (let k = 0; k < 3; k++) data[p + k] = Math.round(data[p + k] / 12) * 12; data[p + 3] = 255; }
    else if ([-1, 1, -96, 96].some(d => original[p + d * 4 + 3] > 127)) { data[p] = 25; data[p + 1] = 26; data[p + 2] = 22; data[p + 3] = 255; }
  }
  ctx.putImageData(image, 0, 0); b.dispose();
  return { url: output.toDataURL('image/png'), meta: {} };
}
(window as any).R3D = { renderMany: (jobs: Job[]) => jobs.map(render), glInfo: () => 'Angle Lab orthographic sprite baker' };
