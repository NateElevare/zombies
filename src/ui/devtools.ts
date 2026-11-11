// devtools.ts — F9 testing panel: jump time of day, speed/freeze the clock, god mode, item kits, zombie spawns.
// It never captures game input: the panel is plain DOM beside the canvas, so you keep playing while it is open.
// Toggles live on state.dev (transient, never saved) and carry over to new games / continues in this session.
import * as cityBosses from '../sim/city-bosses';
import type { GameState, ZombieType } from '../sim/types';
import * as arcade from '../sim/arcade';
import * as road from '../sim/road';
import * as game from '../sim/game';
import * as inventory from '../sim/inventory';
import * as zombies from '../sim/zombies';
import * as progression from '../sim/progression';
import { phys, toast } from '../sim/core';
import * as saves from '../sim/save';
import { cloud } from '../net/cloud';
import { el } from './dom';

const cfg = { timeScale: 1, freeze: false, god: false };
const TIMES: [string, number][] = [['Dawn', 10], ['Noon', 150], ['Dusk', 380], ['Night', 425], ['Midnight', 450], ['Late', 530]];
const SPEEDS = [1, 5, 20, 60];
const KITS: Record<string, [string, number][]> = {
  'Build kit': [['wood', 150], ['nails', 80], ['scrap', 100], ['cloth', 30], ['electronics', 12], ['gun_parts', 10]],
  'Guns + ammo': [['shotgun', 1], ['assault_rifle', 1], ['pistol', 1], ['ammo_12g', 60], ['ammo_556', 180], ['ammo_9mm', 120]],
  'Medical + food': [['medkit', 5], ['bandage', 10], ['mre', 5], ['water_bottle', 5]],
};

export class DevTools {
  private root: HTMLElement;
  private box: HTMLElement | null = null;
  private clock: HTMLElement | null = null;
  private state: GameState | null = null;
  private speedBtns: HTMLButtonElement[] = [];
  private freezeBtn: HTMLButtonElement | null = null;
  private godBtn: HTMLButtonElement | null = null;
  visible = false;

  private resetArmed = false;
  private resetBtn: HTMLButtonElement | null = null;
  private unlockNeedBtn: HTMLButtonElement | null = null;
  private unlockHiveBtn: HTMLButtonElement | null = null;
  private unlockFailed = false;
  constructor(root: HTMLElement, private onReset: () => void = () => {}, private onStoryUnlock: () => void = () => {}) {
    this.root = root;
    window.addEventListener('keydown', (e) => { if (e.code === 'F9' && !e.repeat) { e.preventDefault(); this.toggle(); } });
  }

  /** Built on first open, so the panel costs nothing until you press F9. */
  private build() {
    const box = this.box = el('div', 'devtools');
    // keep clicks on the panel from reaching the canvas (no shooting while pressing buttons)
    box.addEventListener('mousedown', (e) => e.stopPropagation());
    box.appendChild(el('div', 'dev-h', 'TESTING · F9 to hide'));
    this.clock = el('div', 'dev-clock', '');
    box.appendChild(this.clock);

    this.row('Time', TIMES.map(([label, t]) => this.btn(label, () => this.s && game.devSetTime(this.s, t))));
    this.speedBtns = SPEEDS.map((k) => this.btn(k + '×', () => { cfg.timeScale = k; cfg.freeze = false; this.apply(); }));
    this.freezeBtn = this.btn('Freeze', () => { cfg.freeze = !cfg.freeze; this.apply(); });
    this.row('Speed', [...this.speedBtns, this.freezeBtn]);
    this.godBtn = this.btn('God mode', () => { cfg.god = !cfg.god; this.apply(); });
    this.row('Player', [this.godBtn, this.btn('Level +1', () => this.levelUp())]);
    this.row('Give', Object.keys(KITS).map((k) => this.btn(k, () => this.give(k))));
    this.row('Zombies', [
      this.btn('Spawn 10', () => this.spawn(10)),
      this.btn('Horde now', () => this.horde()),
      this.btn('Boss (arcade)', () => { if (this.s) arcade.devBoss(this.s); }),
      this.btn('Boss (city)', () => { if (this.s) cityBosses.devBoss(this.s); }),
      this.btn('Clear all', () => { const s = this.s; if (s) for (const z of s.zombies) z.dead = true; }),
    ]);
    this.row('Story missions', [
      this.btn('Skip objective', () => { if (this.s?.road) road.devSkip(this.s); }),
      this.btn('Go to objective', () => { const s = this.s, run = s?.road && road.currentRun(s); if (s && run) { s.player.x = s.player.prevX = run.point.x + 40; s.player.y = s.player.prevY = run.point.y + 40; } }),
      this.btn('Next mission', () => { const s = this.s; if (s?.road && s.road.mission + 1 < road.missionsOf(s).length) road.startMission(s, s.road.mission + 1); }),
    ]);
    this.unlockNeedBtn = this.btn('Unlock A group in need', () => {
      this.unlockFailed = !road.devUnlockGroupInNeed();
      if (!this.unlockFailed) {
        this.onStoryUnlock();
        if (this.s) toast(this.s, 'A group in need unlocked — select it under Story on the title screen.', '#9fd8ff');
      }
    });
    this.unlockNeedBtn.title = 'Unlock the sequel for testing without completing The Long Road. Existing story saves are preserved.';
    this.unlockHiveBtn = this.btn('Unlock The Hive Below', () => {
      if (road.devUnlockHiveBelow()) {
        this.onStoryUnlock();
        if (this.s) toast(this.s, 'The Hive Below unlocked — select it under Story on the title screen.', '#9fd8ff');
      }
    });
    this.unlockHiveBtn.title = 'Unlock the third story for testing without completing A group in need. Existing story saves are preserved.';
    this.row('Story access', [this.unlockNeedBtn, this.unlockHiveBtn]);
    this.resetBtn = this.btn('Reset progress', () => this.resetProgress());
    this.resetBtn.title = 'Deletes every save on this device (survival, all three Road stories, arcade best and augment cores) and, if signed in, the cloud survival save';
    this.row('Saves', [this.resetBtn]);
    this.root.appendChild(box);
  }
  /** Two clicks: arm, then wipe. Ends the current run so nothing autosaves over the empty slot. */
  private resetProgress() {
    if (!this.resetArmed) {
      this.resetArmed = true; this.resetBtn!.textContent = 'CONFIRM: delete all saves'; this.resetBtn!.classList.add('on');
      setTimeout(() => { if (this.resetArmed) { this.resetArmed = false; this.resetBtn!.textContent = 'Reset progress'; this.resetBtn!.classList.remove('on'); } }, 5000);
      return;
    }
    this.resetArmed = false; this.resetBtn!.textContent = 'Reset progress'; this.resetBtn!.classList.remove('on');
    this.onReset();   // quit first: quitting a run writes its checkpoint / banks its cores
    for (const key of [saves.SAVE_KEY, saves.SAVE_TIME_KEY, road.ROAD_SAVE_KEY, road.NEED_SAVE_KEY, road.NEED_TEST_UNLOCK_KEY, road.HIVE_SAVE_KEY, road.HIVE_TEST_UNLOCK_KEY, 'deadzone_arcade_best', 'deadzone_arcade_augments']) {
      try { localStorage.removeItem(key); } catch { /* storage blocked */ }
    }
    void cloud.clearSurvival().catch(() => {});
    this.onReset();   // and again so the title screen re-reads the (now empty) saves
  }

  private get s() { return this.state && this.state.player ? this.state : null; }

  attach(s: GameState | null) { this.state = s; if (this.box) this.apply(); }
  toggle() {
    if (!this.box) { this.build(); this.apply(); }
    this.visible = !this.visible; this.box!.style.display = this.visible ? '' : 'none';
    this.update();
  }

  update() {
    if (!this.visible || !this.clock) return;
    if (this.unlockNeedBtn) {
      const unlocked = road.hasGroupInNeedTestUnlock();
      this.unlockNeedBtn.disabled = unlocked;
      this.unlockNeedBtn.textContent = unlocked ? 'A group in need unlocked' : this.unlockFailed ? 'Unlock failed — retry' : 'Unlock A group in need';
    }
    if (this.unlockHiveBtn) {
      const unlocked = road.hasHiveBelowTestUnlock();
      this.unlockHiveBtn.disabled = unlocked;
      this.unlockHiveBtn.textContent = unlocked ? 'The Hive Below unlocked' : 'Unlock The Hive Below';
    }
    const s = this.s;
    this.clock.textContent = s ? `${game.timeLabel(s)}  ·  ${game.isNight(s) ? 'night' : 'day'}  ·  ${s.zombies.filter((z) => !z.dead).length} zombies` : 'no game running';
  }

  /** Push cfg onto the running state and refresh button highlights. */
  private apply() {
    if (this.state) this.state.dev = { ...cfg };
    const mark = (b: HTMLElement | null | undefined, on: boolean) => { if (b) b.className = on ? 'dev-btn on' : 'dev-btn'; };
    SPEEDS.forEach((k, i) => mark(this.speedBtns[i], !cfg.freeze && cfg.timeScale === k));
    mark(this.freezeBtn, cfg.freeze);
    mark(this.godBtn, cfg.god);
  }

  private give(kit: string) {
    const s = this.s; if (!s) return;
    for (const [id, q] of KITS[kit]) inventory.add(s.player.inv, id, q, undefined, s);
    toast(s, `Test: ${kit} added`, '#9fd8ff');
  }
  private levelUp() {
    const s = this.s; if (!s) return;
    const p = s.player;
    progression.addXP(s, Math.max(1, progression.xpForLevel(p.level || 1) - (p.xp || 0)));
  }
  private spawn(n: number) {
    const s = this.s; if (!s) return;
    const p = s.player, types: ZombieType[] = ['walker', 'walker', 'walker', 'runner', 'runner', 'crawler', 'brute', 'bloater'];
    let made = 0;
    for (let tries = 0; made < n && tries < n * 20; tries++) {
      const a = Math.random() * Math.PI * 2, d = 260 + Math.random() * 260;
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (!phys.isFree(s, x, y, 26)) continue;
      const z = zombies.spawn(s, types[made % types.length], x, y);
      if (z) z.state = 'chase';
      made++;
    }
  }
  private horde() {
    const s = this.s; if (!s || s.mode !== 'survival') return;
    if (!game.isNight(s)) game.devSetTime(s, 425);
    zombies.devHorde(s);
  }

  private btn(label: string, fn: () => void) {
    const b = el('button', 'dev-btn', label) as HTMLButtonElement;
    b.addEventListener('click', () => { fn(); b.blur(); this.update(); });
    return b;
  }
  private row(label: string, btns: HTMLElement[]) {
    if (!this.box) return;
    const r = el('div', 'dev-row'); r.appendChild(el('span', 'dev-l', label));
    const g = el('div', 'dev-g'); btns.forEach((b) => g.appendChild(b)); r.appendChild(g);
    this.box.appendChild(r);
  }
}
