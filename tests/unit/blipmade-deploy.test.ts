import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Blipmade Git Deploy integration artifacts', () => {
  it('documents Blipmade deployment and serve entrypoints exist', () => {
    const doc = fs.readFileSync(path.resolve('docs/deployment/BLIPMADE.md'), 'utf-8');
    expect(doc).toContain('trencito42/snaptype');
    expect(doc).toContain('SERVER_PORT');
    expect(doc).toMatch(/build:web|build:packages/);
    expect(fs.existsSync(path.resolve('apps/web/serve.mjs'))).toBe(true);
    expect(fs.readFileSync(path.resolve('apps/web/serve.mjs'), 'utf-8')).toContain('SERVER_PORT');
  });

  it('API server resolves Wings port via shared helper', () => {
    const serverSrc = fs.readFileSync(path.resolve('apps/api/src/server.ts'), 'utf-8');
    expect(serverSrc).toContain('resolveListenPort');
  });

  it('web Vite config requires VITE_API_BASE for blipmade target', () => {
    const vite = fs.readFileSync(path.resolve('apps/web/vite.config.ts'), 'utf-8');
    expect(vite).toContain('VITE_SNAPTYPE_DEPLOY_TARGET');
    expect(vite).toContain('VITE_API_BASE');
  });
});
