// world.js — obstacle generation and collision helpers.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const U = Z.util;
  const BORDER = 60;
  let obstacles = []; // reference to the current state's obstacles

  function rectHitsCircle(rc, x, y, r) {
    const cx = U.clamp(x, rc.x, rc.x + rc.w), cy = U.clamp(y, rc.y, rc.y + rc.h);
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy < r * r;
  }

  function overlapsRect(a, b, pad) {
    return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
  }

  Z.world = {
    BORDER,
    generate(state) {
      const W = Z.WORLD.w, H = Z.WORLD.h;
      const list = state.obstacles;
      list.length = 0;
      obstacles = list;
      list.push({ x: 0, y: 0, w: W, h: BORDER, kind: 'wall', border: true });
      list.push({ x: 0, y: H - BORDER, w: W, h: BORDER, kind: 'wall', border: true });
      list.push({ x: 0, y: 0, w: BORDER, h: H, kind: 'wall', border: true });
      list.push({ x: W - BORDER, y: 0, w: BORDER, h: H, kind: 'wall', border: true });
      const cx = W / 2, cy = H / 2, clear = 300;
      let tries = 0, count = 0;
      while (count < 70 && tries < 3000) {
        tries++;
        const roll = Math.random();
        let kind, w, h;
        if (roll < 0.35) {
          kind = 'wall';
          if (Math.random() < 0.5) { w = U.rand(120, 320); h = U.rand(30, 46); } else { w = U.rand(30, 46); h = U.rand(120, 320); }
        } else if (roll < 0.75) {
          kind = 'crate'; w = h = U.rand(40, 72);
        } else {
          kind = 'car';
          if (Math.random() < 0.5) { w = 96; h = 50; } else { w = 50; h = 96; }
        }
        const x = U.rand(BORDER + 60, W - BORDER - 60 - w), y = U.rand(BORDER + 60, H - BORDER - 60 - h);
        const rc = { x, y, w, h, kind };
        if (kind === 'car') rc.color = U.choice(['#a33', '#357', '#c92', '#484', '#777', '#836']);
        if (rectHitsCircle(rc, cx, cy, clear)) continue; // keep spawn zone clear
        let bad = false;
        for (const o of list) if (!o.border && overlapsRect(rc, o, 50)) { bad = true; break; }
        if (bad) continue;
        list.push(rc); count++;
      }
    },
    rectHitsCircle,
    // push entity circle (x,y,r) out of every obstacle
    collideCircle(e) {
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < obstacles.length; i++) {
          const o = obstacles[i];
          if (e.x + e.r < o.x || e.x - e.r > o.x + o.w || e.y + e.r < o.y || e.y - e.r > o.y + o.h) continue;
          const cx = U.clamp(e.x, o.x, o.x + o.w), cy = U.clamp(e.y, o.y, o.y + o.h);
          const dx = e.x - cx, dy = e.y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= e.r * e.r) continue;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2), push = e.r - d;
            e.x += (dx / d) * push; e.y += (dy / d) * push;
          } else {
            // center inside rect: exit via nearest side
            const l = e.x - o.x, r = o.x + o.w - e.x, t = e.y - o.y, b = o.y + o.h - e.y;
            const m = Math.min(l, r, t, b);
            if (m === l) e.x = o.x - e.r; else if (m === r) e.x = o.x + o.w + e.r;
            else if (m === t) e.y = o.y - e.r; else e.y = o.y + o.h + e.r;
          }
        }
      }
    },
    pointInObstacle(x, y) {
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return true;
      }
      return false;
    },
    lineOfSight(x1, y1, x2, y2) {
      const d = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.max(1, Math.ceil(d / 16));
      for (let i = 1; i < n; i++) {
        const t = i / n;
        if (Z.world.pointInObstacle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
      }
      return true;
    },
    randomOpenPoint(minDist) {
      const s = Z.state, p = s && s.player, cam = (s && s.camera) || { x: 0, y: 0 };
      const W = Z.WORLD.w, H = Z.WORLD.h, m = BORDER + 30;
      const minD = minDist || 0;
      let last = null; // last open (non-obstacle) point, used as a fallback
      for (let i = 0; i < 80; i++) {
        let x, y;
        if (p && i < 50) {
          // Sample a ring just beyond minDist so zombies arrive quickly instead of
          // spawning anywhere across the 3000px map.
          const a = Math.random() * Math.PI * 2, r = U.rand(minD + 100, minD + 550);
          x = p.x + Math.cos(a) * r; y = p.y + Math.sin(a) * r;
          if (x < m || x > W - m || y < m || y > H - m) continue;
        } else {
          x = U.rand(m, W - m); y = U.rand(m, H - m);
        }
        let hit = false;
        for (const o of obstacles) if (rectHitsCircle(o, x, y, 24)) { hit = true; break; }
        if (hit) continue;
        last = { x, y };
        if (p && U.dist(x, y, p.x, p.y) < minD) continue;
        // prefer off-screen positions for the first 65 tries
        if (i < 65 && x > cam.x - 40 && x < cam.x + Z.W + 40 && y > cam.y - 40 && y < cam.y + Z.H + 40) continue;
        return { x, y };
      }
      return last || { x: W / 2, y: H / 2 };
    },
  };
})();
