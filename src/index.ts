import { stopSessionWorker } from "./sessions/runner.ts";
import { initDatabase, closeDatabase } from "./db/schema.ts";
import { initCapabilities, closeMcpClients } from "./agent/capabilities.ts";
import { registerPlatform, startAllPlatforms } from "./triggers/registry.ts";
import { telegramPlatform } from "./triggers/telegram.ts";
import { discordPlatform } from "./triggers/discord.ts";
import { startScheduler } from "./scheduler/engine.ts";
import { startCrons } from "./triggers/cron.ts";
import { startDashboard } from "./ui/server.ts";

await initDatabase();
console.log("MongoDB connected");

await initCapabilities();

registerPlatform(telegramPlatform);
registerPlatform(discordPlatform);

await startScheduler();
startCrons();
startAllPlatforms();
startDashboard();

console.log("Companio is running");

const shutdown = async () => {
    await stopSessionWorker();
    await closeMcpClients();
    await closeDatabase();
    process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
