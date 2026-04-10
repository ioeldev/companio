import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
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

export function createCompanioSqliteMcp() {
  const writeEnabled = process.env.COMPANIO_SQL_WRITE === "true";

  return createSdkMcpServer({
    name: "companio_sqlite",
    version: "1.0.0",
    tools: [
      tool(
        "run_sql",
        `Run a single SQL statement against Companio's local SQLite database (${writeEnabled ? "read/write" : "SELECT / WITH / EXPLAIN only"}). One statement per call. Does not affect remote apps.`,
        {
          sql: z.string().describe("One SQL statement"),
        },
        async ({ sql }) => {
          assertSingleStatement(sql);
          const trimmed = sql.trim();
          if (!writeEnabled && !looksLikeReadQuery(trimmed)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Rejected: only SELECT, WITH, or EXPLAIN are allowed. Set COMPANIO_SQL_WRITE=true on the server to allow mutations (trusted deployments only).",
                },
              ],
            };
          }

          try {
            if (looksLikeReadQuery(trimmed)) {
              const rows = db.prepare(trimmed).all() as Record<string, unknown>[];
              const text =
                rows.length === 0
                  ? "(0 rows)"
                  : JSON.stringify(rows, null, 2).slice(0, 50_000);
              return { content: [{ type: "text" as const, text }] };
            }

            const result = db.run(trimmed);
            const text = JSON.stringify(
              { changes: result.changes, lastInsertRowid: result.lastInsertRowid },
              null,
              2
            );
            return { content: [{ type: "text" as const, text }] };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: "text" as const, text: `SQLite error: ${msg}` }],
            };
          }
        }
      ),
    ],
  });
}
