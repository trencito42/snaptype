import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findMigrationsDir(): string | null {
  const possiblePaths = [
    path.resolve(process.cwd(), '../../infrastructure/migrations'),
    path.resolve(process.cwd(), 'infrastructure/migrations'),
    path.resolve(__dirname, '../../../../infrastructure/migrations'),
    path.resolve(__dirname, '../../../infrastructure/migrations'),
    path.resolve(__dirname, '../../infrastructure/migrations'),
  ];

  for (const candidate of possiblePaths) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return null;
}

async function ensureColumnExists(
  connection: mysql.Connection,
  tableName: string,
  columnName: string,
  columnDefinition: string
): Promise<void> {
  try {
    const [rows]: any = await connection.query(
      `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );
    if (!rows || rows.length === 0) {
      console.log(`[Migration] Adding missing column ${tableName}.${columnName}...`);
      await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnDefinition}`);
    }
  } catch (err) {
    // If table doesn't exist yet (e.g. before 0001), ignore and continue
    console.debug(`[Migration] ensureColumnExists check skipped for ${tableName}.${columnName}:`, (err as any)?.message);
  }
}

async function upgradeWorkspaceInvitationsTokenHash(connection: mysql.Connection): Promise<void> {
  try {
    const [tables]: any = await connection.query(
      `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workspace_invitations'`
    );
    if (!tables || tables.length === 0) return;

    const [cols]: any = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workspace_invitations'`
    );
    const colNames = new Set(Array.isArray(cols) ? cols.map((c: any) => c.COLUMN_NAME) : []);

    if (!colNames.has('token_hash')) {
      console.log('[Migration] Adding column workspace_invitations.token_hash...');
      await connection.query(`ALTER TABLE \`workspace_invitations\` ADD COLUMN \`token_hash\` VARCHAR(128) NULL AFTER \`role\``);
    }

    if (colNames.has('token')) {
      console.log('[Migration] Upgrading active invitation tokens to SHA-256 token_hash...');
      await connection.query(
        `UPDATE \`workspace_invitations\` SET \`token_hash\` = SHA2(\`token\`, 256) WHERE (\`token_hash\` IS NULL OR \`token_hash\` = '') AND \`token\` IS NOT NULL`
      );

      await connection.query(
        `ALTER TABLE \`workspace_invitations\` MODIFY COLUMN \`token_hash\` VARCHAR(128) NOT NULL`
      );

      const [indices]: any = await connection.query(
        `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workspace_invitations' AND COLUMN_NAME = 'token_hash'`
      );
      if (!Array.isArray(indices) || indices.length === 0) {
        console.log('[Migration] Adding unique index idx_invitation_token_hash...');
        await connection.query(
          `ALTER TABLE \`workspace_invitations\` ADD UNIQUE KEY \`idx_invitation_token_hash\` (\`token_hash\`)`
        );
      }

      const [oldIndices]: any = await connection.query(
        `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workspace_invitations' AND COLUMN_NAME = 'token'`
      );
      if (Array.isArray(oldIndices)) {
        for (const idx of oldIndices) {
          if (idx.INDEX_NAME && idx.INDEX_NAME !== 'PRIMARY') {
            console.log(`[Migration] Dropping old index ${idx.INDEX_NAME}...`);
            await connection.query(`ALTER TABLE \`workspace_invitations\` DROP INDEX \`${idx.INDEX_NAME}\``);
          }
        }
      }

      console.log('[Migration] Dropping plaintext token column from workspace_invitations...');
      await connection.query(`ALTER TABLE \`workspace_invitations\` DROP COLUMN \`token\``);
    }
  } catch (err: any) {
    console.debug('[Migration] upgradeWorkspaceInvitationsTokenHash skipped:', err?.message);
  }
}

export async function runMigrations(databaseUrl?: string): Promise<string[]> {
  const url = databaseUrl || process.env.DATABASE_URL;
  if (!url) {
    console.log('[Migration] No DATABASE_URL provided. Skipping MySQL migrations.');
    return [];
  }

  console.log(`[Migration] Connecting to MySQL at ${url.replace(/:[^:@]+@/, ':****@')}`);
  const connection = await mysql.createConnection({
    uri: url,
    multipleStatements: true
  });

  const appliedMigrations: string[] = [];

  try {
    // 1. Ensure schema_migrations table exists with standard id column
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Fetch already applied migrations
    const [rows] = await connection.query<mysql.RowDataPacket[]>('SELECT id FROM schema_migrations ORDER BY id ASC');
    const appliedSet = new Set(rows.map((r: any) => r.id));

    // 3. Discover migration directory and files
    const migrationsDir = findMigrationsDir();
    if (!migrationsDir) {
      console.warn('[Migration] Migration SQL directory not found.');
      return [];
    }

    const files = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    console.log(`[Migration] Found ${files.length} migration file(s) in ${migrationsDir}`);

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[Migration] Skipping ${file} (already applied)`);
        continue;
      }

      console.log(`[Migration] Applying ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');

      if (sqlContent.trim()) {
        await connection.query(sqlContent);
      }

      await connection.query('INSERT INTO schema_migrations (id) VALUES (?)', [file]);
      console.log(`[Migration] Successfully applied and recorded ${file}`);
      appliedMigrations.push(file);
    }

    // 4. Ensure legacy tables receive upgrade columns safely without CLI DELIMITER dependencies
    await ensureColumnExists(connection, 'folders', 'revision', 'INT NOT NULL DEFAULT 1 AFTER sort_order');
    await ensureColumnExists(connection, 'snippets', 'revision', 'INT NOT NULL DEFAULT 1 AFTER version');

    // 5. Upgrade workspace_invitations token to token_hash, preserving active invitations (Release Blocker 1)
    await upgradeWorkspaceInvitationsTokenHash(connection);

    console.log(`[Migration] Completed. Applied ${appliedMigrations.length} new migration(s).`);
    return appliedMigrations;
  } finally {
    await connection.end();
  }
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migration Error]', err);
      process.exit(1);
    });
}
