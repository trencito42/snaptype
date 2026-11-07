import { describe, it, expect, vi } from 'vitest';
import { DraftManager } from '../../apps/web/src/utils/draft-manager.js';
import { Snippet } from '@snaptype/shared';

describe('Release Blocker 3: Race-Safe Autosave State Machine', () => {
  const baseSnippet: Snippet = {
    id: 'snip-100',
    workspaceId: 'ws-1',
    folderId: null,
    name: 'Customer Greeting',
    shortcut: 'cgreet',
    plainContent: 'Hello customer!',
    description: 'Greets the user',
    tags: ['support', 'greeting'],
    isFavorite: false,
    isEnabled: true,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  it('initializes clean draft and tracks dirty state on edits', () => {
    const manager = new DraftManager();
    const draft = manager.initDraft(baseSnippet);

    expect(draft.isDirty).toBe(false);
    expect(draft.plainContent).toBe('Hello customer!');
    expect(manager.hasDirtyDrafts()).toBe(false);

    manager.updateDraft('snip-100', { plainContent: 'Hello valued customer!' });
    const updated = manager.getDraft('snip-100');

    expect(updated?.isDirty).toBe(true);
    expect(updated?.plainContent).toBe('Hello valued customer!');
    expect(manager.hasDirtyDrafts()).toBe(true);
  });

  it('avoids unnecessary revisions when no actual content changed', async () => {
    const manager = new DraftManager();
    manager.initDraft(baseSnippet);

    const apiSaveMock = vi.fn();
    const res = await manager.save('snip-100', baseSnippet, apiSaveMock);

    expect(res.success).toBe(true);
    expect(res.skipped).toBe(true);
    expect(apiSaveMock).not.toHaveBeenCalled();
  });

  it('serializes saves and preserves edits made while an earlier save was in-flight', async () => {
    const manager = new DraftManager();
    manager.initDraft(baseSnippet);

    manager.updateDraft('snip-100', { plainContent: 'Save 1 Content' });

    let resolveFirstApi: (s: Snippet) => void;
    const firstApiPromise = new Promise<Snippet>((resolve) => {
      resolveFirstApi = resolve;
    });

    const apiSaveMock = vi.fn()
      .mockImplementationOnce(() => firstApiPromise)
      .mockImplementationOnce(async (_id, payload) => ({
        ...baseSnippet,
        version: 3,
        plainContent: payload.plainContent
      }));

    // Start first save (in-flight)
    const savePromise1 = manager.save('snip-100', baseSnippet, apiSaveMock);

    // User continues typing while first save is running
    manager.updateDraft('snip-100', { plainContent: 'Save 2 Content (Newer Edits)' });

    // Second save initiated (e.g. debounced trigger or snippet switch)
    const savePromise2 = manager.save('snip-100', baseSnippet, apiSaveMock);

    // Resolve first save
    resolveFirstApi!({
      ...baseSnippet,
      version: 2,
      plainContent: 'Save 1 Content'
    });

    await savePromise1;
    const res2 = await savePromise2;

    expect(apiSaveMock).toHaveBeenCalledTimes(2);
    // Second save used updated draft content and updated baseVersion!
    expect(apiSaveMock).toHaveBeenLastCalledWith('snip-100', expect.objectContaining({
      plainContent: 'Save 2 Content (Newer Edits)',
      expectedVersion: 2
    }));

    expect(res2.success).toBe(true);
    expect(manager.getDraft('snip-100')?.isDirty).toBe(false);
  });

  it('preserves complete unsaved draft on network failure or 409 conflict', async () => {
    const manager = new DraftManager();
    manager.initDraft(baseSnippet);

    manager.updateDraft('snip-100', { plainContent: 'My local uncommitted edits' });

    const conflictErr = new Error('Conflict: Modified on another device');
    (conflictErr as any).status = 409;

    const apiSaveMock = vi.fn().mockRejectedValue(conflictErr);

    const res = await manager.save('snip-100', baseSnippet, apiSaveMock);

    expect(res.success).toBe(false);
    expect(res.conflict).toBe(true);

    // Draft MUST remain intact in memory with isDirty: true
    const preservedDraft = manager.getDraft('snip-100');
    expect(preservedDraft?.isDirty).toBe(true);
    expect(preservedDraft?.plainContent).toBe('My local uncommitted edits');
  });

  it('allows explicit overwrite with forceOverwrite=true', async () => {
    const manager = new DraftManager();
    manager.initDraft(baseSnippet);

    manager.updateDraft('snip-100', { plainContent: 'Force overwritten edits' });

    const apiSaveMock = vi.fn().mockResolvedValue({
      ...baseSnippet,
      version: 5,
      plainContent: 'Force overwritten edits'
    });

    const res = await manager.save('snip-100', baseSnippet, apiSaveMock, true);

    expect(res.success).toBe(true);
    expect(apiSaveMock).toHaveBeenCalledWith('snip-100', expect.objectContaining({
      plainContent: 'Force overwritten edits',
      expectedVersion: undefined // force overwrite omits version check
    }));
  });

  it('reproduces an HTTP 409 conflict followed by Reload Server Version discarding dirty edits', async () => {
    const manager = new DraftManager();
    manager.initDraft(baseSnippet);

    // User makes uncommitted local changes
    manager.updateDraft('snip-100', {
      name: 'Local Changed Name',
      plainContent: 'Local uncommitted content that conflicts'
    });

    // Attempting to save encounters an HTTP 409 conflict
    const conflictErr = new Error('Conflict: Modified on another device or tab');
    (conflictErr as any).status = 409;
    const apiSaveMock = vi.fn().mockRejectedValue(conflictErr);

    const res = await manager.save('snip-100', baseSnippet, apiSaveMock);
    expect(res.success).toBe(false);
    expect(res.conflict).toBe(true);

    // Draft is kept dirty during conflict
    const conflictDraft = manager.getDraft('snip-100');
    expect(conflictDraft?.isDirty).toBe(true);
    expect(conflictDraft?.plainContent).toBe('Local uncommitted content that conflicts');

    // Server has a newer version updated by another device/tab
    const serverSnippetVersion2: Snippet = {
      ...baseSnippet,
      name: 'Server Updated Name',
      plainContent: 'Server updated content v2',
      version: 2,
      updatedAt: new Date().toISOString()
    };

    // User chooses "Reload Server Version"
    const reloadedDraft = manager.resetDraftToServer(serverSnippetVersion2);

    // Verify local dirty edits are discarded and server state is cleanly adopted
    expect(reloadedDraft.name).toBe('Server Updated Name');
    expect(reloadedDraft.plainContent).toBe('Server updated content v2');
    expect(reloadedDraft.baseVersion).toBe(2);
    expect(reloadedDraft.isDirty).toBe(false);
    expect(manager.hasDirtyDrafts()).toBe(false);

    // Subsequent initDraft returns clean server version
    const subsequent = manager.initDraft(serverSnippetVersion2);
    expect(subsequent.isDirty).toBe(false);
    expect(subsequent.plainContent).toBe('Server updated content v2');
  });
});

