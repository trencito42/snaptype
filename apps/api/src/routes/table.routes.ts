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

    const row = await repo.createTableRow(id, data);
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

    const data = request.body as Record<string, any>;
    if (!data || typeof data !== 'object') {
      return reply.status(400).send({ error: 'Row data must be an object' });
    }

    const updated = await repo.updateTableRow(rowId, data);
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

    await repo.deleteTableRow(rowId);
    return { success: true };
  });
}
