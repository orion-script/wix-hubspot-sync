import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

// This is a global variable to keep the database connection alive across hot-reloads in development
let dbInstance: Database | null = null;

export async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = path.resolve(process.cwd(), 'database.sqlite');
  
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      wixInstanceId TEXT PRIMARY KEY,
      hubspotAccessToken TEXT,
      hubspotRefreshToken TEXT,
      hubspotExpiresAt INTEGER,
      hubspotPortalId TEXT
    );

    CREATE TABLE IF NOT EXISTS mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wixInstanceId TEXT,
      wixField TEXT,
      hubspotProperty TEXT,
      direction TEXT, -- 'WIX_TO_HUBSPOT', 'HUBSPOT_TO_WIX', 'BIDIRECTIONAL'
      UNIQUE(wixInstanceId, wixField, hubspotProperty)
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      wixContactId TEXT,
      hubspotContactId TEXT,
      wixInstanceId TEXT,
      lastSyncedAt INTEGER,
      lastSource TEXT,
      PRIMARY KEY (wixContactId, hubspotContactId)
    );
  `);

  dbInstance = db;
  return db;
}
