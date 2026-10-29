import { collections } from "../db/schema.ts";

interface MemoryRow {
    key: string;
    value: string;
    source: string | null;
    confidence: number;
    updatedAt: string;
}

export async function getMemories(userId: string): Promise<MemoryRow[]> {
    const rows = await collections.memories().find({ userId }).sort({ updatedAt: -1 }).toArray();
    return rows.map(({ key, value, source = null, confidence = 1, updatedAt }) => ({
        key,
        value,
        source,
        confidence,
        updatedAt: updatedAt.toISOString(),
    }));
}

export async function setMemory(
    userId: string,
    key: string,
    value: string,
    source = "agent",
): Promise<void> {
    await collections.memories().updateOne(
        { userId, key },
        {
            $set: { value, source, updatedAt: new Date() },
            $setOnInsert: { userId, key, confidence: 1 },
        },
        { upsert: true },
    );
}

export async function deleteMemory(userId: string, key: string): Promise<void> {
    await collections.memories().deleteOne({ userId, key });
}

export function formatMemoriesForPrompt(memories: MemoryRow[]): string {
    return memories.length === 0
        ? "(no memories yet)"
        : memories.map((m) => `- ${m.key}: ${m.value}`).join("\n");
}
