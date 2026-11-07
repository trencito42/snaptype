-- SnapType Migration 0002: Versioned Schema Upgrade
-- Safely brings pre-existing MySQL databases up to date with revisions, tombstones, data tables and invitations

-- 1. Ensure schema_migrations table exists
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `version` VARCHAR(100) NOT NULL PRIMARY KEY,
  `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add revision column to folders if missing
DROP PROCEDURE IF EXISTS upgrade_folders_revision;
DELIMITER $$
CREATE PROCEDURE upgrade_folders_revision()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'folders' AND COLUMN_NAME = 'revision'
  ) THEN
    ALTER TABLE `folders` ADD COLUMN `revision` INT NOT NULL DEFAULT 1 AFTER `sort_order`;
  END IF;
END$$
DELIMITER ;
CALL upgrade_folders_revision();
DROP PROCEDURE IF EXISTS upgrade_folders_revision;

-- 3. Add revision column to snippets if missing
DROP PROCEDURE IF EXISTS upgrade_snippets_revision;
DELIMITER $$
CREATE PROCEDURE upgrade_snippets_revision()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'snippets' AND COLUMN_NAME = 'revision'
  ) THEN
    ALTER TABLE `snippets` ADD COLUMN `revision` INT NOT NULL DEFAULT 1 AFTER `version`;
  END IF;
END$$
DELIMITER ;
CALL upgrade_snippets_revision();
DROP PROCEDURE IF EXISTS upgrade_snippets_revision;

-- 4. Create workspace_revisions table if missing
CREATE TABLE IF NOT EXISTS `workspace_revisions` (
  `workspace_id` VARCHAR(36) NOT NULL,
  `current_revision` INT NOT NULL DEFAULT 1,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`workspace_id`),
  CONSTRAINT `fk_ws_rev_workspace` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Create sync_tombstones table if missing
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

-- 6. Create data_tables table if missing
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

-- 7. Create data_rows table if missing
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

-- 8. Create workspace_invitations table if missing
CREATE TABLE IF NOT EXISTS `workspace_invitations` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `role` VARCHAR(20) NOT NULL DEFAULT 'editor',
  `token` VARCHAR(64) NOT NULL,
  `invited_by_id` VARCHAR(36) NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `accepted_at` TIMESTAMP NULL,
  `revoked_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_inv_token` (`token`),
  KEY `idx_inv_ws` (`workspace_id`),
  CONSTRAINT `fk_inv_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inv_user` FOREIGN KEY (`invited_by_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
