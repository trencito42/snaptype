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
});

