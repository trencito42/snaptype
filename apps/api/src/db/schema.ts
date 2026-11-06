import { mysqlTable, varchar, text, int, boolean, timestamp, json, index, uniqueIndex } from 'drizzle-orm/mysql-core';

export const usersTable = mysqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});

export const emailChallengesTable = mysqlTable('email_verification_challenges', {
  id: varchar('id', { length: 36 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  hashedCode: varchar('hashed_code', { length: 128 }).notNull(),
  attempts: int('attempts').default(0).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => [
  index('idx_email_challenges_email').on(table.email)
]);

export const sessionsTable = mysqlTable('sessions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
  userAgent: varchar('user_agent', { length: 500 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => [
  index('idx_sessions_user').on(table.userId)
]);

export const workspacesTable = mysqlTable('workspaces', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 120 }).notNull().unique(),
  ownerId: varchar('owner_id', { length: 36 }).notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  isPersonal: boolean('is_personal').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});

export const workspaceMembersTable = mysqlTable('workspace_members', {
  id: varchar('id', { length: 36 }).primaryKey(),
  workspaceId: varchar('workspace_id', { length: 36 }).notNull().references(() => workspacesTable.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(), // 'owner' | 'admin' | 'editor' | 'viewer'
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => [
  uniqueIndex('idx_workspace_member_unique').on(table.workspaceId, table.userId)
]);

export const foldersTable = mysqlTable('folders', {
  id: varchar('id', { length: 36 }).primaryKey(),
  workspaceId: varchar('workspace_id', { length: 36 }).notNull().references(() => workspacesTable.id, { onDelete: 'cascade' }),
  parentId: varchar('parent_id', { length: 36 }),
  name: varchar('name', { length: 100 }).notNull(),
  color: varchar('color', { length: 30 }),
  icon: varchar('icon', { length: 50 }),
  isFavorite: boolean('is_favorite').default(false).notNull(),
  sortOrder: int('sort_order').default(0).notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
}, (table) => [
  index('idx_folders_workspace').on(table.workspaceId)
]);

export const snippetsTable = mysqlTable('snippets', {
  id: varchar('id', { length: 36 }).primaryKey(),
  workspaceId: varchar('workspace_id', { length: 36 }).notNull().references(() => workspacesTable.id, { onDelete: 'cascade' }),
  folderId: varchar('folder_id', { length: 36 }),
  name: varchar('name', { length: 150 }).notNull(),
  shortcut: varchar('shortcut', { length: 64 }).notNull(),
  plainContent: text('plain_content').notNull(),
  richContent: text('rich_content'),
  description: varchar('description', { length: 500 }),
  tags: json('tags').$type<string[]>().default([]).notNull(),
  isFavorite: boolean('is_favorite').default(false).notNull(),
  isEnabled: boolean('is_enabled').default(true).notNull(),
  siteRestrictions: json('site_restrictions').$type<{ mode: 'allow' | 'block'; domains: string[] } | null>(),
  version: int('version').default(1).notNull(),
  usageCount: int('usage_count').default(0).notNull(),
  lastUsedAt: timestamp('last_used_at'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
}, (table) => [
  index('idx_snippets_workspace').on(table.workspaceId),
  index('idx_snippets_folder').on(table.folderId),
  index('idx_snippets_shortcut').on(table.shortcut)
]);

export const snippetRevisionsTable = mysqlTable('snippet_revisions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  snippetId: varchar('snippet_id', { length: 36 }).notNull().references(() => snippetsTable.id, { onDelete: 'cascade' }),
  version: int('version').notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  shortcut: varchar('shortcut', { length: 64 }).notNull(),
  plainContent: text('plain_content').notNull(),
  richContent: text('rich_content'),
  createdById: varchar('created_by_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => [
  index('idx_snippet_revisions_snippet').on(table.snippetId)
]);

export const userPreferencesTable = mysqlTable('user_preferences', {
  userId: varchar('user_id', { length: 36 }).primaryKey().references(() => usersTable.id, { onDelete: 'cascade' }),
  triggerMode: varchar('trigger_mode', { length: 20 }).default('immediate').notNull(),
  delimiterChar: varchar('delimiter_char', { length: 5 }).default('/').notNull(),
  caseSensitive: boolean('case_sensitive').default(false).notNull(),
  assistantShortcut: varchar('assistant_shortcut', { length: 50 }).default('Ctrl+Shift+Space').notNull(),
  excludedDomains: json('excluded_domains').$type<string[]>().default([]).notNull(),
  disabledInSensitiveFields: boolean('disabled_in_sensitive_fields').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});

export const workspaceRevisionsTable = mysqlTable('workspace_revisions', {
  workspaceId: varchar('workspace_id', { length: 36 }).primaryKey().references(() => workspacesTable.id, { onDelete: 'cascade' }),
  currentRevision: int('current_revision').default(1).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});
