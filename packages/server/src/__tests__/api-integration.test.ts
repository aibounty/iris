import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, SessionRepo } from "@iris/core";
import type { SessionUpsert } from "@iris/core";
import { createApp } from "../app.js";
import type { FastifyInstance } from "fastify";

vi.mock("@iris/core", async () => {
  const actual = await vi.importActual<typeof import("@iris/core")>("@iris/core");
  return {
    ...actual,
    TerminalManager: class MockTerminalManager {
      async resume() {
        return { terminal: "mock" };
      }
    },
  };
});

function makeUpsert(overrides: Partial<SessionUpsert> = {}): SessionUpsert {
  return {
    claude_session_id: `test-${Math.random().toString(36).slice(2)}`,
    first_prompt: "Test prompt",
    summary: "Test summary",
    custom_title: null,
    message_count: 10,
    is_sidechain: false,
    project_path: "/home/user/myproject",
    repo_name: "myproject",
    git_branch: "main",
    jsonl_path: null,
    started_at: "2025-03-15T10:00:00.000Z",
    last_seen_at: "2025-03-15T12:00:00.000Z",
    ...overrides,
  };
}

const AUTH_TOKEN = "integration-test-token";

describe("API integration", () => {
  let db: Database.Database;
  let app: FastifyInstance;
  let repo: SessionRepo;

  beforeEach(async () => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repo = new SessionRepo(db);

    // Seed with diverse data
    repo.upsert(makeUpsert({
      claude_session_id: "sess-a",
      first_prompt: "Fix authentication bug",
      summary: "Debugged JWT refresh token",
      project_path: "/home/user/web-app",
      repo_name: "web-app",
      git_branch: "main",
      message_count: 15,
    }));
    repo.upsert(makeUpsert({
      claude_session_id: "sess-b",
      first_prompt: "Add dark mode support",
      summary: "Implemented theme switching",
      project_path: "/home/user/web-app",
      repo_name: "web-app",
      git_branch: "feature/dark-mode",
      message_count: 30,
    }));
    repo.upsert(makeUpsert({
      claude_session_id: "sess-c",
      first_prompt: "Database optimization",
      summary: "Added indexes and query caching",
      project_path: "/home/user/backend-api",
      repo_name: "backend-api",
      git_branch: "main",
      message_count: 8,
    }));

    app = await createApp({ db, authToken: AUTH_TOKEN });
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it("complete flow: list → show → note → pin → tag → search", async () => {
    // List all sessions
    let res = await app.inject({ method: "GET", url: "/api/sessions" });
    expect(res.statusCode).toBe(200);
    let body = res.json();
    expect(body.sessions).toHaveLength(3);
    expect(body.total).toBe(3);

    const sessionId = body.sessions[0].id;

    // Show individual session
    res = await app.inject({ method: "GET", url: `/api/sessions/${sessionId}` });
    expect(res.statusCode).toBe(200);
    body = res.json();
    expect(body.session).toBeDefined();

    // Add note
    res = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/note`,
      headers: { authorization: `Bearer ${AUTH_TOKEN}` },
      payload: { note: "Need to revisit this" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().session.note).toBe("Need to revisit this");

    // Pin session
    res = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/pin`,
      headers: { authorization: `Bearer ${AUTH_TOKEN}` },
      payload: { pinned: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().session.pinned).toBe(1);

    // Add tags
    res = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/tags`,
      headers: { authorization: `Bearer ${AUTH_TOKEN}` },
      payload: { add: ["urgent", "review"] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().session.tags).toContain("urgent");
    expect(res.json().session.tags).toContain("review");

    // Search via FTS
    res = await app.inject({ method: "GET", url: "/api/sessions?q=authentication" });
    expect(res.statusCode).toBe(200);
    body = res.json();
    expect(body.sessions.length).toBeGreaterThanOrEqual(1);

    // Filter by pinned
    res = await app.inject({ method: "GET", url: "/api/sessions?pinned=true" });
    expect(res.statusCode).toBe(200);
    body = res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].pinned).toBe(1);
  });

  it("mutations require auth", async () => {
    const sessions = repo.list({ limit: 1 });
    const id = sessions.items[0].id;

    // No auth header
    let res = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/note`,
      payload: { note: "test" },
    });
    expect(res.statusCode).toBe(401);

    // Wrong token
    res = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/note`,
      headers: { authorization: "Bearer wrong-token" },
      payload: { note: "test" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("readonly mode blocks all mutations", async () => {
    const readonlyApp = await createApp({ db, authToken: AUTH_TOKEN, readonly: true });
    const sessions = repo.list({ limit: 1 });
    const id = sessions.items[0].id;

    const res = await readonlyApp.inject({
      method: "POST",
      url: `/api/sessions/${id}/note`,
      headers: { authorization: `Bearer ${AUTH_TOKEN}` },
      payload: { note: "test" },
    });
    expect(res.statusCode).toBe(403);

    // But reads still work
    const readRes = await readonlyApp.inject({
      method: "GET",
      url: "/api/sessions",
    });
    expect(readRes.statusCode).toBe(200);

    await readonlyApp.close();
  });

  it("pagination and filter combinations work", async () => {
    // Filter by repo
    let res = await app.inject({
      method: "GET",
      url: "/api/sessions?repo=web-app",
    });
    expect(res.statusCode).toBe(200);
    let body = res.json();
    expect(body.sessions).toHaveLength(2);

    // Filter by branch
    res = await app.inject({
      method: "GET",
      url: "/api/sessions?branch=main",
    });
    body = res.json();
    expect(body.sessions).toHaveLength(2); // web-app/main and backend-api/main

    // Pagination
    res = await app.inject({
      method: "GET",
      url: "/api/sessions?limit=1&offset=0",
    });
    body = res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.total).toBe(3);

    res = await app.inject({
      method: "GET",
      url: "/api/sessions?limit=1&offset=1",
    });
    body = res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.total).toBe(3);

    // Projects endpoint
    res = await app.inject({
      method: "GET",
      url: "/api/projects",
    });
    body = res.json();
    expect(body.projects.length).toBeGreaterThanOrEqual(2);

    // Tags endpoint (initially empty)
    res = await app.inject({
      method: "GET",
      url: "/api/tags",
    });
    body = res.json();
    expect(body.tags).toHaveLength(0);
  });

  it("returns structured error for invalid session ID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/abc",
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 404 for non-existent session", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/99999",
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBeDefined();
  });
});
