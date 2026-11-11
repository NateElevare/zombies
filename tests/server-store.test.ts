import { describe, it, expect, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import type { Db } from 'mongodb';
import { AccountStore } from '../server/store.ts';
import { MemoryStore } from './helpers/account-store.ts';
const fields = { email: 'a@b.com', emailKey: 'a@b.com', username: 'alice', usernameKey: 'alice', passwordHash: 'hash' };
describe('account store contract', () => {
  it('keeps accounts isolated, CAS atomic, one backup, monotonic arcade score and revokes all sessions', async () => {
    const store = new MemoryStore(), a = await store.createUser(fields), b = await store.createUser({ ...fields, emailKey: 'b@b.com', usernameKey: 'bob' });
    const survival = { data: { seed: 1 }, savedAt: new Date(), day: 1, level: 1, kills: 0 };
    expect(await Promise.all([store.saveSurvival(a._id, 0, survival), store.saveSurvival(a._id, 0, null)])).toEqual([1, null]);
    expect((await store.load(b._id))?.survival).toBeNull();
    expect(await store.saveSurvival(a._id, 1, null)).toBe(2); expect(a.previousSurvival).toEqual(survival);
    await store.arcadeBest(a._id, 50); await store.arcadeBest(a._id, 3); expect(a.arcadeBest).toBe(50);
    for (const id of ['one', 'two']) await store.createSession({ _id: id, userId: a._id, csrfToken: '', createdAt: new Date(), expiresAt: new Date(Date.now() + 10000) });
    await store.deleteAccount(a._id); expect(store.sessions.size).toBe(0); expect(await store.load(a._id)).toBeNull(); expect(await store.findUser(b._id)).not.toBeNull();
  });
  it('builds the actual Mongo pipeline and TTL/unique indexes without connecting to Mongo', async () => {
    const users = { createIndex: vi.fn(), findOneAndUpdate: vi.fn().mockResolvedValue({ saveRevision: 8 }), updateOne: vi.fn() };
    const sessions = { createIndex: vi.fn() }, limits = { createIndex: vi.fn() };
    const db = { collection: (name: string) => ({ users, sessions, authRateLimits: limits })[name as 'users'] } as unknown as Db;
    const store = new AccountStore(db); await store.initialize();
    expect(users.createIndex).toHaveBeenCalledWith({ emailKey: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { emailKey: { $type: 'string' } } }));
    expect(sessions.createIndex).toHaveBeenCalledWith({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    expect(limits.createIndex).toHaveBeenCalledWith({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const id = new ObjectId(); expect(await store.saveSurvival(id, 7, null)).toBe(8);
    expect(users.findOneAndUpdate).toHaveBeenCalledWith({ _id: id, saveRevision: 7 }, [{ $set: { previousSurvival: '$survival', survival: { $literal: null }, saveRevision: { $add: ['$saveRevision', 1] } } }], expect.objectContaining({ returnDocument: 'after' }));
    await store.arcadeBest(id, 50); expect(users.updateOne).toHaveBeenCalledWith({ _id: id }, { $max: { arcadeBest: 50 } });
  });
  it('rate windows reset and expired sessions cannot authenticate before TTL cleanup', async () => {
    const s = new MemoryStore(); expect(await s.consumeLimit('x', 1, 1000, 1)).toBe(true); expect(await s.consumeLimit('x', 1, 1000, 2)).toBe(false); expect(await s.consumeLimit('x', 1, 1000, 1001)).toBe(true);
    await s.createSession({ _id: 'expired', userId: new ObjectId(), csrfToken: '', createdAt: new Date(0), expiresAt: new Date(1) }); expect(await s.findSession('expired')).toBeNull();
  });
});
