import { query } from "@anthropic-ai/claude-agent-sdk";
import { getMemories } from "../memory/index.ts";
import { saveConversation, getAgentSessionId, saveAgentSessionId } from "../memory/conversations.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { getCapabilities } from "./capabilities.ts";
import { getBuiltinAllowedToolNames, getBuiltinPermissionOptions, getBuiltinTools } from "./builtin-tools.ts";
import { db } from "../db/schema.ts";
import type { AgentTask } from "./types.ts";

export async function runCompanion(task: AgentTask): Promise<string> {
    const capabilities = getCapabilities();
    const memories = getMemories(task.userId);

    const systemPrompt = buildSystemPrompt(task, memories, {
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

    const existingSessionId = getAgentSessionId(task.userId, task.platform, task.threadId ?? null);

    let result = "";

    const runQuery = async (sessionId: string | null) => {
        for await (const message of query({
            prompt: task.message,
            options: {
                systemPrompt,
                tools: getBuiltinTools(),
                allowedTools: [...capabilities.allowedTools, ...getBuiltinAllowedToolNames()],
                mcpServers: capabilities.mcpServers,
                maxTurns: 10,
                ...(sessionId ? { resume: sessionId } : {}),
                ...getBuiltinPermissionOptions(),
            },
        })) {
            if (message.type === "result") {
                if (message.session_id) {
                    saveAgentSessionId(task.userId, task.platform, task.threadId ?? null, message.session_id);
                }
                if (message.subtype === "success") {
                    result = message.result;
                }
            }
        }
    };

    try {
        try {
            await runQuery(existingSessionId);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // If the stored session file is gone, retry as a fresh session
            if (existingSessionId && (msg.includes("session") || msg.includes("not found") || msg.includes("ENOENT"))) {
                await runQuery(null);
            } else {
                throw err;
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
