import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspacePath, startCommand, commandStatus, stopWorkspaceCommands } from "./workspace.ts";

test("workspace paths reject traversal, escaped symlinks, and dangling symlink writes", async () => {
    const base = await mkdtemp(join(tmpdir(), "companio-tools-"));
    try {
        const root = join(base, "workspace");
        await mkdir(root);
        await writeFile(join(base, "outside"), "private");
        await symlink(join(base, "outside"), join(root, "escape"));
        await symlink(join(base, "missing"), join(root, "dangling"));
        await expect(workspacePath(root, "../outside")).rejects.toThrow();
        await expect(workspacePath(root, "escape")).rejects.toThrow();
        await expect(workspacePath(root, "dangling", true)).rejects.toThrow();
        expect(await workspacePath(root, "new.txt", true)).toBe(
            join(await workspacePath(root, "."), "new.txt"),
        );
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});
test("shell executes Python and captures exit status; other sessions cannot poll it", async () => {
    const root = await mkdtemp(join(tmpdir(), "companio-python-"));
    try {
        const { jobId } = startCommand("session-a", root, "python3 -c 'print(6 * 7)'", 5);
        expect(() => commandStatus("session-b", jobId)).toThrow();
        let result = commandStatus("session-a", jobId);
        for (let i = 0; i < 100 && result.status === "running"; i++) {
            await new Promise((r) => setTimeout(r, 50));
            result = commandStatus("session-a", jobId);
        }
        expect(result.status).toBe("completed");
        expect(result.exitCode).toBe(0);
        expect(result.output.trim()).toBe("42");
    } finally {
        stopWorkspaceCommands("session-a");
        await rm(root, { recursive: true, force: true });
    }
});
test("timeout stops a long-running process", async () => {
    const { jobId } = startCommand("timeout", tmpdir(), "sleep 30", 1);
    await new Promise((r) => setTimeout(r, 1500));
    expect(commandStatus("timeout", jobId).status).toBe("completed");
    expect(commandStatus("timeout", jobId).exitCode).not.toBe(0);
});
