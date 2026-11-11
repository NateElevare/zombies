// sv-render.js — Survival draw orchestration: world layers, entities, lighting, HUD, crosshair. Owned by GAME agent.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const U = Z.util;
  const SV = (Z.sv = Z.sv || {});

  let light = null, lightCtx = null;
  let indoor = 0, lastT = 0;

  function inView(x, y, m, cam) {
    return x > cam.x - m && x < cam.x + Z.W + m && y > cam.y - m && y < cam.y + Z.H + m;
  }

  function drawDrop(ctx, d, time) {
    const death = d.kind === 'deathbag';
    if (!death && d.life < 3 && Math.floor(time * 8) % 2 === 0) return;
    ctx.save();
    ctx.translate(d.x, d.y);
    const pulse = death ? 1 + Math.sin(time * 4) * 0.08 : 1;
    ctx.scale(pulse, pulse);
    if (death) { ctx.shadowColor = '#ff3030'; ctx.shadowBlur = 16; }
    ctx.fillStyle = death ? '#7a1616' : '#6b5a3a';
    ctx.strokeStyle = death ? '#ff5050' : '#2e2616';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 2, 10, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = death ? '#a52a2a' : '#8a7648';
    ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(0, -10); ctx.lineTo(4, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (death) {
      ctx.strokeStyle = '#ffd0d0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-4, -1); ctx.lineTo(4, 7); ctx.moveTo(4, -1); ctx.lineTo(-4, 7); ctx.stroke();
    }
    ctx.restore();
  }

  function holeRadial(L, x, y, r0, r1, a) {
    const g = L.createRadialGradient(x, y, r0, x, y, r1);
    g.addColorStop(0, 'rgba(0,0,0,' + a + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    L.fillStyle = g;
    L.beginPath(); L.arc(x, y, r1, 0, Math.PI * 2); L.fill();
  }

  function drawLight(ctx, state, cam) {
    const p = state.player;
    const g = SV.game;
    let d0 = g && g.darkness ? g.darkness(state) : 0;
    const now = Date.now(), dtr = Math.min(0.1, (now - lastT) / 1000 || 0);
    lastT = now;
    let inside = false;
    if (p && SV.world && SV.world.buildingAt) {
      try { inside = !!SV.world.buildingAt(state, p.x, p.y); } catch (e) { inside = false; }
    }
    indoor += ((inside ? 1 : 0) - indoor) * (1 - Math.exp(-4 * dtr));
    let d = d0;
    if (indoor > 0.001) d = d0 + indoor * (Math.min(0.95, Math.max(0.55, d0 + 0.06)) - d0);
    if (d < 0.02) return;
    if (!light) { light = document.createElement('canvas'); lightCtx = light.getContext('2d'); }
    if (light.width !== Z.W || light.height !== Z.H) { light.width = Z.W; light.height = Z.H; }
    const L = lightCtx;
    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, Z.W, Z.H);
    const b = U.clamp(d0 / 0.9, 0, 1); // blue tint scales with night
    L.fillStyle = 'rgba(' + Math.round(4 - 2 * b) + ',' + Math.round(4 + 4 * b) + ',' + Math.round(6 + 20 * b) + ',' + d.toFixed(3) + ')';
    L.fillRect(0, 0, Z.W, Z.H);
    L.globalCompositeOperation = 'destination-out';
    if (p && !p.dead) {
      const sx = Math.round(p.x) - cam.x, sy = Math.round(p.y) - cam.y;
      holeRadial(L, sx, sy, 18, 230, 1);
      if (p.flashlight !== false) {
        const gr = L.createRadialGradient(sx, sy, 30, sx, sy, 640);
        gr.addColorStop(0, 'rgba(0,0,0,0.95)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        L.fillStyle = gr;
        L.beginPath(); L.moveTo(sx, sy); L.arc(sx, sy, 640, p.angle - 0.42, p.angle + 0.42); L.closePath(); L.fill();
      }
    }
    // campfires
    const st = state.structures;
    if (st) {
      const t = (state.time || 0) * 9;
      for (let i = 0; i < st.length; i++) {
        const s = st[i];
        if (s.type !== 'campfire') continue;
        const cx = s.x + (s.w || 0) / 2, cy = s.y + (s.h || 0) / 2;
        if (!inView(cx, cy, 320, cam)) continue;
        const fl = 1 + Math.sin(t + i) * 0.05 + Math.sin(t * 2.3 + i * 2) * 0.04;
        holeRadial(L, cx - cam.x, cy - cam.y, 10, 280 * fl, 0.95);
      }
    }
    L.globalCompositeOperation = 'source-over';
    ctx.drawImage(light, 0, 0);
  }

  function crosshair(ctx) {
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

  SV.render = {
    draw(state) {
      const ctx = Z.ctx;
      if (!ctx) return;
      // Pixel-snapped render camera: snap the player's *screen offset* (which changes slowly as the
      // camera eases) rather than the camera itself, so the player and the world move in the same
      // whole-pixel steps instead of shimmering against each other. Swapped in only while drawing.
      const simCam = state.camera, pl = state.player;
      const cam = pl
        ? { x: Math.round(pl.x) - Math.round(pl.x - simCam.x), y: Math.round(pl.y) - Math.round(pl.y - simCam.y) }
        : { x: Math.round(simCam.x), y: Math.round(simCam.y) };
      state.camera = cam;
      try { drawScene(ctx, state, cam); } finally { state.camera = simCam; }
    },
  };

  function drawScene(ctx, state, cam) {
    {
      const WR = SV.worldRender;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0c0d0b';
      ctx.fillRect(0, 0, Z.W, Z.H);

      ctx.save();
      const sh = state.shake || 0;
      const ox = sh > 0.1 ? (Math.random() - 0.5) * sh * 2 : 0, oy = sh > 0.1 ? (Math.random() - 0.5) * sh * 2 : 0;
      ctx.translate(-cam.x + Math.round(ox), -cam.y + Math.round(oy));
      const time = state.time || 0;

      if (WR && WR.drawGround) WR.drawGround(ctx, state, cam);
      else { ctx.fillStyle = '#1b1d1a'; ctx.fillRect(cam.x, cam.y, Z.W, Z.H); }

      for (const d of state.drops) if (inView(d.x, d.y, 30, cam)) drawDrop(ctx, d, time);
      if (SV.base && SV.base.draw) SV.base.draw(ctx, state, cam);
      if (WR && WR.drawSolids) WR.drawSolids(ctx, state, cam);
      if (SV.zombies && SV.zombies.draw) SV.zombies.draw(ctx, state, cam);
      if (state.player && SV.player && SV.player.draw) SV.player.draw(ctx, state);

      // bullets (tracers)
      ctx.lineCap = 'round';
      for (const b of state.bullets) {
        if (b.dead || !inView(b.x, b.y, 60, cam)) continue;
        const l = 0.022, c = b.color || '#fff6c8';
        ctx.globalAlpha = 0.35; ctx.strokeStyle = c; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(b.x - b.vx * l, b.y - b.vy * l); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(b.x - b.vx * l, b.y - b.vy * l); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      // particles
      for (const p of state.particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      if (WR && WR.drawRoofs) WR.drawRoofs(ctx, state, cam);
      ctx.restore();

      drawLight(ctx, state, cam);

      if (SV.ui && SV.ui.drawHUD) SV.ui.drawHUD(state, ctx);

      if (state.screen === 'playing' && (!state.ui || state.ui === 'build')) crosshair(ctx);
    }
  }
})();
