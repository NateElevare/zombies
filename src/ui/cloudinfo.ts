// cloudinfo.ts — cached view of the signed-in account's cloud snapshot (for Continue label, arcade best).
import { cloud, type CloudSnapshot } from '../net/cloud';
import { applyCloudSettings } from './settings';

export const info = { snap: null as CloudSnapshot | null, forUser: '', loading: false };
const subs = new Set<() => void>();
export const onInfo = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const fire = () => subs.forEach((f) => { try { f(); } catch { /* ignore */ } });

/** Fetch the snapshot once per signed-in user (force = again). Applies cloud settings on success. */
export async function refreshInfo(force = false): Promise<void> {
  if (!cloud.user) { if (info.snap || info.forUser) { info.snap = null; info.forUser = ''; fire(); } return; }
  if (info.loading || (!force && info.forUser === cloud.user.id)) return;
  info.loading = true; info.forUser = cloud.user.id;
  try { info.snap = await cloud.load(); applyCloudSettings(info.snap.settings); }
  catch { info.snap = null; }
  finally { info.loading = false; fire(); }
}
export const cloudLabel = (s = cloud.status) =>
  ({ synced: 'Synced', syncing: 'Syncing…', offline: 'Offline', error: 'Sync error', conflict: 'Conflict', 'signed-out': '' } as Record<string, string>)[s] ?? '';
