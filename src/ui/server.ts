import { collections } from "../db/schema.ts";
import { getActiveJobs, unregisterTask } from "../scheduler/engine.ts";
import { deleteTask } from "../scheduler/index.ts";
// @ts-ignore — Bun HTML import
import dashboard from "./index.html";

const startedAt = Date.now();
const serialize = <T extends { _id: { toHexString(): string } }>(row: T) => ({
    ...row,
    id: row._id.toHexString(),
    _id: undefined,
});

export function startDashboard(): void {
    if (process.env.DASHBOARD_ENABLED !== "true") return;
    const port = parseInt(process.env.DASHBOARD_PORT ?? "7777", 10);

    Bun.serve({
        port,
        routes: {
            "/": dashboard,
            "/api/status": {
                GET: async () =>
                    Response.json({
                        uptime: Math.floor((Date.now() - startedAt) / 1000),
                        activeTasksCount: await collections
                            .scheduledTasks()
                            .countDocuments({ active: true }),
                        database: "MongoDB Atlas",
                        platforms: (await collections.conversations().distinct("platform")).length,
                    }),
            },
            "/api/memories": {
                GET: async (req) => {
                    const userId = new URL(req.url).searchParams.get("userId");
                    const rows = await collections
                        .memories()
                        .find(userId ? { userId } : {})
                        .sort({ updatedAt: -1 })
                        .toArray();
                    return Response.json(rows.map(serialize));
                },
                PUT: async (req) => {
                    const { userId, key, value } = (await req.json()) as {
                        userId: string;
                        key: string;
                        value: string;
                    };
                    await collections.memories().updateOne(
                        { userId, key },
                        {
                            $set: { value, updatedAt: new Date() },
                            $setOnInsert: { userId, key, source: "dashboard", confidence: 1 },
                        },
                        { upsert: true },
                    );
                    return Response.json({ ok: true });
                },
                DELETE: async (req) => {
                    const { userId, key } = (await req.json()) as { userId: string; key: string };
                    await collections.memories().deleteOne({ userId, key });
                    return Response.json({ ok: true });
                },
            },
            "/api/tasks": {
                GET: async () =>
                    Response.json(
                        (
                            await collections
                                .scheduledTasks()
                                .find({ active: true })
                                .sort({ createdAt: 1 })
                                .toArray()
                        ).map(serialize),
                    ),
            },
            "/api/tasks/live": {
                GET: () =>
                    Response.json(
                        getActiveJobs().map((j) => ({
                            id: j.id,
                            nextFireTime: j.nextFireTime?.toISOString() ?? null,
                        })),
                    ),
            },
            "/api/tasks/:id": {
                DELETE: async (req) => {
                    const id = req.params.id;
                    unregisterTask(id);
                    await deleteTask(id);
                    return Response.json({ ok: true });
                },
            },
            "/api/events": {
                GET: async (req) => {
                    const limit = Math.min(
                        parseInt(new URL(req.url).searchParams.get("limit") ?? "50", 10) || 50,
                        250,
                    );
                    return Response.json(
                        (
                            await collections
                                .events()
                                .find()
                                .sort({ createdAt: -1 })
                                .limit(limit)
                                .toArray()
                        ).map(serialize),
                    );
                },
            },
            "/api/conversations": {
                GET: async (req) => {
                    const p = new URL(req.url).searchParams;
                    const filter: Record<string, string | null> = {};
                    for (const key of ["userId", "platform", "threadId"] as const) {
                        const value = p.get(key);
                        if (value !== null) filter[key] = value;
                    }
                    return Response.json(
                        (
                            await collections
                                .conversations()
                                .find(filter)
                                .sort({ createdAt: 1 })
                                .limit(200)
                                .toArray()
                        ).map(serialize),
                    );
                },
            },
        },
        development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
    });
    console.log(`🌐 Dashboard at http://localhost:${port}`);
}
