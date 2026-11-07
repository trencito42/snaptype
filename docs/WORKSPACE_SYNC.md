# SnapType Workspace Synchronization & Extension State Architecture

## Overview
SnapType provides seamless synchronization between the Web Dashboard and the Browser Extension (Chrome & Firefox MV3). 

To prevent stale snippet leaks, data collision across different team environments, or cross-tenant contamination, workspace state transitions follow strict isolation rules.

---

## 1. Extension Popup Workspace Selector
The browser extension popup (`apps/extension/src/popup/popup.html` and `popup.ts`) includes a dedicated workspace switcher located at the top of the interface:
- **Automatic Hydration:** On opening the popup, the extension calls `GET_DATA`, retrieving all accessible user workspaces.
- **Active Workspace Status:** The current workspace is selected in `#workspace-select`.
- **Instant Workspace Switch:** Selecting a new workspace triggers `SELECT_WORKSPACE` to the background service worker.

---

## 2. Dashboard-to-Extension Real-Time Bridge
When a user switches active workspaces in the SnapType Web Dashboard (`apps/web/src/pages/Dashboard.tsx`):
1. **Window Event Broadcast:** The web app posts a cross-origin-safe message:
   ```ts
   window.postMessage({
     type: 'SNAPTYPE_DASHBOARD_WORKSPACE_CHANGE',
     workspaceId: newWsId
   }, '*');
   ```
2. **Content Script Listener:** The extension content script (`apps/extension/src/content/content.ts`) receives the message and issues `SELECT_WORKSPACE` to the background script.
3. **Background State Re-synchronization:** The background worker updates `state.currentWorkspaceId`, wipes all cached snippets and tables from memory, resets `currentRevision = 0`, and fetches fresh data from `/api/v1/sync`.
4. **Active Tab Notification:** All open tabs receive `REFRESH_DATA` and reload their matcher state.

---

## 3. Stale Data Prevention & Zero-Leakage Guarantee
When switching workspaces via either the popup or the dashboard bridge:
1. `state.snippets = []`
2. `state.tables = []`
3. `state.currentRevision = 0`
4. In-memory `snaptype_cache` in session storage is reset.

This guarantees that:
- Snippets from Workspace A are never expanded inside Workspace B.
- No cached snippets remain if a user is removed or downgraded from a workspace.
- Revision counting starts fresh, ensuring all server revisions for the new workspace are applied without missing delta updates.

---

## 4. Race-Safe Autosave on Workspace and Snippet Switch
When a user switches workspaces or selects a different snippet while editing:
1. If uncommitted changes exist (`isDirty.current === true`), the pending changes are saved immediately (`handleSaveSnippet()`) before the state is replaced.
2. In-flight saves are guarded with `isSavingRef` and `pendingSaveRef`. If keystrokes happen while a save request is over the wire, a follow-up save is automatically dispatched once the in-flight request resolves.
3. On network version conflicts (`409 Conflict`), local edits are preserved in state, and explicit conflict resolution buttons (`Overwrite` or `Reload Server Version`) are presented to the user.

