// art/characters/index.ts — CHARACTERS generator: player (legs/torso/armor/backpacks/weapons) + zombies.
import { join } from 'node:path';
import { packAtlas, contactSheet, canvas, savePng, type ManifestFragment, type Frame } from '../lib/core';
import { scaled } from '../lib/figure';
import { ZTYPES, ANIM_FRAMES, buildZombieFrames, type ZType, type ZFrame } from './zombies';
import { PLAYER_FIG_SCALE, buildPlayerFrames, buildArmor, buildBackpacks, buildWeapons, WEAPONS, TORSO_POSES, PLAYER_RADIUS, PFRAME } from './player';
import { ART_SCALE } from '../lib/core';
import { loadPixelZombieFrames } from './pixel-zombies';
import { buildPixelPlayerFrames } from './pixel-player';

const PREVIEW = join(process.cwd(), 'art', 'preview');

/** 8 walk frames side by side at 50% (the in-game display scale) for motion checks. */
function strip(path: string, frames: Frame[], k = 0.5, bg = '#3a3c3e') {
  const sc = frames.map((f) => scaled(f.canvas, k));
  const w = sc[0].width, h = sc[0].height;
  const { c, g } = canvas(w * sc.length, h);
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  sc.forEach((s, i) => g.drawImage(s, i * w, 0));
  savePng(path, c);
}

export default async function (): Promise<ManifestFragment> {
  const pixelZombies = !process.argv.includes('--procedural-zombies');
  const anims: ManifestFragment['anims'] = [];
  const sprites: Record<string, any> = {};
  const z1: Frame[] = [], z2: Frame[] = [];
  for (const type of Object.keys(ZTYPES) as ZType[]) {
    const T = ZTYPES[type], atlas = T.frame > 128 ? 'zombies2' : 'zombies';
    const all: ZFrame[] = [];
    for (let v = 0; v < T.variants; v++) {
      const fr = pixelZombies ? await loadPixelZombieFrames(type, v) : buildZombieFrames(type, v);
      all.push(...fr);
      const by = (a: string) => fr.filter((f) => f.anim === a).map((f) => f.name);
      const add = (a: string, frameRate: number, repeat: number) => { if (by(a).length) anims.push({ key: `zombie_${type}_${v}_${a}`, atlas, frames: by(a), frameRate, repeat }); };
      add('walk', T.walkRate, -1); add('attack', 12, 0); add('hit', 14, 0); add('death', 12, 0); add('corpse', 1, 0); add('pulse', 6, -1);
      for (const a of Object.keys(ANIM_FRAMES)) sprites[`zombie_${type}_${v}_${a}`] = { atlas, origin: [0.5, 0.5] };
      strip(join(PREVIEW, `walkstrip_${type}_${v}.png`), fr.filter((f) => f.anim === 'walk'));
    }
    (atlas === 'zombies' ? z1 : z2).push(...all);
    contactSheet(join(PREVIEW, `zombies_${type}.png`), all, 8, '#3a3c3e');
  }
  // ---------------- player ----------------
  const pl = buildPlayerFrames(), armor = buildArmor(), packs = buildBackpacks(), wpn = buildWeapons();
  const playerVariants = pixelZombies ? await buildPixelPlayerFrames() : [];
  const aliases = packs.map((f) => ({ name: f.name.replace(/^backpack_(\w+)$/, 'backpack_$1_backpack'), canvas: f.canvas }));
  const chars: Frame[] = [...pl.frames, ...armor, ...packs, ...aliases, ...wpn.frames];
  const seq = (pre: string) => pl.frames.filter((f) => f.name.startsWith(pre + '_') && /_\d+$/.test(f.name) && f.name.slice(pre.length + 1).match(/^\d+$/)).map((f) => f.name);
  anims.push({ key: 'player_legs_walk', atlas: 'characters', frames: seq('player_legs_walk'), frameRate: 10, repeat: -1 });
  anims.push({ key: 'player_legs_idle', atlas: 'characters', frames: ['player_legs_idle_0'], frameRate: 1, repeat: 0 });
  const RATES: Record<string, [number, number]> = { idle: [1, 0], shoot: [20, 0], reload: [8, 0], swing: [18, 0], punch: [14, 0] };
  for (const pose of Object.keys(TORSO_POSES)) {
    const kind = pose.split('_')[1];
    anims.push({ key: `player_torso_${pose}`, atlas: 'characters', frames: seq(`player_torso_${pose}`), frameRate: RATES[kind][0], repeat: RATES[kind][1] });
  }
  for (const f of chars) {
    const m = f.name.match(/^(player_legs_\w+?|player_torso_\w+?)_\d+$/);
    const key = m ? m[1] : f.name;
    if (!f.name.startsWith('weapon_')) sprites[key] = { atlas: 'characters', origin: [0.5, 0.5] };
  }
  const variantGroups = new Map<string, string[]>();
  for (const frame of playerVariants) {
    const key = frame.name.replace(/_\d+$/, '');
    sprites[key] = { atlas: 'player_variants', origin: [0.5, 0.5] };
    const list = variantGroups.get(key) || []; list.push(frame.name); variantGroups.set(key, list);
  }
  for (const [key, frames] of variantGroups) {
    const kind = key.split('_').at(-1)!;
    const [frameRate, repeat] = kind === 'walk' ? [10, -1] : RATES[kind] || [1, 0];
    anims.push({ key, atlas: 'player_variants', frames, frameRate, repeat });
  }
  const POSE_OF: Record<string, string> = { handgun: 'handgun', smg: 'long', shotgun: 'long', rifle: 'long', melee: 'melee', unarmed: 'unarmed' };
  const weaponInfo: Record<string, any> = {};
  for (const W of WEAPONS) {
    const m = wpn.meta[W.id], idle = pl.info[`player_torso_${W.cls}_idle_0`];
    const a = idle.weaponAngle, gx = idle.hand[0], gy = idle.hand[1];
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const fl = W.front * PLAYER_FIG_SCALE, len = r1((W.back + W.front) * PLAYER_FIG_SCALE);
    const muzzle = [r1(gx + Math.cos(a) * fl), r1(gy + Math.sin(a) * fl)];
    sprites[`weapon_${W.id}`] = { atlas: 'characters', origin: [Math.round((m.ox / m.w) * 1000) / 1000, 0.5], grip: [gx, gy], muzzle, angle: a, length: len };
    weaponInfo[W.id] = { pose: W.cls, grip: [gx, gy], muzzle, idleAngle: a, lengthWorld: len };
  }
  const pages = [packAtlas('characters', chars), packAtlas('zombies', z1), packAtlas('zombies2', z2)];
  if (playerVariants.length) pages.push(packAtlas('player_variants', playerVariants));
  contactSheet(join(PREVIEW, 'player.png'), chars.filter((f) => !f.name.endsWith('_backpack')), 8, '#3a3c3e');
  strip(join(PREVIEW, 'walkstrip_player_legs.png'), pl.frames.filter((f) => f.name.startsWith('player_legs_walk')));
  { // composite loadout preview (legs + weapon + torso + armor + pack), mimicking the renderer
    const get = (n: string) => chars.find((f) => f.name === n)!.canvas;
    const combos: [string, string, string | null, string | null, string | null][] = [
      ['handgun_idle_0', 'pistol', null, null, null], ['handgun_shoot_0', 'revolver', 'cap', 'hoodie', 'small'],
      ['long_idle_0', 'assault_rifle', 'military_helmet', 'military_vest', 'military'], ['long_reload_2', 'shotgun', 'bike_helmet', 'leather_jacket', 'hiking'],
      ['long_idle_0', 'hunting_rifle', 'riot_helmet', 'police_vest', null], ['melee_idle_0', 'bat', null, null, null],
      ['melee_swing_1', 'machete', null, null, null], ['melee_swing_4', 'knife', null, null, null],
    ];
    const K = 2, cw = PFRAME * K;
    const { c, g } = canvas(cw * combos.length, cw);
    g.fillStyle = '#3d4a2c'; g.fillRect(0, 0, c.width, c.height);
    combos.forEach(([pose, w, h, b, bp], i) => {
      const ox = i * cw, cx = ox + cw / 2, cy = cw / 2;
      g.drawImage(get('player_legs_walk_2'), ox, 0, cw, cw);
      const inf = pl.info['player_torso_' + pose], m = wpn.meta[w], wc = get('weapon_' + w);
      g.save(); g.translate(cx + inf.hand[0] * ART_SCALE * K, cy + inf.hand[1] * ART_SCALE * K); g.rotate(inf.weaponAngle);
      g.drawImage(wc, -m.ox * K, -m.oy * K, wc.width * K, wc.height * K); g.restore();
      g.drawImage(get('player_torso_' + pose), ox, 0, cw, cw);
      for (const n of [b && 'armor_body_' + b, bp && 'backpack_' + bp, h && 'armor_head_' + h]) if (n) {
        g.save(); g.translate(cx, cy); g.rotate(inf.torsoYaw); g.drawImage(get(n), -cw / 2, -cw / 2, cw, cw); g.restore();
      }
    });
    savePng(join(PREVIEW, 'player_loadouts.png'), c);
    const wk = z1.find((f) => f.name === 'zombie_walker_0_walk_2')!.canvas, rn = z1.find((f) => f.name === 'zombie_runner_1_walk_2')!.canvas;
    const cmp = canvas(64 * 3 + 40, 80); cmp.g.fillStyle = '#3d4a2c'; cmp.g.fillRect(0, 0, cmp.c.width, 80);
    cmp.g.drawImage(get('player_legs_walk_2'), 0, 8, 64, 64);
    { const inf = pl.info['player_torso_handgun_idle_0'], m = wpn.meta['pistol'], wc = get('weapon_pistol');
      cmp.g.save(); cmp.g.translate(32 + inf.hand[0], 40 + inf.hand[1]); cmp.g.drawImage(wc, -m.ox / 2, -m.oy / 2, wc.width / 2, wc.height / 2); cmp.g.restore(); }
    cmp.g.drawImage(get('player_torso_handgun_idle_0'), 0, 8, 64, 64);
    cmp.g.drawImage(wk, 84, 8, 64, 64); cmp.g.drawImage(rn, 168, 8, 64, 64);
    savePng(join(PREVIEW, 'player_vs_zombies_50pct.png'), cmp.c);
  }
  const characterInfo = {
    zombieArt: pixelZombies ? 'reference-pixel-overhead-v1' : 'procedural-2d',
    playerArt: playerVariants.length ? 'reference-pixel-v1' : 'procedural-2d',
    artScale: ART_SCALE,
    displayScale: 1 / ART_SCALE,
    note: 'All character/zombie frames are drawn at ART_SCALE (2x) and facing +x, origin at the body center. Display at scale (1/ART_SCALE) * (entityRadius / designRadius); at the design radius that is 0.5. Baked key light is top-left with a drop shadow down-right (sprite space).',
    player: {
      frame: PFRAME, designRadius: PLAYER_RADIUS, figureScale: PLAYER_FIG_SCALE, figureNote: 'figure drawn 1.3x the design radius inside the same 128 frame (to match zombie on-screen size); display at 0.5 as before, no extra leg scaling needed',
      layerOrder: ['player_legs_*', 'weapon_<id>', 'player_torso_*', 'armor_body_<id>', 'backpack_<id>', 'armor_head_<id>'],
      legs: { walk: 8, idle: 1, note: 'rotate legs to movement direction, torso to aim' },
      torsoPoses: Object.fromEntries(Object.entries(TORSO_POSES).map(([k, v]) => [k, v.length])),
      poseForWeaponClass: POSE_OF,
      handsPerFrame: pl.info,
      handsNote: 'hand/offHand in WORLD px from the player center (facing +x). Place weapon_<id> at `hand` rotated by weaponAngle (rad) to follow reload/swing frames; torsoYaw is the torso rotation baked into that frame (armor_body/backpack overlays are drawn at yaw 0, rotate them by torsoYaw to match).',
      weapons: weaponInfo,
      armorHead: ['cap', 'bike_helmet', 'riot_helmet', 'military_helmet'],
      armorBody: ['hoodie', 'leather_jacket', 'police_vest', 'military_vest'],
      backpacks: { small: 'backpack_small', hiking: 'backpack_hiking', military: 'backpack_military', aliases: 'backpack_<itemId> (backpack_small_backpack, ...)' },
    },
    zombies: Object.fromEntries(Object.entries(ZTYPES).map(([t, T]) => [t, {
      atlas: T.frame > 128 ? 'zombies2' : 'zombies', frame: T.frame, designRadius: T.radius, variants: T.variants,
      anims: { walk: 8, attack: 6, hit: 2, death: 8, corpse: 1, ...(t === 'bloater' ? { pulse: 4 } : {}) },
      walkFrameRate: T.walkRate,
    }])),
    zombieNaming: 'frame zombie_<type>_<v>_<anim>_<i>; anim key zombie_<type>_<v>_<anim>',
  };
  for (const p of pages) console.log(`  atlas ${p.name}: ${p.w}x${p.h}, ${p.count} frames`);
  return { atlases: pages.map((p) => p.name), sprites, anims, characterInfo };
}
