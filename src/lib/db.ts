import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let dbInstance: Database | null = null;

export async function getDb() {
  if (dbInstance) return dbInstance;

  const dbPath = path.resolve(process.cwd(), 'database.sqlite');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });

  // Core tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      wixInstanceId       TEXT PRIMARY KEY,
      hubspotAccessToken  TEXT,  -- AES-256-GCM encrypted
      hubspotRefreshToken TEXT,  -- AES-256-GCM encrypted
      hubspotExpiresAt    INTEGER,
      hubspotPortalId     TEXT
    );

    CREATE TABLE IF NOT EXISTS mappings (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      wixInstanceId    TEXT,
      wixField         TEXT,
      hubspotProperty  TEXT,
      direction        TEXT,   -- WIX_TO_HUBSPOT | HUBSPOT_TO_WIX | BIDIRECTIONAL
      transform        TEXT DEFAULT 'none',  -- none | trim | lowercase | trim_lowercase
      UNIQUE(wixInstanceId, wixField, hubspotProperty)
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      wixContactId      TEXT,
      hubspotContactId  TEXT,
      wixInstanceId     TEXT,
      lastSyncedAt      INTEGER,
      lastSource        TEXT,   -- WIX_TO_HUBSPOT | HUBSPOT_TO_WIX
      wixUpdatedAt      INTEGER DEFAULT 0,
      hsUpdatedAt       INTEGER DEFAULT 0,
      lastWixHash       TEXT DEFAULT '',
      lastHsHash        TEXT DEFAULT '',
      PRIMARY KEY (wixContactId, hubspotContactId)
    );
  `);

  // Safe migrations for existing DBs that may not have newer columns
  const migrations = [
    `ALTER TABLE mappings ADD COLUMN transform TEXT DEFAULT 'none'`,
    `ALTER TABLE sync_state ADD COLUMN wixUpdatedAt INTEGER DEFAULT 0`,
    `ALTER TABLE sync_state ADD COLUMN hsUpdatedAt INTEGER DEFAULT 0`,
    `ALTER TABLE sync_state ADD COLUMN lastWixHash TEXT DEFAULT ''`,
    `ALTER TABLE sync_state ADD COLUMN lastHsHash TEXT DEFAULT ''`,
    `ALTER TABLE connections ADD COLUMN hubspotPortalId TEXT`,
  ];

  for (const sql of migrations) {
    try {
      await db.exec(sql);
    } catch {
      // Column already exists — safe to ignore
    }
  }

  dbInstance = db;
  return db;
}
