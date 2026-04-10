import { useState } from "react";
import { api } from "../lib/api";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { PageHeader } from "../components/PageHeader";

interface Turn {
  id: number;
  userId: string;
  platform: string;
  threadId: string | null;
  role: string;
  content: string;
  createdAt: string;
}

export function Conversations() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [userId, setUserId] = useState("");
  const [platform, setPlatform] = useState("");
  const [threadId, setThreadId] = useState("");
  const [loading, setLoading] = useState(false);

  const search = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (userId) params.userId = userId;
      if (platform) params.platform = platform;
      if (threadId) params.threadId = threadId;
      const result = await api.get<Turn[]>("/api/conversations", params);
      setTurns(result);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") search();
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Conversations" />

      <div className="flex gap-2 flex-wrap">
        <Input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          onKeyDown={handleKey}
          placeholder="User ID"
          className="w-36"
        />
        <Input
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Platform"
          className="w-28"
        />
        <Input
          value={threadId}
          onChange={(e) => setThreadId(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Thread ID"
          className="w-36"
        />
        <Button variant="default" size="md" onClick={search} disabled={loading}>
          {loading ? "…" : "Search"}
        </Button>
      </div>

      {turns.length === 0 ? (
        <p className="text-white/30 text-sm">No messages. Enter filters and press Search.</p>
      ) : (
        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
          {turns.map((turn) => {
            const isUser = turn.role === "user";
            return (
              <div
                key={turn.id}
                className={`flex gap-3 ${isUser ? "flex-row" : "flex-row-reverse"}`}
              >
                <div
                  className={`flex-1 max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                    isUser ? "bg-white/10" : "bg-blue-500/20"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-semibold ${
                        isUser ? "text-white/50" : "text-blue-300"
                      }`}
                    >
                      {turn.role}
                    </span>
                    <span className="text-white/20 text-xs">{turn.platform}</span>
                  </div>
                  <p className="text-white/80 leading-relaxed whitespace-pre-wrap break-words">
                    {turn.content}
                  </p>
                </div>
                <time className="text-white/20 text-xs self-end mb-1 shrink-0">
                  {new Date(turn.createdAt).toLocaleTimeString()}
                </time>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
