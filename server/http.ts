import type { IncomingMessage, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzip, brotliCompress, constants } from 'node:zlib';
import { HttpError, inspectJSON } from './auth.ts';
import { record } from '../src/sim/save-validation.ts';
export const SAVE_LIMIT = 4 * 1024 * 1024;
export function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body));
}
export async function readJSON(req: IncomingMessage, limit = 8192): Promise<Record<string, any>> {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Send JSON data.');
  return new Promise((resolve, reject) => {
    let size = 0, rejected = false; const chunks: Buffer[] = [];
    const fail = (error: Error) => { rejected = true; chunks.length = 0; reject(error); };
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit && !rejected) fail(new HttpError(413, 'Request is too large.'));
      else if (!rejected) chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!record(value)) throw new HttpError(400, 'Send a JSON object.');
        inspectJSON(value); resolve(value);
      } catch (error) { reject(error instanceof HttpError ? error : new HttpError(400, 'Invalid JSON.')); }
    });
    req.on('error', fail); req.on('aborted', () => fail(new HttpError(400, 'Request aborted.')));
  });
}
export function negotiateEncoding(header = '') {
  const offered = new Map(header.split(',').map(part => {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    const q = params.map(p => /^\s*q=([0-9.]+)\s*$/.exec(p)?.[1]).find(Boolean);
    return [name.trim(), q === undefined ? 1 : Number(q)] as const;
  }));
  const accepts = (name: string) => (offered.get(name) ?? offered.get('*') ?? 0) > 0;
  return accepts('br') ? 'br' : accepts('gzip') ? 'gzip' : null;
}
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
export async function staticFile(req: IncomingMessage, res: ServerResponse, root: string, pathname: string) {
  if (!['GET', 'HEAD'].includes(req.method || '')) throw new HttpError(405, 'Method not allowed.');
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { throw new HttpError(400, 'Invalid path.'); }
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(p => p.startsWith('.') || p.includes(':'))) throw new HttpError(404, 'Not found.');
  const base = await fs.realpath(root);
  let file = path.resolve(base, '.' + decoded);
  if (!file.startsWith(base + path.sep) && file !== base) throw new HttpError(404, 'Not found.');
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) file = path.join(base, 'index.html');
  file = await fs.realpath(file);
  if (!file.startsWith(base + path.sep)) throw new HttpError(404, 'Not found.');
  const ext = path.extname(file).toLowerCase();
  if (!mime[ext]) throw new HttpError(404, 'Not found.');
  const source = await fs.readFile(file);
  // Vite uses a relative base for standalone static hosting. Root the entry's asset URLs
  // when served through our SPA fallback so nested navigation also loads the build.
  const body = ext === '.html' ? Buffer.from(source.toString('utf8').replace(/((?:src|href)=["'])\.\/assets\//g, '$1/assets/')) : source;
  const encoding = body.length >= 1024 && ['.html', '.js', '.css', '.json', '.svg', '.wasm'].includes(ext) ? negotiateEncoding(req.headers['accept-encoding']) : null;
  const data = encoding === 'br' ? await promisify(brotliCompress)(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }) : encoding === 'gzip' ? await promisify(gzip)(body, { level: 6 }) : body;
  // Generated public art keeps stable filenames, so only Vite's hashed assets are immutable.
  const hashed = decoded.startsWith('/assets/') && /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(path.basename(file));
  res.writeHead(200, { 'Content-Type': mime[ext], 'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache', Vary: 'Accept-Encoding', 'Content-Length': data.length, ...(encoding ? { 'Content-Encoding': encoding } : {}) });
  res.end(req.method === 'HEAD' ? undefined : data);
}
