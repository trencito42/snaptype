import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export async function runMigrations(databaseUrl?: string) {
  const url = databaseUrl || process.env.DATABASE_URL;
  if (!url) {
    console.log('[Migration] No DATABASE_URL provided. Skipping MySQL migrations.');
    return;
  }

  console.log(`[Migration] Connecting to MySQL at ${url.replace(/:[^:@]+@/, ':****@')}`);
  const connection = await mysql.createConnection({
    uri: url,
    multipleStatements: true
  });

  try {
    const migrationFilePath = path.resolve(process.cwd(), '../../infrastructure/migrations/0001_initial_schema.sql');
    let sqlContent = '';
    if (fs.existsSync(migrationFilePath)) {
      sqlContent = fs.readFileSync(migrationFilePath, 'utf-8');
    } else {
      // Local path fallback
      const altPath = path.resolve(process.cwd(), 'infrastructure/migrations/0001_initial_schema.sql');
      if (fs.existsSync(altPath)) {
        sqlContent = fs.readFileSync(altPath, 'utf-8');
      }
    }

    if (sqlContent) {
      console.log('[Migration] Applying 0001_initial_schema.sql...');
      await connection.query(sqlContent);
      console.log('[Migration] Successfully applied migrations.');
    } else {
      console.warn('[Migration] Migration SQL file not found.');
    }
  } finally {
    await connection.end();
  }
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migration Error]', err);
      process.exit(1);
    });
}
