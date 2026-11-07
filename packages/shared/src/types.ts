export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  isPersonal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    name: string | null;
  };
}

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  invitedById: string;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export interface Folder {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  color?: string | null;
  icon?: string | null;
  isFavorite: boolean;
  sortOrder: number;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  children?: Folder[];
  snippetCount?: number;
}

export interface Snippet {
  id: string;
  workspaceId: string;
  folderId: string | null;
  name: string;
  shortcut: string;
  plainContent: string;
  richContent?: string | null;
  description?: string | null;
  tags: string[];
  isFavorite: boolean;
  isEnabled: boolean;
  siteRestrictions?: {
    mode: 'allow' | 'block';
    domains: string[];
  } | null;
  version: number;
  usageCount: number;
  lastUsedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SnippetRevision {
  id: string;
  snippetId: string;
  version: number;
  name: string;
  shortcut: string;
  plainContent: string;
  richContent?: string | null;
  createdAt: string;
  createdById?: string | null;
}

export interface UserPreferences {
  triggerMode: 'immediate' | 'space' | 'delimiter' | 'manual';
  delimiterChar: string;
  caseSensitive: boolean;
  assistantShortcut: string;
  excludedDomains: string[];
  disabledInSensitiveFields: boolean;
}

export interface SyncRequest {
  lastRevision: number;
  workspaceId?: string;
}

export interface SyncResponse {
  currentRevision: number;
  snippets: Snippet[];
  deletedSnippetIds: string[];
  folders: Folder[];
  deletedFolderIds: string[];
  preferences: UserPreferences;
}

export interface DynamicFormField {
  name: string;
  type: 'text' | 'paragraph' | 'dropdown' | 'toggle' | 'date';
  label?: string;
  defaultValue?: string | boolean;
  options?: string[]; // for dropdown
  required?: boolean;
}

export interface DynamicParseResult {
  hasDynamicFields: boolean;
  fields: DynamicFormField[];
  staticPreview: string;
}

export interface DataTableColumn {
  id: string;
  name: string;
  key: string;
  type: 'text' | 'number';
}

export interface DataTableRow {
  id: string;
  tableId: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface DataTable {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  columns: DataTableColumn[];
  rowCount?: number;
  rows?: DataTableRow[];
  createdAt: string;
  updatedAt: string;
}

