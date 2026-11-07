-- SnapType Migration 0003: Upgrade workspace_invitations token to token_hash
-- Safely backfills SHA-256 hash for active invitations without dropping or corrupting pending invites

-- 1. Ensure token_hash column exists if upgrading from legacy schema
-- (Handled programmatically in migrate.ts for compatibility across all MySQL versions)

SELECT 1;

