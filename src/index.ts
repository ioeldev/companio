import { migrate } from "./db/schema.ts";
import { initCapabilities, closeMcpClients } from "./agent/capabilities.ts";
import { registerPlatform, startAllPlatforms } from "./triggers/registry.ts";
import { telegramPlatform } from "./triggers/telegram.ts";
import { discordPlatform } from "./triggers/discord.ts";
import { startScheduler } from "./scheduler/engine.ts";
import { startCrons } from "./triggers/cron.ts";
import { startDashboard } from "./ui/server.ts";

migrate();
console.log("Database migrated");

await initCapabilities();

registerPlatform(telegramPlatform);
registerPlatform(discordPlatform);

startScheduler();
startCrons();
startAllPlatforms();
startDashboard();

console.log("Companio is running");

const shutdown = async () => {
    await closeMcpClients();
    process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
