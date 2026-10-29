import { Lexer, type Token } from "marked";

type Tag = { open: string; close: string };
type Span = { text: string; tags: Tag[] };
export type TelegramChunk = { html: string; text: string };
export const escapeHtml = (value: string) =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
const tag = (name: string): Tag => ({ open: `<${name}>`, close: `</${name}>` });

/** Render a Markdown token tree using only Telegram-supported HTML tags.
 * Raw model HTML is always literal text, never trusted markup.
 */
export function formatTelegram(markdown: string, literalPrefix = ""): TelegramChunk[] {
    const spans: Span[] = [];
    const text = (value: string, tags: Tag[] = []) => {
        if (value) spans.push({ text: value, tags });
    };
    const walk = (tokens: Token[], tags: Tag[] = [], depth = 0) => {
        if (depth > 30) {
            for (const token of tokens) text(token.raw);
            return;
        }
        for (const token of tokens) {
            const children = (extra: Tag[] = tags) =>
                walk(("tokens" in token ? token.tokens : undefined) ?? [], extra, depth + 1);
            switch (token.type) {
                case "space":
                    text("\n");
                    break;
                case "paragraph":
                    children();
                    text("\n\n");
                    break;
                case "heading":
                    children([...tags, tag("b")]);
                    text("\n\n");
                    break;
                case "strong":
                    children([...tags, tag("b")]);
                    break;
                case "em":
                    children([...tags, tag("i")]);
                    break;
                case "del":
                    children([...tags, tag("s")]);
                    break;
                case "codespan":
                    text(token.text, [tag("code")]);
                    break;
                case "code": {
                    const language = (token.lang ?? "").split(/\s/)[0];
                    const code =
                        language && /^[\w+-]{1,32}$/.test(language)
                            ? { open: `<code class="language-${language}">`, close: "</code>" }
                            : tag("code");
                    text(token.text, [tag("pre"), code]);
                    text("\n\n");
                    break;
                }
                case "link": {
                    // Avoid unsupported schemes and excessive markup-only message sizes.
                    const href = token.href;
                    if (/^(https?:\/\/|mailto:)/i.test(href) && href.length < 1000) {
                        children([
                            ...tags,
                            { open: `<a href="${escapeHtml(href)}">`, close: "</a>" },
                        ]);
                    } else children();
                    break;
                }
                case "image":
                    text(token.text || token.href, tags);
                    break;
                case "blockquote":
                    children();
                    text("\n");
                    break;
                case "list":
                    token.items.forEach(
                        (
                            item: { tokens: Token[]; task?: boolean; checked?: boolean },
                            i: number,
                        ) => {
                            text(token.ordered ? `${Number(token.start) + i}. ` : "• ");
                            if (item.task) text(item.checked ? "☑ " : "☐ ");
                            walk(item.tokens, tags, depth + 1);
                            text("\n");
                        },
                    );
                    text("\n");
                    break;
                case "table":
                    // Telegram has no HTML tables; render readable rows.
                    for (const row of [token.header, ...token.rows]) {
                        row.forEach((cell: { tokens: Token[] }, i: number) => {
                            if (i) text(" | ");
                            walk(cell.tokens, tags, depth + 1);
                        });
                        text("\n");
                    }
                    text("\n");
                    break;
                case "br":
                    text("\n");
                    break;
                case "hr":
                    text("────────\n");
                    break;
                case "text":
                    if (token.tokens) children();
                    else text(token.text, tags);
                    break;
                case "escape":
                    text(token.text, tags);
                    break;
                case "html":
                    text(token.raw, tags);
                    break;
                case "def":
                    break;
                default:
                    text(token.raw, tags);
            }
        }
    };
    text(literalPrefix);
    walk(Lexer.lex(markdown, { gfm: true }));
    // Trim generated trailing block spacing, without trimming code contents.
    while (spans.length && !spans.at(-1)!.tags.length && /^\s*$/.test(spans.at(-1)!.text))
        spans.pop();
    const chunks: TelegramChunk[] = [];
    let chunk: TelegramChunk = { html: "", text: "" };
    const flush = () => {
        if (chunk.text) chunks.push(chunk);
        chunk = { html: "", text: "" };
    };
    for (const span of spans) {
        const open = span.tags.map((t) => t.open).join("");
        const close = [...span.tags]
            .reverse()
            .map((t) => t.close)
            .join("");
        let buffer = "";
        let plain = "";
        const commit = () => {
            if (plain) {
                chunk.html += open + buffer + close;
                chunk.text += plain;
            }
            buffer = "";
            plain = "";
        };
        for (const character of span.text) {
            const escaped = escapeHtml(character);
            if (
                chunk.html.length + open.length + buffer.length + escaped.length + close.length >
                3900
            ) {
                commit();
                flush();
            }
            buffer += escaped;
            plain += character;
        }
        commit();
    }
    flush();
    return chunks;
}

/** Only parse failures justify retrying as plain text; don't duplicate network failures. */
export function isTelegramFormattingError(error: unknown): boolean {
    const candidate = error as { error_code?: number; description?: string } | null;
    return (
        candidate?.error_code === 400 &&
        /can't parse entities|unsupported start tag|can't find end tag/i.test(
            candidate.description ?? "",
        )
    );
}
