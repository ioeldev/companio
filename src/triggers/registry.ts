import type { Platform } from "./platform.ts";

const platforms = new Map<string, Platform>();

export function registerPlatform(platform: Platform): void {
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
