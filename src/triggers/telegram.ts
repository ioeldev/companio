import { Bot } from "grammy";
import { runCompanion } from "../agent/companion.ts";
import type { AgentTask } from "../agent/types.ts";

// Rate limiting: track per-user message timestamps
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimitMap.set(userId, recent);
  return recent.length > RATE_LIMIT_MAX;
}

let botInstance: Bot | null = null;

export function getTelegramBot(): Bot | null {
  return botInstance;
}

export function startTelegram(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN not set, skipping Telegram");
    return;
  }

  const bot = new Bot(token);
  botInstance = bot;

  bot.on("message:text", async (ctx) => {
    const userId = String(ctx.from?.id ?? "unknown");
    const chatId = String(ctx.chat.id);
    const text = ctx.message.text;

    if (isRateLimited(userId)) {
      await ctx.reply("Slow down, I'm thinking.");
      return;
    }

    const task: AgentTask = {
      trigger: "telegram",
      userId,
      channelId: chatId,
      message: text,
      threadId: chatId,
      platform: "telegram",
    };

    try {
      const response = await runCompanion(task);
      try {
        await ctx.reply(response, { parse_mode: "Markdown" });
      } catch {
        await ctx.reply(response);
      }
    } catch (err) {
      console.error("Companion error:", err);
      await ctx.reply("Something went wrong. Please try again.");
    }
  });

  bot.start().catch((err) => {
    console.error("Telegram bot error:", err);
  });

  console.log("📱 Telegram bot started");
}
