import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Badge } from "../components/Badge";

interface Event {
  id: number;
  userId: string;
  type: string;
  payload: string | null;
  createdAt: string;
}

type Variant = "default" | "success" | "error" | "info" | "warning";

function eventVariant(type: string): Variant {
  if (type === "error") return "error";
  if (type === "task_fired") return "success";
  if (type === "message") return "info";
  return "default";
}

function prettyPayload(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function Events() {
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState("all");
  const [limit, setLimit] = useState("50");

  const load = () => {
    api.get<Event[]>("/api/events", { limit }).then(setEvents);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [limit]);

  const types = ["all", ...Array.from(new Set(events.map((e) => e.type)))];
  const visible = filter === "all" ? events : events.filter((e) => e.type === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-xl font-bold">Events</h2>
        <div className="flex gap-1.5 flex-wrap">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                filter === t
                  ? "bg-white/20 text-white"
                  : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <select
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          className="ml-auto bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/60 outline-none"
        >
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="250">250</option>
        </select>
      </div>

      <div className="space-y-1.5 max-h-[65vh] overflow-y-auto pr-1">
        {visible.length === 0 ? (
          <p className="text-white/30 text-sm py-8 text-center">No events.</p>
        ) : (
          visible.map((ev) => (
            <div
              key={ev.id}
              className="flex items-start gap-3 bg-white/5 rounded-lg px-4 py-3"
            >
              <Badge variant={eventVariant(ev.type)}>{ev.type}</Badge>
              <div className="flex-1 min-w-0">
                <p className="text-white/50 text-xs font-mono">{ev.userId}</p>
                {ev.payload && (
                  <pre className="text-white/30 text-xs font-mono mt-1 whitespace-pre-wrap break-all line-clamp-4">
                    {prettyPayload(ev.payload)}
                  </pre>
                )}
              </div>
              <time className="text-white/25 text-xs shrink-0">
                {new Date(ev.createdAt).toLocaleString()}
              </time>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
