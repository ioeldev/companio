import { getPlatform } from "../triggers/registry.ts";

export async function respond(
  platform: string,
  channelId: string,
  message: string
): Promise<void> {
  const handler = getPlatform(platform);
  if (!handler) {
    console.warn(`Platform "${platform}" not registered, dropping message`);
    return;
  }
  await handler.send(channelId, message);
}
