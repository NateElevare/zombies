// render.js — world, entities, lighting, crosshair; then HUD via Z.ui.drawHUD.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});

  let groundPattern = null, groundCtxRef = null;
  let light = null, lightCtx = null;

  function makeGround(ctx) {
    const S = 256, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#1b1d1a';
    g.fillRect(0, 0, S, S);
    // speckle noise
    for (let i = 0; i < 700; i++) {
      const v = 20 + Math.floor(Math.random() * 18);
      g.fillStyle = 'rgba(' + v + ',' + (v + 2) + ',' + v + ',0.55)';
      g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    // cracks
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      let x = Math.random() * S, y = Math.random() * S;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    // tile grid
    g.strokeStyle = 'rgba(255,255,255,0.045)';
    g.strokeRect(0.5, 0.5, S - 1, S - 1);
    g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
    return ctx.createPattern(c, 'repeat');
  }

  function inView(x, y, m, cam) {
    return x > cam.x - m && x < cam.x + Z.W + m && y > cam.y - m && y < cam.y + Z.H + m;
  }

  function drawObstacle(ctx, o) {
    if (o.kind === 'wall') {
      ctx.fillStyle = '#4a4c4f'; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#5b5e62'; ctx.fillRect(o.x, o.y, o.w, Math.min(5, o.h));
      ctx.strokeStyle = '#2b2c2e'; ctx.lineWidth = 2; ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
    } else if (o.kind === 'crate') {
      ctx.fillStyle = '#6b4a28'; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = '#3d2814'; ctx.lineWidth = 3; ctx.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(o.x + 3, o.y + 3); ctx.lineTo(o.x + o.w - 3, o.y + o.h - 3);
      ctx.moveTo(o.x + o.w - 3, o.y + 3); ctx.lineTo(o.x + 3, o.y + o.h - 3);
      ctx.stroke();
    } else {
      // car: colored rounded body + windshield, oriented along its long axis
      const horiz = o.w >= o.h;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(o.x + 3, o.y + 3, o.w, o.h);
      ctx.fillStyle = o.color || '#a33';
      rr(ctx, o.x, o.y, o.w, o.h, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#1c2a35';
      if (horiz) {
        ctx.fillRect(o.x + o.w * 0.58, o.y + 6, o.w * 0.14, o.h - 12);
        ctx.fillRect(o.x + o.w * 0.2, o.y + 6, o.w * 0.1, o.h - 12);
      } else {
        ctx.fillRect(o.x + 6, o.y + o.h * 0.58, o.w - 12, o.h * 0.14);
        ctx.fillRect(o.x + 6, o.y + o.h * 0.2, o.w - 12, o.h * 0.1);
      }
    }
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const PICK = {
    health: { c: '#e04545', t: '+' },
    ammo: { c: '#e0b840', t: 'A' },
    shotgun: { c: '#e07a30', t: 'SG' },
    smg: { c: '#4fc0d0', t: 'SMG' },
  };
  const ZCOL = { walker: '#6b8f4e', runner: '#a3b545', brute: '#4e6b3a' };

  function drawPickup(ctx, p, time) {
    if (p.life < 3 && Math.floor(time * 8) % 2 === 0) return;
    const d = PICK[p.type] || { c: '#fff', t: '?' };
    const pulse = 1 + Math.sin(time * 5 + p.x) * 0.12;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.shadowColor = d.c; ctx.shadowBlur = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.arc(0, 0, p.r * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = d.c; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = d.c;
    ctx.font = 'bold ' + (d.t.length > 2 ? 9 : 14) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(d.t, 0, 1);
    ctx.restore();
  }

  function drawZombie(ctx, z) {
    const flash = z.hitFlash > 0;
    const col = flash ? '#ffffff' : ZCOL[z.type] || '#6b8f4e';
    const a = z.angle || 0;
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.rotate(a);
    // arms reaching forward
    ctx.fillStyle = flash ? '#ffffff' : '#7ea25e';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
    const ar = Math.max(3.5, z.r * 0.28);
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath(); ctx.arc(z.r * 1.05, s * z.r * 0.6, ar, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, z.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // head hint
    ctx.fillStyle = flash ? '#ddd' : 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.arc(z.r * 0.2, 0, z.r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (z.type === 'brute' || z.hp < z.maxHp) {
      const w = z.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(z.x - z.r, z.y - z.r - 9, w, 4);
      ctx.fillStyle = '#c33'; ctx.fillRect(z.x - z.r, z.y - z.r - 9, w * Math.max(0, z.hp / z.maxHp), 4);
    }
  }

  function drawPlayer(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    if (p.invuln > 0 && Math.floor(p.invuln * 25) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#2c2f33'; ctx.fillRect(p.r * 0.2, -3.5, p.r + 14, 7); // barrel
    ctx.fillStyle = '#5ab0ff';
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1d4a78'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#9fd2ff';
    ctx.beginPath(); ctx.arc(2, 0, p.r * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawLight(ctx, state, cam) {
    if (!light) { light = document.createElement('canvas'); lightCtx = light.getContext('2d'); }
    if (light.width !== Z.W || light.height !== Z.H) { light.width = Z.W; light.height = Z.H; }
    const L = lightCtx, p = state.player;
    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, Z.W, Z.H);
    L.fillStyle = 'rgba(0,0,0,0.84)';
    L.fillRect(0, 0, Z.W, Z.H);
    L.globalCompositeOperation = 'destination-out';
    let sx = Z.W / 2, sy = Z.H / 2, ang = 0;
    if (p) { sx = p.x - cam.x; sy = p.y - cam.y; ang = p.angle; }
    // ambient circle around the player
    let g = L.createRadialGradient(sx, sy, 20, sx, sy, 280);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    L.fillStyle = g; L.beginPath(); L.arc(sx, sy, 280, 0, Math.PI * 2); L.fill();
    // flashlight cone toward the aim
    if (p) {
      g = L.createRadialGradient(sx, sy, 30, sx, sy, 640);
      g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      L.fillStyle = g;
      L.beginPath(); L.moveTo(sx, sy); L.arc(sx, sy, 640, ang - 0.42, ang + 0.42); L.closePath(); L.fill();
    }
    ctx.drawImage(light, 0, 0);
  }

  Z.render = {
    draw(state) {
      const ctx = Z.ctx;
      if (!ctx) return;
      if (groundCtxRef !== ctx) { groundPattern = makeGround(ctx); groundCtxRef = ctx; }
      const cam = state.camera;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0c0d0b';
      ctx.fillRect(0, 0, Z.W, Z.H);

      ctx.save();
      const sh = state.shake || 0;
      const ox = sh > 0.1 ? (Math.random() - 0.5) * sh * 2 : 0, oy = sh > 0.1 ? (Math.random() - 0.5) * sh * 2 : 0;
      ctx.translate(Math.round(-cam.x + ox), Math.round(-cam.y + oy));

      // ground
      ctx.fillStyle = groundPattern;
      ctx.fillRect(0, 0, Z.WORLD.w, Z.WORLD.h);

      // obstacles
      for (const o of state.obstacles) {
        if (o.x > cam.x + Z.W || o.y > cam.y + Z.H || o.x + o.w < cam.x || o.y + o.h < cam.y) continue;
        drawObstacle(ctx, o);
      }
      // pickups
      for (const p of state.pickups) if (!p.dead && inView(p.x, p.y, 30, cam)) drawPickup(ctx, p, state.time || performance.now() / 1000);
      // zombies
      for (const z of state.zombies) if (!z.dead && inView(z.x, z.y, 60, cam)) drawZombie(ctx, z);
      // player
      if (state.player && !state.player.dead) drawPlayer(ctx, state.player);
      // bullets (tracers)
      ctx.lineCap = 'round';
      for (const b of state.bullets) {
        if (b.dead) continue;
        const l = 0.022;
        ctx.strokeStyle = 'rgba(255,230,150,0.35)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(b.x - b.vx * l, b.y - b.vy * l); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(b.x - b.vx * l, b.y - b.vy * l); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      // particles
      for (const p of state.particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // darkness / flashlight
      drawLight(ctx, state, cam);

      // HUD
      if (Z.ui && Z.ui.drawHUD && state.screen !== 'title') Z.ui.drawHUD(state, ctx);

      // crosshair
      if (state.screen === 'playing') {
        const m = Z.input.mouse;
        ctx.save();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(m.x, m.y, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(m.x - 15, m.y); ctx.lineTo(m.x - 5, m.y);
        ctx.moveTo(m.x + 5, m.y); ctx.lineTo(m.x + 15, m.y);
        ctx.moveTo(m.x, m.y - 15); ctx.lineTo(m.x, m.y - 5);
        ctx.moveTo(m.x, m.y + 5); ctx.lineTo(m.x, m.y + 15);
        ctx.stroke();
        ctx.restore();
      }
    },
  };
})();
