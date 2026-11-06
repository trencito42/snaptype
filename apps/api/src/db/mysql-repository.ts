import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema.js';
import { IRepository, InMemoryRepository } from './repository.js';
import { eq, and, sql, isNull, inArray } from 'drizzle-orm';
import { User, Workspace, WorkspaceMember, Folder, Snippet, SnippetRevision, UserPreferences, WorkspaceRole, DEFAULT_PREFERENCES } from '@snaptype/shared';
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

  async markChallengeVerified(id: string): Promise<void> {
    await this.db.update(schema.emailChallengesTable)
      .set({ verifiedAt: new Date() })
      .where(eq(schema.emailChallengesTable.id, id));
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
    await this.db.insert(schema.workspacesTable).values({
      id,
      name,
      slug,
      ownerId,
      isPersonal,
      createdAt: now,
      updatedAt: now
    });
    await this.db.insert(schema.workspaceRevisionsTable).values({
      workspaceId: id,
      currentRevision: 1,
      updatedAt: now
    });
    await this.addWorkspaceMember(id, ownerId, 'owner');
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

  async createFolder(workspaceId: string, data: Partial<Folder>): Promise<Folder> {
    const id = uuidv4();
    const now = new Date();
    await this.db.insert(schema.foldersTable).values({
      id,
      workspaceId,
      parentId: data.parentId || null,
      name: data.name || 'Untitled Folder',
      color: data.color || null,
      icon: data.icon || null,
      isFavorite: Boolean(data.isFavorite),
      sortOrder: data.sortOrder || 0,
      createdAt: now,
      updatedAt: now
    });
    await this.bumpWorkspaceRevision(workspaceId);
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
  }

  async updateFolder(id: string, data: Partial<Folder>): Promise<Folder> {
    const existing = await this.findFolderById(id);
    if (!existing) throw new Error('Folder not found');

    const now = new Date();
    await this.db.update(schema.foldersTable).set({
      name: data.name,
      parentId: data.parentId,
      color: data.color,
      icon: data.icon,
      isFavorite: data.isFavorite,
      sortOrder: data.sortOrder,
      updatedAt: now
    }).where(eq(schema.foldersTable.id, id));

    await this.bumpWorkspaceRevision(existing.workspaceId);
    return (await this.findFolderById(id))!;
  }

  async deleteFolder(id: string): Promise<void> {
    const existing = await this.findFolderById(id);
    if (!existing) return;
    const now = new Date();
    await this.db.update(schema.foldersTable).set({ deletedAt: now }).where(eq(schema.foldersTable.id, id));
    // Detach child snippets
    await this.db.update(schema.snippetsTable).set({ folderId: null, updatedAt: now }).where(eq(schema.snippetsTable.folderId, id));
    await this.bumpWorkspaceRevision(existing.workspaceId);
  }

  async findSnippets(workspaceId: string, options: { folderId?: string | null; search?: string; tag?: string; favoriteOnly?: boolean } = {}): Promise<Snippet[]> {
    let query = this.db.select().from(schema.snippetsTable)
      .where(and(eq(schema.snippetsTable.workspaceId, workspaceId), isNull(schema.snippetsTable.deletedAt)));

    const rows = await query;
    let filtered = rows;

    if (options.folderId !== undefined) {
      filtered = filtered.filter((r) => r.folderId === options.folderId);
    }
    if (options.favoriteOnly) {
      filtered = filtered.filter((r) => r.isFavorite);
    }
    if (options.tag) {
      filtered = filtered.filter((r) => (r.tags as string[]).includes(options.tag!));
    }
    if (options.search) {
      const q = options.search.toLowerCase().trim();
      filtered = filtered.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.shortcut.toLowerCase().includes(q) ||
        r.plainContent.toLowerCase().includes(q) ||
        (r.tags as string[]).some((t) => t.toLowerCase().includes(q))
      );
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
    const id = uuidv4();
    const now = new Date();
    await this.db.insert(schema.snippetsTable).values({
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
      usageCount: 0,
      createdAt: now,
      updatedAt: now
    });

    await this.db.insert(schema.snippetRevisionsTable).values({
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

    await this.bumpWorkspaceRevision(workspaceId);
    return (await this.findSnippetById(id))!;
  }

  async updateSnippet(id: string, data: Partial<Snippet>, updatedById?: string): Promise<Snippet> {
    const existing = await this.findSnippetById(id);
    if (!existing) throw new Error('Snippet not found');

    const nextVer = existing.version + 1;
    const now = new Date();
    await this.db.update(schema.snippetsTable).set({
      name: data.name,
      shortcut: data.shortcut,
      folderId: data.folderId,
      plainContent: data.plainContent,
      richContent: data.richContent,
      description: data.description,
      tags: data.tags,
      isFavorite: data.isFavorite,
      isEnabled: data.isEnabled,
      siteRestrictions: data.siteRestrictions,
      version: nextVer,
      updatedAt: now
    }).where(eq(schema.snippetsTable.id, id));

    await this.db.insert(schema.snippetRevisionsTable).values({
      id: uuidv4(),
      snippetId: id,
      version: nextVer,
      name: data.name ?? existing.name,
      shortcut: data.shortcut ?? existing.shortcut,
      plainContent: data.plainContent ?? existing.plainContent,
      richContent: data.richContent ?? existing.richContent,
      createdById: updatedById || null,
      createdAt: now
    });

    await this.bumpWorkspaceRevision(existing.workspaceId);
    return (await this.findSnippetById(id))!;
  }

  async deleteSnippet(id: string): Promise<void> {
    const existing = await this.findSnippetById(id);
    if (!existing) return;
    const now = new Date();
    await this.db.update(schema.snippetsTable).set({ deletedAt: now }).where(eq(schema.snippetsTable.id, id));
    await this.bumpWorkspaceRevision(existing.workspaceId);
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
}
