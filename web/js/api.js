// Tiny JSON API client + local profile selection (no login: a profile is just a name).

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const KEY = "skillbridge.profile";
export const session = {
  get id() {
    try { return Number(localStorage.getItem(KEY)) || null; } catch { return null; }
  },
  set id(v) {
    try { v ? localStorage.setItem(KEY, String(v)) : localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  },
  profile: null,
  catalog: null,
};

export async function loadCatalog(force = false) {
  if (!session.catalog || force) session.catalog = await api(`/api/catalog${session.id ? `?profile=${session.id}` : ""}`);
  return session.catalog;
}
export const skillName = (id) => session.catalog?.skills.find((s) => s.id === id)?.name || id;
export const domainName = (id) => session.catalog?.domains.find((d) => d.id === id)?.name || id;
