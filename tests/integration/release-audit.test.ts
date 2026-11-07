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

import { syncRoutes } from '../../apps/api/src/routes/sync.routes.js';

describe('Release audit: sync full-replace semantics and rollback detection (RB-011)', () => {
  it('marks first sync and revision-ahead (rollback) syncs as fullSync, and never mixes workspaces', async () => {
    const repo = new InMemoryRepository();
    const auth = new AuthService(repo);
    const u = await repo.createUser('sync@example.test', 'S');
    const other = await repo.createUser('other@example.test', 'O');
    const ws = await repo.createWorkspace('W', 'w-sync', u.id, true);
    const foreign = await repo.createWorkspace('F', 'f-sync', other.id, true);
    await repo.createSnippet(ws.id, { name: 'a', shortcut: 'aa', plainContent: 'A', tags: [] } as any, u.id);
    await repo.createSnippet(foreign.id, { name: 'secret', shortcut: 'ss', plainContent: 'S', tags: [] } as any, other.id);
    const token = await auth.createSessionForUser(u.id);
    const app = fastify();
    await syncRoutes(app, repo, auth);
    await app.ready();
    const h = { Authorization: `Bearer ${token}` };

    const first = (await app.inject({ method: 'GET', url: `/api/v1/sync?workspaceId=${ws.id}&lastRevision=0`, headers: h })).json();
    expect(first.fullSync).toBe(true);
    expect(first.snippets.map((s: any) => s.shortcut)).toEqual(['aa']);

    const incremental = (await app.inject({ method: 'GET', url: `/api/v1/sync?workspaceId=${ws.id}&lastRevision=${first.currentRevision}`, headers: h })).json();
    expect(incremental.fullSync).toBe(false);

    const rolledBack = (await app.inject({ method: 'GET', url: `/api/v1/sync?workspaceId=${ws.id}&lastRevision=${first.currentRevision + 500}`, headers: h })).json();
    expect(rolledBack.fullSync).toBe(true);
    expect(rolledBack.snippets.length).toBe(1);

    const denied = await app.inject({ method: 'GET', url: `/api/v1/sync?workspaceId=${foreign.id}&lastRevision=0`, headers: h });
    expect(denied.statusCode).toBe(403);
  });
});

describe('Release audit: import/export fidelity (RB-012)', () => {
  it('round-trips nested folders (children before parents, same names at different levels) and metadata into a clean workspace', async () => {
    const repo = new InMemoryRepository();
    const svc = new SnippetService(repo);
    const u = await repo.createUser('io@example.test', 'IO');
    const src = await repo.createWorkspace('Src', 'src-io', u.id, true);
    const dst = await repo.createWorkspace('Dst', 'dst-io', u.id, false);
    const a = await repo.createFolder(src.id, { name: 'A' });
    const b = await repo.createFolder(src.id, { name: 'B' });
    const aSup = await repo.createFolder(src.id, { name: 'Support', parentId: a.id });
    const bSup = await repo.createFolder(src.id, { name: 'Support', parentId: b.id });
    await repo.createSnippet(src.id, { name: 'Bună ziua', shortcut: '/ziua', plainContent: 'Salut, „lume”, \"x\",\nșțâîă', folderId: aSup.id, isFavorite: true, isEnabled: false, tags: ['t1'], siteRestrictions: { mode: 'allow', domains: ['example.test'] } } as any, u.id);
    await repo.createSnippet(src.id, { name: 'Two', shortcut: '/two', plainContent: '2', folderId: bSup.id, tags: [] } as any, u.id);

    const exported = await svc.exportWorkspace(src.id, u.id);
    // Worst case ordering: children first.
    const folders = [...exported.folders].reverse();
    const result = await svc.importSnippets(dst.id, u.id, { snippets: exported.snippets as any, folders: folders as any, format: 'snaptype_json', conflictStrategy: 'duplicate' } as any);
    expect(result.importedCount).toBe(2);
    expect(result.failedCount).toBe(0);

    const dstFolders = await repo.findFolders(dst.id);
    expect(dstFolders.filter((f) => f.name === 'Support').length).toBe(2);
    const parentNames = dstFolders.filter((f) => f.name === 'Support').map((f) => dstFolders.find((p) => p.id === f.parentId)?.name).sort();
    expect(parentNames).toEqual(['A', 'B']);

    const dstSnips = await repo.findSnippets(dst.id);
    const ziua = dstSnips.find((s) => s.shortcut === '/ziua')!;
    expect(ziua.plainContent).toBe('Salut, „lume”, "x",\nșțâîă');
    expect(ziua.isFavorite).toBe(true);
    expect(ziua.isEnabled).toBe(false);
    expect(ziua.siteRestrictions).toEqual({ mode: 'allow', domains: ['example.test'] });
    expect(dstFolders.find((f) => f.id === ziua.folderId)?.parentId).toBe(dstFolders.find((f) => f.name === 'A')!.id);
  });

  it('reports invalid items as failed instead of aborting or importing unmatchable shortcuts', async () => {
    const repo = new InMemoryRepository();
    const svc = new SnippetService(repo);
    const u = await repo.createUser('bad@example.test', 'B');
    const ws = await repo.createWorkspace('W', 'w-bad', u.id, true);
    const res = await svc.importSnippets(ws.id, u.id, {
      snippets: [
        { name: 'ok', shortcut: '/ok', plainContent: 'ok' },
        { name: 'spaces', shortcut: 'has space', plainContent: 'x' },
        { name: 'ok2', shortcut: '/ok2', plainContent: 'ok2' }
      ], format: 'snaptype_json', conflictStrategy: 'duplicate'
    } as any);
    expect(res.importedCount).toBe(2);
    expect(res.failedCount).toBe(1);
    expect(res.failed[0].shortcut).toBe('has space');
  });
});
