import { Client, GatewayIntentBits, Partials } from "discord.js";
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

// Discord's per-message character limit
const DISCORD_MAX_LENGTH = 2000;

function splitMessage(text: string): string[] {
  if (text.length <= DISCORD_MAX_LENGTH) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, DISCORD_MAX_LENGTH));
    remaining = remaining.slice(DISCORD_MAX_LENGTH);
  }
  return chunks;
}

class DiscordPlatform implements Platform {
  readonly name = "discord";
  get configured(): boolean {
    return !!process.env.DISCORD_BOT_TOKEN;
  }
  private client: Client | null = null;

  start(): void {
    const token = process.env.DISCORD_BOT_TOKEN!;

    const ownerId = process.env.DISCORD_OWNER_ID;

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message],
    });
    this.client = client;

    client.on("messageCreate", async (message) => {
      // Ignore bots (including self)
      if (message.author.bot) return;

      // Restrict to owner if DISCORD_OWNER_ID is set
      if (ownerId && message.author.id !== ownerId) return;

      // Respond to DMs or direct @mentions in guild channels
      const isDM = !message.guild;
      const isMentioned = client.user ? message.mentions.has(client.user) : false;
      if (!isDM && !isMentioned) return;

      // Strip bot mention from content
      const text = message.content.replace(/<@!?\d+>/g, "").trim();
      if (!text) return;

      const userId = message.author.id;
      const channelId = message.channel.id;

      if (isRateLimited(userId)) {
        await message.reply("Slow down, I'm thinking.");
        return;
      }

      const task: AgentTask = {
        trigger: "discord",
        userId,
        channelId,
        message: text,
        threadId: channelId,
        platform: "discord",
      };

      try {
        const response = await runCompanion(task);
        for (const chunk of splitMessage(response)) {
          await message.reply(chunk);
        }
      } catch (err) {
        console.error("Companion error (Discord):", err);
        await message.reply("Something went wrong. Please try again.");
      }
    });

    client.once("ready", (c) => {
      console.log(`🎮 Discord bot started (${c.user.tag})`);
    });

    client.login(token).catch((err) => {
      console.error("Discord login error:", err);
    });
  }

  async send(channelId: string, message: string): Promise<void> {
    if (!this.client) {
      console.error("Discord client not initialized, cannot send message");
      return;
    }
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !("send" in channel)) {
        console.error(`Discord channel ${channelId} is not sendable`);
        return;
      }
      const sendable = channel as { send(content: string): Promise<unknown> };
      for (const chunk of splitMessage(message)) {
        await sendable.send(chunk);
      }
    } catch (err) {
      console.error("Discord send error:", err);
    }
  }
}

export const discordPlatform = new DiscordPlatform();
