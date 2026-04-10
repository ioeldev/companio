import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Table, type Column } from "../components/Table";
import { Badge } from "../components/Badge";

interface Task {
  id: number;
  userId: string;
  label: string;
  schedule: string;
  recurring: number;
  mode: string;
  platform: string;
  lastFiredAt: string | null;
  createdAt: string;
  nextFireTime?: string | null;
}

interface LiveJob {
  id: number;
  nextFireTime: string | null;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleString();
}

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = async () => {
    const [dbTasks, liveJobs] = await Promise.all([
      api.get<Task[]>("/api/tasks"),
      api.get<LiveJob[]>("/api/tasks/live"),
    ]);
    const liveMap = new Map(liveJobs.map((j) => [j.id, j.nextFireTime]));
    setTasks(dbTasks.map((t) => ({ ...t, nextFireTime: liveMap.get(t.id) ?? null })));
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: number) => {
    await api.delete("/api/tasks/" + id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const columns: Column<Task>[] = [
    {
      header: "Label",
      render: (t) => <span className="font-medium">{t.label}</span>,
    },
    {
      header: "Schedule",
      render: (t) => (
        <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded font-mono">{t.schedule}</code>
      ),
    },
    {
      header: "Mode",
      render: (t) => <Badge variant="info">{t.mode}</Badge>,
    },
    {
      header: "Recurring",
      render: (t) =>
        t.recurring ? <Badge variant="success">yes</Badge> : <Badge>no</Badge>,
    },
    {
      header: "Platform",
      render: (t) => <span className="text-white/60 text-xs">{t.platform}</span>,
    },
    {
      header: "Last Fired",
      render: (t) => <span className="text-white/50 text-xs">{fmtDate(t.lastFiredAt)}</span>,
    },
    {
      header: "Next Fire",
      render: (t) => <span className="text-white/50 text-xs">{fmtDate(t.nextFireTime)}</span>,
    },
    {
      header: "",
      render: (t) => (
        <button
          onClick={() => handleDelete(t.id)}
          className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-400/10 transition-colors"
        >
          Delete
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Tasks</h2>
        <button
          onClick={load}
          className="text-xs text-white/40 hover:text-white/60 transition-colors px-3 py-1 rounded hover:bg-white/5"
        >
          Refresh
        </button>
      </div>
      <Table columns={columns} rows={tasks} emptyMessage="No active tasks" />
    </div>
  );
}
