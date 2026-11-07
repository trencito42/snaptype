import { describe, it, expect, beforeAll } from 'vitest';
import { InMemoryRepository } from '../../apps/api/src/db/repository.js';
import { AuthService } from '../../apps/api/src/services/auth.service.js';
import fastify, { FastifyInstance } from 'fastify';
import { workspaceRoutes } from '../../apps/api/src/routes/workspace.routes.js';

describe('ST-007: Real Workspace Invitation Lifecycle & Token Verification', () => {
  let app: FastifyInstance;
  let repo: InMemoryRepository;
  let authService: AuthService;

  let ownerId: string;
  let ownerToken: string;
  let workspaceId: string;

  beforeAll(async () => {
    repo = new InMemoryRepository();
    authService = new AuthService(repo);

    const owner = await repo.createUser('org.owner@company.com', 'Org Owner');
    ownerId = owner.id;
    const ws = await repo.createWorkspace('Engineering', 'engineering-org', ownerId, true);
    workspaceId = ws.id;

    ownerToken = await authService.createSessionForUser(ownerId);

    app = fastify();
    await workspaceRoutes(app, repo, authService);
    await app.ready();
  });

  it('generates secure pending invitation without creating phantom users (ST-007)', async () => {
    const inviteeEmail = 'future.employee@company.com';

    // Verify user does NOT exist before invitation
    const beforeUser = await repo.findUserByEmail(inviteeEmail);
    expect(beforeUser).toBeNull();

    // Owner issues invitation
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        email: inviteeEmail,
        role: 'editor'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.invitation).toBeDefined();
    expect(body.invitation.email).toBe(inviteeEmail);
    expect(body.invitation.role).toBe('editor');
    expect(body.invitation.token).toHaveLength(64); // 32-byte hex

    // Verify no phantom user was created in users table
    const afterUser = await repo.findUserByEmail(inviteeEmail);
    expect(afterUser).toBeNull();
  });

  it('rejects unauthorized invitation attempts by non-admins', async () => {
    // Create viewer
    const viewer = await repo.createUser('viewer@company.com', 'Viewer');
    const viewerToken = await authService.createSessionForUser(viewer.id);
    await repo.addWorkspaceMember(workspaceId, viewer.id, 'viewer');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { email: 'unauthorized.invitee@company.com' }
    });

    expect(res.statusCode).toBe(403);
  });

  it('allows invited user to accept invitation with their verified email', async () => {
    const invitedEmail = 'new.joiner@company.com';
    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { email: invitedEmail, role: 'editor' }
    });

    const token = JSON.parse(inviteRes.body).invitation.token;

    // Invitee registers / verifies email
    const newUser = await repo.createUser(invitedEmail, 'New Joiner');
    const userToken = await authService.createSessionForUser(newUser.id);

    // Accept invitation
    const acceptRes = await app.inject({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { token }
    });

    expect(acceptRes.statusCode).toBe(200);
    const acceptBody = JSON.parse(acceptRes.body);
    expect(acceptBody.success).toBe(true);
    expect(acceptBody.member.role).toBe('editor');

    // Confirm membership
    const member = await repo.findWorkspaceMember(workspaceId, newUser.id);
    expect(member).not.toBeNull();
    expect(member?.role).toBe('editor');

    // Replay attack: accepting again fails
    const replayRes = await app.inject({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { token }
    });
    expect(replayRes.statusCode).toBe(400);
    expect(JSON.parse(replayRes.body).error).toContain('already been accepted');
  });

  it('prevents another user from claiming an invitation meant for someone else', async () => {
    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { email: 'alice@company.com', role: 'editor' }
    });

    const token = JSON.parse(inviteRes.body).invitation.token;

    // Bob tries to accept Alice's token
    const bob = await repo.createUser('bob@company.com', 'Bob');
    const bobToken = await authService.createSessionForUser(bob.id);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      headers: { authorization: `Bearer ${bobToken}` },
      payload: { token }
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('sent to a different email');
  });

  it('stores SHA-256 token hash and prevents cross-workspace revocation', async () => {
    // Create second workspace
    const ws2 = await repo.createWorkspace('Marketing', 'marketing-org', ownerId, false);

    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { email: 'charlie@company.com', role: 'editor' }
    });

    const inv = JSON.parse(inviteRes.body).invitation;
    expect(inv.token).toBeDefined();

    // Verify stored invitation in repository uses tokenHash
    const stored = await repo.findInvitationByToken(inv.token);
    expect(stored).not.toBeNull();
    expect(stored?.tokenHash).toBeDefined();
    expect(stored?.tokenHash?.length).toBe(64); // SHA-256 hex string

    // Try to revokeCharlie's invitation using the wrong workspace ID
    const wrongWsRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${ws2.id}/invitations/${inv.id}`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(wrongWsRes.statusCode).toBe(200);

    // Charlie's invitation in workspaceId must NOT be revoked!
    const stillActive = await repo.findInvitationByToken(inv.token);
    expect(stillActive?.revokedAt).toBeNull();

    // Revoke with correct workspace ID
    const correctWsRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${workspaceId}/invitations/${inv.id}`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(correctWsRes.statusCode).toBe(200);

    const nowRevoked = await repo.findInvitationByToken(inv.token);
    expect(nowRevoked?.revokedAt).not.toBeNull();
  });
});

