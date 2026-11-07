import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const buildScript = path.resolve('apps/extension/build.js');
const extVersion = JSON.parse(fs.readFileSync('apps/extension/package.json', 'utf-8')).version;
const outDirs: string[] = [];

function build(args: string[], env: Record<string, string> = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'snaptype-ext-'));
  outDirs.push(out);
  const clean = { ...process.env, ...env } as Record<string, string | undefined>;
  delete clean.SNAPTYPE_API_URL; delete clean.SNAPTYPE_APP_URL; delete clean.NODE_ENV;
  Object.assign(clean, env);
  const r = spawnSync('node', [buildScript, `--out-dir=${out}`, ...args], { encoding: 'utf-8', env: clean });
  return { out, r };
}
const manifest = (out: string, t: string) => JSON.parse(fs.readFileSync(path.join(out, t, 'manifest.json'), 'utf-8'));

afterAll(() => { for (const d of outDirs) fs.rmSync(d, { recursive: true, force: true }); });

describe('extension build (executes the real build script)', () => {
  it('development build allows loopback and stamps the package version', () => {
    const { out, r } = build([]);
    expect(r.status).toBe(0);
    for (const t of ['chrome', 'firefox']) {
      const m = manifest(out, t);
      expect(m.version).toBe(extVersion);
      expect(m.host_permissions).toContain('http://localhost:3000/*');
    }
  });

  it('production build refuses to run without explicitly configured URLs', () => {
    const { r } = build(['--production']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('SNAPTYPE_API_URL');
  });

  it('production build rejects loopback and non-https URLs', () => {
    expect(build(['--production', '--api-url=http://localhost:3000/api/v1', '--app-url=https://x.example']).r.status).not.toBe(0);
    expect(build(['--production', '--api-url=http://api.example/api/v1', '--app-url=https://x.example']).r.status).not.toBe(0);
  });

  it('production build contains only the configured API origin, no loopback, minimal permissions', () => {
    const { out, r } = build(['--production', '--api-url=https://api.example.test/api/v1', '--app-url=https://app.example.test']);
    expect(r.status).toBe(0);
    for (const t of ['chrome', 'firefox']) {
      const m = manifest(out, t);
      expect(m.host_permissions).toEqual(['https://api.example.test/*']);
      expect([...m.permissions].sort()).toEqual(['activeTab', 'alarms', 'contextMenus', 'storage']);
      expect(m.description).not.toMatch(/sub-millisecond/i);
    }
    expect(manifest(out, 'firefox').browser_specific_settings.gecko.id).toBe('extension@snaptype.app');
  });
});
