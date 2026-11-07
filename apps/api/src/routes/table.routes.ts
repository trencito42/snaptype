import { FastifyInstance } from 'fastify';
import { IRepository } from '../db/repository.js';
import { AuthService } from '../services/auth.service.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { z } from 'zod';

const CreateTableSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  name: z.string().min(1).max(150),
  description: z.string().max(500).optional().nullable(),
  columns: z.array(z.object({
    id: z.string(),
    name: z.string().min(1),
    key: z.string().min(1),
    type: z.enum(['text', 'number'])
  })).min(1)
});

const UpdateTableSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).optional().nullable(),
  columns: z.array(z.object({
    id: z.string(),
    name: z.string().min(1),
    key: z.string().min(1),
    type: z.enum(['text', 'number'])
  })).optional()
});

function validateRowData(columns: any[], data: Record<string, any>): { valid: boolean; error?: string; cleanData?: Record<string, any> } {
  const cleanData: Record<string, any> = {};
  const colMap = new Map((columns || []).map(c => [c.key, c]));

  for (const [key, val] of Object.entries(data)) {
    const col = colMap.get(key);
    if (!col) {
      cleanData[key] = val;
      continue;
    }
    if (col.type === 'number') {
      if (val === null || val === undefined || val === '') {
        cleanData[key] = null;
      } else {
        const num = Number(val);
        if (isNaN(num) || !isFinite(num)) {
          return { valid: false, error: `Column '${col.name}' (${key}) must be a valid number, got '${val}'` };
        }
        cleanData[key] = num;
      }
    } else {
      cleanData[key] = val !== null && val !== undefined ? String(val) : '';
    }
  }
  return { valid: true, cleanData };
}

export async function tableRoutes(app: FastifyInstance, repo: IRepository, authService: AuthService) {
  const requireAuth = createAuthMiddleware(authService);

  // List all tables for workspace
  app.get('/api/v1/tables', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const query = request.query as { workspaceId?: string };

    let workspaceId = query.workspaceId;
    if (!workspaceId) {
      const userWorkspaces = await repo.findUserWorkspaces(user.id);
      if (userWorkspaces.length === 0) return { tables: [] };
      workspaceId = userWorkspaces[0].workspace.id;
    }

    const member = await repo.findWorkspaceMember(workspaceId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied to workspace' });
    }

    const tables = await repo.findTables(workspaceId);
    return { tables };
  });

  // Get single table
  app.get('/api/v1/tables/:id', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const table = await repo.findTableById(id);
    if (!table) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    const member = await repo.findWorkspaceMember(table.workspaceId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied to table' });
    }

    const rows = await repo.findTableRows(id);
    return { table: { ...table, rows } };
  });

  // Create table
  app.post('/api/v1/tables', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const parsed = CreateTableSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid table data', details: parsed.error.flatten() });
    }

    let workspaceId = parsed.data.workspaceId;
    if (!workspaceId) {
      const userWorkspaces = await repo.findUserWorkspaces(user.id);
      if (userWorkspaces.length === 0) return reply.status(400).send({ error: 'No workspace found' });
      workspaceId = userWorkspaces[0].workspace.id;
    }

    const member = await repo.findWorkspaceMember(workspaceId, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin' && member.role !== 'editor')) {
      return reply.status(403).send({ error: 'Editor access required to create table' });
    }

    const existing = await repo.findTables(workspaceId);
    if (existing.some((t) => t.name.trim().toLowerCase() === parsed.data.name.trim().toLowerCase())) {
      return reply.status(409).send({ error: `A table named "${parsed.data.name}" already exists in this workspace` });
    }
    if (parsed.data.columns.length > 30) {
      return reply.status(400).send({ error: 'A table can have at most 30 columns' });
    }

    const table = await repo.createTable(workspaceId, parsed.data);
    return reply.status(201).send({ table });
  });

  // Update table
  app.patch('/api/v1/tables/:id', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const table = await repo.findTableById(id);
    if (!table) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    const member = await repo.findWorkspaceMember(table.workspaceId, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin' && member.role !== 'editor')) {
      return reply.status(403).send({ error: 'Editor access required to update table' });
    }

    const parsed = UpdateTableSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid update data', details: parsed.error.flatten() });
    }

    if (parsed.data.name !== undefined) {
      const siblings = await repo.findTables(table.workspaceId);
      if (siblings.some((t) => t.id !== id && t.name.trim().toLowerCase() === parsed.data.name!.trim().toLowerCase())) {
        return reply.status(409).send({ error: `A table named "${parsed.data.name}" already exists in this workspace` });
      }
    }

    const updated = await repo.updateTable(id, parsed.data);
    return { table: updated };
  });

  // Delete table
  app.delete('/api/v1/tables/:id', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const table = await repo.findTableById(id);
    if (!table) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    const member = await repo.findWorkspaceMember(table.workspaceId, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return reply.status(403).send({ error: 'Admin access required to delete table' });
    }

    await repo.deleteTable(id);
    return { success: true };
  });

  // Get table rows
  app.get('/api/v1/tables/:id/rows', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const table = await repo.findTableById(id);
    if (!table) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    const member = await repo.findWorkspaceMember(table.workspaceId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const rows = await repo.findTableRows(id);
    return { rows };
  });

  // Create table row
  app.post('/api/v1/tables/:id/rows', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const table = await repo.findTableById(id);
    if (!table) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    const member = await repo.findWorkspaceMember(table.workspaceId, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin' && member.role !== 'editor')) {
      return reply.status(403).send({ error: 'Editor access required to add rows' });
    }

    const data = request.body as Record<string, any>;
    if (!data || typeof data !== 'object') {
      return reply.status(400).send({ error: 'Row data must be an object' });
    }

    const validated = validateRowData(table.columns, data);
    if (!validated.valid) {
      return reply.status(400).send({ error: validated.error });
    }

    if ((await repo.findTableRows(id)).length >= 10000) {
      return reply.status(400).send({ error: 'A table can hold at most 10,000 rows' });
    }

    const row = await repo.createTableRow(id, validated.cleanData || data);
    return reply.status(201).send({ row });
  });

  // Update table row
  app.patch('/api/v1/tables/:id/rows/:rowId', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id, rowId } = request.params as { id: string; rowId: string };

    const table = await repo.findTableById(id);
    if (!table) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    const member = await repo.findWorkspaceMember(table.workspaceId, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin' && member.role !== 'editor')) {
      return reply.status(403).send({ error: 'Editor access required to update rows' });
    }

    // Verify row belongs to this specific table (IDOR prevention)
    const existingRow = await repo.findTableRowById(id, rowId);
    if (!existingRow) {
      return reply.status(404).send({ error: 'Row not found in this table' });
    }

    const data = request.body as Record<string, any>;
    if (!data || typeof data !== 'object') {
      return reply.status(400).send({ error: 'Row data must be an object' });
    }

    const validated = validateRowData(table.columns, data);
    if (!validated.valid) {
      return reply.status(400).send({ error: validated.error });
    }

    const updated = await repo.updateTableRow(id, rowId, validated.cleanData || data);
    if (!updated) {
      return reply.status(404).send({ error: 'Row not found in this table' });
    }
    return { row: updated };
  });

  // Delete table row
  app.delete('/api/v1/tables/:id/rows/:rowId', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id, rowId } = request.params as { id: string; rowId: string };

    const table = await repo.findTableById(id);
    if (!table) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    const member = await repo.findWorkspaceMember(table.workspaceId, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin' && member.role !== 'editor')) {
      return reply.status(403).send({ error: 'Editor access required to delete rows' });
    }

    // Verify row belongs to this specific table (IDOR prevention)
    const existingRow = await repo.findTableRowById(id, rowId);
    if (!existingRow) {
      return reply.status(404).send({ error: 'Row not found in this table' });
    }

    const deleted = await repo.deleteTableRow(id, rowId);
    if (!deleted) {
      return reply.status(404).send({ error: 'Row not found in this table' });
    }
    return { success: true };
  });
}

