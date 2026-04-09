import { Cron } from "croner";
import { pruneOldConversations } from "../memory/conversations.ts";

export function startCrons(): void {
  // Prune conversations older than 30 days — system housekeeping, not user-configurable
  new Cron("0 3 * * *", () => {
    console.log("🧹 Pruning old conversations");
    pruneOldConversations();
  });

  console.log("⏰ System cron started (prune @ 03:00)");
}
