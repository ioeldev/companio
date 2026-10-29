import { expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { ToolLoopAgent, tool, stepCountIs, type ModelMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { answerMessages, type Session } from "./store.ts";
import { questionSchema } from "./runner.ts";
import { splitTelegramMessage } from "../triggers/telegram.ts";

const session = (messages: ModelMessage[] = []): Session => ({
    _id: new ObjectId(),
    userId: "owner",
    channelId: "chat",
    number: 1,
    title: "Research",
    status: "idle",
    messages,
    steps: 0,
    updatedAt: new Date(),
});
test("ordinary messages preserve isolated session history", () => {
    const a = session([{ role: "user", content: "Research A" }]);
    const b = session([{ role: "user", content: "Research B" }]);
    expect(answerMessages(a, "Continue")).toHaveLength(2);
    expect(JSON.stringify(answerMessages(a, "Continue"))).not.toContain("Research B");
    expect(b.messages).toHaveLength(1);
});
test("Telegram chunks preserve emoji and stay within the limit", () => {
    const text = "🙂".repeat(6000);
    const chunks = splitTelegramMessage(text);
    expect(chunks.join("")).toBe(text);
    expect(chunks.every((c) => c.length <= 3900 && !/[\uD800-\uDBFF]$/.test(c))).toBe(true);
});
test("native SDK pauses for clarification, serializes, and resumes with the tool answer", async () => {
    const usage = {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
    };
    const model = new MockLanguageModelV3({
        doGenerate: [
            {
                content: [
                    {
                        type: "tool-call",
                        toolCallId: "question-1",
                        toolName: "ask_user",
                        input: JSON.stringify({
                            question: "Which region?",
                            options: ["Europe", "Asia"],
                        }),
                    },
                ],
                finishReason: { unified: "tool-calls", raw: undefined },
                usage,
                warnings: [],
            },
            {
                content: [{ type: "text", text: "Researching Europe." }],
                finishReason: { unified: "stop", raw: undefined },
                usage,
                warnings: [],
            },
        ],
    });
    const agent = new ToolLoopAgent({
        model,
        stopWhen: stepCountIs(1),
        tools: { ask_user: tool({ inputSchema: questionSchema }) },
    });
    const first = await agent.generate({
        messages: [{ role: "user", content: "Research destinations" }],
    });
    expect(model.doGenerateCalls).toHaveLength(1);
    const saved = JSON.parse(
        JSON.stringify(session(first.response.messages as ModelMessage[])),
    ) as Session;
    saved.question = {
        toolCallId: "question-1",
        question: "Which region?",
        options: ["Europe", "Asia"],
    };
    const next = answerMessages(saved, "Europe");
    const result = await agent.generate({ messages: next });
    expect(result.text).toBe("Researching Europe.");
    expect(JSON.stringify(model.doGenerateCalls[1]!.prompt)).toContain("question-1");
    expect(JSON.stringify(model.doGenerateCalls[1]!.prompt)).toContain("Europe");
});
