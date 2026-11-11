import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, DUMMY_HASH, registration, inspectJSON, token, digest, sameSecret } from '../server/auth.ts';
describe('server auth', () => {
  it('uses gyrofall scrypt parameters, independent salts, and a dummy derivation for missing or malformed hashes', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('incorrect', hash)).toBe(false);
    expect(await hashPassword('correct horse battery')).not.toBe(hash);
    expect(await verifyPassword('incorrect')).toBe(false);
    expect(await verifyPassword('incorrect', 'scrypt$99999999$8$1$bad$bad')).toBe(false);
    expect(DUMMY_HASH).toContain('scrypt$131072$8$1$');
  }, 15000);
  it('normalizes account keys and enforces registration bounds', () => {
    expect(registration({ username: ' Player_1 ', email: ' PLAYER@Example.COM ', password: 'abcdefghijkl' })).toMatchObject({ username: 'Player_1', usernameKey: 'player_1', emailKey: 'player@example.com' });
    for (const username of ['ab', 'a'.repeat(25), 'with.dot', '$bad']) expect(() => registration({ username, email: 'a@b.com', password: 'abcdefghijkl' })).toThrow();
    for (const password of ['a'.repeat(11), 'a'.repeat(129)]) expect(() => registration({ username: 'good', email: 'a@b.com', password })).toThrow();
  });
  it('rejects operator/prototype keys, nonfinite values, oversized strings and excessive depth', () => {
    for (const raw of ['{"$set":1}', '{"a.b":1}', '{"__proto__":{}}', '{"a":{"constructor":1}}']) expect(() => inspectJSON(JSON.parse(raw))).toThrow();
    expect(() => inspectJSON({ n: Infinity })).toThrow(); expect(() => inspectJSON('x'.repeat(10001))).toThrow();
    let deep: unknown = 0; for (let i = 0; i < 22; i++) deep = { deep };
    expect(() => inspectJSON(deep)).toThrow();
    expect(() => inspectJSON({ safe: [1, true, null, { numberValue: 'Infinity' }] })).not.toThrow();
  });
  it('generates opaque tokens and constant-time compares secrets', () => {
    const value = token(); expect(value).toHaveLength(43); expect(digest(value)).toHaveLength(64);
    expect(digest(value)).not.toContain(value); expect(sameSecret(value, value)).toBe(true);
    expect(sameSecret(value + 'a', value)).toBe(false); expect(sameSecret(undefined, value)).toBe(false);
  });
});
