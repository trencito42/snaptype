import { describe, it, expect, beforeAll } from 'vitest';
import fastify, { FastifyInstance } from 'fastify';
import { InMemoryRepository } from '../../apps/api/src/db/repository.js';
import { AuthService } from '../../apps/api/src/services/auth.service.js';
import { SnippetService } from '../../apps/api/src/services/snippet.service.js';
import { snippetRoutes } from '../../apps/api/src/routes/snippet.routes.js';

describe('Release audit: cross-workspace folder references (RB-009)', () => {
  let app: FastifyInstance;
  let repo: InMemoryRepository;
  let token: string;
  let wsA: string;
  let wsB: string;
  let foreignFolder: string;
  let ownFolder: string;

  beforeAll(async () => {
    repo = new InMemoryRepository();
    const auth = new AuthService(repo);
    const alice = await repo.createUser('alice@example.test', 'Alice');
    const bob = await repo.createUser('bob@example.test', 'Bob');
    wsA = (await repo.createWorkspace('A', 'a-ws', alice.id, true)).id;
    wsB = (await repo.createWorkspace('B', 'b-ws', bob.id, true)).id;
    foreignFolder = (await repo.createFolder(wsB, { name: 'Bob private' })).id;
    ownFolder = (await repo.createFolder(wsA, { name: 'Mine' })).id;
    token = await auth.createSessionForUser(alice.id);
    app = fastify();
    await snippetRoutes(app, repo, auth, new SnippetService(repo));
    await app.ready();
  });

  const headers = () => ({ Authorization: `Bearer ${token}` });

  it('rejects creating a snippet inside another workspace\'s folder', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/snippets', headers: headers(),
      payload: { workspaceId: wsA, name: 'x', shortcut: 'xx1', plainContent: 'hi', folderId: foreignFolder } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Folder not found');
  });

  it('rejects moving a snippet into another workspace\'s folder', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/v1/snippets', headers: headers(),
      payload: { workspaceId: wsA, name: 'y', shortcut: 'yy1', plainContent: 'hi', folderId: ownFolder } });
    expect(created.statusCode).toBe(201);
    const id = created.json().snippet.id;
    const res = await app.inject({ method: 'PATCH', url: `/api/v1/snippets/${id}`, headers: headers(),
      payload: { folderId: foreignFolder } });
    expect(res.statusCode).toBe(400);
    const after = await repo.findSnippetById(id);
    expect(after?.folderId).toBe(ownFolder);
  });

  it('still allows moving to a folder of the same workspace and to root', async () => {
    const other = (await repo.createFolder(wsA, { name: 'Other' })).id;
    const created = await app.inject({ method: 'POST', url: '/api/v1/snippets', headers: headers(),
      payload: { workspaceId: wsA, name: 'z', shortcut: 'zz1', plainContent: 'hi' } });
    const id = created.json().snippet.id;
    const moved = await app.inject({ method: 'PATCH', url: `/api/v1/snippets/${id}`, headers: headers(), payload: { folderId: other } });
    expect(moved.statusCode).toBe(200);
    const root = await app.inject({ method: 'PATCH', url: `/api/v1/snippets/${id}`, headers: headers(), payload: { folderId: null } });
    expect(root.statusCode).toBe(200);
  });
});

describe('Release audit: OTP delivery failure does not lock the user out (RB-010)', () => {
  it('allows an immediate retry after SMTP failure', async () => {
    const repo = new InMemoryRepository();
    const auth = new AuthService(repo);
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // unconfigured SMTP in production => delivery fails
    try {
      const first = await auth.requestOTP('lockout@example.test');
      expect(first.success).toBe(false);
      expect(first.cooldownRemaining).toBeUndefined();
      const second = await auth.requestOTP('lockout@example.test');
      expect(second.cooldownRemaining).toBeUndefined();
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });
});
