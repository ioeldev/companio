import { getPendingReminders, markFired } from "./index.ts";
import { respond } from "../router/respond.ts";
import { db } from "../db/schema.ts";

const POLL_INTERVAL_MS = 60_000; // every 60 seconds

export function startReminderPoller(): void {
  console.log("⏰ Reminder poller started");

  setInterval(async () => {
    const pending = getPendingReminders();
    for (const reminder of pending) {
      try {
        await respond(reminder.platform, reminder.channelId, `⏰ Reminder: ${reminder.message}`);
        markFired(reminder.id);
        db.run(
          `INSERT INTO events (userId, type, payload) VALUES (?, 'reminder_fired', ?)`,
          [reminder.userId, JSON.stringify({ reminderId: reminder.id, message: reminder.message })]
        );
        console.log(`Fired reminder ${reminder.id} for user ${reminder.userId}`);
      } catch (err) {
        console.error(`Failed to fire reminder ${reminder.id}:`, err);
        db.run(
          `INSERT INTO events (userId, type, payload) VALUES (?, 'error', ?)`,
          [reminder.userId, JSON.stringify({ error: String(err), reminderId: reminder.id })]
        );
      }
    }
  }, POLL_INTERVAL_MS);
}
