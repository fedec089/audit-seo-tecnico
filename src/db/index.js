// Apertura del database SQLite e applicazione dello schema.
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Apre (o crea) il DB della run e garantisce che lo schema esista.
 * @param {string} dbPath percorso del file .db
 * @returns {import('better-sqlite3').Database}
 */
export function openDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const ddl = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  db.exec(ddl);
  return db;
}
