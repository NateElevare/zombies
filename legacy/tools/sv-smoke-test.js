// Headless smoke test for Survival mode.
// Loads every script from index.html with a tolerant DOM/canvas stub, starts a new survival game,
// and drives a bot through movement, combat, looting, menus, building, sleeping, death, respawn and save/continue.
// Usage: node tools/sv-smoke-test.js [seconds]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SIM_SECONDS = Number(process.argv[2] || 90);
const noop = () => {};

// ---- deep-tolerant stub: any unknown property is a callable proxy returning itself ----
function tolerant() {
  const fn = function () { return proxy; };
  const proxy = new Proxy(fn, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'length') return 0;
      if (k === 'then') return undefined;
      if (k in t) return t[k];
      return proxy;
    },
    set(t, k, v) { t[k] = v; return true; },
    apply() { return proxy; },
  });
  return proxy;
}
const ctxProxy = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' || k === 'createConicGradient')
      return () => ({ addColorStop: noop });
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    if (k === 'canvas') return { width: 1280, height: 720 };
    return noop;
  },
  set(t, k, v) { t[k] = v; return true; },
});
const byId = {};
function makeEl(tag) {
  const listeners = {};
  const classes = new Set();
  const el = {
    tagName: String(tag || 'div').toUpperCase(), nodeType: 1, style: tolerant(), dataset: {}, children: [], childNodes: [],
    parentNode: null, parentElement: null, firstChild: null,
    classList: {
      add(...c) { c.forEach(x => classes.add(x)); }, remove(...c) { c.forEach(x => classes.delete(x)); },
      toggle(c, f) { const on = f === undefined ? !classes.has(c) : !!f; on ? classes.add(c) : classes.delete(c); return on; },
      contains(c) { return classes.has(c); }, _s: classes,
    },
    width: 1280, height: 720, offsetWidth: 300, offsetHeight: 200, clientWidth: 300, clientHeight: 200, scrollTop: 0, scrollLeft: 0,
    textContent: '', innerText: '', value: '', checked: false, disabled: false, title: '',
    getContext: () => ctxProxy,
    addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); },
    removeEventListener(n, f) { if (listeners[n]) listeners[n] = listeners[n].filter(x => x !== f); },
    dispatchEvent(e) { (listeners[e.type] || []).forEach(f => f(e)); return true; },
    appendChild(c) { if (c && typeof c === 'object') { c.parentNode = c.parentElement = el; } el.children.push(c); el.firstChild = el.children[0]; return c; },
    append(...cs) { cs.forEach(c => el.appendChild(c)); }, prepend(...cs) { cs.forEach(c => el.appendChild(c)); },
    insertBefore(c) { return el.appendChild(c); }, replaceChildren(...cs) { el.children = []; cs.forEach(c => el.appendChild(c)); },
    removeChild(c) { el.children = el.children.filter(x => x !== c); return c; },
    remove() { if (el.parentNode && el.parentNode.removeChild) el.parentNode.removeChild(el); },
    setAttribute(k, v) { el['_attr_' + k] = v; if (k === 'id') { el.id = v; byId[v] = el; } },
    getAttribute(k) { return el['_attr_' + k] ?? null; }, removeAttribute: noop, hasAttribute: () => false,
    focus: noop, blur: noop, click() { el.dispatchEvent({ type: 'click', target: el, currentTarget: el, preventDefault: noop, stopPropagation: noop, button: 0 }); },
    querySelector: () => makeEl('div'), querySelectorAll: () => [], getElementsByClassName: () => [], getElementsByTagName: () => [],
    closest: () => null, contains: () => false, matches: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200, x: 0, y: 0 }),
    insertAdjacentHTML: noop, insertAdjacentElement: (p, c) => c, cloneNode() { return makeEl(tag); },
    scrollIntoView: noop, setPointerCapture: noop, releasePointerCapture: noop,
    _listeners: listeners,
  };
  let _id = '', _html = '', _cls = '';
  Object.defineProperty(el, 'id', { get: () => _id, set: v => { _id = v; if (v) byId[v] = el; } });
  Object.defineProperty(el, 'innerHTML', { get: () => _html, set: v => { _html = String(v); el.children = []; } });
  Object.defineProperty(el, 'className', { get: () => [...classes].join(' ') || _cls, set: v => { _cls = v; classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); } });
  return el;
}

const winListeners = {}, docListeners = {}, storage = {};
let rafQueue = [], simTime = 0, errorCount = 0;
const origError = console.error;
const errors = [];
const sandbox = {
  console: { ...console, error: (...a) => { errorCount++; if (errors.length < 15) errors.push(a.map(x => (x && x.stack) || String(x)).join(' ')); }, warn: noop },
  Math, Date, JSON, Infinity, NaN, Number, String, Array, Object, Set, Map, WeakMap, WeakSet, Proxy, Symbol, Reflect, Promise,
  Uint8ClampedArray, Uint8Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, Error, TypeError, RangeError,
  isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, queueMicrotask: noop,
  performance: { now: () => simTime * 1000 },
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  localStorage: { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); }, removeItem: k => { delete storage[k]; }, clear: () => {} },
  requestAnimationFrame: cb => { rafQueue.push(cb); return rafQueue.length; }, cancelAnimationFrame: noop,
  addEventListener: (n, f) => (winListeners[n] = winListeners[n] || []).push(f),
  removeEventListener: noop, confirm: () => true, alert: noop, getComputedStyle: () => tolerant(),
  Image: function () { return makeEl('img'); }, Path2D: function () { return tolerant(); },
  OffscreenCanvas: undefined, AudioContext: undefined, webkitAudioContext: undefined,
  navigator: { userAgent: 'node' },
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
const body = makeEl('body');
sandbox.document = {
  getElementById: id => byId[id] || (byId[id] = Object.assign(makeEl(id === 'game' ? 'canvas' : 'div'), {})),
  createElement: t => makeEl(t), createElementNS: (ns, t) => makeEl(t), createTextNode: t => ({ textContent: t, nodeType: 3 }),
  createDocumentFragment: () => makeEl('fragment'),
  querySelector: () => null, querySelectorAll: () => [],
  body, documentElement: makeEl('html'), head: makeEl('head'),
  addEventListener: (n, f) => (docListeners[n] = docListeners[n] || []).push(f), removeEventListener: noop, hidden: false,
  activeElement: null,
};
// ids that exist in index.html
['game', 'title', 'pause', 'gameover', 'btn-start', 'btn-survival-new', 'btn-survival-continue', 'btn-resume', 'btn-quit', 'btn-again', 'title-best']
  .forEach(id => { const e = makeEl(id === 'game' ? 'canvas' : 'div'); e.id = id; });
vm.createContext(sandbox);

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
for (const s of scripts) {
  const file = path.join(ROOT, s);
  if (!fs.existsSync(file)) { console.log('MISSING FILE', s); continue; }
  try { vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: s }); }
  catch (e) { console.log('LOAD ERROR in', s, e.stack); process.exit(1); }
}
(winListeners.load || []).forEach(f => f({}));
(winListeners.DOMContentLoaded || []).concat(docListeners.DOMContentLoaded || []).forEach(f => f({}));

const Z = sandbox.Z;
const need = ['game', 'world', 'worldRender', 'player', 'render', 'combat', 'prog', 'zombies', 'base', 'inv', 'loot', 'save', 'ui'];
const missing = need.filter(k => !Z.sv[k]);
if (missing.length) console.log('MISSING Z.sv modules:', missing.join(', '));

const key = (type, code) => {
  const e = { code, key: code.replace(/^Key/, '').toLowerCase(), type, preventDefault: noop, stopPropagation: noop, repeat: false, shiftKey: false };
  (winListeners[type] || []).forEach(f => f(e)); (docListeners[type] || []).forEach(f => f(e));
};
const tap = code => { key('keydown', code); step(); key('keyup', code); };
const mouse = (type, x, y, button = 0) => {
  const e = { type, clientX: x, clientY: y, offsetX: x, offsetY: y, button, preventDefault: noop, stopPropagation: noop, deltaY: 0 };
  if (byId.game) (byId.game._listeners[type] || []).forEach(f => f(e));
  (winListeners[type] || []).forEach(f => f(e)); (docListeners[type] || []).forEach(f => f(e));
};
const dt = 1 / 60;
function step() {
  simTime += dt;
  if (!rafQueue.length) throw new Error('no rAF callback');
  const q = rafQueue; rafQueue = [];
  for (const cb of q) cb(simTime * 1000);
}
function check(cond, msg) { if (!cond) { console.log('FAIL:', msg); failures++; } else console.log('ok  :', msg); }
let failures = 0;

// ---- new game ----
const t0 = Date.now();
Z.sv.game.newGame();
console.log('newGame took', Date.now() - t0, 'ms');
let S = Z.state;
check(S.mode === 'survival', 'state is survival');
check(S.player && Number.isFinite(S.player.x), 'player exists');
check(S.buildings.length > 50, 'world has buildings (' + S.buildings.length + ')');
check(S.containers.length > 100, 'world has containers (' + S.containers.length + ')');
for (let i = 0; i < 30; i++) step();

// ---- looting: teleport next to nearest unsearched container and hold E ----
{
  const p = S.player;
  let best = null, bd = Infinity;
  for (const c of S.containers) {
    const d = Math.hypot(c.x + c.w / 2 - p.x, c.y + c.h / 2 - p.y);
    if (!c.searched && d < bd) { bd = d; best = c; }
  }
  // find a free spot adjacent to it
  const cx = best.x + best.w / 2, cy = best.y + best.h / 2;
  let placed = false;
  for (let r = 20; r < 80 && !placed; r += 6) for (let a = 0; a < Math.PI * 2 && !placed; a += 0.3) {
    const x = cx + Math.cos(a) * (best.w / 2 + r), y = cy + Math.sin(a) * (best.h / 2 + r);
    if (Z.sv.phys.isFree(S, x, y, p.r)) { p.x = x; p.y = y; placed = true; }
  }
  check(placed, 'found free spot near container ' + best.name);
  for (let i = 0; i < 8; i++) step();
  check(S.interact && S.interact.target, 'interaction target found: ' + (S.interact && S.interact.label));
  key('keydown', 'KeyE');
  for (let i = 0; i < 60 * 6 && !best.searched; i++) step();
  key('keyup', 'KeyE');
  step();
  check(best.searched, 'container searched');
  check(S.ui === 'loot', 'loot overlay open (ui=' + S.ui + ')');
  const before = S.player.inv.slots.filter(Boolean).length;
  const inC = best.inv ? best.inv.slots.filter(Boolean).map(s => s.id + 'x' + s.qty) : [];
  if (best.inv) Z.sv.inv.takeAll(best.inv, S.player.inv);
  const after = S.player.inv.slots.filter(Boolean).length;
  console.log('     container had', JSON.stringify(inC), ' player slots used', before, '->', after, ' xp', S.player.xp);
  Z.sv.ui.close(); step();
  check(!S.ui, 'loot overlay closed');
}

// ---- menus ----
for (const [code, name] of [['KeyI', 'inventory'], ['KeyK', 'tech'], ['KeyC', 'craft'], ['Tab', 'map']]) {
  tap(code); for (let i = 0; i < 3; i++) step();
  check(S.ui === name, code + ' opens ' + name + ' (ui=' + S.ui + ')');
  tap('Escape'); for (let i = 0; i < 3; i++) step();
  check(!S.ui, 'Esc closes ' + name + ' (ui=' + S.ui + ')');
}

// ---- progression ----
{
  Z.sv.prog.addXP(S, 2000);
  check(S.player.level > 1 && S.player.sp > 0, 'leveled up to ' + S.player.level + ' with ' + S.player.sp + ' SP');
  const tree = Z.sv.TECH.trees.find(t => !t.workbench) || Z.sv.TECH.trees[0];
  const node = tree.nodes.find(n => !(n.requires || []).length);
  const res = Z.sv.prog.canUnlock(S, node.id);
  if (res.ok) check(Z.sv.prog.unlock(S, node.id) && S.player.tech[node.id], 'unlocked ' + node.id);
  else console.log('     could not unlock', node.id, res.reason);
  const ws = Z.sv.prog.weaponStats(S, 'pistol');
  check(ws && ws.damage > 0, 'weaponStats pistol dmg=' + (ws && ws.damage));
  const pm = Z.sv.prog.playerMods(S);
  check(pm && pm.maxHp > 0, 'playerMods maxHp=' + (pm && pm.maxHp));
}

// ---- building: give materials, place workbench + wall + bed near player ----
{
  const p = S.player;
  for (const [id, q] of [['wood', 50], ['scrap', 30], ['nails', 20], ['cloth', 12], ['electronics', 4], ['gun_parts', 2], ['gunpowder', 6]]) {
    const left = Z.sv.inv.add(p.inv, id, q);
    if (left) console.log('     inventory full: could not add', left, id);
  }
  let placedCount = 0;
  for (const type of ['workbench', 'bed', 'wood_wall', 'stash']) {
    let s = null;
    for (let a = 0; a < Math.PI * 2 && !s; a += 0.4) for (let r = 60; r < 200 && !s; r += 30) {
      s = Z.sv.base.place(S, type, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 0);
    }
    if (s) placedCount++; else console.log('     could not place', type);
  }
  check(placedCount >= 3, 'placed ' + placedCount + ' structures');
  const wb = S.structures.find(s => s.type === 'workbench');
  if (wb) { p.x = wb.x + wb.w / 2 + 50; p.y = wb.y + wb.h / 2; Z.sv.phys.collideCircle(S, p); }
  check(!!Z.sv.base.nearStation(S, 'workbench') || !wb, 'near workbench');
  const r = Z.sv.RECIPES.find(r => Z.sv.inv.canCraft(S, r.id).ok);
  if (r) check(Z.sv.inv.craft(S, r.id), 'crafted ' + r.id); else console.log('     no craftable recipe');
  tap('KeyB'); step();
  check(S.ui === 'build', 'B enters build mode');
  for (let i = 0; i < 30; i++) step();
  tap('KeyB'); step(); step();
  check(S.ui !== 'build', 'B exits build mode (ui=' + S.ui + ')');
}

// ---- simulate: bot walks around shooting nearest zombie; skip ahead to night for density ----
let maxZ = 0, kills0 = S.stats.kills, frames = 0, nightSeen = false;
const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
let held = null;
const tStart = Date.now();
for (let i = 0; i < SIM_SECONDS * 60; i++) {
  S = Z.state;
  if (S.screen === 'dead') { Z.sv.game.respawn(); S = Z.state; }
  if (S.ui && S.ui !== 'build') Z.sv.ui.close();
  const p = S.player;
  if (i === 600) S.clock.t = Z.sv.game.DAY_LENGTH * 0.72; // jump to nightfall
  if (i % 50 === 0) { if (held) key('keyup', held); held = moveKeys[(Math.random() * 4) | 0]; key('keydown', held); }
  let tx = 700, ty = 360, bd = 600;
  for (const z of S.zombies) {
    const d = Math.hypot(z.x - p.x, z.y - p.y);
    if (d < bd) { bd = d; tx = z.x - S.camera.x; ty = z.y - S.camera.y; }
  }
  mouse('mousemove', tx, ty);
  if (bd < 600 && i % 8 === 0) mouse('mousedown', tx, ty);
  if (i % 8 === 4) mouse('mouseup', tx, ty);
  if (i % 300 === 0 && Z.sv.inv.totalAmmo(S, 'ammo_9mm') < 20) Z.sv.inv.add(p.inv, 'ammo_9mm', 60);
  step(); frames++;
  if (Z.sv.game.isNight(S)) nightSeen = true;
  maxZ = Math.max(maxZ, S.zombies.length);
  for (const z of S.zombies) if (!Number.isFinite(z.x) || !Number.isFinite(z.y)) throw new Error('zombie NaN');
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('player NaN');
}
const msPerFrame = (Date.now() - tStart) / frames;
check(maxZ > 5, 'zombies spawned (max alive ' + maxZ + ')');
check(nightSeen, 'night reached');
console.log('     kills during sim', S.stats.kills - kills0, ' avg ms/frame (sim+stub render)', msPerFrame.toFixed(2));

// ---- sleep ----
{
  const bed = S.structures.find(s => s.type === 'bed');
  if (bed) {
    S.clock.t = Z.sv.game.DAY_LENGTH * 0.8;
    const day = S.clock.day;
    Z.sv.base.interact(S, bed);
    check(S.clock.day > day || !Z.sv.game.isNight(S), 'sleeping skips to morning');
    if (S.ui) Z.sv.ui.close();
  }
}

// ---- death + respawn ----
{
  const p = S.player;
  p.invuln = 0;
  Z.sv.player.damage(S, 99999, 0);
  for (let i = 0; i < 5; i++) step();
  check(S.screen === 'dead', 'player death -> dead screen (screen=' + S.screen + ')');
  check(S.drops.some(d => d.kind === 'deathbag'), 'deathbag dropped');
  Z.sv.game.respawn(); step();
  check(S.screen === 'playing' && !S.player.dead && S.player.hp > 0, 'respawned');
}

// ---- save + continue ----
{
  Z.sv.save.write(S);
  check(Z.sv.save.has(), 'save exists');
  const snap = { seed: S.seed, level: S.player.level, structures: S.structures.length, searched: S.containers.filter(c => c.searched).length, day: S.clock.day };
  Z.sv.game.quitToTitle(); step();
  check(Z.state.mode !== 'survival', 'quit to title');
  Z.sv.game.continueGame(); step();
  const T = Z.state;
  check(T.mode === 'survival' && T.seed === snap.seed, 'continue restores seed');
  check(T.player.level === snap.level, 'continue restores level ' + T.player.level);
  check(T.structures.length === snap.structures, 'continue restores structures ' + T.structures.length + '/' + snap.structures);
  check(T.containers.filter(c => c.searched).length === snap.searched, 'continue restores searched containers');
  for (let i = 0; i < 120; i++) step();
}

console.log('console.error calls:', errorCount);
errors.forEach(e => console.log('  ERR', e.split('\n').slice(0, 4).join('\n      ')));
if (failures || errorCount) { console.log(`SV SMOKE TEST FAILED (${failures} failures, ${errorCount} errors)`); process.exit(1); }
console.log('SV SMOKE TEST PASSED');
