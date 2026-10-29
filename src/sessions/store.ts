import { ObjectId } from "mongodb";
import type { ModelMessage } from "ai";
import { collections } from "../db/schema.ts";

export type SessionStatus =
    "idle" | "queued" | "running" | "waiting" | "paused" | "failed" | "archived";
export interface Session {
    _id: ObjectId;
    userId: string;
    channelId: string;
    number: number;
    title: string;
    status: SessionStatus;
    messages: ModelMessage[];
    steps: number;
    question?: { toolCallId: string; question: string; options: string[] };
    notice?: string;
    pendingDelivery?: string;
    inputIds?: string[];
    updatedAt: Date;
}
export const sessions = () => collections.sessions();
export const scope = (userId: string, channelId: string) => ({ userId, channelId });
export async function createSession(userId: string, channelId: string, title: string) {
    const counter = await collections
        .sessionCounters()
        .findOneAndUpdate(
            scope(userId, channelId),
            { $inc: { value: 1 } },
            { upsert: true, returnDocument: "after" },
        );
    const session: Session = {
        _id: new ObjectId(),
        ...scope(userId, channelId),
        number: counter!.value,
        title: title.trim().slice(0, 80) || "New conversation",
        status: "idle",
        messages: [],
        steps: 0,
        updatedAt: new Date(),
    };
    await sessions().insertOne(session);
    await selectSession(session);
    return session;
}
export async function selectSession(s: Session) {
    await collections
        .sessionSelections()
        .updateOne(scope(s.userId, s.channelId), { $set: { sessionId: s._id } }, { upsert: true });
}
export async function activeSession(userId: string, channelId: string) {
    const selected = await collections.sessionSelections().findOne(scope(userId, channelId));
    return selected
        ? sessions().findOne({
              _id: selected.sessionId,
              ...scope(userId, channelId),
              status: { $ne: "archived" },
          })
        : null;
}
export function answerMessages(s: Session, text: string): ModelMessage[] {
    if (!s.question) return [...s.messages, { role: "user", content: text }];
    return [
        ...s.messages,
        {
            role: "tool",
            content: [
                {
                    type: "tool-result",
                    toolCallId: s.question.toolCallId,
                    toolName: "ask_user",
                    output: { type: "text", value: text },
                },
            ],
        },
    ];
}
export async function enqueue(s: Session, text: string, inputId?: string) {
    if (inputId && s.inputIds?.includes(inputId)) return;
    if (!["idle", "waiting"].includes(s.status))
        throw new Error("This session is busy or paused. Use /status, /pause, or /resume.");
    const result = await sessions().updateOne(
        {
            _id: s._id,
            status: s.status,
            updatedAt: s.updatedAt,
            ...(inputId ? { inputIds: { $ne: inputId } } : {}),
        },
        {
            $set: {
                messages: answerMessages(s, text),
                status: "queued",
                steps: 0,
                updatedAt: new Date(),
            },
            ...(inputId ? { $push: { inputIds: { $each: [inputId], $slice: -100 } } } : {}),
            $unset: { question: "", notice: "", pendingDelivery: "" },
        },
    );
    if (!result.modifiedCount) throw new Error("The session changed. Please try again.");
}
