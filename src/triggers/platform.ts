export interface Platform {
  readonly name: string;
  /** Returns true when the required env vars are present. */
  readonly configured: boolean;
  start(): void;
  send(channelId: string, message: string): Promise<void>;
}
