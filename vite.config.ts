import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Include the art content in the client build so replacing any atlas also changes
// its request URL, even for browsers that cached the previous unversioned files.
const artRoot = fileURLToPath(new URL('./public/assets/', import.meta.url));
const artHash = createHash('sha256');
for (const file of readdirSync(artRoot, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => path.relative(artRoot, path.join(entry.parentPath, entry.name)))
  .sort()) {
  artHash.update(file.replaceAll('\\', '/')).update('\0').update(readFileSync(path.join(artRoot, file)));
}

export default defineConfig({
  base: './',
  define: { 'import.meta.env.VITE_ART_VERSION': JSON.stringify(artHash.digest('hex').slice(0, 16)) },
  server: { port: 5173, open: false, proxy: { '/api': 'http://localhost:8090', '/healthz': 'http://localhost:8090' } },
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
} as any);
