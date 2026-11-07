import { FastifyInstance } from 'fastify';
import { IRepository } from '../db/repository.js';
import { AuthService } from '../services/auth.service.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { CreateFolderSchema, UpdateFolderSchema } from '@snaptype/shared';

async function wouldCreateCycle(repo: IRepository, folderId: string, candidateParentId: string): Promise<boolean> {
  let currId: string | null = candidateParentId;
  const visited = new Set<string>();

  while (currId) {
    if (currId === folderId) {
      return true; // Transitive cycle detected!
    }
    if (visited.has(currId)) {
      return true;
    }
    visited.add(currId);

    const parent = await repo.findFolderById(currId);
    currId = parent?.parentId || null;
  }
  return false;
}

export async function folderRoutes(app: FastifyInstance, repo: IRepository, authService: AuthService) {
  const requireAuth = createAuthMiddleware(authService);

  // Get folders for workspace
  app.get('/api/v1/folders', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const query = request.query as { workspaceId?: string };

    let workspaceId = query.workspaceId;
    if (!workspaceId) {
      const userWorkspaces = await repo.findUserWorkspaces(user.id);
      if (userWorkspaces.length === 0) return { folders: [] };
      workspaceId = userWorkspaces[0].workspace.id;
    }

    const member = await repo.findWorkspaceMember(workspaceId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied to workspace' });
    }

    const folders = await repo.findFolders(workspaceId);
    return { folders };
  });

  // Create folder
  app.post('/api/v1/folders', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const parsed = CreateFolderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid folder data', details: parsed.error.flatten() });
    }

    let workspaceId = parsed.data.workspaceId;
    if (!workspaceId) {
      const userWorkspaces = await repo.findUserWorkspaces(user.id);
      workspaceId = userWorkspaces[0].workspace.id;
    }

    const member = await repo.findWorkspaceMember(workspaceId, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin' && member.role !== 'editor')) {
      return reply.status(403).send({ error: 'Editor access required to create folder' });
    }

    const folder = await repo.createFolder(workspaceId, parsed.data);
    return reply.status(201).send({ folder });
  });

  // Update folder
  app.patch('/api/v1/folders/:id', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const folder = await repo.findFolderById(id);
    if (!folder) {
      return reply.status(404).send({ error: 'Folder not found' });
    }

    const member = await repo.findWorkspaceMember(folder.workspaceId, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin' && member.role !== 'editor')) {
      return reply.status(403).send({ error: 'Editor access required to update folder' });
    }

    const parsed = UpdateFolderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid folder update data', details: parsed.error.flatten() });
    }

    if (parsed.data.parentId !== undefined && parsed.data.parentId !== null) {
      if (parsed.data.parentId === id) {
        return reply.status(400).send({ error: 'Folder cannot be its own parent' });
      }
      const parentFolder = await repo.findFolderById(parsed.data.parentId);
      if (!parentFolder || parentFolder.workspaceId !== folder.workspaceId) {
        return reply.status(400).send({ error: 'Parent folder must belong to the same workspace' });
      }

      // Check transitive cycle (ST-032)
      if (await wouldCreateCycle(repo, id, parsed.data.parentId)) {
        return reply.status(400).send({ error: 'Cannot set parent: cyclic hierarchy detected' });
      }
    }

    const updated = await repo.updateFolder(id, parsed.data);
    return { folder: updated };
  });

  // Delete folder
  app.delete('/api/v1/folders/:id', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const folder = await repo.findFolderById(id);
    if (!folder) {
      return reply.status(404).send({ error: 'Folder not found' });
    }

    const member = await repo.findWorkspaceMember(folder.workspaceId, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin' && member.role !== 'editor')) {
      return reply.status(403).send({ error: 'Editor access required to delete folder' });
    }

    await repo.deleteFolder(id);
    return { success: true, message: 'Folder deleted, associated snippets preserved' };
  });
}

