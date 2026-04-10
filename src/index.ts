import { migrate } from "./db/schema.ts";
import { startTelegram } from "./triggers/telegram.ts";
import { startScheduler } from "./scheduler/engine.ts";
import { startCrons } from "./triggers/cron.ts";
import dashboard from "./ui/index.html";

migrate();
console.log("✅ Database migrated");

startScheduler();
startCrons();
startTelegram();

const server = Bun.serve({
  routes: {
    "/": dashboard,

    "/api/status": {
      GET: () => Response.json({ status: "ok" }),
    },
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🤖 Companio is running`);
console.log(`🌐 Dashboard at ${server.url}`);
