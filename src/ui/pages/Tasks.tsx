import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Table, type Column } from "../components/Table";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";

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
        <Button variant="danger" size="sm" onClick={() => handleDelete(t.id)}>
          Delete
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Tasks" className="justify-between">
        <Button variant="ghost" size="sm" onClick={load}>
          Refresh
        </Button>
      </PageHeader>
      <Table columns={columns} rows={tasks} emptyMessage="No active tasks" />
    </div>
  );
}
