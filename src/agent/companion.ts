import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getMemories } from "../memory/index.ts";
import { saveConversation, getRecentConversations } from "../memory/conversations.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { createReminder, listReminders, deleteReminder } from "../reminders/index.ts";
import { externalMcpServers } from "../mcp/servers.ts";
import { db } from "../db/schema.ts";
import type { AgentTask } from "./types.ts";

// In-process MCP server for reminders (Phase 2)
// Built once at module load — reused across all calls
const remindersMcp = createSdkMcpServer({
  name: "reminders",
  version: "1.0.0",
  tools: [
    tool(
      "create_reminder",
      "Schedule a reminder message to be sent to the user at a future time.",
      {
        message: z.string().describe("The reminder message to send"),
        scheduledAt: z.string().describe(
          "ISO 8601 datetime when the reminder should fire, e.g. 2024-12-31T15:00:00Z"
        ),
        platform: z.string().describe("Platform to send the reminder on (e.g. telegram)"),
        channelId: z.string().describe("Channel or chat ID to send the reminder to"),
        userId: z.string().describe("User ID to associate this reminder with"),
      },
      async (args) => {
        const id = createReminder(
          args.userId,
          args.message,
          args.scheduledAt,
          args.platform,
          args.channelId
        );
        return {
          content: [{ type: "text" as const, text: `Reminder created with id=${id}, fires at ${args.scheduledAt}` }],
        };
      }
    ),
    tool(
      "list_reminders",
      "List all pending reminders for a user.",
      {
        userId: z.string().describe("User ID to list reminders for"),
      },
      async (args) => {
        const reminders = listReminders(args.userId);
        if (reminders.length === 0) {
          return { content: [{ type: "text" as const, text: "No pending reminders." }] };
        }
        const text = reminders
          .map((r) => `[${r.id}] "${r.message}" at ${r.scheduledAt}`)
          .join("\n");
        return { content: [{ type: "text" as const, text }] };
      }
    ),
    tool(
      "delete_reminder",
      "Delete a pending reminder by its ID.",
      {
        id: z.number().describe("Reminder ID to delete"),
      },
      async (args) => {
        deleteReminder(args.id);
        return { content: [{ type: "text" as const, text: `Reminder ${args.id} deleted.` }] };
      }
    ),
  ],
});

// In-process MCP server for memory management
const memoryMcp = createSdkMcpServer({
  name: "memory",
  version: "1.0.0",
  tools: [
    tool(
      "set_memory",
      "Store or update a fact about the user in long-term memory.",
      {
        userId: z.string().describe("User ID"),
        key: z.string().describe("Memory key, e.g. 'timezone', 'preferred_name'"),
        value: z.string().describe("Value to store"),
      },
      async (args) => {
        db.run(
          `INSERT INTO memories (userId, key, value, source, updatedAt)
           VALUES (?, ?, ?, 'agent', datetime('now'))
           ON CONFLICT(userId, key) DO UPDATE SET
             value = excluded.value,
             source = 'agent',
             updatedAt = datetime('now')`,
          [args.userId, args.key, args.value]
        );
        return {
          content: [{ type: "text" as const, text: `Memory saved: ${args.key} = ${args.value}` }],
        };
      }
    ),
    tool(
      "delete_memory",
      "Remove a stored memory about the user.",
      {
        userId: z.string().describe("User ID"),
        key: z.string().describe("Memory key to delete"),
      },
      async (args) => {
        db.run("DELETE FROM memories WHERE userId = ? AND key = ?", [args.userId, args.key]);
        return { content: [{ type: "text" as const, text: `Memory deleted: ${args.key}` }] };
      }
    ),
  ],
});

// Build the active MCP server map — only include external servers when credentials are set
function buildMcpServers() {
  const servers: Record<string, (typeof externalMcpServers)[string] | typeof memoryMcp | typeof remindersMcp> = {
    memory: memoryMcp,
    reminders: remindersMcp,
  };
  if (process.env.SLACK_BOT_TOKEN) servers.slack = externalMcpServers.slack!;
  if (process.env.CLICKUP_API_KEY) servers.clickup = externalMcpServers.clickup!;
  return servers;
}

function buildAllowedTools(): string[] {
  const tools = ["mcp__memory__*", "mcp__reminders__*"];
  if (process.env.SLACK_BOT_TOKEN) tools.push("mcp__slack__*");
  if (process.env.CLICKUP_API_KEY) tools.push("mcp__clickup__*");
  return tools;
}

export async function runCompanion(task: AgentTask): Promise<string> {
  const memories = getMemories(task.userId);
  const recentTurns = getRecentConversations(
    task.userId,
    task.platform,
    task.threadId ?? null
  );

  const systemPrompt = buildSystemPrompt(memories, recentTurns, {
    clickupSpaceId: process.env.CLICKUP_SPACE_ID,
    clickupMemberId: process.env.CLICKUP_MEMBER_ID,
    slackEnabled: !!process.env.SLACK_BOT_TOKEN,
  });

  // Save the incoming user message
  saveConversation(task.userId, task.platform, task.threadId ?? null, "user", task.message);

  // Log event
  db.run(
    `INSERT INTO events (userId, type, payload) VALUES (?, 'message_received', ?)`,
    [task.userId, JSON.stringify({ platform: task.platform, trigger: task.trigger })]
  );

  let result = "";

  try {
    for await (const message of query({
      prompt: task.message,
      options: {
        systemPrompt,
        tools: [],  // disable built-in file/bash tools
        allowedTools: buildAllowedTools(),
        mcpServers: buildMcpServers(),
        maxTurns: 10,
      },
    })) {
      if (message.type === "result" && message.subtype === "success") {
        result = message.result;
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    db.run(
      `INSERT INTO events (userId, type, payload) VALUES (?, 'error', ?)`,
      [task.userId, JSON.stringify({ error: errorMsg })]
    );
    throw err;
  }

  if (result) {
    saveConversation(task.userId, task.platform, task.threadId ?? null, "assistant", result);
    db.run(
      `INSERT INTO events (userId, type, payload) VALUES (?, 'message_sent', ?)`,
      [task.userId, JSON.stringify({ platform: task.platform, length: result.length })]
    );
  }

  return result || "I'm here. What can I help you with?";
}
