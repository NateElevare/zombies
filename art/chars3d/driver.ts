// art/chars3d/driver.ts — runs the Three.js character renderer (art/chars3d/web/*) in headless Edge/Chrome via
// the DevTools protocol (same technique as tools/probe.mjs): the web code is bundled with esbuild, injected into
// about:blank, and each job returns a PNG (data URL) plus metadata (hand/grip positions in sprite px).
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface Job { kind: string; w: number; h: number; [k: string]: any }
export interface Result { png: Buffer; meta: any }

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function openRenderer(entry = join(process.cwd(), 'art', 'chars3d', 'web', 'main.ts')) {
  const bundle = await build({
    entryPoints: [entry], bundle: true, format: 'iife', write: false,
    target: 'es2022', logLevel: 'warning', legalComments: 'none',
  });
  const code = bundle.outputFiles[0].text;
  const exe = process.env.CHROME_PATH || BROWSERS.find((p) => existsSync(p));
  if (!exe) throw new Error('art:3d needs Edge or Chrome (set CHROME_PATH)');
  const port = 9600 + Math.floor(Math.random() * 300);
  const profile = mkdtempSync(join(tmpdir(), 'dz-art3d-'));
  const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-webgl', '--enable-unsafe-swiftshader', `--use-angle=${process.env.ART3D_ANGLE || 'swiftshader'}`, '--window-size=800,600', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let tabs: any[] | undefined;
  for (let i = 0; i < 80 && !tabs; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json() as any[]; } catch { await sleep(250); } }
  if (!tabs) throw new Error('browser did not start');
  const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map<number, (d: any) => void>(); const logs: string[] = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(String(m.data));
    if (d.id && pend.has(d.id)) { pend.get(d.id)!(d); pend.delete(d.id); }
    if (d.method === 'Runtime.consoleAPICalled') logs.push(`[${d.params.type}] ` + d.params.args.map((a: any) => a.value ?? a.description ?? '').join(' '));
  };
  const send = (method: string, params: any = {}) => new Promise<any>((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression: string) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error('renderer: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) + '\n' + logs.slice(-10).join('\n'));
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await ev(`window.__dbg = ${JSON.stringify(process.env.ART3D_DBG || '')};\n` + code + '\n;true');
  const glInfo = await ev('window.R3D.glInfo()');
  return {
    glInfo: String(glInfo),
    logs,
    async render(jobs: Job[]): Promise<Result[]> {
      const out: Result[] = [];
      for (let k = 0; k < jobs.length; k += 12) {
        const res = await ev(`window.R3D.renderMany(${JSON.stringify(jobs.slice(k, k + 12))})`) as { url: string; meta: any }[];
        for (const r of res) out.push({ png: Buffer.from(r.url.slice(r.url.indexOf(',') + 1), 'base64'), meta: r.meta });
      }
      return out;
    },
    async close() {
      try { ws.close(); } catch { /* ignore */ }
      proc.kill();
      await sleep(400);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked files are fine */ }
    },
  };
}
