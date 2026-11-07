import { describe, it, expect, beforeAll } from 'vitest';
import { InMemoryRepository } from '../../apps/api/src/db/repository.js';
import { AuthService } from '../../apps/api/src/services/auth.service.js';
import { SnippetService } from '../../apps/api/src/services/snippet.service.js';
import fastify, { FastifyInstance } from 'fastify';
import { snippetRoutes } from '../../apps/api/src/routes/snippet.routes.js';

describe('ST-003 & ST-004: Optimistic Concurrency Control & Atomic Updates', () => {
  let app: FastifyInstance;
  let repo: InMemoryRepository;
  let authService: AuthService;
  let snippetService: SnippetService;

  let userId: string;
  let userToken: string;
  let workspaceId: string;
  let snippetId: string;

  beforeAll(async () => {
    repo = new InMemoryRepository();
    authService = new AuthService(repo);
    snippetService = new SnippetService(repo);

    const user = await repo.createUser('concurrent.author@company.com', 'Author');
    userId = user.id;
    const ws = await repo.createWorkspace('Support Org', 'support-org', userId, true);
    workspaceId = ws.id;

    userToken = await authService.createSessionForUser(userId);

    // Create initial snippet
    const snippet = await snippetService.createSnippet(workspaceId, userId, {
      name: 'Initial Snippet',
      shortcut: 'concurrent_test',
      plainContent: 'Version 1 body'
    });
    snippetId = snippet.id;
    expect(snippet.version).toBe(1);

    // Setup Fastify app
    app = fastify();
    await snippetRoutes(app, repo, authService, snippetService);
    await app.ready();
  });

  it('rejects stale edits with HTTP 409 Conflict (ST-004)', async () => {
    // Session 1 updates snippet from version 1 to 2
    const res1 = await app.inject({
      method: 'PATCH',
      url: `/api/v1/snippets/${snippetId}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        plainContent: 'Updated by Session 1',
        expectedVersion: 1
      }
    });

    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.body);
    expect(body1.snippet.version).toBe(2);
    expect(body1.snippet.plainContent).toBe('Updated by Session 1');

    // Session 2 sends update using stale expectedVersion: 1
    const res2 = await app.inject({
      method: 'PATCH',
      url: `/api/v1/snippets/${snippetId}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        plainContent: 'Updated by Session 2 (Stale)',
        expectedVersion: 1
      }
    });

    expect(res2.statusCode).toBe(409);
    const body2 = JSON.parse(res2.body);
    expect(body2.error).toContain('Conflict: snippet was modified by another session');

    // Session 2 re-fetches latest version and applies update with expectedVersion: 2
    const res3 = await app.inject({
      method: 'PATCH',
      url: `/api/v1/snippets/${snippetId}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        plainContent: 'Resolved edit by Session 2',
        expectedVersion: 2
      }
    });

    expect(res3.statusCode).toBe(200);
    const body3 = JSON.parse(res3.body);
    expect(body3.snippet.version).toBe(3);
    expect(body3.snippet.plainContent).toBe('Resolved edit by Session 2');
  });

  it('atomically tracks revisions and increments workspace sync revision (ST-003)', async () => {
    const revisions = await repo.findSnippetRevisions(snippetId);
    expect(revisions.length).toBe(3); // v1, v2, v3
    expect(revisions[0].version).toBe(3);
    expect(revisions[1].version).toBe(2);
    expect(revisions[2].version).toBe(1);

    const wsRevision = await repo.getWorkspaceRevision(workspaceId);
    expect(wsRevision).toBeGreaterThanOrEqual(3);
  });
});

