import type { ModelMessage } from "ai";
import { collections } from "../db/schema.ts";

interface ConversationRow {
    role: string;
    content: string;
    createdAt: string;
}
const CHARS_PER_TOKEN_ESTIMATE = 4;
const SINGLE_MESSAGE_MAX_TOKENS = 1500;

export function estimateMessageTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}
function truncateMessageForContext(content: string): string {
    const est = estimateMessageTokens(content);
    if (est <= SINGLE_MESSAGE_MAX_TOKENS) return content;
    const maxChars = SINGLE_MESSAGE_MAX_TOKENS * CHARS_PER_TOKEN_ESTIMATE;
    return `[Content truncated from ~${est} tokens]\n${content.slice(0, maxChars)}\n[...truncated]`;
}

function rowsToConversationRows(
    rows: Array<{ role: string; content: string; createdAt: Date }>,
): ConversationRow[] {
    return rows.map(({ role, content, createdAt }) => ({
        role,
        content,
        createdAt: createdAt.toISOString(),
    }));
}

export async function getConversationRowsForContext(
    userId: string,
    platform: string,
    threadId: string | null,
    maxRows = 1000,
): Promise<ConversationRow[]> {
    const rows = await collections
        .conversations()
        .find({ userId, platform, threadId })
        .sort({ createdAt: -1 })
        .limit(maxRows)
        .toArray();
    return rowsToConversationRows(rows.reverse());
}

/** Builds model messages from MongoDB, newest-first packing until tokenBudget (~chars/4) is reached. */
export async function getContextMessages(
    userId: string,
    platform: string,
    threadId: string | null,
    tokenBudget = 20_000,
): Promise<ModelMessage[]> {
    const rows = await getConversationRowsForContext(userId, platform, threadId);
    const messages: ModelMessage[] = [];
    let used = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i]!;
        if (row.role !== "user" && row.role !== "assistant") continue;
        const content = truncateMessageForContext(row.content);
        const msgTokens = estimateMessageTokens(content);
        if (used + msgTokens > tokenBudget) break;
        messages.unshift({ role: row.role as "user" | "assistant", content });
        used += msgTokens;
    }
    return messages;
}

export async function saveConversation(
    userId: string,
    platform: string,
    threadId: string | null,
    role: "user" | "assistant",
    content: string,
): Promise<void> {
    await collections.conversations().insertOne({
        userId,
        platform,
        threadId: threadId ?? null,
        role,
        content,
        createdAt: new Date(),
    });
}

export async function getRecentConversations(
    userId: string,
    platform: string,
    threadId: string | null,
    limit = 20,
): Promise<ConversationRow[]> {
    const rows = await collections
        .conversations()
        .find({ userId, platform, threadId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
    return rowsToConversationRows(rows.reverse());
}

export async function pruneOldConversations(): Promise<void> {
    await collections
        .conversations()
        .deleteMany({ createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } });
}

export async function clearConversationHistory(
    userId: string,
    platform: string,
    threadId: string | null,
): Promise<number> {
    const filter = { userId, platform, threadId };
    const result = await collections.conversations().deleteMany(filter);
    await collections.agentSessions().deleteMany(filter);
    return result.deletedCount;
}

export async function getAgentSessionId(
    userId: string,
    platform: string,
    threadId: string | null,
): Promise<string | null> {
    return (
        (await collections.agentSessions().findOne({ userId, platform, threadId }))?.sessionId ??
        null
    );
}

export async function saveAgentSessionId(
    userId: string,
    platform: string,
    threadId: string | null,
    sessionId: string,
): Promise<void> {
    await collections.agentSessions().updateOne(
        { userId, platform, threadId },
        {
            $set: { sessionId, updatedAt: new Date() },
            $setOnInsert: { userId, platform, threadId },
        },
        { upsert: true },
    );
}

export async function countConversations(
    userId: string,
    platform: string,
    threadId: string | null,
): Promise<number> {
    return collections.conversations().countDocuments({ userId, platform, threadId });
}
