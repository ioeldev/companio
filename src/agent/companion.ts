import { query } from "@anthropic-ai/claude-agent-sdk";
import { getMemories } from "../memory/index.ts";
import { saveConversation, getRecentConversations } from "../memory/conversations.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { getCapabilities } from "./capabilities.ts";
import { getBuiltinAllowedToolNames, getBuiltinPermissionOptions, getBuiltinTools } from "./builtin-tools.ts";
import { db } from "../db/schema.ts";
import type { AgentTask } from "./types.ts";

export async function runCompanion(task: AgentTask): Promise<string> {
    const capabilities = getCapabilities();
    const memories = getMemories(task.userId);
    const recentTurns = getRecentConversations(task.userId, task.platform, task.threadId ?? null);

    const systemPrompt = buildSystemPrompt(memories, recentTurns, {
        clickupSpaceId: process.env.CLICKUP_SPACE_ID,
        clickupMemberId: process.env.CLICKUP_MEMBER_ID,
        slackEnabled: capabilities.slackEnabled,
        capabilitiesSection: capabilities.capabilitiesPromptSection,
    });

    saveConversation(task.userId, task.platform, task.threadId ?? null, "user", task.message);

    db.run(`INSERT INTO events (userId, type, payload) VALUES (?, 'message_received', ?)`, [
        task.userId,
        JSON.stringify({ platform: task.platform, trigger: task.trigger }),
    ]);

    let result = "";

    try {
        for await (const message of query({
            prompt: task.message,
            options: {
                systemPrompt,
                tools: getBuiltinTools(),
                allowedTools: [...capabilities.allowedTools, ...getBuiltinAllowedToolNames()],
                mcpServers: capabilities.mcpServers,
                maxTurns: 10,
                persistSession: false,
                ...getBuiltinPermissionOptions(),
            },
        })) {
            if (message.type === "result" && message.subtype === "success") {
                result = message.result;
            }
        }
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        db.run(`INSERT INTO events (userId, type, payload) VALUES (?, 'error', ?)`, [
            task.userId,
            JSON.stringify({ error: errorMsg }),
        ]);
        throw err;
    }

    if (result) {
        saveConversation(task.userId, task.platform, task.threadId ?? null, "assistant", result);
        db.run(`INSERT INTO events (userId, type, payload) VALUES (?, 'message_sent', ?)`, [
            task.userId,
            JSON.stringify({ platform: task.platform, length: result.length }),
        ]);
    }

    return result || "I'm here. What can I help you with?";
}
