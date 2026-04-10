import { join } from "node:path";
import { db } from "../db/schema.ts";
import { getActiveJobs, unregisterTask } from "../scheduler/engine.ts";
import { deleteTask } from "../scheduler/index.ts";
// @ts-ignore — Bun HTML import
import dashboard from "./index.html";

const startedAt = Date.now();
const dbPath = join(import.meta.dir, "../../companio.db");

export function startDashboard(): void {
  if (process.env.DASHBOARD_ENABLED !== "true") return;

  const port = parseInt(process.env.DASHBOARD_PORT ?? "7777", 10);

  Bun.serve({
    port,
    routes: {
      "/": dashboard,

      "/api/status": {
        GET: () => {
          const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
          const activeTasksCount = (
            db
              .query<{ count: number }, []>(
                "SELECT COUNT(*) as count FROM scheduled_tasks WHERE active = 1"
              )
              .get()!
          ).count;
          const platforms = (
            db
              .query<{ count: number }, []>(
                "SELECT COUNT(DISTINCT platform) as count FROM conversations"
              )
              .get()!
          ).count;
          let dbSize = 0;
          try {
            dbSize = Bun.file(dbPath).size;
          } catch {}
          return Response.json({ uptime: uptimeSeconds, activeTasksCount, dbSize, platforms });
        },
      },

      "/api/memories": {
        GET: (req) => {
          const userId = new URL(req.url).searchParams.get("userId");
          const rows = db
            .query(
              "SELECT * FROM memories WHERE (? IS NULL OR userId = ?) ORDER BY updatedAt DESC"
            )
            .all(userId, userId);
          return Response.json(rows);
        },
        PUT: async (req) => {
          const { userId, key, value } = (await req.json()) as {
            userId: string;
            key: string;
            value: string;
          };
          db.run(
            `INSERT INTO memories (userId, key, value) VALUES (?, ?, ?)
             ON CONFLICT(userId, key) DO UPDATE SET value = excluded.value, updatedAt = datetime('now')`,
            [userId, key, value]
          );
          return Response.json({ ok: true });
        },
        DELETE: async (req) => {
          const { userId, key } = (await req.json()) as { userId: string; key: string };
          db.run("DELETE FROM memories WHERE userId = ? AND key = ?", [userId, key]);
          return Response.json({ ok: true });
        },
      },

      "/api/tasks": {
        GET: () => {
          const rows = db
            .query("SELECT * FROM scheduled_tasks WHERE active = 1 ORDER BY createdAt ASC")
            .all();
          return Response.json(rows);
        },
      },

      "/api/tasks/live": {
        GET: () => {
          const jobs = getActiveJobs().map((j) => ({
            id: j.id,
            nextFireTime: j.nextFireTime?.toISOString() ?? null,
          }));
          return Response.json(jobs);
        },
      },

      "/api/tasks/:id": {
        DELETE: (req) => {
          const id = parseInt(req.params.id, 10);
          if (isNaN(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
          unregisterTask(id);
          deleteTask(id);
          return Response.json({ ok: true });
        },
      },

      "/api/events": {
        GET: (req) => {
          const limit = parseInt(
            new URL(req.url).searchParams.get("limit") ?? "50",
            10
          );
          const rows = db
            .query("SELECT * FROM events ORDER BY createdAt DESC LIMIT ?")
            .all(limit);
          return Response.json(rows);
        },
      },

      "/api/conversations": {
        GET: (req) => {
          const params = new URL(req.url).searchParams;
          const userId = params.get("userId");
          const platform = params.get("platform");
          const threadId = params.get("threadId");
          const rows = db
            .query(
              `SELECT * FROM conversations
               WHERE (? IS NULL OR userId = ?)
                 AND (? IS NULL OR platform = ?)
                 AND (? IS NULL OR threadId = ?)
               ORDER BY createdAt ASC
               LIMIT 200`
            )
            .all(userId, userId, platform, platform, threadId, threadId);
          return Response.json(rows);
        },
      },
    },

    development: process.env.NODE_ENV !== "production" && {
      hmr: true,
      console: true,
    },
  });

  console.log(`🌐 Dashboard at http://localhost:${port}`);
}
