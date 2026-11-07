# SnapType Remediation State & Checkpoint

**Last Updated:** 2026-11-07  
**Overall Status:** COMPLETED / VERIFIED_PRODUCTION_READY  
**Test Suite:** 20 Test Files, 87 Tests Passing (100% pass rate)  
**Typecheck:** Strict multi-project TypeScript typecheck passed cleanly across all 6 workspaces (`packages/shared`, `packages/snippet-engine`, `packages/browser-compat`, `apps/api`, `apps/web`, `apps/extension`).  
**Extension Artifacts:** Packaged `chrome-extension.zip` (65.7 KB) and `firefox-extension.zip` (65.8 KB) with `content.js` bundle size 24.2 KB gzipped (well under the 75 KB low-end PC target).  

---

## Release Blockers Remediated & Verified (Post-d7cf46d Audit)

1. **Docker Compose Syntax & Secrets (Blockers 1 & 2):**
   - Enclosed all `${VAR:?Error: ...}` interpolations in double quotes in `docker-compose.yml`. Verified via `docker compose --env-file .env.docker.example config` and unit test `tests/unit/docker-compose.test.ts`.
   - Wired `ALLOWED_ORIGINS` and `APP_URL` into docker-compose `api` service environment and `.env.docker.example`.

2. **ESM Migration Runner & Safe Dynamic Schema Additions (Blocker 3):**
   - Replaced illegal `__dirname` in `apps/api/src/db/migrate.ts` with `fileURLToPath(import.meta.url)`.
   - Replaced MySQL client-only `DELIMITER $$` with portable `information_schema.COLUMNS` check function `ensureColumnExists`.

3. **Extension Release Builds & No Loopback Permissions (Blocker 4):**
   - Added `--production` mode in `apps/extension/build.js` and `package-zips.js`.
   - Automatically requires HTTPS/public API URL (`https://api.snaptype.app/api/v1`) and App URL (`https://snaptype.app`).
   - Strips `localhost` and `127.0.0.1` from `host_permissions` in production manifest.
   - Verified via unit test `tests/unit/extension-build.test.ts`.

4. **Workspace Isolation, Scope Switching & 403 Revocation (Blockers 5 & 6):**
   - Background worker persists and sends `currentWorkspaceId` in `/sync?workspaceId=...`.
   - Added `SELECT_WORKSPACE` message handler to switch workspace, reset revision, and sync fresh data.
   - Handled HTTP 403 in `syncWithServer()`: flushes in-memory snippets, tables, and session storage, then broadcasts `REFRESH_DATA` across all open tabs.

5. **Account Deletion Cascade Safeguard (Blocker 7):**
   - Guarded `DELETE /api/v1/me`: rejects account deletion with HTTP 400 if user is owner of a shared team workspace with active members.

6. **Fail-Safe Dynamic Rendering at Insertion (Blocker 8):**
   - Checked `rendered.errors.length > 0` before insertion in `content.ts` and `popup.ts`.
   - Blocks insertion of unresolved error tokens (`[Table Error: ...]`), keeping original typed text and caret intact.
   - Shows floating non-intrusive diagnostic tooltip.

7. **Live Data Tables in Extension (Blocker 9):**
   - Included workspace tables and rows in `/sync` response (`SyncResponse.tables`).
   - Synced tables into background state and injected into `content.ts` `tableResolver`.

8. **Secure Workspace Invitations (Blocker 10):**
   - Stored SHA-256 token hash (`token_hash VARCHAR(128)`) in database.
   - Scoped `revokeWorkspaceInvitation(workspaceId, id)` to prevent cross-workspace revocation.
   - Inviting existing registered users issues an invitation rather than forcibly adding them without consent.

---

## Functional Accuracy Items (11–24)

- **11 (Usage Recording):** Background message handler `RECORD_USAGE` awaits API response and returns real HTTP status.
- **12 (Popup Insertion):** Popup waits for `{ success: true }` from content script before displaying "Inserted!", and routes dynamic snippets through dynamic form modal in the active tab.
- **13 (Site Restrictions):** Enforced `isSnippetAllowedOnCurrentSite` across all entry points: typing, keyboard assistant, popup, and included nested snippets.
- **14 & 15 (SelectedText & Caret Preservation):** Implemented `selectionStart`/`selectionEnd` in `<input>`/`<textarea>` for `selectedText`, and snapshotted/restored selection across dynamic form modal.
- **16 (Honest Editor Mode):** Explicitly labeled editor mode as "Plain Text / Markdown" in the Dashboard toolbar.
- **17 (Dirty Flag Autosave):** Added `isDirty` ref in `Dashboard.tsx` so autosave only triggers on actual user input, preventing race condition saves on snippet selection.
- **18 & 19 (Folder Hierarchy & Validation):** Included `folders` array during JSON import in `ImportExportModal.tsx`; validated that `parentId` belongs to the same workspace during folder creation in `folder.routes.ts`.
- **20 & 22 (SQL Scoping & Optimized Search):** Scoped table row operations to `tableId` at SQL layer; optimized snippet search to query via SQL expressions (`like`, `or`, `eq`).

---

## Complete Test Suite Status

```
Test Files  20 passed (20)
Tests       87 passed (87)
Duration    1.85s
Status      ALL PASSING
```
