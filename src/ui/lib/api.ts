async function request<T>(
  path: string,
  init?: RequestInit,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(path, location.href);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url, init);
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, params?: Record<string, string>) =>
    request<T>(path, { method: "GET" }, params),

  put: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "DELETE",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body != null ? JSON.stringify(body) : undefined,
    }),
};
