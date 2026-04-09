interface MemoryRow {
  key: string;
  value: string;
}

interface ConversationRow {
  role: string;
  content: string;
}

export function buildSystemPrompt(
  memories: MemoryRow[],
  recentTurns: ConversationRow[]
): string {
  const memoriesBlock =
    memories.length > 0
      ? memories.map((m) => `- ${m.key}: ${m.value}`).join("\n")
      : "(no memories yet)";

  const conversationBlock =
    recentTurns.length > 0
      ? recentTurns
          .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
          .join("\n")
      : "(no recent conversation)";

  return `You are Companio, a personal AI assistant. You are attentive, helpful, and concise.

## What you know about this user
${memoriesBlock}

## Recent conversation
${conversationBlock}

## Behavior rules
- If the user asks you to remember something, call the create_reminder or set_memory tool if available; otherwise acknowledge it and note it matters.
- Always reply in the same language the user writes in.
- Be concise unless the user explicitly asks for detail.
- If scheduling something for the future, use the create_reminder tool (Phase 2+).
- Never make up facts. If unsure, say so.
- Today's date/time context: ${new Date().toISOString()}`;
}
