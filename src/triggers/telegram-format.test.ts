import { expect, test } from "bun:test";
import { formatTelegram, isTelegramFormattingError } from "./telegram-format.ts";

test("renders screenshot-style Markdown and escapes shell syntax", () => {
    const result = formatTelegram(
        "**Inside Docker:** `/workspace`\n\n```yaml\nsource: ${ROOT:-/home/seed}\ntarget: /workspace\n```\n\n*Note* & <literal>",
        "#2 · **literal title**\n\n",
    );
    const html = result.map((c) => c.html).join("");
    expect(html).toContain("#2 · **literal title**");
    expect(html).toContain("<b>Inside Docker:</b>");
    expect(html).toContain("<code>/workspace</code>");
    expect(html).toContain('<pre><code class="language-yaml">source: ${ROOT:-/home/seed}');
    expect(html).toContain("<i>Note</i>");
    expect(html).toContain("&amp; &lt;literal&gt;");
    expect(html).not.toContain("```");
});
test("preserves nested emphasis, safe links, lists and literal HTML", () => {
    const html = formatTelegram(
        "**bold *italic***\n\n- [Docs](https://example.com/?a=1&b=2)\n- <b>untrusted</b>\n- [bad](javascript:alert)",
    )[0]!.html;
    expect(html).toContain("<b><i>italic</i></b>");
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(html).toContain("&lt;b&gt;untrusted&lt;/b&gt;");
    expect(html).not.toContain('href="javascript:');
});
test("long code splits into bounded balanced HTML without splitting emoji or entities", () => {
    const code = "🙂 <&> **literal**\n".repeat(1200);
    const chunks = formatTelegram("```python\n" + code + "```");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.text).join("")).toBe(code.trimEnd());
    for (const chunk of chunks) {
        expect(chunk.html.length).toBeLessThanOrEqual(3900);
        expect(chunk.html.startsWith('<pre><code class="language-python">')).toBe(true);
        expect(chunk.html.endsWith("</code></pre>")).toBe(true);
        expect(chunk.text).not.toMatch(/[\uD800-\uDBFF]$/);
    }
});
test("unclosed code fences still produce closed HTML", () => {
    expect(formatTelegram('```\nprint("hello")')[0]!.html).toBe(
        "<pre><code>print(&quot;hello&quot;)</code></pre>",
    );
});
test("fallback is limited to explicit Telegram formatting rejection", () => {
    expect(
        isTelegramFormattingError({
            error_code: 400,
            description: "Bad Request: can't parse entities",
        }),
    ).toBe(true);
    expect(isTelegramFormattingError({ error_code: 429, description: "Too many requests" })).toBe(
        false,
    );
    expect(isTelegramFormattingError(new Error("Network failed"))).toBe(false);
});
