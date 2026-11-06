import { z } from 'zod';
import { DEFAULT_PREFERENCES, MAX_SHORTCUT_LENGTH, MAX_SNIPPET_CONTENT_LENGTH } from './constants.js';

export const RequestOTPSchema = z.object({
  email: z.string().trim().email().toLowerCase()
});

export const VerifyOTPSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  code: z.string().trim().regex(/^\d{6}$/, 'Code must be 6 digits')
});

export const CompleteRegistrationSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  code: z.string().trim().regex(/^\d{6}$/),
  name: z.string().trim().min(1).max(100).optional()
});

export const CreateFolderSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, 'Name is required').max(100),
  color: z.string().trim().max(30).nullable().optional(),
  icon: z.string().trim().max(50).nullable().optional(),
  isFavorite: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0)
});

export const UpdateFolderSchema = CreateFolderSchema.partial();

export const CreateSnippetSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  folderId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, 'Name is required').max(150),
  shortcut: z.string().trim().min(1, 'Shortcut is required').max(MAX_SHORTCUT_LENGTH)
    .regex(/^[a-zA-Z0-9_\-./@#]+$/, 'Shortcut may only contain letters, numbers, and symbols: _ - . / @ #'),
  plainContent: z.string().max(MAX_SNIPPET_CONTENT_LENGTH),
  richContent: z.string().max(MAX_SNIPPET_CONTENT_LENGTH * 2).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  tags: z.array(z.string().trim().max(50)).optional().default([]),
  isFavorite: z.boolean().optional().default(false),
  isEnabled: z.boolean().optional().default(true),
  siteRestrictions: z.object({
    mode: z.enum(['allow', 'block']),
    domains: z.array(z.string().trim().toLowerCase())
  }).nullable().optional()
});

export const UpdateSnippetSchema = CreateSnippetSchema.partial().extend({
  expectedVersion: z.number().int().positive().optional()
});

export const UpdatePreferencesSchema = z.object({
  triggerMode: z.enum(['immediate', 'space', 'delimiter', 'manual']).optional(),
  delimiterChar: z.string().min(1).max(3).optional(),
  caseSensitive: z.boolean().optional(),
  assistantShortcut: z.string().max(50).optional(),
  excludedDomains: z.array(z.string().trim().toLowerCase()).optional(),
  disabledInSensitiveFields: z.boolean().optional()
});

export const ImportSnippetItemSchema = z.object({
  name: z.string().trim().min(1),
  shortcut: z.string().trim().min(1),
  plainContent: z.string(),
  richContent: z.string().nullable().optional(),
  folderName: z.string().trim().optional(),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).optional()
});

export const ImportSnippetsSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  snippets: z.array(ImportSnippetItemSchema),
  format: z.enum(['snaptype_json', 'textblaze_json', 'csv']).default('snaptype_json'),
  conflictStrategy: z.enum(['skip', 'overwrite', 'duplicate']).default('duplicate')
});

export const DataTableColumnSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(50),
  key: z.string().trim().min(1).max(50).regex(/^[a-zA-Z0-9_]+$/),
  type: z.enum(['text', 'number'])
});

export const CreateDataTableSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: z.string().trim().max(300).nullable().optional(),
  columns: z.array(DataTableColumnSchema).min(1, 'At least one column is required')
});

export const CreateDataTableRowSchema = z.object({
  data: z.record(z.any())
});

export const UpdateDataTableRowSchema = z.object({
  data: z.record(z.any())
});

export type RequestOTPInput = z.infer<typeof RequestOTPSchema>;
export type VerifyOTPInput = z.infer<typeof VerifyOTPSchema>;
export type CompleteRegistrationInput = z.infer<typeof CompleteRegistrationSchema>;
export type CreateFolderInput = z.infer<typeof CreateFolderSchema>;
export type UpdateFolderInput = z.infer<typeof UpdateFolderSchema>;
export type CreateSnippetInput = z.infer<typeof CreateSnippetSchema>;
export type UpdateSnippetInput = z.infer<typeof UpdateSnippetSchema>;
export type UpdatePreferencesInput = z.infer<typeof UpdatePreferencesSchema>;
export type ImportSnippetsInput = z.infer<typeof ImportSnippetsSchema>;
export type CreateDataTableInput = z.infer<typeof CreateDataTableSchema>;
export type CreateDataTableRowInput = z.infer<typeof CreateDataTableRowSchema>;


