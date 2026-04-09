import { migrate } from "./db/schema.ts";
import { startTelegram } from "./triggers/telegram.ts";
import { startReminderPoller } from "./reminders/poller.ts";
import { startCrons } from "./triggers/cron.ts";

migrate();
console.log("✅ Database migrated");

startTelegram();
startReminderPoller();
startCrons();

console.log("🤖 Companio is running");
