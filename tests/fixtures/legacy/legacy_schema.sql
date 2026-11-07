-- Genuine pre-release (legacy) SnapType schema fixture.
-- Differences from current schema, deliberately preserved:
--   * no schema_migrations table
--   * folders/snippets have NO `revision` column
--   * workspace_invitations stores a PLAINTEXT `token` (no token_hash)
--   * no workspace_revisions, sync_tombstones, data_tables, data_rows
CREATE TABLE users (
  id VARCHAR(36) NOT NULL, email VARCHAR(255) NOT NULL, name VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE workspaces (
  id VARCHAR(36) NOT NULL, name VARCHAR(100) NOT NULL, slug VARCHAR(120) NOT NULL,
  owner_id VARCHAR(36) NOT NULL, is_personal BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY workspaces_slug_unique (slug),
  CONSTRAINT fk_workspaces_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE workspace_members (
  id VARCHAR(36) NOT NULL, workspace_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL,
  role VARCHAR(20) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY idx_workspace_member_unique (workspace_id, user_id),
  CONSTRAINT fk_members_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE folders (
  id VARCHAR(36) NOT NULL, workspace_id VARCHAR(36) NOT NULL, parent_id VARCHAR(36) NULL,
  name VARCHAR(100) NOT NULL, color VARCHAR(30) NULL, icon VARCHAR(50) NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE, sort_order INT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY idx_folders_workspace (workspace_id),
  CONSTRAINT fk_folders_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE snippets (
  id VARCHAR(36) NOT NULL, workspace_id VARCHAR(36) NOT NULL, folder_id VARCHAR(36) NULL,
  name VARCHAR(150) NOT NULL, shortcut VARCHAR(64) NOT NULL, plain_content MEDIUMTEXT NOT NULL,
  rich_content MEDIUMTEXT NULL, description VARCHAR(500) NULL, tags JSON NOT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE, is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  site_restrictions JSON NULL, version INT NOT NULL DEFAULT 1, usage_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP NULL, deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY idx_snippets_workspace (workspace_id),
  CONSTRAINT fk_snippets_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE workspace_invitations (
  id VARCHAR(36) NOT NULL, workspace_id VARCHAR(36) NOT NULL, email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'editor', token VARCHAR(64) NOT NULL,
  invited_by_id VARCHAR(36) NOT NULL, expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP NULL, revoked_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY token_unique (token),
  CONSTRAINT fk_inv_ws_legacy FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO users (id, email, name) VALUES ('u-legacy-1', 'inviter@example.test', 'Legacy Inviter');
INSERT INTO workspaces (id, name, slug, owner_id, is_personal) VALUES ('ws-legacy-1', 'Legacy Workspace', 'legacy-ws', 'u-legacy-1', TRUE);
INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES ('m-legacy-1', 'ws-legacy-1', 'u-legacy-1', 'owner');
INSERT INTO folders (id, workspace_id, name) VALUES ('f-legacy-1', 'ws-legacy-1', 'Legacy Folder');
INSERT INTO snippets (id, workspace_id, folder_id, name, shortcut, plain_content, tags, version)
  VALUES ('s-legacy-1', 'ws-legacy-1', 'f-legacy-1', 'Greeting', '/hi', 'Salut, bună ziua! ăîșțâ', JSON_ARRAY('legacy'), 3);
INSERT INTO workspace_invitations (id, workspace_id, email, role, token, invited_by_id, expires_at)
  VALUES ('inv-legacy-99', 'ws-legacy-1', 'pending.collaborator@example.test', 'editor',
          'plaintextsecrettoken999999999999999999', 'u-legacy-1', DATE_ADD(NOW(), INTERVAL 7 DAY));
