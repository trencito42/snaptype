import { describe, it, expect, beforeAll } from 'vitest';
import { InMemoryRepository } from '../../apps/api/src/db/repository.js';
import { AuthService } from '../../apps/api/src/services/auth.service.js';
import fastify, { FastifyInstance } from 'fastify';
import { tableRoutes } from '../../apps/api/src/routes/table.routes.js';

describe('ST-002 & ST-031: Data Tables Security, IDOR Prevention & Row Validation', () => {
  let app: FastifyInstance;
  let repo: InMemoryRepository;
  let authService: AuthService;

  let userAId: string;
  let userBId: string;
  let tokenA: string;
  let tokenB: string;

  let workspaceAId: string;
  let workspaceBId: string;

  let tableAId: string;
  let tableBId: string;

  let rowAId: string;
  let rowBId: string;

  beforeAll(async () => {
    repo = new InMemoryRepository();
    authService = new AuthService(repo);

    // Setup User A
    const userA = await repo.createUser('tenant.a@company.com', 'Tenant A');
    userAId = userA.id;
    const wsA = await repo.createWorkspace('Workspace A', 'workspace-a', userAId, true);
    workspaceAId = wsA.id;

    // Create session for User A
    tokenA = await authService.createSessionForUser(userAId);

    // Setup User B
    const userB = await repo.createUser('tenant.b@company.com', 'Tenant B');
    userBId = userB.id;
    const wsB = await repo.createWorkspace('Workspace B', 'workspace-b', userBId, true);
    workspaceBId = wsB.id;

    // Create session for User B
    tokenB = await authService.createSessionForUser(userBId);

    // Table A in Workspace A
    const tableA = await repo.createTable(workspaceAId, {
      name: 'customers_a',
      columns: [
        { id: '1', name: 'Name', key: 'name', type: 'text' },
        { id: '2', name: 'Balance', key: 'balance', type: 'number' }
      ]
    });
    tableAId = tableA.id;

    // Table B in Workspace B
    const tableB = await repo.createTable(workspaceBId, {
      name: 'customers_b',
      columns: [
        { id: '1', name: 'Name', key: 'name', type: 'text' },
        { id: '2', name: 'Balance', key: 'balance', type: 'number' }
      ]
    });
    tableBId = tableB.id;

    // Create Row A in Table A
    const rowA = await repo.createTableRow(tableAId, { name: 'Customer A', balance: 100 });
    rowAId = rowA.id;

    // Create Row B in Table B
    const rowB = await repo.createTableRow(tableBId, { name: 'Customer B (Secret)', balance: 999999 });
    rowBId = rowB.id;

    // Initialize Fastify app
    app = fastify();
    await tableRoutes(app, repo, authService);
    await app.ready();
  });

  it('rejects cross-workspace / cross-table row update IDOR (ST-002)', async () => {
    // User A targets authorized Table A, but passes Row B's ID in the URL
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${tableAId}/rows/${rowBId}`,
      headers: {
        authorization: `Bearer ${tokenA}`
      },
      payload: {
        balance: 0,
        name: 'Hacked'
      }
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Row not found in this table');

    // Confirm Row B was NOT modified
    const untouchedRowB = await repo.findTableRowById(tableBId, rowBId);
    expect(untouchedRowB?.data.balance).toBe(999999);
    expect(untouchedRowB?.data.name).toBe('Customer B (Secret)');
  });

  it('rejects cross-workspace / cross-table row delete IDOR (ST-002)', async () => {
    // User A targets authorized Table A, but attempts to delete Row B
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tables/${tableAId}/rows/${rowBId}`,
      headers: {
        authorization: `Bearer ${tokenA}`
      }
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Row not found in this table');

    // Confirm Row B still exists in Table B
    const untouchedRowB = await repo.findTableRowById(tableBId, rowBId);
    expect(untouchedRowB).not.toBeNull();
  });

  it('enforces column schema types on row creation and update (ST-031)', async () => {
    // User A sends string for numeric column 'balance'
    const resCreateInvalid = await app.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableAId}/rows`,
      headers: {
        authorization: `Bearer ${tokenA}`
      },
      payload: {
        name: 'Invalid Customer',
        balance: 'not-a-number'
      }
    });

    expect(resCreateInvalid.statusCode).toBe(400);
    expect(JSON.parse(resCreateInvalid.body).error).toContain("must be a valid number");

    // Valid numeric update succeeds
    const resUpdateValid = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${tableAId}/rows/${rowAId}`,
      headers: {
        authorization: `Bearer ${tokenA}`
      },
      payload: {
        balance: 250
      }
    });

    expect(resUpdateValid.statusCode).toBe(200);
    const updatedA = await repo.findTableRowById(tableAId, rowAId);
    expect(updatedA?.data.balance).toBe(250);
  });
});
