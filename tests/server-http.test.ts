import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createServer, configuration, startupErrorMessage } from '../server/index.ts';
import { SAVE_LIMIT, negotiateEncoding } from '../server/http.ts';
import { digest } from '../server/auth.ts';
import { MemoryStore } from './helpers/account-store.ts';
import { newGame } from '../src/sim/game';
import { serialize } from '../src/sim/save';
describe('HTTP server (fake store only)', () => {
  let store: MemoryStore, server: Server, root: string, origin: string, cookie = '', csrf = '', accountId = '';
  const password = 'correct horse battery';
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'deadzone-http-')); await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'index.html'), '<!doctype html><title>DEAD ZONE</title><script src="./assets/index-ABC12345.js"></script>' + ' '.repeat(1200));
    await writeFile(path.join(root, 'assets', 'index-ABC12345.js'), 'console.log("game")');
    await writeFile(path.join(root, 'assets', 'art.png'), Buffer.from([137, 80, 78, 71]));
    await writeFile(path.join(root, 'assets', 'map.json'), '{}');
    await writeFile(path.join(root, 'assets', 'font.woff2'), 'font'); await writeFile(path.join(root, 'assets', 'game.wasm'), 'wasm');
    store = new MemoryStore(); server = createServer({ store, root, config: configuration({ MONGODB_URI: 'unused' }) });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; cookie = ''; csrf = ''; accountId = '';
  });
  afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); });
  async function request(url: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    return fetch(origin + url, { method, headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrf, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  }
  async function register() {
    const response = await request('/api/auth/register', 'POST', { username: 'Alice', email: 'Alice@Example.com', password });
    expect(response.status).toBe(201); const data = await response.json();
    cookie = response.headers.get('set-cookie')!.split(';')[0]; csrf = data.csrfToken; accountId = data.user.id; return response;
  }
  function body(revision = 0) {
    const state = newGame(12345); return { accountId, revision, data: JSON.parse(serialize(state)), meta: { day: state.clock.day, level: state.player.level, kills: state.stats.kills } };
  }
  it('registers, logs in by email, rotates sessions, checks CSRF/origin, logs out and deletes all account data', async () => {
    expect((await request('/api/auth/session')).status).toBe(401);
    const response = await register(); expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Lax');
    expect(store.sessions.has(digest(cookie.split('=')[1]))).toBe(true);
    const session = await (await request('/api/auth/session')).json(); expect(session.user.username).toBe('Alice'); expect(session.csrfToken).toBe(csrf); expect(session.user.passwordHash).toBeUndefined();
    expect((await request('/api/settings', 'PUT', { volume: 0.5 }, { 'X-CSRF-Token': '' })).status).toBe(403);
    expect((await request('/api/settings', 'PUT', { volume: 0.5 }, { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await request('/api/auth/login', 'POST', { email: 'alice@example.com', password }, { Origin: 'null' })).status).toBe(403);
    const oldCookie = cookie, login = await request('/api/auth/login', 'POST', { email: 'ALICE@example.com', password });
    expect(login.status).toBe(200); cookie = login.headers.get('set-cookie')!.split(';')[0]; csrf = (await login.json()).csrfToken;
    expect((await request('/api/auth/session', 'GET', undefined, { Cookie: oldCookie })).status).toBe(401);
    expect((await request('/api/save/survival', 'PUT', body())).status).toBe(200);
    expect((await request('/api/auth/delete-account', 'POST', { password: 'wrong' })).status).toBe(403);
    expect((await request('/api/auth/delete-account', 'POST', { password })).status).toBe(200);
    expect(store.users.size).toBe(0); expect(store.sessions.size).toBe(0); expect((await request('/api/auth/session')).status).toBe(401);
    await register(); expect((await request('/api/auth/logout', 'POST', {})).status).toBe(200); expect((await request('/api/auth/session')).status).toBe(401);
  }, 15000);
  it('compares save revisions, backs up clears, and applies $max and settings', async () => {
    await register(); const first = body();
    expect(await (await request('/api/save/survival', 'PUT', first)).json()).toEqual({ revision: 1 });
    const conflict = await request('/api/save/survival', 'PUT', first); expect(conflict.status).toBe(409); expect(await conflict.json()).toMatchObject({ code: 'SAVE_CONFLICT', revision: 1 });
    expect((await request('/api/save/survival', 'PUT', { ...first, accountId: 'another' })).status).toBe(403);
    const loaded = await (await request('/api/save')).json(); expect(loaded.survival.data).toEqual(first.data); expect(loaded.accountId).toBe(accountId);
    expect((await request('/api/save/survival', 'DELETE', { accountId, revision: 0 })).status).toBe(409);
    expect(await (await request('/api/save/survival', 'DELETE', { accountId, revision: 1 })).json()).toEqual({ revision: 2 });
    expect([...store.users.values()][0].previousSurvival?.data).toEqual(first.data);
    await request('/api/arcade-best', 'PUT', { score: 100 }); await request('/api/arcade-best', 'PUT', { score: 5 });
    expect((await request('/api/settings', 'PUT', { volume: 0.5, mute: true, perf: false })).status).toBe(200);
    expect(await (await request('/api/save')).json()).toMatchObject({ survival: null, arcadeBest: 100, settings: { volume: 0.5, mute: true, perf: false } });
  });
  it('rejects oversized, malformed and malicious bodies before saving', async () => {
    await register();
    expect((await request('/api/save/survival', 'PUT', '{"padding":"' + 'x'.repeat(SAVE_LIMIT) + '"}')).status).toBe(413);
    for (const raw of ['{"$set":1}', '{"a.b":1}', '{"__proto__":{}}', '{"x":1e400}', '{']) expect((await request('/api/save/survival', 'PUT', raw)).status).toBe(400);
    expect((await request('/api/save/survival', 'PUT', { accountId, revision: 0, data: {}, meta: {} })).status).toBe(400);
    const invalid = body(); delete invalid.data.clock; expect((await request('/api/save/survival', 'PUT', invalid)).status).toBe(400);
    expect((await request('/api/settings', 'PUT', { volume: 2 })).status).toBe(400);
    expect((await request('/api/settings', 'PUT', {}, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await (await request('/api/save')).json()).revision).toBe(0);
  });
  it('uses persistent rate limiting without exposing raw IP or email', async () => {
    await store.consumeLimit(`login:email:${digest('a@b.com')}`, 0, 900000);
    // Fill the account window without doing twelve expensive scrypt operations.
    for (let i = 0; i < 11; i++) await store.consumeLimit(`login:email:${digest('a@b.com')}`, 12, 900000);
    const response = await request('/api/auth/login', 'POST', { email: 'a@b.com', password });
    expect(response.status).toBe(429); expect([...store.limits.keys()].every(k => !k.includes('a@b.com') && !k.includes('127.0.0.1'))).toBe(true);
  });
  it('serves built files with MIME/cache/CSP, negotiates compression and falls back only outside API', async () => {
    const page = await request('/a/nested/route'); expect(page.status).toBe(200); const html = await page.text(); expect(html).toContain('DEAD ZONE'); expect(html).toContain('src="/assets/index-ABC12345.js"');
    expect(page.headers.get('cache-control')).toBe('no-cache'); expect(page.headers.get('content-security-policy')).toContain("script-src 'self'"); expect(page.headers.get('content-security-policy')).toContain("img-src 'self' blob: data:");
    expect((await request('/assets/index-ABC12345.js')).headers.get('cache-control')).toContain('immutable');
    // Art filenames are overwritten by the generator; cached metadata must not
    // silently select old character frames after an updated client loads.
    for (const file of ['art.png', 'map.json', 'art.png?v=new-art', 'map.json?v=new-art']) {
      expect((await request('/assets/' + file)).headers.get('cache-control')).toBe('no-cache');
    }
    for (const [file, type] of [['art.png', 'image/png'], ['map.json', 'application/json'], ['font.woff2', 'font/woff2'], ['game.wasm', 'application/wasm']]) expect((await request('/assets/' + file)).headers.get('content-type')).toBe(type);
    expect((await request('/api/missing')).status).toBe(404); expect((await request('/.env')).status).toBe(404);
    expect((await request('/%2eenv')).status).toBe(404);
    const compressed = await request('/', 'GET', undefined, { 'Accept-Encoding': 'br;q=0, gzip' }); expect(compressed.headers.get('content-encoding')).toBe('gzip');
    expect(negotiateEncoding('br;q=0, gzip;q=0')).toBeNull(); expect(negotiateEncoding('gzip, br')).toBe('br');
    expect((await request('/healthz')).status).toBe(200); store.available = false; expect((await request('/healthz')).status).toBe(503);
    expect((await request('/api/ping')).status).toBe(200);
  });
  it('requires Mongo and HTTPS production configuration', () => {
    expect(() => configuration({ NODE_ENV: 'production' })).toThrow();
    expect(() => configuration({ NODE_ENV: 'production', MONGODB_URI: 'unused', APP_ORIGIN: 'http://example.com' })).toThrow();
    expect(configuration({ NODE_ENV: 'production', MONGODB_URI: 'unused', APP_ORIGIN: 'https://example.com' }).secure).toBe(true);
    expect(startupErrorMessage({ name: 'MongoServerSelectionError', message: 'sensitive URI' })).not.toContain('sensitive');
    expect(startupErrorMessage({ code: 13 })).toContain('readWrite');
  });
  it('uses a host-only Secure cookie in production and requires the configured HTTPS origin', async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    server = createServer({ store, root, config: configuration({ NODE_ENV: 'production', MONGODB_URI: 'unused', APP_ORIGIN: 'https://deadzone.example.com' }) });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const body = { username: 'Alice', email: 'a@example.com', password };
    expect((await request('/api/auth/register', 'POST', body)).status).toBe(403);
    const response = await request('/api/auth/register', 'POST', body, { Origin: 'https://deadzone.example.com' });
    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toMatch(/^__Host-deadzone_session=.*; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure$/);
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000');
  });
});
