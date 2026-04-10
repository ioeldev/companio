import { db } from "../db/schema.ts";

interface ConversationRow {
  role: string;
  content: string;
  createdAt: string;
}

export function saveConversation(
  userId: string,
  platform: string,
  threadId: string | null,
  role: "user" | "assistant",
  content: string
): void {
  db.run(
    `INSERT INTO conversations (userId, platform, threadId, role, content)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, platform, threadId ?? null, role, content]
  );
}

export function getRecentConversations(
  userId: string,
  platform: string,
  threadId: string | null,
  limit = 20
): ConversationRow[] {
  return db
    .query<ConversationRow, [string, string, string | null, string | null, number]>(
      `SELECT role, content, createdAt FROM conversations
       WHERE userId = ? AND platform = ? AND (threadId = ? OR (threadId IS NULL AND ? IS NULL))
       ORDER BY createdAt DESC LIMIT ?`
    )
    .all(userId, platform, threadId, threadId, limit)
    .reverse();
}

export function pruneOldConversations(): void {
  db.run(
    "DELETE FROM conversations WHERE createdAt < datetime('now', '-30 days')"
  );
}

/** Deletes all stored messages for this user/thread (local SQLite only; not Slack/Telegram UI). */
export function clearConversationHistory(
  userId: string,
  platform: string,
  threadId: string | null
): number {
  const result = db.run(
    `DELETE FROM conversations
     WHERE userId = ? AND platform = ? AND (threadId = ? OR (threadId IS NULL AND ? IS NULL))`,
    [userId, platform, threadId, threadId]
  );
  return result.changes;
}

export function countConversations(
  userId: string,
  platform: string,
  threadId: string | null
): number {
  const row = db
    .query<{ count: number }, [string, string, string | null, string | null]>(
      `SELECT COUNT(*) as count FROM conversations
       WHERE userId = ? AND platform = ? AND (threadId = ? OR (threadId IS NULL AND ? IS NULL))`
    )
    .get(userId, platform, threadId, threadId);
  return row?.count ?? 0;
}
