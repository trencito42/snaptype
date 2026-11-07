import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

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
    // 1. Ensure schema_migrations table exists
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
