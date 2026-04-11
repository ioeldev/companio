import { tool, type ToolSet } from "ai";
import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { z } from "zod";
import { createTask, listTasks, deleteTask } from "../scheduler/index.ts";
import { registerTask, unregisterTask, getActiveJobs } from "../scheduler/engine.ts";
import { externalMcpServers, type ExternalMcpStdioConfig } from "../mcp/servers.ts";
import { db } from "../db/schema.ts";
import { clearConversationHistory } from "../memory/conversations.ts";
import { getCompanioSqliteTools } from "./companio-sqlite-mcp.ts";

function buildSchedulerTools(): ToolSet {
    return {
        create_task: tool({
            description: `Schedule a task to run at a future time.
- For a one-time event use an ISO 8601 datetime as schedule, e.g. "2026-04-09T17:00:00Z"
- For a recurring task use a cron expression, e.g. "54 5 * * *" (every day at 05:54)
- mode "message": sends the prompt text directly to the user
- mode "agent": runs the prompt through the AI (use for briefings that need tool calls)`,
            inputSchema: z.object({
                userId: z.string().describe("User ID"),
                label: z.string().describe("Short human-readable name, e.g. 'morning briefing'"),
                prompt: z.string().describe("Message to send or prompt to run through the agent"),
                schedule: z.string().describe("Cron expression or ISO 8601 datetime"),
                recurring: z.boolean().describe("true = repeats on cron schedule, false = fires once"),
                mode: z.enum(["message", "agent"]).describe("'message' = send text directly, 'agent' = run through AI"),
                platform: z.string().describe("Platform, e.g. 'telegram'"),
                channelId: z.string().describe("Channel or chat ID to deliver to"),
            }),
            execute: async (args) => {
                const task = createTask(
                    args.userId,
                    args.label,
                    args.prompt,
                    args.schedule,
                    args.recurring,
                    args.mode,
                    args.platform,
                    args.channelId
                );
                registerTask(task);
                return `Task created (id=${task.id}): "${task.label}" — ${task.schedule}${
                    task.recurring ? " (recurring)" : " (one-shot)"
                }`;
            },
        }),
        list_tasks: tool({
            description: "List all active scheduled tasks for a user.",
            inputSchema: z.object({
                userId: z.string().describe("User ID"),
            }),
            execute: async (args) => {
                const tasks = listTasks(args.userId);
                if (tasks.length === 0) return "No active tasks.";
                return tasks
                    .map(
                        (t) =>
                            `[${t.id}] "${t.label}" | ${t.schedule} | ${
                                t.recurring ? "recurring" : "one-shot"
                            } | mode=${t.mode}`
                    )
                    .join("\n");
            },
        }),
        delete_task: tool({
            description: "Cancel and delete a scheduled task by its ID.",
            inputSchema: z.object({
                id: z.number().describe("Task ID to delete"),
            }),
            execute: async (args) => {
                unregisterTask(args.id);
                deleteTask(args.id);
                return `Task ${args.id} deleted.`;
            },
        }),
        check_active_crons: tool({
            description:
                "Diagnostic tool: see which cron jobs are currently running in the scheduler with their next fire times. Useful for debugging if tasks are scheduled but not firing.",
            inputSchema: z.object({}),
            execute: async () => {
                const jobs = getActiveJobs();
                if (jobs.length === 0) return "No active crons running.";
                const now = new Date();
                return jobs
                    .map((j) => {
                        const nextTime = j.nextFireTime;
                        const timeStr = nextTime ? nextTime.toISOString() : "unknown";
                        const timeUntil = nextTime ? Math.round((nextTime.getTime() - now.getTime()) / 1000) : 0;
                        return `[Task ${j.id}] Next fire: ${timeStr} (in ${timeUntil}s)`;
                    })
                    .join("\n");
            },
        }),
    };
}

function buildMemoryTools(): ToolSet {
    return {
        set_memory: tool({
            description: "Store or update a fact about the user in long-term memory.",
            inputSchema: z.object({
                userId: z.string().describe("User ID"),
                key: z.string().describe("Memory key, e.g. 'timezone', 'preferred_name'"),
                value: z.string().describe("Value to store"),
            }),
            execute: async (args) => {
                db.run(
                    `INSERT INTO memories (userId, key, value, source, updatedAt)
           VALUES (?, ?, ?, 'agent', datetime('now'))
           ON CONFLICT(userId, key) DO UPDATE SET
             value = excluded.value,
             source = 'agent',
             updatedAt = datetime('now')`,
                    [args.userId, args.key, args.value]
                );
                return `Memory saved: ${args.key} = ${args.value}`;
            },
        }),
        delete_memory: tool({
            description: "Remove a stored memory about the user.",
            inputSchema: z.object({
                userId: z.string().describe("User ID"),
                key: z.string().describe("Memory key to delete"),
            }),
            execute: async (args) => {
                db.run("DELETE FROM memories WHERE userId = ? AND key = ?", [args.userId, args.key]);
                return `Memory deleted: ${args.key}`;
            },
        }),
        clear_conversation_history: tool({
            description: `Remove stored chat transcript for this user from Companio's database (SQLite). Does not delete anything in Slack, Telegram, or other apps—only the local message history used for context. Use when the user asks to clear the conversation, forget this chat, or prune messages.`,
            inputSchema: z.object({
                userId: z.string().describe("User ID (same as for set_memory)"),
                platform: z.string().describe("Platform, e.g. slack or telegram"),
                threadId: z
                    .string()
                    .nullable()
                    .optional()
                    .describe("Thread/channel key for this chat; null or omit for DM or non-thread context"),
            }),
            execute: async (args) => {
                const raw = args.threadId;
                const thread = raw == null || (typeof raw === "string" && raw.trim() === "") ? null : raw;
                const n = clearConversationHistory(args.userId, args.platform, thread);
                return `Cleared ${n} stored message row(s) from the local conversation history.`;
            },
        }),
    };
}

function prefixToolKeys(prefix: string, tools: ToolSet): ToolSet {
    return Object.fromEntries(
        Object.entries(tools).map(([name, t]) => [`${prefix}__${name}`, t])
    ) as ToolSet;
}

async function connectExternalMcp(
    name: string,
    config: ExternalMcpStdioConfig
): Promise<{ tools: ToolSet; client: MCPClient } | null> {
    try {
        const client = await createMCPClient({
            transport: new Experimental_StdioMCPTransport({
                command: config.command,
                args: config.args ?? [],
                env: { ...process.env, ...config.env } as Record<string, string>,
            }),
        });
        const remoteTools = await client.tools();
        return { tools: prefixToolKeys(name, remoteTools as ToolSet), client };
    } catch (err) {
        console.error(`[companio] MCP server "${name}" failed to start:`, err);
        return null;
    }
}

export interface CompanionCapabilities {
    tools: ToolSet;
    /** Verbatim block for the system prompt */
    capabilitiesPromptSection: string;
    slackEnabled: boolean;
    clickupEnabled: boolean;
    githubEnabled: boolean;
}

const mcpClients: MCPClient[] = [];

let cachedCapabilities: CompanionCapabilities | null = null;

function githubTokenPresent(): boolean {
    const t = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? "";
    return t.trim().length > 0;
}

async function buildCompanionCapabilities(): Promise<CompanionCapabilities> {
    const slackEnabled = !!process.env.SLACK_BOT_TOKEN;
    const clickupEnabled = !!process.env.CLICKUP_API_KEY;
    const githubEnabled = githubTokenPresent();

    const tools: ToolSet = {
        ...buildSchedulerTools(),
        ...buildMemoryTools(),
    };

    const sqlToolEnabled = process.env.COMPANIO_SQL_TOOL === "true";
    if (sqlToolEnabled) {
        Object.assign(tools, getCompanioSqliteTools());
    }

    if (slackEnabled) {
        const conn = await connectExternalMcp("slack", externalMcpServers.slack!);
        if (conn) {
            Object.assign(tools, conn.tools);
            mcpClients.push(conn.client);
        }
    }
    if (clickupEnabled) {
        const conn = await connectExternalMcp("clickup", externalMcpServers.clickup!);
        if (conn) {
            Object.assign(tools, conn.tools);
            mcpClients.push(conn.client);
        }
    }
    if (githubEnabled) {
        const conn = await connectExternalMcp("github", externalMcpServers.github!);
        if (conn) {
            Object.assign(tools, conn.tools);
            mcpClients.push(conn.client);
        }
    }

    const lines: string[] = [
        "**Memory** — long-term facts via set_memory / delete_memory; clear_conversation_history wipes the local chat transcript for this user/thread (not third-party apps).",
        "**Scheduler** — one-shot or recurring user tasks via create_task, list_tasks, delete_task, check_active_crons (use check_active_crons to debug if tasks aren't firing).",
    ];
    if (slackEnabled) {
        lines.push("**Slack** — tools whose names start with `slack__` (Slack MCP server).");
    }
    if (clickupEnabled) {
        lines.push("**ClickUp** — tools whose names start with `clickup__` (ClickUp MCP).");
    }
    if (githubEnabled) {
        lines.push(
            "**GitHub** — tools whose names start with `github__` (@modelcontextprotocol/server-github; GITHUB_TOKEN)."
        );
    }
    if (sqlToolEnabled) {
        lines.push(
            "**run_sql** — query the local Companio SQLite DB; read-only unless COMPANIO_SQL_WRITE=true."
        );
    }

    const capabilitiesPromptSection = `## Available tools in this deployment
Only the integrations below are wired up.
${lines.map((l) => `- ${l}`).join("\n")}
When the user asks what you can access or which integrations you have, answer using **only** this list. If something is not listed, you do not have it.`;

    return {
        tools,
        capabilitiesPromptSection,
        slackEnabled,
        clickupEnabled,
        githubEnabled,
    };
}

/** Must be called once at process startup before runCompanion. */
export async function initCapabilities(): Promise<void> {
    if (cachedCapabilities) return;
    cachedCapabilities = await buildCompanionCapabilities();
    console.log("Agent capabilities initialized (AI SDK + MCP)");
}

export function getCapabilities(): CompanionCapabilities {
    if (!cachedCapabilities) {
        throw new Error("getCapabilities() called before initCapabilities()");
    }
    return cachedCapabilities;
}

/** Best-effort cleanup for tests or graceful shutdown. */
export async function closeMcpClients(): Promise<void> {
    await Promise.all(mcpClients.map((c) => c.close().catch(() => undefined)));
    mcpClients.length = 0;
    cachedCapabilities = null;
}
