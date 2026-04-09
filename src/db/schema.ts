import { Database } from "bun:sqlite";
import { join } from "node:path";

const dbPath = join(import.meta.dir, "../../companio.db");
export const db = new Database(dbPath, { create: true });

// Enable WAL mode for better concurrent access
db.exec("PRAGMA journal_mode=WAL;");
db.exec("PRAGMA foreign_keys=ON;");

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id          INTEGER PRIMARY KEY,
      userId      TEXT NOT NULL,
      key         TEXT NOT NULL,
      value       TEXT NOT NULL,
      source      TEXT,
      confidence  REAL DEFAULT 1.0,
      updatedAt   TEXT DEFAULT (datetime('now')),
      UNIQUE(userId, key)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id          INTEGER PRIMARY KEY,
      userId      TEXT NOT NULL,
      platform    TEXT NOT NULL,
      threadId    TEXT,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL,
      createdAt   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id          INTEGER PRIMARY KEY,
      userId      TEXT NOT NULL,
      message     TEXT NOT NULL,
      scheduledAt TEXT NOT NULL,
      platform    TEXT NOT NULL,
      channelId   TEXT NOT NULL,
      fired       INTEGER DEFAULT 0,
      createdAt   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY,
      userId      TEXT NOT NULL,
      type        TEXT NOT NULL,
      payload     TEXT,
      createdAt   TEXT DEFAULT (datetime('now'))
    );
  `);
}
