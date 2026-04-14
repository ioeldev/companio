import type { AgentTask } from "./types.ts";
import { buildCavemanBlock, memoriesWithoutCavemanKey, resolveCavemanLevel } from "./caveman.ts";

interface MemoryRow {
    key: string;
    value: string;
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

    const formatting =
        platformFormatting[task.platform as keyof typeof platformFormatting] || platformFormatting.default;

    return baseContext + formatting;
}

export interface IntegrationContext {
    clickupFolderId?: string;
    clickupMemberId?: string;
    slackEnabled?: boolean;
    /** From initCapabilities() / getCapabilities() — lists real integrations only */
    capabilitiesSection?: string;
}

export function buildSystemPrompt(
    task: AgentTask,
    memories: MemoryRow[],
    integrations: IntegrationContext = {}
): string {
    const platformBlock = buildPlatformBlock(task);
    const memoriesForDisplay = memoriesWithoutCavemanKey(memories);
    const memoriesBlock =
        memoriesForDisplay.length > 0
            ? memoriesForDisplay.map((m) => `- ${m.key}: ${m.value}`).join("\n")
            : "(no memories yet)";

    const clickupBlock = integrations.clickupFolderId
        ? `
## ClickUp
- Sprint / task questions: call get_lists with folder ID ${integrations.clickupFolderId}.
- Pick the **current sprint** list where \`start_date\` ≤ now ≤ \`due_date\` (both Unix ms); then load tasks only from that \`list_id\`.
- Member ID ${integrations.clickupMemberId ?? "unknown"}: use for assignee/creator filters when they ask for *their* tasks.
- Read each list's \`content\` for sprint themes (e.g. UI, infra).`
        : "";

    const slackBlock = integrations.slackEnabled
        ? `
## Slack
- You can read channels, send messages, and reply to threads via the Slack tools.
- When sending a message unprompted (e.g. a morning briefing), use the user's preferred Slack channel if stored in memory.`
        : "";

    const capabilitiesBlock = integrations.capabilitiesSection ? `\n${integrations.capabilitiesSection}\n` : "";

    const cavemanLevel = resolveCavemanLevel(memories);
    const cavemanBlock = cavemanLevel ? buildCavemanBlock(cavemanLevel) : "";

    return `You are Companio, a personal AI assistant. You are attentive, helpful, and concise.
${cavemanBlock}${platformBlock}
## What you know about this user
${memoriesBlock}
${capabilitiesBlock}${clickupBlock}${slackBlock}

## Behavior rules
- Caveman voice: controlled by user via first-line commands (processed before you run). If asked, explain: \`/caveman\` or \`/caveman full\` = on (levels: \`lite\`, \`full\`, \`ultra\`, \`wenyan-lite\`, \`wenyan-full\`, \`wenyan-ultra\`). \`stop caveman\` / \`normal mode\` / \`caveman off\` = off. \`caveman reset\` = clear override, revert to server default. Level saved in memory, persists across restarts. Can combine: first line = command, rest = message (e.g. \`/caveman ultra\nhello\`). Do NOT call set_memory yourself for caveman level — the handler does it.
- You run inside Companio's server: integrations (e.g. Slack) are already authorized via env. When the user asks you to use a tool, **call it** — never ask them to "grant permission", "allow MCP access", or approve anything in an IDE; that does not apply here.
- If the user asks you to remember something, call set_memory if available.
- If they ask to clear this chat, forget the conversation, or prune stored messages (not Slack/Telegram UI), call clear_conversation_history with their userId, platform, and threadId when applicable.
- If companio_sqlite appears in your tool list, use run_sql for ad-hoc queries they request about the local DB (respect read-only vs write mode from the deployment).
- Always reply in the same language the user writes in.
- Be concise unless the user explicitly asks for detail.
- If scheduling something for the future, use create_task (scheduler).
- Never make up facts. If unsure, say so.
- Today's date/time: ${new Date().toISOString()}`;
}
