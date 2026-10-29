# bun-react-tailwind-template

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

## MongoDB Atlas

Set `MONGODB_URI` in `.env` to your Atlas connection string. `MONGODB_DB` is optional and defaults to `companio`. Atlas network access must allow the machine running Companio.

## Deployment

Pushing `main` typechecks the project, builds an image, and publishes it to GitHub Container Registry (GHCR). It then deploys that image to the VPS using `docker-compose.prod.yml`.

Configure these GitHub Actions secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, and `GHCR_TOKEN` (a GitHub token with `read:packages`). Optionally set the `VPS_PORT` repository variable; it defaults to `9143`.

Create `~/apps/companio/.env` on the VPS with the runtime secrets from `.env.example` before the first deployment. Docker and the Compose plugin must be installed there. The published GHCR package must be public, or `GHCR_TOKEN` must be authorized to read it.

For routine VPS diagnostics, run `cd ~/apps/companio && docker compose -f docker-compose.prod.yml logs -f companio`. Deployments still use an immutable image tag, while manual Compose commands default to the `latest` image.

To run for production:

```bash
bun start
```

This project was created using `bun init` in bun v1.2.20. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Telegram sessions

Telegram registers a native command menu when the bot starts. `/new title` creates
and selects a general-purpose session; `/sessions` shows a button-based picker;
`/switch 2` selects a stable session number. `/status`, `/rename title`, `/pause`,
`/resume`, `/archive`, and `/help` manage the selected session. Session ownership
and selection are scoped to the Telegram user and chat. Existing conversation
records remain intact; new Telegram sessions start with fresh context.

Messages go to the selected session. Replies to session output go to its original
session even after switching. Required clarification is represented by an
`ask_user` tool call; users can answer with text or suggested-answer buttons.
Switching does not pause work. Up to three sessions execute concurrently, with
one model step per durable MongoDB checkpoint. Tool calls and results are retained.
Completed tool steps are not re-executed when queued work resumes.

The worker uses AI SDK's `ToolLoopAgent` with the existing provider configuration.
It adds no credentials or model-provider changes. Telegram sessions use the
existing configured MCP tools; this change does not add filesystem/shell or web
research tools. Repository paths in conversation do not by themselves enable
local code execution. Discord and scheduled-agent calls retain their existing flow.

### Recovery and limits

Run one Companio process against this database. The current worker is intended for
the existing single-instance server, not multiple replicas. Queued tasks and
pending questions survive restarts. Runs interrupted during a model/tool step are
paused: external writes can have succeeded even when their result wasn't saved.
Check those changes before `/resume`; uncertain tool calls are never automatically
replayed. Cancellation cannot undo already-completed external actions.

Notifications are persisted with session state and retried independently. Telegram
send acknowledgements cannot be committed atomically with MongoDB, so a crash
between sending and recording delivery can produce a duplicate notification.
Recent input IDs and conditional state updates prevent ordinary duplicate answers
and concurrent updates from advancing the same session twice.

A run pauses after 100 steps or approximately 240,000 serialized context
characters. Step-budget pauses can be resumed. Context-budget pauses require a new
session with a summary; automatic compaction is not implemented yet. While a
session is running, new requests are rejected with guidance to pause or switch;
mid-step steering and queued follow-up messages are not implemented yet.

Verify locally without model API requests:

```sh
bun test src/sessions/sessions.test.ts
bunx tsc --noEmit
```

## Server workspace and Python

Production Compose mounts `${HOME}/seed` on the server read/write at `/workspace`
in the container. Before deploying, create it under the same server user that
runs Compose:

```sh
mkdir -p ~/seed
```

`COMPANIO_WORKSPACE_HOST_PATH` optionally overrides the host path. Compose sets
`COMPANIO_WORKSPACE_ROOT=/workspace`; no change to `.env` is needed for the default.
The directory must already exist (Compose will not silently create a missing
source). Rebuild the image and recreate the container to install Python and apply
the mount. This mount does not expose `~/apps/companio`; place/clone projects under
`~/seed` to make them available. The model must use `/workspace/...` container paths.

Workspace tools are enabled only for Telegram sessions belonging to
`TELEGRAM_OWNER_ID`. They support directory listing, paginated reads, exact text
edits, file creation/replacement, and shell execution. Run Python with `python3`
through `execute_shell`, including heredoc scripts. Python venv support, Git,
ripgrep, and patch are installed in the image. Additional project runtimes and
private-repository authentication require separate setup.

Each session can select its own working directory using `workspace_directory`;
the choice persists. Shell commands return a job ID immediately; `command_status`
reads output and exit status or stops a job. Commands default to a five-minute
limit (up to 30 minutes), keep the last 24,000 output characters, and are stopped
when their session is paused or the service shuts down. Handles are process-local
and disappear on restart; inspect results before rerunning an unknown command.

File tools validate paths and symlinks against the workspace root. **Shell/Python
are trusted-owner code execution inside the bot container, not a filesystem
sandbox.** They can access other container files and the network. Child processes
receive a reduced environment, but this does not isolate them from credentials
accessible elsewhere in the container. The Docker socket is not mounted. Use
separate checkouts/worktrees when sessions modify the same repository.

The earlier session-only limitation concerning absent filesystem tools is
superseded by this workspace configuration. Other platforms retain their current
tool sets; web research tools are still a separate integration.
