import { describe, it, expect, beforeAll } from 'vitest';
import { InMemoryRepository } from '../../apps/api/src/db/repository.js';
import { AuthService } from '../../apps/api/src/services/auth.service.js';
import { renderSnippet } from '../../packages/snippet-engine/src/dynamic-parser.js';
import fastify, { FastifyInstance } from 'fastify';
import { syncRoutes } from '../../apps/api/src/routes/sync.routes.js';

describe('Data Tables and Lookup Resolution', () => {
  let repo: InMemoryRepository;
  let authService: AuthService;
  let workspaceId: string;
  let tableId: string;

  beforeAll(async () => {
    repo = new InMemoryRepository();
    authService = new AuthService(repo);

    const user = await repo.createUser('test.table@company.com', 'Table Test User');
    const ws = await repo.createWorkspace('Support Org', 'support-org', user.id, true);
    workspaceId = ws.id;

    // Create a data table
    const table = await repo.createTable(workspaceId, {
      name: 'customers',
      description: 'Customer lookup table',
      columns: [
        { id: '1', name: 'Email', key: 'email', type: 'text' },
        { id: '2', name: 'Name', key: 'name', type: 'text' },
        { id: '3', name: 'Plan', key: 'plan', type: 'text' },
        { id: '4', name: 'Discount', key: 'discount', type: 'number' }
      ]
    });
    tableId = table.id;

    // Insert rows
    await repo.createTableRow(tableId, {
      email: 'alice@example.com',
      name: 'Alice Smith',
      plan: 'Enterprise',
      discount: 20
    });

    await repo.createTableRow(tableId, {
      email: 'bob@example.com',
      name: 'Bob Jones',
      plan: 'Starter',
      discount: 5
    });
  });

  it('lists data tables for a workspace', async () => {
    const tables = await repo.findTables(workspaceId);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('customers');
    expect(tables[0].rowCount).toBe(2);
    expect(tables[0].columns).toHaveLength(4);
  });

  it('retrieves rows for a data table', async () => {
    const rows = await repo.findTableRows(tableId);
    expect(rows).toHaveLength(2);
    expect(rows[0].data.name).toBe('Alice Smith');
    expect(rows[1].data.plan).toBe('Starter');
  });

  it('updates a table row', async () => {
    const rows = await repo.findTableRows(tableId);
    const aliceRow = rows.find(r => r.data.email === 'alice@example.com')!;
    
    await repo.updateTableRow(tableId, aliceRow.id, { plan: 'VIP' });
    const updatedRows = await repo.findTableRows(tableId);
    const updatedAlice = updatedRows.find(r => r.data.email === 'alice@example.com')!;
    expect(updatedAlice.data.plan).toBe('VIP');
    expect(updatedAlice.data.name).toBe('Alice Smith'); // preserved
  });

  it('resolves {{table:customers|lookup=email|value=...|column=...}} inside dynamic parser', async () => {
    // DynamicSnippetParser supports tableResolver
    const rows = await repo.findTableRows(tableId);
    const tableResolver = (tableName: string, lookupCol: string, lookupVal: string, targetCol: string) => {
      if (tableName === 'customers') {
        const found = rows.find(r => String(r.data[lookupCol]).toLowerCase() === lookupVal.toLowerCase());
        if (found && found.data[targetCol] !== undefined) {
          return String(found.data[targetCol]);
        }
      }
      return null;
    };

    const template = 'Customer: {{table:customers|lookup=email|value=alice@example.com|column=name}}, Plan: {{table:customers|lookup=email|value=alice@example.com|column=plan}}';
    const result = renderSnippet(template, { tableResolver });
    expect(result.text).toBe('Customer: Alice Smith, Plan: VIP');
  });

  it('deletes rows and tables cleanly', async () => {
    const rows = await repo.findTableRows(tableId);
    await repo.deleteTableRow(tableId, rows[0].id);
    const afterDeleteRows = await repo.findTableRows(tableId);
    expect(afterDeleteRows).toHaveLength(1);

    await repo.deleteTable(tableId);
    const tablesAfter = await repo.findTables(workspaceId);
    expect(tablesAfter).toHaveLength(0);
  });

  it('performs incremental/lazy table synchronization (ST-042 / Blocker 5)', async () => {
    const app: FastifyInstance = fastify();
    await syncRoutes(app, repo, authService);
    await app.ready();

    const user = await repo.createUser('sync.tester@company.com', 'Sync User');
    const ws = await repo.createWorkspace('Sync Workspace', 'sync-ws', user.id, true);
    const userToken = await authService.createSessionForUser(user.id);

    // Create a table with rows
    const tbl = await repo.createTable(ws.id, {
      name: 'products',
      columns: [{ id: '1', name: 'SKU', key: 'sku', type: 'text' }]
    });
    await repo.createTableRow(tbl.id, { sku: 'PROD-100' });

    // 1. Initial sync (lastRevision === 0) includes tables with rows
    const initialRes = await app.inject({
      method: 'GET',
      url: `/api/v1/sync?workspaceId=${ws.id}&lastRevision=0`,
      headers: { authorization: `Bearer ${userToken}` }
    });
    expect(initialRes.statusCode).toBe(200);
    const initialBody = JSON.parse(initialRes.body);
    expect(initialBody.tables).toBeDefined();
    expect(initialBody.tables).toHaveLength(1);
    expect(initialBody.tables[0].rows).toHaveLength(1);

    // 2. Incremental sync with same revision does NOT transmit tables (saving bandwidth on low-end machines)
    const currentRev = initialBody.currentRevision;
    const lazyRes = await app.inject({
      method: 'GET',
      url: `/api/v1/sync?workspaceId=${ws.id}&lastRevision=${currentRev}`,
      headers: { authorization: `Bearer ${userToken}` }
    });
    expect(lazyRes.statusCode).toBe(200);
    const lazyBody = JSON.parse(lazyRes.body);
    expect(lazyBody.tables).toBeUndefined();

    // 3. Explicit table refresh request (includeTables=true) returns tables even if revision unchanged
    const forcedRes = await app.inject({
      method: 'GET',
      url: `/api/v1/sync?workspaceId=${ws.id}&lastRevision=${currentRev}&includeTables=true`,
      headers: { authorization: `Bearer ${userToken}` }
    });
    expect(forcedRes.statusCode).toBe(200);
    const forcedBody = JSON.parse(forcedRes.body);
    expect(forcedBody.tables).toBeDefined();
    expect(forcedBody.tables).toHaveLength(1);
  });
});
