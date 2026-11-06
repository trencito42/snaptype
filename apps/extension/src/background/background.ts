import { Snippet, UserPreferences, DEFAULT_PREFERENCES, SyncResponse } from '@snaptype/shared';
import { BrowserApi } from '@snaptype/browser-compat';

declare const __SNAPTYPE_API_URL__: string;

const API_BASE = typeof __SNAPTYPE_API_URL__ !== 'undefined' 
  ? __SNAPTYPE_API_URL__ 
  : 'http://localhost:3000/api/v1';


interface BackgroundState {
  token: string | null;
  snippets: Snippet[];
  preferences: UserPreferences;
  currentRevision: number;
  lastSyncTime: number | null;
}

const state: BackgroundState = {
  token: null,
  snippets: [],
  preferences: { ...DEFAULT_PREFERENCES },
  currentRevision: 0,
  lastSyncTime: null
};

// Initialize background lifecycle
async function init() {
  const authStore = BrowserApi.getAuthStorage();
  const stored = await authStore.get(['snaptype_token']);
  if (stored && stored.snaptype_token) {
    state.token = stored.snaptype_token;
    await syncWithServer();
  }

  // Setup context menu
  try {
    BrowserApi.api.contextMenus.removeAll(() => {
      BrowserApi.api.contextMenus.create({
        id: 'snaptype-insert-assistant',
        title: 'Insert SnapType Snippet (Ctrl+Shift+Space)',
        contexts: ['editable']
      });
    });
  } catch (err) {
    // contextMenus might not be available in some testing contexts
  }
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
    const res = await fetch(`${API_BASE}/sync?lastRevision=${state.currentRevision}`, {
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

    if (!res.ok) return false;

    const data: SyncResponse = await res.json();
    state.currentRevision = data.currentRevision;
    state.preferences = data.preferences || state.preferences;
    state.lastSyncTime = Date.now();

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
  state.snippets = [];
  state.currentRevision = 0;
  state.lastSyncTime = null;

  const authStore = BrowserApi.getAuthStorage();
  await authStore.remove('snaptype_token');

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
          snippets: state.snippets,
          preferences: state.preferences,
          currentRevision: state.currentRevision,
          lastSyncTime: state.lastSyncTime
        };
      }

      case 'SYNC_NOW': {
        const ok = await syncWithServer();
        return {
          success: ok,
          snippetsCount: state.snippets.length,
          lastSyncTime: state.lastSyncTime
        };
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

