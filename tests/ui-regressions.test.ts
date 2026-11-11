import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DomNode, memoryStorage } from './helpers/dom';
import { GameScene } from '../src/scenes/GameScene';
import { createUi } from '../src/ui';
import { Overlays } from '../src/ui/overlays';
import { Title } from '../src/ui/title';
import { cloud } from '../src/net/cloud';
import * as game from '../src/sim/game';
import * as saves from '../src/sim/save';
import * as inv from '../src/sim/inventory';
import type { ShellApi } from '../src/shell';
import type { Drop, GameState, UiName } from '../src/sim/types';
import { NEUTRAL_INPUT } from '../src/input';
import { isAngledStory } from '../src/story-mode';
import * as road from '../src/sim/road';

vi.mock('phaser', () => ({ Scene: class {} }));
vi.mock('../src/render', () => ({ createRenderer: vi.fn() }));
vi.mock('../src/perf', () => ({ perf: { mark: vi.fn() } }));
vi.mock('../src/ui/hud', () => ({ Hud: class { attach() {} detach() {} update() {} } }));
vi.mock('../src/ui/mapview', () => ({ getMapImage: vi.fn(), drawFullMap: vi.fn(), worldSize: () => ({ w: 16000, h: 16000 }) }));
vi.mock('../src/net/cloud', () => ({ cloud: {
  user: null, status: 'signed-out', error: null, on: vi.fn(() => () => {}),
  pullSurvival: vi.fn(async () => 'local'), clearSurvival: vi.fn(async () => {}),
  onSaved: vi.fn(), flush: vi.fn(async () => {}),
} }));

let root: DomNode, win: DomNode, storage: ReturnType<typeof memoryStorage>;
let frames: Map<number, FrameRequestCallback>;
beforeEach(() => {
  vi.clearAllMocks();
  root = new DomNode(); win = new DomNode('WINDOW'); storage = memoryStorage(); frames = new Map();
  vi.stubGlobal('window', win); vi.stubGlobal('innerWidth', 1280); vi.stubGlobal('innerHeight', 720);
  vi.stubGlobal('document', { body: root, getElementById: () => root,
    createElement: (tag: string) => new DomNode(tag.toUpperCase()), createElementNS: (_: string, tag: string) => new DomNode(tag.toUpperCase()) });
  vi.stubGlobal('Image', class extends DomNode {});
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('Unexpected network request'); }));
  let frame = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++frame, cb); return frame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function shell(): ShellApi {
  return { newSurvival: vi.fn(async () => {}), continueSurvival: vi.fn(async () => false), newArcade: vi.fn(), newRoad: vi.fn(), continueRoad: vi.fn(() => false), hasRoadSave: () => false, openAngleLab: vi.fn(),
    quitToTitle: vi.fn(() => true), hasSave: () => true, input: () => NEUTRAL_INPUT(0, 0), togglePerf: vi.fn() };
}
function sceneFixture() {
  const scene = new GameScene();
  scene.input2 = { reset: vi.fn() } as unknown as GameScene['input2'];
  scene.renderer2 = { attach: vi.fn(), detach: vi.fn() } as unknown as GameScene['renderer2'];
  scene.ui = createUi();
  return scene;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe('reviewed shell and UI regressions', () => {
  it('unlocks and starts the sequel from the title screen F9 testing menu without a Long Road save', async () => {
    storage.setItem('deadzone_story_tab', 'need');
    const scene = sceneFixture(); scene.ui.attach(null as unknown as GameState, scene.api);
    expect(root.all().some(n => n.textContent === 'START A GROUP IN NEED')).toBe(false);
    await win.fire('keydown', { code: 'F9', repeat: false });
    const unlock = root.button('Unlock A group in need'); Object.assign(unlock, { blur() {} });
    await unlock.fire('click');
    expect(unlock.textContent).toBe('A group in need unlocked');
    expect(road.readSave()).toBeNull();
    await root.button('START A GROUP IN NEED').fire('click');
    expect(scene.state!.road!.story).toBe('group-in-need');
    expect(scene.state!.road!.mission).toBe(0);
    expect(road.readSave()).toBeNull();
    scene.api.quitToTitle(true);
    expect(root.button('START A GROUP IN NEED')).toBeTruthy();
  });

  it('keeps both stories completed after quitting to title and continuing through the real shell', () => {
    const scene = sceneFixture(); scene.api.newRoad('scout');
    for (const story of ['long-road', 'group-in-need'] as const) {
      if (story === 'group-in-need') scene.api.newRoad(undefined, story);
      const s = scene.state!; road.startMission(s, 9); road.begin(s);
      while (s.road!.phase === 'play') road.devSkip(s);
      road.next(s); scene.api.quitToTitle(true);
      expect(road.readSave(story)!.done).toBe(true);
      expect(scene.api.continueRoad(story)).toBe(true);
      expect(scene.state!.road!.phase).toBe('ended');
      scene.api.quitToTitle(true);
      expect(road.readSave(story)!.done).toBe(true);
    }
  });
  it('unlocks the sequel from a completed Long Road, remembers its tab, and offers a separate Continue', async () => {
    storage.setItem('deadzone_story_tab', 'need');
    const api = shell(), title = new Title(root as unknown as HTMLElement); title.show(api);
    expect(root.all().some(n => n.textContent.includes('Complete The Long Road to start'))).toBe(true);
    title.hide();
    const first = road.newRoad(); road.startMission(first, 9); road.begin(first);
    while (first.road!.phase === 'play') road.devSkip(first);
    title.show(api);
    await root.button('START A GROUP IN NEED').fire('click');
    expect(api.newRoad).toHaveBeenCalledWith(undefined, 'group-in-need');
    title.hide(); road.newGroupInNeed(); title.show(api);
    await root.button('CONTINUE').fire('click');
    expect(api.continueRoad).toHaveBeenCalledWith('group-in-need');
    await root.button('START A GROUP IN NEED').fire('click');
    expect(api.newRoad).toHaveBeenCalledOnce();
    await root.button('OVERWRITE & START').fire('click');
    expect(api.newRoad).toHaveBeenCalledTimes(2);
    title.hide();
  });
  it('starts Legacy Story and can continue the same progress in the angled view',async()=>{
    const scene=sceneFixture();await scene.api.newSurvival('responder',true);
    expect(scene.state?.mode).toBe('survival');expect(scene.state?.player.character).toBe('responder');
    expect(isAngledStory(scene.state!)).toBe(false);
    const saved=scene.state!;saved.stats.kills=29;
    vi.spyOn(game,'continueGame').mockReturnValue(saved);
    expect(await scene.api.continueSurvival(false)).toBe(true);
    expect(scene.state).toBe(saved);expect(scene.state?.stats.kills).toBe(29);expect(isAngledStory(saved)).toBe(true);
    expect(isAngledStory({mode:'arcade',legacyStory:false})).toBe(false);
  });
  it('launches the Angle Lab from its menu entry without starting or clearing a run', async () => {
    const api = shell(), title = new Title(root as unknown as HTMLElement);
    storage.setItem(saves.SAVE_KEY, 'existing save'); title.show(api);
    await root.button('OPEN ANGLE LAB').fire('click');
    expect(api.openAngleLab).toHaveBeenCalledOnce(); expect(api.newArcade).not.toHaveBeenCalled(); expect(api.newSurvival).not.toHaveBeenCalled();
    expect(storage.getItem(saves.SAVE_KEY)).toBe('existing save'); expect(cloud.clearSurvival).not.toHaveBeenCalled(); title.hide();
  });
  it('keeps a failed Save & Quit attached, shows a persistent error and requires explicit discard (bug 2)', async () => {
    const scene = sceneFixture(), state = game.newGame(11);
    scene.state = state; scene.ui.attach(state, scene.api);
    const previous = storage.getItem(saves.SAVE_KEY);
    state.stats.kills = 123;
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw Error('Full'); });
    await win.fire('keydown', { code: 'Escape' });
    await root.button('SAVE & QUIT TO TITLE').fire('click');
    expect(scene.state).toBe(state); expect(state.ui).toBe('pause');
    expect(scene.renderer2.detach).not.toHaveBeenCalled(); expect(cloud.onSaved).not.toHaveBeenCalled();
    expect(storage.getItem(saves.SAVE_KEY)).toBe(previous);
    scene.ui.update(state, 1);
    expect(root.all().some(n => n.textContent.includes('Save failed'))).toBe(true);
    await root.button('QUIT WITHOUT SAVING').fire('click');
    expect(scene.state).toBe(state);
    await root.button('CONFIRM: QUIT WITHOUT SAVING').fire('click');
    expect(scene.state).toBeNull(); expect(scene.renderer2.detach).toHaveBeenCalledOnce();
  });
  it('allows retrying Save & Quit after storage recovers (bug 2)', async () => {
    const scene = sceneFixture(), state = game.newGame(12);
    scene.state = state; scene.ui.attach(state, scene.api); state.stats.kills = 7;
    const fail = vi.spyOn(storage, 'setItem').mockImplementation(() => { throw Error('Full'); });
    expect(scene.api.quitToTitle()).toBe(false); expect(scene.state).toBe(state);
    fail.mockRestore();
    expect(scene.api.quitToTitle()).toBe(true); expect(scene.state).toBeNull();
    expect(saves.read()?.stats.kills).toBe(7); expect(cloud.onSaved).toHaveBeenCalledWith(state);
  });
  it('shows failed death-screen Save & Quit on the pause screen (bug 2)', async () => {
    const scene = sceneFixture(), state = game.newGame(13);
    state.screen = 'dead'; state.player.dead = true; state.ui = 'dead';
    scene.state = state; scene.ui.attach(state, scene.api); scene.ui.update(state, 0);
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw Error('Full'); });
    await root.button('SAVE & QUIT TO TITLE').fire('click'); scene.ui.update(state, 0);
    expect(scene.state).toBe(state); expect(state.ui).toBe('pause');
    expect(root.all().some(n => n.textContent.includes('Save failed'))).toBe(true);
  });
  it.each(['arcade', 'quit', 'survival'] as const)('ignores Continue after a newer %s transition (bug 3)', async next => {
    const scene = sceneFixture(); game.newGame(11);
    const pull = deferred<'local'>(); vi.mocked(cloud.pullSurvival).mockReturnValueOnce(pull.promise);
    const pending = scene.api.continueSurvival();
    if (next === 'arcade') scene.api.newArcade();
    else if (next === 'quit') scene.api.quitToTitle();
    else await scene.api.newSurvival();
    const state = scene.state;
    pull.resolve('local'); expect(await pending).toBe(false); expect(scene.state).toBe(state);
  });
  it('waits for cloud clearing before starting and saving New Game (bug 1)', async () => {
    const scene = sceneFixture(), clear = deferred<void>(); game.newGame(11);
    const previous = storage.getItem(saves.SAVE_KEY);
    vi.mocked(cloud.clearSurvival).mockReturnValueOnce(clear.promise);
    const pending = scene.api.newSurvival();
    expect(scene.state).toBeNull(); expect(storage.getItem(saves.SAVE_KEY)).toBe(previous);
    clear.resolve(); await pending;
    expect(scene.state?.mode).toBe('survival'); expect(saves.read()?.seed).toBe(scene.state?.seed);
  });
  it('ignores a pending New Game after a newer arcade launch (bug 3)', async () => {
    const scene = sceneFixture(), clear = deferred<void>();
    vi.mocked(cloud.clearSurvival).mockReturnValueOnce(clear.promise);
    const pending = scene.api.newSurvival(); scene.api.newArcade(); const state = scene.state;
    clear.resolve(); await pending;
    expect(scene.state).toBe(state); expect(scene.state?.mode).toBe('arcade');
  });
  it('selects a character for both new modes and remembers the menu choice', async () => {
    const api = shell(), title = new Title(root as unknown as HTMLElement);
    title.show(api);
    const scout = root.all().find(n => n.dataset.character === 'scout')!;
    await scout.fire('click');
    expect(scout.getAttribute('aria-pressed')).toBe('true');
    expect(storage.getItem('deadzone_character')).toBe('scout');
    await root.button('PLAY ARCADE').fire('click');
    expect(api.newArcade).toHaveBeenCalledWith('scout');
    await root.button('NEW ROAD').fire('click');
    expect(api.newRoad).toHaveBeenCalledWith('scout');
    title.hide();
    const again = new Title(root as unknown as HTMLElement); again.show(api);
    expect(root.all().find(n => n.dataset.character === 'scout')?.getAttribute('aria-pressed')).toBe('true');
    again.hide();
  });
  it('blocks survival shortcuts in arcade while keeping pause available (bug 4)', async () => {
    const scene = sceneFixture(); scene.api.newArcade(); const state = scene.state!;
    for (const code of ['KeyC', 'Tab', 'KeyN']) {
      await win.fire('keydown', { code }); expect(state.ui).toBeNull();
    }
    await win.fire('keydown', { code:'KeyK' }); expect(state.ui).toBe('tech');
    expect(root.all().some(n=>n.textContent==='ARCADE SKILLS')).toBe(true);
    await win.fire('keydown', { code:'KeyK' }); expect(state.ui).toBeNull();
    // I opens the arcade armory instead of the survival inventory, and closes it again
    await win.fire('keydown', { code: 'KeyI' }); expect(state.ui).toBe('armory');
    await win.fire('keydown', { code: 'KeyI' }); expect(state.ui).toBeNull();
    await win.fire('keydown', { code: 'Escape' }); expect(state.ui).toBe('pause');
    await win.fire('keydown', { code: 'Escape' }); expect(state.ui).toBeNull();
    state.mode = 'survival';
    await win.fire('keydown', { code: 'KeyI' }); expect(state.ui).toBe('inventory');
  });
  it.each(['inventory', 'craft', 'map', 'workbench', 'stash', 'loot'] as UiName[])('rejects survival-only %s events in arcade (bug 4)', name => {
    const scene = sceneFixture(); scene.api.newArcade(); const state = scene.state!;
    scene.ui.onEvent({ t: 'openUi', ui: name }, state);
    expect(state.ui).toBeNull();
    state.ui = name; scene.ui.update(state, 0); expect(state.ui).toBeNull();
  });
  it('releases map listeners and queued draws on rerender, hide and detach (bug 6)', () => {
    const overlays = new Overlays(root as unknown as HTMLElement, { close() {}, open() {} });
    overlays.attach(game.newGame(11), shell());
    for (let i = 0; i < 20; i++) {
      overlays.show('map', null); overlays.rerender();
      expect(win.listeners.get('mouseup')?.size).toBe(1); expect(frames.size).toBe(1);
      if (i % 2) overlays.show('inventory', null); else overlays.hide();
      expect(win.listeners.get('mouseup')?.size).toBe(0); expect(frames.size).toBe(0);
    }
    overlays.show('map', null); overlays.detach();
    expect(win.listeners.get('mouseup')?.size).toBe(0); expect(frames.size).toBe(0);
  });
  it('takes and uses loot merged into an existing stack (bug 7)', async () => {
    const state = game.newGame(11); state.player.hp = 50;
    state.player.inv.slots.fill(null); inv.add(state.player.inv, 'bandage', 1);
    const loot = { kind: 'loot', inv: inv.create(1), life: 100 } as Drop;
    inv.add(loot.inv, 'bandage', 1); state.drops.push(loot);
    const overlays = new Overlays(root as unknown as HTMLElement, { close() {}, open() {} });
    overlays.attach(state, shell()); overlays.show('loot', loot);
    const grids = root.querySelectorAll('.grid');
    await grids[1].children[0].fire('contextmenu');
    expect(state.player.hp).toBeGreaterThan(50);
    expect(inv.count(state.player.inv, 'bandage')).toBe(1); expect(inv.count(loot.inv, 'bandage')).toBe(0);
    overlays.detach();
  });

  it('offers The Long Road on its own Story tab with new / continue and an overwrite confirmation', async () => {
    storage.setItem('deadzone_story_tab', 'road');
    const api = shell(); const title = new Title(root as unknown as HTMLElement); title.show(api);
    await root.button('NEW ROAD').fire('click');
    expect(api.newRoad).toHaveBeenCalledWith('survivor');
    title.hide();
    storage.setItem('deadzone_road_v1', JSON.stringify({ version: 1, seed: 1, character: 'scout', mission: 3, snapshot: { equip: {}, slots: [], active: 'secondary', xp: 0, level: 4, sp: 0, tech: {}, maxHp: 100, flashlight: false }, attempts: 1, totals: { kills: 40, deaths: 1, time: 600 }, savedAt: 1 }));
    const again = new Title(root as unknown as HTMLElement); again.show(api);
    expect(root.all().some(n => (n.textContent || '').includes('Mission 4 / 10'))).toBe(true);
    await root.button('CONTINUE').fire('click'); expect(api.continueRoad).toHaveBeenCalledOnce();
    await root.button('NEW ROAD').fire('click');
    expect(api.newRoad).toHaveBeenCalledOnce();           // not yet: confirmation first
    await root.button('OVERWRITE & START').fire('click');
    expect(api.newRoad).toHaveBeenCalledTimes(2);
    // the tab choice is remembered; the retired open-world campaign has no tab, and a remembered one falls back to the road
    expect(storage.getItem('deadzone_story_tab')).toBe('road');
    expect(root.all().some(n => n.textContent === 'A LIGHT IN THE VALLEY')).toBe(false);
    again.hide();
    storage.setItem('deadzone_story_tab', 'valley');
    const retired = new Title(root as unknown as HTMLElement); retired.show(api);
    expect(root.all().some(n => n.textContent === 'NEW GAME')).toBe(false);
    expect(root.button('CONTINUE')).toBeTruthy();   // the Long Road checkpoint saved above
    retired.hide();
  });
});
