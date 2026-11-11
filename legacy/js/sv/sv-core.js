// sv-core.js — Survival mode foundation: namespace, seeded RNG, spatial grid,
// collision/raycast physics, state factory. Owned by the orchestrator. See SURVIVAL_SPEC.md.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const U = Z.util;
  const SV = (Z.sv = Z.sv || {});

  SV.WORLD = { w: 16000, h: 16000 };
  SV.CELL = 256; // spatial grid cell size

  // ---------- seeded RNG (mulberry32) ----------
  SV.makeRng = function (seed) {
    let a = seed >>> 0;
    const next = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      range: (lo, hi) => lo + next() * (hi - lo),
      int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
      // weighted pick from [{w:number, ...}] or {key: weight}
      weighted(table) {
        const entries = Array.isArray(table) ? table.map((e) => [e, e.w]) : Object.entries(table);
        let total = 0;
        for (const [, w] of entries) total += w;
        let r = next() * total;
        for (const [k, w] of entries) { if ((r -= w) <= 0) return k; }
        return entries[entries.length - 1][0];
      },
    };
  };
  // stable string hash -> uint32 (for deriving sub-seeds from ids)
  SV.hash = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  // ---------- spatial grid for axis-aligned rects ----------
  // Rects: {x,y,w,h,...}. A rect may be inserted once; remove() before moving it.
  function Grid(w, h, cell) {
    this.cell = cell;
    this.cols = Math.ceil(w / cell);
    this.rows = Math.ceil(h / cell);
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    this.stamp = 1;
    this.count = 0;
  }
  Grid.prototype._range = function (x, y, w, h) {
    const c = this.cell;
    return [
      U.clamp(Math.floor(x / c), 0, this.cols - 1), U.clamp(Math.floor(y / c), 0, this.rows - 1),
      U.clamp(Math.floor((x + w) / c), 0, this.cols - 1), U.clamp(Math.floor((y + h) / c), 0, this.rows - 1),
    ];
  };
  Grid.prototype.insert = function (o) {
    const [c0, r0, c1, r1] = this._range(o.x, o.y, o.w, o.h);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c].push(o);
    o._q = 0;
    this.count++;
  };
  Grid.prototype.remove = function (o) {
    const [c0, r0, c1, r1] = this._range(o.x, o.y, o.w, o.h);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const list = this.cells[r * this.cols + c], i = list.indexOf(o);
      if (i >= 0) list.splice(i, 1);
    }
    this.count--;
  };
  // Calls fn(o) once for every rect whose cells overlap the query box. Return true from fn to stop early.
  Grid.prototype.each = function (x, y, w, h, fn) {
    const s = ++this.stamp;
    const [c0, r0, c1, r1] = this._range(x, y, w, h);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const list = this.cells[r * this.cols + c];
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o._q === s) continue;
        o._q = s;
        if (fn(o)) return;
      }
    }
  };
  // Returns array of rects actually overlapping the box.
  Grid.prototype.query = function (x, y, w, h, out) {
    out = out || [];
    this.each(x, y, w, h, (o) => {
      if (o.x < x + w && o.x + o.w > x && o.y < y + h && o.y + o.h > y) out.push(o);
    });
    return out;
  };
  SV.Grid = Grid;

  // ---------- physics over state.grid (solid rects) ----------
  // Solid rect flags: solid (default true), blocksBullets (default true), blocksSight (default true).
  function slab(x, y, dx, dy, o, r) {
    let near = 0, far = 1;
    if (dx === 0) { if (x < o.x - r || x > o.x + o.w + r) return Infinity; }
    else {
      const a = (o.x - r - x) / dx, b = (o.x + o.w + r - x) / dx;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    }
    if (dy === 0) { if (y < o.y - r || y > o.y + o.h + r) return Infinity; }
    else {
      const a = (o.y - r - y) / dy, b = (o.y + o.h + r - y) / dy;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    }
    return near <= far ? near : Infinity;
  }

  SV.phys = {
    slab,
    // Push circle entity {x,y,r} out of every solid rect. Returns the last rect touched (or null).
    collideCircle(state, e) {
      let touched = null;
      for (let pass = 0; pass < 2; pass++) {
        state.grid.each(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2, (o) => {
          if (o.solid === false) return;
          if (e.x + e.r <= o.x || e.x - e.r >= o.x + o.w || e.y + e.r <= o.y || e.y - e.r >= o.y + o.h) return;
          const cx = U.clamp(e.x, o.x, o.x + o.w), cy = U.clamp(e.y, o.y, o.y + o.h);
          const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
          if (d2 >= e.r * e.r) return;
          touched = o;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2), push = e.r - d;
            e.x += (dx / d) * push; e.y += (dy / d) * push;
          } else {
            const l = e.x - o.x, r = o.x + o.w - e.x, t = e.y - o.y, b = o.y + o.h - e.y, m = Math.min(l, r, t, b);
            if (m === l) e.x = o.x - e.r; else if (m === r) e.x = o.x + o.w + e.r;
            else if (m === t) e.y = o.y - e.r; else e.y = o.y + o.h + e.r;
          }
        });
      }
      e.x = U.clamp(e.x, e.r, SV.WORLD.w - e.r);
      e.y = U.clamp(e.y, e.r, SV.WORLD.h - e.r);
      return touched;
    },
    // First rect hit along segment (x1,y1)->(x2,y2) for a moving circle of radius r.
    // filter(o) -> bool decides which rects count (default: blocksBullets !== false).
    // Returns {t (0..1), rect} or null.
    raycast(state, x1, y1, x2, y2, r, filter) {
      r = r || 0;
      const dx = x2 - x1, dy = y2 - y1;
      const bx = Math.min(x1, x2) - r, by = Math.min(y1, y2) - r;
      let best = Infinity, hit = null;
      state.grid.each(bx, by, Math.abs(dx) + r * 2, Math.abs(dy) + r * 2, (o) => {
        if (filter ? !filter(o) : o.blocksBullets === false) return;
        const t = slab(x1, y1, dx, dy, o, r);
        if (t < best) { best = t; hit = o; }
      });
      return hit ? { t: best, rect: hit } : null;
    },
    lineOfSight(state, x1, y1, x2, y2) {
      return !SV.phys.raycast(state, x1, y1, x2, y2, 0, (o) => o.blocksSight !== false);
    },
    canReach(state, x, y, target) {
      let tx, ty;
      if (target.w !== undefined && target.h !== undefined) {
        tx = U.clamp(x, target.x, target.x + target.w);
        ty = U.clamp(y, target.y, target.y + target.h);
      } else {
        const dx = target.x - x, dy = target.y - y, d = Math.hypot(dx, dy);
        const f = d ? Math.max(0, d - (target.r || 12)) / d : 0;
        tx = x + dx * f; ty = y + dy * f;
      }
      return !SV.phys.raycast(state, x, y, tx, ty, 0,
        o => o.solid !== false && o.container !== target && o.structure !== target && o !== target._solid);
    },
    // True if a circle at (x,y,r) overlaps no solid rect and is inside the world.
    isFree(state, x, y, r) {
      if (x < r || y < r || x > SV.WORLD.w - r || y > SV.WORLD.h - r) return false;
      let free = true;
      state.grid.each(x - r, y - r, r * 2, r * 2, (o) => {
        if (o.solid === false) return;
        const cx = U.clamp(x, o.x, o.x + o.w), cy = U.clamp(y, o.y, o.y + o.h);
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) { free = false; return true; }
      });
      return free;
    },
    addSolid(state, o) {
      if (o.solid === undefined) o.solid = true;
      if (o.blocksBullets === undefined) o.blocksBullets = true;
      if (o.blocksSight === undefined) o.blocksSight = true;
      state.grid.insert(o);
      return o;
    },
    removeSolid(state, o) { state.grid.remove(o); },
  };

  // ---------- helpers ----------
  SV.toast = function (msg, color) { Z.emit('sv:toast', { msg, color: color || '#e8e8e0' }); };
  SV.uid = (function () { let n = 0; return (p) => (p || 'u') + Date.now().toString(36) + (n++).toString(36); })();

  // ---------- state factory ----------
  SV.newState = function (seed) {
    return {
      mode: 'survival',
      screen: 'playing',          // 'playing' | 'paused' | 'dead' (Z.sv.ui overlays handle menus)
      ui: null,                   // name of open survival overlay or null (simulation pauses while non-null, except 'build')
      seed: seed >>> 0,
      time: 0,                    // seconds simulated this session
      clock: { t: 60, day: 1 },   // t = seconds into current day (see Z.sv.game.DAY_LENGTH)
      grid: new Grid(SV.WORLD.w, SV.WORLD.h, SV.CELL),
      // world (filled by Z.sv.world.generate)
      roads: [], buildings: [], containers: [], decor: [], pois: [], spawnPoint: { x: 8000, y: 8000 },
      // dynamic
      player: null,
      zombies: [],
      bullets: [],
      particles: [],               // shared Z.particles writes into Z.state.particles
      drops: [],                   // ground loot bags {id,x,y,r,inv,life,kind}
      structures: [],              // player-built base pieces
      base: { bed: null },         // bed structure id used as respawn
      camera: { x: 0, y: 0 },
      shake: 0,
      stats: { kills: 0, containersLooted: 0, deaths: 0, daysSurvived: 0 },
      interact: null,              // current interaction target computed by player module
      search: null,                // {target, t, total} while holding E on a container
    };
  };
})();
