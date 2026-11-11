import { randomBytes, createHash, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto';
export const SCRYPT = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
const scrypt = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, 64, SCRYPT, (error, key) => error ? reject(error) : resolve(key)));
export const DUMMY_HASH = `scrypt$${SCRYPT.N}$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export class HttpError extends Error {
  status: number; code: string; revision?: number;
  constructor(status: number, message: string, code = 'REQUEST_FAILED', revision?: number) {
    super(message); this.status = status; this.code = code; this.revision = revision;
  }
}
export function invalid(message = 'Invalid input.'): never { throw new HttpError(400, message, 'INVALID_INPUT'); }
export function emailKey(value: unknown): string {
  if (typeof value !== 'string') return invalid('Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('Enter a valid email address.');
  return email;
}
export function passwordInput(value: unknown, registering = false): asserts value is string {
  if (typeof value !== 'string' || value.length < (registering ? 12 : 1) || value.length > 128 || Buffer.byteLength(value) > 512) invalid('Use a password between 12 and 128 characters.');
}
export function registration(body: Record<string, unknown>) {
  const email = emailKey(body.email);
  if (typeof body.username !== 'string' || !/^[a-zA-Z0-9_]{3,24}$/.test(body.username.trim())) return invalid('Use 3–24 letters, numbers or underscores.');
  passwordInput(body.password, true);
  return { email, emailKey: email, username: body.username.trim(), usernameKey: body.username.trim().toLowerCase() };
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt);
  return `scrypt$${SCRYPT.N}$8$1$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: unknown = DUMMY_HASH) {
  const valid = typeof encoded === 'string' && /^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded);
  const parts = (valid ? encoded as string : DUMMY_HASH).split('$');
  const actual = await scrypt(password, parts[4]);
  return timingSafeEqual(actual, Buffer.from(parts[5], 'hex')) && valid;
}
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function sameSecret(a: unknown, b: string) {
  if (typeof a !== 'string') return false;
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
export const publicUser = (user: { _id: unknown; email: string; username: string }) => ({ id: String(user._id), email: user.email, username: user.username });
export function inspectJSON(value: unknown, depth = 0): void {
  if (depth > 20) invalid('Data is nested too deeply.');
  if (typeof value === 'number' && !Number.isFinite(value)) invalid('Invalid number.');
  if (typeof value === 'string' && value.length > 10000) invalid('Oversized value.');
  if (value && typeof value === 'object') for (const [key, entry] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || key.startsWith('$') || key.includes('.')) invalid('Invalid field.');
    inspectJSON(entry, depth + 1);
  }
}
