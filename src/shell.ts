// shell.ts — contracts between the game shell (GameScene) and the render / ui / audio layers.
// Owned by the orchestrator. The GameScene owns the loop:
//   input.sample() -> fixed-step sim.step() x N -> renderer.draw(alpha) -> drain state.events to all sinks -> ui.update()
import type { GameState, SimEvent, InputState } from './sim/types';
import type { CharacterId } from './characters';

export interface RendererLike {
  /** Called once per new GameState (new game / continue / arcade / respawn after reload). */
  attach(state: GameState): void;
  /** Called every rendered frame. alpha = interpolation 0..1 between prev and current sim tick. */
  draw(state: GameState, alpha: number, realDt: number): void;
  /** Sim events after each frame (fx, decals, lights, camera shake). */
  onEvent(ev: SimEvent, state: GameState): void;
  /** Screen px -> world px using the current (rendered) camera. */
  screenToWorld(sx: number, sy: number): { x: number; y: number };
  detach(): void;
}

export interface UiLike {
  /** True while a DOM overlay wants keyboard/mouse (the shell then sends neutral input to the sim). */
  capturesInput(): boolean;
  attach(state: GameState, shell: ShellApi): void;
  update(state: GameState, realDt: number): void;
  onEvent(ev: SimEvent, state: GameState): void;
  detach(): void;
}

export interface AudioLike {
  onEvent(ev: SimEvent, state: GameState): void;
  setListener(x: number, y: number): void;
  muted: boolean;
}

/** What the UI may ask the shell to do. */
export interface ShellApi {
  newSurvival(character?: CharacterId, legacyStory?: boolean): Promise<void>;
  continueSurvival(legacyStory?: boolean): Promise<boolean>;
  newArcade(character?: CharacterId): void;
  /** The Long Road linear campaign (sim/road.ts): a fresh run, or the saved checkpoint. */
  newRoad(character?: CharacterId, story?: import('./sim/road').RoadStory): void;
  continueRoad(story?: import('./sim/road').RoadStory): boolean;
  hasRoadSave(): boolean;
  openAngleLab(): void;
  /** False keeps the run attached after a failed save; force explicitly discards it. */
  quitToTitle(force?: boolean): boolean;
  hasSave(): boolean;
  /** Current input state (UI reads aim, etc. for hints). */
  input(): InputState;
  /** Toggle the in-game performance overlay / recorder. */
  togglePerf(): void;
}
