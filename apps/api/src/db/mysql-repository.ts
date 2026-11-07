import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema.js';
import { IRepository, InMemoryRepository } from './repository.js';
import { eq, and, sql, isNull, inArray, gt, or, like } from 'drizzle-orm';
import { User, Workspace, WorkspaceMember, WorkspaceInvitation, Folder, Snippet, SnippetRevision, UserPreferences, WorkspaceRole, DEFAULT_PREFERENCES, DataTable, DataTableColumn, DataTableRow } from '@snaptype/shared';
import crypto from 'node:crypto';
const uuidv4 = () => crypto.randomUUID();

export class MySQLRepository implements IRepository {
  constructor(private db: MySql2Database<typeof schema>) {}

  async findUserByEmail(email: string): Promise<User | null> {
    const rows = await this.db.select().from(schema.usersTable).where(eq(schema.usersTable.email, email.toLowerCase().trim())).limit(1);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      email: rows[0].email,
      name: rows[0].name,
      createdAt: rows[0].createdAt.toISOString(),
      updatedAt: rows[0].updatedAt.toISOString()
    };
  }

  async findUserById(id: string): Promise<User | null> {
    const rows = await this.db.select().from(schema.usersTable).where(eq(schema.usersTable.id, id)).limit(1);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      email: rows[0].email,
      name: rows[0].name,
      createdAt: rows[0].createdAt.toISOString(),
      updatedAt: rows[0].updatedAt.toISOString()
    };
  }

  async createUser(email: string, name?: string | null): Promise<User> {
    const id = uuidv4();
    const now = new Date();
    await this.db.insert(schema.usersTable).values({
      id,
      email: email.toLowerCase().trim(),
      name: name || null,
      createdAt: now,
      updatedAt: now
    });
    return {
      id,
      email: email.toLowerCase().trim(),
      name: name || null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
  }

  async updateUser(id: string, data: { name?: string | null }): Promise<User> {
    const now = new Date();
    await this.db.update(schema.usersTable).set({ name: data.name, updatedAt: now }).where(eq(schema.usersTable.id, id));
    const user = await this.findUserById(id);
    if (!user) throw new Error('User not found');
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await this.db.delete(schema.usersTable).where(eq(schema.usersTable.id, id));
  }

  async createEmailChallenge(email: string, hashedCode: string, expiresAt: Date) {
    const id = uuidv4();
    const now = new Date();
    await this.db.insert(schema.emailChallengesTable).values({
      id,
      email: email.toLowerCase().trim(),
      hashedCode,
      attempts: 0,
      expiresAt,
      verifiedAt: null,
      createdAt: now
    });
    return {
      id,
      email: email.toLowerCase().trim(),
      hashedCode,
      attempts: 0,
      expiresAt,
      verifiedAt: null,
      createdAt: now
    };
  }

  async findLatestChallenge(email: string) {
    const rows = await this.db.select().from(schema.emailChallengesTable)
      .where(eq(schema.emailChallengesTable.email, email.toLowerCase().trim()))
      .orderBy(sql`${schema.emailChallengesTable.createdAt} desc`)
      .limit(1);
    if (!rows[0]) return null;
    return {
      ...rows[0],
      createdAt: rows[0].createdAt
    };
  }

  async incrementChallengeAttempts(id: string): Promise<void> {
    await this.db.update(schema.emailChallengesTable)
      .set({ attempts: sql`${schema.emailChallengesTable.attempts} + 1` })
      .where(eq(schema.emailChallengesTable.id, id));
  }

  async markChallengeVerified(id: string): Promise<boolean> {
    const res = await this.db.update(schema.emailChallengesTable)
      .set({ verifiedAt: new Date() })
      .where(and(eq(schema.emailChallengesTable.id, id), isNull(schema.emailChallengesTable.verifiedAt)));
    return ((res as any)?.[0]?.affectedRows ?? (res as any)?.affectedRows ?? 0) > 0;
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date, userAgent?: string | null, ipAddress?: string | null) {
    const id = uuidv4();
    const now = new Date();
    await this.db.insert(schema.sessionsTable).values({
      id,
      userId,
      tokenHash,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
      expiresAt,
      createdAt: now
    });
    return { id, userId, tokenHash, userAgent, ipAddress, expiresAt, createdAt: now };
  }

  async findSessionByTokenHash(tokenHash: string) {
    const rows = await this.db.select().from(schema.sessionsTable).where(eq(schema.sessionsTable.tokenHash, tokenHash)).limit(1);
    if (!rows[0]) return null;
    if (rows[0].expiresAt.getTime() < Date.now()) {
      await this.deleteSession(rows[0].id);
      return null;
    }
    return rows[0];
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.delete(schema.sessionsTable).where(eq(schema.sessionsTable.id, id));
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db.delete(schema.sessionsTable).where(eq(schema.sessionsTable.userId, userId));
  }

  async createWorkspace(name: string, slug: string, ownerId: string, isPersonal: boolean): Promise<Workspace> {
    const id = uuidv4();
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.workspacesTable).values({
        id,
        name,
        slug,
        ownerId,
        isPersonal,
        createdAt: now,
        updatedAt: now
      });
      await tx.insert(schema.workspaceRevisionsTable).values({
        workspaceId: id,
        currentRevision: 1,
        updatedAt: now
      });
      await tx.insert(schema.workspaceMembersTable).values({
        id: uuidv4(),
        workspaceId: id,
        userId: ownerId,
        role: 'owner',
        createdAt: now
      });
    });
    return {
      id,
      name,
      slug,
      ownerId,
      isPersonal,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
  }

  async findUserWorkspaces(userId: string): Promise<{ workspace: Workspace; role: WorkspaceRole }[]> {
    const rows = await this.db.select({
      workspace: schema.workspacesTable,
      role: schema.workspaceMembersTable.role
    })
      .from(schema.workspaceMembersTable)
      .innerJoin(schema.workspacesTable, eq(schema.workspaceMembersTable.workspaceId, schema.workspacesTable.id))
      .where(eq(schema.workspaceMembersTable.userId, userId));

    return rows.map((r) => ({
      workspace: {
        id: r.workspace.id,
        name: r.workspace.name,
        slug: r.workspace.slug,
        ownerId: r.workspace.ownerId,
        isPersonal: r.workspace.isPersonal,
        createdAt: r.workspace.createdAt.toISOString(),
        updatedAt: r.workspace.updatedAt.toISOString()
      },
      role: r.role as WorkspaceRole
    }));
  }

  async findWorkspaceById(id: string): Promise<Workspace | null> {
    const rows = await this.db.select().from(schema.workspacesTable).where(eq(schema.workspacesTable.id, id)).limit(1);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      name: rows[0].name,
      slug: rows[0].slug,
      ownerId: rows[0].ownerId,
      isPersonal: rows[0].isPersonal,
      createdAt: rows[0].createdAt.toISOString(),
      updatedAt: rows[0].updatedAt.toISOString()
    };
  }

  async findWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    const rows = await this.db.select().from(schema.workspaceMembersTable)
      .where(and(eq(schema.workspaceMembersTable.workspaceId, workspaceId), eq(schema.workspaceMembersTable.userId, userId)))
      .limit(1);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      workspaceId: rows[0].workspaceId,
      userId: rows[0].userId,
      role: rows[0].role as WorkspaceRole,
      createdAt: rows[0].createdAt.toISOString()
    };
  }

  async findWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const rows = await this.db.select({
      member: schema.workspaceMembersTable,
      user: schema.usersTable
    })
      .from(schema.workspaceMembersTable)
      .innerJoin(schema.usersTable, eq(schema.workspaceMembersTable.userId, schema.usersTable.id))
      .where(eq(schema.workspaceMembersTable.workspaceId, workspaceId));

    return rows.map((r) => ({
      id: r.member.id,
      workspaceId: r.member.workspaceId,
      userId: r.member.userId,
      role: r.member.role as WorkspaceRole,
      createdAt: r.member.createdAt.toISOString(),
      user: {
        id: r.user.id,
        email: r.user.email,
        name: r.user.name
      }
    }));
  }

  async addWorkspaceMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember> {
    const id = uuidv4();
    const now = new Date();
    await this.db.insert(schema.workspaceMembersTable).values({
      id,
      workspaceId,
      userId,
      role,
      createdAt: now
    });
    return {
      id,
      workspaceId,
      userId,
      role,
      createdAt: now.toISOString()
    };
  }

  async removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
    await this.db.delete(schema.workspaceMembersTable)
      .where(and(eq(schema.workspaceMembersTable.workspaceId, workspaceId), eq(schema.workspaceMembersTable.userId, userId)));
  }

  async createWorkspaceInvitation(
    workspaceId: string,
    email: string,
    role: WorkspaceRole,
    invitedById: string,
    token: string,
    expiresAt: Date
  ): Promise<WorkspaceInvitation> {
    const id = uuidv4();
    const now = new Date();
    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    await this.db.insert(schema.workspaceInvitationsTable).values({
      id,
      workspaceId,
      email: email.toLowerCase().trim(),
      role,
      tokenHash,
      invitedById,
      expiresAt,
      createdAt: now
    });
    return {
      id,
      workspaceId,
      email: email.toLowerCase().trim(),
      role,
      token,
      tokenHash,
      invitedById,
      expiresAt: expiresAt.toISOString(),
      acceptedAt: null,
      revokedAt: null,
      createdAt: now.toISOString()
    };
  }

  async findInvitationByToken(token: string): Promise<WorkspaceInvitation | null> {
    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const rows = await this.db.select().from(schema.workspaceInvitationsTable).where(eq(schema.workspaceInvitationsTable.tokenHash, tokenHash)).limit(1);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      email: r.email,
      role: r.role as WorkspaceRole,
      tokenHash: r.tokenHash,
      invitedById: r.invitedById,
      expiresAt: r.expiresAt.toISOString(),
      acceptedAt: r.acceptedAt?.toISOString() || null,
      revokedAt: r.revokedAt?.toISOString() || null,
      createdAt: r.createdAt.toISOString()
    };
  }

  async findWorkspaceInvitationById(workspaceId: string, id: string): Promise<WorkspaceInvitation | null> {
    const rows = await this.db.select().from(schema.workspaceInvitationsTable)
      .where(and(eq(schema.workspaceInvitationsTable.id, id), eq(schema.workspaceInvitationsTable.workspaceId, workspaceId)))
      .limit(1);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      email: r.email,
      role: r.role as WorkspaceRole,
      tokenHash: r.tokenHash,
      invitedById: r.invitedById,
      expiresAt: r.expiresAt.toISOString(),
      acceptedAt: r.acceptedAt?.toISOString() || null,
      revokedAt: r.revokedAt?.toISOString() || null,
      createdAt: r.createdAt.toISOString()
    };
  }

  async updateWorkspaceInvitationToken(id: string, token: string, expiresAt: Date): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    await this.db.update(schema.workspaceInvitationsTable)
      .set({
        tokenHash,
        expiresAt
      })
      .where(eq(schema.workspaceInvitationsTable.id, id));
  }

  async findWorkspaceInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const now = new Date();
    const rows = await this.db.select().from(schema.workspaceInvitationsTable)
      .where(and(
        eq(schema.workspaceInvitationsTable.workspaceId, workspaceId),
        isNull(schema.workspaceInvitationsTable.acceptedAt),
        isNull(schema.workspaceInvitationsTable.revokedAt),
        gt(schema.workspaceInvitationsTable.expiresAt, now)
      ));
    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      email: r.email,
      role: r.role as WorkspaceRole,
      tokenHash: r.tokenHash,
      invitedById: r.invitedById,
      expiresAt: r.expiresAt.toISOString(),
      acceptedAt: r.acceptedAt?.toISOString() || null,
      revokedAt: r.revokedAt?.toISOString() || null,
      createdAt: r.createdAt.toISOString()
    }));
  }

  async revokeWorkspaceInvitation(workspaceId: string, id: string): Promise<void> {
    await this.db.update(schema.workspaceInvitationsTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.workspaceInvitationsTable.id, id), eq(schema.workspaceInvitationsTable.workspaceId, workspaceId)));
  }

  async acceptWorkspaceInvitation(token: string, userId: string): Promise<WorkspaceMember> {
    const inv = await this.findInvitationByToken(token);
    if (!inv) throw new Error('Invitation not found');
    if (inv.revokedAt) throw new Error('Invitation has been revoked');
    if (inv.acceptedAt) throw new Error('Invitation has already been accepted');
    if (new Date(inv.expiresAt) < new Date()) throw new Error('Invitation has expired');

    const user = await this.findUserById(userId);
    if (!user) throw new Error('User not found');
    if (user.email.toLowerCase().trim() !== inv.email.toLowerCase().trim()) {
      throw new Error('This invitation was sent to a different email address');
    }

    return await this.db.transaction(async (tx) => {
      await tx.update(schema.workspaceInvitationsTable)
        .set({ acceptedAt: new Date() })
        .where(eq(schema.workspaceInvitationsTable.id, inv.id));

      const memberId = uuidv4();
      const now = new Date();
      await tx.insert(schema.workspaceMembersTable).values({
        id: memberId,
        workspaceId: inv.workspaceId,
        userId,
        role: inv.role,
        createdAt: now
      });

      return {
        id: memberId,
        workspaceId: inv.workspaceId,
        userId,
        role: inv.role,
        createdAt: now.toISOString(),
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      };
    });
  }

  async findFolders(workspaceId: string): Promise<Folder[]> {
    const rows = await this.db.select().from(schema.foldersTable)
      .where(and(eq(schema.foldersTable.workspaceId, workspaceId), isNull(schema.foldersTable.deletedAt)));

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      parentId: r.parentId,
      name: r.name,
      color: r.color,
      icon: r.icon,
      isFavorite: r.isFavorite,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    }));
  }

  async findFolderById(id: string): Promise<Folder | null> {
    const rows = await this.db.select().from(schema.foldersTable)
      .where(and(eq(schema.foldersTable.id, id), isNull(schema.foldersTable.deletedAt))).limit(1);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      workspaceId: rows[0].workspaceId,
      parentId: rows[0].parentId,
      name: rows[0].name,
      color: rows[0].color,
      icon: rows[0].icon,
      isFavorite: rows[0].isFavorite,
      sortOrder: rows[0].sortOrder,
      createdAt: rows[0].createdAt.toISOString(),
      updatedAt: rows[0].updatedAt.toISOString()
    };
  }

  private async bumpWorkspaceRevisionTx(tx: any, workspaceId: string): Promise<number> {
    const now = new Date();
    await tx.insert(schema.workspaceRevisionsTable).values({
      workspaceId,
      currentRevision: 1,
      updatedAt: now
    }).onDuplicateKeyUpdate({
      set: {
        currentRevision: sql`${schema.workspaceRevisionsTable.currentRevision} + 1`,
        updatedAt: now
      }
    });

    const rows = await tx.select().from(schema.workspaceRevisionsTable).where(eq(schema.workspaceRevisionsTable.workspaceId, workspaceId)).limit(1);
    return rows[0]?.currentRevision ?? 1;
  }

  async createFolder(workspaceId: string, data: Partial<Folder>): Promise<Folder> {
    return await this.db.transaction(async (tx) => {
      const id = uuidv4();
      const now = new Date();
      const newRev = await this.bumpWorkspaceRevisionTx(tx, workspaceId);
      await tx.insert(schema.foldersTable).values({
        id,
        workspaceId,
        parentId: data.parentId || null,
        name: data.name || 'Untitled Folder',
        color: data.color || null,
        icon: data.icon || null,
        isFavorite: Boolean(data.isFavorite),
        sortOrder: data.sortOrder || 0,
        revision: newRev,
        createdAt: now,
        updatedAt: now
      });
      return {
        id,
        workspaceId,
        parentId: data.parentId || null,
        name: data.name || 'Untitled Folder',
        color: data.color || null,
        icon: data.icon || null,
        isFavorite: Boolean(data.isFavorite),
        sortOrder: data.sortOrder || 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
    });
  }

  async updateFolder(id: string, data: Partial<Folder>): Promise<Folder> {
    return await this.db.transaction(async (tx) => {
      const rows = await tx.select().from(schema.foldersTable).where(and(eq(schema.foldersTable.id, id), isNull(schema.foldersTable.deletedAt))).limit(1);
      if (!rows[0]) throw new Error('Folder not found');
      const existing = rows[0];

      const now = new Date();
      const newRev = await this.bumpWorkspaceRevisionTx(tx, existing.workspaceId);
      await tx.update(schema.foldersTable).set({
        name: data.name !== undefined ? data.name : existing.name,
        parentId: data.parentId !== undefined ? data.parentId : existing.parentId,
        color: data.color !== undefined ? data.color : existing.color,
        icon: data.icon !== undefined ? data.icon : existing.icon,
        isFavorite: data.isFavorite !== undefined ? Boolean(data.isFavorite) : existing.isFavorite,
        sortOrder: data.sortOrder !== undefined ? data.sortOrder : existing.sortOrder,
        revision: newRev,
        updatedAt: now
      }).where(eq(schema.foldersTable.id, id));

      return {
        id: existing.id,
        workspaceId: existing.workspaceId,
        parentId: data.parentId !== undefined ? data.parentId : existing.parentId,
        name: data.name !== undefined ? data.name : existing.name,
        color: data.color !== undefined ? data.color : existing.color,
        icon: data.icon !== undefined ? data.icon : existing.icon,
        isFavorite: data.isFavorite !== undefined ? Boolean(data.isFavorite) : existing.isFavorite,
        sortOrder: data.sortOrder !== undefined ? data.sortOrder : existing.sortOrder,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: now.toISOString()
      };
    });
  }

  async deleteFolder(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const rows = await tx.select().from(schema.foldersTable).where(eq(schema.foldersTable.id, id)).limit(1);
      if (!rows[0]) return;
      const existing = rows[0];
      const now = new Date();
      const newRev = await this.bumpWorkspaceRevisionTx(tx, existing.workspaceId);

      await tx.update(schema.foldersTable).set({ deletedAt: now, revision: newRev }).where(eq(schema.foldersTable.id, id));

      await tx.insert(schema.syncTombstonesTable).values({
        id: uuidv4(),
        workspaceId: existing.workspaceId,
        entityType: 'folder',
        entityId: id,
        revision: newRev,
        createdAt: now
      });

      // Detach child snippets
      await tx.update(schema.snippetsTable).set({ folderId: null, updatedAt: now, revision: newRev }).where(eq(schema.snippetsTable.folderId, id));

      // Detach child folders (ST-032)
      await tx.update(schema.foldersTable).set({ parentId: null, updatedAt: now, revision: newRev }).where(eq(schema.foldersTable.parentId, id));
    });
  }

  async findSnippets(workspaceId: string, options: { folderId?: string | null; search?: string; tag?: string; favoriteOnly?: boolean } = {}): Promise<Snippet[]> {
    const conditions = [
      eq(schema.snippetsTable.workspaceId, workspaceId),
      isNull(schema.snippetsTable.deletedAt)
    ];

    if (options.folderId !== undefined) {
      if (options.folderId === null) {
        conditions.push(isNull(schema.snippetsTable.folderId));
      } else {
        conditions.push(eq(schema.snippetsTable.folderId, options.folderId));
      }
    }
    if (options.favoriteOnly) {
      conditions.push(eq(schema.snippetsTable.isFavorite, true));
    }
    if (options.search) {
      const searchPattern = `%${options.search.trim()}%`;
      conditions.push(
        or(
          like(schema.snippetsTable.name, searchPattern),
          like(schema.snippetsTable.shortcut, searchPattern),
          like(schema.snippetsTable.plainContent, searchPattern)
        )!
      );
    }

    const rows = await this.db.select().from(schema.snippetsTable).where(and(...conditions));
    let filtered = rows;

    if (options.tag) {
      filtered = filtered.filter((r) => (r.tags as string[]).includes(options.tag!));
    }

    return filtered.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      folderId: r.folderId,
      name: r.name,
      shortcut: r.shortcut,
      plainContent: r.plainContent,
      richContent: r.richContent,
      description: r.description,
      tags: r.tags as string[],
      isFavorite: r.isFavorite,
      isEnabled: r.isEnabled,
      siteRestrictions: r.siteRestrictions,
      version: r.version,
      usageCount: r.usageCount,
      lastUsedAt: r.lastUsedAt?.toISOString() || null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    }));
  }

  async findSnippetById(id: string): Promise<Snippet | null> {
    const rows = await this.db.select().from(schema.snippetsTable)
      .where(and(eq(schema.snippetsTable.id, id), isNull(schema.snippetsTable.deletedAt))).limit(1);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      folderId: r.folderId,
      name: r.name,
      shortcut: r.shortcut,
      plainContent: r.plainContent,
      richContent: r.richContent,
      description: r.description,
      tags: r.tags as string[],
      isFavorite: r.isFavorite,
      isEnabled: r.isEnabled,
      siteRestrictions: r.siteRestrictions,
      version: r.version,
      usageCount: r.usageCount,
      lastUsedAt: r.lastUsedAt?.toISOString() || null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    };
  }

  async findSnippetByShortcut(workspaceId: string, shortcut: string): Promise<Snippet | null> {
    const rows = await this.db.select().from(schema.snippetsTable)
      .where(and(
        eq(schema.snippetsTable.workspaceId, workspaceId),
        eq(schema.snippetsTable.shortcut, shortcut.toLowerCase().trim()),
        isNull(schema.snippetsTable.deletedAt)
      )).limit(1);
    if (!rows[0]) return null;
    return this.findSnippetById(rows[0].id);
  }

  async createSnippet(workspaceId: string, data: Partial<Snippet>, createdById?: string): Promise<Snippet> {
    return await this.db.transaction(async (tx) => {
      const id = uuidv4();
      const now = new Date();
      const newRev = await this.bumpWorkspaceRevisionTx(tx, workspaceId);

      await tx.insert(schema.snippetsTable).values({
        id,
        workspaceId,
        folderId: data.folderId || null,
        name: data.name || 'Untitled Snippet',
        shortcut: data.shortcut || '',
        plainContent: data.plainContent || '',
        richContent: data.richContent || null,
        description: data.description || null,
        tags: data.tags || [],
        isFavorite: Boolean(data.isFavorite),
        isEnabled: data.isEnabled !== false,
        siteRestrictions: data.siteRestrictions || null,
        version: 1,
        revision: newRev,
        usageCount: 0,
        createdAt: now,
        updatedAt: now
      });

      await tx.insert(schema.snippetRevisionsTable).values({
        id: uuidv4(),
        snippetId: id,
        version: 1,
        name: data.name || 'Untitled Snippet',
        shortcut: data.shortcut || '',
        plainContent: data.plainContent || '',
        richContent: data.richContent || null,
        createdById: createdById || null,
        createdAt: now
      });

      return {
        id,
        workspaceId,
        folderId: data.folderId || null,
        name: data.name || 'Untitled Snippet',
        shortcut: data.shortcut || '',
        plainContent: data.plainContent || '',
        richContent: data.richContent || null,
        description: data.description || null,
        tags: (data.tags || []) as string[],
        isFavorite: Boolean(data.isFavorite),
        isEnabled: data.isEnabled !== false,
        siteRestrictions: data.siteRestrictions || null,
        version: 1,
        usageCount: 0,
        lastUsedAt: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
    });
  }

  async updateSnippet(id: string, data: Partial<Snippet>, updatedById?: string, expectedVersion?: number): Promise<Snippet> {
    return await this.db.transaction(async (tx) => {
      const existingRows = await tx.select().from(schema.snippetsTable)
        .where(and(eq(schema.snippetsTable.id, id), isNull(schema.snippetsTable.deletedAt)))
        .limit(1);

      if (!existingRows[0]) throw new Error('Snippet not found');
      const snippet = existingRows[0];

      if (expectedVersion !== undefined && snippet.version !== expectedVersion) {
        const err = new Error(`Conflict: snippet was modified by another session (expected version ${expectedVersion}, current version is ${snippet.version}).`);
        (err as any).statusCode = 409;
        throw err;
      }

      const nextVer = snippet.version + 1;
      const now = new Date();
      const newRev = await this.bumpWorkspaceRevisionTx(tx, snippet.workspaceId);

      const whereClause = expectedVersion !== undefined
        ? and(eq(schema.snippetsTable.id, id), eq(schema.snippetsTable.version, expectedVersion))
        : eq(schema.snippetsTable.id, id);

      const updateResult: any = await tx.update(schema.snippetsTable).set({
        name: data.name !== undefined ? data.name : snippet.name,
        shortcut: data.shortcut !== undefined ? data.shortcut : snippet.shortcut,
        folderId: data.folderId !== undefined ? data.folderId : snippet.folderId,
        plainContent: data.plainContent !== undefined ? data.plainContent : snippet.plainContent,
        richContent: data.richContent !== undefined ? data.richContent : snippet.richContent,
        description: data.description !== undefined ? data.description : snippet.description,
        tags: data.tags !== undefined ? data.tags : snippet.tags,
        isFavorite: data.isFavorite !== undefined ? Boolean(data.isFavorite) : snippet.isFavorite,
        isEnabled: data.isEnabled !== undefined ? Boolean(data.isEnabled) : snippet.isEnabled,
        siteRestrictions: data.siteRestrictions !== undefined ? data.siteRestrictions : snippet.siteRestrictions,
        version: nextVer,
        revision: newRev,
        updatedAt: now
      }).where(whereClause);

      if (expectedVersion !== undefined && updateResult && updateResult[0]?.affectedRows === 0) {
        const err = new Error(`Conflict: snippet was modified concurrently by another transaction.`);
        (err as any).statusCode = 409;
        throw err;
      }

      await tx.insert(schema.snippetRevisionsTable).values({
        id: uuidv4(),
        snippetId: id,
        version: nextVer,
        name: data.name ?? snippet.name,
        shortcut: data.shortcut ?? snippet.shortcut,
        plainContent: data.plainContent ?? snippet.plainContent,
        richContent: data.richContent !== undefined ? data.richContent : snippet.richContent,
        createdById: updatedById || null,
        createdAt: now
      });

      return {
        id: snippet.id,
        workspaceId: snippet.workspaceId,
        folderId: data.folderId !== undefined ? data.folderId : snippet.folderId,
        name: data.name !== undefined ? data.name : snippet.name,
        shortcut: data.shortcut !== undefined ? data.shortcut : snippet.shortcut,
        plainContent: data.plainContent !== undefined ? data.plainContent : snippet.plainContent,
        richContent: data.richContent !== undefined ? data.richContent : snippet.richContent,
        description: data.description !== undefined ? data.description : snippet.description,
        tags: (data.tags !== undefined ? data.tags : snippet.tags) as string[],
        isFavorite: data.isFavorite !== undefined ? Boolean(data.isFavorite) : snippet.isFavorite,
        isEnabled: data.isEnabled !== undefined ? Boolean(data.isEnabled) : snippet.isEnabled,
        siteRestrictions: data.siteRestrictions !== undefined ? data.siteRestrictions : snippet.siteRestrictions,
        version: nextVer,
        usageCount: snippet.usageCount,
        lastUsedAt: snippet.lastUsedAt?.toISOString() || null,
        createdAt: snippet.createdAt.toISOString(),
        updatedAt: now.toISOString()
      };
    });
  }

  async deleteSnippet(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const rows = await tx.select().from(schema.snippetsTable).where(eq(schema.snippetsTable.id, id)).limit(1);
      if (!rows[0]) return;
      const existing = rows[0];
      const now = new Date();
      const newRev = await this.bumpWorkspaceRevisionTx(tx, existing.workspaceId);

      await tx.update(schema.snippetsTable).set({ deletedAt: now, revision: newRev }).where(eq(schema.snippetsTable.id, id));

      // Record deletion tombstone
      await tx.insert(schema.syncTombstonesTable).values({
        id: uuidv4(),
        workspaceId: existing.workspaceId,
        entityType: 'snippet',
        entityId: id,
        revision: newRev,
        createdAt: now
      });
    });
  }

  async incrementSnippetUsage(id: string): Promise<void> {
    await this.db.update(schema.snippetsTable).set({
      usageCount: sql`${schema.snippetsTable.usageCount} + 1`,
      lastUsedAt: new Date()
    }).where(eq(schema.snippetsTable.id, id));
  }

  async findSnippetRevisions(snippetId: string): Promise<SnippetRevision[]> {
    const rows = await this.db.select().from(schema.snippetRevisionsTable)
      .where(eq(schema.snippetRevisionsTable.snippetId, snippetId))
      .orderBy(sql`${schema.snippetRevisionsTable.version} desc`);

    return rows.map((r) => ({
      id: r.id,
      snippetId: r.snippetId,
      version: r.version,
      name: r.name,
      shortcut: r.shortcut,
      plainContent: r.plainContent,
      richContent: r.richContent,
      createdAt: r.createdAt.toISOString(),
      createdById: r.createdById
    }));
  }

  async getWorkspaceRevision(workspaceId: string): Promise<number> {
    const rows = await this.db.select().from(schema.workspaceRevisionsTable).where(eq(schema.workspaceRevisionsTable.workspaceId, workspaceId)).limit(1);
    return rows[0]?.currentRevision || 1;
  }

  async bumpWorkspaceRevision(workspaceId: string): Promise<number> {
    const now = new Date();
    await this.db.insert(schema.workspaceRevisionsTable).values({
      workspaceId,
      currentRevision: 2,
      updatedAt: now
    }).onDuplicateKeyUpdate({
      set: {
        currentRevision: sql`${schema.workspaceRevisionsTable.currentRevision} + 1`,
        updatedAt: now
      }
    });
    return this.getWorkspaceRevision(workspaceId);
  }

  async getSyncData(workspaceId: string, lastRevision: number) {
    const currentRev = await this.getWorkspaceRevision(workspaceId);

    if (lastRevision === 0) {
      const snippets = await this.findSnippets(workspaceId);
      const folders = await this.findFolders(workspaceId);
      return {
        currentRevision: currentRev,
        snippets,
        deletedSnippetIds: [],
        folders,
        deletedFolderIds: []
      };
    }

    // 1. Fetch changed snippets (revision > lastRevision AND not deleted)
    const changedSnippetRows = await this.db.select().from(schema.snippetsTable)
      .where(and(
        eq(schema.snippetsTable.workspaceId, workspaceId),
        gt(schema.snippetsTable.revision, lastRevision),
        isNull(schema.snippetsTable.deletedAt)
      ));

    const changedSnippets: Snippet[] = changedSnippetRows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      folderId: r.folderId,
      name: r.name,
      shortcut: r.shortcut,
      plainContent: r.plainContent,
      richContent: r.richContent,
      description: r.description,
      tags: r.tags as string[],
      isFavorite: r.isFavorite,
      isEnabled: r.isEnabled,
      siteRestrictions: r.siteRestrictions,
      version: r.version,
      usageCount: r.usageCount,
      lastUsedAt: r.lastUsedAt?.toISOString() || null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    }));

    // 2. Fetch changed folders (revision > lastRevision AND not deleted)
    const changedFolderRows = await this.db.select().from(schema.foldersTable)
      .where(and(
        eq(schema.foldersTable.workspaceId, workspaceId),
        gt(schema.foldersTable.revision, lastRevision),
        isNull(schema.foldersTable.deletedAt)
      ));

    const changedFolders: Folder[] = changedFolderRows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      parentId: r.parentId,
      name: r.name,
      color: r.color,
      icon: r.icon,
      isFavorite: r.isFavorite,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    }));

    // 3. Fetch deleted items from tombstones (revision > lastRevision)
    const tombstones = await this.db.select().from(schema.syncTombstonesTable)
      .where(and(
        eq(schema.syncTombstonesTable.workspaceId, workspaceId),
        gt(schema.syncTombstonesTable.revision, lastRevision)
      ));

    const deletedSnippetIds = tombstones
      .filter((t) => t.entityType === 'snippet')
      .map((t) => t.entityId);

    const deletedFolderIds = tombstones
      .filter((t) => t.entityType === 'folder')
      .map((t) => t.entityId);

    return {
      currentRevision: currentRev,
      snippets: changedSnippets,
      deletedSnippetIds,
      folders: changedFolders,
      deletedFolderIds
    };
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    const rows = await this.db.select().from(schema.userPreferencesTable).where(eq(schema.userPreferencesTable.userId, userId)).limit(1);
    if (!rows[0]) return { ...DEFAULT_PREFERENCES };
    const r = rows[0];
    return {
      triggerMode: r.triggerMode as any,
      delimiterChar: r.delimiterChar,
      caseSensitive: r.caseSensitive,
      assistantShortcut: r.assistantShortcut,
      excludedDomains: r.excludedDomains as string[],
      disabledInSensitiveFields: r.disabledInSensitiveFields
    };
  }

  async updateUserPreferences(userId: string, data: Partial<UserPreferences>): Promise<UserPreferences> {
    const now = new Date();
    const current = await this.getUserPreferences(userId);
    const merged = { ...current, ...data };

    await this.db.insert(schema.userPreferencesTable).values({
      userId,
      triggerMode: merged.triggerMode,
      delimiterChar: merged.delimiterChar,
      caseSensitive: merged.caseSensitive,
      assistantShortcut: merged.assistantShortcut,
      excludedDomains: merged.excludedDomains,
      disabledInSensitiveFields: merged.disabledInSensitiveFields,
      updatedAt: now
    }).onDuplicateKeyUpdate({
      set: {
        triggerMode: merged.triggerMode,
        delimiterChar: merged.delimiterChar,
        caseSensitive: merged.caseSensitive,
        assistantShortcut: merged.assistantShortcut,
        excludedDomains: merged.excludedDomains,
        disabledInSensitiveFields: merged.disabledInSensitiveFields,
        updatedAt: now
      }
    });

    return merged;
  }

  // Data Tables
  async findTables(workspaceId: string): Promise<DataTable[]> {
    const tables = await this.db.select().from(schema.dataTablesTable).where(eq(schema.dataTablesTable.workspaceId, workspaceId));
    const results: DataTable[] = [];
    for (const t of tables) {
      const rowCountRes = await this.db.select({ count: sql<number>`count(*)` })
        .from(schema.dataRowsTable)
        .where(eq(schema.dataRowsTable.tableId, t.id));
      const count = Number(rowCountRes[0]?.count ?? 0);
      results.push({
        id: t.id,
        workspaceId: t.workspaceId,
        name: t.name,
        description: t.description,
        columns: t.columns as DataTableColumn[],
        rowCount: count,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString()
      });
    }
    return results;
  }

  async findTableById(id: string): Promise<DataTable | null> {
    const tables = await this.db.select().from(schema.dataTablesTable).where(eq(schema.dataTablesTable.id, id)).limit(1);
    if (!tables[0]) return null;
    const t = tables[0];
    const rowCountRes = await this.db.select({ count: sql<number>`count(*)` })
      .from(schema.dataRowsTable)
      .where(eq(schema.dataRowsTable.tableId, t.id));
    const count = Number(rowCountRes[0]?.count ?? 0);
    return {
      id: t.id,
      workspaceId: t.workspaceId,
      name: t.name,
      description: t.description,
      columns: t.columns as DataTableColumn[],
      rowCount: count,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString()
    };
  }

  async createTable(workspaceId: string, data: { name: string; description?: string | null; columns: DataTableColumn[] }): Promise<DataTable> {
    return await this.db.transaction(async (tx) => {
      const id = uuidv4();
      const now = new Date();
      await this.bumpWorkspaceRevisionTx(tx, workspaceId);
      await tx.insert(schema.dataTablesTable).values({
        id,
        workspaceId,
        name: data.name,
        description: data.description ?? null,
        columns: data.columns,
        createdAt: now,
        updatedAt: now
      });
      return {
        id,
        workspaceId,
        name: data.name,
        description: data.description ?? null,
        columns: data.columns,
        rowCount: 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
    });
  }

  async updateTable(id: string, data: Partial<{ name: string; description?: string | null; columns: DataTableColumn[] }>): Promise<DataTable> {
    return await this.db.transaction(async (tx) => {
      const table = await this.findTableById(id);
      if (!table) throw new Error('Table not found');
      const now = new Date();
      await this.bumpWorkspaceRevisionTx(tx, table.workspaceId);
      await tx.update(schema.dataTablesTable).set({
        name: data.name ?? table.name,
        description: data.description !== undefined ? data.description : table.description,
        columns: data.columns ?? table.columns,
        updatedAt: now
      }).where(eq(schema.dataTablesTable.id, id));

      return {
        ...table,
        name: data.name ?? table.name,
        description: data.description !== undefined ? data.description : table.description,
        columns: data.columns ?? table.columns,
        updatedAt: now.toISOString()
      };
    });
  }

  async deleteTable(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const table = await this.findTableById(id);
      if (!table) return;
      const now = new Date();
      const rev = await this.bumpWorkspaceRevisionTx(tx, table.workspaceId);
      await tx.insert(schema.syncTombstonesTable).values({
        id: uuidv4(),
        workspaceId: table.workspaceId,
        entityType: 'table',
        entityId: id,
        revision: rev,
        createdAt: now
      });
      await tx.delete(schema.dataTablesTable).where(eq(schema.dataTablesTable.id, id));
    });
  }

  async findTableRows(tableId: string): Promise<DataTableRow[]> {
    const rows = await this.db.select().from(schema.dataRowsTable).where(eq(schema.dataRowsTable.tableId, tableId));
    return rows.map(r => ({
      id: r.id,
      tableId: r.tableId,
      data: r.data as Record<string, any>,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    }));
  }

  async findTableRowById(tableId: string, rowId: string): Promise<DataTableRow | null> {
    const rows = await this.db.select().from(schema.dataRowsTable)
      .where(and(eq(schema.dataRowsTable.id, rowId), eq(schema.dataRowsTable.tableId, tableId)))
      .limit(1);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      tableId: rows[0].tableId,
      data: rows[0].data as Record<string, any>,
      createdAt: rows[0].createdAt.toISOString(),
      updatedAt: rows[0].updatedAt.toISOString()
    };
  }

  async createTableRow(tableId: string, data: Record<string, any>): Promise<DataTableRow> {
    return await this.db.transaction(async (tx) => {
      const table = await this.findTableById(tableId);
      if (!table) throw new Error('Table not found');
      const id = uuidv4();
      const now = new Date();
      await this.bumpWorkspaceRevisionTx(tx, table.workspaceId);
      await tx.insert(schema.dataRowsTable).values({
        id,
        tableId,
        data,
        createdAt: now,
        updatedAt: now
      });
      return {
        id,
        tableId,
        data,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
    });
  }

  async updateTableRow(tableId: string, rowId: string, data: Record<string, any>): Promise<DataTableRow | null> {
    return await this.db.transaction(async (tx) => {
      const table = await this.findTableById(tableId);
      if (!table) throw new Error('Table not found');
      const now = new Date();
      const existing = await tx.select().from(schema.dataRowsTable)
        .where(and(eq(schema.dataRowsTable.id, rowId), eq(schema.dataRowsTable.tableId, tableId)))
        .limit(1);
      if (!existing[0]) return null;
      const merged = { ...(existing[0].data as Record<string, any>), ...data };
      await this.bumpWorkspaceRevisionTx(tx, table.workspaceId);
      await tx.update(schema.dataRowsTable).set({
        data: merged,
        updatedAt: now
      }).where(and(eq(schema.dataRowsTable.id, rowId), eq(schema.dataRowsTable.tableId, tableId)));
      return {
        id: existing[0].id,
        tableId: existing[0].tableId,
        data: merged,
        createdAt: existing[0].createdAt.toISOString(),
        updatedAt: now.toISOString()
      };
    });
  }

  async deleteTableRow(tableId: string, rowId: string): Promise<boolean> {
    return await this.db.transaction(async (tx) => {
      const table = await this.findTableById(tableId);
      if (!table) return false;
      await this.bumpWorkspaceRevisionTx(tx, table.workspaceId);
      await tx.delete(schema.dataRowsTable)
        .where(and(eq(schema.dataRowsTable.id, rowId), eq(schema.dataRowsTable.tableId, tableId)));
      return true;
    });
  }
}
