# Deploying DEAD ZONE

DEAD ZONE uses Node.js 24+, MongoDB and a Vite client served on the same origin as its API. Node runs `server/index.ts` directly using built-in TypeScript stripping. No transpilation of the server or Express dependency is needed.

## Configuration

Copy `.env.example` to `.env` for local development, or provide environment variables through the production service. `process.loadEnvFile` loads the project-root `.env` at startup; existing environment variables take precedence. Never put database credentials in `VITE_*` variables. The server serves only `dist/`.

| Variable | Value / purpose |
| --- | --- |
| `MONGODB_URI` | Server-only Atlas connection string. Percent-encode special characters in credentials. |
| `MONGODB_DB` | `zombies` |
| `MONGODB_USERS_COLLECTION` | `users` |
| `PORT` | `8090` |
| `HOST` | Defaults to `0.0.0.0`; use `127.0.0.1` behind same-host nginx. |
| `NODE_ENV` | `production` on the deployment host. |
| `APP_ORIGIN` | Exact public HTTPS origin, for example `https://deadzone.example.com`, without a path. Required in production. |
| `TRUST_PROXY` | `0` by default. Set `1` only behind a trusted proxy that replaces `X-Forwarded-For` and blocks direct public access to Node. |

The Atlas **database user** needs `readWrite` on **`zombies`**, including permission to create indexes. Add the deployment host's outbound IP in Atlas Network Access. Keep Atlas TLS enabled. The application creates partial unique email/username indexes in `users`, and expiry TTL indexes in `sessions` and `authRateLimits`. It does not migrate, rewrite or remove pre-existing account documents. Review duplicate normalized keys or conflicting index definitions if initialization fails.

Production refuses to start without MongoDB or an HTTPS `APP_ORIGIN`. Mongo failures never fall back to a shared file store. Startup errors deliberately do not echo driver messages or the connection string.

## Build and start

```sh
npm ci
npm run build
npm start
```

Build needs development dependencies (TypeScript and Vite). After building, `npm prune --omit=dev` is optional. `npm run serve` builds then starts. `/healthz` pings MongoDB and returns 503 when unavailable; `/api/ping` confirms the HTTP server is running without touching account data.

For development, use `NODE_ENV=development`, `PORT=8090`, and omit `APP_ORIGIN` for loopback hosting:

```sh
npm run dev:server
# In a second terminal:
npm run dev
```

Vite proxies `/api` and `/healthz` to `http://localhost:8090`, preserving the browser's Host and Origin. If you set `APP_ORIGIN` in development, it must match the origin you open (normally `http://localhost:5173`). Running only Vite or serving the client statically keeps the game playable with local saves; cloud reports offline. Production cloud accounts require the Node backend.

## nginx and HTTPS

Choose a domain and replace **`deadzone.example.com`** in `deploy/nginx-deadzone.conf` and the commands below. Point DNS to the host and allow ports 80 and 443. For a same-host Node service set:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=8090
APP_ORIGIN=https://deadzone.example.com
TRUST_PROXY=1
```

Install nginx and Certbot with its nginx plugin using your distribution's packages. Install the HTTP bootstrap site:

```sh
sudo cp deploy/nginx-deadzone.conf /etc/nginx/sites-available/deadzone
sudo nano /etc/nginx/sites-available/deadzone
sudo ln -s /etc/nginx/sites-available/deadzone /etc/nginx/sites-enabled/deadzone
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx --redirect -d deadzone.example.com
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run
```

Create the symlink once and keep other sites enabled. Certbot adds TLS and the HTTP redirect; do not overwrite its updated configuration with the bootstrap file afterward. Sign-in becomes available over HTTPS after certificate installation. Check `https://deadzone.example.com/healthz` and open the game at that same origin.

The proxy replaces client-supplied forwarded IP headers. If a CDN is in front of nginx, configure trusted real-IP handling for that CDN before enabling proxy trust. The 4 MiB `client_max_body_size` matches the application's save request cap. The sample binds nginx upstream to `127.0.0.1:8090`.

## Docker

The multi-stage Dockerfile builds the client with dev dependencies and runs Node with only production dependencies. `.dockerignore` excludes `.env`, local output and dependencies, and the image copies only explicit source/runtime paths.

```sh
docker build -t deadzone .
docker run --rm --env-file /secure/path/deadzone.env -e HOST=0.0.0.0 -p 127.0.0.1:8090:8090 deadzone
```

Provide production secrets at runtime. For nginx on the host, the published loopback port works with the supplied proxy configuration. Use a service manager or container restart policy for a persistent deployment.

## Data and security

`zombies.users` holds credentials and the **complete** survival save in each account document: `email`, `emailKey`, `username`, `usernameKey`, `passwordHash`, `createdAt`, `lastLoginAt`, `survival`, `saveRevision`, `previousSurvival`, `arcadeBest`, and `settings`. Survival metadata includes server-generated `savedAt`, day, level and kills. CAS and the previous-save backup happen in a single Mongo pipeline update, including clears. Arcade records use `$max` only. Settings allow `volume` (0–1), `mute` and `perf`.

Passwords use gyrofall's scrypt parameters (`N=131072`, `r=8`, `p=1`, 64-byte key, 16-byte random salt, 192 MiB maximum memory), dummy-hash timing defence and constant-time comparison. At most two derivations run simultaneously per process. Registration accepts 3–24 ASCII letters/digits/underscores for usernames and 12–128 characters for passwords; login uses email and password.

`sessions` stores SHA-256 digests of random session tokens, per-session CSRF tokens, account IDs and dates. Cookies are HttpOnly, SameSite=Lax, and Secure with the `__Host-` prefix over HTTPS. Sessions last seven days; requests check expiry even before TTL cleanup. Mutations require the exact Origin; authenticated mutations also require `X-CSRF-Token`. Login and registration require Origin and create the first CSRF token. No session credential is stored in localStorage.

`authRateLimits` holds expiring fixed-window counters keyed by hashed IP/email. Registration allows 8 attempts/IP/hour; login and password-confirmed deletion share 40 attempts/IP/15 minutes and 12 attempts/email/15 minutes. The TTL includes a cleanup margin. JSON input rejects dangerous keys, excessive nesting, oversized values and nonfinite numbers. Auth/settings bodies are capped at 8 KiB; survival PUT bodies at 4 MiB. Request/header/idle timeouts are configured.

The CSP allows self-hosted Vite module scripts, inline styles used by the DOM UI, Google Fonts, and `blob:`/`data:` images/audio for Phaser. It grants no `unsafe-eval` or inline script permission; WebGL needs no special CSP directive. Vite's built HTML uses external module scripts and CSS. Hashed assets are immutable for one year; generated art with stable names is cached for one hour; HTML is revalidated. Text supports brotli/gzip negotiation. Unknown non-API GET paths use the SPA entry; hidden paths and escapes outside `dist/` are rejected.

Account deletion requires the current password, session, CSRF and Origin. It removes the user document (including both saves) first, then all sessions. Expiring rate counters remain until TTL cleanup; external Atlas backups follow the owner's retention policy. Email verification and password-reset delivery are not implemented.

## Verification

```sh
npx tsc --noEmit
npx vitest run
npm run build
npx tsx tools/measure-save.ts
```

All automated account/HTTP tests use an in-memory store; they never load `.env` or connect to MongoDB. Mongo adapter tests inspect calls using mocked collections. The measurement script uses the real simulation and no network: seed 12345, all 1,073 containers searched, 500 populated stashes and a permanent death bag produce a 362,092-byte save (fresh save: 789 bytes). The 4 MiB cap leaves over 11× headroom while keeping a current plus previous save below MongoDB's document size limit.

The only intended real-cluster verification during this implementation is server startup/index creation plus `/healthz` and `/api/ping`. No test users or saves should be written to the owner's cluster.
