import { describe, it, expect, beforeAll } from 'vitest';
import fastify, { FastifyInstance } from 'fastify';
import { InMemoryRepository } from '../../apps/api/src/db/repository.js';
import { AuthService } from '../../apps/api/src/services/auth.service.js';
import { workspaceRoutes } from '../../apps/api/src/routes/workspace.routes.js';

// Server-side membership permission matrix (RB-013).
describe('Workspace membership permissions', () => {
  let app: FastifyInstance; let repo: InMemoryRepository; let ws: string;
  const tok: Record<string, string> = {}; const uid: Record<string, string> = {};

  beforeAll(async () => {
    repo = new InMemoryRepository();
    const auth = new AuthService(repo);
    const w = await repo.createUser('owner@x.test', 'Owner');
    ws = (await repo.createWorkspace('Team', 'team-pm', w.id, false)).id;
    uid.owner = w.id;
    for (const role of ['admin', 'admin2', 'editor', 'viewer'] as const) {
      const u = await repo.createUser(`${role}@x.test`, role);
      uid[role] = u.id;
      await repo.addWorkspaceMember(ws, u.id, role === 'admin2' ? 'admin' : role);
    }
    for (const k of Object.keys(uid)) tok[k] = await auth.createSessionForUser(uid[k]);
    app = fastify();
    await workspaceRoutes(app, repo, auth);
    await app.ready();
  });

  const invite = (who: string, payload: object) => app.inject({ method: 'POST', url: `/api/v1/workspaces/${ws}/members`, headers: { authorization: `Bearer ${tok[who]}` }, payload });
  const remove = (who: string, target: string) => app.inject({ method: 'DELETE', url: `/api/v1/workspaces/${ws}/members/${uid[target]}`, headers: { authorization: `Bearer ${tok[who]}` } });

  it('never allows inviting as owner or with an unknown role (privilege escalation)', async () => {
    for (const who of ['owner', 'admin']) {
      for (const role of ['owner', 'superuser', '', 5]) {
        const res = await invite(who, { email: 'new@x.test', role });
        expect(res.statusCode, `${who} -> ${String(role)}`).toBe(400);
      }
    }
  });

  it('only the owner may invite administrators; admins may invite editors/viewers', async () => {
    expect((await invite('admin', { email: 'a1@x.test', role: 'admin' })).statusCode).toBe(403);
    expect((await invite('owner', { email: 'a2@x.test', role: 'admin' })).statusCode).toBe(201);
    expect((await invite('admin', { email: 'e1@x.test', role: 'editor' })).statusCode).toBe(201);
    expect((await invite('admin', { email: 'v1@x.test', role: 'viewer' })).statusCode).toBe(201);
  });

  it('editors and viewers cannot invite', async () => {
    expect((await invite('editor', { email: 'z@x.test', role: 'viewer' })).statusCode).toBe(403);
    expect((await invite('viewer', { email: 'z@x.test', role: 'viewer' })).statusCode).toBe(403);
  });

  it('a new invitation supersedes the previous pending one for the same address', async () => {
    await invite('owner', { email: 'dup@x.test', role: 'viewer' });
    await invite('owner', { email: 'dup@x.test', role: 'editor' });
    const pending = (await repo.findWorkspaceInvitations(ws)).filter((i) => i.email === 'dup@x.test' && !i.revokedAt && !i.acceptedAt);
    expect(pending.length).toBe(1);
    expect(pending[0].role).toBe('editor');
  });

  it('admins cannot remove admins or the owner; owner can remove admins; non-admins cannot remove others', async () => {
    expect((await remove('admin', 'admin2')).statusCode).toBe(403);
    expect((await remove('admin', 'owner')).statusCode).toBe(400);
    expect((await remove('editor', 'viewer')).statusCode).toBe(403);
    expect((await remove('owner', 'admin2')).statusCode).toBe(200);
  });

  it('members can leave on their own; the owner cannot leave', async () => {
    expect((await remove('viewer', 'viewer')).statusCode).toBe(200);
    expect(await repo.findWorkspaceMember(ws, uid.viewer)).toBeNull();
    expect((await remove('owner', 'owner')).statusCode).toBe(400);
  });

  it('a removed member loses access immediately (stale authorization)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/workspaces/${ws}/members`, headers: { authorization: `Bearer ${tok.viewer}` } });
    expect(res.statusCode).toBe(403);
  });

  it('rejects inviting an existing member, and acceptance by a different account', async () => {
    expect((await invite('owner', { email: 'editor@x.test', role: 'viewer' })).statusCode).toBe(400);

    const res = await invite('owner', { email: 'right.person@x.test', role: 'editor' });
    const token = new URL(res.json().inviteLink).searchParams.get('token')!;
    const accept = (who: string) => app.inject({ method: 'POST', url: '/api/v1/invitations/accept', headers: { authorization: `Bearer ${tok[who]}` }, payload: { token } });

    const wrong = await accept('editor');
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error).toContain('different email');

    const right = await repo.createUser('right.person@x.test', 'R');
    const rightTok = await new AuthService(repo).createSessionForUser(right.id);
    tok.right = rightTok;
    const ok = await accept('right');
    expect(ok.statusCode).toBe(200);
    expect((await repo.findWorkspaceMember(ws, right.id))?.role).toBe('editor');
    expect((await accept('right')).statusCode).toBe(400); // replay
  });
});

import { userRoutes } from '../../apps/api/src/routes/user.routes.js';

describe('Ownership transfer and account deletion (RB-020)', () => {
  it('owner can transfer ownership, then delete their account without destroying the shared workspace', async () => {
    const repo = new InMemoryRepository();
    const auth = new AuthService(repo);
    const owner = await repo.createUser('boss@x.test', 'Boss');
    const mate = await repo.createUser('mate@x.test', 'Mate');
    const outsider = await repo.createUser('out@x.test', 'Out');
    const ws = await repo.createWorkspace('Shared', 'shared-own', owner.id, false);
    await repo.addWorkspaceMember(ws.id, mate.id, 'editor');
    await repo.createSnippet(ws.id, { name: 's', shortcut: 'ss', plainContent: 'x', tags: [] } as any, owner.id);
    const oTok = await auth.createSessionForUser(owner.id);
    const mTok = await auth.createSessionForUser(mate.id);
    const xTok = await auth.createSessionForUser(outsider.id);
    const app = fastify();
    await workspaceRoutes(app, repo, auth);
    await userRoutes(app, repo, auth);
    await app.ready();
    const post = (tok: string, userId: string) => app.inject({ method: 'POST', url: `/api/v1/workspaces/${ws.id}/transfer-ownership`, headers: { authorization: `Bearer ${tok}` }, payload: { userId } });

    // Blocked while the owner still has other members
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/me', headers: { authorization: `Bearer ${oTok}` } })).statusCode).toBe(400);

    expect((await post(mTok, mate.id)).statusCode).toBe(403);        // non-owner cannot
    expect((await post(xTok, outsider.id)).statusCode).toBe(403);    // outsider cannot
    expect((await post(oTok, outsider.id)).statusCode).toBe(400);    // target must be a member
    expect((await post(oTok, owner.id)).statusCode).toBe(400);       // self
    expect((await post(oTok, mate.id)).statusCode).toBe(200);

    expect((await repo.findWorkspaceMember(ws.id, mate.id))?.role).toBe('owner');
    expect((await repo.findWorkspaceMember(ws.id, owner.id))?.role).toBe('admin');
    expect((await repo.findWorkspaceById(ws.id))?.ownerId).toBe(mate.id);
    expect((await post(oTok, mate.id)).statusCode).toBe(403);        // former owner lost the right

    // Former owner (now admin) may leave/delete; the workspace and its data survive
    await repo.removeWorkspaceMember(ws.id, owner.id);
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/me', headers: { authorization: `Bearer ${oTok}` } })).statusCode).toBe(200);
    expect(await repo.findWorkspaceById(ws.id)).not.toBeNull();
    expect((await repo.findSnippets(ws.id)).length).toBe(1);
  });
});

import { escapeHtml } from '../../apps/api/src/services/email.service.js';

describe('Invitation email HTML escaping (RB-025)', () => {
  it('neutralises markup in workspace and inviter names', () => {
    const evil = '<a href="https://evil.test">Click</a> & "x"';
    const out = escapeHtml(evil);
    expect(out).not.toContain('<a');
    expect(out).toBe('&lt;a href=&quot;https://evil.test&quot;&gt;Click&lt;/a&gt; &amp; &quot;x&quot;');
  });
});
