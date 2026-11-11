import { MongoClient, ObjectId } from 'mongodb';
import type { Collection, Db } from 'mongodb';
export interface Settings { volume?: number; mute?: boolean; perf?: boolean }
export interface Survival { data: Record<string, unknown>; savedAt: Date | string; day: number; level: number; kills: number }
export interface AccountFields { email: string; emailKey: string; username: string; usernameKey: string; passwordHash: string }
export interface User extends AccountFields {
  _id: ObjectId; createdAt: Date; lastLoginAt: Date; survival: Survival | null;
  previousSurvival: Survival | null; saveRevision: number; arcadeBest: number; settings: Settings;
}
export interface Session { _id: string; userId: ObjectId; csrfToken: string; createdAt: Date; expiresAt: Date }
export interface Saved { accountId: string; revision: number; survival: Survival | null; arcadeBest: number; settings: Settings }
export interface Store {
  ping(): Promise<void>;
  createUser(fields: AccountFields): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findUser(id: ObjectId): Promise<User | null>;
  createSession(session: Session): Promise<unknown>;
  findSession(id: string): Promise<Session | null>;
  deleteSession(id: string): Promise<unknown>;
  markLogin(id: ObjectId): Promise<unknown>;
  deleteAccount(id: ObjectId): Promise<unknown>;
  load(id: ObjectId): Promise<Saved | null>;
  saveSurvival(id: ObjectId, revision: number, survival: Survival | null): Promise<number | null>;
  arcadeBest(id: ObjectId, score: number): Promise<unknown>;
  settings(id: ObjectId, settings: Settings): Promise<unknown>;
  consumeLimit(key: string, limit: number, durationMs: number, now?: number): Promise<boolean>;
}
export class AccountStore implements Store {
  db: Db; users: Collection<User>; sessions: Collection<Session>;
  limits: Collection<{ _id: string; count: number; expiresAt: Date }>;
  constructor(db: Db, collection = 'users') {
    this.db = db; this.users = db.collection(collection); this.sessions = db.collection('sessions'); this.limits = db.collection('authRateLimits');
  }
  async initialize() {
    await this.users.createIndex({ emailKey: 1 }, { name: 'account_email_unique', unique: true, partialFilterExpression: { emailKey: { $type: 'string' } } });
    await this.users.createIndex({ usernameKey: 1 }, { name: 'account_username_unique', unique: true, partialFilterExpression: { usernameKey: { $type: 'string' } } });
    await this.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await this.sessions.createIndex({ userId: 1 });
    await this.limits.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  }
  async ping() { await this.db.command({ ping: 1 }); }
  async createUser(fields: AccountFields) {
    const user: User = { ...fields, _id: new ObjectId(), createdAt: new Date(), lastLoginAt: new Date(), survival: null, previousSurvival: null, saveRevision: 0, arcadeBest: 0, settings: {} };
    await this.users.insertOne(user); return user;
  }
  findByEmail(emailKey: string) { return this.users.findOne({ emailKey }); }
  findUser(_id: ObjectId) { return this.users.findOne({ _id }); }
  createSession(session: Session) { return this.sessions.insertOne(session); }
  findSession(_id: string) { return this.sessions.findOne({ _id, expiresAt: { $gt: new Date() } }); }
  deleteSession(_id: string) { return this.sessions.deleteOne({ _id }); }
  markLogin(_id: ObjectId) { return this.users.updateOne({ _id }, { $set: { lastLoginAt: new Date() } }); }
  async deleteAccount(_id: ObjectId) {
    await this.users.deleteOne({ _id }); await this.sessions.deleteMany({ userId: _id });
  }
  async load(_id: ObjectId): Promise<Saved | null> {
    const u = await this.users.findOne({ _id }, { projection: { survival: 1, saveRevision: 1, arcadeBest: 1, settings: 1 } });
    return u ? { accountId: String(_id), revision: u.saveRevision, survival: u.survival, arcadeBest: u.arcadeBest, settings: u.settings } : null;
  }
  async saveSurvival(_id: ObjectId, revision: number, survival: Survival | null) {
    const u = await this.users.findOneAndUpdate({ _id, saveRevision: revision }, [{ $set: {
      previousSurvival: '$survival', survival: { $literal: survival }, saveRevision: { $add: ['$saveRevision', 1] },
    } }], { returnDocument: 'after', projection: { saveRevision: 1 } });
    return u ? u.saveRevision : null;
  }
  arcadeBest(_id: ObjectId, score: number) { return this.users.updateOne({ _id }, { $max: { arcadeBest: score } }); }
  settings(_id: ObjectId, settings: Settings) { return this.users.updateOne({ _id }, { $set: { settings } }); }
  async consumeLimit(key: string, limit: number, durationMs: number, now = Date.now()) {
    const window = Math.floor(now / durationMs), _id = `${key}:${window}`;
    let record;
    try {
      record = await this.limits.findOneAndUpdate({ _id }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 1) * durationMs + 60000) } }, { upsert: true, returnDocument: 'after' });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      record = await this.limits.findOneAndUpdate({ _id }, { $inc: { count: 1 } }, { returnDocument: 'after' });
    }
    return !!record && record.count <= limit;
  }
}
export async function connectAccounts(uri: string, database = 'zombies', collection = 'users') {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: 10, appName: 'DeadZone' });
  try { await client.connect(); const store = new AccountStore(client.db(database), collection); await store.initialize(); return { store, client }; }
  catch (error) { await client.close(); throw error; }
}
