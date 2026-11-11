import type { GameState } from '../sim/types';
import * as saves from '../sim/save';
export interface CloudUser { id: string; username: string; email: string }
export type CloudStatus = 'offline' | 'signed-out' | 'syncing' | 'synced' | 'error' | 'conflict';
export interface SaveMeta { day: number; level: number; kills: number }
export interface CloudSettings { volume?: number; mute?: boolean; perf?: boolean }
export interface CloudSurvival extends SaveMeta { data: unknown; savedAt: string }
export interface CloudSnapshot { accountId: string; revision: number; survival: CloudSurvival | null; arcadeBest: number; settings: CloudSettings }
interface Session { user: CloudUser; csrfToken: string }
interface Journal { accountId: string; revision: number; data: unknown | null; meta: SaveMeta | null; localAt: number }
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class CloudError extends Error {
  code: string; revision?: number;
  constructor(message: string, code: string, revision?: number) { super(message); this.code = code; this.revision = revision; }
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Local progress and the per-account journal survive every failed upload. */
export class CloudSaveClient {
  user: CloudUser | null = null;
  status: CloudStatus = 'offline';
  error: CloudError | null = null;
  revision = 0;
  private csrfToken = '';
  private fetcher: typeof fetch;
  private storage: StorageLike | null;
  private listeners = new Set<(client: CloudSaveClient) => void>();
  private writes: Promise<unknown> = Promise.resolve();
  private journal: Journal | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastUpload = 0;
  private epoch = 0;
  private blocked = false;
  private ready = false;
  private initializing: Promise<{ user: CloudUser } | null> | null = null;
  constructor(options: { fetch?: typeof fetch; storage?: StorageLike | null } = {}) {
    this.fetcher = options.fetch ?? ((...args) => globalThis.fetch(...args));
    try { this.storage = options.storage === undefined ? globalThis.localStorage ?? null : options.storage; } catch { this.storage = null; }
  }
  on(listener: (client: CloudSaveClient) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify(status: CloudStatus, error: CloudError | null = null) {
    this.status = status; this.error = error;
    for (const listener of this.listeners) { try { listener(this); } catch { /* UI cannot interrupt persistence. */ } }
  }
  private failure(error: unknown) {
    const e = error instanceof CloudError ? error : new CloudError('Cloud unavailable. Progress remains on this device.', 'OFFLINE');
    if (e.code === 'AUTH_REQUIRED') { this.forget(); return e; }
    if (e.code === 'SAVE_CONFLICT') this.blocked = true;
    this.notify(e.code === 'SAVE_CONFLICT' ? 'conflict' : ['OFFLINE', 'SERVER_UNAVAILABLE'].includes(e.code) ? 'offline' : 'error', e);
    return e;
  }
  private key() { return this.user ? 'deadzone-pending:' + this.user.id : ''; }
  pending(): Journal | null {
    try {
      const p = JSON.parse(this.storage?.getItem(this.key()) || 'null');
      return p?.accountId === this.user?.id && Number.isSafeInteger(p.revision) ? p : null;
    } catch { return null; }
  }
  private preserve(data: unknown | null, meta: SaveMeta | null): Journal {
    const old = this.pending();
    const journal: Journal = JSON.parse(JSON.stringify({ accountId: this.user!.id, revision: old?.revision ?? this.revision, data, meta, localAt: Date.now() }));
    this.journal = journal;
    try { this.storage?.setItem(this.key(), JSON.stringify(journal)); }
    catch { this.notify('error', new CloudError('Recovery journal could not be stored. Local survival save is retained.', 'STORAGE_FAILED')); }
    return journal;
  }
  private removeMatching(journal: Journal) {
    if (equal(this.pending(), journal)) this.storage?.removeItem(this.key());
    if (equal(this.journal, journal)) this.journal = null;
  }
  private async request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await this.fetcher(url, { method, credentials: 'same-origin', signal: controller.signal,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' && this.csrfToken ? { 'X-CSRF-Token': this.csrfToken } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      let data;
      try { data = await response.json(); } catch { throw new CloudError('Account server unavailable.', 'OFFLINE'); }
      if (!response.ok) throw new CloudError(data.error || 'Cloud request failed.', data.code || 'REQUEST_FAILED', data.revision);
      return data as T;
    } finally { clearTimeout(timer); }
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const epoch = this.epoch;
    const result = this.writes.then(() => {
      if (epoch !== this.epoch) throw new CloudError('Account changed.', 'SESSION_CHANGED');
      return work();
    });
    this.writes = result.catch(() => {}); return result;
  }
  private async adopt(session: Session) {
    this.cancelTimer(); this.epoch++; this.user = session.user; this.csrfToken = session.csrfToken;
    this.revision = 0; this.blocked = false; this.ready = false; this.journal = null;
    try { await this.load(); } catch { /* load already reports offline/conflict; preserve the signed-in identity. */ }
    return { user: session.user };
  }
  init(): Promise<{ user: CloudUser } | null> {
    if (this.initializing) return this.initializing;
    this.initializing = this.restoreSession().finally(() => { this.initializing = null; });
    return this.initializing;
  }
  private async restoreSession(): Promise<{ user: CloudUser } | null> {
    try { return await this.adopt(await this.request<Session>('/api/auth/session')); }
    catch (error) {
      if (error instanceof CloudError && error.code === 'AUTH_REQUIRED') this.forget();
      else this.failure(error);
      return null;
    }
  }
  async register(username: string, email: string, password: string) {
    return this.authenticate('/api/auth/register', { username, email, password });
  }
  async login(email: string, password: string) { return this.authenticate('/api/auth/login', { email, password }); }
  private async authenticate(url: string, body: unknown) {
    if (this.initializing) await this.initializing;
    await this.flush();
    try { return await this.adopt(await this.request<Session>(url, 'POST', body)); }
    catch (error) { throw this.failure(error); }
  }
  private forget() {
    this.cancelTimer(); this.epoch++; this.user = null; this.csrfToken = ''; this.journal = null;
    this.ready = false; this.blocked = false; this.notify('signed-out');
  }
  async logout() {
    if (this.initializing) await this.initializing;
    await this.flush();
    try { await this.serial(() => this.request('/api/auth/logout', 'POST', {})); this.forget(); }
    catch (error) {
      if (error instanceof CloudError && error.code === 'AUTH_REQUIRED') { this.forget(); return; }
      throw this.failure(error);
    }
  }
  async deleteAccount(password: string) {
    if (this.initializing) await this.initializing;
    this.cancelTimer();
    try {
      await this.serial(() => this.request('/api/auth/delete-account', 'POST', { password }));
      this.storage?.removeItem(this.key()); this.forget();
    } catch (error) { throw this.failure(error); }
  }
  private async peek() {
    const result = await this.request<CloudSnapshot>('/api/save');
    if (result.accountId !== this.user?.id) throw new CloudError('Account changed. Sign in again.', 'SESSION_CHANGED');
    return result;
  }
  async load(): Promise<CloudSnapshot> {
    if (!this.user) throw new CloudError('Sign in first.', 'AUTH_REQUIRED');
    return this.serial(async () => {
      try {
        this.notify('syncing'); const cloud = await this.peek(), pending = this.pending() ?? this.journal;
        this.revision = cloud.revision; this.ready = true;
        if (pending) {
          if (equal(pending.data, cloud.survival?.data ?? null)) { this.removeMatching(pending); this.blocked = false; }
          else if (pending.revision === cloud.revision) {
            this.blocked = false; this.journal = pending; await this.upload(pending);
            return { ...cloud, revision: this.revision, survival: pending.data === null ? null : { data: pending.data, ...pending.meta!, savedAt: new Date(pending.localAt).toISOString() } };
          } else throw new CloudError('Choose keep local or take cloud to resolve newer progress.', 'SAVE_CONFLICT', cloud.revision);
        }
        this.notify('synced'); return cloud;
      } catch (error) { throw this.failure(error); }
    });
  }
  private async upload(journal: Journal) {
    if (this.blocked) throw new CloudError('Choose keep local or take cloud first.', 'SAVE_CONFLICT', this.revision);
    if (!this.ready) throw new CloudError('Reconnect before uploading progress.', 'OFFLINE');
    const epoch = this.epoch, revision = this.revision;
    this.notify('syncing'); this.lastUpload = Date.now();
    const result = await this.request<{ revision: number }>('/api/save/survival', journal.data === null ? 'DELETE' : 'PUT', { ...journal, revision });
    if (epoch !== this.epoch) return;
    this.revision = result.revision;
    if (this.journal === journal) this.removeMatching(journal);
    else if (this.journal?.revision === revision && equal(this.pending(), this.journal)) {
      this.journal.revision = result.revision;
      this.storage?.setItem(this.key(), JSON.stringify(this.journal));
    }
    this.notify(this.pending() ? 'syncing' : 'synced');
  }
  saveSurvival(data: unknown, meta: SaveMeta): Promise<void> {
    if (!this.user) return Promise.resolve();
    const journal = this.preserve(data, meta);
    return this.serial(async () => { try { await this.upload(journal); } catch (error) { throw this.failure(error); } });
  }
  onSaved(state: GameState) {
    if (!this.user || state.mode !== 'survival') return;
    try {
      this.preserve(JSON.parse(saves.serialize(state)), { day: state.clock.day, level: state.player.level, kills: state.stats.kills });
      if (!this.timer && !this.blocked) this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, Math.max(0, 15000 - (Date.now() - this.lastUpload)));
    } catch (error) { this.failure(error); }
  }
  private cancelTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  /** Best effort: errors are reflected in status; callers can safely quit offline. */
  async flush(): Promise<void> {
    this.cancelTimer(); if (!this.user || this.blocked) return;
    try {
      if (!this.ready) { await this.load(); return; }
      await this.serial(async () => {
        const stored = this.pending() ?? this.journal;
        const pending = equal(stored, this.journal) ? this.journal : stored;
        if (!pending) return;
        this.journal = pending;
        // A prior failed acknowledgement may already have advanced the server. Reconcile first.
        const cloud = await this.peek();
        if (equal(pending.data, cloud.survival?.data ?? null)) { this.revision = cloud.revision; this.removeMatching(pending); this.notify('synced'); return; }
        if (pending.revision !== cloud.revision) throw new CloudError('Choose keep local or take cloud.', 'SAVE_CONFLICT', cloud.revision);
        this.revision = cloud.revision; await this.upload(pending);
      });
    } catch (error) { this.failure(error); }
  }
  async pullSurvival(): Promise<'local' | 'cloud' | 'none'> {
    if (this.initializing) await this.initializing;
    const local = saves.read(); if (!this.user) return local ? 'local' : 'none';
    try {
      const cloud = await this.load();
      if (cloud.survival && (!local || (saves.savedAt() > 0 && Date.parse(cloud.survival.savedAt) > saves.savedAt()))) {
        if (!saves.writeRaw(JSON.stringify(cloud.survival.data), Date.parse(cloud.survival.savedAt))) throw new CloudError('Could not install cloud save.', 'STORAGE_FAILED');
        return 'cloud';
      }
      return local ? 'local' : 'none';
    } catch (error) { this.failure(error); return local ? 'local' : 'none'; }
  }
  async clearSurvival(): Promise<void> {
    if (this.initializing) await this.initializing;
    this.cancelTimer(); if (!this.user) return;
    const journal = this.preserve(null, null);
    return this.serial(async () => { try { await this.upload(journal); } catch (error) { throw this.failure(error); } });
  }
  /** Explicit UI conflict choice; never silently force-overwrite another device. */
  async resolveConflict(choice: 'local' | 'cloud'): Promise<void> {
    this.cancelTimer();
    return this.serial(async () => {
      try {
        const cloud = await this.peek(), pending = this.pending() ?? this.journal;
        this.revision = cloud.revision; this.ready = true;
        if (choice === 'cloud') {
          if (cloud.survival ? !saves.writeRaw(JSON.stringify(cloud.survival.data), Date.parse(cloud.survival.savedAt)) : !saves.clear()) throw new CloudError('Could not install cloud save.', 'STORAGE_FAILED');
          if (pending) this.removeMatching(pending); this.journal = null; this.blocked = false; this.notify('synced');
        } else {
          if (!pending) throw new CloudError('No pending local save.', 'NO_PENDING_SAVE');
          this.blocked = false; pending.revision = cloud.revision; this.journal = pending;
          this.storage?.setItem(this.key(), JSON.stringify(pending)); await this.upload(pending);
        }
      } catch (error) { throw this.failure(error); }
    });
  }
  async submitArcadeBest(score: number): Promise<void> {
    if (!this.user) return;
    try { await this.serial(() => this.request('/api/arcade-best', 'PUT', { accountId: this.user!.id, score })); }
    catch (error) { this.failure(error); }
  }
  async saveSettings(settings: CloudSettings): Promise<void> {
    if (!this.user) return;
    try { await this.serial(() => this.request('/api/settings', 'PUT', { accountId: this.user!.id, settings })); }
    catch (error) { throw this.failure(error); }
  }
}
export const cloud = new CloudSaveClient();
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (cloud.user) void cloud.flush(); else void cloud.init(); });
  // Browsers can cancel large unload requests. The synchronous journal is the durability guarantee.
  window.addEventListener('beforeunload', () => { void cloud.flush(); });
}
