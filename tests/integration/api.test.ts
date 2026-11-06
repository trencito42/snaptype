import { describe, it, expect, beforeAll } from 'vitest';
import { InMemoryRepository } from '../../apps/api/src/db/repository.js';
import { AuthService } from '../../apps/api/src/services/auth.service.js';
import { SnippetService } from '../../apps/api/src/services/snippet.service.js';

describe('SnapType API Core Services & Business Rules', () => {
  let repo: InMemoryRepository;
  let authService: AuthService;
  let snippetService: SnippetService;

  beforeAll(() => {
    repo = new InMemoryRepository();
    authService = new AuthService(repo);
    snippetService = new SnippetService(repo);
  });

  describe('Authentication & Email OTP Flow', () => {
    const testEmail = 'support.agent@company.com';

    it('issues a verification challenge with cooldown rate limiting', async () => {
      const res1 = await authService.requestOTP(testEmail);
      expect(res1.success).toBe(true);

      // Rapid immediate request should trigger cooldown
      const res2 = await authService.requestOTP(testEmail);
      expect(res2.success).toBe(false);
      expect(res2.cooldownRemaining).toBeGreaterThan(0);
    });

    it('rejects invalid OTP codes', async () => {
      const res = await authService.verifyOTP(testEmail, '000000');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid verification code');
    });

    it('successfully verifies correct OTP, creates user and seeds starter snippets', async () => {
      // Find latest challenge in repo
      const challenge = await repo.findLatestChallenge(testEmail);
      expect(challenge).not.toBeNull();

      // In tests, we can verify with the actual code or mock
      // Since HMAC is verified, let's create a known code challenge
      const knownEmail = 'agent2@company.com';
      await authService.requestOTP(knownEmail);
      const ch = await repo.findLatestChallenge(knownEmail);

      // Verify the hashing logic by finding the valid 6-digit match or verifying directly
      let correctCode = '';
      for (let c = 100000; c <= 999999; c++) {
        // Calculate hash using authService's private method
        const hash = (authService as any).hashOTP(knownEmail, String(c));
        if (hash === ch?.hashedCode) {
          correctCode = String(c);
          break;
        }
      }

      expect(correctCode).not.toBe('');

      // Verify with the correct code
      const verifyRes = await authService.verifyOTP(knownEmail, correctCode);
      expect(verifyRes.success).toBe(true);
      expect(verifyRes.token).toBeDefined();
      expect(verifyRes.user?.email).toBe(knownEmail);
      expect(verifyRes.isNewUser).toBe(true);

      // Validate session token
      const sessionUser = await authService.validateSessionToken(verifyRes.token!);
      expect(sessionUser?.id).toBe(verifyRes.user?.id);

      // Verify that starter snippets were seeded in personal workspace
      const userWorkspaces = await repo.findUserWorkspaces(verifyRes.user!.id);
      expect(userWorkspaces.length).toBeGreaterThan(0);
      const personalWs = userWorkspaces[0].workspace;

      const snippets = await snippetService.getSnippets(personalWs.id, verifyRes.user!.id);
      expect(snippets.length).toBe(5); // cerbonus, msver, /salut, /closing, retragere
      expect(snippets.some((s) => s.shortcut === 'cerbonus')).toBe(true);
      expect(snippets.some((s) => s.shortcut === 'msver')).toBe(true);

      // Verify single-use: re-verifying the same OTP challenge fails
      const reuseRes = await authService.verifyOTP(knownEmail, correctCode);
      expect(reuseRes.success).toBe(false);
      expect(reuseRes.error).toContain('already been used');
    });
  });

  describe('Snippet CRUD & Concurrency Protection', () => {
    let userId: string;
    let workspaceId: string;

    beforeAll(async () => {
      const user = await repo.createUser('editor@company.com');
      userId = user.id;
      const ws = await repo.createWorkspace('Support Team', 'support-team', userId, true);
      workspaceId = ws.id;
    });

    it('creates, reads, and updates snippets', async () => {
      const snippet = await snippetService.createSnippet(workspaceId, userId, {
        name: 'Refund Notice',
        shortcut: 'refund10',
        plainContent: 'Your refund of {{formula: amount * 1}} has been approved.',
        tags: ['billing', 'refund']
      });

      expect(snippet.id).toBeDefined();
      expect(snippet.version).toBe(1);

      // Update snippet
      const updated = await snippetService.updateSnippet(snippet.id, userId, {
        plainContent: 'Updated refund notice.',
        expectedVersion: 1
      });

      expect(updated.version).toBe(2);
      expect(updated.plainContent).toBe('Updated refund notice.');
    });

    it('enforces optimistic concurrency control (expectedVersion)', async () => {
      const snip = await snippetService.createSnippet(workspaceId, userId, {
        name: 'Concurrent Test',
        shortcut: 'concur',
        plainContent: 'v1'
      });

      // Session A updates to v2
      await snippetService.updateSnippet(snip.id, userId, {
        plainContent: 'v2 by Session A',
        expectedVersion: 1
      });

      // Session B attempts to update with stale version 1 -> should fail with conflict
      await expect(
        snippetService.updateSnippet(snip.id, userId, {
          plainContent: 'v2 by Session B',
          expectedVersion: 1
        })
      ).rejects.toThrow(/Conflict/);
    });

    it('prevents unauthorized access across users/workspaces', async () => {
      const stranger = await repo.createUser('stranger@other.com');

      // Stranger attempts to view private workspace snippets
      await expect(
        snippetService.getSnippets(workspaceId, stranger.id)
      ).rejects.toThrow(/Unauthorized/);
    });
  });

  describe('Revision-based Synchronization Protocol', () => {
    it('returns only changed and deleted items since lastRevision', async () => {
      const user = await repo.createUser('sync.tester@company.com');
      const ws = await repo.createWorkspace('Sync Workspace', 'sync-ws', user.id, true);

      // Create 2 snippets
      const s1 = await repo.createSnippet(ws.id, { name: 'S1', shortcut: 's1', plainContent: 'c1' }, user.id);
      const s2 = await repo.createSnippet(ws.id, { name: 'S2', shortcut: 's2', plainContent: 'c2' }, user.id);

      const syncInit = await repo.getSyncData(ws.id, 0);
      expect(syncInit.snippets.length).toBe(2);
      const lastKnownRev = syncInit.currentRevision;

      // Update s1 and delete s2
      await repo.updateSnippet(s1.id, { plainContent: 'updated c1' }, user.id);
      await repo.deleteSnippet(s2.id);

      // Client requests sync with lastKnownRev
      const syncIncremental = await repo.getSyncData(ws.id, lastKnownRev);
      expect(syncIncremental.currentRevision).toBeGreaterThan(lastKnownRev);
      expect(syncIncremental.snippets.length).toBe(1);
      expect(syncIncremental.snippets[0].id).toBe(s1.id);
      expect(syncIncremental.deletedSnippetIds).toEqual([s2.id]);
    });
  });
});
