import { db } from "../db/schema.ts";

interface ReminderRow {
  id: number;
  userId: string;
  message: string;
  scheduledAt: string;
  platform: string;
  channelId: string;
  fired: number;
  createdAt: string;
}

export function createReminder(
  userId: string,
  message: string,
  scheduledAt: string,
  platform: string,
  channelId: string
): number {
  const result = db.run(
    `INSERT INTO reminders (userId, message, scheduledAt, platform, channelId)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, message, scheduledAt, platform, channelId]
  );
  return result.lastInsertRowid as number;
}

export function getPendingReminders(): ReminderRow[] {
  return db
    .query<ReminderRow, []>(
      `SELECT * FROM reminders
       WHERE fired = 0 AND scheduledAt <= datetime('now')
       ORDER BY scheduledAt ASC`
    )
    .all();
}

export function listReminders(userId: string): ReminderRow[] {
  return db
    .query<ReminderRow, [string]>(
      `SELECT * FROM reminders WHERE userId = ? AND fired = 0 ORDER BY scheduledAt ASC`
    )
    .all(userId);
}

export function markFired(id: number): void {
  db.run("UPDATE reminders SET fired = 1 WHERE id = ?", [id]);
}

export function deleteReminder(id: number): void {
  db.run("DELETE FROM reminders WHERE id = ?", [id]);
}
