import { describe, it, expect, beforeAll } from 'vitest';
import { InMemoryRepository } from '../../apps/api/src/db/repository.js';
import { AuthService } from '../../apps/api/src/services/auth.service.js';
import { SnippetService } from '../../apps/api/src/services/snippet.service.js';
import fastify, { FastifyInstance } from 'fastify';
import { folderRoutes } from '../../apps/api/src/routes/folder.routes.js';
import { transferRoutes } from '../../apps/api/src/routes/transfer.routes.js';

describe('Milestone D: Folder Security & Hierarchy Tests (ST-032 & ST-033)', () => {
  let app: FastifyInstance;
  let repo: InMemoryRepository;
  let authService: AuthService;
  let snippetService: SnippetService;

  let userId: string;
  let userToken: string;
  let workspaceId: string;

  beforeAll(async () => {
    repo = new InMemoryRepository();
    authService = new AuthService(repo);
    snippetService = new SnippetService(repo);

    const user = await repo.createUser('folder.tester@snaptype.app', 'Folder Tester');
    userId = user.id;
    const ws = await repo.createWorkspace('Support Org', 'support-org', userId, true);
    workspaceId = ws.id;

    userToken = await authService.createSessionForUser(userId);

    app = fastify();
    await folderRoutes(app, repo, authService);
    await transferRoutes(app, repo, authService, snippetService);
    await app.ready();
  });

  it('rejects direct self-parenting (A -> A)', async () => {
    const fA = await repo.createFolder(workspaceId, { name: 'Folder A' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/folders/${fA.id}`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { parentId: fA.id }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('cannot be its own parent');
  });

  it('rejects 2-level transitive cycles (A -> B -> A) (ST-032)', async () => {
    const fA = await repo.createFolder(workspaceId, { name: 'Parent A' });
    const fB = await repo.createFolder(workspaceId, { name: 'Child B', parentId: fA.id });

    // Now attempt to set A's parent to B
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/folders/${fA.id}`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { parentId: fB.id }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('cyclic hierarchy detected');
  });

  it('rejects multi-level transitive cycles (A -> B -> C -> A) (ST-032)', async () => {
    const fA = await repo.createFolder(workspaceId, { name: 'Root A' });
    const fB = await repo.createFolder(workspaceId, { name: 'Level B', parentId: fA.id });
    const fC = await repo.createFolder(workspaceId, { name: 'Level C', parentId: fB.id });

    // Attempt to set A's parent to C
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/folders/${fA.id}`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { parentId: fC.id }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('cyclic hierarchy detected');
  });

  it('detaches child folders when parent folder is deleted (ST-032)', async () => {
    const parent = await repo.createFolder(workspaceId, { name: 'To Delete' });
    const child = await repo.createFolder(workspaceId, { name: 'Child Preserved', parentId: parent.id });

    expect(child.parentId).toBe(parent.id);

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/folders/${parent.id}`,
      headers: { Authorization: `Bearer ${userToken}` }
    });
    expect(delRes.statusCode).toBe(200);

    const updatedChild = await repo.findFolderById(child.id);
    expect(updatedChild).toBeDefined();
    expect(updatedChild!.parentId).toBeNull();
  });

  it('preserves nested folder hierarchy and snippets during import (ST-033)', async () => {
    const payload = {
      workspaceId,
      folders: [
        { id: 'old-root-1', name: 'Imported Root', parentId: null },
        { id: 'old-child-2', name: 'Imported Child', parentId: 'old-root-1' }
      ],
      snippets: [
        {
          name: 'Snippet in Child',
          shortcut: 'imp_snip',
          plainContent: 'Hello from nested import',
          folderId: 'old-child-2'
        }
      ],
      conflictStrategy: 'duplicate'
    };

    const impRes = await app.inject({
      method: 'POST',
      url: '/api/v1/import',
      headers: { Authorization: `Bearer ${userToken}` },
      payload
    });

    expect(impRes.statusCode).toBe(200);
    const data = impRes.json();
    expect(data.importedCount).toBe(1);

    // Verify imported folder hierarchy
    const allFolders = await repo.findFolders(workspaceId);
    const importedRoot = allFolders.find((f) => f.name === 'Imported Root');
    const importedChild = allFolders.find((f) => f.name === 'Imported Child');

    expect(importedRoot).toBeDefined();
    expect(importedChild).toBeDefined();
    expect(importedChild!.parentId).toBe(importedRoot!.id);

    // Verify snippet assigned to child folder
    const createdSnippet = await repo.findSnippetByShortcut(workspaceId, 'imp_snip');
    expect(createdSnippet).toBeDefined();
    expect(createdSnippet!.folderId).toBe(importedChild!.id);
  });

  it('rejects folder creation if parentId belongs to a different workspace (Requirement 19)', async () => {
    // Create folder in a different workspace
    const otherWs = await repo.createWorkspace('Other Team', 'other-team', userId, false);
    const foreignFolder = await repo.createFolder(otherWs.id, { name: 'Foreign Folder' });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/folders',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        workspaceId,
        name: 'Malicious Subfolder',
        parentId: foreignFolder.id
      }
    });

    expect(createRes.statusCode).toBe(400);
    expect(createRes.json().error).toContain('Parent folder must belong to the same workspace');
  });
});
