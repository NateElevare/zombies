// render/index.ts — the Phaser renderer for DEAD ZONE (implements RendererLike from shell.ts).
//   art.ts        manifest lookup + procedural utility/fallback textures
//   ground.ts     chunked DynamicTexture ground with static solids baked in (lazy, 1/frame, LRU)
//   worldobjs.ts  trees, roofs (fade), container marks, structures, drops, interact outline, build ghost, crosshair
//   actors.ts     player (legs/torso/weapon/overlays), zombies (walk/attack/hit, burning), tracers
//   fx.ts         particles, decals (blood, scorch, corpses), death anims, timed lights, shake impulses
//   lighting.ts   lightmap: flashlight cone with wall shadow volumes, ambient, point lights, MULTIPLY composite
// The renderer owns the camera: exponential follow of the interpolated player + mouse look-ahead + shake.
import * as Phaser from 'phaser';
import type { GameState, SimEvent } from '../sim/types';
import type { RendererLike } from '../shell';
import { Art } from './art';
import { Ground } from './ground';
import { WorldObjs } from './worldobjs';
import { Actors } from './actors';
import { Fx } from './fx';
import { Lighting } from './lighting';
import { Gadgets } from './gadgets';
import { BossRender } from './bosses';
import type { View } from './common';
import { StoryView } from './story-view';
import { storyProject, storyUnproject, storyBounds, STORY_ZOOM, storyEffectOffset } from './story-projection';
import { isAngledStory } from '../story-mode';
import { RoadRender } from './road';
import { HiveRender } from './hive';

class Renderer implements RendererLike {
  private road: RoadRender;
  private hive: HiveRender;
  private story: StoryView;
  private angled = false;
  private projectedView = {x:0,y:0,w:0,h:0,zoom:1};
  private scene: Phaser.Scene;
  private art: Art;
  private ground: Ground;
  private objs: WorldObjs;
  private actors: Actors;
  private fx: Fx;
  private light: Lighting;
  private gadgets: Gadgets;
  private bosses: BossRender;
  private state: GameState | null = null;
  private first = true;
  private camX = 0; private camY = 0;
  private shake = 0; private lastStateShake = 0;
  private view: View = { x: 0, y: 0, w: 0, h: 0, zoom: 1 };
  private out = { x: 0, y: 0 };
  private mouseW = { x: 0, y: 0 };
  private mouseS = { x: 0, y: 0 };
  private time = 0;
  /** render-internal timings for the probe (ms) */
  slowLog: string[] = [];
  stats = { ground: 0, objs: 0, actors: 0, fx: 0, light: 0, chunks: 0 };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.art = new Art(scene);
    this.ground = new Ground(scene, this.art);
    this.fx = new Fx(scene, this.art);
    this.objs = new WorldObjs(scene, this.art);
    this.actors = new Actors(scene, this.art, this.fx);
    this.light = new Lighting(scene);
    this.gadgets = new Gadgets(scene);
    this.bosses = new BossRender(scene, this.art);
    this.story = new StoryView(scene,this.art);
    this.road = new RoadRender(scene);
    this.hive = new HiveRender(scene, this.art);
    this.light.setVisible(false);
    (window as any).__render = this;
    this.warmUp();
  }

  /** Upload every atlas and compile the stamp/tile/nine-slice/graphics programs now (title screen),
   *  so the first in-game chunk builds don't hitch on driver work. */
  private warmUp() {
    try {
      const dt = this.scene.textures.addDynamicTexture('rz_warm', 32, 32)!;
      for (const a of this.art.manifest.atlases || []) {
        if (!this.scene.textures.exists(a)) continue;
        const names = this.scene.textures.get(a).getFrameNames();
        if (!names.length) continue;
        dt.stamp(a, names[0], 16, 16, { scale: 0.05 });
        dt.repeat(a, names[0], 0, 0, 8, 8, { tileScaleX: 0.5, tileScaleY: 0.5 } as any);
        const ns = new Phaser.GameObjects.NineSlice(this.scene, 16, 16, a, names[0], 32, 32, 4, 4, 4, 4);
        dt.draw(ns); dt.render(); ns.destroy();
      }
      const g = this.scene.make.graphics({}, false);
      g.fillStyle(0xffffff, 1).fillTriangle(0, 0, 8, 0, 0, 8).fillEllipse(8, 8, 6, 4).lineStyle(1, 0xffffff, 1).strokeRect(1, 1, 4, 4);
      dt.draw(g); dt.render(); g.destroy();
      dt.destroy();
    } catch (e) { console.warn('[render] warm-up failed', e); }
  }

  attach(state: GameState) {
    this.angled=isAngledStory(state);this.art.story=this.angled;
    this.story.configure(this.angled);
    this.ground.angled=this.angled;this.objs.angled=this.angled;
    this.state = state;
    this.first = true;
    this.ground.attach(state);
    this.objs.attach();
    this.actors.attach();
    this.fx.clear();
    this.gadgets.clear(); this.bosses.clear();
    this.shake = 0; this.lastStateShake = state.shake || 0;
    const p = state.player;
    if (p) { this.camX = p.x; this.camY = p.y; }
    this.light.setVisible(true);
  }
  detach() {
    this.road.clear(); this.hive.clear();
    this.story.clear();
    this.state = null;
    this.ground.detach();
    this.objs.hide();
    this.actors.hide();
    this.fx.clear();
    this.gadgets.clear(); this.bosses.clear();
    this.light.setVisible(false);
  }

  private zoom() {
    // ~720 world px of vertical view: characters read clearly, ~1.25x on a 900px-tall window
    const sc = this.scene.scale, short = Math.min(sc.width, sc.height);
    return Math.max(0.9, Math.min(1.6, short / 720));
  }

  private mouseScreen(): { x: number; y: number } | null {
    const inp = (this.scene as any).input2, o = this.mouseS;
    if (inp && typeof inp.mouseX === 'number') { o.x = inp.mouseX; o.y = inp.mouseY; return o; }
    const ptr = this.scene.input && this.scene.input.activePointer;
    if (!ptr) return null;
    o.x = ptr.x; o.y = ptr.y; return o;
  }

  draw(state: GameState, alpha: number, realDt: number) {
    if (state !== this.state) this.attach(state);
    const cam = this.scene.cameras.main;
    const dt = Math.min(0.1, Math.max(0, realDt));
    this.time += dt;
    const p = state.player;
    const zoom = this.angled?STORY_ZOOM:this.zoom();
    if (cam.zoom !== zoom) cam.setZoom(zoom);
    const vw = cam.width / zoom, vh = cam.height / zoom;

    // ---- camera: follow interpolated player + look-ahead toward the mouse, exponential smoothing
    const t0 = performance.now();
    let tx = this.camX, ty = this.camY;
    if (p) {
      const x = p.prevX + (p.x - p.prevX) * alpha, y = p.prevY + (p.y - p.prevY) * alpha;
      tx = x; ty = y;
      if(this.angled){const q=storyProject({x,y});tx=q.x;ty=q.y;}
      const m = this.mouseScreen();
      if (m && !p.dead) {
        const mx = (m.x - cam.width / 2) / zoom, my = (m.y - cam.height / 2) / zoom;
        const la = 0.22;
        tx += Math.max(-vw * 0.2, Math.min(vw * 0.2, mx * la));
        ty += Math.max(-vh * 0.2, Math.min(vh * 0.2, my * la));
      }
    }
    if (this.first) { this.camX = tx; this.camY = ty; }
    else {
      const k = 1 - Math.exp(-9 * dt);
      this.camX += (tx - this.camX) * k; this.camY += (ty - this.camY) * k;
    }
    // ---- shake: from fx events and from increases of state.shake
    const ss = state.shake || 0;
    if (ss > this.lastStateShake + 0.01) this.shake = Math.max(this.shake, ss);
    this.lastStateShake = ss;
    this.shake = Math.max(this.shake, this.fx.shake); this.fx.shake = 0;
    this.shake = Math.min(24, this.shake) * Math.exp(-10 * dt);
    if (this.shake < 0.05) this.shake = 0;
    const sh = this.shake;
    const sx = (sh ? (Math.sin(this.time * 91) + Math.sin(this.time * 57.3) * 0.6) * sh * 0.45 : 0) + this.fx.kickX;
    const sy = (sh ? (Math.cos(this.time * 83) + Math.sin(this.time * 61.7) * 0.6) * sh * 0.45 : 0) + this.fx.kickY;
    // whole-pixel camera at zoom 1 keeps the baked ground crisp; actors stay sub-pixel smooth
    const left = Math.round((this.camX + sx - vw / 2) * zoom) / zoom, top = Math.round((this.camY + sy - vh / 2) * zoom) / zoom;
    cam.setScroll(left - (cam.width - vw) / 2, top - (cam.height - vh) / 2);
    const v = this.view; v.x = left; v.y = top; v.w = vw; v.h = vh; v.zoom = zoom;
    Object.assign(this.projectedView,v);
    if(this.angled)Object.assign(v,storyBounds(left,top,vw,vh));

    // ---- world
    const t1 = performance.now();
    this.ground.update(v, this.first);
    const t2 = performance.now();
    const m = this.mouseScreen();
    let mw: { x: number; y: number } | null = null;
    if (m) { const projected={x:left+m.x/zoom,y:top+m.y/zoom},q=this.angled?storyUnproject(projected):projected;this.mouseW.x=q.x;this.mouseW.y=q.y;mw=this.mouseW; }
    this.objs.roofLight = this.light.ambientColor; this.objs.roofLevel = this.light.ambientLevel;
    this.objs.update(state, v, dt, state.time, mw);
    const t3 = performance.now();
    this.actors.drawPlayer(state, alpha, dt);
    if(!this.angled)this.actors.drawZombies(state, alpha, dt, v);
    if(this.angled){this.actors.hide();this.actors.nBurning=0;this.story.draw(state,v,alpha,dt);const offset=storyEffectOffset(50);this.fx.muzzle.x+=offset.x;this.fx.muzzle.y+=offset.y;}
    this.actors.drawBullets(state, alpha, v,this.angled?storyEffectOffset(50).x:0,this.angled?storyEffectOffset(50).y:0);
    this.gadgets.draw(state, alpha, dt, v);
    this.bosses.draw(state, alpha, dt, v);
    this.road.draw(state, v, this.time);
    this.hive.draw(state, v, this.time);
    const t4 = performance.now();
    this.fx.simRunning = state.screen === 'playing' && !state.paused && state.ui === null;
    this.fx.update(v, dt);
    const t5 = performance.now();
    this.light.draw(state, v, this.actors.px, this.actors.py, this.actors.pa, dt, this.time, this.fx.lights,
      this.objs.fires_, this.objs.nFires, this.actors.burning, this.actors.nBurning);
    this.story.capture();
    const t6 = performance.now();
    const st = this.stats;
    st.ground = t2 - t1; st.objs = t3 - t2; st.actors = t4 - t3; st.fx = t5 - t4; st.light = t6 - t5; st.chunks = this.ground.built;
    if (t6 - t0 > 5 && this.slowLog.length < 60) this.slowLog.push([t1 - t0, st.ground, st.objs, st.actors, st.fx, st.light].map((x) => Math.round(x * 10) / 10).join('/'));
    void t0;
    this.first = false;
  }

  onEvent(ev: SimEvent, state: GameState) {
    if (!this.state) return;
    switch (ev.t) {
      case 'playerHurt': this.actors.onHurt(); break;
      case 'zombieHurt': this.actors.onZombieHurt(ev.id); break;
      case 'salvaged': this.ground.invalidate(ev.x, ev.y, ev.w, ev.h); break;
    }
    if(this.angled)this.story.event(ev);
    if(this.angled&&ev.t==='zombieKilled')this.fx.onEvent({t:'blood',x:ev.x,y:ev.y,angle:ev.angle,amount:8},state);
    else this.fx.onEvent(ev, state);
    this.gadgets.onEvent(ev);
  }

  screenToWorld(sx: number, sy: number) {
    const v = this.angled?this.projectedView:this.view;
    if (!v.w) { this.out.x = sx; this.out.y = sy; return this.out; }
    this.out.x = v.x + sx / v.zoom; this.out.y = v.y + sy / v.zoom;
    if(this.angled){const ground=storyUnproject(this.out);return this.state?this.story.aim(this.state,this.out,ground):ground;}
    return { x: this.out.x, y: this.out.y };
  }
}

export function createRenderer(scene: Phaser.Scene): RendererLike {
  return new Renderer(scene);
}
