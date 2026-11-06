/**
 * Cross-browser extension API abstraction supporting Chrome MV3 and Firefox MV3.
 */

export interface ExtensionStorageArea {
  get(keys?: string | string[] | Record<string, any> | null): Promise<Record<string, any>>;
  set(items: Record<string, any>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

export class BrowserApi {
  public static get isFirefox(): boolean {
    return typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);
  }

  public static get isChrome(): boolean {
    return typeof navigator !== 'undefined' && /chrome/i.test(navigator.userAgent) && !this.isFirefox;
  }

  public static get api(): typeof chrome {
    if (typeof chrome !== 'undefined') {
      return chrome;
    }
    if (typeof (globalThis as any).browser !== 'undefined') {
      return (globalThis as any).browser;
    }
    throw new Error('No browser extension runtime detected');
  }

  /**
   * Session-scoped storage (in-memory only, bounded, does NOT persist to browser disk)
   * Falls back to memory map if chrome.storage.session is not supported (e.g. older Firefox)
   */
  public static getSessionStorage(): ExtensionStorageArea {
    const api = this.api;
    if (api && api.storage && (api.storage as any).session) {
      return (api.storage as any).session;
    }

    // Fallback in-memory implementation
    const memStore = new Map<string, any>();
    return {
      async get(keys) {
        if (!keys) return Object.fromEntries(memStore);
        if (typeof keys === 'string') {
          return { [keys]: memStore.get(keys) };
        }
        if (Array.isArray(keys)) {
          const res: Record<string, any> = {};
          for (const k of keys) {
            if (memStore.has(k)) res[k] = memStore.get(k);
          }
          return res;
        }
        const res: Record<string, any> = { ...keys };
        for (const k of Object.keys(keys)) {
          if (memStore.has(k)) res[k] = memStore.get(k);
        }
        return res;
      },
      async set(items) {
        for (const [k, v] of Object.entries(items)) {
          memStore.set(k, v);
        }
      },
      async remove(keys) {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) {
          memStore.delete(k);
        }
      },
      async clear() {
        memStore.clear();
      }
    };
  }

  /**
   * Minimal auth credential storage (needed so user stays logged in across service worker sleep)
   */
  public static getAuthStorage(): ExtensionStorageArea {
    const api = this.api;
    if (api && api.storage && api.storage.local) {
      return api.storage.local;
    }
    return this.getSessionStorage();
  }

  public static sendMessage(message: any): Promise<any> {
    return new Promise((resolve) => {
      try {
        this.api.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(response);
          }
        });
      } catch (err: any) {
        resolve({ error: err?.message || 'Failed to send message' });
      }
    });
  }
}

