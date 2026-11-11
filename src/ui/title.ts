// title.ts — title screen: logo, mode select (story tabs, arcade), account panel, controls, settings.
import { AugmentsPanel } from './augments';
import { load as loadAugments } from '../sim/augments';
import type { ShellApi } from '../shell';
import { cloud } from '../net/cloud';
import { el } from './dom';
import { settingsPanel } from './settings';
import { controlRows } from './controls';
import { keybinds } from '../keybinds';
import { cloudLabel, info, onInfo, refreshInfo } from './cloudinfo';
import { CHARACTERS, preferredCharacter, rememberCharacter, type CharacterId } from '../characters';
import { assetUrl } from '../asset-url';
import * as road from '../sim/road';

const STORY_TAB_KEY = 'deadzone_story_tab';
type StoryTab = 'road' | 'need' | 'hive';
/** A remembered tab that no longer exists (the retired open-world campaign) falls back to The Long Road. */
function preferredStoryTab(): StoryTab { try { const t = localStorage.getItem(STORY_TAB_KEY); return t === 'need' || t === 'hive' ? t : 'road'; } catch { return 'road'; } }


export class Title {
  readonly node: HTMLElement;
  private shell: ShellApi | null = null;
  private msg = '';
  private busy = false;
  private authMode: 'in' | 'up' = 'in';
  private offKeys: (() => boolean) | null = null;
  private authBusy = false;
  private authErr = '';
  private deleting = false;
  private delErr = '';
  private resolving = false;
  private resolveErr = '';
  private f = { username: '', email: '', password: '', delPw: '' };
  private unsubs: (() => void)[] = [];
  private survBox!: HTMLElement; private accBox!: HTMLElement; private modal!: HTMLElement; private msgEl!: HTMLElement;
  private arcadeButton!: HTMLButtonElement;
  private angleLabButton!: HTMLButtonElement;
  private selectedCharacter: CharacterId = preferredCharacter();
  private characterButtons: HTMLButtonElement[] = [];
  private storyTab: StoryTab = preferredStoryTab();
  private confirmingRoad = false;

  constructor(root: HTMLElement) {
    this.node = el('div', 'titlescreen hidden'); root.appendChild(this.node);
  }

  show(shell: ShellApi) {
    this.shell = shell; this.busy = false; this.msg = '';
    this.node.classList.remove('hidden'); this.render();
    this.unsubs.push(cloud.on(() => this.onCloud()), onInfo(() => this.refresh()));
    void refreshInfo(); // learn about a cloud-only save
  }
  hide() { this.unsubs.forEach((u) => u()); this.unsubs = []; this.node.classList.add('hidden'); this.node.replaceChildren(); }
  get visible() { return !this.node.classList.contains('hidden'); }

  private onCloud() {
    if (cloud.status === 'synced' && cloud.user && !info.snap) void refreshInfo(true);
    this.refresh();
  }
  private say(text: string) { this.msg = text; if (this.msgEl) this.msgEl.textContent = text; }

  private render() {
    const n = this.node;
    n.replaceChildren();
    n.appendChild(el('div', 'title-fog'));
    const wrap = el('div', 'title-wrap');
    const logo = el('h1', 'logo'); logo.innerHTML = 'DEAD<span>ZONE</span>'; wrap.appendChild(logo);
    wrap.appendChild(el('p', 'tagline', 'They keep coming. So do you.'));
    wrap.appendChild(this.characterPicker());
    const modes = el('div', 'modes');
    this.survBox = el('div', 'mode'); modes.appendChild(this.survBox);
    const arc = el('div', 'mode');
    arc.appendChild(el('h3', '', 'ARCADE'));
    arc.appendChild(el('p', 'mode-desc', 'Endless waves in a small arena. Grab pickups, keep moving, and see how long you last.'));
    const ab = el('button', 'big-btn', 'PLAY ARCADE');
    this.arcadeButton = ab;
    ab.addEventListener('click', () => { if (this.busy) return; try { this.shell!.newArcade(this.selectedCharacter); } catch (e) { console.error(e); this.say('Arcade mode is not available yet.'); } });
    arc.appendChild(ab);
    const augBtn = el('button', 'btn aug-open');
    const meta = loadAugments();
    augBtn.innerHTML = `AUGMENTS <span class="aug-chip">${meta.cores} cores</span>`;
    augBtn.addEventListener('click', () => { if (this.busy) return; new AugmentsPanel(this.node, () => this.render()).open(); });
    arc.appendChild(augBtn);
    modes.appendChild(arc);
    wrap.appendChild(modes);
    const lab = el('div', 'angle-lab-entry');
    const labInfo = el('div'); labInfo.append(el('strong', '', 'TRY AN ANGLED VIEW'), el('p', '', 'A small playable street scene. Adjust the tilt, zoom, and roof cutaway.'));
    this.angleLabButton = el('button', 'btn', 'OPEN ANGLE LAB');
    this.angleLabButton.addEventListener('click', () => { if (!this.busy) this.shell!.openAngleLab(); });
    lab.append(labInfo, this.angleLabButton); wrap.appendChild(lab);
    this.msgEl = el('div', 'title-msg', this.msg); wrap.appendChild(this.msgEl);

    const lower = el('div', 'title-lower');
    const ctl = el('div', 'panel controls'); ctl.appendChild(el('div', 'set-h', 'CONTROLS'));
    const grid = el('div', 'ctl-grid');
    const fill = () => { grid.replaceChildren(); for (const [k, v] of controlRows()) { const r = el('div', 'ctl-r'); r.appendChild(el('kbd', '', k)); r.appendChild(el('span', '', v)); grid.appendChild(r); } };
    fill(); this.offKeys?.(); this.offKeys = keybinds.onChange(fill);
    ctl.appendChild(grid);
    lower.appendChild(ctl);
    const right = el('div', 'title-right');
    this.accBox = el('div', 'panel account'); right.appendChild(this.accBox);
    const st = el('div', 'panel'); st.appendChild(settingsPanel(this.shell!)); right.appendChild(st);
    lower.appendChild(right);
    wrap.appendChild(lower);
    wrap.appendChild(el('div', 'ver', 'DEAD ZONE · v0.3'));
    n.appendChild(wrap);
    this.modal = el('div', 'modal hidden'); n.appendChild(this.modal);
    this.refresh();
  }

  /** Rebuild only the parts that depend on save/cloud state (typed form values are kept in this.f). */
  private refresh() {
    if (!this.visible || !this.survBox) return;
    this.arcadeButton.disabled = this.busy;
    this.angleLabButton.disabled = this.busy;
    for (const button of this.characterButtons) button.disabled = this.busy;
    this.renderSurvival(); this.renderAccount(); this.renderModal();
  }

  private characterPicker() {
    const panel = el('section', 'character-picker');
    panel.setAttribute('aria-labelledby', 'character-picker-title');
    const heading = el('h2', '', 'CHOOSE YOUR SURVIVOR'); heading.id = 'character-picker-title';
    panel.appendChild(heading);
    panel.appendChild(el('p', 'character-note', 'Choose your character for Story or Arcade. All characters have the same abilities.'));
    const cards = el('div', 'character-cards'); cards.setAttribute('role', 'group'); cards.setAttribute('aria-label', 'Player character');
    this.characterButtons = [];
    const update = () => {
      for (const button of this.characterButtons) {
        const selected = button.dataset.character === this.selectedCharacter;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
        button.querySelector('.character-status')!.textContent = selected ? 'SELECTED' : 'SELECT';
      }
    };
    for (const character of CHARACTERS) {
      const button = el('button', 'character-card'); button.type = 'button'; button.dataset.character = character.id;
      const img = el('img', 'character-preview'); img.src = assetUrl(`assets/players/${character.id}.png`); img.alt = '';
      img.width = 128; img.height = 128;
      button.append(img, el('strong', 'character-name', character.name), el('span', 'character-description', character.description), el('span', 'character-status'));
      button.addEventListener('click', () => {
        if (this.busy) return;
        this.selectedCharacter = character.id; rememberCharacter(character.id); update();
      });
      cards.appendChild(button); this.characterButtons.push(button);
    }
    update(); panel.appendChild(cards); return panel;
  }

  private renderRoad(surv: HTMLElement) {
    const shell = this.shell!;
    const hive = this.storyTab === 'hive', sequel = this.storyTab !== 'road', story: road.RoadStory = hive ? 'hive-below' : sequel ? 'group-in-need' : 'long-road';
    // each continuation carries over the survivor of the story before it
    const missions = road.missionsFor(story), source = hive ? road.readSave('group-in-need') ?? road.readSave() : road.readSave();
    surv.appendChild(el('p', 'mode-desc', hive
      ? 'The Hive Below: the reservoir at North Ridge drained in one night, and something is climbing out of the tear in its bed. Go down into the Hollow, a hive of seven cells: giant dead insects that swarm in columns, a brood boss sealing every door, and the Queen in the middle. A new map and new insect weapons. First part: the Breach and the Warrens. Your skills, level, character and gear carry over from A group in need.'
      : sequel
      ? 'A group in need: a distress call from St. Mercy sends you back through Bellwether. Break the siege, rescue four armed survivors, and fight beside them all the way home to North Ridge. Ten new missions on the same map. Your skills, level, character and gear carry over from The Long Road.'
      : 'The Long Road: Haven has fallen. Fight across nine quarantine sectors of Bellwether to reach the convoy at North Ridge. Ten missions, locked gates, a checkpoint at every one. Top-down, no building: run, shoot, scavenge.'));
    const save = road.readSave(story);
    if (save) {
      const c = el('button', 'big-btn', this.busy ? 'LOADING…' : 'CONTINUE'); c.disabled = this.busy;
      c.addEventListener('click', () => {
        if (this.busy) return;
        this.busy = true; this.say(''); this.refresh();
        let ok = false;
        try { ok = sequel ? shell.continueRoad(story) : shell.continueRoad(); } catch (e) { console.error(e); }
        if (!ok && this.visible) { this.busy = false; this.say('The checkpoint could not be loaded.'); this.refresh(); }
      });
      surv.appendChild(c);
      const m = missions[save.mission];
      surv.appendChild(el('div', 'cont-sub', save.done ? 'Campaign complete · ' + save.totals.kills + ' kills' : `Mission ${save.mission + 1} / ${missions.length} · ${m.title} · Lv ${save.snapshot.level}`));
    }
    if (hive ? !road.canStartHiveBelow() : sequel && !road.canStartGroupInNeed()) {
      surv.appendChild(el('p', 'cont-sub', hive
        ? 'Locked. Complete A group in need to go down into the hive with your survivor and unlocked skills.'
        : 'Complete The Long Road to start this continuation with your survivor and unlocked skills.'));
      return;
    }
    if (sequel) surv.appendChild(el('p', 'cont-sub', source
      ? `Carry over your level ${source.snapshot.level} survivor, skills and equipment. Each story keeps its own checkpoint.`
      : 'Testing unlock: start with a fresh survivor. Use the testing menu to add gear or levels.'));
    if (this.confirmingRoad) {
      const box = el('div', 'confirm');
      box.appendChild(el('p', '', `Start ${road.storyTitle(story)} from the beginning? This story’s checkpoint will be overwritten.`));
      const row = el('div', 'btnrow');
      const yes = el('button', 'btn danger', 'OVERWRITE & START'); yes.addEventListener('click', () => { this.confirmingRoad = false; this.startRoad(); });
      const no = el('button', 'btn', 'CANCEL'); no.addEventListener('click', () => { this.confirmingRoad = false; this.refresh(); });
      row.append(yes, no); box.appendChild(row); surv.appendChild(box);
    } else {
      const nb = el('button', save ? 'btn' : 'big-btn', hive ? 'START THE HIVE BELOW' : sequel ? 'START A GROUP IN NEED' : 'NEW ROAD'); nb.disabled = this.busy;
      nb.addEventListener('click', () => { if (this.busy) return; if (save) { this.confirmingRoad = true; this.refresh(); } else this.startRoad(); });
      surv.appendChild(nb);
    }
  }
  /** Refresh access immediately when the testing menu unlocks a story on the title screen. */
  refreshStories() { if (this.visible) this.renderSurvival(); }

  private startRoad() {
    if (this.busy) return;
    this.busy = true; this.refresh();
    try { if (this.storyTab === 'hive') this.shell!.newRoad(undefined, 'hive-below'); else if (this.storyTab === 'need') this.shell!.newRoad(undefined, 'group-in-need'); else this.shell!.newRoad(this.selectedCharacter); }
    catch (e) { console.error(e); this.say('The game could not be started.'); this.busy = false; this.refresh(); }
  }

  private renderSurvival() {
    const surv = this.survBox;
    surv.replaceChildren();
    surv.appendChild(el('h3', '', 'STORY'));
    const tabs = el('div', 'tabs mini story-tabs');
    for (const [id, name] of [['road', 'THE LONG ROAD'], ['need', 'A GROUP IN NEED'], ['hive', 'THE HIVE BELOW']] as const) {
      const b = el('button', 'tab' + (this.storyTab === id ? ' active' : ''), name);
      b.addEventListener('click', () => { this.storyTab = id; this.confirmingRoad = false; try { localStorage.setItem(STORY_TAB_KEY, id); } catch { /* optional */ } this.refresh(); });
      tabs.appendChild(b);
    }
    surv.appendChild(tabs);
    this.renderRoad(surv);
  }

  private input(type: string, ph: string, key: 'username' | 'email' | 'password', ac: string) {
    const i = el('input', 'field'); i.type = type; i.placeholder = ph; i.value = this.f[key]; i.autocomplete = ac as AutoFill; i.spellcheck = false;
    i.addEventListener('input', () => { this.f[key] = i.value; });
    i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') void this.submit(); });
    return i;
  }

  private async submit() {
    if (this.authBusy) return;
    const { username, email, password } = this.f;
    if (this.authMode === 'up') {
      if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) { this.authErr = 'Username: 3-24 letters, numbers or underscores.'; return this.refresh(); }
      if (!email.includes('@')) { this.authErr = 'Enter a valid email address.'; return this.refresh(); }
      if (password.length < 12 || password.length > 128) { this.authErr = 'Password must be 12-128 characters.'; return this.refresh(); }
    } else if (!email || !password) { this.authErr = 'Enter your email and password.'; return this.refresh(); }
    this.authBusy = true; this.authErr = ''; this.refresh();
    try {
      if (this.authMode === 'up') await cloud.register(username, email, password); else await cloud.login(email, password);
      this.f.password = ''; await refreshInfo(true);
    } catch (e) { this.authErr = (e as Error).message || 'Something went wrong.'; }
    this.authBusy = false; this.refresh();
  }

  private renderAccount() {
    const a = this.accBox; a.replaceChildren();
    a.appendChild(el('div', 'set-h', 'ACCOUNT'));
    const u = cloud.user;
    if (u) {
      const who = el('div', 'acc-who', 'Signed in as '); who.appendChild(el('b', '', u.username)); a.appendChild(who);
      a.appendChild(el('div', 'cloud-pill st-' + cloud.status, 'Cloud: ' + (cloudLabel() || cloud.status)));
      if (cloud.error && cloud.status !== 'synced') a.appendChild(el('div', 'form-err', cloud.error.message));
      const row = el('div', 'btnrow');
      const so = el('button', 'btn', 'SIGN OUT'); so.disabled = this.authBusy;
      so.addEventListener('click', async () => {
        this.authBusy = true; this.authErr = ''; this.refresh();
        try { await cloud.logout(); info.snap = null; info.forUser = ''; } catch (e) { this.authErr = (e as Error).message; }
        this.authBusy = false; this.refresh();
      });
      const del = el('button', 'btn danger', 'DELETE ACCOUNT');
      del.addEventListener('click', () => { this.deleting = true; this.delErr = ''; this.f.delPw = ''; this.refresh(); });
      row.appendChild(so); row.appendChild(del); a.appendChild(row);
      if (this.authErr) a.appendChild(el('div', 'form-err', this.authErr));
      return;
    }
    if (cloud.status === 'offline') { a.appendChild(el('div', 'offline-note', 'Offline: progress saves on this device.')); return; }
    const tabs = el('div', 'tabs mini');
    for (const [id, name] of [['in', 'SIGN IN'], ['up', 'CREATE ACCOUNT']] as const) {
      const b = el('button', 'tab' + (this.authMode === id ? ' active' : ''), name);
      b.addEventListener('click', () => { this.authMode = id; this.authErr = ''; this.refresh(); }); tabs.appendChild(b);
    }
    a.appendChild(tabs);
    const form = el('div', 'acc-form');
    if (this.authMode === 'up') form.appendChild(this.input('text', 'Username (3-24: letters, numbers, _)', 'username', 'username'));
    form.appendChild(this.input('email', 'Email', 'email', 'email'));
    form.appendChild(this.input('password', this.authMode === 'up' ? 'Password (12-128 characters)' : 'Password', 'password', this.authMode === 'up' ? 'new-password' : 'current-password'));
    const go = el('button', 'btn primary', this.authBusy ? 'PLEASE WAIT…' : this.authMode === 'up' ? 'CREATE ACCOUNT' : 'SIGN IN'); go.disabled = this.authBusy;
    go.addEventListener('click', () => void this.submit());
    form.appendChild(go);
    if (this.authErr) form.appendChild(el('div', 'form-err', this.authErr));
    a.appendChild(form);
  }

  private renderModal() {
    const m = this.modal; m.replaceChildren();
    const conflict = cloud.status === 'conflict' && !!cloud.user;
    if (!conflict && !this.deleting) { m.classList.add('hidden'); return; }
    m.classList.remove('hidden');
    const box = el('div', 'dialog' + (conflict ? '' : ' danger'));
    if (conflict) {
      box.appendChild(el('h3', '', 'SAVE CONFLICT'));
      box.appendChild(el('p', '', 'This device and your cloud account both have newer progress. Choose which survival save to keep. The other copy is overwritten.'));
      const row = el('div', 'btnrow');
      for (const [c, label] of [['local', "KEEP THIS DEVICE'S SAVE"], ['cloud', 'USE CLOUD SAVE']] as const) {
        const b = el('button', c === 'local' ? 'btn primary' : 'btn', label); b.disabled = this.resolving;
        b.addEventListener('click', async () => {
          this.resolving = true; this.resolveErr = ''; this.refresh();
          try { await cloud.resolveConflict(c); this.resolving = false; await refreshInfo(true); }
          catch (e) { this.resolveErr = (e as Error).message; }
          this.resolving = false; this.refresh();
        });
        row.appendChild(b);
      }
      box.appendChild(row);
      if (this.resolveErr) box.appendChild(el('div', 'form-err', this.resolveErr));
    } else {
      box.appendChild(el('h3', '', 'DELETE ACCOUNT'));
      box.appendChild(el('p', '', 'This permanently deletes your account and cloud saves. The save on this device is kept. Enter your password to confirm.'));
      const pw = el('input', 'field'); pw.type = 'password'; pw.placeholder = 'Password'; pw.value = this.f.delPw; pw.autocomplete = 'current-password';
      pw.addEventListener('input', () => { this.f.delPw = pw.value; });
      pw.addEventListener('keydown', (e) => e.stopPropagation());
      box.appendChild(pw);
      const row = el('div', 'btnrow');
      const yes = el('button', 'btn danger', this.authBusy ? 'DELETING…' : 'DELETE FOREVER'); yes.disabled = this.authBusy;
      yes.addEventListener('click', async () => {
        if (!this.f.delPw) { this.delErr = 'Enter your password.'; return this.refresh(); }
        this.authBusy = true; this.delErr = ''; this.refresh();
        try { await cloud.deleteAccount(this.f.delPw); this.deleting = false; info.snap = null; info.forUser = ''; this.f.delPw = ''; }
        catch (e) { this.delErr = (e as Error).message; }
        this.authBusy = false; this.refresh();
      });
      const no = el('button', 'btn', 'CANCEL'); no.addEventListener('click', () => { this.deleting = false; this.f.delPw = ''; this.refresh(); });
      row.appendChild(yes); row.appendChild(no); box.appendChild(row);
      if (this.delErr) box.appendChild(el('div', 'form-err', this.delErr));
    }
    m.appendChild(box);
  }
}
