// render/hive.ts — The Hive Below overlay: the rift, the resin seals on the doors, the dam's floodlights, honey
// pools and the glow of the resin on the cave walls. Overhead only. The creatures are drawn by actors.ts, the
// cave floor by ground.ts and the light itself by lighting.ts; the helpers below tell them where the hive art is.
import * as Phaser from 'phaser';
import type { GameState } from '../sim/types';
import type { Art } from './art';
import { TX } from './art';
import { D, Pool, type View } from './common';

/** Frame prefix of a hive creature or fixture: `hive_drone_0_`, `hive_burrow_0_`. */
export const hivePrefix = (type: string) => `hive_${type}_0_`;
/** Design radius of a hive sprite: it is drawn so its longest side is about three radii on screen, which makes
 *  a Drone as large as a walker. Read from the art's own bounds, so repainted sheets need no code change. */
export function hiveDesignR(art: Art, type: string) {
  const b = art.manifest.hiveArt?.frames?.[`hive_${type}_0_walk_0`]?.bounds;
  return b ? Math.max(b.w, b.h) * art.scale / 3 : 15;
}

export class HiveRender {
  private floor: Pool<Phaser.GameObjects.Image>;
  private props: Pool<Phaser.GameObjects.Image>;
  private glows: Pool<Phaser.GameObjects.Image>;
  private labels: Pool<Phaser.GameObjects.Text>;
  private atlas: string | null;

  constructor(private scene: Phaser.Scene, private art: Art) {
    this.atlas = art.atlasOf('hive_seal_0') ?? null;
    this.floor = new Pool(() => scene.add.image(0, 0, TX.px).setDepth(D.decal + 1));
    this.props = new Pool(() => scene.add.image(0, 0, TX.px).setDepth(D.structure));
    this.glows = new Pool(() => scene.add.image(0, 0, TX.soft).setDepth(D.glow).setBlendMode(Phaser.BlendModes.ADD));
    this.labels = new Pool(() => scene.add.text(0, 0, '', { fontFamily: '"Barlow Condensed", sans-serif', fontSize: '12px', color: '#f4cf80', backgroundColor: '#0e1410dd', padding: { x: 5, y: 3 } }).setOrigin(0.5).setDepth(D.overlay));
  }
  private pools() { return [this.floor, this.props, this.glows, this.labels]; }
  clear() { for (const p of this.pools()) { p.begin(); p.end(); } }

  draw(s: GameState, v: View, time: number) {
    for (const p of this.pools()) p.begin();
    const r = s.road, h = r?.world.hive;
    if (s.mode !== 'road' || !r || !h || !this.atlas) { for (const p of this.pools()) p.end(); return; }
    const A = this.atlas, vis = (x: number, y: number, pad = 260) => x > v.x - pad && x < v.x + v.w + pad && y > v.y - pad && y < v.y + v.h + pad;
    const glow = (x: number, y: number, rad: number, col: number, a: number) => this.glows.get().setTexture(TX.soft).setPosition(x, y).setScale(rad * 2 / 256, rad * 2 / 256).setTint(col).setAlpha(a).setRotation(0);

    // ---- the rift: a tear in the mud of the drained bed, at the mouth of the way down
    if (vis(h.rift.x, h.rift.y, 400)) {
      const f = `hive_rift_${Math.floor(time * 6) % 4}`;
      this.floor.get().setTexture(A, f).setPosition(h.rift.x, h.rift.y).setRotation(h.seals[0] ? Math.atan2(h.seals[0].y - h.rift.y, h.seals[0].x - h.rift.x) : 0).setScale(0.95).setAlpha(1).clearTint();
      glow(h.rift.x, h.rift.y, 150 + 14 * Math.sin(time * 2.3), 0xb48cff, 0.34 + 0.08 * Math.sin(time * 3.1));
    }
    // ---- seals: a plug of living resin across each door tunnel; it withers when the cell's boss dies
    r.world.gates.forEach((g, i) => {
      const at = h.seals[i]; if (!at || !vis(at.x, at.y, 420)) return;
      const nx = -Math.sin(at.angle), ny = Math.cos(at.angle);
      if (g.open) {
        // withered rims left on either wall
        for (const k of [-1, 1]) this.floor.get().setTexture(A, 'hive_seal_1').setPosition(at.x + nx * k * 96, at.y + ny * k * 96).setRotation(at.angle).setScale(0.86, 0.86 * k).setAlpha(1).clearTint();
        return;
      }
      for (const k of [-1, 0, 1]) {
        const x = at.x + nx * k * 108, y = at.y + ny * k * 108, flip = k === 0 ? 0.86 : -0.86;
        this.props.get().setTexture(A, 'hive_seal_0').setPosition(x, y).setRotation(at.angle).setScale(0.86, flip).setAlpha(1).clearTint().setDepth(D.structure).setBlendMode(Phaser.BlendModes.NORMAL);
        // it gives off its own light: the same sprite again, added over the darkness
        this.glows.get().setTexture(A, 'hive_seal_0').setPosition(x, y).setRotation(at.angle).setScale(0.86, flip).setTint(0xffffff).setAlpha(0.3 + 0.08 * Math.sin(time * 2 + i + k));
      }
      {
        glow(at.x, at.y, 170, 0xf0a93a, 0.16 + 0.05 * Math.sin(time * 2 + i));
        if (Math.hypot(s.player.x - at.x, s.player.y - at.y) < 420) this.labels.get().setText('RESIN SEAL · ALIVE').setPosition(at.x, at.y - 190);
      }
    });
    // ---- the dam's floodlights (dark until the breaker is thrown)
    for (const gl of h.glows) {
      if (gl.kind !== 'flood' || !vis(gl.x, gl.y, 300)) continue;
      const lamp = this.props.get().setTexture('campaign_props', 'floodlight_0').setPosition(gl.x, gl.y - 34).setRotation(Math.PI / 2).setAlpha(1).clearTint().setDepth(D.structure);
      lamp.setScale(Math.min(60 / lamp.frame.width, 48 / lamp.frame.height), Math.min(60 / lamp.frame.width, 48 / lamp.frame.height));
      if (r.lights) { glow(gl.x, gl.y - 20, 46, 0xffffff, 0.8); glow(gl.x, gl.y + 120, 260, 0xdfe8ff, 0.12); }
    }
    // ---- honey: where a Honeypot burst; it dries up
    for (const q of r.hiveRt?.pools ?? []) {
      if (!vis(q.x, q.y, 200)) continue;
      const k = Math.min(1, q.life / 1.2) * Math.min(1, (q.max - q.life) / 0.25 + 0.2);
      const grow = Math.min(1, (q.max - q.life) / 0.3 + 0.35);
      this.floor.get().setTexture(A, 'hive_honey_0').setPosition(q.x, q.y).setRotation((q.x * 0.37 + q.y * 0.11) % 6.28).setScale(q.r * 2 / 134 * grow).setAlpha(0.92 * k).clearTint();
      glow(q.x, q.y, q.r * 1.5, 0xffb840, 0.14 * k);
    }
    // ---- eggs are pale enough to catch the eye in the dark, and brighten as they hatch; a burrow flares when it sends a column
    for (const z of s.zombies) {
      if (z.dead || (z.type !== 'egg' && z.type !== 'burrow') || !vis(z.x, z.y, 80)) continue;
      const f = z as { hatchT?: number; eruptT?: number };
      if (z.type === 'egg') glow(z.x, z.y, 44, 0xe6f0b0, (f.hatchT ?? 0) > 0 ? 0.3 + 0.15 * Math.sin(time * 22) : 0.13);
      else if ((f.eruptT ?? 99) < 0.9) glow(z.x, z.y, 60, 0xb48cff, 0.4 * (1 - (f.eruptT ?? 0) / 0.9));
    }
    // ---- resin and fungus: the light sources on the walls read as light sources
    for (const gl of h.glows) {
      if (gl.kind !== 'wall' || !vis(gl.x, gl.y, 80)) continue;
      glow(gl.x, gl.y, 34, gl.col, 0.3 + 0.06 * Math.sin(time * 1.7 + gl.x * 0.013));
    }
    for (const p of this.pools()) p.end();
  }
}
