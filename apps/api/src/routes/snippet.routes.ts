import { FastifyInstance } from 'fastify';
import { IRepository } from '../db/repository.js';
import { AuthService } from '../services/auth.service.js';
import { SnippetService } from '../services/snippet.service.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { CreateSnippetSchema, UpdateSnippetSchema } from '@snaptype/shared';

export async function snippetRoutes(
  app: FastifyInstance,
  repo: IRepository,
  authService: AuthService,
  snippetService: SnippetService
) {
  const requireAuth = createAuthMiddleware(authService);

  // List snippets
  app.get('/api/v1/snippets', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const query = request.query as {
      workspaceId?: string;
      folderId?: string;
      search?: string;
      tag?: string;
      favoriteOnly?: string;
    };

    let workspaceId = query.workspaceId;
    if (!workspaceId) {
      const userWorkspaces = await repo.findUserWorkspaces(user.id);
      if (userWorkspaces.length === 0) return { snippets: [] };
      workspaceId = userWorkspaces[0].workspace.id;
    }

    try {
      const snippets = await snippetService.getSnippets(workspaceId, user.id, {
        folderId: query.folderId === 'null' ? null : query.folderId,
        search: query.search,
        tag: query.tag,
        favoriteOnly: query.favoriteOnly === 'true'
      });
      return { snippets };
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }
  });

  // Get snippet by id
  app.get('/api/v1/snippets/:id', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    try {
      const snippet = await snippetService.getSnippet(id, user.id);
      return { snippet };
    } catch (err: any) {
      const status = err.message === 'Snippet not found' ? 404 : 403;
      return reply.status(status).send({ error: err.message });
    }
  });

  // Create snippet
  app.post('/api/v1/snippets', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const parsed = CreateSnippetSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid snippet data', details: parsed.error.flatten() });
    }

    let workspaceId = parsed.data.workspaceId;
    if (!workspaceId) {
      const userWorkspaces = await repo.findUserWorkspaces(user.id);
      workspaceId = userWorkspaces[0].workspace.id;
    }

    try {
      const snippet = await snippetService.createSnippet(workspaceId, user.id, parsed.data);
      return reply.status(201).send({ snippet });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Update snippet (with optimistic concurrency support)
  app.patch('/api/v1/snippets/:id', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const parsed = UpdateSnippetSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid update data', details: parsed.error.flatten() });
    }

    try {
      const updated = await snippetService.updateSnippet(id, user.id, parsed.data);
      return { snippet: updated };
    } catch (err: any) {
      const statusCode = err.statusCode || (err.message === 'Snippet not found' ? 404 : 400);
      return reply.status(statusCode).send({ error: err.message });
    }
  });

  // Delete snippet
  app.delete('/api/v1/snippets/:id', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    try {
      await snippetService.deleteSnippet(id, user.id);
      return { success: true, message: 'Snippet deleted' };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Duplicate snippet
  app.post('/api/v1/snippets/:id/duplicate', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    try {
      const duplicate = await snippetService.duplicateSnippet(id, user.id);
      return reply.status(201).send({ snippet: duplicate });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Get revisions
  app.get('/api/v1/snippets/:id/revisions', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    try {
      const revisions = await snippetService.getSnippetRevisions(id, user.id);
      return { revisions };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Record usage
  app.post('/api/v1/snippets/:id/usage', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    try {
      await snippetService.recordUsage(id, user.id);
      return { success: true };
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }
  });
}

