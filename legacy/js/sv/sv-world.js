// sv-world.js — Survival city generation: roads, districts, enterable buildings with rooms,
// furniture & loot containers, cars, trees, military base. Deterministic from state.seed.
// Owned by the WORLD agent. See SURVIVAL_SPEC.md (WORLD section).
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const SV = (Z.sv = Z.sv || {});

  const T = 16;          // exterior wall thickness
  const PT = 10;         // interior partition thickness
  const DOOR = 64;       // exterior door gap
  const DOORWAY = 60;    // interior doorway gap
  const SWALK = 24;      // sidewalk width
  const CITY0 = 2000, CITY1 = 14000;
  const DCELL = 250;     // district lookup cell
  const BCELL = 256;     // building lookup cell
  let GEN = 0;

  // ------------------------------------------------------------------ palettes / names
  const CAR_COLORS = ['#6e2a26', '#2b4560', '#55575a', '#7d7046', '#3b5536', '#66676c', '#463a55', '#8d8c84', '#262626', '#74552a', '#5b2f3d'];
  const HOUSE_WALL = ['#5a5048', '#4f4a44', '#5c564c', '#4a4640', '#605448', '#55504a'];
  const HOUSE_ROOF = ['#4a2f2a', '#3a3a3e', '#523a2a', '#2f3a3a', '#5a4030', '#3e3430', '#44332e'];
  const NAMES = {
    house: ['Family Home', 'Bungalow', 'Ranch House', 'Townhouse', 'Cottage', 'Duplex', 'Split-Level Home'],
    cabin: ['Hunting Cabin', 'Woodland Cabin', 'Old Shack', 'Trapper Cabin', 'Lakeside Cabin'],
    store: {
      market: ['Corner Market', 'QuickStop Grocery', 'Fresh Farms Market', 'Bargain Mart', '24/7 Mini Mart'],
      pharmacy: ['Main St. Pharmacy', 'Wellness Drugstore', 'CarePlus Pharmacy'],
      hardware: ["Hank's Hardware", 'Nail & Bolt Supply', 'DIY Depot'],
      clothing: ['Thrift Threads', 'Outdoor Outfitters', 'Fashion Outlet'],
      diner: ["Rosie's Diner", 'Starlight Diner', 'Route 9 Grill'],
      liquor: ['Liquor & Smokes', 'Bottle Shop'],
      sports: ['Peak Sporting Goods', 'Great Outdoors Supply'],
    },
    gun_store: ['Lock & Load Firearms', 'Bullseye Gun Shop', 'Liberty Arms & Ammo', 'Frontier Firearms', 'Iron Sight Armory'],
    police: ['Police Precinct', 'Sheriff Station', 'Police Substation'],
    hospital: ['St. Mercy Hospital', 'County General Hospital', 'Riverside Medical Center'],
    office: ['Meridian Tower', 'Halcyon Insurance', 'Granite Savings Bank', 'City Records Office', 'Apex Logistics HQ', 'Sterling Law Offices', 'Northgate Offices', 'Daily Herald Building', 'Vantage Telecom'],
    warehouse: ['Riverside Storage', 'Cold Storage Depot', 'Freight Depot', 'Ironworks Warehouse', 'Parts Distribution', 'Lumber Yard Storage'],
    school: ['Westbrook High School', 'Maple Elementary', 'Oak Hill Middle School'],
    gas_station: ['Gas-N-Go', 'Fuel Stop', 'Highway Gas', 'Petro Express'],
  };
  const PARK_NAMES = ['Liberty Park', 'Memorial Park', 'Riverside Green', 'Founders Square', 'Elm Grove Park', 'Willow Commons'];
  const SUBURB_NAMES = ['Maple Heights', 'Cedar Hills', 'Pleasant Grove', 'Sunnyvale Estates', 'Briarwood', 'Fox Run'];
  const FOREST_NAMES = ['Blackpine Woods', 'Hollow Creek Forest', 'Ravenwood', 'Grey Timber'];

  // ------------------------------------------------------------------ small helpers
  function ov(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function grow(r, m) { return { x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 }; }
  function hitsGrid(grid, x, y, w, h) {
    let hit = false;
    grid.each(x, y, w, h, (o) => {
      if (o.solid === false && o.kind !== undefined && o.kind !== 'clear') return false;
      if (o.x < x + w && o.x + o.w > x && o.y < y + h && o.y + o.h > y) { hit = true; return true; }
      return false;
    });
    return hit;
  }
  function inWorld(r) { return r.x >= 4 && r.y >= 4 && r.x + r.w <= SV.WORLD.w - 4 && r.y + r.h <= SV.WORLD.h - 4; }

  // ------------------------------------------------------------------ generation context
  function newCtx(state) {
    const W = SV.WORLD.w, H = SV.WORLD.h;
    return {
      state, W, H,
      rng: SV.makeRng((state.seed ^ 0x5bd1e995) >>> 0),
      clear: new SV.Grid(W, H, 256),      // keep-out rects (door clearances)
      access: new SV.Grid(W, H, 256),     // access strips in front of wall furniture (only wall items respect them)
      reserved: new SV.Grid(W, H, 512),   // lots/roads/buildings (no trees/cars)
      quota: { police: 0, hospital: 0, gun_store: 0, school: 0, gas_station: 0 },
      parkNames: 0,
    };
  }
  function addClear(G, r) { G.clear.insert({ x: r.x, y: r.y, w: r.w, h: r.h }); }
  function reserve(G, r) { G.reserved.insert({ x: r.x, y: r.y, w: r.w, h: r.h }); }
  function solid(G, o) { return SV.phys.addSolid(G.state, o); }
  // true if rect r doesn't overlap any solid (padded) or clearance rect
  function placeOk(G, r, pad) {
    pad = pad || 0;
    if (!inWorld(r)) return false;
    if (hitsGrid(G.state.grid, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2)) return false;
    if (hitsGrid(G.clear, r.x, r.y, r.w, r.h)) return false;
    return true;
  }
  function decor(G, kind, x, y, w, h, extra) {
    const d = { kind, x, y, w, h };
    if (extra) for (const k in extra) d[k] = extra[k];
    G.state.decor.push(d);
    return d;
  }
  function lot(G, r, surface, extra) { return decor(G, 'lot', r.x, r.y, r.w, r.h, Object.assign({ surface }, extra || {})); }

  // furniture + containers --------------------------------------------------------
  function furn(G, r, sub, tall, extra) {
    const o = { x: r.x, y: r.y, w: r.w, h: r.h, kind: 'furniture', sub, tall: !!tall,
      blocksBullets: !!tall, blocksSight: !!tall };
    if (extra) for (const k in extra) o[k] = extra[k];
    return solid(G, o);
  }
  function makeContainer(G, r, kind, name, tier, b) {
    const c = { id: 'c' + G.state.containers.length, x: r.x, y: r.y, w: r.w, h: r.h, kind, name,
      tier: Math.max(0, Math.min(3, tier | 0)), buildingId: b ? b.id : null, searched: false, inv: null };
    G.state.containers.push(c);
    return c;
  }
  function cont(G, r, kind, name, tier, b, sub, tall) {
    const c = makeContainer(G, r, kind, name, tier, b);
    furn(G, r, sub || kind, tall, { container: c });
    return c;
  }

  // ------------------------------------------------------------------ districts
  function districtBase(G, x, y) {
    const M = G.meta;
    if (x >= M.baseRect.x && x <= M.baseRect.x + M.baseRect.w && y >= M.baseRect.y && y <= M.baseRect.y + M.baseRect.h) return 'military';
    if (x < M.cityRect.x || y < M.cityRect.y || x > M.cityRect.x + M.cityRect.w || y > M.cityRect.y + M.cityRect.h) return 'forest';
    if (x >= M.excl.x && x <= M.excl.x + M.excl.w && y >= M.excl.y && y <= M.excl.y + M.excl.h) return 'forest';
    const dd = Math.hypot(x - M.downtown.x, y - M.downtown.y);
    if (dd < M.downtown.r) return 'downtown';
    const di = Math.hypot(x - M.industrial.x, y - M.industrial.y);
    if (di < M.industrial.r) return 'industrial';
    return 'suburb';
  }
  const DCODE = { suburb: 0, downtown: 1, industrial: 2, forest: 3, military: 4 };
  const DNAME = ['suburb', 'downtown', 'industrial', 'forest', 'military'];
  function paintDistrict(G, r, d) {
    const M = G.meta, c0 = Math.max(0, Math.floor(r.x / DCELL)), c1 = Math.min(M.dcols - 1, Math.floor((r.x + r.w) / DCELL));
    const r0 = Math.max(0, Math.floor(r.y / DCELL)), r1 = Math.min(M.drows - 1, Math.floor((r.y + r.h) / DCELL));
    for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) {
      const cx = (i + 0.5) * DCELL, cy = (j + 0.5) * DCELL;
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) M.dgrid[j * M.dcols + i] = DCODE[d];
    }
  }

  // ------------------------------------------------------------------ roads
  function makeLines(rng) {
    const out = [];
    let pos = CITY0, i = 0;
    for (;;) {
      out.push({ c: pos, avenue: i % 3 === 0 });
      i++;
      const next = pos + rng.int(1080, 1340);
      if (next > CITY1) break;
      pos = next;
    }
    out[out.length - 1].avenue = true;
    for (const l of out) l.aw = l.avenue ? 150 : 100;
    return out;
  }
  function addRoad(G, dir, a0, a1, c, aw, kind) {
    if (a1 - a0 < 40) return;
    const r = dir === 'h' ? { x: a0, y: c - aw / 2, w: a1 - a0, h: aw } : { x: c - aw / 2, y: a0, w: aw, h: a1 - a0 };
    r.kind = kind; r.dir = dir; r.sw = kind === 'rural' ? 0 : SWALK; r.cross = [];
    // clip against the military exclusion zone
    const E = G.meta.excl;
    if (ov(r, E) && !r.noClip) {
      if (dir === 'h') {
        if (E.x > a0) addRoadRaw(G, Object.assign({}, r, { w: E.x - a0 }));
        if (E.x + E.w < a1) addRoadRaw(G, Object.assign({}, r, { x: E.x + E.w, w: a1 - (E.x + E.w), cross: [] }));
      } else {
        if (E.y > a0) addRoadRaw(G, Object.assign({}, r, { h: E.y - a0 }));
        if (E.y + E.h < a1) addRoadRaw(G, Object.assign({}, r, { y: E.y + E.h, h: a1 - (E.y + E.h), cross: [] }));
      }
      return;
    }
    addRoadRaw(G, r);
  }
  function addRoadRaw(G, r) {
    if ((r.dir === 'h' ? r.w : r.h) < 40) return;
    r.cross = [];
    G.state.roads.push(r);
    reserve(G, grow(r, r.sw + 30));
  }
  function computeCrossings(G) {
    const roads = G.state.roads, H = roads.filter((r) => r.dir === 'h'), V = roads.filter((r) => r.dir === 'v');
    G.meta.inters = [];
    for (const h of H) for (const v of V) {
      if (!ov(h, v)) continue;
      const x0 = Math.max(h.x, v.x), x1 = Math.min(h.x + h.w, v.x + v.w), y0 = Math.max(h.y, v.y), y1 = Math.min(h.y + h.h, v.y + v.h);
      h.cross.push([x0, x1]); v.cross.push([y0, y1]);
      const it = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, city: h.kind !== 'rural' && v.kind !== 'rural' };
      G.meta.inters.push(it);
      if (it.city) {
        // crosswalks on the four approaches (only where the road continues)
        const cw = 22, gap = 6;
        if (v.y < y0 - 40) decor(G, 'crosswalk', v.x + 4, y0 - gap - cw, v.w - 8, cw, { dir: 'h' });
        if (v.y + v.h > y1 + 40) decor(G, 'crosswalk', v.x + 4, y1 + gap, v.w - 8, cw, { dir: 'h' });
        if (h.x < x0 - 40) decor(G, 'crosswalk', x0 - gap - cw, h.y + 4, cw, h.h - 8, { dir: 'v' });
        if (h.x + h.w > x1 + 40) decor(G, 'crosswalk', x1 + gap, h.y + 4, cw, h.h - 8, { dir: 'v' });
      }
    }
  }

  // ------------------------------------------------------------------ building layout (canonical frame: front = bottom)
  // canonical rect -> world rect for building b (cw = width along front, ch = depth)
  function xf(b, r) {
    const cw = b.cw, ch = b.ch;
    switch (b.front) {
      case 'n': return { x: b.x + cw - r.x - r.w, y: b.y + ch - r.y - r.h, w: r.w, h: r.h };
      case 'e': return { x: b.x + r.y, y: b.y + cw - r.x - r.w, w: r.h, h: r.w };
      case 'w': return { x: b.x + ch - r.y - r.h, y: b.y + r.x, w: r.h, h: r.w };
      default: return { x: b.x + r.x, y: b.y + r.y, w: r.w, h: r.h };
    }
  }

  function newLayout(cw, ch) {
    return { cw, ch, I: { x: T, y: T, w: cw - T * 2, h: ch - T * 2 }, rooms: [], walls: [], doorways: [], doors: [], clear: [] };
  }
  // add a partition wall line with gaps (gaps: [[a0,a1]] along the wall axis)
  function partition(L, vert, fixed, a0, a1, gaps) {
    gaps = gaps.slice().sort((p, q) => p[0] - q[0]);
    let cur = a0;
    for (const g of gaps) {
      if (g[0] > cur) L.walls.push(vert ? { x: fixed, y: cur, w: PT, h: g[0] - cur, part: true } : { x: cur, y: fixed, w: g[0] - cur, h: PT, part: true });
      const d = vert ? { x: fixed, y: g[0], w: PT, h: g[1] - g[0] } : { x: g[0], y: fixed, w: g[1] - g[0], h: PT };
      L.doorways.push(d);
      L.clear.push(vert ? { x: fixed - 100, y: g[0] - 16, w: PT + 200, h: g[1] - g[0] + 32 } : { x: g[0] - 16, y: fixed - 100, w: g[1] - g[0] + 32, h: PT + 200 });
      cur = g[1];
    }
    if (a1 > cur) L.walls.push(vert ? { x: fixed, y: cur, w: PT, h: a1 - cur, part: true } : { x: cur, y: fixed, w: a1 - cur, h: PT, part: true });
  }

  function layoutBSP(L, rng, maxRooms, minDim) {
    const rooms = [Object.assign({ type: 'room' }, L.I)];
    let guard = 0;
    while (rooms.length < maxRooms && guard++ < 40) {
      let bi = -1, ba = 0;
      for (let i = 0; i < rooms.length; i++) if (!rooms[i].done && rooms[i].w * rooms[i].h > ba) { ba = rooms[i].w * rooms[i].h; bi = i; }
      if (bi < 0) break;
      const r = rooms[bi];
      const vert = r.w > r.h * 1.15 ? true : r.h > r.w * 1.15 ? false : rng.chance(0.5);
      const len = vert ? r.w : r.h, other = vert ? r.h : r.w;
      if (len < minDim * 2 + PT || other < DOORWAY + 40) { r.done = true; continue; }
      let ok = false;
      for (let a = 0; a < 10 && !ok; a++) {
        const s = Math.round(rng.range(minDim, len - minDim - PT));
        const wr = vert ? { x: r.x + s, y: r.y, w: PT, h: r.h } : { x: r.x, y: r.y + s, w: r.w, h: PT };
        const gw = grow(wr, 30);
        if (L.doorways.some((d) => ov(d, gw))) continue;
        const g0 = Math.round(rng.range((vert ? r.y : r.x) + 20, (vert ? r.y + r.h : r.x + r.w) - 20 - DOORWAY));
        partition(L, vert, vert ? r.x + s : r.y + s, vert ? r.y : r.x, vert ? r.y + r.h : r.x + r.w, [[g0, g0 + DOORWAY]]);
        const A = vert ? { x: r.x, y: r.y, w: s, h: r.h } : { x: r.x, y: r.y, w: r.w, h: s };
        const B = vert ? { x: r.x + s + PT, y: r.y, w: r.w - s - PT, h: r.h } : { x: r.x, y: r.y + s + PT, w: r.w, h: r.h - s - PT };
        A.type = B.type = 'room';
        rooms.splice(bi, 1, A, B);
        ok = true;
      }
      if (!ok) r.done = true;
    }
    for (const r of rooms) { delete r.done; L.rooms.push(r); }
  }

  // split [a0,a1] into segments of roughly [mn,mx] length
  function segments(rng, a0, a1, mn, mx) {
    const out = [];
    let cur = a0;
    while (a1 - cur > mx) {
      let s = rng.range(mn, mx);
      if (a1 - cur - s - PT < mn) s = (a1 - cur - PT) / 2;
      s = Math.round(s);
      out.push([cur, cur + s]);
      cur += s + PT;
    }
    out.push([cur, a1]);
    return out;
  }

  // Corridor along the longer interior axis, rooms on both sides with doorways onto it.
  function layoutCorridor(L, rng, cwid, mn, mx) {
    const I = L.I, horiz = I.w >= I.h;
    const across = horiz ? I.h : I.w;
    const d1 = Math.round((across - cwid - PT * 2) / 2), d2 = across - cwid - PT * 2 - d1;
    if (d1 < 120) { layoutBSP(L, rng, 6, 130); return; }
    const along0 = horiz ? I.x : I.y, along1 = horiz ? I.x + I.w : I.y + I.h, base = horiz ? I.y : I.x;
    const cor = horiz ? { x: I.x, y: base + d1 + PT, w: I.w, h: cwid } : { x: base + d1 + PT, y: I.y, w: cwid, h: I.h };
    cor.type = 'corridor';
    L.rooms.push(cor);
    const sides = [[base, d1, base + d1], [base + d1 + PT + cwid + PT, d2, base + d1 + PT + cwid]];
    for (const [s0, depth, wallPos] of sides) {
      const segs = segments(rng, along0, along1, mn, mx), gaps = [];
      for (let k = 0; k < segs.length; k++) {
        const [a, b] = segs[k];
        const room = horiz ? { x: a, y: s0, w: b - a, h: depth } : { x: s0, y: a, w: depth, h: b - a };
        room.type = 'room';
        L.rooms.push(room);
        const g0 = Math.round(rng.range(a + 24, Math.max(a + 24, b - 24 - DOORWAY)));
        gaps.push([g0, g0 + DOORWAY]);
        if (k < segs.length - 1) {
          if (horiz) L.walls.push({ x: b, y: s0, w: PT, h: depth, part: true });
          else L.walls.push({ x: s0, y: b, w: depth, h: PT, part: true });
        }
      }
      partition(L, !horiz, wallPos, along0, along1, gaps);
    }
    L.corridorAxis = horiz ? 'x' : 'y';
  }

  // Big front hall, strip of back rooms along the back wall each with a doorway to the hall.
  function layoutHall(L, rng, backDepth, nBack) {
    const I = L.I;
    if (I.h - backDepth - PT < 140 || nBack <= 0) { L.rooms.push(Object.assign({ type: 'hall' }, I)); return; }
    const wy = I.y + backDepth;
    const segs = segments(rng, I.x, I.x + I.w, Math.max(130, I.w / nBack - 40), Math.max(160, I.w / nBack + 40)), gaps = [];
    for (let k = 0; k < segs.length; k++) {
      const [a, b] = segs[k];
      L.rooms.push({ x: a, y: I.y, w: b - a, h: backDepth, type: 'back' });
      const g0 = Math.round(rng.range(a + 20, Math.max(a + 20, b - 20 - DOORWAY)));
      gaps.push([g0, g0 + DOORWAY]);
      if (k < segs.length - 1) L.walls.push({ x: b, y: I.y, w: PT, h: backDepth, part: true });
    }
    partition(L, false, wy, I.x, I.x + I.w, gaps);
    L.rooms.push({ x: I.x, y: wy + PT, w: I.w, h: I.y + I.h - wy - PT, type: 'hall' });
  }

  function touches(L, r, side) {
    const I = L.I;
    if (side === 'front') return r.y + r.h >= I.y + I.h - 0.5;
    if (side === 'back') return r.y <= I.y + 0.5;
    if (side === 'left') return r.x <= I.x + 0.5;
    return r.x + r.w >= I.x + I.w - 0.5;
  }
  function placeDoor(L, rng, side, dw, prefer) {
    const cands = L.rooms.filter((r) => touches(L, r, side));
    cands.sort((a, b) => ((prefer && b.type === prefer) ? 1 : 0) - ((prefer && a.type === prefer) ? 1 : 0) || (b.w * b.h - a.w * a.h));
    const horizSide = side === 'front' || side === 'back';
    for (const r of cands) {
      const s0 = horizSide ? r.x : r.y, len = horizSide ? r.w : r.h;
      if (len < dw + 40) continue;
      for (let a = 0; a < 6; a++) {
        const slack = (len - dw - 40) / 2;
        const pos = Math.round(s0 + (len - dw) / 2 + rng.range(-slack, slack) * (a === 0 ? 0.4 : 1));
        let g;
        if (side === 'front') g = { x: pos, y: L.ch - T, w: dw, h: T };
        else if (side === 'back') g = { x: pos, y: 0, w: dw, h: T };
        else if (side === 'left') g = { x: 0, y: pos, w: T, h: dw };
        else g = { x: L.cw - T, y: pos, w: T, h: dw };
        const gg = grow(g, 14);
        if (L.walls.some((w) => w.part && ov(w, gg))) continue;
        if (L.doors.some((d) => ov(grow(d, 40), g))) continue;
        g.side = side;
        L.doors.push(g);
        // clearance inside and outside
        if (horizSide) L.clear.push({ x: g.x - 22, y: g.y - 100, w: dw + 44, h: T + 200 });
        else L.clear.push({ x: g.x - 100, y: g.y - 22, w: T + 200, h: dw + 44 });
        r.hasDoor = true;
        return g;
      }
    }
    return null;
  }
  // exterior walls with door gaps and windows
  function perimeter(L, rng, windows) {
    const cw = L.cw, ch = L.ch;
    const sides = [
      { side: 'back', vert: false, fixed: 0, a0: 0, a1: cw },
      { side: 'front', vert: false, fixed: ch - T, a0: 0, a1: cw },
      { side: 'left', vert: true, fixed: 0, a0: T, a1: ch - T },
      { side: 'right', vert: true, fixed: cw - T, a0: T, a1: ch - T },
    ];
    for (const S of sides) {
      const gaps = L.doors.filter((d) => d.side === S.side).map((d) => S.vert ? [d.y, d.y + d.h] : [d.x, d.x + d.w]).sort((p, q) => p[0] - q[0]);
      const solidSegs = [];
      let cur = S.a0;
      for (const g of gaps) { if (g[0] > cur) solidSegs.push([cur, g[0]]); cur = g[1]; }
      if (S.a1 > cur) solidSegs.push([cur, S.a1]);
      for (const [a, b] of solidSegs) {
        const pieces = [];
        if (windows && b - a >= 130) {
          const n = Math.max(1, Math.floor((b - a - 40) / 150)), step = (b - a) / n, ww = 44;
          let c = a;
          for (let k = 0; k < n; k++) {
            if (!rng.chance(windows)) continue;
            const w0 = Math.round(a + step * (k + 0.5) - ww / 2);
            const wr = S.vert ? { x: S.fixed, y: w0, w: T, h: ww } : { x: w0, y: S.fixed, w: ww, h: T };
            const probe = S.vert ? { x: wr.x - 2, y: wr.y - 22, w: T + 4, h: ww + 44 } : { x: wr.x - 22, y: wr.y - 2, w: ww + 44, h: T + 4 };
            if (L.walls.some((w) => w.part && ov(w, probe))) continue;
            if (w0 - c > 0) pieces.push([c, w0, 'wall']);
            pieces.push([w0, w0 + ww, 'window']);
            c = w0 + ww;
          }
          if (b > c) pieces.push([c, b, 'wall']);
        } else pieces.push([a, b, 'wall']);
        for (const [p0, p1, kind] of pieces) {
          L.walls.push(S.vert ? { x: S.fixed, y: p0, w: T, h: p1 - p0, kind } : { x: p0, y: S.fixed, w: p1 - p0, h: T, kind });
        }
      }
    }
  }

  // ------------------------------------------------------------------ building factory
  // opts: {x,y,cw,ch,front,kind,name,tier,layout:'bsp'|'corridor'|'hall'|'single', rooms, minDim, backDepth, nBack,
  //        doors:[{side,w,prefer}], windows (prob), wallColor, roofColor, roofStyle, floor, sub, types(fn)}
  function makeBuilding(G, o) {
    const rng = G.rng;
    const front = o.front || 's';
    const b = {
      id: 'b' + G.state.buildings.length, x: o.x, y: o.y,
      w: (front === 'n' || front === 's') ? o.cw : o.ch, h: (front === 'n' || front === 's') ? o.ch : o.cw,
      kind: o.kind, name: o.name, tier: o.tier || 0, doors: [], rooms: [],
      floorColor: o.floor || '#3a342c', roofColor: o.roofColor || '#3a3a3e', wallColor: o.wallColor || '#4a4c4f',
      roofStyle: o.roofStyle || 'flat', sub: o.sub || null, front, cw: o.cw, ch: o.ch,
    };
    const bb = { x: b.x, y: b.y, w: b.w, h: b.h };
    if (!inWorld(bb) || hitsGrid(G.state.grid, bb.x - 2, bb.y - 2, bb.w + 4, bb.h + 4)) return null;
    const L = newLayout(o.cw, o.ch);
    if (o.layout === 'corridor') layoutCorridor(L, rng, o.corridorW || 110, o.roomMin || 190, o.roomMax || 300);
    else if (o.layout === 'hall') layoutHall(L, rng, o.backDepth || 150, o.nBack || 2);
    else if (o.layout === 'single') L.rooms.push(Object.assign({ type: 'hall' }, L.I));
    else layoutBSP(L, rng, o.rooms || 4, o.minDim || 120);
    const doors = o.doors || [{ side: 'front', w: DOOR }];
    for (const d of doors) placeDoor(L, rng, d.side, d.w || DOOR, d.prefer);
    if (!L.doors.length) placeDoor(L, rng, 'front', DOOR) || placeDoor(L, rng, 'left', DOOR) || placeDoor(L, rng, 'right', DOOR) || placeDoor(L, rng, 'back', DOOR);
    perimeter(L, rng, o.windows === undefined ? 0.6 : o.windows);
    // emit (world coords)
    for (const w of L.walls) {
      const r = xf(b, w);
      const isWin = w.kind === 'window';
      solid(G, { x: r.x, y: r.y, w: r.w, h: r.h, kind: isWin ? 'window' : 'wall', color: b.wallColor, inner: !!w.part, bid: b.id,
        blocksSight: !isWin });
    }
    for (const d of L.doors) { const r = xf(b, d); r.side = d.side; b.doors.push(r); }
    for (const c of L.clear) addClear(G, xf(b, c));
    for (const d of L.doorways) { const r = xf(b, d); r.inner = true; (b.doorways = b.doorways || []).push(r); }
    for (const r0 of L.rooms) {
      const r = xf(b, r0);
      r.type = r0.type; r.hasDoor = !!r0.hasDoor;
      b.rooms.push(r);
    }
    G.state.buildings.push(b);
    reserve(G, grow(bb, 30));
    // room types + furnishing
    if (o.types) o.types(b, L);
    else assignTypes(G, b);
    for (const r of b.rooms) furnishRoom(G, b, r);
    // a little blood/debris inside some buildings
    if (rng.chance(0.35)) {
      const r = rng.pick(b.rooms);
      decor(G, 'blood', r.x + rng.range(10, r.w - 30), r.y + rng.range(10, r.h - 30), rng.range(14, 30), rng.range(10, 26), { rot: rng.range(0, 6.28) });
    }
    return b;
  }

  // ------------------------------------------------------------------ room typing
  function assignTypes(G, b) {
    const rng = G.rng;
    const rooms = b.rooms.filter((r) => r.type !== 'corridor').sort((a, c) => c.w * c.h - a.w * a.h);
    const k = b.kind;
    const setAll = (t) => rooms.forEach((r) => { if (r.type === 'room' || r.type === 'back' || r.type === 'hall') r.type = t; });
    if (k === 'house') {
      const list = b.sub === 'cabin' ? ['living', 'bedroom', 'kitchen', 'bathroom'] : ['living', 'kitchen', 'bedroom', 'bedroom', 'bathroom', 'bedroom'];
      rooms.forEach((r, i) => { r.type = list[Math.min(i, list.length - 1)]; });
      if (rooms.length >= 3) { rooms[rooms.length - 1].type = 'bathroom'; }
      if (rooms.length === 2) { rooms[0].type = 'living'; rooms[1].type = 'bedroom'; rooms[0].kitchenToo = true; }
      if (rooms.length === 1) { rooms[0].type = 'living'; rooms[0].kitchenToo = true; rooms[0].bedToo = true; }
      return;
    }
    if (k === 'store') {
      for (const r of rooms) r.type = r.type === 'hall' ? (b.sub === 'diner' ? 'diner' : 'sales') : 'storeroom';
      const backs = rooms.filter((r) => r.type === 'storeroom');
      if (backs.length > 1) backs[backs.length - 1].type = rng.chance(0.5) ? 'office' : 'restroom';
      return;
    }
    if (k === 'gun_store') {
      for (const r of rooms) r.type = r.type === 'hall' ? 'gunsales' : 'gunvault';
      const backs = rooms.filter((r) => r.type === 'gunvault');
      if (backs.length > 1) backs[backs.length - 1].type = 'office';
      return;
    }
    if (k === 'gas_station') {
      for (const r of rooms) r.type = r.type === 'hall' ? 'gassales' : 'storeroom';
      const backs = rooms.filter((r) => r.type === 'storeroom');
      if (backs.length > 1) backs[backs.length - 1].type = 'restroom';
      return;
    }
    if (k === 'warehouse') {
      for (const r of rooms) r.type = r.type === 'hall' ? 'warehall' : 'storage';
      const backs = rooms.filter((r) => r.type === 'storage');
      if (backs.length > 1) backs[0].type = 'office';
      if (backs.length > 2) backs[backs.length - 1].type = 'break';
      return;
    }
    // corridor-style buildings: entry room (with exterior door) becomes lobby
    const lobby = rooms.find((r) => r.hasDoor);
    const pool = rooms.filter((r) => r !== lobby);
    const take = (t, n) => { for (let i = 0; i < n && pool.length; i++) { const idx = Math.floor(rng.next() * pool.length); pool.splice(idx, 1)[0].type = t; } };
    if (lobby) lobby.type = 'lobby';
    if (k === 'office') { take('break', 1); take('meeting', 1); setAll('office'); pool.forEach((r) => { r.type = 'office'; }); }
    else if (k === 'police') { take('armory', 1); take('lockers', 1); take('cells', rng.int(1, 2)); pool.forEach((r) => { r.type = 'office'; }); }
    else if (k === 'hospital') { take('pharmacy', 2); take('lockers', 1); take('office', 1); pool.forEach((r) => { r.type = 'ward'; }); }
    else if (k === 'school') {
      // biggest room is the cafeteria
      const big = pool.sort((a, c) => c.w * c.h - a.w * a.h)[0];
      if (big) { big.type = 'cafeteria'; pool.splice(0, 1); }
      take('office', 1); pool.forEach((r) => { r.type = 'classroom'; });
    } else if (k === 'military') {
      const t = b.sub === 'armory' ? 'marmory' : b.sub === 'barracks' ? 'barracks' : 'comms';
      if (b.sub === 'armory') { rooms.forEach((r) => { r.type = r.type === 'hall' ? 'marmory' : 'mvault'; }); return; }
      take('lockers', b.sub === 'barracks' ? 1 : 0); pool.forEach((r) => { r.type = t; });
      if (lobby && b.sub === 'barracks') lobby.type = 'barracks';
    } else pool.forEach((r) => { r.type = 'office'; });
  }

  // ------------------------------------------------------------------ furnishing
  const OPP = { n: 's', s: 'n', w: 'e', e: 'w' };
  function wallItem(G, room, along, depth, sides) {
    const rng = G.rng;
    room._d = room._d || { n: 0, s: 0, w: 0, e: 0 };
    sides = sides || ['n', 's', 'w', 'e'];
    for (let t = 0; t < 14; t++) {
      const side = sides[Math.floor(rng.next() * sides.length)];
      const vertWall = side === 'w' || side === 'e';
      const dim = vertWall ? room.w : room.h, len = vertWall ? room.h : room.w;
      if (depth + room._d[OPP[side]] > dim - 66) continue;
      if (along > len - 8) continue;
      const pos = Math.round(rng.range(4, len - along - 4));
      let r;
      if (side === 'n') r = { x: room.x + pos, y: room.y + 2, w: along, h: depth };
      else if (side === 's') r = { x: room.x + pos, y: room.y + room.h - 2 - depth, w: along, h: depth };
      else if (side === 'w') r = { x: room.x + 2, y: room.y + pos, w: depth, h: along };
      else r = { x: room.x + room.w - 2 - depth, y: room.y + pos, w: depth, h: along };
      if (!placeOk(G, r, 1)) continue;
      // keep an access strip in front of the item free (so corners can't box it in)
      // strip from the item's face to the room's midline, at least 36 wide
      const sw = Math.max(along + 8, 46), mid = vertWall ? room.x + room.w / 2 : room.y + room.h / 2;
      const s0 = Math.max(vertWall ? room.y : room.x, (vertWall ? r.y + r.h / 2 : r.x + r.w / 2) - sw / 2);
      const s1 = Math.min(vertWall ? room.y + room.h : room.x + room.w, s0 + sw);
      let az;
      if (side === 'n') az = { x: s0, y: r.y + r.h, w: s1 - s0, h: Math.max(20, mid - r.y - r.h) };
      else if (side === 's') az = { x: s0, y: Math.min(mid, r.y - 20), w: s1 - s0, h: Math.max(20, r.y - mid) };
      else if (side === 'w') az = { x: r.x + r.w, y: s0, w: Math.max(20, mid - r.x - r.w), h: s1 - s0 };
      else az = { x: Math.min(mid, r.x - 20), y: s0, w: Math.max(20, r.x - mid), h: s1 - s0 };
      if (hitsGrid(G.state.grid, az.x, az.y, az.w, az.h)) continue;
      if (hitsGrid(G.access, r.x, r.y, r.w, r.h)) continue;
      G.access.insert(az);
      room._d[side] = Math.max(room._d[side], depth + 2);
      r.side = side;
      return r;
    }
    return null;
  }
  function centerItem(G, room, w, h) {
    if (w < 30 || h < 20) return null;
    const d = room._d || { n: 0, s: 0, w: 0, e: 0 };
    const x0 = room.x + d.w + 42, x1 = room.x + room.w - d.e - 42, y0 = room.y + d.n + 42, y1 = room.y + room.h - d.s - 42;
    if (x1 - x0 < w || y1 - y0 < h) return null;
    const r = { x: Math.round((x0 + x1 - w) / 2 + G.rng.range(-1, 1) * (x1 - x0 - w) * 0.3), y: Math.round((y0 + y1 - h) / 2 + G.rng.range(-1, 1) * (y1 - y0 - h) * 0.3), w, h };
    if (!placeOk(G, r, 1)) return null;
    return r;
  }
  // grid of items in the free middle of a room; cb(rect, index)
  function rowItems(G, room, iw, ih, gapX, gapY, margin, cb) {
    const d = room._d || { n: 0, s: 0, w: 0, e: 0 };
    const x0 = room.x + d.w + margin, x1 = room.x + room.w - d.e - margin, y0 = room.y + d.n + margin, y1 = room.y + room.h - d.s - margin;
    let n = 0;
    if (x1 - x0 < iw || y1 - y0 < ih) return 0;
    const nx = Math.max(1, Math.floor((x1 - x0 + gapX) / (iw + gapX))), ny = Math.max(1, Math.floor((y1 - y0 + gapY) / (ih + gapY)));
    const ox = x0 + (x1 - x0 - (nx * iw + (nx - 1) * gapX)) / 2, oy = y0 + (y1 - y0 - (ny * ih + (ny - 1) * gapY)) / 2;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const r = { x: Math.round(ox + i * (iw + gapX)), y: Math.round(oy + j * (ih + gapY)), w: iw, h: ih };
      if (!placeOk(G, r, 1)) continue;
      cb(r, n++);
    }
    return n;
  }
  // place along a wall; spec = [along, depth, sub, tall, containerKind?, containerName?]
  function W(G, b, room, along, depth, sub, tall, ck, cn, sides, tierAdj) {
    const r = wallItem(G, room, along, depth, sides);
    if (!r) return null;
    if (ck) cont(G, r, ck, cn, b.tier + (tierAdj || 0), b, sub, tall);
    else furn(G, r, sub, tall);
    return r;
  }
  function C(G, b, room, w, h, sub, tall, ck, cn) {
    const r = centerItem(G, room, w, h);
    if (!r) return null;
    if (ck) cont(G, r, ck, cn, b.tier, b, sub, tall); else furn(G, r, sub, tall);
    return r;
  }
  function rep(n, fn) { for (let i = 0; i < n; i++) fn(i); }

  function furnishRoom(G, b, room) {
    const rng = G.rng, t = room.type;
    // long axis side lists (for along-wall rows like lockers)
    const longSides = room.w >= room.h ? ['n', 's'] : ['w', 'e'];
    switch (t) {
      case 'living':
        W(G, b, room, 110, 42, 'sofa', false);
        if (rng.chance(0.7)) W(G, b, room, 70, 20, 'tv', false);
        if (rng.chance(0.6)) W(G, b, room, 60, 26, 'cabinet', true, 'cabinet', 'Living Room Cabinet');
        if (rng.chance(0.5)) W(G, b, room, 80, 22, 'bookshelf', true);
        if (rng.chance(0.5)) W(G, b, room, 40, 40, 'armchair', false);
        if (room.kitchenToo) { W(G, b, room, 44, 40, 'fridge', true, 'fridge', 'Fridge'); W(G, b, room, 70, 30, 'cabinet', false, 'cabinet', 'Kitchen Cabinet'); W(G, b, room, 44, 40, 'stove', false); }
        if (room.bedToo) { W(G, b, room, 100, 60, 'bed', false); W(G, b, room, 66, 30, 'wardrobe', true, 'wardrobe', 'Wardrobe'); }
        if (b.sub === 'cabin' && rng.chance(0.35)) W(G, b, room, 60, 18, 'gunrack', true, 'weapon_case', 'Hunting Gun Rack', null, 1);
        if (rng.chance(0.7)) C(G, b, room, 70, 40, 'table', false);
        break;
      case 'kitchen':
        W(G, b, room, 44, 40, 'fridge', true, 'fridge', 'Fridge');
        W(G, b, room, 70, 30, 'cabinet', false, 'cabinet', 'Kitchen Cabinet');
        if (rng.chance(0.6)) W(G, b, room, 70, 30, 'cabinet', false, 'cabinet', 'Pantry Cupboard');
        W(G, b, room, 44, 40, 'stove', false);
        if (rng.chance(0.6)) W(G, b, room, 80, 32, 'counter', false);
        if (rng.chance(0.6)) C(G, b, room, 80, 56, 'table', false);
        break;
      case 'bedroom':
        W(G, b, room, 100, 60, 'bed', false);
        W(G, b, room, 66, 30, 'wardrobe', true, 'wardrobe', 'Wardrobe');
        if (rng.chance(0.5)) W(G, b, room, 28, 26, 'nightstand', false, 'cabinet', 'Nightstand');
        if (rng.chance(0.4)) W(G, b, room, 70, 28, 'dresser', false, rng.chance(0.5) ? 'cabinet' : null, 'Dresser');
        break;
      case 'bathroom':
        W(G, b, room, 26, 30, 'toilet', false);
        if (rng.chance(0.7)) W(G, b, room, 80, 40, 'tub', false);
        W(G, b, room, 36, 24, 'sink', false);
        if (rng.chance(0.85)) W(G, b, room, 34, 14, 'medcab', true, 'medical_cabinet', 'Medicine Cabinet');
        break;
      case 'office':
        rep(rng.int(1, 2), () => W(G, b, room, 70, 36, 'desk', false, 'desk', b.kind === 'police' ? 'Officer Desk' : 'Office Desk'));
        if (rng.chance(0.7)) W(G, b, room, 32, 30, 'filing', true, 'cabinet', 'Filing Cabinet');
        if (rng.chance(0.4)) W(G, b, room, 22, 22, 'plant', false);
        break;
      case 'meeting':
        C(G, b, room, Math.min(170, room.w - 160), Math.min(70, room.h - 150), 'table', false);
        if (rng.chance(0.4)) W(G, b, room, 60, 26, 'cabinet', true, 'cabinet', 'Supply Cabinet');
        break;
      case 'break':
        W(G, b, room, 44, 40, 'fridge', true, 'fridge', 'Break Room Fridge');
        W(G, b, room, 70, 30, 'cabinet', false, 'cabinet', 'Supply Cabinet');
        W(G, b, room, 80, 32, 'counter', false);
        if (rng.chance(0.6)) W(G, b, room, 30, 30, 'cooler', true);
        C(G, b, room, 80, 56, 'table', false);
        break;
      case 'lobby':
        W(G, b, room, 100, 40, 'counter', false, 'desk', b.kind === 'hospital' ? 'Reception Desk' : b.kind === 'police' ? 'Front Desk' : 'Reception Desk');
        rep(2, () => W(G, b, room, 80, 24, 'bench', false));
        if (rng.chance(0.6)) W(G, b, room, 22, 22, 'plant', false);
        break;
      case 'corridor':
        if (b.kind === 'school') rep(rng.int(4, 8), () => W(G, b, room, 30, 18, 'locker', true, 'locker', 'Student Locker', longSides));
        else if (b.kind === 'hospital') { rep(2, () => W(G, b, room, 70, 22, 'bench', false, null, null, longSides)); if (rng.chance(0.6)) W(G, b, room, 50, 22, 'cart', false, 'medical_cabinet', 'Supply Cart', longSides); }
        else if (rng.chance(0.5)) W(G, b, room, 22, 22, 'plant', false, null, null, longSides);
        break;
      case 'armory':
        rep(2, () => W(G, b, room, 70, 26, 'rack', true, 'weapon_case', 'Police Armory Rack'));
        W(G, b, room, 32, 22, 'locker', true, 'locker', 'Evidence Locker');
        if (rng.chance(0.6)) W(G, b, room, 40, 40, 'crate', false, 'crate', 'Ammo Crate');
        break;
      case 'lockers':
        rep(rng.int(3, 5), () => W(G, b, room, 30, 22, 'locker', true, 'locker', b.kind === 'police' ? 'Police Locker' : b.kind === 'military' ? 'Military Locker' : 'Staff Locker', longSides));
        C(G, b, room, 90, 24, 'bench', false);
        break;
      case 'cells':
        rep(2, () => W(G, b, room, 70, 30, 'cot', false));
        W(G, b, room, 26, 30, 'toilet', false);
        break;
      case 'ward':
        rep(rng.int(2, 3), () => W(G, b, room, 54, 90, 'hbed', false));
        W(G, b, room, 50, 24, 'medcab', true, 'medical_cabinet', 'Medical Cabinet');
        if (rng.chance(0.4)) W(G, b, room, 30, 30, 'monitor', false);
        break;
      case 'pharmacy':
        rep(rng.int(2, 3), () => W(G, b, room, 60, 26, 'medcab', true, 'medical_cabinet', b.kind === 'store' ? 'Pharmacy Shelf' : 'Pharmacy Cabinet'));
        if (rng.chance(0.6)) W(G, b, room, 80, 32, 'counter', false);
        break;
      case 'classroom':
        W(G, b, room, 80, 36, 'desk', false, 'desk', "Teacher's Desk", ['n', 'w']);
        if (rng.chance(0.5)) W(G, b, room, 60, 26, 'cabinet', true, 'cabinet', 'Supply Cabinet');
        rowItems(G, room, 36, 28, 26, 30, 40, (r) => furn(G, r, 'sdesk', false));
        break;
      case 'cafeteria':
        rep(rng.int(1, 2), () => W(G, b, room, 50, 40, 'fridge', true, 'fridge', 'Cafeteria Fridge'));
        W(G, b, room, 80, 30, 'shelf', true, 'shelf', 'Pantry Shelf');
        W(G, b, room, 100, 34, 'counter', false);
        rowItems(G, room, 120, 36, 50, 50, 46, (r) => furn(G, r, 'table', false));
        break;
      case 'sales': furnishSales(G, b, room); break;
      case 'diner':
        W(G, b, room, 50, 40, 'fridge', true, 'fridge', 'Diner Fridge');
        W(G, b, room, 70, 30, 'cabinet', false, 'cabinet', 'Kitchen Cabinet');
        W(G, b, room, 120, 34, 'counter', false, 'desk', 'Cash Register');
        W(G, b, room, 44, 40, 'stove', false);
        rowItems(G, room, 56, 56, 50, 50, 50, (r) => furn(G, r, 'table', false));
        break;
      case 'storeroom':
        rep(rng.int(1, 3), () => W(G, b, room, 40, 40, 'crate', false, 'crate', 'Stock Crate'));
        if (rng.chance(0.7)) W(G, b, room, 80, 30, 'shelf', true, 'shelf', 'Storage Shelf');
        if (rng.chance(0.3)) W(G, b, room, 46, 24, 'toolbox', false, 'toolbox', 'Toolbox');
        break;
      case 'restroom':
        W(G, b, room, 26, 30, 'toilet', false);
        W(G, b, room, 36, 24, 'sink', false);
        if (rng.chance(0.5)) W(G, b, room, 34, 14, 'medcab', true, 'medical_cabinet', 'First Aid Box');
        break;
      case 'gunsales':
        rep(rng.int(2, 4), () => W(G, b, room, 80, 30, 'guncase', true, 'weapon_case', 'Gun Display Case'));
        rep(rng.int(1, 2), () => W(G, b, room, 70, 28, 'shelf', true, 'shelf', 'Ammo Shelf'));
        C(G, b, room, 120, 36, 'counter', false, 'desk', 'Gun Counter');
        rowItems(G, room, 90, 30, 70, 80, 120, (r, i) => { if (i % 2 === 0) cont(G, r, 'weapon_case', 'Display Table', b.tier, b, 'guncase', false); else furn(G, r, 'shelf', false); });
        break;
      case 'gunvault':
        rep(rng.int(1, 2), () => W(G, b, room, 40, 40, 'safe', true, 'weapon_case', 'Gun Safe', null, 1));
        W(G, b, room, 40, 40, 'crate', false, 'crate', 'Ammo Crate');
        break;
      case 'gassales':
        rep(2, () => W(G, b, room, 50, 30, 'cooler', true, 'fridge', 'Drinks Cooler'));
        W(G, b, room, 90, 34, 'counter', false, 'desk', 'Cashier Counter');
        rowItems(G, room, 80, 26, 60, 70, 60, (r, i) => { if (i % 2 === 0) cont(G, r, 'shelf', 'Snack Shelf', b.tier, b, 'shelf', true); else furn(G, r, 'shelf', true); });
        break;
      case 'warehall':
        rep(rng.int(1, 2), () => W(G, b, room, 50, 26, 'toolbox', false, 'toolbox', 'Toolbox'));
        rep(rng.int(2, 4), () => W(G, b, room, 44, 44, 'crate', false, 'crate', 'Supply Crate'));
        if (rng.chance(0.5)) W(G, b, room, 50, 50, 'barrel', false);
        rowItems(G, room, 150, 34, 70, 80, 70, (r) => {
          if (rng.chance(0.3)) cont(G, r, 'shelf', 'Storage Shelf', b.tier, b, 'rack', true);
          else if (rng.chance(0.25)) cont(G, r, 'crate', 'Pallet Crate', b.tier, b, 'pallet', false);
          else furn(G, r, 'rack', true);
        });
        break;
      case 'storage':
        rep(rng.int(2, 3), () => W(G, b, room, 44, 44, 'crate', false, 'crate', 'Supply Crate'));
        if (rng.chance(0.6)) W(G, b, room, 80, 30, 'shelf', true, 'shelf', 'Storage Shelf');
        if (rng.chance(0.5)) W(G, b, room, 50, 26, 'toolbox', false, 'toolbox', 'Tool Chest');
        break;
      case 'barracks':
        rep(rng.int(3, 6), () => W(G, b, room, 90, 40, 'cot', false));
        rep(rng.int(2, 3), () => W(G, b, room, 36, 22, 'locker', false, 'locker', 'Footlocker'));
        break;
      case 'marmory':
        rep(rng.int(3, 5), () => W(G, b, room, 80, 28, 'rack', true, 'weapon_case', 'Armory Rack'));
        rep(2, () => W(G, b, room, 44, 44, 'crate', false, 'crate', 'Ammo Crate'));
        rowItems(G, room, 50, 50, 80, 80, 110, (r) => cont(G, r, 'crate', 'Military Crate', b.tier, b, 'mcrate', false));
        break;
      case 'mvault':
        rep(2, () => W(G, b, room, 44, 44, 'safe', true, 'weapon_case', 'Weapons Locker'));
        W(G, b, room, 36, 26, 'locker', true, 'locker', 'Military Locker');
        break;
      case 'comms':
        rep(rng.int(1, 2), () => W(G, b, room, 80, 36, 'desk', false, 'desk', 'Radio Desk'));
        if (rng.chance(0.7)) W(G, b, room, 34, 30, 'filing', true, 'cabinet', 'Classified Files');
        if (rng.chance(0.5)) W(G, b, room, 36, 22, 'locker', true, 'locker', 'Military Locker');
        break;
      default: break;
    }
  }

  function furnishSales(G, b, room) {
    const rng = G.rng, sub = b.sub || 'market';
    const shelfName = { market: 'Grocery Shelf', pharmacy: 'Pharmacy Shelf', hardware: 'Hardware Shelf', clothing: 'Clothing Rack',
      liquor: 'Liquor Shelf', sports: 'Sporting Goods Shelf' }[sub] || 'Store Shelf';
    const shelfKind = sub === 'pharmacy' ? 'medical_cabinet' : sub === 'hardware' ? 'toolbox' : sub === 'clothing' ? 'wardrobe' : 'shelf';
    W(G, b, room, 100, 34, 'counter', false, 'desk', 'Cash Register', ['s', 'w', 'e']);
    if (sub === 'market' || sub === 'liquor') rep(rng.int(1, 3), () => W(G, b, room, 50, 30, 'cooler', true, 'fridge', 'Drinks Cooler'));
    if (sub === 'pharmacy') rep(2, () => W(G, b, room, 60, 26, 'medcab', true, 'medical_cabinet', 'Pharmacy Counter'));
    if (sub === 'sports' && rng.chance(0.6)) W(G, b, room, 80, 30, 'guncase', true, 'weapon_case', 'Hunting Display', null, 0);
    if (sub === 'sports') W(G, b, room, 40, 40, 'rack', true, 'shelf', 'Camping Gear Rack');
    rep(rng.int(1, 3), () => W(G, b, room, 80, 28, 'shelf', true, rng.chance(0.6) ? shelfKind : null, shelfName));
    rowItems(G, room, 110, 30, 60, 74, 60, (r) => {
      if (rng.chance(0.38)) cont(G, r, shelfKind, shelfName, b.tier, b, sub === 'clothing' ? 'clothes' : 'shelf', true);
      else furn(G, r, sub === 'clothing' ? 'clothes' : 'shelf', true);
    });
  }

  // ------------------------------------------------------------------ building presets
  function preset(kind, G, extra) {
    const rng = G.rng;
    const p = { kind, tier: 0, windows: 0.6, roofStyle: 'flat' };
    switch (kind) {
      case 'house':
        Object.assign(p, { layout: 'bsp', rooms: rng.int(3, 5), minDim: 120, tier: rng.chance(0.25) ? 1 : 0, name: rng.pick(NAMES.house),
          wallColor: rng.pick(HOUSE_WALL), roofColor: rng.pick(HOUSE_ROOF), roofStyle: 'pitched', floor: '#3d3226',
          doors: [{ side: 'front' }].concat(rng.chance(0.5) ? [{ side: 'back' }] : []) });
        break;
      case 'store': {
        const sub = rng.weighted({ market: 4, pharmacy: 2, hardware: 2, clothing: 1, diner: 2, liquor: 1, sports: 1 });
        Object.assign(p, { layout: 'hall', backDepth: rng.int(130, 160), nBack: rng.int(1, 2), tier: sub === 'pharmacy' || sub === 'sports' ? 1 : 0, sub,
          name: rng.pick(NAMES.store[sub]), wallColor: '#4c4a46', roofColor: '#34363a', floor: '#3b3b38', windows: 0.85,
          doors: [{ side: 'front', w: 72 }, { side: 'back' }] });
        break;
      }
      case 'gun_store':
        Object.assign(p, { layout: 'hall', backDepth: 150, nBack: 2, tier: rng.chance(0.4) ? 3 : 2, name: rng.pick(NAMES.gun_store),
          wallColor: '#4a4640', roofColor: '#2e2e30', floor: '#35302a', windows: 0.4, doors: [{ side: 'front' }] });
        break;
      case 'gas_station':
        Object.assign(p, { layout: 'hall', backDepth: 100, nBack: 2, tier: 1, name: rng.pick(NAMES.gas_station),
          wallColor: '#55524a', roofColor: '#7a2e26', floor: '#3c3c3a', windows: 0.9, doors: [{ side: 'front', w: 70 }] });
        break;
      case 'office':
        Object.assign(p, { layout: 'corridor', roomMin: 190, roomMax: 290, tier: 1, name: rng.pick(NAMES.office),
          wallColor: '#4b4e52', roofColor: '#303236', floor: '#33363a', windows: 0.8,
          doors: [{ side: 'front', prefer: 'corridor' }, { side: 'back', prefer: 'corridor' }] });
        break;
      case 'police':
        Object.assign(p, { layout: 'corridor', roomMin: 180, roomMax: 260, tier: 2, name: rng.pick(NAMES.police),
          wallColor: '#3f4650', roofColor: '#262c36', floor: '#34383e', windows: 0.5,
          doors: [{ side: 'front', prefer: 'corridor' }, { side: 'back', prefer: 'corridor' }] });
        break;
      case 'hospital':
        Object.assign(p, { layout: 'corridor', roomMin: 200, roomMax: 300, tier: 2, name: rng.pick(NAMES.hospital), corridorW: 130,
          wallColor: '#6a6c68', roofColor: '#4a4d50', floor: '#4a4e4e', windows: 0.7,
          doors: [{ side: 'front', prefer: 'corridor', w: 80 }, { side: 'back', prefer: 'corridor' }, { side: 'left' }] });
        break;
      case 'school':
        Object.assign(p, { layout: 'corridor', roomMin: 220, roomMax: 320, tier: 1, name: rng.pick(NAMES.school), corridorW: 120,
          wallColor: '#5e4a3e', roofColor: '#3a3430', floor: '#3e3a34', windows: 0.8,
          doors: [{ side: 'front', prefer: 'corridor', w: 80 }, { side: 'back', prefer: 'corridor' }, { side: 'left' }, { side: 'right' }] });
        break;
      case 'warehouse':
        Object.assign(p, { layout: 'hall', backDepth: rng.int(120, 140), nBack: rng.int(2, 3), tier: 1, name: rng.pick(NAMES.warehouse),
          wallColor: '#4a5058', roofColor: '#3c434b', floor: '#3a3a36', windows: 0.25, roofStyle: 'ribbed',
          doors: [{ side: 'front', w: 128 }, { side: 'front' }] });
        break;
      case 'military':
        Object.assign(p, { tier: 3, wallColor: '#4b5040', roofColor: '#3a4130', floor: '#383a32', windows: 0.4 });
        break;
    }
    if (extra) Object.assign(p, extra);
    return p;
  }

  // Place a building of preset kind inside lot rect, facing `front`. Returns building or null.
  function lotBuilding(G, lotR, front, kind, opts) {
    const rng = G.rng;
    opts = opts || {};
    const p = preset(kind, G, opts.preset);
    const along = (front === 'n' || front === 's') ? lotR.w : lotR.h, deep = (front === 'n' || front === 's') ? lotR.h : lotR.w;
    const side = opts.side === undefined ? 24 : opts.side, setback = opts.setback === undefined ? 20 : opts.setback, back = opts.back === undefined ? 20 : opts.back;
    let cw = Math.floor(Math.min(along - side * 2, opts.maxW || 9999)), ch = Math.floor(Math.min(deep - setback - back, opts.maxD || 9999));
    if (opts.minW && cw > opts.minW) cw = Math.round(rng.range(opts.minW, cw));
    if (opts.minD && ch > opts.minD) ch = Math.round(rng.range(opts.minD, ch));
    if (cw < 200 || ch < 180) return null;
    // offset along the lot
    const slack = along - side * 2 - cw;
    const offA = side + (opts.offset !== undefined ? opts.offset : rng.range(0, Math.max(0, slack)));
    let x, y;
    if (front === 's') { x = lotR.x + offA; y = lotR.y + lotR.h - setback - ch; }
    else if (front === 'n') { x = lotR.x + offA; y = lotR.y + setback; }
    else if (front === 'e') { x = lotR.x + lotR.w - setback - ch; y = lotR.y + offA; }
    else { x = lotR.x + setback; y = lotR.y + offA; }
    p.x = Math.round(x); p.y = Math.round(y); p.cw = cw; p.ch = ch; p.front = front;
    return makeBuilding(G, p);
  }

  // ------------------------------------------------------------------ outdoor objects
  function addTree(G, x, y, big) {
    const rng = G.rng, tr = big ? 30 : 22;
    const r = { x: Math.round(x - tr / 2), y: Math.round(y - tr / 2), w: tr, h: tr };
    if (!placeOk(G, grow(r, 14), 0)) return null;
    return solid(G, { x: r.x, y: r.y, w: r.w, h: r.h, kind: 'tree', blocksSight: false,
      cr: Math.round(rng.range(big ? 40 : 28, big ? 62 : 44)), shade: rng.int(0, 3), seed: rng.int(0, 1e6) });
  }
  function addRock(G, x, y) {
    const rng = G.rng, w = rng.int(26, 54), h = rng.int(22, 46);
    const r = { x: Math.round(x - w / 2), y: Math.round(y - h / 2), w, h };
    if (!placeOk(G, grow(r, 16), 0)) return null;
    return solid(G, { x: r.x, y: r.y, w, h, kind: 'rock', blocksSight: false, seed: rng.int(0, 1e6) });
  }
  function addCar(G, x, y, dir, opts) {
    const rng = G.rng;
    opts = opts || {};
    const L = opts.len || rng.int(84, 98), Wd = opts.wid || 44;
    const r = dir === 'h' ? { x: Math.round(x - L / 2), y: Math.round(y - Wd / 2), w: L, h: Wd } : { x: Math.round(x - Wd / 2), y: Math.round(y - L / 2), w: Wd, h: L };
    if (!placeOk(G, grow(r, 6), 0)) return null;
    const flip = rng.chance(0.5); // which end is the front
    const wreck = opts.wreck !== undefined ? opts.wreck : rng.chance(0.12);
    const car = { x: r.x, y: r.y, w: r.w, h: r.h, kind: 'car', dir, flip, wreck, blocksSight: false,
      color: opts.color || (wreck ? '#2a2724' : rng.pick(CAR_COLORS)), truck: !!opts.truck };
    if (rng.chance(opts.trunk !== undefined ? opts.trunk : 0.45)) {
      const tl = 24;
      // trunk sits at the rear end (front is +axis unless flipped)
      const tr = dir === 'h' ? { x: flip ? r.x + r.w - tl : r.x, y: r.y + 4, w: tl, h: r.h - 8 } : { x: r.x + 4, y: flip ? r.y + r.h - tl : r.y, w: r.w - 8, h: tl };
      car.container = makeContainer(G, tr, 'car_trunk', opts.truck ? 'Truck Bed' : wreck ? 'Burnt-out Trunk' : 'Car Trunk', opts.tier || 0, null);
    }
    solid(G, car);
    if (wreck) rep(3, () => decor(G, 'debris', r.x + rng.range(-20, r.w + 10), r.y + rng.range(-20, r.h + 10), rng.int(4, 10), rng.int(4, 10), { c: '#2c2a28' }));
    return car;
  }
  function addDumpster(G, r, name) { return cont(G, r, 'dumpster', name || 'Dumpster', 0, null, 'dumpster', false); }
  function fenceLine(G, vert, fixed, a0, a1, gaps, style) {
    const th = style === 'chain' ? 6 : 8;
    let cur = a0;
    const sorted = (gaps || []).slice().sort((p, q) => p[0] - q[0]);
    const seg = (s, e) => {
      if (e - s < 6) return;
      const r = vert ? { x: fixed - th / 2, y: s, w: th, h: e - s } : { x: s, y: fixed - th / 2, w: e - s, h: th };
      if (hitsGrid(G.clear, r.x, r.y, r.w, r.h)) return; // never fence off a door
      solid(G, { x: r.x, y: r.y, w: r.w, h: r.h, kind: 'fence', style: style || 'wood', blocksSight: false, blocksBullets: false });
    };
    for (const g of sorted) { if (g[0] > cur) seg(cur, g[0]); cur = Math.max(cur, g[1]); }
    if (a1 > cur) seg(cur, a1);
  }

  // ------------------------------------------------------------------ block fillers
  // K: block rect inside sidewalks. Returns lots split into two rows facing the long edges.
  function rows2(K) {
    if (K.w >= K.h) {
      const d = K.h / 2;
      return { horiz: true, rows: [{ r: { x: K.x, y: K.y, w: K.w, h: d }, front: 'n' }, { r: { x: K.x, y: K.y + d, w: K.w, h: K.h - d }, front: 's' }] };
    }
    const d = K.w / 2;
    return { horiz: false, rows: [{ r: { x: K.x, y: K.y, w: d, h: K.h }, front: 'w' }, { r: { x: K.x + d, y: K.y, w: K.w - d, h: K.h }, front: 'e' }] };
  }
  function splitRow(rowR, horiz, mn, mx, rng) {
    const len = horiz ? rowR.w : rowR.h, n = Math.max(1, Math.round(len / rng.range(mn, mx)));
    const out = [], step = len / n;
    for (let i = 0; i < n; i++) {
      const a = Math.round(i * step), b = Math.round((i + 1) * step);
      out.push(horiz ? { x: rowR.x + a, y: rowR.y, w: b - a, h: rowR.h } : { x: rowR.x, y: rowR.y + a, w: rowR.w, h: b - a });
    }
    return out;
  }

  function fillHouses(G, K) {
    const rng = G.rng, R = rows2(K);
    lot(G, K, 'grass');
    for (const row of R.rows) {
      const lots = splitRow(row.r, R.horiz, 470, 560, rng);
      for (let li = 0; li < lots.length; li++) {
        const L = lots[li], front = row.front;
        const along = R.horiz ? L.w : L.h, depth = R.horiz ? L.h : L.w;
        const cw = Math.round(Math.min(along - 110, rng.range(340, 450))), ch = Math.round(Math.min(depth - 150, rng.range(270, 340)));
        if (cw < 240 || ch < 200) continue;
        const setback = Math.round(rng.range(50, 80));
        const driveLeft = rng.chance(0.5);
        const offset = driveLeft ? along - 14 - cw - 10 : 10;
        const b = lotBuilding(G, L, front, 'house', { setback, side: 0, back: 0, offset, maxW: cw, maxD: ch });
        if (!b) continue;
        // driveway + parked car
        const dw = 64;
        const dA = driveLeft ? 14 : along - 14 - dw;   // along-lot offset of driveway
        let drive;
        if (front === 's') drive = { x: L.x + dA, y: b.y + b.h - 120, w: dw, h: L.y + L.h - (b.y + b.h - 120) };
        else if (front === 'n') drive = { x: L.x + dA, y: L.y, w: dw, h: b.y + 120 - L.y };
        else if (front === 'e') drive = { x: b.x + b.w - 120, y: L.y + dA, w: L.x + L.w - (b.x + b.w - 120), h: dw };
        else drive = { x: L.x, y: L.y + dA, w: b.x + 120 - L.x, h: dw };
        decor(G, 'drive', drive.x, drive.y, drive.w, drive.h);
        if (rng.chance(0.45)) {
          const cx = drive.x + drive.w / 2, cy = drive.y + drive.h / 2;
          if (front === 'n' || front === 's') addCar(G, cx, front === 's' ? drive.y + drive.h - 70 : drive.y + 70, 'v');
          else addCar(G, front === 'e' ? drive.x + drive.w - 70 : drive.x + 70, cy, 'h');
        }
        // side fence (between this lot and the next) from back edge to the house front line
        if (li < lots.length - 1) {
          if (R.horiz) {
            const fx = L.x + L.w;
            if (front === 's') fenceLine(G, true, fx, L.y, b.y + b.h - 30, [], 'wood');
            else fenceLine(G, true, fx, b.y + 30, L.y + L.h, [], 'wood');
          } else {
            const fy = L.y + L.h;
            if (front === 'e') fenceLine(G, false, fy, L.x, b.x + b.w - 30, [], 'wood');
            else fenceLine(G, false, fy, b.x + 30, L.x + L.w, [], 'wood');
          }
        }
        // yard trees / bushes
        rep(rng.int(1, 3), () => {
          const tx = L.x + rng.range(30, L.w - 30), ty = L.y + rng.range(30, L.h - 30);
          if (!ov({ x: tx - 40, y: ty - 40, w: 80, h: 80 }, b) && !ov({ x: tx - 30, y: ty - 30, w: 60, h: 60 }, drive)) addTree(G, tx, ty, false);
        });
        if (rng.chance(0.4)) decor(G, 'bush', L.x + rng.range(10, L.w - 40), L.y + rng.range(10, L.h - 40), rng.int(18, 30), rng.int(18, 30));
      }
    }
    // back fence along the block's middle line
    if (R.horiz) fenceLine(G, false, K.y + K.h / 2, K.x + 6, K.x + K.w - 6, [], 'wood');
    else fenceLine(G, true, K.x + K.w / 2, K.y + 6, K.y + K.h - 6, [], 'wood');
  }

  function pickCommercialKind(G, district) {
    const q = G.quota, rng = G.rng;
    if (district === 'downtown') {
      if (q.police < 1) return 'police';
      if (q.hospital < 1) return 'hospital';
      if (q.gun_store < 2) return 'gun_store';
      return rng.weighted({ office: 5, store: 5, gun_store: q.gun_store < 3 ? 0.5 : 0, police: q.police < 2 ? 0.3 : 0, hospital: q.hospital < 2 ? 0.3 : 0 });
    }
    if (district === 'industrial') return rng.weighted({ gas_station: q.gas_station < 6 ? 2 : 0.4, store: 2, gun_store: q.gun_store < 4 ? 1 : 0 });
    return rng.weighted({ store: 6, gas_station: q.gas_station < 6 ? 1.2 : 0.3, gun_store: q.gun_store < 5 ? 1.2 : 0.2, police: q.police < 3 ? 0.8 : 0, office: 1 });
  }

  function fillDowntown(G, K) {
    const rng = G.rng, R = rows2(K), alley = 110;
    lot(G, K, 'concrete');
    // alley along the middle
    const mid = R.horiz ? { x: K.x, y: K.y + K.h / 2 - alley / 2, w: K.w, h: alley } : { x: K.x + K.w / 2 - alley / 2, y: K.y, w: alley, h: K.h };
    decor(G, 'alley', mid.x, mid.y, mid.w, mid.h);
    for (const row of R.rows) {
      const rr = R.horiz
        ? (row.front === 'n' ? { x: row.r.x, y: row.r.y, w: row.r.w, h: row.r.h - alley / 2 } : { x: row.r.x, y: row.r.y + alley / 2, w: row.r.w, h: row.r.h - alley / 2 })
        : (row.front === 'w' ? { x: row.r.x, y: row.r.y, w: row.r.w - alley / 2, h: row.r.h } : { x: row.r.x + alley / 2, y: row.r.y, w: row.r.w - alley / 2, h: row.r.h });
      const len = R.horiz ? rr.w : rr.h;
      let cur = 0;
      while (len - cur > 260) {
        let kind = pickCommercialKind(G, 'downtown');
        if (kind === 'hospital' && len - cur < 720) kind = 'office';
        let want = kind === 'hospital' ? Math.min(900, len - cur) : kind === 'police' ? 640 : kind === 'office' ? rng.range(420, 560) : kind === 'gun_store' ? 340 : rng.range(300, 420);
        if (len - cur < want) { if (kind === 'hospital' || kind === 'police') kind = 'office'; want = len - cur; }
        if (len - cur - want < 300) want = len - cur;
        const lotR = R.horiz ? { x: rr.x + cur, y: rr.y, w: want, h: rr.h } : { x: rr.x, y: rr.y + cur, w: rr.w, h: want };
        const b = lotBuilding(G, lotR, row.front, kind, { side: 30, setback: 14, back: 12 });
        if (b) {
          G.quota[kind] = (G.quota[kind] || 0) + 1;
          if (kind !== 'office' && kind !== 'store') poi(G, b);
          // dumpster behind
          if (rng.chance(0.6)) {
            const dwid = 60, dd = 34;
            let r;
            const t = rng.range(0.15, 0.75);
            if (row.front === 'n') r = { x: b.x + b.w * t, y: b.y + b.h + 4, w: dwid, h: dd };
            else if (row.front === 's') r = { x: b.x + b.w * t, y: b.y - 4 - dd, w: dwid, h: dd };
            else if (row.front === 'w') r = { x: b.x + b.w + 4, y: b.y + b.h * t, w: dd, h: dwid };
            else r = { x: b.x - 4 - dd, y: b.y + b.h * t, w: dd, h: dwid };
            r.x = Math.round(r.x); r.y = Math.round(r.y);
            if (placeOk(G, grow(r, 4), 0)) addDumpster(G, r, 'Alley Dumpster');
          }
        }
        cur += want;
      }
    }
    scatterDebris(G, mid, 4);
  }

  function fillCommercial(G, K, district) {
    const rng = G.rng, R = rows2(K);
    lot(G, K, district === 'industrial' ? 'gravel' : 'grass');
    for (const row of R.rows) {
      const lots = splitRow(row.r, R.horiz, 480, 640, rng);
      for (const L of lots) {
        const kind = pickCommercialKind(G, district);
        const front = row.front;
        const park = kind === 'gas_station' ? 210 : 140;
        // parking strip between building and street
        let pr;
        if (front === 'n') pr = { x: L.x + 10, y: L.y, w: L.w - 20, h: park - 10 };
        else if (front === 's') pr = { x: L.x + 10, y: L.y + L.h - park + 10, w: L.w - 20, h: park - 10 };
        else if (front === 'w') pr = { x: L.x, y: L.y + 10, w: park - 10, h: L.h - 20 };
        else pr = { x: L.x + L.w - park + 10, y: L.y + 10, w: park - 10, h: L.h - 20 };
        const opts = kind === 'gas_station' ? { side: 60, setback: park, back: 30, maxW: 320, maxD: 300 } : { side: 30, setback: park, back: 26, maxD: kind === 'police' ? 9999 : 330 };
        const b = lotBuilding(G, L, front, kind, opts);
        if (!b) { lot(G, L, 'grass'); continue; }
        G.quota[kind] = (G.quota[kind] || 0) + 1;
        lot(G, pr, 'asphalt', { lines: front === 'n' || front === 's' ? 'v' : 'h' });
        if (kind === 'gas_station') {
          // canopy + pump islands
          decor(G, 'canopy', pr.x + 20, pr.y + 20, pr.w - 40, pr.h - 40);
          const horiz = front === 'n' || front === 's';
          for (let k = 0; k < 2; k++) {
            const t = (k + 1) / 3;
            const r = horiz ? { x: Math.round(pr.x + pr.w * t - 12), y: Math.round(pr.y + pr.h / 2 - 30), w: 24, h: 60 } : { x: Math.round(pr.x + pr.w / 2 - 30), y: Math.round(pr.y + pr.h * t - 12), w: 60, h: 24 };
            if (placeOk(G, grow(r, 4), 0)) furn(G, r, 'pump', true);
          }
          poi(G, b);
        } else {
          if (kind !== 'store' && kind !== 'office') poi(G, b);
          if (rng.chance(0.5)) {
            const horiz = front === 'n' || front === 's';
            const cx = horiz ? pr.x + rng.range(40, pr.w - 40) : pr.x + pr.w / 2, cy = horiz ? pr.y + pr.h / 2 : pr.y + rng.range(40, pr.h - 40);
            addCar(G, cx, cy, horiz ? 'v' : 'h');
          }
        }
        // dumpster at the side
        if (rng.chance(0.5)) {
          const r = front === 'n' || front === 's' ? { x: b.x + b.w + 8, y: Math.round(b.y + b.h / 2 - 17), w: 56, h: 34 } : { x: Math.round(b.x + b.w / 2 - 17), y: b.y + b.h + 8, w: 34, h: 56 };
          if (ov(r, L) && placeOk(G, grow(r, 4), 0)) addDumpster(G, r);
        }
      }
    }
  }

  function fillIndustrial(G, K) {
    const rng = G.rng, R = rows2(K);
    lot(G, K, 'gravel');
    const single = rng.chance(0.55);
    const rowsI = single ? [{ r: K, front: R.rows[rng.int(0, 1)].front }] : R.rows;
    for (const row of rowsI) {
      const lots = splitRow(row.r, R.horiz, single ? 520 : 650, single ? 700 : 1000, rng);
      for (const L of lots) {
        const front = row.front;
        const b = lotBuilding(G, L, front, 'warehouse', { side: 50, setback: 140, back: 30 });
        if (!b) continue;
        // concrete apron + fence with gate in front of the loading door
        const horiz = front === 'n' || front === 's';
        let apron;
        if (front === 'n') apron = { x: b.x, y: L.y + 8, w: b.w, h: b.y - L.y - 8 };
        else if (front === 's') apron = { x: b.x, y: b.y + b.h, w: b.w, h: L.y + L.h - 8 - b.y - b.h };
        else if (front === 'w') apron = { x: L.x + 8, y: b.y, w: b.x - L.x - 8, h: b.h };
        else apron = { x: b.x + b.w, y: b.y, w: L.x + L.w - 8 - b.x - b.w, h: b.h };
        lot(G, apron, 'concrete', { stripes: true });
        const gaps = b.doors.filter((d) => d.side === 'front').map((d) => horiz ? [d.x - 50, d.x + d.w + 50] : [d.y - 50, d.y + d.h + 50]);
        const inset = 8;
        const fx0 = L.x + inset, fx1 = L.x + L.w - inset, fy0 = L.y + inset, fy1 = L.y + L.h - inset;
        fenceLine(G, false, fy0, fx0, fx1, front === 'n' ? gaps : [], 'chain');
        fenceLine(G, false, fy1, fx0, fx1, front === 's' ? gaps : [], 'chain');
        fenceLine(G, true, fx0, fy0 + 3, fy1 - 3, front === 'w' ? gaps : [], 'chain');
        fenceLine(G, true, fx1, fy0 + 3, fy1 - 3, front === 'e' ? gaps : [], 'chain');
        // crates, shipping containers and a truck in the yard
        rep(rng.int(2, 5), () => {
          const s = rng.chance(0.25) ? 'ship' : 'crate';
          const w = s === 'ship' ? (horiz ? 200 : 56) : 40, h = s === 'ship' ? (horiz ? 56 : 200) : 40;
          const x = apron.x + rng.range(0, Math.max(1, apron.w - w)), y = apron.y + rng.range(0, Math.max(1, apron.h - h));
          const r = { x: Math.round(x), y: Math.round(y), w, h };
          if (!placeOk(G, grow(r, 30), 0)) return;
          if (s === 'ship') furn(G, r, 'ship', true, { color: rng.pick(['#5a3a2a', '#2f4a5a', '#4a5a3a', '#6a5a2a']) });
          else cont(G, r, 'crate', 'Shipping Crate', 1, null, 'crate', false);
        });
        if (rng.chance(0.4)) addCar(G, apron.x + apron.w / 2, apron.y + apron.h / 2, horiz ? 'v' : 'h', { len: 130, wid: 52, truck: true, color: '#3e4a52', trunk: 0.8, tier: 1 });
        if (rng.chance(0.6)) {
          const r = { x: Math.round(apron.x + 10), y: Math.round(apron.y + 10), w: 56, h: 34 };
          if (placeOk(G, grow(r, 24), 0)) addDumpster(G, r, 'Industrial Dumpster');
        }
        scatterDebris(G, L, 6);
      }
    }
  }

  function fillPark(G, K, plaza) {
    const rng = G.rng;
    lot(G, K, plaza ? 'concrete' : 'park');
    const cx = K.x + K.w / 2, cy = K.y + K.h / 2, pw = 56;
    const paths = [{ x: K.x, y: cy - pw / 2, w: K.w, h: pw }, { x: cx - pw / 2, y: K.y, w: pw, h: K.h }];
    for (const p of paths) decor(G, 'path', p.x, p.y, p.w, p.h, { plaza: !!plaza });
    const fr = { x: Math.round(cx - 55), y: Math.round(cy - 55), w: 110, h: 110 };
    decor(G, 'path', fr.x - 40, fr.y - 40, fr.w + 80, fr.h + 80, { round: true, plaza: !!plaza });
    furn(G, fr, plaza ? 'statue' : 'fountain', false, { blocksBullets: true });
    // benches along the paths
    rep(6, () => {
      const alongX = rng.chance(0.5);
      const t = rng.range(0.12, 0.88), sideS = rng.chance(0.5) ? -1 : 1;
      const r = alongX ? { x: Math.round(K.x + K.w * t - 30), y: Math.round(cy + sideS * (pw / 2 + 6) - (sideS < 0 ? 20 : 0)), w: 60, h: 20 }
        : { x: Math.round(cx + sideS * (pw / 2 + 6) - (sideS < 0 ? 20 : 0)), y: Math.round(K.y + K.h * t - 30), w: 20, h: 60 };
      if (Math.abs(r.x + r.w / 2 - cx) < 140 && Math.abs(r.y + r.h / 2 - cy) < 140) return;
      if (placeOk(G, grow(r, 6), 0)) furn(G, r, 'bench', false);
    });
    // trees in the four quadrants
    const step = plaza ? 200 : 120;
    for (let y = K.y + 50; y < K.y + K.h - 40; y += step) for (let x = K.x + 50; x < K.x + K.w - 40; x += step) {
      if (!rng.chance(plaza ? 0.5 : 0.55)) continue;
      const tx = x + rng.range(0, step * 0.5), ty = y + rng.range(0, step * 0.5);
      if (Math.abs(tx - cx) < pw / 2 + 50 || Math.abs(ty - cy) < pw / 2 + 50) continue;
      if (Math.hypot(tx - cx, ty - cy) < 180) continue;
      if (plaza) { const r = { x: Math.round(tx - 26), y: Math.round(ty - 26), w: 52, h: 52 }; if (placeOk(G, grow(r, 30), 0)) furn(G, r, 'planter', false, { blocksBullets: true }); }
      else addTree(G, tx, ty, rng.chance(0.4));
    }
    if (rng.chance(0.6)) {
      const r = { x: Math.round(K.x + 20), y: Math.round(K.y + 20), w: 56, h: 34 };
      if (placeOk(G, grow(r, 10), 0)) addDumpster(G, r, 'Park Trash Bin');
    }
    G.state.pois.push({ x: cx, y: cy, name: plaza ? 'City Plaza' : PARK_NAMES[(G.parkNames++) % PARK_NAMES.length], kind: 'park' });
  }

  function fillParking(G, K) {
    const rng = G.rng;
    lot(G, K, 'asphalt', { lines: K.w >= K.h ? 'v' : 'h', big: true });
    const horiz = K.w >= K.h;
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 14; k++) {
        if (!rng.chance(0.3)) continue;
        if (horiz) addCar(G, K.x + 60 + rng.range(0, K.w - 120), K.y + 80 + row * (K.h - 160) / 3, 'v');
        else addCar(G, K.x + 80 + row * (K.w - 160) / 3, K.y + 60 + rng.range(0, K.h - 120), 'h');
      }
    }
    if (rng.chance(0.7)) {
      const r = { x: K.x + 10, y: K.y + 10, w: 56, h: 34 };
      if (placeOk(G, grow(r, 10), 0)) addDumpster(G, r);
    }
  }

  function fillSchool(G, K) {
    const rng = G.rng;
    lot(G, K, 'grass');
    const front = K.w >= K.h ? (rng.chance(0.5) ? 'n' : 's') : (rng.chance(0.5) ? 'w' : 'e');
    // building in the front half, field in the back half
    const horiz = front === 'n' || front === 's';
    const half = horiz ? { x: K.x, y: front === 'n' ? K.y : K.y + K.h * 0.45, w: K.w, h: K.h * 0.55 } : { x: front === 'w' ? K.x : K.x + K.w * 0.45, y: K.y, w: K.w * 0.55, h: K.h };
    const b = lotBuilding(G, half, front, 'school', { side: 80, setback: 60, back: 20, maxW: 900 });
    if (!b) return false;
    G.quota.school++;
    poi(G, b);
    const field = horiz ? { x: K.x + 80, y: front === 'n' ? half.y + half.h + 30 : K.y + 30, w: K.w - 160, h: K.h - half.h - 60 }
      : { x: front === 'w' ? half.x + half.w + 30 : K.x + 30, y: K.y + 80, w: K.w - half.w - 60, h: K.h - 160 };
    if (field.w > 200 && field.h > 160) lot(G, field, 'field');
    return true;
  }

  function fillForestBlock(G, K) {
    lot(G, K, 'forest');
    const rng = G.rng;
    if (rng.chance(0.35)) {
      // a cabin in a clearing next to one of the block's roads
      const front = rng.pick(['n', 's', 'w', 'e']);
      const cl = { x: K.x + K.w / 2 - 260, y: K.y + K.h / 2 - 220, w: 520, h: 440 };
      if (front === 'n') cl.y = K.y; else if (front === 's') cl.y = K.y + K.h - cl.h; else if (front === 'w') { cl.x = K.x; cl.w = 440; cl.h = 520; cl.y = K.y + K.h / 2 - 260; } else { cl.w = 440; cl.h = 520; cl.x = K.x + K.w - 440; cl.y = K.y + K.h / 2 - 260; }
      cabin(G, cl, front);
    }
  }
  function cabin(G, cl, front, ranger) {
    const rng = G.rng;
    lot(G, cl, 'dirt');
    reserve(G, cl);
    const kind = ranger ? 'police' : 'house';
    const pre = ranger
      ? { layout: 'bsp', rooms: 3, minDim: 130, tier: 1, name: 'Ranger Station', wallColor: '#4e4234', roofColor: '#3a3a2a', roofStyle: 'pitched', floor: '#3a3024', types: rangerTypes }
      : { sub: 'cabin', name: rng.pick(NAMES.cabin), wallColor: '#5a4632', roofColor: '#3c2e22', floor: '#3a2e22', rooms: rng.int(2, 3), tier: 1, windows: 0.5 };
    const b = lotBuilding(G, cl, front, kind, { side: 90, setback: 80, back: 60, maxW: 340, maxD: 290, preset: pre });
    if (!b) return null;
    if (ranger) poi(G, b);
    // woodpile + campfire ring
    const r = { x: Math.round(cl.x + 30), y: Math.round(cl.y + 30), w: 50, h: 26 };
    if (placeOk(G, grow(r, 6), 0)) cont(G, r, 'crate', 'Woodpile', 0, null, 'woodpile', false);
    decor(G, 'firepit', Math.round(cl.x + cl.w - 80), Math.round(cl.y + cl.h - 80), 30, 30);
    return b;
  }
  function rangerTypes(b) {
    const rooms = b.rooms.slice().sort((a, c) => c.w * c.h - a.w * a.h);
    rooms.forEach((r, i) => { r.type = i === 0 ? 'office' : i === 1 ? 'armory' : 'lockers'; });
  }

  function scatterDebris(G, r, n) {
    const rng = G.rng;
    rep(n, () => decor(G, 'debris', Math.round(r.x + rng.range(0, r.w)), Math.round(r.y + rng.range(0, r.h)), rng.int(4, 12), rng.int(4, 10), { c: rng.pick(['#3a3530', '#2e3236', '#463c2c', '#4a4a44']) }));
  }

  function poi(G, b) {
    const label = { police: b.name, hospital: b.name, gun_store: b.name, school: b.name, gas_station: b.name, warehouse: b.name }[b.kind] || b.name;
    G.state.pois.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, name: label, kind: b.kind });
  }

  // ------------------------------------------------------------------ military base
  function militaryBase(G) {
    const rng = G.rng, B = G.meta.baseRect, gateSide = G.meta.gateSide, gy = G.meta.gateY;
    lot(G, B, 'base');
    const WT = 24, gate = 170;
    const wall = (r) => solid(G, { x: r.x, y: r.y, w: r.w, h: r.h, kind: 'wall', color: '#55574c', bid: null, base: true });
    // top/bottom full, left/right with gate gap
    wall({ x: B.x, y: B.y, w: B.w, h: WT });
    wall({ x: B.x, y: B.y + B.h - WT, w: B.w, h: WT });
    for (const sx of [B.x, B.x + B.w - WT]) {
      const isGate = (gateSide === 'e' && sx !== B.x) || (gateSide === 'w' && sx === B.x);
      if (isGate) {
        wall({ x: sx, y: B.y + WT, w: WT, h: gy - gate / 2 - B.y - WT });
        wall({ x: sx, y: gy + gate / 2, w: WT, h: B.y + B.h - WT - gy - gate / 2 });
        const outX = gateSide === 'e' ? sx + WT : sx - 120;
        addClear(G, { x: Math.min(outX, sx) - 10, y: gy - gate / 2, w: 120 + WT + 140, h: gate });
        // checkpoint booth + barrier decor
        const booth = { x: gateSide === 'e' ? sx - 90 : sx + WT + 40, y: gy - gate / 2 - 70, w: 50, h: 50 };
        furn(G, booth, 'booth', true);
      } else wall({ x: sx, y: B.y + WT, w: WT, h: B.h - WT * 2 });
    }
    // watchtowers in the corners
    for (const [tx, ty] of [[B.x + WT + 6, B.y + WT + 6], [B.x + B.w - WT - 66, B.y + WT + 6], [B.x + WT + 6, B.y + B.h - WT - 66], [B.x + B.w - WT - 66, B.y + B.h - WT - 66]]) furn(G, { x: tx, y: ty, w: 60, h: 60 }, 'tower', true);
    // layout: mirrored by gate side so the gate opens onto the parade ground
    const inner = { x: B.x + WT + 100, y: B.y + WT + 100, w: B.w - WT * 2 - 200, h: B.h - WT * 2 - 200 };
    const mir = (r) => gateSide === 'e' ? r : { x: B.x + B.w - (r.x - B.x) - r.w, y: r.y, w: r.w, h: r.h };
    const parade = mir({ x: inner.x + inner.w * 0.42, y: gy - 260 - B.y + B.y, w: inner.w * 0.58, h: 520 });
    lot(G, parade, 'asphalt', { lines: 'none' });
    const place = (rr, sub, name, front, preExtra) => {
      const r = mir(rr);
      let f = front;
      if (gateSide === 'w') f = front === 'e' ? 'w' : front === 'w' ? 'e' : front;
      const along = (f === 'n' || f === 's') ? r.w : r.h, deep = (f === 'n' || f === 's') ? r.h : r.w;
      const p = preset('military', G, Object.assign({ sub, name, layout: sub === 'armory' ? 'hall' : 'corridor', backDepth: 150, nBack: 2, roomMin: 200, roomMax: 280,
        doors: [{ side: 'front', w: 72, prefer: sub === 'armory' ? 'hall' : 'corridor' }, { side: 'back', prefer: 'corridor' }] }, preExtra || {}));
      p.x = Math.round(r.x); p.y = Math.round(r.y); p.cw = Math.round(along); p.ch = Math.round(deep); p.front = f;
      const b = makeBuilding(G, p);
      return b;
    };
    // buildings along the far (non-gate) side, facing the parade ground
    const colW = 520;
    const b1 = place({ x: inner.x, y: inner.y, w: colW, h: 380 }, 'barracks', 'Barracks A', 'e');
    const b2 = place({ x: inner.x, y: inner.y + 480, w: colW, h: 380 }, 'barracks', 'Barracks B', 'e');
    const b3 = place({ x: inner.x, y: inner.y + inner.h - 420, w: colW, h: 420 }, 'armory', 'Armory', 'e');
    const b4 = place({ x: inner.x + colW + 200, y: inner.y, w: 560, h: 340 }, 'command', 'Command Post', 's');
    for (const b of [b1, b2, b3, b4]) if (b) b.tier = 3;
    if (b3) G.state.pois.push({ x: b3.x + b3.w / 2, y: b3.y + b3.h / 2, name: 'Armory', kind: 'military' });
    // motor pool: trucks + jeeps
    const mp = mir({ x: inner.x + colW + 200, y: inner.y + inner.h - 360, w: Math.min(800, inner.w - colW - 260), h: 340 });
    lot(G, mp, 'asphalt', { lines: 'v' });
    for (let k = 0; k < 5; k++) {
      const x = mp.x + 70 + k * Math.max(110, (mp.w - 140) / 4);
      if (x > mp.x + mp.w - 40) break;
      if (rng.chance(0.8)) addCar(G, x, mp.y + mp.h / 2, 'v', { len: k % 2 ? 100 : 140, wid: k % 2 ? 48 : 56, truck: k % 2 === 0, color: rng.pick(['#4a5236', '#3e4630', '#565a40']), trunk: 0.9, tier: 3 });
    }
    // sandbag walls and crates around the parade ground
    rep(10, () => {
      const vert = rng.chance(0.5);
      const r = vert ? { w: 22, h: rng.int(70, 130) } : { w: rng.int(70, 130), h: 22 };
      r.x = Math.round(inner.x + rng.range(0, inner.w - r.w)); r.y = Math.round(inner.y + rng.range(0, inner.h - r.h));
      if (placeOk(G, grow(r, 50), 0)) furn(G, r, 'sandbag', false, { blocksBullets: true });
    });
    rep(10, () => {
      const r = { w: 48, h: 48 };
      r.x = Math.round(inner.x + rng.range(0, inner.w - r.w)); r.y = Math.round(inner.y + rng.range(0, inner.h - r.h));
      if (placeOk(G, grow(r, 40), 0)) cont(G, r, 'crate', 'Military Crate', 3, null, 'mcrate', false);
    });
    // helipad
    const hp = mir({ x: inner.x + inner.w - 300, y: inner.y + 40, w: 240, h: 240 });
    decor(G, 'helipad', hp.x, hp.y, hp.w, hp.h);
    G.state.pois.push({ x: B.x + B.w / 2, y: B.y + 60, name: 'Fort Ashgrove (Military)', kind: 'military' });
  }

  // ------------------------------------------------------------------ main generate
  function generate(state) {
    const t0 = Date.now();
    const W = SV.WORLD.w, H = SV.WORLD.h;
    state.roads = []; state.buildings = []; state.containers = []; state.decor = []; state.pois = [];
    state.grid = new SV.Grid(W, H, SV.CELL);
    const G = newCtx(state);
    const rng = G.rng;
    const M = G.meta = {
      gen: ++GEN, dcols: Math.ceil(W / DCELL), drows: Math.ceil(H / DCELL),
      cityRect: { x: CITY0, y: CITY0, w: CITY1 - CITY0, h: CITY1 - CITY0 },
    };
    M.dgrid = new Uint8Array(M.dcols * M.drows);

    // --- layout skeleton
    const VX = makeLines(rng), HY = makeLines(rng);
    M.cityRect = { x: VX[0].c, y: HY[0].c, w: VX[VX.length - 1].c - VX[0].c, h: HY[HY.length - 1].c - HY[0].c };
    const cxm = W / 2, cym = H / 2;
    const a0 = rng.range(0, Math.PI * 2);
    M.downtown = { x: cxm + Math.cos(a0) * 2700, y: cym + Math.sin(a0) * 2700, r: 2150 };
    const a1 = a0 + Math.PI + rng.range(-0.7, 0.7);
    M.industrial = { x: cxm + Math.cos(a1) * 3700, y: cym + Math.sin(a1) * 3700, r: 2300 };
    // military base in the corner farthest from downtown
    const cornerX = Math.cos(a0) > 0 ? 0 : 1, cornerY = Math.sin(a0) > 0 ? 0 : 1;
    const B = { w: 2400, h: 2000 };
    B.x = cornerX ? W - 450 - B.w : 450; B.y = cornerY ? H - 450 - B.h : 450;
    M.baseRect = B;
    M.excl = grow(B, 320);
    M.gateSide = cornerX ? 'w' : 'e';
    const lineIn = HY.find((l) => l.c > B.y + 300 && l.c < B.y + B.h - 300);
    M.gateY = lineIn ? lineIn.c : B.y + B.h / 2;

    // --- districts (base pass)
    for (let j = 0; j < M.drows; j++) for (let i = 0; i < M.dcols; i++) M.dgrid[j * M.dcols + i] = DCODE[districtBase(G, (i + 0.5) * DCELL, (j + 0.5) * DCELL)];

    // --- roads
    const yTop = HY[0].c - HY[0].aw / 2, yBot = HY[HY.length - 1].c + HY[HY.length - 1].aw / 2;
    const xL = VX[0].c - VX[0].aw / 2, xR = VX[VX.length - 1].c + VX[VX.length - 1].aw / 2;
    for (const l of VX) {
      addRoad(G, 'v', yTop, yBot, l.c, l.aw, l.avenue ? 'avenue' : 'street');
      if (l.avenue) { addRoad(G, 'v', 0, yTop, l.c, 100, 'rural'); addRoad(G, 'v', yBot, H, l.c, 100, 'rural'); }
    }
    for (const l of HY) {
      addRoad(G, 'h', xL, xR, l.c, l.aw, l.avenue ? 'avenue' : 'street');
      if (l.avenue) { addRoad(G, 'h', 0, xL, l.c, 100, 'rural'); addRoad(G, 'h', xR, W, l.c, 100, 'rural'); }
    }
    // access road to the military gate
    {
      const E = M.excl;
      if (lineIn) {
        const r = M.gateSide === 'e' ? { x: B.x + B.w, w: E.x + E.w - (B.x + B.w) } : { x: E.x, w: B.x - E.x };
        addRoadRaw(G, { x: r.x, y: M.gateY - 60, w: r.w, h: 120, kind: 'rural', dir: 'h', sw: 0 });
      } else {
        // run to the nearest avenue outside the exclusion zone
        const avs = VX.filter((l) => l.avenue && (M.gateSide === 'e' ? l.c > E.x + E.w : l.c < E.x));
        const av = M.gateSide === 'e' ? avs[0] : avs[avs.length - 1];
        const x0 = M.gateSide === 'e' ? B.x + B.w : av.c, x1 = M.gateSide === 'e' ? av.c : B.x;
        addRoadRaw(G, { x: x0, y: M.gateY - 50, w: x1 - x0, h: 100, kind: 'rural', dir: 'h', sw: 0 });
      }
    }
    computeCrossings(G);

    // --- blocks
    const blocks = [];
    for (let i = 0; i < VX.length - 1; i++) for (let j = 0; j < HY.length - 1; j++) {
      const K = {
        x: Math.round(VX[i].c + VX[i].aw / 2 + SWALK), y: Math.round(HY[j].c + HY[j].aw / 2 + SWALK),
      };
      K.w = Math.round(VX[i + 1].c - VX[i + 1].aw / 2 - SWALK) - K.x;
      K.h = Math.round(HY[j + 1].c - HY[j + 1].aw / 2 - SWALK) - K.y;
      const edge = i === 0 || j === 0 || i === VX.length - 2 || j === HY.length - 2;
      let d = districtBase(G, K.x + K.w / 2, K.y + K.h / 2);
      if (ov(K, M.excl)) d = 'forest';
      else if (edge && d === 'suburb' && rng.chance(0.3)) d = 'forest';
      blocks.push({ K, d, i, j, dist: Math.hypot(K.x + K.w / 2 - M.downtown.x, K.y + K.h / 2 - M.downtown.y) });
    }
    for (const bl of blocks) paintDistrict(G, bl.K, bl.d);
    paintDistrict(G, M.baseRect, 'military');

    militaryBase(G);

    // downtown first (closest to its center gets the specials), then the rest
    blocks.sort((a, b) => a.dist - b.dist);
    for (const bl of blocks) {
      const K = bl.K;
      if (bl.d === 'forest') { if (!ov(K, M.excl)) fillForestBlock(G, K); else lot(G, K, 'forest'); continue; }
      reserve(G, K);
      const nearCenter = Math.hypot(K.x + K.w / 2 - cxm, K.y + K.h / 2 - cym) < 1300;
      if (bl.d === 'downtown') {
        const roll = rng.next();
        if (roll < 0.07 && G.quota.hospital > 0) fillPark(G, K, true);
        else if (roll < 0.12 && G.quota.hospital > 0) fillParking(G, K);
        else fillDowntown(G, K);
      } else if (bl.d === 'industrial') {
        if (rng.chance(0.18)) fillCommercial(G, K, 'industrial'); else fillIndustrial(G, K);
      } else {
        const roll = rng.next();
        if (nearCenter) fillHouses(G, K);
        else if (roll < 0.06 && G.quota.school < 3) { if (!fillSchool(G, K)) fillHouses(G, K); }
        else if (roll < 0.15) fillPark(G, K, false);
        else if (roll < 0.26) fillCommercial(G, K, 'suburb');
        else fillHouses(G, K);
      }
    }

    // --- forest: cabins along rural roads, ranger stations, trees & rocks
    let rangers = 0;
    for (const r of state.roads.slice()) {
      if (r.kind !== 'rural') continue;
      const len = r.dir === 'h' ? r.w : r.h;
      for (let s = 400; s < len - 400; s += rng.range(1300, 2000)) {
        if (!rng.chance(0.45)) continue;
        const sideS = rng.chance(0.5) ? -1 : 1;
        let cl, front;
        if (r.dir === 'h') { cl = { x: r.x + s, y: sideS < 0 ? r.y - 20 - 460 : r.y + r.h + 20, w: 520, h: 460 }; front = sideS < 0 ? 's' : 'n'; }
        else { cl = { x: sideS < 0 ? r.x - 20 - 460 : r.x + r.w + 20, y: r.y + s, w: 460, h: 520 }; front = sideS < 0 ? 'e' : 'w'; }
        if (!inWorld(cl) || hitsGrid(G.reserved, cl.x, cl.y, cl.w, cl.h)) continue;
        if (districtAtM(M, cl.x + cl.w / 2, cl.y + cl.h / 2) !== 'forest') continue;
        cabin(G, cl, front, rangers < 2 && rng.chance(0.3) && ++rangers);
      }
    }
    // jittered tree grid
    const TS = 160;
    for (let y = 0; y < H; y += TS) for (let x = 0; x < W; x += TS) {
      const tx = x + rng.range(40, 120), ty = y + rng.range(40, 120);
      const d = districtAtM(M, tx, ty);
      const roll = rng.next();
      if (d !== 'forest') continue;
      if (roll > 0.62) continue;
      if (hitsGrid(G.reserved, tx - 40, ty - 40, 80, 80)) continue;
      if (tx > M.excl.x && tx < M.excl.x + M.excl.w && ty > M.excl.y && ty < M.excl.y + M.excl.h) continue;
      if (roll < 0.035) addRock(G, tx, ty);
      else addTree(G, tx, ty, roll < 0.3);
      if (roll < 0.15) decor(G, 'leaves', Math.round(tx - 40), Math.round(ty - 40), 80, 80, { seed: rng.int(0, 1e6) });
    }

    // --- spawn point: quiet suburban street near the center
    const cands = [];
    for (const r of state.roads) {
      if (r.kind !== 'street') continue;
      const len = r.dir === 'h' ? r.w : r.h;
      for (let s = 60; s < len - 60; s += 120) {
        const x = r.dir === 'h' ? r.x + s : r.x + r.w / 2, y = r.dir === 'h' ? r.y + r.h / 2 : r.y + s;
        const along = r.dir === 'h' ? x : y;
        if (r.cross.some((c) => along > c[0] - 220 && along < c[1] + 220)) continue;
        if (districtAtM(M, x, y) !== 'suburb') continue;
        cands.push({ x, y, d: Math.hypot(x - cxm, y - cym) });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    let sp = null;
    const top = cands.slice(0, 8);
    while (top.length && !sp) {
      const c = top.splice(Math.floor(rng.next() * top.length), 1)[0];
      if (SV.phys.isFree(state, c.x, c.y, 30)) sp = c;
    }
    if (!sp) sp = cands.find((c) => SV.phys.isFree(state, c.x, c.y, 20)) || { x: cxm, y: cym };
    state.spawnPoint = { x: Math.round(sp.x), y: Math.round(sp.y) };
    addClear(G, { x: sp.x - 260, y: sp.y - 260, w: 520, h: 520 });

    // --- abandoned cars on roads
    for (const r of state.roads) {
      const len = r.dir === 'h' ? r.w : r.h;
      const dens = r.kind === 'rural' ? 1 / 1600 : r.kind === 'avenue' ? 1 / 650 : 1 / 800;
      const dist = districtAtM(M, r.x + r.w / 2, r.y + r.h / 2);
      const n = Math.round(len * dens * (dist === 'downtown' ? 1.4 : 1));
      for (let k = 0; k < n; k++) {
        const s = rng.range(80, len - 80);
        const abs = (r.dir === 'h' ? r.x : r.y) + s;
        if (r.cross.some((c) => abs > c[0] - 90 && abs < c[1] + 90)) continue;
        const lanes = r.kind === 'avenue' ? [0.2, 0.4, 0.6, 0.8] : [0.28, 0.72];
        const lane = rng.pick(lanes) + rng.range(-0.04, 0.04);
        const x = r.dir === 'h' ? r.x + s : r.x + r.w * lane, y = r.dir === 'h' ? r.y + r.h * lane : r.y + s;
        const car = addCar(G, x, y, r.dir);
        // occasional pile-up
        if (car && rng.chance(0.15)) addCar(G, r.dir === 'h' ? x + rng.pick([-1, 1]) * 105 : x + rng.range(-20, 20), r.dir === 'h' ? y + rng.range(-20, 20) : y + rng.pick([-1, 1]) * 105, r.dir, { wreck: rng.chance(0.4) });
      }
      // potholes / cracks / debris / blood on the asphalt
      const nd = Math.round(len / 500);
      for (let k = 0; k < nd; k++) {
        const s = rng.range(0, len), q = rng.range(0.1, 0.9);
        const x = r.dir === 'h' ? r.x + s : r.x + r.w * q, y = r.dir === 'h' ? r.y + r.h * q : r.y + s;
        const kd = rng.weighted({ crack: 4, debris: 3, blood: 1.5, oil: 1.5 });
        decor(G, kd, Math.round(x), Math.round(y), rng.int(10, 40), rng.int(8, 30), { rot: rng.range(0, 6.28), seed: rng.int(0, 1e6), c: rng.pick(['#3a3530', '#2e3236', '#463c2c']) });
      }
    }

    // --- scattered blood/bodies, more downtown
    for (let k = 0; k < 900; k++) {
      const x = rng.range(CITY0 - 500, CITY1 + 500), y = rng.range(CITY0 - 500, CITY1 + 500);
      const d = districtAtM(M, x, y);
      if (d === 'forest' && rng.chance(0.7)) continue;
      if (d === 'suburb' && rng.chance(0.4)) continue;
      decor(G, rng.chance(0.75) ? 'blood' : 'bones', Math.round(x), Math.round(y), rng.int(14, 34), rng.int(10, 28), { rot: rng.range(0, 6.28), seed: rng.int(0, 1e6) });
    }
    // grass tufts in suburbs
    for (let k = 0; k < 1400; k++) {
      const x = rng.range(CITY0, CITY1), y = rng.range(CITY0, CITY1);
      if (districtAtM(M, x, y) !== 'suburb') continue;
      decor(G, 'tuft', Math.round(x), Math.round(y), rng.int(10, 26), rng.int(10, 26), { seed: rng.int(0, 1e6) });
    }

    // --- POIs: district labels
    state.pois.push({ x: M.downtown.x, y: M.downtown.y, name: 'Downtown', kind: 'district' });
    state.pois.push({ x: M.industrial.x, y: M.industrial.y, name: 'Rustwater Industrial', kind: 'district' });
    const sn = SUBURB_NAMES.slice();
    for (const [dx, dy] of [[0, 0], [-1, -1], [1, 1], [1, -1], [-1, 1]]) {
      const x = cxm + dx * 3600, y = cym + dy * 3600;
      if (districtAtM(M, x, y) !== 'suburb') continue;
      state.pois.push({ x, y: y - 300, name: sn.splice(Math.floor(rng.next() * sn.length), 1)[0], kind: 'district' });
    }
    const fn = FOREST_NAMES.slice();
    for (const [x, y] of [[W / 2, 900], [W / 2, H - 900], [900, H / 2], [W - 900, H / 2]]) {
      if (districtAtM(M, x, y) !== 'forest') continue;
      state.pois.push({ x, y, name: fn.shift(), kind: 'district' });
    }

    // --- coarse building lookup
    M.bcols = Math.ceil(W / BCELL); M.brows = Math.ceil(H / BCELL);
    M.bgrid = new Array(M.bcols * M.brows).fill(null);
    for (const b of state.buildings) {
      const c0 = Math.floor(b.x / BCELL), c1 = Math.floor((b.x + b.w) / BCELL), r0 = Math.floor(b.y / BCELL), r1 = Math.floor((b.y + b.h) / BCELL);
      for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) {
        const k = j * M.bcols + i;
        (M.bgrid[k] = M.bgrid[k] || []).push(b);
      }
    }
    M.genMs = Date.now() - t0;
    Object.defineProperty(state, '_svw', { value: M, writable: true, configurable: true, enumerable: false });
    try { if (SV.worldRender && SV.worldRender.prepare) SV.worldRender.prepare(state); } catch (e) { console.error('worldRender.prepare failed', e); }
    return state;
  }

  function districtAtM(M, x, y) {
    const i = Math.floor(x / DCELL), j = Math.floor(y / DCELL);
    if (i < 0 || j < 0 || i >= M.dcols || j >= M.drows) return 'forest';
    return DNAME[M.dgrid[j * M.dcols + i]];
  }

  // ------------------------------------------------------------------ public API
  SV.world = {
    generate,
    buildingAt(state, x, y) {
      const M = state && state._svw;
      if (!M || !M.bgrid) return null;
      const i = Math.floor(x / BCELL), j = Math.floor(y / BCELL);
      if (i < 0 || j < 0 || i >= M.bcols || j >= M.brows) return null;
      const list = M.bgrid[j * M.bcols + i];
      if (!list) return null;
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b;
      }
      return null;
    },
    // all buildings whose footprint overlaps the rect (used by the renderer for roofs)
    buildingsIn(state, x, y, w, h, out) {
      out = out || [];
      const M = state && state._svw;
      if (!M || !M.bgrid) return out;
      const c0 = Math.max(0, Math.floor(x / BCELL)), c1 = Math.min(M.bcols - 1, Math.floor((x + w) / BCELL));
      const r0 = Math.max(0, Math.floor(y / BCELL)), r1 = Math.min(M.brows - 1, Math.floor((y + h) / BCELL));
      const seen = M._seen || (M._seen = new Set());
      seen.clear();
      for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) {
        const list = M.bgrid[j * M.bcols + i];
        if (!list) continue;
        for (const b of list) {
          if (seen.has(b)) continue;
          seen.add(b);
          if (b.x < x + w && b.x + b.w > x && b.y < y + h && b.y + b.h > y) out.push(b);
        }
      }
      return out;
    },
    districtAt(state, x, y) {
      const M = state && state._svw;
      if (!M) return 'suburb';
      return districtAtM(M, x, y);
    },
    randomSpawnPoint(state, nearX, nearY, minD, maxD, rng) {
      const rnd = rng && rng.next ? rng.next : Math.random;
      minD = minD || 0; maxD = Math.max(maxD || 0, minD + 1);
      for (let t = 0; t < 30; t++) {
        const a = rnd() * Math.PI * 2, d = minD + rnd() * (maxD - minD);
        const x = nearX + Math.cos(a) * d, y = nearY + Math.sin(a) * d;
        if (x < 40 || y < 40 || x > SV.WORLD.w - 40 || y > SV.WORLD.h - 40) continue;
        if (SV.phys.isFree(state, x, y, 18)) return { x, y };
      }
      return null;
    },
    meta(state) { return state && state._svw; },
  };
})();
