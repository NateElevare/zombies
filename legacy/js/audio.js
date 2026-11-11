// audio.js — synthesized WebAudio SFX. No files. Never throws.
(function () {
  'use strict';
  const Z = (window.Z = window.Z || {});

  let ac = null, master = null, noiseBuf = null, failed = false, droneStarted = false;
  const last = {};
  const MIN_GAP = { smg: 30, hit: 30, pistol: 30, shotgun: 30, zombieDie: 40, groan: 400, playerHurt: 80, empty: 80, pickup: 60 };

  function init() {
    if (failed) return;
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { failed = true; return; }
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.4;
        master.connect(ac.destination);
        const len = ac.sampleRate; // 1s white noise
        noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        startDrone();
      }
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { failed = true; ac = null; }
  }

  function startDrone() {
    if (droneStarted) return;
    droneStarted = true;
    const g = ac.createGain(); g.gain.value = 0.05;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    [48, 48.7, 72].forEach((f) => {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start();
    });
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.12;
    const lg = ac.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    lp.connect(g); g.connect(master);
  }

  // --- building blocks ---
  function noise(t, dur, vol, type, f0, f1, q) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q || 0.7;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  function tone(t, dur, vol, wave, f0, f1, filt) {
    const o = ac.createOscillator(); o.type = wave;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let out = o;
    if (filt) {
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt;
      o.connect(f); out = f;
    }
    out.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  const SFX = {
    pistol(t) {
      noise(t, 0.12, 0.7, 'bandpass', 3000, 800, 0.8);
      tone(t, 0.1, 0.6, 'square', 260, 60, 1200);
    },
    shotgun(t) {
      noise(t, 0.4, 1.0, 'lowpass', 5000, 300);
      noise(t, 0.12, 0.7, 'highpass', 2000, 2000);
      tone(t, 0.25, 0.8, 'sawtooth', 120, 35, 600);
    },
    smg(t) {
      noise(t, 0.07, 0.55, 'bandpass', 3500, 1200, 0.9);
      tone(t, 0.06, 0.4, 'square', 320, 90, 1500);
    },
    reload(t) {
      noise(t, 0.04, 0.5, 'highpass', 3000);
      tone(t, 0.05, 0.3, 'square', 900, 500);
      noise(t + 0.22, 0.05, 0.6, 'bandpass', 1800, 1200, 2);
      tone(t + 0.22, 0.08, 0.3, 'square', 400, 200);
      noise(t + 0.45, 0.06, 0.6, 'highpass', 2500);
    },
    empty(t) { tone(t, 0.04, 0.4, 'square', 1500, 1000); noise(t, 0.02, 0.3, 'highpass', 4000); },
    hit(t) { noise(t, 0.09, 0.5, 'lowpass', 1400, 300); tone(t, 0.07, 0.4, 'sine', 180, 70); },
    zombieDie(t) {
      tone(t, 0.5, 0.35, 'sawtooth', 160, 45, 500);
      noise(t, 0.25, 0.4, 'lowpass', 900, 150);
    },
    playerHurt(t) {
      tone(t, 0.25, 0.6, 'sawtooth', 220, 70, 700);
      noise(t, 0.15, 0.6, 'lowpass', 1500, 200);
    },
    pickup(t) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + i * 0.06, 0.14, 0.3, 'triangle', f));
    },
    waveStart(t) {
      tone(t, 1.2, 0.5, 'sawtooth', 70, 55, 400);
      tone(t + 0.02, 1.2, 0.4, 'sawtooth', 105, 82, 400);
      tone(t + 0.6, 0.9, 0.35, 'square', 140, 138, 500);
    },
    gameOver(t) {
      [220, 185, 147, 110].forEach((f, i) => tone(t + i * 0.35, 0.6, 0.45, 'sawtooth', f, f * 0.96, 700));
      noise(t, 1.5, 0.3, 'lowpass', 600, 80);
    },
    groan(t) {
      const dur = 1.0 + Math.random() * 0.6;
      const base = 55 + Math.random() * 35;
      const o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 1.4, t);
      o.frequency.exponentialRampToValueAtTime(base, t + dur);
      const lfo = ac.createOscillator(); lfo.frequency.value = 5 + Math.random() * 4;
      const lg = ac.createGain(); lg.gain.value = base * 0.15;
      lfo.connect(lg); lg.connect(o.frequency);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.35, t + dur * 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
    },
    // ---- survival mode sounds (appended by the survival UI agent) ----
    swing(t) {
      noise(t, 0.16, 0.45, 'bandpass', 600, 2400, 1.2);
      noise(t + 0.03, 0.1, 0.25, 'highpass', 3000);
    },
    open(t) {
      noise(t, 0.08, 0.4, 'lowpass', 900, 300);
      tone(t, 0.12, 0.25, 'triangle', 220, 160);
      noise(t + 0.09, 0.18, 0.3, 'bandpass', 1400, 700, 1.5);
    },
    craft(t) {
      [0, 0.11, 0.22].forEach((d, i) => {
        noise(t + d, 0.05, 0.5, 'bandpass', 2600 - i * 300, 1500, 3);
        tone(t + d, 0.06, 0.25, 'square', 700 + i * 120, 400, 2500);
      });
      tone(t + 0.34, 0.25, 0.25, 'triangle', 660, 990);
    },
    build(t) {
      noise(t, 0.12, 0.8, 'lowpass', 1200, 200);
      tone(t, 0.18, 0.6, 'sine', 140, 60);
      noise(t + 0.14, 0.1, 0.6, 'lowpass', 1000, 200);
      tone(t + 0.14, 0.15, 0.45, 'sine', 120, 55);
    },
    levelUp(t) {
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + i * 0.08, 0.3, 0.28, 'triangle', f));
      tone(t + 0.4, 0.7, 0.2, 'sawtooth', 523.25, 1046.5, 2200);
    },
    eat(t) {
      for (let i = 0; i < 3; i++) noise(t + i * 0.13, 0.07, 0.45, 'bandpass', 900 + Math.random() * 600, 500, 2);
      tone(t + 0.42, 0.12, 0.2, 'sine', 300, 180);
    },
    night(t) {
      tone(t, 2.4, 0.4, 'sawtooth', 82, 55, 300);
      tone(t + 0.05, 2.4, 0.3, 'sawtooth', 123, 82, 300);
      tone(t + 0.8, 1.8, 0.2, 'sine', 330, 311);
      noise(t, 2.2, 0.15, 'lowpass', 400, 80);
    },
  };
  // min gaps for the survival sounds (avoid double triggers from multiple modules)
  Object.assign(MIN_GAP, { swing: 60, open: 150, craft: 150, build: 120, levelUp: 500, eat: 200, night: 2000 });

  let isMuted = false;
  Z.audio = {
    // Muting silences the master bus so the ambient drone goes quiet too.
    get muted() { return isMuted; },
    set muted(v) {
      isMuted = !!v;
      try { if (master && ac) master.gain.setTargetAtTime(isMuted ? 0 : 0.4, ac.currentTime, 0.05); } catch (e) { /* ignore */ }
    },
    init() { init(); if (isMuted) this.muted = true; },
    play(name) {
      try {
        if (this.muted || failed) return;
        if (!ac) init();
        if (!ac || ac.state === 'suspended') { if (ac) ac.resume(); if (!ac || ac.state !== 'running') return; }
        const fn = SFX[name];
        if (!fn) return;
        const nowMs = performance.now();
        if (nowMs - (last[name] || -1e9) < (MIN_GAP[name] || 0)) return;
        last[name] = nowMs;
        fn(ac.currentTime + 0.005);
      } catch (e) { /* audio must never break the game */ }
    },
  };
})();
