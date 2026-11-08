import { describe, it, expect } from 'vitest';
import { resolveListenPort } from '@snaptype/shared';

describe('Wings listen port (SERVER_PORT)', () => {
  it('prefers SERVER_PORT over PORT', () => {
    expect(resolveListenPort({ SERVER_PORT: '32015', PORT: '3000' })).toBe(32015);
  });

  it('falls back to PORT', () => {
    expect(resolveListenPort({ PORT: '3000' })).toBe(3000);
  });

  it('rejects invalid ports', () => {
    expect(() => resolveListenPort({ SERVER_PORT: '0' })).toThrow(/Invalid listen port/);
    expect(() => resolveListenPort({ SERVER_PORT: '70000' })).toThrow(/Invalid listen port/);
  });
});
