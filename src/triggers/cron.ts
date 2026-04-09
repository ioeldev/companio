import { Cron } from "croner";
import { runCompanion } from "../agent/companion.ts";
import { pruneOldConversations } from "../memory/conversations.ts";
import type { AgentTask } from "../agent/types.ts";

export function startCrons(): void {
  const ownerId = process.env.TELEGRAM_OWNER_ID;
  const channelId = ownerId ?? "";

  // Morning briefing at 08:00 every day
  new Cron("0 8 * * *", async () => {
    if (!channelId) {
      console.warn("TELEGRAM_OWNER_ID not set, skipping morning briefing");
      return;
    }

    console.log("🌅 Running morning briefing cron");

    const task: AgentTask = {
      trigger: "cron",
      userId: channelId,
      channelId,
      platform: "telegram",
      message:
        "Give me a morning briefing. Check my memories for anything time-sensitive today. Be concise.",
      threadId: channelId,
    };

    try {
      // Import respond lazily to avoid circular deps
      const { respond } = await import("../router/respond.ts");
      const response = await runCompanion(task);
      await respond("telegram", channelId, response);
    } catch (err) {
      console.error("Morning briefing cron error:", err);
    }
  });

  // Daily cleanup at 03:00
  new Cron("0 3 * * *", () => {
    console.log("🧹 Running daily conversation prune");
    pruneOldConversations();
  });

  console.log("⏰ Crons started (morning briefing @ 08:00, prune @ 03:00)");
}
