// sv-player.js — Survival player: movement, needs, interaction/search, damage, drawing. Owned by GAME agent.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});
  const U = Z.util;
  const SV = (Z.sv = Z.sv || {});

  const FOOD_RATE = 100 / 720;  // per second
  const WATER_RATE = 100 / 540;
  let wheel = 0;
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('wheel', function (e) {
      if (Z.state && Z.state.mode === 'survival' && !Z.state.ui) wheel += e.deltaY > 0 ? 1 : -1;
    }, { passive: true });
  }

  function mods(state) {
    try { if (SV.prog && SV.prog.playerMods) return SV.prog.playerMods(state) || {}; } catch (e) { /* ignore */ }
    return {};
  }
  function play(n) { if (Z.audio && Z.audio.play) { try { Z.audio.play(n); } catch (e) { /* ignore */ } } }

  function rectDist(x, y, o) {
    const cx = U.clamp(x, o.x, o.x + o.w), cy = U.clamp(y, o.y, o.y + o.h);
    return Math.hypot(x - cx, y - cy);
  }

  function findInteract(state, p) {
    const R = 70;
    let best = null, bd = Infinity;
    const cs = state.containers;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (Math.abs(c.x + c.w / 2 - p.x) > 400 || Math.abs(c.y + c.h / 2 - p.y) > 400) continue;
      const d = rectDist(p.x, p.y, c);
      if (d < R && d < bd && SV.phys.canReach(state, p.x, p.y, c)) {
        bd = d;
        best = { kind: 'container', target: c, label: (c.searched ? 'Open ' : 'Search ') + (c.name || c.kind || 'container') };
      }
    }
    for (const dr of state.drops) {
      const d = Math.hypot(dr.x - p.x, dr.y - p.y) - (dr.r || 12);
      if (d < R && d < bd && SV.phys.canReach(state, p.x, p.y, dr)) {
        bd = d;
        best = { kind: 'drop', target: dr, label: dr.kind === 'deathbag' ? 'Retrieve belongings' : 'Pick up loot' };
      }
    }
    if (SV.base && SV.base.nearestInteractable) {
      let s = null;
      try { s = SV.base.nearestInteractable(state, p.x, p.y, R); } catch (e) { s = null; }
      if (s) {
        const d = Math.max(0, Math.hypot(s.x + (s.w || 0) / 2 - p.x, s.y + (s.h || 0) / 2 - p.y) - Math.max(s.w || 0, s.h || 0) / 2);
        if (d <= bd + 1) {
          const def = SV.STRUCTURES && SV.STRUCTURES[s.type];
          best = { kind: 'structure', target: s, label: 'Use ' + ((def && def.name) || s.type) };
        }
      }
    }
    return best;
  }

  function openUi(name, data) {
    if (SV.ui && SV.ui.open) SV.ui.open(name, data);
  }

  function finishSearch(state, c) {
    if (SV.loot && SV.loot.fill && !c.inv) SV.loot.fill(c);
    c.searched = true;
    if (SV.prog && SV.prog.addXP) SV.prog.addXP(state, 5);
    state.stats.containersLooted++;
    play('open');
    openUi('loot', c);
  }

  function interact(state, p) {
    const it = state.interact;
    if (!it || !SV.phys.canReach(state, p.x, p.y, it.target)) return;
    if (it.kind === 'container') {
      const c = it.target;
      if (c.searched) { openUi('loot', c); return; }
      const m = mods(state);
      const total = Math.max(0.3, (0.9 + (c.tier || 0) * 0.25) * (m.searchMult || 1));
      state.search = { target: c, t: 0, total };
    } else if (it.kind === 'drop') {
      openUi('loot', it.target);
    } else if (it.kind === 'structure') {
      if (SV.base && SV.base.interact) SV.base.interact(state, it.target);
    }
  }

  function kill(state, p) {
    p.hp = 0;
    if (p.dead) return;
    p.dead = true;
    Z.emit('sv:playerDied');
  }

  SV.player = {
    create(x, y) {
      const inv = SV.inv && SV.inv.createPlayer ? SV.inv.createPlayer()
        : { size: 12, slots: new Array(12).fill(null), equip: { primary: null, secondary: null, melee: null, head: null, body: null, back: null } };
      return {
        x, y, r: 14, angle: 0, speed: 190, hp: 100, maxHp: 100, stamina: 100, maxStamina: 100, food: 100, water: 100,
        invuln: 0, dead: false, inv, active: 'secondary',
        fireCooldown: 0, reloadTimer: 0, reloadTotal: 0, swingTimer: 0,
        xp: 0, level: 1, sp: 0, tech: {},
        spawn: { x, y }, sprinting: false, flashlight: true, bleeding: 0,
      };
    },

    update(state, dt) {
      const p = state.player, I = Z.input;
      if (!p || p.dead) return;
      const m = mods(state);
      if (m.maxHp) p.maxHp = m.maxHp;
      if (m.maxStamina) p.maxStamina = m.maxStamina;
      if (p.invuln > 0) p.invuln -= dt;

      // movement
      let mx = 0, my = 0;
      if (I.keys.KeyW || I.keys.ArrowUp) my -= 1;
      if (I.keys.KeyS || I.keys.ArrowDown) my += 1;
      if (I.keys.KeyA || I.keys.ArrowLeft) mx -= 1;
      if (I.keys.KeyD || I.keys.ArrowRight) mx += 1;
      const moving = mx !== 0 || my !== 0;
      const wantSprint = moving && (I.keys.ShiftLeft || I.keys.ShiftRight);
      if (p.stamina <= 0) p._exhausted = true;
      else if (p.stamina > 15) p._exhausted = false;
      p.sprinting = !!(wantSprint && !p._exhausted && p.stamina > 0);
      const sm = m.speedMult || 1;
      if (p.sprinting) {
        p.stamina = Math.max(0, p.stamina - 25 * dt);
        p._regenDelay = 0.8;
      } else {
        if (p._regenDelay > 0) p._regenDelay -= dt;
        else p.stamina = Math.min(p.maxStamina, p.stamina + 18 * (m.staminaRegenMult || 1) * dt);
      }
      if (moving) {
        const l = Math.hypot(mx, my), sp = p.speed * sm * (p.sprinting ? 1.6 : 1);
        p.x += (mx / l) * sp * dt;
        p.y += (my / l) * sp * dt;
        if (SV.phys) SV.phys.collideCircle(state, p);
        p._noiseT = (p._noiseT || 0) - dt;
        if (p._noiseT <= 0) {
          p._noiseT = 0.6;
          const base = p.sprinting ? 220 : 70;
          if (SV.zombies && SV.zombies.noise) SV.zombies.noise(state, p.x, p.y, base * (m.noiseMult || 1));
        }
      }
      p.angle = Math.atan2(I.mouse.worldY - p.y, I.mouse.worldX - p.x);

      // weapon slots
      if (SV.combat && SV.combat.switchTo) {
        const slots = ['primary', 'secondary', 'melee'];
        for (let i = 0; i < 3; i++) {
          if (I.pressed('Digit' + (i + 1)) || I.pressed('Numpad' + (i + 1))) SV.combat.switchTo(state, slots[i]);
        }
        if (wheel !== 0) {
          const idx = slots.indexOf(p.active);
          SV.combat.switchTo(state, slots[((idx + (wheel > 0 ? 1 : -1)) % 3 + 3) % 3]);
        }
      }
      wheel = 0;

      // needs
      const hm = m.hungerMult || 1;
      p.food = Math.max(0, p.food - FOOD_RATE * hm * dt);
      p.water = Math.max(0, p.water - WATER_RATE * hm * dt);
      if (p.food <= 0 || p.water <= 0) {
        p.hp -= 1 * dt;
      } else if (p.food > 60 && p.water > 60 && p.hp < p.maxHp && !(p.bleeding > 0)) {
        p.hp = Math.min(p.maxHp, p.hp + (0.4 + (m.regen || 0)) * dt);
      } else if (m.regen && p.hp < p.maxHp && !(p.bleeding > 0)) {
        p.hp = Math.min(p.maxHp, p.hp + m.regen * dt);
      }
      if (p.bleeding > 0) {
        p.hp -= 1.2 * dt;
        p.bleeding = Math.max(0, p.bleeding - dt * 0.05); // slow natural clotting
        p._bleedFx = (p._bleedFx || 0) - dt;
        if (p._bleedFx <= 0) { p._bleedFx = 0.5; if (Z.particles && Z.particles.blood) Z.particles.blood(p.x, p.y, 1); }
      }
      if (p.hp <= 0) { kill(state, p); return; }

      // interaction
      p._intT = (p._intT || 0) - dt;
      if (p._intT <= 0) {
        p._intT = 0.1;
        state.interact = state.ui && state.ui !== 'build' ? null : findInteract(state, p);
      }
      if (state.search) {
        const s = state.search, c = s.target;
        if (rectDist(p.x, p.y, c) > 90 || state.ui || !SV.phys.canReach(state, p.x, p.y, c)) {
          state.search = null;
        } else {
          s.t += dt;
          if (s.t >= s.total) { state.search = null; finishSearch(state, c); }
        }
      }
      if (!state.ui && I.pressed('KeyE')) {
        if (state.search) state.search = null;
        else interact(state, p);
      }
    },

    damage(state, amount, angle) {
      const p = state.player;
      if (!p || p.dead || p.invuln > 0 || !(amount > 0)) return;
      const m = mods(state);
      let dmg = amount * (1 - Math.min(0.75, m.armor || 0)) * (1 - Math.min(0.9, m.dmgReduction || 0));
      dmg = Math.max(0.5, dmg);
      p.hp -= dmg;
      p.invuln = 0.35;
      state.shake = Math.max(state.shake || 0, 8);
      if (Z.particles && Z.particles.blood) Z.particles.blood(p.x, p.y, 6);
      play('playerHurt');
      if (dmg >= 8 && Math.random() < 0.25 * (1 - Math.min(0.9, m.bleedResist || 0))) p.bleeding = Math.max(p.bleeding || 0, 1);
      Z.emit('sv:playerHurt', { amount: dmg, angle });
      if (p.hp <= 0) kill(state, p);
    },

    draw(ctx, state) {
      const p = state.player;
      if (!p || p.dead) return;
      const eq = p.inv && p.inv.equip ? p.inv.equip : {};
      const w = eq[p.active];
      const def = w && SV.WEAPONS ? SV.WEAPONS[w.id] : null;
      const cls = def ? def.class : (w ? 'handgun' : 'none');
      ctx.save();
      ctx.translate(Math.round(p.x), Math.round(p.y)); // matches the pixel-snapped render camera
      ctx.rotate(p.angle);
      if (p.invuln > 0 && Math.floor(p.invuln * 25) % 2 === 0) ctx.globalAlpha = 0.45;
      // held item
      if (cls === 'melee' && w) {
        const arc = (def && def.melee && def.melee.arc) || 1.6;
        const range = (def && def.melee && def.melee.range) || 56;
        let a = 0.5;
        if (p.swingTimer > 0) {
          const f = 1 - U.clamp(p.swingTimer / (p.swingTotal || 0.28), 0, 1);
          a = -arc / 2 + arc * f;
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(0, 0, range * 0.85, -arc / 2, a); ctx.stroke();
        }
        const len = w.id === 'bat' ? 34 : w.id === 'machete' ? 30 : 20;
        ctx.save(); ctx.rotate(a);
        ctx.strokeStyle = w.id === 'bat' ? '#8a6234' : '#c9ced3'; ctx.lineWidth = w.id === 'bat' ? 6 : 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.r * 0.6, 0); ctx.lineTo(p.r * 0.6 + len, 0); ctx.stroke();
        ctx.restore();
      } else if (cls === 'none' || cls === 'melee') {
        if (p.swingTimer > 0) {
          ctx.fillStyle = '#e6c9a8';
          ctx.beginPath(); ctx.arc(p.r + 8, 0, 5, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        const L = cls === 'smg' ? 22 : cls === 'shotgun' ? 30 : cls === 'rifle' ? 36 : 15;
        const T = cls === 'shotgun' ? 8 : cls === 'handgun' ? 5 : 6.5;
        ctx.fillStyle = cls === 'shotgun' ? '#5a4630' : cls === 'rifle' ? '#22262a' : '#2c2f33';
        ctx.fillRect(p.r * 0.3, -T / 2, p.r * 0.4 + L, T);
        ctx.fillStyle = '#111';
        ctx.fillRect(p.r * 0.7 + L - 3, -T / 2, 3, T);
      }
      // body
      ctx.fillStyle = '#5ab0ff';
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1d4a78'; ctx.lineWidth = 2; ctx.stroke();
      if (eq.body) {
        ctx.strokeStyle = (SV.ITEMS && SV.ITEMS[eq.body.id] && SV.ITEMS[eq.body.id].color) || '#556b4a';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, p.r - 2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = eq.head ? ((SV.ITEMS && SV.ITEMS[eq.head.id] && SV.ITEMS[eq.head.id].color) || '#444') : '#9fd2ff';
      ctx.beginPath(); ctx.arc(2, 0, p.r * 0.5, 0, Math.PI * 2); ctx.fill();
      if (eq.head) { ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.restore();
    },
  };
})();
