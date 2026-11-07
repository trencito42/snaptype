import { describe, it, expect, beforeAll } from 'vitest';
import { InMemoryRepository } from '../../apps/api/src/db/repository.js';
import { AuthService } from '../../apps/api/src/services/auth.service.js';
import fastify, { FastifyInstance } from 'fastify';
import { userRoutes } from '../../apps/api/src/routes/user.routes.js';
import { workspaceRoutes } from '../../apps/api/src/routes/workspace.routes.js';

describe('ST-003 / Release Blocker 7: Account Deletion, Ownership & Data Preservation', () => {
  let app: FastifyInstance;
  let repo: InMemoryRepository;
  let authService: AuthService;

  beforeAll(async () => {
    repo = new InMemoryRepository();
    authService = new AuthService(repo);

    app = fastify();
    await userRoutes(app, repo, authService);
    await workspaceRoutes(app, repo, authService);
    await app.ready();
  });

  it('blocks deletion of an account that owns a shared workspace with active members', async () => {
    // 1. Create owner and shared workspace
    const owner = await repo.createUser('team.lead@company.com', 'Team Lead');
    const ownerToken = await authService.createSessionForUser(owner.id);
    const sharedWs = await repo.createWorkspace('Support Team', 'support-team', owner.id, false);

    // 2. Add a teammate to the shared workspace
    const teammate = await repo.createUser('agent1@company.com', 'Agent One');
    await repo.addWorkspaceMember(sharedWs.id, teammate.id, 'editor');

    // 3. Attempt to delete owner account
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${ownerToken}` }
    });

    expect(deleteRes.statusCode).toBe(400);
    const body = JSON.parse(deleteRes.body);
    expect(body.error).toContain('Cannot delete account: you are the owner of shared workspace');
    expect(body.error).toContain('Support Team');

    // Verify owner account is NOT deleted
    const ownerStillExists = await repo.findUserById(owner.id);
    expect(ownerStillExists).not.toBeNull();
  });

  it('allows a non-owner member to delete their account without deleting the shared workspace', async () => {
    // 1. Create owner and shared workspace
    const owner = await repo.createUser('founder@company.com', 'Founder');
    const sharedWs = await repo.createWorkspace('Company Org', 'company-org', owner.id, false);

    // 2. Add a regular member
    const member = await repo.createUser('departing.member@company.com', 'Departing Member');
    const memberToken = await authService.createSessionForUser(member.id);
    await repo.addWorkspaceMember(sharedWs.id, member.id, 'editor');

    // Verify member exists in workspace
    const beforeMember = await repo.findWorkspaceMember(sharedWs.id, member.id);
    expect(beforeMember).not.toBeNull();

    // 3. Member deletes their account
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${memberToken}` }
    });

    expect(deleteRes.statusCode).toBe(200);

    // 4. Verify member is removed from workspace and deleted
    const afterUser = await repo.findUserById(member.id);
    expect(afterUser).toBeNull();

    const afterMember = await repo.findWorkspaceMember(sharedWs.id, member.id);
    expect(afterMember).toBeNull();

    // 5. Shared workspace and owner remain completely intact
    const wsStillExists = await repo.findWorkspaceById(sharedWs.id);
    expect(wsStillExists).not.toBeNull();
    const ownerStillMember = await repo.findWorkspaceMember(sharedWs.id, owner.id);
    expect(ownerStillMember).not.toBeNull();
  });

  it('allows a personal workspace owner to delete account and clean up personal data', async () => {
    // 1. Create user with personal workspace only
    const user = await repo.createUser('solo.user@company.com', 'Solo User');
    const userToken = await authService.createSessionForUser(user.id);
    const personalWs = await repo.createWorkspace('Solo Personal', 'solo-personal', user.id, true);

    // Create snippet inside personal workspace
    await repo.createSnippet(personalWs.id, {
      name: 'Solo Snippet',
      shortcut: 'solo',
      plainContent: 'Solo Content'
    });

    // 2. Delete solo account
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${userToken}` }
    });

    expect(deleteRes.statusCode).toBe(200);

    // 3. User is deleted
    const deletedUser = await repo.findUserById(user.id);
    expect(deletedUser).toBeNull();
  });
});

