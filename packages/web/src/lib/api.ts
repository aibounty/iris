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

export async function fetchTags(): Promise<Tag[]> {
  const data = await request<{ tags: Tag[] }>("/api/tags");
  return data.tags;
}

export async function fetchHealth(): Promise<{ status: string; version: string }> {
  return request<{ status: string; version: string }>("/api/health");
}
