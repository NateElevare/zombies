// Player rules ported from sv-player.js; input and feedback belong to the shell.
import { clamp, emit, phys, rand, sound } from './core';
import type { Action, Container, GameState, InputState, Player, Rect, Structure, WeaponSlot } from './types';
import * as inv from './inventory';
import * as loot from './loot';
import * as progression from './progression';
import * as combat from './combat';
import * as base from './base';
import * as zombies from './zombies';

type RuntimePlayer = Player & { _exhausted?: boolean; _regenDelay?: number; _noiseT?: number; _bleedFx?: number; _intT?: number };
const rectDist = (x: number, y: number, o: Rect) => Math.hypot(x - clamp(x, o.x, o.x + o.w), y - clamp(y, o.y, o.y + o.h));

export function create(x: number, y: number): Player {
  return {
    character: 'survivor',
    x, y, prevX: x, prevY: y, prevAngle: 0, vx: 0, vy: 0, r: 14, angle: 0, speed: 190,
    hp: 100, maxHp: 100, stamina: 100, maxStamina: 100, food: 100, water: 100,
    invuln: 0, dead: false, inv: inv.createPlayer(), active: 'secondary',
    fireCooldown: 0, reloadTimer: 0, reloadTotal: 0, swingTimer: 0, swingTotal: 0, lastShotT: -99,
    xp: 0, level: 1, sp: 0, tech: {}, spawn: { x, y }, sprinting: false, flashlight: true, bleeding: 0,
  };
}

/** Containers only (The Long Road: drops are walk-over and there are no structures). */
export interface InteractOpts { containersOnly?: boolean }
function findInteract(state: GameState, p: Player, opts: InteractOpts = {}): GameState['interact'] {
  let best: GameState['interact'] = null, bd = Infinity;
  for (const c of state.containers) {
    if (Math.abs(c.x + c.w / 2 - p.x) > 400 || Math.abs(c.y + c.h / 2 - p.y) > 400) continue;
    const d = rectDist(p.x, p.y, c);
    if (d < 70 && d < bd && phys.canReach(state, p.x, p.y, c)) {
      bd = d; best = { kind: 'container', target: c, label: (c.searched ? 'Open ' : 'Search ') + (c.name || c.kind || 'container') };
    }
  }
  if (opts.containersOnly) return best;
  for (const drop of state.drops) {
    const d = Math.hypot(drop.x - p.x, drop.y - p.y) - (drop.r || 12);
    if (d < 70 && d < bd && phys.canReach(state, p.x, p.y, drop)) {
      bd = d; best = { kind: 'drop', target: drop, label: drop.kind === 'deathbag' ? 'Retrieve belongings' : 'Pick up loot' };
    }
  }
  const s = base.nearestInteractable(state, p.x, p.y, 70);
  if (s) {
    const d = Math.max(0, Math.hypot(s.x + s.w / 2 - p.x, s.y + s.h / 2 - p.y) - Math.max(s.w, s.h) / 2);
    if (d <= bd + 1) best = { kind: 'structure', target: s, label: 'Use ' + (base.STRUCTURES[s.type]?.name || s.type) };
  }
  if (!best) {
    const dmg = base.nearestDamaged(state, p.x, p.y, 60), cost = dmg && base.repairCost(dmg);
    if (dmg && cost) best = { kind: 'repair', target: dmg, label: `Repair ${base.STRUCTURES[dmg.type]?.name ?? dmg.type} (${Math.round(dmg.hp / dmg.maxHp * 100)}%): ` +
      Object.entries(cost).map(([id, n]) => `${n} ${id.replace(/_/g, ' ')}`).join(', ') };
  }
  return best;
}

function openLoot(state: GameState, target: unknown) {
  state.ui = 'loot';
  emit(state, { t: 'openUi', ui: 'loot', target });
}
function finishSearch(state: GameState, c: Container) {
  if (!c.inv) loot.fill(state, c);
  c.searched = true;
  progression.addXP(state, 5);
  state.stats.containersLooted++;
  sound(state, 'open');
  emit(state, { t: 'searchDone', containerId: c.id });
  openLoot(state, c);
}
function interact(state: GameState, p: Player) {
  const it = state.interact;
  if (it?.kind === 'repair') { base.repair(state, it.target as Structure); state.interact = null; return; }
  if (!it || it.kind === 'mission' || !phys.canReach(state, p.x, p.y, it.target)) return;
  if (it.kind === 'container') {
    const c = it.target as Container;
    if (c.searched) { openLoot(state, c); return; }
    const m = progression.playerMods(state);
    state.search = { target: c, t: 0, total: Math.max(0.3, (0.9 + (c.tier || 0) * 0.25) * (m.searchMult || 1)) };
  } else if (it.kind === 'drop') openLoot(state, it.target);
  else base.interact(state, it.target as Structure);
}
function kill(state: GameState, p: Player) {
  p.hp = 0;
  if (p.dead) return;
  p.dead = true; p.vx = p.vy = 0;
  emit(state, { t: 'playerDied' });
}

export function update(state: GameState, input: InputState, dt: number) {
  const p = state.player as RuntimePlayer;
  if (!p || p.dead || !Number.isFinite(dt) || dt <= 0) return;
  const m = progression.playerMods(state), oldX = p.x, oldY = p.y;
  if (m.maxHp) p.maxHp = m.maxHp;
  if (m.maxStamina) p.maxStamina = m.maxStamina;
  p.invuln = Math.max(0, p.invuln - dt);
  const mx = input.moveX, my = input.moveY, moving = mx !== 0 || my !== 0;
  if (state.mode === 'arcade') p.stamina = p.maxStamina;
  if (p.stamina <= 0) p._exhausted = true;
  else if (p.stamina > 15) p._exhausted = false;
  p.sprinting = !!(moving && input.sprint && !p._exhausted && p.stamina > 0);
  if (p.sprinting) { p.stamina = Math.max(0, p.stamina - 25 * dt); p._regenDelay = 0.8; }
  else if ((p._regenDelay || 0) > 0) p._regenDelay! -= dt;
  else p.stamina = Math.min(p.maxStamina, p.stamina + 18 * (m.staminaRegenMult || 1) * dt);
  if (state.mode === 'arcade') p.stamina = p.maxStamina;
  if ((p.jelly ?? 0) > 0) p.jelly = Math.max(0, p.jelly! - dt);
  if (moving) {
    const l = Math.hypot(mx, my), speed = p.speed * (m.speedMult || 1) * (p.slowMul ?? 1) * (p.sprinting ? 1.6 * (1 + (state.arcade?.run?.aug?.sprint ?? 0)) : 1);
    p.x += mx / l * speed * dt; p.y += my / l * speed * dt;
    phys.collideCircle(state, p);
    p._noiseT = (p._noiseT || 0) - dt;
    if (p._noiseT <= 0) { p._noiseT = 0.6; zombies.noise(state, p.x, p.y, (p.sprinting ? 220 : 70) * (m.noiseMult || 1)); }
  }
  p.vx = (p.x - oldX) / dt; p.vy = (p.y - oldY) / dt;
  p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
  const slots: WeaponSlot[] = ['primary', 'secondary', 'melee'];
  for (let i = 0; i < 3; i++) if (input.pressed.has(('slot' + (i + 1)) as Action)) combat.switchTo(state, slots[i]);
  const wheel = Number(input.pressed.has('nextWeapon')) - Number(input.pressed.has('prevWeapon'));
  if (wheel) combat.switchTo(state, slots[(slots.indexOf(p.active) + wheel + 3) % 3]);
  if (input.pressed.has('flashlight')) p.flashlight = !p.flashlight;
  // Arcade and the Long Road own touch pickups and have no survival needs or interaction menus.
  if (state.mode !== 'survival') {
    p.food = p.water = 100; p.bleeding = 0;
    if (state.mode === 'arcade') { state.interact = null; state.search = null; }
    if (p.hp <= 0) kill(state, p);
    return;
  }
  if (input.pressed.has('heal')) inv.quickHeal(state);
  if (input.pressed.has('build')) {
    if (state.ui === 'build') base.exitBuild(state);
    else if (!state.ui) base.enterBuild(state);
  }
  const hm = m.hungerMult || 1;
  p.food = Math.max(0, p.food - 100 / 720 * hm * dt);
  p.water = Math.max(0, p.water - 100 / 540 * hm * dt);
  if (p.food <= 0 || p.water <= 0) p.hp -= dt;
  else if (p.food > 60 && p.water > 60 && p.hp < p.maxHp && !(p.bleeding > 0)) p.hp = Math.min(p.maxHp, p.hp + (0.4 + (m.regen || 0)) * dt);
  else if (m.regen && p.hp < p.maxHp && !(p.bleeding > 0)) p.hp = Math.min(p.maxHp, p.hp + m.regen * dt);
  if (p.bleeding > 0) {
    p.hp -= 1.2 * dt; p.bleeding = Math.max(0, p.bleeding - dt * 0.05);
    p._bleedFx = (p._bleedFx || 0) - dt;
    if (p._bleedFx <= 0) { p._bleedFx = 0.5; emit(state, { t: 'blood', x: p.x, y: p.y, angle: p.angle, amount: 1 }); }
  }
  if (p.hp <= 0) { kill(state, p); return; }
  interactionTick(state, p, input, dt);
}

/** The interaction prompt and E-to-search. Survival runs it from update(); The Long Road calls it from its own step. */
export function interactionTick(state: GameState, p: Player, input: InputState, dt: number, opts: InteractOpts = {}) {
  const rp = p as RuntimePlayer;
  rp._intT = (rp._intT || 0) - dt;
  if (rp._intT <= 0 || input.pressed.has('interact')) { rp._intT = 0.1; state.interact = state.ui && state.ui !== 'build' ? null : findInteract(state, p, opts); }
  if (state.search && state.search.target && 'id' in state.search.target) {
    const s = state.search, c = s.target;
    if (!input.interactHeld || rectDist(p.x, p.y, c) > 90 || state.ui || !phys.canReach(state, p.x, p.y, c)) state.search = null;
    else { s.t += dt; if (s.t >= s.total) { state.search = null; finishSearch(state, c); } }
  }
  if (!state.ui && input.pressed.has('interact')) {
    if (state.search) state.search = null;
    else interact(state, p);
  }
}

export function damage(state: GameState, amount: number, angle: number) {
  const p = state.player;
  if (!p || p.dead || p.invuln > 0 || state.dev?.god || !Number.isFinite(amount) || amount <= 0) return;
  const m = progression.playerMods(state);
  const dmg = Math.max(0.5, amount * (1 - Math.min(0.75, m.armor || 0)) * (1 - Math.min(0.9, m.dmgReduction || 0)) * (1 - Math.min(0.5, state.arcade?.run?.aug?.dr ?? 0)));
  p.hp -= dmg; p.invuln = 0.35; state.shake = Math.max(state.shake, 8);
  emit(state, { t: 'blood', x: p.x, y: p.y, angle, amount: 6 }); sound(state, 'playerHurt');
  if (state.mode === 'survival' && dmg >= 8 && rand(state) < 0.25 * (1 - Math.min(0.9, m.bleedResist || 0))) p.bleeding = Math.max(p.bleeding, 1);
  emit(state, { t: 'playerHurt', amount: dmg, angle });
  combat.onPlayerHurt(state);
  // Second Wind augment (arcade): once per run, a killing blow leaves you at half health instead
  const run = state.mode === 'arcade' ? state.arcade?.run : undefined;
  if (p.hp <= 0 && run && (run.revives ?? 0) > 0) {
    run.revives!--; p.hp = p.maxHp * 0.5; p.invuln = 2.5; state.arcade!.reviveNova = true;
    emit(state, { t: 'explosion', x: p.x, y: p.y, radius: 160 }); emit(state, { t: 'toast', msg: 'SECOND WIND!', color: '#5fb0ff' });
    sound(state, 'levelUp');
    return;
  }
  if (p.hp <= 0) kill(state, p);
}
