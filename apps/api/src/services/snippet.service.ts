import { IRepository } from '../db/repository.js';
import { CreateSnippetInput, UpdateSnippetInput, ImportSnippetsInput, Snippet, Folder, WorkspaceRole } from '@snaptype/shared';

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

  public async createSnippet(workspaceId: string, userId: string, input: CreateSnippetInput): Promise<Snippet> {
    const hasAccess = await this.verifyWorkspaceAccess(workspaceId, userId, 'editor');
    if (!hasAccess) {
      throw new Error('Unauthorized workspace access (requires editor or higher)');
    }

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

    return this.repo.updateSnippet(id, input, userId);
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
    const warnings: string[] = [];

    // Preload folders in workspace
    const existingFolders = await this.repo.findFolders(workspaceId);
    const folderMap = new Map<string, Folder>();
    for (const f of existingFolders) {
      folderMap.set(f.name.toLowerCase().trim(), f);
    }

    for (const item of input.snippets) {
      let shortcut = item.shortcut.trim();
      if (!shortcut) continue;

      let folderId: string | null = null;
      if (item.folderName) {
        const normFolderName = item.folderName.toLowerCase().trim();
        if (folderMap.has(normFolderName)) {
          folderId = folderMap.get(normFolderName)!.id;
        } else {
          // Create new folder
          const newFolder = await this.repo.createFolder(workspaceId, { name: item.folderName.trim() });
          folderMap.set(normFolderName, newFolder);
          folderId = newFolder.id;
        }
      }

      // Convert Text Blaze format if needed
      let content = item.plainContent;
      if (input.format === 'textblaze_json') {
        const conversion = this.convertFromTextBlaze(content);
        content = conversion.converted;
        if (conversion.warnings.length > 0) {
          warnings.push(`[${item.name}] ` + conversion.warnings.join('; '));
        }
      }

      // Handle shortcut conflict
      const existing = await this.repo.findSnippetByShortcut(workspaceId, shortcut);
      if (existing) {
        if (input.conflictStrategy === 'skip') {
          skipped.push(shortcut);
          continue;
        }
        if (input.conflictStrategy === 'overwrite') {
          const updated = await this.repo.updateSnippet(existing.id, {
            name: item.name,
            plainContent: content,
            richContent: item.richContent || null,
            description: item.description || null,
            tags: item.tags || [],
            folderId
          }, userId);
          created.push(updated);
          continue;
        }
        if (input.conflictStrategy === 'duplicate') {
          let suffix = 1;
          let candidate = `${shortcut}_${suffix}`;
          while (await this.repo.findSnippetByShortcut(workspaceId, candidate)) {
            candidate = `${shortcut}_${++suffix}`;
          }
          shortcut = candidate;
        }
      }

      const snippet = await this.repo.createSnippet(workspaceId, {
        name: item.name,
        shortcut,
        plainContent: content,
        richContent: item.richContent || null,
        description: item.description || null,
        tags: item.tags || [],
        folderId,
        isFavorite: false,
        isEnabled: true
      }, userId);

      created.push(snippet);
    }

    return {
      importedCount: created.length,
      skippedCount: skipped.length,
      skipped,
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

