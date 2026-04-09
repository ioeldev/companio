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
      await bot.api.sendMessage(channelId, message);
      break;
    }
    default:
      console.warn(`Unknown platform: ${platform}, dropping message`);
  }
}
