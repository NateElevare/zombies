// Headless smoke test: loads all game scripts with a stubbed DOM/canvas,
// starts a run, and simulates gameplay with a bot that moves, aims, and shoots.
// Usage: node tools/smoke-test.js [seconds]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SIM_SECONDS = Number(process.argv[2] || 120);

// ---- stubs ----
const noop = () => {};
const ctxProxy = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern')
      return () => ({ addColorStop: noop });
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    return noop;
  },
  set(t, k, v) { t[k] = v; return true; },
});
function makeEl(tag) {
  const listeners = {};
  return {
    tagName: (tag || 'div').toUpperCase(), style: {}, dataset: {}, children: [],
    classList: { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); }, toggle(c, f) { (f ?? !this._s.has(c)) ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    width: 1280, height: 720, textContent: '', innerHTML: '', value: '',
    getContext: () => ctxProxy,
    addEventListener(n, fn) { (listeners[n] = listeners[n] || []).push(fn); },
    removeEventListener: noop, appendChild(c) { this.children.push(c); return c; }, remove: noop,
    setAttribute: noop, getAttribute: () => null, focus: noop, blur: noop,
    querySelector: () => makeEl(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    _fire(n, e) { (listeners[n] || []).forEach(fn => fn(e)); },
  };
}
const elements = {};
const winListeners = {};
const docListeners = {};
const storage = {};
let rafCb = null;
const sandbox = {
  console, Math, Date, JSON, Infinity, NaN, Number, String, Array, Object, Set, Map, Proxy,
  Uint8ClampedArray, Float32Array, Error, isFinite, parseInt, parseFloat, setTimeout: noop, clearTimeout: noop,
  setInterval: noop, clearInterval: noop,
  performance: { now: () => simTime * 1000 },
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  localStorage: { getItem: k => storage[k] ?? null, setItem: (k, v) => { storage[k] = String(v); }, removeItem: k => delete storage[k] },
  requestAnimationFrame: cb => { rafCb = cb; return 1; }, cancelAnimationFrame: noop,
  addEventListener: (n, fn) => (winListeners[n] = winListeners[n] || []).push(fn),
  removeEventListener: noop,
  Image: function () { return makeEl('img'); },
  document: {
    getElementById: id => (elements[id] = elements[id] || makeEl(id === 'game' ? 'canvas' : 'div')),
    createElement: tag => makeEl(tag), querySelector: () => makeEl(), querySelectorAll: () => [],
    body: makeEl('body'), documentElement: makeEl('html'),
    addEventListener: (n, fn) => (docListeners[n] = docListeners[n] || []).push(fn),
    removeEventListener: noop, hidden: false,
  },
};
sandbox.window = sandbox;
sandbox.self = sandbox;
let simTime = 0;
vm.createContext(sandbox);

// ---- load scripts in index.html order ----
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
console.log('scripts:', scripts.join(', '));
for (const s of scripts) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, s), 'utf8'), sandbox, { filename: s });
}
(winListeners.load || []).forEach(fn => fn({}));
(winListeners.DOMContentLoaded || docListeners.DOMContentLoaded || []).forEach(fn => fn({}));

const Z = sandbox.Z;
const fireKey = (type, code) => {
  const e = { code, key: code, type, preventDefault: noop, repeat: false };
  (winListeners[type] || []).forEach(fn => fn(e));
  (docListeners[type] || []).forEach(fn => fn(e));
};
const fireMouse = (type, x, y, button = 0) => {
  const e = { clientX: x, clientY: y, offsetX: x, offsetY: y, button, preventDefault: noop };
  const c = elements.game;
  if (c) c._fire(type, e);
  (winListeners[type] || []).forEach(fn => fn(e));
  (docListeners[type] || []).forEach(fn => fn(e));
};

// ---- run ----
const required = ['input', 'world', 'particles', 'weapons', 'player', 'zombies', 'pickups', 'waves', 'ui', 'render', 'audio', 'game'];
const missing = required.filter(k => !Z[k]);
if (missing.length) console.log('MISSING modules:', missing.join(', '));

Z.game.start();
const dt = 1 / 60;
let frames = 0, maxWave = 0, maxZombies = 0, deaths = 0, pickups = 0, restarts = 0;
Z.on('pickup', () => pickups++);
Z.on('playerDied', () => deaths++);
const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
let held = null;
for (let i = 0; i < SIM_SECONDS * 60; i++) {
  simTime += dt;
  const st = Z.state;
  if (st.screen === 'gameover') { restarts++; Z.game.start(); }
  // bot: aim at nearest zombie, wander, hold fire
  const p = Z.state.player;
  if (i % 45 === 0) { if (held) fireKey('keyup', held); held = moveKeys[(Math.random() * 4) | 0]; fireKey('keydown', held); }
  let tx = Z.W / 2 + 100, ty = Z.H / 2;
  let best = Infinity;
  for (const z of Z.state.zombies) {
    const d = (z.x - p.x) ** 2 + (z.y - p.y) ** 2;
    if (d < best) { best = d; tx = z.x - Z.state.camera.x; ty = z.y - Z.state.camera.y; }
  }
  fireMouse('mousemove', tx, ty);
  if (i % 10 === 0) fireMouse('mousedown', tx, ty);
  if (i % 10 === 5) fireMouse('mouseup', tx, ty);
  if (i % 600 === 300) fireKey('keydown', 'Digit' + (1 + ((i / 600) | 0) % 3));
  if (i % 600 === 301) fireKey('keyup', 'Digit' + (1 + ((i / 600) | 0) % 3));
  if (!rafCb) throw new Error('no requestAnimationFrame callback registered');
  const cb = rafCb; rafCb = null;
  cb(simTime * 1000);
  frames++;
  if (process.env.VERBOSE && i % 1800 === 0) {
    const w = Z.state.wave, pl = Z.state.player;
    const d = Z.state.zombies.map(z => Math.round(Math.hypot(z.x - pl.x, z.y - pl.y)));
    console.log(`t=${(i / 60) | 0}s wave=${w.number} toSpawn=${w.toSpawn} remaining=${w.remaining} alive=${d.length} hp=${Math.round(pl.hp)} kills=${Z.state.stats.kills} dists=${d.join(',')}`);
  }
  maxWave = Math.max(maxWave, Z.state.wave.number);
  maxZombies = Math.max(maxZombies, Z.state.zombies.length);
  for (const z of Z.state.zombies) {
    if (!Number.isFinite(z.x) || !Number.isFinite(z.y)) throw new Error('zombie NaN position');
  }
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('player NaN position');
}
// direct interaction checks
{
  const s = Z.state, p = s.player;
  const before = pickups;
  p.hp = 50;
  Z.pickups.spawn(s, 'health', p.x, p.y);
  Z.pickups.update(s, dt);
  if (pickups !== before + 1 || p.hp <= 50) throw new Error('health pickup not collected (hp=' + p.hp + ')');
  Z.pickups.spawn(s, 'shotgun', p.x, p.y);
  Z.pickups.update(s, dt);
  if (!p.weapons.shotgun.owned || p.current !== 'shotgun' || p.weapons.shotgun.mag <= 0) throw new Error('shotgun pickup failed');
  s.zombies.length = 0;
  Z.zombies.spawn(s, 'walker', p.x + 5, p.y);
  p.invuln = 0;
  const hp0 = p.hp;
  for (let i = 0; i < 30; i++) Z.zombies.update(s, dt);
  if (!(p.hp < hp0)) throw new Error('zombie did not damage player');
  console.log('interaction checks ok: pickup, weapon pickup, zombie melee');
  // death -> gameover
  p.invuln = 0; Z.player.damage(s, 9999);
  if (s.screen !== 'gameover') throw new Error('player death did not trigger gameover, screen=' + s.screen);
  console.log('death -> gameover ok, best =', storage.deadzone_best);
  Z.game.start();
}
// pause/resume cycle
Z.game.pause(); Z.game.resume();
console.log(JSON.stringify({ frames, maxWave, maxZombies, kills: Z.state.stats.kills, score: Z.state.stats.score,
  deaths, restarts, pickups, obstacles: Z.state.obstacles.length, best: storage.deadzone_best }));
console.log('SMOKE TEST PASSED');
