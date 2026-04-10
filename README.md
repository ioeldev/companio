# Companio

Personal AI assistant that runs on **Bun**, answers on **Telegram** (and optional **Slack** via MCP), and uses **Anthropic’s Claude Agent SDK** with in-process tools for memory, scheduling, and optional database access.

## Features

- **Telegram bot** — text messages routed through `runCompanion`, replies in-thread.
- **Long-term memory** — key/value facts in SQLite (`memories`), exposed as MCP tools (`set_memory`, `delete_memory`).
- **Scheduler** — persisted tasks with cron or one-shot ISO datetimes; `message` (send text) or `agent` (full model pass) modes; delivered via your existing `respond` router.
- **Conversation context** — recent turns loaded from SQLite into the system prompt; `clear_conversation_history` can wipe the stored transcript for a user/thread (not the Telegram UI).
- **Optional integrations** — Slack, ClickUp, and GitHub MCP servers when env credentials are set; capabilities are summarized in the system prompt so the model does not claim tools you did not configure.
- **Optional power tools** — `COMPANIO_BUILTIN_TOOLS` for Claude Code built-ins (Read/Glob/Grep or full preset); `COMPANIO_SQL_TOOL` for ad hoc SQL against `companio.db` (read-only by default).

## Requirements

- [Bun](https://bun.sh) (project uses Bun for runtime and SQLite via `bun:sqlite`)
- An [Anthropic API key](https://console.anthropic.com/) (`ANTHROPIC_API_KEY`)
- A Telegram bot token from [@BotFather](https://t.me/BotFather) if you use Telegram

## Quick start

```bash
bun install
cp .env.example .env
# Edit .env — at minimum set ANTHROPIC_API_KEY and TELEGRAM_BOT_TOKEN
bun run start
```

For development with auto-restart:

```bash
bun run dev
```

On first run, the app migrates SQLite and creates `companio.db` at the project root.

## Scripts

| Command | Description |
|--------|-------------|
| `bun run start` | Run the bot once |
| `bun run dev` | Watch mode (`bun --watch src/index.ts`) |
| `bun run db:reset` | Remove `companio.db` and start fresh |

## Environment

Copy `.env.example` to `.env`. Bun loads `.env` automatically.

**Core**

- `ANTHROPIC_API_KEY` — required for the agent.

**Telegram**

- `TELEGRAM_BOT_TOKEN` — bot token.
- `TELEGRAM_OWNER_ID` — optional; used where a single “owner” channel id is needed for system tasks.

**Optional agent hardening / power**

- `COMPANIO_BUILTIN_TOOLS` — `none` (default), `read`, or `full` (full Claude Code preset). See comments in `.env.example`.
- `COMPANIO_BYPASS_PERMISSIONS` — only for trusted, private deployments; skips permission prompts for built-ins.
- `COMPANIO_SQL_TOOL` / `COMPANIO_SQL_WRITE` — optional raw SQL MCP against the local DB; writes off unless `COMPANIO_SQL_WRITE=true`.

**Slack / ClickUp / GitHub**

- Set `SLACK_BOT_TOKEN` (and related) or `CLICKUP_API_KEY` (and space/member ids) to enable those MCP servers.
- Set `GITHUB_TOKEN` (personal access token) to enable the GitHub MCP server (`@modelcontextprotocol/server-github`). The server expects `GITHUB_PERSONAL_ACCESS_TOKEN`; Companio forwards your `GITHUB_TOKEN` value.

## Architecture (high level)

```
src/index.ts          → migrate DB, start scheduler, crons, Telegram
src/agent/companion.ts → builds prompt, calls Claude Agent SDK `query()`
src/agent/capabilities.ts → MCP servers (memory, scheduler) + env-gated externals + optional SQLite MCP
src/agent/builtin-tools.ts → optional Read/Glob/Grep or full preset
src/triggers/telegram.ts → Grammy bot → AgentTask → runCompanion
src/scheduler/ → SQLite `scheduled_tasks`, croner jobs, fire → respond / runCompanion
src/triggers/cron.ts  → daily conversation prune (30d), not user schedules
src/memory/           → memories + conversation persistence
```

The SQLite file path is resolved in `src/db/schema.ts` (project root `companio.db`).

## Security notes

- Treat the bot like **remote access** to whatever the agent can do: enabling `full` built-ins, `COMPANIO_BYPASS_PERMISSIONS`, or `COMPANIO_SQL_WRITE` is unsafe if untrusted users can message the bot.
- The Claude Agent SDK may **persist sessions** under `~/.claude/projects/` by default. Clearing rows in `conversations` does not necessarily clear that session transcript; for a true “forget this chat” semantics you may need ephemeral or per-thread session configuration (see SDK `persistSession` / session options).

## License

Private project; see repository for license if applicable.
