import { FastifyInstance } from 'fastify';
import { IRepository } from '../db/repository.js';
import { AuthService } from '../services/auth.service.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';

export async function workspaceRoutes(app: FastifyInstance, repo: IRepository, authService: AuthService) {
  const requireAuth = createAuthMiddleware(authService);

  app.get('/api/v1/workspaces', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const workspaces = await repo.findUserWorkspaces(user.id);
    return { workspaces };
  });

  app.post('/api/v1/workspaces', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const body = request.body as { name: string };
    if (!body?.name?.trim()) {
      return reply.status(400).send({ error: 'Workspace name is required' });
    }

    const name = body.name.trim();
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(2, 7);
    const ws = await repo.createWorkspace(name, slug, user.id, false);
    return reply.status(201).send({ workspace: ws });
  });

  app.get('/api/v1/workspaces/:id/members', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const member = await repo.findWorkspaceMember(id, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied to workspace' });
    }

    // In memory or MySQL repo, fetch members
    const members = await repo.findUserWorkspaces(user.id);
    return { members };
  });
}

