import { tool } from "ai";
import { z } from "zod";
import { realpath, readFile, writeFile, readdir, lstat, stat } from "node:fs/promises";
import { resolve, relative, dirname, isAbsolute } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const jobs = new Map<
    string,
    { owner: string; output: string; exitCode: number | null; done: boolean; stop: () => void }
>();
const limit = 24_000;
export async function workspacePath(root: string, path: string, writing = false): Promise<string> {
    const base = await realpath(root);
    const candidate = resolve(base, path);
    const inside = (p: string) => {
        const rel = relative(base, p);
        return rel === "" || (!rel.startsWith(".." + "/") && rel !== ".." && !isAbsolute(rel));
    };
    if (!inside(candidate)) throw new Error("Path must be inside the workspace.");
    let actual: string;
    try {
        actual = await realpath(candidate);
    } catch (error) {
        if (!writing || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const entry = await lstat(candidate).catch(() => null);
        if (entry?.isSymbolicLink()) throw new Error("Cannot write through a dangling symlink.");
        actual = resolve(await realpath(dirname(candidate)), candidate.split("/").at(-1)!);
    }
    if (!inside(actual)) throw new Error("Symlink points outside the workspace.");
    return actual;
}

export function startCommand(
    owner: string,
    cwd: string,
    command: string,
    timeoutSeconds: number,
    signal?: AbortSignal,
) {
    if (signal?.aborted) throw new Error("Execution cancelled");
    if ([...jobs.values()].filter((j) => !j.done).length >= 8)
        throw new Error("Too many running commands. Poll or stop existing jobs.");
    // Keep completed jobs bounded. Handles are deliberately scoped to one session.
    if (jobs.size >= 100)
        for (const [id, job] of jobs) {
            if (job.done) {
                jobs.delete(id);
                break;
            }
        }
    const id = randomUUID();
    const child = spawn("/bin/sh", ["-c", command], {
        cwd,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
            PATH: process.env.PATH,
            HOME: cwd,
            LANG: "C.UTF-8",
            TMPDIR: "/tmp",
            GIT_TERMINAL_PROMPT: "0",
            PYTHONUNBUFFERED: "1",
        },
    });
    const stop = () => {
        try {
            if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {}
    };
    const job = { owner, output: "", exitCode: null as number | null, done: false, stop };
    jobs.set(id, job);
    const append = (chunk: Buffer) => {
        job.output = (job.output + chunk.toString()).slice(-limit);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(stop, timeoutSeconds * 1000);
    signal?.addEventListener("abort", stop, { once: true });
    child.on("error", (err) => {
        job.output += `\n${err.message}`;
    });
    child.on("close", (code) => {
        job.exitCode = code;
        job.done = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
    });
    return {
        jobId: id,
        status: "running",
        note: "Use command_status to read output and exit status. Output retains the last 24000 characters.",
    };
}
export function commandStatus(owner: string, id: string, stop = false) {
    const job = jobs.get(id);
    if (!job || job.owner !== owner)
        throw new Error(
            "Command unavailable in this session (or server restarted). Inspect workspace results before rerunning.",
        );
    if (stop && !job.done) job.stop();
    return {
        jobId: id,
        status: job.done ? "completed" : "running",
        exitCode: job.exitCode,
        output: job.output,
    };
}
export function stopWorkspaceCommands(owner?: string) {
    for (const job of jobs.values()) if (!job.done && (!owner || job.owner === owner)) job.stop();
}

export function buildWorkspaceTools(options: {
    root: string;
    sessionId: string;
    cwd?: string;
    setCwd: (cwd: string) => Promise<void>;
}) {
    let cwd = options.cwd || ".";
    const directory = () => workspacePath(options.root, cwd);
    const at = async (path: string, writing = false) =>
        workspacePath(options.root, resolve(await directory(), path), writing);
    return {
        workspace_directory: tool({
            description:
                "Get or change this session working directory inside the mounted workspace. Host ~/seed is mounted as /workspace. Paths are container paths, not host paths.",
            inputSchema: z.object({ path: z.string().optional() }),
            execute: async ({ path }) => {
                if (path !== undefined) {
                    const next = await at(path);
                    if (!(await stat(next)).isDirectory()) throw new Error("Not a directory");
                    await options.setCwd(next);
                    cwd = next;
                }
                return { root: options.root, cwd: await directory() };
            },
        }),
        list_files: tool({
            description:
                "List a workspace directory. Use execute_shell with rg --files or rg for recursive file/text searches.",
            inputSchema: z.object({ path: z.string().default(".") }),
            execute: async ({ path }) =>
                (await readdir(await at(path), { withFileTypes: true }))
                    .slice(0, 500)
                    .map((e) => ({
                        name: e.name,
                        directory: e.isDirectory(),
                        symlink: e.isSymbolicLink(),
                    })),
        }),
        read_file: tool({
            description: "Read a UTF-8 workspace file, with line pagination.",
            inputSchema: z.object({
                path: z.string(),
                startLine: z.number().int().min(1).default(1),
                lines: z.number().int().min(1).max(500).default(200),
            }),
            execute: async ({ path, startLine, lines }) => {
                const file = await at(path);
                if ((await stat(file)).size > 2_000_000)
                    throw new Error("File too large; use a bounded shell command.");
                const all = (await readFile(file, "utf8")).split("\n");
                return {
                    totalLines: all.length,
                    content: all
                        .slice(startLine - 1, startLine - 1 + lines)
                        .map((line, i) => `${startLine + i}: ${line}`)
                        .join("\n")
                        .slice(0, limit),
                };
            },
        }),
        write_file: tool({
            description:
                "Create or replace a UTF-8 file. For existing files provide the exact expected previous content to prevent overwriting concurrent edits. Parent directory must exist.",
            inputSchema: z.object({
                path: z.string(),
                content: z.string().max(200_000),
                expectedContent: z.string().optional(),
            }),
            execute: async ({ path, content, expectedContent }) => {
                const file = await at(path, true);
                if (expectedContent === undefined) await writeFile(file, content, { flag: "wx" });
                else {
                    if ((await readFile(file, "utf8")) !== expectedContent)
                        throw new Error("File changed; read it again before editing.");
                    await writeFile(file, content);
                }
                return { written: file };
            },
        }),
        edit_file: tool({
            description:
                "Replace one exact, unique text occurrence in a workspace file. Read the file first.",
            inputSchema: z.object({
                path: z.string(),
                oldText: z.string().min(1),
                newText: z.string(),
            }),
            execute: async ({ path, oldText, newText }) => {
                const file = await at(path);
                const content = await readFile(file, "utf8");
                if (content.split(oldText).length !== 2)
                    throw new Error(
                        "Expected exactly one match; read the file and choose unique text.",
                    );
                await writeFile(
                    file,
                    content.replace(oldText, () => newText),
                );
                return { edited: file };
            },
        }),
        execute_shell: tool({
            description:
                "Run a shell command in this session directory: git, rg, builds, tests, mkdir, or python3 (including heredoc scripts). Returns a job ID immediately. Poll command_status and verify exit code. Commands execute inside the container, with access to mounted files; this is not host SSH.",
            inputSchema: z.object({
                command: z.string().min(1).max(50_000),
                timeoutSeconds: z.number().int().min(1).max(1800).default(300),
            }),
            execute: async ({ command, timeoutSeconds }, { abortSignal }) =>
                startCommand(
                    options.sessionId,
                    await directory(),
                    command,
                    timeoutSeconds,
                    abortSignal,
                ),
        }),
        command_status: tool({
            description:
                "Read a session command output/status, optionally stopping it. Poll running jobs before concluding the task.",
            inputSchema: z.object({ jobId: z.string(), stop: z.boolean().default(false) }),
            execute: async ({ jobId, stop }) => {
                await new Promise((r) => setTimeout(r, 500));
                return commandStatus(options.sessionId, jobId, stop);
            },
        }),
    };
}
