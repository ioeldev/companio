import { useRef, type FormEvent } from "react";

export function APITester() {
  const responseRef = useRef<HTMLTextAreaElement>(null);

  const send = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const endpoint = data.get("endpoint") as string;
    const method = data.get("method") as string;

    try {
      const res = await fetch(new URL(endpoint, location.href), { method });
      const json = await res.json();
      responseRef.current!.value = JSON.stringify(json, null, 2);
    } catch (err) {
      responseRef.current!.value = String(err);
    }
  };

  return (
    <section>
      <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">API Tester</h2>
      <form onSubmit={send} className="flex items-center gap-2 bg-white/5 px-3 py-2.5 rounded-lg border border-white/10 focus-within:border-white/25 transition-colors mb-3">
        <select
          name="method"
          className="bg-white/10 text-white/90 px-2 py-1 rounded text-xs font-semibold appearance-none border-none outline-none cursor-pointer shrink-0"
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
        <input
          type="text"
          name="endpoint"
          defaultValue="/api/status"
          placeholder="/api/..."
          className="flex-1 bg-transparent border-none text-white/90 text-sm font-mono outline-none placeholder:text-white/20"
        />
        <button
          type="submit"
          className="bg-white/10 hover:bg-white/20 text-white/90 border-none px-4 py-1 rounded text-sm font-semibold cursor-pointer transition-colors shrink-0"
        >
          Send
        </button>
      </form>
      <textarea
        ref={responseRef}
        readOnly
        placeholder="Response will appear here..."
        className="w-full min-h-40 bg-white/5 border border-white/10 rounded-lg p-3 text-white/60 text-sm font-mono leading-relaxed resize-y placeholder:text-white/20 outline-none"
      />
    </section>
  );
}
