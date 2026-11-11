// WebAudio synthesized SFX (port of legacy/js/audio.js) driven by sim events. Never throws.
import type { AudioLike } from '../shell';
import type { GameState, SimEvent } from '../sim/types';

const LS_KEY = 'deadzone_audio_v1';
const MASTER = 0.4;
/** Minimum ms between two plays of the same sfx (avoids stacking from several event sources). */
const MIN_GAP: Record<string, number> = {
  smg: 30, fizz: 75, hit: 30, pistol: 30, shotgun: 30, rifle: 30, zombieDie: 40, groan: 400, playerHurt: 80, empty: 80,
  pickup: 60, swing: 60, open: 150, craft: 150, build: 120, levelUp: 500, eat: 200, night: 2000,
  zombieAttack: 90, explosion: 60, horde: 3000, waveStart: 800, gameOver: 2000, click: 30,
};
/** Sounds that are UI/global (never attenuated by distance). */
const GLOBAL = new Set(['fizz', 'pickup', 'craft', 'levelUp', 'eat', 'night', 'open', 'build', 'waveStart', 'gameOver', 'horde', 'click', 'empty', 'reload', 'playerHurt']);
const HEARING = 900; // px at which spatial sounds fall to silence

interface Settings { volume: number; muted: boolean }
function loadSettings(): Settings {
  try {
    const j = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (j && typeof j.volume === 'number') return { volume: Math.min(1, Math.max(0, j.volume)), muted: !!j.muted };
  } catch { /* ignore */ }
  return { volume: 0.8, muted: false };
}

export interface AudioApi extends AudioLike {
  volume: number;
  /** Play a named sfx (used by the UI for clicks). */
  play(name: string, x?: number, y?: number, vol?: number): void;
  save(): void;
}

/** Pure helper: gain (0..1) and pan (-1..1) for a sound at (sx,sy) heard from (lx,ly). */
export function spatial(lx: number, ly: number, sx: number, sy: number, range = HEARING) {
  const dx = sx - lx, dy = sy - ly, d = Math.hypot(dx, dy);
  const t = Math.max(0, 1 - d / range);
  return { gain: t * t, pan: Math.max(-1, Math.min(1, dx / 600)) };
}

export function createAudio(): AudioApi {
  let ac: AudioContext | null = null, master: GainNode | null = null, noiseBuf: AudioBuffer | null = null;
  let failed = false, droneStarted = false;
  const last: Record<string, number> = {};
  let lx = 0, ly = 0;
  let shotPos: { x: number; y: number } | null = null;
  const settings = loadSettings();
  let out: AudioNode | null = null; // per-play output node (gain + pan) the building blocks connect to

  const api: AudioApi = {
    get muted() { return settings.muted; },
    set muted(v: boolean) { settings.muted = !!v; applyMaster(); api.save(); },
    get volume() { return settings.volume; },
    set volume(v: number) { settings.volume = Math.min(1, Math.max(0, v)); applyMaster(); api.save(); },
    save() { try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } },
    setListener(x, y) { lx = x; ly = y; },
    play,
    onEvent,
  };

  function applyMaster() {
    try { if (master && ac) master.gain.setTargetAtTime(settings.muted ? 0 : MASTER * settings.volume, ac.currentTime, 0.05); } catch { /* ignore */ }
  }
  function resume() { try { if (ac && ac.state === 'suspended') void ac.resume().catch(() => {}); } catch { /* ignore */ } }

  function init() {
    if (failed) return;
    if (ac) { resume(); return; }
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) { failed = true; return; }
      ac = new AC() as AudioContext;
      master = ac.createGain();
      master.gain.value = settings.muted ? 0 : MASTER * settings.volume;
      master.connect(ac.destination);
      const len = ac.sampleRate;
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      startDrone();
      resume();
    } catch { failed = true; ac = null; }
  }

  function startDrone() {
    if (droneStarted || !ac || !master) return;
    droneStarted = true;
    const a = ac;
    const g = a.createGain(); g.gain.value = 0.05;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    [48, 48.7, 72].forEach((f) => { const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); });
    const lfo = a.createOscillator(); lfo.frequency.value = 0.12;
    const lg = a.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    lp.connect(g); g.connect(master);
  }

  // ---- building blocks (write to `out`, the per-play spatial node) ----
  function noise(t: number, dur: number, vol: number, type: BiquadFilterType, f0: number, f1?: number, q?: number) {
    const a = ac!;
    const s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = a.createBiquadFilter(); f.type = type; f.Q.value = q || 0.7;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(out!);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  function tone(t: number, dur: number, vol: number, wave: OscillatorType, f0: number, f1?: number, filt?: number) {
    const a = ac!;
    const o = a.createOscillator(); o.type = wave;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node: AudioNode = o;
    if (filt) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt; o.connect(f); node = f; }
    node.connect(g); g.connect(out!);
    o.start(t); o.stop(t + dur + 0.02);
  }

  const SFX: Record<string, (t: number) => void> = {
    pistol(t) { noise(t, 0.12, 0.7, 'bandpass', 3000, 800, 0.8); tone(t, 0.1, 0.6, 'square', 260, 60, 1200); },
    shotgun(t) {
      noise(t, 0.4, 1.0, 'lowpass', 5000, 300); noise(t, 0.12, 0.7, 'highpass', 2000, 2000); tone(t, 0.25, 0.8, 'sawtooth', 120, 35, 600);
    },
    fizz(t) { noise(t, 0.16, 0.35, 'highpass', 5200, 2600, 0.6); noise(t, 0.1, 0.25, 'bandpass', 1400, 900, 1.5); },
    smg(t) { noise(t, 0.07, 0.55, 'bandpass', 3500, 1200, 0.9); tone(t, 0.06, 0.4, 'square', 320, 90, 1500); },
    rifle(t) {
      noise(t, 0.22, 0.85, 'bandpass', 2500, 400, 0.7); tone(t, 0.18, 0.7, 'sawtooth', 180, 40, 900); noise(t + 0.02, 0.35, 0.25, 'lowpass', 900, 150);
    },
    reload(t) {
      noise(t, 0.04, 0.5, 'highpass', 3000); tone(t, 0.05, 0.3, 'square', 900, 500);
      noise(t + 0.22, 0.05, 0.6, 'bandpass', 1800, 1200, 2); tone(t + 0.22, 0.08, 0.3, 'square', 400, 200);
      noise(t + 0.45, 0.06, 0.6, 'highpass', 2500);
    },
    empty(t) { tone(t, 0.04, 0.4, 'square', 1500, 1000); noise(t, 0.02, 0.3, 'highpass', 4000); },
    hit(t) { noise(t, 0.09, 0.5, 'lowpass', 1400, 300); tone(t, 0.07, 0.4, 'sine', 180, 70); },
    zombieAttack(t) { noise(t, 0.12, 0.35, 'bandpass', 700, 300, 1.2); tone(t, 0.14, 0.2, 'sawtooth', 130, 70, 500); },
    zombieDie(t) { tone(t, 0.5, 0.35, 'sawtooth', 160, 45, 500); noise(t, 0.25, 0.4, 'lowpass', 900, 150); },
    explosion(t) {
      noise(t, 0.9, 1.0, 'lowpass', 3000, 90); tone(t, 0.6, 0.9, 'sine', 110, 28); noise(t + 0.05, 0.5, 0.5, 'bandpass', 600, 120, 0.6);
    },
    playerHurt(t) { tone(t, 0.25, 0.6, 'sawtooth', 220, 70, 700); noise(t, 0.15, 0.6, 'lowpass', 1500, 200); },
    pickup(t) { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + i * 0.06, 0.14, 0.3, 'triangle', f)); },
    waveStart(t) {
      tone(t, 1.2, 0.5, 'sawtooth', 70, 55, 400); tone(t + 0.02, 1.2, 0.4, 'sawtooth', 105, 82, 400); tone(t + 0.6, 0.9, 0.35, 'square', 140, 138, 500);
    },
    horde(t) {
      tone(t, 2.2, 0.5, 'sawtooth', 60, 46, 350); tone(t + 0.1, 2.2, 0.4, 'sawtooth', 90, 70, 350);
      for (let i = 0; i < 4; i++) tone(t + 0.3 + i * 0.35, 0.9, 0.18, 'sawtooth', 110 + i * 14, 55, 420);
    },
    gameOver(t) {
      [220, 185, 147, 110].forEach((f, i) => tone(t + i * 0.35, 0.6, 0.45, 'sawtooth', f, f * 0.96, 700)); noise(t, 1.5, 0.3, 'lowpass', 600, 80);
    },
    groan(t) {
      const a = ac!, dur = 1.0 + Math.random() * 0.6, base = 55 + Math.random() * 35;
      const o = a.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 1.4, t); o.frequency.exponentialRampToValueAtTime(base, t + dur);
      const lfo = a.createOscillator(); lfo.frequency.value = 5 + Math.random() * 4;
      const lg = a.createGain(); lg.gain.value = base * 0.15;
      lfo.connect(lg); lg.connect(o.frequency);
      const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
      const g = a.createGain();
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.35, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(f); f.connect(g); g.connect(out!);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
    },
    swing(t) { noise(t, 0.16, 0.45, 'bandpass', 600, 2400, 1.2); noise(t + 0.03, 0.1, 0.25, 'highpass', 3000); },
    open(t) { noise(t, 0.08, 0.4, 'lowpass', 900, 300); tone(t, 0.12, 0.25, 'triangle', 220, 160); noise(t + 0.09, 0.18, 0.3, 'bandpass', 1400, 700, 1.5); },
    craft(t) {
      [0, 0.11, 0.22].forEach((d, i) => { noise(t + d, 0.05, 0.5, 'bandpass', 2600 - i * 300, 1500, 3); tone(t + d, 0.06, 0.25, 'square', 700 + i * 120, 400, 2500); });
      tone(t + 0.34, 0.25, 0.25, 'triangle', 660, 990);
    },
    build(t) {
      noise(t, 0.12, 0.8, 'lowpass', 1200, 200); tone(t, 0.18, 0.6, 'sine', 140, 60);
      noise(t + 0.14, 0.1, 0.6, 'lowpass', 1000, 200); tone(t + 0.14, 0.15, 0.45, 'sine', 120, 55);
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
      tone(t, 2.4, 0.4, 'sawtooth', 82, 55, 300); tone(t + 0.05, 2.4, 0.3, 'sawtooth', 123, 82, 300);
      tone(t + 0.8, 1.8, 0.2, 'sine', 330, 311); noise(t, 2.2, 0.15, 'lowpass', 400, 80);
    },
    radio(t) { noise(t,.45,.14,'bandpass',1900,650,1.4);tone(t+.22,.12,.07,'sine',930,800); },
    generator(t) { for(let i=0;i<4;i++)tone(t+i*.13,.18,.13,'sawtooth',65+i*12,48,220);tone(t+.55,1.8,.12,'triangle',55,63,180); },
    bus(t) { tone(t,1.5,.18,'sawtooth',55,110,260);noise(t+.25,.8,.08,'lowpass',340,90); },
    haven(t) { [261.63,329.63,392].forEach((f,i)=>tone(t+i*.2,.8,.16,'triangle',f)); },
    click(t) { tone(t, 0.03, 0.18, 'square', 1200, 800, 3000); },
  };
  const ALIAS: Record<string, string> = { revolver: 'shotgun', assault_rifle: 'rifle', hunting_rifle: 'rifle', melee: 'swing' };

  function play(name: string, x?: number, y?: number, vol = 1) {
    try {
      if (settings.muted || failed) return;
      if (!ac) init();
      if (!ac || !master || !noiseBuf) return;
      if (ac.state !== 'running') { resume(); return; }
      name = ALIAS[name] || name;
      const fn = SFX[name];
      if (!fn) return;
      const now = performance.now();
      if (now - (last[name] ?? -1e9) < (MIN_GAP[name] || 0)) return;
      let gain = vol, pan = 0;
      if (x !== undefined && y !== undefined && !GLOBAL.has(name)) {
        const s = spatial(lx, ly, x, y); gain *= s.gain; pan = s.pan;
        if (gain < 0.01) return;
      }
      last[name] = now;
      const g = ac.createGain(); g.gain.value = gain;
      let node: AudioNode = g;
      if (pan && typeof ac.createStereoPanner === 'function') { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
      node.connect(master);
      out = g;
      fn(ac.currentTime + 0.005);
    } catch { /* audio must never break the game */ } finally { out = null; }
  }

  function onEvent(ev: SimEvent, _s: GameState) {
    try {
      switch (ev.t) {
        // The sim also emits a 'sound' for shots/swings (without position); we remember where they happened.
        case 'shot': case 'swing': shotPos = { x: ev.x, y: ev.y }; break;
        case 'sound': {
          let { x, y } = ev;
          if (x === undefined && shotPos && /^(pistol|shotgun|smg|rifle|swing|revolver)$/.test(ev.name)) { x = shotPos.x; y = shotPos.y; }
          play(ev.name, x, y, ev.vol ?? 1);
          break;
        }
        case 'zombieAttack': play('zombieAttack', ev.x, ev.y); break;
        case 'explosion': play('explosion', ev.x, ev.y); break;
        case 'horde': play('horde'); break;
        case 'playerDied': play('gameOver'); break;
        default: break;
      }
    } catch { /* never throw */ }
  }

  // Create/resume the context on the first user gesture.
  if (typeof window !== 'undefined') {
    const unlock = () => {
      init();
      if (ac && ac.state === 'running') { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); }
    };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  }
  return api;
}
