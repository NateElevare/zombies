// actors.ts — the player (layered: legs follow movement, torso + weapon + overlays follow the aim), zombies
// (per type/variant walk cycles driven by velocity, attack/hit frames, hit flash, burning) and bullet tracers.
// Everything is drawn at lerp(prev, cur, alpha) with shortest-arc angle interpolation.
import * as Phaser from 'phaser';
import type { GameState, Zombie, WeaponClass } from '../sim/types';
import { weaponClass, playerWeaponVisual } from '../sim/combat';
import { lookOf } from '../sim/items';
import { weaponStats } from '../sim/progression';
import { darkness } from '../sim/game';
import { NumKind } from './vfx-numbers';
import { TYPES, isHiveType } from '../sim/zombies';
import { ALARM_TIME, GRUB_GROWS, HATCH_TIME, type Bug } from '../sim/hive';
import { hiveDesignR, hivePrefix } from './hive';
import { hiveMaterial, hiveMaterialZone } from './hive-materials';
import { isQueenConduit, queenConduitFrame } from '../hive-conduits';
import type { HBug } from '../sim/hive-bugs';
import { characterFrame } from '../characters';
import type { Art } from './art';
import { TX } from './art';
import { D, angleLerp, hash2, hexColor, inView, type View } from './common';
import type { Fx } from './fx';

const DESIGN_R: Record<string, number> = { player: 14, walker: 15, runner: 13, crawler: 13, brute: 24, bloater: 20 };
const POSE: Record<WeaponClass, string> = { handgun: 'handgun', smg: 'long', shotgun: 'long', rifle: 'long', melee: 'melee', unarmed: 'unarmed' };
const FALLBACK_TINT: Record<string, number> = { walker: 0x6b8f4e, runner: 0xa3b545, brute: 0x4e6b3a, crawler: 0x7d6b4e, bloater: 0x8a9a3a };

type Hand = { hand: [number, number]; offHand?: [number, number]; weaponAngle: number; torsoYaw: number };

interface ZV {
  spr: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; fire: Phaser.GameObjects.Image; pulse: Phaser.GameObjects.Image;
  /** additive white silhouette above the lightmap: the hit flash reads even at night */
  flash: Phaser.GameObjects.Image;
  stamp: number; phase: number; hitT: number; key: string; walk: string[] | null; attack: string[] | null; hit: string[] | null; climb: string[] | null; pulseF: string[] | null; atlas: string;
  /** The Hive Below: the creature's `special` frames, its design radius and walk frame rate (0 = not a hive sprite) */
  special: string[] | null; designR: number; fps: number;
}

export class Actors {
  private scene: Phaser.Scene;
  private art: Art;
  private fx: Fx;
  // player parts
  private pShadow: Phaser.GameObjects.Image;
  private pLegs: Phaser.GameObjects.Image;
  private pWeapon: Phaser.GameObjects.Image;
  private pTorso: Phaser.GameObjects.Image;
  private pBody: Phaser.GameObjects.Image;
  private pPack: Phaser.GameObjects.Image;
  private pHead: Phaser.GameObjects.Image;
  private legAngle = 0; private legPhase = 0; private hurtT = 0; private swayPhase = 0;
  private hands: Record<string, Hand>;
  // zombies
  private zv = new Map<string, ZV>();
  private zfree: ZV[] = [];
  private stamp = 0;
  /** health bars over damaged zombies (one Graphics, redrawn each frame; lit by the lightmap like the zombies) */
  private hpBars: Phaser.GameObjects.Graphics;
  // bullets
  private tracers: Phaser.GameObjects.Image[] = [];
  private heads: Phaser.GameObjects.Image[] = [];
  // damage numbers: last hp seen per zombie, and hits gathered this frame (flushed next frame)
  private hpSeen = new Map<string, { z: Zombie; hp: number; seen: number }>();
  private pend = new Map<string, { z: Zombie; dmg: number; n: number }>();
  private state: GameState | null = null;
  /** burning zombies this frame (for lights) */
  burning: { x: number; y: number }[] = [];
  nBurning = 0;
  /** interpolated player position/aim this frame */
  px = 0; py = 0; pa = 0;
  handX = 0; handY = 0;

  private foam: Phaser.GameObjects.Image[] = [];
  constructor(scene: Phaser.Scene, art: Art, fx: Fx) {
    this.scene = scene; this.art = art; this.fx = fx;
    this.pShadow = scene.add.image(0, 0, TX.blob).setDepth(D.shadow).setAlpha(0.55);
    this.pLegs = scene.add.image(0, 0, TX.px).setDepth(D.player);
    this.pWeapon = scene.add.image(0, 0, TX.px).setDepth(D.player + 1);
    this.pTorso = scene.add.image(0, 0, TX.ring).setDepth(D.player + 2);
    this.pBody = scene.add.image(0, 0, TX.px).setDepth(D.player + 3);
    this.pPack = scene.add.image(0, 0, TX.px).setDepth(D.player + 4);
    this.pHead = scene.add.image(0, 0, TX.px).setDepth(D.player + 5);
    this.hands = (art.manifest.characterInfo && art.manifest.characterInfo.player && art.manifest.characterInfo.player.handsPerFrame) || {};
    this.hpBars = scene.add.graphics().setDepth(D.litFx);
    for (let i = 0; i < 32; i++) this.burning.push({ x: 0, y: 0 });
    this.allParts = [this.pShadow, this.pLegs, this.pWeapon, this.pTorso, this.pBody, this.pPack, this.pHead];
    this.bodyParts = [this.pLegs, this.pWeapon, this.pTorso, this.pBody, this.pPack, this.pHead];
  }
  private allParts: Phaser.GameObjects.Image[] = [];
  private bodyParts: Phaser.GameObjects.Image[] = [];
  private playerParts() { return this.allParts; }

  attach() {
    for (const v of this.zv.values()) this.release(v);
    this.zv.clear();
    this.hurtT = 0;
    this.hpSeen.clear(); this.pend.clear();
  }
  hide() {
    this.hpBars.clear();
    for (const o of this.playerParts()) o.setVisible(false);
    for (const v of this.zv.values()) this.release(v);
    this.zv.clear();
    for (const t of this.tracers) t.setVisible(false);
    for (const t of this.heads) t.setVisible(false);
    this.hpSeen.clear(); this.pend.clear();
  }
  destroy() {
    this.hide();
    for (const o of this.playerParts()) o.destroy();
    for (const v of this.zfree) { v.spr.destroy(); v.shadow.destroy(); v.fire.destroy(); v.pulse.destroy(); v.flash.destroy(); }
    for (const t of this.tracers) t.destroy();
    for (const t of this.heads) t.destroy();
    this.hpBars.destroy();
  }
  onHurt() { this.hurtT = 0.16; }
  onZombieHurt(id: string) {
    const v = this.zv.get(id); if (v) v.hitT = 0.16;
    const h = this.hpSeen.get(id);
    if (!h) return;
    const d = h.hp - h.z.hp; h.hp = h.z.hp;
    const q = this.pend.get(id);
    if (q) { q.dmg += Math.max(0, d); q.n++; } else this.pend.set(id, { z: h.z, dmg: Math.max(0, d), n: 1 });
  }

  /** Emit damage numbers for the hits gathered since the last frame (one number per zombie per frame). */
  private flushHits(state: GameState) {
    if (!this.pend.size) return;
    const p = state.player;
    let base = 0;
    if (p) {
      const st = p.inv.equip[p.active];
      try { base = st ? (weaponStats(state, st.id, st.lvl).damage || 0) : 0; } catch { base = 0; }
    }
    for (const q of this.pend.values()) {
      if (q.dmg <= 0) continue;
      const per = q.dmg / q.n;
      const z = q.z;
      let kind = NumKind.Normal;
      if (this.fx.nearBlast(z.x, z.y)) kind = NumKind.Big;
      else if (z.burn > 0 && q.n === 1 && q.dmg <= 4.01) kind = NumKind.Burn;
      else if (base > 0 && per >= base * 1.9) kind = NumKind.Crit;
      this.fx.nums.spawn(z.x, z.y - z.r * 0.6, q.dmg, kind);
    }
    this.pend.clear();
  }

  // ---------------------------------------------------------------- player
  private setFrame(img: Phaser.GameObjects.Image, frame: string | null, fallback: string) {
    if (frame) {
      const atlas = this.art.atlasOf(frame)!;
      if (img.texture.key !== atlas || img.frame.name !== frame) img.setTexture(atlas, frame);
      return true;
    }
    if (img.texture.key !== fallback) img.setTexture(fallback);
    return false;
  }
  private pick(seq: string[] | null, u: number) { return seq ? seq[Math.max(0, Math.min(seq.length - 1, Math.floor(u * seq.length)))] : null; }

  drawPlayer(state: GameState, alpha: number, dt: number) {
    const p = state.player, art = this.art;
    if (!p) { for (const o of this.playerParts()) o.setVisible(false); this.fx.muzzle.ok = false; return; }
    for (const o of this.playerParts()) if (!o.visible) o.setVisible(true);
    const x = p.prevX + (p.x - p.prevX) * alpha, y = p.prevY + (p.y - p.prevY) * alpha;
    const aim = angleLerp(p.prevAngle, p.angle, alpha);
    this.px = x; this.py = y; this.pa = aim;
    const s = art.scale * p.r / DESIGN_R.player;
    const skin = (frame: string | null) => frame && characterFrame(frame, p.character,
      art.manifest.characterInfo?.playerArt === 'reference-pixel-v1', name => art.has(name));
    const sp = Math.hypot(p.vx, p.vy);
    const moving = sp > 8 && !p.dead;
    // legs: face the movement direction; walking backwards plays the cycle reversed instead of twisting 180°
    let dir = moving ? Math.atan2(p.vy, p.vx) : aim;
    let back = false;
    if (moving && Math.abs(angleDiff(dir, aim)) > 1.9) { dir += Math.PI; back = true; }
    this.legAngle = angleLerp(this.legAngle, dir, 1 - Math.exp(-(moving ? 18 : 6) * dt));
    const walk = art.seq('player_legs_walk');
    if (moving) this.legPhase += (back ? -1 : 1) * dt * 10 * (sp / 190); // 10 fps at walking speed, scales with speed
    const legIdx = walk ? ((Math.floor(this.legPhase) % walk.length) + walk.length) % walk.length : 0;
    const legsF = moving && walk ? walk[legIdx] : (art.has('player_legs_idle_0') ? 'player_legs_idle_0' : walk ? walk[0] : null);
    const hasLegs = this.setFrame(this.pLegs, skin(legsF), TX.px);
    this.pLegs.setVisible(hasLegs).setPosition(x, y).setRotation(this.legAngle).setScale(s); // art has a full stride (figureScale 1.3 baked in)

    // torso pose
    const id = playerWeaponVisual(p);
    const cls: WeaponClass = id ? weaponClass(id) : 'unarmed';
    const pose = POSE[cls] || 'unarmed';
    let seqKey = `player_torso_${pose}_idle`, u = 0;
    const sinceShot = state.time - p.lastShotT;
    if (p.reloadTimer > 0 && (pose === 'handgun' || pose === 'long')) { seqKey = `player_torso_${pose}_reload`; u = 1 - p.reloadTimer / Math.max(0.01, p.reloadTotal); }
    else if (p.swingTimer > 0 && (pose === 'melee' || pose === 'unarmed')) { seqKey = pose === 'melee' ? 'player_torso_melee_swing' : 'player_torso_unarmed_punch'; u = 1 - p.swingTimer / Math.max(0.01, p.swingTotal); }
    else if (sinceShot >= 0 && sinceShot < 0.1 && (pose === 'handgun' || pose === 'long')) { seqKey = `player_torso_${pose}_shoot`; u = sinceShot / 0.1; }
    // unarmed and walking: arms counter-swing the legs (the walk frames are synced to the leg frames)
    if (moving && pose === 'unarmed' && seqKey === 'player_torso_unarmed_idle') {
      const uw = art.seq('player_torso_unarmed_walk');
      if (uw && walk) { seqKey = 'player_torso_unarmed_walk'; u = (legIdx + 0.5) / walk.length; } // same index also when walking backwards (legs rotated 180deg = same foot layout)
    }
    let torsoF = this.pick(art.seq(seqKey), u);
    if (!torsoF) torsoF = this.pick(art.seq(`player_torso_${pose}_idle`), 0) || this.pick(art.seq('player_torso_unarmed_idle'), 0);
    const hand: Hand = (torsoF && this.hands[torsoF]) || { hand: [16, 1], weaponAngle: 0, torsoYaw: 0 };
    // walking sway + recoil kick
    if (moving) this.swayPhase += dt * 10 * (sp / 190);
    const sway = moving ? Math.sin(this.swayPhase * Math.PI / 4) * 0.045 * Math.min(1, sp / 190) : 0;
    const kick = sinceShot >= 0 && sinceShot < 0.12 ? (1 - sinceShot / 0.12) * (cls === 'shotgun' ? 4 : cls === 'handgun' ? 2 : 2.6) : 0;
    const ca = Math.cos(aim), sa = Math.sin(aim);
    const tx = x - ca * kick, ty = y - sa * kick;
    // torso bob: from above, the shoulders rising and falling with each step reads as a tiny scale pulse
    const bob = moving ? 1 + 0.018 * Math.abs(Math.sin(this.legPhase * Math.PI / 4)) * Math.min(1, sp / 190) : 1;
    const hasTorso = this.setFrame(this.pTorso, skin(torsoF), TX.ring);
    this.pTorso.setPosition(tx, ty).setRotation(aim + sway).setScale(hasTorso ? s * bob : p.r / 52);
    if (!hasTorso) this.pTorso.setTint(0xc8b89a);
    // weapon in hand (origin = grip)
    const spraying = id === 'cola_mints' && p.reloadTimer <= 0 && sinceShot >= 0 && sinceShot < 0.1;
    const look = id && lookOf(id), baseWeapon = look && art.has('weapon_' + look) ? 'weapon_' + look : null;
    const wf = spraying && art.has('weapon_cola_mints_spray') ? 'weapon_cola_mints_spray' : baseWeapon;
    const meta = wf ? art.sprite(wf) : null;
    const hx = hand.hand[0] * (p.r / 14), hy = hand.hand[1] * (p.r / 14);
    const wa = aim + sway + (hand.weaponAngle || 0);
    const wx = tx + ca * hx - sa * hy, wy = ty + sa * hx + ca * hy;
    this.handX = wx; this.handY = wy;
    if (wf && cls !== 'unarmed') {
      this.setFrame(this.pWeapon, wf, TX.px);
      const o = (meta && meta.origin) || [0.3, 0.5];
      this.pWeapon.setVisible(true).setOrigin(o[0], o[1]).setPosition(wx, wy).setRotation(wa).setScale(s);
    } else if (id && cls !== 'unarmed' && !art.has('player_torso_handgun_idle_0')) {
      this.pWeapon.setTexture(TX.px).setVisible(true).setOrigin(0, 0.5).setPosition(wx, wy).setRotation(wa).setDisplaySize(cls === 'handgun' ? 14 : 28, 4).setTint(0x222222);
    } else this.pWeapon.setVisible(false);
    // muzzle (for flashes): weapon origin + rotate(muzzle - grip)
    if (meta && meta.muzzle && meta.grip) {
      const mx = (meta.muzzle[0] - meta.grip[0]) * (p.r / 14), my = (meta.muzzle[1] - meta.grip[1]) * (p.r / 14);
      const cw = Math.cos(wa), sw = Math.sin(wa);
      this.fx.muzzle.x = p.x + (wx - x) + cw * mx - sw * my; this.fx.muzzle.y = p.y + (wy - y) + sw * mx + cw * my; this.fx.muzzle.ok = true;
    } else { this.fx.muzzle.x = p.x + ca * (p.r + 18); this.fx.muzzle.y = p.y + sa * (p.r + 18); this.fx.muzzle.ok = true; }
    // overlays
    const yaw = aim + sway + (hand.torsoYaw || 0);
    const eq = p.inv.equip;
    // overlays: prefer the version fitted to this exact torso frame (`<overlay>@<pose>_<i>`, 3D art), else the generic one
    const pose4 = torsoF && torsoF.startsWith('player_torso_') ? '@' + torsoF.slice(13) : '';
    const ov = (base: string) => (pose4 && art.has(base + pose4) ? base + pose4 : art.has(base) ? base : null);
    const bodyF = eq.body ? ov('armor_body_' + eq.body.id) : null;
    const packF = eq.back ? ov('backpack_' + eq.back.id) : null;
    const headF = eq.head ? ov('armor_head_' + eq.head.id) : null;
    const os = hasTorso ? s * bob : s;
    this.pBody.setVisible(!!bodyF); if (bodyF) { this.setFrame(this.pBody, bodyF, TX.px); this.pBody.setPosition(tx, ty).setRotation(yaw).setScale(os); }
    this.pPack.setVisible(!!packF); if (packF) { this.setFrame(this.pPack, packF, TX.px); this.pPack.setPosition(tx, ty).setRotation(yaw).setScale(os); }
    this.pHead.setVisible(!!headF); if (headF) { this.setFrame(this.pHead, headF, TX.px); this.pHead.setPosition(tx, ty).setRotation(headF.includes('@') ? yaw : aim + sway).setScale(os); }
    this.pShadow.setPosition(x + 3, y + 4).setScale((p.r * 2.6) / 128);
    // dust motes in the beam when it is dark enough for the beam to read
    if (!p.dead && p.flashlight !== false) this.fx.motes(x, y, aim, Math.min(1, Math.max(0, (darkness(state) - 0.45) / 0.35)), dt);
    // low-hp heartbeat on the screen edges (post fx)
    const hpf = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    this.fx.post.lowHp = !p.dead && hpf < 0.3 ? Math.min(1, (0.3 - hpf) / 0.2 + 0.25) : 0;
    // hurt flash (subtle) + invulnerability blink
    this.hurtT = Math.max(0, this.hurtT - dt);
    const blink = p.invuln > 0 && Math.floor(state.time * 14) % 2 === 0 ? 0.55 : 1;
    const parts = this.bodyParts;
    for (const o of parts) {
      if (this.hurtT > 0) o.setTint(0xff9a90); else if (o !== this.pTorso || hasTorso) o.clearTint();
      o.setAlpha(p.dead ? 0.85 : blink);
    }
  }

  // ---------------------------------------------------------------- zombies
  private acquire(z: Zombie): ZV {
    let v = this.zfree.pop();
    if (!v) {
      v = {
        spr: this.scene.add.image(0, 0, TX.ring).setDepth(D.zombie), shadow: this.scene.add.image(0, 0, TX.blob).setDepth(D.shadow).setAlpha(0.5),
        fire: this.scene.add.image(0, 0, TX.px).setDepth(D.glow).setBlendMode(Phaser.BlendModes.ADD),
        pulse: this.scene.add.image(0, 0, TX.px).setDepth(D.zombieOver).setBlendMode(Phaser.BlendModes.ADD),
        flash: this.scene.add.image(0, 0, TX.px).setDepth(D.glow).setBlendMode(Phaser.BlendModes.ADD).setTintMode(Phaser.TintModes.FILL).setTint(0xffffff),
        stamp: 0, phase: 0, hitT: 0, key: '', walk: null, attack: null, hit: null, climb: null, pulseF: null, atlas: '', special: null, designR: 0, fps: 0,
      };
    }
    const bug = isHiveType(z.type), pre = bug ? hivePrefix(z.type) : `zombie_${z.type}_${z.variant}_`;
    v.key = pre;
    v.special = bug ? this.art.seq(pre + 'special') : null; v.designR = bug ? hiveDesignR(this.art, z.type) : 0; v.fps = bug ? 12 : 0;
    v.walk = this.art.seq(pre + 'walk') || this.art.seq(`zombie_${z.type}_0_walk`);
    v.attack = this.art.seq(pre + 'attack');
    v.hit = this.art.seq(pre + 'hit');
    v.climb = this.art.seq(pre + 'climb');
    v.pulseF = z.type === 'bloater' ? this.art.seq(pre + 'pulse') : null;
    v.atlas = v.walk ? this.art.atlasOf(v.walk[0])! : '';
    v.phase = (hash2(z.id.length, z.id.charCodeAt(z.id.length - 1) | 0, 5) % 8) + Math.random() * 8;
    v.hitT = 0;
    v.spr.setVisible(true).setAlpha(1).clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    if (v.walk) v.spr.setTexture(v.atlas, v.walk[0]); else v.spr.setTexture(TX.ring).setTint(FALLBACK_TINT[z.type] ?? 0x6b8f4e);
    v.shadow.setVisible(true);
    v.fire.setVisible(false); v.pulse.setVisible(false); v.flash.setVisible(false);
    return v;
  }
  private release(v: ZV) {
    v.spr.setVisible(false); v.shadow.setVisible(false); v.fire.setVisible(false); v.pulse.setVisible(false); v.flash.setVisible(false);
    this.zfree.push(v);
  }

  drawZombies(state: GameState, alpha: number, dt: number, view: View) {
    const st = ++this.stamp, art = this.art, s = art.scale;
    this.state = state;
    this.flushHits(state);
    this.nBurning = 0;
    const fire = art.seq('fire');
    const hb = this.hpBars;
    hb.clear();
    for (const z of state.zombies) {
      if (z.dead) continue;
      const x = z.prevX + (z.x - z.prevX) * alpha, y = z.prevY + (z.y - z.prevY) * alpha;
      if (!inView(view, x, y, z.r * 3 + 40)) continue;
      let v = this.zv.get(z.id);
      if (!v) { v = this.acquire(z); this.zv.set(z.id, v); }
      v.stamp = st;
      const hs = this.hpSeen.get(z.id);
      if (hs) { hs.seen = st; hs.z = z; } else this.hpSeen.set(z.id, { z, hp: z.hp, seen: st });
      if (z.boss) { v.spr.setVisible(false); v.shadow.setVisible(false); v.fire.setVisible(false); v.flash.setVisible(false); continue; }   // drawn by render/bosses.ts
      const climbing = state.mode === 'road' && z.windowClimb && v.climb ? z.windowClimb : null;
      const ang = climbing ? (climbing.axis === 'x' ? (climbing.direction > 0 ? 0 : Math.PI) : climbing.direction > 0 ? Math.PI / 2 : -Math.PI / 2) : angleLerp(z.prevAngle, z.angle, alpha);
      const t = TYPES[z.type] || TYPES.walker;
      let sc = s * z.r / (v.designR || DESIGN_R[z.type] || 15);
      const spd = Math.hypot(z.vx, z.vy);
      const fps = v.fps || (art.manifest.characterInfo?.zombies?.[z.type]?.walkFrameRate) || 8;
      const fixture = z.type === 'burrow' || z.type === 'egg', bug = z as Bug;
      // distance-driven gait: frame rate scales with actual speed (|v| / nominal speed)
      if (spd > 2) v.phase += dt * fps * Math.min(2.2, Math.max(0.35, spd / t.speed));
      v.hitT = Math.max(0, v.hitT - dt);
      let f: string | null = null;
      if (climbing && v.climb) f = v.climb[Math.min(v.climb.length - 1, Math.floor(climbing.progress * v.climb.length))];
      else if (z.attackT < 0.5 && v.attack) f = v.attack[Math.min(v.attack.length - 1, Math.floor((z.attackT / 0.5) * v.attack.length))];
      else if (v.hitT > 0.06 && v.hit) f = v.hit[Math.min(v.hit.length - 1, Math.floor(((0.16 - v.hitT) / 0.1) * v.hit.length))];
      else if (spd <= 2 && v.pulseF) f = v.pulseF[Math.floor(state.time * 6 + v.phase) % v.pulseF.length]; // idle bloater: pustules throb
      else if (v.walk) f = v.walk[Math.floor(v.phase) % v.walk.length];
      // The Hive Below: each sheet's `special` row is the creature's own moment
      if (v.special && !(z.attackT < 0.5) && !(v.hitT > 0.06)) {
        const sp = v.special, at = (k: number) => sp[Math.max(0, Math.min(sp.length - 1, Math.floor(k * sp.length)))];
        if (z.type === 'burrow') { if ((bug.eruptT ?? 99) < 0.7) f = at((bug.eruptT ?? 0) / 0.7 * 2 % 1); }          // a column is climbing out
        else if (z.type === 'egg') { if ((bug.hatchT ?? 0) > 0) f = at((bug.hatchT ?? 0) / HATCH_TIME); }              // about to hatch
        else if (z.type === 'honeypot') { if (spd <= 2) f = sp[Math.floor(state.time * 4 + v.phase) % sp.length]; }      // standing: the honey sloshes
        else if (z.type === 'grub') { if ((bug.age ?? 0) > GRUB_GROWS - 1.2) f = at(((bug.age ?? 0) - (GRUB_GROWS - 1.2)) / 1.2); }   // about to grow up
        else if (z.type === 'drone') { if ((bug.alarm ?? 0) > ALARM_TIME - 0.5 && !z.horde) f = at((ALARM_TIME - (bug.alarm ?? 0)) / 0.5); }   // it has just been marked: antennae up
        // the cells beyond the Warrens: sim/hive-bugs.ts says how far through its own moment the creature is (a leap, a scream, a spray, a charge, a lunge)
        else if (typeof (bug as HBug).sp === 'number' && (bug as HBug).sp! >= 0) f = at((bug as HBug).sp!);
      }
      // Fixtures share each cell's authored wall material. Size against painted bounds so
      // a large source canvas never makes a burrow or egg nursery larger than its hit area.
      if (fixture && state.road?.world.hive) {
        const hf = isQueenConduit(z) ? queenConduitFrame(z, state.time) : hiveMaterial(hiveMaterialZone(state.road.world.hive, z.x, z.y), z.type);
        if (art.has(hf)) {
          f = hf;
          const b = art.manifest.hiveEnvironment.frames[hf].bounds;
          const pulse = z.type === 'egg' && (bug.hatchT ?? 0) > 0 ? 1 + .035 * Math.sin(state.time * 24) : z.type === 'burrow' && (bug.eruptT ?? 99) < .7 ? 1 + .025 * Math.sin(state.time * 30) : 1;
          sc = z.r * 3 / Math.max(b.w, b.h) * pulse;
        }
      }
      const spr = v.spr;
      // hit pop: a quick squash-and-stretch on impact
      const pop = v.hitT > 0.08 ? 1 + (v.hitT - 0.08) * 1.6 : 1;
      if (f) { if (spr.frame.name !== f) spr.setTexture(art.atlasOf(f)!, f); spr.setScale(sc * pop); }
      else spr.setScale((z.r / 52) * pop);
      // shamble: tiny lateral body sway on top of the frames
      const wob = f && !climbing && !fixture ? Math.sin(v.phase * 0.8) * 0.05 : 0;
      // a Hopper in mid-leap and anything on the wing are drawn off the floor; a Lurker against the rock is almost not there
      const up = bug ? Number((z as HBug).lift) || 0 : 0, seen = typeof (z as HBug).alpha === 'number' ? Math.max(0, Math.min(1, (z as HBug).alpha!)) : 1;
      if (up > 0 && f) spr.setScale(spr.scaleX * (1 + 0.28 * up));
      spr.setPosition(x, y - up * 22).setRotation(ang + wob).setAlpha(seen);
      v.shadow.setAlpha(0.5 * seen);
      if (fixture) { spr.setDepth(D.floorObj); v.shadow.setVisible(false); } else if (spr.depth !== D.zombie) { spr.setDepth(D.zombie); v.shadow.setVisible(true); }
      if (v.hitT > 0.09) spr.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);
      else if (v.hitT > 0) spr.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xff7a70);
      else if (Number(z.sticky) > 0) spr.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xb8835a);   // Cola & Mints foam
      else if (Number(z.corro) > 0) spr.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xb9e36a);    // formic acid eating in
      else if (spr.tintMode !== Phaser.TintModes.MULTIPLY || (f && spr.isTinted)) { spr.setTintMode(Phaser.TintModes.MULTIPLY); if (f) spr.clearTint(); }
      // emissive white silhouette (above the darkness), fading over the flash window
      if (v.hitT > 0.04 && f) {
        const fl = v.flash;
        if (fl.texture.key !== spr.texture.key || fl.frame.name !== f) fl.setTexture(spr.texture.key, f);
        fl.setVisible(true).setPosition(x, y).setRotation(ang + wob).setScale(spr.scaleX).setAlpha(Math.min(1, (v.hitT - 0.04) / 0.12) * 0.4);
      } else if (v.flash.visible) v.flash.setVisible(false);
      v.shadow.setPosition(x + 3, y + 4).setScale((z.r * 2.7) / 128);
      // health bar once damaged (as in the prototype): dark backing, red->yellow->green fill
      if ((isQueenConduit(z) || z.hp < z.maxHp) && z.hp > 0) {
        const f = Math.max(0, Math.min(1, z.hp / z.maxHp)), bw = Math.max(26, z.r * 2.2), bh = 4;
        const bx = x - bw / 2, by = y - z.r - 14;
        hb.fillStyle(0x000000, 0.7).fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        hb.fillStyle(f > 0.6 ? 0x6fcf4a : f > 0.3 ? 0xe0c040 : 0xd8402c, 1).fillRect(bx, by, bw * f, bh);
      }
      // burning
      if (z.burn > 0) {
        if (fire) { const ff = fire[Math.floor(state.time * 12 + v.phase) % fire.length]; v.fire.setTexture(art.atlasOf(ff)!, ff).setScale(s * z.r / 16).setOrigin(0.5, 0.7); }
        else v.fire.setTexture(TX.soft).setScale(z.r / 60).setTint(0xff8030);
        v.fire.setVisible(true).setPosition(x, y).setRotation(0).setAlpha(0.9);
        if (this.nBurning < this.burning.length) { const b = this.burning[this.nBurning++]; b.x = x; b.y = y; }
        this.fx.burnFx(x, y, z.r, dt);
        this.fx.post.glow(x, y, z.r * 2.4, 0xff7a28, 0.42 + 0.1 * Math.sin(state.time * 19 + v.phase));
      } else if (v.fire.visible) v.fire.setVisible(false);
    }
    for (const [id, v] of this.zv) if (v.stamp !== st) { this.release(v); this.zv.delete(id); }
    // forget hp of zombies long out of view (kept a while so a kill right after leaving view still counts)
    if ((st & 63) === 0) for (const [id, h] of this.hpSeen) if (st - h.seen > 120 || (h.z.dead && st - h.seen > 2)) this.hpSeen.delete(id);
  }

  // ---------------------------------------------------------------- bullets
  drawBullets(state: GameState, alpha: number, view: View, offsetX=0, offsetY=0) {
    const art = this.art, has = art.has('bullet_tracer');
    let n = 0, nf = 0;
    for (const b of state.bullets) {
      if (b.dead) continue;
      const x = b.prevX + (b.x - b.prevX) * alpha+offsetX, y = b.prevY + (b.y - b.prevY) * alpha+offsetY;
      if (!inView(view, x, y, 80)) continue;
      if (b.corrode) {   // Formic Sprayer: a stream of green acid, droplets that fatten as they fly
        let f = this.foam[nf];
        if (!f) { f = this.scene.add.image(0, 0, TX.soft).setDepth(D.player + 4); this.foam.push(f); }
        nf++;
        const k = Math.max(0, Math.min(1, 1 - b.life / 0.43));
        f.setTexture(TX.drop).setTint((nf & 1) ? 0xb7e04a : 0xd4ef89).setScale(0.13 + 0.15 * k, 0.1 + 0.1 * k);
        f.setVisible(true).setPosition(x, y).setRotation(Math.atan2(b.vy, b.vx)).setAlpha(0.95 - k * 0.3);
        this.fx.post.glow(x, y, 12, 0xb7e04a, 0.28);
        continue;
      }
      if (b.sticky) {   // Cola & Mints: brown foam blobs that swell as they fly
        let f = this.foam[nf];
        if (!f) { f = this.scene.add.image(0, 0, TX.soft).setDepth(D.player + 4); this.foam.push(f); }
        nf++;
        const k = Math.max(0, Math.min(1, 1 - b.life / 0.6));
        const frames = art.seq('cola_foam');
        if (frames) {
          const frame = frames[(Math.floor(k * 8) + nf) % frames.length];
          f.setTexture(art.atlasOf(frame)!, frame).clearTint().setScale(0.35 + 0.35 * k);
        } else f.setTexture(TX.drop).setScale(0.12 + 0.12 * k).setTint(0xc2a477);
        f.setVisible(true).setPosition(x, y).setRotation(Math.atan2(b.vy, b.vx)).setAlpha(1 - k * 0.25);
        continue;
      }
      let img = this.tracers[n];
      if (!img) {
        img = this.scene.add.image(0, 0, TX.spark).setDepth(D.glow).setBlendMode(Phaser.BlendModes.ADD);
        if (has) img.setTexture(art.atlasOf('bullet_tracer')!, 'bullet_tracer');
        img.setOrigin(1, 0.5);
        this.tracers.push(img);
      }
      n++;
      const sp = Math.hypot(b.vx, b.vy);
      const len = Math.min(70, sp * 0.03);
      img.setVisible(true).setPosition(x, y).setRotation(Math.atan2(b.vy, b.vx));
      img.setScale(len / img.frame.width, has ? art.scale * 0.9 : 0.35);
      const col = hexColor(b.color, 0xffe9a8);
      img.setTint(col).setAlpha(0.95);
      // glowing head: small hot core (the bloom pass turns it into a halo)
      let hd = this.heads[n - 1];
      if (!hd) { hd = this.scene.add.image(0, 0, TX.soft).setDepth(D.glow).setBlendMode(Phaser.BlendModes.ADD); this.heads.push(hd); }
      hd.setVisible(true).setPosition(x, y).setScale(0.075, 0.055).setRotation(img.rotation).setTint(col).setAlpha(1);
      this.fx.post.glow(x, y, 16, col, 0.5);
    }
    for (let i = n; i < this.tracers.length; i++) if (this.tracers[i].visible) this.tracers[i].setVisible(false);
    for (let i = nf; i < this.foam.length; i++) if (this.foam[i].visible) this.foam[i].setVisible(false);
    for (let i = n; i < this.heads.length; i++) if (this.heads[i].visible) this.heads[i].setVisible(false);
  }
}
function angleDiff(a: number, b: number) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
