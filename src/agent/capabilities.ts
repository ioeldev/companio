import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { createTask, listTasks, deleteTask } from "../scheduler/index.ts";
import { registerTask, unregisterTask, getActiveJobs } from "../scheduler/engine.ts";
import { externalMcpServers } from "../mcp/servers.ts";
import { db } from "../db/schema.ts";
import { clearConversationHistory } from "../memory/conversations.ts";
import { createCompanioSqliteMcp } from "./companio-sqlite-mcp.ts";

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
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Task created (id=${task.id}): "${task.label}" — ${task.schedule}${
                                task.recurring ? " (recurring)" : " (one-shot)"
                            }`,
                        },
                    ],
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
                const text = tasks
                    .map(
                        (t) =>
                            `[${t.id}] "${t.label}" | ${t.schedule} | ${
                                t.recurring ? "recurring" : "one-shot"
                            } | mode=${t.mode}`
                    )
                    .join("\n");
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
        tool(
            "check_active_crons",
            "Diagnostic tool: see which cron jobs are currently running in the scheduler with their next fire times. Useful for debugging if tasks are scheduled but not firing.",
            {},
            async () => {
                const jobs = getActiveJobs();
                if (jobs.length === 0) {
                    return { content: [{ type: "text" as const, text: "No active crons running." }] };
                }
                const now = new Date();
                const text = jobs
                    .map((j) => {
                        const nextTime = j.nextFireTime;
                        const timeStr = nextTime ? nextTime.toISOString() : "unknown";
                        const timeUntil = nextTime ? Math.round((nextTime.getTime() - now.getTime()) / 1000) : 0;
                        return `[Task ${j.id}] Next fire: ${timeStr} (in ${timeUntil}s)`;
                    })
                    .join("\n");
                return { content: [{ type: "text" as const, text }] };
            }
        ),
    ],
});

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
        tool(
            "clear_conversation_history",
            `Remove stored chat transcript for this user from Companio's database (SQLite). Does not delete anything in Slack, Telegram, or other apps—only the local message history used for context. Use when the user asks to clear the conversation, forget this chat, or prune messages.`,
            {
                userId: z.string().describe("User ID (same as for set_memory)"),
                platform: z.string().describe("Platform, e.g. slack or telegram"),
                threadId: z
                    .string()
                    .nullable()
                    .optional()
                    .describe("Thread/channel key for this chat; null or omit for DM or non-thread context"),
            },
            async (args) => {
                const raw = args.threadId;
                const thread =
                    raw == null || (typeof raw === "string" && raw.trim() === "") ? null : raw;
                const n = clearConversationHistory(args.userId, args.platform, thread);
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Cleared ${n} stored message row(s) from the local conversation history.`,
                        },
                    ],
                };
            }
        ),
    ],
});

type MountedServer =
    | (typeof externalMcpServers)["slack"]
    | (typeof externalMcpServers)["clickup"]
    | (typeof externalMcpServers)["github"]
    | typeof memoryMcp
    | typeof schedulerMcp
    | ReturnType<typeof createCompanioSqliteMcp>;

export interface CompanionCapabilities {
    mcpServers: Record<string, MountedServer>;
    allowedTools: string[];
    /** Verbatim block for the system prompt */
    capabilitiesPromptSection: string;
    slackEnabled: boolean;
    clickupEnabled: boolean;
    githubEnabled: boolean;
}

function githubTokenPresent(): boolean {
    const t = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? "";
    return t.trim().length > 0;
}

export function getCapabilities(): CompanionCapabilities {
    const slackEnabled = !!process.env.SLACK_BOT_TOKEN;
    const clickupEnabled = !!process.env.CLICKUP_API_KEY;
    const githubEnabled = githubTokenPresent();

    const mcpServers: Record<string, MountedServer> = {
        memory: memoryMcp,
        scheduler: schedulerMcp,
    };
    if (slackEnabled) mcpServers.slack = externalMcpServers.slack!;
    if (clickupEnabled) mcpServers.clickup = externalMcpServers.clickup!;
    if (githubEnabled) mcpServers.github = externalMcpServers.github!;

    const sqlToolEnabled = process.env.COMPANIO_SQL_TOOL === "true";
    if (sqlToolEnabled) {
        mcpServers.companio_sqlite = createCompanioSqliteMcp();
    }

    const allowedTools = ["mcp__memory__*", "mcp__scheduler__*"];
    if (slackEnabled) allowedTools.push("mcp__slack__*");
    if (clickupEnabled) allowedTools.push("mcp__clickup__*");
    if (githubEnabled) allowedTools.push("mcp__github__*");
    if (sqlToolEnabled) allowedTools.push("mcp__companio_sqlite__*");

    const lines: string[] = [
        "**Memory** — long-term facts via set_memory / delete_memory; clear_conversation_history wipes the local chat transcript for this user/thread (not third-party apps).",
        "**Scheduler** — one-shot or recurring user tasks via create_task, list_tasks, delete_task, check_active_crons (use check_active_crons to debug if tasks aren't firing).",
    ];
    if (slackEnabled) {
        lines.push("**Slack** — read channels and send messages via the Slack MCP tools.");
    }
    if (clickupEnabled) {
        lines.push("**ClickUp** — tasks and lists via the ClickUp MCP tools.");
    }
    if (githubEnabled) {
        lines.push(
            "**GitHub** — repos, issues, PRs, search, etc. via @modelcontextprotocol/server-github (GITHUB_TOKEN)."
        );
    }
    if (sqlToolEnabled) {
        lines.push(
            "**companio_sqlite** — run_sql against the local Companio DB; read-only unless COMPANIO_SQL_WRITE=true."
        );
    }

    const builtin = (process.env.COMPANIO_BUILTIN_TOOLS ?? "none").toLowerCase();
    if (builtin === "read") {
        lines.push("**Claude Code built-ins** — Read, Glob, Grep on the server working tree (COMPANIO_BUILTIN_TOOLS=read).");
    }
    if (builtin === "full" || builtin === "claude_code") {
        lines.push(
            "**Claude Code built-ins** — full preset: Bash, file edits, etc. (COMPANIO_BUILTIN_TOOLS=full). Extremely powerful; only for private bots."
        );
    }

    const capabilitiesPromptSection = `## Available tools in this deployment
Only the integrations below are wired up.
${lines.map((l) => `- ${l}`).join("\n")}
When the user asks what you can access or which integrations you have, answer using **only** this list. If something is not listed, you do not have it.`;

    return {
        mcpServers,
        allowedTools,
        capabilitiesPromptSection,
        slackEnabled,
        clickupEnabled,
        githubEnabled,
    };
}
