# Migration: Claude Agent SDK → Vercel AI SDK

## Why we migrated

The original implementation used `@anthropic-ai/claude-agent-sdk` (`query()`), which tied Companio to a single provider (Anthropic) and required an API key. The Vercel AI SDK (`ai`) decouples the agent loop from the provider, making it straightforward to swap models, add new providers, and wire up tools in pure TypeScript without relying on a CLI subprocess.

---

## What changed

### 1. Entry point — `companion.ts`

**Before**

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
    prompt: task.message,
    options: {
        systemPrompt,
        tools: getBuiltinTools(),
        allowedTools: [...capabilities.allowedTools, ...getBuiltinAllowedToolNames()],
        mcpServers: capabilities.mcpServers,
        maxTurns: 10,
        settingSources: ["project"],
        ...(sessionId ? { resume: sessionId } : {}),
    },
})) {
    if (message.type === "result" && message.subtype === "success") {
        result = message.result;
    }
}
```

**After**

```ts
import { generateText, stepCountIs } from "ai";

const result = await generateText({
    model: resolveModel(),
    system: systemPrompt,
    messages: contextMessages,   // includes current user message (saved to DB first)
    tools: capabilities.tools,
    stopWhen: stepCountIs(10),
});
resultText = result.text?.trim() ?? "";
```

Key differences:
- No more streaming iterator — `generateText` returns when the agentic loop finishes.
- Session resume via Claude Agent SDK is replaced by loading conversation history from SQLite (`getContextMessages`), which is provider-agnostic.
- `maxTurns: 10` → `stopWhen: stepCountIs(10)`.

---

### 2. Model resolution — `src/agent/model.ts` (new file)

A single `resolveModel()` function reads two env vars and returns a `LanguageModel` instance:

| `LLM_PROVIDER` | Requires | Default model |
|---|---|---|
| `anthropic` (default) | `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` | `claude-sonnet-4-5` |
| `xai` | `XAI_API_KEY` | `grok-3` |
| `claude-code` | Claude Code CLI authenticated (`claude auth login`) | `sonnet` |

Override the model with `LLM_MODEL=<model-id>`.

The `claude-code` provider (`ai-sdk-provider-claude-code`) routes requests through the Claude Code CLI using your Claude Pro/Max subscription — no API key is required.

---

### 3. Tools — `src/agent/capabilities.ts`

**Before** — tools were split between built-in Claude Agent SDK tools (file system, bash, etc.) defined in `builtin-tools.ts`, and MCP server configs passed as `mcpServers` to `query()`.

**After** — all tools use the AI SDK `tool()` helper and are collected into a single `ToolSet`:

- **In-process tools** (scheduler, memory, SQLite) are defined directly with `tool({ inputSchema, execute })`.
- **MCP servers** (Slack, ClickUp, GitHub) are connected via `@ai-sdk/mcp`'s `createMCPClient` + `Experimental_StdioMCPTransport`, and their tools are fetched with `client.tools()` and merged into the same `ToolSet`.
- MCP tool names are namespaced with a prefix (`slack__`, `clickup__`, `github__`) to avoid collisions.
- `builtin-tools.ts` is deleted — the Claude Agent SDK's built-in tools (bash, file ops) are no longer available.

---

### 4. Conversation history — `src/memory/conversations.ts`

The old implementation relied on Claude Agent SDK session persistence (resume by session ID stored in `agent_sessions`). The new implementation is self-contained:

- Every incoming message is saved to `conversations` before the model call.
- `getContextMessages()` loads history from SQLite, applies a ~20k token budget (oldest messages dropped first), and returns `ModelMessage[]` ready for `generateText`.
- The `agent_sessions` table is kept in the schema for backward compatibility but is no longer written to.

---

### 5. Graceful shutdown — `src/index.ts`

MCP clients spawn child processes. `closeMcpClients()` is now wired to `SIGINT`/`SIGTERM` so they are cleaned up on shutdown:

```ts
const shutdown = async () => {
    await closeMcpClients();
    process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

---

## Environment variable changes

| Variable | Before | After |
|---|---|---|
| `ANTHROPIC_API_KEY` | Required | Required only when `LLM_PROVIDER=anthropic` |
| `LLM_PROVIDER` | — | New. `anthropic` \| `xai` \| `claude-code` |
| `LLM_MODEL` | — | New. Overrides the default model for the chosen provider |
| `XAI_API_KEY` | — | Required when `LLM_PROVIDER=xai` |
| `CLAUDE_CODE_OAUTH_TOKEN` | Used (incorrectly) as API key fallback | Picked up automatically by the `claude-code` provider via the CLI |

---

## Deploying on a VPS (migrating from the old setup)

### Option A — Keep using Anthropic API

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

No other changes needed beyond `bun install`.

### Option B — Use Claude Pro/Max subscription (no API key)

1. Install and authenticate the Claude Code CLI on the server:

```bash
curl -fsSL https://claude.ai/install.sh | bash
claude auth login
```

2. Update `.env`:

```env
LLM_PROVIDER=claude-code
LLM_MODEL=sonnet
```

Valid values for `LLM_MODEL` with this provider: `sonnet`, `opus`, `haiku`.

3. Run `bun install` to pull in `ai-sdk-provider-claude-code`.

Alternatively, skip interactive login by exporting `CLAUDE_CODE_OAUTH_TOKEN` (copy it from your local `~/.claude/` config) — the CLI picks it up automatically.

---

## Packages added / removed

| Package | Change |
|---|---|
| `ai` | Added (Vercel AI SDK core) |
| `@ai-sdk/anthropic` | Added |
| `@ai-sdk/xai` | Added |
| `@ai-sdk/mcp` | Added (MCP client for AI SDK) |
| `ai-sdk-provider-claude-code` | Added (Claude Pro/Max provider) |
| `@anthropic-ai/claude-agent-sdk` | **Removed** from active usage (still in lockfile as transitive dep) |
