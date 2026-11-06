import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema.js';
import { IRepository, InMemoryRepository } from './repository.js';
import { MySQLRepository } from './mysql-repository.js';

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
  const driver = forceDriver || process.env.DB_DRIVER || (databaseUrl ? 'mysql' : 'memory');

  if (driver === 'memory') {
    const repo = new InMemoryRepository();
    setRepository(repo, 'memory');
    return repo;
  }

  const url = databaseUrl || process.env.DATABASE_URL;
  if (!url) {
    console.warn('[DB] No DATABASE_URL provided. Operating with in-memory repository.');
    const repo = new InMemoryRepository();
    setRepository(repo, 'memory');
    return repo;
  }

  try {
    const pool = mysql.createPool(url);
    // Test connectivity
    const connection = await pool.getConnection();
    connection.release();

    const db = drizzle(pool, { schema, mode: 'default' });
    const repo = new MySQLRepository(db);
    setRepository(repo, 'mysql');
    console.log('[DB] Successfully connected to authoritative MySQL database.');
    return repo;
  } catch (err: any) {
    console.warn(`[DB] MySQL connection to ${url} failed (${err.message}). Falling back to in-memory repository.`);
    const repo = new InMemoryRepository();
    setRepository(repo, 'memory');
    return repo;
  }
}

