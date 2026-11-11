// art/characters3d/index.ts — CHARACTERS generator (3D): pre-rendered Three.js characters.
// Player (legs, torso poses, per-pose armor/backpack overlays, weapons) and zombies (5 types, all variants and
// animations) are modeled and animated procedurally in art/chars3d/web/*, rendered offline in headless
// Edge/Chrome (art/chars3d/driver.ts), trimmed and packed into the same atlases/frame names the 2D generator
// produced (characters, zombies, zombies2[...]). The 2D generator (art/characters/index.ts) stays available:
// `ART_CHARS=2d npm run art`.
import { join } from 'node:path';
import { loadImage, type Image } from '@napi-rs/canvas';
import { canvas, savePng, ART_SCALE, type ManifestFragment } from '../lib/core';
import { packTrimmed, type TFrame } from '../lib/trimpack';
import { openRenderer, type Job } from '../chars3d/driver';
import { PPM_WEAPON } from '../chars3d/web/consts';

const PREVIEW = join(process.cwd(), 'art', 'preview');
const r1 = (v: number) => Math.round(v * 10) / 10;

export const TORSO_ANIMS: Record<string, number> = {
  handgun_idle: 1, handgun_shoot: 2, handgun_reload: 6, long_idle: 1, long_shoot: 2, long_reload: 6,
  melee_idle: 1, melee_swing: 6, unarmed_idle: 1, unarmed_punch: 4, unarmed_walk: 8,
};
const GEAR = { head: ['cap', 'bike_helmet', 'riot_helmet', 'military_helmet'], body: ['hoodie', 'leather_jacket', 'police_vest', 'military_vest'], back: ['small', 'hiking', 'military'] };
/** inventory item id -> backpack model */
const PACK_ITEMS: Record<string, string> = { small: 'small_backpack', hiking: 'hiking_backpack', military: 'military_backpack' };
const WEAPONS = [
  { id: 'pistol', cls: 'handgun' }, { id: 'revolver', cls: 'handgun' }, { id: 'smg', cls: 'long' }, { id: 'shotgun', cls: 'long' },
  { id: 'assault_rifle', cls: 'long' }, { id: 'hunting_rifle', cls: 'long' }, { id: 'knife', cls: 'melee' }, { id: 'bat', cls: 'melee' }, { id: 'machete', cls: 'melee' },
] as const;
export const ZTYPES: Record<string, { radius: number; variants: number; walkRate: number; frame: number; dframe: number }> = {
  walker: { radius: 15, variants: 4, walkRate: 8, frame: 224, dframe: 336 },
  runner: { radius: 13, variants: 3, walkRate: 13, frame: 224, dframe: 336 },
  brute: { radius: 24, variants: 2, walkRate: 7, frame: 288, dframe: 400 },
  crawler: { radius: 13, variants: 2, walkRate: 8, frame: 256, dframe: 304 },
  bloater: { radius: 20, variants: 2, walkRate: 7, frame: 288, dframe: 400 },
};
const ZANIMS: [string, number][] = [['walk', 8], ['attack', 6], ['hit', 2], ['death', 8], ['corpse', 1]];
const PFRAME = 224;

interface Named extends Job { name: string }

async function renderAll(jobs: Named[]) {
  const workers = Math.max(1, Math.min(6, +(process.env.ART3D_WORKERS || 3)));
  const out = new Array<{ png: Buffer; meta: any }>(jobs.length);
  let next = 0, done = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const R = await openRenderer();
    if (w === 0) console.log('  3d renderer:', R.glInfo, `x${workers}`);
    try {
      while (next < jobs.length) {
        const start = next; next = Math.min(jobs.length, next + 8);
        const res = await R.render(jobs.slice(start, next));
        res.forEach((r, k) => { out[start + k] = r; });
        done += res.length;
        if (done % 80 < 8) process.stdout.write(`  ${done}/${jobs.length} frames (${((Date.now() - t0) / 1000).toFixed(0)}s)\r`);
      }
    } finally { await R.close(); }
  }));
  console.log(`  rendered ${jobs.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return out;
}

export default async function (): Promise<ManifestFragment> {
  const jobs: Named[] = [];
  // ---------------- player
  for (let i = 0; i < 8; i++) jobs.push({ name: `player_legs_walk_${i}`, kind: 'legs', w: 184, h: 184, anim: 'walk', i });
  jobs.push({ name: 'player_legs_idle_0', kind: 'legs', w: 184, h: 184, anim: 'idle', i: 0 });
  const torsoNames: string[] = [];
  for (const [a, n] of Object.entries(TORSO_ANIMS)) for (let i = 0; i < n; i++) {
    jobs.push({ name: `player_torso_${a}_${i}`, kind: 'torso', w: PFRAME, h: PFRAME, anim: a, i });
    torsoNames.push(`${a}_${i}`);
  }
  const overlay = (slot: string, id: string) => slot === 'head' ? `armor_head_${id}` : slot === 'body' ? `armor_body_${id}` : `backpack_${PACK_ITEMS[id]}`;
  for (const [slot, ids] of Object.entries(GEAR)) for (const id of ids) for (const t of torsoNames) {
    const [, a, i] = t.match(/^(.*)_(\d+)$/)!;
    jobs.push({ name: `${overlay(slot, id)}@${t}`, kind: 'gear', w: PFRAME, h: PFRAME, slot, id, anim: a, i: +i });
  }
  // weapons: frame sized to the model (ortho at hand height)
  const WDIM: Record<string, [number, number, number]> = { pistol: [0.05, 0.155, 0.03], revolver: [0.05, 0.215, 0.035], smg: [0.22, 0.33, 0.045], shotgun: [0.355, 0.64, 0.04], assault_rifle: [0.3, 0.6, 0.05], hunting_rifle: [0.375, 0.74, 0.08], knife: [0.08, 0.2, 0.03], bat: [0.08, 0.72, 0.065], machete: [0.085, 0.505, 0.045] };
  const PPM_W = PPM_WEAPON;
  for (const W of WEAPONS) {
    const [b, f, hw] = WDIM[W.id];
    jobs.push({ name: `weapon_${W.id}`, kind: 'weapon', w: Math.ceil((b + f) * PPM_W + 16), h: Math.ceil(hw * 2 * PPM_W + 16), id: W.id });
  }
  // ---------------- zombies
  for (const [type, T] of Object.entries(ZTYPES)) for (let v = 0; v < T.variants; v++) {
    for (const [a, n] of [...ZANIMS, ...(type === 'bloater' ? [['pulse', 4] as [string, number]] : [])]) for (let i = 0; i < n; i++) {
      const big = a === 'death' || a === 'corpse';
      jobs.push({ name: `zombie_${type}_${v}_${a}_${i}`, kind: 'zombie', w: big ? T.dframe : T.frame, h: big ? T.dframe : T.frame, type, v, anim: a, i });
    }
  }
  const res = await renderAll(jobs);
  const img = new Map<string, Image>(), meta = new Map<string, any>();
  for (let k = 0; k < jobs.length; k++) { img.set(jobs[k].name, await loadImage(res[k].png)); meta.set(jobs[k].name, res[k].meta); }
  const toCanvas = (name: string) => { const im = img.get(name)!; const { c, g } = canvas(im.width, im.height); g.drawImage(im, 0, 0); return c; };

  // ---------------- manifest data
  const anims: ManifestFragment['anims'] = [];
  const sprites: Record<string, any> = {};
  const chars: TFrame[] = [];
  const handsPerFrame: Record<string, any> = {};
  for (const j of jobs) if (j.kind === 'legs' || j.kind === 'torso' || j.kind === 'gear' || j.kind === 'weapon') chars.push({ name: j.name, canvas: toCanvas(j.name) });
  // base overlay names (the idle pose of each class) so code that looks up `armor_body_<id>` etc. keeps working
  for (const [slot, ids] of Object.entries(GEAR)) for (const id of ids) {
    const base = overlay(slot, id);
    chars.push({ name: base, canvas: toCanvas(`${base}@unarmed_idle_0`) });
    if (slot === 'back') chars.push({ name: `backpack_${id}`, canvas: toCanvas(`${base}@unarmed_idle_0`) });
    sprites[base] = { atlas: 'characters', origin: [0.5, 0.5], perPose: true };
  }
  const seq = (pre: string, n: number) => Array.from({ length: n }, (_, i) => `${pre}_${i}`);
  anims.push({ key: 'player_legs_walk', atlas: 'characters', frames: seq('player_legs_walk', 8), frameRate: 10, repeat: -1 });
  anims.push({ key: 'player_legs_idle', atlas: 'characters', frames: ['player_legs_idle_0'], frameRate: 1, repeat: 0 });
  const RATES: Record<string, [number, number]> = { idle: [1, 0], shoot: [20, 0], reload: [8, 0], swing: [18, 0], punch: [14, 0], walk: [10, -1] };
  for (const [a, n] of Object.entries(TORSO_ANIMS)) {
    anims.push({ key: `player_torso_${a}`, atlas: 'characters', frames: seq(`player_torso_${a}`, n), frameRate: RATES[a.split('_')[1]][0], repeat: RATES[a.split('_')[1]][1] });
    sprites[`player_torso_${a}`] = { atlas: 'characters', origin: [0.5, 0.5] };
  }
  sprites.player_legs_walk = sprites.player_legs_idle = { atlas: 'characters', origin: [0.5, 0.5] };
  // hands: grip point (world px from the player center, facing +x) and the 2D weapon angle per torso frame
  const W2 = (v: number) => r1(v / ART_SCALE);
  for (const t of torsoNames) {
    const m = meta.get(`player_torso_${t}`);
    const grip = m.grip || m.handR;
    handsPerFrame[`player_torso_${t}`] = { hand: [W2(grip[0]), W2(grip[1])], offHand: [W2(m.handL[0]), W2(m.handL[1])], weaponAngle: Math.round(-(m.yaw || 0) * 1000) / 1000, torsoYaw: 0 };
  }
  const weaponInfo: Record<string, any> = {};
  for (const W of WEAPONS) {
    const m = meta.get(`weapon_${W.id}`), j = jobs.find((q) => q.name === `weapon_${W.id}`)!;
    const idle = handsPerFrame[`player_torso_${W.cls}_idle_0`];
    const tipWorld = (m.tip * m.ppm) / ART_SCALE;
    const muzzle = [r1(idle.hand[0] + tipWorld), idle.hand[1]];
    const len = r1((WDIM[W.id][0] + WDIM[W.id][1]) * m.ppm / ART_SCALE);
    sprites[`weapon_${W.id}`] = { atlas: 'characters', origin: [Math.round((m.gripPx[0] / j.w) * 1000) / 1000, Math.round((m.gripPx[1] / j.h) * 1000) / 1000], grip: idle.hand, muzzle, angle: idle.weaponAngle, length: len };
    weaponInfo[W.id] = { pose: W.cls, grip: idle.hand, muzzle, idleAngle: idle.weaponAngle, lengthWorld: len };
  }
  // zombies: small types in `zombies`, big in `zombies2` (pages spill to zombies_2.. if needed)
  const zs: TFrame[] = [], zb: TFrame[] = [];
  for (const [type, T] of Object.entries(ZTYPES)) {
    const big = type === 'brute' || type === 'bloater';
    for (let v = 0; v < T.variants; v++) {
      for (const [a, n] of [...ZANIMS, ...(type === 'bloater' ? [['pulse', 4] as [string, number]] : [])]) {
        const names = seq(`zombie_${type}_${v}_${a}`, n);
        for (const nm of names) (big ? zb : zs).push({ name: nm, canvas: toCanvas(nm) });
        const rate: Record<string, [number, number]> = { walk: [T.walkRate, -1], attack: [12, 0], hit: [14, 0], death: [12, 0], corpse: [1, 0], pulse: [6, -1] };
        anims.push({ key: `zombie_${type}_${v}_${a}`, atlas: big ? 'zombies2' : 'zombies', frames: names, frameRate: rate[a][0], repeat: rate[a][1] });
        sprites[`zombie_${type}_${v}_${a}`] = { atlas: big ? 'zombies2' : 'zombies', origin: [0.5, 0.5] };
      }
    }
  }
  const pages = [...packTrimmed('characters', chars), ...packTrimmed('zombies', zs), ...packTrimmed('zombies2', zb)];
  // fix anim atlas names if anything spilled to a second page
  const where = new Map<string, string>();
  for (const p of pages) { const js = JSON.parse((await import('node:fs')).readFileSync(join(process.cwd(), 'public', 'assets', p.name + '.json'), 'utf8')); for (const f of Object.keys(js.frames)) where.set(f, p.name); }
  for (const a of anims!) a.atlas = where.get(a.frames[0]) || a.atlas;
  for (const [k, s] of Object.entries(sprites)) { const f = where.get(k) || where.get(k + '_0'); if (f) s.atlas = f; }

  await previews(img, meta, jobs);
  const characterInfo = {
    artScale: ART_SCALE, displayScale: 1 / ART_SCALE, renderer: '3d',
    note: 'Pre-rendered 3D (art/chars3d). Frames are TRIMMED atlas frames (Phaser restores the full source box, so origin 0.5 = body center). Facing +x. Display at (1/ART_SCALE) * (entityRadius / designRadius).',
    player: {
      frame: PFRAME, designRadius: 14,
      layerOrder: ['player_legs_*', 'weapon_<id>', 'player_torso_*', 'armor_body_<id>@<pose>_<i>', 'backpack_<id>@<pose>_<i>', 'armor_head_<id>@<pose>_<i>'],
      legs: { walk: 8, idle: 1, note: 'rotate legs to movement direction, torso to aim' },
      torsoPoses: TORSO_ANIMS,
      unarmedWalk: 'player_torso_unarmed_walk_<i> is synced to player_legs_walk_<i> (arms counter-swing the legs)',
      poseForWeaponClass: { handgun: 'handgun', smg: 'long', shotgun: 'long', rifle: 'long', melee: 'melee', unarmed: 'unarmed' },
      handsPerFrame,
      handsNote: 'hand = weapon grip (world px from the player center, facing +x); weapon_<id> is drawn with its origin at `hand`, rotated by weaponAngle. Overlays are rendered per torso frame (<overlay>@<pose>_<i>), so torsoYaw is 0.',
      weapons: weaponInfo,
      overlaysPerPose: true,
    },
    zombies: Object.fromEntries(Object.entries(ZTYPES).map(([t, T]) => [t, {
      atlas: t === 'brute' || t === 'bloater' ? 'zombies2' : 'zombies', frame: T.frame, deathFrame: T.dframe, designRadius: T.radius, variants: T.variants,
      anims: { walk: 8, attack: 6, hit: 2, death: 8, corpse: 1, ...(t === 'bloater' ? { pulse: 4 } : {}) }, walkFrameRate: T.walkRate,
    }])),
    zombieNaming: 'frame zombie_<type>_<v>_<anim>_<i>; anim key zombie_<type>_<v>_<anim>',
  };
  for (const p of pages) console.log(`  atlas ${p.name}: ${p.w}x${p.h}, ${p.count} frames, ${(p.bytes / 1024).toFixed(0)} KB`);
  return { atlases: pages.map((p) => p.name), sprites, anims, characterInfo };
}

/** contact sheets under art/preview/3d_*.png */
async function previews(img: Map<string, Image>, _meta: Map<string, any>, jobs: Named[]) {
  const sheet = (file: string, names: string[], cols: number, k = 1, bg = '#3a3c3e') => {
    const ims = names.map((n) => img.get(n)!).filter(Boolean);
    const cw = Math.max(...ims.map((i) => i.width)) * k, ch = Math.max(...ims.map((i) => i.height)) * k;
    const rows = Math.ceil(ims.length / cols);
    const { c, g } = canvas(cols * cw, rows * ch);
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    ims.forEach((im, i) => g.drawImage(im, (i % cols) * cw + (cw - im.width * k) / 2, Math.floor(i / cols) * ch + (ch - im.height * k) / 2, im.width * k, im.height * k));
    savePng(join(PREVIEW, file), c);
  };
  sheet('3d_player_torso.png', jobs.filter((j) => j.kind === 'torso').map((j) => j.name), 10);
  sheet('3d_player_legs.png', jobs.filter((j) => j.kind === 'legs').map((j) => j.name), 9);
  sheet('3d_weapons.png', jobs.filter((j) => j.kind === 'weapon').map((j) => j.name), 3);
  sheet('3d_gear.png', jobs.filter((j) => j.kind === 'gear' && /@(long_idle_0|melee_swing_3|unarmed_walk_2)$/.test(j.name)).map((j) => j.name), 9);
  for (const t of Object.keys(ZTYPES)) sheet(`3d_zombies_${t}.png`, jobs.filter((j) => j.kind === 'zombie' && j.type === t).map((j) => j.name), 9, 0.75);
  // walk strips at the in-game display scale (0.5)
  for (const t of Object.keys(ZTYPES)) sheet(`3d_walkstrip_${t}.png`, jobs.filter((j) => j.kind === 'zombie' && j.type === t && j.anim === 'walk').map((j) => j.name), 8, 0.5);
}
