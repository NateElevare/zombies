import { ObjectId } from 'mongodb';
import type { Store, AccountFields, User, Session, Survival, Settings } from '../../server/store.ts';
/** Isolated implementation of the production contract. Never opens a DB connection. */
export class MemoryStore implements Store {
  users = new Map<string, User>(); sessions = new Map<string, Session>(); limits = new Map<string, number>();
  available = true;
  async ping() { if (!this.available) throw Error('Unavailable'); }
  async createUser(fields: AccountFields) {
    if ([...this.users.values()].some(u => u.emailKey === fields.emailKey || u.usernameKey === fields.usernameKey)) throw Object.assign(Error('Duplicate'), { code: 11000 });
    const user: User = { ...fields, _id: new ObjectId(), createdAt: new Date(), lastLoginAt: new Date(), survival: null, previousSurvival: null, saveRevision: 0, arcadeBest: 0, settings: {} };
    this.users.set(String(user._id), user); return user;
  }
  async findByEmail(email: string) { return [...this.users.values()].find(u => u.emailKey === email) ?? null; }
  async findUser(id: ObjectId) { return this.users.get(String(id)) ?? null; }
  async createSession(s: Session) { this.sessions.set(s._id, s); }
  async findSession(id: string) { const s = this.sessions.get(id); return s && s.expiresAt > new Date() ? s : null; }
  async deleteSession(id: string) { this.sessions.delete(id); }
  async markLogin(id: ObjectId) { const u = this.users.get(String(id)); if (u) u.lastLoginAt = new Date(); }
  async deleteAccount(id: ObjectId) {
    this.users.delete(String(id)); for (const [key, s] of this.sessions) if (s.userId.equals(id)) this.sessions.delete(key);
  }
  async load(id: ObjectId) {
    const u = this.users.get(String(id));
    return u ? structuredClone({ accountId: String(id), revision: u.saveRevision, survival: u.survival, arcadeBest: u.arcadeBest, settings: u.settings }) : null;
  }
  async saveSurvival(id: ObjectId, revision: number, survival: Survival | null) {
    const u = this.users.get(String(id)); if (!u || u.saveRevision !== revision) return null;
    u.previousSurvival = structuredClone(u.survival); u.survival = structuredClone(survival); return ++u.saveRevision;
  }
  async arcadeBest(id: ObjectId, score: number) { const u = this.users.get(String(id)); if (u) u.arcadeBest = Math.max(u.arcadeBest, score); }
  async settings(id: ObjectId, settings: Settings) { const u = this.users.get(String(id)); if (u) u.settings = structuredClone(settings); }
  async consumeLimit(key: string, limit: number, durationMs: number, now = Date.now()) {
    const id = `${key}:${Math.floor(now / durationMs)}`, count = (this.limits.get(id) ?? 0) + 1;
    this.limits.set(id, count); return count <= limit;
  }
}
