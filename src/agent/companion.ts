import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getMemories } from "../memory/index.ts";
import { saveConversation, getRecentConversations } from "../memory/conversations.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { createTask, listTasks, deleteTask } from "../scheduler/index.ts";
import { registerTask, unregisterTask } from "../scheduler/engine.ts";
import { externalMcpServers } from "../mcp/servers.ts";
import { db } from "../db/schema.ts";
import type { AgentTask } from "./types.ts";

// In-process MCP server for the unified scheduler
const schedulerMcp = createSdkMcpServer({
  name: "scheduler",
  version: "1.0.0",
  tools: [
    tool(
      "create_task",
      `Schedule a task to run at a future time.
- For a one-time event use an ISO 8601 datetime as schedule, e.g. "2026-04-09T17:00:00Z"
- For a recurring task use a cron expression, e.g. "54 5 * * *" (every day at 05:54)
- mode "message": sends the prompt text directly to the user
- mode "agent": runs the prompt through the AI (use for briefings that need tool calls)`,
      {
        userId: z.string().describe("User ID"),
        label: z.string().describe("Short human-readable name, e.g. 'morning briefing'"),
        prompt: z.string().describe("Message to send or prompt to run through the agent"),
        schedule: z.string().describe("Cron expression or ISO 8601 datetime"),
        recurring: z.boolean().describe("true = repeats on cron schedule, false = fires once"),
        mode: z.enum(["message", "agent"]).describe("'message' = send text directly, 'agent' = run through AI"),
        platform: z.string().describe("Platform, e.g. 'telegram'"),
        channelId: z.string().describe("Channel or chat ID to deliver to"),
      },
      async (args) => {
        const task = createTask(
          args.userId, args.label, args.prompt, args.schedule,
          args.recurring, args.mode, args.platform, args.channelId
        );
        registerTask(task);
        return {
          content: [{
            type: "text" as const,
            text: `Task created (id=${task.id}): "${task.label}" — ${task.schedule}${task.recurring ? " (recurring)" : " (one-shot)"}`,
          }],
        };
      }
    ),
    tool(
      "list_tasks",
      "List all active scheduled tasks for a user.",
      {
        userId: z.string().describe("User ID"),
      },
      async (args) => {
        const tasks = listTasks(args.userId);
        if (tasks.length === 0) {
          return { content: [{ type: "text" as const, text: "No active tasks." }] };
        }
        const text = tasks.map((t) =>
          `[${t.id}] "${t.label}" | ${t.schedule} | ${t.recurring ? "recurring" : "one-shot"} | mode=${t.mode}`
        ).join("\n");
        return { content: [{ type: "text" as const, text }] };
      }
    ),
    tool(
      "delete_task",
      "Cancel and delete a scheduled task by its ID.",
      {
        id: z.number().describe("Task ID to delete"),
      },
      async (args) => {
        unregisterTask(args.id);
        deleteTask(args.id);
        return { content: [{ type: "text" as const, text: `Task ${args.id} deleted.` }] };
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
  const servers: Record<string, typeof schedulerMcp | typeof memoryMcp | (typeof externalMcpServers)[string]> = {
    memory: memoryMcp,
    scheduler: schedulerMcp,
  };
  if (process.env.SLACK_BOT_TOKEN) servers.slack = externalMcpServers.slack!;
  if (process.env.CLICKUP_API_KEY) servers.clickup = externalMcpServers.clickup!;
  return servers;
}

function buildAllowedTools(): string[] {
  const tools = ["mcp__memory__*", "mcp__scheduler__*"];
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
        tools: [],
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
