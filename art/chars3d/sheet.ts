// art/chars3d/sheet.ts — quick look-dev: render a set of 3D character jobs into one contact sheet.
// npx tsx art/chars3d/sheet.ts <out.png> <set> [scale]
//   sets: torso | legs | weapons | gear | preview | zombie:<type> | all-zombies
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { openRenderer, type Job } from './driver';

const [out, set = 'torso', scaleArg = '1'] = process.argv.slice(2);
const K = +scaleArg;
const TORSO: Record<string, number> = { handgun_idle: 1, handgun_shoot: 2, handgun_reload: 6, long_idle: 1, long_shoot: 2, long_reload: 6, melee_idle: 1, melee_swing: 6, unarmed_idle: 1, unarmed_punch: 4, unarmed_walk: 8 };
const jobs: (Job & { label: string })[] = [];
if (set === 'torso') for (const [a, n] of Object.entries(TORSO)) for (let i = 0; i < n; i++) jobs.push({ kind: 'torso', w: 192, h: 192, anim: a, i, label: `${a}_${i}` });
if (set === 'legs') { for (let i = 0; i < 8; i++) jobs.push({ kind: 'legs', w: 160, h: 160, anim: 'walk', i, label: `walk_${i}` }); jobs.push({ kind: 'legs', w: 160, h: 160, anim: 'idle', i: 0, label: 'idle' }); }
if (set === 'weapons') for (const id of ['pistol', 'revolver', 'smg', 'shotgun', 'assault_rifle', 'hunting_rifle', 'knife', 'bat', 'machete']) jobs.push({ kind: 'weapon', w: 200, h: 48, id, label: id });
if (set === 'gear') for (const id of ['cap', 'bike_helmet', 'riot_helmet', 'military_helmet', 'hoodie', 'leather_jacket', 'police_vest', 'military_vest', 'small', 'hiking', 'military']) jobs.push({ kind: 'preview', w: 192, h: 192, anim: 'long_idle', i: 2, weapon: 'assault_rifle', gear: [id], label: id });
if (set === 'hero') for (const [a, i, w] of [['unarmed_idle', 0, ''], ['long_idle', 0, 'assault_rifle'], ['handgun_idle', 0, 'pistol']] as [string, number, string][]) jobs.push({ kind: 'preview', w: 192, h: 192, anim: a, i, weapon: w, gear: (process.env.GEAR || '').split(',').filter(Boolean), label: `${a} ${w}` });
if (set === 'preview') {
  const P: [string, number, string][] = [['unarmed_idle', 0, ''], ['unarmed_walk', 1, ''], ['unarmed_punch', 2, ''], ['handgun_idle', 0, 'pistol'], ['handgun_reload', 2, 'revolver'], ['long_idle', 0, 'assault_rifle'], ['long_idle', 0, 'shotgun'], ['long_idle', 0, 'hunting_rifle'], ['long_reload', 1, 'smg'], ['melee_idle', 0, 'bat'], ['melee_swing', 2, 'machete'], ['melee_swing', 4, 'knife']];
  for (const [a, i, w] of P) jobs.push({ kind: 'preview', w: 224, h: 224, anim: a, i, weapon: w, label: `${a}_${i} ${w}` });
}
if (set.startsWith('zombie:') || set === 'all-zombies') {
  const types = set === 'all-zombies' ? ['walker', 'runner', 'brute', 'crawler', 'bloater'] : [set.slice(7)];
  const V: Record<string, number> = { walker: 4, runner: 3, brute: 2, crawler: 2, bloater: 2 };
  const A: [string, number][] = [['walk', 8], ['attack', 6], ['hit', 2], ['death', 8], ['corpse', 1]];
  for (const t of types) for (let v = 0; v < V[t]; v++) {
    const big = t === 'brute' || t === 'bloater';
    for (const [a, n] of [...A, ...(t === 'bloater' ? [['pulse', 4] as [string, number]] : [])]) for (let i = 0; i < n; i++) {
      const dd = a === 'death' || a === 'corpse';
      jobs.push({ kind: 'zombie', w: dd ? (big ? 320 : 256) : big ? 256 : 192, h: dd ? (big ? 320 : 256) : big ? 256 : 192, type: t, v, anim: a, i, label: `${t}${v} ${a}_${i}` });
    }
  }
}
const R = await openRenderer();
console.log('GL:', R.glInfo, 'jobs:', jobs.length);
const t0 = Date.now();
const res = await R.render(jobs);
console.log('rendered in', Date.now() - t0, 'ms');
console.log(R.logs.slice(0, 8).join('\n').slice(0, 2000));
await R.close();
const cw = Math.max(...jobs.map((j) => j.w)) * K, ch = Math.max(...jobs.map((j) => j.h)) * K + 14;
const cols = Math.min(jobs.length, Math.max(1, Math.floor(2400 / cw)));
const rows = Math.ceil(jobs.length / cols);
const c = createCanvas(cols * cw, rows * ch), g = c.getContext('2d');
g.fillStyle = '#3a3c3e'; g.fillRect(0, 0, c.width, c.height);
for (let i = 0; i < jobs.length; i++) {
  const img = await loadImage(res[i].png);
  const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
  if (i % 2) { g.fillStyle = '#45473f'; g.fillRect(x, y, cw, ch); }
  g.drawImage(img, x, y, jobs[i].w * K, jobs[i].h * K);
  g.fillStyle = '#fff'; g.font = '11px sans-serif'; g.fillText(jobs[i].label, x + 3, y + ch - 3);
}
writeFileSync(out, c.toBuffer('image/png'));
console.log('wrote', out, 'meta[0]', JSON.stringify(res[0].meta));
