import { FastifyInstance } from 'fastify';
import { IRepository } from '../db/repository.js';
import { AuthService } from '../services/auth.service.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { SyncResponse } from '@snaptype/shared';

export async function syncRoutes(app: FastifyInstance, repo: IRepository, authService: AuthService) {
  const requireAuth = createAuthMiddleware(authService);

  app.get('/api/v1/sync', { preHandler: requireAuth }, async (request, reply) => {
    // Prevent browser or proxy disk caching of sensitive snippet sync payload
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    reply.header('Pragma', 'no-cache');

    const user = request.user!;
    const query = request.query as { lastRevision?: string; workspaceId?: string; includeTables?: string };
    const lastRevision = parseInt(query.lastRevision || '0', 10);

    let workspaceId = query.workspaceId;
    if (!workspaceId) {
      const workspaces = await repo.findUserWorkspaces(user.id);
      if (workspaces.length === 0) {
        const prefs = await repo.getUserPreferences(user.id);
        const emptySync: SyncResponse = {
          currentRevision: 1,
          snippets: [],
          deletedSnippetIds: [],
          folders: [],
          deletedFolderIds: [],
          preferences: prefs
        };
        return emptySync;
      }
      workspaceId = workspaces[0].workspace.id;
    }

    const member = await repo.findWorkspaceMember(workspaceId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied to workspace' });
    }

    const syncData = await repo.getSyncData(workspaceId, lastRevision);
    const preferences = await repo.getUserPreferences(user.id);

    // ST-042 / Blocker 5: Lazy/incremental data tables sync
    // Avoid sending every table and every row on every periodic sync.
    // Full table payload is only included if:
    // 1) Initial sync / workspace switch (lastRevision === 0)
    // 2) Client explicitly requested table refresh (query.includeTables === 'true')
    // 3) Snippet/workspace revision has advanced (syncData.currentRevision > lastRevision)
    let tables: any[] | undefined = undefined;
    if (lastRevision === 0 || query.includeTables === 'true' || syncData.currentRevision > lastRevision) {
      const rawTables = await repo.findTables(workspaceId);
      tables = [];
      for (const t of rawTables) {
        const rows = await repo.findTableRows(t.id);
        tables.push({ ...t, rows });
      }
    }

    const response: SyncResponse = {
      currentRevision: syncData.currentRevision,
      snippets: syncData.snippets,
      deletedSnippetIds: syncData.deletedSnippetIds,
      folders: syncData.folders,
      deletedFolderIds: syncData.deletedFolderIds,
      preferences,
      ...(tables !== undefined ? { tables } : {})
    };

    return response;
  });
}

