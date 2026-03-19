import type { Session, Project, Tag, SessionFilter, PaginatedSessions } from "./types";

const BASE_URL = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function fetchSessions(
  params: SessionFilter = {},
): Promise<PaginatedSessions> {
  const searchParams = new URLSearchParams();

  if (params.q !== undefined) searchParams.set("q", params.q);
  if (params.repo !== undefined) searchParams.set("repo", params.repo);
  if (params.project_path !== undefined) searchParams.set("project_path", params.project_path);
  if (params.branch !== undefined) searchParams.set("branch", params.branch);
  if (params.tag !== undefined) searchParams.set("tag", params.tag);
  if (params.pinned !== undefined) searchParams.set("pinned", params.pinned ? "1" : "0");
  if (params.archived !== undefined) searchParams.set("archived", params.archived ? "1" : "0");
  if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params.offset !== undefined) searchParams.set("offset", String(params.offset));
  if (params.sort !== undefined) searchParams.set("sort", params.sort);

  const qs = searchParams.toString();
  const url = `/api/sessions${qs ? `?${qs}` : ""}`;
  return request<PaginatedSessions>(url);
}

export async function fetchSession(id: number): Promise<Session> {
  const data = await request<{ session: Session }>(`/api/sessions/${id}`);
  return data.session;
}

export async function fetchProjects(): Promise<Project[]> {
  const data = await request<{ projects: Project[] }>("/api/projects");
  return data.projects;
}

export async function fetchProject(id: number): Promise<Project> {
  const data = await request<{ project: Project }>(`/api/projects/${id}`);
  return data.project;
}

export async function fetchTags(): Promise<Tag[]> {
  const data = await request<{ tags: Tag[] }>("/api/tags");
  return data.tags;
}

export async function fetchHealth(): Promise<{ status: string; version: string; auth_token?: string | null }> {
  return request<{ status: string; version: string; auth_token?: string | null }>("/api/health");
}

/**
 * Fetch the auth token from the server and store it in localStorage.
 * Called once on app startup.
 */
export async function initAuth(): Promise<void> {
  try {
    const health = await fetchHealth();
    if (health.auth_token) {
      setAuthToken(health.auth_token);
    }
  } catch {
    // Server not available yet — auth will fail but that's expected
  }
}

// --- Auth helpers ---

export function getAuthToken(): string | null {
  return localStorage.getItem("iris-auth-token");
}

export function setAuthToken(token: string): void {
  localStorage.setItem("iris-auth-token", token);
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// --- Mutation helpers ---

export async function updateNote(id: number, note: string): Promise<Session> {
  const data = await request<{ session: Session }>(`/api/sessions/${id}/note`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ note }),
  });
  return data.session;
}

export async function updatePin(id: number, pinned: boolean): Promise<Session> {
  const data = await request<{ session: Session }>(`/api/sessions/${id}/pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ pinned }),
  });
  return data.session;
}

export async function updateArchive(id: number, archived: boolean): Promise<Session> {
  const data = await request<{ session: Session }>(`/api/sessions/${id}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ archived }),
  });
  return data.session;
}

export async function updateTags(
  id: number,
  add?: string[],
  remove?: string[],
): Promise<Session> {
  const data = await request<{ session: Session }>(`/api/sessions/${id}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ add, remove }),
  });
  return data.session;
}

export async function resumeSession(
  id: number,
  terminal?: string,
): Promise<{ ok: boolean; terminal: string }> {
  return request<{ ok: boolean; terminal: string }>(`/api/sessions/${id}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ terminal }),
  });
}
