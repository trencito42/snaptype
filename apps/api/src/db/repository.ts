import crypto from 'node:crypto';
const uuidv4 = () => crypto.randomUUID();
import { User, Workspace, WorkspaceMember, WorkspaceInvitation, Folder, Snippet, SnippetRevision, UserPreferences, WorkspaceRole, DEFAULT_PREFERENCES, DataTable, DataTableColumn, DataTableRow } from '@snaptype/shared';

export interface VerificationChallengeRecord {
  id: string;
  email: string;
  hashedCode: string;
  attempts: number;
  expiresAt: Date;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface IRepository {
  // Users & Auth
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  createUser(email: string, name?: string | null): Promise<User>;
  updateUser(id: string, data: { name?: string | null }): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // Verification challenges
  createEmailChallenge(email: string, hashedCode: string, expiresAt: Date): Promise<VerificationChallengeRecord>;
  findLatestChallenge(email: string): Promise<VerificationChallengeRecord | null>;
  incrementChallengeAttempts(id: string): Promise<void>;
  markChallengeVerified(id: string): Promise<boolean>;

  // Sessions
  createSession(userId: string, tokenHash: string, expiresAt: Date, userAgent?: string | null, ipAddress?: string | null): Promise<SessionRecord>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  deleteSession(id: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;

  // Workspaces
  createWorkspace(name: string, slug: string, ownerId: string, isPersonal: boolean): Promise<Workspace>;
  findUserWorkspaces(userId: string): Promise<{ workspace: Workspace; role: WorkspaceRole }[]>;
  findWorkspaceById(id: string): Promise<Workspace | null>;
  findWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;
  findWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  addWorkspaceMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember>;
  removeWorkspaceMember(workspaceId: string, userId: string): Promise<void>;

  // Workspace Invitations (ST-007)
  createWorkspaceInvitation(workspaceId: string, email: string, role: WorkspaceRole, invitedById: string, token: string, expiresAt: Date): Promise<WorkspaceInvitation>;
  findInvitationByToken(token: string): Promise<WorkspaceInvitation | null>;
  findWorkspaceInvitations(workspaceId: string): Promise<WorkspaceInvitation[]>;
  revokeWorkspaceInvitation(workspaceId: string, id: string): Promise<void>;
  acceptWorkspaceInvitation(token: string, userId: string): Promise<WorkspaceMember>;

  // Folders
  findFolders(workspaceId: string): Promise<Folder[]>;
  findFolderById(id: string): Promise<Folder | null>;
  createFolder(workspaceId: string, data: Partial<Folder>): Promise<Folder>;
  updateFolder(id: string, data: Partial<Folder>): Promise<Folder>;
  deleteFolder(id: string): Promise<void>;

  // Snippets
  findSnippets(workspaceId: string, options?: { folderId?: string | null; search?: string; tag?: string; favoriteOnly?: boolean }): Promise<Snippet[]>;
  findSnippetById(id: string): Promise<Snippet | null>;
  findSnippetByShortcut(workspaceId: string, shortcut: string): Promise<Snippet | null>;
  createSnippet(workspaceId: string, data: Partial<Snippet>, createdById?: string): Promise<Snippet>;
  updateSnippet(id: string, data: Partial<Snippet>, updatedById?: string, expectedVersion?: number): Promise<Snippet>;
  deleteSnippet(id: string): Promise<void>;
  incrementSnippetUsage(id: string): Promise<void>;
  findSnippetRevisions(snippetId: string): Promise<SnippetRevision[]>;

  // Revisions & Sync
  getWorkspaceRevision(workspaceId: string): Promise<number>;
  bumpWorkspaceRevision(workspaceId: string): Promise<number>;
  getSyncData(workspaceId: string, lastRevision: number): Promise<{
    currentRevision: number;
    snippets: Snippet[];
    deletedSnippetIds: string[];
    folders: Folder[];
    deletedFolderIds: string[];
  }>;

  // Preferences
  getUserPreferences(userId: string): Promise<UserPreferences>;
  updateUserPreferences(userId: string, data: Partial<UserPreferences>): Promise<UserPreferences>;

  // Data Tables
  findTables(workspaceId: string): Promise<DataTable[]>;
  findTableById(id: string): Promise<DataTable | null>;
  createTable(workspaceId: string, data: { name: string; description?: string | null; columns: DataTableColumn[] }): Promise<DataTable>;
  updateTable(id: string, data: Partial<{ name: string; description?: string | null; columns: DataTableColumn[] }>): Promise<DataTable>;
  deleteTable(id: string): Promise<void>;
  findTableRows(tableId: string): Promise<DataTableRow[]>;
  findTableRowById(tableId: string, rowId: string): Promise<DataTableRow | null>;
  createTableRow(tableId: string, data: Record<string, any>): Promise<DataTableRow>;
  updateTableRow(tableId: string, rowId: string, data: Record<string, any>): Promise<DataTableRow | null>;
  deleteTableRow(tableId: string, rowId: string): Promise<boolean>;
}

/**
 * High-performance In-Memory Repository implementation for testing, offline execution,
 * and environments where MySQL is not yet provisioned. Fully conforms to IRepository.
 */
export class InMemoryRepository implements IRepository {
  private users = new Map<string, User>();
  private challenges: VerificationChallengeRecord[] = [];
  private sessions = new Map<string, SessionRecord>();
  private workspaces = new Map<string, Workspace>();
  private workspaceMembers = new Map<string, WorkspaceMember>();
  private folders = new Map<string, Folder>();
  private snippets = new Map<string, Snippet>();
  private revisions: SnippetRevision[] = [];
  private preferences = new Map<string, UserPreferences>();
  private workspaceRevisions = new Map<string, number>();
  private tables = new Map<string, DataTable>();
  private tableRows = new Map<string, DataTableRow>();
  private invitations = new Map<string, WorkspaceInvitation>();

  // Tracking deleted items for revision-based synchronization
  private deletedSnippets: { id: string; workspaceId: string; revision: number }[] = [];
  private deletedFolders: { id: string; workspaceId: string; revision: number }[] = [];
  private snippetRevisionsMap: { id: string; workspaceId: string; revision: number }[] = [];
  private folderRevisionsMap: { id: string; workspaceId: string; revision: number }[] = [];

  async findUserByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === normalized) return u;
    }
    return null;
  }

  async findUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async createUser(email: string, name?: string | null): Promise<User> {
    const user: User = {
      id: uuidv4(),
      email: email.toLowerCase().trim(),
      name: name || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(id: string, data: { name?: string | null }): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error('User not found');
    if (data.name !== undefined) user.name = data.name;
    user.updatedAt = new Date().toISOString();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    this.users.delete(id);
    for (const [sId, sess] of this.sessions.entries()) {
      if (sess.userId === id) this.sessions.delete(sId);
    }
  }

  async createEmailChallenge(email: string, hashedCode: string, expiresAt: Date): Promise<VerificationChallengeRecord> {
    const record: VerificationChallengeRecord = {
      id: uuidv4(),
      email: email.toLowerCase().trim(),
      hashedCode,
      attempts: 0,
      expiresAt,
      verifiedAt: null,
      createdAt: new Date()
    };
    this.challenges.push(record);
    return record;
  }

  async findLatestChallenge(email: string): Promise<VerificationChallengeRecord | null> {
    const normalized = email.toLowerCase().trim();
    const matching = this.challenges.filter((c) => c.email === normalized);
    if (matching.length === 0) return null;
    return matching[matching.length - 1];
  }

  async incrementChallengeAttempts(id: string): Promise<void> {
    const ch = this.challenges.find((c) => c.id === id);
    if (ch) ch.attempts++;
  }

  async markChallengeVerified(id: string): Promise<boolean> {
    const ch = this.challenges.find((c) => c.id === id);
    if (!ch || ch.verifiedAt) return false;
    ch.verifiedAt = new Date();
    return true;
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date, userAgent?: string | null, ipAddress?: string | null): Promise<SessionRecord> {
    const sess: SessionRecord = {
      id: uuidv4(),
      userId,
      tokenHash,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
      expiresAt,
      createdAt: new Date()
    };
    this.sessions.set(sess.id, sess);
    return sess;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    for (const sess of this.sessions.values()) {
      if (sess.tokenHash === tokenHash) {
        if (sess.expiresAt.getTime() < Date.now()) {
          this.sessions.delete(sess.id);
          return null;
        }
        return sess;
      }
    }
    return null;
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    for (const [id, sess] of this.sessions.entries()) {
      if (sess.userId === userId) {
        this.sessions.delete(id);
      }
    }
  }

  async createWorkspace(name: string, slug: string, ownerId: string, isPersonal: boolean): Promise<Workspace> {
    const ws: Workspace = {
      id: uuidv4(),
      name,
      slug,
      ownerId,
      isPersonal,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.workspaces.set(ws.id, ws);
    this.workspaceRevisions.set(ws.id, 1);

    // Add owner as workspace member
    await this.addWorkspaceMember(ws.id, ownerId, 'owner');
    return ws;
  }

  async findUserWorkspaces(userId: string): Promise<{ workspace: Workspace; role: WorkspaceRole }[]> {
    const result: { workspace: Workspace; role: WorkspaceRole }[] = [];
    for (const mem of this.workspaceMembers.values()) {
      if (mem.userId === userId) {
        const ws = this.workspaces.get(mem.workspaceId);
        if (ws) {
          result.push({ workspace: ws, role: mem.role });
        }
      }
    }
    return result;
  }

  async findWorkspaceById(id: string): Promise<Workspace | null> {
    return this.workspaces.get(id) || null;
  }

  async findWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    for (const mem of this.workspaceMembers.values()) {
      if (mem.workspaceId === workspaceId && mem.userId === userId) {
        return mem;
      }
    }
    return null;
  }

  async findWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const list: WorkspaceMember[] = [];
    for (const mem of this.workspaceMembers.values()) {
      if (mem.workspaceId === workspaceId) {
        const u = this.users.get(mem.userId);
        list.push({
          ...mem,
          user: u ? { id: u.id, email: u.email, name: u.name } : undefined
        });
      }
    }
    return list;
  }

  async addWorkspaceMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember> {
    const user = this.users.get(userId);
    const member: WorkspaceMember = {
      id: uuidv4(),
      workspaceId,
      userId,
      role,
      createdAt: new Date().toISOString(),
      user: user ? { id: user.id, email: user.email, name: user.name } : undefined
    };
    this.workspaceMembers.set(member.id, member);
    return member;
  }

  async removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
    for (const [id, mem] of this.workspaceMembers.entries()) {
      if (mem.workspaceId === workspaceId && mem.userId === userId) {
        this.workspaceMembers.delete(id);
      }
    }
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
    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const inv: WorkspaceInvitation = {
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
      createdAt: new Date().toISOString()
    };
    this.invitations.set(id, inv);
    return inv;
  }

  async findInvitationByToken(token: string): Promise<WorkspaceInvitation | null> {
    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    for (const inv of this.invitations.values()) {
      if (inv.tokenHash === tokenHash || inv.token === token) return inv;
    }
    return null;
  }

  async findWorkspaceInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const list: WorkspaceInvitation[] = [];
    const now = new Date();
    for (const inv of this.invitations.values()) {
      if (inv.workspaceId === workspaceId && !inv.acceptedAt && !inv.revokedAt && new Date(inv.expiresAt) > now) {
        list.push(inv);
      }
    }
    return list;
  }

  async revokeWorkspaceInvitation(workspaceId: string, id: string): Promise<void> {
    const inv = this.invitations.get(id);
    if (inv && inv.workspaceId === workspaceId) {
      inv.revokedAt = new Date().toISOString();
    }
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

    inv.acceptedAt = new Date().toISOString();
    return this.addWorkspaceMember(inv.workspaceId, userId, inv.role);
  }

  async findFolders(workspaceId: string): Promise<Folder[]> {
    const result: Folder[] = [];
    for (const f of this.folders.values()) {
      if (f.workspaceId === workspaceId && !f.deletedAt) {
        // Count active snippets in folder
        let snippetCount = 0;
        for (const s of this.snippets.values()) {
          if (s.folderId === f.id && !s.deletedAt) snippetCount++;
        }
        result.push({ ...f, snippetCount });
      }
    }
    return result.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  async findFolderById(id: string): Promise<Folder | null> {
    const f = this.folders.get(id);
    return (f && !f.deletedAt) ? f : null;
  }

  async createFolder(workspaceId: string, data: Partial<Folder>): Promise<Folder> {
    const folder: Folder = {
      id: uuidv4(),
      workspaceId,
      parentId: data.parentId || null,
      name: data.name || 'Untitled Folder',
      color: data.color || null,
      icon: data.icon || null,
      isFavorite: Boolean(data.isFavorite),
      sortOrder: data.sortOrder || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.folders.set(folder.id, folder);
    const rev = await this.bumpWorkspaceRevision(workspaceId);
    this.folderRevisionsMap.push({ id: folder.id, workspaceId, revision: rev });
    return folder;
  }

  async updateFolder(id: string, data: Partial<Folder>): Promise<Folder> {
    const folder = this.folders.get(id);
    if (!folder || folder.deletedAt) throw new Error('Folder not found');

    if (data.name !== undefined) folder.name = data.name;
    if (data.parentId !== undefined) folder.parentId = data.parentId;
    if (data.color !== undefined) folder.color = data.color;
    if (data.icon !== undefined) folder.icon = data.icon;
    if (data.isFavorite !== undefined) folder.isFavorite = data.isFavorite;
    if (data.sortOrder !== undefined) folder.sortOrder = data.sortOrder;
    folder.updatedAt = new Date().toISOString();

    const rev = await this.bumpWorkspaceRevision(folder.workspaceId);
    this.folderRevisionsMap.push({ id: folder.id, workspaceId: folder.workspaceId, revision: rev });
    return folder;
  }

  async deleteFolder(id: string): Promise<void> {
    const folder = this.folders.get(id);
    if (!folder) return;
    folder.deletedAt = new Date().toISOString();

    // Detach child snippets so they are not silently destroyed
    for (const s of this.snippets.values()) {
      if (s.folderId === id) {
        s.folderId = null;
        s.updatedAt = new Date().toISOString();
      }
    }

    // Detach child folders (ST-032)
    for (const f of this.folders.values()) {
      if (f.parentId === id) {
        f.parentId = null;
        f.updatedAt = new Date().toISOString();
      }
    }

    const rev = await this.bumpWorkspaceRevision(folder.workspaceId);
    this.deletedFolders.push({ id: folder.id, workspaceId: folder.workspaceId, revision: rev });
  }

  async findSnippets(
    workspaceId: string,
    options: { folderId?: string | null; search?: string; tag?: string; favoriteOnly?: boolean } = {}
  ): Promise<Snippet[]> {
    const result: Snippet[] = [];
    const searchLower = options.search?.toLowerCase().trim();

    for (const s of this.snippets.values()) {
      if (s.workspaceId !== workspaceId || s.deletedAt) continue;

      if (options.folderId !== undefined && s.folderId !== options.folderId) continue;
      if (options.favoriteOnly && !s.isFavorite) continue;
      if (options.tag && !s.tags.includes(options.tag)) continue;

      if (searchLower) {
        const matchesName = s.name.toLowerCase().includes(searchLower);
        const matchesShortcut = s.shortcut.toLowerCase().includes(searchLower);
        const matchesContent = s.plainContent.toLowerCase().includes(searchLower);
        const matchesTag = s.tags.some((t) => t.toLowerCase().includes(searchLower));
        if (!matchesName && !matchesShortcut && !matchesContent && !matchesTag) {
          continue;
        }
      }

      result.push(s);
    }

    return result.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0) || a.name.localeCompare(b.name));
  }

  async findSnippetById(id: string): Promise<Snippet | null> {
    const s = this.snippets.get(id);
    return (s && !s.deletedAt) ? s : null;
  }

  async findSnippetByShortcut(workspaceId: string, shortcut: string): Promise<Snippet | null> {
    const scLower = shortcut.toLowerCase().trim();
    for (const s of this.snippets.values()) {
      if (s.workspaceId === workspaceId && !s.deletedAt && s.shortcut.toLowerCase().trim() === scLower) {
        return s;
      }
    }
    return null;
  }

  async createSnippet(workspaceId: string, data: Partial<Snippet>, createdById?: string): Promise<Snippet> {
    const snippet: Snippet = {
      id: uuidv4(),
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.snippets.set(snippet.id, snippet);

    // Record initial revision
    this.revisions.push({
      id: uuidv4(),
      snippetId: snippet.id,
      version: 1,
      name: snippet.name,
      shortcut: snippet.shortcut,
      plainContent: snippet.plainContent,
      richContent: snippet.richContent,
      createdAt: snippet.createdAt,
      createdById: createdById || null
    });

    const rev = await this.bumpWorkspaceRevision(workspaceId);
    this.snippetRevisionsMap.push({ id: snippet.id, workspaceId, revision: rev });
    return snippet;
  }

  async updateSnippet(id: string, data: Partial<Snippet>, updatedById?: string, expectedVersion?: number): Promise<Snippet> {
    const snippet = this.snippets.get(id);
    if (!snippet || snippet.deletedAt) throw new Error('Snippet not found');

    if (expectedVersion !== undefined && snippet.version !== expectedVersion) {
      const err = new Error(`Conflict: snippet was modified by another session (expected version ${expectedVersion}, current version is ${snippet.version}).`);
      (err as any).statusCode = 409;
      throw err;
    }

    if (data.name !== undefined) snippet.name = data.name;
    if (data.shortcut !== undefined) snippet.shortcut = data.shortcut;
    if (data.folderId !== undefined) snippet.folderId = data.folderId;
    if (data.plainContent !== undefined) snippet.plainContent = data.plainContent;
    if (data.richContent !== undefined) snippet.richContent = data.richContent;
    if (data.description !== undefined) snippet.description = data.description;
    if (data.tags !== undefined) snippet.tags = data.tags;
    if (data.isFavorite !== undefined) snippet.isFavorite = data.isFavorite;
    if (data.isEnabled !== undefined) snippet.isEnabled = data.isEnabled;
    if (data.siteRestrictions !== undefined) snippet.siteRestrictions = data.siteRestrictions;

    snippet.version += 1;
    snippet.updatedAt = new Date().toISOString();

    // Record revision
    this.revisions.push({
      id: uuidv4(),
      snippetId: snippet.id,
      version: snippet.version,
      name: snippet.name,
      shortcut: snippet.shortcut,
      plainContent: snippet.plainContent,
      richContent: snippet.richContent,
      createdAt: snippet.updatedAt,
      createdById: updatedById || null
    });

    const rev = await this.bumpWorkspaceRevision(snippet.workspaceId);
    this.snippetRevisionsMap.push({ id: snippet.id, workspaceId: snippet.workspaceId, revision: rev });
    return snippet;
  }

  async deleteSnippet(id: string): Promise<void> {
    const snippet = this.snippets.get(id);
    if (!snippet) return;
    snippet.deletedAt = new Date().toISOString();

    const rev = await this.bumpWorkspaceRevision(snippet.workspaceId);
    this.deletedSnippets.push({ id: snippet.id, workspaceId: snippet.workspaceId, revision: rev });
  }

  async incrementSnippetUsage(id: string): Promise<void> {
    const s = this.snippets.get(id);
    if (s) {
      s.usageCount += 1;
      s.lastUsedAt = new Date().toISOString();
    }
  }

  async findSnippetRevisions(snippetId: string): Promise<SnippetRevision[]> {
    return this.revisions
      .filter((r) => r.snippetId === snippetId)
      .sort((a, b) => b.version - a.version);
  }

  async getWorkspaceRevision(workspaceId: string): Promise<number> {
    return this.workspaceRevisions.get(workspaceId) || 1;
  }

  async bumpWorkspaceRevision(workspaceId: string): Promise<number> {
    const current = this.workspaceRevisions.get(workspaceId) || 1;
    const next = current + 1;
    this.workspaceRevisions.set(workspaceId, next);
    return next;
  }

  async getSyncData(workspaceId: string, lastRevision: number): Promise<{
    currentRevision: number;
    snippets: Snippet[];
    deletedSnippetIds: string[];
    folders: Folder[];
    deletedFolderIds: string[];
  }> {
    const currentRev = await this.getWorkspaceRevision(workspaceId);

    // If client is brand new (lastRevision === 0) or requested everything
    if (lastRevision === 0) {
      const activeSnippets: Snippet[] = [];
      for (const s of this.snippets.values()) {
        if (s.workspaceId === workspaceId && !s.deletedAt) activeSnippets.push(s);
      }
      const activeFolders: Folder[] = [];
      for (const f of this.folders.values()) {
        if (f.workspaceId === workspaceId && !f.deletedAt) activeFolders.push(f);
      }
      return {
        currentRevision: currentRev,
        snippets: activeSnippets,
        deletedSnippetIds: [],
        folders: activeFolders,
        deletedFolderIds: []
      };
    }

    // Incremental sync
    const changedSnippetIds = new Set(
      this.snippetRevisionsMap
        .filter((r) => r.workspaceId === workspaceId && r.revision > lastRevision)
        .map((r) => r.id)
    );

    const changedSnippets: Snippet[] = [];
    for (const id of changedSnippetIds) {
      const s = this.snippets.get(id);
      if (s && !s.deletedAt) {
        changedSnippets.push(s);
      }
    }

    const deletedSnippetIds = this.deletedSnippets
      .filter((d) => d.workspaceId === workspaceId && d.revision > lastRevision)
      .map((d) => d.id);

    const changedFolderIds = new Set(
      this.folderRevisionsMap
        .filter((r) => r.workspaceId === workspaceId && r.revision > lastRevision)
        .map((r) => r.id)
    );

    const changedFolders: Folder[] = [];
    for (const id of changedFolderIds) {
      const f = this.folders.get(id);
      if (f && !f.deletedAt) {
        changedFolders.push(f);
      }
    }

    const deletedFolderIds = this.deletedFolders
      .filter((d) => d.workspaceId === workspaceId && d.revision > lastRevision)
      .map((d) => d.id);

    return {
      currentRevision: currentRev,
      snippets: changedSnippets,
      deletedSnippetIds,
      folders: changedFolders,
      deletedFolderIds
    };
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    if (!this.preferences.has(userId)) {
      this.preferences.set(userId, { ...DEFAULT_PREFERENCES });
    }
    return this.preferences.get(userId)!;
  }

  async updateUserPreferences(userId: string, data: Partial<UserPreferences>): Promise<UserPreferences> {
    const current = await this.getUserPreferences(userId);
    const updated = { ...current, ...data };
    this.preferences.set(userId, updated);
    return updated;
  }

  // Data Tables
  async findTables(workspaceId: string): Promise<DataTable[]> {
    const results: DataTable[] = [];
    for (const table of this.tables.values()) {
      if (table.workspaceId === workspaceId) {
        let count = 0;
        for (const row of this.tableRows.values()) {
          if (row.tableId === table.id) count++;
        }
        results.push({ ...table, rowCount: count });
      }
    }
    return results;
  }

  async findTableById(id: string): Promise<DataTable | null> {
    const table = this.tables.get(id);
    if (!table) return null;
    let count = 0;
    for (const row of this.tableRows.values()) {
      if (row.tableId === table.id) count++;
    }
    return { ...table, rowCount: count };
  }

  async createTable(workspaceId: string, data: { name: string; description?: string | null; columns: DataTableColumn[] }): Promise<DataTable> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const table: DataTable = {
      id,
      workspaceId,
      name: data.name,
      description: data.description ?? null,
      columns: data.columns,
      rowCount: 0,
      createdAt: now,
      updatedAt: now
    };
    this.tables.set(id, table);
    return table;
  }

  async updateTable(id: string, data: Partial<{ name: string; description?: string | null; columns: DataTableColumn[] }>): Promise<DataTable> {
    const table = this.tables.get(id);
    if (!table) throw new Error('Table not found');
    const updated: DataTable = {
      ...table,
      name: data.name ?? table.name,
      description: data.description !== undefined ? data.description : table.description,
      columns: data.columns ?? table.columns,
      updatedAt: new Date().toISOString()
    };
    this.tables.set(id, updated);
    return updated;
  }

  async deleteTable(id: string): Promise<void> {
    this.tables.delete(id);
    // Delete cascade rows
    for (const [rowId, row] of this.tableRows.entries()) {
      if (row.tableId === id) {
        this.tableRows.delete(rowId);
      }
    }
  }

  async findTableRows(tableId: string): Promise<DataTableRow[]> {
    const rows: DataTableRow[] = [];
    for (const row of this.tableRows.values()) {
      if (row.tableId === tableId) {
        rows.push(row);
      }
    }
    return rows;
  }

  async findTableRowById(tableId: string, rowId: string): Promise<DataTableRow | null> {
    const row = this.tableRows.get(rowId);
    if (!row || row.tableId !== tableId) return null;
    return row;
  }

  async createTableRow(tableId: string, data: Record<string, any>): Promise<DataTableRow> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const row: DataTableRow = {
      id,
      tableId,
      data,
      createdAt: now,
      updatedAt: now
    };
    this.tableRows.set(id, row);
    return row;
  }

  async updateTableRow(tableId: string, rowId: string, data: Record<string, any>): Promise<DataTableRow | null> {
    const row = this.tableRows.get(rowId);
    if (!row || row.tableId !== tableId) return null;
    const updated: DataTableRow = {
      ...row,
      data: { ...row.data, ...data },
      updatedAt: new Date().toISOString()
    };
    this.tableRows.set(rowId, updated);
    return updated;
  }

  async deleteTableRow(tableId: string, rowId: string): Promise<boolean> {
    const row = this.tableRows.get(rowId);
    if (!row || row.tableId !== tableId) return false;
    this.tableRows.delete(rowId);
    return true;
  }
}
