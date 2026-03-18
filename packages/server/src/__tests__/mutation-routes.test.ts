import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, SessionRepo } from "@iris/core";
import type { SessionUpsert } from "@iris/core";
import { createApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock TerminalManager for resume endpoint
vi.mock("@iris/core", async () => {
  const actual = await vi.importActual<typeof import("@iris/core")>(
    "@iris/core",
  );
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

const AUTH_TOKEN = "test-token-123";

describe("Mutation routes with auth", () => {
  let db: Database.Database;
  let app: FastifyInstance;
  let repo: SessionRepo;
  let sessionId: number;

  beforeEach(async () => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repo = new SessionRepo(db);

    const session = repo.upsert(
      makeUpsert({ claude_session_id: "test-sess" }),
    );
    sessionId = session.id;

    app = await createApp({ db, authToken: AUTH_TOKEN });
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  describe("Authentication", () => {
    it("rejects request without token", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/sessions/${sessionId}/note`,
        payload: { note: "test" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects request with wrong token", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/sessions/${sessionId}/note`,
        headers: { authorization: "Bearer wrong-token" },
        payload: { note: "test" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("accepts request with correct token", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/sessions/${sessionId}/note`,
        headers: { authorization: `Bearer ${AUTH_TOKEN}` },
        payload: { note: "test" },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("POST /api/sessions/:id/note", () => {
    it("saves note", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/sessions/${sessionId}/note`,
        headers: { authorization: `Bearer ${AUTH_TOKEN}` },
        payload: { note: "stopped at retry policy" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.session.note).toBe("stopped at retry policy");
    });

    it("returns 404 for non-existent session", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/sessions/999/note",
        headers: { authorization: `Bearer ${AUTH_TOKEN}` },
        payload: { note: "test" },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /api/sessions/:id/pin", () => {
    it("pins session", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/sessions/${sessionId}/pin`,
        headers: { authorization: `Bearer ${AUTH_TOKEN}` },
        payload: { pinned: true },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.session.pinned).toBe(1);
    });
  });

  describe("POST /api/sessions/:id/archive", () => {
    it("archives session", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/sessions/${sessionId}/archive`,
        headers: { authorization: `Bearer ${AUTH_TOKEN}` },
        payload: { archived: true },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.session.status).toBe("archived");
    });
  });

  describe("POST /api/sessions/:id/tags", () => {
    it("adds and removes tags", async () => {
      // Add tags
      let res = await app.inject({
        method: "POST",
        url: `/api/sessions/${sessionId}/tags`,
        headers: { authorization: `Bearer ${AUTH_TOKEN}` },
        payload: { add: ["backend", "bugfix"] },
      });
      expect(res.statusCode).toBe(200);
      let body = res.json();
      expect(body.session.tags).toContain("backend");
      expect(body.session.tags).toContain("bugfix");

      // Remove one
      res = await app.inject({
        method: "POST",
        url: `/api/sessions/${sessionId}/tags`,
        headers: { authorization: `Bearer ${AUTH_TOKEN}` },
        payload: { remove: ["bugfix"] },
      });
      body = res.json();
      expect(body.session.tags).toContain("backend");
      expect(body.session.tags).not.toContain("bugfix");
    });
  });

  describe("POST /api/sessions/:id/resume", () => {
    it("resumes session", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/sessions/${sessionId}/resume`,
        headers: { authorization: `Bearer ${AUTH_TOKEN}` },
        payload: { terminal: "auto" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.claude_session_id).toBe("test-sess");
      expect(body.terminal).toBe("mock");
    });
  });
});

describe("Read-only mode", () => {
  let db: Database.Database;
  let app: FastifyInstance;
  let repo: SessionRepo;
  let sessionId: number;

  beforeEach(async () => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repo = new SessionRepo(db);

    const session = repo.upsert(makeUpsert());
    sessionId = session.id;

    app = await createApp({ db, readonly: true, authToken: AUTH_TOKEN });
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it("blocks all mutations with 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/note`,
      headers: { authorization: `Bearer ${AUTH_TOKEN}` },
      payload: { note: "test" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("allows read endpoints", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/sessions",
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("No auth token (dev mode)", () => {
  let db: Database.Database;
  let app: FastifyInstance;
  let repo: SessionRepo;
  let sessionId: number;

  beforeEach(async () => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repo = new SessionRepo(db);

    const session = repo.upsert(makeUpsert());
    sessionId = session.id;

    app = await createApp({ db }); // No authToken
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it("allows mutations without auth header", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/note`,
      payload: { note: "dev mode note" },
    });
    expect(res.statusCode).toBe(200);
  });
});
