import { describe, it, expect, vi } from 'vitest';
import mysql from 'mysql2/promise';
import { runMigrations } from '../../apps/api/src/db/migrate.js';

describe('ST-008 & ST-045: Versioned Migrations Runner', () => {
  it('returns empty array when no DATABASE_URL provided', async () => {
    const applied = await runMigrations('');
    expect(applied).toEqual([]);
  });

  it('runs unapplied migrations in alphabetical order and tracks them in schema_migrations', async () => {
    const executedQueries: string[] = [];
    const recordedIds: string[] = [];

    const mockConnection = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        executedQueries.push(sql);
        if (sql.includes('SELECT id FROM schema_migrations')) {
          // Simulate 0001 already applied, 0002 pending
          return [[{ id: '0001_initial_schema.sql' }]];
        }
        if (sql.includes('INSERT INTO schema_migrations')) {
          recordedIds.push(params?.[0]);
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 1 }];
      }),
      end: vi.fn(async () => {})
    };

    const spyCreate = vi.spyOn(mysql, 'createConnection').mockResolvedValue(mockConnection as any);

    const applied = await runMigrations('mysql://user:pass@localhost:3306/test_db');

    expect(spyCreate).toHaveBeenCalled();
    expect(mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations'));
    expect(mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('SELECT id FROM schema_migrations'));
    
    // 0001 should have been skipped, 0002 applied
    expect(applied).toContain('0002_schema_upgrade.sql');
    expect(applied).not.toContain('0001_initial_schema.sql');
    expect(recordedIds).toContain('0002_schema_upgrade.sql');
    expect(mockConnection.end).toHaveBeenCalled();

    spyCreate.mockRestore();
  });

  it('Release Blocker 1: safely upgrades legacy workspace_invitations token to token_hash without losing active invitations', async () => {
    const executedQueries: string[] = [];

    const mockConnection = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        executedQueries.push(sql);
        if (sql.includes('SELECT id FROM schema_migrations')) {
          return [[{ id: '0001_initial_schema.sql' }, { id: '0002_schema_upgrade.sql' }]];
        }
        if (sql.includes('FROM information_schema.TABLES')) {
          return [[{ 1: 1 }]];
        }
        if (sql.includes('SELECT COLUMN_NAME FROM information_schema.COLUMNS')) {
          // Simulate legacy table that still has 'token' but not 'token_hash'
          return [[{ COLUMN_NAME: 'id' }, { COLUMN_NAME: 'email' }, { COLUMN_NAME: 'token' }]];
        }
        if (sql.includes('FROM information_schema.STATISTICS')) {
          return [[{ INDEX_NAME: 'idx_invitation_token' }]];
        }
        return [{ affectedRows: 1 }];
      }),
      end: vi.fn(async () => {})
    };

    const spyCreate = vi.spyOn(mysql, 'createConnection').mockResolvedValue(mockConnection as any);

    await runMigrations('mysql://user:pass@localhost:3306/test_db');

    // Verify token_hash column added
    expect(executedQueries.some(q => q.includes('ADD COLUMN `token_hash`'))).toBe(true);
    // Verify existing tokens hashed via SHA2(token, 256)
    expect(executedQueries.some(q => q.includes('SET `token_hash` = SHA2(`token`, 256)'))).toBe(true);
    // Verify token_hash modified to NOT NULL
    expect(executedQueries.some(q => q.includes('MODIFY COLUMN `token_hash` VARCHAR(128) NOT NULL'))).toBe(true);
    // Verify plaintext token column dropped
    expect(executedQueries.some(q => q.includes('DROP COLUMN `token`'))).toBe(true);

    spyCreate.mockRestore();
  });

  it('fails safely and rethrows when a migration query fails, preventing incomplete recording', async () => {
    const recordedIds: string[] = [];

    const mockConnection = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        if (sql.includes('SELECT id FROM schema_migrations')) {
          return [[]]; // fresh installation: no migrations applied
        }
        if (sql.includes('users') || sql.includes('CREATE TABLE IF NOT EXISTS `users`') || sql.includes('CREATE TABLE IF NOT EXISTS users')) {
          throw new Error('Simulated DDL syntax error in 0001');
        }
        if (sql.includes('INSERT INTO schema_migrations')) {
          recordedIds.push(params?.[0]);
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 1 }];
      }),
      end: vi.fn(async () => {})
    };

    const spyCreate = vi.spyOn(mysql, 'createConnection').mockResolvedValue(mockConnection as any);

    await expect(runMigrations('mysql://user:pass@localhost:3306/test_db'))
      .rejects.toThrow('Migration 0001_initial_schema.sql failed');

    // Failed migration must NOT be recorded in schema_migrations!
    expect(recordedIds).not.toContain('0001_initial_schema.sql');
    expect(mockConnection.end).toHaveBeenCalled();

    spyCreate.mockRestore();
  });

  it('fails safely and throws when legacy token migration detects unhashed records', async () => {
    const mockConnection = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('SELECT id FROM schema_migrations')) {
          return [[{ id: '0001_initial_schema.sql' }, { id: '0002_schema_upgrade.sql' }, { id: '0003_upgrade_invitations_token_hash.sql' }]];
        }
        if (sql.includes('FROM information_schema.TABLES')) {
          return [[{ 1: 1 }]];
        }
        if (sql.includes('SELECT COLUMN_NAME FROM information_schema.COLUMNS')) {
          return [[{ COLUMN_NAME: 'token' }]];
        }
        if (sql.includes('COUNT(*) AS unhashed_count')) {
          return [[{ unhashed_count: 3 }]]; // 3 rows failed to hash
        }
        return [{ affectedRows: 1 }];
      }),
      end: vi.fn(async () => {})
    };

    const spyCreate = vi.spyOn(mysql, 'createConnection').mockResolvedValue(mockConnection as any);

    await expect(runMigrations('mysql://user:pass@localhost:3306/test_db'))
      .rejects.toThrow('could not be safely hashed');

    expect(mockConnection.end).toHaveBeenCalled();
    spyCreate.mockRestore();
  });

  it('fails and throws a fatal error in production when migrations directory is missing', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalMigrationsDir = process.env.MIGRATIONS_DIR;
    process.env.NODE_ENV = 'production';
    process.env.MIGRATIONS_DIR = 'C:/non_existent_migrations_dir_12345';

    const mockConnection = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('SELECT id FROM schema_migrations')) {
          return [[]];
        }
        return [{ affectedRows: 1 }];
      }),
      end: vi.fn(async () => {})
    };

    const spyCreate = vi.spyOn(mysql, 'createConnection').mockResolvedValue(mockConnection as any);

    try {
      await expect(runMigrations('mysql://user:pass@localhost:3306/test_db'))
        .rejects.toThrow('Migration SQL directory not found');
      expect(mockConnection.end).toHaveBeenCalled();
    } finally {
      if (originalEnv !== undefined) {
        process.env.NODE_ENV = originalEnv;
      } else {
        delete process.env.NODE_ENV;
      }
      if (originalMigrationsDir !== undefined) {
        process.env.MIGRATIONS_DIR = originalMigrationsDir;
      } else {
        delete process.env.MIGRATIONS_DIR;
      }
      spyCreate.mockRestore();
    }
  });

  it('verifies persistent volume upgrade: legacy invitation records survive with valid SHA-256 hash', async () => {
    const legacyPlainToken = 'legacyplaintexttoken1234567890abcdef';
    const executedStatements: string[] = [];

    const mockConnection = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        executedStatements.push(sql);
        if (sql.includes('SELECT id FROM schema_migrations')) {
          // 0001 was already applied on persistent volume
          return [[{ id: '0001_initial_schema.sql' }]];
        }
        if (sql.includes('FROM information_schema.TABLES') && sql.includes('workspace_invitations')) {
          return [[{ 1: 1 }]]; // table exists from legacy persistent volume
        }
        if (sql.includes('SELECT COLUMN_NAME FROM information_schema.COLUMNS') && sql.includes('workspace_invitations')) {
          // Legacy persistent schema had 'token' column, but not 'token_hash' yet
          return [[{ COLUMN_NAME: 'id' }, { COLUMN_NAME: 'email' }, { COLUMN_NAME: 'token' }]];
        }
        if (sql.includes('COUNT(*) AS unhashed_count')) {
          return [[{ unhashed_count: 0 }]]; // all legacy rows hashed successfully
        }
        return [{ affectedRows: 1 }];
      }),
      end: vi.fn(async () => {})
    };

    const spyCreate = vi.spyOn(mysql, 'createConnection').mockResolvedValue(mockConnection as any);

    const applied = await runMigrations('mysql://user:pass@localhost:3306/test_db');

    // 0002 and 0003 are applied on top of persistent volume
    expect(applied).toContain('0002_schema_upgrade.sql');
    expect(applied).toContain('0003_upgrade_invitations_token_hash.sql');

    // Verify upgrade statement was executed to hash active invitations
    const updateQuery = executedStatements.find(q => q.includes('UPDATE `workspace_invitations` SET `token_hash` = SHA2(`token`, 256)'));
    expect(updateQuery).toBeDefined();

    // Verify NOT NULL constraint and dropping of old plaintext column
    expect(executedStatements.some(q => q.includes('MODIFY COLUMN `token_hash` VARCHAR(128) NOT NULL'))).toBe(true);
    expect(executedStatements.some(q => q.includes('DROP COLUMN `token`'))).toBe(true);

    spyCreate.mockRestore();
  });
});

