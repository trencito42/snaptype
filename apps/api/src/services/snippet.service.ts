import { IRepository } from '../db/repository.js';
import { CreateSnippetSchema, CreateSnippetInput, UpdateSnippetInput, ImportSnippetsInput, Snippet, Folder, WorkspaceRole } from '@snaptype/shared';

export interface SnippetAuthorizer {
  checkAccess(workspaceId: string, userId: string, requiredRole?: WorkspaceRole): Promise<boolean>;
}

export class SnippetService {
  constructor(private repo: IRepository) {}

  public async verifyWorkspaceAccess(workspaceId: string, userId: string, minRole: WorkspaceRole = 'viewer'): Promise<boolean> {
    const member = await this.repo.findWorkspaceMember(workspaceId, userId);
    if (!member) return false;

    const roleHierarchy: Record<WorkspaceRole, number> = {
      viewer: 1,
      editor: 2,
      admin: 3,
      owner: 4
    };

    return roleHierarchy[member.role] >= roleHierarchy[minRole];
  }

  public async getSnippets(
    workspaceId: string,
    userId: string,
    options: { folderId?: string | null; search?: string; tag?: string; favoriteOnly?: boolean } = {}
  ): Promise<Snippet[]> {
    const hasAccess = await this.verifyWorkspaceAccess(workspaceId, userId, 'viewer');
    if (!hasAccess) {
      throw new Error('Unauthorized workspace access');
    }

    return this.repo.findSnippets(workspaceId, options);
  }

  public async getSnippet(id: string, userId: string): Promise<Snippet> {
    const snippet = await this.repo.findSnippetById(id);
    if (!snippet) {
      throw new Error('Snippet not found');
    }

    const hasAccess = await this.verifyWorkspaceAccess(snippet.workspaceId, userId, 'viewer');
    if (!hasAccess) {
      throw new Error('Unauthorized workspace access');
    }

    return snippet;
  }

  /** A snippet may only live in a live folder of its own workspace. */
  private async assertFolderInWorkspace(workspaceId: string, folderId: string | null | undefined): Promise<void> {
    if (!folderId) return;
    const folder = await this.repo.findFolderById(folderId);
    if (!folder || folder.workspaceId !== workspaceId) {
      throw new Error('Folder not found in this workspace');
    }
  }

  public async createSnippet(workspaceId: string, userId: string, input: CreateSnippetInput): Promise<Snippet> {
    const hasAccess = await this.verifyWorkspaceAccess(workspaceId, userId, 'editor');
    if (!hasAccess) {
      throw new Error('Unauthorized workspace access (requires editor or higher)');
    }

    await this.assertFolderInWorkspace(workspaceId, input.folderId);

    // Check duplicate shortcut within workspace
    const existing = await this.repo.findSnippetByShortcut(workspaceId, input.shortcut);
    if (existing) {
      // Shortcut already exists in this workspace
      throw new Error(`A snippet with shortcut "${input.shortcut}" already exists in this workspace.`);
    }

    return this.repo.createSnippet(workspaceId, input, userId);
  }

  public async updateSnippet(id: string, userId: string, input: UpdateSnippetInput): Promise<Snippet> {
    const snippet = await this.repo.findSnippetById(id);
    if (!snippet) throw new Error('Snippet not found');

    const hasAccess = await this.verifyWorkspaceAccess(snippet.workspaceId, userId, 'editor');
    if (!hasAccess) throw new Error('Unauthorized workspace access');

    await this.assertFolderInWorkspace(snippet.workspaceId, input.folderId);

    // Optimistic concurrency check
    if (input.expectedVersion !== undefined && input.expectedVersion !== snippet.version) {
      const err = new Error(`Conflict: snippet was modified by another session (expected version ${input.expectedVersion}, current version is ${snippet.version}).`);
      (err as any).statusCode = 409;
      throw err;
    }

    // If shortcut is being changed, check uniqueness
    if (input.shortcut && input.shortcut.toLowerCase() !== snippet.shortcut.toLowerCase()) {
      const duplicate = await this.repo.findSnippetByShortcut(snippet.workspaceId, input.shortcut);
      if (duplicate && duplicate.id !== id) {
        throw new Error(`A snippet with shortcut "${input.shortcut}" already exists in this workspace.`);
      }
    }

    return this.repo.updateSnippet(id, input, userId, input.expectedVersion);
  }

  public async deleteSnippet(id: string, userId: string): Promise<void> {
    const snippet = await this.repo.findSnippetById(id);
    if (!snippet) return;

    const hasAccess = await this.verifyWorkspaceAccess(snippet.workspaceId, userId, 'editor');
    if (!hasAccess) throw new Error('Unauthorized workspace access');

    await this.repo.deleteSnippet(id);
  }

  public async duplicateSnippet(id: string, userId: string): Promise<Snippet> {
    const original = await this.getSnippet(id, userId);

    const hasEditorAccess = await this.verifyWorkspaceAccess(original.workspaceId, userId, 'editor');
    if (!hasEditorAccess) {
      throw new Error('Unauthorized: Editor access required to duplicate snippet');
    }

    let newShortcut = `${original.shortcut}_copy`;
    let counter = 1;
    while (await this.repo.findSnippetByShortcut(original.workspaceId, newShortcut)) {
      newShortcut = `${original.shortcut}_copy${counter++}`;
    }

    return this.repo.createSnippet(original.workspaceId, {
      folderId: original.folderId,
      name: `${original.name} (Copy)`,
      shortcut: newShortcut,
      plainContent: original.plainContent,
      richContent: original.richContent,
      description: original.description,
      tags: [...original.tags],
      isFavorite: false,
      isEnabled: original.isEnabled,
      siteRestrictions: original.siteRestrictions
    }, userId);
  }

  public async getSnippetRevisions(id: string, userId: string) {
    const snippet = await this.getSnippet(id, userId);
    return this.repo.findSnippetRevisions(snippet.id);
  }

  public async recordUsage(id: string, userId: string): Promise<void> {
    const snippet = await this.repo.findSnippetById(id);
    if (!snippet) return;

    const hasAccess = await this.verifyWorkspaceAccess(snippet.workspaceId, userId, 'viewer');
    if (!hasAccess) {
      throw new Error('Unauthorized workspace access');
    }

    await this.repo.incrementSnippetUsage(id);
  }

  public async exportWorkspace(workspaceId: string, userId: string) {
    const hasAccess = await this.verifyWorkspaceAccess(workspaceId, userId, 'viewer');
    if (!hasAccess) throw new Error('Unauthorized workspace access');

    const snippets = await this.repo.findSnippets(workspaceId);
    const folders = await this.repo.findFolders(workspaceId);

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      workspaceId,
      folders,
      snippets
    };
  }

  public async importSnippets(workspaceId: string, userId: string, input: ImportSnippetsInput) {
    const hasAccess = await this.verifyWorkspaceAccess(workspaceId, userId, 'editor');
    if (!hasAccess) throw new Error('Unauthorized workspace access');

    const created: Snippet[] = [];
    const skipped: string[] = [];
    const failed: { shortcut: string; reason: string }[] = [];
    const warnings: string[] = [];

    // Folders are keyed by (parent, name) so "A/Support" and "B/Support" stay distinct.
    const folderKey = (parentId: string | null, name: string) => `${parentId ?? ''}|${name.toLowerCase().trim()}`;
    const existingFolders = await this.repo.findFolders(workspaceId);
    const folderMap = new Map<string, Folder>();
    for (const f of existingFolders) folderMap.set(folderKey(f.parentId ?? null, f.name), f);

    // Map exported folder ids to folders in the TARGET workspace (ST-033).
    const folderIdMap = new Map<string, string>();
    const pending = (input.folders ?? []).filter((f) => f && f.name && f.name.trim());
    // Parents may appear after children in a file: resolve in passes until no progress.
    const knownIds = new Set(pending.map((f) => f.id).filter((id): id is string => Boolean(id)));
    let remaining = pending;
    while (remaining.length > 0) {
      const next: typeof remaining = [];
      for (const f of remaining) {
        const parentExported = f.parentId && knownIds.has(f.parentId) ? f.parentId : null;
        if (parentExported && !folderIdMap.has(parentExported)) { next.push(f); continue; }
        const parentId = parentExported ? folderIdMap.get(parentExported)! : null;
        const key = folderKey(parentId, f.name);
        let target = folderMap.get(key);
        if (!target) {
          target = await this.repo.createFolder(workspaceId, {
            name: f.name.trim().slice(0, 100),
            parentId,
            color: f.color || null,
            icon: f.icon || null,
            isFavorite: Boolean(f.isFavorite),
            sortOrder: f.sortOrder ?? 0
          });
          folderMap.set(key, target);
        }
        if (f.id) folderIdMap.set(f.id, target.id);
      }
      if (next.length === remaining.length) {
        // Cycle inside the file: attach the rest at root rather than lose them.
        for (const f of next) {
          warnings.push(`Folder "${f.name}" has an unresolved parent; imported at root.`);
          const key = folderKey(null, f.name);
          let target = folderMap.get(key);
          if (!target) {
            target = await this.repo.createFolder(workspaceId, { name: f.name.trim().slice(0, 100) });
            folderMap.set(key, target);
          }
          if (f.id) folderIdMap.set(f.id, target.id);
        }
        break;
      }
      remaining = next;
    }

    for (const item of input.snippets) {
      const label = (item.shortcut || '').trim() || '(empty shortcut)';
      try {
        let content = item.plainContent;
        if (input.format === 'textblaze_json') {
          const conversion = this.convertFromTextBlaze(content);
          content = conversion.converted;
          if (conversion.warnings.length > 0) warnings.push(`[${item.name}] ` + conversion.warnings.join('; '));
        }

        let shortcut = item.shortcut.trim();
        let folderId: string | null = null;
        if (item.folderId && folderIdMap.has(item.folderId)) {
          folderId = folderIdMap.get(item.folderId)!;
        } else if (item.folderName && item.folderName.trim()) {
          const key = folderKey(null, item.folderName);
          let f = folderMap.get(key);
          if (!f) {
            f = await this.repo.createFolder(workspaceId, { name: item.folderName.trim().slice(0, 100) });
            folderMap.set(key, f);
          }
          folderId = f.id;
        }

        // Same validation as the normal create endpoint (shortcut charset/length, field limits).
        const valid = CreateSnippetSchema.safeParse({
          name: item.name, shortcut, plainContent: content, richContent: item.richContent ?? null,
          description: item.description ?? null, tags: item.tags ?? [],
          isFavorite: item.isFavorite ?? false, isEnabled: item.isEnabled ?? true,
          siteRestrictions: item.siteRestrictions ?? null
        });
        if (!valid.success) {
          failed.push({ shortcut: label, reason: valid.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
          continue;
        }
        const data = valid.data;

        const existing = await this.repo.findSnippetByShortcut(workspaceId, shortcut);
        if (existing) {
          if (input.conflictStrategy === 'skip') { skipped.push(shortcut); continue; }
          if (input.conflictStrategy === 'overwrite') {
            const updated = await this.repo.updateSnippet(existing.id, {
              name: data.name, plainContent: data.plainContent, richContent: data.richContent ?? null,
              description: data.description ?? null, tags: data.tags, folderId,
              isFavorite: data.isFavorite, isEnabled: data.isEnabled, siteRestrictions: data.siteRestrictions ?? null
            }, userId);
            created.push(updated);
            continue;
          }
          let suffix = 1;
          let candidate = `${shortcut}_${suffix}`;
          while (await this.repo.findSnippetByShortcut(workspaceId, candidate)) candidate = `${shortcut}_${++suffix}`;
          shortcut = candidate.slice(0, 64);
        }

        created.push(await this.repo.createSnippet(workspaceId, {
          name: data.name, shortcut, plainContent: data.plainContent, richContent: data.richContent ?? null,
          description: data.description ?? null, tags: data.tags, folderId,
          isFavorite: data.isFavorite, isEnabled: data.isEnabled, siteRestrictions: data.siteRestrictions ?? null
        }, userId));
      } catch (err: any) {
        failed.push({ shortcut: label, reason: err?.message || 'Unexpected error' });
      }
    }

    return {
      importedCount: created.length,
      skippedCount: skipped.length,
      skipped,
      failedCount: failed.length,
      failed,
      warnings,
      created
    };
  }

  /**
   * Best-effort Text Blaze migration conversion with conversion warnings
   */
  private convertFromTextBlaze(text: string): { converted: string; warnings: string[] } {
    const warnings: string[] = [];
    let converted = text;

    // Text blaze {time} or {date} -> SnapType {{time}} or {{date}}
    converted = converted.replace(/\{time:([^}]+)\}/gi, (_m, fmt) => `{{time:format="${fmt}"}}`);
    converted = converted.replace(/\{time\}/gi, '{{time}}');
    converted = converted.replace(/\{date:([^}]+)\}/gi, (_m, fmt) => `{{date:format="${fmt}"}}`);
    converted = converted.replace(/\{date\}/gi, '{{date}}');

    // Text blaze {formtext: name=...} -> SnapType {{input:...}}
    converted = converted.replace(/\{formtext:\s*name=([a-zA-Z0-9_]+)(?:;\s*default=([^;}]+))?[^}]*\}/gi, (_m, name, def) => {
      return def ? `{{input:${name}|default="${def}"}}` : `{{input:${name}}}`;
    });

    // Text blaze {formparagraph: name=...} -> SnapType {{paragraph:...}}
    converted = converted.replace(/\{formparagraph:\s*name=([a-zA-Z0-9_]+)(?:;\s*default=([^;}]+))?[^}]*\}/gi, (_m, name, def) => {
      return def ? `{{paragraph:${name}|default="${def}"}}` : `{{paragraph:${name}}}`;
    });

    // Text blaze {formmenu: name=...} -> SnapType {{dropdown:...}}
    converted = converted.replace(/\{formmenu:\s*([a-zA-Z0-9_]+)(?:;\s*options=([^;}]+))?[^}]*\}/gi, (_m, name, opts) => {
      return opts ? `{{dropdown:${name}|options="${opts}"}}` : `{{dropdown:${name}}}`;
    });

    // Check for unsupported tags (e.g. arbitrary scripts or undocumented commands)
    const unmatched = converted.match(/\{[a-zA-Z0-9_]+:[^}]+\}/g);
    if (unmatched) {
      for (const u of unmatched) {
        if (!u.startsWith('{{')) {
          warnings.push(`Command "${u}" requires manual adjustment`);
        }
      }
    }

    return { converted, warnings };
  }
}

