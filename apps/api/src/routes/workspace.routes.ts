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

    // Return real workspace members list
    const members = await repo.findWorkspaceMembers(id);
    return { members };
  });

  // Invite/add workspace member (requires admin or owner)
  app.post('/api/v1/workspaces/:id/members', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = request.body as { email: string; role?: 'admin' | 'editor' | 'viewer' };

    const member = await repo.findWorkspaceMember(id, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return reply.status(403).send({ error: 'Owner or admin access required to manage workspace members' });
    }

    if (!body?.email?.trim()) {
      return reply.status(400).send({ error: 'Valid email is required' });
    }

    // Find or create target user
    let targetUser = await repo.findUserByEmail(body.email.trim());
    if (!targetUser) {
      targetUser = await repo.createUser(body.email.trim());
    }

    const assignedRole = body.role || 'editor';
    const newMember = await repo.addWorkspaceMember(id, targetUser.id, assignedRole);
    return reply.status(201).send({ member: newMember });
  });

  // Remove workspace member (requires admin or owner)
  app.delete('/api/v1/workspaces/:id/members/:userId', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id, userId } = request.params as { id: string; userId: string };

    const member = await repo.findWorkspaceMember(id, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return reply.status(403).send({ error: 'Owner or admin access required to remove workspace members' });
    }

    const targetMember = await repo.findWorkspaceMember(id, userId);
    if (!targetMember) {
      return reply.status(404).send({ error: 'Member not found in workspace' });
    }

    if (targetMember.role === 'owner') {
      return reply.status(400).send({ error: 'Cannot remove workspace owner' });
    }

    await repo.removeWorkspaceMember(id, userId);
    return { success: true, message: 'Member removed from workspace' };
  });
}

