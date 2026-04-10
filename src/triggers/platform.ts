export interface Platform {
  readonly name: string;
  start(): void;
  send(channelId: string, message: string): Promise<void>;
}
