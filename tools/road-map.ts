// tools/road-map.ts — render an overview PNG of the Long Road map straight from the sim (no Phaser).
// Usage: npx tsx tools/road-map.ts [seed] [out.png]
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { newState } from '../src/sim/core';
import * as roadWorld from '../src/sim/road-world';

const seed = Number(process.argv[2] || 7);
const out = process.argv[3] || 'tools/out/road-map.png';
const state = newState(seed, 'survival');
const t0 = performance.now();
const world = roadWorld.build(state);
console.log('built in', Math.round(performance.now() - t0), 'ms:', state.buildings.length, 'buildings,', state.roads.length, 'roads,', state.grid.count, 'solids,', state.decor.length, 'decor');
const S = 2000 / 16000, W = 2000;
const c = createCanvas(W, W), g = c.getContext('2d');
g.fillStyle = '#1b2416'; g.fillRect(0, 0, W, W);
const SURF: Record<string, string> = { forest: '#1e2e1a', grass: '#33452a', park: '#2f4a2a', concrete: '#4a4a46', gravel: '#4c4740', asphalt: '#3a3a3a', dirt: '#4a3e2c', field: '#3f5530', base: '#454838', water: '#1d3a52' };
for (const d of state.decor) if (d.kind === 'lot') { g.fillStyle = SURF[d.sub || ''] || '#333'; g.fillRect(d.x * S, d.y * S, d.w * S, d.h * S); }
for (const r of state.roads) { g.fillStyle = r.kind === 'avenue' ? '#2a2a2c' : r.kind === 'dirt' ? '#5a4a34' : '#303032'; g.fillRect(r.x * S, r.y * S, Math.max(1, r.w * S), Math.max(1, r.h * S)); }
const BK: Record<string, string> = { house: '#8a7a62', store: '#9a8a5a', gas_station: '#a86a4a', warehouse: '#6a7a8a', office: '#7a8aa0', police: '#4a6aa8', hospital: '#d0d0d8', gun_store: '#a05050', military: '#6a7a4a', school: '#b09060' };
for (const b of state.buildings) { g.fillStyle = BK[b.kind] || '#888'; g.fillRect(b.x * S, b.y * S, Math.max(1, b.w * S), Math.max(1, b.h * S)); }
for (const o of state.grid.all()) {
  if (o.kind === 'wall' && (o as any).base) { g.fillStyle = '#e0c060'; g.fillRect(o.x * S - 0.5, o.y * S - 0.5, Math.max(1.5, o.w * S), Math.max(1.5, o.h * S)); }
  else if (o.kind === 'tree') { g.fillStyle = '#2f5a2a'; g.fillRect(o.x * S, o.y * S, 1.2, 1.2); }
  else if (o.kind === 'car') { g.fillStyle = '#c0c0c0'; g.fillRect(o.x * S, o.y * S, Math.max(1, o.w * S), Math.max(1, o.h * S)); }
}
g.strokeStyle = '#ff5050'; g.lineWidth = 2;
for (const gt of world.gates) g.strokeRect(gt.x * S - 3, gt.y * S - 3, gt.w * S + 6, gt.h * S + 6);
g.fillStyle = '#ffe080'; g.font = 'bold 18px sans-serif';
for (const [i, s] of world.sectors.entries()) g.fillText(`S${i + 1} ${s.name}`, s.rect.x * S + 12, s.rect.y * S + 26);
g.font = '13px sans-serif';
for (const [id, r] of Object.entries(world.sites)) { if (!r) continue; g.fillStyle = '#ff80ff'; g.fillRect(r.x * S, r.y * S, Math.max(3, r.w * S), Math.max(3, r.h * S)); g.fillStyle = '#fff'; g.fillText(id, r.x * S, r.y * S - 2); }
g.fillStyle = '#50ff50'; for (const cp of world.camps) g.fillRect(cp.x * S - 4, cp.y * S - 4, 8, 8);
g.fillStyle = '#50c0ff'; g.fillRect(world.start.x * S - 5, world.start.y * S - 5, 10, 10);
writeFileSync(out, c.toBuffer('image/png'));
console.log('wrote', out);
