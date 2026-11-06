import { User, Workspace, Folder, Snippet, SnippetRevision, UserPreferences, SyncResponse } from '@snaptype/shared';

const API_BASE = '/api/v1';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = typeof window !== 'undefined' ? localStorage.getItem('snaptype_auth_token') : null;
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('snaptype_auth_token', token);
    } else {
      localStorage.removeItem('snaptype_auth_token');
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  public isAuthenticated(): boolean {
    return Boolean(this.token);
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (response.status === 401) {
      this.setToken(null);
      window.dispatchEvent(new Event('snaptype:unauthorized'));
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      let errorMsg = 'Request failed';
      try {
        const body = await response.json();
        errorMsg = body.error || errorMsg;
      } catch {
        // fallback
      }
      const err = new Error(errorMsg);
      (err as any).status = response.status;
      throw err;
    }

    return response.json();
  }

  // Auth
  public async requestOTP(email: string) {
    return this.request<{ success: boolean; message: string }>('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  public async verifyOTP(email: string, code: string) {
    const res = await this.request<{ success: boolean; token: string; user: User; isNewUser: boolean }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, code })
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  public async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
    }
  }

  public async getMe() {
    return this.request<{ user: User; workspaces: { workspace: Workspace; role: string }[]; preferences: UserPreferences }>('/me');
  }

  // Folders
  public async getFolders(workspaceId?: string) {
    const qs = workspaceId ? `?workspaceId=${workspaceId}` : '';
    return this.request<{ folders: Folder[] }>(`/folders${qs}`);
  }

  public async createFolder(data: Partial<Folder>) {
    return this.request<{ folder: Folder }>('/folders', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public async updateFolder(id: string, data: Partial<Folder>) {
    return this.request<{ folder: Folder }>(`/folders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  public async deleteFolder(id: string) {
    return this.request<{ success: boolean }>(`/folders/${id}`, {
      method: 'DELETE'
    });
  }

  // Snippets
  public async getSnippets(options: { workspaceId?: string; folderId?: string | null; search?: string; tag?: string; favoriteOnly?: boolean } = {}) {
    const params = new URLSearchParams();
    if (options.workspaceId) params.set('workspaceId', options.workspaceId);
    if (options.folderId !== undefined) params.set('folderId', options.folderId === null ? 'null' : options.folderId);
    if (options.search) params.set('search', options.search);
    if (options.tag) params.set('tag', options.tag);
    if (options.favoriteOnly) params.set('favoriteOnly', 'true');

    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ snippets: Snippet[] }>(`/snippets${qs}`);
  }

  public async getSnippet(id: string) {
    return this.request<{ snippet: Snippet }>(`/snippets/${id}`);
  }

  public async createSnippet(data: Partial<Snippet>) {
    return this.request<{ snippet: Snippet }>('/snippets', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public async updateSnippet(id: string, data: Partial<Snippet> & { expectedVersion?: number }) {
    return this.request<{ snippet: Snippet }>(`/snippets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  public async deleteSnippet(id: string) {
    return this.request<{ success: boolean }>(`/snippets/${id}`, {
      method: 'DELETE'
    });
  }

  public async duplicateSnippet(id: string) {
    return this.request<{ snippet: Snippet }>(`/snippets/${id}/duplicate`, {
      method: 'POST'
    });
  }

  public async getSnippetRevisions(id: string) {
    return this.request<{ revisions: SnippetRevision[] }>(`/snippets/${id}/revisions`);
  }

  // Preferences
  public async getPreferences() {
    return this.request<{ preferences: UserPreferences }>('/preferences');
  }

  public async updatePreferences(data: Partial<UserPreferences>) {
    return this.request<{ preferences: UserPreferences }>('/preferences', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  // Sync
  public async sync(lastRevision: number = 0, workspaceId?: string) {
    const params = new URLSearchParams({ lastRevision: String(lastRevision) });
    if (workspaceId) params.set('workspaceId', workspaceId);
    return this.request<SyncResponse>(`/sync?${params.toString()}`);
  }

  // Transfer
  public async exportWorkspace(workspaceId?: string) {
    const qs = workspaceId ? `?workspaceId=${workspaceId}` : '';
    return this.request<any>(`/export${qs}`);
  }

  public async importSnippets(data: { snippets: any[]; format?: string; conflictStrategy?: string; workspaceId?: string }) {
    return this.request<any>('/import', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
}

export const api = new ApiClient();
