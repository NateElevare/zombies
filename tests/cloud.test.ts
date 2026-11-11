import { describe, it, expect, vi, afterEach } from 'vitest';
import { CloudSaveClient } from '../src/net/cloud.ts';
import { newGame } from '../src/sim/game';
import * as saves from '../src/sim/save';
const meta = { day: 1, level: 1, kills: 0 };
function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
  vi.stubGlobal('localStorage', storage);
  const state = { accountId: 'alice', revision: 0, survival: null as any, online: true, lostReply: false, puts: 0 };
  const fetcher: typeof fetch = async (url, options = {}) => {
    if (!state.online) throw Error('Offline');
    if (String(url).includes('/auth/')) return Response.json({ user: { id: state.accountId, username: 'Alice', email: 'a@b.com' }, csrfToken: 'csrf' });
    if (options.method === 'PUT' || options.method === 'DELETE') {
      state.puts++; const body = JSON.parse(options.body as string);
      expect((options.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf');
      if (body.accountId !== state.accountId) return Response.json({ code: 'SESSION_CHANGED' }, { status: 403 });
      if (body.revision !== state.revision) return Response.json({ code: 'SAVE_CONFLICT', revision: state.revision }, { status: 409 });
      state.survival = options.method === 'DELETE' ? null : { data: body.data, ...body.meta, savedAt: new Date().toISOString() }; state.revision++;
      if (state.lostReply) throw Error('Reply lost');
      return Response.json({ revision: state.revision });
    }
    return Response.json({ accountId: state.accountId, revision: state.revision, survival: state.survival, arcadeBest: 0, settings: {} });
  };
  const make = (fetch: typeof globalThis.fetch = fetcher) => new CloudSaveClient({ fetch, storage });
  return { state, storage, make, fetcher, values };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('cloud journal and conflict handling', () => {
  it('waits for startup before Continue installs newer cloud progress (bug 1)', async () => {
    const f = fixture(), local = saves.serialize(newGame(11)), remote = saves.serialize(newGame(22));
    saves.writeRaw(local, 1000);
    f.state.revision = 4;
    f.state.survival = { data: JSON.parse(remote), ...meta, savedAt: new Date(2000).toISOString() };
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const client = f.make(async (url, options) => { if (url === '/api/auth/session') await gate; return f.fetcher(url, options); });
    const startup = client.init(), pull = client.pullSurvival();
    release(); await startup;
    expect(await pull).toBe('cloud'); expect(saves.read()?.seed).toBe(22);
    await client.saveSurvival(saves.read(), meta);
    expect(f.state.survival.data.seed).toBe(22); expect(client.status).toBe('synced');
  });
  it('waits for startup before clearing cloud survival for New Game (bug 1)', async () => {
    const f = fixture(); f.state.survival = { data: { seed: 22 }, ...meta }; f.state.revision = 4;
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const client = f.make(async (url, options) => { if (url === '/api/auth/session') await gate; return f.fetcher(url, options); });
    const startup = client.init(), clear = client.clearSurvival();
    release(); await startup; await clear;
    expect(f.state.survival).toBeNull(); expect(f.state.revision).toBe(5);
  });
  it.each(['load', 'logout'] as const)('forgets expired authentication on %s and retains recovery data (bug 5)', async action => {
    const f = fixture(); let expired = false;
    const client = f.make((url, options) => expired
      ? Promise.resolve(Response.json({ code: 'AUTH_REQUIRED' }, { status: 401 })) : f.fetcher(url, options));
    await client.init(); f.state.online = false;
    await expect(client.saveSurvival({ seed: 42 }, meta)).rejects.toThrow();
    const journal = f.storage.getItem('deadzone-pending:alice');
    expired = true;
    if (action === 'logout') await expect(client.logout()).resolves.toBeUndefined();
    else await expect(client.load()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(client.user).toBeNull(); expect(client.status).toBe('signed-out');
    expect(f.storage.getItem('deadzone-pending:alice')).toBe(journal);
    expired = false; f.state.online = true; await client.login('a@b.com', 'password');
    expect(f.state.survival.data).toEqual({ seed: 42 }); expect(client.pending()).toBeNull();
  });
  it('recovers offline writes across restart and recognizes lost acknowledgements', async () => {
    const f = fixture(), first = f.make(); await first.init(); f.state.online = false;
    await expect(first.saveSurvival({ seed: 42 }, meta)).rejects.toMatchObject({ code: 'OFFLINE' });
    expect(first.pending()?.data).toEqual({ seed: 42 }); f.state.online = true;
    const recovered = f.make(); await recovered.init(); expect(f.state.survival.data).toEqual({ seed: 42 }); expect(recovered.pending()).toBeNull();
    f.state.lostReply = true; await expect(recovered.saveSurvival({ seed: 99 }, meta)).rejects.toThrow(); f.state.lostReply = false;
    const third = f.make(); await third.init(); expect(third.pending()).toBeNull(); expect(f.state.revision).toBe(2); expect(f.state.puts).toBe(2);
  });
  it('surfaces a choice on conflict and only rebases after explicit keep-local', async () => {
    const f = fixture(), first = f.make(), second = f.make(); await first.init(); await second.init();
    await first.saveSurvival({ seed: 1 }, meta);
    await expect(second.saveSurvival({ seed: 2 }, meta)).rejects.toMatchObject({ code: 'SAVE_CONFLICT' });
    expect(second.status).toBe('conflict'); expect(f.state.survival.data).toEqual({ seed: 1 });
    await second.flush(); expect(f.state.survival.data).toEqual({ seed: 1 });
    const restarted = f.make(); await restarted.init(); expect(restarted.status).toBe('conflict'); expect(restarted.pending()?.data).toEqual({ seed: 2 });
    await restarted.resolveConflict('local'); expect(f.state.survival.data).toEqual({ seed: 2 }); expect(restarted.pending()).toBeNull();
  });
  it('take-cloud installs the validated save and removes only its own pending copy', async () => {
    const f = fixture(), client = f.make(); await client.init();
    f.state.survival = { data: JSON.parse(saves.serialize(newGame(123))), ...meta, savedAt: new Date().toISOString() }; f.state.revision = 1;
    await expect(client.saveSurvival({ seed: 9 }, meta)).rejects.toThrow();
    await client.resolveConflict('cloud'); expect(saves.read()?.seed).toBe(123); expect(client.status).toBe('synced'); expect(client.pending()).toBeNull();
  });
  it('journals queued snapshots immediately and preserves/rebases B when stalled A succeeds', async () => {
    const f = fixture(); let release!: () => void, entered!: () => void;
    const started = new Promise<void>(r => { entered = r; }); let stalled = true;
    const client = f.make(async (url, options) => {
      if (options?.method === 'PUT' && stalled) { entered(); await new Promise<void>(r => { release = r; }); stalled = false; }
      return f.fetcher(url, options);
    });
    await client.init(); const a = client.saveSurvival({ seed: 1 }, meta); await started;
    const data = { seed: 2 }, b = client.saveSurvival(data, meta); data.seed = 0;
    expect(client.pending()?.data).toEqual({ seed: 2 }); release(); await a; await b;
    expect(f.state.revision).toBe(2); expect(f.state.survival.data).toEqual({ seed: 2 }); expect(client.pending()).toBeNull();
  });
  it('restart preserves newest queued snapshot if another write advanced the cloud', async () => {
    const f = fixture(), client = f.make(); await client.init(); f.state.online = false;
    await expect(client.saveSurvival({ seed: 1 }, meta)).rejects.toThrow(); await expect(client.saveSurvival({ seed: 2 }, meta)).rejects.toThrow();
    f.state.online = true; f.state.survival = { data: { seed: 1 }, ...meta }; f.state.revision = 1;
    const restarted = f.make(); await restarted.init(); expect(restarted.status).toBe('conflict'); expect(restarted.pending()?.data).toEqual({ seed: 2 });
  });
  it('never removes another tab journal on an older acknowledgement', async () => {
    const f = fixture(); let release!: () => void, entered!: () => void;
    const started = new Promise<void>(r => { entered = r; });
    const client = f.make(async (url, options) => {
      if (options?.method === 'PUT') { entered(); await new Promise<void>(r => { release = r; }); }
      return f.fetcher(url, options);
    });
    await client.init(); const a = client.saveSurvival({ seed: 1 }, meta); await started;
    const other = { accountId: 'alice', revision: 0, data: { seed: 99 }, meta, localAt: 123 };
    f.storage.setItem('deadzone-pending:alice', JSON.stringify(other)); release(); await a;
    expect(client.pending()).toEqual(other);
  });
  it('does not load another account save or journal after a cookie switch', async () => {
    const f = fixture(), client = f.make(); await client.init(); f.state.online = false;
    await expect(client.saveSurvival({ seed: 1 }, meta)).rejects.toThrow(); f.state.online = true; f.state.accountId = 'bob';
    await expect(client.load()).rejects.toMatchObject({ code: 'SESSION_CHANGED' }); expect(client.pending()?.accountId).toBe('alice');
    const bob = f.make(); await bob.init(); expect(bob.pending()).toBeNull(); expect(f.state.puts).toBe(0);
  });
  it('works offline, leaves local saves intact, and immediately journals debounced onSaved', async () => {
    const f = fixture(), client = f.make(); const state = newGame(5); saves.write(state);
    f.state.online = false; expect(await client.init()).toBeNull(); expect(client.status).toBe('offline'); expect(await client.pullSurvival()).toBe('local');
    f.state.online = true; await client.init(); vi.useFakeTimers(); client.onSaved(state);
    expect(client.pending()?.data).toEqual(JSON.parse(saves.serialize(state))); await client.flush(); expect(f.state.puts).toBe(1);
    state.stats.kills++; saves.write(state); client.onSaved(state); expect(f.state.puts).toBe(1);
    await vi.advanceTimersByTimeAsync(14999); expect(f.state.puts).toBe(1);
    await vi.advanceTimersByTimeAsync(1); expect(f.state.puts).toBe(2);
  });
  it('pulls newer cloud saves but leaves newer/undated local saves authoritative', async () => {
    const f = fixture(), client = f.make(), local = newGame(1), remote = newGame(2); saves.write(local);
    f.state.survival = { data: JSON.parse(saves.serialize(remote)), ...meta, savedAt: new Date(Date.now() + 10000).toISOString() };
    await client.init(); expect(await client.pullSurvival()).toBe('cloud'); expect(saves.read()?.seed).toBe(2);
    saves.writeRaw(saves.serialize(local), Date.now() + 20000); expect(await client.pullSurvival()).toBe('local'); expect(saves.read()?.seed).toBe(1);
  });
});
