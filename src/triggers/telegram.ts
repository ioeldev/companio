import { Bot } from "grammy";
import { runCompanion } from "../agent/companion.ts";
import type { AgentTask } from "../agent/types.ts";
import type { Platform } from "./platform.ts";

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

class TelegramPlatform implements Platform {
  readonly name = "telegram";
  get configured(): boolean {
    return !!process.env.TELEGRAM_BOT_TOKEN;
  }
  private bot: Bot | null = null;

  start(): void {
    const token = process.env.TELEGRAM_BOT_TOKEN!;
    const ownerId = process.env.TELEGRAM_OWNER_ID?.trim();

    const bot = new Bot(token);
    this.bot = bot;

    bot.on("message:text", async (ctx) => {
      const userId = String(ctx.from?.id ?? "unknown");
      const chatId = String(ctx.chat.id);
      const text = ctx.message.text;

      // Restrict to owner when TELEGRAM_OWNER_ID is set (your numeric Telegram user id)
      if (ownerId && userId !== ownerId) return;

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
        console.error("Companion error (Telegram):", err);
        await ctx.reply("Something went wrong. Please try again.");
      }
    });

    bot.start().catch((err) => {
      console.error("Telegram bot error:", err);
    });

    console.log("📱 Telegram bot started");
  }

  async send(channelId: string, message: string): Promise<void> {
    if (!this.bot) {
      console.error("Telegram bot not initialized, cannot send message");
      return;
    }
    try {
      await this.bot.api.sendMessage(channelId, message, { parse_mode: "Markdown" });
    } catch {
      await this.bot.api.sendMessage(channelId, message);
    }
  }
}

export const telegramPlatform = new TelegramPlatform();
