import { db } from "../db/schema.ts";

export interface ScheduledTask {
  id: number;
  userId: string;
  label: string;
  prompt: string;
  schedule: string;      // cron expression OR ISO datetime
  recurring: number;     // 0 = one-shot, 1 = repeating
  mode: "message" | "agent";
  platform: string;
  channelId: string;
  active: number;
  lastFiredAt: string | null;
  createdAt: string;
}

export function createTask(
  userId: string,
  label: string,
  prompt: string,
  schedule: string,
  recurring: boolean,
  mode: "message" | "agent",
  platform: string,
  channelId: string
): ScheduledTask {
  const result = db.run(
    `INSERT INTO scheduled_tasks (userId, label, prompt, schedule, recurring, mode, platform, channelId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, label, prompt, schedule, recurring ? 1 : 0, mode, platform, channelId]
  );
  return getTask(result.lastInsertRowid as number)!;
}

export function getTask(id: number): ScheduledTask | null {
  return db
    .query<ScheduledTask, [number]>("SELECT * FROM scheduled_tasks WHERE id = ?")
    .get(id) ?? null;
}

export function getActiveTasks(): ScheduledTask[] {
  return db
    .query<ScheduledTask, []>("SELECT * FROM scheduled_tasks WHERE active = 1")
    .all();
}

export function listTasks(userId: string): ScheduledTask[] {
  return db
    .query<ScheduledTask, [string]>(
      "SELECT * FROM scheduled_tasks WHERE userId = ? AND active = 1 ORDER BY createdAt ASC"
    )
    .all(userId);
}

export function deactivateTask(id: number): void {
  db.run("UPDATE scheduled_tasks SET active = 0 WHERE id = ?", [id]);
}

export function deleteTask(id: number): void {
  db.run("DELETE FROM scheduled_tasks WHERE id = ?", [id]);
}

export function touchFiredAt(id: number): void {
  db.run(
    "UPDATE scheduled_tasks SET lastFiredAt = datetime('now') WHERE id = ?",
    [id]
  );
}
