import { deleteMemory, setMemory } from "../memory/index.ts";

export const COMPANIO_CAVEMAN_MEMORY_KEY = "companio_caveman_level";

const VALID_LEVELS = new Set([
    "lite",
    "full",
    "ultra",
    "wenyan-lite",
    "wenyan-full",
    "wenyan-ultra",
]);

export function parseCavemanLevelFromEnv(): string | null {
    const raw = process.env.COMPANIO_CAVEMAN?.trim().toLowerCase();
    if (!raw || raw === "false" || raw === "0" || raw === "off" || raw === "no") return null;
    if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") return "full";
    if (VALID_LEVELS.has(raw)) return raw;
    return "full";
}

/** Memory row shape from getMemories (subset). */
export function resolveCavemanLevel(memories: { key: string; value: string }[]): string | null {
    const row = memories.find((m) => m.key === COMPANIO_CAVEMAN_MEMORY_KEY);
    if (!row) return parseCavemanLevelFromEnv();
    const v = row.value.trim().toLowerCase();
    if (v === "off" || v === "false" || v === "normal" || v === "none") return null;
    if (VALID_LEVELS.has(v)) return v;
    return parseCavemanLevelFromEnv();
}

export function memoriesWithoutCavemanKey<T extends { key: string }>(memories: T[]): T[] {
    return memories.filter((m) => m.key !== COMPANIO_CAVEMAN_MEMORY_KEY);
}

function ackSet(level: string): string {
    return `Caveman **${level}** saved for your account. Stays until you change it, say stop, or run \`caveman reset\` (then server env default applies).`;
}

function ackOff(): string {
    return "Caveman **off** for your account (overrides env). Say `/caveman` or `caveman full` to turn back on.";
}

function ackReset(): string {
    return "Caveman preference **cleared**. Using server default from `COMPANIO_CAVEMAN` (or off if unset).";
}

/**
 * First-line command handling for Telegram/Discord/etc.
 * Updates `companio_caveman_level` memory; optionally returns early reply or stripped follow-up text.
 */
export function processCavemanUserCommand(
    userId: string,
    message: string
): { earlyReply?: string; textForModel: string } {
    const trimmed = message.trim();
    if (!trimmed) return { textForModel: message };

    const nl = trimmed.indexOf("\n");
    const firstLine = (nl === -1 ? trimmed : trimmed.slice(0, nl)).trim();
    const rest = nl === -1 ? "" : trimmed.slice(nl + 1).trim();

    const tryLevel = (level: string, withRest: boolean): { earlyReply?: string; textForModel: string } => {
        setMemory(userId, COMPANIO_CAVEMAN_MEMORY_KEY, level, "caveman_command");
        if (withRest && rest) return { textForModel: rest };
        return { earlyReply: ackSet(level), textForModel: "" };
    };

    // /caveman | /caveman full | /caveman wenyan-full
    let m = firstLine.match(/^\/caveman(?:\s+(lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra))?\s*$/i);
    if (m) {
        const level = (m[1] ?? "full").toLowerCase();
        return tryLevel(level, true);
    }

    // caveman full (no leading slash)
    m = firstLine.match(
        /^caveman\s+(lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra)\s*$/i
    );
    if (m) return tryLevel(m[1]!.toLowerCase(), true);

    // caveman off | stop caveman | normal mode
    if (/^caveman\s+off\s*$/i.test(firstLine) || /^stop\s+caveman\s*$/i.test(firstLine) || /^normal\s+mode\s*$/i.test(firstLine)) {
        setMemory(userId, COMPANIO_CAVEMAN_MEMORY_KEY, "off", "caveman_command");
        if (rest) return { textForModel: rest };
        return { earlyReply: ackOff(), textForModel: "" };
    }

    // caveman reset | inherit | default
    if (
        /^caveman\s+(reset|inherit|default)\s*$/i.test(firstLine) ||
        /^caveman\s+clear\s*$/i.test(firstLine)
    ) {
        deleteMemory(userId, COMPANIO_CAVEMAN_MEMORY_KEY);
        if (rest) return { textForModel: rest };
        return { earlyReply: ackReset(), textForModel: "" };
    }

    // Phrases → full
    if (
        /^talk\s+like\s+caveman\s*$/i.test(firstLine) ||
        /^caveman\s+mode\s*$/i.test(firstLine) ||
        /^less\s+tokens\s+please\s*$/i.test(firstLine) ||
        /^use\s+caveman\s*$/i.test(firstLine)
    ) {
        return tryLevel("full", true);
    }

    return { textForModel: message };
}

export function buildCavemanBlock(level: string): string {
    const levelHint =
        level === "lite"
            ? "**lite**: No filler/hedging. Keep articles + full sentences. Professional but tight."
            : level === "ultra"
              ? "**ultra**: Abbreviate (DB/auth/config/req/res/fn/impl), strip conjunctions, arrows (X → Y), one word when enough."
              : level === "wenyan-lite"
                ? "**wenyan-lite**: Semi-classical Chinese for prose; code/URLs/identifiers unchanged."
                : level === "wenyan-full"
                  ? "**wenyan-full**: Maximum classical terseness, 文言文; code/URLs/identifiers unchanged."
                  : level === "wenyan-ultra"
                    ? "**wenyan-ultra**: Extreme classical compression; code/URLs/identifiers unchanged."
                    : "**full**: Drop articles, fragments OK, short synonyms. Classic caveman.";

    const examples = `
### Examples (same answer, different intensity)
React re-render why?
- lite: "Your component re-renders because you create a new object reference each render. Wrap it in \`useMemo\`."
- full: "New object ref each render. Inline object prop = new ref = re-render. Wrap in \`useMemo\`."
- ultra: "Inline obj prop → new ref → re-render. \`useMemo\`."

DB connection pooling:
- lite: "Connection pooling reuses open connections instead of creating new ones per request. Avoids repeated handshake overhead."
- full: "Pool reuse open DB connections. No new connection per request. Skip handshake overhead."
- ultra: "Pool = reuse DB conn. Skip handshake → fast under load."
`;

    return `
## Voice (Caveman — ${level})
${levelHint}

Respond terse like smart caveman. All technical substance stay. Only fluff die.

**Persistence:** ACTIVE every response. No filler drift. User can say "stop caveman" / "normal mode" (you should honor — they can also persist off via \`caveman off\`).

### Rules
Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/happy to help), hedging. Fragments OK. Short synonyms. Technical terms exact. Code blocks unchanged. Errors quoted exact.

Pattern: \`[thing] [action] [reason]. [next step].\`

### Auto-clarity
Drop caveman briefly for: security warnings, irreversible confirmations, multi-step lists where fragments confuse. Use clear sentences for that part, then resume caveman.

### Boundaries
Normal prose for code/commits/PR bodies when user asks for a commit message or patch — still terse subject lines if they want. If user says "stop caveman" or "normal mode", answer in normal voice until they turn caveman on again.
${examples}
${level.startsWith("wenyan") ? "\n**Language:** Explanatory prose in literary Chinese; code blocks, paths, identifiers stay as-is (overrides same-language-as-user for prose only).\n" : ""}`;
}
