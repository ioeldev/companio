import { buildWorkspaceTools, stopWorkspaceCommands } from "../tools/workspace.ts";
import { ObjectId } from "mongodb";
import { ToolLoopAgent, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { sessions, type Session } from "./store.ts";
import { resolveModel } from "../agent/model.ts";
import { getCapabilities } from "../agent/capabilities.ts";
import { buildSystemPrompt } from "../agent/prompt.ts";
import { getMemories } from "../memory/index.ts";

export const questionSchema = z.object({
    question: z.string().min(1),
    options: z.array(z.string()).max(4).default([]),
});
export type Deliver = (session: Session, text: string) => Promise<void>;
let timer: ReturnType<typeof setInterval> | undefined;
let ticking = false;
const running = new Map<string, AbortController>();
let deliver: Deliver;
export const isExecuting = (s: Session) => running.has(String(s._id));

export async function pauseSession(s: Session) {
    await sessions().updateOne(
        { _id: s._id, status: { $in: ["running", "queued"] } },
        {
            $set: {
                status: "paused",
                notice: "Paused. An interrupted tool may have completed; verify external changes before resuming.",
                updatedAt: new Date(),
            },
        },
    );
    running.get(String(s._id))?.abort();
    stopWorkspaceCommands(String(s._id));
}

async function advance(s: Session) {
    const abort = new AbortController();
    running.set(String(s._id), abort);
    try {
        const caps = getCapabilities();
        const workspaceRoot = process.env.COMPANIO_WORKSPACE_ROOT?.trim();
        const workspaceEnabled =
            !!workspaceRoot && process.env.TELEGRAM_OWNER_ID?.trim() === s.userId;
        const workspaceTools = workspaceEnabled
            ? buildWorkspaceTools({
                  root: workspaceRoot!,
                  sessionId: String(s._id),
                  cwd: s.cwd,
                  setCwd: async (cwd) => {
                      await sessions().updateOne({ _id: s._id }, { $set: { cwd } });
                  },
              })
            : {};
        const workspacePrompt = workspaceEnabled
            ? `\nWorkspace tools are available: list_files, read_file, write_file, edit_file, workspace_directory, execute_shell, command_status. Host ~/seed is mounted at ${workspaceRoot}. Current directory: ${s.cwd || workspaceRoot}. Python is available through python3 in execute_shell. Use these tools for local code tasks and file inspection. Poll commands until finished and verify exit codes. Preserve user files and exact requested paths. Never assume a host path is mounted. Keep edits inside the workspace. Avoid editing the same checkout in simultaneous sessions; prefer separate git worktrees.`
            : "";
        const instructions =
            buildSystemPrompt(
                {
                    trigger: "telegram",
                    platform: "telegram",
                    userId: s.userId,
                    channelId: s.channelId,
                    threadId: String(s._id),
                    message: "",
                },
                await getMemories(s.userId),
                {
                    capabilitiesSection: caps.capabilitiesPromptSection + workspacePrompt,
                    slackEnabled: caps.slackEnabled,
                    clickupFolderId: process.env.CLICKUP_FOLDER_ID,
                    clickupMemberId: process.env.CLICKUP_MEMBER_ID,
                },
            ) +
            `\nSession: ${s.title}. Continue the user's task until complete. Use ask_user for required clarification, with concise options when helpful. Call ask_user alone, without other tools in the same step. Never claim capabilities you lack. An attached folder is context only unless file/shell tools are available. Report concrete results and validation. Only ask when the answer materially affects the work.`;
        // One SDK step per checkpoint: subsequent steps are scheduled durably in MongoDB.
        const agent = new ToolLoopAgent({
            model: resolveModel(),
            instructions,
            stopWhen: stepCountIs(1),
            tools: {
                ...caps.tools,
                ...workspaceTools,
                ask_user: tool({
                    description: "Ask the user a required question and wait for their answer.",
                    inputSchema: questionSchema,
                }),
            },
        });
        const result = await agent.generate({ messages: s.messages, abortSignal: abort.signal });
        const messages = [...s.messages, ...result.response.messages] as ModelMessage[];
        const calls = result.toolCalls.filter((c) => c.toolName === "ask_user");
        if (calls.length > 1)
            throw new Error("Multiple questions in one step; resume after checking the task.");
        const call = calls[0];
        const question = call
            ? { ...questionSchema.parse(call.input), toolCallId: call.toolCallId }
            : undefined;
        if (["length", "error", "content-filter", "unknown"].includes(result.finishReason)) {
            await sessions().updateOne(
                { _id: s._id, status: "running" },
                {
                    $set: {
                        messages,
                        status: "paused",
                        notice: `Model stopped: ${result.finishReason}. Review before resuming.`,
                        pendingDelivery: `Model stopped: ${result.finishReason}. Review before resuming.`,
                        updatedAt: new Date(),
                    },
                },
            );
            return;
        }
        const unfinished = result.finishReason === "tool-calls" && !question;
        const steps = s.steps + 1;
        const budget = steps >= 100 || JSON.stringify(messages).length > 240_000;
        const status = question ? "waiting" : unfinished ? (budget ? "paused" : "queued") : "idle";
        const notice = question
            ? question.question
            : budget && unfinished
              ? "Work saved. Step/context budget reached. Use /status before continuing."
              : result.text.trim() || "Run finished without a text response.";
        const saved = await sessions().updateOne(
            { _id: s._id, status: "running" },
            {
                $set: {
                    messages,
                    steps,
                    status,
                    updatedAt: new Date(),
                    ...(status !== "queued" ? { notice, pendingDelivery: notice } : {}),
                    ...(question ? { question } : {}),
                },
            },
        );
        // Delivery is retried independently from execution by the worker.
    } catch (err) {
        const notice =
            "Execution interrupted. Progress from completed steps is saved. Check external changes before /resume; an unfinished tool may have completed.";
        const changed = await sessions().updateOne(
            { _id: s._id, status: "running" },
            { $set: { status: "failed", notice, pendingDelivery: notice, updatedAt: new Date() } },
        );
        console.error("Session execution failed:", s.number, err);
    } finally {
        running.delete(String(s._id));
    }
}

export async function startSessionWorker(send: Deliver) {
    deliver = send;
    // Do not replay an uncertain external write after process death.
    await sessions().updateMany(
        { status: "running" },
        {
            $set: {
                status: "paused",
                notice: "Server restarted during execution. Check external changes, then /resume.",
                updatedAt: new Date(),
            },
        },
    );
    timer = setInterval(() => {
        void tick();
    }, 1000);
}
async function tick() {
    if (ticking) return;
    ticking = true;
    try {
        const pending = await sessions().findOne({ pendingDelivery: { $exists: true } });
        if (pending?.pendingDelivery) {
            try {
                await deliver(pending, pending.pendingDelivery);
                await sessions().updateOne(
                    { _id: pending._id, pendingDelivery: pending.pendingDelivery },
                    { $unset: { pendingDelivery: "" } },
                );
            } catch (err) {
                console.error("Session notification delivery failed:", err);
            }
        }
        if (running.size >= 3) return;
        const s = await sessions().findOneAndUpdate(
            { status: "queued", _id: { $nin: [...running.keys()].map((id) => new ObjectId(id)) } },
            { $set: { status: "running", updatedAt: new Date() } },
            { sort: { updatedAt: 1 }, returnDocument: "after" },
        );
        if (s) void advance(s);
    } catch (err) {
        console.error("Session worker:", err);
    } finally {
        ticking = false;
    }
}
export async function stopSessionWorker() {
    clearInterval(timer);
    stopWorkspaceCommands();
    for (const abort of running.values()) abort.abort();
    await sessions().updateMany(
        { status: "running" },
        {
            $set: {
                status: "paused",
                notice: "Server stopped during execution. Check external changes before /resume.",
                updatedAt: new Date(),
            },
        },
    );
}
