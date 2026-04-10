import type { Platform } from "./platform.ts";

const platforms = new Map<string, Platform>();

export function registerPlatform(platform: Platform): void {
  if (!platform.configured) {
    console.warn(`⚠️  ${platform.name}: required env vars missing, skipping`);
    return;
  }
  platforms.set(platform.name, platform);
}

export function getPlatform(name: string): Platform | undefined {
  return platforms.get(name);
}

export function startAllPlatforms(): void {
  for (const platform of platforms.values()) {
    platform.start();
  }
}
