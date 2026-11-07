-- SnapType Migration 0002: Versioned Schema Upgrade
-- Safely brings pre-existing MySQL databases up to date with revisions, tombstones, data tables and invitations

-- 1. Ensure schema_migrations table exists
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `id` VARCHAR(255) NOT NULL PRIMARY KEY,
  `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Create workspace_revisions table if missing
CREATE TABLE IF NOT EXISTS `workspace_revisions` (
  `workspace_id` VARCHAR(36) NOT NULL,
  `current_revision` INT NOT NULL DEFAULT 1,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`workspace_id`),
  CONSTRAINT `fk_ws_rev_workspace` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create sync_tombstones table if missing
CREATE TABLE IF NOT EXISTS `sync_tombstones` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `entity_type` VARCHAR(20) NOT NULL,
  `entity_id` VARCHAR(36) NOT NULL,
  `revision` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tombstones_ws_rev` (`workspace_id`, `revision`),
  CONSTRAINT `fk_tombstones_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create data_tables table if missing
CREATE TABLE IF NOT EXISTS `data_tables` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `description` VARCHAR(500) NULL,
  `columns` JSON NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_data_tables_ws` (`workspace_id`),
  CONSTRAINT `fk_data_tables_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Create data_rows table if missing
CREATE TABLE IF NOT EXISTS `data_rows` (
  `id` VARCHAR(36) NOT NULL,
  `table_id` VARCHAR(36) NOT NULL,
  `data` JSON NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_data_rows_tbl` (`table_id`),
  CONSTRAINT `fk_data_rows_tbl` FOREIGN KEY (`table_id`) REFERENCES `data_tables` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Create workspace_invitations table if missing
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
  UNIQUE KEY `idx_inv_token_hash` (`token_hash`),
  KEY `idx_inv_ws` (`workspace_id`),
  CONSTRAINT `fk_inv_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inv_user` FOREIGN KEY (`invited_by_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
