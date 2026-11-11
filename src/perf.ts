// perf.ts — in-game frame recorder for chasing stutter on the player's own machine.
// F8 (or ` / Backquote) toggles the overlay + recording. Off: one boolean check per frame, nothing else.
// On: one typed-array row per frame (ring of ~4.5 min @60Hz), Long Animation Frame / longtask observers,
// a live graph, and "Save report" which downloads deadzone-perf-<date>.json for analysis.
// Same approach as gyrofall's perf-recorder (frame classification: busy / idle-late / catch-up / uneven).
import type * as Phaser from 'phaser';
import type { GameState } from './sim/types';

const CAP = 16384;
const FIELDS = {
  ts: Float64Array, interval: Float32Array, sim: Float32Array, render: Float32Array, ui: Float32Array,
  work: Float32Array, steps: Uint8Array, zombies: Uint16Array, bullets: Uint16Array, objects: Uint16Array,
  heap: Float32Array, flags: Uint8Array,
} as const;
type Field = keyof typeof FIELDS;
// flags: 1 survival, 2 arcade, 4 sim paused/overlay, 8 first frame after a gap (tab hidden / recorder start)
const CLASS_NAMES = ['', 'busy', 'idle-late', 'catch-up', 'uneven'] as const;

type Span = { t: number; d: number; kind: string; detail?: string };
type Extra = { steps: number; sim: number; render: number; ui: number; state: GameState };

class PerfRecorder {
  on = false;
  private cols = {} as { [K in Field]: InstanceType<(typeof FIELDS)[K]> };
  private head = 0; private count = 0;
  private frameStart = 0; private lastTs = 0; private gap = true;
  private spans: Span[] = [];
  private marks: { t: number; label: string }[] = [];
  private observers: PerformanceObserver[] = [];
  private overlay: HTMLDivElement | null = null;
  private graph: HTMLCanvasElement | null = null;
  private stats: HTMLDivElement | null = null;
  private game: Phaser.Game | null = null;
  private overlayTimer = 0;

  constructor() {
    for (const [k, T] of Object.entries(FIELDS)) (this.cols as any)[k] = new (T as any)(CAP);
    window.addEventListener('keydown', (e) => { if (e.code === 'F8' || e.code === 'Backquote') { e.preventDefault(); this.toggleOverlay(); } });
    document.addEventListener('visibilitychange', () => { this.gap = true; this.mark(document.hidden ? 'tab-hidden' : 'tab-visible'); });
    try { if (localStorage.getItem('deadzone_perf') === '1') queueMicrotask(() => this.setOn(true)); } catch { /* no storage */ }
  }

  attach(game: Phaser.Game) { this.game = game; }
  mark(label: string) { if (this.on) this.marks.push({ t: performance.now(), label }); }

  // ---------------------------------------------------------------- per frame
  frameBegin(_deltaMs: number) { if (this.on) this.frameStart = performance.now(); }
  frameEnd(x?: Extra) {
    if (!this.on) return;
    const now = performance.now(), i = this.head;
    this.head = (i + 1) % CAP; if (this.count < CAP) this.count++;
    const c = this.cols, s = x?.state;
    c.ts[i] = this.frameStart;
    c.interval[i] = this.lastTs ? this.frameStart - this.lastTs : 0;
    c.sim[i] = x?.sim ?? 0; c.render[i] = x?.render ?? 0; c.ui[i] = x?.ui ?? 0;
    c.work[i] = now - this.frameStart;
    c.steps[i] = x?.steps ?? 0;
    c.zombies[i] = s ? s.zombies.length : 0;
    c.bullets[i] = s ? s.bullets.length : 0;
    c.objects[i] = this.game ? countDisplay(this.game) : 0;
    const mem = (performance as any).memory;
    c.heap[i] = mem ? mem.usedJSHeapSize / 1048576 : 0;
    c.flags[i] = (s?.mode === 'survival' ? 1 : s?.mode === 'arcade' ? 2 : 0)
      | (s && (s.paused || (s.ui && s.ui !== 'build')) ? 4 : 0) | (this.gap ? 8 : 0);
    this.gap = false;
    this.lastTs = this.frameStart;
    if (this.overlay && now - this.overlayTimer > 100) { this.overlayTimer = now; this.drawOverlay(); }
  }

  // ---------------------------------------------------------------- on/off
  toggleOverlay() { this.setOn(!this.on); }
  setOn(v: boolean) {
    this.on = v;
    try { localStorage.setItem('deadzone_perf', v ? '1' : '0'); } catch { /* ignore */ }
    if (v) {
      this.head = this.count = 0; this.spans = []; this.marks = []; this.gap = true; this.lastTs = 0;
      this.observe('long-animation-frame'); this.observe('longtask');
      this.buildOverlay();
    } else {
      for (const o of this.observers) o.disconnect();
      this.observers = [];
      this.overlay?.remove(); this.overlay = null;
    }
  }
  private observe(type: string) {
    try {
      const o = new PerformanceObserver((list) => {
        for (const e of list.getEntries() as any[]) {
          let detail: string | undefined;
          if (e.scripts?.length) {
            const top = [...e.scripts].sort((a: any, b: any) => b.duration - a.duration)[0];
            detail = `${top.invoker || top.name || ''} ${Math.round(top.duration)}ms ${top.sourceFunctionName || ''}@${(top.sourceURL || '').split('/').pop()}`;
          }
          this.spans.push({ t: e.startTime, d: e.duration, kind: type === 'longtask' ? 'longtask' : 'loaf', detail });
          if (this.spans.length > 4000) this.spans.splice(0, 1000);
        }
      });
      o.observe({ type, buffered: false } as any);
      this.observers.push(o);
    } catch { /* unsupported in this browser */ }
  }

  // ---------------------------------------------------------------- analysis
  private rows(fromTs = -Infinity) {
    const out: Record<string, number[]> = {};
    let k = 0;
    const idx = (j: number) => (this.head - this.count + j + CAP) % CAP;
    while (k < this.count && this.cols.ts[idx(k)] < fromTs) k++;
    for (const f of Object.keys(FIELDS) as Field[]) {
      const a: number[] = [];
      for (let j = k; j < this.count; j++) a.push(this.cols[f][idx(j)]);
      out[f] = a;
    }
    return out;
  }
  /** Display refresh interval: median of the shortest cluster holding >= 25% of frames. */
  static refresh(intervals: number[]) {
    const a = intervals.filter((v) => v > 2 && v < 100).sort((x, y) => x - y);
    if (a.length < 10) return 0;
    const need = Math.max(5, a.length * 0.25);
    for (let lo = 0, hi = 0; lo < a.length; lo++) {
      const top = a[lo] * 1.3;
      while (hi < a.length && a[hi] <= top) hi++;
      if (hi - lo >= need) return a[(lo + hi - 1) >> 1];
    }
    return a[a.length >> 1];
  }
  /** Slow frame = interval > 1.5x refresh; classify what probably caused it (work happened in the previous frame). */
  static classify(f: Record<string, number[]>, R: number, spans: Span[]) {
    const n = f.ts.length, out = new Uint8Array(n);
    if (!(R > 0)) return out;
    for (let i = 1; i < n; i++) {
      const iv = f.interval[i];
      if (!(iv > 1.5 * R) || f.flags[i] & 8) continue;
      const p = i - 1, a = f.ts[p], b = f.ts[i];
      const covered = spans.some((s) => s.t < b && s.t + s.d > a && s.d > R);
      if (f.steps[p] >= 3 && f.sim[p] >= 0.5 * f.work[p] && f.work[p] >= 0.5 * R) out[i] = 3;           // catch-up
      else if (f.work[p] >= 0.75 * R || covered) out[i] = 1;                                              // busy (our JS / GC / long task)
      else if (iv < 2.6 * R && ((f.interval[p] > 0 && f.interval[p] < 0.7 * R) || (i + 1 < n && f.interval[i + 1] > 0 && f.interval[i + 1] < 0.7 * R))) out[i] = 4; // uneven cadence
      else out[i] = 2;                                                                                     // idle-late (GPU / compositor / OS)
    }
    return out;
  }
  summary(windowMs = 60000) {
    const end = this.count ? this.cols.ts[(this.head - 1 + CAP) % CAP] : 0;
    const f = this.rows(end - windowMs), n = f.ts.length;
    const R = PerfRecorder.refresh(f.interval);
    const cls = PerfRecorder.classify(f, R, this.spans);
    const classes: Record<string, number> = { busy: 0, 'idle-late': 0, 'catch-up': 0, uneven: 0 };
    const slow: any[] = [];
    for (let i = 0; i < n; i++) if (cls[i]) {
      classes[CLASS_NAMES[cls[i]]]++;
      if (slow.length < 40) slow.push({
        at: Math.round(f.ts[i]), interval: r1(f.interval[i]), cause: CLASS_NAMES[cls[i]],
        prevWork: r1(f.work[i - 1]), prevSim: r1(f.sim[i - 1]), prevRender: r1(f.render[i - 1]), prevUi: r1(f.ui[i - 1]),
        prevSteps: f.steps[i - 1], zombies: f.zombies[i], heapMB: r1(f.heap[i]),
        longTask: this.spans.filter((s) => s.t < f.ts[i] && s.t + s.d > f.ts[i - 1]).map((s) => `${s.kind} ${Math.round(s.d)}ms ${s.detail || ''}`.trim()).slice(0, 3),
      });
    }
    const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? r1(s[Math.min(s.length - 1, Math.floor(p * s.length))]) : 0; };
    const secs = n > 1 ? (f.ts[n - 1] - f.ts[0]) / 1000 : 0;
    const heapDrops = f.heap.reduce((c, h, i) => c + (i && h < f.heap[i - 1] - 4 ? 1 : 0), 0);
    return {
      frames: n, seconds: r1(secs), refreshMs: r1(R), refreshHz: R ? Math.round(1000 / R) : 0,
      fps: secs ? r1(n / secs) : 0,
      slowFrames: Object.values(classes).reduce((a, b) => a + b, 0), slowPerMinute: secs ? r1((Object.values(classes).reduce((a, b) => a + b, 0) * 60) / secs) : 0,
      causes: classes,
      interval: { p50: pct(f.interval, 0.5), p95: pct(f.interval, 0.95), p99: pct(f.interval, 0.99), max: r1(Math.max(0, ...f.interval)) },
      work: { p50: pct(f.work, 0.5), p95: pct(f.work, 0.95), p99: pct(f.work, 0.99), max: r1(Math.max(0, ...f.work)) },
      sim: { p50: pct(f.sim, 0.5), p99: pct(f.sim, 0.99) }, render: { p50: pct(f.render, 0.5), p99: pct(f.render, 0.99) },
      ui: { p50: pct(f.ui, 0.5), p99: pct(f.ui, 0.99) },
      maxZombies: Math.max(0, ...f.zombies), maxObjects: Math.max(0, ...f.objects),
      likelyGcPauses: heapDrops,
      longTasks: this.spans.filter((s) => s.t >= (f.ts[0] ?? 0)).length,
      slow,
    };
  }
  report() {
    return {
      game: 'DEAD ZONE', version: '0.3', when: new Date().toISOString(),
      env: {
        ua: navigator.userAgent, dpr: devicePixelRatio, screen: `${screen.width}x${screen.height}`,
        viewport: `${innerWidth}x${innerHeight}`, cores: navigator.hardwareConcurrency,
        renderer: this.game ? (this.game.renderer as any)?.constructor?.name : '', gpu: gpuName(this.game),
      },
      summary: this.summary(Infinity),
      marks: this.marks.slice(-200),
      frames: this.rows(), // full ring, for offline analysis
    };
  }
  saveReport() {
    const blob = new Blob([JSON.stringify(this.report())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `deadzone-perf-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------------------------------------------------------------- overlay
  private buildOverlay() {
    if (this.overlay) return;
    const o = document.createElement('div');
    o.id = 'perf-overlay';
    o.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;background:rgba(8,9,8,.82);color:#cfd;font:11px/1.35 ui-monospace,Consolas,monospace;padding:6px 8px;border:1px solid #3a4;border-radius:4px;pointer-events:auto;user-select:none';
    const g = document.createElement('canvas'); g.width = 300; g.height = 70; g.style.cssText = 'display:block;margin-bottom:4px';
    const st = document.createElement('div');
    const btn = document.createElement('button');
    btn.textContent = 'Save report';
    btn.style.cssText = 'margin-top:4px;background:#243;color:#dfe;border:1px solid #5a6;padding:2px 8px;cursor:pointer;font:inherit';
    btn.onclick = (e) => { e.stopPropagation(); this.saveReport(); };
    const hint = document.createElement('span'); hint.textContent = '  F8 to hide'; hint.style.opacity = '.6';
    o.append(g, st, btn, hint);
    document.body.appendChild(o);
    this.overlay = o; this.graph = g; this.stats = st;
  }
  private drawOverlay() {
    if (!this.graph || !this.stats) return;
    const g = this.graph.getContext('2d')!, W = this.graph.width, H = this.graph.height;
    const n = Math.min(this.count, W), idx = (j: number) => (this.head - n + j + CAP) % CAP;
    const iv: number[] = []; for (let j = 0; j < this.count && j < 600; j++) iv.push(this.cols.interval[(this.head - 1 - j + CAP) % CAP]);
    const R = PerfRecorder.refresh(iv) || 16.7;
    g.clearRect(0, 0, W, H);
    const y = (ms: number) => H - Math.min(H, (ms / 50) * H);
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(0, y(R)); g.lineTo(W, y(R)); g.stroke();
    g.strokeStyle = 'rgba(255,90,90,.35)'; g.beginPath(); g.moveTo(0, y(R * 1.5)); g.lineTo(W, y(R * 1.5)); g.stroke();
    for (let j = 0; j < n; j++) {
      const i = idx(j), v = this.cols.interval[i], w = this.cols.work[i], s = this.cols.sim[i], r = this.cols.render[i];
      g.fillStyle = v > R * 1.5 ? '#f55' : '#4c6'; g.fillRect(j, y(v), 1, H - y(v));
      g.fillStyle = 'rgba(80,160,255,.9)'; g.fillRect(j, y(r), 1, H - y(r));       // render time
      g.fillStyle = 'rgba(255,200,60,.9)'; g.fillRect(j, y(s + r) , 1, y(r) - y(s + r)); // sim time stacked
      if (w > s + r + 0.5) { g.fillStyle = 'rgba(200,120,255,.8)'; g.fillRect(j, y(w), 1, y(s + r) - y(w)); }
    }
    const sm = this.summary(10000);
    this.stats.innerHTML =
      `<b>${sm.fps} fps</b> @ ${sm.refreshHz}Hz &nbsp; slow ${sm.slowFrames} (${sm.slowPerMinute}/min)<br>` +
      `frame p50 ${sm.interval.p50} p99 ${sm.interval.p99} max ${sm.interval.max}ms<br>` +
      `<span style="color:#fc4">sim</span> ${sm.sim.p50}/${sm.sim.p99} <span style="color:#5af">render</span> ${sm.render.p50}/${sm.render.p99} ui ${sm.ui.p50}/${sm.ui.p99}<br>` +
      `causes: busy ${sm.causes.busy} late ${sm.causes['idle-late']} catch-up ${sm.causes['catch-up']} uneven ${sm.causes.uneven} · GC~${sm.likelyGcPauses}`;
  }
}

function r1(v: number) { return Math.round(v * 10) / 10; }
function countDisplay(game: Phaser.Game) {
  let n = 0;
  for (const sc of game.scene.getScenes(true)) n += (sc as any).children?.length || 0;
  return Math.min(n, 65535);
}
function gpuName(game: Phaser.Game | null) {
  try {
    const gl = (game?.renderer as any)?.gl as WebGLRenderingContext | undefined;
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch { return ''; }
}

export const perf = new PerfRecorder();
export { PerfRecorder };
