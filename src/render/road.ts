// render/road.ts — The Long Road overlay: sector gates, checkpoint camps, the cast, the objective marker
// (with an edge arrow when it is off screen), pickup icons and mission props. Overhead only.
import * as Phaser from 'phaser';
import type { GameState } from '../sim/types';
import * as road from '../sim/road';
import { QUEST_ITEMS } from '../sim/road-data';
import { ITEMS } from '../sim/items';
import { campaignFrame } from '../campaign-art';
import { assetUrl } from '../asset-url';
import { D, Pool, type View } from './common';

export class RoadRender {
  private scene: Phaser.Scene;
  private people: Pool<Phaser.GameObjects.Image>;
  private props: Pool<Phaser.GameObjects.Image>;
  private icons: Pool<Phaser.GameObjects.Image>;
  private labels: Pool<Phaser.GameObjects.Text>;
  private marks: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private loading = new Set<string>();
  private campCache = new Map<number, { x: number; y: number; frame: string; w: number; h: number; angle: number }[]>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.people = new Pool(() => scene.add.image(0, 0, 'campaign_people', 'mara_idle_0').setDepth(D.zombieOver + 2).setScale(0.5));
    this.props = new Pool(() => scene.add.image(0, 0, 'campaign_props', 'lantern_0').setDepth(D.floorObj + 1));
    this.icons = new Pool(() => scene.add.image(0, 0, '__DEFAULT').setDepth(D.glow + 1));
    this.labels = new Pool(() => scene.add.text(0, 0, '', { fontFamily: '"Barlow Condensed", sans-serif', fontSize: '12px', color: '#f0e6c8', backgroundColor: '#0e1410dd', padding: { x: 5, y: 3 } }).setOrigin(0.5).setDepth(D.overlay));
    this.marks = scene.add.graphics().setDepth(D.overlay - 1);
    this.glow = scene.add.graphics().setDepth(D.glow).setBlendMode(Phaser.BlendModes.ADD);
  }
  clear() {
    for (const p of [this.people, this.props, this.icons, this.labels]) { p.begin(); p.end(); }
    this.marks.clear(); this.glow.clear(); this.campCache.clear();
  }

  private iconKey(id: string) {
    const key = 'roadicon:' + id;
    if (this.scene.textures.exists(key) || this.loading.has(key)) return this.scene.textures.exists(key) ? key : null;
    this.loading.add(key);
    const url = QUEST_ITEMS[id] ? `assets/campaign/icon-${id}.png` : `assets/icons/${id}.png`;
    this.scene.load.image(key, assetUrl(url));
    this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => { if (this.scene.textures.exists(key)) this.scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST); });
    this.scene.load.start();
    return null;
  }

  private campProps(s: GameState, m: number) {
    let list = this.campCache.get(m);
    if (list) return list;
    const c = road.campOf(s, m);
    list = [
      { x: c.x - 70, y: c.y - 40, frame: 'tent_0', w: 96, h: 96, angle: -0.3 },
      { x: c.x + 60, y: c.y + 30, frame: 'lantern_0', w: 40, h: 30, angle: 0 },
      { x: c.x - 10, y: c.y + 62, frame: 'cache_0', w: 54, h: 40, angle: 0.4 },
    ];
    this.campCache.set(m, list);
    return list;
  }

  draw(s: GameState, v: View, time: number) {
    for (const p of [this.people, this.props, this.icons, this.labels]) p.begin();
    this.marks.clear(); this.glow.clear();
    const r = s.road;
    if (s.mode !== 'road' || !r) { for (const p of [this.people, this.props, this.icons, this.labels]) p.end(); return; }
    const vis = (x: number, y: number, pad = 200) => x > v.x - pad && x < v.x + v.w + pad && y > v.y - pad && y < v.y + v.h + pad;

    // ---- quarantine walls: concrete barrier segments (the ground skips these solids: campaignArt)
    const SEG = 128;
    for (const w of r.world.walls) {
      if (w.x > v.x + v.w + 200 || w.x + w.w < v.x - 200 || w.y > v.y + v.h + 200 || w.y + w.h < v.y - 200) continue;
      const horiz = w.w >= w.h, len = horiz ? w.w : w.h, thick = horiz ? w.h : w.w;
      const a0 = horiz ? Math.max(w.x, v.x - 200) : Math.max(w.y, v.y - 200), a1 = horiz ? Math.min(w.x + w.w, v.x + v.w + 200) : Math.min(w.y + w.h, v.y + v.h + 200);
      const start = horiz ? w.x : w.y;
      for (let a = start + Math.floor((a0 - start) / SEG) * SEG; a < a1; a += SEG) {
        const segLen = Math.min(SEG, start + len - a);
        if (segLen < 8) continue;
        const cx = horiz ? a + segLen / 2 : w.x + w.w / 2, cy = horiz ? w.y + w.h / 2 : a + segLen / 2;
        const img = this.props.get().setTexture('campaign_props', 'barrier_0').setPosition(cx, cy).setDepth(D.structure);
        img.setRotation(horiz ? 0 : Math.PI / 2).setScale(segLen * 1.4 / img.frame.width, thick * 1.1 / img.frame.height).setAlpha(1);
      }
    }
    // ---- gates (The Hive Below has resin seals instead: render/hive.ts)
    for (const g of r.world.hive ? [] : r.world.gates) {
      const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
      if (!vis(cx, cy, 300)) continue;
      const img = this.props.get().setTexture('campaign_props', g.open ? 'gate_1' : 'gate_0').setPosition(cx, cy).setDepth(D.structure);
      const along = g.dir === 'v' ? g.h : g.w, across = g.dir === 'v' ? g.w : g.h;
      img.setRotation(g.dir === 'v' ? Math.PI / 2 : 0).setScale(along / img.frame.width, Math.max(across, 40) / img.frame.height);
      img.setAlpha(g.open ? 0.55 : 1);
      if (!g.open) {
        this.glow.fillStyle(0xff3020, 0.25 + 0.15 * Math.sin(time * 3)); this.glow.fillCircle(cx, cy, 9);
        this.labels.get().setText('QUARANTINE GATE · LOCKED').setPosition(cx, cy - (g.dir === 'v' ? 0 : 40) + (g.dir === 'v' ? -along / 2 - 14 : 0)).setColor('#ff9a80');
      }
    }
    // ---- camps: the one ahead (where the group waits) and the one behind
    for (const m of [r.mission - 1, r.mission]) {
      if (m < 0 || m > 9) continue;
      if (r.world.hive && m === r.mission && r.phase === 'play' && road.current(s)?.kind !== 'camp') continue;   // nobody is ahead of you down here: the camp goes up when you get there
      for (const p of this.campProps(s, m)) {
        if (!vis(p.x, p.y)) continue;
        const img = this.props.get().setTexture('campaign_props', p.frame).setPosition(p.x, p.y).setRotation(p.angle).setDepth(D.floorObj + 1);
        img.setScale(Math.min(p.w / img.frame.width, p.h / img.frame.height));
      }
      const c = road.campOf(s, m);
      if (vis(c.x, c.y)) { this.glow.fillStyle(0xffb050, 0.18 + 0.06 * Math.sin(time * 5)); this.glow.fillCircle(c.x + 60, c.y + 30, 34); }
    }
    // ---- the cast
    for (const c of r.cast) {
      if (!vis(c.x, c.y)) continue;
      const talking = r.subtitle && r.subtitle.who === c.id;
      this.people.get().setTexture('campaign_people', campaignFrame(c.id, talking ? 'talk' : 'idle', time)).setPosition(c.x, c.y).setRotation(c.angle).setScale(0.5).setTint(0xffffff).setDepth(D.zombieOver + 2);
      this.labels.get().setText(road.castName(c.id)).setPosition(c.x, c.y - 30).setColor('#cfe6c4');
    }
    // ---- rescue squad: named, animated allies with visible weapons and muzzle flashes
    for (const [i, a] of r.allies.entries()) {
      if (!vis(a.x, a.y)) continue;
      const pose = a.flash > 0 ? 'shoot' : a.moving ? 'walk' : 'idle';
      this.people.get().setTexture('campaign_people', campaignFrame(a.look, pose, time)).setPosition(a.x, a.y).setRotation(a.angle).setScale(0.5).setTint(0xa9e7ee).setDepth(D.zombieOver + 2);
      this.labels.get().setText(a.name).setPosition(a.x, a.y - 32 - (i % 2) * 20).setColor('#9ed9dc');
      this.marks.lineStyle(1.5, 0x9ed9dc, 0.7); this.marks.strokeCircle(a.x, a.y, 19);
      // The overhead walk frames have no rifle; draw one pointing at the ally's aim.
      const dx = Math.cos(a.angle), dy = Math.sin(a.angle);
      this.marks.lineStyle(4, 0x263b3c, 1); this.marks.lineBetween(a.x + dx * 8, a.y + dy * 8, a.x + dx * 26, a.y + dy * 26);
      if (a.flash > 0) { this.glow.fillStyle(0xffd87a, 0.85); this.glow.fillCircle(a.x + dx * 29, a.y + dy * 29, 7); }
    }
    // ---- pickup icons over drops, and a name tag on the ones within reach
    let tags = 0;
    for (const d of s.drops) {
      if (!d.icon || !vis(d.x, d.y, 60)) continue;
      const key = this.iconKey(d.icon);
      const bob = Math.sin(time * 4 + d.x * 0.01) * 2;
      if (key) this.icons.get().setTexture(key).setPosition(d.x, d.y - 16 + bob).setDisplaySize(d.quest ? 34 : 28, d.quest ? 34 : 28).setAlpha(0.95);
      if (d.quest) { this.glow.lineStyle(2, 0xffd36b, 0.7 + 0.3 * Math.sin(time * 6)); this.glow.strokeCircle(d.x, d.y, 16 + 3 * Math.sin(time * 6)); }
      if (tags < 8 && Math.hypot(d.x - s.player.x, d.y - s.player.y) < 170) {
        tags++;
        const stacks = d.inv.slots.filter((st): st is NonNullable<typeof st> => !!st);
        const first = stacks[0];
        const name = first ? (QUEST_ITEMS[first.id] ?? ITEMS[first.id]?.name ?? first.id) : '';
        const text = stacks.length > 1 ? `${name} +${stacks.length - 1} more` : first && first.qty > 1 ? `${name} ×${first.qty}` : name;
        this.labels.get().setText(text.toUpperCase()).setPosition(d.x, d.y + 24).setColor(d.quest ? '#ffd36b' : '#e8e2d0');
      }
    }
    // ---- mission interact prop
    if (r.interactTarget && vis(r.interactTarget.x, r.interactTarget.y)) {
      const t = r.interactTarget, cx = t.x + t.w / 2, cy = t.y + t.h / 2;
      const img = this.props.get().setTexture('campaign_props', propFor(t.name)).setPosition(cx, cy).setRotation(0).setDepth(D.floorObj + 1);
      img.setScale(Math.min(56 / img.frame.width, 44 / img.frame.height));
    }
    // ---- objective marker
    const run = road.currentRun(s), o = road.current(s);
    if (run && o && o.kind === 'clear' && r.phase === 'play' && run.need - run.kills <= 4) {
      // the last few: point them out so a straggler never hides the end of the objective
      for (const z of s.zombies) {
        if (z.dead || (z as { roadTag?: string }).roadTag !== run.tag || !vis(z.x, z.y, 40)) continue;
        const y = z.y - z.r - 18 + Math.sin(time * 5) * 3;
        this.marks.fillStyle(0xff5a4a, 0.95); this.marks.lineStyle(1.5, 0x2a0808, 1);
        this.marks.beginPath(); this.marks.moveTo(z.x, y + 8); this.marks.lineTo(z.x + 7, y - 4); this.marks.lineTo(z.x - 7, y - 4); this.marks.closePath(); this.marks.fillPath(); this.marks.strokePath();
      }
    }
    if (run && o && r.phase === 'play' && s.screen === 'playing') {
      const px = s.player.x, py = s.player.y, tx = run.point.x, ty = run.point.y;
      const inside = tx > v.x + 40 && tx < v.x + v.w - 40 && ty > v.y + 40 && ty < v.y + v.h - 40;
      const pulse = 1 + 0.15 * Math.sin(time * 4);
      if (inside) {
        const bobY = ty - 34 + Math.sin(time * 3) * 4;
        this.marks.fillStyle(0xf4cf80, 0.95); this.marks.lineStyle(2, 0x2a2208, 1);
        this.marks.beginPath(); this.marks.moveTo(tx, bobY - 14 * pulse); this.marks.lineTo(tx + 10 * pulse, bobY); this.marks.lineTo(tx, bobY + 14 * pulse); this.marks.lineTo(tx - 10 * pulse, bobY); this.marks.closePath(); this.marks.fillPath(); this.marks.strokePath();
        this.glow.lineStyle(2, 0xf4cf80, 0.35); this.glow.strokeCircle(tx, ty, (o.kind === 'holdout' ? road.HOLD_R : o.kind === 'reach' ? (o.r ?? 110) : 60) * (o.kind === 'holdout' ? 1 : pulse));
        if (o.kind === 'holdout') { this.glow.lineStyle(1, 0xf4cf80, 0.15); this.glow.strokeCircle(tx, ty, road.HOLD_R - 6 + 6 * Math.sin(time * 2)); }
        this.labels.get().setText(markerLabel(o, s)).setPosition(tx, bobY - 28).setColor('#f4cf80');
      } else {
        // edge arrow toward the objective
        const cx = v.x + v.w / 2, cy = v.y + v.h / 2, dx = tx - cx, dy = ty - cy, ang = Math.atan2(dy, dx);
        const hw = v.w / 2 - 70, hh = v.h / 2 - 70;
        const k = Math.min(hw / Math.max(1e-6, Math.abs(dx)), hh / Math.max(1e-6, Math.abs(dy)));
        const ax = cx + dx * k, ay = cy + dy * k;
        this.marks.fillStyle(0xf4cf80, 0.95); this.marks.lineStyle(2, 0x2a2208, 1);
        const tip = { x: ax + Math.cos(ang) * 18, y: ay + Math.sin(ang) * 18 };
        const l = { x: ax + Math.cos(ang + 2.5) * 14, y: ay + Math.sin(ang + 2.5) * 14 }, rr = { x: ax + Math.cos(ang - 2.5) * 14, y: ay + Math.sin(ang - 2.5) * 14 };
        this.marks.beginPath(); this.marks.moveTo(tip.x, tip.y); this.marks.lineTo(l.x, l.y); this.marks.lineTo(ax - Math.cos(ang) * 4, ay - Math.sin(ang) * 4); this.marks.lineTo(rr.x, rr.y); this.marks.closePath(); this.marks.fillPath(); this.marks.strokePath();
        const dist = Math.round(Math.hypot(tx - px, ty - py) / 10);
        this.labels.get().setText(`${dist} m`).setPosition(ax - Math.cos(ang) * 30, ay - Math.sin(ang) * 30).setColor('#f4cf80');
      }
    }
    for (const p of [this.people, this.props, this.icons, this.labels]) p.end();
  }
}

function propFor(name: string) {
  const n = name.toLowerCase();
  if (n.includes('radio')) return 'radio_0';
  if (n.includes('light')) return 'floodlight_0';
  if (n.includes('door')) return 'rollup_0';
  if (n.includes('barrier') || n.includes('toll')) return 'barrier_0';
  return 'generator_0';
}
function markerLabel(o: import('../sim/road-data').ObjectiveDef, s: GameState) {
  switch (o.kind) {
    case 'camp': return 'CHECKPOINT';
    case 'rescue': return 'RALLY THE SURVIVORS';
    case 'escort': return 'BRING ALL FOUR HERE';
    case 'holdout': return 'HOLD HERE';
    case 'pickup': return (QUEST_ITEMS[o.item] ?? o.item.replace(/_/g, ' ')).toUpperCase();
    case 'boss': return 'TARGET';
    case 'burrows': return 'BURROW';
    case 'interact': return o.label.toUpperCase();
    default: return (road.sectorOf(s) ? o.text : 'OBJECTIVE').toUpperCase().slice(0, 40);
  }
}
