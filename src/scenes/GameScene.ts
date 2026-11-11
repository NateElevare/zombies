// GameScene — the shell. Owns the fixed-timestep loop and wires sim <-> render <-> ui <-> audio.
// Owned by the orchestrator. See ARCHITECTURE.md "Simulation loop".
import * as Phaser from 'phaser';
import { SIM_DT } from '../sim/core';
import type { GameState, InputState } from '../sim/types';
import * as game from '../sim/game';
import * as sim from '../sim';
import * as saveMod from '../sim/save';
import { newArcade, stepArcade } from '../sim/arcade';
import * as road from '../sim/road';
import { bankRun } from '../sim/augments';
import { characterId, preferredCharacter } from '../characters';
import { Input, NEUTRAL_INPUT } from '../input';
import { createRenderer } from '../render';
import { storyMovement } from '../render/story-projection';
import { isAngledStory,preferredLegacyStory } from '../story-mode';
import { createUi } from '../ui';
import { createAudio } from '../audio';
import { perf } from '../perf';
import type { AudioLike, RendererLike, ShellApi, UiLike } from '../shell';
import { cloud } from '../net/cloud';
import { getVfxEnabled, setVfxEnabled } from '../render/vfx-post';

const MAX_STEPS = 5;

export class GameScene extends Phaser.Scene {
  state: GameState | null = null;
  input2!: Input;
  renderer2!: RendererLike;
  ui!: UiLike;
  audio!: AudioLike;
  private acc = 0;
  private transition = 0;
  private lastInput: InputState = NEUTRAL_INPUT(0, 0);
  /** hit-stop: real seconds the sim stays frozen after a big impact (render keeps running), + cooldown */
  private hitStop = 0; private hitStopCd = 0;

  constructor() { super('Game'); }

  create() {
    this.input2 = new Input(this.game.canvas);
    this.renderer2 = createRenderer(this);
    this.audio = createAudio();
    this.ui = createUi();
    this.ui.attach(null as unknown as GameState, this.api); // title screen (no state yet)
    perf.attach(this.game);
    void cloud.init();
    (window as any).deadzone = { scene: this, perf, sim, vfx: { get: getVfxEnabled, set: setVfxEnabled } }; // debug handle (console + automated tests)
  }

  // ------------------------------------------------------------------ shell API for the UI
  readonly api: ShellApi = {
    openAngleLab: () => {
      if (this.state) return;
      ++this.transition; this.input2.reset(); this.ui.detach();
      this.scene.launch('AngleLab'); this.scene.pause();
    },
    newSurvival: async (character = preferredCharacter(), legacyStory = preferredLegacyStory()) => {
      const token = ++this.transition;
      await cloud.clearSurvival().catch(() => {});
      if (token === this.transition) {
        const state=game.newGame(undefined, characterId(character));state.legacyStory=legacyStory;
        this.start(state);
      }
    },
    continueSurvival: async (legacyStory = preferredLegacyStory()) => {
      const token = ++this.transition;
      await cloud.pullSurvival();
      if (token !== this.transition) return false;
      const s = game.continueGame(); if (!s) return false;
      s.legacyStory=legacyStory;this.start(s); return true;
    },
    newArcade: (character = preferredCharacter()) => {
      const state = newArcade(); state.player.character = characterId(character); this.start(state);
    },
    newRoad: (character = preferredCharacter(), story = 'long-road') => {
      const s = story === 'group-in-need' ? road.newGroupInNeed() : story === 'hive-below' ? road.newHiveBelow() : road.newRoad(characterId(character));
      if (!s) throw new Error(story === 'hive-below' ? 'Complete A group in need to start The Hive Below.' : 'Complete The Long Road to start A group in need.');
      this.start(s);
    },
    continueRoad: (story = 'long-road') => { const s = road.continueRoad(story); if (!s) return false; this.start(s); return true; },
    hasRoadSave: () => road.hasRoadSave(),
    quitToTitle: (force = false) => {
      ++this.transition;
      if (!force && this.state?.mode === 'survival') {
        if (!game.save(this.state)) { game.setUi(this.state, 'pause'); return false; }
        cloud.onSaved(this.state);
      }
      if (this.state?.mode === 'arcade') bankRun(this.state);   // quitting mid-run still pays out
      if (this.state?.mode === 'road' && this.state.road) road.save(this.state);   // the checkpoint is what is saved
      void cloud.flush();
      this.stop();
      this.ui.attach(null as unknown as GameState, this.api);
      return true;
    },
    hasSave: () => saveMod.has(),
    input: () => this.lastInput,
    togglePerf: () => perf.toggleOverlay(),
  };

  private start(state: GameState) {
    ++this.transition;
    this.stop();
    this.state = state;
    this.acc = 0; this.hitStop = 0; this.hitStopCd = 0;
    this.input2.reset();
    this.renderer2.attach(state);
    this.ui.attach(state, this.api);
    perf.mark('start:' + state.mode);
  }
  private stop() {
    if (!this.state) return;
    this.renderer2.detach();
    this.ui.detach();
    this.state = null;
  }

  private simRunning(s: GameState) {
    return s.screen === 'playing' && !s.paused && (s.ui === null || s.ui === 'build');
  }

  override update(_time: number, deltaMs: number) {
    perf.frameBegin(deltaMs);
    const realDt = Math.min(deltaMs / 1000, 0.25);
    const s = this.state;
    if (!s) { this.ui.update(null as unknown as GameState, realDt); perf.frameEnd(); return; }

    // ---- input
    const blocked = this.ui.capturesInput();
    this.input2.blocked = blocked;
    this.input2.buildMode = s.ui === 'build';
    const aim = this.renderer2.screenToWorld(this.input2.mouseX, this.input2.mouseY);

    // ---- fixed-step simulation
    const t0 = performance.now();
    this.hitStopCd = Math.max(0, this.hitStopCd - realDt);
    if (this.hitStop > 0) this.hitStop = Math.max(0, this.hitStop - realDt);
    else this.acc += realDt;
    let steps = 0;
    const step = s.mode === 'arcade' ? stepArcade : s.mode === 'road' ? road.stepRoad : game.step;
    while (this.acc >= SIM_DT && steps < MAX_STEPS) {
      const inp = blocked ? NEUTRAL_INPUT(aim.x, aim.y) : this.input2.sample(aim.x, aim.y);
      if(isAngledStory(s)) { const m=storyMovement(inp.moveX,inp.moveY); inp.moveX=m.x;inp.moveY=m.y; }
      this.lastInput = inp;
      step(s, inp, SIM_DT);
      this.input2.consume();
      this.acc -= SIM_DT;
      steps++;
      if (this.state !== s) break; // a step may end the run (quit)
    }
    if (steps === MAX_STEPS && this.acc > SIM_DT) { perf.mark('sim-catchup-dropped'); this.acc = 0; }
    const t1 = performance.now();

    // ---- render (interpolated)
    const alpha = this.simRunning(s) ? Math.min(1, this.acc / SIM_DT) : 1;
    this.renderer2.draw(s, alpha, realDt);
    const t2 = performance.now();

    // ---- events -> sinks
    if (s.events.length) {
      for (const ev of s.events) {
        if (ev.t === 'saved' && ev.ok) cloud.onSaved(s);
        if ((ev.t === 'explosion' || (ev.t === 'zombieKilled' && ev.type === 'brute')) && this.hitStopCd <= 0) {
          this.hitStop = ev.t === 'explosion' ? 0.06 : 0.04; this.hitStopCd = 0.4;
        }
        if (ev.t === 'playerDied' && s.mode === 'arcade' && s.arcade) void cloud.submitArcadeBest(s.arcade.best);
        try { this.renderer2.onEvent(ev, s); } catch (e) { console.error('render event', ev, e); }
        try { this.audio.onEvent(ev, s); } catch (e) { console.error('audio event', ev, e); }
        try { this.ui.onEvent(ev, s); } catch (e) { console.error('ui event', ev, e); }
      }
      s.events.length = 0;
    }
    if (s.player) this.audio.setListener(s.player.x, s.player.y);
    this.ui.update(s, realDt);
    const t3 = performance.now();
    perf.frameEnd({ steps, sim: t1 - t0, render: t2 - t1, ui: t3 - t2, state: s });
  }
}
