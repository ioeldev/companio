import { db } from "../db/schema.ts";

interface MemoryRow {
  key: string;
  value: string;
  source: string | null;
  confidence: number;
  updatedAt: string;
}

export function getMemories(userId: string): MemoryRow[] {
  return db
    .query<MemoryRow, [string]>(
      "SELECT key, value, source, confidence, updatedAt FROM memories WHERE userId = ? ORDER BY updatedAt DESC"
    )
    .all(userId);
}

export function setMemory(
  userId: string,
  key: string,
  value: string,
  source: string = "agent"
): void {
  db.run(
    `INSERT INTO memories (userId, key, value, source, updatedAt)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(userId, key) DO UPDATE SET
       value = excluded.value,
       source = excluded.source,
       updatedAt = datetime('now')`,
    [userId, key, value, source]
  );
}

export function deleteMemory(userId: string, key: string): void {
  db.run("DELETE FROM memories WHERE userId = ? AND key = ?", [userId, key]);
}

export function formatMemoriesForPrompt(memories: MemoryRow[]): string {
  if (memories.length === 0) return "(no memories yet)";
  return memories.map((m) => `- ${m.key}: ${m.value}`).join("\n");
}
