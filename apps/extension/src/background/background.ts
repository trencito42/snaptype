import { Snippet, UserPreferences, DEFAULT_PREFERENCES, SyncResponse, DataTable } from '@snaptype/shared';
import { BrowserApi } from '@snaptype/browser-compat';

declare const __SNAPTYPE_API_URL__: string;

const API_BASE = typeof __SNAPTYPE_API_URL__ !== 'undefined' 
  ? __SNAPTYPE_API_URL__ 
  : 'http://localhost:3000/api/v1';

const PERIODIC_SYNC_ALARM = 'snaptype-periodic-sync';

interface BackgroundState {
  token: string | null;
  currentWorkspaceId: string | null;
  snippets: Snippet[];
  tables: DataTable[];
  preferences: UserPreferences;
  currentRevision: number;
  lastSyncTime: number | null;
}

const state: BackgroundState = {
  token: null,
  currentWorkspaceId: null,
  snippets: [],
  tables: [],
  preferences: { ...DEFAULT_PREFERENCES },
  currentRevision: 0,
  lastSyncTime: null
};

// Initialize background lifecycle and alarm jobs (ST-009 & ST-018)
async function init() {
  const authStore = BrowserApi.getAuthStorage();
  const stored = await authStore.get(['snaptype_token', 'snaptype_workspace']);
  if (stored && stored.snaptype_token) {
    state.token = stored.snaptype_token;
    state.currentWorkspaceId = stored.snaptype_workspace || null;
    await syncWithServer();
  }

  // Setup periodic sync alarms
  setupAlarms();

  // Setup context menu
  updateContextMenu();
}

function setupAlarms() {
  if (typeof chrome !== 'undefined' && chrome.alarms) {
    try {
      chrome.alarms.get(PERIODIC_SYNC_ALARM, (alarm) => {
        if (!alarm) {
          chrome.alarms.create(PERIODIC_SYNC_ALARM, {
            periodInMinutes: 5,
            delayInMinutes: 1
          });
        }
      });
    } catch {
      // Alarms API may not be active in mock environments
    }
  }
}

function updateContextMenu(shortcut?: string) {
  try {
    const hotkey = shortcut || state.preferences.assistantShortcut || 'Ctrl+Shift+Space';
    BrowserApi.api.contextMenus.removeAll(() => {
      BrowserApi.api.contextMenus.create({
        id: 'snaptype-insert-assistant',
        title: `Insert SnapType Snippet (${hotkey})`,
        contexts: ['editable']
      });
    });
  } catch {
    // contextMenus might not be available in some testing contexts
  }
}

// Alarms listener for MV3 periodic wake up and sync
if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === PERIODIC_SYNC_ALARM) {
      syncWithServer().catch(() => {});
    }
  });
}

// Service worker cold start / install lifecycle
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onStartup?.addListener(() => {
    init().catch(() => {});
  });
  chrome.runtime.onInstalled?.addListener(() => {
    init().catch(() => {});
  });
}

// Context menu click listener
if (typeof chrome !== 'undefined' && chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'snaptype-insert-assistant' && tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'OPEN_ASSISTANT' });
    }
  });
}

async function syncWithServer(): Promise<boolean> {
  if (!state.token) return false;

  try {
    const params = new URLSearchParams();
    params.set('lastRevision', String(state.currentRevision));
    if (state.currentWorkspaceId) {
      params.set('workspaceId', state.currentWorkspaceId);
    }

    const res = await fetch(`${API_BASE}/sync?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${state.token}`,
        'Cache-Control': 'no-store'
      }
    });

    if (res.status === 401) {
      // Session expired
      await handleLogout();
      return false;
    }

    if (res.status === 403) {
      // Access revoked or removed from workspace (ST-006 / Blocker 6)
      state.snippets = [];
      state.tables = [];
      state.currentRevision = 0;
      state.lastSyncTime = Date.now();
      const sessionStore = BrowserApi.getSessionStorage();
      await sessionStore.set({
        snaptype_cache: {
          revision: 0,
          count: 0
        }
      });
      notifyTabsDataUpdated();
      return false;
    }

    if (!res.ok) return false;

    const data: SyncResponse = await res.json();
    state.currentRevision = data.currentRevision;
    if (data.preferences) {
      state.preferences = data.preferences;
      updateContextMenu(data.preferences.assistantShortcut);
    }
    state.lastSyncTime = Date.now();
    if (data.tables) {
      state.tables = data.tables;
    }

    // If first load or full sync:
    if (state.snippets.length === 0 || data.deletedSnippetIds.length > 0) {
      const map = new Map<string, Snippet>();
      for (const s of state.snippets) map.set(s.id, s);
      for (const id of data.deletedSnippetIds) map.delete(id);
      for (const s of data.snippets) map.set(s.id, s);
      state.snippets = Array.from(map.values());
    } else {
      // Append / update
      const map = new Map<string, Snippet>();
      for (const s of state.snippets) map.set(s.id, s);
      for (const s of data.snippets) map.set(s.id, s);
      state.snippets = Array.from(map.values());
    }

    // Save in-memory session cache
    const sessionStore = BrowserApi.getSessionStorage();
    await sessionStore.set({
      snaptype_cache: {
        revision: state.currentRevision,
        count: state.snippets.length
      }
    });

    // Notify all active tabs that data/deletions have updated
    notifyTabsDataUpdated();

    return true;
  } catch (err) {
    console.warn('[SnapType Background] Sync failed (server might be offline):', err);
    return false;
  }
}

function notifyTabsDataUpdated() {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    try {
      chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { action: 'REFRESH_DATA' }, () => {
              if (chrome.runtime.lastError) { /* ignore inactive tabs */ }
            });
          }
        }
      });
    } catch {
      // Ignore background tab query errors
    }
  }
}

async function handleLogout() {
  state.token = null;
  state.currentWorkspaceId = null;
  state.snippets = [];
  state.tables = [];
  state.currentRevision = 0;
  state.lastSyncTime = null;

  const authStore = BrowserApi.getAuthStorage();
  await authStore.remove('snaptype_token');
  await authStore.remove('snaptype_workspace');

  const sessionStore = BrowserApi.getSessionStorage();
  await sessionStore.clear();

  notifyTabsDataUpdated();
}

// Runtime message dispatcher
BrowserApi.api.runtime.onMessage.addListener((message: any, _sender, sendResponse: (res: any) => void) => {
  const handleAsync = async () => {
    switch (message.action) {
      case 'GET_DATA':
      case 'GET_SNIPPETS': {
        // If memory is empty but we have token, rehydrate
        if (state.token && state.snippets.length === 0) {
          await syncWithServer();
        }
        return {
          isAuthenticated: Boolean(state.token),
          currentWorkspaceId: state.currentWorkspaceId,
          snippets: state.snippets,
          tables: state.tables,
          preferences: state.preferences,
          currentRevision: state.currentRevision,
          lastSyncTime: state.lastSyncTime
        };
      }

      case 'SELECT_WORKSPACE': {
        state.currentWorkspaceId = message.workspaceId || null;
        state.snippets = [];
        state.tables = [];
        state.currentRevision = 0;

        const authStore = BrowserApi.getAuthStorage();
        if (state.currentWorkspaceId) {
          await authStore.set({ snaptype_workspace: state.currentWorkspaceId });
        } else {
          await authStore.remove('snaptype_workspace');
        }

        const sessionStore = BrowserApi.getSessionStorage();
        await sessionStore.set({
          snaptype_cache: { revision: 0, count: 0 }
        });

        const ok = await syncWithServer();
        notifyTabsDataUpdated();
        return { success: ok, snippetsCount: state.snippets.length, workspaceId: state.currentWorkspaceId };
      }

      case 'SYNC_NOW': {
        const ok = await syncWithServer();
        return {
          success: ok,
          snippetsCount: state.snippets.length,
          lastSyncTime: state.lastSyncTime
        };
      }

      // ST-010: Record snippet usage from content script insertion (Requirement 11)
      case 'RECORD_USAGE': {
        if (state.token && message.snippetId) {
          try {
            const res = await fetch(`${API_BASE}/snippets/${message.snippetId}/usage`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${state.token}`,
                'Content-Type': 'application/json'
              }
            });
            return { success: res.ok, status: res.status };
          } catch (err: any) {
            console.debug('[SnapType] Record usage failed:', err);
            return { success: false, error: err.message };
          }
        }
        return { success: false, error: 'Missing token or snippetId' };
      }

      case 'AUTH_REQUEST_OTP': {
        try {
          const res = await fetch(`${API_BASE}/auth/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: message.email })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to request OTP');
          return { success: true, message: data.message };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      }

      case 'AUTH_VERIFY_OTP': {
        try {
          const res = await fetch(`${API_BASE}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: message.email, code: message.code })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Verification failed');

          state.token = data.token;
          const authStore = BrowserApi.getAuthStorage();
          await authStore.set({ snaptype_token: data.token });

          await syncWithServer();
          return { success: true, user: data.user };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      }

      case 'LOGOUT': {
        await handleLogout();
        return { success: true };
      }

      case 'GET_STATUS': {
        return {
          isAuthenticated: Boolean(state.token),
          snippetsCount: state.snippets.length,
          lastSyncTime: state.lastSyncTime,
          revision: state.currentRevision
        };
      }

      default:
        return { error: 'Unknown action' };
    }
  };

  handleAsync().then(sendResponse);
  return true; // Keep message channel open for async response
});

init();
