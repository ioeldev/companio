import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { db } from "../db/schema.ts";

function assertSingleStatement(sql: string): void {
    const trimmed = sql.trim();
    const withoutTrailingSemis = trimmed.replace(/;+\s*$/u, "");
    if (withoutTrailingSemis.includes(";")) {
        throw new Error("Only one SQL statement per call (no extra semicolons).");
    }
}

function looksLikeReadQuery(sql: string): boolean {
    const head = sql.trim().replace(/^(\s+)/u, "");
    return /^(SELECT|WITH|EXPLAIN)\b/i.test(head);
}

/** In-process SQLite tool(s) for the AI SDK (replaces createSdkMcpServer). */
export function getCompanioSqliteTools(): ToolSet {
    const writeEnabled = process.env.COMPANIO_SQL_WRITE === "true";

    return {
        run_sql: tool({
            description: `Run a single SQL statement against Companio's local SQLite database (${writeEnabled ? "read/write" : "SELECT / WITH / EXPLAIN only"}). One statement per call. Does not affect remote apps.`,
            inputSchema: z.object({
                sql: z.string().describe("One SQL statement"),
            }),
            execute: async ({ sql }) => {
                assertSingleStatement(sql);
                const trimmed = sql.trim();
                if (!writeEnabled && !looksLikeReadQuery(trimmed)) {
                    return "Rejected: only SELECT, WITH, or EXPLAIN are allowed. Set COMPANIO_SQL_WRITE=true on the server to allow mutations (trusted deployments only).";
                }

                try {
                    if (looksLikeReadQuery(trimmed)) {
                        const rows = db.prepare(trimmed).all() as Record<string, unknown>[];
                        if (rows.length === 0) return "(0 rows)";
                        return JSON.stringify(rows, null, 2).slice(0, 50_000);
                    }

                    const result = db.run(trimmed);
                    return JSON.stringify(
                        { changes: result.changes, lastInsertRowid: result.lastInsertRowid },
                        null,
                        2
                    );
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    return `SQLite error: ${msg}`;
                }
            },
        }),
    };
}
