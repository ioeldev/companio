import type { ModelMessage } from "ai";
import { db } from "../db/schema.ts";

interface ConversationRow {
  role: string;
  content: string;
  createdAt: string;
}

const CHARS_PER_TOKEN_ESTIMATE = 4;
/** Per-message cap before stubbing (plan: ~1500 tokens). */
const SINGLE_MESSAGE_MAX_TOKENS = 1500;

export function estimateMessageTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

function truncateMessageForContext(content: string): string {
  const est = estimateMessageTokens(content);
  if (est <= SINGLE_MESSAGE_MAX_TOKENS) return content;
  const maxChars = SINGLE_MESSAGE_MAX_TOKENS * CHARS_PER_TOKEN_ESTIMATE;
  return `[Content truncated from ~${est} tokens]\n${content.slice(0, maxChars)}\n[...truncated]`;
}

/** Loads up to maxRows messages, oldest-first (same ordering as getRecentConversations). */
export function getConversationRowsForContext(
  userId: string,
  platform: string,
  threadId: string | null,
  maxRows = 1000
): ConversationRow[] {
  return db
    .query<ConversationRow, [string, string, string | null, string | null, number]>(
      `SELECT role, content, createdAt FROM conversations
       WHERE userId = ? AND platform = ? AND (threadId = ? OR (threadId IS NULL AND ? IS NULL))
       ORDER BY createdAt DESC LIMIT ?`
    )
    .all(userId, platform, threadId, threadId, maxRows)
    .reverse();
}

/**
 * Builds model messages from SQLite, newest-first packing until tokenBudget (~chars/4) is reached.
 * Only user/assistant text rows (no tool call payloads).
 */
export function getContextMessages(
  userId: string,
  platform: string,
  threadId: string | null,
  tokenBudget = 20_000
): ModelMessage[] {
  const rows = getConversationRowsForContext(userId, platform, threadId);
  const messages: ModelMessage[] = [];
  let used = 0;

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    if (row.role !== "user" && row.role !== "assistant") continue;

    const content = truncateMessageForContext(row.content);
    const msgTokens = estimateMessageTokens(content);
    if (used + msgTokens > tokenBudget) break;

    messages.unshift({
      role: row.role as "user" | "assistant",
      content,
    });
    used += msgTokens;
  }

  return messages;
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

/** Deletes all stored messages and the SDK session for this user/thread (local SQLite only; not Slack/Telegram UI). */
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
  db.run(
    `DELETE FROM agent_sessions
     WHERE userId = ? AND platform = ? AND (threadId = ? OR (threadId IS NULL AND ? IS NULL))`,
    [userId, platform, threadId, threadId]
  );
  return result.changes;
}

export function getAgentSessionId(
  userId: string,
  platform: string,
  threadId: string | null
): string | null {
  const row = db
    .query<{ sessionId: string }, [string, string, string | null, string | null]>(
      `SELECT sessionId FROM agent_sessions
       WHERE userId = ? AND platform = ? AND (threadId = ? OR (threadId IS NULL AND ? IS NULL))`
    )
    .get(userId, platform, threadId, threadId);
  return row?.sessionId ?? null;
}

export function saveAgentSessionId(
  userId: string,
  platform: string,
  threadId: string | null,
  sessionId: string
): void {
  db.run(
    `INSERT INTO agent_sessions (userId, platform, threadId, sessionId, updatedAt)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(userId, platform, threadId) DO UPDATE SET sessionId = excluded.sessionId, updatedAt = excluded.updatedAt`,
    [userId, platform, threadId, sessionId]
  );
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
