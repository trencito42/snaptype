import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema.js';
import { IRepository, InMemoryRepository } from './repository.js';
import { MySQLRepository } from './mysql-repository.js';
import { runMigrations } from './migrate.js';

let activeRepository: IRepository | null = null;
let connectionType: 'mysql' | 'memory' = 'memory';

export function getRepository(): IRepository {
  if (!activeRepository) {
    activeRepository = new InMemoryRepository();
  }
  return activeRepository;
}

export function setRepository(repo: IRepository, type: 'mysql' | 'memory' = 'memory') {
  activeRepository = repo;
  connectionType = type;
}

export function getDatabaseStatus() {
  return {
    type: connectionType,
    isAuthoritative: connectionType === 'mysql',
    description: connectionType === 'mysql' 
      ? 'Connected to authoritative MySQL 8+ database' 
      : 'Running with in-memory persistence adapter'
  };
}

export async function initDatabase(databaseUrl?: string, forceDriver?: string): Promise<IRepository> {
  const isProduction = process.env.NODE_ENV === 'production';
  const driver = forceDriver || process.env.DB_DRIVER || ((databaseUrl || process.env.DATABASE_URL) ? 'mysql' : (isProduction ? 'mysql' : 'memory'));

  if (driver === 'memory') {
    if (isProduction) {
      throw new Error('[DB Fatal] In-memory repository is strictly forbidden in production. DATABASE_URL and MySQL 8+ are required.');
    }
    const repo = new InMemoryRepository();
    setRepository(repo, 'memory');
    console.log('[DB] Explicitly initialized with In-Memory Repository (Development/Test Mode).');
    return repo;
  }

  const url = databaseUrl || process.env.DATABASE_URL;
  if (!url) {
    if (isProduction) {
      throw new Error('[DB Fatal] DATABASE_URL must be specified in production. Silently falling back to volatile memory is prevented.');
    }
    console.warn('[DB] No DATABASE_URL provided. Operating with in-memory repository for local development.');
    const repo = new InMemoryRepository();
    setRepository(repo, 'memory');
    return repo;
  }

  try {
    const pool = mysql.createPool({
      uri: url,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    // Test connectivity
    const connection = await pool.getConnection();
    connection.release();

    // Ensure database migrations are applied before accepting traffic
    await runMigrations(url);

    const db = drizzle(pool, { schema, mode: 'default' });
    const repo = new MySQLRepository(db);
    setRepository(repo, 'mysql');
    console.log('[DB] Successfully connected to authoritative MySQL database.');
    return repo;
  } catch (err: any) {
    if (isProduction) {
      // In production, NEVER silently fall back to in-memory!
      throw new Error(`[DB Fatal] MySQL connection to database failed: ${err.message}. Startup aborted to prevent silent data loss.`);
    }
    console.warn(`[DB] MySQL connection to ${url} failed (${err.message}). Falling back to in-memory repository for local development.`);
    const repo = new InMemoryRepository();
    setRepository(repo, 'memory');
    return repo;
  }
}

