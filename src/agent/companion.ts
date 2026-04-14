import { generateText, stepCountIs } from "ai";
import { getMemories } from "../memory/index.ts";
import { saveConversation, getContextMessages } from "../memory/conversations.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { getCapabilities } from "./capabilities.ts";
import { resolveModel } from "./model.ts";
import { db } from "../db/schema.ts";
import type { AgentTask } from "./types.ts";
import { processCavemanUserCommand } from "./caveman.ts";

export async function runCompanion(task: AgentTask): Promise<string> {
    const capabilities = getCapabilities();

    const cave = processCavemanUserCommand(task.userId, task.message);
    if (cave.earlyReply !== undefined) {
        saveConversation(task.userId, task.platform, task.threadId ?? null, "user", task.message.trim());
        saveConversation(task.userId, task.platform, task.threadId ?? null, "assistant", cave.earlyReply);
        db.run(`INSERT INTO events (userId, type, payload) VALUES (?, 'message_received', ?)`, [
            task.userId,
            JSON.stringify({ platform: task.platform, trigger: task.trigger, cavemanCommand: true }),
        ]);
        db.run(`INSERT INTO events (userId, type, payload) VALUES (?, 'message_sent', ?)`, [
            task.userId,
            JSON.stringify({ platform: task.platform, cavemanCommand: true }),
        ]);
        return cave.earlyReply;
    }

    const userMessageForTurn =
        cave.textForModel !== task.message ? cave.textForModel.trim() || task.message.trim() : task.message.trim();

    const memories = getMemories(task.userId);

    const systemPrompt = buildSystemPrompt(task, memories, {
        clickupFolderId: process.env.CLICKUP_FOLDER_ID,
        clickupMemberId: process.env.CLICKUP_MEMBER_ID,
        slackEnabled: capabilities.slackEnabled,
        capabilitiesSection: capabilities.capabilitiesPromptSection,
    });

    saveConversation(task.userId, task.platform, task.threadId ?? null, "user", userMessageForTurn);

    db.run(`INSERT INTO events (userId, type, payload) VALUES (?, 'message_received', ?)`, [
        task.userId,
        JSON.stringify({ platform: task.platform, trigger: task.trigger }),
    ]);

    const contextMessages = getContextMessages(task.userId, task.platform, task.threadId ?? null);

    let resultText = "";

    try {
        const result = await generateText({
            model: resolveModel(),
            system: systemPrompt,
            messages: contextMessages,
            tools: capabilities.tools,
            stopWhen: stepCountIs(10),
        });
        resultText = result.text?.trim() ?? "";
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        db.run(`INSERT INTO events (userId, type, payload) VALUES (?, 'error', ?)`, [
            task.userId,
            JSON.stringify({ error: errorMsg }),
        ]);
        throw err;
    }

    if (resultText) {
        saveConversation(task.userId, task.platform, task.threadId ?? null, "assistant", resultText);
        db.run(`INSERT INTO events (userId, type, payload) VALUES (?, 'message_sent', ?)`, [
            task.userId,
            JSON.stringify({ platform: task.platform, length: resultText.length }),
        ]);
    }

    return resultText || "I'm here. What can I help you with?";
}
