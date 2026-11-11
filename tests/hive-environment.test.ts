import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { hiveMaterial, hiveMaterialZone, hiveWallCap, warrensWallRibbons, warrensResinAnchor } from '../src/render/hive-materials';
import type { HiveInfo } from '../src/sim/hive-world';

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const manifest = read('public/assets/hive-environment.json');
describe('Chitin Hive environment', () => {
  it('ships distinct authored materials and every consumed frame for all eight areas', async () => {
    expect(manifest.sources).toHaveLength(11);
    for (const file of manifest.sources) expect(existsSync(file), file).toBe(true);
    const hashes = new Set<string>();
    for (const file of manifest.sources) hashes.add(createHash('sha256').update(readFileSync(file)).digest('hex'));
    expect(hashes.size).toBe(11);
    const atlas = Object.fromEntries(manifest.atlases.map((a: string) => [a, read(`public/assets/${a}.json`)]));
    for (let z = 1; z <= 8; z++) for (const part of ['floor', 'wall_0', 'wall_1', 'burrow', 'egg', 'glow', 'seal']) {
      const f = hiveMaterial(z, part), m = manifest.frames[f];
      expect(m, f).toBeTruthy(); expect(atlas[m.atlas].frames[f], f).toBeTruthy();
      if (part === 'floor') expect(manifest.tiles[`hive_floor_${z}`]).toContain(f);
    }
    for(const part of ['ribbon_0','ribbon_1','ribbon_2','fragments','wear','resin']) {
      const name=`hive_warrens_${part}`;
      expect(manifest.frames[name].atlas).toBe('hive_warrens');
      expect(atlas.hive_warrens.frames[name]).toBeTruthy();
    }
    for (const state of ['idle', 'pulse', 'damaged', 'destroyed']) {
      const name = `hive_queen_conduit_${state}`;
      expect(manifest.frames[name].atlas).toBe('hive_queen_conduits');
      expect(atlas.hive_queen_conduits.frames[name]).toBeTruthy();
    }
    expect(Object.keys(manifest.frames)).toHaveLength(66);
  });

  it('has transparent prop gutters, opaque floors, and fitted bounds that constrain world scale', async () => {
    for (const key of manifest.atlases) {
      const im = await loadImage(`public/assets/${key}.png`), c = createCanvas(im.width, im.height), g = c.getContext('2d');
      g.drawImage(im, 0, 0);
      for (const [name, entry] of Object.entries(read(`public/assets/${key}.json`).frames) as [string, any][]) {
        const f = entry.frame, p = g.getImageData(f.x, f.y, f.w, f.h).data;
        expect(f.x + f.w <= im.width && f.y + f.h <= im.height, name).toBe(true);
        if (key === 'hive_floors') {
          for (let i = 3; i < p.length; i += 4) if (p[i] < 255) throw Error(`${name}: transparent floor pixel`);
          continue;
        }
        let count = 0, edge = 0;
        for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
          const a = p[(y * f.w + x) * 4 + 3]; if (a >= 32) count++;
          if (x < 8 || y < 8 || x >= f.w - 8 || y >= f.h - 8) edge += a;
        }
        expect(count, name).toBeGreaterThan(5000); expect(edge, name).toBe(0);
        const b = manifest.frames[name].bounds;
        expect(Math.max(b.w, b.h), name).toBeLessThanOrEqual(234);
        expect(Math.max(b.w, b.h), name).toBeGreaterThanOrEqual(230);
      }
    }
  });

  it('places caps only on bordering solids, preserves the dam, and resolves outlying wall lights', () => {
    const h = { n: 5, tile: 80, floor: new Uint8Array(25), zone: new Uint8Array(25), dam: { x: 0, y: 0, w: 80, h: 80 } } as HiveInfo;
    h.floor[6] = 1; h.zone[6] = 3;
    expect(hiveWallCap(h, 1, 1)).toBeNull();
    expect(hiveWallCap(h, 0, 0)).toBeNull();
    expect(hiveWallCap(h, 4, 4)).toBeNull();
    const cap = hiveWallCap(h, 2, 1)!;
    expect(cap).toEqual({ x: 200, y: 120, zone: 3, width: 96 });
    expect(cap.width / 2 - h.tile / 2).toBe(8);
    expect(hiveMaterialZone(h, 200, 120)).toBe(3);
    expect(hiveMaterialZone(h, -1, 120)).toBe(8);
    expect(hiveMaterialZone(h, 500, 120)).toBe(8);
  });

  it('follows Warrens boundaries facing the floor without drawing across connections to other areas', () => {
    const h={n:7,tile:80,floor:new Uint8Array(49),zone:new Uint8Array(49)} as HiveInfo;
    // A three-tile room with a zone-two continuation to the right.
    for(const i of [16,17,18,19]){h.floor[i]=1;h.zone[i]=i===19?2:1;}
    const ribbons=warrensWallRibbons(h);
    expect(ribbons.length).toBeGreaterThan(6);
    expect(warrensWallRibbons(h)).toBe(ribbons);
    for(const p of ribbons){
      expect(Number.isFinite(p.x+p.y+p.angle)).toBe(true);
      expect(p.x).toBeLessThan(410);
      // The open exit at x=400 must not receive a vertical wall ribbon.
      expect(p.x>400&&p.y>160&&p.y<240).toBe(false);
    }
    const resin=warrensResinAnchor(h,200,200);
    expect(ribbons.some(p=>p.x===resin.x&&p.y===resin.y&&p.angle===resin.angle)).toBe(true);
    expect(Math.hypot(resin.x-200,resin.y-200)).toBeLessThan(100);
    expect(warrensResinAnchor(h,440,200)).toEqual({x:440,y:200,angle:0});
    const elsewhere={...h,zone:new Uint8Array(49).fill(2)};
    expect(warrensWallRibbons(elsewhere)).toEqual([]);
  });
});
