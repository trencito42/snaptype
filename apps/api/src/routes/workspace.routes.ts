import { FastifyInstance } from 'fastify';
import { IRepository } from '../db/repository.js';
import { AuthService } from '../services/auth.service.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { emailService } from '../services/email.service.js';
import { WorkspaceRole } from '@snaptype/shared';
import crypto from 'node:crypto';

const INVITATION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function workspaceRoutes(app: FastifyInstance, repo: IRepository, authService: AuthService) {
  const requireAuth = createAuthMiddleware(authService);

  // List workspaces for user
  app.get('/api/v1/workspaces', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const workspaces = await repo.findUserWorkspaces(user.id);
    return { workspaces };
  });

  // Create workspace (ST-037)
  app.post('/api/v1/workspaces', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const body = request.body as { name: string };
    if (!body?.name?.trim()) {
      return reply.status(400).send({ error: 'Workspace name is required' });
    }

    const name = body.name.trim();
    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';
    const slug = `${slugBase}-${crypto.randomBytes(3).toString('hex')}`;
    const ws = await repo.createWorkspace(name, slug, user.id, false);
    return reply.status(201).send({ workspace: ws });
  });

  // Get single workspace
  app.get('/api/v1/workspaces/:id', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const member = await repo.findWorkspaceMember(id, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied to workspace' });
    }

    const workspace = await repo.findWorkspaceById(id);
    if (!workspace) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    return { workspace, role: member.role };
  });

  // Get workspace members
  app.get('/api/v1/workspaces/:id/members', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const member = await repo.findWorkspaceMember(id, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied to workspace' });
    }

    const members = await repo.findWorkspaceMembers(id);
    return { members };
  });

  // Add workspace member or send pending invitation (ST-007)
  app.post('/api/v1/workspaces/:id/members', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = request.body as { email: string; role?: 'admin' | 'editor' | 'viewer' };

    const member = await repo.findWorkspaceMember(id, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return reply.status(403).send({ error: 'Owner or admin access required to manage workspace members' });
    }

    if (!body?.email?.trim()) {
      return reply.status(400).send({ error: 'Valid email is required' });
    }

    const targetEmail = body.email.toLowerCase().trim();
    const assignedRole = (body.role || 'editor') as WorkspaceRole;

    // Check if target user is an existing registered user
    const targetUser = await repo.findUserByEmail(targetEmail);
    if (targetUser) {
      // Check if already a member
      const existingMember = await repo.findWorkspaceMember(id, targetUser.id);
      if (existingMember) {
        return reply.status(400).send({ error: 'User is already a member of this workspace' });
      }
    }

    // Issue secure pending invitation (ST-007)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_DURATION_MS);
    const invitation = await repo.createWorkspaceInvitation(id, targetEmail, assignedRole, user.id, token, expiresAt);

    const appUrl = process.env.SNAPTYPE_APP_URL || process.env.APP_URL || 'http://localhost:5173';
    const inviteLink = `${appUrl}/invite?token=${token}`;
    const inviterName = user.name || user.email;
    const workspace = await repo.findWorkspaceById(id);
    const workspaceName = workspace?.name || 'SnapType Workspace';

    try {
      await emailService.sendWorkspaceInvitation(targetEmail, workspaceName, inviterName, inviteLink, assignedRole);
    } catch (emailErr) {
      console.error('[SnapType] Failed to send invitation email:', emailErr);
    }

    return reply.status(201).send({
      invitation,
      inviteLink,
      message: `Invitation issued for ${targetEmail}. Pending acceptance.`
    });
  });

  // Remove workspace member
  app.delete('/api/v1/workspaces/:id/members/:userId', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id, userId } = request.params as { id: string; userId: string };

    const member = await repo.findWorkspaceMember(id, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return reply.status(403).send({ error: 'Owner or admin access required to remove workspace members' });
    }

    const targetMember = await repo.findWorkspaceMember(id, userId);
    if (!targetMember) {
      return reply.status(404).send({ error: 'Member not found in workspace' });
    }

    if (targetMember.role === 'owner') {
      return reply.status(400).send({ error: 'Cannot remove workspace owner' });
    }

    await repo.removeWorkspaceMember(id, userId);
    return { success: true, message: 'Member removed from workspace' };
  });

  // List pending workspace invitations
  app.get('/api/v1/workspaces/:id/invitations', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const member = await repo.findWorkspaceMember(id, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return reply.status(403).send({ error: 'Owner or admin access required to view invitations' });
    }

    const invitations = await repo.findWorkspaceInvitations(id);
    return { invitations };
  });

  // Revoke workspace invitation
  app.delete('/api/v1/workspaces/:id/invitations/:invitationId', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id, invitationId } = request.params as { id: string; invitationId: string };

    const member = await repo.findWorkspaceMember(id, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return reply.status(403).send({ error: 'Owner or admin access required to revoke invitations' });
    }

    await repo.revokeWorkspaceInvitation(id, invitationId);
    return { success: true, message: 'Invitation revoked' };
  });

  // Accept workspace invitation (ST-007)
  app.post('/api/v1/invitations/accept', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const body = request.body as { token: string };

    if (!body?.token?.trim()) {
      return reply.status(400).send({ error: 'Invitation token is required' });
    }

    try {
      const newMember = await repo.acceptWorkspaceInvitation(body.token.trim(), user.id);
      return reply.status(200).send({ success: true, member: newMember });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Inspect invitation details (ST-007 / Blocker 3)
  app.get('/api/v1/invitations/details', async (request, reply) => {
    const query = request.query as { token?: string };
    if (!query?.token?.trim()) {
      return reply.status(400).send({ error: 'Invitation token is required' });
    }

    const inv = await repo.findInvitationByToken(query.token.trim());
    if (!inv) {
      return reply.status(404).send({ error: 'Invitation not found' });
    }
    if (inv.revokedAt) {
      return reply.status(410).send({ error: 'Invitation has been revoked' });
    }
    if (inv.acceptedAt) {
      return reply.status(410).send({ error: 'Invitation has already been accepted' });
    }
    if (new Date(inv.expiresAt) < new Date()) {
      return reply.status(410).send({ error: 'Invitation has expired' });
    }

    const ws = await repo.findWorkspaceById(inv.workspaceId);
    const inviter = await repo.findUserById(inv.invitedById);

    return {
      invitation: {
        id: inv.id,
        workspaceId: inv.workspaceId,
        workspaceName: ws?.name || 'SnapType Workspace',
        inviterName: inviter?.name || inviter?.email || 'A team member',
        email: inv.email,
        role: inv.role,
        expiresAt: inv.expiresAt
      }
    };
  });

  // Reject / decline workspace invitation
  app.post('/api/v1/invitations/reject', async (request, reply) => {
    const body = request.body as { token?: string };
    if (!body?.token?.trim()) {
      return reply.status(400).send({ error: 'Invitation token is required' });
    }

    const inv = await repo.findInvitationByToken(body.token.trim());
    if (!inv) {
      return reply.status(404).send({ error: 'Invitation not found' });
    }

    await repo.revokeWorkspaceInvitation(inv.workspaceId, inv.id);
    return { success: true, message: 'Invitation declined' };
  });
}
