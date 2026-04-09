import { migrate } from "./db/schema.ts";
import { startTelegram } from "./triggers/telegram.ts";
import { startScheduler } from "./scheduler/engine.ts";
import { startCrons } from "./triggers/cron.ts";

migrate();
console.log("✅ Database migrated");

startScheduler();   // loads persisted tasks from DB and registers with croner
startCrons();       // system-only housekeeping (prune)
startTelegram();

console.log("🤖 Companio is running");
