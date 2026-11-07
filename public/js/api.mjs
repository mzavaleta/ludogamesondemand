export async function api(state, path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Creator-Token": state.creatorToken || "",
    ...(state.adminKey ? { "X-Admin-Key": state.adminKey } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(path, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}