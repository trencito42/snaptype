import { FastifyInstance } from 'fastify';
import { IRepository } from '../db/repository.js';
import { AuthService } from '../services/auth.service.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { UpdatePreferencesSchema } from '@snaptype/shared';

export async function userRoutes(app: FastifyInstance, repo: IRepository, authService: AuthService) {
  const requireAuth = createAuthMiddleware(authService);

  app.get('/api/v1/me', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const workspaces = await repo.findUserWorkspaces(user.id);
    const preferences = await repo.getUserPreferences(user.id);

    return {
      user,
      workspaces,
      preferences
    };
  });

  app.patch('/api/v1/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const body = request.body as { name?: string };
    const updated = await repo.updateUser(user.id, { name: body.name });
    return { user: updated };
  });

  app.delete('/api/v1/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    await repo.deleteUser(user.id);
    return { success: true, message: 'Account deleted' };
  });

  app.get('/api/v1/preferences', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const prefs = await repo.getUserPreferences(user.id);
    return { preferences: prefs };
  });

  app.put('/api/v1/preferences', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const parsed = UpdatePreferencesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid preferences data', details: parsed.error.flatten() });
    }

    const updated = await repo.updateUserPreferences(user.id, parsed.data);
    return { preferences: updated };
  });
}
