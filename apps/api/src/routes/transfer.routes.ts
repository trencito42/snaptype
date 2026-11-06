import { FastifyInstance } from 'fastify';
import { IRepository } from '../db/repository.js';
import { AuthService } from '../services/auth.service.js';
import { SnippetService } from '../services/snippet.service.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { ImportSnippetsSchema } from '@snaptype/shared';

export async function transferRoutes(
  app: FastifyInstance,
  repo: IRepository,
  authService: AuthService,
  snippetService: SnippetService
) {
  const requireAuth = createAuthMiddleware(authService);

  // Export snippets & folders as JSON
  app.get('/api/v1/export', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const query = request.query as { workspaceId?: string };

    let workspaceId = query.workspaceId;
    if (!workspaceId) {
      const workspaces = await repo.findUserWorkspaces(user.id);
      workspaceId = workspaces[0]?.workspace.id;
    }

    if (!workspaceId) {
      return reply.status(400).send({ error: 'No workspace found' });
    }

    try {
      const exportData = await snippetService.exportWorkspace(workspaceId, user.id);
      reply.header('Content-Disposition', 'attachment; filename="snaptype-export.json"');
      reply.header('Content-Type', 'application/json');
      return exportData;
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }
  });

  // Import snippets
  app.post('/api/v1/import', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const parsed = ImportSnippetsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid import payload', details: parsed.error.flatten() });
    }

    let workspaceId = parsed.data.workspaceId;
    if (!workspaceId) {
      const workspaces = await repo.findUserWorkspaces(user.id);
      workspaceId = workspaces[0]?.workspace.id;
    }

    if (!workspaceId) {
      return reply.status(400).send({ error: 'No workspace available for import' });
    }

    try {
      const result = await snippetService.importSnippets(workspaceId, user.id, parsed.data);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}

