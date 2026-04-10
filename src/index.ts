import { migrate } from "./db/schema.ts";
import { startTelegram } from "./triggers/telegram.ts";
import { startScheduler } from "./scheduler/engine.ts";
import { startCrons } from "./triggers/cron.ts";
import { startDashboard } from "./ui/server.ts";

migrate();
console.log("✅ Database migrated");

startScheduler();
startCrons();
startTelegram();
startDashboard();

console.log(`🤖 Companio is running`);
