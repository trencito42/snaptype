import { describe, it, expect } from 'vitest';
import { initDatabase } from '../../apps/api/src/db/connection.js';

describe('P0.2 Database Connection Fail-Safe', () => {
  it('throws a fatal error in production mode if DATABASE_URL is missing', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    await expect(initDatabase(undefined, 'mysql')).rejects.toThrow(/\[DB Fatal\]/);

    process.env.NODE_ENV = prevEnv;
  });

  it('throws a fatal error in production mode if memory driver is requested', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    await expect(initDatabase(undefined, 'memory')).rejects.toThrow(/In-memory repository is strictly forbidden in production/);

    process.env.NODE_ENV = prevEnv;
  });

  it('throws a fatal error in production mode if MySQL connection fails instead of falling back to memory', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // Non-existent MySQL host on port 59999
    const invalidUrl = 'mysql://user:pass@127.0.0.1:59999/invalid_db';
    await expect(initDatabase(invalidUrl)).rejects.toThrow(/\[DB Fatal\]/);

    process.env.NODE_ENV = prevEnv;
  });
});


describe('driver selection from DATABASE_URL (RB-028)', () => {
  it('does not silently fall back to memory when only DATABASE_URL is set', async () => {
    const prevUrl = process.env.DATABASE_URL, prevDrv = process.env.DB_DRIVER, prevEnv = process.env.NODE_ENV;
    process.env.DATABASE_URL = 'mysql://u:p@127.0.0.1:1/none'; delete process.env.DB_DRIVER; process.env.NODE_ENV = 'production';
    try {
      // Production + unreachable MySQL must be fatal, never an in-memory repository.
      await expect(initDatabase()).rejects.toThrow(/MySQL|DB Fatal/);
    } finally {
      if (prevUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = prevUrl;
      if (prevDrv !== undefined) process.env.DB_DRIVER = prevDrv;
      process.env.NODE_ENV = prevEnv;
    }
  });
});
