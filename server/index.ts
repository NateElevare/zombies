import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { HttpError, invalid, registration, emailKey, passwordInput, hashPassword, verifyPassword, token, digest, sameSecret, publicUser } from './auth.ts';
import { connectAccounts } from './store.ts';
import type { Store, User, Survival, Settings } from './store.ts';
import { json, readJSON, SAVE_LIMIT, staticFile } from './http.ts';
import { record, validCloudSave } from '../src/sim/save-validation.ts';
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export class ConfigurationError extends Error {}
export function configuration(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  if (!env.MONGODB_URI) throw new ConfigurationError('MONGODB_URI is required. No shared file backend is available.');
  let origin = '';
  if (env.APP_ORIGIN) {
    let url: URL;
    try { url = new URL(env.APP_ORIGIN); } catch { throw new ConfigurationError('APP_ORIGIN must be an HTTP(S) origin.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new ConfigurationError('APP_ORIGIN must be an HTTP(S) origin without a path.');
    origin = url.origin;
  }
  if (production && !origin.startsWith('https://')) throw new ConfigurationError('Production requires an HTTPS APP_ORIGIN.');
  const port = Number(env.PORT || 8090);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigurationError('PORT must be 1–65535.');
  return { production, origin, port, host: env.HOST || '0.0.0.0', secure: production || origin.startsWith('https://'), trustProxy: env.TRUST_PROXY === '1' };
}
export type Config = ReturnType<typeof configuration>;
export function startupErrorMessage(error: unknown): string {
  if (error instanceof ConfigurationError) return error.message;
  const { name, code } = error as { name?: string; code?: unknown };
  if (code === 18) return 'MongoDB authentication failed. Check the database credentials and authSource.';
  if (code === 13) return 'MongoDB permission denied. The database user needs readWrite on zombies, including index creation.';
  if (code === 11000) return 'MongoDB unique index creation failed. Review duplicate email/username keys; no records were removed.';
  if (code === 85 || code === 86) return 'MongoDB index definitions conflict. Review existing indexes; no records were removed.';
  if (['ENOTFOUND', 'ENODATA', 'ESERVFAIL', 'ECONNREFUSED'].includes(String(code))) return 'MongoDB DNS/network connection failed. Check the cluster hostname and network access.';
  if (name === 'MongoParseError') return 'Invalid MongoDB connection string. Check encoding and connection options.';
  if (['MongoServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError'].includes(name || '')) return 'Cannot reach MongoDB. Check Atlas Network Access, DNS and firewall settings.';
  return 'Server startup failed. Check MongoDB access, database permissions and server configuration.';
}
export function createServer({ store, config, root = path.join(projectRoot, 'dist') }: { store: Store; config: Config; root?: string }) {
  const sessionAge = 7 * 24 * 60 * 60;
  const cookieName = config.secure ? '__Host-deadzone_session' : 'deadzone_session';
  let hashing = 0;
  const setCookie = (res: ServerResponse, value: string, age = sessionAge) => res.setHeader('Set-Cookie', `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${config.secure ? '; Secure' : ''}`);
  function cookie(req: IncomingMessage) {
    const value = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
    return /^[a-zA-Z0-9_-]{43}$/.test(value) ? value : null;
  }
  function requireOrigin(req: IncomingMessage) {
    let expected = config.origin;
    if (!expected) {
      const host = req.headers.host || '';
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) throw new HttpError(403, 'Configure APP_ORIGIN.');
      expected = 'http://' + host;
    }
    if (req.headers.origin !== expected || req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Request origin is not allowed.', 'ORIGIN_REJECTED');
  }
  async function identity(req: IncomingMessage) {
    const value = cookie(req), session = value ? await store.findSession(digest(value)) : null;
    const user = session ? await store.findUser(session.userId) : null;
    if (!session || !user) throw new HttpError(401, 'Sign in again. Local progress is safe.', 'AUTH_REQUIRED');
    return { session, user };
  }
  async function startSession(req: IncomingMessage, res: ServerResponse, user: User) {
    const previous = cookie(req); if (previous) await store.deleteSession(digest(previous));
    const value = token(), csrfToken = token();
    await store.createSession({ _id: digest(value), userId: user._id, csrfToken, createdAt: new Date(), expiresAt: new Date(Date.now() + sessionAge * 1000) });
    await store.markLogin(user._id); setCookie(res, value);
    return { user: publicUser(user), csrfToken };
  }
  async function authLimit(req: IncomingMessage, kind: 'login' | 'register', email: string) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').at(-1)?.trim();
    const ip = config.trustProxy && forwarded ? forwarded : req.socket.remoteAddress || '';
    const allowed = await store.consumeLimit(`${kind}:ip:${digest(ip)}`, kind === 'register' ? 8 : 40, kind === 'register' ? 3600000 : 900000);
    const accountAllowed = kind === 'login' ? await store.consumeLimit(`login:email:${digest(email)}`, 12, 900000) : true;
    if (!allowed || !accountAllowed) throw new HttpError(429, 'Too many attempts. Try again later.', 'RATE_LIMITED');
  }
  async function passwordWork<T>(fn: () => Promise<T>) {
    if (hashing >= 2) throw new HttpError(503, 'Sign-in is busy. Try again shortly.');
    hashing++; try { return await fn(); } finally { hashing--; }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob: data:; media-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
    if (config.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const pathname = new URL(req.url || '/', 'http://localhost').pathname, method = req.method;
      if (pathname === '/api/ping' && method === 'GET') return json(res, 200, { ok: true, backend: 'mongo' });
      if (pathname === '/healthz' && method === 'GET') { await store.ping(); return json(res, 200, { ok: true }); }
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method || '');
        if (mutation) requireOrigin(req);
        if (method === 'POST' && ['/api/auth/register', '/api/auth/login'].includes(pathname)) {
          const body = await readJSON(req);
          if (pathname.endsWith('/register')) {
            const fields = registration(body); await authLimit(req, 'register', fields.emailKey);
            const passwordHash = await passwordWork(() => hashPassword(body.password));
            let user: User;
            try { user = await store.createUser({ ...fields, passwordHash }); }
            catch (error) { if ((error as { code?: number }).code === 11000) throw new HttpError(409, 'Email or username already registered.', 'ACCOUNT_EXISTS'); throw error; }
            return json(res, 201, await startSession(req, res, user));
          }
          const email = emailKey(body.email); passwordInput(body.password); await authLimit(req, 'login', email);
          const user = await store.findByEmail(email);
          const valid = await passwordWork(() => verifyPassword(body.password, user?.passwordHash));
          if (!valid || !user) throw new HttpError(401, 'Email or password is incorrect.', 'INVALID_LOGIN');
          return json(res, 200, await startSession(req, res, user));
        }
        const routes: Record<string, string[]> = {
          '/api/auth/session': ['GET'], '/api/auth/logout': ['POST'], '/api/auth/delete-account': ['POST'],
          '/api/save': ['GET'], '/api/save/survival': ['PUT', 'DELETE'], '/api/arcade-best': ['PUT'], '/api/settings': ['PUT'],
        };
        if (!Object.hasOwn(routes, pathname)) throw new HttpError(404, 'Not found.');
        if (!routes[pathname].includes(method || '')) throw new HttpError(405, 'Method not allowed.');
        const { user, session } = await identity(req);
        if (mutation && !sameSecret(req.headers['x-csrf-token'], session.csrfToken)) throw new HttpError(403, 'Session changed. Sign in again.', 'SESSION_CHANGED');
        if (pathname === '/api/auth/session') return json(res, 200, { user: publicUser(user), csrfToken: session.csrfToken });
        if (pathname === '/api/auth/logout') { await store.deleteSession(session._id); setCookie(res, '', 0); return json(res, 200, { ok: true }); }
        if (pathname === '/api/save') {
          const saved = await store.load(user._id);
          if (!saved) throw new HttpError(401, 'Account no longer exists.', 'AUTH_REQUIRED');
          return json(res, 200, saved);
        }
        const body = await readJSON(req, pathname === '/api/save/survival' && method === 'PUT' ? SAVE_LIMIT : 8192);
        if (pathname === '/api/auth/delete-account') {
          passwordInput(body.password); await authLimit(req, 'login', user.emailKey);
          if (!await passwordWork(() => verifyPassword(body.password, user.passwordHash))) throw new HttpError(403, 'Password is incorrect.', 'INVALID_PASSWORD');
          await store.deleteAccount(user._id); setCookie(res, '', 0); return json(res, 200, { ok: true });
        }
        // Bind every save/settings mutation to its intended account, including cross-tab cookie changes.
        if ((pathname === '/api/save/survival' || body.accountId !== undefined) && body.accountId !== String(user._id)) throw new HttpError(403, 'This write belongs to another account.', 'SESSION_CHANGED');
        if (pathname === '/api/save/survival') {
          if (!Number.isSafeInteger(body.revision) || body.revision < 0) invalid('Invalid revision.');
          let survival: Survival | null = null;
          if (method === 'PUT') {
            if (!validCloudSave(body.data) || !record(body.meta) || !['day', 'level', 'kills'].every(k => Number.isSafeInteger(body.meta[k]) && body.meta[k] >= 0)) invalid('Invalid survival save.');
            if (body.meta.day !== body.data.clock.day || body.meta.level !== body.data.player.level || body.meta.kills !== body.data.stats.kills) invalid('Save metadata does not match the save.');
            survival = { data: body.data, savedAt: new Date(), day: body.meta.day, level: body.meta.level, kills: body.meta.kills };
          }
          const revision = await store.saveSurvival(user._id, body.revision, survival);
          if (revision === null) {
            const saved = await store.load(user._id);
            if (!saved) throw new HttpError(401, 'Account no longer exists.', 'AUTH_REQUIRED');
            throw new HttpError(409, 'Another tab or device saved newer progress.', 'SAVE_CONFLICT', saved.revision);
          }
          return json(res, 200, { revision });
        }
        if (pathname === '/api/arcade-best') {
          if (!Number.isSafeInteger(body.score) || body.score < 0 || body.score > 1e12) invalid('Invalid score.');
          await store.arcadeBest(user._id, body.score); return json(res, 200, { ok: true });
        }
        const settings = body.settings ?? body;
        if (!record(settings) || Object.keys(settings).some(k => !['volume', 'mute', 'perf'].includes(k)) ||
          (settings.volume !== undefined && (typeof settings.volume !== 'number' || settings.volume < 0 || settings.volume > 1)) ||
          ['mute', 'perf'].some(k => settings[k] !== undefined && typeof settings[k] !== 'boolean')) invalid('Invalid settings.');
        await store.settings(user._id, settings as Settings); return json(res, 200, { ok: true });
      }
      return await staticFile(req, res, root, pathname);
    } catch (error) {
      const known = error instanceof HttpError;
      // Never log driver errors, request bodies, credentials or connection strings.
      if (!res.headersSent) json(res, known ? error.status : 503, { error: known ? error.message : 'Server unavailable. Local progress is safe.', code: known ? error.code : 'SERVER_UNAVAILABLE', ...(known && error.revision !== undefined ? { revision: error.revision } : {}) });
      else res.end();
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  server.setTimeout(20000, socket => socket.destroy());
  return server;
}
export async function main() {
  const envFile = path.join(projectRoot, '.env'); if (existsSync(envFile)) process.loadEnvFile(envFile);
  const config = configuration();
  const { store, client } = await connectAccounts(process.env.MONGODB_URI!, process.env.MONGODB_DB || 'zombies', process.env.MONGODB_USERS_COLLECTION || 'users');
  const server = createServer({ store, config });
  server.on('error', () => { console.error('Server could not listen on the configured address.'); void client.close(); process.exitCode = 1; });
  server.listen(config.port, config.host, () => console.log(`DEAD ZONE listening on port ${config.port} (MongoDB accounts)`));
  const stop = () => { server.close(() => { void client.close().then(() => process.exit(0)); }); setTimeout(() => process.exit(1), 10000).unref(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(startupErrorMessage(error)); process.exitCode = 1; });
}
