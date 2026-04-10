import { getTelegramBot } from "../triggers/telegram.ts";

export async function respond(
  platform: string,
  channelId: string,
  message: string
): Promise<void> {
  switch (platform) {
    case "telegram": {
      const bot = getTelegramBot();
      if (!bot) {
        console.error("Telegram bot not initialized, cannot send message");
        return;
      }
      try {
        await bot.api.sendMessage(channelId, message, { parse_mode: "Markdown" });
      } catch {
        await bot.api.sendMessage(channelId, message);
      }
      break;
    }
    case "slack": {
      // TODO: Implement Slack integration
      console.warn("Slack platform not yet implemented");
      break;
    }
    case "discord": {
      // TODO: Implement Discord integration
      console.warn("Discord platform not yet implemented");
      break;
    }
    default:
      console.warn(`Unknown platform: ${platform}, dropping message`);
  }
}
