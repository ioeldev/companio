import type { Options } from "@anthropic-ai/claude-agent-sdk";

/**
 * COMPANIO_BUILTIN_TOOLS:
 * - none — no Claude Code built-ins (default)
 * - read — Read, Glob, Grep on the process cwd / allowed dirs
 * - full — full Claude Code tool preset (Bash, Edit, …) — only for trusted, private use
 *
 * For headless runs (e.g. Telegram), `full` usually needs COMPANIO_BYPASS_PERMISSIONS=true
 * or tools will block waiting for interactive approval.
 */
export function getBuiltinTools(): NonNullable<Options["tools"]> {
  const level = (process.env.COMPANIO_BUILTIN_TOOLS ?? "none").toLowerCase();
  if (level === "full" || level === "claude_code") {
    return { type: "preset", preset: "claude_code" };
  }
  if (level === "read") {
    return ["Read", "Glob", "Grep"];
  }
  return [];
}

/** Built-in tool names to pre-approve (skips permission prompts when supported). */
export function getBuiltinAllowedToolNames(): string[] {
  const level = (process.env.COMPANIO_BUILTIN_TOOLS ?? "none").toLowerCase();
  if (level === "read") {
    return ["Read", "Glob", "Grep"];
  }
  if (level === "full" || level === "claude_code") {
    // Without bypassPermissions, headless runs may still stall on other tools.
    return [
      "Read",
      "Glob",
      "Grep",
      "Bash",
      "Edit",
      "Write",
      "NotebookEdit",
      "TodoWrite",
      "WebFetch",
      "WebSearch",
    ];
  }
  return [];
}

/** Optional: allow all tool operations without prompts — major security risk if untrusted users can message the bot. */
export function getBuiltinPermissionOptions(): Pick<
  Options,
  "permissionMode" | "allowDangerouslySkipPermissions"
> {
  if (process.env.COMPANIO_BYPASS_PERMISSIONS === "true") {
    return {
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    };
  }
  return {};
}
