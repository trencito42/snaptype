import { Snippet } from '@snaptype/shared';

export interface SnippetDraft {
  snippetId: string;
  name: string;
  shortcut: string;
  folderId: string | null;
  plainContent: string;
  description: string;
  tags: string;
  isFavorite: boolean;
  isEnabled: boolean;
  baseVersion: number;
  isDirty: boolean;
  lastSavedAt?: number;
}

export interface SaveResult {
  success: boolean;
  snippet?: Snippet;
  error?: string;
  conflict?: boolean;
  skipped?: boolean;
}

export class DraftManager {
  private drafts = new Map<string, SnippetDraft>();
  private inFlight = new Map<string, Promise<SaveResult>>();
  private queued = new Set<string>();

  public initDraft(snippet: Snippet): SnippetDraft {
    const existing = this.drafts.get(snippet.id);
    if (existing && existing.isDirty) {
      return existing;
    }

    const draft: SnippetDraft = {
      snippetId: snippet.id,
      name: snippet.name,
      shortcut: snippet.shortcut,
      folderId: snippet.folderId,
      plainContent: snippet.plainContent,
      description: snippet.description || '',
      tags: (snippet.tags || []).join(', '),
      isFavorite: snippet.isFavorite,
      isEnabled: snippet.isEnabled,
      baseVersion: snippet.version,
      isDirty: false
    };

    this.drafts.set(snippet.id, draft);
    return draft;
  }

  public getDraft(snippetId: string): SnippetDraft | undefined {
    return this.drafts.get(snippetId);
  }

  public updateDraft(snippetId: string, updates: Partial<SnippetDraft>): SnippetDraft | undefined {
    const draft = this.drafts.get(snippetId);
    if (!draft) return undefined;

    Object.assign(draft, updates, { isDirty: true });
    return draft;
  }

  public discardDraft(snippet: Snippet): SnippetDraft {
    const clean: SnippetDraft = {
      snippetId: snippet.id,
      name: snippet.name,
      shortcut: snippet.shortcut,
      folderId: snippet.folderId,
      plainContent: snippet.plainContent,
      description: snippet.description || '',
      tags: (snippet.tags || []).join(', '),
      isFavorite: snippet.isFavorite,
      isEnabled: snippet.isEnabled,
      baseVersion: snippet.version,
      isDirty: false
    };
    this.drafts.set(snippet.id, clean);
    this.queued.delete(snippet.id);
    return clean;
  }

  /**
   * Explicitly replaces any local dirty draft with the server version (ST-037 / Defect 2)
   */
  public resetDraftToServer(snippet: Snippet): SnippetDraft {
    return this.discardDraft(snippet);
  }

  public hasDirtyDrafts(): boolean {
    for (const draft of this.drafts.values()) {
      if (draft.isDirty) return true;
    }
    return false;
  }

  public hasMeaningfulChanges(draft: SnippetDraft, original: Snippet): boolean {
    const origTags = (original.tags || []).join(', ');
    return (
      draft.name.trim() !== original.name.trim() ||
      draft.shortcut.trim() !== original.shortcut.trim() ||
      draft.folderId !== original.folderId ||
      draft.plainContent !== original.plainContent ||
      (draft.description || '').trim() !== (original.description || '').trim() ||
      draft.tags.trim() !== origTags.trim() ||
      draft.isFavorite !== original.isFavorite ||
      draft.isEnabled !== original.isEnabled
    );
  }

  public async save(
    snippetId: string,
    original: Snippet,
    apiUpdateFn: (id: string, payload: any) => Promise<Snippet>,
    forceOverwrite = false
  ): Promise<SaveResult> {
    // If a save is already running for this snippet, queue and wait
    if (this.inFlight.has(snippetId)) {
      this.queued.add(snippetId);
      await this.inFlight.get(snippetId);
      // Once previous save completes, check if this snippet is still queued
      if (this.queued.has(snippetId)) {
        this.queued.delete(snippetId);
        return this.save(snippetId, original, apiUpdateFn, forceOverwrite);
      }
      return { success: true, skipped: true };
    }

    const draft = this.drafts.get(snippetId);
    if (!draft) {
      return { success: false, error: 'Draft not found' };
    }

    // Optimization: Avoid creating unnecessary revisions if no content actually changed
    if (!draft.isDirty && !forceOverwrite) {
      return { success: true, skipped: true, snippet: original };
    }

    if (!this.hasMeaningfulChanges(draft, original) && !forceOverwrite) {
      draft.isDirty = false;
      return { success: true, skipped: true, snippet: original };
    }

    // Snapshot payload at moment of save
    const snapshotName = draft.name;
    const snapshotShortcut = draft.shortcut;
    const snapshotFolderId = draft.folderId;
    const snapshotPlainContent = draft.plainContent;
    const snapshotDesc = draft.description;
    const snapshotTags = draft.tags;
    const snapshotFav = draft.isFavorite;
    const snapshotEnabled = draft.isEnabled;
    const expectedVersion = forceOverwrite ? undefined : draft.baseVersion;

    const payload = {
      name: snapshotName,
      shortcut: snapshotShortcut,
      folderId: snapshotFolderId,
      plainContent: snapshotPlainContent,
      description: snapshotDesc,
      tags: snapshotTags.split(',').map((t) => t.trim()).filter(Boolean),
      isFavorite: snapshotFav,
      isEnabled: snapshotEnabled,
      expectedVersion
    };

    const savePromise = (async (): Promise<SaveResult> => {
      try {
        const updated = await apiUpdateFn(snippetId, payload);

        // Check if newer user edits arrived while request was in-flight
        const currentDraft = this.drafts.get(snippetId);
        if (currentDraft) {
          currentDraft.baseVersion = updated.version;
          currentDraft.lastSavedAt = Date.now();

          const hasNewerEdits =
            currentDraft.name !== snapshotName ||
            currentDraft.shortcut !== snapshotShortcut ||
            currentDraft.folderId !== snapshotFolderId ||
            currentDraft.plainContent !== snapshotPlainContent ||
            currentDraft.description !== snapshotDesc ||
            currentDraft.tags !== snapshotTags ||
            currentDraft.isFavorite !== snapshotFav ||
            currentDraft.isEnabled !== snapshotEnabled;

          if (!hasNewerEdits) {
            currentDraft.isDirty = false;
          }
        }

        return { success: true, snippet: updated };
      } catch (err: any) {
        // On error or 409 conflict, complete unsaved draft is preserved!
        const isConflict = err?.status === 409;
        return {
          success: false,
          conflict: isConflict,
          error: err?.message || (isConflict ? 'Conflict: Modified on another device.' : 'Failed to save snippet')
        };
      } finally {
        this.inFlight.delete(snippetId);
      }
    })();

    this.inFlight.set(snippetId, savePromise);
    return savePromise;
  }
}

