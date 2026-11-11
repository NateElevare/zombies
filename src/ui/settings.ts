// settings.ts — shared settings panel (title screen + pause menu): volume, mute, performance recorder.
import type { ShellApi } from '../shell';
import { el } from './dom';
import { cloud, type CloudSettings } from '../net/cloud';
import { keybinds } from '../keybinds';
import { openControls } from './controls';

interface AudioSettings { muted: boolean; volume?: number }
/** The audio sink lives on the GameScene (see window.deadzone, the shell's debug handle). */
export function getAudio(): AudioSettings | null {
  try { return ((window as any).deadzone?.scene?.audio as AudioSettings) ?? null; } catch { return null; }
}
export function toggleMute(): boolean | null {
  const a = getAudio(); if (!a) return null;
  a.muted = !a.muted; pushCloudSettings(); return a.muted;
}
let pushTimer: ReturnType<typeof setTimeout> | null = null;
/** Persist volume/mute/perf to the account (debounced); no-op when signed out. */
export function pushCloudSettings() {
  if (!cloud.user) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const a = getAudio(); if (!a) return;
    cloud.saveSettings({ volume: a.volume ?? 0.8, mute: !!a.muted, perf: perfIsOn() }).catch(() => { /* status shows the error */ });
  }, 500);
}
/** Apply settings loaded from the account. */
export function applyCloudSettings(s: CloudSettings | undefined) {
  if (!s) return;
  const a = getAudio();
  if (a) { if (typeof s.volume === 'number') a.volume = s.volume; if (typeof s.mute === 'boolean') a.muted = s.mute; }
  try { const perf = (window as any).deadzone?.perf; if (perf && typeof s.perf === 'boolean' && perf.on !== s.perf) perf.setOn(s.perf); } catch { /* ignore */ }
}
const perfIsOn = () => { try { return !!(window as any).deadzone?.perf?.on; } catch { return false; } };

export function settingsPanel(shell: ShellApi): HTMLElement {
  const box = el('div', 'settings');
  box.appendChild(el('div', 'set-h', 'SETTINGS'));
  const a = getAudio();

  const vol = el('label', 'set-row'); vol.appendChild(el('span', '', 'Master volume'));
  const range = el('input'); range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '1';
  range.value = String(Math.round((a?.volume ?? 0.8) * 100));
  const vv = el('b', '', range.value + '%');
  range.addEventListener('input', () => { vv.textContent = range.value + '%'; const au = getAudio(); if (au) au.volume = +range.value / 100; pushCloudSettings(); });
  vol.appendChild(range); vol.appendChild(vv); box.appendChild(vol);

  const mute = el('label', 'set-row chk'); const mc = el('input'); mc.type = 'checkbox'; mc.checked = !!a?.muted;
  mc.addEventListener('change', () => { const au = getAudio(); if (au) au.muted = mc.checked; pushCloudSettings(); });
  mute.appendChild(mc); mute.appendChild(el('span', '', 'Mute all audio')); mute.appendChild(el('kbd', '', keybinds.text('mute', true))); box.appendChild(mute);

  const perf = el('label', 'set-row chk'); const pc = el('input'); pc.type = 'checkbox'; pc.checked = perfIsOn();
  pc.addEventListener('change', () => { shell.togglePerf(); setTimeout(pushCloudSettings, 0); });
  perf.appendChild(pc); perf.appendChild(el('span', '', 'Performance recorder')); perf.appendChild(el('kbd', '', 'F8')); box.appendChild(perf);
  // Glow / effects quality (renderer exposes it on window.deadzone.vfx; stored in localStorage 'deadzone-vfx').
  const vfxApi = () => (globalThis as { deadzone?: { vfx?: { get(): boolean; set(on: boolean): void } } }).deadzone?.vfx;
  const vfx = el('label', 'set-row chk'); const vc = el('input'); vc.type = 'checkbox';
  vc.checked = vfxApi()?.get() ?? (() => { try { return localStorage.getItem('deadzone-vfx') !== '0'; } catch { return true; } })();
  vc.addEventListener('change', () => {
    const api = vfxApi();
    if (api) api.set(vc.checked);
    else try { localStorage.setItem('deadzone-vfx', vc.checked ? '1' : '0'); } catch { /* storage blocked */ }
  });
  vfx.appendChild(vc); vfx.appendChild(el('span', '', 'Glow & color effects (turn off if the game stutters)')); box.appendChild(vfx);
  const cb = el('button', 'btn ctl-open', 'Controls…'); cb.addEventListener('click', () => openControls()); box.appendChild(cb);
  return box;
}
