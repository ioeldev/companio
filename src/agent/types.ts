export interface AgentTask {
  trigger: "telegram" | "discord" | "cron" | "webhook";
  userId: string;
  channelId: string;
  message: string;
  threadId?: string;
  platform: string;
}

export interface AgentResponse {
  text: string;
  userId: string;
  platform: string;
  channelId: string;
}
