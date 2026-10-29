import { Bot, InlineKeyboard, type Context } from "grammy";
import type { Platform } from "./platform.ts";
import { collections } from "../db/schema.ts";
import {
    activeSession,
    createSession,
    enqueue,
    scope,
    selectSession,
    sessions,
    type Session,
} from "../sessions/store.ts";
import { isExecuting, pauseSession, startSessionWorker } from "../sessions/runner.ts";

export const commands = [
    { command: "new", description: "✨ Start a session — /new title" },
    { command: "sessions", description: "🗂 Browse and switch sessions" },
    { command: "switch", description: "↪ Switch session — /switch 2" },
    { command: "status", description: "📍 Current session and progress" },
    { command: "pause", description: "⏸ Pause current work" },
    { command: "resume", description: "▶ Continue saved work" },
    { command: "rename", description: "✏️ Rename current session" },
    { command: "archive", description: "📦 Archive an inactive session" },
    { command: "help", description: "💡 Commands and how sessions work" },
];
const icons: Record<string, string> = {
    idle: "💬",
    queued: "⏳",
    running: "⚙️",
    waiting: "❓",
    paused: "⏸",
    failed: "⚠️",
    archived: "📦",
};
export function splitTelegramMessage(text: string): string[] {
    // Count UTF-16 units conservatively, without splitting surrogate pairs.
    const chunks: string[] = [];
    let chunk = "";
    for (const character of text) {
        if (chunk.length + character.length > 3900) {
            chunks.push(chunk);
            chunk = "";
        }
        chunk += character;
    }
    if (chunk) chunks.push(chunk);
    return chunks;
}
const label = (s: Session) => `${icons[s.status]} #${s.number} · ${s.title}`;
const help =
    "✨ Companio sessions\n\n/new title — start fresh\n/sessions — choose a session\n/switch 2 — switch by number\n/status — progress and pending question\n/pause · /resume — control work\n/rename title — rename this session\n/archive — archive inactive session\n\nSwitching keeps other work running. Reply directly to a bot message to address its session. Otherwise, messages go to the selected session. Research, planning, and coding discussions each get their own context. Existing chat history remains stored separately.";

class TelegramPlatform implements Platform {
    readonly name = "telegram";
    get configured() {
        return !!process.env.TELEGRAM_BOT_TOKEN;
    }
    private bot: Bot | null = null;

    async deliver(s: Session, text: string) {
        if (!this.bot) throw new Error("Telegram not initialized");
        const keyboard = new InlineKeyboard().text("↪ Open session", `switch:${s.number}`);
        if (s.question) {
            s.question.options.forEach((option, i) =>
                keyboard
                    .row()
                    .text(
                        option.slice(0, 60),
                        `answer:${s.number}:${s.question!.toolCallId.slice(-20)}:${i}`,
                    ),
            );
        }
        for (const [index, chunk] of splitTelegramMessage(`${label(s)}\n\n${text}`).entries()) {
            const sent = await this.bot.api.sendMessage(
                s.channelId,
                chunk,
                index === 0 ? { reply_markup: keyboard } : {},
            );
            await collections.sessionDeliveries().insertOne({
                userId: s.userId,
                channelId: s.channelId,
                sessionId: s._id,
                messageId: sent.message_id,
            });
        }
    }

    start(): void {
        const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
        this.bot = bot;
        bot.use(async (ctx, next) => {
            const owner = process.env.TELEGRAM_OWNER_ID?.trim();
            if (owner && String(ctx.from?.id) !== owner) {
                if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: "Not authorized." });
                return;
            }
            await next();
        });
        const identity = (ctx: Context) => ({
            userId: String(ctx.from!.id),
            channelId: String(ctx.chat!.id),
        });
        const current = async (ctx: Context) => {
            const { userId, channelId } = identity(ctx);
            return activeSession(userId, channelId);
        };
        const showSessions = async (ctx: Context) => {
            const { userId, channelId } = identity(ctx);
            const all = await sessions()
                .find({ ...scope(userId, channelId), status: { $ne: "archived" } })
                .sort({ number: -1 })
                .limit(30)
                .toArray();
            const active = await current(ctx);
            const keyboard = new InlineKeyboard();
            for (const s of all)
                keyboard
                    .text(
                        `${s.number === active?.number ? "✓ " : ""}${label(s)}`.slice(0, 60),
                        `switch:${s.number}`,
                    )
                    .row();
            keyboard.text("✨ New session", "new");
            await ctx.reply(
                all.length
                    ? `🗂 Your sessions\n\n${all.map((s) => `${label(s)} — ${s.status}`).join("\n")}\n\nTap to switch. Showing the latest 30; /switch accepts any session number.`
                    : "🗂 No sessions yet. Create your first one.",
                { reply_markup: keyboard },
            );
        };
        bot.command(["start", "help"], (ctx) => ctx.reply(help));
        bot.command("sessions", showSessions);
        bot.command("new", async (ctx) => {
            const { userId, channelId } = identity(ctx);
            const s = await createSession(userId, channelId, ctx.match || "New conversation");
            await ctx.reply(`✨ ${label(s)}\n\nWhat would you like to work on?`);
        });
        bot.command("switch", async (ctx) => {
            const s = await sessions().findOne({
                ...identity(ctx),
                number: Number(ctx.match),
                status: { $ne: "archived" },
            });
            if (!s) {
                await showSessions(ctx);
                return;
            }
            await selectSession(s);
            await ctx.reply(
                `Selected ${label(s)}\nStatus: ${s.status}${s.question ? `\n\n${s.question.question}` : ""}`,
            );
        });
        bot.command("status", async (ctx) => {
            const s = await current(ctx);
            if (!s) {
                await showSessions(ctx);
                return;
            }
            await this.deliver(
                s,
                `Status: ${s.status}\nSteps this run: ${s.steps}\n${s.notice ?? ""}`,
            );
        });
        bot.command("rename", async (ctx) => {
            const s = await current(ctx);
            if (!s || !ctx.match.trim()) {
                await ctx.reply("Select a session, then /rename new title");
                return;
            }
            await sessions().updateOne(
                { _id: s._id },
                { $set: { title: ctx.match.trim().slice(0, 80) } },
            );
            await ctx.reply("✏️ Session renamed.");
        });
        bot.command("pause", async (ctx) => {
            const s = await current(ctx);
            if (!s) {
                await showSessions(ctx);
                return;
            }
            await pauseSession(s);
            await ctx.reply(`⏸ #${s.number}: pause requested. Completed steps remain saved.`);
        });
        bot.command("resume", async (ctx) => {
            const s = await current(ctx);
            if (!s) {
                await showSessions(ctx);
                return;
            }
            if (isExecuting(s)) {
                await ctx.reply(
                    "The previous execution is still stopping. Try /resume again shortly.",
                );
                return;
            }
            if (JSON.stringify(s.messages).length > 240_000) {
                await ctx.reply(
                    "This session reached its context budget. Start a new session with a summary of the remaining work.",
                );
                return;
            }
            const result = await sessions().updateOne(
                { _id: s._id, status: { $in: ["paused", "failed"] } },
                {
                    $set: { status: "queued", steps: 0, updatedAt: new Date() },
                    $unset: { notice: "" },
                },
            );
            await ctx.reply(
                result.modifiedCount
                    ? `▶ Resuming #${s.number}.`
                    : "This session is not paused. Answer its pending question or send a new request.",
            );
        });
        bot.command("archive", async (ctx) => {
            const s = await current(ctx);
            if (!s) {
                await showSessions(ctx);
                return;
            }
            const result = await sessions().updateOne(
                { _id: s._id, status: { $nin: ["running", "queued"] } },
                { $set: { status: "archived", updatedAt: new Date() } },
            );
            await ctx.reply(
                result.modifiedCount
                    ? `📦 Archived #${s.number}. /sessions to select another.`
                    : "Pause this session before archiving it.",
            );
        });
        bot.on("callback_query:data", async (ctx) => {
            const data = ctx.callbackQuery.data;
            if (data === "new") {
                await ctx.answerCallbackQuery();
                const { userId, channelId } = identity(ctx);
                const s = await createSession(userId, channelId, "New conversation");
                await ctx.reply(`✨ ${label(s)}\nSend a request, or /rename a title.`);
                return;
            }
            const [action, number, questionId, option] = data.split(":");
            const s = await sessions().findOne({
                ...identity(ctx),
                number: Number(number),
                status: { $ne: "archived" },
            });
            if (!s) {
                await ctx.answerCallbackQuery({ text: "Session unavailable." });
                return;
            }
            if (action === "switch") {
                await selectSession(s);
                await ctx.answerCallbackQuery({ text: `Selected #${s.number}` });
                await ctx.reply(
                    `↪ ${label(s)}\nStatus: ${s.status}${s.question ? `\n\n${s.question.question}` : ""}`,
                );
            } else if (action === "answer") {
                const answer = s.question?.options[Number(option)];
                if (
                    s.status !== "waiting" ||
                    s.question?.toolCallId.slice(-20) !== questionId ||
                    !answer
                ) {
                    await ctx.answerCallbackQuery({ text: "This question is no longer pending." });
                    return;
                }
                await enqueue(s, answer, `callback:${ctx.callbackQuery.id}`);
                await ctx.answerCallbackQuery({ text: "Answer saved" });
                await ctx.reply(`▶ #${s.number}: ${answer}`);
            } else await ctx.answerCallbackQuery();
        });
        bot.on("message:text", async (ctx) => {
            if (ctx.message.text.startsWith("/")) {
                await ctx.reply("Unknown command. /help lists the available commands.");
                return;
            }
            const { userId, channelId } = identity(ctx);
            const replyId = ctx.message.reply_to_message?.message_id;
            const linked = replyId
                ? await collections
                      .sessionDeliveries()
                      .findOne({ userId, channelId, messageId: replyId })
                : null;
            let s = linked
                ? await sessions().findOne({ _id: linked.sessionId, userId, channelId })
                : await current(ctx);
            s ??= await createSession(userId, channelId, ctx.message.text.slice(0, 60));
            try {
                await enqueue(s, ctx.message.text, `message:${ctx.message.message_id}`);
                await ctx.reply(
                    `⏳ #${s.number} · ${s.title}\n${s.question ? "Answer saved. Continuing…" : "Working on it. You can switch sessions while I work."}`,
                );
            } catch (err) {
                await ctx.reply(
                    err instanceof Error ? err.message : "Could not queue the message.",
                );
            }
        });
        bot.catch((err) => console.error("Telegram handler failed:", err.error));
        void (async () => {
            await bot.api.setMyCommands(commands);
            await bot.api.setChatMenuButton({ menu_button: { type: "commands" } });
            await startSessionWorker((s, text) => this.deliver(s, text));
            await bot.start();
        })().catch((err) => console.error("Telegram startup failed:", err));
    }
    async send(channelId: string, message: string): Promise<void> {
        if (!this.bot) throw new Error("Telegram not initialized");
        for (const chunk of splitTelegramMessage(message))
            await this.bot.api.sendMessage(channelId, chunk);
    }
}
export const telegramPlatform = new TelegramPlatform();
