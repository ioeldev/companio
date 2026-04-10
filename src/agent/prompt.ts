import type { AgentTask } from "./types.ts";

interface MemoryRow {
  key: string;
  value: string;
}

interface ConversationRow {
  role: string;
  content: string;
}

/**
 * Builds platform-specific formatting instructions for the system prompt.
 * Claude will format its response appropriately for the target platform.
 */
function buildPlatformBlock(task: AgentTask): string {
  const baseContext = `
## Current Context
- **Platform**: ${task.platform}
- **Trigger**: ${task.trigger}
- **User ID**: ${task.userId}
- **Channel/Chat ID**: ${task.channelId}
${task.threadId ? `- **Thread ID**: ${task.threadId}` : ""}`;

  const platformFormatting = {
    telegram: `
## Message Formatting (Telegram)
- Write your response with clear formatting and line breaks.
- Use \`backticks\` for inline code snippets.
- Use triple backticks for code blocks (e.g., \`\`\`javascript ... \`\`\`).
- Use markdown syntax like *bold* and _italic_ to add emphasis if helpful.
- Use [link text](url) for links.
- Keep messages concise and well-structured.`,

    slack: `
## Message Formatting (Slack)
- Use Slack's mrkdwn format.
- For code blocks, use triple backticks: \`\`\`
- For inline code, use single backticks: \`code\`
- For bold: *text*
- For italic: _text_
- For links: <url|text> or just <url>
- Use emoji where appropriate to enhance clarity.
- Messages support threads and reactions.`,

    discord: `
## Message Formatting (Discord)
- Use Discord's Markdown format.
- For code blocks, use triple backticks with optional language: \`\`\`language
- For inline code, use single backticks: \`code\`
- For bold: **text**
- For italic: *text* or _text_
- For links: [text](url)
- Mentions use @username or <@userid> format.
- Use embed-friendly formatting (concise sections).`,

    default: `
## Message Formatting
- Use clear, readable formatting with appropriate line breaks.
- Keep the message concise and well-structured.`,
  };

  const formatting = platformFormatting[task.platform as keyof typeof platformFormatting] || platformFormatting.default;

  return baseContext + formatting;
}

export interface IntegrationContext {
  clickupSpaceId?: string;
  clickupMemberId?: string;
  slackEnabled?: boolean;
  /** From getCapabilities() — lists real MCP integrations only */
  capabilitiesSection?: string;
}

export function buildSystemPrompt(
  task: AgentTask,
  memories: MemoryRow[],
  recentTurns: ConversationRow[],
  integrations: IntegrationContext = {}
): string {
  const platformBlock = buildPlatformBlock(task);
  const memoriesBlock =
    memories.length > 0
      ? memories.map((m) => `- ${m.key}: ${m.value}`).join("\n")
      : "(no memories yet)";

  const conversationBlock =
    recentTurns.length > 0
      ? recentTurns
          .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
          .join("\n")
      : "(no recent conversation)";

  const clickupBlock =
    integrations.clickupSpaceId
      ? `
## ClickUp
- When asked about tasks or the current sprint, use get_lists with Space ID ${integrations.clickupSpaceId} first.
  Look for the list where status or dates indicate it is currently active, then fetch tasks from that list_id.
- The user's member ID is ${integrations.clickupMemberId ?? "unknown"} — use it to filter by assignee or creator.`
      : "";

  const slackBlock = integrations.slackEnabled
    ? `
## Slack
- You can read channels, send messages, and reply to threads via the Slack tools.
- When sending a message unprompted (e.g. a morning briefing), use the user's preferred Slack channel if stored in memory.`
    : "";

  const capabilitiesBlock = integrations.capabilitiesSection
    ? `\n${integrations.capabilitiesSection}\n`
    : "";

  return `You are Companio, a personal AI assistant. You are attentive, helpful, and concise.
${platformBlock}
## What you know about this user
${memoriesBlock}

## Recent conversation
${conversationBlock}
${capabilitiesBlock}${clickupBlock}${slackBlock}

## Behavior rules
- If the user asks you to remember something, call set_memory if available.
- If they ask to clear this chat, forget the conversation, or prune stored messages (not Slack/Telegram UI), call clear_conversation_history with their userId, platform, and threadId when applicable.
- If companio_sqlite appears in your tool list, use run_sql for ad-hoc queries they request about the local DB (respect read-only vs write mode from the deployment).
- Always reply in the same language the user writes in.
- Be concise unless the user explicitly asks for detail.
- If scheduling something for the future, use create_task (scheduler).
- Never make up facts. If unsure, say so.
- Today's date/time: ${new Date().toISOString()}`;
}
