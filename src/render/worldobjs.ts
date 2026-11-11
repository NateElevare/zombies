// worldobjs.ts — dynamic world objects drawn per frame (culled + pooled): tree canopies, roofs with fade,
// container marks, structures, drops, the interact outline and the build ghost.
import * as Phaser from 'phaser';
import type { Building, Container, Drop, GameState, Rect, Solid, Structure } from '../sim/types';
import * as world from '../sim/world';
import { storyPropFrame,storyStructureFrame } from './story-assets';
import { STRUCTURES } from '../sim/base';
import type { Art } from './art';
import { TX } from './art';
import { D, Pool, hash2, hexColor, inView, type View } from './common';

const ROOF_COL: Record<string, number> = { shingle_red: 0x5a2e26, shingle_grey: 0x3e4044, shingle_brown: 0x4a3a2c, flat_gravel: 0x3a3a3e, flat_tar: 0x2c2c30, metal: 0x4a5058 };
const STRUCT_COL: Record<string, number> = {
  bed: 0x55586a, stash: 0x6b4a28, workbench: 0x5a4430, wood_wall: 0x6b4f2e, metal_wall: 0x5a5f64, wood_door: 0x7a5a36,
  barricade: 0x5a4028, spike_trap: 0x3a3a36, campfire: 0x2a2622, turret: 0x4a4e52,
};
const FLAT_STRUCT = new Set(['bed', 'spike_trap', 'campfire']);

export class WorldObjs {
  angled = false;
  private scene: Phaser.Scene;
  private art: Art;
  private trees: Pool<Phaser.GameObjects.Image>;
  private roofs: Pool<Phaser.GameObjects.TileSprite>;
  private roofTint: Pool<Phaser.GameObjects.Image>;
  private structLow: Pool<Phaser.GameObjects.Image>;
  private structHigh: Pool<Phaser.GameObjects.Image>;
  private fires: Pool<Phaser.GameObjects.Sprite>;
  private drops: Pool<Phaser.GameObjects.Image>;
  private glowList: Drop[] = [];
  private ghost: Phaser.GameObjects.Image;
  private gFloor: Phaser.GameObjects.Graphics;   // container marks, fallback structures/drops (floor level)
  private gStruct: Phaser.GameObjects.Graphics;  // fallback tall structures + hp bars
  private gRoofShadow: Phaser.GameObjects.Graphics;
  private gRoof: Phaser.GameObjects.Graphics;
  private gOver: Phaser.GameObjects.Graphics;    // interact outline, ghost, crosshair (above lighting)
  private roofA = new Map<string, number>();
  private tmpB: Building[] = [];
  private tmpS: Solid[] = [];
  /** campfires in view this frame (for lights) */
  fires_: { x: number; y: number }[] = [];
  /** ambient light colour/level for things drawn above the lightmap (roofs), set by the renderer */
  roofLight = 0xffffff; roofLevel = 1;
  private canopies: { d: any; ns: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image; a: number }[] = [];
  nFires = 0;

  constructor(scene: Phaser.Scene, art: Art) {
    this.scene = scene; this.art = art;
    this.trees = new Pool(() => scene.add.image(0, 0, TX.canopy).setDepth(D.tree));
    this.roofs = new Pool(() => scene.add.tileSprite(0, 0, 64, 64, TX.px).setOrigin(0, 0).setDepth(D.light + 2));
    this.roofTint = new Pool(() => scene.add.image(0, 0, TX.px).setOrigin(0, 0).setDepth(D.light + 2));
    this.structLow = new Pool(() => scene.add.image(0, 0, TX.px).setDepth(D.floorObj));
    this.structHigh = new Pool(() => scene.add.image(0, 0, TX.px).setDepth(D.structure));
    this.fires = new Pool(() => scene.add.sprite(0, 0, TX.px).setDepth(D.glow).setBlendMode(Phaser.BlendModes.ADD));
    this.drops = new Pool(() => scene.add.image(0, 0, TX.px).setDepth(D.floorObj));
    this.ghost = scene.add.image(0, 0, TX.px).setDepth(D.overlay).setVisible(false);
    this.gFloor = scene.add.graphics().setDepth(D.decal + 2);
    this.gStruct = scene.add.graphics().setDepth(D.structure + 1);
    this.gRoofShadow = scene.add.graphics().setDepth(D.roof - 1);
    this.gRoof = scene.add.graphics().setDepth(D.light + 3);
    this.gOver = scene.add.graphics().setDepth(D.overlay);
    for (let i = 0; i < 16; i++) this.fires_.push({ x: 0, y: 0 });
  }

  attach() { this.roofA.clear(); }
  destroy() {
    for (const p of [this.trees, this.roofs, this.roofTint, this.structLow, this.structHigh, this.fires, this.drops] as Pool<any>[]) p.destroy();
    for (const g of [this.gFloor, this.gStruct, this.gRoofShadow, this.gRoof, this.gOver, this.ghost]) g.destroy();
  }
  hide() {
    for (const p of [this.trees, this.roofs, this.roofTint, this.structLow, this.structHigh, this.fires, this.drops] as Pool<any>[]) { p.begin(); p.end(); }
    for (const g of [this.gFloor, this.gStruct, this.gRoofShadow, this.gRoof, this.gOver]) g.clear();
    this.ghost.setVisible(false);
  }

  private structProp(st: { type: string; open?: boolean; hp?: number; maxHp?: number }) {
    const art = this.art, t = st.type;
    const keys: string[] = [];
    const dmg = st.maxHp && st.hp !== undefined && st.hp < st.maxHp * 0.5;
    if (t === 'wood_door' && st.open) keys.push('structure:wood_door_open');
    if (dmg) keys.push('structure:' + t + '_damaged');
    keys.push(t === 'turret' ? 'structure:turret_base' : 'structure:' + t);
    for (const k of keys) { const p = art.prop(k); if (p) return p; }
    return null;
  }
  private structFrame(st: Structure): string | null {
    const p = this.structProp(st);
    return p ? p.frames[0] : null;
  }

  update(state: GameState, v: View, realDt: number, time: number, mouse: { x: number; y: number } | null) {
    const art = this.art, s = art.scale, p = state.player;
    // ---------------------------------------------------------------- trees + container marks
    this.trees.begin();
    const gF = this.gFloor; gF.clear();
    const list = this.tmpS; list.length = 0;
    const m = 90;
    state.grid.each(v.x - m, v.y - m, v.w + m * 2, v.h + m * 2, (o) => { if (o.kind === 'tree' || o.container) list.push(o); });
    for (const o of list) {
      if (o.kind === 'tree') {
        if(this.angled&&art.has(storyPropFrame(o,state.buildings)||''))continue;
        const any = o as any, cr = any.cr || 34, cx = o.x + o.w / 2, cy = o.y + o.h / 2;
        if (!inView(v, cx, cy, cr + 10)) continue;
        const img = this.trees.get();
        const pr = art.prop('tree:' + (o.sub || 'oak')) || art.prop('tree:oak') || art.prop(o.sub || 'oak');
        if (pr) {
          let frames: string[] = pr.frames;
          const sz = pr.sizes;
          if (sz && sz.diameters) {
            let best = '', bd = 1e9;
            for (const k of Object.keys(sz.diameters)) { const dd = Math.abs(sz.diameters[k] - cr * 2); if (dd < bd && sz[k]) { bd = dd; best = k; } }
            if (best) frames = sz[best].filter((f: string) => art.has(f));
            if (!frames.length) frames = pr.frames;
          }
          const fr = frames[(o.vseed ?? 0) % frames.length];
          if (img.frame.name !== fr) img.setTexture(art.atlasOf(fr)!, fr);
          const pad = (pr.pad ?? 0) as number, body = img.frame.width * s - pad * 2;
          img.setScale((cr * 2 / Math.max(1, body)) * s).clearTint();
        } else {
          if (img.texture.key !== TX.canopy) img.setTexture(TX.canopy);
          const shade = [0x5a7a4a, 0x66844e, 0x4e6e44, 0x6e8a55][any.shade || 0] ?? 0x5a7a4a;
          img.setScale(cr * 2 / 108).setTint(shade);
        }
        img.setPosition(cx, cy).setRotation(((o.vseed ?? 0) % 628) / 100);
        // let the player see themselves under a canopy
        const dx = p.x - cx, dy = p.y - cy;
        img.setAlpha(dx * dx + dy * dy < (cr + 6) * (cr + 6) ? 0.45 : 1);
      } else if (o.container) {
        const c = o.container;
        if (!c.searched) {
          const a = 0.16 + 0.1 * Math.sin(time * 2.6 + c.x * 0.01);
          gF.lineStyle(1.5, 0xffd65a, a); gF.strokeRect(c.x - 1.5, c.y - 1.5, c.w + 3, c.h + 3);
        } else { gF.fillStyle(0x000000, 0.32); gF.fillRect(c.x, c.y, c.w, c.h); }
      }
    }
    this.trees.end();

    // ---------------------------------------------------------------- structures
    this.structLow.begin(); this.structHigh.begin(); this.fires.begin();
    const gS = this.gStruct; gS.clear();
    this.nFires = 0;
    for (const st of state.structures) {
      if (st.dead) continue;
      const cx = st.x + st.w / 2, cy = st.y + st.h / 2;
      if (!inView(v, cx, cy, 80)) continue;
      const flat = FLAT_STRUCT.has(st.type);
      const fr = this.structFrame(st);
      const flash = (st.hitFlash || 0) > 0;
      if(this.angled&&art.has(storyStructureFrame(st))) { /* StoryProps draws this upright. */ } else if (fr) {
        const img = flat ? this.structLow.get() : this.structHigh.get();
        img.setTexture(art.atlasOf(fr)!, fr);
        const pr = this.structProp(st);
        const pad = (pr?.pad ?? 0) as number;
        // sprites are drawn for rot 0 in their native orientation ('h' or 'v'); rot 1 turns them 90°
        const rot = st.rot ? Math.PI / 2 : 0;
        const L = st.rot ? st.h : st.w, W = st.rot ? st.w : st.h;
        const bw = img.frame.width * s - pad * 2, bh = img.frame.height * s - pad * 2;
        img.setPosition(cx, cy).setRotation(rot).setScale((L / bw) * s, (W / bh) * s);
        if (flash) img.setTint(0xff9090); else img.clearTint();
        if (st.type === 'turret') {
          const hp = art.prop('structure:turret_head');
          const hf = hp ? hp.frames[0] : null;
          const head = this.structHigh.get();
          if (hf) { head.setTexture(art.atlasOf(hf)!, hf).setScale(s).clearTint(); if (hp!.pivot) head.setOrigin((hp!.pivot[0] + (hp!.pad || 0)) / (head.frame.width * s), (hp!.pivot[1] + (hp!.pad || 0)) / (head.frame.height * s)); }
          else head.setTexture(TX.px).setDisplaySize(22, 6).setTint(0x2a2c30);
          head.setPosition(cx, cy).setRotation(st.aim || 0);
        }
      } else {
        const col = STRUCT_COL[st.type] ?? 0x555555;
        const g = flat ? gF : gS;
        if (!flat) { g.fillStyle(0x000000, 0.35); g.fillRect(st.x + 3, st.y + 4, st.w, st.h); }
        g.fillStyle(flash ? 0xc06060 : col, st.type === 'wood_door' && st.open ? 0.5 : 1); g.fillRect(st.x, st.y, st.w, st.h);
        g.lineStyle(1.5, 0x000000, 0.5); g.strokeRect(st.x + 0.75, st.y + 0.75, st.w - 1.5, st.h - 1.5);
        if (st.type === 'campfire') { g.fillStyle(0x55524c, 1); g.fillCircle(cx, cy, 14); g.fillStyle(0x1a1816, 1); g.fillCircle(cx, cy, 10); }
        if (st.type === 'spike_trap') { g.fillStyle(0x8a8a80, 1); for (let i = 0; i < 9; i++) g.fillTriangle(st.x + 4 + (i % 3) * 10, st.y + 10 + Math.floor(i / 3) * 10, st.x + 8 + (i % 3) * 10, st.y + 2 + Math.floor(i / 3) * 10, st.x + 12 + (i % 3) * 10, st.y + 10 + Math.floor(i / 3) * 10); }
        if (st.type === 'turret') { g.fillStyle(0x2a2c30, 1); g.fillCircle(cx, cy, 10); g.lineStyle(5, 0x2a2c30, 1); g.lineBetween(cx, cy, cx + Math.cos(st.aim || 0) * 20, cy + Math.sin(st.aim || 0) * 20); }
        if (st.type === 'bed') { g.fillStyle(0xc8c8c0, 1); if (st.rot) g.fillRect(st.x + 4, st.y + 4, 16, st.h - 8); else g.fillRect(st.x + 4, st.y + 4, st.w - 8, 16); }
      }
      if (st.hp < st.maxHp && st.maxHp > 0) {
        gS.fillStyle(0x000000, 0.6); gS.fillRect(st.x, st.y - 7, st.w, 4);
        gS.fillStyle(st.hp / st.maxHp > 0.4 ? 0x7ac050 : 0xd04a3a, 0.9); gS.fillRect(st.x, st.y - 7, st.w * Math.max(0, st.hp / st.maxHp), 4);
      }
      if (st.type === 'campfire') {
        if (this.nFires < this.fires_.length) { const f = this.fires_[this.nFires++]; f.x = cx; f.y = cy; }
        const fire = this.fires.get();
        if (art.animExists('fx_fire')) {
          if (fire.anims.currentAnim?.key !== 'fx_fire') fire.play({ key: 'fx_fire', startFrame: hash2(st.x, st.y) % 8 });
          fire.setScale(s * 0.9);
        } else { fire.setTexture(TX.soft).setScale(0.12).setTint(0xff9a40); }
        fire.setPosition(cx, cy + 2);
      }
    }
    this.structLow.end(); this.structHigh.end(); this.fires.end();

    // ---------------------------------------------------------------- drops
    this.drops.begin();
    const glows = this.glowList; glows.length = 0;
    const pb = state.player ? world.buildingAt(state, state.player.x, state.player.y) : null;
    for (const d of state.drops) {
      if (!inView(v, d.x, d.y, 40)) continue;
      const death = d.kind === 'deathbag';
      if (!death && d.life < 3 && Math.floor(time * 8) % 2 === 0) continue;
      // glow ring is drawn later above the lighting; hide it under roofs of buildings you're not inside
      const db = world.buildingAt(state, d.x, d.y);
      if (!db || db === pb) glows.push(d);
      if(this.angled&&art.has('story_environment_loot_1'))continue;
      const dp = art.prop(death ? 'drop:deathbag' : 'drop:loot');
      const fr = dp ? dp.frames[0] : death ? 'drop_deathbag' : 'drop_bag';
      const pulse = death ? 1 + Math.sin(time * 4) * 0.06 : 1;
      if (art.has(fr)) {
        const img = this.drops.get();
        img.setTexture(art.atlasOf(fr)!, fr).setPosition(d.x, d.y).setScale(s * pulse);
      } else {
        gF.fillStyle(0x000000, 0.3); gF.fillEllipse(d.x + 2, d.y + 4, 22 * pulse, 17 * pulse, 14);
        gF.fillStyle(death ? 0x7a1616 : 0x6b5a3a, 1); gF.fillEllipse(d.x, d.y + 2, 20 * pulse, 16 * pulse, 14);
        gF.lineStyle(2, death ? 0xff5050 : 0x2e2616, 1); gF.strokeEllipse(d.x, d.y + 2, 20 * pulse, 16 * pulse, 14);
        gF.fillStyle(death ? 0xa52a2a : 0x8a7648, 1); gF.fillTriangle(d.x - 4, d.y - 4, d.x, d.y - 10, d.x + 4, d.y - 4);
      }
    }
    this.drops.end();

    // ---------------------------------------------------------------- roofs
    this.roofs.begin(); this.roofTint.begin();
    const gR = this.gRoof, gRS = this.gRoofShadow; gR.clear(); gRS.clear();
    const inside = p ? world.buildingAt(state, p.x, p.y) : null;
    this.tmpB.length = 0;
    const bl = world.buildingsIn(state, v.x - 30, v.y - 30, v.w + 60, v.h + 60, this.tmpB);
    const k = Math.min(1, realDt);
    for (const b of this.angled ? [] : bl) {
      const target = b === inside ? 0 : 1;
      let a = this.roofA.get(b.id);
      if (a === undefined) a = target;
      a = target > a ? Math.min(target, a + k * 3.2) : Math.max(target, a - k * 4.5);
      this.roofA.set(b.id, a);
      if (a <= 0.01) continue;
      this.drawRoof(b as Building & any, a);
    }
    if (inside && !bl.includes(inside)) this.roofA.set(inside.id, 0);
    this.roofs.end(); this.roofTint.end();

    // ---------------------------------------------------------------- overlay: interact, ghost, crosshair
    const gO = this.gOver; gO.clear();
    const it = state.interact;
    if (it && state.ui === null) {
      const t = it.target as any;
      const a = 0.65 + 0.25 * Math.sin(time * 6);
      gO.lineStyle(2, 0xffe08a, a);
      if (it.kind === 'drop') gO.strokeCircle(t.x, t.y, (t as Drop).r + 6 || 18);
      else gO.strokeRect(t.x - 3, t.y - 3, t.w + 6, t.h + 6);
    }
    // loot glow: soft gold halo + pulsing ring (red for your death bag) so drops read at a glance, day or night
    for (const d of this.glowList) {
      const death = d.kind === 'deathbag', col = death ? 0xff4a3a : 0xffc43a;
      const ph = (time * 2.2 + (d.x + d.y) * 0.01) % (Math.PI * 2), pulse = 0.5 + 0.5 * Math.sin(ph);
      const R = (d.r || 12) + 9;
      for (let i = 3; i >= 1; i--) { gO.fillStyle(col, 0.05 + 0.035 * pulse); gO.fillCircle(d.x, d.y, R + i * 5); }
      gO.lineStyle(2.5, col, 0.65 + 0.3 * pulse); gO.strokeCircle(d.x, d.y, R + pulse * 2);
      gO.lineStyle(1, 0xfff2c0, 0.35 + 0.3 * pulse); gO.strokeCircle(d.x, d.y, R - 3);
    }
    const sv = state.build && state.build.salvage;
    const bg = sv ? null : state.build && state.build.ghost;
    if (sv) {
      // aiming at something X can tear down: outline it instead of showing the placement ghost
      const a = 0.7 + 0.25 * Math.sin(time * 7), col = sv.near ? 0xffa040 : 0x9a9a90;
      gO.fillStyle(col, 0.14); gO.fillRect(sv.x - 2, sv.y - 2, sv.w + 4, sv.h + 4);
      gO.lineStyle(2, col, a); gO.strokeRect(sv.x - 3, sv.y - 3, sv.w + 6, sv.h + 6);
    }
    if (bg) {
      const ok = bg.ok, col = ok ? 0x5ad070 : 0xe04a3a;
      const type = state.build!.selected;
      const fr = this.structFrame({ type, open: false } as Structure);
      if(this.angled&&art.has(storyStructureFrame({type,rot:state.build!.rot}))) {this.ghost.setVisible(false);} else if (fr) {
        const rot = state.build!.rot ? Math.PI / 2 : 0;
        const L = rot ? bg.h : bg.w, W = rot ? bg.w : bg.h;
        this.ghost.setVisible(true).setTexture(art.atlasOf(fr)!, fr).setPosition(bg.x + bg.w / 2, bg.y + bg.h / 2).setRotation(rot);
        this.ghost.setScale(L / (this.ghost.frame.width * s) * s, W / (this.ghost.frame.height * s) * s).setAlpha(0.5).setTint(ok ? 0xb0ffb8 : 0xff9090);
      } else {
        this.ghost.setVisible(false);
        gO.fillStyle(STRUCT_COL[type] ?? 0x888888, 0.5); gO.fillRect(bg.x, bg.y, bg.w, bg.h);
      }
      gO.fillStyle(col, 0.18); gO.fillRect(bg.x, bg.y, bg.w, bg.h);
      gO.lineStyle(2, col, 0.9); gO.strokeRect(bg.x, bg.y, bg.w, bg.h);
      void STRUCTURES;
    } else this.ghost.setVisible(false);
    if (mouse && state.screen === 'playing' && (state.ui === null || state.ui === 'build')) {
      const x = mouse.x, y = mouse.y;
      gO.lineStyle(3, 0x000000, 0.45); gO.strokeCircle(x, y, 9);
      gO.lineStyle(1.6, 0xf2f2ea, 0.9); gO.strokeCircle(x, y, 9);
      gO.lineBetween(x - 15, y, x - 5, y); gO.lineBetween(x + 5, y, x + 15, y); gO.lineBetween(x, y - 15, x, y - 5); gO.lineBetween(x, y + 5, x, y + 15);
    }
  }

  private drawRoof(b: Building & any, a: number) {
    const art = this.art, s = art.scale;
    const gR = this.gRoof, gRS = this.gRoofShadow;
    const hl = this.roofLevel; // highlights dim with the ambient light
    // drop shadow on the ground (down-right, key light top-left)
    gRS.fillStyle(0x000000, 0.32 * a); gRS.fillRect(b.x + 6, b.y + 10, b.w + 6, b.h + 4);
    const fams = [b.roof, 'flat_tar'];
    let frames: string[] | null = null;
    for (const f of fams) { frames = art.tiles(f); if (frames) break; }
    const pitched = b.roofStyle === 'pitched' || /^shingle/.test(b.roof);
    const horiz = b.w >= b.h;
    if (frames) {
      const fr = frames[hash2(b.x, b.y, 4) % frames.length];
      const ts = this.roofs.get();
      ts.setTexture(art.atlasOf(fr)!, fr);
      ts.setPosition(b.x - 3, b.y - 3).setSize(b.w + 6, b.h + 6);
      ts.setTileScale(s, s);
      // shingles run along the ridge
      ts.tileRotation = pitched && !horiz ? Math.PI / 2 : 0;
      ts.setTilePosition(0, 0).setAlpha(a);
      ts.setTint(this.roofLight);
    } else {
      const im = this.roofTint.get();
      im.setPosition(b.x - 3, b.y - 3).setDisplaySize(b.w + 6, b.h + 6).setTint(mulColor(hexColor(b.roofColor, ROOF_COL[b.roof] ?? 0x3a3a3e), this.roofLight)).setAlpha(a);
    }
    if (pitched) {
      // two planes: the far (down-right) plane is in shade, the ridge catches light
      gR.fillStyle(0x000000, 0.22 * a);
      if (horiz) gR.fillRect(b.x - 3, b.y + b.h / 2, b.w + 6, b.h / 2 + 3); else gR.fillRect(b.x + b.w / 2, b.y - 3, b.w / 2 + 3, b.h + 6);
      gR.fillStyle(0xffffff, 0.1 * a * hl);
      if (horiz) gR.fillRect(b.x - 3, b.y + b.h / 2 - 3, b.w + 6, 4); else gR.fillRect(b.x + b.w / 2 - 3, b.y - 3, 4, b.h + 6);
      gR.fillStyle(0x000000, 0.25 * a);
      if (horiz) gR.fillRect(b.x - 3, b.y + b.h / 2 + 1, b.w + 6, 2); else gR.fillRect(b.x + b.w / 2 + 1, b.y - 3, 2, b.h + 6);
    } else {
      // parapet + vents / AC units
      gR.lineStyle(5, 0x000000, 0.3 * a); gR.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
      gR.lineStyle(2, 0xffffff, 0.07 * a * hl); gR.strokeRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
      let sd = hash2(b.x, b.y, 9);
      const R = () => ((sd = Math.imul(sd ^ (sd >>> 15), 0x2c1b3c6d) >>> 0) / 4294967296);
      const n = Math.min(5, 1 + Math.floor(b.w * b.h / 60000));
      for (let k = 0; k < n; k++) {
        const vw = 18 + R() * 22, vh = 18 + R() * 16;
        const vx = b.x + 20 + R() * Math.max(1, b.w - 40 - vw), vy = b.y + 20 + R() * Math.max(1, b.h - 40 - vh);
        gR.fillStyle(0x000000, 0.35 * a); gR.fillRect(vx + 3, vy + 4, vw, vh);
        gR.fillStyle(mulColor(0x5a5c5e, this.roofLight), a); gR.fillRect(vx, vy, vw, vh);
        gR.fillStyle(0xffffff, 0.1 * a * hl); gR.fillRect(vx, vy, vw, 2);
        gR.lineStyle(1, 0x000000, 0.4 * a); gR.strokeRect(vx + 0.5, vy + 0.5, vw - 1, vh - 1);
        if (R() < 0.5) gR.strokeCircle(vx + vw / 2, vy + vh / 2, Math.min(vw, vh) * 0.3);
      }
      if (b.kind === 'hospital') { gR.fillStyle(mulColor(0xc82828, this.roofLight), 0.8 * a); const cx = b.x + b.w / 2, cy = b.y + b.h / 2; gR.fillRect(cx - 40, cy - 12, 80, 24); gR.fillRect(cx - 12, cy - 40, 24, 80); }
      if (b.kind === 'police') { gR.fillStyle(mulColor(0x3c5aa0, this.roofLight), 0.55 * a); gR.fillRect(b.x + 12, b.y + 12, Math.min(90, b.w - 24), 14); }
    }
    // eaves edge
    gR.lineStyle(2, 0x000000, 0.45 * a); gR.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
    this.drawDoorways(b, a);
  }

  /** Doorways read from outside: a dark gap in the eaves, a coloured awning sticking out, and a light strip under it. */
  private drawDoorways(b: Building & any, a: number) {
    const gR = this.gRoof, L = this.roofLight, hl = this.roofLevel;
    const awn = ({ store: 0x2f7a62, gas_station: 0xb8502a, police: 0x2e4f9a, hospital: 0xb83030, gun_store: 0x8a6a2a, military: 0x56603a,
      office: 0x34506a, warehouse: 0x9a7a2a, school: 0x8a3a2a } as Record<string, number>)[b.kind] ?? 0x7a3328;
    for (const d of b.doors as Rect[]) {
      const side = doorSide(b, d), D = 18, P = 8; // awning depth / overhang past the opening
      const vert = side === 'w' || side === 'e';
      // awning rect (outside the wall) and the notch cut into the roof edge (inside)
      const ax = vert ? (side === 'w' ? b.x - 3 - D : b.x + b.w + 3) : d.x - P, ay = vert ? d.y - P : (side === 'n' ? b.y - 3 - D : b.y + b.h + 3);
      const aw = vert ? D : d.w + P * 2, ah = vert ? d.h + P * 2 : D;
      const nx = vert ? (side === 'w' ? b.x - 3 : b.x + b.w - 9) : d.x, ny = vert ? d.y : (side === 'n' ? b.y - 3 : b.y + b.h - 9);
      const nw = vert ? 12 : d.w, nh = vert ? d.h : 12;
      gR.fillStyle(0x070707, 0.9 * a); gR.fillRect(nx, ny, nw, nh);
      gR.fillStyle(0x000000, 0.35 * a); gR.fillRect(ax + 3, ay + 4, aw, ah);               // awning shadow
      gR.fillStyle(mulColor(awn, L), a); gR.fillRect(ax, ay, aw, ah);
      // canvas stripes across the awning
      gR.fillStyle(mulColor(0xe8e0cc, L), 0.55 * a);
      if (vert) for (let k = ay + 4; k < ay + ah - 4; k += 12) gR.fillRect(ax, k, aw, 5);
      else for (let k = ax + 4; k < ax + aw - 4; k += 12) gR.fillRect(k, ay, 5, ah);
      // lit front lip so it pops at a glance
      gR.fillStyle(0xffffff, 0.22 * a * hl);
      if (side === 'n') gR.fillRect(ax, ay, aw, 3); else if (side === 's') gR.fillRect(ax, ay + ah - 3, aw, 3);
      else if (side === 'w') gR.fillRect(ax, ay, 3, ah); else gR.fillRect(ax + aw - 3, ay, 3, ah);
      gR.lineStyle(1.5, 0x000000, 0.5 * a); gR.strokeRect(ax, ay, aw, ah);
    }
  }
}
export type { Container };

function mulColor(a: number, b: number) {
  const r = ((a >> 16) & 255) * ((b >> 16) & 255) / 255, g = ((a >> 8) & 255) * ((b >> 8) & 255) / 255, bl = (a & 255) * (b & 255) / 255;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
/** Which outside wall a doorway sits in. */
export function doorSide(b: Rect, d: Rect): 'n' | 's' | 'w' | 'e' {
  const n = Math.abs(d.y - b.y), so = Math.abs(d.y + d.h - (b.y + b.h)), w = Math.abs(d.x - b.x), e = Math.abs(d.x + d.w - (b.x + b.w));
  const m = Math.min(n, so, w, e);
  return m === n ? 'n' : m === so ? 's' : m === w ? 'w' : 'e';
}
