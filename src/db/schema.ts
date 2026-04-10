import { Database } from "bun:sqlite";
import { join } from "node:path";

const dbPath = join(import.meta.dir, "../../companio.db");
export const db = new Database(dbPath, { create: true });

// Enable WAL mode for better concurrent access
db.run("PRAGMA journal_mode=WAL;");
db.run("PRAGMA foreign_keys=ON;");

export function migrate(): void {
  db.run(`
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

    -- unified scheduler: replaces the old one-shot reminders table
    -- schedule: cron expression ("54 5 * * *") or ISO datetime ("2026-04-09T17:00:00Z")
    -- mode: "message" = send prompt text directly | "agent" = run through runCompanion
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id          INTEGER PRIMARY KEY,
      userId      TEXT NOT NULL,
      label       TEXT NOT NULL,
      prompt      TEXT NOT NULL,
      schedule    TEXT NOT NULL,
      recurring   INTEGER DEFAULT 0,
      mode        TEXT NOT NULL DEFAULT 'message',
      platform    TEXT NOT NULL,
      channelId   TEXT NOT NULL,
      active      INTEGER DEFAULT 1,
      lastFiredAt TEXT,
      createdAt   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY,
      userId      TEXT NOT NULL,
      type        TEXT NOT NULL,
      payload     TEXT,
      createdAt   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
      id          INTEGER PRIMARY KEY,
      userId      TEXT NOT NULL,
      platform    TEXT NOT NULL,
      threadId    TEXT,
      sessionId   TEXT NOT NULL,
      updatedAt   TEXT DEFAULT (datetime('now')),
      UNIQUE(userId, platform, threadId)
    );
  `);
}
