import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { PageHeader } from "../components/PageHeader";

interface Memory {
  id: number;
  userId: string;
  key: string;
  value: string;
  source: string | null;
  confidence: number;
  updatedAt: string;
}

export function Memories() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [filterUserId, setFilterUserId] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const load = () => {
    api
      .get<Memory[]>("/api/memories", filterUserId ? { userId: filterUserId } : {})
      .then(setMemories);
  };

  useEffect(() => {
    load();
  }, [filterUserId]);

  const startEdit = (m: Memory) => {
    setEditingId(m.id);
    setEditValue(m.value);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (m: Memory) => {
    await api.put("/api/memories", { userId: m.userId, key: m.key, value: editValue });
    setEditingId(null);
    load();
  };

  const handleDelete = async (m: Memory) => {
    await api.delete("/api/memories", { userId: m.userId, key: m.key });
    setMemories((prev) => prev.filter((x) => x.id !== m.id));
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Memories">
        <Input
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value)}
          placeholder="Filter by user ID…"
          className="max-w-xs"
        />
      </PageHeader>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 px-3 text-white/40 font-semibold text-xs uppercase tracking-wider">
                User
              </th>
              <th className="text-left py-2 px-3 text-white/40 font-semibold text-xs uppercase tracking-wider">
                Key
              </th>
              <th className="text-left py-2 px-3 text-white/40 font-semibold text-xs uppercase tracking-wider">
                Value
              </th>
              <th className="text-left py-2 px-3 text-white/40 font-semibold text-xs uppercase tracking-wider">
                Updated
              </th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {memories.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-white/30">
                  No memories found.
                </td>
              </tr>
            )}
            {memories.map((m) => (
              <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                <td className="py-2.5 px-3 text-white/40 text-xs font-mono max-w-[8rem] truncate">
                  {m.userId}
                </td>
                <td className="py-2.5 px-3 font-medium">{m.key}</td>
                <td className="py-2.5 px-3 max-w-xs">
                  {editingId === m.id ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(m);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="w-full bg-white/10 border border-white/20 rounded px-2 py-0.5 text-sm outline-none focus:border-white/40"
                    />
                  ) : (
                    <span
                      className="cursor-pointer text-white/70 hover:text-white transition-colors truncate block"
                      onClick={() => startEdit(m)}
                      title="Click to edit"
                    >
                      {m.value}
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-white/30 text-xs">
                  {new Date(m.updatedAt).toLocaleString()}
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-1.5">
                    {editingId === m.id && (
                      <Button variant="success" size="sm" onClick={() => saveEdit(m)}>
                        Save
                      </Button>
                    )}
                    <Button variant="danger" size="sm" onClick={() => handleDelete(m)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
