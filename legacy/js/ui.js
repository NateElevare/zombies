// ui.js — HUD (canvas), overlay screens (HTML), banners, toasts, damage vignette.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const KEY = 'deadzone_best';
  const now = () => performance.now();

  let bannerText = '', bannerSub = '', bannerStart = -1e9, bannerDur = 2500;
  let toasts = [];            // {text, t0}
  let hurtT0 = -1e9;
  let prevBest = 0;           // best score as of run start

  function readBest() {
    try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) { return 0; }
  }
  function writeBest(v) { try { localStorage.setItem(KEY, String(v)); } catch (e) {} }
  const $ = (id) => document.getElementById(id);
  const setText = (id, v) => { const e = $(id); if (e) e.textContent = v; };

  function showBanner(text, sub, dur) {
    bannerText = text; bannerSub = sub || ''; bannerStart = now(); bannerDur = dur || 2500;
  }

  const TOAST_TEXT = {
    health: '+HEALTH', ammo: '+AMMO', shotgun: 'SHOTGUN!', smg: 'SMG!',
  };

  function startGame() {
    if (Z.audio && Z.audio.init) Z.audio.init();
    if (Z.game && Z.game.start) Z.game.start();
  }

  const ui = (Z.ui = {
    init() {
      const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
      on('btn-start', startGame);
      on('btn-again', startGame);
      on('btn-resume', () => { if (Z.game && Z.game.resume) Z.game.resume(); });
      on('btn-quit', () => { Z.state.screen = 'title'; ui.showScreen('title'); });

      window.addEventListener('keydown', (e) => {
        if (Z.audio && Z.audio.init) Z.audio.init(); // first gesture unlocks audio
        const s = Z.state && Z.state.screen;
        if ((e.code === 'Enter' || e.code === 'Space') && (s === 'title' || s === 'gameover')) {
          e.preventDefault();
          startGame();
        } else if (e.code === 'KeyM' && !e.repeat && Z.audio) {
          Z.audio.muted = !Z.audio.muted;
          showToast(Z.audio.muted ? 'MUTED' : 'SOUND ON');
        }
      });
      window.addEventListener('pointerdown', () => { if (Z.audio && Z.audio.init) Z.audio.init(); });

      Z.on('waveStart', (n) => {
        const num = typeof n === 'number' ? n : (Z.state.wave && Z.state.wave.number) || 1;
        showBanner('WAVE ' + num, '', 2500);
      });
      Z.on('waveCleared', () => showBanner('WAVE CLEARED', 'break', 3500));
      Z.on('pickup', (type) => showToast(TOAST_TEXT[type] || ('+' + String(type).toUpperCase())));
      Z.on('playerHurt', () => { hurtT0 = now(); });

      ui.showScreen(Z.state.screen || 'title');
    },

    showScreen(name) {
      if (name === 'pause') name = 'paused'; // main.js uses state.screen names; overlay id is #pause
      ['title', 'pause', 'gameover'].forEach((id) => {
        const visible = id === name || (id === 'pause' && name === 'paused');
        const e = $(id);
        if (e) e.classList.toggle('hidden', !visible);
      });
      document.body.classList.toggle('menu', name !== 'playing');
      const st = Z.state;
      if (name === 'title') {
        setText('title-best', readBest());
      } else if (name === 'playing') {
        if (!(st && st.screen === 'paused')) { prevBest = readBest(); }
        if (!(st && st.screen === 'paused')) { toasts = []; hurtT0 = -1e9; }
      } else if (name === 'gameover' && st) {
        const score = (st.stats && st.stats.score) || 0;
        const isNew = score > prevBest;
        const best = Math.max(score, prevBest, readBest());
        if (isNew) writeBest(best);
        setText('go-wave', (st.wave && st.wave.number) || 0);
        setText('go-kills', (st.stats && st.stats.kills) || 0);
        setText('go-score', score);
        setText('go-best', best);
        const nb = $('go-newbest');
        if (nb) nb.classList.toggle('hidden', !isNew);
        prevBest = best;
      }
    },

    update(state) { /* UI animation is driven by performance.now(); nothing needed */ },

    drawHUD(state, ctx) {
      if (!state || !ctx) return;
      const W = Z.W, H = Z.H, t = now();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const p = state.player;

      // damage vignette
      const hurtAge = t - hurtT0;
      if (hurtAge < 450) drawVignette(ctx, W, H, 0.55 * (1 - hurtAge / 450));
      if (p && p.hp > 0 && p.hp / p.maxHp < 0.3) {
        drawVignette(ctx, W, H, 0.12 + 0.1 * Math.sin(t / 150));
      }

      ctx.textBaseline = 'alphabetic';
      const FONT = 'Impact, "Arial Narrow Bold", "Arial Black", sans-serif';

      // top: wave / remaining / score
      ctx.textAlign = 'center';
      ctx.font = '28px ' + FONT;
      outlined(ctx, 'WAVE ' + (state.wave ? state.wave.number : 0), W / 2, 36, '#e8e8e0');
      ctx.font = '16px ' + FONT;
      const rem = state.wave ? state.wave.remaining : 0;
      outlined(ctx, state.wave && state.wave.inBreak ? 'NEXT WAVE IN ' + Math.ceil(state.wave.breakTimer) : 'ZOMBIES LEFT: ' + rem, W / 2, 58, '#c88');
      ctx.textAlign = 'left';
      ctx.font = '22px ' + FONT;
      outlined(ctx, 'SCORE ' + ((state.stats && state.stats.score) || 0), 20, 34, '#fc6');
      ctx.font = '15px ' + FONT;
      outlined(ctx, 'KILLS ' + ((state.stats && state.stats.kills) || 0), 20, 56, '#aaa');

      if (p) {
        // HP bar bottom-left
        const bx = 20, bw = 240, bh = 22, by = H - 20 - bh;
        const frac = Z.util.clamp(p.hp / p.maxHp, 0, 1);
        const low = frac < 0.3;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
        const pulse = low ? 0.65 + 0.35 * Math.sin(t / 110) : 1;
        const hue = Math.round(frac * 110); // green -> red
        ctx.globalAlpha = pulse;
        ctx.fillStyle = 'hsl(' + hue + ',75%,42%)';
        ctx.fillRect(bx, by, bw * frac, bh);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = low ? '#f33' : '#666'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
        ctx.font = '15px ' + FONT; ctx.textAlign = 'left';
        outlined(ctx, 'HP ' + Math.ceil(Math.max(0, p.hp)), bx + 8, by + 17, '#fff');

        // weapon panel bottom-right
        const cur = p.current, wdef = (Z.WEAPONS && Z.WEAPONS[cur]) || {};
        const w = p.weapons && p.weapons[cur];
        const rx = W - 20;
        ctx.textAlign = 'right';
        ctx.font = '20px ' + FONT;
        outlined(ctx, (wdef.name || cur || '').toUpperCase(), rx, H - 76, '#ddd');
        if (w) {
          ctx.font = '40px ' + FONT;
          const res = w.reserve === Infinity ? '∞' : w.reserve;
          const empty = w.mag === 0;
          outlined(ctx, w.mag + ' / ' + res, rx, H - 36, empty ? '#f44' : '#fff');
          if (p.reloadTimer > 0 && wdef.reloadTime) {
            const rp = Z.util.clamp(1 - p.reloadTimer / wdef.reloadTime, 0, 1);
            const rw = 160;
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(rx - rw, H - 28, rw, 8);
            ctx.fillStyle = '#fc6'; ctx.fillRect(rx - rw, H - 28, rw * rp, 8);
            ctx.font = '14px ' + FONT;
            outlined(ctx, 'RELOADING', rx, H - 90 - 4, '#fc6');
          } else if (empty) {
            if (Math.floor(t / 250) % 2 === 0) {
              ctx.textAlign = 'center'; ctx.font = '26px ' + FONT;
              outlined(ctx, w.reserve > 0 ? 'RELOAD (R)' : 'NO AMMO', W / 2, H / 2 + 70, '#f44');
            }
          }
        }
        // weapon slots
        const names = ['pistol', 'shotgun', 'smg'];
        for (let i = 0; i < 3; i++) {
          const owned = p.weapons && p.weapons[names[i]] && p.weapons[names[i]].owned;
          const sx = rx - 3 * 44 + i * 44, sy = H - 130, sz = 38;
          const sel = cur === names[i];
          ctx.fillStyle = sel ? 'rgba(160,0,0,0.75)' : 'rgba(0,0,0,0.55)';
          ctx.fillRect(sx, sy, sz, sz);
          ctx.strokeStyle = sel ? '#f55' : owned ? '#888' : '#333'; ctx.lineWidth = 2;
          ctx.strokeRect(sx, sy, sz, sz);
          ctx.textAlign = 'center'; ctx.font = '22px ' + FONT;
          ctx.fillStyle = owned ? (sel ? '#fff' : '#bbb') : '#444';
          ctx.fillText(String(i + 1), sx + sz / 2, sy + 27);
        }
      }

      // wave banner
      const age = t - bannerStart;
      if (age >= 0 && age < bannerDur) {
        const f = age / bannerDur;
        const a = f < 0.12 ? f / 0.12 : Math.min(1, (1 - f) / 0.5);
        ctx.globalAlpha = Z.util.clamp(a, 0, 1);
        ctx.textAlign = 'center';
        const sc = 1 + 0.15 * (1 - Math.min(1, f * 4));
        ctx.font = Math.round(84 * sc) + 'px ' + FONT;
        ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(bannerText, W / 2, H * 0.28);
        ctx.fillStyle = bannerText === 'WAVE CLEARED' ? '#7c7' : '#d11';
        ctx.fillText(bannerText, W / 2, H * 0.28);
        if (bannerSub === 'break' && state.wave) {
          ctx.font = '28px ' + FONT;
          outlined(ctx, 'NEXT WAVE IN ' + Math.max(0, Math.ceil(state.wave.breakTimer)), W / 2, H * 0.28 + 44, '#ddd');
        }
        ctx.globalAlpha = 1;
      }

      // toasts
      toasts = toasts.filter((o) => t - o.t0 < 1400);
      ctx.textAlign = 'center'; ctx.font = '24px ' + FONT;
      for (const o of toasts) {
        const f = (t - o.t0) / 1400;
        ctx.globalAlpha = 1 - f * f;
        outlined(ctx, o.text, W / 2, H / 2 - 60 - f * 50, '#fe8');
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },
  });

  function showToast(text) {
    toasts.push({ text, t0: now() });
    if (toasts.length > 4) toasts.shift();
  }

  function outlined(ctx, text, x, y, color) {
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  function drawVignette(ctx, W, H, alpha) {
    if (alpha <= 0) return;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(180,0,0,0)');
    g.addColorStop(1, 'rgba(180,0,0,' + alpha.toFixed(3) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
})();
