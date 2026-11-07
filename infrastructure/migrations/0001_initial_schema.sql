-- SnapType Production MySQL Schema Migration
-- Compatible with MySQL 8.0+

CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(100) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_verification_challenges` (
  `id` VARCHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `hashed_code` VARCHAR(128) NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `expires_at` TIMESTAMP NOT NULL,
  `verified_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_email_challenges_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sessions` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `token_hash` VARCHAR(128) NOT NULL,
  `user_agent` VARCHAR(500) NULL,
  `ip_address` VARCHAR(45) NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sessions_token_hash_unique` (`token_hash`),
  KEY `idx_sessions_user` (`user_id`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `workspaces` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(120) NOT NULL,
  `owner_id` VARCHAR(36) NOT NULL,
  `is_personal` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `workspaces_slug_unique` (`slug`),
  KEY `idx_workspaces_owner` (`owner_id`),
  CONSTRAINT `fk_workspaces_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `workspace_members` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `role` VARCHAR(20) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_workspace_member_unique` (`workspace_id`, `user_id`),
  CONSTRAINT `fk_members_workspace` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `folders` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `parent_id` VARCHAR(36) NULL,
  `name` VARCHAR(100) NOT NULL,
  `color` VARCHAR(30) NULL,
  `icon` VARCHAR(50) NULL,
  `is_favorite` BOOLEAN NOT NULL DEFAULT FALSE,
  `sort_order` INT NOT NULL DEFAULT 0,
  `revision` INT NOT NULL DEFAULT 1,
  `deleted_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_folders_workspace` (`workspace_id`),
  CONSTRAINT `fk_folders_workspace` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `snippets` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `folder_id` VARCHAR(36) NULL,
  `name` VARCHAR(150) NOT NULL,
  `shortcut` VARCHAR(64) NOT NULL,
  `plain_content` MEDIUMTEXT NOT NULL,
  `rich_content` MEDIUMTEXT NULL,
  `description` VARCHAR(500) NULL,
  `tags` JSON NOT NULL,
  `is_favorite` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `site_restrictions` JSON NULL,
  `version` INT NOT NULL DEFAULT 1,
  `revision` INT NOT NULL DEFAULT 1,
  `usage_count` INT NOT NULL DEFAULT 0,
  `last_used_at` TIMESTAMP NULL,
  `deleted_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_snippets_workspace` (`workspace_id`),
  KEY `idx_snippets_folder` (`folder_id`),
  KEY `idx_snippets_shortcut` (`shortcut`),
  CONSTRAINT `fk_snippets_workspace` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `snippet_revisions` (
  `id` VARCHAR(36) NOT NULL,
  `snippet_id` VARCHAR(36) NOT NULL,
  `version` INT NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `shortcut` VARCHAR(64) NOT NULL,
  `plain_content` MEDIUMTEXT NOT NULL,
  `rich_content` MEDIUMTEXT NULL,
  `created_by_id` VARCHAR(36) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_snippet_revisions_snippet` (`snippet_id`),
  CONSTRAINT `fk_revisions_snippet` FOREIGN KEY (`snippet_id`) REFERENCES `snippets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_preferences` (
  `user_id` VARCHAR(36) NOT NULL,
  `trigger_mode` VARCHAR(20) NOT NULL DEFAULT 'immediate',
  `delimiter_char` VARCHAR(5) NOT NULL DEFAULT '/',
  `case_sensitive` BOOLEAN NOT NULL DEFAULT FALSE,
  `assistant_shortcut` VARCHAR(50) NOT NULL DEFAULT 'Ctrl+Shift+Space',
  `excluded_domains` JSON NOT NULL,
  `disabled_in_sensitive_fields` BOOLEAN NOT NULL DEFAULT TRUE,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_preferences_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `workspace_revisions` (
  `workspace_id` VARCHAR(36) NOT NULL,
  `current_revision` INT NOT NULL DEFAULT 1,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`workspace_id`),
  CONSTRAINT `fk_workspace_revisions_workspace` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sync_tombstones` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `entity_type` VARCHAR(20) NOT NULL,
  `entity_id` VARCHAR(36) NOT NULL,
  `revision` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tombstones_ws_rev` (`workspace_id`, `revision`),
  CONSTRAINT `fk_tombstones_workspace` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_tables` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `description` VARCHAR(500) NULL,
  `columns` JSON NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_data_tables_workspace` (`workspace_id`),
  CONSTRAINT `fk_data_tables_workspace` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_rows` (
  `id` VARCHAR(36) NOT NULL,
  `table_id` VARCHAR(36) NOT NULL,
  `data` JSON NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_data_rows_table` (`table_id`),
  CONSTRAINT `fk_data_rows_table` FOREIGN KEY (`table_id`) REFERENCES `data_tables` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `workspace_invitations` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `role` VARCHAR(20) NOT NULL DEFAULT 'editor',
  `token_hash` VARCHAR(128) NOT NULL,
  `invited_by_id` VARCHAR(36) NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `accepted_at` TIMESTAMP NULL,
  `revoked_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_invitation_token_hash` (`token_hash`),
  KEY `idx_invitations_workspace` (`workspace_id`),
  CONSTRAINT `fk_invitations_workspace` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_invitations_invited_by` FOREIGN KEY (`invited_by_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


