# SERVER handoff: accounts and cloud saves

Implementation: `server/index.ts` (Node 24 native TS), `server/auth.ts`, `server/store.ts`, `server/http.ts`, and `src/net/cloud.ts`. No changes to `src/ui` or `src/render`. All tests use fakes, never the owner's DB. Tower was read only; its `.env` was never read. Tower's requested `.env.example` did not exist at the supplied path.

## UI API

```ts
import { cloud } from '../net/cloud'; // adjust relative path to caller
```

`cloud` is a singleton `CloudSaveClient`. `GameScene.create()` calls `cloud.init()` on boot. Public types (`CloudUser`, `CloudStatus`, `SaveMeta`, `CloudSettings`, `CloudSnapshot`, `CloudError`) are exported from the same module.

| Member | Contract |
| --- | --- |
| `init(): Promise<{user: CloudUser} \| null>` | Restore cookie session and reconcile this account's pending journal. Returns null when signed out/offline. Restored sessions may still report a conflict or network error. |
| `user: CloudUser \| null` | `{ id, username, email }`. Credentials/CSRF are never exposed in storage. |
| `status: CloudStatus` | `offline`, `signed-out`, `syncing`, `synced`, `error`, or `conflict`. |
| `error: CloudError \| null` | Latest error, with `message`, `code`, and optional conflict `revision`. |
| `register(username,email,password)` | Promise of `{user}`. Registers and starts a session, then reconciles cloud. Rejects account/auth errors. |
| `login(email,password)` | Same result, email-based login. |
| `logout(): Promise<void>` | Best-effort flush, then revoke cookie session. Rejects if logout could not reach the server. Retains pending recovery journal and local survival. |
| `deleteAccount(password): Promise<void>` | Password-confirmed permanent account deletion. Removes this account's journal after success; local game save remains. Rejects errors. |
| `load(): Promise<CloudSnapshot>` | Fetch `{accountId, revision, survival, arcadeBest, settings}` and recover a pending write if its original revision is current. Rejects unresolved conflicts. Does not automatically install cloud data into the running game. |
| `saveSurvival(data,meta): Promise<void>` | `data = JSON.parse(serialize(state))`; `meta = {day,level,kills}`. Journals immediately, then serializes upload. Rejects offline/conflict errors without deleting local progress. |
| `onSaved(state): void` | Shell hook; synchronously journals survival state, schedules uploads no more frequently than about every 15 seconds. |
| `flush(): Promise<void>` | Force best-effort upload now and await earlier writes. Errors go to `status/error`; it does not reject. Called on quit and best-effort on beforeunload. Large unload uploads can be cancelled by browsers, so the journal is the durability guarantee. |
| `pullSurvival(): Promise<'local' \| 'cloud' \| 'none'>` | Reconcile pending writes; install newer cloud data through `save.writeRaw()` before Continue. Pending local writes remain authoritative until uploaded or explicitly discarded. On failure keep local progress and expose status. |
| `clearSurvival(): Promise<void>` | CAS-clear cloud survival, backing up the prior cloud save. Journals a tombstone first; rejects errors. The shell calls it on New Game, and the new simulation takes over local saving. |
| `submitArcadeBest(score): Promise<void>` | Monotonic `$max` update while signed in; failures report status and leave the local best intact. |
| `saveSettings({volume?,mute?,perf?}): Promise<void>` | Replace the small settings object; rejects errors. Volume is 0–1. |
| `resolveConflict('local' \| 'cloud'): Promise<void>` | **Explicit UI choice.** Local fetches the latest revision and CAS-uploads the pending copy; cloud installs the fetched cloud copy (or clears local if cloud is empty). New competing writes can conflict again. |
| `pending()` | Read-only view of this account's recovery journal for UI recovery/export. Contains accountId, original revision, data, meta, localAt. Do not mutate. |
| `on(listener): () => void` | Listener receives the client after status changes. Returns unsubscribe. Read `cloud.status`, `cloud.user`, `cloud.error` to render. |

For the account panel, `await cloud.login(...)`/`register(...)` in a try/catch and show the thrown message. On `conflict`, offer **Keep local** and **Take cloud** buttons calling `resolveConflict('local')` or `resolveConflict('cloud')`. Taking cloud changes the stored Continue snapshot; do this at the title screen, or leave the active run before resolving, so a subsequent active-run autosave does not replace that choice. Do not auto-resolve a conflict.

**UI agent action:** `ShellApi.continueSurvival()` now returns `Promise<boolean>`. The existing `src/ui/title.ts` click handler still tests its result synchronously; change it to an async handler and `if (!await shell.continueSurvival()) ...`. The shell itself awaits cloud pull and then calls `game.continueGame()`. Also offer Continue for a cloud-only save after `load()`; `shell.hasSave()` reflects local storage until pull installs cloud. No UI edits were made by SERVER.

The shell journals successful `{t:'saved',ok:true}` events, saves/journals/flushed progress on quit, clears cloud on New Game and submits `state.arcade.best` on `playerDied`. Without any server, local play and Continue still work. Auto-retry on browser `online` uses the original journal revision. Auth requests have a 15-second abort timeout.

## Persistence and compatibility

The journal key is **`deadzone-pending:<accountId>`**. Writes are serialized; queued snapshots are copied and journaled before waiting for an earlier request. An older acknowledgement cannot remove another tab's journal. Only this client's newer queued snapshot can be rebased after its acknowledged predecessor. On restart, matching cloud data recognizes a lost acknowledgement; otherwise upload retries only if the journal's original revision still matches. Conflicts leave both copies intact.

The local survival key remains `deadzone_survival_v2`. `save.ts` adds `deadzone_survival_saved_at`, `savedAt()` and `writeRaw(raw,savedAt)`. Old local saves without a timestamp stay local until the player saves again or explicitly chooses cloud. Authenticated browser clocks are not trusted for server `savedAt`, which always comes from the server; cross-device newer-than comparison uses those dates against the local device timestamp.

Permanent death bags previously encoded Infinity as `{"$number":"Infinity"}`. New serializations use `{"numberValue":"Infinity"}` to satisfy the required rejection of `$`-prefixed keys. Local deserialization accepts both markers, preserving old saves; newly uploaded data is the exact parsed `serialize(state)` output. The shared pure `src/sim/save-validation.ts` is imported directly by Node without the rest of the simulation's extensionless module graph.

## HTTP API

All responses are JSON except static files. Errors have `{error,code}`; CAS conflicts also include the current `{revision}`. Authenticated mutations require the cookie, exact `Origin` and `X-CSRF-Token` returned by register/login/session. Login and registration bootstrap the CSRF token and require Origin only.

| Route | Request / response |
| --- | --- |
| `GET /api/ping` | `{ok:true,backend:'mongo'}` |
| `GET /healthz` | Mongo ping; `{ok:true}` or 503 |
| `POST /api/auth/register` | `{username,email,password}` → 201 `{user,csrfToken}` |
| `POST /api/auth/login` | `{email,password}` → `{user,csrfToken}` |
| `GET /api/auth/session` | `{user,csrfToken}` or 401 `AUTH_REQUIRED` |
| `POST /api/auth/logout` | `{}` → `{ok:true}` |
| `POST /api/auth/delete-account` | `{password}` → `{ok:true}` |
| `GET /api/save` | `{accountId,revision,survival,arcadeBest,settings}` |
| `PUT /api/save/survival` | `{accountId,revision,data,meta:{day,level,kills}}` → `{revision}` or 409 `SAVE_CONFLICT` |
| `DELETE /api/save/survival` | **JSON `{accountId,revision}` required**, same CAS/backup semantics as PUT. → `{revision}` |
| `PUT /api/arcade-best` | `{score,accountId?}` → `{ok:true}`; score is an integer 0–1e12, updated only with `$max`. |
| `PUT /api/settings` | `{volume?,mute?,perf?}` or `{accountId?,settings:{volume?,mute?,perf?}}` → `{ok:true}` |

`survival` is null or `{data,savedAt,day,level,kills}`. `data` has version, seed, rngState, clock, stats, player, containers, drops, structures, base. Metadata must match the save. Writes cannot select arbitrary users or update account fields. An optional accountId on score/settings is checked against the authenticated account; the browser client always supplies it.

See `DEPLOYMENT.md`, `Dockerfile` and `deploy/nginx-deadzone.conf` for hosting. Tests are `tests/server-*.test.ts`, `tests/cloud.test.ts` and `tests/helpers/account-store.ts`. `tools/measure-save.ts` reproduces the 362,092-byte populated-save measurement without Mongo access.

## Verification blockers during SERVER work

The production build encountered a Windows-1252 degree symbol in a comment in `src/render/worldobjs.ts`; Vite requires UTF-8. This file is outside SERVER's allowed edit scope. An encoding-only repair was requested from the owner; it has not been performed by SERVER.

The single permitted `node server/index.ts` attempt exited with a sanitized startup failure. Port 8090 was already owned by a different Node process (PID 536, started before that attempt); that listener returned 200 for `/healthz` and `/api/ping`, but those responses cannot verify SERVER's own launch. The existing process was left running. No test account/save records were written to MongoDB. Startup now has more useful sanitized failure categories for the owner's next run, without logging connection strings or driver messages.
