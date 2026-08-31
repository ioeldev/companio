import { generateText, stepCountIs } from "ai";
import { getMemories } from "../memory/index.ts";
import { saveConversation, getContextMessages } from "../memory/conversations.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { getCapabilities } from "./capabilities.ts";
import { resolveModel } from "./model.ts";
import { collections } from "../db/schema.ts";
import type { AgentTask } from "./types.ts";
import { processCavemanUserCommand } from "./caveman.ts";

export async function runCompanion(task: AgentTask): Promise<string> {
    const capabilities = getCapabilities();

    const cave = processCavemanUserCommand(task.userId, task.message);
    if (cave.earlyReply !== undefined) {
        await saveConversation(task.userId, task.platform, task.threadId ?? null, "user", task.message.trim());
        await saveConversation(task.userId, task.platform, task.threadId ?? null, "assistant", cave.earlyReply);
        await collections.events().insertMany([
            { userId: task.userId, type: "message_received", payload: JSON.stringify({ platform: task.platform, trigger: task.trigger, cavemanCommand: true }), createdAt: new Date() },
            { userId: task.userId, type: "message_sent", payload: JSON.stringify({ platform: task.platform, cavemanCommand: true }), createdAt: new Date() },
        ]);
        return cave.earlyReply;
    }

    const userMessageForTurn =
        cave.textForModel !== task.message ? cave.textForModel.trim() || task.message.trim() : task.message.trim();

    const memories = await getMemories(task.userId);

    const systemPrompt = buildSystemPrompt(task, memories, {
        clickupFolderId: process.env.CLICKUP_FOLDER_ID,
        clickupMemberId: process.env.CLICKUP_MEMBER_ID,
        slackEnabled: capabilities.slackEnabled,
        capabilitiesSection: capabilities.capabilitiesPromptSection,
    });

    await saveConversation(task.userId, task.platform, task.threadId ?? null, "user", userMessageForTurn);

    await collections.events().insertOne({ userId: task.userId, type: "message_received", payload: JSON.stringify({ platform: task.platform, trigger: task.trigger }), createdAt: new Date() });

    const contextMessages = await getContextMessages(task.userId, task.platform, task.threadId ?? null);

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
        await collections.events().insertOne({ userId: task.userId, type: "error", payload: JSON.stringify({ error: errorMsg }), createdAt: new Date() });
        throw err;
    }

    if (resultText) {
        await saveConversation(task.userId, task.platform, task.threadId ?? null, "assistant", resultText);
        await collections.events().insertOne({ userId: task.userId, type: "message_sent", payload: JSON.stringify({ platform: task.platform, length: resultText.length }), createdAt: new Date() });
    }

    return resultText || "I'm here. What can I help you with?";
}
