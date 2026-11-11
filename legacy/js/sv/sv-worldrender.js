// sv-worldrender.js — Survival world rendering: lazily built, LRU-cached 1024px ground chunks
// (terrain, roads, markings, floors, decor), solids (walls, furniture, cars, trees, fences),
// fading roofs, minimap and full map (from a low-res map image pre-rendered once per world).
// Owned by the WORLD agent. See SURVIVAL_SPEC.md (WORLD section).
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const SV = (Z.sv = Z.sv || {});

  const CH = 1024;        // ground chunk size (world px == canvas px)
  const MAXCH = 28;       // LRU cap
  const MAPRES = 2048;    // low-res full map image
  const TAU = Math.PI * 2;

  const R = {
    state: null, gen: -1,
    chunks: new Map(),    // key -> {c, used}
    tick: 0,
    gidx: null,           // ground index (SV.Grid of wrappers)
    map: null, mapS: MAPRES / 16000,
    roof: new Map(), lastT: 0,
    solidsTmp: [], treesTmp: [], bTmp: [],
  };

  const SURF = {
    forest: '#1b2317', grass: '#222b1c', park: '#26351f', concrete: '#2c2c2a', gravel: '#2b2822', asphalt: '#222224',
    dirt: '#2d281f', field: '#28381f', base: '#2a2b25',
  };
  const MAPSURF = {
    forest: '#1d2a19', grass: '#2b3624', park: '#2f4a28', concrete: '#3a3a37', gravel: '#38342b', asphalt: '#2c2c2e',
    dirt: '#3a3326', field: '#33502a', base: '#3a3d30',
  };
  const MAPB = {
    house: '#7d6a55', store: '#5f7487', police: '#4a6aa8', hospital: '#c9cbc6', gun_store: '#b0603a', military: '#6f7d48',
    warehouse: '#6c7076', office: '#80858d', school: '#94704c', gas_station: '#b04a3a',
  };
  const POICOL = {
    police: '#6a9ae8', hospital: '#ff6a6a', gun_store: '#ffa04a', military: '#b8d070', school: '#e0b070', gas_station: '#ff7a5a',
    park: '#7ac070', warehouse: '#b0b0b0', district: '#e8e8e0', store: '#9ab0c8',
  };

  function now() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000; }
  function mkCanvas(w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas');
    if (!c) return null;
    c.width = w; c.height = h;
    return c;
  }
  function hash2(a, b, s) { let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ (s | 0)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; return h ^ (h >>> 15); }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function camView(cam) {
    const W = Z.W || 1280, H = Z.H || 720;
    const cx = cam ? cam.x : 0, cy = cam ? cam.y : 0;
    return { x: cx, y: cy, w: W, h: H };
  }

  // ------------------------------------------------------------------ preparation
  function ensure(state) {
    const g = state && state._svw ? state._svw.gen : -1;
    if (R.state !== state || R.gen !== g) prepare(state);
  }
  function prepare(state) {
    R.state = state; R.gen = state && state._svw ? state._svw.gen : -1;
    R.chunks.clear(); R.roof.clear(); R.map = null;
    if (!state) return;
    buildIndex(state);
    try { buildMap(state); } catch (e) { R.map = null; }
  }

  const DLAYER = { lot: 0, alley: 0, drive: 0, path: 0, canopy: 0, helipad: 0, crosswalk: 4, crack: 4, oil: 4, tuft: 4, leaves: 4, bush: 4, firepit: 4, blood: 6, bones: 6, debris: 6 };
  function buildIndex(state) {
    const G = new SV.Grid(SV.WORLD.w, SV.WORLD.h, 512);
    let i = 0;
    const add = (x, y, w, h, o, L, t) => G.insert({ x, y, w, h, o, L, t, i: i++ });
    for (const d of state.decor) {
      const L = DLAYER[d.kind] === undefined ? 6 : DLAYER[d.kind];
      const pad = d.kind === 'blood' || d.kind === 'bones' || d.kind === 'leaves' || d.kind === 'crack' ? 30 : 4;
      add(d.x - pad, d.y - pad, d.w + pad * 2, d.h + pad * 2, d, L, 'd');
    }
    for (const r of state.roads) {
      add(r.x - r.sw, r.y - r.sw, r.w + r.sw * 2, r.h + r.sw * 2, r, 1, 'sw');
      add(r.x, r.y, r.w, r.h, r, 2, 'road');
      add(r.x, r.y, r.w, r.h, r, 3, 'mark');
    }
    for (const b of state.buildings) add(b.x - 30, b.y - 30, b.w + 60, b.h + 60, b, 5, 'b');
    R.gidx = G;
  }

  // ------------------------------------------------------------------ ground drawing primitives
  function drawLot(g, d, ox, oy) {
    g.fillStyle = SURF[d.surface] || SURF.grass;
    g.fillRect(d.x, d.y, d.w, d.h);
    if (d.surface === 'asphalt' && d.lines !== 'none') {
      g.strokeStyle = 'rgba(210,210,200,0.22)'; g.lineWidth = 2;
      g.beginPath();
      if (d.lines === 'v') {
        for (let x = d.x + 20; x < d.x + d.w - 10; x += 56) {
          g.moveTo(x, d.y + 6); g.lineTo(x, d.y + Math.min(d.h - 6, 90));
          if (d.big || d.h > 300) { g.moveTo(x, d.y + d.h - 6); g.lineTo(x, d.y + d.h - Math.min(d.h - 6, 90)); }
        }
      } else {
        for (let y = d.y + 20; y < d.y + d.h - 10; y += 56) {
          g.moveTo(d.x + 6, y); g.lineTo(d.x + Math.min(d.w - 6, 90), y);
          if (d.big || d.w > 300) { g.moveTo(d.x + d.w - 6, y); g.lineTo(d.x + d.w - Math.min(d.w - 6, 90), y); }
        }
      }
      g.stroke();
    } else if (d.surface === 'field') {
      g.strokeStyle = 'rgba(220,220,210,0.18)'; g.lineWidth = 3;
      g.strokeRect(d.x + 10, d.y + 10, d.w - 20, d.h - 20);
      g.beginPath();
      if (d.w >= d.h) { g.moveTo(d.x + d.w / 2, d.y + 10); g.lineTo(d.x + d.w / 2, d.y + d.h - 10); }
      else { g.moveTo(d.x + 10, d.y + d.h / 2); g.lineTo(d.x + d.w - 10, d.y + d.h / 2); }
      g.stroke();
      g.beginPath(); g.arc(d.x + d.w / 2, d.y + d.h / 2, Math.min(d.w, d.h) * 0.15, 0, TAU); g.stroke();
    } else if (d.surface === 'concrete' && d.stripes) {
      g.strokeStyle = 'rgba(200,170,60,0.25)'; g.lineWidth = 3;
      g.strokeRect(d.x + 6, d.y + 6, d.w - 12, d.h - 12);
    } else if (d.surface === 'concrete' || d.surface === 'base') {
      // slab seams
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
      g.beginPath();
      const x0 = Math.max(d.x, ox - 1), x1 = Math.min(d.x + d.w, ox + CH + 1), y0 = Math.max(d.y, oy - 1), y1 = Math.min(d.y + d.h, oy + CH + 1);
      for (let x = d.x + 80 * Math.ceil((x0 - d.x) / 80); x < x1; x += 80) { g.moveTo(x, y0); g.lineTo(x, y1); }
      for (let y = d.y + 80 * Math.ceil((y0 - d.y) / 80); y < y1; y += 80) { g.moveTo(x0, y); g.lineTo(x1, y); }
      g.stroke();
    }
  }
  function drawDecorFlat(g, d) {
    switch (d.kind) {
      case 'alley': g.fillStyle = '#262624'; g.fillRect(d.x, d.y, d.w, d.h); break;
      case 'drive': g.fillStyle = '#353532'; g.fillRect(d.x, d.y, d.w, d.h); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.strokeRect(d.x + 0.5, d.y + 0.5, d.w - 1, d.h - 1); break;
      case 'path':
        g.fillStyle = d.plaza ? '#3a3935' : '#4a4236';
        if (d.round) { g.beginPath(); g.arc(d.x + d.w / 2, d.y + d.h / 2, d.w / 2, 0, TAU); g.fill(); }
        else g.fillRect(d.x, d.y, d.w, d.h);
        break;
      case 'canopy':
        g.fillStyle = '#353533'; g.fillRect(d.x, d.y, d.w, d.h);
        g.strokeStyle = 'rgba(200,60,50,0.35)'; g.lineWidth = 4; g.strokeRect(d.x + 2, d.y + 2, d.w - 4, d.h - 4);
        break;
      case 'helipad':
        g.fillStyle = '#34352f'; g.beginPath(); g.arc(d.x + d.w / 2, d.y + d.h / 2, d.w / 2, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(220,210,120,0.5)'; g.lineWidth = 6; g.beginPath(); g.arc(d.x + d.w / 2, d.y + d.h / 2, d.w / 2 - 14, 0, TAU); g.stroke();
        g.fillStyle = 'rgba(230,230,220,0.55)';
        { const cx = d.x + d.w / 2, cy = d.y + d.h / 2; g.fillRect(cx - 40, cy - 50, 16, 100); g.fillRect(cx + 24, cy - 50, 16, 100); g.fillRect(cx - 40, cy - 8, 80, 16); }
        break;
      case 'crosswalk':
        g.fillStyle = 'rgba(215,215,205,0.42)';
        if (d.dir === 'h') for (let x = d.x + 4; x < d.x + d.w - 6; x += 18) g.fillRect(x, d.y, 9, d.h);
        else for (let y = d.y + 4; y < d.y + d.h - 6; y += 18) g.fillRect(d.x, y, d.w, 9);
        break;
      default: break;
    }
  }
  function drawDecorTop(g, d) {
    const rnd = SV.makeRng(d.seed || hash2(d.x, d.y, 7));
    switch (d.kind) {
      case 'blood': {
        g.fillStyle = 'rgba(92,12,10,0.5)';
        const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
        g.beginPath(); g.ellipse(cx, cy, d.w / 2, d.h / 2, d.rot || 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(70,8,8,0.45)';
        for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(cx + rnd.range(-d.w, d.w) * 0.8, cy + rnd.range(-d.h, d.h) * 0.8, rnd.range(2, 6), 0, TAU); g.fill(); }
        if (rnd.chance(0.4)) { g.strokeStyle = 'rgba(80,10,10,0.4)'; g.lineWidth = rnd.range(3, 6); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + rnd.range(-50, 50), cy + rnd.range(-50, 50)); g.stroke(); }
        break;
      }
      case 'bones': {
        const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
        g.fillStyle = 'rgba(80,12,10,0.45)'; g.beginPath(); g.ellipse(cx, cy, d.w * 0.7, d.h * 0.6, d.rot || 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(200,195,175,0.6)'; g.lineWidth = 2.5; g.beginPath();
        for (let k = 0; k < 4; k++) { const a = rnd.range(0, TAU), x = cx + rnd.range(-10, 10), y = cy + rnd.range(-10, 10); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12); }
        g.stroke();
        g.fillStyle = 'rgba(210,205,185,0.7)'; g.beginPath(); g.arc(cx + rnd.range(-6, 6), cy + rnd.range(-6, 6), 4.5, 0, TAU); g.fill();
        break;
      }
      case 'debris':
        g.fillStyle = d.c || '#3a3530'; g.fillRect(d.x, d.y, d.w, d.h);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(d.x + 1, d.y + d.h - 2, d.w, 2);
        break;
      case 'crack': {
        g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.2; g.beginPath();
        let x = d.x, y = d.y; g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += rnd.range(-18, 18); y += rnd.range(-18, 18); g.lineTo(x, y); }
        g.stroke();
        break;
      }
      case 'oil':
        g.fillStyle = 'rgba(8,8,10,0.45)'; g.beginPath(); g.ellipse(d.x, d.y, d.w * 0.7, d.h * 0.5, d.rot || 0, 0, TAU); g.fill();
        break;
      case 'tuft':
        g.strokeStyle = 'rgba(70,90,50,0.45)'; g.lineWidth = 1; g.beginPath();
        for (let k = 0; k < 6; k++) { const x = d.x + rnd.range(0, d.w), y = d.y + rnd.range(0, d.h); g.moveTo(x, y); g.lineTo(x + rnd.range(-3, 3), y - rnd.range(3, 8)); }
        g.stroke();
        break;
      case 'leaves':
        for (let k = 0; k < 14; k++) {
          g.fillStyle = rnd.pick(['rgba(90,70,40,0.5)', 'rgba(60,70,35,0.5)', 'rgba(110,80,40,0.4)']);
          g.fillRect(d.x + rnd.range(0, d.w), d.y + rnd.range(0, d.h), rnd.range(2, 4), rnd.range(2, 4));
        }
        break;
      case 'bush':
        g.fillStyle = '#1e321a'; g.beginPath(); g.ellipse(d.x + d.w / 2, d.y + d.h / 2, d.w / 2, d.h / 2, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(80,120,60,0.25)'; g.beginPath(); g.arc(d.x + d.w * 0.4, d.y + d.h * 0.4, d.w * 0.25, 0, TAU); g.fill();
        break;
      case 'firepit':
        g.fillStyle = '#1a1816'; g.beginPath(); g.arc(d.x + d.w / 2, d.y + d.h / 2, d.w / 2, 0, TAU); g.fill();
        g.strokeStyle = '#55524c'; g.lineWidth = 4; g.stroke();
        break;
      default: break;
    }
  }
  function drawSidewalk(g, r) {
    g.fillStyle = '#383835';
    g.fillRect(r.x - r.sw, r.y - r.sw, r.w + r.sw * 2, r.h + r.sw * 2);
  }
  function sidewalkSeams(g, r, ox, oy) {
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1; g.beginPath();
    if (r.dir === 'h') {
      const a0 = Math.max(r.x - r.sw, ox), a1 = Math.min(r.x + r.w + r.sw, ox + CH);
      for (let x = Math.ceil(a0 / 40) * 40; x < a1; x += 40) { g.moveTo(x, r.y - r.sw); g.lineTo(x, r.y); g.moveTo(x, r.y + r.h); g.lineTo(x, r.y + r.h + r.sw); }
    } else {
      const a0 = Math.max(r.y - r.sw, oy), a1 = Math.min(r.y + r.h + r.sw, oy + CH);
      for (let y = Math.ceil(a0 / 40) * 40; y < a1; y += 40) { g.moveTo(r.x - r.sw, y); g.lineTo(r.x, y); g.moveTo(r.x + r.w, y); g.lineTo(r.x + r.w + r.sw, y); }
    }
    g.stroke();
  }
  function drawAsphalt(g, r) {
    g.fillStyle = r.kind === 'rural' ? '#292825' : '#232325';
    g.fillRect(r.x, r.y, r.w, r.h);
    if (r.sw) {
      // curb shadow
      g.fillStyle = 'rgba(0,0,0,0.25)';
      if (r.dir === 'h') { g.fillRect(r.x, r.y, r.w, 3); g.fillRect(r.x, r.y + r.h - 3, r.w, 3); }
      else { g.fillRect(r.x, r.y, 3, r.h); g.fillRect(r.x + r.w - 3, r.y, 3, r.h); }
    }
  }
  // intervals along road axis [a0,a1] minus crossings
  function runs(r, a0, a1, pad) {
    const out = [];
    const cs = r.cross.slice().sort((p, q) => p[0] - q[0]);
    let cur = a0;
    for (const c of cs) {
      const s = c[0] - pad, e = c[1] + pad;
      if (e <= cur) continue;
      if (s > cur) out.push([cur, Math.min(s, a1)]);
      cur = Math.max(cur, e);
      if (cur >= a1) break;
    }
    if (cur < a1) out.push([cur, a1]);
    return out.filter((p) => p[1] > p[0]);
  }
  function dashLine(g, horiz, fixed, a0, a1, dash, gap, w) {
    const per = dash + gap;
    let s = Math.floor(a0 / per) * per;
    for (; s < a1; s += per) {
      const p0 = Math.max(s, a0), p1 = Math.min(s + dash, a1);
      if (p1 <= p0) continue;
      if (horiz) g.fillRect(p0, fixed - w / 2, p1 - p0, w); else g.fillRect(fixed - w / 2, p0, w, p1 - p0);
    }
  }
  function drawMarkings(g, r, ox, oy) {
    const horiz = r.dir === 'h';
    const s0 = horiz ? r.x : r.y, s1 = horiz ? r.x + r.w : r.y + r.h;
    const c0 = Math.max(s0, (horiz ? ox : oy) - 40), c1 = Math.min(s1, (horiz ? ox : oy) + CH + 40);
    if (c1 <= c0) return;
    const mid = horiz ? r.y + r.h / 2 : r.x + r.w / 2, thick = horiz ? r.h : r.w;
    const segs = runs(r, c0, c1, r.kind === 'rural' ? 6 : 34);
    for (const [a, b] of segs) {
      if (r.kind === 'avenue') {
        g.fillStyle = 'rgba(200,170,60,0.55)';
        if (horiz) { g.fillRect(a, mid - 5, b - a, 2.5); g.fillRect(a, mid + 2.5, b - a, 2.5); }
        else { g.fillRect(mid - 5, a, 2.5, b - a); g.fillRect(mid + 2.5, a, 2.5, b - a); }
        g.fillStyle = 'rgba(210,210,200,0.35)';
        dashLine(g, horiz, mid - thick / 4, a, b, 26, 34, 2.5);
        dashLine(g, horiz, mid + thick / 4, a, b, 26, 34, 2.5);
      } else if (r.kind === 'street') {
        g.fillStyle = 'rgba(200,170,60,0.45)';
        dashLine(g, horiz, mid, a, b, 30, 30, 3);
      } else {
        g.fillStyle = 'rgba(190,190,170,0.2)';
        dashLine(g, horiz, mid, a, b, 24, 40, 2.5);
      }
    }
  }

  const FLOOR = {
    kitchen: ['tile', '#4a4a44', '#3e3e3a'], bathroom: ['tile', '#4c5254', '#40464a'], restroom: ['tile', '#4c5254', '#40464a'],
    ward: ['tile', '#4e5452', '#464c4a'], pharmacy: ['tile', '#4e5452', '#464c4a'], cafeteria: ['tile', '#4a4842', '#3f3d38'],
    diner: ['tile', '#4e3a36', '#3c3c3a'], gassales: ['tile', '#46464a', '#3c3c40'], sales: ['tile', '#434341', '#3b3b39'],
    living: ['wood', '#43352a'], bedroom: ['wood', '#3f3228'], gunsales: ['wood', '#3e3026'],
    office: ['carpet', '#33373d'], meeting: ['carpet', '#2f3540'], classroom: ['carpet', '#3a3530'], comms: ['carpet', '#33382e'], lobby: ['tile', '#45474a', '#3d3f42'],
    corridor: ['plain', '#3c3e3e'], lockers: ['plain', '#383a3c'], cells: ['plain', '#333432'], armory: ['plain', '#323436'],
    warehall: ['concrete', '#363633'], storage: ['concrete', '#343431'], storeroom: ['concrete', '#343431'], barracks: ['plain', '#36382e'],
    marmory: ['concrete', '#33352d'], mvault: ['concrete', '#303229'], gunvault: ['concrete', '#323030'], break: ['tile', '#45443e', '#3c3b36'],
  };
  function drawBuildingFloor(g, b) {
    g.fillStyle = '#1e1d1b';
    g.fillRect(b.x, b.y, b.w, b.h);
    for (const r of b.rooms) {
      const f = FLOOR[r.type] || ['plain', b.floorColor];
      g.fillStyle = f[1];
      g.fillRect(r.x, r.y, r.w, r.h);
      if (f[0] === 'tile') {
        g.fillStyle = f[2];
        const s = 20;
        for (let y = r.y, j = 0; y < r.y + r.h; y += s, j++) for (let x = r.x + ((j & 1) ? s : 0); x < r.x + r.w; x += s * 2) g.fillRect(x, y, Math.min(s, r.x + r.w - x), Math.min(s, r.y + r.h - y));
      } else if (f[0] === 'wood') {
        g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; g.beginPath();
        if (r.w >= r.h) for (let y = r.y + 12; y < r.y + r.h; y += 12) { g.moveTo(r.x, y); g.lineTo(r.x + r.w, y); }
        else for (let x = r.x + 12; x < r.x + r.w; x += 12) { g.moveTo(x, r.y); g.lineTo(x, r.y + r.h); }
        g.stroke();
      } else if (f[0] === 'concrete') {
        g.fillStyle = 'rgba(0,0,0,0.12)';
        const rnd = SV.makeRng(hash2(r.x, r.y, 3));
        for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(r.x + rnd.range(20, r.w - 20), r.y + rnd.range(20, r.h - 20), rnd.range(10, 40), rnd.range(8, 26), rnd.range(0, 3), 0, TAU); g.fill(); }
      }
    }
    // door thresholds + mats
    for (const d of b.doors) {
      g.fillStyle = '#4a4238'; g.fillRect(d.x, d.y, d.w, d.h);
      if (d.side !== 'front') continue;
      g.fillStyle = 'rgba(90,60,40,0.6)';
      if (b.front === 's') g.fillRect(d.x + 8, d.y + d.h, d.w - 16, 12);
      else if (b.front === 'n') g.fillRect(d.x + 8, d.y - 12, d.w - 16, 12);
      else if (b.front === 'e') g.fillRect(d.x + d.w, d.y + 8, 12, d.h - 16);
      else g.fillRect(d.x - 12, d.y + 8, 12, d.h - 16);
    }
  }

  function noise(g, ox, oy, seed) {
    const rnd = SV.makeRng(seed);
    for (let k = 0; k < 26; k++) {
      g.fillStyle = rnd.chance(0.5) ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,240,0.025)';
      g.beginPath(); g.ellipse(ox + rnd.range(0, CH), oy + rnd.range(0, CH), rnd.range(30, 140), rnd.range(20, 90), rnd.range(0, 3), 0, TAU); g.fill();
    }
    for (let k = 0; k < 1100; k++) {
      const v = rnd.next();
      g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.16)' : v < 0.85 ? 'rgba(255,255,240,0.05)' : 'rgba(70,60,40,0.18)';
      g.fillRect(ox + rnd.range(0, CH), oy + rnd.range(0, CH), rnd.range(1, 3), rnd.range(1, 3));
    }
  }

  function buildChunk(state, cx, cy) {
    const c = mkCanvas(CH, CH);
    if (!c) return null;
    const g = c.getContext('2d');
    if (!g) return c;
    const ox = cx * CH, oy = cy * CH;
    g.setTransform(1, 0, 0, 1, -ox, -oy);
    g.fillStyle = SURF.forest;
    g.fillRect(ox, oy, CH, CH);
    const items = R.gidx.query(ox, oy, CH, CH, []);
    items.sort((a, b) => a.L - b.L || a.i - b.i);
    let noised = false;
    const seed = hash2(cx, cy, state.seed);
    for (const it of items) {
      if (!noised && it.L > 0) { noise(g, ox, oy, seed); noised = true; }
      const o = it.o;
      switch (it.t) {
        case 'd':
          if (o.kind === 'lot') drawLot(g, o, ox, oy);
          else if (it.L === 0 || o.kind === 'crosswalk') drawDecorFlat(g, o);
          else drawDecorTop(g, o);
          break;
        case 'sw': if (o.sw) { drawSidewalk(g, o); sidewalkSeams(g, o, ox, oy); } break;
        case 'road': drawAsphalt(g, o); break;
        case 'mark': drawMarkings(g, o, ox, oy); break;
        case 'b': drawBuildingFloor(g, o); break;
      }
    }
    if (!noised) noise(g, ox, oy, seed);
    g.setTransform(1, 0, 0, 1, 0, 0);
    return c;
  }

  function getChunk(state, cx, cy, budget) {
    const key = cx + ',' + cy;
    let e = R.chunks.get(key);
    if (e) { e.used = R.tick; return e; }
    if (budget.n <= 0) return null;
    budget.n--;
    e = { c: buildChunk(state, cx, cy), used: R.tick, cx, cy };
    R.chunks.set(key, e);
    if (R.chunks.size > MAXCH) {
      let oldK = null, oldU = Infinity;
      for (const [k, v] of R.chunks) if (v.used < oldU && v.used !== R.tick) { oldU = v.used; oldK = k; }
      if (oldK) R.chunks.delete(oldK);
    }
    return e;
  }

  // ------------------------------------------------------------------ low-res map image
  function buildMap(state) {
    const c = mkCanvas(MAPRES, MAPRES);
    R.map = c;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    const s = R.mapS;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.fillStyle = MAPSURF.forest; g.fillRect(0, 0, SV.WORLD.w, SV.WORLD.h);
    for (const d of state.decor) {
      if (d.kind === 'lot') { g.fillStyle = MAPSURF[d.surface] || MAPSURF.grass; g.fillRect(d.x, d.y, d.w, d.h); }
      else if (d.kind === 'path' || d.kind === 'drive') { g.fillStyle = '#4a463c'; g.fillRect(d.x, d.y, d.w, d.h); }
    }
    // forest texture: tree dots
    g.fillStyle = '#16200f';
    state.grid.each(0, 0, SV.WORLD.w, SV.WORLD.h, (o) => {
      if (o.kind === 'tree') { g.fillRect(o.x - 20, o.y - 20, 50, 50); }
      return false;
    });
    for (const r of state.roads) {
      if (r.sw) { g.fillStyle = '#4b4b47'; g.fillRect(r.x - r.sw, r.y - r.sw, r.w + r.sw * 2, r.h + r.sw * 2); }
    }
    for (const r of state.roads) {
      g.fillStyle = r.kind === 'avenue' ? '#6a6a6c' : r.kind === 'street' ? '#58585b' : '#4e4a40';
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    for (const b of state.buildings) {
      g.fillStyle = MAPB[b.kind] || '#777';
      g.fillRect(b.x, b.y, b.w, b.h);
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 12; g.strokeRect(b.x, b.y, b.w, b.h);
    }
    // military perimeter + fences
    state.grid.each(0, 0, SV.WORLD.w, SV.WORLD.h, (o) => {
      if (o.kind === 'wall' && o.base) { g.fillStyle = '#9aa080'; g.fillRect(o.x - 8, o.y - 8, o.w + 16, o.h + 16); }
      return false;
    });
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  // draw part of the map image: world rect (wx,wy,ww,wh) -> dest rect, clipping to the image
  function blitMap(ctx, wx, wy, ww, wh, dx, dy, dw, dh) {
    if (!R.map) return;
    const s = R.mapS, k = dw / ww;
    let x0 = Math.max(0, wx), y0 = Math.max(0, wy), x1 = Math.min(SV.WORLD.w, wx + ww), y1 = Math.min(SV.WORLD.h, wy + wh);
    if (x1 <= x0 || y1 <= y0) return;
    ctx.drawImage(R.map, x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s, dx + (x0 - wx) * k, dy + (y0 - wy) * k, (x1 - x0) * k, (y1 - y0) * k);
  }

  // ------------------------------------------------------------------ solids
  const FCOL = {
    sofa: '#5a3434', bed: '#55586a', hbed: '#8b979c', cot: '#4c5240', table: '#5a4836', desk: '#4c3c2b', counter: '#4b4a47', cabinet: '#5a4430',
    fridge: '#a3a7a4', stove: '#38393b', wardrobe: '#4b3624', nightstand: '#5a4430', dresser: '#54402b', toilet: '#bdbdb4', tub: '#aab0ae',
    sink: '#9ea4a4', medcab: '#cfcfc6', filing: '#5a5f64', plant: '#2a4f26', tv: '#19191b', bookshelf: '#46321f', armchair: '#5a4838',
    bench: '#4a3b2b', locker: '#4b5764', rack: '#3c4045', crate: '#6b4a28', mcrate: '#4a5236', shelf: '#3d3933', clothes: '#4a3a4c',
    guncase: '#2a2a2d', safe: '#3a3e41', cooler: '#3f5a6c', pump: '#8a2a22', tower: '#3c3b31', sandbag: '#6c6249', fountain: '#55565a',
    statue: '#5a5a54', planter: '#4a3f36', ship: '#5a3a2a', booth: '#55564c', dumpster: '#2c4a34', toolbox: '#8c2c22', pallet: '#6c5332',
    barrel: '#4a5a38', woodpile: '#5a3f27', sdesk: '#5a4936', monitor: '#3a4048', cart: '#9aa3a6', gunrack: '#46321f',
  };
  function shade(g, o, a) { g.fillStyle = 'rgba(0,0,0,' + a + ')'; g.fillRect(o.x + 3, o.y + 3, o.w, o.h); }
  function drawFurniture(g, o, t) {
    const col = o.color || FCOL[o.sub] || '#4a4540';
    const x = o.x, y = o.y, w = o.w, h = o.h, horiz = w >= h;
    if (o.tall) shade(g, o, 0.35);
    switch (o.sub) {
      case 'fountain': case 'statue': {
        g.fillStyle = col; g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2, 0, TAU); g.fill();
        g.fillStyle = o.sub === 'fountain' ? '#25343c' : '#6a6a64'; g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2 - 10, 0, TAU); g.fill();
        g.fillStyle = o.sub === 'fountain' ? '#3a5260' : '#7a7a72'; g.beginPath(); g.arc(x + w / 2, y + h / 2, 12, 0, TAU); g.fill();
        return;
      }
      case 'barrel': g.fillStyle = col; g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2, 0, TAU); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2; g.stroke(); break;
      case 'planter':
        g.fillStyle = col; g.fillRect(x, y, w, h);
        g.fillStyle = '#24401f'; g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2 + 6, 0, TAU); g.fill();
        g.fillStyle = 'rgba(120,160,90,0.2)'; g.beginPath(); g.arc(x + w / 2 - 5, y + h / 2 - 5, w / 4, 0, TAU); g.fill();
        return;
      default:
        g.fillStyle = col;
        if (o.sub === 'sofa' || o.sub === 'armchair' || o.sub === 'toilet' || o.sub === 'tub' || o.sub === 'bed' || o.sub === 'hbed') { rr(g, x, y, w, h, 5); g.fill(); }
        else g.fillRect(x, y, w, h);
        g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5; g.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
    }
    // details
    switch (o.sub) {
      case 'bed': case 'hbed': case 'cot':
        g.fillStyle = o.sub === 'cot' ? '#5d6450' : '#c8c8c0';
        if (horiz) g.fillRect(x + 4, y + 4, 16, h - 8); else g.fillRect(x + 4, y + 4, w - 8, 16);
        if (o.sub !== 'cot') { g.fillStyle = o.sub === 'hbed' ? '#b8c4c8' : '#6e5a7a'; if (horiz) g.fillRect(x + w * 0.4, y + 2, w * 0.58, h - 4); else g.fillRect(x + 2, y + h * 0.4, w - 4, h * 0.58); }
        break;
      case 'sofa': case 'armchair':
        g.fillStyle = 'rgba(0,0,0,0.25)';
        if (o.side === 'n') g.fillRect(x + 3, y + 3, w - 6, 10); else if (o.side === 's') g.fillRect(x + 3, y + h - 13, w - 6, 10);
        else if (o.side === 'w') g.fillRect(x + 3, y + 3, 10, h - 6); else g.fillRect(x + w - 13, y + 3, 10, h - 6);
        break;
      case 'fridge': case 'cooler':
        g.fillStyle = 'rgba(0,0,0,0.25)'; if (horiz) g.fillRect(x + w * 0.62, y + 2, 2, h - 4); else g.fillRect(x + 2, y + h * 0.62, w - 4, 2);
        if (o.sub === 'cooler') { g.fillStyle = 'rgba(160,210,230,0.25)'; g.fillRect(x + 3, y + 3, w - 6, h - 6); }
        break;
      case 'stove':
        g.strokeStyle = '#1a1a1a'; g.lineWidth = 2;
        for (const [px, py] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) { g.beginPath(); g.arc(x + w * px, y + h * py, Math.min(w, h) * 0.13, 0, TAU); g.stroke(); }
        break;
      case 'desk': case 'counter': case 'sdesk':
        if (o.sub === 'desk') { g.fillStyle = '#1e2226'; g.fillRect(x + w / 2 - 9, y + h / 2 - 5, 18, 10); g.fillStyle = 'rgba(120,170,200,0.35)'; g.fillRect(x + w / 2 - 7, y + h / 2 - 3, 14, 6); }
        if (o.sub === 'counter') { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 2, y + 2, w - 4, 4); }
        break;
      case 'medcab':
        g.fillStyle = '#b02a2a';
        { const cx = x + w / 2, cy = y + h / 2, s = Math.min(w, h) * 0.5; g.fillRect(cx - s / 2, cy - s / 6, s, s / 3); g.fillRect(cx - s / 6, cy - s / 2, s / 3, s); }
        break;
      case 'crate': case 'mcrate': case 'pallet':
        g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2; g.beginPath();
        g.moveTo(x + 3, y + 3); g.lineTo(x + w - 3, y + h - 3); g.moveTo(x + w - 3, y + 3); g.lineTo(x + 3, y + h - 3); g.stroke();
        if (o.sub === 'mcrate') { g.fillStyle = 'rgba(220,210,140,0.35)'; g.fillRect(x + w / 2 - 6, y + 4, 12, 5); }
        break;
      case 'locker': case 'filing': case 'wardrobe': case 'cabinet': case 'nightstand': case 'dresser':
        g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.beginPath();
        if (horiz) { g.moveTo(x + w / 2, y + 2); g.lineTo(x + w / 2, y + h - 2); } else { g.moveTo(x + 2, y + h / 2); g.lineTo(x + w - 2, y + h / 2); }
        g.stroke();
        break;
      case 'shelf': case 'rack': case 'bookshelf': case 'clothes': {
        const rnd = SV.makeRng(hash2(x, y, 11));
        const n = Math.max(2, Math.floor((horiz ? w : h) / 12));
        for (let k = 0; k < n; k++) {
          if (rnd.chance(0.3)) continue;
          g.fillStyle = rnd.pick(o.sub === 'clothes' ? ['#6a4a5a', '#3a4a6a', '#5a5a3a', '#7a3a3a'] : o.sub === 'rack' ? ['#6b4a28', '#5a5e62', '#4a5a3a', '#6a6050'] : ['#7a5a3a', '#4a6a7a', '#8a3a3a', '#6a7a4a', '#9a8a5a', '#5a4a6a']);
          if (horiz) g.fillRect(x + 3 + k * ((w - 6) / n), y + 3, (w - 6) / n - 2, h - 6); else g.fillRect(x + 3, y + 3 + k * ((h - 6) / n), w - 6, (h - 6) / n - 2);
        }
        break;
      }
      case 'guncase': case 'gunrack':
        g.fillStyle = 'rgba(150,180,190,0.18)'; g.fillRect(x + 3, y + 3, w - 6, h - 6);
        g.strokeStyle = '#141414'; g.lineWidth = 2; g.beginPath();
        if (horiz) for (let k = x + 10; k < x + w - 8; k += 14) { g.moveTo(k, y + 5); g.lineTo(k + 4, y + h - 5); }
        else for (let k = y + 10; k < y + h - 8; k += 14) { g.moveTo(x + 5, k); g.lineTo(x + w - 5, k + 4); }
        g.stroke();
        break;
      case 'safe': g.fillStyle = '#9a9a90'; g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.18, 0, TAU); g.fill(); break;
      case 'toilet': g.fillStyle = '#8a8c88'; g.beginPath(); g.arc(x + w / 2, y + h / 2 + 2, Math.min(w, h) * 0.28, 0, TAU); g.fill(); break;
      case 'tub': case 'sink': g.fillStyle = '#7a8a90'; rr(g, x + 5, y + 5, w - 10, h - 10, 6); g.fill(); break;
      case 'tv': g.fillStyle = 'rgba(80,110,140,0.4)'; g.fillRect(x + 4, y + 4, w - 8, h - 8); break;
      case 'plant': g.fillStyle = '#3a6a30'; g.beginPath(); g.arc(x + w / 2, y + h / 2, w * 0.6, 0, TAU); g.fill(); break;
      case 'table': g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + 3, y + 3, w - 6, h - 6); break;
      case 'pump': g.fillStyle = '#e8d8a0'; g.fillRect(x + 4, y + h / 2 - 5, w - 8, 10); break;
      case 'tower':
        g.strokeStyle = '#6a6a58'; g.lineWidth = 3; g.strokeRect(x + 4, y + 4, w - 8, h - 8);
        g.beginPath(); g.moveTo(x + 4, y + 4); g.lineTo(x + w - 4, y + h - 4); g.moveTo(x + w - 4, y + 4); g.lineTo(x + 4, y + h - 4); g.stroke();
        break;
      case 'sandbag': {
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; g.beginPath();
        if (horiz) for (let k = x + 16; k < x + w; k += 16) { g.moveTo(k, y); g.lineTo(k, y + h); } else for (let k = y + 16; k < y + h; k += 16) { g.moveTo(x, k); g.lineTo(x + w, k); }
        g.stroke();
        break;
      }
      case 'ship': {
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; g.beginPath();
        if (horiz) for (let k = x + 8; k < x + w; k += 8) { g.moveTo(k, y + 2); g.lineTo(k, y + h - 2); } else for (let k = y + 8; k < y + h; k += 8) { g.moveTo(x + 2, k); g.lineTo(x + w - 2, k); }
        g.stroke();
        break;
      }
      case 'dumpster':
        g.fillStyle = 'rgba(0,0,0,0.3)'; if (horiz) g.fillRect(x + w / 2 - 1, y + 2, 2, h - 4); else g.fillRect(x + 2, y + h / 2 - 1, w - 4, 2);
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 2, y + 2, w - 4, 4);
        break;
      case 'woodpile': {
        g.fillStyle = '#7a5a3a';
        for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(x + 8 + (k % 3) * 16, y + 8 + Math.floor(k / 3) * 10, 5, 0, TAU); g.fill(); }
        break;
      }
      case 'toolbox': g.fillStyle = '#c8b048'; g.fillRect(x + w / 2 - 6, y + 2, 12, 3); break;
      default: break;
    }
    if (o.container) containerMark(g, o.container, t);
  }
  function containerMark(g, c, t) {
    if (!c.searched) {
      const a = 0.35 + 0.2 * Math.sin(t * 3 + c.x * 0.01);
      g.strokeStyle = 'rgba(255,214,90,' + a.toFixed(3) + ')'; g.lineWidth = 1.5;
      g.strokeRect(c.x - 1.5, c.y - 1.5, c.w + 3, c.h + 3);
    } else {
      g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(c.x, c.y, c.w, c.h);
    }
  }
  function drawWall(g, o) {
    if (o.kind === 'window') {
      g.fillStyle = '#25313a'; g.fillRect(o.x, o.y, o.w, o.h);
      g.fillStyle = 'rgba(150,185,205,0.45)';
      if (o.w >= o.h) g.fillRect(o.x + 2, o.y + o.h / 2 - 1.5, o.w - 4, 3); else g.fillRect(o.x + o.w / 2 - 1.5, o.y + 2, 3, o.h - 4);
      g.fillStyle = o.color || '#4a4c4f';
      if (o.w >= o.h) { g.fillRect(o.x, o.y, 3, o.h); g.fillRect(o.x + o.w - 3, o.y, 3, o.h); }
      else { g.fillRect(o.x, o.y, o.w, 3); g.fillRect(o.x, o.y + o.h - 3, o.w, 3); }
      return;
    }
    g.fillStyle = o.color || '#4a4c4f';
    g.fillRect(o.x, o.y, o.w, o.h);
    g.fillStyle = o.inner ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.1)';
    if (o.w >= o.h) g.fillRect(o.x, o.y, o.w, Math.min(3, o.h)); else g.fillRect(o.x, o.y, Math.min(3, o.w), o.h);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    if (o.w >= o.h) g.fillRect(o.x, o.y + o.h - 2, o.w, 2); else g.fillRect(o.x + o.w - 2, o.y, 2, o.h);
  }
  function drawFence(g, o) {
    const horiz = o.w >= o.h;
    if (o.style === 'chain') {
      g.fillStyle = 'rgba(150,155,160,0.35)'; g.fillRect(o.x, o.y + (horiz ? o.h / 2 - 1 : 0), horiz ? o.w : o.w, horiz ? 2 : o.h);
      if (!horiz) { g.fillRect(o.x + o.w / 2 - 1, o.y, 2, o.h); }
      g.fillStyle = '#7a7e82';
      if (horiz) for (let k = o.x; k <= o.x + o.w; k += 60) g.fillRect(k - 2, o.y, 4, o.h);
      else for (let k = o.y; k <= o.y + o.h; k += 60) g.fillRect(o.x, k - 2, o.w, 4);
      return;
    }
    g.fillStyle = '#4e3c28'; g.fillRect(o.x, o.y, o.w, o.h);
    g.fillStyle = 'rgba(255,230,190,0.08)'; if (horiz) g.fillRect(o.x, o.y, o.w, 2); else g.fillRect(o.x, o.y, 2, o.h);
    g.fillStyle = '#3a2c1c';
    if (horiz) for (let k = o.x; k <= o.x + o.w; k += 40) g.fillRect(k - 3, o.y - 1, 6, o.h + 2);
    else for (let k = o.y; k <= o.y + o.h; k += 40) g.fillRect(o.x - 1, k - 3, o.w + 2, 6);
  }
  function drawCar(g, o, t) {
    const horiz = o.dir === 'h', x = o.x, y = o.y, w = o.w, h = o.h;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 4, y + 4, w, h);
    g.fillStyle = o.color; rr(g, x, y, w, h, o.truck ? 5 : 10); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2; g.stroke();
    // front is +axis unless flipped
    const L = horiz ? w : h, along = (f, len) => (o.flip ? L - f * L - len : f * L);
    g.fillStyle = o.wreck ? '#141210' : '#1b2731';
    if (o.truck) {
      const cab = along(0.72, L * 0.26);
      if (horiz) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + cab, y + 3, L * 0.26, h - 6); g.fillStyle = '#1b2731'; g.fillRect(x + along(0.74, 8), y + 6, 8, h - 12); }
      else { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + 3, y + cab, w - 6, L * 0.26); g.fillStyle = '#1b2731'; g.fillRect(x + 6, y + along(0.74, 8), w - 12, 8); }
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; g.beginPath();
      for (let k = 0.08; k < 0.66; k += 0.1) { const p = along(k, 0); if (horiz) { g.moveTo(x + p, y + 5); g.lineTo(x + p, y + h - 5); } else { g.moveTo(x + 5, y + p); g.lineTo(x + w - 5, y + p); } }
      g.stroke();
    } else {
      const ws = along(0.58, L * 0.14), rs = along(0.2, L * 0.1);
      if (horiz) { g.fillRect(x + ws, y + 6, L * 0.14, h - 12); g.fillRect(x + rs, y + 6, L * 0.1, h - 12); }
      else { g.fillRect(x + 6, y + ws, w - 12, L * 0.14); g.fillRect(x + 6, y + rs, w - 12, L * 0.1); }
      g.fillStyle = 'rgba(255,255,255,0.07)';
      if (horiz) g.fillRect(x + along(0.3, L * 0.28), y + 5, L * 0.28, h - 10); else g.fillRect(x + 5, y + along(0.3, L * 0.28), w - 10, L * 0.28);
    }
    if (o.wreck) {
      const rnd = SV.makeRng(hash2(x, y, 5));
      for (let k = 0; k < 4; k++) { g.fillStyle = rnd.chance(0.5) ? 'rgba(120,60,30,0.5)' : 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(x + rnd.range(6, w - 6), y + rnd.range(6, h - 6), rnd.range(3, 8), 0, TAU); g.fill(); }
    }
    if (o.container) containerMark(g, o.container, t);
  }
  const TREECOL = ['#1f3a1c', '#24401f', '#1b331a', '#2a4522'];
  function drawTree(g, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2, r = o.cr || 34;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(cx + 8, cy + 8, r, 0, TAU); g.fill();
    g.fillStyle = TREECOL[o.shade || 0]; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.stroke();
    const s = o.seed || 0;
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.beginPath(); g.arc(cx + ((s % 7) - 3) * r * 0.08, cy + (((s >> 3) % 7) - 3) * r * 0.08, r * 0.62, 0, TAU); g.fill();
    g.fillStyle = 'rgba(120,160,80,0.14)';
    g.beginPath(); g.arc(cx - r * 0.28, cy - r * 0.28, r * 0.42, 0, TAU); g.fill();
  }
  function drawRock(g, o) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; rr(g, o.x + 4, o.y + 4, o.w, o.h, Math.min(o.w, o.h) * 0.4); g.fill();
    g.fillStyle = '#4c4c48'; rr(g, o.x, o.y, o.w, o.h, Math.min(o.w, o.h) * 0.4); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.08)'; rr(g, o.x + 4, o.y + 3, o.w * 0.55, o.h * 0.45, Math.min(o.w, o.h) * 0.2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.5; rr(g, o.x, o.y, o.w, o.h, Math.min(o.w, o.h) * 0.4); g.stroke();
  }

  // ------------------------------------------------------------------ roofs
  function drawRoof(g, b, a) {
    g.globalAlpha = a;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(b.x + 10, b.y + 10, b.w, b.h);
    g.fillStyle = b.roofColor; g.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    const horiz = b.w >= b.h;
    if (b.roofStyle === 'pitched') {
      g.fillStyle = 'rgba(0,0,0,0.2)';
      if (horiz) g.fillRect(b.x - 2, b.y + b.h / 2, b.w + 4, b.h / 2 + 2); else g.fillRect(b.x + b.w / 2, b.y - 2, b.w / 2 + 2, b.h + 4);
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; g.beginPath();
      if (horiz) for (let y = b.y + 10; y < b.y + b.h; y += 10) { g.moveTo(b.x, y); g.lineTo(b.x + b.w, y); }
      else for (let x = b.x + 10; x < b.x + b.w; x += 10) { g.moveTo(x, b.y); g.lineTo(x, b.y + b.h); }
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.1)';
      if (horiz) g.fillRect(b.x - 2, b.y + b.h / 2 - 2, b.w + 4, 4); else g.fillRect(b.x + b.w / 2 - 2, b.y - 2, 4, b.h + 4);
    } else if (b.roofStyle === 'ribbed') {
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2; g.beginPath();
      if (horiz) for (let x = b.x + 14; x < b.x + b.w; x += 14) { g.moveTo(x, b.y); g.lineTo(x, b.y + b.h); }
      else for (let y = b.y + 14; y < b.y + b.h; y += 14) { g.moveTo(b.x, y); g.lineTo(b.x + b.w, y); }
      g.stroke();
      g.fillStyle = 'rgba(160,200,220,0.12)';
      for (let k = 1; k <= 3; k++) { if (horiz) g.fillRect(b.x + b.w * k / 4 - 20, b.y + b.h / 2 - 30, 40, 60); else g.fillRect(b.x + b.w / 2 - 30, b.y + b.h * k / 4 - 20, 60, 40); }
    } else {
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 4; g.strokeRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 2; g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      // vents / AC units, deterministic per building
      const rnd = SV.makeRng(hash2(b.x, b.y, 9));
      const n = 1 + Math.floor(b.w * b.h / 60000);
      for (let k = 0; k < Math.min(n, 5); k++) {
        const vw = rnd.range(18, 40), vh = rnd.range(18, 34);
        const vx = b.x + rnd.range(20, b.w - 20 - vw), vy = b.y + rnd.range(20, b.h - 20 - vh);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(vx + 3, vy + 3, vw, vh);
        g.fillStyle = '#5a5c5e'; g.fillRect(vx, vy, vw, vh);
        g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.strokeRect(vx + 0.5, vy + 0.5, vw - 1, vh - 1);
        if (rnd.chance(0.5)) { g.beginPath(); g.arc(vx + vw / 2, vy + vh / 2, Math.min(vw, vh) * 0.3, 0, TAU); g.stroke(); }
      }
      if (b.kind === 'hospital') {
        g.fillStyle = 'rgba(200,40,40,0.8)';
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        g.fillRect(cx - 40, cy - 12, 80, 24); g.fillRect(cx - 12, cy - 40, 24, 80);
      }
      if (b.kind === 'police') {
        g.fillStyle = 'rgba(60,90,160,0.55)'; g.fillRect(b.x + 12, b.y + 12, Math.min(90, b.w - 24), 14);
      }
    }
    g.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ map markers
  function arrow(g, x, y, ang, s, col) {
    g.save(); g.translate(x, y); g.rotate(ang || 0);
    g.fillStyle = col || '#5ab0ff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * 0.7, s * 0.65); g.lineTo(-s * 0.35, 0); g.lineTo(-s * 0.7, -s * 0.65); g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }
  function bedPos(state) {
    const bed = state.base && state.base.bed;
    if (!bed) return null;
    if (typeof bed === 'object' && bed.x !== undefined) return { x: bed.x + (bed.w || 0) / 2, y: bed.y + (bed.h || 0) / 2 };
    const s = (state.structures || []).find((o) => o && o.id === bed);
    return s ? { x: s.x + (s.w || 0) / 2, y: s.y + (s.h || 0) / 2 } : null;
  }
  function bedIcon(g, x, y, s) {
    g.fillStyle = '#e8d070'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x + s * 0.65, y); g.lineTo(x + s * 0.65, y + s * 0.8); g.lineTo(x - s * 0.65, y + s * 0.8); g.lineTo(x - s * 0.65, y); g.lineTo(x - s, y); g.closePath();
    g.fill(); g.stroke();
  }
  function label(g, text, x, y, size, col, bold) {
    g.font = (bold ? 'bold ' : '') + size + 'px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(text, x, y);
    g.fillStyle = col; g.fillText(text, x, y);
  }

  // ------------------------------------------------------------------ public API
  SV.worldRender = {
    prepare,
    drawGround(ctx, state, cam) {
      ensure(state);
      if (!R.gidx) return;
      R.tick++;
      const v = camView(cam), m = 40;
      const c0 = Math.max(0, Math.floor((v.x - m) / CH)), c1 = Math.min(Math.ceil(SV.WORLD.w / CH) - 1, Math.floor((v.x + v.w + m) / CH));
      const r0 = Math.max(0, Math.floor((v.y - m) / CH)), r1 = Math.min(Math.ceil(SV.WORLD.h / CH) - 1, Math.floor((v.y + v.h + m) / CH));
      const budget = { n: R.chunks.size === 0 ? 16 : 1 };
      let built = 0;
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        const before = budget.n;
        const e = getChunk(state, cx, cy, budget);
        if (budget.n < before) built++;
        if (e && e.c) ctx.drawImage(e.c, cx * CH, cy * CH);
        else { ctx.fillStyle = SURF.forest; ctx.fillRect(cx * CH, cy * CH, CH, CH); }
      }
      // prefetch one neighbouring chunk per frame when idle
      if (!built) {
        outer: for (let cy = r0 - 1; cy <= r1 + 1; cy++) for (let cx = c0 - 1; cx <= c1 + 1; cx++) {
          if (cx < 0 || cy < 0 || cx * CH >= SV.WORLD.w || cy * CH >= SV.WORLD.h) continue;
          if (R.chunks.has(cx + ',' + cy)) continue;
          if (R.chunks.size >= MAXCH - 2) break outer;
          getChunk(state, cx, cy, { n: 1 });
          break outer;
        }
      }
    },
    drawSolids(ctx, state, cam) {
      ensure(state);
      const v = camView(cam), m = 70, t = now();
      const x = v.x - m, y = v.y - m, w = v.w + m * 2, h = v.h + m * 2;
      const list = R.solidsTmp, trees = R.treesTmp;
      list.length = 0; trees.length = 0;
      state.grid.each(x, y, w, h, (o) => {
        if (o.structure) return false;
        if (o.x > x + w || o.x + o.w < x || o.y > y + h || o.y + o.h < y) return false;
        if (o.kind === 'tree') trees.push(o); else list.push(o);
        return false;
      });
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        switch (o.kind) {
          case 'wall': case 'window': drawWall(ctx, o); break;
          case 'fence': drawFence(ctx, o); break;
          case 'car': drawCar(ctx, o, t); break;
          case 'rock': drawRock(ctx, o); break;
          case 'furniture': drawFurniture(ctx, o, t); break;
          default:
            ctx.fillStyle = '#4a4a46'; ctx.fillRect(o.x, o.y, o.w, o.h);
        }
      }
      for (let i = 0; i < trees.length; i++) drawTree(ctx, trees[i]);
    },
    drawRoofs(ctx, state, cam) {
      ensure(state);
      const v = camView(cam), m = 20;
      const T = now(), dt = Math.min(0.1, Math.max(0, T - (R.lastT || T)));
      R.lastT = T;
      const p = state.player;
      const inside = p && SV.world ? SV.world.buildingAt(state, p.x, p.y) : null;
      const list = R.bTmp; list.length = 0;
      if (SV.world && SV.world.buildingsIn) SV.world.buildingsIn(state, v.x - m, v.y - m, v.w + m * 2, v.h + m * 2, list);
      for (const b of list) {
        const target = b === inside ? 0 : 1;
        let a = R.roof.get(b.id);
        if (a === undefined) a = target;
        a = target > a ? Math.min(target, a + dt * 3.5) : Math.max(target, a - dt * 4.5);
        R.roof.set(b.id, a);
        if (a > 0.01) drawRoof(ctx, b, a);
      }
      // buildings that scrolled out of view snap back to their target next time
      if (inside && !list.includes(inside)) R.roof.set(inside.id, 0);
    },
    drawMinimap(ctx, state, x, y, w, h) {
      ensure(state);
      const p = state.player || state.spawnPoint || { x: 8000, y: 8000 };
      const span = 2600, k = w / span, spanH = h / k;
      const wx = p.x - span / 2, wy = p.y - spanH / 2;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.fillStyle = '#0d0f0c'; ctx.fillRect(x, y, w, h);
      blitMap(ctx, wx, wy, span, spanH, x, y, w, h);
      const toS = (px, py) => [x + (px - wx) * k, y + (py - wy) * k];
      for (const q of state.pois) {
        if (q.kind === 'district') continue;
        if (q.x < wx || q.y < wy || q.x > wx + span || q.y > wy + spanH) continue;
        const [sx, sy] = toS(q.x, q.y);
        ctx.fillStyle = POICOL[q.kind] || '#ddd'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, TAU); ctx.fill(); ctx.stroke();
      }
      for (const d of state.drops || []) {
        if (!d || d.kind !== 'deathbag') continue;
        const [sx, sy] = toS(d.x, d.y);
        ctx.fillStyle = '#e04545'; ctx.fillRect(sx - 3, sy - 3, 6, 6);
      }
      const bp = bedPos(state);
      if (bp) { const [sx, sy] = toS(bp.x, bp.y); bedIcon(ctx, Math.max(x + 6, Math.min(x + w - 6, sx)), Math.max(y + 6, Math.min(y + h - 6, sy)), 5); }
      const [px, py] = toS(p.x, p.y);
      arrow(ctx, px, py, state.player ? state.player.angle : 0, 6);
      ctx.restore();
      ctx.strokeStyle = 'rgba(200,200,190,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    },
    drawMap(ctx, state, x, y, w, h) {
      ensure(state);
      const size = Math.min(w, h), ox = x + (w - size) / 2, oy = y + (h - size) / 2, k = size / SV.WORLD.w;
      ctx.save();
      ctx.fillStyle = '#0d0f0c'; ctx.fillRect(x, y, w, h);
      if (R.map) ctx.drawImage(R.map, 0, 0, MAPRES, MAPRES, ox, oy, size, size);
      // subtle grid
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let g = 2000; g < SV.WORLD.w; g += 2000) { ctx.moveTo(ox + g * k, oy); ctx.lineTo(ox + g * k, oy + size); ctx.moveTo(ox, oy + g * k); ctx.lineTo(ox + size, oy + g * k); }
      ctx.stroke();
      const fs = Math.max(9, Math.round(size / 85));
      for (const q of state.pois) {
        const sx = ox + q.x * k, sy = oy + q.y * k;
        if (q.kind === 'district') { label(ctx, q.name.toUpperCase(), sx, sy, Math.round(fs * 1.35), 'rgba(232,232,224,0.75)', true); continue; }
        ctx.fillStyle = POICOL[q.kind] || '#ddd'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(3, fs * 0.38), 0, TAU); ctx.fill(); ctx.stroke();
        if (q.kind !== 'gas_station' || size > 700) label(ctx, q.name, sx, sy - fs, fs, POICOL[q.kind] || '#ddd', false);
      }
      for (const d of state.drops || []) {
        if (!d || d.kind !== 'deathbag') continue;
        const sx = ox + d.x * k, sy = oy + d.y * k;
        ctx.fillStyle = '#e04545'; ctx.fillRect(sx - 4, sy - 4, 8, 8);
        label(ctx, 'Your stuff', sx, sy - fs, fs, '#e04545', true);
      }
      const bp = bedPos(state);
      if (bp) { bedIcon(ctx, ox + bp.x * k, oy + bp.y * k, Math.max(6, fs * 0.7)); label(ctx, 'Base', ox + bp.x * k, oy + bp.y * k - fs * 1.2, fs, '#e8d070', true); }
      const p = state.player;
      if (p) arrow(ctx, ox + p.x * k, oy + p.y * k, p.angle, Math.max(7, fs * 0.8));
      ctx.strokeStyle = 'rgba(200,200,190,0.4)'; ctx.lineWidth = 2; ctx.strokeRect(ox + 1, oy + 1, size - 2, size - 2);
      ctx.restore();
    },
  };
})();
