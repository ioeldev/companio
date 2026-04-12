import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { PageHeader } from "../components/PageHeader";
import { eventVariant } from "../lib/utils";

interface Status {
    uptime: number;
    activeTasksCount: number;
    dbSize: number;
    platforms: number;
}

interface Event {
    id: number;
    userId: string;
    type: string;
    payload: string | null;
    createdAt: string;
}

function formatUptime(s: number): string {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
}

function formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export function Overview() {
    const [status, setStatus] = useState<Status | null>(null);
    const [events, setEvents] = useState<Event[]>([]);

    const loadStatus = () => api.get<Status>("/api/status").then(setStatus);

    useEffect(() => {
        loadStatus();
        api.get<Event[]>("/api/events", { limit: "10" }).then(setEvents);
        const interval = setInterval(loadStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div>
            <PageHeader title="Overview" />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card title="Uptime">
                    <p className="text-2xl font-bold tabular-nums">{status ? formatUptime(status.uptime) : "—"}</p>
                </Card>
                <Card title="Active Tasks">
                    <p className="text-2xl font-bold tabular-nums">{status?.activeTasksCount ?? "—"}</p>
                </Card>
                <Card title="DB Size">
                    <p className="text-2xl font-bold tabular-nums">{status ? formatBytes(status.dbSize) : "—"}</p>
                </Card>
                <Card title="Platforms">
                    <p className="text-2xl font-bold tabular-nums">{status?.platforms ?? "—"}</p>
                </Card>
            </div>

            <div>
                <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Recent Events</h3>
                {events.length === 0 ? (
                    <p className="text-white/30 text-sm">No events yet.</p>
                ) : (
                    <div className="space-y-2">
                        {events.map((ev) => (
                            <div key={ev.id} className="flex items-start gap-3 bg-white/5 rounded-lg px-4 py-3">
                                <Badge variant={eventVariant(ev.type)}>{ev.type}</Badge>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white/50 text-xs font-mono truncate">{ev.userId}</p>
                                    {ev.payload && (
                                        <p className="text-white/30 text-xs font-mono mt-0.5 truncate">{ev.payload}</p>
                                    )}
                                </div>
                                <time className="text-white/30 text-xs shrink-0">
                                    {new Date(ev.createdAt).toLocaleTimeString()}
                                </time>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
